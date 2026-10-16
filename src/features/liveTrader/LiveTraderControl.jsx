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

/** Dedicated Alpaca Live operation. Paper UI and order API are not used. */
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
    const confirmation = `Alterar Trader Alpaca Live para ${tr(mode)}? No modo Start, a Winner pode enviar ordens reais automaticamente.`
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
          reason: `Live Trader mode: ${mode}`,
        },
      })
      setState((previous) => ({ ...(previous || {}), ...updated }))
      setNotice(`Modo Alpaca Live alterado para ${tr(mode)}.`)
    } catch (exc) {
      await refresh()
      setError(exc.message)
    } finally {
      setBusy(false)
    }
  }

  const canExecuteNow = Boolean(state?.real_orders_armed
    && ["active", "exit_only"].includes(state?.control_mode)
    && state?.active_run?.status === "recalibrated_no_orders"
    && state?.active_run?.target_asset
    && (state?.control_mode === "active"
      || ["hold", "stay_in_cash", "sell_to_cash"].includes(state?.active_run?.action)))

  async function executeLiveWinnerNow() {
    if (!canExecuteNow || executing) return
    setExecuting(true)
    setNotice("")
    setError("")
    try {
      // Re-read the current plan before asking the operator to confirm REAL money.
      const current = await apiFetch(`${API}/live-market/robot/status`, { cache: "no-store" })
      if (!["active", "exit_only"].includes(current?.control_mode)
        || !current?.real_orders_armed
        || current?.active_run?.status !== "recalibrated_no_orders"
        || !current?.active_run?.execution_session || !current?.active_run?.target_asset
        || (current.control_mode === "exit_only" &&
          !["hold", "stay_in_cash", "sell_to_cash"].includes(current?.active_run?.action))) {
        throw new Error("O plano Winner Live não está pronto para execução. Atualize o estado.")
      }
      const session = current.active_run.execution_session
      const asset = current.active_run.target_asset
      const action = current.active_run.action || "executar"
      if (!window.confirm(`CONFIRMA OPERAÇÃO REAL NA ALPACA LIVE?\n\nWinner: ${current.trader_winner.name}\nSessão: ${session}\nAção: ${action}\nAtivo: ${asset}\n\nUma ordem real poderá ser enviada à corretora.`)) return
      const result = await apiFetch(`${API}/live-execution/winner/execute`, {
        method: "POST",
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
              title="Muda o modo operacional da Winner na Alpaca Live"
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
            title={canExecuteNow ? "Executar a decisão atual da Winner pela API exclusiva Alpaca Live" : "Requer decisão Winner elegível e Trader Live ativo"}>
            {executing ? "Executando na Alpaca…" : "Executar Winner na Alpaca Live"}
          </button>
        </div>
      </div>
      <p className="portfolio-live-safety-note" role="status">
        {'O Trader Live segue a Winner e os controles Start / Pause / Exit only / Stop. O ambiente Paper é independente.'}
      </p>
      {notice ? <p className="global-inline-message">{notice}</p> : null}
      {error ? <p className="inline-error">{tr(error)}</p> : null}
    </section>
  )
}
