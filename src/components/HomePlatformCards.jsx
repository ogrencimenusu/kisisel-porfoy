import React, { useState } from 'react'

const HomePlatformCards = ({ banks, platformTotals, showConvertedTlByPlatform, setShowConvertedTlByPlatform, formatNumber, convertPlatformToTRY, transactionsByPortfolio, symbolsData, getDesiredPriceNum, onShowBankHoldings, percentageBySymbol = new Map(), usdRate = 0 }) => {
  const platformIds = Object.keys(platformTotals || {})
  
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

  return (
    <div className="anasayfa-card">
      {platformIds.length === 0 && (
        <div className="text-center text-body-secondary py-4">Henüz işlem yok.</div>
      )}
      {platformIds.map((pid) => {
        const totals = platformTotals[pid]
        const currencyKeys = Array.from(new Set([
          ...Object.keys(totals.baseSums || {}),
          ...Object.keys(totals.currentSums || {}),
          ...Object.keys(totals.pnls || {}),
        ]))
        
        // Platformun günlük kazanç oranını hesapla
        const calculatePlatformDailyGain = () => {
          // Platforma ait tüm işlemleri bul
          const hiddenPortfolioIds = new Set()
          const allTx = Object.entries(transactionsByPortfolio || {})
            .filter(([pid]) => !hiddenPortfolioIds.has(pid))
            .map(([, list]) => list)
            .flat()
            .filter(tx => tx.platform === pid)
          
          // Sembol bazlı grupla
          const bySymbol = {}
          allTx.forEach(tx => {
            const symId = (tx.sembol || '').toString()
            if (!symId) return
            bySymbol[symId] = bySymbol[symId] || []
            bySymbol[symId].push(tx)
          })
          
          let totalPortfolioValue = 0
          let weightedDailyPct = 0
          let totalDailyGainTRY = 0
          
          Object.keys(bySymbol).forEach(symId => {
            const list = bySymbol[symId]
            const cur = (list[0]?.birim === 'TRY' || list[0]?.birim === '₺') ? '₺' : (list[0]?.birim || '')
            const symKey = symId.toUpperCase()
            const curNum = Number(getDesiredPriceNum(symKey) || 0)
            
            // FIFO hesapla
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
            
            if (remainingAdet > 0) {
              const currentVal = curNum > 0 ? Number(remainingAdet || 0) * curNum : 0
              
              if (currentVal > 0) {
                const dailyPctRaw = percentageBySymbol.get ? percentageBySymbol.get(symKey) : undefined
                const dailyPctNum = dailyPctRaw != null ? parseNumber(dailyPctRaw) : 0
                
                if (!isNaN(dailyPctNum)) {
                  totalPortfolioValue += currentVal
                  weightedDailyPct += currentVal * dailyPctNum
                  
                  // Her sembolün günlük kazancını hesapla ve TRY'ye çevir
                  const dailyGainForSymbol = currentVal * (dailyPctNum / 100)
                  if (cur === '₺' || cur === 'TRY') {
                    totalDailyGainTRY += dailyGainForSymbol
                  } else if (cur === 'USD' && usdRate > 0) {
                    totalDailyGainTRY += dailyGainForSymbol * usdRate
                  }
                }
              }
            }
          })
          
          const dailyPct = totalPortfolioValue > 0 ? weightedDailyPct / totalPortfolioValue : 0
          return { dailyPct, dailyGainAmount: totalDailyGainTRY }
        }
        
        const { dailyPct, dailyGainAmount } = calculatePlatformDailyGain()
        const hasDailyPct = !isNaN(dailyPct) && dailyPct !== 0
        const dailyPctClass = dailyPct > 0 ? 'text-success' : (dailyPct < 0 ? 'text-danger' : 'text-body-secondary')
        const bank = banks.find(bk => bk.id === pid)
        const bankName = bank?.name || pid
        
        return (
          <div key={pid} className="card-list">
            <div className="d-flex flex-column">
              <div className="d-flex align-items-center justify-content-between mb-1">
                {(() => {
                  const url = bank?.imageUrl
                  if (url) {
                    return (
                      <img src={url} alt="Banka" style={{ width: '36px', height: '36px', objectFit: 'contain' }} />
                    )
                  }
                  return <i className="bi bi-building" style={{ fontSize: '1.2rem' }}></i>
                })()}
              </div>
            </div>
            <div className="btn-wrap">
              <button
                className="btn btn-sm"
                onClick={() => setShowConvertedTlByPlatform(prev => ({ ...prev, [pid]: !prev[pid] }))}
              >
                {showConvertedTlByPlatform[pid] ? 'TL toplamını gizle' : 'TL toplamını göster'}
              </button>
              {showConvertedTlByPlatform[pid] && (
                <div className="btn-collapse">
                  <i className="bi bi-currency-lira me-1"></i>
                  {formatNumber(convertPlatformToTRY(pid), '₺')} ₺
                </div>
              )}
            </div>
            <div 
              className="card-aciksembol d-flex flex-column" 
              style={{ cursor: 'pointer' }}
              onClick={() => onShowBankHoldings && onShowBankHoldings(pid)}
            >
              <span>{totals.count} açık sembol</span>
              {hasDailyPct && (
                <small className={dailyPctClass}>
                  Günlük kazanç: {formatNumber(Math.abs(dailyGainAmount), '₺')} ₺ ({dailyPct >= 0 ? '+' : ''}{Number(dailyPct).toFixed(2)}%)
                </small>
              )}
            </div>
            {currencyKeys.map((cur) => {
              const currentVal = (totals.currentSums && typeof totals.currentSums[cur] !== 'undefined') ? totals.currentSums[cur] : 0
              const baseVal = (totals.baseSums && typeof totals.baseSums[cur] !== 'undefined') ? totals.baseSums[cur] : 0
              const pnl = (totals.pnls && typeof totals.pnls[cur] !== 'undefined') ? totals.pnls[cur] : 0
              const pct = baseVal > 0 ? (pnl / baseVal) * 100 : 0
              const cls = pnl > 0 ? 'text-success' : (pnl < 0 ? 'text-danger' : 'text-body-secondary')
              return (
                <div key={cur} className="price">
                  <div className='price-guncel'>
                    {formatNumber(currentVal, cur)} {cur}
                  </div>
                  <div className={`price-kazanc small ${cls}`}>
                    {formatNumber(Math.abs(pnl), cur)} {cur} ({pnl >= 0 ? '+' : ''}{Number(pct).toFixed(2)}%)
                  </div>
                  <div className="price-alis">
                    Alış değeri: {formatNumber(baseVal, cur)} {cur}
                  </div>
                </div>
              )
            })}
          </div>
        )
      })}
    </div>
  )
}

export default HomePlatformCards


