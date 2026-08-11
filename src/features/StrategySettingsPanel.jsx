import { getIntlLocale, tr } from '../i18n/runtime'
import { strategyParameterLabel } from '../i18n/strategyParameters'
import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react'

import { ApiError, apiFetch } from '../api/http'
import { API } from '../config/env'
import { ActivityIcon, ShieldIcon, StarIcon, TrophyIcon } from '../shared/components/Icons'
import { ParameterHint } from '../shared/components/ParameterHint'
import { ModelResearchSettingsPanel } from './ModelResearchSettingsPanel'

const ACTIVE_JOB_STATUSES = new Set(['queued', 'running'])

function titleFromName(name) {
  return name.replaceAll('_', ' ').replace(/\b\w/g, (letter) => letter.toUpperCase())
}

function dateTime(value) {
  if (!value) return '—'
  return new Date(value).toLocaleString(getIntlLocale())
}

const STATUS_LABELS = {
  draft: 'Draft',
  candidate: 'Candidate',
  superseded_candidate: 'Superseded candidate',
  promoted_candidate: 'Promoted candidate',
  winner: 'Winner',
  former_winner: 'Former winner',
}


const STRATEGY_FIELD_HINTS = {
  name: {
    description: 'Human-readable name used to identify this research strategy in the catalog and backtest selection.',
    relationship: 'Renaming a draft does not change the protected Trader winner.',
  },
  description: {
    description: 'Short explanation of the purpose of this research revision so later comparisons remain understandable.',
    relationship: 'Use it to record the intent of the test, not confidential credentials or runtime secrets.',
  },
  search: {
    description: 'Filters the editable configuration by visible label, technical parameter name, group name or available schema metadata.',
    relationship: 'Filtering changes only what is visible in this page; it never changes the strategy configuration.',
  },
  changeReason: {
    description: 'Audit note explaining why this strategy revision is being changed.',
    relationship: 'A valid note is required before saving an editable draft revision.',
  },
}

const BOUNDARY_HINTS = {
  winner: {
    description: 'Protected strategy snapshot currently used by the Trader.',
    relationship: 'Research edits remain isolated until an explicitly validated candidate is promoted.',
  },
  backtest: {
    description: 'Strategy revision currently selected as the source for the next backtest.',
    relationship: 'Selecting a backtest strategy does not change the Trader winner.',
  },
  candidate: {
    description: 'Single validated strategy revision eligible for promotion to Trader winner.',
    relationship: 'A candidate represents the exact revision that completed its qualifying backtest.',
  },
  lifecycle: {
    description: 'Lifecycle protection keeps only one active candidate and one protected Trader winner at a time.',
    relationship: 'Older validated or promoted snapshots remain protected for audit and cloning.',
  },
}

function parameterRelationship(name, schema, reference) {
  const details = []
  const enumValues = Array.isArray(schema?.enum) ? schema.enum : []
  if (enumValues.length) details.push(`${tr('Allowed:')} ${enumValues.join(', ')}`)
  if (schema?.minimum !== undefined) details.push(`${tr('Minimum:')} ${schema.minimum}`)
  if (schema?.exclusiveMinimum !== undefined) details.push(`${tr('Greater than:')} ${schema.exclusiveMinimum}`)
  if (schema?.maximum !== undefined) details.push(`${tr('Maximum:')} ${schema.maximum}`)
  if (schema?.exclusiveMaximum !== undefined) details.push(`${tr('Less than:')} ${schema.exclusiveMaximum}`)
  if (name === 'assets') details.push(tr('Type: ticker symbols'))
  else if (typeof reference === 'boolean') details.push(tr('Type: on/off'))
  else if (Array.isArray(reference)) details.push(tr('Type: JSON array'))
  else if (typeof reference === 'number') details.push(tr(schema?.type === 'integer' ? 'Type: integer' : 'Type: number'))
  else details.push(tr('Type: text'))
  details.push(`${tr('Technical name:')} ${name}`)
  return details.join(' · ')
}

function statusLabel(value) {
  return tr(STATUS_LABELS[String(value || 'draft')] || titleFromName(String(value || 'draft')))
}

function lifecycleSummary(item, isWinner, isCandidate) {
  if (isWinner) return tr('Active Trader winner')
  if (isCandidate) return tr('Active validated candidate')
  if (item.status === 'superseded_candidate') return tr('Replaced by a newer candidate')
  if (item.status === 'promoted_candidate') return tr('Promoted to a protected winner snapshot')
  if (item.status === 'former_winner') return tr('Historical former Trader winner')
  if (item.last_backtest_status === 'completed') return tr('Backtest completed · eligible for candidate')
  return tr('Backtest required')
}


function strategyCatalogRank(item, winnerId, researchId, candidateId) {
  if (item.id === winnerId) return 0
  if (item.id === researchId) return 1
  if (item.id === candidateId) return 2
  return 3
}

function resolveFieldSchema(schema, name) {
  const property = schema?.properties?.[name] || {}
  const resolve = (value) => {
    if (!value?.$ref) return value || {}
    const key = value.$ref.split('/').pop()
    return schema?.$defs?.[key] || value
  }
  if (property.$ref) return resolve(property)
  if (Array.isArray(property.anyOf)) {
    const candidate = property.anyOf.find((item) => item.type !== 'null') || property.anyOf[0]
    return { ...property, ...resolve(candidate) }
  }
  return property
}

function toEditorValues(configuration) {
  return Object.fromEntries(Object.entries(configuration || {}).map(([name, value]) => {
    if (name === 'assets' && Array.isArray(value)) return [name, value.join(', ')]
    if (Array.isArray(value)) return [name, JSON.stringify(value)]
    if (value === null || value === undefined) return [name, '']
    if (typeof value === 'number') return [name, String(value)]
    return [name, value]
  }))
}

function parseEditorValues(values, original) {
  const configuration = {}
  let assetsInput = null
  for (const [name, raw] of Object.entries(values)) {
    const reference = original[name]
    if (name === 'assets' && Array.isArray(reference)) {
      assetsInput = String(raw || '').trim()
    } else if (Array.isArray(reference)) {
      const parsed = JSON.parse(String(raw || '[]'))
      if (!Array.isArray(parsed)) throw new Error(tr('{field} must be a JSON array.', { field: strategyParameterLabel(name, titleFromName(name)) }))
      configuration[name] = parsed
    } else if (typeof reference === 'boolean') {
      configuration[name] = Boolean(raw)
    } else if (typeof reference === 'number') {
      const parsed = Number(raw)
      if (!Number.isFinite(parsed)) throw new Error(tr('{field} must be numeric.', { field: strategyParameterLabel(name, titleFromName(name)) }))
      configuration[name] = parsed
    } else if (reference === null) {
      configuration[name] = String(raw || '').trim() || null
    } else {
      configuration[name] = String(raw)
    }
  }
  return { configuration, assetsInput }
}

export function StrategySettingsPanel({ onSessionExpired, onTraderWinnerChanged, embedded = false }) {
  const [catalog, setCatalog] = useState(null)
  const [selected, setSelected] = useState(null)
  const [editorValues, setEditorValues] = useState({})
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [changeNote, setChangeNote] = useState('')
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState('')
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [activeJob, setActiveJob] = useState(null)
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
      Object.keys(selected.configuration).map((field) => [
        field,
        resolveFieldSchema(catalog?.parameter_schema, field),
      ]),
    )
  }, [catalog?.parameter_schema, selected?.configuration])

  const updateEditorValue = useCallback((field, value) => {
    setEditorValues((current) => {
      if (Object.is(current[field], value)) return current
      return { ...current, [field]: value }
    })
  }, [])

  const handleError = useCallback((requestError) => {
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

  const loadStrategy = useCallback(async (strategyId) => {
    const detail = await apiFetch(`${API}/admin/strategies/${encodeURIComponent(strategyId)}`)
    setSelected(detail)
    setName(detail.name || '')
    setDescription(detail.description || '')
    setEditorValues(toEditorValues(detail.configuration || {}))
    setChangeNote('')
    setModelHasUnsavedChanges(false)
    return detail
  }, [])

  const loadCatalog = useCallback(async (preferredStrategyId = '') => {
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
    if (name !== (selected.name || '') || description !== (selected.description || '') || changeNote.trim().length > 0) return true

    const editorKeys = Object.keys(editorValues)
    const baselineKeys = Object.keys(baselineEditorValues)
    if (editorKeys.length !== baselineKeys.length) return true
    return editorKeys.some((field) => !Object.is(editorValues[field], baselineEditorValues[field]))
  }, [baselineEditorValues, changeNote, description, editorValues, name, selected])

  const hasUnsavedChanges = hasUnsavedStrategyChanges || modelHasUnsavedChanges

  useEffect(() => {
    if (!hasUnsavedChanges) return undefined
    const protectDraft = (event) => {
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

  async function selectDetail(strategyId) {
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

  async function cloneStrategy(source) {
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

  async function saveStrategy(event) {
    event.preventDefault()
    if (!selected || selected.locked) return
    const note = changeNote.trim()
    if (note.length < 3) {
      setError(tr('Enter a change reason for the strategy revision.'))
      return
    }
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

  async function handleStrategyModelSaved(updated) {
    setSelected(updated)
    setName(updated.name || '')
    setDescription(updated.description || '')
    setEditorValues(toEditorValues(updated.configuration || {}))
    setChangeNote('')
    setModelHasUnsavedChanges(false)
    await loadCatalog(updated.id)
  }

  async function useForBacktest(strategy) {
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

  async function markAsCandidate(strategy) {
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

  async function promoteToTrader(strategy) {
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
      tr('This is a metadata-only handoff while the market is closed. The current position, cash, trade history, scheduler and armed next-session run will be preserved. No Alpaca request, calibration, prediction or order is executed now. The promoted Winner and all of its assets will be loaded by the next scheduled pre-market evaluation.'),
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
      setNotice(tr('{name} is now the single protected Trader winner using {model}. The current position and Paper pipeline were preserved without broker interaction. Trader mode remains {mode}; its next scheduled pre-market evaluation will load {count} assets from the new Winner.', { name: result.winner.name, model: winnerModel, mode: preservedMode, count: assetCount }))
      await loadCatalog(strategy.id)
      onTraderWinnerChanged?.()
    } catch (requestError) {
      handleError(requestError)
    } finally {
      setBusy('')
    }
  }

  async function deleteDraft(strategy) {
    if (strategy.id === selected?.id && hasUnsavedChanges && !confirmDiscardDraft()) return
    if (activeJob) {
      setError(tr('Wait for the active backtest to finish before deleting a test strategy.'))
      return
    }
    if (!window.confirm(tr('Delete the research strategy "{name}"?', { name: strategy.name }))) return
    setBusy(`delete:${strategy.id}`)
    setError('')
    setNotice('')
    try {
      await apiFetch(`${API}/admin/strategies/${encodeURIComponent(strategy.id)}`, {
        method: 'DELETE',
        body: { confirm_delete: true, note: `Delete unused ${strategy.status || 'draft'} strategy ${strategy.name}` },
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
    const groups = (catalog?.parameter_groups || []).map((group) => {
      const fields = (group.fields || []).filter((field) => selected.configuration[field] !== undefined)
      fields.forEach((field) => used.add(field))
      return { id: group.id, label: group.label, fields }
    }).filter((group) => group.fields.length)
    const other = order.filter((field) => !used.has(field) && selected.configuration[field] !== undefined)
    if (other.length) groups.push({ id: 'other', label: 'Other parameters', fields: other })

    const query = parameterSearch.trim().toLocaleLowerCase()
    if (!query) return groups

    return groups.map((group) => ({
      ...group,
      fields: group.fields.filter((field) => {
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
    })).filter((group) => group.fields.length)
  }, [catalog?.parameter_groups, catalog?.parameter_order, parameterSchemas, parameterSearch, selected])

  const visibleParameterCount = useMemo(
    () => groupedParameters.reduce((total, group) => total + group.fields.length, 0),
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
  const hasActiveBacktest = Boolean(activeJob)
  const hasCompletedBacktestForSavedModel = selected.last_backtest_status === 'completed'
    && Number(selected.last_backtest_revision) === Number(selected.revision)
    && Boolean(selected.last_backtest_id)
    && Boolean(selected.last_backtest_model?.settings_hash)
    && selected.last_backtest_model?.settings_hash === selected.research_model?.settings_hash
  const canMarkCandidate = !selected.locked
    && selected.status === 'draft'
    && Boolean(selected.research_model?.family)
    && selected.research_model?.family !== 'iqn'
    && hasCompletedBacktestForSavedModel
    && !hasActiveBacktest
  const canPromote = selected.status === 'candidate'
    && selected.id === candidateId
    && Number(selected.candidate_revision) === Number(selected.revision)
    && Boolean(selected.candidate_backtest_id)
    && selected.id !== winnerId
    && !hasActiveBacktest
  const orderedStrategies = [...catalog.items].sort((left, right) => {
    const rankDifference = strategyCatalogRank(left, winnerId, researchId, candidateId)
      - strategyCatalogRank(right, winnerId, researchId, candidateId)
    if (rankDifference !== 0) return rankDifference
    return String(left.name || '').localeCompare(String(right.name || ''), undefined, { sensitivity: 'base' })
  })

  return (
    <section className={`${embedded ? 'settings-workspace-section settings-strategy-section' : 'panel'} strategy-lab-panel`}>
      <div className="panel-heading strategy-lab-heading">
        <div>
          <span className="panel-kicker">{tr("STRATEGIES")}</span>
          <h2>{tr("Research strategies and Trader winner")}</h2>
          <p>{tr("Create and tune test strategies without changing the strategy used by Trader.")}</p>
        </div>
        <div className="strategy-heading-state">
          {hasUnsavedChanges ? <span className="strategy-unsaved-badge">{tr("Unsaved changes")}</span> : null}
          <span className="strategy-control-revision">{tr("Selection revision")}{' '}{catalog.control.revision}</span>
        </div>
      </div>

      {error ? <div className="global-inline-message error-inline">{error}</div> : null}
      {notice ? <div className="global-inline-message success-inline">{notice}</div> : null}
      {hasActiveBacktest ? (
        <div className="global-inline-message warning-inline">
          {tr("Backtest")}{' '}{activeJob.id} {tr("is")}{' '}{statusLabel(activeJob.status)}{tr(". You may clone and edit test strategies, but strategy selection, deletion, promotion and a new backtest remain locked until it finishes.")}</div>
      ) : null}

      <div className="strategy-boundary-grid">
        <article className="winner-boundary-card">
          <TrophyIcon size={20} />
          <div>
            <span className="strategy-boundary-label">{tr("Trader winner")}{' '}<ParameterHint id="hint-boundary-winner" title={tr("Trader winner")} {...BOUNDARY_HINTS.winner} /></span>
            <strong>{catalog.control.trader_winner?.name}</strong>
            <small>{catalog.control.trader_winner?.winner_model?.label || tr('XGBoost Utility')}</small>
          </div>
        </article>
        <article>
          <ActivityIcon size={20} />
          <div>
            <span className="strategy-boundary-label">{tr("Backtest strategy")}{' '}<ParameterHint id="hint-boundary-backtest" title={tr("Backtest strategy")} {...BOUNDARY_HINTS.backtest} /></span>
            <strong>{catalog.control.research_strategy?.name}</strong>
            {catalog.control.research_strategy?.research_model?.label ? <small>{catalog.control.research_strategy.research_model.label}</small> : null}
          </div>
        </article>
        <article className="candidate-boundary-card">
          <StarIcon size={20} />
          <div>
            <span className="strategy-boundary-label">{tr("Current candidate")}{' '}<ParameterHint id="hint-boundary-candidate" title={tr("Current candidate")} {...BOUNDARY_HINTS.candidate} /></span>
            <strong>{catalog.control.candidate_strategy?.name || tr('No active candidate')}</strong>
            {catalog.control.candidate_strategy?.candidate_model?.label ? <small>{catalog.control.candidate_strategy.candidate_model.label}</small> : null}
          </div>
        </article>
        <article>
          <ShieldIcon size={20} />
          <div>
            <span className="strategy-boundary-label">{tr("Lifecycle rule")}{' '}<ParameterHint id="hint-boundary-lifecycle" title={tr("Lifecycle rule")} align="right" {...BOUNDARY_HINTS.lifecycle} /></span>
            <strong>{tr("One Candidate · one Winner")}</strong>
          </div>
        </article>
      </div>

      {catalog.control?.paper_state_reinitialization_required ? (
        <div className="global-inline-message warning-inline">{tr("The Trader winner changed. Run the protected Paper initialization before restarting Trader.")}</div>
      ) : null}

      <div className="strategy-workspace">
        <aside className="strategy-list-panel">
          <div className="strategy-list-heading">
            <strong>{tr("Strategy catalog")}</strong>
            <button type="button" onClick={() => cloneStrategy(catalog.control.trader_winner)} disabled={Boolean(busy)}>{tr("Clone winner")}</button>
          </div>
          <div className="strategy-list">
            {orderedStrategies.map((item) => {
              const isResearch = item.id === researchId
              const isWinner = item.id === winnerId
              const isCandidate = item.id === candidateId
              return (
                <article key={item.id} className={`strategy-list-item ${selected.id === item.id ? 'selected' : ''}`}>
                  <button type="button" className="strategy-list-select" onClick={() => selectDetail(item.id)} disabled={Boolean(busy)}>
                    <span className="strategy-list-title-row">
                      <strong>{item.name}</strong>
                      <small className={`strategy-status status-${item.status}`}>{statusLabel(item.status)}</small>
                    </span>
                    <span>{tr("Revision")}{' '}{item.revision} · {tr(item.locked ? 'Protected' : 'Editable')}</span>
                    <span>{lifecycleSummary(item, isWinner, isCandidate)}</span>
                  </button>
                  <div className="strategy-list-markers">
                    {isResearch ? <span>{tr("BACKTEST")}</span> : null}
                    {isCandidate ? <span className="candidate">{tr("CANDIDATE")}</span> : null}
                    {isWinner ? <span className="winner">{tr("TRADER")}</span> : null}
                  </div>
                </article>
              )
            })}
          </div>
        </aside>

        <div className="strategy-editor-panel">
          <div className="strategy-editor-header">
            <div>
              <span className="panel-kicker">{tr("SELECTED STRATEGY")}</span>
              <h3>{selected.name}</h3>
              <p>{tr("Revision")}{' '}{selected.revision} {tr("· Hash")}{' '}{selected.configuration_hash?.slice(0, 12) || '—'}{tr("… · Source")}{' '}{selected.origin?.winner_source_file || tr('catalog snapshot')}</p>
            </div>
            <div className="strategy-editor-actions">
              <button type="button" onClick={() => cloneStrategy(selected)} disabled={Boolean(busy)}>{tr("Clone for test")}</button>
              {selected.id !== researchId ? <button type="button" onClick={() => useForBacktest(selected)} disabled={Boolean(busy) || hasActiveBacktest}>{tr("Use for backtest")}</button> : null}
              {!selected.locked && selected.status === 'draft' ? <button type="button" className="candidate-action" title={tr(canMarkCandidate ? 'Make the latest completed run for the selected model the single active Candidate' : 'Save XGBoost or LightGBM on this Strategy and complete its backtest first')} onClick={() => markAsCandidate(selected)} disabled={Boolean(busy) || !canMarkCandidate}>{tr("Mark as candidate")}</button> : null}
              {selected.id !== winnerId ? <button type="button" className="promote-action" title={tr(canPromote ? 'Promote metadata only, preserving the current position and next scheduled pipeline' : 'Mark a completed exact revision as candidate before promotion')} onClick={() => promoteToTrader(selected)} disabled={Boolean(busy) || !canPromote}>{tr("Promote to Trader winner")}</button> : null}
              {!selected.locked && selected.status === 'draft' && selected.id !== researchId ? <button type="button" className="danger" onClick={() => deleteDraft(selected)} disabled={Boolean(busy) || hasActiveBacktest}>{tr("Delete draft")}</button> : null}
            </div>
          </div>

          <div className="strategy-parameter-tools strategy-parameter-tools-global">
            <label className="strategy-parameter-search">
              <StrategyFieldLabel id="hint-parameter-search" label={tr("Find a parameter")} hint={STRATEGY_FIELD_HINTS.search} />
              <div className="strategy-parameter-search-control">
                <input
                  type="search"
                  value={parameterSearch}
                  placeholder={tr("Search Strategy and selected model parameters by label or technical name")}
                  onChange={(event) => setParameterSearch(event.target.value)}
                  autoComplete="off"
                />
                {parameterSearch ? <button type="button" onClick={() => setParameterSearch('')}>{tr("Clear")}</button> : null}
              </div>
            </label>
            <small>{parameterSearch ? tr(globalVisibleParameterCount === 1 ? '{count} matching parameter' : '{count} matching parameters', { count: globalVisibleParameterCount }) : tr(globalVisibleParameterCount === 1 ? '{count} parameter available' : '{count} parameters available', { count: globalVisibleParameterCount })}</small>
          </div>

          <ModelResearchSettingsPanel
            onSessionExpired={onSessionExpired}
            embedded
            strategy={selected}
            onStrategyModelSaved={handleStrategyModelSaved}
            onDirtyChange={setModelHasUnsavedChanges}
            parameterSearch={parameterSearch}
            onSearchMatchCount={setModelParameterMatchCount}
          />

          {selected.status === 'candidate' ? (
            <div className="strategy-candidate-note">
              <StarIcon size={18} />
              <div><strong>{tr("Validated candidate")}</strong><span>{tr("Certified revision")}{' '}{selected.candidate_revision} · {selected.candidate_model?.label || tr('Model snapshot')} · {tr("using backtest")}{' '}{selected.candidate_backtest_id}{tr(". Saving Strategy parameters will return it to draft; model settings remain frozen by the certified job.")}</span></div>
            </div>
          ) : null}

          {selected.status === 'superseded_candidate' ? (
            <div className="strategy-candidate-note historical">
              <StarIcon size={18} />
              <div><strong>{tr("Superseded candidate")}</strong><span>{tr("This validated candidate was replaced by")}{' '}{selected.superseded_by_strategy_id || tr('a newer candidate')} {tr("and remains protected for audit and cloning.")}</span></div>
            </div>
          ) : null}

          {selected.status === 'promoted_candidate' ? (
            <div className="strategy-candidate-note promoted">
              <TrophyIcon size={18} />
              <div><strong>{tr("Promoted candidate")}</strong><span>{tr("This exact validated revision created winner")}{' '}{selected.last_promoted_winner_strategy_id || tr('snapshot')} {tr("and remains protected for audit and cloning.")}</span></div>
            </div>
          ) : null}

          {selected.locked ? (
            <div className="strategy-protection-note">
              <ShieldIcon size={18} />
              <div>
                <strong>{tr(selected.status === 'winner' || selected.status === 'former_winner' ? 'Protected winner snapshot' : 'Protected candidate history')}</strong>
                <span>{tr("This lifecycle snapshot cannot be edited or deleted. Clone it to continue research.")}</span>
              </div>
            </div>
          ) : null}

          <form className="strategy-parameter-form" onSubmit={saveStrategy}>
            <div className="strategy-metadata-grid">
              <label>
                <StrategyFieldLabel id="hint-strategy-name" label={tr("Strategy name")} hint={STRATEGY_FIELD_HINTS.name} />
                <input value={name} onChange={(event) => setName(event.target.value)} disabled={selected.locked} required />
              </label>
              <label>
                <StrategyFieldLabel id="hint-strategy-description" label={tr("Description")} hint={STRATEGY_FIELD_HINTS.description} align="right" />
                <input value={description} onChange={(event) => setDescription(event.target.value)} disabled={selected.locked} />
              </label>
            </div>

            <div className="strategy-parameter-groups">
              {groupedParameters.map((group, index) => (
                <details key={`${group.id}:${parameterSearch ? 'filtered' : 'all'}`} open={parameterSearch ? true : index === 0 || group.id === 'model'}>
                  <summary>{tr(group.label)}<span>{group.fields.length} {tr("parameters")}</span></summary>
                  <div className="strategy-parameter-grid">
                    {group.fields.map((field, fieldIndex) => (
                      <ParameterField
                        key={field}
                        name={field}
                        value={editorValues[field]}
                        reference={selected.configuration[field]}
                        schema={parameterSchemas[field]}
                        hintAlign={fieldIndex % 2 === 1 ? 'right' : 'left'}
                        disabled={selected.locked}
                        onChange={updateEditorValue}
                      />
                    ))}
                  </div>
                </details>
              ))}
              {parameterSearch && globalVisibleParameterCount === 0 ? (
                <div className="strategy-parameter-empty">{tr("No parameter matches “")}{parameterSearch}{tr("”. Search Strategy and selected model parameters by label, technical name or description.")}</div>
              ) : null}
            </div>

            {!selected.locked ? (
              <div className="strategy-save-row">
                <label>
                  <StrategyFieldLabel id="hint-strategy-change-reason" label={tr("Change reason")} hint={STRATEGY_FIELD_HINTS.changeReason} />
                  <input value={changeNote} onChange={(event) => setChangeNote(event.target.value)} maxLength={500} required />
                </label>
                <div className="strategy-save-actions">
                  <small>{tr(hasUnsavedStrategyChanges ? selected.status === 'candidate' ? 'Unsaved edits are local. Saving them will create a new draft revision.' : 'Local draft preserved until you save or leave this strategy.' : 'No unsaved Strategy parameter changes.')}</small>
                  <button type="submit" className="admin-primary-button" disabled={Boolean(busy) || !hasUnsavedStrategyChanges}>{tr(busy === 'save' ? 'Saving…' : 'Save test strategy')}</button>
                </div>
              </div>
            ) : null}
          </form>

          <div className="strategy-last-test">
            <span>{tr("Latest backtest")}</span>
            <strong>{selected.last_backtest_status ? statusLabel(selected.last_backtest_status) : tr('Not run for this revision')}</strong>
            <small>{selected.last_backtest_id || '—'} {tr("· Updated")}{' '}{dateTime(selected.updated_at)}</small>
          </div>
        </div>
      </div>
    </section>
  )
}

function StrategyFieldLabel({ id, label, hint, align = 'left' }) {
  return (
    <span className="strategy-field-label-with-hint">
      <span>{tr(label)}</span>
      <ParameterHint id={id} title={tr(label)} align={align} {...hint} />
    </span>
  )
}

const ParameterField = memo(function ParameterField({ name, value, reference, schema, hintAlign = 'left', disabled, onChange }) {
  const label = strategyParameterLabel(name, schema?.title || titleFromName(name))
  const hint = {
    description: schema?.description ? tr(schema.description) : tr('Controls the {label} value used by this protected research configuration.', { label: tr(label).toLocaleLowerCase() }),
    relationship: parameterRelationship(name, schema, reference),
  }
  const fieldHeading = (
    <span className="strategy-field-heading">
      <span className="strategy-field-label-with-hint">
        <span>{tr(label)}</span>
        <ParameterHint id={`hint-strategy-parameter-${name}`} title={tr(label)} align={hintAlign} {...hint} />
      </span>
      <code>{name}</code>
    </span>
  )
  const enumValues = Array.isArray(schema?.enum) ? schema.enum : []
  if (enumValues.length) {
    return (
      <label>
        {fieldHeading}
        <select value={value ?? ''} disabled={disabled} onChange={(event) => onChange(name, event.target.value)}>
          {enumValues.map((option) => <option key={String(option)} value={option}>{String(option)}</option>)}
        </select>
      </label>
    )
  }
  if (typeof reference === 'boolean') {
    return (
      <label className="strategy-boolean-field">
        {fieldHeading}
        <input type="checkbox" checked={Boolean(value)} disabled={disabled} onChange={(event) => onChange(name, event.target.checked)} />
      </label>
    )
  }
  if (name === 'assets' && Array.isArray(reference)) {
    return (
      <label className="strategy-asset-field">
        {fieldHeading}
        <textarea
          value={value ?? ''}
          disabled={disabled}
          rows="2"
          spellCheck="false"
          autoComplete="off"
          autoCapitalize="characters"
          placeholder={tr('NVDA, AAPL, MSFT or one symbol per line')}
          onChange={(event) => onChange(name, event.target.value)}
        />
        <small>{tr('Enter ticker symbols separated by commas, spaces, semicolons or line breaks. The API normalizes the symbols, removes duplicates and builds the final asset list.')}</small>
      </label>
    )
  }
  if (Array.isArray(reference)) {
    return (
      <label className="strategy-array-field">
        {fieldHeading}
        <textarea value={value ?? ''} disabled={disabled} rows="2" spellCheck="false" onChange={(event) => onChange(name, event.target.value)} />
      </label>
    )
  }
  if (typeof reference === 'number') {
    return (
      <label>
        {fieldHeading}
        <input
          type="number"
          value={value ?? ''}
          disabled={disabled}
          step={schema?.type === 'integer' ? '1' : 'any'}
          min={schema?.minimum}
          max={schema?.maximum}
          onChange={(event) => onChange(name, event.target.value)}
          required
        />
      </label>
    )
  }
  return (
    <label>
      {fieldHeading}
      <input value={value ?? ''} disabled={disabled} onChange={(event) => onChange(name, event.target.value)} />
    </label>
  )
})
