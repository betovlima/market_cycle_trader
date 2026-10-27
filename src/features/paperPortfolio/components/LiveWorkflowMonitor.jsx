import { useEffect, useState } from 'react'

import { apiFetch } from '../../../api/http'
import { API } from '../../../config/env'
import { getIntlLocale, tr } from '../../../i18n/runtime'
import './LiveWorkflowMonitor.css'
import { liveWorkflowDisplay, liveWorkflowAttemptStageKey } from '../liveWorkflowDisplay.mjs'

const POLL_MS = 15_000

const RECOVERY_LABELS = {
  broker_reconciliation_required: 'Broker reconciliation required',
  eligible_for_full_recalculation: 'Eligible for full recalculation',
  processing: 'Processing',
  not_required: 'No recovery required',
}
const STATE_LABELS = {
  completed: 'Completed',
  retry_pending: 'Retry pending',
  reconciliation_required: 'Broker reconciliation required',
  running: 'Running',
  waiting: 'Waiting',
  pending: 'Pending',
  preparing_signal: 'Preparing Winner signal',
  open_recalibration: 'Open-session recalibration',
  recalibrated_no_orders: 'Decision ready',
  waiting_for_winner_signal: 'Waiting for signal preparation',
  waiting_for_open_recalibration: 'Waiting for open recalibration',
  review_required: 'Review required',
  executing: 'Broker execution',
}
const STAGE_LABELS = {
  post_close_calculation: 'Post-close calculation',
  open_calculation: 'Open-session calculation',
  broker_execution: 'Alpaca execution',
}
const TONE = {
  completed: 'success',
  retry_pending: 'warning',
  reconciliation_required: 'danger',
  running: 'active',
  waiting: 'neutral',
  pending: 'neutral',
}

const displayState = (value) => tr(STATE_LABELS[value] || String(value || 'Not available').replaceAll('_', ' '))
const displayStage = (value) => tr(STAGE_LABELS[value] || String(value || 'Not available').replaceAll('_', ' '))
const formatTime = (value) => {
  if (!value) return '—'
  const parsed = new Date(value)
  return Number.isNaN(parsed.getTime()) ? '—' : parsed.toLocaleString(getIntlLocale())
}

export function LiveWorkflowMonitor({ executionSession }) {
  const [selectedSession, setSelectedSession] = useState('')
  const [refreshKey, setRefreshKey] = useState(0)
  const [report, setReport] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [updatedAt, setUpdatedAt] = useState(null)
  const session = selectedSession || executionSession || ''

  useEffect(() => {
    let mounted = true
    let inFlight = false
    const refresh = async () => {
      if (inFlight) return
      inFlight = true
      try {
        const params = new URLSearchParams({ limit: '30' })
        if (session) params.set('execution_session', session)
        const response = await apiFetch(`${API}/live-market/winner/monitor?${params}`)
        if (!mounted) return
        setReport(response)
        setUpdatedAt(new Date())
        setError('')
      } catch (exc) {
        if (mounted) setError(exc.message || 'Unable to load Live workflow monitor.')
      } finally {
        inFlight = false
        if (mounted) setLoading(false)
      }
    }
    setReport(null)
    setError('')
    setLoading(true)
    refresh()
    const timer = window.setInterval(refresh, POLL_MS)
    return () => {
      mounted = false
      window.clearInterval(timer)
    }
  }, [session, refreshKey])

  const presentation = liveWorkflowDisplay(report)
  const { attempts, recentErrors } = presentation
  const isMissing = report?.status === 'no_live_session'
  const currentState = report?.status
  const recovery = report?.recovery
  const brokerPending = Number(report?.orders_requiring_reconciliation || 0)
  const recoveryTone = recovery === 'broker_reconciliation_required' ? 'danger'
    : recovery === 'eligible_for_full_recalculation' ? 'warning'
      : recovery === 'processing' ? 'active' : 'success'

  return (
    <section className="live-workflow-monitor" aria-label={tr('Live workflow monitor')}>
      <header className="live-workflow-header">
        <div>
          <span className="panel-kicker">{tr('Live operations')} · {tr('Read-only monitoring')}</span>
          <h3>{tr('Live workflow monitor')}</h3>
          <small>{tr('Automatic refresh every 15 seconds')} · {tr('Last checked')}: {formatTime(updatedAt)}</small>
        </div>
        <div className="live-workflow-controls">
          <label>
            {tr('Session')}
            <input type="date" aria-label={tr('Workflow session')} value={session || report?.execution_session || ''} onChange={(event) => setSelectedSession(event.target.value)} />
          </label>
          {selectedSession ? (
            <button type="button" className="secondary-action compact" onClick={() => setSelectedSession('')}>
              {tr('Current session')}
            </button>
          ) : null}
          <button type="button" className="secondary-action compact" disabled={loading} onClick={() => setRefreshKey((value) => value + 1)}>
            {tr(loading ? 'Loading…' : 'Refresh')}
          </button>
        </div>
      </header>
      {error ? <p className="live-workflow-error" role="alert">{tr('Monitor unavailable')}: {error}</p> : null}
      {!report ? (
        <p className="live-workflow-empty" role="status">{tr(loading ? 'Loading Live workflow…' : 'No workflow data available.')}</p>
      ) : isMissing ? (
        <p className="live-workflow-empty">{tr('No Live session was found for the selected date.')}</p>
      ) : (
        <>
          <div className="live-workflow-summary" aria-live="polite">
            <div className="live-workflow-metric">
              <span>{tr('Session state')}</span>
              <strong>{displayState(currentState)}</strong>
              <small>{report.phase ? displayStage(report.phase) : '—'}</small>
            </div>
            <div className="live-workflow-metric">
              <span>{tr('Recovery')}</span>
              <strong className={`live-workflow-text-${recoveryTone}`}>{tr(RECOVERY_LABELS[recovery] || 'Not available')}</strong>
              <small>{tr('Actual persisted state determines the next step.')}</small>
            </div>
            <div className="live-workflow-metric">
              <span>{tr('Signal preparations initiated')}</span>
              <strong>{Number(report.preparation_attempts || 0)} / {Number(report.open_preparation_attempts || 0)}</strong>
              <small>{tr('Post-close / open-session · cumulative')}</small>
            </div>
            <div className="live-workflow-metric">
              <span>{tr('Orders to reconcile')}</span>
              <strong className={brokerPending ? 'live-workflow-text-danger' : ''}>{brokerPending}</strong>
              <small>{tr('Never resend orders as a calculation retry.')}</small>
            </div>
          </div>
          {presentation.hasDiagnostics ? (
            <details className={`live-workflow-diagnostics ${presentation.isHistorical ? 'historical' : 'active-errors'}`} open={!presentation.isHistorical}>
              <summary>
                <strong>{tr(presentation.isHistorical
                  ? (presentation.preparedAfterFailures
                      ? 'Previous failures · signal prepared afterwards'
                      : 'Previous failures · decision currently ready')
                  : 'Recent failures')}</strong>
                {presentation.isHistorical ? <span>{tr('Historical records retained for audit; no active preparation failure is indicated by the current session status.')}</span> : null}
              </summary>
              <div className="live-workflow-diagnostic-lines">
                {report.last_preparation_error_type ? <span>{tr('Post-close')}: {report.last_preparation_error_type}</span> : null}
                {report.last_open_calibration_error_type ? <span>{tr('Open-session')}: {report.last_open_calibration_error_type}</span> : null}
                {recentErrors.map((event, i) => <span key={`${event.recorded_at || 'event'}-${i}`}>{formatTime(event.recorded_at)} · {event.stage || '—'} · {event.details?.error_type || event.message || '—'}</span>)}
              </div>
            </details>
          ) : null}
          <div className="live-workflow-attempts">
            <div className="live-workflow-section-title">
              <h4>{tr('Processing attempts')}</h4>
              <span>{attempts.length} {tr('records')}</span>
            </div>
            {attempts.length ? (
              <ol className="live-workflow-attempt-list">
                {attempts.map((attempt, index) => (
                  <li key={attempt.attempt_id || index} className="live-workflow-attempt">
                    <span className={`live-workflow-dot ${TONE[attempt.status] || 'neutral'}`} aria-hidden="true" />
                    <div className="live-workflow-attempt-content">
                      <div className="live-workflow-attempt-heading">
                        <strong>{liveWorkflowAttemptStageKey(attempt) ? tr(liveWorkflowAttemptStageKey(attempt)) : displayStage(attempt.stage)}</strong>
                        <span className={`live-workflow-state ${TONE[attempt.status] || 'neutral'}`}>{displayState(attempt.status)}</span>
                      </div>
                      <small>{formatTime(attempt.started_at)}{attempt.finished_at ? ` → ${formatTime(attempt.finished_at)}` : ''}</small>
                      {attempt.error_type ? <p className="live-workflow-attempt-error">{tr('Error type')}: {attempt.error_type}</p> : null}
                      {attempt.result_status ? <small>{tr('Result')}: {displayState(attempt.result_status)}</small> : null}
                    </div>
                  </li>
                ))}
              </ol>
            ) : <p className="live-workflow-empty">{tr('No workflow attempts recorded for this session yet. Historical attempts before this feature cannot be reconstructed.')}</p>}
            {attempts.some((attempt) => liveWorkflowAttemptStageKey(attempt)) ? (
              <p className="live-workflow-attempt-note">{tr('A completed D-1 check can reuse a saved signal. The monitoring record alone does not prove another model training occurred.')}</p>
            ) : null}
          </div>
        </>
      )}
      <p className="live-workflow-footnote">{tr('Monitoring is read-only. It neither triggers calculations nor submits Alpaca orders.')}</p>
    </section>
  )
}
