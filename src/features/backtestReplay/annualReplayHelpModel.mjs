// Explain recorded scores without re-evaluating historic models.
const finite = (value) => {
  if (value == null || value === '') return null
  const number = Number(value)
  return Number.isFinite(number) ? number : null
}

export function replaySelectionHelpExample(signals) {
  const top = Array.isArray(signals?.top) ? signals.top : []
  const before = signals?.before || null
  const best = signals?.best || top[0]?.asset || null
  const topScore = (asset) => finite(top.find((item) => item.asset === asset)?.score)
  const beforeScore = finite(signals?.beforeScore) ?? topScore(before)
  const bestScore = finite(signals?.bestScore) ?? topScore(best)
  if (!before || !best || beforeScore === null || bestScore === null) {
    // Deliberately illustrative and never described as a recorded result.
    return { recorded: false, before: 'AVGO', best: 'LLY',
      beforeScore: 0.374561, bestScore: 0.407450, advantage: 0.032889,
      margin: 0.010, holdingDays: null, reason: null,
      heldByMinimum: false, heldByMargin: false }
  }
  return {
    recorded: true, before, best, beforeScore, bestScore,
    advantage: bestScore - beforeScore, margin: finite(signals?.margin),
    holdingDays: finite(signals?.holdingDays),
    reason: signals?.reason || null,
    heldByMinimum: signals?.heldByMinimum === true,
    heldByMargin: signals?.heldByMargin === true,
  }
}
