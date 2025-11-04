import { db } from '../firebase'
import { collection, doc, getDocs, serverTimestamp, setDoc } from 'firebase/firestore'
import { fetchPriceMapsFromGlobalSheet } from './sheetService'

export const refreshPricesFromSheetAndStore = async () => {
  const { priceBySymbol, currencyBySymbol, percentageBySymbol } = await fetchPriceMapsFromGlobalSheet()

  // Read existing symbols to limit writes only to known docs
  const snap = await getDocs(collection(db, 'symbols'))
  const symbols = snap.docs.map(d => d.id)

  const updates = []
  const nowTs = serverTimestamp()
  for (const symId of symbols) {
    const key = (symId || '').toUpperCase()
    const raw = priceBySymbol.get(key)
    const cur = currencyBySymbol.get(key)
    const pct = percentageBySymbol.get(key)
    if (typeof raw === 'undefined' && typeof cur === 'undefined' && typeof pct === 'undefined') {
      continue
    }
    updates.push(setDoc(doc(db, 'symbols', symId), {
      latestPriceRaw: typeof raw !== 'undefined' ? String(raw) : null,
      latestCurrency: typeof cur !== 'undefined' ? String(cur) : null,
      latestPercentage: typeof pct !== 'undefined' ? String(pct) : null,
      latestUpdatedAt: nowTs,
    }, { merge: true }))
  }

  await Promise.all(updates)
  return { updatedCount: updates.length }
}

export const buildMapsFromSymbolDocs = (symbolDocs) => {
  const priceBySymbol = new Map()
  const currencyBySymbol = new Map()
  const percentageBySymbol = new Map()
  ;(symbolDocs || []).forEach(s => {
    const key = (s.id || '').toUpperCase()
    if (!key) return
    if (s.latestPriceRaw != null && s.latestPriceRaw !== '') priceBySymbol.set(key, s.latestPriceRaw)
    if (s.latestCurrency != null && s.latestCurrency !== '') currencyBySymbol.set(key, s.latestCurrency)
    if (s.latestPercentage != null && s.latestPercentage !== '') percentageBySymbol.set(key, s.latestPercentage)
  })
  return { priceBySymbol, currencyBySymbol, percentageBySymbol }
}


