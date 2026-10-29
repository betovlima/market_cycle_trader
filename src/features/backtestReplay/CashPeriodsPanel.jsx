import { useMemo } from 'react'
import { getIntlLocale, tr } from '../../i18n/runtime'
import { cashPeriodsFromAnalytics } from './cashPeriodModel.mjs'

function dateLabel(timestamp) {
  const value = String(timestamp || '').slice(0, 10)
  if (!value) return '—'
  const date = new Date(value + 'T12:00:00Z')
  return Number.isFinite(date.getTime())
    ? new Intl.DateTimeFormat(getIntlLocale(), { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' }).format(date)
    : value
}

export function CashPeriodsPanel({ savedAnalytics, onInspectDate }) {
  const periods = useMemo(() => cashPeriodsFromAnalytics(savedAnalytics), [savedAnalytics])
  const observed = periods.reduce((sum, period) => sum + period.observed_cash_sessions, 0)
  return <section className="annual-replay-panel annual-replay-cash-panel" aria-label={tr('Cash exposure periods')}>
    <div className="annual-replay-panel-titleline">
      <div>
        <h3>{tr('Cash exposure periods')}</h3>
        <p className="annual-replay-help">{tr('Full historical Backtest, not only the selected year or month.')}</p>
      </div>
      <span className="annual-replay-tag">{tr('Read-only')}</span>
    </div>
    <div className="annual-replay-cash-stats">
      <div><strong>{periods.length}</strong><span>{tr('Confirmed CASH periods')}</span></div>
      <div><strong>{observed}</strong><span>{tr('Recorded sessions closing in CASH')}</span></div>
    </div>
    {periods.length ? <div className="annual-replay-cash-list">
      {periods.map((period, index) => <div className="annual-replay-cash-entry" key={period.entered_at + ':' + index}>
        <div>
          <span>{tr('First confirmed CASH close')}</span>
          <strong>{dateLabel(period.entered_at)}</strong>
          <small>{period.previous_asset ? period.previous_asset + ' → CASH' : tr('Prior position unknown')}</small>
        </div>
        <div>
          <span>{tr('First later market close')}</span>
          <strong>{period.exited_at ? dateLabel(period.exited_at) : '—'}</strong>
          <small>{period.status === 'closed'
            ? 'CASH → ' + period.next_asset
            : period.status === 'incomplete_record'
              ? tr('Incomplete rotation history')
              : tr('No subsequent market entry recorded')}</small>
        </div>
        <div>
          <span>{tr('Sessions closing in CASH')}</span>
          <strong>{period.observed_cash_sessions}</strong>
          <small>{period.first_cash_session
            ? dateLabel(period.first_cash_session) + ' – ' + dateLabel(period.last_cash_session)
            : tr('No CASH closing session observed')}</small>
        </div>
        <div className="annual-replay-cash-actions">
          {period.first_cash_session ? <button type="button" onClick={() => onInspectDate?.(period.first_cash_session)}>{tr('View CASH session')}</button> : null}
        </div>
      </div>)}
    </div> : <p className="annual-replay-help">{tr('No confirmed CASH closing session is available for this backtest. Historical positions may be missing.')}</p>}
    <p className="annual-replay-help annual-replay-cash-footnote">{tr('CASH periods use only positions saved at market close. Decision signals and rotations never substitute for missing closing positions; exit dates indicate the next recorded invested close, not execution times.')}</p>
  </section>
}
