import { tr } from '../../../i18n/runtime'
import { useEffect, useMemo, useState } from 'react'

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
