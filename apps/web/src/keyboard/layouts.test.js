import assert from 'node:assert/strict'
import test from 'node:test'
import { keyUnits } from './hit-test.js'
import { cornerIconLayout, getLayout, KEYBOARD_LAYOUTS, layoutGroup, T9_LANDSCAPE, T9_PORTRAIT } from './layouts.js'

test('exports all eight keyboard layouts with required key counts', () => {
  assert.deepEqual(KEYBOARD_LAYOUTS.map(({ id }) => id), ['full-size', 'tkl', '75-percent', '60-percent', 'dpad-abxy', 'numpad', 't9-portrait', 't9-landscape'])
  assert.deepEqual(KEYBOARD_LAYOUTS.map(({ keys }) => keys.length), [104, 87, 82, 61, 8, 17, 17, 17])
})

const RUNTIME_ACTIONS = ['up', 'down', 'left', 'right', 'ok', 'choice', 'back', 'ret', 'clear', 'star', 'pound',
  'num0', 'num1', 'num2', 'num3', 'num4', 'num5', 'num6', 'num7', 'num8', 'num9']
const overlaps = (a, b) => a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height
// A corner key's box surrounds part of the wheel, but only the area outside its arc is a key, so those two shapes
// never really overlap. Every other pair still has to stay clear of each other.
const solidOverlap = (a, b) => {
  const wheelAndCorner = (x, y) => x.shape === 'wheel' && y.shape === 'corner'
  return wheelAndCorner(a, b) || wheelAndCorner(b, a) ? false : overlaps(a, b)
}
const actionsOf = (keys) => keys.flatMap((item) => keyUnits(item).map(({ value }) => value))

test('T9 presets drive every runtime action exactly once, with no overlapping keys', () => {
  for (const id of [T9_PORTRAIT, T9_LANDSCAPE]) {
    const layout = getLayout(id)
    assert.equal(layout.type, 'phone')
    assert.deepEqual(actionsOf(layout.keys).sort(), [...RUNTIME_ACTIONS].sort(), `${id} actions`)
    const wheel = layout.keys.filter(({ shape }) => shape === 'wheel')
    assert.equal(wheel.length, 1, `${id}: one direction wheel`)
    assert.equal(wheel[0].width, wheel[0].height, `${id}: the wheel is round`)
    assert.deepEqual(wheel[0].wheel, { up: 'up', down: 'down', left: 'left', right: 'right', center: 'ok' })
    for (const [index, a] of layout.keys.entries()) {
      for (const b of layout.keys.slice(index + 1)) assert.ok(!solidOverlap(a, b), `${id}: ${a.id} overlaps ${b.id}`)
    }
  }
  const digits = getLayout(T9_PORTRAIT).keys.filter(({ value }) => /^num\d$|^star$|^pound$/.test(value))
  assert.deepEqual(digits.map(({ label }) => label).join(''), '123456789*0#', 'digits read like a phone')
  assert.equal(digits.find(({ value }) => value === 'num7').secondaryLegend, 'pqrs')
})

test('T9 halves: navigation above the digits in portrait, left of them with room for the screen in landscape', () => {
  const extent = (keys) => ({
    left: Math.min(...keys.map(({ x }) => x)), right: Math.max(...keys.map(({ x, width }) => x + width)),
    top: Math.min(...keys.map(({ y }) => y)), bottom: Math.max(...keys.map(({ y, height }) => y + height)),
  })
  for (const id of [T9_PORTRAIT, T9_LANDSCAPE]) {
    const layout = getLayout(id)
    const nav = layoutGroup(layout, 'nav').keys
    const numpad = layoutGroup(layout, 'numpad').keys
    assert.equal(nav.length + numpad.length, layout.keys.length, `${id}: every key is in a half`)
    assert.deepEqual(actionsOf(nav).sort(), ['back', 'choice', 'clear', 'down', 'left', 'ok', 'ret', 'right', 'up'])
  }
  const portrait = getLayout(T9_PORTRAIT)
  assert.ok(extent(layoutGroup(portrait, 'nav').keys).bottom <= extent(layoutGroup(portrait, 'numpad').keys).top)
  const portraitWheel = portrait.keys.find(({ shape }) => shape === 'wheel')
  assert.equal(portraitWheel.width, 3.4)
  assert.deepEqual(
    ['choice', 'back', 'ret', 'clear'].map((id) => portrait.keys.find((key) => key.id === id).y),
    [0, 0, 2.25, 2.25], 'end/clear keys moved up beside the wheel instead of taking their own row',
  )
  const digits = layoutGroup(portrait, 'numpad').keys
  const digitHeight = extent(digits).bottom - extent(digits).top
  assert.ok(extent(digits).top <= 4, 'digits start where the old function-key row used to be')
  assert.ok(digitHeight > 3.3 && digits[0].height > 0.75, 'the digits get the height the navigation half gave up')
  const landscape = getLayout(T9_LANDSCAPE)
  assert.ok(extent(layoutGroup(landscape, 'numpad').keys).left - extent(layoutGroup(landscape, 'nav').keys).right >= 2, 'a gap for the game screen')
  assert.ok(extent(layoutGroup(landscape, 'nav').keys).bottom < 2.8, 'landscape navigation half is shorter too')
})

test('T9 function keys are four arc-cut corners around a wheel that dominates the navigation half', () => {
  for (const id of [T9_PORTRAIT, T9_LANDSCAPE]) {
    const layout = getLayout(id)
    const wheel = layout.keys.find(({ shape }) => shape === 'wheel')
    const cx = wheel.x + wheel.width / 2
    const cy = wheel.y + wheel.height / 2
    const corners = layout.keys.filter(({ shape }) => shape === 'corner')
    assert.equal(corners.length, 4, `${id}: four corner function keys`)
    assert.deepEqual(new Set(corners.map(({ corner }) => corner)),
      new Set(['top-left', 'top-right', 'bottom-left', 'bottom-right']))
    for (const key of corners) {
      assert.equal(key.arc.cx, cx, `${id}/${key.id}: arc shares the wheel centre`)
      assert.equal(key.arc.cy, cy, `${id}/${key.id}: arc shares the wheel centre`)
      assert.ok(key.arc.radius > wheel.width / 2, `${id}/${key.id}: the arc leaves a gap around the wheel`)
      const innerX = key.corner.includes('left') ? key.x + key.width : key.x
      const innerY = key.corner.startsWith('top') ? key.y + key.height : key.y
      const outerX = key.corner.includes('left') ? key.x : key.x + key.width
      const outerY = key.corner.startsWith('top') ? key.y : key.y + key.height
      assert.ok(Math.hypot(innerX - cx, innerY - cy) < key.arc.radius, `${id}/${key.id}: inner corner is cut away`)
      assert.ok(Math.hypot(outerX - cx, outerY - cy) > key.arc.radius, `${id}/${key.id}: outer corner remains`)
    }
    const nav = layoutGroup(layout, 'nav').keys
    const navHeight = Math.max(...nav.map(({ y, height }) => y + height))
    const navWidth = Math.max(...nav.map(({ x, width }) => x + width))
    assert.ok(wheel.height / navHeight > 0.75, `${id}: the wheel owns most of the navigation height`)
    assert.ok(navHeight / navWidth < 1.5, `${id}: the navigation half is compact`)
  }
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

test('60% layout keeps Esc on the number row', () => {
  const sixty = getLayout('60-percent')
  const escape = sixty.keys.find(({ id }) => id === 'escape')
  const numberRow = sixty.keys.filter(({ row }) => row === 1)
  assert.equal(escape.y, 1)
  assert.ok(numberRow.includes(escape))
  assert.equal(numberRow.find(({ id }) => id === 'grave').x, 1)
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

test('T9 corner icons centre on the visible sliver and stay clear of the wheel arc', () => {
  for (const id of [T9_PORTRAIT, T9_LANDSCAPE]) {
    const layout = getLayout(id)
    const corners = layout.keys.filter(({ shape }) => shape === 'corner')
    assert.deepEqual(corners.map(({ icon }) => icon).sort(), ['back', 'check', 'clear', 'end'])
    const anchors = []
    for (const key of corners) {
      const { x, y, size, cx, cy, indicator, anchor } = cornerIconLayout(key)
      assert.ok(x >= 0 && y >= 0 && x + size <= key.width + 1e-9 && y + size <= key.height + 1e-9,
        `${id}/${key.id}: icon stays inside the key box`)
      const left = key.corner.endsWith('left')
      const top = key.corner.startsWith('top')
      const nearX = left ? x + size : x
      const nearY = top ? y + size : y
      assert.ok(Math.hypot(nearX - (key.arc.cx - key.x), nearY - (key.arc.cy - key.y)) >= key.arc.radius - 1e-9,
        `${id}/${key.id}: the icon clears the arc gap`)
      assert.ok(Math.abs(indicator.x + indicator.width / 2 - cx) < 1e-9,
        `${id}/${key.id}: indicator follows the icon centre`)
      assert.ok(indicator.y + indicator.height <= y + 1e-9, `${id}/${key.id}: indicator above the icon`)
      assert.ok(Math.abs(cx - key.width / 2) > 0.05 && Math.abs(cy - key.height / 2) > 0.05,
        `${id}/${key.id}: icon biased towards the outer corner`)
      anchors.push([anchor.x + key.x, anchor.y + key.y])
    }
    const wheel = layout.keys.find(({ shape }) => shape === 'wheel')
    const wheelCx = wheel.x + wheel.width / 2
    const wheelCy = wheel.y + wheel.height / 2
    for (const [ax, ay] of anchors) {
      assert.ok(anchors.some(([bx, by]) => Math.abs((ax + bx) / 2 - wheelCx) < 1e-6 && Math.abs((ay + by) / 2 - wheelCy) < 1e-6),
        `${id}: icon anchor ${ax},${ay} is mirrored about the wheel`)
    }
  }
})
