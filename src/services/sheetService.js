// Sheet fetching and parsing helpers
import { db } from '../firebase'
import { doc, getDoc } from 'firebase/firestore'

export const getGlobalSheetUrl = () => {
  try { return localStorage.getItem('globalSheetUrl') || '' } catch { return '' }
}

export const getGlobalSheetUrlFromDb = async () => {
  try {
    const ref = doc(db, 'config', 'global')
    const snap = await getDoc(ref)
    if (snap.exists()) {
      const data = snap.data() || {}
      const url = (data.globalSheetUrl || '').toString()
      if (url) return url
    }
  } catch (e) {
    
  }
  return ''
}

export const toCsvExportUrl = (url) => {
  if (!url) return ''
  const trimmed = url.trim()
  if (/docs.google.com\/spreadsheets\//.test(trimmed) && /\/export\?/.test(trimmed)) {
    return trimmed
  }
  if (/docs.google.com\/spreadsheets\//.test(trimmed) && !/\?format=csv/.test(trimmed)) {
    const idMatch = trimmed.match(/\/d\/([A-Za-z0-9-_]+)/)
    if (idMatch) return `https://docs.google.com/spreadsheets/d/${idMatch[1]}/export?format=csv`
  }
  return trimmed
}

// Build CSV export URL for a specific tab (by name) using the "sheet" query param
export const toCsvExportUrlForTab = (baseUrl, tabName) => {
  if (!baseUrl) return ''
  const trimmed = baseUrl.trim()
  const idMatch = trimmed.match(/\/d\/([A-Za-z0-9-_]+)/)
  // Prefer gviz CSV endpoint to reliably select by sheet name (ignores gid)
  if (idMatch) {
    const sheetId = idMatch[1]
    return `https://docs.google.com/spreadsheets/d/${sheetId}/gviz/tq?tqx=out:csv&sheet=${encodeURIComponent(tabName || '')}`
  }
  // Fallback: try appending sheet= on existing export URL
  const exportUrl = toCsvExportUrl(trimmed)
  if (!tabName) return exportUrl
  const hasQuery = /\?/.test(exportUrl)
  const sep = hasQuery ? '&' : '?'
  return `${exportUrl}${sep}sheet=${encodeURIComponent(tabName)}`
}

const countSep = (line, sep) => {
  let count = 0, inQ = false
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (ch === '"') inQ = !inQ
    else if (!inQ && ch === sep) count++
  }
  return count
}

const detectSep = (lines) => {
  const sample = lines.slice(0, Math.min(5, lines.length))
  const seps = [',', ';', '\t']
  let best = ',', bestScore = -1
  seps.forEach(sep => {
    const scores = sample.map(l => countSep(l, sep))
    const score = scores.reduce((a,b)=>a+b,0)
    if (score > bestScore) { bestScore = score; best = sep }
  })
  return best
}

const splitWithQuotes = (line, sepChar) => {
  const out = []
  let cur = ''
  let inQ = false
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (ch === '"') {
      if (inQ && line[i+1] === '"') { cur += '"'; i++; continue }
      inQ = !inQ
      continue
    }
    if (!inQ && ch === sepChar) { out.push(cur); cur = ''; continue }
    cur += ch
  }
  out.push(cur)
  return out
}

export const fetchSheetRows = async (url) => {
  const exportUrl = toCsvExportUrl(url)
  const startTs = Date.now()
  try {
    const res = await fetch(exportUrl, { cache: 'no-cache' })
    const ct = res.headers?.get?.('content-type') || ''
    if (!res.ok) {
      return []
    }
    const text = await res.text()
    // Captive portal / blocked HTML detection
    if (/<!DOCTYPE html>|<html|<head|<body|Access Denied|captcha|Login|Moved Temporarily/i.test(text)) {
      
    }
    const lines = text.split(/\r?\n/)
    const sep = detectSep(lines)
    const rows = lines.filter(l => l.length > 0).map(l => splitWithQuotes(l, sep))
    return rows
  } catch (e) {
    
    return []
  }
}

// Fetch rows from a specific tab name in the global sheet
export const fetchRowsFromNamedTab = async (tabName) => {
  let url = await getGlobalSheetUrlFromDb()
  if (!url) {
    url = getGlobalSheetUrl()
    if (!url) return []
  }
  const exportUrl = toCsvExportUrlForTab(url, tabName)
  const startTs = Date.now()
  try {
    const res = await fetch(exportUrl, { cache: 'no-cache' })
    if (!res.ok) return []
    const text = await res.text()
    const lines = text.split(/\r?\n/)
    const sep = detectSep(lines)
    const rows = lines.filter(l => l.length > 0).map(l => splitWithQuotes(l, sep))
    
    return rows
  } catch (e) {
    
    return []
  }
}

export const buildSymbolMaps = (rows) => {
  const priceBySymbol = new Map()
  const currencyBySymbol = new Map()
  const percentageBySymbol = new Map()
  rows.forEach(cols => {
    if (!cols || cols.length < 2) return
    const key = (cols[0] || '').toString().trim().toUpperCase()
    let val = (cols[1] || '').toString().trim()
    // Detect currency and its index (prefer 3rd col, fallback to tokens like USD/EUR/TRY)
    let cur = (cols[2] || '').toString().trim().toUpperCase()
    let currencyIdx = cur ? 2 : -1
    if (!cur) {
      for (let i = 1; i < Math.min(cols.length, 6); i++) {
        const token = (cols[i] || '').toString().trim().toUpperCase()
        if (token === 'USD' || token === 'EUR' || token === 'TRY' || token === '₺') { cur = token; currencyIdx = i; break }
      }
    }
    // If price is empty, try to find the first numeric-looking token among remaining columns
    if (!val) {
      for (let i = 1; i < Math.min(cols.length, 6); i++) {
        if (i === currencyIdx) continue
        const token = (cols[i] || '').toString().trim()
        if (!token) continue
        const upper = token.toUpperCase()
        if (upper === 'USD' || upper === 'EUR' || upper === 'TRY' || upper === '₺') continue
        // Accept tokens containing at least one digit
        if (/\d/.test(token)) { val = token; break }
      }
    }
    // Get percentage from 4th column (GÜNLÜK YÜZDE KAZANÇ)
    const percentage = cols.length > 3 ? (cols[3] || '').toString().trim() : ''
    
    if (key) {
      if (typeof val !== 'undefined') priceBySymbol.set(key, val)
      if (cur) currencyBySymbol.set(key, cur)
      if (percentage) percentageBySymbol.set(key, percentage)
    }
  })
  return { priceBySymbol, currencyBySymbol, percentageBySymbol }
}

export const fetchPriceMapsFromGlobalSheet = async () => {
  let url = await getGlobalSheetUrlFromDb()
  if (!url) {
    url = getGlobalSheetUrl()
    if (!url) {
      return { priceBySymbol: new Map(), currencyBySymbol: new Map(), percentageBySymbol: new Map() }
    }
  } else {
    
  }
  const t0 = Date.now()
  const rows = await fetchRowsFromNamedTab('sembol_fiyat')
  const dataRows = rows.length > 0 ? rows.slice(1) : rows
  const maps = buildSymbolMaps(dataRows)
  
  return maps
}




