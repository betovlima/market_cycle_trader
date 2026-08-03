import { useCallback, useEffect, useMemo, useState } from 'react'
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'

import { apiFetch } from '../../api/http'
import { API } from '../../config/env'
import { PortfolioIcon } from '../../shared/components/Icons'
import { compactDate, money, number, percent, shortDateTime } from '../../shared/formatters'

const TOKEN_KEY = 'market-cycle-paper-market-token'
const POLL_MS = 60 * 60 * 1000

function nextWholeHourTimestamp(now = new Date()) {
  const next = new Date(now)
  next.setMinutes(60, 0, 0)
  return next.getTime()
}

function secondsUntil(timestamp) {
  return Math.max(0, Math.ceil((timestamp - Date.now()) / 1000))
}

function countdownLabel(totalSeconds) {
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60
  return [hours, minutes, seconds].map((value) => String(value).padStart(2, '0')).join(':')
}

function PortfolioMetric({ label, value, note, tone = '' }) {
  return <article className={`portfolio-metric ${tone}`}><span>{label}</span><strong>{value}</strong><small>{note}</small></article>
}

export function PaperPortfolioDashboard() {
  const [token, setToken] = useState(() => sessionStorage.getItem(TOKEN_KEY) || '')
  const [data, setData] = useState(null)
  const [error, setError] = useState('')
  const [refreshing, setRefreshing] = useState(false)
  const [lastUpdated, setLastUpdated] = useState(null)
  const [nextQueryAt, setNextQueryAt] = useState(() => nextWholeHourTimestamp())
  const [countdownSeconds, setCountdownSeconds] = useState(() => secondsUntil(nextWholeHourTimestamp()))

  const loadPortfolio = useCallback(async ({ silent = false } = {}) => {
    const normalized = token.trim()
    if (!normalized) {
      setData(null)
      return
    }
    setRefreshing(true)
    try {
      const response = await apiFetch(`${API}/paper-market/portfolio`, {
        headers: { 'X-Paper-Market-Token': normalized },
      })
      sessionStorage.setItem(TOKEN_KEY, normalized)
      setData(response)
      setError('')
      setLastUpdated(new Date())
    } catch (requestError) {
      if (!silent) setError(requestError.message)
    } finally {
      setRefreshing(false)
    }
  }, [token])

  useEffect(() => {
    const normalized = token.trim()
    const scheduledAt = nextWholeHourTimestamp()
    setNextQueryAt(scheduledAt)
    setCountdownSeconds(secondsUntil(scheduledAt))
    if (!normalized) return undefined

    loadPortfolio()
    let hourlyTimer
    const firstTimer = window.setTimeout(() => {
      loadPortfolio({ silent: true })
      hourlyTimer = window.setInterval(() => loadPortfolio({ silent: true }), POLL_MS)
    }, Math.max(0, scheduledAt - Date.now()))

    return () => {
      window.clearTimeout(firstTimer)
      if (hourlyTimer) window.clearInterval(hourlyTimer)
    }
  }, [loadPortfolio, token])

  useEffect(() => {
    const timer = window.setInterval(() => {
      const remaining = secondsUntil(nextQueryAt)
      if (remaining <= 0) {
        const next = nextWholeHourTimestamp()
        setNextQueryAt(next)
        setCountdownSeconds(secondsUntil(next))
      } else {
        setCountdownSeconds(remaining)
      }
    }, 1000)
    return () => window.clearInterval(timer)
  }, [nextQueryAt])

  const history = useMemo(() => (data?.history || []).map((item) => ({
    ...item,
    label: compactDate(item.recorded_at),
  })), [data])

  const position = data?.position
  const activePositions = position ? 1 : 0

  return (
    <section className="page-stack portfolio-page">
      <div className="page-heading-row">
        <div className="page-heading">
          <div className="page-title-icon"><PortfolioIcon size={20} /></div>
          <div><h2>Portfolio</h2><p>View the simulated account value, current position and recent orders.</p></div>
        </div>
        <div className="portfolio-connect">
          <input type="password" value={token} onChange={(event) => setToken(event.target.value)} placeholder="Paper Market API token" aria-label="Paper Market API token" />
          <button type="button" className="secondary-action" disabled={!token.trim() || refreshing} onClick={() => loadPortfolio()}>{refreshing ? 'Refreshing…' : data ? 'Refresh' : 'Connect'}</button>
        </div>
      </div>

      {error ? <div className="inline-error"><strong>Portfolio unavailable</strong><span>{error}</span><button type="button" onClick={() => setError('')}>×</button></div> : null}

      {!data ? (
        <section className="data-panel portfolio-locked"><PortfolioIcon size={32} /><h2>Connect the simulated portfolio</h2><p>Enter the server token to load the isolated paper account.</p></section>
      ) : (
        <>
          <section className="portfolio-metrics-grid">
            <PortfolioMetric label="Total Capital" value={money(data.initial_capital)} note="Simulated starting capital" tone="blue" />
            <PortfolioMetric label="Total Return" value={percent(data.total_return)} note={money(data.total_pnl)} tone={Number(data.total_return) >= 0 ? 'green' : 'red'} />
            <PortfolioMetric label="Current Value" value={money(data.portfolio_value)} note={lastUpdated ? `Updated ${lastUpdated.toLocaleTimeString()}` : 'Current valuation'} tone="blue" />
            <PortfolioMetric label="Cash Balance" value={money(data.strategy_cash)} note="Available cash" tone="purple" />
            <PortfolioMetric label="Active Positions" value={String(activePositions)} note={position ? position.symbol : 'Portfolio is in cash'} tone="gold" />
          </section>

          <section className="portfolio-content-grid">
            <article className="data-panel chart-card">
              <div className="panel-heading">
                <div><span className="panel-kicker">Performance</span><h2>Portfolio Value</h2></div>
                <div className="portfolio-monitor"><span>{data.market_clock?.is_open ? 'Market open' : 'Market closed'}</span><small>Next query {countdownLabel(countdownSeconds)}</small></div>
              </div>
              <div className="performance-chart portfolio-chart">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={history} margin={{ top: 10, right: 16, left: 8, bottom: 8 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} />
                    <XAxis dataKey="label" minTickGap={32} />
                    <YAxis domain={['auto', 'auto']} tickFormatter={(value) => `$${Number(value).toLocaleString('en-US', { maximumFractionDigits: 0 })}`} />
                    <Tooltip formatter={(value) => money(value)} labelFormatter={(_, payload) => payload?.[0]?.payload?.recorded_at || ''} />
                    <Line type="monotone" dataKey="portfolio_value" name="Portfolio" dot={false} strokeWidth={2.5} stroke="var(--positive)" />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </article>

            <article className="data-panel holdings-card">
              <div className="panel-heading"><div><span className="panel-kicker">Allocation</span><h2>Current Holding</h2></div></div>
              {position ? (
                <dl className="holding-details">
                  <div><dt>Asset</dt><dd>{position.symbol}</dd></div>
                  <div><dt>Quantity</dt><dd>{number(position.quantity, 6)}</dd></div>
                  <div><dt>Average entry</dt><dd>{money(position.average_entry_price)}</dd></div>
                  <div><dt>Current price</dt><dd>{money(position.current_price)}</dd></div>
                  <div><dt>Market value</dt><dd>{money(position.market_value)}</dd></div>
                  <div><dt>Return</dt><dd className={Number(position.unrealized_return) >= 0 ? 'positive' : 'negative'}>{percent(position.unrealized_return)}</dd></div>
                </dl>
              ) : <div className="cash-state"><strong>{money(data.strategy_cash)}</strong><span>Cash</span><p>No open position.</p></div>}
            </article>
          </section>

          <section className="data-panel">
            <div className="panel-heading"><div><span className="panel-kicker">Activity</span><h2>Recent Paper Orders</h2></div><span className="panel-count">{data.recent_orders?.length || 0} records</span></div>
            <div className="table-wrap">
              <table className="dashboard-table">
                <thead><tr><th>Created</th><th>Asset</th><th>Side</th><th>Status</th><th>Quantity</th><th>Average Fill</th></tr></thead>
                <tbody>
                  {data.recent_orders?.length ? data.recent_orders.map((order) => (
                    <tr key={order.client_order_id}>
                      <td>{shortDateTime(order.created_at)}</td><td>{order.symbol || '—'}</td>
                      <td><span className={`order-side ${order.side}`}>{String(order.side || '—').toUpperCase()}</span></td>
                      <td>{order.status || '—'}</td><td>{order.filled_quantity ?? order.quantity ?? '—'}</td><td>{order.filled_average_price ? money(order.filled_average_price) : '—'}</td>
                    </tr>
                  )) : <tr><td colSpan="6" className="empty-cell">No paper orders have been submitted yet.</td></tr>}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}
    </section>
  )
}
