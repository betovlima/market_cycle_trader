import { useState } from 'react'

import { tr } from '../../i18n/runtime'
import { AssetDiscoveryPage } from './AssetDiscoveryPage'
import { CompletionNotificationToggle } from './CompletionNotificationToggle'
import { PredictiveAssetDiscoveryPage } from './PredictiveAssetDiscoveryPage'
import './assetDiscoveryExecution.css'

export function AssetDiscoveryExecutionPage({ capabilities = {}, onSessionExpired }) {
  const [runEconomicContribution, setRunEconomicContribution] = useState(false)

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
          <CompletionNotificationToggle />
        </section>
      </div>
    </section>

    {runEconomicContribution
      ? <AssetDiscoveryPage capabilities={capabilities} onSessionExpired={onSessionExpired} />
      : <div className="asset-discovery-predictive-workflow"><PredictiveAssetDiscoveryPage capabilities={capabilities} onSessionExpired={onSessionExpired} /></div>}
  </>
}
