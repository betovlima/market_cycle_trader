import { getIntlLocale, tr } from '../../i18n/runtime'
import { useEffect, useMemo, useRef, useState } from 'react'
import {
  Bar,
  BarChart,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  LineChart,
  ReferenceArea,
  ReferenceDot,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'

import { apiFetch } from '../../api/http'
import { API } from '../../config/env'
import {
  ChevronLeftIcon,
  ChevronRightIcon,
  DashboardIcon,
  PlayIcon,
  SearchIcon,
  ShieldIcon,
  SortIcon,
} from '../../shared/components/Icons'
import { ParameterHint } from '../../shared/components/ParameterHint'
import { durationLabel, money, percent, relativeTime, shortDateTime } from '../../shared/formatters'

const DASHBOARD_PAGE_SIZE = 10
const NAVIGATOR_PAGE_SIZE = 10
const ZOOM_STEP = 0.84
const MIN_ZOOM_POINTS = 8
const DAY_MS = 24 * 60 * 60 * 1000
const PROBABILITY_METHOD = 'champion_probability'

const DASHBOARD_HINTS = {
  totalBacktests: {
    description: 'Total number of historical simulation executions currently available in the dashboard summary.',
    relationship: 'Completed executions are shown separately so interrupted or failed runs remain visible without inflating successful-run counts.',
  },
  bestPerformance: {
    description: 'Highest simulation return among the completed backtests available to the dashboard.',
    relationship: 'This is an execution result only. It does not expose model inputs, thresholds, signals or protected strategy parameters.',
  },
  lastBacktest: {
    description: 'Elapsed time since the most recent backtest execution was created.',
    relationship: 'The timestamp comes from the execution history and is independent of the next scheduled market refresh.',
  },
  nextMarketUpdate: {
    description: 'Countdown to the next whole-hour dashboard market refresh reference.',
    relationship: 'This is a display schedule indicator and does not trigger or change trading decisions.',
  },
  date: 'Creation time of the backtest execution.',
  status: 'Current or terminal execution state reported by the backend.',
  totalReturn: 'Total percentage return produced by the simulation for this completed execution.',
  sharpe: 'Risk-adjusted return metric reported by the completed backtest.',
  drawdown: 'Largest peak-to-trough decline observed during the simulation.',
  rotations: 'Number of position changes recorded by the completed simulation.',
  duration: 'Wall-clock time used by the backend to execute the backtest.',
  portfolioGrowth: 'Simulation equity compared with the reference equity for the selected completed backtest. Use the wheel to zoom and drag to pan through time.',
  navigator: 'Completed positions in chronological order. Select one position to connect its holding period with the portfolio curve and detailed view below.',
  selectedPosition: 'Strategy equity and Buy & Hold reference equity over the exact holding interval of the selected position. Switch between portfolio value and Indexed 100 to compare relative performance from the same starting point.',
}

function nextWholeHourTimestamp(now = new Date()) {
  const next = new Date(now)
  next.setMinutes(60, 0, 0)
  return next.getTime()
}

function secondsUntil(timestamp) {
  return Math.max(0, Math.ceil((timestamp - Date.now()) / 1000))
}

function countdownLabel(totalSeconds) {
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return [minutes, seconds].map((value) => String(value).padStart(2, '0')).join(':')
}

function nextUpdateLabel(timestamp) {
  return new Intl.DateTimeFormat(undefined, { hour: '2-digit', minute: '2-digit' }).format(new Date(timestamp))
}

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

function dashboardAxisLabel(value, visibleSpan) {
  const date = new Date(Number(value))
  if (Number.isNaN(date.getTime())) return ''
  if (visibleSpan <= DAY_MS * 2) return date.toLocaleTimeString(getIntlLocale(), { hour: '2-digit', minute: '2-digit', hour12: false })
  if (visibleSpan <= DAY_MS * 60) return date.toLocaleDateString(getIntlLocale(), { month: 'short', day: 'numeric' })
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

function dashboardSortValue(item, key) {
  if (key === 'date') return new Date(item?.created_at || 0).getTime() || 0
  if (key === 'status') return String(item?.status || '').toLocaleLowerCase()
  if (key === 'return') return Number(item?.metrics?.simulation_return ?? Number.NEGATIVE_INFINITY)
  if (key === 'sharpe') return Number(item?.metrics?.sharpe ?? Number.NEGATIVE_INFINITY)
  if (key === 'drawdown') return Number(item?.metrics?.maximum_drawdown ?? Number.NEGATIVE_INFINITY)
  if (key === 'rotations') return Number(item?.metrics?.position_changes ?? Number.NEGATIVE_INFINITY)
  if (key === 'duration') return Number(item?.duration_seconds ?? Number.NEGATIVE_INFINITY)
  return ''
}

function statusMatchesFilter(status, filter) {
  const value = String(status || '').toLocaleLowerCase()
  if (filter === 'all') return true
  if (filter === 'active') return value === 'running' || value === 'queued'
  return value === filter
}

function DashboardMetric({ id, label, value, note, tone = '', hint }) {
  return (
    <div className={`dashboard-workspace-metric ${tone}`}>
      <div className="dashboard-metric-label">
        <span>{tr(label)}</span>
        <ParameterHint id={id} title={label} description={hint?.description || ''} relationship={hint?.relationship || ''} />
      </div>
      <strong>{value}</strong>
      <small>{typeof note === 'string' ? tr(note) : note}</small>
    </div>
  )
}

function MarketUpdateMetric() {
  const [nextUpdateAt, setNextUpdateAt] = useState(() => nextWholeHourTimestamp())
  const [remaining, setRemaining] = useState(() => secondsUntil(nextWholeHourTimestamp()))

  useEffect(() => {
    const timer = window.setInterval(() => {
      const seconds = secondsUntil(nextUpdateAt)
      if (seconds <= 0) {
        const next = nextWholeHourTimestamp()
        setNextUpdateAt(next)
        setRemaining(secondsUntil(next))
        return
      }
      setRemaining(seconds)
    }, 1000)
    return () => window.clearInterval(timer)
  }, [nextUpdateAt])

  const progress = Math.max(0, Math.min(1, remaining / 3600))

  return (
    <div className="dashboard-workspace-metric dashboard-market-metric">
      <div className="dashboard-market-dial" style={{ '--clock-progress': `${progress * 360}deg` }} aria-hidden="true"><span>{countdownLabel(remaining)}</span></div>
      <div className="dashboard-market-copy">
        <div className="dashboard-metric-label">
          <span>{tr("Next Market Update")}</span>
          <ParameterHint id="dashboard-hint-market-update" title={tr("Next Market Update")} description={DASHBOARD_HINTS.nextMarketUpdate.description} relationship={DASHBOARD_HINTS.nextMarketUpdate.relationship} />
        </div>
        <strong>{countdownLabel(remaining)}</strong>
        <small>{tr("Scheduled for")}{' '}{nextUpdateLabel(nextUpdateAt)}</small>
      </div>
    </div>
  )
}

function StatusBadge({ status }) {
  return <span className={`table-status ${status || 'unknown'}`}>{tr(String(status || 'unknown').replaceAll('_', ' ').replace(/\b\w/g, (letter) => letter.toUpperCase()))}</span>
}

function DashboardSortHeader({ label, sortKey, sort, onSort, hint }) {
  const active = sort.key === sortKey
  return (
    <th>
      <div className="dashboard-sort-header">
        <button type="button" className={active ? 'active' : ''} onClick={() => onSort(sortKey)} title={tr("Sort by {label}", { label: tr(label) })}>
          <span>{tr(label)}</span><SortIcon size={14} descending={active ? sort.direction === 'desc' : true} />
        </button>
        <ParameterHint id={`dashboard-column-${sortKey}`} title={label} description={hint} />
      </div>
    </th>
  )
}

function DashboardPagination({ page, pages, total, onPageChange }) {
  const from = total ? ((page - 1) * DASHBOARD_PAGE_SIZE) + 1 : 0
  const to = Math.min(page * DASHBOARD_PAGE_SIZE, total)
  return (
    <div className="dashboard-pagination">
      <span>{total ? tr("{from}–{to} of {total}", { from, to, total }) : tr("0 results")}</span>
      <div>
        <button type="button" onClick={() => onPageChange(page - 1)} disabled={page <= 1} aria-label={tr("Previous page")} title={tr("Previous page")}><ChevronLeftIcon size={16} /></button>
        <strong>{tr("Page")}{' '}{page} {tr("of")}{' '}{pages}</strong>
        <button type="button" onClick={() => onPageChange(page + 1)} disabled={page >= pages} aria-label={tr("Next page")} title={tr("Next page")}><ChevronRightIcon size={16} /></button>
      </div>
    </div>
  )
}

function StoryTooltip({ active, payload }) {
  if (!active || !payload?.length) return null
  const point = payload.find((item) => item?.payload?.timestamp_value !== undefined)?.payload
  if (!point) return null
  const events = Array.isArray(point.tradeEvents) ? point.tradeEvents : []
  return (
    <div className="dashboard-story-tooltip">
      <strong>{shortDateTime(point.timestamp)}</strong>
      <div><span>{tr("Simulation")}</span><b>{money(point.simulation_equity)}</b></div>
      <div><span>{tr("Reference")}</span><b>{money(point.reference_equity)}</b></div>
      {events.length ? <div className="dashboard-story-tooltip-events">
        {events.slice(0, 6).map((event) => event.grouped ? (
          <p key={event.key}><b>{event.count} {tr("executions")}</b><span>{event.buyCount} {tr("buy ·")}{' '}{event.sellCount} {tr("sell")}</span></p>
        ) : (
          <p key={event.key} className={event.side}><b>{event.side.toUpperCase()} · {event.asset}</b><span>{tr("Trade #")}{event.tradeNumber}</span></p>
        ))}
      </div> : null}
    </div>
  )
}

function StoryTradeDot({ cx, cy, payload }) {
  const events = Array.isArray(payload?.tradeEvents) ? payload.tradeEvents : []
  if (!Number.isFinite(cx) || !Number.isFinite(cy) || !events.length) return null
  const grouped = events.find((event) => event.grouped)
  if (grouped) {
    return <g className="dashboard-story-group-marker" transform={`translate(${cx}, ${cy})`}>
      <circle r="11" /><text textAnchor="middle" dominantBaseline="central">{grouped.count > 99 ? '99+' : grouped.count}</text>
    </g>
  }
  let buyOffset = 0
  let sellOffset = 0
  return <g transform={`translate(${cx}, ${cy})`}>
    {events.slice(0, 6).map((event) => {
      const isBuy = event.side === 'buy'
      const offset = isBuy ? ++buyOffset : ++sellOffset
      const y = isBuy ? 8 + ((offset - 1) * 10) : -8 - ((offset - 1) * 10)
      return <circle key={event.key} cy={y} r="4.5" className={`dashboard-story-execution-dot ${event.side}`} />
    })}
  </g>
}

function SelectedTradeTooltip({ active, payload, selectedTrade, viewMode }) {
  if (!active || !payload?.length) return null
  const point = payload[0]?.payload
  if (!point) return null
  const strategyDisplay = viewMode === 'indexed' ? (Number.isFinite(Number(point.strategy_index)) ? Number(point.strategy_index).toFixed(2) : '—') : money(point.simulation_equity)
  const referenceDisplay = viewMode === 'indexed' ? (Number.isFinite(Number(point.reference_index)) ? Number(point.reference_index).toFixed(2) : '—') : money(point.reference_equity)
  return <div className="dashboard-story-tooltip dashboard-trade-comparison-tooltip">
    <strong>{selectedTrade?.asset || tr('Position')} · {shortDateTime(point.timestamp)}</strong>
    <div><span>{tr("Strategy")}</span><b>{strategyDisplay}</b></div>
    <div><span>{tr("Buy & Hold")}</span><b>{referenceDisplay}</b></div>
    <div className="dashboard-tooltip-divider"><span>{tr("Strategy change")}</span><b className={Number(point.strategy_change) >= 0 ? 'positive' : 'negative'}>{percent(point.strategy_change)}</b></div>
    <div><span>{tr("Buy & Hold change")}</span><b className={Number(point.reference_change) >= 0 ? 'positive' : 'negative'}>{percent(point.reference_change)}</b></div>
    <div><span>{tr("Excess")}</span><b className={Number(point.excess_change) >= 0 ? 'positive' : 'negative'}>{Number.isFinite(Number(point.excess_change)) ? `${Number(point.excess_change).toFixed(2)} pp` : '—'}</b></div>
  </div>
}

function tradeTone(value) {
  const number = Number(value)
  if (!Number.isFinite(number) || number === 0) return 'flat'
  return number > 0 ? 'profit' : 'loss'
}

function decimal(value, digits = 4) {
  const number = Number(value)
  return Number.isFinite(number) ? number.toFixed(digits) : '—'
}

function StrategyForecastTooltip({ active, payload }) {
  if (!active || !payload?.length) return null
  const row = payload[0]?.payload
  if (!row) return null
  return <div className="dashboard-story-tooltip dashboard-intelligence-tooltip">
    <strong>{row.asset}</strong>
    <div><span>{tr('Rank')}</span><b>#{row.rank ?? '—'}</b></div>
    <div><span>{tr('Ranking Utility')}</span><b>{decimal(row.ranking_utility)}</b></div>
    <div><span>{tr('Cash Edge')}</span><b>{decimal(row.cash_edge)}</b></div>
    <div><span>{tr('State')}</span><b>{row.is_target ? tr('TARGET') : row.is_current ? tr('CURRENT') : row.is_raw_best ? tr('BEST') : tr('WATCH')}</b></div>
  </div>
}

function DecisionTimelineTooltip({ active, payload }) {
  if (!active || !payload?.length) return null
  const row = payload[0]?.payload
  if (!row) return null
  return <div className="dashboard-story-tooltip dashboard-intelligence-tooltip wide">
    <strong>{shortDateTime(row.decision_date || row.timestamp)}</strong>
    <div><span>{tr('Current')}</span><b>{row.current_asset || row.previous_asset || 'CASH'}</b></div>
    <div><span>{tr('Decision')}</span><b>{row.final_action_asset || row.selected_asset || 'CASH'}</b></div>
    <div><span>{tr('Reason')}</span><b>{row.decision_reason || '—'}</b></div>
    <div><span>{tr('Best asset')}</span><b>{row.best_asset || row.raw_best_asset || '—'}</b></div>
    <div><span>{tr('Best utility')}</span><b>{decimal(row.best_score)}</b></div>
    <div><span>{tr('Best cash edge')}</span><b>{decimal(row.best_cash_edge)}</b></div>
    <div><span>{tr('Current cash edge')}</span><b>{decimal(row.current_cash_edge)}</b></div>
  </div>
}

function TuningTooltip({ active, payload }) {
  if (!active || !payload?.length) return null
  const row = payload[0]?.payload
  if (!row) return null
  return <div className="dashboard-story-tooltip dashboard-intelligence-tooltip">
    <strong>{row.label}</strong>
    <div><span>{tr('Status')}</span><b>{tr(row.status || 'unknown')}</b></div>
    <div><span>{tr('Ending capital')}</span><b>{money(row.ending_capital)}</b></div>
    <div><span>{tr('Sharpe')}</span><b>{decimal(row.sharpe, 3)}</b></div>
    <div><span>{tr('Max Drawdown')}</span><b>{percent(row.maximum_drawdown)}</b></div>
  </div>
}

function strategyValue(value) {
  if (value === null || value === undefined) return '—'
  if (Array.isArray(value)) return value.join(', ')
  if (typeof value === 'object') return JSON.stringify(value)
  if (typeof value === 'boolean') return value ? 'true' : 'false'
  return String(value)
}

function StrategyConfigurationGrid({ configuration, modelConfiguration }) {
  const rows = Object.entries(configuration || {}).sort(([left], [right]) => left.localeCompare(right))
  const modelRows = Object.entries(modelConfiguration || {}).sort(([left], [right]) => left.localeCompare(right))
  if (!rows.length && !modelRows.length) return null
  return <details className="dashboard-strategy-config">
    <summary>{tr('Full Strategy Configuration')}</summary>
    <div className="dashboard-strategy-config-body">
      {rows.length ? <section><h4>{tr('Strategy')}</h4><dl>{rows.map(([key, value]) => <div key={key}><dt>{key}</dt><dd>{strategyValue(value)}</dd></div>)}</dl></section> : null}
      {modelRows.length ? <section><h4>{tr('Research Model')}</h4><dl>{modelRows.map(([key, value]) => <div key={key}><dt>{key}</dt><dd>{strategyValue(value)}</dd></div>)}</dl></section> : null}
    </div>
  </details>
}

function buildCashIntervals(rows) {
  const intervals = []
  let start = null
  let end = null
  rows.forEach((row) => {
    const timestamp = timestampValue(row.decision_date || row.timestamp)
    const asset = String(row.final_action_asset || row.selected_asset || '').toUpperCase()
    if (timestamp === null) return
    if (asset === 'CASH') {
      if (start === null) start = timestamp
      end = timestamp
      return
    }
    if (start !== null) {
      intervals.push({ start, end: end ?? start })
      start = null
      end = null
    }
  })
  if (start !== null) intervals.push({ start, end: end ?? start })
  return intervals
}

export function DashboardPage({ workspace, session, onOpenBacktest, canRunBacktest = false }) {
  const { dashboard, loadingDashboard, running, restoringExecution, startingBacktest, startDisabled, runBacktest } = workspace
  const best = dashboard?.best_performance
  const last = dashboard?.last_backtest
  const recentBacktests = useMemo(() => dashboard?.recent_backtests || [], [dashboard])

  const [query, setQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [sort, setSort] = useState({ key: 'date', direction: 'desc' })
  const [page, setPage] = useState(1)

  const [storyJobs, setStoryJobs] = useState([])
  const [storyJobId, setStoryJobId] = useState('')
  const [storyData, setStoryData] = useState(null)
  const [storyLoading, setStoryLoading] = useState(false)
  const [storyError, setStoryError] = useState('')
  const [markerMode, setMarkerMode] = useState('off')
  const [selectedTradeIndex, setSelectedTradeIndex] = useState(0)
  const [selectedTradeView, setSelectedTradeView] = useState('value')
  const [zoomDomain, setZoomDomain] = useState(null)
  const [isPanning, setIsPanning] = useState(false)
  const chartInteractionRef = useRef(null)
  const panStateRef = useRef(null)

  const canViewStrategyIntelligence = ['admin', 'trader'].includes(String(session?.role || '').toLowerCase())
  const [intelligence, setIntelligence] = useState(null)
  const [intelligenceLoading, setIntelligenceLoading] = useState(false)
  const [intelligenceError, setIntelligenceError] = useState('')
  const [forecastView, setForecastView] = useState('top10')
  const [selectedTuningCandidateId, setSelectedTuningCandidateId] = useState(null)
  const [tuningCandidateDetail, setTuningCandidateDetail] = useState(null)
  const [tuningCandidateLoading, setTuningCandidateLoading] = useState(false)

  async function startBacktest() {
    const created = await runBacktest()
    if (created) onOpenBacktest()
  }

  useEffect(() => {
    let active = true
    apiFetch(`${API}/analytics/backtests?limit=200`)
      .then((payload) => { if (active) setStoryJobs(payload?.items || []) })
      .catch(() => {})
    return () => { active = false }
  }, [])

  const fallbackCompleted = useMemo(() => recentBacktests.filter((item) => String(item?.status || '').toLowerCase() === 'completed'), [recentBacktests])
  const completedStoryJobs = storyJobs.length ? storyJobs : fallbackCompleted

  useEffect(() => {
    if (!storyJobId && completedStoryJobs.length) setStoryJobId(completedStoryJobs[0].id)
  }, [completedStoryJobs, storyJobId])

  useEffect(() => {
    if (!storyJobId) {
      setStoryData(null)
      return
    }
    let active = true
    setStoryLoading(true)
    setStoryError('')
    apiFetch(`${API}/analytics/backtests/${encodeURIComponent(storyJobId)}`)
      .then((payload) => { if (active) setStoryData(payload) })
      .catch((requestError) => { if (active) setStoryError(requestError.message || 'Unable to load the trade story.') })
      .finally(() => { if (active) setStoryLoading(false) })
    return () => { active = false }
  }, [storyJobId])

  useEffect(() => {
    if (!canViewStrategyIntelligence) {
      setIntelligence(null)
      setIntelligenceError('')
      return undefined
    }
    let active = true
    let timer = null
    const load = async ({ silent = false } = {}) => {
      if (!silent) setIntelligenceLoading(true)
      try {
        const suffix = storyJobId ? `?job_id=${encodeURIComponent(storyJobId)}` : ''
        const payload = await apiFetch(`${API}/dashboard/strategy-intelligence${suffix}`)
        if (!active) return
        setIntelligence(payload)
        setIntelligenceError('')
        const tuning = payload?.tuning
        const nextCandidate = tuning?.best_candidate_id ?? tuning?.control_candidate_id ?? tuning?.candidates?.find((item) => item.status === 'completed')?.candidate_id ?? null
        setSelectedTuningCandidateId((current) => current !== null && tuning?.candidates?.some((item) => item.candidate_id === current) ? current : nextCandidate)
        if (['queued', 'running', 'stop_requested'].includes(String(tuning?.status || ''))) {
          timer = window.setTimeout(() => load({ silent: true }), 3000)
        }
      } catch (requestError) {
        if (!active) return
        setIntelligenceError(requestError.message || 'Unable to load Strategy Intelligence.')
      } finally {
        if (active && !silent) setIntelligenceLoading(false)
      }
    }
    load()
    return () => {
      active = false
      if (timer) window.clearTimeout(timer)
    }
  }, [canViewStrategyIntelligence, storyJobId])

  useEffect(() => {
    const runId = intelligence?.tuning?.id
    if (!canViewStrategyIntelligence || !runId || selectedTuningCandidateId === null || selectedTuningCandidateId === undefined) {
      setTuningCandidateDetail(null)
      return undefined
    }
    let active = true
    setTuningCandidateLoading(true)
    apiFetch(`${API}/dashboard/strategy-intelligence/tuning/${encodeURIComponent(runId)}/candidates/${encodeURIComponent(selectedTuningCandidateId)}`)
      .then((payload) => { if (active) setTuningCandidateDetail(payload) })
      .catch(() => { if (active) setTuningCandidateDetail(null) })
      .finally(() => { if (active) setTuningCandidateLoading(false) })
    return () => { active = false }
  }, [canViewStrategyIntelligence, intelligence?.tuning?.id, selectedTuningCandidateId])

  const trades = useMemo(() => storyData?.trade_explorer || [], [storyData])
  const safeTradeIndex = trades.length ? clamp(selectedTradeIndex, 0, trades.length - 1) : 0
  const selectedTrade = trades[safeTradeIndex] || null

  useEffect(() => {
    setSelectedTradeIndex(0)
    setZoomDomain(null)
    setMarkerMode('off')
    setSelectedTradeView('value')
    panStateRef.current = null
    setIsPanning(false)
  }, [storyJobId])

  useEffect(() => {
    if (selectedTradeIndex > Math.max(0, trades.length - 1)) setSelectedTradeIndex(Math.max(0, trades.length - 1))
  }, [selectedTradeIndex, trades.length])

  const baseChartRows = useMemo(() => (storyData?.equity || [])
    .map((row) => ({ ...row, timestamp_value: timestampValue(row.timestamp), tradeEvents: [] }))
    .filter((row) => row.timestamp_value !== null)
    .sort((left, right) => left.timestamp_value - right.timestamp_value), [storyData])

  const chartRows = useMemo(() => {
    const points = baseChartRows.map((row) => ({ ...row, tradeEvents: [] }))
    if (!points.length || markerMode === 'off' || !trades.length) return points

    const allEvents = []
    trades.forEach((trade) => {
      const entryAt = timestampValue(trade.entry_at)
      const exitAt = timestampValue(trade.exit_at)
      if (entryAt !== null) allEvents.push({ timestamp: entryAt, side: 'buy', asset: trade.asset, tradeNumber: trade.trade_number })
      if (exitAt !== null) allEvents.push({ timestamp: exitAt, side: 'sell', asset: trade.asset, tradeNumber: trade.trade_number })
    })

    if (markerMode === 'all') {
      allEvents.forEach((event, index) => {
        const nearestIndex = nearestChartIndex(points, event.timestamp)
        if (nearestIndex < 0) return
        points[nearestIndex].tradeEvents.push({ ...event, key: `${event.side}-${event.tradeNumber}-${index}` })
      })
      return points
    }

    const start = Number(points[0]?.timestamp_value)
    const end = Number(points[points.length - 1]?.timestamp_value)
    const span = Math.max(1, end - start)
    const bucketCount = Math.min(24, Math.max(6, Math.round(Math.sqrt(allEvents.length || 1) * 1.4)))
    const buckets = Array.from({ length: bucketCount }, () => [])
    allEvents.forEach((event) => {
      const bucket = clamp(Math.floor(((event.timestamp - start) / span) * bucketCount), 0, bucketCount - 1)
      buckets[bucket].push(event)
    })
    buckets.forEach((events, bucketIndex) => {
      if (!events.length) return
      const timestamp = events.reduce((sum, event) => sum + event.timestamp, 0) / events.length
      const nearestIndex = nearestChartIndex(points, timestamp)
      if (nearestIndex < 0) return
      points[nearestIndex].tradeEvents.push({
        grouped: true,
        count: events.length,
        buyCount: events.filter((event) => event.side === 'buy').length,
        sellCount: events.filter((event) => event.side === 'sell').length,
        key: `group-${bucketIndex}`,
      })
    })
    return points
  }, [baseChartRows, markerMode, trades])

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

  const zoomActive = Boolean(fullTimeDomain && effectiveZoomDomain && (effectiveZoomDomain.end - effectiveZoomDomain.start) < (fullTimeDomain.end - fullTimeDomain.start) * 0.995)
  const visibleChartRows = useMemo(() => {
    if (!zoomActive || !effectiveZoomDomain) return chartRows
    return chartRows.filter((point) => point.timestamp_value >= effectiveZoomDomain.start && point.timestamp_value <= effectiveZoomDomain.end)
  }, [chartRows, effectiveZoomDomain, zoomActive])

  const visibleTimeSpan = effectiveZoomDomain ? Math.max(0, effectiveZoomDomain.end - effectiveZoomDomain.start) : 0
  const zoomLevel = useMemo(() => {
    if (!zoomActive || !fullTimeDomain || !effectiveZoomDomain) return 1
    const fullSpan = fullTimeDomain.end - fullTimeDomain.start
    const visibleSpan = effectiveZoomDomain.end - effectiveZoomDomain.start
    return visibleSpan > 0 ? fullSpan / visibleSpan : 1
  }, [effectiveZoomDomain, fullTimeDomain, zoomActive])

  const yDomain = useMemo(() => {
    const values = visibleChartRows.flatMap((point) => [Number(point.simulation_equity), Number(point.reference_equity)]).filter(Number.isFinite)
    if (!values.length) return ['auto', 'auto']
    const minimum = Math.min(...values)
    const maximum = Math.max(...values)
    const spread = maximum - minimum
    const magnitude = Math.max(Math.abs(minimum), Math.abs(maximum), 1)
    const padding = spread > 0 ? Math.max(spread * 0.08, magnitude * 0.00005) : Math.max(magnitude * 0.0002, 1)
    return [minimum - padding, maximum + padding]
  }, [visibleChartRows])

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
      const ratio = clamp((event.clientX - rect.left - leftInset) / plotWidth, 0, 1)
      const current = effectiveZoomDomain || fullTimeDomain
      const currentSpan = current.end - current.start
      const requestedSpan = event.deltaY < 0 ? currentSpan * ZOOM_STEP : currentSpan / ZOOM_STEP
      const nextSpan = clamp(requestedSpan, minimumTimeSpan, fullSpan)
      if (nextSpan >= fullSpan * 0.995) {
        setZoomDomain(null)
        return
      }
      const anchor = current.start + ratio * currentSpan
      let start = anchor - ratio * nextSpan
      start = clamp(start, fullTimeDomain.start, fullTimeDomain.end - nextSpan)
      setZoomDomain({ start, end: start + nextSpan })
    }
    chartNode.addEventListener('wheel', handleWheel, { passive: false })
    return () => chartNode.removeEventListener('wheel', handleWheel)
  }, [effectiveZoomDomain, fullTimeDomain, minimumTimeSpan])

  function beginChartPan(event) {
    if (!zoomActive || event.button !== 0 || !effectiveZoomDomain || !fullTimeDomain) return
    if (event.target?.closest?.('.dashboard-story-execution-dot, .dashboard-story-group-marker')) return
    const rect = event.currentTarget.getBoundingClientRect()
    panStateRef.current = { pointerId: event.pointerId, clientX: event.clientX, width: Math.max(1, rect.width), start: effectiveZoomDomain.start, end: effectiveZoomDomain.end }
    event.currentTarget.setPointerCapture?.(event.pointerId)
    setIsPanning(true)
  }

  function moveChartPan(event) {
    const pan = panStateRef.current
    if (!pan || pan.pointerId !== event.pointerId || !fullTimeDomain) return
    const span = pan.end - pan.start
    const deltaTime = -((event.clientX - pan.clientX) / pan.width) * span
    let start = pan.start + deltaTime
    start = clamp(start, fullTimeDomain.start, fullTimeDomain.end - span)
    setZoomDomain({ start, end: start + span })
  }

  function endChartPan(event) {
    const pan = panStateRef.current
    if (!pan || pan.pointerId !== event.pointerId) return
    panStateRef.current = null
    event.currentTarget.releasePointerCapture?.(event.pointerId)
    setIsPanning(false)
  }

  const selectedTradeStart = timestampValue(selectedTrade?.entry_at)
  const selectedTradeEnd = timestampValue(selectedTrade?.exit_at)
  const selectedTradeRows = useMemo(() => {
    if (!selectedTrade || selectedTradeStart === null || selectedTradeEnd === null || !baseChartRows.length) return []
    let rows = baseChartRows.filter((row) => row.timestamp_value >= selectedTradeStart && row.timestamp_value <= selectedTradeEnd)
    if (rows.length >= 2) return rows
    const entryIndex = nearestChartIndex(baseChartRows, selectedTradeStart)
    const exitIndex = nearestChartIndex(baseChartRows, selectedTradeEnd)
    if (entryIndex < 0 || exitIndex < 0) return []
    const from = Math.max(0, Math.min(entryIndex, exitIndex) - 1)
    const to = Math.min(baseChartRows.length, Math.max(entryIndex, exitIndex) + 2)
    return baseChartRows.slice(from, to)
  }, [baseChartRows, selectedTrade, selectedTradeEnd, selectedTradeStart])

  const selectedTradeChartRows = useMemo(() => {
    if (!selectedTradeRows.length) return []
    const firstStrategy = selectedTradeRows.map((row) => Number(row.simulation_equity)).find(Number.isFinite)
    const firstReference = selectedTradeRows.map((row) => Number(row.reference_equity)).find(Number.isFinite)
    if (!Number.isFinite(firstStrategy) || !Number.isFinite(firstReference) || firstStrategy === 0 || firstReference === 0) return selectedTradeRows
    return selectedTradeRows.map((row) => {
      const strategy = Number(row.simulation_equity)
      const reference = Number(row.reference_equity)
      const strategyChange = Number.isFinite(strategy) ? (strategy / firstStrategy) - 1 : null
      const referenceChange = Number.isFinite(reference) ? (reference / firstReference) - 1 : null
      return {
        ...row,
        strategy_index: Number.isFinite(strategy) ? (strategy / firstStrategy) * 100 : null,
        reference_index: Number.isFinite(reference) ? (reference / firstReference) * 100 : null,
        strategy_change: strategyChange,
        reference_change: referenceChange,
        excess_change: Number.isFinite(strategyChange) && Number.isFinite(referenceChange) ? (strategyChange - referenceChange) * 100 : null,
      }
    })
  }, [selectedTradeRows])

  const selectedTradeComparison = useMemo(() => {
    if (selectedTradeChartRows.length < 2) return null
    const first = selectedTradeChartRows.find((row) => Number.isFinite(Number(row.strategy_change)) && Number.isFinite(Number(row.reference_change)))
    const last = [...selectedTradeChartRows].reverse().find((row) => Number.isFinite(Number(row.strategy_change)) && Number.isFinite(Number(row.reference_change)))
    if (!first || !last) return null
    const strategy = Number(last.strategy_change)
    const reference = Number(last.reference_change)
    return { strategy, reference, excess: (strategy - reference) * 100 }
  }, [selectedTradeChartRows])

  const selectedTradeYDomain = useMemo(() => {
    const keys = selectedTradeView === 'indexed' ? ['strategy_index', 'reference_index'] : ['simulation_equity', 'reference_equity']
    const values = selectedTradeChartRows.flatMap((row) => keys.map((key) => Number(row[key]))).filter(Number.isFinite)
    if (!values.length) return ['auto', 'auto']
    const minimum = Math.min(...values)
    const maximum = Math.max(...values)
    const spread = maximum - minimum
    const magnitude = Math.max(Math.abs(minimum), Math.abs(maximum), 1)
    const padding = spread > 0 ? Math.max(spread * 0.12, magnitude * 0.0005) : Math.max(magnitude * 0.002, selectedTradeView === 'indexed' ? 0.5 : 1)
    return [minimum - padding, maximum + padding]
  }, [selectedTradeChartRows, selectedTradeView])

  function focusSelectedTrade() {
    if (!fullTimeDomain || selectedTradeStart === null || selectedTradeEnd === null) return
    const fullSpan = fullTimeDomain.end - fullTimeDomain.start
    const tradeSpan = Math.max(minimumTimeSpan, selectedTradeEnd - selectedTradeStart)
    const padded = Math.min(fullSpan, Math.max(minimumTimeSpan, tradeSpan * 1.8))
    const center = (selectedTradeStart + selectedTradeEnd) / 2
    let start = center - padded / 2
    start = clamp(start, fullTimeDomain.start, fullTimeDomain.end - padded)
    if (padded >= fullSpan * 0.995) setZoomDomain(null)
    else setZoomDomain({ start, end: start + padded })
  }

  const navigatorPage = trades.length ? Math.floor(safeTradeIndex / NAVIGATOR_PAGE_SIZE) : 0
  const navigatorStart = navigatorPage * NAVIGATOR_PAGE_SIZE
  const navigatorTrades = trades.slice(navigatorStart, navigatorStart + NAVIGATOR_PAGE_SIZE)

  function selectPreviousTrade() {
    if (!trades.length) return
    setSelectedTradeIndex((current) => Math.max(0, current - 1))
  }

  function selectNextTrade() {
    if (!trades.length) return
    setSelectedTradeIndex((current) => Math.min(trades.length - 1, current + 1))
  }

  const filteredRows = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase()
    return recentBacktests
      .filter((item) => statusMatchesFilter(item.status, statusFilter))
      .filter((item) => {
        if (!needle) return true
        const searchable = [item?.status, item?.created_at, shortDateTime(item?.created_at), item?.metrics?.simulation_return, item?.metrics?.sharpe, item?.metrics?.maximum_drawdown, item?.metrics?.position_changes, item?.duration_seconds].filter((value) => value != null).join(' ').toLocaleLowerCase()
        return searchable.includes(needle)
      })
      .sort((left, right) => {
        const leftValue = dashboardSortValue(left, sort.key)
        const rightValue = dashboardSortValue(right, sort.key)
        const direction = sort.direction === 'asc' ? 1 : -1
        if (typeof leftValue === 'string' || typeof rightValue === 'string') return String(leftValue).localeCompare(String(rightValue)) * direction
        if (leftValue === rightValue) return 0
        return (leftValue < rightValue ? -1 : 1) * direction
      })
  }, [query, recentBacktests, sort, statusFilter])

  const pages = Math.max(1, Math.ceil(filteredRows.length / DASHBOARD_PAGE_SIZE))
  const safePage = Math.min(page, pages)
  const visibleRows = filteredRows.slice((safePage - 1) * DASHBOARD_PAGE_SIZE, safePage * DASHBOARD_PAGE_SIZE)

  useEffect(() => { setPage(1) }, [query, statusFilter])
  useEffect(() => { if (page > pages) setPage(pages) }, [page, pages])

  function updateSort(key) {
    setSort((current) => current.key === key ? { key, direction: current.direction === 'asc' ? 'desc' : 'asc' } : { key, direction: key === 'status' ? 'asc' : 'desc' })
    setPage(1)
  }

  const statusCounts = useMemo(() => recentBacktests.reduce((accumulator, item) => {
    const status = String(item?.status || '').toLocaleLowerCase()
    accumulator.all += 1
    if (status === 'completed') accumulator.completed += 1
    else if (status === 'interrupted') accumulator.interrupted += 1
    else if (status === 'failed') accumulator.failed += 1
    else if (status === 'running' || status === 'queued') accumulator.active += 1
    return accumulator
  }, { all: 0, completed: 0, interrupted: 0, failed: 0, active: 0 }), [recentBacktests])

  const researchStrategy = intelligence?.research_strategy || null
  const forecast = intelligence?.forecast || null
  const forecastRows = useMemo(() => {
    const rows = Array.isArray(forecast?.asset_forecast) ? forecast.asset_forecast : []
    return forecastView === 'all' ? rows : rows.slice(0, 10)
  }, [forecast?.asset_forecast, forecastView])
  const forecastHasCashEdge = forecastRows.some((row) => Number.isFinite(Number(row.cash_edge)))

  const decisionRows = useMemo(() => (intelligence?.decision_history?.rows || [])
    .map((row) => ({ ...row, timestamp_value: timestampValue(row.decision_date || row.timestamp) }))
    .filter((row) => row.timestamp_value !== null), [intelligence?.decision_history?.rows])
  const cashIntervals = useMemo(() => buildCashIntervals(decisionRows), [decisionRows])
  const decisionSpan = decisionRows.length > 1 ? decisionRows[decisionRows.length - 1].timestamp_value - decisionRows[0].timestamp_value : 0
  const cashExitThreshold = decisionRows.find((row) => Number.isFinite(Number(row.cash_exit_threshold)))?.cash_exit_threshold ?? forecast?.cash_exit_threshold
  const cashEntryThreshold = decisionRows.find((row) => Number.isFinite(Number(row.cash_entry_threshold)))?.cash_entry_threshold ?? forecast?.cash_entry_threshold

  const tuning = intelligence?.tuning || null
  const tuningRows = useMemo(() => (tuning?.candidates || [])
    .map((candidate) => ({
      candidate_id: candidate.candidate_id,
      label: candidate.is_control ? tr('Control') : `#${candidate.candidate_id}`,
      status: candidate.status,
      kind: candidate.kind,
      rank: candidate.rank,
      ending_capital: candidate.metrics?.ending_capital ?? null,
      sharpe: candidate.metrics?.sharpe ?? null,
      maximum_drawdown: candidate.metrics?.maximum_drawdown ?? null,
      eligible: candidate.metrics?.eligible,
      champion_gate_passed: candidate.champion_gate_passed,
    }))
    .filter((row) => Number.isFinite(Number(row.ending_capital)))
    .sort((left, right) => Number(left.candidate_id) - Number(right.candidate_id)), [tuning?.candidates])
  const tuningControlCapital = tuningRows.find((row) => String(row.kind) === 'control' || Number(row.candidate_id) === Number(tuning?.control_candidate_id))?.ending_capital ?? null
  const tuningPreviewRows = useMemo(() => (tuningCandidateDetail?.equity_preview || [])
    .map((row) => ({ ...row, timestamp_value: timestampValue(row.timestamp) }))
    .filter((row) => row.timestamp_value !== null), [tuningCandidateDetail?.equity_preview])
  const tuningPreviewSpan = tuningPreviewRows.length > 1 ? tuningPreviewRows[tuningPreviewRows.length - 1].timestamp_value - tuningPreviewRows[0].timestamp_value : 0

  function selectTuningCandidateFromChart(entry) {
    const id = Number(entry?.candidate_id ?? entry?.payload?.candidate_id)
    if (Number.isFinite(id)) setSelectedTuningCandidateId(id)
  }

  return (
    <section className="page-stack dashboard-single-workspace">
      <section className="data-panel dashboard-workspace-panel">
        <div className="dashboard-workspace-header">
          <div className="dashboard-workspace-title">
            <div className="page-title-icon"><DashboardIcon size={21} /></div>
            <div><h2>{tr("Dashboard")}</h2><p>{tr("Portfolio growth, trade-by-trade storytelling and recent simulation history.")}</p></div>
          </div>
          <div className="dashboard-header-actions">
            <span className="dashboard-protected-badge"><ShieldIcon size={15} />{tr("Protected configuration")}</span>
            {canRunBacktest ? <button className="primary-action compact dashboard-start-action" type="button" disabled={startDisabled} onClick={startBacktest}><PlayIcon size={14} />{tr(restoringExecution ? 'Checking Execution' : startingBacktest ? 'Starting…' : running ? 'Simulation Running' : 'Start New Backtest')}</button> : null}
          </div>
        </div>

        <div className="dashboard-workspace-metrics">
          <DashboardMetric id="dashboard-hint-total-backtests" label={tr("Total Backtests")} value={loadingDashboard ? '…' : String(dashboard?.total_backtests ?? 0)} note={tr('{count} completed', { count: dashboard?.completed_backtests ?? 0 })} tone="green" hint={DASHBOARD_HINTS.totalBacktests} />
          <DashboardMetric id="dashboard-hint-best-performance" label={tr("Best Performance")} value={best?.metrics?.simulation_return == null ? '—' : percent(best.metrics.simulation_return)} note={best?.metrics?.ending_capital == null ? tr('No completed result') : tr('Ending capital {value}', { value: money(best.metrics.ending_capital) })} tone="gold" hint={DASHBOARD_HINTS.bestPerformance} />
          <DashboardMetric id="dashboard-hint-last-backtest" label={tr("Last Backtest")} value={last?.created_at ? relativeTime(last.created_at) : '—'} note={last?.created_at ? shortDateTime(last.created_at) : tr('No execution yet')} tone="blue" hint={DASHBOARD_HINTS.lastBacktest} />
          <MarketUpdateMetric />
        </div>

        {canViewStrategyIntelligence ? <section className="dashboard-intelligence-section">
          <div className="dashboard-intelligence-heading">
            <div>
              <span className="panel-kicker">{tr('ADMIN / TRADER')}</span>
              <h2>{tr('Strategy Intelligence')}</h2>
              <p>{tr('Interactive model outlook, Risk-Off decisions and tuning research from protected server-side data.')}</p>
            </div>
            {researchStrategy ? <div className="dashboard-intelligence-strategy">
              <span>{tr('Selected Strategy')}</span>
              <strong>{researchStrategy.name}</strong>
              <small>{researchStrategy.status} · rev {researchStrategy.revision} · {researchStrategy.configuration?.strategy_mode || '—'}</small>
            </div> : null}
          </div>

          {intelligenceError ? <div className="global-inline-message error-inline dashboard-story-message">{tr(intelligenceError)}</div> : null}
          {intelligenceLoading ? <div className="dashboard-story-loading intelligence-loading"><span className="loading-ring" />{tr('Loading Strategy Intelligence…')}</div> : null}

          {!intelligenceLoading && intelligence ? <>
            <div className="dashboard-intelligence-grid">
              <article className="dashboard-intelligence-card dashboard-forecast-card">
                <div className="dashboard-intelligence-card-heading">
                  <div><span className="panel-kicker">{tr('Next Open')}</span><h3>{tr('Strategy Forecast')}</h3></div>
                  {forecast?.asset_forecast?.length > 10 ? <div className="dashboard-intelligence-toggle" role="group" aria-label={tr('Forecast assets')}>
                    <button type="button" className={forecastView === 'top10' ? 'active' : ''} onClick={() => setForecastView('top10')}>{tr('Top 10')}</button>
                    <button type="button" className={forecastView === 'all' ? 'active' : ''} onClick={() => setForecastView('all')}>{tr('All')}</button>
                  </div> : null}
                </div>
                {forecast ? <>
                  <div className="dashboard-forecast-summary">
                    <div><span>{tr('Strategy')}</span><strong>{forecast.strategy_name || '—'}</strong></div>
                    <div><span>{tr('Current')}</span><strong>{forecast.current_asset || 'CASH'}</strong></div>
                    <div><span>{tr('Target')}</span><strong>{forecast.target_asset || 'CASH'}</strong></div>
                    <div><span>{tr('Action')}</span><strong>{String(forecast.action || '—').replaceAll('_', ' ')}</strong></div>
                    <div><span>{tr('Execution')}</span><strong>{forecast.execution_session || '—'}</strong></div>
                  </div>
                  <div className="dashboard-forecast-chart" style={{ height: forecastView === 'all' ? `${Math.max(310, forecastRows.length * 25)}px` : '310px' }}>
                    {forecastRows.length ? <ResponsiveContainer width="100%" height="100%"><BarChart data={forecastRows} layout="vertical" margin={{ top: 8, right: 18, left: 4, bottom: 6 }} barGap={2}>
                      <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                      <XAxis type="number" tickFormatter={(value) => Number(value).toFixed(2)} />
                      <YAxis type="category" dataKey="asset" width={54} tick={{ fontSize: 11 }} />
                      <Tooltip content={<StrategyForecastTooltip />} />
                      <Legend />
                      <ReferenceLine x={0} strokeDasharray="4 4" />
                      <Bar dataKey="ranking_utility" name={tr('Ranking Utility')} radius={[0, 4, 4, 0]} />
                      {forecastHasCashEdge ? <Bar dataKey="cash_edge" name={tr('Cash Edge')} radius={[0, 4, 4, 0]} /> : null}
                    </BarChart></ResponsiveContainer> : <div className="dashboard-story-empty">{tr('No protected forecast has been prepared yet.')}</div>}
                  </div>
                  <div className="dashboard-forecast-thresholds">
                    <span>{tr('Cash exit')} <b>{decimal(forecast.cash_exit_threshold)}</b></span>
                    <span>{tr('Cash entry')} <b>{decimal(forecast.cash_entry_threshold)}</b></span>
                    <span>{tr('Switch margin')} <b>{decimal(forecast.effective_switch_margin)}</b></span>
                  </div>
                  {!forecastHasCashEdge ? <small className="dashboard-intelligence-note">{tr('This plan predates protected Cash Edge persistence. The next prepared Risk-Off plan will populate the Cash Edge series automatically.')}</small> : null}
                </> : <div className="dashboard-story-empty">{tr('No next-open Paper forecast is stored yet. The Dashboard does not contact Alpaca or refresh market data.')}</div>}
              </article>

              <article className="dashboard-intelligence-card dashboard-decision-card">
                <div className="dashboard-intelligence-card-heading">
                  <div><span className="panel-kicker">{tr('Selected Backtest')}</span><h3>{tr('Risk-Off Decision Timeline')}</h3></div>
                  <span className="dashboard-intelligence-count">{decisionRows.length} {tr('points')}</span>
                </div>
                <div className="dashboard-decision-chart">
                  {decisionRows.length ? <ResponsiveContainer width="100%" height="100%"><ComposedChart data={decisionRows} margin={{ top: 12, right: 16, left: 4, bottom: 6 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} />
                    <XAxis dataKey="timestamp_value" type="number" scale="time" domain={['dataMin', 'dataMax']} minTickGap={38} tickFormatter={(value) => dashboardAxisLabel(value, decisionSpan)} />
                    <YAxis tickFormatter={(value) => Number(value).toFixed(2)} />
                    <Tooltip content={<DecisionTimelineTooltip />} />
                    <Legend />
                    {cashIntervals.map((interval, index) => <ReferenceArea key={`${interval.start}-${index}`} x1={interval.start} x2={interval.end} className="dashboard-cash-area" ifOverflow="extendDomain" />)}
                    {Number.isFinite(Number(cashExitThreshold)) ? <ReferenceLine y={Number(cashExitThreshold)} strokeDasharray="3 4" label={{ value: tr('Cash exit'), position: 'insideTopRight', fontSize: 10 }} /> : null}
                    {Number.isFinite(Number(cashEntryThreshold)) && Number(cashEntryThreshold) !== Number(cashExitThreshold) ? <ReferenceLine y={Number(cashEntryThreshold)} strokeDasharray="6 4" label={{ value: tr('Cash entry'), position: 'insideBottomRight', fontSize: 10 }} /> : null}
                    <Line type="monotone" dataKey="best_score" name={tr('Best Utility')} dot={false} activeDot={{ r: 4 }} strokeWidth={2.1} isAnimationActive={false} />
                    <Line type="monotone" dataKey="best_cash_edge" name={tr('Best Cash Edge')} dot={false} activeDot={{ r: 4 }} strokeWidth={2.1} isAnimationActive={false} connectNulls />
                    <Line type="monotone" dataKey="current_cash_edge" name={tr('Current Cash Edge')} dot={false} activeDot={{ r: 4 }} strokeWidth={1.6} strokeDasharray="5 4" isAnimationActive={false} connectNulls />
                  </ComposedChart></ResponsiveContainer> : <div className="dashboard-story-empty">{tr('The selected backtest has no protected decision diagnostics.')}</div>}
                </div>
                <div className="dashboard-decision-legend-note"><span className="cash-swatch" />{tr('Shaded periods indicate decisions whose resulting state is CASH.')}</div>
              </article>
            </div>

            {researchStrategy ? <StrategyConfigurationGrid configuration={researchStrategy.configuration} modelConfiguration={researchStrategy.research_model_configuration} /> : null}

            <article className="dashboard-intelligence-card dashboard-tuning-card">
              <div className="dashboard-intelligence-card-heading">
                <div><span className="panel-kicker">{tr('Research')}</span><h3>{tr('Model Tuning Candidates')}</h3><p>{tr('Click a completed Candidate bar to inspect its retained portfolio curve.')}</p></div>
                {tuning ? <div className="dashboard-tuning-status"><strong>{String(tuning.method || '').replaceAll('_', ' ')}</strong><span>{tr(tuning.status)} · {Number(tuning.progress || 0).toFixed(0)}%</span>{tuning.method === PROBABILITY_METHOD && tuning.probability_state ? <small>{tr('Champion')} #{tuning.probability_state.last_champion_candidate_id ?? tuning.probability_anchor?.candidate_id ?? 0} · {tr('Trust region')} {(Number(tuning.probability_state.trust_region_radius || 0) * 100).toFixed(1)}% · {tr('Adaptive trials')} {tuning.probability_state.adaptive_trials_completed || 0}</small> : null}</div> : null}
              </div>
              {tuning && tuningRows.length ? <div className="dashboard-tuning-layout">
                <div className="dashboard-tuning-performance-chart">
                  <ResponsiveContainer width="100%" height="100%"><BarChart data={tuningRows} margin={{ top: 12, right: 12, left: 6, bottom: 6 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} />
                    <XAxis dataKey="label" interval={0} tick={{ fontSize: 10 }} />
                    <YAxis tickFormatter={(value) => `$${Number(value).toLocaleString(getIntlLocale(), { notation: 'compact', maximumFractionDigits: 1 })}`} />
                    <Tooltip content={<TuningTooltip />} />
                    {Number.isFinite(Number(tuningControlCapital)) ? <ReferenceLine y={Number(tuningControlCapital)} strokeDasharray="5 4" label={{ value: tr('Control'), position: 'insideTopRight', fontSize: 10 }} /> : null}
                    <Bar dataKey="ending_capital" name={tr('Ending Capital')} radius={[4, 4, 0, 0]} onClick={selectTuningCandidateFromChart} className="dashboard-tuning-candidate-bar" />
                  </BarChart></ResponsiveContainer>
                </div>

                <div className="dashboard-tuning-candidate-panel">
                  {tuningCandidateLoading ? <div className="dashboard-story-loading compact"><span className="loading-ring" />{tr('Loading Candidate…')}</div> : tuningCandidateDetail ? <>
                    <div className="dashboard-tuning-candidate-title"><div><span>{tuningCandidateDetail.is_control ? tr('Control') : `${tr('Candidate')} #${tuningCandidateDetail.candidate_id}`}</span><strong>{money(tuningCandidateDetail.metrics?.ending_capital)}</strong></div><small>{tr(tuningCandidateDetail.status)} · Sharpe {decimal(tuningCandidateDetail.metrics?.sharpe, 3)} · DD {percent(tuningCandidateDetail.metrics?.maximum_drawdown)}</small></div>
                    <div className="dashboard-tuning-preview-chart">
                      {tuningPreviewRows.length ? <ResponsiveContainer width="100%" height="100%"><LineChart data={tuningPreviewRows} margin={{ top: 8, right: 10, left: 4, bottom: 4 }}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} />
                        <XAxis dataKey="timestamp_value" type="number" scale="time" domain={['dataMin', 'dataMax']} minTickGap={28} tickFormatter={(value) => dashboardAxisLabel(value, tuningPreviewSpan)} />
                        <YAxis tickFormatter={(value) => `$${Number(value).toLocaleString(getIntlLocale(), { notation: 'compact', maximumFractionDigits: 1 })}`} />
                        <Tooltip formatter={(value) => money(value)} labelFormatter={(value) => shortDateTime(new Date(Number(value)).toISOString())} />
                        <Legend />
                        <Line type="monotone" dataKey="simulation_equity" name={tr('Candidate')} dot={false} strokeWidth={2.2} isAnimationActive={false} />
                        <Line type="monotone" dataKey="reference_equity" name={tr('Buy & Hold')} dot={false} strokeWidth={1.8} isAnimationActive={false} />
                      </LineChart></ResponsiveContainer> : <div className="dashboard-story-empty compact">{tr('No compact curve was retained for this older Candidate. New Candidates retain a visual preview before raw tuning artifacts are deleted.')}</div>}
                    </div>
                    {tuningCandidateDetail.settings && Object.keys(tuningCandidateDetail.settings).length ? <details className="dashboard-candidate-settings"><summary>{tr('Candidate hyperparameters')}</summary><dl>{Object.entries(tuningCandidateDetail.settings).sort(([a], [b]) => a.localeCompare(b)).map(([key, value]) => <div key={key}><dt>{key}</dt><dd>{strategyValue(value)}</dd></div>)}</dl></details> : null}
                  </> : <div className="dashboard-story-empty compact">{tr('Select a completed Candidate in the chart.')}</div>}
                </div>
              </div> : <div className="dashboard-story-empty compact">{tr('No completed tuning Candidate is available for the selected Strategy.')}</div>}
            </article>
          </> : null}
        </section> : null}

        <section className="dashboard-story-section">
          <div className="dashboard-story-heading">
            <div>
              <div className="dashboard-heading-title"><span className="panel-kicker">{tr("Trade Story")}</span><ParameterHint id="dashboard-hint-portfolio-growth" title={tr("Portfolio Growth")} description={DASHBOARD_HINTS.portfolioGrowth} /></div>
              <h2>{tr("Portfolio Growth")}</h2>
              <p>{tr("Start with a clean equity curve, then inspect executions only when you need them.")}</p>
            </div>
            <label className="dashboard-story-select"><span>{tr("Completed backtest")}</span><select value={storyJobId} onChange={(event) => setStoryJobId(event.target.value)}>{completedStoryJobs.length ? completedStoryJobs.map((item) => <option key={item.id} value={item.id}>{shortDateTime(item.created_at)}</option>) : <option value="">{tr("No completed backtest")}</option>}</select></label>
          </div>

          {storyError ? <div className="global-inline-message error-inline dashboard-story-message">{tr(storyError)}</div> : null}
          {storyLoading ? <div className="dashboard-story-loading"><span className="loading-ring" />{tr("Loading trade story…")}</div> : null}

          {!storyLoading && storyData ? <>
            <div className="dashboard-growth-toolbar">
              <div className="dashboard-marker-modes" role="group" aria-label={tr("Execution marker display")}>
                <span>{tr("Executions")}</span>
                {['off', 'grouped', 'all'].map((mode) => <button key={mode} type="button" className={markerMode === mode ? 'active' : ''} onClick={() => setMarkerMode(mode)}>{tr(mode === 'off' ? 'Off' : mode === 'grouped' ? 'Grouped' : 'All')}</button>)}
              </div>
              <div className="dashboard-growth-zoom"><span>{zoomActive ? tr('Zoom {level}× · drag to pan', { level: zoomLevel >= 10 ? zoomLevel.toFixed(0) : zoomLevel.toFixed(1) }) : tr('Wheel to zoom · drag to pan after zoom')}</span>{zoomActive ? <button type="button" onClick={() => setZoomDomain(null)}>{tr("Reset zoom")}</button> : null}</div>
            </div>

            <div ref={chartInteractionRef} className={`dashboard-growth-chart dashboard-story-interactive ${zoomActive ? 'is-zoomed' : ''} ${isPanning ? 'is-panning' : ''}`} onPointerDown={beginChartPan} onPointerMove={moveChartPan} onPointerUp={endChartPan} onPointerCancel={endChartPan}>
              {chartRows.length ? <ResponsiveContainer width="100%" height="100%"><ComposedChart data={visibleChartRows} margin={{ top: 16, right: 16, left: 8, bottom: 6 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="timestamp_value" type="number" scale="time" domain={effectiveZoomDomain ? [effectiveZoomDomain.start, effectiveZoomDomain.end] : ['dataMin', 'dataMax']} allowDataOverflow minTickGap={38} tickFormatter={(value) => dashboardAxisLabel(value, visibleTimeSpan)} />
                <YAxis domain={yDomain} tickFormatter={(value) => `$${Number(value).toLocaleString(getIntlLocale(), { maximumFractionDigits: 0 })}`} />
                <Tooltip content={<StoryTooltip />} cursor={{ stroke: 'rgba(157, 175, 195, .42)', strokeWidth: 1 }} />
                <Legend />
                {selectedTradeStart !== null && selectedTradeEnd !== null ? <ReferenceArea x1={selectedTradeStart} x2={selectedTradeEnd} className="dashboard-selected-trade-area" ifOverflow="extendDomain" /> : null}
                <Line type="monotone" dataKey="simulation_equity" name="Simulation" dot={markerMode === 'off' ? false : <StoryTradeDot />} activeDot={false} strokeWidth={2.5} stroke="var(--positive)" isAnimationActive={false} />
                <Line type="monotone" dataKey="reference_equity" name="Reference" dot={false} activeDot={false} strokeWidth={2.1} stroke="var(--accent)" isAnimationActive={false} />
              </ComposedChart></ResponsiveContainer> : <div className="dashboard-story-empty">{tr("No equity history is available for this completed backtest.")}</div>}
            </div>

            <div className="dashboard-navigator-header">
              <div>
                <div className="dashboard-heading-title"><span className="panel-kicker">{tr("Sequence")}</span><ParameterHint id="dashboard-hint-trade-navigator" title={tr("Trade Navigator")} description={DASHBOARD_HINTS.navigator} /></div>
                <h2>{tr("Trade Navigator")}</h2>
              </div>
              <div className="dashboard-navigator-actions">
                <button type="button" onClick={selectPreviousTrade} disabled={!trades.length || safeTradeIndex <= 0}><ChevronLeftIcon size={16} />{tr("Previous")}</button>
                <strong>{trades.length ? tr('Trade {current} of {total}', { current: safeTradeIndex + 1, total: trades.length }) : tr('No completed positions')}</strong>
                <button type="button" onClick={selectNextTrade} disabled={!trades.length || safeTradeIndex >= trades.length - 1}>{tr("Next")}<ChevronRightIcon size={16} /></button>
              </div>
            </div>

            <div className="dashboard-trade-navigator">
              {navigatorTrades.length ? navigatorTrades.map((trade, offset) => {
                const absoluteIndex = navigatorStart + offset
                const tone = tradeTone(trade.position_return)
                return <button key={`${trade.trade_number}-${trade.asset}-${trade.exit_at}`} type="button" className={`dashboard-trade-chip ${tone} ${absoluteIndex === safeTradeIndex ? 'active' : ''}`} onClick={() => setSelectedTradeIndex(absoluteIndex)}>
                  <small>#{trade.trade_number}</small><strong>{trade.asset}</strong><span>{percent(trade.position_return)}</span><i>{trade.holding_days == null ? '—' : `${Number(trade.holding_days).toFixed(0)}d`}</i>
                </button>
              }) : <div className="dashboard-story-empty compact">{tr("No completed positions are available for this backtest.")}</div>}
            </div>

            {selectedTrade ? <section className="dashboard-selected-trade-section">
              <article className="dashboard-selected-trade-chart-panel">
                <div className="dashboard-selected-trade-heading">
                  <div><div className="dashboard-heading-title"><span className="panel-kicker">{tr("Trade Evolution")}</span><ParameterHint id="dashboard-hint-selected-position" title={tr("Trade Evolution")} description={DASHBOARD_HINTS.selectedPosition} /></div><h2>{selectedTrade.asset} {tr("· Trade #")}{selectedTrade.trade_number}</h2></div>
                  <div className="dashboard-selected-trade-actions">
                    <div className="dashboard-trade-view-toggle" role="group" aria-label={tr("Trade evolution view")}>
                      <button type="button" className={selectedTradeView === 'value' ? 'active' : ''} onClick={() => setSelectedTradeView('value')}>{tr("Portfolio Value")}</button>
                      <button type="button" className={selectedTradeView === 'indexed' ? 'active' : ''} onClick={() => setSelectedTradeView('indexed')}>{tr("Indexed 100")}</button>
                    </div>
                    <button type="button" className="dashboard-focus-trade-button" onClick={focusSelectedTrade}>{tr("Focus on Portfolio Growth")}</button>
                  </div>
                </div>
                <div className="dashboard-trade-comparison-strip">
                  <div><span>{tr("Strategy period")}</span><strong className={(selectedTradeComparison?.strategy ?? 0) >= 0 ? 'positive' : 'negative'}>{selectedTradeComparison ? percent(selectedTradeComparison.strategy) : '—'}</strong></div>
                  <div><span>{tr("Buy & Hold")}</span><strong className={(selectedTradeComparison?.reference ?? 0) >= 0 ? 'positive' : 'negative'}>{selectedTradeComparison ? percent(selectedTradeComparison.reference) : '—'}</strong></div>
                  <div><span>{tr("Excess")}</span><strong className={(selectedTradeComparison?.excess ?? 0) >= 0 ? 'positive' : 'negative'}>{selectedTradeComparison ? `${selectedTradeComparison.excess.toFixed(2)} pp` : '—'}</strong></div>
                  <div><span>{tr("Holding")}</span><strong>{selectedTrade.holding_days == null ? '—' : tr('{count} days', { count: Number(selectedTrade.holding_days).toFixed(1) })}</strong></div>
                </div>
                <div className="dashboard-selected-trade-chart">
                  {selectedTradeChartRows.length ? <ResponsiveContainer width="100%" height="100%"><LineChart data={selectedTradeChartRows} margin={{ top: 14, right: 18, left: 8, bottom: 6 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} />
                    <XAxis dataKey="timestamp_value" type="number" scale="time" domain={['dataMin', 'dataMax']} minTickGap={34} tickFormatter={(value) => dashboardAxisLabel(value, Math.max(0, (selectedTradeEnd || 0) - (selectedTradeStart || 0)))} />
                    <YAxis domain={selectedTradeYDomain} tickFormatter={(value) => selectedTradeView === 'indexed' ? Number(value).toFixed(1) : `$${Number(value).toLocaleString(getIntlLocale(), { maximumFractionDigits: 0 })}`} />
                    <Tooltip content={<SelectedTradeTooltip selectedTrade={selectedTrade} viewMode={selectedTradeView} />} />
                    <Legend verticalAlign="top" height={24} />
                    {selectedTradeStart !== null && selectedTradeEnd !== null ? <ReferenceArea x1={selectedTradeStart} x2={selectedTradeEnd} className="dashboard-trade-holding-area" ifOverflow="extendDomain" /> : null}
                    <Line type="monotone" dataKey={selectedTradeView === 'indexed' ? 'strategy_index' : 'simulation_equity'} name={tr("Strategy")} dot={false} activeDot={{ r: 4 }} strokeWidth={2.6} stroke="var(--positive)" isAnimationActive={false} />
                    <Line type="monotone" dataKey={selectedTradeView === 'indexed' ? 'reference_index' : 'reference_equity'} name={tr("Buy & Hold")} dot={false} activeDot={{ r: 4 }} strokeWidth={2.2} stroke="var(--accent)" isAnimationActive={false} />
                    {selectedTradeStart !== null ? <ReferenceDot x={selectedTradeStart} y={selectedTradeChartRows[nearestChartIndex(selectedTradeChartRows, selectedTradeStart)]?.[selectedTradeView === 'indexed' ? 'strategy_index' : 'simulation_equity']} r={5} className="dashboard-entry-dot" ifOverflow="visible" /> : null}
                    {selectedTradeEnd !== null ? <ReferenceDot x={selectedTradeEnd} y={selectedTradeChartRows[nearestChartIndex(selectedTradeChartRows, selectedTradeEnd)]?.[selectedTradeView === 'indexed' ? 'strategy_index' : 'simulation_equity']} r={5} className="dashboard-exit-dot" ifOverflow="visible" /> : null}
                  </LineChart></ResponsiveContainer> : <div className="dashboard-story-empty">{tr("No portfolio or reference points were stored inside this holding interval.")}</div>}
                </div>
              </article>

              <aside className="dashboard-selected-trade-details">
                <div className="dashboard-trade-detail-hero"><span>{selectedTrade.asset}</span><strong className={tradeTone(selectedTrade.position_return)}>{percent(selectedTrade.position_return)}</strong><small>{money(selectedTrade.realized_pnl)} {tr("realized P/L")}</small></div>
                <dl>
                  <div><dt>{tr("Entry")}</dt><dd>{shortDateTime(selectedTrade.entry_at)}</dd></div>
                  <div><dt>{tr("Exit")}</dt><dd>{shortDateTime(selectedTrade.exit_at)}</dd></div>
                  <div><dt>{tr("Holding")}</dt><dd>{selectedTrade.holding_days == null ? '—' : tr('{count} days', { count: Number(selectedTrade.holding_days).toFixed(1) })}</dd></div>
                  <div><dt>{tr("Entry price")}</dt><dd>{selectedTrade.entry_price == null ? '—' : money(selectedTrade.entry_price)}</dd></div>
                  <div><dt>{tr("Exit price")}</dt><dd>{selectedTrade.exit_price == null ? '—' : money(selectedTrade.exit_price)}</dd></div>
                  <div><dt>{tr("Quantity")}</dt><dd>{selectedTrade.quantity == null ? '—' : Number(selectedTrade.quantity).toLocaleString(getIntlLocale(), { maximumFractionDigits: 6 })}</dd></div>
                  <div><dt>{tr("Fees")}</dt><dd>{money(selectedTrade.transaction_fees)}</dd></div>
                  <div><dt>{tr("Next asset")}</dt><dd>{selectedTrade.final_liquidation ? tr('Final liquidation') : selectedTrade.next_asset || 'CASH'}</dd></div>
                </dl>
              </aside>
            </section> : null}
          </> : null}
        </section>

        <section className="dashboard-history-section">
          <div className="dashboard-section-heading"><div><span className="panel-kicker">{tr("History")}</span><h2>{tr("Recent Backtests")}</h2><p>{tr("Filter, sort and review recent simulation executions without expanding the page vertically.")}</p></div><span className="panel-count">{filteredRows.length} {tr(filteredRows.length === 1 ? "result" : "results")}</span></div>
          <div className="dashboard-history-toolbar">
            <label className="dashboard-list-search"><SearchIcon size={15} /><input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder={tr("Filter execution history")} aria-label={tr("Filter execution history")} /></label>
            <div className="dashboard-status-filters" role="group" aria-label={tr("Backtest status filter")}>
              {[['all', 'All'], ['completed', 'Completed'], ['interrupted', 'Interrupted'], ['failed', 'Failed'], ['active', 'Active']].map(([value, label]) => <button key={value} type="button" className={statusFilter === value ? 'active' : ''} onClick={() => setStatusFilter(value)}>{tr(label)}<span>{statusCounts[value]}</span></button>)}
            </div>
          </div>
          <div className="table-wrap dashboard-history-table-wrap">
            <table className="dashboard-table dashboard-sortable-table">
              <thead><tr>
                <DashboardSortHeader label={tr("Date")} sortKey="date" sort={sort} onSort={updateSort} hint={DASHBOARD_HINTS.date} />
                <DashboardSortHeader label={tr("Status")} sortKey="status" sort={sort} onSort={updateSort} hint={DASHBOARD_HINTS.status} />
                <DashboardSortHeader label={tr("Total Return")} sortKey="return" sort={sort} onSort={updateSort} hint={DASHBOARD_HINTS.totalReturn} />
                <DashboardSortHeader label={tr("Sharpe Ratio")} sortKey="sharpe" sort={sort} onSort={updateSort} hint={DASHBOARD_HINTS.sharpe} />
                <DashboardSortHeader label={tr("Max Drawdown")} sortKey="drawdown" sort={sort} onSort={updateSort} hint={DASHBOARD_HINTS.drawdown} />
                <DashboardSortHeader label={tr("Rotations")} sortKey="rotations" sort={sort} onSort={updateSort} hint={DASHBOARD_HINTS.rotations} />
                <DashboardSortHeader label={tr("Duration")} sortKey="duration" sort={sort} onSort={updateSort} hint={DASHBOARD_HINTS.duration} />
              </tr></thead>
              <tbody>{visibleRows.length ? visibleRows.map((item) => <tr key={item.id} className={item.id === storyJobId ? 'selected-row' : ''} onDoubleClick={() => { if (String(item.status || '').toLowerCase() === 'completed') setStoryJobId(item.id) }} title={String(item.status || '').toLowerCase() === 'completed' ? tr('Double-click to load this backtest in Trade Story') : ''}>
                <td>{shortDateTime(item.created_at)}</td><td><StatusBadge status={item.status} /></td><td className={item.metrics?.simulation_return == null ? '' : Number(item.metrics.simulation_return) >= 0 ? 'positive' : 'negative'}>{percent(item.metrics?.simulation_return)}</td><td>{item.metrics?.sharpe == null ? '—' : Number(item.metrics.sharpe).toFixed(3)}</td><td className={item.metrics?.maximum_drawdown == null ? '' : 'negative'}>{percent(item.metrics?.maximum_drawdown)}</td><td>{item.metrics?.position_changes == null ? '—' : Math.round(item.metrics.position_changes)}</td><td>{durationLabel(item.duration_seconds)}</td>
              </tr>) : <tr><td colSpan="7" className="empty-cell">{tr("No backtests match the current filters.")}</td></tr>}</tbody>
            </table>
          </div>
          <DashboardPagination page={safePage} pages={pages} total={filteredRows.length} onPageChange={setPage} />
        </section>
      </section>
    </section>
  )
}
