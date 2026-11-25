import assert from 'node:assert/strict'
import test from 'node:test'
import { DEFAULT_FLASH_KEYS, directionCodes, FLASH_KEYS_EVENT, FLASH_KEYS_STORAGE, keyOfCode, normalizeFlashKeys, readFlashKeys, writeFlashKeys } from './flash-keys.js'

const memoryStorage = () => {
  const values = new Map()
  return { getItem: (key) => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) }
}

test('defaults: arrow keys, OK = Enter, A = Space, B = X; unknown keys fall back', () => {
  assert.deepEqual(DEFAULT_FLASH_KEYS, { directions: 'arrows', ok: 'Enter', a: 'Space', b: 'KeyX' })
  assert.deepEqual(normalizeFlashKeys({ directions: 'ijkl', a: 'F12', b: 'KeyZ' }), { ...DEFAULT_FLASH_KEYS, b: 'KeyZ' })
  assert.deepEqual(directionCodes({ directions: 'wasd' }), { up: 'KeyW', down: 'KeyS', left: 'KeyA', right: 'KeyD' })
})

test('keys are saved per game and announced', () => {
  const storage = memoryStorage()
  const events = []
  const target = { dispatchEvent: (event) => events.push(event) }
  writeFlashKeys('a.swf', { a: 'KeyZ', directions: 'wasd' }, { storage, target })
  assert.deepEqual(readFlashKeys('a.swf', storage), { directions: 'wasd', ok: 'Enter', a: 'KeyZ', b: 'KeyX' })
  assert.deepEqual(readFlashKeys('b.swf', storage), DEFAULT_FLASH_KEYS, 'another game keeps the defaults')
  assert.equal(events[0].type, FLASH_KEYS_EVENT)
  assert.ok(storage.getItem(FLASH_KEYS_STORAGE).includes('a.swf'))
})

test('the key a game reads for each code', () => {
  assert.deepEqual(['Space', 'KeyX', 'ShiftLeft', 'ControlLeft', 'Enter', 'ArrowUp'].map(keyOfCode), [' ', 'x', 'Shift', 'Control', 'Enter', 'ArrowUp'])
})

test('a game without its own keys uses the 「键盘」 page default, and its own choice starts from it', async () => {
  const { readFlashKeys, writeFlashKeys, FLASH_KEYS_DEFAULT_GAME } = await import('./flash-keys.js')
  const values = new Map()
  const storage = { getItem: (key) => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) }
  const target = { dispatchEvent: () => {} }
  writeFlashKeys(FLASH_KEYS_DEFAULT_GAME, { a: 'KeyZ' }, { storage, target })
  assert.equal(readFlashKeys('new.swf', storage).a, 'KeyZ')
  const own = writeFlashKeys('mine.swf', { b: 'KeyC' }, { storage, target })
  assert.deepEqual([own.a, own.b], ['KeyZ', 'KeyC'])
  writeFlashKeys(FLASH_KEYS_DEFAULT_GAME, { a: 'Space' }, { storage, target })
  assert.equal(readFlashKeys('mine.swf', storage).a, 'KeyZ', 'a game\'s own choice stays')
})
