import { useEffect, useMemo, useState } from 'react'

import { hasCapability } from '../../auth/capabilities'
import { tr } from '../../i18n/runtime'
import { money, number, percent, shortDateTime } from '../../shared/formatters'
import { SearchIcon } from '../../shared/components/Icons'
import { AssetSymbolTooltip } from './AssetSymbolTooltip'
import { useAssetDiscovery } from './useAssetDiscovery'
import './assetDiscovery.css'

const PHASES = [
  ['baseline', 'Strategy baseline'],
  ['training_ranker', 'Learning-to-Rank'],
  ['scanning', 'External scan'],
  ['predictive_selection', 'Predictive selection'],
  ['full_strategy_validation', 'Selected-universe validation'],
]

function normalizedSelection(values) {
  return [...new Set((values || []).map((value) => String(value || '').trim().toUpperCase()).filter(Boolean))].sort()
}

function validationMatchesSelection(validation, selectedSymbols) {
  const left = normalizedSelection(validation?.selected_assets)
  const right = normalizedSelection(selectedSymbols)
  return left.length > 0 && left.length === right.length && left.every((value, index) => value === right[index])
}

function predictiveCandidate(item) {
  if (!item || typeof item !== 'object') return false
  const selection = item.discovery_selection || {}
  const score = Number(selection.raw_score ?? item.raw_score)
  return selection.available === true && Number.isFinite(score)
}

function discoveryRank(item) {
  const value = Number(item?.discovery_selection?.rank ?? item?.rank)
  return Number.isFinite(value) && value > 0 ? value : 999999
}

function executionStageLabel(campaign) {
  const step = String(campaign?.progress_step || '').toLowerCase()
  const current = Number(campaign?.stage_current)
  const total = Number(campaign?.stage_total)
  if (step === 'queued') return tr('Asset Discovery queued')
  if (step === 'baseline') return tr('Strategy baseline')
  if (step === 'baseline_sync') return tr('Synchronizing market data')
  if (step === 'training_dataset') return tr('Preparing Learning-to-Rank training dataset')
  if (step === 'walk_forward') {
    const label = tr('Purged walk-forward validation')
    return Number.isFinite(current) && Number.isFinite(total) && total > 0
      ? `${label} · ${tr('Fold')} ${current}/${total}`
      : label
  }
  if (step === 'final_refit') return tr('Refitting final Learning-to-Rank model')
  if (step === 'ranker_completed') return tr('Learning-to-Rank training completed')
  if (step === 'external_scan') {
    const label = tr('Scanning external assets')
    return Number.isFinite(current) && Number.isFinite(total) && total > 0
      ? `${label} · ${current}/${total}`
      : label
  }
  if (step === 'predictive_selection') return tr('Finalizing predictive candidates')
  if (step === 'marginal_replay') return tr('Marginal Capital Replay')
  if (step === 'completed') return tr('Asset Discovery completed')
  if (step === 'stopped') return tr('STOPPED')
  if (step === 'failed') return tr('FAILED')
  return tr('Processing')
}

function phaseIndex(campaign) {
  const status = String(campaign?.status || '').toLowerCase()
  const validationStatus = String(campaign?.full_strategy_validation?.status || '').toLowerCase()
  if (['queued', 'running'].includes(validationStatus)) return PHASES.length - 1
  if (status === 'completed') return PHASES.length - 1
  const phase = String(campaign?.phase || '').toLowerCase()
  const index = PHASES.findIndex(([id]) => id === phase)
  return index < 0 ? 0 : index
}

function Pipeline({ campaign }) {
  const current = phaseIndex(campaign)
  const status = String(campaign?.status || '').toLowerCase()
  return <div className="asset-discovery-pipeline" aria-label={tr('Research pipeline')}>
    {PHASES.map(([id, label], index) => {
      const complete = index < current || (status === 'completed' && index < PHASES.length - 1)
      const active = index === current && status !== 'completed'
      return <div className={`asset-discovery-stage ${complete ? 'complete' : ''} ${active ? 'active' : ''}`} key={id}>
        <span className="asset-discovery-stage-dot">{complete ? '✓' : active ? '⚙' : '○'}</span>
        <strong>{tr(label)}</strong>
      </div>
    })}
  </div>
}

function ExecutionStatusBar({ campaign }) {
  const status = String(campaign?.status || '').toLowerCase()
  const active = ['queued', 'running', 'stopping'].includes(status)
  const rawProgress = campaign?.stage_progress_percent
  const numericProgress = Number(rawProgress)
  const determinate = rawProgress != null && Number.isFinite(numericProgress)
  const progress = determinate ? Math.max(0, Math.min(100, numericProgress)) : 0
  const workerActive = active && Boolean(campaign?.worker_active)
  return <div className={`asset-discovery-execution-status ${active ? 'active' : ''}`}>
    <div className="asset-discovery-execution-head">
      <div><span>{tr('Current stage')}</span><strong>{executionStageLabel(campaign)}</strong></div>
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
      <span>{tr('Last activity')}: <strong>{campaign?.worker_heartbeat_at ? shortDateTime(campaign.worker_heartbeat_at) : '—'}</strong></span>
    </div>
  </div>
}

function ModelValidation({ model }) {
  const summary = model?.validation_summary || {}
  const folds = model?.validation_folds || []
  if (!folds.length) return null
  return <section className="asset-discovery-validation">
    <div className="asset-discovery-section-heading">
      <div><span className="eyebrow">{tr('MODEL VALIDATION')}</span><h3>{tr('Chronological ranking validation')}</h3></div>
      <span>{tr('{count} chronological folds', { count: folds.length })}</span>
    </div>
    <div className="asset-discovery-validation-summary">
      <div><span>{tr('Median NDCG@5')}</span><strong>{summary.ranker_median_ndcg_at_5 == null ? '—' : number(summary.ranker_median_ndcg_at_5, 3)}</strong></div>
      <div><span>{tr('Momentum median NDCG@5')}</span><strong>{summary.momentum_median_ndcg_at_5 == null ? '—' : number(summary.momentum_median_ndcg_at_5, 3)}</strong></div>
      <div><span>{tr('Random median NDCG@5')}</span><strong>{summary.random_median_ndcg_at_5 == null ? '—' : number(summary.random_median_ndcg_at_5, 3)}</strong></div>
      <div><span>{tr('Wins vs momentum')}</span><strong>{summary.win_rate_vs_momentum == null ? '—' : percent(summary.win_rate_vs_momentum, 0)}</strong></div>
    </div>
    <div className="asset-discovery-fold-grid">
      {folds.map((fold) => <article className={`asset-discovery-fold ${fold.beats_momentum ? 'winner' : ''}`} key={fold.fold}>
        <div className="asset-discovery-fold-head"><strong>{tr('Fold')} {fold.fold}</strong><span>{fold.validation_start} → {fold.validation_end}</span></div>
        <div className="asset-discovery-result-values">
          <div><span>{tr('Ranker NDCG@5')}</span><strong>{fold.ranker_ndcg_at_5 == null ? '—' : number(fold.ranker_ndcg_at_5, 3)}</strong></div>
          <div><span>{tr('Momentum NDCG@5')}</span><strong>{fold.momentum_ndcg_at_5 == null ? '—' : number(fold.momentum_ndcg_at_5, 3)}</strong></div>
        </div>
      </article>)}
    </div>
  </section>
}

function CandidateDetail({ item, onClose }) {
  if (!item) return null
  const novelty = Number(item.state_novelty_score)
  const similarity = Number(item.state_max_similarity)
  const replay = item.marginal_replay || {}
  return <div className="asset-discovery-modal-backdrop" role="presentation" onMouseDown={onClose}>
    <div className="asset-discovery-modal" role="dialog" aria-modal="true" onMouseDown={(event) => event.stopPropagation()}>
      <div className="asset-discovery-modal-header">
        <div><span className="eyebrow">{tr('State novelty study')}</span><h3><AssetSymbolTooltip symbol={item.symbol} companyName={item.company_name}>{item.symbol}</AssetSymbolTooltip></h3></div>
        <button type="button" className="icon-button" onClick={onClose} aria-label={tr('Close')}>×</button>
      </div>
      <div className="asset-discovery-detail-grid">
        <div><span>{tr('Predictive rank')}</span><strong>#{discoveryRank(item)}</strong></div>
        <div><span>{tr('Predictive score')}</span><strong>{number(item?.discovery_selection?.raw_score ?? item.raw_score, 4)}</strong></div>
        <div><span>{tr('State novelty')}</span><strong>{Number.isFinite(novelty) ? percent(novelty, 1) : '—'}</strong></div>
        <div><span>{tr('State similarity')}</span><strong>{Number.isFinite(similarity) ? percent(similarity, 1) : '—'}</strong></div>
        <div><span>{tr('Nearest baseline state')}</span><strong>{item.state_nearest_baseline_symbol || '—'}</strong></div>
        <div><span>{tr('20-session return at snapshot')}</span><strong>{item.return_20 == null ? '—' : percent(item.return_20, 2)}</strong></div>
        <div><span>{tr('60-session return at snapshot')}</span><strong>{item.return_60 == null ? '—' : percent(item.return_60, 2)}</strong></div>
        <div><span>{tr('20-session volatility at snapshot')}</span><strong>{item.volatility_20 == null ? '—' : percent(item.volatility_20, 2)}</strong></div>
        <div><span>{tr('60-session drawdown at snapshot')}</span><strong>{item.drawdown_60 == null ? '—' : percent(item.drawdown_60, 2)}</strong></div>
        <div><span>{tr('Max baseline correlation at snapshot')}</span><strong>{item.max_baseline_correlation_60 == null ? '—' : number(item.max_baseline_correlation_60, 3)}</strong></div>
        {replay.ending_capital_delta_rate != null ? <div><span>{tr('Capital Δ')}</span><strong>{percent(replay.ending_capital_delta_rate, 2)}</strong></div> : null}
      </div>
      <small>{tr('State novelty measures how different the candidate model leaf pattern is from the current Strategy assets at the campaign snapshot.')}</small>
    </div>
  </div>
}

function FullStrategyValidation({ campaign, selectedSymbols, validationPassed, validationFailed }) {
  const validation = campaign?.full_strategy_validation || {}
  const status = String(validation.status || '').toLowerCase()
  if (!['queued', 'running', 'completed', 'failed', 'interrupted'].includes(status)) return null
  const deltas = validation.deltas || {}
  const baseline = validation.baseline || {}
  const candidate = validation.candidate || {}
  const progress = Math.max(0, Math.min(100, Number(validation.progress_percent || 0)))
  return <div className={`asset-discovery-full-validation ${validationPassed ? 'pass' : ''} ${validationFailed ? 'fail' : ''}`}>
    <div className="asset-discovery-full-validation-head">
      <div><span className="eyebrow">{tr('Selected-universe validation')}</span><strong>{(validation.selected_assets || selectedSymbols || []).join(', ') || '—'}</strong></div>
      <span className={`asset-discovery-validation-decision ${validationPassed ? 'pass' : validationFailed ? 'fail' : ''}`}>{['queued', 'running'].includes(status) ? tr('Validation running') : tr(String(validation.decision || validation.status || '').toUpperCase())}</span>
    </div>
    {['queued', 'running'].includes(status) ? <>
      <div className="asset-discovery-progress-copy"><span>{tr(validation.current_stage || 'Validating selection')}</span><strong>{number(progress, 1)}%</strong></div>
      <div className="asset-discovery-progress"><span style={{ width: `${progress}%` }} /></div>
    </> : null}
    {status === 'completed' ? <div className="asset-discovery-full-validation-grid">
      <div><span>{tr('Capital Δ')}</span><strong>{deltas.ending_capital_delta_rate == null ? '—' : percent(deltas.ending_capital_delta_rate, 2)}</strong><small>{baseline.ending_capital == null || candidate.ending_capital == null ? '—' : `${money(baseline.ending_capital)} → ${money(candidate.ending_capital)}`}</small></div>
      <div><span>{tr('CAGR Δ')}</span><strong>{deltas.cagr_delta == null ? '—' : percent(deltas.cagr_delta, 2)}</strong></div>
      <div><span>{tr('Sharpe Δ')}</span><strong>{deltas.sharpe_delta == null ? '—' : number(deltas.sharpe_delta, 3)}</strong></div>
      <div><span>{tr('MaxDD Δ')}</span><strong>{deltas.maximum_drawdown_delta == null ? '—' : percent(deltas.maximum_drawdown_delta, 2)}</strong></div>
    </div> : null}
  </div>
}

export function PredictiveAssetDiscoveryPage({ capabilities = {}, onSessionExpired }) {
  const discovery = useAssetDiscovery({ onSessionExpired })
  const [researchSize, setResearchSize] = useState(64)
  const [selectedSymbols, setSelectedSymbols] = useState([])
  const [detail, setDetail] = useState(null)
  const campaign = discovery.campaign
  const baseline = campaign?.baseline || discovery.status?.baseline || {}
  const model = campaign?.discovery_selection_model || campaign?.model || {}
  const baselineAssets = useMemo(() => new Set((baseline.assets || []).map((symbol) => String(symbol || '').trim().toUpperCase())), [baseline.assets])
  const results = useMemo(() => [...(campaign?.results || [])].filter(predictiveCandidate).sort((a, b) => discoveryRank(a) - discoveryRank(b)), [campaign?.results])
  const currentSymbols = useMemo(() => results.map((item) => String(item.symbol || '').trim().toUpperCase()).filter(Boolean), [results])
  const catalogAssets = useMemo(() => (discovery.catalog?.assets || []).filter((item) => !baselineAssets.has(String(item?.symbol || '').trim().toUpperCase())), [discovery.catalog?.assets, baselineAssets])
  const canStart = hasCapability(capabilities, 'asset_discovery.start')
  const canStop = hasCapability(capabilities, 'asset_discovery.stop')
  const canExport = hasCapability(capabilities, 'asset_discovery.export')
  const canMutate = hasCapability(capabilities, 'asset_discovery.create_strategy')
  const validation = campaign?.full_strategy_validation || {}
  const validationStatus = String(validation.status || '').toLowerCase()
  const validationActive = ['queued', 'running'].includes(validationStatus)
  const validationMatches = validationMatchesSelection(validation, selectedSymbols)
  const validationPassed = validationStatus === 'completed' && String(validation.decision || '').toUpperCase() === 'PASS' && validationMatches
  const validationFailed = validationStatus === 'completed' && String(validation.decision || '').toUpperCase() === 'FAIL' && validationMatches
  const replay = campaign?.marginal_replay || {}
  const replayStatus = String(replay.status || '').toLowerCase()
  const replayActive = ['queued', 'running'].includes(replayStatus) || (String(campaign?.phase || '').toLowerCase() === 'marginal_replay' && discovery.active)

  useEffect(() => {
    setSelectedSymbols([])
    setDetail(null)
  }, [campaign?.run_id])

  useEffect(() => {
    const allowed = new Set(currentSymbols)
    setSelectedSymbols((current) => current.filter((symbol) => allowed.has(symbol)))
  }, [currentSymbols.join('|')])

  const toggle = (symbol) => {
    const normalized = String(symbol || '').trim().toUpperCase()
    if (!currentSymbols.includes(normalized)) return
    setSelectedSymbols((current) => current.includes(normalized) ? current.filter((item) => item !== normalized) : [...current, normalized])
  }

  const allSelected = currentSymbols.length > 0 && currentSymbols.every((symbol) => selectedSymbols.includes(symbol))
  const validateSelected = async () => {
    if (!selectedSymbols.length) return
    await discovery.validateSelection(campaign?.run_id, normalizedSelection(selectedSymbols))
  }
  const addSelected = async () => {
    if (!selectedSymbols.length || !validationPassed) return
    const response = await discovery.appendToResearchStrategy(campaign?.run_id, normalizedSelection(selectedSymbols))
    if (response) setSelectedSymbols([])
  }

  if (discovery.loading && !discovery.status) return <section className="asset-discovery-page"><div className="page-loading">{tr('Loading Asset Discovery…')}</div></section>

  const status = String(campaign?.status || '').toLowerCase()
  const completed = status === 'completed'
  return <section className="asset-discovery-page">
    <div className="asset-discovery-workspace">
      <header className="asset-discovery-header">
        <div className="asset-discovery-title-icon"><SearchIcon size={22} /></div>
        <div><span className="eyebrow">{tr('PREDICTIVE ASSET DISCOVERY')}</span><h2>{tr('Predictive Asset Discovery')}</h2></div>
        <div className="asset-discovery-mode"><span>{tr('Mode')}</span><strong>{tr('Predictive-first mode')}</strong></div>
      </header>

      {discovery.error ? <div className="inline-error">{discovery.error}</div> : null}
      {discovery.notice ? <div className="inline-notice">{discovery.notice}</div> : null}

      <section className="asset-discovery-config">
        <div className="asset-discovery-baseline"><span>{tr('Strategy baseline')}</span><strong>{baseline.strategy_sequence ? `Strategy #${baseline.strategy_sequence}` : tr('Selected Strategy')}</strong><small>{baseline.asset_count ? tr('{count} assets', { count: baseline.asset_count }) : '—'}{baseline.market_snapshot_end ? ` · ${baseline.market_snapshot_end}` : ''}</small></div>
        <label><span>{tr('Assets to research')}</span><input type="number" min="1" step="1" value={researchSize} disabled={discovery.active} onChange={(event) => setResearchSize(Math.max(1, Number(event.target.value) || 1))} /></label>
        <div className="asset-discovery-fixed-config"><span>{tr('Model')}</span><strong>Learning-to-Rank</strong><small>{tr('Ranking model')}</small></div>
        <div className="asset-discovery-fixed-config"><span>{tr('Automatic economic replay')}</span><strong>{tr('Disabled')}</strong><small>{tr('Predictive-first mode')}</small></div>
        <div className="asset-discovery-actions">
          {!discovery.active ? <button type="button" className="primary-action" disabled={!canStart || discovery.busy === 'start'} onClick={() => discovery.start(researchSize)}>{discovery.busy === 'start' ? tr('Starting…') : tr('Start research')}</button> : null}
          {discovery.active ? <button type="button" className="secondary-action danger-soft" disabled={!canStop || discovery.busy === 'stop'} onClick={discovery.stop}>{discovery.busy === 'stop' ? tr('Stopping…') : tr('Stop')}</button> : null}
          <button type="button" className="secondary-action" disabled={!canExport || !campaign || discovery.busy === 'export'} onClick={discovery.exportAnalysis}>{tr('Export results')}</button>
        </div>
      </section>

      {campaign ? <>
        <section className="asset-discovery-run">
          <div className="asset-discovery-run-topline">
            <div><span>{tr('Campaign')}</span><strong>{campaign.run_id}</strong></div>
            <div><span>{tr('Status')}</span><strong>{tr(String(campaign.status || '').toUpperCase())}</strong></div>
            <div><span>{tr('Scanned')}</span><strong>{campaign.attempted_count || 0}</strong></div>
            <div><span>{tr('Predictive candidates')}</span><strong>{results.length}</strong></div>
          </div>
          <ExecutionStatusBar campaign={campaign} />
          <Pipeline campaign={campaign} />
        </section>

        {completed ? <section className="asset-discovery-campaign-outcome found">
          <div className="asset-discovery-campaign-outcome-copy">
            <span className="eyebrow">{tr('Predictive screening completed')}</span>
            <h3>{tr('{count} predictive candidates found', { count: results.length })}</h3>
            <p>{tr('The search stopped after predictive ranking. Economic contribution over the complete Strategy history was not run automatically.')}</p>
          </div>
          <div className="asset-discovery-campaign-funnel">
            <div><span>{tr('Scanned')}</span><strong>{campaign.attempted_count || 0}</strong></div>
            <div><span>{tr('Evaluated')}</span><strong>{campaign.evaluated_count || 0}</strong></div>
            <div><span>{tr('Predictive candidates')}</span><strong>{results.length}</strong></div>
            <div><span>{tr('Automatic economic replay')}</span><strong>{tr('Disabled')}</strong></div>
          </div>
        </section> : null}

        <section className="asset-discovery-metrics">
          <div><span>{tr('Scanned')}</span><strong>{campaign.attempted_count || 0}</strong></div>
          <div><span>{tr('Evaluated')}</span><strong>{campaign.evaluated_count || 0}</strong></div>
          <div><span>{tr('Rejected')}</span><strong>{campaign.rejected_count || 0}</strong></div>
          <div><span>{tr('Technical failures')}</span><strong>{campaign.technical_failure_count || 0}</strong></div>
          <div><span>{tr('Predictive candidates')}</span><strong>{results.length}</strong></div>
          <div><span>{tr('Median NDCG@5')}</span><strong>{model?.validation_summary?.ranker_median_ndcg_at_5 == null ? '—' : number(model.validation_summary.ranker_median_ndcg_at_5, 3)}</strong></div>
        </section>

        <ModelValidation model={model} />

        <section className="asset-discovery-results">
          <div className="asset-discovery-section-heading asset-discovery-result-heading">
            <div><span className="eyebrow">{tr('State novelty study')}</span><h3>{tr('Predictive candidates')}</h3><small>{tr('Predictive candidates are selected from learned temporal states. Full Strategy validation runs only for the exact selection you choose.')}</small></div>
            <div className="asset-discovery-result-actions">
              {campaign.completed_at ? <span>{shortDateTime(campaign.completed_at)}</span> : null}
              <label className="asset-discovery-select-asset asset-discovery-select-all"><input type="checkbox" checked={allSelected} disabled={!results.length || validationActive} onChange={() => setSelectedSymbols(allSelected ? [] : currentSymbols)} /><span>{tr('Select all')}</span></label>
            </div>
          </div>

          {results.length ? <div className="asset-discovery-card-grid">
            {results.map((item) => {
              const symbol = String(item.symbol || '').trim().toUpperCase()
              const checked = selectedSymbols.includes(symbol)
              const novelty = Number(item.state_novelty_score)
              const similarity = Number(item.state_max_similarity)
              return <article className={`asset-discovery-result-card ${checked ? 'selected' : ''}`} key={symbol}>
                <div className="asset-discovery-result-head">
                  <div className="asset-discovery-quality-title"><span className="asset-discovery-quality-dot positive" aria-hidden="true" /><strong><AssetSymbolTooltip symbol={symbol} companyName={item.company_name}>#{discoveryRank(item)} · {symbol}</AssetSymbolTooltip></strong></div>
                  <label className="asset-discovery-select-asset"><input type="checkbox" checked={checked} disabled={validationActive} onChange={() => toggle(symbol)} /><span>{tr('Select')}</span></label>
                </div>
                <div className="asset-discovery-rank-meta">
                  <span>{tr('Predictive score')} <strong>{number(item?.discovery_selection?.raw_score ?? item.raw_score, 4)}</strong></span>
                  <span>{tr('State novelty')} <strong>{Number.isFinite(novelty) ? percent(novelty, 1) : '—'}</strong></span>
                  <span>{tr('Nearest baseline state')} <strong>{item.state_nearest_baseline_symbol || '—'}</strong></span>
                </div>
                <div className="asset-discovery-result-values">
                  <div><span>{tr('State similarity')}</span><strong>{Number.isFinite(similarity) ? percent(similarity, 1) : '—'}</strong></div>
                  <div><span>{tr('20d return at snapshot')}</span><strong>{item.return_20 == null ? '—' : percent(item.return_20, 2)}</strong></div>
                  <div><span>{tr('60d drawdown at snapshot')}</span><strong>{item.drawdown_60 == null ? '—' : percent(item.drawdown_60, 2)}</strong></div>
                  <div><span>{tr('Max correlation at snapshot')}</span><strong>{item.max_baseline_correlation_60 == null ? '—' : number(item.max_baseline_correlation_60, 2)}</strong></div>
                </div>
                <button type="button" className="secondary-action" onClick={() => setDetail(item)}>{tr('View analysis')}</button>
              </article>
            })}
          </div> : <div className="asset-discovery-empty">{tr('No predictive candidate is available yet.')}</div>}
        </section>

        {results.length ? <section className="asset-discovery-marginal">
          <div className="asset-discovery-section-heading asset-discovery-result-heading">
            <div><span className="eyebrow">{tr('Selected candidates')}</span><h3>{tr('{count} selected', { count: selectedSymbols.length })}</h3><small>{tr('Run full Strategy validation before adding the selected assets.')}</small></div>
            <div className="asset-discovery-result-actions">
              <button type="button" className="secondary-action" disabled={!canMutate || !selectedSymbols.length || validationActive || discovery.busy === 'full-strategy-validation'} onClick={validateSelected}>{validationActive || discovery.busy === 'full-strategy-validation' ? tr('Validating selected universe…') : tr('Validate selected universe')}</button>
              <button type="button" className="primary-action" disabled={!canMutate || !selectedSymbols.length || !validationPassed || discovery.busy === 'append-to-research-strategy'} onClick={addSelected}>{discovery.busy === 'append-to-research-strategy' ? tr('Adding selected assets…') : tr('Add selected to Strategy')}</button>
            </div>
          </div>
          {validationPassed ? <small className="asset-discovery-create-feedback success">{tr('Selected-universe validation PASS for this exact selection.')}</small> : null}
          {validationFailed ? <small className="asset-discovery-create-feedback error">{tr('Selected-universe validation FAIL for this exact selection.')}</small> : null}
          {discovery.validationError ? <small className="asset-discovery-create-feedback error">{discovery.validationError}</small> : null}
          {discovery.createError ? <small className="asset-discovery-create-feedback error">{discovery.createError}</small> : null}
          <FullStrategyValidation campaign={campaign} selectedSymbols={selectedSymbols} validationPassed={validationPassed} validationFailed={validationFailed} />
        </section> : null}

        <section className="asset-discovery-marginal">
          <div className="asset-discovery-section-heading asset-discovery-result-heading">
            <div><span className="eyebrow">{tr('Optional economic contribution study')}</span><h3>{replayActive ? tr('Economic replay running') : replayStatus === 'completed' ? tr('Economic replay completed') : tr('Economic replay not run')}</h3><small>{tr('This replay is manual and expensive. It is not part of the normal discovery flow.')}</small></div>
            <div className="asset-discovery-result-actions"><button type="button" className="secondary-action" disabled={!canStart || !results.length || discovery.active || discovery.busy === 'marginal-replay'} onClick={discovery.runMarginalReplay}>{discovery.busy === 'marginal-replay' ? tr('Starting optional replay…') : tr('Run optional Marginal Capital Replay')}</button></div>
          </div>
          {replayActive ? <>
            <div className="asset-discovery-progress-copy"><span>{tr(replay.current_stage || 'Marginal Capital Replay')}</span><strong>{number(Number(replay.progress_percent || 0), 1)}%</strong></div>
            <div className="asset-discovery-progress"><span style={{ width: `${Math.max(0, Math.min(100, Number(replay.progress_percent || 0)))}%` }} /></div>
          </> : null}
        </section>

        <section className="asset-discovery-catalog">
          <div className="asset-discovery-section-heading asset-discovery-result-heading">
            <div><span className="eyebrow">{tr('Predictive discovery catalog')}</span><h3>{tr('Catalog assets')}</h3><small>{tr('This catalog stores predictive discoveries; economic validation may be absent until explicitly requested.')}</small></div>
            <span>{catalogAssets.length}</span>
          </div>
          {catalogAssets.length ? <div className="asset-discovery-catalog-grid">
            {catalogAssets.map((item) => {
              const metrics = item.latest_metrics || {}
              const novelty = Number(metrics.state_novelty_score)
              return <article className="asset-discovery-catalog-card" key={item.symbol}>
                <div className="asset-discovery-result-head"><strong><AssetSymbolTooltip symbol={item.symbol} companyName={item.company_name}>{item.symbol}</AssetSymbolTooltip></strong>{String(item.latest_run_id || '') === String(campaign.run_id || '') ? <span className="asset-discovery-current-run-badge">{tr('Current campaign')}</span> : null}</div>
                <div className="asset-discovery-catalog-meta"><span>{tr('Best rank')} <strong>#{item.best_rank || '—'}</strong></span><span>{tr('Last seen')} <strong>{item.last_seen_at ? shortDateTime(item.last_seen_at) : '—'}</strong></span></div>
                <div className="asset-discovery-result-values"><div><span>{tr('Predictive score')}</span><strong>{item.latest_model_score == null ? '—' : number(item.latest_model_score, 4)}</strong></div><div><span>{tr('State novelty')}</span><strong>{Number.isFinite(novelty) ? percent(novelty, 1) : '—'}</strong></div><div><span>{tr('Economic validation')}</span><strong>{item.economic_validation_status === 'not_run' ? tr('Not run') : tr(String(item.economic_validation_status || 'Not run'))}</strong></div></div>
              </article>
            })}
          </div> : <div className="asset-discovery-empty">{tr('No predictive candidate is available yet.')}</div>}
        </section>
      </> : <div className="asset-discovery-empty large">{tr('Choose the research size and start a manual campaign.')}</div>}
    </div>
    <CandidateDetail item={detail} onClose={() => setDetail(null)} />
  </section>
}
