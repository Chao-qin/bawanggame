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

test('provides immutable built-ins with an exact 72-key game QWERTY inventory', () => {
  const qwerty = BUILTIN_LAYOUTS['qwerty-72']
  assert.equal(qwerty.controls.length, 72)
  assert.equal(new Set(qwerty.controls.map((control) => control.id)).size, 72)
  assert.ok(Object.isFrozen(qwerty))
  assert.ok(Object.isFrozen(qwerty.controls))
  assert.equal(BUILTIN_LAYOUTS['landscape-split'].target.orientation, 'landscape')
  assert.equal(BUILTIN_LAYOUTS['portrait-dpad'].target.orientation, 'portrait')
  assert.ok(Object.isFrozen(BUILTIN_THEMES))
  assert.ok(['classic', 'high-contrast', 'light'].every((id) => BUILTIN_THEMES[id]))
})

test('normalizes controls and rejects non-finite or non-positive geometry', () => {
  const control = normalizeLayout({
    id: 'custom',
    schemaVersion: 1,
    name: 'Custom',
    target: { runtime: 'flash', orientation: 'landscape' },
    controls: [{ id: 'k', actionId: 'flash:KeyA', label: 'A', shape: 'rounded-rect', visible: true, x: 0.1, y: 0.2, width: 0.3, height: 0.1, rotation: 0, z: 2 }],
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
    j2me: { portrait: { layoutId: 'portrait-dpad', themeId: 'classic' }, landscape: { layoutId: 'landscape-split', themeId: 'classic' } },
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
  assert.equal(resolveProfile({}, { runtime: 'flash', orientation: 'landscape' }).layoutId, 'qwerty-72')
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
