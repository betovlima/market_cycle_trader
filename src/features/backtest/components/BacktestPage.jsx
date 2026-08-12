import { getIntlLocale, tr } from '../../../i18n/runtime'
import { useEffect, useMemo, useRef, useState } from 'react'
import { CartesianGrid, ComposedChart, Legend, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'

import { apiFetch, downloadFile } from '../../../api/http'
import { API } from '../../../config/env'
import {
  BacktestIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  ListFilterIcon,
  PlayIcon,
  SearchIcon,
  SortIcon,
  TrendDownIcon,
  TrendUpIcon,
} from '../../../shared/components/Icons'
import { ParameterHint } from '../../../shared/components/ParameterHint'
import { durationLabel, money, percent, shortDateTime } from '../../../shared/formatters'
import { ExecutionStatus } from './ExecutionStatus'
import { ModelTuningPanel } from '../../ModelTuningPanel'

const ROTATION_PAGE_SIZE = 12
const HISTORY_PAGE_SIZE = 10
const ZOOM_STEP = 0.84
const MIN_ZOOM_POINTS = 8
const DAY_MS = 24 * 60 * 60 * 1000

function timestampValue(value) {
  if (!value) return null
  const parsed = new Date(value).getTime()
  return Number.isFinite(parsed) ? parsed : null
}

function clamp(value, minimum, maximum) {
  return Math.min(maximum, Math.max(minimum, value))
}

function minimumZoomSpan(points) {
  if (points.length < 2) return 0
  const gaps = []
  for (let index = 1; index < points.length; index += 1) {
    const gap = Number(points[index].timestamp_value) - Number(points[index - 1].timestamp_value)
    if (Number.isFinite(gap) && gap > 0) gaps.push(gap)
  }
  if (!gaps.length) return 0
  gaps.sort((left, right) => left - right)
  const medianGap = gaps[Math.floor(gaps.length / 2)]
  return medianGap * Math.max(2, MIN_ZOOM_POINTS - 1)
}

function backtestAxisLabel(value, visibleSpan) {
  const date = new Date(Number(value))
  if (Number.isNaN(date.getTime())) return ''
  if (visibleSpan <= DAY_MS * 2) {
    return date.toLocaleTimeString(getIntlLocale(), { hour: '2-digit', minute: '2-digit', hour12: false })
  }
  if (visibleSpan <= DAY_MS * 45) {
    return date.toLocaleDateString(getIntlLocale(), { month: 'short', day: 'numeric' })
  }
  return date.toLocaleDateString(getIntlLocale(), { month: 'short', year: '2-digit' })
}

function nearestChartIndex(points, targetTimestamp) {
  if (!points.length || targetTimestamp === null) return -1
  let nearestIndex = -1
  let nearestDistance = Number.POSITIVE_INFINITY
  points.forEach((point, index) => {
    if (!Number.isFinite(point.timestamp_value)) return
    const distance = Math.abs(point.timestamp_value - targetTimestamp)
    if (distance < nearestDistance) {
      nearestIndex = index
      nearestDistance = distance
    }
  })
  return nearestIndex
}

function BacktestTradeEventDot({ cx, cy, payload }) {
  const events = Array.isArray(payload?.tradeEvents) ? payload.tradeEvents : []
  if (!Number.isFinite(cx) || !Number.isFinite(cy) || !events.length) return null

  let buyLevel = 0
  let sellLevel = 0
  return (
    <g className="backtest-trade-event-group" transform={`translate(${cx}, ${cy})`}>
      {events.map((event) => {
        const isBuy = event.tradeSide === 'buy'
        const level = isBuy ? buyLevel++ : sellLevel++
        const markerY = (isBuy ? 9 : -9) + (isBuy ? 1 : -1) * level * 13
        return (
          <g key={event.markerKey} className={`backtest-trade-marker ${isBuy ? 'buy' : 'sell'}`} transform={`translate(0, ${markerY})`}>
            <circle
              r="13"
              className="backtest-trade-marker-hit"
              onPointerDown={(pointerEvent) => pointerEvent.stopPropagation()}
              aria-label={`${tr(event.tradeSide === 'buy' ? 'Buy' : event.tradeSide === 'sell' ? 'Sell' : event.tradeSide)} ${event.asset || ''}`}
            />
            <circle r="5.5" className="backtest-trade-marker-dot" />
          </g>
        )
      })}
    </g>
  )
}

function BacktestChartTooltip({ active, payload }) {
  if (!active || !payload?.length) return null
  const point = payload.find((item) => item?.payload?.timestamp_value !== undefined)?.payload
  if (!point) return null
  const tradeEvents = Array.isArray(point.tradeEvents) ? point.tradeEvents : []

  return (
    <div className={`backtest-chart-tooltip ${tradeEvents.length ? 'trade' : ''}`}>
      <div className="backtest-chart-tooltip-title">
        <strong>{tradeEvents.length ? tr(tradeEvents.length === 1 ? '{count} EXECUTION' : '{count} EXECUTIONS', { count: tradeEvents.length }) : tr('EQUITY')}</strong>
        <span>{shortDateTime(point.timestamp)}</span>
      </div>
      {tradeEvents.length ? (
        <div className="backtest-chart-tooltip-events">
          {tradeEvents.map((trade) => (
            <div key={trade.markerKey} className={`backtest-chart-tooltip-event ${trade.tradeSide}`}>
              <div className="backtest-chart-tooltip-event-title">
                <strong>{tr(trade.tradeSide === 'buy' ? 'BUY' : trade.tradeSide === 'sell' ? 'SELL' : trade.tradeSide.toUpperCase())} · {trade.asset || 'CASH'}</strong>
                <span>{trade.fromAsset || 'CASH'} → {trade.toAsset || 'CASH'}</span>
              </div>
              <div className="backtest-chart-tooltip-grid">
                <span>{tr("Executed")}</span><strong>{shortDateTime(trade.executedAt)}</strong>
                {trade.tradeSide === 'sell' ? <><span>{tr("Position return")}</span><strong>{percent(trade.positionReturn)}</strong></> : null}
                {trade.tradeSide === 'sell' ? <><span>{tr("Realized P/L")}</span><strong>{money(trade.realizedPnl)}</strong></> : null}
                <span>{tr("Fees")}</span><strong>{money(trade.transactionFees)}</strong>
              </div>
            </div>
          ))}
        </div>
      ) : null}
      <div className="backtest-chart-tooltip-equity">
        <span>{tr("Simulation")}</span><strong>{money(point.simulation_equity)}</strong>
        <span>{tr("Reference")}</span><strong>{money(point.reference_equity)}</strong>
      </div>
    </div>
  )
}

const METRIC_HINTS = {
  ending_capital: 'Portfolio capital at the end of the selected simulation after the modeled trades and transaction costs.',
  reference_ending_capital: 'Ending value of the reference Buy & Hold comparison over the same historical period.',
  cagr: 'Compound annual growth rate. It converts the total simulated growth into an annualized rate for easier comparison.',
  sharpe: 'Risk-adjusted return based on the variability of the simulated returns. Higher values indicate more return per unit of volatility.',
  maximum_drawdown: 'Largest peak-to-trough decline in portfolio equity during the simulation.',
  session_win_rate: 'Share of evaluated sessions in which the strategy produced a positive portfolio return.',
  total_rotations: 'Number of completed switches from one held asset to another asset or cash state.',
  profitable_rotations: 'Completed rotations whose closed position produced positive realized profit.',
  total_realized_pnl: 'Sum of realized profit and loss from positions closed during capital rotations.',
  average_holding_days: 'Average number of trading sessions the portfolio remained in a position before rotating out of it.',
}

const HISTORY_HINTS = {
  created_at: 'When this backtest execution was created.',
  strategy_profile_name: 'Public display name of the strategy profile used by the backtest. Protected parameters remain server-side.',
  status: 'Current or terminal execution state for the backtest.',
  simulation_return: 'Total return produced by the simulated strategy over the test period.',
  sharpe: 'Risk-adjusted return of the simulation.',
  maximum_drawdown: 'Largest peak-to-trough decline during the simulation.',
  position_changes: 'Number of capital rotations recorded by the simulation.',
  duration_seconds: 'Wall-clock execution time of the backtest job.',
}

const ROTATION_HINTS = {
  executed_at: 'Timestamp when the simulated capital switch was executed.',
  from_asset: 'Asset that was exited. This is the sell side of the rotation.',
  to_asset: 'Asset entered after the exit. This is the buy side of the rotation.',
  holding_days: 'Number of trading sessions the exited position was held.',
  position_return: 'Return of the position that was closed by this rotation.',
  realized_pnl: 'Profit or loss realized when the previous position was closed.',
  transaction_fees: 'Transaction costs attributed to the completed rotation.',
}

function MetricLabel({ id, label, hint }) {
  return (
    <span className="backtest-field-label">
      <span>{tr(label)}</span>
      {hint ? <ParameterHint id={id} title={tr(label)} description={hint} /> : null}
    </span>
  )
}

function Metric({ id, label, value, note, tone = '', hint = '' }) {
  return (
    <article className={`result-metric ${tone}`}>
      <MetricLabel id={id} label={label} hint={hint} />
      <strong>{value}</strong>
      <small>{typeof note === 'string' ? tr(note) : note}</small>
    </article>
  )
}

function StatusBadge({ status }) {
  return <span className={`table-status ${status || 'unknown'}`}>{tr(String(status || 'unknown').replaceAll('_', ' ').replace(/\b\w/g, (letter) => letter.toUpperCase()))}</span>
}

function compareValues(left, right) {
  if (left == null && right == null) return 0
  if (left == null) return 1
  if (right == null) return -1
  if (typeof left === 'number' && typeof right === 'number') return left - right
  return String(left).localeCompare(String(right), undefined, { numeric: true, sensitivity: 'base' })
}

function sortRows(rows, sort, accessors) {
  const accessor = accessors[sort.key] || ((item) => item?.[sort.key])
  const direction = sort.direction === 'asc' ? 1 : -1
  return [...rows].sort((left, right) => direction * compareValues(accessor(left), accessor(right)))
}

function toggleSort(current, key) {
  if (current.key !== key) return { key, direction: 'desc' }
  return { key, direction: current.direction === 'desc' ? 'asc' : 'desc' }
}

function SortableHeader({ label, field, sort, onSort, hint = '' }) {
  const active = sort.key === field
  const description = active ? `Sorted ${sort.direction === 'desc' ? 'descending' : 'ascending'}.` : 'Click to sort this column.'
  return (
    <th aria-sort={active ? (sort.direction === 'desc' ? 'descending' : 'ascending') : 'none'}>
      <div className="backtest-sort-header">
        <button type="button" onClick={() => onSort(field)} title={`${tr(description)} ${tr(label)}`}>
          <span>{tr(label)}</span>
          <SortIcon size={14} descending={!active || sort.direction === 'desc'} />
        </button>
        {hint ? <ParameterHint id={`hint-${field}`} title={tr(label)} description={hint} align="right" /> : null}
      </div>
    </th>
  )
}

function FilterButton({ active, label, onClick, tone = '', children = null }) {
  return (
    <button
      type="button"
      className={`backtest-filter-button ${tone} ${active ? 'active' : ''}`}
      onClick={onClick}
      aria-pressed={active}
      title={tr(label)}
    >
      {children}
      <span>{tr(label)}</span>
    </button>
  )
}

function ListToolbar({
  query,
  onQueryChange,
  placeholder,
  children,
  resultCount,
  resultLabel = 'records',
}) {
  return (
    <div className="backtest-list-toolbar">
      <label className="backtest-list-search">
        <SearchIcon size={15} />
        <input
          type="search"
          value={query}
          onChange={(event) => onQueryChange(event.target.value)}
          placeholder={tr(placeholder)}
          aria-label={tr(placeholder)}
        />
      </label>
      <div className="backtest-list-filters">{children}</div>
      <span className="backtest-list-count">{resultCount} {tr(resultLabel)}</span>
    </div>
  )
}

function Pagination({ page, pages, total, pageSize, onPageChange }) {
  const safePages = Math.max(1, pages)
  const safePage = Math.min(Math.max(1, page), safePages)
  const from = total ? ((safePage - 1) * pageSize) + 1 : 0
  const to = Math.min(safePage * pageSize, total)
  return (
    <div className="backtest-pagination">
      <span>{total ? tr("{from}–{to} of {total}", { from, to, total }) : tr("0 results")}</span>
      <div>
        <button type="button" onClick={() => onPageChange(safePage - 1)} disabled={safePage <= 1} aria-label={tr("Previous page")} title={tr("Previous page")}><ChevronLeftIcon size={16} /></button>
        <strong>{tr("Page")}{' '}{safePage} {tr("of")}{' '}{safePages}</strong>
        <button type="button" onClick={() => onPageChange(safePage + 1)} disabled={safePage >= safePages} aria-label={tr("Next page")} title={tr("Next page")}><ChevronRightIcon size={16} /></button>
      </div>
    </div>
  )
}

function RotationPanel({ jobId, payload, loading, error }) {
  const [query, setQuery] = useState('')
  const [outcome, setOutcome] = useState('all')
  const [sort, setSort] = useState({ key: 'executed_at', direction: 'desc' })
  const [page, setPage] = useState(1)

  const summary = payload?.rotation_summary || {}
  const rotations = payload?.rotations || []
  const filteredRows = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase()
    const rows = rotations.filter((item) => {
      if (normalizedQuery) {
        const haystack = `${item.from_asset || 'CASH'} ${item.to_asset || 'CASH'}`.toLowerCase()
        if (!haystack.includes(normalizedQuery)) return false
      }
      const pnl = Number(item.realized_pnl || 0)
      if (outcome === 'profit' && pnl <= 0) return false
      if (outcome === 'loss' && pnl >= 0) return false
      if (outcome === 'flat' && pnl !== 0) return false
      return true
    })

    return sortRows(rows, sort, {
      executed_at: (item) => Date.parse(item.executed_at || '') || 0,
      from_asset: (item) => String(item.from_asset || 'CASH'),
      to_asset: (item) => String(item.to_asset || 'CASH'),
      holding_days: (item) => item.holding_days == null ? null : Number(item.holding_days),
      position_return: (item) => item.position_return == null ? null : Number(item.position_return),
      realized_pnl: (item) => item.realized_pnl == null ? null : Number(item.realized_pnl),
      transaction_fees: (item) => item.transaction_fees == null ? null : Number(item.transaction_fees),
    })
  }, [outcome, query, rotations, sort])

  const pages = Math.max(1, Math.ceil(filteredRows.length / ROTATION_PAGE_SIZE))
  const currentPage = Math.min(page, pages)
  const paginatedRows = filteredRows.slice((currentPage - 1) * ROTATION_PAGE_SIZE, currentPage * ROTATION_PAGE_SIZE)

  useEffect(() => { setPage(1) }, [jobId, outcome, query, sort])

  if (loading) {
    return <section className="backtest-workspace-section backtest-loading-row">{tr("Loading capital rotations…")}</section>
  }

  if (error) {
    return <section className="backtest-workspace-section rotation-error"><strong>{tr("Unable to load capital rotations")}</strong><span>{tr(error)}</span></section>
  }

  return (
    <section className="backtest-workspace-section rotation-workspace-section">
      <div className="backtest-section-heading">
        <div><span className="panel-kicker">{tr("Backtest analytics")}</span><h2>{tr("Capital Rotations")}</h2></div>
        <span className="backtest-section-meta">{tr("Executed switches only · strategy-neutral")}</span>
      </div>

      <div className="backtest-rotation-summary">
        <Metric id="hint-rotation-count" label={tr("Capital Rotations")} value={String(summary.total_rotations ?? 0)} note={tr("Completed asset switches")} tone="blue" hint={METRIC_HINTS.total_rotations} />
        <Metric id="hint-profitable-rotations" label={tr("Profitable Exits")} value={String(summary.profitable_rotations ?? 0)} note={tr('{losing} losing · {flat} flat', { losing: summary.losing_rotations ?? 0, flat: summary.flat_rotations ?? 0 })} tone="green" hint={METRIC_HINTS.profitable_rotations} />
        <Metric id="hint-realized-pnl" label={tr("Realized P/L")} value={money(summary.total_realized_pnl)} note={tr('Fees {value}', { value: money(summary.total_transaction_fees) })} tone={Number(summary.total_realized_pnl || 0) >= 0 ? 'green' : 'red'} hint={METRIC_HINTS.total_realized_pnl} />
        <Metric id="hint-average-holding" label={tr("Average Holding")} value={summary.average_holding_days == null ? '—' : tr('{count} days', { count: Number(summary.average_holding_days).toFixed(1) })} note={summary.last_rotation_at ? tr('Last {value}', { value: shortDateTime(summary.last_rotation_at) }) : tr('No rotation recorded')} tone="purple" hint={METRIC_HINTS.average_holding_days} />
      </div>

      <ListToolbar
        query={query}
        onQueryChange={setQuery}
        placeholder={tr("Filter by sold or bought asset")}
        resultCount={filteredRows.length}
        resultLabel={filteredRows.length === 1 ? 'rotation' : 'rotations'}
      >
        <FilterButton active={outcome === 'all'} label={tr("All")} onClick={() => setOutcome('all')}><ListFilterIcon size={14} /></FilterButton>
        <FilterButton active={outcome === 'profit'} label={tr("Profit")} tone="positive" onClick={() => setOutcome('profit')}><TrendUpIcon size={14} /></FilterButton>
        <FilterButton active={outcome === 'loss'} label={tr("Loss")} tone="negative" onClick={() => setOutcome('loss')}><TrendDownIcon size={14} /></FilterButton>
        <FilterButton active={outcome === 'flat'} label={tr("Flat")} onClick={() => setOutcome('flat')} />
      </ListToolbar>

      <div className="table-wrap backtest-table-wrap">
        <table className="dashboard-table rotation-table backtest-sortable-table">
          <thead>
            <tr>
              <SortableHeader label={tr("Executed")} field="executed_at" sort={sort} onSort={(key) => setSort((current) => toggleSort(current, key))} hint={ROTATION_HINTS.executed_at} />
              <SortableHeader label={tr("Sold")} field="from_asset" sort={sort} onSort={(key) => setSort((current) => toggleSort(current, key))} hint={ROTATION_HINTS.from_asset} />
              <SortableHeader label={tr("Bought")} field="to_asset" sort={sort} onSort={(key) => setSort((current) => toggleSort(current, key))} hint={ROTATION_HINTS.to_asset} />
              <SortableHeader label={tr("Holding")} field="holding_days" sort={sort} onSort={(key) => setSort((current) => toggleSort(current, key))} hint={ROTATION_HINTS.holding_days} />
              <SortableHeader label={tr("Position Return")} field="position_return" sort={sort} onSort={(key) => setSort((current) => toggleSort(current, key))} hint={ROTATION_HINTS.position_return} />
              <SortableHeader label={tr("Realized P/L")} field="realized_pnl" sort={sort} onSort={(key) => setSort((current) => toggleSort(current, key))} hint={ROTATION_HINTS.realized_pnl} />
              <SortableHeader label={tr("Fees")} field="transaction_fees" sort={sort} onSort={(key) => setSort((current) => toggleSort(current, key))} hint={ROTATION_HINTS.transaction_fees} />
            </tr>
          </thead>
          <tbody>
            {paginatedRows.length ? paginatedRows.map((item, index) => (
              <tr key={`${item.executed_at || 'rotation'}-${item.from_asset}-${item.to_asset}-${index}`}>
                <td>{shortDateTime(item.executed_at)}</td>
                <td><span className="rotation-asset from">{item.from_asset || 'CASH'}</span></td>
                <td><span className="rotation-asset to">{item.to_asset || 'CASH'}</span></td>
                <td>{item.holding_days == null ? '—' : tr('{count} days', { count: Number(item.holding_days).toFixed(0) })}</td>
                <td className={item.position_return == null ? '' : Number(item.position_return) >= 0 ? 'positive' : 'negative'}>{percent(item.position_return)}</td>
                <td className={item.realized_pnl == null ? '' : Number(item.realized_pnl) >= 0 ? 'positive' : 'negative'}>{money(item.realized_pnl)}</td>
                <td>{money(item.transaction_fees)}</td>
              </tr>
            )) : <tr><td colSpan="7" className="empty-cell">{tr("No capital rotations match the selected filters.")}</td></tr>}
          </tbody>
        </table>
      </div>
      <Pagination page={currentPage} pages={pages} total={filteredRows.length} pageSize={ROTATION_PAGE_SIZE} onPageChange={setPage} />
    </section>
  )
}

export function BacktestPage({ workspace, canExportResults = false, canRunResearchModels = false, onSessionExpired }) {
  const {
    job,
    dashboard,
    detail,
    loadingDetail,
    running,
    restoringExecution,
    startingBacktest,
    startDisabled,
    runBacktest,
    refreshDashboard,
  } = workspace
  const metrics = detail?.metrics || {}
  const [rotationPayload, setRotationPayload] = useState(null)
  const [rotationLoading, setRotationLoading] = useState(false)
  const [rotationError, setRotationError] = useState('')
  const [zoomDomain, setZoomDomain] = useState(null)
  const [isPanning, setIsPanning] = useState(false)
  const chartInteractionRef = useRef(null)
  const panStateRef = useRef(null)
  const [exporting, setExporting] = useState(false)
  const [exportError, setExportError] = useState('')
  const [historyQuery, setHistoryQuery] = useState('')
  const [historyStatus, setHistoryStatus] = useState('all')
  const [historySort, setHistorySort] = useState({ key: 'created_at', direction: 'desc' })
  const [historyPage, setHistoryPage] = useState(1)
  const [selectedStrategyModel, setSelectedStrategyModel] = useState(null)
  const [researchWorkspaceMode, setResearchWorkspaceMode] = useState('simulation')
  const [strategyContextError, setStrategyContextError] = useState('')
  const [researchExecutionModels, setResearchExecutionModels] = useState({})
  const selectedStrategyName = dashboard?.selected_backtest_strategy_name || tr('Not selected')
  const activeStrategyName = (running ? job?.strategy_profile_name : null) || selectedStrategyName

  useEffect(() => {
    let active = true
    if (!canRunResearchModels) {
      setSelectedStrategyModel(null)
      setStrategyContextError('')
      return () => { active = false }
    }

    apiFetch(`${API}/admin/strategies/control`)
      .then((value) => {
        if (!active) return
        setSelectedStrategyModel(value?.research_strategy?.research_model || null)
        setStrategyContextError('')
      })
      .catch((requestError) => {
        if (!active) return
        setSelectedStrategyModel(null)
        setStrategyContextError(requestError.message || 'Unable to load the model saved with the selected Strategy.')
      })
    return () => { active = false }
  }, [canRunResearchModels, dashboard?.selected_backtest_strategy_name])

  useEffect(() => {
    let active = true
    if (!canRunResearchModels) {
      setResearchExecutionModels({})
      return () => { active = false }
    }

    apiFetch(`${API}/admin/model-research/executions?limit=50`)
      .then((value) => {
        if (!active) return
        const items = Array.isArray(value?.items) ? value.items : []
        setResearchExecutionModels(Object.fromEntries(items.filter((item) => item?.id).map((item) => [item.id, item])))
      })
      .catch(() => {
        if (active) setResearchExecutionModels({})
      })
    return () => { active = false }
  }, [canRunResearchModels, job?.id, detail?.id, dashboard?.recent_backtests?.[0]?.id])

  useEffect(() => {
    let active = true
    const jobId = detail?.id
    if (!jobId) {
      setRotationPayload(null)
      setRotationError('')
      setRotationLoading(false)
      return () => { active = false }
    }

    setRotationLoading(true)
    setRotationPayload(null)
    setRotationError('')
    apiFetch(`${API}/analytics/backtests/${encodeURIComponent(jobId)}`)
      .then((value) => {
        if (active) setRotationPayload(value)
      })
      .catch((requestError) => {
        if (active) {
          setRotationPayload(null)
          setRotationError(tr(requestError.message || 'Unable to load capital rotations.'))
        }
      })
      .finally(() => {
        if (active) setRotationLoading(false)
      })

    return () => { active = false }
  }, [detail?.id])

  const chartRows = useMemo(() => {
    const points = (detail?.series || [])
      .map((row) => ({ ...row, timestamp_value: timestampValue(row.timestamp), tradeEvents: [] }))
      .filter((row) => row.timestamp_value !== null)
      .sort((left, right) => left.timestamp_value - right.timestamp_value)

    ;(rotationPayload?.rotations || []).forEach((rotation, index) => {
      const nearestIndex = nearestChartIndex(points, timestampValue(rotation.executed_at))
      if (nearestIndex < 0) return
      const common = {
        executedAt: rotation.executed_at,
        fromAsset: rotation.from_asset || 'CASH',
        toAsset: rotation.to_asset || 'CASH',
        holdingDays: rotation.holding_days,
        positionReturn: rotation.position_return,
        realizedPnl: rotation.realized_pnl,
        transactionFees: rotation.transaction_fees,
      }
      if (rotation.from_asset && String(rotation.from_asset).toUpperCase() !== 'CASH') {
        points[nearestIndex].tradeEvents.push({
          ...common,
          tradeSide: 'sell',
          asset: rotation.from_asset,
          markerKey: `${rotation.executed_at || 'rotation'}-sell-${rotation.from_asset}-${index}`,
        })
      }
      if (rotation.to_asset && String(rotation.to_asset).toUpperCase() !== 'CASH') {
        points[nearestIndex].tradeEvents.push({
          ...common,
          tradeSide: 'buy',
          asset: rotation.to_asset,
          markerKey: `${rotation.executed_at || 'rotation'}-buy-${rotation.to_asset}-${index}`,
        })
      }
    })
    return points
  }, [detail?.series, rotationPayload])

  const fullTimeDomain = useMemo(() => {
    if (chartRows.length < 2) return null
    const start = Number(chartRows[0]?.timestamp_value)
    const end = Number(chartRows[chartRows.length - 1]?.timestamp_value)
    if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return null
    return { start, end }
  }, [chartRows])

  const minimumTimeSpan = useMemo(() => {
    if (!fullTimeDomain) return 0
    const calculated = minimumZoomSpan(chartRows)
    const fullSpan = fullTimeDomain.end - fullTimeDomain.start
    return Math.min(fullSpan, Math.max(calculated, fullSpan / 300))
  }, [chartRows, fullTimeDomain])

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

  const visibleChartRows = useMemo(() => {
    if (!zoomActive || !effectiveZoomDomain) return chartRows
    return chartRows.filter((point) => point.timestamp_value >= effectiveZoomDomain.start && point.timestamp_value <= effectiveZoomDomain.end)
  }, [chartRows, effectiveZoomDomain, zoomActive])

  const yDomain = useMemo(() => {
    const values = visibleChartRows.flatMap((point) => [Number(point.simulation_equity), Number(point.reference_equity)])
      .filter((value) => Number.isFinite(value))
    if (!values.length) return ['auto', 'auto']
    const minimum = Math.min(...values)
    const maximum = Math.max(...values)
    const spread = maximum - minimum
    const magnitude = Math.max(Math.abs(minimum), Math.abs(maximum), 1)
    const padding = spread > 0 ? Math.max(spread * 0.08, magnitude * 0.00005) : Math.max(magnitude * 0.0002, 1)
    return [minimum - padding, maximum + padding]
  }, [visibleChartRows])

  const visibleTimeSpan = effectiveZoomDomain ? Math.max(0, effectiveZoomDomain.end - effectiveZoomDomain.start) : 0
  const zoomLevel = useMemo(() => {
    if (!zoomActive || !fullTimeDomain || !effectiveZoomDomain) return 1
    const fullSpan = fullTimeDomain.end - fullTimeDomain.start
    const visibleSpan = effectiveZoomDomain.end - effectiveZoomDomain.start
    return visibleSpan > 0 ? fullSpan / visibleSpan : 1
  }, [effectiveZoomDomain, fullTimeDomain, zoomActive])

  useEffect(() => {
    setZoomDomain(null)
    panStateRef.current = null
    setIsPanning(false)
  }, [detail?.id])

  useEffect(() => {
    const chartNode = chartInteractionRef.current
    if (!chartNode || !fullTimeDomain) return undefined

    const handleWheel = (event) => {
      if (event.deltaY === 0) return
      event.preventDefault()
      const fullSpan = fullTimeDomain.end - fullTimeDomain.start
      if (fullSpan <= 0 || minimumTimeSpan >= fullSpan) return

      const rect = chartNode.getBoundingClientRect()
      const leftInset = Math.min(74, rect.width * 0.18)
      const rightInset = Math.min(24, rect.width * 0.08)
      const plotWidth = Math.max(1, rect.width - leftInset - rightInset)
      const pointerRatio = clamp((event.clientX - rect.left - leftInset) / plotWidth, 0, 1)
      const intensity = clamp(Math.abs(event.deltaY) / 120, 0.35, 1.6)
      const factor = event.deltaY < 0 ? Math.pow(ZOOM_STEP, intensity) : Math.pow(1 / ZOOM_STEP, intensity)

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
    if (event.button !== 0 || !zoomActive || !effectiveZoomDomain || !fullTimeDomain) return
    if (event.target?.closest?.('.backtest-trade-marker-hit')) return
    const chartNode = chartInteractionRef.current
    if (!chartNode) return
    const rect = chartNode.getBoundingClientRect()
    const leftInset = Math.min(74, rect.width * 0.18)
    const rightInset = Math.min(24, rect.width * 0.08)
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
    if (event.currentTarget.hasPointerCapture?.(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId)
  }

  const historyRows = useMemo(() => {
    const normalizedQuery = historyQuery.trim().toLowerCase()
    const rows = (dashboard?.recent_backtests || []).map((item) => ({
      ...item,
      research_model_label: canRunResearchModels ? (researchExecutionModels[item.id]?.model_label || 'Baseline') : '',
    })).filter((item) => {
      if (historyStatus !== 'all' && String(item.status || '').toLowerCase() !== historyStatus) return false
      if (!normalizedQuery) return true
      const haystack = `${item.strategy_profile_name || 'Unknown test'} ${canRunResearchModels ? item.research_model_label : ''}`.toLowerCase()
      return haystack.includes(normalizedQuery)
    })
    return sortRows(rows, historySort, {
      created_at: (item) => Date.parse(item.created_at || '') || 0,
      strategy_profile_name: (item) => String(item.strategy_profile_name || 'Unknown test'),
      research_model_label: (item) => String(item.research_model_label || 'Baseline'),
      status: (item) => String(item.status || ''),
      simulation_return: (item) => item.metrics?.simulation_return == null ? null : Number(item.metrics.simulation_return),
      sharpe: (item) => item.metrics?.sharpe == null ? null : Number(item.metrics.sharpe),
      maximum_drawdown: (item) => item.metrics?.maximum_drawdown == null ? null : Number(item.metrics.maximum_drawdown),
      position_changes: (item) => item.metrics?.position_changes == null ? null : Number(item.metrics.position_changes),
      duration_seconds: (item) => item.duration_seconds == null ? null : Number(item.duration_seconds),
    })
  }, [canRunResearchModels, dashboard, historyQuery, historySort, historyStatus, researchExecutionModels])

  const historyPages = Math.max(1, Math.ceil(historyRows.length / HISTORY_PAGE_SIZE))
  const currentHistoryPage = Math.min(historyPage, historyPages)
  const paginatedHistoryRows = historyRows.slice((currentHistoryPage - 1) * HISTORY_PAGE_SIZE, currentHistoryPage * HISTORY_PAGE_SIZE)

  useEffect(() => {
    refreshDashboard()
  }, [refreshDashboard])

  useEffect(() => { setHistoryPage(1) }, [historyQuery, historySort, historyStatus])

  const savedResearchModelLabel = canRunResearchModels ? (selectedStrategyModel?.label || '') : ''
  const activeResearchModelLabel = canRunResearchModels && job?.id ? (researchExecutionModels[job.id]?.model_label || savedResearchModelLabel) : ''
  const displayedResearchModelLabel = canRunResearchModels && detail?.id ? (researchExecutionModels[detail.id]?.model_label || '') : ''
  const historyColumnCount = canRunResearchModels ? 9 : 8

  async function exportResults() {
    if (!canExportResults || !detail?.id || exporting) return
    setExporting(true)
    setExportError('')
    try {
      await downloadFile(
        `${API}/jobs/${encodeURIComponent(detail.id)}/export.zip`,
        `market_cycle_trader_${detail.id}.zip`,
      )
    } catch (requestError) {
      setExportError(requestError.message || 'Unable to export the result.')
    } finally {
      setExporting(false)
    }
  }

  return (
    <section className="page-stack backtest-page backtest-single-workspace">
      <section className="data-panel backtest-workspace-panel">
        <header className="backtest-workspace-header">
          <div className="backtest-workspace-title">
            <div className="page-title-icon"><BacktestIcon size={20} /></div>
            <div>
              <h2>{tr("Backtest")}</h2>
              <p>{tr("Execute and analyze protected historical simulations.")}</p>
              <div className="backtest-context-line" aria-live="polite">
                <span>{tr(running ? 'Evaluating' : 'Selected test')}:</span>
                <strong title={activeStrategyName}>{activeStrategyName}</strong>
                {!running && savedResearchModelLabel ? <><i>·</i><span>{tr('Saved model')}:</span><strong>{savedResearchModelLabel}</strong></> : null}
                {running && activeResearchModelLabel ? <><i>·</i><span>{tr('Model')}:</span><strong>{activeResearchModelLabel}</strong></> : null}
                {!running && detail?.strategy_profile_name ? <><i>·</i><span>{tr("Displayed:")}</span><strong title={detail.strategy_profile_name}>{detail.strategy_profile_name}</strong>{displayedResearchModelLabel ? <><i>·</i><span>{tr('Model')}:</span><strong>{displayedResearchModelLabel}</strong></> : null}</> : null}
              </div>
            </div>
          </div>
          <div className="backtest-workspace-actions">
            {canRunResearchModels ? (
              <div className="backtest-research-mode-switch" role="tablist" aria-label={tr('Research workspace')}>
                <button type="button" role="tab" aria-selected={researchWorkspaceMode === 'simulation'} className={researchWorkspaceMode === 'simulation' ? 'active' : ''} onClick={() => setResearchWorkspaceMode('simulation')}>{tr('Simulation Backtest')}</button>
                <button type="button" role="tab" aria-selected={researchWorkspaceMode === 'tuning'} className={researchWorkspaceMode === 'tuning' ? 'active' : ''} onClick={() => setResearchWorkspaceMode('tuning')}>{tr('Model Tuning')}</button>
              </div>
            ) : null}
            {canRunResearchModels && researchWorkspaceMode === 'simulation' ? (
              <div className="research-model-control research-model-readonly" aria-label={tr('Model saved with selected Strategy')}>
                <span>{tr('Saved model')}</span>
                <strong>{savedResearchModelLabel || tr('Unavailable')}</strong>
                <small>{tr('Defined in Selected Strategy')}</small>
              </div>
            ) : null}
            {researchWorkspaceMode === 'simulation' && canExportResults && detail?.metrics ? (
              <button type="button" className="secondary-action compact" onClick={exportResults} disabled={exporting}>
                {tr(exporting ? 'Exporting…' : 'Export Results')}
              </button>
            ) : null}
            {researchWorkspaceMode === 'simulation' ? <button type="button" className="primary-action compact" onClick={() => runBacktest()} disabled={startDisabled}>
              <PlayIcon /> {tr(restoringExecution ? 'Checking Execution' : startingBacktest ? 'Starting…' : running ? 'Simulation Running' : 'Start New Backtest')}
            </button> : null}
          </div>
        </header>

        {researchWorkspaceMode === 'tuning' && canRunResearchModels ? (
          <ModelTuningPanel
            onSessionExpired={onSessionExpired}
            onStrategyModelSaved={(updated) => setSelectedStrategyModel(updated?.research_model_configuration || updated?.research_model || null)}
          />
        ) : <>
        <ExecutionStatus workspace={workspace} modelLabel={activeResearchModelLabel} />
        {strategyContextError ? <div className="global-inline-message error-inline backtest-workspace-message">{tr(strategyContextError)}</div> : null}
        {exportError ? <div className="global-inline-message error-inline backtest-workspace-message">{tr(exportError)}</div> : null}
        {loadingDetail ? <div className="backtest-loading-row">{tr("Loading simulation result…")}</div> : null}

        {detail?.metrics ? (
          <>
            <section className="backtest-workspace-metrics">
              <Metric id="hint-final-capital" label={tr("Final Capital")} value={money(metrics.ending_capital)} note={tr('Initial {value}', { value: money(metrics.starting_capital) })} tone="green" hint={METRIC_HINTS.ending_capital} />
              <Metric id="hint-reference-capital" label={tr("Reference Capital")} value={money(metrics.reference_ending_capital)} note={tr('{value} total return', { value: percent(metrics.reference_return) })} tone="blue" hint={METRIC_HINTS.reference_ending_capital} />
              <Metric id="hint-cagr" label={tr("CAGR")} value={percent(metrics.cagr)} note={tr('Reference {value}', { value: percent(metrics.reference_cagr) })} tone="purple" hint={METRIC_HINTS.cagr} />
              <Metric id="hint-sharpe" label={tr("Sharpe Ratio")} value={metrics.sharpe == null ? '—' : Number(metrics.sharpe).toFixed(3)} note={tr('Reference {value}', { value: metrics.reference_sharpe == null ? '—' : Number(metrics.reference_sharpe).toFixed(3) })} tone="green" hint={METRIC_HINTS.sharpe} />
              <Metric id="hint-max-drawdown" label={tr("Max Drawdown")} value={percent(metrics.maximum_drawdown)} note={tr('Reference {value}', { value: percent(metrics.reference_maximum_drawdown) })} tone="red" hint={METRIC_HINTS.maximum_drawdown} />
              <Metric id="hint-session-win-rate" label={tr("Session Win Rate")} value={percent(metrics.session_win_rate)} note={tr('{value} market exposure', { value: percent(metrics.market_exposure) })} tone="blue" hint={METRIC_HINTS.session_win_rate} />
            </section>

            <section className="backtest-workspace-main">
              <article className="backtest-performance-section">
                <div className="backtest-section-heading backtest-chart-heading">
                  <div><span className="panel-kicker">{tr("Performance")}</span><h2>{tr("Simulation Comparison")}</h2></div>
                  <div className="backtest-chart-heading-right">
                    <div className="trade-event-legend" aria-label={tr("Backtest trade event legend")}>
                      <span><i className="buy" />{tr("Buy")}</span>
                      <span><i className="sell" />{tr("Sell")}</span>
                    </div>
                    <div className="backtest-chart-controls" aria-live="polite">
                      <span>{zoomActive ? tr('Zoom {level}× · Drag to pan', { level: zoomLevel >= 10 ? zoomLevel.toFixed(0) : zoomLevel.toFixed(1) }) : tr('Wheel to zoom · Drag to pan')}</span>
                      {zoomActive ? <button type="button" onClick={() => setZoomDomain(null)}>{tr("Reset zoom")}</button> : null}
                    </div>
                  </div>
                </div>
                <div
                  ref={chartInteractionRef}
                  className={`performance-chart backtest-performance-chart backtest-interactive-chart ${zoomActive ? 'is-zoomed' : ''} ${isPanning ? 'is-panning' : ''}`}
                  aria-label={tr("Simulation comparison chart. Use the mouse wheel to zoom. When zoomed, hold the left mouse button and drag to pan through time. Buy and sell markers use a pointer cursor.")}
                  onPointerDown={beginChartPan}
                  onPointerMove={moveChartPan}
                  onPointerUp={endChartPan}
                  onPointerCancel={endChartPan}
                >
                  <ResponsiveContainer width="100%" height="100%">
                    <ComposedChart data={visibleChartRows} margin={{ top: 18, right: 16, left: 8, bottom: 8 }}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} />
                      <XAxis
                        dataKey="timestamp_value"
                        type="number"
                        scale="time"
                        domain={effectiveZoomDomain ? [effectiveZoomDomain.start, effectiveZoomDomain.end] : ['dataMin', 'dataMax']}
                        allowDataOverflow
                        minTickGap={38}
                        tickFormatter={(value) => backtestAxisLabel(value, visibleTimeSpan)}
                      />
                      <YAxis domain={yDomain} tickFormatter={(value) => `$${Number(value).toLocaleString(getIntlLocale(), { maximumFractionDigits: 0 })}`} />
                      <Tooltip content={<BacktestChartTooltip />} cursor={{ stroke: 'rgba(157, 175, 195, .42)', strokeWidth: 1 }} />
                      <Legend />
                      <Line type="monotone" dataKey="simulation_equity" name={tr("Simulation")} dot={<BacktestTradeEventDot />} activeDot={false} strokeWidth={2.4} stroke="var(--positive)" isAnimationActive={false} />
                      <Line type="monotone" dataKey="reference_equity" name={tr("Reference")} dot={false} activeDot={false} strokeWidth={2.2} stroke="var(--accent)" isAnimationActive={false} />
                    </ComposedChart>
                  </ResponsiveContainer>
                </div>
              </article>

              <article className="backtest-results-section">
                <div className="backtest-section-heading compact">
                  <div><span className="panel-kicker">{tr("Summary")}</span><h2>{tr("Backtest Results")}</h2></div>
                </div>
                <div className="backtest-result-columns"><span>{tr("Metric")}</span><span>{tr("Simulation")}</span><span>{tr("Reference")}</span></div>
                <dl className="result-comparison-list backtest-result-list">
                  <div><dt><MetricLabel id="hint-total-return" label={tr("Total return")} hint="Total percentage change over the complete test period." /></dt><dd>{percent(metrics.simulation_return)}</dd><dd>{percent(metrics.reference_return)}</dd></div>
                  <div><dt><MetricLabel id="hint-result-cagr" label={tr("CAGR")} hint={METRIC_HINTS.cagr} /></dt><dd>{percent(metrics.cagr)}</dd><dd>{percent(metrics.reference_cagr)}</dd></div>
                  <div><dt><MetricLabel id="hint-result-sharpe" label={tr("Sharpe ratio")} hint={METRIC_HINTS.sharpe} /></dt><dd>{metrics.sharpe == null ? '—' : Number(metrics.sharpe).toFixed(3)}</dd><dd>{metrics.reference_sharpe == null ? '—' : Number(metrics.reference_sharpe).toFixed(3)}</dd></div>
                  <div><dt><MetricLabel id="hint-result-drawdown" label={tr("Max drawdown")} hint={METRIC_HINTS.maximum_drawdown} /></dt><dd>{percent(metrics.maximum_drawdown)}</dd><dd>{percent(metrics.reference_maximum_drawdown)}</dd></div>
                  <div><dt><MetricLabel id="hint-result-rotations" label={tr("Capital rotations")} hint={METRIC_HINTS.total_rotations} /></dt><dd>{metrics.position_changes == null ? '—' : Math.round(metrics.position_changes)}</dd><dd>—</dd></div>
                  <div><dt><MetricLabel id="hint-result-holding" label={tr("Avg. holding")} hint={METRIC_HINTS.average_holding_days} /></dt><dd>{metrics.average_holding_days == null ? '—' : tr('{count} days', { count: Number(metrics.average_holding_days).toFixed(1) })}</dd><dd>—</dd></div>
                </dl>
              </article>
            </section>

            <RotationPanel jobId={detail.id} payload={rotationPayload} loading={rotationLoading} error={rotationError} />
          </>
        ) : (
          <section className="backtest-workspace-section empty-result backtest-empty-result">
            <BacktestIcon size={32} />
            <h2>{tr("No completed result selected")}</h2>
            <p>{tr("Start a new backtest or review the available execution history below.")}</p>
          </section>
        )}

        <section className="backtest-workspace-section backtest-history-section">
          <div className="backtest-section-heading">
            <div><span className="panel-kicker">{tr("History")}</span><h2>{tr("Backtest History")}</h2></div>
            <span className="backtest-section-meta">{tr("Latest")}{' '}{dashboard?.recent_backtests?.length || 0} {tr("executions")}</span>
          </div>

          <ListToolbar
            query={historyQuery}
            onQueryChange={setHistoryQuery}
            placeholder={tr("Filter by test or model")}
            resultCount={historyRows.length}
            resultLabel={historyRows.length === 1 ? 'execution' : 'executions'}
          >
            <FilterButton active={historyStatus === 'all'} label={tr("All")} onClick={() => setHistoryStatus('all')}><ListFilterIcon size={14} /></FilterButton>
            <FilterButton active={historyStatus === 'completed'} label={tr("Completed")} tone="positive" onClick={() => setHistoryStatus('completed')} />
            <FilterButton active={historyStatus === 'failed'} label={tr("Failed")} tone="negative" onClick={() => setHistoryStatus('failed')} />
            <FilterButton active={historyStatus === 'interrupted'} label={tr("Interrupted")} onClick={() => setHistoryStatus('interrupted')} />
          </ListToolbar>

          <div className="table-wrap backtest-table-wrap">
            <table className="dashboard-table backtest-sortable-table">
              <thead>
                <tr>
                  <SortableHeader label={tr("Date")} field="created_at" sort={historySort} onSort={(key) => setHistorySort((current) => toggleSort(current, key))} hint={HISTORY_HINTS.created_at} />
                  <SortableHeader label={tr("Test")} field="strategy_profile_name" sort={historySort} onSort={(key) => setHistorySort((current) => toggleSort(current, key))} hint={HISTORY_HINTS.strategy_profile_name} />
                  {canRunResearchModels ? <SortableHeader label={tr("Model")} field="research_model_label" sort={historySort} onSort={(key) => setHistorySort((current) => toggleSort(current, key))} /> : null}
                  <SortableHeader label={tr("Status")} field="status" sort={historySort} onSort={(key) => setHistorySort((current) => toggleSort(current, key))} hint={HISTORY_HINTS.status} />
                  <SortableHeader label={tr("Total Return")} field="simulation_return" sort={historySort} onSort={(key) => setHistorySort((current) => toggleSort(current, key))} hint={HISTORY_HINTS.simulation_return} />
                  <SortableHeader label={tr("Sharpe Ratio")} field="sharpe" sort={historySort} onSort={(key) => setHistorySort((current) => toggleSort(current, key))} hint={HISTORY_HINTS.sharpe} />
                  <SortableHeader label={tr("Max Drawdown")} field="maximum_drawdown" sort={historySort} onSort={(key) => setHistorySort((current) => toggleSort(current, key))} hint={HISTORY_HINTS.maximum_drawdown} />
                  <SortableHeader label={tr("Rotations")} field="position_changes" sort={historySort} onSort={(key) => setHistorySort((current) => toggleSort(current, key))} hint={HISTORY_HINTS.position_changes} />
                  <SortableHeader label={tr("Duration")} field="duration_seconds" sort={historySort} onSort={(key) => setHistorySort((current) => toggleSort(current, key))} hint={HISTORY_HINTS.duration_seconds} />
                </tr>
              </thead>
              <tbody>
                {paginatedHistoryRows.length ? paginatedHistoryRows.map((item) => (
                  <tr key={item.id} className={detail?.id === item.id ? 'selected-row' : ''}>
                    <td>{shortDateTime(item.created_at)}</td>
                    <td className="backtest-name-cell" title={item.strategy_profile_name || tr('Unknown test')}>{item.strategy_profile_name || tr('Unknown test')}</td>
                    {canRunResearchModels ? <td>{item.research_model_label || tr('Baseline')}</td> : null}
                    <td><StatusBadge status={item.status} /></td>
                    <td className={item.metrics?.simulation_return == null ? '' : Number(item.metrics.simulation_return) >= 0 ? 'positive' : 'negative'}>{percent(item.metrics?.simulation_return)}</td>
                    <td>{item.metrics?.sharpe == null ? '—' : Number(item.metrics.sharpe).toFixed(3)}</td>
                    <td className="negative">{percent(item.metrics?.maximum_drawdown)}</td>
                    <td>{item.metrics?.position_changes == null ? '—' : Math.round(item.metrics.position_changes)}</td>
                    <td>{durationLabel(item.duration_seconds)}</td>
                  </tr>
                )) : <tr><td colSpan={historyColumnCount} className="empty-cell">{tr("No backtest history matches the selected filters.")}</td></tr>}
              </tbody>
            </table>
          </div>
          <Pagination page={currentHistoryPage} pages={historyPages} total={historyRows.length} pageSize={HISTORY_PAGE_SIZE} onPageChange={setHistoryPage} />
        </section>
        </>}
      </section>
    </section>
  )
}
