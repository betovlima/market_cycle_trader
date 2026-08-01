import { Field } from '../../../shared/components/Field'

export function ConfigurationPanel({ workspace }) {
  const {
    form,
    running,
    runBacktest,
    updateDate,
    maximumEndDate,
    dateValidationError,
  } = workspace

  return (
    <>
      <div className="section-heading">
        <div>
          <span className="section-kicker">Analysis</span>
          <h2>Evaluation window</h2>
          <p>Select only the period that should be displayed and evaluated.</p>
        </div>
        <button
          className="button primary"
          onClick={runBacktest}
          disabled={running || Boolean(dateValidationError)}
        >
          {running ? 'Running…' : 'Run analysis'}
        </button>
      </div>

      <div className="form-grid primary-grid public-date-grid">
        <Field label="Analysis from">
          <input
            type="date"
            value={form.start_date}
            max={form.end_date || maximumEndDate}
            onChange={(event) => updateDate('start_date', event.target.value)}
            disabled={running}
            required
            aria-invalid={!form.start_date || undefined}
          />
        </Field>
        <Field label="Analysis to" helper="Leave blank to use the latest available session.">
          <input
            type="date"
            value={form.end_date}
            min={form.start_date || undefined}
            max={maximumEndDate}
            onChange={(event) => updateDate('end_date', event.target.value)}
            disabled={running}
            aria-invalid={Boolean(dateValidationError) || undefined}
          />
        </Field>
      </div>

      {dateValidationError && (
        <div className="date-validation-message" role="alert">
          {dateValidationError}
        </div>
      )}
    </>
  )
}
