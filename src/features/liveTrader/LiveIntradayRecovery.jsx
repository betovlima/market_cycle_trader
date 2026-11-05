import { useCallback, useEffect, useState } from 'react'
import { apiFetch } from '../../api/http'
import { API } from '../../config/env'
import { tr } from '../../i18n/runtime'

const ENDPOINT = `${API}/live-market/winner/manual-current-session`

const STATES = {
  idle: 'Reanálise da sessão atual disponível enquanto a bolsa estiver aberta.',
  running: 'Recalculando Winner com histórico diário e pregão atual. Nenhuma ordem será enviada.',
  prepared: 'Nova recomendação calculada para a sessão atual. Resultado somente para análise.',
  failed: 'Não foi possível concluir a reanálise. Nenhuma ordem foi enviada.',
  executed: 'A sessão já foi executada. Uma nova análise não provoca outra operação.',
}

export function LiveIntradayRecovery() {
  const [result, setResult] = useState(null)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')

  const refresh = useCallback(async () => {
    try {
      const data = await apiFetch(`${ENDPOINT}/status`, { cache: 'no-store' })
      setResult(data)
      setMessage('')
    } catch {
      setResult(null)
      setMessage('Não foi possível verificar a conexão Live e a disponibilidade da análise.')
    }
  }, [])

  useEffect(() => {
    refresh()
    const interval = window.setInterval(refresh, 10000)
    return () => window.clearInterval(interval)
  }, [refresh])

  const analyze = useCallback(async () => {
    if (busy || !result?.can_analyze) return
    if (!window.confirm('Reanalisar a Winner usando o histórico diário concluído e o movimento de hoje? O resultado não envia ordens nem substitui a decisão já executada.')) return
    setBusy(true)
    setMessage('')
    try {
      const outcome = await apiFetch(`${ENDPOINT}/analyze`, {
        method: 'POST',
        body: { confirm: 'ANALYZE_LIVE_CURRENT_SESSION_NO_ORDERS' },
      })
      setResult(outcome)
      setMessage('Reanálise solicitada. O resultado aparecerá aqui após o processamento.')
    } catch {
      setMessage('Não foi possível iniciar a reanálise Live. Verifique a sessão e a conexão Alpaca.')
    } finally {
      setBusy(false)
    }
  }, [busy, result?.can_analyze])

  return (
    <div className="trader-manual-recovery" aria-label="Reanálise da Winner Live na sessão atual">
      <div className="trader-manual-recovery-copy">
        <span className="panel-kicker">RECUPERAÇÃO MANUAL · LIVE</span>
        <strong>Reanalisar Winner agora · sessão atual</strong>
        <small>Recalcula a recomendação usando os candles diários completos e o movimento do pregão atual, sem treinar com o candle incompleto.</small>
        <small>{STATES[result?.status] || (result?.can_analyze
          ? STATES.idle
          : 'O mercado regular precisa estar aberto para utilizar o movimento do pregão atual.')}</small>
        <small>
          Pregão: {result?.session || '—'} · Estado: {result?.status || '—'}
          {result?.phase ? ` · Fase: ${result.phase}` : ''}
        </small>
        {result?.status === 'prepared' ? (
          <>
            <small>
              Posição: {result.current_asset || '—'} · Recomendação: {result.target_asset || '—'} · Ação: {result.action || '—'}
            </small>
            <small>
              Decisão original: {result.original_signal_target || '—'}
              {' · '}Histórico até: {result.historical_cutoff || '—'}
              {' · '}Fonte: {String(result.live_feed || '—').toUpperCase()}
              {' · '}Atraso: {result.intraday_data_delay_minutes ?? '—'} min
            </small>
            <small>Esta reanálise é independente da decisão operacional D−1. Não autoriza uma segunda rotação nem libera uma ordem real por conta própria.</small>
          </>
        ) : null}
        {result?.status === 'failed' ? <small role="alert">Falha de análise: {result.failure_type || 'indisponível'}.</small> : null}
        {message ? <small role="status">{message}</small> : null}
      </div>
      <div className="trader-manual-recovery-actions">
        <button type="button" onClick={analyze} disabled={busy || !result?.can_analyze}
          title={result?.can_analyze
            ? 'Calcular recomendação para o pregão atual, sem enviar ordens'
            : 'Requer mercado regular aberto e ausência de outra análise em andamento'}>
          {busy ? 'Solicitando…' : result?.status === 'running' ? 'Reanálise em andamento' : 'Reanalisar Winner agora'}
        </button>
      </div>
    </div>
  )
}
