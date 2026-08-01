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
            </div>
            <span>{Number(job.progress ?? 0).toFixed(job.progress % 1 ? 1 : 0)}%</span>
          </div>
          <div className="progress-track">
            <span style={{ width: `${Math.max(0, Math.min(100, Number(job.progress ?? 0)))}%` }} />
          </div>
          {job.status === 'interrupted' && (
            <div className="settings-message" role="status">
              <strong>This execution is stopped.</strong>{' '}
              The analysis was interrupted before completion.
            </div>
          )}
          {logs.length > 0 && (
            <section className="logs-panel" aria-label="Execution status">
              <div className="logs-panel-header">
                <strong>Execution status</strong>
                <small>Latest updates</small>
              </div>
              <pre ref={logRef}>{logs.slice(-20).join('\n')}</pre>
            </section>
          )}
        </section>
      )}
    </>
  )
}
