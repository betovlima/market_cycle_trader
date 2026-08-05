import { useCallback, useEffect, useMemo, useState } from 'react'

import { ApiError, apiFetch } from '../api/http'
import { API } from '../config/env'
import {
  AccessLinkIcon,
  AccessLockIcon,
  AccessUsersIcon,
  ClockIcon,
  EyeIcon,
  ShieldIcon,
} from '../shared/components/Icons'

const DURATION_OPTIONS = [
  [3600, '1 hour'],
  [21600, '6 hours'],
  [86400, '24 hours'],
  [259200, '3 days'],
  [604800, '7 days'],
  [2592000, '30 days'],
]

const SESSION_OPTIONS = [1, 2, 3, 4, 5]
const DEFAULT_DURATION_SECONDS = String(DURATION_OPTIONS[0][0])

function dateTime(value) {
  if (!value) return '—'
  return new Date(value).toLocaleString()
}

function statusClass(status) {
  if (status === 'active' || status === 'claimed') return 'positive'
  if (status === 'pending_verification') return 'pending'
  if (status === 'legacy_unverified') return 'warning'
  return 'negative'
}

function statusLabel(status) {
  const labels = {
    pending_verification: 'Pending verification',
    claimed: 'Claimed',
    active: 'Active',
    legacy_unverified: 'Legacy unverified',
    expired: 'Expired',
    revoked: 'Revoked',
    blocked: 'Blocked',
  }
  return labels[status] || String(status || 'Unknown').replaceAll('_', ' ')
}

function roleLabel(value) {
  if (!value) return 'Viewer'
  return value.charAt(0).toUpperCase() + value.slice(1)
}

function defaultSessions(role) {
  return ['trader', 'admin'].includes(role) ? '1' : '2'
}

async function copyText(value) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(value)
    return
  }

  const textarea = document.createElement('textarea')
  textarea.value = value
  textarea.setAttribute('readonly', '')
  textarea.style.position = 'fixed'
  textarea.style.opacity = '0'
  document.body.appendChild(textarea)
  textarea.select()
  const copied = document.execCommand('copy')
  textarea.remove()
  if (!copied) throw new Error('The browser did not allow copying the link.')
}

export function AdministrationPage({ onSessionExpired }) {
  const [invitations, setInvitations] = useState([])
  const [logs, setLogs] = useState([])
  const [loading, setLoading] = useState(true)
  const [busyId, setBusyId] = useState('')
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [form, setForm] = useState({
    guest_name: '',
    authorized_email: '',
    role: 'viewer',
    duration_seconds: DEFAULT_DURATION_SECONDS,
    max_active_sessions: defaultSessions('viewer'),
  })
  const [extendDurations, setExtendDurations] = useState({})
  const [sessionLimits, setSessionLimits] = useState({})
  const [generatedAccess, setGeneratedAccess] = useState(null)
  const [traderControl, setTraderControl] = useState(null)
  const [traderHistory, setTraderHistory] = useState([])
  const [traderBusy, setTraderBusy] = useState(false)

  const handleError = useCallback((requestError) => {
    if (requestError instanceof ApiError && requestError.status === 401) {
      onSessionExpired()
      return
    }
    setError(requestError.message || 'Unable to update access control.')
  }, [onSessionExpired])

  const loadData = useCallback(async () => {
    setLoading(true)
    try {
      const [invitationResponse, logResponse, traderResponse, traderHistoryResponse] = await Promise.all([
        apiFetch(`${API}/admin/invitations`),
        apiFetch(`${API}/admin/access-logs?limit=100`),
        apiFetch(`${API}/admin/trader-control/status`),
        apiFetch(`${API}/admin/trader-control/history?limit=25`),
      ])
      const items = invitationResponse.items || []
      setInvitations(items)
      setSessionLimits((current) => {
        const next = { ...current }
        items.forEach((item) => {
          if (!next[item.id]) next[item.id] = String(item.max_active_sessions || defaultSessions(item.role))
        })
        return next
      })
      setLogs(logResponse.items || [])
      setTraderControl(traderResponse)
      setTraderHistory(traderHistoryResponse.items || [])
      setError('')
    } catch (requestError) {
      handleError(requestError)
    } finally {
      setLoading(false)
    }
  }, [handleError])

  useEffect(() => {
    loadData()
  }, [loadData])


  async function changeTraderMode(mode) {
    const labels = { active: 'Start Trader', paused: 'Pause new activity', exit_only: 'Enable exit-only mode', stopped: 'Stop Trader' }
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
      setNotice(`Trader mode changed to ${mode.replaceAll('_', ' ')}.`)
      const history = await apiFetch(`${API}/admin/trader-control/history?limit=25`)
      setTraderHistory(history.items || [])
    } catch (requestError) {
      handleError(requestError)
    } finally {
      setTraderBusy(false)
    }
  }

  async function createInvitation(event) {
    event.preventDefault()
    if (!form.duration_seconds) {
      setError('Select an access duration.')
      return
    }

    setBusyId('create')
    setError('')
    setNotice('')
    try {
      const created = await apiFetch(`${API}/admin/invitations`, {
        method: 'POST',
        body: {
          guest_name: form.guest_name.trim(),
          authorized_email: form.authorized_email.trim().toLowerCase(),
          role: form.role,
          duration_seconds: Number(form.duration_seconds),
          max_active_sessions: Number(form.max_active_sessions),
        },
      })
      setForm({
        guest_name: '',
        authorized_email: '',
        role: 'viewer',
        duration_seconds: DEFAULT_DURATION_SECONDS,
        max_active_sessions: defaultSessions('viewer'),
      })
      setGeneratedAccess(created)
      setNotice(`Identity-verified access link generated for ${created.guest_name}.`)
      await loadData()
    } catch (requestError) {
      handleError(requestError)
    } finally {
      setBusyId('')
    }
  }

  async function runAction(id, action, message) {
    setBusyId(`${id}:${action}`)
    setError('')
    setNotice('')
    try {
      await apiFetch(`${API}/admin/invitations/${encodeURIComponent(id)}/${action}`, {
        method: 'POST',
      })
      setNotice(message)
      await loadData()
    } catch (requestError) {
      handleError(requestError)
    } finally {
      setBusyId('')
    }
  }

  async function regenerateAccessLink(invitation) {
    const selectedDuration = extendDurations[invitation.id] ?? DEFAULT_DURATION_SECONDS
    setBusyId(`${invitation.id}:regenerate-link`)
    setError('')
    setNotice('')
    try {
      const generated = await apiFetch(
        `${API}/admin/invitations/${encodeURIComponent(invitation.id)}/regenerate-link`,
        {
          method: 'POST',
          body: { duration_seconds: Number(selectedDuration) },
        },
      )
      setGeneratedAccess(generated)
      setNotice(`A new identity claim link was generated for ${invitation.guest_name}. Existing sessions were ended.`)
      setExtendDurations((current) => ({
        ...current,
        [invitation.id]: DEFAULT_DURATION_SECONDS,
      }))
      await loadData()
    } catch (requestError) {
      handleError(requestError)
    } finally {
      setBusyId('')
    }
  }

  async function updateInvitation(invitation, body, message, actionName) {
    setBusyId(`${invitation.id}:${actionName}`)
    setError('')
    setNotice('')
    try {
      await apiFetch(`${API}/admin/invitations/${encodeURIComponent(invitation.id)}`, {
        method: 'PATCH',
        body,
      })
      setNotice(message)
      await loadData()
    } catch (requestError) {
      handleError(requestError)
    } finally {
      setBusyId('')
    }
  }

  async function extendInvitation(invitation) {
    const selectedDuration = extendDurations[invitation.id] ?? DEFAULT_DURATION_SECONDS
    await updateInvitation(
      invitation,
      { duration_seconds: Number(selectedDuration) },
      `Access extended for ${invitation.guest_name}.`,
      'extend',
    )
    setExtendDurations((current) => ({ ...current, [invitation.id]: DEFAULT_DURATION_SECONDS }))
  }

  async function saveSessionLimit(invitation) {
    const limit = Number(sessionLimits[invitation.id] || invitation.max_active_sessions || 1)
    await updateInvitation(
      invitation,
      { max_active_sessions: limit },
      `Session limit updated for ${invitation.guest_name}.`,
      'session-limit',
    )
  }

  async function deleteInvitation(invitation) {
    if (!window.confirm(`Delete the access record for ${invitation.guest_name}?`)) return

    setBusyId(`${invitation.id}:delete`)
    setError('')
    setNotice('')
    try {
      await apiFetch(`${API}/admin/invitations/${encodeURIComponent(invitation.id)}`, {
        method: 'DELETE',
      })
      setNotice(`Access record deleted for ${invitation.guest_name}.`)
      await loadData()
    } catch (requestError) {
      handleError(requestError)
    } finally {
      setBusyId('')
    }
  }

  const counts = useMemo(() => ({
    pending: invitations.filter((item) => item.status === 'pending_verification').length,
    active: invitations.filter((item) => ['active', 'claimed'].includes(item.status)).length,
    expired: invitations.filter((item) => item.status === 'expired').length,
    restricted: invitations.filter((item) => ['revoked', 'legacy_unverified', 'blocked'].includes(item.status)).length,
  }), [invitations])

  return (
    <div className="page-stack administration-page">
      <div className="page-heading">
        <div className="page-title-icon"><ShieldIcon size={22} /></div>
        <div>
          <h2>Administration</h2>
          <p>Generate Google-verified Viewer or Trader invitations and review access activity.</p>
        </div>
      </div>

      {error ? <div className="global-inline-message error-inline">{error}</div> : null}
      {notice ? <div className="global-inline-message success-inline">{notice}</div> : null}


      <section className="panel trader-control-panel">
        <div className="panel-heading">
          <div>
            <span className="panel-kicker">TRADING CONTROL</span>
            <h2>Trader operation</h2>
          </div>
          <span className={`trader-mode-badge mode-${traderControl?.control_mode || 'stopped'}`}>
            {(traderControl?.control_mode || 'stopped').replaceAll('_', ' ')}
          </span>
        </div>

        <div className="trader-control-grid">
          <div className="trader-control-status">
            <div><span>Status</span><strong>{traderControl?.status || 'Unknown'}</strong></div>
            <div><span>Phase</span><strong>{String(traderControl?.phase || '—').replaceAll('_', ' ')}</strong></div>
            <div><span>Scheduler</span><strong>{traderControl?.scheduler_alive ? 'Online' : 'Offline'}</strong></div>
            <div><span>Next session</span><strong>{traderControl?.next_execution_session || '—'}</strong></div>
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
                <strong>{String(item.new_mode || 'unknown').replaceAll('_', ' ')}</strong>
                <small>{dateTime(item.created_at)}</small>
              </div>
            ))}
          </div>
        ) : null}
      </section>

      <section className="admin-summary-grid">
        <AdminSummary icon={<AccessUsersIcon size={20} />} label="Access records" value={invitations.length} />
        <AdminSummary icon={<AccessLinkIcon size={20} />} label="Pending" value={counts.pending} />
        <AdminSummary icon={<ClockIcon size={20} />} label="Claimed / Active" value={counts.active} tone="positive" />
        <AdminSummary icon={<AccessLockIcon size={20} />} label="Expired / Restricted" value={counts.expired + counts.restricted} tone="negative" />
      </section>

      <section className="panel admin-create-panel">
        <div className="panel-heading">
          <div>
            <span className="panel-kicker">IDENTITY-VERIFIED ACCESS</span>
            <h2>Generate access invitation</h2>
          </div>
          <span className="admin-readonly-badge"><EyeIcon size={14} /> Google account required</span>
        </div>

        <form className="admin-invite-form identity-invite-form" onSubmit={createInvitation}>
          <label>
            <span>User name</span>
            <input
              value={form.guest_name}
              onChange={(event) => setForm({ ...form, guest_name: event.target.value })}
              maxLength={120}
              required
            />
          </label>
          <label>
            <span>Authorized Google email</span>
            <input
              type="email"
              value={form.authorized_email}
              onChange={(event) => setForm({ ...form, authorized_email: event.target.value })}
              maxLength={254}
              autoComplete="off"
              required
            />
          </label>
          <label>
            <span>Role</span>
            <select
              value={form.role}
              onChange={(event) => {
                const role = event.target.value
                setForm({ ...form, role, max_active_sessions: defaultSessions(role) })
              }}
              required
            >
              <option value="viewer">Viewer · Backtest only</option>
              <option value="trader">Trader · Backtest and Portfolio</option>
              <option value="admin">Administrator · Full administration</option>
            </select>
          </label>
          <label>
            <span>Access duration</span>
            <select
              value={form.duration_seconds}
              onChange={(event) => setForm({ ...form, duration_seconds: event.target.value })}
              required
            >
              {DURATION_OPTIONS.map(([value, label]) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </select>
          </label>
          <label>
            <span>Maximum active sessions</span>
            <select
              value={form.max_active_sessions}
              onChange={(event) => setForm({ ...form, max_active_sessions: event.target.value })}
              required
            >
              {SESSION_OPTIONS.map((value) => <option key={value} value={value}>{value}</option>)}
            </select>
          </label>
          <button
            type="submit"
            className="admin-primary-button"
            disabled={busyId === 'create' || !form.duration_seconds}
          >
            <AccessLinkIcon size={17} />
            {busyId === 'create' ? 'Generating…' : 'Generate verified link'}
          </button>
        </form>
      </section>

      <section className="panel status-table-panel">
        <div className="panel-heading">
          <div>
            <span className="panel-kicker">ACCESS CONTROL</span>
            <h2>Identity-bound invitations</h2>
          </div>
        </div>

        {loading ? (
          <div className="admin-loading"><span className="loading-ring" />Loading administration…</div>
        ) : (
          <div className="table-scroll">
            <table className="market-table admin-table identity-admin-table">
              <thead>
                <tr>
                  <th>User</th>
                  <th>Role</th>
                  <th>Status</th>
                  <th>Sessions</th>
                  <th>Claimed identity</th>
                  <th>Expires</th>
                  <th>Last access</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {invitations.length === 0 ? (
                  <tr><td colSpan="8" className="empty-table-cell">No access invitations generated.</td></tr>
                ) : invitations.map((item) => {
                  const legacy = item.status === 'legacy_unverified'
                  const primaryAdministrator = Boolean(item.primary_administrator)
                  const locked = ['revoked', 'legacy_unverified'].includes(item.status)
                  const cannotDelete = primaryAdministrator || ['pending_verification', 'claimed', 'active'].includes(item.status)
                  return (
                    <tr key={item.id}>
                      <td data-label="User">
                        <strong>{item.guest_name}</strong>
                        <small className="admin-identity-email">{item.authorized_email || 'No verified email'}</small>
                        {primaryAdministrator ? <small className="primary-administrator-label">Primary Google administrator</small> : null}
                      </td>
                      <td data-label="Role">{roleLabel(item.role)}</td>
                      <td data-label="Status"><span className={`admin-status ${statusClass(item.status)}`}>{statusLabel(item.status)}</span></td>
                      <td data-label="Sessions">
                        <div className="session-limit-control">
                          <strong>{item.active_sessions || 0}</strong>
                          <span>of</span>
                          <select
                            value={sessionLimits[item.id] ?? String(item.max_active_sessions || 1)}
                            onChange={(event) => setSessionLimits({ ...sessionLimits, [item.id]: event.target.value })}
                            disabled={locked}
                            aria-label={`Maximum sessions for ${item.guest_name}`}
                          >
                            {SESSION_OPTIONS.map((value) => <option key={value} value={value}>{value}</option>)}
                          </select>
                          <button type="button" onClick={() => saveSessionLimit(item)} disabled={Boolean(busyId) || locked}>Save</button>
                        </div>
                      </td>
                      <td data-label="Claimed identity">
                        <span className="claimed-identity">{item.claimed_email || (legacy ? 'New invitation required' : 'Not claimed')}</span>
                        {item.claimed_at ? <small>{dateTime(item.claimed_at)}</small> : null}
                      </td>
                      <td data-label="Expires">{dateTime(item.expires_at)}</td>
                      <td data-label="Last access">{dateTime(item.last_access_at)}</td>
                      <td data-label="Actions">
                        <div className="admin-row-actions identity-row-actions">
                          <button
                            type="button"
                            title="End sessions, rotate the token and require a fresh Google identity claim."
                            onClick={() => regenerateAccessLink(item)}
                            disabled={Boolean(busyId) || locked || primaryAdministrator}
                          >
                            Generate new claim link
                          </button>
                          <select
                            value={extendDurations[item.id] ?? DEFAULT_DURATION_SECONDS}
                            onChange={(event) => setExtendDurations({ ...extendDurations, [item.id]: event.target.value })}
                            disabled={locked || primaryAdministrator}
                            aria-label={`Duration for ${item.guest_name}`}
                          >
                            {DURATION_OPTIONS.map(([value, label]) => <option key={value} value={value}>+{label}</option>)}
                          </select>
                          <button type="button" onClick={() => extendInvitation(item)} disabled={Boolean(busyId) || locked || primaryAdministrator}>Extend</button>
                          <button
                            type="button"
                            onClick={() => runAction(item.id, 'terminate-sessions', `Sessions terminated for ${item.guest_name}.`)}
                            disabled={Boolean(busyId) || legacy}
                          >
                            End sessions
                          </button>
                          <button
                            type="button"
                            className="danger"
                            onClick={() => runAction(item.id, 'revoke', `Access revoked for ${item.guest_name}.`)}
                            disabled={Boolean(busyId) || item.status === 'revoked' || legacy || primaryAdministrator}
                          >
                            Revoke
                          </button>
                          <button
                            type="button"
                            className="danger ghost"
                            onClick={() => deleteInvitation(item)}
                            disabled={Boolean(busyId) || cannotDelete}
                          >
                            Delete
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="panel status-table-panel">
        <div className="panel-heading">
          <div>
            <span className="panel-kicker">AUDIT</span>
            <h2>Access history</h2>
          </div>
        </div>
        <div className="table-scroll">
          <table className="market-table access-log-table">
            <thead>
              <tr>
                <th>Time</th>
                <th>Event</th>
                <th>User</th>
                <th>Google identity</th>
                <th>Role</th>
                <th>Result</th>
                <th>Client</th>
              </tr>
            </thead>
            <tbody>
              {logs.length === 0 ? (
                <tr><td colSpan="7" className="empty-table-cell">No access events recorded.</td></tr>
              ) : logs.map((item) => (
                <tr key={item.id}>
                  <td>{dateTime(item.created_at)}</td>
                  <td>{item.event.replaceAll('_', ' ')}</td>
                  <td>{item.guest_name || '—'}</td>
                  <td>{item.identity_email || '—'}</td>
                  <td>{item.role ? roleLabel(item.role) : '—'}</td>
                  <td className={item.success ? 'positive' : 'negative'}>{item.success ? 'Success' : 'Denied'}</td>
                  <td>{item.client_ip}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {generatedAccess ? (
        <AccessLinkDialog access={generatedAccess} onClose={() => setGeneratedAccess(null)} onError={setError} />
      ) : null}
    </div>
  )
}

function AccessLinkDialog({ access, onClose, onError }) {
  const [copied, setCopied] = useState(false)

  async function copyLink() {
    try {
      await copyText(access.access_url)
      setCopied(true)
      onError('')
    } catch (copyError) {
      setCopied(false)
      onError(copyError.message || 'Unable to copy the access link.')
    }
  }

  return (
    <div className="access-link-dialog-backdrop" role="presentation" onMouseDown={onClose}>
      <section className="access-link-dialog" role="dialog" aria-modal="true" aria-labelledby="access-link-title" onMouseDown={(event) => event.stopPropagation()}>
        <div className="access-link-dialog-heading">
          <div>
            <span className="panel-kicker">ONE-TIME IDENTITY CLAIM</span>
            <h2 id="access-link-title">Verified access for {access.guest_name}</h2>
          </div>
          <button type="button" className="access-link-close" onClick={onClose} aria-label="Close">×</button>
        </div>
        <p>
          Share this link only with <strong>{access.authorized_email}</strong>. The first valid claim must use that Google account. After claiming, the raw token is consumed and the authorization is bound to the verified Google identity.
        </p>
        <textarea readOnly value={access.access_url} rows="4" aria-label="Generated access link" />
        <div className="access-link-expiration">
          Expires: <strong>{dateTime(access.expires_at)}</strong> · Maximum active sessions: <strong>{access.max_active_sessions}</strong>
        </div>
        <div className="access-link-dialog-actions">
          <button type="button" className="admin-primary-button" onClick={copyLink}>
            <AccessLinkIcon size={17} />{copied ? 'Link copied' : 'Copy verified link'}
          </button>
          <button type="button" className="access-link-secondary" onClick={onClose}>Close</button>
        </div>
      </section>
    </div>
  )
}

function AdminSummary({ icon, label, value, tone = '' }) {
  return (
    <article className="admin-summary-card">
      <div className={`admin-summary-icon ${tone}`}>{icon}</div>
      <div>
        <span>{label}</span>
        <strong className={tone}>{value}</strong>
      </div>
    </article>
  )
}
