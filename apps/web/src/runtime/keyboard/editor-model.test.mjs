import assert from 'node:assert/strict'
import test from 'node:test'
import { BUILTIN_LAYOUTS } from './profiles.js'
import {
  addControl,
  clearExplicitProfileAssignment,
  clearMigratedPerGameOverride,
  cloneLayoutForEditing,
  getLayoutWarnings,
  hideControl,
  moveControl,
  reassignAction,
  reorderControl,
  resizeControl,
  validateLayout,
} from './editor-model.js'

test('clones a built-in without mutating it and generates a unique name', () => {
  const builtIn = BUILTIN_LAYOUTS['portrait-dpad']
  const copy = cloneLayoutForEditing(builtIn)
  assert.notEqual(copy, builtIn)
  assert.notEqual(copy.controls, builtIn.controls)
  assert.equal(copy.id, 'portrait-dpad-custom')
  assert.match(copy.name, /^Portrait D-pad \(Custom\)$/)
  const changed = moveControl(copy, 'up', { x: 0.2, y: 0.2 })
  assert.equal(builtIn.controls[0].x, 0.12)
  assert.equal(changed.controls.find((item) => item.id === 'up').x, 0.2)
})

test('adds, hides, resizes, reorders, and reassigns controls immutably', () => {
  const base = cloneLayoutForEditing(BUILTIN_LAYOUTS['portrait-dpad'])
  const added = addControl(base, { id: 'custom-a', actionId: 'custom:a', label: 'A', x: 0.1, y: 0.1, width: 0.1, height: 0.1 })
  assert.equal(added.controls.at(-1).shape, 'rounded-rect')
  const hidden = hideControl(added, 'custom-a')
  assert.equal(hidden.controls.at(-1).visible, false)
  const resized = resizeControl(hidden, 'custom-a', { width: 0.2, height: 0.2 })
  assert.equal(resized.controls.at(-1).width, 0.2)
  const renamed = reassignAction(resized, 'custom-a', 'ok', 'OK')
  assert.deepEqual(
    renamed.controls.at(-1),
    { ...resized.controls.at(-1), actionId: 'ok', label: 'OK' },
  )
  const reordered = reorderControl(renamed, 'custom-a', 99)
  assert.equal(reordered.controls.at(-1).z, 99)
  assert.equal(base.controls.some((item) => item.id === 'custom-a'), false)
})

test('rejects invalid geometry and reports stage, overlap, and target warnings', () => {
  const layout = cloneLayoutForEditing(BUILTIN_LAYOUTS['portrait-dpad'])
  assert.throws(() => moveControl(layout, 'up', { x: Infinity }))
  assert.throws(() => resizeControl(layout, 'up', { width: 0 }))
  const invalid = { ...layout, controls: [{ ...layout.controls[0], x: 0.95, width: 0.1 }] }
  assert.equal(validateLayout(invalid).valid, false)
  const warnings = getLayoutWarnings({
    ...layout,
    controls: [
      { ...layout.controls[0], x: 0.1, y: 0.1, width: 0.1, height: 0.1 },
      { ...layout.controls[1], x: 0.15, y: 0.15, width: 0.1, height: 0.1 },
    ],
  }, { minWidth: 0.11, minHeight: 0.11 })
  assert.ok(warnings.some((item) => item.type === 'overlap'))
  assert.ok(warnings.some((item) => item.type === 'small-target'))
})

test('reports emulator obstruction and safe-area crossings independently', () => {
  const layout = cloneLayoutForEditing(BUILTIN_LAYOUTS['portrait-dpad'])
  const warnings = getLayoutWarnings(layout, {
    emulatorDisplay: { x: 0.1, y: 0.6, width: 0.2, height: 0.2 },
    safeArea: { x: 0, y: 0, width: 0.9, height: 1 },
  })
  assert.ok(warnings.some((item) => item.type === 'emulator-obstruction' && item.controlId === 'up'))
  assert.ok(warnings.some((item) => item.type === 'safe-area'))
})

test('clears explicit and migrated assignments without mutating config', () => {
  const config = {
    profileAssignments: { 'j2me:portrait': { layoutId: 'custom', themeId: 'classic' } },
    perGameOverrides: { game: { j2me: { layoutId: 'portrait-dpad' } } },
  }
  const noExplicit = clearExplicitProfileAssignment(config, 'j2me', 'portrait')
  const noOverride = clearMigratedPerGameOverride(noExplicit, 'game', 'j2me')
  assert.ok(config.profileAssignments['j2me:portrait'])
  assert.equal(noOverride.profileAssignments['j2me:portrait'], undefined)
  assert.equal(noOverride.perGameOverrides.game, undefined)
})
