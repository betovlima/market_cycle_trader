import { useEffect, useMemo, useState } from 'react'
import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
  ZAxis,
} from 'recharts'

import { tr } from '../../../i18n/runtime'
import { number, shortDateTime } from '../../../shared/formatters'
import {
  AnalyticsMetric,
  AnalyticsResponsiveContainer,
  ChartCell,
  ChartEmpty,
  SectionHeading,
} from './AnalyticsPrimitives'

function pctPoint(value, digits = 1) {
  const numeric = Number(value)
  return Number.isFinite(numeric) ? `${number(numeric, digits)}%` : '—'
}

function OverviewTooltip({ active, payload }) {
  if (!active || !payload?.length) return null
  const row = payload[0]?.payload
  if (!row) return null
  return <div className="analytics-performance-tooltip">
    <strong>{row.asset}</strong>
    <div><span>{tr('Closed positions')}</span><b>{number(row.closed_positions, 0)}</b></div>
    <div><span>{tr('Median distance from peak')}</span><b>{pctPoint(row.median_exit_distance_from_peak_pct)}</b></div>
    <div><span>{tr('Median peak capture')}</span><b>{pctPoint(row.median_peak_capture_pct)}</b></div>
    <div><span>{tr('Median post-exit peak (10 sessions)')}</span><b>{pctPoint(row.median_post_exit_peak_10d_pct)}</b></div>
  </div>
}

function OperationTooltip({ active, payload }) {
  if (!active || !payload?.length) return null
  const row = payload.find((item) => item?.payload?.exit_timestamp)?.payload || payload[0]?.payload
  if (!row) return null
  return <div className="analytics-performance-tooltip">
    <strong>{row.asset} · {tr('Operation')} {row.operation}</strong>
    <div><span>{tr('Exit')}</span><b>{shortDateTime(row.exit_timestamp)}</b></div>
    <div><span>{tr('Distance from peak')}</span><b>{pctPoint(row.exit_distance_from_peak_pct)}</b></div>
    <div><span>{tr('Peak capture')}</span><b>{pctPoint(row.peak_capture_pct)}</b></div>
    <div><span>{tr('Max run-up')}</span><b>{pctPoint(row.max_runup_pct)}</b></div>
    <div><span>{tr('Sessions from peak to exit')}</span><b>{number(row.days_from_peak_to_exit, 0)}</b></div>
    <div><span>{tr('Post-exit peak (10 sessions)')}</span><b>{pctPoint(row.post_exit_peak_10d_pct)}</b></div>
  </div>
}

function ScatterTooltip({ active, payload }) {
  if (!active || !payload?.length) return null
  const row = payload[0]?.payload
  if (!row) return null
  return <div className="analytics-performance-tooltip">
    <strong>{row.asset} · {tr('Operation')} {row.operation}</strong>
    <div><span>{tr('Peak capture')}</span><b>{pctPoint(row.peak_capture_pct)}</b></div>
    <div><span>{tr('Post-exit peak (10 sessions)')}</span><b>{pctPoint(row.post_exit_peak_10d_pct)}</b></div>
    <div><span>{tr('Exit')}</span><b>{shortDateTime(row.exit_timestamp)}</b></div>
  </div>
}

export function PeakExitAnalysis({ data }) {
  const analysis = data?.peak_exit_analysis || {}
  const summary = analysis?.summary || {}
  const byAsset = useMemo(
    () => (Array.isArray(analysis?.by_asset) ? analysis.by_asset : []),
    [analysis?.by_asset],
  )
  const trades = useMemo(
    () => (Array.isArray(analysis?.trades) ? analysis.trades : []),
    [analysis?.trades],
  )
  const [selectedAsset, setSelectedAsset] = useState('')

  useEffect(() => {
    if (!byAsset.length) {
      setSelectedAsset('')
      return
    }
    if (!byAsset.some((row) => row.asset === selectedAsset)) {
      setSelectedAsset(String(byAsset[0].asset || ''))
    }
  }, [byAsset, selectedAsset])

  const overviewRows = useMemo(
    () => byAsset
      .slice()
      .sort((left, right) => Number(right.closed_positions || 0) - Number(left.closed_positions || 0))
      .slice(0, 12),
    [byAsset],
  )

  const assetTrades = useMemo(() => trades
    .filter((row) => String(row.asset || '') === selectedAsset)
    .slice()
    .sort((left, right) => String(left.exit_timestamp || '').localeCompare(String(right.exit_timestamp || '')))
    .map((row, index) => ({
      ...row,
      operation: index + 1,
    })), [selectedAsset, trades])

  const scatterRows = useMemo(() => assetTrades.filter((row) => (
    Number.isFinite(Number(row.peak_capture_pct))
    && Number.isFinite(Number(row.post_exit_peak_10d_pct))
  )), [assetTrades])

  const hasDiagnostics = Number(analysis?.schema_version || 0) >= 1 && trades.length > 0

  return <section className="analytics-workspace-section peak-exit-analysis-section">
    <SectionHeading
      kicker={tr('EXIT QUALITY')}
      title={tr('Peak proximity and exit timing')}
      description={tr('How close each exit was to the best observable price while the position was actually held.')}
      hintId="analytics-peak-exit-hint"
      hint={{
        description: tr('The peak is frozen from the same OHLC data used by the backtest. A normal sell executes at the session open, so that session intraday high is not used as a held-position peak.'),
        details: [
          { label: tr('Distance from peak'), value: tr('0% means the exit was at or above the best held-period price.') },
          { label: tr('Peak capture'), value: tr('Share of the intraposition price run-up captured by the exit, bounded from 0% to 100%.') },
          { label: tr('Post-exit peak'), value: tr('Maximum price move after the exit over a complete 5, 10 or 20-session window.') },
        ],
      }}
      action={hasDiagnostics ? <label className="peak-exit-asset-select">
        <span>{tr('Asset')}</span>
        <select value={selectedAsset} onChange={(event) => setSelectedAsset(event.target.value)}>
          {byAsset.map((row) => <option key={row.asset} value={row.asset}>
            {row.asset} · {number(row.closed_positions, 0)}
          </option>)}
        </select>
      </label> : null}
    />

    {!hasDiagnostics ? <ChartEmpty>
      {tr('Peak-exit diagnostics are available for backtests executed with API 10.8.63 or later.')}
    </ChartEmpty> : <>
      <div className="peak-exit-summary-grid">
        <AnalyticsMetric
          label="Median distance from peak"
          value={pctPoint(summary.median_exit_distance_from_peak_pct)}
          note="Across closed positions"
          description="Lower values mean exits occurred closer to the best observable held-period price."
        />
        <AnalyticsMetric
          label="Median peak capture"
          value={pctPoint(summary.median_peak_capture_pct)}
          note="Across closed positions"
          description="Share of the intraposition upside captured at exit."
        />
        <AnalyticsMetric
          label="Median max run-up"
          value={pctPoint(summary.median_max_runup_pct)}
          note="Before exit"
          description="Best price appreciation reached while the position was open."
        />
        <AnalyticsMetric
          label="Median sessions after peak"
          value={number(summary.median_days_from_peak_to_exit, 1)}
          note="Trading sessions"
          description="Number of market sessions between the held-period peak and the exit."
        />
      </div>

      <div className="peak-exit-chart-grid">
        <ChartCell
          kicker={tr('BY ASSET')}
          title={tr('Median distance from peak by asset')}
          className="peak-exit-overview-card"
        >
          {overviewRows.length ? <div className="analytics-chart peak-exit-overview-chart">
            <AnalyticsResponsiveContainer fallbackHeight={360}>
              <BarChart data={overviewRows} margin={{ top: 8, right: 16, left: 0, bottom: 30 }}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="asset" angle={-35} textAnchor="end" interval={0} height={55} />
                <YAxis tickFormatter={(value) => `${number(value, 0)}%`} />
                <Tooltip content={<OverviewTooltip />} />
                <Bar dataKey="median_exit_distance_from_peak_pct" name={tr('Distance from peak')} fill="var(--accent)" radius={[4, 4, 0, 0]} />
              </BarChart>
            </AnalyticsResponsiveContainer>
          </div> : <ChartEmpty />}
        </ChartCell>

        <ChartCell
          kicker={tr('SELECTED ASSET')}
          title={tr('Exit distance and run-up by operation')}
        >
          {assetTrades.length ? <div className="analytics-chart peak-exit-detail-chart">
            <AnalyticsResponsiveContainer fallbackHeight={320}>
              <LineChart data={assetTrades} margin={{ top: 8, right: 16, left: 0, bottom: 8 }}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="operation" allowDecimals={false} />
                <YAxis tickFormatter={(value) => `${number(value, 0)}%`} />
                <Tooltip content={<OperationTooltip />} />
                <ReferenceLine y={0} stroke="rgba(145, 169, 198, .35)" />
                <Line type="monotone" dataKey="exit_distance_from_peak_pct" name={tr('Distance from peak')} stroke="var(--accent)" strokeWidth={2.2} dot={{ r: 2.5 }} isAnimationActive={false} />
                <Line type="monotone" dataKey="max_runup_pct" name={tr('Max run-up')} stroke="var(--positive)" strokeWidth={2} dot={false} isAnimationActive={false} />
              </LineChart>
            </AnalyticsResponsiveContainer>
          </div> : <ChartEmpty />}
        </ChartCell>

        <ChartCell
          kicker={tr('SELECTED ASSET')}
          title={tr('Peak capture vs next 10 sessions')}
        >
          {scatterRows.length ? <div className="analytics-chart peak-exit-detail-chart">
            <AnalyticsResponsiveContainer fallbackHeight={320}>
              <ScatterChart margin={{ top: 8, right: 16, left: 0, bottom: 8 }}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis
                  type="number"
                  dataKey="peak_capture_pct"
                  name={tr('Peak capture')}
                  domain={[0, 100]}
                  tickFormatter={(value) => `${number(value, 0)}%`}
                />
                <YAxis
                  type="number"
                  dataKey="post_exit_peak_10d_pct"
                  name={tr('Post-exit peak (10 sessions)')}
                  tickFormatter={(value) => `${number(value, 0)}%`}
                />
                <ZAxis range={[65, 65]} />
                <ReferenceLine x={50} stroke="rgba(145, 169, 198, .3)" strokeDasharray="3 4" />
                <Tooltip content={<ScatterTooltip />} />
                <Scatter data={scatterRows} fill="var(--accent)" isAnimationActive={false} />
              </ScatterChart>
            </AnalyticsResponsiveContainer>
          </div> : <ChartEmpty>{tr('Complete 10-session windows only.')}</ChartEmpty>}
        </ChartCell>
      </div>
    </>}
  </section>
}
