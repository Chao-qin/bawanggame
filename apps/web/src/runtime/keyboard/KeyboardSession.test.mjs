import test from 'node:test'
import assert from 'node:assert/strict'
import { createKeyboardSession } from './KeyboardSession.js'

test('registers a surface and exposes bridge state', async () => {
  const session = createKeyboardSession({ timeout: 20 })
  const surface = { setAttribute() {} }
  assert.equal(session.registerSurface(surface, { layoutId: 'test' }).accepted, true)
  const result = await session.ready
  assert.equal(result.available, true)
  assert.equal(session.getSurface(), surface)
})

test('times out and rejects late registration', async () => {
  const session = createKeyboardSession({ timeout: 1 })
  assert.equal((await session.ready).available, false)
  assert.equal(session.registerSurface({ setAttribute() {} }).accepted, false)
})

test('invalidates readiness and isolates later sessions', async () => {
  const old = createKeyboardSession({ timeout: 100 })
  old.invalidate()
  assert.equal((await old.ready).available, false)
  const next = createKeyboardSession({ timeout: 20 })
  assert.notEqual(old.id, next.id)
  assert.equal(next.getSurface(), null)
  next.invalidate()
})

test('pressed and profile subscriptions can be removed', () => {
  const session = createKeyboardSession({ timeout: 20 })
  let pressed = 0
  const unsubscribe = session.subscribePressed(() => { pressed++ })
  session.notifyPressed(new Set(['a']))
  unsubscribe()
  session.notifyPressed(new Set(['b']))
  assert.equal(pressed, 1)
  session.invalidate()
})
