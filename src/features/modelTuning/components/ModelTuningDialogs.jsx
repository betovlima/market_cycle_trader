import { tr } from '../../../i18n/runtime'
import { candidateLabel, decimal, money, pct } from '../modelTuningUtils'
import { CandidateParametersGrid } from './ModelTuningPrimitives'

export function ModelTuningCandidateDetailDialog({ candidate, gateTuning, canViewTuningLogs, logLoading, onOpenLog, onClose }) {
  if (!candidate) return null
  return (
    <div className="model-tuning-candidate-detail-overlay" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}>
      <div className="model-tuning-candidate-detail-dialog" role="dialog" aria-modal="true" aria-label={`${tr('View')} · ${candidateLabel(candidate)}`}>
        <div className="model-tuning-candidate-detail-body">
          <div className="model-tuning-results-heading">
            <div><strong>{candidateLabel(candidate)}</strong><span>{candidate.settings_hash}</span></div>
            <button type="button" className="secondary-action compact" onClick={onClose}>{tr('Close')}</button>
          </div>
          {candidate.proposal ? (
            <div className="model-tuning-proposal-grid">
              <div><span>{tr('Estimated P(beat Champion)')}</span><strong>{pct(candidate.proposal.estimated_probability_beats_champion)}</strong></div>
              <div><span>{tr('Expected improvement')}</span><strong>{pct(candidate.proposal.estimated_expected_improvement)}</strong></div>
              <div><span>{tr('Predicted capital')}</span><strong>{money(candidate.proposal.estimated_ending_capital_mean)}</strong></div>
              <div><span>{tr('Prediction spread')}</span><strong>{money(candidate.proposal.estimated_ending_capital_std)}</strong></div>
              <div><span>{tr('Predicted Sharpe')}</span><strong>{decimal(candidate.proposal.estimated_sharpe_mean)}</strong></div>
              <div><span>{tr('Predicted max DD')}</span><strong>{pct(candidate.proposal.estimated_maximum_drawdown_mean)}</strong></div>
              <div><span>{tr('Predicted worst fold')}</span><strong>{pct(candidate.proposal.estimated_worst_fold_mean)}</strong></div>
              <div><span>{tr('Observations used')}</span><strong>{candidate.proposal.observation_count ?? '—'}</strong></div>
              <div><span>{tr('Acquisition score')}</span><strong>{decimal(candidate.proposal.acquisition_score, 5)}</strong></div>
            </div>
          ) : null}
          {candidate.proposal?.promising_region ? (
            <div className="model-tuning-promising-region">
              <strong>{tr('Promising region')}</strong>
              <div className="model-tuning-settings-grid">
                {Object.entries(candidate.proposal.promising_region).map(([name, bounds]) => (
                  <div key={name}><span>{name}</span><strong>{String(bounds?.low ?? '—')} → {String(bounds?.high ?? '—')}</strong></div>
                ))}
              </div>
            </div>
          ) : null}
          {candidate.status === 'failed' ? (
            <div className="model-tuning-candidate-failure">
              <strong>{candidate.failure_type || tr('Candidate failed')}</strong>
              <span>{candidate.failure_message || candidate.error || tr('Open the execution log for the technical details.')}</span>
              {canViewTuningLogs && !candidate.baseline_preview ? <button type="button" className="secondary-action compact" onClick={() => onOpenLog(candidate)} disabled={logLoading}>{tr('Open log')}</button> : null}
            </div>
          ) : null}
          {gateTuning && candidate.metrics ? (
            <div className="model-tuning-proposal-grid">
              <div><span>{tr('Market Exposure')}</span><strong>{pct(candidate.metrics.market_exposure)}</strong></div>
              <div><span>{tr('CASH Days')}</span><strong>{candidate.metrics.cash_days == null ? '—' : Number(candidate.metrics.cash_days).toFixed(0)}</strong></div>
              <div><span>{tr('Cash Gate Overrides')}</span><strong>{candidate.metrics.cash_gate_changed_base_action_sessions ?? '—'}</strong></div>
              <div><span>{tr('Net Cash-Gate Diagnostic')}</span><strong>{pct(candidate.metrics.cash_gate_net_avoided_return_sum)}</strong></div>
            </div>
          ) : null}
          {candidate.metrics?.folds?.length ? (
            <div className="model-tuning-fold-grid">
              {candidate.metrics.folds.map((fold) => <div key={fold.fold_id}><span>{tr('Fold')} {fold.fold_id}</span><strong>{pct(fold.strategy_return)}</strong><small>{tr('Max DD')} {pct(fold.maximum_drawdown)}</small></div>)}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  )
}

export function ModelTuningParametersDialog({ candidate, onClose }) {
  if (!candidate) return null
  return (
    <div className="model-tuning-parameters-overlay" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}>
      <div className="model-tuning-parameters-dialog" role="dialog" aria-modal="true" aria-label={`${tr('Parameters')} · ${candidateLabel(candidate)}`}>
        <div className="model-tuning-parameters-dialog-heading">
          <div>
            <span>{tr('Parameters')}</span>
            <strong>{candidateLabel(candidate)}</strong>
            {candidate.settings_hash ? <small>{candidate.settings_hash}</small> : null}
          </div>
          <button type="button" className="secondary-action compact" onClick={onClose}>{tr('Close')}</button>
        </div>
        <CandidateParametersGrid settings={candidate.settings} />
      </div>
    </div>
  )
}

export function ModelTuningLogDialog({ view, loading, error, runId, onClose, onCopy, onDownload }) {
  if (!view.open && !loading && !error) return null
  return (
    <div className="model-tuning-log-overlay" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}>
      <div className="model-tuning-log-dialog" role="dialog" aria-modal="true" aria-label={view.title || tr('Diagnostic log')}>
        <div className="model-tuning-log-heading">
          <div><strong>{view.title || tr('Diagnostic log')}</strong><span>{view.run_id || runId || '—'}</span></div>
          <button type="button" className="secondary-action compact" onClick={onClose}>{tr('Close')}</button>
        </div>
        {loading ? <div className="backtest-loading-row">{tr('Loading diagnostic log…')}</div> : null}
        {error ? <div className="global-inline-message error-inline">{error}</div> : null}
        {view.open ? (
          <>
            <div className="model-tuning-log-meta">
              <span>{tr('Status')} <strong>{tr(view.status || 'unknown')}</strong></span>
              {view.candidate_id != null ? <span>{tr('Candidate')} <strong>#{view.candidate_id}</strong></span> : null}
              {view.job_id ? <span>Job <strong>{view.job_id}</strong></span> : null}
              {view.failure_type ? <span>{tr('Failure')} <strong>{view.failure_type}</strong></span> : null}
            </div>
            <pre className="model-tuning-log-pre">{view.log_text || tr('No diagnostic lines were recorded.')}</pre>
            <div className="model-tuning-log-actions">
              <button type="button" onClick={onCopy}>{tr('Copy log')}</button>
              <button type="button" className="secondary-action" onClick={onDownload}>{tr('Download .txt')}</button>
            </div>
          </>
        ) : null}
      </div>
    </div>
  )
}
