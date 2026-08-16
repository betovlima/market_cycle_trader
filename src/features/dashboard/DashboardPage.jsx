import { useEffect, useMemo, useState } from 'react'

import { hasCapability } from '../../auth/capabilities'
import { tr } from '../../i18n/runtime'
import { DashboardIcon, PlayIcon, ShieldIcon } from '../../shared/components/Icons'
import { money, percent, relativeTime, shortDateTime } from '../../shared/formatters'
import { DASHBOARD_HINTS, DASHBOARD_PAGE_SIZE } from './dashboardConfig'
import { dashboardSortValue, statusMatchesFilter } from './dashboardUtils'
import { DashboardMetric, MarketUpdateMetric } from './components/DashboardPrimitives'
import { BacktestHistorySection } from './components/BacktestHistorySection'
import { DashboardBacktestAnalyticsSection } from './components/DashboardBacktestAnalyticsSection'

export function DashboardPage({ workspace, capabilities = {}, onOpenBacktest }) {
  const { dashboard, loadingDashboard, running, restoringExecution, startingBacktest, startDisabled, runBacktest } = workspace
  const best = dashboard?.best_performance
  const last = dashboard?.last_backtest
  const recentBacktests = useMemo(() => dashboard?.recent_backtests || [], [dashboard])
  const canRunBacktest = hasCapability(capabilities, 'backtest.start')

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
          item?.strategy_profile_name,
          item?.research_model_label,
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
            <div><h2>{tr('Dashboard')}</h2></div>
          </div>
          <div className="dashboard-header-actions">
            <span className="dashboard-protected-badge"><ShieldIcon size={15} />{tr('Protected configuration')}</span>
            {canRunBacktest ? <button className="primary-action compact dashboard-start-action" type="button" disabled={startDisabled} onClick={startBacktest}><PlayIcon size={14} />{tr(restoringExecution ? 'Checking Execution' : startingBacktest ? 'Starting…' : running ? 'Simulation Running' : 'Start New Backtest')}</button> : null}
          </div>
        </div>

        <div className="dashboard-workspace-metrics">
          <DashboardMetric id="dashboard-hint-total-backtests" label={tr('Total Backtests')} value={loadingDashboard ? '…' : String(dashboard?.total_backtests ?? 0)} note={tr('{count} completed', { count: dashboard?.completed_backtests ?? 0 })} tone="green" hint={DASHBOARD_HINTS.totalBacktests} />
          <DashboardMetric id="dashboard-hint-best-performance" label={tr('Best Performance')} value={best?.metrics?.simulation_return == null ? '—' : percent(best.metrics.simulation_return)} note={best?.metrics?.ending_capital == null ? tr('No completed result') : tr('Ending capital {value}', { value: money(best.metrics.ending_capital) })} tone="gold" hint={DASHBOARD_HINTS.bestPerformance} />
          <DashboardMetric id="dashboard-hint-last-backtest" label={tr('Last Backtest')} value={last?.created_at ? relativeTime(last.created_at) : '—'} note={last?.created_at ? shortDateTime(last.created_at) : tr('No execution yet')} tone="blue" hint={DASHBOARD_HINTS.lastBacktest} />
          <MarketUpdateMetric />
        </div>

        <DashboardBacktestAnalyticsSection fallbackJobs={recentBacktests} />

        <BacktestHistorySection
          filteredRows={filteredRows}
          query={query}
          onQueryChange={setQuery}
          statusFilter={statusFilter}
          onStatusFilterChange={setStatusFilter}
          statusCounts={statusCounts}
          visibleRows={visibleRows}
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
