import assert from 'node:assert/strict'
import test from 'node:test'
import { DEFAULT_KEYPAD_PREFS, effectivePlacement, KEYPAD_PREFS_EVENT, KEYPAD_PREFS_KEY, normalizeKeypadPrefs, readKeypadPrefs, writeKeypadPrefs } from './keypad-prefs.js'

const memoryStorage = (initial = {}) => {
  const values = new Map(Object.entries(initial))
  return { getItem: (key) => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) }
}

test('T9 docked is the default, and unknown values fall back to it', () => {
  assert.deepEqual(DEFAULT_KEYPAD_PREFS, { style: 't9', placement: 'docked' })
  assert.deepEqual(readKeypadPrefs(memoryStorage()), DEFAULT_KEYPAD_PREFS)
  assert.deepEqual(normalizeKeypadPrefs({ style: 'qwerty', placement: 'sideways' }), DEFAULT_KEYPAD_PREFS)
  assert.deepEqual(readKeypadPrefs(memoryStorage({ [KEYPAD_PREFS_KEY]: '{not json' })), DEFAULT_KEYPAD_PREFS)
})

test('a change is merged, saved and announced to the document', () => {
  const storage = memoryStorage()
  const events = []
  const target = { dispatchEvent: (event) => events.push(event) }
  writeKeypadPrefs({ placement: 'floating' }, { storage, target })
  const saved = writeKeypadPrefs({ style: 'classic' }, { storage, target })
  assert.deepEqual(saved, { style: 'classic', placement: 'floating' }, 'the earlier choice is kept')
  assert.deepEqual(readKeypadPrefs(storage), saved)
  assert.deepEqual(events.map((event) => [event.type, event.detail]), [
    [KEYPAD_PREFS_EVENT, { style: 't9', placement: 'floating' }],
    [KEYPAD_PREFS_EVENT, { style: 'classic', placement: 'floating' }],
  ])
})

test('Flash keeps its own keypad choice, apart from the J2ME / MRP one', () => {
  const storage = memoryStorage()
  const target = { dispatchEvent: () => {} }
  writeKeypadPrefs({ style: 'classic' }, { storage, target })
  assert.deepEqual(readKeypadPrefs(storage, 'flash'), { style: 'gamepad', placement: 'docked' }, 'phone choice does not leak into Flash')
  writeKeypadPrefs({ style: 'hidden' }, { storage, target, family: 'flash' })
  assert.deepEqual(readKeypadPrefs(storage, 'flash'), { style: 'hidden', placement: 'docked' })
  assert.deepEqual(readKeypadPrefs(storage), { style: 'classic', placement: 'docked' }, 'Flash choice does not leak into phones')
  assert.deepEqual(normalizeKeypadPrefs({ style: 't9' }, 'flash').style, 'gamepad', 'a phone style is not a Flash style')
})

test('only a keypad that can float is placed floating', () => {
  assert.equal(effectivePlacement({ style: 't9', placement: 'floating' }), 'floating')
  assert.equal(effectivePlacement({ style: 'classic', placement: 'floating' }), 'docked')
  assert.equal(effectivePlacement({ style: 'gamepad', placement: 'floating' }, 'flash'), 'floating')
  assert.equal(effectivePlacement({ style: 'hidden', placement: 'floating' }, 'flash'), 'docked')
})
