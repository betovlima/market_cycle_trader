import { tr } from '../../../i18n/runtime'
import { money, number, percent, shortDateTime } from '../../../shared/formatters'
import { DiagnosticResult, EvidenceBadge, EvidenceResult, NumericField, ResearchResult, WorkflowStep } from './TemporalRotationQualityPrimitives'
import { statusLabel } from '../temporalRotationQualityUtils'

const ACTIVE = new Set(['queued', 'running'])

export function TemporalRotationQualityView({ workspace }: AppRecord) {
  const {
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
  } = workspace

  return (
    <section className="temporal-section rotation-quality-console rotation-quality-console-refined">
      <div className="temporal-section-heading">
        <h3>{tr('Rotation Quality Research')}</h3>
      </div>

      {error ? <div className="global-inline-message error-inline">{error}</div> : null}

      <div className="rotation-quality-workflow" aria-label={tr('Current workflow')}>
        <WorkflowStep label="Research" state={researchWorkflowState} tone={research?.status === 'completed' ? 'complete' : researchActive ? 'active' : ''} />
        <WorkflowStep label="Validation" state={validationWorkflowState} tone={validationWorkflowState === 'PASS' ? 'pass' : validationWorkflowState === 'FAIL' ? 'fail' : ''} />
        <WorkflowStep label="Certification" state={certificationWorkflowState} tone={certificationWorkflowState === 'PASS' ? 'pass' : certificationWorkflowState === 'FAIL' ? 'fail' : ''} />
        <WorkflowStep label="Diagnostics" state={diagnosticWorkflowState} tone={diagnosticActive ? 'active' : diagnostic?.status === 'completed' ? 'complete' : latestCertificationSummary ? 'next' : ''} />
      </div>

      {validation?.status === 'completed' && diagnosticForm ? <div className="rotation-quality-card rotation-quality-current-action">
        <div className="rotation-quality-current-action-heading">
          <div>
            <span>{tr('Current action')}</span>
            <strong>{tr('Diagnostics')}</strong>
          </div>
          <span className="rotation-quality-current-action-state">{statusLabel(diagnostic?.status || '—')}</span>
        </div>

        <div className="rotation-quality-form-grid current-action-grid">
          <label className="rotation-quality-field wide">
            <span>{tr('Source execution')}</span>
            <select value={validation?.id || ''} disabled={disabled} onChange={(event: any) => selectValidation(event.target.value)}>
              {completedEvidence.map((item: AppRecord) => <option key={item.id} value={item.id}>{tr(item.kind === 'certification' ? 'Certification' : 'Validation')} · {item.fold_count} {tr('folds')} · {shortDateTime(item.created_at)}</option>)}
            </select>
          </label>
          <label className="rotation-quality-field">
            <span>{tr('Candidate')}</span>
            <select value={diagnosticForm.candidate_id} disabled={disabled} onChange={(event: any) => setDiagnosticForm((current: any) => ({ ...current, candidate_id: event.target.value }))}>
              <option value="">—</option>
              {(validation.candidates || []).map((item: AppRecord) => <option key={item.candidate_id} value={item.candidate_id}>{item.candidate_id}</option>)}
            </select>
          </label>
        </div>

        <details className="rotation-quality-advanced">
          <summary>{tr('Advanced parameters')}</summary>
          <div className="rotation-quality-advanced-body">
            <div className="rotation-quality-form-grid">
              <NumericField label="Lookback sessions" value={diagnosticForm.lookback_sessions} min={config.diagnostics?.limits?.lookback_sessions_min} max={config.diagnostics?.limits?.lookback_sessions_max} step="1" disabled={disabled} onChange={(value: any) => setDiagnosticForm((current: any) => ({ ...current, lookback_sessions: value }))} />
              <NumericField label="Minimum group samples" value={diagnosticForm.minimum_group_samples} min={config.diagnostics?.limits?.minimum_group_samples_min} max={config.diagnostics?.limits?.minimum_group_samples_max} step="1" disabled={disabled} onChange={(value: any) => setDiagnosticForm((current: any) => ({ ...current, minimum_group_samples: value }))} />
              <NumericField label="Outcome neutral band" value={diagnosticForm.outcome_neutral_band} min={config.diagnostics?.limits?.outcome_neutral_band_min} max={config.diagnostics?.limits?.outcome_neutral_band_max} disabled={disabled} onChange={(value: any) => setDiagnosticForm((current: any) => ({ ...current, outcome_neutral_band: value }))} />
              <NumericField label="Top feature count" value={diagnosticForm.top_feature_count} min={config.diagnostics?.limits?.top_feature_count_min} max={config.diagnostics?.limits?.top_feature_count_max} step="1" disabled={disabled} onChange={(value: any) => setDiagnosticForm((current: any) => ({ ...current, top_feature_count: value }))} />
            </div>
            <div className="rotation-quality-subsection-title">{tr('Decision-time features')}</div>
            <div className="rotation-quality-feature-grid">{(config.diagnostics?.features || []).map((item: AppRecord) => <label key={item.id} className="rotation-quality-feature-option"><input type="checkbox" checked={diagnosticForm.feature_names.includes(item.id)} disabled={disabled} onChange={() => toggleDiagnosticFeature(item.id)} /><span>{tr(item.label)}</span></label>)}</div>
          </div>
        </details>

        <div className="rotation-quality-actions current-action-actions">
          {canManage && !diagnosticActive ? <button type="button" className="primary-action compact" disabled={disabled || !diagnosticForm.candidate_id || !diagnosticForm.feature_names.length} onClick={startDiagnostic}>{tr('Run Diagnostic')}</button> : null}
          {canManage && diagnosticActive ? <button type="button" className="secondary-action compact danger" disabled={busy} onClick={stopDiagnostic}>{tr('Stop Diagnostic')}</button> : null}
          {canExport && diagnostic?.status === 'completed' ? <button type="button" className="secondary-action compact" disabled={exporting} onClick={exportDiagnostic}>{tr('Export Diagnostic')}</button> : null}
        </div>

        {diagnostic ? <div className="rotation-quality-diagnostic-current">
          <div className="rotation-quality-card-title"><strong>{diagnostic.candidate_id || tr('Diagnostic')}</strong><span>{diagnostic.id}</span><span>{statusLabel(diagnostic.status)}</span></div>
          {diagnosticActive ? <><div className="temporal-status-line"><strong>{statusLabel(diagnostic.status)}</strong><span>{diagnostic.stage || '—'}</span><span>{number(diagnostic.progress, 1)}%</span></div><div className="temporal-progress"><span style={{ width: `${Math.max(0, Math.min(100, Number(diagnostic.progress || 0)))}%` }} /></div></> : null}
          {diagnostic.failure_message ? <div className="global-inline-message error-inline">{diagnostic.failure_message}</div> : null}
          <DiagnosticResult diagnostic={diagnostic} />
        </div> : null}
      </div> : null}

      <details className="rotation-quality-disclosure">
        <summary><strong>{tr('Research & candidates')}</strong><span>{research ? statusLabel(research.status) : '—'}</span></summary>
        <div className="rotation-quality-disclosure-body">
          <div className="rotation-quality-card embedded-card">
            <div className="rotation-quality-card-title"><strong>{tr('Research')}</strong></div>
            <div className="rotation-quality-form-grid">
              <label className="rotation-quality-field wide"><span>{tr('Source Temporal run')}</span><input value={researchForm.source_run_id} disabled={disabled} onChange={(event: any) => updateResearch('source_run_id', event.target.value)} /></label>
              <label className="rotation-quality-field"><span>{tr('Search method')}</span><select value={method} disabled={disabled} onChange={(event: any) => updateResearch('search_method', event.target.value)}>{(config.search_methods || []).map((item: AppRecord) => <option key={item.id} value={item.id}>{tr(item.label)}</option>)}</select></label>
              <label className="rotation-quality-field"><span>{tr('Focus month')}</span><input type="month" value={researchForm.focus_month} disabled={disabled} onChange={(event: any) => updateResearch('focus_month', event.target.value)} /></label>
              <NumericField label="Control tolerance (USD)" value={researchForm.control_tolerance_usd} disabled={disabled} onChange={(value: any) => updateResearch('control_tolerance_usd', value)} />
              <label className="rotation-quality-feature-option rotation-quality-strong-toggle">
                <input type="checkbox" checked={researchForm.strong_challenger_override} disabled={disabled} onChange={(event: any) => updateResearch('strong_challenger_override', event.target.checked)} />
                <span>{tr('Strong Challenger Override')}</span>
              </label>
            </div>

            {researchForm.strong_challenger_override ? <div className="rotation-quality-form-grid method-grid rotation-quality-baseline-grid">
              <NumericField label="Baseline drawdown trigger" value={researchForm.baseline_drawdown_trigger} disabled={disabled} onChange={(value: any) => updateResearch('baseline_drawdown_trigger', value)} />
              <NumericField label="Baseline rotation score tolerance" value={researchForm.baseline_rotation_score_tolerance} disabled={disabled} onChange={(value: any) => updateResearch('baseline_rotation_score_tolerance', value)} />
            </div> : null}

            {method === 'grid' ? <div className="rotation-quality-form-grid method-grid">
              {researchForm.strong_challenger_override ? <label className="rotation-quality-field full"><span>{tr('Challenger quality floors')}</span><textarea rows="3" value={researchForm.challenger_quality_floors} disabled={disabled} onChange={(event: any) => updateResearch('challenger_quality_floors', event.target.value)} /></label> : <>
                <label className="rotation-quality-field wide"><span>{tr('Drawdown triggers')}</span><textarea rows="3" value={researchForm.drawdown_triggers} disabled={disabled} onChange={(event: any) => updateResearch('drawdown_triggers', event.target.value)} /></label>
                <label className="rotation-quality-field wide"><span>{tr('Rotation score tolerances')}</span><textarea rows="3" value={researchForm.rotation_score_tolerances} disabled={disabled} onChange={(event: any) => updateResearch('rotation_score_tolerances', event.target.value)} /></label>
              </>}
            </div> : null}

            {method === 'manual' ? <div className="rotation-quality-form-grid method-grid">
              <label className="rotation-quality-field full"><span>{tr(researchForm.strong_challenger_override ? 'Manual candidates · drawdown, tolerance, challenger floor' : 'Manual candidates · drawdown, tolerance')}</span><textarea rows="5" value={researchForm.manual_candidates} disabled={disabled} onChange={(event: any) => updateResearch('manual_candidates', event.target.value)} /></label>
            </div> : null}

            {method === 'caro' ? <details className="rotation-quality-advanced nested">
              <summary>{tr('CARO parameters')}</summary>
              <div className="rotation-quality-advanced-body">
                <div className="rotation-quality-form-grid method-grid">
                  {researchForm.strong_challenger_override ? <>
                    <NumericField label="Challenger quality floor min" value={researchForm.caro.challenger_quality_floor_min} min="0" max="1" disabled={disabled} onChange={(value: any) => updateCaro('challenger_quality_floor_min', value)} />
                    <NumericField label="Challenger quality floor max" value={researchForm.caro.challenger_quality_floor_max} min="0" max="1" disabled={disabled} onChange={(value: any) => updateCaro('challenger_quality_floor_max', value)} />
                  </> : <>
                    <NumericField label="Drawdown min" value={researchForm.caro.drawdown_trigger_min} disabled={disabled} onChange={(value: any) => updateCaro('drawdown_trigger_min', value)} />
                    <NumericField label="Drawdown max" value={researchForm.caro.drawdown_trigger_max} disabled={disabled} onChange={(value: any) => updateCaro('drawdown_trigger_max', value)} />
                    <NumericField label="Tolerance min" value={researchForm.caro.rotation_score_tolerance_min} disabled={disabled} onChange={(value: any) => updateCaro('rotation_score_tolerance_min', value)} />
                    <NumericField label="Tolerance max" value={researchForm.caro.rotation_score_tolerance_max} disabled={disabled} onChange={(value: any) => updateCaro('rotation_score_tolerance_max', value)} />
                  </>}
                  <NumericField label="Trials" value={researchForm.caro.trials} min={limits.caro_trials_min} max={limits.caro_trials_max} step="1" disabled={disabled} onChange={(value: any) => updateCaro('trials', value)} />
                  <NumericField label="Seed" value={researchForm.caro.seed} step="1" disabled={disabled} onChange={(value: any) => updateCaro('seed', value)} />
                  <NumericField label="Candidate pool size" value={researchForm.caro.candidate_pool_size} step="1" disabled={disabled} onChange={(value: any) => updateCaro('candidate_pool_size', value)} />
                  <NumericField label="Space-filling pool size" value={researchForm.caro.space_filling_pool_size} step="1" disabled={disabled} onChange={(value: any) => updateCaro('space_filling_pool_size', value)} />
                  <NumericField label="Exploration weight" value={researchForm.caro.exploration_weight} disabled={disabled} onChange={(value: any) => updateCaro('exploration_weight', value)} />
                  <NumericField label="Minimum exploration trials" value={researchForm.caro.minimum_exploration_trials} step="1" disabled={disabled} onChange={(value: any) => updateCaro('minimum_exploration_trials', value)} />
                  <NumericField label="Initial exploration fraction" value={researchForm.caro.initial_exploration_fraction} disabled={disabled} onChange={(value: any) => updateCaro('initial_exploration_fraction', value)} />
                  <NumericField label="Minimum exploration fraction" value={researchForm.caro.minimum_exploration_fraction} disabled={disabled} onChange={(value: any) => updateCaro('minimum_exploration_fraction', value)} />
                  <NumericField label="Stagnation recovery trials" value={researchForm.caro.stagnation_recovery_trials} step="1" disabled={disabled} onChange={(value: any) => updateCaro('stagnation_recovery_trials', value)} />
                  <NumericField label="CARO minimum capital improvement" value={researchForm.caro.minimum_capital_improvement} disabled={disabled} onChange={(value: any) => updateCaro('minimum_capital_improvement', value)} />
                  <NumericField label="CARO Sharpe tolerance" value={researchForm.caro.sharpe_tolerance} disabled={disabled} onChange={(value: any) => updateCaro('sharpe_tolerance', value)} />
                  <NumericField label="CARO drawdown tolerance" value={researchForm.caro.drawdown_tolerance} disabled={disabled} onChange={(value: any) => updateCaro('drawdown_tolerance', value)} />
                  <NumericField label="CARO minimum worst fold return" value={researchForm.caro.minimum_worst_fold_return} disabled={disabled} onChange={(value: any) => updateCaro('minimum_worst_fold_return', value)} />
                </div>
              </div>
            </details> : null}

            <details className="rotation-quality-advanced nested">
              <summary>{tr('Research gate')}</summary>
              <div className="rotation-quality-advanced-body">
                <div className="rotation-quality-form-grid">
                  <NumericField label="Minimum capital lift" value={researchForm.research_gate.minimum_capital_lift} disabled={disabled} onChange={(value: any) => updateGate('minimum_capital_lift', value)} />
                  <NumericField label="Minimum Sharpe delta" value={researchForm.research_gate.minimum_sharpe_delta} disabled={disabled} onChange={(value: any) => updateGate('minimum_sharpe_delta', value)} />
                  <NumericField label="Minimum MaxDD delta" value={researchForm.research_gate.minimum_max_drawdown_delta} disabled={disabled} onChange={(value: any) => updateGate('minimum_max_drawdown_delta', value)} />
                  <NumericField label="Required fold wins" value={researchForm.research_gate.required_fold_wins} step="1" disabled={disabled} onChange={(value: any) => updateGate('required_fold_wins', value)} />
                </div>
              </div>
            </details>

            <div className="rotation-quality-actions">
              {canManage ? <button type="button" className="secondary-action compact" onClick={startResearch} disabled={disabled || !researchForm.source_run_id}>{tr(busy ? 'Starting…' : method === 'caro' ? 'Start CARO Research' : 'Start Research')}</button> : null}
              {canExport && research?.status === 'completed' ? <button type="button" className="secondary-action compact" onClick={exportResearch} disabled={exporting}>{tr('Export Research')}</button> : null}
            </div>
          </div>

          {research ? <div className="rotation-quality-card embedded-card">
            <div className="rotation-quality-card-title"><strong>{tr('Current research')}</strong><span>{research.id}</span><span>{statusLabel(research.status)}</span></div>
            {ACTIVE.has(String(research.status || '').toLowerCase()) ? <><div className="temporal-status-line"><strong>{statusLabel(research.status)}</strong><span>{research.stage || '—'}</span><span>{number(research.progress, 1)}%</span></div><div className="temporal-progress"><span style={{ width: `${Math.max(0, Math.min(100, Number(research.progress || 0)))}%` }} /></div></> : null}
            {research.failure_message ? <div className="global-inline-message error-inline">{research.failure_message}</div> : null}
            <ResearchResult research={research} />
          </div> : null}

          {candidateRows.length ? <div className="rotation-quality-card embedded-card">
            <div className="rotation-quality-card-title"><strong>{tr('Candidates')}</strong><span>{selectedCandidates.length} {tr('selected')}</span></div>
            <div className="rotation-quality-table-shell">
              <table className="rotation-quality-table candidates">
                <thead><tr><th></th><th>{tr('Candidate')}</th><th>{tr('DD trigger')}</th><th>{tr('Tolerance')}</th><th>{tr('Quality floor')}</th><th>{tr('Overrides')}</th><th>{tr('Capital')}</th><th>{tr('Lift')}</th><th>{tr('Sharpe')}</th><th>{tr('Max Drawdown')}</th><th>{tr('Fold wins')}</th><th>{tr('Robust')}</th></tr></thead>
                <tbody>{candidateRows.map((candidate: AppRecord) => <tr key={candidate.candidate_id}>
                  <td><input type="checkbox" checked={selectedCandidates.includes(candidate.candidate_id)} disabled={disabled} onChange={() => toggleCandidate(candidate.candidate_id)} /></td>
                  <td><strong>{candidate.candidate_id}</strong></td><td>{percent(candidate.drawdown_trigger, 2)}</td><td>{number(candidate.rotation_score_tolerance, 4)}</td><td>{candidate.challenger_quality_floor == null ? '—' : number(candidate.challenger_quality_floor, 4)}</td><td>{candidate.strong_challenger_overrides == null ? '—' : number(candidate.strong_challenger_overrides, 0)}</td><td>{money(candidate.ending_capital)}</td><td className={Number(candidate.capital_lift_vs_control) >= 0 ? 'positive' : 'negative'}>{percent(candidate.capital_lift_vs_control, 2)}</td><td>{number(candidate.sharpe, 4)}</td><td>{percent(candidate.max_drawdown, 2)}</td><td>{candidate.folds_beating_control ?? '—'}/{research.source_fold_count ?? '—'}</td><td><EvidenceBadge passed={candidate.robust_vs_control} /></td>
                </tr>)}</tbody>
              </table>
            </div>
          </div> : null}
        </div>
      </details>

      {research?.status === 'completed' ? <details className="rotation-quality-disclosure">
        <summary><strong>{tr('Validation & Certification')}</strong><span>{validation ? statusLabel(validation.status) : '—'}</span></summary>
        <div className="rotation-quality-disclosure-body">
          <div className="rotation-quality-evidence-grid">
            {[
              ['validation', validationForm, setValidationForm, 'Validation'],
              ['certification', certificationForm, setCertificationForm, 'Certification'],
            ].map(([kind, form, setForm, title]: any[]) => form ? <div className="rotation-quality-card embedded-card" key={kind}>
              <div className="rotation-quality-card-title"><strong>{tr(title)}</strong></div>
              <div className="rotation-quality-form-grid evidence">
                <NumericField label="Fold count" value={form.fold_count} min={limits.fold_count_min} max={limits.fold_count_max} step="1" disabled={disabled} onChange={(value: any) => setForm((current: any) => ({ ...current, fold_count: value }))} />
                <NumericField label="Required fold wins" value={form.required_fold_wins} min="0" max={form.fold_count || limits.fold_count_max} step="1" disabled={disabled} onChange={(value: any) => setForm((current: any) => ({ ...current, required_fold_wins: value }))} />
                <NumericField label="Minimum capital lift" value={form.minimum_capital_lift} disabled={disabled} onChange={(value: any) => setForm((current: any) => ({ ...current, minimum_capital_lift: value }))} />
                <NumericField label="Minimum Sharpe delta" value={form.minimum_sharpe_delta} disabled={disabled} onChange={(value: any) => setForm((current: any) => ({ ...current, minimum_sharpe_delta: value }))} />
                <NumericField label="Minimum MaxDD delta" value={form.minimum_max_drawdown_delta} disabled={disabled} onChange={(value: any) => setForm((current: any) => ({ ...current, minimum_max_drawdown_delta: value }))} />
              </div>
              <div className="rotation-quality-actions">{canManage ? <button type="button" className="secondary-action compact" disabled={disabled || !selectedCandidates.length} onClick={() => startEvidence(kind)}>{tr(kind === 'certification' ? 'Start Certification' : 'Start Validation')}</button> : null}</div>
            </div> : null)}
          </div>

          {validation ? <div className="rotation-quality-card embedded-card">
            <div className="rotation-quality-card-title"><strong>{tr(validation.kind === 'certification' ? 'Certification result' : 'Validation result')}</strong><span>{validation.id}</span><span>{statusLabel(validation.status)}</span></div>
            {ACTIVE.has(String(validation.status || '').toLowerCase()) ? <><div className="temporal-status-line"><strong>{statusLabel(validation.status)}</strong><span>{validation.stage || '—'}</span><span>{number(validation.progress, 1)}%</span></div><div className="temporal-progress"><span style={{ width: `${Math.max(0, Math.min(100, Number(validation.progress || 0)))}%` }} /></div></> : null}
            {validation.failure_message ? <div className="global-inline-message error-inline">{validation.failure_message}</div> : null}
            <EvidenceResult validation={validation} />
            {canExport && validation?.status === 'completed' ? <div className="rotation-quality-actions"><button type="button" className="secondary-action compact" onClick={exportValidation} disabled={exporting}>{tr(validation.kind === 'certification' ? 'Export Certification' : 'Export Validation')}</button></div> : null}
          </div> : null}
        </div>
      </details> : null}

      <details className="rotation-quality-disclosure compact-history-disclosure">
        <summary><strong>{tr('Execution history')}</strong><span>{validations.length + researches.length + diagnostics.length}</span></summary>
        <div className="rotation-quality-disclosure-body">
          {diagnostics.length ? <div className="rotation-quality-history-group">
            <div className="rotation-quality-subsection-title">{tr('Diagnostics')}</div>
            <div className="rotation-quality-history-row-wrap diagnostic-history">{diagnostics.map((item: AppRecord) => <button key={item.id} type="button" className={diagnostic?.id === item.id ? 'active' : ''} onClick={() => selectDiagnostic(item.id)} disabled={busy}><strong>{item.candidate_id}</strong><span>{item.lookback_sessions || item.request?.lookback_sessions || '—'} {tr('sessions')}</span><span>{statusLabel(item.status)}</span><small>{shortDateTime(item.created_at)}</small></button>)}</div>
          </div> : null}
          {validations.length ? <div className="rotation-quality-history-group">
            <div className="rotation-quality-subsection-title">{tr('Validation / Certification history')}</div>
            <div className="rotation-quality-history-row-wrap">{validations.map((item: AppRecord) => <button key={item.id} type="button" className={validation?.id === item.id ? 'active' : ''} onClick={() => selectValidation(item.id)} disabled={busy}><strong>{item.kind === 'certification' ? tr('Certification') : tr('Validation')}</strong><span>{item.fold_count} {tr('folds')}</span><span>{statusLabel(item.status)}</span><small>{shortDateTime(item.created_at)}</small></button>)}</div>
          </div> : null}
          {researches.length ? <div className="rotation-quality-history-group">
            <div className="rotation-quality-subsection-title">{tr('Research history')}</div>
            <div className="rotation-quality-history-row-wrap">{researches.map((item: AppRecord) => <button key={item.id} type="button" className={research?.id === item.id ? 'active' : ''} onClick={() => selectResearch(item.id)} disabled={busy}><strong>{tr(item.search?.method === 'caro' ? 'Unified Adaptive CARO' : item.search?.method === 'manual' ? 'Manual' : 'Grid Search')}</strong><span>{statusLabel(item.status)}</span><span>{item.best_candidate?.candidate_id || '—'}</span><small>{shortDateTime(item.created_at)}</small></button>)}</div>
          </div> : null}
        </div>
      </details>
    </section>
  )
}
