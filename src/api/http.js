export function formatApiErrorDetail(detail, fallback) {
  if (!detail) return fallback
  if (typeof detail === 'string') return detail
  if (Array.isArray(detail)) {
    const messages = detail.map((item) => {
      if (typeof item === 'string') return item
      if (!item || typeof item !== 'object') return String(item)
      const location = Array.isArray(item.loc)
        ? item.loc.filter((part) => part !== 'body').join('.')
        : ''
      const text = item.msg || item.message || JSON.stringify(item)
      return location ? `${location}: ${text}` : text
    })
    return messages.filter(Boolean).join(' | ') || fallback
  }
  if (typeof detail === 'object') {
    return detail.msg || detail.message || JSON.stringify(detail)
  }
  return String(detail)
}

export async function apiFetch(url, options) {
  const response = await fetch(url, options)
  if (!response.ok) {
    let message = `Request failed with status ${response.status}`
    try {
      const data = await response.json()
      message = formatApiErrorDetail(data.detail, message)
    } catch {
      // Keep the fallback message.
    }
    throw new Error(message)
  }
  if (response.status === 204) return null
  return response.json()
}
