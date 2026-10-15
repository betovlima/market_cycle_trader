import { useCallback, useEffect, useState } from 'react'
import { apiFetch } from '../../api/http'
import { API } from '../../config/env'
import { tr } from '../../i18n/runtime'

/** Live controls never call Paper mutation endpoints. Fail closed until Live execution exists. */
export function LiveTraderControl() {
  const [state, setState] = useState(null)
  const [error, setError] = useState('')

  const refresh = useCallback(async () => {
    try {
      const result = await apiFetch(`${API}/live-market/robot/status`, { cache: 'no-store' })
      setState(result)
      setError('')
    } catch (exc) {
      setError(exc.message)
      setState(null)
    }
  }, [])

  useEffect(() => {
    refresh()
    const timer = window.setInterval(refresh, 30_000)
    return () => window.clearInterval(timer)
  }, [refresh])

  const blocked = !state?.execution_enabled
  const blockedTitle = tr('Live execution is not installed. These controls cannot submit real orders.')
  return (
    <section className="settings-workspace-section trader-control-panel settings-trader-section"
      aria-label={tr('Trader operation · Live')}>
      <div className="settings-section-heading">
        <div>
          <span className="panel-kicker">{tr('TRADER · LIVE')}</span>
          <h2>{tr('Trader operation · Live')}</h2>
        </div>
        <span className={`trader-mode-badge mode-${state?.control_mode || 'stopped'}`}>
          {tr(state?.control_mode || 'stopped')}
        </span>
      </div>
      <div className="trader-control-grid settings-trader-grid">
        <div className="trader-control-status">
          <div><span>{tr('Status')}</span><strong>{tr(state?.status || 'Unavailable')}</strong></div>
          <div><span>{tr('Phase')}</span><strong>{tr(state?.phase || 'Read-only')}</strong></div>
          <div><span>{tr('Scheduler')}</span><strong>{tr(state?.scheduler_alive ? 'Online' : 'Offline')}</strong></div>
          <div><span>{tr('Next session')}</span><strong>{state?.next_execution_session || '—'}</strong></div>
          <div><span>{tr('Trader winner')}</span><strong>{state?.trader_winner?.name || '—'}</strong></div>
        </div>
        <div className="trader-control-actions">
          {[['active', 'Start'], ['paused', 'Pause'], ['exit_only', 'Exit only'], ['stopped', 'Stop']].map(([mode, label]) => (
            <button key={mode} type="button" title={blockedTitle}
              className={mode === 'stopped' ? 'danger' : ''}
              disabled={blocked || state?.control_mode === mode}>{tr(label)}</button>
          ))}
        </div>
      </div>
      <p className="portfolio-live-safety-note" role="status">
        {tr('Live account monitoring is read-only. Independent Live start, pause, exit-only and stop controls require a validated Live executor before activation. Paper Trader is unaffected.')}
      </p>
      {error ? <p className="inline-error">{tr(error)}</p> : null}
    </section>
  )
}
