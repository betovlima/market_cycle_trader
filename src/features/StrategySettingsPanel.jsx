import { useCallback, useEffect, useMemo, useState } from 'react'

import { ApiError, apiFetch } from '../api/http'
import { API } from '../config/env'
import { ActivityIcon, ShieldIcon, TrophyIcon } from '../shared/components/Icons'

const ACTIVE_JOB_STATUSES = new Set(['queued', 'running'])

function titleFromName(name) {
  return name.replaceAll('_', ' ').replace(/\b\w/g, (letter) => letter.toUpperCase())
}

function dateTime(value) {
  if (!value) return '—'
  return new Date(value).toLocaleString()
}

function statusLabel(value) {
  return String(value || 'draft').replaceAll('_', ' ')
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
    if (Array.isArray(value)) return [name, JSON.stringify(value)]
    if (value === null || value === undefined) return [name, '']
    if (typeof value === 'number') return [name, String(value)]
    return [name, value]
  }))
}

function parseEditorValues(values, original) {
  const configuration = {}
  for (const [name, raw] of Object.entries(values)) {
    const reference = original[name]
    if (Array.isArray(reference)) {
      const parsed = JSON.parse(String(raw || '[]'))
      if (!Array.isArray(parsed)) throw new Error(`${titleFromName(name)} must be a JSON array.`)
      configuration[name] = parsed
    } else if (typeof reference === 'boolean') {
      configuration[name] = Boolean(raw)
    } else if (typeof reference === 'number') {
      const parsed = Number(raw)
      if (!Number.isFinite(parsed)) throw new Error(`${titleFromName(name)} must be numeric.`)
      configuration[name] = parsed
    } else if (reference === null) {
      configuration[name] = String(raw || '').trim() || null
    } else {
      configuration[name] = String(raw)
    }
  }
  return configuration
}

export function StrategySettingsPanel({ onSessionExpired, onTraderWinnerChanged }) {
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

  const handleError = useCallback((requestError) => {
    if (requestError instanceof ApiError && requestError.status === 401) {
      onSessionExpired()
      return
    }
    setError(requestError.message || 'Unable to manage strategies.')
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
    return detail
  }, [])

  const loadCatalog = useCallback(async (preferredStrategyId = '') => {
    setLoading(true)
    try {
      const response = await apiFetch(`${API}/admin/strategies`)
      setCatalog(response)
      await refreshActiveJob()
      const targetId = preferredStrategyId
        || response.control?.research_strategy_id
        || response.items?.[0]?.id
      if (targetId) await loadStrategy(targetId)
      setError('')
    } catch (requestError) {
      handleError(requestError)
    } finally {
      setLoading(false)
    }
  }, [handleError, loadStrategy, refreshActiveJob])

  useEffect(() => {
    loadCatalog()
  }, [loadCatalog])

  useEffect(() => {
    if (!activeJob) return undefined
    const timerId = window.setInterval(refreshActiveJob, 5000)
    return () => window.clearInterval(timerId)
  }, [activeJob, refreshActiveJob])

  async function selectDetail(strategyId) {
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
    const suggested = `${source.name} Test`
    const cloneName = window.prompt('Name for the new test strategy:', suggested)?.trim()
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
      setNotice('Test strategy created. The Trader winner was not changed.')
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
      setError('Enter a change reason for the strategy revision.')
      return
    }
    let configuration
    try {
      configuration = parseEditorValues(editorValues, selected.configuration || {})
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
          name: name.trim(),
          description: description.trim(),
          note,
        },
      })
      setSelected(updated)
      setEditorValues(toEditorValues(updated.configuration || {}))
      setChangeNote('')
      setNotice(`Strategy saved as revision ${updated.revision}. Run a new backtest before promotion.`)
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

  async function useForBacktest(strategy) {
    if (activeJob) {
      setError('Wait for the active backtest to finish before changing the selected backtest strategy.')
      return
    }
    const note = window.prompt('Reason for selecting this strategy for backtests:', `Test ${strategy.name}`)?.trim()
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
      setNotice('Backtests will use the selected strategy. Trader continues using the protected winner.')
      await loadCatalog(strategy.id)
    } catch (requestError) {
      handleError(requestError)
    } finally {
      setBusy('')
    }
  }

  async function promoteToTrader(strategy) {
    if (activeJob) {
      setError('Wait for the active backtest to finish before promoting another Trader winner.')
      return
    }
    const confirmation = window.confirm(
      `Promote "${strategy.name}" to the Trader winner?\n\n` +
      'A locked snapshot will be created. The current winner will remain preserved as a former winner. Trader must be paused or stopped and in cash.',
    )
    if (!confirmation) return
    const note = window.prompt('Promotion reason:', `Promote ${strategy.name} after validated backtest`)?.trim()
    if (!note) return
    setBusy(`promote:${strategy.id}`)
    setError('')
    setNotice('')
    try {
      const result = await apiFetch(`${API}/admin/strategies/${encodeURIComponent(strategy.id)}/promote-to-trader`, {
        method: 'POST',
        body: {
          confirm_promote_to_trader: true,
          expected_control_revision: catalog.control.revision,
          expected_strategy_revision: strategy.revision,
          note,
        },
      })
      setNotice(`${result.winner.name} is now the protected Trader winner. Reinitialize Paper state before restarting Trader.`)
      await loadCatalog(strategy.id)
      onTraderWinnerChanged?.()
    } catch (requestError) {
      handleError(requestError)
    } finally {
      setBusy('')
    }
  }

  async function deleteDraft(strategy) {
    if (activeJob) {
      setError('Wait for the active backtest to finish before deleting a test strategy.')
      return
    }
    if (!window.confirm(`Delete the draft strategy "${strategy.name}"?`)) return
    setBusy(`delete:${strategy.id}`)
    setError('')
    setNotice('')
    try {
      await apiFetch(`${API}/admin/strategies/${encodeURIComponent(strategy.id)}`, {
        method: 'DELETE',
        body: { confirm_delete: true, note: `Delete unused draft ${strategy.name}` },
      })
      setNotice('Draft strategy deleted.')
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
    return groups
  }, [catalog?.parameter_groups, catalog?.parameter_order, selected])

  if (loading) {
    return <section className="panel strategy-lab-panel"><div className="settings-loading"><span className="loading-ring" />Loading strategies…</div></section>
  }

  if (!catalog || !selected) {
    return <section className="panel strategy-lab-panel"><div className="global-inline-message error-inline">{error || 'Strategy catalog is unavailable.'}</div></section>
  }

  const researchId = catalog.control?.research_strategy_id
  const winnerId = catalog.control?.trader_winner_strategy_id
  const hasActiveBacktest = Boolean(activeJob)
  const canPromote = selected.last_backtest_status === 'completed' && Number(selected.last_backtest_revision) === Number(selected.revision) && selected.id !== winnerId && !hasActiveBacktest

  return (
    <section className="panel strategy-lab-panel">
      <div className="panel-heading strategy-lab-heading">
        <div>
          <span className="panel-kicker">STRATEGIES</span>
          <h2>Research strategies and Trader winner</h2>
          <p>Create and tune test strategies without changing the strategy used by Trader.</p>
        </div>
        <span className="strategy-control-revision">Selection revision {catalog.control.revision}</span>
      </div>

      {error ? <div className="global-inline-message error-inline">{error}</div> : null}
      {notice ? <div className="global-inline-message success-inline">{notice}</div> : null}
      {hasActiveBacktest ? (
        <div className="global-inline-message warning-inline">
          Backtest {activeJob.id} is {activeJob.status}. You may clone and edit test strategies, but strategy selection, deletion, promotion and a new backtest remain locked until it finishes.
        </div>
      ) : null}

      <div className="strategy-boundary-grid">
        <article>
          <ActivityIcon size={20} />
          <div><span>Backtest strategy</span><strong>{catalog.control.research_strategy?.name}</strong></div>
        </article>
        <article className="winner-boundary-card">
          <TrophyIcon size={20} />
          <div><span>Trader winner</span><strong>{catalog.control.trader_winner?.name}</strong></div>
        </article>
        <article>
          <ShieldIcon size={20} />
          <div><span>Winner protection</span><strong>Immutable snapshot</strong></div>
        </article>
      </div>

      {catalog.control?.paper_state_reinitialization_required ? (
        <div className="global-inline-message warning-inline">The Trader winner changed. Run the protected Paper initialization before restarting Trader.</div>
      ) : null}

      <div className="strategy-workspace">
        <aside className="strategy-list-panel">
          <div className="strategy-list-heading">
            <strong>Strategy catalog</strong>
            <button type="button" onClick={() => cloneStrategy(catalog.control.trader_winner)} disabled={Boolean(busy)}>Clone winner</button>
          </div>
          <div className="strategy-list">
            {catalog.items.map((item) => {
              const isResearch = item.id === researchId
              const isWinner = item.id === winnerId
              return (
                <article key={item.id} className={`strategy-list-item ${selected.id === item.id ? 'selected' : ''}`}>
                  <button type="button" className="strategy-list-select" onClick={() => selectDetail(item.id)} disabled={Boolean(busy)}>
                    <span className="strategy-list-title-row">
                      <strong>{item.name}</strong>
                      <small className={`strategy-status status-${item.status}`}>{statusLabel(item.status)}</small>
                    </span>
                    <span>Revision {item.revision} · {item.locked ? 'Protected' : 'Editable'}</span>
                    <span>{isWinner ? 'Active Trader winner' : item.last_backtest_status === 'completed' ? 'Backtest completed' : 'Backtest required'}</span>
                  </button>
                  <div className="strategy-list-markers">
                    {isResearch ? <span>BACKTEST</span> : null}
                    {isWinner ? <span className="winner">TRADER</span> : null}
                  </div>
                </article>
              )
            })}
          </div>
        </aside>

        <div className="strategy-editor-panel">
          <div className="strategy-editor-header">
            <div>
              <span className="panel-kicker">SELECTED STRATEGY</span>
              <h3>{selected.name}</h3>
              <p>Revision {selected.revision} · Hash {selected.configuration_hash?.slice(0, 12) || '—'}… · Source {selected.origin?.winner_source_file || 'catalog snapshot'}</p>
            </div>
            <div className="strategy-editor-actions">
              <button type="button" onClick={() => cloneStrategy(selected)} disabled={Boolean(busy)}>Clone for test</button>
              {selected.id !== researchId ? <button type="button" onClick={() => useForBacktest(selected)} disabled={Boolean(busy) || hasActiveBacktest}>Use for backtest</button> : null}
              {selected.id !== winnerId ? <button type="button" className="promote-action" title={canPromote ? 'Create an immutable Trader winner snapshot' : 'Complete a backtest for this exact strategy revision before promotion'} onClick={() => promoteToTrader(selected)} disabled={Boolean(busy) || !canPromote}>Promote to Trader winner</button> : null}
              {!selected.locked && selected.id !== researchId ? <button type="button" className="danger" onClick={() => deleteDraft(selected)} disabled={Boolean(busy) || hasActiveBacktest}>Delete draft</button> : null}
            </div>
          </div>

          {selected.locked ? (
            <div className="strategy-protection-note">
              <ShieldIcon size={18} />
              <div><strong>Protected winner snapshot</strong><span>This strategy cannot be edited. Clone it to create a new test strategy.</span></div>
            </div>
          ) : null}

          <form className="strategy-parameter-form" onSubmit={saveStrategy}>
            <div className="strategy-metadata-grid">
              <label><span>Strategy name</span><input value={name} onChange={(event) => setName(event.target.value)} disabled={selected.locked} required /></label>
              <label><span>Description</span><input value={description} onChange={(event) => setDescription(event.target.value)} disabled={selected.locked} /></label>
            </div>

            <div className="strategy-parameter-groups">
              {groupedParameters.map((group, index) => (
                <details key={group.id} open={index === 0 || group.id === 'model'}>
                  <summary>{group.label}<span>{group.fields.length} parameters</span></summary>
                  <div className="strategy-parameter-grid">
                    {group.fields.map((field) => (
                      <ParameterField
                        key={field}
                        name={field}
                        value={editorValues[field]}
                        reference={selected.configuration[field]}
                        schema={resolveFieldSchema(catalog.parameter_schema, field)}
                        disabled={selected.locked}
                        onChange={(value) => setEditorValues((current) => ({ ...current, [field]: value }))}
                      />
                    ))}
                  </div>
                </details>
              ))}
            </div>

            {!selected.locked ? (
              <div className="strategy-save-row">
                <label><span>Change reason</span><input value={changeNote} onChange={(event) => setChangeNote(event.target.value)} maxLength={500} required /></label>
                <button type="submit" className="admin-primary-button" disabled={Boolean(busy)}>{busy === 'save' ? 'Saving…' : 'Save test strategy'}</button>
              </div>
            ) : null}
          </form>

          <div className="strategy-last-test">
            <span>Latest backtest</span>
            <strong>{selected.last_backtest_status ? statusLabel(selected.last_backtest_status) : 'Not run for this revision'}</strong>
            <small>{selected.last_backtest_id || '—'} · Updated {dateTime(selected.updated_at)}</small>
          </div>
        </div>
      </div>
    </section>
  )
}

function ParameterField({ name, value, reference, schema, disabled, onChange }) {
  const label = titleFromName(name)
  const enumValues = Array.isArray(schema?.enum) ? schema.enum : []
  if (enumValues.length) {
    return (
      <label>
        <span>{label}</span>
        <select value={value ?? ''} disabled={disabled} onChange={(event) => onChange(event.target.value)}>
          {enumValues.map((option) => <option key={String(option)} value={option}>{String(option)}</option>)}
        </select>
      </label>
    )
  }
  if (typeof reference === 'boolean') {
    return (
      <label className="strategy-boolean-field">
        <span>{label}</span>
        <input type="checkbox" checked={Boolean(value)} disabled={disabled} onChange={(event) => onChange(event.target.checked)} />
      </label>
    )
  }
  if (Array.isArray(reference)) {
    return (
      <label className="strategy-array-field">
        <span>{label}</span>
        <textarea value={value ?? ''} disabled={disabled} rows="2" spellCheck="false" onChange={(event) => onChange(event.target.value)} />
      </label>
    )
  }
  if (typeof reference === 'number') {
    return (
      <label>
        <span>{label}</span>
        <input
          type="number"
          value={value ?? ''}
          disabled={disabled}
          step={schema?.type === 'integer' ? '1' : 'any'}
          min={schema?.minimum}
          max={schema?.maximum}
          onChange={(event) => onChange(event.target.value)}
          required
        />
      </label>
    )
  }
  return (
    <label>
      <span>{label}</span>
      <input value={value ?? ''} disabled={disabled} onChange={(event) => onChange(event.target.value)} />
    </label>
  )
}
