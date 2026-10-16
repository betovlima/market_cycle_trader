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
  const [executing, setExecuting] = useState(false)

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

  const canExecuteNow = Boolean(state?.real_orders_armed
    && state?.control_mode === "active"
    && state?.active_run?.status === "recalibrated_no_orders"
    && state?.active_run?.target_asset
    && state?.trader_winner?.configuration_hash)

  async function executeLiveWinnerNow() {
    if (!canExecuteNow || executing) return
    setExecuting(true)
    setNotice("")
    setError("")
    try {
      // Re-read the current plan before asking the operator to confirm REAL money.
      const current = await apiFetch(`${API}/live-market/robot/status`, { cache: "no-store" })
      if (current?.control_mode !== "active" || !current?.real_orders_armed
        || current?.active_run?.status !== "recalibrated_no_orders"
        || !current?.active_run?.execution_session || !current?.active_run?.target_asset
        || !current?.trader_winner?.configuration_hash) {
        throw new Error("O plano Winner Live não está pronto para execução. Atualize o estado.")
      }
      const session = current.active_run.execution_session
      const asset = current.active_run.target_asset
      const action = current.active_run.action || "executar"
      if (!window.confirm(`CONFIRMA OPERAÇÃO REAL NA ALPACA LIVE?\n\nWinner: ${current.trader_winner.name}\nSessão: ${session}\nAção: ${action}\nAtivo: ${asset}\n\nUma ordem real poderá ser enviada à corretora.`)) return
      const result = await apiFetch(`${API}/live-market/winner/execute-current-plan`, {
        method: "POST",
        body: {
          execution_session: session,
          expected_target_asset: asset,
          expected_winner_configuration_hash: current.trader_winner.configuration_hash,
          confirm: "EXECUTE_WINNER_LIVE_REAL_ORDER",
        },
      })
      setNotice(`Operação Live concluída na Alpaca: ${result.action || action} ${result.target_asset || asset}.`)
      await refresh()
    } catch (exc) {
      setError(exc.message || "Não foi possível executar o plano Winner Live.")
      await refresh()
    } finally {
      setExecuting(false)
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
      <div className="trader-manual-recovery" aria-label="Execução manual da Winner na Alpaca Live">
        <div className="trader-manual-recovery-copy">
          <span className="panel-kicker">WINNER · ALPACA LIVE</span>
          <strong>Executar plano atual na corretora real</strong>
          <p>Plano: {state?.active_run?.execution_session || "—"} · {state?.active_run?.action || "—"} · {state?.active_run?.target_asset || "—"} · {state?.active_run?.status || "sem plano"}</p>
        </div>
        <div className="trader-manual-recovery-actions">
          <button type="button" className="manual-execute" onClick={executeLiveWinnerNow}
            disabled={!canExecuteNow || executing || busy}
            title={canExecuteNow ? "Confirmar e executar apenas o plano elegível da sessão na Alpaca Live" : "Requer plano recalibrated_no_orders, modo ativo e autorização de ordens reais no servidor"}>
            {executing ? "Executando na Alpaca…" : "Executar Winner na Alpaca Live"}
          </button>
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
