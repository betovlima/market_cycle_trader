import {
  Bar,
  BarChart,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Scatter,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'

import { EmptyState } from '../../../shared/components/EmptyState'
import { MetricCard } from '../../../shared/components/MetricCard'
import { compactDate, money, number, percent } from '../../../shared/formatters'

export function ResultsDashboard({ workspace }) {
  const {
    results,
    selectedKey,
    setSelectedKey,
    loadingResults,
    selectedRun,
    comparisonData,
    robustnessSummary,
    bestRun,
    selectedMetrics,
    bottomThreshold,
    topThreshold,
    buys,
    sells,
  } = workspace

  return (
    <>
      {loadingResults && <section className="loading-panel">Loading result files…</section>}
      {!loadingResults && !results && <EmptyState />}

      {results && (
        <>
          <section className="metrics-grid">
            <MetricCard label="Completed model runs" value={comparisonData.length} note={`${new Set(comparisonData.map((row) => row.symbol)).size} assets`} />
            <MetricCard label="Best excess return" value={bestRun ? percent(bestRun.excess_return) : '—'} note={bestRun ? `${bestRun.symbol} · ${bestRun.modelLabel}` : ''} />
            <MetricCard label="Best strategy capital" value={bestRun ? money(bestRun.strategy_ending_capital) : '—'} note="Out-of-sample capital" />
            <MetricCard label="Export package" value="ZIP + CSV" note="Charts, predictions, trades and metrics" />
          </section>

          <section className="panel chart-panel">
            <div className="section-heading compact">
              <div><span className="section-kicker">Cross-strategy comparison</span><h2>Return by asset and model</h2></div>
              <div className="inline-actions">
                <a className="button ghost" href={results.downloads.comparison}>Export CSV</a>
                <a className="button ghost" href={results.downloads.comparisonChart}>Export chart</a>
              </div>
            </div>
            <div className="chart large-chart">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={comparisonData} margin={{ top: 12, right: 18, left: 0, bottom: 44 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="label" interval={0} angle={-25} textAnchor="end" height={70} />
                  <YAxis tickFormatter={(value) => `${value}%`} />
                  <Tooltip formatter={(value) => [`${Number(value).toFixed(2)}%`]} />
                  <Legend />
                  <Bar dataKey="strategyPct" name="Strategy" fill="var(--series-1)" radius={[5, 5, 0, 0]} />
                  <Bar dataKey="buyHoldPct" name="Buy and hold" fill="var(--series-2)" radius={[5, 5, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </section>

          {robustnessSummary.some((row) => Number(row.runs) > 1) && (
            <section className="panel comparison-table-panel">
              <div className="section-heading compact">
                <div>
                  <span className="section-kicker">Robustness across seeds</span>
                  <h2>Distribution instead of one lucky run</h2>
                </div>
              </div>
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Model</th><th>Runs</th><th>Beat B&H</th><th>Median capital</th><th>Worst capital</th><th>Best capital</th><th>Median excess</th><th>Median CAGR</th><th>Worst drawdown</th><th>Median Sharpe</th>
                    </tr>
                  </thead>
                  <tbody>
                    {robustnessSummary.map((row) => (
                      <tr key={row.model_family}>
                        <td><strong>{row.model_label}</strong></td>
                        <td>{row.runs}</td>
                        <td>{row.beat_buy_hold_runs}/{row.runs} ({percent(row.beat_buy_hold_rate)})</td>
                        <td>{money(row.ending_capital_median)}</td>
                        <td>{money(row.ending_capital_min)}</td>
                        <td>{money(row.ending_capital_max)}</td>
                        <td className={Number(row.excess_return_median) >= 0 ? 'positive' : 'negative'}>{percent(row.excess_return_median)}</td>
                        <td>{percent(row.cagr_median)}</td>
                        <td>{percent(row.drawdown_worst)}</td>
                        <td>{number(row.sharpe_median, 3)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}

          <section className="panel comparison-table-panel">
            <div className="table-wrap">
              <table>
                <thead>
                  <tr><th>Asset</th><th>Model</th><th>{comparisonData.some((item) => item.portfolio_rotation) ? 'WF folds' : 'Gate'}</th><th>{comparisonData.some((item) => item.portfolio_rotation) ? 'Risk score' : 'Approx ≤10%'}</th><th>{comparisonData.some((item) => item.portfolio_rotation) ? 'Effective margin' : 'Exit balance'}</th><th>Strategy</th><th>Benchmark</th><th>Excess</th><th>Drawdown</th><th>Sharpe</th><th>Exposure</th><th>Trades</th></tr>
                </thead>
                <tbody>
                  {comparisonData.map((row) => (
                    <tr key={`${row.symbol}_${row.backend}`} className={selectedKey === `${row.symbol}_${row.backend}` ? 'selected-row' : ''} onClick={() => setSelectedKey(`${row.symbol}_${row.backend}`)}>
                      <td><strong>{row.symbol}</strong></td><td>{row.modelLabel}</td><td>{row.portfolio_rotation ? number(row.walk_forward_fold_count, 0) : (row.exit_risk_backend ? (row.exit_risk_calibration_gate_passed ? 'PASS' : 'BLOCKED') : '—')}</td><td>{row.portfolio_rotation ? number(row.risk_adjusted_compound_score, 4) : (row.exit_risk_backend ? percent(row.exit_approx_within_10pct_rate) : '—')}</td><td>{row.portfolio_rotation ? percent(row.effective_switch_margin) : (row.exit_risk_backend ? percent(row.exit_approx_average_balance) : '—')}</td><td>{percent(row.strategy_return)}</td><td>{percent(row.buy_hold_return)}</td><td className={Number(row.excess_return) >= 0 ? 'positive' : 'negative'}>{percent(row.excess_return)}</td><td>{percent(row.strategy_maximum_drawdown)}</td><td>{number(row.strategy_sharpe, 3)}</td><td>{percent(row.market_exposure)}</td><td>{Number(row.simulated_buys || 0) + Number(row.simulated_sells || 0)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          {selectedRun && (
            <section className="strategy-section">
              <div className="strategy-header">
                <div>
                  <span className="section-kicker">Selected strategy</span>
                  <h2>{selectedRun.symbol} · {selectedRun.backend}</h2>
                </div>
                <select value={selectedRun.key} onChange={(event) => setSelectedKey(event.target.value)}>
                  {results.runs.map((run) => <option key={run.key} value={run.key}>{run.symbol} · {run.backend}</option>)}
                </select>
                <div className="inline-actions">
                  <a className="button ghost" href={selectedRun.downloads.predictions}>Predictions CSV</a>
                  <a className="button ghost" href={selectedRun.downloads.trades}>Trades CSV</a>
                  {selectedRun.downloads.diagnostics && (
                    <a className="button ghost" href={selectedRun.downloads.diagnostics}>Diagnostics CSV</a>
                  )}
                  <a className="button ghost" href={selectedRun.downloads.summary}>Summary</a>
                  <a className="button ghost" href={selectedRun.downloads.chart}>PNG chart</a>
                </div>
              </div>

              <div className="metrics-grid selected-metrics">
                <MetricCard label="Strategy return" value={percent(selectedMetrics.strategy_return)} note={money(selectedMetrics.strategy_ending_capital)} />
                <MetricCard
                  label={selectedMetrics.portfolio_rotation ? 'CAGR' : 'Excess return'}
                  value={selectedMetrics.portfolio_rotation ? percent(selectedMetrics.strategy_cagr) : percent(selectedMetrics.excess_return)}
                  note={selectedMetrics.portfolio_rotation ? `Benchmark CAGR ${percent(selectedMetrics.buy_hold_cagr)}` : `Buy & hold ${percent(selectedMetrics.buy_hold_return)}`}
                />
                <MetricCard label="Maximum drawdown" value={percent(selectedMetrics.strategy_maximum_drawdown)} note={`Sharpe ${number(selectedMetrics.strategy_sharpe, 3)}`} />
                <MetricCard
                  label={selectedMetrics.portfolio_rotation ? 'Capital rotations' : 'Market exposure'}
                  value={selectedMetrics.portfolio_rotation ? number(selectedMetrics.capital_rotations, 0) : percent(selectedMetrics.market_exposure)}
                  note={selectedMetrics.portfolio_rotation ? `${number(selectedMetrics.cycles_per_year, 2)} cycles/year` : `${selectedMetrics.simulated_buys || 0} buys · ${selectedMetrics.simulated_sells || 0} sells`}
                />
                {selectedMetrics.portfolio_rotation && (
                  <>
                    <MetricCard label="Walk-forward folds" value={number(selectedMetrics.walk_forward_fold_count, 0)} note={`${number(selectedMetrics.walk_forward_purge_days, 0)}-session purge`} />
                    <MetricCard label="Risk-adjusted score" value={number(selectedMetrics.risk_adjusted_compound_score, 4)} note={`downside ${number(selectedMetrics.downside_penalty, 2)} · drawdown ${number(selectedMetrics.drawdown_penalty, 2)}`} />
                  </>
                )}
              </div>

              <div className="chart-grid">
                {!selectedMetrics.portfolio_rotation && (
                <article className="panel chart-panel full-width">
                  <h3>Adjusted price and simulated executions</h3>
                  <div className="chart">
                    <ResponsiveContainer width="100%" height="100%">
                      <ComposedChart data={selectedRun.series} margin={{ top: 10, right: 18, left: 4, bottom: 4 }}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} />
                        <XAxis dataKey="date" minTickGap={42} tickFormatter={compactDate} />
                        <YAxis domain={['auto', 'auto']} />
                        <Tooltip labelFormatter={(value) => value} formatter={(value, name) => [money(value), name]} />
                        <Legend />
                        <Line type="monotone" dataKey="close" name="Adjusted close" stroke="var(--series-1)" dot={false} strokeWidth={2} />
                        <Line type="monotone" dataKey="trailingStop" name="ATR trailing stop" stroke="var(--series-3)" dot={false} strokeDasharray="5 4" connectNulls={false} />
                        <Line type="monotone" dataKey="fibonacciTarget" name="Fibonacci target" stroke="var(--warning)" dot={false} strokeDasharray="3 5" connectNulls={false} />
                        <Scatter data={buys} dataKey="buyPrice" name="BUY" fill="var(--positive)" shape="triangle" />
                        <Scatter data={sells} dataKey="sellPrice" name="SELL" fill="var(--negative)" shape="diamond" />
                      </ComposedChart>
                    </ResponsiveContainer>
                  </div>
                </article>
                )}

                {!selectedMetrics.portfolio_rotation && (
                <article className="panel chart-panel">
                  <h3>BOTTOM and TOP probability</h3>
                  <div className="chart">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={selectedRun.series} margin={{ top: 10, right: 18, left: 0, bottom: 4 }}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} />
                        <XAxis dataKey="date" minTickGap={42} tickFormatter={compactDate} />
                        <YAxis domain={[0, 1]} tickFormatter={(value) => `${Math.round(value * 100)}%`} />
                        <Tooltip formatter={(value) => percent(value)} />
                        <Legend />
                        <ReferenceLine y={bottomThreshold} stroke="var(--positive)" strokeDasharray="4 4" />
                        <ReferenceLine y={topThreshold} stroke="var(--negative)" strokeDasharray="4 4" />
                        <Line type="monotone" dataKey="bottomProbability" name="BOTTOM probability" stroke="var(--positive)" dot={false} />
                        <Line type="monotone" dataKey="topProbability" name="TOP probability" stroke="var(--negative)" dot={false} />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                </article>
                )}

                <article className={`panel chart-panel ${selectedMetrics.portfolio_rotation ? 'full-width' : ''}`}>
                  <h3>{selectedMetrics.portfolio_rotation ? 'Compound capital growth' : 'Capital comparison'}</h3>
                  <div className="chart">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={selectedRun.series} margin={{ top: 10, right: 18, left: 4, bottom: 4 }}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} />
                        <XAxis dataKey="date" minTickGap={42} tickFormatter={compactDate} />
                        <YAxis tickFormatter={(value) => `$${Math.round(value / 1000)}k`} />
                        <Tooltip formatter={(value) => money(value)} />
                        <Legend />
                        <Line type="monotone" dataKey="strategyEquity" name={selectedMetrics.strategy_label || 'Strategy'} stroke="var(--series-1)" dot={false} strokeWidth={2} />
                        <Line type="monotone" dataKey="buyHoldEquity" name={selectedMetrics.benchmark_name || 'Buy and hold'} stroke="var(--series-2)" dot={false} strokeDasharray="5 4" />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                </article>
              </div>


              {selectedMetrics.portfolio_rotation && selectedRun.diagnostics?.summary && (
                <section className="panel comparison-table-panel">
                  <div className="section-heading">
                    <div>
                      <span className="section-kicker">Post-mortem analysis</span>
                      <h2>Performance diagnostics</h2>
                      <p>
                        Diagnostic only. Future prices shown here are never used
                        by training or by the trading policy.
                      </p>
                    </div>
                  </div>

                  <div className="metrics-grid selected-metrics">
                    <MetricCard
                      label="Ending capital vs benchmark"
                      value={percent(selectedRun.diagnostics.summary.ending_relative_excess)}
                      note={`${percent(selectedRun.diagnostics.summary.ending_relative_ratio)} of ${selectedMetrics.benchmark_name || 'benchmark'} capital`}
                    />
                    <MetricCard
                      label="Worst relative capital ratio"
                      value={percent(selectedRun.diagnostics.summary.worst_relative_ratio)}
                      note={String(selectedRun.diagnostics.summary.worst_relative_date || '').slice(0, 10)}
                    />
                    <MetricCard
                      label="Worst relative drawdown"
                      value={percent(selectedRun.diagnostics.summary.worst_relative_drawdown)}
                      note={`Loss of ground versus ${selectedMetrics.benchmark_name || 'benchmark'}`}
                    />
                    <MetricCard
                      label="Sessions below benchmark"
                      value={number(selectedRun.diagnostics.summary.observations_below_buy_hold ?? selectedRun.diagnostics.summary.days_below_buy_hold, 0)}
                      note={percent(selectedRun.diagnostics.summary.share_sessions_below_buy_hold)}
                    />
                  </div>

                  <article className="panel chart-panel full-width">
                    <h3>Relative capital — strategy / benchmark</h3>
                    <div className="chart">
                      <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={selectedRun.series} margin={{ top: 10, right: 18, left: 4, bottom: 4 }}>
                          <CartesianGrid strokeDasharray="3 3" vertical={false} />
                          <XAxis dataKey="date" minTickGap={42} tickFormatter={compactDate} />
                          <YAxis tickFormatter={(value) => `${Math.round(Number(value) * 100)}%`} />
                          <Tooltip formatter={(value) => percent(value)} />
                          <ReferenceLine y={1} stroke="var(--series-2)" strokeDasharray="5 4" />
                          <Line
                            type="monotone"
                            dataKey="relativeEquityRatio"
                            name={`${selectedMetrics.strategy_label || 'Strategy'} / benchmark`}
                            stroke="var(--series-1)"
                            dot={false}
                            strokeWidth={2}
                          />
                        </LineChart>
                      </ResponsiveContainer>
                    </div>
                  </article>

                  <div className="section-heading compact">
                    <div>
                      <span className="section-kicker">Largest relative losses</span>
                      <h3>Underperformance periods</h3>
                    </div>
                  </div>
                  <div className="table-wrap">
                    <table>
                      <thead>
                        <tr>
                          <th>Peak</th>
                          <th>Trough</th>
                          <th>Recovery</th>
                          <th>Relative drawdown</th>
                          <th>Strategy</th>
                          <th>Benchmark</th>
                          <th>Rotations</th>
                          <th>Cash</th>
                          <th>Avg hold</th>
                          <th>Likely cause</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(selectedRun.diagnostics.underperformance_periods || []).map((item, index) => (
                          <tr key={`${item.start}-${item.trough}-${index}`}>
                            <td>{String(item.start || '').slice(0, 10)}</td>
                            <td>{String(item.trough || '').slice(0, 10)}</td>
                            <td>{item.recovered ? String(item.recovery || '').slice(0, 10) : 'Open'}</td>
                            <td className="negative">{percent(item.relative_drawdown)}</td>
                            <td>{percent(item.strategy_return_to_trough)}</td>
                            <td>{percent(item.buy_hold_return_to_trough)}</td>
                            <td>{number(item.rotations, 0)}</td>
                            <td>{percent(item.cash_share)}</td>
                            <td>{item.average_holding_days === null || item.average_holding_days === undefined ? '—' : number(item.average_holding_days, 2)}</td>
                            <td><strong>{item.likely_cause}</strong></td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {selectedMetrics.strategy_mode === 'COMPOUND_ROTATION_DAY_TRADE_OPEN_CLOSE' ? (
                    <>
                      <div className="metrics-grid selected-metrics">
                        <MetricCard
                          label="Invested sessions"
                          value={number(selectedMetrics.invested_sessions, 0)}
                          note={`${number(selectedMetrics.cash_days, 0)} sessions in CASH`}
                        />
                        <MetricCard
                          label="Session win rate"
                          value={percent(selectedMetrics.session_win_rate)}
                          note={`${number(selectedMetrics.winning_sessions, 0)} winning sessions`}
                        />
                        <MetricCard
                          label="Intraday rotations"
                          value={number(selectedMetrics.capital_rotations, 0)}
                          note="Must remain zero by strategy design"
                        />
                        <MetricCard
                          label="Buy & Hold reference"
                          value={percent(selectedMetrics.reference_buy_hold_return)}
                          note="Reference only; it carries exposure overnight"
                        />
                      </div>
                      <div className="settings-message" role="status">
                        <strong>Open→Close execution:</strong>{' '}
                        one model decision before the regular-session open, at most one selected asset entered at the open, and mandatory same-session exit. The 15-minute Alpaca bars are source data only; they are not decision intervals.
                      </div>
                    </>
                  ) : (
                    <>
                      <div className="section-heading compact">
                        <div>
                          <span className="section-kicker">Counterfactual diagnostic</span>
                          <h3>Largest post-exit moves</h3>
                        </div>
                      </div>
                      <div className="table-wrap">
                        <table>
                          <thead>
                            <tr>
                              <th>Date</th>
                              <th>Asset</th>
                              <th>Reason</th>
                              <th>Sale price</th>
                              <th>+5 sessions</th>
                              <th>+10 sessions</th>
                              <th>+20 sessions</th>
                              <th>Diagnostic</th>
                            </tr>
                          </thead>
                          <tbody>
                            {(selectedRun.diagnostics.exit_diagnostics || []).slice(0, 20).map((item, index) => (
                              <tr key={`${item.timestamp}-${item.asset}-${index}`}>
                                <td>{String(item.timestamp || '').slice(0, 10)}</td>
                                <td>{item.asset}</td>
                                <td>{item.reason}</td>
                                <td>{money(item.sale_price)}</td>
                                <td className={Number(item.return_after_5d || 0) > 0 ? 'positive' : 'negative'}>{item.return_after_5d === null || item.return_after_5d === undefined ? '—' : percent(item.return_after_5d)}</td>
                                <td className={Number(item.return_after_10d || 0) > 0 ? 'positive' : 'negative'}>{item.return_after_10d === null || item.return_after_10d === undefined ? '—' : percent(item.return_after_10d)}</td>
                                <td className={Number(item.return_after_20d || 0) > 0 ? 'positive' : 'negative'}>{item.return_after_20d === null || item.return_after_20d === undefined ? '—' : percent(item.return_after_20d)}</td>
                                <td><strong>{item.classification}</strong></td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </>
                  )}
                </section>
              )}

            </section>
          )}
        </>
      )}
    </>
  )
}
