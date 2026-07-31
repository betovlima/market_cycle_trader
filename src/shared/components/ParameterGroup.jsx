export function ParameterGroup({ title, description = null, children }) {
  return (
    <section className="parameter-group">
      <div className="parameter-group-heading">
        <h3>{title}</h3>
        {description && <p>{description}</p>}
      </div>
      <div className="form-grid advanced-grid">{children}</div>
    </section>
  )
}
