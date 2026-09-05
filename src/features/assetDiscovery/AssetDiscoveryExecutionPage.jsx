import { CompletionNotificationToggle } from './CompletionNotificationToggle'
import { PredictiveAssetDiscoveryPage } from './PredictiveAssetDiscoveryPage'
import './assetDiscoveryExecution.css'

export function AssetDiscoveryExecutionPage({ capabilities = {}, onSessionExpired }) {
  return <>
    <section className="asset-discovery-page asset-discovery-execution-choice">
      <div className="asset-discovery-workspace">
        <section className="asset-discovery-config">
          <CompletionNotificationToggle />
        </section>
      </div>
    </section>

    <div className="asset-discovery-predictive-workflow">
      <PredictiveAssetDiscoveryPage capabilities={capabilities} onSessionExpired={onSessionExpired} />
    </div>
  </>
}
