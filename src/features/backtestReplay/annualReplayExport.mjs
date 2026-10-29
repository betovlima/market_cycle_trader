/** Historical replay exports using only values already returned by the read-only analytics API.
 *
 * This fallback deliberately does not fetch underlying Mongo collections, rerun models,
 * or pretend to recreate original training data. It supports older servers without
 * /analytics/backtests/{job_id}/files and older completed jobs with sparse histories.
 */
const ENCODER = new TextEncoder()

const EQUITY = ['timestamp', 'simulation_equity', 'reference_equity', 'drawdown']
const ROTATIONS = ['executed_at', 'from_asset', 'to_asset', 'realized_pnl', 'transaction_fees', 'buy_reason', 'sell_reason']
const SCORES = [
  'execution_date', 'decision_date', 'current_asset', 'current_score',
  'best_asset', 'best_score', 'finite_score_count', 'decision_reason',
  'final_action_asset', 'holding_days_at_decision', 'effective_switch_margin',
  'best_vs_current_gap', 'min_hold_guard_applied', 'switch_margin_guard_applied',
  'cash_threshold_guard_applied', 'minimum_expected_edge_guard_applied',
  ...Array.from({ length: 5 }, (_, i) => i + 1).flatMap(rank => ['top_' + rank + '_asset', 'top_' + rank + '_score']),
]
export const REPLAY_EXPORT_NAMES = [
  'equity_history.csv', 'rotations.csv', 'decision_scores.csv',
  'metrics.json', 'analytics.json', 'manifest.json', 'package.zip',
]

function hasRows(value) {
  return Array.isArray(value) && value.length > 0
}

export function listLocalReplayFiles(analytics) {
  if (!analytics?.job_id) return null
  const names = []
  if (hasRows(analytics.equity)) names.push('equity_history.csv')
  if (hasRows(analytics.rotations)) names.push('rotations.csv')
  if (hasRows(analytics.decision_scores)) names.push('decision_scores.csv')
  if (analytics.metrics && Object.keys(analytics.metrics).length ||
      analytics.rotation_summary && Object.keys(analytics.rotation_summary).length) names.push('metrics.json')
  names.push('analytics.json', 'manifest.json', 'package.zip')
  return {
    job_id: String(analytics.job_id),
    source: 'persisted_backtest_analytics_browser',
    files: names.map(name => ({ name, bytes: null })),
  }
}

function csvCell(value) {
  if (value === null || value === undefined) return ''
  // Keep numeric negatives numeric; formula escaping applies only to text cells.
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  let text = typeof value === 'object' ? JSON.stringify(value) : String(value)
  if (/^[=+\-@\t\r\n]/.test(text)) text = "'" + text
  return /[",\r\n]/.test(text) ? '"' + text.replace(/"/g, '""') + '"' : text
}
function csvBytes(rows, columns) {
  const lines = [columns.join(',')]
  for (const row of rows) lines.push(columns.map(key => csvCell(row?.[key])).join(','))
  return ENCODER.encode('\ufeff' + lines.join('\n') + '\n')
}
function scoreRows(rows) {
  return rows.map(row => {
    const score = { ...row }
    for (const [i, candidate] of (Array.isArray(row?.top_scores) ? row.top_scores : []).slice(0, 5).entries()) {
      score['top_' + (i + 1) + '_asset'] = candidate?.asset
      score['top_' + (i + 1) + '_score'] = candidate?.score
    }
    return score
  })
}
function jsonBytes(value) {
  return ENCODER.encode(JSON.stringify(value, null, 2) + '\n')
}
function hexadecimal(bytes) {
  return Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('')
}
async function sha256(bytes) {
  if (!globalThis.crypto?.subtle) throw new Error('SHA-256 requires HTTPS or localhost.')
  return hexadecimal(new Uint8Array(await globalThis.crypto.subtle.digest('SHA-256', bytes)))
}

async function makeFiles(analytics) {
  if (!analytics?.job_id) throw new Error('Selected Backtest is unavailable.')
  const files = new Map()
  const rows = new Map()
  if (hasRows(analytics.equity)) {
    files.set('equity_history.csv', csvBytes(analytics.equity, EQUITY))
    rows.set('equity_history.csv', analytics.equity.length)
  }
  if (hasRows(analytics.rotations)) {
    files.set('rotations.csv', csvBytes(analytics.rotations, ROTATIONS))
    rows.set('rotations.csv', analytics.rotations.length)
  }
  if (hasRows(analytics.decision_scores)) {
    files.set('decision_scores.csv', csvBytes(scoreRows(analytics.decision_scores), SCORES))
    rows.set('decision_scores.csv', analytics.decision_scores.length)
  }
  if ((analytics.metrics && Object.keys(analytics.metrics).length) ||
      (analytics.rotation_summary && Object.keys(analytics.rotation_summary).length)) {
    files.set('metrics.json', jsonBytes(Object.fromEntries([
      'metrics', 'rotation_summary', 'monthly_returns', 'consistency',
      'drawdown_episodes', 'asset_attribution', 'transition_matrix',
      'holding_buckets', 'trade_dependency',
    ].map(key => [key, analytics[key] ?? null]))))
  }
  files.set('analytics.json', jsonBytes(analytics))

  const checksums = []
  for (const [name, body] of files) {
    const entry = { name, bytes: body.byteLength, sha256: await sha256(body) }
    if (rows.has(name)) entry.rows = rows.get(name)
    checksums.push(entry)
  }
  const manifest = {
    schema_version: 1,
    job_id: analytics.job_id,
    created_at: analytics.created_at ?? null,
    finished_at: analytics.finished_at ?? null,
    source: 'persisted_backtest_analytics',
    export_method: 'browser_from_read_only_analytics_api',
    scope: 'One completed Backtest selected in Annual Replay; all available years',
    limitations: 'Generated from persisted analytics, not original research inputs, training datasets, model binaries or source code. Does not by itself establish scientific reproducibility. Missing records are not reconstructed.',
    csv_note: 'Spreadsheet formula-like strings are escaped; analytics.json contains the response values as received.',
    files: checksums,
  }
  files.set('manifest.json', jsonBytes(manifest))
  return files
}

function crc32(bytes) {
  let crc = 0xffffffff
  for (const byte of bytes) {
    crc ^= byte
    for (let i = 0; i < 8; i++) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0)
  }
  return (crc ^ 0xffffffff) >>> 0
}
function u16(view, offset, value) { view.setUint16(offset, value, true) }
function u32(view, offset, value) { view.setUint32(offset, value, true) }

/** Minimal standards-compliant ZIP writer (STORE method, no third-party package). */
export function zipStored(files) {
  if (files.length > 65535) throw new Error('Too many files for ZIP.')
  const parts = []
  const central = []
  let position = 0
  let centralSize = 0
  for (const [name, data] of files) {
    if (!(data instanceof Uint8Array)) throw new Error('ZIP entries must be bytes.')
    if (data.length > 0xffffffff || position > 0xffffffff) throw new Error('Backtest archive exceeds ZIP32 limits.')
    const nameBytes = ENCODER.encode(name)
    const crc = crc32(data)
    const local = new Uint8Array(30 + nameBytes.length)
    const lv = new DataView(local.buffer)
    u32(lv, 0, 0x04034b50)
    u16(lv, 4, 20)
    u32(lv, 14, crc)
    u32(lv, 18, data.length)
    u32(lv, 22, data.length)
    u16(lv, 26, nameBytes.length)
    local.set(nameBytes, 30)
    const directory = new Uint8Array(46 + nameBytes.length)
    const cv = new DataView(directory.buffer)
    u32(cv, 0, 0x02014b50)
    u16(cv, 4, 20)
    u16(cv, 6, 20)
    u32(cv, 16, crc)
    u32(cv, 20, data.length)
    u32(cv, 24, data.length)
    u16(cv, 28, nameBytes.length)
    u32(cv, 42, position)
    directory.set(nameBytes, 46)
    parts.push(local, data)
    central.push(directory)
    position += local.byteLength + data.byteLength
    centralSize += directory.byteLength
  }
  if (position + centralSize > 0xffffffff) throw new Error('Backtest archive exceeds ZIP32 limits.')
  const end = new Uint8Array(22)
  const ev = new DataView(end.buffer)
  u32(ev, 0, 0x06054b50)
  u16(ev, 8, files.length)
  u16(ev, 10, files.length)
  u32(ev, 12, centralSize)
  u32(ev, 16, position)
  return new Blob([...parts, ...central, end], { type: 'application/zip' })
}

export async function buildLocalReplayDownload(analytics, filename) {
  if (!REPLAY_EXPORT_NAMES.includes(filename)) throw new Error('File is not available.')
  const files = await makeFiles(analytics)
  if (filename === 'package.zip') {
    return zipStored([...files.entries()])
  }
  if (!files.has(filename)) throw new Error('File was not recorded in this backtest.')
  return new Blob([files.get(filename)], {
    type: filename.endsWith('.csv') ? 'text/csv; charset=utf-8' : 'application/json; charset=utf-8',
  })
}
