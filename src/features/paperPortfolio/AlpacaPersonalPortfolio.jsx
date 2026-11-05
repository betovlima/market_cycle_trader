import { useCallback, useEffect, useRef, useState } from 'react'
import { apiFetch } from '../../api/http'
import { API } from '../../config/env'
import { getIntlLocale, tr } from '../../i18n/runtime'
import { PortfolioIcon } from '../../shared/components/Icons'
import { shortDateTime } from '../../shared/formatters'
import { POLL_MS } from './portfolioConfig'
import { CurrentPosition, LiveSessionStrip, PortfolioMetricsStrip } from './components/PortfolioPrimitives'
import {
  AssetPnlChart,
  CandidateRanking,
  DecisionOfDay,
  LiveMultiplePositions,
  OperationAuditTable,
  PortfolioEvolutionChart,
} from './PaperPortfolioDashboard'
import { accountReturnDetail } from './accountReturnDisplay'
import { AlpacaOAuthConnection } from './components/AlpacaOAuthConnection'

// The Trader uses the same read-only Live presentation as Admin, but NEVER the
// admin-only /live-market endpoints, capital ledger, control, audit or shared
// account positions. Every financial number comes from this user's OAuth
// /alpaca-oauth/portfolio response.
export function personalLiveDecision(portfolio, readiness) {
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

function PersonalLivePanel({ portfolio, oauthStatus, readiness, refreshing, lastUpdated, now, nextRefreshAt, reload }) {
  const positions = Array.isArray(portfolio.positions) ? portfolio.positions : []
  const position = positions.length === 1 ? positions[0] : null
  const summary = personalLiveSummary(portfolio)
  const decision = personalLiveDecision(portfolio, readiness)
  const connection = { status: 'ready', checkedAt: lastUpdated }
  // Only the account-scoped OAuth state controls the Trader indicator.
  // Neither the canonical account's Live state nor its order ledger is read.
  const robot = {
    control_mode: 'unknown',
    monitoring_enabled: true,
    real_orders_armed: Boolean(oauthStatus?.trading_authorized && oauthStatus?.trading_enabled),
    next_execution_session: readiness?.account_id_suffix === portfolio.account_id_suffix
      ? readiness?.execution_session || null : null,
  }
  const pnlByAsset = positions.map((p) => ({
    symbol: p.symbol,
    realized_pnl: null,
    unrealized_pnl: p.unrealized_pnl,
  }))
  const orders = Array.isArray(portfolio.recent_orders) ? portfolio.recent_orders : []

  return (
    <section className="data-panel portfolio-workspace-panel">
      <header className="portfolio-workspace-header">
        <div className="portfolio-workspace-title">
          <div className="page-title-icon"><PortfolioIcon size={18} /></div>
          <div><h2>{tr('Live')}</h2></div>
        </div>
        <div className="portfolio-workspace-actions">
          <span>{tr('Account')} ...{portfolio.account_id_suffix}</span>
          <span>{tr('Broker access')}: {tr('Alpaca OAuth (read-only)')}</span>
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

      <PortfolioMetricsStrip data={summary} position={position} auditSummary={{}} />

      <LiveSessionStrip
        connection={connection}
        marketClock={portfolio.market_clock}
        robot={robot}
        oauthStatus={oauthStatus}
        now={now}
        refreshing={refreshing}
        nextRefreshAt={nextRefreshAt}
      />

      <div className="portfolio-audit-top-grid">
        {positions.length > 1
          ? <LiveMultiplePositions positions={positions} />
          : <CurrentPosition position={position} cash={portfolio.strategy_cash} />}
        {/* Readiness is a verified shared Winner target for this exact OAuth
            account. Admin audit dialogs are never mounted for Traders. */}
        <DecisionOfDay decision={decision} market="live" />
      </div>

      <div className="portfolio-audit-charts-grid">
        <PortfolioEvolutionChart history={portfolio.history} />
        <AssetPnlChart rows={pnlByAsset} />
      </div>

      <CandidateRanking decision={null} />
      <OperationAuditTable operations={orders} market="live" />
    </section>
  )
}

export function AlpacaPersonalPortfolio() {
  const [portfolio, setPortfolio] = useState(null)
  const [oauthStatus, setOauthStatus] = useState(null)
  const [readiness, setReadiness] = useState(null)
  const [message, setMessage] = useState('')
  const [loading, setLoading] = useState(false)
  const [lastUpdated, setLastUpdated] = useState(null)
  const [nextRefreshAt, setNextRefreshAt] = useState(null)
  const [clockNow, setClockNow] = useState(() => Date.now())
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
      // The shared Winner signal is optional. Absence or failure must not
      // fabricate an account decision, nor block a valid broker portfolio.
      let nextReadiness = null
      if (status.trading_authorized === true) {
        try {
          nextReadiness = await apiFetch(`${API}/alpaca-oauth/winner/readiness`)
        } catch {
          nextReadiness = null
        }
      }
      if (request !== requestSequence.current) return
      setPortfolio(data)
      setOauthStatus(status)
      setReadiness(
        nextReadiness?.account_id_suffix === data.account_id_suffix ? nextReadiness : null
      )
      setLastUpdated(new Date())
      setNextRefreshAt(Date.now() + POLL_MS)
    } catch (error) {
      if (request !== requestSequence.current) return
      setPortfolio(null)
      setOauthStatus(null)
      setReadiness(null)
      setLastUpdated(null)
      setNextRefreshAt(null)
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
      setReadiness(null)
      setOauthStatus(null)
      reload()
    }
    window.addEventListener('mct:alpaca-oauth-updated', onOauthChange)
    const poll = window.setInterval(reload, POLL_MS)
    const clock = window.setInterval(() => setClockNow(Date.now()), 1000)
    return () => {
      ++requestSequence.current
      window.removeEventListener('mct:alpaca-oauth-updated', onOauthChange)
      window.clearInterval(poll)
      window.clearInterval(clock)
    }
  }, [reload])

  return (
    <section className="page-stack portfolio-page" aria-label={tr('My Alpaca Live portfolio')}>
      <AlpacaOAuthConnection isAdmin={false} />
      <div className="portfolio-single-workspace" aria-busy={loading} data-personal-live="true">
        {message ? <div role="alert" className="inline-error"><strong>{tr('Portfolio unavailable')}</strong><span>{tr(message)}</span></div> : null}
        {portfolio ? (
          <PersonalLivePanel portfolio={portfolio} oauthStatus={oauthStatus}
            readiness={readiness} refreshing={loading} lastUpdated={lastUpdated}
            now={clockNow} nextRefreshAt={nextRefreshAt} reload={reload} />
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
