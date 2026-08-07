import { useEffect, useMemo, useState } from 'react'

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
        <span>{label}</span>
        <ParameterHint
          id={id}
          title={label}
          description={hint?.description || ''}
          relationship={hint?.relationship || ''}
        />
      </div>
      <strong>{value}</strong>
      <small>{note}</small>
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
      <div className="dashboard-market-dial" style={{ '--clock-progress': `${progress * 360}deg` }} aria-hidden="true">
        <span>{countdownLabel(remaining)}</span>
      </div>
      <div className="dashboard-market-copy">
        <div className="dashboard-metric-label">
          <span>Next Market Update</span>
          <ParameterHint
            id="dashboard-hint-market-update"
            title="Next Market Update"
            description={DASHBOARD_HINTS.nextMarketUpdate.description}
            relationship={DASHBOARD_HINTS.nextMarketUpdate.relationship}
          />
        </div>
        <strong>{countdownLabel(remaining)}</strong>
        <small>Scheduled for {nextUpdateLabel(nextUpdateAt)}</small>
      </div>
    </div>
  )
}

function StatusBadge({ status }) {
  return <span className={`table-status ${status || 'unknown'}`}>{String(status || 'unknown').replace('_', ' ')}</span>
}

function DashboardSortHeader({ label, sortKey, sort, onSort, hint }) {
  const active = sort.key === sortKey
  return (
    <th>
      <div className="dashboard-sort-header">
        <button type="button" className={active ? 'active' : ''} onClick={() => onSort(sortKey)} title={`Sort by ${label}`}>
          <span>{label}</span>
          <SortIcon size={14} descending={active ? sort.direction === 'desc' : true} />
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
      <span>{total ? `${from}–${to} of ${total}` : '0 results'}</span>
      <div>
        <button type="button" onClick={() => onPageChange(page - 1)} disabled={page <= 1} aria-label="Previous page" title="Previous page"><ChevronLeftIcon size={16} /></button>
        <strong>Page {page} of {pages}</strong>
        <button type="button" onClick={() => onPageChange(page + 1)} disabled={page >= pages} aria-label="Next page" title="Next page"><ChevronRightIcon size={16} /></button>
      </div>
    </div>
  )
}

export function DashboardPage({ workspace, onOpenBacktest, canRunBacktest = false }) {
  const { dashboard, loadingDashboard, running, restoringExecution, startingBacktest, startDisabled, runBacktest } = workspace
  const best = dashboard?.best_performance
  const last = dashboard?.last_backtest
  const recentBacktests = useMemo(() => dashboard?.recent_backtests || [], [dashboard])
  const [query, setQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [sort, setSort] = useState({ key: 'date', direction: 'desc' })
  const [page, setPage] = useState(1)

  async function startBacktest() {
    const created = await runBacktest()
    if (created) onOpenBacktest()
  }

  const filteredRows = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase()
    return recentBacktests
      .filter((item) => statusMatchesFilter(item.status, statusFilter))
      .filter((item) => {
        if (!needle) return true
        const searchable = [
          item?.status,
          item?.created_at,
          shortDateTime(item?.created_at),
          item?.metrics?.simulation_return,
          item?.metrics?.sharpe,
          item?.metrics?.maximum_drawdown,
          item?.metrics?.position_changes,
          item?.duration_seconds,
        ].filter((value) => value != null).join(' ').toLocaleLowerCase()
        return searchable.includes(needle)
      })
      .sort((left, right) => {
        const leftValue = dashboardSortValue(left, sort.key)
        const rightValue = dashboardSortValue(right, sort.key)
        const direction = sort.direction === 'asc' ? 1 : -1
        if (typeof leftValue === 'string' || typeof rightValue === 'string') {
          return String(leftValue).localeCompare(String(rightValue)) * direction
        }
        if (leftValue === rightValue) return 0
        return (leftValue < rightValue ? -1 : 1) * direction
      })
  }, [query, recentBacktests, sort, statusFilter])

  const pages = Math.max(1, Math.ceil(filteredRows.length / DASHBOARD_PAGE_SIZE))
  const safePage = Math.min(page, pages)
  const visibleRows = filteredRows.slice((safePage - 1) * DASHBOARD_PAGE_SIZE, safePage * DASHBOARD_PAGE_SIZE)

  useEffect(() => {
    setPage(1)
  }, [query, statusFilter])

  useEffect(() => {
    if (page > pages) setPage(pages)
  }, [page, pages])

  function updateSort(key) {
    setSort((current) => current.key === key
      ? { key, direction: current.direction === 'asc' ? 'desc' : 'asc' }
      : { key, direction: key === 'status' ? 'asc' : 'desc' })
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

  return (
    <section className="page-stack dashboard-single-workspace">
      <section className="data-panel dashboard-workspace-panel">
        <div className="dashboard-workspace-header">
          <div className="dashboard-workspace-title">
            <div className="page-title-icon"><DashboardIcon size={21} /></div>
            <div>
              <h2>Dashboard</h2>
              <p>Protected simulation overview, execution health and recent backtest history.</p>
            </div>
          </div>
          <div className="dashboard-header-actions">
            <span className="dashboard-protected-badge"><ShieldIcon size={15} />Protected configuration</span>
            {canRunBacktest ? (
              <button className="primary-action compact dashboard-start-action" type="button" disabled={startDisabled} onClick={startBacktest}>
                <PlayIcon size={14} />
                {restoringExecution ? 'Checking Execution' : startingBacktest ? 'Starting…' : running ? 'Simulation Running' : 'Start New Backtest'}
              </button>
            ) : null}
          </div>
        </div>

        <div className="dashboard-workspace-metrics">
          <DashboardMetric
            id="dashboard-hint-total-backtests"
            label="Total Backtests"
            value={loadingDashboard ? '…' : String(dashboard?.total_backtests ?? 0)}
            note={`${dashboard?.completed_backtests ?? 0} completed`}
            tone="green"
            hint={DASHBOARD_HINTS.totalBacktests}
          />
          <DashboardMetric
            id="dashboard-hint-best-performance"
            label="Best Performance"
            value={best?.metrics?.simulation_return == null ? '—' : percent(best.metrics.simulation_return)}
            note={best?.metrics?.ending_capital == null ? 'No completed result' : `Ending capital ${money(best.metrics.ending_capital)}`}
            tone="gold"
            hint={DASHBOARD_HINTS.bestPerformance}
          />
          <DashboardMetric
            id="dashboard-hint-last-backtest"
            label="Last Backtest"
            value={last?.created_at ? relativeTime(last.created_at) : '—'}
            note={last?.created_at ? shortDateTime(last.created_at) : 'No execution yet'}
            tone="blue"
            hint={DASHBOARD_HINTS.lastBacktest}
          />
          <MarketUpdateMetric />
        </div>

        <section className="dashboard-history-section">
          <div className="dashboard-section-heading">
            <div>
              <span className="panel-kicker">History</span>
              <h2>Recent Backtests</h2>
              <p>Filter, sort and review recent simulation executions without expanding the page vertically.</p>
            </div>
            <span className="panel-count">{filteredRows.length} result{filteredRows.length === 1 ? '' : 's'}</span>
          </div>

          <div className="dashboard-history-toolbar">
            <label className="dashboard-list-search">
              <SearchIcon size={15} />
              <input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Filter execution history" aria-label="Filter execution history" />
            </label>
            <div className="dashboard-status-filters" role="group" aria-label="Backtest status filter">
              {[
                ['all', 'All'],
                ['completed', 'Completed'],
                ['interrupted', 'Interrupted'],
                ['failed', 'Failed'],
                ['active', 'Active'],
              ].map(([value, label]) => (
                <button key={value} type="button" className={statusFilter === value ? 'active' : ''} onClick={() => setStatusFilter(value)}>
                  {label}<span>{statusCounts[value]}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="table-wrap dashboard-history-table-wrap">
            <table className="dashboard-table dashboard-sortable-table">
              <thead>
                <tr>
                  <DashboardSortHeader label="Date" sortKey="date" sort={sort} onSort={updateSort} hint={DASHBOARD_HINTS.date} />
                  <DashboardSortHeader label="Status" sortKey="status" sort={sort} onSort={updateSort} hint={DASHBOARD_HINTS.status} />
                  <DashboardSortHeader label="Total Return" sortKey="return" sort={sort} onSort={updateSort} hint={DASHBOARD_HINTS.totalReturn} />
                  <DashboardSortHeader label="Sharpe Ratio" sortKey="sharpe" sort={sort} onSort={updateSort} hint={DASHBOARD_HINTS.sharpe} />
                  <DashboardSortHeader label="Max Drawdown" sortKey="drawdown" sort={sort} onSort={updateSort} hint={DASHBOARD_HINTS.drawdown} />
                  <DashboardSortHeader label="Rotations" sortKey="rotations" sort={sort} onSort={updateSort} hint={DASHBOARD_HINTS.rotations} />
                  <DashboardSortHeader label="Duration" sortKey="duration" sort={sort} onSort={updateSort} hint={DASHBOARD_HINTS.duration} />
                </tr>
              </thead>
              <tbody>
                {visibleRows.length ? visibleRows.map((item) => (
                  <tr key={item.id}>
                    <td>{shortDateTime(item.created_at)}</td>
                    <td><StatusBadge status={item.status} /></td>
                    <td className={item.metrics?.simulation_return == null ? '' : Number(item.metrics.simulation_return) >= 0 ? 'positive' : 'negative'}>{percent(item.metrics?.simulation_return)}</td>
                    <td>{item.metrics?.sharpe == null ? '—' : Number(item.metrics.sharpe).toFixed(3)}</td>
                    <td className={item.metrics?.maximum_drawdown == null ? '' : 'negative'}>{percent(item.metrics?.maximum_drawdown)}</td>
                    <td>{item.metrics?.position_changes == null ? '—' : Math.round(item.metrics.position_changes)}</td>
                    <td>{durationLabel(item.duration_seconds)}</td>
                  </tr>
                )) : (
                  <tr><td colSpan="7" className="empty-cell">No backtests match the current filters.</td></tr>
                )}
              </tbody>
            </table>
          </div>

          <DashboardPagination page={safePage} pages={pages} total={filteredRows.length} onPageChange={setPage} />
        </section>
      </section>
    </section>
  )
}
