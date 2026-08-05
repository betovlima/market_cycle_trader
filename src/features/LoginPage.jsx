import { useEffect, useRef, useState } from 'react'

import { apiFetch } from '../api/http'
import { API, GOOGLE_CLIENT_ID } from '../config/env'
import appLogoUrl from '../assets/market-cycle-trader-logo.png'

function accessFromLocation() {
  if (typeof window === 'undefined') return { invitation_id: '', token: '' }
  const hash = new URLSearchParams(window.location.hash.replace(/^#/, ''))
  const query = new URLSearchParams(window.location.search)
  return {
    invitation_id: hash.get('invitation') || query.get('invitation') || '',
    token: hash.get('token') || '',
  }
}

function accessFromInput(value) {
  const text = String(value || '').trim()
  if (!text) return { invitation_id: '', token: '' }
  try {
    const url = new URL(text)
    const hash = new URLSearchParams(url.hash.replace(/^#/, ''))
    return {
      invitation_id: hash.get('invitation') || url.searchParams.get('invitation') || '',
      token: hash.get('token') || '',
    }
  } catch {
    return { invitation_id: '', token: '' }
  }
}

function keepInvitationAndRemoveToken(invitationId) {
  if (typeof window === 'undefined') return
  const url = new URL(window.location.href)
  url.hash = ''
  if (invitationId) url.searchParams.set('invitation', invitationId)
  else url.searchParams.delete('invitation')
  window.history.replaceState({}, document.title, `${url.pathname}${url.search}`)
}

function roleLabel(role) {
  return role === 'trader' ? 'Trader' : 'Viewer'
}

function GoogleIdentityButton({ disabled, onCredential, onError }) {
  const buttonRef = useRef(null)
  const credentialHandlerRef = useRef(onCredential)
  const errorHandlerRef = useRef(onError)

  useEffect(() => { credentialHandlerRef.current = onCredential }, [onCredential])
  useEffect(() => { errorHandlerRef.current = onError }, [onError])

  useEffect(() => {
    if (!GOOGLE_CLIENT_ID || disabled) return undefined
    let cancelled = false
    let attempts = 0
    let timer = null

    function render() {
      if (cancelled) return
      const googleIdentity = window.google?.accounts?.id
      if (!googleIdentity) {
        attempts += 1
        if (attempts > 80) {
          errorHandlerRef.current('Google Sign-In could not be loaded. Refresh the page and try again.')
          return
        }
        timer = window.setTimeout(render, 100)
        return
      }
      try {
        window.__marketCycleGoogleCredentialHandler = (response) => {
          if (response?.credential) credentialHandlerRef.current(response.credential)
          else errorHandlerRef.current('Google did not return a verified identity credential.')
        }
        if (!window.__marketCycleGoogleInitialized) {
          googleIdentity.initialize({
            client_id: GOOGLE_CLIENT_ID,
            callback: (response) => window.__marketCycleGoogleCredentialHandler?.(response),
            auto_select: false,
            cancel_on_tap_outside: true,
            ux_mode: 'popup',
          })
          window.__marketCycleGoogleInitialized = true
        }
        if (buttonRef.current) {
          buttonRef.current.replaceChildren()
          googleIdentity.renderButton(buttonRef.current, {
            type: 'standard',
            theme: 'outline',
            size: 'large',
            text: 'continue_with',
            shape: 'rectangular',
            logo_alignment: 'left',
            width: Math.min(400, Math.max(260, buttonRef.current.clientWidth || 360)),
          })
        }
      } catch (error) {
        errorHandlerRef.current(error?.message || 'Unable to initialize Google Sign-In.')
      }
    }

    render()
    return () => {
      cancelled = true
      if (timer) window.clearTimeout(timer)
    }
  }, [disabled])

  if (!GOOGLE_CLIENT_ID) {
    return <div className="auth-error">Google access is not configured for this frontend.</div>
  }
  return <div className={`google-identity-button ${disabled ? 'disabled' : ''}`} ref={buttonRef} />
}

export function LoginPage({ onAuthenticated }) {
  const passwordRef = useRef(null)
  const initialAccess = useRef(accessFromLocation())
  const [mode, setMode] = useState(initialAccess.current.invitation_id || initialAccess.current.token ? 'guest' : 'guest')
  const [locator, setLocator] = useState(initialAccess.current)
  const [manualLink, setManualLink] = useState('')
  const [preview, setPreview] = useState(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function loadPreview(nextLocator) {
    const body = {}
    if (nextLocator.invitation_id) body.invitation_id = nextLocator.invitation_id
    if (nextLocator.token) body.token = nextLocator.token
    if (!body.invitation_id) {
      setPreview(null)
      setError('This legacy token-only link is no longer valid. Ask the administrator for a new Google-verified invitation.')
      keepInvitationAndRemoveToken('')
      return
    }

    setBusy(true)
    setError('')
    try {
      const value = await apiFetch(`${API}/auth/access/preview`, { method: 'POST', body })
      const normalized = {
        invitation_id: value.invitation_id,
        token: nextLocator.token || '',
      }
      setLocator(normalized)
      setPreview(value)
      keepInvitationAndRemoveToken(value.invitation_id)
    } catch (requestError) {
      setPreview(null)
      setError(requestError.message || 'Unable to open this invitation.')
      keepInvitationAndRemoveToken(nextLocator.invitation_id || '')
    } finally {
      setBusy(false)
    }
  }

  useEffect(() => {
    if (initialAccess.current.invitation_id || initialAccess.current.token) {
      keepInvitationAndRemoveToken(initialAccess.current.invitation_id)
      loadPreview(initialAccess.current)
    }
  }, [])

  async function submitAdmin(event) {
    event.preventDefault()
    setBusy(true)
    setError('')
    try {
      const session = await apiFetch(`${API}/auth/admin/login`, {
        method: 'POST',
        body: { password: passwordRef.current?.value || '' },
      })
      if (passwordRef.current) passwordRef.current.value = ''
      onAuthenticated(session)
    } catch (requestError) {
      setError(requestError.message || 'Unable to open the administrator session.')
    } finally {
      setBusy(false)
    }
  }

  async function submitInvitationLink(event) {
    event.preventDefault()
    const parsed = accessFromInput(manualLink)
    if (!parsed.invitation_id || !parsed.token) {
      setError('Paste the complete invitation link generated in Administration.')
      return
    }
    setManualLink('')
    keepInvitationAndRemoveToken(parsed.invitation_id)
    await loadPreview(parsed)
  }

  async function authenticateGoogle(credential) {
    setBusy(true)
    setError('')
    try {
      const body = {
        invitation_id: preview?.invitation_id || locator.invitation_id || undefined,
        token: locator.token || undefined,
        credential,
      }
      const session = await apiFetch(`${API}/auth/access`, { method: 'POST', body })
      setLocator({ invitation_id: body.invitation_id || '', token: '' })
      onAuthenticated(session)
    } catch (requestError) {
      setError(requestError.message || 'Unable to verify the Google account.')
    } finally {
      setBusy(false)
    }
  }

  function chooseMode(nextMode) {
    setMode(nextMode)
    setError('')
  }

  return (
    <main className="auth-page">
      <section className="auth-card">
        <div className="auth-brand">
          <img src={appLogoUrl} alt="" />
          <div>
            <span>PRIVATE SIMULATION</span>
            <h1>Market Cycle Trader</h1>
            <p>Use an identity-verified Viewer or Trader invitation, or sign in as administrator.</p>
          </div>
        </div>

        <div className="auth-tabs">
          <button className={mode === 'guest' ? 'active' : ''} onClick={() => chooseMode('guest')} type="button">Verified access</button>
          <button className={mode === 'admin' ? 'active' : ''} onClick={() => chooseMode('admin')} type="button">Administrator</button>
        </div>

        {mode === 'admin' ? (
          <form onSubmit={submitAdmin} className="auth-form">
            <label>Administrator password</label>
            <input ref={passwordRef} type="password" required disabled={busy} autoComplete="current-password" />
            {error ? <div className="auth-error">{error}</div> : null}
            <button className="primary-action" disabled={busy}>{busy ? 'Opening session…' : 'Open administrator session'}</button>
          </form>
        ) : preview ? (
          <div className="verified-access-panel">
            <div className="verified-access-heading">
              <span>{roleLabel(preview.role)} invitation</span>
              <strong>{preview.guest_name}</strong>
            </div>
            <dl className="verified-access-details">
              <div><dt>Authorized Google email</dt><dd>{preview.masked_email}</dd></div>
              <div><dt>Invitation status</dt><dd>{preview.status.replaceAll('_', ' ')}</dd></div>
              <div><dt>Expires</dt><dd>{new Date(preview.expires_at).toLocaleString()}</dd></div>
            </dl>
            <p className="verified-access-note">
              Continue with the Google account that owns the authorized email. A different account will be rejected.
            </p>
            {error ? <div className="auth-error">{error}</div> : null}
            <GoogleIdentityButton disabled={busy} onCredential={authenticateGoogle} onError={setError} />
            {busy ? <div className="google-verification-progress"><span className="loading-ring" />Verifying identity…</div> : null}
            <button type="button" className="auth-secondary-action" onClick={() => { setPreview(null); setLocator({ invitation_id: '', token: '' }); keepInvitationAndRemoveToken('') }} disabled={busy}>Use another invitation</button>
          </div>
        ) : (
          <form onSubmit={submitInvitationLink} className="auth-form">
            <label>Complete invitation link</label>
            <input
              value={manualLink}
              onChange={(event) => setManualLink(event.target.value)}
              placeholder="https://…/access#invitation=…&token=…"
              required
              disabled={busy}
              autoComplete="off"
            />
            {error ? <div className="auth-error">{error}</div> : null}
            <button className="primary-action" disabled={busy}>{busy ? 'Checking invitation…' : 'Continue to Google verification'}</button>
          </form>
        )}

        <small>Google credentials are verified by the API and exchanged for a secure HttpOnly session cookie. Raw invitation tokens are never stored in browser storage.</small>
      </section>
    </main>
  )
}
