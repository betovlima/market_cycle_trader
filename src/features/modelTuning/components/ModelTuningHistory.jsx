import { tr } from '../../../i18n/runtime'
import { decimal, money, pct } from '../modelTuningUtils'

function when(value) {
  if (!value) return '—'
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return String(value)
  return parsed.toLocaleString()
}

function methodLabel(method) {
  if (method === 'latin_hypercube_then_caro') return tr('Latin Hypercube → Adaptive CARO (legacy)')
  return method === 'champion_probability' ? tr('Unified Adaptive CARO') : tr('Latin Hypercube')
}

export function ModelTuningHistory({ items, selectedRunId, loading, onOpen, onRefresh }) {
  return (
    <div className="model-tuning-history">
      <div className="model-tuning-results-heading">
        <div>
          <strong>{tr('Tuning history')}</strong>
          <span>{tr('Review completed and previous Model Tuning campaigns. Open any campaign to inspect its Candidate Ranking and promote a completed result back to Backtest.')}</span>
        </div>
        <button type="button" className="secondary-action compact" onClick={onRefresh} disabled={loading}>{tr('Refresh')}</button>
      </div>
      {items?.length ? (
        <div className="model-tuning-history-list">
          {items.map((item) => {
            const best = item.best_candidate || {}
            const metrics = best.metrics || {}
            const selected = item.id === selectedRunId
            return (
              <article key={item.id} className={`model-tuning-history-card ${selected ? 'selected' : ''}`}>
                <div className="model-tuning-history-main">
                  <div>
                    <strong title={item.strategy_profile_name || tr('Strategy')}>{item.strategy_profile_name || tr('Strategy')}</strong>
                    <span title={`${methodLabel(item.method)} · ${tr(item.status || 'unknown')} · ${when(item.finished_at || item.created_at)}`}>{methodLabel(item.method)} · {tr(item.status || 'unknown')} · {when(item.finished_at || item.created_at)}</span>
                    <small title={item.id}>{item.id}</small>
                  </div>
                  <div className="model-tuning-history-best">
                    <span>{tr('Best candidate')}</span>
                    <strong>{item.best_candidate_id === null || item.best_candidate_id === undefined ? '—' : `#${item.best_candidate_id}`}</strong>
                  </div>
                </div>
                <div className="model-tuning-history-metrics">
                  <div><span>{tr('Capital')}</span><strong>{money(metrics.ending_capital)}</strong></div>
                  <div><span>{tr('CAGR')}</span><strong>{pct(metrics.cagr)}</strong></div>
                  <div><span>{tr('Sharpe')}</span><strong>{decimal(metrics.sharpe)}</strong></div>
                  <div><span>{tr('Max DD')}</span><strong>{pct(metrics.maximum_drawdown)}</strong></div>
                  <div><span>{tr('Worst fold')}</span><strong>{pct(metrics.worst_fold_return)}</strong></div>
                </div>
                <div className="model-tuning-history-footer">
                  <span>
                    {tr('Completed')} {item.completed_candidates || 0}/{item.total_candidates || 0}
                    {item.adoption_history?.length ? ` · ${tr('Promotions')} ${item.adoption_history.length}` : ''}
                  </span>
                  <button type="button" onClick={() => onOpen(item.id)} disabled={loading}>{selected ? tr('Viewing') : tr('Open campaign')}</button>
                </div>
              </article>
            )
          })}
        </div>
      ) : <div className="model-tuning-empty-baseline">{tr('No historical Model Tuning campaigns were found.')}</div>}
    </div>
  )
}
