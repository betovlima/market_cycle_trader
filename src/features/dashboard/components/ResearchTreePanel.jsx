import { useEffect, useMemo, useState } from 'react'

import { apiFetch } from '../../../api/http'
import { API } from '../../../config/env'
import { tr } from '../../../i18n/runtime'

function finite(value) {
  const number = Number(value)
  return Number.isFinite(number) ? number : null
}

function compactNumber(value, digits = 4) {
  const number = finite(value)
  if (number == null) return '—'
  if (number === 0) return '0'
  const absolute = Math.abs(number)
  const leadingDecimalZeros = absolute < 1
    ? Math.max(0, Math.ceil(-Math.log10(absolute)) - 1)
    : 0
  const maximumFractionDigits = Math.min(16, Math.max(digits, leadingDecimalZeros + 6))
  return number.toLocaleString(undefined, {
    minimumFractionDigits: 0,
    maximumFractionDigits,
    useGrouping: true,
    notation: 'standard',
  })
}

function featureLabel(feature) {
  const value = String(feature || '')
  let match = value.match(/^return_(\d+)$/)
  if (match) return tr('Return {period} sessions', { period: match[1] })
  match = value.match(/^vol_(\d+)$/)
  if (match) return tr('Volatility {period} sessions', { period: match[1] })
  match = value.match(/^vol_ratio_(\d+)_(\d+)$/)
  if (match) return tr('Volatility ratio {short}/{long}', { short: match[1], long: match[2] })
  match = value.match(/^ema_distance_(\d+)$/)
  if (match) return tr('EMA distance {period}', { period: match[1] })
  match = value.match(/^ema_(\d+)_vs_(\d+)$/)
  if (match) return tr('EMA {short} vs {long}', { short: match[1], long: match[2] })
  match = value.match(/^ema_slope_(\d+)_(\d+)$/)
  if (match) return tr('EMA slope {period}/{window}', { period: match[1], window: match[2] })
  match = value.match(/^distance_from_(high|low)_(\d+)$/)
  if (match) return tr(match[1] === 'high' ? 'Distance from {period}-session high' : 'Distance from {period}-session low', { period: match[2] })
  match = value.match(/^channel_position_(\d+)$/)
  if (match) return tr('Channel position {period}', { period: match[1] })
  match = value.match(/^trend_efficiency_(\d+)$/)
  if (match) return tr('Trend efficiency {period}', { period: match[1] })
  match = value.match(/^volume_zscore_(\d+)$/)
  if (match) return tr('Volume z-score {period}', { period: match[1] })
  match = value.match(/^volume_ratio_(\d+)_(\d+)$/)
  if (match) return tr('Volume ratio {short}/{long}', { short: match[1], long: match[2] })
  if (value === 'rsi_14') return tr('RSI 14')
  if (value === 'atr_pct_14') return tr('ATR percentage 14')
  if (value === 'momentum_acceleration_5_20') return tr('Momentum acceleration 5/20')
  if (value === 'momentum_acceleration_20_60') return tr('Momentum acceleration 20/60')
  if (value === 'range_expansion_5_20') return tr('Range expansion 5/20')
  return value.replaceAll('_', ' ')
}

function layoutTree(root) {
  const nodes = []
  const edges = []
  let nextLeaf = 0
  let maxDepth = 0
  let sequence = 0

  function visit(node, depth = 0, parent = null, branch = null) {
    if (!node) return null
    maxDepth = Math.max(maxDepth, depth)
    const id = `tree-node-${sequence++}`
    const left = node.kind === 'split' ? visit(node.left, depth + 1, id, 'left') : null
    const right = node.kind === 'split' ? visit(node.right, depth + 1, id, 'right') : null
    let leafIndex
    if (node.kind === 'leaf') leafIndex = nextLeaf++
    else if (left && right) leafIndex = (left.leafIndex + right.leafIndex) / 2
    else leafIndex = left?.leafIndex ?? right?.leafIndex ?? nextLeaf++
    const item = { id, node, depth, leafIndex, parent, branch }
    nodes.push(item)
    if (left) edges.push({ from: item, to: left, branch: 'left' })
    if (right) edges.push({ from: item, to: right, branch: 'right' })
    return item
  }

  const rootItem = visit(root)
  const leafCount = Math.max(1, nextLeaf)
  const xGap = 142
  const yGap = 118
  const paddingX = 86
  const paddingY = 56
  const width = Math.max(900, paddingX * 2 + Math.max(1, leafCount - 1) * xGap)
  const height = paddingY * 2 + maxDepth * yGap + 56
  const positioned = nodes.map((item) => ({
    ...item,
    x: paddingX + item.leafIndex * xGap,
    y: paddingY + item.depth * yGap,
  }))
  const byId = new Map(positioned.map((item) => [item.id, item]))
  return {
    width,
    height,
    nodes: positioned,
    edges: edges.map((edge) => ({ ...edge, from: byId.get(edge.from.id), to: byId.get(edge.to.id) })),
    root: rootItem ? byId.get(rootItem.id) : null,
  }
}

function NodeDetail({ item, onClose }) {
  if (!item) return null
  const node = item.node
  return (
    <div className="research-tree-modal-backdrop" role="presentation" onMouseDown={onClose}>
      <section className="research-tree-modal" role="dialog" aria-modal="true" aria-label={tr('Tree node detail')} onMouseDown={(event) => event.stopPropagation()}>
        <div className="research-tree-modal-header">
          <div>
            <span className="panel-kicker">{node.kind === 'leaf' ? tr('Leaf') : tr('Decision node')}</span>
            <h3>{node.kind === 'leaf' ? `${tr('Leaf')} #${Number(node.leaf_index) + 1}` : featureLabel(node.feature)}</h3>
          </div>
          <button type="button" onClick={onClose} aria-label={tr('Close')}>×</button>
        </div>
        <div className="research-tree-modal-grid">
          {node.kind === 'split' ? <>
            <div><span>{tr('Feature')}</span><strong>{featureLabel(node.feature)}</strong><small>{node.feature}</small></div>
            <div><span>{tr('Threshold')}</span><strong>{compactNumber(node.threshold, 6)}</strong></div>
            <div><span>{tr('Split gain')}</span><strong>{compactNumber(node.gain, 6)}</strong></div>
            <div><span>{tr('Training observations')}</span><strong>{Number(node.count || 0).toLocaleString()}</strong></div>
            <div><span>{tr('Node value')}</span><strong>{compactNumber(node.value, 6)}</strong></div>
            <div><span>{tr('Branches')}</span><strong>≤ {compactNumber(node.threshold, 6)} / &gt; {compactNumber(node.threshold, 6)}</strong></div>
          </> : <>
            <div><span>{tr('Leaf value')}</span><strong>{compactNumber(node.value, 7)}</strong></div>
            <div><span>{tr('Training observations')}</span><strong>{Number(node.count || 0).toLocaleString()}</strong></div>
          </>}
        </div>
      </section>
    </div>
  )
}

export function ResearchTreePanel({ refreshKey = '' }) {
  const [payload, setPayload] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [selectedNode, setSelectedNode] = useState(null)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError('')
    apiFetch(`${API}/dashboard/research-tree`)
      .then((data) => { if (!cancelled) setPayload(data) })
      .catch((requestError) => { if (!cancelled) setError(requestError.message) })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [refreshKey])

  const layout = useMemo(() => payload?.tree?.root ? layoutTree(payload.tree.root) : null, [payload])

  if (loading) {
    return <section className="dashboard-research-tree-section"><div className="dashboard-tree-empty">{tr('Loading latest research tree…')}</div></section>
  }
  if (error) {
    return <section className="dashboard-research-tree-section"><div className="dashboard-tree-empty error">{error}</div></section>
  }

  const strategy = payload?.strategy
  const tree = payload?.tree
  let emptyMessage = tr('No completed research tree is available for the selected Strategy.')
  if (payload?.reason === 'tree_snapshot_not_available') emptyMessage = tr('The latest compatible Backtest predates tree visualization. Run a new Backtest with the selected Strategy to capture its latest tree.')
  if (payload?.reason === 'no_completed_backtest_for_selected_strategy') emptyMessage = tr('Run a Backtest with the selected Strategy to capture its latest analyzed tree.')
  if (payload?.reason === 'no_selected_research_strategy') emptyMessage = tr('Select a Strategy for Strategy Research to display its latest analyzed tree.')

  return (
    <section className="dashboard-research-tree-section">
      <div className="dashboard-section-heading dashboard-tree-heading">
        <div>
          <span className="panel-kicker">{tr('SELECTED RESEARCH MODEL')}</span>
          <h2>{tr('Latest analyzed tree')}</h2>
          <p>{tr('The dashboard shows the last boosting tree trained for the asset used in the final decision of the latest compatible Backtest.')}</p>
        </div>
        {tree ? <div className="dashboard-tree-meta">
          <strong>{strategy?.name || '—'}</strong>
          <span>{tree.asset || '—'} · {tr('Fold')} {tree.fold_position || tree.fold_id || '—'} · {tr('Tree')} {Number(tree.tree_index ?? 0) + 1}/{tree.tree_count || '—'}</span>
        </div> : null}
      </div>

      {!layout ? <div className="dashboard-tree-empty">{emptyMessage}</div> : <>
        <div className="dashboard-tree-summary">
          <div><span>{tr('Asset')}</span><strong>{tree.asset}</strong></div>
          <div><span>{tr('Training through')}</span><strong>{tree.training_end ? new Date(tree.training_end).toLocaleDateString() : '—'}</strong></div>
          <div><span>{tr('Leaves')}</span><strong>{tree.num_leaves ?? '—'}</strong></div>
          <div><span>{tr('Depth')}</span><strong>{tree.depth ?? '—'}</strong></div>
        </div>
        <div className="dashboard-tree-scroll" role="region" aria-label={tr('Latest analyzed tree')} tabIndex={0}>
          <svg className="dashboard-tree-svg" viewBox={`0 0 ${layout.width} ${layout.height}`} width={layout.width} height={layout.height} aria-label={tr('Decision tree visualization')}>
            {layout.edges.map((edge, index) => (
              <g key={`edge-${index}`}>
                <path className="dashboard-tree-edge" d={`M ${edge.from.x} ${edge.from.y + 25} C ${edge.from.x} ${edge.from.y + 65}, ${edge.to.x} ${edge.to.y - 65}, ${edge.to.x} ${edge.to.y - 25}`} />
                <text className="dashboard-tree-edge-label" x={(edge.from.x + edge.to.x) / 2} y={(edge.from.y + edge.to.y) / 2 - 5}>{edge.branch === 'left' ? '≤' : '>'}</text>
              </g>
            ))}
            {layout.nodes.map((item) => {
              const node = item.node
              const isLeaf = node.kind === 'leaf'
              const label = isLeaf ? `${tr('Leaf')} ${Number(node.leaf_index) + 1}` : featureLabel(node.feature)
              const sub = isLeaf ? compactNumber(node.value, 5) : `≤ ${compactNumber(node.threshold, 4)}`
              return (
                <g
                  key={item.id}
                  className={`dashboard-tree-node ${isLeaf ? 'leaf' : 'split'}`}
                  transform={`translate(${item.x},${item.y})`}
                  role="button"
                  tabIndex={0}
                  aria-label={`${label} ${sub}`}
                  onClick={() => setSelectedNode(item)}
                  onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); setSelectedNode(item) } }}
                >
                  <rect x="-60" y="-25" width="120" height="50" rx="9" />
                  <text className="dashboard-tree-node-title" textAnchor="middle" y="-4">{label.length > 18 ? `${label.slice(0, 17)}…` : label}</text>
                  <text className="dashboard-tree-node-sub" textAnchor="middle" y="14">{sub}</text>
                </g>
              )
            })}
          </svg>
        </div>
        <p className="dashboard-tree-caption">{tr('Click any node to inspect the feature, threshold, gain and training observations. This is one tree from the ensemble, not the entire model.')}</p>
      </>}
      <NodeDetail item={selectedNode} onClose={() => setSelectedNode(null)} />
    </section>
  )
}
