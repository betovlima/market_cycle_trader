import { useCallback, useEffect, useState } from 'react'
import { apiFetch } from '../../api/http'
import { API } from '../../config/env'
import { tr } from '../../i18n/runtime'
import { AlpacaOAuthConnection } from './components/AlpacaOAuthConnection'

const usd = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'USD' })
const number = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 8 })

function amount(value) {
  return value == null || !Number.isFinite(Number(value)) ? '—' : usd.format(Number(value))
}

export function AlpacaPersonalPortfolio() {
  const [portfolio, setPortfolio] = useState(null)
  const [message, setMessage] = useState('')
  const [loading, setLoading] = useState(false)

  const reload = useCallback(async () => {
    setLoading(true)
    setMessage('')
    try {
      const data = await apiFetch(`${API}/alpaca-oauth/portfolio`)
      setPortfolio(data)
    } catch (error) {
      // Never display the previous user's balances after a failed request,
      // a revoked grant or a changed login session.
      setPortfolio(null)
      if (error?.status !== 404) setMessage(error?.message || String(error))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    reload()
    window.addEventListener('mct:alpaca-oauth-updated', reload)
    return () => window.removeEventListener('mct:alpaca-oauth-updated', reload)
  }, [reload])

  return (
    <section className="page-stack portfolio-page" aria-label={tr('My Alpaca Live portfolio')}>
      <AlpacaOAuthConnection isAdmin={false} />
      <section className="data-panel portfolio-workspace-panel">
        <div className="portfolio-workspace-header">
          <div className="portfolio-workspace-title">
            <div>
              <h2>{tr('My Alpaca Live portfolio')}</h2>
              <p>{tr('Balances and positions are fetched from your own Alpaca account.')}</p>
            </div>
          </div>
          <div className="portfolio-workspace-actions">
            <button type="button" className="secondary-action compact" onClick={reload} disabled={loading}>
              {tr('Refresh Alpaca balances')}
            </button>
          </div>
        </div>
        {message ? <p role="alert" className="global-error">{message}</p> : null}
        {!portfolio ? (
          <p>{tr(loading ? 'Loading Alpaca portfolio…' : 'Connect Alpaca to view your live balance and positions.')}</p>
        ) : (
          <>
            <p>
              {tr('Account')} ...{portfolio.account_id_suffix} · {tr('Broker access')}: {tr('Alpaca OAuth (read-only)')}
              {' · '}{tr('Recorded at')}: {portfolio.recorded_at}
            </p>
            <div className="portfolio-audit-top-grid">
              <section className="portfolio-audit-card">
                <h3>{tr('Portfolio value')}</h3>
                <strong>{amount(portfolio.portfolio_value)}</strong>
              </section>
              <section className="portfolio-audit-card">
                <h3>{tr('Cash')}</h3>
                <strong>{amount(portfolio.strategy_cash)}</strong>
              </section>
              <section className="portfolio-audit-card">
                <h3>{tr('Buying power')}</h3>
                <strong>{amount(portfolio.buying_power)}</strong>
              </section>
              <section className="portfolio-audit-card">
                <h3>{tr('Unrealized P/L')}</h3>
                <strong>{amount(portfolio.unrealized_pnl)}</strong>
              </section>
            </div>
            <section className="portfolio-audit-card">
              <h3>{tr('Current Positions')}</h3>
              <div className="table-wrap">
                <table className="dashboard-table">
                  <thead>
                    <tr>
                      <th>{tr('Symbol')}</th>
                      <th>{tr('Quantity')}</th>
                      <th>{tr('Average entry price')}</th>
                      <th>{tr('Current price')}</th>
                      <th>{tr('Market value')}</th>
                      <th>{tr('Unrealized P/L')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {portfolio.positions?.length ? portfolio.positions.map(p => (
                      <tr key={p.symbol}>
                        <td>{p.symbol}</td>
                        <td>{number.format(p.quantity)}</td>
                        <td>{amount(p.average_entry_price)}</td>
                        <td>{amount(p.current_price)}</td>
                        <td>{amount(p.market_value)}</td>
                        <td>{amount(p.unrealized_pnl)}</td>
                      </tr>
                    )) : <tr><td colSpan="6">{tr('No positions at Alpaca')}</td></tr>}
                  </tbody>
                </table>
              </div>
            </section>
            <section className="portfolio-audit-card">
              <h3>{tr('Recent Alpaca orders')}</h3>
              <div className="table-wrap">
                <table className="dashboard-table">
                  <thead>
                    <tr>
                      <th>{tr('Symbol')}</th>
                      <th>{tr('Side')}</th>
                      <th>{tr('Status')}</th>
                      <th>{tr('Filled quantity')}</th>
                      <th>{tr('Filled value')}</th>
                      <th>{tr('Filled at')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {portfolio.recent_orders?.length ? portfolio.recent_orders.map((order, index) => (
                      <tr key={order.client_order_id || index}>
                        <td>{order.symbol}</td>
                        <td>{tr(order.side)}</td>
                        <td>{tr(order.status)}</td>
                        <td>{number.format(order.filled_quantity || 0)}</td>
                        <td>{amount(order.filled_value)}</td>
                        <td>{order.filled_at || '—'}</td>
                      </tr>
                    )) : <tr><td colSpan="6">{tr('No orders at Alpaca')}</td></tr>}
                  </tbody>
                </table>
              </div>
            </section>
            <p>{tr('MCT does not keep an operational cash balance; Alpaca is the source of financial values.')}</p>
          </>
        )}
      </section>
    </section>
  )
}
