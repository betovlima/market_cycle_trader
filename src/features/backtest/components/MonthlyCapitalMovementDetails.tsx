import { useMemo } from 'react'

import { tr } from '../../../i18n/runtime'
import { money, percent, shortDateTime } from '../../../shared/formatters'
import { MonthlyAssetAnalysis } from './MonthlyAssetAnalysis'
import { compactMoney, fullMonthName, movementTimestamp, normalizedMovementAsset } from './monthlyCapitalMovementModel'

export function HeatmapLegend({ mode }: AppRecord) {
  if (mode !== 'pnl') return <div className="rotation-monthly-heatmap-legend compact-legend">
    <span>{tr('Lower intensity')}</span>
    <i className={`rotation-heatmap-swatch ${mode}`} style={{ '--movement-heat-alpha': .18 }} />
    <i className={`rotation-heatmap-swatch ${mode}`} style={{ '--movement-heat-alpha': .42 }} />
    <i className={`rotation-heatmap-swatch ${mode}`} style={{ '--movement-heat-alpha': .74 }} />
    <span>{tr('Higher intensity')}</span>
  </div>
  return <div className="rotation-monthly-heatmap-legend">
    <span>{tr('Higher loss')}</span>
    <i className="rotation-heatmap-swatch negative" style={{ '--movement-heat-alpha': .74 }} />
    <i className="rotation-heatmap-swatch negative" style={{ '--movement-heat-alpha': .24 }} />
    <span>{tr('Near zero')}</span>
    <i className="rotation-heatmap-swatch positive" style={{ '--movement-heat-alpha': .24 }} />
    <i className="rotation-heatmap-swatch positive" style={{ '--movement-heat-alpha': .74 }} />
    <span>{tr('Higher gain')}</span>
    <em>{tr('Color intensity represents the magnitude of realized P/L in the displayed period.')}</em>
  </div>
}

function monthEquityPath(points: any[]) {
  if (!points?.length) return null
  const width = 760
  const height = 176
  const paddingX = 12
  const paddingY = 16
  const values = points.map((point: AppRecord) => Number(point.value)).filter(Number.isFinite)
  if (!values.length) return null
  const min = Math.min(...values)
  const max = Math.max(...values)
  const range = max - min || Math.max(1, Math.abs(max) * .01)
  const firstTs = points[0].timestamp
  const lastTs = points[points.length - 1].timestamp
  const span = lastTs - firstTs || 1
  const coordinates = points.map((point: AppRecord) => ({
    timestamp: point.timestamp,
    value: point.value,
    x: paddingX + ((point.timestamp - firstTs) / span) * (width - paddingX * 2),
    y: paddingY + (1 - (point.value - min) / range) * (height - paddingY * 2),
  }))
  const path = coordinates.map((point: AppRecord, index: number) => `${index ? 'L' : 'M'} ${point.x.toFixed(2)} ${point.y.toFixed(2)}`).join(' ')
  const area = `${path} L ${coordinates[coordinates.length - 1].x.toFixed(2)} ${(height - paddingY).toFixed(2)} L ${coordinates[0].x.toFixed(2)} ${(height - paddingY).toFixed(2)} Z`
  return { width, height, min, max, path, area, coordinates }
}

export function MonthlyMovementTooltip({ tooltip }: AppRecord) {
  if (!tooltip) return null
  const style = { left: `${tooltip.left}px`, top: `${tooltip.top}px` }
  return <div className={`rotation-month-tooltip ${tooltip.placement}`} style={style} role="tooltip">
    <div className="rotation-month-tooltip-title">
      <strong>{fullMonthName(tooltip.year, tooltip.month)}</strong>
      <span>{tr('Click for monthly details')}</span>
    </div>
    <div className="rotation-month-tooltip-grid">
      <span>{tr('Realized P/L')}</span><strong className={tooltip.totalRealizedPnl >= 0 ? 'positive' : 'negative'}>{money(tooltip.totalRealizedPnl)}</strong>
      <span>{tr('Capital Movements')}</span><strong>{tooltip.movementCount}</strong>
      <span>{tr('Asset → CASH')}</span><strong className="cash">{tooltip.marketToCash}</strong>
      <span>{tr('CASH → Market')}</span><strong className="positive">{tooltip.cashToMarket}</strong>
      <span>{tr('CASH Sessions')}</span><strong className="cash">{tooltip.cashSessions}</strong>
      <span>{tr('Market Exposure')}</span><strong>{tooltip.marketExposure == null ? '—' : percent(tooltip.marketExposure)}</strong>
      <span>{tr('Profitable Exits')}</span><strong className="positive">{tooltip.profitableExits}</strong>
      <span>{tr('Average Holding')}</span><strong>{tooltip.averageHolding == null ? '—' : tr('{count} days', { count: tooltip.averageHolding.toFixed(1) })}</strong>
    </div>
  </div>
}

export function MonthlyMovementDialog({ jobId, processingId = null, month, onClose, allowAssetAnalysis = true }: AppRecord) {
  const chart = useMemo(() => monthEquityPath(month?.equityPoints || []), [month])
  const capitalMarkers = useMemo(() => {
    if (!chart?.coordinates?.length || !month?.movements?.length) return []
    return month.movements.flatMap((movement: any, index: number) => {
      const timestamp = movementTimestamp(movement.executed_at)
      if (timestamp === null) return []
      let nearest = null
      let nearestDistance = Number.POSITIVE_INFINITY
      for (const point of chart.coordinates) {
        const distance = Math.abs(point.timestamp - timestamp)
        if (distance < nearestDistance) { nearest = point; nearestDistance = distance }
      }
      if (!nearest) return []
      const fromAsset = normalizedMovementAsset(movement.from_asset)
      const toAsset = normalizedMovementAsset(movement.to_asset)
      return [{ ...nearest, index, timestamp: movement.executed_at, fromAsset, toAsset, label: toAsset === 'CASH' ? 'CASH' : toAsset }]
    })
  }, [chart, month])
  if (!month) return null
  const exits = month.profitableExits + month.losingExits + month.flatExits
  const profitableRate = exits ? month.profitableExits / exits : null
  const hasDecisionContext = month.movements.some((item: AppRecord) => item?.decision_context)

  return <div className="rotation-month-dialog-backdrop" role="presentation" onMouseDown={onClose}>
    <section className="rotation-month-dialog" role="dialog" aria-modal="true" aria-label={fullMonthName(month.year, month.month)} onMouseDown={(event: any) => event.stopPropagation()}>
      <header className="rotation-month-dialog-header">
        <div>
          <span className="panel-kicker">{tr('Monthly capital movements')}</span>
          <h3>{fullMonthName(month.year, month.month)}</h3>
        </div>
        <button type="button" className="rotation-month-dialog-close" onClick={onClose} aria-label={tr('Close')}>×</button>
      </header>

      <div className="rotation-month-dialog-metrics">
        <div><span>{tr('Realized P/L')}</span><strong className={month.totalRealizedPnl >= 0 ? 'positive' : 'negative'}>{money(month.totalRealizedPnl)}</strong></div>
        <div><span>{tr('Capital Movements')}</span><strong>{month.movementCount}</strong></div>
        <div><span>{tr('Profitable exit rate')}</span><strong className="positive">{profitableRate == null ? '—' : percent(profitableRate)}</strong></div>
        <div><span>{tr('CASH Sessions')}</span><strong className="cash">{month.cashSessions}</strong></div>
        <div><span>{tr('Market Exposure')}</span><strong>{month.marketExposure == null ? '—' : percent(month.marketExposure)}</strong></div>
        <div><span>{tr('Average Holding')}</span><strong>{month.averageHolding == null ? '—' : tr('{count} days', { count: month.averageHolding.toFixed(1) })}</strong></div>
      </div>

      <div className="rotation-month-dialog-main">
        <article className="rotation-month-equity-card">
          <div className="rotation-month-dialog-section-title">
            <div><span>{tr('Capital during the month')}</span><strong>{month.firstEquity == null ? '—' : money(month.firstEquity)} → {month.lastEquity == null ? '—' : money(month.lastEquity)}</strong></div>
            <span className={month.equityReturn == null ? '' : month.equityReturn >= 0 ? 'positive' : 'negative'}>{month.equityReturn == null ? '—' : percent(month.equityReturn)}</span>
          </div>
          {chart ? <svg className="rotation-month-equity-chart" viewBox={`0 0 ${chart.width} ${chart.height}`} role="img" aria-label={tr('Monthly capital curve')}>
            <line x1="12" x2="748" y1="44" y2="44" />
            <line x1="12" x2="748" y1="88" y2="88" />
            <line x1="12" x2="748" y1="132" y2="132" />
            <path className="area" d={chart.area} />
            <path className="line" d={chart.path} />
            {capitalMarkers.map((marker: any) => <g key={`${marker.timestamp}-${marker.index}`} className={`capital-movement-marker ${marker.toAsset === 'CASH' ? 'cash' : 'market'}`}>
              <circle cx={marker.x} cy={marker.y} r="5.5" />
              <text x={marker.x} y={marker.y - 9}>{marker.label}</text>
              <title>{`${shortDateTime(marker.timestamp)} · ${marker.fromAsset} → ${marker.toAsset}`}</title>
            </g>)}
          </svg> : <div className="rotation-month-chart-empty">{tr('No equity observations for this month.')}</div>}
          <div className="rotation-month-equity-range"><span>{compactMoney(chart?.min)}</span><span>{compactMoney(chart?.max)}</span></div>
        </article>

        <aside className="rotation-month-insights">
          <div><span>{tr('Asset → Asset')}</span><strong>{month.assetToAsset}</strong></div>
          <div><span>{tr('Asset → CASH')}</span><strong className="cash">{month.marketToCash}</strong></div>
          <div><span>{tr('CASH → Market')}</span><strong className="positive">{month.cashToMarket}</strong></div>
          <div><span>{tr('Transaction fees')}</span><strong>{money(month.totalFees)}</strong></div>
          <div><span>{tr('Top bought asset')}</span><strong>{month.topBoughtAsset || '—'}</strong></div>
          <div><span>{tr('Top sold asset')}</span><strong>{month.topSoldAsset || '—'}</strong></div>
          <div><span>{tr('Best exit')}</span><strong className="positive">{month.bestExit ? `${normalizedMovementAsset(month.bestExit.from_asset)} · ${money(month.bestExit.realized_pnl)}` : '—'}</strong></div>
          <div><span>{tr('Worst exit')}</span><strong className="negative">{month.worstExit ? `${normalizedMovementAsset(month.worstExit.from_asset)} · ${money(month.worstExit.realized_pnl)}` : '—'}</strong></div>
        </aside>
      </div>

      {allowAssetAnalysis ? <MonthlyAssetAnalysis jobId={jobId} processingId={processingId} month={month} /> : null}

      <div className="rotation-month-dialog-table-wrap">
        <div className="rotation-month-dialog-section-title"><div><span>{tr('Capital movements')}</span><strong>{tr('{count} movements', { count: month.movementCount })}</strong></div></div>
        <div className="table-wrap">
          <table className="dashboard-table rotation-month-dialog-table">
            <thead><tr><th>{tr('Executed')}</th><th>{tr('Sold')}</th><th>{tr('Bought')}</th><th>{tr('Holding')}</th><th>{tr('Position Return')}</th><th>{tr('Realized P/L')}</th><th>{tr('Fees')}</th>{hasDecisionContext ? <th>{tr('Decision context')}</th> : null}</tr></thead>
            <tbody>{month.movements.length ? month.movements.map((item: AppRecord, index: number) => {
              const context = item?.decision_context
              const gap = context?.winner_top1_top2_score_gap ?? context?.top1_top2_asset_rank_gap
              return <tr key={`${item.executed_at}-${index}`}>
              <td>{shortDateTime(item.executed_at)}</td>
              <td><span className={`rotation-asset from ${normalizedMovementAsset(item.from_asset) === 'CASH' ? 'cash' : ''}`}>{item.from_asset || 'CASH'}</span></td>
              <td><span className={`rotation-asset to ${normalizedMovementAsset(item.to_asset) === 'CASH' ? 'cash' : ''}`}>{item.to_asset || 'CASH'}</span></td>
              <td>{item.holding_days == null ? '—' : tr('{count} days', { count: Number(item.holding_days).toFixed(0) })}</td>
              <td className={item.position_return == null ? '' : Number(item.position_return) >= 0 ? 'positive' : 'negative'}>{percent(item.position_return)}</td>
              <td className={item.realized_pnl == null ? '' : Number(item.realized_pnl) >= 0 ? 'positive' : 'negative'}>{money(item.realized_pnl)}</td>
              <td>{money(item.transaction_fees)}</td>
              {hasDecisionContext ? <td className="rotation-decision-context-cell">{context ? <>
                <strong>{context.action || '—'} · {context.reason || '—'}</strong>
                <span>Top-1 {context.top1?.symbol || '—'} · Top-2 {context.top2?.symbol || '—'}</span>
                <small>{tr('Top-1 / Top-2 gap')}: {gap == null ? '—' : Number(gap).toFixed(4)}</small>
              </> : '—'}</td> : null}
            </tr>}) : <tr><td colSpan={hasDecisionContext ? 8 : 7} className="empty-cell">{tr('No capital movements in this month.')}</td></tr>}</tbody>
          </table>
        </div>
      </div>
    </section>
  </div>
}

