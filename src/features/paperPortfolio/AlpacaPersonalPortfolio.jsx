import { useCallback, useEffect, useRef, useState } from 'react'
import { apiFetch } from '../../api/http'
import { API } from '../../config/env'
import { getIntlLocale, tr } from '../../i18n/runtime'
import { PortfolioIcon } from '../../shared/components/Icons'
import { money, percent, shortDateTime } from '../../shared/formatters'
import { POLL_MS } from './portfolioConfig'
import { CurrentPosition, PortfolioMetric } from './components/PortfolioPrimitives'
import { AlpacaOAuthConnection } from './components/AlpacaOAuthConnection'

// The Trader uses the same read-only Live presentation as Admin, but NEVER the
// admin-only /live-market endpoints, capital ledger, control, audit or shared
// account positions. Every financial number comes from this user's OAuth
// /alpaca-oauth/portfolio response.
export function personalLiveDecision(portfolio, readiness) {
  // Cross-check the broker holding from the portfolio snapshot with the
  // independent OAuth readiness before presenting a decision as current.
  const holdings = Array.isArray(portfolio?.positions) ? portfolio.positions : []
  const actualAsset = holdings.length === 0 ? 'CASH'
    : holdings.length === 1 ? String(holdings[0]?.symbol || '').toUpperCase() : null
  if (!actualAsset || readiness?.current_asset !== actualAsset) return null
  if (!portfolio || !readiness
      || !readiness.shared_winner
      || readiness.shared_signal_prepared !== true
      || readiness.winner_signal_prepared !== true
      || !portfolio.account_id_suffix
      || readiness.account_id_suffix !== portfolio.account_id_suffix
      || !readiness.current_asset
      || !readiness.shared_target_asset) return null

  return {
    current_asset: readiness.current_asset,
    target_asset: readiness.shared_target_asset,
    raw_best_asset: null, // Not exposed by the account-scoped OAuth readiness.
    status: 'signal_prepared',
    execution_session: readiness.execution_session || null,
    selection_reason: null,
    execution_origin: null, // Never attribute the shared signal to a user's fill.
    decision_date: readiness.shared_decision_date || null,
  }
}

export function personalLiveSummary(portfolio) {
  if (!portfolio) return null
  return {
    ...portfolio,
    environment: 'live',
    realized_pnl: null, // A realized P/L cannot be inferred from the latest 100 orders.
    total_pnl: null,
    total_return: null,
  }
}

export function PersonalLivePanel({ portfolio, refreshing, lastUpdated, reload }) {
  const positions = Array.isArray(portfolio.positions) ? portfolio.positions : []
  const position = positions.length === 1 ? positions[0] : null
  // These rows are returned only by the authenticated user's Alpaca OAuth
  // account. Never combine with the administrative Winner operations ledger.
  const orders = Array.isArray(portfolio.recent_orders) ? portfolio.recent_orders : []

  return (
    <section className="data-panel portfolio-workspace-panel" aria-label="Minha carteira Live">
      <header className="portfolio-workspace-header">
        <div className="portfolio-workspace-title">
          <div className="page-title-icon"><PortfolioIcon size={18} /></div>
          <div><h2>{tr('Live')}</h2></div>
        </div>
        <div className="portfolio-workspace-actions">
          <span>{tr('Account')} ...{portfolio.account_id_suffix}</span>
          <span>{portfolio.market_clock?.is_open ? 'Mercado aberto' : 'Mercado fechado'}</span>
          <span>{lastUpdated
            ? tr('Updated {time}', { time: lastUpdated.toLocaleTimeString(getIntlLocale()) })
            : shortDateTime(portfolio.recorded_at)}</span>
          <button type="button" className="secondary-action portfolio-refresh-button compact"
            disabled={refreshing} onClick={reload}>
            {refreshing ? <span className="portfolio-button-spinner" aria-hidden="true" /> : null}
            {tr(refreshing ? 'Refreshing…' : 'Refresh')}
          </button>
        </div>
      </header>

      <div className="portfolio-workspace-metrics" aria-label="Resumo da minha conta Alpaca">
        <PortfolioMetric label="Valor da carteira" value={money(portfolio.portfolio_value)} tone="blue" />
        <PortfolioMetric label="Disponível em caixa" value={money(portfolio.strategy_cash)} tone="purple" />
        <PortfolioMetric label="Resultado não realizado" value={money(portfolio.unrealized_pnl)} />
      </div>

      <div className="portfolio-audit-top-grid">
        {positions.length > 1 ? (
          <section className="current-position-section" aria-label="Minhas posições atuais">
            <div className="portfolio-section-heading compact">
              <div><h2>Minhas posições</h2></div>
            </div>
            <div className="table-wrap">
              <table className="dashboard-table">
                <thead><tr><th>Ativo</th><th>Quantidade</th><th>Preço atual</th><th>Valor</th><th>Resultado (%)</th></tr></thead>
                <tbody>{positions.map((item) => (
                  <tr key={item.symbol}>
                    <td><strong>{item.symbol}</strong></td>
                    <td>{item.quantity ?? '—'}</td>
                    <td>{money(item.current_price)}</td>
                    <td>{money(item.market_value)}</td>
                    <td>{percent(item.unrealized_return)}</td>
                  </tr>
                ))}</tbody>
              </table>
            </div>
          </section>
        ) : <CurrentPosition position={position} cash={portfolio.strategy_cash} />}
      </div>

      <section className="portfolio-orders-section" aria-label="Minhas ordens na Alpaca">
        <div className="portfolio-section-heading portfolio-orders-heading">
          <div><h2>Minhas ordens na Alpaca</h2></div>
          <span className="panel-count">{orders.length} registros</span>
        </div>
        <div className="table-wrap portfolio-orders-table-wrap compact-order-scroll">
          <table className="dashboard-table portfolio-orders-table">
            <thead><tr><th>Data</th><th>Ativo</th><th>Tipo</th><th>Status</th><th>Executado</th><th>Preço médio</th></tr></thead>
            <tbody>{orders.length ? orders.map((order, index) => (
              <tr key={`${order.created_at || order.symbol || 'ordem'}-${index}`}>
                <td>{shortDateTime(order.created_at)}</td>
                <td>{order.symbol || '—'}</td>
                <td>{order.side === 'buy' ? 'Compra' : order.side === 'sell' ? 'Venda' : '—'}</td>
                <td>{order.status ? String(order.status).replaceAll('_', ' ') : '—'}</td>
                <td>{order.filled_quantity ?? '—'}</td>
                <td>{order.filled_average_price == null ? '—' : money(order.filled_average_price)}</td>
              </tr>
            )) : <tr><td colSpan="6" className="empty-cell">Nenhuma ordem encontrada nesta conta.</td></tr>}</tbody>
          </table>
        </div>
      </section>
    </section>
  )
}

export function AlpacaPersonalPortfolio() {
  const [portfolio, setPortfolio] = useState(null)
  const [oauthStatus, setOauthStatus] = useState(null)
  const [message, setMessage] = useState('')
  const [loading, setLoading] = useState(false)
  const [lastUpdated, setLastUpdated] = useState(null)
  const requestSequence = useRef(0)

  const reload = useCallback(async () => {
    const request = ++requestSequence.current
    setLoading(true)
    setMessage('')
    // Fail closed on a revoked account, changed identity or partial API error.
    // Never show financial data cached from a previous OAuth connection.
    try {
      const [data, status] = await Promise.all([
        apiFetch(`${API}/alpaca-oauth/portfolio`),
        apiFetch(`${API}/alpaca-oauth/status`),
      ])
      if (request !== requestSequence.current) return
      if (status?.connected !== true || !data?.account_id_suffix ||
          status.account_id_suffix !== data.account_id_suffix) {
        throw new Error('Alpaca OAuth account could not be verified. Reconnect your account.')
      }
      // No Winner ranking or rotation readiness is requested for Traders.
      setPortfolio(data)
      setOauthStatus(status)
      setLastUpdated(new Date())
    } catch (error) {
      if (request !== requestSequence.current) return
      setPortfolio(null)
      setOauthStatus(null)
      setLastUpdated(null)
      if (error?.status !== 404) setMessage(error?.message || String(error))
    } finally {
      if (request === requestSequence.current) setLoading(false)
    }
  }, [])

  useEffect(() => {
    reload()
    const onOauthChange = () => {
      ++requestSequence.current
      setPortfolio(null)
      setOauthStatus(null)
      reload()
    }
    window.addEventListener('mct:alpaca-oauth-updated', onOauthChange)
    const poll = window.setInterval(reload, POLL_MS)
    return () => {
      ++requestSequence.current
      window.removeEventListener('mct:alpaca-oauth-updated', onOauthChange)
      window.clearInterval(poll)
    }
  }, [reload])

  return (
    <section className="page-stack portfolio-page" aria-label={tr('My Alpaca Live portfolio')}>
      <AlpacaOAuthConnection isAdmin={false} />
      <div className="portfolio-single-workspace" aria-busy={loading} data-personal-live="true">
        {message ? <div role="alert" className="inline-error"><strong>{tr('Portfolio unavailable')}</strong><span>{tr(message)}</span></div> : null}
        {portfolio ? (
          <PersonalLivePanel portfolio={portfolio} refreshing={loading}
            lastUpdated={lastUpdated} reload={reload} />
        ) : !message ? (
          <section className="data-panel portfolio-locked portfolio-tab-loader" role="status">
            <div className="portfolio-tab-loader-visual"><span className="loading-ring" aria-hidden="true" /></div>
            <h2>{tr('My Alpaca Live portfolio')}</h2>
            <p>{tr(loading
              ? 'Loading Alpaca portfolio…'
              : 'Connect Alpaca to view your live balance and positions.')}</p>
          </section>
        ) : (
          <section className="data-panel portfolio-locked"><p>{tr('Portfolio unavailable')}</p></section>
        )}
      </div>
    </section>
  )
}
