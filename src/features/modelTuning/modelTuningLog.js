export const EMPTY_TUNING_LOG_VIEW = Object.freeze({
  open: false,
  title: '',
  run_id: '',
  status: '',
  candidate_id: null,
  job_id: '',
  failure_type: '',
  log_text: '',
})

export function normalizeTuningLog(payload, title) {
  return {
    ...EMPTY_TUNING_LOG_VIEW,
    ...(payload || {}),
    open: true,
    title: title || '',
    candidate_id: payload?.candidate_id ?? null,
  }
}
