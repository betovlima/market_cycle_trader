import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import { ApiError, apiFetch, downloadFile } from '../api/http'
import { hasCapability } from '../auth/capabilities'
import { API } from '../config/env'
import { tr } from '../i18n/runtime'
import { PlayIcon } from '../shared/components/Icons'
import { money, number, percent, shortDateTime } from '../shared/formatters'

function statusLabel(value) {
  const normalized = String(value || '').toLowerCase()
  if (normalized === 'completed') return tr('Completed')
  if (normalized === 'running') return tr('Running')
  if (normalized === 'queued') return tr('Queued')
  if (normalized === 'stop_requested') return tr('Stopping')
  if (normalized === 'cancelled') return tr('Stopped')
  if (normalized === 'interrupted') return tr('Interrupted')
  if (normalized === 'failed') return tr('Failed')
  return value || '—'
}

function Metric({ label, value, note, tone = '' }) {
  return (
    <div className={`temporal-metric ${tone}`}>
      <span>{label}</span>
      <strong>{value}</strong>
      {note ? <small>{note}</small> : null}
    </div>
  )
}

function LegacyHorizonTable({ items = [], selectedHorizon, onSelect }) {
  return (
    <div className="temporal-table-shell">
      <table className="temporal-table">
        <thead>
          <tr>
            <th>{tr('Horizon')}</th><th>{tr('OOS Samples')}</th><th>{tr('Brier')}</th><th>{tr('Brier Skill')}</th>
            <th>{tr('Calibration Error')}</th><th>{tr('AUC')}</th><th>{tr('Alpha Rank Correlation')}</th>
            <th>{tr('Alpha MAE')}</th><th>{tr('Alpha MAE Skill')}</th><th>{tr('Drawdown MAE')}</th>
            <th>{tr('Drawdown MAE Skill')}</th><th>{tr('High Confidence Hit Rate')}</th><th>{tr('High Confidence Lift')}</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item) => (
            <tr key={item.horizon} className={Number(selectedHorizon) === Number(item.horizon) ? 'selected' : ''} onClick={() => onSelect(Number(item.horizon))}>
              <td><strong>{item.horizon}d</strong></td><td>{number(item.samples, 0)}</td><td>{number(item.brier, 4)}</td>
              <td>{percent(item.brier_skill, 2)}</td><td>{percent(item.calibration_error, 2)}</td><td>{number(item.auc, 3)}</td>
              <td>{number(item.alpha_rank_correlation, 3)}</td><td>{percent(item.alpha_mae, 2)}</td><td>{percent(item.alpha_mae_skill, 2)}</td>
              <td>{percent(item.drawdown_mae, 2)}</td><td>{percent(item.drawdown_mae_skill, 2)}</td>
              <td>{percent(item.high_confidence_positive_rate, 2)}</td><td>{percent(item.high_confidence_lift, 2)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function DecisionHorizonTable({ items = [], selectedHorizon, onSelect, showWinnerComparison = false }) {
  return (
    <div className="temporal-table-shell">
      <table className="temporal-table temporal-decision-horizon-table">
        <thead>
          <tr>
            <th>{tr('Horizon')}</th><th>{tr('OOS Samples')}</th><th>{tr('Profit Barrier')}</th><th>{tr('Loss Barrier')}</th>
            <th>{tr('Profit-first AUC')}</th><th>{tr('Profit-first Brier Skill')}</th><th>{tr('Bottom AUC')}</th><th>{tr('Top AUC')}</th>
            <th>{tr('Trend Persistence AUC')}</th><th>{tr('Drawdown MAE Skill')}</th><th>{tr('Shadow Capital')}</th><th>{tr('CAGR')}</th>
            <th>{tr('Sharpe')}</th><th>{tr('Max Drawdown')}</th><th>{tr('Exposure')}</th><th>{tr('Switches')}</th>{showWinnerComparison ? <th>{tr('Vs Winner')}</th> : null}
          </tr>
        </thead>
        <tbody>
          {items.map((item) => {
            const capital = item.shadow_capital || {}
            return (
              <tr key={item.horizon} className={Number(selectedHorizon) === Number(item.horizon) ? 'selected' : ''} onClick={() => onSelect(Number(item.horizon))}>
                <td><strong>{item.horizon}d</strong></td><td>{number(item.samples, 0)}</td><td>{percent(item.profit_barrier, 2)}</td><td>{percent(item.loss_barrier, 2)}</td>
                <td>{number(item.profit_before_loss_auc, 3)}</td><td>{percent(item.profit_before_loss_brier_skill, 2)}</td><td>{number(item.bottom_auc, 3)}</td>
                <td>{number(item.top_auc, 3)}</td><td>{number(item.trend_persistence_auc, 3)}</td><td>{percent(item.drawdown_mae_skill, 2)}</td>
                <td>{money(capital.ending_capital)}</td><td>{percent(capital.cagr, 2)}</td><td>{number(capital.sharpe, 3)}</td>
                <td>{percent(capital.max_drawdown, 2)}</td><td>{percent(capital.exposure, 2)}</td><td>{number(capital.switch_count, 0)}</td>{showWinnerComparison ? <td className={Number(item.capital_vs_winner || 0) >= 0 ? 'positive' : 'negative'}>{percent(item.capital_vs_winner, 2)}</td> : null}
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

function ConfidenceTable({ items = [] }) {
  if (!items.length) return null
  return (
    <div className="temporal-table-shell compact">
      <table className="temporal-table">
        <thead><tr><th>{tr('Probability Band')}</th><th>{tr('Samples')}</th><th>{tr('Mean Probability')}</th><th>{tr('Realized Hit Rate')}</th><th>{tr('Realized Alpha')}</th><th>{tr('Predicted Alpha')}</th><th>{tr('Realized Drawdown')}</th></tr></thead>
        <tbody>{items.map((item) => <tr key={`${item.from_probability}-${item.to_probability}`}><td>{percent(item.from_probability, 0)}–{percent(item.to_probability, 0)}</td><td>{number(item.samples, 0)}</td><td>{percent(item.mean_probability, 2)}</td><td>{percent(item.realized_positive_rate, 2)}</td><td>{percent(item.mean_realized_alpha, 2)}</td><td>{percent(item.mean_predicted_alpha, 2)}</td><td>{percent(item.mean_realized_drawdown, 2)}</td></tr>)}</tbody>
      </table>
    </div>
  )
}

function RiskTable({ items = [] }) {
  if (!items.length) return null
  return (
    <div className="temporal-table-shell compact">
      <table className="temporal-table">
        <thead><tr><th>{tr('Risk Bucket')}</th><th>{tr('Samples')}</th><th>{tr('Predicted Drawdown')}</th><th>{tr('Realized Drawdown')}</th><th>{tr('P90 Realized Drawdown')}</th></tr></thead>
        <tbody>{items.map((item) => <tr key={item.bucket}><td><strong>{tr(item.bucket)}</strong></td><td>{number(item.samples, 0)}</td><td>{percent(item.mean_predicted_drawdown, 2)}</td><td>{percent(item.mean_realized_drawdown, 2)}</td><td>{percent(item.p90_realized_drawdown, 2)}</td></tr>)}</tbody>
      </table>
    </div>
  )
}

function SignalMetricsTable({ items = [] }) {
  if (!items.length) return null
  return (
    <div className="temporal-table-shell compact">
      <table className="temporal-table temporal-signal-table">
        <thead><tr><th>{tr('Signal')}</th><th>{tr('Positive Rate')}</th><th>{tr('Brier')}</th><th>{tr('Brier Skill')}</th><th>{tr('Calibration Error')}</th><th>{tr('AUC')}</th><th>{tr('High Confidence Hit Rate')}</th><th>{tr('High Confidence Lift')}</th></tr></thead>
        <tbody>{items.map((item) => <tr key={item.signal}><td><strong>{tr(item.signal)}</strong></td><td>{percent(item.positive_rate, 2)}</td><td>{number(item.brier, 4)}</td><td>{percent(item.brier_skill, 2)}</td><td>{percent(item.calibration_error, 2)}</td><td>{number(item.auc, 3)}</td><td>{percent(item.high_confidence_positive_rate, 2)}</td><td>{percent(item.high_confidence_lift, 2)}</td></tr>)}</tbody>
      </table>
    </div>
  )
}

function LegacyForecastTable({ items = [] }) {
  if (!items.length) return <div className="temporal-empty">{tr('No latest forecast is available for this horizon.')}</div>
  return (
    <div className="temporal-table-shell">
      <table className="temporal-table temporal-forecast-table">
        <thead><tr><th>{tr('Asset')}</th><th>{tr('Expected Alpha')}</th><th>{tr('P(Alpha > 0)')}</th><th>{tr('Expected Max Drawdown')}</th></tr></thead>
        <tbody>{items.map((item) => <tr key={`${item.horizon}-${item.symbol}`}><td><strong>{item.symbol}</strong></td><td className={Number(item.expected_alpha) >= 0 ? 'positive' : 'negative'}>{percent(item.expected_alpha, 2)}</td><td>{percent(item.probability_positive_alpha, 2)}</td><td>{percent(item.expected_max_drawdown, 2)}</td></tr>)}</tbody>
      </table>
    </div>
  )
}

function DecisionForecastTable({ items = [], capitalPolicyV2 = false, capitalPolicyV3 = false }) {
  if (!items.length) return <div className="temporal-empty">{tr('No latest forecast is available for this horizon.')}</div>
  return (
    <div className="temporal-table-shell">
      <table className="temporal-table temporal-decision-forecast-table">
        <thead><tr><th>{tr('Asset')}</th><th>{tr('Shadow State')}</th>{capitalPolicyV3 ? <><th>{tr('Asset Rank')}</th><th>{tr('Opportunity Gate')}</th><th>{tr('Profit Percentile')}</th><th>{tr('P(Profit) vs Median')}</th><th>{tr('Top-1 Gap')}</th><th>{tr('Risk Safety')}</th></> : <th>{tr(capitalPolicyV2 ? 'Entry Score' : 'Decision Score')}</th>}{capitalPolicyV2 && !capitalPolicyV3 ? <><th>{tr('Entry Threshold')}</th><th>{tr('Adjusted P(Profit)')}</th><th>{tr('Expected Barrier Edge')}</th></> : null}<th>{tr('Trend')}</th><th>{tr('P(Profit before Loss)')}</th><th>{tr('P(Bottom)')}</th><th>{tr('P(Top)')}</th><th>{tr('P(Trend Persistence)')}</th><th>{tr('P(Reversal)')}</th><th>{tr('Expected Max Drawdown')}</th>{capitalPolicyV2 ? <><th>{tr('Profit Quality')}</th><th>{tr('Risk Quality')}</th><th>{tr('Bottom Quality')}</th><th>{tr('Top Quality')}</th><th>{tr('Trend Quality')}</th></> : null}</tr></thead>
        <tbody>{items.map((item) => <tr key={`${item.horizon}-${item.symbol}`} className={item.shadow_target ? 'temporal-shadow-target' : ''}><td><strong>{item.symbol}</strong></td><td><span className={`temporal-decision-chip ${item.shadow_target ? 'positive' : ''}`}>{tr(item.shadow_state || 'CASH')}</span></td>{capitalPolicyV3 ? <><td>{number(item.asset_rank_score, 4)}</td><td>{number(item.opportunity_gate_score, 4)} / {number(item.entry_threshold, 4)}</td><td>{percent(item.profit_percentile, 1)}</td><td>{percent(item.profit_spread_vs_median, 2)}</td><td>{percent(item.profit_top_gap, 2)}</td><td>{percent(item.risk_safety_percentile, 1)}</td></> : <td>{number(capitalPolicyV2 ? item.entry_score : item.decision_score, 4)}</td>}{capitalPolicyV2 && !capitalPolicyV3 ? <><td>{number(item.entry_threshold, 4)}</td><td>{percent(item.adjusted_profit_probability, 2)}</td><td>{percent(item.expected_barrier_return, 2)}</td></> : null}<td>{tr(item.trend_state || 'flat')}</td><td>{percent(item.probability_profit_before_loss, 2)}</td><td>{percent(item.probability_bottom, 2)}</td><td>{percent(item.probability_top, 2)}</td><td>{percent(item.probability_trend_persistence, 2)}</td><td>{percent(item.probability_trend_reversal, 2)}</td><td>{percent(item.expected_max_drawdown, 2)}</td>{capitalPolicyV2 ? <><td>{percent(item.profit_quality_weight, 1)}</td><td>{percent(item.drawdown_quality_weight, 1)}</td><td>{percent(item.bottom_quality_weight, 1)}</td><td>{percent(item.top_quality_weight, 1)}</td><td>{percent(item.trend_quality_weight, 1)}</td></> : null}</tr>)}</tbody>
      </table>
    </div>
  )
}


function MultiHorizonFoldTable({ items = [] }) {
  if (!items.length) return null
  return (
    <div className="temporal-table-shell compact">
      <table className="temporal-table">
        <thead>
          <tr><th>{tr('Fold')}</th><th>{tr('Test Window')}</th><th>{tr('Capital')}</th><th>{tr('Return')}</th><th>{tr('Sharpe')}</th><th>{tr('Max Drawdown')}</th><th>{tr('Exposure')}</th><th>{tr('Return Gap vs Winner')}</th><th>{tr('Return Gap vs Benchmark')}</th></tr>
        </thead>
        <tbody>
          {items.map((item) => {
            const capital = item.shadow_capital || {}
            return <tr key={item.fold_id}><td><strong>#{item.fold_id}</strong></td><td>{String(item.test_start || '').slice(0, 10)} → {String(item.test_end || '').slice(0, 10)}</td><td>{money(capital.ending_capital)}</td><td>{percent(capital.total_return, 2)}</td><td>{number(capital.sharpe, 3)}</td><td>{percent(capital.max_drawdown, 2)}</td><td>{percent(capital.exposure, 2)}</td><td className={Number(item.return_gap_vs_winner || 0) >= 0 ? 'positive' : 'negative'}>{percent(item.return_gap_vs_winner, 2)}</td><td className={Number(item.return_gap_vs_benchmark || 0) >= 0 ? 'positive' : 'negative'}>{percent(item.return_gap_vs_benchmark, 2)}</td></tr>
          })}
        </tbody>
      </table>
    </div>
  )
}

function MultiHorizonForecastTable({ items = [], horizons = [], trendCapturePolicy = false }) {
  if (!items.length) return <div className="temporal-empty">{tr('No multi-horizon forecast is available.')}</div>
  return (
    <div className="temporal-table-shell">
      <table className="temporal-table temporal-decision-forecast-table">
        <thead>
          <tr>
            <th>{tr('Asset')}</th><th>{tr('Shadow State')}</th><th>{tr('Asset Rank')}</th><th>{tr('Opportunity Gate')}</th>
            {trendCapturePolicy ? <><th>{tr('Risk-Adjusted Entry')}</th><th>{tr('Incumbent Persistence')}</th></> : null}
            <th>{tr('Short Profit Consensus')}</th><th>{tr('Short Risk Safety')}</th><th>{tr('Short Agreement')}</th>
            <th>{tr('Long Confirmation')}</th><th>{tr('Long Risk Safety')}</th><th>{tr('Horizon Agreement')}</th><th>{tr('Expected Max Drawdown')}</th>
            {horizons.map((horizon) => <th key={`profit-${horizon}`}>{horizon}d {tr('Profit Rank')}</th>)}
          </tr>
        </thead>
        <tbody>
          {items.map((item) => (
            <tr key={item.symbol} className={item.shadow_target ? 'temporal-shadow-target' : ''}>
              <td><strong>{item.symbol}</strong></td>
              <td><span className={`temporal-decision-chip ${item.shadow_target ? 'positive' : ''}`}>{tr(item.shadow_state || 'CASH')}</span></td>
              <td>{number(item.asset_rank_score, 4)}</td>
              <td>{number(item.opportunity_gate_score, 4)}</td>
              {trendCapturePolicy ? <><td>{number(item.risk_adjusted_entry_score, 4)} / {number(item.entry_threshold, 4)}</td><td>{number(item.incumbent_persistence_score, 4)}</td></> : null}
              <td>{percent(item.short_profit_consensus, 1)}</td>
              <td>{percent(item.short_risk_safety, 1)}</td>
              <td>{percent(item.short_horizon_agreement, 1)}</td>
              <td>{percent(item.long_profit_confirmation, 1)}</td>
              <td>{percent(item.long_risk_safety, 1)}</td>
              <td>{percent(item.horizon_agreement, 1)}</td>
              <td>{percent(item.expected_max_drawdown, 2)}</td>
              {horizons.map((horizon) => <td key={`${item.symbol}-${horizon}`}>{percent(item[`profit_percentile_${horizon}d`], 1)}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export function TemporalIntelligencePanel({ capabilities = {}, onSessionExpired }) {
  const canStart = hasCapability(capabilities, 'temporal_intelligence.start')
  const canStop = hasCapability(capabilities, 'temporal_intelligence.stop')
  const canExport = hasCapability(capabilities, 'temporal_intelligence.export')
  const [run, setRun] = useState(null)
  const [history, setHistory] = useState([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [error, setError] = useState('')
  const [selectedHorizon, setSelectedHorizon] = useState(null)
  const pollRef = useRef(null)

  const handleError = useCallback((requestError) => {
    if (requestError instanceof ApiError && requestError.status === 401) {
      onSessionExpired?.()
      return
    }
    if (requestError?.status === 403) return
    setError(tr(requestError?.message || 'Unable to load Temporal Intelligence.'))
  }, [onSessionExpired])

  const load = useCallback(async ({ silent = false } = {}) => {
    if (!silent) setLoading(true)
    try {
      const [latest, historyResponse] = await Promise.all([
        apiFetch(`${API}/temporal-intelligence/latest`),
        apiFetch(`${API}/temporal-intelligence/history?limit=20`),
      ])
      setRun(latest)
      setHistory(historyResponse?.items || [])
      setError('')
    } catch (requestError) {
      handleError(requestError)
    } finally {
      if (!silent) setLoading(false)
    }
  }, [handleError])

  useEffect(() => { load() }, [load])

  const active = ['queued', 'running', 'stop_requested'].includes(String(run?.status || '').toLowerCase())
  useEffect(() => {
    if (!active) {
      if (pollRef.current) window.clearInterval(pollRef.current)
      pollRef.current = null
      return undefined
    }
    pollRef.current = window.setInterval(() => load({ silent: true }), 2500)
    return () => {
      if (pollRef.current) window.clearInterval(pollRef.current)
      pollRef.current = null
    }
  }, [active, load])

  const result = run?.result || null
  const horizonMetrics = result?.horizon_metrics || []
  const trendCapturePolicy = result?.experiment === 'temporal_decision_intelligence_v5_trend_capture_hysteresis'
  const multiHorizonPolicy = ['temporal_decision_intelligence_v4_multi_horizon', 'temporal_decision_intelligence_v5_trend_capture_hysteresis'].includes(result?.experiment)
  const decisionExperiment = ['temporal_decision_intelligence_v1', 'temporal_decision_intelligence_v2', 'temporal_decision_intelligence_v3', 'temporal_decision_intelligence_v4_multi_horizon', 'temporal_decision_intelligence_v5_trend_capture_hysteresis'].includes(result?.experiment)
  const capitalPolicyV2 = ['temporal_decision_intelligence_v2', 'temporal_decision_intelligence_v3', 'temporal_decision_intelligence_v4_multi_horizon', 'temporal_decision_intelligence_v5_trend_capture_hysteresis'].includes(result?.experiment)
  const capitalPolicyV3 = ['temporal_decision_intelligence_v3', 'temporal_decision_intelligence_v4_multi_horizon', 'temporal_decision_intelligence_v5_trend_capture_hysteresis'].includes(result?.experiment)
  useEffect(() => {
    if (!horizonMetrics.length) {
      setSelectedHorizon(null)
      return
    }
    if (!horizonMetrics.some((item) => Number(item.horizon) === Number(selectedHorizon))) {
      setSelectedHorizon(Number(horizonMetrics[0].horizon))
    }
  }, [horizonMetrics, selectedHorizon])

  const selectedMetrics = useMemo(() => horizonMetrics.find((item) => Number(item.horizon) === Number(selectedHorizon)) || null, [horizonMetrics, selectedHorizon])
  const forecasts = useMemo(() => (result?.latest_forecasts || []).filter((item) => Number(item.horizon) === Number(selectedHorizon)), [result?.latest_forecasts, selectedHorizon])
  const multiHorizonMetrics = result?.multi_horizon_metrics || null
  const multiHorizonCapital = multiHorizonMetrics?.shadow_capital || {}
  const multiHorizonForecasts = result?.multi_horizon_latest_forecasts || []
  const multiHorizonFoldMetrics = result?.multi_horizon_fold_metrics || []
  const multiHorizonBestForecast = multiHorizonForecasts.find((item) => item.shadow_target) || null

  async function start() {
    if (!canStart || busy || active) return
    setBusy(true)
    setError('')
    try {
      const created = await apiFetch(`${API}/temporal-intelligence`, { method: 'POST' })
      setRun(created)
      await load({ silent: true })
    } catch (requestError) {
      handleError(requestError)
    } finally {
      setBusy(false)
    }
  }

  async function stop() {
    if (!canStop || busy || !active || !run?.id) return
    setBusy(true)
    setError('')
    try {
      const updated = await apiFetch(`${API}/temporal-intelligence/${encodeURIComponent(run.id)}/stop`, { method: 'POST' })
      setRun(updated)
    } catch (requestError) {
      handleError(requestError)
    } finally {
      setBusy(false)
    }
  }

  async function exportResults() {
    if (!canExport || exporting || !run?.id || !run?.result) return
    setExporting(true)
    setError('')
    try {
      await downloadFile(`${API}/temporal-intelligence/${encodeURIComponent(run.id)}/export.zip`, `temporal_intelligence_${run.id}.zip`)
    } catch (requestError) {
      handleError(requestError)
    } finally {
      setExporting(false)
    }
  }

  if (loading) return <div className="temporal-loading"><span className="loading-ring" />{tr('Loading Temporal Intelligence…')}</div>

  const shadowCapital = selectedMetrics?.shadow_capital || {}
  const bestForecast = decisionExperiment ? forecasts.find((item) => item.shadow_target) : null

  return (
    <div className="temporal-intelligence-panel">
      <div className="temporal-toolbar">
        <div className="temporal-run-meta">
          <span>{tr('Strategy')}</span><strong>{run?.strategy_profile_name || '—'}</strong><i>·</i><span>{tr('Model')}</span><strong>{run?.model_label || 'LightGBM'}</strong>
          {run?.analysis_end_date ? <><i>·</i><span>{tr('Data through')}</span><strong>{run.analysis_end_date}</strong></> : null}
        </div>
        <div className="temporal-actions">
          {canExport && run?.result ? <button type="button" className="secondary-action compact" onClick={exportResults} disabled={exporting}>{tr(exporting ? 'Exporting…' : 'Export Results')}</button> : null}
          {canStop && active ? <button type="button" className="secondary-action compact" onClick={stop} disabled={busy}>{tr(busy ? 'Stopping…' : 'Stop')}</button> : null}
          {canStart ? <button type="button" className="primary-action compact" onClick={start} disabled={busy || active}><PlayIcon />{tr(busy ? 'Starting…' : active ? 'Running' : 'Start Temporal Intelligence')}</button> : null}
        </div>
      </div>

      {error ? <div className="global-inline-message error-inline">{error}</div> : null}
      {run?.failure_message ? <div className="global-inline-message error-inline">{tr(run.failure_message)}</div> : null}

      {run ? <section className="temporal-status-panel"><div className="temporal-status-line"><strong>{statusLabel(run.status)}</strong><span>{run.stage || '—'}</span><span>{number(run.progress, 0)}%</span></div><div className="temporal-progress"><span style={{ width: `${Math.max(0, Math.min(100, Number(run.progress || 0)))}%` }} /></div><div className="temporal-status-meta"><span>{tr('Run')} {run.id}</span><span>{tr('Created')} {shortDateTime(run.created_at)}</span>{run.finished_at ? <span>{tr('Finished')} {shortDateTime(run.finished_at)}</span> : null}</div></section> : <div className="temporal-empty">{tr('No Temporal Intelligence execution yet.')}</div>}

      {result ? <>
        <section className="temporal-summary-grid"><Metric label={tr('Assets')} value={number(result.asset_count, 0)} note={`${number(result.feature_count, 0)} ${tr('features')}`} /><Metric label={tr('Walk-forward Folds')} value={number(result.walk_forward_fold_count, 0)} note={`${number(result.purge_sessions, 0)} ${tr('purge sessions')}`} /><Metric label={tr('Horizons')} value={(result.horizons || []).map((item) => `${item}d`).join(' · ')} /><Metric label={tr('OOS Window')} value={`${String(result.oos_start || '').slice(0, 10)} → ${String(result.oos_end || '').slice(0, 10)}`} /></section>
        {capitalPolicyV3 && result.winner_reference ? <section className="temporal-summary-grid selected-horizon"><Metric label={tr('Winner Replay Capital')} value={money(result.winner_reference.ending_capital)} tone="positive" /><Metric label={tr('Winner Replay CAGR')} value={percent(result.winner_reference.cagr, 2)} /><Metric label={tr('Winner Replay Sharpe')} value={number(result.winner_reference.sharpe, 3)} /><Metric label={tr('Winner Replay Max Drawdown')} value={percent(result.winner_reference.max_drawdown, 2)} tone={Number(result.winner_reference.max_drawdown || 0) < 0 ? 'negative' : ''} /><Metric label={tr('Benchmark Capital')} value={money(result.winner_reference.benchmark_ending_capital)} /><Metric label={tr('Same Frozen Snapshot')} value={result.winner_reference.same_frozen_market_snapshot ? tr('Yes') : tr('No')} /></section> : null}

        {multiHorizonPolicy && multiHorizonMetrics ? <>
          <section className="temporal-section">
            <div className="temporal-section-heading"><h3>{tr('Multi-Horizon Decision Engine')}</h3><span>{tr(trendCapturePolicy ? 'Trend Capture + Decision Hysteresis' : 'Single BUY / HOLD / SELL / CASH policy')}</span></div>
            <div className="temporal-summary-grid selected-horizon">
              <Metric label={tr('Multi-Horizon Capital')} value={money(multiHorizonCapital.ending_capital)} tone={Number(multiHorizonCapital.total_return || 0) >= 0 ? 'positive' : 'negative'} />
              <Metric label={tr('CAGR')} value={percent(multiHorizonCapital.cagr, 2)} tone={Number(multiHorizonCapital.cagr || 0) >= 0 ? 'positive' : 'negative'} />
              <Metric label={tr('Sharpe')} value={number(multiHorizonCapital.sharpe, 3)} />
              <Metric label={tr('Max Drawdown')} value={percent(multiHorizonCapital.max_drawdown, 2)} tone={Number(multiHorizonCapital.max_drawdown || 0) < 0 ? 'negative' : ''} />
              <Metric label={tr('Exposure')} value={percent(multiHorizonCapital.exposure, 2)} />
              {trendCapturePolicy ? <Metric label={tr('Switches')} value={number(multiHorizonCapital.switch_count, 0)} note={`${tr('Median hold')} ${number(multiHorizonCapital.median_holding_days, 1)}d`} /> : null}
              {trendCapturePolicy ? <Metric label={tr('Short Holds ≤ 2d')} value={percent(multiHorizonCapital.short_holding_ratio_2d, 1)} note={`${tr('Median CASH')} ${number(multiHorizonCapital.median_cash_days, 1)}d`} /> : null}
              {trendCapturePolicy ? <Metric label={tr('Re-entries')} value={number(multiHorizonCapital.reentry_count, 0)} note={`${number(multiHorizonCapital.next_day_reentry_count, 0)} ${tr('next-day')}`} /> : null}
              <Metric label={tr('Vs Winner')} value={percent(multiHorizonMetrics.capital_vs_winner, 2)} tone={Number(multiHorizonMetrics.capital_vs_winner || 0) >= 0 ? 'positive' : 'negative'} />
              <Metric label={tr('Vs Benchmark')} value={percent(multiHorizonMetrics.capital_vs_benchmark, 2)} tone={Number(multiHorizonMetrics.capital_vs_benchmark || 0) >= 0 ? 'positive' : 'negative'} />
              <Metric label={tr('Latest Shadow Target')} value={multiHorizonBestForecast?.symbol || tr('CASH')} note={multiHorizonBestForecast ? `${tr('Opportunity Gate')} ${number(multiHorizonBestForecast.opportunity_gate_score, 4)}` : ''} />
            </div>
            <div className="temporal-run-meta temporal-multi-horizon-roles">
              <span>{tr('Entry Horizons')}</span><strong>{(multiHorizonMetrics.entry_horizons || []).map((item) => `${item}d`).join(' · ')}</strong><i>·</i>
              <span>{tr('Hold Horizons')}</span><strong>{(multiHorizonMetrics.hold_horizons || []).map((item) => `${item}d`).join(' · ')}</strong><i>·</i>
              <span>{tr('Risk Horizons')}</span><strong>{(multiHorizonMetrics.risk_horizons || []).map((item) => `${item}d`).join(' · ')}</strong>
            </div>
            <div className="temporal-section-heading"><h3>{tr('Multi-Horizon Folds')}</h3></div>
            <MultiHorizonFoldTable items={multiHorizonFoldMetrics} />
            <div className="temporal-section-heading"><h3>{tr('Latest Multi-Horizon Decision')}</h3></div>
            <MultiHorizonForecastTable items={multiHorizonForecasts} horizons={result.horizons || []} trendCapturePolicy={trendCapturePolicy} />
          </section>
        </> : null}

        <section className="temporal-section"><div className="temporal-section-heading"><h3>{tr(decisionExperiment ? 'Decision Metrics by Horizon' : 'Out-of-Sample Metrics by Horizon')}</h3></div>{decisionExperiment ? <DecisionHorizonTable items={horizonMetrics} selectedHorizon={selectedHorizon} onSelect={setSelectedHorizon} showWinnerComparison={capitalPolicyV3} /> : <LegacyHorizonTable items={horizonMetrics} selectedHorizon={selectedHorizon} onSelect={setSelectedHorizon} />}</section>

        {selectedMetrics && decisionExperiment ? <section className="temporal-summary-grid selected-horizon"><Metric label={tr('Shadow Capital')} value={money(shadowCapital.ending_capital)} tone={Number(shadowCapital.total_return || 0) >= 0 ? 'positive' : 'negative'} /><Metric label={tr('CAGR')} value={percent(shadowCapital.cagr, 2)} tone={Number(shadowCapital.cagr || 0) >= 0 ? 'positive' : 'negative'} /><Metric label={tr('Sharpe')} value={number(shadowCapital.sharpe, 3)} /><Metric label={tr('Max Drawdown')} value={percent(shadowCapital.max_drawdown, 2)} tone={Number(shadowCapital.max_drawdown || 0) < 0 ? 'negative' : ''} /><Metric label={tr('Exposure')} value={percent(shadowCapital.exposure, 2)} />{capitalPolicyV3 ? <Metric label={tr('Vs Winner')} value={percent(selectedMetrics.capital_vs_winner, 2)} tone={Number(selectedMetrics.capital_vs_winner || 0) >= 0 ? 'positive' : 'negative'} /> : null}<Metric label={tr('Latest Shadow Target')} value={bestForecast?.symbol || tr('CASH')} note={bestForecast ? `${tr(capitalPolicyV3 ? 'Opportunity Gate' : capitalPolicyV2 ? 'Entry Score' : 'Decision Score')} ${number(capitalPolicyV3 ? bestForecast.opportunity_gate_score : capitalPolicyV2 ? bestForecast.entry_score : bestForecast.decision_score, 4)}` : ''} /></section> : null}

        {selectedMetrics && !decisionExperiment ? <section className="temporal-summary-grid selected-horizon"><Metric label={tr('P(Alpha > 0) Brier')} value={number(selectedMetrics.brier, 4)} /><Metric label={tr('Brier Skill')} value={percent(selectedMetrics.brier_skill, 2)} tone={Number(selectedMetrics.brier_skill || 0) >= 0 ? 'positive' : 'negative'} /><Metric label={tr('Calibration Error')} value={percent(selectedMetrics.calibration_error, 2)} /><Metric label={tr('Alpha MAE Skill')} value={percent(selectedMetrics.alpha_mae_skill, 2)} tone={Number(selectedMetrics.alpha_mae_skill || 0) >= 0 ? 'positive' : 'negative'} /><Metric label={tr('Drawdown MAE Skill')} value={percent(selectedMetrics.drawdown_mae_skill, 2)} tone={Number(selectedMetrics.drawdown_mae_skill || 0) >= 0 ? 'positive' : 'negative'} /><Metric label={tr('High Confidence Lift')} value={percent(selectedMetrics.high_confidence_lift, 2)} tone={Number(selectedMetrics.high_confidence_lift || 0) >= 0 ? 'positive' : 'negative'} /></section> : null}

        {decisionExperiment && selectedMetrics?.signal_metrics?.length ? <section className="temporal-section"><div className="temporal-section-heading"><h3>{tr('Decision Signal Quality')}</h3><span>{selectedHorizon}d</span></div><SignalMetricsTable items={selectedMetrics.signal_metrics} /></section> : null}
        {!decisionExperiment && selectedMetrics?.confidence_bins?.length ? <section className="temporal-section"><div className="temporal-section-heading"><h3>{tr('Probability Calibration')}</h3><span>{selectedHorizon}d</span></div><ConfidenceTable items={selectedMetrics.confidence_bins} /></section> : null}
        {selectedMetrics?.risk_buckets?.length ? <section className="temporal-section"><div className="temporal-section-heading"><h3>{tr('Drawdown Risk Separation')}</h3><span>{selectedHorizon}d</span></div><RiskTable items={selectedMetrics.risk_buckets} /></section> : null}

        <section className="temporal-section"><div className="temporal-section-heading"><h3>{tr(decisionExperiment ? 'Latest Shadow Decision Signals' : 'Latest Shadow Forecast')}</h3><div className="temporal-horizon-buttons">{horizonMetrics.map((item) => <button type="button" key={item.horizon} className={Number(selectedHorizon) === Number(item.horizon) ? 'active' : ''} onClick={() => setSelectedHorizon(Number(item.horizon))}>{item.horizon}d</button>)}</div></div>{decisionExperiment ? <DecisionForecastTable items={forecasts} capitalPolicyV2={capitalPolicyV2} capitalPolicyV3={capitalPolicyV3} /> : <LegacyForecastTable items={forecasts} />}</section>
      </> : null}

      {history.length > 1 ? <section className="temporal-section"><div className="temporal-section-heading"><h3>{tr('Recent Executions')}</h3></div><div className="temporal-table-shell compact"><table className="temporal-table"><thead><tr><th>{tr('Run')}</th><th>{tr('Status')}</th><th>{tr('Strategy')}</th><th>{tr('Created')}</th></tr></thead><tbody>{history.map((item) => <tr key={item.id}><td>{item.id}</td><td>{statusLabel(item.status)}</td><td>{item.strategy_profile_name || '—'}</td><td>{shortDateTime(item.created_at)}</td></tr>)}</tbody></table></div></section> : null}
    </div>
  )
}
