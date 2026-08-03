import { useCallback, useEffect, useState } from 'react'

import { apiFetch } from '../../../api/http'
import { API } from '../../../config/env'

export function useBacktestWorkspace() {
  const [job, setJob] = useState(null)
  const [detail, setDetail] = useState(null)
  const [dashboard, setDashboard] = useState(null)
  const [error, setError] = useState('')
  const [loadingDetail, setLoadingDetail] = useState(false)
  const [loadingDashboard, setLoadingDashboard] = useState(true)
  const [apiVersion, setApiVersion] = useState('…')

  const running = Boolean(job && ['queued', 'running'].includes(job.status))

  const refreshDashboard = useCallback(async () => {
    setLoadingDashboard(true)
    try {
      const payload = await apiFetch(`${API}/dashboard/summary?limit=12`)
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

  useEffect(() => {
    async function bootstrap() {
      try {
        const health = await apiFetch(`${API}/health`)
        setApiVersion(health.api_version || 'unknown')
      } catch {
        setApiVersion('unavailable')
      }

      const summary = await refreshDashboard()
      const latest = summary?.recent_backtests?.[0]
      if (latest) {
        setJob(latest)
        const completed = summary.recent_backtests.find((item) => item.status === 'completed')
        if (completed) await loadDetail(completed.id)
      }
    }
    bootstrap()
  }, [loadDetail, refreshDashboard])

  useEffect(() => {
    if (!running || !job?.id) return undefined
    const timer = window.setInterval(async () => {
      try {
        const updated = await apiFetch(`${API}/jobs/${job.id}`)
        setJob(updated)
        if (updated.status === 'completed') {
          window.clearInterval(timer)
          await loadDetail(updated.id)
          await refreshDashboard()
        } else if (['failed', 'interrupted'].includes(updated.status)) {
          window.clearInterval(timer)
          await refreshDashboard()
        }
      } catch (requestError) {
        setError(requestError.message)
      }
    }, 5000)
    return () => window.clearInterval(timer)
  }, [job?.id, loadDetail, refreshDashboard, running])

  async function runBacktest() {
    setError('')
    setDetail(null)
    try {
      const created = await apiFetch(`${API}/jobs`, { method: 'POST' })
      setJob(created)
      return created
    } catch (requestError) {
      setError(requestError.message)
      return null
    }
  }

  async function selectBacktest(jobId) {
    setError('')
    const summaryItem = dashboard?.recent_backtests?.find((item) => item.id === jobId)
    if (summaryItem) setJob(summaryItem)
    return loadDetail(jobId)
  }

  return {
    job,
    detail,
    dashboard,
    error,
    setError,
    apiVersion,
    running,
    loadingDetail,
    loadingDashboard,
    runBacktest,
    selectBacktest,
    refreshDashboard,
  }
}
