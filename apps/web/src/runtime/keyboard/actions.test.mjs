import assert from 'node:assert/strict'
import test from 'node:test'
import {
  ACTION_CATALOG,
  FLASH_KEY_CATALOG,
  J2ME_CODES,
  MRP_CODES,
  createCustomFlashAction,
  isActionSupported,
  migrateActionId,
  migratePhysicalBinding,
} from './actions.js'

test('keeps the shared J2ME and MRP action IDs on their exact platform codes', () => {
  const ids = [
    'up', 'down', 'left', 'right', 'ok', 'choice', 'back', 'ret', 'clear',
    ...Array.from({ length: 10 }, (_, digit) => `num${digit}`), 'star', 'pound',
  ]
  const expectedJ2me = [-1, -2, -3, -4, -5, -6, -7, -11, -8, ...Array.from({ length: 10 }, (_, digit) => 48 + digit), 42, 35]
  const expectedMrp = [12, 13, 14, 15, 20, 17, 18, 16, 23, ...Array.from({ length: 10 }, (_, digit) => digit), 10, 11]

  assert.deepEqual(Object.keys(J2ME_CODES), ids)
  assert.deepEqual(Object.keys(MRP_CODES), ids)
  ids.forEach((id, index) => {
    assert.equal(J2ME_CODES[id], expectedJ2me[index], id)
    assert.equal(MRP_CODES[id], expectedMrp[index], id)
    assert.equal(ACTION_CATALOG[id].actionId, id)
    assert.equal(isActionSupported(id, 'j2me'), true)
    assert.equal(isActionSupported(id, 'mrp'), true)
  })
  assert.notEqual(J2ME_CODES.back, J2ME_CODES.ret)
  assert.notEqual(MRP_CODES.back, MRP_CODES.ret)
})

test('provides explicit Flash key and code pairs for every built-in key', () => {
  const expected = []
  for (let letter = 65; letter <= 90; letter += 1) {
    const code = `Key${String.fromCharCode(letter)}`
    expected.push([`flash-key:${code}`, String.fromCharCode(letter + 32), code])
  }
  for (let digit = 0; digit <= 9; digit += 1) expected.push([`flash-key:Digit${digit}`, String(digit), `Digit${digit}`])
  expected.push(
    ['flash-key:Space', ' ', 'Space'],
    ['flash-key:ArrowUp', 'ArrowUp', 'ArrowUp'],
    ['flash-key:ArrowDown', 'ArrowDown', 'ArrowDown'],
    ['flash-key:ArrowLeft', 'ArrowLeft', 'ArrowLeft'],
    ['flash-key:ArrowRight', 'ArrowRight', 'ArrowRight'],
    ['flash-key:Enter', 'Enter', 'Enter'],
    ['flash-key:Backspace', 'Backspace', 'Backspace'],
    ['flash-key:Tab', 'Tab', 'Tab'],
    ['flash-key:Escape', 'Escape', 'Escape'],
    ['flash-key:Delete', 'Delete', 'Delete'],
  )
  for (let functionKey = 1; functionKey <= 12; functionKey += 1) {
    const code = `F${functionKey}`
    expected.push([`flash-key:${code}`, code, code])
  }
  expected.push(
    ['flash-key:ShiftLeft', 'Shift', 'ShiftLeft'],
    ['flash-key:ControlLeft', 'Control', 'ControlLeft'],
    ['flash-key:AltLeft', 'Alt', 'AltLeft'],
    ['flash-key:Minus', '-', 'Minus'],
    ['flash-key:Equal', '=', 'Equal'],
    ['flash-key:BracketLeft', '[', 'BracketLeft'],
    ['flash-key:BracketRight', ']', 'BracketRight'],
    ['flash-key:Backslash', '\\', 'Backslash'],
    ['flash-key:Semicolon', ';', 'Semicolon'],
    ['flash-key:Quote', "'", 'Quote'],
    ['flash-key:Comma', ',', 'Comma'],
    ['flash-key:Period', '.', 'Period'],
    ['flash-key:Slash', '/', 'Slash'],
    ['flash-key:Backquote', '`', 'Backquote'],
  )

  assert.deepEqual(Object.keys(FLASH_KEY_CATALOG), expected.map(([id]) => id))
  for (const [id, key, code] of expected) {
    assert.deepEqual(FLASH_KEY_CATALOG[id], { actionId: id, key, code, runtime: 'flash' })
    assert.equal(ACTION_CATALOG[id].flash.key, key)
    assert.equal(ACTION_CATALOG[id].flash.code, code)
    assert.equal(isActionSupported(id, 'flash'), true)
  }
})

test('custom Flash actions preserve both configured values', () => {
  const custom = createCustomFlashAction('mine', 'Ω', 'KeyX')
  assert.deepEqual(custom, {
    actionId: 'custom:mine',
    label: 'mine',
    flash: { key: 'Ω', code: 'KeyX' },
    platforms: { flash: true },
  })
  assert.equal(isActionSupported(custom.actionId, 'j2me', { [custom.actionId]: custom }), false)
})

test('migrates aliases according to the source meaning of back', () => {
  assert.equal(migrateActionId('confirm', 'touchLayout'), 'ok')
  assert.equal(migrateActionId('soft-left', 'touchLayout'), 'choice')
  assert.equal(migrateActionId('soft-right', 'touchLayout'), 'back')
  assert.equal(migrateActionId('digit-4', 'touchLayout'), 'num4')
  assert.equal(migrateActionId('back', 'touchLayout'), 'back')
  assert.equal(migrateActionId('back', 'config.keymap'), 'ret')
  assert.equal(migrateActionId('back', 'config.keymap.back'), 'ret')
  assert.equal(migrateActionId('Escape', 'InputMapping.keyboard'), 'Escape')
  assert.equal(migrateActionId('not-known', 'touchLayout'), 'not-known')
})

test('preserves unknown physical bindings as inactive records', () => {
  assert.deepEqual(
    migratePhysicalBinding({ control: 'Digit4', actionId: 'digit-4' }),
    { control: 'Digit4', actionId: 'num4', active: true },
  )
  assert.deepEqual(
    migratePhysicalBinding({ control: 'F13', actionId: 'future-action' }),
    { control: 'F13', actionId: null, active: false },
  )
  assert.deepEqual(
    migratePhysicalBinding({ control: 'Escape', actionId: 'back' }),
    { control: 'Escape', actionId: 'back', active: true },
  )
  assert.deepEqual(
    migratePhysicalBinding({ control: 'KeyQ', actionId: 'custom:mine' }, {
      'custom:mine': createCustomFlashAction('mine', 'q', 'KeyQ'),
    }),
    { control: 'KeyQ', actionId: 'custom:mine', active: true },
  )
  assert.deepEqual(
    migratePhysicalBinding({ control: 'KeyW', actionId: 'custom:missing' }, {}),
    { control: 'KeyW', actionId: null, active: false },
  )
})
