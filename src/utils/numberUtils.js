export const parseNumberSafe = (val) => {
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

export const formatNumberByCurrency = (value, currency) => {
  const num = typeof value === 'number' ? value : parseNumberSafe(value)
  const isTry = currency === 'TRY' || currency === '₺'
  const locale = isTry ? 'tr-TR' : 'en-US'
  try {
    return new Intl.NumberFormat(locale, { maximumFractionDigits: 6 }).format(isNaN(num) ? 0 : num)
  } catch (_) {
    return String(isNaN(num) ? 0 : num)
  }
}

export const currencySymbol = (currency) => {
  switch (currency) {
    case 'USD': return '$'
    case 'EUR': return '€'
    case 'TRY': return '₺'
    case '₺': return '₺'
    default: return '...'
  }
}




