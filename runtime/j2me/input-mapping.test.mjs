import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import vm from 'node:vm'

const source = readFileSync(new URL('./input-mapping.js', import.meta.url), 'utf8')

function createTarget() {
  const listeners = new Map()
  return {
    addEventListener(type, callback) {
      const entries = listeners.get(type) || []
      entries.push(callback)
      listeners.set(type, entries)
    },
    removeEventListener(type, callback) {
      listeners.set(type, (listeners.get(type) || []).filter((entry) => entry !== callback))
    },
    dispatch(type, event = {}) {
      for (const callback of [...(listeners.get(type) || [])]) callback(event)
    },
  }
}

function createEnvironment() {
  const window = createTarget()
  const document = createTarget()
  document.hidden = false
  const values = new Map()
  window.document = document
  window.navigator = { getGamepads: () => [] }
  window.localStorage = {
    getItem: (key) => values.get(key) || null,
    setItem: (key, value) => values.set(key, value),
  }
  window.CustomEvent = class CustomEvent {
    constructor(type, init) { this.type = type; this.detail = init?.detail }
  }
  window.dispatchEvent = (event) => window.dispatch(event.type, event)
  window.setTimeout = setTimeout
  window.clearTimeout = clearTimeout
  window.setInterval = () => 1
  window.clearInterval = () => {}
  vm.runInNewContext(source, { window })
  return { window, document }
}

function keyEvent(code, key = code) {
  return {
    code,
    key,
    target: { closest: () => null },
    preventDefault() { this.prevented = true },
    stopImmediatePropagation() { this.stopped = true },
  }
}

test('holds a logical action until both touch and keyboard sources release it', () => {
  const { window, document } = createEnvironment()
  const edges = []
  const input = window.InputMapping.create({
    gameId: 'shared-hold',
    keyboard: true,
    repeat: false,
    sink: { press: (action) => edges.push(`P:${action}`), release: (action) => edges.push(`R:${action}`) },
  })

  input.press('touch:up', 'up')
  const down = keyEvent('ArrowUp')
  document.dispatch('keydown', down)
  document.dispatch('keydown', keyEvent('ArrowUp'))
  document.dispatch('keyup', keyEvent('ArrowUp'))
  assert.deepEqual(edges, ['P:up'])
  input.release('touch:up', 'up')
  assert.deepEqual(edges, ['P:up', 'R:up'])
  assert.equal(down.prevented, true)
  assert.equal(down.stopped, true)
  input.destroy()
})

test('maps gamepad button edges and releases held actions when the controller disconnects', () => {
  const { window } = createEnvironment()
  const edges = []
  const buttons = [{ pressed: true }]
  let pads = [{ index: 0, buttons, axes: [] }]
  window.navigator.getGamepads = () => pads
  const input = window.InputMapping.create({
    gameId: 'gamepad-edge',
    gamepad: true,
    repeat: false,
    sink: { press: (action) => edges.push(`P:${action}`), release: (action) => edges.push(`R:${action}`) },
  })

  input.pollGamepads()
  input.pollGamepads()
  assert.deepEqual(edges, ['P:ok'])
  window.dispatch('gamepaddisconnected', { gamepad: { index: 0 } })
  assert.deepEqual(edges, ['P:ok', 'R:ok'])
  pads = []
  input.pollGamepads()
  input.destroy()
})

test('uses axis hysteresis to avoid repeated direction edges around the threshold', () => {
  const { window } = createEnvironment()
  const edges = []
  const pad = { index: 0, buttons: [], axes: [-0.6, 0] }
  window.navigator.getGamepads = () => [pad]
  const input = window.InputMapping.create({
    gameId: 'axis-hysteresis',
    gamepad: true,
    repeat: false,
    sink: { press: (action) => edges.push(`P:${action}`), release: (action) => edges.push(`R:${action}`) },
  })

  input.pollGamepads()
  pad.axes[0] = -0.45
  input.pollGamepads()
  assert.deepEqual(edges, ['P:left'])
  pad.axes[0] = -0.34
  input.pollGamepads()
  assert.deepEqual(edges, ['P:left', 'R:left'])
  input.destroy()
})

test('persists captured keyboard and gamepad controls per game', () => {
  const { window, document } = createEnvironment()
  const input = window.InputMapping.create({ gameId: 'capture', keyboard: true, gamepad: true, repeat: false })
  input.captureControl('ok')
  document.dispatch('keydown', keyEvent('KeyJ', 'j'))
  assert.equal(input.keyboardBindings().KeyJ, 'ok')
  input.captureControl('choice')
  window.navigator.getGamepads = () => [{ index: 0, buttons: [{ pressed: false }, { pressed: true }], axes: [] }]
  input.pollGamepads()
  assert.equal(input.gamepadBindings()['button:1'], 'choice')
  input.destroy()
})

test('keeps legacy delete-key and literal digit defaults', () => {
  const { window, document } = createEnvironment()
  const edges = []
  const input = window.InputMapping.create({
    gameId: 'legacy-key-aliases', keyboard: true, repeat: false,
    sink: { press: (action) => edges.push(`P:${action}`), release: (action) => edges.push(`R:${action}`) },
  })
  document.dispatch('keydown', keyEvent('Delete', 'Delete'))
  document.dispatch('keyup', keyEvent('Delete', 'Delete'))
  document.dispatch('keydown', keyEvent('', '7'))
  document.dispatch('keyup', keyEvent('', '7'))
  assert.deepEqual(edges, ['P:clear', 'R:clear', 'P:num7', 'R:num7'])
  input.destroy()
})

test('polls gamepads only while one is connected', () => {
  const { window } = createEnvironment()
  const timers = new Set()
  let next = 1
  window.setInterval = () => { const id = next++; timers.add(id); return id }
  window.clearInterval = (id) => timers.delete(id)
  let pads = [null, null]
  window.navigator.getGamepads = () => pads
  const input = window.InputMapping.create({ gameId: 'gamepad-idle', gamepad: true, repeat: false, sink: {} })
  assert.equal(timers.size, 0, 'no controller, no polling')
  pads = [{ index: 0, buttons: [], axes: [] }]
  window.dispatch('gamepadconnected', { gamepad: pads[0] })
  assert.equal(timers.size, 1, 'a connected controller is polled')
  window.dispatch('gamepadconnected', { gamepad: pads[0] })
  assert.equal(timers.size, 1, 'and only by one timer')
  pads = [null]
  window.dispatch('gamepaddisconnected', { gamepad: { index: 0 } })
  assert.equal(timers.size, 0, 'polling stops with the last controller')
  input.destroy()
})

test('the flash family has its own actions and leaves unbound keys to the game', () => {
  const { window, document } = createEnvironment()
  const edges = []
  const input = window.InputMapping.create({
    family: 'flash',
    gameId: 'flash:game.swf',
    keyboard: true,
    gamepad: true,
    trustedOnly: true,
    repeat: false,
    sink: { press: (action) => edges.push(`P:${action}`), release: (action) => edges.push(`R:${action}`) },
  })
  assert.deepEqual([...input.actions], ['up', 'down', 'left', 'right', 'ok', 'a', 'b'])
  const arrow = { ...keyEvent('ArrowUp'), isTrusted: true }
  document.dispatch('keydown', arrow)
  assert.equal(arrow.prevented, undefined, 'an unbound key reaches the Flash game untouched')

  input.setKeyboardBinding('a', 'KeyJ')
  document.dispatch('keydown', { ...keyEvent('KeyJ', 'j'), isTrusted: false })
  assert.deepEqual(edges, [], 'the player\'s own synthetic key is not input')
  document.dispatch('keydown', { ...keyEvent('KeyJ', 'j'), isTrusted: true })
  document.dispatch('keyup', { ...keyEvent('KeyJ', 'j'), isTrusted: true })
  assert.deepEqual(edges, ['P:a', 'R:a'])

  window.navigator.getGamepads = () => [{ index: 0, buttons: [{ pressed: true }], axes: [] }]
  input.pollGamepads()
  assert.deepEqual(edges, ['P:a', 'R:a', 'P:a'])
  input.press('touch:x', 'star')
  assert.deepEqual(edges, ['P:a', 'R:a', 'P:a'], 'phone actions do not exist in the flash family')
  input.destroy()
})

test('games without their own bindings follow the family\'s global choice, and a reset returns to it', () => {
  const { window, document } = createEnvironment()
  window.localStorage.setItem(window.InputMapping.globalKey('phone'), JSON.stringify({ keyboard: { KeyK: 'ok' }, gamepad: { 'button:7': 'ok' } }))
  const edges = []
  const input = window.InputMapping.create({
    gameId: 'global', keyboard: true, gamepad: true, repeat: false,
    sink: { press: (action) => edges.push(`P:${action}`) },
  })
  assert.deepEqual({ ...input.keyboardBindings() }, { KeyK: 'ok' }, 'a saved global map replaces the defaults')
  document.dispatch('keydown', keyEvent('Enter'))
  document.dispatch('keydown', keyEvent('KeyK', 'k'))
  assert.deepEqual(edges, ['P:ok'])

  input.setKeyboardBinding('up', 'KeyW')
  input.resetKeyboardBindings()
  assert.deepEqual({ ...input.keyboardBindings() }, { KeyK: 'ok' })
  assert.deepEqual({ ...input.gamepadBindings() }, { 'button:7': 'ok' })
  input.destroy()

  // After the reset the game keeps no copy: a later global change reaches it.
  window.localStorage.setItem(window.InputMapping.globalKey('phone'), JSON.stringify({ keyboard: { KeyL: 'ok' } }))
  const again = window.InputMapping.create({ gameId: 'global', keyboard: true, repeat: false })
  assert.deepEqual({ ...again.keyboardBindings() }, { KeyL: 'ok' })
  again.destroy()
})

test('the shoulder buttons press the soft keys', () => {
  const { window } = createEnvironment()
  const edges = []
  window.navigator.getGamepads = () => [{ index: 0, buttons: [{}, {}, {}, {}, { pressed: true }, { pressed: true }], axes: [] }]
  const input = window.InputMapping.create({ gameId: 'soft', gamepad: true, repeat: false, sink: { press: (action) => edges.push(action) } })
  input.pollGamepads()
  assert.deepEqual(edges.sort(), ['back', 'choice'])
  input.destroy()
})
