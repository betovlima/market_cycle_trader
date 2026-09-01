import { useEffect, useMemo, useState } from 'react'

import { getIntlLocale, tr } from '../../i18n/runtime'
import './temporalCurrentForecast.css'

const SERIES = [
  { key: 'profit', label: 'Profit before loss', value: (row) => row?.probability_profit_before_loss },
  { key: 'trend', label: 'Trend persistence', value: (row) => row?.probability_trend_persistence },
  { key: 'bottom', label: 'Bottom probability', value: (row) => row?.probability_bottom },
  { key: 'top', label: 'Top probability', value: (row) => row?.probability_top },
]

function finite(value) {
  const number = Number(value)
  return Number.isFinite(number) ? number : null
}

function probability(value) {
  const number = finite(value)
  return number == null ? '—' : `${(number * 100).toFixed(1)}%`
}

function dateLabel(value) {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return String(value)
  return new Intl.DateTimeFormat(getIntlLocale(), { dateStyle: 'medium', timeZone: 'UTC' }).format(date)
}

function linePath(points) {
  const valid = points.filter((point) => point.value != null)
  return valid.map((point, index) => `${index ? 'L' : 'M'} ${point.x.toFixed(1)} ${point.y.toFixed(1)}`).join(' ')
}

function ForecastChart({ horizons, rowsByHorizon, visible }) {
  const width = 760
  const height = 270
  const left = 58
  const right = 24
  const top = 22
  const bottom = 44
  const plotWidth = width - left - right
  const plotHeight = height - top - bottom
  const xFor = (index) => left + (horizons.length <= 1 ? plotWidth / 2 : index * plotWidth / (horizons.length - 1))
  const yFor = (value) => top + (1 - Math.max(0, Math.min(1, value))) * plotHeight

  return <div className="temporal-current-forecast-chart-wrap">
    <svg className="temporal-current-forecast-chart" viewBox={`0 0 ${width} ${height}`} role="img" aria-label={tr('Current forecast probabilities by horizon')}>
      {[0, 0.25, 0.5, 0.75, 1].map((value) => {
        const y = yFor(value)
        return <g key={value}>
          <line className="temporal-forecast-grid-line" x1={left} x2={width - right} y1={y} y2={y} />
          <text className="temporal-forecast-axis-label" x={left - 10} y={y + 4} textAnchor="end">{Math.round(value * 100)}%</text>
        </g>
      })}
      {horizons.map((horizon, index) => <g key={horizon}>
        <line className="temporal-forecast-grid-line vertical" x1={xFor(index)} x2={xFor(index)} y1={top} y2={top + plotHeight} />
        <text className="temporal-forecast-horizon-label" x={xFor(index)} y={height - 14} textAnchor="middle">{horizon}d</text>
      </g>)}
      {SERIES.filter((series) => visible[series.key]).map((series) => {
        const points = horizons.map((horizon, index) => {
          const value = finite(series.value(rowsByHorizon.get(horizon)))
          return { horizon, value, x: xFor(index), y: value == null ? null : yFor(value) }
        })
        const path = linePath(points)
        return <g className={`temporal-forecast-series ${series.key}`} key={series.key}>
          {path ? <path d={path} fill="none" /> : null}
          {points.filter((point) => point.value != null).map((point) => <g key={point.horizon}>
            <circle cx={point.x} cy={point.y} r="4.5" />
            <title>{`${tr(series.label)} · ${point.horizon}d · ${probability(point.value)}`}</title>
          </g>)}
        </g>
      })}
    </svg>
  </div>
}

export function TemporalCurrentForecastPanel({ run }) {
  const result = run?.result || {}
  const latest = Array.isArray(result.latest_forecasts) ? result.latest_forecasts : []
  const multi = Array.isArray(result.multi_horizon_latest_forecasts) ? result.multi_horizon_latest_forecasts : []
  const horizons = useMemo(() => {
    const configured = (result.horizons || []).map(Number).filter(Number.isFinite)
    if (configured.length) return [...new Set(configured)].sort((a, b) => a - b)
    return [...new Set(latest.map((row) => Number(row?.horizon)).filter(Number.isFinite))].sort((a, b) => a - b)
  }, [latest, result.horizons])
  const symbols = useMemo(() => {
    const source = multi.length ? multi : latest
    return [...new Set(source.map((row) => String(row?.symbol || '').trim()).filter(Boolean))]
  }, [latest, multi])
  const defaultSymbol = useMemo(() => {
    const target = multi.find((row) => row?.shadow_target)
    return String(target?.symbol || multi[0]?.symbol || symbols[0] || '')
  }, [multi, symbols])
  const [symbol, setSymbol] = useState(defaultSymbol)
  const [visible, setVisible] = useState({ profit: true, trend: true, bottom: true, top: true })

  useEffect(() => {
    if (!symbol || !symbols.includes(symbol)) setSymbol(defaultSymbol)
  }, [defaultSymbol, symbol, symbols])

  const rowsByHorizon = useMemo(() => new Map(
    latest
      .filter((row) => String(row?.symbol || '') === symbol)
      .map((row) => [Number(row.horizon), row]),
  ), [latest, symbol])
  const multiRow = multi.find((row) => String(row?.symbol || '') === symbol) || null
  const asOf = horizons.map((horizon) => rowsByHorizon.get(horizon)?.as_of).find(Boolean) || multiRow?.as_of || result.latest_as_of

  if (!latest.length || !horizons.length || !symbols.length) return null

  function toggleSeries(key) {
    setVisible((current) => ({ ...current, [key]: !current[key] }))
  }

  return <section className="temporal-current-forecast-panel">
    <div className="temporal-current-forecast-heading">
      <div>
        <span className="panel-kicker">{tr('CURRENT FORECAST')}</span>
        <h3>{tr('Current Temporal Forecast')}</h3>
        <p>{tr('Forecast generated from the latest analyzed close. Each horizon starts at the next-session open.')}</p>
      </div>
      <label className="temporal-current-forecast-asset">
        <span>{tr('Asset')}</span>
        <select value={symbol} onChange={(event) => setSymbol(event.target.value)}>
          {symbols.map((item) => <option value={item} key={item}>{item}</option>)}
        </select>
      </label>
    </div>

    <div className="temporal-current-forecast-meta">
      <span>{tr('As of')} <strong>{dateLabel(asOf)}</strong></span>
      {multiRow ? <span>{tr('Current rank score')} <strong>{probability(multiRow.asset_rank_score)}</strong></span> : null}
      {multiRow ? <span>{tr('Horizon agreement')} <strong>{probability(multiRow.horizon_agreement)}</strong></span> : null}
    </div>

    <div className="temporal-current-forecast-legend" aria-label={tr('Forecast series')}>
      {SERIES.map((series) => <button
        type="button"
        key={series.key}
        className={`${series.key} ${visible[series.key] ? 'active' : ''}`}
        aria-pressed={visible[series.key]}
        onClick={() => toggleSeries(series.key)}
      ><i aria-hidden="true" />{tr(series.label)}</button>)}
    </div>

    <ForecastChart horizons={horizons} rowsByHorizon={rowsByHorizon} visible={visible} />

    <div className="temporal-current-forecast-grid">
      <div className="temporal-current-forecast-grid-head"><strong>{tr('Metric')}</strong>{horizons.map((horizon) => <strong key={horizon}>{horizon}d</strong>)}</div>
      <div><span>{tr('Profit before loss')}</span>{horizons.map((horizon) => <strong key={horizon}>{probability(rowsByHorizon.get(horizon)?.probability_profit_before_loss)}</strong>)}</div>
      <div><span>{tr('Trend persistence')}</span>{horizons.map((horizon) => <strong key={horizon}>{probability(rowsByHorizon.get(horizon)?.probability_trend_persistence)}</strong>)}</div>
      <div><span>{tr('Risk safety')}</span>{horizons.map((horizon) => <strong key={horizon}>{probability(multiRow?.[`risk_safety_${horizon}d`])}</strong>)}</div>
      <div><span>{tr('Expected max drawdown')}</span>{horizons.map((horizon) => <strong key={horizon}>{probability(rowsByHorizon.get(horizon)?.expected_max_drawdown)}</strong>)}</div>
    </div>
  </section>
}
