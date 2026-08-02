import { PaperPortfolioDashboard } from './features/paperPortfolio/PaperPortfolioDashboard'

export default function App() {
  return (
    <main className="app-shell">
      <header className="topbar">
        <div>
          <span className="eyebrow">ALPACA PAPER</span>
          <h1>Market Cycle Trader</h1>
          <p>Private portfolio monitoring.</p>
        </div>
      </header>
      <PaperPortfolioDashboard />
    </main>
  )
}
