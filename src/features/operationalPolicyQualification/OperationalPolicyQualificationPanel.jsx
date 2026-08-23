import { tr } from '../../i18n/runtime'
import { money, number, percent } from '../../shared/formatters'
import './operationalPolicyQualification.css'

const ACTIONS = ['ROTATE', 'HOLD', 'CASH']

function tone(value) {
  return Number(value) > 0 ? 'positive' : Number(value) < 0 ? 'negative' : ''
}

function Metric({ label, value, className = '' }) {
  return <div className="operational-policy-metric"><span>{tr(label)}</span><strong className={className}>{value}</strong></div>
}

function gateValue(gate) {
  if (typeof gate?.observed === 'boolean') return gate.observed ? tr('Yes') : tr('No')
  if (gate?.observed == null) return '—'
  const name = String(gate?.name || '')
  if (name.includes('capital') || name.includes('sharpe') || name.includes('drawdown') || name.includes('month') || name.includes('utility')) return percent(gate.observed, 2)
  return number(gate.observed, 0)
}

export function OperationalPolicyQualificationPanel({ analysis }) {
  if (!analysis || String(analysis.status || '').toLowerCase() !== 'completed') return null
  const decision = String(analysis?.decision?.status || 'rejected').toLowerCase()
  const approved = decision === 'approved'
  const summary = analysis?.summary || {}
  const yearly = analysis?.yearly_oos || []
  const gates = analysis?.gates || []
  const actions = summary?.actions || {}

  return <section className="operational-policy-panel">
    <div className="operational-policy-heading">
      <div><span className="panel-kicker">{tr('FINAL SHADOW QUALIFICATION')}</span><h4>{tr('Operational Policy Qualification')}</h4></div>
      <span className={`operational-policy-decision ${approved ? 'approved' : 'rejected'}`}>{tr(approved ? 'APPROVED' : 'REJECTED')}</span>
    </div>

    <div className="operational-policy-decision-card">
      <div>
        <strong>{tr(approved ? 'Operational candidate passed all frozen gates.' : 'Operational candidate did not pass the frozen qualification gates.')}</strong>
        <span>{tr(approved ? 'The same policy can be activated in the next release without another research cycle.' : 'The original Strategy remains the operational decision. This selector research line is closed without changing the Strategy.')}</span>
      </div>
    </div>

    <div className="operational-policy-summary-grid">
      <Metric label="Control ending capital" value={money(summary.control_ending_capital)} />
      <Metric label="Candidate ending capital" value={money(summary.candidate_ending_capital)} className={tone(summary.ending_capital_delta_rate)} />
      <Metric label="Capital lift" value={percent(summary.ending_capital_delta_rate, 2)} className={tone(summary.ending_capital_delta_rate)} />
      <Metric label="Interventions" value={number(summary.interventions, 0)} />
      <Metric label="Positive OOS years" value={number(summary.positive_oos_years, 0)} />
      <Metric label="Mean intervention utility edge" value={percent(summary.mean_intervention_utility_edge_vs_rotate, 2)} className={tone(summary.mean_intervention_utility_edge_vs_rotate)} />
    </div>

    <div className="operational-policy-grid-two">
      <article className="operational-policy-card">
        <div className="operational-policy-section-heading"><strong>{tr('Policy actions')}</strong><span>{tr('ROTATE remains the default whenever HOLD or CASH confidence is below the frozen threshold.')}</span></div>
        <div className="operational-policy-action-strip">{ACTIONS.map((action) => <span key={action} className={action.toLowerCase()}><small>{tr(action)}</small><strong>{number(actions[action] || 0, 0)}</strong></span>)}</div>
      </article>
      <article className="operational-policy-card">
        <div className="operational-policy-section-heading"><strong>{tr('Risk comparison')}</strong><span>{tr('Candidate must improve capital without materially worsening Sharpe, drawdown or the worst month.')}</span></div>
        <div className="operational-policy-risk-grid">
          <Metric label="Control Sharpe" value={number(summary.control_sharpe, 3)} />
          <Metric label="Candidate Sharpe" value={number(summary.candidate_sharpe, 3)} />
          <Metric label="Control MaxDD" value={percent(summary.control_maximum_drawdown, 2)} />
          <Metric label="Candidate MaxDD" value={percent(summary.candidate_maximum_drawdown, 2)} />
        </div>
      </article>
    </div>

    <div className="operational-policy-card">
      <div className="operational-policy-section-heading"><strong>{tr('Frozen qualification gates')}</strong><span>{tr('These gates are evaluated as defined before the OOS replay. They are not retuned after the result.')}</span></div>
      <div className="operational-policy-gates">{gates.map((gate) => <div key={gate.name} className={gate.passed ? 'passed' : 'failed'}>
        <span className="operational-policy-gate-dot" aria-hidden="true" />
        <strong>{tr(String(gate.name || '').replaceAll('_', ' '))}</strong>
        <span>{gateValue(gate)}</span>
        <small>{tr('Requirement')}: {gate.requirement}</small>
      </div>)}</div>
    </div>

    <div className="operational-policy-card">
      <div className="operational-policy-section-heading"><strong>{tr('OOS year replay')}</strong><span>{tr('Each test year is predicted only with transitions available before that year.')}</span></div>
      <div className="operational-policy-year-grid">{yearly.map((row) => <article key={row.test_year}>
        <header><strong>{row.test_year}</strong><span className={tone(row.ending_capital_delta_rate)}>{percent(row.ending_capital_delta_rate, 2)}</span></header>
        <div><small>{tr('Transitions')}</small><strong>{number(row.transitions, 0)}</strong></div>
        <div><small>{tr('Interventions')}</small><strong>{number(row.interventions, 0)}</strong></div>
        <div><small>{tr('HOLD')}</small><strong>{number(row?.actions?.HOLD || 0, 0)}</strong></div>
        <div><small>{tr('CASH')}</small><strong>{number(row?.actions?.CASH || 0, 0)}</strong></div>
      </article>)}</div>
    </div>

    <p className="operational-policy-footnote">{tr('This is the final shadow qualification for this selector architecture. Approval activates this exact policy in the next release; rejection preserves the original Strategy instead of starting another tuning loop.')}</p>
  </section>
}
