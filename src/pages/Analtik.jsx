import React, { useEffect, useMemo, useRef, useState } from 'react';
import { db } from '../firebase'
import { collection, onSnapshot, orderBy, query } from 'firebase/firestore'
import { fetchPriceMapsFromGlobalSheet, fetchRowsFromNamedTab } from '../services/sheetService'

// Basit, bağımsız SVG donut chart
const DonutChart = ({ data, size = 260, thickness = 34, totals = { tryTotal: 0, usdTotal: 0 }, usdTryTlPrice = 0, fxMap = { usdTry: 0 }, labelMode = 'text' }) => {
  const total = data.reduce((s, d) => s + (d.chartValue ?? d.value), 0)
  const radius = (size - thickness) / 2
  const center = size / 2
  let cumulative = 0
  const mkArc = (value) => {
    const start = (cumulative / total) * 2 * Math.PI
    const end = ((cumulative + value) / total) * 2 * Math.PI
    const mid = (start + end) / 2
    cumulative += value
    const largeArc = end - start > Math.PI ? 1 : 0
    const x0 = center + radius * Math.cos(start)
    const y0 = center + radius * Math.sin(start)
    const x1 = center + radius * Math.cos(end)
    const y1 = center + radius * Math.sin(end)
    return { d: `M ${x0} ${y0} A ${radius} ${radius} 0 ${largeArc} 1 ${x1} ${y1}`, start, end, mid }
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

  // USD değerlerini TL'ye çeviren helper fonksiyon
  const convertToTry = (value, currency) => {
    if (currency === '₺' || currency === 'TRY') return value
    const usdRate = Number(usdTryTlPrice || 0) > 0 ? Number(usdTryTlPrice) : Number(fxMap.usdTry || 0)
    return (currency === 'USD' || currency === 'USDT') && usdRate > 0 ? value * usdRate : value
  }

  return (
    <div ref={containerRef} className="position-relative d-flex align-items-center gap-4">
      <div className="d-flex flex-column align-items-center">
        <svg width={size} height={size} role="img" aria-label="Sembol Borsa dağılımı">
          <circle cx={center} cy={center} r={radius} fill="none" stroke="#e9ecef" strokeWidth={thickness} />
          <g>
            {data.map((d, i) => {
              const sliceValue = d.chartValue ?? d.value
              const arc = mkArc(sliceValue)
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
                          <div className="fw-semibold">
                            {d.label}
                            {(() => {
                              const v = (d.chartValue ?? d.value) || 0
                              const pct = total > 0 ? (v / total) * 100 : 0
                              return <span className="ms-1 text-body-secondary">({pct.toFixed(1)}%)</span>
                            })()}
                          </div>
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
                          <div className="fw-semibold">
                            {d.label}
                            {(() => {
                              const v = (d.chartValue ?? d.value) || 0
                              const pct = total > 0 ? (v / total) * 100 : 0
                              return <span className="ms-1 text-body-secondary">({pct.toFixed(1)}%)</span>
                            })()}
                          </div>
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
          {/* Inline labels on slices */}
          <g style={{ pointerEvents: 'none' }}>
            {(() => {
              // Re-run label placement with a separate cumulative so arc geometry matches
              let cum = 0
              return data.map((d, i) => {
                const value = d.chartValue ?? d.value
                const start = (cum / total) * 2 * Math.PI
                const end = ((cum + value) / total) * 2 * Math.PI
                const mid = (start + end) / 2
                cum += value
                const pct = total > 0 ? (value / total) * 100 : 0
                const tooSmall = !(pct >= 6)
                const rForText = radius // place text along the ring center
                const tx = center + rForText * Math.cos(mid)
                const ty = center + rForText * Math.sin(mid)
                // For symbol/platform modes, prefer icon if available; market keeps text
                if (labelMode !== 'market' && d.iconUrl) {
                  const iconSize = 18
                  return (
                    <image
                      key={`lbl-${i}`}
                      href={d.iconUrl}
                      x={tx - iconSize / 2}
                      y={ty - iconSize / 2}
                      width={iconSize}
                      height={iconSize}
                      preserveAspectRatio="xMidYMid meet"
                      className="donut-slice-icon"
                    />
                  )
                }
                // For text labels (e.g. market), skip very small slices
                if (tooSmall) return null
                return (
                  <text key={`lbl-${i}`} x={tx} y={ty} textAnchor="middle" dominantBaseline="middle" className="donut-slice-label" style={{ fontSize: '0.7rem', fill: 'var(--bs-body-color, #212529)' }}>
                    {d.label}
                  </text>
                )
              })
            })()}
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
      </div>
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
      <div className="flex-grow-1">
        {data.map((d, i) => (
          <div key={d.label} className="d-flex align-items-center justify-content-between small mb-2">
            <div className="d-flex align-items-center gap-2">
              <span style={{ width: 12, height: 12, background: colors[i % colors.length], display: 'inline-block', borderRadius: 3 }}></span>
              <span className="fw-semibold">
                {d.label}
                {(() => {
                  const v = (d.chartValue ?? d.value) || 0
                  const pct = total > 0 ? (v / total) * 100 : 0
                  return <span className="ms-1 text-body-secondary">({pct.toFixed(1)}%)</span>
                })()}
              </span>
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
  const [percentageMap, setPercentageMap] = useState(new Map())
  const [fxMap, setFxMap] = useState({ usdTry: 0 })
  const [usdTryTlPrice, setUsdTryTlPrice] = useState(0)
  const [banks, setBanks] = useState([])
  const [symbolsData, setSymbolsData] = useState([])
  const [expandedChartsByPortfolio, setExpandedChartsByPortfolio] = useState({})

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

  const formatNumber = (value, currency) => {
    const num = typeof value === 'number' ? value : parseNumber(value)
    const locale = 'tr-TR'
    try {
      const hasCurrency = !!currency
      const options = hasCurrency
        ? { minimumFractionDigits: 2, maximumFractionDigits: 2, useGrouping: true }
        : { maximumFractionDigits: 6, useGrouping: true }
      return new Intl.NumberFormat(locale, options).format(isNaN(num) ? 0 : num)
    } catch (_) {
      return String(isNaN(num) ? 0 : num)
    }
  }

  const refreshPrices = async () => {
    try {
      const { priceBySymbol, currencyBySymbol, percentageBySymbol } = await fetchPriceMapsFromGlobalSheet()
      setPriceMap(priceBySymbol)
      setCurrencyMap(currencyBySymbol)
      setPercentageMap(percentageBySymbol)
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
      setPercentageMap(new Map())
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

  // Yardımcılar: tarih parse, tekilleştirme
  const getTxDate = (t) => {
    try {
      if (t.tarih instanceof Date) return t.tarih
      if (t.tarih?.toDate) return t.tarih.toDate()
      const s = (t.tarih || '').toString().trim()
      const m = s.match(/^([0-3]?\d)\.([01]?\d)\.(\d{4})$/)
      if (m) {
        const dd = parseInt(m[1], 10)
        const mm = parseInt(m[2], 10) - 1
        const yyyy = parseInt(m[3], 10)
        return new Date(yyyy, mm, dd)
      }
      const d = new Date(s)
      if (!isNaN(d.getTime())) return d
    } catch (_) {}
    return new Date(0)
  }
  const approxEq = (a, b) => {
    const na = Number(String(a || '').toString().replace(/,/g, '.'))
    const nb = Number(String(b || '').toString().replace(/,/g, '.'))
    if (isNaN(na) || isNaN(nb)) return String(a) === String(b)
    return Math.abs(na - nb) < 1e-9
  }
  const normalizeDateString = (t) => {
    const d = getTxDate({ tarih: t })
    return d && d.toISOString ? d.toISOString().slice(0,10) : String(t || '')
  }
  const dedupeTransactions = (arr) => {
    const out = []
    for (const tx of arr) {
      const exists = out.find(o => (
        (o.durum || '') === (tx.durum || '') &&
        (o.birim || '') === (tx.birim || '') &&
        normalizeDateString(o.tarih) === normalizeDateString(tx.tarih) &&
        approxEq(o.adet, tx.adet) &&
        approxEq(o.fiyat, tx.fiyat) &&
        approxEq(o.maaliyet, tx.maaliyet)
      ))
      if (!exists) out.push(tx)
    }
    return out
  }

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
      const txs = dedupeTransactions(bySymbol[symbolKey])
      const sorted = [...txs].sort((a, b) => getTxDate(a) - getTxDate(b))
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
      // Tolerans: çok küçük kalıntıları 0 say
      if (Math.abs(remainingAdet) < 1e-6) { remainingAdet = 0; remainingCost = 0 }
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
        const txs = dedupeTransactions(bySymbol[symbolKey])
        const sorted = [...txs].sort((a, b) => getTxDate(a) - getTxDate(b))
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
        // Tolerans: çok küçük kalıntıları 0 say
        if (Math.abs(remainingAdet) < 1e-6) { remainingAdet = 0; remainingCost = 0 }
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
      const txs = dedupeTransactions(bySymbol[symbolKey])
      const sorted = [...txs].sort((a, b) => getTxDate(a) - getTxDate(b))
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
      // Tolerans: çok küçük kalıntıları 0 say
      if (Math.abs(remainingAdet) < 1e-6) { remainingAdet = 0; remainingCost = 0 }
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
      {(() => {
        const starred = (portfolios || []).filter(p => !!p.starred)
        if (!starred || starred.length === 0) return null
        const calcFifoRemaining = (list) => {
          const sorted = [...list].sort((a, b) => {
            const da = a.tarih instanceof Date ? a.tarih : (a.tarih?.toDate?.() || new Date(0))
            const db = b.tarih instanceof Date ? b.tarih : (b.tarih?.toDate?.() || new Date(0))
            return da - db
          })
          let remainingAdet = 0
          let remainingMaaliyet = 0
          const buys = []
          sorted.forEach(tx => {
            const adet = Number(parseNumber(tx.adet) || 0)
            const maaliyet = Number(parseNumber(tx.maaliyet) || 0)
            const birimFiyat = adet > 0 ? (maaliyet / (adet || 1)) : 0
            if ((tx.durum || '') === 'Alış') {
              buys.push({ adet, birimFiyat })
              remainingAdet += adet
              remainingMaaliyet += maaliyet
            } else if ((tx.durum || '') === 'Satış') {
              let sellLeft = adet
              let sellCost = 0
              while (sellLeft > 0 && buys.length > 0) {
                const b = buys[0]
                const use = Math.min(sellLeft, b.adet)
                sellCost += use * b.birimFiyat
                b.adet -= use
                sellLeft -= use
                if (b.adet <= 0) buys.shift()
              }
              remainingAdet -= adet
              remainingMaaliyet -= sellCost
            }
          })
          return { remainingAdet: Number(remainingAdet || 0), remainingMaaliyet: Number(remainingMaaliyet || 0) }
        }

        // Helper to compute charts for a single portfolio
        const buildChartsForPortfolio = (portfolioId) => {
          const txs = transactionsByPortfolio[portfolioId] || []
          // Yeni eklenen yıldızlı portföy chart'larında, hideFromHomeAndAnalytics işaretli olsa da gösterim yapılır
          const effectiveTx = txs
          // Market chart (sembol borsa)
          const bySymbol = effectiveTx.reduce((acc, tx) => {
            const key = tx.sembol || '—'
            acc[key] = acc[key] || []
            acc[key].push(tx)
            return acc
          }, {})
          const marketAgg = {}
          Object.keys(bySymbol).forEach((symbolKey) => {
            const list = bySymbol[symbolKey]
            const sorted = [...list].sort((a, b) => getTxDate(a) - getTxDate(b))
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
            if (Math.abs(remainingAdet) < 1e-6) { remainingAdet = 0; remainingCost = 0 }
            if (remainingAdet > 0) {
              const symbolIdUpper = (symbolKey || '').toString().toUpperCase()
              const curRaw = currencyMap.get ? currencyMap.get(symbolIdUpper) : undefined
              const currency = (curRaw === 'TRY' || curRaw === '₺') ? '₺' : (curRaw || '')
              const priceNum = Number(getDesiredPriceNum(symbolIdUpper) || 0)
              const currentValue = priceNum > 0 ? priceNum * Number(remainingAdet || 0) : 0
              const market = (list[0]?.sembolBorsa || 'Diğer').toString()
              const key = `${market}__${currency || 'N/A'}`
              const bucket = marketAgg[key] || { label: market, currency: currency || '', value: 0, cost: 0 }
              bucket.value = Number(bucket.value || 0) + Number(currentValue || 0)
              bucket.cost = Number(bucket.cost || 0) + Number(remainingCost || 0)
              marketAgg[key] = bucket
            }
          })
          const marketEntries = Object.values(marketAgg).filter(agg => (agg.value || 0) > 0).map(agg => {
            const currency = agg.currency || ''
            const usdRate = Number(usdTryTlPrice || 0) > 0 ? Number(usdTryTlPrice) : Number(fxMap.usdTry || 0)
            const chartValue = (currency === 'USD' || currency === 'USDT') && usdRate > 0 ? agg.value * usdRate : agg.value
            return { label: `${agg.label}${currency ? ` (${currency})` : ''}`, value: agg.value, chartValue, cost: agg.cost, currency }
          }).sort((a, b) => b.value - a.value)
          const marketTotals = (() => {
            const tryTotal = marketEntries.filter(d => d.currency === '₺' || d.currency === 'TRY').reduce((s, d) => s + d.value, 0)
            const usdLike = new Set(['USD', 'USDT'])
            const usdTotal = marketEntries.filter(d => usdLike.has((d.currency || '').toUpperCase())).reduce((s, d) => s + d.value, 0)
            let usdTry = Number(fxMap.usdTry || 0)
            if (!(usdTry > 0)) usdTry = Number(usdTryTlPrice || 0)
            const combinedTry = tryTotal + (usdTry > 0 ? usdTotal * usdTry : 0)
            return { tryTotal, usdTotal, combinedTry }
          })()

          // Platform currency distribution
          const byPlatformSymbol = effectiveTx.reduce((acc, tx) => {
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
              const list = bySymbol[symbolKey]
              const sorted = [...list].sort((a, b) => getTxDate(a) - getTxDate(b))
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
              if (Math.abs(remainingAdet) < 1e-6) { remainingAdet = 0; remainingCost = 0 }
              if (remainingAdet > 0) {
                const symbolIdUpper = (symbolKey || '').toString().toUpperCase()
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
          const platformEntries = Object.values(platformAgg).filter(agg => (agg.value || 0) > 0).map(agg => {
            const currency = agg.currency || ''
            const usdRate = Number(usdTryTlPrice || 0) > 0 ? Number(usdTryTlPrice) : Number(fxMap.usdTry || 0)
            const chartValue = (currency === 'USD' || currency === 'USDT') && usdRate > 0 ? agg.value * usdRate : agg.value
            const bank = banks.find(b => (b.name || b.id) === agg.label || b.id === agg.label)
            const iconUrl = bank?.imageUrl
            return { label: `${agg.label}${currency ? ` (${currency})` : ''}`, value: agg.value, chartValue, cost: agg.cost, currency, iconUrl }
          }).sort((a, b) => b.chartValue - a.chartValue)
          const platformTotals = (() => {
            const tryTotal = platformEntries.filter(d => d.currency === '₺' || d.currency === 'TRY').reduce((s, d) => s + d.value, 0)
            const usdLike = new Set(['USD', 'USDT'])
            const usdTotal = platformEntries.filter(d => usdLike.has((d.currency || '').toUpperCase())).reduce((s, d) => s + d.value, 0)
            let usdTry = Number(fxMap.usdTry || 0)
            if (!(usdTry > 0)) usdTry = Number(usdTryTlPrice || 0)
            const combinedTry = tryTotal + (usdTry > 0 ? usdTotal * usdTry : 0)
            return { tryTotal, usdTotal, combinedTry }
          })()

        // Symbol distribution for portfolio
          const symbolEntries = (() => {
            const grouped = effectiveTx.reduce((acc, tx) => {
              const key = tx.sembol || '—'
              acc[key] = acc[key] || []
              acc[key].push(tx)
              return acc
            }, {})
            const entries = []
            Object.keys(grouped).forEach((symbolKey) => {
              const list = grouped[symbolKey]
              const sorted = [...list].sort((a, b) => getTxDate(a) - getTxDate(b))
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
              if (Math.abs(remainingAdet) < 1e-6) { remainingAdet = 0; remainingCost = 0 }
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
                const iconUrl = symbolsData.find(s => (s.id || '').toUpperCase() === symbolIdUpper)?.logoUrl
                entries.push({ label: `${label}${currency ? ` (${currency})` : ''}`, value: currentValue, chartValue, cost: remainingCost, currency, iconUrl })
              }
            })
            return entries.sort((a, b) => b.chartValue - a.chartValue)
          })()
          const symbolTotals = (() => {
            const tryTotal = symbolEntries.filter(d => d.currency === '₺' || d.currency === 'TRY').reduce((s, d) => s + d.value, 0)
            const usdLike = new Set(['USD', 'USDT'])
            const usdTotal = symbolEntries.filter(d => usdLike.has((d.currency || '').toUpperCase())).reduce((s, d) => s + d.value, 0)
            let usdTry = Number(fxMap.usdTry || 0)
            if (!(usdTry > 0)) usdTry = Number(usdTryTlPrice || 0)
            const combinedTry = tryTotal + (usdTry > 0 ? usdTotal * usdTry : 0)
            return { tryTotal, usdTotal, combinedTry }
          })()

          return {
            marketEntries, marketTotals,
            platformEntries, platformTotals,
            symbolEntries, symbolTotals,
          }
        }

        // Header row (horizontal like home)
        return (
          <>
            <div className="anasayfa-portfoy mb-3">
              {starred.map((p) => {
                const txs = (transactionsByPortfolio[p.id] || [])
                const grouped = txs.reduce((acc, tx) => {
                  const key = (tx.sembol || '').toString()
                  if (!key) return acc
                  acc[key] = acc[key] || []
                  acc[key].push(tx)
                  return acc
                }, {})
                const entries = Object.keys(grouped).map(symId => {
                  const list = grouped[symId]
                  const fifo = calcFifoRemaining(list)
                  return { symId, list, fifo }
                }).filter(e => (e.fifo.remainingAdet || 0) > 0)
                const openCount = entries.length
                const totalsByCur = (() => {
                  const base = {}
                  const current = {}
                  entries.forEach(({ symId, list, fifo }) => {
                    const cur = (list[0]?.birim === 'TRY' || list[0]?.birim === '₺') ? '₺' : (list[0]?.birim || '')
                    const symKey = (symId || '').toString().toUpperCase()
                    const curNum = Number(getDesiredPriceNum(symKey) || 0)
                    const currentVal = curNum > 0 ? Number(fifo.remainingAdet || 0) * curNum : 0
                    base[cur] = Number(base[cur] || 0) + Number(fifo.remainingMaaliyet || 0)
                    current[cur] = Number(current[cur] || 0) + Number(currentVal || 0)
                  })
                  return { base, current }
                })()
                const isOpen = !!expandedChartsByPortfolio[p.id]
                return (
                  <div key={p.id} className="portfoy-wrap" role="button" onClick={() => setExpandedChartsByPortfolio(prev => ({ ...prev, [p.id]: !prev[p.id] }))}>
                    <div className="name"> {p.name || 'Adsız portföy'}</div>
                    <div className="hisse-sayisi"> Hisse sayısı: {openCount}</div>
                    <div className="price">
                      {(() => {
                        const curKeys = Array.from(new Set([
                          ...Object.keys(totalsByCur.base || {}),
                          ...Object.keys(totalsByCur.current || {})
                        ]))
                        const rows = curKeys.map(cur => {
                          const baseVal = totalsByCur.base[cur] || 0
                          const curVal = totalsByCur.current[cur] || 0
                          const gain = curVal - baseVal
                          const pct = baseVal > 0 ? (gain / baseVal) * 100 : 0
                          const cls = gain > 0 ? 'text-success' : (gain < 0 ? 'text-danger' : 'text-body-secondary')
                          return (
                            <div className="price-currency" key={cur}>
                              <div className="alis">{formatNumber(baseVal, cur)} {cur}</div>
                              <div className="guncel">{formatNumber(curVal, cur)} {cur}</div>
                              <div className={`price-kazanc small ${cls}`}>
                                {formatNumber(Math.abs(gain), cur)} {cur} ({gain >= 0 ? '+' : ''}{Number(pct).toFixed(2)}%)
                              </div>
                            </div>
                          )
                        })
                        try {
                          const tryCur = (totalsByCur.current['₺'] || totalsByCur.current['TRY'] || 0)
                          const usdCur = (totalsByCur.current['USD'] || 0)
                          const usdRate = Number(usdTryTlPrice || 0) > 0 ? Number(usdTryTlPrice) : Number(fxMap.usdTry || 0)
                          const combinedTry = Number(tryCur || 0) + (usdRate > 0 ? Number(usdCur || 0) * Number(usdRate) : 0)
                          rows.push(
                            <div key="combined-try" className="mt-1">
                              Toplam (₺): {formatNumber(combinedTry, '₺')} ₺
                            </div>
                          )
                        } catch (_) {}
                        return rows
                      })()}
                    </div>
                    <div className="mt-1 small text-body-secondary d-flex align-items-center gap-1">
                      <i className={`bi ${isOpen ? 'bi-eye-slash' : 'bi-eye'}`}></i>
                      {isOpen ? 'Grafikleri gizle' : 'Grafikleri göster'}
                    </div>
                  </div>
                )
              })}
            </div>
            {starred.map((p) => {
              const isOpen = !!expandedChartsByPortfolio[p.id]
              if (!isOpen) return null
              const { marketEntries, marketTotals, platformEntries, platformTotals, symbolEntries, symbolTotals } = buildChartsForPortfolio(p.id)
              return (
                <div key={`charts-${p.id}`} className="mb-4">
                  <div className="card shadow-sm border-0">
                    <div className="card-body">
                      <div className="d-flex align-items-center justify-content-between mb-3">
                        <div className="d-flex align-items-center gap-2">
                          <i className="bi bi-pie-chart"></i>
                          <span className="fw-semibold">{p.name || 'Portföy'} - Sembol Borsa dağılımı</span>
                        </div>
                      </div>
                      <DonutChart data={marketEntries} totals={marketTotals} usdTryTlPrice={usdTryTlPrice} fxMap={fxMap} labelMode="market" />
                    </div>
                  </div>
                  <div className="card shadow-sm border-0 mt-3">
                    <div className="card-body">
                      <div className="d-flex align-items-center justify-content-between mb-3">
                        <div className="d-flex align-items-center gap-2">
                          <i className="bi bi-bank2"></i>
                          <span className="fw-semibold">{p.name || 'Portföy'} - Platform para birimi dağılımı</span>
                        </div>
                      </div>
                      <DonutChart data={platformEntries} totals={platformTotals} usdTryTlPrice={usdTryTlPrice} fxMap={fxMap} labelMode="platform" />
                    </div>
                  </div>
                  <div className="card shadow-sm border-0 mt-3">
                    <div className="card-body">
                      <div className="d-flex align-items-center justify-content-between mb-3">
                        <div className="d-flex align-items-center gap-2">
                          <i className="bi bi-tags"></i>
                          <span className="fw-semibold">{p.name || 'Portföy'} - Hisse dağılımı</span>
                        </div>
                      </div>
                      <DonutChart data={symbolEntries} totals={symbolTotals} usdTryTlPrice={usdTryTlPrice} fxMap={fxMap} labelMode="symbol" />
                    </div>
                  </div>
                </div>
              )
            })}
          </>
        )
      })()}
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
          <DonutChart data={donutData} totals={totals} usdTryTlPrice={usdTryTlPrice} fxMap={fxMap} />
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
                      <DonutChart data={platformDonutData.map(d => {
                        const bank = banks.find(b => (b.name && d.label?.startsWith(b.name)) || d.label?.startsWith(b.id))
                        return { ...d, iconUrl: bank?.imageUrl }
                      })} totals={platformTotals} usdTryTlPrice={usdTryTlPrice} fxMap={fxMap} labelMode="platform" />
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
                      <DonutChart data={symbolDonutData.map(d => {
                        // d.label like "BTC (USD)", try to map symbol by name or id in symbolsData
                        const nameToken = (d.label || '').split(' (')[0]
                        const sym = symbolsData.find(s => (s.name || s.id) === nameToken)
                        return { ...d, iconUrl: sym?.logoUrl }
                      })} totals={symbolTotals} usdTryTlPrice={usdTryTlPrice} fxMap={fxMap} labelMode="symbol" />
        </div>
      </div>
    </div>
  );
};

export default Analtik;

