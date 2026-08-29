import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'

import { tr } from '../../i18n/runtime'

const HELP = {
  marginalRank: {
    title: 'Marginal contribution rank',
    what: 'Position of this asset after candidates are sorted by final-capital contribution over the complete Strategy research history.',
    calculation: 'Completed full-history replays are ordered by final-capital contribution, from highest to lowest.',
    source: 'Full-history marginal replay results from the current Asset Discovery campaign.',
  },
  mlRank: {
    title: 'ML rank',
    what: 'Original position of the asset in the Learning-to-Rank shortlist.',
    calculation: 'Assigned by the discovery ranking model before the economic marginal replay is executed.',
    source: 'Saved Learning-to-Rank result from the current Asset Discovery campaign.',
  },
  baselineCapital: {
    title: 'Baseline capital',
    what: 'Final capital of the reference Strategy over the complete research period before the tested asset is added.',
    calculation: 'It is the ending portfolio equity produced by the baseline replay.',
    source: 'Official baseline replay over the complete Strategy research period, using the frozen Strategy snapshot, model, folds and execution-cost assumptions.',
  },
  baselineCagr: {
    title: 'Baseline CAGR',
    what: 'Annualized compounded growth rate of the baseline Strategy over the complete research period.',
    calculation: 'Computed from the baseline initial capital, ending capital and elapsed time.',
    source: 'Official baseline replay over the complete research period on the frozen Strategy Research snapshot.',
  },
  baselineSharpe: {
    title: 'Baseline Sharpe',
    what: 'Risk-adjusted return of the baseline Strategy over the complete research period.',
    calculation: 'Computed from the return series of the baseline equity curve; higher values indicate more return per unit of variability.',
    source: 'Baseline equity curve over the complete research period.',
  },
  baselineMaxDd: {
    title: 'Baseline MaxDD',
    what: 'Largest peak-to-trough decline in the baseline equity curve over the complete research period.',
    calculation: 'Maximum drawdown measured across the complete research period.',
    source: 'Baseline equity curve over the complete research period.',
  },
  baselineWorstFold: {
    title: 'Baseline worst fold',
    what: 'Lowest return among chronological walk-forward folds in the complete Strategy replay.',
    calculation: 'The minimum fold return from the baseline validation folds.',
    source: 'Purged walk-forward fold results from the complete Strategy replay.',
  },
  marginalCapital: {
    title: 'Marginal capital',
    what: 'Relative change in final Strategy capital when this asset is added to the baseline universe for the complete research period.',
    calculation: '(capital with asset / baseline capital) - 1. The amount below is the absolute final capital with the asset.',
    source: 'Candidate replay versus the same frozen baseline over the complete Strategy research period.',
  },
  cagrDelta: {
    title: 'CAGR Δ',
    what: 'Change in annualized compound growth after adding this asset.',
    calculation: 'Candidate CAGR - baseline CAGR.',
    source: 'Candidate full-history replay compared with the official baseline full-history replay.',
  },
  sharpeDelta: {
    title: 'Sharpe Δ',
    what: 'Change in risk-adjusted return after adding this asset.',
    calculation: 'Candidate Sharpe - baseline Sharpe.',
    source: 'Candidate full-history replay compared with the official baseline full-history replay.',
  },
  maxDdDelta: {
    title: 'MaxDD Δ',
    what: 'Change in maximum drawdown after adding this asset.',
    calculation: 'Candidate MaxDD - baseline MaxDD. Positive values mean a less severe drawdown; negative values mean a deeper drawdown.',
    source: 'Candidate full-history equity curve compared with the baseline full-history equity curve.',
  },
  worstFoldDelta: {
    title: 'Worst fold Δ',
    what: 'Change in the weakest out-of-sample fold after adding this asset.',
    calculation: 'Candidate worst-fold return - baseline worst-fold return. Positive values improve the weakest fold.',
    source: 'Purged walk-forward results from the complete candidate replay compared with the baseline fold results.',
  },
}

function MetricHelpDialog({ metric, onClose }) {
  const content = HELP[metric]

  useEffect(() => {
    const onKeyDown = (event) => {
      if (event.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [onClose])

  if (!content || typeof document === 'undefined') return null

  return createPortal(
    <div className="asset-discovery-metric-help-backdrop" role="presentation" onMouseDown={onClose}>
      <div
        className="asset-discovery-metric-help-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby={`asset-discovery-help-${metric}`}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="asset-discovery-metric-help-head">
          <div>
            <span className="eyebrow">{tr('METRIC DETAILS')}</span>
            <h3 id={`asset-discovery-help-${metric}`}>{tr(content.title)}</h3>
          </div>
          <button type="button" className="icon-button" onClick={onClose} aria-label={tr('Close')}>×</button>
        </div>
        <div className="asset-discovery-metric-help-content">
          <section>
            <strong>{tr('What it is')}</strong>
            <p>{tr(content.what)}</p>
          </section>
          <section>
            <strong>{tr('How it is calculated')}</strong>
            <p>{tr(content.calculation)}</p>
          </section>
          <section>
            <strong>{tr('Value source')}</strong>
            <p>{tr(content.source)}</p>
          </section>
        </div>
      </div>
    </div>,
    document.body,
  )
}

export function MarginalMetricHelpButton({ metric, label }) {
  const [open, setOpen] = useState(false)
  if (!HELP[metric]) return null

  return <>
    <button
      type="button"
      className="asset-discovery-metric-help-trigger"
      aria-label={tr('Open help for {label}', { label: tr(label || HELP[metric].title) })}
      aria-haspopup="dialog"
      aria-expanded={open}
      onClick={(event) => {
        event.preventDefault()
        event.stopPropagation()
        setOpen(true)
      }}
    >?</button>
    {open ? <MetricHelpDialog metric={metric} onClose={() => setOpen(false)} /> : null}
  </>
}

export function MarginalMetricLabel({ label, metric }) {
  return <div className="asset-discovery-metric-label">
    <span>{tr(label)}</span>
    <MarginalMetricHelpButton metric={metric} label={label} />
  </div>
}
