import { tr } from '../../i18n/runtime'

export function toInput(value) {
  return value === null || value === undefined ? '' : String(value)
}

export function numberValue(value, fallback = 0) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : fallback
}

export function optionalNumber(value) {
  if (value === '' || value === null || value === undefined) return null
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

export function numberListText(values) {
  return Array.isArray(values) ? values.join(', ') : ''
}

export function parseNumberList(value) {
  return String(value || '')
    .split(/[\s,;]+/)
    .map((item) => item.trim())
    .filter(Boolean)
    .map(Number)
    .filter(Number.isFinite)
}

export function manualCandidateText(values) {
  if (!Array.isArray(values)) return ''
  return values.map((item) => [item.drawdown_trigger, item.rotation_score_tolerance, item.challenger_quality_floor].filter((value) => value !== null && value !== undefined).join(', ')).join('\n')
}

export function parseManualCandidates(value) {
  return String(value || '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [drawdown, tolerance, qualityFloor] = line.split(/[\s,;]+/).filter(Boolean).map(Number)
      return { drawdown_trigger: drawdown, rotation_score_tolerance: tolerance, ...(Number.isFinite(qualityFloor) ? { challenger_quality_floor: qualityFloor } : {}) }
    })
    .filter((item) => Number.isFinite(item.drawdown_trigger) && Number.isFinite(item.rotation_score_tolerance))
}

export function statusLabel(value) {
  const normalized = String(value || '').toLowerCase()
  if (normalized === 'completed') return tr('Completed')
  if (normalized === 'running') return tr('Running')
  if (normalized === 'queued') return tr('Queued')
  if (normalized === 'failed') return tr('Failed')
  if (normalized === 'stopped') return tr('Stopped')
  if (normalized === 'stop_requested') return tr('Stop requested')
  return value || '—'
}

export function preferredDiagnosticCandidateId(evidence) {
  const bestId = evidence?.best_validated_candidate?.candidate_id
  if (bestId) return bestId
  const candidates = Array.isArray(evidence?.candidates) ? [...evidence.candidates] : []
  candidates.sort((a, b) => Number(b.ending_capital || 0) - Number(a.ending_capital || 0))
  return candidates[0]?.candidate_id || ''
}

export function evidenceWorkflowState(item) {
  if (!item) return '—'
  const status = String(item.status || '').toLowerCase()
  if (status !== 'completed') return statusLabel(item.status)
  if (item.passing_candidate_count === null || item.passing_candidate_count === undefined) return 'Completed'
  return Number(item.passing_candidate_count) > 0 ? 'PASS' : 'FAIL'
}
