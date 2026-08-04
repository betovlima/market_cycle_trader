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

const DEFAULT_DURATION_SECONDS = String(DURATION_OPTIONS[0][0])

function dateTime(value) {
  if (!value) return '—'
  return new Date(value).toLocaleString()
}

function statusClass(status) {
  return status === 'active' ? 'positive' : 'negative'
}

function roleLabel(value) {
  if (!value) return 'Viewer'
  return value.charAt(0).toUpperCase() + value.slice(1)
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
    duration_seconds: DEFAULT_DURATION_SECONDS,
  })
  const [extendDurations, setExtendDurations] = useState({})
  const [generatedAccess, setGeneratedAccess] = useState(null)

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
      const [invitationResponse, logResponse] = await Promise.all([
        apiFetch(`${API}/admin/invitations`),
        apiFetch(`${API}/admin/access-logs?limit=100`),
      ])
      setInvitations(invitationResponse.items || [])
      setLogs(logResponse.items || [])
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
          duration_seconds: Number(form.duration_seconds),
        },
      })
      setForm({ guest_name: '', duration_seconds: DEFAULT_DURATION_SECONDS })
      setGeneratedAccess(created)
      setNotice(`Access link generated for ${created.guest_name}.`)
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
      setNotice(`A new access link was generated for ${invitation.guest_name}.`)
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

  async function extendInvitation(invitation) {
    const selectedDuration = extendDurations[invitation.id] ?? DEFAULT_DURATION_SECONDS
    setBusyId(`${invitation.id}:extend`)
    setError('')
    setNotice('')
    try {
      await apiFetch(`${API}/admin/invitations/${encodeURIComponent(invitation.id)}`, {
        method: 'PATCH',
        body: { duration_seconds: Number(selectedDuration) },
      })
      setNotice(`Access extended for ${invitation.guest_name}.`)
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
    active: invitations.filter((item) => item.status === 'active').length,
    expired: invitations.filter((item) => item.status === 'expired').length,
    revoked: invitations.filter((item) => item.status === 'revoked').length,
  }), [invitations])

  return (
    <div className="page-stack administration-page">
      <div className="page-heading">
        <div className="page-title-icon"><ShieldIcon size={22} /></div>
        <div>
          <h2>Administration</h2>
          <p>Generate temporary Viewer links and review access activity.</p>
        </div>
      </div>

      {error ? <div className="global-inline-message error-inline">{error}</div> : null}
      {notice ? <div className="global-inline-message success-inline">{notice}</div> : null}

      <section className="admin-summary-grid">
        <AdminSummary icon={<AccessUsersIcon size={20} />} label="Access records" value={invitations.length} />
        <AdminSummary icon={<AccessLinkIcon size={20} />} label="Active" value={counts.active} tone="positive" />
        <AdminSummary icon={<ClockIcon size={20} />} label="Expired" value={counts.expired} />
        <AdminSummary icon={<AccessLockIcon size={20} />} label="Revoked" value={counts.revoked} tone="negative" />
      </section>

      <section className="panel admin-create-panel">
        <div className="panel-heading">
          <div>
            <span className="panel-kicker">VIEWER ACCESS</span>
            <h2>Generate access link</h2>
          </div>
          <span className="admin-readonly-badge"><EyeIcon size={14} /> Viewer · read only</span>
        </div>

        <form className="admin-invite-form" onSubmit={createInvitation}>
          <label>
            <span>Guest name</span>
            <input
              value={form.guest_name}
              onChange={(event) => setForm({ ...form, guest_name: event.target.value })}
              maxLength={120}
              required
            />
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
          <button
            type="submit"
            className="admin-primary-button"
            disabled={busyId === 'create' || !form.duration_seconds}
          >
            <AccessLinkIcon size={17} />
            {busyId === 'create' ? 'Generating…' : 'Generate access link'}
          </button>
        </form>
      </section>

      <section className="panel status-table-panel">
        <div className="panel-heading">
          <div>
            <span className="panel-kicker">ACCESS CONTROL</span>
            <h2>Temporary access</h2>
          </div>
        </div>

        {loading ? (
          <div className="admin-loading"><span className="loading-ring" />Loading administration…</div>
        ) : (
          <div className="table-scroll">
            <table className="market-table admin-table">
              <thead>
                <tr>
                  <th>Guest</th>
                  <th>Role</th>
                  <th>Status</th>
                  <th>Expires</th>
                  <th>Last access</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {invitations.length === 0 ? (
                  <tr><td colSpan="6" className="empty-table-cell">No access links generated.</td></tr>
                ) : invitations.map((item) => (
                  <tr key={item.id}>
                    <td><strong>{item.guest_name}</strong></td>
                    <td>{roleLabel(item.role)}</td>
                    <td>
                      <span className={`admin-status ${statusClass(item.status)}`}>
                        {item.status.replaceAll('_', ' ')}
                      </span>
                    </td>
                    <td>{dateTime(item.expires_at)}</td>
                    <td>{dateTime(item.last_access_at)}</td>
                    <td>
                      <div className="admin-row-actions">
                        <button
                          type="button"
                          title="Rotate the token, set a new duration and show a new one-time access link."
                          onClick={() => regenerateAccessLink(item)}
                          disabled={Boolean(busyId) || item.status === 'revoked'}
                        >
                          Generate new link
                        </button>
                        <select
                          value={extendDurations[item.id] ?? DEFAULT_DURATION_SECONDS}
                          onChange={(event) => setExtendDurations({
                            ...extendDurations,
                            [item.id]: event.target.value,
                          })}
                          disabled={item.status === 'revoked'}
                          aria-label={`Duration for ${item.guest_name}`}
                        >
                          {DURATION_OPTIONS.map(([value, label]) => (
                            <option key={value} value={value}>+{label}</option>
                          ))}
                        </select>
                        <button
                          type="button"
                          onClick={() => extendInvitation(item)}
                          disabled={Boolean(busyId) || item.status === 'revoked'}
                        >
                          Extend
                        </button>
                        <button
                          type="button"
                          onClick={() => runAction(
                            item.id,
                            'terminate-sessions',
                            `Viewer sessions terminated for ${item.guest_name}.`,
                          )}
                          disabled={Boolean(busyId)}
                        >
                          End sessions
                        </button>
                        <button
                          type="button"
                          className="danger"
                          onClick={() => runAction(
                            item.id,
                            'revoke',
                            `Access revoked for ${item.guest_name}.`,
                          )}
                          disabled={Boolean(busyId) || item.status === 'revoked'}
                        >
                          Revoke
                        </button>
                        <button
                          type="button"
                          className="danger ghost"
                          onClick={() => deleteInvitation(item)}
                          disabled={Boolean(busyId) || item.status === 'active'}
                        >
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
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
                <th>Guest</th>
                <th>Role</th>
                <th>Result</th>
                <th>Client</th>
              </tr>
            </thead>
            <tbody>
              {logs.length === 0 ? (
                <tr><td colSpan="6" className="empty-table-cell">No access events recorded.</td></tr>
              ) : logs.map((item) => (
                <tr key={item.id}>
                  <td>{dateTime(item.created_at)}</td>
                  <td>{item.event.replaceAll('_', ' ')}</td>
                  <td>{item.guest_name || '—'}</td>
                  <td>{item.role ? roleLabel(item.role) : '—'}</td>
                  <td className={item.success ? 'positive' : 'negative'}>
                    {item.success ? 'Success' : 'Denied'}
                  </td>
                  <td>{item.client_ip}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {generatedAccess ? (
        <AccessLinkDialog
          access={generatedAccess}
          onClose={() => setGeneratedAccess(null)}
          onError={(message) => setError(message)}
        />
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
      <section
        className="access-link-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="access-link-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="access-link-dialog-heading">
          <div>
            <span className="panel-kicker">ONE-TIME DISPLAY</span>
            <h2 id="access-link-title">Access link for {access.guest_name}</h2>
          </div>
          <button type="button" className="access-link-close" onClick={onClose} aria-label="Close">×</button>
        </div>
        <p>
          Copy this link now and share it directly with the guest. The raw token is not stored and this link cannot be recovered after closing this window.
        </p>
        <textarea readOnly value={access.access_url} rows="4" aria-label="Generated access link" />
        <div className="access-link-expiration">Expires: <strong>{dateTime(access.expires_at)}</strong></div>
        <div className="access-link-dialog-actions">
          <button type="button" className="admin-primary-button" onClick={copyLink}>
            <AccessLinkIcon size={17} />{copied ? 'Link copied' : 'Copy access link'}
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
