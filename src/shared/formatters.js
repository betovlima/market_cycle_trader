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

export function rotationModelLabel(model) {
  if (model === 'xgboost_utility') return 'XGBoost Utility'
  if (model === 'qrdqn') return 'QR-DQN'
  return String(model || 'Unknown model')
}

export function compactDate(value) {
  if (!value) return ''
  const date = new Date(`${value}T00:00:00Z`)
  return date.toLocaleDateString('en-US', { month: 'short', year: '2-digit' })
}
