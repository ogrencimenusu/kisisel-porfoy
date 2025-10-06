import React, { useState, useEffect } from 'react'
import { fetchPriceMapsFromGlobalSheet, fetchRowsFromNamedTab } from '../services/sheetService'
import { db } from '../firebase'
import { collection, onSnapshot, addDoc, serverTimestamp, query, orderBy, getDocs, getDoc, setDoc, doc, deleteDoc, updateDoc } from 'firebase/firestore'

const Portfoy = ({ onBack }) => {
  const [showSheet, setShowSheet] = useState(false)
  const [banks, setBanks] = useState([])
  const [portfolios, setPortfolios] = useState([])
  const [transactionsByPortfolio, setTransactionsByPortfolio] = useState({})
  const [showCreatePortfolio, setShowCreatePortfolio] = useState(false)
  const [newPortfolioName, setNewPortfolioName] = useState('')
  const [newPortfolioTitle, setNewPortfolioTitle] = useState('')
  const [newPortfolioDescription, setNewPortfolioDescription] = useState('')
  const [newPortfolioDate, setNewPortfolioDate] = useState('')
  const [selectedPortfolio, setSelectedPortfolio] = useState(null)
  const [showEditPortfolio, setShowEditPortfolio] = useState(false)
  const [editingPortfolio, setEditingPortfolio] = useState(null)
  const [editPortfolioData, setEditPortfolioData] = useState({
    name: '',
    title: '',
    description: '',
    date: ''
  })
  const [showImportSheet, setShowImportSheet] = useState(false)
  const [importData, setImportData] = useState({
    portfolioName: '',
    excelData: ''
  })
  const defaultSymbols = [ ''
  ]
  const [userSymbols, setUserSymbols] = useState([])
  const [symbolsData, setSymbolsData] = useState([])
  const [symbolQuery, setSymbolQuery] = useState('')
  const [showSymbolMenu, setShowSymbolMenu] = useState(false)
  const [formData, setFormData] = useState({
    platform: '',
    sembolBorsa: '',
    sembol: '',
    durum: '',
    adet: 0,
    fiyat: 0,
    komisyon: 0,
    stopaj: 0,
    birim: '',
    maaliyet: 0,
    aciklama: '',
    tarih: ''
  })
  const [editingTx, setEditingTx] = useState(null)
  const [expandedGroups, setExpandedGroups] = useState({})
  const [expandedPortfolios, setExpandedPortfolios] = useState({})
  const [hideZeroHoldings, setHideZeroHoldings] = useState(false)
  const [showSortSheet, setShowSortSheet] = useState(false)
  const [sortOption, setSortOption] = useState('symbol_asc') // 'symbol_asc' | 'symbol_desc' | 'date_asc' | 'date_desc' | 'quantity_asc' | 'quantity_desc'
  const [sheetPrices, setSheetPrices] = useState({})

  useEffect(() => {
    const unsubscribe = onSnapshot(collection(db, 'banks'), (snapshot) => {
      const data = snapshot.docs.map(d => ({ id: d.id, ...d.data() }))
      setBanks(data)
    })
    return () => {
      try { unsubscribe() } catch {}
    }
  }, [])

  // Persist/Load UI preferences for portfolio
  const saveUiPrefs = async (partial) => {
    try {
      const ref = doc(db, 'config', 'global')
      await setDoc(ref, { ...partial, updatedAt: new Date() }, { merge: true })
    } catch (_) {}
  }

  useEffect(() => {
    (async () => {
      try {
        const ref = doc(db, 'config', 'global')
        const snap = await getDoc(ref)
        if (snap.exists()) {
          const data = snap.data() || {}
          if (typeof data.portfolioHideZero === 'boolean') setHideZeroHoldings(data.portfolioHideZero)
          if (data.portfolioSortOption) setSortOption((data.portfolioSortOption || '').toString())
        }
      } catch (_) {}
    })()
  }, [])

  useEffect(() => {
    // fetch user-defined symbols live
    const unsub = onSnapshot(collection(db, 'symbols'), (snap) => {
      try {
        const data = snap.docs.map(d => ({ id: d.id, ...d.data() }))
        setSymbolsData(data)
        setUserSymbols(data.map(s => s.name || s.id))
      } catch (_) {
        setSymbolsData([])
        setUserSymbols([])
      }
    })
    return () => { try { unsub() } catch {} }
  }, [])

  const fetchGlobalSheetPrices = async () => {
    console.log('[Portfoy] Fetching global sheet prices...')
    try {
      // Log RAW rows from 'sembol_fiyat' without any transformations
      try {
        const rawPriceRows = await fetchRowsFromNamedTab('sembol_fiyat')
        console.log('[Portfoy][RAW] semboI_fiyat rows (no transform)', rawPriceRows)
      } catch (_) {}
      try {
        const rawTxRows = await fetchRowsFromNamedTab('portfoy_hareketleri')
        console.log('[Portfoy][RAW] portfoy_hareketleri rows (no transform)', rawTxRows)
      } catch (_) {}

      const { priceBySymbol, currencyBySymbol } = await fetchPriceMapsFromGlobalSheet()
      const obj = {}
      priceBySymbol.forEach((v, k) => { obj[k] = v })
      // Apply desiredSample transform
      const applyDesiredTransform = (rawValue, desiredSample, cur) => {
        if (!desiredSample) return rawValue
        const desired = (desiredSample || '').toString()
        const desiredDigits = (desired.match(/\d/g) || []).length
        if (desiredDigits <= 0) return rawValue
        const sepMatch = desired.match(/[.,]/)
        const sepChar = sepMatch ? sepMatch[0] : ','
        const idxSep = sepMatch ? desired.indexOf(sepChar) : -1
        const digitsBeforeSep = idxSep >= 0 ? (desired.slice(0, idxSep).match(/\d/g) || []).length : desiredDigits
        const rawDigitsOnly = (String(rawValue).match(/\d/g) || []).join('')
        if (!rawDigitsOnly) return rawValue
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
      try {
        symbolsData.forEach(s => {
          const key = (s.id || '').toUpperCase()
          if (typeof obj[key] !== 'undefined') {
            const cur = currencyBySymbol.get(key)
            obj[key] = applyDesiredTransform(obj[key], s.desiredSample, cur)
          }
        })
      } catch (_) {}
      // Debug logs for fetched data
      try {
        const pricesDebug = Object.fromEntries(priceBySymbol)
        const currenciesDebug = Object.fromEntries(currencyBySymbol || new Map())
        console.log('[Portfoy] Fetched price map and currency map', {
          symbols: Object.keys(pricesDebug).length,
          prices: pricesDebug,
          currencies: currenciesDebug
        })
      } catch (_) {}
      console.log('[Portfoy] Prices loaded', { count: Object.keys(obj).length })
      setSheetPrices(obj)
    } catch (e) {
      console.log('[Portfoy] fetchGlobalSheetPrices error', { name: e?.name, message: e?.message })
    }
  }

  useEffect(() => {
    // Re-fetch prices whenever symbolsData changes so desiredSample formatting is applied
    fetchGlobalSheetPrices()
  }, [symbolsData])

  const handleImportFromSheet = async () => {
    const ok = (() => { try { return window.confirm('Google Sheet\'ten import edilsin mi?') } catch { return true } })()
    if (!ok) return
    try {
      const rows = await fetchRowsFromNamedTab('portfoy_hareketleri')
      if (!rows || rows.length <= 1) {
        try { window.alert('Sheet boş veya bulunamadı.') } catch {}
        return
      }
      const header = rows[0].map(h => (h || '').toString().trim())
      const dataRows = rows.slice(1) // başlık hariç

      const norm = (s) => (s || '').toString().trim().toLowerCase()
      const findIdx = (names) => {
        const targets = Array.isArray(names) ? names : [names]
        for (let i = 0; i < header.length; i++) {
          const hv = norm(header[i])
          if (targets.some(t => hv === norm(t))) return i
        }
        return -1
      }

      // Header-based indices with Turkish variants
      const iPlatform = findIdx(['platform'])
      const iSembolBorsa = findIdx(['sembol borsa','borsa'])
      const iSembol = findIdx(['sembol'])
      const iDurum = findIdx(['durum','işlem','islem'])
      const iAdet = findIdx(['adet','miktar'])
      const iFiyat = findIdx(['fiyat','birim fiyat'])
      const iKomisyon = findIdx(['komisyon'])
      const iBirim = findIdx(['birim','para birimi'])
      const iMaaliyet = findIdx(['maaliyet','tutar'])
      const iAciklama = findIdx(['açıklama','aciklama','not'])
      const iTarih = findIdx(['tarih','işlem tarihi','islem tarihi'])

      const getBankIdByName = (platformName) => {
        const bank = banks.find(b => (b.name || '').toLowerCase() === (platformName || '').toLowerCase())
        return bank ? bank.id : (platformName || '')
      }

      const parseDecimalNumber = (value) => {
        if (!value) return 0
        let cleanValue = value.toString().replace(/[₺$€]/g, '')
        cleanValue = cleanValue.replace(/\./g, '').replace(/,/g, '.')
        const num = parseFloat(cleanValue)
        return isNaN(num) ? 0 : num
      }

      const stripCurrencySymbols = (value) => {
        return (value == null ? '' : String(value)).replace(/[₺$€]/g, '').trim()
      }

      const formatBirim = (birim) => {
        if (birim === 'TRY' || birim === '₺') return '₺'
        if (birim === 'USD' || birim === '$') return 'USD'
        if (birim === 'EUR' || birim === '€') return 'EUR'
        return birim || ''
      }

      const getSymbolIdByName = (symbolName) => {
        const symbol = symbolsData.find(s => (s.name || s.id) === (symbolName || ''))
        return symbol ? symbol.id : (symbolName || '')
      }

      const formatDate = (dateStr) => {
        if (!dateStr) return null
        const parts = dateStr.split('.')
        if (parts.length === 3) {
          const [day, month, year] = parts
          const dateString = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
          return new Date(dateString)
        }
        return null
      }

      // KALDIRILDI: TRY'yi 2 haneye zorlayan formatTryNumber; TEFAS gibi varlıklar daha fazla hane kullanır

      const transactions = dataRows.map((cols) => {
        const platform = (iPlatform >= 0 ? cols[iPlatform] : '') || ''
        const sembolBorsa = (iSembolBorsa >= 0 ? cols[iSembolBorsa] : '') || ''
        const sembol = (iSembol >= 0 ? cols[iSembol] : '') || ''
        const durum = (iDurum >= 0 ? cols[iDurum] : '') || ''
        const marketNorm = ((sembolBorsa || '').toString().trim().toUpperCase())
        if (marketNorm === '-' || marketNorm === 'DÖVİZ' || marketNorm === 'DOVIZ') return null
        const adet = parseDecimalNumber(iAdet >= 0 ? cols[iAdet] : '')
        // fiyat with desiredSample if available
        const priceRaw = iFiyat >= 0 ? cols[iFiyat] : ''
        const symbolRec = symbolsData.find(s => (s.name || s.id) === (sembol || '') || s.id === (sembol || '').toUpperCase())
        let fiyat = 0
        if (symbolRec && symbolRec.desiredSample) {
          const transformed = desiredTransformString(priceRaw, symbolRec.desiredSample, '')
          if (transformed) fiyat = parseDecimalNumber(transformed)
        }
        if (!fiyat) fiyat = parseDecimalNumber(priceRaw)
        const komisyon = parseDecimalNumber(iKomisyon >= 0 ? cols[iKomisyon] : '')
        const birim = ((iBirim >= 0 ? cols[iBirim] : '') || '').toString().trim()
        const maaliyetVal = parseDecimalNumber(iMaaliyet >= 0 ? cols[iMaaliyet] : '')
        const aciklamaVal = ((iAciklama >= 0 ? cols[iAciklama] : '') || '').toString().trim()
        const tarih = ((iTarih >= 0 ? cols[iTarih] : '') || '').toString().trim()
        const birimFormatted = formatBirim(birim)
        // TRY için 2 ondalığa zorlamadan, desiredSample varsa onu uygula; yoksa ham metni sakla
        let fiyatOut = fiyat
        let komisyonOut = komisyon
        if (birimFormatted === '₺') {
          if (symbolRec && symbolRec.desiredSample) {
            const transformedStr = desiredTransformString(priceRaw, symbolRec.desiredSample, '')
            if (transformedStr) fiyatOut = transformedStr
          } else {
            fiyatOut = stripCurrencySymbols(priceRaw)
          }
          komisyonOut = stripCurrencySymbols(iKomisyon >= 0 ? (cols[iKomisyon] || '') : '')
        }
        const out = {
          platform: getBankIdByName((platform || '').toString().trim()),
          sembolBorsa: (sembolBorsa || '').toString().trim(),
          sembol: getSymbolIdByName((sembol || '').toString().trim()),
          durum: durum || 'Alış',
          adet: adet,
          fiyat: (birimFormatted === '₺') ? fiyatOut : fiyat,
          komisyon: (birimFormatted === '₺') ? komisyonOut : komisyon,
          stopaj: 0,
          birim: birimFormatted,
          maaliyet: maaliyetVal,
          aciklama: aciklamaVal,
          tarih: formatDate(tarih)
        }
        return out
      }).filter(x => x && x.sembol)

      if (transactions.length === 0) {
        try { window.alert('Import edilecek işlem bulunamadı.') } catch {}
        return
      }

      const portfolioRef = await addDoc(collection(db, 'portfolios'), {
        name: 'Sheet Import',
        createdAt: serverTimestamp()
      })

      const promises = transactions.map(tx => addDoc(collection(db, 'portfolios', portfolioRef.id, 'transactions'), {
        ...tx,
        createdAt: serverTimestamp()
      }))
      await Promise.all(promises)
      try { window.alert(`${transactions.length} işlem sheet'ten import edildi.`) } catch {}
    } catch (e) {
      try { window.alert('Sheet import sırasında hata oluştu.') } catch {}
    }
  }

  useEffect(() => {
    // Listen and list portfolios
    const q = query(collection(db, 'portfolios'), orderBy('createdAt', 'desc'))
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const data = snapshot.docs.map(d => ({ id: d.id, ...d.data() }))
      setPortfolios(data)
    })
    return () => {
      try { unsubscribe() } catch {}
    }
  }, [])

  // Listen transactions per portfolio and keep them grouped by portfolio id
  useEffect(() => {
    if (!portfolios || portfolios.length === 0) {
      setTransactionsByPortfolio({})
      return
    }
    const unsubs = []
    portfolios.forEach((p) => {
      try {
        const tq = query(collection(db, 'portfolios', p.id, 'transactions'), orderBy('createdAt', 'desc'))
        const unsub = onSnapshot(tq, (snap) => {
          const tx = snap.docs.map(d => ({ id: d.id, ...d.data() }))
          setTransactionsByPortfolio(prev => ({ ...prev, [p.id]: tx }))
        })
        unsubs.push(unsub)
      } catch (_) {}
    })
    return () => {
      unsubs.forEach(u => { try { u() } catch {} })
    }
  }, [portfolios])

  const handleCreatePortfolio = async () => {
    const name = (newPortfolioName || '').trim()
    if (!name) return
    const title = (newPortfolioTitle || '').trim()
    const description = (newPortfolioDescription || '').trim()
    const dateStr = (newPortfolioDate || '').trim()
    let dateVal = null
    try { dateVal = dateStr ? new Date(dateStr) : null } catch { dateVal = null }
    try {
      await addDoc(collection(db, 'portfolios'), {
        name,
        title,
        description,
        date: dateVal,
        createdAt: serverTimestamp()
      })
      setNewPortfolioName('')
      setNewPortfolioTitle('')
      setNewPortfolioDescription('')
      setNewPortfolioDate('')
      setShowCreatePortfolio(false)
    } catch (e) {
      // noop minimal handling
    }
  }

  const handleOpenEditPortfolio = (p) => {
    setEditingPortfolio(p)
    const dateVal = (() => {
      try {
        const d = p.date instanceof Date ? p.date : (p.date?.toDate?.() || null)
        if (!d) return ''
        const yyyy = d.getFullYear()
        const mm = String(d.getMonth() + 1).padStart(2, '0')
        const dd = String(d.getDate()).padStart(2, '0')
        return `${yyyy}-${mm}-${dd}`
      } catch { return '' }
    })()
    setEditPortfolioData({
      name: p.name || '',
      title: p.title || '',
      description: p.description || '',
      date: dateVal
    })
    setShowEditPortfolio(true)
  }

  const handleSaveEditPortfolio = async () => {
    if (!editingPortfolio) return
    const name = (editPortfolioData.name || '').trim()
    if (!name) return
    const payload = {
      name,
      title: (editPortfolioData.title || '').trim(),
      description: (editPortfolioData.description || '').trim()
    }
    const dateStr = (editPortfolioData.date || '').trim()
    try {
      payload.date = dateStr ? new Date(dateStr) : null
    } catch { payload.date = null }
    try {
      await updateDoc(doc(db, 'portfolios', editingPortfolio.id), payload)
      setShowEditPortfolio(false)
      setEditingPortfolio(null)
    } catch (_) {
      // noop
    }
  }

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

  const recalcCost = (nextData) => {
    const adetNum = parseNumber(nextData.adet)
    const fiyatNum = parseNumber(nextData.fiyat)
    const komisyonNum = parseNumber(nextData.komisyon)
    return Number((adetNum * fiyatNum + komisyonNum).toFixed(2))
  }

  const formatNumber = (value, currency) => {
    const num = typeof value === 'number' ? value : parseNumber(value)
    const isTry = currency === 'TRY' || currency === '₺'
    const locale = isTry ? 'tr-TR' : 'en-US'
    try {
      const hasCurrency = !!currency
      const options = hasCurrency 
        ? { minimumFractionDigits: 2, maximumFractionDigits: 2 }
        : { maximumFractionDigits: 6 }
      return new Intl.NumberFormat(locale, options).format(isNaN(num) ? 0 : num)
    } catch (_) {
      return String(isNaN(num) ? 0 : num)
    }
  }

  const getCurrencySymbol = (currency) => {
    switch (currency) {
      case 'USD': return '$'
      case 'EUR': return '€'
      case 'TRY': return '₺'
      case '₺': return '₺'
      default: return '...'
    }
  }

  const handleChange = (field, value) => {
    const nextData = { ...formData, [field]: value }
    if (field === 'adet' || field === 'fiyat' || field === 'komisyon') {
      nextData.maaliyet = recalcCost(nextData)
    }
    setFormData(nextData)
  }

  const mergedSymbols = Array.from(new Set([...defaultSymbols, ...userSymbols]))
  const filteredSymbols = mergedSymbols.filter(s => s.toLowerCase().includes((symbolQuery || formData.sembol || '').toLowerCase())).sort().slice(0, 8)

  const handleSymbolInput = (val) => {
    setSymbolQuery(val)
    handleChange('sembol', val)
    setShowSymbolMenu(true)
  }

  const handleSelectSymbol = (val) => {
    handleChange('sembol', val)
    setSymbolQuery(val)
    setShowSymbolMenu(false)
  }

  const handleAddSymbol = async () => {
    const sym = (formData.sembol || '').trim().toUpperCase()
    if (!sym) return
    if (mergedSymbols.includes(sym)) {
      setShowSymbolMenu(false)
      return
    }
    try {
      await setDoc(doc(db, 'symbols', sym), { 
        name: sym,
        createdAt: serverTimestamp() 
      })
      setUserSymbols(prev => Array.from(new Set([...prev, sym])))
      setSymbolsData(prev => [...prev, { id: sym, name: sym }])
      setShowSymbolMenu(false)
    } catch (e) {
      // noop
    }
  }

  const handleDeleteSymbol = async (symbolId) => {
    const symbolName = symbolsData.find(s => s.id === symbolId)?.name || symbolId
    const isDefault = defaultSymbols.includes(symbolName)
    if (isDefault) return
    const ok = window.confirm(`${symbolName} sembolünü silmek istediğinize emin misiniz?`)
    if (!ok) return
    try {
      await deleteDoc(doc(db, 'symbols', symbolId))
      setUserSymbols(prev => prev.filter(s => s !== symbolName))
      setSymbolsData(prev => prev.filter(s => s.id !== symbolId))
    } catch (e) {
      // noop
    }
  }

  const handleDeletePortfolio = async (portfolio) => {
    const ok = window.confirm(`${portfolio.name || 'Adsız portföy'} portföyünü ve içindeki tüm işlemleri silmek istediğinize emin misiniz? Bu işlem geri alınamaz.`)
    if (!ok) return
    
    try {
      // Önce portföydeki tüm işlemleri sil
      const transactions = transactionsByPortfolio[portfolio.id] || []
      const deletePromises = transactions.map(tx => 
        deleteDoc(doc(db, 'portfolios', portfolio.id, 'transactions', tx.id))
      )
      await Promise.all(deletePromises)
      
      // Sonra portföyü sil
      await deleteDoc(doc(db, 'portfolios', portfolio.id))
      
      try { window.alert('Portföy ve içindeki tüm işlemler silindi.') } catch {}
    } catch (e) {
      try { window.alert('Portföy silinirken bir hata oluştu.') } catch {}
    }
  }

  const desiredTransformString = (rawValue, desiredSample, cur) => {
    if (!desiredSample) return null
    const desired = (desiredSample || '').toString()
    const desiredDigits = (desired.match(/\d/g) || []).length
    if (desiredDigits <= 0) return null
    const sepMatch = desired.match(/[.,]/)
    const sepChar = sepMatch ? sepMatch[0] : ','
    const idxSep = sepMatch ? desired.indexOf(sepChar) : -1
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

  const parseExcelData = (excelText) => {
    const lines = excelText.split(/\r?\n/).filter(l => l.trim().length > 0)
    if (lines.length <= 1) return []
    const dataLines = lines.slice(1)
    // Platform adını banka ID'sine çevir
    const getBankIdByName = (platformName) => {
      const bank = banks.find(b => b.name.toLowerCase() === platformName.toLowerCase())
      return bank ? bank.id : platformName // Bulunamazsa orijinal adı döndür
    }
    // TRY 2 ondalık zorlamayı kaldırdık; desiredSample'a göre veya ham metin korunacak

    return dataLines.map((line, index) => {
      let columns = line.split('\t')
      if (columns.length < 11) {
        columns = line.split(/\s{2,}/)
      }
      if (columns.length < 11) {
        console.warn(`Satır ${index + 2}: Yetersiz veri`, columns)
        return null
      }
      const platform = columns[0]?.trim() || ''
      const sembolBorsa = columns[1]?.trim() || ''
      const sembol = columns[2]?.trim() || ''
      const durum = columns[3]?.trim() || ''
      const marketNorm = (sembolBorsa || '').toString().trim().toUpperCase()
      if (marketNorm === '-' || marketNorm === 'DÖVİZ' || marketNorm === 'DOVIZ') return null
      const adet = parseNumber(columns[4]) || 0
      const parseDecimalNumber = (value) => {
        if (!value) return 0
        let cleanValue = value.toString().replace(/[₺$€]/g, '')
        cleanValue = cleanValue.replace(/\./g, '').replace(/,/g, '.')
        const num = parseFloat(cleanValue)
        return isNaN(num) ? 0 : num
      }
      // fiyat - try desiredSample transform if available
      const priceRaw = columns[5]
      const symbolRec = symbolsData.find(s => (s.name || s.id) === (sembol || '') || s.id === (sembol || '').toUpperCase())
      let fiyatNum = 0
      if (symbolRec && symbolRec.desiredSample) {
        const transformed = desiredTransformString(priceRaw, symbolRec.desiredSample, columns[7])
        if (transformed) fiyatNum = parseDecimalNumber(transformed)
      }
      if (!fiyatNum) fiyatNum = parseDecimalNumber(priceRaw)
      const komisyonNum = parseDecimalNumber(columns[6])
      const birim = columns[7]?.trim() || ''
      const maaliyet = parseDecimalNumber(columns[8])
      const aciklama = columns[9]?.trim() || ''
      const tarih = columns[10]?.trim() || ''
      const formatDate = (dateStr) => {
        if (!dateStr) return null
        const parts = dateStr.split('.')
        if (parts.length === 3) {
          const [day, month, year] = parts
          const dateString = `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`
          return new Date(dateString)
        }
        return null
      }
      const formatBirim = (birim) => {
        if (birim === 'TRY' || birim === '₺') return '₺'
        if (birim === 'USD' || birim === '$') return 'USD'
        if (birim === 'EUR' || birim === '€') return 'EUR'
        return birim
      }
      const getSymbolIdByName = (symbolName) => {
        const symbol = symbolsData.find(s => (s.name || s.id) === symbolName)
        return symbol ? symbol.id : symbolName
      }
      const birimFormatted = formatBirim(birim)
      return {
        platform: getBankIdByName(platform),
        sembolBorsa: sembolBorsa,
        sembol: getSymbolIdByName(sembol),
        durum: durum,
        adet: adet,
        fiyat: (birimFormatted === '₺') ? formatTryNumber(fiyatNum) : fiyatNum,
        komisyon: (birimFormatted === '₺') ? formatTryNumber(komisyonNum) : komisyonNum,
        stopaj: 0,
        birim: birimFormatted,
        maaliyet: maaliyet,
        aciklama: aciklama,
        tarih: formatDate(tarih)
      }
    }).filter(item => item !== null)
  }

  const handleImportData = async () => {
    const portfolioName = importData.portfolioName.trim()
    const excelData = importData.excelData.trim()
    
    if (!portfolioName || !excelData) {
      try { window.alert('Portföy adı ve Excel verisi gereklidir.') } catch {}
      return
    }
    
    try {
      // Excel verilerini parse et
      const transactions = parseExcelData(excelData)
      
      if (transactions.length === 0) {
        try { window.alert('Geçerli veri bulunamadı. Lütfen Excel verilerini kontrol edin.') } catch {}
        return
      }
      
      // Portföy oluştur
      const portfolioRef = await addDoc(collection(db, 'portfolios'), {
        name: portfolioName,
        createdAt: serverTimestamp()
      })
      
      // İşlemleri ekle
      const transactionPromises = transactions.map(tx => 
        addDoc(collection(db, 'portfolios', portfolioRef.id, 'transactions'), {
          ...tx,
          createdAt: serverTimestamp()
        })
      )
      
      await Promise.all(transactionPromises)
      
      // Formu temizle ve sheet'i kapat
      setImportData({ portfolioName: '', excelData: '' })
      setShowImportSheet(false)
      
      try { window.alert(`${transactions.length} işlem başarıyla import edildi.`) } catch {}
      
    } catch (e) {
      try { window.alert('Import işlemi sırasında bir hata oluştu.') } catch {}
    }
  }

  const handleSaveTransaction = async () => {
    if (!selectedPortfolio) return
    const trimmedSymbol = (formData.sembol || '').trim().toUpperCase()
    const trimmedPlatform = (formData.platform || '').trim()
    const unit = (formData.birim || '').trim()
    const market = (formData.sembolBorsa || '').trim()
    if (!trimmedPlatform || !trimmedSymbol || !unit || !market) return

    // Sembol adını sembol ID'sine çevir
    const getSymbolIdByName = (symbolName) => {
      const symbol = symbolsData.find(s => (s.name || s.id) === symbolName)
      return symbol ? symbol.id : symbolName // Bulunamazsa orijinal adı döndür
    }

    const adetNum = parseNumber(formData.adet)
    const fiyatNum = parseNumber(formData.fiyat)
    const komisyonNum = parseNumber(formData.komisyon)
    const stopajNum = parseNumber(formData.stopaj)
    const maaliyetNum = recalcCost({ adet: adetNum, fiyat: fiyatNum, komisyon: komisyonNum })
    const unitToSave = unit === 'TRY' ? '₺' : unit

    const tarihValue = (formData.tarih || '').trim()
    let dateValue = null
    try {
      dateValue = tarihValue ? new Date(tarihValue) : null
    } catch (_) {
      dateValue = null
    }

    try {
      if (editingTx && editingTx.id) {
        await updateDoc(doc(db, 'portfolios', selectedPortfolio.id, 'transactions', editingTx.id), {
          platform: trimmedPlatform,
          sembolBorsa: market,
          sembol: getSymbolIdByName(trimmedSymbol), // Sembol ID'sine çevir
          durum: formData.durum || 'Alış',
          adet: adetNum,
          fiyat: unit === 'TRY' ? formData.fiyat : fiyatNum,
          komisyon: unit === 'TRY' ? formData.komisyon : komisyonNum,
          stopaj: stopajNum,
          birim: unitToSave,
          maaliyet: maaliyetNum,
          aciklama: formData.aciklama || '',
          tarih: dateValue
        })
        try { window.alert('İşlem güncellendi.') } catch {}
      } else {
        await addDoc(collection(db, 'portfolios', selectedPortfolio.id, 'transactions'), {
          platform: trimmedPlatform,
          sembolBorsa: market,
          sembol: getSymbolIdByName(trimmedSymbol), // Sembol ID'sine çevir
          durum: formData.durum || 'Alış',
          adet: adetNum,
          fiyat: unit === 'TRY' ? formData.fiyat : fiyatNum,
          komisyon: unit === 'TRY' ? formData.komisyon : komisyonNum,
          stopaj: stopajNum,
          birim: unitToSave,
          maaliyet: maaliyetNum,
          aciklama: formData.aciklama || '',
          tarih: dateValue,
          createdAt: serverTimestamp()
        })
        try { window.alert('İşlem kaydedildi.') } catch {}
      }

      // reset form and close
      setFormData({
        platform: '',
        sembolBorsa: '',
        sembol: '',
        durum: '',
        adet: 0,
        fiyat: 0,
        komisyon: 0,
        stopaj: 0,
        birim: '',
        maaliyet: 0,
        aciklama: '',
        tarih: ''
      })
      setEditingTx(null)
      setShowSheet(false)
    } catch (e) {
      // minimal fallback: keep sheet open so user can retry
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
            <i className="bi bi-globe2 me-3"></i>Portföyler
          </h4>
        </div>
        <div className="d-flex gap-2">
          <button 
            className="btn btn-outline-success rounded-circle"
            style={{ width: '40px', height: '40px' }}
            onClick={fetchGlobalSheetPrices}
            aria-label="Sheet fiyatlarını yenile"
          >
            <i className="bi bi-arrow-clockwise"></i>
          </button>
          <button 
            className="btn btn-outline-warning rounded-circle"
            style={{ width: '40px', height: '40px' }}
            onClick={handleImportFromSheet}
            aria-label="Sheet'ten portföy import et"
          >
            <i className="bi bi-file-earmark-arrow-down"></i>
          </button>
          <button 
            className="btn btn-outline-success rounded-circle"
            style={{ width: '40px', height: '40px' }}
            onClick={() => setShowImportSheet(true)}
            aria-label="Excel verilerini import et"
          >
            <i className="bi bi-upload"></i>
          </button>
          <button 
            className="btn btn-outline-secondary rounded-circle"
            style={{ width: '40px', height: '40px' }}
            onClick={async () => {
              setHideZeroHoldings(prev => !prev)
              try { await saveUiPrefs({ portfolioHideZero: !hideZeroHoldings }) } catch (_) {}
            }}
            aria-label="Sıfır adetlileri gizle/göster"
            title={hideZeroHoldings ? 'Sıfır adetlileri göster' : 'Sıfır adetlileri gizle'}
          >
            <i className={`bi ${hideZeroHoldings ? 'bi-eye-slash' : 'bi-eye'}`}></i>
          </button>
          <button 
            className="btn btn-outline-secondary rounded-circle"
            style={{ width: '40px', height: '40px' }}
            onClick={() => setShowSortSheet(true)}
            aria-label="Sırala"
            title="Sırala"
          >
            <i className="bi bi-arrow-down-up"></i>
          </button>
          <button 
            className="btn btn-outline-primary rounded-circle"
            style={{ width: '40px', height: '40px' }}
            onClick={() => setShowCreatePortfolio(true)}
            aria-label="Yeni portföy oluştur"
          >
            <i className="bi bi-plus"></i>
          </button>
        </div>
      </div>

      {/* Portfolio list */}
      <div className="d-flex flex-column gap-2 mb-4">
        {portfolios.map((p) => (
          <div key={p.id} className="card shadow-sm border-0">
            <div className="card-body d-flex align-items-center justify-content-between">
              <div className="d-flex align-items-center gap-3" role="button" onClick={() => {
                setExpandedPortfolios(prev => ({ ...prev, [p.id]: !prev[p.id] }))
              }}>
                <i className={`bi ${expandedPortfolios[p.id] ? 'bi-caret-down' : 'bi-caret-right'}`}></i>
                <div className="rounded-3 d-flex align-items-center justify-content-center" style={{ width: '40px', height: '40px', background: 'var(--bs-tertiary-bg)' }}>
                  <i className="bi bi-folder2" style={{ fontSize: '1.2rem' }}></i>
                </div>
                <div className="d-flex flex-column">
                  <span className="fw-semibold">
                    {p.name || 'Adsız portföy'} {p.starred ? <i className="bi bi-star-fill text-warning ms-1"></i> : null}
                  </span>
                  <small className="text-body-secondary">{p.createdAt?.toDate?.().toLocaleString?.() || ''}</small>
                </div>
              </div>
              <div className="d-flex gap-2">
                <button
                  className="btn btn-outline-secondary rounded-circle"
                  style={{ width: '36px', height: '36px' }}
                  onClick={() => handleOpenEditPortfolio(p)}
                  aria-label="Portföyü düzenle"
                >
                  <i className="bi bi-pencil"></i>
                </button>
                <button
                  className="btn btn-outline-warning rounded-circle"
                  style={{ width: '36px', height: '36px' }}
                  onClick={async () => {
                    try { await updateDoc(doc(db, 'portfolios', p.id), { starred: !p.starred }) } catch (_) {}
                  }}
                  aria-label="Portföyü yıldızla"
                >
                  <i className={`bi ${p.starred ? 'bi-star-fill' : 'bi-star'}`}></i>
                </button>
                <button
                  className="btn btn-outline-danger rounded-circle"
                  style={{ width: '36px', height: '36px' }}
                  onClick={() => handleDeletePortfolio(p)}
                  aria-label="Portföyü sil"
                >
                  <i className="bi bi-trash"></i>
                </button>
                <button
                  className="btn btn-outline-primary rounded-circle"
                  style={{ width: '36px', height: '36px' }}
                  onClick={() => { 
                    setSelectedPortfolio(p);
                    setEditingTx(null);
                    setFormData({
                      platform: '',
                      sembolBorsa: '',
                      sembol: '',
                      durum: '',
                      adet: 0,
                      fiyat: 0,
                      komisyon: 0,
                      stopaj: 0,
                      birim: '',
                      maaliyet: 0,
                      aciklama: '',
                      tarih: ''
                    });
                    setShowSheet(true) 
                  }}
                  aria-label="Bu portföye işlem ekle"
                >
                  <i className="bi bi-plus"></i>
                </button>
              </div>
            </div>
              {expandedPortfolios[p.id] && (
              <div className="list-group list-group-flush">
              {Array.isArray(transactionsByPortfolio[p.id]) && transactionsByPortfolio[p.id].length > 0 ? (
                (() => {
                  const grouped = transactionsByPortfolio[p.id].reduce((acc, tx) => {
                    // Sembol ID'sini sembol adına çevir
                    const getSymbolNameById = (symbolId) => {
                      const symbol = symbolsData.find(s => s.id === symbolId)
                      return symbol ? (symbol.name || symbol.id) : symbolId
                    }
                    const key = getSymbolNameById(tx.sembol) || '—'
                    acc[key] = acc[key] || []
                    acc[key].push(tx)
                    return acc
                  }, {})
                  // FIFO hesaplaması
                  const calculateFIFO = (transactions) => {
                      // Tarihe göre sırala (en eski önce)
                      const sortedTx = [...transactions].sort((a, b) => {
                        const dateA = a.tarih instanceof Date ? a.tarih : (a.tarih?.toDate?.() || new Date(0))
                        const dateB = b.tarih instanceof Date ? b.tarih : (b.tarih?.toDate?.() || new Date(0))
                        return dateA - dateB
                      })
                      
                      let remainingAdet = 0
                      let remainingMaaliyet = 0
                      let toplamAlisMaaliyet = 0
                      let toplamSatisGelir = 0
                      const alislar = []
                      
                      for (const tx of sortedTx) {
                        const adet = parseNumber(tx.adet) || 0
                        const maaliyet = parseNumber(tx.maaliyet) || 0
                        const birimFiyat = adet > 0 ? maaliyet / adet : 0
                        
                        if (tx.durum === 'Alış') {
                          alislar.push({
                            adet: adet,
                            maaliyet: maaliyet,
                            birimFiyat: birimFiyat,
                            tarih: tx.tarih
                          })
                          remainingAdet += adet
                          remainingMaaliyet += maaliyet
                          toplamAlisMaaliyet += maaliyet
                        } else if (tx.durum === 'Satış') {
                          let satisAdet = adet
                          let satisMaaliyet = 0
                          
                          // FIFO ile satış yap
                          while (satisAdet > 0 && alislar.length > 0) {
                            const alis = alislar[0]
                            const kullanilacakAdet = Math.min(satisAdet, alis.adet)
                            
                            satisMaaliyet += kullanilacakAdet * alis.birimFiyat
                            alis.adet -= kullanilacakAdet
                            alis.maaliyet -= kullanilacakAdet * alis.birimFiyat
                            satisAdet -= kullanilacakAdet
                            
                            if (alis.adet <= 0) {
                              alislar.shift() // Boş alışı kaldır
                            }
                          }
                          
                          remainingAdet -= adet
                          remainingMaaliyet -= satisMaaliyet
                          toplamSatisGelir += maaliyet // Satış geliri
                        }
                      }
                      
                      // Kar/Zarar hesaplama (sadece tamamen satılmış olanlar için)
                      const karZarar = remainingAdet === 0 ? toplamSatisGelir - toplamAlisMaaliyet : 0
                      const karZararYuzde = toplamAlisMaaliyet > 0 ? (karZarar / toplamAlisMaaliyet) * 100 : 0
                      
                      return {
                        adet: remainingAdet,
                        maaliyet: remainingMaaliyet,
                        karZarar: karZarar,
                        karZararYuzde: karZararYuzde,
                        toplamAlisMaaliyet: toplamAlisMaaliyet,
                        toplamSatisGelir: toplamSatisGelir
                      }
                    }

                  const entries = Object.keys(grouped).map(symbol => {
                    const list = grouped[symbol]
                    const fifoTotals = calculateFIFO(list)
                    const lastDate = list.reduce((max, tx) => {
                      const d = tx.tarih instanceof Date ? tx.tarih : (tx.tarih?.toDate?.() || new Date(0))
                      return d > max ? d : max
                    }, new Date(0))
                    const typeKey = (list[0]?.sembolBorsa || '').toString()
                    return { symbol, list, fifoTotals, lastDate, typeKey }
                  })

                  const sortedEntries = (() => {
                    const so = (sortOption || 'symbol_asc').toString()
                    if (so === 'symbol_desc') return entries.sort((a, b) => b.symbol.localeCompare(a.symbol))
                    if (so === 'symbol_asc') return entries.sort((a, b) => a.symbol.localeCompare(b.symbol))
                    if (so === 'type_desc') return entries.sort((a, b) => (b.typeKey || '').localeCompare(a.typeKey || '') || a.symbol.localeCompare(b.symbol))
                    if (so === 'type_asc') return entries.sort((a, b) => (a.typeKey || '').localeCompare(b.typeKey || '') || a.symbol.localeCompare(b.symbol))
                    if (so === 'quantity_desc') return entries.sort((a, b) => (b.fifoTotals.adet || 0) - (a.fifoTotals.adet || 0))
                    if (so === 'quantity_asc') return entries.sort((a, b) => (a.fifoTotals.adet || 0) - (b.fifoTotals.adet || 0))
                    if (so === 'date_desc') return entries.sort((a, b) => (b.lastDate?.getTime?.() || 0) - (a.lastDate?.getTime?.() || 0))
                    if (so === 'date_asc') return entries.sort((a, b) => (a.lastDate?.getTime?.() || 0) - (b.lastDate?.getTime?.() || 0))
                    return entries.sort((a, b) => a.symbol.localeCompare(b.symbol))
                  })()

                  return sortedEntries.map(({ symbol, list, fifoTotals }) => {
                    const toplamStopaj = (() => {
                      try {
                        return list
                          .filter(tx => (tx.durum || '').toLowerCase() === 'stopaj kesintisi')
                          .reduce((sum, tx) => sum + (parseNumber(tx.maaliyet) || 0), 0)
                      } catch { return 0 }
                    })()
                    const isOpen = !!(expandedGroups[p.id] && expandedGroups[p.id][symbol])
                    const birim = list[0]?.birim
                    // Mevcut fiyat ve gerçekleşmemiş K/Z hesaplama
                    const currentPriceRaw = sheetPrices[(symbol || '').toUpperCase()]
                    const currentPriceNum = parseNumber(currentPriceRaw)
                    const hasCurrentPrice = typeof currentPriceRaw !== 'undefined' && currentPriceRaw !== null && String(currentPriceRaw).trim() !== '' && !isNaN(currentPriceNum)
                    const currentValue = hasCurrentPrice && fifoTotals.adet > 0 ? currentPriceNum * fifoTotals.adet : null
                    const unrealizedPnL = currentValue !== null ? (currentValue - fifoTotals.maaliyet) : null
                    const unrealizedPnLPct = (currentValue !== null && fifoTotals.maaliyet > 0) ? ((unrealizedPnL / fifoTotals.maaliyet) * 100) : null
                    if (hideZeroHoldings && fifoTotals.adet <= 0) return null
                    return (
                      <div key={symbol} className="list-group-item p-0">
                        <div className="d-flex align-items-center justify-content-between px-3 py-2" role="button" onClick={() => {
                          setExpandedGroups(prev => ({
                            ...prev,
                            [p.id]: { ...(prev[p.id] || {}), [symbol]: !isOpen }
                          }))
                        }}>
                          <div className="d-flex  gap-2 align-items-start">
                            <i className={`bi ${isOpen ? 'bi-caret-down' : 'bi-caret-right'}`}></i>
                            <div className="d-flex align-items-start gap-2">
                              <div className="avatar">
                                {(() => {
                                  const symbolIdForGroup = list[0]?.sembol
                                  const symCfg = symbolsData.find(s => s.id === symbolIdForGroup)
                                  const url = symCfg?.logoUrl
                                  if (url) {
                                    return (
                                      <div className="avatar-img-container rounded-3 border border-secondary overflow-hidden">
                                        <img src={url} alt={`${symCfg?.name || symCfg?.id || 'Sembol'} logosu`} className="avatar-img" />
                                      </div>
                                    )
                                  }
                                  return <i className="bi bi-tag" style={{ fontSize: '1.2rem' }}></i>
                                })()}
                              </div>
                              <span className="fw-semibold">
                              {symbol} 
                              <br />
                              <span className='' style={{fontSize: '0.8rem'}}>
                              {(() => {
                                const val = sheetPrices[(symbol || '').toUpperCase()]
                                return val ? val : '—'
                              })()} {birim}
                              </span>
                              </span>
                            </div>
                            <div></div>
                          </div>
                          <div className="text-end">
                            
                            
                            {currentValue !== null && (
                              <div className="small mt-1">
                                Güncel değer: {formatNumber(currentValue, birim)} {birim}
                              </div>
                            )}
                            {unrealizedPnL !== null && (
                              <div className={`small mt-1 ${unrealizedPnL > 0 ? 'text-success' : (unrealizedPnL < 0 ? 'text-danger' : 'text-body-secondary')}`} style={{fontSize: '0.6rem'}}>
                                {formatNumber(Math.abs(unrealizedPnL), birim)} {birim}
                                {unrealizedPnLPct !== null && (
                                  <span> ({unrealizedPnL >= 0 ? '+' : ''}{Number(unrealizedPnLPct).toFixed(2)}%)</span>
                                )}
                              </div>
                            )}
                            {/*fifoTotals.adet > 0 && (
                               <div className="text-success small">
                                {(() => {
                                  const symbolIdForGroup = list[0]?.sembol
                                  const symCfg = symbolsData.find(s => s.id === symbolIdForGroup)
                                  const avgNum = fifoTotals.adet > 0 ? fifoTotals.maaliyet / fifoTotals.adet : 0
                                  const desiredStr = desiredTransformString(avgNum, symCfg?.desiredSample, birim)
                                  if (desiredStr) return <>Ort. Fiyat: {desiredStr}{toplamStopaj ? <> | Toplam Stopaj: {formatNumber(toplamStopaj, birim)} {birim}</> : null}</>
                                  return <>Ort. Alım Fiyat: {formatNumber(avgNum, birim)} {birim}{toplamStopaj ? <> | Toplam Stopaj: {formatNumber(toplamStopaj, birim)} {birim}</> : null}</>
                                })()}
                               </div>
                             )*/}
                            {false && fifoTotals.adet === 0 && fifoTotals.karZarar !== 0 && (
                              <div className={`small ${fifoTotals.karZarar > 0 ? 'text-success' : 'text-danger'}`}>
                                <div className="fw-semibold">
                                  {fifoTotals.karZarar > 0 ? 'Kar' : 'Zarar'}: {formatNumber(Math.abs(fifoTotals.karZarar), birim)} {birim}
                                </div>
                                <div>
                                  {fifoTotals.karZararYuzde > 0 ? '+' : ''}{Number(fifoTotals.karZararYuzde).toFixed(2)}%
                                </div>
                              </div>
                            )}
                          </div>
                        </div>
                        {isOpen && (
                          <div className="list-group list-group-flush">

                            <div className='d-flex flex-row  gap-1 p-1' style={{fontSize: '0.8rem'}}> 
                            <span className="text-small d-block font-weight-normal" >
                              {fifoTotals.adet > 0 ? 'Kalan Adet ' : 'Toplam Adet '}: {formatNumber(fifoTotals.adet)} 
                              </span>
                              <span className="text-small d-block font-weight-normal" >
                               - {fifoTotals.adet > 0 ? 'Kalan Maaliyet' : 'Toplam Maaliyet'}: {formatNumber(fifoTotals.maaliyet, birim)} {birim}
                              </span>
                              <span className="text-small d-block font-weight-normal" > -  
                              {(() => {
                                const symbolIdForGroup = list[0]?.sembol
                                const symCfg = symbolsData.find(s => s.id === symbolIdForGroup)
                                const avgNum = fifoTotals.adet > 0 ? fifoTotals.maaliyet / fifoTotals.adet : 0
                                const desiredStr = desiredTransformString(avgNum, symCfg?.desiredSample, birim)
                                if (desiredStr) return <>Ort. Fiyat: {desiredStr}{toplamStopaj ? <> | Toplam Stopaj: {formatNumber(toplamStopaj, birim)} {birim}</> : null}</>
                                return <>Ort. Alım Fiyat: {formatNumber(avgNum, birim)} {birim}{toplamStopaj ? <> | Toplam Stopaj: {formatNumber(toplamStopaj, birim)} {birim}</> : null}</>
                              })()}

                              </span>
                            </div>

                            {list.map(tx => (
                              <div key={tx.id} className="list-group-item bg-transparent d-flex align-items-center justify-content-between" >
                                <div className="d-flex align-items-center justify-content-between w-100">
                                  <div className="d-flex flex-column">
                                    <span className="fw-semibold">{tx.durum} - <small className="text-body-secondary">
                                      {formatNumber(tx.adet)} Adet,  {(() => {
                                        const symCfg = symbolsData.find(s => s.id === tx.sembol)
                                        const desiredStr = desiredTransformString(tx.fiyat, symCfg?.desiredSample, tx.birim)
                                        if (desiredStr) return desiredStr
                                        return <>{formatNumber(tx.fiyat, tx.birim)} {tx.birim}</>
                                      })()}
                                    </small></span>
                                    
                                    <div>Maaliyet: {formatNumber(tx.maaliyet, tx.birim)} {tx.birim} </div>
                                  </div>
                                  <div className="d-flex align-items-center gap-3">
                                    <div className="text-end">
                                      <div className="text-body-secondary">{(tx.tarih instanceof Date ? tx.tarih : (tx.tarih?.toDate?.() || null))?.toLocaleDateString?.() || ''}</div>
                                      <small className="text-body-secondary"> Komisyon: {formatNumber(tx.komisyon, tx.birim)}</small>
                                    </div>
                                    <div className="btn-group">
                                      <button 
                                        className="btn btn-sm btn-outline-secondary"
                                        aria-label="İşlemi düzenle"
                                        onClick={() => {
                                          setSelectedPortfolio(p)
                                          setEditingTx(tx)
                                          const tarihVal = (() => {
                                            const d = (tx.tarih instanceof Date ? tx.tarih : (tx.tarih?.toDate?.() || null))
                                            if (!d) return ''
                                            const yyyy = d.getFullYear()
                                            const mm = String(d.getMonth() + 1).padStart(2, '0')
                                            const dd = String(d.getDate()).padStart(2, '0')
                                            return `${yyyy}-${mm}-${dd}`
                                          })()
                                          
                                          // Sembol ID'sini sembol adına çevir
                                          const getSymbolNameById = (symbolId) => {
                                            const symbol = symbolsData.find(s => s.id === symbolId)
                                            return symbol ? (symbol.name || symbol.id) : symbolId
                                          }
                                          
                                          setFormData({
                                            platform: tx.platform || '',
                                            sembolBorsa: tx.sembolBorsa || '',
                                            sembol: getSymbolNameById(tx.sembol) || '', // Sembol adını göster
                                            durum: tx.durum || 'Alış',
                                            adet: tx.adet || 0,
                                            fiyat: tx.fiyat || 0,
                                            komisyon: tx.komisyon || 0,
                                            stopaj: tx.stopaj || 0,
                                            birim: (tx.birim === 'TRY' || tx.birim === '₺') ? '₺' : (tx.birim || ''),
                                            maaliyet: tx.maaliyet || 0,
                                            aciklama: tx.aciklama || '',
                                            tarih: tarihVal
                                          })
                                          setShowSheet(true)
                                        }}
                                      >
                                        <i className="bi bi-pencil"></i>
                                      </button>
                                      <button 
                                        className="btn btn-sm btn-outline-danger"
                                        aria-label="İşlemi sil"
                                        onClick={async () => {
                                          const ok = window.confirm('Bu işlemi silmek istediğinize emin misiniz?')
                                          if (!ok) return
                                          try {
                                            await deleteDoc(doc(db, 'portfolios', p.id, 'transactions', tx.id))
                                          } catch (_) {}
                                        }}
                                      >
                                        <i className="bi bi-trash"></i>
                                      </button>
                                    </div>
                                  </div>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )
                  })
                })()
              ) : (
                <div className="list-group-item text-body-secondary">Henüz işlem yok.</div>
              )}
            </div>
            )}
          </div>
        ))}
        {portfolios.length === 0 && (
          <div className="text-center text-body-secondary py-4">
            Henüz portföy yok. Sağ üstteki + ile yeni portföy oluşturun.
          </div>
        )}
      </div>

      {/* Create portfolio modal */}
      {showCreatePortfolio && (
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
          onClick={() => setShowCreatePortfolio(false)}
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
                <i className="bi bi-plus-circle me-2"></i>Yeni Portföy
              </h5>
              <div className="d-flex gap-2">
                <button className="btn btn-outline-secondary btn-sm" onClick={() => setShowCreatePortfolio(false)}>
                  İptal
                </button>
                <button className="btn btn-primary btn-sm" onClick={handleCreatePortfolio} disabled={!newPortfolioName.trim()}>
                  Kaydet
                </button>
              </div>
            </div>

            <div className="modal-body">
              <div className="row g-3">
                <div className="col-12">
                  <label className="form-label">Portföy adı</label>
                  <input 
                    type="text" 
                    className="form-control" 
                    value={newPortfolioName} 
                    onChange={(e) => setNewPortfolioName(e.target.value)} 
                    placeholder="Örn: Uzun Vade"
                    autoFocus
                  />
                </div>
                <div className="col-12 col-md-6">
                  <label className="form-label">Başlık</label>
                  <input 
                    type="text" 
                    className="form-control" 
                    value={newPortfolioTitle} 
                    onChange={(e) => setNewPortfolioTitle(e.target.value)} 
                    placeholder="Örn: 2025 Strateji"
                  />
                </div>
                <div className="col-12 col-md-6">
                  <label className="form-label">Tarih</label>
                  <input 
                    type="date" 
                    className="form-control" 
                    value={newPortfolioDate} 
                    onChange={(e) => setNewPortfolioDate(e.target.value)} 
                  />
                </div>
                <div className="col-12">
                  <label className="form-label">Açıklama</label>
                  <textarea 
                    className="form-control" 
                    rows="2"
                    value={newPortfolioDescription} 
                    onChange={(e) => setNewPortfolioDescription(e.target.value)} 
                    placeholder="Notlarınızı yazın..."
                  />
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {showSheet && (
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
          onClick={() => setShowSheet(false)}
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
                {editingTx ? (
                  <>
                    <i className="bi bi-pencil-square me-2"></i>İşlemi Düzenle{selectedPortfolio ? ` — ${selectedPortfolio.name}` : ''}
                  </>
                ) : (
                  <>
                    <i className="bi bi-plus-circle me-2"></i>Yeni İşlem{selectedPortfolio ? ` — ${selectedPortfolio.name}` : ''}
                  </>
                )}
              </h5>
              <div className="d-flex gap-2">
                <button className="btn btn-outline-secondary btn-sm" onClick={() => { setShowSheet(false); setEditingTx(null); }}>
                  İptal
                </button>
                <button className="btn btn-primary btn-sm" onClick={handleSaveTransaction}>
                  {editingTx ? 'Güncelle' : 'Kaydet'}
                </button>
              </div>
            </div>

            <div className="modal-body">
              <div className="row g-3">
                <div className="col-12 col-md-6">
                  <label className="form-label">Platform</label>
                  <select 
                    className="form-select" 
                    value={formData.platform} 
                    onChange={(e) => handleChange('platform', e.target.value)}
                  >
                    <option value="">Platform seçin</option>
                    {banks.map(bank => (
                      <option key={bank.id} value={bank.id}>{bank.name}</option>
                    ))}
                  </select>
                </div>
                <div className="col-12 col-md-6">
                  <label className="form-label">Sembol Borsa</label>
                  <select 
                    className="form-select" 
                    value={formData.sembolBorsa} 
                    onChange={(e) => handleChange('sembolBorsa', e.target.value)}
                  >
                    <option value="">Seçiniz</option>
                    <option value="TEFAS">TEFAS</option>
                    <option value="BIST">BIST</option>
                    <option value="NYSE">NYSE</option>
                    <option value="BATS">BATS</option>
                    <option value="NASDAQ">NASDAQ</option>
                    <option value="KRIPTO">KRIPTO</option>
                  </select>
                </div>
                {formData.sembolBorsa === 'TEFAS' && (
                  <div className="col-12 col-md-6">
                    <label className="form-label">Stopaj Oranı</label>
                    <div className="input-group">
                      <input 
                        type="number" 
                        step="any" 
                        className="form-control" 
                        value={formData.stopaj}
                        onChange={(e) => handleChange('stopaj', e.target.value)}
                        placeholder="0"
                      />
                      <span className="input-group-text">%</span>
                    </div>
                  </div>
                )}
                <div className="col-12 col-md-6 position-relative">
                  <label className="form-label">Sembol</label>
                  <div className="input-group">
                    <input 
                      type="text" 
                      className="form-control" 
                      value={formData.sembol}
                      onChange={(e) => handleSymbolInput(e.target.value)}
                      onFocus={() => setShowSymbolMenu(true)}
                      onBlur={() => setTimeout(() => setShowSymbolMenu(false), 150)}
                      placeholder="Örn: AAPL, NVDA"
                    />
                    {!mergedSymbols.includes((formData.sembol || '').trim().toUpperCase()) && (
                      <button className="btn btn-outline-primary" type="button" onMouseDown={(e) => e.preventDefault()} onClick={handleAddSymbol} aria-label="Yeni sembol ekle">
                        <i className="bi bi-plus"></i>
                      </button>
                    )}
                  </div>
                  {showSymbolMenu && filteredSymbols.length > 0 && (
                    <div 
                      className="card shadow-sm"
                      style={{ position: 'absolute', zIndex: 1100, width: '100%', top: '100%', left: 0 }}
                    >
                      <ul className="list-group list-group-flush">
                        {filteredSymbols.map(s => {
                          const symbolData = symbolsData.find(sd => (sd.name || sd.id) === s)
                          return (
                            <li key={s} className="list-group-item d-flex align-items-center justify-content-between" style={{ cursor: 'pointer' }} onMouseDown={(e) => e.preventDefault()}>
                              <span onClick={() => handleSelectSymbol(s)}>{s}</span>
                              {!defaultSymbols.includes(s) && (
                                <button 
                                  type="button"
                                  className="btn btn-sm btn-outline-danger"
                                  onClick={() => handleDeleteSymbol(symbolData?.id || s)}
                                  aria-label="Sembolü sil"
                                >
                                  <i className="bi bi-dash"></i>
                                </button>
                              )}
                            </li>
                          )
                        })}
                      </ul>
                    </div>
                  )}
                </div>
                <div className="col-12 col-md-6">
                  <label className="form-label">Durum</label>
                  <select className="form-select" value={formData.durum} onChange={(e) => handleChange('durum', e.target.value)}>
                    <option>Alış</option>
                    <option>Satış</option>
                    <option>Temettü</option>
                    <option>Stopaj Kesintisi</option>
                  </select>
                </div>
                <div className="col-12 col-md-6">
                  <label className="form-label">Birim</label>
                  <select className="form-select" value={formData.birim} onChange={(e) => handleChange('birim', e.target.value)}>
                    <option value="">Birim seçin</option>
                    <option>USD</option>
                    <option>EUR</option>
                    <option>₺</option>
                  </select>
                </div>
                <div className="col-12 col-md-6">
                  <label className="form-label">Adet</label>
                  <input type="number" step="any" className="form-control" value={formData.adet} onChange={(e) => handleChange('adet', e.target.value)} />
                </div>
                <div className="col-12 col-md-6">
                  <label className="form-label">Fiyat</label>
                  <div className="input-group">
                    <input type="text" inputMode="decimal" className="form-control" value={formData.fiyat} onChange={(e) => handleChange('fiyat', e.target.value)} placeholder={(formData.birim === 'TRY' || formData.birim === '₺') ? 'Örn: 36,07173' : 'e.g. 36.07173'} />
                    <span className="input-group-text">
                      {getCurrencySymbol(formData.birim)}
                    </span>
                  </div>
                </div>
                <div className="col-12 col-md-6">
                  <label className="form-label">Komisyon</label>
                  <div className="input-group">
                    <input type="text" inputMode="decimal" className="form-control" value={formData.komisyon} onChange={(e) => handleChange('komisyon', e.target.value)} placeholder={(formData.birim === 'TRY' || formData.birim === '₺') ? 'Örn: 0,25' : 'e.g. 0.25'} />
                    <span className="input-group-text">
                      {getCurrencySymbol(formData.birim)}
                    </span>
                  </div>
                </div>
                <div className="col-12 col-md-6">
                  <label className="form-label">Maaliyet</label>
                  <div className="input-group">
                    <input type="text" className="form-control" value={formatNumber(formData.maaliyet, formData.birim)} readOnly />
                    <span className="input-group-text">
                      {getCurrencySymbol(formData.birim)}
                    </span>
                  </div>
                </div>
                <div className="col-12 col-md-6">
                  <label className="form-label">Açıklama</label>
                  <input type="text" className="form-control" value={formData.aciklama} onChange={(e) => handleChange('aciklama', e.target.value)} />
                </div>
                <div className="col-12 col-md-6">
                  <label className="form-label">Tarih</label>
                  <input type="date" className="form-control" value={formData.tarih} onChange={(e) => handleChange('tarih', e.target.value)} />
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Import sheet */}
      {showImportSheet && (
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
          onClick={() => setShowImportSheet(false)}
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
                <i className="bi bi-upload me-2"></i>Excel Verilerini Import Et
              </h5>
              <div className="d-flex gap-2">
                <button className="btn btn-outline-secondary btn-sm" onClick={() => setShowImportSheet(false)}>
                  İptal
                </button>
                <button 
                  className="btn btn-success btn-sm" 
                  onClick={handleImportData}
                  disabled={!importData.portfolioName.trim() || !importData.excelData.trim()}
                >
                  Import Et
                </button>
              </div>
            </div>

            <div className="modal-body">
              <div className="row g-3">
                <div className="col-12">
                  <label className="form-label">Portföy Adı</label>
                  <input 
                    type="text" 
                    className="form-control" 
                    value={importData.portfolioName} 
                    onChange={(e) => setImportData(prev => ({ ...prev, portfolioName: e.target.value }))} 
                    placeholder="Örn: Import Edilen Portföy"
                    autoFocus
                  />
                </div>
                <div className="col-12">
                  <label className="form-label">Excel Verileri</label>
                  <textarea 
                    className="form-control" 
                    rows="8"
                    value={importData.excelData} 
                    onChange={(e) => setImportData(prev => ({ ...prev, excelData: e.target.value }))} 
                    placeholder="Excel'den kopyaladığınız verileri buraya yapıştırın..."
                    style={{ fontFamily: 'monospace', fontSize: '0.9rem' }}
                  />
                  <div className="form-text">
                    <strong>Beklenen format:</strong><br/>
                    Platform	Sembol Borsa	Sembol	Durum	Adet	Fiyat	Komisyon	Birim	Maaliyet	Açıklama	Tarih<br/>
                    İşbank	TEFAS	BGP	Satış	15084	4,574372₺	0,00₺	TRY	67.572,79₺	BGP TEFAS Yatırım Fonu Satışı	17.09.2025
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Sort options sheet */}
      {showSortSheet && (
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
          onClick={() => setShowSortSheet(false)}
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
              maxHeight: '50vh',
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
                <i className="bi bi-arrow-down-up me-2"></i>Sırala
              </h5>
              <button className="btn btn-outline-secondary btn-sm" onClick={() => setShowSortSheet(false)}>Kapat</button>
            </div>

            <div className="modal-body">
              <div className="list-group list-group-flush">
                <div className="list-group-item fw-semibold d-flex align-items-center justify-content-between">
                  <span>Hisse adına göre</span>
                  <div className="btn-group">
                    <button className="btn btn-sm btn-outline-secondary" onClick={async () => {
                      setSortOption('symbol_asc')
                      setShowSortSheet(false)
                      try { await saveUiPrefs({ portfolioSortOption: 'symbol_asc' }) } catch (_) {}
                    }}>A → Z</button>
                    <button className="btn btn-sm btn-outline-secondary" onClick={async () => {
                      setSortOption('symbol_desc')
                      setShowSortSheet(false)
                      try { await saveUiPrefs({ portfolioSortOption: 'symbol_desc' }) } catch (_) {}
                    }}>Z → A</button>
                  </div>
                </div>

                <div className="list-group-item fw-semibold d-flex align-items-center justify-content-between mt-2">
                  <span>Hisse türüne göre</span>
                  <div className="btn-group">
                    <button className="btn btn-sm btn-outline-secondary" onClick={async () => {
                      setSortOption('type_asc')
                      setShowSortSheet(false)
                      try { await saveUiPrefs({ portfolioSortOption: 'type_asc' }) } catch (_) {}
                    }}>A → Z</button>
                    <button className="btn btn-sm btn-outline-secondary" onClick={async () => {
                      setSortOption('type_desc')
                      setShowSortSheet(false)
                      try { await saveUiPrefs({ portfolioSortOption: 'type_desc' }) } catch (_) {}
                    }}>Z → A</button>
                  </div>
                </div>

                <div className="list-group-item fw-semibold d-flex align-items-center justify-content-between mt-2">
                  <span>Tarihe göre (son işlem)</span>
                  <div className="btn-group">
                    <button className="btn btn-sm btn-outline-secondary" onClick={async () => {
                      setSortOption('date_desc')
                      setShowSortSheet(false)
                      try { await saveUiPrefs({ portfolioSortOption: 'date_desc' }) } catch (_) {}
                    }}>Yeni → Eski</button>
                    <button className="btn btn-sm btn-outline-secondary" onClick={async () => {
                      setSortOption('date_asc')
                      setShowSortSheet(false)
                      try { await saveUiPrefs({ portfolioSortOption: 'date_asc' }) } catch (_) {}
                    }}>Eski → Yeni</button>
                  </div>
                </div>

                <div className="list-group-item fw-semibold d-flex align-items-center justify-content-between mt-2">
                  <span>Adete göre</span>
                  <div className="btn-group">
                    <button className="btn btn-sm btn-outline-secondary" onClick={async () => {
                      setSortOption('quantity_desc')
                      setShowSortSheet(false)
                      try { await saveUiPrefs({ portfolioSortOption: 'quantity_desc' }) } catch (_) {}
                    }}>9 → 0</button>
                    <button className="btn btn-sm btn-outline-secondary" onClick={async () => {
                      setSortOption('quantity_asc')
                      setShowSortSheet(false)
                      try { await saveUiPrefs({ portfolioSortOption: 'quantity_asc' }) } catch (_) {}
                    }}>0 → 9</button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Edit portfolio modal */}
      {showEditPortfolio && (
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
          onClick={() => setShowEditPortfolio(false)}
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
                <i className="bi bi-pencil-square me-2"></i>Portföyü Düzenle{editingPortfolio ? ` — ${editingPortfolio.name}` : ''}
              </h5>
              <div className="d-flex gap-2">
                <button className="btn btn-outline-secondary btn-sm" onClick={() => setShowEditPortfolio(false)}>
                  İptal
                </button>
                <button className="btn btn-primary btn-sm" onClick={handleSaveEditPortfolio}>
                  Kaydet
                </button>
              </div>
            </div>

            <div className="modal-body">
              <div className="row g-3">
                <div className="col-12">
                  <label className="form-label">Portföy adı</label>
                  <input 
                    type="text" 
                    className="form-control" 
                    value={editPortfolioData.name} 
                    onChange={(e) => setEditPortfolioData(prev => ({ ...prev, name: e.target.value }))} 
                    placeholder="Örn: Uzun Vade"
                  />
                </div>
                <div className="col-12 col-md-6">
                  <label className="form-label">Başlık</label>
                  <input 
                    type="text" 
                    className="form-control" 
                    value={editPortfolioData.title} 
                    onChange={(e) => setEditPortfolioData(prev => ({ ...prev, title: e.target.value }))} 
                    placeholder="Örn: 2025 Strateji"
                  />
                </div>
                <div className="col-12 col-md-6">
                  <label className="form-label">Tarih</label>
                  <input 
                    type="date" 
                    className="form-control" 
                    value={editPortfolioData.date} 
                    onChange={(e) => setEditPortfolioData(prev => ({ ...prev, date: e.target.value }))} 
                  />
                </div>
                <div className="col-12">
                  <label className="form-label">Açıklama</label>
                  <textarea 
                    className="form-control" 
                    rows="2"
                    value={editPortfolioData.description} 
                    onChange={(e) => setEditPortfolioData(prev => ({ ...prev, description: e.target.value }))} 
                    placeholder="Notlarınızı yazın..."
                  />
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default Portfoy


