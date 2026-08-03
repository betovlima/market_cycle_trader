import { useMemo, useRef } from 'react'
import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'

import {
  ArrowLeftIcon,
  CalendarIcon,
  ClockIcon,
  DownloadIcon,
  InfoIcon,
  TagIcon,
} from '../../../shared/components/Icons'
import { durationLabel, money, percent, shortDate, shortDateTime } from '../../../shared/formatters'

function MetricCard({ label, value, tone = '', icon = null }) {
  return (
    <article className={`detail-metric-card ${tone}`}>
      <div>
        <span className="detail-metric-label">{label} <InfoIcon size={13} /></span>
        <strong>{value}</strong>
      </div>
      {icon ? <div className="detail-metric-icon">{icon}</div> : null}
    </article>
  )
}

function delta(left, right, kind = 'percent') {
  if (left == null || right == null) return '—'
  const value = Number(left) - Number(right)
  if (!Number.isFinite(value)) return '—'
  if (kind === 'number') return `${value >= 0 ? '+' : ''}${value.toFixed(3)}`
  return `${value >= 0 ? '+' : ''}${(value * 100).toFixed(2)}%`
}

function downloadBlob(filename, content, type) {
  const blob = new Blob([content], { type })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  URL.revokeObjectURL(url)
}

function csvCell(value) {
  const text = value == null ? '' : String(value)
  return `"${text.replaceAll('"', '""')}"`
}

export function BacktestDetailsPage({ workspace, onBack }) {
  const { detail, loadingDetail } = workspace
  const chartRef = useRef(null)
  const metrics = detail?.metrics || {}
  const chartRows = useMemo(() => (detail?.series || []).map((row) => ({
    ...row,
    label: shortDate(row.timestamp),
  })), [detail?.series])

  if (loadingDetail) return <section className="data-panel loading-state">Loading backtest details…</section>
  if (!detail?.metrics) {
    return (
      <section className="data-panel empty-result">
        <h2>Backtest details are unavailable</h2>
        <p>Select a completed execution from the history.</p>
        <button type="button" className="secondary-action" onClick={onBack}><ArrowLeftIcon /> Back to Backtest History</button>
      </section>
    )
  }

  const operational = [
    ['Total Operations', metrics.position_changes == null ? '—' : Math.round(Number(metrics.position_changes))],
    ['Portfolio Rotations', metrics.position_changes == null ? '—' : Math.round(Number(metrics.position_changes))],
    ['Average Holding Time', metrics.average_holding_days == null ? '—' : `${Number(metrics.average_holding_days).toFixed(1)} days`],
    ['Market Exposure', percent(metrics.market_exposure)],
    ['Time in Cash', metrics.market_exposure == null ? '—' : percent(1 - Number(metrics.market_exposure))],
    ['Positive Sessions', percent(metrics.session_win_rate)],
    ['Negative Sessions', metrics.session_win_rate == null ? '—' : percent(1 - Number(metrics.session_win_rate))],
  ]

  const summaryRows = [
    ['Total Return', percent(metrics.simulation_return), percent(metrics.reference_return), delta(metrics.simulation_return, metrics.reference_return)],
    ['CAGR', percent(metrics.cagr), percent(metrics.reference_cagr), delta(metrics.cagr, metrics.reference_cagr)],
    ['Sharpe Ratio', metrics.sharpe == null ? '—' : Number(metrics.sharpe).toFixed(3), metrics.reference_sharpe == null ? '—' : Number(metrics.reference_sharpe).toFixed(3), delta(metrics.sharpe, metrics.reference_sharpe, 'number')],
    ['Max Drawdown', percent(metrics.maximum_drawdown), percent(metrics.reference_maximum_drawdown), delta(metrics.maximum_drawdown, metrics.reference_maximum_drawdown)],
    ['Exposure', percent(metrics.market_exposure), '—', '—'],
    ['Total Operations', metrics.position_changes == null ? '—' : Math.round(Number(metrics.position_changes)), '—', '—'],
  ]

  function exportPublicJson() {
    const payload = {
      id: detail.id,
      status: detail.status,
      created_at: detail.created_at,
      finished_at: detail.finished_at,
      duration_seconds: detail.duration_seconds,
      metrics,
      series: detail.series || [],
    }
    downloadBlob(`backtest-${detail.id}-public.json`, JSON.stringify(payload, null, 2), 'application/json;charset=utf-8')
  }

  function downloadSummaryCsv() {
    const rows = [['Metric', 'Simulation', 'Reference', 'Difference'], ...summaryRows]
    downloadBlob(`backtest-${detail.id}-summary.csv`, rows.map((row) => row.map(csvCell).join(',')).join('\n'), 'text/csv;charset=utf-8')
  }

  function downloadPerformanceCsv() {
    const rows = [['Timestamp', 'Simulation Equity', 'Reference Equity'], ...(detail.series || []).map((row) => [row.timestamp, row.simulation_equity, row.reference_equity])]
    downloadBlob(`backtest-${detail.id}-performance.csv`, rows.map((row) => row.map(csvCell).join(',')).join('\n'), 'text/csv;charset=utf-8')
  }

  function downloadChart() {
    const svg = chartRef.current?.querySelector('svg')
    if (!svg) return
    const cloned = svg.cloneNode(true)
    cloned.setAttribute('xmlns', 'http://www.w3.org/2000/svg')
    downloadBlob(`backtest-${detail.id}-chart.svg`, new XMLSerializer().serializeToString(cloned), 'image/svg+xml;charset=utf-8')
  }

  return (
    <section className="page-stack backtest-detail-page">
      <button type="button" className="detail-back-link" onClick={onBack}><ArrowLeftIcon size={15} /> Back to Backtest History</button>

      <div className="detail-title-block">
        <h2>Backtest Details</h2>
        <div className="detail-run-meta">
          <span className={`table-status ${detail.status}`}>{String(detail.status || 'unknown').replace('_', ' ')}</span>
          <span><CalendarIcon size={15} /> Executed on {shortDateTime(detail.created_at)}</span>
          <span><ClockIcon size={15} /> Duration {durationLabel(detail.duration_seconds)}</span>
          <span><TagIcon size={15} /> Run #{String(detail.id || '').slice(-8)}</span>
        </div>
      </div>

      <section className="detail-metrics-grid">
        <MetricCard label="Total Return" value={percent(metrics.simulation_return)} tone="green" />
        <MetricCard label="Sharpe Ratio" value={metrics.sharpe == null ? '—' : Number(metrics.sharpe).toFixed(3)} tone="green" />
        <MetricCard label="Max Drawdown" value={percent(metrics.maximum_drawdown)} tone="red" />
        <MetricCard label="CAGR" value={percent(metrics.cagr)} tone="green" />
        <MetricCard label="Final Capital" value={money(metrics.ending_capital)} />
        <MetricCard label="Reference Return" value={percent(metrics.reference_return)} tone="blue" />
      </section>

      <section className="detail-content-grid">
        <article className="data-panel detail-chart-panel" ref={chartRef}>
          <div className="panel-heading"><h2>Performance Comparison</h2><span className="detail-select">Equity Curve</span></div>
          <div className="detail-performance-chart">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartRows} margin={{ top: 12, right: 14, left: 6, bottom: 8 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="label" minTickGap={42} />
                <YAxis tickFormatter={(value) => money(value).replace('.00', '')} width={78} />
                <Tooltip formatter={(value) => money(value)} labelFormatter={(_, payload) => payload?.[0]?.payload?.timestamp || ''} />
                <Legend />
                <Line type="monotone" dataKey="simulation_equity" name="Simulation" dot={false} strokeWidth={2.2} stroke="var(--positive)" />
                <Line type="monotone" dataKey="reference_equity" name="Reference" dot={false} strokeWidth={2} stroke="var(--accent)" />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </article>

        <article className="data-panel detail-summary-panel">
          <div className="panel-heading"><h2>Result Summary</h2></div>
          <div className="detail-summary-table">
            <div className="detail-summary-head"><span>Metric</span><span>Simulation</span><span>Reference</span><span>Difference</span></div>
            {summaryRows.map(([label, simulation, reference, difference]) => (
              <div key={label} className="detail-summary-row">
                <span>{label}</span><strong>{simulation}</strong><span>{reference}</span><span className={String(difference).startsWith('-') ? 'negative' : String(difference).startsWith('+') ? 'positive' : ''}>{difference}</span>
              </div>
            ))}
          </div>
        </article>

        <article className="data-panel detail-operational-panel">
          <div className="panel-heading"><h2>Operational Summary</h2></div>
          <dl className="detail-operational-list">
            {operational.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}
          </dl>
        </article>
      </section>

      <section className="data-panel detail-downloads">
        <div className="panel-heading"><h2>Downloads</h2></div>
        <div className="detail-download-grid">
          <button type="button" className="download-action public" onClick={exportPublicJson}><DownloadIcon /> Export Public Results</button>
          <button type="button" className="download-action" onClick={downloadSummaryCsv}><DownloadIcon /> Download Summary CSV</button>
          <button type="button" className="download-action" onClick={downloadPerformanceCsv}><DownloadIcon /> Download Performance CSV</button>
          <button type="button" className="download-action" onClick={downloadChart}><DownloadIcon /> Download Chart</button>
        </div>
      </section>
    </section>
  )
}
