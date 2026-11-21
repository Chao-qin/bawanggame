import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import vm from 'node:vm'

const source = readFileSync(new URL('./touch-layout.js', import.meta.url), 'utf8')

function createLayout(settingsStore = new Map(), profileStorage = null) {
  const body = { dataset: {} }
  const events = []
  const window = {
    document: { body, getElementById: () => null },
    CustomEvent: function (type, init) { this.type = type; this.detail = init.detail },
    dispatchEvent: (event) => events.push(event),
    KeyboardProfileStorage: profileStorage,
    Settings: {
      touchLayout: (id) => settingsStore.get(id) || {},
      setTouchLayout: (id, value) => value ? settingsStore.set(id, value) : settingsStore.delete(id),
    },
  }
  vm.runInNewContext(source, { window, document: window.document })
  return { layout: window.TouchLayout, body, events }
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

test('migrates legacy fields into normalized per-game runtime overrides', () => {
  const { layout } = createLayout()
  assert.deepEqual(
    JSON.parse(JSON.stringify(layout.migrateLegacy({
      dpad: 'rotate-cw',
      sides: 'standard',
      numbers: ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9', 'star', 'pound'],
      actions: { back: 'ret', choice: 'ok', num1: 'up' },
      unsupported: 'retain-me',
    }, 'j2me'))),
    {
      override: {
        layoutId: 'landscape-split',
        controlOverrides: {
          dpadRotation: 'rotate-cw',
          sideGroup: 'standard',
          numberSlotOrder: ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9', 'star', 'pound'],
          slotActions: {
            up: 'up', right: 'right', down: 'down', left: 'left', ok: 'ok',
            choice: 'ok', back: 'ret', ret: 'ret', clear: 'clear', star: 'star',
            num0: 'num0', pound: 'pound', num1: 'up', num2: 'num2', num3: 'num3',
            num4: 'num4', num5: 'num5', num6: 'num6', num7: 'num7', num8: 'num8', num9: 'num9',
          },
        },
      },
      backup: { unsupported: 'retain-me' },
    },
  )
})

test('keeps the legacy source until the versioned envelope write succeeds', () => {
  const source = { dpad: 'mirror', sides: 'swapped', numbers: ['1'], actions: {} }
  const legacy = new Map([['game-1', source]])
  let succeeds = false
  const profileStorage = {
    update(callback) {
      if (!succeeds) return false
      callback({ perGameOverrides: {} })
      return true
    },
  }
  const { layout, events } = createLayout(legacy, profileStorage)
  const adapter = layout.forGame('game-1', 'mrp')
  assert.equal(adapter.migrate(), false)
  assert.equal(legacy.get('game-1'), source)
  succeeds = true
  assert.equal(adapter.migrate(), true)
  assert.equal(legacy.has('game-1'), false)
  assert.equal(events.at(-1).type, 'xiaochao:keyboardprofilechange')
  assert.equal(events.at(-1).detail.runtime, 'mrp')
  assert.equal(events.at(-1).detail.profile.gameId, 'game-1')
})
