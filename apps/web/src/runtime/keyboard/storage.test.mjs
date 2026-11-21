import assert from 'node:assert/strict'
import test from 'node:test'
import {
  STORAGE_KEY,
  createEmptyKeyboardConfig,
  loadKeyboardConfig,
  saveKeyboardConfig,
} from './storage.js'

function createStorage(initial = {}) {
  const values = new Map(Object.entries(initial))
  return {
    values,
    getItem(key) { return values.has(key) ? values.get(key) : null },
    setItem(key, value) { values.set(key, String(value)) },
    removeItem(key) { values.delete(key) },
  }
}

test('loads and saves a single versioned envelope', () => {
  const storage = createStorage()
  const empty = createEmptyKeyboardConfig()
  assert.equal(saveKeyboardConfig(empty, storage), true)
  assert.deepEqual(JSON.parse(storage.getItem(STORAGE_KEY)), empty)
  assert.deepEqual(loadKeyboardConfig(storage), empty)
  assert.deepEqual([...storage.values.keys()], [STORAGE_KEY])
})

test('rejects invalid writes without replacing the last valid envelope', () => {
  const storage = createStorage()
  const valid = createEmptyKeyboardConfig()
  saveKeyboardConfig(valid, storage)
  const before = storage.getItem(STORAGE_KEY)
  assert.equal(saveKeyboardConfig({ version: 99 }, storage), false)
  assert.equal(storage.getItem(STORAGE_KEY), before)
})

test('isolates malformed layouts and keeps unrelated valid records with a backup', () => {
  const storage = createStorage({
    [STORAGE_KEY]: JSON.stringify({
      schemaVersion: 1,
      customLayouts: {
        broken: { id: 'broken', controls: [{ x: NaN, y: 0 }] },
        valid: { id: 'valid', schemaVersion: 1, name: 'Valid', target: {}, controls: [] },
      },
      profileAssignments: {},
      perGameOverrides: {},
      migrationBackups: [],
    }),
  })
  const result = loadKeyboardConfig(storage)
  assert.equal(result.customLayouts.broken, undefined)
  assert.equal(result.customLayouts.valid.id, 'valid')
  assert.equal(result.migrationBackups.length, 1)
  assert.equal(result.migrationBackups[0].record.id, 'broken')
})

test('failed storage writes leave the legacy source untouched for retry', () => {
  const storage = createStorage()
  storage.setItem = () => { throw new Error('quota') }
  assert.equal(saveKeyboardConfig(createEmptyKeyboardConfig(), storage), false)
  assert.equal(storage.getItem(STORAGE_KEY), null)
})
