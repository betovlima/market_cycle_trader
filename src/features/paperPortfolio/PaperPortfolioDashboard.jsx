import { getIntlLocale, tr } from '../../i18n/runtime'
import { useCallback, useEffect, useRef, useState } from 'react'
import { apiFetch, downloadFile } from '../../api/http'
import { API } from '../../config/env'
import { PortfolioIcon } from '../../shared/components/Icons'
import { money, number, percent, shortDateTime } from '../../shared/formatters'
import { POLL_MS, ROBOT_POLL_MS } from './portfolioConfig'
import { CurrentPosition, PortfolioMetricsStrip, TradingSessionStrip } from './components/PortfolioPrimitives'


function DecisionAuditDialog({ audit, onClose }) {
  if (!audit) return null
  const reasonLabels = {
    raw_best_selected: 'The highest-utility asset was selected.',
    hold_current: 'The policy kept the current asset.',
    cash_selected: 'The policy selected cash.',
    policy_selected_non_raw_best: 'Policy constraints selected a different asset from the raw highest-utility candidate.',
    stateful_intervention: 'The stateful policy changed the control decision.',
  }
  const candidates = Array.isArray(audit.top_candidates) ? audit.top_candidates : []
  return (
    <div className="portfolio-decision-dialog-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}>
      <section className="portfolio-decision-dialog" role="dialog" aria-modal="true" aria-label={tr('Operation decision')}>
        <header className="portfolio-decision-dialog-header">
          <div>
            <span className="panel-kicker">{tr('Model audit')}</span>
            <h3>{tr('Operation decision')}</h3>
            <p>{tr('Decision data persisted when the Paper plan was created.')}</p>
          </div>
          <button type="button" className="portfolio-decision-dialog-close" aria-label={tr('Close')} onClick={onClose}>×</button>
        </header>

        <div className="portfolio-decision-summary">
          <div><span>{tr('Strategy')}</span><strong>{audit.winner_strategy_name || '—'}{audit.winner_strategy_revision != null ? ` · r${audit.winner_strategy_revision}` : ''}</strong></div>
          <div><span>{tr('Decision date')}</span><strong>{audit.decision_date || '—'}</strong></div>
          <div><span>{tr('Execution session')}</span><strong>{audit.execution_session || '—'}</strong></div>
          <div><span>{tr('Rotation')}</span><strong>{audit.current_asset || 'CASH'} → {audit.target_asset || 'CASH'}</strong></div>
          <div><span>{tr('Raw best asset')}</span><strong>{audit.raw_best_asset || '—'}</strong></div>
          <div><span>{tr('Selected utility')}</span><strong>{number(audit.selected_utility, 6)}</strong></div>
        </div>

        <div className="portfolio-decision-reason">
          <span>{tr('Why this asset')}</span>
          <strong>{tr(reasonLabels[audit.selection_reason] || 'Decision preserved from the persisted Paper plan.')}</strong>
        </div>

        <div className="portfolio-decision-grid">
          <div><span>{tr('Current utility')}</span><strong>{number(audit.current_utility, 6)}</strong></div>
          <div><span>{tr('Target utility')}</span><strong>{number(audit.target_utility, 6)}</strong></div>
          <div><span>{tr('Target advantage')}</span><strong>{number(audit.target_vs_current_utility, 6)}</strong></div>
          <div><span>{tr('Effective switch margin')}</span><strong>{number(audit.effective_switch_margin, 6)}</strong></div>
          <div><span>{tr('Calibrated margin')}</span><strong>{number(audit.calibrated_candidate_margin, 6)}</strong></div>
          <div><span>{tr('Calibration score')}</span><strong>{number(audit.calibration_score, 6)}</strong></div>
        </div>

        <div className="portfolio-decision-candidates">
          <div className="portfolio-section-heading compact"><div><span className="panel-kicker">{tr('Ranking at decision time')}</span><h3>{tr('Top candidates')}</h3></div></div>
          <div className="table-wrap">
            <table className="dashboard-table">
              <thead><tr><th>#</th><th>{tr('Asset')}</th><th>{tr('Utility')}</th><th>{tr('Cash edge')}</th><th>{tr('Role')}</th></tr></thead>
              <tbody>
                {candidates.length ? candidates.map((candidate, index) => (
                  <tr key={`${candidate.symbol}-${index}`} className={candidate.is_target ? 'portfolio-decision-target-row' : ''}>
                    <td>{index + 1}</td><td>{candidate.symbol}</td><td>{number(candidate.utility, 6)}</td><td>{candidate.cash_edge == null ? '—' : number(candidate.cash_edge, 6)}</td>
                    <td>{candidate.is_target ? tr('Selected') : candidate.is_current ? tr('Current') : candidate.is_raw_best ? tr('Raw best') : '—'}</td>
                  </tr>
                )) : <tr><td colSpan="5" className="empty-cell">{tr('Candidate utilities were not persisted for this historical plan.')}</td></tr>}
              </tbody>
            </table>
          </div>
        </div>

        <div className="portfolio-decision-periods">
          <span>{tr('Training end')}: <strong>{audit.training_end || '—'}</strong></span>
          <span>{tr('Internal calibration')}: <strong>{audit.calibration_start || '—'} → {audit.calibration_end || '—'}</strong></span>
          <span>{tr('Final fit end')}: <strong>{audit.final_fit_end || '—'}</strong></span>
        </div>
      </section>
    </div>
  )
}

export function PaperPortfolioDashboard() {
  const [data, setData] = useState(null)
  const [error, setError] = useState('')
  const [refreshing, setRefreshing] = useState(false)
  const [lastUpdated, setLastUpdated] = useState(null)
  const [connection, setConnection] = useState({ status: 'checking', checkedAt: null })
  const [robot, setRobot] = useState(null)
  const [nextRefreshAt, setNextRefreshAt] = useState(null)
  const [clockNow, setClockNow] = useState(() => Date.now())
  const [selectedDecision, setSelectedDecision] = useState(null)
  const [exporting, setExporting] = useState(false)
  const mountedRef = useRef(false)
  const portfolioTimerRef = useRef(null)
  const portfolioRequestRef = useRef(false)

  const loadRobotStatus = useCallback(async ({ silent = false } = {}) => {
    try {
      const response = await apiFetch(`${API}/paper-market/public-robot-status`)
      if (mountedRef.current) setRobot(response)
    } catch {
      if (mountedRef.current) {
        setRobot((current) => current ? { ...current, scheduler_alive: false, status: 'unavailable' } : { enabled: false, scheduler_alive: false, status: 'unavailable' })
      }
    }
  }, [])

  const loadPortfolio = useCallback(async ({ silent = false } = {}) => {
    if (portfolioRequestRef.current) return
    portfolioRequestRef.current = true
    if (mountedRef.current) setRefreshing(true)
    try {
      const response = await apiFetch(`${API}/paper-market/public-portfolio`)
      if (!mountedRef.current) return
      const checkedAt = new Date()
      setData(response)
      setError('')
      setLastUpdated(checkedAt)
      setConnection({ status: response?.status === 'ready' ? 'ready' : 'unavailable', checkedAt })
    } catch (requestError) {
      if (!mountedRef.current) return
      setConnection({ status: 'unavailable', checkedAt: new Date() })
      if (!silent) setError(requestError.message)
    } finally {
      portfolioRequestRef.current = false
      if (mountedRef.current) setRefreshing(false)
    }
  }, [])

  const scheduleNextPortfolioRefresh = useCallback(function scheduleNextPortfolioRefresh() {
    if (!mountedRef.current) return
    if (portfolioTimerRef.current) window.clearTimeout(portfolioTimerRef.current)
    const nextAt = Date.now() + POLL_MS
    setNextRefreshAt(nextAt)
    portfolioTimerRef.current = window.setTimeout(async () => {
      if (!mountedRef.current) return
      setNextRefreshAt(null)
      await loadPortfolio({ silent: true })
      if (mountedRef.current) scheduleNextPortfolioRefresh()
    }, POLL_MS)
  }, [loadPortfolio])

  const exportTransactionAudit = useCallback(async () => {
    setExporting(true)
    try {
      await downloadFile(`${API}/paper-market/public-portfolio/export.zip`, 'mct_paper_transaction_audit.zip')
      if (mountedRef.current) setError('')
    } catch (requestError) {
      if (mountedRef.current) setError(requestError.message)
    } finally {
      if (mountedRef.current) setExporting(false)
    }
  }, [])

  const refreshPortfolio = useCallback(async ({ silent = false, includeRobot = false } = {}) => {
    if (portfolioTimerRef.current) window.clearTimeout(portfolioTimerRef.current)
    if (mountedRef.current) setNextRefreshAt(null)
    const tasks = [loadPortfolio({ silent })]
    if (includeRobot) tasks.push(loadRobotStatus({ silent: true }))
    await Promise.all(tasks)
    if (mountedRef.current) scheduleNextPortfolioRefresh()
  }, [loadPortfolio, loadRobotStatus, scheduleNextPortfolioRefresh])

  useEffect(() => {
    mountedRef.current = true
    refreshPortfolio({ includeRobot: true })
    const robotTimer = window.setInterval(() => loadRobotStatus({ silent: true }), ROBOT_POLL_MS)
    const clockTimer = window.setInterval(() => setClockNow(Date.now()), 1000)
    return () => {
      mountedRef.current = false
      if (portfolioTimerRef.current) window.clearTimeout(portfolioTimerRef.current)
      window.clearInterval(robotTimer)
      window.clearInterval(clockTimer)
    }
  }, [loadRobotStatus, refreshPortfolio])

  const position = data?.position

  return (
    <section className="page-stack portfolio-page portfolio-single-workspace" aria-busy={refreshing}>
      {error ? <div className="inline-error"><strong>{tr("Portfolio unavailable")}</strong><span>{tr(error)}</span><button type="button" onClick={() => setError('')}>×</button></div> : null}

      {!data ? (
        <section className="data-panel portfolio-locked portfolio-tab-loader" role="status" aria-live="polite">
          <div className="portfolio-tab-loader-visual"><span className="loading-ring" aria-hidden="true" /></div>
          <h2>{tr("Loading simulated portfolio")}</h2>
          <p>{tr("Connecting to Alpaca Paper and requesting the latest read-only portfolio snapshot.")}</p>
        </section>
      ) : (
        <section className="data-panel portfolio-workspace-panel">
          <header className="portfolio-workspace-header">
            <div className="portfolio-workspace-title">
              <div className="page-title-icon"><PortfolioIcon size={18} /></div>
              <div><h2>{tr("Portfolio")}</h2></div>
            </div>
            <div className="portfolio-workspace-actions">
              <span>{lastUpdated ? tr('Updated {time}', { time: lastUpdated.toLocaleTimeString(getIntlLocale()) }) : tr('Read-only snapshot')}</span>
              <button type="button" className="secondary-action portfolio-export-button compact" disabled={exporting} onClick={exportTransactionAudit}>
                {exporting ? <span className="portfolio-button-spinner" aria-hidden="true" /> : null}
                {tr(exporting ? 'Exporting…' : 'Export audit')}
              </button>
              <button type="button" className="secondary-action portfolio-refresh-button compact" disabled={refreshing} onClick={() => refreshPortfolio({ includeRobot: true })}>
                {refreshing ? <span className="portfolio-button-spinner" aria-hidden="true" /> : null}
                {tr(refreshing ? 'Refreshing…' : 'Refresh')}
              </button>
            </div>
          </header>

          <PortfolioMetricsStrip data={data} position={position} />

          <TradingSessionStrip
            connection={connection}
            marketClock={data?.market_clock}
            robot={robot}
            now={clockNow}
            refreshing={refreshing}
            nextRefreshAt={nextRefreshAt}
          />

          <div className="portfolio-workspace-main">
            <CurrentPosition position={position} cash={data.strategy_cash} />
          </div>

          <section className="portfolio-orders-section">
            <div className="portfolio-section-heading portfolio-orders-heading">
              <div><span className="panel-kicker">{tr("Activity")}</span><h2>{tr("Recent Paper Orders")}</h2></div>
              <span className="panel-count">{data.recent_orders?.length || 0} {tr("records")}</span>
            </div>
            <div className="table-wrap portfolio-orders-table-wrap compact-order-scroll">
              <table className="dashboard-table portfolio-orders-table">
                <thead><tr><th>{tr("Created")}</th><th>{tr("Asset")}</th><th>{tr("Side")}</th><th>{tr("Status")}</th><th>{tr("Quantity")}</th><th>{tr("Average Fill")}</th><th>{tr("Decision")}</th></tr></thead>
                <tbody>
                  {data.recent_orders?.length ? data.recent_orders.map((order, index) => (
                    <tr key={`${order.created_at || 'order'}-${order.symbol || 'asset'}-${index}`}>
                      <td>{shortDateTime(order.created_at)}</td><td>{order.symbol || '—'}</td>
                      <td><span className={`order-side ${order.side}`}>{order.side === 'buy' ? tr('Buy') : order.side === 'sell' ? tr('Sell') : String(order.side || '—').toUpperCase()}</span></td>
                      <td>{order.status ? tr(String(order.status).replaceAll('_', ' ').replace(/\b\w/g, (letter) => letter.toUpperCase())) : '—'}</td><td>{order.filled_quantity ?? order.quantity ?? '—'}</td><td>{order.filled_average_price ? money(order.filled_average_price) : '—'}</td>
                      <td>{order.decision_audit ? <button type="button" className="portfolio-decision-button" onClick={() => setSelectedDecision(order.decision_audit)}>{tr('View decision')}</button> : '—'}</td>
                    </tr>
                  )) : <tr><td colSpan="7" className="empty-cell">{tr("No paper orders have been submitted yet.")}</td></tr>}
                </tbody>
              </table>
            </div>
          </section>
        </section>
      )}
      <DecisionAuditDialog audit={selectedDecision} onClose={() => setSelectedDecision(null)} />
    </section>
  )
}
