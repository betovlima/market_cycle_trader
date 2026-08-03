import { FRONT_VERSION, resolveApiResourceUrl } from '../../../config/env'

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
        <div className="brand-identity">
          <img
            className="app-logo"
            src="/icons/app-icon-256.png?v=1.12.26"
            alt=""
            width="96"
            height="96"
            decoding="async"
            fetchPriority="high"
          />
          <div className="brand-copy">
            <div className="eyebrow">HISTORICAL MARKET SIMULATION</div>
            <h1>Market Cycle Trader</h1>
            <p>Run the active protected configuration without public parameters.</p>
          </div>
        </div>
        <div className="topbar-actions">
          <span className="simulation-badge">API v{apiVersion}</span>
          <span className="simulation-badge">Front v{FRONT_VERSION}</span>
          <span className="simulation-badge">Simulation only</span>
          {results && (
            <a className="button secondary" href={resolveApiResourceUrl(results.downloads.zip)}>Export all results</a>
          )}
        </div>
      </header>

      {error && <div className="error-banner"><strong>Error</strong><span>{error}</span><button onClick={() => setError('')}>×</button></div>}
    </>
  )
}
