/**
 * Read-only presentation of the persisted Live Winner monitoring report.
 *
 * These flags are *display hints*. Never modify the authoritative run or
 * broker state, infer execution eligibility, or mark a failed run as successful.
 */
export function liveWorkflowDisplay(report) {
  const attempts = Array.isArray(report?.attempts) ? report.attempts : []
  const events = Array.isArray(report?.events) ? report.events : []
  const recentErrors = events
    .filter((event) => event?.level === 'error')
    .sort((a, b) => Date.parse(b.recorded_at || '') - Date.parse(a.recorded_at || ''))
    .slice(0, 3)
  // "Decision ready" is a persisted session status. It does not prove that
  // every older failure had the same root cause or that a model was re-trained.
  const readyWithoutRecovery = report?.status === 'recalibrated_no_orders'
    && report?.recovery === 'not_required'
    && Number(report?.orders_requiring_reconciliation || 0) === 0
  const latestError = Math.max(...events.filter((event) => event?.level === 'error')
    .map((event) => Date.parse(event.recorded_at || '')).filter(Number.isFinite), -Infinity)
  const latestPrepared = Math.max(...events.filter((event) => event?.stage === 'signal_prepared')
    .map((event) => Date.parse(event.recorded_at || '')).filter(Number.isFinite), -Infinity)
  const preparedAfterFailures = readyWithoutRecovery && recentErrors.length > 0
    && latestPrepared > latestError
  const hasDiagnostics = Boolean(report?.last_preparation_error_type
    || report?.last_open_calibration_error_type || recentErrors.length)
  return {
    recentErrors,
    hasDiagnostics,
    isHistorical: readyWithoutRecovery && hasDiagnostics,
    preparedAfterFailures,
    attempts,
  }
}

export function liveWorkflowAttemptStageKey(attempt) {
  // The API reports "recalibrated_no_orders" for *both* a newly prepared
  // D-1 signal and a quick idempotent recheck of an existing valid signal.
  // Without persisted training evidence, do not present them as retraining.
  if (attempt?.stage === 'post_close_calculation'
    && attempt?.status === 'completed'
    && attempt?.result_status === 'recalibrated_no_orders') {
    return 'D-1 signal ready (calculation or verification)'
  }
  return null
}
