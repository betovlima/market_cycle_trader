import { useMemo, useState } from 'react'
import { createPortal } from 'react-dom'

import { tr } from '../../i18n/runtime'
import { number, percent } from '../../shared/formatters'
import './assetStateClustering.css'

function Metric({ label, value, note = '' }) {
  return <div className="asset-state-metric"><span>{tr(label)}</span><strong>{value}</strong>{note ? <small>{tr(note)}</small> : null}</div>
}

function valueOrDash(value, digits = 3) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? number(parsed, digits) : '—'
}

function profilePercent(value) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? percent(parsed, 1) : '—'
}

function RuntimeProgress({ analysis }) {
  const progress = analysis?.progress || {}
  const completed = Number(progress.completed_assets)
  const total = Number(progress.total_assets)
  const percentValue = Number(progress.percent)
  const progressPercent = Number.isFinite(percentValue) ? Math.max(0, Math.min(100, percentValue)) : 0
  const heartbeat = progress.heartbeat_at ? new Date(progress.heartbeat_at) : null
  const heartbeatLabel = heartbeat && Number.isFinite(heartbeat.getTime())
    ? heartbeat.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
    : '—'
  const status = String(analysis?.status || 'running').toLowerCase()
  const statusLabel = status === 'failed' ? tr('Failed') : status === 'stopped' ? tr('Stopped') : tr('Running')

  return <section className={`asset-state-runtime ${status}`}>
    <header><div><span className="panel-kicker">{tr('UNSUPERVISED RESEARCH')}</span><h4>{tr('Processing daily asset checkpoints')}</h4></div><strong>{statusLabel}</strong></header>
    <div className="asset-state-runtime-count"><strong>{Number.isFinite(completed) ? completed : 0}/{Number.isFinite(total) ? total : 0}</strong><span>{tr('assets completed')}</span><b>{Math.round(progressPercent)}%</b></div>
    <div className="asset-state-runtime-track"><span style={{ width: `${progressPercent}%` }} /></div>
    <div className="asset-state-runtime-details">
      <span>{tr('Last completed asset')}: <strong>{progress.last_completed_symbol || '—'}</strong></span>
      <span>{tr('Last activity')}: <strong>{heartbeatLabel}</strong></span>
    </div>
    <small>{tr('Each completed asset is saved as a checkpoint and will be reused after an API restart.')}</small>
    {analysis?.failure_message ? <p>{analysis.failure_message}</p> : null}
  </section>
}

function DetailDialog({ detail, onClose }) {
  if (!detail) return null
  return createPortal(
    <div className="asset-state-dialog-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose?.() }}>
      <section className="asset-state-dialog" role="dialog" aria-modal="true" aria-label={tr('Asset state detail')}>
        <header><div><span>{tr('DAILY ASSET STATE')}</span><h4>{detail.symbol} · {detail.timestamp?.slice(0, 10) || '—'}</h4></div><button type="button" onClick={onClose} aria-label={tr('Close')}>×</button></header>
        <div className="asset-state-dialog-grid">
          <Metric label="Cluster" value={detail.cluster_id ?? '—'} />
          <Metric label="PCA X" value={valueOrDash(detail.x ?? detail.pca_x, 4)} />
          <Metric label="PCA Y" value={valueOrDash(detail.y ?? detail.pca_y, 4)} />
          <Metric label="Current state" value={detail.is_current ? tr('Yes') : tr('Historical')} />
        </div>
      </section>
    </div>,
    document.body,
  )
}

function ScatterMap({ assetMap, onPoint }) {
  const points = assetMap?.points || []
  const centroids = assetMap?.centroids || []
  const bounds = useMemo(() => {
    const xs = [...points.map((item) => Number(item.x)), ...centroids.map((item) => Number(item.x))].filter(Number.isFinite)
    const ys = [...points.map((item) => Number(item.y)), ...centroids.map((item) => Number(item.y))].filter(Number.isFinite)
    if (!xs.length || !ys.length) return { minX: -1, maxX: 1, minY: -1, maxY: 1 }
    const minX = Math.min(...xs); const maxX = Math.max(...xs); const minY = Math.min(...ys); const maxY = Math.max(...ys)
    const padX = Math.max(0.25, (maxX - minX) * 0.08); const padY = Math.max(0.25, (maxY - minY) * 0.08)
    return { minX: minX - padX, maxX: maxX + padX, minY: minY - padY, maxY: maxY + padY }
  }, [centroids, points])
  const width = 860; const height = 430; const left = 56; const right = 24; const top = 26; const bottom = 46
  const x = (value) => left + ((Number(value) - bounds.minX) / Math.max(1e-9, bounds.maxX - bounds.minX)) * (width - left - right)
  const y = (value) => top + (1 - ((Number(value) - bounds.minY) / Math.max(1e-9, bounds.maxY - bounds.minY))) * (height - top - bottom)
  const zeroX = bounds.minX <= 0 && bounds.maxX >= 0 ? x(0) : null
  const zeroY = bounds.minY <= 0 && bounds.maxY >= 0 ? y(0) : null
  return <div className="asset-state-map-scroll"><svg className="asset-state-map" viewBox={`0 0 ${width} ${height}`} role="img" aria-label={tr('Latest per-asset cluster map')}>
    <rect x={left} y={top} width={width - left - right} height={height - top - bottom} className="asset-state-plot-bg" />
    {zeroX != null ? <line x1={zeroX} x2={zeroX} y1={top} y2={height - bottom} className="asset-state-axis-zero" /> : null}
    {zeroY != null ? <line x1={left} x2={width - right} y1={zeroY} y2={zeroY} className="asset-state-axis-zero" /> : null}
    {points.map((point, index) => <g key={`${point.timestamp}-${index}`} role="button" tabIndex="0" className="asset-state-svg-button" onClick={() => onPoint?.({ ...point, symbol: assetMap.symbol })} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') onPoint?.({ ...point, symbol: assetMap.symbol }) }}>
      <circle cx={x(point.x)} cy={y(point.y)} r={point.is_current ? 6.5 : 3.6} className={`asset-state-point cluster-${Number(point.cluster_id) % 6} ${point.is_current ? 'current' : ''}`} />
    </g>)}
    {centroids.map((centroid) => <g key={`c-${centroid.cluster_id}`} transform={`translate(${x(centroid.x)} ${y(centroid.y)})`} className={`asset-state-centroid cluster-${Number(centroid.cluster_id) % 6}`}><path d="M0 -9 L9 0 L0 9 L-9 0 Z" /><text x="12" y="4">C{centroid.cluster_id}</text></g>)}
    <text x={width / 2} y={height - 8} textAnchor="middle" className="asset-state-axis-label">PCA 1</text>
    <text transform={`translate(15 ${height / 2}) rotate(-90)`} textAnchor="middle" className="asset-state-axis-label">PCA 2</text>
  </svg></div>
}

export function AssetStateClusteringPanel({ analysis }) {
  const maps = analysis?.latest_maps || []
  const summaries = analysis?.asset_summaries || []
  const symbols = useMemo(() => maps.map((item) => item.symbol).filter(Boolean).sort(), [maps])
  const [selectedSymbol, setSelectedSymbol] = useState(symbols[0] || '')
  const [detail, setDetail] = useState(null)
  const activeSymbol = symbols.includes(selectedSymbol) ? selectedSymbol : (symbols[0] || '')
  const assetMap = maps.find((item) => item.symbol === activeSymbol) || null
  const assetSummary = summaries.find((item) => item.symbol === activeSymbol) || null
  const profile = assetSummary?.latest_profile || assetMap?.current_profile || {}
  const summary = analysis?.summary || {}

  if (!analysis?.id) return null
  if (!maps.length && String(analysis?.status || '').toLowerCase() !== 'completed') return <RuntimeProgress analysis={analysis} />
  if (!maps.length) return <div className="asset-state-empty">{tr('Asset State Clustering completed without enough history to form daily asset maps.')}</div>

  return <div className="asset-state-panel">
    <div className="asset-state-head"><div><span className="panel-kicker">{tr('UNSUPERVISED RESEARCH')}</span><h4>{tr('Daily Asset State Clustering')}</h4><p>{tr('Each asset is reclustered independently after every completed trading session. Future outcomes do not form the clusters.')}</p></div><label><span>{tr('Asset')}</span><select value={activeSymbol} onChange={(event) => setSelectedSymbol(event.target.value)}>{symbols.map((symbol) => <option key={symbol} value={symbol}>{symbol}</option>)}</select></label></div>

    <div className="asset-state-metrics">
      <Metric label="Assets analyzed" value={summary.completed_asset_count ?? '—'} />
      <Metric label="Daily states" value={summary.daily_state_count ?? '—'} />
      <Metric label="Mean silhouette" value={valueOrDash(summary.mean_silhouette, 3)} note="Higher values indicate more separated unsupervised groups." />
      <Metric label="Novel states" value={summary.novel_state_count ?? '—'} />
      <Metric label="Current clusters" value={assetMap?.cluster_count ?? '—'} />
      <Metric label="Current cluster" value={assetMap?.current_cluster_id ?? '—'} />
    </div>

    <section className="asset-state-map-card"><div className="asset-state-map-title"><div><strong>{tr('Latest cluster geometry')}</strong><small>{activeSymbol} · {String(assetMap?.as_of || '').slice(0, 10)}</small></div><span>{tr('Click a point for details')}</span></div><ScatterMap assetMap={assetMap} onPoint={setDetail} /></section>

    <section className="asset-state-profile"><div><strong>{tr('Historical profile of the current cluster')}</strong><small>{tr('The profile uses only historical outcomes that had already matured before each analysis date.')}</small></div><div className="asset-state-profile-grid">
      <Metric label="Historical samples" value={profile.samples ?? '—'} />
      <Metric label="Mean future return" value={profilePercent(profile.mean_forward_return)} />
      <Metric label="Median future return" value={profilePercent(profile.median_forward_return)} />
      <Metric label="Positive rate" value={profilePercent(profile.positive_rate)} />
      <Metric label="Severe-loss rate" value={profilePercent(profile.severe_loss_rate)} />
      <Metric label="Decision effect" value={tr('None — research only')} />
    </div></section>
    <DetailDialog detail={detail} onClose={() => setDetail(null)} />
  </div>
}
