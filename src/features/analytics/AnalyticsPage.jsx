import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'

import { ApiError, apiFetch } from '../../api/http'
import { API } from '../../config/env'
import { ActivityIcon, AnalyticsIcon, PortfolioIcon } from '../../shared/components/Icons'
import { money, number, percent, shortDate, shortDateTime } from '../../shared/formatters'

function AnalyticsMetric({ label, value, note, tone = '' }) {
  return <article className={`analytics-metric ${tone}`}><span>{label}</span><strong>{value}</strong><small>{note}</small></article>
}

function Panel({ kicker, title, children, action = null, className = '' }) {
  return <section className={`data-panel analytics-panel ${className}`}>
    <div className="panel-heading"><div><span className="panel-kicker">{kicker}</span><h2>{title}</h2></div>{action}</div>
    {children}
  </section>
}

function tone(value) {
  if (value == null || Number.isNaN(Number(value))) return ''
  return Number(value) >= 0 ? 'positive' : 'negative'
}

function ChartEmpty({ children = 'Not enough observations for this chart.' }) {
  return <div className="analytics-empty">{children}</div>
}

function BacktestAnalytics({ dashboard }) {
  const recentCompleted = useMemo(() => (dashboard?.recent_backtests || []).filter((item) => item.status === 'completed'), [dashboard])
  const [jobs, setJobs] = useState([])
  const [jobId, setJobId] = useState('')
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    let active = true
    apiFetch(`${API}/analytics/backtests?limit=200`)
      .then((payload) => { if (active) setJobs(payload.items || []) })
      .catch(() => {})
    return () => { active = false }
  }, [])

  const completed = jobs.length ? jobs : recentCompleted

  useEffect(() => {
    if (!jobId && completed.length) setJobId(completed[0].id)
  }, [completed, jobId])

  useEffect(() => {
    if (!jobId) return
    let active = true
    setLoading(true)
    setError('')
    apiFetch(`${API}/analytics/backtests/${encodeURIComponent(jobId)}`)
      .then((payload) => { if (active) setData(payload) })
      .catch((requestError) => { if (active) setError(requestError.message || 'Unable to load backtest analytics.') })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [jobId])

  const metrics = data?.metrics || {}
  const rotation = data?.rotation_summary || {}
  const consistency = data?.consistency || {}

  return <div className="analytics-stack">
    <div className="analytics-toolbar">
      <label><span>Completed backtest</span><select value={jobId} onChange={(event) => setJobId(event.target.value)}>
        {completed.length ? completed.map((item) => { const recent = recentCompleted.find((candidate) => candidate.id === item.id); return <option key={item.id} value={item.id}>{shortDateTime(item.created_at)}{recent?.metrics?.simulation_return == null ? '' : ` · ${percent(recent.metrics.simulation_return)}`}</option> }) : <option value="">No completed backtest</option>}
      </select></label>
      <span className="analytics-scope-badge">Viewer-safe · strategy-neutral</span>
    </div>

    {error ? <div className="global-inline-message error-inline">{error}</div> : null}
    {loading ? <div className="analytics-loading"><span className="loading-ring" />Loading analytics…</div> : null}
    {!loading && data ? <>
      <section className="analytics-metric-grid">
        <AnalyticsMetric label="Simulation return" value={percent(metrics.simulation_return)} note={`Reference ${percent(metrics.reference_return)}`} tone={tone(metrics.simulation_return)} />
        <AnalyticsMetric label="Excess return" value={percent((metrics.simulation_return ?? 0) - (metrics.reference_return ?? 0))} note="Simulation minus reference" tone={tone((metrics.simulation_return ?? 0) - (metrics.reference_return ?? 0))} />
        <AnalyticsMetric label="Maximum drawdown" value={percent(metrics.maximum_drawdown)} note={`Reference ${percent(metrics.reference_maximum_drawdown)}`} tone="negative" />
        <AnalyticsMetric label="Sharpe ratio" value={number(metrics.sharpe, 3)} note={`Reference ${number(metrics.reference_sharpe, 3)}`} />
        <AnalyticsMetric label="Capital rotations" value={String(rotation.total_rotations ?? 0)} note={`${rotation.profitable_rotations ?? 0} profitable`} />
        <AnalyticsMetric label="Realized P/L" value={money(rotation.total_realized_pnl)} note={`Fees ${money(rotation.total_transaction_fees)}`} tone={tone(rotation.total_realized_pnl)} />
        <AnalyticsMetric label="Positive months" value={percent(consistency.positive_month_rate)} note={`${consistency.positive_months ?? 0} of ${consistency.months ?? 0}`} />
        <AnalyticsMetric label="Average holding" value={rotation.average_holding_days == null ? '—' : `${number(rotation.average_holding_days, 1)} days`} note="Closed positions" />
      </section>

      <div className="analytics-two-column">
        <Panel kicker="CAPITAL CURVE" title="Simulation versus reference">
          {data.equity?.length ? <div className="analytics-chart"><ResponsiveContainer width="100%" height="100%"><LineChart data={data.equity}><CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="timestamp" tickFormatter={shortDate} minTickGap={38} /><YAxis tickFormatter={(value) => `$${Math.round(value / 1000)}k`} /><Tooltip labelFormatter={shortDateTime} formatter={(value) => money(value)} /><Legend /><Line type="monotone" dataKey="simulation_equity" name="Simulation" dot={false} strokeWidth={2} stroke="var(--positive)" /><Line type="monotone" dataKey="reference_equity" name="Reference" dot={false} strokeWidth={2} stroke="var(--accent)" /></LineChart></ResponsiveContainer></div> : <ChartEmpty />}
        </Panel>
        <Panel kicker="RISK" title="Drawdown through time">
          {data.equity?.length ? <div className="analytics-chart"><ResponsiveContainer width="100%" height="100%"><LineChart data={data.equity}><CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="timestamp" tickFormatter={shortDate} minTickGap={38} /><YAxis tickFormatter={(value) => `${Math.round(value * 100)}%`} /><Tooltip labelFormatter={shortDateTime} formatter={(value) => percent(value)} /><Line type="monotone" dataKey="drawdown" name="Drawdown" dot={false} strokeWidth={2} stroke="var(--negative)" /></LineChart></ResponsiveContainer></div> : <ChartEmpty />}
        </Panel>
      </div>

      <Panel kicker="CONSISTENCY" title="Monthly returns">
        {data.monthly_returns?.length ? <div className="analytics-chart analytics-chart-wide"><ResponsiveContainer width="100%" height="100%"><BarChart data={data.monthly_returns}><CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="month" /><YAxis tickFormatter={(value) => `${Math.round(value * 100)}%`} /><Tooltip formatter={(value) => percent(value)} /><Legend /><Bar dataKey="simulation_return" name="Simulation" fill="var(--positive)" /><Bar dataKey="reference_return" name="Reference" fill="var(--accent)" /></BarChart></ResponsiveContainer></div> : <ChartEmpty />}
      </Panel>

      <div className="analytics-two-column">
        <Panel kicker="ATTRIBUTION" title="Realized result by asset">
          <div className="table-wrap"><table className="dashboard-table analytics-table"><thead><tr><th>Asset</th><th>Positions</th><th>Win rate</th><th>Realized P/L</th><th>Avg. return</th><th>Fees</th></tr></thead><tbody>{data.asset_attribution?.length ? data.asset_attribution.map((item) => <tr key={item.asset}><td><strong>{item.asset}</strong></td><td>{item.closed_positions}</td><td>{percent(item.win_rate)}</td><td className={tone(item.total_realized_pnl)}>{money(item.total_realized_pnl)}</td><td className={tone(item.average_position_return)}>{percent(item.average_position_return)}</td><td>{money(item.transaction_fees)}</td></tr>) : <tr><td colSpan="6" className="empty-cell">No closed positions.</td></tr>}</tbody></table></div>
        </Panel>
        <Panel kicker="ROTATION QUALITY" title="Origin → destination matrix">
          <div className="table-wrap"><table className="dashboard-table analytics-table"><thead><tr><th>Transition</th><th>Rotations</th><th>Win rate</th><th>Realized P/L</th><th>Avg. return</th><th>Fees</th></tr></thead><tbody>{data.transition_matrix?.length ? data.transition_matrix.map((item) => <tr key={`${item.from_asset}-${item.to_asset}`}><td><strong>{item.from_asset} → {item.to_asset}</strong></td><td>{item.rotations}</td><td>{percent(item.win_rate)}</td><td className={tone(item.total_realized_pnl)}>{money(item.total_realized_pnl)}</td><td className={tone(item.average_position_return)}>{percent(item.average_position_return)}</td><td>{money(item.transaction_fees)}</td></tr>) : <tr><td colSpan="6" className="empty-cell">No rotations available.</td></tr>}</tbody></table></div>
        </Panel>
      </div>

      <div className="analytics-two-column">
        <Panel kicker="HOLDING PERIOD" title="Performance by position duration">
          <div className="table-wrap"><table className="dashboard-table analytics-table"><thead><tr><th>Duration</th><th>Positions</th><th>Win rate</th><th>Avg. return</th><th>Realized P/L</th></tr></thead><tbody>{data.holding_buckets?.map((item) => <tr key={item.bucket}><td><strong>{item.bucket}</strong></td><td>{item.positions}</td><td>{percent(item.win_rate)}</td><td className={tone(item.average_position_return)}>{percent(item.average_position_return)}</td><td className={tone(item.total_realized_pnl)}>{money(item.total_realized_pnl)}</td></tr>)}</tbody></table></div>
        </Panel>
        <Panel kicker="ROBUSTNESS" title="Dependence on the best positions">
          <dl className="analytics-definition-list">
            <div><dt>Total realized P/L</dt><dd className={tone(data.trade_dependency?.total_realized_pnl)}>{money(data.trade_dependency?.total_realized_pnl)}</dd></div>
            <div><dt>Without best position</dt><dd className={tone(data.trade_dependency?.without_best_position_pnl)}>{money(data.trade_dependency?.without_best_position_pnl)}</dd></div>
            <div><dt>Without top 3</dt><dd className={tone(data.trade_dependency?.without_top_three_pnl)}>{money(data.trade_dependency?.without_top_three_pnl)}</dd></div>
            <div><dt>Without top 5</dt><dd className={tone(data.trade_dependency?.without_top_five_pnl)}>{money(data.trade_dependency?.without_top_five_pnl)}</dd></div>
            <div><dt>Top 5 share of positive P/L</dt><dd>{percent(data.trade_dependency?.top_five_profit_share)}</dd></div>
          </dl>
        </Panel>
      </div>

      <Panel kicker="DRAWDOWN ANATOMY" title="Largest drawdown episodes">
        <div className="table-wrap"><table className="dashboard-table analytics-table"><thead><tr><th>Started</th><th>Trough</th><th>Recovered</th><th>Depth</th><th>Duration</th></tr></thead><tbody>{data.drawdown_episodes?.length ? data.drawdown_episodes.map((item, index) => <tr key={`${item.started_at}-${index}`}><td>{shortDateTime(item.started_at)}</td><td>{shortDateTime(item.trough_at)}</td><td>{item.recovered_at ? shortDateTime(item.recovered_at) : 'Open'}</td><td className="negative">{percent(item.maximum_drawdown)}</td><td>{item.duration_days == null ? '—' : `${item.duration_days} days`}</td></tr>) : <tr><td colSpan="5" className="empty-cell">No drawdown episodes.</td></tr>}</tbody></table></div>
      </Panel>
    </> : null}
  </div>
}

function PortfolioAnalytics() {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try { setData(await apiFetch(`${API}/analytics/portfolio`)) }
    catch (requestError) { setError(requestError instanceof ApiError ? requestError.message : 'Unable to load portfolio analytics.') }
    finally { setLoading(false) }
  }, [])

  useEffect(() => { load() }, [load])
  const summary = data?.summary || {}
  const order = data?.order_analytics || {}

  return <div className="analytics-stack">
    <div className="analytics-toolbar"><span className={`connection-pill ${data?.connection?.status || 'unavailable'}`}>{data?.connection?.message || 'Checking Alpaca Paper…'}</span><button type="button" className="table-action" onClick={load} disabled={loading}>Refresh</button></div>
    {error ? <div className="global-inline-message error-inline">{error}</div> : null}
    {loading ? <div className="analytics-loading"><span className="loading-ring" />Loading portfolio analytics…</div> : null}
    {!loading && data ? <>
      <section className="analytics-metric-grid">
        <AnalyticsMetric label="Portfolio value" value={money(summary.portfolio_value)} note={`Cash ${money(summary.strategy_cash)}`} />
        <AnalyticsMetric label="Total return" value={percent(summary.total_return)} note={`P/L ${money(summary.total_pnl)}`} tone={tone(summary.total_return)} />
        <AnalyticsMetric label="Market exposure" value={percent(summary.market_exposure)} note={`Market value ${money(summary.market_value)}`} />
        <AnalyticsMetric label="Current drawdown" value={percent(summary.current_drawdown)} note={`Maximum ${percent(summary.maximum_drawdown)}`} tone="negative" />
        <AnalyticsMetric label="1-day return" value={percent(summary.return_1_day)} note="Based on stored snapshots" tone={tone(summary.return_1_day)} />
        <AnalyticsMetric label="7-day return" value={percent(summary.return_7_days)} note="Based on stored snapshots" tone={tone(summary.return_7_days)} />
        <AnalyticsMetric label="30-day return" value={percent(summary.return_30_days)} note="Based on stored snapshots" tone={tone(summary.return_30_days)} />
        <AnalyticsMetric label="Order fill rate" value={percent(order.fill_rate)} note={`${order.filled_orders ?? 0} filled of ${order.total_orders ?? 0}`} />
      </section>

      <div className="analytics-two-column">
        <Panel kicker="PAPER EQUITY" title="Portfolio value history">
          {data.history?.length ? <div className="analytics-chart"><ResponsiveContainer width="100%" height="100%"><LineChart data={data.history}><CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="recorded_at" tickFormatter={shortDate} minTickGap={38} /><YAxis tickFormatter={(value) => `$${Math.round(value / 1000)}k`} /><Tooltip labelFormatter={shortDateTime} formatter={(value) => money(value)} /><Line type="monotone" dataKey="portfolio_value" name="Portfolio value" dot={false} strokeWidth={2} stroke="var(--accent)" /></LineChart></ResponsiveContainer></div> : <ChartEmpty>No portfolio snapshots stored yet.</ChartEmpty>}
        </Panel>
        <Panel kicker="PAPER RISK" title="Portfolio drawdown">
          {data.history?.length ? <div className="analytics-chart"><ResponsiveContainer width="100%" height="100%"><LineChart data={data.history}><CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="recorded_at" tickFormatter={shortDate} minTickGap={38} /><YAxis tickFormatter={(value) => `${Math.round(value * 100)}%`} /><Tooltip labelFormatter={shortDateTime} formatter={(value) => percent(value)} /><Line type="monotone" dataKey="drawdown" name="Drawdown" dot={false} strokeWidth={2} stroke="var(--negative)" /></LineChart></ResponsiveContainer></div> : <ChartEmpty />}
        </Panel>
      </div>

      <div className="analytics-two-column">
        <Panel kicker="EXECUTION QUALITY" title="Order statistics"><dl className="analytics-definition-list"><div><dt>Total orders</dt><dd>{order.total_orders ?? 0}</dd></div><div><dt>Filled</dt><dd>{order.filled_orders ?? 0}</dd></div><div><dt>Rejected</dt><dd>{order.rejected_orders ?? 0}</dd></div><div><dt>Rejection rate</dt><dd>{percent(order.rejection_rate)}</dd></div><div><dt>Average fill delay</dt><dd>{order.average_fill_delay_seconds == null ? '—' : `${number(order.average_fill_delay_seconds, 1)} sec`}</dd></div></dl></Panel>
        <Panel kicker="CURRENT POSITION" title="Paper account state"><dl className="analytics-definition-list"><div><dt>Symbol</dt><dd>{data.current?.position?.symbol || 'Cash'}</dd></div><div><dt>Quantity</dt><dd>{number(data.current?.position?.quantity, 4)}</dd></div><div><dt>Average entry</dt><dd>{money(data.current?.position?.average_entry_price)}</dd></div><div><dt>Current price</dt><dd>{money(data.current?.position?.current_price)}</dd></div><div><dt>Unrealized P/L</dt><dd className={tone(summary.unrealized_pnl)}>{money(summary.unrealized_pnl)}</dd></div></dl></Panel>
      </div>

      <Panel kicker="RECENT EXECUTIONS" title="Paper orders">
        <div className="table-wrap"><table className="dashboard-table analytics-table"><thead><tr><th>Time</th><th>Symbol</th><th>Side</th><th>Status</th><th>Quantity</th><th>Average fill</th></tr></thead><tbody>{data.orders?.length ? data.orders.map((item, index) => <tr key={`${item.created_at}-${item.symbol}-${index}`}><td>{shortDateTime(item.created_at || item.submitted_at)}</td><td><strong>{item.symbol}</strong></td><td>{item.side}</td><td><span className={`table-status ${item.status}`}>{item.status}</span></td><td>{number(item.filled_quantity ?? item.quantity, 4)}</td><td>{money(item.filled_average_price)}</td></tr>) : <tr><td colSpan="6" className="empty-cell">No paper orders recorded.</td></tr>}</tbody></table></div>
      </Panel>
    </> : null}
  </div>
}

export function AnalyticsPage({ session, dashboard }) {
  const canViewPortfolio = ['admin', 'trader'].includes(session.role)
  const [section, setSection] = useState('backtest')

  useEffect(() => { if (!canViewPortfolio && section === 'portfolio') setSection('backtest') }, [canViewPortfolio, section])

  return <section className="page-stack analytics-page">
    <div className="page-heading-row"><div className="page-heading"><div className="page-title-icon"><AnalyticsIcon size={21} /></div><div><h2>Analytics</h2><p>Explain performance, risk, consistency and execution without exposing the strategy.</p></div></div></div>
    <div className="analytics-tabs">
      <button type="button" className={section === 'backtest' ? 'active' : ''} onClick={() => setSection('backtest')}><ActivityIcon size={17} />Backtest Analytics</button>
      {canViewPortfolio ? <button type="button" className={section === 'portfolio' ? 'active' : ''} onClick={() => setSection('portfolio')}><PortfolioIcon size={17} />Portfolio Analytics</button> : null}
    </div>
    {section === 'backtest' ? <BacktestAnalytics dashboard={dashboard} /> : <PortfolioAnalytics />}
  </section>
}
