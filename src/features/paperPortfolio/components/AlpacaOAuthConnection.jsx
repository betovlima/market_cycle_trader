import { useCallback, useEffect, useState } from 'react'
import { tr } from '../../../i18n/runtime'
import { apiFetch } from '../../../api/http'
import { API } from '../../../config/env'

const CALLBACK_MESSAGES = {
  connected: 'Alpaca OAuth connected and verified in read-only mode.',
  denied: 'Alpaca authorization was cancelled.',
  invalid_state: 'The authorization session expired or was invalid. Try again.',
  token_failed: 'Alpaca did not issue the authorization token.',
  permission_failed: 'The authorization returned trading permissions and was rejected.',
  verification_failed: 'Unable to verify the connected Alpaca account.',
  account_mismatch: 'The authorized Alpaca account does not match the current MCT Live account.',
  trading_connected: 'Alpaca trading permission authorized. OAuth Winner execution remains disabled.',
  trading_permission_failed: 'Alpaca did not grant the requested trading permission.',
  trading_unavailable: 'Trading authorization is disabled on the MCT API.',
}

export function AlpacaOAuthConnection() {
  const [status, setStatus] = useState(null)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [winnerReadiness, setWinnerReadiness] = useState(null)

  const refresh = useCallback(async () => {
    const next = await apiFetch(`${API}/alpaca-oauth/status`)
    setStatus(next)
  }, [])

  useEffect(() => {
    let active = true
    const url = new URL(window.location.href)
    const result = url.searchParams.get('alpaca_oauth')
    if (result) {
      if (CALLBACK_MESSAGES[result]) setMessage(CALLBACK_MESSAGES[result])
      url.searchParams.delete('alpaca_oauth')
      window.history.replaceState({}, document.title, `${url.pathname}${url.search}${url.hash}`)
    }
    apiFetch(`${API}/alpaca-oauth/status`)
      .then((next) => { if (active) setStatus(next) })
      .catch(() => { if (active) setError('Unable to read the Alpaca OAuth connection status.') })
    return () => { active = false }
  }, [])

  async function connect() {
    setBusy(true)
    setError('')
    try {
      const result = await apiFetch(`${API}/alpaca-oauth/start`, { method: 'POST' })
      if (!result?.authorization_url?.startsWith('https://app.alpaca.markets/oauth/authorize?')) {
        throw new Error('The authorization destination is invalid.')
      }
      window.location.assign(result.authorization_url)
    } catch (e) {
      setError(e.message)
      setBusy(false)
    }
  }

  async function verify() {
    setBusy(true)
    setError('')
    try {
      const result = await apiFetch(`${API}/alpaca-oauth/verify`)
      setStatus(result)
      setMessage(result?.trading_authorized
        ? 'Alpaca trading permission authorized. OAuth Winner execution remains disabled.'
        : 'Read-only Alpaca connection verified.')
      window.dispatchEvent(new Event('mct:alpaca-oauth-updated'))
    } catch (e) {
      setError(e.message)
    } finally {
      setBusy(false)
    }
  }

  async function disconnect() {
    if (!window.confirm(tr('Disconnect this Alpaca OAuth connection?'))) return
    setBusy(true)
    setError('')
    try {
      await apiFetch(`${API}/alpaca-oauth/disconnect`, { method: 'POST' })
      await refresh()
      setWinnerReadiness(null)
      window.dispatchEvent(new Event('mct:alpaca-oauth-updated'))
      setMessage('The OAuth token was removed from the MCT. You can also revoke the app in Alpaca.')
    } catch (e) {
      setError(e.message)
    } finally {
      setBusy(false)
    }
  }

  async function authorizeTrading() {
    if (!window.confirm(tr('Authorize trading access at Alpaca? This grants broker permission, but does not activate Winner trading.'))) return
    setBusy(true)
    setError('')
    try {
      const result = await apiFetch(`${API}/alpaca-oauth/start-trading`, { method: 'POST' })
      if (!result?.authorization_url?.startsWith('https://app.alpaca.markets/oauth/authorize?')) {
        throw new Error('The authorization destination is invalid.')
      }
      window.location.assign(result.authorization_url)
    } catch (e) {
      setError(e.message)
      setBusy(false)
    }
  }

  async function checkWinnerReadiness() {
    setBusy(true)
    setError('')
    try {
      setWinnerReadiness(await apiFetch(`${API}/alpaca-oauth/winner/readiness`))
    } catch (e) {
      setError(e.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="data-panel portfolio-workspace-panel" aria-label={tr('Alpaca OAuth connection')}>
      <div className="portfolio-workspace-header">
        <div className="portfolio-workspace-title">
          <div>
            <h3>{tr('Alpaca OAuth connection')}</h3>
            <p>{tr('Current MCT administrator · Live account · Read-only pilot')}</p>
          </div>
        </div>
        <div className="portfolio-workspace-actions">
          {status?.connected
            ? <>
              <button className="secondary-action compact" type="button" onClick={verify} disabled={busy}>
                {tr('Verify connection')}
              </button>
              {status.trading_consent_available && !status.trading_authorized ? (
                <button className="secondary-action compact" type="button" onClick={authorizeTrading} disabled={busy}>
                  {tr('Authorize trading permission')}
                </button>
              ) : null}
              <button className="secondary-action compact" type="button" onClick={checkWinnerReadiness} disabled={busy}>
                {tr('Check Winner OAuth readiness')}
              </button>
              <button className="secondary-action compact" type="button" onClick={disconnect} disabled={busy}>
                {tr('Disconnect OAuth')}
              </button>
            </>
            : <button className="secondary-action compact" type="button"
                onClick={connect} disabled={busy || !status?.configured}>
                {tr('Connect with Alpaca')}
              </button>}
        </div>
      </div>
      <p>
        {status?.connected
          ? `${tr('Alpaca connected')} · Live · ${tr('Account')} ...${status.account_id_suffix || ''} · ${tr(status.trading_authorized ? 'Trading scope authorized · Winner OAuth execution disabled' : 'Read-only')}`
          : status?.configured
            ? tr('Alpaca OAuth is ready to authorize the existing Live account.')
            : tr('Alpaca OAuth setup is missing on the API service.')}
      </p>
      <p>{tr('This connection does not enable Winner orders or replace the current Live keys.')}</p>
      {winnerReadiness ? (
        <p role="status">
          {tr('Winner OAuth check')}: {tr(winnerReadiness.status)} · {tr('Trading authorized')}: {winnerReadiness.trading_authorized ? tr('Yes') : tr('No')} · {tr('OAuth order execution')}: {tr('Disabled')}
        </p>
      ) : null}
      {message ? <p role="status">{tr(message)}</p> : null}
      {error ? <p role="alert" className="global-error">{tr(error)}</p> : null}
    </section>
  )
}
