import { getIntlLocale, tr } from '../../../i18n/runtime'
import { Bar, BarChart, CartesianGrid, ComposedChart, Legend, Line, LineChart, ReferenceArea, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'

import { money, percent, shortDateTime } from '../../../shared/formatters'
import { PROBABILITY_METHOD } from '../dashboardConfig'
import { dashboardAxisLabel, decimal, strategyValue } from '../dashboardUtils'
import { DecisionTimelineTooltip, StrategyConfigurationGrid, StrategyForecastTooltip, TuningTooltip } from './DashboardPrimitives'

export function StrategyIntelligenceSection({
  visible,
  researchStrategy,
  intelligenceError,
  intelligenceLoading,
  intelligence,
  forecast,
  forecastView,
  onForecastViewChange,
  forecastRows,
  forecastHasCashEdge,
  forecastHasOpportunity,
  forecastOpportunitySignal,
  forecastUsesOpportunityConfidence,
  decisionRows,
  decisionHasOpportunity,
  decisionUsesOpportunityConfidence,
  cashIntervals,
  decisionSpan,
  cashExitThreshold,
  cashEntryThreshold,
  opportunityThreshold,
  tuning,
  tuningRows,
  tuningControlCapital,
  tuningCandidateLoading,
  tuningCandidateDetail,
  tuningPreviewRows,
  tuningPreviewSpan,
  onSelectTuningCandidate,
}) {
  if (!visible) return null
  return (
<section className="dashboard-intelligence-section">
          <div className="dashboard-intelligence-heading">
            <div>
              <span className="panel-kicker">{tr('ADMIN / TRADER')}</span>
              <h2>{tr('Strategy Intelligence')}</h2>
              <p>{tr('Interactive model outlook, decision diagnostics and tuning research from protected server-side data.')}</p>
            </div>
            {researchStrategy ? <div className="dashboard-intelligence-strategy">
              <span>{tr('Selected Strategy')}</span>
              <strong>{researchStrategy.name}</strong>
              <small>{researchStrategy.status} · rev {researchStrategy.revision} · {researchStrategy.configuration?.strategy_mode || '—'}</small>
            </div> : null}
          </div>

          {intelligenceError ? <div className="global-inline-message error-inline dashboard-story-message">{tr(intelligenceError)}</div> : null}
          {intelligenceLoading ? <div className="dashboard-story-loading intelligence-loading"><span className="loading-ring" />{tr('Loading Strategy Intelligence…')}</div> : null}

          {!intelligenceLoading && intelligence ? <>
            <div className="dashboard-intelligence-grid">
              <article className="dashboard-intelligence-card dashboard-forecast-card">
                <div className="dashboard-intelligence-card-heading">
                  <div><span className="panel-kicker">{tr('Next Open')}</span><h3>{tr('Strategy Forecast')}</h3></div>
                  {forecast?.asset_forecast?.length > 10 ? <div className="dashboard-intelligence-toggle" role="group" aria-label={tr('Forecast assets')}>
                    <button type="button" className={forecastView === 'top10' ? 'active' : ''} onClick={() => onForecastViewChange('top10')}>{tr('Top 10')}</button>
                    <button type="button" className={forecastView === 'all' ? 'active' : ''} onClick={() => onForecastViewChange('all')}>{tr('All')}</button>
                  </div> : null}
                </div>
                {forecast ? <>
                  <div className="dashboard-forecast-summary">
                    <div><span>{tr('Strategy')}</span><strong>{forecast.strategy_name || '—'}</strong></div>
                    <div><span>{tr('Current')}</span><strong>{forecast.current_asset || 'CASH'}</strong></div>
                    <div><span>{tr('Target')}</span><strong>{forecast.target_asset || 'CASH'}</strong></div>
                    <div><span>{tr('Action')}</span><strong>{String(forecast.action || '—').replaceAll('_', ' ')}</strong></div>
                    <div><span>{tr('Execution')}</span><strong>{forecast.execution_session || '—'}</strong></div>
                    {forecastHasOpportunity ? <div><span>{tr(forecastUsesOpportunityConfidence ? 'Opportunity Confidence' : 'Opportunity Probability')}</span><strong>{percent(forecastOpportunitySignal)}</strong></div> : null}
                  </div>
                  <div className="dashboard-forecast-chart" style={{ height: forecastView === 'all' ? `${Math.max(310, forecastRows.length * 25)}px` : '310px' }}>
                    {forecastRows.length ? <ResponsiveContainer width="100%" height="100%"><BarChart data={forecastRows} layout="vertical" margin={{ top: 8, right: 18, left: 4, bottom: 6 }} barGap={2}>
                      <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                      <XAxis type="number" tickFormatter={(value) => Number(value).toFixed(2)} />
                      <YAxis type="category" dataKey="asset" width={54} tick={{ fontSize: 11 }} />
                      <Tooltip content={<StrategyForecastTooltip />} />
                      <Legend />
                      <ReferenceLine x={0} strokeDasharray="4 4" />
                      <Bar dataKey="ranking_utility" name={tr('Ranking Utility')} radius={[0, 4, 4, 0]} />
                      {forecastHasCashEdge ? <Bar dataKey="cash_edge" name={tr('Cash Edge')} radius={[0, 4, 4, 0]} /> : null}
                    </BarChart></ResponsiveContainer> : <div className="dashboard-story-empty">{tr('No protected forecast has been prepared yet.')}</div>}
                  </div>
                  <div className="dashboard-forecast-thresholds">
                    <span>{tr('Cash exit')} <b>{decimal(forecast.cash_exit_threshold)}</b></span>
                    <span>{tr('Cash entry')} <b>{decimal(forecast.cash_entry_threshold)}</b></span>
                    <span>{tr('Switch margin')} <b>{decimal(forecast.effective_switch_margin)}</b></span>
                    {forecastHasOpportunity ? <span>{tr(forecastUsesOpportunityConfidence ? 'Opportunity confidence threshold' : 'Opportunity threshold')} <b>{percent(forecast.opportunity_threshold)}</b></span> : null}
                  </div>
                  {researchStrategy?.configuration?.strategy_mode === 'COMPOUND_ROTATION_SWING_RISK_OFF' && !forecastHasCashEdge ? <small className="dashboard-intelligence-note">{tr('This plan predates protected Cash Edge persistence. The next prepared Risk-Off plan will populate the Cash Edge series automatically.')}</small> : null}
                </> : <div className="dashboard-story-empty">{tr('No next-open Paper forecast is stored yet. The Dashboard does not contact Alpaca or refresh market data.')}</div>}
              </article>

              <article className="dashboard-intelligence-card dashboard-decision-card">
                <div className="dashboard-intelligence-card-heading">
                  <div><span className="panel-kicker">{tr('Selected Backtest')}</span><h3>{tr('Decision Timeline')}</h3></div>
                  <span className="dashboard-intelligence-count">{decisionRows.length} {tr('points')}</span>
                </div>
                <div className="dashboard-decision-chart">
                  {decisionRows.length ? <ResponsiveContainer width="100%" height="100%"><ComposedChart data={decisionRows} margin={{ top: 12, right: 16, left: 4, bottom: 6 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} />
                    <XAxis dataKey="timestamp_value" type="number" scale="time" domain={['dataMin', 'dataMax']} minTickGap={38} tickFormatter={(value) => dashboardAxisLabel(value, decisionSpan)} />
                    <YAxis yAxisId="utility" tickFormatter={(value) => Number(value).toFixed(2)} />
                    {decisionHasOpportunity ? <YAxis yAxisId="probability" orientation="right" domain={[0, 1]} tickFormatter={(value) => `${Math.round(Number(value) * 100)}%`} /> : null}
                    <Tooltip content={<DecisionTimelineTooltip />} />
                    <Legend />
                    {cashIntervals.map((interval, index) => <ReferenceArea key={`${interval.start}-${index}`} yAxisId="utility" x1={interval.start} x2={interval.end} className="dashboard-cash-area" ifOverflow="extendDomain" />)}
                    {Number.isFinite(Number(cashExitThreshold)) ? <ReferenceLine yAxisId="utility" y={Number(cashExitThreshold)} strokeDasharray="3 4" label={{ value: tr('Cash exit'), position: 'insideTopRight', fontSize: 10 }} /> : null}
                    {Number.isFinite(Number(cashEntryThreshold)) && Number(cashEntryThreshold) !== Number(cashExitThreshold) ? <ReferenceLine yAxisId="utility" y={Number(cashEntryThreshold)} strokeDasharray="6 4" label={{ value: tr('Cash entry'), position: 'insideBottomRight', fontSize: 10 }} /> : null}
                    {decisionHasOpportunity && Number.isFinite(Number(opportunityThreshold)) ? <ReferenceLine yAxisId="probability" y={Number(opportunityThreshold)} strokeDasharray="4 4" label={{ value: tr(decisionUsesOpportunityConfidence ? 'Opportunity confidence threshold' : 'Opportunity threshold'), position: 'insideTopLeft', fontSize: 10 }} /> : null}
                    <Line yAxisId="utility" type="monotone" dataKey="best_score" name={tr('Best Utility')} dot={false} activeDot={{ r: 4 }} strokeWidth={2.1} isAnimationActive={false} />
                    <Line yAxisId="utility" type="monotone" dataKey="best_cash_edge" name={tr('Best Cash Edge')} dot={false} activeDot={{ r: 4 }} strokeWidth={2.1} isAnimationActive={false} connectNulls />
                    <Line yAxisId="utility" type="monotone" dataKey="current_cash_edge" name={tr('Current Cash Edge')} dot={false} activeDot={{ r: 4 }} strokeWidth={1.6} strokeDasharray="5 4" isAnimationActive={false} connectNulls />
                    {decisionHasOpportunity ? <Line yAxisId="probability" type="monotone" dataKey="opportunity_signal" name={tr(decisionUsesOpportunityConfidence ? 'Opportunity Confidence' : 'Opportunity Probability')} dot={false} activeDot={{ r: 4 }} strokeWidth={1.8} strokeDasharray="6 3" isAnimationActive={false} connectNulls /> : null}
                  </ComposedChart></ResponsiveContainer> : <div className="dashboard-story-empty">{tr('The selected backtest has no protected decision diagnostics.')}</div>}
                </div>
                <div className="dashboard-decision-legend-note"><span className="cash-swatch" />{tr('Shaded periods indicate decisions whose resulting state is CASH.')}</div>
              </article>
            </div>

            {researchStrategy ? <StrategyConfigurationGrid configuration={researchStrategy.configuration} modelConfiguration={researchStrategy.research_model_configuration} /> : null}

            <article className="dashboard-intelligence-card dashboard-tuning-card">
              <div className="dashboard-intelligence-card-heading">
                <div><span className="panel-kicker">{tr('Research')}</span><h3>{tr('Model Tuning Candidates')}</h3><p>{tr('Click a completed Candidate bar to inspect its retained portfolio curve.')}</p></div>
                {tuning ? <div className="dashboard-tuning-status"><strong>{String(tuning.method || '').replaceAll('_', ' ')}</strong><span>{tr(tuning.status)} · {Number(tuning.progress || 0).toFixed(0)}%</span>{tuning.method === PROBABILITY_METHOD && tuning.probability_state ? <small>{tr('Champion')} #{tuning.probability_state.last_champion_candidate_id ?? tuning.probability_anchor?.candidate_id ?? 0} · {tr('Trust region')} {(Number(tuning.probability_state.trust_region_radius || 0) * 100).toFixed(1)}% · {tr('Adaptive trials')} {tuning.probability_state.adaptive_trials_completed || 0}</small> : null}</div> : null}
              </div>
              {tuning && tuningRows.length ? <div className="dashboard-tuning-layout">
                <div className="dashboard-tuning-performance-chart">
                  <ResponsiveContainer width="100%" height="100%"><BarChart data={tuningRows} margin={{ top: 12, right: 12, left: 6, bottom: 6 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} />
                    <XAxis dataKey="label" interval={0} tick={{ fontSize: 10 }} />
                    <YAxis tickFormatter={(value) => `$${Number(value).toLocaleString(getIntlLocale(), { notation: 'compact', maximumFractionDigits: 1 })}`} />
                    <Tooltip content={<TuningTooltip />} />
                    {Number.isFinite(Number(tuningControlCapital)) ? <ReferenceLine y={Number(tuningControlCapital)} strokeDasharray="5 4" label={{ value: tr('Control'), position: 'insideTopRight', fontSize: 10 }} /> : null}
                    <Bar dataKey="ending_capital" name={tr('Ending Capital')} radius={[4, 4, 0, 0]} onClick={onSelectTuningCandidate} className="dashboard-tuning-candidate-bar" />
                  </BarChart></ResponsiveContainer>
                </div>

                <div className="dashboard-tuning-candidate-panel">
                  {tuningCandidateLoading ? <div className="dashboard-story-loading compact"><span className="loading-ring" />{tr('Loading Candidate…')}</div> : tuningCandidateDetail ? <>
                    <div className="dashboard-tuning-candidate-title"><div><span>{tuningCandidateDetail.is_control ? tr('Control') : `${tr('Candidate')} #${tuningCandidateDetail.candidate_id}`}</span><strong>{money(tuningCandidateDetail.metrics?.ending_capital)}</strong></div><small>{tr(tuningCandidateDetail.status)} · Sharpe {decimal(tuningCandidateDetail.metrics?.sharpe, 3)} · DD {percent(tuningCandidateDetail.metrics?.maximum_drawdown)}</small></div>
                    <div className="dashboard-tuning-preview-chart">
                      {tuningPreviewRows.length ? <ResponsiveContainer width="100%" height="100%"><LineChart data={tuningPreviewRows} margin={{ top: 8, right: 10, left: 4, bottom: 4 }}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} />
                        <XAxis dataKey="timestamp_value" type="number" scale="time" domain={['dataMin', 'dataMax']} minTickGap={28} tickFormatter={(value) => dashboardAxisLabel(value, tuningPreviewSpan)} />
                        <YAxis tickFormatter={(value) => `$${Number(value).toLocaleString(getIntlLocale(), { notation: 'compact', maximumFractionDigits: 1 })}`} />
                        <Tooltip formatter={(value) => money(value)} labelFormatter={(value) => shortDateTime(new Date(Number(value)).toISOString())} />
                        <Legend />
                        <Line type="monotone" dataKey="simulation_equity" name={tr('Candidate')} dot={false} strokeWidth={2.2} isAnimationActive={false} />
                        <Line type="monotone" dataKey="reference_equity" name={tr('Buy & Hold')} dot={false} strokeWidth={1.8} isAnimationActive={false} />
                      </LineChart></ResponsiveContainer> : <div className="dashboard-story-empty compact">{tr('No compact curve was retained for this older Candidate. New Candidates retain a visual preview before raw tuning artifacts are deleted.')}</div>}
                    </div>
                    {tuningCandidateDetail.settings && Object.keys(tuningCandidateDetail.settings).length ? <details className="dashboard-candidate-settings"><summary>{tr('Candidate hyperparameters')}</summary><dl>{Object.entries(tuningCandidateDetail.settings).sort(([a], [b]) => a.localeCompare(b)).map(([key, value]) => <div key={key}><dt>{key}</dt><dd>{strategyValue(value)}</dd></div>)}</dl></details> : null}
                  </> : <div className="dashboard-story-empty compact">{tr('Select a completed Candidate in the chart.')}</div>}
                </div>
              </div> : <div className="dashboard-story-empty compact">{tr('No completed tuning Candidate is available for the selected Strategy.')}</div>}
            </article>
          </> : null}
        </section>
  )
}
