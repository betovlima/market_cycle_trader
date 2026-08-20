import { tr } from '../i18n/runtime'
import { useCallback, useEffect, useMemo, useState } from 'react'

import { ApiError, apiFetch } from '../api/http'
import { API } from '../config/env'
import { DEFAULT_DURATION_SECONDS, INVITATION_PAGE_SIZE, LOG_PAGE_SIZE } from './administration/adminConfig'
import { boundedPage, defaultSessions, roleLabel, sortedRows, statusLabel } from './administration/adminUtils'
import { AdministrationView } from './administration/components/AdministrationView'

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
    setError(tr(requestError.message || 'Unable to update access control.'))
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
      setError(tr('Select an access duration.'))
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
      setNotice(tr('Identity-verified access link generated for {name}.', { name: created.guest_name }))
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
      setNotice(tr(message))
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
      setNotice(tr('A new identity claim link was generated for {name}. Existing sessions were ended.', { name: invitation.guest_name }))
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
      setNotice(tr(message))
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
      tr('Access extended for {name}.', { name: invitation.guest_name }),
      'extend',
    )
    setExtendDurations((current) => ({ ...current, [invitation.id]: DEFAULT_DURATION_SECONDS }))
  }

  async function saveSessionLimit(invitation) {
    const limit = Number(sessionLimits[invitation.id] || invitation.max_active_sessions || 1)
    await updateInvitation(
      invitation,
      { max_active_sessions: limit },
      tr('Session limit updated for {name}.', { name: invitation.guest_name }),
      'session-limit',
    )
  }

  async function deleteInvitation(invitation) {
    if (!window.confirm(tr('Delete the access record for {name}?', { name: invitation.guest_name }))) return

    setBusyId(`${invitation.id}:delete`)
    setError('')
    setNotice('')
    try {
      await apiFetch(`${API}/admin/invitations/${encodeURIComponent(invitation.id)}`, {
        method: 'DELETE',
      })
      setNotice(tr('Access record deleted for {name}.', { name: invitation.guest_name }))
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

    const workspace = {
    busyId,
    counts,
    createInvitation,
    currentInvitationPage,
    currentLogPage,
    dataView,
    deleteInvitation,
    error,
    extendDurations,
    extendInvitation,
    filteredInvitations,
    filteredLogs,
    form,
    generatedAccess,
    invitationPages,
    invitationQuery,
    invitationRole,
    invitationSort,
    invitationStatus,
    invitations,
    loadData,
    loading,
    logPages,
    logQuery,
    logResult,
    logRole,
    logSort,
    logs,
    notice,
    regenerateAccessLink,
    runAction,
    saveSessionLimit,
    sessionLimits,
    setDataView,
    setError,
    setExtendDurations,
    setForm,
    setGeneratedAccess,
    setInvitationPage,
    setInvitationQuery,
    setInvitationRole,
    setInvitationSort,
    setInvitationStatus,
    setLogPage,
    setLogQuery,
    setLogResult,
    setLogRole,
    setLogSort,
    setSessionLimits,
    visibleInvitations,
    visibleLogs
  }

  return <AdministrationView workspace={workspace} />
}
