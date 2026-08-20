import { tr } from '../../i18n/runtime'

export function temporalStatusLabel(value: any) {
  const normalized = String(value || '').toLowerCase()
  if (normalized === 'completed') return tr('Completed')
  if (normalized === 'running') return tr('Running')
  if (normalized === 'queued') return tr('Queued')
  if (normalized === 'stop_requested') return tr('Stopping')
  if (normalized === 'cancelled') return tr('Stopped')
  if (normalized === 'interrupted') return tr('Interrupted')
  if (normalized === 'failed') return tr('Failed')
  return value || '—'
}
