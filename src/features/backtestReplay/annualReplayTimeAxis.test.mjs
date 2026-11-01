import test from 'node:test'
import assert from 'node:assert/strict'
import { replayChartTimeTicks } from './annualReplayModel.mjs'

test('annual time axis labels each recorded month once, including the year boundary', () => {
  const sessions = [
    { date: '2025-12-30', capital: 100 },
    { date: '2025-12-31', capital: 101 },
    { date: '2026-01-02', capital: 102 },
    { date: '2026-01-05', capital: 103 },
    { date: '2026-03-02', capital: 104 },
  ]
  const ticks = replayChartTimeTicks(sessions)
  assert.deepEqual(ticks.map((tick) => tick.date), ['2025-12-30', '2026-01-02', '2026-03-02'])
  assert.ok(Math.abs(ticks[0].x - 101.35) < 1e-9)
  assert.ok(Math.abs(ticks[2].x - 857.85) < 1e-9)
  assert.ok(ticks[0].x < ticks[1].x && ticks[1].x < ticks[2].x)
})

test('monthly drill-down uses at most five genuine execution-session dates', () => {
  const sessions = Array.from({ length: 21 }, (_, index) => ({
    date: '2026-10-' + String(index + 1).padStart(2, '0'),
    capital: 10_000 + index,
  }))
  const ticks = replayChartTimeTicks(sessions, true)
  assert.deepEqual(ticks.map((tick) => tick.date), [
    '2026-10-01', '2026-10-06', '2026-10-11', '2026-10-16', '2026-10-21',
  ])
  assert.equal(new Set(ticks.map((tick) => tick.date)).size, ticks.length)
})

test('empty or single-session periods are safe', () => {
  assert.deepEqual(replayChartTimeTicks([]), [])
  const only = replayChartTimeTicks([{ date: '2026-10-30', capital: 10_000 }], true)
  assert.equal(only.length, 1)
  assert.ok(Number.isFinite(only[0].x))
  assert.equal(only[0].date, '2026-10-30')
})
