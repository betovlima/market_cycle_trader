import { tr } from '../../../i18n/runtime'
import { number, percent } from '../utils/formatters'

function foldLabel(values) {
  if (!Array.isArray(values) || !values.length) return '—'
  return values.map((value) => `F${value}`).join(', ')
}

export function OptimizationSearch({ optimization }) {
  if (!optimization) return null
  const validation = optimization.validation || {}
  const calibration = optimization.selected_calibration || {}
  const validationPassed = validation.status === 'passed'
  const selected = optimization.selection_status === 'selected'
  const top = Array.isArray(optimization.top_candidates) ? optimization.top_candidates.slice(0, 6) : []

  return <section className="milp-optimization">
    <div className="milp-section-heading">
      <div>
        <strong>{tr('MILP policy optimization')}</strong>
        <span>{tr('Configuration search uses calibration folds only; the latest fold is reserved as holdout validation.')}</span>
      </div>
      <b className={selected ? 'positive' : ''}>{tr(selected ? 'Candidate selected' : 'No robust candidate')}</b>
    </div>

    <div className="milp-optimization-kpis">
      <div><span>{tr('Configurations evaluated')}</span><strong>{number(optimization.candidate_count, 0)}</strong></div>
      <div><span>{tr('Robust configurations')}</span><strong>{number(optimization.passed_candidate_count, 0)}</strong></div>
      <div><span>{tr('Calibration folds')}</span><strong>{foldLabel(optimization.calibration_fold_ids)}</strong></div>
      <div><span>{tr('Holdout fold')}</span><strong>{optimization.validation_fold_id ? `F${optimization.validation_fold_id}` : '—'}</strong></div>
    </div>

    {selected ? <div className="milp-optimization-selected">
      <div className="milp-optimization-selected-head">
        <div><span>{tr('Selected configuration')}</span><strong>{optimization.selected_candidate_id || '—'}</strong></div>
        <div><span>{tr('Robust score')}</span><strong>{number(optimization.selected_score, 3)}</strong></div>
      </div>
      <div className="milp-optimization-metrics">
        <div><span>{tr('Mean capital delta')}</span><strong className={Number(calibration.mean_capital_delta) >= 0 ? 'positive' : 'negative'}>{percent(calibration.mean_capital_delta, 2)}</strong></div>
        <div><span>{tr('Worst fold delta')}</span><strong className={Number(calibration.worst_fold_capital_delta) >= 0 ? 'positive' : 'negative'}>{percent(calibration.worst_fold_capital_delta, 2)}</strong></div>
        <div><span>{tr('2 bps mean delta')}</span><strong className={Number(calibration.mean_cost_stress_delta) >= 0 ? 'positive' : 'negative'}>{percent(calibration.mean_cost_stress_delta, 2)}</strong></div>
        <div><span>{tr('Decision change rate')}</span><strong>{percent(calibration.decision_change_rate, 2)}</strong></div>
      </div>
    </div> : null}

    {validation.fold_id ? <div className={`milp-holdout ${validationPassed ? 'passed' : 'failed'}`}>
      <div className="milp-holdout-head">
        <div><strong>{tr('Holdout validation')}</strong><span>{tr('This fold was not used to select the MILP configuration.')}</span></div>
        <b>{tr(validationPassed ? 'Passed' : 'Failed')}</b>
      </div>
      <div className="milp-holdout-grid">
        <div><span>{tr('Capital delta')}</span><strong>{percent(validation.capital_delta, 2)}</strong></div>
        <div><span>{tr('2 bps delta')}</span><strong>{percent(validation.cost_stress_delta, 2)}</strong></div>
        <div><span>{tr('Sharpe delta')}</span><strong>{number(validation.sharpe_delta, 3)}</strong></div>
        <div><span>{tr('MaxDD delta')}</span><strong>{percent(validation.drawdown_delta, 2)}</strong></div>
        <div><span>{tr('Different decisions')}</span><strong>{number(validation.different_decisions, 0)}</strong></div>
      </div>
    </div> : null}

    {top.length ? <section>
      <div className="milp-section-heading"><div><strong>{tr('Top calibration candidates')}</strong><span>{tr('Ranked without using the holdout fold.')}</span></div></div>
      <div className="milp-search-candidates">{top.map((candidate) => <div key={candidate.candidate_id} className={candidate.candidate_id === optimization.selected_candidate_id ? 'selected' : ''}>
        <strong>{candidate.candidate_id}</strong>
        <span>{tr('Score')} {number(candidate.robust_score, 2)}</span>
        <small>{tr('Mean')} {percent(candidate.calibration?.mean_capital_delta, 1)} · {tr('Worst')} {percent(candidate.calibration?.worst_fold_capital_delta, 1)}</small>
      </div>)}</div>
    </section> : null}
  </section>
}
