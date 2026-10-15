import { useCallback, useEffect, useState } from 'react'
import { apiFetch } from '../../api/http'
import { API } from '../../config/env'
import { tr } from '../../i18n/runtime'

const MODES = [
  ['active', 'Start'],
  ['paused', 'Pause'],
  ['exit_only', 'Exit only'],
  ['stopped', 'Stop'],
]

/** Independent Live monitoring controls — never call Paper routes or send orders. */
export function LiveTraderControl() {
  const [state, setState] = useState(null)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [busy, setBusy] = useState(false)

  const refresh = useCallback(async () => {
    try {
      const result = await apiFetch(`${API}/live-market/robot/status`, { cache: 'no-store' })
      setState(result)
      setError('')
    } catch (exc) {
      setError(exc.message)
    }
  }, [])

  useEffect(() => {
    refresh()
    const timer = window.setInterval(refresh, 30_000)
    return () => window.clearInterval(timer)
  }, [refresh])

  async function changeLiveMode(mode) {
    if (!state || busy) return
    // Explicitly distinguish monitoring modes from the future Live execution engine.
    const confirmation = tr(
      'Change Live monitoring mode to {mode}? No real orders will be sent. Paper Trading is unaffected.',
    ).replace('{mode}', tr(mode))
    if (!window.confirm(confirmation)) return
    setBusy(true)
    setError('')
    setNotice('')
    try {
      const updated = await apiFetch(`${API}/live-market/robot/mode`, {
        method: 'POST',
        body: {
          mode,
          expected_revision: Number(state.revision),
          reason: `Live monitoring mode: ${mode}`,
          confirm: 'LIVE_MONITORING_ONLY',
        },
      })
      setState((previous) => ({ ...(previous || {}), ...updated }))
      setNotice(tr('Live monitoring mode updated. Real order submission remains disabled.'))
    } catch (exc) {
      await refresh()
      setError(exc.message)
    } finally {
      setBusy(false)
    }
  }

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
          <div><span>{tr('Phase')}</span><strong>{tr('Monitoring only')}</strong></div>
          <div><span>{tr('Order execution')}</span><strong>{tr('Disabled')}</strong></div>
          <div><span>{tr('Scheduler')}</span><strong>{tr('Not installed')}</strong></div>
          <div><span>{tr('Trader winner')}</span><strong>{state?.trader_winner?.name || '—'}</strong></div>
        </div>
        <div className="trader-control-actions">
          {MODES.map(([mode, label]) => (
            <button key={mode} type="button"
              className={mode === 'stopped' ? 'danger' : ''}
              title={tr('Change Live monitoring mode only. Real orders are disabled.')}
              onClick={() => changeLiveMode(mode)}
              disabled={!state || busy || state.control_mode === mode}>
              {tr(label)}
            </button>
          ))}
        </div>
      </div>
      <p className="portfolio-live-safety-note" role="status">
        {tr('Live controls now save independent monitoring modes, not trades. In particular, Exit only records the future policy but cannot sell assets until a Live executor is deployed. Paper is unaffected.')}
      </p>
      {notice ? <p className="global-inline-message">{notice}</p> : null}
      {error ? <p className="inline-error">{tr(error)}</p> : null}
    </section>
  )
}
