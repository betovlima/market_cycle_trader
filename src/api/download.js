import { formatApiErrorDetail } from './http'
import { apiDownloadUrl } from '../config/env'

function filenameFromDisposition(value, fallbackFilename) {
  const disposition = String(value || '')
  const utf8Match = disposition.match(/filename\*=UTF-8''([^;]+)/i)
  if (utf8Match?.[1]) {
    try {
      return decodeURIComponent(utf8Match[1].replace(/["']/g, ''))
    } catch {
      return utf8Match[1].replace(/["']/g, '')
    }
  }

  const basicMatch = disposition.match(/filename="?([^";]+)"?/i)
  return basicMatch?.[1]?.trim() || fallbackFilename
}

async function responseErrorMessage(response) {
  const fallback = `Export failed with status ${response.status}`
  const contentType = String(response.headers.get('content-type') || '').toLowerCase()

  try {
    if (contentType.includes('application/json')) {
      const payload = await response.json()
      return formatApiErrorDetail(payload?.detail, fallback)
    }

    const text = (await response.text()).trim()
    if (text) return text.slice(0, 500)
  } catch {
  }

  return fallback
}

export async function downloadApiFile(path, fallbackFilename = 'market-cycle-trader-export') {
  const url = apiDownloadUrl(path)
  if (!url || url === '#') {
    throw new Error('The export URL is not available for this result.')
  }

  const response = await fetch(url, {
    method: 'GET',
    headers: {
      Accept: 'application/zip,text/csv,application/octet-stream,*/*',
    },
  })

  if (!response.ok) {
    throw new Error(await responseErrorMessage(response))
  }

  const blob = await response.blob()
  if (!blob.size) {
    throw new Error('The API returned an empty export file.')
  }

  const filename = filenameFromDisposition(
    response.headers.get('content-disposition'),
    fallbackFilename,
  )
  const objectUrl = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = objectUrl
  link.download = filename
  link.style.display = 'none'
  document.body.appendChild(link)
  link.click()
  link.remove()
  window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1000)
}
