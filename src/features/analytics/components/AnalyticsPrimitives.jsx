import { ParameterHint } from '../../../shared/components/ParameterHint'

export function SectionHeading({ kicker, title, description = '', action = null }) {
  return <div className="analytics-section-heading">
    <div>
      <span className="panel-kicker">{kicker}</span>
      <h2>{title}</h2>
      {description ? <p>{description}</p> : null}
    </div>
    {action}
  </div>
}

export function ChartCell({ kicker, title, children, className = '', action = null }) {
  return <div className={`analytics-chart-cell ${className}`}>
    <div className="analytics-chart-cell-heading">
      <div><span>{kicker}</span><strong>{title}</strong></div>
      {action}
    </div>
    {children}
  </div>
}

export function ChartEmpty({ children = 'Not enough observations for this chart.' }) {
  return <div className="analytics-empty">{children}</div>
}

export function AnalyticsModeTabs({ value, onChange, items, label }) {
  return <div className="analytics-mode-tabs" role="tablist" aria-label={label}>
    {items.map((item) => <button
      key={item.value}
      type="button"
      role="tab"
      aria-selected={value === item.value}
      className={value === item.value ? 'active' : ''}
      onClick={() => onChange(item.value)}
    >{item.label}</button>)}
  </div>
}

export function AnalyticsDragHandle({ label, onDragStart, onDragEnd, onKeyDown }) {
  return <span
    className="analytics-drag-handle"
    draggable
    role="button"
    tabIndex={0}
    aria-label={`Move ${label}. Drag to reorder or use the arrow keys.`}
    title="Drag to reorder"
    onDragStart={onDragStart}
    onDragEnd={onDragEnd}
    onKeyDown={onKeyDown}
  ><span aria-hidden="true">⋮⋮</span></span>
}

export function AnalyticsMetric({ label, value, note, tone = '', description = '' }) {
  return <article className={`analytics-workspace-metric ${tone}`}>
    <div className="analytics-metric-label">
      <span>{label}</span>
      {description ? <ParameterHint
        id={`analytics-metric-${label.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`}
        title={label}
        description={description}
      /> : null}
    </div>
    <strong>{value}</strong>
    <small>{note}</small>
  </article>
}
