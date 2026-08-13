import { tr } from '../../../i18n/runtime'

import { ShieldIcon, StarIcon, TrophyIcon } from '../../../shared/components/Icons'

export function StrategyLifecycleNotes({ selected }) {
  return (
    <>
{selected.status === 'backtest' ? (
            <div className="strategy-candidate-note">
              <StarIcon size={18} />
              <div><strong>{tr("Backtest Strategy")}</strong><span>{tr("This CARO result is ready for Backtest. A successful Backtest automatically makes this Strategy the active Candidate.")}</span></div>
            </div>
          ) : null}

          {selected.status === 'candidate' ? (
            <div className="strategy-candidate-note">
              <StarIcon size={18} />
              <div><strong>{tr("Validated candidate")}</strong><span>{tr("Certified revision")}{' '}{selected.candidate_revision} · {selected.candidate_model?.label || tr('Model snapshot')} · {tr("using backtest")}{' '}{selected.candidate_backtest_id}{tr(". Saving Strategy parameters will return it to draft; model settings remain frozen by the certified job.")}</span></div>
            </div>
          ) : null}

          {selected.status === 'superseded_candidate' ? (
            <div className="strategy-candidate-note historical">
              <StarIcon size={18} />
              {selected.historical_lifecycle_status === 'promoted_candidate' ? (
                <div><strong>{tr("Historical promoted candidate")}</strong><span>{tr("This Strategy previously held the Promoted Candidate role and was replaced by")}{' '}{selected.superseded_by_strategy_id || tr('a newer candidate')} {tr("It remains protected for audit and cloning.")}</span></div>
              ) : (
                <div><strong>{tr("Superseded candidate")}</strong><span>{tr("This validated candidate was replaced by")}{' '}{selected.superseded_by_strategy_id || tr('a newer candidate')} {tr("and remains protected for audit and cloning.")}</span></div>
              )}
            </div>
          ) : null}

          {selected.status === 'promoted_candidate' ? (
            <div className="strategy-candidate-note promoted">
              <TrophyIcon size={18} />
              <div><strong>{tr("Promoted candidate")}</strong><span>{tr("This exact validated revision created winner")}{' '}{selected.last_promoted_winner_strategy_id || tr('snapshot')} {tr("and remains protected for audit and cloning.")}</span></div>
            </div>
          ) : null}

          {selected.locked ? (
            <div className="strategy-protection-note">
              <ShieldIcon size={18} />
              <div>
                <strong>{tr(selected.status === 'winner' || selected.status === 'former_winner' ? 'Protected winner snapshot' : 'Protected candidate history')}</strong>
                <span>{tr("This lifecycle snapshot cannot be edited or deleted. Clone it to continue research.")}</span>
              </div>
            </div>
          ) : null}
    </>
  )
}
