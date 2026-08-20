import { useCallback, useEffect, useMemo, useState } from 'react'

import { tr } from '../../../i18n/runtime'
import { MetricLabel } from './BacktestPrimitives'
import { HeatmapLegend, MonthlyMovementDialog, MonthlyMovementTooltip } from './MonthlyCapitalMovementDetails'
import { aggregateHeatmapMetric, fullMonthName, heatmapMetric, monthMovementModel, monthNames } from './monthlyCapitalMovementModel'

const MONTH_TOOLTIP_WIDTH = 318
const MONTH_TOOLTIP_PADDING = 12

export function MonthlyCapitalMovementHeatmap({
  jobId,
  processingId = null,
  rotations,
  equity,
  allowDrilldown = true,
  allowAssetAnalysis = true,
  seriesOptions = null,
  defaultSeriesKey = null,
}: AppRecord) {
  const [mode, setMode] = useState('pnl')
  const [tooltip, setTooltip] = useState(null)
  const [selectedMonth, setSelectedMonth] = useState(null)
  const availableSeries = useMemo(() => {
    const supplied = Array.isArray(seriesOptions)
      ? seriesOptions.filter((item: AppRecord) => item && Array.isArray(item.rotations) && Array.isArray(item.equity) && item.equity.length)
      : []
    if (supplied.length) return supplied
    return [{
      key: 'default',
      label: null,
      rotations: Array.isArray(rotations) ? rotations : [],
      equity: Array.isArray(equity) ? equity : [],
      allowDrilldown,
      allowAssetAnalysis,
    }]
  }, [allowAssetAnalysis, allowDrilldown, equity, rotations, seriesOptions])
  const preferredSeriesKey = defaultSeriesKey && availableSeries.some((item: AppRecord) => item.key === defaultSeriesKey)
    ? defaultSeriesKey
    : (availableSeries[0]?.key || '')
  const [seriesKey, setSeriesKey] = useState(preferredSeriesKey)

  useEffect(() => {
    if (!availableSeries.some((item: AppRecord) => item.key === seriesKey)) setSeriesKey(preferredSeriesKey)
  }, [availableSeries, preferredSeriesKey, seriesKey])

  const selectedSeries = availableSeries.find((item: AppRecord) => item.key === seriesKey) || availableSeries[0]
  const selectedRotations = selectedSeries?.rotations || []
  const selectedEquity = selectedSeries?.equity || []
  const selectedAllowDrilldown = selectedSeries?.allowDrilldown ?? allowDrilldown
  const selectedAllowAssetAnalysis = selectedSeries?.allowAssetAnalysis ?? allowAssetAnalysis
  const model = useMemo(() => monthMovementModel(selectedRotations, selectedEquity), [selectedEquity, selectedRotations])
  const months = useMemo(monthNames, [])

  useEffect(() => {
    setTooltip(null)
    setSelectedMonth(null)
  }, [seriesKey])

  const hideTooltip = useCallback(() => setTooltip(null), [])
  const showTooltip = useCallback((event: any, month: AppRecord) => {
    if (!month || typeof window === 'undefined') return
    const rect = event.currentTarget.getBoundingClientRect()
    const preferredLeft = rect.left + rect.width / 2 - MONTH_TOOLTIP_WIDTH / 2
    const left = Math.min(window.innerWidth - MONTH_TOOLTIP_WIDTH - MONTH_TOOLTIP_PADDING, Math.max(MONTH_TOOLTIP_PADDING, preferredLeft))
    const showAbove = rect.top > 290
    setTooltip({
      ...month,
      left,
      top: showAbove ? rect.top - 10 : rect.bottom + 10,
      placement: showAbove ? 'above' : 'below',
    })
  }, [])

  useEffect(() => {
    if (!selectedMonth) return undefined
    const handler = (event: any) => { if (event.key === 'Escape') setSelectedMonth(null) }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [selectedMonth])

  if (!model.years.length) return null

  const options = [
    ['pnl', tr('Realized P/L')],
    ['movements', tr('Movements')],
    ['cash', 'CASH'],
    ['holding', tr('Holding')],
  ]

  return <>
    <article className="rotation-monthly-heatmap-panel">
      <div className="rotation-monthly-heatmap-heading">
        <div>
          <MetricLabel
            id="hint-monthly-capital-movement-heatmap"
            label={tr('Monthly Capital Movement Heatmap')}
            hint={tr('Summarizes the operational behavior of this backtest by month. Change the view to compare realized P/L, movement frequency, CASH sessions or average holding. Hover for a detailed summary and click a month to inspect its capital curve and movements.')}
          />
        </div>
        <div className="rotation-monthly-heatmap-heading-actions">
          {availableSeries.length > 1 ? <label className="rotation-monthly-series-selector">
            <span>{tr('Result series')}</span>
            <select value={seriesKey} onChange={(event: any) => setSeriesKey(event.target.value)}>
              {availableSeries.map((item: AppRecord) => <option key={item.key} value={item.key}>{item.label || item.key}</option>)}
            </select>
          </label> : null}
          <div className="rotation-monthly-heatmap-modes" role="group" aria-label={tr('Heatmap metric')}>
            {options.map(([key, label]: any[]) => <button key={key} type="button" className={mode === key ? 'active' : ''} onClick={() => setMode(key)}>{label}</button>)}
          </div>
        </div>
      </div>

      <div className="rotation-monthly-heatmap" role="grid" aria-label={tr('Monthly Capital Movement Heatmap')} onMouseLeave={hideTooltip}>
        <div className="rotation-monthly-heatmap-head" aria-hidden="true"><span />{months.map((name: string) => <span key={name}>{name}</span>)}<span className="summary-heading">{tr('Year total')}</span></div>
        {model.years.map((year: number) => {
          const yearMonths = months.map((monthName: string, index: number) => model.months.get(`${year}-${index + 1}`)).filter(Boolean)
          const yearMetric = aggregateHeatmapMetric(yearMonths, mode, model)
          return <div className="rotation-monthly-heatmap-row" key={year}>
          <strong>{year}</strong>
          {months.map((monthName: string, index: number) => {
            const month = model.months.get(`${year}-${index + 1}`)
            if (!month || !month.sessionCount && !month.movementCount) return <span key={`${year}-${index}`} className="rotation-monthly-heatmap-cell empty" role="gridcell">—</span>
            const metric = heatmapMetric(month, mode, model)
            return <button
              key={`${year}-${index}`}
              type="button"
              role="gridcell"
              className={`rotation-monthly-heatmap-cell ${metric.tone}`}
              style={{ '--movement-heat-alpha': Math.min(.82, metric.alpha) }}
              onMouseEnter={(event: any) => showTooltip(event, month)}
              onFocus={(event: any) => showTooltip(event, month)}
              onBlur={hideTooltip}
              onClick={selectedAllowDrilldown ? () => { hideTooltip(); setSelectedMonth(month) } : undefined}
              aria-label={`${fullMonthName(year, index + 1)}. ${metric.label}`}
            >{metric.label}</button>
          })}
          <span className={`rotation-monthly-heatmap-cell summary ${yearMetric.tone}`} style={{ '--movement-heat-alpha': Math.min(.82, yearMetric.alpha) }} role="gridcell">{yearMetric.label}</span>
        </div>})}
        <div className="rotation-monthly-heatmap-row totals-row">
          <strong>{tr('Total')}</strong>
          {months.map((monthName: string, index: number) => {
            const monthItems = model.years.map((year: number) => model.months.get(`${year}-${index + 1}`)).filter(Boolean)
            const metric = aggregateHeatmapMetric(monthItems, mode, model)
            return <span key={`total-${index}`} className={`rotation-monthly-heatmap-cell summary ${metric.tone}`} style={{ '--movement-heat-alpha': Math.min(.82, metric.alpha) }} role="gridcell">{metric.label}</span>
          })}
          {(() => {
            const metric = aggregateHeatmapMetric([...model.months.values()], mode, model)
            return <span className={`rotation-monthly-heatmap-cell summary grand-total ${metric.tone}`} style={{ '--movement-heat-alpha': Math.min(.82, metric.alpha) }} role="gridcell">{metric.label}</span>
          })()}
        </div>
      </div>
      <HeatmapLegend mode={mode} />
      <div className="rotation-monthly-heatmap-footer"><span>{tr('Hover for summary')}</span>{selectedAllowDrilldown ? <><span>·</span><span>{tr('Click a month for detailed analysis')}</span></> : null}</div>
    </article>
    <MonthlyMovementTooltip tooltip={tooltip} />
    {selectedAllowDrilldown ? <MonthlyMovementDialog jobId={jobId} processingId={processingId} month={selectedMonth} onClose={() => setSelectedMonth(null)} allowAssetAnalysis={selectedAllowAssetAnalysis} /> : null}
  </>
}

