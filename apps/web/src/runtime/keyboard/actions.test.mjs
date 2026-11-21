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
    expected.push([`flash:${code}`, String.fromCharCode(letter + 32), code])
  }
  for (let digit = 0; digit <= 9; digit += 1) expected.push([`flash:Digit${digit}`, String(digit), `Digit${digit}`])
  expected.push(
    ['flash:Space', ' ', 'Space'],
    ['flash:ArrowUp', 'ArrowUp', 'ArrowUp'],
    ['flash:ArrowDown', 'ArrowDown', 'ArrowDown'],
    ['flash:ArrowLeft', 'ArrowLeft', 'ArrowLeft'],
    ['flash:ArrowRight', 'ArrowRight', 'ArrowRight'],
    ['flash:Enter', 'Enter', 'Enter'],
    ['flash:Backspace', 'Backspace', 'Backspace'],
    ['flash:Tab', 'Tab', 'Tab'],
    ['flash:Escape', 'Escape', 'Escape'],
    ['flash:Delete', 'Delete', 'Delete'],
  )
  for (let functionKey = 1; functionKey <= 12; functionKey += 1) {
    const code = `F${functionKey}`
    expected.push([`flash:${code}`, code, code])
  }
  expected.push(
    ['flash:ShiftLeft', 'Shift', 'ShiftLeft'],
    ['flash:ControlLeft', 'Control', 'ControlLeft'],
    ['flash:AltLeft', 'Alt', 'AltLeft'],
    ['flash:Minus', '-', 'Minus'],
    ['flash:Equal', '=', 'Equal'],
    ['flash:BracketLeft', '[', 'BracketLeft'],
    ['flash:BracketRight', ']', 'BracketRight'],
    ['flash:Backslash', '\\', 'Backslash'],
    ['flash:Semicolon', ';', 'Semicolon'],
    ['flash:Quote', "'", 'Quote'],
    ['flash:Comma', ',', 'Comma'],
    ['flash:Period', '.', 'Period'],
    ['flash:Slash', '/', 'Slash'],
    ['flash:Backquote', '`', 'Backquote'],
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
})
