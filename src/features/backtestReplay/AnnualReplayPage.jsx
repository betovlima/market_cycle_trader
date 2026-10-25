
import { getIntlLocale, tr } from '../../i18n/runtime'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { apiFetch } from '../../api/http'
import { API } from '../../config/env'
import { buildYearReplay, normalizeAnnualReplay, replayChartPath, replayYears } from './annualReplayModel.mjs'
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

function ScorePanel({ session }) {
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
    <h4>{tr('Top five estimated utilities')}</h4>
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
    <div className="annual-replay-reason">{rotation
      ? <>{tr('Recorded execution')}: <strong>{rotation.from} → {rotation.to}</strong> · {dateLabel(session.date)}.</>
      : <>{tr('No position change was recorded for this session.')} {tr('The exact decision guard is not available in the historical record.')}</>}
    </div>
  </section>
}

function CapitalPanel({ sessions, index, annual, onSeek }) {
  const chart = useMemo(() => replayChartPath(sessions, index), [sessions, index])
  const current = sessions[index]
  const monthItems = useMemo(() => Array.from({ length: 12 }, (_, i) => {
    const values = sessions.filter((item) => Number(item.date.slice(5, 7)) === i + 1)
    const year = sessions[0].date.slice(0, 4)
    const date = year + '-' + String(i + 1).padStart(2, '0') + '-01'
    return { label: dateLabel(date, { month: 'short' }).replace('.', ''), start: values[0]?.date || null, count: values.length, month: i + 1 }
  }), [sessions])
  const min = chart.min || 0
  const max = chart.max || 0
  return <section className="annual-replay-panel annual-replay-capital-panel">
    <div className="annual-replay-panel-titleline">
      <div><h3>{tr('Accumulated capital')}</h3><p className="annual-replay-help">{tr('Historical simulated capital at market close')}</p></div>
      <strong className="annual-replay-capital-value">{usd(current.capital)}</strong>
    </div>
    <p className="annual-replay-capital-change">{tr('Since beginning of selected year')}: <strong className={annual?.baseline && current.capital < annual.baseline ? 'negative' : 'positive'}>{annual.baseline > 0 ? pct(current.capital / annual.baseline - 1) : '—'}</strong></p>
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
    <p className="annual-replay-help">{tr('Click a month to jump to its first available session')}</p>
    <div className="annual-replay-month-picker">
      {monthItems.map((m) => <button type="button" key={m.month} className={m.month === Number(current.date.slice(5, 7)) ? 'active' : ''} disabled={!m.start} onClick={() => onSeek(sessions.findIndex((item) => item.date === m.start))}>
        <span>{m.label}</span><strong>{m.count}</strong><small>{tr('sessions')}</small>
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
  const [index, setIndex] = useState(0)
  const [playing, setPlaying] = useState(false)
  const [speed, setSpeed] = useState(333)
  const canView = capabilities?.['backtest.view'] === true

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
  const sessions = annual?.sessions || []
  const safeIndex = Math.min(index, Math.max(0, sessions.length - 1))
  const current = sessions[safeIndex] || null
  const events = useMemo(() => sessions.flatMap((row, i) => row.events.map((evt) => ({ ...evt, sessionIndex: i }))), [sessions])
  const pastEvents = useMemo(() => events.filter((evt) => evt.sessionIndex <= safeIndex).reverse(), [events, safeIndex])
  const candidateCounts = [...new Set(sessions.map((row) => row.scores?.candidateCount).filter((value) => Number.isInteger(value) && value > 0))]
  const candidateCount = candidateCounts.length === 1 ? candidateCounts[0] : null
  const selectedEvent = current?.events?.at(-1) || null

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
  const changeYear = (value) => { setYear(value); setIndex(0); setPlaying(false) }
  if (!canView) return null
  return <div className="annual-replay-page">
    <header className="annual-replay-heading">
      <div><span className="panel-kicker">{tr('Backtest playback')}</span><h2>{tr('One year of capital rotations')}</h2>
        <p>{tr('Watch the saved trades and capital evolve session by session, as in the interactive example.')}</p></div>
      <span className="annual-replay-tag">{tr('Recorded history · read-only')}</span>
    </header>
    <div className="annual-replay-selectors">
      <label>{tr('Completed backtest')}<select value={jobId} disabled={!jobs.length || listLoading} onChange={(e) => setJobId(e.target.value)}>
        {jobs.map((item) => <option value={item.id} key={item.id}>{item.id} · {String(item.created_at || '').slice(0, 10)}</option>)}
      </select></label>
      <label>{tr('Year')}<select disabled={!years.length || loading} value={year} onChange={(e) => changeYear(e.target.value)}>
        {years.map((item) => <option key={item} value={item}>{item}</option>)}
      </select></label>
    </div>
    {error ? <div className="annual-replay-message error" role="alert">{error}</div> : null}
    {listLoading || loading ? <div className="annual-replay-message" role="status">{tr('Loading historical sessions…')}</div> : null}
    {!listLoading && !jobs.length && !error ? <div className="annual-replay-message">{tr('No completed backtests are available.')}</div> : null}
    {!listLoading && !loading && jobId && !sessions.length && !error ? <div className="annual-replay-message">{tr('This backtest has no saved daily equity history to animate.')}</div> : null}
    {current ? <>
      <div className="annual-replay-stats" aria-label={tr('Year summary')}>
        <article><strong>{sessions.length}</strong><span>{tr('Trading sessions')}</span></article>
        <article><strong>{events.length}</strong><span>{tr('Position rotations')}</span></article>
        <article><strong>{candidateCount ?? '—'}</strong><span>{tr('Assets with recorded utility scores')}</span></article>
        <article><strong className={annual.change == null ? '' : annual.change >= 0 ? 'positive' : 'negative'}>{pct(annual.change)}</strong><span>{tr('Historical return for selected year')}</span></article>
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
          <label>{tr('Speed')}<select value={speed} onChange={(e) => setSpeed(Number(e.target.value))}>{SPEEDS.map((item) => <option value={item.ms} key={item.ms}>{item.text} {tr('sessions/s')}</option>)}</select></label>
        </div>
        <div className="annual-replay-scrubber"><input type="range" aria-label={tr('Session position')} min="0" max={sessions.length - 1} value={safeIndex} onChange={(e) => seek(Number(e.target.value))}/><span>{safeIndex + 1} / {sessions.length}</span></div>
        <div className="annual-replay-track"><span style={{ width: String((safeIndex + 1) / sessions.length * 100) + '%' }}/></div>
        <div className={selectedEvent ? 'annual-replay-banner rotated' : 'annual-replay-banner'}>
          <b>{selectedEvent ? tr('ROTATION EXECUTED') : tr('NO ROTATION RECORDED')}</b>
          <strong>{selectedEvent ? selectedEvent.from + ' → ' + selectedEvent.to + ' · ' + dateLabel(current.date) : (current.asset || '—') + ' · ' + dateLabel(current.date)}</strong>
        </div>
      </section>
      <div className="annual-replay-two-column">
        <ScorePanel session={current}/>
        <CapitalPanel sessions={sessions} index={safeIndex} annual={annual} onSeek={seek}/>
      </div>
      <section className="annual-replay-panel annual-replay-history">
        <h3>{tr('Rotations recorded up to this moment')}</h3>
        <p className="annual-replay-help">{tr('Select a recorded rotation to inspect the corresponding trading session.')}</p>
        <div className="annual-replay-history-list">
          {pastEvents.length ? pastEvents.slice(0, 12).map((evt, i) => <button key={evt.timestamp + ':' + i} type="button" onClick={() => seek(evt.sessionIndex)}>
            <span>{dateLabel(evt.date)}</span><strong>{evt.from} <i>→</i> {evt.to}</strong><span>{tr('View session')}</span>
          </button>) : <p>{tr('No recorded rotations up to this point.')}</p>}
        </div>
        {pastEvents.length > 12 ? <p className="annual-replay-help">{tr('Showing the twelve latest rotations. Navigate the timeline to inspect older events.')}</p> : null}
      </section>
      <div className="annual-replay-disclaimer"><strong>{tr('How to interpret:')}</strong> {tr('The recorded executions and capital are historical. Utility scores, full candidate ranking and guard reasons are not consistently available in old Backtest records; no values are invented. Past performance does not predict future returns.')}</div>
      <footer className="annual-replay-footer">{tr('Source: the selected completed MCT Backtest. Replay only: no retraining, new backtest, Alpaca request or orders.')}</footer>
    </> : null}
  </div>
}
