import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import { ApiError, apiFetch, downloadFile } from '../api/http'
import { hasCapability } from '../auth/capabilities'
import { API } from '../config/env'
import { tr } from '../i18n/runtime'
import { evidenceWorkflowState, manualCandidateText, numberListText, numberValue, optionalNumber, parseManualCandidates, parseNumberList, preferredDiagnosticCandidateId, statusLabel, toInput } from './temporalRotationQuality/temporalRotationQualityUtils'
import { TemporalRotationQualityView } from './temporalRotationQuality/components/TemporalRotationQualityView'

const ACTIVE = new Set(['queued', 'running'])
const DIAGNOSTIC_ACTIVE = new Set(['queued', 'running', 'stop_requested'])

export function TemporalRotationQualityPanel({ capabilities = {}, onSessionExpired, sourceRun = null }: AppRecord) {
  const canManage = hasCapability(capabilities, 'research.manage')
  const canExport = hasCapability(capabilities, 'temporal_intelligence.export')
  const [config, setConfig] = useState(null)
  const [researchForm, setResearchForm] = useState(null)
  const [researches, setResearches] = useState([])
  const [research, setResearch] = useState(null)
  const [candidates, setCandidates] = useState([])
  const [selectedCandidates, setSelectedCandidates] = useState([])
  const [validations, setValidations] = useState([])
  const [validation, setValidation] = useState(null)
  const [validationForm, setValidationForm] = useState(null)
  const [certificationForm, setCertificationForm] = useState(null)
  const [diagnosticForm, setDiagnosticForm] = useState(null)
  const [diagnostics, setDiagnostics] = useState([])
  const [diagnostic, setDiagnostic] = useState(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [error, setError] = useState('')
  const timerRef = useRef(null)

  const handleError = useCallback((requestError: ErrorLike) => {
    if (requestError instanceof ApiError && requestError.status === 401) {
      onSessionExpired?.()
      return
    }
    if (requestError instanceof ApiError && requestError.status === 403) {
      setError('')
      return
    }
    setError(tr(requestError?.message || 'Unable to manage Rotation Quality research.'))
  }, [onSessionExpired])

  const buildFormsFromConfig = useCallback((nextConfig: AppRecord) => {
    const defaults = nextConfig?.defaults || {}
    const caro = defaults.caro || {}
    const grid = defaults.grid || {}
    const strong = defaults.strong_challenger_override || {}
    const gate = defaults.research_gate || {}
    setResearchForm((current: any) => current || {
      source_run_id: sourceRun?.id || '',
      search_method: defaults.search_method || nextConfig?.search_methods?.[0]?.id || '',
      focus_month: defaults.focus_month || '',
      control_tolerance_usd: toInput(defaults.control_tolerance_usd),
      strong_challenger_override: Boolean(strong.enabled),
      baseline_drawdown_trigger: toInput(strong.baseline_drawdown_trigger),
      baseline_rotation_score_tolerance: toInput(strong.baseline_rotation_score_tolerance),
      challenger_quality_floors: numberListText(strong.challenger_quality_floors),
      drawdown_triggers: numberListText(grid.drawdown_triggers),
      rotation_score_tolerances: numberListText(grid.rotation_score_tolerances),
      manual_candidates: manualCandidateText(defaults.manual_candidates),
      caro: Object.fromEntries(Object.entries(caro).map(([key, value]: any[]) => [key, toInput(value)])),
      research_gate: Object.fromEntries(Object.entries(gate).map(([key, value]: any[]) => [key, toInput(value)])),
    })
    const validationDefaults = defaults.validation || {}
    const certificationDefaults = defaults.certification || {}
    setValidationForm((current: any) => current || Object.fromEntries(Object.entries(validationDefaults).map(([key, value]: any[]) => [key, toInput(value)])))
    setCertificationForm((current: any) => current || Object.fromEntries(Object.entries(certificationDefaults).map(([key, value]: any[]) => [key, toInput(value)])))
    const diagnosticDefaults = nextConfig?.diagnostics?.defaults || {}
    setDiagnosticForm((current: any) => current || {
      candidate_id: '',
      lookback_sessions: toInput(diagnosticDefaults.lookback_sessions),
      feature_names: Array.isArray(diagnosticDefaults.feature_names) ? [...diagnosticDefaults.feature_names] : [],
      minimum_group_samples: toInput(diagnosticDefaults.minimum_group_samples),
      outcome_neutral_band: toInput(diagnosticDefaults.outcome_neutral_band),
      top_feature_count: toInput(diagnosticDefaults.top_feature_count),
    })
  }, [sourceRun?.id])

  const loadResearchHistory = useCallback(async () => {
    const payload = await apiFetch(`${API}/temporal-rotation-quality-research?limit=30`)
    const items = Array.isArray(payload?.items) ? payload.items : []
    setResearches(items)
    return items
  }, [])

  const loadWorkspace = useCallback(async () => {
    setLoading(true)
    try {
      const [nextConfig, items] = await Promise.all([
        apiFetch(`${API}/temporal-rotation-quality-research/config`),
        loadResearchHistory(),
      ])
      setConfig(nextConfig)
      buildFormsFromConfig(nextConfig)
      const active = items.find((item: AppRecord) => ACTIVE.has(String(item.status || '').toLowerCase()))
      const latest = active || items[0] || null
      if (latest?.id) {
        const detail = await apiFetch(`${API}/temporal-rotation-quality-research/${encodeURIComponent(latest.id)}`)
        setResearch(detail)
      }
      setError('')
    } catch (requestError) {
      handleError(requestError)
    } finally {
      setLoading(false)
    }
  }, [buildFormsFromConfig, handleError, loadResearchHistory])

  useEffect(() => { loadWorkspace() }, [loadWorkspace])

  useEffect(() => {
    if (!sourceRun?.id) return
    setResearchForm((current: any) => current && !current.source_run_id ? { ...current, source_run_id: sourceRun.id } : current)
  }, [sourceRun?.id])

  const loadDiagnostics = useCallback(async (researchId: string, validationId: string, { selectLatest = true }: AppRecord = {}) => {
    if (!researchId || !validationId) {
      setDiagnostics([])
      setDiagnostic(null)
      return []
    }
    const payload = await apiFetch(`${API}/temporal-rotation-quality-research/${encodeURIComponent(researchId)}/validations/${encodeURIComponent(validationId)}/diagnostics?limit=30`).catch(() => ({ items: [] as AppRecord[] }))
    const items = Array.isArray(payload?.items) ? payload.items : []
    setDiagnostics(items)
    if (selectLatest) {
      const active = items.find((item: AppRecord) => DIAGNOSTIC_ACTIVE.has(String(item.status || '').toLowerCase()))
      const latest = active || items[0] || null
      if (latest?.id) {
        const detail = await apiFetch(`${API}/temporal-rotation-quality-research/${encodeURIComponent(researchId)}/validations/${encodeURIComponent(validationId)}/diagnostics/${encodeURIComponent(latest.id)}`)
        setDiagnostic(detail)
      } else {
        setDiagnostic(null)
      }
    }
    return items
  }, [])

  const loadResearchDetail = useCallback(async (researchId: string, { selectDefaults = false }: AppRecord = {}) => {
    if (!researchId) return null
    const [detail, candidatePayload, validationPayload] = await Promise.all([
      apiFetch(`${API}/temporal-rotation-quality-research/${encodeURIComponent(researchId)}`),
      apiFetch(`${API}/temporal-rotation-quality-research/${encodeURIComponent(researchId)}/candidates?limit=2000`).catch(() => ({ items: [] as AppRecord[] })),
      apiFetch(`${API}/temporal-rotation-quality-research/${encodeURIComponent(researchId)}/validations?limit=30`).catch(() => ({ items: [] as AppRecord[] })),
    ])
    const nextCandidates = Array.isArray(candidatePayload?.items) ? candidatePayload.items.filter((item: AppRecord) => item.candidate_id !== 'CONTROL') : []
    const nextValidations = Array.isArray(validationPayload?.items) ? validationPayload.items : []
    setResearch(detail)
    setCandidates(nextCandidates)
    setValidations(nextValidations)
    if (selectDefaults) {
      const robustIds = nextCandidates.filter((item: AppRecord) => item.robust_vs_control).map((item: AppRecord) => item.candidate_id)
      setSelectedCandidates(robustIds.length ? robustIds : detail?.best_candidate?.candidate_id ? [detail.best_candidate.candidate_id] : [])
    }
    const activeEvidence = nextValidations.find((item: AppRecord) => ACTIVE.has(String(item.status || '').toLowerCase()))
    const latestCertification = nextValidations.find((item: AppRecord) => item.kind === 'certification' && String(item.status || '').toLowerCase() === 'completed')
    const latestValidation = nextValidations.find((item: AppRecord) => item.kind !== 'certification' && String(item.status || '').toLowerCase() === 'completed')
    const latestEvidence = activeEvidence || latestCertification || latestValidation || nextValidations[0] || null
    if (latestEvidence?.id) {
      const evidenceDetail = await apiFetch(`${API}/temporal-rotation-quality-research/${encodeURIComponent(researchId)}/validations/${encodeURIComponent(latestEvidence.id)}`)
      setValidation(evidenceDetail)
      setDiagnosticForm((current: any) => current ? { ...current, candidate_id: preferredDiagnosticCandidateId(evidenceDetail) || current.candidate_id || '' } : current)
      await loadDiagnostics(researchId, latestEvidence.id)
    } else {
      setValidation(null)
      setDiagnostics([])
      setDiagnostic(null)
    }
    return detail
  }, [loadDiagnostics])

  useEffect(() => {
    if (!research?.id || String(research.status || '').toLowerCase() !== 'completed') return
    loadResearchDetail(research.id, { selectDefaults: candidates.length === 0 }).catch(handleError)
  }, [candidates.length, handleError, loadResearchDetail, research?.id, research?.status])

  useEffect(() => {
    if (timerRef.current) window.clearInterval(timerRef.current)
    timerRef.current = null
    const researchActive = research?.id && ACTIVE.has(String(research.status || '').toLowerCase())
    const validationActive = validation?.id && ACTIVE.has(String(validation.status || '').toLowerCase())
    const diagnosticActive = diagnostic?.id && DIAGNOSTIC_ACTIVE.has(String(diagnostic.status || '').toLowerCase())
    if (!researchActive && !validationActive && !diagnosticActive) return undefined
    timerRef.current = window.setInterval(async () => {
      try {
        if (researchActive) {
          const updated = await apiFetch(`${API}/temporal-rotation-quality-research/${encodeURIComponent(research.id)}`)
          setResearch(updated)
          if (String(updated.status || '').toLowerCase() === 'completed') {
            await loadResearchHistory()
            await loadResearchDetail(updated.id, { selectDefaults: true })
          }
        }
        if (validationActive) {
          const updated = await apiFetch(`${API}/temporal-rotation-quality-research/${encodeURIComponent(validation.research_id)}/validations/${encodeURIComponent(validation.id)}`)
          setValidation(updated)
          if (String(updated.status || '').toLowerCase() === 'completed') {
            const payload = await apiFetch(`${API}/temporal-rotation-quality-research/${encodeURIComponent(updated.research_id)}/validations?limit=30`)
            setValidations(Array.isArray(payload?.items) ? payload.items : [])
          }
        }
        if (diagnosticActive) {
          const updated = await apiFetch(`${API}/temporal-rotation-quality-research/${encodeURIComponent(diagnostic.research_id)}/validations/${encodeURIComponent(diagnostic.validation_id)}/diagnostics/${encodeURIComponent(diagnostic.id)}`)
          setDiagnostic(updated)
          if (!DIAGNOSTIC_ACTIVE.has(String(updated.status || '').toLowerCase())) {
            await loadDiagnostics(updated.research_id, updated.validation_id, { selectLatest: false })
          }
        }
      } catch (requestError) {
        handleError(requestError)
      }
    }, 2500)
    return () => {
      if (timerRef.current) window.clearInterval(timerRef.current)
      timerRef.current = null
    }
  }, [diagnostic?.id, diagnostic?.research_id, diagnostic?.status, diagnostic?.validation_id, handleError, loadDiagnostics, loadResearchDetail, loadResearchHistory, research?.id, research?.status, validation?.id, validation?.research_id, validation?.status])

  const updateResearch = (key: string, value: any) => setResearchForm((current: any) => ({ ...current, [key]: value }))
  const updateCaro = (key: string, value: any) => setResearchForm((current: any) => ({ ...current, caro: { ...current.caro, [key]: value } }))
  const updateGate = (key: string, value: any) => setResearchForm((current: any) => ({ ...current, research_gate: { ...current.research_gate, [key]: value } }))

  async function startResearch() {
    if (!canManage || busy || !researchForm?.source_run_id) return
    setBusy(true)
    setError('')
    try {
      const body: AppRecord = {
        source_run_id: researchForm.source_run_id.trim(),
        search_method: researchForm.search_method,
        focus_month: researchForm.focus_month || null,
        control_tolerance_usd: numberValue(researchForm.control_tolerance_usd),
        strong_challenger_override: Boolean(researchForm.strong_challenger_override),
        baseline_drawdown_trigger: researchForm.strong_challenger_override ? optionalNumber(researchForm.baseline_drawdown_trigger) : null,
        baseline_rotation_score_tolerance: researchForm.strong_challenger_override ? optionalNumber(researchForm.baseline_rotation_score_tolerance) : null,
        research_gate: {
          minimum_capital_lift: numberValue(researchForm.research_gate.minimum_capital_lift),
          minimum_sharpe_delta: numberValue(researchForm.research_gate.minimum_sharpe_delta),
          minimum_max_drawdown_delta: numberValue(researchForm.research_gate.minimum_max_drawdown_delta),
          required_fold_wins: optionalNumber(researchForm.research_gate.required_fold_wins),
        },
      }
      if (researchForm.search_method === 'grid') {
        if (researchForm.strong_challenger_override) {
          body.challenger_quality_floors = parseNumberList(researchForm.challenger_quality_floors)
        } else {
          body.drawdown_triggers = parseNumberList(researchForm.drawdown_triggers)
          body.rotation_score_tolerances = parseNumberList(researchForm.rotation_score_tolerances)
        }
      } else if (researchForm.search_method === 'manual') {
        body.manual_candidates = parseManualCandidates(researchForm.manual_candidates)
      } else if (researchForm.search_method === 'caro') {
        body.caro = Object.fromEntries(Object.entries(researchForm.caro).map(([key, value]: any[]) => {
          if (key === 'minimum_exploration_trials') return [key, optionalNumber(value)]
          return [key, numberValue(value)]
        }))
      }
      const created = await apiFetch(`${API}/temporal-rotation-quality-research/runs`, { method: 'POST', body })
      setResearch(created)
      setCandidates([])
      setSelectedCandidates([])
      setValidation(null)
      setValidations([])
      await loadResearchHistory()
    } catch (requestError) {
      handleError(requestError)
    } finally {
      setBusy(false)
    }
  }

  async function selectResearch(researchId: string) {
    setBusy(true)
    setError('')
    try {
      await loadResearchDetail(researchId, { selectDefaults: true })
    } catch (requestError) {
      handleError(requestError)
    } finally {
      setBusy(false)
    }
  }

  function toggleCandidate(candidateId: string) {
    setSelectedCandidates((current: any) => current.includes(candidateId) ? current.filter((id: string) => id !== candidateId) : [...current, candidateId])
  }

  async function startEvidence(kind: string) {
    if (!canManage || !research?.id || !selectedCandidates.length || busy) return
    const form = kind === 'certification' ? certificationForm : validationForm
    if (!form) return
    setBusy(true)
    setError('')
    try {
      const body = {
        kind,
        fold_count: numberValue(form.fold_count),
        required_fold_wins: optionalNumber(form.required_fold_wins),
        candidate_ids: selectedCandidates,
        minimum_capital_lift: numberValue(form.minimum_capital_lift),
        minimum_sharpe_delta: numberValue(form.minimum_sharpe_delta),
        minimum_max_drawdown_delta: numberValue(form.minimum_max_drawdown_delta),
      }
      const created = await apiFetch(`${API}/temporal-rotation-quality-research/${encodeURIComponent(research.id)}/validate`, { method: 'POST', body })
      setValidation(created)
      setValidations((current: any) => [created, ...current.filter((item: AppRecord) => item.id !== created.id)])
    } catch (requestError) {
      handleError(requestError)
    } finally {
      setBusy(false)
    }
  }

  async function selectValidation(validationId: string) {
    if (!research?.id || !validationId) return
    setBusy(true)
    try {
      const detail = await apiFetch(`${API}/temporal-rotation-quality-research/${encodeURIComponent(research.id)}/validations/${encodeURIComponent(validationId)}`)
      setValidation(detail)
      setDiagnosticForm((current: any) => current ? { ...current, candidate_id: preferredDiagnosticCandidateId(detail) || current.candidate_id || '' } : current)
      await loadDiagnostics(research.id, validationId)
    } catch (requestError) {
      handleError(requestError)
    } finally {
      setBusy(false)
    }
  }

  async function exportResearch() {
    if (!canExport || !research?.id || research.status !== 'completed' || exporting) return
    setExporting(true)
    try {
      await downloadFile(`${API}/temporal-rotation-quality-research/${encodeURIComponent(research.id)}/export.zip`, `temporal_rotation_quality_${research.id}.zip`)
    } catch (requestError) {
      handleError(requestError)
    } finally {
      setExporting(false)
    }
  }

  async function exportValidation() {
    if (!canExport || !validation?.id || validation.status !== 'completed' || exporting) return
    setExporting(true)
    try {
      await downloadFile(`${API}/temporal-rotation-quality-research/${encodeURIComponent(validation.research_id)}/validations/${encodeURIComponent(validation.id)}/export.zip`, `temporal_rotation_quality_${validation.id}.zip`)
    } catch (requestError) {
      handleError(requestError)
    } finally {
      setExporting(false)
    }
  }

  function toggleDiagnosticFeature(feature: AppRecord) {
    setDiagnosticForm((current: any) => {
      if (!current) return current
      const names = Array.isArray(current.feature_names) ? current.feature_names : []
      return { ...current, feature_names: names.includes(feature) ? names.filter((item: AppRecord) => item !== feature) : [...names, feature] }
    })
  }

  async function startDiagnostic() {
    if (!canManage || !research?.id || !validation?.id || validation.status !== 'completed' || !diagnosticForm?.candidate_id || busy) return
    setBusy(true)
    setError('')
    try {
      const body = {
        candidate_id: diagnosticForm.candidate_id,
        lookback_sessions: numberValue(diagnosticForm.lookback_sessions),
        feature_names: diagnosticForm.feature_names,
        minimum_group_samples: numberValue(diagnosticForm.minimum_group_samples),
        outcome_neutral_band: numberValue(diagnosticForm.outcome_neutral_band),
        top_feature_count: numberValue(diagnosticForm.top_feature_count),
      }
      const created = await apiFetch(`${API}/temporal-rotation-quality-research/${encodeURIComponent(research.id)}/validations/${encodeURIComponent(validation.id)}/diagnostics`, { method: 'POST', body })
      setDiagnostic(created)
      setDiagnostics((current: any) => [created, ...current.filter((item: AppRecord) => item.id !== created.id)])
    } catch (requestError) {
      handleError(requestError)
    } finally {
      setBusy(false)
    }
  }

  async function stopDiagnostic() {
    if (!canManage || !diagnostic?.id || !DIAGNOSTIC_ACTIVE.has(String(diagnostic.status || '').toLowerCase()) || busy) return
    setBusy(true)
    try {
      const updated = await apiFetch(`${API}/temporal-rotation-quality-research/${encodeURIComponent(diagnostic.research_id)}/validations/${encodeURIComponent(diagnostic.validation_id)}/diagnostics/${encodeURIComponent(diagnostic.id)}/stop`, { method: 'POST' })
      setDiagnostic(updated)
    } catch (requestError) {
      handleError(requestError)
    } finally {
      setBusy(false)
    }
  }

  async function selectDiagnostic(diagnosticId: string) {
    if (!research?.id || !validation?.id || !diagnosticId) return
    setBusy(true)
    try {
      const detail = await apiFetch(`${API}/temporal-rotation-quality-research/${encodeURIComponent(research.id)}/validations/${encodeURIComponent(validation.id)}/diagnostics/${encodeURIComponent(diagnosticId)}`)
      setDiagnostic(detail)
    } catch (requestError) {
      handleError(requestError)
    } finally {
      setBusy(false)
    }
  }

  async function exportDiagnostic() {
    if (!canExport || !diagnostic?.id || diagnostic.status !== 'completed' || exporting) return
    setExporting(true)
    try {
      await downloadFile(`${API}/temporal-rotation-quality-research/${encodeURIComponent(diagnostic.research_id)}/validations/${encodeURIComponent(diagnostic.validation_id)}/diagnostics/${encodeURIComponent(diagnostic.id)}/export.zip`, `temporal_rotation_quality_diagnostic_${diagnostic.id}.zip`)
    } catch (requestError) {
      handleError(requestError)
    } finally {
      setExporting(false)
    }
  }

  const method = researchForm?.search_method || ''
  const limits = config?.limits || {}
  const researchActive = ACTIVE.has(String(research?.status || '').toLowerCase())
  const evidenceActive = ACTIVE.has(String(validation?.status || '').toLowerCase())
  const diagnosticActive = DIAGNOSTIC_ACTIVE.has(String(diagnostic?.status || '').toLowerCase())
  const disabled = busy || researchActive || evidenceActive || diagnosticActive

  const candidateRows = useMemo(() => [...candidates].sort((a: any, b: any) => Number(b.ending_capital || 0) - Number(a.ending_capital || 0)), [candidates])
  const completedEvidence = useMemo(
    () => validations.filter((item: AppRecord) => String(item.status || '').toLowerCase() === 'completed'),
    [validations],
  )
  const latestValidationSummary = useMemo(
    () => validations.find((item: AppRecord) => item.kind !== 'certification' && String(item.status || '').toLowerCase() === 'completed') || null,
    [validations],
  )
  const latestCertificationSummary = useMemo(
    () => validations.find((item: AppRecord) => item.kind === 'certification' && String(item.status || '').toLowerCase() === 'completed') || null,
    [validations],
  )

  const researchWorkflowState = researchActive ? statusLabel(research?.status) : research?.status === 'completed' ? 'Completed' : '—'
  const validationWorkflowState = evidenceWorkflowState(latestValidationSummary)
  const certificationWorkflowState = evidenceWorkflowState(latestCertificationSummary)
  const diagnosticWorkflowState = diagnosticActive
    ? statusLabel(diagnostic?.status)
    : diagnostic?.status === 'completed'
      ? 'Completed'
      : latestCertificationSummary
        ? 'Next'
        : '—'

  if (loading || !researchForm || !config) return <div className="temporal-loading"><span className="loading-ring" />{tr('Loading Rotation Quality Research…')}</div>

    const workspace = {
    busy,
    canExport,
    canManage,
    candidateRows,
    certificationForm,
    certificationWorkflowState,
    completedEvidence,
    config,
    diagnostic,
    diagnosticActive,
    diagnosticForm,
    diagnosticWorkflowState,
    diagnostics,
    disabled,
    error,
    exportDiagnostic,
    exportResearch,
    exportValidation,
    exporting,
    latestCertificationSummary,
    limits,
    method,
    research,
    researchActive,
    researchForm,
    researchWorkflowState,
    researches,
    selectDiagnostic,
    selectResearch,
    selectValidation,
    selectedCandidates,
    setCertificationForm,
    setDiagnosticForm,
    setValidationForm,
    startDiagnostic,
    startEvidence,
    startResearch,
    stopDiagnostic,
    toggleCandidate,
    toggleDiagnosticFeature,
    updateCaro,
    updateGate,
    updateResearch,
    validation,
    validationForm,
    validationWorkflowState,
    validations
  }

  return <TemporalRotationQualityView workspace={workspace} />
}
