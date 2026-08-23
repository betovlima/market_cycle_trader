import { useMemo, useState } from 'react'
import { createPortal } from 'react-dom'

import { tr } from '../../i18n/runtime'
import { number, percent } from '../../shared/formatters'
import './alternativeAction.css'

const ACTIONS = ['ROTATE', 'HOLD', 'CASH']

function tone(action) {
  if (action === 'HOLD') return 'hold'
  if (action === 'CASH') return 'cash'
  return 'rotate'
}

function Metric({ label, value, className = '' }) {
  return <div className="alternative-action-metric"><span>{tr(label)}</span><strong className={className}>{value}</strong></div>
}

function actionCounts(summary) {
  const counts = summary?.best_action_counts || {}
  return ACTIONS.map((action) => ({ action, count: Number(counts[action] || 0) }))
}

function AlertDialog({ row, onClose }) {
  if (!row || typeof document === 'undefined') return null
  return createPortal(<div className="alternative-action-dialog-backdrop" onMouseDown={onClose} role="presentation">
    <section className="alternative-action-dialog" role="dialog" aria-modal="true" onMouseDown={(event) => event.stopPropagation()}>
      <header><div><span className="panel-kicker">{tr('RISK-AWARE ALTERNATIVE ACTION')}</span><h3>{row.from_asset} → {row.to_asset}</h3></div><button type="button" onClick={onClose} aria-label={tr('Close')}>×</button></header>
      <div className="alternative-action-dialog-grid">
        <Metric label="Execution date" value={String(row.execution_at || '—').replace('T', ' ').slice(0, 16)} />
        <Metric label="Risk score" value={number(row.risk_score, 3)} />
        <Metric label="Risk margin" value={`${Number(row.risk_margin) >= 0 ? '+' : ''}${number(row.risk_margin, 3)}`} />
        <Metric label="Realized rotation value added" value={percent(row.rotation_value_added, 2)} className={Number(row.rotation_value_added) < 0 ? 'negative' : 'positive'} />
      </div>
      <div className="alternative-action-horizon-cards">{[1,3,5,10].map((horizon) => <article key={horizon}>
        <header><strong>{horizon}d</strong><span className={`alternative-action-pill ${tone(row[`best_action_${horizon}d`])}`}>{tr(row[`best_action_${horizon}d`] || 'Unavailable')}</span></header>
        <Metric label="ROTATE" value={percent(row[`rotate_return_${horizon}d`], 2)} />
        <Metric label="HOLD" value={percent(row[`hold_return_${horizon}d`], 2)} />
        <Metric label="CASH" value={percent(row[`cash_return_${horizon}d`], 2)} />
        <Metric label="Best edge vs ROTATE" value={percent(row[`best_edge_vs_rotate_${horizon}d`], 2)} />
      </article>)}</div>
      <p className="alternative-action-disclaimer">{tr('These are post-hoc counterfactual labels. They describe what would have worked after the alert; they are not yet an executable policy.')}</p>
    </section>
  </div>, document.body)
}

export function AlternativeActionPanel({ analysis }) {
  const [selected, setSelected] = useState(null)
  const horizons = analysis?.horizons || []
  const alerts = analysis?.alerts || []
  const harmful = analysis?.summary?.harmful_primary_horizon || {}
  const severe = analysis?.summary?.severe_primary_horizon || {}
  const topHarmful = useMemo(() => [...alerts].filter((row) => Number(row.rotation_value_added) < 0).sort((a, b) => Number(a.rotation_value_added) - Number(b.rotation_value_added)).slice(0, 8), [alerts])

  if (!analysis || String(analysis.status || '').toLowerCase() !== 'completed') return null

  return <section className="alternative-action-panel">
    <div className="alternative-action-heading">
      <div><span className="panel-kicker">{tr('COUNTERFACTUAL ACTION RESEARCH')}</span><h4>{tr('ROTATE vs HOLD vs CASH')}</h4></div>
      <span className="alternative-action-badge">{tr('Research only')}</span>
    </div>
    <div className="alternative-action-summary">
      <Metric label="Risk alerts analyzed" value={number(analysis?.summary?.alerts, 0)} />
      <Metric label="Harmful alerted rotations" value={number(analysis?.summary?.harmful_alerts, 0)} />
      <Metric label="Severe alerted rotations" value={number(analysis?.summary?.severe_alerts, 0)} />
      <Metric label="Policy ready" value={analysis?.readiness?.policy_ready ? tr('Yes') : tr('No')} className={analysis?.readiness?.policy_ready ? 'positive' : 'negative'} />
    </div>

    <div className="alternative-action-matrix-card">
      <div className="alternative-action-section-heading"><strong>{tr('Best post-hoc action by horizon')}</strong><span>{tr('Only transitions that the existing OOS risk detector actually alerted are included.')}</span></div>
      <div className="alternative-action-matrix">
        <div className="alternative-action-matrix-head"><span>{tr('Horizon')}</span>{ACTIONS.map((action) => <strong key={action}>{tr(action)}</strong>)}<strong>{tr('Oracle edge vs ROTATE')}</strong></div>
        {horizons.map((row) => <div className="alternative-action-matrix-row" key={row.horizon}><strong>{row.horizon}d</strong>{actionCounts(row).map(({ action, count }) => <span key={action} className={tone(action)}>{count}</span>)}<span>{percent(row.average_oracle_edge_vs_rotate, 2)}</span></div>)}
      </div>
    </div>

    <div className="alternative-action-context-grid">
      <article><div className="alternative-action-section-heading"><strong>{tr('Harmful alerts · 5d')}</strong><span>{tr('Cases where the alerted rotation later destroyed value versus the incumbent.')}</span></div><div className="alternative-action-choice-strip">{actionCounts(harmful).map(({action,count}) => <span className={tone(action)} key={action}><small>{tr(action)}</small><strong>{count}</strong></span>)}</div><Metric label="Average oracle edge vs ROTATE" value={percent(harmful.average_oracle_edge_vs_rotate, 2)} /></article>
      <article><div className="alternative-action-section-heading"><strong>{tr('Severe alerts · 5d')}</strong><span>{tr('Most economically damaging alerted transitions.')}</span></div><div className="alternative-action-choice-strip">{actionCounts(severe).map(({action,count}) => <span className={tone(action)} key={action}><small>{tr(action)}</small><strong>{count}</strong></span>)}</div><Metric label="Average oracle edge vs ROTATE" value={percent(severe.average_oracle_edge_vs_rotate, 2)} /></article>
    </div>

    <div className="alternative-action-matrix-card">
      <div className="alternative-action-section-heading"><strong>{tr('Most harmful alerted rotations')}</strong><span>{tr('Click a transition to compare ROTATE, HOLD and CASH over 1d, 3d, 5d and 10d.')}</span></div>
      <div className="alternative-action-alert-grid">{topHarmful.map((row) => <button type="button" key={row.transition_key} onClick={() => setSelected(row)}>
        <header><strong>{row.from_asset} → {row.to_asset}</strong><span>{String(row.execution_at || '').slice(0,10)}</span></header>
        <div><span>{tr('Realized value added')}</span><strong className="negative">{percent(row.rotation_value_added, 2)}</strong></div>
        <div><span>{tr('Best action · 5d')}</span><strong className={tone(row.best_action_5d)}>{tr(row.best_action_5d || 'Unavailable')}</strong></div>
        <div><span>{tr('Edge vs ROTATE')}</span><strong>{percent(row.best_edge_vs_rotate_5d, 2)}</strong></div>
      </button>)}</div>
    </div>

    <p className="alternative-action-disclaimer">{tr('CASH is modeled as zero market return in this first diagnostic. Transaction costs and re-entry costs are intentionally not applied yet and must be included before policy research.')}</p>
    <AlertDialog row={selected} onClose={() => setSelected(null)} />
  </section>
}
