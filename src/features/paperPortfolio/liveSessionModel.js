/** Read-only projection of the Live API v10.8.124 fields into session-bar state.
 * Never use Paper data, invent broker schedules, or treat order control as a timer.
 */
export function liveSessionModel({ connection = {}, marketClock = null, robot = null, nextRefreshAt = null } = {}) {
  const connectionStatus = connection?.status || 'checking'
  const clockKnown = typeof marketClock?.is_open === 'boolean'
  const mode = String(robot?.control_mode || '').toLowerCase()
  const states = {
    active: { label: 'Active', tone: 'ready' },
    paused: { label: 'Paused', tone: 'checking' },
    exit_only: { label: 'Exit only', tone: 'checking' },
    stopped: { label: 'Stopped', tone: 'closed' },
  }
  const control = !robot
    ? { label: 'Checking', tone: 'checking' }
    : states[mode] || { label: 'Unavailable', tone: 'unavailable' }
  const run = robot?.active_run || robot?.latest_run || null

  return {
    connectionStatus,
    connectionReady: connectionStatus === 'ready',
    robotLabel: control.label,
    robotTone: control.tone,
    marketLabel: !clockKnown ? 'Market checking' : marketClock.is_open ? 'Market open' : 'Market closed',
    marketTone: !clockKnown ? 'checking' : marketClock.is_open ? 'ready' : 'closed',
    phase: String(run?.phase || robot?.phase || 'unknown').replaceAll('_', ' '),
    session: robot?.next_execution_session || run?.execution_session || null,
    postCloseAt: robot?.next_post_close_calibration_at || run?.post_close_calibration_at || null,
    openCalibrationAt: robot?.next_market_open_recalibration_at || run?.market_open_recalibration_at || null,
    executionAt: robot?.next_execution_at || run?.next_execution_at || null,
    closeAt: clockKnown ? marketClock?.next_close || null : null,
    refreshAt: robot?.monitoring_enabled === true ? nextRefreshAt : null,
    manualRefresh: robot?.monitoring_enabled === false,
  }
}
