import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import vm from 'node:vm'

const source = readFileSync(new URL('./touch-layout.js', import.meta.url), 'utf8')

function createLayout(settingsStore = new Map()) {
  const body = { dataset: {} }
  const window = {
    document: { body, getElementById: () => null },
    Settings: {
      touchLayout: (id) => settingsStore.get(id) || {},
      setTouchLayout: (id, value) => value ? settingsStore.set(id, value) : settingsStore.delete(id),
    },
  }
  vm.runInNewContext(source, { window, document: window.document })
  return { layout: window.TouchLayout, body }
}

test('uses the Java keypad default layout and stable action slots', () => {
  const { layout } = createLayout()
  const current = layout.normalize(null)
  assert.equal(current.dpad, 'standard')
  assert.equal(current.sides, 'swapped')
  assert.deepEqual(Array.from(current.numbers), ['1', '2', '3', '4', '5', '6', '7', '8', '9', 'star', '0', 'pound'])
  assert.equal(current.actions.up, 'up')
  assert.equal(current.actions.choice, 'choice')
})

test('maps the same touch slot actions to Java and MRP platform codes', () => {
  const { layout } = createLayout()
  const custom = layout.normalize({ actions: { up: 'num1', choice: 'ok', num1: 'up' } })
  const java = layout.mapButtons({ up: -1, num1: 49, choice: -6, ok: -5 }, custom)
  const mrp = layout.mapButtons({ up: 12, num1: 1, choice: 17, ok: 20 }, custom)
  assert.equal(java.up, 49)
  assert.equal(java.choice, -5)
  assert.equal(java.num1, -1)
  assert.equal(mrp.up, 1)
  assert.equal(mrp.choice, 20)
  assert.equal(mrp.num1, 12)
})

test('persists layouts per game and restores the Java default layout', () => {
  const store = new Map()
  const { layout, body } = createLayout(store)
  const adapter = layout.forGame('mrp:test-game')
  const saved = adapter.save({ dpad: 'rotate-cw', sides: 'standard' })
  assert.equal(saved.dpad, 'rotate-cw')
  assert.equal(store.get('mrp:test-game').sides, 'standard')
  assert.equal(body.dataset.dpadLayout, 'rotate-cw')
  layout.apply({ dpad: 'mirror' })
  assert.equal(adapter.get().dpad, 'mirror')
  assert.equal(adapter.reset().sides, 'swapped')
  assert.equal(store.has('mrp:test-game'), false)
})
