import { useCallback, useMemo, useState } from 'react'

import { percent } from '../../../shared/formatters'
import { monthParts } from '../utils/performance'
import { ChartEmpty } from './AnalyticsPrimitives'
import { MonthlyReturnTooltip } from './MonthlyReturnTooltip'
import './monthlyReturnHeatmap.css'

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const TOOLTIP_WIDTH = 248
const TOOLTIP_PADDING = 12

function selectedModeLabel(mode) {
  if (mode === 'reference') return 'Reference'
  if (mode === 'excess') return 'Excess'
  return 'Simulation'
}

function mapMonthlyReturns(rows, mode) {
  const values = new Map()
  let maxAbs = 0

  ;(rows || []).forEach((row) => {
    const parts = monthParts(row.month)
    if (!parts) return

    const simulation = Number(row.simulation_return)
    const reference = Number(row.reference_return)
    if (!Number.isFinite(simulation) || !Number.isFinite(reference)) return

    const excess = simulation - reference
    const selectedValue = mode === 'reference' ? reference : mode === 'excess' ? excess : simulation

    values.set(`${parts.year}-${parts.month}`, { simulation, reference, excess, selectedValue })
    maxAbs = Math.max(maxAbs, Math.abs(selectedValue))
  })

  return { values, maxAbs }
}

export function MonthlyReturnHeatmap({ rows, mode }) {
  const [tooltip, setTooltip] = useState(null)
  const mapped = useMemo(() => mapMonthlyReturns(rows, mode), [mode, rows])
  const years = useMemo(() => [...new Set((rows || [])
    .map((row) => monthParts(row.month)?.year)
    .filter(Number.isFinite))]
    .sort((left, right) => left - right), [rows])

  const hideTooltip = useCallback(() => setTooltip(null), [])
  const showTooltip = useCallback((event, data) => {
    if (!data || typeof window === 'undefined') return
    const rect = event.currentTarget.getBoundingClientRect()
    const preferredLeft = rect.left + rect.width / 2 - TOOLTIP_WIDTH / 2
    const left = Math.min(
      window.innerWidth - TOOLTIP_WIDTH - TOOLTIP_PADDING,
      Math.max(TOOLTIP_PADDING, preferredLeft),
    )
    const showAbove = rect.top > 210
    setTooltip({
      ...data,
      left,
      top: showAbove ? rect.top - 10 : rect.bottom + 10,
      placement: showAbove ? 'above' : 'below',
    })
  }, [])

  if (!years.length) return <ChartEmpty>No monthly return observations in the selected range.</ChartEmpty>

  const modeLabel = selectedModeLabel(mode)

  return <>
    <div className="analytics-return-heatmap" role="grid" aria-label="Monthly return heatmap" onMouseLeave={hideTooltip}>
      <div className="analytics-heatmap-head" aria-hidden="true">
        <span />
        {MONTH_NAMES.map((name) => <span key={name}>{name}</span>)}
      </div>

      {years.map((year) => <div className="analytics-heatmap-row" key={year}>
        <strong>{year}</strong>
        {MONTH_NAMES.map((monthName, index) => {
          const data = mapped.values.get(`${year}-${index + 1}`)
          const present = Boolean(data && Number.isFinite(data.selectedValue))
          if (!present) return <span key={`${year}-${index}`} role="gridcell" className="analytics-heatmap-cell empty" aria-label={`${monthName} ${year}. No observation.`}>—</span>

          const alpha = Math.min(.78, .16 + (mapped.maxAbs ? Math.abs(data.selectedValue) / mapped.maxAbs : 0) * .62)
          const relativeResult = data.excess > 0 ? 'Simulation outperformed' : data.excess < 0 ? 'Reference outperformed' : 'Same performance'
          const tooltipData = {
            month: monthName,
            year,
            ...data,
            selectedModeLabel: modeLabel,
            relativeResult,
          }

          return <span
            key={`${year}-${index}`}
            role="gridcell"
            tabIndex={0}
            className={`analytics-heatmap-cell ${data.selectedValue >= 0 ? 'positive' : 'negative'}`}
            style={{ '--heat-alpha': alpha }}
            aria-label={`${monthName} ${year}. ${modeLabel} ${percent(data.selectedValue)}. Simulation ${percent(data.simulation)}. Reference ${percent(data.reference)}. Excess ${percent(data.excess)}.`}
            onMouseEnter={(event) => showTooltip(event, tooltipData)}
            onFocus={(event) => showTooltip(event, tooltipData)}
            onBlur={hideTooltip}
          >{percent(data.selectedValue)}</span>
        })}
      </div>)}
    </div>

    <MonthlyReturnTooltip tooltip={tooltip} />
  </>
}
