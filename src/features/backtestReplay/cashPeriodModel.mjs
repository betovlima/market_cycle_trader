/** Cash exposure periods derived only from saved, executed portfolio rotations.
 *
 * The explicit asset -> CASH event establishes an entry into full CASH.
 * CASH -> asset establishes the exit. No new model decisions are inferred.
 * Session counts use persisted end-of-day equity observation dates; intraday
 * time-in-CASH cannot be measured from daily equity and is not estimated.
 */
function utcDate(value) {
  if (!value) return null
  const d = new Date(value)
  return Number.isFinite(d.getTime()) ? d.toISOString().slice(0, 10) : null
}

function normalizeAsset(value) {
  return String(value || '').trim().toUpperCase()
}

export const CASH_PERIOD_COLUMNS = [
  'entered_at', 'previous_asset', 'exited_at', 'next_asset',
  'observed_cash_sessions', 'first_cash_session', 'last_cash_session', 'status',
]

export function cashPeriodsFromAnalytics(payload) {
  const movements = (Array.isArray(payload?.rotations) ? payload.rotations : [])
    .map((item, index) => ({
      index,
      entered: String(item?.executed_at || ''),
      date: utcDate(item?.executed_at),
      from: normalizeAsset(item?.from_asset),
      to: normalizeAsset(item?.to_asset),
    }))
    .filter(item => item.date && item.from && item.to && item.from !== item.to)
    .sort((a, b) => a.entered.localeCompare(b.entered) || a.index - b.index)

  const periods = []
  let open = null
  for (const event of movements) {
    if (event.to === 'CASH' && event.from !== 'CASH') {
      if (open) {
        open.status = 'inconsistent_record'
        open.interrupted_at = event.entered
      }
      open = {
        entered_at: event.entered,
        previous_asset: event.from,
        exited_at: null,
        next_asset: null,
        observed_cash_sessions: 0,
        first_cash_session: null,
        last_cash_session: null,
        status: 'open_at_last_record',
        interrupted_at: null,
      }
      periods.push(open)
    } else if (event.from === 'CASH' && event.to !== 'CASH') {
      if (open) {
        open.exited_at = event.entered
        open.next_asset = event.to
        open.status = 'closed'
        open = null
      }
    } else if (open) {
      // An asset-to-asset transaction is inconsistent with a preceding CASH
      // entry that has no matching exit; do not extrapolate CASH beyond it.
      open.status = 'inconsistent_record'
      open.interrupted_at = event.entered
      open = null
    }
  }

  const recordedDays = [...new Set(
    (Array.isArray(payload?.equity) ? payload.equity : [])
      .filter(row => row?.simulation_equity != null && Number.isFinite(Number(row.simulation_equity)))
      .map(row => utcDate(row?.timestamp || row?.recorded_at))
      .filter(Boolean),
  )].sort()

  for (const day of recordedDays) {
    // Compare by dates because equity is one observation at the market close.
    // Exits executed on the same date remove that date from CASH-close counts.
    const period = periods.findLast(item =>
      item.entered_at.slice(0, 10) <= day
      && (!item.exited_at || item.exited_at.slice(0, 10) > day)
      && (!item.interrupted_at || item.interrupted_at.slice(0, 10) > day),
    )
    if (!period) continue
    period.observed_cash_sessions += 1
    period.first_cash_session ||= day
    period.last_cash_session = day
  }

  return periods.map(({ interrupted_at, ...record }) => ({ ...record }))
}
