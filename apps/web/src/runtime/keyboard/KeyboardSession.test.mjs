import test from 'node:test'
import assert from 'node:assert/strict'
import { createKeyboardSession } from './KeyboardSession.js'
import { createEmptyKeyboardConfig } from './storage.js'

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

test('resolves persisted runtime assignments and refreshes after migration', () => {
  const config = createEmptyKeyboardConfig()
  const custom = { id: 'my-layout', schemaVersion: 1, name: 'Mine', target: {}, controls: [] }
  config.customLayouts['my-layout'] = custom
  config.profileAssignments['j2me:portrait'] = { layoutId: 'my-layout', themeId: 'light' }
  const session = createKeyboardSession({ runtime: 'j2me', orientation: 'portrait', gameId: 'game', config, timeout: 100 })
  assert.equal(session.getProfile().layoutId, 'my-layout')
  assert.equal(session.getProfile().themeId, 'light')

  let changed
  session.subscribeProfile((profile) => { changed = profile })
  const migrated = createEmptyKeyboardConfig()
  migrated.perGameOverrides.game = { j2me: { layoutId: 'landscape-split', controlOverrides: {} } }
  session.refreshConfig(migrated)
  assert.equal(changed.source, 'per-game')
  assert.equal(changed.layoutId, 'landscape-split')
  session.invalidate()
})

test('releaseAll invokes registered runtime input release callbacks', () => {
  const session = createKeyboardSession({ timeout: 100 })
  let released = 0
  const unregister = session.registerInputRelease(() => { released += 1 })
  session.releaseAll()
  unregister()
  session.releaseAll()
  assert.equal(released, 1)
  session.invalidate()
})

test('invalidate releases registered runtime input before disabling the session', () => {
  const session = createKeyboardSession({ timeout: 100 })
  let released = 0
  session.registerInputRelease(() => { released += 1 })
  session.invalidate()
  assert.equal(released, 1)
})

test('profile refresh releases held inputs and keeps the registered surface active', () => {
  const config = createEmptyKeyboardConfig()
  const session = createKeyboardSession({ timeout: 100, config })
  const surface = { setAttribute() {} }
  assert.equal(session.registerSurface(surface).accepted, true)

  let releases = 0
  session.registerInputRelease(() => { releases += 1 })
  const nextConfig = createEmptyKeyboardConfig()
  nextConfig.profileAssignments['j2me:portrait'] = { layoutId: 'landscape-split', themeId: 'classic' }
  session.refreshConfig(nextConfig)

  assert.equal(releases, 1)
  assert.equal(session.getSurface(), surface)
  assert.equal(session.getProfile().layoutId, 'landscape-split')
  assert.equal(session.registerSurface({ setAttribute() {} }).accepted, false)
  assert.equal(session.getSurface(), surface)
  session.invalidate()
})

test('uses configured runtime orientation instead of viewport orientation', () => {
  const previousWindow = globalThis.window
  globalThis.window = {
    innerWidth: 900,
    innerHeight: 500,
    config: { orientation: 'portrait' },
    addEventListener() {},
    removeEventListener() {},
  }
  try {
    const session = createKeyboardSession({ runtime: 'j2me', gameId: 'game', timeout: 100 })
    assert.equal(session.getProfile().orientation, 'portrait')
    assert.equal(session.getProfile().layoutId, 'phone-keypad')
    session.invalidate()
  } finally {
    globalThis.window = previousWindow
  }
})
