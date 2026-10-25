import { getIntlLocale, tr } from '../../i18n/runtime'
import { useEffect, useMemo, useState } from 'react'
import { apiFetch } from '../../api/http'
import { API } from '../../config/env'
import { buildYearReplay, normalizeAnnualReplay, replayChartPath, replayYears } from './annualReplayModel.mjs'
import './annualReplay.css'

const SPEEDS = [0.5, 1, 2, 4]
const FRAME_MS = 330

const dateLabel = (date) => date
  ? new Intl.DateTimeFormat(getIntlLocale(), { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${date}T12:00:00Z`))
  : '—'

function usd(value) {
  if (value === null || value === undefined || !Number.isFinite(Number(value))) return '—'
  return new Intl.NumberFormat(getIntlLocale(), { style: 'currency', currency: 'USD', maximumFractionDigits: 2 }).format(Number(value))
}

function percentage(value) {
  return value == null || !Number.isFinite(value)
    ? '—'
    : new Intl.NumberFormat(getIntlLocale(), { style: 'percent', minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value)
}

function EquityReplayChart({ sessions, index }) {
  const chart = useMemo(() => replayChartPath(sessions, index), [sessions, index])
  if (!sessions.length) return null
  return <div className="annual-replay-chart-wrap">
    <svg viewBox="0 0 880 195" role="img" aria-label={tr('Historical capital progression')}>
      {[55, 105, 155].map((y) => <line key={y} className="annual-replay-gridline" x1="15" x2="865" y1={y} y2={y}/>)}
      <path d={chart.path} fill="none" stroke="var(--positive)" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round"/>
      {chart.dot ? <circle cx={chart.dot.x} cy={chart.dot.y} r="5.5" fill="var(--positive)" stroke="var(--bg)" strokeWidth="2"/> : null}
    </svg>
    <div className="annual-replay-chart-footer">
      <span>{usd(chart.min)}</span>
      <span>{tr('Capital up to selected session')}</span>
      <span>{usd(chart.max)}</span>
    </div>
  </div>
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
  const [speed, setSpeed] = useState(1)
  const canView = capabilities?.['backtest.view'] === true

  useEffect(() => {
    if (!canView) return undefined
    let active = true
    setListLoading(true)
    apiFetch(`${API}/analytics/backtests?limit=500`)
      .then((result) => {
        if (!active) return
        const items = Array.isArray(result?.items) ? result.items.filter((item) => item?.id) : []
        setJobs(items)
        setJobId((previous) => items.some((item) => item.id === previous) ? previous : (items[0]?.id || ''))
      })
      .catch((reason) => {
        if (!active) return
        if (reason?.status === 401) onSessionExpired?.()
        setError(reason?.message || tr('Unable to load backtests'))
      })
      .finally(() => { if (active) setListLoading(false) })
    return () => { active = false }
  }, [canView, onSessionExpired])

  useEffect(() => {
    if (!canView || !jobId) { setAnalytics(null); return undefined }
    let active = true
    setLoading(true)
    setError('')
    setPlaying(false)
    setAnalytics(null)
    apiFetch(`${API}/analytics/backtests/${encodeURIComponent(jobId)}`)
      .then((payload) => {
        if (!active) return
        const normalized = normalizeAnnualReplay(payload)
        setAnalytics(normalized)
        const years = replayYears(normalized)
        setYear(years.length ? String(years[0]) : '')
        setIndex(0)
      })
      .catch((reason) => {
        if (!active) return
        if (reason?.status === 401) onSessionExpired?.()
        setError(reason?.message || tr('Unable to load replay data'))
      })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [jobId, canView, onSessionExpired])

  const years = useMemo(() => analytics ? replayYears(analytics) : [], [analytics])
  const annual = useMemo(() => analytics && year ? buildYearReplay(analytics, year) : null, [analytics, year])
  const sessions = annual?.sessions || []
  const safeIndex = Math.min(index, Math.max(0, sessions.length - 1))
  const current = sessions[safeIndex] || null
  const latestEvent = useMemo(() => sessions.slice(0, safeIndex + 1).flatMap((row) => row.events).at(-1) || null, [sessions, safeIndex])
  const hasScores = false // Analytics v10.8.127 stores equity and trades, not daily utility rankings.

  useEffect(() => {
    if (!playing || sessions.length < 2) return undefined
    const timer = window.setInterval(() => {
      setIndex((previous) => {
        if (previous >= sessions.length - 1) { setPlaying(false); return previous }
        return previous + 1
      })
    }, FRAME_MS / speed)
    return () => window.clearInterval(timer)
  }, [playing, sessions.length, speed])

  const chooseYear = (value) => { setYear(value); setIndex(0); setPlaying(false) }
  const skipToNextTrade = () => {
    const next = sessions.findIndex((row, i) => i > safeIndex && row.events.length)
    setIndex(next >= 0 ? next : sessions.length - 1)
    setPlaying(false)
  }
  const event = current?.events?.at(-1) || null
  const dayChange = current?.capital != null && annual?.baseline > 0 ? current.capital / annual.baseline - 1 : null

  if (!canView) return null
  return <section className="annual-replay-page">
    <header className="annual-replay-heading">
      <div>
        <span className="panel-kicker">{tr('Backtest analytics')}</span>
        <h2>{tr('Annual Replay')}</h2>
        <p>{tr('Watch recorded capital rotations session by session. Read-only: no strategy is recalculated and no orders are sent.')}</p>
      </div>
      <span className="annual-replay-tag">{tr('Historical simulation')}</span>
    </header>

    <div className="annual-replay-controls">
      <label>{tr('Completed backtest')}
        <select aria-label={tr('Completed backtest')} value={jobId} onChange={(e) => setJobId(e.target.value)} disabled={listLoading || !jobs.length}>
          {jobs.map((item) => <option key={item.id} value={item.id}>{item.id} · {String(item.created_at || '').slice(0, 10)}</option>)}
        </select>
      </label>
      <label>{tr('Year')}
        <select aria-label={tr('Year')} value={year} onChange={(e) => chooseYear(e.target.value)} disabled={!years.length || loading}>
          {years.map((value) => <option key={value} value={value}>{value}</option>)}
        </select>
      </label>
      <label>{tr('Speed')}
        <select aria-label={tr('Speed')} value={speed} onChange={(e) => setSpeed(Number(e.target.value))} disabled={!sessions.length}>
          {SPEEDS.map((value) => <option key={value} value={value}>{value}×</option>)}
        </select>
      </label>
    </div>

    {error ? <div className="annual-replay-message error" role="alert">{tr('Unable to load replay data')}: {error}</div> : null}
    {listLoading || loading ? <div className="annual-replay-message" role="status">{tr('Loading historical sessions…')}</div> : null}
    {!listLoading && !jobs.length && !error ? <div className="annual-replay-message">{tr('No completed backtests are available.')}</div> : null}
    {!loading && !listLoading && jobId && !sessions.length && !error ? <div className="annual-replay-message">{tr('This backtest has no saved daily equity history to animate.')}</div> : null}

    {sessions.length ? <>
      <div className="annual-replay-summary">
        <article><span>{tr('Recorded sessions')}</span><strong>{sessions.length}</strong></article>
        <article><span>{tr('Executed rotations')}</span><strong>{annual.rotations.length}</strong></article>
        <article><span>{tr('Capital at start')}</span><strong>{usd(annual.baseline)}</strong></article>
        <article><span>{tr('Capital at end')}</span><strong>{usd(annual.lastCapital)}</strong></article>
        <article><span>{tr('Period return')}</span><strong className={annual.change >= 0 ? 'positive' : 'negative'}>{percentage(annual.change)}</strong></article>
      </div>

      <div className="annual-replay-stage">
        <div className="annual-replay-stage-header">
          <div>
            <span className="panel-kicker">{tr('Session')} {safeIndex + 1} / {sessions.length}</span>
            <h3>{dateLabel(current.date)}</h3>
          </div>
          <span className={event ? 'annual-replay-status rotated' : 'annual-replay-status'}>{event ? tr('EXECUTED ROTATION') : tr('NO RECORDED ROTATION')}</span>
        </div>
        <div className="annual-replay-metrics">
          <article><span>{tr('Position after this session')}</span><strong>{current.asset || '—'}</strong></article>
          <article><span>{tr('Simulated capital')}</span><strong>{usd(current.capital)}</strong></article>
          <article><span>{tr('Change since year start')}</span><strong className={dayChange != null && dayChange >= 0 ? 'positive' : 'negative'}>{percentage(dayChange)}</strong></article>
        </div>

        <div className="annual-replay-decision">
          {event ? <>
            <div className="annual-replay-swap"><span>{event.from}</span><b aria-hidden="true">→</b><span>{event.to}</span></div>
            <p>{tr('Executed rotation recorded in this backtest.')}</p>
            {event.realizedPnl !== null ? <p>{tr('Realized P/L')}: <strong>{usd(event.realizedPnl)}</strong></p> : null}
            {current.events.length > 1 ? <p>{tr('Multiple movements were recorded on this session.')}</p> : null}
          </> : <>
            <div className="annual-replay-hold">{current.asset || '—'}</div>
            <p>{tr('No change of position was recorded on this session.')}</p>
          </>}
          <small>{tr('The historical record describes execution, not an independently reconstructed decision signal.')}</small>
        </div>

        <EquityReplayChart sessions={sessions} index={safeIndex}/>
        <div className="annual-replay-player">
          <button type="button" onClick={() => { setIndex(0); setPlaying(false) }}>{tr('Restart')}</button>
          <button type="button" onClick={() => { setIndex(Math.max(0, safeIndex - 1)); setPlaying(false) }} disabled={safeIndex === 0}>{tr('Previous session')}</button>
          <button type="button" className="annual-replay-primary" onClick={() => {
            if (safeIndex >= sessions.length - 1) setIndex(0)
            setPlaying((value) => !value)
          }}>{playing ? tr('Pause') : tr('Play')}</button>
          <button type="button" onClick={() => { setIndex(Math.min(sessions.length - 1, safeIndex + 1)); setPlaying(false) }} disabled={safeIndex >= sessions.length - 1}>{tr('Next session')}</button>
          <button type="button" onClick={skipToNextTrade} disabled={!sessions.some((row, i) => i > safeIndex && row.events.length)}>{tr('Next rotation')}</button>
        </div>
        <input type="range" aria-label={tr('Session position')} min="0" max={sessions.length - 1} step="1" value={safeIndex} onChange={(e) => { setPlaying(false); setIndex(Number(e.target.value)) }} />
        <div className="annual-replay-timeline">
          <span>{dateLabel(sessions[0].date)}</span>
          <span>{Math.round((safeIndex + 1) / sessions.length * 100)}%</span>
          <span>{dateLabel(sessions[sessions.length - 1].date)}</span>
        </div>
      </div>

      <div className="annual-replay-explain">
        <div><strong>{tr('Last executed rotation')}</strong><span>{latestEvent ? `${latestEvent.from} → ${latestEvent.to} · ${dateLabel(latestEvent.date)}` : tr('No rotation yet in this replay.')}</span></div>
        <div><strong>{tr('Candidate utility scores')}</strong><span>{hasScores ? '' : tr('Not stored in the available Backtest analytics. Values are not estimated or invented.')}</span></div>
        <p>{tr('The replay uses the historical equity and executed trades saved for the selected Backtest. Past performance does not predict future returns. The initial reference is the last equity observation before this year, when available.')}</p>
      </div>
    </> : null}
  </section>
}
