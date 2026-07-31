import { Field } from '../../../shared/components/Field'
import { ParameterGroup } from '../../../shared/components/ParameterGroup'
import { Switch } from '../../../shared/components/Switch'

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
    loadSwingHeadToHeadJson,
    loadSwingQr1Json,
    loadSwingQr2Json,
    loadCurrentConfigurationJson,
    validateConfigurationJson,
    applyConfigurationJson,
    saveAndTestAlpaca,
    testStoredAlpaca,
    removeAlpaca,
  } = workspace

  const isQr = selectedStrategy === 'COMPOUND_ROTATION_SWING_QRDQN' || form.rotation_models.includes('qrdqn')
  const isXgb = selectedStrategy === 'COMPOUND_ROTATION_SWING_XGBOOST' || form.rotation_models.includes('xgboost_utility')

  return (
    <div className="advanced-panel">
      <div className="section-heading">
        <div>
          <span className="section-kicker">Configuration</span>
          <h2>Advanced parameters</h2>
          <p>Only parameters used by the active Compound Capital Rotation engines are exposed.</p>
        </div>
      </div>

      <div className="parameter-toolbar">
        <div><strong>MongoDB-backed settings</strong><span>Running a backtest also saves the current values.</span></div>
        <div className="inline-actions">
          <button className="button secondary" type="button" onClick={() => setShowJsonConfig((current) => !current)} disabled={running}>{showJsonConfig ? 'Hide JSON editor' : 'Open JSON editor'}</button>
          <button className="button secondary" type="button" onClick={saveSettings} disabled={savingSettings || running}>{savingSettings ? 'Saving…' : 'Save parameters'}</button>
          <button className="button ghost" type="button" onClick={resetSettings} disabled={savingSettings || running}>Restore defaults</button>
        </div>
      </div>

      {showJsonConfig && (
        <section className="json-config-panel">
          <div className="json-config-heading">
            <div>
              <strong>JSON parameters → MongoDB</strong>
              <span>Paste a full or partial configuration, validate it, then save it directly to the default MongoDB settings document.</span>
            </div>
          </div>
          <textarea className="json-config-editor" value={configJsonText} onChange={(event) => setConfigJsonText(event.target.value)} spellCheck="false" disabled={configJsonBusy || running} />
          <div className="inline-actions json-config-actions">
            <button className="button ghost" type="button" onClick={loadSwingHeadToHeadJson} disabled={configJsonBusy || running}>Load QR0 baseline</button>
            <button className="button ghost" type="button" onClick={loadSwingQr1Json} disabled={configJsonBusy || running}>Load QR1 n=5</button>
            <button className="button ghost" type="button" onClick={loadSwingQr2Json} disabled={configJsonBusy || running}>Load QR2 n=10</button>
            <button className="button ghost" type="button" onClick={loadCurrentConfigurationJson} disabled={configJsonBusy || running}>Load current screen</button>
            <button className="button secondary" type="button" onClick={validateConfigurationJson} disabled={configJsonBusy || running || !configJsonText.trim()}>{configJsonBusy ? 'Working…' : 'Validate JSON'}</button>
            <button className="button primary" type="button" onClick={applyConfigurationJson} disabled={configJsonBusy || running || !configJsonText.trim()}>Save JSON to MongoDB</button>
          </div>
          {configJsonMessage && <div className="settings-message json-config-message">{configJsonMessage}</div>}
        </section>
      )}

      {settingsMessage && <div className="settings-message">{settingsMessage}</div>}

      <ParameterGroup title="Walk-forward and rotation" description="Shared validation and execution policy for Compound Capital Rotation.">
        <Field label="Utility horizon"><input type="number" value={form.rotation_horizon_days} disabled={selectedStrategy !== 'COMPOUND_ROTATION_DAY_TRADE_OPEN_CLOSE'} onChange={(event) => update('rotation_horizon_days', event.target.value)} /></Field>
        <Field label="Minimum training rows"><input type="number" min="300" value={form.rotation_minimum_training_rows} onChange={(event) => update('rotation_minimum_training_rows', event.target.value)} /></Field>
        <Field label="Calibration sessions"><input type="number" min="40" value={form.rotation_walk_forward_calibration_days} onChange={(event) => update('rotation_walk_forward_calibration_days', event.target.value)} /></Field>
        <Field label="Test sessions"><input type="number" min="63" value={form.rotation_walk_forward_test_days} onChange={(event) => update('rotation_walk_forward_test_days', event.target.value)} /></Field>
        <Field label="Minimum test sessions"><input type="number" min="20" value={form.rotation_walk_forward_min_test_days} onChange={(event) => update('rotation_walk_forward_min_test_days', event.target.value)} /></Field>
        <Field label="Purge sessions"><input type="number" min="1" value={form.rotation_purge_days} onChange={(event) => update('rotation_purge_days', event.target.value)} /></Field>
        <Field label="Downside penalty"><input type="number" min="0" step="0.05" value={form.rotation_downside_penalty} onChange={(event) => update('rotation_downside_penalty', event.target.value)} /></Field>
        <Field label="Drawdown penalty"><input type="number" min="0" step="0.05" value={form.rotation_drawdown_penalty} onChange={(event) => update('rotation_drawdown_penalty', event.target.value)} /></Field>
        <Field label="Minimum holding sessions"><input type="number" min="0" value={form.rotation_min_holding_days} onChange={(event) => update('rotation_min_holding_days', event.target.value)} /></Field>
        <Field label="Minimum expected edge"><input type="number" step="0.0005" value={form.rotation_min_expected_edge} onChange={(event) => update('rotation_min_expected_edge', event.target.value)} /></Field>
        <Field label="Cash threshold"><input type="number" step="0.001" value={form.rotation_cash_threshold} onChange={(event) => update('rotation_cash_threshold', event.target.value)} /></Field>
        <Field label="Switch margin"><input type="number" min="0" step="0.0025" value={form.rotation_switch_margin} onChange={(event) => update('rotation_switch_margin', event.target.value)} /></Field>
      </ParameterGroup>

      {isXgb && (
        <ParameterGroup title="XGBoost Utility" description="Supervised utility model used by the official H40 strategy and optional Day Trade comparison.">
          <Field label="Trees"><input type="number" min="10" value={form.rotation_xgb_n_estimators} onChange={(event) => update('rotation_xgb_n_estimators', event.target.value)} /></Field>
          <Field label="Learning rate"><input type="number" min="0.001" step="0.005" value={form.rotation_xgb_learning_rate} onChange={(event) => update('rotation_xgb_learning_rate', event.target.value)} /></Field>
          <Field label="Max depth"><input type="number" min="1" value={form.rotation_xgb_max_depth} onChange={(event) => update('rotation_xgb_max_depth', event.target.value)} /></Field>
          <Field label="Min child weight"><input type="number" min="0" step="0.5" value={form.xgb_min_child_weight} onChange={(event) => update('xgb_min_child_weight', event.target.value)} /></Field>
          <Field label="Subsample"><input type="number" min="0.1" max="1" step="0.05" value={form.xgb_subsample} onChange={(event) => update('xgb_subsample', event.target.value)} /></Field>
          <Field label="Column sample"><input type="number" min="0.1" max="1" step="0.05" value={form.xgb_colsample_bytree} onChange={(event) => update('xgb_colsample_bytree', event.target.value)} /></Field>
          <Field label="L1 regularization"><input type="number" min="0" step="0.1" value={form.xgb_reg_alpha} onChange={(event) => update('xgb_reg_alpha', event.target.value)} /></Field>
          <Field label="L2 regularization"><input type="number" min="0" step="0.1" value={form.xgb_reg_lambda} onChange={(event) => update('xgb_reg_lambda', event.target.value)} /></Field>
          <Field label="Repetitions"><input type="number" min="1" value={form.rotation_xgb_repetitions} onChange={(event) => update('rotation_xgb_repetitions', event.target.value)} /></Field>
        </ParameterGroup>
      )}

      {isQr && (
        <ParameterGroup title="QR-DQN" description="Controlled QR-DQN research parameters. QR0, QR1 and QR2 differ only in the N-step return horizon.">
          <Field label="Training steps"><input type="number" min="500" step="500" value={form.qrdqn_training_steps} onChange={(event) => update('qrdqn_training_steps', event.target.value)} /></Field>
          <Field label="Minimum training steps"><input type="number" min="500" step="500" value={form.qrdqn_min_training_steps} onChange={(event) => update('qrdqn_min_training_steps', event.target.value)} /></Field>
          <Field label="Parallel folds"><input type="number" min="1" value={form.qrdqn_parallel_folds} onChange={(event) => update('qrdqn_parallel_folds', event.target.value)} /></Field>
          <Field label="Episode sessions"><input type="number" min="20" value={form.qrdqn_episode_days} onChange={(event) => update('qrdqn_episode_days', event.target.value)} /></Field>
          <Field label="Replay size"><input type="number" min="1000" step="1000" value={form.qrdqn_replay_size} onChange={(event) => update('qrdqn_replay_size', event.target.value)} /></Field>
          <Field label="Learning starts"><input type="number" min="100" value={form.qrdqn_learning_starts} onChange={(event) => update('qrdqn_learning_starts', event.target.value)} /></Field>
          <Field label="Batch size"><input type="number" min="16" value={form.qrdqn_batch_size} onChange={(event) => update('qrdqn_batch_size', event.target.value)} /></Field>
          <Field label="Learning rate"><input type="number" min="0.000001" step="0.0001" value={form.qrdqn_learning_rate} onChange={(event) => update('qrdqn_learning_rate', event.target.value)} /></Field>
          <Field label="Gamma"><input type="number" min="0" max="1" step="0.01" value={form.qrdqn_gamma} onChange={(event) => update('qrdqn_gamma', event.target.value)} /></Field>
          <Field label="N-step return"><input type="number" min="1" max="60" value={form.qrdqn_n_step} onChange={(event) => update('qrdqn_n_step', event.target.value)} /></Field>
          <Field label="Quantiles"><input type="number" min="5" value={form.qrdqn_n_quantiles} onChange={(event) => update('qrdqn_n_quantiles', event.target.value)} /></Field>
          <Field label="Hidden dimension"><input type="number" min="16" value={form.qrdqn_hidden_dim} onChange={(event) => update('qrdqn_hidden_dim', event.target.value)} /></Field>
          <Field label="Target update steps"><input type="number" min="10" value={form.qrdqn_target_update_steps} onChange={(event) => update('qrdqn_target_update_steps', event.target.value)} /></Field>
          <Field label="Evaluation every steps"><input type="number" min="100" value={form.qrdqn_eval_every_steps} onChange={(event) => update('qrdqn_eval_every_steps', event.target.value)} /></Field>
          <Field label="Epsilon start"><input type="number" min="0" max="1" step="0.05" value={form.qrdqn_epsilon_start} onChange={(event) => update('qrdqn_epsilon_start', event.target.value)} /></Field>
          <Field label="Epsilon end"><input type="number" min="0" max="1" step="0.01" value={form.qrdqn_epsilon_end} onChange={(event) => update('qrdqn_epsilon_end', event.target.value)} /></Field>
          <Field label="Repetitions"><input type="number" min="1" value={form.rotation_qrdqn_repetitions} onChange={(event) => update('rotation_qrdqn_repetitions', event.target.value)} /></Field>
          <div className="switch-group"><Switch label="Early stopping" checked={form.qrdqn_early_stopping_enabled} onChange={(value) => update('qrdqn_early_stopping_enabled', value)} /></div>
          {form.qrdqn_early_stopping_enabled && <Field label="Early-stopping patience"><input type="number" min="1" value={form.qrdqn_early_stopping_patience} onChange={(event) => update('qrdqn_early_stopping_patience', event.target.value)} /></Field>}
        </ParameterGroup>
      )}

      <ParameterGroup title="Execution and compute" description="Capital, transaction-cost and compute controls shared by the active models.">
        <Field label="Accelerator"><select value={form.rotation_accelerator} onChange={(event) => update('rotation_accelerator', event.target.value)}><option value="auto">Auto</option><option value="cpu">CPU</option><option value="cuda">CUDA</option></select></Field>
        <Field label="Seed step"><input type="number" min="1" value={form.rotation_seed_step} onChange={(event) => update('rotation_seed_step', event.target.value)} /></Field>
        <Field label="Slippage bps"><input type="number" min="0" step="0.1" value={form.slippage_bps} onChange={(event) => update('slippage_bps', event.target.value)} /></Field>
        <Field label="Commission rate"><input type="number" min="0" step="0.0001" value={form.commission_rate} onChange={(event) => update('commission_rate', event.target.value)} /></Field>
        <Field label="SEC fee rate"><input type="number" min="0" step="0.000001" value={form.sec_fee_rate} onChange={(event) => update('sec_fee_rate', event.target.value)} /></Field>
        <Field label="TAF fee/share"><input type="number" min="0" step="0.000001" value={form.taf_fee_per_share} onChange={(event) => update('taf_fee_per_share', event.target.value)} /></Field>
        <Field label="TAF fee cap"><input type="number" min="0" step="0.01" value={form.taf_fee_cap} onChange={(event) => update('taf_fee_cap', event.target.value)} /></Field>
        <Field label="CAT fee/share"><input type="number" min="0" step="0.000001" value={form.cat_fee_per_share} onChange={(event) => update('cat_fee_per_share', event.target.value)} /></Field>
        <div className="switch-group"><Switch label="Use whole shares only" checked={form.whole_shares} onChange={(value) => update('whole_shares', value)} /><Switch label="Allow CPU fallback" checked={form.rotation_allow_cpu_fallback} onChange={(value) => update('rotation_allow_cpu_fallback', value)} /></div>
        <div className="settings-message">XGBoost available: {computeStatus?.xgboost?.device_available?.toUpperCase() || 'unknown'} · QR-DQN available: {computeStatus?.qrdqn?.device_available?.toUpperCase() || 'unknown'}</div>
      </ParameterGroup>

      <ParameterGroup title="Market data and cache" description="Provider-specific settings and MongoDB market-bar cache.">
        <Field label="Alpaca feed"><select value={form.alpaca_feed} onChange={(event) => update('alpaca_feed', event.target.value)}><option value="iex">IEX</option><option value="sip">SIP</option></select></Field>
        <Field label="Alpaca adjustment"><select value={form.alpaca_adjustment} onChange={(event) => update('alpaca_adjustment', event.target.value)}><option value="all">All</option><option value="split">Split</option><option value="dividend">Dividend</option><option value="raw">Raw</option></select></Field>
        <Field label="Yahoo timeout"><input type="number" min="1" value={form.yfinance_timeout} onChange={(event) => update('yfinance_timeout', event.target.value)} /></Field>
        <Field label="Cache refresh overlap days"><input type="number" min="0" value={form.mongo_refresh_overlap_days} onChange={(event) => update('mongo_refresh_overlap_days', event.target.value)} /></Field>
        <Field label="Mongo write batch size"><input type="number" min="1" value={form.mongo_write_batch_size} onChange={(event) => update('mongo_write_batch_size', event.target.value)} /></Field>
        <Field label="Random state"><input type="number" value={form.random_state} onChange={(event) => update('random_state', event.target.value)} /></Field>
        <div className="switch-group"><Switch label="Use MongoDB market cache" checked={form.mongo_cache_enabled} onChange={(value) => update('mongo_cache_enabled', value)} /><Switch label="Yahoo auto-adjust" checked={form.yfinance_auto_adjust} onChange={(value) => update('yfinance_auto_adjust', value)} /><Switch label="Yahoo repair" checked={form.yfinance_repair} onChange={(value) => update('yfinance_repair', value)} /></div>
      </ParameterGroup>

      <ParameterGroup title="Alpaca integration" description="Credentials are stored separately from backtest configuration.">
        <Field label="API Key ID"><input type="password" value={alpacaApiKeyId} onChange={(event) => setAlpacaApiKeyId(event.target.value)} placeholder={alpacaIntegration.api_key_id_masked || ''} /></Field>
        <Field label="Secret Key"><input type="password" value={alpacaSecretKey} onChange={(event) => setAlpacaSecretKey(event.target.value)} /></Field>
        <div className="inline-actions"><button className="button primary" type="button" onClick={saveAndTestAlpaca} disabled={alpacaBusy}>{alpacaBusy ? 'Working…' : 'Save and test'}</button><button className="button secondary" type="button" onClick={testStoredAlpaca} disabled={alpacaBusy || !alpacaIntegration.configured}>Test stored credentials</button><button className="button ghost" type="button" onClick={removeAlpaca} disabled={alpacaBusy || !alpacaIntegration.configured}>Remove credentials</button></div>
        {alpacaMessage && <div className="settings-message">{alpacaMessage}</div>}
      </ParameterGroup>
    </div>
  )
}

