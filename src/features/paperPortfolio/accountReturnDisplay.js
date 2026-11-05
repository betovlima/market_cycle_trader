import { tr } from '../../i18n/runtime'

/**
 * Brokerage ACCOUNT return, not model-only performance.
 * The API chains 1D equity changes net of recognized deposits/withdrawals.
 * Do not describe it as a real-time value or exact transaction-time TWR.
 */
export function accountReturnDetail(performance, amount) {
  if (performance?.status === 'available' && Number.isFinite(Number(performance.return_pct))) {
    const parts = [
      performance.start_date ? `${tr('Since')} ${performance.start_date}` : null,
      performance.as_of_date ? `${tr('Through')} ${performance.as_of_date}` : null,
      performance.profit_loss != null ? amount(performance.profit_loss) : null,
      tr('Daily return estimate, adjusted for external transfers'),
    ]
    return parts.filter(Boolean).join(' · ')
  }
  if (performance?.reason === 'cashflow_type_unverified' ||
      performance?.reason === 'cashflow_unverified') {
    return tr('Alpaca cash movements could not be classified safely.')
  }
  if (performance?.reason === 'history_incomplete') {
    return tr('Alpaca daily equity history has gaps.')
  }
  return tr('Alpaca history not yet sufficient to calculate accumulated return')
}
