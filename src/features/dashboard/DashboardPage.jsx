import { useEffect, useState } from 'react'

import { ActivityIcon, CalendarIcon, PlayIcon, RocketIcon, ShieldIcon, TrophyIcon } from '../../shared/components/Icons'
import { durationLabel, money, percent, relativeTime, shortDateTime } from '../../shared/formatters'

function nextWholeHourTimestamp(now = new Date()) {
  const next = new Date(now)
  next.setMinutes(60, 0, 0)
  return next.getTime()
}

function secondsUntil(timestamp) {
  return Math.max(0, Math.ceil((timestamp - Date.now()) / 1000))
}

function countdownLabel(totalSeconds) {
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return [minutes, seconds].map((value) => String(value).padStart(2, '0')).join(':')
}

function nextUpdateLabel(timestamp) {
  return new Intl.DateTimeFormat(undefined, { hour: '2-digit', minute: '2-digit' }).format(new Date(timestamp))
}

function MarketUpdateClock() {
  const [nextUpdateAt, setNextUpdateAt] = useState(() => nextWholeHourTimestamp())
  const [remaining, setRemaining] = useState(() => secondsUntil(nextWholeHourTimestamp()))

  useEffect(() => {
    const timer = window.setInterval(() => {
      const seconds = secondsUntil(nextUpdateAt)
      if (seconds <= 0) {
        const next = nextWholeHourTimestamp()
        setNextUpdateAt(next)
        setRemaining(secondsUntil(next))
        return
      }
      setRemaining(seconds)
    }, 1000)

    return () => window.clearInterval(timer)
  }, [nextUpdateAt])

  const progress = Math.max(0, Math.min(1, remaining / 3600))

  return (
    <article className="summary-card market-update-card" aria-label={`Next market update in ${countdownLabel(remaining)}`}>
      <div
        className="market-update-dial"
        style={{ '--clock-progress': `${progress * 360}deg` }}
        aria-hidden="true"
      >
        <span>{countdownLabel(remaining)}</span>
      </div>
      <div>
        <span>Next Market Update</span>
        <strong>{countdownLabel(remaining)}</strong>
        <small>Scheduled for {nextUpdateLabel(nextUpdateAt)}</small>
      </div>
    </article>
  )
}

function SummaryCard({ icon, label, value, note, tone = 'blue' }) {
  return (
    <article className="summary-card">
      <div className={`summary-icon ${tone}`}>{icon}</div>
      <div>
        <span>{label}</span>
        <strong>{value}</strong>
        <small>{note}</small>
      </div>
    </article>
  )
}

function StatusBadge({ status }) {
  return <span className={`table-status ${status || 'unknown'}`}>{String(status || 'unknown').replace('_', ' ')}</span>
}

export function DashboardPage({ workspace, onOpenBacktest, canRunBacktest = false }) {
  const { dashboard, loadingDashboard, running, restoringExecution, startingBacktest, startDisabled, runBacktest } = workspace
  const best = dashboard?.best_performance
  const last = dashboard?.last_backtest

  async function startBacktest() {
    const created = await runBacktest()
    if (created) onOpenBacktest()
  }

  return (
    <section className="page-stack">
      <section className="hero-panel">
        <div className="hero-segment protected-segment">
          <div className="hero-icon shield"><ShieldIcon size={24} /></div>
          <div>
            <h2>Protected Configuration Active</h2>
            <p>The application executes the active server configuration without exposing private parameters.</p>
          </div>
        </div>
        {canRunBacktest ? <div className="hero-separator" /> : null}
        {canRunBacktest ? <div className="hero-segment launch-segment">
          <div className="hero-icon rocket"><RocketIcon size={24} /></div>
          <div className="hero-launch-copy">
            <h2>Start New Backtest</h2>
            <p>Execute a new historical simulation using the active protected configuration.</p>
            <button className="primary-action" type="button" disabled={startDisabled} onClick={startBacktest}>
              <PlayIcon size={15} />
              {restoringExecution ? 'Checking Execution' : startingBacktest ? 'Starting…' : running ? 'Simulation Running' : 'Start Backtest'}
            </button>
          </div>
        </div> : null}
      </section>

      <section className="summary-grid">
        <SummaryCard
          icon={<ActivityIcon size={20} />}
          label="Total Backtests"
          value={loadingDashboard ? '…' : String(dashboard?.total_backtests ?? 0)}
          note={`${dashboard?.completed_backtests ?? 0} completed`}
          tone="green"
        />
        <SummaryCard
          icon={<TrophyIcon size={20} />}
          label="Best Performance"
          value={best?.metrics?.simulation_return == null ? '—' : percent(best.metrics.simulation_return)}
          note={best?.metrics?.ending_capital == null ? 'No completed result' : `Ending capital ${money(best.metrics.ending_capital)}`}
          tone="gold"
        />
        <SummaryCard
          icon={<CalendarIcon size={20} />}
          label="Last Backtest"
          value={last?.created_at ? relativeTime(last.created_at) : '—'}
          note={last?.created_at ? shortDateTime(last.created_at) : 'No execution yet'}
          tone="blue"
        />
        <MarketUpdateClock />
      </section>

      <section className="data-panel">
        <div className="panel-heading">
          <div>
            <span className="panel-kicker">History</span>
            <h2>Recent Backtests</h2>
          </div>
          <span className="panel-count">{dashboard?.recent_backtests?.length ?? 0} records</span>
        </div>
        <div className="table-wrap">
          <table className="dashboard-table">
            <thead>
              <tr><th>Date</th><th>Status</th><th>Total Return</th><th>Sharpe Ratio</th><th>Max Drawdown</th><th>Rotations</th><th>Duration</th></tr>
            </thead>
            <tbody>
              {dashboard?.recent_backtests?.length ? dashboard.recent_backtests.map((item) => (
                <tr key={item.id}>
                  <td>{shortDateTime(item.created_at)}</td>
                  <td><StatusBadge status={item.status} /></td>
                  <td className={item.metrics?.simulation_return == null ? '' : Number(item.metrics.simulation_return) >= 0 ? 'positive' : 'negative'}>{percent(item.metrics?.simulation_return)}</td>
                  <td>{item.metrics?.sharpe == null ? '—' : Number(item.metrics.sharpe).toFixed(3)}</td>
                  <td className="negative">{percent(item.metrics?.maximum_drawdown)}</td>
                  <td>{item.metrics?.position_changes == null ? '—' : Math.round(item.metrics.position_changes)}</td>
                  <td>{durationLabel(item.duration_seconds)}</td>
                </tr>
              )) : (
                <tr><td colSpan="7" className="empty-cell">No backtests have been executed yet.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </section>
  )
}
