import { useEffect, useRef } from 'react'

export function ExecutionStatus({ workspace }) {
  const { job } = workspace
  const logRef = useRef(null)
  const logs = Array.isArray(job?.logs) ? job.logs : []

  useEffect(() => {
    const element = logRef.current
    if (element) element.scrollTop = element.scrollHeight
  }, [job?.id, logs.length])

  if (!job || !['queued', 'running', 'failed', 'interrupted'].includes(job.status)) return null

  const progress = Math.max(0, Math.min(100, Number(job.progress ?? 0)))
  const progressLabel = progress.toFixed(progress % 1 ? 1 : 0)

  return (
    <section className="execution-panel" aria-live="polite">
      <div className="execution-status-row">
        <div>
          <span className={`status-dot ${job.status}`} />
          <strong>{job.stage || 'Preparing simulation'}</strong>
          <small>{job.completed_runs ?? 0} of {job.total_runs ?? 0} runs</small>
        </div>
        <span>{progressLabel}%</span>
      </div>
      <div
        className="progress-track"
        role="progressbar"
        aria-label="Backtest execution progress"
        aria-valuemin="0"
        aria-valuemax="100"
        aria-valuenow={progress}
      >
        <span style={{ width: `${progress}%` }} />
      </div>
      <div className="execution-log">
        <div className="execution-log-title">Execution log</div>
        <pre ref={logRef}>{logs.length ? logs.slice(-120).join('\n') : 'Waiting for execution messages…'}</pre>
      </div>
    </section>
  )
}
