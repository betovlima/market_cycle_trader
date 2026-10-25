import test from 'node:test'
import assert from 'node:assert/strict'
import { normalizeAnnualReplay, replayYears, buildYearReplay, replayChartPath } from '../src/features/backtestReplay/annualReplayModel.mjs'

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

test('annual replay preserves positions on sessions without trades', () => {
  const year = buildYearReplay(snapshot, 2025)
  assert.equal(year.sessions.length, 4)
  assert.deepEqual(year.sessions.map((row) => row.asset), ['AVGO', 'AVGO', 'LLY', 'LLY'])
  assert.deepEqual(year.sessions.map((row) => row.events.length), [0, 0, 1, 0])
  assert.equal(year.baseline, 1000)
  assert.equal(year.change, 0.04)
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
