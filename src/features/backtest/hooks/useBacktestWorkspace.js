import { useEffect, useMemo, useState } from 'react'

import { apiFetch } from '../../../api/http'
import { API } from '../../../config/env'

function marketDateIso() {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date())

  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]))
  return `${values.year}-${values.month}-${values.day}`
}

function validateDateRange(startDate, endDate, maximumEndDate) {
  if (!startDate) return 'Start date is required.'
  if (startDate > maximumEndDate) return 'Start date cannot be later than today.'
  if (endDate && endDate > maximumEndDate) return 'End date cannot be later than today.'
  if (endDate && endDate < startDate) return 'End date cannot be earlier than start date.'
  return ''
}

export function useBacktestWorkspace() {
  const [form, setForm] = useState({ start_date: '', end_date: '' })
  const [job, setJob] = useState(null)
  const [results, setResults] = useState(null)
  const [selectedKey, setSelectedKey] = useState('')
  const [error, setError] = useState('')
  const [loadingResults, setLoadingResults] = useState(false)
  const [apiVersion, setApiVersion] = useState('…')

  const maximumEndDate = useMemo(() => marketDateIso(), [])
  const dateValidationError = useMemo(
    () => validateDateRange(form.start_date, form.end_date, maximumEndDate),
    [form.start_date, form.end_date, maximumEndDate],
  )

  const running = Boolean(job && ['queued', 'running'].includes(job.status))
  const selectedRun = useMemo(
    () => results?.runs?.find((run) => run.key === selectedKey) || results?.runs?.[0] || null,
    [results, selectedKey],
  )


  async function loadResults(jobId) {
    setLoadingResults(true)
    try {
      const payload = await apiFetch(`${API}/jobs/${jobId}/results`)
      setResults(payload)
      setSelectedKey((current) => current || payload.runs?.[0]?.key || '')
    } catch (requestError) {
      setError(requestError.message)
    } finally {
      setLoadingResults(false)
    }
  }

  useEffect(() => {
    async function bootstrap() {
      try {
        const health = await apiFetch(`${API}/health`)
        setApiVersion(health.api_version || 'unknown')
      } catch {
        setApiVersion('unavailable')
      }

      try {
        const latest = await apiFetch(`${API}/jobs/latest`)
        if (latest) {
          setJob(latest)
          if (latest.status === 'completed') await loadResults(latest.id)
        }
      } catch (requestError) {
        setError(requestError.message)
      }
    }
    bootstrap()
  }, [])

  useEffect(() => {
    if (!running || !job?.id) return undefined
    const timer = window.setInterval(async () => {
      try {
        const updated = await apiFetch(`${API}/jobs/${job.id}`)
        setJob(updated)
        if (updated.status === 'completed') {
          window.clearInterval(timer)
          await loadResults(updated.id)
        } else if (['failed', 'interrupted'].includes(updated.status)) {
          window.clearInterval(timer)
        }
      } catch (requestError) {
        setError(requestError.message)
      }
    }, 5000)
    return () => window.clearInterval(timer)
  }, [running, job?.id])

  function updateDate(field, value) {
    if (!['start_date', 'end_date'].includes(field)) return
    setError('')
    setForm((current) => ({ ...current, [field]: value }))
  }

  async function runBacktest() {
    setError('')
    if (dateValidationError) {
      setError(dateValidationError)
      return
    }

    setResults(null)
    try {
      const created = await apiFetch(`${API}/jobs`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          start_date: form.start_date,
          end_date: form.end_date || null,
        }),
      })
      setJob(created)
    } catch (requestError) {
      setError(requestError.message)
    }
  }

  const comparisonData = useMemo(
    () => (results?.comparison || []).map((row) => ({
      ...row,
      label: row.strategy_label || row.backend,
      modelLabel: row.model_family || row.backend,
      strategyPct: Number(row.strategy_return) * 100,
      buyHoldPct: Number(row.buy_hold_return) * 100,
      excessPct: Number(row.excess_return) * 100,
    })),
    [results],
  )

  const bestRun = useMemo(() => {
    if (!comparisonData.length) return null
    return [...comparisonData].sort((a, b) => b.excessPct - a.excessPct)[0]
  }, [comparisonData])

  const selectedMetrics = selectedRun?.metrics || {}

  return {
    form,
    job,
    results,
    selectedKey,
    setSelectedKey,
    error,
    setError,
    loadingResults,
    apiVersion,
    running,
    selectedRun,
    runBacktest,
    updateDate,
    maximumEndDate,
    dateValidationError,
    comparisonData,
    bestRun,
    selectedMetrics,
  }
}
