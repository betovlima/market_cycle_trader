import { tr } from './i18n/runtime'
import { useCallback, useEffect, useState } from 'react'

import { apiFetch } from './api/http'
import { API, FRONT_VERSION } from './config/env'
import { useI18n } from './i18n/I18nProvider'
import { AppHeader } from './features/backtest/components/AppHeader'
import { BacktestPage } from './features/backtest/components/BacktestPage'
import { useBacktestWorkspace } from './features/backtest/hooks/useBacktestWorkspace'
import { AdministrationPage } from './features/AdministrationPage'
import { SystemSettingsPage } from './features/SystemSettingsPage'
import { AnalyticsPage } from './features/analytics/AnalyticsPage'
import { AssetDiscoveryPage } from './features/assetDiscovery/AssetDiscoveryPage'
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
      ? ['dashboard', 'backtest', 'analytics', 'asset-discovery', 'portfolio', 'administration', 'system-settings']
      : session.role === 'trader'
        ? ['dashboard', 'backtest', 'analytics', 'portfolio']
        : ['dashboard', 'backtest', 'analytics']
    if (!allowed.includes(activeTab)) setActiveTab('dashboard')
  }, [activeTab, session.role])

  return <div className="app-frame">
    <AppHeader activeTab={activeTab} onTabChange={setActiveTab} session={session} onLogout={onLogout} />
    {idleRemaining !== null && idleRemaining <= 300 ? <div className="session-expiration-warning">{tr("Your session will expire soon.")}</div> : null}
    {workspace.error ? <div className="global-error"><strong>{tr("Unable to load data")}</strong><span>{tr(workspace.error)}</span><button type="button" onClick={() => workspace.setError('')}>×</button></div> : null}
    <main className="workspace-main">
      {activeTab === 'dashboard' ? <DashboardPage workspace={workspace} onOpenBacktest={() => setActiveTab('backtest')} canRunBacktest /> : null}
      {activeTab === 'backtest' ? <BacktestPage workspace={workspace} canExportResults={session.role === 'admin'} canRunResearchModels={session.role === 'admin'} /> : null}
      {activeTab === 'analytics' ? <AnalyticsPage session={session} dashboard={workspace.dashboard} /> : null}
      {activeTab === 'asset-discovery' && session.role === 'admin' ? <AssetDiscoveryPage onSessionExpired={onSessionExpired} /> : null}
      {activeTab === 'portfolio' && ['admin', 'trader'].includes(session.role) ? <PaperPortfolioDashboard /> : null}
      {activeTab === 'administration' && session.role === 'admin' ? <AdministrationPage onSessionExpired={onSessionExpired} /> : null}
      {activeTab === 'system-settings' && session.role === 'admin' ? <SystemSettingsPage onSessionExpired={onSessionExpired} /> : null}
    </main>
    <footer className="app-footer">
      <span>{tr("All activity is simulated. Private configuration remains server-side.")}</span>
      <span className="app-footer-divider" aria-hidden="true">•</span>
      <span className="app-footer-versions">
        <span>{tr("API v")}{workspace.apiVersion}</span>
        <span>{tr("Front v")}{FRONT_VERSION}</span>
      </span>
    </footer>
  </div>
}

export default function App() {
  useI18n()
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

  const expired = useCallback(() => {
    setSession(null)
    setState('anonymous')
  }, [])

  const logout = useCallback(async () => {
    try {
      await apiFetch(`${API}/auth/logout`, { method: 'POST' })
    } finally {
      expired()
    }
  }, [expired])

  const authenticated = useCallback((value) => {
    setError('')
    setSession(value)
    setState('authenticated')
  }, [])

  if (state === 'checking') return <div className="app-loading">{tr("Checking private session…")}</div>
  if (state !== 'authenticated' || !session) return <><LoginPage onAuthenticated={authenticated} />{error ? <div className="startup-error">{tr(error)}</div> : null}</>
  return <AuthenticatedApp session={session} onLogout={logout} onSessionExpired={expired} onSessionRefresh={setSession} />
}
