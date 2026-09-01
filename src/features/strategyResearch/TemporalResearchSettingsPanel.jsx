import { useCallback, useEffect, useState } from 'react'

import { ApiError, apiFetch } from '../../api/http'
import { API } from '../../config/env'
import { tr } from '../../i18n/runtime'

function formFromPayload(payload) {
  const settings = payload?.settings || {}
  return {
    regimeContextEnabled: settings?.statistical_ml_control?.regime_context_enabled !== false,
    timingOverridesEnabled: settings?.temporal_timing?.overrides_enabled !== false,
  }
}

function Toggle({ id, label, description, checked, disabled, onChange }) {
  return <label className="temporal-research-setting" htmlFor={id}>
    <div><strong>{tr(label)}</strong><small>{tr(description)}</small></div>
    <span className="temporal-research-toggle">
      <input id={id} type="checkbox" checked={checked} disabled={disabled} onChange={(event) => onChange(event.target.checked)} />
      <i aria-hidden="true" />
    </span>
  </label>
}

export function TemporalResearchSettingsPanel() {
  const [payload, setPayload] = useState(null)
  const [form, setForm] = useState(null)
  const [hidden, setHidden] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  const load = useCallback(async () => {
    try {
      const value = await apiFetch(`${API}/admin/temporal-research-settings`)
      setPayload(value)
      setForm(formFromPayload(value))
      setHidden(false)
    } catch (requestError) {
      if (requestError instanceof ApiError && [401, 403].includes(requestError.status)) {
        setHidden(true)
        return
      }
      setError(tr(requestError?.message || 'Unable to load research parameters.'))
    }
  }, [])

  useEffect(() => { load() }, [load])

  if (hidden || !payload || !form) return null

  const saved = formFromPayload(payload)
  const dirty = saved.regimeContextEnabled !== form.regimeContextEnabled
    || saved.timingOverridesEnabled !== form.timingOverridesEnabled

  async function save() {
    if (!dirty || saving) return
    setSaving(true)
    setError('')
    setNotice('')
    try {
      const current = payload.settings || {}
      const value = await apiFetch(`${API}/admin/temporal-research-settings`, {
        method: 'PATCH',
        body: {
          expected_revision: payload.revision,
          reason: 'Updated from Strategy Research parameters',
          settings: {
            statistical_ml_control: {
              ...(current.statistical_ml_control || {}),
              regime_context_enabled: Boolean(form.regimeContextEnabled),
            },
            temporal_timing: {
              ...(current.temporal_timing || {}),
              overrides_enabled: Boolean(form.timingOverridesEnabled),
            },
          },
        },
      })
      setPayload(value)
      setForm(formFromPayload(value))
      setNotice(tr('Research parameters saved.'))
    } catch (requestError) {
      if (requestError instanceof ApiError && requestError.status === 409) {
        await load()
        setError(tr('Research parameters changed in another session. Review the refreshed values and save again.'))
      } else if (requestError instanceof ApiError && [401, 403].includes(requestError.status)) {
        setHidden(true)
      } else {
        setError(tr(requestError?.message || 'Unable to save research parameters.'))
      }
    } finally {
      setSaving(false)
    }
  }

  return <section className="temporal-research-settings-panel">
    <div className="temporal-research-settings-heading">
      <div><span className="panel-kicker">{tr('RESEARCH PARAMETERS')}</span><h3>{tr('Temporal research controls')}</h3></div>
      <span>{tr('Revision')} {payload.revision}</span>
    </div>
    <Toggle
      id="temporal-regime-context"
      label="Regime context"
      description="Uses causal market-regime context inside Statistical ML Control."
      checked={form.regimeContextEnabled}
      disabled={saving}
      onChange={(value) => { setForm({ ...form, regimeContextEnabled: value }); setNotice('') }}
    />
    <Toggle
      id="temporal-timing-overrides"
      label="Temporal timing overrides"
      description="Allows Temporal timing evidence to replace the reference Strategy asset when the override conditions are satisfied."
      checked={form.timingOverridesEnabled}
      disabled={saving}
      onChange={(value) => { setForm({ ...form, timingOverridesEnabled: value }); setNotice('') }}
    />
    {error ? <div className="global-inline-message error-inline">{error}</div> : null}
    {notice ? <div className="global-inline-message success-inline">{notice}</div> : null}
    <div className="temporal-research-settings-actions">
      <small>{tr('Changing these parameters does not start processing. They are frozen into the next research execution.')}</small>
      <button type="button" className="secondary-action compact" onClick={save} disabled={!dirty || saving}>{tr(saving ? 'Saving…' : 'Save research parameters')}</button>
    </div>
  </section>
}
