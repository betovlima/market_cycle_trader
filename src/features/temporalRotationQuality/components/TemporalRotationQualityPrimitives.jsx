import { tr } from '../../../i18n/runtime'
import { money, number, percent } from '../../../shared/formatters'

export function EvidenceBadge({ passed }) {
  if (passed === null || passed === undefined) return null
  return <span className={`rotation-quality-badge ${passed ? 'pass' : 'fail'}`}>{tr(passed ? 'PASS' : 'FAIL')}</span>
}

export function NumericField({ label, value, onChange, disabled, min = undefined, max = undefined, step = 'any' }) {
  return (
    <label className="rotation-quality-field">
      <span>{tr(label)}</span>
      <input type="number" value={value} min={min} max={max} step={step} disabled={disabled} onChange={(event) => onChange(event.target.value)} />
    </label>
  )
}

export function Metric({ label, value, tone = '' }) {
  return <div className={`rotation-quality-metric ${tone}`}><span>{tr(label)}</span><strong>{value}</strong></div>
}

export function WorkflowStep({ label, state, tone = '' }) {
  return (
    <div className={`rotation-quality-workflow-step ${tone}`}>
      <span>{tr(label)}</span>
      <strong>{tr(state || '—')}</strong>
    </div>
  )
}

export function ResearchResult({ research }) {
  const best = research?.best_candidate
  const control = research?.control
  if (!best || !control) return null
  return (
    <div className="rotation-quality-result-grid">
      <Metric label="Control capital" value={money(control.replayed_ending_capital)} />
      <Metric label="Best candidate" value={best.candidate_id || '—'} />
      <Metric label="Candidate capital" value={money(best.ending_capital)} tone={Number(best.capital_lift_vs_control) >= 0 ? 'positive' : 'negative'} />
      <Metric label="Capital lift" value={percent(best.capital_lift_vs_control, 2)} tone={Number(best.capital_lift_vs_control) >= 0 ? 'positive' : 'negative'} />
      <Metric label="Sharpe" value={number(best.sharpe, 4)} />
      <Metric label="Max Drawdown" value={percent(best.max_drawdown, 2)} />
      <Metric label="Robust candidates" value={number(research.robust_candidate_count, 0)} />
      <Metric label="Research folds" value={number(research.source_fold_count, 0)} />
      <Metric label="Switches" value={number(best.switch_count, 0)} />
      {best.challenger_quality_floor == null ? null : <Metric label="Challenger quality floor" value={number(best.challenger_quality_floor, 4)} />}
      {best.strong_challenger_overrides == null ? null : <Metric label="Strong challenger overrides" value={number(best.strong_challenger_overrides, 0)} />}
    </div>
  )
}

export function EvidenceResult({ validation }) {
  if (!validation?.control || !Array.isArray(validation?.candidates)) return null
  return (
    <div className="rotation-quality-evidence-result">
      <div className="rotation-quality-result-grid">
        <Metric label="Control capital" value={money(validation.control.ending_capital)} />
        <Metric label="Passing candidates" value={number(validation.passing_candidate_count, 0)} />
        <Metric label="Folds" value={number(validation.fold_count, 0)} />
        <Metric label="Required fold wins" value={number(validation.validation_policy?.required_fold_wins ?? validation.required_fold_wins, 0)} />
      </div>
      <div className="rotation-quality-table-shell">
        <table className="rotation-quality-table">
          <thead><tr><th>{tr('Candidate')}</th><th>{tr('Capital')}</th><th>{tr('Lift')}</th><th>{tr('Sharpe')}</th><th>{tr('Max Drawdown')}</th><th>{tr('Fold wins')}</th><th>{tr('Result')}</th></tr></thead>
          <tbody>
            {validation.candidates.map((candidate) => (
              <tr key={candidate.candidate_id}>
                <td><strong>{candidate.candidate_id}</strong></td>
                <td>{money(candidate.ending_capital)}</td>
                <td className={Number(candidate.capital_lift_vs_control) >= 0 ? 'positive' : 'negative'}>{percent(candidate.capital_lift_vs_control, 2)}</td>
                <td>{number(candidate.sharpe, 4)}</td>
                <td>{percent(candidate.max_drawdown, 2)}</td>
                <td>{candidate.folds_beating_control}/{candidate.fold_count}</td>
                <td><EvidenceBadge passed={candidate.validation_pass} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

export function DiagnosticResult({ diagnostic }) {
  if (!diagnostic || String(diagnostic.status || '').toLowerCase() !== 'completed') return null
  const rows = Array.isArray(diagnostic.top_feature_separation) ? diagnostic.top_feature_separation : []
  const folds = Array.isArray(diagnostic.fold_summary) ? diagnostic.fold_summary : []
  return (
    <div className="rotation-quality-diagnostic-result">
      <div className="rotation-quality-result-grid">
        <Metric label="Blocked rotations" value={number(diagnostic.blocked_rotations, 0)} />
        <Metric label="Helpful blocks" value={number(diagnostic.helpful_blocks, 0)} tone="positive" />
        <Metric label="Harmful blocks" value={number(diagnostic.harmful_blocks, 0)} tone="negative" />
        <Metric label="Neutral blocks" value={number(diagnostic.neutral_blocks, 0)} />
        <Metric label="Helpful rate" value={percent(diagnostic.helpful_rate_excluding_neutral, 2)} />
        <Metric label="Immediate net benefit" value={money(diagnostic.immediate_net_rotation_benefit_dollars)} tone={Number(diagnostic.immediate_net_rotation_benefit_dollars) >= 0 ? 'positive' : 'negative'} />
      </div>
      {folds.length ? <div className="rotation-quality-table-shell">
        <table className="rotation-quality-table">
          <thead><tr><th>{tr('Fold')}</th><th>{tr('Blocked')}</th><th>{tr('Helpful')}</th><th>{tr('Harmful')}</th><th>{tr('Neutral')}</th><th>{tr('Immediate net benefit')}</th></tr></thead>
          <tbody>{folds.map((item) => <tr key={item.fold_id}><td>{item.fold_id}</td><td>{item.blocked_rotations}</td><td>{item.helpful}</td><td>{item.harmful}</td><td>{item.neutral}</td><td className={Number(item.immediate_net_rotation_benefit_dollars) >= 0 ? 'positive' : 'negative'}>{money(item.immediate_net_rotation_benefit_dollars)}</td></tr>)}</tbody>
        </table>
      </div> : null}
      {rows.length ? <div className="rotation-quality-table-shell">
        <table className="rotation-quality-table diagnostic-features">
          <thead><tr><th>{tr('Feature')}</th><th>{tr('Metric')}</th><th>{tr('Helpful mean')}</th><th>{tr('Harmful mean')}</th><th>{tr('Std. separation')}</th><th>{tr('Helpful direction')}</th></tr></thead>
          <tbody>{rows.map((item) => <tr key={item.engineered_metric}><td>{item.feature}</td><td>{item.engineered_metric}</td><td>{number(item.helpful_mean, 5)}</td><td>{number(item.harmful_mean, 5)}</td><td>{number(item.standardized_separation, 4)}</td><td>{tr(item.helpful_direction)}</td></tr>)}</tbody>
        </table>
      </div> : null}
    </div>
  )
}
