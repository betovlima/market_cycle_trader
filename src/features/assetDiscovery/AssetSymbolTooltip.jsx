import { tr } from '../../i18n/runtime'

export function AssetSymbolTooltip({ symbol, companyName, children }) {
  const ticker = String(symbol || '').trim().toUpperCase()
  const name = String(companyName || '').trim()
  const content = children ?? ticker
  if (!name) return <span>{content}</span>

  return <span
    className="asset-discovery-symbol-tooltip"
    tabIndex={0}
    aria-label={`${ticker} · ${tr('Company')}: ${name}`}
  >
    <span className="asset-discovery-symbol-tooltip-value">{content}</span>
    <span className="asset-discovery-symbol-tooltip-card" role="tooltip">
      <span>{tr('Company')}</span>
      <strong>{name}</strong>
    </span>
  </span>
}
