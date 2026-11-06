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

const { AlpacaOAuthConnection } =
  await vite.ssrLoadModule('/src/features/paperPortfolio/components/AlpacaOAuthConnection.jsx')

test('Live OAuth initial paint shows verifying status, not lost connection', () => {
  const html = renderToString(React.createElement(AlpacaOAuthConnection, { isAdmin: true }))
  assert.match(html, /Verificando conexão OAuth com a Alpaca/)
  assert.doesNotMatch(html, /Alpaca OAuth setup is missing/)
})

test('Dashboard labels the selected Winner universe without silently switching model inputs', () => {
  const source = readFileSync(new URL(
    '../src/features/dashboard/components/StockMarketHeatmap.jsx', import.meta.url,
  ), 'utf8')
  assert.match(source, /Universo da Winner selecionada neste ambiente/)
  assert.match(source, /strategy_sequence/)
  assert.doesNotMatch(source, /77 ativos|U77_REQUESTED_ASSETS/)
})

test('Live broker options are managed in the admin interface, not through env flags', () => {
  const code = readFileSync(new URL(
    '../src/features/paperPortfolio/components/LiveBrokerSettings.jsx', import.meta.url,
  ), 'utf8')
  assert.match(code, /live-market\/broker\/settings/)
  assert.match(code, /BIND_VERIFIED_OAUTH_NO_ORDERS/)
  assert.match(code, /ENABLE_LIVE_REAL_ORDERS/)
  assert.match(code, /DISABLE_LIVE_REAL_ORDERS/)
  assert.match(code, /settings\.revision/)
  assert.match(code, /window\.confirm/)
  assert.match(code, /Bloquear novas ordens/)
  assert.doesNotMatch(code, /MCT_CANONICAL_LIVE_|localStorage|submit_order/)
})

test('Live OAuth restores broker and shared Winner readiness on every tab entry', () => {
  const code = readFileSync(new URL(
    '../src/features/paperPortfolio/components/AlpacaOAuthConnection.jsx', import.meta.url,
  ), 'utf8')
  assert.match(code, /alpaca-oauth\/status/)
  assert.match(code, /alpaca-oauth\/winner\/readiness/)
  assert.match(code, /setWinnerReadiness\(ready\)/)
  assert.match(code, /canonical_live_auth_mode === 'oauth'/)
  assert.match(code, /sem fallback para API Keys/)
  assert.match(code, /live-market\\/oauth-diagnostic/)
  assert.match(code, /Diagnosticar Live OAuth/)
  assert.match(code, /CANONICAL_ACCOUNT_ID_MISSING/)
  assert.match(code, /OAUTH_BROKER_ORDERS_UNAVAILABLE/)
  assert.match(code, /OAUTH_CURRENT_ADMIN_SAVED_ROLE_MISMATCH/)
  assert.match(code, /OAUTH_CURRENT_ADMIN_ACCOUNT_MISMATCH/)
  assert.doesNotMatch(code, /submit_order|place_order|create_live_execution_client/)
})
