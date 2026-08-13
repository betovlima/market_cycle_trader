export const ROTATION_PAGE_SIZE = 12

export const HISTORY_PAGE_SIZE = 10

export const ZOOM_STEP = 0.84


export const DAY_MS = 24 * 60 * 60 * 1000

export const METRIC_HINTS = {
  ending_capital: 'Portfolio capital at the end of the selected simulation after the modeled trades and transaction costs.',
  reference_ending_capital: 'Ending value of the reference Buy & Hold comparison over the same historical period.',
  cagr: 'Compound annual growth rate. It converts the total simulated growth into an annualized rate for easier comparison.',
  sharpe: 'Risk-adjusted return based on the variability of the simulated returns. Higher values indicate more return per unit of volatility.',
  maximum_drawdown: 'Largest peak-to-trough decline in portfolio equity during the simulation.',
  session_win_rate: 'Share of evaluated sessions in which the strategy produced a positive portfolio return.',
  total_rotations: 'Number of completed switches from one held asset to another asset or cash state.',
  profitable_rotations: 'Completed rotations whose closed position produced positive realized profit.',
  total_realized_pnl: 'Sum of realized profit and loss from positions closed during capital rotations.',
  average_holding_days: 'Average number of trading sessions the portfolio remained in a position before rotating out of it.',
}

export const HISTORY_HINTS = {
  created_at: 'When this backtest execution was created.',
  strategy_profile_name: 'Public display name of the strategy profile used by the backtest. Protected parameters remain server-side.',
  status: 'Current or terminal execution state for the backtest.',
  simulation_return: 'Total return produced by the simulated strategy over the test period.',
  sharpe: 'Risk-adjusted return of the simulation.',
  maximum_drawdown: 'Largest peak-to-trough decline during the simulation.',
  position_changes: 'Number of capital rotations recorded by the simulation.',
  duration_seconds: 'Wall-clock execution time of the backtest job.',
}

export const ROTATION_HINTS = {
  executed_at: 'Timestamp when the simulated capital switch was executed.',
  from_asset: 'Asset that was exited. This is the sell side of the rotation.',
  to_asset: 'Asset entered after the exit. This is the buy side of the rotation.',
  holding_days: 'Number of trading sessions the exited position was held.',
  position_return: 'Return of the position that was closed by this rotation.',
  realized_pnl: 'Profit or loss realized when the previous position was closed.',
  transaction_fees: 'Transaction costs attributed to the completed rotation.',
}
