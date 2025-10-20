import React from 'react'

// desiredSample'a göre fiyatı istenen formata dönüştür (ör: 0,00000$ gibi)
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

const HomeAllHoldings = ({ allHoldings, symbolsData, formatNumber, percentageBySymbol = new Map() }) => {
  if (!allHoldings || allHoldings.length === 0) return null
  return (
    <div className="anasayfa-tumehisse">
      <h5 className="mb-2 d-flex align-items-center gap-2"><i className="bi bi-list-ul"></i> Tüm Hisseler</h5>
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
          const dailyPctRaw = percentageBySymbol.get ? percentageBySymbol.get((symId || '').toString().toUpperCase()) : undefined
          const dailyPctNum = dailyPctRaw != null ? parseFloat(String(dailyPctRaw).replace(/\./g, '').replace(/,/g, '.')) : null
          const hasDaily = dailyPctNum != null && !isNaN(dailyPctNum)
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
                <div className='tumhisse-guncel'>
                  {(() => {
                    const desiredStr = desiredTransformString(currentNum, symbolCfg?.desiredSample, cur)
                    return (
                      <>
                        <span className={hasDaily ? (dailyPctNum < 0 ? 'text-danger' : 'text-success') : ''}>
                          {desiredStr ? desiredStr : `${formatNumber(currentNum, cur)} ${cur}`}
                        </span>
                        {hasDaily && (
                          <span className={`ms-2 ${dailyPctNum < 0 ? 'text-danger' : 'text-success'}`}>
                            ({dailyPctNum >= 0 ? '+' : ''}{Number(dailyPctNum).toFixed(2)}%)
                          </span>
                        )}
                      </>
                    )
                  })()}
                </div>
                  <span className="tumhisse-isim">{symbolName}</span>
                  <span className="tumhisse-adet">{formatNumber(totalQty)}</span>
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


