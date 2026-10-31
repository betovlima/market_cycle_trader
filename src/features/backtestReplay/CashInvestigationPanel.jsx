import { tr } from '../../i18n/runtime'

// All fields come from the selected backtest's persisted execution records.
const date = (value) => String(value || '').slice(0, 10) || '—'
const symbol = (value) => value || '—'
const score = (value) => value == null || !Number.isFinite(Number(value))
  ? '—' : Number(value).toFixed(6)

export function CashInvestigationPanel({ coverage, episodes = [], onInspect }) {
  const total = coverage?.total_sessions
  return <section className="annual-replay-panel annual-replay-cash-audit">
    <div className="annual-replay-panel-titleline">
      <div>
        <h3>{tr('Recorded CASH investigation')}</h3>
        <p className="annual-replay-help">{tr('Cash status uses persisted effective positions, not trade signals or a reconstructed timeline.')}</p>
      </div>
      <strong>{coverage ? `${coverage.cash_sessions} / ${total}` : '—'} {tr('sessions')}</strong>
    </div>
    {!coverage || coverage.position_source === 'unavailable'
      ? <p className="annual-replay-help">{tr('Persisted positions are unavailable. CASH periods cannot be verified from rotations alone.')}</p>
      : <>
        <p className="annual-replay-help">
          {coverage.complete
            ? tr('Effective positions recorded for all historical sessions.')
            : tr('Position coverage is incomplete: {count} sessions lack verified positions.', { count: coverage.missing_sessions })}
        </p>
        {!episodes.length ? <p className="annual-replay-help">{tr('No CASH sessions were recorded in the selected backtest.')}</p> : null}
        <div className="annual-replay-cash-grid">
          {episodes.map((episode, index) => <article key={String(episode.start_at) + index} className="annual-replay-cash-episode">
            <div className="annual-replay-cash-episode-title">
              <strong>{date(episode.start_at)} · {episode.sessions} {tr('sessions')}</strong>
              <button type="button" onClick={() => onInspect(episode.start_at)}>{tr('View session')}</button>
            </div>
            <p>{tr('Recorded transition')}: <b>{symbol(episode.previous_asset)} → CASH → {symbol(episode.next_asset)}</b></p>
            <p>{tr('Recorded decision reason')}: <b>{episode.decision_reason ? tr(episode.decision_reason) : tr('Not available')}</b></p>
            {episode.decision_date ? <p>{tr('Decision at close')}: <b>{date(episode.decision_date)}</b></p> : null}
            {episode.best_asset ? <p>{tr('Highest utility candidate')}: <b>{episode.best_asset} ({score(episode.best_score)})</b></p> : null}
            {episode.entry_rotation ? <p>{tr('Entry into CASH is confirmed by a stored rotation.')}</p> : null}
            {episode.exit_rotation ? <p>{tr('Exit from CASH is confirmed by a stored rotation.')}</p> : null}
            {episode.terminal_liquidation ? <p>{tr('Final liquidation at the end of the backtest; no claim of intraday CASH exposure.')}</p> : null}
            {!episode.decision_reason ? <p className="annual-replay-help">{tr('The precise reason cannot be determined without recorded decision diagnostics.')}</p> : null}
          </article>)}
        </div>
      </>}
  </section>
}
