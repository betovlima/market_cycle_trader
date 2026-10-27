import test from 'node:test'
import assert from 'node:assert/strict'
import { liveWorkflowDisplay, liveWorkflowAttemptStageKey } from '../src/features/paperPortfolio/liveWorkflowDisplay.mjs'

const failure = (at, stage = 'signal_preparation_failed') => ({
  recorded_at: at, stage, level: 'error', details: { error_type: 'RuntimeError' },
})

test('ready D-1 signal presents prior failure records as historical with later success evidence', () => {
  const report = {
    status: 'recalibrated_no_orders', recovery: 'not_required',
    orders_requiring_reconciliation: 0, last_preparation_error_type: null,
    events: [
      failure('2026-10-26T20:19:04Z'),
      { recorded_at: '2026-10-26T23:15:00Z', level: 'info', stage: 'signal_prepared' },
    ],
  }
  const view = liveWorkflowDisplay(report)
  assert.equal(view.hasDiagnostics, true)
  assert.equal(view.isHistorical, true)
  assert.equal(view.preparedAfterFailures, true)
  assert.equal(view.recentErrors.length, 1)
})

test('ready signal without a visible success event remains a qualified historical label, not proven recovery', () => {
  const report = {
    status: 'recalibrated_no_orders', recovery: 'not_required',
    events: [failure('2026-10-26T20:19:04Z')],
  }
  const view = liveWorkflowDisplay(report)
  assert.equal(view.isHistorical, true)
  assert.equal(view.preparedAfterFailures, false)
  assert.equal(view.recentErrors.length, 1)
})

test('failed or reconciliation-required session never hides diagnostics as historical', () => {
  for (const report of [
    { status: 'waiting_for_winner_signal', recovery: 'eligible_for_full_recalculation', events: [failure('2026-10-26T20:19:04Z')] },
    { status: 'recalibrated_no_orders', recovery: 'broker_reconciliation_required', orders_requiring_reconciliation: 1, events: [failure('2026-10-26T20:19:04Z')] },
  ]) {
    const view = liveWorkflowDisplay(report)
    assert.equal(view.isHistorical, false)
    assert.equal(view.preparedAfterFailures, false)
  }
})

test('stale error text alone remains available for audit even after the decision is ready', () => {
  const report = {
    status: 'recalibrated_no_orders', recovery: 'not_required',
    last_preparation_error_type: 'RuntimeError', events: [],
  }
  const view = liveWorkflowDisplay(report)
  assert.equal(view.hasDiagnostics, true)
  assert.equal(view.isHistorical, true)
  assert.equal(view.preparedAfterFailures, false)
})

test('successful D-1 result is labeled as calculation OR verification, not confirmed retraining', () => {
  assert.equal(liveWorkflowAttemptStageKey({
    stage: 'post_close_calculation', status: 'completed',
    result_status: 'recalibrated_no_orders',
  }), 'D-1 signal ready (calculation or verification)')
  for (const attempt of [
    { stage: 'post_close_calculation', status: 'retry_pending', error_type: 'RuntimeError' },
    { stage: 'broker_execution', status: 'completed', result_status: 'recalibrated_no_orders' },
    { stage: 'post_close_calculation', status: 'completed', result_status: 'waiting_for_completed_daily_bar' },
    null,
  ]) assert.equal(liveWorkflowAttemptStageKey(attempt), null)
})

test('no report defaults to empty display without assuming recovery', () => {
  const view = liveWorkflowDisplay(null)
  assert.equal(view.hasDiagnostics, false)
  assert.equal(view.isHistorical, false)
  assert.equal(view.recentErrors.length, 0)
  assert.deepEqual(view.attempts, [])
})
