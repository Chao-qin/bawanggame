import assert from 'node:assert/strict'
import test from 'node:test'
import { DEFAULT_KEYPAD_PREFS, effectiveLayout, effectiveOpacity, effectivePlacement, KEYPAD_PREFS_EVENT, KEYPAD_PREFS_KEY, normalizeKeypadPrefs, readKeypadPrefs, writeKeypadPrefs } from './keypad-prefs.js'

const memoryStorage = (initial = {}) => {
  const values = new Map(Object.entries(initial))
  return { getItem: (key) => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) }
}
const PHONE_DEFAULTS = { style: 't9', visible: true, placement: 'docked', opacity: 'auto', layout: 'auto', fit: 'contain' }

test('T9 docked, shown, auto opacity and layout, whole picture is the default; unknown values fall back to it', () => {
  assert.deepEqual(DEFAULT_KEYPAD_PREFS, PHONE_DEFAULTS)
  assert.deepEqual(readKeypadPrefs(memoryStorage()), PHONE_DEFAULTS)
  assert.deepEqual(normalizeKeypadPrefs({ style: 'qwerty', placement: 'sideways', visible: 'yes', opacity: '0.5', layout: 'diagonal', fit: 'zoom' }), PHONE_DEFAULTS)
  assert.deepEqual(readKeypadPrefs(memoryStorage({ [KEYPAD_PREFS_KEY]: '{not json' })), PHONE_DEFAULTS)
})

test('a choice saved by the first release (style and placement only) keeps working', () => {
  const storage = memoryStorage({ [KEYPAD_PREFS_KEY]: JSON.stringify({ style: 'classic', placement: 'floating' }) })
  assert.deepEqual(readKeypadPrefs(storage), { ...PHONE_DEFAULTS, style: 'classic', placement: 'floating' })
})

test('a change is merged, saved and announced to the document', () => {
  const storage = memoryStorage()
  const events = []
  const target = { dispatchEvent: (event) => events.push(event) }
  writeKeypadPrefs({ placement: 'floating' }, { storage, target })
  const saved = writeKeypadPrefs({ style: 'classic', visible: false, opacity: '0.8', layout: 'landscape', fit: 'height' }, { storage, target })
  assert.deepEqual(saved, { style: 'classic', visible: false, placement: 'floating', opacity: '0.8', layout: 'landscape', fit: 'height' }, 'the earlier choice is kept')
  assert.deepEqual(readKeypadPrefs(storage), saved)
  assert.deepEqual(events.map((event) => [event.type, event.detail]), [
    [KEYPAD_PREFS_EVENT, { ...PHONE_DEFAULTS, placement: 'floating' }],
    [KEYPAD_PREFS_EVENT, saved],
  ])
})

test('Flash keeps its own choice, apart from the J2ME / MRP one, and its first-release "hidden" style means not shown', () => {
  const storage = memoryStorage()
  const target = { dispatchEvent: () => {} }
  writeKeypadPrefs({ style: 'classic' }, { storage, target })
  assert.deepEqual(readKeypadPrefs(storage, 'flash'), { ...PHONE_DEFAULTS, style: 'gamepad' }, 'phone choice does not leak into Flash')
  writeKeypadPrefs({ visible: false }, { storage, target, family: 'flash' })
  assert.equal(readKeypadPrefs(storage, 'flash').visible, false)
  assert.equal(readKeypadPrefs(storage).visible, true, 'Flash choice does not leak into phones')
  assert.equal(normalizeKeypadPrefs({ style: 't9' }, 'flash').style, 'gamepad', 'a phone style is not a Flash style')
  assert.deepEqual(normalizeKeypadPrefs({ style: 'hidden', placement: 'docked' }, 'flash'), { ...PHONE_DEFAULTS, style: 'gamepad', visible: false })
})

test('only a keypad that can float is placed floating', () => {
  assert.equal(effectivePlacement({ style: 't9', placement: 'floating' }), 'floating')
  assert.equal(effectivePlacement({ style: 'classic', placement: 'floating' }), 'docked')
  assert.equal(effectivePlacement({ style: 'gamepad', placement: 'floating' }, 'flash'), 'floating')
})

test('auto opacity is opaque docked and translucent floating; a chosen opacity applies either way', () => {
  assert.equal(effectiveOpacity({ style: 't9', placement: 'docked', opacity: 'auto' }), 1)
  assert.equal(effectiveOpacity({ style: 't9', placement: 'floating', opacity: 'auto' }), 0.6)
  assert.equal(effectiveOpacity({ style: 'classic', placement: 'floating', opacity: 'auto' }), 1, 'classic cannot float')
  assert.equal(effectiveOpacity({ style: 't9', placement: 'docked', opacity: '0.4' }), 0.4)
})

test('the layout follows the screen unless one is chosen', () => {
  assert.equal(effectiveLayout({ layout: 'auto' }, 'landscape'), 'landscape')
  assert.equal(effectiveLayout({ layout: 'portrait' }, 'landscape'), 'portrait')
  assert.equal(effectiveLayout({ layout: 'landscape' }, 'portrait'), 'landscape')
})
