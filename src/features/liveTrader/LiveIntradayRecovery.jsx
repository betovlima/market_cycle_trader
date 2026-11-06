import { useCallback, useEffect, useState } from 'react'
import { apiFetch } from '../../api/http'
import { API } from '../../config/env'
import { LIVE_INTRADAY_STEPS, liveIntradayProgressModel } from './liveIntradayProgressModel'

const ENDPOINT = `${API}/live-market/winner/manual-current-session`

export function LiveIntradayRecovery() {
  const [result, setResult] = useState(null)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [lastChecked, setLastChecked] = useState(null)

  const refresh = useCallback(async () => {
    try {
      const data = await apiFetch(`${ENDPOINT}/status`, { cache: 'no-store' })
      setResult(data)
      setLastChecked(new Date())
      setError('')
    } catch {
      setError('Não foi possível consultar o andamento da contingência Live.')
    }
  }, [])

  useEffect(() => {
    refresh()
    // Poll more frequently only while the backend confirms a running job.
    const interval = window.setInterval(refresh, result?.status === 'running' ? 4000 : 15000)
    return () => window.clearInterval(interval)
  }, [refresh, result?.status])

  const analyze = useCallback(async () => {
    if (busy || !result?.can_analyze) return
    if (!window.confirm(
      result?.market_open
        ? 'Reanalisar a Winner com histórico diário concluído e o movimento do pregão atual? Não envia ordens.'
        : 'Reanalisar a Winner com o último histórico diário completo? Não utiliza candles intradiários e não envia ordens.',
    )) return
    setBusy(true)
    setMessage('')
    setError('')
    try {
      const outcome = await apiFetch(`${ENDPOINT}/analyze`, {
        method: 'POST',
        body: { confirm: 'ANALYZE_LIVE_CURRENT_SESSION_NO_ORDERS' },
      })
      setResult(outcome)
      setLastChecked(new Date())
      setMessage('Nova análise iniciada. Acompanhe abaixo o andamento informado pelo servidor.')
      await refresh()
    } catch {
      setError('A análise não foi iniciada. Verifique a conexão com a Alpaca e tente novamente.')
      await refresh()
    } finally {
      setBusy(false)
    }
  }, [busy, refresh, result?.can_analyze])

  const progress = liveIntradayProgressModel(result, error)
  const isRunning = result?.status === 'running'
  const hasStarted = isRunning || result?.status === 'prepared' || result?.status === 'failed'

  return (
    <section className="trader-manual-recovery live-intraday-recovery"
      aria-label="Recalcular Winner usando histórico diário, mesmo fora do pregão">
      <div className="trader-manual-recovery-copy">
        <span className="panel-kicker">WINNER · LIVE · CONTINGÊNCIA</span>
        <strong>Recalcular Winner usando histórico diário</strong>
        <small>
          Reanálise manual, sem ordens. Durante o pregão, inclui o movimento disponível
          da sessão atual. Fora do pregão, usa somente os candles diários completos
          disponíveis. Pode ser repetida após a conclusão.
        </small>

        <div className={`live-intraday-progress is-${progress.kind}`}
          role="status" aria-live="polite" aria-atomic="false">
          <div className="live-intraday-progress-heading">
            <span className={`live-intraday-progress-icon ${progress.spinning ? 'is-spinning' : ''}`}
              aria-hidden="true">{progress.spinning ? '◌' : progress.kind === 'completed' ? '✓' : '●'}</span>
            <div>
              <strong>{progress.headline}</strong>
              <small>{progress.description}</small>
            </div>
          </div>
          {hasStarted ? (
            <ol className="live-intraday-progress-steps" aria-label="Etapas reais do cálculo da Winner">
              {LIVE_INTRADAY_STEPS.map((step, index) => {
                const complete = progress.kind === 'completed' || (isRunning && index < progress.stage)
                const active = isRunning && index === progress.stage
                return (
                  <li key={step.id}
                    className={complete ? 'is-completed' : active ? 'is-current' : 'is-pending'}
                    aria-current={active ? 'step' : undefined}>
                    <span className="live-intraday-step-symbol" aria-hidden="true">
                      {complete ? '✓' : index + 1}
                    </span>
                    <span>{step.label}</span>
                  </li>
                )
              })}
            </ol>
          ) : null}
        </div>

        <small>
          Data de referência: {result?.session || '—'}
          {' · '}Estado: {result?.status === 'running' ? 'Em processamento' : result?.status === 'prepared' ? 'Concluído' : result?.status === 'failed' ? 'Falha' : 'Aguardando'}
          {lastChecked ? ` · Última consulta: ${lastChecked.toLocaleTimeString('pt-BR')}` : ''}
        </small>
        {result?.started_at && isRunning ? <small>Iniciado em: {new Date(result.started_at).toLocaleTimeString('pt-BR')}</small> : null}

        {result?.status === 'prepared' ? (
          <>
            <small>
              Posição: {result.current_asset || '—'}
              {' · '}Recomendação: {result.target_asset || '—'}
              {' · '}Ação: {result.action || '—'}
            </small>
            <small>
              Decisão original: {result.original_signal_target || '—'}
              {' · '}Histórico até: {result.historical_cutoff || '—'}
              {' · '}Dados: {result.analysis_mode === 'completed_daily_only' ? 'Fechamento diário completo' : 'Movimento intradiário'}
              {' · '}Fonte: {String(result.live_feed || '—').toUpperCase()}
              {result.analysis_mode !== 'completed_daily_only'
                ? ` · Atraso dos dados: ${result.intraday_data_delay_minutes ?? '—'} min`
                : ''}
            </small>
          </>
        ) : null}
        {result?.status === 'failed' ? (
          <small role="alert">A análise falhou na etapa {result.phase || 'não identificada'}.
            {result.failure_type ? ` Tipo: ${result.failure_type}.` : ''} Nenhuma ordem foi enviada.</small>
        ) : null}
        <small>
          Esta reanálise não altera o sinal automático nem envia ordens.
          Uma execução real exige validação e confirmação separadas.
        </small>
        {message ? <small className="global-inline-message">{message}</small> : null}
        {error ? <small role="alert" className="inline-error">{error}</small> : null}
      </div>
      <div className="trader-manual-recovery-actions">
        <button type="button" onClick={analyze}
          disabled={busy || !result?.can_analyze || isRunning}
          title={result?.can_analyze
            ? 'Calcular novamente, com ou sem pregão aberto, sem enviar ordens'
            : 'Aguardando atualização da conexão ou conclusão da análise em andamento'}>
          {busy ? 'Solicitando…' : isRunning ? 'Analisando…' : 'Recalcular Winner agora'}
        </button>
      </div>
    </section>
  )
}
