import { tr } from '../../../i18n/runtime'
import { createPortal } from 'react-dom'

import { percent } from '../../../shared/formatters'

export function MonthlyReturnTooltip({ tooltip }) {
  if (!tooltip || typeof document === 'undefined') return null

  return createPortal(
    <div
      className={`analytics-heatmap-tooltip ${tooltip.placement}`}
      style={{ left: `${tooltip.left}px`, top: `${tooltip.top}px` }}
      role="tooltip"
    >
      <div className="analytics-heatmap-tooltip-header">
        <div>
          <strong>{tooltip.month} {tooltip.year}</strong>
          <span>{tr("Monthly performance")}</span>
        </div>
        <b className={tooltip.selectedValue >= 0 ? 'positive' : 'negative'}>
          {percent(tooltip.selectedValue)}
        </b>
      </div>

      <div className="analytics-heatmap-tooltip-selected">
        <span>{tr("Current view")}</span>
        <strong>{tr(tooltip.selectedModeLabel)}</strong>
      </div>

      <div className="analytics-heatmap-tooltip-grid">
        <Metric label={tr("Simulation")} value={tooltip.simulation} />
        <Metric label={tr("Reference")} value={tooltip.reference} />
        <Metric label={tr("Excess")} value={tooltip.excess} signed />
      </div>

      <div className="analytics-heatmap-tooltip-result">
        <span className={`analytics-heatmap-tooltip-dot ${tooltip.excess >= 0 ? 'positive' : 'negative'}`} />
        <span>{tr(tooltip.relativeResult)}</span>
      </div>
    </div>,
    document.body,
  )
}

function Metric({ label, value, signed = false }) {
  return <div>
    <span>{tr(label)}</span>
    <strong className={value >= 0 ? 'positive' : 'negative'}>
      {signed && value > 0 ? '+' : ''}{percent(value)}
    </strong>
  </div>
}
