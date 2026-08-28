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

function reliabilityLabel(level) {
  if (level === 'HIGH') return tr('High diagnostic confidence')
  if (level === 'MODERATE') return tr('Moderate diagnostic confidence')
  return tr('Low diagnostic confidence')
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

function sampleText(evidence) {
  if (!evidence || evidence.rows == null) return '—'
  const positives = evidence.positive_count == null ? '—' : evidence.positive_count
  const negatives = evidence.negative_count == null ? '—' : evidence.negative_count
  return `${evidence.rows} ${tr('samples')} · ${positives} ${tr('positive')} · ${negatives} ${tr('negative')}`
}

function aucCell(value, evidence) {
  return <span className="fit-diagnostic-auc-cell"><b>{value == null ? '—' : number(value, 3)}</b><small>{sampleText(evidence)}</small></span>
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
      <div className="fit-diagnostic-status-stack">
        <strong className="fit-diagnostic-status">{statusLabel(diagnostic.status)}</strong>
        <small>{reliabilityLabel(diagnostic.reliability_level)}</small>
      </div>
    </header>

    <p className="fit-diagnostic-explanation">{statusExplanation(diagnostic.status)}</p>
    {diagnostic.reliability_level === 'LOW' || diagnostic.reliability_level === 'MODERATE' ?
      <p className="fit-diagnostic-reliability-note">{tr('The diagnosis is limited by sample size or class balance in at least one chronological partition. Low-confidence folds do not drive the aggregate conclusion.')}</p> : null}

    <div className="fit-diagnostic-metrics">
      {metric('Training separation ability', diagnostic.median_training_auc)}
      {metric('Internal validation separation ability', diagnostic.median_validation_auc)}
      {metric('Unseen-period separation ability', diagnostic.median_oos_auc)}
      {metric('Training to unseen-period gap', diagnostic.median_train_to_oos_gap)}
    </div>

    {folds.length ? <div className="fit-diagnostic-folds">
      <div className="fit-diagnostic-fold-head fit-diagnostic-fold-head-v91"><span>{tr('Fold')}</span><span>{tr('Training')}</span><span>{tr('Internal validation')}</span><span>{tr('Unseen period')}</span><span>{tr('Diagnostic confidence')}</span><span>{tr('Diagnosis')}</span></div>
      {folds.map((fold) => <div className="fit-diagnostic-fold-row fit-diagnostic-fold-row-v91" key={fold.foldId}>
        <strong>{fold.foldId}</strong>
        {aucCell(fold.training_auc, fold.sample_evidence?.training)}
        {aucCell(fold.validation_auc, fold.sample_evidence?.validation)}
        {aucCell(fold.oos_auc, fold.sample_evidence?.oos)}
        <small>{reliabilityLabel(fold.reliability?.level)}</small>
        <small>{statusLabel(fold.status)}</small>
      </div>)}
    </div> : null}

    <footer>{tr('Diagnostic only. Model parameters and Strategy decisions remain unchanged. First confirm that the statistical evidence is reliable before changing model complexity or training windows.')}</footer>
  </section>
}
