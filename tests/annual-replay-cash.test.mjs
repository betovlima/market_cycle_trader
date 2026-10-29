import test from 'node:test'
import assert from 'node:assert/strict'
import { createHash, webcrypto } from 'node:crypto'
import { cashPeriodsFromAnalytics } from '../src/features/backtestReplay/cashPeriodModel.mjs'
import { buildLocalReplayDownload, listLocalReplayFiles } from '../src/features/backtestReplay/annualReplayExport.mjs'
if (!globalThis.crypto) globalThis.crypto = webcrypto

const historical = {
  job_id: 'historical-cash-2025',
  equity: [
    { timestamp: '2025-01-02', simulation_equity: 1000 },
    { timestamp: '2025-01-03', simulation_equity: 1000 },
    { timestamp: '2025-01-06', simulation_equity: 1050 },
    { timestamp: '2025-01-07', simulation_equity: 1050 },
    { timestamp: '2025-01-08', simulation_equity: 1050 },
  ],
  rotations: [
    { executed_at: '2025-01-02T14:00:00Z', from_asset: 'NVDA', to_asset: 'CASH' },
    { executed_at: '2025-01-06T14:00:00Z', from_asset: 'CASH', to_asset: 'MSFT' },
    { executed_at: '2025-01-07T14:00:00Z', from_asset: 'MSFT', to_asset: 'CASH' },
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

test('cash audit counts only observed equity closing sessions between saved entry and exit', () => {
  const periods = cashPeriodsFromAnalytics(historical)
  assert.equal(periods.length, 2)
  assert.deepEqual(periods.map(item => ({
    from: item.previous_asset, to: item.next_asset, count: item.observed_cash_sessions,
    first: item.first_cash_session, last: item.last_cash_session, status: item.status,
  })), [
    { from: 'NVDA', to: 'MSFT', count: 2, first: '2025-01-02', last: '2025-01-03', status: 'closed' },
    { from: 'MSFT', to: null, count: 2, first: '2025-01-07', last: '2025-01-08', status: 'open_at_last_record' },
  ])
})

test('intraday cash entry and exit on the same session is not counted as cash at close', () => {
  const input = {
    equity: [{ timestamp: '2025-01-02', simulation_equity: 100 }],
    rotations: [
      { executed_at: '2025-01-02T14:00:00Z', from_asset: 'NVDA', to_asset: 'CASH' },
      { executed_at: '2025-01-02T14:01:00Z', from_asset: 'CASH', to_asset: 'AVGO' },
    ],
  }
  const [period] = cashPeriodsFromAnalytics(input)
  assert.equal(period.observed_cash_sessions, 0)
  assert.equal(period.status, 'closed')
  assert.equal(period.exited_at, '2025-01-02T14:01:00Z')
})

test('initial CASH and missing rotations are not presented as confirmed entries', () => {
  assert.deepEqual(cashPeriodsFromAnalytics({ equity: [{ timestamp: '2025-01-02', simulation_equity: 100 }] }), [])
  assert.deepEqual(cashPeriodsFromAnalytics({
    equity: [{ timestamp: '2025-01-02', simulation_equity: 100 }],
    rotations: [{ executed_at: '2025-01-03T14:00:00Z', from_asset: 'CASH', to_asset: 'NVDA' }],
  }), [])
  assert.ok(!listLocalReplayFiles({ ...historical, rotations: [] }).files.some(item => item.name === 'cash_periods.csv'))
})

test('incomplete history does not claim continued CASH exposure after contradictory transition', () => {
  const input = {
    equity: historical.equity,
    rotations: [
      { executed_at: '2025-01-02T14:00:00Z', from_asset: 'NVDA', to_asset: 'CASH' },
      { executed_at: '2025-01-06T14:00:00Z', from_asset: 'MSFT', to_asset: 'AAPL' },
    ],
  }
  const [period] = cashPeriodsFromAnalytics(input)
  assert.equal(period.status, 'inconsistent_record')
  assert.equal(period.observed_cash_sessions, 2)
})

test('cash_periods.csv and manifest are in downloadable package.zip with valid checksums', async () => {
  const listing = listLocalReplayFiles(historical)
  assert.ok(listing.files.some(file => file.name === 'cash_periods.csv'))
  const cashCsv = await (await buildLocalReplayDownload(historical, 'cash_periods.csv')).text()
  assert.match(cashCsv, /2025-01-02T14:00:00Z,NVDA,2025-01-06T14:00:00Z,MSFT,2,2025-01-02,2025-01-03,closed/)
  assert.match(cashCsv, /open_at_last_record/)
  const zip = entriesFromStoredZip(await (await buildLocalReplayDownload(historical, 'package.zip')).arrayBuffer())
  assert.ok(zip.has('cash_periods.csv'))
  const manifest = JSON.parse(new TextDecoder().decode(zip.get('manifest.json')))
  assert.equal(manifest.job_id, historical.job_id)
  assert.ok(manifest.files.some(item => item.name === 'cash_periods.csv' && item.rows === 2))
  for (const file of manifest.files) {
    assert.equal(createHash('sha256').update(zip.get(file.name)).digest('hex'), file.sha256)
  }
})
