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
    const confirmation = state?.real_orders_armed
      ? `Confirma a mudança do Live para ${tr(mode)}? ATENÇÃO: quando ativo, o Trader poderá enviar ORDENS REAIS à Alpaca.`
      : tr('Change Live monitoring mode to {mode}? No real orders will be sent. Paper Trading is unaffected.').replace('{mode}', tr(mode))
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
      setNotice(state?.real_orders_armed
        ? 'Estado Live alterado. Operações reais seguem os bloqueios e limites definidos na API.'
        : tr('Live monitoring mode updated. Real order submission remains disabled.'))
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
          <div><span>{tr('Phase')}</span><strong>{state?.active_run?.phase || state?.phase || '—'}</strong></div>
          <div><span>{tr('Order execution')}</span><strong>{state?.real_orders_armed ? 'AUTORIZADA · REAL' : tr('Disabled')}</strong></div>
          <div><span>{tr('Scheduler')}</span><strong>{state?.scheduler_alive ? 'Ativo' : tr('Not installed')}</strong></div>
          <div><span>{tr('Trader winner')}</span><strong>{state?.trader_winner?.name || '—'}</strong></div>
          <div><span>Próximo pregão</span><strong>{state?.next_execution_session || '—'}</strong></div>
          <div><span>Ativo selecionado</span><strong>{state?.active_run?.target_asset || '—'}</strong></div>
        </div>
        <div className="trader-control-actions">
          {MODES.map(([mode, label]) => (
            <button key={mode} type="button"
              className={mode === 'stopped' ? 'danger' : ''}
              title={state?.real_orders_armed ? 'Atenção: modo Live com operações reais autorizadas' : tr('Change Live monitoring mode only. Real orders are disabled.')}
              onClick={() => changeLiveMode(mode)}
              disabled={!state || busy || state.control_mode === mode}>
              {tr(label)}
            </button>
          ))}
        </div>
      </div>
      <p className="portfolio-live-safety-note" role="status">
        {state?.real_orders_armed
          ? 'Ordens reais autorizadas no servidor. Verifique os limites de risco, a Winner e o pregão antes de iniciar.'
          : 'Monitoramento, preparação e recalibração Live independentes. Ordens reais permanecem desabilitadas. Paper não é afetado.'}
      </p>
      {notice ? <p className="global-inline-message">{notice}</p> : null}
      {error ? <p className="inline-error">{tr(error)}</p> : null}
    </section>
  )
}
