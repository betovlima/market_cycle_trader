// Read-only projection of persisted Backtest analytics. No model decisions are recomputed.
function dayKey(value) {
  if (value == null) return null
  const parsed = new Date(value)
  return Number.isFinite(parsed.getTime()) ? parsed.toISOString().slice(0, 10) : null
}

function finiteNumber(value) {
  if (value === null || value === undefined || value === '') return null
  const result = Number(value)
  return Number.isFinite(result) ? result : null
}

function asset(value) {
  const normalized = String(value || '').trim().toUpperCase()
  return normalized || null
}

export function normalizeAnnualReplay(payload) {
  const equity = (Array.isArray(payload?.equity) ? payload.equity : [])
    .map((row) => ({
      date: dayKey(row?.timestamp || row?.recorded_at),
      capital: finiteNumber(row?.simulation_equity),
      drawdown: finiteNumber(row?.drawdown),
    }))
    .filter((row) => row.date && row.capital !== null && row.capital >= 0)
    .sort((a, b) => a.date.localeCompare(b.date))
  // Deduplicate repeated intraday snapshots, preserving the last valid observation.
  const byDay = new Map(equity.map((row) => [row.date, row]))
  const dailyEquity = [...byDay.values()].sort((a, b) => a.date.localeCompare(b.date))
  const rotations = (Array.isArray(payload?.rotations) ? payload.rotations : [])
    .map((row, i) => ({
      date: dayKey(row?.executed_at),
      timestamp: String(row?.executed_at || ''),
      order: i,
      from: asset(row?.from_asset),
      to: asset(row?.to_asset),
      realizedPnl: finiteNumber(row?.realized_pnl),
      fee: finiteNumber(row?.transaction_fees),
      reason: row?.buy_reason || row?.sell_reason || null,
    }))
    .filter((row) => row.date && row.from && row.to && row.from !== row.to)
    .sort((a, b) => a.timestamp.localeCompare(b.timestamp) || a.order - b.order)
  // Optional immutable decision snapshot for one EXECUTION date. Existing MCT analytics
  // may not contain this data; never infer past utilities from later prices or trades.
  const scoresByDate = new Map()
  for (const item of (Array.isArray(payload?.decision_scores) ? payload.decision_scores : [])) {
    const date = dayKey(item?.execution_date)
    if (!date) continue
    const top = (Array.isArray(item?.top_scores) ? item.top_scores : [])
      .map((entry) => ({
        asset: asset(entry?.asset || entry?.symbol),
        score: finiteNumber(entry?.score),
      }))
      .filter((entry) => entry.asset && entry.score !== null)
      .sort((a, b) => b.score - a.score || a.asset.localeCompare(b.asset))
      .slice(0, 5)
    scoresByDate.set(date, {
      decisionDate: dayKey(item?.decision_date),
      before: asset(item?.current_asset),
      beforeScore: finiteNumber(item?.current_score),
      best: asset(item?.best_asset) || top[0]?.asset || null,
      bestScore: finiteNumber(item?.best_score),
      candidateCount: Number.isInteger(Number(item?.finite_score_count)) && Number(item.finite_score_count) > 0
        ? Number(item.finite_score_count)
        : null,
      top,
      reason: typeof item?.decision_reason === 'string' ? item.decision_reason : null,
      margin: finiteNumber(item?.effective_switch_margin),
      gap: finiteNumber(item?.best_vs_current_gap),
      holdingDays: finiteNumber(item?.holding_days_at_decision),
      heldByMinimum: item?.min_hold_guard_applied === true,
      heldByMargin: item?.switch_margin_guard_applied === true,
      target: asset(item?.final_action_asset),
    })
  }
  return { equity: dailyEquity, rotations, scoresByDate }
}

export function replayYears(analytics) {
  return [...new Set(analytics.equity.map((row) => Number(row.date.slice(0, 4))))]
    .sort((a, b) => b - a)
}

export function buildYearReplay(analytics, year) {
  const chosen = Number(year)
  const rows = analytics.equity.filter((row) => Number(row.date.slice(0, 4)) === chosen)
  if (!rows.length) return { sessions: [], rotations: [], baseline: null, lastCapital: null, change: null }
  const start = rows[0].date
  const end = rows[rows.length - 1].date
  const historical = analytics.equity.filter((row) => row.date < start)
  const baseline = historical.length ? historical[historical.length - 1].capital : rows[0].capital
  const withinYear = analytics.rotations.filter((row) => row.date >= start && row.date <= end)
  let nextMovement = 0
  let currentAsset = analytics.rotations[0]?.from || null
  const sessions = rows.map((row) => {
    const events = []
    while (nextMovement < analytics.rotations.length && analytics.rotations[nextMovement].date <= row.date) {
      const movement = analytics.rotations[nextMovement]
      currentAsset = movement.to
      if (movement.date === row.date) events.push(movement)
      nextMovement += 1
    }
    return { ...row, asset: currentAsset, events, scores: analytics.scoresByDate?.get(row.date) || null }
  })
  const lastCapital = sessions[sessions.length - 1].capital
  const change = baseline > 0 ? lastCapital / baseline - 1 : null
  return { sessions, rotations: withinYear, baseline, lastCapital, change }
}

export function replayChartPath(sessions, selectedIndex, width = 880, height = 195) {
  if (!sessions.length) return { path: '', area: '', dot: null }
  const last = Math.max(0, Math.min(sessions.length - 1, selectedIndex))
  const values = sessions.map((row) => row.capital)
  const min = Math.min(...values)
  const max = Math.max(...values)
  const spread = max - min || Math.max(1, Math.abs(max) * 0.01)
  const padding = 15
  const points = sessions.slice(0, last + 1).map((row, i) => ({
    x: padding + (i / Math.max(sessions.length - 1, 1)) * (width - 2 * padding),
    y: height - padding - ((row.capital - min) / spread) * (height - 2 * padding),
  }))
  const path = points.map((point, i) => `${i ? 'L' : 'M'}${point.x.toFixed(2)} ${point.y.toFixed(2)}`).join(' ')
  const dot = points[points.length - 1]
  return { path, dot, min, max }
}
