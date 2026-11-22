import assert from 'node:assert/strict'
import test from 'node:test'
import {
  BUILTIN_LAYOUTS,
  BUILTIN_THEMES,
  DEFAULT_PROFILES,
  clearExplicitAssignment,
  clearPerGameOverride,
  normalizeLayout,
  resolveProfile,
} from './profiles.js'
import {
  STORAGE_KEY,
  createEmptyKeyboardConfig,
  loadKeyboardConfig,
  saveKeyboardConfig,
} from './storage.js'

test('provides immutable built-ins with an exact 72-key game QWERTY inventory', () => {
  const qwerty = BUILTIN_LAYOUTS['qwerty-72']
  assert.equal(qwerty.controls.length, 72)
  assert.equal(new Set(qwerty.controls.map((control) => control.id)).size, 72)
  const expectedCodes = [
    ...'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('').map((letter) => `flash-key:Key${letter}`),
    ...'0123456789'.split('').map((digit) => `flash-key:Digit${digit}`),
    ...['Minus', 'Equal', 'BracketLeft', 'BracketRight', 'Backslash', 'Semicolon', 'Quote', 'Comma', 'Period', 'Slash', 'Backquote'].map((code) => `flash-key:${code}`),
    ...['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].map((code) => `flash-key:${code}`),
    ...['Space', 'Enter', 'Backspace', 'Tab', 'Escape', 'ShiftLeft', 'ControlLeft', 'AltLeft'].map((code) => `flash-key:${code}`),
    ...Array.from({ length: 12 }, (_, index) => `flash-key:F${index + 1}`),
    'flash-key:Delete',
  ]
  assert.deepEqual(qwerty.controls.map((control) => control.actionId), expectedCodes)
  assert.ok(Object.isFrozen(qwerty))
  assert.ok(Object.isFrozen(qwerty.controls))
  assert.equal(BUILTIN_LAYOUTS['landscape-split'].target.orientation, 'landscape')
  assert.equal(BUILTIN_LAYOUTS['portrait-dpad'].target.orientation, 'portrait')
  assert.equal(BUILTIN_LAYOUTS['phone-keypad'].target.orientation, 'portrait')
  assert.ok(BUILTIN_LAYOUTS['phone-keypad'].controls.find((control) => control.id === 'up').y <
    BUILTIN_LAYOUTS['phone-keypad'].controls.find((control) => control.id === 'key-1').y)
  assert.ok(Object.isFrozen(BUILTIN_THEMES))
  assert.ok(['classic', 'high-contrast', 'light'].every((id) => BUILTIN_THEMES[id]))
})

test('normalizes controls and rejects non-finite or non-positive geometry', () => {
  const control = normalizeLayout({
    id: 'custom',
    schemaVersion: 1,
    name: 'Custom',
    target: { runtime: 'flash', orientation: 'landscape' },
    controls: [{ id: 'k', actionId: 'flash-key:KeyA', label: 'A', shape: 'rounded-rect', visible: true, x: 0.1, y: 0.2, width: 0.3, height: 0.1, rotation: 0, z: 2 }],
  }).controls[0]
  assert.deepEqual(
    { x: control.x, y: control.y, width: control.width, height: control.height, z: control.z },
    { x: 0.1, y: 0.2, width: 0.3, height: 0.1, z: 2 },
  )
  for (const patch of [{ x: Infinity }, { width: 0 }, { height: -1 }, { x: -0.1 }]) {
    assert.throws(() => normalizeLayout({
      id: 'bad', schemaVersion: 1, name: 'Bad', target: {},
      controls: [{ id: 'x', actionId: 'up', shape: 'rect', visible: true, x: 0, y: 0, width: 0.1, height: 0.1, ...patch }],
    }))
  }
})

test('routes defaults by runtime and orientation with explicit and migrated precedence', () => {
  assert.deepEqual(DEFAULT_PROFILES, {
    flash: { portrait: { layoutId: 'qwerty-72', themeId: 'classic' }, landscape: { layoutId: 'qwerty-72', themeId: 'classic' } },
    j2me: { portrait: { layoutId: 'phone-keypad', themeId: 'classic' }, landscape: { layoutId: 'landscape-split', themeId: 'classic' } },
    mrp: { portrait: { layoutId: 'portrait-dpad', themeId: 'classic' }, landscape: { layoutId: 'landscape-split', themeId: 'classic' } },
  })
  const config = {
    profileAssignments: { 'j2me:portrait': { layoutId: 'custom', themeId: 'light' } },
    perGameOverrides: { game: { j2me: { layoutId: 'landscape-split', controlOverrides: { dpadRotation: 'rotate-cw' } } } },
    customLayouts: {
      custom: { id: 'custom', schemaVersion: 1, name: 'Custom', target: {}, controls: [] },
    },
  }
  assert.equal(resolveProfile(config, { runtime: 'j2me', orientation: 'portrait', gameId: 'game' }).layoutId, 'custom')
  const migrated = resolveProfile(config, { runtime: 'j2me', orientation: 'landscape', gameId: 'game' })
  assert.equal(migrated.layoutId, 'landscape-split')
  assert.equal(migrated.source, 'per-game')
  const migratedPortrait = resolveProfile({
    perGameOverrides: { game: { j2me: { layoutId: 'landscape-split', controlOverrides: {} } } },
  }, { runtime: 'j2me', orientation: 'portrait', gameId: 'game' })
  assert.equal(migratedPortrait.layoutId, 'landscape-split')
  assert.equal(migratedPortrait.source, 'per-game')
  assert.equal(resolveProfile({}, { runtime: 'flash', orientation: 'landscape' }).layoutId, 'qwerty-72')
})

test('explicit assignments suppress migrated per-game control overrides', () => {
  const config = {
    profileAssignments: { 'j2me:portrait': { layoutId: 'portrait-dpad', themeId: 'classic' } },
    perGameOverrides: {
      game: { j2me: { layoutId: 'landscape-split', controlOverrides: { dpadRotation: 'rotate-cw', sideGroup: 'standard' } } },
    },
  }
  const profile = resolveProfile(config, { runtime: 'j2me', orientation: 'portrait', gameId: 'game' })
  assert.equal(profile.source, 'explicit')
  assert.equal(profile.layout.controls.find((control) => control.id === 'up').label, '↑')
  assert.equal(profile.layout.controls.find((control) => control.id === 'up').actionId, 'up')
})

test('clears explicit and per-game overrides independently', () => {
  const config = {
    profileAssignments: { 'j2me:portrait': { layoutId: 'custom', themeId: 'light' } },
    perGameOverrides: { game: { j2me: { layoutId: 'landscape-split', controlOverrides: {} } } },
    customLayouts: {
      custom: { id: 'custom', schemaVersion: 1, name: 'Custom', target: {}, controls: [] },
    },
  }
  const noExplicit = clearExplicitAssignment(config, 'j2me', 'portrait')
  assert.equal(noExplicit.profileAssignments['j2me:portrait'], undefined)
  assert.ok(noExplicit.perGameOverrides.game.j2me)
  const noGame = clearPerGameOverride(noExplicit, 'game', 'j2me')
  assert.equal(noGame.perGameOverrides.game, undefined)
})

test('saves and loads the migrated slot action override through storage', () => {
  const values = new Map()
  const storage = {
    getItem(key) { return values.has(key) ? values.get(key) : null },
    setItem(key, value) { values.set(key, String(value)) },
  }
  const config = createEmptyKeyboardConfig()
  config.perGameOverrides.game = {
    j2me: {
      layoutId: 'landscape-split',
      controlOverrides: {
        dpadRotation: 'rotate-cw',
        slotActions: { up: 'up', down: 'down', left: 'left', right: 'right' },
      },
    },
  }
  assert.equal(saveKeyboardConfig(config, storage), true)
  assert.equal(values.has(STORAGE_KEY), true)
  assert.deepEqual(loadKeyboardConfig(storage).perGameOverrides, config.perGameOverrides)
})

test('materializes migrated side, number order, slot action, and D-pad rotation overrides', () => {
  const profile = resolveProfile({
    perGameOverrides: {
      game: {
        j2me: {
          layoutId: 'landscape-split',
          controlOverrides: {
            dpadRotation: 'rotate-cw',
            sideGroup: 'standard',
            numberSlotOrder: ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9', 'star', 'pound'],
            slotActions: { up: 'num1', num1: 'up' },
          },
        },
      },
    },
  }, { runtime: 'j2me', orientation: 'landscape', gameId: 'game' })
  const up = profile.layout.controls.find((control) => control.id === 'up')
  const one = profile.layout.controls.find((control) => control.id === 'key-1')
  const zero = profile.layout.controls.find((control) => control.id === 'key-0')
  assert.equal(up.label, '←')
  assert.equal(up.actionId, 'left')
  assert.equal(up.x > 0.6, true)
  assert.equal(one.actionId, 'up')
  assert.equal(one.x < 0.3, true)
  assert.equal(zero.x, 0.06)
})

test('resolves migrated numeric slot names against numeric controls', () => {
  const profile = resolveProfile({
    perGameOverrides: {
      game: {
        j2me: {
          layoutId: 'portrait-dpad',
          controlOverrides: { slotActions: { '1': 'num7', '0': 'num3' } },
        },
      },
    },
  }, { runtime: 'j2me', orientation: 'portrait', gameId: 'game' })
  assert.equal(profile.layout.controls.find((control) => control.id === 'key-1').actionId, 'num7')
  assert.equal(profile.layout.controls.find((control) => control.id === 'key-0').actionId, 'num3')
})
