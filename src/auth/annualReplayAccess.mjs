/** Shared capability check for the historical, read-only replay screen.
 * Existing Backtest readers must not lose the replay tab when the API sends
 * a legacy capability payload without annual_replay.view.
 * Replay-only guests have annual_replay.view without general Backtest access.
 */
export function canViewAnnualReplay(capabilities = {}) {
  return capabilities?.['annual_replay.view'] === true
    || capabilities?.['backtest.view'] === true
}
