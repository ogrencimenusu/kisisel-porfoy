import React from 'react'

const HomePlatformCards = ({ banks, platformTotals, showConvertedTlByPlatform, setShowConvertedTlByPlatform, formatNumber, convertPlatformToTRY }) => {
  const platformIds = Object.keys(platformTotals || {})

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
        return (
          <div key={pid} className="card-list">
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
            <div className="card-aciksembol">{totals.count} açık sembol</div>
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


