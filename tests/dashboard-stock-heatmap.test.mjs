import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { after, test } from 'node:test'
import React from 'react'
import { renderToString } from 'react-dom/server'
import { createServer } from 'vite'

const vite = await createServer({
  configFile: false,
  server: { middlewareMode: true },
  appType: 'custom',
})
after(async () => { await vite.close() })

const { StockMarketHeatmap, heatmapTone, sortedHeatmapAssets, changeForHorizon } =
  await vite.ssrLoadModule('/src/features/dashboard/components/StockMarketHeatmap.jsx')
const { DashboardPage } =
  await vite.ssrLoadModule('/src/features/dashboard/DashboardPage.jsx')

test('Dashboard replaces the two old blocks with one stock heatmap', () => {
  const source = readFileSync(new URL('../src/features/dashboard/DashboardPage.jsx', import.meta.url), 'utf8')
  assert.match(source, /<StockMarketHeatmap \/>/)
  assert.doesNotMatch(source, /<ResearchTreePanel|<RotationQualityPerformanceSection/)
  const html = renderToString(React.createElement(DashboardPage, {
    workspace: {
      dashboard: null,
      loadingDashboard: true,
      running: false, restoringExecution: false,
      startingBacktest: false, startDisabled: true,
      runBacktest: () => null,
    },
    capabilities: { 'dashboard.view': true },
    onOpenBacktest: () => {},
  }))
  assert.match(html, /Heatmap das ações cadastradas/)
  assert.doesNotMatch(html, /Monthly strategy performance|SELECTED RESEARCH MODEL/)
  assert.match(html, /1 pregão|5 pregões|20 pregões/)
})

test('heatmap legend distinguishes gains, losses, zero and missing values', () => {
  assert.equal(heatmapTone(null), 'missing')
  assert.equal(heatmapTone(0), 'neutral')
  assert.equal(heatmapTone(0.8), 'gain-1')
  assert.equal(heatmapTone(2.5), 'gain-2')
  assert.equal(heatmapTone(4.2), 'gain-3')
  assert.equal(heatmapTone(7.8), 'gain-4')
  assert.equal(heatmapTone(-4.2), 'loss-3')
  assert.equal(heatmapTone(NaN), 'missing') // Guarded by changeForHorizon.
})

test('sorting uses only valid actual returns, missing tickers appear last', () => {
  const rows = [
    { symbol: 'CAPR', change_1d: 2, change_5d: -3 },
    { symbol: 'DNN', change_1d: -1, change_5d: 4 },
    { symbol: 'AMZN', change_1d: null, change_5d: null },
  ]
  assert.equal(changeForHorizon(rows[2], '1d'), null)
  assert.deepEqual(sortedHeatmapAssets(rows, '1d', 'highest').map(x => x.symbol), ['CAPR', 'DNN', 'AMZN'])
  assert.deepEqual(sortedHeatmapAssets(rows, '5d', 'highest').map(x => x.symbol), ['DNN', 'CAPR', 'AMZN'])
  assert.deepEqual(sortedHeatmapAssets(rows, '1d', 'lowest').map(x => x.symbol), ['DNN', 'CAPR', 'AMZN'])
  assert.deepEqual(sortedHeatmapAssets(rows, '1d', 'ticker').map(x => x.symbol), ['AMZN', 'CAPR', 'DNN'])
})

test('heatmap never fetches intraday data or places broker orders', () => {
  const source = readFileSync(
    new URL('../src/features/dashboard/components/StockMarketHeatmap.jsx', import.meta.url), 'utf8',
  )
  assert.match(source, /\/dashboard\/asset-heatmap/)
  assert.doesNotMatch(source, /submit_order|\/live-execution\/|\/manual-current-session\/analyze/)
  assert.match(source, /Durante o pregão, não inclui o candle de hoje/)
})
