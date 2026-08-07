import { useCallback, useEffect, useMemo, useState } from 'react'

import { ApiError, apiFetch } from '../api/http'
import { API } from '../config/env'
import {
  AccessLinkIcon,
  AccessLockIcon,
  AccessUsersIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  ClockIcon,
  EyeIcon,
  ListFilterIcon,
  SearchIcon,
  ShieldIcon,
  SortIcon,
} from '../shared/components/Icons'
import { ParameterHint } from '../shared/components/ParameterHint'

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
const INVITATION_PAGE_SIZE = 8
const LOG_PAGE_SIZE = 12

const ADMIN_HINTS = {
  accessRecords: 'Total number of access records currently returned by Administration, including active, pending, expired and restricted records.',
  pending: 'Invitations that were generated but have not yet completed the required Google identity verification.',
  active: 'Access records that have been claimed successfully or are currently active for the verified Google identity.',
  restricted: 'Records that are expired, revoked, blocked or still use the legacy unverified access model.',
  guestName: 'Friendly name used by the Administrator to identify the person receiving this access invitation.',
  authorizedEmail: 'Google account that is authorized to claim the generated invitation. A different Google identity cannot claim it.',
  role: 'Permission profile granted after identity verification. Viewer is limited to backtests, Trader also receives Portfolio access, and Administrator receives full administration access.',
  duration: 'How long the generated access authorization remains valid before it expires.',
  sessions: 'Maximum number of simultaneously active authenticated sessions allowed for this access record.',
  status: 'Current lifecycle state of the invitation or identity-bound access record.',
  claimedIdentity: 'Google identity that successfully claimed the invitation. It remains bound to the access record after verification.',
  expires: 'Date and time when this access authorization stops being valid unless it is extended.',
  lastAccess: 'Most recent recorded successful use of this access record.',
  auditTime: 'Timestamp when the audited access event was recorded by the API.',
  auditEvent: 'Access-control event recorded by the API, such as claim, grant, login, denial, session replacement or administrative update.',
  auditUser: 'Friendly user name associated with the audited access event when available.',
  auditIdentity: 'Verified Google identity associated with the access event when available.',
  auditRole: 'Permission profile associated with the access event.',
  auditResult: 'Whether the access-control event completed successfully or was denied.',
  auditClient: 'Client IP address recorded for the access-control event.',
}

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

function compareValues(left, right) {
  if (left == null && right == null) return 0
  if (left == null) return -1
  if (right == null) return 1
  const leftNumber = Number(left)
  const rightNumber = Number(right)
  if (Number.isFinite(leftNumber) && Number.isFinite(rightNumber)) return leftNumber - rightNumber
  return String(left).localeCompare(String(right), undefined, { numeric: true, sensitivity: 'base' })
}

function sortedRows(rows, sort, valueGetter = null) {
  const multiplier = sort.direction === 'asc' ? 1 : -1
  return [...rows].sort((left, right) => {
    const leftValue = valueGetter ? valueGetter(left, sort.key) : left?.[sort.key]
    const rightValue = valueGetter ? valueGetter(right, sort.key) : right?.[sort.key]
    return compareValues(leftValue, rightValue) * multiplier
  })
}

function toggledSort(current, key) {
  if (current.key === key) return { key, direction: current.direction === 'asc' ? 'desc' : 'asc' }
  return { key, direction: 'asc' }
}

function boundedPage(page, total, pageSize) {
  const pages = Math.max(1, Math.ceil(total / pageSize))
  return Math.min(Math.max(1, page), pages)
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
  const [dataView, setDataView] = useState('invitations')
  const [invitationQuery, setInvitationQuery] = useState('')
  const [invitationRole, setInvitationRole] = useState('all')
  const [invitationStatus, setInvitationStatus] = useState('all')
  const [invitationSort, setInvitationSort] = useState({ key: 'guest_name', direction: 'asc' })
  const [invitationPage, setInvitationPage] = useState(1)
  const [logQuery, setLogQuery] = useState('')
  const [logRole, setLogRole] = useState('all')
  const [logResult, setLogResult] = useState('all')
  const [logSort, setLogSort] = useState({ key: 'created_at', direction: 'desc' })
  const [logPage, setLogPage] = useState(1)

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

  const filteredInvitations = useMemo(() => {
    const query = invitationQuery.trim().toLowerCase()
    const rows = invitations.filter((item) => {
      const roleMatch = invitationRole === 'all' || item.role === invitationRole
      const statusMatch = invitationStatus === 'all'
        || (invitationStatus === 'active' && ['active', 'claimed'].includes(item.status))
        || (invitationStatus === 'pending' && item.status === 'pending_verification')
        || (invitationStatus === 'expired' && item.status === 'expired')
        || (invitationStatus === 'restricted' && ['revoked', 'legacy_unverified', 'blocked'].includes(item.status))
      const queryMatch = !query || [
        item.guest_name,
        item.authorized_email,
        item.claimed_email,
        roleLabel(item.role),
        statusLabel(item.status),
      ].some((value) => String(value || '').toLowerCase().includes(query))
      return roleMatch && statusMatch && queryMatch
    })
    return sortedRows(rows, invitationSort, (item, key) => {
      if (key === 'role') return roleLabel(item.role)
      if (key === 'status') return statusLabel(item.status)
      if (key === 'sessions') return Number(item.active_sessions || 0)
      if (key === 'claimed_identity') return item.claimed_email || ''
      if (key === 'expires_at') return item.expires_at ? new Date(item.expires_at).getTime() : null
      if (key === 'last_access_at') return item.last_access_at ? new Date(item.last_access_at).getTime() : null
      return item?.[key]
    })
  }, [invitations, invitationQuery, invitationRole, invitationStatus, invitationSort])

  const invitationPages = Math.max(1, Math.ceil(filteredInvitations.length / INVITATION_PAGE_SIZE))
  const currentInvitationPage = boundedPage(invitationPage, filteredInvitations.length, INVITATION_PAGE_SIZE)
  const visibleInvitations = filteredInvitations.slice((currentInvitationPage - 1) * INVITATION_PAGE_SIZE, currentInvitationPage * INVITATION_PAGE_SIZE)

  const filteredLogs = useMemo(() => {
    const query = logQuery.trim().toLowerCase()
    const rows = logs.filter((item) => {
      const roleMatch = logRole === 'all' || item.role === logRole
      const resultMatch = logResult === 'all' || (logResult === 'success' ? Boolean(item.success) : !item.success)
      const queryMatch = !query || [
        item.event,
        item.guest_name,
        item.identity_email,
        item.client_ip,
        item.role,
      ].some((value) => String(value || '').replaceAll('_', ' ').toLowerCase().includes(query))
      return roleMatch && resultMatch && queryMatch
    })
    return sortedRows(rows, logSort, (item, key) => {
      if (key === 'created_at') return item.created_at ? new Date(item.created_at).getTime() : null
      if (key === 'event') return String(item.event || '').replaceAll('_', ' ')
      if (key === 'role') return item.role ? roleLabel(item.role) : ''
      if (key === 'success') return item.success ? 1 : 0
      return item?.[key]
    })
  }, [logs, logQuery, logRole, logResult, logSort])

  const logPages = Math.max(1, Math.ceil(filteredLogs.length / LOG_PAGE_SIZE))
  const currentLogPage = boundedPage(logPage, filteredLogs.length, LOG_PAGE_SIZE)
  const visibleLogs = filteredLogs.slice((currentLogPage - 1) * LOG_PAGE_SIZE, currentLogPage * LOG_PAGE_SIZE)

  useEffect(() => {
    setInvitationPage(1)
  }, [invitationQuery, invitationRole, invitationStatus])

  useEffect(() => {
    setLogPage(1)
  }, [logQuery, logRole, logResult])

  return (
    <section className="page-stack administration-page administration-single-workspace">
      <section className="data-panel administration-workspace-panel">
        <header className="administration-workspace-header">
          <div className="administration-workspace-title">
            <div className="page-title-icon"><ShieldIcon size={22} /></div>
            <div>
              <h2>Administration</h2>
              <p>Generate identity-bound access, manage active records and inspect audited access activity.</p>
            </div>
          </div>
          <div className="administration-workspace-actions">
            <span>{invitations.length} access record{invitations.length === 1 ? '' : 's'}</span>
            <button type="button" className="secondary-button compact admin-refresh-button" onClick={loadData} disabled={loading || Boolean(busyId)}>Refresh</button>
          </div>
        </header>

        {error ? <div className="global-inline-message error-inline administration-workspace-message">{error}</div> : null}
        {notice ? <div className="global-inline-message success-inline administration-workspace-message">{notice}</div> : null}

        <section className="admin-workspace-metrics" aria-label="Access summary">
          <AdminSummary icon={<AccessUsersIcon size={19} />} label="Access records" value={invitations.length} hint={ADMIN_HINTS.accessRecords} />
          <AdminSummary icon={<AccessLinkIcon size={19} />} label="Pending" value={counts.pending} hint={ADMIN_HINTS.pending} />
          <AdminSummary icon={<ClockIcon size={19} />} label="Claimed / Active" value={counts.active} tone="positive" hint={ADMIN_HINTS.active} />
          <AdminSummary icon={<AccessLockIcon size={19} />} label="Expired / Restricted" value={counts.expired + counts.restricted} tone="negative" hint={ADMIN_HINTS.restricted} />
        </section>

        <section className="admin-workspace-section admin-create-section">
          <div className="admin-section-heading">
            <div>
              <span className="panel-kicker">IDENTITY-VERIFIED ACCESS</span>
              <h2>Generate access invitation</h2>
              <p>Create one Google-identity-bound invitation without exposing any application strategy details.</p>
            </div>
            <span className="admin-readonly-badge"><EyeIcon size={14} /> Google account required</span>
          </div>

          <form className="admin-invite-form identity-invite-form admin-workspace-invite-form" onSubmit={createInvitation}>
            <label>
              <AdminFieldLabel id="admin-hint-user-name" label="User name" hint={ADMIN_HINTS.guestName} />
              <input
                value={form.guest_name}
                onChange={(event) => setForm({ ...form, guest_name: event.target.value })}
                maxLength={120}
                required
              />
            </label>
            <label>
              <AdminFieldLabel id="admin-hint-authorized-email" label="Authorized Google email" hint={ADMIN_HINTS.authorizedEmail} />
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
              <AdminFieldLabel id="admin-hint-role" label="Role" hint={ADMIN_HINTS.role} />
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
              <AdminFieldLabel id="admin-hint-access-duration" label="Access duration" hint={ADMIN_HINTS.duration} />
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
              <AdminFieldLabel id="admin-hint-maximum-sessions" label="Maximum active sessions" hint={ADMIN_HINTS.sessions} />
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

        <section className="admin-workspace-section admin-access-section">
          <div className="admin-section-heading admin-access-heading">
            <div>
              <span className="panel-kicker">ACCESS CONTROL & AUDIT</span>
              <h2>Access records</h2>
              <p>Filter, sort and review identity-bound access records or the corresponding audit history.</p>
            </div>
            <div className="admin-data-tabs" role="tablist" aria-label="Administration data view">
              <button type="button" role="tab" aria-selected={dataView === 'invitations'} className={dataView === 'invitations' ? 'active' : ''} onClick={() => setDataView('invitations')}>Invitations <span>{invitations.length}</span></button>
              <button type="button" role="tab" aria-selected={dataView === 'audit'} className={dataView === 'audit' ? 'active' : ''} onClick={() => setDataView('audit')}>Audit history <span>{logs.length}</span></button>
            </div>
          </div>

          {loading ? (
            <div className="admin-loading"><span className="loading-ring" />Loading administration…</div>
          ) : dataView === 'invitations' ? (
            <>
              <AdminListToolbar
                query={invitationQuery}
                onQueryChange={setInvitationQuery}
                placeholder="Search user or Google identity"
                count={filteredInvitations.length}
              >
                <select value={invitationStatus} onChange={(event) => setInvitationStatus(event.target.value)} aria-label="Filter invitation status">
                  <option value="all">All statuses</option>
                  <option value="active">Claimed / Active</option>
                  <option value="pending">Pending</option>
                  <option value="expired">Expired</option>
                  <option value="restricted">Restricted</option>
                </select>
                <select value={invitationRole} onChange={(event) => setInvitationRole(event.target.value)} aria-label="Filter invitation role">
                  <option value="all">All roles</option>
                  <option value="viewer">Viewer</option>
                  <option value="trader">Trader</option>
                  <option value="admin">Administrator</option>
                </select>
              </AdminListToolbar>

              <div className="admin-workspace-table-wrap">
                <table className="market-table admin-table identity-admin-table admin-sortable-table">
                  <thead>
                    <tr>
                      <AdminSortableTh label="User" field="guest_name" sort={invitationSort} onSort={(key) => setInvitationSort((current) => toggledSort(current, key))} hint={ADMIN_HINTS.guestName} />
                      <AdminSortableTh label="Role" field="role" sort={invitationSort} onSort={(key) => setInvitationSort((current) => toggledSort(current, key))} hint={ADMIN_HINTS.role} />
                      <AdminSortableTh label="Status" field="status" sort={invitationSort} onSort={(key) => setInvitationSort((current) => toggledSort(current, key))} hint={ADMIN_HINTS.status} />
                      <AdminSortableTh label="Sessions" field="sessions" sort={invitationSort} onSort={(key) => setInvitationSort((current) => toggledSort(current, key))} hint={ADMIN_HINTS.sessions} />
                      <AdminSortableTh label="Claimed identity" field="claimed_identity" sort={invitationSort} onSort={(key) => setInvitationSort((current) => toggledSort(current, key))} hint={ADMIN_HINTS.claimedIdentity} />
                      <AdminSortableTh label="Expires" field="expires_at" sort={invitationSort} onSort={(key) => setInvitationSort((current) => toggledSort(current, key))} hint={ADMIN_HINTS.expires} />
                      <AdminSortableTh label="Last access" field="last_access_at" sort={invitationSort} onSort={(key) => setInvitationSort((current) => toggledSort(current, key))} hint={ADMIN_HINTS.lastAccess} />
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {visibleInvitations.length === 0 ? (
                      <tr><td colSpan="8" className="empty-table-cell">No access records match the selected filters.</td></tr>
                    ) : visibleInvitations.map((item) => {
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
              <AdminPagination page={currentInvitationPage} pages={invitationPages} total={filteredInvitations.length} pageSize={INVITATION_PAGE_SIZE} onPageChange={setInvitationPage} />
            </>
          ) : (
            <>
              <AdminListToolbar
                query={logQuery}
                onQueryChange={setLogQuery}
                placeholder="Search event, user, identity or client"
                count={filteredLogs.length}
              >
                <div className="admin-result-filters" aria-label="Audit result filter">
                  <button type="button" className={logResult === 'all' ? 'active' : ''} onClick={() => setLogResult('all')} title="Show all audit results"><ListFilterIcon size={15} /> All</button>
                  <button type="button" className={`positive ${logResult === 'success' ? 'active' : ''}`} onClick={() => setLogResult('success')}>Success</button>
                  <button type="button" className={`negative ${logResult === 'denied' ? 'active' : ''}`} onClick={() => setLogResult('denied')}>Denied</button>
                </div>
                <select value={logRole} onChange={(event) => setLogRole(event.target.value)} aria-label="Filter audit role">
                  <option value="all">All roles</option>
                  <option value="viewer">Viewer</option>
                  <option value="trader">Trader</option>
                  <option value="admin">Administrator</option>
                </select>
              </AdminListToolbar>

              <div className="admin-workspace-table-wrap">
                <table className="market-table access-log-table admin-sortable-table">
                  <thead>
                    <tr>
                      <AdminSortableTh label="Time" field="created_at" sort={logSort} onSort={(key) => setLogSort((current) => toggledSort(current, key))} hint={ADMIN_HINTS.auditTime} />
                      <AdminSortableTh label="Event" field="event" sort={logSort} onSort={(key) => setLogSort((current) => toggledSort(current, key))} hint={ADMIN_HINTS.auditEvent} />
                      <AdminSortableTh label="User" field="guest_name" sort={logSort} onSort={(key) => setLogSort((current) => toggledSort(current, key))} hint={ADMIN_HINTS.auditUser} />
                      <AdminSortableTh label="Google identity" field="identity_email" sort={logSort} onSort={(key) => setLogSort((current) => toggledSort(current, key))} hint={ADMIN_HINTS.auditIdentity} />
                      <AdminSortableTh label="Role" field="role" sort={logSort} onSort={(key) => setLogSort((current) => toggledSort(current, key))} hint={ADMIN_HINTS.auditRole} />
                      <AdminSortableTh label="Result" field="success" sort={logSort} onSort={(key) => setLogSort((current) => toggledSort(current, key))} hint={ADMIN_HINTS.auditResult} />
                      <AdminSortableTh label="Client" field="client_ip" sort={logSort} onSort={(key) => setLogSort((current) => toggledSort(current, key))} hint={ADMIN_HINTS.auditClient} />
                    </tr>
                  </thead>
                  <tbody>
                    {visibleLogs.length === 0 ? (
                      <tr><td colSpan="7" className="empty-table-cell">No access events match the selected filters.</td></tr>
                    ) : visibleLogs.map((item) => (
                      <tr key={item.id}>
                        <td>{dateTime(item.created_at)}</td>
                        <td>{String(item.event || '').replaceAll('_', ' ')}</td>
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
              <AdminPagination page={currentLogPage} pages={logPages} total={filteredLogs.length} pageSize={LOG_PAGE_SIZE} onPageChange={setLogPage} />
            </>
          )}
        </section>

        {generatedAccess ? (
          <AccessLinkDialog access={generatedAccess} onClose={() => setGeneratedAccess(null)} onError={setError} />
        ) : null}
      </section>
    </section>
  )
}

function AdminFieldLabel({ id, label, hint }) {
  return (
    <span className="admin-field-label">
      <span>{label}</span>
      <ParameterHint id={id} title={label} description={hint} />
    </span>
  )
}

function AdminSortableTh({ label, field, sort, onSort, hint = '' }) {
  const active = sort.key === field
  return (
    <th>
      <button type="button" className={`admin-sort-header ${active ? 'active' : ''}`} onClick={() => onSort(field)} title={`Sort by ${label}`}>
        <span>{label}</span>
        {hint ? <ParameterHint id={`admin-column-${field}`} title={label} description={hint} /> : null}
        <SortIcon size={14} descending={active ? sort.direction === 'desc' : true} />
      </button>
    </th>
  )
}

function AdminListToolbar({ query, onQueryChange, placeholder, count, children }) {
  return (
    <div className="admin-list-toolbar">
      <label className="admin-list-search">
        <SearchIcon size={15} />
        <input type="search" value={query} onChange={(event) => onQueryChange(event.target.value)} placeholder={placeholder} aria-label={placeholder} />
      </label>
      <div className="admin-list-filters">{children}</div>
      <span className="admin-list-count">{count} result{count === 1 ? '' : 's'}</span>
    </div>
  )
}

function AdminPagination({ page, pages, total, pageSize, onPageChange }) {
  const from = total ? ((page - 1) * pageSize) + 1 : 0
  const to = Math.min(page * pageSize, total)
  return (
    <div className="admin-pagination">
      <span>{total ? `${from}–${to} of ${total}` : '0 results'}</span>
      <div>
        <button type="button" onClick={() => onPageChange(page - 1)} disabled={page <= 1} aria-label="Previous page" title="Previous page"><ChevronLeftIcon size={16} /></button>
        <strong>Page {page} of {pages}</strong>
        <button type="button" onClick={() => onPageChange(page + 1)} disabled={page >= pages} aria-label="Next page" title="Next page"><ChevronRightIcon size={16} /></button>
      </div>
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

function AdminSummary({ icon, label, value, tone = '', hint = '' }) {
  const hintId = `admin-summary-${label.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`
  return (
    <article className={`admin-summary-card ${tone}`}>
      <div className={`admin-summary-icon ${tone}`}>{icon}</div>
      <div>
        <div className="admin-summary-label">
          <span>{label}</span>
          {hint ? <ParameterHint id={hintId} title={label} description={hint} /> : null}
        </div>
        <strong className={tone}>{value}</strong>
      </div>
    </article>
  )
}
