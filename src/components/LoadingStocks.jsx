import React, { useEffect, useMemo, useRef, useState } from 'react'
import { fetchRowsFromNamedTab, buildSymbolMaps } from '../services/sheetService'
import { refreshPricesFromSheetAndStore } from '../services/priceUpdateService'

const clamp = (val, min, max) => Math.max(min, Math.min(max, val))

const LoadingStocks = ({ onComplete }) => {
  const [symbols, setSymbols] = useState([])
  const [currentIndex, setCurrentIndex] = useState(-1)
  const timerRef = useRef(null)
  const [pricesBySymbol, setPricesBySymbol] = useState({})

  useEffect(() => {
    let cancelled = false
    const run = async () => {
      const rows = await fetchRowsFromNamedTab('sembol_fiyat')
      const dataRows = rows.length > 0 ? rows.slice(1) : rows
      const syms = dataRows
        .map(r => (r && r[0] ? r[0].toString().trim().toUpperCase() : ''))
        .filter(Boolean)
      if (cancelled) return
      setSymbols(syms)

      // Build price map for quick inline display next to each symbol
      try {
        const { priceBySymbol } = buildSymbolMaps(dataRows)
        const obj = {}
        syms.forEach(s => {
          const v = priceBySymbol.get ? priceBySymbol.get(s) : undefined
          if (typeof v !== 'undefined') obj[s] = v
        })
        setPricesBySymbol(obj)
      } catch (_) {
        setPricesBySymbol({})
      }

      // Trigger a background refresh: Sheet -> DB
      try { await refreshPricesFromSheetAndStore() } catch (_) {}

      if (syms.length === 0) {
        // No symbols, finish quickly
        setTimeout(() => { if (!cancelled) onComplete?.() }, 500)
        return
      }

      // Animate through symbols to simulate progressive fetch/parse
      let idx = -1
      timerRef.current = setInterval(() => {
        idx += 1
        setCurrentIndex(idx)
        if (idx >= syms.length - 1) {
          clearInterval(timerRef.current)
          timerRef.current = null
          // Hold briefly to allow final animation to show
          setTimeout(() => { if (!cancelled) onComplete?.() }, 600)
        }
      }, 120)
    }
    run()
    return () => {
      cancelled = true
      if (timerRef.current) clearInterval(timerRef.current)
    }
  }, [onComplete])

  const handleClose = () => {
    if (timerRef.current) clearInterval(timerRef.current)
    onComplete?.()
  }

  const visibleWindow = useMemo(() => {
    // Show last 5 prominently; older ones fade
    const end = clamp(currentIndex, -1, symbols.length - 1)
    const start = clamp(end - 4, 0, symbols.length)
    return symbols.slice(0, end + 1).map((s, i) => ({
      name: s,
      state: i < end ? 'done' : 'current'
    })).slice(start)
  }, [symbols, currentIndex])

  const pendingCount = symbols.length > currentIndex + 1 ? symbols.length - (currentIndex + 1) : 0

  return (
    <div className="loading-stocks-overlay">
      <div className="loading-stocks-card">
        <div className="loading-stocks-header">
          <div className="spinner-dot" />
          <span className="loading-title">Sheet verileri yükleniyor…</span>
          <button type="button" className="loading-close-btn" aria-label="Kapat" onClick={handleClose}>
            ✕
          </button>
        </div>
        <div className="loading-stocks-list">
          {visibleWindow.map((item, idx) => (
            <div
              key={`${item.name}-${idx}`}
              className={
                'loading-stock-item ' +
                (item.state === 'done' ? 'is-done' : 'is-current') +
                (idx === 0 && visibleWindow.length === 5 ? ' is-faded' : '')
              }
            >
              <span className={item.state === 'current' ? 'stock-name-emph' : 'stock-name'}>
                {item.name}
              </span>
              {pricesBySymbol[item.name] && (
                <small className="ms-2 text-body-secondary">{pricesBySymbol[item.name]}</small>
              )}
            </div>
          ))}
          {pendingCount > 0 && (
            <div className="loading-stocks-pending">
              <div className="pending-dot" />
              <span className="pending-text">{pendingCount} hisse bekliyor…</span>
            </div>
          )}
        </div>
        <div className="loading-progress-bar">
          <div
            className="loading-progress-fill"
            style={{ width: symbols.length ? `${clamp(((currentIndex + 1) / symbols.length) * 100, 0, 100)}%` : '0%' }}
          />
        </div>
      </div>
    </div>
  )
}

export default LoadingStocks


