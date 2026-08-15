import { tr } from '../../i18n/runtime'
import { useEffect, useMemo, useRef, useState } from 'react'

import { apiFetch } from '../../api/http'
import { hasCapability } from '../../auth/capabilities'
import { API } from '../../config/env'
import { DashboardIcon, PlayIcon, ShieldIcon } from '../../shared/components/Icons'
import { money, percent, relativeTime, shortDateTime } from '../../shared/formatters'
import { clamp, minimumZoomSpan, nearestTimeSeriesIndex, timestampValue } from '../../shared/charts/timeSeries'
import { DASHBOARD_HINTS, DASHBOARD_PAGE_SIZE, NAVIGATOR_PAGE_SIZE, ZOOM_STEP } from './dashboardConfig'
import { buildCashIntervals, dashboardSortValue, statusMatchesFilter } from './dashboardUtils'
import { DashboardMetric, MarketUpdateMetric } from './components/DashboardPrimitives'
import { BacktestHistorySection } from './components/BacktestHistorySection'
import { StrategyIntelligenceSection } from './components/StrategyIntelligenceSection'
import { TradeStorySection } from './components/TradeStorySection'

export function DashboardPage({ workspace, capabilities = {}, onOpenBacktest }) {
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

  const canViewStrategyIntelligence = hasCapability(capabilities, 'dashboard.strategy_intelligence.view')
  const canRunBacktest = hasCapability(capabilities, 'backtest.start')
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
        const nearestIndex = nearestTimeSeriesIndex(points, event.timestamp)
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
      const nearestIndex = nearestTimeSeriesIndex(points, timestamp)
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
    const entryIndex = nearestTimeSeriesIndex(baseChartRows, selectedTradeStart)
    const exitIndex = nearestTimeSeriesIndex(baseChartRows, selectedTradeEnd)
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
  const forecastUsesOpportunityConfidence = Number.isFinite(Number(forecast?.opportunity_confidence))
  const forecastOpportunitySignal = forecastUsesOpportunityConfidence
    ? Number(forecast.opportunity_confidence)
    : (Number.isFinite(Number(forecast?.opportunity_probability)) ? Number(forecast.opportunity_probability) : null)
  const forecastHasOpportunity = Number.isFinite(Number(forecastOpportunitySignal))

  const decisionRows = useMemo(() => (intelligence?.decision_history?.rows || [])
    .map((row) => ({
      ...row,
      timestamp_value: timestampValue(row.decision_date || row.timestamp),
      opportunity_signal: Number.isFinite(Number(row.opportunity_confidence))
        ? Number(row.opportunity_confidence)
        : (Number.isFinite(Number(row.opportunity_probability)) ? Number(row.opportunity_probability) : null),
    }))
    .filter((row) => row.timestamp_value !== null), [intelligence?.decision_history?.rows])
  const cashIntervals = useMemo(() => buildCashIntervals(decisionRows), [decisionRows])
  const decisionSpan = decisionRows.length > 1 ? decisionRows[decisionRows.length - 1].timestamp_value - decisionRows[0].timestamp_value : 0
  const cashExitThreshold = decisionRows.find((row) => Number.isFinite(Number(row.cash_exit_threshold)))?.cash_exit_threshold ?? forecast?.cash_exit_threshold
  const cashEntryThreshold = decisionRows.find((row) => Number.isFinite(Number(row.cash_entry_threshold)))?.cash_entry_threshold ?? forecast?.cash_entry_threshold
  const decisionHasOpportunity = decisionRows.some((row) => Number.isFinite(Number(row.opportunity_signal)))
  const decisionUsesOpportunityConfidence = decisionRows.some((row) => Number.isFinite(Number(row.opportunity_confidence)))
  const opportunityThreshold = decisionRows.find((row) => Number.isFinite(Number(row.opportunity_threshold)))?.opportunity_threshold ?? forecast?.opportunity_threshold

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
            <div><h2>{tr("Dashboard")}</h2></div>
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

        <StrategyIntelligenceSection
          visible={canViewStrategyIntelligence}
          researchStrategy={researchStrategy}
          intelligenceError={intelligenceError}
          intelligenceLoading={intelligenceLoading}
          intelligence={intelligence}
          forecast={forecast}
          forecastView={forecastView}
          onForecastViewChange={setForecastView}
          forecastRows={forecastRows}
          forecastHasCashEdge={forecastHasCashEdge}
          forecastHasOpportunity={forecastHasOpportunity}
          forecastOpportunitySignal={forecastOpportunitySignal}
          forecastUsesOpportunityConfidence={forecastUsesOpportunityConfidence}
          decisionRows={decisionRows}
          decisionHasOpportunity={decisionHasOpportunity}
          decisionUsesOpportunityConfidence={decisionUsesOpportunityConfidence}
          cashIntervals={cashIntervals}
          decisionSpan={decisionSpan}
          cashExitThreshold={cashExitThreshold}
          cashEntryThreshold={cashEntryThreshold}
          opportunityThreshold={opportunityThreshold}
          tuning={tuning}
          tuningRows={tuningRows}
          tuningControlCapital={tuningControlCapital}
          tuningCandidateLoading={tuningCandidateLoading}
          tuningCandidateDetail={tuningCandidateDetail}
          tuningPreviewRows={tuningPreviewRows}
          tuningPreviewSpan={tuningPreviewSpan}
          onSelectTuningCandidate={selectTuningCandidateFromChart}
        />

        <TradeStorySection
          storyJobId={storyJobId}
          onStoryJobChange={setStoryJobId}
          completedStoryJobs={completedStoryJobs}
          storyError={storyError}
          storyLoading={storyLoading}
          storyData={storyData}
          markerMode={markerMode}
          onMarkerModeChange={setMarkerMode}
          zoomActive={zoomActive}
          zoomLevel={zoomLevel}
          isPanning={isPanning}
          onResetZoom={() => setZoomDomain(null)}
          chartInteractionRef={chartInteractionRef}
          beginChartPan={beginChartPan}
          moveChartPan={moveChartPan}
          endChartPan={endChartPan}
          chartRows={chartRows}
          visibleChartRows={visibleChartRows}
          effectiveZoomDomain={effectiveZoomDomain}
          visibleTimeSpan={visibleTimeSpan}
          yDomain={yDomain}
          selectedTradeStart={selectedTradeStart}
          selectedTradeEnd={selectedTradeEnd}
          trades={trades}
          safeTradeIndex={safeTradeIndex}
          selectPreviousTrade={selectPreviousTrade}
          selectNextTrade={selectNextTrade}
          navigatorTrades={navigatorTrades}
          navigatorStart={navigatorStart}
          onSelectTrade={setSelectedTradeIndex}
          selectedTrade={selectedTrade}
          selectedTradeView={selectedTradeView}
          onSelectedTradeViewChange={setSelectedTradeView}
          focusSelectedTrade={focusSelectedTrade}
          selectedTradeComparison={selectedTradeComparison}
          selectedTradeChartRows={selectedTradeChartRows}
          selectedTradeYDomain={selectedTradeYDomain}
        />

        <BacktestHistorySection
          filteredRows={filteredRows}
          query={query}
          onQueryChange={setQuery}
          statusFilter={statusFilter}
          onStatusFilterChange={setStatusFilter}
          statusCounts={statusCounts}
          visibleRows={visibleRows}
          storyJobId={storyJobId}
          onStoryJobChange={setStoryJobId}
          sort={sort}
          updateSort={updateSort}
          safePage={safePage}
          pages={pages}
          onPageChange={setPage}
        />
      </section>
    </section>
  )
}
