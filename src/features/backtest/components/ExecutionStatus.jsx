export function ExecutionStatus({ workspace }) {
  const {
    job,
    jobRotationModels,
    jobRotationModelText,
    currentRotationModelText,
    screenDiffersFromJob,
  } = workspace

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
          {jobRotationModelText && (
            <div className="job-snapshot-note">
              <strong>Execution snapshot:</strong>{' '}
              {jobRotationModelText}
              {' · '}
              {job.total_runs ?? jobRotationModels.length} model run
              {(job.total_runs ?? jobRotationModels.length) === 1 ? '' : 's'}
            </div>
          )}
          {screenDiffersFromJob && (
            <div className="settings-message" role="status">
              <strong>The controls above belong to the next run.</strong>{' '}
              This job was queued with {jobRotationModelText}; the current
              screen is configured with {currentRotationModelText}.
            </div>
          )}
          {job.status === 'interrupted' && (
            <div className="settings-message" role="status">
              <strong>This execution is stopped.</strong>{' '}
              The job was interrupted before completion. Any partial execution
              data remains available through the export files.
            </div>
          )}
          {job.logs?.length > 0 && (
            <details className="logs-panel">
              <summary>Execution log</summary>
              <pre>{job.logs.slice(-80).join('\n')}</pre>
            </details>
          )}
        </section>
      )}
    </>
  )
}
