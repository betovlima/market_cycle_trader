import { getIntlLocale, tr } from '../../i18n/runtime'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { CartesianGrid, ComposedChart, Line, ReferenceArea, ReferenceDot, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'

import { apiFetch } from '../../api/http'
import { API } from '../../config/env'
import { PortfolioIcon } from '../../shared/components/Icons'
import { money, number, percent, shortDateTime } from '../../shared/formatters'
import { clamp, minimumZoomSpan, nearestTimeSeriesIndex, timestampValue } from '../../shared/charts/timeSeries'
import { MIN_ZOOM_POINTS, POLL_MS, ROBOT_POLL_MS, ZOOM_STEP } from './portfolioConfig'
import { portfolioAxisLabel, portfolioMeasureInterval } from './portfolioUtils'
import { CurrentPosition, PortfolioChartTooltip, PortfolioMetricsStrip, TradeEventDot, TradingSessionStrip } from './components/PortfolioPrimitives'

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
  const chartWheelTargetRef = useRef(null)
  const panStateRef = useRef(null)
  const [zoomDomain, setZoomDomain] = useState(null)
  const [isPanning, setIsPanning] = useState(false)
  const [measureMode, setMeasureMode] = useState(false)
  const [measureSelection, setMeasureSelection] = useState({ startTimestamp: null, endTimestamp: null })

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
  })).filter((item) => item.timestamp !== null).sort((left, right) => left.timestamp - right.timestamp), [data])

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
      const nearestIndex = nearestTimeSeriesIndex(points, timestampValue(orderTime), 'timestamp', 'portfolio_value')
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
  const fullTimeDomain = useMemo(() => {
    if (chartData.length < 2) return null
    const start = Number(chartData[0]?.timestamp)
    const end = Number(chartData[chartData.length - 1]?.timestamp)
    if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return null
    return { start, end }
  }, [chartData])

  const minimumTimeSpan = useMemo(() => {
    if (!fullTimeDomain) return 0
    const calculated = minimumZoomSpan(chartData, 'timestamp', MIN_ZOOM_POINTS)
    const fullSpan = fullTimeDomain.end - fullTimeDomain.start
    return Math.min(fullSpan, Math.max(calculated, fullSpan / 250))
  }, [chartData, fullTimeDomain])

  const effectiveZoomDomain = useMemo(() => {
    if (!fullTimeDomain) return null
    if (!zoomDomain) return fullTimeDomain

    const fullSpan = fullTimeDomain.end - fullTimeDomain.start
    const requestedSpan = Math.max(minimumTimeSpan, zoomDomain.end - zoomDomain.start)
    if (!Number.isFinite(requestedSpan) || requestedSpan >= fullSpan * 0.995) return fullTimeDomain

    let start = clamp(zoomDomain.start, fullTimeDomain.start, fullTimeDomain.end - requestedSpan)
    let end = start + requestedSpan
    if (end > fullTimeDomain.end) {
      end = fullTimeDomain.end
      start = end - requestedSpan
    }
    return { start, end }
  }, [fullTimeDomain, minimumTimeSpan, zoomDomain])

  const zoomActive = Boolean(fullTimeDomain && effectiveZoomDomain
    && (effectiveZoomDomain.end - effectiveZoomDomain.start) < (fullTimeDomain.end - fullTimeDomain.start) * 0.995)

  const visibleChartData = useMemo(() => {
    if (!zoomActive || !effectiveZoomDomain) return chartData
    return chartData.filter((point) => point.timestamp >= effectiveZoomDomain.start && point.timestamp <= effectiveZoomDomain.end)
  }, [chartData, effectiveZoomDomain, zoomActive])

  const yDomain = useMemo(() => {
    const values = visibleChartData
      .map((point) => Number(point.portfolio_value))
      .filter((value) => Number.isFinite(value))
    if (!values.length) return ['auto', 'auto']

    const minimum = Math.min(...values)
    const maximum = Math.max(...values)
    const spread = maximum - minimum
    const magnitude = Math.max(Math.abs(minimum), Math.abs(maximum), 1)
    const padding = spread > 0
      ? Math.max(spread * 0.12, magnitude * 0.00005)
      : Math.max(magnitude * 0.0002, 1)

    return [minimum - padding, maximum + padding]
  }, [visibleChartData])

  const measureStartPoint = useMemo(() => {
    const index = nearestTimeSeriesIndex(chartData, measureSelection.startTimestamp, 'timestamp', 'portfolio_value')
    return index >= 0 ? chartData[index] : null
  }, [chartData, measureSelection.startTimestamp])

  const measureEndPoint = useMemo(() => {
    const index = nearestTimeSeriesIndex(chartData, measureSelection.endTimestamp, 'timestamp', 'portfolio_value')
    return index >= 0 ? chartData[index] : null
  }, [chartData, measureSelection.endTimestamp])

  const measureResult = useMemo(() => {
    if (!measureStartPoint || !measureEndPoint) return null
    const startValue = Number(measureStartPoint.portfolio_value)
    const endValue = Number(measureEndPoint.portfolio_value)
    if (!Number.isFinite(startValue) || !Number.isFinite(endValue)) return null
    const change = endValue - startValue
    const changePercent = startValue !== 0 ? change / Math.abs(startValue) : null
    return {
      change,
      changePercent,
      interval: portfolioMeasureInterval(measureStartPoint.timestamp, measureEndPoint.timestamp),
      tone: change > 0 ? 'positive' : change < 0 ? 'negative' : 'flat',
    }
  }, [measureEndPoint, measureStartPoint])

  const visibleTimeSpan = effectiveZoomDomain
    ? Math.max(0, effectiveZoomDomain.end - effectiveZoomDomain.start)
    : 0

  const zoomLevel = useMemo(() => {
    if (!zoomActive || !fullTimeDomain || !effectiveZoomDomain) return 1
    const fullSpan = fullTimeDomain.end - fullTimeDomain.start
    const visibleSpan = effectiveZoomDomain.end - effectiveZoomDomain.start
    return visibleSpan > 0 ? fullSpan / visibleSpan : 1
  }, [effectiveZoomDomain, fullTimeDomain, zoomActive])

  useEffect(() => {
    const chartNode = chartWheelTargetRef.current
    if (!chartNode || !fullTimeDomain) return undefined

    const handleWheel = (event) => {
      if (event.deltaY === 0) return
      event.preventDefault()

      const fullSpan = fullTimeDomain.end - fullTimeDomain.start
      if (fullSpan <= 0 || minimumTimeSpan >= fullSpan) return

      const rect = chartNode.getBoundingClientRect()
      const leftInset = Math.min(68, rect.width * 0.18)
      const rightInset = Math.min(22, rect.width * 0.08)
      const plotWidth = Math.max(1, rect.width - leftInset - rightInset)
      const pointerRatio = clamp((event.clientX - rect.left - leftInset) / plotWidth, 0, 1)
      const intensity = clamp(Math.abs(event.deltaY) / 120, 0.35, 1.6)
      const factor = event.deltaY < 0
        ? Math.pow(ZOOM_STEP, intensity)
        : Math.pow(1 / ZOOM_STEP, intensity)

      setZoomDomain((current) => {
        const requestedStart = current?.start ?? fullTimeDomain.start
        const requestedEnd = current?.end ?? fullTimeDomain.end
        const currentSpan = clamp(requestedEnd - requestedStart, minimumTimeSpan, fullSpan)
        const currentStart = clamp(requestedStart, fullTimeDomain.start, fullTimeDomain.end - currentSpan)
        const nextSpan = clamp(currentSpan * factor, minimumTimeSpan, fullSpan)

        if (nextSpan >= fullSpan * 0.995) return null

        const anchor = currentStart + currentSpan * pointerRatio
        let start = anchor - nextSpan * pointerRatio
        let end = start + nextSpan

        if (start < fullTimeDomain.start) {
          start = fullTimeDomain.start
          end = start + nextSpan
        }
        if (end > fullTimeDomain.end) {
          end = fullTimeDomain.end
          start = end - nextSpan
        }

        return { start, end }
      })
    }

    chartNode.addEventListener('wheel', handleWheel, { passive: false })
    return () => chartNode.removeEventListener('wheel', handleWheel)
  }, [fullTimeDomain, minimumTimeSpan])

  function beginChartPan(event) {
    if (measureMode) return
    if (event.button !== 0 || !zoomActive || !effectiveZoomDomain || !fullTimeDomain) return
    if (event.target?.closest?.('.portfolio-trade-marker-hit')) return
    const chartNode = chartWheelTargetRef.current
    if (!chartNode) return
    const rect = chartNode.getBoundingClientRect()
    const leftInset = Math.min(68, rect.width * 0.18)
    const rightInset = Math.min(22, rect.width * 0.08)
    const plotWidth = Math.max(1, rect.width - leftInset - rightInset)
    panStateRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      domainStart: effectiveZoomDomain.start,
      domainEnd: effectiveZoomDomain.end,
      plotWidth,
    }
    setIsPanning(true)
    event.currentTarget.setPointerCapture?.(event.pointerId)
    event.preventDefault()
  }

  function moveChartPan(event) {
    const pan = panStateRef.current
    if (!pan || pan.pointerId !== event.pointerId || !fullTimeDomain) return
    const span = pan.domainEnd - pan.domainStart
    const shift = -((event.clientX - pan.startX) / pan.plotWidth) * span
    let start = pan.domainStart + shift
    let end = pan.domainEnd + shift
    if (start < fullTimeDomain.start) {
      start = fullTimeDomain.start
      end = start + span
    }
    if (end > fullTimeDomain.end) {
      end = fullTimeDomain.end
      start = end - span
    }
    setZoomDomain({ start, end })
    event.preventDefault()
  }

  function endChartPan(event) {
    const pan = panStateRef.current
    if (!pan || pan.pointerId !== event.pointerId) return
    panStateRef.current = null
    setIsPanning(false)
    event.currentTarget.releasePointerCapture?.(event.pointerId)
  }

  function beginPortfolioMeasure() {
    panStateRef.current = null
    setIsPanning(false)
    setMeasureSelection({ startTimestamp: null, endTimestamp: null })
    setMeasureMode(true)
  }

  function clearPortfolioMeasure() {
    setMeasureMode(false)
    setMeasureSelection({ startTimestamp: null, endTimestamp: null })
  }

  function selectMeasurePoint(event) {
    if (!measureMode || !effectiveZoomDomain) return
    const chartNode = chartWheelTargetRef.current
    if (!chartNode) return

    const rect = chartNode.getBoundingClientRect()
    const leftInset = Math.min(68, rect.width * 0.18)
    const rightInset = Math.min(22, rect.width * 0.08)
    const plotWidth = Math.max(1, rect.width - leftInset - rightInset)
    const pointerRatio = clamp((event.clientX - rect.left - leftInset) / plotWidth, 0, 1)
    const targetTimestamp = effectiveZoomDomain.start + (effectiveZoomDomain.end - effectiveZoomDomain.start) * pointerRatio

    const nearestIndex = nearestTimeSeriesIndex(visibleChartData, targetTimestamp, 'timestamp', 'portfolio_value')
    if (nearestIndex < 0) return
    const point = visibleChartData[nearestIndex]

    if (measureSelection.startTimestamp === null) {
      setMeasureSelection({ startTimestamp: point.timestamp, endTimestamp: null })
      return
    }

    setMeasureSelection({ startTimestamp: measureSelection.startTimestamp, endTimestamp: point.timestamp })
    setMeasureMode(false)
  }

  const position = data?.position

  return (
    <section className="page-stack portfolio-page portfolio-single-workspace" aria-busy={refreshing}>
      {error ? <div className="inline-error"><strong>{tr("Portfolio unavailable")}</strong><span>{tr(error)}</span><button type="button" onClick={() => setError('')}>×</button></div> : null}

      {!data ? (
        <section className="data-panel portfolio-locked portfolio-tab-loader" role="status" aria-live="polite">
          <div className="portfolio-tab-loader-visual"><span className="loading-ring" aria-hidden="true" /></div>
          <h2>{tr("Loading simulated portfolio")}</h2>
          <p>{tr("Connecting to Alpaca Paper and requesting the latest read-only portfolio snapshot.")}</p>
        </section>
      ) : (
        <section className="data-panel portfolio-workspace-panel">
          <header className="portfolio-workspace-header">
            <div className="portfolio-workspace-title">
              <div className="page-title-icon"><PortfolioIcon size={18} /></div>
              <div><h2>{tr("Portfolio")}</h2><p>{tr("Account evolution, current position and recent Paper executions.")}</p></div>
            </div>
            <div className="portfolio-workspace-actions">
              <span>{lastUpdated ? tr('Updated {time}', { time: lastUpdated.toLocaleTimeString(getIntlLocale()) }) : tr('Read-only snapshot')}</span>
              <button type="button" className="secondary-action portfolio-refresh-button compact" disabled={refreshing} onClick={() => refreshPortfolio({ includeRobot: true })}>
                {refreshing ? <span className="portfolio-button-spinner" aria-hidden="true" /> : null}
                {tr(refreshing ? 'Refreshing…' : 'Refresh')}
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
                <div><span className="panel-kicker">{tr("Performance")}</span><h2>{tr("Portfolio Evolution")}</h2></div>
                <div className="portfolio-chart-heading-right">
                  <div className="trade-event-legend" aria-label={tr("Trade event legend")}>
                    <span><i className="buy" />{tr("Buy")}</span>
                    <span><i className="sell" />{tr("Sell")}</span>
                  </div>
                  <div className="portfolio-chart-measure-controls" aria-live="polite">
                    <button type="button" className={measureMode ? 'active' : ''} onClick={beginPortfolioMeasure}>
                      {tr(measureMode ? (measureStartPoint ? 'Select point B' : 'Select point A') : 'Measure')}
                    </button>
                    {measureStartPoint ? <button type="button" onClick={clearPortfolioMeasure}>{tr("Clear")}</button> : null}
                  </div>
                  <div className="portfolio-chart-zoom-controls" aria-live="polite">
                    <span>{measureMode
                      ? tr(measureStartPoint ? 'Click the chart to set point B' : 'Click the chart to set point A')
                      : zoomActive
                        ? tr('Zoom {level}× · Drag to pan', { level: zoomLevel >= 10 ? zoomLevel.toFixed(0) : zoomLevel.toFixed(1) })
                        : tr('Wheel to zoom · Drag to pan')}</span>
                    {zoomActive ? <button type="button" onClick={() => setZoomDomain(null)}>{tr("Reset zoom")}</button> : null}
                  </div>
                  <div className="portfolio-monitor"><span className={data.market_clock?.is_open ? 'positive' : 'muted'}>{tr(data.market_clock?.is_open ? 'Market open' : 'Market closed')}</span></div>
                </div>
              </div>
              {measureStartPoint ? (
                <div className={`portfolio-measurement-summary ${measureResult?.tone || 'pending'}`} role="status" aria-live="polite">
                  <div className="portfolio-measurement-point">
                    <span>{tr("Point A")}</span>
                    <strong>{money(measureStartPoint.portfolio_value)}</strong>
                    <small>{shortDateTime(measureStartPoint.recorded_at)}</small>
                  </div>
                  <span className="portfolio-measurement-arrow" aria-hidden="true">→</span>
                  <div className="portfolio-measurement-point">
                    <span>{tr("Point B")}</span>
                    <strong>{measureEndPoint ? money(measureEndPoint.portfolio_value) : '—'}</strong>
                    <small>{measureEndPoint ? shortDateTime(measureEndPoint.recorded_at) : tr("Select on chart")}</small>
                  </div>
                  <div className="portfolio-measurement-result">
                    <span>{tr("Difference")}</span>
                    <strong>{measureResult ? money(measureResult.change) : '—'}</strong>
                    <small>{measureResult?.changePercent == null ? '—' : percent(measureResult.changePercent)}</small>
                  </div>
                  <div className="portfolio-measurement-result interval">
                    <span>{tr("Interval")}</span>
                    <strong>{measureResult?.interval || '—'}</strong>
                  </div>
                </div>
              ) : null}
              <div
                ref={chartWheelTargetRef}
                className={`performance-chart portfolio-chart portfolio-chart-events portfolio-interactive-chart ${zoomActive ? 'is-zoomed' : ''} ${isPanning ? 'is-panning' : ''} ${measureMode ? 'is-measuring' : ''}`}
                aria-label={tr("Portfolio evolution chart. Use the mouse wheel to zoom. When zoomed, hold the left mouse button and drag to pan through time. Activate Measure and select two points to compare portfolio values.")}
                onPointerDown={beginChartPan}
                onPointerMove={moveChartPan}
                onPointerUp={endChartPan}
                onPointerCancel={endChartPan}
                onClick={selectMeasurePoint}
              >
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart data={visibleChartData} margin={{ top: 18, right: 18, left: 10, bottom: 6 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} />
                    {measureStartPoint && measureEndPoint ? (
                      <ReferenceArea
                        x1={Math.min(measureStartPoint.timestamp, measureEndPoint.timestamp)}
                        x2={Math.max(measureStartPoint.timestamp, measureEndPoint.timestamp)}
                        fill="var(--accent)"
                        fillOpacity={0.075}
                        strokeOpacity={0}
                        ifOverflow="hidden"
                      />
                    ) : null}
                    <XAxis
                      dataKey="timestamp"
                      type="number"
                      scale="time"
                      domain={effectiveZoomDomain ? [effectiveZoomDomain.start, effectiveZoomDomain.end] : ['dataMin', 'dataMax']}
                      allowDataOverflow
                      minTickGap={42}
                      tickFormatter={(value) => portfolioAxisLabel(value, visibleTimeSpan)}
                    />
                    <YAxis domain={yDomain} tickFormatter={(value) => `$${Number(value).toLocaleString(getIntlLocale(), { maximumFractionDigits: 0 })}`} />
                    <Tooltip content={<PortfolioChartTooltip />} cursor={{ stroke: 'rgba(157, 175, 195, .45)', strokeWidth: 1 }} />
                    <Line type="monotone" dataKey="portfolio_value" name={tr("Portfolio")} dot={<TradeEventDot />} activeDot={false} strokeWidth={2.5} stroke="var(--positive)" isAnimationActive={false} />
                    {measureStartPoint ? (
                      <>
                        <ReferenceLine x={measureStartPoint.timestamp} stroke="var(--accent-soft)" strokeDasharray="4 4" ifOverflow="hidden" />
                        <ReferenceDot
                          x={measureStartPoint.timestamp}
                          y={Number(measureStartPoint.portfolio_value)}
                          r={5}
                          fill="var(--accent)"
                          stroke="#f0f6ff"
                          strokeWidth={1.5}
                          ifOverflow="hidden"
                          label={{ value: 'A', position: 'top', fill: 'var(--accent-soft)', fontSize: 10, fontWeight: 900 }}
                        />
                      </>
                    ) : null}
                    {measureEndPoint ? (
                      <>
                        <ReferenceLine x={measureEndPoint.timestamp} stroke={measureResult?.tone === 'negative' ? 'var(--negative)' : 'var(--positive)'} strokeDasharray="4 4" ifOverflow="hidden" />
                        <ReferenceDot
                          x={measureEndPoint.timestamp}
                          y={Number(measureEndPoint.portfolio_value)}
                          r={5}
                          fill={measureResult?.tone === 'negative' ? 'var(--negative)' : 'var(--positive)'}
                          stroke="#f0f6ff"
                          strokeWidth={1.5}
                          ifOverflow="hidden"
                          label={{ value: 'B', position: 'top', fill: measureResult?.tone === 'negative' ? 'var(--negative)' : 'var(--positive)', fontSize: 10, fontWeight: 900 }}
                        />
                      </>
                    ) : null}
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
            </section>

            <CurrentPosition position={position} cash={data.strategy_cash} />
          </div>

          <section className="portfolio-orders-section">
            <div className="portfolio-section-heading portfolio-orders-heading">
              <div><span className="panel-kicker">{tr("Activity")}</span><h2>{tr("Recent Paper Orders")}</h2></div>
              <span className="panel-count">{data.recent_orders?.length || 0} {tr("records")}</span>
            </div>
            <div className="table-wrap portfolio-orders-table-wrap compact-order-scroll">
              <table className="dashboard-table portfolio-orders-table">
                <thead><tr><th>{tr("Created")}</th><th>{tr("Asset")}</th><th>{tr("Side")}</th><th>{tr("Status")}</th><th>{tr("Quantity")}</th><th>{tr("Average Fill")}</th></tr></thead>
                <tbody>
                  {data.recent_orders?.length ? data.recent_orders.map((order, index) => (
                    <tr key={`${order.created_at || 'order'}-${order.symbol || 'asset'}-${index}`}>
                      <td>{shortDateTime(order.created_at)}</td><td>{order.symbol || '—'}</td>
                      <td><span className={`order-side ${order.side}`}>{order.side === 'buy' ? tr('Buy') : order.side === 'sell' ? tr('Sell') : String(order.side || '—').toUpperCase()}</span></td>
                      <td>{order.status ? tr(String(order.status).replaceAll('_', ' ').replace(/\b\w/g, (letter) => letter.toUpperCase())) : '—'}</td><td>{order.filled_quantity ?? order.quantity ?? '—'}</td><td>{order.filled_average_price ? money(order.filled_average_price) : '—'}</td>
                    </tr>
                  )) : <tr><td colSpan="6" className="empty-cell">{tr("No paper orders have been submitted yet.")}</td></tr>}
                </tbody>
              </table>
            </div>
          </section>
        </section>
      )}
    </section>
  )
}
