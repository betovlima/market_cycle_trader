import { tr } from '../../../i18n/runtime'
import { useEffect, useMemo, useState } from 'react'
import {
  CartesianGrid,
  ComposedChart,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Scatter,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'

import { apiFetch } from '../../../api/http'
import { API } from '../../../config/env'
import { money, number, percent, shortDateTime } from '../../../shared/formatters'
import { usePerformanceZoom } from '../hooks/usePerformanceZoom'
import { analyticsAxisLabel, analyticsTimestamp, returnTone } from '../utils/performance'
import { AnalyticsMetric, ChartCell, ChartEmpty, SectionHeading } from './AnalyticsPrimitives'

function dayKey(value) {
  if (!value) return ''
  return String(value).slice(0, 10)
}

function ComparisonTooltip({ active, payload }) {
  if (!active || !payload?.length) return null
  const point = payload.find((item) => item?.payload?.timestamp)?.payload
  if (!point) return null
  return <div className="analytics-performance-tooltip analytics-asset-tooltip">
    <strong>{shortDateTime(point.timestamp)}</strong>
    <div><span>{tr('Strategy index')}</span><b>{number(point.strategy_index, 2)}</b></div>
    <div><span>{tr('Asset index')}</span><b>{number(point.asset_index, 2)}</b></div>
    <div><span>{tr('Strategy equity')}</span><b>{money(point.strategy_equity)}</b></div>
    <div><span>{tr('Asset close')}</span><b>{money(point.asset_close)}</b></div>
    <div><span>{tr('Strategy exposure')}</span><b>{percent(point.strategy_weight)}</b></div>
  </div>
}

function TimingTooltip({ active, payload }) {
  if (!active || !payload?.length) return null
  const eventPoint = payload.find((item) => item?.payload?.action)?.payload
  if (eventPoint) {
    return <div className="analytics-performance-tooltip analytics-asset-tooltip">
      <strong>{shortDateTime(eventPoint.timestamp)}</strong>
      <div><span>{tr('Action')}</span><b>{tr(eventPoint.action)}</b></div>
      <div><span>{tr('Execution price')}</span><b>{money(eventPoint.execution_price ?? eventPoint.asset_close)}</b></div>
      {eventPoint.position_return != null ? <div><span>{tr('Position return')}</span><b className={returnTone(eventPoint.position_return)}>{percent(eventPoint.position_return)}</b></div> : null}
      {eventPoint.realized_pnl != null ? <div><span>{tr('Realized P/L')}</span><b className={returnTone(eventPoint.realized_pnl)}>{money(eventPoint.realized_pnl)}</b></div> : null}
    </div>
  }
  const point = payload.find((item) => item?.payload?.timestamp)?.payload
  if (!point) return null
  return <div className="analytics-performance-tooltip analytics-asset-tooltip">
    <strong>{shortDateTime(point.timestamp)}</strong>
    <div><span>{tr('Asset close')}</span><b>{money(point.asset_close)}</b></div>
    <div><span>{tr('Strategy exposure')}</span><b>{percent(point.strategy_weight)}</b></div>
  </div>
}

function DecisionMarker({ cx, cy, payload }) {
  if (!Number.isFinite(cx) || !Number.isFinite(cy)) return null
  const action = String(payload?.action || '').toUpperCase()
  const outcome = String(payload?.outcome || '')
  const className = action === 'BUY'
    ? 'entry'
    : outcome === 'positive'
      ? 'positive'
      : outcome === 'negative'
        ? 'negative'
        : 'neutral'
  return <g className={`analytics-decision-marker ${className}`}>
    <circle cx={cx} cy={cy} r="5.2" />
    {action === 'BUY'
      ? <path d={`M ${cx - 2.4} ${cy} L ${cx + 2.4} ${cy} M ${cx} ${cy - 2.4} L ${cx} ${cy + 2.4}`} />
      : <path d={`M ${cx - 2.6} ${cy} L ${cx + 2.6} ${cy}`} />}
  </g>
}

function metricValue(value, formatter, fallback = '—') {
  return value == null ? fallback : formatter(value)
}

export function AssetStrategyComparison({ data, jobId }) {
  const assets = useMemo(() => {
    const configured = Array.isArray(data?.available_assets) ? data.available_assets : []
    const attributed = (data?.asset_attribution || []).map((item) => item.asset)
    return [...new Set([...configured, ...attributed].map((item) => String(item || '').trim().toUpperCase()).filter(Boolean))].sort()
  }, [data?.asset_attribution, data?.available_assets])
  const [asset, setAsset] = useState('')
  const [comparison, setComparison] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!assets.length) {
      setAsset('')
      return
    }
    if (!asset || !assets.includes(asset)) setAsset(assets[0])
  }, [asset, assets])

  useEffect(() => {
    if (!jobId || !asset) return
    let active = true
    setLoading(true)
    setError('')
    apiFetch(`${API}/analytics/backtests/${encodeURIComponent(jobId)}/assets/${encodeURIComponent(asset)}`)
      .then((payload) => { if (active) setComparison(payload) })
      .catch((requestError) => {
        if (!active) return
        setComparison(null)
        setError(tr(requestError.message || 'Unable to load asset comparison.'))
      })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [asset, jobId])

  const chartRows = useMemo(() => (comparison?.series || [])
    .map((row) => ({ ...row, timestamp_value: analyticsTimestamp(row.timestamp) }))
    .filter((row) => row.timestamp_value !== null)
    .sort((left, right) => left.timestamp_value - right.timestamp_value), [comparison?.series])

  const {
    chartInteractionRef,
    effectiveZoomDomain,
    isPanning,
    visibleEquityRows: visibleRows,
    visibleSpan,
    zoomActive,
    zoomLevel,
    beginPan,
    movePan,
    endPan,
    resetZoom,
  } = usePerformanceZoom({ equityRows: chartRows, jobId: `${jobId}:${asset}` })

  const visibleEvents = useMemo(() => {
    const priceByDay = new Map(chartRows.map((row) => [dayKey(row.timestamp), row.asset_close]))
    return (comparison?.events || [])
      .map((event) => ({
        ...event,
        timestamp_value: analyticsTimestamp(event.timestamp),
        asset_close: event.execution_price ?? priceByDay.get(dayKey(event.timestamp)) ?? null,
      }))
      .filter((event) => event.timestamp_value !== null && Number.isFinite(Number(event.asset_close)))
      .filter((event) => !effectiveZoomDomain || (event.timestamp_value >= effectiveZoomDomain.start && event.timestamp_value <= effectiveZoomDomain.end))
  }, [chartRows, comparison?.events, effectiveZoomDomain])

  const buyEvents = visibleEvents.filter((event) => String(event.action || '').toUpperCase() === 'BUY')
  const sellEvents = visibleEvents.filter((event) => ['SELL', 'FINAL_SELL'].includes(String(event.action || '').toUpperCase()))
  const summary = comparison?.summary || {}

  if (!assets.length) return null

  const actions = <div className="analytics-asset-comparison-actions">
    <label className="analytics-context-select analytics-asset-selector">
      <span>{tr('Asset')}</span>
      <select value={asset} onChange={(event) => setAsset(event.target.value)}>
        {assets.map((symbol) => <option key={symbol} value={symbol}>{symbol}</option>)}
      </select>
    </label>
    <span className="analytics-zoom-status">
      {zoomActive
        ? tr('{level}× · drag to pan', { level: zoomLevel >= 10 ? zoomLevel.toFixed(0) : zoomLevel.toFixed(1) })
        : tr('Wheel to zoom')}
    </span>
    {zoomActive ? <button type="button" className="analytics-reset-zoom" onClick={resetZoom}>{tr('Reset')}</button> : null}
  </div>

  return <section className="analytics-workspace-section analytics-asset-comparison-section">
    <SectionHeading kicker={tr('ASSET REVIEW')} title={tr('Strategy versus asset')} action={actions} />
    {error ? <div className="global-inline-message error-inline analytics-workspace-message">{error}</div> : null}
    {loading ? <div className="analytics-loading"><span className="loading-ring" />{tr('Loading asset comparison…')}</div> : null}
    {!loading && comparison ? <>
      <div className="analytics-asset-comparison-metrics">
        <AnalyticsMetric label={tr('Strategy return')} value={metricValue(summary.strategy_return, percent)} note={tr('Selected backtest')} tone={returnTone(summary.strategy_return)} />
        <AnalyticsMetric label={tr('Asset return')} value={metricValue(summary.asset_return, percent)} note={asset} tone={returnTone(summary.asset_return)} />
        <AnalyticsMetric label="S − Asset" value={metricValue(summary.relative_return, percent)} note={tr('Strategy minus asset')} tone={returnTone(summary.relative_return)} />
        <AnalyticsMetric label={tr('Asset exposure')} value={metricValue(summary.exposure_rate, percent)} note={tr('Average weight {value}', { value: metricValue(summary.average_weight, percent) })} />
        <AnalyticsMetric label={tr('Win rate')} value={metricValue(summary.win_rate, percent)} note={tr('{wins} wins · {losses} losses', { wins: summary.profitable_positions ?? 0, losses: summary.losing_positions ?? 0 })} />
        <AnalyticsMetric label={tr('Realized P/L')} value={money(summary.realized_pnl)} note={tr('{count} closed positions', { count: summary.closed_positions ?? 0 })} tone={returnTone(summary.realized_pnl)} />
      </div>

      <div
        ref={chartInteractionRef}
        className={`analytics-asset-comparison-charts analytics-interactive-chart ${zoomActive ? 'is-zoomed' : ''} ${isPanning ? 'is-panning' : ''}`}
        onPointerDown={beginPan}
        onPointerMove={movePan}
        onPointerUp={endPan}
        onPointerCancel={endPan}
      >
        <ChartCell kicker={tr('RELATIVE PERFORMANCE')} title={tr('Indexed strategy versus asset')}>
          {visibleRows.length ? <div className="analytics-chart analytics-chart-asset-comparison">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={visibleRows}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="timestamp_value" type="number" domain={['dataMin', 'dataMax']} tickFormatter={(value) => analyticsAxisLabel(value, visibleSpan)} minTickGap={38} />
                <YAxis domain={['auto', 'auto']} tickFormatter={(value) => number(value, 0)} />
                <Tooltip content={<ComparisonTooltip />} cursor={{ stroke: 'rgba(147, 177, 210, .45)', strokeDasharray: '4 4' }} />
                <ReferenceLine y={100} stroke="rgba(145, 169, 198, .35)" strokeDasharray="3 4" />
                <Line type="monotone" dataKey="strategy_index" name={tr('Strategy')} dot={false} strokeWidth={2.3} stroke="var(--positive)" />
                <Line type="monotone" dataKey="asset_index" name={asset} dot={false} strokeWidth={2} stroke="var(--accent)" />
              </LineChart>
            </ResponsiveContainer>
          </div> : <ChartEmpty />}
        </ChartCell>

        <ChartCell kicker={tr('TIMING REVIEW')} title={tr('Asset price with strategy decisions')}>
          {visibleRows.length ? <div className="analytics-chart analytics-chart-asset-timing">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={visibleRows}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="timestamp_value" type="number" domain={['dataMin', 'dataMax']} tickFormatter={(value) => analyticsAxisLabel(value, visibleSpan)} minTickGap={38} />
                <YAxis domain={['auto', 'auto']} tickFormatter={(value) => `$${number(value, value >= 100 ? 0 : 2)}`} />
                <Tooltip content={<TimingTooltip />} cursor={{ stroke: 'rgba(147, 177, 210, .45)', strokeDasharray: '4 4' }} />
                <Line type="monotone" dataKey="asset_close" name={asset} dot={false} strokeWidth={2.1} stroke="var(--accent)" />
                <Scatter name={tr('Buy')} data={buyEvents} dataKey="asset_close" shape={<DecisionMarker />} />
                <Scatter name={tr('Sell')} data={sellEvents} dataKey="asset_close" shape={<DecisionMarker />} />
              </ComposedChart>
            </ResponsiveContainer>
          </div> : <ChartEmpty />}
          <div className="analytics-asset-event-legend" aria-label={tr('Decision markers')}>
            <span><i className="entry" />{tr('Buy')}</span>
            <span><i className="positive" />{tr('Profitable exit')}</span>
            <span><i className="negative" />{tr('Losing exit')}</span>
            <span><i className="neutral" />{tr('Neutral exit')}</span>
          </div>
        </ChartCell>
      </div>
    </> : null}
  </section>
}
