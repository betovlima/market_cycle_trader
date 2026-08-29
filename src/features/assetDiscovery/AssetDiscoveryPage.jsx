import { useEffect, useMemo, useState } from 'react'

import { hasCapability } from '../../auth/capabilities'
import { tr } from '../../i18n/runtime'
import { money, number, percent, shortDateTime } from '../../shared/formatters'
import { SearchIcon } from '../../shared/components/Icons'
import { MarginalMetricHelpButton, MarginalMetricLabel } from './MarginalMetricHelp'
import { AssetSymbolTooltip } from './AssetSymbolTooltip'
import { useAssetDiscovery } from './useAssetDiscovery'
import './assetDiscovery.css'

const PHASES = [
  ['baseline', 'Strategy baseline'],
  ['training_ranker', 'Learning-to-Rank'],
  ['scanning', 'External scan'],
  ['marginal_replay', 'Full-history marginal replay'],
  ['completed', 'Positive capital candidates'],
  ['full_strategy_validation', 'Selected-universe validation'],
]

function phaseIndex(campaign) {
  const phase = String(campaign?.phase || '')
  const status = String(campaign?.status || '')
  const certificationStatus = String(campaign?.full_strategy_validation?.status || '')
  if (status === 'completed' && certificationStatus === 'completed') return PHASES.length
  if (status === 'completed') return PHASES.findIndex(([id]) => id === 'full_strategy_validation')
  const index = PHASES.findIndex(([id]) => id === phase)
  return index < 0 ? 0 : index
}

function marginalTone(replay) {
  if (!replay || String(replay.status || '').toLowerCase() === 'failed') return 'unavailable'
  const delta = Number(replay.ending_capital_delta_rate)
  if (!Number.isFinite(delta)) return 'pending'
  if (delta > 0 && Number(replay.marginal_rank) === 1) return 'best'
  if (delta > 0) return 'positive'
  if (delta < 0) return 'negative'
  return 'neutral'
}

function marginalRankValue(item) {
  const rank = Number(item?.marginal_replay?.marginal_rank ?? item?.marginal_rank)
  return Number.isFinite(rank) && rank > 0 ? rank : null
}

function marginalSelectable(replay) {
  if (!replay || String(replay.status || '').toLowerCase() !== 'completed') return false
  if (typeof replay.persistence_eligible === 'boolean') return replay.persistence_eligible
  if (String(replay.validation_method || '') !== 'full_strategy_history_replay') return false
  if (replay.history_window_complete !== true) return false
  if (replay.research_context_compatible === false) return false
  const delta = Number(replay.ending_capital_delta_rate)
  return Number.isFinite(delta) && delta > 0
}

function visibleDiscoveryResult(item) {
  if (!item) return false
  if (item.persistence_eligible === true) return true
  if (item.history_window_complete === false) return false
  return marginalSelectable(item.marginal_replay)
}

function normalizedSelection(values) {
  return [...new Set((values || []).map((value) => String(value || '').trim().toUpperCase()).filter(Boolean))].sort()
}

function validationMatchesSelection(validation, selectedSymbols) {
  const left = normalizedSelection(validation?.selected_assets)
  const right = normalizedSelection(selectedSymbols)
  return left.length > 0 && left.length === right.length && left.every((value, index) => value === right[index])
}

function executionStageLabel(campaign) {
  const step = String(campaign?.progress_step || '').toLowerCase()
  const current = Number(campaign?.stage_current)
  const total = Number(campaign?.stage_total)
  if (step === 'queued') return tr('Asset Discovery queued')
  if (step === 'baseline') return tr('Preparing Strategy Research baseline')
  if (step === 'baseline_sync') return tr('Synchronizing Strategy Research market data')
  if (step === 'training_dataset') return tr('Preparing Learning-to-Rank training dataset')
  if (step === 'walk_forward') {
    const label = tr('Purged walk-forward validation')
    return Number.isFinite(current) && Number.isFinite(total) && total > 0
      ? `${label} · ${tr('Fold')} ${current}/${total}`
      : label
  }
  if (step === 'final_refit') return tr('Refitting final Learning-to-Rank model')
  if (step === 'ranker_completed') return tr('Learning-to-Rank training completed')
  if (step === 'causal_refit') return tr('Refitting discovery ranking model')
  if (step === 'external_scan') {
    const label = tr('Scanning external assets')
    return Number.isFinite(current) && Number.isFinite(total) && total > 0
      ? `${label} · ${current}/${total}`
      : label
  }
  if (step === 'adherence_validation') return tr('Validating complete candidate history')
  if (step === 'marginal_replay') return tr('Marginal Capital Replay')
  if (step === 'completed') return tr('Asset Discovery completed')
  if (step === 'stopped') return tr('STOPPED')
  if (step === 'failed') return tr('FAILED')
  return tr('Processing')
}

function ExecutionStatusBar({ campaign }) {
  const status = String(campaign?.status || '').toLowerCase()
  const active = ['queued', 'running', 'stopping'].includes(status)
  const rawProgress = campaign?.stage_progress_percent
  const numericProgress = Number(rawProgress)
  const determinate = rawProgress != null && Number.isFinite(numericProgress)
  const progress = determinate ? Math.max(0, Math.min(100, numericProgress)) : 0
  const workerActive = active && Boolean(campaign?.worker_active)
  const heartbeat = campaign?.worker_heartbeat_at ? shortDateTime(campaign.worker_heartbeat_at) : '—'

  return <div className={`asset-discovery-execution-status ${active ? 'active' : ''}`}>
    <div className="asset-discovery-execution-head">
      <div>
        <span>{tr('Current stage')}</span>
        <strong>{executionStageLabel(campaign)}</strong>
      </div>
      <div className={`asset-discovery-worker-state ${workerActive ? 'active' : ''}`}>
        <span className="asset-discovery-worker-dot" aria-hidden="true" />
        <strong>{workerActive ? tr('Processing') : tr(String(campaign?.status || '').toUpperCase())}</strong>
      </div>
    </div>
    <div className={`asset-discovery-stage-progress ${determinate ? '' : 'indeterminate'}`}>
      <span style={determinate ? { width: `${progress}%` } : undefined} />
    </div>
    <div className="asset-discovery-execution-meta">
      <span>{determinate ? `${number(progress, 1)}%` : tr('Working…')}</span>
      <span>{tr('Last activity')}: <strong>{heartbeat}</strong></span>
    </div>
  </div>
}

function CampaignOutcome({ campaign, results, catalogCount }) {
  const status = String(campaign?.status || '').toLowerCase()
  if (status !== 'completed') return null

  const replay = campaign?.marginal_replay || {}
  const retained = Number(replay.persistent_candidate_count ?? results.length ?? 0)
  const scanned = Number(campaign?.attempted_count || 0)
  const evaluated = Number(campaign?.evaluated_count || 0)
  const replayed = Number(replay.completed_count || 0)
  const best = [...(results || [])]
    .filter((item) => Number.isFinite(Number(item?.marginal_replay?.ending_capital_delta_rate)))
    .sort((left, right) => Number(right.marginal_replay.ending_capital_delta_rate) - Number(left.marginal_replay.ending_capital_delta_rate))[0]
  const bestDelta = best ? Number(best.marginal_replay?.ending_capital_delta_rate) : null
  const found = retained > 0

  return <section className={`asset-discovery-campaign-outcome ${found ? 'found' : 'empty'}`}>
    <div className="asset-discovery-campaign-outcome-copy">
      <span className="eyebrow">{tr('CAMPAIGN OUTCOME')}</span>
      <h3>{found
        ? tr('{count} assets increased final Strategy capital', { count: retained })
        : tr('No asset increased final Strategy capital')}</h3>
      <p>{found
        ? tr('These assets covered the complete Strategy research history without gaps and increased final capital in the full-period replay.')
        : tr('The campaign completed successfully, but no candidate with complete historical coverage increased final Strategy capital.')}</p>
      {best && Number.isFinite(bestDelta) ? <div className="asset-discovery-campaign-best">
        <span>{tr('Best result this campaign')}</span>
        <strong>{best.symbol} · {percent(bestDelta, 2)} {tr('marginal capital')}</strong>
      </div> : null}
    </div>
    <div className="asset-discovery-campaign-funnel" aria-label={tr('Campaign funnel')}>
      <div><span>{tr('Scanned')}</span><strong>{scanned}</strong></div>
      <div><span>{tr('Evaluated')}</span><strong>{evaluated}</strong></div>
      <div><span>{tr('Full-history replays')}</span><strong>{replayed}</strong></div>
      <div className={found ? 'positive' : ''}><span>{tr('Positive-capital candidates')}</span><strong>{retained}</strong></div>
      <div><span>{tr('Historical catalog')}</span><strong>{catalogCount}</strong></div>
    </div>
    <small className="asset-discovery-campaign-outcome-note">{tr('The historical catalog below may contain assets retained by previous campaigns; it is not the result count of the current campaign.')}</small>
  </section>
}

function ResearchWindowPanel({ campaign }) {
  const research = campaign?.research_window || {}
  if (!research?.research_start || !research?.research_end) return null
  return <section className="asset-discovery-causal-validation">
    <div>
      <span>{tr('Strategy research start')}</span>
      <strong>{research.research_start}</strong>
      <small>{tr('The start is derived from the Strategy configuration; no calendar date is hardcoded in Asset Discovery.')}</small>
    </div>
    <div>
      <span>{tr('Research end')}</span>
      <strong>{research.research_end}</strong>
      <small>{tr('The end is the latest synchronized completed market session for the campaign snapshot.')}</small>
    </div>
    <div className="asset-discovery-causal-rule">
      <span>{tr('Historical integrity rule')}</span>
      <strong>{tr('Complete history, no gaps')}</strong>
      <small>{tr('A candidate is discarded before economic replay if it does not cover every required Strategy session.')}</small>
    </div>
    <div>
      <span>{tr('Economic approval rule')}</span>
      <strong>{tr('Final Strategy capital must increase')}</strong>
      <small>{tr('Candidate approval compares the original Strategy with Strategy plus the candidate over the complete research period.')}</small>
    </div>
  </section>
}

function Pipeline({ campaign }) {
  const current = phaseIndex(campaign)
  return <div className="asset-discovery-pipeline" aria-label={tr('Research pipeline')}>
    {PHASES.map(([id, label], index) => {
      const complete = current > index
      const active = current === index && campaign?.status !== 'completed'
      return <div className={`asset-discovery-stage ${complete ? 'complete' : ''} ${active ? 'active' : ''}`} key={id}>
        <span className="asset-discovery-stage-dot">{complete ? '✓' : active ? '⚙' : '○'}</span>
        <strong>{tr(label)}</strong>
      </div>
    })}
  </div>
}


function fitAssessmentCopy(status) {
  const value = String(status || 'inconclusive').toLowerCase()
  if (value === 'possible_underfitting') return {
    tone: 'warning',
    label: tr('Possible underfitting'),
    description: tr('The ranker shows little advantage over random even on training data. Capacity or signal may be insufficient; no parameter is changed automatically.'),
  }
  if (value === 'overfitting_risk') return {
    tone: 'danger',
    label: tr('Overfitting risk'),
    description: tr('Training skill is materially stronger than chronological OOS skill. Increasing model capacity is not recommended from this evidence.'),
  }
  if (value === 'healthy_fit') return {
    tone: 'healthy',
    label: tr('Healthy fit'),
    description: tr('The ranker retains useful skill out of sample with a controlled train-to-OOS gap.'),
  }
  return {
    tone: 'neutral',
    label: tr('Inconclusive fit'),
    description: tr('Current evidence is not sufficient to classify the ranker as underfit or overfit.'),
  }
}

function ValidationPanel({ model }) {
  const folds = model?.validation_folds || []
  const summary = model?.validation_summary || {}
  const fit = summary?.fit_assessment || {}
  const fitCopy = fitAssessmentCopy(fit.status)
  if (!folds.length) return null

  return <section className="asset-discovery-validation">
    <div className="asset-discovery-section-heading">
      <div>
        <span className="eyebrow">{tr('PURGED WALK-FORWARD')}</span>
        <h3>{tr('Ranking validation')}</h3>
      </div>
      <span>{tr('{count} chronological folds', { count: folds.length })}</span>
    </div>
    <div className="asset-discovery-validation-summary">
      <div><span>{tr('Ranker median NDCG@5')}</span><strong>{summary.ranker_median_ndcg_at_5 == null ? '—' : number(summary.ranker_median_ndcg_at_5, 3)}</strong></div>
      <div><span>{tr('Momentum median NDCG@5')}</span><strong>{summary.momentum_median_ndcg_at_5 == null ? '—' : number(summary.momentum_median_ndcg_at_5, 3)}</strong></div>
      <div><span>{tr('Random median NDCG@5')}</span><strong>{summary.random_median_ndcg_at_5 == null ? '—' : number(summary.random_median_ndcg_at_5, 3)}</strong></div>
      <div><span>{tr('Worst Ranker fold')}</span><strong>{summary.ranker_worst_ndcg_at_5 == null ? '—' : number(summary.ranker_worst_ndcg_at_5, 3)}</strong></div>
      <div><span>{tr('Wins vs momentum')}</span><strong>{summary.win_rate_vs_momentum == null ? '—' : percent(summary.win_rate_vs_momentum, 0)}</strong></div>
    </div>
    <div className={`asset-discovery-fit-diagnostic ${fitCopy.tone}`}>
      <div className="asset-discovery-fit-copy">
        <span className="eyebrow">{tr('MODEL FIT DIAGNOSTICS')}</span>
        <strong>{fitCopy.label}</strong>
        <p>{fitCopy.description}</p>
        {fit.capacity_probe_recommended ? <small>{tr('A controlled capacity probe is recommended before changing model parameters.')}</small> : null}
      </div>
      <div className="asset-discovery-fit-metrics">
        <div><span>{tr('Train NDCG@5')}</span><strong>{fit.train_median_ndcg_at_5 == null ? '—' : number(fit.train_median_ndcg_at_5, 3)}</strong></div>
        <div><span>{tr('OOS NDCG@5')}</span><strong>{fit.oos_median_ndcg_at_5 == null ? '—' : number(fit.oos_median_ndcg_at_5, 3)}</strong></div>
        <div><span>{tr('Train → OOS gap')}</span><strong>{fit.median_generalization_gap == null ? '—' : number(fit.median_generalization_gap, 3)}</strong></div>
        <div><span>{tr('OOS advantage vs random')}</span><strong>{fit.oos_excess_vs_random == null ? '—' : number(fit.oos_excess_vs_random, 3)}</strong></div>
      </div>
    </div>
    <div className="asset-discovery-fold-grid">
      {folds.map((fold) => <article className={`asset-discovery-fold ${fold.beats_momentum ? 'winner' : ''}`} key={fold.fold}>
        <div className="asset-discovery-fold-head">
          <strong>{tr('Fold')} {fold.fold}</strong>
          <span>{fold.validation_start} → {fold.validation_end}</span>
        </div>
        <div className="asset-discovery-fold-values">
          <div><span>{tr('Train')}</span><strong>{fold.train_ranker_ndcg_at_5 == null ? '—' : number(fold.train_ranker_ndcg_at_5, 3)}</strong></div>
          <div><span>{tr('OOS')}</span><strong>{fold.ranker_ndcg_at_5 == null ? '—' : number(fold.ranker_ndcg_at_5, 3)}</strong></div>
          <div><span>{tr('Gap')}</span><strong>{fold.generalization_gap == null ? '—' : number(fold.generalization_gap, 3)}</strong></div>
          <div><span>{tr('Momentum')}</span><strong>{fold.momentum_ndcg_at_5 == null ? '—' : number(fold.momentum_ndcg_at_5, 3)}</strong></div>
        </div>
      </article>)}
    </div>
  </section>
}

function MarginalReplayPanel({
  campaign,
  selectedSymbols,
  toggleSymbol,
  canStart,
  canCreateStrategy,
  busy,
  onRunReplay,
  onValidate,
  onAddSelected,
  setSelectedSymbols,
  validationError,
  createError,
  updatedResearchStrategy,
  currentCampaignSymbols,
  researchStrategySequence,
}) {
  const replay = campaign?.marginal_replay || {}
  const validation = campaign?.full_strategy_validation || {}
  const rows = [...(replay.results || [])].filter(marginalSelectable).sort((left, right) => {
    const leftRank = Number(left?.marginal_rank || 999)
    const rightRank = Number(right?.marginal_rank || 999)
    return leftRank - rightRank
  })
  const currentCampaignSet = new Set((currentCampaignSymbols || []).map((symbol) => String(symbol || '').trim().toUpperCase()).filter(Boolean))
  const selectableSymbols = rows
    .map((row) => String(row.symbol || '').trim().toUpperCase())
    .filter((symbol) => symbol && currentCampaignSet.has(symbol))
  const allSelected = selectableSymbols.length > 0 && selectableSymbols.every((symbol) => selectedSymbols.includes(symbol))
  const toggleAll = () => setSelectedSymbols(allSelected ? [] : selectableSymbols)
  const baseline = replay.baseline || {}
  const total = Number(replay.total_count || campaign?.shortlisted_count || 0)
  const completed = Number(replay.completed_count || 0)
  const currentIndex = Number(replay.current_index || 0)
  const apiProgress = Number(replay.progress_percent)
  const progress = Number.isFinite(apiProgress)
    ? Math.max(0, Math.min(100, apiProgress))
    : (total ? Math.max(0, Math.min(100, (completed / total) * 100)) : 0)
  const replayingBaseline = String(replay.current_symbol || '').toUpperCase() === 'BASELINE'
  const progressLabel = replayingBaseline
    ? tr('Replaying baseline')
    : replay.current_symbol
      ? tr('Testing {symbol} · {current} of {total}', { symbol: replay.current_symbol, current: currentIndex || completed + 1, total })
      : `${completed} / ${total || '—'} ${tr('replayed')}`
  const replayStatus = String(replay.status || '').toLowerCase()
  const replayActive = ['queued', 'running'].includes(replayStatus)
  const replayComplete = total > 0 && completed >= total && replayStatus === 'completed'
  const needsManualReplay = Boolean((campaign?.results || []).length) && !replayActive && !replayComplete
  const validationStatus = String(validation.status || '').toLowerCase()
  const validationActive = ['queued', 'running'].includes(validationStatus)
  const validationMatches = validationMatchesSelection(validation, selectedSymbols)
  const validationPassed = validationStatus === 'completed' && String(validation.decision || '').toUpperCase() === 'PASS' && validationMatches
  const validationFailed = validationStatus === 'completed' && String(validation.decision || '').toUpperCase() === 'FAIL' && validationMatches
  const validationProgress = Math.max(0, Math.min(100, Number(validation.progress_percent || 0)))
  const validationDeltas = validation.deltas || {}
  const validationBaseline = validation.baseline || {}
  const validationCandidate = validation.candidate || {}
  if (!total && campaign?.phase !== 'marginal_replay' && campaign?.phase !== 'full_strategy_validation' && campaign?.status !== 'completed') return null

  return <section className="asset-discovery-marginal">
    <div className="asset-discovery-section-heading asset-discovery-result-heading">
      <div>
        <span className="eyebrow">{tr('FULL-HISTORY MARGINAL REPLAY')}</span>
        <h3>{tr('Economic contribution over the complete Strategy history')}</h3>
        <small>{tr('Each candidate must cover the Strategy history from its configured start through the campaign snapshot, with no missing required sessions. The replay compares final capital over that complete period.')}</small>
      </div>
      <div className="asset-discovery-result-actions">
        <span>{completed} / {total || '—'} {tr('replayed')}</span>
        {needsManualReplay ? <button
          type="button"
          className="secondary-action"
          disabled={!canStart || busy === 'marginal-replay'}
          onClick={onRunReplay}
        >
          {busy === 'marginal-replay' ? tr('Starting replay…') : tr('Run Marginal Capital Replay')}
        </button> : null}
      </div>
    </div>
    {replayActive ? <>
      <div className="asset-discovery-progress-copy">
        <span>{progressLabel}</span>
        <strong>{number(progress, 1)}%</strong>
      </div>
      <div className="asset-discovery-progress"><span style={{ width: `${progress}%` }} /></div>
      {replay.current_stage ? <div className="asset-discovery-progress-stage">{replay.current_stage}</div> : null}
    </> : null}
    {baseline.ending_capital != null ? <div className="asset-discovery-marginal-baseline">
      <div><MarginalMetricLabel label="Baseline capital" metric="baselineCapital" /><strong>{money(baseline.ending_capital)}</strong></div>
      <div><MarginalMetricLabel label="Baseline CAGR" metric="baselineCagr" /><strong>{baseline.cagr == null ? '—' : percent(baseline.cagr, 2)}</strong></div>
      <div><MarginalMetricLabel label="Baseline Sharpe" metric="baselineSharpe" /><strong>{baseline.sharpe == null ? '—' : number(baseline.sharpe, 3)}</strong></div>
      <div><MarginalMetricLabel label="Baseline MaxDD" metric="baselineMaxDd" /><strong>{baseline.maximum_drawdown == null ? '—' : percent(baseline.maximum_drawdown, 2)}</strong></div>
      <div><MarginalMetricLabel label="Baseline worst fold" metric="baselineWorstFold" /><strong>{baseline.worst_fold_return == null ? '—' : percent(baseline.worst_fold_return, 2)}</strong></div>
    </div> : null}
    {rows.length ? <div className={`asset-discovery-selection-bar ${validationPassed ? 'certified' : ''}`}>
      <div className="asset-discovery-selection-summary">
        <span>{tr('Selected candidates')}</span>
        <strong>{tr('{count} selected', { count: selectedSymbols.length })}</strong>
        <small>{researchStrategySequence
          ? tr('Destination: Research Strategy #{sequence}', { sequence: researchStrategySequence })
          : tr('Destination: Research Strategy')}</small>
      </div>
      <div className="asset-discovery-selection-actions">
        <label className="asset-discovery-select-asset asset-discovery-select-all">
          <input type="checkbox" checked={allSelected} disabled={!selectableSymbols.length || validationActive} onChange={toggleAll} />
          <span>{tr('Select all')}</span>
        </label>
        <button
          type="button"
          className="secondary-action"
          disabled={!canCreateStrategy || !selectedSymbols.length || validationActive || busy === 'full-strategy-validation'}
          onClick={onValidate}
        >
          {validationActive || busy === 'full-strategy-validation'
            ? tr('Validating historical impact — {count}', { count: validation.selected_assets?.length || selectedSymbols.length })
            : selectedSymbols.length
              ? tr('Validate historical impact — {count}', { count: selectedSymbols.length })
              : tr('Validate historical impact')}
        </button>
        <button
          type="button"
          className="primary-action asset-discovery-append-action"
          disabled={!canCreateStrategy || !selectedSymbols.length || !validationPassed || busy === 'append-to-research-strategy'}
          onClick={onAddSelected}
        >
          {busy === 'append-to-research-strategy'
            ? tr('Adding selected assets…')
            : selectedSymbols.length
              ? researchStrategySequence
                ? tr('Add {count} selected to Research Strategy #{sequence}', { count: selectedSymbols.length, sequence: researchStrategySequence })
                : tr('Add {count} selected to Research Strategy', { count: selectedSymbols.length })
              : researchStrategySequence
                ? tr('Add selected to Research Strategy #{sequence}', { sequence: researchStrategySequence })
                : tr('Add selected to Research Strategy')}
        </button>
      </div>
      <div className="asset-discovery-selection-feedback">
        {validationActive ? <div className="asset-discovery-validation-inline" role="status" aria-live="polite">
          <div className="asset-discovery-validation-inline-copy">
            <strong>{tr('Historical validation running')}</strong>
            <span>{tr(validation.current_stage || 'Validating selection')}</span>
            <b>{number(validationProgress, 1)}%</b>
          </div>
          <div className="asset-discovery-progress"><span style={{ width: `${validationProgress}%` }} /></div>
        </div> : null}
        {validationPassed ? <small className="asset-discovery-create-feedback success">{tr('Selected-universe validation PASS for this exact selection.')}</small> : null}
        {validationFailed ? <small className="asset-discovery-create-feedback error">{tr('Selected-universe validation FAIL for this exact selection.')}</small> : null}
        {validationError ? <small className="asset-discovery-create-feedback error">{validationError}</small> : null}
        {createError ? <small className="asset-discovery-create-feedback error">{createError}</small> : null}
        {updatedResearchStrategy?.research_strategy?.strategy_sequence ? <small className="asset-discovery-create-feedback success">{tr('Research Strategy #{sequence} updated · {count} assets', { sequence: updatedResearchStrategy.research_strategy.strategy_sequence, count: updatedResearchStrategy.asset_count_after || '—' })}</small> : null}
      </div>
    </div> : null}
    {rows.length ? <div className="asset-discovery-marginal-grid">
      {rows.map((row) => {
        const result = (campaign?.results || []).find((item) => item.symbol === row.symbol) || {}
        const selectable = marginalSelectable(row) && currentCampaignSet.has(String(row.symbol || '').trim().toUpperCase())
        const checked = selectable && selectedSymbols.includes(row.symbol)
        const candidate = row.candidate || {}
        const tone = marginalTone(row)
        return <article className={`asset-discovery-marginal-card quality-${tone} ${checked ? 'selected' : ''}`} key={row.symbol}>
          <div className="asset-discovery-result-head">
            <div>
              <div className="asset-discovery-quality-title">
                <span className={`asset-discovery-quality-dot ${tone}`} aria-hidden="true" />
                <strong><AssetSymbolTooltip symbol={row.symbol} companyName={result.company_name}>{row.marginal_rank ? `#${row.marginal_rank} · ${row.symbol}` : row.symbol}</AssetSymbolTooltip></strong>
                {row.marginal_rank ? <MarginalMetricHelpButton metric="marginalRank" label="Marginal contribution rank" /> : null}
              </div>
              <small className="asset-discovery-rank-line"><span>{tr('Discovery rank')}</span><strong>#{result?.discovery_selection?.rank || result.rank || '—'}</strong></small>
            </div>
            {selectable ? <label className="asset-discovery-select-asset">
              <input type="checkbox" checked={checked} disabled={validationActive} onChange={() => toggleSymbol(row.symbol)} />
              <span>{tr('Select')}</span>
            </label> : <span className="asset-discovery-adherence-label">{tr('Low adherence')}</span>}
          </div>
          {row.status === 'failed' ? <div className="inline-error asset-discovery-marginal-error">{row.error || tr('Marginal replay failed for this asset.')}</div> : <>
            <div className="asset-discovery-marginal-primary">
              <MarginalMetricLabel label="Marginal capital" metric="marginalCapital" />
              <strong>{row.ending_capital_delta_rate == null ? '—' : percent(row.ending_capital_delta_rate, 2)}</strong>
              <small>{candidate.ending_capital == null ? '—' : money(candidate.ending_capital)}</small>
            </div>
            <div className="asset-discovery-result-values asset-discovery-marginal-values">
              <div><MarginalMetricLabel label="CAGR Δ" metric="cagrDelta" /><strong>{row.cagr_delta == null ? '—' : percent(row.cagr_delta, 2)}</strong></div>
              <div><MarginalMetricLabel label="Sharpe Δ" metric="sharpeDelta" /><strong>{row.sharpe_delta == null ? '—' : number(row.sharpe_delta, 3)}</strong></div>
              <div><MarginalMetricLabel label="MaxDD Δ" metric="maxDdDelta" /><strong>{row.maximum_drawdown_delta == null ? '—' : percent(row.maximum_drawdown_delta, 2)}</strong></div>
              <div><MarginalMetricLabel label="Worst fold Δ" metric="worstFoldDelta" /><strong>{row.worst_fold_return_delta == null ? '—' : percent(row.worst_fold_return_delta, 2)}</strong></div>
            </div>
          </>}
        </article>
      })}
    </div> : <div className="asset-discovery-empty">{String(campaign?.status || '').toLowerCase() === 'completed'
      ? tr('No asset showed positive marginal contribution in this campaign.')
      : tr('Marginal results will appear after the ranked shortlist is ready.')}</div>}

    {(validationActive || validationMatches) ? <div className={`asset-discovery-full-validation ${validationPassed ? 'pass' : ''} ${validationFailed ? 'fail' : ''}`}>
      <div className="asset-discovery-full-validation-head">
        <div>
          <span className="eyebrow">{tr('SELECTED-UNIVERSE VALIDATION')}</span>
          <strong>{(validation.selected_assets || []).join(', ') || '—'}</strong>
          {validation.source_strategy_sequence ? <small>{tr('Strategy Research source')} · Strategy #{validation.source_strategy_sequence}</small> : null}
        </div>
        <span className={`asset-discovery-validation-decision ${validationPassed ? 'pass' : validationFailed ? 'fail' : ''}`}>
          {validationActive ? tr('RUNNING') : tr(String(validation.decision || validation.status || '').toUpperCase())}
        </span>
      </div>
      {validationActive ? <>
        <div className="asset-discovery-progress-copy"><span>{tr(validation.current_stage || 'Validating selection')}</span><strong>{number(validationProgress, 1)}%</strong></div>
        <div className="asset-discovery-progress"><span style={{ width: `${validationProgress}%` }} /></div>
      </> : null}
      {validationMatches && validationStatus === 'completed' ? <div className="asset-discovery-full-validation-grid">
        <div><span>{tr('Capital')}</span><strong>{validationDeltas.ending_capital_delta_rate == null ? '—' : percent(validationDeltas.ending_capital_delta_rate, 2)}</strong><small>{validationBaseline.ending_capital == null || validationCandidate.ending_capital == null ? '—' : `${money(validationBaseline.ending_capital)} → ${money(validationCandidate.ending_capital)}`}</small></div>
        <div><span>{tr('CAGR Δ')}</span><strong>{validationDeltas.cagr_delta == null ? '—' : percent(validationDeltas.cagr_delta, 2)}</strong></div>
        <div><span>{tr('Sharpe Δ')}</span><strong>{validationDeltas.sharpe_delta == null ? '—' : number(validationDeltas.sharpe_delta, 3)}</strong></div>
        <div><span>{tr('MaxDD Δ')}</span><strong>{validationDeltas.maximum_drawdown_delta == null ? '—' : percent(validationDeltas.maximum_drawdown_delta, 2)}</strong></div>
        <div><span>{tr('Worst fold Δ')}</span><strong>{validationDeltas.worst_fold_return_delta == null ? '—' : percent(validationDeltas.worst_fold_return_delta, 2)}</strong></div>
        <div><span>{tr('Severe months Δ')}</span><strong>{validationDeltas.severe_negative_months_delta == null ? '—' : number(validationDeltas.severe_negative_months_delta, 0)}</strong></div>
      </div> : null}
      {validationFailed ? <small className="asset-discovery-full-validation-note">{tr('Selected-universe validation failed because the selected set did not increase final Strategy capital or did not preserve complete historical context.')}</small> : null}
    </div> : null}
  </section>
}

function DetailModal({ item, evaluatedCount, onClose }) {
  if (!item) return null
  return <div className="asset-discovery-modal-backdrop" role="presentation" onMouseDown={onClose}>
    <div className="asset-discovery-modal" role="dialog" aria-modal="true" aria-label={`${item.symbol} ${tr('rank analysis')}`} onMouseDown={(event) => event.stopPropagation()}>
      <div className="asset-discovery-modal-header">
        <div>
          <span className="eyebrow">{tr('LEARNING-TO-RANK')}</span>
          <h3><AssetSymbolTooltip symbol={item.symbol} companyName={item.company_name}>{item.symbol}</AssetSymbolTooltip></h3>
        </div>
        <button type="button" className="icon-button" onClick={onClose} aria-label={tr('Close')}>×</button>
      </div>
      <div className="asset-discovery-detail-grid">
        <div><span>{tr('Discovery rank')}</span><strong>#{item?.discovery_selection?.rank || item.rank || '—'} / {item.evaluated_count || evaluatedCount || '—'}</strong></div>
        <div><span>{tr('Discovery score')}</span><strong>{number(item?.discovery_selection?.raw_score ?? item.raw_score, 4)}</strong></div>
                <div><span>{tr('Close at campaign snapshot')}</span><strong>{money(item.latest_close)}</strong></div>
        <div><span>{tr('20-session return at snapshot')}</span><strong>{percent(item.return_20, 2)}</strong></div>
        <div><span>{tr('60-session return at snapshot')}</span><strong>{percent(item.return_60, 2)}</strong></div>
        <div><span>{tr('20-session volatility at snapshot')}</span><strong>{percent(item.volatility_20, 2)}</strong></div>
        <div><span>{tr('60-session drawdown at snapshot')}</span><strong>{percent(item.drawdown_60, 2)}</strong></div>
        <div><span>{tr('Trend efficiency at snapshot')}</span><strong>{number(item.trend_efficiency_20, 3)}</strong></div>
        <div><span>{tr('Max baseline correlation at snapshot')}</span><strong>{item.max_baseline_correlation_60 == null ? '—' : number(item.max_baseline_correlation_60, 3)}</strong></div>
        <div><span>{tr('Median dollar volume at snapshot')}</span><strong>{money(item.median_dollar_volume)}</strong></div>
        {item.marginal_replay?.ending_capital_delta_rate != null ? <div><span>{tr('Marginal capital')}</span><strong>{percent(item.marginal_replay.ending_capital_delta_rate, 2)}</strong></div> : null}
        {item.marginal_replay?.candidate?.ending_capital != null ? <div><span>{tr('Capital with asset')}</span><strong>{money(item.marginal_replay.candidate.ending_capital)}</strong></div> : null}
      </div>
    </div>
  </div>
}

export function AssetDiscoveryPage({ capabilities = {}, onSessionExpired }) {
  const discovery = useAssetDiscovery({ onSessionExpired })
  const [researchSize, setResearchSize] = useState(64)
  const [selected, setSelected] = useState(null)
  const [selectedSymbols, setSelectedSymbols] = useState([])
  const campaign = discovery.campaign
  const catalogAssets = discovery.catalog?.assets || []
  const results = useMemo(() => (campaign?.results || []).filter(visibleDiscoveryResult), [campaign?.results])
  const orderedResults = useMemo(() => [...results].sort((left, right) => {
    const leftMarginalRank = marginalRankValue(left)
    const rightMarginalRank = marginalRankValue(right)
    if (leftMarginalRank != null && rightMarginalRank != null) return leftMarginalRank - rightMarginalRank
    if (leftMarginalRank != null) return -1
    if (rightMarginalRank != null) return 1
    return Number(left?.rank || 999) - Number(right?.rank || 999)
  }), [results])
  const currentCampaignSymbols = useMemo(() => normalizedSelection([
    ...(campaign?.results || []).filter(visibleDiscoveryResult).map((item) => item?.symbol),
    ...(campaign?.marginal_replay?.results || []).filter(marginalSelectable).map((item) => item?.symbol),
  ]), [campaign?.results, campaign?.marginal_replay?.results])
  const currentCampaignSymbolKey = currentCampaignSymbols.join('|')
  const canStart = hasCapability(capabilities, 'asset_discovery.start')
  const canStop = hasCapability(capabilities, 'asset_discovery.stop')
  const canExport = hasCapability(capabilities, 'asset_discovery.export')
  const canCreateStrategy = hasCapability(capabilities, 'asset_discovery.create_strategy')

  useEffect(() => {
    setSelectedSymbols([])
    setSelected(null)
  }, [campaign?.run_id])

  useEffect(() => {
    const allowed = new Set(currentCampaignSymbols)
    setSelectedSymbols((current) => {
      const next = current.filter((symbol) => allowed.has(String(symbol || '').trim().toUpperCase()))
      return next.length === current.length && next.every((symbol, index) => symbol === current[index]) ? current : next
    })
  }, [campaign?.run_id, currentCampaignSymbolKey])

  useEffect(() => {
    const validation = campaign?.full_strategy_validation || {}
    const status = String(validation.status || '').toLowerCase()
    if (!['queued', 'running'].includes(status)) return
    const activeSelection = normalizedSelection(validation.selected_assets).filter((symbol) => currentCampaignSymbols.includes(symbol))
    if (!activeSelection.length) return
    setSelectedSymbols((current) => {
      const normalizedCurrent = normalizedSelection(current)
      return normalizedCurrent.length === activeSelection.length && normalizedCurrent.every((symbol, index) => symbol === activeSelection[index])
        ? current
        : activeSelection
    })
  }, [campaign?.run_id, campaign?.full_strategy_validation?.validation_id, campaign?.full_strategy_validation?.status, currentCampaignSymbolKey])

  const progress = useMemo(() => {
    const requested = Number(campaign?.research_size || researchSize || 1)
    const attempted = Number(campaign?.attempted_count || 0)
    return Math.max(0, Math.min(100, (attempted / Math.max(1, requested)) * 100))
  }, [campaign?.attempted_count, campaign?.research_size, researchSize])

  const toggleSymbol = (symbol) => {
    const normalized = String(symbol || '').trim().toUpperCase()
    if (!currentCampaignSymbols.includes(normalized)) return
    setSelectedSymbols((current) => current.includes(normalized) ? current.filter((item) => item !== normalized) : [...current, normalized])
  }

  const selectedCurrentCampaignSymbols = selectedSymbols.filter((symbol) => currentCampaignSymbols.includes(String(symbol || '').trim().toUpperCase()))

  const validateStrategySelection = async () => {
    if (!selectedCurrentCampaignSymbols.length) return
    if (selectedCurrentCampaignSymbols.length !== selectedSymbols.length) setSelectedSymbols(selectedCurrentCampaignSymbols)
    await discovery.validateSelection(campaign?.run_id, selectedCurrentCampaignSymbols)
  }

  const addSelectedToResearchStrategy = async () => {
    if (!selectedCurrentCampaignSymbols.length) return
    if (selectedCurrentCampaignSymbols.length !== selectedSymbols.length) setSelectedSymbols(selectedCurrentCampaignSymbols)
    const updated = await discovery.appendToResearchStrategy(campaign?.run_id, selectedCurrentCampaignSymbols)
    if (updated) setSelectedSymbols([])
  }


  if (discovery.loading && !discovery.status) {
    return <section className="asset-discovery-page"><div className="page-loading">{tr('Loading Asset Discovery…')}</div></section>
  }

  const baseline = campaign?.baseline || discovery.status?.baseline || {}
  const winnerSource = campaign?.winner_source || {}
  const model = campaign?.discovery_selection_model || campaign?.model || {}
  const rejectionSummary = campaign?.rejection_summary || {}
  const historicalIntegrityRejects = Number(rejectionSummary.insufficient_history || 0)
    + Number(rejectionSummary.discontinuous_history || 0)
    + Number(rejectionSummary.ticker_identity_discontinuity || 0)
    + Number(rejectionSummary.research_context_incomplete || 0)

  const persistentCandidateCount = campaign?.marginal_replay?.persistent_candidate_count
    ?? results.filter((item) => marginalSelectable(item?.marginal_replay)).length

  return <section className="asset-discovery-page">
    <div className="asset-discovery-workspace">
      <header className="asset-discovery-header">
        <div className="asset-discovery-title-icon"><SearchIcon size={22} /></div>
        <div>
          <span className="eyebrow">{tr('ASSET RESEARCH')}</span>
          <h2>{tr('Asset Discovery')}</h2>
        </div>
        <div className="asset-discovery-mode"><span>{tr('Mode')}</span><strong>{tr('Manual')}</strong></div>
      </header>

      {discovery.error ? <div className="inline-error">{discovery.error}</div> : null}
      {discovery.notice ? <div className="inline-notice">{discovery.notice}</div> : null}

      <section className="asset-discovery-config">
        <div className="asset-discovery-baseline">
          <span>{tr('Strategy Research baseline')}</span>
          <strong>{baseline.strategy_sequence ? `Strategy #${baseline.strategy_sequence}` : tr('Selected Strategy Research')}</strong>
          <small>{baseline.asset_count ? tr('{count} assets', { count: baseline.asset_count }) : '—'}{baseline.market_snapshot_end ? ` · ${baseline.market_snapshot_end}` : ''}</small>
        </div>
        <label>
          <span>{tr('Assets to research')}</span>
          <input
            type="number"
            min="1"
            step="1"
            value={researchSize}
            disabled={discovery.active}
            onChange={(event) => setResearchSize(Math.max(1, Number(event.target.value) || 1))}
          />
        </label>
        <div className="asset-discovery-fixed-config"><span>{tr('Model')}</span><strong>Learning-to-Rank</strong><small>Ranking model</small></div>
        <div className="asset-discovery-fixed-config"><span>{tr('Scan parallelism')}</span><strong>{discovery.status?.scan_parallelism || campaign?.scan_parallelism || '—'}</strong><small>{tr('parallel jobs')}</small></div>
        <div className="asset-discovery-fixed-config"><span>{tr('Validation parallelism')}</span><strong>{discovery.status?.validation_parallelism || campaign?.validation_parallelism || '—'}</strong><small>{tr('parallel jobs')}</small></div>
        <div className="asset-discovery-actions">
          {!discovery.active ? <button type="button" className="primary-action" disabled={!canStart || discovery.busy === 'start'} onClick={() => discovery.start(researchSize)}>{discovery.busy === 'start' ? tr('Starting…') : tr('Start research')}</button> : null}
          {discovery.active ? <button type="button" className="secondary-action danger-soft" disabled={!canStop || discovery.busy === 'stop' || String(campaign?.status || '').toLowerCase() === 'stopping'} onClick={discovery.stop}>{discovery.busy === 'stop' || String(campaign?.status || '').toLowerCase() === 'stopping' ? tr('Stopping…') : tr('Stop')}</button> : null}
          <button type="button" className="secondary-action" disabled={!canExport || !campaign || discovery.busy === 'export'} onClick={discovery.exportAnalysis}>{tr('Export results')}</button>
        </div>
      </section>

      {campaign ? <>
        <section className="asset-discovery-run">
          <div className="asset-discovery-run-topline">
            <div><span>{tr('Campaign')}</span><strong>{campaign.run_id}</strong></div>
            <div><span>{tr('Status')}</span><strong>{tr(String(campaign.status || '').toUpperCase())}</strong></div>
            <div><span>{tr('Current batch')}</span><strong>{campaign.current_batch || '—'}</strong></div>
            <div><span>{tr('Validated in parallel')}</span><strong>{campaign?.marginal_replay?.completed_count ?? '—'} / {campaign?.marginal_replay?.total_count ?? '—'}</strong></div>
          </div>
          <ExecutionStatusBar campaign={campaign} />
          {String(campaign.status || '').toLowerCase() === 'failed' && campaign.message ? (
            <div className="inline-error asset-discovery-campaign-failure">
              <strong>{tr('Asset Discovery failed')}</strong>
              <span>{campaign.message}</span>
            </div>
          ) : null}
          {String(campaign.phase || '').toLowerCase() === 'scanning' ? <>
            <div className="asset-discovery-progress-copy asset-discovery-scan-progress-copy"><span>{tr('External scan')}</span><strong>{campaign.attempted_count || 0} / {campaign.scan_budget || campaign.research_size || researchSize}</strong></div>
            <div className="asset-discovery-progress"><span style={{ width: `${progress}%` }} /></div>
          </> : null}
          <Pipeline campaign={campaign} />
        </section>

        <CampaignOutcome campaign={campaign} results={orderedResults} catalogCount={catalogAssets.length} />
        <ResearchWindowPanel campaign={campaign} />

        <section className="asset-discovery-metrics">
          <div><span>{tr('Scanned')}</span><strong>{campaign.attempted_count || 0}</strong></div>
          <div><span>{tr('Evaluated')}</span><strong>{campaign.evaluated_count || 0}</strong></div>
          <div><span>{tr('Rejected')}</span><strong>{campaign.rejected_count || 0}</strong></div>
          <div><span>{tr('Technical failures')}</span><strong>{campaign.technical_failure_count || 0}</strong></div>
          <div><span>{tr('Ranked candidates')}</span><strong>{campaign.ranked_count ?? campaign.evaluated_count ?? '—'}</strong></div>
          <div><span>{tr('Positive-capital candidates')}</span><strong>{persistentCandidateCount}</strong></div>
          <div><span>{tr('Median NDCG@5')}</span><strong>{model.ndcg_at_5 == null ? '—' : number(model.ndcg_at_5, 3)}</strong></div>
        </section>

        <ValidationPanel model={model} />

        <MarginalReplayPanel
          campaign={campaign}
          selectedSymbols={selectedCurrentCampaignSymbols}
          toggleSymbol={toggleSymbol}
          canStart={canStart}
          canCreateStrategy={canCreateStrategy}
          busy={discovery.busy}
          onRunReplay={discovery.runMarginalReplay}
          onValidate={validateStrategySelection}
          onAddSelected={addSelectedToResearchStrategy}
          setSelectedSymbols={setSelectedSymbols}
          validationError={discovery.validationError}
          createError={discovery.createError}
          updatedResearchStrategy={discovery.updatedResearchStrategy}
          currentCampaignSymbols={currentCampaignSymbols}
          researchStrategySequence={baseline.strategy_sequence}
        />

        <section className="asset-discovery-results">
          <div className="asset-discovery-section-heading asset-discovery-result-heading">
            <div>
              <span className="eyebrow">{tr('FULL-HISTORY CANDIDATES')}</span>
              <h3>{tr('Candidates that increased final Strategy capital')}</h3>
              {winnerSource.strategy_sequence ? <small>{tr('Research Strategy source')}: Winner Strategy #{winnerSource.strategy_sequence}</small> : null}
            </div>
            <div className="asset-discovery-result-actions">
              {campaign.completed_at ? <span>{shortDateTime(campaign.completed_at)}</span> : null}
              <small>{tr('Every visible candidate passed complete-history integrity and increased final capital in the full Strategy replay.')}</small>
            </div>
          </div>
          {orderedResults.length ? <div className="asset-discovery-card-grid">
            {orderedResults.map((item) => {
              const marginalRank = marginalRankValue(item)
              const tone = marginalTone(item.marginal_replay)
              return <article className={`asset-discovery-result-card quality-${tone}`} key={item.symbol}>
                <div className="asset-discovery-result-head">
                  <div className="asset-discovery-quality-title">
                    <span className={`asset-discovery-quality-dot ${tone}`} aria-hidden="true" />
                    <strong><AssetSymbolTooltip symbol={item.symbol} companyName={item.company_name}>#{marginalRank || item?.discovery_selection?.rank || item.rank} · {item.symbol}</AssetSymbolTooltip></strong>
                  </div>
                  <span>{marginalRank ? `${tr('Marginal')} #${marginalRank}` : tr('ML screening')}</span>
                </div>
                <div className="asset-discovery-rank-meta">
                  <span>{tr('Discovery rank')} <strong>#{item?.discovery_selection?.rank || '—'} / {campaign.ranked_count || campaign.evaluated_count || '—'}</strong></span>
                  {marginalRank ? <span>{tr('Full-history contribution rank')} <strong>#{marginalRank}</strong></span> : null}
                  <span>{tr('Discovery score')} <strong>{item?.discovery_selection?.raw_score == null ? '—' : number(item.discovery_selection.raw_score, 4)}</strong></span>
                </div>
                <div className="asset-discovery-result-values">
                  <div><span>{tr('20d return at snapshot')}</span><strong>{percent(item.return_20, 2)}</strong></div>
                  <div><span>{tr('20d volatility at snapshot')}</span><strong>{percent(item.volatility_20, 2)}</strong></div>
                  <div><span>{tr('60d drawdown at snapshot')}</span><strong>{percent(item.drawdown_60, 2)}</strong></div>
                  <div><span>{tr('Max correlation at snapshot')}</span><strong>{item.max_baseline_correlation_60 == null ? '—' : number(item.max_baseline_correlation_60, 2)}</strong></div>
                </div>
                <button type="button" className="secondary-action" onClick={() => setSelected(item)}>{tr('View analysis')}</button>
              </article>
            })}
          </div> : <div className="asset-discovery-empty">{String(campaign?.status || '').toLowerCase() === 'completed'
            ? tr('No candidate with complete historical coverage increased final Strategy capital.')
            : (discovery.active ? tr('Results will appear after ranked assets are available.') : tr('No ranked shortlist is available yet.'))}</div>}
        </section>

        <section className="asset-discovery-storage-summary">
          <div><span>{tr('Historical integrity')}</span><strong>{historicalIntegrityRejects}</strong></div>
        </section>
      </> : <div className="asset-discovery-empty large">{tr('Choose the research size and start a manual campaign.')}</div>}

      <section className="asset-discovery-catalog">
        <div className="asset-discovery-section-heading asset-discovery-result-heading">
          <div>
            <span className="eyebrow">{tr('ASSET DISCOVERY CATALOG')}</span>
            <h3>{tr('Full-history positive-capital candidates')}</h3>
            <small>{tr('This catalog contains only candidates that passed complete-history integrity and increased final Strategy capital in a full-period replay.')}</small>
          </div>
          <div className="asset-discovery-result-actions">
            <span>{tr('{count} catalog assets', { count: catalogAssets.length })}</span>
            <small>{tr('Catalog entries are historical references. Adding assets to the Research Strategy requires a fresh full-history replay in the current campaign.')}</small>
          </div>
        </div>
        {catalogAssets.length ? <div className="asset-discovery-catalog-grid">
          {catalogAssets.map((item) => {
            const metrics = item.latest_metrics || {}
            const detail = {
              symbol: item.symbol,
              rank: item.latest_rank,
              raw_score: item.latest_model_score,
              company_name: item.company_name,
              exchange: item.exchange,
              evaluated_count: item.latest_evaluated_count,
              ...metrics,
            }
            return <article className="asset-discovery-catalog-card" key={item.symbol}>
              <div className="asset-discovery-result-head">
                <div className="asset-discovery-catalog-title">
                  <strong><AssetSymbolTooltip symbol={item.symbol} companyName={item.company_name}>{item.symbol}</AssetSymbolTooltip></strong>
                  {String(item.latest_run_id || '') === String(campaign?.run_id || '') ? <span className="asset-discovery-current-run-badge">{tr('This campaign')}</span> : null}
                </div>

              </div>
              <div className="asset-discovery-catalog-meta">
                <span>{tr('Found')} <strong>{item.times_discovered || 1}×</strong></span>
                <span>{tr('Best rank')} <strong>#{item.best_rank || '—'}</strong></span>
                <span>{tr('Latest rank')} <strong>#{item.latest_rank || '—'}</strong></span>
                <span>{tr('Last seen')} <strong>{item.last_seen_at ? shortDateTime(item.last_seen_at) : '—'}</strong></span>
              </div>
              <div className="asset-discovery-result-values">
                <div><span>{tr('20d return at snapshot')}</span><strong>{metrics.return_20 == null ? '—' : percent(metrics.return_20, 2)}</strong></div>
                <div><span>{tr('60-session return at snapshot')}</span><strong>{metrics.return_60 == null ? '—' : percent(metrics.return_60, 2)}</strong></div>
                <div><span>{tr('60d drawdown at snapshot')}</span><strong>{metrics.drawdown_60 == null ? '—' : percent(metrics.drawdown_60, 2)}</strong></div>
                <div><span>{tr('Max correlation at snapshot')}</span><strong>{metrics.max_baseline_correlation_60 == null ? '—' : number(metrics.max_baseline_correlation_60, 2)}</strong></div>
                <div><span>{tr('Marginal capital')}</span><strong>{metrics.marginal_replay?.ending_capital_delta_rate == null ? '—' : percent(metrics.marginal_replay.ending_capital_delta_rate, 2)}</strong></div>
              </div>
              <div className="asset-discovery-catalog-actions">
                <button type="button" className="secondary-action" onClick={() => setSelected(detail)}>{tr('View analysis')}</button>
                {item.strategy_created_count ? <span>{tr('{count} Strategies created', { count: item.strategy_created_count })}</span> : null}
              </div>
            </article>
          })}
        </div> : <div className="asset-discovery-empty">{tr('No persistent discoveries yet. Complete a research campaign to populate the catalog.')}</div>}
      </section>
    </div>
    <DetailModal item={selected} evaluatedCount={campaign?.evaluated_count} onClose={() => setSelected(null)} />
  </section>
}
