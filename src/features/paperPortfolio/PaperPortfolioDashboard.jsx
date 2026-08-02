import { useCallback, useEffect, useState } from 'react'

import { apiFetch } from '../../api/http'
import { API } from '../../config/env'

const TOKEN_KEY = 'market-cycle-paper-token'
const POLL_MS = 60 * 60 * 1000

function money(value) {
  const number = Number(value)
  if (!Number.isFinite(number)) return '—'
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(number)
}

function percent(value) {
  const number = Number(value)
  if (!Number.isFinite(number)) return '—'
  return new Intl.NumberFormat('en-US', {
    style: 'percent',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(number)
}

function metricClass(value) {
  const number = Number(value)
  if (!Number.isFinite(number) || number === 0) return ''
  return number > 0 ? 'positive' : 'negative'
}

export function PaperPortfolioDashboard() {
  const [token, setToken] = useState(() => sessionStorage.getItem(TOKEN_KEY) || '')
  const [data, setData] = useState(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const loadPortfolio = useCallback(async ({ silent = false } = {}) => {
    const normalized = token.trim()
    if (!normalized) {
      setData(null)
      return
    }
    if (!silent) setLoading(true)
    try {
      const response = await apiFetch(`${API}/paper-market/portfolio`, {
        headers: { 'X-Paper-Market-Token': normalized },
      })
      sessionStorage.setItem(TOKEN_KEY, normalized)
      setData(response)
      setError('')
    } catch (requestError) {
      setError(requestError.message)
    } finally {
      if (!silent) setLoading(false)
    }
  }, [token])

  useEffect(() => {
    if (!token.trim()) return undefined
    loadPortfolio()
    const timer = window.setInterval(() => loadPortfolio({ silent: true }), POLL_MS)
    return () => window.clearInterval(timer)
  }, [loadPortfolio, token])

  return (
    <section className="portfolio-section">
      <article className="panel connection-panel">
        <div>
          <h2>Portfolio</h2>
          <p>Only aggregate account information is displayed.</p>
        </div>
        <div className="connection-controls">
          <input
            type="password"
            value={token}
            onChange={(event) => setToken(event.target.value)}
            placeholder="Access token"
            aria-label="Access token"
            autoComplete="off"
          />
          <button type="button" onClick={() => loadPortfolio()} disabled={!token.trim() || loading}>
            {loading ? 'Updating…' : 'Connect'}
          </button>
        </div>
      </article>

      {error && <div className="error-banner">{error}</div>}

      {!data ? (
        <article className="panel empty-panel">Enter the access token to view the portfolio.</article>
      ) : (
        <>
          <article className="panel status-panel">
            <span className={`status-dot ${data.execution_status}`} />
            <strong>{data.execution_status || data.status || 'ready'}</strong>
            <span>{data.market_open ? 'Market open' : 'Market closed'}</span>
            <button type="button" className="secondary" onClick={() => loadPortfolio()} disabled={loading}>
              Refresh
            </button>
          </article>

          <div className="metrics-grid">
            <article className="metric-card">
              <span>Portfolio value</span>
              <strong>{money(data.portfolio_value)}</strong>
            </article>
            <article className="metric-card">
              <span>Total return</span>
              <strong className={metricClass(data.total_return)}>{percent(data.total_return)}</strong>
            </article>
            <article className="metric-card">
              <span>Total P&amp;L</span>
              <strong className={metricClass(data.total_pnl)}>{money(data.total_pnl)}</strong>
            </article>
            <article className="metric-card">
              <span>Available cash</span>
              <strong>{money(data.available_cash)}</strong>
            </article>
            <article className="metric-card">
              <span>Market value</span>
              <strong>{money(data.market_value)}</strong>
            </article>
            <article className="metric-card">
              <span>Realized P&amp;L</span>
              <strong className={metricClass(data.realized_pnl)}>{money(data.realized_pnl)}</strong>
            </article>
            <article className="metric-card">
              <span>Unrealized P&amp;L</span>
              <strong className={metricClass(data.unrealized_pnl)}>{money(data.unrealized_pnl)}</strong>
            </article>
          </div>
        </>
      )}
    </section>
  )
}
