import { useCallback, useEffect, useState } from 'react'
import { apiFetch, downloadFile } from '../../api/http'
import { API } from '../../config/env'
import { tr } from '../../i18n/runtime'

const LABELS = {
  'equity_history.csv': 'Equity history',
  'rotations.csv': 'Recorded rotations',
  'decision_scores.csv': 'Saved decision scores',
  'metrics.json': 'Performance metrics',
  'analytics.json': 'Complete replay analytics',
  'manifest.json': 'Checksum manifest',
  'package.zip': 'Complete download package',
}

const DETAILS = {
  'equity_history.csv': 'Recorded capital, reference and drawdown per session',
  'rotations.csv': 'Executed reallocations and recorded transaction values',
  'decision_scores.csv': 'Only the decision scores that were saved for this backtest',
  'metrics.json': 'Metrics and diagnostics stored for this backtest',
  'analytics.json': 'All analytics returned for the selected backtest',
  'manifest.json': 'SHA-256 checksums, identity and limitations of the export',
  'package.zip': 'All available files bundled in a ZIP',
}

const bytesLabel = (bytes) => {
  if (bytes === null || bytes === undefined) return ''
  const count = Number(bytes)
  if (!Number.isFinite(count) || count < 0) return ''
  return count < 1024 ? count + ' B' : count < 1024 ** 2
    ? (count / 1024).toFixed(1) + ' KB'
    : (count / 1024 ** 2).toFixed(1) + ' MB'
}

export function AnnualReplayFiles({ jobId, onSessionExpired }) {
  const [loaded, setLoaded] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [downloading, setDownloading] = useState('')

  useEffect(() => {
    if (!jobId) { setLoaded(null); return undefined }
    let active = true
    setLoaded(null)
    setLoading(true)
    setError('')
    setDownloading('')
    apiFetch(API + '/analytics/backtests/' + encodeURIComponent(jobId) + '/files')
      .then((data) => { if (active) setLoaded(data?.job_id === jobId ? data : null) })
      .catch((reason) => {
        if (!active) return
        if (reason?.status === 401) onSessionExpired?.()
        const routeMissing = reason?.status === 404 && String(reason?.message || '').trim().toLowerCase() === 'not found'
        setError(routeMissing
          ? tr('The connected API does not provide historical backtest downloads. Run API v10.8.131 or newer; there is no need to repeat old backtests.')
          : reason?.message || tr('Unable to list replay files'))
      })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [jobId, onSessionExpired])

  const download = useCallback(async (filename) => {
    if (!jobId || downloading || !loaded || loaded.job_id !== jobId) return
    setDownloading(filename)
    setError('')
    try {
      await downloadFile(
        API + '/analytics/backtests/' + encodeURIComponent(jobId) + '/files/' + encodeURIComponent(filename),
        'backtest_' + jobId.replace(/[^a-zA-Z0-9_-]/g, '_') + '_' + filename,
      )
    } catch (reason) {
      if (reason?.status === 401) onSessionExpired?.()
      setError(reason?.message || tr('Unable to download replay file'))
    } finally {
      setDownloading('')
    }
  }, [jobId, downloading, loaded, onSessionExpired])

  const files = loaded?.job_id === jobId ? loaded.files || [] : []
  return <section className="annual-replay-panel annual-replay-export" aria-label={tr('Execution files')}>
    <div className="annual-replay-panel-titleline">
      <div>
        <h3>{tr('Execution files')}</h3>
        <p className="annual-replay-help">{tr('Downloads belong to the selected backtest, including all available years, regardless of the month on screen.')}</p>
      </div>
      <span className="annual-replay-tag">{tr('Read-only')}</span>
    </div>
    {loading ? <p className="annual-replay-help" role="status">{tr('Loading execution files…')}</p> : null}
    {error ? <p className="annual-replay-message error" role="alert">{error}</p> : null}
    {!loading && !error && files.length === 0 ? <p className="annual-replay-help">{tr('No execution files are available.')}</p> : null}
    {files.length ? <div className="annual-replay-export-list">
      {files.map((file) => <div className="annual-replay-export-item" key={file.name}>
        <div>
          <strong>{tr(LABELS[file.name] || file.name)}</strong>
          <span className="annual-replay-export-name">{file.name}{bytesLabel(file.bytes) ? ' · ' + bytesLabel(file.bytes) : ''}</span>
          <p className="annual-replay-help">{tr(DETAILS[file.name] || 'Available historical export')}</p>
        </div>
        <button type="button" disabled={Boolean(downloading) || loaded.job_id !== jobId}
          onClick={() => download(file.name)}
          aria-label={tr('Download {name}', { name: file.name })}>
          {downloading === file.name ? tr('Downloading…') : tr('Download')}
        </button>
      </div>)}
    </div> : null}
    <p className="annual-replay-help annual-replay-export-note">{tr('Files are generated from saved backtest analytics. They are not original scientific inputs and do not by themselves prove experiment reproducibility. Missing data is not reconstructed.')}</p>
  </section>
}
