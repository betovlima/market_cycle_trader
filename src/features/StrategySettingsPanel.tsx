import { tr } from '../i18n/runtime'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import { ApiError, apiFetch } from '../api/http'
import { API } from '../config/env'
import { ACTIVE_JOB_STATUSES } from './strategySettings/strategySettingsConfig'
import { parseEditorValues, resolveFieldSchema, strategyCatalogRank, titleFromName, toEditorValues } from './strategySettings/strategySettingsUtils'
import { StrategySettingsView } from './strategySettings/components/StrategySettingsView'

export function StrategySettingsPanel({ onSessionExpired, onTraderWinnerChanged, embedded = false }: AppRecord) {
  const [catalog, setCatalog] = useState<AppRecord | null>(null)
  const [selected, setSelected] = useState<AppRecord | null>(null)
  const [editorValues, setEditorValues] = useState<AppRecord>({})
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [changeNote, setChangeNote] = useState('')
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState('')
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [activeJob, setActiveJob] = useState<AppRecord | null>(null)
  const [modelHasUnsavedChanges, setModelHasUnsavedChanges] = useState(false)
  const [parameterSearch, setParameterSearch] = useState('')
  const [modelParameterMatchCount, setModelParameterMatchCount] = useState(0)
  const initialLoadStartedRef = useRef(false)
  const catalogLoadedRef = useRef(false)

  const baselineEditorValues = useMemo(
    () => toEditorValues(selected?.configuration || {}),
    [selected?.configuration],
  )

  const parameterSchemas = useMemo(() => {
    if (!selected?.configuration) return {}
    return Object.fromEntries(
      Object.keys(selected.configuration).map((field: string) => [
        field,
        resolveFieldSchema(catalog?.parameter_schema, field),
      ]),
    )
  }, [catalog?.parameter_schema, selected?.configuration])

  const updateEditorValue = useCallback((field: string, value: any) => {
    setEditorValues((current: any) => {
      if (Object.is(current[field], value)) return current
      return { ...current, [field]: value }
    })
  }, [])

  const handleError = useCallback((requestError: ErrorLike) => {
    if (requestError instanceof ApiError && requestError.status === 401) {
      onSessionExpired()
      return
    }
    setError(tr(requestError.message || 'Unable to manage strategies.'))
  }, [onSessionExpired])

  const refreshActiveJob = useCallback(async () => {
    try {
      const latest = await apiFetch(`${API}/jobs/latest`)
      setActiveJob(latest && ACTIVE_JOB_STATUSES.has(latest.status) ? latest : null)
    } catch {
      setActiveJob(null)
    }
  }, [])

  const loadStrategy = useCallback(async (strategyId: string) => {
    const detail = await apiFetch(`${API}/admin/strategies/${encodeURIComponent(strategyId)}`)
    setSelected(detail)
    setName(detail.name || '')
    setDescription(detail.description || '')
    setEditorValues(toEditorValues(detail.configuration || {}))
    setChangeNote('')
    setModelHasUnsavedChanges(false)
    return detail
  }, [])

  const loadCatalog = useCallback(async (preferredStrategyId: string = '') => {
    const showBlockingLoader = !catalogLoadedRef.current
    if (showBlockingLoader) setLoading(true)
    try {
      const response = await apiFetch(`${API}/admin/strategies`)
      setCatalog(response)
      await refreshActiveJob()
      const targetId = preferredStrategyId
        || response.control?.research_strategy_id
        || response.items?.[0]?.id
      if (targetId) await loadStrategy(targetId)
      catalogLoadedRef.current = true
      setError('')
    } catch (requestError) {
      handleError(requestError)
    } finally {
      if (showBlockingLoader) setLoading(false)
    }
  }, [handleError, loadStrategy, refreshActiveJob])

  useEffect(() => {
    if (initialLoadStartedRef.current) return
    initialLoadStartedRef.current = true
    loadCatalog()
  }, [loadCatalog])

  useEffect(() => {
    if (!activeJob) return undefined
    const timerId = window.setInterval(refreshActiveJob, 5000)
    return () => window.clearInterval(timerId)
  }, [activeJob, refreshActiveJob])

  const hasUnsavedStrategyChanges = useMemo(() => {
    if (!selected || selected.locked) return false
    if (name !== (selected.name || '') || description !== (selected.description || '')) return true

    const editorKeys = Object.keys(editorValues)
    const baselineKeys = Object.keys(baselineEditorValues)
    if (editorKeys.length !== baselineKeys.length) return true
    return editorKeys.some((field: string) => !Object.is(editorValues[field], baselineEditorValues[field]))
  }, [baselineEditorValues, description, editorValues, name, selected])

  const hasUnsavedChanges = hasUnsavedStrategyChanges || modelHasUnsavedChanges

  useEffect(() => {
    if (!hasUnsavedChanges) return undefined
    const protectDraft = (event: any) => {
      event.preventDefault()
      event.returnValue = ''
    }
    window.addEventListener('beforeunload', protectDraft)
    return () => window.removeEventListener('beforeunload', protectDraft)
  }, [hasUnsavedChanges])

  function confirmDiscardDraft() {
    if (!hasUnsavedChanges) return true
    return window.confirm(tr('Discard the unsaved strategy changes?'))
  }

  async function selectDetail(strategyId: string) {
    if (selected?.id !== strategyId && !confirmDiscardDraft()) return
    setBusy(`read:${strategyId}`)
    setError('')
    try {
      await loadStrategy(strategyId)
    } catch (requestError) {
      handleError(requestError)
    } finally {
      setBusy('')
    }
  }

  async function cloneStrategy(source: AppRecord) {
    if (!confirmDiscardDraft()) return
    const suggested = `${source.name} Test`
    const cloneName = window.prompt(tr('Name for the new test strategy:'), suggested)?.trim()
    if (!cloneName) return
    setBusy(`clone:${source.id}`)
    setError('')
    setNotice('')
    try {
      const created = await apiFetch(`${API}/admin/strategies`, {
        method: 'POST',
        body: {
          name: cloneName,
          description: `Test strategy cloned from ${source.name}.`,
          clone_from_strategy_id: source.id,
        },
      })
      setNotice(tr('Test strategy created. The Trader winner was not changed.'))
      await loadCatalog(created.id)
    } catch (requestError) {
      handleError(requestError)
    } finally {
      setBusy('')
    }
  }

  async function saveStrategy(event: any) {
    event.preventDefault()
    if (!selected || selected.locked) return
    const note = changeNote.trim() || null
    let configuration
    let assetsInput
    try {
      const parsed = parseEditorValues(editorValues, selected.configuration || {})
      configuration = parsed.configuration
      assetsInput = parsed.assetsInput
    } catch (parseError) {
      setError(parseError.message)
      return
    }
    setBusy('save')
    setError('')
    setNotice('')
    try {
      const updated = await apiFetch(`${API}/admin/strategies/${encodeURIComponent(selected.id)}`, {
        method: 'PUT',
        body: {
          expected_revision: selected.revision,
          configuration,
          assets_input: assetsInput,
          name: name.trim(),
          description: description.trim(),
          note,
        },
      })
      setSelected(updated)
      setEditorValues(toEditorValues(updated.configuration || {}))
      setChangeNote('')
      setNotice(tr('Strategy saved as revision {revision}. Run a new backtest before promotion.', { revision: updated.revision }))
      const response = await apiFetch(`${API}/admin/strategies`)
      setCatalog(response)
    } catch (requestError) {
      if (requestError instanceof ApiError && requestError.status === 409) {
        await loadCatalog(selected.id)
      }
      handleError(requestError)
    } finally {
      setBusy('')
    }
  }

  async function handleStrategyModelSaved(updated: any) {
    setSelected(updated)
    setName(updated.name || '')
    setDescription(updated.description || '')
    setEditorValues(toEditorValues(updated.configuration || {}))
    setChangeNote('')
    setModelHasUnsavedChanges(false)
    await loadCatalog(updated.id)
  }

  async function useForBacktest(strategy: AppRecord) {
    if (strategy.id === selected?.id && hasUnsavedChanges) {
      setError(tr('Save or discard the current strategy changes before selecting it for a backtest.'))
      return
    }
    if (activeJob) {
      setError(tr('Wait for the active backtest to finish before changing the selected backtest strategy.'))
      return
    }
    const note = window.prompt(tr('Reason for selecting this strategy for backtests:'), `Test ${strategy.name}`)?.trim()
    if (!note) return
    setBusy(`select:${strategy.id}`)
    setError('')
    setNotice('')
    try {
      await apiFetch(`${API}/admin/strategies/${encodeURIComponent(strategy.id)}/select-for-backtest`, {
        method: 'POST',
        body: {
          expected_control_revision: catalog.control.revision,
          note,
        },
      })
      setNotice(tr('Backtests will use the selected strategy. Trader continues using the protected winner.'))
      await loadCatalog(strategy.id)
    } catch (requestError) {
      handleError(requestError)
    } finally {
      setBusy('')
    }
  }


  async function useForModelTuning(strategy: AppRecord) {
    if (strategy.id === selected?.id && hasUnsavedChanges) {
      setError(tr('Save or discard the current strategy changes before selecting it for Model Tuning.'))
      return
    }
    const note = window.prompt(tr('Reason for selecting this Strategy for Model Tuning:'), `Tune ${strategy.name}`)?.trim()
    if (!note) return
    setBusy(`tune:${strategy.id}`)
    setError('')
    setNotice('')
    try {
      await apiFetch(`${API}/admin/strategies/${encodeURIComponent(strategy.id)}/select-for-model-tuning`, {
        method: 'POST',
        body: {
          expected_control_revision: catalog.control.revision,
          note,
        },
      })
      setNotice(tr('Research Lab will use this Strategy as the selected research baseline. Lifecycle status is guidance only.'))
      await loadCatalog(strategy.id)
    } catch (requestError) {
      handleError(requestError)
    } finally {
      setBusy('')
    }
  }

  async function markAsCandidate(strategy: AppRecord) {
    if (strategy.id === selected?.id && hasUnsavedChanges) {
      setError(tr('Save or discard the current strategy changes before marking it as a candidate.'))
      return
    }
    const currentCandidate = catalog.control?.candidate_strategy
    const replacementMessage = currentCandidate && currentCandidate.id !== strategy.id
      ? `\n\n${tr('The current candidate {name} will become a protected Superseded candidate.', { name: `"${currentCandidate.name}"` })}`
      : ''
    const confirmation = window.confirm(
      tr('Mark {name} revision {revision} as the single active candidate?', { name: `"${strategy.name}"`, revision: strategy.revision }) + '\n\n' +
      tr('Candidate status certifies the exact completed backtest revision and model snapshot.') +
      `\n${tr('Model')}: ${selected.research_model?.label || tr('saved Strategy model')}` +
      replacementMessage,
    )
    if (!confirmation) return
    const note = window.prompt(tr('Candidate reason:'), tr('Validated candidate after completed backtest {id}', { id: strategy.last_backtest_id || '' }))?.trim()
    if (!note) return
    setBusy(`candidate:${strategy.id}`)
    setError('')
    setNotice('')
    try {
      const updated = await apiFetch(`${API}/admin/strategies/${encodeURIComponent(strategy.id)}/mark-as-candidate`, {
        method: 'POST',
        body: {
          confirm_mark_as_candidate: true,
          expected_strategy_revision: strategy.revision,
          note,
        },
      })
      setSelected(updated)
      setName(updated.name || '')
      setDescription(updated.description || '')
      setEditorValues(toEditorValues(updated.configuration || {}))
      setChangeNote('')
      const response = await apiFetch(`${API}/admin/strategies`)
      setCatalog(response)
      setNotice(tr('The strategy is now the single active Candidate. Any previous Candidate was preserved as Superseded candidate. Trader winner was not changed.'))
    } catch (requestError) {
      handleError(requestError)
    } finally {
      setBusy('')
    }
  }

  async function promoteToTrader(strategy: AppRecord) {
    if (strategy.id === selected?.id && hasUnsavedChanges) {
      setError(tr('Save or discard the current strategy changes before promotion.'))
      return
    }
    if (activeJob) {
      setError(tr('Wait for the active backtest to finish before promoting another Trader winner.'))
      return
    }
    const confirmation = window.confirm(
      tr('Promote {name} to the Trader winner?', { name: `"${strategy.name}"` }) + '\n\n' +
      tr('This is a metadata-only Winner handoff and is allowed only while XNYS is closed. The current Winner will be preserved as Former Winner, the current Promoted Candidate will become historical, and this validated Candidate will become the single Promoted Candidate and the source of the new Winner. The current position, cash, trade history, scheduler and armed next-session run will be preserved. No Alpaca request, calibration, prediction or order is executed by this promotion. The new Winner and all of its assets will be loaded by the next scheduled pre-market evaluation.'),
    )
    if (!confirmation) return
    const note = window.prompt(tr('Promotion reason:'), tr('Promote {name} after validated backtest', { name: strategy.name }))?.trim()
    if (!note) return
    setBusy(`promote:${strategy.id}`)
    setError('')
    setNotice('')
    try {
      const result = await apiFetch(`${API}/admin/strategies/${encodeURIComponent(strategy.id)}/promote-to-trader`, {
        method: 'POST',
        body: {
          confirm_promote_to_trader: true,
          confirm_market_closed: true,
          confirm_preserve_operational_state: true,
          expected_control_revision: catalog.control.revision,
          expected_strategy_revision: strategy.revision,
          note,
        },
      })
      const assetCount = result.promotion?.next_scheduled_evaluation_assets_count || tr('all')
      const preservedMode = tr(String(result.promotion?.trader_control_mode || 'unchanged').replaceAll('_', ' '))
      const winnerModel = result.winner?.winner_model?.label || result.promotion?.winner_model?.label || tr('Winner model')
      setNotice(tr('{name} is now the single protected Trader Winner using {model}. The validated Strategy is now the single Promoted Candidate; the previous Winner and promoted Candidate were preserved as history. The current position and Paper pipeline were preserved without broker interaction. Trader mode remains {mode}; its next scheduled pre-market evaluation will load {count} assets from the new Winner.', { name: result.winner.name, model: winnerModel, mode: preservedMode, count: assetCount }))
      await loadCatalog(strategy.id)
      onTraderWinnerChanged?.()
    } catch (requestError) {
      handleError(requestError)
    } finally {
      setBusy('')
    }
  }

  async function deleteStrategy(strategy: AppRecord) {
    if (strategy.id === selected?.id && hasUnsavedChanges && !confirmDiscardDraft()) return
    if (!window.confirm(tr('Delete the research strategy "{name}"?', { name: strategy.name }))) return
    setBusy(`delete:${strategy.id}`)
    setError('')
    setNotice('')
    try {
      await apiFetch(`${API}/admin/strategies/${encodeURIComponent(strategy.id)}`, {
        method: 'DELETE',
        body: { confirm_delete: true, note: `Delete ${strategy.status || 'draft'} strategy ${strategy.name}` },
      })
      setNotice(tr('Research strategy deleted.'))
      await loadCatalog()
    } catch (requestError) {
      handleError(requestError)
    } finally {
      setBusy('')
    }
  }

  const groupedParameters = useMemo(() => {
    if (!selected?.configuration) return []
    const order = catalog?.parameter_order || Object.keys(selected.configuration)
    const used = new Set()
    const groups = (catalog?.parameter_groups || []).map((group: any) => {
      const fields = (group.fields || []).filter((field: string) => selected.configuration[field] !== undefined)
      fields.forEach((field: string) => used.add(field))
      return { id: group.id, label: group.label, fields }
    }).filter((group: any) => group.fields.length)
    const other = order.filter((field: string) => !used.has(field) && selected.configuration[field] !== undefined)
    if (other.length) groups.push({ id: 'other', label: 'Other parameters', fields: other })

    const query = parameterSearch.trim().toLocaleLowerCase()
    if (!query) return groups

    return groups.map((group: any) => ({
      ...group,
      fields: group.fields.filter((field: string) => {
        const schema = parameterSchemas[field]
        const searchableText = [
          field,
          titleFromName(field),
          group.label,
          schema?.title,
          schema?.description,
        ].filter(Boolean).join(' ').toLocaleLowerCase()
        return searchableText.includes(query)
      }),
    })).filter((group: any) => group.fields.length)
  }, [catalog?.parameter_groups, catalog?.parameter_order, parameterSchemas, parameterSearch, selected])

  const visibleParameterCount = useMemo(
    () => groupedParameters.reduce((total: number, group: any) => total + group.fields.length, 0),
    [groupedParameters],
  )
  const globalVisibleParameterCount = visibleParameterCount + modelParameterMatchCount

  if (loading) {
    return <section className={`${embedded ? 'settings-workspace-section settings-strategy-section' : 'panel'} strategy-lab-panel`}><div className="settings-loading"><span className="loading-ring" />{tr("Loading strategies…")}</div></section>
  }

  if (!catalog || !selected) {
    return <section className={`${embedded ? 'settings-workspace-section settings-strategy-section' : 'panel'} strategy-lab-panel`}><div className="global-inline-message error-inline">{tr(error || 'Strategy catalog is unavailable.')}</div></section>
  }

  const researchId = catalog.control?.research_strategy_id
  const winnerId = catalog.control?.trader_winner_strategy_id
  const candidateId = catalog.control?.candidate_strategy_id
  const promotedCandidateId = catalog.control?.promoted_candidate_strategy_id
  const modelTuningId = catalog.control?.model_tuning_strategy_id
  const hasActiveBacktest = Boolean(activeJob)
  const isTemporalStrategy = selected.strategy_kind === 'temporal_intelligence'
  const traderRuntimeReady = Boolean(selected.trader_compatibility?.eligible)
  const traderRuntimeBlockReason = tr(selected.trader_compatibility?.reason || 'This Strategy is not compatible with the installed Trader runtime.')
  const hasCompletedBacktestForSavedModel = selected.last_backtest_status === 'completed'
    && Number(selected.last_backtest_revision) === Number(selected.revision)
    && Boolean(selected.last_backtest_id)
    && Boolean(selected.last_backtest_model?.settings_hash)
    && selected.last_backtest_model?.settings_hash === selected.research_model?.settings_hash
  const canMarkCandidate = traderRuntimeReady
    && !selected.locked
    && selected.status === 'draft'
    && Boolean(selected.research_model?.family)
    && selected.research_model?.family !== 'iqn'
    && hasCompletedBacktestForSavedModel
    && !hasActiveBacktest
  const canPromote = traderRuntimeReady
    && selected.status === 'candidate'
    && selected.id === candidateId
    && Number(selected.candidate_revision) === Number(selected.revision)
    && Boolean(selected.candidate_backtest_id)
    && selected.id !== winnerId
    && !hasActiveBacktest
  const orderedStrategies = [...catalog.items].sort((left: any, right: any) => {
    const rankDifference = strategyCatalogRank(left, winnerId, researchId, candidateId, promotedCandidateId)
      - strategyCatalogRank(right, winnerId, researchId, candidateId, promotedCandidateId)
    if (rankDifference !== 0) return rankDifference
    return String(left.name || '').localeCompare(String(right.name || ''), undefined, { sensitivity: 'base' })
  })

    const workspace = {
    activeJob,
    busy,
    canMarkCandidate,
    canPromote,
    candidateId,
    catalog,
    changeNote,
    cloneStrategy,
    deleteStrategy,
    description,
    editorValues,
    embedded,
    error,
    globalVisibleParameterCount,
    groupedParameters,
    handleStrategyModelSaved,
    hasActiveBacktest,
    hasUnsavedChanges,
    hasUnsavedStrategyChanges,
    isTemporalStrategy,
    markAsCandidate,
    modelTuningId,
    name,
    notice,
    onSessionExpired,
    orderedStrategies,
    parameterSchemas,
    parameterSearch,
    promoteToTrader,
    promotedCandidateId,
    researchId,
    saveStrategy,
    selectDetail,
    selected,
    setChangeNote,
    setDescription,
    setModelHasUnsavedChanges,
    setModelParameterMatchCount,
    setName,
    setParameterSearch,
    traderRuntimeBlockReason,
    traderRuntimeReady,
    updateEditorValue,
    useForBacktest,
    useForModelTuning,
    winnerId
  }

  return <StrategySettingsView workspace={workspace} />
}
