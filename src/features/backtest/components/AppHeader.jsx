import { tr } from '../../../i18n/runtime'
import { LanguageSelector } from '../../../i18n/LanguageSelector'
import { AnalyticsIcon, BacktestIcon, DashboardIcon, PortfolioIcon, SettingsIcon } from '../../../shared/components/Icons'
import appLogoUrl from '../../../assets/market-cycle-trader-logo.png'

const VIEWER_NAV_ITEMS = [
  { id: 'dashboard', label: 'Dashboard', Icon: DashboardIcon },
  { id: 'backtest', label: 'Backtest', Icon: BacktestIcon },
  { id: 'analytics', label: 'Analytics', Icon: AnalyticsIcon },
]

const TRADER_NAV_ITEMS = [
  ...VIEWER_NAV_ITEMS,
  { id: 'portfolio', label: 'Portfolio', Icon: PortfolioIcon },
]

const ADMIN_NAV_ITEMS = [
  ...TRADER_NAV_ITEMS,
  { id: 'administration', label: 'Administration', Icon: DashboardIcon },
  { id: 'system-settings', label: 'Settings', Icon: SettingsIcon },
]

export function AppHeader({ activeTab, onTabChange, session, onLogout }) {
  const navItems = session?.role === 'admin' ? ADMIN_NAV_ITEMS : session?.role === 'trader' ? TRADER_NAV_ITEMS : VIEWER_NAV_ITEMS
  return (
    <header className="app-header">
      <div className="brand-area">
        <div className="brand-logo-frame" aria-hidden="true">
          <img className="app-logo" src={appLogoUrl} alt="" width="64" height="64" decoding="async" fetchPriority="high" />
        </div>
        <div className="brand-divider" />
        <div className="brand-copy">
          <h1>{tr("Market Cycle Trader")}</h1>
          <div className="brand-subtitle">{tr("Historical Market Simulation")}</div>
          <p>{tr("Run protected simulations and review authorized performance results.")}</p>
        </div>
      </div>

      <div className="header-right">
        <div className="header-language-primary">
          <LanguageSelector compact />
        </div>
        <nav className="main-nav" aria-label={tr("Main navigation")}>
          {navItems.map(({ id, label, Icon }) => (
            <button key={id} type="button" className={activeTab === id ? 'active' : ''} onClick={() => onTabChange(id)}>
              <Icon size={16} />
              <span>{tr(label)}</span>
            </button>
          ))}
        </nav>
        <div className="session-controls"><span>{session?.display_name || session?.role}</span><button type="button" onClick={onLogout}>{tr("Sign out")}</button></div>
      </div>
    </header>
  )
}
