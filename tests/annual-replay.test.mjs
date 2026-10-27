import test from 'node:test'
import assert from 'node:assert/strict'
import { normalizeAnnualReplay, replayYears, replayMonths, buildYearReplay, buildMonthReplay, replayChartPath, lastRecordedRotationSessionIndex } from '../src/features/backtestReplay/annualReplayModel.mjs'
import { replaySelectionHelpExample } from '../src/features/backtestReplay/annualReplayHelpModel.mjs'

const snapshot = normalizeAnnualReplay({
  equity: [
    { timestamp: '2024-12-31T20:00:00Z', simulation_equity: 1000 },
    { timestamp: '2025-01-02T20:00:00Z', simulation_equity: 1080 },
    { timestamp: '2025-01-03T20:00:00Z', simulation_equity: 1100 },
    { timestamp: '2025-01-06T20:00:00Z', simulation_equity: 1030 },
    { timestamp: '2025-01-07T20:00:00Z', simulation_equity: 1040 },
  ],
  rotations: [
    { executed_at: '2024-12-27T14:30:00Z', from_asset: 'CASH', to_asset: 'AVGO' },
    { executed_at: '2025-01-06T14:30:00Z', from_asset: 'AVGO', to_asset: 'LLY', realized_pnl: -70 },
  ],
})

test('header final capital matches only the persisted Backtest summary across replay years', () => {
  const full = normalizeAnnualReplay({
    metrics: { ending_capital: 76800117.54 },
    equity: [
      { timestamp: '2025-12-31', simulation_equity: 200000 },
      { timestamp: '2026-01-05', simulation_equity: 205000 },
    ],
  })
  assert.equal(full.finalCapital, 76800117.54)
  assert.equal(buildYearReplay(full, 2025).lastCapital, 200000)
  assert.equal(buildYearReplay(full, 2026).lastCapital, 205000)
  assert.equal(full.finalCapital, 76800117.54)
  assert.equal(normalizeAnnualReplay({ metrics: {}, equity: [{timestamp:'2026-01-05',simulation_equity:205000}] }).finalCapital, null)
  assert.equal(normalizeAnnualReplay({ metrics: {ending_capital:'invalid'} }).finalCapital, null)
  assert.equal(normalizeAnnualReplay({ metrics: {ending_capital:'12345.67'} }).finalCapital, 12345.67)
  assert.equal(normalizeAnnualReplay({ metrics: {ending_capital:0} }).finalCapital, 0)
})

test('annual replay preserves positions on sessions without trades', () => {
  const year = buildYearReplay(snapshot, 2025)
  assert.equal(year.sessions.length, 4)
  assert.deepEqual(year.sessions.map((row) => row.asset), ['AVGO', 'AVGO', 'LLY', 'LLY'])
  assert.deepEqual(year.sessions.map((row) => row.events.length), [0, 0, 1, 0])
  assert.equal(year.baseline, 1000)
  assert.ok(Math.abs(year.change - 0.04) < 1e-12)
})

test('years are derived from persisted equity observations, not invented', () => {
  assert.deepEqual(replayYears(snapshot), [2025, 2024])
  assert.equal(buildYearReplay(snapshot, 2023).sessions.length, 0)
})

test('malformed rows cannot become zero-value equity or fake moves', () => {
  const data = normalizeAnnualReplay({
    equity: [
      { timestamp: '2025-01-02', simulation_equity: null },
      { timestamp: '2025-01-03', simulation_equity: 200 },
      { timestamp: '2025-01-03', simulation_equity: 220 },
    ],
    rotations: [
      { executed_at: '2025-01-03T14:30:00Z', from_asset: 'AVGO', to_asset: 'AVGO' },
    ],
  })
  assert.equal(data.equity.length, 1)
  assert.equal(data.equity[0].capital, 220)
  assert.deepEqual(data.rotations, [])
})

test('first event can predate selected year; chart reveals only played prefix', () => {
  const year = buildYearReplay(snapshot, 2025)
  assert.equal(year.rotations.length, 1)
  assert.equal(replayChartPath(year.sessions, 0).path.includes('L'), false)
  assert.ok(replayChartPath(year.sessions, 3).path.includes('L'))
})

test('portfolio asset stays unavailable when movements are absent', () => {
  const data = normalizeAnnualReplay({ equity: [{ timestamp: '2025-01-03', simulation_equity: 100 }], rotations: [] })
  assert.equal(buildYearReplay(data, 2025).sessions[0].asset, null)
})


test('score panel uses only explicitly persisted execution-date decision scores', () => {
  const raw = normalizeAnnualReplay({
    equity: [
      { timestamp: '2025-04-01T20:00:00Z', simulation_equity: 1200 },
      { timestamp: '2025-04-02T20:00:00Z', simulation_equity: 1220 },
    ],
    rotations: [{ executed_at: '2025-04-02T13:30:00Z', from_asset: 'AVGO', to_asset: 'LLY' }],
    decision_scores: [{
      execution_date: '2025-04-02',
      decision_date: '2025-04-01',
      current_asset: 'AVGO',
      current_score: 0.374561,
      best_asset: 'LLY',
      best_score: 0.407450,
      finite_score_count: 75,
      top_scores: [
        { asset: 'AVGO', score: 0.374561 },
        { asset: 'LLY', score: 0.407450 },
        { asset: 'TSLA', score: 0.331510 },
      ],
    }],
  })
  const sessions = buildYearReplay(raw, 2025).sessions
  assert.equal(sessions[0].scores, null)
  assert.equal(sessions[1].scores.before, 'AVGO')
  assert.equal(sessions[1].scores.best, 'LLY')
  assert.equal(sessions[1].scores.candidateCount, 75)
  assert.deepEqual(sessions[1].scores.top.map((entry) => entry.asset), ['LLY', 'AVGO', 'TSLA'])
})

test('malformed scores never become fabricated zeroes or new candidates', () => {
  const result = normalizeAnnualReplay({
    equity: [{ timestamp: '2025-01-02', simulation_equity: 100 }],
    decision_scores: [{ execution_date: '2025-01-02', top_scores: [
      { asset: 'LLY', score: undefined },
      { asset: 'AVGO', score: 0.1 },
    ] }],
  })
  const row = buildYearReplay(result, 2025).sessions[0]
  assert.deepEqual(row.scores.top, [{ asset: 'AVGO', score: 0.1 }])
  assert.equal(row.scores.best, 'AVGO')
  assert.equal(row.scores.candidateCount, null)
})


test('execution-date score diagnostics include threshold and decision reason', () => {
  const replay = normalizeAnnualReplay({
    equity: [{ timestamp: '2025-04-02', simulation_equity: 110 }],
    decision_scores: [{
      execution_date: '2025-04-02', decision_date: '2025-04-01',
      current_asset: 'AVGO', current_score: 0.374561,
      best_asset: 'LLY', best_score: 0.407450,
      best_vs_current_gap: 0.032889, effective_switch_margin: 0.010,
      decision_reason: 'ROTATE_TO_BEST_ASSET',
      top_scores: [
        { asset: 'LLY', score: 0.407450 }, { asset: 'AVGO', score: 0.374561 },
        { asset: 'TSLA', score: 0.330 }, { asset: 'NVDA', score: 0.315 },
        { asset: 'MSFT', score: 0.300 },
      ],
    }],
  })
  const record = buildYearReplay(replay, 2025).sessions[0].scores
  assert.equal(record.top.length, 5)
  assert.equal(record.margin, 0.010)
  assert.equal(record.gap, 0.032889)
  assert.equal(record.reason, 'ROTATE_TO_BEST_ASSET')
})


test('last rotation is reachable even with three later trading sessions', () => {
  const replay = normalizeAnnualReplay({
    equity: [
      { timestamp: '2026-10-20', simulation_equity: 100 },
      { timestamp: '2026-10-21', simulation_equity: 101 },
      { timestamp: '2026-10-22', simulation_equity: 102 },
      { timestamp: '2026-10-23', simulation_equity: 103 },
    ],
    rotations: [{ executed_at: '2026-10-20T13:30:00Z', from_asset: 'ADEA', to_asset: 'CAPR' }],
  })
  const sessions = buildYearReplay(replay, 2026).sessions
  assert.equal(lastRecordedRotationSessionIndex(sessions), 0)
  assert.equal(sessions.length - 1, 3)
  assert.equal(sessions[lastRecordedRotationSessionIndex(sessions)].date, '2026-10-20')
  assert.equal(sessions.at(-1).date, '2026-10-23')
  assert.equal(lastRecordedRotationSessionIndex([{ date: '2026-10-23', events: [] }]), -1)
})

test('selection help uses persisted scores, margin, holding period and decision reason', () => {
  const values = replaySelectionHelpExample({
    before: 'AVGO', beforeScore: 0.374561, best: 'LLY', bestScore: 0.407450,
    margin: 0.01, holdingDays: 2, reason: 'ROTATE_TO_BEST_ASSET',
    top: [{asset:'LLY', score:0.407450}, {asset:'AVGO', score:0.374561}],
  })
  assert.equal(values.recorded, true)
  assert.equal(values.best, 'LLY')
  assert.equal(values.before, 'AVGO')
  assert.ok(Math.abs(values.advantage - 0.032889) < 1e-10)
  assert.equal(values.margin, 0.01)
  assert.equal(values.holdingDays, 2)
  assert.equal(values.reason, 'ROTATE_TO_BEST_ASSET')
})

test('selection help may reuse actual saved ranking without inventing a decision margin', () => {
  const values = replaySelectionHelpExample({
    before: 'AVGO', best: 'LLY', margin: null,
    top: [{asset:'LLY', score:0.4}, {asset:'AVGO', score:0.3}],
  })
  assert.equal(values.recorded, true)
  assert.equal(values.bestScore, 0.4)
  assert.equal(values.beforeScore, 0.3)
  assert.equal(values.margin, null)
})

test('selection help falls back to an explicitly illustrative scenario when real scores are incomplete', () => {
  const values = replaySelectionHelpExample({ before:'AVGO', best:'LLY', beforeScore:null, bestScore:null })
  assert.equal(values.recorded, false)
  assert.equal(values.before, 'AVGO')
  assert.equal(values.best, 'LLY')
  assert.equal(values.advantage, 0.032889)
  assert.equal(replaySelectionHelpExample(null).recorded, false)
})

test('month drill-down isolates recorded trades and equity without changing the annual view', () => {
  const data = normalizeAnnualReplay({
    metrics: { ending_capital: 9876543 },
    equity: [
      { timestamp: '2024-12-31', simulation_equity: 1000 },
      { timestamp: '2025-01-02', simulation_equity: 1030 },
      { timestamp: '2025-01-31', simulation_equity: 1100 },
      { timestamp: '2025-02-03', simulation_equity: 1060 },
      { timestamp: '2025-02-04', simulation_equity: 1090 },
      { timestamp: '2025-03-03', simulation_equity: 1210 },
    ],
    rotations: [
      { executed_at: '2025-01-02T14:30:00Z', from_asset: 'CASH', to_asset: 'AVGO' },
      { executed_at: '2025-02-03T14:30:00Z', from_asset: 'AVGO', to_asset: 'LLY', realized_pnl: -40, transaction_fees: 2 },
      { executed_at: '2025-03-03T14:30:00Z', from_asset: 'LLY', to_asset: 'NVDA', realized_pnl: 120 },
    ],
    decision_scores: [{
      execution_date: '2025-02-03', current_asset: 'AVGO',
      best_asset: 'LLY', best_score: 0.4,
    }],
  })
  const year = buildYearReplay(data, 2025)
  const february = buildMonthReplay(year, '2')
  assert.deepEqual(replayMonths(year), [1,2,3])
  assert.equal(year.sessions.length, 5)
  assert.equal(february.sessions.length, 2)
  assert.deepEqual(february.sessions.map((row) => row.date), ['2025-02-03','2025-02-04'])
  assert.deepEqual(february.sessions.map((row) => row.asset), ['LLY','LLY'])
  assert.equal(february.rotations.length, 1)
  assert.equal(february.rotations[0].realizedPnl, -40)
  assert.equal(february.rotations[0].fee, 2)
  assert.equal(february.sessions[0].scores.best, 'LLY')
  assert.equal(february.baseline, 1100) // January 31 close, not Feb 03 close
  assert.equal(february.lastCapital, 1090)
  assert.ok(Math.abs(february.change - (1090/1100 - 1)) < 1e-12)
  assert.equal(replayChartPath(february.sessions, 0).path.includes('L'), false)
  assert.equal(replayChartPath(february.sessions, 1).path.includes('L'), true)
  assert.equal(data.finalCapital, 9876543)
  assert.equal(year.sessions.length, 5)
  assert.equal(year.rotations.length, 3)
})

test('first selected month correctly inherits annual baseline when prior equity belongs to earlier year', () => {
  const year = buildYearReplay(snapshot, 2025)
  const january = buildMonthReplay(year, 1)
  assert.equal(january.baseline, 1000)
  assert.equal(january.lastCapital, 1040)
  assert.equal(january.change, year.change)
  assert.equal(january.sessions.length, year.sessions.length)
})

test('missing months do not fabricate observations, events, or capital amounts', () => {
  const year = buildYearReplay(snapshot, 2025)
  const empty = buildMonthReplay(year, 9)
  assert.equal(empty.sessions.length, 0)
  assert.equal(empty.rotations.length, 0)
  assert.equal(empty.baseline, null)
  assert.equal(empty.lastCapital, null)
  assert.equal(empty.change, null)
  assert.deepEqual(replayMonths(null), [])
  assert.equal(buildMonthReplay(null, 1).sessions.length, 0)
  assert.equal(buildMonthReplay(year, 'invalid').sessions.length, 0)
})
