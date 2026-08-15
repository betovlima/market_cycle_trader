import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import { ApiError, apiFetch, downloadFile } from '../api/http'
import { hasCapability } from '../auth/capabilities'
import { API } from '../config/env'
import { tr } from '../i18n/runtime'
import { ParameterHint } from '../shared/components/ParameterHint'
import { CANDIDATE_RANKING_HINTS } from './modelTuning/modelTuningCandidateHints'
import { ACTIVE, PROBABILITY_METHOD } from './modelTuning/modelTuningConfig'
import { candidateLabel, decimal, money, numberOr, pct } from './modelTuning/modelTuningUtils'

function CandidateCardMetric({ candidateId, label, value, tone = '' }) {
  const hint = CANDIDATE_RANKING_HINTS[label]
  return (
    <div className={`model-tuning-candidate-metric ${tone}`}>
      <span className="model-tuning-candidate-metric-label">
        <span>{tr(label)}</span>
        {hint ? <ParameterHint id={`model-tuning-card-${candidateId}-${label.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`} title={tr(label)} {...hint} /> : null}
      </span>
      <strong>{value}</strong>
    </div>
  )
}

function tuningSettingValue(value) {
  if (typeof value === 'number') {
    if (Number.isInteger(value)) return String(value)
    return Number(value).toPrecision(7).replace(/0+$/, '').replace(/\.$/, '')
  }
  if (typeof value === 'boolean') return value ? tr('Yes') : tr('No')
  return value == null ? '—' : String(value)
}

function CandidateParametersGrid({ settings }) {
  const entries = Object.entries(settings || {})
  if (!entries.length) return null
  return (
    <div className="model-tuning-parameters-dialog-grid">
      {entries.map(([name, value]) => (
        <div key={name} className="model-tuning-parameters-dialog-row">
          <span title={name}>{name}</span>
          <strong>{tuningSettingValue(value)}</strong>
        </div>
      ))}
    </div>
  )
}

function signedMetricTone(value) {
  const parsed = Number(value)
  if (!Number.isFinite(parsed) || parsed === 0) return 'neutral'
  return parsed > 0 ? 'positive' : 'negative'
}

function probabilityMetricTone(value) {
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) return 'neutral'
  if (parsed >= 0.65) return 'positive'
  if (parsed >= 0.35) return 'warning'
  return 'negative'
}

function TuningContextLabel({ id, label, description, align = 'left' }) {
  return (
    <span className="model-tuning-context-label">
      <span>{tr(label)}</span>
      {description ? <ParameterHint id={id} title={tr(label)} description={description} align={align} /> : null}
    </span>
  )
}

export function ModelTuningPanel({ capabilities = {}, onSessionExpired, onStrategyModelSaved }) {
  const canStartTuning = hasCapability(capabilities, 'tuning.start')
  const canStopTuning = hasCapability(capabilities, 'tuning.stop')
  const canExportTuning = hasCapability(capabilities, 'tuning.export')
  const canViewTuningLogs = hasCapability(capabilities, 'tuning.logs.view')
  const canPromoteTuning = hasCapability(capabilities, 'tuning.promote')
  const [catalog, setCatalog] = useState(null)
  const [strategy, setStrategy] = useState(null)
  const [modelFamily, setModelFamily] = useState('')
  const [baselines, setBaselines] = useState([])
  const [run, setRun] = useState(null)
  const [method, setMethod] = useState(PROBABILITY_METHOD)
  const [candidateCount, setCandidateCount] = useState(20)
  const [seed, setSeed] = useState(42)
  const [minimumCapitalImprovementPct, setMinimumCapitalImprovementPct] = useState('')
  const [sharpeTolerance, setSharpeTolerance] = useState('')
  const [drawdownTolerancePct, setDrawdownTolerancePct] = useState('')
  const [minimumWorstFoldPct, setMinimumWorstFoldPct] = useState('')
  const [busy, setBusy] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [selectedCandidateId, setSelectedCandidateId] = useState(null)
  const [parameterCandidateId, setParameterCandidateId] = useState(null)
  const [logView, setLogView] = useState(null)
  const [logLoading, setLogLoading] = useState(false)
  const [logError, setLogError] = useState('')
  const timerRef = useRef(null)

  const handleError = useCallback((requestError) => {
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
      const [nextCatalog, control] = await Promise.all([
        apiFetch(`${API}/admin/model-tuning/catalog`),
        apiFetch(`${API}/admin/strategies/control`),
      ])
      const strategyId = control?.candidate_strategy_id || control?.promoted_candidate_strategy_id || control?.research_strategy_id
      const detail = strategyId ? await apiFetch(`${API}/admin/strategies/${encodeURIComponent(strategyId)}`) : null
      const [baselinePayload] = await Promise.all([
        apiFetch(`${API}/admin/model-tuning/baselines?limit=20`),
        loadLatest(),
      ])
      const items = Array.isArray(baselinePayload?.items) ? baselinePayload.items : []
      const savedModel = detail?.research_model_configuration || detail?.research_model || null
      const probability = nextCatalog?.probability || {}
      setCatalog(nextCatalog)
      setStrategy(detail)
      setModelFamily(savedModel?.family || '')
      setBaselines(items)
      setCandidateCount(nextCatalog.default_candidate_count || 20)
      setSeed(nextCatalog.default_seed ?? 42)
      setMinimumCapitalImprovementPct(String(numberOr(probability.default_min_capital_improvement) * 100))
      setSharpeTolerance(String(probability.default_sharpe_tolerance ?? ''))
      setDrawdownTolerancePct(String(numberOr(probability.default_drawdown_tolerance) * 100))
      setMinimumWorstFoldPct(String(numberOr(probability.default_min_worst_fold_return) * 100))
      setError('')
    } catch (requestError) {
      handleError(requestError)
    }
  }, [handleError, loadLatest])

  useEffect(() => {
    loadWorkspace()
  }, [loadWorkspace])

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

  const sortedCandidates = useMemo(() => {
    const items = [...(run?.candidates || [])]
    items.sort((left, right) => {
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
    return {
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
  }, [selectedBaseline])

  const runControlCandidate = useMemo(
    () => sortedCandidates.find((candidate) => candidate.is_control) || null,
    [sortedCandidates],
  )
  const runBaselineJobId = String(run?.baseline_execution?.job_id || runControlCandidate?.source_job_id || runControlCandidate?.job_id || '')
  const currentBaselineJobId = String(selectedBaseline?.job_id || '')
  const runMatchesCurrentBaseline = !currentBaselineJobId || !runBaselineJobId || currentBaselineJobId === runBaselineJobId

  const displayedCandidates = useMemo(() => {
    const control = activeRun ? (runControlCandidate || baselineControlCandidate) : (baselineControlCandidate || runControlCandidate)
    const challengers = (activeRun || runMatchesCurrentBaseline)
      ? sortedCandidates.filter((candidate) => !candidate.is_control)
      : []
    return control ? [control, ...challengers] : challengers
  }, [activeRun, baselineControlCandidate, runControlCandidate, runMatchesCurrentBaseline, sortedCandidates])

  const visibleCandidates = useMemo(
    () => displayedCandidates.filter((candidate) => {
      if (candidate.is_control || candidate.status !== 'pending') return true
      return Number(candidate.candidate_id) === Number(run?.current_candidate_id)
    }),
    [displayedCandidates, run?.current_candidate_id],
  )

  const selectedCandidate = useMemo(
    () => displayedCandidates.find((item) => item.candidate_id === selectedCandidateId) || null,
    [displayedCandidates, selectedCandidateId],
  )

  const parameterCandidate = useMemo(
    () => displayedCandidates.find((item) => item.candidate_id === parameterCandidateId) || null,
    [displayedCandidates, parameterCandidateId],
  )

  const selectedMethod = useMemo(
    () => (catalog?.methods || []).find((item) => item.id === method) || null,
    [catalog?.methods, method],
  )

  const active = activeRun
  const candidateCardMethod = run?.id && runMatchesCurrentBaseline ? run.method : method
  const probabilityMode = method === PROBABILITY_METHOD
  const adaptiveMode = probabilityMode
  const gateTuning = ['absolute_utility_cash_gate', 'joint_model_absolute_utility_cash_gate'].includes(String(run?.tuning_scope || catalog?.tuning_scope || ''))
  const startActionLabel = probabilityMode ? tr('Start Unified CARO') : tr('Start Latin Hypercube')
  const protectedCandidate = Boolean(strategy?.locked && ['candidate', 'promoted_candidate'].includes(String(strategy?.status || '')))
  const canTune = Boolean(
    canStartTuning
    && strategy
    && (!strategy.locked || protectedCandidate)
    && modelFamily === catalog?.model_family
    && selectedBaseline
  )



  async function start() {
    if (!canTune || busy) return
    setBusy(true)
    setError('')
    setNotice('')
    try {
      const body = {
        method,
        candidate_count: Number(candidateCount),
        seed: Number(seed),
      }
      if (adaptiveMode) {
        body.probability = {
          min_capital_improvement: numberOr(minimumCapitalImprovementPct) / 100,
          sharpe_tolerance: numberOr(sharpeTolerance),
          drawdown_tolerance: numberOr(drawdownTolerancePct) / 100,
          min_worst_fold_return: numberOr(minimumWorstFoldPct) / 100,
        }
      }
      const created = await apiFetch(`${API}/admin/model-tuning`, { method: 'POST', body })
      setRun(created)
      setNotice(probabilityMode
        ? tr('Unified CARO started from the certified Candidate Backtest. Exploration and probabilistic refinement are selected automatically throughout the campaign.')
        : tr('Latin Hypercube tuning started from the certified Candidate Backtest.'))
    } catch (requestError) {
      handleError(requestError)
    } finally {
      setBusy(false)
    }
  }

  async function stop() {
    if (!run?.id || !active || busy) return
    setBusy(true)
    setError('')
    try {
      const updated = await apiFetch(`${API}/admin/model-tuning/${encodeURIComponent(run.id)}/stop`, { method: 'POST' })
      setRun(updated)
      setNotice(tr('Stop requested. The active tuning candidate is being cancelled and no new candidate will start.'))
    } catch (requestError) {
      handleError(requestError)
    } finally {
      setBusy(false)
    }
  }

  async function adopt(candidate) {
    if (!run?.id || busy) return
    setBusy(true)
    setError('')
    setNotice('')
    try {
      const response = await apiFetch(`${API}/admin/model-tuning/${encodeURIComponent(run.id)}/candidates/${candidate.candidate_id}/adopt`, {
        method: 'POST',
        body: {},
      })
      setNotice(tr('A new Strategy was created from the frozen tuning result and selected as BACKTEST. After a successful Backtest it becomes the active CANDIDATE automatically.'))
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
      setLogView({ ...payload, title: tr('Campaign log') })
    } catch (requestError) {
      if (requestError instanceof ApiError && requestError.status === 401) onSessionExpired?.()
      else setLogError(tr(requestError.message || 'Unable to load diagnostic log.'))
    } finally {
      setLogLoading(false)
    }
  }

  async function openCandidateLog(candidate) {
    if (!run?.id || candidate?.candidate_id === undefined || logLoading) return
    setLogLoading(true)
    setLogError('')
    try {
      const payload = await apiFetch(`${API}/admin/model-tuning/${encodeURIComponent(run.id)}/candidates/${candidate.candidate_id}/log`)
      setLogView({ ...payload, title: `${tr('Execution log')} · ${candidateLabel(candidate)}` })
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
    const candidatePart = logView?.candidate_id !== undefined ? `_candidate_${logView.candidate_id}` : '_campaign'
    anchor.href = url
    anchor.download = `model_tuning_${run?.id || 'log'}${candidatePart}.txt`
    document.body.appendChild(anchor)
    anchor.click()
    anchor.remove()
    URL.revokeObjectURL(url)
  }

  if (!catalog) return <div className="backtest-loading-row">{tr('Loading model tuning…')}</div>

  return (
    <section className="model-tuning-panel model-tuning-workspace">
      <div className="model-tuning-heading model-tuning-heading-compact">
        <div>
          <span className="panel-kicker">{tr('MODEL TUNING')}</span>
          <h3>{tr('Probabilistic parameter research')}</h3>
        </div>
        <div className="model-tuning-method-badge">{selectedMethod?.label || tr('Model Tuning')}</div>
      </div>

      {error ? <div className="global-inline-message error-inline">{error}</div> : null}
      {notice ? <div className="global-inline-message success-inline">{notice}</div> : null}
      {!strategy ? <div className="global-inline-message warning-inline">{tr('No Candidate or selected Strategy is available for model tuning.')}</div> : null}
      {strategy?.locked && !protectedCandidate ? <div className="global-inline-message warning-inline">{tr('The protected Strategy is not an eligible Candidate tuning target.')}</div> : null}
      {strategy && modelFamily !== catalog.model_family ? <div className="global-inline-message warning-inline">{tr('The current tuning target must use LightGBM.')}</div> : null}
      {strategy && modelFamily === catalog.model_family && !baselines.length ? <div className="global-inline-message warning-inline">{tr("A completed certified Candidate Backtest is required before tuning. Adaptive CARO always uses the active Candidate's certified execution as its baseline.")}</div> : null}

      <div className="model-tuning-context-grid model-tuning-context-grid-wide">
        <div className="model-tuning-context-card model-tuning-target-card">
          <TuningContextLabel
            id="model-tuning-hint-target"
            label="Tuning target"
            description="The active Candidate Strategy whose certified Backtest is used as the starting point for this research campaign."
          />
          <strong title={strategy?.name || ''}>{strategy?.name || '—'}</strong>
          <small>{strategy ? `${tr(strategy.status)} · ${tr('Revision')} ${strategy.revision}` : '—'}</small>
        </div>
        <div className="model-tuning-context-card model-tuning-scope-card">
          <TuningContextLabel
            id="model-tuning-hint-scope"
            label="Tuning scope"
            description={catalog?.tuning_scope_description || 'Defines exactly which parameters Adaptive CARO may change while the remaining experiment stays frozen.'}
          />
          <strong title={tr(catalog?.tuning_scope_label || 'LightGBM model parameters')}>{tr(catalog?.tuning_scope_label || 'LightGBM model parameters')}</strong>
          <small>{catalog?.joint_optimization ? `${(catalog.tuned_parameters || []).length} ${tr('parameters')} · ${(catalog.tuned_model_parameters || []).length} LightGBM · ${(catalog.tuned_strategy_parameters || []).length} MARKET/CASH` : `${(catalog?.tuned_parameters || []).length || catalog?.search_space?.length || 0} ${tr('parameters')}`}</small>
        </div>
        <div className="model-tuning-context-card">
          <TuningContextLabel
            id="model-tuning-hint-saved-model"
            label="Saved model"
            description="Model family currently saved with the Candidate Strategy. Joint CARO may tune the supported LightGBM hyperparameters, while fixed model settings remain unchanged."
          />
          <strong>{strategy?.research_model_configuration?.label || strategy?.research_model?.label || '—'}</strong>
          <small>{modelFamily || '—'}</small>
        </div>
        <div className="model-tuning-context-card worker-online">
          <TuningContextLabel
            id="model-tuning-hint-execution"
            label="Execution"
            description="Candidates run sequentially through the integrated API worker. Each LightGBM training still uses the CPU thread configuration saved in the model/runtime."
            align="right"
          />
          <strong>{tr('Integrated API worker')}</strong>
          <small>{tr('One candidate at a time')}</small>
        </div>
      </div>

      <div className="model-tuning-baseline model-tuning-baseline-compact">
        <div className="model-tuning-baseline-head">
          <div className="model-tuning-baseline-title">
            <span className="model-tuning-context-label">
              <span>{tr('Certified Candidate baseline')}</span>
              <ParameterHint
                id="model-tuning-hint-baseline"
                title={tr('Certified Candidate baseline')}
                description={tr('The API uses the certified Candidate Backtest automatically. No clone, baseline selection or prior tuning campaign is required.')}
              />
            </span>
            <strong title={selectedBaseline?.job_id || ''}>{selectedBaseline?.job_id || tr('No compatible completed baseline execution was found.')}</strong>
          </div>
          <button type="button" className="secondary-action compact model-tuning-refresh" onClick={loadWorkspace} disabled={busy || active}>{tr('Refresh')}</button>
        </div>
        {selectedBaseline ? (
          <div className="model-tuning-baseline-metrics model-tuning-baseline-metrics-compact">
            <div><span>{tr('Capital')}</span><strong>{money(selectedBaseline.metrics?.ending_capital)}</strong></div>
            <div><span>{tr('CAGR')}</span><strong>{pct(selectedBaseline.metrics?.cagr)}</strong></div>
            <div><span>{tr('Sharpe')}</span><strong>{decimal(selectedBaseline.metrics?.sharpe)}</strong></div>
            <div><span>{tr('Max DD')}</span><strong>{pct(selectedBaseline.metrics?.maximum_drawdown)}</strong></div>
            <div><span>{tr('Worst fold')}</span><strong>{pct(selectedBaseline.metrics?.worst_fold_return)}</strong></div>
          </div>
        ) : null}
      </div>

      <div className="model-tuning-method-selector model-tuning-method-selector-compact">
        <label>
          <span className="model-tuning-context-label">
            <span>{tr('Research method')}</span>
            <ParameterHint
              id="model-tuning-hint-method"
              title={selectedMethod?.label || tr('Research method')}
              description={selectedMethod?.description || ''}
            />
          </span>
          <select
            value={method}
            onChange={(event) => setMethod(event.target.value)}
            disabled={!canStartTuning || active || busy}
          >
            {(catalog.methods || []).map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
          </select>
        </label>
        <div className="model-tuning-method-summary"><strong>{selectedMethod?.label || '—'}</strong></div>
      </div>

      <div className="model-tuning-controls">
        <label>
          <span>{tr(probabilityMode ? 'Research budget (trials)' : 'Exploration candidates')}</span>
          <input type="number" min={catalog.candidate_count_min} max={catalog.candidate_count_max} step="1" value={candidateCount} disabled={!canStartTuning || !canTune || active || busy} onChange={(event) => setCandidateCount(event.target.value)} />
        </label>
        <label>
          <span>{tr('Sampling seed')}</span>
          <input type="number" min="0" step="1" value={seed} disabled={!canStartTuning || !canTune || active || busy} onChange={(event) => setSeed(event.target.value)} />
        </label>
        <div className="model-tuning-control-note">
          <span>{tr('Validation')}</span>
          <strong>{tr('Chronological walk-forward')}</strong>
        </div>
        {(canStartTuning || canStopTuning) ? <div className="model-tuning-actions">
          {canStartTuning ? <button type="button" className="primary-action" onClick={start} disabled={!canTune || active || busy}>{busy && !active ? tr('Starting…') : startActionLabel}</button> : null}
          {canStopTuning ? <button type="button" className="secondary-action" onClick={stop} disabled={!active || busy || run?.status === 'stop_requested'}>{run?.status === 'stop_requested' ? tr('Stopping…') : tr('Stop')}</button> : null}
        </div> : null}
      </div>

      {adaptiveMode ? (
        <details className="model-tuning-space model-tuning-advanced">
          <summary>{tr('Advanced CARO settings')}<span>{tr('Optional')}</span></summary>
          <div className="model-tuning-probability-config">
            <div className="model-tuning-probability-grid">
              <label><span>{tr('Minimum capital improvement (%)')}</span><input type="number" min="0" step="0.1" value={minimumCapitalImprovementPct} disabled={!canStartTuning || active || busy} onChange={(event) => setMinimumCapitalImprovementPct(event.target.value)} /></label>
              <label><span>{tr('Sharpe tolerance')}</span><input type="number" min="0" step="0.01" value={sharpeTolerance} disabled={!canStartTuning || active || busy} onChange={(event) => setSharpeTolerance(event.target.value)} /></label>
              <label><span>{tr('Drawdown tolerance (pp)')}</span><input type="number" min="0" step="0.1" value={drawdownTolerancePct} disabled={!canStartTuning || active || busy} onChange={(event) => setDrawdownTolerancePct(event.target.value)} /></label>
              <label><span>{tr('Minimum worst fold (%)')}</span><input type="number" step="0.1" value={minimumWorstFoldPct} disabled={!canStartTuning || active || busy} onChange={(event) => setMinimumWorstFoldPct(event.target.value)} /></label>
            </div>
          </div>
        </details>
      ) : null}

      <details className="model-tuning-space">
        <summary>{tr('Search space')}<span>{catalog.search_space.length} {tr('parameters')}</span></summary>
        <div className="model-tuning-space-grid">
          {catalog.search_space.map((field) => (
            <div key={field.name}>
              <strong>{field.name}</strong>
              <span>{field.min} → {field.max}</span>
            </div>
          ))}
        </div>
      </details>

      {run ? (
        <div className="model-tuning-run">
          <div className="model-tuning-progress-row">
            <div>
              <strong>{tr('Campaign')} {run.id}</strong>
              <span>{tr(run.status)} · {run.research_completed_candidates ?? run.completed_candidates}/{run.research_total_candidates ?? run.total_candidates} {tr('completed')}{run.cancelled_candidates ? ` · ${run.cancelled_candidates} ${tr('cancelled')}` : ''} · {tr(run.tuning_scope_label || catalog?.tuning_scope_label || '')} · {(catalog.methods || []).find((item) => item.id === run.method)?.label || run.method}</span>
            </div>
            <div className="model-tuning-run-actions">
              {canViewTuningLogs ? <button type="button" className="secondary-action compact" onClick={openCampaignLog} disabled={logLoading}>{tr('Campaign log')}</button> : null}
              {canExportTuning && !active ? <button type="button" className="secondary-action compact" onClick={exportCampaign} disabled={exporting}>{tr(exporting ? 'Exporting…' : 'Export Campaign')}</button> : null}
              <strong>{Number(run.progress || 0).toFixed(1)}%</strong>
            </div>
          </div>
          <div className="model-tuning-progress-track"><i style={{ width: `${Math.max(0, Math.min(100, Number(run.progress || 0)))}%` }} /></div>
          {run.baseline_execution ? <small>{tr('Baseline')} · {run.baseline_execution.job_id} · {money(run.baseline_execution.metrics?.ending_capital)}</small> : null}
          {run.probability_anchor ? <small>{tr('Champion anchor')} · {run.probability_anchor.candidate_id !== undefined ? `#${run.probability_anchor.candidate_id} · ` : ''}{money(run.probability_anchor.metrics?.ending_capital)} · {run.imported_observation_count || 0} {tr('imported observations')}</small> : null}
          {run.method === PROBABILITY_METHOD && run.probability_state ? <small>{tr('Unified state')} · {tr('Champion')} #{run.probability_state.last_champion_candidate_id ?? run.probability_anchor?.candidate_id ?? 0} · {tr('Exploration trials')} {run.probability_state.exploration_trials_completed || 0} · {tr('Adaptive trials')} {run.probability_state.adaptive_trials_completed || 0} · {tr('Trust region')} {(Number(run.probability_state.trust_region_radius || 0) * 100).toFixed(1)}% · {tr('No-improvement streak')} {run.probability_state.no_improvement_streak || 0}</small> : null}
          {run.market_data_cutoff_date ? <small>{tr('Frozen market-data cutoff')} · {run.market_data_cutoff_date}</small> : null}
          {run.status === 'stop_requested' ? <small>{tr('Cancelling the active tuning candidate now. Partial research artifacts will be discarded.')}</small> : null}
          {run.active_candidate_ids?.length ? <small>{tr(run.status === 'stop_requested' ? 'Cancelling candidate' : 'Active candidates')} · {run.active_candidate_ids.map((id) => `#${id}`).join(', ')}</small> : null}
        </div>
      ) : null}

      {visibleCandidates.length ? (
        <div className="model-tuning-results-wrap">
          <div className="model-tuning-results-heading">
            <div><strong>{tr('Candidate ranking')}</strong></div>
            {runMatchesCurrentBaseline && run?.best_candidate_id !== null && run?.best_candidate_id !== undefined ? <small>{tr('Best')} #{run.best_candidate_id}</small> : null}
          </div>
          <div className="model-tuning-candidate-grid" aria-label={tr('Candidate ranking')}>
            {visibleCandidates.map((candidate) => {
              const metrics = candidate.metrics || {}
              const proposal = candidate.proposal || {}
              const adoptable = !active && candidate.status === 'completed' && !candidate.is_control
              const previouslyPromoted = (run?.adoption_history || []).some((item) => Number(item.candidate_id) === Number(candidate.candidate_id))
              const typeLabel = candidate.is_control
                ? tr('Control')
                : candidate.kind === 'champion_probability'
                  ? tr('Adaptive')
                  : candidate.kind === 'unified_exploration'
                    ? tr('Exploration')
                    : tr('Candidate')
              const tone = candidate.is_control
                ? 'control'
                : candidate.rank === 1
                  ? 'best'
                  : candidate.kind === 'champion_probability'
                    ? 'adaptive'
                    : candidate.kind === 'unified_exploration'
                      ? 'exploration'
                      : ''
              const status = candidate.status || 'unknown'
              const statusLabelKey = {
                running: 'Running',
                queued: 'Queued',
                pending: 'Pending',
                completed: 'Completed',
                failed: 'Failed',
                cancelled: 'Cancelled',
              }[status] || 'Status'
              const jobProgress = Math.max(0, Math.min(100, Number(candidate.job_progress || 0)))
              const jobProgressLabel = `${jobProgress.toFixed(0)}%`
              const statusTitle = candidate.status === 'running'
                ? `${tr(statusLabelKey)} · ${jobProgressLabel}`
                : tr(statusLabelKey)
              const hasParameters = Object.keys(candidate.settings || {}).length > 0
              const showResults = candidate.is_control || ['completed', 'failed', 'cancelled'].includes(status)
              return (
                <article key={candidate.candidate_id} className={`model-tuning-candidate-card ${tone} ${status}`}>
                  <header className="model-tuning-candidate-card-header">
                    <div className="model-tuning-candidate-card-title model-tuning-candidate-card-title-header">
                      <strong className={`model-tuning-candidate-name ${status}`} title={candidateLabel(candidate)}>{candidateLabel(candidate)}</strong>
                      <small>
                        {candidate.is_control && candidate.baseline_reused
                          ? `${tr('Certified Backtest reused')} · ${candidate.source_job_id || candidate.job_id || '—'}`
                          : `#${candidate.candidate_id} · ${typeLabel}`}
                      </small>
                    </div>
                    {candidate.status === 'running' ? (
                      <span
                        className="loader"
                        role="status"
                        aria-label={statusTitle}
                        title={statusTitle}
                      >
                        <span className="loader-percent" aria-hidden="true">{jobProgressLabel}</span>
                      </span>
                    ) : null}
                  </header>


                  {!candidate.is_control && ['pending', 'queued', 'running'].includes(status) && candidateCardMethod === PROBABILITY_METHOD && candidate.kind === 'champion_probability' ? (
                    <div className="model-tuning-candidate-preflight">
                      <CandidateCardMetric candidateId={candidate.candidate_id} label="P(beat)" value={pct(proposal.estimated_probability_beats_champion)} tone={probabilityMetricTone(proposal.estimated_probability_beats_champion)} />
                      <CandidateCardMetric candidateId={candidate.candidate_id} label="Expected improvement" value={pct(proposal.estimated_expected_improvement)} tone={signedMetricTone(proposal.estimated_expected_improvement)} />
                    </div>
                  ) : null}

                  {showResults ? (
                    <div className="model-tuning-candidate-metrics">
                      <CandidateCardMetric candidateId={candidate.candidate_id} label="Capital" value={money(metrics.ending_capital)} tone="capital" />
                      <CandidateCardMetric candidateId={candidate.candidate_id} label="CAGR" value={pct(metrics.cagr)} tone={signedMetricTone(metrics.cagr)} />
                      <CandidateCardMetric candidateId={candidate.candidate_id} label="Sharpe" value={decimal(metrics.sharpe)} tone={signedMetricTone(metrics.sharpe)} />
                      <CandidateCardMetric candidateId={candidate.candidate_id} label="Max DD" value={pct(metrics.maximum_drawdown)} tone={signedMetricTone(metrics.maximum_drawdown)} />
                      <CandidateCardMetric candidateId={candidate.candidate_id} label="Worst fold" value={pct(metrics.worst_fold_return)} tone={signedMetricTone(metrics.worst_fold_return)} />
                      <CandidateCardMetric candidateId={candidate.candidate_id} label="Market Exposure" value={pct(metrics.market_exposure)} tone="info" />
                      <CandidateCardMetric candidateId={candidate.candidate_id} label="CASH Days" value={metrics.cash_days == null ? '—' : Number(metrics.cash_days).toFixed(0)} tone="cash" />
                      {candidateCardMethod === PROBABILITY_METHOD && !candidate.is_control ? <CandidateCardMetric candidateId={candidate.candidate_id} label="P(beat)" value={pct(proposal.estimated_probability_beats_champion)} tone={probabilityMetricTone(proposal.estimated_probability_beats_champion)} /> : null}
                      {candidateCardMethod === PROBABILITY_METHOD && !candidate.is_control ? <CandidateCardMetric candidateId={candidate.candidate_id} label="Expected improvement" value={pct(proposal.estimated_expected_improvement)} tone={signedMetricTone(proposal.estimated_expected_improvement)} /> : null}
                      <CandidateCardMetric candidateId={candidate.candidate_id} label="Score" value={decimal(metrics.risk_adjusted_compound_score, 4)} tone={signedMetricTone(metrics.risk_adjusted_compound_score)} />
                    </div>
                  ) : null}

                  {candidate.status === 'failed' ? <small className="model-tuning-candidate-card-error">{candidate.failure_type || candidate.failure_message || tr('See log')}</small> : null}

                  <footer className="model-tuning-candidate-card-actions">
                    {hasParameters ? <button type="button" onClick={() => setParameterCandidateId(candidate.candidate_id)}>{tr('Parameters')}</button> : null}
                    <button type="button" onClick={() => setSelectedCandidateId(candidate.candidate_id)}>{tr('View')}</button>
                    {canViewTuningLogs && !candidate.baseline_preview ? <button type="button" onClick={() => openCandidateLog(candidate)} disabled={logLoading}>{tr('Log')}</button> : null}
                    {previouslyPromoted ? <span className="model-tuning-adopted">{tr('Promoted')}</span> : null}
                    {canPromoteTuning && adoptable ? <button type="button" onClick={() => adopt(candidate)} disabled={busy}>{tr(previouslyPromoted ? 'Promote again' : 'Promote to Backtest')}</button> : null}
                  </footer>
                </article>
              )
            })}
          </div>



        </div>
      ) : null}

      {selectedCandidate ? (
        <div
          className="model-tuning-candidate-detail-overlay"
          role="presentation"
          onMouseDown={(event) => { if (event.target === event.currentTarget) setSelectedCandidateId(null) }}
        >
          <div className="model-tuning-candidate-detail-dialog" role="dialog" aria-modal="true" aria-label={`${tr('View')} · ${candidateLabel(selectedCandidate)}`}>
            <div className="model-tuning-candidate-detail-body">
              <div className="model-tuning-results-heading">
                <div><strong>{candidateLabel(selectedCandidate)}</strong><span>{selectedCandidate.settings_hash}</span></div>
                <button type="button" className="secondary-action compact" onClick={() => setSelectedCandidateId(null)}>{tr('Close')}</button>
              </div>
              {selectedCandidate.proposal ? (
                <div className="model-tuning-proposal-grid">
                  <div><span>{tr('Estimated P(beat Champion)')}</span><strong>{pct(selectedCandidate.proposal.estimated_probability_beats_champion)}</strong></div>
                  <div><span>{tr('Expected improvement')}</span><strong>{pct(selectedCandidate.proposal.estimated_expected_improvement)}</strong></div>
                  <div><span>{tr('Predicted capital')}</span><strong>{money(selectedCandidate.proposal.estimated_ending_capital_mean)}</strong></div>
                  <div><span>{tr('Prediction spread')}</span><strong>{money(selectedCandidate.proposal.estimated_ending_capital_std)}</strong></div>
                  <div><span>{tr('Predicted Sharpe')}</span><strong>{decimal(selectedCandidate.proposal.estimated_sharpe_mean)}</strong></div>
                  <div><span>{tr('Predicted max DD')}</span><strong>{pct(selectedCandidate.proposal.estimated_maximum_drawdown_mean)}</strong></div>
                  <div><span>{tr('Predicted worst fold')}</span><strong>{pct(selectedCandidate.proposal.estimated_worst_fold_mean)}</strong></div>
                  <div><span>{tr('Observations used')}</span><strong>{selectedCandidate.proposal.observation_count ?? '—'}</strong></div>
                  <div><span>{tr('Acquisition score')}</span><strong>{decimal(selectedCandidate.proposal.acquisition_score, 5)}</strong></div>
                </div>
              ) : null}
              {selectedCandidate.proposal?.promising_region ? (
                <div className="model-tuning-promising-region">
                  <strong>{tr('Promising region')}</strong>
                  <div className="model-tuning-settings-grid">
                    {Object.entries(selectedCandidate.proposal.promising_region).map(([name, bounds]) => (
                      <div key={name}><span>{name}</span><strong>{String(bounds?.low ?? '—')} → {String(bounds?.high ?? '—')}</strong></div>
                    ))}
                  </div>
                </div>
              ) : null}
              {selectedCandidate.status === 'failed' ? (
                <div className="model-tuning-candidate-failure">
                  <strong>{selectedCandidate.failure_type || tr('Candidate failed')}</strong>
                  <span>{selectedCandidate.failure_message || selectedCandidate.error || tr('Open the execution log for the technical details.')}</span>
                  {canViewTuningLogs && !selectedCandidate.baseline_preview ? <button type="button" className="secondary-action compact" onClick={() => openCandidateLog(selectedCandidate)} disabled={logLoading}>{tr('Open log')}</button> : null}
                </div>
              ) : null}
              {gateTuning && selectedCandidate.metrics ? (
                <div className="model-tuning-proposal-grid">
                  <div><span>{tr('Market Exposure')}</span><strong>{pct(selectedCandidate.metrics.market_exposure)}</strong></div>
                  <div><span>{tr('CASH Days')}</span><strong>{selectedCandidate.metrics.cash_days == null ? '—' : Number(selectedCandidate.metrics.cash_days).toFixed(0)}</strong></div>
                  <div><span>{tr('Cash Gate Overrides')}</span><strong>{selectedCandidate.metrics.cash_gate_changed_base_action_sessions ?? '—'}</strong></div>
                  <div><span>{tr('Net Cash-Gate Diagnostic')}</span><strong>{pct(selectedCandidate.metrics.cash_gate_net_avoided_return_sum)}</strong></div>
                </div>
              ) : null}
              {selectedCandidate.metrics?.folds?.length ? (
                <div className="model-tuning-fold-grid">
                  {selectedCandidate.metrics.folds.map((fold) => <div key={fold.fold_id}><span>{tr('Fold')} {fold.fold_id}</span><strong>{pct(fold.strategy_return)}</strong><small>{tr('Max DD')} {pct(fold.maximum_drawdown)}</small></div>)}
                </div>
              ) : null}
            
            </div>
          </div>
        </div>
      ) : null}

      {parameterCandidate ? (
        <div
          className="model-tuning-parameters-overlay"
          role="presentation"
          onMouseDown={(event) => { if (event.target === event.currentTarget) setParameterCandidateId(null) }}
        >
          <div className="model-tuning-parameters-dialog" role="dialog" aria-modal="true" aria-label={`${tr('Parameters')} · ${candidateLabel(parameterCandidate)}`}>
            <div className="model-tuning-parameters-dialog-heading">
              <div>
                <span>{tr('Parameters')}</span>
                <strong>{candidateLabel(parameterCandidate)}</strong>
                {parameterCandidate.settings_hash ? <small>{parameterCandidate.settings_hash}</small> : null}
              </div>
              <button type="button" className="secondary-action compact" onClick={() => setParameterCandidateId(null)}>{tr('Close')}</button>
            </div>
            <CandidateParametersGrid settings={parameterCandidate.settings} />
          </div>
        </div>
      ) : null}

      {(logView || logLoading || logError) ? (
        <div className="model-tuning-log-overlay" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) { setLogView(null); setLogError('') } }}>
          <div className="model-tuning-log-dialog" role="dialog" aria-modal="true" aria-label={logView?.title || tr('Diagnostic log')}>
            <div className="model-tuning-log-heading">
              <div><strong>{logView?.title || tr('Diagnostic log')}</strong><span>{logView?.run_id || run?.id || '—'}</span></div>
              <button type="button" className="secondary-action compact" onClick={() => { setLogView(null); setLogError('') }}>{tr('Close')}</button>
            </div>
            {logLoading ? <div className="backtest-loading-row">{tr('Loading diagnostic log…')}</div> : null}
            {logError ? <div className="global-inline-message error-inline">{logError}</div> : null}
            {logView ? (
              <>
                <div className="model-tuning-log-meta">
                  <span>{tr('Status')} <strong>{tr(logView.status || 'unknown')}</strong></span>
                  {logView.candidate_id !== undefined ? <span>{tr('Candidate')} <strong>#{logView.candidate_id}</strong></span> : null}
                  {logView.job_id ? <span>Job <strong>{logView.job_id}</strong></span> : null}
                  {logView.failure_type ? <span>{tr('Failure')} <strong>{logView.failure_type}</strong></span> : null}
                </div>
                <pre className="model-tuning-log-pre">{logView.log_text || tr('No diagnostic lines were recorded.')}</pre>
                <div className="model-tuning-log-actions">
                  <button type="button" onClick={copyDiagnosticLog}>{tr('Copy log')}</button>
                  <button type="button" className="secondary-action" onClick={downloadDiagnosticLog}>{tr('Download .txt')}</button>
                </div>
              </>
            ) : null}
          </div>
        </div>
      ) : null}
    </section>
  )
}
