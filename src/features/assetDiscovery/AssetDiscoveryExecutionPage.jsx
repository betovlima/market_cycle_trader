import { useState } from 'react'

import { tr } from '../../i18n/runtime'
import { AssetDiscoveryPage } from './AssetDiscoveryPage'
import { CompletionNotificationToggle } from './CompletionNotificationToggle'
import { PredictiveAssetDiscoveryPage } from './PredictiveAssetDiscoveryPage'
import { ASSET_DISCOVERY_ECONOMIC_REPLAY_STORAGE_KEY } from './useAssetDiscoveryAutoEconomicReplay'
import './assetDiscoveryExecution.css'

function resetEconomicReplayPreference() {
  try {
    window.sessionStorage.setItem(ASSET_DISCOVERY_ECONOMIC_REPLAY_STORAGE_KEY, 'false')
  } catch {
    // Keep the explicit UI state even when session storage is unavailable.
  }
  return false
}

export function AssetDiscoveryExecutionPage({ capabilities = {}, onSessionExpired }) {
  const [runEconomicContribution, setRunEconomicContribution] = useState(resetEconomicReplayPreference)

  const handleEconomicContributionChange = (event) => {
    const next = event.target.checked
    try {
      window.sessionStorage.setItem(ASSET_DISCOVERY_ECONOMIC_REPLAY_STORAGE_KEY, next ? 'true' : 'false')
    } catch {
      // The current render still remains the source of truth.
    }
    setRunEconomicContribution(next)
  }

  return <>
    <section className="asset-discovery-page asset-discovery-execution-choice">
      <div className="asset-discovery-workspace">
        <section className="asset-discovery-config">
          <label className="asset-discovery-select-asset">
            <input
              type="checkbox"
              checked={runEconomicContribution}
              onChange={handleEconomicContributionChange}
            />
            <span>{tr('Economic contribution over the complete Strategy history')}</span>
          </label>
          <div className="asset-discovery-fixed-config">
            <span>{tr('Automatic economic replay')}</span>
            <strong>{runEconomicContribution ? tr('Enabled') : tr('Disabled')}</strong>
            <small>{tr('This replay is manual and expensive. It is not part of the normal discovery flow.')}</small>
          </div>
          <CompletionNotificationToggle />
        </section>
      </div>
    </section>

    {runEconomicContribution
      ? <AssetDiscoveryPage capabilities={capabilities} onSessionExpired={onSessionExpired} />
      : <div className="asset-discovery-predictive-workflow"><PredictiveAssetDiscoveryPage capabilities={capabilities} onSessionExpired={onSessionExpired} /></div>}
  </>
}
