export const AVAILABLE_ASSETS = ['NVDA', 'AAPL', 'MSFT', 'AMZN', 'GOOGL', 'META', 'TSLA', 'AMD', 'JPM', 'SPY']
export const ACTIVE_STRATEGY_MODE = 'COMPOUND_ROTATION_SWING_XGBOOST'
export const STRATEGY_CATALOG = [
  {
    mode: 'COMPOUND_ROTATION_SWING_XGBOOST',
    label: 'Compound Capital Rotation — XGBoost',
    status: 'official',
    executable: true,
    reason: 'Official Swing strategy with XGBoost Utility and the validated H40 configuration.',
  },
  {
    mode: 'COMPOUND_ROTATION_SWING_QRDQN',
    label: 'Compound Capital Rotation — QR-DQN',
    status: 'research',
    executable: true,
    reason: 'QR-DQN research strategy. QR0 Legacy remains the baseline for controlled optimization experiments.',
  },
  {
    mode: 'COMPOUND_ROTATION_DAY_TRADE_OPEN_CLOSE',
    label: 'Compound Capital Rotation — Day Trade Open→Close',
    status: 'evaluation',
    executable: true,
    reason: 'One pre-open decision per session, open execution and mandatory same-session close exit.',
  },
]

export function swingAlpacaStartDate() {
  return '2016-01-01'
}

export function swingYahooStartDate() {
  return '2000-01-01'
}

export function dayTradeAlpacaStartDate() {
  return '2022-01-03'
}

export function dayTradeYahooStartDate() {
  const date = new Date()
  date.setUTCDate(date.getUTCDate() - 55)
  return date.toISOString().slice(0, 10)
}

