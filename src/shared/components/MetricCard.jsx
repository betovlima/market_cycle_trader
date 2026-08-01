export function MetricCard({ label, value, note = null, href = null }) {
  const content = (
    <>
      <span>{label}</span>
      <strong>{value}</strong>
      {note && <small>{note}</small>}
    </>
  )

  if (href) {
    return (
      <a className="metric-card metric-card-link" href={href}>
        {content}
      </a>
    )
  }

  return <article className="metric-card">{content}</article>
}
