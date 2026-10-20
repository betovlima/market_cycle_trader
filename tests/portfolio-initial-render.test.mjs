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
    capabilities: { 'admin.manage': true },
  }))
  assert.match(html, /data-portfolio-market="live"/)
  assert.match(html, /portfolio-tab-loader/)
  assert.match(html, /portfolio-workspace-header|Loading Live portfolio/)
})

test('Trading portfolio renders its loading state with null API data', () => {
  const html = renderToString(React.createElement(PaperPortfolioDashboard, {
    capabilities: {},
  }))
  assert.match(html, /data-portfolio-market="trading"/)
  assert.match(html, /portfolio-tab-loader/)
})
