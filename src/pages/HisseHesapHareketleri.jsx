import React, { useEffect, useMemo, useState } from 'react'
import { db } from '../firebase'
import { collection, onSnapshot, orderBy, query, where, Timestamp } from 'firebase/firestore'

const HisseHesapHareketleri = ({ onBack }) => {
  const [portfolios, setPortfolios] = useState([])
  const [transactionsByPortfolio, setTransactionsByPortfolio] = useState({})
  const [banks, setBanks] = useState([])
  const [symbols, setSymbols] = useState([])

  const [showFilter, setShowFilter] = useState(false)
  const [filters, setFilters] = useState(() => {
    const today = (() => {
      const d = new Date()
      const yyyy = d.getFullYear()
      const mm = String(d.getMonth() + 1).padStart(2, '0')
      const dd = String(d.getDate()).padStart(2, '0')
      return `${yyyy}-${mm}-${dd}`
    })()
    return {
      dateFrom: today,
      dateTo: today,
      portfolioId: '',
      bankId: '',
      borsa: '',
      symbolId: '',
      durum: ''
    }
  })

  useEffect(() => {
    const q = query(collection(db, 'portfolios'), orderBy('createdAt', 'desc'))
    const unsub = onSnapshot(q, (snapshot) => {
      const data = snapshot.docs.map(d => ({ id: d.id, ...d.data() }))
      setPortfolios(data)
    })
    return () => { try { unsub() } catch {} }
  }, [])

  useEffect(() => {
    const unsubBanks = onSnapshot(collection(db, 'banks'), (snapshot) => {
      const data = snapshot.docs.map(d => ({ id: d.id, ...d.data() }))
      setBanks(data)
    })
    const unsubSymbols = onSnapshot(collection(db, 'symbols'), (snapshot) => {
      const data = snapshot.docs.map(d => ({ id: d.id, ...d.data() }))
      setSymbols(data)
    })
    return () => {
      try { unsubBanks() } catch {}
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
        // Get all transactions without date filter - let client-side filtering handle it
        // This ensures we get all historical data
        const tq = query(collection(db, 'portfolios', p.id, 'transactions'), orderBy('tarih', 'desc'))
        const unsub = onSnapshot(tq, (snap) => {
          const tx = snap.docs.map(d => ({ id: d.id, ...d.data() }))
          console.log(`Portfolio ${p.id}: ${tx.length} transactions loaded`)
          setTransactionsByPortfolio(prev => ({ ...prev, [p.id]: tx }))
        }, (error) => {
          console.error(`Error loading transactions for portfolio ${p.id}:`, error)
        })
        unsubs.push(unsub)
      } catch (_) {}
    })
    return () => { unsubs.forEach(u => { try { u() } catch {} }) }
  }, [portfolios])

  const buyEntries = useMemo(() => {
    try {
      const byPortfolio = transactionsByPortfolio || {}
      const list = []
      portfolios.forEach((p) => {
        const txList = byPortfolio[p.id] || []
        txList.forEach((tx) => {
          // Include both Alış and Satış, will show durum in list
          const symbol = (tx.sembol || '').toString()
          const adet = tx.adet
          const portfolioName = p.name || p.title || p.id
          const createdAt = (tx.tarih?.toDate?.() || tx.tarih || tx.createdAt?.toDate?.() || tx.createdAt || null)
          const bankId = (tx.platform || '').toString()
          const borsa = (tx.sembolBorsa || '').toString()
          const durum = (tx.durum || '').toString()
          list.push({ id: tx.id, symbol, adet, portfolioName, portfolioId: p.id, createdAt, bankId, borsa, durum, raw: tx })
        })
      })
      // Apply filters
      const withinDate = (d) => {
        if (!filters.dateFrom && !filters.dateTo) return true
        // Handle Firestore Timestamp, Date, or string
        let t
        if (d && typeof d.toDate === 'function') {
          t = d.toDate().getTime()
        } else if (d instanceof Date) {
          t = d.getTime()
        } else if (d) {
          t = new Date(d).getTime()
        } else {
          return false
        }
        if (isNaN(t)) return false
        if (filters.dateFrom) {
          const f = new Date(filters.dateFrom + 'T00:00:00').getTime()
          if (t < f) return false
        }
        if (filters.dateTo) {
          const to = new Date(filters.dateTo + 'T23:59:59').getTime()
          if (t > to) return false
        }
        return true
      }
      const filtered = list.filter(e => (
        (!filters.portfolioId || e.portfolioId === filters.portfolioId) &&
        (!filters.bankId || e.bankId === filters.bankId) &&
        (!filters.borsa || (e.borsa || '') === filters.borsa) &&
        (!filters.symbolId || (e.symbol || '') === filters.symbolId) &&
        (!filters.durum || (e.durum || '') === filters.durum) &&
        withinDate(e.createdAt)
      ))
      // Sort by createdAt desc if available, otherwise keep insertion
      return filtered.sort((a, b) => {
        const ta = a.createdAt instanceof Date ? a.createdAt.getTime() : 0
        const tb = b.createdAt instanceof Date ? b.createdAt.getTime() : 0
        return tb - ta
      })
    } catch (_) { return [] }
  }, [transactionsByPortfolio, portfolios, filters])

  const formatNumber = (value) => {
    const num = Number(String(value || '').toString().replace(/\./g, '').replace(/,/g, '.'))
    try { return new Intl.NumberFormat('tr-TR', { maximumFractionDigits: 6, useGrouping: true }).format(isNaN(num) ? 0 : num) } catch { return String(value || '') }
  }

  return (
    <div className="container py-4">
      <div className="d-flex justify-content-between align-items-center mb-3">
        <div className="d-flex align-items-center">
          <button className="btn btn-link p-0 me-3" onClick={onBack} aria-label="Geri dön">
            <i className="bi bi-chevron-left" style={{ fontSize: '1.5rem' }}></i>
          </button>
          <h5 className="mb-0 d-flex align-items-center gap-2">
            <i className="bi bi-list-check"></i>
            Hisse hesap hareketleri
          </h5>
        </div>
        <button 
          className="btn btn-outline-secondary rounded-circle"
          style={{ width: '40px', height: '40px' }}
          onClick={() => setShowFilter(true)}
          aria-label="Filtreleri aç"
        >
          <i className="bi bi-funnel"></i>
        </button>
      </div>

      {buyEntries.length === 0 ? (
        <div className="text-center text-body-secondary py-4">Kayıt bulunamadı.</div>
      ) : (
        <div className="list-group list-group-flush">
          {buyEntries.map((e) => (
            <div key={e.id} className="list-group-item d-flex align-items-center justify-content-between">
              <div className="d-flex flex-column">
                <span className="fw-semibold">{e.symbol || '—'}</span>
                <small className="text-body-secondary">{e.portfolioName || '—'}</small>
              </div>
              <div className="text-end">
                <div className="fw-semibold">
                  {e.durum === 'Satış' ? (
                    <span className="badge text-bg-danger me-2">Satış</span>
                  ) : e.durum === 'Stopaj Kesintisi' ? (
                    <span className="badge text-bg-primary me-2">Stopaj Kesintisi</span>
                  ) : (
                    <span className="badge text-bg-success me-2">Alış</span>
                  )}
                </div>
                <div className="small text-body-secondary">
                  Toplam Maliyet: {formatNumber(e?.raw?.maaliyet || e?.raw?.fiyat)} {e?.raw?.birim || ''}
                </div>
                <small className="text-body-secondary">{e.createdAt instanceof Date ? e.createdAt.toLocaleDateString() : ''}</small>
              </div>
            </div>
          ))}
        </div>
      )}

      {showFilter && (
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
          onClick={() => setShowFilter(false)}
        >
          <div 
            className="modal-content" 
            style={{
              backgroundColor: 'var(--sheet-bg)',
              color: 'var(--text)',
              width: '100%',
              maxWidth: '800px',
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
                <i className="bi bi-funnel me-2"></i>Filtrele
              </h5>
              <div className="d-flex gap-2">
                <button className="btn btn-outline-warning btn-sm" onClick={() => setFilters({ dateFrom: '', dateTo: '', portfolioId: '', bankId: '', borsa: '', symbolId: '', durum: '' })}>
                  Temizle
                </button>
                <button className="btn btn-outline-secondary btn-sm" onClick={() => setShowFilter(false)}>
                  Kapat
                </button>
                <button className="btn btn-primary btn-sm" onClick={() => setShowFilter(false)}>
                  Uygula
                </button>
              </div>
            </div>

            <div className="modal-body">
              <div className="row g-3">
                <div className="col-6">
                  <label className="form-label">Başlangıç Tarihi</label>
                  <input 
                    type="date" 
                    className="form-control" 
                    value={filters.dateFrom}
                    onChange={(e) => setFilters(prev => ({ ...prev, dateFrom: e.target.value }))}
                  />
                </div>
                <div className="col-6">
                  <label className="form-label">Bitiş Tarihi</label>
                  <input 
                    type="date" 
                    className="form-control" 
                    value={filters.dateTo}
                    onChange={(e) => setFilters(prev => ({ ...prev, dateTo: e.target.value }))}
                  />
                </div>

                <div className="col-12">
                  <label className="form-label">Portföy</label>
                  <select 
                    className="form-select"
                    value={filters.portfolioId}
                    onChange={(e) => setFilters(prev => ({ ...prev, portfolioId: e.target.value }))}
                  >
                    <option value="">Tümü</option>
                    {portfolios.map(p => (
                      <option key={p.id} value={p.id}>{p.name || p.title || p.id}</option>
                    ))}
                  </select>
                </div>

                <div className="col-12">
                  <label className="form-label">Banka</label>
                  <select 
                    className="form-select"
                    value={filters.bankId}
                    onChange={(e) => setFilters(prev => ({ ...prev, bankId: e.target.value }))}
                  >
                    <option value="">Tümü</option>
                    {banks.map(b => (
                      <option key={b.id} value={b.id}>{b.name || b.id}</option>
                    ))}
                  </select>
                </div>

                <div className="col-12">
                  <label className="form-label">Borsa</label>
                  <select 
                    className="form-select"
                    value={filters.borsa}
                    onChange={(e) => setFilters(prev => ({ ...prev, borsa: e.target.value }))}
                  >
                    <option value="">Tümü</option>
                    {Array.from(new Set(Object.values(transactionsByPortfolio)
                      .flat()
                      .map(tx => (tx.sembolBorsa || '').toString())
                      .filter(v => !!v)
                    )).sort().map(v => (
                      <option key={v} value={v}>{v}</option>
                    ))}
                  </select>
                </div>

                <div className="col-12">
                  <label className="form-label">Hisse</label>
                  <select 
                    className="form-select"
                    value={filters.symbolId}
                    onChange={(e) => setFilters(prev => ({ ...prev, symbolId: e.target.value }))}
                  >
                    <option value="">Tümü</option>
                    {symbols.sort((a, b) => (a.id || '').localeCompare(b.id || '')).map(s => (
                      <option key={s.id} value={s.id}>{s.name || s.id}</option>
                    ))}
                  </select>
                </div>

                <div className="col-12">
                  <label className="form-label">Durum</label>
                  <select 
                    className="form-select"
                    value={filters.durum}
                    onChange={(e) => setFilters(prev => ({ ...prev, durum: e.target.value }))}
                  >
                    <option value="">Tümü</option>
                    <option value="Alış">Alış</option>
                    <option value="Satış">Satış</option>
                    <option value="Stopaj Kesintisi">Stopaj Kesintisi</option>
                  </select>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default HisseHesapHareketleri


