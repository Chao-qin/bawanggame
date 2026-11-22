import assert from 'node:assert/strict'
import test from 'node:test'
import { createRuntimeBackGate } from './runtimeBackGate.js'

test('consumes a startup back signal without replaying it after ready', () => {
  const gate = createRuntimeBackGate(0)
  gate.setPhase('starting')
  assert.equal(gate.observe(1), false)
  gate.setPhase('ready')
  assert.equal(gate.observe(1), false)
  assert.equal(gate.observe(2), true)
})

test('allows toolbar and native back after ready or terminal failure', () => {
  const gate = createRuntimeBackGate()
  assert.equal(gate.canRequest(), false)
  gate.setPhase('ready')
  assert.equal(gate.canRequest(), true)
  gate.setPhase('failed')
  assert.equal(gate.canRequest(), true)
})

test('dismissing confirmation does not alter the signal cursor', () => {
  const gate = createRuntimeBackGate()
  gate.setPhase('ready')
  assert.equal(gate.observe(1), true)
  assert.equal(gate.observe(1), false)
  assert.equal(gate.observe(2), true)
})
