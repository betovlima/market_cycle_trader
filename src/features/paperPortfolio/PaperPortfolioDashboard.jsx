import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'

import { apiFetch } from '../../api/http'
import { API } from '../../config/env'
import { compactDate, money, number, percent } from '../../shared/formatters'

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

function formatCountdown(totalSeconds) {
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60
  return [hours, minutes, seconds].map((value) => String(value).padStart(2, '0')).join(':')
}

function statusText(data, loading) {
  if (loading) return 'Updating'
  if (!data) return 'Disconnected'
  if (data.next_session_run?.status) return data.next_session_run.status
  return data.status || 'Ready'
}

export function PaperPortfolioDashboard() {
  const [token, setToken] = useState(() => sessionStorage.getItem(TOKEN_KEY) || '')
  const [data, setData] = useState(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const [lastUpdated, setLastUpdated] = useState(null)
  const [nextQueryAt, setNextQueryAt] = useState(() => nextWholeHourTimestamp())
  const [countdownSeconds, setCountdownSeconds] = useState(() => secondsUntil(nextWholeHourTimestamp()))

  const loadPortfolio = useCallback(async ({ silent = false } = {}) => {
    const normalized = token.trim()
    if (!normalized) {
      setData(null)
      setRefreshing(false)
      return
    }

    setRefreshing(true)
    if (!silent) setLoading(true)

    try {
      const response = await apiFetch(`${API}/paper-market/portfolio`, {
        headers: { 'X-Paper-Market-Token': normalized },
      })
      sessionStorage.setItem(TOKEN_KEY, normalized)
      setData(response)
      setError('')
      setLastUpdated(new Date())
    } catch (requestError) {
      setError(requestError.message)
    } finally {
      if (!silent) setLoading(false)
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
    const firstDelay = Math.max(0, scheduledAt - Date.now())
    const firstHourlyTimer = window.setTimeout(() => {
      loadPortfolio({ silent: true })
      const followingHour = nextWholeHourTimestamp()
      setNextQueryAt(followingHour)
      setCountdownSeconds(secondsUntil(followingHour))

      hourlyTimer = window.setInterval(() => {
        loadPortfolio({ silent: true })
        const nextHour = nextWholeHourTimestamp()
        setNextQueryAt(nextHour)
        setCountdownSeconds(secondsUntil(nextHour))
      }, POLL_MS)
    }, firstDelay)

    return () => {
      window.clearTimeout(firstHourlyTimer)
      if (hourlyTimer) window.clearInterval(hourlyTimer)
    }
  }, [loadPortfolio, token])

  useEffect(() => {
    const updateCountdown = () => {
      const remaining = secondsUntil(nextQueryAt)
      if (remaining <= 0) {
        const nextHour = nextWholeHourTimestamp()
        setNextQueryAt(nextHour)
        setCountdownSeconds(secondsUntil(nextHour))
        return
      }
      setCountdownSeconds(remaining)
    }

    updateCountdown()
    const countdownTimer = window.setInterval(updateCountdown, 1000)
    return () => window.clearInterval(countdownTimer)
  }, [nextQueryAt])

  const history = useMemo(() => (data?.history || []).map((item) => ({
    ...item,
    label: compactDate(item.recorded_at),
  })), [data])

  const position = data?.position
  const run = data?.next_session_run
  const pnlClass = Number(data?.total_pnl || 0) >= 0 ? 'positive' : 'negative'
  const pollProgress = Math.max(0, Math.min(100, (countdownSeconds / Math.ceil(POLL_MS / 1000)) * 100))
  const pollCircleRadius = 46
  const pollCircleCircumference = 2 * Math.PI * pollCircleRadius
  const pollCircleOffset = pollCircleCircumference * (1 - (pollProgress / 100))

  return (
    <section className="portfolio-section" id="alpaca-paper-portfolio">
      <div className="section-heading portfolio-heading">
        <div>
          <div className="eyebrow">ALPACA PAPER</div>
          <h2>Portfolio evolution</h2>
          <p>Live strategy sleeve with automatic polling every hour and manual refresh at any time.</p>
        </div>
        <div className="portfolio-connection">
          <input
            type="password"
            value={token}
            onChange={(event) => setToken(event.target.value)}
            placeholder="Paper Market API token"
            aria-label="Paper Market API token"
          />
          <button className="button secondary" type="button" onClick={() => loadPortfolio()} disabled={!token.trim() || loading}>
            {loading ? 'Updating…' : 'Connect'}
          </button>
        </div>
      </div>

      {error && (
        <div className="error-banner">
          <strong>Portfolio</strong>
          <span>{error}</span>
          <button onClick={() => setError('')}>×</button>
        </div>
      )}

      {!data ? (
        <div className="portfolio-empty panel">
          Enter the Paper Market API token to follow the isolated US$10,000 strategy portfolio.
        </div>
      ) : (
        <>
          <div className="portfolio-status panel">
            <div>
              <span className={`status-dot ${run?.status || 'completed'}`} />
              <strong>{statusText(data, loading || refreshing)}</strong>
            </div>
            <span>{lastUpdated ? `Updated ${lastUpdated.toLocaleTimeString()}` : 'Waiting for update'}</span>
            <span>{data.market_clock?.is_open ? 'Market open' : 'Market closed'}</span>
          </div>

          <article className="panel polling-panel">
            <div className="polling-countdown" aria-label={`Next automatic query in ${formatCountdown(countdownSeconds)}`}>
              <svg className="polling-countdown-svg" viewBox="0 0 112 112" aria-hidden="true">
                <circle className="polling-countdown-track" cx="56" cy="56" r={pollCircleRadius} />
                <circle
                  className={`polling-countdown-value ${refreshing ? 'refreshing' : ''}`}
                  cx="56"
                  cy="56"
                  r={pollCircleRadius}
                  strokeDasharray={pollCircleCircumference}
                  strokeDashoffset={pollCircleOffset}
                />
              </svg>
              <div className="polling-countdown-time">
                <strong>{refreshing ? 'NOW' : formatCountdown(countdownSeconds)}</strong>
                <span>{refreshing ? 'Updating' : 'Next query'}</span>
              </div>
            </div>

            <div className="polling-panel-copy">
              <div>
                <strong>{refreshing ? 'Checking the portfolio now…' : 'Hourly portfolio monitoring'}</strong>
                <p>The next automatic query is shown inside the circular timer. Use the button to refresh the latest values at any moment.</p>
                <small>{lastUpdated ? `Last successful update: ${lastUpdated.toLocaleTimeString()}` : 'Waiting for the first successful update.'}</small>
              </div>
            </div>

            <button
              type="button"
              className="button secondary polling-refresh-button"
              onClick={() => loadPortfolio()}
              disabled={refreshing || !token.trim()}
            >
              {refreshing ? 'Refreshing…' : 'Refresh now'}
            </button>
          </article>

          <div className="metrics-grid portfolio-metrics">
            <article className="metric-card"><span>Portfolio value</span><strong>{money(data.portfolio_value)}</strong><small>Initial {money(data.initial_capital)}</small></article>
            <article className="metric-card"><span>Total return</span><strong className={pnlClass}>{percent(data.total_return)}</strong><small className={pnlClass}>{money(data.total_pnl)}</small></article>
            <article className="metric-card"><span>Strategy cash</span><strong>{money(data.strategy_cash)}</strong><small>Isolated from account buying power</small></article>
            <article className="metric-card"><span>Market value</span><strong>{money(data.market_value)}</strong><small>{position ? position.symbol : 'No open position'}</small></article>
            <article className="metric-card"><span>Realized P&amp;L</span><strong className={Number(data.realized_pnl) >= 0 ? 'positive' : 'negative'}>{money(data.realized_pnl)}</strong><small>Closed operations</small></article>
            <article className="metric-card"><span>Unrealized P&amp;L</span><strong className={Number(data.unrealized_pnl) >= 0 ? 'positive' : 'negative'}>{money(data.unrealized_pnl)}</strong><small>{position ? percent(position.unrealized_return) : 'No position'}</small></article>
          </div>

          <div className="portfolio-grid">
            <article className="panel portfolio-card">
              <h3>Current position</h3>
              {position ? (
                <dl className="portfolio-details">
                  <div><dt>Symbol</dt><dd>{position.symbol}</dd></div>
                  <div><dt>Quantity</dt><dd>{number(position.quantity, 6)}</dd></div>
                  <div><dt>Average entry</dt><dd>{money(position.average_entry_price)}</dd></div>
                  <div><dt>Current price</dt><dd>{money(position.current_price)}</dd></div>
                  <div><dt>Cost basis</dt><dd>{money(position.cost_basis)}</dd></div>
                  <div><dt>Holding sessions</dt><dd>{position.holding_sessions}</dd></div>
                </dl>
              ) : <p className="muted-copy">The strategy is currently in cash.</p>}
            </article>

            <article className="panel portfolio-card">
              <h3>Next-session process</h3>
              <dl className="portfolio-details">
                <div><dt>Status</dt><dd>{run?.status || 'Not armed'}</dd></div>
                <div><dt>Phase</dt><dd>{run?.phase || '—'}</dd></div>
                <div><dt>Decision</dt><dd>{run?.action ? `${run.action.toUpperCase()} ${run.target_asset || ''}` : '—'}</dd></div>
                <div><dt>Decision date</dt><dd>{run?.decision_date || '—'}</dd></div>
                <div><dt>Execution session</dt><dd>{run?.execution_session || '—'}</dd></div>
                <div><dt>Plan</dt><dd>{run?.plan_id || '—'}</dd></div>
              </dl>
            </article>
          </div>

          <article className="panel chart-panel portfolio-chart-panel">
            <h3>Portfolio value history</h3>
            <div className="chart portfolio-chart">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={history} margin={{ top: 12, right: 20, left: 8, bottom: 4 }}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="label" minTickGap={30} />
                  <YAxis domain={['auto', 'auto']} tickFormatter={(value) => `$${Number(value).toLocaleString('en-US', { maximumFractionDigits: 0 })}`} />
                  <Tooltip formatter={(value) => money(value)} labelFormatter={(_, payload) => payload?.[0]?.payload?.recorded_at || ''} />
                  <Line type="monotone" dataKey="portfolio_value" name="Portfolio" dot={false} strokeWidth={2} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </article>

          <article className="panel comparison-table-panel portfolio-orders">
            <div className="portfolio-table-heading"><h3>Recent paper orders</h3><span>{data.recent_orders?.length || 0} records</span></div>
            <div className="table-wrap">
              <table>
                <thead><tr><th>Created</th><th>Symbol</th><th>Side</th><th>Status</th><th>Quantity</th><th>Average fill</th><th>Client order ID</th></tr></thead>
                <tbody>
                  {(data.recent_orders || []).length ? data.recent_orders.map((order) => (
                    <tr key={order.client_order_id}>
                      <td>{order.created_at ? new Date(order.created_at).toLocaleString() : '—'}</td>
                      <td>{order.symbol || '—'}</td>
                      <td><span className={`trade-badge ${order.side}`}>{String(order.side || '—').toUpperCase()}</span></td>
                      <td>{order.status || '—'}</td>
                      <td>{order.filled_quantity ?? order.quantity ?? '—'}</td>
                      <td>{order.filled_average_price ? money(order.filled_average_price) : '—'}</td>
                      <td>{order.client_order_id}</td>
                    </tr>
                  )) : <tr><td className="empty-cell" colSpan="7">No paper orders have been submitted yet.</td></tr>}
                </tbody>
              </table>
            </div>
          </article>

          {run?.logs?.length ? <article className="panel logs-panel portfolio-run-logs"><div className="logs-panel-header"><strong>Market process log</strong><small>Latest {run.logs.length} messages</small></div><pre>{run.logs.join('\n')}</pre></article> : null}
        </>
      )}
    </section>
  )
}
