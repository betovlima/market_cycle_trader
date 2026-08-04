import { useEffect, useState } from 'react'
import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'

import { apiFetch } from '../../../api/http'
import { API } from '../../../config/env'
import { BacktestIcon, PlayIcon } from '../../../shared/components/Icons'
import { durationLabel, money, percent, shortDate, shortDateTime } from '../../../shared/formatters'
import { ExecutionStatus } from './ExecutionStatus'

function Metric({ label, value, note, tone = '' }) {
  return (
    <article className={`result-metric ${tone}`}>
      <span>{label}</span>
      <strong>{value}</strong>
      <small>{note}</small>
    </article>
  )
}

function StatusBadge({ status }) {
  return <span className={`table-status ${status || 'unknown'}`}>{String(status || 'unknown').replace('_', ' ')}</span>
}

function RotationPanel({ jobId }) {
  const [payload, setPayload] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    let active = true
    if (!jobId) {
      setPayload(null)
      setError('')
      return () => { active = false }
    }

    setLoading(true)
    setPayload(null)
    setError('')
    apiFetch(`${API}/analytics/backtests/${encodeURIComponent(jobId)}`)
      .then((value) => {
        if (active) setPayload(value)
      })
      .catch((requestError) => {
        if (active) {
          setPayload(null)
          setError(requestError.message || 'Unable to load capital rotations.')
        }
      })
      .finally(() => {
        if (active) setLoading(false)
      })

    return () => { active = false }
  }, [jobId])

  if (loading) {
    return <section className="data-panel loading-state">Loading capital rotations…</section>
  }

  if (error) {
    return <section className="data-panel rotation-error"><strong>Unable to load capital rotations</strong><span>{error}</span></section>
  }

  const summary = payload?.rotation_summary || {}
  const rotations = payload?.rotations || []

  return (
    <section className="rotation-section">
      <div className="rotation-metrics-grid">
        <Metric label="Capital Rotations" value={String(summary.total_rotations ?? 0)} note="Completed asset-to-asset switches" tone="blue" />
        <Metric label="Profitable Exits" value={String(summary.profitable_rotations ?? 0)} note={`${summary.losing_rotations ?? 0} losing · ${summary.flat_rotations ?? 0} flat`} tone="green" />
        <Metric label="Realized P/L" value={money(summary.total_realized_pnl)} note={`Fees ${money(summary.total_transaction_fees)}`} tone={Number(summary.total_realized_pnl || 0) >= 0 ? 'green' : 'red'} />
        <Metric label="Average Holding" value={summary.average_holding_days == null ? '—' : `${Number(summary.average_holding_days).toFixed(1)} days`} note={summary.last_rotation_at ? `Last ${shortDateTime(summary.last_rotation_at)}` : 'No rotation recorded'} tone="purple" />
      </div>

      <article className="data-panel">
        <div className="panel-heading">
          <div><span className="panel-kicker">Backtest analytics</span><h2>Capital Rotations</h2></div>
          <span className="panel-count">{rotations.length} records</span>
        </div>
        <p className="rotation-note">Execution results only. Private model parameters, scores and decision rules remain server-side.</p>
        <div className="table-wrap">
          <table className="dashboard-table rotation-table">
            <thead>
              <tr><th>Executed</th><th>From</th><th>To</th><th>Holding</th><th>Position Return</th><th>Realized P/L</th><th>Fees</th></tr>
            </thead>
            <tbody>
              {rotations.length ? rotations.map((item, index) => (
                <tr key={`${item.executed_at || 'rotation'}-${item.from_asset}-${item.to_asset}-${index}`}>
                  <td>{shortDateTime(item.executed_at)}</td>
                  <td><span className="rotation-asset from">{item.from_asset || 'CASH'}</span></td>
                  <td><span className="rotation-asset to">{item.to_asset || 'CASH'}</span></td>
                  <td>{item.holding_days == null ? '—' : `${Number(item.holding_days).toFixed(0)} days`}</td>
                  <td className={item.position_return == null ? '' : Number(item.position_return) >= 0 ? 'positive' : 'negative'}>{percent(item.position_return)}</td>
                  <td className={item.realized_pnl == null ? '' : Number(item.realized_pnl) >= 0 ? 'positive' : 'negative'}>{money(item.realized_pnl)}</td>
                  <td>{money(item.transaction_fees)}</td>
                </tr>
              )) : <tr><td colSpan="7" className="empty-cell">No asset-to-asset rotations were recorded for this simulation.</td></tr>}
            </tbody>
          </table>
        </div>
      </article>
    </section>
  )
}

export function BacktestPage({ workspace }) {
  const { dashboard, detail, loadingDetail, running, restoringExecution, startingBacktest, startDisabled, runBacktest } = workspace
  const metrics = detail?.metrics || {}
  const chartRows = (detail?.series || []).map((row) => ({
    ...row,
    label: shortDate(row.timestamp),
  }))
  const historyColumnCount = 7

  return (
    <section className="page-stack">
      <div className="page-heading-row">
        <div className="page-heading">
          <div className="page-title-icon"><BacktestIcon size={20} /></div>
          <div><h2>Backtest</h2><p>Execute and analyze protected historical simulations.</p></div>
        </div>
        <button type="button" className="primary-action compact" onClick={runBacktest} disabled={startDisabled}>
          <PlayIcon /> {restoringExecution ? 'Checking Execution' : startingBacktest ? 'Starting…' : running ? 'Simulation Running' : 'Start New Backtest'}
        </button>
      </div>

      <ExecutionStatus workspace={workspace} />

      {loadingDetail ? <section className="data-panel loading-state">Loading simulation result…</section> : null}

      {detail?.metrics ? (
        <>
          <section className="result-metrics-grid">
            <Metric label="Final Capital" value={money(metrics.ending_capital)} note={`Initial ${money(metrics.starting_capital)}`} tone="green" />
            <Metric label="Reference Capital" value={money(metrics.reference_ending_capital)} note={`${percent(metrics.reference_return)} total return`} tone="blue" />
            <Metric label="CAGR" value={percent(metrics.cagr)} note={`Reference ${percent(metrics.reference_cagr)}`} tone="purple" />
            <Metric label="Sharpe Ratio" value={metrics.sharpe == null ? '—' : Number(metrics.sharpe).toFixed(3)} note={`Reference ${metrics.reference_sharpe == null ? '—' : Number(metrics.reference_sharpe).toFixed(3)}`} tone="green" />
            <Metric label="Max Drawdown" value={percent(metrics.maximum_drawdown)} note={`Reference ${percent(metrics.reference_maximum_drawdown)}`} tone="red" />
            <Metric label="Session Win Rate" value={percent(metrics.session_win_rate)} note={`${percent(metrics.market_exposure)} market exposure`} tone="blue" />
          </section>

          <section className="backtest-content-grid">
            <article className="data-panel chart-card">
              <div className="panel-heading"><div><span className="panel-kicker">Performance</span><h2>Simulation Comparison</h2></div></div>
              <div className="performance-chart">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={chartRows} margin={{ top: 10, right: 16, left: 8, bottom: 8 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} />
                    <XAxis dataKey="label" minTickGap={38} />
                    <YAxis tickFormatter={(value) => `$${Number(value).toLocaleString('en-US', { maximumFractionDigits: 0 })}`} />
                    <Tooltip formatter={(value) => money(value)} labelFormatter={(_, payload) => payload?.[0]?.payload?.timestamp || ''} />
                    <Legend />
                    <Line type="monotone" dataKey="simulation_equity" name="Simulation" dot={false} strokeWidth={2.4} stroke="var(--positive)" />
                    <Line type="monotone" dataKey="reference_equity" name="Reference" dot={false} strokeWidth={2.2} stroke="var(--accent)" />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </article>

            <article className="data-panel result-table-card">
              <div className="panel-heading"><div><span className="panel-kicker">Summary</span><h2>Backtest Results</h2></div></div>
              <dl className="result-comparison-list">
                <div><dt>Total return</dt><dd>{percent(metrics.simulation_return)}</dd><dd>{percent(metrics.reference_return)}</dd></div>
                <div><dt>CAGR</dt><dd>{percent(metrics.cagr)}</dd><dd>{percent(metrics.reference_cagr)}</dd></div>
                <div><dt>Sharpe ratio</dt><dd>{metrics.sharpe == null ? '—' : Number(metrics.sharpe).toFixed(3)}</dd><dd>{metrics.reference_sharpe == null ? '—' : Number(metrics.reference_sharpe).toFixed(3)}</dd></div>
                <div><dt>Max drawdown</dt><dd>{percent(metrics.maximum_drawdown)}</dd><dd>{percent(metrics.reference_maximum_drawdown)}</dd></div>
                <div><dt>Capital rotations</dt><dd>{metrics.position_changes == null ? '—' : Math.round(metrics.position_changes)}</dd><dd>—</dd></div>
                <div><dt>Avg. holding</dt><dd>{metrics.average_holding_days == null ? '—' : `${Number(metrics.average_holding_days).toFixed(1)} days`}</dd><dd>—</dd></div>
              </dl>
              <div className="result-columns-label"><span>Metric</span><span>Simulation</span><span>Reference</span></div>
            </article>
          </section>

          <RotationPanel jobId={detail.id} />
        </>
      ) : (
        <section className="data-panel empty-result">
          <BacktestIcon size={32} />
          <h2>No completed result selected</h2>
          <p>Start a new backtest or open a completed execution from the history below.</p>
        </section>
      )}

      <section className="data-panel">
        <div className="panel-heading"><div><span className="panel-kicker">History</span><h2>Backtest History</h2></div></div>
        <div className="table-wrap">
          <table className="dashboard-table">
            <thead><tr><th>Date</th><th>Status</th><th>Total Return</th><th>Sharpe Ratio</th><th>Max Drawdown</th><th>Rotations</th><th>Duration</th></tr></thead>
            <tbody>
              {dashboard?.recent_backtests?.length ? dashboard.recent_backtests.map((item) => (
                <tr key={item.id} className={detail?.id === item.id ? 'selected-row' : ''}>
                  <td>{shortDateTime(item.created_at)}</td>
                  <td><StatusBadge status={item.status} /></td>
                  <td className={item.metrics?.simulation_return == null ? '' : Number(item.metrics.simulation_return) >= 0 ? 'positive' : 'negative'}>{percent(item.metrics?.simulation_return)}</td>
                  <td>{item.metrics?.sharpe == null ? '—' : Number(item.metrics.sharpe).toFixed(3)}</td>
                  <td className="negative">{percent(item.metrics?.maximum_drawdown)}</td>
                  <td>{item.metrics?.position_changes == null ? '—' : Math.round(item.metrics.position_changes)}</td>
                  <td>{durationLabel(item.duration_seconds)}</td>
                </tr>
              )) : <tr><td colSpan={historyColumnCount} className="empty-cell">No backtest history is available.</td></tr>}
            </tbody>
          </table>
        </div>
      </section>
    </section>
  )
}
