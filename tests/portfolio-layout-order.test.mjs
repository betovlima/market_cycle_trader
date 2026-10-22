import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'

const source = readFileSync(
  new URL('../src/features/paperPortfolio/PaperPortfolioDashboard.jsx', import.meta.url),
  'utf8',
)

const panelStart = source.indexOf('          {!live ? <WinnerOperationMonitor')
const panelEnd = source.indexOf('          <PositionExcursionPanel', panelStart)
const workspace = source.slice(panelStart, panelEnd)

test('Live and Trading share metrics, session, then position/decision order', () => {
  assert.ok(panelStart > -1 && panelEnd > panelStart, 'portfolio workspace markers present')
  const metricsIndex = workspace.indexOf('<PortfolioMetricsStrip')
  const sessionIndex = workspace.indexOf('{live ? <LiveSessionStrip')
  const decisionIndex = workspace.indexOf('{portfolioPositionDecision}')
  assert.ok(metricsIndex >= 0, 'metrics rendered')
  assert.ok(sessionIndex > metricsIndex, 'session follows metrics')
  assert.ok(decisionIndex > sessionIndex, 'position and decision follow session')
  assert.equal((workspace.match(/<PortfolioMetricsStrip/g) || []).length, 1)
  assert.equal((workspace.match(/\{portfolioPositionDecision\}/g) || []).length, 1)
  assert.ok(!workspace.includes('{live ? portfolioPositionDecision : null}'))
  assert.ok(!workspace.includes('{!live ? portfolioPositionDecision : null}'))
})

test('Live-only and Trading-only session strips preserve separate data flows', () => {
  assert.match(workspace, /\{live \? <LiveSessionStrip[\s\S]+: <TradingSessionStrip/)
  assert.match(source, /const marketApi = live \? 'live-market' : 'paper-market'/)
  assert.match(source, /const portfolioPositionDecision = data \? \(/)
  assert.match(workspace, /\{!live \? <WinnerOperationMonitor/)
  assert.match(source, /\{live \? <LiveWorkflowMonitor/)
  assert.match(source, /\{live \? <LiveWinnerEvents/)
})
