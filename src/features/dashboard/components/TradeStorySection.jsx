import { getIntlLocale, tr } from '../../../i18n/runtime'
import { CartesianGrid, ComposedChart, Legend, Line, LineChart, ReferenceArea, ReferenceDot, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'

import { ChevronLeftIcon, ChevronRightIcon } from '../../../shared/components/Icons'
import { ParameterHint } from '../../../shared/components/ParameterHint'
import { money, percent, shortDateTime } from '../../../shared/formatters'
import { nearestTimeSeriesIndex } from '../../../shared/charts/timeSeries'
import { DASHBOARD_HINTS } from '../dashboardConfig'
import { dashboardAxisLabel, tradeTone } from '../dashboardUtils'
import { SelectedTradeTooltip, StoryTooltip, StoryTradeDot } from './DashboardPrimitives'

export function TradeStorySection({
  storyJobId,
  onStoryJobChange,
  completedStoryJobs,
  storyError,
  storyLoading,
  storyData,
  markerMode,
  onMarkerModeChange,
  zoomActive,
  zoomLevel,
  isPanning,
  onResetZoom,
  chartInteractionRef,
  beginChartPan,
  moveChartPan,
  endChartPan,
  chartRows,
  visibleChartRows,
  effectiveZoomDomain,
  visibleTimeSpan,
  yDomain,
  selectedTradeStart,
  selectedTradeEnd,
  trades,
  safeTradeIndex,
  selectPreviousTrade,
  selectNextTrade,
  navigatorTrades,
  navigatorStart,
  onSelectTrade,
  selectedTrade,
  selectedTradeView,
  onSelectedTradeViewChange,
  focusSelectedTrade,
  selectedTradeComparison,
  selectedTradeChartRows,
  selectedTradeYDomain,
}) {
  return (
<section className="dashboard-story-section">
          <div className="dashboard-story-heading">
            <div>
              <div className="dashboard-heading-title"><span className="panel-kicker">{tr("Trade Story")}</span><ParameterHint id="dashboard-hint-portfolio-growth" title={tr("Portfolio Growth")} description={DASHBOARD_HINTS.portfolioGrowth} /></div>
              <h2>{tr("Portfolio Growth")}</h2>
              <p>{tr("Start with a clean equity curve, then inspect executions only when you need them.")}</p>
            </div>
            <label className="dashboard-story-select"><span>{tr("Completed backtest")}</span><select value={storyJobId} onChange={(event) => onStoryJobChange(event.target.value)}>{completedStoryJobs.length ? completedStoryJobs.map((item) => <option key={item.id} value={item.id}>{shortDateTime(item.created_at)}</option>) : <option value="">{tr("No completed backtest")}</option>}</select></label>
          </div>

          {storyError ? <div className="global-inline-message error-inline dashboard-story-message">{tr(storyError)}</div> : null}
          {storyLoading ? <div className="dashboard-story-loading"><span className="loading-ring" />{tr("Loading trade story…")}</div> : null}

          {!storyLoading && storyData ? <>
            <div className="dashboard-growth-toolbar">
              <div className="dashboard-marker-modes" role="group" aria-label={tr("Execution marker display")}>
                <span>{tr("Executions")}</span>
                {['off', 'grouped', 'all'].map((mode) => <button key={mode} type="button" className={markerMode === mode ? 'active' : ''} onClick={() => onMarkerModeChange(mode)}>{tr(mode === 'off' ? 'Off' : mode === 'grouped' ? 'Grouped' : 'All')}</button>)}
              </div>
              <div className="dashboard-growth-zoom"><span>{zoomActive ? tr('Zoom {level}× · drag to pan', { level: zoomLevel >= 10 ? zoomLevel.toFixed(0) : zoomLevel.toFixed(1) }) : tr('Wheel to zoom · drag to pan after zoom')}</span>{zoomActive ? <button type="button" onClick={() => onResetZoom()}>{tr("Reset zoom")}</button> : null}</div>
            </div>

            <div ref={chartInteractionRef} className={`dashboard-growth-chart dashboard-story-interactive ${zoomActive ? 'is-zoomed' : ''} ${isPanning ? 'is-panning' : ''}`} onPointerDown={beginChartPan} onPointerMove={moveChartPan} onPointerUp={endChartPan} onPointerCancel={endChartPan}>
              {chartRows.length ? <ResponsiveContainer width="100%" height="100%"><ComposedChart data={visibleChartRows} margin={{ top: 16, right: 16, left: 8, bottom: 6 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="timestamp_value" type="number" scale="time" domain={effectiveZoomDomain ? [effectiveZoomDomain.start, effectiveZoomDomain.end] : ['dataMin', 'dataMax']} allowDataOverflow minTickGap={38} tickFormatter={(value) => dashboardAxisLabel(value, visibleTimeSpan)} />
                <YAxis domain={yDomain} tickFormatter={(value) => `$${Number(value).toLocaleString(getIntlLocale(), { maximumFractionDigits: 0 })}`} />
                <Tooltip content={<StoryTooltip />} cursor={{ stroke: 'rgba(157, 175, 195, .42)', strokeWidth: 1 }} />
                <Legend />
                {selectedTradeStart !== null && selectedTradeEnd !== null ? <ReferenceArea x1={selectedTradeStart} x2={selectedTradeEnd} className="dashboard-selected-trade-area" ifOverflow="extendDomain" /> : null}
                <Line type="monotone" dataKey="simulation_equity" name="Simulation" dot={markerMode === 'off' ? false : <StoryTradeDot />} activeDot={false} strokeWidth={2.5} stroke="var(--positive)" isAnimationActive={false} />
                <Line type="monotone" dataKey="reference_equity" name="Reference" dot={false} activeDot={false} strokeWidth={2.1} stroke="var(--accent)" isAnimationActive={false} />
              </ComposedChart></ResponsiveContainer> : <div className="dashboard-story-empty">{tr("No equity history is available for this completed backtest.")}</div>}
            </div>

            <div className="dashboard-navigator-header">
              <div>
                <div className="dashboard-heading-title"><span className="panel-kicker">{tr("Sequence")}</span><ParameterHint id="dashboard-hint-trade-navigator" title={tr("Trade Navigator")} description={DASHBOARD_HINTS.navigator} /></div>
                <h2>{tr("Trade Navigator")}</h2>
              </div>
              <div className="dashboard-navigator-actions">
                <button type="button" onClick={selectPreviousTrade} disabled={!trades.length || safeTradeIndex <= 0}><ChevronLeftIcon size={16} />{tr("Previous")}</button>
                <strong>{trades.length ? tr('Trade {current} of {total}', { current: safeTradeIndex + 1, total: trades.length }) : tr('No completed positions')}</strong>
                <button type="button" onClick={selectNextTrade} disabled={!trades.length || safeTradeIndex >= trades.length - 1}>{tr("Next")}<ChevronRightIcon size={16} /></button>
              </div>
            </div>

            <div className="dashboard-trade-navigator">
              {navigatorTrades.length ? navigatorTrades.map((trade, offset) => {
                const absoluteIndex = navigatorStart + offset
                const tone = tradeTone(trade.position_return)
                return <button key={`${trade.trade_number}-${trade.asset}-${trade.exit_at}`} type="button" className={`dashboard-trade-chip ${tone} ${absoluteIndex === safeTradeIndex ? 'active' : ''}`} onClick={() => onSelectTrade(absoluteIndex)}>
                  <small>#{trade.trade_number}</small><strong>{trade.asset}</strong><span>{percent(trade.position_return)}</span><i>{trade.holding_days == null ? '—' : `${Number(trade.holding_days).toFixed(0)}d`}</i>
                </button>
              }) : <div className="dashboard-story-empty compact">{tr("No completed positions are available for this backtest.")}</div>}
            </div>

            {selectedTrade ? <section className="dashboard-selected-trade-section">
              <article className="dashboard-selected-trade-chart-panel">
                <div className="dashboard-selected-trade-heading">
                  <div><div className="dashboard-heading-title"><span className="panel-kicker">{tr("Trade Evolution")}</span><ParameterHint id="dashboard-hint-selected-position" title={tr("Trade Evolution")} description={DASHBOARD_HINTS.selectedPosition} /></div><h2>{selectedTrade.asset} {tr("· Trade #")}{selectedTrade.trade_number}</h2></div>
                  <div className="dashboard-selected-trade-actions">
                    <div className="dashboard-trade-view-toggle" role="group" aria-label={tr("Trade evolution view")}>
                      <button type="button" className={selectedTradeView === 'value' ? 'active' : ''} onClick={() => onSelectedTradeViewChange('value')}>{tr("Portfolio Value")}</button>
                      <button type="button" className={selectedTradeView === 'indexed' ? 'active' : ''} onClick={() => onSelectedTradeViewChange('indexed')}>{tr("Indexed 100")}</button>
                    </div>
                    <button type="button" className="dashboard-focus-trade-button" onClick={focusSelectedTrade}>{tr("Focus on Portfolio Growth")}</button>
                  </div>
                </div>
                <div className="dashboard-trade-comparison-strip">
                  <div><span>{tr("Strategy period")}</span><strong className={(selectedTradeComparison?.strategy ?? 0) >= 0 ? 'positive' : 'negative'}>{selectedTradeComparison ? percent(selectedTradeComparison.strategy) : '—'}</strong></div>
                  <div><span>{tr("Buy & Hold")}</span><strong className={(selectedTradeComparison?.reference ?? 0) >= 0 ? 'positive' : 'negative'}>{selectedTradeComparison ? percent(selectedTradeComparison.reference) : '—'}</strong></div>
                  <div><span>{tr("Excess")}</span><strong className={(selectedTradeComparison?.excess ?? 0) >= 0 ? 'positive' : 'negative'}>{selectedTradeComparison ? `${selectedTradeComparison.excess.toFixed(2)} pp` : '—'}</strong></div>
                  <div><span>{tr("Holding")}</span><strong>{selectedTrade.holding_days == null ? '—' : tr('{count} days', { count: Number(selectedTrade.holding_days).toFixed(1) })}</strong></div>
                </div>
                <div className="dashboard-selected-trade-chart">
                  {selectedTradeChartRows.length ? <ResponsiveContainer width="100%" height="100%"><LineChart data={selectedTradeChartRows} margin={{ top: 14, right: 18, left: 8, bottom: 6 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} />
                    <XAxis dataKey="timestamp_value" type="number" scale="time" domain={['dataMin', 'dataMax']} minTickGap={34} tickFormatter={(value) => dashboardAxisLabel(value, Math.max(0, (selectedTradeEnd || 0) - (selectedTradeStart || 0)))} />
                    <YAxis domain={selectedTradeYDomain} tickFormatter={(value) => selectedTradeView === 'indexed' ? Number(value).toFixed(1) : `$${Number(value).toLocaleString(getIntlLocale(), { maximumFractionDigits: 0 })}`} />
                    <Tooltip content={<SelectedTradeTooltip selectedTrade={selectedTrade} viewMode={selectedTradeView} />} />
                    <Legend verticalAlign="top" height={24} />
                    {selectedTradeStart !== null && selectedTradeEnd !== null ? <ReferenceArea x1={selectedTradeStart} x2={selectedTradeEnd} className="dashboard-trade-holding-area" ifOverflow="extendDomain" /> : null}
                    <Line type="monotone" dataKey={selectedTradeView === 'indexed' ? 'strategy_index' : 'simulation_equity'} name={tr("Strategy")} dot={false} activeDot={{ r: 4 }} strokeWidth={2.6} stroke="var(--positive)" isAnimationActive={false} />
                    <Line type="monotone" dataKey={selectedTradeView === 'indexed' ? 'reference_index' : 'reference_equity'} name={tr("Buy & Hold")} dot={false} activeDot={{ r: 4 }} strokeWidth={2.2} stroke="var(--accent)" isAnimationActive={false} />
                    {selectedTradeStart !== null ? <ReferenceDot x={selectedTradeStart} y={selectedTradeChartRows[nearestTimeSeriesIndex(selectedTradeChartRows, selectedTradeStart)]?.[selectedTradeView === 'indexed' ? 'strategy_index' : 'simulation_equity']} r={5} className="dashboard-entry-dot" ifOverflow="visible" /> : null}
                    {selectedTradeEnd !== null ? <ReferenceDot x={selectedTradeEnd} y={selectedTradeChartRows[nearestTimeSeriesIndex(selectedTradeChartRows, selectedTradeEnd)]?.[selectedTradeView === 'indexed' ? 'strategy_index' : 'simulation_equity']} r={5} className="dashboard-exit-dot" ifOverflow="visible" /> : null}
                  </LineChart></ResponsiveContainer> : <div className="dashboard-story-empty">{tr("No portfolio or reference points were stored inside this holding interval.")}</div>}
                </div>
              </article>

              <aside className="dashboard-selected-trade-details">
                <div className="dashboard-trade-detail-hero"><span>{selectedTrade.asset}</span><strong className={tradeTone(selectedTrade.position_return)}>{percent(selectedTrade.position_return)}</strong><small>{money(selectedTrade.realized_pnl)} {tr("realized P/L")}</small></div>
                <dl>
                  <div><dt>{tr("Entry")}</dt><dd>{shortDateTime(selectedTrade.entry_at)}</dd></div>
                  <div><dt>{tr("Exit")}</dt><dd>{shortDateTime(selectedTrade.exit_at)}</dd></div>
                  <div><dt>{tr("Holding")}</dt><dd>{selectedTrade.holding_days == null ? '—' : tr('{count} days', { count: Number(selectedTrade.holding_days).toFixed(1) })}</dd></div>
                  <div><dt>{tr("Entry price")}</dt><dd>{selectedTrade.entry_price == null ? '—' : money(selectedTrade.entry_price)}</dd></div>
                  <div><dt>{tr("Exit price")}</dt><dd>{selectedTrade.exit_price == null ? '—' : money(selectedTrade.exit_price)}</dd></div>
                  <div><dt>{tr("Quantity")}</dt><dd>{selectedTrade.quantity == null ? '—' : Number(selectedTrade.quantity).toLocaleString(getIntlLocale(), { maximumFractionDigits: 6 })}</dd></div>
                  <div><dt>{tr("Fees")}</dt><dd>{money(selectedTrade.transaction_fees)}</dd></div>
                  <div><dt>{tr("Next asset")}</dt><dd>{selectedTrade.final_liquidation ? tr('Final liquidation') : selectedTrade.next_asset || 'CASH'}</dd></div>
                </dl>
              </aside>
            </section> : null}
          </> : null}
        </section>
  )
}
