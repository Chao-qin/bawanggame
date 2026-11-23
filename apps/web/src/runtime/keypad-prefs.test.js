import assert from 'node:assert/strict'
import test from 'node:test'
import { DEFAULT_KEYPAD_PREFS, KEYPAD_PREFS_EVENT, KEYPAD_PREFS_KEY, normalizeKeypadPrefs, readKeypadPrefs, writeKeypadPrefs } from './keypad-prefs.js'

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
