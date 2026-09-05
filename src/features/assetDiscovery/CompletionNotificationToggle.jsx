import { useCallback, useEffect, useRef, useState } from 'react'

import { apiFetch } from '../../api/http'
import { API } from '../../config/env'
import { tr } from '../../i18n/runtime'

const STORAGE_KEY = 'mct.assetDiscovery.notifyOnCompletion'
const ACTIVE_STATUSES = new Set(['queued', 'running', 'stopping'])
const TERMINAL_STATUSES = new Set(['completed', 'failed', 'stopped', 'interrupted'])

let completionAudioContext = null

function initialPreference() {
  try {
    return window.localStorage.getItem(STORAGE_KEY) === 'true'
  } catch {
    return false
  }
}

function browserNotificationPermission() {
  if (typeof window === 'undefined' || !('Notification' in window)) return 'unsupported'
  return window.Notification.permission
}

function getAudioContext() {
  if (completionAudioContext) return completionAudioContext
  if (typeof window === 'undefined') return null
  const AudioContextCtor = window.AudioContext || window.webkitAudioContext
  if (!AudioContextCtor) return null
  completionAudioContext = new AudioContextCtor()
  return completionAudioContext
}

async function primeCompletionSound() {
  const context = getAudioContext()
  if (!context || context.state !== 'suspended') return
  try {
    await context.resume()
  } catch {
    return undefined
  }
}

function playCompletionSound() {
  const context = getAudioContext()
  if (!context) return

  const play = () => {
    try {
      const now = context.currentTime
      const gain = context.createGain()
      gain.gain.setValueAtTime(0.0001, now)
      gain.gain.exponentialRampToValueAtTime(0.16, now + 0.02)
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.62)
      gain.connect(context.destination)

      const first = context.createOscillator()
      first.type = 'sine'
      first.frequency.setValueAtTime(740, now)
      first.connect(gain)
      first.start(now)
      first.stop(now + 0.25)

      const second = context.createOscillator()
      second.type = 'sine'
      second.frequency.setValueAtTime(988, now + 0.30)
      second.connect(gain)
      second.start(now + 0.30)
      second.stop(now + 0.62)
    } catch {
      return undefined
    }
  }

  if (context.state === 'suspended') {
    context.resume().then(play).catch(() => undefined)
    return
  }
  play()
}

function notificationBody(status) {
  if (status === 'failed') return tr('Asset Discovery processing failed.')
  if (status === 'stopped' || status === 'interrupted') return tr('Asset Discovery processing stopped.')
  return tr('Asset Discovery processing completed.')
}

function showBrowserNotification(status, runId) {
  if (typeof window === 'undefined' || !('Notification' in window) || window.Notification.permission !== 'granted') return
  try {
    const notification = new window.Notification('Market Cycle Trader', {
      body: notificationBody(status),
      tag: `mct-asset-discovery-${runId || 'current'}`,
    })
    notification.onclick = () => {
      window.focus()
      notification.close()
    }
  } catch {
    return undefined
  }
}

export function CompletionNotificationToggle() {
  const [enabled, setEnabled] = useState(initialPreference)
  const [permission, setPermission] = useState(browserNotificationPermission)
  const previousRef = useRef({ runId: '', status: '' })
  const requestInFlightRef = useRef(false)

  const checkStatus = useCallback(async () => {
    if (requestInFlightRef.current) return
    requestInFlightRef.current = true
    try {
      const response = await apiFetch(`${API}/asset-discovery/status`)
      const campaign = response?.campaign || null
      const runId = String(campaign?.run_id || '')
      const status = String(campaign?.status || '').toLowerCase()
      const previous = previousRef.current
      const sameRun = Boolean(runId) && runId === previous.runId
      const justFinished = sameRun && ACTIVE_STATUSES.has(previous.status) && TERMINAL_STATUSES.has(status)

      if (enabled && justFinished) {
        playCompletionSound()
        showBrowserNotification(status, runId)
      }

      previousRef.current = { runId, status }
    } catch {
      return undefined
    } finally {
      requestInFlightRef.current = false
    }
  }, [enabled])

  useEffect(() => {
    checkStatus()
    if (!enabled) return undefined
    const interval = window.setInterval(checkStatus, 5000)
    return () => window.clearInterval(interval)
  }, [checkStatus, enabled])

  const toggle = async (event) => {
    const next = event.target.checked
    setEnabled(next)
    try {
      window.localStorage.setItem(STORAGE_KEY, next ? 'true' : 'false')
    } catch {
      // The preference can remain in memory when browser storage is unavailable.
    }

    if (!next) return
    await primeCompletionSound()
    if (typeof window === 'undefined' || !('Notification' in window)) {
      setPermission('unsupported')
      return
    }
    if (window.Notification.permission === 'default') {
      try {
        const result = await window.Notification.requestPermission()
        setPermission(result)
      } catch {
        setPermission(window.Notification.permission)
      }
      return
    }
    setPermission(window.Notification.permission)
  }

  return <div className="asset-discovery-completion-notifier">
    <label className="asset-discovery-select-asset">
      <input type="checkbox" checked={enabled} onChange={toggle} />
      <span>{tr('Notify me when processing finishes')}</span>
    </label>
    <small>{tr('Plays a sound and shows a browser notification while this tab remains open.')}</small>
    {enabled && permission === 'denied'
      ? <small>{tr('Browser notifications are blocked; the completion sound remains enabled.')}</small>
      : null}
  </div>
}
