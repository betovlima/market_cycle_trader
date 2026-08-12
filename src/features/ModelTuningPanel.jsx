import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import { ApiError, apiFetch, downloadFile } from '../api/http'
import { API } from '../config/env'
import { tr } from '../i18n/runtime'
import { shortDateTime } from '../shared/formatters'

const ACTIVE = new Set(['queued', 'running', 'stop_requested'])
const PROBABILITY_METHOD = 'champion_probability'

function pct(value, digits = 1) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return '—'
  return `${(Number(value) * 100).toFixed(digits)}%`
}

function money(value) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return '—'
  return new Intl.NumberFormat(undefined, { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(Number(value))
}

function decimal(value, digits = 3) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return '—'
  return Number(value).toFixed(digits)
}

function candidateLabel(candidate) {
  if (candidate.is_control) return tr('Current Strategy model')
  if (candidate.kind === 'probability_startup') return `${tr('Startup candidate')} ${candidate.candidate_id}`
  if (candidate.kind === 'champion_probability') return `${tr('CARO candidate')} ${candidate.candidate_id}`
  return `${tr('Candidate')} ${candidate.candidate_id}`
}

function baselineLabel(item) {
  const metrics = item?.metrics || {}
  return `${shortDateTime(item?.finished_at || item?.created_at)} · ${money(metrics.ending_capital)} · ${decimal(metrics.sharpe)}`
}

function sourceLabel(item) {
  const best = item?.best_candidate || {}
  return `${shortDateTime(item?.finished_at)} · ${item?.observation_count || 0} observations · best ${money(best?.metrics?.ending_capital)}`
}

function numberOr(value, fallback = 0) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : fallback
}

export function ModelTuningPanel({ onSessionExpired, onStrategyModelSaved }) {
  const [catalog, setCatalog] = useState(null)
  const [strategy, setStrategy] = useState(null)
  const [modelFamily, setModelFamily] = useState('')
  const [baselines, setBaselines] = useState([])
  const [baselineJobId, setBaselineJobId] = useState('')
  const [sources, setSources] = useState([])
  const [sourceRunId, setSourceRunId] = useState('')
  const [anchorCandidateId, setAnchorCandidateId] = useState('')
  const [run, setRun] = useState(null)
  const [method, setMethod] = useState('latin_hypercube')
  const [candidateCount, setCandidateCount] = useState(20)
  const [seed, setSeed] = useState(42)
  const [startupTrials, setStartupTrials] = useState('')
  const [minimumCapitalImprovementPct, setMinimumCapitalImprovementPct] = useState('')
  const [sharpeTolerance, setSharpeTolerance] = useState('')
  const [drawdownTolerancePct, setDrawdownTolerancePct] = useState('')
  const [minimumWorstFoldPct, setMinimumWorstFoldPct] = useState('')
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [selectedCandidateId, setSelectedCandidateId] = useState(null)
  const [logView, setLogView] = useState(null)
  const [logLoading, setLogLoading] = useState(false)
  const [logError, setLogError] = useState('')
  const timerRef = useRef(null)

  const handleError = useCallback((requestError) => {
    if (requestError instanceof ApiError && requestError.status === 401) {
      onSessionExpired?.()
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
      const [nextCatalog, control, sourcePayload] = await Promise.all([
        apiFetch(`${API}/admin/model-tuning/catalog`),
        apiFetch(`${API}/admin/strategies/control`),
        apiFetch(`${API}/admin/model-tuning/sources?limit=20`),
      ])
      const strategyId = control?.research_strategy_id
      const detail = strategyId ? await apiFetch(`${API}/admin/strategies/${encodeURIComponent(strategyId)}`) : null
      const [baselinePayload, latest] = await Promise.all([
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
      const sourceItems = Array.isArray(sourcePayload?.items) ? sourcePayload.items : []
      setSources(sourceItems)
      setSourceRunId((current) => current && sourceItems.some((item) => item.run_id === current) ? current : '')
      setCandidateCount(nextCatalog.default_candidate_count || 20)
      setSeed(nextCatalog.default_seed ?? 42)
      setStartupTrials(String(probability.default_startup_trials ?? ''))
      setMinimumCapitalImprovementPct(String(numberOr(probability.default_min_capital_improvement) * 100))
      setSharpeTolerance(String(probability.default_sharpe_tolerance ?? ''))
      setDrawdownTolerancePct(String(numberOr(probability.default_drawdown_tolerance) * 100))
      setMinimumWorstFoldPct(String(numberOr(probability.default_min_worst_fold_return) * 100))
      setBaselineJobId((current) => {
        const preferred = latest?.baseline_execution?.job_id
        if (preferred && items.some((item) => item.job_id === preferred)) return preferred
        if (current && items.some((item) => item.job_id === current)) return current
        return items[0]?.job_id || ''
      })
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
      const leftRank = left.rank ?? Number.MAX_SAFE_INTEGER
      const rightRank = right.rank ?? Number.MAX_SAFE_INTEGER
      if (leftRank !== rightRank) return leftRank - rightRank
      return left.candidate_id - right.candidate_id
    })
    return items
  }, [run?.candidates])

  const selectedBaseline = useMemo(
    () => baselines.find((item) => item.job_id === baselineJobId) || null,
    [baselineJobId, baselines],
  )

  const selectedCandidate = useMemo(
    () => sortedCandidates.find((item) => item.candidate_id === selectedCandidateId) || null,
    [selectedCandidateId, sortedCandidates],
  )

  const selectedSource = useMemo(
    () => sources.find((item) => item.run_id === sourceRunId) || null,
    [sourceRunId, sources],
  )

  const selectedAnchor = useMemo(() => {
    const candidates = selectedSource?.eligible_candidates || []
    const id = anchorCandidateId === '' ? selectedSource?.best_candidate?.candidate_id : Number(anchorCandidateId)
    return candidates.find((item) => Number(item.candidate_id) === Number(id)) || selectedSource?.best_candidate || null
  }, [anchorCandidateId, selectedSource])

  const selectedMethod = useMemo(
    () => (catalog?.methods || []).find((item) => item.id === method) || null,
    [catalog?.methods, method],
  )

  const active = Boolean(run && ACTIVE.has(run.status))
  const probabilityMode = method === PROBABILITY_METHOD
  const startActionLabel = probabilityMode ? tr('Start CARO Probability') : tr('Start Latin Hypercube')
  const reusingPriorCampaign = probabilityMode && Boolean(selectedSource)
  const canTune = Boolean(
    strategy
    && !strategy.locked
    && modelFamily === catalog?.model_family
    && (reusingPriorCampaign ? selectedAnchor : selectedBaseline)
  )

  async function start() {
    if (!canTune || busy) return
    if (probabilityMode && !reusingPriorCampaign && numberOr(startupTrials) >= numberOr(candidateCount)) {
      setError(tr('Startup trials must be smaller than the total candidate count.'))
      return
    }
    setBusy(true)
    setError('')
    setNotice('')
    try {
      const body = {
        method,
        candidate_count: Number(candidateCount),
        seed: Number(seed),
      }
      if (!reusingPriorCampaign) body.baseline_job_id = baselineJobId
      if (probabilityMode) {
        if (reusingPriorCampaign) {
          body.source_tuning_run_id = selectedSource.run_id
          body.anchor_candidate_id = Number(selectedAnchor.candidate_id)
        }
        body.probability = {
          startup_trials: reusingPriorCampaign ? 4 : Number(startupTrials),
          min_capital_improvement: numberOr(minimumCapitalImprovementPct) / 100,
          sharpe_tolerance: numberOr(sharpeTolerance),
          drawdown_tolerance: numberOr(drawdownTolerancePct) / 100,
          min_worst_fold_return: numberOr(minimumWorstFoldPct) / 100,
        }
      }
      const created = await apiFetch(`${API}/admin/model-tuning`, { method: 'POST', body })
      setRun(created)
      setNotice(probabilityMode
        ? reusingPriorCampaign
          ? tr('CARO Probability started from the selected Latin Hypercube observations. Adaptive trials begin immediately against the selected Champion anchor.')
          : tr('CARO Probability tuning started. It performs startup exploration and then proposes adaptive champion-anchored candidates.')
        : tr('Latin Hypercube tuning started in the integrated research worker.'))
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
    const normalizedReason = reason.trim()
    if (normalizedReason.length < 3) {
      setError(tr('Enter a reason for this change.'))
      return
    }
    if (!run?.id || busy) return
    setBusy(true)
    setError('')
    setNotice('')
    try {
      const response = await apiFetch(`${API}/admin/model-tuning/${encodeURIComponent(run.id)}/candidates/${candidate.candidate_id}/adopt`, {
        method: 'POST',
        body: { reason: normalizedReason },
      })
      setReason('')
      setNotice(tr('Candidate adopted as the Strategy model. Run one final normal Backtest before Candidate/Trader promotion.'))
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
      <div className="model-tuning-heading">
        <div>
          <span className="panel-kicker">{tr('MODEL TUNING')}</span>
          <h3>{tr('Model research')}</h3>
          <p>{tr('Run LightGBM tuning inside the main research environment. Latin Hypercube explores the space; CARO Probability can run independently or reuse a completed exploration campaign without rerunning its observations.')}</p>
        </div>
        <div className="model-tuning-method-badge">{selectedMethod?.label || tr('Model Tuning')}</div>
      </div>

      {error ? <div className="global-inline-message error-inline">{error}</div> : null}
      {notice ? <div className="global-inline-message success-inline">{notice}</div> : null}
      {!strategy ? <div className="global-inline-message warning-inline">{tr('Select a Strategy before starting model tuning.')}</div> : null}
      {strategy?.locked ? <div className="global-inline-message warning-inline">{tr('Clone the protected Strategy before starting model tuning.')}</div> : null}
      {strategy && modelFamily !== catalog.model_family ? <div className="global-inline-message warning-inline">{tr('Save LightGBM on the selected Strategy before starting model tuning.')}</div> : null}
      {strategy && modelFamily === catalog.model_family && !baselines.length && !(probabilityMode && sources.length) ? <div className="global-inline-message warning-inline">{tr('Run a normal Simulation Backtest with the saved LightGBM model first. The completed execution becomes the tuning baseline.')}</div> : null}

      <div className="model-tuning-context-grid model-tuning-context-grid-wide">
        <div>
          <span>{tr('Selected Strategy')}</span>
          <strong>{strategy?.name || '—'}</strong>
          <small>{strategy ? `${tr('Revision')} ${strategy.revision}` : '—'}</small>
        </div>
        <div>
          <span>{tr('Saved model')}</span>
          <strong>{strategy?.research_model_configuration?.label || strategy?.research_model?.label || '—'}</strong>
          <small>{modelFamily || '—'}</small>
        </div>
        <div className="worker-online">
          <span>{tr('Execution')}</span>
          <strong>{tr('Integrated API worker')}</strong>
          <small>{tr('One research candidate at a time; LightGBM still uses the CPU threads configured by the model/runtime.')}</small>
        </div>
      </div>

      {!reusingPriorCampaign ? (
        <div className="model-tuning-baseline">
        <div className="model-tuning-results-heading">
          <div>
            <strong>{tr('Baseline execution')}</strong>
            <span>{tr(reusingPriorCampaign ? 'The imported campaign supplies the frozen execution context; this baseline selector is not used by CARO.' : 'Choose a completed normal Backtest compatible with the currently saved Strategy and model snapshot.')}</span>
          </div>
          <button type="button" className="secondary-action compact" onClick={loadWorkspace} disabled={busy || active}>{tr('Refresh')}</button>
        </div>
        {baselines.length ? (
          <>
            <select value={baselineJobId} onChange={(event) => setBaselineJobId(event.target.value)} disabled={active || busy}>
              {baselines.map((item) => <option key={item.job_id} value={item.job_id}>{baselineLabel(item)}</option>)}
            </select>
            {selectedBaseline ? (
              <div className="model-tuning-baseline-metrics">
                <div><span>{tr('Execution')}</span><strong>{selectedBaseline.job_id}</strong></div>
                <div><span>{tr('Capital')}</span><strong>{money(selectedBaseline.metrics?.ending_capital)}</strong></div>
                <div><span>{tr('CAGR')}</span><strong>{pct(selectedBaseline.metrics?.cagr)}</strong></div>
                <div><span>{tr('Sharpe')}</span><strong>{decimal(selectedBaseline.metrics?.sharpe)}</strong></div>
                <div><span>{tr('Max DD')}</span><strong>{pct(selectedBaseline.metrics?.maximum_drawdown)}</strong></div>
                <div><span>{tr('Worst fold')}</span><strong>{pct(selectedBaseline.metrics?.worst_fold_return)}</strong></div>
              </div>
            ) : null}
          </>
        ) : <div className="model-tuning-empty-baseline">{tr('No compatible completed baseline execution was found.')}</div>}
      </div>
      ) : null}

      <div className="model-tuning-method-selector">
        <label>
          <span>{tr('Research method')}</span>
          <select
            value={method}
            onChange={(event) => {
              const nextMethod = event.target.value
              setMethod(nextMethod)
              if (nextMethod === PROBABILITY_METHOD && !sourceRunId && sources.length) {
                setSourceRunId(sources[0].run_id)
                setAnchorCandidateId('')
              }
            }}
            disabled={active || busy}
          >
            {(catalog.methods || []).map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
          </select>
        </label>
        <div>
          <strong>{selectedMethod?.label || '—'}</strong>
          <span>{tr(selectedMethod?.description || '')}</span>
        </div>
      </div>

      <div className="model-tuning-controls">
        <label>
          <span>{tr(probabilityMode && reusingPriorCampaign ? 'New adaptive trials' : probabilityMode ? 'Total research trials' : 'Exploration candidates')}</span>
          <input type="number" min={catalog.candidate_count_min} max={catalog.candidate_count_max} step="1" value={candidateCount} disabled={!canTune || active || busy} onChange={(event) => setCandidateCount(event.target.value)} />
        </label>
        <label>
          <span>{tr('Sampling seed')}</span>
          <input type="number" min="0" step="1" value={seed} disabled={!canTune || active || busy} onChange={(event) => setSeed(event.target.value)} />
        </label>
        <div className="model-tuning-control-note">
          <span>{tr('Validation')}</span>
          <strong>{tr('Chronological walk-forward')}</strong>
          <small>{probabilityMode ? reusingPriorCampaign ? tr('Imported observations + adaptive probabilistic trials') : tr('Standalone startup exploration + adaptive probabilistic trials') : tr('1 fresh control rerun + exploration candidates')}</small>
        </div>
        <div className="model-tuning-actions">
          <button type="button" className="primary-action" onClick={start} disabled={!canTune || active || busy}>{busy && !active ? tr('Starting…') : startActionLabel}</button>
          <button type="button" className="secondary-action" onClick={stop} disabled={!active || busy || run?.status === 'stop_requested'}>{run?.status === 'stop_requested' ? tr('Stopping…') : tr('Stop')}</button>
        </div>
      </div>

      {probabilityMode ? (
        <div className="model-tuning-probability-config">
          <div className="model-tuning-results-heading">
            <div>
              <strong>{tr('Champion probability gates')}</strong>
              <span>{tr('CARO can start independently or reuse a completed Latin Hypercube campaign as prior evidence. When prior campaigns exist, the newest one is selected by default; choose None explicitly for a standalone CARO run. Reused observations are not executed again.')}</span>
            </div>
          </div>
          <div className="model-tuning-prior-source">
            <label>
              <span>{tr('Prior exploration')}</span>
              <select value={sourceRunId} disabled={active || busy} onChange={(event) => { setSourceRunId(event.target.value); setAnchorCandidateId('') }}>
                <option value="">{tr('None — start CARO independently')}</option>
                {sources.map((item) => <option key={item.run_id} value={item.run_id}>{sourceLabel(item)}</option>)}
              </select>
            </label>
            {selectedSource ? (
              <label>
                <span>{tr('Champion anchor')}</span>
                <select value={anchorCandidateId === '' ? String(selectedSource.best_candidate?.candidate_id ?? '') : anchorCandidateId} disabled={active || busy} onChange={(event) => setAnchorCandidateId(event.target.value)}>
                  {(selectedSource.eligible_candidates || []).map((item) => <option key={item.candidate_id} value={item.candidate_id}>{`#${item.candidate_id} · ${money(item.metrics?.ending_capital)} · Sharpe ${decimal(item.metrics?.sharpe)} · DD ${pct(item.metrics?.maximum_drawdown)}`}</option>)}
                </select>
              </label>
            ) : null}
          </div>
          {selectedSource && selectedAnchor ? (
            <div className="model-tuning-anchor-card">
              <div><span>{tr('Imported observations')}</span><strong>{selectedSource.observation_count}</strong></div>
              <div><span>{tr('Anchor capital')}</span><strong>{money(selectedAnchor.metrics?.ending_capital)}</strong></div>
              <div><span>{tr('Anchor Sharpe')}</span><strong>{decimal(selectedAnchor.metrics?.sharpe)}</strong></div>
              <div><span>{tr('Anchor max DD')}</span><strong>{pct(selectedAnchor.metrics?.maximum_drawdown)}</strong></div>
              <div><span>{tr('Anchor worst fold')}</span><strong>{pct(selectedAnchor.metrics?.worst_fold_return)}</strong></div>
              <div><span>{tr('Frozen data through')}</span><strong>{selectedSource.market_data_cutoff_date || '—'}</strong></div>
            </div>
          ) : null}
          <div className="model-tuning-probability-grid">
            {!reusingPriorCampaign ? <label><span>{tr('Startup trials')}</span><input type="number" min="4" step="1" value={startupTrials} disabled={active || busy} onChange={(event) => setStartupTrials(event.target.value)} /></label> : null}
            <label><span>{tr('Minimum capital improvement (%)')}</span><input type="number" min="0" step="0.1" value={minimumCapitalImprovementPct} disabled={active || busy} onChange={(event) => setMinimumCapitalImprovementPct(event.target.value)} /></label>
            <label><span>{tr('Sharpe tolerance')}</span><input type="number" min="0" step="0.01" value={sharpeTolerance} disabled={active || busy} onChange={(event) => setSharpeTolerance(event.target.value)} /></label>
            <label><span>{tr('Drawdown tolerance (pp)')}</span><input type="number" min="0" step="0.1" value={drawdownTolerancePct} disabled={active || busy} onChange={(event) => setDrawdownTolerancePct(event.target.value)} /></label>
            <label><span>{tr('Minimum worst fold (%)')}</span><input type="number" step="0.1" value={minimumWorstFoldPct} disabled={active || busy} onChange={(event) => setMinimumWorstFoldPct(event.target.value)} /></label>
          </div>
          <p>{tr('The displayed probability is a research-surrogate estimate of beating the selected Champion under this validation protocol. It is not a probability of future market profit.')}</p>
        </div>
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
              <span>{tr(run.status)} · {run.completed_candidates}/{run.total_candidates} {tr('completed')}{run.cancelled_candidates ? ` · ${run.cancelled_candidates} ${tr('cancelled')}` : ''} · {(catalog.methods || []).find((item) => item.id === run.method)?.label || run.method}</span>
            </div>
            <div className="model-tuning-run-actions">
              <button type="button" className="secondary-action compact" onClick={openCampaignLog} disabled={logLoading}>{tr('Campaign log')}</button>
              {!active ? <button type="button" className="secondary-action compact" onClick={exportCampaign} disabled={exporting}>{tr(exporting ? 'Exporting…' : 'Export Campaign')}</button> : null}
              <strong>{Number(run.progress || 0).toFixed(1)}%</strong>
            </div>
          </div>
          <div className="model-tuning-progress-track"><i style={{ width: `${Math.max(0, Math.min(100, Number(run.progress || 0)))}%` }} /></div>
          {run.baseline_execution ? <small>{tr('Baseline')} · {run.baseline_execution.job_id} · {money(run.baseline_execution.metrics?.ending_capital)}</small> : null}
          {run.probability_anchor ? <small>{tr('Champion anchor')} · {run.probability_anchor.candidate_id !== undefined ? `#${run.probability_anchor.candidate_id} · ` : ''}{money(run.probability_anchor.metrics?.ending_capital)} · {run.imported_observation_count || 0} {tr('imported observations')}</small> : null}
          {run.market_data_cutoff_date ? <small>{tr('Frozen market-data cutoff')} · {run.market_data_cutoff_date}</small> : null}
          {run.source_tuning_run_id && run.adoption_context_compatible === false ? <small>{tr('Imported research context differs from the selected Strategy. Adoption applies model settings for confirmation only; a normal Backtest in the target Strategy remains mandatory.')}</small> : null}
          {run.status === 'stop_requested' ? <small>{tr('Cancelling the active tuning candidate now. Partial research artifacts will be discarded.')}</small> : null}
          {run.active_candidate_ids?.length ? <small>{tr(run.status === 'stop_requested' ? 'Cancelling candidate' : 'Active candidates')} · {run.active_candidate_ids.map((id) => `#${id}`).join(', ')}</small> : null}
        </div>
      ) : null}

      {sortedCandidates.length ? (
        <div className="model-tuning-results-wrap">
          <div className="model-tuning-results-heading">
            <div><strong>{tr('Candidate ranking')}</strong><span>{tr('Ranked by the Strategy risk-adjusted compound score; every walk-forward fold must be positive.')}</span></div>
            {run?.best_candidate_id !== null && run?.best_candidate_id !== undefined ? <small>{tr('Best')} #{run.best_candidate_id}</small> : null}
          </div>
          <div className="model-tuning-table-scroll">
            <table className="model-tuning-table">
              <thead><tr><th>{tr('Rank')}</th><th>{tr('Candidate')}</th><th>{tr('Status')}</th><th>{tr('Capital')}</th><th>{tr('CAGR')}</th><th>{tr('Sharpe')}</th><th>{tr('Max DD')}</th><th>{tr('Worst fold')}</th>{run?.method === PROBABILITY_METHOD ? <><th>{tr('Champion gate')}</th><th>{tr('P(beat)')}</th><th>{tr('Expected improvement')}</th></> : null}<th>{tr('Score')}</th><th /></tr></thead>
              <tbody>
                {sortedCandidates.map((candidate) => {
                  const metrics = candidate.metrics || {}
                  const proposal = candidate.proposal || {}
                  const adoptable = !active && candidate.status === 'completed' && metrics.eligible && (run?.method !== PROBABILITY_METHOD || candidate.champion_gate_passed === true) && !candidate.is_control && run?.adopted_candidate_id !== candidate.candidate_id
                  return (
                    <tr key={candidate.candidate_id} className={`${candidate.is_control ? 'control' : ''} ${candidate.rank === 1 ? 'best' : ''}`}>
                      <td>{candidate.rank ?? '—'}</td>
                      <td><strong>{candidateLabel(candidate)}</strong>{candidate.is_control ? <small>{tr('Control')}</small> : candidate.kind === 'champion_probability' ? <small>{tr('Adaptive')}</small> : null}</td>
                      <td>{tr(candidate.status)}{candidate.job_progress !== undefined ? <small>{Number(candidate.job_progress).toFixed(0)}%</small> : null}{candidate.status === 'failed' ? <small className="model-tuning-failure-type">{candidate.failure_type || tr('See log')}</small> : null}</td>
                      <td>{money(metrics.ending_capital)}</td>
                      <td>{pct(metrics.cagr)}</td>
                      <td>{decimal(metrics.sharpe)}</td>
                      <td>{pct(metrics.maximum_drawdown)}</td>
                      <td>{pct(metrics.worst_fold_return)}</td>
                      {run?.method === PROBABILITY_METHOD ? <><td>{candidate.status === 'completed' ? tr(candidate.champion_gate_passed ? 'Beat' : 'Did not beat') : '—'}</td><td>{pct(proposal.estimated_probability_beats_champion)}</td><td>{pct(proposal.estimated_expected_improvement)}</td></> : null}
                      <td>{decimal(metrics.risk_adjusted_compound_score, 4)}</td>
                      <td className="model-tuning-row-actions">
                        <button type="button" onClick={() => setSelectedCandidateId(candidate.candidate_id)}>{tr('View')}</button>
                        <button type="button" onClick={() => openCandidateLog(candidate)} disabled={logLoading}>{tr('Log')}</button>
                        {adoptable ? <button type="button" onClick={() => adopt(candidate)} disabled={busy}>{tr('Adopt')}</button> : run?.adopted_candidate_id === candidate.candidate_id ? <span className="model-tuning-adopted">{tr('Adopted')}</span> : null}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          {selectedCandidate ? (
            <div className="model-tuning-candidate-detail">
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
                  <button type="button" className="secondary-action compact" onClick={() => openCandidateLog(selectedCandidate)} disabled={logLoading}>{tr('Open log')}</button>
                </div>
              ) : null}
              <div className="model-tuning-settings-grid">
                {Object.entries(selectedCandidate.settings || {}).map(([name, value]) => <div key={name}><span>{name}</span><strong>{String(value)}</strong></div>)}
              </div>
              {selectedCandidate.metrics?.folds?.length ? (
                <div className="model-tuning-fold-grid">
                  {selectedCandidate.metrics.folds.map((fold) => <div key={fold.fold_id}><span>{tr('Fold')} {fold.fold_id}</span><strong>{pct(fold.strategy_return)}</strong><small>{tr('Max DD')} {pct(fold.maximum_drawdown)}</small></div>)}
                </div>
              ) : null}
            </div>
          ) : null}

          {!active && sortedCandidates.some((item) => item.status === 'completed' && item.metrics?.eligible && !item.is_control) ? (
            <label className="model-tuning-reason">
              <span>{tr('CHANGE REASON')}</span>
              <input value={reason} onChange={(event) => setReason(event.target.value)} placeholder={tr('Explain why the selected tuning candidate is being adopted')} disabled={busy} />
            </label>
          ) : null}
          <p className="model-tuning-footnote">{tr('Tuning candidates are research summaries only. Adopting one updates the Strategy model configuration, then a normal final Backtest is required before Candidate or Trader promotion.')}</p>
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
