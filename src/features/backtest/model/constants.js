export const classicFibonacciRatios = [
  { value: 1.272, label: '1.272 — Conservative extension' },
  { value: 1.414, label: '1.414 — Intermediate extension' },
  { value: 1.618, label: '1.618 — Golden ratio extension' },
  { value: 2.000, label: '2.000 — Double range' },
  { value: 2.618, label: '2.618 — Extended target' },
  { value: 3.618, label: '3.618 — Long extension' },
  { value: 4.236, label: '4.236 — Maximum classic extension' },
]

export function normalizeFibonacciRatio(value) {
  const numericValue = Number(value)
  const match = classicFibonacciRatios.find(
    (item) => Math.abs(item.value - numericValue) < 0.0000001,
  )
  return match?.value ?? 1.618
}

export function dayTradeAlpacaStartDate() {
  return '2022-01-03'
}

export function dayTradeYahooStartDate() {
  const date = new Date()
  date.setUTCDate(date.getUTCDate() - 55)
  return date.toISOString().slice(0, 10)
}

export function swingAlpacaStartDate() {
  return '2016-01-01'
}

export function swingYahooStartDate() {
  return '2000-01-01'
}

export const swingTimeframeProfiles = {
  '1Week': {
    start_date: '2000-01-01',
    future_horizon: 4,
    extrema_lookback: 10,
    reversal_threshold: 0.03,
    extrema_tolerance: 0.03,
    event_tolerance_bars: 1,
    retrain_every_bars: 13,
    minimum_training_rows: 500,
    minimum_calibration_signals: 1,
    entry_cooldown_bars: 1,
    minimum_holding_bars: 1,
    fibonacci_swing_lookback: 26,
    fibonacci_low_lookback: 3,
  },
  '2Weeks': {
    start_date: '2000-01-01',
    future_horizon: 3,
    extrema_lookback: 8,
    reversal_threshold: 0.025,
    extrema_tolerance: 0.04,
    event_tolerance_bars: 1,
    retrain_every_bars: 7,
    minimum_training_rows: 250,
    minimum_calibration_signals: 1,
    entry_cooldown_bars: 1,
    minimum_holding_bars: 1,
    fibonacci_swing_lookback: 13,
    fibonacci_low_lookback: 2,
  },
  '3Weeks': {
    start_date: '2000-01-01',
    future_horizon: 3,
    extrema_lookback: 7,
    reversal_threshold: 0.02,
    extrema_tolerance: 0.05,
    event_tolerance_bars: 1,
    retrain_every_bars: 5,
    minimum_training_rows: 160,
    minimum_calibration_signals: 1,
    entry_cooldown_bars: 1,
    minimum_holding_bars: 1,
    fibonacci_swing_lookback: 9,
    fibonacci_low_lookback: 2,
  },
  '4Weeks': {
    start_date: '2000-01-01',
    future_horizon: 3,
    extrema_lookback: 6,
    reversal_threshold: 0.02,
    extrema_tolerance: 0.05,
    event_tolerance_bars: 1,
    retrain_every_bars: 4,
    minimum_training_rows: 100,
    minimum_calibration_signals: 1,
    entry_cooldown_bars: 1,
    minimum_holding_bars: 1,
    fibonacci_swing_lookback: 7,
    fibonacci_low_lookback: 2,
  },
}

export const AVAILABLE_ASSETS = ['NVDA', 'AAPL', 'MSFT', 'AMZN', 'GOOGL', 'META', 'TSLA', 'AMD', 'JPM', 'SPY']
export const ALL_ASSETS_VALUE = '__ALL__'

export const ACTIVE_STRATEGY_MODE = 'COMPOUND_ROTATION_SWING_1W'

export const STRATEGY_CATALOG = [
  {
    mode: 'COMPOUND_ROTATION_SWING_1W',
    label: 'Compound Capital Rotation — Swing',
    status: 'evaluation',
    executable: true,
    reason: 'Official shared-capital Swing configuration using XGBoost Utility H40. QR-DQN remains available as an experimental challenger.',
  },
  {
    mode: 'COMPOUND_ROTATION_DAY_TRADE_OPEN_CLOSE',
    label: 'Compound Capital Rotation — Day Trade Open→Close',
    status: 'evaluation',
    executable: true,
    reason: 'One decision per session: choose CASH or one asset before the regular-session open using only completed prior-session information, enter at the open, hold through the day, and close at the regular-session close. No intraday rotations and no overnight exposure.',
  },
]
