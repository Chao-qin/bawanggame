import assert from 'node:assert/strict'
import test from 'node:test'
import {
  createPointerState,
  pointerCancel,
  pointerDown,
  pointerUp,
  pressedKeyIds,
  releaseAll,
} from './pointer-state.js'

test('pointer down records a pointer-key association', () => {
  const state = pointerDown(createPointerState(), 11, 'key-a')
  assert.deepEqual(state.pointers, { 11: 'key-a' })
  assert.deepEqual(pressedKeyIds(state), new Set(['key-a']))
})

test('pointer up and cancel release only the matching pointer', () => {
  const state = pointerDown(pointerDown(createPointerState(), 11, 'key-a'), 12, 'key-b')
  assert.deepEqual(pointerCancel(state, 11).pointers, { 12: 'key-b' })
  assert.deepEqual(pointerUp(state, 12).pointers, { 11: 'key-a' })
})

test('duplicate down preserves original mapping and unknown release is a no-op', () => {
  const state = pointerDown(createPointerState(), 11, 'key-a')
  assert.deepEqual(pointerDown(state, 11, 'key-b').pointers, { 11: 'key-a' })
  assert.deepEqual(pointerUp(state, 99).pointers, state.pointers)
  assert.deepEqual(pointerCancel(state, 99).pointers, state.pointers)
})

test('same key remains pressed until every pointer releases it', () => {
  let state = pointerDown(createPointerState(), 11, 'key-a')
  state = pointerDown(state, 12, 'key-a')
  assert.deepEqual(pressedKeyIds(state), new Set(['key-a']))
  state = pointerUp(state, 11)
  assert.deepEqual(pressedKeyIds(state), new Set(['key-a']))
  state = pointerUp(state, 12)
  assert.deepEqual(pressedKeyIds(state), new Set())
})

test('canceling one pointer leaves another pointer held', () => {
  let state = pointerDown(createPointerState(), 11, 'key-a')
  state = pointerDown(state, 12, 'key-b')
  state = pointerCancel(state, 11)
  assert.deepEqual(state.pointers, { 12: 'key-b' })
  assert.deepEqual(pressedKeyIds(state), new Set(['key-b']))
  state = pointerUp(state, 12)
  assert.deepEqual(pressedKeyIds(state), new Set())
})

test('release all returns released associations and an empty state', () => {
  const state = pointerDown(pointerDown(createPointerState(), 11, 'key-a'), 12, 'key-b')
  const result = releaseAll(state)
  assert.deepEqual(result.released, [{ pointerId: '11', keyId: 'key-a' }, { pointerId: '12', keyId: 'key-b' }])
  assert.deepEqual(result.state, { pointers: {} })
  assert.deepEqual(pressedKeyIds(result.state), new Set())
})
