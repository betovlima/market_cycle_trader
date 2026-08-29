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
  ['causal_selection', 'Causal temporal selection'],
  ['marginal_replay', 'Causal validation replay'],
  ['completed', 'Validation candidates'],
  ['full_strategy_validation', 'Final Strategy certification'],
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
  if (String(replay.validation_method || '') !== 'causal_temporal_validation') return false
  if (!replay.selection_precedes_evaluation) return false
  if (replay.research_context_compatible === false) return false
  const delta = Number(replay.ending_capital_delta_rate)
  return Number.isFinite(delta) && delta > 0
}

function visibleDiscoveryResult(item) {
  if (!item || item.history_window_complete === false) return false
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
  if (step === 'causal_refit') return tr('Refitting historical causal-selection model')
  if (step === 'external_scan') {
    const label = tr('Scanning external assets')
    return Number.isFinite(current) && Number.isFinite(total) && total > 0
      ? `${label} · ${current}/${total}`
      : label
  }
  if (step === 'adherence_validation') return tr('Validating causal shortlist history')
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
        ? tr('{count} assets increased capital in the validation period', { count: retained })
        : tr('No asset increased capital in the validation period')}</h3>
      <p>{found
        ? tr('These assets were selected before the reserved periods and increased capital in the validation slice. They are only candidates until the separate final certification is passed.')
        : tr('The campaign completed successfully, but no historically selected asset increased final capital in the causal validation slice.')}</p>
      {best && Number.isFinite(bestDelta) ? <div className="asset-discovery-campaign-best">
        <span>{tr('Best result this campaign')}</span>
        <strong>{best.symbol} · {percent(bestDelta, 2)} {tr('marginal capital')}</strong>
      </div> : null}
    </div>
    <div className="asset-discovery-campaign-funnel" aria-label={tr('Campaign funnel')}>
      <div><span>{tr('Scanned')}</span><strong>{scanned}</strong></div>
      <div><span>{tr('Evaluated')}</span><strong>{evaluated}</strong></div>
      <div><span>{tr('Validation replays')}</span><strong>{replayed}</strong></div>
      <div className={found ? 'positive' : ''}><span>{tr('Adherent this campaign')}</span><strong>{retained}</strong></div>
      <div><span>{tr('Historical catalog')}</span><strong>{catalogCount}</strong></div>
    </div>
    <small className="asset-discovery-campaign-outcome-note">{tr('The historical catalog below may contain assets retained by previous campaigns; it is not the result count of the current campaign.')}</small>
  </section>
}

function CausalValidationPanel({ campaign }) {
  const causal = campaign?.causal_validation || {}
  if (!causal?.selection_cutoff || !causal?.validation_start || !causal?.validation_end || !causal?.certification_start || !causal?.certification_end) return null
  const certificationAvailable = causal.certification_available !== false
  return <section className="asset-discovery-causal-validation">
    <div>
      <span>{tr('Historical selection cutoff')}</span>
      <strong>{causal.selection_cutoff}</strong>
      <small>{tr('Candidate ranking is frozen using only data available up to this date.')}</small>
    </div>
    <div>
      <span>{tr('Candidate validation period')}</span>
      <strong>{causal.validation_start} → {causal.validation_end}</strong>
      <small>{tr('{count} trading sessions used to screen the frozen causal candidates.', { count: causal.validation_sessions || '—' })}</small>
    </div>
    <div className={certificationAvailable ? 'asset-discovery-causal-rule' : 'asset-discovery-causal-rule blocked'}>
      <span>{tr('Final certification period')}</span>
      <strong>{causal.certification_start} → {causal.certification_end}</strong>
      <small>{certificationAvailable
        ? tr('{count} later trading sessions remain reserved for Full Strategy certification and are not used to choose candidates.', { count: causal.certification_sessions || '—' })
        : tr('This certification slice overlaps a period already consumed by a previous certification and cannot be reused for another promotion.')}</small>
    </div>
    <div>
      <span>{tr('Promotion rule')}</span>
      <strong>{tr('Validation can select; certification can only confirm')}</strong>
      <small>{tr('A candidate may advance after the validation slice, but Strategy creation requires PASS in the later non-overlapping certification slice.')}</small>
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
  onCreate,
  validationError,
  createError,
  createdStrategy,
}) {
  const replay = campaign?.marginal_replay || {}
  const validation = campaign?.full_strategy_validation || {}
  const certificationAvailable = campaign?.causal_validation?.certification_available !== false
  const rows = [...(replay.results || [])].filter(marginalSelectable).sort((left, right) => {
    const leftRank = Number(left?.marginal_rank || 999)
    const rightRank = Number(right?.marginal_rank || 999)
    return leftRank - rightRank
  })
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
        <span className="eyebrow">{tr('CAUSAL VALIDATION REPLAY')}</span>
        <h3>{tr('Economic contribution in the validation period')}</h3>
        <small>{tr('The asset is selected before the reserved periods. This replay uses only the validation slice to decide which candidates may advance; final Strategy certification uses a later separate slice.')}</small>
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
        <button
          type="button"
          className="secondary-action"
          disabled={!canCreateStrategy || !selectedSymbols.length || !certificationAvailable || validationActive || busy === 'full-strategy-validation'}
          onClick={onValidate}
        >
          {validationActive || busy === 'full-strategy-validation' ? tr('Certifying selection…') : tr('Run final certification')}
        </button>
        <button
          type="button"
          className="primary-action"
          disabled={!canCreateStrategy || !selectedSymbols.length || !validationPassed || busy === 'create-strategy'}
          onClick={onCreate}
        >
          {busy === 'create-strategy' ? tr('Creating Strategy…') : tr('Create Research Strategy')}
        </button>
        <small>{tr('{count} selected', { count: selectedSymbols.length })}</small>
        {!certificationAvailable ? <small className="asset-discovery-create-feedback error">{tr('Final certification is unavailable because this period overlaps data already consumed by an earlier certification.')}</small> : null}
        {validationError ? <small className="asset-discovery-create-feedback error">{validationError}</small> : null}
        {createError ? <small className="asset-discovery-create-feedback error">{createError}</small> : null}
        {createdStrategy?.strategy?.strategy_sequence ? <small className="asset-discovery-create-feedback success">{tr('Strategy #{sequence} created · {count} assets', { sequence: createdStrategy.strategy.strategy_sequence, count: createdStrategy.asset_count || '—' })}</small> : null}
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
    {rows.length ? <div className="asset-discovery-marginal-grid">
      {rows.map((row) => {
        const result = (campaign?.results || []).find((item) => item.symbol === row.symbol) || {}
        const selectable = marginalSelectable(row)
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
              <small className="asset-discovery-rank-line"><span>{tr('Causal rank')}</span><strong>#{result?.causal_selection?.rank || result.rank || '—'}</strong></small>
            </div>
            {selectable ? <label className="asset-discovery-select-asset">
              <input type="checkbox" checked={checked} onChange={() => toggleSymbol(row.symbol)} />
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
          <span className="eyebrow">{tr('FINAL STRATEGY CERTIFICATION')}</span>
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
      {validationFailed ? <small className="asset-discovery-full-validation-note">{tr('Certification rejected. The Research Strategy cannot be created from this result.')}</small> : null}
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
        <div><span>{tr('Causal rank')}</span><strong>#{item?.causal_selection?.rank || item.rank || '—'} / {item.evaluated_count || evaluatedCount || '—'}</strong></div>
        <div><span>{tr('Causal score')}</span><strong>{number(item?.causal_selection?.raw_score ?? item.raw_score, 4)}</strong></div>
        <div><span>{tr('Historical selection cutoff')}</span><strong>{item?.causal_selection?.selection_cutoff || '—'}</strong></div>
        <div><span>{tr('Close at historical cutoff')}</span><strong>{money(item.latest_close)}</strong></div>
        <div><span>{tr('20-session return at cutoff')}</span><strong>{percent(item.return_20, 2)}</strong></div>
        <div><span>{tr('60-session return at cutoff')}</span><strong>{percent(item.return_60, 2)}</strong></div>
        <div><span>{tr('20-session volatility at cutoff')}</span><strong>{percent(item.volatility_20, 2)}</strong></div>
        <div><span>{tr('60-session drawdown at cutoff')}</span><strong>{percent(item.drawdown_60, 2)}</strong></div>
        <div><span>{tr('Trend efficiency at cutoff')}</span><strong>{number(item.trend_efficiency_20, 3)}</strong></div>
        <div><span>{tr('Max baseline correlation at cutoff')}</span><strong>{item.max_baseline_correlation_60 == null ? '—' : number(item.max_baseline_correlation_60, 3)}</strong></div>
        <div><span>{tr('Median dollar volume at cutoff')}</span><strong>{money(item.median_dollar_volume)}</strong></div>
        {item.marginal_replay?.ending_capital_delta_rate != null ? <div><span>{tr('Marginal capital')}</span><strong>{percent(item.marginal_replay.ending_capital_delta_rate, 2)}</strong></div> : null}
        {item.marginal_replay?.candidate?.ending_capital != null ? <div><span>{tr('Capital with asset')}</span><strong>{money(item.marginal_replay.candidate.ending_capital)}</strong></div> : null}
      </div>
    </div>
  </div>
}

export function AssetDiscoveryPage({ capabilities = {}, onSessionExpired }) {
  const discovery = useAssetDiscovery({ onSessionExpired })
  const [researchSize, setResearchSize] = useState(24)
  const [selected, setSelected] = useState(null)
  const [selectedSymbols, setSelectedSymbols] = useState([])
  const campaign = discovery.campaign
  const catalogAssets = discovery.catalog?.assets || []
  const options = discovery.status?.research_size_options || [8, 16, 24, 32, 40, 48, 56, 64]
  const results = useMemo(() => (campaign?.results || []).filter(visibleDiscoveryResult), [campaign?.results])
  const orderedResults = useMemo(() => [...results].sort((left, right) => {
    const leftMarginalRank = marginalRankValue(left)
    const rightMarginalRank = marginalRankValue(right)
    if (leftMarginalRank != null && rightMarginalRank != null) return leftMarginalRank - rightMarginalRank
    if (leftMarginalRank != null) return -1
    if (rightMarginalRank != null) return 1
    return Number(left?.rank || 999) - Number(right?.rank || 999)
  }), [results])
  const canStart = hasCapability(capabilities, 'asset_discovery.start')
  const canStop = hasCapability(capabilities, 'asset_discovery.stop')
  const canExport = hasCapability(capabilities, 'asset_discovery.export')
  const canCreateStrategy = hasCapability(capabilities, 'asset_discovery.create_strategy')

  useEffect(() => {
    setSelectedSymbols([])
    setSelected(null)
  }, [campaign?.run_id])

  const progress = useMemo(() => {
    const requested = Number(campaign?.research_size || researchSize || 1)
    const attempted = Number(campaign?.attempted_count || 0)
    return Math.max(0, Math.min(100, (attempted / Math.max(1, requested)) * 100))
  }, [campaign?.attempted_count, campaign?.research_size, researchSize])

  const toggleSymbol = (symbol) => {
    setSelectedSymbols((current) => current.includes(symbol) ? current.filter((item) => item !== symbol) : [...current, symbol])
  }

  const validateStrategySelection = async () => {
    await discovery.validateSelection(campaign?.run_id, selectedSymbols)
  }

  const createStrategy = async () => {
    const created = await discovery.createStrategy(campaign?.run_id, selectedSymbols)
    if (created) setSelectedSymbols([])
  }




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
          <span>{tr('Scan limit')}</span>
          <select value={researchSize} disabled={discovery.active} onChange={(event) => setResearchSize(Number(event.target.value))}>
            {options.map((value) => <option key={value} value={value}>{value}</option>)}
          </select>
        </label>
        <div className="asset-discovery-fixed-config"><span>{tr('Model')}</span><strong>Learning-to-Rank</strong><small>Ranking model</small></div>
        <div className="asset-discovery-fixed-config"><span>{tr('Batch')}</span><strong>{discovery.status?.batch_size || 8}</strong><small>{tr('assets')}</small></div>
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
            <div><span>{tr('Current asset')}</span><strong>{campaign.current_symbol || '—'}</strong></div>
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
        <CausalValidationPanel campaign={campaign} />

        <section className="asset-discovery-metrics">
          <div><span>{tr('Scanned')}</span><strong>{campaign.attempted_count || 0}</strong></div>
          <div><span>{tr('Evaluated')}</span><strong>{campaign.evaluated_count || 0}</strong></div>
          <div><span>{tr('Rejected')}</span><strong>{campaign.rejected_count || 0}</strong></div>
          <div><span>{tr('Technical failures')}</span><strong>{campaign.technical_failure_count || 0}</strong></div>
          <div><span>{tr('Causally ranked')}</span><strong>{campaign.causal_ranked_count ?? '—'}</strong></div>
          <div><span>{tr('Validation candidates')}</span><strong>{persistentCandidateCount}</strong></div>
          <div><span>{tr('Median NDCG@5')}</span><strong>{model.ndcg_at_5 == null ? '—' : number(model.ndcg_at_5, 3)}</strong></div>
        </section>

        <ValidationPanel model={model} />

        <MarginalReplayPanel
          campaign={campaign}
          selectedSymbols={selectedSymbols}
          toggleSymbol={toggleSymbol}
          canStart={canStart}
          canCreateStrategy={canCreateStrategy}
          busy={discovery.busy}
          onRunReplay={discovery.runMarginalReplay}
          onValidate={validateStrategySelection}
          onCreate={createStrategy}
          validationError={discovery.validationError}
          createError={discovery.createError}
          createdStrategy={discovery.createdStrategy}
        />

        <section className="asset-discovery-results">
          <div className="asset-discovery-section-heading asset-discovery-result-heading">
            <div>
              <span className="eyebrow">{tr('CAUSAL VALIDATION CANDIDATES')}</span>
              <h3>{tr('Causal validation candidates')}</h3>
              {winnerSource.strategy_sequence ? <small>{tr('Research Strategy source')}: Winner Strategy #{winnerSource.strategy_sequence}</small> : null}
            </div>
            <div className="asset-discovery-result-actions">
              {campaign.completed_at ? <span>{shortDateTime(campaign.completed_at)}</span> : null}
              <small>{tr('Candidate ranking uses only pre-holdout history. Validation and final certification are chronologically separated.')}</small>
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
                    <strong><AssetSymbolTooltip symbol={item.symbol} companyName={item.company_name}>#{marginalRank || item?.causal_selection?.rank || item.rank} · {item.symbol}</AssetSymbolTooltip></strong>
                  </div>
                  <span>{marginalRank ? `${tr('Marginal')} #${marginalRank}` : tr('ML screening')}</span>
                </div>
                <div className="asset-discovery-rank-meta">
                  <span>{tr('Causal rank')} <strong>#{item?.causal_selection?.rank || '—'} / {campaign.causal_ranked_count || '—'}</strong></span>
                  {marginalRank ? <span>{tr('Validation contribution rank')} <strong>#{marginalRank}</strong></span> : null}
                  <span>{tr('Causal score')} <strong>{item?.causal_selection?.raw_score == null ? '—' : number(item.causal_selection.raw_score, 4)}</strong></span>
                </div>
                <div className="asset-discovery-result-values">
                  <div><span>{tr('20d return at cutoff')}</span><strong>{percent(item.return_20, 2)}</strong></div>
                  <div><span>{tr('20d volatility at cutoff')}</span><strong>{percent(item.volatility_20, 2)}</strong></div>
                  <div><span>{tr('60d drawdown at cutoff')}</span><strong>{percent(item.drawdown_60, 2)}</strong></div>
                  <div><span>{tr('Max correlation at cutoff')}</span><strong>{item.max_baseline_correlation_60 == null ? '—' : number(item.max_baseline_correlation_60, 2)}</strong></div>
                </div>
                <button type="button" className="secondary-action" onClick={() => setSelected(item)}>{tr('View analysis')}</button>
              </article>
            })}
          </div> : <div className="asset-discovery-empty">{String(campaign?.status || '').toLowerCase() === 'completed'
            ? tr('No asset remained eligible after causal selection and the validation slice.')
            : (discovery.active ? tr('Results will appear after ranked assets are available.') : tr('No ranked shortlist is available yet.'))}</div>}
        </section>

        <section className="asset-discovery-storage-summary">
          <div><span>{tr('Price filter')}</span><strong>{rejectionSummary.price_filter || 0}</strong></div>
          <div><span>{tr('Liquidity filter')}</span><strong>{rejectionSummary.liquidity_filter || 0}</strong></div>
          <div><span>{tr('Historical integrity')}</span><strong>{historicalIntegrityRejects}</strong></div>
          <div><span>{tr('Volume quality')}</span><strong>{rejectionSummary.volume_quality_filter || 0}</strong></div>
        </section>
      </> : <div className="asset-discovery-empty large">{tr('Choose the research size and start a manual campaign.')}</div>}

      <section className="asset-discovery-catalog">
        <div className="asset-discovery-section-heading asset-discovery-result-heading">
          <div>
            <span className="eyebrow">{tr('CAUSAL DISCOVERY CATALOG')}</span>
            <h3>{tr('Historical validation candidates')}</h3>
            <small>{tr('This catalog contains candidates that passed causal selection and the separate validation slice. Strategy creation still requires final certification on later non-overlapping data.')}</small>
          </div>
          <div className="asset-discovery-result-actions">
            <span>{tr('{count} catalog assets', { count: catalogAssets.length })}</span>
            <small>{tr('Catalog entries are historical references. Final certification and Strategy creation are available only from the current causal campaign.')}</small>
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
                <div><span>{tr('20d return at cutoff')}</span><strong>{metrics.return_20 == null ? '—' : percent(metrics.return_20, 2)}</strong></div>
                <div><span>{tr('60-session return at cutoff')}</span><strong>{metrics.return_60 == null ? '—' : percent(metrics.return_60, 2)}</strong></div>
                <div><span>{tr('60d drawdown at cutoff')}</span><strong>{metrics.drawdown_60 == null ? '—' : percent(metrics.drawdown_60, 2)}</strong></div>
                <div><span>{tr('Max correlation at cutoff')}</span><strong>{metrics.max_baseline_correlation_60 == null ? '—' : number(metrics.max_baseline_correlation_60, 2)}</strong></div>
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
