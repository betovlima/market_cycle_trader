import { useCallback, useEffect, useState } from 'react'
import { apiFetch } from '../../../api/http'
import { API } from '../../../config/env'
import { tr } from '../../../i18n/runtime'

const ENDPOINT = `${API}/live-market/winner/daily-recalculation`
const STATE_TEXT = {
  ready: 'A signal is missing. Completed daily data is available for preparation.',
  queued: 'Daily Winner preparation requested. The Live scheduler will process the pending signal.',
  already_prepared: 'The validated daily Winner signal is already prepared. It will not be overwritten.',
  processing: 'The daily Winner signal is being prepared.',
  market_open: 'Market is open. Daily-only recalculation is available after the regular close and daily data delay.',
  waiting_daily_bar: 'Waiting for the completed daily bar and its safety delay.',
  outside_window: 'Daily recalculation is outside the permitted post-close window.',
  inactive: 'Live is not active. Enable Live in settings before requesting daily preparation.',
  blocked: 'This Live session was already executed or requires review. The decision cannot be replaced.',
  unavailable: 'Daily recalculation status is unavailable.',
  already_claimed: 'Another Live process already claimed this daily signal.',
}

export function LiveDailyRecalculation() {
  const [state, setState] = useState(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  const refresh = useCallback(async () => {
    try {
      const response = await apiFetch(`${ENDPOINT}/status`, { cache: 'no-store' })
      setState(response)
      setError('')
    } catch {
      // Never turn a failed eligibility request into a clickable order action.
      setState(null)
      setError(tr('Daily Winner status is temporarily unavailable.'))
    }
  }, [])

  useEffect(() => {
    refresh()
    const timer = window.setInterval(refresh, 30000)
    return () => window.clearInterval(timer)
  }, [refresh])

  const request = useCallback(async () => {
    if (!state?.can_request || busy) return
    if (!window.confirm(tr('Request a completed-daily Winner signal for the next session? This request does not send orders, but a prepared plan may be executed automatically at the next opening when Live is active.'))) return
    setBusy(true)
    setError('')
    setNotice('')
    try {
      const result = await apiFetch(`${ENDPOINT}/request`, {
        method: 'POST',
        body: { confirm: 'REQUEST_DAILY_SIGNAL_NO_ORDERS' },
      })
      setState(result)
      setNotice(tr(STATE_TEXT[result?.status] || 'Daily Winner request was received.'))
      await refresh()
    } catch {
      setError(tr('Daily Winner request was not accepted. Check the Live workflow monitor.'))
      await refresh()
    } finally {
      setBusy(false)
    }
  }, [busy, refresh, state?.can_request])

  return (
    <section className="trader-manual-recovery live-daily-recalculation"
      aria-label={tr('Daily Winner recalculation')}>
      <div className="trader-manual-recovery-copy">
        <span className="panel-kicker">{tr('Winner · Live')}</span>
        <strong>{tr('Recalculate Winner using daily history')}</strong>
        <small>{tr('Uses only completed XNYS daily bars. No intraday retraining or replacement of an executed decision.')}</small>
        <small className="live-daily-recalculation-state" role="status" aria-live="polite">
          {tr(STATE_TEXT[state?.status] || 'Checking daily signal availability…')}
          {' · '}{tr('Decision date')}: {state?.decision_date || '—'}
          {' · '}{tr('Next execution session')}: {state?.execution_session || '—'}
        </small>
        <small>{tr('No order is sent by this action. If Live remains active, a prepared signal may be traded automatically during the next regular session.')}</small>
        {notice ? <small role="status" className="global-inline-message">{notice}</small> : null}
        {error ? <small role="alert" className="inline-error">{error}</small> : null}
      </div>
      <div className="trader-manual-recovery-actions">
        {state?.can_request ? (
          <button type="button"
            disabled={busy}
            title={tr(STATE_TEXT[state?.status] || 'Daily Winner status is temporarily unavailable.')}
            onClick={request}>
            {tr(busy ? 'Requesting…' : 'Recalculate Winner using daily history')}
          </button>
        ) : (
          <small className="live-daily-ineligible-note">
            Preparação D−1 indisponível agora. Para analisar o pregão atual sem enviar ordens, use “Reanalisar Winner agora” abaixo.
          </small>
        )}
      </div>
    </section>
  )
}
