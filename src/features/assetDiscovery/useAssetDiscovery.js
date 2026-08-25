import { useCallback, useEffect, useRef, useState } from 'react'

import { ApiError, apiFetch, downloadFile } from '../../api/http'
import { API, FRONT_VERSION } from '../../config/env'
import { tr } from '../../i18n/runtime'

const ACTIVE_STATUSES = new Set(['queued', 'running', 'stopping'])

export function useAssetDiscovery({ onSessionExpired }) {
  const [status, setStatus] = useState(null)
  const [catalog, setCatalog] = useState({ count: 0, assets: [] })
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState('')
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [createError, setCreateError] = useState('')
  const [createdStrategy, setCreatedStrategy] = useState(null)
  const mountedRef = useRef(true)

  const handleError = useCallback((requestError) => {
    if (requestError instanceof ApiError && requestError.status === 401) {
      onSessionExpired?.()
      return
    }
    if (mountedRef.current) setError(tr(requestError?.message || 'Unable to load Asset Discovery.'))
  }, [onSessionExpired])

  const load = useCallback(async ({ silent = false } = {}) => {
    if (!silent) setLoading(true)
    try {
      const [statusResponse, catalogResponse] = await Promise.all([
        apiFetch(`${API}/asset-discovery/status`),
        apiFetch(`${API}/asset-discovery/catalog`),
      ])
      if (!mountedRef.current) return
      setStatus(statusResponse)
      setCatalog(catalogResponse || { count: 0, assets: [] })
      setError('')
    } catch (requestError) {
      handleError(requestError)
    } finally {
      if (mountedRef.current && !silent) setLoading(false)
    }
  }, [handleError])

  useEffect(() => {
    mountedRef.current = true
    load()
    return () => { mountedRef.current = false }
  }, [load])

  const campaign = status?.campaign || null
  const active = ACTIVE_STATUSES.has(String(campaign?.status || '').toLowerCase())

  useEffect(() => {
    const interval = window.setInterval(() => load({ silent: true }), active ? 2500 : 30000)
    return () => window.clearInterval(interval)
  }, [active, load])

  const start = useCallback(async (researchSize) => {
    setBusy('start')
    setError('')
    setNotice('')
    try {
      await apiFetch(`${API}/asset-discovery/start`, {
        method: 'POST',
        body: { research_size: Number(researchSize) },
      })
      setNotice(tr('Asset Discovery research started.'))
      await load({ silent: true })
    } catch (requestError) {
      handleError(requestError)
    } finally {
      if (mountedRef.current) setBusy('')
    }
  }, [handleError, load])

  const runMarginalReplay = useCallback(async () => {
    setBusy('marginal-replay')
    setError('')
    setNotice('')
    try {
      await apiFetch(`${API}/asset-discovery/marginal-replay`, { method: 'POST' })
      setNotice(tr('Marginal Capital Replay started for the current shortlist.'))
      await load({ silent: true })
    } catch (requestError) {
      handleError(requestError)
    } finally {
      if (mountedRef.current) setBusy('')
    }
  }, [handleError, load])

  const stop = useCallback(async () => {
    setBusy('stop')
    setError('')
    setNotice('')
    try {
      await apiFetch(`${API}/asset-discovery/stop`, { method: 'POST' })
      setNotice(tr('Stop requested. The current batch will finish safely.'))
      await load({ silent: true })
    } catch (requestError) {
      handleError(requestError)
    } finally {
      if (mountedRef.current) setBusy('')
    }
  }, [handleError, load])

  const exportAnalysis = useCallback(async () => {
    setBusy('export')
    setError('')
    setNotice('')
    try {
      const fallback = `asset_discovery_ranker_${new Date().toISOString().replace(/[-:]/g, '').slice(0, 15)}Z.json`
      await downloadFile(`${API}/asset-discovery/export?front_version=${encodeURIComponent(FRONT_VERSION)}`, fallback)
      setNotice(tr('Asset Discovery analysis exported.'))
    } catch (requestError) {
      handleError(requestError)
    } finally {
      if (mountedRef.current) setBusy('')
    }
  }, [handleError])

  const createStrategy = useCallback(async (runId, symbols) => {
    if (!Array.isArray(symbols) || !symbols.length) return null
    setBusy('create-strategy')
    setError('')
    setNotice('')
    setCreateError('')
    setCreatedStrategy(null)
    try {
      const response = await apiFetch(`${API}/asset-discovery/create-strategy`, {
        method: 'POST',
        body: { run_id: runId || null, symbols },
      })
      const sequence = response?.strategy?.strategy_sequence
      const count = response?.selected_assets?.length || 0
      const discarded = Array.isArray(response?.discarded_assets)
        ? response.discarded_assets.map((item) => item?.symbol).filter(Boolean)
        : []
      setNotice(sequence
        ? (discarded.length
          ? tr('Strategy #{sequence} created with {count} selected assets. Discarded: {discarded}.', { sequence, count, discarded: discarded.join(', ') })
          : tr('Strategy #{sequence} created with {count} selected assets.', { sequence, count }))
        : tr('Research Strategy created.'))
      setCreatedStrategy(response)
      await load({ silent: true })
      return response
    } catch (requestError) {
      const message = tr(requestError?.message || 'Unable to create Research Strategy.')
      setCreateError(message)
      handleError(requestError)
      return null
    } finally {
      if (mountedRef.current) setBusy('')
    }
  }, [handleError, load])

  return {
    status,
    catalog,
    campaign,
    active,
    loading,
    busy,
    error,
    notice,
    createError,
    createdStrategy,
    load,
    start,
    runMarginalReplay,
    stop,
    exportAnalysis,
    createStrategy,
  }
}
