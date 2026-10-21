import test from 'node:test'
import assert from 'node:assert/strict'
import { liveSessionModel } from '../src/features/paperPortfolio/liveSessionModel.js'

test('Live status reads only live control mode, not Paper robot flags', () => {
  const model = liveSessionModel({
    connection: { status: 'ready' },
    marketClock: { is_open: false, next_close: '2026-10-22T20:00:00Z' },
    robot: { control_mode: 'paused', enabled: true, scheduler_alive: true },
  })
  assert.equal(model.robotLabel, 'Paused')
  assert.equal(model.robotTone, 'checking')
  assert.equal(model.connectionReady, true)
  assert.equal(model.marketLabel, 'Market closed')
  assert.equal(model.closeAt, '2026-10-22T20:00:00Z')
})

test('Live never invents calculation and execution times from NYSE clock', () => {
  const model = liveSessionModel({
    marketClock: { is_open: true, next_open: '2026-10-22T13:30:00Z', next_close: '2026-10-22T20:00:00Z' },
    robot: { control_mode: 'active', monitoring_enabled: false, active_run: { expected_market_open: '2026-10-22T13:30:00Z' } },
    nextRefreshAt: 123,
  })
  assert.equal(model.postCloseAt, null)
  assert.equal(model.openCalibrationAt, null)
  assert.equal(model.executionAt, null)
  assert.equal(model.closeAt, '2026-10-22T20:00:00Z')
  assert.equal(model.manualRefresh, true)
  assert.equal(model.refreshAt, null)
})

test('Live uses explicit Live timestamps and does not treat inactive monitoring as scheduled', () => {
  const model = liveSessionModel({
    robot: {
      control_mode: 'exit_only',
      monitoring_enabled: true,
      next_execution_session: '2026-10-22',
      next_post_close_calibration_at: '2026-10-21T20:10:00Z',
      next_market_open_recalibration_at: '2026-10-22T13:00:00Z',
      next_execution_at: '2026-10-22T13:33:00Z',
    },
    nextRefreshAt: 987654,
  })
  assert.equal(model.robotLabel, 'Exit only')
  assert.equal(model.postCloseAt, '2026-10-21T20:10:00Z')
  assert.equal(model.openCalibrationAt, '2026-10-22T13:00:00Z')
  assert.equal(model.executionAt, '2026-10-22T13:33:00Z')
  assert.equal(model.refreshAt, 987654)
})

test('Live unknown status remains unknown while loading, never masquerades as stopped or connected', () => {
  const model = liveSessionModel()
  assert.equal(model.connectionReady, false)
  assert.equal(model.robotLabel, 'Checking')
  assert.equal(model.marketLabel, 'Market checking')
  assert.equal(model.closeAt, null)
  assert.equal(model.manualRefresh, false)
})

test('Live stopped, paused and active states are distinct', () => {
  assert.equal(liveSessionModel({robot:{control_mode:'stopped'}}).robotLabel,'Stopped')
  assert.equal(liveSessionModel({robot:{control_mode:'paused'}}).robotLabel,'Paused')
  assert.equal(liveSessionModel({robot:{control_mode:'active'}}).robotLabel,'Active')
})
