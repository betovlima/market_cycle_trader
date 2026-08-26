import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'

import { tr } from '../../i18n/runtime'
import { number, percent } from '../formatters'
import './rocCurve.css'

const TICKS = [0, 0.25, 0.5, 0.75, 1]

function finite(value) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

function usableCurve(curve) {
  const points = curve?.roc?.points || []
  return Array.isArray(points) && points.length >= 2
}

function thresholdOriginLabel(origin) {
  const value = String(origin || '')
  if (value === 'validation_balanced_accuracy') return tr('Selected on validation')
  if (value === 'fixed_high_confidence_definition') return tr('Fixed high-confidence definition')
  if (value === 'chronological_validation_per_fold') return tr('Chronological validation by fold')
  if (value === 'chronological_validation_for_test_year') return tr('Chronological validation for test year')
  if (value === 'chronological_calibration_fold') return tr('Selected on chronological calibration')
  return value ? value.replaceAll('_', ' ') : '—'
}

function thresholdTitle(operating) {
  if (operating?.point_role === 'high_confidence_cutoff') return tr('High-confidence cutoff')
  if (operating?.threshold_mode === 'chronological_fold_thresholds') return tr('Threshold mode')
  return tr('Operating threshold')
}

function operatingThresholdLabel(operating) {
  if (!operating) return '—'
  if (operating.threshold_mode === 'chronological_fold_thresholds') return tr('Per-fold chronological')
  const threshold = finite(operating.threshold)
  return threshold == null ? '—' : number(threshold, 3)
}

function RocChart({ roc }) {
  const points = (roc?.points || [])
    .map((point) => ({ fpr: finite(point?.fpr), tpr: finite(point?.tpr), threshold: finite(point?.threshold) }))
    .filter((point) => point.fpr != null && point.tpr != null)
  if (points.length < 2) return null

  const plot = { left: 70, right: 650, top: 34, bottom: 354 }
  const mapX = (value) => plot.left + value * (plot.right - plot.left)
  const mapY = (value) => plot.bottom - value * (plot.bottom - plot.top)
  const path = points.map((point, index) => `${index ? 'L' : 'M'} ${mapX(point.fpr)} ${mapY(point.tpr)}`).join(' ')
  const operating = roc?.operating_point || {}
  const diagnostic = roc?.diagnostic_best_point || {}
  const operatingFpr = finite(operating.fpr)
  const operatingTpr = finite(operating.tpr)
  const diagnosticFpr = finite(diagnostic.fpr)
  const diagnosticTpr = finite(diagnostic.tpr)

  return <svg className="roc-curve-chart" viewBox="0 0 700 405" role="img" aria-label={tr('ROC curve')}>
    {TICKS.map((tick) => <g key={`x-${tick}`}>
      <line x1={mapX(tick)} y1={plot.top} x2={mapX(tick)} y2={plot.bottom} className="roc-grid-line" />
      <text x={mapX(tick)} y={plot.bottom + 22} textAnchor="middle" className="roc-axis-tick">{percent(tick, 0)}</text>
    </g>)}
    {TICKS.map((tick) => <g key={`y-${tick}`}>
      <line x1={plot.left} y1={mapY(tick)} x2={plot.right} y2={mapY(tick)} className="roc-grid-line" />
      <text x={plot.left - 12} y={mapY(tick) + 4} textAnchor="end" className="roc-axis-tick">{percent(tick, 0)}</text>
    </g>)}

    <line x1={plot.left} y1={plot.bottom} x2={plot.right} y2={plot.top} className="roc-random-line" />
    <path d={path} className="roc-model-line" />

    {diagnosticFpr != null && diagnosticTpr != null ? <g>
      <circle cx={mapX(diagnosticFpr)} cy={mapY(diagnosticTpr)} r="6" className="roc-diagnostic-point" />
      <circle cx={mapX(diagnosticFpr)} cy={mapY(diagnosticTpr)} r="11" className="roc-diagnostic-point-hit" />
    </g> : null}

    {operatingFpr != null && operatingTpr != null ? <g>
      <circle cx={mapX(operatingFpr)} cy={mapY(operatingTpr)} r="7" className="roc-operating-point" />
      <circle cx={mapX(operatingFpr)} cy={mapY(operatingTpr)} r="13" className="roc-operating-point-hit" />
    </g> : null}

    <text x={(plot.left + plot.right) / 2} y="397" textAnchor="middle" className="roc-axis-title">{tr('False Positive Rate')}</text>
    <text transform={`translate(17 ${(plot.top + plot.bottom) / 2}) rotate(-90)`} textAnchor="middle" className="roc-axis-title">{tr('True Positive Rate / Recall')}</text>
    <text x={plot.right - 8} y={plot.bottom - 8} textAnchor="end" className="roc-random-label">{tr('Random classifier')}</text>
  </svg>
}

function ThresholdStability({ curves, selected }) {
  const group = selected?.stabilityGroup
  if (!group) return null
  const rows = curves
    .filter((curve) => curve.stabilityGroup === group && finite(curve?.roc?.operating_point?.threshold) != null)
    .map((curve) => ({
      id: curve.id,
      period: curve.periodLabel || curve.label,
      threshold: finite(curve?.roc?.operating_point?.threshold),
      validation: finite(curve?.roc?.operating_point?.validation_metric_value),
      auc: finite(curve?.roc?.auc),
      recall: finite(curve?.roc?.operating_point?.tpr),
      fpr: finite(curve?.roc?.operating_point?.fpr),
    }))
  if (rows.length < 2) return null
  return <div className="roc-stability">
    <div className="roc-stability-title"><strong>{tr('Threshold stability')}</strong><span>{tr('Validation-selected thresholds compared across chronological folds or periods.')}</span></div>
    <div className="roc-stability-table-wrap"><table>
      <thead><tr><th>{tr('Fold / period')}</th><th>{tr('Threshold')}</th><th>{tr('Validation BA')}</th><th>AUC OOS</th><th>Recall OOS</th><th>FPR OOS</th></tr></thead>
      <tbody>{rows.map((row) => <tr key={row.id} className={row.id === selected.id ? 'selected' : ''}>
        <td>{row.period}</td><td>{number(row.threshold, 3)}</td><td>{row.validation == null ? '—' : percent(row.validation, 1)}</td><td>{row.auc == null ? '—' : number(row.auc, 3)}</td><td>{row.recall == null ? '—' : percent(row.recall, 1)}</td><td>{row.fpr == null ? '—' : percent(row.fpr, 1)}</td>
      </tr>)}</tbody>
    </table></div>
  </div>
}

function RocDialog({ curves, title, kicker, onClose }) {
  const available = useMemo(() => curves.filter(usableCurve), [curves])
  const [selectedId, setSelectedId] = useState(available[0]?.id || '')

  useEffect(() => {
    if (!available.some((curve) => curve.id === selectedId)) setSelectedId(available[0]?.id || '')
  }, [available, selectedId])

  if (!available.length || typeof document === 'undefined') return null
  const selected = available.find((curve) => curve.id === selectedId) || available[0]
  const roc = selected.roc || {}
  const operating = roc.operating_point || {}
  const diagnostic = roc.diagnostic_best_point || {}
  const validationMetric = finite(operating.validation_metric_value)
  const diagnosticThreshold = finite(diagnostic.threshold)
  const diagnosticBa = finite(diagnostic.balanced_accuracy)
  const operatingThreshold = finite(operating.threshold)
  const thresholdDelta = operatingThreshold != null && diagnosticThreshold != null ? operatingThreshold - diagnosticThreshold : null

  return createPortal(<div className="roc-dialog-backdrop" role="presentation" onMouseDown={onClose}>
    <section className="roc-dialog" role="dialog" aria-modal="true" aria-label={title} onMouseDown={(event) => event.stopPropagation()}>
      <header className="roc-dialog-header">
        <div><span className="panel-kicker">{tr(kicker)}</span><h3>{tr(title)}</h3></div>
        <button type="button" onClick={onClose} aria-label={tr('Close')}>×</button>
      </header>

      {available.length > 1 ? <div className="roc-dialog-selector">
        <span>{tr('Evaluation curve')}</span>
        <select value={selected.id} onChange={(event) => setSelectedId(event.target.value)}>
          {available.map((curve) => <option key={curve.id} value={curve.id}>{tr(curve.label)}</option>)}
        </select>
      </div> : <div className="roc-dialog-selected-label">{tr(selected.label)}</div>}

      <div className="roc-dialog-metrics">
        <div><span>AUC</span><strong>{finite(roc.auc) == null ? '—' : number(roc.auc, 3)}</strong></div>
        <div><span>{tr('Positive cases')}</span><strong>{roc.positive_count ?? '—'}</strong></div>
        <div><span>{tr('Negative cases')}</span><strong>{roc.negative_count ?? '—'}</strong></div>
        <div><span>{thresholdTitle(operating)}</span><strong>{operatingThresholdLabel(operating)}</strong></div>
        <div><span>{tr('Threshold origin')}</span><strong>{thresholdOriginLabel(operating.threshold_origin)}</strong></div>
        <div><span>{tr('Validation balanced accuracy')}</span><strong>{validationMetric == null ? '—' : percent(validationMetric, 1)}</strong></div>
        <div><span>{tr('Recall at selected point')}</span><strong>{finite(operating.tpr) == null ? '—' : percent(operating.tpr, 1)}</strong></div>
        <div><span>{tr('False positive rate')}</span><strong>{finite(operating.fpr) == null ? '—' : percent(operating.fpr, 1)}</strong></div>
        <div><span>{tr('Specificity')}</span><strong>{finite(operating.specificity) == null ? '—' : percent(operating.specificity, 1)}</strong></div>
        <div className="diagnostic"><span>{tr('OOS diagnostic best threshold')}</span><strong>{diagnosticThreshold == null ? '—' : number(diagnosticThreshold, 3)}</strong></div>
        <div className="diagnostic"><span>{tr('OOS diagnostic best BA')}</span><strong>{diagnosticBa == null ? '—' : percent(diagnosticBa, 1)}</strong></div>
        <div className="diagnostic"><span>{tr('Threshold delta vs diagnostic')}</span><strong>{thresholdDelta == null ? '—' : `${thresholdDelta >= 0 ? '+' : ''}${number(thresholdDelta, 3)}`}</strong></div>
      </div>

      <RocChart roc={roc} />
      <div className="roc-point-legend"><span><i className="selected" />{operating?.point_role === 'high_confidence_cutoff' ? tr('High-confidence cutoff') : tr('Selected threshold')}</span><span><i className="diagnostic" />{tr('OOS diagnostic best · not used for calibration')}</span></div>

      <ThresholdStability curves={available} selected={selected} />

      <div className="roc-dialog-reading">
        <span>{tr('The diagonal represents a classifier with no discrimination. Curves farther toward the upper-left show stronger separation between positive and negative cases.')}</span>
        {operating?.point_role === 'high_confidence_cutoff'
          ? <span>{tr('The marked selected point is the fixed high-confidence cutoff, not the Temporal decision threshold.')}</span>
          : operating?.threshold_mode === 'chronological_fold_thresholds'
            ? <span>{tr('The marked selected point combines the chronological thresholds selected independently inside each out-of-sample fold.')}</span>
            : finite(operating?.threshold) != null
              ? <span>{tr('The selected threshold was fixed before this OOS evaluation according to its recorded threshold origin.')}</span>
              : null}
        {diagnosticThreshold != null ? <span>{tr('The diagnostic point maximizes balanced accuracy on this OOS sample. It is displayed only to generate a future hypothesis and is never applied back to the same OOS test.')}</span> : null}
      </div>
    </section>
  </div>, document.body)
}

export function RocCurveControl({ curves = [], title = 'ROC Curve', kicker = 'MODEL EVALUATION', buttonLabel = 'ROC Curve', className = '' }) {
  const [open, setOpen] = useState(false)
  const available = useMemo(() => curves.filter(usableCurve), [curves])
  if (!available.length) return null
  return <>
    <button type="button" className={`secondary-action compact roc-curve-button ${className}`.trim()} onClick={() => setOpen(true)}>{tr(buttonLabel)}</button>
    {open ? <RocDialog curves={available} title={title} kicker={kicker} onClose={() => setOpen(false)} /> : null}
  </>
}
