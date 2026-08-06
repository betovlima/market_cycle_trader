import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import { ApiError, apiFetch } from '../api/http'
import { API } from '../config/env'
import { ActivityIcon, ClockIcon, SettingsIcon, ShieldIcon } from '../shared/components/Icons'
import { StrategySettingsPanel } from './StrategySettingsPanel'

const DEFAULT_FORM = {
  enabled: true,
  automatic_training_enabled: true,
  max_concurrent_jobs: 1,
  timeout_minutes: 360,
  reason: '',
}


const PARAMETER_HINTS = {
  trainingEnabled: {
    description: 'Controls whether new model-training and backtest jobs may start. Turning it off does not forcibly terminate a job that is already running.',
    formula: 'jobs_started = 0 if disabled; otherwise one active backtest at a time',
    example: 'With training disabled and 3 requested jobs, jobs_started = 0.',
  },
  automaticTraining: {
    description: 'Allows the scheduler to start the authorized pre-market training cycle automatically when an eligible market session is approaching.',
    formula: 'automatic_runs ≤ eligible_market_sessions',
    example: 'With 5 eligible market sessions in a week, at most 5 scheduled pre-market runs can be started.',
  },
  timeoutMinutes: {
    description: 'Maximum wall-clock duration allowed for one backtest before the API stops it.',
    formula: 'timeout_seconds = timeout_minutes × 60',
    example: '360 minutes × 60 = 21,600 seconds = 6 hours.',
  },
  changeReason: {
    description: 'Required audit note explaining why the Administrator changed the configuration. It is stored with the resulting revision.',
    formula: 'new_revision = current_revision + 1',
    example: 'Saving revision 12 with a valid reason creates revision 13 and records the Administrator and timestamp.',
  },
}

function dateTime(value) {
  if (!value) return '—'
  return new Date(value).toLocaleString()
}

function modeLabel(value) {
  return String(value || 'stopped').replaceAll('_', ' ')
}

function historySummary(item) {
  const training = item.training || {}
  return [
    training.enabled ? 'Training on' : 'Training off',
    training.automatic_training_enabled ? 'Automatic on' : 'Automatic off',
    'Strategy catalog separated from runtime controls',
    'Single backtest queue',
  ].join(' · ')
}

export function SystemSettingsPage({ onSessionExpired }) {
  const [settings, setSettings] = useState(null)
  const [history, setHistory] = useState([])
  const [traderControl, setTraderControl] = useState(null)
  const [traderHistory, setTraderHistory] = useState([])
  const [form, setForm] = useState(DEFAULT_FORM)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [traderBusy, setTraderBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const initialLoadStartedRef = useRef(false)

  const handleError = useCallback((requestError) => {
    if (requestError instanceof ApiError && requestError.status === 401) {
      onSessionExpired()
      return
    }
    setError(requestError.message || 'Unable to update system settings.')
  }, [onSessionExpired])

  const loadData = useCallback(async () => {
    setLoading(true)
    try {
      const [settingsResponse, historyResponse, traderResponse, traderHistoryResponse] = await Promise.all([
        apiFetch(`${API}/admin/system-settings`),
        apiFetch(`${API}/admin/system-settings/history?limit=20`),
        apiFetch(`${API}/admin/trader-control/status`),
        apiFetch(`${API}/admin/trader-control/history?limit=20`),
      ])
      const training = settingsResponse.training || {}
      setSettings(settingsResponse)
      setHistory(historyResponse.items || [])
      setTraderControl(traderResponse)
      setTraderHistory(traderHistoryResponse.items || [])
      setForm({
        enabled: Boolean(training.enabled),
        automatic_training_enabled: Boolean(training.automatic_training_enabled),
        max_concurrent_jobs: Number(training.max_concurrent_jobs || 1),
        timeout_minutes: Math.max(5, Math.round(Number(training.timeout_seconds || 21600) / 60)),
        reason: '',
      })
      setError('')
    } catch (requestError) {
      handleError(requestError)
    } finally {
      setLoading(false)
    }
  }, [handleError])

  useEffect(() => {
    if (initialLoadStartedRef.current) return
    initialLoadStartedRef.current = true
    loadData()
  }, [loadData])

  const refreshTraderControl = useCallback(async () => {
    try {
      const [traderResponse, traderHistoryResponse] = await Promise.all([
        apiFetch(`${API}/admin/trader-control/status`),
        apiFetch(`${API}/admin/trader-control/history?limit=20`),
      ])
      setTraderControl(traderResponse)
      setTraderHistory(traderHistoryResponse.items || [])
    } catch (requestError) {
      handleError(requestError)
    }
  }, [handleError])

  async function saveSettings(event) {
    event.preventDefault()
    const reason = form.reason.trim()
    if (reason.length < 3) {
      setError('Enter a reason for this change.')
      return
    }
    setSaving(true)
    setError('')
    setNotice('')
    try {
      const response = await apiFetch(`${API}/admin/system-settings`, {
        method: 'PATCH',
        body: {
          expected_revision: settings.revision,
          reason,
          training: {
            enabled: Boolean(form.enabled),
            automatic_training_enabled: Boolean(form.automatic_training_enabled),
            max_concurrent_jobs: Number(form.max_concurrent_jobs),
            timeout_seconds: Number(form.timeout_minutes) * 60,
          },
        },
      })
      setSettings(response)
      setForm((current) => ({ ...current, reason: '' }))
      setNotice('System settings saved.')
      const historyResponse = await apiFetch(`${API}/admin/system-settings/history?limit=20`)
      setHistory(historyResponse.items || [])
    } catch (requestError) {
      if (requestError instanceof ApiError && requestError.status === 409) {
        await loadData()
      }
      handleError(requestError)
    } finally {
      setSaving(false)
    }
  }

  async function changeTraderMode(mode) {
    const labels = {
      active: 'Start Trader',
      paused: 'Pause Trader',
      exit_only: 'Enable exit-only mode',
      stopped: 'Stop Trader',
    }
    const destructive = mode === 'stopped'
    if (destructive && !window.confirm('Stop the Trader and cancel a pending non-executing run?')) return
    setTraderBusy(true)
    setError('')
    setNotice('')
    try {
      const response = await apiFetch(`${API}/admin/trader-control/mode`, {
        method: 'POST',
        body: {
          mode,
          cancel_pending_run: destructive,
          reason: labels[mode],
        },
      })
      setTraderControl(response)
      setNotice(`Trader mode changed to ${modeLabel(mode)}.`)
      const historyResponse = await apiFetch(`${API}/admin/trader-control/history?limit=20`)
      setTraderHistory(historyResponse.items || [])
    } catch (requestError) {
      handleError(requestError)
    } finally {
      setTraderBusy(false)
    }
  }

  const timeoutHours = useMemo(() => Number(form.timeout_minutes || 0) / 60, [form.timeout_minutes])

  if (loading) {
    return <div className="settings-loading"><span className="loading-ring" />Loading system settings…</div>
  }

  if (!settings) {
    return <div className="page-stack system-settings-page"><div className="global-inline-message error-inline">{error || 'System settings are unavailable.'}</div><button type="button" className="secondary-action" onClick={loadData}>Retry</button></div>
  }

  return (
    <div className="page-stack system-settings-page">
      <div className="page-heading">
        <div className="page-title-icon"><SettingsIcon size={22} /></div>
        <div>
          <h2>System Settings</h2>
          <p>Manage runtime controls, research strategies and the protected Trader winner.</p>
        </div>
        <span className="settings-revision-badge">Revision {settings?.revision || 1}</span>
      </div>

      {error ? <div className="global-inline-message error-inline">{error}</div> : null}
      {notice ? <div className="global-inline-message success-inline">{notice}</div> : null}

      <section className="settings-summary-grid">
        <SettingsSummary icon={<ActivityIcon size={20} />} label="Training" value={form.enabled ? 'Enabled' : 'Disabled'} tone={form.enabled ? 'positive' : 'negative'} />
        <SettingsSummary icon={<ClockIcon size={20} />} label="Automatic training" value={form.automatic_training_enabled ? 'Enabled' : 'Disabled'} tone={form.automatic_training_enabled ? 'positive' : 'warning'} />
        <SettingsSummary icon={<SettingsIcon size={20} />} label="Detected CPU" value={settings?.runtime?.detected_cpu_count || '—'} />
        <SettingsSummary icon={<ShieldIcon size={20} />} label="Trader mode" value={modeLabel(traderControl?.control_mode)} tone={traderControl?.control_mode === 'active' ? 'positive' : 'warning'} />
      </section>

      <section className="panel settings-panel">
        <div className="panel-heading">
          <div>
            <span className="panel-kicker">TRAINING</span>
            <h2>Model execution</h2>
          </div>
        </div>

        <form className="settings-form" onSubmit={saveSettings}>
          <div className="settings-toggle-grid">
            <ToggleField
              id="training-enabled"
              label="Training enabled"
              hint={PARAMETER_HINTS.trainingEnabled}
              hintAlign="left"
              checked={form.enabled}
              onChange={(checked) => setForm({ ...form, enabled: checked })}
            />
            <ToggleField
              id="automatic-training-enabled"
              label="Automatic pre-market training"
              hint={PARAMETER_HINTS.automaticTraining}
              hintAlign="right"
              checked={form.automatic_training_enabled}
              disabled={!form.enabled}
              onChange={(checked) => setForm({ ...form, automatic_training_enabled: checked })}
            />
          </div>

          <div className="settings-field-grid single-field-grid">
            <NumberField id="backtest-timeout-minutes" label="Backtest timeout (minutes)" hint={PARAMETER_HINTS.timeoutMinutes} hintAlign="right" value={form.timeout_minutes} min="5" max="1440" step="5" onChange={(value) => setForm({ ...form, timeout_minutes: value })} />
          </div>

          <div className="settings-runtime-grid">
            <div className="settings-runtime-note">
              <strong>Separated</strong>
              <span>Strategy parameters are managed in the research workspace below</span>
            </div>
            <div className="settings-runtime-note">
              <strong>Single backtest queue</strong>
              <span>Clone and edit drafts while a run is active; another run remains locked</span>
            </div>
            <div className="settings-runtime-note">
              <strong>{timeoutHours >= 1 ? `${timeoutHours.toFixed(timeoutHours % 1 ? 1 : 0)} hours` : `${form.timeout_minutes} minutes`}</strong>
              <span>Current backtest time limit</span>
            </div>
          </div>

          <div className="settings-save-row">
            <div className="settings-reason-field">
              <FieldLabel label="Change reason" hint={PARAMETER_HINTS.changeReason} hintId="hint-change-reason" align="left" />
              <input id="settings-change-reason" value={form.reason} onChange={(event) => setForm({ ...form, reason: event.target.value })} maxLength={500} required />
            </div>
            <button type="submit" className="admin-primary-button" disabled={saving}>{saving ? 'Saving…' : 'Save settings'}</button>
          </div>
        </form>
      </section>

      <StrategySettingsPanel
        onSessionExpired={onSessionExpired}
        onTraderWinnerChanged={refreshTraderControl}
      />

      <section className="panel trader-control-panel">
        <div className="panel-heading">
          <div>
            <span className="panel-kicker">TRADER</span>
            <h2>Trader operation</h2>
          </div>
          <span className={`trader-mode-badge mode-${traderControl?.control_mode || 'stopped'}`}>{modeLabel(traderControl?.control_mode)}</span>
        </div>

        <div className="trader-control-grid">
          <div className="trader-control-status">
            <div><span>Status</span><strong>{traderControl?.status || 'Unknown'}</strong></div>
            <div><span>Phase</span><strong>{modeLabel(traderControl?.phase || '—')}</strong></div>
            <div><span>Scheduler</span><strong>{traderControl?.scheduler_alive ? 'Online' : 'Offline'}</strong></div>
            <div><span>Next session</span><strong>{traderControl?.next_execution_session || '—'}</strong></div>
            <div><span>Trader winner</span><strong>{traderControl?.trader_winner?.name || '—'}</strong></div>
          </div>
          <div className="trader-control-actions">
            <button type="button" onClick={() => changeTraderMode('active')} disabled={traderBusy || traderControl?.control_mode === 'active'}>Start</button>
            <button type="button" onClick={() => changeTraderMode('paused')} disabled={traderBusy || traderControl?.control_mode === 'paused'}>Pause</button>
            <button type="button" onClick={() => changeTraderMode('exit_only')} disabled={traderBusy || traderControl?.control_mode === 'exit_only'}>Exit only</button>
            <button type="button" className="danger" onClick={() => changeTraderMode('stopped')} disabled={traderBusy || traderControl?.control_mode === 'stopped'}>Stop</button>
          </div>
        </div>

        {traderHistory.length ? (
          <div className="trader-control-history">
            <span>Recent changes</span>
            {traderHistory.slice(0, 5).map((item, index) => (
              <div key={`${item.created_at || 'event'}-${index}`}>
                <strong>{modeLabel(item.new_mode)}</strong>
                <small>{dateTime(item.created_at)}</small>
              </div>
            ))}
          </div>
        ) : null}
      </section>

      <section className="panel settings-panel">
        <div className="panel-heading">
          <div>
            <span className="panel-kicker">HISTORY</span>
            <h2>Configuration history</h2>
          </div>
        </div>
        <div className="settings-history-list">
          {history.length ? history.map((item) => (
            <article key={`${item.revision}-${item.updated_at}`} className="settings-history-item">
              <div>
                <strong>Revision {item.revision}</strong>
                <span>{historySummary(item)}</span>
              </div>
              <div>
                <strong>{item.reason}</strong>
                <span>{item.updated_by || 'Administrator'} · {dateTime(item.updated_at)}</span>
              </div>
            </article>
          )) : <div className="settings-empty-history">No settings changes recorded.</div>}
        </div>
      </section>
    </div>
  )
}

function ToggleField({ id, label, hint, hintAlign = 'left', checked, disabled = false, onChange }) {
  return (
    <div className={`settings-toggle ${disabled ? 'disabled' : ''}`}>
      <FieldLabel label={label} hint={hint} hintId={`hint-${id}`} align={hintAlign} />
      <label className="settings-toggle-switch" htmlFor={id}>
        <input id={id} type="checkbox" checked={checked} disabled={disabled} onChange={(event) => onChange(event.target.checked)} aria-label={label} />
        <i aria-hidden="true" />
      </label>
    </div>
  )
}

function NumberField({ id, label, hint, hintAlign = 'left', value, onChange, ...inputProps }) {
  return (
    <div className="settings-number-field">
      <FieldLabel label={label} hint={hint} hintId={`hint-${id}`} align={hintAlign} />
      <input id={id} type="number" value={value} onChange={(event) => onChange(event.target.value)} required {...inputProps} />
    </div>
  )
}

function FieldLabel({ label, hint, hintId, align = 'left' }) {
  return (
    <div className="settings-control-label">
      <span className="settings-control-label-text">{label}</span>
      {hint ? <ParameterHint id={hintId} title={label} align={align} {...hint} /> : null}
    </div>
  )
}

function ParameterHint({ id, title, description, formula, example, align = 'left' }) {
  return (
    <span className={`parameter-hint align-${align}`}>
      <button type="button" className="parameter-hint-trigger" aria-label={`Help for ${title}`} aria-describedby={id}>?</button>
      <span id={id} role="tooltip" className="parameter-hint-card">
        <strong>{title}</strong>
        <span className="parameter-hint-description">{description}</span>
        <span className="parameter-hint-section-label">Relationship</span>
        <code>{formula}</code>
        <span className="parameter-hint-example"><b>Example:</b> {example}</span>
      </span>
    </span>
  )
}

function SettingsSummary({ icon, label, value, tone = '' }) {
  return (
    <article className={`settings-summary-card ${tone}`}>
      <div className="settings-summary-icon">{icon}</div>
      <div><span>{label}</span><strong>{value}</strong></div>
    </article>
  )
}
