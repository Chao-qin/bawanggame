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
    contains() { return true },
    querySelector(selector) {
      if (selector.includes('dpad')) return this.dpad
      return this.keys[selector.match(/"([^"]+)"/)?.[1]]
    },
  }
}

function environment() {
  const surface = target()
  const dpad = { id: 'dpad', classList: { toggle() {} }, getBoundingClientRect: () => ({ left: 0, top: 0, width: 100, height: 100 }) }
  const keys = {}
  for (const id of ['up', 'right']) keys[id] = {
    id, classList: { toggle() {}, add() {}, remove() {} }, offsetWidth: 1,
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 50, height: 50 }),
  }
  surface.dpad = dpad
  surface.keys = keys
  surface.elementsFromPoint = (x, y) => [{
    closest: (selector) => selector === '#dpad' ? null : keys[x > 50 ? 'right' : 'up'],
  }]
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

test('routes diagonal SVG pointer actions through source-aware input', () => {
  const { window, surface } = environment()
  const edges = []
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
  surface.dispatch('pointerdown', { pointerId: 3, pointerType: 'touch', clientX: 90, clientY: 10, width: 0, height: 0, target: surface, preventDefault() {} })
  assert.ok(edges.some((x) => x.includes('pointer:3:right')))
  surface.dispatch('pointerup', { pointerId: 3, target: surface })
  assert.ok(edges.some((x) => x.startsWith('R:pointer:3:right')))
  pad.destroy()
})

test('releases the previous SVG action before pressing a slid-to action', () => {
  const { window, surface } = environment()
  const edges = []
  const input = { press: (s, a) => edges.push(`P:${a}`), release: (s, a) => edges.push(`R:${a}`), repeat() {} }
  const pad = window.Touchpad.bind({ surface, actionMap: { up: 'up', right: 'right' }, buttons: { up: 'up', right: 'right', ok: 'ok' }, input, feedback: { keyRepeat: false } })
  surface.dispatch('pointerdown', { pointerId: 1, pointerType: 'touch', clientX: 10, clientY: 10, target: surface, preventDefault() {} })
  surface.dispatch('pointermove', { pointerId: 1, pointerType: 'touch', clientX: 90, clientY: 10, target: surface })
  assert.deepEqual(edges.slice(0, 3), ['P:up', 'R:up', 'P:right'])
  pad.destroy()
})
