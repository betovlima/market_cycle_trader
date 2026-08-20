import { tr } from '../../../i18n/runtime'
import { number, percent } from '../../../shared/formatters'

export function TemporalMetric({ label, value, note = null, tone = '' }: AppRecord) {
  return (
    <div className={`temporal-metric ${tone}`}>
      <span>{label}</span>
      <strong>{value}</strong>
      {note ? <small>{note}</small> : null}
    </div>
  )
}

export function LegacyHorizonTable({ items = [], selectedHorizon, onSelect }: AppRecord) {
  return (
    <div className="temporal-table-shell">
      <table className="temporal-table">
        <thead>
          <tr>
            <th>{tr('Horizon')}</th><th>{tr('OOS Samples')}</th><th>{tr('Brier')}</th><th>{tr('Brier Skill')}</th>
            <th>{tr('Calibration Error')}</th><th>{tr('AUC')}</th><th>{tr('Alpha Rank Correlation')}</th>
            <th>{tr('Alpha MAE')}</th><th>{tr('Alpha MAE Skill')}</th><th>{tr('Drawdown MAE')}</th>
            <th>{tr('Drawdown MAE Skill')}</th><th>{tr('High Confidence Hit Rate')}</th><th>{tr('High Confidence Lift')}</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item: AppRecord) => (
            <tr key={item.horizon} className={Number(selectedHorizon) === Number(item.horizon) ? 'selected' : ''} onClick={() => onSelect(Number(item.horizon))}>
              <td><strong>{item.horizon}d</strong></td><td>{number(item.samples, 0)}</td><td>{number(item.brier, 4)}</td>
              <td>{percent(item.brier_skill, 2)}</td><td>{percent(item.calibration_error, 2)}</td><td>{number(item.auc, 3)}</td>
              <td>{number(item.alpha_rank_correlation, 3)}</td><td>{percent(item.alpha_mae, 2)}</td><td>{percent(item.alpha_mae_skill, 2)}</td>
              <td>{percent(item.drawdown_mae, 2)}</td><td>{percent(item.drawdown_mae_skill, 2)}</td>
              <td>{percent(item.high_confidence_positive_rate, 2)}</td><td>{percent(item.high_confidence_lift, 2)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export function ConfidenceTable({ items = [] }: AppRecord) {
  if (!items.length) return null
  return (
    <div className="temporal-table-shell compact">
      <table className="temporal-table">
        <thead><tr><th>{tr('Probability Band')}</th><th>{tr('Samples')}</th><th>{tr('Mean Probability')}</th><th>{tr('Realized Hit Rate')}</th><th>{tr('Realized Alpha')}</th><th>{tr('Predicted Alpha')}</th><th>{tr('Realized Drawdown')}</th></tr></thead>
        <tbody>{items.map((item: AppRecord) => <tr key={`${item.from_probability}-${item.to_probability}`}><td>{percent(item.from_probability, 0)}–{percent(item.to_probability, 0)}</td><td>{number(item.samples, 0)}</td><td>{percent(item.mean_probability, 2)}</td><td>{percent(item.realized_positive_rate, 2)}</td><td>{percent(item.mean_realized_alpha, 2)}</td><td>{percent(item.mean_predicted_alpha, 2)}</td><td>{percent(item.mean_realized_drawdown, 2)}</td></tr>)}</tbody>
      </table>
    </div>
  )
}

export function LegacyForecastTable({ items = [] }: AppRecord) {
  if (!items.length) return <div className="temporal-empty">{tr('No latest forecast is available for this horizon.')}</div>
  return (
    <div className="temporal-table-shell">
      <table className="temporal-table temporal-forecast-table">
        <thead><tr><th>{tr('Asset')}</th><th>{tr('Expected Alpha')}</th><th>{tr('P(Alpha > 0)')}</th><th>{tr('Expected Max Drawdown')}</th></tr></thead>
        <tbody>{items.map((item: AppRecord) => <tr key={`${item.horizon}-${item.symbol}`}><td><strong>{item.symbol}</strong></td><td className={Number(item.expected_alpha) >= 0 ? 'positive' : 'negative'}>{percent(item.expected_alpha, 2)}</td><td>{percent(item.probability_positive_alpha, 2)}</td><td>{percent(item.expected_max_drawdown, 2)}</td></tr>)}</tbody>
      </table>
    </div>
  )
}
