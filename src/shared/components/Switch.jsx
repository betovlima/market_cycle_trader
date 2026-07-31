export function Switch({ label, checked, onChange }) {
  return (
    <label className="switch-row">
      <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} />
      <span className="switch-track" aria-hidden="true"><span /></span>
      <span>{label}</span>
    </label>
  )
}
