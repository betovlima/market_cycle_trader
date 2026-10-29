/** Audited CASH exposure exclusively from saved end-of-session portfolio positions.
 *
 * selected_asset is produced by the backtest execution engine after next-open
 * order execution. A decision made at close(t) is not a position at close(t).
 * This module does not infer position from rotation events or fill missing dates.
 */
function utcDate(value) {
  if (!value) return null
  const d = new Date(value)
  return Number.isFinite(d.getTime()) ? d.toISOString().slice(0, 10) : null
}
function knownPosition(value) {
  const text = String(value || '').trim().toUpperCase()
  return text || null
}
export const CASH_PERIOD_COLUMNS = [
  'entered_at', 'previous_asset', 'exited_at', 'next_asset',
  'observed_cash_sessions', 'first_cash_session', 'last_cash_session', 'status',
]

export function cashPeriodsFromAnalytics(payload) {
  const equity = (Array.isArray(payload?.equity) ? payload.equity : [])
    .filter(row => row?.simulation_equity != null && Number.isFinite(Number(row.simulation_equity)))
    .map(row => ({
      date: utcDate(row?.timestamp || row?.recorded_at),
      asset: knownPosition(row?.selected_asset),
    }))
    .filter(row => row.date)
    .sort((a, b) => a.date.localeCompare(b.date))
  // The last saved observation for a session is authoritative.
  const dedup = [...new Map(equity.map(row => [row.date, row])).values()]
    .sort((a, b) => a.date.localeCompare(b.date))
  const periods = []
  let active = null
  let previous = null
  for (const row of dedup) {
    if (row.asset === 'CASH') {
      if (!active) {
        active = {
          entered_at: row.date,
          previous_asset: previous?.asset && previous.asset !== 'CASH' ? previous.asset : null,
          exited_at: null,
          next_asset: null,
          observed_cash_sessions: 0,
          first_cash_session: row.date,
          last_cash_session: row.date,
          status: 'open_at_last_record',
        }
        periods.push(active)
      }
      active.observed_cash_sessions += 1
      active.last_cash_session = row.date
    } else if (active) {
      if (row.asset) {
        active.exited_at = row.date
        active.next_asset = row.asset
        active.status = 'closed'
      } else {
        // Missing position metadata breaks continuity. Do not assume CASH.
        active.status = 'incomplete_record'
      }
      active = null
    }
    previous = row
  }
  return periods
}
