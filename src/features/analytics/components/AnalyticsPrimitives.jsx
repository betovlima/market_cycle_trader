import { tr } from '../../../i18n/runtime'
import { ParameterHint } from '../../../shared/components/ParameterHint'

export function SectionHeading({ kicker, title, description = '', action = null }) {
  return <div className="analytics-section-heading">
    <div>
      <span className="panel-kicker">{tr(kicker)}</span>
      <h2>{tr(title)}</h2>
      {description ? <p>{tr(description)}</p> : null}
    </div>
    {action}
  </div>
}

export function ChartCell({ kicker, title, children, className = '', action = null }) {
  return <div className={`analytics-chart-cell ${className}`}>
    <div className="analytics-chart-cell-heading">
      <div><span>{tr(kicker)}</span><strong>{tr(title)}</strong></div>
      {action}
    </div>
    {children}
  </div>
}

export function ChartEmpty({ children = 'Not enough observations for this chart.' }) {
  return <div className="analytics-empty">{typeof children === 'string' ? tr(children) : children}</div>
}

export function AnalyticsModeTabs({ value, onChange, items, label }) {
  return <div className="analytics-mode-tabs" role="tablist" aria-label={tr(label)}>
    {items.map((item) => <button
      key={item.value}
      type="button"
      role="tab"
      aria-selected={value === item.value}
      className={value === item.value ? 'active' : ''}
      onClick={() => onChange(item.value)}
    >{tr(item.label)}</button>)}
  </div>
}

export function AnalyticsDragHandle({ label, onDragStart, onDragEnd, onKeyDown }) {
  return <span
    className="analytics-drag-handle"
    draggable
    role="button"
    tabIndex={0}
    aria-label={tr("Move {label}. Drag to reorder or use the arrow keys.", { label: tr(label) })}
    title={tr("Drag to reorder")}
    onDragStart={onDragStart}
    onDragEnd={onDragEnd}
    onKeyDown={onKeyDown}
  ><span aria-hidden="true">⋮⋮</span></span>
}

export function AnalyticsMetric({ label, value, note, tone = '', description = '' }) {
  return <article className={`analytics-workspace-metric ${tone}`}>
    <div className="analytics-metric-label">
      <span>{tr(label)}</span>
      {description ? <ParameterHint
        id={`analytics-metric-${label.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`}
        title={tr(label)}
        description={tr(description)}
      /> : null}
    </div>
    <strong>{value}</strong>
    <small>{tr(note)}</small>
  </article>
}
