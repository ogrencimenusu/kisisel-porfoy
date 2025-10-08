import React from 'react'

const HomeStarredPortfolios = ({ portfolios, transactionsByPortfolio, symbolsData, expandedStarred, setExpandedStarred, getDesiredPriceNum, formatNumber, usdRate = 0 }) => {
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

  const getSymbolNameById = (symbolId) => {
    const symbol = symbolsData.find(s => s.id === symbolId)
    return symbol ? (symbol.name || symbol.id) : symbolId
  }

  const starred = (portfolios || []).filter(p => !!p.starred)
  if (!starred || starred.length === 0) return null

  return (
    <div className="">  
      <div className='anasayfa-portfoy'>
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
          const isOpen = !!expandedStarred[p.id]
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
          return (
        <div className="portfoy-wrap" role="button" onClick={() => setExpandedStarred(prev => ({ ...prev, [p.id]: !prev[p.id] }))}>
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
                  <div className="price-currency">
                    <div className="alis">{formatNumber(baseVal, cur)} {cur}</div>
                    <div className="guncel">{formatNumber(curVal, cur)} {cur}</div>
 <div key={cur} className="small">
                  
                   <div className={`price-kazanc small ${cls}`}>
                 
                      {formatNumber(Math.abs(gain), cur)} {cur} ({gain >= 0 ? '+' : ''}{Number(pct).toFixed(2)}%)
                
                    </div>  
                  </div>

                  </div>  
                 
                 
                )
              })
              // Toplam (₺)
              try {
                const tryCur = (totalsByCur.current['₺'] || totalsByCur.current['TRY'] || 0)
                const usdCur = (totalsByCur.current['USD'] || 0)
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
        
        
        </div>
        
        )
      })}
        </div>
      <div className="">
      <div className="d-flex flex-column gap-2">
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
          const isOpen = !!expandedStarred[p.id]
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
          return (
            <div key={p.id} className="card card-anasayfa shadow-sm border-0">
              <div className="card-body d-flex align-items-center justify-content-between" role="button" onClick={() => setExpandedStarred(prev => ({ ...prev, [p.id]: !prev[p.id] }))}>
                <div className="d-flex align-items-center gap-3">
                  <div className="d-flex flex-column">
                    <span className="fw-semibold d-flex align-items-center gap-2">
                      {p.name || 'Adsız portföy'} <i className="bi bi-star-fill text-warning"></i>
                    </span>
                    <small className="text-body-secondary d-block">{p.createdAt?.toDate?.().toLocaleString?.() || ''}</small>
                  </div>
                </div>
                <div className="ms-auto text-end">
                  <div className="small">Açık hisse sayısı: {openCount}</div>
                  {(() => {
                    const curKeys = Array.from(new Set([
                      ...Object.keys(totalsByCur.base || {}),
                      ...Object.keys(totalsByCur.current || {})
                    ]))
                    return curKeys.map(cur => {
                      const baseVal = totalsByCur.base[cur] || 0
                      const curVal = totalsByCur.current[cur] || 0
                      const gain = curVal - baseVal
                      const pct = baseVal > 0 ? (gain / baseVal) * 100 : 0
                      const cls = gain > 0 ? 'text-success' : (gain < 0 ? 'text-danger' : 'text-body-secondary')
                      return (
                        <div key={cur} className="small">
                          Alış: {formatNumber(baseVal, cur)} {cur} | Güncel: {formatNumber(curVal, cur)} {cur}
                          <div className={cls}>
                            {formatNumber(Math.abs(gain), cur)} {cur} ({gain >= 0 ? '+' : ''}{Number(pct).toFixed(2)}%)
                          </div>
                        </div>
                      )
                    })
                  })()}
                </div>
              </div>
              {isOpen && (
                <div className="list-group list-group-flush">
                  {entries.length === 0 && (
                    <div className="list-group-item text-body-secondary">Açık pozisyon yok.</div>
                  )}
                  {entries.map(({ symId, list, fifo }) => {
                    const birim = list[0]?.birim
                    const symbolName = getSymbolNameById(symId)
                    const currentNum = Number(getDesiredPriceNum((symId || '').toString().toUpperCase()) || 0)
                    const currentValue = currentNum > 0 ? Number(fifo.remainingAdet || 0) * currentNum : 0
                    const baseVal = Number(fifo.remainingMaaliyet || 0)
                    const pnl = currentValue - baseVal
                    const pct = baseVal > 0 ? (pnl / baseVal) * 100 : 0
                    return (
                      <div key={symId} className="list-group-item bg-transparent d-flex align-items-center justify-content-between">
                        <div className="d-flex align-items-center gap-2">
                          {(() => {
                            const symCfg = symbolsData.find(s => s.id === symId)
                            const url = symCfg?.logoUrl
                            if (url) {
                              return (
                                <div className="avatar-img-container rounded-3 border border-secondary overflow-hidden" style={{ width: '28px', height: '28px' }}>
                                  <img src={url} alt={`${symCfg?.name || symCfg?.id || 'Sembol'} logosu`} className="avatar-img" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
                                </div>
                              )
                            }
                            return <i className="bi bi-tag" style={{ fontSize: '1rem' }}></i>
                          })()}
                          <div className="d-flex flex-column">
                            <span className="fw-semibold">{symbolName}</span>
                            <small className="text-body-secondary">Kalan: {formatNumber(fifo.remainingAdet)} adet</small>
                          </div>
                        </div>
                        <div className="text-end small">
                          {currentValue > 0 ? (
                            <>
                              Güncel değer: {formatNumber(currentValue, birim)} {birim}
                              <div className={`${pnl > 0 ? 'text-success' : (pnl < 0 ? 'text-danger' : 'text-body-secondary')}`}>
                                {formatNumber(Math.abs(pnl), birim)} {birim} ({pnl >= 0 ? '+' : ''}{Number(pct).toFixed(2)}%)
                              </div>
                            </>
                          ) : null}
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          )
        })}
      </div>
      </div>
    </div>
  )
}

export default HomeStarredPortfolios


