import React, { useEffect, useMemo, useRef, useState } from 'react';
import { db } from '../firebase'
import { collection, onSnapshot, orderBy, query } from 'firebase/firestore'
import { fetchPriceMapsFromGlobalSheet, fetchRowsFromNamedTab } from '../services/sheetService'

// Basit, bağımsız SVG donut chart
const DonutChart = ({ data, size = 260, thickness = 34, totals = { tryTotal: 0, usdTotal: 0 } }) => {
  const total = data.reduce((s, d) => s + (d.chartValue ?? d.value), 0)
  const radius = (size - thickness) / 2
  const center = size / 2
  let cumulative = 0
  const mkArc = (value) => {
    const start = (cumulative / total) * 2 * Math.PI
    const end = ((cumulative + value) / total) * 2 * Math.PI
    cumulative += value
    const largeArc = end - start > Math.PI ? 1 : 0
    const x0 = center + radius * Math.cos(start)
    const y0 = center + radius * Math.sin(start)
    const x1 = center + radius * Math.cos(end)
    const y1 = center + radius * Math.sin(end)
    return { d: `M ${x0} ${y0} A ${radius} ${radius} 0 ${largeArc} 1 ${x1} ${y1}` }
  }
  const colors = [
    '#4e79a7','#f28e2c','#e15759','#76b7b2','#59a14f','#edc949','#af7aa1','#ff9da7','#9c755f','#bab0ab'
  ]
  const containerRef = useRef(null)
  const [tooltip, setTooltip] = useState({ visible: false, x: 0, y: 0, content: null })
  const [activeIdx, setActiveIdx] = useState(null)

  if (total <= 0) {
    return (
      <div className="text-body-secondary">Görüntülenecek veri yok</div>
    )
  }
  const fmt = (num, cur) => {
    const locale = 'tr-TR'
    try {
      return new Intl.NumberFormat(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2, useGrouping: true }).format(Number(num) || 0)
    } catch (_) { return String(Number(num) || 0) }
  }

  return (
    <div ref={containerRef} className="position-relative d-flex flex-column align-items-center">
      <svg width={size} height={size} role="img" aria-label="Sembol Borsa dağılımı">
        <circle cx={center} cy={center} r={radius} fill="none" stroke="#e9ecef" strokeWidth={thickness} />
        <g>
          {data.map((d, i) => {
            const arc = mkArc(d.chartValue ?? d.value)
            return (
              <path key={d.label}
                d={arc.d}
                fill="none"
                stroke={colors[i % colors.length]}
                strokeWidth={thickness}
                strokeLinecap="butt"
                opacity={activeIdx === null || activeIdx === i ? 1 : 0.35}
                onMouseEnter={(e) => {
                  setActiveIdx(i)
                  setTooltip({
                    visible: true,
                    x: e.clientX,
                    y: e.clientY,
                    content: (
                      <div>
                        <div className="fw-semibold">{d.label}</div>
                        <div>Mevcut Değer: {fmt(d.value, d.currency)} {d.currency === '₺' ? '₺' : (d.currency || '')}</div>
                        <div>Toplam Alım: {fmt(d.cost || 0, d.currency)} {d.currency === '₺' ? '₺' : (d.currency || '')}</div>
                        <div>Kar/Kazanç: {fmt((d.value - (d.cost || 0)), d.currency)} {d.currency === '₺' ? '₺' : (d.currency || '')}</div>
                      </div>
                    )
                  })
                }}
                onMouseMove={(e) => {
                  setTooltip(prev => ({ ...prev, x: e.clientX, y: e.clientY }))
                }}
                onMouseLeave={() => {
                  setActiveIdx(null)
                  setTooltip(prev => ({ ...prev, visible: false }))
                }}
                onClick={(e) => {
                  setActiveIdx(i)
                  setTooltip({
                    visible: true,
                    x: e.clientX,
                    y: e.clientY,
                    content: (
                      <div>
                        <div className="fw-semibold">{d.label}</div>
                        <div>Mevcut Değer: {fmt(d.value, d.currency)} {d.currency === '₺' ? '₺' : (d.currency || '')}</div>
                        <div>Toplam Alım: {fmt(d.cost || 0, d.currency)} {d.currency === '₺' ? '₺' : (d.currency || '')}</div>
                        <div>Kar/Kazanç: {fmt((d.value - (d.cost || 0)), d.currency)} {d.currency === '₺' ? '₺' : (d.currency || '')}</div>
                      </div>
                    )
                  })
                }}
              />
            )
          })}
        </g>
        {/* Center totals: TRY and USD */}
        <text x={center} y={center - 8} textAnchor="middle" dominantBaseline="central" style={{ fontSize: '0.8rem' }}>
          {fmt(totals.tryTotal, '₺')} ₺
        </text>
        <text x={center} y={center + 12} textAnchor="middle" dominantBaseline="central" style={{ fontSize: '0.75rem' }}>
          {fmt(totals.usdTotal, 'USD')} USD
        </text>
        {typeof totals.combinedTry !== 'undefined' && totals.combinedTry !== null && (
          <text x={center} y={center + 32} textAnchor="middle" dominantBaseline="central" style={{ fontSize: '0.8rem' }}>
            {fmt(totals.combinedTry, '₺')} ₺
          </text>
        )}
      </svg>
      {tooltip.visible && (
        <div
          className="card shadow-sm p-2"
          style={{ position: 'fixed', left: tooltip.x + 12, top: tooltip.y + 12, zIndex: 2000, pointerEvents: 'none' }}
        >
          <div className="small">
            {tooltip.content}
          </div>
        </div>
      )}
      <div className="mt-3" style={{ maxWidth: size }}>
        {data.map((d, i) => (
          <div key={d.label} className="d-flex align-items-center justify-content-between small mb-1">
            <div className="d-flex align-items-center gap-2">
              <span style={{ width: 12, height: 12, background: colors[i % colors.length], display: 'inline-block', borderRadius: 3 }}></span>
              <span className="fw-semibold">{d.label}</span>
            </div>
            <span className="text-body-secondary">{fmt(d.value, d.currency)} {d.currency === '₺' ? '₺' : (d.currency || '')}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

const Analtik = () => {
  const [portfolios, setPortfolios] = useState([])
  const [transactionsByPortfolio, setTransactionsByPortfolio] = useState({})
  const [priceMap, setPriceMap] = useState(new Map())
  const [currencyMap, setCurrencyMap] = useState(new Map())
  const [fxMap, setFxMap] = useState({ usdTry: 0 })
  const [usdTryTlPrice, setUsdTryTlPrice] = useState(0)
  const [banks, setBanks] = useState([])
  const [symbolsData, setSymbolsData] = useState([])

  useEffect(() => {
    const q = query(collection(db, 'portfolios'), orderBy('createdAt', 'desc'))
    const unsub = onSnapshot(q, (snap) => {
      const data = snap.docs.map(d => ({ id: d.id, ...d.data() }))
      setPortfolios(data)
    })
    const unsubSymbols = onSnapshot(collection(db, 'symbols'), (snap) => {
      try {
        const data = snap.docs.map(d => ({ id: d.id, ...d.data() }))
        setSymbolsData(data)
      } catch (_) { setSymbolsData([]) }
    })
    return () => { try { unsub() } catch {}; try { unsubSymbols() } catch {} }
  }, [])

  // Banka listesi (platform adlarını çözümlemek için)
  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'banks'), (snapshot) => {
      const data = snapshot.docs.map(d => ({ id: d.id, ...d.data() }))
      setBanks(data)
    })
    return () => { try { unsub() } catch {} }
  }, [])

  const desiredTransformString = (rawValue, desiredSample, cur) => {
    if (!desiredSample) return null
    const desired = (desiredSample || '').toString()
    const desiredDigits = (desired.match(/\d/g) || []).length
    if (desiredDigits <= 0) return null
    const sepChar = ','
    const firstDot = desired.indexOf('.')
    const firstComma = desired.indexOf(',')
    const idxSep = (firstDot >= 0 || firstComma >= 0) ? (firstDot >= 0 ? firstDot : firstComma) : -1
    const digitsBeforeSep = idxSep >= 0 ? (desired.slice(0, idxSep).match(/\d/g) || []).length : desiredDigits
    const rawDigitsOnly = (String(rawValue).match(/\d/g) || []).join('')
    if (!rawDigitsOnly) return null
    let take = rawDigitsOnly
    if (take.length > desiredDigits) take = take.slice(0, desiredDigits)
    if (take.length < desiredDigits) take = take.padEnd(desiredDigits, '0')
    const intPart = take.slice(0, Math.max(0, Math.min(digitsBeforeSep, take.length)))
    const fracPart = take.slice(Math.max(0, Math.min(digitsBeforeSep, take.length)))
    const formatted = fracPart.length > 0 ? `${intPart}${sepChar}${fracPart}` : intPart
    const c = (cur || '').toUpperCase()
    if (c === 'TRY' || c === '₺') return `${formatted}₺`
    if (c === 'USD') return `${formatted}$`
    if (c === 'EUR') return `${formatted}€`
    return formatted
  }

  const getDesiredPriceNum = (symbolIdUpper) => {
    try {
      const raw = priceMap.get ? priceMap.get(symbolIdUpper) : undefined
      if (raw == null || raw === '') return 0
      const symCfg = symbolsData.find(s => (s.id || '').toUpperCase() === symbolIdUpper)
      const cur = (currencyMap.get ? currencyMap.get(symbolIdUpper) : '') || ''
      if (symCfg && symCfg.desiredSample) {
        const t = desiredTransformString(raw, symCfg.desiredSample, cur)
        if (t != null) return parseNumber(t)
      }
      return parseNumber(raw)
    } catch (_) { return 0 }
  }

  useEffect(() => {
    if (!portfolios || portfolios.length === 0) {
      setTransactionsByPortfolio({})
      return
    }
    const unsubs = []
    portfolios.forEach((p) => {
      try {
        const tq = query(collection(db, 'portfolios', p.id, 'transactions'), orderBy('createdAt', 'desc'))
        const u = onSnapshot(tq, (snap) => {
          const tx = snap.docs.map(d => ({ id: d.id, ...d.data() }))
          setTransactionsByPortfolio(prev => ({ ...prev, [p.id]: tx }))
        })
        unsubs.push(u)
      } catch (_) {}
    })
    return () => { unsubs.forEach(u => { try { u() } catch {} }) }
  }, [portfolios])

  const parseNumber = (val) => {
    if (typeof val === 'number') return isNaN(val) ? 0 : val
    if (!val) return 0
    const normalized = String(val)
      .replace(/\s/g, '')
      .replace(/\./g, '')
      .replace(/,/g, '.')
      .replace(/[^0-9.-]/g, '')
    const num = parseFloat(normalized)
    return isNaN(num) ? 0 : num
  }

  const refreshPrices = async () => {
    try {
      const { priceBySymbol, currencyBySymbol } = await fetchPriceMapsFromGlobalSheet()
      setPriceMap(priceBySymbol)
      setCurrencyMap(currencyBySymbol)
      // USD/TRY kuru aynı sheet'te sembol anahtarı olarak olabilir; yaygın anahtarları deneyelim
      const tryKeys = ['USDTRY', 'USD/TRY', 'USD-TRY', 'USD TL', 'USD TL KURU', 'USDTTRY', 'DOLAR']
      const invKeys = ['TRYUSD', 'TRY/USD', 'TRY-USD', 'TLUSD', 'TL/USD', 'TL-USD']
      let usdTry = 0
      for (const kRaw of tryKeys) {
        const k = (kRaw || '').toUpperCase()
        const v = priceBySymbol.get?.(k)
        const num = parseNumber(v)
        if (num > 0) { usdTry = num; break }
      }
      if (usdTry <= 0) {
        for (const kRaw of invKeys) {
          const k = (kRaw || '').toUpperCase()
          const v = priceBySymbol.get?.(k)
          const num = parseNumber(v)
          if (num > 0) { usdTry = 1 / num; break }
        }
      }
      setFxMap({ usdTry })
    } catch (_) {
      setPriceMap(new Map())
      setCurrencyMap(new Map())
      setFxMap({ usdTry: 0 })
    }
  }

  useEffect(() => { refreshPrices() }, [])

  useEffect(() => {
    // Fallback USD/TRY from tl_price sheet
    const load = async () => {
      try {
        const rows = await fetchRowsFromNamedTab('tl_price')
        const entries = rows.map(r => [(r[0] || '').toString().trim().toUpperCase(), (r[1] || '').toString().trim()])
        const usdEntry = entries.find(([k]) => k === 'USD')
        if (usdEntry) {
          const val = usdEntry[1]
          const num = parseNumber(val)
          setUsdTryTlPrice(num > 0 ? num : 0)
        } else {
          setUsdTryTlPrice(0)
        }
      } catch (_) {
        setUsdTryTlPrice(0)
      }
    }
    load()
  }, [])

  // Her sembol için kalan adet hesabı (FIFO) ve ilgili sembolBorsa'yı kullanır
  const donutData = useMemo(() => {
    const hiddenPortfolioIds = new Set((portfolios || []).filter(p => !!p.hideFromHomeAndAnalytics).map(p => p.id))
    const allTx = Object.entries(transactionsByPortfolio)
      .filter(([pid]) => !hiddenPortfolioIds.has(pid))
      .map(([, list]) => list)
      .flat()
    if (allTx.length === 0) return []
    // Sembole göre grupla, sonra her sembol için kalan adet bul
    const bySymbol = allTx.reduce((acc, tx) => {
      const key = tx.sembol || '—'
      acc[key] = acc[key] || []
      acc[key].push(tx)
      return acc
    }, {})
    const marketAgg = {}
    Object.keys(bySymbol).forEach((symbolKey) => {
      const txs = bySymbol[symbolKey]
      const sorted = [...txs].sort((a, b) => {
        const da = a.tarih instanceof Date ? a.tarih : (a.tarih?.toDate?.() || new Date(0))
        const db = b.tarih instanceof Date ? b.tarih : (b.tarih?.toDate?.() || new Date(0))
        return da - db
      })
      let remainingAdet = 0
      let remainingCost = 0
      const buys = []
      sorted.forEach((tx) => {
        const adet = Number(parseNumber(tx.adet) || 0)
        const maaliyet = Number(parseNumber(tx.maaliyet) || 0)
        const birimFiyat = adet > 0 ? (maaliyet / (adet || 1)) : 0
        if (tx.durum === 'Alış') {
          buys.push({ adet, birimFiyat })
          remainingAdet += adet
          remainingCost += maaliyet
        } else if (tx.durum === 'Satış') {
          let sellQty = adet
          while (sellQty > 0 && buys.length > 0) {
            const lot = buys[0]
            const useQty = Math.min(sellQty, lot.adet)
            remainingCost -= useQty * lot.birimFiyat
            lot.adet -= useQty
            sellQty -= useQty
            if (lot.adet <= 0) buys.shift()
          }
          remainingAdet -= adet
        }
      })
      const market = (txs[0]?.sembolBorsa || 'Diğer').toString()
      if (remainingAdet > 0) {
        const symbolIdUpper = (symbolKey || '').toString().toUpperCase()
        const priceRaw = priceMap.get ? priceMap.get(symbolIdUpper) : undefined
        const curRaw = currencyMap.get ? currencyMap.get(symbolIdUpper) : undefined
        const currency = (curRaw === 'TRY' || curRaw === '₺') ? '₺' : (curRaw || '')
        const priceNum = Number(getDesiredPriceNum(symbolIdUpper) || 0)
        const currentValue = priceNum > 0 ? priceNum * Number(remainingAdet || 0) : 0
        const key = `${market}__${currency || 'N/A'}`
        const bucket = marketAgg[key] || { label: market, currency: currency || '', value: 0, cost: 0 }
        bucket.value = Number(bucket.value || 0) + Number(currentValue || 0)
        bucket.cost = Number(bucket.cost || 0) + Number(remainingCost || 0)
        marketAgg[key] = bucket
      }
    })
    const entries = Object.values(marketAgg)
      .filter((agg) => (agg?.value || 0) > 0)
      .map((agg) => {
        const currency = agg.currency || ''
        const usdRate = Number(usdTryTlPrice || 0) > 0 ? Number(usdTryTlPrice) : Number(fxMap.usdTry || 0)
        const chartValue = (currency === 'USD' || currency === 'USDT') && usdRate > 0 ? agg.value * usdRate : agg.value
        return { label: `${agg.label}${currency ? ` (${currency})` : ''}`, value: agg.value, chartValue, cost: agg.cost, currency }
      })
      .sort((a, b) => b.value - a.value)
    return entries
  }, [transactionsByPortfolio, priceMap, currencyMap, fxMap, portfolios])

  const totals = useMemo(() => {
    const tryTotal = donutData.filter(d => d.currency === '₺' || d.currency === 'TRY').reduce((s, d) => s + d.value, 0)
    const usdLike = new Set(['USD', 'USDT'])
    const usdTotal = donutData.filter(d => usdLike.has((d.currency || '').toUpperCase())).reduce((s, d) => s + d.value, 0)
    let usdTry = Number(fxMap.usdTry || 0)
    if (!(usdTry > 0)) {
      usdTry = Number(usdTryTlPrice || 0)
    }
    const combinedTry = tryTotal + (usdTry > 0 ? usdTotal * usdTry : 0)
    return { tryTotal, usdTotal, combinedTry }
  }, [donutData, fxMap, usdTryTlPrice])

  // Platform bazlı dağılım (platform + para birimi), USD'ler TL'ye çevrilerek renklendirilir
  const platformDonutData = useMemo(() => {
    const hiddenPortfolioIds = new Set((portfolios || []).filter(p => !!p.hideFromHomeAndAnalytics).map(p => p.id))
    const allTx = Object.entries(transactionsByPortfolio)
      .filter(([pid]) => !hiddenPortfolioIds.has(pid))
      .map(([, list]) => list)
      .flat()
    if (allTx.length === 0) return []

    // platform -> symbol -> tx list grouping
    const byPlatformSymbol = allTx.reduce((acc, tx) => {
      const platformId = (tx.platform || '—').toString()
      const symbolKey = tx.sembol || '—'
      acc[platformId] = acc[platformId] || {}
      const inner = acc[platformId]
      inner[symbolKey] = inner[symbolKey] || []
      inner[symbolKey].push(tx)
      return acc
    }, {})

    const bankNameById = (id) => {
      const b = banks.find(x => x.id === id)
      return b ? (b.name || id) : id
    }

    const platformAgg = {}
    Object.keys(byPlatformSymbol).forEach((platformId) => {
      const bySymbol = byPlatformSymbol[platformId]
      Object.keys(bySymbol).forEach((symbolKey) => {
        const txs = bySymbol[symbolKey]
        const sorted = [...txs].sort((a, b) => {
          const da = a.tarih instanceof Date ? a.tarih : (a.tarih?.toDate?.() || new Date(0))
          const db = b.tarih instanceof Date ? b.tarih : (b.tarih?.toDate?.() || new Date(0))
          return da - db
        })
        let remainingAdet = 0
        let remainingCost = 0
        const buys = []
        sorted.forEach((tx) => {
          const adet = parseNumber(tx.adet)
          const maaliyet = parseNumber(tx.maaliyet)
          const birimFiyat = adet > 0 ? (maaliyet / (adet || 1)) : 0
          if (tx.durum === 'Alış') {
            buys.push({ adet, birimFiyat })
            remainingAdet += adet
            remainingCost += maaliyet
          } else if (tx.durum === 'Satış') {
            let sellQty = adet
            while (sellQty > 0 && buys.length > 0) {
              const lot = buys[0]
              const useQty = Math.min(sellQty, lot.adet)
              remainingCost -= useQty * lot.birimFiyat
              lot.adet -= useQty
              sellQty -= useQty
              if (lot.adet <= 0) buys.shift()
            }
            remainingAdet -= adet
          }
        })
        if (remainingAdet > 0) {
          const symbolIdUpper = (symbolKey || '').toString().toUpperCase()
          const priceRaw = priceMap.get ? priceMap.get(symbolIdUpper) : undefined
          const curRaw = currencyMap.get ? currencyMap.get(symbolIdUpper) : undefined
          const currency = (curRaw === 'TRY' || curRaw === '₺') ? '₺' : (curRaw || '')
        const priceNum = Number(getDesiredPriceNum(symbolIdUpper) || 0)
        const currentValue = priceNum > 0 ? priceNum * Number(remainingAdet || 0) : 0
          const labelBase = bankNameById(platformId)
          const key = `${labelBase}__${currency || 'N/A'}`
        const bucket = platformAgg[key] || { label: labelBase, currency: currency || '', value: 0, cost: 0 }
        bucket.value = Number(bucket.value || 0) + Number(currentValue || 0)
        bucket.cost = Number(bucket.cost || 0) + Number(remainingCost || 0)
          platformAgg[key] = bucket
        }
      })
    })

    const entries = Object.values(platformAgg)
      .filter((agg) => (agg?.value || 0) > 0)
      .map((agg) => {
        const currency = agg.currency || ''
        const usdRate = Number(usdTryTlPrice || 0) > 0 ? Number(usdTryTlPrice) : Number(fxMap.usdTry || 0)
        const chartValue = (currency === 'USD' || currency === 'USDT') && usdRate > 0 ? agg.value * usdRate : agg.value
        return { label: `${agg.label}${currency ? ` (${currency})` : ''}`, value: agg.value, chartValue, cost: agg.cost, currency }
      })
      .sort((a, b) => b.chartValue - a.chartValue)
    return entries
  }, [transactionsByPortfolio, banks, priceMap, currencyMap, fxMap, usdTryTlPrice, portfolios])

  const platformTotals = useMemo(() => {
    const tryTotal = platformDonutData.filter(d => d.currency === '₺' || d.currency === 'TRY').reduce((s, d) => s + d.value, 0)
    const usdLike = new Set(['USD', 'USDT'])
    const usdTotal = platformDonutData.filter(d => usdLike.has((d.currency || '').toUpperCase())).reduce((s, d) => s + d.value, 0)
    let usdTry = Number(fxMap.usdTry || 0)
    if (!(usdTry > 0)) {
      usdTry = Number(usdTryTlPrice || 0)
    }
    const combinedTry = tryTotal + (usdTry > 0 ? usdTotal * usdTry : 0)
    return { tryTotal, usdTotal, combinedTry }
  }, [platformDonutData, fxMap, usdTryTlPrice])

  // Symbol-level donut: each symbol as a slice (currency-aware values)
  const symbolDonutData = useMemo(() => {
    const hiddenPortfolioIds = new Set((portfolios || []).filter(p => !!p.hideFromHomeAndAnalytics).map(p => p.id))
    const allTx = Object.entries(transactionsByPortfolio)
      .filter(([pid]) => !hiddenPortfolioIds.has(pid))
      .map(([, list]) => list)
      .flat()
    if (allTx.length === 0) return []
    const bySymbol = allTx.reduce((acc, tx) => {
      const key = tx.sembol || '—'
      acc[key] = acc[key] || []
      acc[key].push(tx)
      return acc
    }, {})
    const entries = []
    Object.keys(bySymbol).forEach((symbolKey) => {
      const txs = bySymbol[symbolKey]
      const sorted = [...txs].sort((a, b) => {
        const da = a.tarih instanceof Date ? a.tarih : (a.tarih?.toDate?.() || new Date(0))
        const db = b.tarih instanceof Date ? b.tarih : (b.tarih?.toDate?.() || new Date(0))
        return da - db
      })
      let remainingAdet = 0
      let remainingCost = 0
      const buys = []
      sorted.forEach((tx) => {
        const adet = Number(parseNumber(tx.adet) || 0)
        const maaliyet = Number(parseNumber(tx.maaliyet) || 0)
        const birimFiyat = adet > 0 ? (maaliyet / (adet || 1)) : 0
        if (tx.durum === 'Alış') {
          buys.push({ adet, birimFiyat })
          remainingAdet += adet
          remainingCost += maaliyet
        } else if (tx.durum === 'Satış') {
          let sellQty = adet
          while (sellQty > 0 && buys.length > 0) {
            const lot = buys[0]
            const useQty = Math.min(sellQty, lot.adet)
            remainingCost -= useQty * lot.birimFiyat
            lot.adet -= useQty
            sellQty -= useQty
            if (lot.adet <= 0) buys.shift()
          }
          remainingAdet -= adet
        }
      })
      if (remainingAdet > 0) {
        const symbolIdUpper = (symbolKey || '').toString().toUpperCase()
        const curRaw = currencyMap.get ? currencyMap.get(symbolIdUpper) : undefined
        const currency = (curRaw === 'TRY' || curRaw === '₺') ? '₺' : (curRaw || '')
        const priceNum = Number(getDesiredPriceNum(symbolIdUpper) || 0)
        const currentValue = priceNum > 0 ? priceNum * Number(remainingAdet || 0) : 0
        const symCfg = symbolsData.find(s => (s.id || '').toUpperCase() === symbolIdUpper)
        const label = symCfg ? (symCfg.name || symCfg.id) : symbolKey
        const usdRate = Number(usdTryTlPrice || 0) > 0 ? Number(usdTryTlPrice) : Number(fxMap.usdTry || 0)
        const chartValue = (currency === 'USD' || currency === 'USDT') && usdRate > 0 ? currentValue * usdRate : currentValue
        entries.push({ label: `${label}${currency ? ` (${currency})` : ''}`, value: currentValue, chartValue, cost: remainingCost, currency })
      }
    })
    return entries.sort((a, b) => b.chartValue - a.chartValue)
  }, [transactionsByPortfolio, portfolios, currencyMap, fxMap, usdTryTlPrice, symbolsData])

  const symbolTotals = useMemo(() => {
    const tryTotal = symbolDonutData.filter(d => d.currency === '₺' || d.currency === 'TRY').reduce((s, d) => s + d.value, 0)
    const usdLike = new Set(['USD', 'USDT'])
    const usdTotal = symbolDonutData.filter(d => usdLike.has((d.currency || '').toUpperCase())).reduce((s, d) => s + d.value, 0)
    let usdTry = Number(fxMap.usdTry || 0)
    if (!(usdTry > 0)) usdTry = Number(usdTryTlPrice || 0)
    const combinedTry = tryTotal + (usdTry > 0 ? usdTotal * usdTry : 0)
    return { tryTotal, usdTotal, combinedTry }
  }, [symbolDonutData, fxMap, usdTryTlPrice])

  return (
    <div className="container-fluid py-4">
      <div className="d-flex align-items-center justify-content-between mb-4">
        <h4 className="display-6 mb-0">
          <i className="bi bi-pie-chart me-2"></i>Analtik
        </h4>
        <button className="btn btn-outline-secondary" onClick={refreshPrices}>
          <i className="bi bi-arrow-clockwise me-2"></i>Fiyatları yenile
        </button>
      </div>
      <div className="card shadow-sm border-0">
        <div className="card-body">
          <div className="d-flex align-items-center justify-content-between mb-3">
            <div className="d-flex align-items-center gap-2">
              <i className="bi bi-graph-up"></i>
              <span className="fw-semibold">Sembol Borsa dağılımı (mevcut toplam değer)</span>
            </div>
          </div>
          <DonutChart data={donutData} totals={totals} />
        </div>
      </div>

      <div className="card shadow-sm border-0 mt-4">
        <div className="card-body">
          <div className="d-flex align-items-center justify-content-between mb-3">
            <div className="d-flex align-items-center gap-2">
              <i className="bi bi-bank2"></i>
              <span className="fw-semibold">Platform para birimi dağılımı</span>
            </div>
          </div>
          <DonutChart data={platformDonutData} totals={platformTotals} />
        </div>
      </div>

      <div className="card shadow-sm border-0 mt-4">
        <div className="card-body">
          <div className="d-flex align-items-center justify-content-between mb-3">
            <div className="d-flex align-items-center gap-2">
              <i className="bi bi-tags"></i>
              <span className="fw-semibold">Hisse dağılımı</span>
            </div>
          </div>
          <DonutChart data={symbolDonutData} totals={symbolTotals} />
        </div>
      </div>
    </div>
  );
};

export default Analtik;

