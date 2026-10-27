
import { getIntlLocale, tr } from '../../i18n/runtime'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { apiFetch } from '../../api/http'
import { API } from '../../config/env'
import { buildMonthReplay, buildYearReplay, lastRecordedRotationSessionIndex, normalizeAnnualReplay, replayChartPath, replayMonths, replayYears } from './annualReplayModel.mjs'
import { AnnualReplayHelpModal } from './AnnualReplayHelpModal.jsx'
import './annualReplay.css'

const SPEEDS = [{ text: '1', ms: 1000 }, { text: '3', ms: 333 }, { text: '10', ms: 100 }, { text: '20', ms: 50 }]
const dateLabel = (value, options = { day: '2-digit', month: 'short', year: 'numeric' }) => value
  ? new Intl.DateTimeFormat(getIntlLocale(), { ...options, timeZone: 'UTC' }).format(new Date(value + 'T12:00:00Z'))
  : '—'
const usd = (value) => value == null || !Number.isFinite(Number(value)) ? '—'
  : new Intl.NumberFormat(getIntlLocale(), { style: 'currency', currency: 'USD', maximumFractionDigits: 2 }).format(Number(value))
const pct = (value) => value == null || !Number.isFinite(value) ? '—'
  : new Intl.NumberFormat(getIntlLocale(), { style: 'percent', signDisplay: 'always', minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value)
const score = (value) => value == null || !Number.isFinite(Number(value)) ? '—'
  : new Intl.NumberFormat(getIntlLocale(), { minimumFractionDigits: 6, maximumFractionDigits: 6 }).format(Number(value))
const shortValue = (value) => new Intl.NumberFormat(getIntlLocale(), { notation: 'compact', maximumFractionDigits: 1 }).format(value)

function ScorePanel({ session, onPause }) {
  const [helpOpen, setHelpOpen] = useState(false)
  const closeHelp = useCallback(() => setHelpOpen(false), [])
  const signals = session?.scores || null
  const rotation = session?.events?.at(-1) || null
  const previous = signals?.before || rotation?.from || session?.asset || '—'
  const candidate = signals?.best || rotation?.to || '—'
  const ranked = signals?.top || []
  const min = ranked.length ? Math.min(0, ...ranked.map((entry) => entry.score)) : 0
  const max = ranked.length ? Math.max(...ranked.map((entry) => entry.score)) : 1
  return <section className="annual-replay-panel annual-replay-score-panel">
    <h3>{tr('How the model evaluated the assets')}</h3>
    <p className="annual-replay-help">{signals?.decisionDate
      ? tr('Scores from close of') + ' ' + dateLabel(signals.decisionDate)
      : tr('Individual model scores may be absent from stored Backtest analytics.')}</p>
    <div className="annual-replay-three-cards">
      <div><span>{tr('Asset before decision')}</span><strong>{previous}</strong><small>{tr('Utility')}: {score(signals?.beforeScore)}</small></div>
      <div className="annual-replay-card-accent"><span>{signals ? tr('Highest utility candidate') : tr('Asset acquired, if any')}</span><strong>{candidate}</strong><small>{tr('Utility')}: {score(signals?.bestScore)}</small></div>
      <div><span>{tr('Position at this session')}</span><strong>{session?.asset || '—'}</strong><small>{tr('Utility')}: {signals && session.asset === signals.best ? score(signals.bestScore) : signals && session.asset === signals.before ? score(signals.beforeScore) : '—'}</small></div>
    </div>
    <div className="annual-replay-help-title">
      <h4>{tr('Top five estimated utilities')} {ranked.length ? <span className="annual-replay-partial-count">({ranked.length}/5 {tr('recorded')})</span> : null}</h4>
      <button type="button" className="annual-replay-help-trigger" aria-label={tr('Explain estimated utilities and asset selection')} title={tr('Explain estimated utilities and asset selection')} aria-haspopup="dialog" onClick={() => { onPause?.(); setHelpOpen(true) }}>?</button>
    </div>
    {helpOpen ? <AnnualReplayHelpModal signals={signals} onClose={closeHelp}/> : null}
    {ranked.length ? <div className="annual-replay-score-bars">
      {ranked.map((entry) => <div className="annual-replay-score-bar" key={entry.asset}>
        <strong>{entry.asset}</strong>
        <div className="annual-replay-score-track"><span style={{ width: String(Math.max(2, Math.min(100, (entry.score - min) / Math.max(max - min, 1e-9) * 100))) + '%' }}/></div>
        <b>{score(entry.score)}</b>
      </div>)}
    </div> : <div className="annual-replay-score-unavailable">
      <strong>{tr('Ranking unavailable for this session')}</strong>
      <p>{tr('The selected historical Backtest has no stored daily candidate scores in its analytics response. The application does not invent or reconstruct them.')}</p>
    </div>}
    {signals && (signals.gap !== null || signals.margin !== null) ? <div className="annual-replay-score-comparison">
      <div><small>{tr('Candidate advantage')}</small><strong>{score(signals.gap)}</strong></div>
      <div><small>{tr('Required margin')}</small><strong>{score(signals.margin)}</strong></div>
      <div><small>{tr('Decision')}</small><strong>{signals.heldByMinimum ? tr('Minimum holding') : signals.heldByMargin ? tr('Below margin') : signals.reason ? tr(signals.reason) : '—'}</strong></div>
    </div> : null}
    {ranked.length > 0 && ranked.length < 5 ? <p className="annual-replay-help annual-replay-partial-notice">{tr('Only the candidates saved by this historical backtest are shown. Missing ranks are not inferred.')}</p> : null}
    <div className="annual-replay-reason">{rotation
      ? <>{tr('Recorded execution')}: <strong>{rotation.from} → {rotation.to}</strong> · {dateLabel(session.date)}.</>
      : <>{tr('No position change was recorded for this session.')} {signals?.reason ? tr(signals.reason) : tr('The exact decision guard is not available in the historical record.')}</>}
    </div>
  </section>
}

function CapitalPanel({ sessions, index, period, yearSessions, selectedMonth, onSelectMonth }) {
  const chart = useMemo(() => replayChartPath(sessions, index), [sessions, index])
  const current = sessions[index]
  const monthItems = useMemo(() => Array.from({ length: 12 }, (_, i) => {
    const values = yearSessions.filter((item) => Number(item.date.slice(5, 7)) === i + 1)
    const year = yearSessions[0]?.date.slice(0, 4) || '2000'
    const date = year + '-' + String(i + 1).padStart(2, '0') + '-01'
    return { label: dateLabel(date, { month: 'short' }).replace('.', ''), available: values.length > 0, count: values.reduce((total, entry) => total + entry.events.length, 0), month: i + 1 }
  }), [yearSessions])
  const min = chart.min || 0
  const max = chart.max || 0
  return <section className="annual-replay-panel annual-replay-capital-panel">
    <div className="annual-replay-panel-titleline">
      <div><h3>{tr('Accumulated capital')}</h3><p className="annual-replay-help">{tr('Historical simulated capital at market close')}</p></div>
      <strong className="annual-replay-capital-value">{usd(current.capital)}</strong>
    </div>
    <p className="annual-replay-capital-change">{tr(selectedMonth ? 'Since beginning of selected month' : 'Since beginning of selected year')}: <strong className={period?.baseline && current.capital < period.baseline ? 'negative' : 'positive'}>{period.baseline > 0 ? pct(current.capital / period.baseline - 1) : '—'}</strong></p>
    {selectedMonth ? <div className="annual-replay-month-capital-summary">
      <div><span>{tr('Capital at month start')}</span><strong>{usd(period.baseline)}</strong></div>
      <div><span>{tr('Capital at month end')}</span><strong>{usd(period.lastCapital)}</strong></div>
      <div><span>{tr('Month capital change')}</span><strong className={period.change == null ? '' : period.change >= 0 ? 'positive' : 'negative'}>{pct(period.change)}</strong></div>
    </div> : null}
    <svg className="annual-replay-capital-chart" viewBox="0 0 880 215" aria-label={tr('Animated capital curve')} role="img">
      {[0, 1, 2, 3].map((row) => <g key={row}>
        <line x1="96" x2="864" y1={16 + row * 54} y2={16 + row * 54} className="annual-replay-gridline"/>
        <text className="annual-replay-axis-label" x="88" y={20 + row * 54} textAnchor="end">{shortValue(max - (max - min) * row / 3)}</text>
      </g>)}
      <g transform="translate(88,0) scale(0.89,1)">
        <path d={chart.path} fill="none" stroke="var(--positive)" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round"/>
        {chart.dot ? <><line className="annual-replay-cursor" x1={chart.dot.x} x2={chart.dot.x} y1="16" y2="180"/><circle cx={chart.dot.x} cy={chart.dot.y} r="6" fill="var(--positive)" stroke="var(--panel)" strokeWidth="2"/></> : null}
      </g>
    </svg>
    <div className="annual-replay-curve-footer"><span>{tr('Capital up to current session')}</span><span>{index + 1} / {sessions.length} {tr('sessions')}</span></div>
    <p className="annual-replay-help">{tr('Select a month to view only its daily capital and recorded rotations. Select it again to return to the full year.')}</p>
    <div className="annual-replay-month-picker">
      {monthItems.map((m) => <button type="button" key={m.month} className={selectedMonth === String(m.month) ? 'active' : ''} aria-pressed={selectedMonth === String(m.month)} disabled={!m.available} onClick={() => onSelectMonth(selectedMonth === String(m.month) ? '' : String(m.month))}>
        <span>{m.label}</span><strong>{m.count}</strong><small>{tr('rotations')}</small>
      </button>)}
    </div>
  </section>
}

export function AnnualReplayPage({ capabilities = {}, onSessionExpired }) {
  const [jobs, setJobs] = useState([])
  const [jobId, setJobId] = useState('')
  const [listLoading, setListLoading] = useState(true)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [analytics, setAnalytics] = useState(null)
  const [year, setYear] = useState('')
  const [month, setMonth] = useState('')
  const [index, setIndex] = useState(0)
  const [playing, setPlaying] = useState(false)
  const [speed, setSpeed] = useState(333)
  const canView = capabilities?.['annual_replay.view'] === true || capabilities?.['backtest.view'] === true

  useEffect(() => {
    if (!canView) return undefined
    let active = true
    setListLoading(true)
    apiFetch(API + '/analytics/backtests?limit=500').then((result) => {
      if (!active) return
      const items = Array.isArray(result?.items) ? result.items.filter((item) => item?.id) : []
      setJobs(items)
      setJobId((old) => items.some((item) => item.id === old) ? old : (items[0]?.id || ''))
    }).catch((reason) => {
      if (!active) return
      if (reason?.status === 401) onSessionExpired?.()
      setError(reason?.message || tr('Unable to load backtests'))
    }).finally(() => { if (active) setListLoading(false) })
    return () => { active = false }
  }, [canView, onSessionExpired])

  useEffect(() => {
    if (!canView || !jobId) { setAnalytics(null); return undefined }
    let active = true
    setLoading(true)
    setError('')
    setPlaying(false)
    setAnalytics(null)
    apiFetch(API + '/analytics/backtests/' + encodeURIComponent(jobId)).then((payload) => {
      if (!active) return
      const normalized = normalizeAnnualReplay(payload)
      const years = replayYears(normalized)
      setAnalytics(normalized)
      setYear(years.length ? String(years[0]) : '')
      setMonth('')
      setIndex(0)
    }).catch((reason) => {
      if (!active) return
      if (reason?.status === 401) onSessionExpired?.()
      setError(reason?.message || tr('Unable to load replay data'))
    }).finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [jobId, canView, onSessionExpired])

  const years = useMemo(() => analytics ? replayYears(analytics) : [], [analytics])
  const annual = useMemo(() => analytics && year ? buildYearReplay(analytics, year) : null, [analytics, year])
  const months = useMemo(() => replayMonths(annual), [annual])
  const period = useMemo(() => !annual ? null : month ? buildMonthReplay(annual, month) : annual, [annual, month])
  const sessions = period?.sessions || []
  const safeIndex = Math.min(index, Math.max(0, sessions.length - 1))
  const current = sessions[safeIndex] || null
  const events = useMemo(() => sessions.flatMap((row, i) => row.events.map((evt) => ({ ...evt, capital: row.capital, sessionIndex: i }))), [sessions])
  const displayedEvents = useMemo(() => (month ? events : events.filter((evt) => evt.sessionIndex <= safeIndex)).slice().reverse(), [events, safeIndex, month])
  const candidateCounts = [...new Set(sessions.map((row) => row.scores?.candidateCount).filter((value) => Number.isInteger(value) && value > 0))]
  const candidateCount = candidateCounts.length === 1 ? candidateCounts[0] : null
  const selectedEvent = current?.events?.at(-1) || null
  const finalRotationIndex = useMemo(() => lastRecordedRotationSessionIndex(sessions), [sessions])

  useEffect(() => {
    if (!playing || sessions.length < 2) return undefined
    const timer = window.setInterval(() => setIndex((old) => {
      if (old >= sessions.length - 1) { setPlaying(false); return old }
      return old + 1
    }), speed)
    return () => window.clearInterval(timer)
  }, [playing, sessions.length, speed])

  const seek = useCallback((value) => { setPlaying(false); setIndex(Math.max(0, Math.min(sessions.length - 1, value))) }, [sessions.length])
  const seekTrade = (backward) => {
    const found = backward
      ? [...events].reverse().find((evt) => evt.sessionIndex < safeIndex)
      : events.find((evt) => evt.sessionIndex > safeIndex)
    if (found) seek(found.sessionIndex)
  }
  const changeYear = (value) => { setYear(value); setMonth(''); setIndex(0); setPlaying(false) }
  const changeMonth = (value) => { setMonth(value); setIndex(0); setPlaying(false) }
  if (!canView) return null
  return <div className="annual-replay-page">
    <header className="annual-replay-heading">
      <div className="annual-replay-heading-top">
        <span className="panel-kicker">{tr('Backtest playback')}</span>
        <span className="annual-replay-tag">{tr('Recorded history · read-only')}</span>
      </div>
      <div className="annual-replay-final-capital" aria-label={tr('Final capital of selected backtest')}>
        <span>{tr('Final capital of selected backtest')}</span>
        <strong>{usd(analytics?.finalCapital)}</strong>
        <small>{tr('Full backtest · not the capital at the played session')}</small>
      </div>
      <div className="annual-replay-heading-copy">
        <h2>{tr('One year of capital rotations')}</h2>
        <p>{tr('Watch the saved trades and capital evolve session by session, as in the interactive example.')}</p>
      </div>
    </header>
    <div className="annual-replay-selectors">
      <label>{tr('Completed backtest')}<select value={jobId} disabled={!jobs.length || listLoading} onChange={(e) => setJobId(e.target.value)}>
        {jobs.map((item) => <option value={item.id} key={item.id}>{item.id} · {String(item.created_at || '').slice(0, 10)}</option>)}
      </select></label>
      <label>{tr('Year')}<select disabled={!years.length || loading} value={year} onChange={(e) => changeYear(e.target.value)}>
        {years.map((item) => <option key={item} value={item}>{item}</option>)}
      </select></label>
      <label>{tr('Month')}<select disabled={!months.length || loading} value={month} onChange={(e) => changeMonth(e.target.value)}>
        <option value="">{tr('Full year')}</option>
        {months.map((item) => <option value={String(item)} key={item}>{dateLabel(year + '-' + String(item).padStart(2, '0') + '-01', { month: 'long' })}</option>)}
      </select></label>
    </div>
    {error ? <div className="annual-replay-message error" role="alert">{error}</div> : null}
    {listLoading || loading ? <div className="annual-replay-message" role="status">{tr('Loading historical sessions…')}</div> : null}
    {!listLoading && !jobs.length && !error ? <div className="annual-replay-message">{tr('No completed backtests are available.')}</div> : null}
    {!listLoading && !loading && jobId && !sessions.length && !error ? <div className="annual-replay-message">{tr('This backtest has no saved daily equity history to animate.')}</div> : null}
    {current ? <>
      <div className="annual-replay-stats" aria-label={tr(month ? 'Month summary' : 'Year summary')}>
        <article><strong>{sessions.length}</strong><span>{tr(month ? 'Trading sessions in month' : 'Trading sessions')}</span></article>
        <article><strong>{events.length}</strong><span>{tr('Position rotations')}</span></article>
        <article><strong>{candidateCount ?? '—'}</strong><span>{tr('Assets with recorded utility scores')}</span></article>
        <article><strong className={period.change == null ? '' : period.change >= 0 ? 'positive' : 'negative'}>{pct(period.change)}</strong><span>{tr(month ? 'Historical return for selected month' : 'Historical return for selected year')}</span></article>
      </div>
      <section className="annual-replay-panel annual-replay-playback">
        <div className="annual-replay-panel-titleline"><div><h3>{tr('Animation controls')}</h3>
          <p className="annual-replay-help">{tr('Every step is a recorded execution session, not a newly generated trading signal.')}</p></div>
          <strong>{dateLabel(current.date)}</strong>
        </div>
        <div className="annual-replay-buttons">
          <button className="annual-replay-primary" type="button" onClick={() => {
            if (playing) { setPlaying(false); return }
            if (safeIndex >= sessions.length - 1) setIndex(0)
            setPlaying(true)
          }}>{playing ? 'Ⅱ ' + tr('Pause') : '▶ ' + tr('Play')}</button>
          <button type="button" disabled={safeIndex === 0} onClick={() => seek(safeIndex - 1)}>← {tr('Previous')}</button>
          <button type="button" disabled={safeIndex >= sessions.length - 1} onClick={() => seek(safeIndex + 1)}>{tr('Next')} →</button>
          <button type="button" disabled={!events.some((e) => e.sessionIndex < safeIndex)} onClick={() => seekTrade(true)}>⇤ {tr('Previous rotation')}</button>
          <button type="button" disabled={!events.some((e) => e.sessionIndex > safeIndex)} onClick={() => seekTrade(false)}>{tr('Next rotation')} ⇥</button>
          <button type="button" disabled={finalRotationIndex < 0 || safeIndex === finalRotationIndex} onClick={() => seek(finalRotationIndex)}>{tr('Last rotation')} ⇥</button>
          <button type="button" disabled={safeIndex >= sessions.length - 1} onClick={() => seek(sessions.length - 1)}>{tr('Last trading session')} ⇥</button>
          <label>{tr('Speed')}<select value={speed} onChange={(e) => setSpeed(Number(e.target.value))}>{SPEEDS.map((item) => <option value={item.ms} key={item.ms}>{item.text} {tr('sessions/s')}</option>)}</select></label>
        </div>
        {finalRotationIndex >= 0 && safeIndex >= finalRotationIndex && safeIndex < sessions.length - 1 ? <p className="annual-replay-help">{tr('The final recorded rotation was on {date}. {count} sessions remain until {end}.', { date: dateLabel(sessions[finalRotationIndex].date), count: sessions.length - 1 - safeIndex, end: dateLabel(sessions[sessions.length - 1].date) })}</p> : null}
        <div className="annual-replay-scrubber"><input type="range" aria-label={tr('Session position')} min="0" max={sessions.length - 1} value={safeIndex} onChange={(e) => seek(Number(e.target.value))}/><span>{safeIndex + 1} / {sessions.length}</span></div>
        <div className="annual-replay-track"><span style={{ width: String((safeIndex + 1) / sessions.length * 100) + '%' }}/></div>
        <div className={selectedEvent ? 'annual-replay-banner rotated' : 'annual-replay-banner'}>
          <b>{selectedEvent ? tr('ROTATION EXECUTED') : tr('NO ROTATION RECORDED')}</b>
          <strong>{selectedEvent ? selectedEvent.from + ' → ' + selectedEvent.to + ' · ' + dateLabel(current.date) : (current.asset || '—') + ' · ' + dateLabel(current.date)}</strong>
        </div>
      </section>
      <div className="annual-replay-two-column">
        <ScorePanel session={current} onPause={() => setPlaying(false)}/>
        <CapitalPanel sessions={sessions} index={safeIndex} period={period} yearSessions={annual.sessions} selectedMonth={month} onSelectMonth={changeMonth}/>
      </div>
      <section className="annual-replay-panel annual-replay-history">
        <h3>{tr(month ? 'Rotations recorded in selected month' : 'Rotations recorded up to this moment')}</h3>
        <p className="annual-replay-help">{tr('Select a recorded rotation to inspect the corresponding trading session.')}</p>
        <div className="annual-replay-history-list">
          {displayedEvents.length ? displayedEvents.slice(0, month ? displayedEvents.length : 12).map((evt, i) => <button key={evt.timestamp + ':' + i} type="button" onClick={() => seek(evt.sessionIndex)}>
            <span>{dateLabel(evt.date)}</span>
            <strong>{evt.from} <i>→</i> {evt.to}</strong>
            <span className="annual-replay-history-capital">{tr('Capital at close')}: <b>{usd(evt.capital)}</b></span>
            {evt.realizedPnl != null ? <span className="annual-replay-history-pnl">{tr('Realized P/L')}: <b className={evt.realizedPnl >= 0 ? 'positive' : 'negative'}>{usd(evt.realizedPnl)}</b></span> : null}
            {evt.fee != null ? <span className="annual-replay-history-fee">{tr('Transaction fees')}: <b>{usd(evt.fee)}</b></span> : null}
            <span className="annual-replay-history-action">{tr('View session')}</span>
          </button>) : <p>{tr(month ? 'No rotations were recorded in the selected month.' : 'No recorded rotations up to this point.')}</p>
        </div>
        {!month && displayedEvents.length > 12 ? <p className="annual-replay-help">{tr('Showing the twelve latest rotations. Navigate the timeline to inspect older events.')}</p> : null}
      </section>


    </> : null}
  </div>
}
