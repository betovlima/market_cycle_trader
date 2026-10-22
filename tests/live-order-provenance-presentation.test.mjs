import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const dashboard = readFileSync(new URL('../src/features/paperPortfolio/PaperPortfolioDashboard.jsx', import.meta.url), 'utf8')
const strips = readFileSync(new URL('../src/features/paperPortfolio/components/PortfolioPrimitives.jsx', import.meta.url), 'utf8')
const styles = readFileSync(new URL('../src/styles.css', import.meta.url), 'utf8')
const translations = readFileSync(new URL('../src/i18n/liveWorkflowTranslations.js', import.meta.url), 'utf8')

test('provenance labels are evidence-based and shown separately from model decision', () => {
  for (const key of ['manual_alpaca_fills', 'live_automated_verified', 'live_broker_unclassified', 'live_no_orders', 'live_not_executed']) {
    assert.ok(dashboard.includes(key), 'missing provenance code ' + key)
  }
  assert.ok(dashboard.includes('executionOriginLabel(order.execution_origin)'))
  assert.ok(dashboard.includes('executionOriginLabel(decision.execution_origin)'))
  assert.ok(dashboard.includes('Live Winner decision preserved from the validated prior-day signal.'))
  assert.ok(dashboard.includes("market === 'live'"))
})

test('authorized real orders are amber risk, not connection failure', () => {
  assert.ok(strips.includes("robot.real_orders_armed ? 'risk' : 'checking'"))
  assert.ok(styles.includes('.session-status-chip.risk {'))
  assert.ok(!strips.includes("robot.real_orders_armed ? 'unavailable'"))
})

test('provenance labels are localized for PT and ES', () => {
  for (const label of ['Manual Alpaca fills · verified', 'Automatic MCT Live order · verified', 'Alpaca order · origin not verified', 'No orders · HOLD/CASH confirmed']) {
    assert.equal(translations.split(label).length - 1, 2)
  }
})
