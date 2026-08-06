import { useEffect, useState } from 'react'

import { apiFetch } from './api/http'
import { API } from './config/env'
import { AppHeader } from './features/backtest/components/AppHeader'
import { BacktestPage } from './features/backtest/components/BacktestPage'
import { useBacktestWorkspace } from './features/backtest/hooks/useBacktestWorkspace'
import { AdministrationPage } from './features/AdministrationPage'
import { SystemSettingsPage } from './features/SystemSettingsPage'
import { AnalyticsPage } from './features/analytics/AnalyticsPage'
import { DashboardPage } from './features/dashboard/DashboardPage'
import { LoginPage } from './features/LoginPage'
import { PaperPortfolioDashboard } from './features/paperPortfolio/PaperPortfolioDashboard'

function AuthenticatedApp({ session, onLogout, onSessionExpired, onSessionRefresh }) {
  const workspace = useBacktestWorkspace()
  const [activeTab, setActiveTab] = useState('dashboard')

  useEffect(() => {
    if (workspace.running) setActiveTab('backtest')
  }, [workspace.running])

  useEffect(() => {
    let active = true
    const refreshSession = async () => {
      try {
        const value = await apiFetch(`${API}/auth/session`)
        if (!active) return
        if (!value?.authenticated) onSessionExpired()
        else onSessionRefresh(value)
      } catch (error) {
        if (active && error?.status === 401) onSessionExpired()
      }
    }
    const interval = window.setInterval(refreshSession, 60_000)
    return () => { active = false; window.clearInterval(interval) }
  }, [onSessionExpired, onSessionRefresh])

  const idleRemaining = session.idle_expires_at
    ? Math.max(0, Math.floor((new Date(session.idle_expires_at).getTime() - Date.now()) / 1000))
    : null

  useEffect(() => {
    const allowed = session.role === 'admin'
      ? ['dashboard', 'backtest', 'analytics', 'portfolio', 'administration', 'system-settings']
      : session.role === 'trader'
        ? ['dashboard', 'backtest', 'analytics', 'portfolio']
        : ['dashboard', 'backtest', 'analytics']
    if (!allowed.includes(activeTab)) setActiveTab('dashboard')
  }, [activeTab, session.role])

  return <div className="app-frame">
    <AppHeader workspace={workspace} activeTab={activeTab} onTabChange={setActiveTab} session={session} onLogout={onLogout} />
    {idleRemaining !== null && idleRemaining <= 300 ? <div className="session-expiration-warning">Your session will expire soon.</div> : null}
    {workspace.error ? <div className="global-error"><strong>Unable to load data</strong><span>{workspace.error}</span><button type="button" onClick={() => workspace.setError('')}>×</button></div> : null}
    <main className="workspace-main">
      {activeTab === 'dashboard' ? <DashboardPage workspace={workspace} onOpenBacktest={() => setActiveTab('backtest')} canRunBacktest /> : null}
      {activeTab === 'backtest' ? <BacktestPage workspace={workspace} canExportResults={session.role === 'admin'} /> : null}
      {activeTab === 'analytics' ? <AnalyticsPage session={session} dashboard={workspace.dashboard} /> : null}
      {activeTab === 'portfolio' && ['admin', 'trader'].includes(session.role) ? <PaperPortfolioDashboard /> : null}
      {activeTab === 'administration' && session.role === 'admin' ? <AdministrationPage onSessionExpired={onSessionExpired} /> : null}
      {activeTab === 'system-settings' && session.role === 'admin' ? <SystemSettingsPage onSessionExpired={onSessionExpired} /> : null}
    </main>
    <footer className="app-footer">All activity is simulated. Private configuration remains server-side.</footer>
  </div>
}

export default function App() {
  const [state, setState] = useState('checking')
  const [session, setSession] = useState(null)
  const [error, setError] = useState('')

  useEffect(() => {
    let active = true
    apiFetch(`${API}/auth/session`).then((value) => {
      if (!active) return
      if (value?.authenticated) { setSession(value); setState('authenticated') }
      else { setState('anonymous') }
    }).catch((e) => { if (active) { setError(e.message); setState('anonymous') } })
    return () => { active = false }
  }, [])

  function expired() { setSession(null); setState('anonymous') }
  async function logout() { try { await apiFetch(`${API}/auth/logout`, { method: 'POST' }) } finally { expired() } }

  if (state === 'checking') return <div className="app-loading">Checking private session…</div>
  if (state !== 'authenticated' || !session) return <><LoginPage onAuthenticated={(value) => { setError(''); setSession(value); setState('authenticated') }} />{error ? <div className="startup-error">{error}</div> : null}</>
  return <AuthenticatedApp session={session} onLogout={logout} onSessionExpired={expired} onSessionRefresh={setSession} />
}
