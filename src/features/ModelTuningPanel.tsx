import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import { ApiError, apiFetch, downloadFile } from '../api/http'
import { hasCapability } from '../auth/capabilities'
import { API } from '../config/env'
import { tr } from '../i18n/runtime'
import { ACTIVE, PROBABILITY_METHOD } from './modelTuning/modelTuningConfig'
import { candidateLabel, numberOr } from './modelTuning/modelTuningUtils'
import { EMPTY_TUNING_LOG_VIEW, normalizeTuningLog } from './modelTuning/modelTuningLog'
import { ModelTuningWorkspaceView } from './modelTuning/components/ModelTuningWorkspaceView'

const MODEL_TUNING_START_CONTRACT_VERSION = 1

export function ModelTuningPanel({ capabilities = {}, onSessionExpired, onStrategyModelSaved, onTuningContextChange }: AppRecord) {
  const canStartTuning = hasCapability(capabilities, 'tuning.start')
  const canStopTuning = hasCapability(capabilities, 'tuning.stop')
  const canExportTuning = hasCapability(capabilities, 'tuning.export')
  const canViewTuningLogs = hasCapability(capabilities, 'tuning.logs.view')
  const canPromoteTuning = hasCapability(capabilities, 'tuning.promote')
  const [catalog, setCatalog] = useState<AppRecord | null>(null)
  const [strategy, setStrategy] = useState<AppRecord | null>(null)
  const [strategyCatalogItems, setStrategyCatalogItems] = useState([])
  const [strategyControlRevision, setStrategyControlRevision] = useState(null)
  const [officialWinnerId, setOfficialWinnerId] = useState(null)
  const [strategyStatusFilter, setStrategyStatusFilter] = useState('all')
  const [strategySearch, setStrategySearch] = useState('')
  const [modelFamily, setModelFamily] = useState('')
  const [baselines, setBaselines] = useState([])
  const [run, setRun] = useState<AppRecord | null>(null)
  const [method, setMethod] = useState(PROBABILITY_METHOD)
  const [temporalTuningTarget, setTemporalTuningTarget] = useState('temporal_model')
  const [candidateCount, setCandidateCount] = useState(20)
  const [researchFolds, setResearchFolds] = useState(3)
  const [validationFolds, setValidationFolds] = useState(5)
  const [certificationFolds, setCertificationFolds] = useState(7)
  const [seed, setSeed] = useState(42)
  const [minimumCapitalImprovementPct, setMinimumCapitalImprovementPct] = useState('')
  const [sharpeTolerance, setSharpeTolerance] = useState('')
  const [drawdownTolerancePct, setDrawdownTolerancePct] = useState('')
  const [minimumWorstFoldPct, setMinimumWorstFoldPct] = useState('')
  const [adaptiveStoppingEnabled, setAdaptiveStoppingEnabled] = useState(true)
  const [noImprovementTrialLimit, setNoImprovementTrialLimit] = useState(100)
  const [minimumMeaningfulImprovementPct, setMinimumMeaningfulImprovementPct] = useState('0.25')
  const [busy, setBusy] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [selectedCandidateId, setSelectedCandidateId] = useState(null)
  const [parameterCandidateId, setParameterCandidateId] = useState(null)
  const [logView, setLogView] = useState(EMPTY_TUNING_LOG_VIEW)
  const [logLoading, setLogLoading] = useState(false)
  const [logError, setLogError] = useState('')
  const timerRef = useRef(null)
  const validationTimerRef = useRef(null)

  const handleError = useCallback((requestError: ErrorLike) => {
    if (requestError instanceof ApiError && requestError.status === 401) {
      onSessionExpired?.()
      return
    }
    if (requestError instanceof ApiError && requestError.status === 403) {
      setError('')
      return
    }
    setError(tr(requestError.message || 'Unable to manage model tuning.'))
  }, [onSessionExpired])

  const loadLatest = useCallback(async () => {
    const latest = await apiFetch(`${API}/admin/model-tuning/latest`)
    setRun(latest || null)
    return latest || null
  }, [])

  const loadWorkspace = useCallback(async () => {
    try {
      const [nextCatalog, strategyCatalog] = await Promise.all([
        apiFetch(`${API}/admin/model-tuning/catalog`),
        apiFetch(`${API}/admin/strategies`),
      ])
      const control = strategyCatalog?.control || {}
      const strategyId = control?.model_tuning_strategy_id || control?.candidate_strategy_id || control?.promoted_candidate_strategy_id || control?.research_strategy_id
      const detail = strategyId ? await apiFetch(`${API}/admin/strategies/${encodeURIComponent(strategyId)}`) : null
      const [baselinePayload] = await Promise.all([
        apiFetch(`${API}/admin/model-tuning/baselines?limit=20`),
        loadLatest(),
      ])
      const items = Array.isArray(baselinePayload?.items) ? baselinePayload.items : []
      const savedModel = detail?.research_model_configuration || detail?.research_model || null
      const probability = nextCatalog?.probability || {}
      setCatalog(nextCatalog)
      setStrategyCatalogItems(Array.isArray(strategyCatalog?.items) ? strategyCatalog.items : [])
      setStrategyControlRevision(Number(control?.revision || 1))
      setOfficialWinnerId(control?.trader_winner_strategy_id || null)
      setStrategy(detail)
      const temporalModes = Array.isArray(nextCatalog?.temporal_tuning_modes) ? nextCatalog.temporal_tuning_modes : []
      const temporalDefault = nextCatalog?.default_temporal_tuning_target || temporalModes[0]?.id || 'temporal_model'
      if (detail?.strategy_kind === 'temporal_intelligence') {
        setTemporalTuningTarget((current: any) => {
          const target = temporalModes.some((item: AppRecord) => item.id === current) ? current : temporalDefault
          setCandidateCount(target === 'temporal_model' ? Math.min(8, nextCatalog.default_candidate_count || 20) : (nextCatalog.default_candidate_count || 20))
          return target
        })
      } else {
        setCandidateCount(nextCatalog.default_candidate_count || 20)
      }
      setModelFamily(detail?.strategy_kind === 'temporal_intelligence' ? 'lightgbm_utility' : (savedModel?.family || ''))
      setBaselines(items)
      const foldProtocol = nextCatalog?.fold_protocol || {}
      setResearchFolds(Number(foldProtocol.research_default || 3))
      setValidationFolds(Number(foldProtocol.validation_default || 5))
      setCertificationFolds(Number(foldProtocol.certification_default || 7))
      setSeed(nextCatalog.default_seed ?? 42)
      setMinimumCapitalImprovementPct(String(numberOr(probability.default_min_capital_improvement) * 100))
      setSharpeTolerance(String(probability.default_sharpe_tolerance ?? ''))
      setDrawdownTolerancePct(String(numberOr(probability.default_drawdown_tolerance) * 100))
      setMinimumWorstFoldPct(String(numberOr(probability.default_min_worst_fold_return) * 100))
      setAdaptiveStoppingEnabled(probability.default_adaptive_stopping_enabled !== false)
      setNoImprovementTrialLimit(Number(probability.default_no_improvement_trial_limit || 100))
      setMinimumMeaningfulImprovementPct(String(numberOr(probability.default_minimum_meaningful_improvement ?? 0.0025) * 100))
      setError('')
    } catch (requestError) {
      handleError(requestError)
    }
  }, [handleError, loadLatest])

  useEffect(() => {
    loadWorkspace()
  }, [loadWorkspace])

  useEffect(() => {
    onTuningContextChange?.(strategy ? {
      id: strategy.id,
      name: strategy.name,
      revision: strategy.revision,
      strategy_kind: strategy.strategy_kind,
      status: strategy.status,
      source_temporal_run_id: strategy.source_temporal_run_id,
    } : null)
  }, [onTuningContextChange, strategy?.id, strategy?.name, strategy?.revision, strategy?.strategy_kind, strategy?.status, strategy?.source_temporal_run_id])

  useEffect(() => {
    if (!run?.id || !run?.fold_protocol) return
    setResearchFolds(Number(run.fold_protocol.research_folds || 3))
    setValidationFolds(Number(run.fold_protocol.validation_folds || 5))
    setCertificationFolds(Number(run.fold_protocol.certification_folds || 7))
  }, [run?.id])

  useEffect(() => {
    if (timerRef.current) window.clearInterval(timerRef.current)
    timerRef.current = null
    if (!run?.id || !ACTIVE.has(run.status)) return undefined
    timerRef.current = window.setInterval(async () => {
      try {
        const updated = await apiFetch(`${API}/admin/model-tuning/${encodeURIComponent(run.id)}`)
        setRun(updated)
      } catch (requestError) {
        handleError(requestError)
      }
    }, 2500)
    return () => {
      if (timerRef.current) window.clearInterval(timerRef.current)
      timerRef.current = null
    }
  }, [handleError, run?.id, run?.status])

  const activeValidation = useMemo(() => (
    (run?.candidates || []).find((candidate: AppRecord) => ['queued', 'running'].includes(String(candidate?.validation?.status || '').toLowerCase())) || null
  ), [run?.candidates])

  useEffect(() => {
    if (validationTimerRef.current) window.clearInterval(validationTimerRef.current)
    validationTimerRef.current = null
    if (!run?.id || !activeValidation) return undefined
    validationTimerRef.current = window.setInterval(async () => {
      try {
        const updated = await apiFetch(`${API}/admin/model-tuning/${encodeURIComponent(run.id)}`)
        setRun(updated)
      } catch (requestError) {
        handleError(requestError)
      }
    }, 2000)
    return () => {
      if (validationTimerRef.current) window.clearInterval(validationTimerRef.current)
      validationTimerRef.current = null
    }
  }, [activeValidation?.candidate_id, handleError, run?.id])

  const sortedCandidates = useMemo(() => {
    const items = [...(run?.candidates || [])]
    items.sort((left: any, right: any) => {
      if (Boolean(left.is_control) !== Boolean(right.is_control)) return left.is_control ? -1 : 1
      const leftRank = left.rank ?? Number.MAX_SAFE_INTEGER
      const rightRank = right.rank ?? Number.MAX_SAFE_INTEGER
      if (leftRank !== rightRank) return leftRank - rightRank
      return left.candidate_id - right.candidate_id
    })
    return items
  }, [run?.candidates])

  const selectedBaseline = baselines[0] || null
  const activeRun = Boolean(run && ACTIVE.has(run.status))

  const baselineControlCandidate = useMemo(() => {
    if (!selectedBaseline) return null
    const candidate: AppRecord = {
      candidate_id: 0,
      kind: 'control',
      is_control: true,
      status: 'completed',
      rank: null,
      metrics: selectedBaseline.metrics || {},
      proposal: null,
      job_id: selectedBaseline.job_id,
      source_job_id: selectedBaseline.job_id,
      baseline_reused: true,
      baseline_preview: true,
      settings_hash: selectedBaseline.model_settings_hash || '',
    }
    return candidate
  }, [selectedBaseline])

  const runControlCandidate = useMemo(
    () => sortedCandidates.find((candidate: AppRecord) => candidate.is_control) || null,
    [sortedCandidates],
  )
  const runBaselineJobId = String(run?.baseline_execution?.job_id || runControlCandidate?.source_job_id || runControlCandidate?.job_id || '')
  const currentBaselineJobId = String(selectedBaseline?.job_id || '')
  const runMatchesCurrentBaseline = !currentBaselineJobId || !runBaselineJobId || currentBaselineJobId === runBaselineJobId

  const displayedCandidates = useMemo(() => {
    const control = activeRun ? (runControlCandidate || baselineControlCandidate) : (baselineControlCandidate || runControlCandidate)
    const challengers = (activeRun || runMatchesCurrentBaseline)
      ? sortedCandidates.filter((candidate: AppRecord) => !candidate.is_control)
      : []
    return control ? [control, ...challengers] : challengers
  }, [activeRun, baselineControlCandidate, runControlCandidate, runMatchesCurrentBaseline, sortedCandidates])

  const currentChampionCandidateId = run?.probability_state?.last_champion_candidate_id ?? run?.probability_anchor?.candidate_id ?? 0
  const bestCompletedChallenger = useMemo(() => {
    const items = displayedCandidates
      .filter((candidate: AppRecord) => !candidate.is_control && candidate.status === 'completed')
      .sort((left: any, right: any) => {
        const leftRank = Number(left.rank ?? Number.MAX_SAFE_INTEGER)
        const rightRank = Number(right.rank ?? Number.MAX_SAFE_INTEGER)
        if (leftRank !== rightRank) return leftRank - rightRank
        return Number(right.metrics?.ending_capital || 0) - Number(left.metrics?.ending_capital || 0)
      })
    return items[0] || null
  }, [displayedCandidates])
  const currentBestCandidate = useMemo(() => {
    const champion = run?.method === PROBABILITY_METHOD
      ? displayedCandidates.find((candidate: AppRecord) => Number(candidate.candidate_id) === Number(currentChampionCandidateId))
      : null
    return champion || bestCompletedChallenger || baselineControlCandidate || null
  }, [baselineControlCandidate, bestCompletedChallenger, currentChampionCandidateId, displayedCandidates, run?.method])
  const currentBestImprovement = useMemo(() => {
    const baselineCapital = Number(selectedBaseline?.metrics?.ending_capital)
    const bestCapital = Number(currentBestCandidate?.metrics?.ending_capital)
    if (!Number.isFinite(baselineCapital) || baselineCapital === 0 || !Number.isFinite(bestCapital)) return null
    return (bestCapital - baselineCapital) / baselineCapital
  }, [currentBestCandidate, selectedBaseline])

  const visibleCandidates = useMemo(() => {
    if (!activeRun) {
      return displayedCandidates.filter((candidate: AppRecord) => {
        if (candidate.is_control || candidate.status !== 'pending') return true
        return Number(candidate.candidate_id) === Number(run?.current_candidate_id)
      })
    }
    const importantIds = new Set([
      Number(currentBestCandidate?.candidate_id),
      Number(run?.current_candidate_id),
    ].filter(Number.isFinite))
    return displayedCandidates.filter((candidate: AppRecord) => candidate.is_control || importantIds.has(Number(candidate.candidate_id)))
  }, [activeRun, currentBestCandidate?.candidate_id, displayedCandidates, run?.current_candidate_id])

  const selectedCandidate = useMemo(
    () => displayedCandidates.find((item: AppRecord) => item.candidate_id === selectedCandidateId) || null,
    [displayedCandidates, selectedCandidateId],
  )

  const parameterCandidate = useMemo(
    () => displayedCandidates.find((item: AppRecord) => item.candidate_id === parameterCandidateId) || null,
    [displayedCandidates, parameterCandidateId],
  )

  const selectedMethod = useMemo(
    () => (catalog?.methods || []).find((item: AppRecord) => item.id === method) || null,
    [catalog?.methods, method],
  )

  const active = activeRun
  const candidateCardMethod = run?.id && runMatchesCurrentBaseline ? run.method : method
  const probabilityMode = method === PROBABILITY_METHOD
  const adaptiveMode = probabilityMode
  const temporalStrategy = strategy?.strategy_kind === 'temporal_intelligence'
  const temporalModes = Array.isArray(catalog?.temporal_tuning_modes) ? catalog.temporal_tuning_modes : []
  const selectedTemporalMode = temporalStrategy
    ? (temporalModes.find((item: AppRecord) => item.id === temporalTuningTarget) || temporalModes[0] || null)
    : null
  const effectivePlan = selectedTemporalMode || catalog
  const temporalModelMode = temporalStrategy && temporalTuningTarget === 'temporal_model'
  const temporalPolicyMode = temporalStrategy && temporalTuningTarget === 'temporal_policy'
  const temporalTarget = temporalStrategy
  const gateTuning = ['absolute_utility_cash_gate', 'joint_model_absolute_utility_cash_gate'].includes(String(run?.tuning_scope || effectivePlan?.tuning_scope || catalog?.tuning_scope || ''))
  const startActionLabel = temporalModelMode
    ? tr(probabilityMode ? 'Start Temporal Model CARO' : 'Start Temporal Model LHS')
    : temporalPolicyMode
      ? tr(probabilityMode ? 'Start Temporal Policy CARO' : 'Start Temporal Policy LHS')
      : probabilityMode ? tr('Start Unified CARO') : tr('Start Latin Hypercube')
  const filteredStrategyCatalog = useMemo(() => {
    const query = strategySearch.trim().toLowerCase()
    return strategyCatalogItems.filter((item: AppRecord) => {
      if (strategyStatusFilter !== 'all' && String(item.status || 'draft') !== strategyStatusFilter) return false
      if (!query) return true
      return `${item.name || ''} ${item.id || ''} ${item.strategy_kind || ''} ${item.status || ''}`.toLowerCase().includes(query)
    })
  }, [strategyCatalogItems, strategySearch, strategyStatusFilter])
  const selectableStrategyCatalog = useMemo(() => {
    if (!strategy?.id || filteredStrategyCatalog.some((item: AppRecord) => item.id === strategy.id)) return filteredStrategyCatalog
    const selected = strategyCatalogItems.find((item: AppRecord) => item.id === strategy.id)
    return selected ? [selected, ...filteredStrategyCatalog] : filteredStrategyCatalog
  }, [filteredStrategyCatalog, strategy?.id, strategyCatalogItems])
  const strategyStatuses = useMemo(
    () => [...new Set(strategyCatalogItems.map((item: AppRecord) => String(item.status || 'draft')))].sort(),
    [strategyCatalogItems],
  )
  const officialWinner = useMemo(
    () => strategyCatalogItems.find((item: AppRecord) => item.id === officialWinnerId) || null,
    [officialWinnerId, strategyCatalogItems],
  )
  const tuningStartContractCompatible = Number(catalog?.start_request_contract_version || 0) === MODEL_TUNING_START_CONTRACT_VERSION
  const canTune = Boolean(
    canStartTuning
    && strategy
    && tuningStartContractCompatible
    && (temporalStrategy || modelFamily === catalog?.model_family)
    && selectedBaseline
  )
  const workflowStepIndex = active
    ? 2
    : run?.status === 'completed' && runMatchesCurrentBaseline
      ? 3
      : canTune
        ? 1
        : 0
  const foldMinimum = Number(catalog?.fold_protocol?.minimum || 2)
  const foldProtocolValid = Number(researchFolds) >= foldMinimum
    && Number(validationFolds) >= Number(researchFolds)
    && Number(certificationFolds) >= Number(validationFolds)
  const continuationResearchFoldsCompatible = !run?.fold_protocol
    || Number(researchFolds) === Number(run.fold_protocol.research_folds || 3)
  const foldInputDisabled = !canStartTuning || !canTune || active || busy


  async function selectTuningStrategy(strategyId: string) {
    if (!canStartTuning || active || busy || !strategyId || Number(strategyControlRevision || 0) < 1) return
    setBusy(true)
    setError('')
    setNotice('')
    try {
      await apiFetch(`${API}/admin/strategies/${encodeURIComponent(strategyId)}/select-for-model-tuning`, {
        method: 'POST',
        body: {
          expected_control_revision: Number(strategyControlRevision),
          note: 'Selected from Model Tuning research baseline',
        },
      })
      await loadWorkspace()
      setNotice(tr('Research baseline Strategy selected. Status is guidance only; technical compatibility determines whether tuning can start.'))
    } catch (requestError) {
      handleError(requestError)
    } finally {
      setBusy(false)
    }
  }

  async function start() {
    if (!canTune || busy || (temporalStrategy && !foldProtocolValid)) return
    if (temporalModelMode && !window.confirm(tr('Temporal Model Tuning retrains LightGBM for every candidate. Start this campaign now?'))) return
    setBusy(true)
    setError('')
    setNotice('')
    try {
      const body: AppRecord = {
        method,
        candidate_count: Number(candidateCount),
        seed: Number(seed),
      }
      if (temporalStrategy) {
        body.tuning_target = temporalTuningTarget
        body.explicit_start_confirmation = temporalModelMode
        body.fold_protocol = {
          research_folds: Number(researchFolds),
          validation_folds: Number(validationFolds),
          certification_folds: Number(certificationFolds),
        }
      }
      if (adaptiveMode) {
        body.probability = {
          min_capital_improvement: numberOr(minimumCapitalImprovementPct) / 100,
          sharpe_tolerance: numberOr(sharpeTolerance),
          drawdown_tolerance: numberOr(drawdownTolerancePct) / 100,
          min_worst_fold_return: numberOr(minimumWorstFoldPct) / 100,
          adaptive_stopping_enabled: adaptiveStoppingEnabled,
          no_improvement_trial_limit: Number(noImprovementTrialLimit),
          minimum_meaningful_improvement: numberOr(minimumMeaningfulImprovementPct) / 100,
        }
      }
      const created = await apiFetch(`${API}/admin/model-tuning`, { method: 'POST', body })
      setRun(created)
      setNotice(temporalModelMode
        ? tr('Temporal Model Tuning started. Every challenger retrains the Temporal LightGBM models on the same frozen market snapshot and walk-forward protocol.')
        : temporalPolicyMode
          ? tr('Temporal Policy Tuning started. Candidates reuse the frozen Temporal predictions and replay only the Winner-Anchored timing policy.')
          : probabilityMode
            ? tr('Unified CARO started from the certified Candidate Backtest. Exploration and probabilistic refinement are selected automatically throughout the campaign.')
            : tr('Latin Hypercube tuning started from the certified Candidate Backtest.'))
    } catch (requestError) {
      handleError(requestError)
    } finally {
      setBusy(false)
    }
  }


  async function continueResearch() {
    if (!run?.id || run.status !== 'completed' || run.method !== PROBABILITY_METHOD || busy || !tuningStartContractCompatible || !foldProtocolValid || !continuationResearchFoldsCompatible) return
    if (run?.tuning_scope === 'temporal_model' && !window.confirm(tr('Temporal Model Tuning retrains LightGBM for every candidate. Continue this campaign now?'))) return
    setBusy(true)
    setError('')
    setNotice('')
    try {
      const body = {
        method: PROBABILITY_METHOD,
        candidate_count: Number(candidateCount),
        seed: Number(seed),
        source_tuning_run_id: run.id,
        tuning_target: run.tuning_scope,
        explicit_start_confirmation: run.tuning_scope === 'temporal_model',
        fold_protocol: {
          research_folds: Number(researchFolds),
          validation_folds: Number(validationFolds),
          certification_folds: Number(certificationFolds),
        },
        probability: {
          min_capital_improvement: numberOr(minimumCapitalImprovementPct) / 100,
          sharpe_tolerance: numberOr(sharpeTolerance),
          drawdown_tolerance: numberOr(drawdownTolerancePct) / 100,
          min_worst_fold_return: numberOr(minimumWorstFoldPct) / 100,
          adaptive_stopping_enabled: adaptiveStoppingEnabled,
          no_improvement_trial_limit: Number(noImprovementTrialLimit),
          minimum_meaningful_improvement: numberOr(minimumMeaningfulImprovementPct) / 100,
        },
      }
      const created = await apiFetch(`${API}/admin/model-tuning`, { method: 'POST', body })
      setRun(created)
      setNotice(tr('Research continued from the completed CARO campaign. Prior observations were imported and the new budget adds only new trials.'))
    } catch (requestError) {
      handleError(requestError)
    } finally {
      setBusy(false)
    }
  }

  async function validateFinalist(candidate: AppRecord) {
    if (!run?.id || !candidate || busy) return
    setBusy(true)
    setError('')
    setNotice('')
    try {
      await apiFetch(`${API}/admin/model-tuning/${encodeURIComponent(run.id)}/candidates/${candidate.candidate_id}/validate-champion`, {
        method: 'POST',
      })
      const updated = await apiFetch(`${API}/admin/model-tuning/${encodeURIComponent(run.id)}`)
      setRun(updated)
      setNotice(tr('Validation started. The full Temporal LightGBM walk-forward is running in the background. Progress is shown on this candidate.'))
    } catch (requestError) {
      handleError(requestError)
    } finally {
      setBusy(false)
    }
  }

  async function certifyCandidate(candidate: AppRecord) {
    if (!run?.id || !candidate || busy) return
    setBusy(true)
    setError('')
    setNotice('')
    try {
      const certification = await apiFetch(`${API}/admin/model-tuning/${encodeURIComponent(run.id)}/candidates/${candidate.candidate_id}/certify`, {
        method: 'POST',
      })
      const updated = await apiFetch(`${API}/admin/model-tuning/${encodeURIComponent(run.id)}`)
      setRun(updated)
      setNotice(tr('CARO candidate certification completed with the configured certification folds. Trader Winner promotion remains protected until the Temporal live execution engine is installed.'))
      if (certification?.certification_processing_id) viewProcessing(certification.certification_processing_id)
    } catch (requestError) {
      handleError(requestError)
    } finally {
      setBusy(false)
    }
  }

  function viewProcessing(processingId: string) {
    if (!processingId) return
    window.dispatchEvent(new CustomEvent('mct:open-dashboard-processing', {
      detail: { processingId },
    }))
  }

  function viewChampionAnalytics() {
    viewProcessing(run?.certification_processing_id || run?.validation_processing_id)
  }

  async function stop() {
    if (!run?.id || !active || busy) return
    setBusy(true)
    setError('')
    try {
      const updated = await apiFetch(`${API}/admin/model-tuning/${encodeURIComponent(run.id)}/stop`, { method: 'POST' })
      setRun(updated)
      setNotice(tr(run?.tuning_scope === 'temporal_model' ? 'Stop requested. The active Temporal LightGBM candidate will stop at the next model checkpoint and no new candidate will start.' : 'Stop requested. The active tuning candidate is being cancelled and no new candidate will start.'))
    } catch (requestError) {
      handleError(requestError)
    } finally {
      setBusy(false)
    }
  }

  async function adopt(candidate: AppRecord) {
    if (!run?.id || busy) return
    setBusy(true)
    setError('')
    setNotice('')
    try {
      const response = await apiFetch(`${API}/admin/model-tuning/${encodeURIComponent(run.id)}/candidates/${candidate.candidate_id}/adopt`, {
        method: 'POST',
        body: {},
      })
      if (response?.recommended_tuning_target) setTemporalTuningTarget(response.recommended_tuning_target)
      setNotice(tr(response?.ready_for_model_tuning
        ? (run?.tuning_scope === 'temporal_model'
          ? 'A new TEMPORAL Strategy was created with the tuned LightGBM model and selected for the next Policy Tuning stage.'
          : 'A new TEMPORAL Strategy was created from the tuned policy and selected for Model Tuning.')
        : 'A new Strategy was created from the frozen tuning result and selected as BACKTEST. After a successful Backtest it becomes the active CANDIDATE automatically.'))
      await onStrategyModelSaved?.(response.strategy)
      await loadWorkspace()
    } catch (requestError) {
      handleError(requestError)
    } finally {
      setBusy(false)
    }
  }

  async function exportCampaign() {
    if (!run?.id || exporting) return
    setExporting(true)
    setError('')
    try {
      await downloadFile(
        `${API}/admin/model-tuning/${encodeURIComponent(run.id)}/export.zip`,
        `model_tuning_${run.id}.zip`,
      )
    } catch (requestError) {
      handleError(requestError)
    } finally {
      setExporting(false)
    }
  }

  async function openCampaignLog() {
    if (!run?.id || logLoading) return
    setLogLoading(true)
    setLogError('')
    try {
      const payload = await apiFetch(`${API}/admin/model-tuning/${encodeURIComponent(run.id)}/log`)
      setLogView(normalizeTuningLog(payload, tr('Campaign log')))
    } catch (requestError) {
      if (requestError instanceof ApiError && requestError.status === 401) onSessionExpired?.()
      else setLogError(tr(requestError.message || 'Unable to load diagnostic log.'))
    } finally {
      setLogLoading(false)
    }
  }

  async function openCandidateLog(candidate: AppRecord) {
    if (!run?.id || candidate?.candidate_id === undefined || logLoading) return
    setLogLoading(true)
    setLogError('')
    try {
      const payload = await apiFetch(`${API}/admin/model-tuning/${encodeURIComponent(run.id)}/candidates/${candidate.candidate_id}/log`)
      setLogView(normalizeTuningLog(payload, `${tr('Execution log')} · ${candidateLabel(candidate)}`))
    } catch (requestError) {
      if (requestError instanceof ApiError && requestError.status === 401) onSessionExpired?.()
      else setLogError(tr(requestError.message || 'Unable to load diagnostic log.'))
    } finally {
      setLogLoading(false)
    }
  }

  async function copyDiagnosticLog() {
    const text = String(logView?.log_text || '')
    if (!text) return
    try {
      await navigator.clipboard.writeText(text)
      setNotice(tr('Log copied to clipboard.'))
    } catch {
      setLogError(tr('Unable to copy diagnostic log.'))
    }
  }

  function downloadDiagnosticLog() {
    const text = String(logView?.log_text || '')
    if (!text) return
    const blob = new Blob([text], { type: 'text/plain;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    const candidatePart = logView.candidate_id != null ? `_candidate_${logView.candidate_id}` : '_campaign'
    anchor.href = url
    anchor.download = `model_tuning_${run?.id || 'log'}${candidatePart}.txt`
    document.body.appendChild(anchor)
    anchor.click()
    anchor.remove()
    URL.revokeObjectURL(url)
  }

  if (!catalog) return <div className="backtest-loading-row">{tr('Loading model tuning…')}</div>

  const workspace = {
    active,
    adaptiveMode,
    adaptiveStoppingEnabled,
    adopt,
    baselines,
    busy,
    canExportTuning,
    canPromoteTuning,
    canStartTuning,
    canStopTuning,
    canTune,
    canViewTuningLogs,
    candidateCardMethod,
    candidateCount,
    catalog,
    certificationFolds,
    certifyCandidate,
    continuationResearchFoldsCompatible,
    continueResearch,
    copyDiagnosticLog,
    currentBestCandidate,
    currentBestImprovement,
    downloadDiagnosticLog,
    drawdownTolerancePct,
    effectivePlan,
    error,
    exportCampaign,
    exporting,
    foldInputDisabled,
    foldMinimum,
    foldProtocolValid,
    gateTuning,
    loadWorkspace,
    logError,
    logLoading,
    logView,
    method,
    minimumCapitalImprovementPct,
    minimumMeaningfulImprovementPct,
    minimumWorstFoldPct,
    modelFamily,
    noImprovementTrialLimit,
    notice,
    officialWinner,
    openCampaignLog,
    openCandidateLog,
    parameterCandidate,
    probabilityMode,
    researchFolds,
    run,
    runMatchesCurrentBaseline,
    seed,
    selectTuningStrategy,
    selectableStrategyCatalog,
    selectedBaseline,
    selectedCandidate,
    selectedMethod,
    setAdaptiveStoppingEnabled,
    setCandidateCount,
    setCertificationFolds,
    setDrawdownTolerancePct,
    setLogError,
    setLogView,
    setMethod,
    setMinimumCapitalImprovementPct,
    setMinimumMeaningfulImprovementPct,
    setMinimumWorstFoldPct,
    setNoImprovementTrialLimit,
    setParameterCandidateId,
    setResearchFolds,
    setSeed,
    setSelectedCandidateId,
    setSharpeTolerance,
    setStrategySearch,
    setStrategyStatusFilter,
    setTemporalTuningTarget,
    setValidationFolds,
    sharpeTolerance,
    start,
    startActionLabel,
    stop,
    strategy,
    strategySearch,
    strategyStatusFilter,
    strategyStatuses,
    temporalModelMode,
    temporalModes,
    temporalPolicyMode,
    temporalStrategy,
    temporalTarget,
    temporalTuningTarget,
    tuningStartContractCompatible,
    validateFinalist,
    validationFolds,
    viewChampionAnalytics,
    viewProcessing,
    visibleCandidates,
    workflowStepIndex
  }

  return <ModelTuningWorkspaceView workspace={workspace} />
}
