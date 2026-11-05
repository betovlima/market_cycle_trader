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

const { AlpacaPersonalPortfolio, PersonalLivePanel, personalLiveDecision, personalLiveSummary } = await vite.ssrLoadModule(
  '/src/features/paperPortfolio/AlpacaPersonalPortfolio.jsx',
)

const { CurrentPosition, PortfolioMetricsStrip } = await vite.ssrLoadModule(
  '/src/features/paperPortfolio/components/PortfolioPrimitives.jsx',
)

const { LiveTraderControl } = await vite.ssrLoadModule(
  '/src/features/liveTrader/LiveTraderControl.jsx',
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

test('Live distinguishes current holding return from historical account performance', () => {
  const position = {
    symbol: 'CAPR', quantity: 16.89, average_entry_price: 6.75,
    current_price: 8.57, market_value: 144.75,
    unrealized_pnl: 30.74, unrealized_return: 0.2696,
  }
  const holding = renderToString(React.createElement(CurrentPosition, { position, cash: 0.01 }))
  assert.match(holding, /Current position return \(unrealized\)/)
  assert.match(holding, /26[.,]96/)
  assert.match(holding, /not the Winner/)

  const summary = renderToString(React.createElement(PortfolioMetricsStrip, {
    data: {
      environment: 'live', portfolio_value: 144.76,
      realized_pnl: null, unrealized_pnl: 30.74,
      total_pnl: null, total_return: null, strategy_cash: 0.01,
      winner_performance: {
        status: 'available', return_pct: 0.4075, profit_loss: 40.75,
        start_date: '2026-10-19', coverage: 'complete',
      },
    },
    position, auditSummary: {},
  }))
  assert.match(summary, /Accumulated Alpaca account return/)
  assert.match(summary, /40[.,]75/)
  assert.doesNotMatch(summary, /Total P\/L/)
  assert.match(summary, /2026-10-19/)
  const accumulatedCard = summary.split('Accumulated Alpaca account return')[1].split('>Cash<')[0]
  assert.match(accumulatedCard, /portfolio-metric-help-button/)
  assert.match(accumulatedCard, /portfolio-metric-help-tooltip/)
  assert.match(accumulatedCard, /Since 2026-10-19/)
  assert.doesNotMatch(accumulatedCard, /<small>/)
})

test('Live cumulative return is a dash if Alpaca has no auditable baseline', () => {
  const summary = renderToString(React.createElement(PortfolioMetricsStrip, {
    data: {
      environment: 'live', portfolio_value: 120,
      unrealized_pnl: 20, realized_pnl: null,
      strategy_cash: 0, positions: [], winner_performance: {
        status: 'unavailable', return_pct: null, profit_loss: null,
      },
    },
  }))
  assert.match(summary, /Accumulated Alpaca account return/)
  assert.match(summary, /Alpaca history not yet sufficient/)
  assert.doesNotMatch(summary, /NaN|Infinity|0[.,]00%/)
})

test('Trader Live reads only Alpaca returned cumulative data, never invents balance', async () => {
  const { readFileSync } = await import('node:fs')
  const source = readFileSync(
    new URL('../src/features/paperPortfolio/AlpacaPersonalPortfolio.jsx', import.meta.url), 'utf8',
  )
  assert.match(source, /<PortfolioMetricsStrip data=\{summary\}/)
  assert.match(source, /<CurrentPosition position=\{position\}/)
  assert.match(source, /<LiveSessionStrip/)
  assert.match(source, /<DecisionOfDay decision=\{decision\}/)
  assert.match(source, /<OperationAuditTable operations=\{orders\}/)
  assert.doesNotMatch(source, /initial_capital|localStorage|ALPACA_LIVE_API_KEY_ID/)
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

test('Trader Live uses Admin cards with only its own zero-balance OAuth portfolio', () => {
  const personal = {
    environment: 'live', account_id_suffix: '285e6c',
    portfolio_value: 0, strategy_cash: 0, buying_power: 0,
    unrealized_pnl: 0, positions: [], recent_orders: [],
    winner_performance: { status: 'unavailable', return_pct: null, profit_loss: null },
    market_clock: { is_open: true, next_close: '2026-11-05T21:00:00Z' },
  }
  const html = renderToString(React.createElement(PersonalLivePanel, {
    portfolio: personal,
    oauthStatus: { trading_authorized: false, trading_enabled: false },
    readiness: null, refreshing: false,
    lastUpdated: new Date('2026-11-05T15:00:00Z'),
    now: Date.parse('2026-11-05T15:00:00Z'),
    nextRefreshAt: null, reload: () => {},
  }))
  for (const label of [
    'Portfolio Value', 'Realized P/L', 'Unrealized P/L',
    'Accumulated Alpaca account return', 'Cash', 'Position',
    'Distance to peak', 'Max drawdown', 'Live Session',
    'Current Position', 'Decision of the day', 'Operations',
  ]) assert.ok(html.includes(label), 'Trader missing shared Live field: ' + label)
  assert.match(html, /portfolio-workspace-metrics-audit/)
  assert.match(html, /portfolio-audit-top-grid/)
  assert.match(html, /Alpaca OAuth \(read-only\)/)
  assert.doesNotMatch(html, /CAPR|145[.,]98|Full audit|Export audit/)
  assert.doesNotMatch(html, /NaN|Infinity/)
})

test('Trader Live decision requires same OAuth account and real holding', () => {
  const portfolio = {
    account_id_suffix: '285e6c', positions: [
      { symbol: 'CAPR', quantity: 3, average_entry_price: 5, market_value: 18 },
    ],
  }
  const readiness = {
    account_id_suffix: '285e6c',
    shared_winner: true, shared_signal_prepared: true, winner_signal_prepared: true,
    current_asset: 'CAPR', shared_target_asset: 'AMZN',
    execution_session: '2026-11-05', shared_decision_date: '2026-11-04',
  }
  const own = personalLiveDecision(portfolio, readiness)
  assert.equal(own.current_asset, 'CAPR')
  assert.equal(own.target_asset, 'AMZN')
  assert.equal(own.raw_best_asset, null)
  assert.equal(own.execution_origin, null)
  assert.equal(personalLiveDecision(portfolio, { ...readiness, account_id_suffix: 'OTHER' }), null)
  assert.equal(personalLiveDecision(portfolio, { ...readiness, current_asset: 'CASH' }), null)
  assert.equal(personalLiveDecision(portfolio, { ...readiness, shared_signal_prepared: false }), null)
  assert.equal(personalLiveDecision({ ...portfolio, positions: [] }, readiness), null)
  const financial = personalLiveSummary({ ...portfolio, portfolio_value: 145.98 })
  assert.equal(financial.realized_pnl, null)
  assert.equal(financial.total_pnl, null)
  assert.equal(financial.total_return, null)
})

test('Strategy and Operation contains separate daily preparation and manual Live contingency', () => {
  const html = renderToString(React.createElement(LiveTraderControl))
  assert.match(html, /Trader operation · Live/)
  assert.match(html, /Recalculate Winner using daily history/)
  assert.match(html, /Reanalisar Winner agora/)
  assert.match(html, /Executar plano operacional Live já validado/)
  assert.match(html, /RECUPERAÇÃO MANUAL · LIVE/)
  assert.match(html, /Nenhum plano operacional D−1 elegível/)
  assert.match(html, /Recalcula a recomendação usando os candles diários completos/)
  assert.doesNotMatch(html, /Reanálise com o movimento intradiário de hoje não está habilitada no Live/)
  assert.doesNotMatch(html, /Executar plano Paper|Reanalyze Winner now/)
  // The interface distinguishes an intraday calculation from existing D-1 execution.
  assert.match(html, /Checking daily signal availability|Verificando disponibilidade/)
})
