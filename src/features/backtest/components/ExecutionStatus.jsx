import { useEffect, useRef } from 'react'

export function ExecutionStatus({ workspace }) {
  const { job } = workspace
  const logRef = useRef(null)
  const logs = Array.isArray(job?.logs) ? job.logs : []

  useEffect(() => {
    const element = logRef.current
    if (!element) return
    element.scrollTop = element.scrollHeight
  }, [job?.id, logs.length])

  return (
    <>
      {job && (
        <section className="status-panel">
          <div className="status-line">
            <div>
              <span className={`status-dot ${job.status}`} />
              <strong>{job.stage}</strong>
              <small>{job.completed_runs ?? 0} of {job.total_runs ?? 0} model runs</small>
            </div>
            <span>{Number(job.progress ?? 0).toFixed(job.progress % 1 ? 1 : 0)}%</span>
          </div>
          <div className="progress-track">
            <span style={{ width: `${Math.max(0, Math.min(100, Number(job.progress ?? 0)))}%` }} />
          </div>
          {job.status === 'interrupted' && (
            <div className="settings-message" role="status">
              <strong>This execution is stopped.</strong>{' '}
              The job was interrupted before completion. Any partial execution
              data remains available through the export files.
            </div>
          )}
          {logs.length > 0 && (
            <section className="logs-panel" aria-label="Execution log">
              <div className="logs-panel-header">
                <strong>Execution log</strong>
                <small>Latest {Math.min(logs.length, 120)} messages</small>
              </div>
              <pre ref={logRef}>{logs.slice(-120).join('\n')}</pre>
            </section>
          )}
        </section>
      )}
    </>
  )
}
