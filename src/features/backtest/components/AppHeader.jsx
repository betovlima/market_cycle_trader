import { FRONT_VERSION } from '../../../config/env'
import { BacktestIcon, DashboardIcon, PortfolioIcon } from '../../../shared/components/Icons'
import appLogoUrl from '../../../assets/market-cycle-trader-logo.png'

const NAV_ITEMS = [
  { id: 'dashboard', label: 'Dashboard', Icon: DashboardIcon },
  { id: 'backtest', label: 'Backtest', Icon: BacktestIcon },
  { id: 'portfolio', label: 'Portfolio', Icon: PortfolioIcon },
]

export function AppHeader({ workspace, activeTab, onTabChange }) {
  return (
    <header className="app-header">
      <div className="brand-area">
        <div className="brand-logo-frame" aria-hidden="true">
          <img className="app-logo" src={appLogoUrl} alt="" width="64" height="64" decoding="async" fetchPriority="high" />
        </div>
        <div className="brand-divider" />
        <div className="brand-copy">
          <h1>Market Cycle Trader</h1>
          <div className="brand-subtitle">Historical Market Simulation</div>
          <p>Run protected simulations and review sanitized performance results.</p>
        </div>
      </div>

      <div className="header-right">
        <div className="environment-badges" aria-label="Application status">
          <span>API v{workspace.apiVersion}</span>
          <span>Front v{FRONT_VERSION}</span>
          <span>Simulation only</span>
        </div>
        <nav className="main-nav" aria-label="Main navigation">
          {NAV_ITEMS.map(({ id, label, Icon }) => (
            <button key={id} type="button" className={activeTab === id ? 'active' : ''} onClick={() => onTabChange(id)}>
              <Icon size={16} />
              <span>{label}</span>
            </button>
          ))}
        </nav>
      </div>
    </header>
  )
}
