import React, { useState, useEffect } from 'react'
import { fetchPriceMapsFromGlobalSheet } from '../services/sheetService'
import { parseNumberSafe } from '../utils/numberUtils'
import { db } from '../firebase'
import { collection, onSnapshot, addDoc, serverTimestamp, getDocs, deleteDoc, doc, setDoc } from 'firebase/firestore'

const Semboller = ({ onBack }) => {
  const [symbols, setSymbols] = useState([])
  const [showAddSymbol, setShowAddSymbol] = useState(false)
  const [showConfigSymbol, setShowConfigSymbol] = useState(null)
  const [newSymbol, setNewSymbol] = useState('')
  const [prices, setPrices] = useState({})
  const [loadingPrices, setLoadingPrices] = useState({})
  const [currencies, setCurrencies] = useState({})
  const [sheetTestResult, setSheetTestResult] = useState('')
  const [sheetTesting, setSheetTesting] = useState(false)
  const [symbolConfig, setSymbolConfig] = useState({
    apiType: 'sheet',
    symbol: '',
    binanceSymbol: '',
    sheetUrl: '',
    sheetCell: '',
    sheetRegex: '',
    desiredSample: '',
    logoUrl: null
  })

  useEffect(() => {
    // Listen to symbols collection
    const unsubscribe = onSnapshot(collection(db, 'symbols'), (snapshot) => {
      const data = snapshot.docs.map(d => ({ id: d.id, ...d.data() }))
      setSymbols(data.sort((a, b) => a.id.localeCompare(b.id)))
    })
    return () => {
      try { unsubscribe() } catch {}
    }
  }, [])

  const handleAddSymbol = async () => {
    const symbol = newSymbol.trim().toUpperCase()
    if (!symbol) return
    
    // Check if symbol already exists
    if (symbols.some(s => s.id === symbol)) {
      try { window.alert('Bu sembol zaten mevcut.') } catch {}
      return
    }
    
    try {
      // ID olarak sembol adını kullan, name alanını da aynı değerle doldur
      await setDoc(doc(db, 'symbols', symbol), {
        name: symbol,
        createdAt: serverTimestamp()
      })
      setNewSymbol('')
      setShowAddSymbol(false)
      try { window.alert('Sembol eklendi.') } catch {}
    } catch (e) {
      try { window.alert('Sembol eklenirken bir hata oluştu.') } catch {}
    }
  }

  const handleDeleteSymbol = async (symbolId) => {
    const ok = window.confirm(`${symbolId} sembolünü silmek istediğinize emin misiniz?`)
    if (!ok) return
    
    try {
      await deleteDoc(doc(db, 'symbols', symbolId))
      try { window.alert('Sembol silindi.') } catch {}
    } catch (e) {
      try { window.alert('Sembol silinirken bir hata oluştu.') } catch {}
    }
  }

  const handleConfigSymbol = (symbol) => {
    setSymbolConfig({
      apiType: symbol.apiType || 'sheet',
      symbol: symbol.id,
      binanceSymbol: symbol.binanceSymbol || '',
      sheetUrl: symbol.sheetUrl || '',
      sheetCell: symbol.sheetCell || '',
      sheetRegex: symbol.sheetRegex || '',
      desiredSample: symbol.desiredSample || '',
      logoUrl: symbol.logoUrl || null
    })
    setShowConfigSymbol(symbol)
  }

  const handleSaveConfig = async () => {
    if (!showConfigSymbol) return
    
    try {
      // Mevcut sembolü güncelle, yeni döküman oluşturma
      await setDoc(doc(db, 'symbols', showConfigSymbol.id), {
        name: showConfigSymbol.id,
        desiredSample: (symbolConfig.desiredSample || '').toString(),
        logoUrl: symbolConfig.logoUrl || null,
        updatedAt: serverTimestamp(),
        createdAt: showConfigSymbol.createdAt || serverTimestamp()
      })
      
      setShowConfigSymbol(null)
      setSymbolConfig({
        apiType: 'sheet',
        symbol: '',
        binanceSymbol: '',
        sheetUrl: '',
        sheetCell: '',
        sheetRegex: '',
        desiredSample: '',
        logoUrl: null
      })
      
      try { window.alert('Sembol yapılandırması kaydedildi.') } catch {}
    } catch (e) {
      try { window.alert('Yapılandırma kaydedilirken bir hata oluştu.') } catch {}
    }
  }

  const handleLogoSelect = (e) => {
    const file = e.target.files && e.target.files[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = (ev) => {
      setSymbolConfig(prev => ({ ...prev, logoUrl: ev.target.result }))
    }
    reader.readAsDataURL(file)
  }

  const getApiTypeLabel = (apiType) => {
    switch (apiType) {
      case 'sheet': return 'Google Sheet'
      case 'binance': return 'Binance API'
      default: return 'Bilinmiyor'
    }
  }

  const getApiDescription = (apiType) => {
    switch (apiType) {
      case 'sheet': return 'Google Sheet: CSV/TSV export üzerinden çekim'
      case 'binance': return 'Binance API: DOGETRY'
      default: return ''
    }
  }

  // Fiyat çekme fonksiyonları
  const fetchBinancePrice = async (symbol) => {
    try {
      const response = await fetch(`https://www.binance.com/api/v3/ticker/price?symbol=${symbol}`)
      const data = await response.json()
      return parseFloat(data.price).toFixed(2)
    } catch (error) {
      console.error('Binance API error:', error)
      return 'Hata'
    }
  }

  const fetchInvestingPrice = async (url, xpath, selector, regexPattern, contextSymbol) => {
    try {
      if (!url) return 'URL yok'
      console.log('[Investing] Fetch start', { url, xpath, selector, regexPattern, contextSymbol })
      const proxyUrl = `https://api.allorigins.win/get?url=${encodeURIComponent(url)}`
      const response = await fetch(proxyUrl)
      console.log('[Investing] Proxy response', { status: response.status, ok: response.ok })
      const data = await response.json()
      console.log('[Investing] Contents length', { length: (data && data.contents ? data.contents.length : 0) })
      const parser = new DOMParser()
      const doc = parser.parseFromString(data.contents, 'text/html')
      let extractedText = ''
      // Try XPath first if provided
      if (xpath) {
        const result = doc.evaluate(xpath, doc, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null)
        const node = result.singleNodeValue
        if (node && node.textContent) {
          extractedText = node.textContent.trim()
        } else {
          const title = doc.querySelector('title')?.textContent || ''
          console.log('[Investing] Node not found for XPath', { xpath, titleSample: title })
        }
      }
      // Try CSS selector if XPath failed
      if (!extractedText && selector) {
        try {
          const el = doc.querySelector(selector)
          if (el && el.textContent) {
            extractedText = el.textContent.trim()
            console.log('[Investing] CSS selector hit', selector)
          } else {
            console.log('[Investing] CSS selector miss', selector)
          }
        } catch (e) {
          console.log('[Investing] CSS selector error', e)
        }
      }
      // If still nothing, try attribute-based regex on original HTML (borsa.doviz data-socket-key)
      if (!extractedText && contextSymbol) {
        try {
          const esc = contextSymbol.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
          const socketRegex = new RegExp(`<[^>]*data-socket-key\\s*=\\s*\"${esc}\"[^>]*data-socket-attr\\s*=\\s*\"s\"[^>]*>([^<]+)<`, 'i')
          const m = (data && data.contents ? data.contents : '').match(socketRegex)
          if (m && m[1]) {
            extractedText = m[1].trim()
            console.log('[Investing] data-socket-key match on original HTML', extractedText)
          }
        } catch (e) {
          console.log('[Investing] data-socket-key regex error', e)
        }
      }
      // If still nothing, fallback via reader proxy
      if (!extractedText) {
        const title = doc.querySelector('title')?.textContent || ''
        console.log('[Investing] Empty after DOM parse; trying reader proxy', { titleSample: title })
        try {
          const readerUrl = `https://r.jina.ai/http://${url.replace(/^https?:\/\//, '')}`
          console.log('[Investing] Fallback fetch via reader', { readerUrl })
          const readerResp = await fetch(readerUrl)
          const readerText = await readerResp.text()
          console.log('[Investing] Reader length', readerText.length)
          // Attempt XPath against parsed HTML
          const altDoc = parser.parseFromString(readerText, 'text/html')
          if (xpath) {
            const altRes = altDoc.evaluate(xpath, altDoc, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null)
            const altNode = altRes.singleNodeValue
            if (altNode && altNode.textContent) {
              const t = altNode.textContent.trim()
              console.log('[Investing] Fallback XPath hit', t.slice(0, 120))
              extractedText = t
            }
          }
          // Try CSS selector on reader
          if (!extractedText && selector) {
            const selEl = altDoc.querySelector(selector)
            if (selEl && selEl.textContent) {
              extractedText = selEl.textContent.trim()
              console.log('[Investing] Fallback selector hit', selector)
            }
          }
          // Try attribute-based regex on reader HTML
          if (!extractedText && contextSymbol) {
            try {
              const esc2 = contextSymbol.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
              const socketRegex2 = new RegExp(`<[^>]*data-socket-key\\s*=\\s*\"${esc2}\"[^>]*data-socket-attr\\s*=\\s*\"s\"[^>]*>([^<]+)<`, 'i')
              const m2 = readerText.match(socketRegex2)
              if (m2 && m2[1]) {
                extractedText = m2[1].trim()
                console.log('[Investing] data-socket-key match on reader HTML', extractedText)
              }
            } catch (e2) {
              console.log('[Investing] data-socket-key regex on reader error', e2)
            }
          }
          // Fallback 2: regex for a numeric price-looking token
          if (!extractedText) {
            const pattern = regexPattern && regexPattern.trim().length > 0 ? new RegExp(regexPattern) : /\b\d{1,3}(?:[.,]\d{3})*(?:[.,]\d{2})\b/
            const numberMatch = readerText.match(pattern)
            if (numberMatch) {
              console.log('[Investing] Regex price match', numberMatch[0])
              extractedText = numberMatch[0]
            }
          }
        } catch (ferr) {
          console.log('[Investing] Fallback error', ferr)
        }
      }
      if (!extractedText) {
        console.log('[Investing] Not found after all strategies')
        return 'Bulunamadı'
      }
      console.log('[Investing] Raw extracted text sample', extractedText.slice(0, 120))
      return extractedText.replace(/[^\d,.-]/g, '')
    } catch (error) {
      console.error('Investing scrape error:', error)
      return 'Hata'
    }
  }

  const a1ToRowCol = (a1) => {
    try {
      const m = /^([A-Za-z]+)(\d+)$/.exec((a1 || '').trim())
      if (!m) return null
      const colLetters = m[1].toUpperCase()
      const row = parseInt(m[2], 10) - 1
      let col = 0
      for (let i = 0; i < colLetters.length; i++) {
        col = col * 26 + (colLetters.charCodeAt(i) - 64)
      }
      return { row, col: col - 1 }
    } catch { return null }
  }

  const fetchSheetValue = async (sheetUrl, a1Cell, regexPattern) => {
    try {
      if (!sheetUrl) return 'URL yok'
      // Support published CSV/TSV and Google Sheets direct CSV export
      let exportUrl = sheetUrl.trim()
      if (/docs.google.com\/spreadsheets\//.test(exportUrl) && !/\?format=csv/.test(exportUrl)) {
        // Try to convert to CSV export if it's a share link
        const idMatch = exportUrl.match(/\/d\/([A-Za-z0-9-_]+)/)
        if (idMatch) {
          exportUrl = `https://docs.google.com/spreadsheets/d/${idMatch[1]}/export?format=csv`
        }
      }
      const res = await fetch(exportUrl)
      const text = await res.text()
      // Try CSV parse (simple split by lines/commas/semicolons)
      const lines = text.split(/\r?\n/)
      const cells = lines.map(l => l.split(/,|;|\t/))
      if (a1Cell) {
        const rc = a1ToRowCol(a1Cell)
        if (rc && cells[rc.row] && typeof cells[rc.row][rc.col] !== 'undefined') {
          const val = (cells[rc.row][rc.col] || '').toString().trim()
          if (val) return val.replace(/[^\d,.-]/g, '')
        }
      }
      const pattern = regexPattern && regexPattern.trim().length > 0 ? new RegExp(regexPattern) : /\b\d{1,3}(?:[.,]\d{3})*(?:[.,]\d{2})\b/
      const m = text.match(pattern)
      if (m) return m[0].replace(/[^\d,.-]/g, '')
      return 'Bulunamadı'
    } catch (e) {
      console.log('[Sheet] fetch error', e)
      return 'Hata'
    }
  }

  const fetchSymbolPrice = async (symbol) => {
    // Deprecated: per-symbol sources. We will use global sheet mapping if available
    if (!symbol) return
    setLoadingPrices(prev => ({ ...prev, [symbol.id]: true }))
    try {
      setPrices(prev => ({ ...prev, [symbol.id]: 'Bulunamadı' }))
    } finally {
      setLoadingPrices(prev => ({ ...prev, [symbol.id]: false }))
    }
  }

  const fetchAllPrices = async () => {
    try {
      // set all as loading
      const loadingState = {}
      symbols.forEach(s => { loadingState[s.id] = true })
      setLoadingPrices(prev => ({ ...prev, ...loadingState }))
      const globalUrl = (() => { try { return localStorage.getItem('globalSheetUrl') || '' } catch { return '' } })()
      if (!globalUrl) {
        // fallback: do nothing
        return
      }
      // Convert Google link to CSV export if needed
      let exportUrl = globalUrl.trim()
      if (/docs.google.com\/spreadsheets\//.test(exportUrl) && !/\?format=csv/.test(exportUrl)) {
        const idMatch = exportUrl.match(/\/d\/([A-Za-z0-9-_]+)/)
        if (idMatch) exportUrl = `https://docs.google.com/spreadsheets/d/${idMatch[1]}/export?format=csv`
      }
      const res = await fetch(exportUrl)
      const text = await res.text()
      const rows = text.split(/\r?\n/)
      const { priceBySymbol, currencyBySymbol } = await fetchPriceMapsFromGlobalSheet()
      // Update all listed symbols
      const newPrices = {}
      const newCurrencies = {}
      symbols.forEach(s => {
        const val = priceBySymbol.get((s.id || '').toUpperCase())
        const cur = currencyBySymbol.get((s.id || '').toUpperCase())
        if (typeof val !== 'undefined') newPrices[s.id] = val
        if (typeof cur !== 'undefined') newCurrencies[s.id] = cur
      })
      // Apply optional per-symbol transform based on desiredSample
      const applyTransform = (rawValue, cfg, cur) => {
        if (!cfg || !cfg.desiredSample) return rawValue
        const desired = (cfg.desiredSample || '').toString()
        const desiredDigits = (desired.match(/\d/g) || []).length
        if (desiredDigits <= 0) return rawValue
        // Detect decimal separator and how many digits before it in desired sample
        const sepMatch = desired.match(/[.,]/)
        const sepChar = sepMatch ? sepMatch[0] : ','
        const idxSep = sepMatch ? desired.indexOf(sepChar) : -1
        const digitsBeforeSep = idxSep >= 0 ? (desired.slice(0, idxSep).match(/\d/g) || []).length : desiredDigits
        // Extract digits from raw value
        const rawDigitsOnly = (String(rawValue).match(/\d/g) || []).join('')
        if (!rawDigitsOnly) return rawValue
        let take = rawDigitsOnly
        // Keep LEFTMOST desiredDigits (remove from right). If shorter, pad with trailing zeros
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
      symbols.forEach(s => {
        if (typeof newPrices[s.id] !== 'undefined') {
          newPrices[s.id] = applyTransform(newPrices[s.id], s, newCurrencies[s.id])
        }
      })
      setPrices(prev => ({ ...prev, ...newPrices }))
      setCurrencies(prev => ({ ...prev, ...newCurrencies }))
    } catch (e) {
      console.error('Global sheet fetch error:', e)
    } finally {
      const cleared = {}
      symbols.forEach(s => { cleared[s.id] = false })
      setLoadingPrices(prev => ({ ...prev, ...cleared }))
    }
  }

  const handleTestInvesting = async () => {
    if (symbolConfig.apiType !== 'investing') return
    setInvestingTesting(true)
    setInvestingTestResult('')
    try {
      console.log('[Investing][Test] Testing with', { url: symbolConfig.investingUrl, xpath: symbolConfig.investingXPath, selector: symbolConfig.investingSelector, regex: symbolConfig.investingRegex })
      const val = await fetchInvestingPrice(
        symbolConfig.investingUrl,
        symbolConfig.investingXPath,
        symbolConfig.investingSelector,
        symbolConfig.investingRegex,
        symbolConfig.symbol
      )
      console.log('[Investing][Test] Result', val)
      setInvestingTestResult(val)
    } catch (e) {
      console.error('[Investing][Test] Error', e)
      setInvestingTestResult('Hata')
    } finally {
      setInvestingTesting(false)
    }
  }

  return (
    <div className="container-fluid py-4">
      <div className="d-flex justify-content-between align-items-center mb-4">
        <div className="d-flex align-items-center">
          <button className="btn btn-link p-0 me-3" onClick={onBack} aria-label="Geri dön">
            <i className="bi bi-chevron-left" style={{ fontSize: '1.5rem' }}></i>
          </button>
          <h4 className="display-6 mb-0">
            <i className="bi bi-tag me-3"></i>Semboller
          </h4>
        </div>
        <div className="d-flex gap-2">
          <button 
            className="btn btn-outline-success rounded-circle"
            style={{ width: '40px', height: '40px' }}
            onClick={fetchAllPrices}
            aria-label="Tüm fiyatları güncelle"
            disabled={symbols.length === 0}
          >
            <i className="bi bi-arrow-clockwise"></i>
          </button>
          <button 
            className="btn btn-outline-primary rounded-circle"
            style={{ width: '40px', height: '40px' }}
            onClick={() => setShowAddSymbol(true)}
            aria-label="Yeni sembol ekle"
          >
            <i className="bi bi-plus"></i>
          </button>
        </div>
      </div>

      {/* Symbols list */}
      <div className="d-flex flex-column gap-2 mb-4">
        {symbols.map((symbol) => (
          <div key={symbol.id} className="card shadow-sm border-0">
            <div className="card-body d-flex align-items-center justify-content-between">
                <div className="d-flex align-items-center gap-3">
                <div className="avatar">
                  {symbol.logoUrl ? (
                    <div className="avatar-img-container rounded-3 border border-secondary overflow-hidden">
                      <img src={symbol.logoUrl} alt={`${symbol.name || symbol.id} logosu`} className="avatar-img" />
                    </div>
                  ) : (
                    <i className="bi bi-tag" style={{ fontSize: '1.2rem' }}></i>
                  )}
                </div>
              <div className="d-flex flex-column">
                <span className="fw-semibold">{symbol.name || symbol.id}</span>
                <div className="mt-1">
                  {loadingPrices[symbol.id] ? (
                    <small className="text-warning">
                      <i className="bi bi-hourglass-split me-1"></i>Yükleniyor...
                    </small>
                  ) : prices[symbol.id] ? (
                    <small className={`fw-semibold ${prices[symbol.id] === 'Hata' || prices[symbol.id] === 'Bulunamadı' ? 'text-danger' : 'text-success'}`}>
                      {(() => {
                        const cur = (currencies[symbol.id] || '').toUpperCase()
                        if (cur === 'TRY') return <i className="bi bi-currency-lira me-1"></i>
                        if (cur === 'EUR') return <i className="bi bi-currency-euro me-1"></i>
                        if (cur === 'GBP') return <i className="bi bi-currency-pound me-1"></i>
                        if (cur === 'USD' || cur === 'USDT') return null // Avoid double $ when value already includes $
                        return <i className="bi bi-currency-dollar me-1"></i>
                      })()}{prices[symbol.id]}
                    </small>
                  ) : (
                    <small className="text-muted">
                      <i className="bi bi-dash-circle me-1"></i>Fiyat yok
                    </small>
                  )}
                </div>
              </div>
            </div>
            <div className="d-flex gap-2">
              <button
                className="btn btn-outline-success rounded-circle"
                style={{ width: '36px', height: '36px' }}
                onClick={() => fetchAllPrices()}
                disabled={loadingPrices[symbol.id]}
                aria-label="Fiyatları güncelle"
              >
                <i className={`bi ${loadingPrices[symbol.id] ? 'bi-hourglass-split' : 'bi-arrow-clockwise'}`}></i>
              </button>
              <button
                className="btn btn-outline-secondary rounded-circle"
                style={{ width: '36px', height: '36px' }}
                onClick={() => handleConfigSymbol(symbol)}
                aria-label="Yapılandır"
              >
                <i className="bi bi-gear"></i>
              </button>
              <button
                className="btn btn-outline-danger rounded-circle"
                style={{ width: '36px', height: '36px' }}
                onClick={() => handleDeleteSymbol(symbol.id)}
                aria-label="Sembolü sil"
              >
                <i className="bi bi-trash"></i>
              </button>
            </div>
            </div>
          </div>
        ))}
        {symbols.length === 0 && (
          <div className="text-center text-body-secondary py-4">
            Henüz sembol yok. Sağ üstteki + ile yeni sembol ekleyin.
          </div>
        )}
      </div>

      {/* Add symbol modal */}
      {showAddSymbol && (
        <div 
          className="modal-backdrop" 
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            width: '100%',
            height: '100%',
            backgroundColor: 'var(--sheet-backdrop)',
            zIndex: 1050,
            display: 'flex',
            alignItems: 'flex-end',
            justifyContent: 'center'
          }}
          onClick={() => setShowAddSymbol(false)}
        >
          <div 
            className="modal-content" 
            style={{
              backgroundColor: 'var(--sheet-bg)',
              color: 'var(--text)',
              width: '100%',
              maxWidth: '600px',
              borderTopLeftRadius: '20px',
              borderTopRightRadius: '20px',
              padding: '20px',
              paddingTop: '0',
              maxHeight: '60vh',
              overflowY: 'auto',
              transform: 'translateY(0)',
              transition: 'transform 0.3s ease-out',
              boxShadow: 'var(--sheet-shadow)'
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div 
              className="d-flex justify-content-between align-items-center mb-3"
              style={{
                position: 'sticky',
                top: 0,
                backgroundColor: 'var(--sheet-bg)',
                zIndex: 2,
                paddingTop: '10px',
                paddingBottom: '8px',
                marginBottom: '12px',
                borderBottom: '1px solid var(--bs-border-color)'
              }}
            >
              <h5 className="mb-0">
                <i className="bi bi-plus-circle me-2"></i>Yeni Sembol
              </h5>
              <div className="d-flex gap-2">
                <button className="btn btn-outline-secondary btn-sm" onClick={() => setShowAddSymbol(false)}>
                  İptal
                </button>
                <button className="btn btn-primary btn-sm" onClick={handleAddSymbol} disabled={!newSymbol.trim()}>
                  Kaydet
                </button>
              </div>
            </div>

            <div className="modal-body">
              <div className="row g-3">
                <div className="col-12">
                  <label className="form-label">Sembol</label>
                  <input 
                    type="text" 
                    className="form-control" 
                    value={newSymbol} 
                    onChange={(e) => setNewSymbol(e.target.value.toUpperCase())} 
                    placeholder="Örn: AAPL, NVDA, TSLA"
                    autoFocus
                  />
                  <div className="form-text">
                    Sembol otomatik olarak büyük harfe çevrilecektir.
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Config symbol modal */}
      {showConfigSymbol && (
        <div 
          className="modal-backdrop" 
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            width: '100%',
            height: '100%',
            backgroundColor: 'var(--sheet-backdrop)',
            zIndex: 1050,
            display: 'flex',
            alignItems: 'flex-end',
            justifyContent: 'center'
          }}
          onClick={() => setShowConfigSymbol(null)}
        >
          <div 
            className="modal-content" 
            style={{
              backgroundColor: 'var(--sheet-bg)',
              color: 'var(--text)',
              width: '100%',
              maxWidth: '600px',
              borderTopLeftRadius: '20px',
              borderTopRightRadius: '20px',
              padding: '20px',
              paddingTop: '0',
              maxHeight: '85vh',
              overflowY: 'auto',
              transform: 'translateY(0)',
              transition: 'transform 0.3s ease-out',
              boxShadow: 'var(--sheet-shadow)'
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div 
              className="d-flex justify-content-between align-items-center mb-3"
              style={{
                position: 'sticky',
                top: 0,
                backgroundColor: 'var(--sheet-bg)',
                zIndex: 2,
                paddingTop: '10px',
                paddingBottom: '8px',
                marginBottom: '12px',
                borderBottom: '1px solid var(--bs-border-color)'
              }}
            >
              <h5 className="mb-0">
                <i className="bi bi-gear me-2"></i>{showConfigSymbol.id} Yapılandırması
              </h5>
              <div className="d-flex gap-2">
                <button className="btn btn-outline-secondary btn-sm" onClick={() => setShowConfigSymbol(null)}>
                  İptal
                </button>
                <button className="btn btn-primary btn-sm" onClick={handleSaveConfig}>
                  Kaydet
                </button>
              </div>
            </div>

            <div className="modal-body">
              <div className="row g-3">
                <div className="col-12">
                  <label className="form-label">Logo</label>
                  <div className="text-center d-flex justify-content-center">
                    {symbolConfig.logoUrl ? (
                      <div className="mb-3">
                        <img 
                          src={symbolConfig.logoUrl} 
                          alt="Sembol logosu önizleme"
                          className="img-fluid rounded"
                          style={{ 
                            maxWidth: '120px', 
                            maxHeight: '120px',
                            objectFit: 'contain',
                            border: '2px solid #dee2e6'
                          }}
                        />
                        <div className="mt-2 d-flex gap-2 justify-content-center">
                          <button
                            type="button"
                            className="btn btn-sm btn-outline-danger"
                            onClick={() => setSymbolConfig(prev => ({ ...prev, logoUrl: null }))}
                          >
                            <i className="bi bi-trash me-1"></i>Kaldır
                          </button>
                          <label className="btn btn-sm btn-outline-secondary mb-0">
                            Değiştir
                            <input type="file" accept="image/*" onChange={handleLogoSelect} hidden />
                          </label>
                        </div>
                      </div>
                    ) : (
                      <div 
                        className="border border-dashed rounded p-4 mb-3"
                        style={{ 
                          borderColor: '#dee2e6',
                          backgroundColor: '#f8f9fa',
                          minHeight: '120px',
                          display: 'flex',
                          flexDirection: 'column',
                          alignItems: 'center',
                          justifyContent: 'center'
                        }}
                      >
                        <i className="bi bi-image text-muted mb-2" style={{ fontSize: '2rem' }}></i>
                        <p className="text-muted mb-2">Sembol logosu seçin</p>
                        <input
                          type="file"
                          accept="image/*"
                          onChange={handleLogoSelect}
                          className="form-control"
                          style={{ maxWidth: '200px' }}
                        />
                      </div>
                    )}
                  </div>
                </div>
                <div className="col-12">
                  <label className="form-label">Örnek değer (istenen format)</label>
                  <input 
                    type="text" 
                    className="form-control" 
                    value={symbolConfig.desiredSample}
                    onChange={(e) => setSymbolConfig(prev => ({ ...prev, desiredSample: e.target.value }))}
                    placeholder="Örn: 1,312719"
                  />
                  <div className="form-text">
                    Ör: 1,312719 → 6 ondalık, virgül ayırıcı, grup ayırıcı yok.
                  </div>
                </div>
                <div className="col-12 d-flex align-items-center gap-2">
                  <button className="btn btn-outline-success btn-sm" onClick={async () => {
                    setSheetTesting(true)
                    setSheetTestResult('')
                    try {
                      const sId = (showConfigSymbol?.id || '').toUpperCase()
                      const { priceBySymbol, currencyBySymbol } = await fetchPriceMapsFromGlobalSheet()
                      const raw = priceBySymbol.get(sId)
                      const cur = currencyBySymbol.get(sId)
                      const desired = (symbolConfig.desiredSample || '').toString()
                      let transformed = raw
                      if (desired) {
                        const desiredDigits = (desired.match(/\d/g) || []).length
                        const sepMatch = desired.match(/[.,]/)
                        const sepChar = sepMatch ? sepMatch[0] : ','
                        const idxSep = sepMatch ? desired.indexOf(sepChar) : -1
                        const digitsBeforeSep = idxSep >= 0 ? (desired.slice(0, idxSep).match(/\d/g) || []).length : desiredDigits
                        const rawDigitsOnly = (String(raw).match(/\d/g) || []).join('')
                        if (rawDigitsOnly) {
                          let take = rawDigitsOnly
                          if (take.length > desiredDigits) take = take.slice(0, desiredDigits)
                          if (take.length < desiredDigits) take = take.padEnd(desiredDigits, '0')
                          const intPart = take.slice(0, Math.max(0, Math.min(digitsBeforeSep, take.length)))
                          const fracPart = take.slice(Math.max(0, Math.min(digitsBeforeSep, take.length)))
                          transformed = fracPart.length > 0 ? `${intPart}${sepChar}${fracPart}` : intPart
                        }
                      }
                      setSheetTestResult(`${raw || '—'}  |  ${transformed}${cur ? ' ' + cur : ''}`)
                    } catch (_) {
                      setSheetTestResult('Hata')
                    } finally {
                      setSheetTesting(false)
                    }
                  }} disabled={sheetTesting}>
                    {sheetTesting ? 'Test ediliyor...' : 'Test Et'}
                  </button>
                  {sheetTestResult && (
                    <span className={`badge ${sheetTestResult === 'Hata' ? 'bg-danger' : 'bg-info'}`}>{sheetTestResult}</span>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default Semboller
