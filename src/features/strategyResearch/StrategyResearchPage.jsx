import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import { ApiError, apiFetch, downloadFile } from '../../api/http'
import { hasCapability } from '../../auth/capabilities'
import { API } from '../../config/env'
import { tr } from '../../i18n/runtime'
import { AnalyticsIcon, PlayIcon } from '../../shared/components/Icons'
import { StrategyResearchPipeline, STRATEGY_RESEARCH_STAGES } from './StrategyResearchPipeline'
import { StrategyResearchVisuals } from './StrategyResearchVisuals'
import './strategyResearch.css'

const ACTIVE_TEMPORAL = new Set(['queued', 'running', 'stop_requested'])
const ACTIVE_JOB = new Set(['queued', 'running'])
const FAILED = new Set(['failed', 'interrupted', 'cancelled'])
const ACTIVE_PIPELINE = new Set(['running', 'pause_requested', 'stop_requested'])
const RESUMABLE_PIPELINE = new Set(['paused', 'failed'])
const RESTORE_TIMEOUT_MS = 20_000

async function apiFetchTimed(url, options = {}, timeoutMs = RESTORE_TIMEOUT_MS) {
  const controller = new AbortController()
  const timer = window.setTimeout(() => controller.abort(), timeoutMs)
  try {
    return await apiFetch(url, { ...options, signal: controller.signal })
  } catch (requestError) {
    if (requestError?.name === 'AbortError') throw new Error('Strategy Research restore request timed out.')
    throw requestError
  } finally {
    window.clearTimeout(timer)
  }
}

function currentMonth() {
  const date = new Date()
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
}

function monthValue(value, fallback = '') {
  const text = String(value || '')
  return /^\d{4}-\d{2}/.test(text) ? text.slice(0, 7) : fallback
}

function validPeriod(start, end) {
  return /^\d{4}-\d{2}$/.test(start || '') && /^\d{4}-\d{2}$/.test(end || '') && start <= end
}

function wait(ms) {
  return new Promise((resolve) => window.setTimeout(resolve, ms))
}

function defaultStageState() {
  return Object.fromEntries(STRATEGY_RESEARCH_STAGES.map((stage) => [stage.id, 'waiting']))
}

function strategyNeedsReferenceBacktest(strategy) {
  return String(strategy?.strategy_kind || 'standard') === 'standard'
}

function runMatchesStrategy(run, strategy) {
  if (!run?.id || !strategy?.id) return false
  if (String(run.strategy_profile_id || '') !== String(strategy.id)) return false
  if (run.strategy_profile_revision != null && strategy.revision != null && Number(run.strategy_profile_revision) !== Number(strategy.revision)) return false
  const runHash = String(run.strategy_configuration_hash || '').trim()
  const strategyHash = String(strategy.configuration_hash || '').trim()
  return !runHash || !strategyHash || runHash === strategyHash
}

function strategyTypeLabel(strategy, run) {
  const variant = String(strategy?.temporal_strategy_variant || run?.temporal_strategy_variant || '').trim()
  const kind = String(strategy?.strategy_kind || run?.strategy_kind || 'standard').trim()
  if (variant === 'winner_transition_stateful') return tr('Conservative Decision Policy')
  if (kind === 'temporal_intelligence') return tr('Temporal Intelligence Strategy')
  if (kind === 'standard') return tr('Standard Strategy')
  return String(variant || kind || '—').replaceAll('_', ' ')
}

export function StrategyResearchPage({ workspace, capabilities = {}, onSessionExpired }) {
  const canRun = hasCapability(capabilities, 'temporal_intelligence.start')
  const canStop = hasCapability(capabilities, 'temporal_intelligence.stop')
  const canExport = hasCapability(capabilities, 'temporal_intelligence.export')
  const canMaterialize = hasCapability(capabilities, 'temporal_intelligence.materialize_strategy')
  const canStartBacktest = hasCapability(capabilities, 'backtest.start')
  const [control, setControl] = useState(null)
  const [run, setRun] = useState(null)
  const [blockingRun, setBlockingRun] = useState(null)
  const [analytics, setAnalytics] = useState(null)
  const [risk, setRisk] = useState(null)
  const [intervention, setIntervention] = useState(null)
  const [confidence, setConfidence] = useState(null)
  const [stateful, setStateful] = useState(null)
  const [selectedStage, setSelectedStage] = useState('reference')
  const [stageState, setStageState] = useState(defaultStageState)
  const [startMonth, setStartMonth] = useState('2020-01')
  const [endMonth, setEndMonth] = useState(currentMonth)
  const [running, setRunning] = useState(false)
  const [pausing, setPausing] = useState(false)
  const [stopping, setStopping] = useState(false)
  const [restarting, setRestarting] = useState(false)
  const [pipelineControl, setPipelineControl] = useState(null)
  const [loading, setLoading] = useState(true)
  const [exporting, setExporting] = useState(false)
  const [materializing, setMaterializing] = useState(false)
  const [notice, setNotice] = useState('')
  const [error, setError] = useState('')
  const pauseRequestedRef = useRef(false)
  const stopRequestedRef = useRef(false)
  const activeTemporalRunRef = useRef(null)
  const activeStageRef = useRef(null)

  const strategy = control?.strategy_research_strategy || control?.research_strategy || null
  const temporalActive = ACTIVE_TEMPORAL.has(String(run?.status || '').toLowerCase())
  const blockingTemporalActive = ACTIVE_TEMPORAL.has(String(blockingRun?.status || '').toLowerCase())
  const pipelineStatus = String(pipelineControl?.status || run?.strategy_research_pipeline?.status || 'idle').toLowerCase()
  const persistedPipelineActive = ACTIVE_PIPELINE.has(pipelineStatus)
  const persistedPipelineResumable = RESUMABLE_PIPELINE.has(pipelineStatus)
  const pipelineProgress = useMemo(() => {
    const completed = STRATEGY_RESEARCH_STAGES.filter((stage) => ['completed', 'skipped'].includes(stageState[stage.id])).length
    let partial = 0
    const runningStage = STRATEGY_RESEARCH_STAGES.find((stage) => stageState[stage.id] === 'running')
    if (runningStage?.id === 'temporal') {
      const temporalProgress = Number(run?.progress)
      if (Number.isFinite(temporalProgress)) partial = Math.max(0, Math.min(100, temporalProgress)) / 100
    }
    return Math.round(((completed + partial) / STRATEGY_RESEARCH_STAGES.length) * 100)
  }, [run?.progress, stageState])

  const currentStage = useMemo(() => STRATEGY_RESEARCH_STAGES.find((stage) => stageState[stage.id] === 'running') || null, [stageState])

  const handleError = useCallback((requestError) => {
    if (requestError instanceof ApiError && requestError.status === 401) {
      onSessionExpired?.()
      return
    }
    if (requestError?.status === 403) return
    setError(tr(requestError?.message || 'Unable to load Strategy Research.'))
  }, [onSessionExpired])

  const applyPipelineControl = useCallback((value, { selectCurrent = true } = {}) => {
    if (!value || typeof value !== 'object') return
    setPipelineControl(value)
    if (value.stage_states && typeof value.stage_states === 'object') {
      setStageState((current) => ({ ...current, ...value.stage_states }))
    }
    if (selectCurrent && value.current_stage) setSelectedStage(value.current_stage)
    const status = String(value.status || '').toLowerCase()
    if (!ACTIVE_PIPELINE.has(status)) {
      setPausing(false)
      setStopping(false)
    }
  }, [])

  const pipelineControlAction = useCallback(async (runId, payload) => {
    if (!runId) return null
    const value = await apiFetch(`${API}/temporal-intelligence/${encodeURIComponent(runId)}/strategy-research/pipeline/control`, { method: 'POST', body: payload })
    applyPipelineControl(value)
    return value
  }, [applyPipelineControl])

  const pipelineCheckpoint = useCallback(async (runId, stage, action = 'checkpoint') => {
    if (!runId) return null
    const value = await pipelineControlAction(runId, { action, stage })
    const status = String(value?.status || '').toLowerCase()
    if (status === 'paused') {
      const pauseError = new Error('Pipeline paused by user.')
      pauseError.pipelineState = 'paused'
      throw pauseError
    }
    if (status === 'stopped') {
      const stopError = new Error('Pipeline stopped by user.')
      stopError.pipelineState = 'stopped'
      throw stopError
    }
    return value
  }, [pipelineControlAction])

  const pipelineStageStart = useCallback(async (runId, stage) => {
    const value = await pipelineControlAction(runId, { action: 'stage_start', stage })
    const status = String(value?.status || '').toLowerCase()
    if (status === 'pause_requested' || status === 'stop_requested') {
      return pipelineCheckpoint(runId, stage)
    }
    if (status === 'paused' || status === 'stopped') {
      const controlError = new Error(status === 'paused' ? 'Pipeline paused by user.' : 'Pipeline stopped by user.')
      controlError.pipelineState = status
      throw controlError
    }
    return value
  }, [pipelineCheckpoint, pipelineControlAction])

  const loadExistingPipelineData = useCallback(async (loadedRun, periodStart, periodEnd) => {
    if (!loadedRun?.id || String(loadedRun?.status || '').toLowerCase() !== 'completed') return
    const processingId = String(loadedRun?.research_processing_id || '').trim()
    const nextState = defaultStageState()
    nextState.temporal = 'completed'

    if (processingId) {
      try {
        const loadedAnalytics = await apiFetchTimed(`${API}/analytics/processings/${encodeURIComponent(processingId)}`)
        setAnalytics(loadedAnalytics)
        nextState.reference = Array.isArray(loadedAnalytics?.equity) && loadedAnalytics.equity.length ? 'completed' : 'prepared'
      } catch {
        setAnalytics(null)
        nextState.reference = 'prepared'
      }
    }

    let snapshot = null
    try {
      snapshot = await apiFetchTimed(`${API}/temporal-intelligence/${encodeURIComponent(loadedRun.id)}/strategy-research/pipeline/snapshot`)
    } catch {
      snapshot = null
    }

    const riskValue = snapshot?.risk?.id ? snapshot.risk : null
    const interventionValue = snapshot?.intervention?.id ? snapshot.intervention : null
    const confidenceValue = snapshot?.confidence?.id ? snapshot.confidence : null
    const statefulValue = snapshot?.stateful?.id ? snapshot.stateful : null
    setRisk(riskValue)
    setIntervention(interventionValue)
    setConfidence(confidenceValue)
    setStateful(statefulValue)

    if (riskValue?.id && interventionValue?.id) nextState.risk = 'completed'
    else if (riskValue?.id || interventionValue?.id) nextState.risk = 'paused'
    if (confidenceValue?.id) nextState.confidence = 'completed'
    if (statefulValue?.id) nextState.stateful = 'completed'
    if (nextState.stateful === 'completed') nextState.validation = 'completed'

    const snapshotStart = monthValue(snapshot?.period_start, periodStart)
    const snapshotEnd = monthValue(snapshot?.period_end, periodEnd)
    if (snapshotStart) setStartMonth(snapshotStart)
    if (snapshotEnd) setEndMonth(snapshotEnd)

    const persisted = snapshot?.pipeline || loadedRun?.strategy_research_pipeline
    const persistedStatus = String(persisted?.status || '').toLowerCase()
    const resolvedState = persisted?.stage_states && persistedStatus && persistedStatus !== 'idle'
      ? { ...nextState, ...persisted.stage_states }
      : nextState
    setStageState(resolvedState)
    if (persisted && persistedStatus && persistedStatus !== 'idle') applyPipelineControl(persisted, { selectCurrent: false })
    const selected = persisted?.current_stage
      ? STRATEGY_RESEARCH_STAGES.find((stage) => stage.id === persisted.current_stage)
      : [...STRATEGY_RESEARCH_STAGES].reverse().find((stage) => resolvedState[stage.id] === 'completed')
    if (selected) setSelectedStage(selected.id)
  }, [applyPipelineControl])

  const loadActivePipelineData = useCallback(async (loadedRun) => {
    if (!loadedRun?.id) return
    const nextState = defaultStageState()
    const processingId = String(loadedRun?.research_processing_id || '').trim()
    if (processingId) {
      try {
        const loadedAnalytics = await apiFetchTimed(`${API}/analytics/processings/${encodeURIComponent(processingId)}`)
        setAnalytics(loadedAnalytics)
        nextState.reference = Array.isArray(loadedAnalytics?.equity) && loadedAnalytics.equity.length ? 'completed' : 'prepared'
      } catch {
        setAnalytics(null)
        nextState.reference = 'prepared'
      }
    }
    nextState.temporal = 'running'
    const persisted = loadedRun?.strategy_research_pipeline
    const persistedStatus = String(persisted?.status || '').toLowerCase()
    const resolvedState = persisted?.stage_states && persistedStatus && persistedStatus !== 'idle'
      ? { ...nextState, ...persisted.stage_states, temporal: 'running' }
      : nextState
    setStageState(resolvedState)
    if (persisted && persistedStatus && persistedStatus !== 'idle') applyPipelineControl(persisted, { selectCurrent: false })
    setSelectedStage('temporal')
    activeTemporalRunRef.current = loadedRun.id
  }, [applyPipelineControl])

  const restorePipeline = useCallback(async (summaryRun) => {
    if (!summaryRun?.id) return
    if (ACTIVE_TEMPORAL.has(String(summaryRun?.status || '').toLowerCase())) {
      await loadActivePipelineData(summaryRun)
      return
    }
    let detailedRun = summaryRun
    try {
      detailedRun = await apiFetchTimed(`${API}/temporal-intelligence/${encodeURIComponent(summaryRun.id)}`)
      setRun(detailedRun)
    } catch (requestError) {
      handleError(requestError)
      return
    }
    const persistedPeriod = detailedRun?.strategy_research_pipeline || {}
    const start = monthValue(persistedPeriod?.start_month || detailedRun?.result?.oos_start, '2020-01')
    const end = monthValue(persistedPeriod?.end_month || detailedRun?.result?.oos_end || detailedRun?.research_snapshot_cutoff || detailedRun?.analysis_end_date, currentMonth())
    setStartMonth(start)
    setEndMonth(end)
    await loadExistingPipelineData(detailedRun, start, end)
  }, [handleError, loadActivePipelineData, loadExistingPipelineData])

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    let currentRun = null
    try {
      let nextControl = null
      try {
        nextControl = await apiFetchTimed(`${API}/admin/strategies/control`)
        setControl(nextControl)
      } catch (requestError) {
        if (!(requestError instanceof ApiError) || requestError.status !== 403) throw requestError
      }
      const history = await apiFetchTimed(`${API}/temporal-intelligence/history?limit=1`)
      const latest = Array.isArray(history?.items) ? history.items[0] || null : null
      const selectedStrategy = nextControl?.strategy_research_strategy || nextControl?.research_strategy || null
      const latestIsActive = ACTIVE_TEMPORAL.has(String(latest?.status || '').toLowerCase())
      const matchesSelected = !selectedStrategy || runMatchesStrategy(latest, selectedStrategy)
      currentRun = matchesSelected ? latest : null
      setBlockingRun(latestIsActive && !matchesSelected ? latest : null)
      setRun(currentRun)
      setPipelineControl(currentRun?.strategy_research_pipeline || null)
      const end = monthValue(currentRun?.research_snapshot_cutoff || currentRun?.analysis_end_date, currentMonth())
      setEndMonth(end)
      if (!currentRun) setStageState(defaultStageState())
      if (!nextControl && latest?.strategy_profile_name) {
        setControl({ strategy_research_strategy: { id: latest.strategy_profile_id, name: latest.strategy_profile_name, revision: latest.strategy_profile_revision, strategy_kind: latest.strategy_kind, temporal_strategy_variant: latest.temporal_strategy_variant, research_model: { label: latest.model_label } } })
      }
    } catch (requestError) {
      handleError(requestError)
    } finally {
      setLoading(false)
    }
    if (currentRun) {
      window.setTimeout(() => {
        restorePipeline(currentRun).catch(handleError)
      }, 0)
    }
  }, [handleError, restorePipeline])

  useEffect(() => { load() }, [load])

  const setStage = useCallback((id, state) => {
    if (state === 'running') activeStageRef.current = id
    if (['completed', 'failed', 'paused', 'stopped', 'skipped'].includes(state) && activeStageRef.current === id) activeStageRef.current = null
    setStageState((current) => ({ ...current, [id]: state }))
    if (state === 'running' || state === 'failed') setSelectedStage(id)
  }, [])

  useEffect(() => {
    if (!temporalActive || running || !run?.id) return undefined
    let disposed = false
    let timer = null

    const syncActiveRun = async () => {
      try {
        const value = await apiFetch(`${API}/temporal-intelligence/${encodeURIComponent(run.id)}`)
        if (disposed) return
        setRun(value)
        setBlockingRun(null)
        if (value?.strategy_research_pipeline) applyPipelineControl(value.strategy_research_pipeline, { selectCurrent: false })
        const status = String(value?.status || '').toLowerCase()
        if (ACTIVE_TEMPORAL.has(status)) {
          activeTemporalRunRef.current = value.id
          setStageState((current) => ({ ...current, temporal: 'running' }))
          const referenceReady = Array.isArray(analytics?.equity) && analytics.equity.length > 0
          const processingId = String(value?.research_processing_id || '').trim()
          if (!referenceReady && processingId) {
            try {
              const loadedAnalytics = await apiFetchTimed(`${API}/analytics/processings/${encodeURIComponent(processingId)}`)
              if (!disposed) {
                setAnalytics(loadedAnalytics)
                setStageState((current) => ({ ...current, reference: Array.isArray(loadedAnalytics?.equity) && loadedAnalytics.equity.length ? 'completed' : 'prepared', temporal: 'running' }))
              }
            } catch {
              if (!disposed) setStageState((current) => ({ ...current, reference: current.reference === 'completed' ? 'completed' : 'prepared', temporal: 'running' }))
            }
          }
          return
        }

        activeTemporalRunRef.current = null
        if (status === 'completed') {
          await loadExistingPipelineData(value, startMonth, endMonth)
          return
        }
        if (FAILED.has(status)) {
          const stopped = status === 'cancelled'
          setStageState((current) => ({ ...current, temporal: stopped ? 'stopped' : 'failed' }))
          setSelectedStage('temporal')
          if (!stopped) setError(tr(value?.failure_message || 'Temporal Intelligence failed.'))
        }
      } catch (requestError) {
        if (!disposed) handleError(requestError)
      }
    }

    syncActiveRun()
    timer = window.setInterval(syncActiveRun, 2500)
    return () => {
      disposed = true
      if (timer) window.clearInterval(timer)
    }
  }, [analytics?.equity, applyPipelineControl, endMonth, handleError, loadExistingPipelineData, run?.id, running, startMonth, temporalActive])

  useEffect(() => {
    if (!run?.id || running || !persistedPipelineActive) return undefined
    let disposed = false
    let timer = null

    const syncPipelineControl = async () => {
      try {
        const controlValue = await apiFetch(`${API}/temporal-intelligence/${encodeURIComponent(run.id)}/strategy-research/pipeline`)
        if (disposed) return
        if (controlValue) applyPipelineControl(controlValue)
        const statusValue = String(controlValue?.status || '').toLowerCase()
        if (!ACTIVE_PIPELINE.has(statusValue)) {
          if (timer) window.clearInterval(timer)
          try {
            const value = await apiFetch(`${API}/temporal-intelligence/${encodeURIComponent(run.id)}`)
            if (disposed) return
            setRun(value)
            if (String(value?.status || '').toLowerCase() === 'completed') {
              await loadExistingPipelineData(value, startMonth, endMonth)
            }
          } catch (requestError) {
            if (!disposed) handleError(requestError)
          }
        }
      } catch (requestError) {
        if (!disposed) handleError(requestError)
      }
    }

    syncPipelineControl()
    timer = window.setInterval(syncPipelineControl, 2500)
    return () => {
      disposed = true
      if (timer) window.clearInterval(timer)
    }
  }, [applyPipelineControl, endMonth, handleError, loadExistingPipelineData, persistedPipelineActive, run?.id, running, startMonth])

  async function waitForBacktest(jobId) {
    while (true) {
      const job = await apiFetch(`${API}/jobs/${encodeURIComponent(jobId)}`)
      if (job?.status === 'completed') return job
      if (FAILED.has(String(job?.status || '').toLowerCase())) throw new Error(job?.failure_message || 'Strategy Replay Backtest failed.')
      await wait(2500)
    }
  }

  async function waitForTemporal(runId) {
    activeTemporalRunRef.current = runId
    while (true) {
      const value = await apiFetch(`${API}/temporal-intelligence/${encodeURIComponent(runId)}`)
      setRun(value)
      if (String(value?.status || '').toLowerCase() === 'completed') {
        activeTemporalRunRef.current = null
        return value
      }
      if (FAILED.has(String(value?.status || '').toLowerCase())) {
        activeTemporalRunRef.current = null
        throw new Error(value?.failure_message || 'Temporal Intelligence failed.')
      }
      await wait(2500)
    }
  }

  async function runReferenceReplay(selectedStrategy) {
    if (!strategyNeedsReferenceBacktest(selectedStrategy)) return
    if (!canStartBacktest) throw new Error('A reference Backtest is required for this Strategy, but this profile cannot start Backtests.')
    const created = await workspace.runBacktest()
    if (!created?.id) throw new Error(workspace.error || 'Unable to start the reference Backtest.')
    if (ACTIVE_JOB.has(String(created.status || '').toLowerCase())) await waitForBacktest(created.id)
  }

  async function hydrateReferenceReplay(createdRun) {
    const processingId = String(createdRun?.research_processing_id || '').trim()
    if (!processingId) throw new Error('The selected Strategy did not produce a compatible Strategy Replay source.')
    const processingAnalytics = await apiFetch(`${API}/analytics/processings/${encodeURIComponent(processingId)}`)
    setAnalytics(processingAnalytics)
    return processingId
  }

  async function hydrateStudyData(completedRun) {
    const processingId = String(completedRun?.research_processing_id || '').trim()
    if (!processingId) throw new Error('The selected Strategy did not produce a compatible Research result source.')
    const [processingAnalytics] = await Promise.all([
      apiFetch(`${API}/analytics/processings/${encodeURIComponent(processingId)}`),
      apiFetch(`${API}/temporal-intelligence/${encodeURIComponent(completedRun.id)}/decision-context?start_month=${encodeURIComponent(startMonth)}&end_month=${encodeURIComponent(endMonth)}`),
      apiFetch(`${API}/temporal-intelligence/${encodeURIComponent(completedRun.id)}/winner-transition-attribution?start_month=${encodeURIComponent(startMonth)}&end_month=${encodeURIComponent(endMonth)}`),
    ])
    setAnalytics(processingAnalytics)
    return processingId
  }

  async function runPipeline({ forceNew = false } = {}) {
    if (!canRun || running || temporalActive || blockingTemporalActive || !validPeriod(startMonth, endMonth)) return
    if (!forceNew && persistedPipelineActive) return
    pauseRequestedRef.current = false
    stopRequestedRef.current = false
    setRunning(true)
    setPausing(false)
    setStopping(false)
    setError('')
    setNotice('')
    let completedRun = null
    try {
      let latestControl = control
      if (!latestControl) latestControl = await apiFetch(`${API}/admin/strategies/control`)
      setControl(latestControl)
      const selectedStrategy = latestControl?.strategy_research_strategy || latestControl?.research_strategy || strategy
      const hasUnfinishedStage = STRATEGY_RESEARCH_STAGES.some((stage) => !['completed', 'skipped'].includes(stageState[stage.id]))
      const continueCurrent = !forceNew && Boolean(
        run?.id
        && String(run?.status || '').toLowerCase() === 'completed'
        && runMatchesStrategy(run, selectedStrategy)
        && stageState.temporal === 'completed'
        && (hasUnfinishedStage || persistedPipelineResumable)
      )

      completedRun = continueCurrent ? run : null
      let processingId = continueCurrent ? String(run?.research_processing_id || '').trim() : ''
      let riskValue = continueCurrent ? risk : null
      let interventionValue = continueCurrent ? intervention : null
      let confidenceValue = continueCurrent ? confidence : null
      let statefulValue = continueCurrent ? stateful : null

      if (continueCurrent) {
        const existingPipelineStatus = String(pipelineControl?.status || run?.strategy_research_pipeline?.status || '').toLowerCase()
        if (existingPipelineStatus && existingPipelineStatus !== 'idle') {
          await pipelineControlAction(completedRun.id, { action: 'resume' })
        } else {
          await pipelineControlAction(completedRun.id, { action: 'start', start_month: startMonth, end_month: endMonth })
          await pipelineCheckpoint(completedRun.id, 'reference', 'stage_complete')
          await pipelineCheckpoint(completedRun.id, 'temporal', 'stage_complete')
        }
        if (!(Array.isArray(analytics?.equity) && analytics.equity.length) || !processingId) {
          await pipelineStageStart(completedRun.id, 'reference')
          setStage('reference', 'running')
          processingId = await hydrateStudyData(completedRun)
          await pipelineCheckpoint(completedRun.id, 'reference', 'stage_complete')
        }
        setStageState((current) => ({ ...current, temporal: 'completed' }))
      } else {
        setAnalytics(null)
        setRisk(null)
        setIntervention(null)
        setConfidence(null)
        setStateful(null)
        setPipelineControl(null)
        setStageState(defaultStageState())

        setStage('reference', 'running')
        await runReferenceReplay(selectedStrategy)
        if (pauseRequestedRef.current) {
          const pauseError = new Error('Pipeline paused by user.')
          pauseError.pipelineState = 'paused'
          throw pauseError
        }
        if (stopRequestedRef.current) {
          const stopError = new Error('Pipeline stopped by user.')
          stopError.pipelineState = 'stopped'
          throw stopError
        }

        const created = await apiFetch(`${API}/temporal-intelligence`, { method: 'POST' })
        setBlockingRun(null)
        setRun(created)
        processingId = await hydrateReferenceReplay(created)
        await pipelineControlAction(created.id, { action: 'start', start_month: startMonth, end_month: endMonth })
        await pipelineStageStart(created.id, 'reference')
        await pipelineCheckpoint(created.id, 'reference', 'stage_complete')
        await pipelineStageStart(created.id, 'temporal')
        setStage('temporal', 'running')
        completedRun = await waitForTemporal(created.id)
        processingId = await hydrateStudyData(completedRun)
        await pipelineCheckpoint(completedRun.id, 'temporal', 'stage_complete')
      }

      const body = { processing_id: processingId, start_month: startMonth, end_month: endMonth }
      if (!riskValue?.id || !interventionValue?.id) {
        await pipelineStageStart(completedRun.id, 'risk')
        setStage('risk', 'running')
        if (!riskValue?.id) {
          riskValue = await apiFetch(`${API}/temporal-intelligence/${encodeURIComponent(completedRun.id)}/winner-transition-risk-search`, { method: 'POST', body: { ...body, seed: 42 } })
          setRisk(riskValue)
          await pipelineCheckpoint(completedRun.id, 'risk')
        }
        if (!interventionValue?.id) {
          interventionValue = await apiFetch(`${API}/temporal-intelligence/${encodeURIComponent(completedRun.id)}/winner-transition-intervention-search`, { method: 'POST', body: { ...body, seed: 42 } })
          setIntervention(interventionValue)
          await pipelineCheckpoint(completedRun.id, 'risk')
        }
        await pipelineCheckpoint(completedRun.id, 'risk', 'stage_complete')
      } else if (stageState.risk !== 'completed') {
        await pipelineCheckpoint(completedRun.id, 'risk', 'stage_complete')
      }

      if (!confidenceValue?.id) {
        await pipelineStageStart(completedRun.id, 'confidence')
        setStage('confidence', 'running')
        confidenceValue = await apiFetch(`${API}/temporal-intelligence/${encodeURIComponent(completedRun.id)}/winner-transition-confidence-calibration`, { method: 'POST', body })
        setConfidence(confidenceValue)
        await pipelineCheckpoint(completedRun.id, 'confidence', 'stage_complete')
      } else if (stageState.confidence !== 'completed') {
        await pipelineCheckpoint(completedRun.id, 'confidence', 'stage_complete')
      }

      if (!statefulValue?.id) {
        await pipelineStageStart(completedRun.id, 'stateful')
        setStage('stateful', 'running')
        statefulValue = await apiFetch(`${API}/temporal-intelligence/${encodeURIComponent(completedRun.id)}/winner-transition-stateful-replay`, { method: 'POST', body })
        setStateful(statefulValue)
        await pipelineCheckpoint(completedRun.id, 'stateful', 'stage_complete')
      } else if (stageState.stateful !== 'completed') {
        await pipelineCheckpoint(completedRun.id, 'stateful', 'stage_complete')
      }

      await pipelineStageStart(completedRun.id, 'validation')
      setStage('validation', 'running')
      await wait(150)
      await pipelineCheckpoint(completedRun.id, 'validation', 'stage_complete')
      setSelectedStage('validation')
      setNotice(tr('Research Pipeline completed.'))
      await workspace.refreshDashboard()
    } catch (requestError) {
      const pipelineState = String(requestError?.pipelineState || '').toLowerCase()
      const paused = pipelineState === 'paused' || pauseRequestedRef.current || String(requestError?.message || '').includes('paused by user')
      const stopped = pipelineState === 'stopped' || stopRequestedRef.current || String(requestError?.message || '').includes('stopped by user')
      const activeStageId = activeStageRef.current
      if (paused || stopped) {
        setNotice(tr(stopped
          ? 'Research Pipeline stopped. Restart begins a new pipeline.'
          : 'Research Pipeline paused. Continue resumes from the next unfinished stage.'))
      } else {
        if (activeStageId) setStage(activeStageId, 'failed')
        if (completedRun?.id && activeStageId) {
          try {
            await pipelineControlAction(completedRun.id, { action: 'stage_failed', stage: activeStageId, message: requestError?.message || 'Strategy Research stage failed.' })
          } catch {
          }
        }
        handleError(requestError)
      }
    } finally {
      setRunning(false)
      setPausing(false)
      setStopping(false)
      activeTemporalRunRef.current = null
      activeStageRef.current = null
    }
  }

  async function pausePipeline() {
    if ((!running && !persistedPipelineActive) || pausing || stopping) return
    setPausing(true)
    setError('')
    setNotice('')
    if (!run?.id) {
      pauseRequestedRef.current = true
      setNotice(tr('Pause requested. The current stage will finish safely before the pipeline pauses.'))
      return
    }
    try {
      const value = await apiFetch(`${API}/temporal-intelligence/${encodeURIComponent(run.id)}/strategy-research/pipeline/pause`, { method: 'POST' })
      applyPipelineControl(value)
      const status = String(value?.status || '').toLowerCase()
      pauseRequestedRef.current = status === 'pause_requested' || status === 'paused'
      if (pauseRequestedRef.current) {
        setNotice(tr('Pause requested. The current stage will finish safely before the pipeline pauses.'))
      }
    } catch (requestError) {
      pauseRequestedRef.current = false
      setPausing(false)
      setNotice('')
      handleError(requestError)
    }
  }

  async function stopPipeline() {
    const stoppable = running || temporalActive || persistedPipelineActive || pipelineStatus === 'paused'
    if (!stoppable || stopping || !run?.id) return
    stopRequestedRef.current = true
    setStopping(true)
    setError('')
    setNotice('')
    try {
      const value = await apiFetch(`${API}/temporal-intelligence/${encodeURIComponent(run.id)}/strategy-research/pipeline/stop`, { method: 'POST' })
      applyPipelineControl(value)
      const status = String(value?.status || '').toLowerCase()
      setNotice(tr(status === 'stopped'
        ? 'Research Pipeline stopped. Restart begins a new pipeline.'
        : 'Stop requested. The active processing is being stopped.'))
    } catch (requestError) {
      stopRequestedRef.current = false
      setStopping(false)
      setNotice('')
      handleError(requestError)
    }
  }

  async function restartPipeline() {
    if (!canRun || restarting || running || temporalActive || blockingTemporalActive || !validPeriod(startMonth, endMonth)) return
    if (!window.confirm(tr('Restart the Research Pipeline? Current derived research results will be cleared and processing will start again from the beginning.'))) return
    setRestarting(true)
    setError('')
    setNotice('')
    try {
      if (run?.id) {
        await apiFetch(`${API}/temporal-intelligence/${encodeURIComponent(run.id)}/strategy-research/reset`, { method: 'POST' })
      }
      setAnalytics(null)
      setRisk(null)
      setIntervention(null)
      setConfidence(null)
      setStateful(null)
      setPipelineControl(null)
      setRun(null)
      setBlockingRun(null)
      setStageState(defaultStageState())
      setSelectedStage('reference')
      await runPipeline({ forceNew: true })
    } catch (requestError) {
      handleError(requestError)
    } finally {
      setRestarting(false)
    }
  }

  async function exportPipeline() {
    if (!canExport || exporting || !run?.id) return
    setExporting(true)
    setError('')
    try {
      const query = new URLSearchParams({ start_month: startMonth, end_month: endMonth })
      await downloadFile(`${API}/temporal-intelligence/${encodeURIComponent(run.id)}/export.zip?${query.toString()}`, `strategy_research_${run.id}.zip`)
    } catch (requestError) {
      handleError(requestError)
    } finally {
      setExporting(false)
    }
  }

  async function materializeStrategy() {
    if (!canMaterialize || materializing || !run?.id) return
    setMaterializing(true)
    setError('')
    setNotice('')
    try {
      const response = await apiFetch(`${API}/temporal-intelligence/${encodeURIComponent(run.id)}/strategy`, { method: 'POST' })
      setNotice(tr(response?.created ? 'Strategy created in Strategy catalog.' : 'Strategy already exists in Strategy catalog.'))
    } catch (requestError) {
      handleError(requestError)
    } finally {
      setMaterializing(false)
    }
  }

  const canCreateCatalogStrategy = Boolean(
    canMaterialize
    && run?.id
    && run?.result
    && String(run?.status || '').toLowerCase() === 'completed'
    && stageState.validation === 'completed'
  )

  if (loading) return <div className="strategy-research-loading"><span className="loading-ring" />{tr('Loading Strategy Research…')}</div>

  const strategyName = strategy?.name || run?.strategy_profile_name || tr('Not selected')
  const strategyType = strategyTypeLabel(strategy, run)
  const model = strategy?.research_model?.label || strategy?.winner_model?.label || run?.model_label || '—'
  const hasUnfinishedStage = STRATEGY_RESEARCH_STAGES.some((stage) => !['completed', 'skipped'].includes(stageState[stage.id]))
  const canContinueCurrent = Boolean(
    run?.id
    && String(run?.status || '').toLowerCase() === 'completed'
    && runMatchesStrategy(run, strategy)
    && stageState.temporal === 'completed'
    && hasUnfinishedStage
    && !persistedPipelineActive
  )
  const runButtonLabel = running
    ? 'Research Pipeline Running'
    : temporalActive || blockingTemporalActive
      ? 'Temporal Intelligence Running'
      : pipelineStatus === 'pause_requested'
        ? 'Research Pipeline Pausing'
        : pipelineStatus === 'stop_requested'
          ? 'Research Pipeline Stopping'
          : pipelineStatus === 'stopped'
            ? 'Restart Research Pipeline'
            : persistedPipelineActive
              ? 'Research Pipeline Running'
              : canContinueCurrent || persistedPipelineResumable
                ? 'Continue Research Pipeline'
                : 'Run Research Pipeline'
  const effectivePipelineBusy = running || temporalActive || persistedPipelineActive
  const canPausePipeline = canStop && effectivePipelineBusy && pipelineStatus !== 'stop_requested'
  const canStopPipeline = canStop && (effectivePipelineBusy || pipelineStatus === 'paused')
  const temporalProgress = Number(run?.progress)
  const progressDetail = currentStage
    ? `${tr('Current stage')}: ${tr(currentStage.label)}${currentStage.id === 'temporal' && Number.isFinite(temporalProgress) ? ` · ${Math.round(Math.max(0, Math.min(100, temporalProgress)))}%${run?.stage ? ` · ${run.stage}` : ''}` : ''}`
    : pipelineStatus === 'pause_requested'
      ? tr('Pause requested. The current stage will finish safely before the pipeline pauses.')
      : pipelineStatus === 'stop_requested'
        ? tr('Stop requested. The active processing is being stopped.')
        : pipelineStatus === 'paused'
          ? tr('Research Pipeline paused. Continue resumes from the next unfinished stage.')
          : pipelineStatus === 'stopped'
            ? tr('Research Pipeline stopped. Restart begins a new pipeline.')
            : running || persistedPipelineActive
              ? tr('Preparing pipeline…')
              : tr('Changing inputs only prepares the pipeline. Processing starts with Run Research Pipeline.')

  return <section className="strategy-research-page page-stack">
    <section className="strategy-research-header data-panel">
      <div className="strategy-research-title-block">
        <div className="page-title-icon"><AnalyticsIcon size={20} /></div>
        <div><span className="panel-kicker">{tr('STRATEGY RESEARCH')}</span><h2>{tr('Research Pipeline')}</h2><div className="strategy-research-context"><strong>{strategyName}</strong><span>·</span><span>{strategyType}</span><span>·</span><span>{model}</span></div></div>
      </div>
      <div className="strategy-research-actions">
        {canPausePipeline ? <button type="button" className="secondary-action compact" onClick={pausePipeline} disabled={pausing || pipelineStatus === 'pause_requested'}>{tr(pausing || pipelineStatus === 'pause_requested' ? 'Pausing…' : 'Pause Pipeline')}</button> : null}
        {canStopPipeline ? <button type="button" className="secondary-action compact" onClick={stopPipeline} disabled={stopping || pipelineStatus === 'stop_requested'}>{tr(stopping || pipelineStatus === 'stop_requested' ? 'Stopping…' : 'Stop Pipeline')}</button> : null}
        {!effectivePipelineBusy && !temporalActive && pipelineStatus !== 'stopped' && run?.id && canRun ? <button type="button" className="secondary-action compact" onClick={restartPipeline} disabled={restarting || blockingTemporalActive}>{tr(restarting ? 'Restarting…' : 'Restart Pipeline')}</button> : null}
        {canExport && run?.result ? <button type="button" className="secondary-action compact" onClick={exportPipeline} disabled={exporting}>{tr(exporting ? 'Exporting…' : 'Export Results')}</button> : null}
        {!effectivePipelineBusy && !temporalActive && canCreateCatalogStrategy ? <button type="button" className="secondary-action compact" onClick={materializeStrategy} disabled={materializing}>{tr(materializing ? 'Creating Strategy…' : 'Create Strategy')}</button> : null}
        {canRun ? <button type="button" className="primary-action compact" onClick={pipelineStatus === 'stopped' ? restartPipeline : () => runPipeline()} disabled={restarting || effectivePipelineBusy || temporalActive || blockingTemporalActive || !validPeriod(startMonth, endMonth)}><PlayIcon />{tr(runButtonLabel)}</button> : null}
      </div>
    </section>

    <section className="strategy-research-controls data-panel">
      <label><span>{tr('Period from')}</span><input type="month" value={startMonth} onChange={(event) => setStartMonth(event.target.value)} disabled={effectivePipelineBusy || temporalActive} /></label>
      <label><span>{tr('Period to')}</span><input type="month" value={endMonth} onChange={(event) => setEndMonth(event.target.value)} disabled={effectivePipelineBusy || temporalActive} /></label>
      <div className="strategy-research-progress"><div><span>{tr('Pipeline progress')}</span><strong>{pipelineProgress}%</strong></div><div className="strategy-research-progress-track"><span style={{ width: `${pipelineProgress}%` }} /></div><small>{progressDetail}</small></div>
    </section>

    {!validPeriod(startMonth, endMonth) ? <div className="global-inline-message error-inline">{tr('Select a valid period.')}</div> : null}
    {blockingTemporalActive ? <div className="global-inline-message error-inline">{tr('Another Temporal Intelligence run is active for a different Strategy Research baseline.')} {blockingRun?.id || ''}</div> : null}
    {error ? <div className="global-inline-message error-inline">{error}</div> : null}
    {notice ? <div className="global-inline-message success-inline">{notice}</div> : null}

    <StrategyResearchPipeline stageState={stageState} selectedStage={selectedStage} onSelect={setSelectedStage} runProgress={run?.progress} />

    <section className="strategy-research-stage-content data-panel">
      <div className="strategy-research-stage-content-heading"><div><span className="panel-kicker">{tr('SELECTED STAGE')}</span><h3>{tr(STRATEGY_RESEARCH_STAGES.find((stage) => stage.id === selectedStage)?.label || 'Research Pipeline')}</h3></div><span>{tr('Select a pipeline stage to inspect its visual result.')}</span></div>
      <StrategyResearchVisuals selectedStage={selectedStage} stageState={stageState} pipelineProgress={pipelineProgress} run={run} analytics={analytics} risk={risk} intervention={intervention} confidence={confidence} stateful={stateful} pipelineError={error} />
    </section>
  </section>
}
