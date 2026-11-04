import assert from 'node:assert/strict'
import { after, test } from 'node:test'
import React from 'react'
import { renderToString } from 'react-dom/server'
import { createServer } from 'vite'

// Reproduces the initial page paint while the Alpaca portfolio API has not
// responded. A Vite production build alone does not detect render exceptions.
const vite = await createServer({
  configFile: false,
  server: { middlewareMode: true },
  appType: 'custom',
})
after(async () => { await vite.close() })

const { PaperPortfolioDashboard } = await vite.ssrLoadModule(
  '/src/features/paperPortfolio/PaperPortfolioDashboard.jsx',
)

const { AlpacaPersonalPortfolio } = await vite.ssrLoadModule(
  '/src/features/paperPortfolio/AlpacaPersonalPortfolio.jsx',
)

const { AppHeader } = await vite.ssrLoadModule(
  '/src/features/backtest/components/AppHeader.jsx',
)
const { I18nProvider } = await vite.ssrLoadModule(
  '/src/i18n/I18nProvider.jsx',
)

test('Live portfolio renders a loading state with null API data', () => {
  const html = renderToString(React.createElement(PaperPortfolioDashboard, {
    market: 'live', capabilities: { 'admin.manage': true },
  }))
  assert.match(html, /data-portfolio-market="live"/)
  assert.match(html, /portfolio-tab-loader/)
  assert.match(html, /portfolio-workspace-header|Loading Live portfolio/)
})

test('individual Live page shows an empty user-specific Alpaca portfolio', () => {
  const html = renderToString(React.createElement(AlpacaPersonalPortfolio))
  assert.match(html, /Alpaca OAuth connection/)
  assert.match(html, /My Alpaca Live portfolio/)
  assert.match(html, /Connect and authorize Alpaca trading/)
  assert.match(html, /Connect Alpaca to view your live balance and positions/)
  assert.doesNotMatch(html, /data-portfolio-market="live"/)
})

test('individual portfolio queries only the authenticated OAuth account endpoint', async () => {
  const { readFileSync } = await import('node:fs')
  const source = readFileSync(
    new URL('../src/features/paperPortfolio/AlpacaPersonalPortfolio.jsx', import.meta.url), 'utf8',
  )
  assert.ok(source.includes('alpaca-oauth/portfolio'))
  assert.ok(!source.includes('live-market/portfolio'))
  assert.ok(!source.includes('ALPACA_LIVE_API_KEY_ID'))
  assert.ok(source.includes('setPortfolio(null)'))
})

test('invited Trader opens Live and asks for one trading consent', async () => {
  const { readFileSync } = await import('node:fs')
  const app = readFileSync(new URL('../src/App.jsx', import.meta.url), 'utf8')
  const oauth = readFileSync(
    new URL('../src/features/paperPortfolio/components/AlpacaOAuthConnection.jsx', import.meta.url), 'utf8',
  )
  assert.ok(app.includes("session?.role === 'trader' ? 'live' : 'dashboard'"))
  assert.ok(oauth.includes("onClick={authorizeTrading}"))
  assert.ok(oauth.includes("!isAdmin ? ("))
  assert.ok(oauth.includes("alpaca-oauth/start-trading"))
  assert.ok(oauth.includes("After your Alpaca authorization, wait for the next eligible Winner trading cycle."))
})

test('Trading portfolio renders its loading state with null API data', () => {
  const html = renderToString(React.createElement(PaperPortfolioDashboard, {
    market: 'trading', capabilities: {},
  }))
  assert.match(html, /data-portfolio-market="trading"/)
  assert.match(html, /portfolio-tab-loader/)
})


test('Live cannot render for a user without the existing admin permission', () => {
  const html = renderToString(React.createElement(PaperPortfolioDashboard, {
    market: 'live', capabilities: { 'portfolio.view': true },
  }))
  assert.equal(html, '')
})

test('neither market shows the removed nested Portfolio tabs', () => {
  for (const market of ['live', 'trading']) {
    const html = renderToString(React.createElement(PaperPortfolioDashboard, {
      market, capabilities: { 'admin.manage': true },
    }))
    assert.doesNotMatch(html, /portfolio-market-tabs/)
    assert.match(html, new RegExp('data-portfolio-market="'+market+'"'))
  }
})

function renderNavigation(capabilities, role = 'admin') {
  return renderToString(React.createElement(
    I18nProvider, {},
    React.createElement(AppHeader, {
      activeTab: role === 'trader' ? 'live' : 'trading',
      capabilities, session: { role, display_name: 'Test user' },
      onTabChange: () => {}, onLogout: () => {},
    }),
  ))
}

test('main navigation replaces Portfolio with distinct Live and Trading tabs', () => {
  const html = renderNavigation({ 'portfolio.view': true, 'admin.manage': true })
  assert.match(html, /data-nav-tab="live"/)
  assert.match(html, /data-nav-tab="trading"/)
  assert.doesNotMatch(html, /data-nav-tab="portfolio"/)
})

test('Trader navigation displays only Live, even with stale extra capabilities', () => {
  const staleCapabilities = {
    'portfolio.view': true,
    'dashboard.view': true,
    'backtest.view': true,
    'decision_science.view': true,
    'annual_replay.view': true,
    'admin.manage': true,
    'settings.view': true,
  }
  const trader = renderNavigation(staleCapabilities, 'trader')
  assert.deepEqual(
    [...trader.matchAll(/data-nav-tab="([^"]+)"/g)].map((match) => match[1]),
    ['live'],
  )
})

test('Admin navigation retains Live, Trading and the management panels', () => {
  const admin = renderNavigation({
    'portfolio.view': true, 'admin.manage': true,
    'dashboard.view': true, 'backtest.view': true,
    'administration.view': true, 'settings.view': true,
  })
  for (const tab of ['live', 'trading', 'dashboard', 'backtest', 'administration', 'system-settings']) {
    assert.match(admin, new RegExp('data-nav-tab="' + tab + '"'))
  }
})

test('top-level routing enforces access restrictions independently of menu rendering', async () => {
  const { readFileSync } = await import('node:fs')
  const app = readFileSync(new URL('../src/App.jsx', import.meta.url), 'utf8')
  assert.match(app, /activeTab === 'live' && hasCapability\(capabilities, 'portfolio.view'\)/)
  assert.match(app, /hasCapability\(capabilities, 'admin.manage'\)/)
  assert.match(app, /AlpacaPersonalPortfolio/)
  assert.match(app, /activeTab === 'trading' && hasCapability\(capabilities, 'admin.manage'\)/)
  assert.ok(app.includes("if (session.role === 'trader')"))
  assert.ok(app.includes('return <TraderLiveApp session={session}'))
  const traderShell = app.split('function TraderLiveApp(')[1].split('function ProfessorReplayApp(')[0]
  assert.ok(traderShell.includes('<AlpacaPersonalPortfolio />'))
  assert.ok(!traderShell.includes('useBacktestWorkspace'))
  assert.ok(!traderShell.includes('<PaperPortfolioDashboard'))
  assert.ok(!traderShell.includes('<BacktestPage'))
  assert.doesNotMatch(app, /activeTab === 'portfolio'/)
})
