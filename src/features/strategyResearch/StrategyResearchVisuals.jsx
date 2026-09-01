import { TemporalCurrentForecastPanel } from './TemporalCurrentForecastPanel'
import { TemporalResearchSettingsPanel } from './TemporalResearchSettingsPanel'
import { StrategyResearchVisuals as BaseStrategyResearchVisuals } from './StrategyResearchVisualsBase'

export function StrategyResearchVisuals(props) {
  if (props?.selectedStage === 'temporal') {
    return <>
      <TemporalResearchSettingsPanel />
      <TemporalCurrentForecastPanel run={props?.run} />
      <BaseStrategyResearchVisuals {...props} />
    </>
  }
  return <BaseStrategyResearchVisuals {...props} />
}
