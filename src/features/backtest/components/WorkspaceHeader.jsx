import { useState } from 'react'

import { downloadApiFile } from '../../../api/download'
import { FRONT_VERSION } from '../../../config/env'

export function WorkspaceHeader({ workspace }) {
  const { results, error, setError, apiVersion } = workspace
  const [exporting, setExporting] = useState(false)

  async function exportAllResults() {
    if (!results?.downloads?.zip || exporting) return
    setError('')
    setExporting(true)
    try {
      await downloadApiFile(
        results.downloads.zip,
        `market_cycle_trader_${results.jobId || 'results'}.zip`,
      )
    } catch (exportError) {
      setError(exportError.message)
    } finally {
      setExporting(false)
    }
  }

  return (
    <>
      <header className="topbar">
        <div>
          <div className="eyebrow">MARKET ANALYSIS</div>
          <h1>Market Cycle Trader</h1>
          <p>Review portfolio performance over a selected analysis window.</p>
        </div>
        <div className="topbar-actions">
          <span className="simulation-badge">API v{apiVersion}</span>
          <span className="simulation-badge">Front v{FRONT_VERSION}</span>
          <span className="simulation-badge">Paper environment</span>
          {results && (
            <button
              className="button secondary"
              type="button"
              onClick={exportAllResults}
              disabled={exporting}
            >
              {exporting ? 'Preparing export…' : 'Export results'}
            </button>
          )}
        </div>
      </header>

      {error && <div className="error-banner"><strong>Error</strong><span>{error}</span><button onClick={() => setError('')}>×</button></div>}
    </>
  )
}
