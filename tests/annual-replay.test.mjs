import test from 'node:test'
import assert from 'node:assert/strict'
import { normalizeAnnualReplay, replayYears, buildYearReplay, replayChartPath, lastRecordedRotationSessionIndex } from '../src/features/backtestReplay/annualReplayModel.mjs'

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
