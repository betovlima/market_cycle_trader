import { tr } from '../../../i18n/runtime'
import { AccessLinkIcon, AccessLockIcon, AccessUsersIcon, ClockIcon, EyeIcon, ListFilterIcon, ShieldIcon } from '../../../shared/components/Icons'
import { ADMIN_HINTS, DEFAULT_DURATION_SECONDS, DURATION_OPTIONS, INVITATION_PAGE_SIZE, LOG_PAGE_SIZE, SESSION_OPTIONS } from '../adminConfig'
import { dateTime, defaultSessions, roleLabel, statusClass, statusLabel, toggledSort } from '../adminUtils'
import { AccessLinkDialog, AdminFieldLabel, AdminListToolbar, AdminPagination, AdminSortableTh, AdminSummary } from './AdminPrimitives'

export function AdministrationView({ workspace }) {
  const {
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
  } = workspace

  return (
    <section className="page-stack administration-page administration-single-workspace">
      <section className="data-panel administration-workspace-panel">
        <header className="administration-workspace-header">
          <div className="administration-workspace-title">
            <div className="page-title-icon"><ShieldIcon size={22} /></div>
            <div>
              <h2>{tr("Administration")}</h2>
            </div>
          </div>
          <div className="administration-workspace-actions">
            <span>{tr(invitations.length === 1 ? '{count} access record' : '{count} access records', { count: invitations.length })}</span>
            <button type="button" className="secondary-button compact admin-refresh-button" onClick={loadData} disabled={loading || Boolean(busyId)}>{tr("Refresh")}</button>
          </div>
        </header>

        {error ? <div className="global-inline-message error-inline administration-workspace-message">{error}</div> : null}
        {notice ? <div className="global-inline-message success-inline administration-workspace-message">{notice}</div> : null}

        <section className="admin-workspace-metrics" aria-label={tr("Access summary")}>
          <AdminSummary icon={<AccessUsersIcon size={19} />} label={tr("Access records")} value={invitations.length} hint={ADMIN_HINTS.accessRecords} />
          <AdminSummary icon={<AccessLinkIcon size={19} />} label={tr("Pending")} value={counts.pending} hint={ADMIN_HINTS.pending} />
          <AdminSummary icon={<ClockIcon size={19} />} label={tr("Claimed / Active")} value={counts.active} tone="positive" hint={ADMIN_HINTS.active} />
          <AdminSummary icon={<AccessLockIcon size={19} />} label={tr("Expired / Restricted")} value={counts.expired + counts.restricted} tone="negative" hint={ADMIN_HINTS.restricted} />
        </section>

        <section className="admin-workspace-section admin-create-section">
          <div className="admin-section-heading">
            <div>
              <span className="panel-kicker">{tr("IDENTITY-VERIFIED ACCESS")}</span>
              <h2>{tr("Generate access invitation")}</h2>
            </div>
            <span className="admin-readonly-badge"><EyeIcon size={14} /> {tr("Google account required")}</span>
          </div>

          <form className="admin-invite-form identity-invite-form admin-workspace-invite-form" onSubmit={createInvitation}>
            <label>
              <AdminFieldLabel id="admin-hint-user-name" label={tr("User name")} hint={ADMIN_HINTS.guestName} />
              <input
                value={form.guest_name}
                onChange={(event) => setForm({ ...form, guest_name: event.target.value })}
                maxLength={120}
                required
              />
            </label>
            <label>
              <AdminFieldLabel id="admin-hint-authorized-email" label={tr("Authorized Google email")} hint={ADMIN_HINTS.authorizedEmail} />
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
              <AdminFieldLabel id="admin-hint-role" label={tr("Role")} hint={ADMIN_HINTS.role} />
              <select
                value={form.role}
                onChange={(event) => {
                  const role = event.target.value
                  setForm({ ...form, role, max_active_sessions: defaultSessions(role) })
                }}
                required
              >
                <option value="viewer">{tr("Viewer")}</option>
                <option value="trader">{tr("Trader")}</option>
                <option value="admin">{tr("Administrator")}</option>
              </select>
            </label>
            <label>
              <AdminFieldLabel id="admin-hint-access-duration" label={tr("Access duration")} hint={ADMIN_HINTS.duration} />
              <select
                value={form.duration_seconds}
                onChange={(event) => setForm({ ...form, duration_seconds: event.target.value })}
                required
              >
                {DURATION_OPTIONS.map(([value, label]) => (
                  <option key={value} value={value}>{tr(label)}</option>
                ))}
              </select>
            </label>
            <label>
              <AdminFieldLabel id="admin-hint-maximum-sessions" label={tr("Maximum active sessions")} hint={ADMIN_HINTS.sessions} />
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
              {tr(busyId === 'create' ? 'Generating…' : 'Generate verified link')}
            </button>
          </form>
        </section>

        <section className="admin-workspace-section admin-access-section">
          <div className="admin-section-heading admin-access-heading">
            <div>
              <span className="panel-kicker">{tr("ACCESS CONTROL & AUDIT")}</span>
              <h2>{tr("Access records")}</h2>
            </div>
            <div className="admin-data-tabs" role="tablist" aria-label={tr("Administration data view")}>
              <button type="button" role="tab" aria-selected={dataView === 'invitations'} className={dataView === 'invitations' ? 'active' : ''} onClick={() => setDataView('invitations')}>{tr("Invitations")}{' '}<span>{invitations.length}</span></button>
              <button type="button" role="tab" aria-selected={dataView === 'audit'} className={dataView === 'audit' ? 'active' : ''} onClick={() => setDataView('audit')}>{tr("Audit history")}{' '}<span>{logs.length}</span></button>
            </div>
          </div>

          {loading ? (
            <div className="admin-loading"><span className="loading-ring" />{tr("Loading administration…")}</div>
          ) : dataView === 'invitations' ? (
            <>
              <AdminListToolbar
                query={invitationQuery}
                onQueryChange={setInvitationQuery}
                placeholder={tr("Search user or Google identity")}
                count={filteredInvitations.length}
              >
                <select value={invitationStatus} onChange={(event) => setInvitationStatus(event.target.value)} aria-label={tr("Filter invitation status")}>
                  <option value="all">{tr("All statuses")}</option>
                  <option value="active">{tr("Claimed / Active")}</option>
                  <option value="pending">{tr("Pending")}</option>
                  <option value="expired">{tr("Expired")}</option>
                  <option value="restricted">{tr("Restricted")}</option>
                </select>
                <select value={invitationRole} onChange={(event) => setInvitationRole(event.target.value)} aria-label={tr("Filter invitation role")}>
                  <option value="all">{tr("All roles")}</option>
                  <option value="viewer">{tr("Viewer")}</option>
                  <option value="trader">{tr("Trader")}</option>
                  <option value="admin">{tr("Administrator")}</option>
                </select>
              </AdminListToolbar>

              <div className="admin-workspace-table-wrap">
                <table className="market-table admin-table identity-admin-table admin-sortable-table">
                  <thead>
                    <tr>
                      <AdminSortableTh label={tr("User")} field="guest_name" sort={invitationSort} onSort={(key) => setInvitationSort((current) => toggledSort(current, key))} hint={ADMIN_HINTS.guestName} />
                      <AdminSortableTh label={tr("Role")} field="role" sort={invitationSort} onSort={(key) => setInvitationSort((current) => toggledSort(current, key))} hint={ADMIN_HINTS.role} />
                      <AdminSortableTh label={tr("Status")} field="status" sort={invitationSort} onSort={(key) => setInvitationSort((current) => toggledSort(current, key))} hint={ADMIN_HINTS.status} />
                      <AdminSortableTh label={tr("Sessions")} field="sessions" sort={invitationSort} onSort={(key) => setInvitationSort((current) => toggledSort(current, key))} hint={ADMIN_HINTS.sessions} />
                      <AdminSortableTh label={tr("Claimed identity")} field="claimed_identity" sort={invitationSort} onSort={(key) => setInvitationSort((current) => toggledSort(current, key))} hint={ADMIN_HINTS.claimedIdentity} />
                      <AdminSortableTh label={tr("Expires")} field="expires_at" sort={invitationSort} onSort={(key) => setInvitationSort((current) => toggledSort(current, key))} hint={ADMIN_HINTS.expires} />
                      <AdminSortableTh label={tr("Last access")} field="last_access_at" sort={invitationSort} onSort={(key) => setInvitationSort((current) => toggledSort(current, key))} hint={ADMIN_HINTS.lastAccess} />
                      <th>{tr("Actions")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {visibleInvitations.length === 0 ? (
                      <tr><td colSpan="8" className="empty-table-cell">{tr("No access records match the selected filters.")}</td></tr>
                    ) : visibleInvitations.map((item) => {
                      const legacy = item.status === 'legacy_unverified'
                      const primaryAdministrator = Boolean(item.primary_administrator)
                      const locked = ['revoked', 'legacy_unverified'].includes(item.status)
                      const cannotDelete = primaryAdministrator || ['pending_verification', 'claimed', 'active'].includes(item.status)
                      return (
                        <tr key={item.id}>
                          <td data-label={tr('User')}>
                            <strong>{item.guest_name}</strong>
                            <small className="admin-identity-email">{item.authorized_email || tr('No verified email')}</small>
                            {primaryAdministrator ? <small className="primary-administrator-label">{tr("Primary Google administrator")}</small> : null}
                          </td>
                          <td data-label={tr('Role')}>{roleLabel(item.role)}</td>
                          <td data-label={tr('Status')}><span className={`admin-status ${statusClass(item.status)}`}>{statusLabel(item.status)}</span></td>
                          <td data-label={tr('Sessions')}>
                            <div className="session-limit-control">
                              <strong>{item.active_sessions || 0}</strong>
                              <span>{tr("of")}</span>
                              <select
                                value={sessionLimits[item.id] ?? String(item.max_active_sessions || 1)}
                                onChange={(event) => setSessionLimits({ ...sessionLimits, [item.id]: event.target.value })}
                                disabled={locked}
                                aria-label={`Maximum sessions for ${item.guest_name}`}
                              >
                                {SESSION_OPTIONS.map((value) => <option key={value} value={value}>{value}</option>)}
                              </select>
                              <button type="button" onClick={() => saveSessionLimit(item)} disabled={Boolean(busyId) || locked}>{tr("Save")}</button>
                            </div>
                          </td>
                          <td data-label={tr('Claimed identity')}>
                            <span className="claimed-identity">{item.claimed_email || tr(legacy ? 'New invitation required' : 'Not claimed')}</span>
                            {item.claimed_at ? <small>{dateTime(item.claimed_at)}</small> : null}
                          </td>
                          <td data-label={tr('Expires')}>{dateTime(item.expires_at)}</td>
                          <td data-label={tr('Last access')}>{dateTime(item.last_access_at)}</td>
                          <td data-label={tr('Actions')}>
                            <div className="admin-row-actions identity-row-actions">
                              <button
                                type="button"
                                title={tr("End sessions, rotate the token and require a fresh Google identity claim.")}
                                onClick={() => regenerateAccessLink(item)}
                                disabled={Boolean(busyId) || locked || primaryAdministrator}
                              >
                                {tr("Generate new claim link")}</button>
                              <select
                                value={extendDurations[item.id] ?? DEFAULT_DURATION_SECONDS}
                                onChange={(event) => setExtendDurations({ ...extendDurations, [item.id]: event.target.value })}
                                disabled={locked || primaryAdministrator}
                                aria-label={`Duration for ${item.guest_name}`}
                              >
                                {DURATION_OPTIONS.map(([value, label]) => <option key={value} value={value}>+{tr(label)}</option>)}
                              </select>
                              <button type="button" onClick={() => extendInvitation(item)} disabled={Boolean(busyId) || locked || primaryAdministrator}>{tr("Extend")}</button>
                              <button
                                type="button"
                                onClick={() => runAction(item.id, 'terminate-sessions', tr('Sessions terminated for {name}.', { name: item.guest_name }))}
                                disabled={Boolean(busyId) || legacy}
                              >
                                {tr("End sessions")}</button>
                              <button
                                type="button"
                                className="danger"
                                onClick={() => runAction(item.id, 'revoke', tr('Access revoked for {name}.', { name: item.guest_name }))}
                                disabled={Boolean(busyId) || item.status === 'revoked' || legacy || primaryAdministrator}
                              >
                                {tr("Revoke")}</button>
                              <button
                                type="button"
                                className="danger ghost"
                                onClick={() => deleteInvitation(item)}
                                disabled={Boolean(busyId) || cannotDelete}
                              >
                                {tr("Delete")}</button>
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
                placeholder={tr("Search event, user, identity or client")}
                count={filteredLogs.length}
              >
                <div className="admin-result-filters" aria-label={tr("Audit result filter")}>
                  <button type="button" className={logResult === 'all' ? 'active' : ''} onClick={() => setLogResult('all')} title={tr("Show all audit results")}><ListFilterIcon size={15} /> {tr("All")}</button>
                  <button type="button" className={`positive ${logResult === 'success' ? 'active' : ''}`} onClick={() => setLogResult('success')}>{tr("Success")}</button>
                  <button type="button" className={`negative ${logResult === 'denied' ? 'active' : ''}`} onClick={() => setLogResult('denied')}>{tr("Denied")}</button>
                </div>
                <select value={logRole} onChange={(event) => setLogRole(event.target.value)} aria-label={tr("Filter audit role")}>
                  <option value="all">{tr("All roles")}</option>
                  <option value="viewer">{tr("Viewer")}</option>
                  <option value="trader">{tr("Trader")}</option>
                  <option value="admin">{tr("Administrator")}</option>
                </select>
              </AdminListToolbar>

              <div className="admin-workspace-table-wrap">
                <table className="market-table access-log-table admin-sortable-table">
                  <thead>
                    <tr>
                      <AdminSortableTh label={tr("Time")} field="created_at" sort={logSort} onSort={(key) => setLogSort((current) => toggledSort(current, key))} hint={ADMIN_HINTS.auditTime} />
                      <AdminSortableTh label={tr("Event")} field="event" sort={logSort} onSort={(key) => setLogSort((current) => toggledSort(current, key))} hint={ADMIN_HINTS.auditEvent} />
                      <AdminSortableTh label={tr("User")} field="guest_name" sort={logSort} onSort={(key) => setLogSort((current) => toggledSort(current, key))} hint={ADMIN_HINTS.auditUser} />
                      <AdminSortableTh label={tr("Google identity")} field="identity_email" sort={logSort} onSort={(key) => setLogSort((current) => toggledSort(current, key))} hint={ADMIN_HINTS.auditIdentity} />
                      <AdminSortableTh label={tr("Role")} field="role" sort={logSort} onSort={(key) => setLogSort((current) => toggledSort(current, key))} hint={ADMIN_HINTS.auditRole} />
                      <AdminSortableTh label={tr("Result")} field="success" sort={logSort} onSort={(key) => setLogSort((current) => toggledSort(current, key))} hint={ADMIN_HINTS.auditResult} />
                      <AdminSortableTh label={tr("Client")} field="client_ip" sort={logSort} onSort={(key) => setLogSort((current) => toggledSort(current, key))} hint={ADMIN_HINTS.auditClient} />
                    </tr>
                  </thead>
                  <tbody>
                    {visibleLogs.length === 0 ? (
                      <tr><td colSpan="7" className="empty-table-cell">{tr("No access events match the selected filters.")}</td></tr>
                    ) : visibleLogs.map((item) => (
                      <tr key={item.id}>
                        <td>{dateTime(item.created_at)}</td>
                        <td>{tr(String(item.event || '').replaceAll('_', ' '))}</td>
                        <td>{item.guest_name || '—'}</td>
                        <td>{item.identity_email || '—'}</td>
                        <td>{item.role ? roleLabel(item.role) : '—'}</td>
                        <td className={item.success ? 'positive' : 'negative'}>{tr(item.success ? 'Success' : 'Denied')}</td>
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
