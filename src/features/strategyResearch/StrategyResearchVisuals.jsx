import { AssetStateClusteringPanel } from '../assetStateClustering/AssetStateClusteringPanel'
import { StrategyResearchVisuals as BaseStrategyResearchVisuals } from './StrategyResearchVisualsBase'

export function StrategyResearchVisuals(props) {
  if (props?.selectedStage === 'asset_state_clustering') {
    return <AssetStateClusteringPanel analysis={props?.assetStateClustering} />
  }
  return <BaseStrategyResearchVisuals {...props} />
}
