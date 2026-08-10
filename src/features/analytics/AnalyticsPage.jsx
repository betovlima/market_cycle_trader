import { tr } from '../../i18n/runtime'
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

import { ApiError, apiFetch } from '../../api/http'
import { API } from '../../config/env'
import {
  ActivityIcon,
  AnalyticsIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  ListFilterIcon,
  PortfolioIcon,
  SearchIcon,
  SortIcon,
  TrendDownIcon,
  TrendUpIcon,
} from '../../shared/components/Icons'
import { ParameterHint } from '../../shared/components/ParameterHint'
import { money, number, percent, shortDate, shortDateTime } from '../../shared/formatters'
import { BacktestPerformanceExplorer } from './components/BacktestPerformanceExplorer'
import { RotationInspector } from './components/RotationInspector'
import { returnTone } from './utils/performance'
import { AnalyticsMetric, ChartCell, ChartEmpty, SectionHeading } from './components/AnalyticsPrimitives'

const ASSET_PAGE_SIZE = 10
const ROTATION_PAGE_SIZE = 10
const ORDER_PAGE_SIZE = 10

const BACKTEST_METRIC_HINTS = {
  'Simulation return': 'Total percentage return produced by the selected historical simulation over the evaluated period.',
  'Excess return': 'Difference between the simulation return and the reference return over the same period.',
  'Maximum drawdown': 'Largest peak-to-trough decline observed in the simulation equity curve. Smaller losses are generally easier to recover from.',
  'Sharpe ratio': 'Risk-adjusted return based on average excess return relative to volatility. It is useful for comparing return quality, not only return size.',
  'Capital rotations': 'Number of completed capital transitions between assets during the backtest.',
  'Realized P/L': 'Profit or loss realized by completed positions in the selected backtest. Transaction fees are shown separately.',
  'Positive months': 'Share of evaluated months in which the simulation finished with a positive monthly return.',
  'Average holding': 'Average number of days that closed positions remained open before capital rotated to another asset.',
}

const PORTFOLIO_METRIC_HINTS = {
  'Portfolio value': 'Current Paper portfolio value using the latest account snapshot available to Analytics.',
  'Total return': 'Cumulative return of the Paper portfolio relative to its recorded starting capital.',
  'Market exposure': 'Share of portfolio value currently invested in an open market position instead of remaining as cash.',
  'Current drawdown': 'Current decline from the highest recorded Paper portfolio value. Maximum drawdown is the worst decline in the stored history.',
  '1-day return': 'Portfolio return measured from the closest stored snapshot approximately one day earlier.',
  '7-day return': 'Portfolio return measured from the closest stored snapshot approximately seven days earlier.',
  '30-day return': 'Portfolio return measured from the closest stored snapshot approximately thirty days earlier.',
  'Order fill rate': 'Share of submitted Paper orders that were filled successfully.',
}

const tone = returnTone

function compareValues(left, right) {
  if (left == null && right == null) return 0
  if (left == null) return -1
  if (right == null) return 1
  const leftNumber = Number(left)
  const rightNumber = Number(right)
  if (Number.isFinite(leftNumber) && Number.isFinite(rightNumber)) return leftNumber - rightNumber
  return String(left).localeCompare(String(right), undefined, { numeric: true, sensitivity: 'base' })
}

function sortRows(rows, key, direction, valueGetter = null) {
  const multiplier = direction === 'asc' ? 1 : -1
  return [...rows].sort((left, right) => {
    const leftValue = valueGetter ? valueGetter(left, key) : left?.[key]
    const rightValue = valueGetter ? valueGetter(right, key) : right?.[key]
    return compareValues(leftValue, rightValue) * multiplier
  })
}

function FilterIconButton({ active = false, label, onClick, toneClass = '', children }) {
  return <button
    type="button"
    className={`analytics-filter-button ${toneClass} ${active ? 'active' : ''}`}
    onClick={onClick}
    aria-label={tr(label)}
    title={tr(label)}
  >{children}</button>
}

function AnalyticsListToolbar({
  query,
  onQueryChange,
  outcome,
  onOutcomeChange,
  resultCount,
  searchPlaceholder,
  mode = 'result',
  status = 'all',
  onStatusChange = null,
}) {
  return <div className="analytics-list-toolbar">
    <label className="analytics-list-search">
      <SearchIcon size={15} />
      <input
        type="search"
        value={query}
        onChange={(event) => onQueryChange(event.target.value)}
        placeholder={tr(searchPlaceholder)}
        aria-label={tr(searchPlaceholder)}
      />
    </label>
    <div className="analytics-filter-icons" aria-label={tr("List filters")}>
      <FilterIconButton active={outcome === 'all'} label={tr("Show all")} onClick={() => onOutcomeChange('all')}><ListFilterIcon size={16} /></FilterIconButton>
      {mode === 'side' ? <>
        <FilterIconButton active={outcome === 'buy'} label={tr("Show Buy orders")} toneClass="positive-filter" onClick={() => onOutcomeChange('buy')}>{tr("B")}</FilterIconButton>
        <FilterIconButton active={outcome === 'sell'} label={tr("Show Sell orders")} toneClass="negative-filter" onClick={() => onOutcomeChange('sell')}>{tr("S")}</FilterIconButton>
      </> : <>
        <FilterIconButton active={outcome === 'positive'} label={tr("Show profitable results")} toneClass="positive-filter" onClick={() => onOutcomeChange('positive')}><TrendUpIcon size={16} /></FilterIconButton>
        <FilterIconButton active={outcome === 'negative'} label={tr("Show losing results")} toneClass="negative-filter" onClick={() => onOutcomeChange('negative')}><TrendDownIcon size={16} /></FilterIconButton>
      </>}
    </div>
    {mode === 'side' && onStatusChange ? <select className="analytics-status-filter" value={status} onChange={(event) => onStatusChange(event.target.value)} aria-label={tr("Filter order status")}>
      <option value="all">{tr("All statuses")}</option>
      <option value="filled">{tr("Filled")}</option>
      <option value="rejected">{tr("Rejected")}</option>
      <option value="canceled">{tr("Canceled")}</option>
      <option value="pending">{tr("Pending")}</option>
    </select> : null}
    <span className="analytics-filter-count">{tr(resultCount === 1 ? "{count} result" : "{count} results", { count: resultCount })}</span>
  </div>
}

function AnalyticsPagination({ page, pages, total, pageSize, onPageChange }) {
  const from = total ? ((page - 1) * pageSize) + 1 : 0
  const to = Math.min(page * pageSize, total)
  return <div className="analytics-pagination">
    <span>{total ? tr("{from}–{to} of {total}", { from, to, total }) : tr("0 results")}</span>
    <div>
      <button type="button" onClick={() => onPageChange(page - 1)} disabled={page <= 1} aria-label={tr("Previous page")} title={tr("Previous page")}><ChevronLeftIcon size={16} /></button>
      <strong>{tr("Page")}{' '}{page} {tr("of")}{' '}{pages}</strong>
      <button type="button" onClick={() => onPageChange(page + 1)} disabled={page >= pages} aria-label={tr("Next page")} title={tr("Next page")}><ChevronRightIcon size={16} /></button>
    </div>
  </div>
}

function SortableTh({ label, sortKey, activeKey, direction, onSort, hint = '' }) {
  const active = activeKey === sortKey
  return <th>
    <button type="button" className={`analytics-sort-header ${active ? 'active' : ''}`} onClick={() => onSort(sortKey)} title={tr("Sort by {label}", { label: tr(label) })}>
      <span>{tr(label)}</span>
      {hint ? <ParameterHint id={`analytics-column-${sortKey}`} title={tr(label)} description={hint} /> : null}
      <SortIcon size={14} descending={active ? direction === 'desc' : true} />
    </button>
  </th>
}

function AnalyticsTableTabs({ value, onChange, items }) {
  return <div className="analytics-data-tabs" role="tablist" aria-label={tr("Analytics table view")}>
    {items.map((item) => <button key={item.value} type="button" role="tab" aria-selected={value === item.value} className={value === item.value ? 'active' : ''} onClick={() => onChange(item.value)}>{tr(item.label)}<span>{item.count}</span></button>)}
  </div>
}


function BacktestAnalytics({ dashboard }) {
  const recentCompleted = useMemo(() => (dashboard?.recent_backtests || []).filter((item) => item.status === 'completed'), [dashboard])
  const [jobs, setJobs] = useState([])
  const [jobId, setJobId] = useState('')
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [dataView, setDataView] = useState('assets')

  const [assetQuery, setAssetQuery] = useState('')
  const [assetOutcome, setAssetOutcome] = useState('all')
  const [assetSort, setAssetSort] = useState({ key: 'total_realized_pnl', direction: 'desc' })
  const [assetPage, setAssetPage] = useState(1)

  const [rotationQuery, setRotationQuery] = useState('')
  const [rotationOutcome, setRotationOutcome] = useState('all')
  const [rotationSort, setRotationSort] = useState({ key: 'total_realized_pnl', direction: 'desc' })
  const [rotationPage, setRotationPage] = useState(1)

  useEffect(() => {
    let active = true
    apiFetch(`${API}/analytics/backtests?limit=200`)
      .then((payload) => { if (active) setJobs(payload.items || []) })
      .catch(() => {})
    return () => { active = false }
  }, [])

  const completed = jobs.length ? jobs : recentCompleted

  useEffect(() => {
    if (!jobId && completed.length) setJobId(completed[0].id)
  }, [completed, jobId])

  useEffect(() => {
    if (!jobId) return
    let active = true
    setLoading(true)
    setError('')
    apiFetch(`${API}/analytics/backtests/${encodeURIComponent(jobId)}`)
      .then((payload) => { if (active) setData(payload) })
      .catch((requestError) => { if (active) setError(tr(requestError.message || 'Unable to load backtest analytics.')) })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [jobId])

  const metrics = data?.metrics || {}
  const rotation = data?.rotation_summary || {}
  const consistency = data?.consistency || {}

  const assetRows = useMemo(() => {
    const normalizedQuery = assetQuery.trim().toLowerCase()
    const filtered = (data?.asset_attribution || [])
      .filter((item) => !normalizedQuery || String(item.asset || '').toLowerCase().includes(normalizedQuery))
      .filter((item) => assetOutcome === 'all' || (assetOutcome === 'positive' ? Number(item.total_realized_pnl || 0) > 0 : Number(item.total_realized_pnl || 0) < 0))
    return sortRows(filtered, assetSort.key, assetSort.direction)
  }, [assetOutcome, assetQuery, assetSort, data])

  const rotationRows = useMemo(() => {
    const normalizedQuery = rotationQuery.trim().toLowerCase()
    const filtered = (data?.transition_matrix || [])
      .filter((item) => {
        const transition = `${item.from_asset || ''} ${item.to_asset || ''}`.toLowerCase()
        return !normalizedQuery || transition.includes(normalizedQuery)
      })
      .filter((item) => rotationOutcome === 'all' || (rotationOutcome === 'positive' ? Number(item.total_realized_pnl || 0) > 0 : Number(item.total_realized_pnl || 0) < 0))
    return sortRows(filtered, rotationSort.key, rotationSort.direction, (item, key) => key === 'transition' ? `${item.from_asset || ''} ${item.to_asset || ''}` : item[key])
  }, [data, rotationOutcome, rotationQuery, rotationSort])

  const assetPages = Math.max(1, Math.ceil(assetRows.length / ASSET_PAGE_SIZE))
  const currentAssetPage = Math.min(assetPage, assetPages)
  const paginatedAssetRows = assetRows.slice((currentAssetPage - 1) * ASSET_PAGE_SIZE, currentAssetPage * ASSET_PAGE_SIZE)
  const rotationPages = Math.max(1, Math.ceil(rotationRows.length / ROTATION_PAGE_SIZE))
  const currentRotationPage = Math.min(rotationPage, rotationPages)
  const paginatedRotationRows = rotationRows.slice((currentRotationPage - 1) * ROTATION_PAGE_SIZE, currentRotationPage * ROTATION_PAGE_SIZE)

  useEffect(() => { setAssetPage(1) }, [jobId, assetOutcome, assetQuery, assetSort])
  useEffect(() => { setRotationPage(1) }, [jobId, rotationOutcome, rotationQuery, rotationSort])

  const toggleAssetSort = (key) => setAssetSort((current) => ({ key, direction: current.key === key && current.direction === 'desc' ? 'asc' : 'desc' }))
  const toggleRotationSort = (key) => setRotationSort((current) => ({ key, direction: current.key === key && current.direction === 'desc' ? 'asc' : 'desc' }))

  return <>
    <div className="analytics-context-strip">
      <label className="analytics-context-select"><span>{tr("Completed backtest")}</span><select value={jobId} onChange={(event) => setJobId(event.target.value)}>
        {completed.length ? completed.map((item) => { const recent = recentCompleted.find((candidate) => candidate.id === item.id); return <option key={item.id} value={item.id}>{shortDateTime(item.created_at)}{recent?.metrics?.simulation_return == null ? '' : ` · ${percent(recent.metrics.simulation_return)}`}</option> }) : <option value="">{tr("No completed backtest")}</option>}
      </select></label>
      <span className="analytics-scope-badge">{tr("Viewer-safe · strategy-neutral")}</span>
    </div>

    {error ? <div className="global-inline-message error-inline analytics-workspace-message">{tr(error)}</div> : null}
    {loading ? <div className="analytics-loading"><span className="loading-ring" />{tr("Loading analytics…")}</div> : null}
    {!loading && data ? <>
      <section className="analytics-workspace-metrics">
        <AnalyticsMetric label={tr("Simulation return")} value={percent(metrics.simulation_return)} note={tr("Reference {value}", { value: percent(metrics.reference_return) })} tone={tone(metrics.simulation_return)} description={BACKTEST_METRIC_HINTS['Simulation return']} />
        <AnalyticsMetric label="S − R" value={percent((metrics.simulation_return ?? 0) - (metrics.reference_return ?? 0))} note={tr("Simulation minus reference")} tone={tone((metrics.simulation_return ?? 0) - (metrics.reference_return ?? 0))} description={BACKTEST_METRIC_HINTS['Excess return']} />
        <AnalyticsMetric label={tr("Maximum drawdown")} value={percent(metrics.maximum_drawdown)} note={tr("Reference {value}", { value: percent(metrics.reference_maximum_drawdown) })} tone="negative" description={BACKTEST_METRIC_HINTS['Maximum drawdown']} />
        <AnalyticsMetric label={tr("Sharpe ratio")} value={number(metrics.sharpe, 3)} note={tr("Reference {value}", { value: number(metrics.reference_sharpe, 3) })} description={BACKTEST_METRIC_HINTS['Sharpe ratio']} />
        <AnalyticsMetric label={tr("Capital rotations")} value={String(rotation.total_rotations ?? 0)} note={tr("{count} profitable", { count: rotation.profitable_rotations ?? 0 })} description={BACKTEST_METRIC_HINTS['Capital rotations']} />
        <AnalyticsMetric label={tr("Realized P/L")} value={money(rotation.total_realized_pnl)} note={tr("Fees {value}", { value: money(rotation.total_transaction_fees) })} tone={tone(rotation.total_realized_pnl)} description={BACKTEST_METRIC_HINTS['Realized P/L']} />
        <AnalyticsMetric label={tr("Positive months")} value={percent(consistency.positive_month_rate)} note={tr("{count} of {total}", { count: consistency.positive_months ?? 0, total: consistency.months ?? 0 })} description={BACKTEST_METRIC_HINTS['Positive months']} />
        <AnalyticsMetric label={tr("Average holding")} value={rotation.average_holding_days == null ? '—' : tr('{count} days', { count: number(rotation.average_holding_days, 1) })} note={tr("Closed positions")} description={BACKTEST_METRIC_HINTS['Average holding']} />
      </section>

      <BacktestPerformanceExplorer data={data} jobId={jobId} />

      <RotationInspector rotations={data.rotations || []} summary={rotation} />

      <section className="analytics-workspace-section analytics-data-section">
        <SectionHeading
          kicker={tr("TRADE ANALYSIS")}
          title={tr("Attribution and rotation quality")}
          description={tr("Inspect realized performance by asset or by origin → destination rotation without exposing strategy signals.")}
          action={<AnalyticsTableTabs value={dataView} onChange={setDataView} items={[{ value: 'assets', label: 'By asset', count: assetRows.length }, { value: 'rotations', label: 'Rotations', count: rotationRows.length }]} />}
        />
        {dataView === 'assets' ? <>
          <AnalyticsListToolbar query={assetQuery} onQueryChange={setAssetQuery} outcome={assetOutcome} onOutcomeChange={setAssetOutcome} resultCount={assetRows.length} searchPlaceholder={tr("Filter asset")} />
          <div className="table-wrap"><table className="dashboard-table analytics-table analytics-table-wide"><thead><tr>
            <SortableTh label={tr("Asset")} sortKey="asset" activeKey={assetSort.key} direction={assetSort.direction} onSort={toggleAssetSort} />
            <SortableTh label={tr("Positions")} sortKey="closed_positions" activeKey={assetSort.key} direction={assetSort.direction} onSort={toggleAssetSort} />
            <SortableTh label={tr("Win rate")} sortKey="win_rate" activeKey={assetSort.key} direction={assetSort.direction} onSort={toggleAssetSort} />
            <SortableTh label={tr("Realized P/L")} sortKey="total_realized_pnl" activeKey={assetSort.key} direction={assetSort.direction} onSort={toggleAssetSort} />
            <SortableTh label={tr("Avg. return")} sortKey="average_position_return" activeKey={assetSort.key} direction={assetSort.direction} onSort={toggleAssetSort} />
            <SortableTh label={tr("Fees")} sortKey="transaction_fees" activeKey={assetSort.key} direction={assetSort.direction} onSort={toggleAssetSort} />
          </tr></thead><tbody>{paginatedAssetRows.length ? paginatedAssetRows.map((item) => <tr key={item.asset}><td><strong>{item.asset}</strong></td><td>{item.closed_positions}</td><td>{percent(item.win_rate)}</td><td className={tone(item.total_realized_pnl)}>{money(item.total_realized_pnl)}</td><td className={tone(item.average_position_return)}>{percent(item.average_position_return)}</td><td>{money(item.transaction_fees)}</td></tr>) : <tr><td colSpan="6" className="empty-cell">{tr("No assets match the selected filters.")}</td></tr>}</tbody></table></div>
          <AnalyticsPagination page={currentAssetPage} pages={assetPages} total={assetRows.length} pageSize={ASSET_PAGE_SIZE} onPageChange={setAssetPage} />
        </> : <>
          <AnalyticsListToolbar query={rotationQuery} onQueryChange={setRotationQuery} outcome={rotationOutcome} onOutcomeChange={setRotationOutcome} resultCount={rotationRows.length} searchPlaceholder={tr("Filter origin or destination")} />
          <div className="table-wrap"><table className="dashboard-table analytics-table analytics-table-wide"><thead><tr>
            <SortableTh label={tr("Transition")} sortKey="transition" activeKey={rotationSort.key} direction={rotationSort.direction} onSort={toggleRotationSort} />
            <SortableTh label={tr("Rotations")} sortKey="rotations" activeKey={rotationSort.key} direction={rotationSort.direction} onSort={toggleRotationSort} />
            <SortableTh label={tr("Win rate")} sortKey="win_rate" activeKey={rotationSort.key} direction={rotationSort.direction} onSort={toggleRotationSort} />
            <SortableTh label={tr("Realized P/L")} sortKey="total_realized_pnl" activeKey={rotationSort.key} direction={rotationSort.direction} onSort={toggleRotationSort} />
            <SortableTh label={tr("Avg. return")} sortKey="average_position_return" activeKey={rotationSort.key} direction={rotationSort.direction} onSort={toggleRotationSort} />
            <SortableTh label={tr("Fees")} sortKey="transaction_fees" activeKey={rotationSort.key} direction={rotationSort.direction} onSort={toggleRotationSort} />
          </tr></thead><tbody>{paginatedRotationRows.length ? paginatedRotationRows.map((item) => <tr key={`${item.from_asset}-${item.to_asset}`}><td><strong>{item.from_asset} → {item.to_asset}</strong></td><td>{item.rotations}</td><td>{percent(item.win_rate)}</td><td className={tone(item.total_realized_pnl)}>{money(item.total_realized_pnl)}</td><td className={tone(item.average_position_return)}>{percent(item.average_position_return)}</td><td>{money(item.transaction_fees)}</td></tr>) : <tr><td colSpan="6" className="empty-cell">{tr("No rotations match the selected filters.")}</td></tr>}</tbody></table></div>
          <AnalyticsPagination page={currentRotationPage} pages={rotationPages} total={rotationRows.length} pageSize={ROTATION_PAGE_SIZE} onPageChange={setRotationPage} />
        </>}
      </section>

      <section className="analytics-workspace-section analytics-resilience-section">
        <SectionHeading kicker={tr("RESILIENCE")} title={tr("Holding quality, concentration and drawdown anatomy")} description={tr("Compact diagnostics that show whether results depend on holding duration, a small number of positions or isolated drawdown episodes.")} />
        <div className="analytics-resilience-grid">
          <div className="analytics-subsection">
            <div className="analytics-subsection-heading"><span>{tr("HOLDING PERIOD")}</span><strong>{tr("Performance by duration")}</strong></div>
            <div className="table-wrap analytics-holding-table-wrap"><table className="dashboard-table analytics-table analytics-holding-table"><thead><tr><th>{tr("Duration")}</th><th>{tr("Positions")}</th><th>{tr("Win rate")}</th><th>{tr("Avg. return")}</th><th>{tr("Realized P/L")}</th></tr></thead><tbody>{data.holding_buckets?.length ? data.holding_buckets.map((item) => <tr key={item.bucket}><td><strong>{item.bucket}</strong></td><td>{item.positions}</td><td>{percent(item.win_rate)}</td><td className={tone(item.average_position_return)}>{percent(item.average_position_return)}</td><td className={tone(item.total_realized_pnl)}>{money(item.total_realized_pnl)}</td></tr>) : <tr><td colSpan="5" className="empty-cell">{tr("No holding-period data.")}</td></tr>}</tbody></table></div>
          </div>
          <div className="analytics-subsection analytics-robustness-subsection">
            <div className="analytics-subsection-heading"><span>{tr("ROBUSTNESS")}</span><strong>{tr("Dependence on best positions")}</strong></div>
            <dl className="analytics-definition-list compact"><div><dt>{tr("Total realized P/L")}</dt><dd className={tone(data.trade_dependency?.total_realized_pnl)}>{money(data.trade_dependency?.total_realized_pnl)}</dd></div><div><dt>{tr("Without best position")}</dt><dd className={tone(data.trade_dependency?.without_best_position_pnl)}>{money(data.trade_dependency?.without_best_position_pnl)}</dd></div><div><dt>{tr("Without top 3")}</dt><dd className={tone(data.trade_dependency?.without_top_three_pnl)}>{money(data.trade_dependency?.without_top_three_pnl)}</dd></div><div><dt>{tr("Without top 5")}</dt><dd className={tone(data.trade_dependency?.without_top_five_pnl)}>{money(data.trade_dependency?.without_top_five_pnl)}</dd></div><div><dt>{tr("Top 5 share of positive P/L")}</dt><dd>{percent(data.trade_dependency?.top_five_profit_share)}</dd></div></dl>
          </div>
        </div>
        <div className="analytics-subsection analytics-drawdown-subsection">
          <div className="analytics-subsection-heading"><span>{tr("DRAWDOWN ANATOMY")}</span><strong>{tr("Largest drawdown episodes")}</strong></div>
          <div className="table-wrap"><table className="dashboard-table analytics-table"><thead><tr><th>{tr("Started")}</th><th>{tr("Trough")}</th><th>{tr("Recovered")}</th><th>{tr("Depth")}</th><th>{tr("Duration")}</th></tr></thead><tbody>{data.drawdown_episodes?.length ? data.drawdown_episodes.map((item, index) => <tr key={`${item.started_at}-${index}`}><td>{shortDateTime(item.started_at)}</td><td>{shortDateTime(item.trough_at)}</td><td>{item.recovered_at ? shortDateTime(item.recovered_at) : tr('Open')}</td><td className="negative">{percent(item.maximum_drawdown)}</td><td>{item.duration_days == null ? '—' : tr('{count} days', { count: item.duration_days })}</td></tr>) : <tr><td colSpan="5" className="empty-cell">{tr("No drawdown episodes.")}</td></tr>}</tbody></table></div>
        </div>
      </section>
    </> : null}
  </>
}

function PortfolioAnalytics() {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [orderQuery, setOrderQuery] = useState('')
  const [orderSide, setOrderSide] = useState('all')
  const [orderStatus, setOrderStatus] = useState('all')
  const [orderSort, setOrderSort] = useState({ key: 'created_at', direction: 'desc' })
  const [orderPage, setOrderPage] = useState(1)

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try { setData(await apiFetch(`${API}/analytics/portfolio`)) }
    catch (requestError) { setError(tr(requestError instanceof ApiError ? requestError.message : 'Unable to load portfolio analytics.')) }
    finally { setLoading(false) }
  }, [])

  useEffect(() => { load() }, [load])
  const summary = data?.summary || {}
  const order = data?.order_analytics || {}

  const orderRows = useMemo(() => {
    const normalizedQuery = orderQuery.trim().toLowerCase()
    const filtered = (data?.orders || [])
      .filter((item) => {
        const haystack = `${item.symbol || ''} ${item.side || ''} ${item.status || ''}`.toLowerCase()
        return !normalizedQuery || haystack.includes(normalizedQuery)
      })
      .filter((item) => orderSide === 'all' || String(item.side || '').toLowerCase() === orderSide)
      .filter((item) => {
        if (orderStatus === 'all') return true
        const status = String(item.status || '').toLowerCase()
        if (orderStatus === 'pending') return !['filled', 'rejected', 'canceled', 'cancelled'].includes(status)
        if (orderStatus === 'canceled') return ['canceled', 'cancelled'].includes(status)
        return status === orderStatus
      })
    return sortRows(filtered, orderSort.key, orderSort.direction, (item, key) => {
      if (key === 'created_at') return Date.parse(item.created_at || item.submitted_at || 0) || 0
      if (key === 'quantity') return item.filled_quantity ?? item.quantity
      if (key === 'average_fill') return item.filled_average_price
      return item[key]
    })
  }, [data, orderQuery, orderSide, orderSort, orderStatus])

  const orderPages = Math.max(1, Math.ceil(orderRows.length / ORDER_PAGE_SIZE))
  const currentOrderPage = Math.min(orderPage, orderPages)
  const paginatedOrders = orderRows.slice((currentOrderPage - 1) * ORDER_PAGE_SIZE, currentOrderPage * ORDER_PAGE_SIZE)
  useEffect(() => { setOrderPage(1) }, [orderQuery, orderSide, orderStatus, orderSort])
  const toggleOrderSort = (key) => setOrderSort((current) => ({ key, direction: current.key === key && current.direction === 'desc' ? 'asc' : 'desc' }))

  return <>
    <div className="analytics-context-strip portfolio-analytics-context">
      <span className={`connection-pill ${data?.connection?.status || 'unavailable'}`}>{tr(data?.connection?.message || 'Checking Alpaca Paper…')}</span>
      <button type="button" className="table-action compact" onClick={load} disabled={loading}>{tr("Refresh")}</button>
    </div>
    {error ? <div className="global-inline-message error-inline analytics-workspace-message">{tr(error)}</div> : null}
    {loading ? <div className="analytics-loading"><span className="loading-ring" />{tr("Loading portfolio analytics…")}</div> : null}
    {!loading && data ? <>
      <section className="analytics-workspace-metrics">
        <AnalyticsMetric label={tr("Portfolio value")} value={money(summary.portfolio_value)} note={tr("Cash {value}", { value: money(summary.strategy_cash) })} description={PORTFOLIO_METRIC_HINTS['Portfolio value']} />
        <AnalyticsMetric label={tr("Total return")} value={percent(summary.total_return)} note={tr("P/L {value}", { value: money(summary.total_pnl) })} tone={tone(summary.total_return)} description={PORTFOLIO_METRIC_HINTS['Total return']} />
        <AnalyticsMetric label={tr("Market exposure")} value={percent(summary.market_exposure)} note={tr("Market value {value}", { value: money(summary.market_value) })} description={PORTFOLIO_METRIC_HINTS['Market exposure']} />
        <AnalyticsMetric label={tr("Current drawdown")} value={percent(summary.current_drawdown)} note={tr("Maximum {value}", { value: percent(summary.maximum_drawdown) })} tone="negative" description={PORTFOLIO_METRIC_HINTS['Current drawdown']} />
        <AnalyticsMetric label={tr("1-day return")} value={percent(summary.return_1_day)} note={tr("Stored snapshots")} tone={tone(summary.return_1_day)} description={PORTFOLIO_METRIC_HINTS['1-day return']} />
        <AnalyticsMetric label={tr("7-day return")} value={percent(summary.return_7_days)} note={tr("Stored snapshots")} tone={tone(summary.return_7_days)} description={PORTFOLIO_METRIC_HINTS['7-day return']} />
        <AnalyticsMetric label={tr("30-day return")} value={percent(summary.return_30_days)} note={tr("Stored snapshots")} tone={tone(summary.return_30_days)} description={PORTFOLIO_METRIC_HINTS['30-day return']} />
        <AnalyticsMetric label={tr("Order fill rate")} value={percent(order.fill_rate)} note={tr("{filled} of {total} filled", { filled: order.filled_orders ?? 0, total: order.total_orders ?? 0 })} description={PORTFOLIO_METRIC_HINTS['Order fill rate']} />
      </section>

      <section className="analytics-workspace-section">
        <SectionHeading kicker={tr("PAPER PERFORMANCE")} title={tr("Portfolio evolution and current risk")} description={tr("Current Paper account evolution from stored snapshots, with current position and execution quality in the same workspace.")} />
        <div className="analytics-portfolio-grid">
          <ChartCell kicker={tr("PAPER EQUITY")} title={tr("Portfolio value history")} className="analytics-chart-primary">
            {data.history?.length ? <div className="analytics-chart analytics-chart-large"><ResponsiveContainer width="100%" height="100%"><LineChart data={data.history}><CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="recorded_at" tickFormatter={shortDate} minTickGap={38} /><YAxis tickFormatter={(value) => `$${Math.round(value / 1000)}k`} /><Tooltip labelFormatter={shortDateTime} formatter={(value) => money(value)} /><Line type="monotone" dataKey="portfolio_value" name={tr("Portfolio value")} dot={false} strokeWidth={2} stroke="var(--accent)" /></LineChart></ResponsiveContainer></div> : <ChartEmpty>{tr("No portfolio snapshots stored yet.")}</ChartEmpty>}
          </ChartCell>
          <div className="analytics-portfolio-side">
            <ChartCell kicker={tr("PAPER RISK")} title={tr("Portfolio drawdown")}>
              {data.history?.length ? <div className="analytics-chart analytics-chart-mini"><ResponsiveContainer width="100%" height="100%"><LineChart data={data.history}><CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="recorded_at" tickFormatter={shortDate} minTickGap={38} /><YAxis tickFormatter={(value) => `${Math.round(value * 100)}%`} /><Tooltip labelFormatter={shortDateTime} formatter={(value) => percent(value)} /><Line type="monotone" dataKey="drawdown" name={tr("Drawdown")} dot={false} strokeWidth={2} stroke="var(--negative)" /></LineChart></ResponsiveContainer></div> : <ChartEmpty />}
            </ChartCell>
            <div className="analytics-account-grid">
              <div className="analytics-subsection compact-panel"><div className="analytics-subsection-heading"><span>{tr("CURRENT POSITION")}</span><strong>{tr("Paper account state")}</strong></div><dl className="analytics-definition-list compact"><div><dt>{tr("Symbol")}</dt><dd>{data.current?.position?.symbol || tr('Cash')}</dd></div><div><dt>{tr("Quantity")}</dt><dd>{number(data.current?.position?.quantity, 4)}</dd></div><div><dt>{tr("Average entry")}</dt><dd>{money(data.current?.position?.average_entry_price)}</dd></div><div><dt>{tr("Current price")}</dt><dd>{money(data.current?.position?.current_price)}</dd></div><div><dt>{tr("Unrealized P/L")}</dt><dd className={tone(summary.unrealized_pnl)}>{money(summary.unrealized_pnl)}</dd></div></dl></div>
              <div className="analytics-subsection compact-panel"><div className="analytics-subsection-heading"><span>{tr("EXECUTION QUALITY")}</span><strong>{tr("Order statistics")}</strong></div><dl className="analytics-definition-list compact"><div><dt>{tr("Total orders")}</dt><dd>{order.total_orders ?? 0}</dd></div><div><dt>{tr("Filled")}</dt><dd>{order.filled_orders ?? 0}</dd></div><div><dt>{tr("Rejected")}</dt><dd>{order.rejected_orders ?? 0}</dd></div><div><dt>{tr("Rejection rate")}</dt><dd>{percent(order.rejection_rate)}</dd></div><div><dt>{tr("Avg. fill delay")}</dt><dd>{order.average_fill_delay_seconds == null ? '—' : tr('{count} sec', { count: number(order.average_fill_delay_seconds, 1) })}</dd></div></dl></div>
            </div>
          </div>
        </div>
      </section>

      <section className="analytics-workspace-section analytics-data-section">
        <SectionHeading kicker={tr("RECENT EXECUTIONS")} title={tr("Paper orders")} description={tr("Search, filter, sort and page through Paper order activity already available to Analytics.")} />
        <AnalyticsListToolbar query={orderQuery} onQueryChange={setOrderQuery} outcome={orderSide} onOutcomeChange={setOrderSide} status={orderStatus} onStatusChange={setOrderStatus} mode="side" resultCount={orderRows.length} searchPlaceholder={tr("Filter symbol, side or status")} />
        <div className="table-wrap"><table className="dashboard-table analytics-table analytics-table-wide"><thead><tr>
          <SortableTh label={tr("Time")} sortKey="created_at" activeKey={orderSort.key} direction={orderSort.direction} onSort={toggleOrderSort} />
          <SortableTh label={tr("Symbol")} sortKey="symbol" activeKey={orderSort.key} direction={orderSort.direction} onSort={toggleOrderSort} />
          <SortableTh label={tr("Side")} sortKey="side" activeKey={orderSort.key} direction={orderSort.direction} onSort={toggleOrderSort} />
          <SortableTh label={tr("Status")} sortKey="status" activeKey={orderSort.key} direction={orderSort.direction} onSort={toggleOrderSort} />
          <SortableTh label={tr("Quantity")} sortKey="quantity" activeKey={orderSort.key} direction={orderSort.direction} onSort={toggleOrderSort} />
          <SortableTh label={tr("Average fill")} sortKey="average_fill" activeKey={orderSort.key} direction={orderSort.direction} onSort={toggleOrderSort} />
        </tr></thead><tbody>{paginatedOrders.length ? paginatedOrders.map((item, index) => <tr key={`${item.created_at}-${item.symbol}-${index}`}><td>{shortDateTime(item.created_at || item.submitted_at)}</td><td><strong>{item.symbol}</strong></td><td><span className={`analytics-side ${String(item.side || '').toLowerCase()}`}>{tr(String(item.side || "").toLowerCase() === "buy" ? "Buy" : String(item.side || "").toLowerCase() === "sell" ? "Sell" : item.side)}</span></td><td><span className={`table-status ${item.status}`}>{tr(item.status)}</span></td><td>{number(item.filled_quantity ?? item.quantity, 4)}</td><td>{money(item.filled_average_price)}</td></tr>) : <tr><td colSpan="6" className="empty-cell">{tr("No Paper orders match the selected filters.")}</td></tr>}</tbody></table></div>
        <AnalyticsPagination page={currentOrderPage} pages={orderPages} total={orderRows.length} pageSize={ORDER_PAGE_SIZE} onPageChange={setOrderPage} />
      </section>
    </> : null}
  </>
}

export function AnalyticsPage({ session, dashboard }) {
  const canViewPortfolio = ['admin', 'trader'].includes(session.role)
  const [section, setSection] = useState('backtest')

  useEffect(() => { if (!canViewPortfolio && section === 'portfolio') setSection('backtest') }, [canViewPortfolio, section])

  return <section className="page-stack analytics-page analytics-single-workspace">
    <section className="data-panel analytics-workspace-panel">
      <header className="analytics-workspace-header">
        <div className="analytics-workspace-title"><div className="page-title-icon"><AnalyticsIcon size={21} /></div><div><h2>{tr("Analytics")}</h2><p>{tr("Explain performance, risk, consistency and execution without exposing the strategy.")}</p></div></div>
        <div className="analytics-tabs compact-tabs">
          <button type="button" className={section === 'backtest' ? 'active' : ''} onClick={() => setSection('backtest')}><ActivityIcon size={17} />{tr("Backtest Analytics")}</button>
          {canViewPortfolio ? <button type="button" className={section === 'portfolio' ? 'active' : ''} onClick={() => setSection('portfolio')}><PortfolioIcon size={17} />{tr("Portfolio Analytics")}</button> : null}
        </div>
      </header>
      {section === 'backtest' ? <BacktestAnalytics dashboard={dashboard} /> : <PortfolioAnalytics />}
    </section>
  </section>
}
