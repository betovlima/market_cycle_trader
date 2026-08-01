import { useState } from 'react'

import { ConfigurationPanel } from './features/backtest/components/ConfigurationPanel'
import { ExecutionStatus } from './features/backtest/components/ExecutionStatus'
import { ResultsDashboard } from './features/backtest/components/ResultsDashboard'
import { WorkspaceHeader } from './features/backtest/components/WorkspaceHeader'
import { useBacktestWorkspace } from './features/backtest/hooks/useBacktestWorkspace'
import { PaperPortfolioDashboard } from './features/paperPortfolio/PaperPortfolioDashboard'

const TABS = {
  PORTFOLIO: 'portfolio',
  BACKTEST: 'backtest',
}

export default function App() {
  const workspace = useBacktestWorkspace()
  const [activeTab, setActiveTab] = useState(TABS.PORTFOLIO)

  return (
    <main className="app-shell">
      <WorkspaceHeader workspace={workspace} />

      <section className="workspace-tabs" aria-label="Main workspace sections">
        <button
          type="button"
          className={`workspace-tab ${activeTab === TABS.PORTFOLIO ? 'active' : ''}`}
          onClick={() => setActiveTab(TABS.PORTFOLIO)}
        >
          Alpaca portfolio
        </button>
        <button
          type="button"
          className={`workspace-tab ${activeTab === TABS.BACKTEST ? 'active' : ''}`}
          onClick={() => setActiveTab(TABS.BACKTEST)}
        >
          Backtest
        </button>
      </section>

      {activeTab === TABS.PORTFOLIO ? (
        <PaperPortfolioDashboard />
      ) : (
        <>
          <section className="control-panel">
            <ConfigurationPanel workspace={workspace} />
          </section>

          <ExecutionStatus workspace={workspace} />
          <ResultsDashboard workspace={workspace} />
        </>
      )}

      <footer>
        The portfolio tab follows the paper account. The analysis tab shows historical performance for the selected evaluation window.
      </footer>
    </main>
  )
}
