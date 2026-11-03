import assert from 'node:assert/strict'
import { after, test } from 'node:test'
import { readFileSync } from 'node:fs'
import { createServer } from 'vite'

const vite = await createServer({
  configFile: false, server: { middlewareMode: true }, appType: 'custom',
})
after(async () => { await vite.close() })

const { defaultLiveAuditDates, liveAuditExportUrl } = await vite.ssrLoadModule(
  '/src/features/paperPortfolio/PaperPortfolioDashboard.jsx',
)
const source = readFileSync(
  new URL('../src/features/paperPortfolio/PaperPortfolioDashboard.jsx', import.meta.url),
  'utf8',
)
const css = readFileSync(new URL('../src/styles.css', import.meta.url), 'utf8')

test('Live starts with seven US market calendar days including today', () => {
  assert.deepEqual(
    defaultLiveAuditDates(new Date('2026-11-03T00:15:00Z')),
    { start_date: '2026-10-27', end_date: '2026-11-02' },
  )
})

test('inclusive date range is encoded into the existing Live export endpoint', () => {
  const url = liveAuditExportUrl(
    'https://api.example.test/api/live-market/portfolio/export.zip',
    '2026-10-26', '2026-11-02',
  )
  const parsed = new URL(url)
  assert.equal(parsed.pathname, '/api/live-market/portfolio/export.zip')
  assert.equal(parsed.searchParams.get('start_date'), '2026-10-26')
  assert.equal(parsed.searchParams.get('end_date'), '2026-11-02')
})

test('invalid ranges are blocked before starting a download', () => {
  const base = '/api/live-market/portfolio/export.zip'
  for (const [start, end] of [
    ['', '2026-11-02'],
    ['2026-11-02', ''],
    ['2026-11-03', '2026-11-02'],
    ['2025-01-01', '2026-11-02'],
    ['not-a-date', '2026-11-02'],
  ]) {
    assert.equal(liveAuditExportUrl(base, start, end), null)
  }
  assert.match(
    liveAuditExportUrl(base, '2026-11-02', '2026-11-02'),
    /start_date=2026-11-02&end_date=2026-11-02/,
  )
})

test('date controls are in the same group and before original export button', () => {
  const begin = source.indexOf('<div className="portfolio-audit-export-controls"')
  const end = source.indexOf('</div>', begin)
  assert.ok(begin > 0 && end > begin)
  const group = source.slice(begin, end)
  assert.equal((group.match(/type="date"/g) || []).length, 2)
  assert.match(group, /auditDates.start_date/)
  assert.match(group, /auditDates.end_date/)
  assert.match(group, /portfolio-export-button/)
  assert.match(source, /live \? liveAuditExportUrl/)
  assert.match(source, /: baseUrl/)
  assert.match(css, /\.portfolio-audit-export-controls\s*\{[^}]*display:\s*flex/)
  assert.match(css, /\.portfolio-audit-date-field input\[type="date"\]/)
})

test('Paper keeps the original download endpoint without date parameters', () => {
  assert.match(source, /live \? 'portfolio\/export.zip' : 'public-portfolio\/export.zip'/)
  assert.match(source, /const url = live[\s\S]+: baseUrl/)
})
