import { useCallback, useEffect, useState } from 'react'

import { ApiError, apiFetch } from '../api/http'
import { API } from '../config/env'
import { tr } from '../i18n/runtime'
import { AccessLinkIcon, AccessLockIcon, AccessUsersIcon, ClockIcon, EyeIcon } from '../shared/components/Icons'
import { DEFAULT_DURATION_SECONDS, DURATION_OPTIONS, SESSION_OPTIONS } from './administration/adminConfig'
import { copyText, dateTime } from './administration/adminUtils'

function statusLabel(status) {
  const value = String(status || '').toLowerCase()
  if (value === 'active') return tr('Active')
  if (value === 'expired') return tr('Expired')
  if (value === 'revoked') return tr('Revoked')
  return tr('Unknown')
}

function SecretPanel({ access, onClose, onError }) {
  const [copied, setCopied] = useState('')
  if (!access) return null

  async function copy(value, key) {
    try {
      await copyText(value)
      setCopied(key)
      onError('')
    } catch (error) {
      setCopied('')
      onError(tr(error?.message || 'Unable to copy access data.'))
    }
  }

  return <section className="admin-workspace-section admin-access-section">
    <div className="admin-section-heading">
      <div>
        <span className="panel-kicker">{tr('TEMPORARY REVIEWER ACCESS')}</span>
        <h2>{tr('Access generated for {name}', { name: access.guest_name })}</h2>
      </div>
      <span className="admin-readonly-badge"><EyeIcon size={14} /> {tr('Read-only')}</span>
    </div>
    <div className="verified-access-details reviewer-access-secret-grid">
      <div><dt>{tr('Access link')}</dt><dd>{access.access_url}</dd></div>
      <div><dt>{tr('Access code')}</dt><dd><strong>{access.access_code}</strong></dd></div>
      <div><dt>{tr('Expires')}</dt><dd>{dateTime(access.expires_at)}</dd></div>
      <div><dt>{tr('Maximum active sessions')}</dt><dd>{access.max_active_sessions}</dd></div>
    </div>
    <p>{tr('Share the link and access code with the reviewer. The code is shown only when generated or regenerated.')}</p>
    <div className="admin-row-actions identity-row-actions">
      <button type="button" onClick={() => copy(access.access_url, 'link')}>{tr(copied === 'link' ? 'Link copied' : 'Copy link')}</button>
      <button type="button" onClick={() => copy(access.access_code, 'code')}>{tr(copied === 'code' ? 'Code copied' : 'Copy code')}</button>
      <button type="button" onClick={onClose}>{tr('Close')}</button>
    </div>
  </section>
}

export function ReviewerAccessPage({ onSessionExpired }) {
  const [records, setRecords] = useState([])
  const [form, setForm] = useState({ guest_name: '', duration_seconds: DEFAULT_DURATION_SECONDS, max_active_sessions: 2 })
  const [generated, setGenerated] = useState(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState('')
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  const handleError = useCallback((requestError) => {
    if (requestError instanceof ApiError && requestError.status === 401) {
      onSessionExpired?.()
      return
    }
    setError(tr(requestError?.message || 'Unable to update reviewer access.'))
  }, [onSessionExpired])

  const loadRecords = useCallback(async () => {
    setLoading(true)
    try {
      const value = await apiFetch(`${API}/admin/reviewer-access`)
      setRecords(value?.items || [])
      setError('')
    } catch (requestError) {
      handleError(requestError)
    } finally {
      setLoading(false)
    }
  }, [handleError])

  useEffect(() => { loadRecords() }, [loadRecords])

  async function createAccess(event) {
    event.preventDefault()
    setBusy('create')
    setError('')
    setNotice('')
    try {
      const value = await apiFetch(`${API}/admin/reviewer-access`, {
        method: 'POST',
        body: {
          guest_name: form.guest_name.trim(),
          duration_seconds: Number(form.duration_seconds),
          max_active_sessions: Number(form.max_active_sessions),
        },
      })
      setGenerated(value)
      setForm({ guest_name: '', duration_seconds: DEFAULT_DURATION_SECONDS, max_active_sessions: 2 })
      setNotice(tr('Temporary reviewer access generated.'))
      await loadRecords()
    } catch (requestError) {
      handleError(requestError)
    } finally {
      setBusy('')
    }
  }

  async function regenerate(record) {
    setBusy(`${record.id}:regenerate`)
    setError('')
    setNotice('')
    try {
      const value = await apiFetch(`${API}/admin/reviewer-access/${encodeURIComponent(record.id)}/regenerate`, {
        method: 'POST',
        body: { duration_seconds: Number(DEFAULT_DURATION_SECONDS) },
      })
      setGenerated(value)
      setNotice(tr('A new reviewer access code was generated and previous sessions were ended.'))
      await loadRecords()
    } catch (requestError) {
      handleError(requestError)
    } finally {
      setBusy('')
    }
  }

  async function action(record, name, message) {
    setBusy(`${record.id}:${name}`)
    setError('')
    setNotice('')
    try {
      await apiFetch(`${API}/admin/reviewer-access/${encodeURIComponent(record.id)}/${name}`, { method: 'POST' })
      setNotice(tr(message, { name: record.guest_name }))
      await loadRecords()
    } catch (requestError) {
      handleError(requestError)
    } finally {
      setBusy('')
    }
  }

  async function deleteRecord(record) {
    if (!window.confirm(tr('Delete reviewer access for {name}?', { name: record.guest_name }))) return
    setBusy(`${record.id}:delete`)
    setError('')
    try {
      await apiFetch(`${API}/admin/reviewer-access/${encodeURIComponent(record.id)}`, { method: 'DELETE' })
      setNotice(tr('Reviewer access deleted.'))
      await loadRecords()
    } catch (requestError) {
      handleError(requestError)
    } finally {
      setBusy('')
    }
  }

  const activeCount = records.filter((item) => item.status === 'active').length
  const expiredCount = records.filter((item) => item.status === 'expired').length
  const revokedCount = records.filter((item) => item.status === 'revoked').length

  return <section className="page-stack administration-page administration-single-workspace">
    <section className="data-panel administration-workspace-panel">
      <header className="administration-workspace-header">
        <div className="administration-workspace-title">
          <div className="page-title-icon"><AccessUsersIcon size={22} /></div>
          <div><h2>{tr('Guest Access')}</h2></div>
        </div>
        <button type="button" className="secondary-button compact" onClick={loadRecords} disabled={loading || Boolean(busy)}>{tr('Refresh')}</button>
      </header>

      {error ? <div className="global-inline-message error-inline administration-workspace-message">{error}</div> : null}
      {notice ? <div className="global-inline-message success-inline administration-workspace-message">{notice}</div> : null}

      <section className="admin-workspace-metrics">
        <article className="admin-summary-card"><div className="admin-summary-icon"><AccessUsersIcon size={19} /></div><div><span>{tr('Reviewer access')}</span><strong>{records.length}</strong></div></article>
        <article className="admin-summary-card positive"><div className="admin-summary-icon positive"><AccessLinkIcon size={19} /></div><div><span>{tr('Active')}</span><strong>{activeCount}</strong></div></article>
        <article className="admin-summary-card"><div className="admin-summary-icon"><ClockIcon size={19} /></div><div><span>{tr('Expired')}</span><strong>{expiredCount}</strong></div></article>
        <article className="admin-summary-card negative"><div className="admin-summary-icon negative"><AccessLockIcon size={19} /></div><div><span>{tr('Revoked')}</span><strong>{revokedCount}</strong></div></article>
      </section>

      <section className="admin-workspace-section admin-create-section">
        <div className="admin-section-heading">
          <div><span className="panel-kicker">{tr('READ-ONLY REVIEWER')}</span><h2>{tr('Generate temporary access')}</h2></div>
          <span className="admin-readonly-badge"><EyeIcon size={14} /> {tr('View + export only')}</span>
        </div>
        <form className="admin-invite-form identity-invite-form admin-workspace-invite-form" onSubmit={createAccess}>
          <label><span>{tr('Reviewer name')}</span><input value={form.guest_name} onChange={(event) => setForm({ ...form, guest_name: event.target.value })} maxLength={120} required /></label>
          <label><span>{tr('Access duration')}</span><select value={form.duration_seconds} onChange={(event) => setForm({ ...form, duration_seconds: event.target.value })}>{DURATION_OPTIONS.map(([value, label]) => <option key={value} value={value}>{tr(label)}</option>)}</select></label>
          <label><span>{tr('Maximum active sessions')}</span><select value={form.max_active_sessions} onChange={(event) => setForm({ ...form, max_active_sessions: Number(event.target.value) })}>{SESSION_OPTIONS.map((value) => <option key={value} value={value}>{value}</option>)}</select></label>
          <button type="submit" className="admin-primary-button" disabled={busy === 'create'}><AccessLinkIcon size={17} />{tr(busy === 'create' ? 'Generating…' : 'Generate access')}</button>
        </form>
        <p className="verified-access-note">{tr('This profile can view Dashboard, Strategy Research, Backtest and Asset Discovery, and export available data. Execution, stop, promotion and strategy mutation actions are not granted by the backend.')}</p>
      </section>

      <SecretPanel access={generated} onClose={() => setGenerated(null)} onError={setError} />

      <section className="admin-workspace-section admin-access-section">
        <div className="admin-section-heading"><div><span className="panel-kicker">{tr('ACCESS CONTROL')}</span><h2>{tr('Reviewer access records')}</h2></div></div>
        {loading ? <div className="admin-loading"><span className="loading-ring" />{tr('Loading reviewer access…')}</div> : (
          <div className="admin-workspace-table-wrap">
            <table className="market-table admin-table identity-admin-table">
              <thead><tr><th>{tr('Reviewer')}</th><th>{tr('Status')}</th><th>{tr('Sessions')}</th><th>{tr('Expires')}</th><th>{tr('Last access')}</th><th>{tr('Actions')}</th></tr></thead>
              <tbody>
                {records.length === 0 ? <tr><td colSpan="6" className="empty-table-cell">{tr('No reviewer access records.')}</td></tr> : records.map((record) => <tr key={record.id}>
                  <td><strong>{record.guest_name}</strong><small className="admin-identity-email">{tr('Read-only reviewer')}</small></td>
                  <td><span className={`admin-status ${record.status === 'active' ? 'positive' : 'negative'}`}>{statusLabel(record.status)}</span></td>
                  <td><strong>{record.active_sessions || 0}</strong> / {record.max_active_sessions}</td>
                  <td>{dateTime(record.expires_at)}</td>
                  <td>{dateTime(record.last_access_at)}</td>
                  <td><div className="admin-row-actions identity-row-actions">
                    <button type="button" onClick={() => regenerate(record)} disabled={Boolean(busy) || record.status === 'revoked'}>{tr('New code')}</button>
                    <button type="button" onClick={() => action(record, 'terminate-sessions', 'Sessions terminated for {name}.')} disabled={Boolean(busy) || !record.active_sessions}>{tr('End sessions')}</button>
                    <button type="button" className="danger" onClick={() => action(record, 'revoke', 'Access revoked for {name}.')} disabled={Boolean(busy) || record.status !== 'active'}>{tr('Revoke')}</button>
                    <button type="button" className="danger ghost" onClick={() => deleteRecord(record)} disabled={Boolean(busy) || record.status === 'active'}>{tr('Delete')}</button>
                  </div></td>
                </tr>)}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </section>
  </section>
}
