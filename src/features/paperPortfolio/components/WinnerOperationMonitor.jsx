import { getIntlLocale, tr } from '../../../i18n/runtime'
import './WinnerOperationMonitor.css'

const PHASE_LABELS = {
  validating: 'Validating Winner and broker state',
  download: 'Downloading completed daily history',
  excluded: 'Checking structural exclusions',
  intraday_iex: 'Collecting intraday IEX bars',
  intraday_sip: 'Collecting intraday SIP bars',
  intraday_sip_delayed: 'Collecting SIP bars with a historical cutoff',
  training: 'Training and calibrating LightGBM',
  saving_plan: 'Saving the proposed Paper plan',
  broker_execution: 'Validating and executing the approved Alpaca plan',
  completed: 'Operation completed',
  failed: 'Operation failed',
}

const STATUS_LABELS = {
  running: 'In progress',
  prepared: 'Plan ready for review',
  completed: 'Completed',
  failed: 'Failed',
  review_required: 'Broker reconciliation required',
}

function eventTime(value) {
  if (!value) return '—'
  const stamp = new Date(value)
  return Number.isNaN(stamp.getTime())
    ? '—'
    : stamp.toLocaleTimeString(getIntlLocale(), {
        hour: '2-digit', minute: '2-digit', second: '2-digit',
      })
}

function latestOperation(robot) {
  const candidates = [
    robot?.manual_reanalysis
      ? { ...robot.manual_reanalysis, operation: 'analysis' }
      : null,
    robot?.manual_execution
      ? { ...robot.manual_execution, operation: 'execution' }
      : null,
  ].filter(Boolean)
  if (!candidates.length) return null
  // Always display an active operation before an older completed one.
  const active = candidates.filter((candidate) => candidate.status === 'running')
  const ordered = active.length ? active : candidates
  return [...ordered].sort((a, b) =>
    (Date.parse(b.updated_at) || 0) - (Date.parse(a.updated_at) || 0)
  )[0]
}

function operationName(value) {
  return tr(value === 'execution' ? 'Execute approved plan on Alpaca' : 'Reanalyze Winner')
}

export function WinnerOperationMonitor({ robot }) {
  const current = latestOperation(robot)
  const events = Array.isArray(robot?.manual_operation_log)
    ? robot.manual_operation_log.slice(-30).reverse()
    : []

  const total = Number(current?.total)
  const completed = Number(current?.completed)
  const countKnown = Boolean(
    current?.status === 'running' && current?.operation === 'analysis'
    && Number.isFinite(total) && total > 1
    && Number.isFinite(completed) && completed >= 0
  )
  const percent = countKnown ? Math.min(100, Math.max(0, completed / total * 100)) : null
  const active = current?.status === 'running'
  const label = tr(PHASE_LABELS[current?.phase] || STATUS_LABELS[current?.status] || 'Awaiting update')
  const status = tr(STATUS_LABELS[current?.status] || 'Waiting')
  const approvedAnalysis = robot?.manual_reanalysis
  const delayMinutes = Number(approvedAnalysis?.data_delay_minutes || 0)
  const delayedCutoff = approvedAnalysis?.data_cutoff_utc
    ? new Date(approvedAnalysis.data_cutoff_utc)
    : null
  const cutoffLabel = delayedCutoff && !Number.isNaN(delayedCutoff.getTime())
    ? delayedCutoff.toLocaleString(getIntlLocale())
    : '—'
  const showDelayedApproval = approvedAnalysis?.status === 'prepared'
    && delayMinutes > 0

  return (
    <section className="winner-operations-monitor" aria-label={tr('Winner manual operations')}>
      <div className="winner-operations-header">
        <div>
          <span className="panel-kicker">{tr('Operational monitoring')}</span>
          <h3>{tr('Winner manual operations')}</h3>
        </div>
        <span className={`winner-operations-state ${current?.status || 'idle'}`}>
          {active ? <span className="portfolio-button-spinner" aria-hidden="true" /> : null}
          {status}
        </span>
      </div>

      {current ? (
        <div className="winner-operations-live" role="status" aria-live="polite">
          <div className="winner-operations-live-title">
            <strong>{operationName(current.operation)}</strong>
            <span>{eventTime(current.updated_at)}</span>
          </div>
          <div className="winner-operations-phase">
            <span>{label}</span>
            {countKnown ? <strong>{completed} / {total}</strong> : null}
            {active && current.symbol ? <small>{current.symbol}</small> : null}
          </div>
          <div
            className={`winner-operations-progress ${countKnown ? 'measured' : active ? 'indeterminate' : current.status || ''}`}
            role="progressbar"
            aria-label={label}
            aria-valuemin={0}
            aria-valuemax={countKnown ? total : 100}
            aria-valuenow={countKnown ? completed : current.status === 'prepared' || current.status === 'completed' ? 100 : undefined}
            aria-valuetext={countKnown ? `${completed} / ${total}` : status}
          >
            <span style={countKnown ? { width: `${percent}%` } : undefined} />
          </div>
          {current.error ? (
            <p className="winner-operations-error">{current.error}</p>
          ) : current.status === 'prepared' ? (
            <p>{tr('Review the new plan before any order is sent to Alpaca.')}</p>
          ) : current.status === 'review_required' ? (
            <p>{tr('Reconcile Alpaca orders before attempting another execution.')}</p>
          ) : null}
          {showDelayedApproval ? (
            <p className="winner-operations-delayed">
              {tr('Attention: the approved Winner plan uses SIP data delayed by {minutes} minutes, with market cutoff {cutoff}. Review this delay before executing in Alpaca.', {
                minutes: delayMinutes, cutoff: cutoffLabel,
              })}
            </p>
          ) : null}
          <small>{tr('Progress is based on real processing stages; training has no estimated percentage.')}</small>
        </div>
      ) : (
        <div className="winner-operations-live" role="status">
          <strong>{tr('Waiting for a manual Winner operation')}</strong>
          <div className="winner-operations-progress" aria-hidden="true"><span /></div>
          <small>{tr('Analysis and Alpaca execution events will appear here automatically.')}</small>
        </div>
      )}

      <details className="winner-operations-log" open>
        <summary>{tr('Execution log')} ({events.length})</summary>
        <div className="winner-operations-log-scroll">
          {events.length ? (
            <ol>
              {events.map((entry, index) => (
                <li key={`${entry.at || index}-${entry.attempt_id || ''}-${index}`}>
                  <time>{eventTime(entry.at)}</time>
                  <span className={`winner-operation-dot ${entry.status || 'running'}`} aria-hidden="true" />
                  <span>
                    <strong>{operationName(entry.operation)}</strong>
                    {' · '}{tr(PHASE_LABELS[entry.phase] || STATUS_LABELS[entry.status] || 'Updating')}
                    {Number(entry.total) > 1 ? ` · ${entry.completed || 0}/${entry.total}` : ''}
                    {entry.symbol ? ` · ${entry.symbol}` : ''}
                  </span>
                </li>
              ))}
            </ol>
          ) : <p>{tr('No manual operation events have been recorded.')}</p>}
        </div>
      </details>
    </section>
  )
}
