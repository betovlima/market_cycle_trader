import { useState } from 'react'
import { apiFetch } from '../../../api/http'
import { API } from '../../../config/env'
import { tr } from '../../../i18n/runtime'
import './LiveReconciliation.css'

/** Two-step broker-backed reconciliation; never invokes an order endpoint. */
export function LiveReconciliation({ executionSession, onReconciled }) {
  const [manualSession, setManualSession] = useState('')
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState('')
  const [outcome, setOutcome] = useState('')

  async function reconcile() {
    if (loading) return
    setLoading(true)
    setMessage('')
    setOutcome('')
    try {
      const checkedSession = manualSession || executionSession
      const query = checkedSession ? '?' + new URLSearchParams({ execution_session: checkedSession }) : ''
      const preview = await apiFetch(API + '/live-market/winner/manual-reconciliation/preview' + query, {
        cache: 'no-store',
      })
      if (preview.status === 'already_reconciled') {
        setOutcome('success')
        setMessage('A rotação manual já está conciliada no MCT. Nenhuma alteração necessária.')
        return
      }
      if (preview.status === 'blocked') {
        setOutcome('warning')
        setMessage(preview.message || 'A conferência não foi concluída. Nenhuma alteração foi feita.')
        return
      }
      if (preview.status === 'pause_required') {
        setOutcome('warning')
        setMessage('Pause ou pare o Trader Live antes de confirmar. Nenhuma ordem foi enviada.')
        return
      }
      if (preview.status !== 'ready' || !preview.confirmation_token) {
        setOutcome('warning')
        setMessage('Não foi possível comprovar as ordens manuais. Nenhuma alteração foi feita.')
        return
      }
      const info = [
        'RECONCILIAÇÃO LIVE — NENHUMA ORDEM SERÁ ENVIADA',
        '',
        'Sessão: ' + preview.execution_session,
        'Plano do MCT: ' + preview.source + ' → ' + preview.target,
        'Posição na Alpaca: ' + Number(preview.broker_quantity).toFixed(9) + ' ' + preview.target,
        'Comprovantes: ' + preview.sell_order_count + ' venda(s) e ' + preview.buy_order_count + ' compra(s) preenchida(s)',
        '',
        'Serão atualizados o estado interno do MCT e o status da sessão,',
        'sem comprar, vender ou cancelar ordens na Alpaca.',
        '',
        'Confirmar a reconciliação?',
      ].join('\n')
      if (!window.confirm(info)) {
        setMessage('Conferência concluída; reconciliação não confirmada. Nenhuma alteração foi feita.')
        return
      }
      const result = await apiFetch(API + '/live-market/winner/manual-reconciliation/apply', {
        method: 'POST',
        body: {
          execution_session: preview.execution_session,
          confirmation_token: preview.confirmation_token,
          confirm: 'RECONCILE_MANUAL_FILLS_NO_ORDERS',
        },
      })
      if (!['reconciled', 'already_reconciled'].includes(result.status)) {
        throw new Error('Resposta de reconciliação inesperada. Verifique o monitor Live.')
      }
      setOutcome('success')
      setMessage(result.status === 'reconciled'
        ? 'Conciliação concluída: ' + result.source + ' → ' + result.target + '. Nenhuma ordem enviada.'
        : 'Sessão já conciliada; nenhuma alteração necessária.')
      await onReconciled?.()
    } catch (error) {
      setOutcome('warning')
      setMessage(error.message || 'Falha na reconciliação. Verifique as ordens antes de tentar novamente.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="live-reconciliation">
      <label className="live-reconciliation-session">
        {tr("Trading session")}
        <input type="date" aria-label={tr("Session to reconcile")}
          value={manualSession || executionSession || ''}
          onChange={(event) => setManualSession(event.target.value)}
          disabled={loading} />
      </label>
      <button type="button" className="secondary-action compact live-reconciliation-action"
        onClick={reconcile} disabled={loading}
        title={tr("Check Alpaca fills and internal position without submitting orders")}>
        {tr(loading ? 'Checking Alpaca…' : 'Reconcile')}
      </button>
      {message ? <span role="status" className={'live-reconciliation-message ' + outcome}>{message}</span> : null}
    </div>
  )
}
