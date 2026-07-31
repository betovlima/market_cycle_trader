import { Field } from '../../../shared/components/Field'
import {
  ALL_ASSETS_VALUE,
  AVAILABLE_ASSETS,
  STRATEGY_CATALOG,
  dayTradeAlpacaStartDate,
  dayTradeYahooStartDate,
  swingAlpacaStartDate,
  swingYahooStartDate,
} from '../model/constants'
import { ASSET_DEFAULT_SETUPS, STRATEGY_PRESETS } from '../model/presets'

export function ConfigurationPanel({ workspace }) {
  const {
    form,
    setForm,
    setAssetsText,
    selectedAsset,
    setSelectedAsset,
    selectedStrategy,
    setSelectedStrategy,
    running,
    update,
    toggleRotationModel,
    runBacktest,
    selectedStrategyMetadata,
  } = workspace

  return (
    <>
        <div className="section-heading">
          <div>
            <span className="section-kicker">Configuration</span>
            <h2>
              {selectedStrategy === 'COMPOUND_ROTATION_DAY_TRADE_OPEN_CLOSE'
                ? 'Run Day Trade Open→Close'
                : 'Run a new backtest'}
            </h2>
          </div>
          <button
            className="button primary"
            onClick={runBacktest}
            disabled={running || form.rotation_models.length === 0}
          >
            {running
              ? 'Running…'
              : selectedStrategy === 'COMPOUND_ROTATION_DAY_TRADE_OPEN_CLOSE'
                ? 'Run Open→Close test'
                : selectedAsset === ALL_ASSETS_VALUE
                  ? 'Run all assets'
                  : `Run ${selectedAsset}`}
          </button>
        </div>

        <div className="form-grid primary-grid">
          <Field
            label="Assets"
            helper="Choose one asset or run the analysis for all configured assets."
          >
            <select
              value={selectedAsset}
              onChange={(event) => {
                const value = event.target.value
                setSelectedAsset(value)
                setAssetsText(
                  value === ALL_ASSETS_VALUE
                    ? AVAILABLE_ASSETS.join(', ')
                    : value,
                )
                const setup = ASSET_DEFAULT_SETUPS[value]
                if (setup) {
                  const {
                    setup_name: _setupName,
                    strategy_mode: _setupStrategyMode,
                    ...parameters
                  } = setup
                  const strategyPreset =
                    STRATEGY_PRESETS[selectedStrategy] || {}
                  setForm((current) => ({
                    ...current,
                    ...parameters,
                    ...strategyPreset,
                    strategy_mode: selectedStrategy,
                  }))
                }
              }}
            >
              <option value={ALL_ASSETS_VALUE}>All assets</option>
              {AVAILABLE_ASSETS.map((symbol) => (
                <option key={symbol} value={symbol}>
                  {symbol}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Start date">
            <input type="date" value={form.start_date} onChange={(event) => update('start_date', event.target.value)} />
          </Field>
          <Field label="End date" helper="Leave blank for the latest available session.">
            <input type="date" value={form.end_date} onChange={(event) => update('end_date', event.target.value)} />
          </Field>
          <Field
            label="Market data frequency"
            helper={
              selectedStrategy === 'COMPOUND_ROTATION_DAY_TRADE_OPEN_CLOSE'
                ? '15-minute source bars are aggregated into one leak-free session row: one pre-open decision, one optional position entered at the open, and mandatory exit at the same-session close.'
                : 'Fixed for this strategy: one daily OHLCV candle per trading session. Decisions are made after the close and executed at the next session open; positions can remain open overnight.'
            }
          >
            <select
              value={selectedStrategy === 'COMPOUND_ROTATION_DAY_TRADE_OPEN_CLOSE' ? '15Min' : '1Day'}
              disabled
            >
              {selectedStrategy === 'COMPOUND_ROTATION_DAY_TRADE_OPEN_CLOSE' ? (
                <option value="15Min">15-minute source → one session decision</option>
              ) : (
                <option value="1Day">Daily candles — fixed</option>
              )}
            </select>
          </Field>
          <Field
            label="Market data provider"
            helper={form.market_data_provider === 'alpaca'
              ? (selectedStrategy === 'COMPOUND_ROTATION_DAY_TRADE_OPEN_CLOSE'
                ? 'Default: Alpaca historical 15-minute bars. Recommended for long Day Trade training windows such as 2022 onward.'
                : 'Default: Alpaca historical daily bars. Swing can also be compared with Yahoo Finance when explicitly selected.')
              : (selectedStrategy === 'COMPOUND_ROTATION_DAY_TRADE_OPEN_CLOSE'
                ? 'Yahoo Finance 15-minute data is available only for a recent window (about 60 days). Selecting Yahoo automatically moves the start date to a safe recent window.'
                : 'Yahoo Finance is optional for Swing comparisons; Alpaca remains the system default.')}
          >
            <select
              value={form.market_data_provider}
              onChange={(event) => {
                const provider = event.target.value
                const isDayTrade = selectedStrategy === 'COMPOUND_ROTATION_DAY_TRADE_OPEN_CLOSE'
                setForm((current) => ({
                  ...current,
                  market_data_provider: provider,
                  start_date: isDayTrade
                    ? (provider === 'alpaca' ? dayTradeAlpacaStartDate() : dayTradeYahooStartDate())
                    : (provider === 'alpaca' ? swingAlpacaStartDate() : swingYahooStartDate()),
                }))
              }}
            >
              <option value="alpaca">Alpaca Market Data — default</option>
              <option value="yahoo">Yahoo Finance</option>
            </select>
          </Field>
          <Field
            label="Strategy"
            helper={selectedStrategyMetadata?.reason || 'Select a capital-rotation strategy.'}
          >
            <select
              value={selectedStrategy}
              onChange={(event) => {
                const value = event.target.value
                const preset = STRATEGY_PRESETS[value] || {}
                setSelectedStrategy(value)
                if (value === 'COMPOUND_ROTATION_DAY_TRADE_OPEN_CLOSE') {
                  setSelectedAsset(ALL_ASSETS_VALUE)
                  setAssetsText(AVAILABLE_ASSETS.join(', '))
                }
                setForm((current) => ({
                  ...current,
                  ...preset,
                  strategy_mode: value,
                }))
              }}
            >
              {STRATEGY_CATALOG.map((strategy) => (
                <option key={strategy.mode} value={strategy.mode}>
                  {strategy.label}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Initial capital">
            <input type="number" min="1" step="100" value={form.initial_capital} onChange={(event) => update('initial_capital', event.target.value)} />
          </Field>
          <div className="field">
            <span className="field-label">Capital rotation model</span>
            <div className="model-options">
              <label><input type="checkbox" disabled={running} checked={form.rotation_models.includes('xgboost_utility')} onChange={() => toggleRotationModel('xgboost_utility')} /> XGBoost Utility</label>
              <label><input type="checkbox" disabled={running} checked={form.rotation_models.includes('qrdqn')} onChange={() => toggleRotationModel('qrdqn')} /> QR-DQN</label>
            </div>
          </div>
        </div>

        {selectedStrategy === 'COMPOUND_ROTATION_DAY_TRADE_OPEN_CLOSE' && (
          <div className="settings-message" role="status">
            <strong>Open→Close Day Trade is enabled with a selectable market-data provider.</strong>{' '}
            The engine makes exactly one pre-open selection per trading session: CASH or one asset. The decision uses completed prior-session data, executes at the session open, never rotates intraday, and closes every position in the same session.
          </div>
        )}
    </>
  )
}
