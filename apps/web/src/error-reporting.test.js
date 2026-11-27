import test from 'node:test'
import assert from 'node:assert/strict'
import { installErrorReporting, normalizeError, reportError } from './error-reporting.js'

test('normalization bounds and redacts messages, stack and URL queries', () => {
  const error = new Error('token=private https://host/game?password=private')
  error.stack = 'password=private '.repeat(1000)
  const normalized = normalizeError(error, { kind: 'uncaught', url: 'https://host/game?token=private#secret', line: 3, column: 4 })
  assert.equal(normalized.message, 'token=[redacted] https://host/game')
  assert.equal(normalized.stack.length, 4000)
  assert.equal(normalized.stack.includes('private'), false)
  assert.equal(normalized.url, 'https://host/game')
  assert.equal(normalized.line, 3)
  assert.equal(normalized.column, 4)
  assert.equal(normalizeError('plain rejection').message, 'plain rejection')
  assert.equal(normalizeError('Bearer private {"token":"private"}').message.includes('private'), false)
  assert.doesNotThrow(() => normalizeError({ toString() { throw new Error('hostile') } }))
  assert.doesNotThrow(() => normalizeError(new Proxy({}, { get() { throw new Error('hostile') } })))
})

function frame() {
  const listeners = {}
  const forwarded = []
  const parent = { location: { origin: 'https://host' }, CustomEvent: class { constructor(type, init) { this.type = type; this.detail = init.detail } }, dispatchEvent: event => forwarded.push(event) }
  const win = { location: { origin: 'https://host' }, parent, addEventListener: (name, fn) => { listeners[name] = fn } }
  installErrorReporting(win)
  return { win, parent, listeners, forwarded }
}

test('runtime frames forward uncaught, rejection and resource errors without starting analytics', () => {
  const { win, listeners, forwarded } = frame()
  listeners.error({ target: win, error: new Error('runtime failed'), filename: 'https://host/runtime.js?token=x', lineno: 2 })
  listeners.unhandledrejection({ reason: 42 })
  listeners.error({ target: { src: 'https://host/runtime.js?token=x' } })
  assert.deepEqual(forwarded.map(event => event.detail.kind), ['uncaught', 'unhandledrejection', 'resource'])
  assert.equal(forwarded[1].detail.message, '42')
  assert.equal(forwarded[2].detail.url, 'https://host/runtime.js')
  reportError(Object.assign(new Error('cancelled'), { name: 'AbortError' }), {}, win)
  assert.equal(forwarded.length, 3)
})

test('cross-origin parents cannot receive frame errors and hostile rejections stay isolated', () => {
  const { win, parent, forwarded, listeners } = frame()
  parent.location.origin = 'https://other'
  reportError(new Error('private'), {}, win)
  assert.equal(forwarded.length, 0)
  assert.doesNotThrow(() => listeners.unhandledrejection({ reason: { toString() { throw 0 } } }))
})
