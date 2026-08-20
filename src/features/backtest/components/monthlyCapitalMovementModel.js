import { getIntlLocale } from '../../../i18n/runtime'

export function movementTimestamp(value) {
  const timestamp = Date.parse(value || '')
  return Number.isFinite(timestamp) ? timestamp : null
}

export function normalizedMovementAsset(value) {
  const asset = String(value || 'CASH').trim().toUpperCase()
  return asset || 'CASH'
}

export function monthNames() {
  const formatter = new Intl.DateTimeFormat(getIntlLocale(), { month: 'short', timeZone: 'UTC' })
  return Array.from({ length: 12 }, (_, index) => formatter.format(new Date(Date.UTC(2024, index, 1))).replace('.', ''))
}

export function fullMonthName(year, month) {
  return new Intl.DateTimeFormat(getIntlLocale(), { month: 'long', year: 'numeric', timeZone: 'UTC' })
    .format(new Date(Date.UTC(year, month - 1, 1)))
}

export function compactMoney(value) {
  const number = Number(value)
  if (!Number.isFinite(number)) return '—'
  return new Intl.NumberFormat(getIntlLocale(), {
    style: 'currency',
    currency: 'USD',
    notation: 'compact',
    maximumFractionDigits: 1,
  }).format(number)
}

export function monthMovementModel(rotations, equity) {
  const movements = (rotations || [])
    .map((item) => ({ ...item, executedAtValue: movementTimestamp(item.executed_at) }))
    .filter((item) => item.executedAtValue !== null)
    .sort((left, right) => left.executedAtValue - right.executedAtValue)

  const equityRows = (equity || [])
    .map((item) => ({
      ...item,
      timestampValue: movementTimestamp(item.timestamp || item.recorded_at),
      equityValue: Number(item.simulation_equity),
    }))
    .filter((item) => item.timestampValue !== null && Number.isFinite(item.equityValue))
    .sort((left, right) => left.timestampValue - right.timestampValue)

  const months = new Map()
  const ensureMonth = (year, month) => {
    const key = `${year}-${month}`
    if (!months.has(key)) {
      months.set(key, {
        key,
        year,
        month,
        movements: [],
        equityPoints: [],
        totalRealizedPnl: 0,
        totalFees: 0,
        profitableExits: 0,
        losingExits: 0,
        flatExits: 0,
        assetToAsset: 0,
        marketToCash: 0,
        cashToMarket: 0,
        holdingValues: [],
        sessionCount: 0,
        cashSessions: 0,
        boughtCounts: new Map(),
        soldCounts: new Map(),
        bestExit: null,
        worstExit: null,
      })
    }
    return months.get(key)
  }

  for (const movement of movements) {
    const date = new Date(movement.executedAtValue)
    const month = ensureMonth(date.getUTCFullYear(), date.getUTCMonth() + 1)
    month.movements.push(movement)
    const fromAsset = normalizedMovementAsset(movement.from_asset)
    const toAsset = normalizedMovementAsset(movement.to_asset)
    if (fromAsset === 'CASH' && toAsset !== 'CASH') month.cashToMarket += 1
    else if (fromAsset !== 'CASH' && toAsset === 'CASH') month.marketToCash += 1
    else if (fromAsset !== 'CASH' && toAsset !== 'CASH') month.assetToAsset += 1

    if (fromAsset !== 'CASH') month.soldCounts.set(fromAsset, (month.soldCounts.get(fromAsset) || 0) + 1)
    if (toAsset !== 'CASH') month.boughtCounts.set(toAsset, (month.boughtCounts.get(toAsset) || 0) + 1)

    const holding = Number(movement.holding_days)
    if (Number.isFinite(holding)) month.holdingValues.push(holding)

    const pnl = Number(movement.realized_pnl)
    if (movement.realized_pnl !== null && movement.realized_pnl !== undefined && Number.isFinite(pnl)) {
      month.totalRealizedPnl += pnl
      if (pnl > 0) month.profitableExits += 1
      else if (pnl < 0) month.losingExits += 1
      else month.flatExits += 1
      if (!month.bestExit || pnl > Number(month.bestExit.realized_pnl)) month.bestExit = movement
      if (!month.worstExit || pnl < Number(month.worstExit.realized_pnl)) month.worstExit = movement
    }

    const fees = Number(movement.transaction_fees)
    if (Number.isFinite(fees)) month.totalFees += fees
  }

  let currentAsset = normalizedMovementAsset(movements[0]?.from_asset || 'CASH')
  let movementIndex = 0
  for (const row of equityRows) {
    while (movementIndex < movements.length && movements[movementIndex].executedAtValue <= row.timestampValue) {
      currentAsset = normalizedMovementAsset(movements[movementIndex].to_asset)
      movementIndex += 1
    }
    const date = new Date(row.timestampValue)
    const month = ensureMonth(date.getUTCFullYear(), date.getUTCMonth() + 1)
    month.sessionCount += 1
    if (currentAsset === 'CASH') month.cashSessions += 1
    month.equityPoints.push({ timestamp: row.timestampValue, value: row.equityValue })
  }

  const topAsset = (counts) => [...counts.entries()].sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))[0]?.[0] || null
  let maxAbsPnl = 0
  let maxMovements = 0
  let maxCashSessions = 0
  let maxHolding = 0

  for (const month of months.values()) {
    month.movementCount = month.movements.length
    month.averageHolding = month.holdingValues.length
      ? month.holdingValues.reduce((total, value) => total + value, 0) / month.holdingValues.length
      : null
    month.marketExposure = month.sessionCount > 0 ? (month.sessionCount - month.cashSessions) / month.sessionCount : null
    month.topBoughtAsset = topAsset(month.boughtCounts)
    month.topSoldAsset = topAsset(month.soldCounts)
    month.firstEquity = month.equityPoints[0]?.value ?? null
    month.lastEquity = month.equityPoints[month.equityPoints.length - 1]?.value ?? null
    month.equityReturn = month.firstEquity && month.lastEquity != null ? month.lastEquity / month.firstEquity - 1 : null
    maxAbsPnl = Math.max(maxAbsPnl, Math.abs(month.totalRealizedPnl))
    maxMovements = Math.max(maxMovements, month.movementCount)
    maxCashSessions = Math.max(maxCashSessions, month.cashSessions)
    if (month.averageHolding != null) maxHolding = Math.max(maxHolding, month.averageHolding)
  }

  const years = [...new Set([...months.values()].map((item) => item.year))].sort((left, right) => left - right)
  return { months, years, maxAbsPnl, maxMovements, maxCashSessions, maxHolding }
}

export function heatmapMetric(month, mode, model) {
  if (mode === 'movements') {
    const ratio = model.maxMovements ? month.movementCount / model.maxMovements : 0
    return { label: String(month.movementCount), tone: 'movements', alpha: .12 + ratio * .64 }
  }
  if (mode === 'cash') {
    const ratio = model.maxCashSessions ? month.cashSessions / model.maxCashSessions : 0
    return { label: `${month.cashSessions}d`, tone: 'cash', alpha: .12 + ratio * .68 }
  }
  if (mode === 'holding') {
    if (month.averageHolding == null) return { label: '—', tone: 'empty', alpha: .08 }
    const ratio = model.maxHolding ? month.averageHolding / model.maxHolding : 0
    return { label: `${month.averageHolding.toFixed(1)}d`, tone: 'holding', alpha: .12 + ratio * .62 }
  }
  const ratio = model.maxAbsPnl ? Math.abs(month.totalRealizedPnl) / model.maxAbsPnl : 0
  return {
    label: compactMoney(month.totalRealizedPnl),
    tone: month.totalRealizedPnl > 0 ? 'positive' : month.totalRealizedPnl < 0 ? 'negative' : 'flat',
    alpha: .12 + ratio * .66,
  }
}


export function aggregateHeatmapMetric(items, mode, model) {
  const months = (items || []).filter(Boolean)
  if (!months.length) return { label: '—', tone: 'empty', alpha: .08 }
  if (mode === 'movements') {
    const value = months.reduce((total, month) => total + Number(month.movementCount || 0), 0)
    return { label: String(value), tone: 'movements', alpha: .42 }
  }
  if (mode === 'cash') {
    const value = months.reduce((total, month) => total + Number(month.cashSessions || 0), 0)
    return { label: `${value}d`, tone: 'cash', alpha: .42 }
  }
  if (mode === 'holding') {
    const values = months.flatMap((month) => month.holdingValues || []).map(Number).filter(Number.isFinite)
    if (!values.length) return { label: '—', tone: 'empty', alpha: .08 }
    const average = values.reduce((total, value) => total + value, 0) / values.length
    return { label: `${average.toFixed(1)}d`, tone: 'holding', alpha: .42 }
  }
  const total = months.reduce((sum, month) => sum + Number(month.totalRealizedPnl || 0), 0)
  const ratio = model.maxAbsPnl ? Math.min(1, Math.abs(total) / model.maxAbsPnl) : 0
  return {
    label: compactMoney(total),
    tone: total > 0 ? 'positive' : total < 0 ? 'negative' : 'flat',
    alpha: .18 + ratio * .56,
  }
}

