import { useMemo, useState } from 'react'
import { Bar, BarChart, CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'

import { EmptyState } from '../../../shared/components/EmptyState'
import { MetricCard } from '../../../shared/components/MetricCard'
import { compactDate, money, number, percent, tradeDate } from '../../../shared/formatters'

export function ResultsDashboard({ workspace }) {
  const { results, selectedKey, setSelectedKey, loadingResults, selectedRun, comparisonData, bestRun, selectedMetrics } = workspace
  const [tradeDateSort, setTradeDateSort] = useState('desc')

  const sortedTrades = useMemo(() => {
    const trades = Array.isArray(selectedRun?.trades) ? selectedRun.trades : []
    const direction = tradeDateSort === 'asc' ? 1 : -1

    return trades
      .map((trade, index) => ({ trade, index }))
      .sort((left, right) => {
        const leftTime = Date.parse(left.trade.timestamp ?? left.trade.date ?? '')
        const rightTime = Date.parse(right.trade.timestamp ?? right.trade.date ?? '')
        const leftValue = Number.isFinite(leftTime) ? leftTime : 0
        const rightValue = Number.isFinite(rightTime) ? rightTime : 0
        const dateOrder = (leftValue - rightValue) * direction
        return dateOrder !== 0 ? dateOrder : left.index - right.index
      })
      .slice(0, 250)
      .map(({ trade }) => trade)
  }, [selectedRun?.trades, tradeDateSort])

  return (
    <>
      {loadingResults && <section className="loading-panel">Loading results…</section>}
      {!loadingResults && !results && <EmptyState />}
      {results && (
        <>
          <section className="metrics-grid">
            <MetricCard label="Completed model runs" value={comparisonData.length} note="Compound Capital Rotation" />
            <MetricCard label="Best excess return" value={bestRun ? percent(bestRun.excess_return) : '—'} note={bestRun?.strategy_label || ''} />
            <MetricCard label="Best strategy capital" value={bestRun ? money(bestRun.strategy_ending_capital) : '—'} note="Out-of-sample capital" />
            <MetricCard label="Export package" value="ZIP + CSV" note="Predictions, trades, metrics and diagnostics" />
          </section>

          <section className="panel chart-panel">
            <div className="section-heading compact"><div><span className="section-kicker">Model comparison</span><h2>Strategy vs Buy & Hold</h2></div><a className="button ghost" href={results.downloads.comparison}>Export CSV</a></div>
            <div className="chart large-chart">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={comparisonData} margin={{ top: 12, right: 18, left: 0, bottom: 44 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="label" interval={0} angle={-20} textAnchor="end" height={70} />
                  <YAxis tickFormatter={(value) => `${value}%`} />
                  <Tooltip formatter={(value) => [`${Number(value).toFixed(2)}%`]} />
                  <Legend />
                  <Bar dataKey="strategyPct" name="Strategy" fill="var(--series-1)" radius={[5, 5, 0, 0]} />
                  <Bar dataKey="buyHoldPct" name="Buy and hold" fill="var(--series-2)" radius={[5, 5, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </section>

          <section className="panel comparison-table-panel">
            <div className="section-heading compact"><div><span className="section-kicker">Walk-forward comparison</span><h2>Capital rotation metrics</h2></div></div>
            <div className="table-scroll">
              <table>
                <thead><tr><th>Strategy</th><th>Folds</th><th>Capital</th><th>Return</th><th>Buy & Hold</th><th>Excess</th><th>CAGR</th><th>Sharpe</th><th>Max DD</th><th>Rotations</th><th>Avg hold</th></tr></thead>
                <tbody>
                  {comparisonData.map((row) => (
                    <tr key={`${row.backend}-${row.random_seed}-${row.repetition_index}`}>
                      <td><strong>{row.strategy_label || row.backend}</strong></td>
                      <td>{number(row.walk_forward_fold_count, 0)}</td>
                      <td>{money(row.strategy_ending_capital)}</td>
                      <td>{percent(row.strategy_return)}</td>
                      <td>{percent(row.buy_hold_return)}</td>
                      <td className={Number(row.excess_return) >= 0 ? 'positive' : 'negative'}>{percent(row.excess_return)}</td>
                      <td>{percent(row.strategy_cagr)}</td>
                      <td>{number(row.strategy_sharpe, 3)}</td>
                      <td>{percent(row.strategy_maximum_drawdown)}</td>
                      <td>{number(row.capital_rotations, 0)}</td>
                      <td>{number(row.average_holding_days, 2)} d</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          {selectedRun && (
            <section className="panel detail-panel">
              <div className="section-heading compact">
                <div><span className="section-kicker">Detailed run</span><h2>{selectedMetrics.strategy_label || selectedRun.backend}</h2></div>
                <select value={selectedKey || selectedRun.key} onChange={(event) => setSelectedKey(event.target.value)}>{results.runs.map((run) => <option key={run.key} value={run.key}>{run.metrics?.strategy_label || run.backend}</option>)}</select>
              </div>
              <section className="metrics-grid compact-metrics">
                <MetricCard label="Final capital" value={money(selectedMetrics.strategy_ending_capital)} note={`Initial ${money(selectedMetrics.initial_capital)}`} />
                <MetricCard label="CAGR" value={percent(selectedMetrics.strategy_cagr)} note={`Sharpe ${number(selectedMetrics.strategy_sharpe, 3)}`} />
                <MetricCard label="Max drawdown" value={percent(selectedMetrics.strategy_maximum_drawdown)} note={`Exposure ${percent(selectedMetrics.market_exposure)}`} />
                <MetricCard label="Rotations" value={number(selectedMetrics.capital_rotations, 0)} note={`${number(selectedMetrics.average_holding_days, 2)} average holding days`} />
              </section>
              {selectedRun.series?.length > 0 && (
                <div className="chart large-chart">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={selectedRun.series} margin={{ top: 12, right: 18, left: 0, bottom: 20 }}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} />
                      <XAxis dataKey="timestamp" tickFormatter={compactDate} minTickGap={40} />
                      <YAxis />
                      <Tooltip labelFormatter={compactDate} formatter={(value) => money(value)} />
                      <Legend />
                      <Line dataKey="strategyEquity" name="Strategy" dot={false} stroke="var(--series-1)" strokeWidth={2} />
                      <Line dataKey="buyHoldEquity" name="Buy & Hold" dot={false} stroke="var(--series-2)" strokeWidth={2} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              )}
              {selectedRun.trades?.length > 0 && (
                <>
                  <div className="trade-legend">
                    <span><span className="trade-badge buy">BUY</span> Buy</span>
                    <span><span className="trade-badge hold">HOLD</span> Hold</span>
                    <span><span className="trade-badge sell">SELL</span> Sell</span>
                  </div>
                  <div className="table-scroll">
                  <table>
                    <thead>
                      <tr>
                        <th>
                          <button
                            type="button"
                            className="table-sort-button"
                            onClick={() => setTradeDateSort((current) => current === 'desc' ? 'asc' : 'desc')}
                            title={tradeDateSort === 'desc' ? 'Newest first. Click for oldest first.' : 'Oldest first. Click for newest first.'}
                            aria-label={tradeDateSort === 'desc' ? 'Sort trades oldest first' : 'Sort trades newest first'}
                          >
                            Date <span className="sort-indicator" aria-hidden="true">{tradeDateSort === 'desc' ? '↓' : '↑'}</span>
                          </button>
                        </th>
                        <th>Action</th><th>Asset</th><th>Price</th><th>Quantity</th><th>Reason</th><th>Capital</th>
                      </tr>
                    </thead>
                    <tbody>
                      {sortedTrades.map((trade, index) => {
                        const actionClass = String(trade.action || '').toLowerCase()
                        return (
                          <tr key={`${trade.timestamp}-${trade.action}-${index}`}>
                            <td>{tradeDate(trade.timestamp ?? trade.date)}</td>
                            <td><span className={`trade-badge ${actionClass}`}>{trade.action || '—'}</span></td>
                            <td>{trade.asset || '—'}</td>
                            <td>{money(trade.execution_price ?? trade.price)}</td>
                            <td>{number(trade.quantity, 4)}</td>
                            <td>{trade.reason || '—'}</td>
                            <td className={`trade-capital ${actionClass}`}>{money(trade.cash_after_trade ?? trade.capital_after_trade ?? trade.cash_after ?? trade.cash)}</td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                  </div>
                </>
              )}
            </section>
          )}
        </>
      )}
    </>
  )
}

