import { tr } from '../../../i18n/runtime'
import { ParameterHint } from '../../../shared/components/ParameterHint'
import { PROBABILITY_METHOD } from '../modelTuningConfig'
import { candidateLabel, decimal, money, pct } from '../modelTuningUtils'
import { EMPTY_TUNING_LOG_VIEW } from '../modelTuningLog'
import { ModelTuningCandidateCard } from './ModelTuningCandidateCard'
import { ModelTuningCandidateDetailDialog, ModelTuningLogDialog, ModelTuningParametersDialog } from './ModelTuningDialogs'
import { signedMetricTone, TuningContextLabel } from './ModelTuningPrimitives'

export function ModelTuningWorkspaceView({ workspace }) {
  const {
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
  } = workspace

  return (
    <section className={`model-tuning-panel model-tuning-workspace ${active ? 'is-running' : ''}`}>
      <div className="model-tuning-heading model-tuning-heading-compact">
        <div>
          <span className="panel-kicker">{tr('MODEL TUNING')}</span>
          <h3>{tr('Probabilistic parameter research')}</h3>
        </div>
        <div className="model-tuning-method-badge">{selectedMethod?.label || tr('Model Tuning')}</div>
      </div>

      {error ? <div className="global-inline-message error-inline">{error}</div> : null}
      {notice ? <div className="global-inline-message success-inline">{notice}</div> : null}
      {!strategy ? <div className="global-inline-message warning-inline">{tr('Select a Strategy from the catalog to begin research.')}</div> : null}
      {catalog && !tuningStartContractCompatible ? <div className="global-inline-message warning-inline">{tr('Model Tuning API/Front contract mismatch. Refresh the application after both API and Front are deployed from the same release.')}</div> : null}
      {strategy && !temporalTarget && modelFamily !== catalog.model_family ? <div className="global-inline-message warning-inline">{tr('The current tuning target must use LightGBM.')}</div> : null}
      {strategy && !temporalTarget && modelFamily === catalog.model_family && !baselines.length ? <div className="global-inline-message warning-inline">{tr('A compatible completed Backtest is required for this Strategy before tuning can start.')}</div> : null}
      {strategy && temporalTarget && !baselines.length ? <div className="global-inline-message warning-inline">{tr('The TEMPORAL Strategy source run is not available as a completed frozen replay.')}</div> : null}

      <div className="model-tuning-workflow-steps" aria-label={tr('Research workflow')}>
        {['1. BASELINE', '2. RESEARCH', '3. TUNING', '4. RESULTS'].map((label, index) => <span key={label} className={workflowStepIndex === index ? 'active' : ''}>{tr(label)}</span>)}
      </div>

      <section className="model-tuning-step model-tuning-step-baseline">
        <div className="model-tuning-step-heading"><span>1</span><div><strong>{tr('Baseline')}</strong><small>{tr('Choose any Strategy from the catalog. Lifecycle status is guidance, not a research gate.')}</small></div></div>
        <div className="model-tuning-strategy-picker model-tuning-idle-only">
          <label><span>{tr('Search Strategy')}</span><input value={strategySearch} onChange={(event) => setStrategySearch(event.target.value)} placeholder={tr('Name, id, kind or status')} disabled={active || busy} /></label>
          <label><span>{tr('Status')}</span><select value={strategyStatusFilter} onChange={(event) => setStrategyStatusFilter(event.target.value)} disabled={active || busy}><option value="all">{tr('All statuses')}</option>{strategyStatuses.map((status) => <option key={status} value={status}>{tr(status)}</option>)}</select></label>
          <label className="wide"><span>{tr('Strategy catalog')}</span><select value={strategy?.id || ''} onChange={(event) => selectTuningStrategy(event.target.value)} disabled={!canStartTuning || active || busy}><option value="">{tr('Select Strategy')}</option>{selectableStrategyCatalog.map((item) => <option key={item.id} value={item.id}>{item.name} · {String(item.status || 'draft').toUpperCase()} · {item.strategy_kind || 'standard'} · r{item.revision}</option>)}</select></label>
        </div>
        {strategy ? <div className="model-tuning-selected-strategy"><div><span>{tr('Selected Strategy')}</span><strong>{strategy.name}</strong></div><div><span>{tr('Status')}</span><strong>{tr(strategy.status)}</strong></div><div><span>{tr('Kind')}</span><strong>{strategy.strategy_kind || 'standard'}</strong></div><div><span>{tr('Revision')}</span><strong>{strategy.revision}</strong></div>{officialWinner ? <div className="model-tuning-winner-reference"><span>{tr('Official Winner')}</span><strong>{officialWinner.name}</strong><small>{officialWinner.tuning_result_metrics?.ending_capital != null ? money(officialWinner.tuning_result_metrics.ending_capital) : tr(officialWinner.status || 'winner')}</small></div> : null}</div> : null}
      </section>

      {temporalStrategy && temporalModes.length ? (
        <div className="model-tuning-temporal-mode model-tuning-idle-only">
          <div className="model-tuning-temporal-mode-head">
            <div><span className="panel-kicker">{tr('TEMPORAL TUNING')}</span><strong>{tr('Choose what to optimize')}</strong></div>
            <small>{tr('Model first, then policy. Both use the same materialized TEMPORAL Strategy workflow.')}</small>
          </div>
          <div className="research-mode-switch">
            {temporalModes.map((item) => (
              <button
                key={item.id}
                type="button"
                className={temporalTuningTarget === item.id ? 'active' : ''}
                disabled={active || busy}
                onClick={() => {
                  setTemporalTuningTarget(item.id)
                  setCandidateCount(item.id === 'temporal_model' ? Math.min(8, catalog.default_candidate_count || 20) : (catalog.default_candidate_count || 20))
                }}
              >
                <strong>{tr(item.id === 'temporal_model' ? 'Model Tuning · LightGBM' : 'Policy Tuning · Replay')}</strong>
                <span>{tr(item.description || '')}</span>
              </button>
            ))}
          </div>
          {temporalModelMode ? <div className="global-inline-message warning-inline">{tr('Full Temporal Model Tuning retrains LightGBM for every candidate and is intentionally much slower than Policy Tuning.')}</div> : null}
        </div>
      ) : null}

      {temporalStrategy && catalog?.fold_protocol?.supported ? (
        <section className="model-tuning-fold-protocol model-tuning-idle-only">
          <div className="model-tuning-fold-protocol-heading">
            <div>
              <span className="panel-kicker">{tr('WALK-FORWARD PROTOCOL')}</span>
              <strong>{tr('Research → Validation → Certification')}</strong>
            </div>
            <small>{tr('Folds are part of the experimental protocol and are never optimized by CARO.')}</small>
          </div>
          <div className="model-tuning-fold-protocol-grid">
            <label>
              <span>{tr('Research folds')}</span>
              <input type="number" min={foldMinimum} step="1" value={researchFolds} disabled={foldInputDisabled} onChange={(event) => setResearchFolds(event.target.value)} />
              <small>{tr('Used by CARO candidate search. For Policy Tuning, changing this value builds one new frozen Temporal LightGBM prediction cache before the fast policy replays begin.')}</small>
            </label>
            <label>
              <span>{tr('Validation folds')}</span>
              <input type="number" min={Math.max(foldMinimum, Number(researchFolds) || foldMinimum)} step="1" value={validationFolds} disabled={foldInputDisabled} onChange={(event) => setValidationFolds(event.target.value)} />
              <small>{tr('Used only when you validate a selected CARO finalist. The Temporal LightGBM models are fully retrained under the new walk-forward split.')}</small>
            </label>
            <label>
              <span>{tr('Certification folds')}</span>
              <input type="number" min={Math.max(foldMinimum, Number(validationFolds) || foldMinimum)} step="1" value={certificationFolds} disabled={foldInputDisabled} onChange={(event) => setCertificationFolds(event.target.value)} />
              <small>{tr('Used after a finalist passes validation. Certification performs another full Temporal LightGBM walk-forward rerun before Winner eligibility can be considered.')}</small>
            </label>
          </div>
          {!foldProtocolValid ? <small className="model-tuning-fold-protocol-error">{tr('Fold protocol must satisfy Research ≤ Validation ≤ Certification, with at least 2 folds at every stage.')}</small> : null}
          {run?.id && run?.status === 'completed' && run?.method === PROBABILITY_METHOD ? <small>{tr('Continue Research must keep the same Research fold count because the imported CARO observations belong to that protocol. Start a new campaign to change Research folds.')}</small> : null}
        </section>
      ) : null}

      <div className="model-tuning-context-grid model-tuning-context-grid-wide model-tuning-idle-only">
        <div className="model-tuning-context-card model-tuning-target-card">
          <TuningContextLabel
            id="model-tuning-hint-target"
            label="Tuning target"
            description={temporalTarget ? tr('The selected materialized TEMPORAL Strategy is the immutable baseline for both LightGBM Model Tuning and fast Policy Tuning.') : tr('The active Candidate Strategy whose certified Backtest is used as the starting point for this research campaign.')}
          />
          <strong title={strategy?.name || ''}>{strategy?.name || '—'}</strong>
          <small>{strategy ? `${tr(strategy.status)} · ${tr('Revision')} ${strategy.revision}` : '—'}</small>
        </div>
        <div className="model-tuning-context-card model-tuning-scope-card">
          <TuningContextLabel
            id="model-tuning-hint-scope"
            label="Tuning scope"
            description={effectivePlan?.description || catalog?.tuning_scope_description || 'Defines exactly which parameters Adaptive CARO may change while the remaining experiment stays frozen.'}
          />
          <strong title={tr(effectivePlan?.label || effectivePlan?.tuning_scope_label || 'LightGBM model parameters')}>{tr(effectivePlan?.label || effectivePlan?.tuning_scope_label || 'LightGBM model parameters')}</strong>
          <small>{catalog?.joint_optimization ? `${(effectivePlan?.tuned_parameters || catalog.tuned_parameters || []).length} ${tr('parameters')} · ${(catalog.tuned_model_parameters || []).length} LightGBM · ${(catalog.tuned_strategy_parameters || []).length} MARKET/CASH` : `${(effectivePlan?.tuned_parameters || effectivePlan?.search_space || catalog?.tuned_parameters || catalog?.search_space || []).length} ${tr('parameters')}`}</small>
        </div>
        <div className="model-tuning-context-card">
          <TuningContextLabel
            id="model-tuning-hint-saved-model"
            label="Saved model"
            description={temporalModelMode ? tr('The Temporal LightGBM classifiers and regressors are retrained for every challenger. Winner allocation and Temporal policy thresholds remain frozen.') : temporalPolicyMode ? tr('The Temporal LightGBM predictions and underlying Winner remain frozen. Only the Winner-Anchored timing thresholds are replayed.') : tr('Model family currently saved with the Candidate Strategy. Joint CARO may tune the supported LightGBM hyperparameters, while fixed model settings remain unchanged.')}
          />
          <strong>{temporalModelMode ? tr('LightGBM Temporal Intelligence') : temporalPolicyMode ? tr('Temporal Policy') : (strategy?.research_model_configuration?.label || strategy?.research_model?.label || '—')}</strong>
          <small>{temporalModelMode ? tr('Retrained per candidate') : temporalPolicyMode ? tr('LightGBM + Winner frozen') : (modelFamily || '—')}</small>
        </div>
        <div className="model-tuning-context-card worker-online">
          <TuningContextLabel
            id="model-tuning-hint-execution"
            label="Execution"
            description={temporalModelMode ? tr('Candidates retrain Temporal LightGBM sequentially using only the frozen MongoDB market snapshot. No Alpaca request occurs.') : temporalPolicyMode ? tr('Candidates replay the frozen Temporal observations and immutable Winner decisions. No LightGBM retraining, Alpaca request or new market-data load occurs.') : tr('Candidates run sequentially through the integrated API worker. Each LightGBM training still uses the CPU thread configuration saved in the model/runtime.')}
            align="right"
          />
          <strong>{tr(temporalModelMode ? 'Full Temporal LightGBM retrain' : temporalPolicyMode ? 'Frozen Temporal replay' : 'Integrated API worker')}</strong>
          <small>{tr('One candidate at a time')}</small>
        </div>
      </div>

      <div className="model-tuning-baseline model-tuning-baseline-compact">
        <div className="model-tuning-baseline-head">
          <div className="model-tuning-baseline-title">
            <span className="model-tuning-context-label">
              <span>{tr('Selected Strategy baseline')}</span>
              <ParameterHint
                id="model-tuning-hint-baseline"
                title={tr('Selected Strategy baseline')}
                description={tr(temporalModelMode ? 'The API reuses the completed Temporal run as Control, retrains challenger LightGBM models against the same frozen market snapshot, and never downloads new market data.' : temporalPolicyMode ? 'The API reuses the completed Temporal Intelligence source run and frozen replay stored with this TEMPORAL Strategy.' : 'The API uses the latest compatible completed Backtest for the selected Strategy and freezes its execution context for this campaign.')}
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

      <div className="model-tuning-step-heading model-tuning-idle-only"><span>2</span><div><strong>{tr('Research')}</strong><small>{tr('Choose the research method and protocol. Advanced settings stay optional.')}</small></div></div>
      <div className="model-tuning-method-selector model-tuning-method-selector-compact model-tuning-idle-only">
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

      <div className="model-tuning-step-heading"><span>3</span><div><strong>{tr('Tuning')}</strong><small>{tr(active ? 'Campaign is running. No additional action is required unless you want to stop it.' : 'Set the research budget and start the campaign.')}</small></div></div>
      <div className="model-tuning-controls">
        <label>
          <span>{tr(probabilityMode ? 'Research budget (trials)' : 'Exploration candidates')}</span>
          <input type="number" min={catalog.candidate_count_min} max={catalog.research_budget_technical_segment_max || catalog.candidate_count_max} step="1" value={candidateCount} disabled={!canStartTuning || !canTune || active || busy} onChange={(event) => setCandidateCount(event.target.value)} />
          {probabilityMode ? <small>{tr('No fixed research ceiling. Continue Research adds another compatible budget segment without discarding prior observations.')}</small> : null}
        </label>
        <label>
          <span>{tr('Sampling seed')}</span>
          <input type="number" min="0" step="1" value={seed} disabled={!canStartTuning || !canTune || active || busy} onChange={(event) => setSeed(event.target.value)} />
        </label>
        <div className="model-tuning-control-note">
          <span>{tr('Validation')}</span>
          <strong>{tr(temporalModelMode ? 'Walk-forward · frozen market snapshot' : temporalPolicyMode ? 'Frozen Temporal replay' : 'Chronological walk-forward')}</strong>
        </div>
        {(canStartTuning || canStopTuning) ? <div className="model-tuning-actions">
          {canStartTuning ? <button type="button" className="primary-action" onClick={start} disabled={!canTune || active || busy || (temporalStrategy && !foldProtocolValid)}>{busy && !active ? tr('Starting…') : startActionLabel}</button> : null}
          {canStopTuning ? <button type="button" className="secondary-action" onClick={stop} disabled={!active || busy || run?.status === 'stop_requested'}>{run?.status === 'stop_requested' ? tr('Stopping…') : tr('Stop')}</button> : null}
        </div> : null}
      </div>

      {adaptiveMode ? (
        <details className="model-tuning-space model-tuning-advanced model-tuning-idle-only">
          <summary>{tr('Advanced CARO settings')}<span>{tr('Optional')}</span></summary>
          <div className="model-tuning-probability-config">
            <div className="model-tuning-probability-grid">
              <label><span>{tr('Minimum capital improvement (%)')}</span><input type="number" min="0" step="0.1" value={minimumCapitalImprovementPct} disabled={!canStartTuning || active || busy} onChange={(event) => setMinimumCapitalImprovementPct(event.target.value)} /></label>
              <label><span>{tr('Sharpe tolerance')}</span><input type="number" min="0" step="0.01" value={sharpeTolerance} disabled={!canStartTuning || active || busy} onChange={(event) => setSharpeTolerance(event.target.value)} /></label>
              <label><span>{tr('Drawdown tolerance (pp)')}</span><input type="number" min="0" step="0.1" value={drawdownTolerancePct} disabled={!canStartTuning || active || busy} onChange={(event) => setDrawdownTolerancePct(event.target.value)} /></label>
              <label><span>{tr('Minimum worst fold (%)')}</span><input type="number" step="0.1" value={minimumWorstFoldPct} disabled={!canStartTuning || active || busy} onChange={(event) => setMinimumWorstFoldPct(event.target.value)} /></label>
              <label className="model-tuning-checkbox-control"><span>{tr('Adaptive early stopping')}</span><input type="checkbox" checked={adaptiveStoppingEnabled} disabled={!canStartTuning || active || busy} onChange={(event) => setAdaptiveStoppingEnabled(event.target.checked)} /></label>
              <label><span>{tr('No-improvement trials')}</span><input type="number" min="10" step="10" value={noImprovementTrialLimit} disabled={!canStartTuning || active || busy || !adaptiveStoppingEnabled} onChange={(event) => setNoImprovementTrialLimit(event.target.value)} /></label>
              <label><span>{tr('Meaningful improvement (%)')}</span><input type="number" min="0" step="0.05" value={minimumMeaningfulImprovementPct} disabled={!canStartTuning || active || busy || !adaptiveStoppingEnabled} onChange={(event) => setMinimumMeaningfulImprovementPct(event.target.value)} /></label>
            </div>
          </div>
        </details>
      ) : null}

      <details className="model-tuning-space model-tuning-idle-only">
        <summary>{tr('Search space')}<span>{(effectivePlan?.search_space || catalog.search_space || []).length} {tr('parameters')}</span></summary>
        <div className="model-tuning-space-grid">
          {(effectivePlan?.search_space || catalog.search_space || []).map((field) => (
            <div key={field.name}>
              <strong>{field.name}</strong>
              <span>{field.min} → {field.max}</span>
            </div>
          ))}
        </div>
      </details>

      <div className="model-tuning-step-heading model-tuning-results-step-heading"><span>4</span><div><strong>{tr('Results')}</strong><small>{tr(active ? 'Live campaign status and current challengers.' : 'Compare challengers with the selected baseline Strategy.')}</small></div></div>

      {run ? (
        <div className="model-tuning-run">
          <div className="model-tuning-progress-row">
            <div>
              <strong>{tr('Campaign')} {run.id}</strong>
              <span>{tr(run.status)} · {run.research_completed_candidates ?? run.completed_candidates}/{run.research_total_candidates ?? run.total_candidates} {tr('completed')}{run.cancelled_candidates ? ` · ${run.cancelled_candidates} ${tr('cancelled')}` : ''} · {tr(run.tuning_scope_label || catalog?.tuning_scope_label || '')} · {(catalog.methods || []).find((item) => item.id === run.method)?.label || run.method}</span>
              <span>{tr('Created at')} {run.created_at ? new Date(run.created_at).toLocaleString() : '—'}{run.created_by ? ` · ${tr('Started by')} ${run.created_by}` : ''}</span>
            </div>
            <div className="model-tuning-run-actions">
              {canViewTuningLogs ? <button type="button" className="secondary-action compact" onClick={openCampaignLog} disabled={logLoading}>{tr('Campaign log')}</button> : null}
              {canExportTuning && !active ? <button type="button" className="secondary-action compact" onClick={exportCampaign} disabled={exporting}>{tr(exporting ? 'Exporting…' : 'Export Campaign')}</button> : null}
              {canStartTuning && temporalStrategy && run.status === 'completed' && run.method === PROBABILITY_METHOD ? <button type="button" className="secondary-action compact" onClick={continueResearch} disabled={busy || !tuningStartContractCompatible || !foldProtocolValid || !continuationResearchFoldsCompatible}>{tr('Continue Research')}</button> : null}
              {run.validation_processing_id ? <button type="button" className="secondary-action compact" onClick={viewChampionAnalytics}>{tr('View Analytics')}</button> : null}
              <strong>{Number(run.progress || 0).toFixed(1)}%</strong>
            </div>
          </div>
          <div className="model-tuning-progress-track"><i style={{ width: `${Math.max(0, Math.min(100, Number(run.progress || 0)))}%` }} /></div>
          {active && currentBestCandidate ? (
            <div className="model-tuning-current-best">
              <div><span>{tr('Current best')}</span><strong>{candidateLabel(currentBestCandidate)}</strong></div>
              <div><span>{tr('Capital')}</span><strong>{money(currentBestCandidate.metrics?.ending_capital)}</strong></div>
              <div><span>{tr('vs selected baseline')}</span><strong className={signedMetricTone(currentBestImprovement)}>{currentBestImprovement == null ? '—' : pct(currentBestImprovement)}</strong></div>
            </div>
          ) : null}
          {run.tuning_scope === 'temporal_model' && run.current_candidate_id != null ? (
            <div className="model-tuning-current-candidate-progress">
              <span>{tr('Candidate')} #{run.current_candidate_id} · {tr(run.current_candidate_stage || 'Training Temporal LightGBM')}</span>
              <strong>{Number(run.current_candidate_progress || 0).toFixed(1)}%</strong>
            </div>
          ) : null}
          {run.baseline_execution ? <small>{tr('Baseline')} · {run.baseline_execution.job_id} · {money(run.baseline_execution.metrics?.ending_capital)}</small> : null}
          {run.probability_anchor ? <small>{tr('Champion anchor')} · {run.probability_anchor.candidate_id !== undefined ? `#${run.probability_anchor.candidate_id} · ` : ''}{money(run.probability_anchor.metrics?.ending_capital)} · {run.imported_observation_count || 0} {tr('imported observations')}</small> : null}
          {run.method === PROBABILITY_METHOD && run.probability_state ? <small>{tr('Unified state')} · {tr('Champion')} #{run.probability_state.last_champion_candidate_id ?? run.probability_anchor?.candidate_id ?? 0} · {tr('Exploration trials')} {run.probability_state.exploration_trials_completed || 0} · {tr('Adaptive trials')} {run.probability_state.adaptive_trials_completed || 0} · {tr('Trust region')} {(Number(run.probability_state.trust_region_radius || 0) * 100).toFixed(1)}% · {tr('No-improvement streak')} {run.probability_state.no_improvement_streak || 0}</small> : null}
          {run.market_data_cutoff_date ? <small>{tr('Frozen market-data cutoff')} · {run.market_data_cutoff_date}</small> : null}
          {run.adaptive_early_stopped ? <small>{tr(run.adaptive_early_stop_reason || 'Adaptive early stopping completed the campaign after convergence.')}</small> : null}
          {run.status === 'stop_requested' ? <small>{tr(run?.tuning_scope === 'temporal_model' ? 'Cancelling the active Temporal LightGBM candidate at the next model checkpoint. Partial research artifacts will be discarded.' : 'Cancelling the active tuning candidate now. Partial research artifacts will be discarded.')}</small> : null}
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
            {visibleCandidates.map((candidate) => (
              <ModelTuningCandidateCard
                key={candidate.candidate_id}
                candidate={candidate}
                run={run}
                active={active}
                candidateCardMethod={candidateCardMethod}
                temporalPolicyMode={temporalPolicyMode}
                temporalModelMode={temporalModelMode}
                temporalTarget={temporalTarget}
                canPromoteTuning={canPromoteTuning}
                canViewTuningLogs={canViewTuningLogs}
                busy={busy}
                logLoading={logLoading}
                validationFolds={validationFolds}
                certificationFolds={certificationFolds}
                onParameters={setParameterCandidateId}
                onView={setSelectedCandidateId}
                onLog={openCandidateLog}
                onAdopt={adopt}
                onValidate={validateFinalist}
                onCertify={certifyCandidate}
                onViewProcessing={viewProcessing}
              />
            ))}
          </div>



        </div>
      ) : null}

      <ModelTuningCandidateDetailDialog
        candidate={selectedCandidate}
        gateTuning={gateTuning}
        canViewTuningLogs={canViewTuningLogs}
        logLoading={logLoading}
        onOpenLog={openCandidateLog}
        onClose={() => setSelectedCandidateId(null)}
      />
      <ModelTuningParametersDialog candidate={parameterCandidate} onClose={() => setParameterCandidateId(null)} />
      <ModelTuningLogDialog
        view={logView}
        loading={logLoading}
        error={logError}
        runId={run?.id}
        onClose={() => { setLogView(EMPTY_TUNING_LOG_VIEW); setLogError('') }}
        onCopy={copyDiagnosticLog}
        onDownload={downloadDiagnosticLog}
      />
    </section>
  )
}
