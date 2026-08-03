export function ConfigurationPanel({ workspace }) {
  const { running, runBacktest } = workspace

  return (
    <div className="section-heading backtest-launch-heading">
      <div>
        <span className="section-kicker">Backtest</span>
        <h2>Historical simulation</h2>
        <p>The protected configuration defines the complete execution period.</p>
      </div>
      <button
        type="button"
        className="button primary"
        onClick={runBacktest}
        disabled={running}
      >
        {running ? 'Running…' : 'Run backtest'}
      </button>
    </div>
  )
}
