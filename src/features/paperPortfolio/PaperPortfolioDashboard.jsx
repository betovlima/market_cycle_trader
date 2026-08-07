import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { CartesianGrid, ComposedChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'

import { apiFetch } from '../../api/http'
import { API } from '../../config/env'
import { ActivityIcon, PortfolioIcon } from '../../shared/components/Icons'
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

function timestampValue(value) {
  if (!value) return null
  const parsed = new Date(value).getTime()
  return Number.isFinite(parsed) ? parsed : null
}

function scheduleValue(targetAt, now, running = false) {
  if (running) return 'Running now'
  const target = timestampValue(targetAt)
  if (target === null) return 'Pending'
  const remaining = Math.max(0, Math.ceil((target - now) / 1000))
  return remaining === 0 ? 'Due now' : countdownLabel(remaining)
}

function TradingSessionStrip({ connection, marketClock, robot, now, refreshing, nextRefreshAt }) {
  const firstCheckPending = refreshing && !connection.checkedAt
  const connectionStatus = firstCheckPending ? 'checking' : connection.status
  const connectionReady = connectionStatus === 'ready'

  const enabled = Boolean(robot?.enabled)
  const schedulerAlive = Boolean(robot?.scheduler_alive)
  const blocked = robot?.status === 'blocked'
  const unavailable = robot?.status === 'unavailable'
  const robotLoaded = Boolean(robot)
  const robotReady = robotLoaded && enabled && schedulerAlive && !blocked && !unavailable
  const robotTone = robotReady ? 'ready' : blocked || unavailable || (enabled && !schedulerAlive) ? 'unavailable' : 'checking'
  const robotLabel = !robotLoaded ? 'Checking' : robotReady ? 'Active' : blocked ? 'Review' : enabled ? 'Degraded' : 'Stopped'

  const marketLoaded = Boolean(marketClock)
  const marketOpen = marketLoaded && Boolean(marketClock.is_open)
  const marketTone = !marketLoaded ? 'checking' : marketOpen ? 'ready' : 'closed'
  const marketLabel = !marketLoaded ? 'Market checking' : marketOpen ? 'Market open' : 'Market closed'

  const phaseRaw = String(robot?.active_run?.phase || robot?.phase || 'stopped')
  const phase = phaseRaw.replaceAll('_', ' ')
  const phaseLower = phaseRaw.toLowerCase()
  const analysisRunning = phaseLower.includes('training') || phaseLower.includes('refreshing_market_data') || phaseLower.includes('preparing_premarket_plan')
  const executionRunning = phaseLower.includes('submitting_alpaca_paper_orders') || phaseLower === 'executing'
  const analysisAt = robot?.next_premarket_analysis_at || robot?.active_run?.premarket_analysis_at
  const nextOpenAt = robot?.next_market_open || robot?.active_run?.expected_market_open
  const nextCloseAt = marketClock?.next_close
  const session = robot?.next_execution_session || 'No session scheduled'
  const checkedLabel = connection.checkedAt
    ? `Broker ${connection.checkedAt.toLocaleTimeString()}`
    : 'Broker check pending'

  const schedule = [
    { label: 'Analysis', value: scheduleValue(analysisAt, now, analysisRunning), tone: analysisRunning ? 'green' : 'blue' },
    { label: 'Execution', value: scheduleValue(nextOpenAt, now, executionRunning), tone: executionRunning ? 'green' : 'purple' },
    { label: 'Daily close', value: scheduleValue(nextCloseAt, now), tone: 'gold' },
    { label: 'Portfolio update', value: refreshing ? 'Running now' : scheduleValue(nextRefreshAt, now), tone: refreshing ? 'green' : 'cyan' },
  ]

  return (
    <div className="portfolio-session-strip" aria-label="Trading session status" aria-live="polite">
      <div className="portfolio-session-main">
        <div className="portfolio-session-title" title={`Robot phase: ${phase}. Next execution: ${session}. ${checkedLabel}.`}>
          <span className="portfolio-session-icon"><ActivityIcon size={16} /></span>
          <span>Trading Session</span>
        </div>
        <div className="trading-session-statuses portfolio-session-statuses">
          <span className={`session-status-chip ${connectionReady ? 'ready' : connectionStatus === 'checking' ? 'checking' : 'unavailable'}`}>
            <span className="connection-dot" />Alpaca {connectionReady ? 'Connected' : connectionStatus === 'checking' ? 'Checking' : 'Unavailable'}
          </span>
          <span className={`session-status-chip ${robotTone}`}><span className="connection-dot" />Robot {robotLabel}</span>
          <span className={`session-status-chip ${marketTone}`}><span className="connection-dot" />{marketLabel}</span>
        </div>
      </div>
      <div className="portfolio-session-schedule" aria-label={`Robot phase ${phase}. Next execution ${session}.`}>
        {schedule.map((item) => (
          <div key={item.label} className={`portfolio-session-step ${item.tone}`}>
            <span>{item.label}</span>
            <strong>{item.value}</strong>
          </div>
        ))}
      </div>
    </div>
  )
}

function PortfolioMetric({ label, value, detail, tone = '' }) {
  return (
    <div className={`portfolio-workspace-metric ${tone}`}>
      <span>{label}</span>
      <strong>{value}</strong>
      {detail ? <small>{detail}</small> : null}
    </div>
  )
}

function PortfolioMetricsStrip({ data, position }) {
  const activePositions = position ? 1 : 0
  const returnTone = Number(data.total_return) >= 0 ? 'positive' : 'negative'

  return (
    <div className="portfolio-workspace-metrics" aria-label="Portfolio summary">
      <PortfolioMetric label="Starting Capital" value={money(data.initial_capital)} tone="blue" />
      <PortfolioMetric label="Portfolio Value" value={money(data.portfolio_value)} tone="blue" />
      <PortfolioMetric label="Total P/L" value={money(data.total_pnl)} detail={percent(data.total_return)} tone={returnTone} />
      <PortfolioMetric label="Cash" value={money(data.strategy_cash)} tone="purple" />
      <PortfolioMetric label="Position" value={String(activePositions)} detail={position ? position.symbol : 'Cash'} tone="gold" />
    </div>
  )
}

function CurrentPosition({ position, cash }) {
  if (!position) {
    return (
      <aside className="current-position-section">
        <div className="portfolio-section-heading compact">
          <div><span className="panel-kicker">Position</span><h2>Current Position</h2></div>
        </div>
        <div className="cash-state current-position-cash"><strong>{money(cash)}</strong><span>Cash</span><p>No open position.</p></div>
      </aside>
    )
  }

  const quantity = Number(position.quantity)
  const entryPrice = Number(position.average_entry_price)
  const marketValue = Number(position.market_value)
  const costBasis = Number.isFinite(quantity) && Number.isFinite(entryPrice) ? quantity * entryPrice : null
  const unrealizedPnl = Number.isFinite(marketValue) && Number.isFinite(costBasis) ? marketValue - costBasis : null
  const returnPositive = Number(position.unrealized_return) >= 0

  return (
    <aside className="current-position-section">
      <div className="portfolio-section-heading compact current-position-heading">
        <div><span className="panel-kicker">Position</span><h2>Current Position</h2></div>
        <span className="current-trade-open">Open</span>
      </div>

      <div className="current-trade-asset current-position-asset">
        <strong>{position.symbol}</strong>
        <span>{number(position.quantity, 6)} shares</span>
      </div>

      <div className="current-position-stats">
        <div><span>Entry</span><strong>{money(position.average_entry_price)}</strong></div>
        <div><span>Current</span><strong>{money(position.current_price)}</strong></div>
        <div><span>Market value</span><strong>{money(position.market_value)}</strong></div>
        <div><span>Trade P/L</span><strong className={returnPositive ? 'positive' : 'negative'}>{unrealizedPnl === null ? '—' : money(unrealizedPnl)}</strong></div>
      </div>

      <div className={`current-trade-return current-position-return ${returnPositive ? 'positive' : 'negative'}`}>
        <span>Unrealized return</span>
        <strong>{percent(position.unrealized_return)}</strong>
      </div>
    </aside>
  )
}

function TradeEventDot({ cx, cy, payload }) {
  const events = Array.isArray(payload?.tradeEvents) ? payload.tradeEvents : []
  if (!Number.isFinite(cx) || !Number.isFinite(cy) || !events.length) return null

  let buyLevel = 0
  let sellLevel = 0

  return (
    <g className="portfolio-trade-event-group" transform={`translate(${cx}, ${cy})`}>
      {events.map((event) => {
        const isBuy = event.tradeSide === 'buy'
        const level = isBuy ? buyLevel++ : sellLevel++
        const markerY = (isBuy ? 8 : -8) + (isBuy ? 1 : -1) * level * 13
        const markerClass = isBuy ? 'buy' : 'sell'
        return (
          <g
            key={event.markerKey}
            className={`portfolio-trade-marker ${markerClass}`}
            transform={`translate(0, ${markerY})`}
          >
            <circle r="11" className="portfolio-trade-marker-hit" />
            <circle r="6" className="portfolio-trade-marker-dot" />
          </g>
        )
      })}
    </g>
  )
}

function PortfolioChartTooltip({ active, payload }) {
  if (!active || !payload?.length) return null
  const pointPayload = payload.find((item) => item?.payload?.portfolio_value !== undefined)?.payload
  if (!pointPayload) return null

  const tradeEvents = Array.isArray(pointPayload.tradeEvents) ? pointPayload.tradeEvents : []
  if (tradeEvents.length) {
    const singleTrade = tradeEvents.length === 1 ? tradeEvents[0] : null
    return (
      <div className={`portfolio-chart-tooltip trade ${singleTrade?.tradeSide || 'multiple'}`}>
        <div className="portfolio-tooltip-title">
          <strong>{singleTrade ? singleTrade.tradeSide.toUpperCase() : `${tradeEvents.length} EXECUTIONS`}</strong>
          <span>{singleTrade?.symbol || shortDateTime(pointPayload.recorded_at)}</span>
        </div>
        <div className="portfolio-tooltip-trades">
          {tradeEvents.map((trade) => (
            <div key={trade.markerKey} className={`portfolio-tooltip-trade ${trade.tradeSide}`}>
              {tradeEvents.length > 1 ? (
                <div className="portfolio-tooltip-trade-header">
                  <strong>{trade.tradeSide.toUpperCase()}</strong><span>{trade.symbol || '—'}</span>
                </div>
              ) : null}
              <div className="portfolio-tooltip-grid">
                <span>Executed</span><strong>{shortDateTime(trade.orderTime)}</strong>
                <span>Quantity</span><strong>{trade.quantity ?? '—'}</strong>
                <span>Average fill</span><strong>{trade.price == null ? '—' : money(trade.price)}</strong>
                <span>Portfolio</span><strong>{money(pointPayload.portfolio_value)}</strong>
              </div>
            </div>
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="portfolio-chart-tooltip">
      <span>{shortDateTime(pointPayload.recorded_at)}</span>
      <strong>Portfolio · {money(pointPayload.portfolio_value)}</strong>
    </div>
  )
}

function nearestHistoryIndex(history, targetTimestamp) {
  if (!history.length || targetTimestamp === null) return -1
  let nearestIndex = -1
  let nearestDistance = Number.POSITIVE_INFINITY
  history.forEach((point, index) => {
    if (!Number.isFinite(point.timestamp) || !Number.isFinite(Number(point.portfolio_value))) return
    const distance = Math.abs(point.timestamp - targetTimestamp)
    if (distance < nearestDistance) {
      nearestIndex = index
      nearestDistance = distance
    }
  })
  return nearestIndex
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
    timestamp: timestampValue(item.recorded_at),
  })).filter((item) => item.timestamp !== null), [data])

  const chartData = useMemo(() => {
    const points = history.map((point) => ({ ...point, tradeEvents: [] }))

    ;(data?.recent_orders || []).forEach((order, index) => {
      const filledQuantity = Number(order.filled_quantity)
      const rawFilledPrice = order.filled_average_price
      const filledPrice = Number(rawFilledPrice)
      const orderStatus = String(order.status || '').toLowerCase()
      const hasFilledPrice = rawFilledPrice !== null
        && rawFilledPrice !== undefined
        && rawFilledPrice !== ''
        && Number.isFinite(filledPrice)
        && filledPrice > 0
      const hasExecution = orderStatus === 'filled'
        || (Number.isFinite(filledQuantity) && filledQuantity > 0)
        || hasFilledPrice
      if (!hasExecution) return

      const tradeSide = String(order.side || '').toLowerCase()
      if (!['buy', 'sell'].includes(tradeSide)) return

      const orderTime = order.filled_at || order.updated_at || order.created_at || order.submitted_at
      const nearestIndex = nearestHistoryIndex(points, timestampValue(orderTime))
      if (nearestIndex < 0) return

      points[nearestIndex].tradeEvents.push({
        tradeSide,
        symbol: order.symbol,
        quantity: order.filled_quantity ?? order.quantity,
        price: order.filled_average_price,
        orderTime,
        status: order.status,
        markerKey: `${orderTime || 'order'}-${order.symbol || 'asset'}-${tradeSide}-${index}`,
      })
    })

    return points
  }, [data, history])
  const position = data?.position

  return (
    <section className="page-stack portfolio-page portfolio-single-workspace" aria-busy={refreshing}>
      {error ? <div className="inline-error"><strong>Portfolio unavailable</strong><span>{error}</span><button type="button" onClick={() => setError('')}>×</button></div> : null}

      {!data ? (
        <section className="data-panel portfolio-locked portfolio-tab-loader" role="status" aria-live="polite">
          <div className="portfolio-tab-loader-visual"><span className="loading-ring" aria-hidden="true" /></div>
          <h2>Loading simulated portfolio</h2>
          <p>Connecting to Alpaca Paper and requesting the latest read-only portfolio snapshot.</p>
        </section>
      ) : (
        <section className="data-panel portfolio-workspace-panel">
          <header className="portfolio-workspace-header">
            <div className="portfolio-workspace-title">
              <div className="page-title-icon"><PortfolioIcon size={18} /></div>
              <div><h2>Portfolio</h2><p>Account evolution, current position and recent Paper executions.</p></div>
            </div>
            <div className="portfolio-workspace-actions">
              <span>{lastUpdated ? `Updated ${lastUpdated.toLocaleTimeString()}` : 'Read-only snapshot'}</span>
              <button type="button" className="secondary-action portfolio-refresh-button compact" disabled={refreshing} onClick={() => refreshPortfolio({ includeRobot: true })}>
                {refreshing ? <span className="portfolio-button-spinner" aria-hidden="true" /> : null}
                {refreshing ? 'Refreshing…' : 'Refresh'}
              </button>
            </div>
          </header>

          <PortfolioMetricsStrip data={data} position={position} />

          <TradingSessionStrip
            connection={connection}
            marketClock={data?.market_clock}
            robot={robot}
            now={clockNow}
            refreshing={refreshing}
            nextRefreshAt={nextRefreshAt}
          />

          <div className="portfolio-workspace-main">
            <section className="portfolio-evolution-section">
              <div className="portfolio-section-heading portfolio-chart-heading">
                <div><span className="panel-kicker">Performance</span><h2>Portfolio Evolution</h2></div>
                <div className="portfolio-chart-heading-right">
                  <div className="trade-event-legend" aria-label="Trade event legend">
                    <span><i className="buy" />Buy</span>
                    <span><i className="sell" />Sell</span>
                  </div>
                  <div className="portfolio-monitor"><span className={data.market_clock?.is_open ? 'positive' : 'muted'}>{data.market_clock?.is_open ? 'Market open' : 'Market closed'}</span></div>
                </div>
              </div>
              <div className="performance-chart portfolio-chart portfolio-chart-events">
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart data={chartData} margin={{ top: 18, right: 18, left: 10, bottom: 6 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} />
                    <XAxis
                      dataKey="timestamp"
                      type="number"
                      scale="time"
                      domain={['dataMin', 'dataMax']}
                      minTickGap={42}
                      tickFormatter={(value) => compactDate(new Date(value))}
                    />
                    <YAxis domain={['auto', 'auto']} tickFormatter={(value) => `$${Number(value).toLocaleString('en-US', { maximumFractionDigits: 0 })}`} />
                    <Tooltip content={<PortfolioChartTooltip />} cursor={{ stroke: 'rgba(157, 175, 195, .45)', strokeWidth: 1 }} />
                    <Line type="monotone" dataKey="portfolio_value" name="Portfolio" dot={<TradeEventDot />} activeDot={false} strokeWidth={2.5} stroke="var(--positive)" isAnimationActive={false} />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
            </section>

            <CurrentPosition position={position} cash={data.strategy_cash} />
          </div>

          <section className="portfolio-orders-section">
            <div className="portfolio-section-heading portfolio-orders-heading">
              <div><span className="panel-kicker">Activity</span><h2>Recent Paper Orders</h2></div>
              <span className="panel-count">{data.recent_orders?.length || 0} records</span>
            </div>
            <div className="table-wrap portfolio-orders-table-wrap compact-order-scroll">
              <table className="dashboard-table portfolio-orders-table">
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
        </section>
      )}
    </section>
  )
}
