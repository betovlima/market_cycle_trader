export const FRONT_VERSION = '1.12.14'

const rawApiBaseUrl = import.meta.env.VITE_API_BASE_URL || ''
export const API_BASE_URL = rawApiBaseUrl.replace(/\/$/, '')
export const API = `${API_BASE_URL}/api`

export function apiDownloadUrl(path) {
  const value = String(path || '').trim()
  if (!value) return '#'
  if (/^https?:\/\//i.test(value)) return value

  const normalizedPath = value.startsWith('/') ? value : `/${value}`
  return API_BASE_URL ? `${API_BASE_URL}${normalizedPath}` : normalizedPath
}
