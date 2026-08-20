import { tr } from '../../../i18n/runtime'
import { ParameterHint } from '../../../shared/components/ParameterHint'
import { CANDIDATE_RANKING_HINTS } from '../modelTuningCandidateHints'

export function CandidateCardMetric({ candidateId, label, value, tone = '' }: AppRecord) {
  const hint = CANDIDATE_RANKING_HINTS[label]
  return (
    <div className={`model-tuning-candidate-metric ${tone}`}>
      <span className="model-tuning-candidate-metric-label">
        <span>{tr(label)}</span>
        {hint ? <ParameterHint id={`model-tuning-card-${candidateId}-${label.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`} title={tr(label)} {...hint} /> : null}
      </span>
      <strong>{value}</strong>
    </div>
  )
}

function tuningSettingValue(value: any) {
  if (typeof value === 'number') {
    if (Number.isInteger(value)) return String(value)
    return Number(value).toPrecision(7).replace(/0+$/, '').replace(/\.$/, '')
  }
  if (typeof value === 'boolean') return value ? tr('Yes') : tr('No')
  return value == null ? '—' : String(value)
}

export function CandidateParametersGrid({ settings }: AppRecord) {
  const entries = Object.entries(settings || {})
  if (!entries.length) return null
  return (
    <div className="model-tuning-parameters-dialog-grid">
      {entries.map(([name, value]: any[]) => (
        <div key={name} className="model-tuning-parameters-dialog-row">
          <span title={name}>{name}</span>
          <strong>{tuningSettingValue(value)}</strong>
        </div>
      ))}
    </div>
  )
}

export function signedMetricTone(value: any) {
  const parsed = Number(value)
  if (!Number.isFinite(parsed) || parsed === 0) return 'neutral'
  return parsed > 0 ? 'positive' : 'negative'
}

export function probabilityMetricTone(value: any) {
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) return 'neutral'
  if (parsed >= 0.65) return 'positive'
  if (parsed >= 0.35) return 'warning'
  return 'negative'
}

export function TuningContextLabel({ id, label, description, align = 'left' }: AppRecord) {
  return (
    <span className="model-tuning-context-label">
      <span>{tr(label)}</span>
      {description ? <ParameterHint id={id} title={tr(label)} description={description} align={align} /> : null}
    </span>
  )
}
