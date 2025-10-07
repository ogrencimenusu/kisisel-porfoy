import React from 'react'

const HomeAllHoldings = ({ allHoldings, symbolsData, formatNumber }) => {
  if (!allHoldings || allHoldings.length === 0) return null
  return (
    <div className="anasayfa-tumehisse">
      <div className="tumhisse-wrap">
        {allHoldings.map(({ symId, fifo, cur, currentNum, currentValue }) => {
          const symbolCfg = symbolsData.find(s => s.id === symId)
          const symbolName = symbolCfg ? (symbolCfg.name || symbolCfg.id) : symId
          const logoUrl = symbolCfg?.logoUrl
          const totalQty = Number(fifo.remainingAdet || 0)
          const totalCost = Number(fifo.remainingMaaliyet || 0)
          const gain = Number(currentValue - totalCost)
          const pct = totalCost > 0 ? (gain / totalCost) * 100 : 0
          const gainCls = gain > 0 ? 'text-success' : (gain < 0 ? 'text-danger' : 'text-body-secondary')
          return (
            <div key={symId} className="tumhisse-item">
              <div className="tumhisse-bilgiler-wrap">
                {logoUrl ? (
                  <div className="logo">
                    <img src={logoUrl} alt={`${symbolName} logosu`} className="avatar-img" />
                  </div>
                ) : (
                  <i className="bi bi-tag" style={{ fontSize: '1rem' }}></i>
                )}
                <div className="tumhisse-bilgiler">
                <div className='tumhisse-guncel'>{formatNumber(currentNum, cur)} {cur}</div>
                  <span className="tumhisse-isim">{symbolName}</span>
                  <span className="tumhisse-adet">{(totalQty)}</span>
                  <span className="tumhisse-fiyat">{formatNumber(currentValue, cur)} {cur}</span>
                  <div className={`tumhisse-kazanc small ${gainCls}`}> {formatNumber(Math.abs(gain), cur)} {cur} ({gain >= 0 ? '+' : ''}{Number(pct).toFixed(2)}%)</div>
                  </div>
              </div>
              {/*
              <div className="hisse-fiyatlar">
                
                <div className='alis'>Toplam Alış: {formatNumber(totalCost, cur)} {cur}</div>
              </div>
               */}
            </div>
          )
        })}
      </div>
    </div>
  )
}

export default HomeAllHoldings


