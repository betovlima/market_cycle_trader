import { useState } from 'react'

import { AppHeader } from './features/backtest/components/AppHeader'
import { BacktestPage } from './features/backtest/components/BacktestPage'
import { useBacktestWorkspace } from './features/backtest/hooks/useBacktestWorkspace'
import { DashboardPage } from './features/dashboard/DashboardPage'
import { PaperPortfolioDashboard } from './features/paperPortfolio/PaperPortfolioDashboard'

export default function App() {
  const workspace = useBacktestWorkspace()
  const [activeTab, setActiveTab] = useState('dashboard')

  async function openBacktest(jobId) {
    setActiveTab('backtest')
    if (jobId) await workspace.selectBacktest(jobId)
  }

  return (
    <div className="app-frame">
      <AppHeader workspace={workspace} activeTab={activeTab} onTabChange={setActiveTab} />

      {workspace.error ? (
        <div className="global-error"><strong>Unable to load data</strong><span>{workspace.error}</span><button type="button" onClick={() => workspace.setError('')}>×</button></div>
      ) : null}

      <main className="workspace-main">
        {activeTab === 'dashboard' ? <DashboardPage workspace={workspace} onOpenBacktest={openBacktest} /> : null}
        {activeTab === 'backtest' ? <BacktestPage workspace={workspace} /> : null}
        {activeTab === 'portfolio' ? <PaperPortfolioDashboard /> : null}
      </main>

      <footer className="app-footer">All activity is simulated. Private configuration remains server-side.</footer>
    </div>
  )
}
