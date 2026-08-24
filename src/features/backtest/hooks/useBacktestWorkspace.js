import { useCallback, useEffect, useState } from 'react'

import { apiFetch } from '../../../api/http'
import { API } from '../../../config/env'

const ACTIVE_JOB_STATUSES = new Set(['queued', 'running'])
const TERMINAL_FAILURE_STATUSES = new Set(['failed', 'interrupted'])

function jobMatchesStrategy(job, strategy) {
  if (!strategy?.id) return true
  if (String(job?.strategy_profile_id || '') !== String(strategy.id)) return false
  if (strategy.revision != null && Number(job?.strategy_profile_revision) !== Number(strategy.revision)) return false
  const expectedHash = String(strategy.configuration_hash || '').trim()
  if (expectedHash && String(job?.strategy_configuration_hash || '').trim() !== expectedHash) return false
  return true
}

function latestJobUrl(strategy, reusable = false) {
  const params = new URLSearchParams()
  if (strategy?.id) params.set('strategy_profile_id', String(strategy.id))
  if (strategy?.revision != null) params.set('strategy_profile_revision', String(strategy.revision))
  if (strategy?.configuration_hash) params.set('strategy_configuration_hash', String(strategy.configuration_hash))
  if (reusable) params.set('reusable', 'true')
  const query = params.toString()
  return `${API}/jobs/latest${query ? `?${query}` : ''}`
}

function isReusableJob(job, strategy, reuseCompleted) {
  if (!jobMatchesStrategy(job, strategy)) return false
  const status = String(job?.status || '').toLowerCase()
  return ACTIVE_JOB_STATUSES.has(status) || (reuseCompleted && status === 'completed')
}

function wait(ms) {
  return new Promise((resolve) => window.setTimeout(resolve, ms))
}

export function useBacktestWorkspace() {
  const [job, setJob] = useState(null)
  const [detail, setDetail] = useState(null)
  const [dashboard, setDashboard] = useState(null)
  const [error, setError] = useState('')
  const [loadingDetail, setLoadingDetail] = useState(false)
  const [loadingDashboard, setLoadingDashboard] = useState(true)
  const [restoringExecution, setRestoringExecution] = useState(true)
  const [startingBacktest, setStartingBacktest] = useState(false)
  const [apiVersion, setApiVersion] = useState('…')

  const running = Boolean(job && ACTIVE_JOB_STATUSES.has(job.status))
  const startDisabled = restoringExecution || startingBacktest || running

  const refreshDashboard = useCallback(async () => {
    setLoadingDashboard(true)
    try {
      const payload = await apiFetch(`${API}/dashboard/summary?limit=50`)
      setDashboard(payload)
      return payload
    } catch (requestError) {
      setError(requestError.message)
      return null
    } finally {
      setLoadingDashboard(false)
    }
  }, [])

  const loadDetail = useCallback(async (jobId) => {
    if (!jobId) return null
    setLoadingDetail(true)
    try {
      const payload = await apiFetch(`${API}/dashboard/jobs/${jobId}`)
      setDetail(payload)
      setJob((current) => current?.id === jobId ? { ...current, ...payload } : payload)
      return payload
    } catch (requestError) {
      setError(requestError.message)
      return null
    } finally {
      setLoadingDetail(false)
    }
  }, [])

  const loadLatestJob = useCallback(async ({ strategy = null, reusable = false, quiet = false } = {}) => {
    try {
      return await apiFetch(latestJobUrl(strategy, reusable))
    } catch (requestError) {
      if (!quiet && !String(requestError.message || '').includes('404')) {
        setError(requestError.message)
      }
      return null
    }
  }, [])

  useEffect(() => {
    let cancelled = false

    async function bootstrap() {
      setRestoringExecution(true)
      try {
        try {
          const health = await apiFetch(`${API}/health`)
          if (!cancelled) setApiVersion(health.api_version || 'unknown')
        } catch {
          if (!cancelled) setApiVersion('unavailable')
        }

        const [summary, latestJob] = await Promise.all([
          refreshDashboard(),
          loadLatestJob(),
        ])
        if (cancelled) return

        const latest = latestJob || summary?.recent_backtests?.[0] || null
        if (!latest) return

        setJob(latest)
        if (latest.status === 'completed') {
          await loadDetail(latest.id)
        } else if (!ACTIVE_JOB_STATUSES.has(latest.status)) {
          const completed = summary?.recent_backtests?.find((item) => item.status === 'completed')
          if (completed) await loadDetail(completed.id)
        }
      } finally {
        if (!cancelled) setRestoringExecution(false)
      }
    }

    bootstrap()
    return () => {
      cancelled = true
    }
  }, [loadDetail, loadLatestJob, refreshDashboard])

  useEffect(() => {
    if (!running || !job?.id) return undefined

    let cancelled = false
    let timerId = null

    async function poll() {
      try {
        const updated = await apiFetch(`${API}/jobs/${job.id}`)
        if (cancelled) return
        setJob(updated)

        if (updated.status === 'completed') {
          await loadDetail(updated.id)
          await refreshDashboard()
          return
        }

        if (TERMINAL_FAILURE_STATUSES.has(updated.status)) {
          await refreshDashboard()
          return
        }

        timerId = window.setTimeout(poll, 3000)
      } catch (requestError) {
        if (!cancelled) {
          setError(requestError.message)
          timerId = window.setTimeout(poll, 5000)
        }
      }
    }

    poll()
    return () => {
      cancelled = true
      if (timerId) window.clearTimeout(timerId)
    }
  }, [job?.id, loadDetail, refreshDashboard, running])

  async function runBacktest({ strategy = null, reuseCompleted = false, allowCreate = true, throwOnError = false } = {}) {
    if (restoringExecution || startingBacktest) {
      const unavailable = new Error(restoringExecution ? 'Backtest workspace is still restoring.' : 'A Backtest start request is already in progress.')
      setError(unavailable.message)
      if (throwOnError) throw unavailable
      return null
    }

    setError('')
    setDetail(null)
    setStartingBacktest(true)
    try {
      const latest = await loadLatestJob({ strategy, reusable: reuseCompleted, quiet: true })
      const latestStatus = String(latest?.status || '').toLowerCase()
      if (latest && isReusableJob(latest, strategy, reuseCompleted)) {
        setJob(latest)
        if (latestStatus === 'completed') await loadDetail(latest.id)
        return latest
      }

      if (!allowCreate) throw new Error('A compatible completed reference Backtest is required for this Strategy.')

      const created = await apiFetch(`${API}/jobs`, { method: 'POST' })
      setJob(created)
      return created
    } catch (requestError) {
      let recovered = null
      for (const delayMs of [0, 400, 1000]) {
        if (delayMs) await wait(delayMs)
        recovered = await loadLatestJob({ strategy, reusable: reuseCompleted, quiet: true })
        if (recovered && isReusableJob(recovered, strategy, reuseCompleted)) break
        recovered = null
      }
      if (recovered) {
        const recoveredStatus = String(recovered.status || '').toLowerCase()
        setError('')
        setJob(recovered)
        if (recoveredStatus === 'completed') await loadDetail(recovered.id)
        return recovered
      }

      setError(requestError.message)
      if (throwOnError) throw requestError
      return null
    } finally {
      setStartingBacktest(false)
    }
  }

  return {
    job,
    detail,
    dashboard,
    error,
    setError,
    apiVersion,
    running,
    restoringExecution,
    startingBacktest,
    startDisabled,
    loadingDetail,
    loadingDashboard,
    runBacktest,
    refreshDashboard,
  }
}
