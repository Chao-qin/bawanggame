import test from 'node:test'
import assert from 'node:assert/strict'
import { createCustomFlashAction } from './actions.js'
import { createFlashKeyboardAdapter } from './FlashKeyboardAdapter.js'

function harness() {
  const events = []
  const listeners = new Map()
  const document = {
    hidden: false,
    addEventListener(type, listener) { listeners.set(`document:${type}`, listener) },
    removeEventListener(type) { listeners.delete(`document:${type}`) },
  }
  const eventTarget = {
    document,
    addEventListener(type, listener) { listeners.set(type, listener) },
    removeEventListener(type) { listeners.delete(type) },
    fire(type, event = {}) { listeners.get(type)?.(event) },
  }
  const target = {
    dispatchEvent(event) { events.push({ type: event.type, key: event.key, code: event.code }) },
  }
  return { events, eventTarget, target }
}

test('dispatches the catalog key/code pair for Flash actions', () => {
  const h = harness()
  const adapter = createFlashKeyboardAdapter({ target: h.target, eventTarget: h.eventTarget })
  adapter.press('pointer:1', 'flash-key:KeyA')
  adapter.release('pointer:1')
  adapter.press('pointer:2', 'flash-key:Space')
  adapter.release('pointer:2')
  assert.deepEqual(h.events, [
    { type: 'keydown', key: 'a', code: 'KeyA' },
    { type: 'keyup', key: 'a', code: 'KeyA' },
    { type: 'keydown', key: ' ', code: 'Space' },
    { type: 'keyup', key: ' ', code: 'Space' },
  ])
  adapter.cleanup()
})

test('reference-counts sources and preserves custom payloads', () => {
  const h = harness()
  const custom = createCustomFlashAction('jump', '!', 'KeyJ')
  const adapter = createFlashKeyboardAdapter({ target: h.target, eventTarget: h.eventTarget })
  assert.equal(adapter.registerAction(custom), true)
  adapter.press('a', 'flash-key:Enter')
  adapter.press('b', 'flash-key:Enter')
  adapter.release('a')
  assert.equal(h.events.length, 1)
  adapter.release('b')
  adapter.press('custom', custom.actionId)
  adapter.release('custom')
  assert.deepEqual(h.events.slice(-2), [
    { type: 'keydown', key: '!', code: 'KeyJ' },
    { type: 'keyup', key: '!', code: 'KeyJ' },
  ])
  assert.equal(adapter.registerAction({ actionId: 'custom:bad', flash: { key: 'a' } }), false)
  adapter.cleanup()
})

test('blur, fullscreen, and cleanup release all sources', () => {
  const h = harness()
  const adapter = createFlashKeyboardAdapter({ target: h.target, eventTarget: h.eventTarget })
  adapter.press('a', 'flash-key:ArrowLeft')
  adapter.press('b', 'flash-key:ArrowLeft')
  h.eventTarget.fire('blur')
  assert.deepEqual(h.events.slice(-1), [{ type: 'keyup', key: 'ArrowLeft', code: 'ArrowLeft' }])
  adapter.press('c', 'flash-key:Escape')
  h.eventTarget.fire('document:fullscreenchange')
  assert.deepEqual(h.events.slice(-1), [{ type: 'keyup', key: 'Escape', code: 'Escape' }])
  adapter.press('d', 'flash-key:Delete')
  adapter.cleanup()
  assert.deepEqual(h.events.slice(-1), [{ type: 'keyup', key: 'Delete', code: 'Delete' }])
})

test('global pointerup releases a touch source even when SVG capture retargets the event', () => {
  const h = harness()
  const adapter = createFlashKeyboardAdapter({ target: h.target, eventTarget: h.eventTarget })
  adapter.press('pointer:2:flash-key:ArrowLeft', 'flash-key:ArrowLeft')
  h.eventTarget.fire('pointerup', { pointerId: 2 })
  assert.deepEqual(h.events, [
    { type: 'keydown', key: 'ArrowLeft', code: 'ArrowLeft' },
    { type: 'keyup', key: 'ArrowLeft', code: 'ArrowLeft' },
  ])
  adapter.cleanup()
})
