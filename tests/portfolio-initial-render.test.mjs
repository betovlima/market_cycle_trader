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
