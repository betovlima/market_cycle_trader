import { useCallback, useEffect, useState } from 'react'
import { apiFetch } from '../../api/http'
import { API } from '../../config/env'
import { getCurrentLanguage, tr } from '../../i18n/runtime'

const MODES = [
  ['active', 'Start'],
  ['paused', 'Pause'],
  ['exit_only', 'Exit only'],
  ['stopped', 'Stop'],
]

// The operator authorizes Live mode and, if one is already persisted, exactly
// one current-session Winner execution. No frontend model recalibration.
const WORDS = {
  pt: {
    label: 'Iniciar / executar ciclo Live',
    running: 'Verificando e iniciando…',
    caption: 'Uma ação: verifica a conta, ativa o Live e executa um plano elegível já preparado. Sem plano válido, acompanha o próximo fechamento.',
    confirm: 'ATENÇÃO: CONTA REAL ALPACA LIVE.\n\nEsta ação poderá habilitar ordens automáticas nas próximas sessões e executar uma ordem real imediatamente SE houver plano Winner válido para o pregão atual.\n\nWinner: {winner}\nModo atual: {mode}\n\nConfirma?',
    noScheduler: 'Agendador Live indisponível. Não habilitei novas operações.',
    noWinner: 'Nenhuma Winner selecionada para o Live.',
    disabledTraining: 'Treinamento desabilitado nas configurações do MCT. Nenhuma operação iniciada.',
    notReady: 'Verificações da conta Live não passaram: {details}.',
    scheduled: 'Ciclo Live ativado. Não existe plano pós-fechamento elegível para execução nesta sessão. O agendador aguardará o candle diário completo e preparará a próxima sessão automaticamente.',
    activeWaiting: 'O Live já está ativo. Sem plano executável para agora; o agendador continuará a preparação e a execução quando houver sinal válido.',
    marketClosed: 'O plano pós-fechamento está pronto para a próxima sessão. Nenhuma ordem foi enviada com o mercado fechado.',
    complete: 'Plano Winner concluído no Live: {action} {asset}. Confira as ordens na Alpaca.',
    concurrent: 'O scheduler pode ter assumido a execução. Confira o estado e as ordens Live antes de repetir.',
    noState: 'Estado do Live indisponível.',
    notAvailable: 'O botão não ignora as regras de horário, posição nem o ledger de ordens do Live.',
  },
  en: {
    label: 'Start / execute Live cycle',
    running: 'Checking and starting…',
    caption: 'One action: check the account, activate Live, and execute an already prepared eligible plan. Otherwise wait for the next market close.',
    confirm: 'WARNING: REAL ALPACA LIVE ACCOUNT.\n\nThis action may enable automatic orders on future sessions and send a real order immediately IF a valid Winner plan already exists for the current session.\n\nWinner: {winner}\nCurrent mode: {mode}\n\nConfirm?',
    noScheduler: 'Live scheduler is unavailable. No new operation was enabled.',
    noWinner: 'No selected Live Winner.',
    disabledTraining: 'MCT training is disabled. No operation started.',
    notReady: 'Live account readiness checks failed: {details}.',
    scheduled: 'Live cycle activated. No eligible post-close plan exists for this session. The scheduler will wait for the complete daily bar and prepare the next session automatically.',
    activeWaiting: 'Live is already active. There is no executable plan now; the scheduler will continue preparing and executing when a valid plan exists.',
    marketClosed: 'The post-close plan is ready for the next session. No order was sent while the market is closed.',
    complete: 'Live Winner plan completed: {action} {asset}. Verify Alpaca orders.',
    concurrent: 'The scheduler may have claimed execution. Check current Live state and broker orders before retrying.',
    noState: 'Live state unavailable.',
    notAvailable: 'This button never bypasses timing, position or order-ledger checks.',
  },
  es: {
    label: 'Iniciar / ejecutar ciclo Live',
    running: 'Verificando e iniciando…',
    caption: 'Una acción: verifica la cuenta, activa Live y ejecuta un plan elegible ya preparado. De lo contrario espera al próximo cierre.',
    confirm: 'ATENCIÓN: CUENTA REAL ALPACA LIVE.\n\nEsta acción puede habilitar órdenes automáticas en próximas sesiones y enviar una orden real inmediatamente SI existe un plan Winner válido para la sesión actual.\n\nWinner: {winner}\nModo actual: {mode}\n\n¿Confirmar?',
    noScheduler: 'Programador Live no disponible. No se habilitaron operaciones nuevas.',
    noWinner: 'No hay Winner seleccionada para Live.',
    disabledTraining: 'Entrenamiento deshabilitado. No se inició ninguna operación.',
    notReady: 'Fallaron las verificaciones de la cuenta Live: {details}.',
    scheduled: 'Ciclo Live activado. No existe un plan poscierre elegible para esta sesión. El programador esperará la barra diaria completa y preparará la próxima sesión.',
    activeWaiting: 'Live ya está activo. No hay plan ejecutable ahora; el programador continuará al disponer de una señal válida.',
    marketClosed: 'El plan poscierre está listo para la próxima sesión. No se enviaron órdenes con el mercado cerrado.',
    complete: 'Plan Winner Live completado: {action} {asset}. Verifique las órdenes Alpaca.',
    concurrent: 'El programador puede haber iniciado la ejecución. Verifique el estado Live y las órdenes antes de repetir.',
    noState: 'Estado Live no disponible.',
    notAvailable: 'Este botón no omite las comprobaciones de horario, posición ni el registro de órdenes.',
  },
}

function words() {
  return WORDS[getCurrentLanguage()] || WORDS.en
}

function substitute(text, values) {
  return String(text).replace(/\{(\w+)\}/g, (_, key) => String(values[key] ?? '—'))
}

function executablePlan(run) {
  return run?.status === 'recalibrated_no_orders'
    && run?.post_close_signal_ready === true
    && Boolean(run?.target_asset && run?.execution_session && run?.decision_date)
}

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
    if (!state || busy || executing) return
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

  async function runLiveCycle() {
    if (!state || busy || executing) return
    const ui = words()
    // Consent is required before either enabling automated REAL trading or
    // potentially submitting the currently prepared live broker order.
    if (!window.confirm(substitute(ui.confirm, {
      winner: state.trader_winner?.name || '—',
      mode: state.control_mode || '—',
    }))) return
    setExecuting(true)
    setError('')
    setNotice('')
    try {
      const [live, settings, readiness] = await Promise.all([
        apiFetch(`${API}/live-market/robot/status`, { cache: 'no-store' }),
        apiFetch(`${API}/admin/system-settings`, { cache: 'no-store' }),
        apiFetch(`${API}/live-market/execution/readiness`, { cache: 'no-store' }),
      ])
      if (!live) throw new Error(ui.noState)
      if (!live.scheduler_alive) throw new Error(ui.noScheduler)
      if (!live.trader_winner?.name) throw new Error(ui.noWinner)
      if (settings?.training?.enabled !== true) throw new Error(ui.disabledTraining)
      // A stopped/paused operating mode is expected before activation.
      // All *other* broker and strategy prerequisites must be healthy first.
      if (!Array.isArray(readiness?.checks) || readiness.checks.length === 0) {
        throw new Error(ui.notReady.replace('{details}', 'readiness unavailable'))
      }
      const failing = readiness.checks
        .filter((check) => check?.name !== 'live_control' && check?.passed !== true)
      if (failing.length) {
        throw new Error(substitute(ui.notReady, {
          details: failing.map((check) => check.detail || check.name).join('; '),
        }))
      }

      let enabled = false
      if (live.control_mode !== 'active') {
        await apiFetch(`${API}/live-market/robot/mode`, {
          method: 'POST',
          body: {
            mode: 'active',
            expected_revision: Number(live.revision),
            reason: 'Operator one-click Live cycle: activate with verified broker readiness',
          },
        })
        enabled = true
      }
      // The scheduler can race the operator. The server atomically claims the
      // session and its order ledger; a repeated request cannot double submit.
      const current = await apiFetch(`${API}/live-market/robot/status`, { cache: 'no-store' })
      setState(current)
      if (!executablePlan(current?.active_run)) {
        setNotice(enabled ? ui.scheduled : ui.activeWaiting)
        return
      }
      // A future-session plan cannot be executed just because the Live mode
      // is active. Alpaca's market clock is authoritative, never browser time.
      const portfolio = await apiFetch(`${API}/live-market/portfolio`, { cache: 'no-store' })
      if (portfolio?.market_clock?.is_open !== true) {
        setNotice(ui.marketClosed)
        return
      }
      const snapshot = current.active_run
      try {
        const result = await apiFetch(`${API}/live-execution/winner/execute`, { method: 'POST' })
        setNotice(substitute(ui.complete, {
          action: result.action || snapshot.action,
          asset: result.target_asset || snapshot.target_asset,
        }))
      } catch (err) {
        // Backend uses CAS for the session and unique broker client_order_id.
        // Do not automatically retry an execution request with uncertain fill.
        const latest = await apiFetch(`${API}/live-market/robot/status`, { cache: 'no-store' })
        setState(latest)
        if (['executing', 'completed'].includes(latest?.latest_run?.status)) {
          setNotice(ui.concurrent)
          return
        }
        throw err
      }
    } catch (exc) {
      setError(exc?.message || ui.noState)
    } finally {
      // Refresh the plan without erasing the failure reason from the
      // single-click workflow. The periodic refresh may clear it later.
      try {
        const latest = await apiFetch(`${API}/live-market/robot/status`, { cache: 'no-store' })
        setState(latest)
      } catch {
        // Keep the original error; do not mask it with a status refresh error.
      }
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
              disabled={!state || busy || executing || state.control_mode === mode}>
              {tr(label)}
            </button>
          ))}
        </div>
      </div>
      <div className="trader-manual-recovery" aria-label="Iniciar ciclo Alpaca Live">
        <div className="trader-manual-recovery-copy">
          <span className="panel-kicker">WINNER · ALPACA LIVE</span>
          <strong>{words().label}</strong>
          <small>{words().caption}</small>
          <small>
            {state?.active_run?.execution_session || '—'} · {state?.active_run?.status || 'sem plano'}
            {' · '}{state?.active_run?.target_asset || '—'}
          </small>
        </div>
        <div className="trader-manual-recovery-actions">
          <button type="button" className="manual-execute"
            onClick={runLiveCycle}
            disabled={!state || busy || executing}
            title={words().notAvailable}>
            {executing ? words().running : words().label}
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
