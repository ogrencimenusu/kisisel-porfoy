import React, { useEffect, useMemo, useState } from 'react';
import { db } from '../firebase'
import { fetchRowsFromNamedTab, fetchPriceMapsFromGlobalSheet } from '../services/sheetService'
import { collection, onSnapshot, query, orderBy, doc } from 'firebase/firestore'

const Anasayfa = () => {
  const [banks, setBanks] = useState([])
  const [portfolios, setPortfolios] = useState([])
  const [transactionsByPortfolio, setTransactionsByPortfolio] = useState({})
  const [tlPrices, setTlPrices] = useState({ USD: '', EUR: '', GBP: '' })
  const [priceBySymbol, setPriceBySymbol] = useState(new Map())
  const [currencyBySymbol, setCurrencyBySymbol] = useState(new Map())
  const [showConvertedTlByPlatform, setShowConvertedTlByPlatform] = useState({})

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
    return () => {
      try { unsubBanks() } catch {}
      try { unsubPortfolios() } catch {}
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
    const locale = isTry ? 'tr-TR' : 'en-US'
    try {
      const options = { minimumFractionDigits: 2, maximumFractionDigits: 2 }
      return new Intl.NumberFormat(locale, options).format(isNaN(num) ? 0 : num)
    } catch (_) {
      return String(isNaN(num) ? 0 : num)
    }
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
        const adet = parseNumber(tx.adet) || 0
        const maaliyet = parseNumber(tx.maaliyet) || 0
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
      return { remainingAdet, remainingMaaliyet }
    }

    const result = {}
    Object.keys(byPlatformSymbol).forEach((platformId) => {
      const symbols = byPlatformSymbol[platformId]
      let countOpen = 0
      const sums = {}
      const pnls = {}
      Object.keys(symbols).forEach((symbolId) => {
        const list = symbols[symbolId]
        const currency = (list[0]?.birim === 'TRY' || list[0]?.birim === '₺') ? '₺' : (list[0]?.birim || '')
        const fifo = calcFifoForList(list)
        if (fifo.remainingAdet > 0) {
          countOpen += 1
          sums[currency] = (sums[currency] || 0) + fifo.remainingMaaliyet
          // Unrealized P/L using current sheet price
          const symKey = (symbolId || '').toString().toUpperCase()
          const currentRaw = priceBySymbol.get(symKey)
          const currentNum = parseNumber(currentRaw)
          const currentValue = currentNum > 0 ? fifo.remainingAdet * currentNum : 0
          const pnl = currentValue > 0 ? (currentValue - fifo.remainingMaaliyet) : 0
          pnls[currency] = (pnls[currency] || 0) + pnl
        }
      })
      result[platformId] = { count: countOpen, sums, pnls }
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

  return (
    <div className="container-fluid py-4">
      <div className="d-flex justify-content-between align-items-center mb-4">
        <div className="d-flex align-items-center">
          <h4 className="display-6 mb-0">
            <i className="bi bi-house me-3"></i>Anasayfa
          </h4>
        </div>
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

      <div className="d-flex flex-column gap-2">
        {platformIds.length === 0 && (
          <div className="text-center text-body-secondary py-4">Henüz işlem yok.</div>
        )}
        {platformIds.map((pid) => {
          const totals = platformTotals[pid]
          const currencyKeys = Object.keys(totals.sums)
          return (
            <div key={pid} className="card shadow-sm border-0">
              <div className="card-body d-flex align-items-center justify-content-between">
                <div className="d-flex align-items-center gap-3">
                  <div className="rounded-3 d-flex align-items-center justify-content-center" style={{ width: '40px', height: '40px', background: 'var(--bs-tertiary-bg)' }}>
                    {(() => {
                      const b = banks.find(bk => bk.id === pid)
                      const url = b?.imageUrl
                      if (url) {
                        return (
                          <img src={url} alt="Banka" style={{ width: '36px', height: '36px', objectFit: 'contain' }} />
                        )
                      }
                      return <i className="bi bi-building" style={{ fontSize: '1.2rem' }}></i>
                    })()}
                  </div>
                </div>
                <div className="text-end">
                  <div className="text-body-secondary small mb-1">{totals.count} açık sembol</div>
                  {currencyKeys.map((cur) => (
                    <div key={cur} className="fw-semibold">
                      {cur === 'USD' ? (
                        <>
                          {formatNumber(totals.sums[cur], cur)} <i className="bi bi-currency-dollar ms-1"></i>
                        </>
                      ) : (
                        <>
                          {cur === '₺' ? <i className="bi bi-currency-lira me-1"></i> : (cur === 'EUR' ? <i className="bi bi-currency-euro me-1"></i> : <i className="bi bi-currency-dollar me-1"></i>)}
                          {formatNumber(totals.sums[cur], cur)} {cur}
                        </>
                      )}
                      {(() => {
                        const pnl = (totals.pnls && typeof totals.pnls[cur] !== 'undefined') ? totals.pnls[cur] : 0
                        if (!pnl) return null
                        const cls = pnl > 0 ? 'text-success' : 'text-danger'
                        return (
                          <div className={`small ${cls}`}>Kar/Zarar: {formatNumber(Math.abs(pnl), cur)} {cur}</div>
                        )
                      })()}
                    </div>
                  ))}
                  <div className="mt-2">
                    <button
                      className="btn btn-sm btn-outline-secondary"
                      onClick={() => setShowConvertedTlByPlatform(prev => ({ ...prev, [pid]: !prev[pid] }))}
                    >
                      {showConvertedTlByPlatform[pid] ? 'TL toplamını gizle' : 'TL toplamını göster'}
                    </button>
                    {showConvertedTlByPlatform[pid] && (
                      <div className="fw-semibold mt-2">
                        <i className="bi bi-currency-lira me-1"></i>
                        {formatNumber(convertPlatformToTRY(pid), '₺')} ₺
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  );
};

export default Anasayfa;
