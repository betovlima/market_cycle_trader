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

function renderNavigation(capabilities) {
  return renderToString(React.createElement(
    I18nProvider, {},
    React.createElement(AppHeader, {
      activeTab: 'trading', capabilities, session: { display_name: 'Test user' },
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

test('Live menu retains both portfolio and admin permissions; Trading retains portfolio permission', () => {
  const trader = renderNavigation({ 'portfolio.view': true })
  assert.match(trader, /data-nav-tab="trading"/)
  assert.doesNotMatch(trader, /data-nav-tab="live"/)

  const adminWithoutPortfolio = renderNavigation({ 'admin.manage': true })
  assert.doesNotMatch(adminWithoutPortfolio, /data-nav-tab="trading"/)
  assert.doesNotMatch(adminWithoutPortfolio, /data-nav-tab="live"/)
})

test('top-level routing enforces access restrictions independently of menu rendering', async () => {
  const { readFileSync } = await import('node:fs')
  const app = readFileSync(new URL('../src/App.jsx', import.meta.url), 'utf8')
  assert.match(app, /activeTab === 'live' && hasCapability\(capabilities, 'portfolio.view'\) && hasCapability\(capabilities, 'admin.manage'\)/)
  assert.match(app, /activeTab === 'trading' && hasCapability\(capabilities, 'portfolio.view'\)/)
  assert.doesNotMatch(app, /activeTab === 'portfolio'/)
})
