import { useEffect, useState } from 'react'

import { apiFetch } from './api/http'
import { API } from './config/env'
import { AppHeader } from './features/backtest/components/AppHeader'
import { BacktestPage } from './features/backtest/components/BacktestPage'
import { useBacktestWorkspace } from './features/backtest/hooks/useBacktestWorkspace'
import { AdministrationPage } from './features/AdministrationPage'
import { AnalyticsPage } from './features/analytics/AnalyticsPage'
import { DashboardPage } from './features/dashboard/DashboardPage'
import { LoginPage } from './features/LoginPage'
import { PaperPortfolioDashboard } from './features/paperPortfolio/PaperPortfolioDashboard'

function AuthenticatedApp({ session, onLogout, onSessionExpired }) {
  const workspace = useBacktestWorkspace()
  const [activeTab, setActiveTab] = useState('dashboard')

  useEffect(() => {
    if (workspace.running) setActiveTab('backtest')
  }, [workspace.running])

  useEffect(() => {
    const allowed = session.role === 'admin'
      ? ['dashboard', 'backtest', 'analytics', 'portfolio', 'administration']
      : session.role === 'trader'
        ? ['dashboard', 'backtest', 'analytics', 'portfolio']
        : ['dashboard', 'backtest', 'analytics']
    if (!allowed.includes(activeTab)) setActiveTab('dashboard')
  }, [activeTab, session.role])

  return <div className="app-frame">
    <AppHeader workspace={workspace} activeTab={activeTab} onTabChange={setActiveTab} session={session} onLogout={onLogout} />
    {workspace.error ? <div className="global-error"><strong>Unable to load data</strong><span>{workspace.error}</span><button type="button" onClick={() => workspace.setError('')}>×</button></div> : null}
    <main className="workspace-main">
      {activeTab === 'dashboard' ? <DashboardPage workspace={workspace} onOpenBacktest={() => setActiveTab('backtest')} canRunBacktest /> : null}
      {activeTab === 'backtest' ? <BacktestPage workspace={workspace} /> : null}
      {activeTab === 'analytics' ? <AnalyticsPage session={session} dashboard={workspace.dashboard} /> : null}
      {activeTab === 'portfolio' && ['admin', 'trader'].includes(session.role) ? <PaperPortfolioDashboard /> : null}
      {activeTab === 'administration' && session.role === 'admin' ? <AdministrationPage onSessionExpired={onSessionExpired} /> : null}
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
  return <AuthenticatedApp session={session} onLogout={logout} onSessionExpired={expired} />
}
