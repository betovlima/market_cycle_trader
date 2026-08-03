export function percent(value, digits = 2) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return '—'
  return `${(Number(value) * 100).toFixed(digits)}%`
}

export function money(value) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return '—'
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 2,
  }).format(Number(value))
}

export function number(value, digits = 2) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return '—'
  return Number(value).toFixed(digits)
}

function parseDate(value) {
  if (!value) return null
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value

  const raw = String(value).trim()
  const normalized = /^\d{4}-\d{2}-\d{2}$/.test(raw) ? `${raw}T00:00:00Z` : raw
  const date = new Date(normalized)
  return Number.isNaN(date.getTime()) ? null : date
}

export function compactDate(value) {
  const date = parseDate(value)
  if (!date) return ''
  return date.toLocaleDateString('en-US', { month: 'short', year: '2-digit', timeZone: 'UTC' })
}

export function tradeDate(value) {
  if (!value) return '—'
  const raw = String(value).trim()
  if (/^\d{4}-\d{2}-\d{2}/.test(raw)) return raw.slice(0, 10)
  const date = parseDate(value)
  return date ? date.toISOString().slice(0, 10) : '—'
}


export function shortDateTime(value) {
  const date = parseDate(value)
  if (!date) return '—'
  return date.toLocaleString('en-US', {
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hour12: false,
  })
}

export function shortDate(value) {
  const date = parseDate(value)
  if (!date) return '—'
  return date.toLocaleDateString('en-US', { month: 'short', day: '2-digit', timeZone: 'UTC' })
}

export function durationLabel(seconds) {
  const value = Number(seconds)
  if (!Number.isFinite(value) || value < 0) return '—'
  if (value < 60) return `${Math.round(value)} sec`
  if (value < 3600) return `${Math.floor(value / 60)}m ${Math.round(value % 60)}s`
  const hours = Math.floor(value / 3600)
  const minutes = Math.round((value % 3600) / 60)
  return `${hours}h ${minutes}m`
}

export function relativeTime(value) {
  const date = parseDate(value)
  if (!date) return '—'
  const seconds = Math.round((Date.now() - date.getTime()) / 1000)
  const absolute = Math.abs(seconds)
  if (absolute < 60) return 'just now'
  if (absolute < 3600) return `${Math.round(absolute / 60)} minutes ago`
  if (absolute < 86400) return `${Math.round(absolute / 3600)} hours ago`
  const days = Math.round(absolute / 86400)
  return `${days} day${days === 1 ? '' : 's'} ago`
}
