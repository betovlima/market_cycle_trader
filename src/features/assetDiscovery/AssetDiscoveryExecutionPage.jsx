import { useEffect, useState } from 'react'

import { tr } from '../../i18n/runtime'
import { AssetDiscoveryPage } from './AssetDiscoveryPage'
import { PredictiveAssetDiscoveryPage } from './PredictiveAssetDiscoveryPage'

export const ASSET_DISCOVERY_ECONOMIC_REPLAY_STORAGE_KEY = 'mct.assetDiscovery.runEconomicContribution'

function initialEconomicReplayPreference() {
  try {
    return window.sessionStorage.getItem(ASSET_DISCOVERY_ECONOMIC_REPLAY_STORAGE_KEY) === 'true'
  } catch {
    return false
  }
}

export function AssetDiscoveryExecutionPage({ capabilities = {}, onSessionExpired }) {
  const [runEconomicContribution, setRunEconomicContribution] = useState(initialEconomicReplayPreference)

  useEffect(() => {
    try {
      window.sessionStorage.setItem(
        ASSET_DISCOVERY_ECONOMIC_REPLAY_STORAGE_KEY,
        runEconomicContribution ? 'true' : 'false',
      )
    } catch {
      // Session storage is only a convenience for preserving the execution choice.
    }
  }, [runEconomicContribution])

  return <>
    <section className="asset-discovery-page asset-discovery-execution-choice">
      <div className="asset-discovery-workspace">
        <section className="asset-discovery-config">
          <label className="asset-discovery-select-asset">
            <input
              type="checkbox"
              checked={runEconomicContribution}
              onChange={(event) => setRunEconomicContribution(event.target.checked)}
            />
            <span>{tr('Economic contribution over the complete Strategy history')}</span>
          </label>
          <div className="asset-discovery-fixed-config">
            <span>{tr('Automatic economic replay')}</span>
            <strong>{runEconomicContribution ? tr('Enabled') : tr('Disabled')}</strong>
            <small>{tr('This replay is manual and expensive. It is not part of the normal discovery flow.')}</small>
          </div>
        </section>
      </div>
    </section>

    {runEconomicContribution
      ? <AssetDiscoveryPage capabilities={capabilities} onSessionExpired={onSessionExpired} />
      : <PredictiveAssetDiscoveryPage capabilities={capabilities} onSessionExpired={onSessionExpired} />}
  </>
}
