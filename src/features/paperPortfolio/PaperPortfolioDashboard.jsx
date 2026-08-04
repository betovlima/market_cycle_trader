import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'

import { apiFetch } from '../../api/http'
import { API } from '../../config/env'
import { AccessLockIcon, ActivityIcon, ClockIcon, MarketOpenIcon, PortfolioIcon } from '../../shared/components/Icons'
import { compactDate, money, number, percent, shortDateTime } from '../../shared/formatters'

const POLL_MS = 60 * 60 * 1000
const ROBOT_POLL_MS = 30 * 1000


function countdownLabel(totalSeconds) {
  const safeSeconds = Math.max(0, Number(totalSeconds) || 0)
  const hours = Math.floor(safeSeconds / 3600)
  const minutes = Math.floor((safeSeconds % 3600) / 60)
  const seconds = safeSeconds % 60
  return [hours, minutes, seconds].map((value) => String(value).padStart(2, '0')).join(':')
}

function PortfolioRefreshClock({ refreshing, nextRefreshAt, now }) {
  const remaining = nextRefreshAt
    ? Math.max(0, Math.ceil((nextRefreshAt - now) / 1000))
    : 0
  const progress = nextRefreshAt
    ? Math.max(0, Math.min(1, remaining / (POLL_MS / 1000)))
    : 0
  const label = nextRefreshAt ? countdownLabel(remaining) : '00:00:00'
  const scheduledLabel = nextRefreshAt
    ? new Date(nextRefreshAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    : ''

  return (
    <div className={`portfolio-refresh-clock ${refreshing ? 'refreshing' : ''}`} aria-live="polite">
      <div
        className="portfolio-refresh-dial"
        style={{ '--portfolio-refresh-progress': `${progress * 360}deg` }}
        aria-hidden="true"
      >
        {refreshing ? <span className="portfolio-refresh-spinner" /> : <span>{label}</span>}
      </div>
      <div className="portfolio-refresh-copy">
        <span>Portfolio update</span>
        <strong>{refreshing ? 'Updating now' : label}</strong>
        <small>{refreshing ? 'Requesting the latest snapshot' : scheduledLabel ? `Automatic at ${scheduledLabel}` : 'Scheduling next update'}</small>
      </div>
    </div>
  )
}

function PaperMarketStatus({ connection, marketClock, refreshing }) {
  const firstCheckPending = refreshing && !connection.checkedAt
  const status = firstCheckPending ? 'checking' : connection.status
  const isReady = status === 'ready'
  const marketLabel = marketClock ? (marketClock.is_open ? 'Market open' : 'Market closed') : 'Market status pending'
  const checkedLabel = connection.checkedAt
    ? `Checked ${connection.checkedAt.toLocaleTimeString()}`
    : 'Waiting for the first successful check'

  const title = isReady
    ? 'Alpaca Paper connected'
    : status === 'checking'
      ? 'Checking Alpaca Paper'
      : 'Alpaca Paper unavailable'

  const detail = isReady
    ? 'The Paper account responded successfully and the Portfolio data is available.'
    : status === 'checking'
      ? 'Validating the Paper account and requesting the latest portfolio snapshot.'
      : 'The last connection attempt failed. Use Refresh after checking the API or Alpaca credentials.'

  return (
    <section className={`paper-market-status ${status}`} aria-live="polite">
      <div className="paper-market-status-icon"><ActivityIcon size={24} /></div>
      <div className="paper-market-status-copy">
        <span className="panel-kicker">Paper Market status</span>
        <strong>{title}</strong>
        <p>{detail}</p>
      </div>
      <div className="paper-market-status-meta">
        <span className={`connection-pill ${isReady ? 'ready' : status === 'checking' ? 'checking' : 'unavailable'}`}>
          <span className="connection-dot" />
          {isReady ? 'Connected' : status === 'checking' ? 'Checking' : 'Unavailable'}
        </span>
        <span className="paper-market-clock"><ClockIcon size={15} />{marketLabel}</span>
        <small>{checkedLabel}</small>
      </div>
    </section>
  )
}

function TradingRobotStatus({ robot }) {
  const enabled = Boolean(robot?.enabled)
  const schedulerAlive = Boolean(robot?.scheduler_alive)
  const blocked = robot?.status === 'blocked'
  const visual = blocked || (enabled && !schedulerAlive) ? 'unavailable' : enabled ? 'ready' : 'checking'
  const title = blocked
    ? 'Paper robot requires review'
    : enabled && schedulerAlive
      ? 'Paper robot active for every session'
      : enabled
        ? 'Paper robot enabled, scheduler unavailable'
        : 'Paper robot stopped'
  const detail = enabled
    ? 'The continuous controller will prepare and evaluate every regular Alpaca market session until an administrator stops it.'
    : 'No recurring Paper automation is enabled. Use the protected API documentation to start it.'
  const phase = String(robot?.active_run?.phase || robot?.phase || 'stopped').replaceAll('_', ' ')
  const nextOpen = robot?.next_market_open
    ? new Date(robot.next_market_open).toLocaleString()
    : 'No session scheduled'
  const lastTick = robot?.last_scheduler_tick_at
    ? new Date(robot.last_scheduler_tick_at).toLocaleTimeString()
    : 'No heartbeat'

  return (
    <section className={`paper-market-status robot-status ${visual}`} aria-live="polite">
      <div className="paper-market-status-icon"><ActivityIcon size={24} /></div>
      <div className="paper-market-status-copy">
        <span className="panel-kicker">Trading robot</span>
        <strong>{title}</strong>
        <p>{detail}</p>
      </div>
      <div className="paper-market-status-meta">
        <span className={`connection-pill ${enabled && schedulerAlive && !blocked ? 'ready' : blocked || (enabled && !schedulerAlive) ? 'unavailable' : 'checking'}`}>
          <span className="connection-dot" />
          {blocked ? 'Review required' : enabled && schedulerAlive ? 'Active' : enabled ? 'Degraded' : 'Stopped'}
        </span>
        <span className="paper-market-clock"><ClockIcon size={15} />{phase}</span>
        <small>Next open: {nextOpen} · Heartbeat: {lastTick}</small>
      </div>
    </section>
  )
}

function marketTimeLabel(value) {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return date.toLocaleString([], {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function MarketStatusMetric({ marketClock }) {
  const hasClock = Boolean(marketClock)
  const isOpen = hasClock && Boolean(marketClock.is_open)
  const state = !hasClock ? 'pending' : isOpen ? 'open' : 'closed'
  const value = state === 'open' ? 'Open' : state === 'closed' ? 'Closed' : 'Checking'
  const sessionLabel = state === 'open' ? 'Market Open' : state === 'closed' ? 'Market Closed' : 'Market status pending'
  const scheduleValue = state === 'open' ? marketClock?.next_close : marketClock?.next_open
  const scheduleLabel = state === 'open' ? 'Closes' : 'Next open'
  const schedule = marketTimeLabel(scheduleValue)

  return (
    <article className={`portfolio-metric market-status-metric ${state}`} aria-live="polite">
      <div className="market-status-metric-icon">
        {state === 'open' ? <MarketOpenIcon size={25} /> : state === 'closed' ? <AccessLockIcon size={25} /> : <ClockIcon size={25} />}
      </div>
      <div className="market-status-metric-copy">
        <span>Market Status</span>
        <strong>{value}</strong>
        <small>{sessionLabel}{schedule ? <em>{scheduleLabel}: {schedule}</em> : null}</small>
      </div>
    </article>
  )
}

function PortfolioMetric({ label, value, note, tone = '' }) {
  return <article className={`portfolio-metric ${tone}`}><span>{label}</span><strong>{value}</strong><small>{note}</small></article>
}

export function PaperPortfolioDashboard() {
  const [data, setData] = useState(null)
  const [error, setError] = useState('')
  const [refreshing, setRefreshing] = useState(false)
  const [lastUpdated, setLastUpdated] = useState(null)
  const [connection, setConnection] = useState({ status: 'checking', checkedAt: null })
  const [robot, setRobot] = useState(null)
  const [nextRefreshAt, setNextRefreshAt] = useState(null)
  const [clockNow, setClockNow] = useState(() => Date.now())
  const mountedRef = useRef(false)
  const portfolioTimerRef = useRef(null)
  const portfolioRequestRef = useRef(false)

  const loadRobotStatus = useCallback(async ({ silent = false } = {}) => {
    try {
      const response = await apiFetch(`${API}/paper-market/public-robot-status`)
      if (mountedRef.current) setRobot(response)
    } catch {
      if (mountedRef.current) {
        setRobot((current) => current ? { ...current, scheduler_alive: false, status: 'unavailable' } : { enabled: false, scheduler_alive: false, status: 'unavailable' })
      }
    }
  }, [])

  const loadPortfolio = useCallback(async ({ silent = false } = {}) => {
    if (portfolioRequestRef.current) return
    portfolioRequestRef.current = true
    if (mountedRef.current) setRefreshing(true)
    try {
      const response = await apiFetch(`${API}/paper-market/public-portfolio`)
      if (!mountedRef.current) return
      const checkedAt = new Date()
      setData(response)
      setError('')
      setLastUpdated(checkedAt)
      setConnection({ status: response?.status === 'ready' ? 'ready' : 'unavailable', checkedAt })
    } catch (requestError) {
      if (!mountedRef.current) return
      setConnection({ status: 'unavailable', checkedAt: new Date() })
      if (!silent) setError(requestError.message)
    } finally {
      portfolioRequestRef.current = false
      if (mountedRef.current) setRefreshing(false)
    }
  }, [])

  const scheduleNextPortfolioRefresh = useCallback(function scheduleNextPortfolioRefresh() {
    if (!mountedRef.current) return
    if (portfolioTimerRef.current) window.clearTimeout(portfolioTimerRef.current)
    const nextAt = Date.now() + POLL_MS
    setNextRefreshAt(nextAt)
    portfolioTimerRef.current = window.setTimeout(async () => {
      if (!mountedRef.current) return
      setNextRefreshAt(null)
      await loadPortfolio({ silent: true })
      if (mountedRef.current) scheduleNextPortfolioRefresh()
    }, POLL_MS)
  }, [loadPortfolio])

  const refreshPortfolio = useCallback(async ({ silent = false, includeRobot = false } = {}) => {
    if (portfolioTimerRef.current) window.clearTimeout(portfolioTimerRef.current)
    if (mountedRef.current) setNextRefreshAt(null)
    const tasks = [loadPortfolio({ silent })]
    if (includeRobot) tasks.push(loadRobotStatus({ silent: true }))
    await Promise.all(tasks)
    if (mountedRef.current) scheduleNextPortfolioRefresh()
  }, [loadPortfolio, loadRobotStatus, scheduleNextPortfolioRefresh])

  useEffect(() => {
    mountedRef.current = true
    refreshPortfolio({ includeRobot: true })
    const robotTimer = window.setInterval(() => loadRobotStatus({ silent: true }), ROBOT_POLL_MS)
    const clockTimer = window.setInterval(() => setClockNow(Date.now()), 1000)
    return () => {
      mountedRef.current = false
      if (portfolioTimerRef.current) window.clearTimeout(portfolioTimerRef.current)
      window.clearInterval(robotTimer)
      window.clearInterval(clockTimer)
    }
  }, [loadRobotStatus, refreshPortfolio])

  const history = useMemo(() => (data?.history || []).map((item) => ({
    ...item,
    label: compactDate(item.recorded_at),
  })), [data])

  const position = data?.position
  const activePositions = position ? 1 : 0

  return (
    <section className="page-stack portfolio-page" aria-busy={refreshing}>
      <div className="page-heading-row">
        <div className="page-heading">
          <div className="page-title-icon"><PortfolioIcon size={20} /></div>
          <div><h2>Portfolio</h2><p>View the simulated account value, current position and recent orders.</p></div>
        </div>
        <div className="portfolio-heading-actions">
          <PortfolioRefreshClock refreshing={refreshing} nextRefreshAt={nextRefreshAt} now={clockNow} />
          <button type="button" className="secondary-action portfolio-refresh-button" disabled={refreshing} onClick={() => refreshPortfolio({ includeRobot: true })}>
            {refreshing ? <span className="portfolio-button-spinner" aria-hidden="true" /> : null}
            {refreshing ? 'Refreshing…' : 'Refresh'}
          </button>
        </div>
      </div>

      <PaperMarketStatus connection={connection} marketClock={data?.market_clock} refreshing={refreshing} />
      <TradingRobotStatus robot={robot} />

      {error ? <div className="inline-error"><strong>Portfolio unavailable</strong><span>{error}</span><button type="button" onClick={() => setError('')}>×</button></div> : null}

      {!data ? (
        <section className="data-panel portfolio-locked portfolio-tab-loader" role="status" aria-live="polite">
          <div className="portfolio-tab-loader-visual"><span className="loading-ring" aria-hidden="true" /></div>
          <h2>Loading simulated portfolio</h2>
          <p>Connecting to Alpaca Paper and requesting the latest read-only portfolio snapshot.</p>
        </section>
      ) : (
        <>
          <section className="portfolio-metrics-grid">
            <MarketStatusMetric marketClock={data.market_clock} />
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
                <div className="portfolio-monitor"><span>{data.market_clock?.is_open ? 'Market open' : 'Market closed'}</span><small>{lastUpdated ? `Updated ${lastUpdated.toLocaleTimeString()}` : 'Read-only snapshot'}</small></div>
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
                  {data.recent_orders?.length ? data.recent_orders.map((order, index) => (
                    <tr key={`${order.created_at || 'order'}-${order.symbol || 'asset'}-${index}`}>
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
