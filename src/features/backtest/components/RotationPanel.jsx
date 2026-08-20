import { useEffect, useMemo, useState } from 'react'

import { tr } from '../../../i18n/runtime'
import { ListFilterIcon, TrendDownIcon, TrendUpIcon } from '../../../shared/components/Icons'
import { money, percent, shortDateTime } from '../../../shared/formatters'
import { METRIC_HINTS, ROTATION_HINTS, ROTATION_PAGE_SIZE } from '../backtestConfig'
import { sortRows, toggleSort } from '../backtestUtils'
import { FilterButton, ListToolbar, Metric, Pagination, SortableHeader } from './BacktestPrimitives'

export function RotationPanel({ jobId, payload, loading, error }) {
  const [query, setQuery] = useState('')
  const [outcome, setOutcome] = useState('all')
  const [sort, setSort] = useState({ key: 'executed_at', direction: 'desc' })
  const [page, setPage] = useState(1)

  const summary = payload?.rotation_summary || {}
  const metrics = payload?.metrics || {}
  const rotations = payload?.rotations || []

  const exitCount = Number(summary.profitable_rotations || 0) + Number(summary.losing_rotations || 0) + Number(summary.flat_rotations || 0)
  const profitableExitRate = exitCount > 0 ? Number(summary.profitable_rotations || 0) / exitCount : null

  const realizedPnlBreakdown = useMemo(() => {
    const realized = rotations
      .map((item) => item.realized_pnl)
      .filter((value) => value !== null && value !== undefined && Number.isFinite(Number(value)))
      .map(Number)
    const grossProfits = realized.filter((value) => value > 0).reduce((total, value) => total + value, 0)
    const grossLosses = realized.filter((value) => value < 0).reduce((total, value) => total + value, 0)
    return {
      grossProfits,
      grossLosses,
      averageRealizedPnl: realized.length ? realized.reduce((total, value) => total + value, 0) / realized.length : null,
    }
  }, [rotations])

  const holdingStats = useMemo(() => {
    const values = rotations
      .map((item) => item.holding_days)
      .filter((value) => value !== null && value !== undefined && Number.isFinite(Number(value)))
      .map(Number)
      .sort((a, b) => a - b)
    if (!values.length) return { median: null, minimum: null, maximum: null }
    const middle = Math.floor(values.length / 2)
    const median = values.length % 2
      ? values[middle]
      : (values[middle - 1] + values[middle]) / 2
    return { median, minimum: values[0], maximum: values[values.length - 1] }
  }, [rotations])

  const filteredRows = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase()
    const rows = rotations.filter((item) => {
      if (normalizedQuery) {
        const haystack = `${item.from_asset || 'CASH'} ${item.to_asset || 'CASH'}`.toLowerCase()
        if (!haystack.includes(normalizedQuery)) return false
      }
      const hasRealizedPnl = item.realized_pnl !== null && item.realized_pnl !== undefined
      const pnl = hasRealizedPnl ? Number(item.realized_pnl) : null
      if (outcome === 'profit' && (!hasRealizedPnl || pnl <= 0)) return false
      if (outcome === 'loss' && (!hasRealizedPnl || pnl >= 0)) return false
      if (outcome === 'flat' && (!hasRealizedPnl || pnl !== 0)) return false
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
        <span className="backtest-section-meta">{tr("Executed capital movements · includes CASH")}</span>
      </div>

      <div className="backtest-rotation-summary">
        <Metric
          id="hint-rotation-count"
          label={tr("Capital Movements")}
          value={String(summary.total_rotations ?? 0)}
          tone="blue"
          hint={METRIC_HINTS.total_rotations}
          hintDetails={[
            { label: 'Total movements', value: String(summary.total_rotations ?? 0), tone: 'blue', description: 'All executed capital movements shown in this table.' },
            { label: 'Asset → Asset', value: String(summary.asset_to_asset_rotations ?? 0), tone: 'amber', description: 'Direct rotations from one risky asset into another risky asset.' },
            { label: 'Asset → CASH', value: String(summary.market_to_cash_moves ?? 0), tone: 'purple', description: 'Times the strategy exited a risky asset and left the capital in CASH.' },
            { label: 'CASH → Market', value: String(summary.cash_to_market_moves ?? 0), tone: 'green', description: 'Times the strategy redeployed CASH into a risky asset.' },
            { label: 'CASH Sessions', value: metrics.cash_days == null ? '—' : String(Math.round(Number(metrics.cash_days))), tone: 'purple', description: 'Out-of-sample sessions in which the portfolio remained fully in CASH.' },
            { label: 'Market Exposure', value: metrics.market_exposure == null ? '—' : percent(metrics.market_exposure), tone: 'blue', description: 'Average fraction of portfolio capital exposed to risky assets during the out-of-sample period.' },
          ]}
        />
        <Metric
          id="hint-profitable-rotations"
          label={tr("Profitable Exits")}
          value={String(summary.profitable_rotations ?? 0)}
          tone="green"
          hint={METRIC_HINTS.profitable_rotations}
          hintDetails={[
            { label: 'Profitable exits', value: String(summary.profitable_rotations ?? 0), tone: 'green', description: 'Closed positions with realized P/L greater than zero.' },
            { label: 'Losing exits', value: String(summary.losing_rotations ?? 0), tone: 'red', description: 'Closed positions with realized P/L below zero.' },
            { label: 'Flat exits', value: String(summary.flat_rotations ?? 0), tone: 'blue', description: 'Closed positions whose realized P/L was exactly zero.' },
            { label: 'Profitable exit rate', value: profitableExitRate == null ? '—' : percent(profitableExitRate), tone: 'green', description: 'Profitable exits divided by all exits with a realized outcome.' },
          ]}
        />
        <Metric
          id="hint-realized-pnl"
          label={tr("Realized P/L")}
          value={money(summary.total_realized_pnl)}
          tone={Number(summary.total_realized_pnl || 0) >= 0 ? 'green' : 'red'}
          hint={METRIC_HINTS.total_realized_pnl}
          hintDetails={[
            { label: 'Realized P/L', value: money(summary.total_realized_pnl), tone: Number(summary.total_realized_pnl || 0) >= 0 ? 'green' : 'red', description: 'Total realized result recorded when positions were closed by capital movements.' },
            { label: 'Gross profitable exits', value: money(realizedPnlBreakdown.grossProfits), tone: 'green', description: 'Sum of positive realized P/L across closed positions.' },
            { label: 'Gross losing exits', value: money(realizedPnlBreakdown.grossLosses), tone: 'red', description: 'Sum of negative realized P/L across closed positions.' },
            { label: 'Average P/L per exit', value: realizedPnlBreakdown.averageRealizedPnl == null ? '—' : money(realizedPnlBreakdown.averageRealizedPnl), tone: realizedPnlBreakdown.averageRealizedPnl == null ? 'blue' : realizedPnlBreakdown.averageRealizedPnl >= 0 ? 'green' : 'red', description: 'Average realized P/L for movements that closed an existing position.' },
            { label: 'Transaction fees', value: money(summary.total_transaction_fees), tone: 'amber', description: 'Total modeled transaction costs attributed to the executed capital movements.' },
          ]}
        />
        <Metric
          id="hint-average-holding"
          label={tr("Average Holding")}
          value={summary.average_holding_days == null ? '—' : tr('{count} days', { count: Number(summary.average_holding_days).toFixed(1) })}
          tone="purple"
          hint={METRIC_HINTS.average_holding_days}
          hintDetails={[
            { label: 'Average holding', value: summary.average_holding_days == null ? '—' : tr('{count} days', { count: Number(summary.average_holding_days).toFixed(1) }), tone: 'purple', description: 'Mean holding period for positions that were subsequently exited.' },
            { label: 'Median holding', value: holdingStats.median == null ? '—' : tr('{count} days', { count: Number(holdingStats.median).toFixed(1) }), tone: 'blue', description: 'Middle holding period, which is less sensitive to unusually long positions.' },
            { label: 'Shortest holding', value: holdingStats.minimum == null ? '—' : tr('{count} days', { count: Number(holdingStats.minimum).toFixed(0) }), tone: 'amber', description: 'Shortest completed holding period in the movement history.' },
            { label: 'Longest holding', value: holdingStats.maximum == null ? '—' : tr('{count} days', { count: Number(holdingStats.maximum).toFixed(0) }), tone: 'purple', description: 'Longest completed holding period in the movement history.' },
            { label: 'Last capital movement', value: summary.last_rotation_at ? shortDateTime(summary.last_rotation_at) : '—', tone: 'blue', description: 'Timestamp of the most recent executed capital movement in this backtest.' },
          ]}
        />
      </div>


      <ListToolbar
        query={query}
        onQueryChange={setQuery}
        placeholder={tr("Filter by sold or bought asset")}
        resultCount={filteredRows.length}
        resultLabel={filteredRows.length === 1 ? 'movement' : 'movements'}
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
                <td><span className={`rotation-asset from ${String(item.from_asset || 'CASH').toUpperCase() === 'CASH' ? 'cash' : ''}`}>{item.from_asset || 'CASH'}</span></td>
                <td><span className={`rotation-asset to ${String(item.to_asset || 'CASH').toUpperCase() === 'CASH' ? 'cash' : ''}`}>{item.to_asset || 'CASH'}</span></td>
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
