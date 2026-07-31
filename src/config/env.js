export const FRONT_VERSION = '1.10.3'

const rawApiBaseUrl = import.meta.env.VITE_API_BASE_URL || ''
export const API_BASE_URL = rawApiBaseUrl.replace(/\/$/, '')
export const API = `${API_BASE_URL}/api`

