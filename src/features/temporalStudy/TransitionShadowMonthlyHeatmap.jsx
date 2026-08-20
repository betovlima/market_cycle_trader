import { useEffect, useMemo, useState } from 'react'

import { getIntlLocale, tr } from '../../i18n/runtime'
import { money, percent, shortDateTime } from '../../shared/formatters'

function monthlyRows(replay, side = 'shadow') {
  return (replay?.monthly_returns?.[side] || []).filter((row) => row?.month)
}

function replayStats(replay, side = 'shadow') {
  return replay?.[side] || {}
}

function monthName(index) {
  return new Intl.DateTimeFormat(getIntlLocale(), { month: 'short', timeZone: 'UTC' })
    .format(new Date(Date.UTC(2024, index, 1)))
    .replace('.', '')
}

function monthTitle(month) {
  const [year, monthNumber] = String(month || '').split('-').map(Number)
  if (!year || !monthNumber) return String(month || '')
  return new Intl.DateTimeFormat(getIntlLocale(), { month: 'long', year: 'numeric', timeZone: 'UTC' })
    .format(new Date(Date.UTC(year, monthNumber - 1, 1)))
}

function monthMap(rows) {
  return new Map((rows || []).map((row) => [String(row.month), row]))
}

function monthOf(value) {
  const stamp = Date.parse(value || '')
  if (!Number.isFinite(stamp)) return null
  const date = new Date(stamp)
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`
}

function pp(value) {
  const number = Number(value)
  if (!Number.isFinite(number)) return '—'
  return `${number >= 0 ? '+' : ''}${(number * 100).toFixed(2)} pp`
}

function monthValue(row, deltaMode) {
  if (!row) return null
  const value = Number(deltaMode ? row.delta : row.return)
  return Number.isFinite(value) ? value : null
}

function seriesModel(interventionResult, confidenceResult) {
  const calibrated = confidenceResult?.walk_forward_calibrated_shadow || null
  const walkForward = interventionResult?.walk_forward_selected_shadow || null
  const oneSession = interventionResult?.one_session_all_oos_shadow || null
  const longShadow = interventionResult?.legacy_long_shadow_reference || null
  const controlReplay = calibrated || walkForward || oneSession || longShadow
  const control = monthlyRows(controlReplay, 'baseline')
  const controlMap = monthMap(control)
  const rowsFor = (replay) => monthlyRows(replay, 'shadow')
  const primary = calibrated || walkForward
  const delta = rowsFor(primary).map((row) => ({
    ...row,
    control_return: controlMap.get(String(row.month))?.return ?? null,
    delta: row.return == null || controlMap.get(String(row.month))?.return == null
      ? null
      : Number(row.return) - Number(controlMap.get(String(row.month)).return),
  }))
  const options = [
    calibrated ? { key: 'calibrated', label: tr('Confidence calibrated'), rows: rowsFor(calibrated), replay: calibrated, side: 'shadow' } : null,
    { key: 'walk_forward', label: tr('Walk-forward intervention'), rows: rowsFor(walkForward), replay: walkForward, side: 'shadow' },
    { key: 'control', label: tr('Control'), rows: control, replay: controlReplay, side: 'baseline' },
    { key: 'one_session', label: tr('One-session shadow'), rows: rowsFor(oneSession), replay: oneSession, side: 'shadow' },
    { key: 'long_shadow', label: tr('Long research shadow'), rows: rowsFor(longShadow), replay: longShadow, side: 'shadow' },
    { key: 'delta', label: tr('Delta vs Control'), rows: delta, replay: primary, side: 'shadow', deltaMode: true },
  ].filter((item) => Array.isArray(item?.rows) && item.rows.length)
  return { options, controlMap }
}

function MonthlyDialog({ detail, onClose }) {
  if (!detail) return null
  return <div className="transition-shadow-month-dialog-backdrop" role="presentation" onMouseDown={onClose}>
    <section className="transition-shadow-month-dialog" role="dialog" aria-modal="true" onMouseDown={(event) => event.stopPropagation()}>
      <header>
        <div><span className="panel-kicker">{tr('SHADOW MONTH')}</span><h3>{monthTitle(detail.month)}</h3></div>
        <button type="button" onClick={onClose} aria-label={tr('Close')}>×</button>
      </header>
      <div className="winner-risk-metrics transition-shadow-month-metrics">
        <div className="winner-risk-metric"><span>{detail.label}</span><strong className={Number(detail.return || 0) >= 0 ? 'positive' : 'negative'}>{detail.return == null ? '—' : (detail.deltaMode ? pp(detail.return) : percent(detail.return, 2))}</strong></div>
        <div className="winner-risk-metric"><span>{tr('Control')}</span><strong className={Number(detail.controlReturn || 0) >= 0 ? 'positive' : 'negative'}>{detail.controlReturn == null ? '—' : percent(detail.controlReturn, 2)}</strong></div>
        <div className="winner-risk-metric"><span>{tr('Delta vs Control')}</span><strong className={Number(detail.delta || 0) >= 0 ? 'positive' : 'negative'}>{detail.delta == null ? '—' : pp(detail.delta)}</strong></div>
        <div className="winner-risk-metric"><span>{tr('Month end capital')}</span><strong>{money(detail.endValue)}</strong></div>
      </div>
      <div className="transition-shadow-month-detail-row"><span>{tr('Interventions in month')}</span><strong>{detail.effects.length}</strong></div>
      {detail.effects.length ? <div className="temporal-table-shell winner-risk-table-shell"><table className="temporal-table winner-risk-table transition-shadow-month-table">
        <thead><tr><th>{tr('Executed')}</th><th>{tr('Transition')}</th><th>{tr('Risk')}</th><th>{tr('Capital factor')}</th></tr></thead>
        <tbody>{detail.effects.map((effect, index) => <tr key={`${effect.transition_key || effect.execution_at}-${index}`}>
          <td>{shortDateTime(effect.execution_at)}</td><td>{effect.from_asset || '—'} → {effect.to_asset || '—'}</td><td>{effect.risk_score == null ? '—' : Number(effect.risk_score).toFixed(3)}</td><td>{effect.capital_factor == null ? '—' : Number(effect.capital_factor).toFixed(4)}</td>
        </tr>)}</tbody>
      </table></div> : null}
    </section>
  </div>
}

export function TransitionShadowMonthlyHeatmap({ interventionResult, confidenceResult = null }) {
  const model = useMemo(() => seriesModel(interventionResult, confidenceResult), [confidenceResult, interventionResult])
  const preferredDefaultKey = confidenceResult?.walk_forward_calibrated_shadow ? 'calibrated' : 'walk_forward'
  const defaultKey = model.options.some((item) => item.key === preferredDefaultKey)
    ? preferredDefaultKey
    : (model.options[0]?.key || '')
  const [seriesKey, setSeriesKey] = useState(defaultKey)
  const [selectedMonth, setSelectedMonth] = useState(null)

  useEffect(() => {
    if (!model.options.some((item) => item.key === seriesKey)) setSeriesKey(defaultKey)
  }, [defaultKey, model.options, seriesKey])

  useEffect(() => {
    if (confidenceResult?.id && model.options.some((item) => item.key === 'calibrated')) setSeriesKey('calibrated')
  }, [confidenceResult?.id, model.options])

  const selected = model.options.find((item) => item.key === seriesKey) || model.options[0]
  const rows = selected?.rows || []
  const byMonth = useMemo(() => monthMap(rows), [rows])
  const years = useMemo(() => [...new Set(rows.map((row) => String(row.month).slice(0, 4)))].sort(), [rows])
  const maximum = useMemo(() => Math.max(.01, ...rows.map((row) => Math.abs(monthValue(row, selected?.deltaMode))).filter(Number.isFinite)), [rows, selected?.deltaMode])
  const effects = selected?.key === 'control' ? [] : (selected?.replay?.effects || [])
  const stats = replayStats(selected?.replay, selected?.side)
  const worst = stats?.worst_month || null

  if (!selected || !years.length) return null

  function openMonth(month) {
    const row = byMonth.get(month)
    if (!row) return
    const control = model.controlMap.get(month)
    const currentReturn = selected.deltaMode ? (row.return ?? null) : (row.return ?? null)
    const delta = row.delta ?? (currentReturn == null || control?.return == null ? null : Number(currentReturn) - Number(control.return))
    setSelectedMonth({
      month,
      label: selected.label,
      return: selected.deltaMode ? (row.delta ?? null) : currentReturn,
      deltaMode: Boolean(selected.deltaMode),
      controlReturn: control?.return ?? null,
      delta,
      endValue: row.end_value,
      effects: effects.filter((effect) => monthOf(effect.execution_at) === month),
    })
  }

  return <>
    <article className="transition-shadow-monthly-heatmap-panel">
      <div className="transition-shadow-monthly-heading">
        <div><span className="panel-kicker">{tr('MONTHLY RESULT')}</span><h4>{tr('Transition result monthly heatmap')}</h4></div>
        <label><span>{tr('Result series')}</span><select value={seriesKey} onChange={(event) => setSeriesKey(event.target.value)}>{model.options.map((item) => <option key={item.key} value={item.key}>{item.label}</option>)}</select></label>
      </div>
      <div className="winner-risk-metrics transition-shadow-monthly-summary">
        <div className="winner-risk-metric"><span>{tr('Displayed series')}</span><strong>{selected.label}</strong></div>
        <div className="winner-risk-metric"><span>{tr('Ending capital')}</span><strong>{selected.deltaMode ? '—' : money(stats?.ending_capital)}</strong></div>
        <div className="winner-risk-metric"><span>{tr('Max drawdown')}</span><strong>{selected.deltaMode || stats?.maximum_drawdown == null ? '—' : percent(stats.maximum_drawdown, 2)}</strong></div>
        <div className="winner-risk-metric"><span>{tr('Worst month')}</span><strong>{selected.deltaMode || !worst ? '—' : `${worst.month} · ${percent(worst.return, 2)}`}</strong></div>
      </div>
      <div className="transition-shadow-monthly-scroll">
        <div className="transition-shadow-monthly-grid" style={{ '--shadow-year-count': years.length }} role="grid">
          <div className="transition-shadow-monthly-corner" />
          {years.map((year) => <strong className="transition-shadow-monthly-year" key={year}>{year}</strong>)}
          {Array.from({ length: 12 }, (_, monthIndex) => <div className="transition-shadow-monthly-grid-row" key={monthIndex}>
            <strong className="transition-shadow-monthly-month">{monthName(monthIndex)}</strong>
            {years.map((year) => {
              const key = `${year}-${String(monthIndex + 1).padStart(2, '0')}`
              const row = byMonth.get(key)
              const value = monthValue(row, selected.deltaMode)
              if (value == null) return <span className="transition-shadow-monthly-cell empty" key={key}>—</span>
              const alpha = .14 + Math.min(1, Math.abs(value) / maximum) * .68
              const tone = value > 0 ? 'positive' : value < 0 ? 'negative' : 'flat'
              return <button type="button" className={`transition-shadow-monthly-cell ${tone}`} style={{ '--shadow-heat-alpha': alpha }} key={key} onClick={() => openMonth(key)}>{selected.deltaMode ? pp(value) : percent(value, 1)}</button>
            })}
          </div>)}
        </div>
      </div>
      <div className="transition-shadow-monthly-footer">{tr('Click a month to compare it with Control and inspect interventions.')}</div>
    </article>
    <MonthlyDialog detail={selectedMonth} onClose={() => setSelectedMonth(null)} />
  </>
}
