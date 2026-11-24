import assert from 'node:assert/strict'
import test from 'node:test'
import { createKeyHaptic, hapticDuration, nativeHost, pulse } from './haptics.js'

test('pulse length follows the vibrate setting: 24ms when unset, clamped, off at 0', () => {
  assert.equal(hapticDuration(undefined), 24)
  assert.equal(hapticDuration('24'), 24)
  assert.equal(hapticDuration(3), 8)
  assert.equal(hapticDuration(500), 40)
  assert.equal(hapticDuration('0'), 0)
})

test('a press pulses once per touch; mouse and pen do not, and one move pressing two keys pulses once', () => {
  let clock = 1000
  const sent = []
  const haptic = createKeyHaptic({ now: () => clock, send: (ms) => { sent.push(ms); return true } })
  assert.equal(haptic({ pointerType: 'mouse' }), false)
  assert.equal(haptic({ pointerType: 'pen' }), false)
  assert.equal(haptic({ pointerType: 'touch' }), true)
  assert.equal(haptic({ pointerType: 'touch' }), false, 'second direction of the same diagonal move')
  clock += 40
  assert.equal(haptic({ pointerType: 'touch' }, '30'), true)
  assert.equal(haptic({ pointerType: 'touch' }, 0), false, 'vibration off')
  assert.deepEqual(sent, [24, 30])
})

test('the press clock, not event.timeStamp, decides: a frame event far ahead of the app clock still pulses', () => {
  let clock = 50
  const sent = []
  const haptic = createKeyHaptic({ now: () => clock, send: (ms) => sent.push(ms) })
  haptic({ pointerType: 'touch', timeStamp: 900000 })
  clock += 200
  haptic({ pointerType: 'touch', timeStamp: 10 })
  assert.equal(sent.length, 2)
})

test('the native bridge is looked up at press time, through the runtime frame to the app window', () => {
  const calls = []
  const top = { __XIAOCHAO_RN_HOST__: null }
  top.parent = top
  const frame = { parent: top }
  assert.equal(nativeHost(frame), null)
  let vibrated = 0
  const nav = { vibrate: () => { vibrated += 1; return true } }
  assert.equal(pulse(24, { win: frame, nav }), true, 'no bridge yet: the Vibration API')
  top.__XIAOCHAO_RN_HOST__ = { haptic: (ms) => { calls.push(ms); return true } }
  assert.equal(pulse(24, { win: frame, nav }), true)
  assert.deepEqual(calls, [24], 'a bridge injected after the frame started is used')
  assert.equal(vibrated, 1)
})

test('the Vibration API of the app window is used from a runtime frame: the frame has no user activation yet', () => {
  const calls = []
  const top = { navigator: { vibrate: (ms) => { calls.push(['app', ms]); return true } } }
  top.parent = top
  const frame = { parent: top, navigator: { vibrate: (ms) => { calls.push(['frame', ms]); return false } } }
  assert.equal(pulse(24, { win: frame }), true)
  assert.deepEqual(calls, [['app', 24]])
})

test('a cross-origin parent is not used', () => {
  const calls = []
  const foreign = {}
  Object.defineProperty(foreign, 'navigator', { get() { throw new Error('cross-origin') } })
  foreign.parent = foreign
  const frame = { parent: foreign, navigator: { vibrate: (ms) => { calls.push(ms); return true } } }
  assert.equal(pulse(24, { win: frame }), true)
  assert.deepEqual(calls, [24])
})

test("the app window's bridge wins over a runtime frame's copy taken at start", () => {
  const calls = []
  const top = { __XIAOCHAO_RN_HOST__: { haptic: (ms) => { calls.push(['app', ms]); return true } } }
  top.parent = top
  const frame = { parent: top, __XIAOCHAO_RN_HOST__: { haptic: (ms) => { calls.push(['stale copy', ms]); return true } } }
  pulse(24, { win: frame, nav: { vibrate: () => true } })
  assert.deepEqual(calls, [['app', 24]])
})
