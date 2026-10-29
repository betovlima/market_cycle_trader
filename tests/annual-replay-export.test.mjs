import test from 'node:test'
import assert from 'node:assert/strict'
import { createHash, webcrypto } from 'node:crypto'
import {
  buildLocalReplayDownload,
  listLocalReplayFiles,
  zipStored,
} from '../src/features/backtestReplay/annualReplayExport.mjs'

if (!globalThis.crypto) globalThis.crypto = webcrypto

const HISTORICAL = {
  job_id: '20200320-old-completed',
  created_at: '2020-03-20T12:00:00Z',
  finished_at: '2020-03-21T12:00:00Z',
  metrics: { ending_capital: 1500.75 },
  equity: [
    { timestamp: '2020-03-19', simulation_equity: 1000, reference_equity: 1000, drawdown: 0 },
    { timestamp: '2020-03-20', simulation_equity: 1500.75, reference_equity: 990, drawdown: -0.01 },
  ],
  rotations: [
    { executed_at: '2020-03-20', from_asset: 'CASH', to_asset: 'AAPL', buy_reason: '=SUM(1,1)' },
  ],
  decision_scores: [],
}

async function bytes(blob) { return new Uint8Array(await blob.arrayBuffer()) }
function readZipStore(data) {
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength)
  const decoder = new TextDecoder()
  const content = new Map()
  let offset = 0
  while (view.getUint32(offset, true) === 0x04034b50) {
    assert.equal(view.getUint16(offset + 8, true), 0, 'no compression')
    const length = view.getUint32(offset + 18, true)
    const nameLength = view.getUint16(offset + 26, true)
    const extraLength = view.getUint16(offset + 28, true)
    const name = decoder.decode(data.subarray(offset + 30, offset + 30 + nameLength))
    const start = offset + 30 + nameLength + extraLength
    content.set(name, data.subarray(start, start + length))
    offset = start + length
  }
  assert.equal(view.getUint32(offset, true), 0x02014b50, 'central directory exists')
  return content
}

test('old completed backtest offers historical files without rerunning', () => {
  const listing = listLocalReplayFiles(HISTORICAL)
  assert.equal(listing.job_id, '20200320-old-completed')
  assert.deepEqual(listing.files.map(f => f.name), [
    'equity_history.csv', 'rotations.csv', 'metrics.json',
    'analytics.json', 'manifest.json', 'package.zip',
  ])
  assert.equal(listLocalReplayFiles({ ...HISTORICAL, job_id: null }), null)
  assert.deepEqual(listLocalReplayFiles({ job_id: 'empty' }).files.map(f => f.name), [
    'analytics.json', 'manifest.json', 'package.zip',
  ])
})

test('CSV uses recorded numbers and escapes spreadsheet formulas', async () => {
  const csv = await (await buildLocalReplayDownload(HISTORICAL, 'equity_history.csv')).text()
  assert.match(csv, /2020-03-20,1500\.75,990,-0\.01/)
  const rot = await (await buildLocalReplayDownload(HISTORICAL, 'rotations.csv')).text()
  assert.match(rot, /"'=SUM\(1,1\)"/)
  const json = JSON.parse(await (await buildLocalReplayDownload(HISTORICAL, 'analytics.json')).text())
  assert.equal(json.rotations[0].buy_reason, '=SUM(1,1)')
  await assert.rejects(buildLocalReplayDownload(HISTORICAL, 'decision_scores.csv'))
  await assert.rejects(buildLocalReplayDownload(HISTORICAL, '../private.txt'))
})

test('ZIP can be parsed and checksum manifest matches saved analytics', async () => {
  const archive = readZipStore(await bytes(await buildLocalReplayDownload(HISTORICAL, 'package.zip')))
  assert.deepEqual([...archive.keys()], [
    'equity_history.csv', 'rotations.csv', 'metrics.json', 'analytics.json', 'manifest.json',
  ])
  const manifest = JSON.parse(new TextDecoder().decode(archive.get('manifest.json')))
  assert.equal(manifest.job_id, '20200320-old-completed')
  assert.equal(manifest.created_at, '2020-03-20T12:00:00Z')
  assert.equal(manifest.source, 'persisted_backtest_analytics')
  assert.equal(manifest.export_method, 'browser_from_read_only_analytics_api')
  assert.match(manifest.limitations, /Missing records are not reconstructed/)
  for (const item of manifest.files) {
    const file = archive.get(item.name)
    assert.ok(file)
    assert.equal(file.byteLength, item.bytes)
    assert.equal(createHash('sha256').update(file).digest('hex'), item.sha256)
  }
  assert.deepEqual(JSON.parse(new TextDecoder().decode(archive.get('analytics.json'))), HISTORICAL)
})

test('legacy data with recorded candidate scores includes a score CSV', async () => {
  const data = {
    ...HISTORICAL,
    decision_scores: [
      { execution_date: '2020-03-20', top_scores: [{ asset: 'AAPL', score: 0.34 }, { asset: 'MSFT', score: 0.3 }] },
    ],
  }
  const csv = await (await buildLocalReplayDownload(data, 'decision_scores.csv')).text()
  assert.match(csv, /top_1_asset,top_1_score,top_2_asset,top_2_score/)
  assert.match(csv, /AAPL,0\.34,MSFT,0\.3/)
  assert.ok(listLocalReplayFiles(data).files.some(f => f.name === 'decision_scores.csv'))
})

test('ZIP STORE does not silently add unrelated records', async () => {
  const sample = new TextEncoder().encode('hello')
  const zip = readZipStore(await bytes(zipStored([['test.txt', sample]])))
  assert.deepEqual([...zip.keys()], ['test.txt'])
  assert.equal(new TextDecoder().decode(zip.get('test.txt')), 'hello')
})
