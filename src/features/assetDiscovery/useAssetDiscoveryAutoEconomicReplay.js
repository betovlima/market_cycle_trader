import { useEffect, useRef } from 'react'

export const ASSET_DISCOVERY_ECONOMIC_REPLAY_STORAGE_KEY = 'mct.assetDiscovery.runEconomicContribution'

export function economicReplayRequested() {
  try {
    return window.sessionStorage.getItem(ASSET_DISCOVERY_ECONOMIC_REPLAY_STORAGE_KEY) === 'true'
  } catch {
    return false
  }
}

export function useAssetDiscoveryAutoEconomicReplay({ campaign, runMarginalReplay }) {
  const requestedRunIdRef = useRef('')
  const startedRunIdRef = useRef('')

  useEffect(() => {
    const runId = String(campaign?.run_id || '')
    const status = String(campaign?.status || '').toLowerCase()
    if (!runId || status !== 'completed') return

    if (!requestedRunIdRef.current) {
      if (!economicReplayRequested()) return
      requestedRunIdRef.current = runId
    }
    if (requestedRunIdRef.current !== runId || startedRunIdRef.current === runId) return

    const replayStatus = String(campaign?.marginal_replay?.status || '').toLowerCase()
    const replayCompleted = Number(campaign?.marginal_replay?.completed_count || 0)
    if (['queued', 'running'].includes(replayStatus)) {
      startedRunIdRef.current = runId
      return
    }
    if (replayStatus === 'completed' && replayCompleted > 0) {
      startedRunIdRef.current = runId
      return
    }
    if (!['not_run', 'pending', ''].includes(replayStatus)) return

    startedRunIdRef.current = runId
    runMarginalReplay()
  }, [campaign?.run_id, campaign?.status, campaign?.marginal_replay?.status, campaign?.marginal_replay?.completed_count, runMarginalReplay])

  return {
    markRequestedRun(runId) {
      requestedRunIdRef.current = economicReplayRequested() ? String(runId || '') : ''
      startedRunIdRef.current = ''
    },
  }
}
