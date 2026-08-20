import { useEffect, useMemo, useState } from 'react'

import { apiFetch } from '../../api/http'
import { API } from '../../config/env'
import { tr } from '../../i18n/runtime'
import { money, number, percent } from '../../shared/formatters'

const PARAMETERS = [
  { name: 'timing_base_weak_threshold', label: 'Base weak threshold' },
  { name: 'timing_challenger_minimum', label: 'Challenger minimum' },
  { name: 'timing_minimum_advantage', label: 'Minimum advantage' },
  { name: 'rotation_confirmation_minimum', label: 'Rotation confirmations' },
]

function negativeRate(group) {
  return group?.negative_rate == null ? '—' : percent(group.negative_rate, 2)
}

function metricDelta(candidate, baseline, key) {
  const next = Number(candidate?.[key])
  const previous = Number(baseline?.[key])
  return Number.isFinite(next) && Number.isFinite(previous) ? next - previous : null
}

function comparisonFromBacktest(payload) {
  const baseline = payload?.baseline || {}
  const candidate = payload?.candidate || {}
  const bounded = payload?.bounded_defer || null
  return {
    created_at: new Date().toISOString(),
    bounded_defer: bounded ? {
      selection: bounded.selection || null,
      tested_max_defer_sessions: bounded.tested_max_defer_sessions || [],
    } : null,
    full_oos: {
      ending_capital_delta: metricDelta(candidate.metrics, baseline.metrics, 'ending_capital'),
      cagr_delta: metricDelta(candidate.metrics, baseline.metrics, 'cagr'),
      sharpe_delta: metricDelta(candidate.metrics, baseline.metrics, 'sharpe'),
      maximum_drawdown_delta: metricDelta(candidate.metrics, baseline.metrics, 'maximum_drawdown'),
      capital_rotations_delta: metricDelta(candidate.metrics, baseline.metrics, 'capital_rotations'),
      timing_override_count_delta: metricDelta(candidate.metrics, baseline.metrics, 'timing_override_count'),
    },
    selected_period: {
      return_delta: metricDelta(candidate.period, baseline.period, 'return'),
      maximum_drawdown_delta: metricDelta(candidate.period, baseline.period, 'maximum_drawdown'),
      rotations_delta: metricDelta(candidate.period, baseline.period, 'rotations'),
    },
  }
}

function ComparisonValue({ label, baseline, candidate, format = number, digits = 3 }) {
  const delta = candidate == null || baseline == null ? null : Number(candidate) - Number(baseline)
  return <div className="temporal-cycle-comparison-metric">
    <span>{tr(label)}</span>
    <strong>{candidate == null ? '—' : format(candidate, digits)}</strong>
    <small>{tr('Baseline')} {baseline == null ? '—' : format(baseline, digits)}{delta == null ? '' : ` · Δ ${delta >= 0 ? '+' : ''}${format(delta, digits)}`}</small>
  </div>
}

function foldDelta(trial, foldId) {
  const row = (trial?.fold_comparison || []).find((item) => Number(item.fold_id) === Number(foldId))
  return row?.return_delta == null ? '—' : percent(row.return_delta, 2)
}

export function TemporalStudyResearchCycle({ study, runId, processingId = null, canRun = false, onChange }) {
  const [quick, setQuick] = useState(null)
  const [hypotheses, setHypotheses] = useState(null)
  const [hypothesisId, setHypothesisId] = useState('')
  const [controlledBacktest, setControlledBacktest] = useState(null)
  const [comparison, setComparison] = useState(null)
  const [busyStep, setBusyStep] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    setQuick(null)
    setHypotheses(null)
    setHypothesisId('')
    setControlledBacktest(null)
    setComparison(null)
    setBusyStep('')
    setError('')
  }, [runId, study?.executed_at, study?.start_month, study?.end_month])

  const selectedHypothesis = useMemo(
    () => (hypotheses || []).find((item) => item.id === hypothesisId) || (hypotheses || [])[0] || null,
    [hypotheses, hypothesisId],
  )
  const actionableHypotheses = useMemo(
    () => (hypotheses || []).filter((item) => item?.parameter && item?.proposed_value != null),
    [hypotheses],
  )
  const candidateSettings = useMemo(() => {
    if (!quick?.base_settings || !selectedHypothesis?.parameter || selectedHypothesis?.proposed_value == null) return null
    return {
      ...quick.base_settings,
      [selectedHypothesis.parameter]: Number(selectedHypothesis.proposed_value),
    }
  }, [quick?.base_settings, selectedHypothesis])

  useEffect(() => {
    onChange?.({
      quick_analysis: quick,
      hypotheses,
      selected_hypothesis_id: hypothesisId || null,
      controlled_change: candidateSettings ? {
        base_settings: quick?.base_settings || null,
        candidate_settings: candidateSettings,
        changed_parameters: [selectedHypothesis?.parameter].filter(Boolean),
      } : null,
      controlled_backtest: controlledBacktest,
      comparison,
    })
  }, [candidateSettings, comparison, controlledBacktest, hypotheses, hypothesisId, onChange, quick, selectedHypothesis?.parameter])

  async function analyzeDecisions() {
    if (!study || !runId || busyStep) return
    setBusyStep('analysis')
    setError('')
    try {
      const analysisPayload = await apiFetch(`${API}/temporal-intelligence/${encodeURIComponent(runId)}/study/quick-analysis?start_month=${encodeURIComponent(study.start_month)}&end_month=${encodeURIComponent(study.end_month)}${processingId ? `&processing_id=${encodeURIComponent(processingId)}` : ''}`, { method: 'POST' })
      const hypothesisPayload = await apiFetch(`${API}/temporal-intelligence/${encodeURIComponent(runId)}/study/hypothesis?start_month=${encodeURIComponent(study.start_month)}&end_month=${encodeURIComponent(study.end_month)}${processingId ? `&processing_id=${encodeURIComponent(processingId)}` : ''}`, { method: 'POST' })
      const items = Array.isArray(hypothesisPayload?.hypotheses) ? hypothesisPayload.hypotheses : []
      const firstActionable = items.find((item) => item?.parameter && item?.proposed_value != null)
      setQuick(analysisPayload)
      setHypotheses(items)
      setHypothesisId(firstActionable?.id || items[0]?.id || '')
      setControlledBacktest(null)
      setComparison(null)
    } catch (requestError) {
      setError(tr(requestError?.message || 'Unable to analyze decisions.'))
    } finally {
      setBusyStep('')
    }
  }

  async function testHypothesis() {
    if (!canRun || !study || !runId || !candidateSettings || !selectedHypothesis?.parameter || busyStep) return
    setBusyStep('test')
    setError('')
    try {
      const payload = await apiFetch(`${API}/temporal-intelligence/${encodeURIComponent(runId)}/study/controlled-backtest`, {
        method: 'POST',
        body: {
          start_month: study.start_month,
          end_month: study.end_month,
          ...candidateSettings,
        },
      })
      setControlledBacktest(payload)
      setComparison(comparisonFromBacktest(payload))
    } catch (requestError) {
      setError(tr(requestError?.message || 'Unable to test the hypothesis.'))
    } finally {
      setBusyStep('')
    }
  }

  if (!study) return null

  const analysis = quick?.analysis || {}
  const backtestBaseline = controlledBacktest?.baseline || {}
  const backtestCandidate = controlledBacktest?.candidate || {}
  const bounded = controlledBacktest?.bounded_defer || null
  const boundedTrials = Array.isArray(bounded?.trials) ? bounded.trials : []
  const foldIds = [...new Set(boundedTrials.flatMap((item) => (item.fold_comparison || []).map((row) => Number(row.fold_id))))].filter(Number.isFinite).sort((a, b) => a - b)
  const supportedLimits = bounded?.selection?.supported_limits || []
  const blockDiagnostics = backtestCandidate?.rotation_confirmation_diagnostics || {}
  const waitProfile = Array.isArray(blockDiagnostics?.wait_step_profile) ? blockDiagnostics.wait_step_profile.slice(0, 10) : []
  const durationProfile = Array.isArray(blockDiagnostics?.duration_profile) ? blockDiagnostics.duration_profile : []
  const hypothesisReady = Boolean(selectedHypothesis?.parameter && selectedHypothesis?.proposed_value != null)
  const boundedHypothesis = selectedHypothesis?.id === 'bounded_multi_horizon_rotation_confirmation'

  return <section className="temporal-study-cycle">
    <div className="temporal-study-cycle-heading">
      <div><span className="panel-kicker">{tr('RESEARCH CYCLE')}</span><h4>{tr('Analyze decisions → test hypothesis → comparative result')}</h4></div>
      <span>{tr('The chart remains independent and each research action runs only when requested.')}</span>
    </div>

    <div className="temporal-study-cycle-steps three-steps">
      <button type="button" className={quick && hypotheses ? 'done' : ''} onClick={analyzeDecisions} disabled={Boolean(busyStep) || !runId}>{tr(busyStep === 'analysis' ? 'Analyzing…' : '1. Analyze decisions')}</button>
      <button type="button" className={controlledBacktest ? 'done' : ''} onClick={testHypothesis} disabled={Boolean(busyStep) || !canRun || !hypothesisReady}>{tr(busyStep === 'test' ? 'Testing hypothesis…' : '2. Test hypothesis')}</button>
      <div className={`temporal-cycle-step-result ${comparison ? 'done' : ''}`}><span>{tr('3. Comparative result')}</span><small>{comparison ? tr('Completed') : tr('Waiting for a tested hypothesis')}</small></div>
    </div>

    {error ? <div className="global-inline-message error-inline">{error}</div> : null}

    {quick ? <div className="temporal-cycle-card">
      <div className="temporal-cycle-card-title"><strong>{tr('Decision analysis')}</strong><span>{number(analysis.decision_count, 0)} {tr('decisions')}</span></div>
      <div className="temporal-cycle-metrics">
        <div><span>{tr('Timing overrides')}</span><strong>{number(analysis.timing_override?.count, 0)}</strong><small>{negativeRate(analysis.timing_override)} {tr('negative intervals')}</small></div>
        <div><span>{tr('Winner-anchor decisions')}</span><strong>{number(analysis.winner_anchor?.count, 0)}</strong><small>{negativeRate(analysis.winner_anchor)} {tr('negative intervals')}</small></div>
        <div><span>{tr('HOLD')}</span><strong>{number(analysis.actions?.HOLD?.count, 0)}</strong><small>{negativeRate(analysis.actions?.HOLD)} {tr('negative intervals')}</small></div>
        <div><span>{tr('ROTATE')}</span><strong>{number(analysis.actions?.ROTATE?.count, 0)}</strong><small>{negativeRate(analysis.actions?.ROTATE)} {tr('negative intervals')}</small></div>
        <div><span>{tr('Override loss-rate delta')}</span><strong>{analysis.override_negative_rate_delta == null ? '—' : percent(analysis.override_negative_rate_delta, 2)}</strong><small>{tr('vs Winner anchor')}</small></div>
        <div><span>{tr('Asset-to-asset rotations analyzed')}</span><strong>{number(analysis.rotation_confirmation?.rotation_count, 0)}</strong><small>{analysis.rotation_confirmation?.positive_value_added_rate == null ? '—' : `${percent(analysis.rotation_confirmation.positive_value_added_rate, 2)} ${tr('positive value added')}`}</small></div>
        <div><span>{tr('2+ confirmations')}</span><strong>{analysis.rotation_confirmation?.candidate_gates?.['2']?.allowed_positive_value_added_rate == null ? '—' : percent(analysis.rotation_confirmation.candidate_gates['2'].allowed_positive_value_added_rate, 2)}</strong><small>{number(analysis.rotation_confirmation?.candidate_gates?.['2']?.bad_rotations_avoided, 0)} {tr('harmful rotations blocked')} · {number(analysis.rotation_confirmation?.candidate_gates?.['2']?.good_rotations_lost, 0)} {tr('beneficial rotations blocked')}</small></div>
        <div><span>{tr('3 confirmations')}</span><strong>{analysis.rotation_confirmation?.candidate_gates?.['3']?.allowed_positive_value_added_rate == null ? '—' : percent(analysis.rotation_confirmation.candidate_gates['3'].allowed_positive_value_added_rate, 2)}</strong><small>{number(analysis.rotation_confirmation?.candidate_gates?.['3']?.bad_rotations_avoided, 0)} {tr('harmful rotations blocked')} · {number(analysis.rotation_confirmation?.candidate_gates?.['3']?.good_rotations_lost, 0)} {tr('beneficial rotations blocked')}</small></div>
      </div>
    </div> : null}

    {hypotheses ? <div className="temporal-cycle-card">
      <div className="temporal-cycle-card-title"><strong>{tr('Hypothesis')}</strong><span>{tr('Generated from the selected study period')}</span></div>
      {actionableHypotheses.length > 1 ? <label className="temporal-cycle-hypothesis-select"><span>{tr('Hypothesis to test')}</span><select value={selectedHypothesis?.id || ''} onChange={(event) => { setHypothesisId(event.target.value); setControlledBacktest(null); setComparison(null) }}>{actionableHypotheses.map((item) => <option key={item.id} value={item.id}>{tr(item.title)}</option>)}</select></label> : null}
      {selectedHypothesis ? <div className="temporal-cycle-hypothesis"><strong>{tr(selectedHypothesis.title)}</strong><p>{tr(selectedHypothesis.evidence_key || selectedHypothesis.evidence, selectedHypothesis.evidence_values || {})}</p><small>{tr(selectedHypothesis.purpose_key || selectedHypothesis.purpose)}</small>{hypothesisReady ? <div className="temporal-cycle-proposed-change"><span>{tr('Controlled test')}</span><strong>{boundedHypothesis ? tr('2-of-3 confirmation with bounded waits: 0, 1, 2, 3 and 5 sessions') : `${tr(PARAMETERS.find((item) => item.name === selectedHypothesis.parameter)?.label || selectedHypothesis.parameter)}: ${number(quick?.base_settings?.[selectedHypothesis.parameter] ?? 0, 3)} → ${number(selectedHypothesis.proposed_value, 3)}`}</strong></div> : null}</div> : null}
      {!hypothesisReady ? <div className="temporal-cycle-no-test">{tr('The analysis did not find enough evidence for a controlled policy change. No rule or parameter will be changed.')}</div> : null}
    </div> : null}

    {bounded ? <div className="temporal-cycle-card">
      <div className="temporal-cycle-card-title"><strong>{tr('Bounded defer experiment')}</strong><span>{tr('Same frozen OOS observations; only the maximum defer window changes.')}</span></div>
      <div className="temporal-cycle-table-wrap"><table className="temporal-cycle-table"><thead><tr><th>{tr('Max wait')}</th><th>{tr('Ending capital')}</th><th>{tr('CAGR')}</th><th>{tr('Sharpe')}</th><th>{tr('Max Drawdown')}</th><th>{tr('Rotations')}</th><th>{tr('Folds improved')}</th><th>{tr('Consistency')}</th></tr></thead><tbody>{boundedTrials.map((trial) => {
        const criteria = trial.robustness?.criteria || {}
        return <tr key={trial.max_defer_sessions}><td>{trial.max_defer_sessions === 0 ? tr('0 · baseline') : `${number(trial.max_defer_sessions, 0)} ${tr('sessions')}`}</td><td>{money(trial.metrics?.ending_capital)}</td><td>{percent(trial.metrics?.cagr, 2)}</td><td>{number(trial.metrics?.sharpe, 3)}</td><td>{percent(trial.metrics?.maximum_drawdown, 2)}</td><td>{number(trial.metrics?.capital_rotations, 0)}</td><td>{trial.max_defer_sessions === 0 ? '—' : `${number(criteria.folds_improved, 0)}/${number((trial.fold_comparison || []).length, 0)}`}</td><td>{trial.max_defer_sessions === 0 ? tr('Reference') : tr(trial.robustness?.supported ? 'Supported' : 'Not supported')}</td></tr>
      })}</tbody></table></div>

      {foldIds.length ? <div className="temporal-cycle-diagnostic-section"><strong>{tr('Return delta versus baseline by fold')}</strong><div className="temporal-cycle-table-wrap"><table className="temporal-cycle-table"><thead><tr><th>{tr('Max wait')}</th>{foldIds.map((foldId) => <th key={foldId}>Fold {foldId}</th>)}</tr></thead><tbody>{boundedTrials.filter((trial) => trial.max_defer_sessions > 0).map((trial) => <tr key={trial.max_defer_sessions}><td>{number(trial.max_defer_sessions, 0)}</td>{foldIds.map((foldId) => <td key={foldId}>{foldDelta(trial, foldId)}</td>)}</tr>)}</tbody></table></div></div> : null}

      <div className="temporal-cycle-diagnostic-section"><strong>{tr('Defer Value by wait limit')}</strong><div className="temporal-cycle-table-wrap"><table className="temporal-cycle-table"><thead><tr><th>{tr('Max wait')}</th><th>{tr('Blocked attempts')}</th><th>{tr('Episodes')}</th><th>{tr('Average Defer Value')}</th><th>{tr('Positive Defer Value')}</th><th>{tr('Released by limit')}</th></tr></thead><tbody>{boundedTrials.filter((trial) => trial.max_defer_sessions > 0).map((trial) => {
        const diagnostics = trial.rotation_confirmation_diagnostics || {}
        return <tr key={trial.max_defer_sessions}><td>{number(trial.max_defer_sessions, 0)}</td><td>{number(diagnostics.block_attempt_count, 0)}</td><td>{number(diagnostics.episode_count, 0)}</td><td>{diagnostics.defer_value?.average == null ? '—' : percent(diagnostics.defer_value.average, 2)}</td><td>{diagnostics.defer_value?.positive_rate == null ? '—' : percent(diagnostics.defer_value.positive_rate, 2)}</td><td>{number(trial.metrics?.rotation_confirmation_defer_limit_reached_count, 0)}</td></tr>
      })}</tbody></table></div></div>
      <small className="temporal-cycle-diagnostic-note">{tr('Defer Value is the compounded return of keeping the incumbent during the wait minus the compounded return of the alternatives proposed during those same blocked intervals.')}</small>
    </div> : controlledBacktest ? <div className="temporal-cycle-card">
      <div className="temporal-cycle-card-title"><strong>{tr('Hypothesis test completed')}</strong><span>{tr('Full frozen Temporal OOS replay; models were not retrained.')}</span></div>
      <div className="temporal-cycle-backtest-summary">
        <div><span>{tr('Baseline ending capital')}</span><strong>{money(backtestBaseline.metrics?.ending_capital)}</strong></div>
        <div><span>{tr('Candidate ending capital')}</span><strong>{money(backtestCandidate.metrics?.ending_capital)}</strong></div>
        <div><span>{tr('Selected-period baseline')}</span><strong>{percent(backtestBaseline.period?.return, 2)}</strong></div>
        <div><span>{tr('Selected-period candidate')}</span><strong>{percent(backtestCandidate.period?.return, 2)}</strong></div>
      </div>
    </div> : null}

    {!bounded && controlledBacktest && Number(blockDiagnostics?.block_attempt_count || 0) > 0 ? <div className="temporal-cycle-card">
      <div className="temporal-cycle-card-title"><strong>{tr('Blocked rotation path')}</strong><span>{tr('Diagnostic only: the tested policy is unchanged.')}</span></div>
      <div className="temporal-cycle-metrics">
        <div><span>{tr('Blocked attempts')}</span><strong>{number(blockDiagnostics.block_attempt_count, 0)}</strong><small>{tr('individual rejected rotation attempts')}</small></div>
        <div><span>{tr('Blocking episodes')}</span><strong>{number(blockDiagnostics.episode_count, 0)}</strong><small>{tr('consecutive waits with the same incumbent')}</small></div>
        <div><span>{tr('Average wait')}</span><strong>{number(blockDiagnostics.average_blocked_sessions, 2)}</strong><small>{tr('sessions')}</small></div>
        <div><span>{tr('Median wait')}</span><strong>{number(blockDiagnostics.median_blocked_sessions, 1)}</strong><small>{tr('sessions')}</small></div>
        <div><span>{tr('Maximum wait')}</span><strong>{number(blockDiagnostics.maximum_blocked_sessions, 0)}</strong><small>{tr('sessions')}</small></div>
        <div><span>{tr('Wait episodes with positive relative outcome')}</span><strong>{blockDiagnostics.positive_wait_episode_rate == null ? '—' : percent(blockDiagnostics.positive_wait_episode_rate, 2)}</strong><small>{tr('incumbent versus the daily proposed alternative')}</small></div>
      </div>
      {waitProfile.length ? <div className="temporal-cycle-diagnostic-section"><strong>{tr('Marginal effect by waiting session')}</strong><div className="temporal-cycle-table-wrap"><table className="temporal-cycle-table"><thead><tr><th>{tr('Wait session')}</th><th>{tr('Samples')}</th><th>{tr('Incumbent avg.')}</th><th>{tr('Proposed avg.')}</th><th>{tr('Relative delta')}</th><th>{tr('Positive rate')}</th></tr></thead><tbody>{waitProfile.map((item) => <tr key={item.wait_session}><td>{number(item.wait_session, 0)}</td><td>{number(item.episode_count, 0)}</td><td>{item.average_incumbent_return == null ? '—' : percent(item.average_incumbent_return, 2)}</td><td>{item.average_proposed_return == null ? '—' : percent(item.average_proposed_return, 2)}</td><td>{item.average_relative_return_delta == null ? '—' : percent(item.average_relative_return_delta, 2)}</td><td>{item.positive_relative_rate == null ? '—' : percent(item.positive_relative_rate, 2)}</td></tr>)}</tbody></table></div></div> : null}
      {durationProfile.length ? <div className="temporal-cycle-diagnostic-section"><strong>{tr('Outcome by total blocking duration')}</strong><div className="temporal-cycle-table-wrap"><table className="temporal-cycle-table"><thead><tr><th>{tr('Blocked sessions')}</th><th>{tr('Episodes')}</th><th>{tr('Average relative delta')}</th><th>{tr('Positive wait rate')}</th></tr></thead><tbody>{durationProfile.map((item) => <tr key={item.blocked_sessions}><td>{item.blocked_sessions}</td><td>{number(item.episode_count, 0)}</td><td>{item.average_relative_return_delta == null ? '—' : percent(item.average_relative_return_delta, 2)}</td><td>{item.positive_wait_rate == null ? '—' : percent(item.positive_wait_rate, 2)}</td></tr>)}</tbody></table></div></div> : null}
    </div> : null}

    {comparison ? bounded ? <div className="temporal-cycle-card temporal-cycle-comparison">
      <div className="temporal-cycle-card-title"><strong>{tr('Comparative result')}</strong><span>{tr('Consistency is evaluated across economic metrics and folds, not by ending capital alone.')}</span></div>
      {supportedLimits.length ? <div className="temporal-cycle-no-test">{tr('Supported bounded waits')}: <strong>{supportedLimits.join(', ')} {tr('sessions')}</strong></div> : <div className="temporal-cycle-no-test">{tr('No bounded wait satisfies the robust consistency criteria in this replay.')}</div>}
    </div> : <div className="temporal-cycle-card temporal-cycle-comparison">
      <div className="temporal-cycle-card-title"><strong>{tr('Comparative result')}</strong><span>{tr('Candidate versus the original policy on the same frozen observations')}</span></div>
      <div className="temporal-cycle-comparison-grid">
        <ComparisonValue label="Ending capital" baseline={backtestBaseline.metrics?.ending_capital} candidate={backtestCandidate.metrics?.ending_capital} format={money} />
        <ComparisonValue label="CAGR" baseline={backtestBaseline.metrics?.cagr} candidate={backtestCandidate.metrics?.cagr} format={percent} digits={2} />
        <ComparisonValue label="Sharpe" baseline={backtestBaseline.metrics?.sharpe} candidate={backtestCandidate.metrics?.sharpe} />
        <ComparisonValue label="Max Drawdown" baseline={backtestBaseline.metrics?.maximum_drawdown} candidate={backtestCandidate.metrics?.maximum_drawdown} format={percent} digits={2} />
        <ComparisonValue label="Capital rotations" baseline={backtestBaseline.metrics?.capital_rotations} candidate={backtestCandidate.metrics?.capital_rotations} format={number} digits={0} />
        <ComparisonValue label="Timing overrides" baseline={backtestBaseline.metrics?.timing_override_count} candidate={backtestCandidate.metrics?.timing_override_count} format={number} digits={0} />
        <ComparisonValue label="Selected-period return" baseline={backtestBaseline.period?.return} candidate={backtestCandidate.period?.return} format={percent} digits={2} />
        <ComparisonValue label="Selected-period Max Drawdown" baseline={backtestBaseline.period?.maximum_drawdown} candidate={backtestCandidate.period?.maximum_drawdown} format={percent} digits={2} />
      </div>
    </div> : null}
  </section>
}
