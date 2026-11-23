import assert from 'node:assert/strict'
import test from 'node:test'
import { getLayout, KEYBOARD_LAYOUTS } from './layouts.js'

test('exports all six keyboard layouts with required key counts', () => {
  assert.deepEqual(KEYBOARD_LAYOUTS.map(({ id }) => id), ['full-size', 'tkl', '75-percent', '60-percent', 'dpad-abxy', 'numpad'])
  assert.deepEqual(KEYBOARD_LAYOUTS.map(({ keys }) => keys.length), [104, 87, 82, 61, 8, 17])
})

test('physical keyboards expose six rows and QWERTY alpha sequences', () => {
  for (const id of ['full-size', 'tkl', '75-percent', '60-percent']) {
    const layout = getLayout(id)
    assert.ok(layout, `${id} exists`)
    const alpha = layout.keys.filter(({ block }) => block === 'alpha')
    assert.deepEqual(
      ['QWERTYUIOP', 'ASDFGHJKL', 'ZXCVBNM'].map((letters) =>
        alpha.filter(({ row, value }) => row === ({ QWERTYUIOP: 2, ASDFGHJKL: 3, ZXCVBNM: 4 })[letters] && value.startsWith('Key'))
          .map(({ label }) => label).join('')),
      ['QWERTYUIOP', 'ASDFGHJKL', 'ZXCVBNM'],
    )
  }
})

test('all layout keys have unique identity and finite positive geometry', () => {
  for (const layout of KEYBOARD_LAYOUTS) {
    const ids = layout.keys.map(({ id }) => id)
    assert.equal(new Set(ids).size, ids.length, `${layout.id} key IDs are unique`)
    for (const item of layout.keys) {
      assert.ok(item.id && item.label !== undefined && item.value, `${layout.id} key metadata`)
      assert.ok(Number.isFinite(item.x) && Number.isFinite(item.y), `${item.id} position`)
      assert.ok(item.width > 0 && item.height > 0, `${item.id} dimensions`)
      assert.ok(item.block, `${item.id} block`)
    }
  }
})

test('physical legends and values use conventional US ANSI identifiers', () => {
  const full = getLayout('full-size')
  const find = (id) => full.keys.find((item) => item.id === id)
  assert.deepEqual([find('digit1').label, find('digit1').value, find('digit1').secondaryLegend], ['1', 'Digit1', '!'])
  assert.deepEqual([find('key-q').label, find('key-q').value], ['Q', 'KeyQ'])
  assert.equal(find('backslash').label, '\\')
  assert.equal(find('space').value, 'Space')
  assert.equal(find('shift-left').value, 'ShiftLeft')
  assert.equal(find('shift-right').value, 'ShiftRight')
  assert.equal(find('control-left').value, 'ControlLeft')
  assert.equal(find('control-right').value, 'ControlRight')
})

test('physical block membership matches each keyboard class', () => {
  const blocks = (id) => new Set(getLayout(id).keys.map(({ block }) => block))
  assert.deepEqual(blocks('full-size'), new Set(['function', 'alpha', 'navigation', 'arrows', 'numpad']))
  assert.deepEqual(blocks('tkl'), new Set(['function', 'alpha', 'navigation', 'arrows']))
  assert.deepEqual(blocks('75-percent'), new Set(['function', 'alpha', 'navigation', 'arrows']))
  assert.deepEqual(blocks('60-percent'), new Set(['alpha']))
})

test('ANSI widths, row spacing, staggering, and key bounds are valid', () => {
  for (const id of ['full-size', 'tkl', '75-percent', '60-percent']) {
    const layout = getLayout(id)
    const byId = (keyId) => layout.keys.find((item) => item.id === keyId)
    const expectedWidths = {
      backspace: 2, tab: 1.5, 'caps-lock': 1.75, 'shift-left': 2.25, enter: 2.25, space: 6.25,
    }
    for (const [keyId, width] of Object.entries(expectedWidths)) assert.equal(byId(keyId).width, width, `${id} ${keyId}`)
    if (id !== '60-percent') assert.equal(byId('shift-right').width, 2.75)
    else assert.equal(byId('shift-right').width, 2.25)

    const alpha = layout.keys.filter(({ block }) => block === 'alpha')
    for (let row = 1; row <= 5; row++) {
      assert.ok(alpha.some((item) => item.row === row), `${id} row ${row}`)
      assert.equal(Math.min(...alpha.filter((item) => item.row === row).map(({ y }) => y)), row)
      const rowKeys = alpha.filter((item) => item.row === row).sort((a, b) => a.x - b.x)
      for (let index = 1; index < rowKeys.length; index++) {
        assert.ok(rowKeys[index].x >= rowKeys[index - 1].x + rowKeys[index - 1].width, `${id} row ${row} overlap`)
      }
    }
    for (const [row, stagger] of [[2, 0.25], [3, 0.5], [4, 0.75]]) {
      assert.equal(Math.min(...alpha.filter((item) => item.row === row).map(({ x }) => x)), stagger)
    }
    const blocks = new Map()
    for (const item of layout.keys) {
      const bounds = blocks.get(item.block) || { left: Infinity, right: -Infinity }
      bounds.left = Math.min(bounds.left, item.x)
      bounds.right = Math.max(bounds.right, item.x + item.width)
      blocks.set(item.block, bounds)
    }
    for (let index = 1; index < ['alpha', 'navigation', 'arrows', 'numpad'].length; index++) {
      const left = blocks.get(['alpha', 'navigation', 'arrows', 'numpad'][index - 1])
      const right = blocks.get(['alpha', 'navigation', 'arrows', 'numpad'][index])
      if (left && right) assert.ok(right.left - left.right >= 0.5, `${id} block spacing`)
    }
  }
  const full = getLayout('full-size')
  assert.ok(Math.min(...full.keys.filter(({ block }) => block === 'numpad').map(({ x }) => x)) >
    Math.max(...full.keys.filter(({ block }) => ['navigation', 'arrows'].includes(block)).map(({ x, width }) => x + width)))
})

test('controller values and numeric keypad values match their contracts', () => {
  assert.deepEqual(getLayout('dpad-abxy').keys.map(({ value }) => value).sort(), [
    'ArrowDown', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'KeyA', 'KeyB', 'KeyX', 'KeyY',
  ])
  assert.deepEqual(getLayout('numpad').keys.map(({ value }) => value), [
    'NumLock', 'Divide', 'Multiply', 'Subtract', 'Digit7', 'Digit8', 'Digit9', 'Digit4', 'Digit5',
    'Digit6', 'Digit1', 'Digit2', 'Digit3', 'Enter', 'Digit0', 'Decimal',
  ].toSpliced(7, 0, 'Add'))
  const numpad = getLayout('numpad')
  const add = numpad.keys.find(({ id }) => id === 'add')
  const enter = numpad.keys.find(({ id }) => id === 'numpad-enter')
  const zero = numpad.keys.find(({ id }) => id === 'numpad0')
  const decimal = numpad.keys.find(({ id }) => id === 'decimal')
  assert.ok(Math.abs(add.x - 3.6) < 1e-9 && add.y === 1.2 && add.height === 2.2)
  assert.ok(Math.abs(enter.x - 3.6) < 1e-9 && Math.abs(enter.y - 3.6) < 1e-9 && enter.height === 2.2)
  assert.ok(zero.width === 2 && Math.abs(decimal.x - 2.4) < 1e-9 && Math.abs(decimal.y - 4.8) < 1e-9)
})
