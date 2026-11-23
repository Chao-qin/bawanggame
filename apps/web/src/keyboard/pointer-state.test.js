import assert from 'node:assert/strict'
import test from 'node:test'
import { createPointerState, pointerDown, pointerMove, pointerTarget, pointerUp, pressedKeyIds, releaseAll } from './pointer-state.js'

const on = (...units) => ({ keyId: units[0] || null, units })

test('pointer down presses what it lands on and records the pointer', () => {
  const { state, pressed } = pointerDown(createPointerState(), 11, on('key-a'))
  assert.deepEqual(pressed, ['key-a'])
  assert.deepEqual(pressedKeyIds(state), new Set(['key-a']))
})

test('a pointer landing between keys is tracked without pressing anything', () => {
  const { state, pressed } = pointerDown(createPointerState(), 11, on())
  assert.deepEqual(pressed, [])
  assert.ok(Object.hasOwn(state.pointers, 11))
  const entered = pointerMove(state, 11, on('key-a'))
  assert.deepEqual(entered.pressed, ['key-a'])
})

test('sliding leaves one key and enters the next; leaving the keys releases', () => {
  let state = pointerDown(createPointerState(), 11, on('key-a')).state
  let step = pointerMove(state, 11, on('key-b'))
  assert.deepEqual([step.released, step.pressed], [['key-a'], ['key-b']])
  state = step.state
  step = pointerMove(state, 11, on('key-b'))
  assert.deepEqual([step.released, step.pressed], [[], []], 'moving within a key changes nothing')
  step = pointerMove(step.state, 11, on())
  assert.deepEqual([step.released, step.pressed], [['key-b'], []])
  assert.deepEqual(pressedKeyIds(step.state), new Set())
  step = pointerMove(step.state, 11, on('key-c'))
  assert.deepEqual(step.pressed, ['key-c'], 'coming back onto the keys presses again')
})

test('a diagonal holds two units and moving to one of them releases only the other', () => {
  let state = pointerDown(createPointerState(), 11, { keyId: 'dpad', units: ['dpad:up', 'dpad:left'] }).state
  assert.deepEqual(pressedKeyIds(state), new Set(['dpad:up', 'dpad:left']))
  const step = pointerMove(state, 11, { keyId: 'dpad', units: ['dpad:up'] })
  assert.deepEqual([step.released, step.pressed], [['dpad:left'], []])
})

test('the landing hub flag sticks to the pointer', () => {
  const state = pointerDown(createPointerState(), 11, { keyId: 'dpad', units: ['dpad:center'], hub: true }).state
  assert.equal(pointerMove(state, 11, on()).state.pointers[11].hub, true)
  assert.equal(pointerTarget(createPointerState(), 99).hub, false)
})

test('duplicate down keeps the original target; unknown pointers are no-ops', () => {
  const { state } = pointerDown(createPointerState(), 11, on('key-a'))
  assert.deepEqual(pointerDown(state, 11, on('key-b')).state, state)
  assert.deepEqual(pointerUp(state, 99), { state, released: [] })
  assert.deepEqual(pointerMove(state, 99, on('key-b')).pressed, [])
})

test('same key remains pressed until every pointer releases it', () => {
  let state = pointerDown(createPointerState(), 11, on('key-a')).state
  state = pointerDown(state, 12, on('key-a')).state
  const first = pointerUp(state, 11)
  assert.deepEqual(first.released, ['key-a'])
  assert.deepEqual(pressedKeyIds(first.state), new Set(['key-a']))
  assert.deepEqual(pressedKeyIds(pointerUp(first.state, 12).state), new Set())
})

test('release all returns every held unit with its pointer and an empty state', () => {
  let state = pointerDown(createPointerState(), 11, on('key-a')).state
  state = pointerDown(state, 12, { keyId: 'dpad', units: ['dpad:up', 'dpad:right'] }).state
  const result = releaseAll(state)
  assert.deepEqual(result.released, [
    { pointerId: '11', unitId: 'key-a' }, { pointerId: '12', unitId: 'dpad:up' }, { pointerId: '12', unitId: 'dpad:right' },
  ])
  assert.deepEqual(result.state, { pointers: {} })
})
