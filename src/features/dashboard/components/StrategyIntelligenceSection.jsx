import { getIntlLocale, tr } from '../../../i18n/runtime'
import { Bar, BarChart, CartesianGrid, Cell, ComposedChart, Legend, Line, LineChart, ReferenceArea, ReferenceLine, Tooltip, XAxis, YAxis } from 'recharts'

import { MeasuredChartContainer } from '../../../shared/components/MeasuredChartContainer'
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
  decisionHasCashEdge,
  decisionUsesAbsoluteUtility,
  decisionHasCurrentUtility,
  decisionUsesOpportunityConfidence,
  cashIntervals,
  decisionSpan,
  cashExitThreshold,
  cashEntryThreshold,
  absoluteUtilityExitThreshold,
  absoluteUtilityEntryThreshold,
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
                    {forecastRows.length ? <MeasuredChartContainer fallbackHeight={310}><BarChart data={forecastRows} layout="vertical" margin={{ top: 8, right: 18, left: 4, bottom: 6 }} barGap={2}>
                      <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                      <XAxis type="number" tickFormatter={(value) => Number(value).toFixed(2)} />
                      <YAxis type="category" dataKey="asset" width={54} tick={{ fontSize: 11 }} />
                      <Tooltip content={<StrategyForecastTooltip />} />
                      <Legend />
                      <ReferenceLine x={0} strokeDasharray="4 4" />
                      <Bar dataKey="ranking_utility" name={tr('Ranking Utility')} fill="var(--accent)" radius={[0, 4, 4, 0]} activeBar={false} />
                      {forecastHasCashEdge ? <Bar dataKey="cash_edge" name={tr('Cash Edge')} fill="var(--positive)" radius={[0, 4, 4, 0]} activeBar={false} /> : null}
                    </BarChart></MeasuredChartContainer> : <div className="dashboard-story-empty">{tr('No protected forecast has been prepared yet.')}</div>}
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
                  {decisionRows.length ? <MeasuredChartContainer fallbackHeight={355}><ComposedChart data={decisionRows} margin={{ top: 12, right: 16, left: 4, bottom: 6 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} />
                    <XAxis dataKey="timestamp_value" type="number" scale="time" domain={['dataMin', 'dataMax']} minTickGap={38} tickFormatter={(value) => dashboardAxisLabel(value, decisionSpan)} />
                    <YAxis yAxisId="utility" tickFormatter={(value) => Number(value).toFixed(2)} />
                    {decisionHasOpportunity ? <YAxis yAxisId="probability" orientation="right" domain={[0, 1]} tickFormatter={(value) => `${Math.round(Number(value) * 100)}%`} /> : null}
                    <Tooltip content={<DecisionTimelineTooltip />} />
                    <Legend />
                    {cashIntervals.map((interval, index) => <ReferenceArea key={`${interval.start}-${index}`} yAxisId="utility" x1={interval.start} x2={interval.end} className="dashboard-cash-area" ifOverflow="extendDomain" />)}
                    {decisionUsesAbsoluteUtility && Number.isFinite(Number(absoluteUtilityExitThreshold)) ? <ReferenceLine yAxisId="utility" y={Number(absoluteUtilityExitThreshold)} strokeDasharray="3 4" label={{ value: tr('Utility exit threshold'), position: 'insideTopRight', fontSize: 10 }} /> : null}
                    {decisionUsesAbsoluteUtility && Number.isFinite(Number(absoluteUtilityEntryThreshold)) && Number(absoluteUtilityEntryThreshold) !== Number(absoluteUtilityExitThreshold) ? <ReferenceLine yAxisId="utility" y={Number(absoluteUtilityEntryThreshold)} strokeDasharray="6 4" label={{ value: tr('Utility entry threshold'), position: 'insideBottomRight', fontSize: 10 }} /> : null}
                    {!decisionUsesAbsoluteUtility && Number.isFinite(Number(cashExitThreshold)) ? <ReferenceLine yAxisId="utility" y={Number(cashExitThreshold)} strokeDasharray="3 4" label={{ value: tr('Cash exit'), position: 'insideTopRight', fontSize: 10 }} /> : null}
                    {!decisionUsesAbsoluteUtility && Number.isFinite(Number(cashEntryThreshold)) && Number(cashEntryThreshold) !== Number(cashExitThreshold) ? <ReferenceLine yAxisId="utility" y={Number(cashEntryThreshold)} strokeDasharray="6 4" label={{ value: tr('Cash entry'), position: 'insideBottomRight', fontSize: 10 }} /> : null}
                    {decisionHasOpportunity && Number.isFinite(Number(opportunityThreshold)) ? <ReferenceLine yAxisId="probability" y={Number(opportunityThreshold)} strokeDasharray="4 4" label={{ value: tr(decisionUsesOpportunityConfidence ? 'Opportunity confidence threshold' : 'Opportunity threshold'), position: 'insideTopLeft', fontSize: 10 }} /> : null}
                    <Line yAxisId="utility" type="monotone" dataKey="best_utility" name={tr('Best Utility')} dot={false} activeDot={{ r: 4 }} strokeWidth={2.1} isAnimationActive={false} connectNulls />
                    {decisionHasCurrentUtility ? <Line yAxisId="utility" type="monotone" dataKey="current_utility" name={tr('Current Utility')} dot={false} activeDot={{ r: 4 }} strokeWidth={1.7} strokeDasharray="5 4" isAnimationActive={false} connectNulls /> : null}
                    {decisionHasCashEdge ? <Line yAxisId="utility" type="monotone" dataKey="best_cash_edge" name={tr('Best Cash Edge')} dot={false} activeDot={{ r: 4 }} strokeWidth={1.8} isAnimationActive={false} connectNulls /> : null}
                    {decisionHasCashEdge ? <Line yAxisId="utility" type="monotone" dataKey="current_cash_edge" name={tr('Current Cash Edge')} dot={false} activeDot={{ r: 4 }} strokeWidth={1.5} strokeDasharray="5 4" isAnimationActive={false} connectNulls /> : null}
                    {decisionHasOpportunity ? <Line yAxisId="probability" type="monotone" dataKey="opportunity_signal" name={tr(decisionUsesOpportunityConfidence ? 'Opportunity Confidence' : 'Opportunity Probability')} dot={false} activeDot={{ r: 4 }} strokeWidth={1.8} strokeDasharray="6 3" isAnimationActive={false} connectNulls /> : null}
                  </ComposedChart></MeasuredChartContainer> : <div className="dashboard-story-empty">{tr('The selected backtest has no protected decision diagnostics.')}</div>}
                </div>
              </article>
            </div>

            {researchStrategy ? <StrategyConfigurationGrid configuration={researchStrategy.configuration} modelConfiguration={researchStrategy.research_model_configuration} /> : null}

            <article className="dashboard-intelligence-card dashboard-tuning-card">
              <div className="dashboard-intelligence-card-heading">
                <div><span className="panel-kicker">{tr('Research')}</span><h3>{tr('Model Tuning Candidates')}</h3></div>
                {tuning ? <div className="dashboard-tuning-status"><strong>{String(tuning.method || '').replaceAll('_', ' ')}</strong><span>{tr(tuning.status)} · {Number(tuning.progress || 0).toFixed(0)}%</span>{tuning.method === PROBABILITY_METHOD && tuning.probability_state ? <small>{tr('Champion')} #{tuning.probability_state.last_champion_candidate_id ?? tuning.probability_anchor?.candidate_id ?? 0} · {tr('Trust region')} {(Number(tuning.probability_state.trust_region_radius || 0) * 100).toFixed(1)}% · {tr('Adaptive trials')} {tuning.probability_state.adaptive_trials_completed || 0}</small> : null}</div> : null}
              </div>
              {tuning && tuningRows.length ? <div className="dashboard-tuning-layout">
                <div className="dashboard-tuning-performance-chart">
                  <MeasuredChartContainer fallbackHeight={310}><BarChart data={tuningRows} margin={{ top: 12, right: 12, left: 6, bottom: 6 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} />
                    <XAxis dataKey="label" interval={0} tick={{ fontSize: 10 }} />
                    <YAxis tickFormatter={(value) => `$${Number(value).toLocaleString(getIntlLocale(), { notation: 'compact', maximumFractionDigits: 1 })}`} />
                    <Tooltip content={<TuningTooltip />} />
                    {Number.isFinite(Number(tuningControlCapital)) ? <ReferenceLine y={Number(tuningControlCapital)} strokeDasharray="5 4" label={{ value: tr('Control'), position: 'insideTopRight', fontSize: 10 }} /> : null}
                    <Bar dataKey="ending_capital" name={tr('Ending Capital')} radius={[4, 4, 0, 0]} onClick={onSelectTuningCandidate} className="dashboard-tuning-candidate-bar" activeBar={false}>
                      {tuningRows.map((row) => {
                        const isControl = String(row.kind) === 'control' || Number(row.candidate_id) === Number(tuning?.control_candidate_id)
                        const isChampion = Number(row.candidate_id) === Number(tuning?.probability_state?.last_champion_candidate_id ?? tuning?.probability_anchor?.candidate_id)
                        const fill = isControl ? 'var(--accent-soft)' : isChampion ? 'var(--positive)' : 'var(--accent)'
                        return <Cell key={`${row.kind || 'candidate'}-${row.candidate_id}`} fill={fill} />
                      })}
                    </Bar>
                  </BarChart></MeasuredChartContainer>
                </div>

                <div className="dashboard-tuning-candidate-panel">
                  {tuningCandidateLoading ? <div className="dashboard-story-loading compact"><span className="loading-ring" />{tr('Loading Candidate…')}</div> : tuningCandidateDetail ? <>
                    <div className="dashboard-tuning-candidate-title"><div><span>{tuningCandidateDetail.is_control ? tr('Control') : `${tr('Candidate')} #${tuningCandidateDetail.candidate_id}`}</span><strong>{money(tuningCandidateDetail.metrics?.ending_capital)}</strong></div><small>{tr(tuningCandidateDetail.status)} · Sharpe {decimal(tuningCandidateDetail.metrics?.sharpe, 3)} · DD {percent(tuningCandidateDetail.metrics?.maximum_drawdown)}</small></div>
                    <div className="dashboard-tuning-preview-chart">
                      {tuningPreviewRows.length ? <MeasuredChartContainer fallbackHeight={260}><LineChart data={tuningPreviewRows} margin={{ top: 8, right: 10, left: 4, bottom: 4 }}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} />
                        <XAxis dataKey="timestamp_value" type="number" scale="time" domain={['dataMin', 'dataMax']} minTickGap={28} tickFormatter={(value) => dashboardAxisLabel(value, tuningPreviewSpan)} />
                        <YAxis tickFormatter={(value) => `$${Number(value).toLocaleString(getIntlLocale(), { notation: 'compact', maximumFractionDigits: 1 })}`} />
                        <Tooltip formatter={(value) => money(value)} labelFormatter={(value) => shortDateTime(new Date(Number(value)).toISOString())} />
                        <Legend />
                        <Line type="monotone" dataKey="simulation_equity" name={tr('Candidate')} dot={false} strokeWidth={2.2} isAnimationActive={false} />
                        <Line type="monotone" dataKey="reference_equity" name={tr('Buy & Hold')} dot={false} strokeWidth={1.8} isAnimationActive={false} />
                      </LineChart></MeasuredChartContainer> : <div className="dashboard-story-empty compact">{tr('No compact curve was retained for this older Candidate. New Candidates retain a visual preview before raw tuning artifacts are deleted.')}</div>}
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
