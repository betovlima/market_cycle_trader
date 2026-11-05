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

const layoutStyles = readFileSync(new URL('../src/styles.css', import.meta.url), 'utf8')

test('Live statuses use a dedicated responsive grid without affecting Trading', () => {
  assert.match(layoutStyles, /\.portfolio-session-strip\[data-session-market="live"\] \.portfolio-session-main\s*\{[^}]*flex-direction:\s*column/s)
  assert.match(layoutStyles, /\.portfolio-session-strip\[data-session-market="live"\] \.portfolio-session-statuses\s*\{[^}]*grid-template-columns:\s*repeat\(4,\s*minmax\(0,\s*1fr\)\)/s)
  assert.match(layoutStyles, /@container\s*\(max-width:\s*630px\)\s*\{[\s\S]*?grid-template-columns:\s*repeat\(2,\s*minmax\(0,\s*1fr\)\)/)
  assert.match(layoutStyles, /@container\s*\(max-width:\s*340px\)\s*\{[\s\S]*?grid-template-columns:\s*minmax\(0,\s*1fr\)/)
})

test('Alpaca cumulative return uses shared flow-adjusted daily display in both Live views', () => {
  const shared = readFileSync(
    new URL('../src/features/paperPortfolio/accountReturnDisplay.js', import.meta.url), 'utf8',
  )
  const metrics = readFileSync(
    new URL('../src/features/paperPortfolio/components/PortfolioPrimitives.jsx', import.meta.url), 'utf8',
  )
  const personal = readFileSync(
    new URL('../src/features/paperPortfolio/AlpacaPersonalPortfolio.jsx', import.meta.url), 'utf8',
  )
  assert.match(shared, /Daily return estimate, adjusted for external transfers/)
  assert.match(shared, /cashflow_type_unverified/)
  assert.match(shared, /as_of_date/)
  assert.match(metrics, /accountReturnDetail\(winnerPerformance, money\)/)
  assert.match(personal, /<PortfolioMetricsStrip data=\{summary\}/)
  assert.match(personal, /<CurrentPosition position=\{position\}/)
  assert.match(personal, /<DecisionOfDay decision=\{decision\}/)
  assert.doesNotMatch(metrics, /cashflows_present/)
  assert.doesNotMatch(personal, /cashflows_present/)
})

test('Accumulated Alpaca return shows compact info tooltip without stretching metrics', () => {
  const metricsSource = readFileSync(
    new URL('../src/features/paperPortfolio/components/PortfolioPrimitives.jsx', import.meta.url),
    'utf8',
  )
  assert.match(metricsSource, /hint=\{cumulativeDetail\}/)
  assert.doesNotMatch(metricsSource, /detail=\{cumulativeDetail\}/)
  assert.match(metricsSource, /portfolio-metric-help-button/)
  assert.match(metricsSource, /portfolio-metric-help-tooltip/)
  assert.match(layoutStyles, /\.portfolio-workspace-metrics-audit\s*\{[^}]*overflow:\s*visible/s)
  assert.match(layoutStyles, /\.portfolio-metric-help-tooltip\s*\{[^}]*top:\s*calc\(100% \+ 8px\)/s)
  assert.match(layoutStyles, /\.portfolio-metric-help-tooltip\s*\{[^}]*bottom:\s*auto/s)
  assert.match(layoutStyles, /\.portfolio-metric-help\s*\{[^}]*position:\s*static/s)
  assert.doesNotMatch(layoutStyles, /\.portfolio-metric-help-tooltip\s*\{[^}]*bottom:\s*calc\(100%/s)
  assert.match(layoutStyles, /\.portfolio-metric-help:focus-within \.portfolio-metric-help-tooltip/)
})
