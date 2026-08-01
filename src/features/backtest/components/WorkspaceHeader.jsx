import { FRONT_VERSION, apiDownloadUrl } from '../../../config/env'

export function WorkspaceHeader({ workspace }) {
  const {
    results,
    error,
    setError,
    apiVersion,
  } = workspace

  return (
    <>
      <header className="topbar">
        <div>
          <div className="eyebrow">HISTORICAL STRATEGY SIMULATION</div>
          <h1>Market Cycle Trader</h1>
          <p>Run the validated strategy across a selected historical period.</p>
        </div>
        <div className="topbar-actions">
          <span className="simulation-badge">API v{apiVersion}</span>
          <span className="simulation-badge">Front v{FRONT_VERSION}</span>
          <span className="simulation-badge">Simulation only</span>
          {results && (
            <a className="button secondary" href={apiDownloadUrl(results.downloads.zip)}>Export all results</a>
          )}
        </div>
      </header>

      {error && <div className="error-banner"><strong>Error</strong><span>{error}</span><button onClick={() => setError('')}>×</button></div>}
    </>
  )
}
