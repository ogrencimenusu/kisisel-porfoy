import React, { useEffect, useMemo, useState } from 'react';
import { db } from '../firebase'
import { fetchRowsFromNamedTab, fetchPriceMapsFromGlobalSheet } from '../services/sheetService'
import { collection, onSnapshot, query, orderBy, doc } from 'firebase/firestore'
import HomePlatformCards from '../components/HomePlatformCards'
import HomeStarredPortfolios from '../components/HomeStarredPortfolios'
import HomeAllHoldings from '../components/HomeAllHoldings'

const Anasayfa = () => {
  const [banks, setBanks] = useState([])
  const [portfolios, setPortfolios] = useState([])
  const [transactionsByPortfolio, setTransactionsByPortfolio] = useState({})
  const [tlPrices, setTlPrices] = useState({ USD: '', EUR: '', GBP: '' })
  const [priceBySymbol, setPriceBySymbol] = useState(new Map())
  const [currencyBySymbol, setCurrencyBySymbol] = useState(new Map())
  const [showConvertedTlByPlatform, setShowConvertedTlByPlatform] = useState({})
  const [symbolsData, setSymbolsData] = useState([])
  const [expandedStarred, setExpandedStarred] = useState({})

  useEffect(() => {
    const unsubBanks = onSnapshot(collection(db, 'banks'), (snapshot) => {
      const data = snapshot.docs.map(d => ({ id: d.id, ...d.data() }))
      setBanks(data)
    })
    const q = query(collection(db, 'portfolios'), orderBy('createdAt', 'desc'))
    const unsubPortfolios = onSnapshot(q, (snapshot) => {
      const data = snapshot.docs.map(d => ({ id: d.id, ...d.data() }))
      setPortfolios(data)
    })
    const unsubSymbols = onSnapshot(collection(db, 'symbols'), (snap) => {
      try {
        const data = snap.docs.map(d => ({ id: d.id, ...d.data() }))
        setSymbolsData(data)
      } catch (_) { setSymbolsData([]) }
    })
    return () => {
      try { unsubBanks() } catch {}
      try { unsubPortfolios() } catch {}
      try { unsubSymbols() } catch {}
    }
  }, [])

  useEffect(() => {
    if (!portfolios || portfolios.length === 0) {
      setTransactionsByPortfolio({})
      return
    }
    const unsubs = []
    portfolios.forEach((p) => {
      try {
        const tq = query(collection(db, 'portfolios', p.id, 'transactions'), orderBy('createdAt', 'desc'))
        const unsub = onSnapshot(tq, (snap) => {
          const tx = snap.docs.map(d => ({ id: d.id, ...d.data() }))
          setTransactionsByPortfolio(prev => ({ ...prev, [p.id]: tx }))
        })
        unsubs.push(unsub)
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

  useEffect(() => {
    // Fetch TL price table (tab name: tl_price)
    const load = async () => {
      try {
        const rows = await fetchRowsFromNamedTab('tl_price')
        // Expect rows like: [ [USD, 41,6898], [EUR, 48,6068], [GBP, 56,1430] ] possibly with or without header
        const entries = rows.map(r => [(r[0] || '').toString().trim().toUpperCase(), (r[1] || '').toString().trim()])
        const map = { USD: '', EUR: '', GBP: '' }
        entries.forEach(([k, v]) => {
          if (k === 'USD' || k === 'EUR' || k === 'GBP') map[k] = v
        })
        setTlPrices(map)
      } catch (_) {
        setTlPrices({ USD: '', EUR: '', GBP: '' })
      }
    }
    load()
  }, [])

  useEffect(() => {
    const loadPrices = async () => {
      try {
        const { priceBySymbol, currencyBySymbol } = await fetchPriceMapsFromGlobalSheet()
        setPriceBySymbol(priceBySymbol)
        setCurrencyBySymbol(currencyBySymbol)
      } catch (_) {
        setPriceBySymbol(new Map())
        setCurrencyBySymbol(new Map())
      }
    }
    loadPrices()
  }, [])

  const formatNumber = (value, currency) => {
    const num = typeof value === 'number' ? value : parseNumber(value)
    const isTry = currency === 'TRY' || currency === '₺'
    const locale = 'tr-TR'
    try {
      const options = { minimumFractionDigits: 2, maximumFractionDigits: 2, useGrouping: isTry }
      return new Intl.NumberFormat(locale, options).format(isNaN(num) ? 0 : num)
    } catch (_) {
      return String(isNaN(num) ? 0 : num)
    }
  }

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
      const raw = priceBySymbol.get ? priceBySymbol.get(symbolIdUpper) : undefined
      if (raw == null || raw === '') return 0
      const symCfg = symbolsData.find(s => (s.id || '').toUpperCase() === symbolIdUpper)
      const cur = (currencyBySymbol.get ? currencyBySymbol.get(symbolIdUpper) : '') || ''
      if (symCfg && symCfg.desiredSample) {
        const t = desiredTransformString(raw, symCfg.desiredSample, cur)
        if (t != null) return parseNumber(t)
      }
      return parseNumber(raw)
    } catch (_) { return 0 }
  }

  const platformTotals = useMemo(() => {
    // Flatten all transactions
    const allTx = Object.values(transactionsByPortfolio).flat()
    const byPlatformSymbol = {}
    // Group by platform -> symbol -> list of tx
    allTx.forEach((tx) => {
      const platformId = (tx.platform || '').toString()
      if (!platformId) return
      const symbolId = (tx.sembol || '').toString()
      if (!symbolId) return
      byPlatformSymbol[platformId] = byPlatformSymbol[platformId] || {}
      byPlatformSymbol[platformId][symbolId] = byPlatformSymbol[platformId][symbolId] || []
      byPlatformSymbol[platformId][symbolId].push(tx)
    })

    const calcFifoForList = (list) => {
      // Sort by date ascending
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
        const birimFiyat = adet > 0 ? (maaliyet / adet) : 0
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

    const result = {}
    Object.keys(byPlatformSymbol).forEach((platformId) => {
      const symbols = byPlatformSymbol[platformId]
      let countOpen = 0
      const baseSums = {}
      const currentSums = {}
      const pnls = {}
      Object.keys(symbols).forEach((symbolId) => {
        const list = symbols[symbolId]
        const currency = (list[0]?.birim === 'TRY' || list[0]?.birim === '₺') ? '₺' : (list[0]?.birim || '')
        const fifo = calcFifoForList(list)
        if (fifo.remainingAdet > 0) {
          countOpen += 1
          baseSums[currency] = Number(baseSums[currency] || 0) + Number(fifo.remainingMaaliyet || 0)
          // Unrealized P/L using current sheet price
          const symKey = (symbolId || '').toString().toUpperCase()
          const currentNum = Number(getDesiredPriceNum(symKey) || 0)
          const currentValue = currentNum > 0 ? Number(fifo.remainingAdet || 0) * currentNum : 0
          currentSums[currency] = Number(currentSums[currency] || 0) + Number(currentValue || 0)
          const pnl = currentValue - Number(fifo.remainingMaaliyet || 0)
          pnls[currency] = Number(pnls[currency] || 0) + Number(pnl || 0)
        }
      })
      result[platformId] = { count: countOpen, baseSums, currentSums, pnls }
    })
    return result
  }, [transactionsByPortfolio, priceBySymbol])

  const convertPlatformToTRY = (pid) => {
    const totals = platformTotals[pid]
    if (!totals) return 0
    const sums = totals.sums || {}
    const toNum = (s) => parseNumber((s || '').toString())
    const usdRate = toNum(tlPrices.USD)
    const tlBase = sums['₺'] || 0
    const usdAmount = (sums['USD'] || 0)
    const usdPnl = (totals.pnls && totals.pnls['USD']) ? totals.pnls['USD'] : 0
    const usdCurrent = (usdAmount + usdPnl) * (usdRate || 0)
    return tlBase + usdCurrent
  }

  const getPlatformName = (platformId) => {
    const b = banks.find(bk => bk.id === platformId)
    return b ? (b.name || platformId) : platformId
  }

  const platformIds = Object.keys(platformTotals)

  const calcFifoRemaining = (list) => {
    // Sort by date ascending
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
      const birimFiyat = adet > 0 ? (maaliyet / adet) : 0
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

  const allHoldings = useMemo(() => {
    try {
      const allTx = Object.values(transactionsByPortfolio).flat()
      if (!Array.isArray(allTx) || allTx.length === 0) return []
      const grouped = allTx.reduce((acc, tx) => {
        const symbolId = (tx.sembol || '').toString()
        if (!symbolId) return acc
        acc[symbolId] = acc[symbolId] || []
        acc[symbolId].push(tx)
        return acc
      }, {})
      const entries = Object.keys(grouped).map(symId => {
        const list = grouped[symId]
        const fifo = calcFifoRemaining(list)
        const cur = (list[0]?.birim === 'TRY' || list[0]?.birim === '₺') ? '₺' : (list[0]?.birim || '')
        const unit = (symId || '').toString().toUpperCase()
        const currentNum = Number(getDesiredPriceNum(unit) || 0)
        const currentValue = currentNum > 0 ? Number(fifo.remainingAdet || 0) * currentNum : 0
        return { symId, list, fifo, cur, currentNum, currentValue }
      }).filter(e => (e.fifo.remainingAdet || 0) > 0)
      // sort by symbol name asc
      return entries.sort((a, b) => (a.symId || '').localeCompare(b.symId || ''))
    } catch (_) { return [] }
  }, [transactionsByPortfolio, priceBySymbol])

  return (
    <div className="container-fluid py-4">
      {/*   TL fiyatları 
      <div className="d-flex justify-content-between align-items-center mb-4">
        <div className="d-flex align-items-center gap-3 text-nowrap">
          {tlPrices.USD && (
            <span className="badge bg-light text-dark border"><i className="bi bi-currency-dollar me-1"></i>{tlPrices.USD}</span>
          )}
          {tlPrices.EUR && (
            <span className="badge bg-light text-dark border"><i className="bi bi-currency-euro me-1"></i>{tlPrices.EUR}</span>
          )}
          {tlPrices.GBP && (
            <span className="badge bg-light text-dark border"><i className="bi bi-currency-pound me-1"></i>{tlPrices.GBP}</span>
          )}
        </div>
      </div>
      */}  
      <div className="anasayfa-giris">

      </div>
      <HomePlatformCards
        banks={banks}
        platformTotals={platformTotals}
        showConvertedTlByPlatform={showConvertedTlByPlatform}
        setShowConvertedTlByPlatform={setShowConvertedTlByPlatform}
        formatNumber={formatNumber}
        convertPlatformToTRY={convertPlatformToTRY}
      />
      <HomeStarredPortfolios
        portfolios={portfolios}
        transactionsByPortfolio={transactionsByPortfolio}
        symbolsData={symbolsData}
        expandedStarred={expandedStarred}
        setExpandedStarred={setExpandedStarred}
        getDesiredPriceNum={getDesiredPriceNum}
        formatNumber={formatNumber}
      />
      
      <HomeAllHoldings
        allHoldings={allHoldings}
        symbolsData={symbolsData}
        formatNumber={formatNumber}
      />

    </div>
  );
};

export default Anasayfa;
