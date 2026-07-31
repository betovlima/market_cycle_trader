import { AdvancedParametersPanel } from './features/backtest/components/AdvancedParametersPanel'
import { ConfigurationPanel } from './features/backtest/components/ConfigurationPanel'
import { ExecutionStatus } from './features/backtest/components/ExecutionStatus'
import { ResultsDashboard } from './features/backtest/components/ResultsDashboard'
import { WorkspaceHeader } from './features/backtest/components/WorkspaceHeader'
import { useBacktestWorkspace } from './features/backtest/hooks/useBacktestWorkspace'

export default function App() {
  const workspace = useBacktestWorkspace()

  return (
    <main className="app-shell">
      <WorkspaceHeader workspace={workspace} />

      <section className="control-panel">
        {workspace.activeWorkspaceTab === 'analysis' ? (
          <ConfigurationPanel workspace={workspace} />
        ) : (
          <AdvancedParametersPanel workspace={workspace} />
        )}
      </section>

      {workspace.activeWorkspaceTab === 'analysis' && (
        <>
          <ExecutionStatus workspace={workspace} />
          <ResultsDashboard workspace={workspace} />
        </>
      )}

      <footer>
        Historical market data comes from the provider selected by the active strategy
        (Yahoo Finance or Alpaca). No real or paper orders are created.
      </footer>
    </main>
  )
}

