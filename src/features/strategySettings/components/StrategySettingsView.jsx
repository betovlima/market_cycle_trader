import { tr } from '../../../i18n/runtime'
import { ModelResearchSettingsPanel } from '../../ModelResearchSettingsPanel'
import { STRATEGY_FIELD_HINTS } from '../strategySettingsConfig'
import { dateTime, statusLabel } from '../strategySettingsUtils'
import { ParameterField, StrategyFieldLabel } from './StrategyFields'
import { StrategyBoundaryGrid } from './StrategyBoundaryGrid'
import { StrategyCatalog } from './StrategyCatalog'
import { StrategyLifecycleNotes } from './StrategyLifecycleNotes'

export function StrategySettingsView({ workspace }) {
  const {
    activeJob,
    busy,
    canMarkCandidate,
    canPromote,
    candidateId,
    catalog,
    changeNote,
    cloneStrategy,
    deleteStrategy,
    description,
    editorValues,
    embedded,
    error,
    globalVisibleParameterCount,
    groupedParameters,
    handleStrategyModelSaved,
    hasActiveBacktest,
    hasUnsavedChanges,
    hasUnsavedStrategyChanges,
    isTemporalStrategy,
    markAsCandidate,
    modelTuningId,
    name,
    notice,
    onSessionExpired,
    orderedStrategies,
    parameterSchemas,
    parameterSearch,
    promoteToTrader,
    promotedCandidateId,
    researchId,
    saveStrategy,
    selectDetail,
    selected,
    setChangeNote,
    setDescription,
    setModelHasUnsavedChanges,
    setModelParameterMatchCount,
    setName,
    setParameterSearch,
    traderRuntimeBlockReason,
    traderRuntimeReady,
    updateEditorValue,
    useForBacktest,
    useForModelTuning,
    winnerId
  } = workspace

  return (
    <section className={`${embedded ? 'settings-workspace-section settings-strategy-section' : 'panel'} strategy-lab-panel`}>
      <div className="panel-heading strategy-lab-heading">
        <div>
          <span className="panel-kicker">{tr("STRATEGIES")}</span>
          <h2>{tr("Research strategies and Trader winner")}</h2>
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
          {tr("Backtest")}{' '}{activeJob.id} {tr("is")}{' '}{statusLabel(activeJob.status)}{tr(". You may clone and edit test strategies, but strategy selection, promotion and a new backtest remain locked until it finishes. The strategy used by the running backtest cannot be deleted until it finishes.")}</div>
      ) : null}

      <StrategyBoundaryGrid catalog={catalog} />

      {catalog.control?.paper_state_reinitialization_required ? (
        <div className="global-inline-message warning-inline">{tr("The Trader winner changed. Run the protected Paper initialization before restarting Trader.")}</div>
      ) : null}

      <div className="strategy-workspace">
        <StrategyCatalog
          catalog={catalog}
          orderedStrategies={orderedStrategies}
          selected={selected}
          busy={busy}
          researchId={researchId}
          winnerId={winnerId}
          candidateId={candidateId}
          promotedCandidateId={promotedCandidateId}
          onCloneWinner={cloneStrategy}
          onSelectDetail={selectDetail}
        />

        <div className="strategy-editor-panel">
          <div className="strategy-editor-header">
            <div>
              <span className="panel-kicker">{tr("SELECTED STRATEGY")}</span>
              <h3>{selected.name}</h3>
              <p>{tr("Revision")}{' '}{selected.revision} {tr("· Hash")}{' '}{selected.configuration_hash?.slice(0, 12) || '—'}{tr("… · Source")}{' '}{selected.origin?.winner_source_file || tr('catalog snapshot')}</p>
            </div>
            <div className="strategy-editor-actions">
              {!isTemporalStrategy ? <button type="button" onClick={() => cloneStrategy(selected)} disabled={Boolean(busy)}>{tr("Clone for test")}</button> : null}
              <button type="button" onClick={() => useForModelTuning(selected)} disabled={Boolean(busy) || selected.id === modelTuningId}>{tr(selected.id === modelTuningId ? 'Selected for Model Tuning' : 'Use in Model Tuning')}</button>
              {selected.id !== researchId && !isTemporalStrategy ? <button type="button" onClick={() => useForBacktest(selected)} disabled={Boolean(busy) || hasActiveBacktest}>{tr("Use for backtest")}</button> : null}
              {!selected.locked && selected.status === 'draft' ? <button type="button" className="candidate-action" title={canMarkCandidate ? tr('Make the latest completed run for the selected model the single active Candidate') : (traderRuntimeReady ? tr('Complete an exact Backtest for the saved Strategy model before Candidate promotion') : traderRuntimeBlockReason)} onClick={() => markAsCandidate(selected)} disabled={Boolean(busy) || !canMarkCandidate}>{tr("Mark as candidate")}</button> : null}
              {selected.id !== winnerId ? <button type="button" className="promote-action" title={canPromote ? tr('Promote metadata only while XNYS is closed, preserving the current position and next scheduled pipeline') : (traderRuntimeReady ? tr('Mark a completed exact revision as candidate before promotion') : traderRuntimeBlockReason)} onClick={() => promoteToTrader(selected)} disabled={Boolean(busy) || !canPromote}>{tr("Promote to Trader winner")}</button> : null}
              {selected.id !== winnerId && selected.id !== candidateId ? <button type="button" className="danger" onClick={() => deleteStrategy(selected)} disabled={Boolean(busy)}>{tr("Delete strategy")}</button> : null}
            </div>
          </div>

          {isTemporalStrategy ? (
            <div className="strategy-temporal-policy-summary">
              <span><small>{tr('Strategy type')}</small><strong>{tr('Temporal Intelligence')}</strong></span>
              <span><small>{tr('Temporal experiment')}</small><strong>{selected.source_temporal_experiment || '—'}</strong></span>
              <span><small>{tr('Source run')}</small><strong>{selected.source_temporal_run_id || '—'}</strong></span>
              <span><small>{tr('Tuning target')}</small><strong>{tr('Temporal policy')}</strong></span>
              <span><small>{tr('Base weak threshold')}</small><strong>{selected.temporal_policy?.parameters?.timing_base_weak_threshold ?? '—'}</strong></span>
              <span><small>{tr('Challenger minimum')}</small><strong>{selected.temporal_policy?.parameters?.timing_challenger_minimum ?? '—'}</strong></span>
              <span><small>{tr('Minimum advantage')}</small><strong>{selected.temporal_policy?.parameters?.timing_minimum_advantage ?? '—'}</strong></span>
              <span><small>{tr('Validated capital')}</small><strong>{selected.temporal_policy?.validation?.ending_capital != null ? `$${Number(selected.temporal_policy.validation.ending_capital).toLocaleString(undefined, { maximumFractionDigits: 2 })}` : '—'}</strong></span>
            </div>
          ) : null}

          {!isTemporalStrategy ? (<>
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
          </>) : null}


          <ModelResearchSettingsPanel
            onSessionExpired={onSessionExpired}
            embedded
            strategy={selected}
            readOnly={isTemporalStrategy}
            onStrategyModelSaved={isTemporalStrategy ? null : handleStrategyModelSaved}
            onDirtyChange={isTemporalStrategy ? null : setModelHasUnsavedChanges}
            parameterSearch={isTemporalStrategy ? '' : parameterSearch}
            onSearchMatchCount={isTemporalStrategy ? null : setModelParameterMatchCount}
          />

          <StrategyLifecycleNotes selected={selected} />

          {!isTemporalStrategy ? (
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
                  <StrategyFieldLabel id="hint-strategy-change-reason" label={tr("Change reason (optional)")} hint={STRATEGY_FIELD_HINTS.changeReason} />
                  <input value={changeNote} onChange={(event) => setChangeNote(event.target.value)} maxLength={500} placeholder={tr('Optional audit note')} />
                </label>
                <div className="strategy-save-actions">
                  <small>{tr(hasUnsavedStrategyChanges ? selected.status === 'candidate' ? 'Unsaved edits are local. Saving them will create a new draft revision.' : 'Local draft preserved until you save or leave this strategy.' : 'No unsaved Strategy parameter changes.')}</small>
                  <button type="submit" className="admin-primary-button" disabled={Boolean(busy) || !hasUnsavedStrategyChanges}>{tr(busy === 'save' ? 'Saving…' : 'Save test strategy')}</button>
                </div>
              </div>
            ) : null}
          </form>
          ) : null}

          <div className="strategy-last-test">
            <span>{tr(isTemporalStrategy ? 'Source validation' : 'Latest backtest')}</span>
            <strong>{isTemporalStrategy ? tr('Temporal Intelligence completed') : selected.last_backtest_status ? statusLabel(selected.last_backtest_status) : tr('Not run for this revision')}</strong>
            <small>{isTemporalStrategy ? selected.source_temporal_run_id || '—' : selected.last_backtest_id || '—'} {tr("· Updated")}{' '}{dateTime(selected.updated_at)}</small>
          </div>
        </div>
      </div>
    </section>
  )
}
