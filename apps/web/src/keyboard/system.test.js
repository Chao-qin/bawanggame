import test from 'node:test'
import assert from 'node:assert/strict'
import { bindControl, controlName, controlsFor, familyForRuntime, globalBindingsKey, heldGamepadControl, previewAction, readGlobalBindings, unbindAction, writeGlobalBindings } from './system.js'

const memoryStorage = () => {
  const values = new Map()
  return { getItem: (key) => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) }
}

test('every runtime belongs to one keyboard family', () => {
  assert.equal(familyForRuntime('j2me').id, 'phone')
  assert.equal(familyForRuntime('maopao').id, 'phone')
  assert.equal(familyForRuntime('flash').id, 'flash')
  assert.equal(familyForRuntime('local-revival'), null)
})

test('controls read as key names and gamepad parts', () => {
  assert.deepEqual(['KeyJ', 'Digit3', 'Numpad5', 'ArrowUp', 'button:0', 'axis:1:-', 'F13'].map(controlName),
    ['J', '3', '小键盘 5', '↑', '手柄按钮 1', '摇杆轴 2 负向', 'F13'])
  assert.equal(controlsFor({ KeyJ: 'ok', Enter: 'ok', KeyK: 'up' }, 'ok'), 'J、Enter')
  assert.equal(controlsFor({}, 'ok'), '未绑定')
})

test('binding a control replaces the action\'s previous controls; clearing removes them', () => {
  const bindings = { Enter: 'ok', KeyJ: 'ok', ArrowUp: 'up' }
  assert.deepEqual(bindControl(bindings, 'ok', 'KeyK'), { ArrowUp: 'up', KeyK: 'ok' })
  assert.deepEqual(bindControl(bindings, 'up', 'KeyJ'), { Enter: 'ok', KeyJ: 'up' }, 'a control moves to its new action')
  assert.deepEqual(unbindAction(bindings, 'ok'), { ArrowUp: 'up' })
})

test('global bindings complete from the engine defaults, save as whole maps and announce the change', () => {
  const storage = memoryStorage()
  const defaults = { keyboard: { Enter: 'ok' }, gamepad: { 'button:0': 'ok' } }
  assert.deepEqual(readGlobalBindings('phone', defaults, storage), defaults)
  const events = []
  writeGlobalBindings('phone', { keyboard: {}, gamepad: { 'button:1': 'ok' } }, { storage, target: { dispatchEvent: (event) => events.push(event.detail) } })
  assert.deepEqual(JSON.parse(storage.getItem(globalBindingsKey('phone'))), { keyboard: {}, gamepad: { 'button:1': 'ok' } })
  assert.deepEqual(readGlobalBindings('phone', defaults, storage), { keyboard: {}, gamepad: { 'button:1': 'ok' } }, 'an emptied map stays empty')
  assert.equal(events[0].family, 'phone')
})

test('a held gamepad control is named as the engine names it', () => {
  assert.equal(heldGamepadControl([null, { buttons: [{ pressed: false }, { pressed: true }], axes: [] }]), 'button:1')
  assert.equal(heldGamepadControl([{ buttons: [], axes: [0, 0.9] }]), 'axis:1:+')
  assert.equal(heldGamepadControl([{ buttons: [], axes: [0.3] }]), null)
})

test('tapping a preview key picks the action it stands for', () => {
  assert.equal(previewAction('phone', { value: 'num5' }), 'num5')
  assert.equal(previewAction('phone', { value: 'dpad' }), null)
  assert.equal(previewAction('flash', { id: 'flash-a', value: 'Space' }), 'a')
  assert.equal(previewAction('flash', { id: 'flash-dpad', value: 'ArrowLeft' }), 'left')
})

test('every screen keyboard yields its pieces: whole in portrait, halves or whole in landscape', async () => {
  const { keypadPieces, SCREEN_KEYPADS } = await import('./system.js')
  assert.equal(SCREEN_KEYPADS.length, 8)
  for (const keypad of SCREEN_KEYPADS) {
    const portrait = keypadPieces(keypad.id, 'portrait')
    assert.equal(portrait.length, 1, keypad.id)
    assert.ok(portrait[0].layout.keys.length > 0, keypad.id)
    const landscape = keypadPieces(keypad.id, 'landscape')
    assert.equal(landscape.length, keypad.split ? 2 : 1, keypad.id)
    const keys = landscape.reduce((sum, item) => sum + item.layout.keys.length, 0)
    assert.equal(keys, getLayoutKeys(keypad.landscape), `${keypad.id} halves keep every key`)
  }
  assert.deepEqual(keypadPieces('dpad-abxy', 'landscape').map((item) => item.layout.keys.map((key) => key.block)[0]), ['dpad', 'abxy'])
})

import { getLayout } from './layouts.js'
function getLayoutKeys(id) { return getLayout(id).keys.length }

test('a screen key means the same thing in every runtime family', async () => {
  const { flashCodeOf, phoneActionOf } = await import('./system.js')
  const bindings = { ArrowUp: 'up', Digit5: 'num5', KeyQ: 'choice' }
  assert.equal(phoneActionOf({ value: 'num5' }, bindings), 'num5', 'T9 keys are actions')
  assert.equal(phoneActionOf({ keyId: 'key-q', value: 'KeyQ' }, bindings), 'choice', 'QWERTY keys follow the key mapping')
  assert.equal(phoneActionOf({ keyId: 'key-z', value: 'KeyZ' }, bindings), null)
  assert.equal(phoneActionOf({ keyId: 'button-a', value: 'KeyA' }, bindings), 'ok', 'controller buttons have fixed meanings')
  const keys = { directions: 'wasd', ok: 'Enter', a: 'Space', b: 'KeyX' }
  assert.deepEqual(['up', 'ok', 'choice', 'num7', 'star', 'ret'].map((value) => flashCodeOf({ value }, keys)),
    ['KeyW', 'Enter', 'Space', 'Digit7', 'NumpadMultiply', 'Escape'])
  assert.equal(flashCodeOf({ value: 'KeyJ' }, keys), 'KeyJ')
  assert.equal(flashCodeOf({ value: 'Multiply' }, keys), 'NumpadMultiply')
})
