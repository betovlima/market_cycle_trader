export const EMPTY_TUNING_LOG_VIEW: AppRecord = Object.freeze({
  open: false,
  title: '',
  run_id: '',
  status: '',
  candidate_id: null,
  job_id: '',
  failure_type: '',
  log_text: '',
})

export function normalizeTuningLog(payload: AppRecord, title: string) {
  return {
    ...EMPTY_TUNING_LOG_VIEW,
    ...(payload || {}),
    open: true,
    title: title || '',
    candidate_id: payload?.candidate_id ?? null,
  }
}
