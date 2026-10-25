import { useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { getIntlLocale, tr } from '../../i18n/runtime'
import { replaySelectionHelpExample } from './annualReplayHelpModel.mjs'

const formatted = (value) => value == null || !Number.isFinite(value) ? '—'
  : new Intl.NumberFormat(getIntlLocale(), { minimumFractionDigits: 6, maximumFractionDigits: 6 }).format(value)

export function AnnualReplayHelpModal({ signals, onClose }) {
  const dialog = useRef(null)
  const example = replaySelectionHelpExample(signals)
  useEffect(() => {
    const previousFocus = document.activeElement
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    dialog.current?.focus()
    function keydown(event) {
      if (event.key === 'Escape') { event.preventDefault(); onClose(); return }
      if (event.key !== 'Tab') return
      const items = [...(dialog.current?.querySelectorAll('button:not(:disabled), [href], [tabindex]:not([tabindex="-1"])') || [])]
      if (!items.length) { event.preventDefault(); return }
      if (event.shiftKey && document.activeElement === items[0]) { event.preventDefault(); items.at(-1).focus() }
      else if (!event.shiftKey && document.activeElement === items.at(-1)) { event.preventDefault(); items[0].focus() }
    }
    document.addEventListener('keydown', keydown)
    return () => {
      document.removeEventListener('keydown', keydown)
      document.body.style.overflow = previousOverflow
      previousFocus?.focus?.()
    }
  }, [onClose])

  return createPortal(
    <div className="annual-replay-help-overlay" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}>
      <section ref={dialog} role="dialog" tabIndex={-1} aria-modal="true" aria-labelledby="annual-replay-help-title" aria-describedby="annual-replay-help-subtitle" className="annual-replay-help-dialog">
        <header className="annual-replay-help-dialog-header">
          <div><h2 id="annual-replay-help-title">{tr('How does the strategy choose an asset?')}</h2>
            <p id="annual-replay-help-subtitle">{tr('Understand estimated scores and rotation decisions')}</p></div>
          <button type="button" className="annual-replay-help-close" aria-label={tr('Close selection help')} onClick={onClose}>×</button>
        </header>
        <div className="annual-replay-help-dialog-body">
          <section>
            <h3><span className="annual-replay-help-step">1</span> {tr('What does the model learn?')}</h3>
            <p>{tr('Historical training examples measure the returns, adverse lows and drawdowns across 5, 10, 20, 40 and 60 trading sessions. Movement capture and trend persistence also contribute to the target.')}</p>
            <div className="annual-replay-help-formula">{tr('Observed utility = weighted risk-adjusted results + movement capture + trend persistence')}</div>
            <p>{tr('LightGBM uses the 52 historical indicators available at the decision date, including returns, volatility, trend and volume, to learn how to predict this target.')}</p>
          </section>
          <section>
            <h3><span className="annual-replay-help-step">2</span> {tr('How are these numbers calculated?')}</h3>
            <p>{tr('Each asset has a trained regression model. Its LightGBM trees start with a base prediction and add adjustments based on the 52 indicators for that asset and session.')}</p>
            <div className="annual-replay-help-formula">{tr('Estimated utility = base prediction + sum of the tree contributions')}</div>
            <p>{tr('The historical replay stores the final score, not the contribution of every tree. An exact decomposition requires the fitted model and the input indicators and cannot be inferred from these bars.')}</p>
            <p className="annual-replay-help-example-alert">{tr('Illustrative arithmetic only (not actual model-tree contributions):')}</p>
            <div className="annual-replay-help-formula">
              <span>AVGO: 0,300000 + 0,080000 − 0,005439 = 0,374561</span>
              <span>LLY: 0,300000 + 0,120000 − 0,012550 = 0,407450</span>
            </div>
            {example.recorded
              ? <p className="annual-replay-help-recorded">{tr('Recorded scores for the selected session')}</p>
              : <p className="annual-replay-help-example-alert">{tr('Illustrative example only: both historic scores are unavailable for this session; the values below are not reconstructed predictions.')}</p>}
            <div className="annual-replay-help-score-grid">
              <div><small>{tr('Current asset')} · {example.before}</small><strong>{formatted(example.beforeScore)}</strong></div>
              <div><small>{tr('Highest-ranked candidate')} · {example.best}</small><strong>{formatted(example.bestScore)}</strong></div>
            </div>
            <p>{tr('A score is not a predicted return percentage. For example, 0.407450 does not imply a 40.745% gain.')}</p>
          </section>
          <section>
            <h3><span className="annual-replay-help-step">3</span> {tr('When does the strategy rotate?')}</h3>
            <div className="annual-replay-help-formula">
              <span>{example.best} − {example.before}: {formatted(example.bestScore)} − {formatted(example.beforeScore)}</span>
              <strong>{tr('Candidate advantage')}: {formatted(example.advantage)}</strong>
            </div>
            <p>{example.margin === null
              ? tr('The required margin was not saved for this session; the replay cannot verify this test.')
              : tr('Required margin for this example: {value}', { value: formatted(example.margin) })}</p>
            <p>{tr('In the documented Control policy, the current asset normally remains for at least two trading sessions, and a challenger must exceed the required margin. Cash and risk safeguards may override this. Other backtests can have different settings.')}</p>
            {example.recorded
              ? <div className="annual-replay-help-result">
                  <strong>{tr('Recorded decision')}: {example.reason ? tr(example.reason) : tr('Not available')}</strong>
                  <p>{example.heldByMinimum ? tr('The minimum-holding rule prevented rotation.') : example.heldByMargin ? tr('The score advantage was below the required margin.') : tr('This is the saved decision reason, not a newly simulated action.')}</p>
                  {example.holdingDays != null ? <small>{tr('Holding days at decision')}: {example.holdingDays}</small> : null}
                </div>
              : <div className="annual-replay-help-result"><strong>{tr('Illustrative outcome')}: AVGO → LLY</strong>
                  <p>{tr('With a margin of 0.010000, at least two holding sessions completed and no other restrictions, the illustrative rotation is allowed.')}</p></div>}
          </section>
        </div>
        <footer className="annual-replay-help-dialog-footer">
          <button type="button" className="annual-replay-help-done" onClick={onClose}>{tr('Got it, close help')}</button>
        </footer>
      </section>
    </div>,
    document.body,
  )
}
