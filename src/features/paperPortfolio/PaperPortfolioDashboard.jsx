import { getIntlLocale, tr } from '../../i18n/runtime'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { apiFetch, downloadFile } from '../../api/http'
import { API } from '../../config/env'
import { PortfolioIcon } from '../../shared/components/Icons'
import { money, number, percent, shortDateTime } from '../../shared/formatters'
import { POLL_MS, ROBOT_POLL_MS } from './portfolioConfig'
import { CurrentPosition, PortfolioMetricsStrip, TradingSessionStrip } from './components/PortfolioPrimitives'


const DECISION_REASON_LABELS = {
  raw_best_selected: 'The highest-utility asset was selected.',
  current_asset_best: 'The current asset is still the highest-utility candidate.',
  hold_current: 'The policy kept the current asset.',
  minimum_holding_not_reached: 'The current position is still inside the minimum holding period.',
  switch_margin_not_reached: 'The best alternative did not exceed the required switch margin.',
  cash_selected: 'The policy selected cash.',
  policy_selected_non_raw_best: 'Policy constraints selected a different asset from the raw highest-utility candidate.',
  stateful_intervention: 'The stateful policy changed the control decision.',
}

const EXECUTION_ORIGIN_LABELS = {
  scheduled_automatic: 'Scheduled automatic execution',
  manual_recovery: 'Manual recovery execution',
  manual_contingency: 'Manual contingency execution',
  historical_unknown: 'Historical execution origin not recorded',
  unknown: 'Execution origin not available',
}

function decisionReasonLabel(reason) {
  return tr(DECISION_REASON_LABELS[reason] || 'Decision preserved from the persisted Paper plan.')
}

function executionOriginLabel(origin) {
  return tr(EXECUTION_ORIGIN_LABELS[origin] || 'Execution origin not available')
}

function yesNo(value) {
  if (value === true) return tr('Yes')
  if (value === false) return tr('No')
  return '—'
}

function DecisionAuditDialog({ audit, onClose }) {
  if (!audit) return null
  const candidates = Array.isArray(audit.candidates) && audit.candidates.length
    ? audit.candidates
    : Array.isArray(audit.top_candidates) ? audit.top_candidates : []

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
          <div><span>{tr('Decision origin')}</span><strong>{tr('Model-generated plan')}</strong></div>
          <div><span>{tr('Execution origin')}</span><strong>{executionOriginLabel(audit.execution_origin)}</strong></div>
          <div><span>{tr('Rotation')}</span><strong>{audit.current_asset || 'CASH'} → {audit.target_asset || 'CASH'}</strong></div>
          <div><span>{tr('Raw best asset')}</span><strong>{audit.raw_best_asset || '—'}</strong></div>
          <div><span>{tr('Raw best utility')}</span><strong>{number(audit.raw_best_utility, 6)}</strong></div>
          <div><span>{tr('Selected utility')}</span><strong>{number(audit.selected_utility, 6)}</strong></div>
        </div>

        <div className="portfolio-decision-reason">
          <span>{tr('Why this asset')}</span>
          <strong>{decisionReasonLabel(audit.selection_reason)}</strong>
          {audit.execution_origin === 'manual_recovery' || audit.execution_origin === 'manual_contingency' ? <small>{tr('The asset decision came from the persisted model plan, but the order execution was triggered manually as recovery or contingency.')}</small> : null}
          {audit.execution_origin === 'historical_unknown' ? <small>{tr('This historical plan predates execution-origin tracking, so automatic versus manual execution cannot be inferred safely.')}</small> : null}
        </div>

        <div className="portfolio-decision-grid">
          <div><span>{tr('Current utility')}</span><strong>{number(audit.current_utility, 6)}</strong></div>
          <div><span>{tr('Target utility')}</span><strong>{number(audit.target_utility, 6)}</strong></div>
          <div><span>{tr('Best vs current')}</span><strong>{number(audit.raw_best_vs_current_utility, 6)}</strong></div>
          <div><span>{tr('Effective switch margin')}</span><strong>{number(audit.effective_switch_margin, 6)}</strong></div>
          <div><span>{tr('Switch margin passed')}</span><strong>{yesNo(audit.switch_margin_passed)}</strong></div>
          <div><span>{tr('Holding sessions')}</span><strong>{audit.holding_sessions_at_decision ?? '—'} / {audit.minimum_holding_sessions ?? '—'}</strong></div>
          <div><span>{tr('Holding rule satisfied')}</span><strong>{yesNo(audit.holding_rule_satisfied)}</strong></div>
          <div><span>{tr('Calibrated margin')}</span><strong>{number(audit.calibrated_candidate_margin, 6)}</strong></div>
          <div><span>{tr('Calibration score')}</span><strong>{number(audit.calibration_score, 6)}</strong></div>
        </div>

        <div className="portfolio-decision-candidates">
          <div className="portfolio-section-heading compact"><div><span className="panel-kicker">{tr('Ranking at decision time')}</span><h3>{tr('Candidates')}</h3></div></div>
          <div className="table-wrap">
            <table className="dashboard-table">
              <thead><tr><th>#</th><th>{tr('Asset')}</th><th>{tr('Utility')}</th><th>{tr('Δ current')}</th><th>{tr('Δ leader')}</th><th>{tr('Cash edge')}</th><th>{tr('Role')}</th></tr></thead>
              <tbody>
                {candidates.length ? candidates.map((candidate, index) => (
                  <tr key={`${candidate.symbol}-${index}`} className={candidate.is_target ? 'portfolio-decision-target-row' : ''}>
                    <td>{candidate.rank ?? index + 1}</td>
                    <td>{candidate.symbol}</td>
                    <td>{number(candidate.utility, 6)}</td>
                    <td>{number(candidate.utility_gap_vs_current, 6)}</td>
                    <td>{number(candidate.utility_gap_vs_best, 6)}</td>
                    <td>{candidate.cash_edge == null ? '—' : number(candidate.cash_edge, 6)}</td>
                    <td>{candidate.is_target ? tr('Selected') : candidate.is_current ? tr('Current') : candidate.is_raw_best ? tr('Raw best') : '—'}</td>
                  </tr>
                )) : <tr><td colSpan="7" className="empty-cell">{tr('Candidate utilities were not persisted for this historical plan.')}</td></tr>}
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

function DecisionOfDay({ decision, onOpen }) {
  if (!decision) {
    return (
      <section className="portfolio-audit-card portfolio-decision-today">
        <div className="portfolio-section-heading compact">
          <div><span className="panel-kicker">{tr('Decision')}</span><h2>{tr('Decision of the day')}</h2></div>
        </div>
        <div className="portfolio-audit-empty">{tr('No persisted decision is available yet.')}</div>
      </section>
    )
  }

  return (
    <section className="portfolio-audit-card portfolio-decision-today">
      <div className="portfolio-section-heading compact portfolio-audit-heading">
        <div><span className="panel-kicker">{tr('Decision')}</span><h2>{tr('Decision of the day')}</h2></div>
        <button type="button" className="portfolio-decision-button" onClick={() => onOpen(decision)}>{tr('Full audit')}</button>
      </div>
      <div className="portfolio-decision-route">
        <div><span>{tr('Current')}</span><strong>{decision.current_asset || 'CASH'}</strong><small>{number(decision.current_utility, 6)}</small></div>
        <div className="portfolio-decision-arrow">→</div>
        <div><span>{tr('Target')}</span><strong>{decision.target_asset || 'CASH'}</strong><small>{number(decision.target_utility, 6)}</small></div>
        <div className="portfolio-decision-arrow subtle">·</div>
        <div><span>{tr('Raw best')}</span><strong>{decision.raw_best_asset || '—'}</strong><small>{number(decision.raw_best_utility, 6)}</small></div>
      </div>
      <div className="portfolio-decision-reason portfolio-decision-reason-inline">
        <span>{tr('Why')}</span>
        <strong>{decisionReasonLabel(decision.selection_reason)}</strong>
      </div>
      <div className="portfolio-decision-rule-grid">
        <div><span>{tr('Best vs current')}</span><strong>{number(decision.raw_best_vs_current_utility, 6)}</strong></div>
        <div><span>{tr('Switch margin')}</span><strong>{number(decision.effective_switch_margin, 6)}</strong><small>{tr('Passed')}: {yesNo(decision.switch_margin_passed)}</small></div>
        <div><span>{tr('Holding')}</span><strong>{decision.holding_sessions_at_decision ?? '—'} / {decision.minimum_holding_sessions ?? '—'}</strong><small>{tr('Rule satisfied')}: {yesNo(decision.holding_rule_satisfied)}</small></div>
        <div><span>{tr('Plan status')}</span><strong>{tr(String(decision.status || '—').replaceAll('_', ' '))}</strong><small>{decision.execution_session || '—'}</small></div>
      </div>
    </section>
  )
}

function PortfolioEvolutionChart({ history }) {
  const points = useMemo(() => (Array.isArray(history) ? history : []).map((item) => ({
    ...item,
    recorded_at_label: shortDateTime(item.recorded_at),
  })), [history])

  return (
    <section className="portfolio-audit-card portfolio-chart-card">
      <div className="portfolio-section-heading compact">
        <div><span className="panel-kicker">{tr('Capital')}</span><h2>{tr('Portfolio evolution')}</h2></div>
      </div>
      <div className="portfolio-audit-chart">
        {points.length ? (
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={points} margin={{ top: 8, right: 18, left: 0, bottom: 4 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(96, 139, 180, .14)" />
              <XAxis dataKey="recorded_at_label" minTickGap={32} tick={{ fontSize: 10, fill: '#8096ad' }} />
              <YAxis width={78} tickFormatter={(value) => `$${Math.round(Number(value) / 1000)}k`} tick={{ fontSize: 10, fill: '#8096ad' }} />
              <Tooltip formatter={(value, name) => [money(value), tr(name === 'portfolio_value' ? 'Portfolio' : 'Peak')]} />
              <Line type="monotone" dataKey="peak_portfolio_value" dot={false} stroke="#7a8ca0" strokeDasharray="5 5" strokeWidth={1.4} />
              <Line type="monotone" dataKey="portfolio_value" dot={false} stroke="#65dbe8" strokeWidth={2.1} />
            </LineChart>
          </ResponsiveContainer>
        ) : <div className="portfolio-audit-empty">{tr('No portfolio history is available yet.')}</div>}
      </div>
    </section>
  )
}

function AssetPnlChart({ rows }) {
  const data = useMemo(() => (Array.isArray(rows) ? rows : []).slice(0, 12), [rows])
  return (
    <section className="portfolio-audit-card portfolio-chart-card">
      <div className="portfolio-section-heading compact">
        <div><span className="panel-kicker">{tr('Contribution')}</span><h2>{tr('P/L by asset')}</h2></div>
      </div>
      <div className="portfolio-audit-chart">
        {data.length ? (
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data} layout="vertical" margin={{ top: 8, right: 18, left: 8, bottom: 4 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(96, 139, 180, .14)" />
              <XAxis type="number" tickFormatter={(value) => money(value)} tick={{ fontSize: 9, fill: '#8096ad' }} />
              <YAxis type="category" dataKey="symbol" width={48} tick={{ fontSize: 10, fill: '#bcd0e4' }} />
              <Tooltip formatter={(value, name) => [money(value), tr(name === 'realized_pnl' ? 'Realized P/L' : 'Unrealized P/L')]} />
              <Bar dataKey="realized_pnl" stackId="pnl" fill="#65dbe8" />
              <Bar dataKey="unrealized_pnl" stackId="pnl" fill="#c2a7ff" />
            </BarChart>
          </ResponsiveContainer>
        ) : <div className="portfolio-audit-empty">{tr('No economic fills are available yet.')}</div>}
      </div>
    </section>
  )
}

function CandidateRanking({ decision }) {
  const candidates = Array.isArray(decision?.candidates) ? decision.candidates : []
  return (
    <section className="portfolio-candidates-section">
      <div className="portfolio-section-heading portfolio-orders-heading">
        <div>
          <span className="panel-kicker">{tr('Rotation options')}</span>
          <h2>{tr('Candidates presented today')}</h2>
          <p>{tr('The complete ranking used by the persisted decision, including the current asset and the raw leader.')}</p>
        </div>
        <span className="panel-count">{candidates.length} {tr('assets')}</span>
      </div>
      <div className="table-wrap portfolio-candidates-table-wrap">
        <table className="dashboard-table portfolio-candidates-table">
          <thead>
            <tr>
              <th>#</th><th>{tr('Asset')}</th><th>{tr('Utility')}</th><th>{tr('Δ current')}</th><th>{tr('Δ leader')}</th><th>{tr('Cash edge')}</th><th>{tr('Margin')}</th><th>{tr('Role')}</th>
            </tr>
          </thead>
          <tbody>
            {candidates.length ? candidates.map((candidate, index) => {
              const rotationOption = !candidate.is_current && candidate.passes_switch_margin
              return (
                <tr key={`${candidate.symbol}-${index}`} className={candidate.is_target ? 'portfolio-decision-target-row' : candidate.is_raw_best ? 'portfolio-candidate-leader-row' : ''}>
                  <td>{candidate.rank ?? index + 1}</td>
                  <td><strong>{candidate.symbol}</strong></td>
                  <td>{number(candidate.utility, 6)}</td>
                  <td>{number(candidate.utility_gap_vs_current, 6)}</td>
                  <td>{number(candidate.utility_gap_vs_best, 6)}</td>
                  <td>{candidate.cash_edge == null ? '—' : number(candidate.cash_edge, 6)}</td>
                  <td><span className={rotationOption ? 'portfolio-pass-chip' : 'portfolio-neutral-chip'}>{rotationOption ? tr('Pass') : tr('Hold')}</span></td>
                  <td>{candidate.is_target ? tr('Selected') : candidate.is_current ? tr('Current') : candidate.is_raw_best ? tr('Raw best') : '—'}</td>
                </tr>
              )
            }) : <tr><td colSpan="8" className="empty-cell">{tr('No candidate ranking is available for the latest decision.')}</td></tr>}
          </tbody>
        </table>
      </div>
    </section>
  )
}

function OperationAuditTable({ operations, onDecision }) {
  const rows = Array.isArray(operations) ? operations : []
  return (
    <section className="portfolio-orders-section">
      <div className="portfolio-section-heading portfolio-orders-heading">
        <div>
          <span className="panel-kicker">{tr('Audit')}</span>
          <h2>{tr('Operations')}</h2>
          <p>{tr('Orders are considered economic executions whenever filled quantity is greater than zero, regardless of the final broker status.')}</p>
        </div>
        <span className="panel-count">{rows.length} {tr('records')}</span>
      </div>
      <div className="table-wrap portfolio-orders-table-wrap compact-order-scroll">
        <table className="dashboard-table portfolio-orders-table portfolio-audit-operations-table">
          <thead><tr><th>{tr('Created')}</th><th>{tr('Asset')}</th><th>{tr('Side')}</th><th>{tr('Status')}</th><th>{tr('Filled')}</th><th>{tr('Average Fill')}</th><th>{tr('Value')}</th><th>{tr('Origin')}</th><th>{tr('Decision')}</th></tr></thead>
          <tbody>
            {rows.length ? rows.map((order, index) => (
              <tr key={`${order.client_order_id || order.created_at || 'order'}-${index}`} className={order.economic_fill ? 'portfolio-economic-fill-row' : ''}>
                <td>{shortDateTime(order.created_at)}</td>
                <td>{order.symbol || '—'}</td>
                <td><span className={`order-side ${order.side}`}>{order.side === 'buy' ? tr('Buy') : order.side === 'sell' ? tr('Sell') : String(order.side || '—').toUpperCase()}</span></td>
                <td>{order.status ? tr(String(order.status).replaceAll('_', ' ').replace(/\b\w/g, (letter) => letter.toUpperCase())) : '—'}</td>
                <td>{order.filled_quantity ?? '—'}</td>
                <td>{order.filled_average_price ? money(order.filled_average_price) : '—'}</td>
                <td>{order.filled_value == null ? '—' : money(order.filled_value)}</td>
                <td>{executionOriginLabel(order.execution_origin)}</td>
                <td>{order.decision_audit ? <button type="button" className="portfolio-decision-button" onClick={() => onDecision(order.decision_audit)}>{tr('View decision')}</button> : '—'}</td>
              </tr>
            )) : <tr><td colSpan="9" className="empty-cell">{tr('No paper orders have been submitted yet.')}</td></tr>}
          </tbody>
        </table>
      </div>
    </section>
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
  const audit = data?.audit || {}
  const auditSummary = audit?.summary || {}
  const latestDecision = audit?.latest_decision || null
  const operations = Array.isArray(audit?.operations) && audit.operations.length ? audit.operations : (data?.recent_orders || [])

  return (
    <section className="page-stack portfolio-page portfolio-single-workspace" aria-busy={refreshing}>
      {error ? <div className="inline-error"><strong>{tr('Portfolio unavailable')}</strong><span>{tr(error)}</span><button type="button" onClick={() => setError('')}>×</button></div> : null}

      {!data ? (
        <section className="data-panel portfolio-locked portfolio-tab-loader" role="status" aria-live="polite">
          <div className="portfolio-tab-loader-visual"><span className="loading-ring" aria-hidden="true" /></div>
          <h2>{tr('Loading simulated portfolio')}</h2>
          <p>{tr('Connecting to Alpaca Paper and requesting the latest read-only portfolio snapshot.')}</p>
        </section>
      ) : (
        <section className="data-panel portfolio-workspace-panel">
          <header className="portfolio-workspace-header">
            <div className="portfolio-workspace-title">
              <div className="page-title-icon"><PortfolioIcon size={18} /></div>
              <div><h2>{tr('Portfolio')}</h2></div>
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

          <PortfolioMetricsStrip data={data} position={position} auditSummary={auditSummary} />

          <TradingSessionStrip
            connection={connection}
            marketClock={data?.market_clock}
            robot={robot}
            now={clockNow}
            refreshing={refreshing}
            nextRefreshAt={nextRefreshAt}
          />

          <div className="portfolio-audit-top-grid">
            <CurrentPosition position={position} cash={data.strategy_cash} />
            <DecisionOfDay decision={latestDecision} onOpen={setSelectedDecision} />
          </div>

          <div className="portfolio-audit-charts-grid">
            <PortfolioEvolutionChart history={audit?.history || data?.history} />
            <AssetPnlChart rows={audit?.pnl_by_asset} />
          </div>

          <CandidateRanking decision={latestDecision} />

          <OperationAuditTable operations={operations} onDecision={setSelectedDecision} />
        </section>
      )}
      <DecisionAuditDialog audit={selectedDecision} onClose={() => setSelectedDecision(null)} />
    </section>
  )
}
