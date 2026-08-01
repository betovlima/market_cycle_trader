export function MetricCard({
  label,
  value,
  note = null,
  href = null,
  onClick = null,
  disabled = false,
}) {
  const content = (
    <>
      <span>{label}</span>
      <strong>{value}</strong>
      {note && <small>{note}</small>}
    </>
  )

  if (onClick) {
    return (
      <button
        type="button"
        className="metric-card metric-card-link metric-card-button"
        onClick={onClick}
        disabled={disabled}
      >
        {content}
      </button>
    )
  }

  if (href) {
    return (
      <a className="metric-card metric-card-link" href={href}>
        {content}
      </a>
    )
  }

  return <article className="metric-card">{content}</article>
}
