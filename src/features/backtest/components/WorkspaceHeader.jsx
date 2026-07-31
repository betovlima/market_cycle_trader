import { FRONT_VERSION } from '../../../config/env'

export function WorkspaceHeader({ workspace }) {
  const {
    results,
    error,
    setError,
    apiVersion,
    computeStatus,
    activeWorkspaceTab,
    setActiveWorkspaceTab,
  } = workspace

  return (
    <>
      <header className="topbar">
        <div>
          <div className="eyebrow">LOCAL RESEARCH ENVIRONMENT</div>
          <h1>Market Cycle Trader</h1>
          <p>Compare cycle strategies and shared-capital rotation models across assets.</p>
        </div>
        <div className="topbar-actions">
          <span className="simulation-badge">API v{apiVersion}</span>
          <span className="simulation-badge">Front v{FRONT_VERSION}</span>
          <span className="simulation-badge">
            XGB {computeStatus?.xgboost?.device_available?.toUpperCase() || '…'}
          </span>
          <span className="simulation-badge">
            QR-DQN {computeStatus?.qrdqn?.device_available?.toUpperCase() || '…'}
            {computeStatus?.gpu_name && computeStatus?.qrdqn?.cuda_available
              ? ` · ${computeStatus.gpu_name}`
              : ''}
          </span>
          <span className="simulation-badge">Simulation only</span>
          {results && (
            <a className="button secondary" href={results.downloads.zip}>Export all results</a>
          )}
        </div>
      </header>

      {error && <div className="error-banner"><strong>Error</strong><span>{error}</span><button onClick={() => setError('')}>×</button></div>}

      <nav
        className="inline-actions"
        role="tablist"
        aria-label="Market Cycle Trader workspace"
      >
        <button
          type="button"
          role="tab"
          aria-selected={activeWorkspaceTab === 'analysis'}
          className={`button ${activeWorkspaceTab === 'analysis' ? 'secondary' : 'ghost'}`}
          onClick={() => setActiveWorkspaceTab('analysis')}
        >
          Analysis
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={activeWorkspaceTab === 'advanced'}
          className={`button ${activeWorkspaceTab === 'advanced' ? 'secondary' : 'ghost'}`}
          onClick={() => setActiveWorkspaceTab('advanced')}
        >
          Advanced parameters
        </button>
      </nav>
    </>
  )
}
