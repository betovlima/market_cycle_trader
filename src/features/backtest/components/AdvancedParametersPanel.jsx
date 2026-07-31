import { Field } from '../../../shared/components/Field'
import { ParameterGroup } from '../../../shared/components/ParameterGroup'
import { Switch } from '../../../shared/components/Switch'
import { classicFibonacciRatios } from '../model/constants'

export function AdvancedParametersPanel({ workspace }) {
  const {
    form,
    selectedStrategy,
    savingSettings,
    settingsMessage,
    computeStatus,
    alpacaIntegration,
    alpacaApiKeyId,
    setAlpacaApiKeyId,
    alpacaSecretKey,
    setAlpacaSecretKey,
    alpacaMessage,
    alpacaBusy,
    showJsonConfig,
    setShowJsonConfig,
    configJsonText,
    setConfigJsonText,
    configJsonBusy,
    configJsonMessage,
    running,
    saveSettings,
    resetSettings,
    update,
    toggleExitRiskBackend,
    loadSwingHeadToHeadJson,
    loadCurrentConfigurationJson,
    validateConfigurationJson,
    applyConfigurationJson,
    saveAndTestAlpaca,
    testStoredAlpaca,
    removeAlpaca,
  } = workspace

  return (
          <div className="advanced-panel">
            <div className="section-heading">
              <div>
                <span className="section-kicker">Configuration</span>
                <h2>Advanced parameters</h2>
                <p>
                  Calibration, strategy, execution-cost, model and data-source settings.
                </p>
              </div>
            </div>

          <div className="parameter-toolbar">
            <div>
              <strong>MongoDB-backed settings</strong>
              <span>Running a backtest also saves the values currently shown here.</span>
            </div>
            <div className="inline-actions">
              <button className="button secondary" type="button" onClick={() => setShowJsonConfig((current) => !current)} disabled={running}>
                {showJsonConfig ? 'Hide JSON configuration' : 'JSON configuration'}
              </button>
              <button className="button secondary" type="button" onClick={saveSettings} disabled={savingSettings || running}>
                {savingSettings ? 'Saving…' : 'Save parameters'}
              </button>
              <button className="button ghost" type="button" onClick={resetSettings} disabled={savingSettings || running}>
                Restore defaults
              </button>
            </div>
          </div>

          {showJsonConfig && (
            <section style={{ margin: '16px 0 20px' }}>
              <div className="section-heading compact">
                <div>
                  <span className="section-kicker">Fast experiment setup</span>
                  <h3>JSON configuration</h3>
                  <p>Validate and apply a parameter JSON through the API. Alpaca credentials are intentionally excluded.</p>
                </div>
              </div>
              <textarea
                value={configJsonText}
                onChange={(event) => setConfigJsonText(event.target.value)}
                spellCheck="false"
                placeholder={'{\n  "strategy_mode": "COMPOUND_ROTATION_SWING_1W",\n  "rotation_models": ["xgboost_utility"],\n  "rotation_horizon_days": 40,\n  "rotation_purge_days": 60\n}'}
                style={{
                  width: '100%',
                  minHeight: '320px',
                  resize: 'vertical',
                  fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
                  fontSize: '13px',
                  lineHeight: 1.5,
                  padding: '14px',
                  boxSizing: 'border-box',
                }}
                disabled={configJsonBusy || running}
              />
              <div className="inline-actions" style={{ marginTop: '12px', flexWrap: 'wrap' }}>
                <button className="button ghost" type="button" onClick={loadSwingHeadToHeadJson} disabled={configJsonBusy || running}>
                  Load Swing XGB vs QR-DQN
                </button>
                <button className="button ghost" type="button" onClick={loadCurrentConfigurationJson} disabled={configJsonBusy || running}>
                  Load current screen
                </button>
                <button className="button secondary" type="button" onClick={validateConfigurationJson} disabled={configJsonBusy || running || !configJsonText.trim()}>
                  {configJsonBusy ? 'Working…' : 'Validate JSON'}
                </button>
                <button className="button primary" type="button" onClick={applyConfigurationJson} disabled={configJsonBusy || running || !configJsonText.trim()}>
                  Apply JSON to MongoDB
                </button>
              </div>
              {configJsonMessage && <div className="settings-message" style={{ marginTop: '12px' }}>{configJsonMessage}</div>}
            </section>
          )}

          {settingsMessage && <div className="settings-message">{settingsMessage}</div>}

          <ParameterGroup
            title="Extrema and dataset"
            description="Defines the event labels, test period and walk-forward retraining."
          >
            <Field label="Future horizon"><input type="number" min="1" value={form.future_horizon} onChange={(event) => update('future_horizon', event.target.value)} /></Field>
            <Field label="Extrema lookback"><input type="number" min="2" value={form.extrema_lookback} onChange={(event) => update('extrema_lookback', event.target.value)} /></Field>
            <Field label="Reversal threshold"><input type="number" min="0.001" step="0.005" value={form.reversal_threshold} onChange={(event) => update('reversal_threshold', event.target.value)} /></Field>
            <Field label="Extrema tolerance"><input type="number" min="0" step="0.005" value={form.extrema_tolerance} onChange={(event) => update('extrema_tolerance', event.target.value)} /></Field>
            <Field label="Event tolerance bars"><input type="number" min="0" value={form.event_tolerance_bars} onChange={(event) => update('event_tolerance_bars', event.target.value)} /></Field>
            <Field label="Calibration fraction"><input type="number" min="0.05" max="0.4" step="0.01" value={form.calibration_fraction} onChange={(event) => update('calibration_fraction', event.target.value)} /></Field>
            <Field label="Test fraction"><input type="number" min="0.05" max="0.4" step="0.01" value={form.test_fraction} onChange={(event) => update('test_fraction', event.target.value)} /></Field>
            <Field label="Retrain every bars"><input type="number" min="1" value={form.retrain_every_bars} onChange={(event) => update('retrain_every_bars', event.target.value)} /></Field>
            <Field label="Minimum training rows"><input type="number" min="100" value={form.minimum_training_rows} onChange={(event) => update('minimum_training_rows', event.target.value)} /></Field>
          </ParameterGroup>

          <ParameterGroup
            title="Probability calibration"
            description="Calibrates BOTTOM and TOP independently so restrictive TOP rules do not block BOTTOM entries."
          >
            <Field label="Threshold minimum"><input type="number" min="0.01" max="0.99" step="0.025" value={form.threshold_min} onChange={(event) => update('threshold_min', event.target.value)} /></Field>
            <Field label="Threshold step"><input type="number" min="0.001" max="0.5" step="0.005" value={form.threshold_step} onChange={(event) => update('threshold_step', event.target.value)} /></Field>

            <Field label="BOTTOM threshold maximum"><input type="number" min="0.01" max="0.99" step="0.025" value={form.bottom_threshold_max} onChange={(event) => update('bottom_threshold_max', event.target.value)} /></Field>
            <Field label="BOTTOM minimum precision"><input type="number" min="0.05" max="0.99" step="0.01" value={form.bottom_min_precision} onChange={(event) => update('bottom_min_precision', event.target.value)} /></Field>
            <Field label="BOTTOM minimum recall"><input type="number" min="0" max="0.99" step="0.01" value={form.bottom_min_recall} onChange={(event) => update('bottom_min_recall', event.target.value)} /></Field>
            <Field label="BOTTOM minimum calibration signals"><input type="number" min="1" value={form.bottom_min_calibration_signals} onChange={(event) => update('bottom_min_calibration_signals', event.target.value)} /></Field>

            <Field label="TOP threshold maximum"><input type="number" min="0.01" max="0.99" step="0.025" value={form.top_threshold_max} onChange={(event) => update('top_threshold_max', event.target.value)} /></Field>
            <Field label="TOP minimum precision"><input type="number" min="0.05" max="0.99" step="0.01" value={form.top_min_precision} onChange={(event) => update('top_min_precision', event.target.value)} /></Field>
            <Field label="TOP minimum recall"><input type="number" min="0" max="0.99" step="0.01" value={form.top_min_recall} onChange={(event) => update('top_min_recall', event.target.value)} /></Field>
            <Field label="TOP minimum calibration signals"><input type="number" min="1" value={form.top_min_calibration_signals} onChange={(event) => update('top_min_calibration_signals', event.target.value)} /></Field>
          </ParameterGroup>

          <ParameterGroup
            title="Entry rules"
            description="Filters BOTTOM signals before capital is allocated."
          >
            <Field label="Entry maximum RSI"><input type="number" min="0" max="100" value={form.entry_max_rsi} onChange={(event) => update('entry_max_rsi', event.target.value)} /></Field>
            <Field label="Entry cooldown bars"><input type="number" min="0" value={form.entry_cooldown_bars} onChange={(event) => update('entry_cooldown_bars', event.target.value)} /></Field>
            <Field label="Pullback EMA"><input type="number" min="5" value={form.trend_pullback_ema} onChange={(event) => update('trend_pullback_ema', event.target.value)} /></Field>
            <Field label="Pullback RSI minimum"><input type="number" min="0" max="100" value={form.trend_pullback_rsi_min} onChange={(event) => update('trend_pullback_rsi_min', event.target.value)} /></Field>
            <Field label="Pullback RSI maximum"><input type="number" min="0" max="100" value={form.trend_pullback_rsi_max} onChange={(event) => update('trend_pullback_rsi_max', event.target.value)} /></Field>
            <Field label="Pullback touch tolerance"><input type="number" min="0" max="0.5" step="0.005" value={form.trend_pullback_touch_tolerance} onChange={(event) => update('trend_pullback_touch_tolerance', event.target.value)} /></Field>
            <Field label="Bull regime EMA fast"><input type="number" min="5" value={form.bull_regime_ema_fast} onChange={(event) => update('bull_regime_ema_fast', event.target.value)} /></Field>
            <Field label="Bull regime EMA slow"><input type="number" min="10" value={form.bull_regime_ema_slow} onChange={(event) => update('bull_regime_ema_slow', event.target.value)} /></Field>
            <Field label="Bull regime entry confirmations"><input type="number" min="1" max="50" value={form.bull_regime_entry_confirmation_bars} onChange={(event) => update('bull_regime_entry_confirmation_bars', event.target.value)} /></Field>
            <div className="switch-group">
              <Switch label="Use trend-pullback entry" checked={form.trend_pullback_entry_enabled} onChange={(value) => update('trend_pullback_entry_enabled', value)} />
              <Switch label="Require positive pullback candle" checked={form.trend_pullback_require_positive_return} onChange={(value) => update('trend_pullback_require_positive_return', value)} />
              <Switch label="Use adaptive bull regime" checked={form.adaptive_bull_regime_enabled} onChange={(value) => update('adaptive_bull_regime_enabled', value)} />
              <Switch label="Enter directly in confirmed bull regime" checked={form.bull_regime_entry_enabled} onChange={(value) => update('bull_regime_entry_enabled', value)} />
              <Switch label="Require price above slow bull EMA" checked={form.bull_regime_require_price_above_slow} onChange={(value) => update('bull_regime_require_price_above_slow', value)} />
              <Switch label="Require rising slow bull EMA" checked={form.bull_regime_require_slow_ema_rising} onChange={(value) => update('bull_regime_require_slow_ema_rising', value)} />
              <Switch label="Require BOTTOM entry above EMA 50" checked={form.entry_require_above_ema50} onChange={(value) => update('entry_require_above_ema50', value)} />
              <Switch label="Use whole shares only" checked={form.whole_shares} onChange={(value) => update('whole_shares', value)} />
            </div>
          </ParameterGroup>

          <ParameterGroup
            title="Exit and trend confirmation"
            description="Includes the two-candle trend confirmation introduced in Exit Review V3."
          >
            <Field label="Minimum holding bars"><input type="number" min="0" value={form.minimum_holding_bars} onChange={(event) => update('minimum_holding_bars', event.target.value)} /></Field>
            <Field label="ATR trailing multiplier"><input type="number" min="0.1" step="0.1" value={form.atr_trailing_multiplier} onChange={(event) => update('atr_trailing_multiplier', event.target.value)} /></Field>
            <Field label="Tightened ATR multiplier"><input type="number" min="0.1" step="0.1" value={form.tightened_atr_multiplier} onChange={(event) => update('tightened_atr_multiplier', event.target.value)} /></Field>
            <Field label="Trend EMA fast"><input type="number" min="1" value={form.trend_exit_ema_fast} onChange={(event) => update('trend_exit_ema_fast', event.target.value)} /></Field>
            <Field label="Trend EMA slow"><input type="number" min="2" value={form.trend_exit_ema_slow} onChange={(event) => update('trend_exit_ema_slow', event.target.value)} /></Field>
            <Field label="Trend confirmation bars"><input type="number" min="1" value={form.trend_breakdown_confirmation_bars} onChange={(event) => update('trend_breakdown_confirmation_bars', event.target.value)} /></Field>
            <Field label="Bull exit EMA fast"><input type="number" min="5" value={form.bull_exit_ema_fast} onChange={(event) => update('bull_exit_ema_fast', event.target.value)} /></Field>
            <Field label="Bull exit EMA slow"><input type="number" min="10" value={form.bull_exit_ema_slow} onChange={(event) => update('bull_exit_ema_slow', event.target.value)} /></Field>
            <Field label="Bull exit confirmation bars"><input type="number" min="1" value={form.bull_exit_confirmation_bars} onChange={(event) => update('bull_exit_confirmation_bars', event.target.value)} /></Field>
            <div className="switch-group">
              <Switch label="Exit directly on TOP probability" checked={form.exit_top_probability} onChange={(value) => update('exit_top_probability', value)} />
              <Switch label="Use trend-breakdown exit" checked={form.exit_trend_breakdown} onChange={(value) => update('exit_trend_breakdown', value)} />
              <Switch label="Require declining slow EMA" checked={form.trend_breakdown_require_slow_ema_decline} onChange={(value) => update('trend_breakdown_require_slow_ema_decline', value)} />
              <Switch label="Require declining slow bull-exit EMA" checked={form.bull_exit_require_slow_ema_decline} onChange={(value) => update('bull_exit_require_slow_ema_decline', value)} />
              <Switch label="Use ATR trailing stop" checked={form.exit_atr_trailing_stop} onChange={(value) => update('exit_atr_trailing_stop', value)} />
              <Switch label="Tighten ATR after TOP signal" checked={form.top_tighten_trailing} onChange={(value) => update('top_tighten_trailing', value)} />
            </div>
          </ParameterGroup>

          {selectedStrategy === 'BOTTOM_ENTRY_EXIT_RISK_V1' && (
          <ParameterGroup
            title="Exit Risk V1"
            description="Keeps structural BOTTOM entry and uses a separate weekly risk model to estimate whether a downside barrier is likely to arrive before upside continuation."
          >
            <div className="field">
              <span className="field-label">Exit model comparison</span>
              <Switch label="Compare Exit Risk model families" checked={form.exit_risk_compare_models} onChange={(value) => update('exit_risk_compare_models', value)} />
            </div>
            {form.exit_risk_compare_models ? (
              <div className="field">
                <span className="field-label">Exit Risk models</span>
                <div className="backend-options">
                  <label><input type="checkbox" checked={form.exit_risk_model_backends.includes('xgboost')} onChange={() => toggleExitRiskBackend('xgboost')} /> XGBoost</label>
                  <label><input type="checkbox" checked={form.exit_risk_model_backends.includes('histgb')} onChange={() => toggleExitRiskBackend('histgb')} /> HistGradientBoosting</label>
                  <label><input type="checkbox" checked={form.exit_risk_model_backends.includes('catboost')} onChange={() => toggleExitRiskBackend('catboost')} /> CatBoost</label>
                </div>
              </div>
            ) : (
              <Field label="Exit model backend">
                <select value={form.exit_risk_model_backend} onChange={(event) => update('exit_risk_model_backend', event.target.value)}>
                  <option value="xgboost">XGBoost</option>
                  <option value="histgb">HistGradientBoosting</option>
                  <option value="catboost">CatBoost</option>
                </select>
              </Field>
            )}
            <Field label="Exit signal timeframe">
              <select value={form.exit_risk_signal_timeframe} onChange={(event) => update('exit_risk_signal_timeframe', event.target.value)}>
                <option value="1Week">1 week</option>
              </select>
            </Field>
            <Field label="Barrier horizon (weeks)"><input type="number" min="2" max="26" value={form.exit_risk_horizon_weeks} onChange={(event) => update('exit_risk_horizon_weeks', event.target.value)} /></Field>
            <Field label="Approximation tolerance (weeks)" helper="A signal is evaluated as useful when it falls inside this weekly neighborhood of the risk regime; exact peak timing is not required."><input type="number" min="0" max="8" value={form.exit_risk_event_tolerance_weeks} onChange={(event) => update('exit_risk_event_tolerance_weeks', event.target.value)} /></Field>
            <Field label="Downside barrier"><input type="number" min="0.01" max="0.99" step="0.01" value={form.exit_risk_down_barrier} onChange={(event) => update('exit_risk_down_barrier', event.target.value)} /></Field>
            <Field label="Upside continuation barrier"><input type="number" min="0.01" max="0.99" step="0.01" value={form.exit_risk_up_barrier} onChange={(event) => update('exit_risk_up_barrier', event.target.value)} /></Field>
            <Field label="Exit-risk probability floor"><input type="number" min="0.01" max="0.99" step="0.01" value={form.exit_risk_probability_floor} onChange={(event) => update('exit_risk_probability_floor', event.target.value)} /></Field>
            <Field label="Exit-risk threshold maximum"><input type="number" min="0.01" max="0.99" step="0.01" value={form.exit_risk_threshold_max} onChange={(event) => update('exit_risk_threshold_max', event.target.value)} /></Field>
            <Field label="Exit-risk minimum precision"><input type="number" min="0.01" max="0.99" step="0.01" value={form.exit_risk_min_precision} onChange={(event) => update('exit_risk_min_precision', event.target.value)} /></Field>
            <Field label="Exit-risk minimum recall"><input type="number" min="0" max="0.99" step="0.01" value={form.exit_risk_min_recall} onChange={(event) => update('exit_risk_min_recall', event.target.value)} /></Field>
            <Field label="Exit-risk minimum calibration signals"><input type="number" min="1" value={form.exit_risk_min_calibration_signals} onChange={(event) => update('exit_risk_min_calibration_signals', event.target.value)} /></Field>
            <div className="field">
              <span className="field-label">Calibration policy</span>
              <Switch label="Require all Exit Risk calibration constraints" checked={form.exit_risk_hard_calibration_gate} onChange={(value) => update('exit_risk_hard_calibration_gate', value)} />
            </div>
            <Field label="Weekly retrain bars"><input type="number" min="1" value={form.exit_risk_retrain_every_bars} onChange={(event) => update('exit_risk_retrain_every_bars', event.target.value)} /></Field>
            <Field label="Weekly minimum training rows"><input type="number" min="100" value={form.exit_risk_minimum_training_rows} onChange={(event) => update('exit_risk_minimum_training_rows', event.target.value)} /></Field>
            <Field label="Daily confirmation EMA">
              <select value={form.mtf_daily_confirmation_ema} onChange={(event) => update('mtf_daily_confirmation_ema', Number(event.target.value))}>
                {[5, 10, 20, 50].map((value) => <option key={value} value={value}>EMA {value}</option>)}
              </select>
            </Field>
            <Field label="Daily confirmation bars"><input type="number" min="1" max="20" value={form.mtf_daily_confirmation_bars} onChange={(event) => update('mtf_daily_confirmation_bars', event.target.value)} /></Field>
            <Field label="Exit signal validity (days)"><input type="number" min="1" max="120" value={form.mtf_top_signal_valid_days} onChange={(event) => update('mtf_top_signal_valid_days', event.target.value)} /></Field>
            <Field label="Minimum position return for exit"><input type="number" min="-1" max="10" step="0.01" value={form.mtf_top_min_position_return} onChange={(event) => update('mtf_top_min_position_return', event.target.value)} /></Field>
            <Field label="Rolling high lookback (weeks)"><input type="number" min="1" max="260" value={form.mtf_top_high_lookback_weeks} onChange={(event) => update('mtf_top_high_lookback_weeks', event.target.value)} /></Field>
            <Field label="Maximum distance from rolling high"><input type="number" min="0" max="0.99" step="0.01" value={form.mtf_top_max_distance_from_high} onChange={(event) => update('mtf_top_max_distance_from_high', event.target.value)} /></Field>
            <Field label="Re-entry cooldown (days)"><input type="number" min="0" max="120" value={form.exit_risk_reentry_cooldown_days} onChange={(event) => update('exit_risk_reentry_cooldown_days', event.target.value)} /></Field>
            <div className="switch-group">
              <Switch label="Require negative daily return" checked={form.mtf_daily_require_negative_return} onChange={(value) => update('mtf_daily_require_negative_return', value)} />
              <Switch label="Require declining daily EMA" checked={form.mtf_daily_require_ema_decline} onChange={(value) => update('mtf_daily_require_ema_decline', value)} />
              <Switch label="Require lower daily high" checked={form.mtf_daily_require_lower_high} onChange={(value) => update('mtf_daily_require_lower_high', value)} />
              <Switch label="Allow trend-resumption re-entry" checked={form.exit_risk_reentry_enabled} onChange={(value) => update('exit_risk_reentry_enabled', value)} />
            </div>
          </ParameterGroup>
          )}

          {selectedStrategy === 'COMPOUND_ROTATION_SWING_1W' && (
          <ParameterGroup
            title="Compound Capital Rotation — Swing"
            description="Expanding walk-forward Swing research. Select the future utility horizon while keeping the execution policy and minimum holding rule unchanged. Purge is synchronized to the selected horizon to prevent forward-label leakage."
          >
            <Field
              label="Utility horizon (sessions)"
              helper="Controlled research values: 5, 10, 20, 40, or 60 trading sessions. Keep the purge gap greater than or equal to the horizon."
            >
              <select
                value={form.rotation_horizon_days}
                onChange={(event) => update('rotation_horizon_days', Number(event.target.value))}
              >
                {[5, 10, 20, 40, 60].map((value) => (
                  <option key={value} value={value}>{value}</option>
                ))}
              </select>
            </Field>
            <Field label="Minimum training rows"><input type="number" min="300" value={form.rotation_minimum_training_rows} onChange={(event) => update('rotation_minimum_training_rows', event.target.value)} /></Field>
            <Field label="Walk-forward calibration (sessions)"><input type="number" min="40" value={form.rotation_walk_forward_calibration_days} onChange={(event) => update('rotation_walk_forward_calibration_days', event.target.value)} /></Field>
            <Field label="Walk-forward test fold (sessions)"><input type="number" min="63" value={form.rotation_walk_forward_test_days} onChange={(event) => update('rotation_walk_forward_test_days', event.target.value)} /></Field>
            <Field label="Minimum final fold (sessions)"><input type="number" min="20" value={form.rotation_walk_forward_min_test_days} onChange={(event) => update('rotation_walk_forward_min_test_days', event.target.value)} /></Field>
            <Field label="Purge gap (sessions)" helper="Must be at least the utility horizon. For a strict horizon comparison, use the same purge across every experiment."><input type="number" min={form.rotation_horizon_days} value={form.rotation_purge_days} onChange={(event) => update('rotation_purge_days', event.target.value)} /></Field>
            <Field label="Downside penalty"><input type="number" min="0" step="0.05" value={form.rotation_downside_penalty} onChange={(event) => update('rotation_downside_penalty', event.target.value)} /></Field>
            <Field label="Drawdown penalty"><input type="number" min="0" step="0.05" value={form.rotation_drawdown_penalty} onChange={(event) => update('rotation_drawdown_penalty', event.target.value)} /></Field>
            <Field label="Minimum holding days"><input type="number" min="0" max="60" value={form.rotation_min_holding_days} onChange={(event) => update('rotation_min_holding_days', event.target.value)} /></Field>
            <Field label="Minimum expected edge"><input type="number" min="0" step="0.0005" value={form.rotation_min_expected_edge} onChange={(event) => update('rotation_min_expected_edge', event.target.value)} /></Field>
            <Field label="Cash threshold"><input type="number" step="0.001" value={form.rotation_cash_threshold} onChange={(event) => update('rotation_cash_threshold', event.target.value)} /></Field>
            <Field label="Base switch margin"><input type="number" min="0" step="0.001" value={form.rotation_switch_margin} onChange={(event) => update('rotation_switch_margin', event.target.value)} /></Field>

            <Switch
              label="Run selected model families in parallel"
              checked={form.rotation_parallel_models}
              onChange={(value) => update('rotation_parallel_models', value)}
            />
            <Field
              label="XGBoost robustness repetitions"
              helper="Use 1 for a normal backtest. Use 3 for the robustness check we discussed."
            >
              <input type="number" min="1" max="100" value={form.rotation_xgb_repetitions} onChange={(event) => update('rotation_xgb_repetitions', event.target.value)} />
            </Field>
            <Field
              label="QR-DQN robustness repetitions"
              helper="Use 1 while tuning speed/GPU. After that, use 10 to evaluate seed stability."
            >
              <input type="number" min="1" max="100" value={form.rotation_qrdqn_repetitions} onChange={(event) => update('rotation_qrdqn_repetitions', event.target.value)} />
            </Field>
            <Field
              label="Seed increment"
              helper="One seed identifies one complete walk-forward repetition. Every fold inside that repetition uses the same seed; only robustness repetitions advance the seed."
            >
              <input type="number" min="1" value={form.rotation_seed_step} onChange={(event) => update('rotation_seed_step', event.target.value)} />
            </Field>

            <Field label="XGBoost Utility estimators"><input type="number" min="10" value={form.rotation_xgb_n_estimators} onChange={(event) => update('rotation_xgb_n_estimators', event.target.value)} /></Field>
            <Field label="XGBoost Utility learning rate"><input type="number" min="0.001" max="1" step="0.005" value={form.rotation_xgb_learning_rate} onChange={(event) => update('rotation_xgb_learning_rate', event.target.value)} /></Field>
            <Field label="XGBoost Utility max depth"><input type="number" min="1" max="20" value={form.rotation_xgb_max_depth} onChange={(event) => update('rotation_xgb_max_depth', event.target.value)} /></Field>

            <Field label="QR-DQN training steps"><input type="number" min="500" step="500" value={form.qrdqn_training_steps} onChange={(event) => update('qrdqn_training_steps', event.target.value)} /></Field>
            <Field
              label="QR-DQN parallel fold workers"
              helper="Two workers is a conservative default. Increase to 3 only after checking GPU memory/CPU load."
            >
              <input type="number" min="1" max="32" value={form.qrdqn_parallel_folds} onChange={(event) => update('qrdqn_parallel_folds', event.target.value)} />
            </Field>
            <Switch
              label="QR-DQN early stopping — experimental"
              checked={form.qrdqn_early_stopping_enabled}
              onChange={(value) => update('qrdqn_early_stopping_enabled', value)}
            />
            <Field
              label="QR-DQN early-stop patience (evaluations)"
              helper="For scientific baseline runs keep early stopping OFF. When enabled, validation checkpoints before the minimum training step are ignored."
            >
              <input type="number" min="1" max="100" value={form.qrdqn_early_stopping_patience} onChange={(event) => update('qrdqn_early_stopping_patience', event.target.value)} />
            </Field>
            <Field label="QR-DQN minimum training steps">
              <input type="number" min="500" step="500" value={form.qrdqn_min_training_steps} onChange={(event) => update('qrdqn_min_training_steps', event.target.value)} />
            </Field>
            <Field label="QR-DQN episode days"><input type="number" min="20" value={form.qrdqn_episode_days} onChange={(event) => update('qrdqn_episode_days', event.target.value)} /></Field>
            <Field label="QR-DQN replay size"><input type="number" min="1000" step="1000" value={form.qrdqn_replay_size} onChange={(event) => update('qrdqn_replay_size', event.target.value)} /></Field>
            <Field label="QR-DQN batch size"><input type="number" min="16" value={form.qrdqn_batch_size} onChange={(event) => update('qrdqn_batch_size', event.target.value)} /></Field>
            <Field label="QR-DQN learning rate"><input type="number" min="0.00001" max="1" step="0.0001" value={form.qrdqn_learning_rate} onChange={(event) => update('qrdqn_learning_rate', event.target.value)} /></Field>
            <Field label="QR-DQN quantiles"><input type="number" min="5" max="200" value={form.qrdqn_n_quantiles} onChange={(event) => update('qrdqn_n_quantiles', event.target.value)} /></Field>
            <Field label="QR-DQN hidden dimension"><input type="number" min="16" value={form.qrdqn_hidden_dim} onChange={(event) => update('qrdqn_hidden_dim', event.target.value)} /></Field>
            <Field
              label="Compute accelerator"
              helper={`Auto detects each model independently. Runtime now reports XGBoost=${computeStatus?.xgboost?.device_available?.toUpperCase() || '…'} and QR-DQN=${computeStatus?.qrdqn?.device_available?.toUpperCase() || '…'}. A CPU-only PyTorch build can keep QR-DQN on CPU even when XGBoost can use CUDA.`}
            >
              <select value={form.rotation_accelerator} onChange={(event) => update('rotation_accelerator', event.target.value)}>
                <option value="auto">Auto — CUDA when available</option>
                <option value="cpu">CPU only</option>
                <option value="cuda">CUDA requested</option>
              </select>
            </Field>
            <Switch
              label="Allow automatic CPU fallback"
              checked={form.rotation_allow_cpu_fallback}
              onChange={(value) => update('rotation_allow_cpu_fallback', value)}
            />
            <div className="settings-message" role="status">
              <strong>Detected compute:</strong>{' '}
              XGBoost {computeStatus?.xgboost?.device_available?.toUpperCase() || '…'}
              {' · '}QR-DQN {computeStatus?.qrdqn?.device_available?.toUpperCase() || '…'}
              {computeStatus?.gpu_name ? ` · ${computeStatus.gpu_name}` : ''}.
              {computeStatus?.nvidia_driver_visible && !computeStatus?.qrdqn?.cuda_available
                ? ' NVIDIA is visible, but the installed PyTorch build has no active CUDA support.'
                : ''}
            </div>
          </ParameterGroup>
          )}

          {selectedStrategy === 'COMPOUND_ROTATION_DAY_TRADE_OPEN_CLOSE' && (
          <ParameterGroup
            title="Compound Capital Rotation — Day Trade Open→Close"
            description="One decision per US trading session. 15-minute source bars from the selected provider are aggregated into a session-level dataset; all price and volume inputs are based on completed prior sessions so the model can execute at the current session open without look-ahead."
          >
            <Field label="Utility horizon" helper="Fixed at one trading session: regular-session open to regular-session close."><input type="number" value={form.rotation_horizon_days} disabled /></Field>
            <Field label="Minimum training sessions"><input type="number" min="300" value={form.rotation_minimum_training_rows} onChange={(event) => update('rotation_minimum_training_rows', event.target.value)} /></Field>
            <Field label="Walk-forward calibration (sessions)"><input type="number" min="60" value={form.rotation_walk_forward_calibration_days} onChange={(event) => update('rotation_walk_forward_calibration_days', event.target.value)} /></Field>
            <Field label="Walk-forward test fold (sessions)"><input type="number" min="40" value={form.rotation_walk_forward_test_days} onChange={(event) => update('rotation_walk_forward_test_days', event.target.value)} /></Field>
            <Field label="Minimum final fold (sessions)"><input type="number" min="20" value={form.rotation_walk_forward_min_test_days} onChange={(event) => update('rotation_walk_forward_min_test_days', event.target.value)} /></Field>
            <Field label="Purge gap (sessions)"><input type="number" value={form.rotation_purge_days} disabled /></Field>
            <Field label="Downside penalty"><input type="number" min="0" step="0.05" value={form.rotation_downside_penalty} onChange={(event) => update('rotation_downside_penalty', event.target.value)} /></Field>
            <Field label="Drawdown penalty"><input type="number" min="0" step="0.05" value={form.rotation_drawdown_penalty} onChange={(event) => update('rotation_drawdown_penalty', event.target.value)} /></Field>
            <Field label="Minimum expected Open→Close edge"><input type="number" min="0" step="0.0005" value={form.rotation_min_expected_edge} onChange={(event) => update('rotation_min_expected_edge', event.target.value)} /></Field>
            <Field label="QR-DQN training steps"><input type="number" min="500" step="500" value={form.qrdqn_training_steps} onChange={(event) => update('qrdqn_training_steps', event.target.value)} /></Field>
            <Field label="Minimum eligible QR-DQN checkpoint"><input type="number" min="500" step="500" value={form.qrdqn_min_training_steps} onChange={(event) => update('qrdqn_min_training_steps', event.target.value)} /></Field>
            <Field label="QR-DQN replay size"><input type="number" min="1000" step="1000" value={form.qrdqn_replay_size} onChange={(event) => update('qrdqn_replay_size', event.target.value)} /></Field>
            <Field label="QR-DQN batch size"><input type="number" min="16" value={form.qrdqn_batch_size} onChange={(event) => update('qrdqn_batch_size', event.target.value)} /></Field>
            <Field label="QR-DQN learning rate"><input type="number" min="0.00001" max="1" step="0.0001" value={form.qrdqn_learning_rate} onChange={(event) => update('qrdqn_learning_rate', event.target.value)} /></Field>
            <Field label="QR-DQN quantiles"><input type="number" min="5" max="200" value={form.qrdqn_n_quantiles} onChange={(event) => update('qrdqn_n_quantiles', event.target.value)} /></Field>
            <Field label="QR-DQN hidden dimension"><input type="number" min="16" value={form.qrdqn_hidden_dim} onChange={(event) => update('qrdqn_hidden_dim', event.target.value)} /></Field>
            <Field label="QR-DQN effective gamma" helper="Fixed at 0 because every decision ends at the same-session close; the next session starts flat."><input type="number" value="0" disabled /></Field>
            <Field
              label="Compute accelerator"
              helper={`Runtime reports XGBoost=${computeStatus?.xgboost?.device_available?.toUpperCase() || '…'} · QR-DQN=${computeStatus?.qrdqn?.device_available?.toUpperCase() || '…'}.`}
            >
              <select value={form.rotation_accelerator} onChange={(event) => update('rotation_accelerator', event.target.value)}>
                <option value="auto">Auto — CUDA when available</option>
                <option value="cpu">CPU only</option>
                <option value="cuda">CUDA requested</option>
              </select>
            </Field>
            <Switch
              label="Allow automatic CPU fallback"
              checked={form.rotation_allow_cpu_fallback}
              onChange={(value) => update('rotation_allow_cpu_fallback', value)}
            />
            <div className="settings-message" role="status">
              <strong>Day Trade invariant:</strong>{' '}
              maximum one BUY and one SELL per session. The portfolio is always CASH after the regular-session close; intraday rotations and overnight positions are impossible by design.
            </div>
          </ParameterGroup>
          )}

          {selectedStrategy === 'BOTTOM_ENTRY_EXIT_RISK_SWING_1D' && (
          <ParameterGroup
            title="Exit Risk Swing 1D"
            description="Daily BOTTOM and daily Exit Risk models for multi-day swing trades. Signals are evaluated as useful approximations, not exact turning-point predictions."
          >
            <Field label="Exit model backend">
              <select value={form.exit_risk_model_backend} onChange={(event) => update('exit_risk_model_backend', event.target.value)}>
                <option value="xgboost">XGBoost</option>
                <option value="histgb">HistGradientBoosting</option>
                <option value="catboost">CatBoost</option>
              </select>
            </Field>
            <Field label="Exit horizon (trading days)"><input type="number" min="2" max="120" value={form.swing_exit_horizon_days} onChange={(event) => update('swing_exit_horizon_days', event.target.value)} /></Field>
            <Field label="Approximation tolerance (trading days)" helper="Signals inside this neighborhood are treated as useful approximations; exact top timing is not required."><input type="number" min="0" max="20" value={form.swing_exit_event_tolerance_days} onChange={(event) => update('swing_exit_event_tolerance_days', event.target.value)} /></Field>
            <Field label="Downside barrier"><input type="number" min="0.01" max="0.99" step="0.01" value={form.swing_exit_down_barrier} onChange={(event) => update('swing_exit_down_barrier', event.target.value)} /></Field>
            <Field label="Upside continuation barrier"><input type="number" min="0.01" max="0.99" step="0.01" value={form.swing_exit_up_barrier} onChange={(event) => update('swing_exit_up_barrier', event.target.value)} /></Field>
            <Field label="Exit-risk probability floor"><input type="number" min="0.01" max="0.99" step="0.01" value={form.exit_risk_probability_floor} onChange={(event) => update('exit_risk_probability_floor', event.target.value)} /></Field>
            <Field label="Exit-risk threshold maximum"><input type="number" min="0.01" max="0.99" step="0.01" value={form.exit_risk_threshold_max} onChange={(event) => update('exit_risk_threshold_max', event.target.value)} /></Field>
            <Field label="Exit-risk minimum precision"><input type="number" min="0.01" max="0.99" step="0.01" value={form.exit_risk_min_precision} onChange={(event) => update('exit_risk_min_precision', event.target.value)} /></Field>
            <Field label="Exit-risk minimum recall"><input type="number" min="0" max="0.99" step="0.01" value={form.exit_risk_min_recall} onChange={(event) => update('exit_risk_min_recall', event.target.value)} /></Field>
            <Field label="Exit-risk minimum calibration signals"><input type="number" min="1" value={form.exit_risk_min_calibration_signals} onChange={(event) => update('exit_risk_min_calibration_signals', event.target.value)} /></Field>
            <div className="field">
              <span className="field-label">Calibration policy</span>
              <Switch label="Require all Exit Risk calibration constraints" checked={form.exit_risk_hard_calibration_gate} onChange={(value) => update('exit_risk_hard_calibration_gate', value)} />
            </div>
            <Field label="Daily retrain bars"><input type="number" min="1" max="260" value={form.swing_exit_retrain_every_bars} onChange={(event) => update('swing_exit_retrain_every_bars', event.target.value)} /></Field>
            <Field label="Daily minimum training rows"><input type="number" min="100" value={form.swing_exit_minimum_training_rows} onChange={(event) => update('swing_exit_minimum_training_rows', event.target.value)} /></Field>
            <Field label="Confirmation EMA">
              <select value={form.mtf_daily_confirmation_ema} onChange={(event) => update('mtf_daily_confirmation_ema', Number(event.target.value))}>
                {[5, 10, 20, 50].map((value) => <option key={value} value={value}>EMA {value}</option>)}
              </select>
            </Field>
            <Field label="Confirmation bars"><input type="number" min="1" max="20" value={form.mtf_daily_confirmation_bars} onChange={(event) => update('mtf_daily_confirmation_bars', event.target.value)} /></Field>
            <Field label="Exit signal validity (days)"><input type="number" min="1" max="120" value={form.mtf_top_signal_valid_days} onChange={(event) => update('mtf_top_signal_valid_days', event.target.value)} /></Field>
            <Field label="Minimum position return for exit"><input type="number" min="-1" max="10" step="0.01" value={form.mtf_top_min_position_return} onChange={(event) => update('mtf_top_min_position_return', event.target.value)} /></Field>
            <Field label="Rolling high lookback (weeks)"><input type="number" min="1" max="260" value={form.mtf_top_high_lookback_weeks} onChange={(event) => update('mtf_top_high_lookback_weeks', event.target.value)} /></Field>
            <Field label="Maximum distance from rolling high"><input type="number" min="0" max="0.99" step="0.01" value={form.mtf_top_max_distance_from_high} onChange={(event) => update('mtf_top_max_distance_from_high', event.target.value)} /></Field>
            <Field label="Re-entry cooldown (days)"><input type="number" min="0" max="120" value={form.exit_risk_reentry_cooldown_days} onChange={(event) => update('exit_risk_reentry_cooldown_days', event.target.value)} /></Field>
            <div className="switch-group">
              <Switch label="Require negative daily return" checked={form.mtf_daily_require_negative_return} onChange={(value) => update('mtf_daily_require_negative_return', value)} />
              <Switch label="Require declining daily EMA" checked={form.mtf_daily_require_ema_decline} onChange={(value) => update('mtf_daily_require_ema_decline', value)} />
              <Switch label="Require lower daily high" checked={form.mtf_daily_require_lower_high} onChange={(value) => update('mtf_daily_require_lower_high', value)} />
              <Switch label="Allow trend-resumption re-entry" checked={form.exit_risk_reentry_enabled} onChange={(value) => update('exit_risk_reentry_enabled', value)} />
            </div>
          </ParameterGroup>
          )}

          {selectedStrategy === 'BOTTOM_ENTRY_MTF_TOP_EXIT' && (
          <ParameterGroup
            title="Multi-timeframe TOP exit"
            description="Uses the structural BOTTOM entry, a weekly TOP model, and daily reversal confirmation."
          >
            <Field label="TOP signal timeframe">
              <select value={form.mtf_top_signal_timeframe} onChange={(event) => update('mtf_top_signal_timeframe', event.target.value)}>
                <option value="1Week">1 week</option>
              </select>
            </Field>
            <Field label="Confirmation timeframe">
              <select value={form.mtf_top_confirmation_timeframe} onChange={(event) => update('mtf_top_confirmation_timeframe', event.target.value)}>
                <option value="1Day">1 day</option>
              </select>
            </Field>
            <Field label="Weekly TOP future horizon"><input type="number" min="1" max="20" value={form.mtf_top_future_horizon} onChange={(event) => update('mtf_top_future_horizon', event.target.value)} /></Field>
            <Field label="Weekly TOP lookback"><input type="number" min="2" max="100" value={form.mtf_top_extrema_lookback} onChange={(event) => update('mtf_top_extrema_lookback', event.target.value)} /></Field>
            <Field label="Weekly reversal threshold"><input type="number" min="0.01" max="0.9" step="0.01" value={form.mtf_top_reversal_threshold} onChange={(event) => update('mtf_top_reversal_threshold', event.target.value)} /></Field>
            <Field label="Weekly TOP tolerance"><input type="number" min="0" max="0.5" step="0.01" value={form.mtf_top_extrema_tolerance} onChange={(event) => update('mtf_top_extrema_tolerance', event.target.value)} /></Field>
            <Field label="TOP probability floor"><input type="number" min="0.01" max="0.99" step="0.01" value={form.mtf_top_probability_floor} onChange={(event) => update('mtf_top_probability_floor', event.target.value)} /></Field>
            <Field label="Weekly retrain bars"><input type="number" min="1" value={form.mtf_top_retrain_every_bars} onChange={(event) => update('mtf_top_retrain_every_bars', event.target.value)} /></Field>
            <Field label="Weekly minimum training rows"><input type="number" min="100" value={form.mtf_top_minimum_training_rows} onChange={(event) => update('mtf_top_minimum_training_rows', event.target.value)} /></Field>
            <Field label="Daily confirmation EMA">
              <select value={form.mtf_daily_confirmation_ema} onChange={(event) => update('mtf_daily_confirmation_ema', Number(event.target.value))}>
                {[5, 10, 20, 50].map((value) => <option key={value} value={value}>EMA {value}</option>)}
              </select>
            </Field>
            <Field label="Daily confirmation bars"><input type="number" min="1" max="20" value={form.mtf_daily_confirmation_bars} onChange={(event) => update('mtf_daily_confirmation_bars', event.target.value)} /></Field>
            <Field label="TOP signal validity (days)"><input type="number" min="1" max="120" value={form.mtf_top_signal_valid_days} onChange={(event) => update('mtf_top_signal_valid_days', event.target.value)} /></Field>
            <Field label="Minimum position return for TOP exit"><input type="number" min="-1" max="10" step="0.01" value={form.mtf_top_min_position_return} onChange={(event) => update('mtf_top_min_position_return', event.target.value)} /></Field>
            <Field label="Rolling high lookback (weeks)"><input type="number" min="1" max="260" value={form.mtf_top_high_lookback_weeks} onChange={(event) => update('mtf_top_high_lookback_weeks', event.target.value)} /></Field>
            <Field label="Maximum distance from rolling high"><input type="number" min="0" max="0.99" step="0.01" value={form.mtf_top_max_distance_from_high} onChange={(event) => update('mtf_top_max_distance_from_high', event.target.value)} /></Field>
            <Field label="Exit quality horizon (days)"><input type="number" min="1" max="120" value={form.mtf_exit_quality_horizon_days} onChange={(event) => update('mtf_exit_quality_horizon_days', event.target.value)} /></Field>
            <div className="switch-group">
              <Switch label="Require negative daily return" checked={form.mtf_daily_require_negative_return} onChange={(value) => update('mtf_daily_require_negative_return', value)} />
              <Switch label="Require declining daily EMA" checked={form.mtf_daily_require_ema_decline} onChange={(value) => update('mtf_daily_require_ema_decline', value)} />
              <Switch label="Require lower daily high" checked={form.mtf_daily_require_lower_high} onChange={(value) => update('mtf_daily_require_lower_high', value)} />
            </div>
          </ParameterGroup>
          )}

          <ParameterGroup
            title="Fibonacci target"
            description="Calculates the extension target from information available at the BOTTOM entry signal."
          >
            <Field
              label="Fibonacci target ratio"
              helper="Only classic extension proportions are available."
            >
              <select
                value={form.fibonacci_target_ratio}
                onChange={(event) => update(
                  'fibonacci_target_ratio',
                  Number(event.target.value),
                )}
              >
                {classicFibonacciRatios.map((ratio) => (
                  <option key={ratio.value} value={ratio.value}>
                    {ratio.label}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Fibonacci swing lookback"><input type="number" min="2" value={form.fibonacci_swing_lookback} onChange={(event) => update('fibonacci_swing_lookback', event.target.value)} /></Field>
            <Field label="Fibonacci low lookback"><input type="number" min="1" value={form.fibonacci_low_lookback} onChange={(event) => update('fibonacci_low_lookback', event.target.value)} /></Field>
            <div className="switch-group">
              <Switch label="Use Fibonacci target" checked={form.exit_fibonacci_target} onChange={(value) => update('exit_fibonacci_target', value)} />
            </div>
          </ParameterGroup>

          <ParameterGroup
            title="Capital, slippage and fees"
            description="Controls the simulated account and transaction-cost assumptions."
          >
            <Field label="Initial capital"><input type="number" min="1" step="100" value={form.initial_capital} onChange={(event) => update('initial_capital', event.target.value)} /></Field>
            <Field label="Slippage (bps)"><input type="number" min="0" step="0.1" value={form.slippage_bps} onChange={(event) => update('slippage_bps', event.target.value)} /></Field>
            <Field label="Commission rate"><input type="number" min="0" step="0.0001" value={form.commission_rate} onChange={(event) => update('commission_rate', event.target.value)} /></Field>
            <Field label="SEC fee rate"><input type="number" min="0" step="0.0000001" value={form.sec_fee_rate} onChange={(event) => update('sec_fee_rate', event.target.value)} /></Field>
            <Field label="TAF fee per share"><input type="number" min="0" step="0.000001" value={form.taf_fee_per_share} onChange={(event) => update('taf_fee_per_share', event.target.value)} /></Field>
            <Field label="TAF fee cap"><input type="number" min="0" step="0.01" value={form.taf_fee_cap} onChange={(event) => update('taf_fee_cap', event.target.value)} /></Field>
            <Field label="CAT fee per share"><input type="number" min="0" step="0.000001" value={form.cat_fee_per_share} onChange={(event) => update('cat_fee_per_share', event.target.value)} /></Field>
          </ParameterGroup>

          <ParameterGroup
            title="HistGradientBoosting"
            description="Model-specific parameters used when HistGradientBoosting is selected."
          >
            <Field label="Maximum iterations"><input type="number" min="1" value={form.hist_max_iter} onChange={(event) => update('hist_max_iter', event.target.value)} /></Field>
            <Field label="Learning rate"><input type="number" min="0.0001" step="0.005" value={form.hist_learning_rate} onChange={(event) => update('hist_learning_rate', event.target.value)} /></Field>
            <Field label="Maximum leaf nodes"><input type="number" min="2" value={form.hist_max_leaf_nodes} onChange={(event) => update('hist_max_leaf_nodes', event.target.value)} /></Field>
            <Field label="Minimum samples per leaf"><input type="number" min="1" value={form.hist_min_samples_leaf} onChange={(event) => update('hist_min_samples_leaf', event.target.value)} /></Field>
            <Field label="L2 regularization"><input type="number" min="0" step="0.1" value={form.hist_l2_regularization} onChange={(event) => update('hist_l2_regularization', event.target.value)} /></Field>
          </ParameterGroup>

          <ParameterGroup
            title="XGBoost"
            description="Model-specific parameters used when XGBoost is selected."
          >
            <Field label="Estimators"><input type="number" min="1" value={form.xgb_n_estimators} onChange={(event) => update('xgb_n_estimators', event.target.value)} /></Field>
            <Field label="Learning rate"><input type="number" min="0.0001" step="0.005" value={form.xgb_learning_rate} onChange={(event) => update('xgb_learning_rate', event.target.value)} /></Field>
            <Field label="Maximum depth"><input type="number" min="1" value={form.xgb_max_depth} onChange={(event) => update('xgb_max_depth', event.target.value)} /></Field>
            <Field label="Minimum child weight"><input type="number" min="0" step="0.5" value={form.xgb_min_child_weight} onChange={(event) => update('xgb_min_child_weight', event.target.value)} /></Field>
            <Field label="Subsample"><input type="number" min="0.1" max="1" step="0.05" value={form.xgb_subsample} onChange={(event) => update('xgb_subsample', event.target.value)} /></Field>
            <Field label="Column sample by tree"><input type="number" min="0.1" max="1" step="0.05" value={form.xgb_colsample_bytree} onChange={(event) => update('xgb_colsample_bytree', event.target.value)} /></Field>
            <Field label="Gamma"><input type="number" min="0" step="0.1" value={form.xgb_gamma} onChange={(event) => update('xgb_gamma', event.target.value)} /></Field>
            <Field label="L1 regularization"><input type="number" min="0" step="0.05" value={form.xgb_reg_alpha} onChange={(event) => update('xgb_reg_alpha', event.target.value)} /></Field>
            <Field label="L2 regularization"><input type="number" min="0" step="0.1" value={form.xgb_reg_lambda} onChange={(event) => update('xgb_reg_lambda', event.target.value)} /></Field>
            <Field label="Parallel jobs"><input type="number" value={form.xgb_n_jobs} onChange={(event) => update('xgb_n_jobs', event.target.value)} /></Field>
            <Field label="Device">
              <select value={form.xgb_device} onChange={(event) => update('xgb_device', event.target.value)}>
                <option value="cpu">CPU</option>
                <option value="cuda">CUDA</option>
              </select>
            </Field>
            <Field label="Parallel asset workers">
              <input type="number" min="1" max="32" value={form.max_parallel_workers} onChange={(event) => update('max_parallel_workers', event.target.value)} />
            </Field>
            <Field label="CUDA parallel workers" helper="Use 1 unless the GPU has enough memory for concurrent XGBoost models.">
              <input type="number" min="1" max="8" value={form.cuda_parallel_workers} onChange={(event) => update('cuda_parallel_workers', event.target.value)} />
            </Field>
          </ParameterGroup>

          <ParameterGroup
            title="Data source and reproducibility"
            description={form.market_data_provider === 'alpaca'
              ? (selectedStrategy === 'COMPOUND_ROTATION_DAY_TRADE_OPEN_CLOSE'
                ? 'Alpaca 15-minute source data, isolated MongoDB cache and random-seed controls. The trading decision itself is session-level.'
                : 'Alpaca daily source data, isolated MongoDB cache and random-seed controls for Swing.')
              : (selectedStrategy === 'COMPOUND_ROTATION_DAY_TRADE_OPEN_CLOSE'
                ? 'Yahoo Finance 15-minute source data, MongoDB cache and random-seed controls. Yahoo intraday history is limited to a recent window.'
                : 'Yahoo Finance daily source data, MongoDB cache and random-seed controls for Swing.')}
          >
            {form.market_data_provider === 'alpaca' ? (
              <>
                <Field label="Alpaca feed" helper="IEX works with the basic market-data plan. Use SIP only when your Alpaca subscription permits it.">
                  <select value={form.alpaca_feed} onChange={(event) => update('alpaca_feed', event.target.value)}>
                    <option value="iex">IEX</option>
                    <option value="sip">SIP</option>
                  </select>
                </Field>
                <Field label="Corporate-action adjustment">
                  <select value={form.alpaca_adjustment} onChange={(event) => update('alpaca_adjustment', event.target.value)}>
                    <option value="all">All corporate actions</option>
                    <option value="split">Splits</option>
                    <option value="dividend">Dividends</option>
                    <option value="raw">Raw</option>
                  </select>
                </Field>
                <Field
                  label="Alpaca API Key ID"
                  helper={alpacaIntegration.configured
                    ? `Stored key: ${alpacaIntegration.api_key_id_masked || 'configured'}. Leave blank unless replacing it.`
                    : 'Stored only in the local MongoDB integrations collection; it is not copied into job snapshots or result ZIPs.'}
                >
                  <input
                    autoComplete="off"
                    value={alpacaApiKeyId}
                    onChange={(event) => setAlpacaApiKeyId(event.target.value)}
                    placeholder={alpacaIntegration.configured ? 'Enter only to replace stored credentials' : 'Alpaca API Key ID'}
                  />
                </Field>
                <Field label="Alpaca Secret Key" helper="The secret is never returned by the API after it is saved.">
                  <input
                    type="password"
                    autoComplete="new-password"
                    value={alpacaSecretKey}
                    onChange={(event) => setAlpacaSecretKey(event.target.value)}
                    placeholder={alpacaIntegration.configured ? 'Enter only to replace stored credentials' : 'Alpaca Secret Key'}
                  />
                </Field>
                <div className="switch-group">
                  <button type="button" onClick={saveAndTestAlpaca} disabled={alpacaBusy || !alpacaApiKeyId.trim() || !alpacaSecretKey.trim()}>
                    {alpacaBusy ? 'Testing…' : 'Save credentials & test'}
                  </button>
                  <button type="button" onClick={testStoredAlpaca} disabled={alpacaBusy || !alpacaIntegration.configured}>
                    Test stored connection
                  </button>
                  <button type="button" onClick={removeAlpaca} disabled={alpacaBusy || !alpacaIntegration.configured}>
                    Remove credentials
                  </button>
                </div>
                {alpacaMessage && <div className="settings-message">{alpacaMessage}</div>}
              </>
            ) : (
              <>
                <Field label="Yahoo timeout (seconds)"><input type="number" min="1" value={form.yfinance_timeout} onChange={(event) => update('yfinance_timeout', event.target.value)} /></Field>
                <Field label="Yahoo fallback period"><input value={form.yfinance_fallback_period} onChange={(event) => update('yfinance_fallback_period', event.target.value)} /></Field>
                <div className="switch-group">
                  <Switch label="Yahoo auto-adjust prices" checked={form.yfinance_auto_adjust} onChange={(value) => update('yfinance_auto_adjust', value)} />
                  <Switch label="Yahoo repair prices" checked={form.yfinance_repair} onChange={(value) => update('yfinance_repair', value)} />
                </div>
              </>
            )}
            <Field label="Cache refresh overlap days"><input type="number" min="0" value={form.mongo_refresh_overlap_days} onChange={(event) => update('mongo_refresh_overlap_days', event.target.value)} /></Field>
            <Field label="Mongo write batch size"><input type="number" min="1" value={form.mongo_write_batch_size} onChange={(event) => update('mongo_write_batch_size', event.target.value)} /></Field>
            <Field label="Random state"><input type="number" value={form.random_state} onChange={(event) => update('random_state', event.target.value)} /></Field>
            <div className="switch-group">
              <Switch label="Use MongoDB market cache" checked={form.mongo_cache_enabled} onChange={(value) => update('mongo_cache_enabled', value)} />
            </div>
          </ParameterGroup>
          </div>
  )
}
