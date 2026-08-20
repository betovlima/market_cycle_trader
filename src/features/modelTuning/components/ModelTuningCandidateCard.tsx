import { tr } from '../../../i18n/runtime'
import { PROBABILITY_METHOD } from '../modelTuningConfig'
import { candidateLabel, decimal, money, pct } from '../modelTuningUtils'
import { CandidateCardMetric, probabilityMetricTone, signedMetricTone } from './ModelTuningPrimitives'

export function ModelTuningCandidateCard({
  candidate,
  run,
  active,
  candidateCardMethod,
  temporalPolicyMode,
  temporalModelMode,
  temporalTarget,
  canPromoteTuning,
  canViewTuningLogs,
  busy,
  logLoading,
  validationFolds,
  certificationFolds,
  onParameters,
  onView,
  onLog,
  onAdopt,
  onValidate,
  onCertify,
  onViewProcessing,
}: AppRecord) {
  const metrics = candidate.metrics || {}
  const proposal = candidate.proposal || {}
  const adoptable = !active && candidate.status === 'completed' && !candidate.is_control
  const previouslyPromoted = (run?.adoption_history || []).some((item: AppRecord) => Number(item.candidate_id) === Number(candidate.candidate_id))
  const isFinalChampion = !active && candidate.status === 'completed' && !candidate.is_control && Number(run?.best_candidate_id) === Number(candidate.candidate_id)
  const candidateValidation = candidate.validation || null
  const candidateCertification = candidate.certification || null
  const validationStatus = String(candidateValidation?.status || '').toLowerCase()
  const validationRunning = ['queued', 'running'].includes(validationStatus)
  const validationCompleted = validationStatus === 'completed'
  const validationTechnicalFailure = validationStatus === 'failed'
  const canValidateFinalist = temporalPolicyMode && canPromoteTuning && !active && candidate.status === 'completed' && !candidate.is_control && (!candidateValidation || validationTechnicalFailure)
  const canCertifyCandidate = temporalPolicyMode && canPromoteTuning && !active && validationCompleted && Boolean(candidateValidation?.passed) && !candidateCertification
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
  const hasExecutionStatusIndicator = !candidate.is_control && ['probability_startup', 'unified_exploration', 'champion_probability'].includes(candidate.kind)
  const statusLabelKey = ({
    running: 'Running',
    queued: 'Queued',
    pending: 'Pending',
    completed: 'Completed',
    failed: 'Failed',
    cancelled: 'Cancelled',
  } as Record<string, string>)[String(status)] || 'Status'
  const persistedJobProgress = Math.max(0, Math.min(100, Number(candidate.job_progress || 0)))
  const liveCurrentCandidate = candidate.status === 'running' && run?.current_candidate_id != null && Number(run.current_candidate_id) === Number(candidate.candidate_id)
  const liveCurrentCandidateProgress = Math.max(0, Math.min(100, Number(run?.current_candidate_progress || 0)))
  const jobProgress = liveCurrentCandidate ? Math.max(persistedJobProgress, liveCurrentCandidateProgress) : persistedJobProgress
  const jobProgressLabel = `${jobProgress.toFixed(0)}%`
  const statusTitle = candidate.status === 'running' ? `${tr(statusLabelKey)} · ${jobProgressLabel}` : tr(statusLabelKey)
  const hasParameters = Object.keys(candidate.settings || {}).length > 0
  const showResults = candidate.is_control || ['completed', 'failed', 'cancelled'].includes(status)

  return (
    <article className={`model-tuning-candidate-card ${tone} ${status}`}>
      <header className="model-tuning-candidate-card-header">
        <div className="model-tuning-candidate-card-title model-tuning-candidate-card-title-header">
          <div className="model-tuning-candidate-name-row">
            {hasExecutionStatusIndicator && status === 'running' ? <span className="model-tuning-caro-status-loader" aria-hidden="true" /> : null}
            {hasExecutionStatusIndicator && status === 'completed' ? <span className="model-tuning-caro-status-complete" aria-hidden="true" /> : null}
            <strong className={`model-tuning-candidate-name ${status}`} title={candidateLabel(candidate)}>{candidateLabel(candidate)}</strong>
          </div>
          <small>{candidate.is_control && candidate.baseline_reused ? `${tr('Certified Backtest reused')} · ${candidate.source_job_id || candidate.job_id || '—'}` : `#${candidate.candidate_id} · ${typeLabel}`}</small>
        </div>
        {candidate.status === 'running' ? (
          <span className="loader" role="status" aria-label={statusTitle} title={statusTitle}>
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
      {validationRunning ? (
        <div className="model-tuning-validation-progress">
          <div>
            <span>{tr('Validating')} · {candidateValidation.fold_count || run?.fold_protocol?.validation_folds || validationFolds} {tr('folds')} · {tr(candidateValidation.stage || 'Starting validation')}</span>
            <strong>{Number(candidateValidation.progress || 0).toFixed(1)}%</strong>
          </div>
          <div className="model-tuning-progress-track"><i style={{ width: `${Math.max(0, Math.min(100, Number(candidateValidation.progress || 0)))}%` }} /></div>
        </div>
      ) : null}
      {validationTechnicalFailure ? <small className="model-tuning-candidate-card-error">{tr('Validation processing failed')} · {candidateValidation.failure_message || tr('See log')}</small> : null}

      <footer className="model-tuning-candidate-card-actions">
        {hasParameters ? <button type="button" onClick={() => onParameters(candidate.candidate_id)}>{tr('Parameters')}</button> : null}
        <button type="button" onClick={() => onView(candidate.candidate_id)}>{tr('View')}</button>
        {canViewTuningLogs && !candidate.baseline_preview ? <button type="button" onClick={() => onLog(candidate)} disabled={logLoading}>{tr('Log')}</button> : null}
        {previouslyPromoted && !temporalTarget ? <span className="model-tuning-adopted">{tr('Promoted')}</span> : null}
        {temporalModelMode && canPromoteTuning && isFinalChampion ? <button type="button" onClick={() => onAdopt(candidate)} disabled={busy}>{tr('Continue to Policy Tuning')}</button> : null}
        {canValidateFinalist ? <button type="button" onClick={() => onValidate(candidate)} disabled={busy}>{tr(validationTechnicalFailure ? 'Retry Validation' : 'Validate')} · {run?.fold_protocol?.validation_folds || validationFolds} {tr('folds')}</button> : null}
        {validationCompleted ? <span className={`model-tuning-adopted ${candidateValidation.passed ? '' : 'failed'}`}>{tr(candidateValidation.passed ? 'Validation passed' : 'Validation failed')} · {candidateValidation.fold_count || run?.fold_protocol?.validation_folds || validationFolds}</span> : null}
        {validationCompleted && candidateValidation?.processing_id ? <button type="button" onClick={() => onViewProcessing(candidateValidation.processing_id)}>{tr('Validation Analytics')}</button> : null}
        {canCertifyCandidate ? <button type="button" onClick={() => onCertify(candidate)} disabled={busy}>{tr('Certify')} · {run?.fold_protocol?.certification_folds || certificationFolds} {tr('folds')}</button> : null}
        {candidateCertification ? <span className={`model-tuning-adopted ${candidateCertification.passed ? '' : 'failed'}`}>{tr(candidateCertification.passed ? 'Certification passed' : 'Certification failed')} · {candidateCertification.fold_count || run?.fold_protocol?.certification_folds || certificationFolds}</span> : null}
        {candidateCertification?.processing_id ? <button type="button" onClick={() => onViewProcessing(candidateCertification.processing_id)}>{tr('Certification Analytics')}</button> : null}
        {!temporalTarget && canPromoteTuning && adoptable ? <button type="button" onClick={() => onAdopt(candidate)} disabled={busy}>{tr(previouslyPromoted ? 'Promote again' : 'Promote to Backtest')}</button> : null}
      </footer>
    </article>
  )
}
