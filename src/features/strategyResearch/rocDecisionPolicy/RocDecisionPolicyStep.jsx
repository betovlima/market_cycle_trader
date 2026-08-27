import { useMemo } from 'react'

import { tr } from '../../../i18n/runtime'
import { money, number, percent } from '../../../shared/formatters'
import { RocCurveControl } from '../../../shared/components/RocCurveControl'
import './rocDecisionPolicy.css'

function finite(value) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

function signedPercent(value, digits = 2) {
  const parsed = finite(value)
  if (parsed == null) return '—'
  return `${parsed > 0 ? '+' : ''}${percent(parsed, digits)}`
}

function signedNumber(value, digits = 3) {
  const parsed = finite(value)
  if (parsed == null) return '—'
  return `${parsed > 0 ? '+' : ''}${number(parsed, digits)}`
}

function metricTone(value, higherIsBetter = true) {
  const parsed = finite(value)
  if (parsed == null || parsed === 0) return ''
  const favorable = higherIsBetter ? parsed > 0 : parsed < 0
  return favorable ? 'positive' : 'negative'
}

function Metric({ label, value, tone = '', note = '' }) {
  return <div className={`roc-policy-metric ${tone}`}>
    <span>{tr(label)}</span>
    <strong>{value}</strong>
    {note ? <small>{tr(note)}</small> : null}
  </div>
}

export function RocDecisionPolicyStep({ analysis }) {
  const curves = useMemo(() => (analysis?.fold_horizons || [])
    .filter((row) => row?.roc?.points?.length)
    .map((row) => ({
      id: `roc-policy-${row.fold_id}-${row.horizon}`,
      label: `${tr('Fold')} ${row.fold_id} · ${row.horizon}d`,
      periodLabel: `${tr('Fold')} ${row.fold_id}`,
      stabilityGroup: `horizon-${row.horizon}`,
      roc: row.roc,
    })), [analysis])

  if (!analysis?.id) return null
  const control = analysis.control || {}
  const challenger = analysis.challenger || {}
  const delta = analysis.comparison?.delta || {}
  const settings = analysis.settings_snapshot?.settings || {}
  const settingsRevision = analysis.settings_snapshot?.revision
  const parityStatus = String(analysis.control_parity?.status || '').toLowerCase()
  const rows = [...(analysis.fold_horizons || [])].sort((left, right) => (
    Number(left?.fold_id || 0) - Number(right?.fold_id || 0)
    || Number(left?.horizon || 0) - Number(right?.horizon || 0)
  ))

  return <div className="roc-policy-step">
    <div className="roc-policy-head">
      <div>
        <span className="panel-kicker">{tr('ROC DECISION POLICY')}</span>
        <h3>{tr('ROC Decision Policy')}</h3>
      </div>
      <div className="roc-policy-head-actions">
        <span className="roc-policy-dynamic-badge">{tr('Relative outperformance · dynamic thresholds')}</span>
        <RocCurveControl curves={curves} title="ROC Decision Policy" kicker="ROC DECISION POLICY" buttonLabel="ROC curves" />
      </div>
    </div>

    <div className="roc-policy-metrics">
      <Metric label="Temporal control" value={money(control.ending_capital)} />
      <Metric label="ROC challenger" value={money(challenger.ending_capital)} />
      <Metric label="Capital delta" value={signedPercent(delta.ending_capital_rate, 2)} tone={metricTone(delta.ending_capital_rate)} />
      <Metric label="CAGR delta" value={signedPercent(delta.cagr, 2)} tone={metricTone(delta.cagr)} />
      <Metric label="Sharpe delta" value={signedNumber(delta.sharpe, 3)} tone={metricTone(delta.sharpe)} />
      <Metric label="MaxDD delta" value={signedPercent(delta.max_drawdown, 2)} tone={metricTone(delta.max_drawdown)} />
      <Metric label="Control parity" value={parityStatus === 'pass' ? 'PASS' : '—'} tone={parityStatus === 'pass' ? 'positive' : ''} />
      <Metric label="ROC overrides" value={number(challenger.roc_override_count, 0)} />
      <Metric label="Temporal overrides" value={number(challenger.temporal_timing_override_count, 0)} />
      <Metric label="Switches" value={number(challenger.switch_count, 0)} />
    </div>

    <div className="roc-policy-context">
      <span><strong>{tr('Policy target')}:</strong> {tr('Challenger outperforms Temporal control net of rotation cost')}</span>
      <span><strong>{tr('Selection metric')}:</strong> {String(settings.selection_metric || '—').replaceAll('_', ' ')}</span>
      <span><strong>{tr('Settings revision')}:</strong> {settingsRevision ?? '—'}</span>
      <span><strong>{tr('Pair samples per session')}:</strong> {number(settings.max_pairs_per_timestamp, 0)}</span>
      <span><strong>{tr('Rotation cost hurdle')}:</strong> {percent(analysis.round_trip_cost_rate, 3)}</span>
      <span><strong>{tr('Threshold source')}:</strong> {tr('Chronological relative-pair calibration by fold')}</span>
      <span><strong>{tr('OOS threshold selection')}:</strong> {analysis.oos_used_for_threshold_selection ? tr('Yes') : tr('No')}</span>
    </div>

    <div className="roc-policy-table-wrap">
      <table className="roc-policy-table">
        <thead><tr>
          <th>{tr('Fold')}</th>
          <th>{tr('Horizon')}</th>
          <th>{tr('Selected threshold')}</th>
          <th>{tr('Calibration AUC')}</th>
          <th>{tr('OOS AUC')}</th>
          <th>{tr('Calibration score')}</th>
          <th>{tr('Calibration samples')}</th>
          <th>{tr('OOS samples')}</th>
        </tr></thead>
        <tbody>{rows.map((row) => <tr key={`${row.fold_id}-${row.horizon}`}>
          <td>{row.fold_id}</td>
          <td>{row.horizon}d</td>
          <td><strong>{number(row.selected_threshold, 3)}</strong></td>
          <td>{number(row.calibration_auc, 3)}</td>
          <td>{number(row.oos_auc, 3)}</td>
          <td>{number(row.selection_score, 3)}</td>
          <td>{number(row.calibration_samples, 0)}</td>
          <td>{number(row.oos_samples, 0)}</td>
        </tr>)}</tbody>
      </table>
    </div>

    <div className="roc-policy-footer-note">
      {tr('Each threshold is learned from relative challenger-versus-control pairs in chronological calibration, frozen for that fold and then evaluated out of sample. OOS data never selects the threshold.')}
    </div>
  </div>
}
