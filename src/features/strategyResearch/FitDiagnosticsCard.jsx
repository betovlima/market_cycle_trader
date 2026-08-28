import { tr } from '../../i18n/runtime'
import { number } from '../../shared/formatters'
import './fitDiagnostics.css'

function statusLabel(status) {
  if (status === 'POSSIBLE_UNDERFITTING') return tr('Possible underfitting')
  if (status === 'OVERFITTING_RISK') return tr('Overfitting risk')
  if (status === 'HEALTHY_FIT') return tr('Healthy fit')
  if (status === 'UNSTABLE_GENERALIZATION') return tr('Unstable generalization')
  return tr('Inconclusive fit diagnosis')
}

function statusExplanation(status) {
  if (status === 'POSSIBLE_UNDERFITTING') return tr('The model shows limited separation ability even on training data. This suggests possible underfitting, but weak feature or target signal remains an alternative explanation.')
  if (status === 'OVERFITTING_RISK') return tr('Training separation is materially stronger than unseen-period separation, indicating risk that the model learned patterns that do not generalize.')
  if (status === 'HEALTHY_FIT') return tr('Training skill remains reasonably preserved in internal validation and unseen chronological periods.')
  if (status === 'UNSTABLE_GENERALIZATION') return tr('The model learns useful structure, but that structure deteriorates when evaluated on later unseen periods.')
  return tr('There is not enough consistent evidence yet to distinguish underfitting, overfitting and weak signal.')
}

function metric(label, value) {
  return <div className="fit-diagnostic-metric"><span>{tr(label)}</span><strong>{value == null ? '—' : number(value, 3)}</strong></div>
}

export function FitDiagnosticsCard({ analysis, foldScope = null }) {
  const diagnostic = analysis?.fit_diagnostics
  if (!diagnostic || !diagnostic.folds) return null
  const folds = (analysis?.folds || []).map((fold) => {
    const current = foldScope ? fold?.fit_diagnostics?.[foldScope] : fold?.fit_diagnostics
    return current ? { foldId: fold.fold_id, ...current } : null
  }).filter(Boolean)

  return <section className={`fit-diagnostic-card ${String(diagnostic.status || 'INCONCLUSIVE').toLowerCase()}`}>
    <header className="fit-diagnostic-heading">
      <div>
        <span className="panel-kicker">{tr('MODEL FIT DIAGNOSTICS')}</span>
        <h5>{tr('Training × validation × unseen-period diagnosis')}</h5>
      </div>
      <strong className="fit-diagnostic-status">{statusLabel(diagnostic.status)}</strong>
    </header>

    <p className="fit-diagnostic-explanation">{statusExplanation(diagnostic.status)}</p>

    <div className="fit-diagnostic-metrics">
      {metric('Training separation ability', diagnostic.median_training_auc)}
      {metric('Internal validation separation ability', diagnostic.median_validation_auc)}
      {metric('Unseen-period separation ability', diagnostic.median_oos_auc)}
      {metric('Training to unseen-period gap', diagnostic.median_train_to_oos_gap)}
    </div>

    {folds.length ? <div className="fit-diagnostic-folds">
      <div className="fit-diagnostic-fold-head"><span>{tr('Fold')}</span><span>{tr('Training')}</span><span>{tr('Internal validation')}</span><span>{tr('Unseen period')}</span><span>{tr('Diagnosis')}</span></div>
      {folds.map((fold) => <div className="fit-diagnostic-fold-row" key={fold.foldId}>
        <strong>{fold.foldId}</strong>
        <span>{fold.training_auc == null ? '—' : number(fold.training_auc, 3)}</span>
        <span>{fold.validation_auc == null ? '—' : number(fold.validation_auc, 3)}</span>
        <span>{fold.oos_auc == null ? '—' : number(fold.oos_auc, 3)}</span>
        <small>{statusLabel(fold.status)}</small>
      </div>)}
    </div> : null}

    <footer>{tr('Diagnostic only. Model capacity and Strategy decisions are not changed. A controlled capacity test is required before changing model complexity.')}</footer>
  </section>
}
