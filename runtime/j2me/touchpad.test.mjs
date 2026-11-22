import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import vm from 'node:vm'

const source = readFileSync(new URL('./touchpad.js', import.meta.url), 'utf8')

function target() {
  const listeners = new Map()
  return {
    addEventListener(type, fn) { listeners.set(type, [...(listeners.get(type) || []), fn]) },
    removeEventListener(type, fn) { listeners.set(type, (listeners.get(type) || []).filter((x) => x !== fn)) },
    dispatch(type, event) { for (const fn of [...(listeners.get(type) || [])]) fn(event) },
    listeners,
    contains(node) { return !!node?.insideSurface },
    querySelector(selector) {
      if (selector.includes('dpad')) return this.dpad
      return this.keys[selector.match(/"([^"]+)"/)?.[1]]
    },
  }
}

function environment() {
  const surface = target()
  const dpad = { id: 'dpad', insideSurface: true, classList: { toggle() {} }, getBoundingClientRect: () => ({ left: 0, top: 0, width: 100, height: 100 }) }
  const keys = {}
  for (const id of ['up', 'right']) keys[id] = {
    id, insideSurface: true, dataset: { controlId: id }, classList: { toggle() {}, add() {}, remove() {} }, offsetWidth: 1,
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 50, height: 50 }),
    closest(selector) { return selector === '[data-control-id]' ? this : null },
  }
  surface.dpad = dpad
  surface.keys = keys
  surface.elementsFromPoint = (x, y) => [keys[x > 50 ? 'right' : 'up']]
  const document = target()
  document.getElementById = (id) => id === 'dpad' ? dpad : keys[id]
  const window = target()
  window.document = document
  window.performance = { now: () => 0 }
  window.matchMedia = () => ({ matches: true })
  window.getSelection = () => ({ rangeCount: 0 })
  window.setTimeout = setTimeout
  window.clearTimeout = clearTimeout
  window.navigator = { vibrate() {} }
  vm.runInNewContext(source, { window, document, performance: window.performance, navigator: window.navigator, setTimeout, clearTimeout })
  return { window, surface }
}

test('does not fall back to browser vibration inside the native host', () => {
  const { window, surface } = environment()
  let browserVibrations = 0
  let nativeHaptics = 0
  window.navigator.vibrate = () => { browserVibrations += 1 }
  window.__XIAOCHAO_RN_HOST__ = { haptic() { nativeHaptics += 1; return false } }
  const keyTarget = { insideSurface: true, closest: (selector) => selector === '[data-control-id]' ? surface.keys.right : null }
  const pad = window.Touchpad.bind({
    surface,
    buttons: { right: 'right' },
    actionMap: { right: 'right' },
    input: { press() {}, release() {} },
    feedback: { vibrate: 24 },
  })

  surface.dispatch('pointerdown', { pointerId: 10, pointerType: 'touch', clientX: 90, clientY: 10, target: keyTarget, preventDefault() {} })

  assert.equal(nativeHaptics, 1)
  assert.equal(browserVibrations, 0)
  pad.destroy()
})

test('does not call browser vibration for an incomplete native host', () => {
  for (const host of [{}, { haptic() { throw new Error('bridge unavailable') } }]) {
    const { window, surface } = environment()
    let browserVibrations = 0
    window.navigator.vibrate = () => { browserVibrations += 1 }
    window.__XIAOCHAO_RN_HOST__ = host
    const keyTarget = { insideSurface: true, closest: (selector) => selector === '[data-control-id]' ? surface.keys.right : null }
    const pad = window.Touchpad.bind({
      surface,
      buttons: { right: 'right' },
      actionMap: { right: 'right' },
      input: { press() {}, release() {} },
      feedback: { vibrate: 24 },
    })
    surface.dispatch('pointerdown', { pointerId: 11, pointerType: 'touch', clientX: 90, clientY: 10, target: keyTarget, preventDefault() {} })
    assert.equal(browserVibrations, 0)
    pad.destroy()
  }
})

test('routes diagonal SVG pointer actions through source-aware input', () => {
  const { window, surface } = environment()
  const edges = []
  surface.elementsFromPoint = () => [surface.keys.right]
  const pointerTarget = { insideSurface: true, closest: (selector) => selector === '[data-control-id]' ? surface.keys.right : null }
  const input = {
    press: (source, action) => edges.push(`P:${source}:${action}`),
    release: (source, action) => edges.push(`R:${source}:${action}`),
    repeat() {},
  }
  const pad = window.Touchpad.bind({
    surface,
    actionMap: { up: 'up', right: 'right' },
    buttons: { up: 'up', right: 'right', ok: 'ok' },
    input,
    feedback: { keyRepeat: false },
  })
  surface.dispatch('pointerdown', { pointerId: 3, pointerType: 'touch', clientX: 90, clientY: 10, width: 0, height: 0, target: pointerTarget, preventDefault() {} })
  assert.ok(edges.some((x) => x.includes('pointer:3:right')))
  surface.dispatch('pointerup', { pointerId: 3, target: surface })
  assert.ok(edges.some((x) => x.startsWith('R:pointer:3:right')))
  pad.destroy()
})

test('routes virtual and physical holds through the same source router', () => {
  const { window, surface } = environment()
  const mappingSource = readFileSync(new URL('./input-mapping.js', import.meta.url), 'utf8')
  const document = window.document
  const edges = []
  const inputWindow = target()
  inputWindow.document = document
  inputWindow.localStorage = { getItem: () => null, setItem() {} }
  inputWindow.navigator = { getGamepads: () => [] }
  inputWindow.setTimeout = setTimeout
  inputWindow.clearTimeout = clearTimeout
  inputWindow.setInterval = () => 0
  inputWindow.clearInterval = () => {}
  inputWindow.CustomEvent = class {}
  vm.runInNewContext(mappingSource, { window: inputWindow })
  const input = inputWindow.InputMapping.create({
    keyboard: true,
    repeat: false,
    sink: { press: (action, source) => edges.push(`P:${action}:${source}`), release: (action, source) => edges.push(`R:${action}:${source}`) },
  })
  const pad = window.Touchpad.bind({
    surface,
    buttons: { up: 'up', right: 'right', ok: 'ok' },
    actionMap: { up: 'up', right: 'right' },
    input,
    feedback: { keyRepeat: false },
  })
  surface.dispatch('pointerdown', { pointerId: 4, pointerType: 'touch', clientX: 10, clientY: 10, width: 0, height: 0, target: surface, preventDefault() {} })
  document.dispatch('keydown', { code: 'ArrowUp', key: 'ArrowUp', target: { closest: () => null }, preventDefault() {}, stopImmediatePropagation() {} })
  assert.equal(edges.length, 1)
  surface.dispatch('pointerup', { pointerId: 4, target: surface })
  assert.equal(edges.length, 1)
  document.dispatch('keyup', { code: 'ArrowUp', key: 'ArrowUp', target: { closest: () => null }, preventDefault() {}, stopImmediatePropagation() {} })
  assert.equal(edges.length, 2)
  assert.match(edges[0], /^P:up:/)
  assert.match(edges[1], /^R:up:/)
  pad.destroy()
  input.destroy()
})

test('rejects document fallback hits outside the active SVG surface', () => {
  const { window, surface } = environment()
  const outsideKey = { insideSurface: false, dataset: { controlId: 'outside' } }
  outsideKey.closest = (selector) => selector === '[data-control-id]' ? outsideKey : null
  surface.elementsFromPoint = () => [outsideKey]
  const edges = []
  const pad = window.Touchpad.bind({
    surface,
    buttons: { outside: 'ok' },
    actionMap: { outside: 'ok' },
    input: { press: (...args) => edges.push(['P', ...args]), release: (...args) => edges.push(['R', ...args]) },
    feedback: { keyRepeat: false },
  })
  surface.dispatch('pointerdown', { pointerId: 5, pointerType: 'touch', clientX: 140, clientY: 140, width: 0, height: 0, target: surface, preventDefault() {} })
  assert.deepEqual(edges, [])
  pad.destroy()
})

test('releases the previous SVG action before pressing a slid-to action', () => {
  const { window, surface } = environment()
  const edges = []
  const pointerTarget = { insideSurface: true, closest: (selector) => selector === '[data-control-id]' ? surface.keys.up : null }
  const input = { press: (s, a) => edges.push(`P:${a}`), release: (s, a) => edges.push(`R:${a}`), repeat() {} }
  const pad = window.Touchpad.bind({ surface, actionMap: { up: 'up', right: 'right' }, buttons: { up: 'up', right: 'right', ok: 'ok' }, input, feedback: { keyRepeat: false } })
  surface.dispatch('pointerdown', { pointerId: 1, pointerType: 'touch', clientX: 10, clientY: 10, target: pointerTarget, preventDefault() {} })
  surface.dispatch('pointermove', { pointerId: 1, pointerType: 'touch', clientX: 90, clientY: 10, target: surface })
  assert.deepEqual(edges.slice(0, 3), ['P:up', 'R:up', 'P:right'])
  pad.destroy()
})
