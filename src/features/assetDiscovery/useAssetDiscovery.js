import { useCallback, useEffect, useRef, useState } from 'react'

import { ApiError, apiFetch, downloadFile } from '../../api/http'
import { API, FRONT_VERSION } from '../../config/env'
import { tr } from '../../i18n/runtime'
import { useAssetDiscoveryAutoEconomicReplay } from './useAssetDiscoveryAutoEconomicReplay'

const ACTIVE_STATUSES = new Set(['queued', 'running', 'stopping'])

export function useAssetDiscovery({ onSessionExpired }) {
  const [status, setStatus] = useState(null)
  const [catalog, setCatalog] = useState({ count: 0, assets: [] })
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState('')
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [createError, setCreateError] = useState('')
  const [validationError, setValidationError] = useState('')
  const [updatedResearchStrategy, setUpdatedResearchStrategy] = useState(null)
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
  const validationStatus = String(campaign?.full_strategy_validation?.status || '').toLowerCase()
  const active = ACTIVE_STATUSES.has(String(campaign?.status || '').toLowerCase()) || ['queued', 'running'].includes(validationStatus)

  useEffect(() => {
    const interval = window.setInterval(() => load({ silent: true }), active ? 2500 : 30000)
    return () => window.clearInterval(interval)
  }, [active, load])

  const runMarginalReplay = useCallback(async () => {
    setBusy('marginal-replay')
    setError('')
    setNotice('')
    try {
      const response = await apiFetch(`${API}/asset-discovery/marginal-replay`, { method: 'POST' })
      if (mountedRef.current && response) setStatus(response)
      setNotice(tr('Optional Marginal Capital Replay started for the current predictive shortlist.'))
      await load({ silent: true })
      return response
    } catch (requestError) {
      handleError(requestError)
      return null
    } finally {
      if (mountedRef.current) setBusy('')
    }
  }, [handleError, load])

  const autoEconomicReplay = useAssetDiscoveryAutoEconomicReplay({ campaign, runMarginalReplay })

  const start = useCallback(async (researchSize) => {
    setBusy('start')
    setError('')
    setNotice('')
    try {
      const response = await apiFetch(`${API}/asset-discovery/start`, {
        method: 'POST',
        body: { research_size: Number(researchSize) },
      })
      if (mountedRef.current && response) setStatus(response)
      autoEconomicReplay.markRequestedRun(response?.campaign?.run_id)
      setNotice(tr('Predictive Asset Discovery started.'))
      await load({ silent: true })
      return response
    } catch (requestError) {
      handleError(requestError)
      return null
    } finally {
      if (mountedRef.current) setBusy('')
    }
  }, [autoEconomicReplay, handleError, load])

  const stop = useCallback(async () => {
    setBusy('stop')
    setError('')
    setNotice('')
    try {
      const response = await apiFetch(`${API}/asset-discovery/stop`, { method: 'POST' })
      if (mountedRef.current && response) setStatus(response)
      setNotice(tr('Stop requested. Active processing is being cancelled and no new batch will start.'))
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

  const validateSelection = useCallback(async (runId, symbols) => {
    if (!Array.isArray(symbols) || !symbols.length) return null
    setBusy('full-strategy-validation')
    setError('')
    setNotice('')
    setValidationError('')
    setUpdatedResearchStrategy(null)
    try {
      const response = await apiFetch(`${API}/asset-discovery/full-strategy-validation`, {
        method: 'POST',
        body: { run_id: runId || null, symbols },
      })
      if (mountedRef.current && response) setStatus(response)
      setNotice(tr('Historical impact validation started for the selected assets.'))
      await load({ silent: true })
      return response
    } catch (requestError) {
      const message = tr(requestError?.message || 'Unable to start historical impact validation.')
      setValidationError(message)
      if (requestError instanceof ApiError && requestError.status === 401) handleError(requestError)
      return null
    } finally {
      if (mountedRef.current) setBusy('')
    }
  }, [handleError, load])

  const appendToResearchStrategy = useCallback(async (runId, symbols) => {
    if (!Array.isArray(symbols) || !symbols.length) return null
    setBusy('append-to-research-strategy')
    setError('')
    setNotice('')
    setCreateError('')
    setUpdatedResearchStrategy(null)
    try {
      const response = await apiFetch(`${API}/asset-discovery/append-to-research-strategy`, {
        method: 'POST',
        body: { run_id: runId || null, symbols },
      })
      const sequence = response?.research_strategy?.strategy_sequence
      const added = response?.added_assets?.length || 0
      const total = response?.asset_count_after
      setNotice(sequence
        ? tr('{count} selected assets added to Strategy #{sequence}. Total assets: {total}.', { count: added, sequence, total: total ?? '—' })
        : tr('Selected assets added to the Strategy.'))
      setUpdatedResearchStrategy(response)
      await load({ silent: true })
      return response
    } catch (requestError) {
      const message = tr(requestError?.message || 'Unable to add selected assets to the Strategy.')
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
    validationError,
    updatedResearchStrategy,
    load,
    start,
    runMarginalReplay,
    validateSelection,
    stop,
    exportAnalysis,
    appendToResearchStrategy,
  }
}
