import { useCallback, useEffect, useMemo, useState } from 'react'
import { apiFetch, downloadFile } from '../../api/http'
import { API } from '../../config/env'
import { tr } from '../../i18n/runtime'
import { buildLocalReplayDownload, listLocalReplayFiles } from './annualReplayExport.mjs'

const LABELS = {
  'equity_history.csv': 'Equity history',
  'rotations.csv': 'Recorded rotations',
  'cash_periods.csv': 'Cash exposure periods',
  'decision_scores.csv': 'Saved decision scores',
  'metrics.json': 'Performance metrics',
  'analytics.json': 'Complete replay analytics',
  'manifest.json': 'Checksum manifest',
  'package.zip': 'Complete download package',
}

const DETAILS = {
  'equity_history.csv': 'Recorded capital, reference and drawdown per session',
  'rotations.csv': 'Executed reallocations and recorded transaction values',
  'cash_periods.csv': 'Recorded entry, exit and market-close sessions spent in CASH',
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

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  // Give the browser time to start the download before revoking this object URL.
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export function AnnualReplayFiles({ jobId, analytics, onSessionExpired }) {
  const [remote, setRemote] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [downloading, setDownloading] = useState('')
  const local = useMemo(
    () => analytics?.job_id === jobId ? listLocalReplayFiles(analytics) : null,
    [analytics, jobId],
  )

  useEffect(() => {
    if (!jobId) { setRemote(null); return undefined }
    let active = true
    setRemote(null)
    setLoading(true)
    setError('')
    apiFetch(API + '/analytics/backtests/' + encodeURIComponent(jobId) + '/files')
      .then((data) => { if (active) setRemote(data?.job_id === jobId ? data : null) })
      .catch((reason) => {
        if (!active) return
        if (reason?.status === 401) { onSessionExpired?.(); return }
        // Older APIs don't have /files; the playback already fetched the
        // same persisted historical data from /analytics/backtests/{job_id}.
        // A missing download endpoint is not a missing backtest.
        if (!local) setError(reason?.message || tr('Unable to list replay files'))
      })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [jobId, local, onSessionExpired])

  const selected = remote?.job_id === jobId ? remote : local
  const usingLocal = Boolean(selected && selected === local)

  const download = useCallback(async (filename) => {
    if (!jobId || downloading || !selected || selected.job_id !== jobId) return
    setDownloading(filename)
    setError('')
    const name = 'backtest_' + jobId.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 70) + '_' + filename
    try {
      if (usingLocal || (analytics && ['cash_periods.csv', 'manifest.json', 'package.zip'].includes(filename))) {
        if (!analytics) throw new Error('Saved analytics are unavailable.')
        downloadBlob(await buildLocalReplayDownload(analytics, filename), name)
      } else {
        try {
          await downloadFile(
            API + '/analytics/backtests/' + encodeURIComponent(jobId) + '/files/' + encodeURIComponent(filename),
            name,
          )
        } catch (reason) {
          if (reason?.status !== 404 || !local || !analytics) throw reason
          downloadBlob(await buildLocalReplayDownload(analytics, filename), name)
        }
      }
    } catch (reason) {
      if (reason?.status === 401) onSessionExpired?.()
      setError(reason?.message || tr('Unable to download replay file'))
    } finally {
      setDownloading('')
    }
  }, [jobId, downloading, selected, usingLocal, analytics, local, onSessionExpired])

  const selectedFiles = selected?.job_id === jobId ? selected.files || [] : []
  const additionalCash = local?.files?.find(file => file.name === 'cash_periods.csv')
  const files = additionalCash && !selectedFiles.some(file => file.name === 'cash_periods.csv')
    ? [...selectedFiles, additionalCash]
    : selectedFiles
  return <section className="annual-replay-panel annual-replay-export" aria-label={tr('Execution files')}>
    <div className="annual-replay-panel-titleline">
      <div>
        <h3>{tr('Execution files')}</h3>
        <p className="annual-replay-help">{tr('Downloads belong to the selected backtest, including all available years, regardless of the month on screen.')}</p>
      </div>
      <span className="annual-replay-tag">{tr('Read-only')}</span>
    </div>
    {loading && !selected ? <p className="annual-replay-help" role="status">{tr('Loading execution files…')}</p> : null}
    {usingLocal ? <p className="annual-replay-help">{tr('Downloads are prepared from the stored backtest data already shown on this page; no new backtest or updated API endpoint is required.')}</p> : null}
    {error ? <p className="annual-replay-message error" role="alert">{error}</p> : null}
    {!loading && !error && files.length === 0 ? <p className="annual-replay-help">{tr('No execution files are available.')}</p> : null}
    {files.length ? <div className="annual-replay-export-list">
      {files.map((file) => <div className="annual-replay-export-item" key={file.name}>
        <div>
          <strong>{tr(LABELS[file.name] || file.name)}</strong>
          <span className="annual-replay-export-name">{file.name}{bytesLabel(file.bytes) ? ' · ' + bytesLabel(file.bytes) : ''}</span>
          <p className="annual-replay-help">{tr(DETAILS[file.name] || 'Available historical export')}</p>
        </div>
        <button type="button" disabled={Boolean(downloading) || selected.job_id !== jobId}
          onClick={() => download(file.name)}
          aria-label={tr('Download {name}', { name: file.name })}>
          {downloading === file.name ? tr('Downloading…') : tr('Download')}
        </button>
      </div>)}
    </div> : null}
    <p className="annual-replay-help annual-replay-export-note">{tr('Files are generated from saved backtest analytics. They are not original scientific inputs and do not by themselves prove experiment reproducibility. Missing data is not reconstructed.')}</p>
  </section>
}
