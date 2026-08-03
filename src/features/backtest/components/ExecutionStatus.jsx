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

  return (
    <section className="execution-panel">
      <div className="execution-status-row">
        <div>
          <span className={`status-dot ${job.status}`} />
          <strong>{job.stage || 'Preparing simulation'}</strong>
          <small>{job.completed_runs ?? 0} of {job.total_runs ?? 0} runs</small>
        </div>
        <span>{Number(job.progress ?? 0).toFixed(Number(job.progress) % 1 ? 1 : 0)}%</span>
      </div>
      <div className="progress-track"><span style={{ width: `${Math.max(0, Math.min(100, Number(job.progress ?? 0)))}%` }} /></div>
      {logs.length > 0 && (
        <details className="execution-log">
          <summary>Execution log</summary>
          <pre ref={logRef}>{logs.slice(-120).join('\n')}</pre>
        </details>
      )}
    </section>
  )
}
