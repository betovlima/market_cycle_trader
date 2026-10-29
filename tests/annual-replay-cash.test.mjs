import test from 'node:test'
import assert from 'node:assert/strict'
import { createHash, webcrypto } from 'node:crypto'
import { cashPeriodsFromAnalytics } from '../src/features/backtestReplay/cashPeriodModel.mjs'
import { normalizeAnnualReplay, buildYearReplay, replayChartPath, buildMonthReplay } from '../src/features/backtestReplay/annualReplayModel.mjs'
import { buildLocalReplayDownload, listLocalReplayFiles } from '../src/features/backtestReplay/annualReplayExport.mjs'
if (!globalThis.crypto) globalThis.crypto = webcrypto

const historical = {
  job_id: 'historical-cash-2025',
  equity: [
    { timestamp: '2025-01-02', simulation_equity: 1000, selected_asset: 'NVDA' },
    // A close(t) decision to sell NVDA does not alter closing holdings on t.
    { timestamp: '2025-01-03', simulation_equity: 1000, selected_asset: 'CASH' },
    { timestamp: '2025-01-06', simulation_equity: 1000, selected_asset: 'CASH' },
    { timestamp: '2025-01-07', simulation_equity: 1050, selected_asset: 'MSFT' },
    { timestamp: '2025-01-08', simulation_equity: 1050, selected_asset: 'CASH' },
    { timestamp: '2025-01-09', simulation_equity: 1050, selected_asset: 'CASH' },
    { timestamp: '2025-01-10', simulation_equity: 1060, selected_asset: 'NVDA' },
    { timestamp: '2025-01-13', simulation_equity: 1060 },
    { timestamp: '2025-01-14', simulation_equity: 1060, selected_asset: 'CASH' },
    { timestamp: '2025-01-15', simulation_equity: 1070, selected_asset: 'AVGO' },
  ],
  rotations: [
    // A decision can be recorded at an earlier time: not used as actual close state.
    { executed_at: '2025-01-02T21:00:00Z', from_asset: 'NVDA', to_asset: 'CASH' },
  ],
}

function entriesFromStoredZip(bytes) {
  const data = new Uint8Array(bytes)
  const view = new DataView(data.buffer)
  const entries = new Map()
  const decoder = new TextDecoder()
  let pos = 0
  while (view.getUint32(pos, true) === 0x04034b50) {
    const len = view.getUint32(pos + 18, true)
    const nameLength = view.getUint16(pos + 26, true)
    const extraLength = view.getUint16(pos + 28, true)
    const name = decoder.decode(data.subarray(pos + 30, pos + 30 + nameLength))
    const start = pos + 30 + nameLength + extraLength
    entries.set(name, data.subarray(start, start + len))
    pos = start + len
  }
  assert.equal(view.getUint32(pos, true), 0x02014b50)
  return entries
}

test('only saved closing positions define true CASH periods, not preceding decisions', () => {
  const periods = cashPeriodsFromAnalytics(historical)
  assert.equal(periods.length, 3)
  assert.deepEqual(periods.map(p => ({
    from: p.previous_asset, to: p.next_asset, count: p.observed_cash_sessions,
    first: p.first_cash_session, last: p.last_cash_session, exited: p.exited_at,
    status: p.status,
  })), [
    { from: 'NVDA', to: 'MSFT', count: 2, first: '2025-01-03', last: '2025-01-06', exited: '2025-01-07', status: 'closed' },
    { from: 'MSFT', to: 'NVDA', count: 2, first: '2025-01-08', last: '2025-01-09', exited: '2025-01-10', status: 'closed' },
    { from: null, to: 'AVGO', count: 1, first: '2025-01-14', last: '2025-01-14', exited: '2025-01-15', status: 'closed' },
  ])
})

test('the chart keeps green base and colors only consecutive, observed CASH-to-CASH closing points', () => {
  const year = buildYearReplay(normalizeAnnualReplay(historical), 2025)
  assert.equal(year.sessions[0].closeAsset, 'NVDA')
  assert.equal(year.sessions[1].closeAsset, 'CASH')
  assert.equal(year.sessions[7].closeAsset, null)
  const chart = replayChartPath(year.sessions, year.sessions.length - 1)
  assert.ok(chart.path.startsWith('M'))
  assert.equal(chart.cashPoints.length, 5)
  assert.deepEqual(chart.cashPoints.map(p => p.date), ['2025-01-03', '2025-01-06', '2025-01-08', '2025-01-09', '2025-01-14'])
  assert.equal((chart.cashPath.match(/M/g) || []).length, 2) // 3->6 and 8->9 only
  assert.ok(chart.cashPath.includes(' L'))
  assert.equal(replayChartPath(year.sessions, 0).cashPoints.length, 0)
  assert.equal(replayChartPath(year.sessions, 1).cashPoints.length, 1)
  assert.equal(replayChartPath(year.sessions, 1).cashPath, '') // one confirmed CASH close is only a dot
  const jan = buildMonthReplay(year, 1)
  assert.equal(replayChartPath(jan.sessions, jan.sessions.length - 1).cashPoints.length, 5)
})

test('legacy jobs without position snapshots never show inferred CASH', () => {
  const legacy = { ...historical, equity: historical.equity.map(({ selected_asset, ...row }) => row) }
  assert.deepEqual(cashPeriodsFromAnalytics(legacy), [])
  assert.ok(!listLocalReplayFiles(legacy).files.some(x => x.name === 'cash_periods.csv'))
  const year = buildYearReplay(normalizeAnnualReplay(legacy), 2025)
  assert.equal(replayChartPath(year.sessions, year.sessions.length - 1).cashPoints.length, 0)
  assert.equal(replayChartPath(year.sessions, year.sessions.length - 1).cashPath, '')
})

test('an unknown closing state interrupts a CASH period; it never fills missing sessions', () => {
  const input = {
    equity: [
      { timestamp: '2025-01-02', simulation_equity: 100, selected_asset: 'CASH' },
      { timestamp: '2025-01-03', simulation_equity: 101 },
      { timestamp: '2025-01-06', simulation_equity: 101, selected_asset: 'CASH' },
    ],
  }
  const result = cashPeriodsFromAnalytics(input)
  assert.equal(result.length, 2)
  assert.equal(result[0].status, 'incomplete_record')
  assert.equal(result[0].observed_cash_sessions, 1)
  assert.equal(result[1].status, 'open_at_last_record')
  assert.equal(result[1].observed_cash_sessions, 1)
})

test('cash_periods.csv, selected_asset equity column and matching ZIP manifest checksums', async () => {
  const listing = listLocalReplayFiles(historical)
  assert.ok(listing.files.some(file => file.name === 'cash_periods.csv'))
  const csv = await (await buildLocalReplayDownload(historical, 'cash_periods.csv')).text()
  assert.match(csv, /2025-01-03,NVDA,2025-01-07,MSFT,2,2025-01-03,2025-01-06,closed/)
  const equity = await (await buildLocalReplayDownload(historical, 'equity_history.csv')).text()
  assert.match(equity, /simulation_equity,reference_equity,selected_asset,drawdown/)
  assert.match(equity, /2025-01-02,1000,,NVDA,/)
  const zip = entriesFromStoredZip(await (await buildLocalReplayDownload(historical, 'package.zip')).arrayBuffer())
  assert.ok(zip.has('cash_periods.csv'))
  const manifest = JSON.parse(new TextDecoder().decode(zip.get('manifest.json')))
  assert.equal(manifest.job_id, historical.job_id)
  assert.ok(manifest.files.some(item => item.name === 'cash_periods.csv' && item.rows === 3))
  for (const file of manifest.files) {
    assert.equal(createHash('sha256').update(zip.get(file.name)).digest('hex'), file.sha256)
  }
})
