import { Field } from '../../../shared/components/Field'
import {
  STRATEGY_CATALOG,
  dayTradeAlpacaStartDate,
  dayTradeYahooStartDate,
  swingAlpacaStartDate,
  swingYahooStartDate,
} from '../model/constants'
import { STRATEGY_PRESETS } from '../model/presets'

export function ConfigurationPanel({ workspace }) {
  const {
    form,
    setForm,
    assetsText,
    setAssetsText,
    selectedStrategy,
    setSelectedStrategy,
    running,
    update,
    toggleRotationModel,
    runBacktest,
    selectedStrategyMetadata,
  } = workspace

  const isDayTrade = selectedStrategy === 'COMPOUND_ROTATION_DAY_TRADE_OPEN_CLOSE'

  return (
    <>
      <div className="section-heading">
        <div>
          <span className="section-kicker">Configuration</span>
          <h2>{isDayTrade ? 'Run Day Trade Open→Close' : 'Run Compound Capital Rotation'}</h2>
        </div>
        <button className="button primary" onClick={runBacktest} disabled={running || form.rotation_models.length === 0}>
          {running ? 'Running…' : 'Run backtest'}
        </button>
      </div>

      <div className="form-grid primary-grid">
        <Field label="Assets" helper="Comma-separated universe. Capital rotates among these assets and cash.">
          <input value={assetsText} onChange={(event) => setAssetsText(event.target.value)} />
        </Field>
        <Field label="Start date">
          <input type="date" value={form.start_date} onChange={(event) => update('start_date', event.target.value)} />
        </Field>
        <Field label="End date" helper="Leave blank for the latest completed session.">
          <input type="date" value={form.end_date} onChange={(event) => update('end_date', event.target.value)} />
        </Field>
        <Field label="Market data frequency">
          <select value={isDayTrade ? '15Min' : '1Day'} disabled>
            <option value={isDayTrade ? '15Min' : '1Day'}>{isDayTrade ? '15-minute source → one session decision' : 'Daily candles — fixed'}</option>
          </select>
        </Field>
        <Field label="Market data provider">
          <select
            value={form.market_data_provider}
            onChange={(event) => {
              const provider = event.target.value
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
        <Field label="Strategy" helper={selectedStrategyMetadata?.reason || ''}>
          <select
            value={selectedStrategy}
            onChange={(event) => {
              const value = event.target.value
              const preset = STRATEGY_PRESETS[value] || {}
              setSelectedStrategy(value)
              setForm((current) => ({ ...current, ...preset, strategy_mode: value }))
            }}
          >
            {STRATEGY_CATALOG.map((strategy) => (
              <option key={strategy.mode} value={strategy.mode}>{strategy.label}</option>
            ))}
          </select>
        </Field>
        <Field label="Initial capital">
          <input type="number" min="1" step="100" value={form.initial_capital} onChange={(event) => update('initial_capital', event.target.value)} />
        </Field>
        <div className="field">
          <span className="field-label">Decision model</span>
          {isDayTrade ? (
            <div className="model-options">
              <label><input type="checkbox" disabled={running} checked={form.rotation_models.includes('xgboost_utility')} onChange={() => toggleRotationModel('xgboost_utility')} /> XGBoost Utility</label>
              <label><input type="checkbox" disabled={running} checked={form.rotation_models.includes('qrdqn')} onChange={() => toggleRotationModel('qrdqn')} /> QR-DQN</label>
            </div>
          ) : (
            <div className="model-options">
              <label><input type="checkbox" checked disabled />{selectedStrategy === 'COMPOUND_ROTATION_SWING_QRDQN' ? ' QR-DQN' : ' XGBoost Utility — H40 official'}</label>
            </div>
          )}
        </div>
      </div>
    </>
  )
}

