import { useEffect, useRef, useState } from 'react'
import { apiFetch } from '../api/http'
import { API } from '../config/env'
import appLogoUrl from '../assets/market-cycle-trader-logo.png'

function tokenFromLocation() {
  if (typeof window === 'undefined') return ''
  return new URLSearchParams(window.location.hash.replace(/^#/, '')).get('token') || ''
}
function clearToken() {
  if (typeof window === 'undefined' || !window.location.hash) return
  window.history.replaceState({}, document.title, `${window.location.pathname}${window.location.search}`)
}

export function LoginPage({ onAuthenticated }) {
  const passwordRef = useRef(null)
  const autoSubmitted = useRef(false)
  const [mode, setMode] = useState('viewer')
  const [token, setToken] = useState(() => tokenFromLocation())
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function viewerLogin(value) {
    const session = await apiFetch(`${API}/auth/access`, { method: 'POST', body: { token: value } })
    setToken('')
    onAuthenticated(session)
  }

  useEffect(() => {
    const value = token.trim()
    if (!value || autoSubmitted.current) return
    autoSubmitted.current = true
    clearToken()
    setBusy(true)
    viewerLogin(value).catch((e) => setError(e.message)).finally(() => setBusy(false))
  }, [])

  async function submit(event) {
    event.preventDefault()
    setBusy(true); setError('')
    try {
      if (mode === 'admin') {
        const session = await apiFetch(`${API}/auth/admin/login`, { method: 'POST', body: { password: passwordRef.current?.value || '' } })
        if (passwordRef.current) passwordRef.current.value = ''
        onAuthenticated(session)
      } else {
        await viewerLogin(token.trim())
      }
    } catch (e) { setError(e.message || 'Unable to open the private session.') }
    finally { setBusy(false) }
  }

  return <main className="auth-page"><section className="auth-card">
    <div className="auth-brand"><img src={appLogoUrl} alt="" /><div><span>PRIVATE SIMULATION</span><h1>Market Cycle Trader</h1><p>Open a temporary Viewer or Trader link, or sign in as administrator.</p></div></div>
    <div className="auth-tabs"><button className={mode === 'viewer' ? 'active' : ''} onClick={() => setMode('viewer')} type="button">Temporary access</button><button className={mode === 'admin' ? 'active' : ''} onClick={() => setMode('admin')} type="button">Administrator</button></div>
    <form onSubmit={submit} className="auth-form">
      {mode === 'admin' ? <><label>Administrator password</label><input ref={passwordRef} type="password" required disabled={busy} autoComplete="current-password" /></> : <><label>Temporary access token</label><input value={token} onChange={(e) => setToken(e.target.value.toUpperCase())} placeholder="MCT-XXXX-XXXX-XXXX" required disabled={busy} /></>}
      {error ? <div className="auth-error">{error}</div> : null}
      <button className="primary-action" disabled={busy}>{busy ? 'Opening session…' : 'Open private session'}</button>
    </form>
    <small>The credential is exchanged for a secure HttpOnly session cookie and is never stored in browser storage.</small>
  </section></main>
}
