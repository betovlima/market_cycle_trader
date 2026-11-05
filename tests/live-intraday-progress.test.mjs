import test from 'node:test'
import assert from 'node:assert/strict'
import {
  LIVE_INTRADAY_STEPS,
  liveIntradayProgressModel,
} from '../src/features/liveTrader/liveIntradayProgressModel.js'

test('regular market open enables analysis without a post-close wait', () => {
  const state = liveIntradayProgressModel({
    status: 'idle', can_analyze: true, session: '2026-11-05',
  })
  assert.equal(state.kind, 'ready')
  assert.equal(state.spinning, false)
  assert.match(state.description, /sem aguardar o fechamento/)
})

test('unknown, closed and failed states never pretend to be processing', () => {
  for (const state of [
    liveIntradayProgressModel(null),
    liveIntradayProgressModel({ status: 'idle', can_analyze: false }),
    liveIntradayProgressModel({ status: 'failed', phase: 'model_calibration' }),
    liveIntradayProgressModel({ status: 'running', phase: 'validating' }, 'Connection error'),
  ]) {
    assert.equal(state.kind !== 'running', true)
  }
  assert.equal(liveIntradayProgressModel({ status: 'failed' }).kind, 'error')
  assert.equal(liveIntradayProgressModel({ status: 'idle', can_analyze: false }).kind, 'waiting')
})

test('backend phases determine real visible steps without made-up percentages', () => {
  assert.equal(LIVE_INTRADAY_STEPS.length, 5)
  for (let i = 0; i < LIVE_INTRADAY_STEPS.length - 1; i++) {
    const result = liveIntradayProgressModel({
      status: 'running', phase: LIVE_INTRADAY_STEPS[i].id,
    })
    assert.equal(result.kind, 'running')
    assert.equal(result.stage, i)
    assert.equal(result.spinning, true)
    assert.equal(result.headline, LIVE_INTRADAY_STEPS[i].label)
    assert.equal('progress_pct' in result, false)
  }
  const unknown = liveIntradayProgressModel({ status: 'running', phase: 'new_unrecognized_phase' })
  assert.equal(unknown.kind, 'running')
  assert.equal(unknown.stage, 0)
  assert.match(unknown.description, /Etapa confirmada pelo backend/)
})

test('completed advisory result is distinct from order execution', () => {
  const done = liveIntradayProgressModel({ status: 'prepared' })
  assert.equal(done.kind, 'completed')
  assert.equal(done.stage, 5)
  assert.equal(done.spinning, false)
  assert.match(done.description, /Nenhuma ordem foi enviada/)
})
