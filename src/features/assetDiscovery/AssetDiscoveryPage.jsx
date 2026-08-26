import { useEffect, useMemo, useState } from 'react'

import { hasCapability } from '../../auth/capabilities'
import { tr } from '../../i18n/runtime'
import { money, number, percent, shortDateTime } from '../../shared/formatters'
import { SearchIcon } from '../../shared/components/Icons'
import { useAssetDiscovery } from './useAssetDiscovery'
import './assetDiscovery.css'

const PHASES = [
  ['baseline', 'Strategy baseline'],
  ['training_ranker', 'Learning-to-Rank'],
  ['scanning', 'External scan'],
  ['marginal_replay', 'Marginal Capital Replay'],
  ['completed', 'Discovery results'],
]

function phaseIndex(phase, status) {
  if (status === 'completed') return PHASES.length
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

function Pipeline({ campaign }) {
  const current = phaseIndex(campaign?.phase, campaign?.status)
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

function ValidationPanel({ model }) {
  const folds = model?.validation_folds || []
  const summary = model?.validation_summary || {}
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
    <div className="asset-discovery-fold-grid">
      {folds.map((fold) => <article className={`asset-discovery-fold ${fold.beats_momentum ? 'winner' : ''}`} key={fold.fold}>
        <div className="asset-discovery-fold-head">
          <strong>{tr('Fold')} {fold.fold}</strong>
          <span>{fold.validation_start} → {fold.validation_end}</span>
        </div>
        <div className="asset-discovery-fold-values">
          <div><span>{tr('Ranker')}</span><strong>{fold.ranker_ndcg_at_5 == null ? '—' : number(fold.ranker_ndcg_at_5, 3)}</strong></div>
          <div><span>{tr('Momentum')}</span><strong>{fold.momentum_ndcg_at_5 == null ? '—' : number(fold.momentum_ndcg_at_5, 3)}</strong></div>
          <div><span>{tr('Random')}</span><strong>{fold.random_ndcg_at_5 == null ? '—' : number(fold.random_ndcg_at_5, 3)}</strong></div>
        </div>
      </article>)}
    </div>
  </section>
}

function MarginalReplayPanel({ campaign, selectedSymbols, toggleSymbol, canStart, canCreateStrategy, busy, onRunReplay, onCreate, createError, createdStrategy }) {
  const replay = campaign?.marginal_replay || {}
  const rows = [...(replay.results || [])].sort((left, right) => {
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
  if (!total && campaign?.phase !== 'marginal_replay' && campaign?.status !== 'completed') return null

  return <section className="asset-discovery-marginal">
    <div className="asset-discovery-section-heading asset-discovery-result-heading">
      <div>
        <span className="eyebrow">{tr('MARGINAL CAPITAL REPLAY')}</span>
        <h3>{tr('Economic contribution by asset')}</h3>
        <small>{tr('Every shortlisted asset is replayed automatically against the same baseline. Select assets only when you want to create a Research Strategy.')}</small>
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
          className="primary-action"
          disabled={!canCreateStrategy || !selectedSymbols.length || busy === 'create-strategy'}
          onClick={onCreate}
        >
          {busy === 'create-strategy' ? tr('Creating Strategy…') : tr('Create Research Strategy')}
        </button>
        <small>{tr('{count} selected', { count: selectedSymbols.length })}</small>
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
      <div><span>{tr('Baseline capital')}</span><strong>{money(baseline.ending_capital)}</strong></div>
      <div><span>{tr('Baseline CAGR')}</span><strong>{baseline.cagr == null ? '—' : percent(baseline.cagr, 2)}</strong></div>
      <div><span>{tr('Baseline Sharpe')}</span><strong>{baseline.sharpe == null ? '—' : number(baseline.sharpe, 3)}</strong></div>
      <div><span>{tr('Baseline MaxDD')}</span><strong>{baseline.maximum_drawdown == null ? '—' : percent(baseline.maximum_drawdown, 2)}</strong></div>
      <div><span>{tr('Baseline worst fold')}</span><strong>{baseline.worst_fold_return == null ? '—' : percent(baseline.worst_fold_return, 2)}</strong></div>
    </div> : null}
    {rows.length ? <div className="asset-discovery-marginal-grid">
      {rows.map((row) => {
        const result = (campaign?.results || []).find((item) => item.symbol === row.symbol) || {}
        const checked = selectedSymbols.includes(row.symbol)
        const candidate = row.candidate || {}
        const tone = marginalTone(row)
        return <article className={`asset-discovery-marginal-card quality-${tone} ${checked ? 'selected' : ''}`} key={row.symbol}>
          <div className="asset-discovery-result-head">
            <div>
              <div className="asset-discovery-quality-title">
                <span className={`asset-discovery-quality-dot ${tone}`} aria-hidden="true" />
                <strong>{row.marginal_rank ? `#${row.marginal_rank} · ` : ''}{row.symbol}</strong>
              </div>
              <small>{tr('ML rank')} #{result.rank || '—'}</small>
            </div>
            <label className="asset-discovery-select-asset">
              <input type="checkbox" checked={checked} onChange={() => toggleSymbol(row.symbol)} />
              <span>{tr('Select')}</span>
            </label>
          </div>
          {row.status === 'failed' ? <div className="inline-error asset-discovery-marginal-error">{row.error || tr('Marginal replay failed for this asset.')}</div> : <>
            <div className="asset-discovery-marginal-primary">
              <span>{tr('Marginal capital')}</span>
              <strong>{row.ending_capital_delta_rate == null ? '—' : percent(row.ending_capital_delta_rate, 2)}</strong>
              <small>{candidate.ending_capital == null ? '—' : money(candidate.ending_capital)}</small>
            </div>
            <div className="asset-discovery-result-values asset-discovery-marginal-values">
              <div><span>{tr('CAGR Δ')}</span><strong>{row.cagr_delta == null ? '—' : percent(row.cagr_delta, 2)}</strong></div>
              <div><span>{tr('Sharpe Δ')}</span><strong>{row.sharpe_delta == null ? '—' : number(row.sharpe_delta, 3)}</strong></div>
              <div><span>{tr('MaxDD Δ')}</span><strong>{row.maximum_drawdown_delta == null ? '—' : percent(row.maximum_drawdown_delta, 2)}</strong></div>
              <div><span>{tr('Worst fold Δ')}</span><strong>{row.worst_fold_return_delta == null ? '—' : percent(row.worst_fold_return_delta, 2)}</strong></div>
            </div>
          </>}
        </article>
      })}
    </div> : <div className="asset-discovery-empty">{tr('Marginal results will appear after the ranked shortlist is ready.')}</div>}
  </section>
}

function DetailModal({ item, evaluatedCount, onClose }) {
  if (!item) return null
  return <div className="asset-discovery-modal-backdrop" role="presentation" onMouseDown={onClose}>
    <div className="asset-discovery-modal" role="dialog" aria-modal="true" aria-label={`${item.symbol} ${tr('rank analysis')}`} onMouseDown={(event) => event.stopPropagation()}>
      <div className="asset-discovery-modal-header">
        <div>
          <span className="eyebrow">{tr('LEARNING-TO-RANK')}</span>
          <h3>{item.symbol}</h3>
        </div>
        <button type="button" className="icon-button" onClick={onClose} aria-label={tr('Close')}>×</button>
      </div>
      <div className="asset-discovery-detail-grid">
        <div><span>{tr('Relative rank')}</span><strong>#{item.rank} / {item.evaluated_count || evaluatedCount || '—'}</strong></div>
        <div><span>{tr('Model score')}</span><strong>{number(item.raw_score, 4)}</strong></div>
        <div><span>{tr('Latest close')}</span><strong>{money(item.latest_close)}</strong></div>
        <div><span>{tr('20-session return')}</span><strong>{percent(item.return_20, 2)}</strong></div>
        <div><span>{tr('60-session return')}</span><strong>{percent(item.return_60, 2)}</strong></div>
        <div><span>{tr('20-session volatility')}</span><strong>{percent(item.volatility_20, 2)}</strong></div>
        <div><span>{tr('60-session drawdown')}</span><strong>{percent(item.drawdown_60, 2)}</strong></div>
        <div><span>{tr('Trend efficiency')}</span><strong>{number(item.trend_efficiency_20, 3)}</strong></div>
        <div><span>{tr('Max baseline correlation')}</span><strong>{item.max_baseline_correlation_60 == null ? '—' : number(item.max_baseline_correlation_60, 3)}</strong></div>
        <div><span>{tr('Median dollar volume')}</span><strong>{money(item.median_dollar_volume)}</strong></div>
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
  const [catalogSelectedSymbols, setCatalogSelectedSymbols] = useState([])
  const campaign = discovery.campaign
  const catalogAssets = discovery.catalog?.assets || []
  const options = discovery.status?.research_size_options || [8, 16, 24, 32, 40, 48, 56, 64]
  const results = campaign?.results || []
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

  const createStrategy = async () => {
    const created = await discovery.createStrategy(campaign?.run_id, selectedSymbols)
    if (created) setSelectedSymbols([])
  }

  const toggleCatalogSymbol = (symbol) => {
    setCatalogSelectedSymbols((current) => current.includes(symbol) ? current.filter((item) => item !== symbol) : [...current, symbol])
  }

  const createCatalogStrategy = async () => {
    const created = await discovery.createStrategy(null, catalogSelectedSymbols)
    if (created) setCatalogSelectedSymbols([])
  }

  if (discovery.loading && !discovery.status) {
    return <section className="asset-discovery-page"><div className="page-loading">{tr('Loading Asset Discovery…')}</div></section>
  }

  const baseline = campaign?.baseline || discovery.status?.baseline || {}
  const winnerSource = campaign?.winner_source || {}
  const model = campaign?.model || {}
  const rejectionSummary = campaign?.rejection_summary || {}
  const historicalIntegrityRejects = Number(rejectionSummary.insufficient_history || 0)
    + Number(rejectionSummary.discontinuous_history || 0)
    + Number(rejectionSummary.ticker_identity_discontinuity || 0)
    + Number(rejectionSummary.research_context_incomplete || 0)

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
        <div className="asset-discovery-fixed-config"><span>{tr('Model')}</span><strong>Learning-to-Rank</strong><small>LightGBM LambdaMART</small></div>
        <div className="asset-discovery-fixed-config"><span>{tr('Batch')}</span><strong>{discovery.status?.batch_size || 8}</strong><small>{tr('assets')}</small></div>
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
            <div><span>{tr('Current batch')}</span><strong>{campaign.current_batch || '—'}</strong></div>
            <div><span>{tr('Current asset')}</span><strong>{campaign.current_symbol || '—'}</strong></div>
          </div>
          {String(campaign.status || '').toLowerCase() === 'failed' && campaign.message ? (
            <div className="inline-error asset-discovery-campaign-failure">
              <strong>{tr('Asset Discovery failed')}</strong>
              <span>{campaign.message}</span>
            </div>
          ) : null}
          <div className="asset-discovery-progress-copy"><span>{tr('Scanned')}</span><strong>{campaign.attempted_count || 0} / {campaign.research_size || researchSize}</strong></div>
          <div className="asset-discovery-progress"><span style={{ width: `${progress}%` }} /></div>
          <Pipeline campaign={campaign} />
        </section>

        <section className="asset-discovery-metrics">
          <div><span>{tr('Scanned')}</span><strong>{campaign.attempted_count || 0}</strong></div>
          <div><span>{tr('Evaluated')}</span><strong>{campaign.evaluated_count || 0}</strong></div>
          <div><span>{tr('Rejected')}</span><strong>{campaign.rejected_count || 0}</strong></div>
          <div><span>{tr('Technical failures')}</span><strong>{campaign.technical_failure_count || 0}</strong></div>
          <div><span>{tr('Stored results')}</span><strong>{campaign.shortlisted_count || results.length}</strong></div>
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
          onCreate={createStrategy}
          createError={discovery.createError}
          createdStrategy={discovery.createdStrategy}
        />

        <section className="asset-discovery-results">
          <div className="asset-discovery-section-heading asset-discovery-result-heading">
            <div>
              <span className="eyebrow">{tr('RANKED SHORTLIST')}</span>
              <h3>{tr('Ranked shortlist')}</h3>
              {winnerSource.strategy_sequence ? <small>{tr('Research Strategy source')}: Winner Strategy #{winnerSource.strategy_sequence}</small> : null}
            </div>
            <div className="asset-discovery-result-actions">
              {campaign.completed_at ? <span>{shortDateTime(campaign.completed_at)}</span> : null}
              <small>{tr('Learning-to-Rank is statistical screening. Use Marginal Capital Replay below to choose assets for Strategy testing.')}</small>
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
                    <strong>#{marginalRank || item.rank} · {item.symbol}</strong>
                  </div>
                  <span>{marginalRank ? `${tr('Marginal')} #${marginalRank}` : tr('ML screening')}</span>
                </div>
                <div className="asset-discovery-rank-meta">
                  <span>{tr('ML rank')} <strong>#{item.rank} / {campaign.evaluated_count || '—'}</strong></span>
                  {marginalRank ? <span>{tr('Marginal rank')} <strong>#{marginalRank}</strong></span> : null}
                  <span>{tr('Model score')} <strong>{number(item.raw_score, 4)}</strong></span>
                </div>
                <div className="asset-discovery-result-values">
                  <div><span>{tr('20d return')}</span><strong>{percent(item.return_20, 2)}</strong></div>
                  <div><span>{tr('20d volatility')}</span><strong>{percent(item.volatility_20, 2)}</strong></div>
                  <div><span>{tr('60d drawdown')}</span><strong>{percent(item.drawdown_60, 2)}</strong></div>
                  <div><span>{tr('Max correlation')}</span><strong>{item.max_baseline_correlation_60 == null ? '—' : number(item.max_baseline_correlation_60, 2)}</strong></div>
                </div>
                <button type="button" className="secondary-action" onClick={() => setSelected(item)}>{tr('View analysis')}</button>
              </article>
            })}
          </div> : <div className="asset-discovery-empty">{discovery.active ? tr('Results will appear after ranked assets are available.') : tr('No ranked shortlist is available yet.')}</div>}
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
            <span className="eyebrow">{tr('DISCOVERY CATALOG')}</span>
            <h3>{tr('Discovered assets')}</h3>
            <small>{tr('Shortlisted assets remain available across new research campaigns.')}</small>
          </div>
          <div className="asset-discovery-result-actions">
            <span>{tr('{count} catalog assets', { count: catalogAssets.length })}</span>
            <button
              type="button"
              className="primary-action"
              disabled={!canCreateStrategy || !catalogSelectedSymbols.length || discovery.busy === 'create-strategy'}
              onClick={createCatalogStrategy}
            >
              {discovery.busy === 'create-strategy' ? tr('Creating Strategy…') : tr('Create Research Strategy')}
            </button>
            <small>{tr('{count} selected', { count: catalogSelectedSymbols.length })}</small>
            {discovery.createError ? <small className="asset-discovery-create-feedback error">{discovery.createError}</small> : null}
            {discovery.createdStrategy?.strategy?.strategy_sequence ? <small className="asset-discovery-create-feedback success">{tr('Strategy #{sequence} created · {count} assets', { sequence: discovery.createdStrategy.strategy.strategy_sequence, count: discovery.createdStrategy.asset_count || '—' })}</small> : null}
              {discovery.createdStrategy?.discarded_assets?.length ? <small className="asset-discovery-create-feedback warning">{tr('Discarded because of incomplete history')}: {discovery.createdStrategy.discarded_assets.map((item) => item.symbol).join(', ')}</small> : null}
          </div>
        </div>
        {catalogAssets.length ? <div className="asset-discovery-catalog-grid">
          {catalogAssets.map((item) => {
            const checked = catalogSelectedSymbols.includes(item.symbol)
            const metrics = item.latest_metrics || {}
            const detail = {
              symbol: item.symbol,
              rank: item.latest_rank,
              raw_score: item.latest_model_score,
              evaluated_count: item.latest_evaluated_count,
              ...metrics,
            }
            return <article className={`asset-discovery-catalog-card ${checked ? 'selected' : ''}`} key={item.symbol}>
              <div className="asset-discovery-result-head">
                <strong>{item.symbol}</strong>
                <label className="asset-discovery-select-asset">
                  <input type="checkbox" checked={checked} onChange={() => toggleCatalogSymbol(item.symbol)} />
                  <span>{tr('Select')}</span>
                </label>
              </div>
              <div className="asset-discovery-catalog-meta">
                <span>{tr('Found')} <strong>{item.times_discovered || 1}×</strong></span>
                <span>{tr('Best rank')} <strong>#{item.best_rank || '—'}</strong></span>
                <span>{tr('Latest rank')} <strong>#{item.latest_rank || '—'}</strong></span>
                <span>{tr('Last seen')} <strong>{item.last_seen_at ? shortDateTime(item.last_seen_at) : '—'}</strong></span>
              </div>
              <div className="asset-discovery-result-values">
                <div><span>{tr('20d return')}</span><strong>{metrics.return_20 == null ? '—' : percent(metrics.return_20, 2)}</strong></div>
                <div><span>{tr('60d return')}</span><strong>{metrics.return_60 == null ? '—' : percent(metrics.return_60, 2)}</strong></div>
                <div><span>{tr('60d drawdown')}</span><strong>{metrics.drawdown_60 == null ? '—' : percent(metrics.drawdown_60, 2)}</strong></div>
                <div><span>{tr('Max correlation')}</span><strong>{metrics.max_baseline_correlation_60 == null ? '—' : number(metrics.max_baseline_correlation_60, 2)}</strong></div>
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
