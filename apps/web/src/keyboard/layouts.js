const key = (id, label, value, x, y, width = 1, block = 'alpha', row = y, secondaryLegend) => ({
  id, label, value, x, y, width, height: 1, block, row, secondaryLegend,
})

const sequence = (items, y, startX = 0, block = 'alpha', row = y) => {
  let x = startX
  return items.map(([id, label, value, width = 1, secondaryLegend]) => {
    const item = key(id, label, value, x, y, width, block, row, secondaryLegend)
    x += width
    return item
  })
}

const topFunction = (withSystemKeys = true) => [
  key('escape', 'Esc', 'Escape', 0, 0, 1, 'function', 0),
  ...Array.from({ length: 12 }, (_, index) => {
    const n = index + 1
    const x = 2 + index + Math.floor(index / 4) * 0.5
    return key(`f${n}`, `F${n}`, `F${n}`, x, 0, 1, 'function', 0)
  }),
  ...(withSystemKeys ? [
    key('print-screen', 'PrtSc', 'PrintScreen', 15.5, 0, 1, 'function', 0),
    key('scroll-lock', 'ScrLk', 'ScrollLock', 16.5, 0, 1, 'function', 0),
    key('pause', 'Pause', 'Pause', 17.5, 0, 1, 'function', 0),
  ] : []),
]

const mainRows = () => [
  sequence([
    ['grave', '`', 'Backquote', 1, '~'], ['digit1', '1', 'Digit1', 1, '!'], ['digit2', '2', 'Digit2', 1, '@'],
    ['digit3', '3', 'Digit3', 1, '#'], ['digit4', '4', 'Digit4', 1, '$'], ['digit5', '5', 'Digit5', 1, '%'],
    ['digit6', '6', 'Digit6', 1, '^'], ['digit7', '7', 'Digit7', 1, '&'], ['digit8', '8', 'Digit8', 1, '*'],
    ['digit9', '9', 'Digit9', 1, '('], ['digit0', '0', 'Digit0', 1, ')'], ['minus', '-', 'Minus', 1, '_'],
    ['equal', '=', 'Equal', 1, '+'], ['backspace', 'Backspace', 'Backspace', 2],
  ], 1, 0, 'alpha', 1),
  sequence([
    ['tab', 'Tab', 'Tab', 1.5], ...'QWERTYUIOP'.split('').map((letter) => [`key-${letter.toLowerCase()}`, letter, `Key${letter}`]),
    ['bracket-left', '[', 'BracketLeft'], ['bracket-right', ']', 'BracketRight'], ['backslash', '\\', 'Backslash', 1.5],
  ], 2, 0.25, 'alpha', 2),
  sequence([
    ['caps-lock', 'Caps', 'CapsLock', 1.75], ...'ASDFGHJKL'.split('').map((letter) => [`key-${letter.toLowerCase()}`, letter, `Key${letter}`]),
    ['semicolon', ';', 'Semicolon'], ['quote', "'", 'Quote'], ['enter', 'Enter', 'Enter', 2.25],
  ], 3, 0.5, 'alpha', 3),
  sequence([
    ['shift-left', 'Shift', 'ShiftLeft', 2.25], ...'ZXCVBNM'.split('').map((letter) => [`key-${letter.toLowerCase()}`, letter, `Key${letter}`]),
    ['comma', ',', 'Comma'], ['period', '.', 'Period'], ['slash', '/', 'Slash'], ['shift-right', 'Shift', 'ShiftRight', 2.75],
  ], 4, 0.75, 'alpha', 4),
  sequence([
    ['control-left', 'Ctrl', 'ControlLeft', 1.25], ['meta-left', 'Win', 'MetaLeft', 1.25], ['alt-left', 'Alt', 'AltLeft', 1.25],
    ['space', '', 'Space', 6.25], ['alt-right', 'Alt', 'AltRight', 1.25], ['meta-right', 'Win', 'MetaRight', 1.25],
    ['menu', 'Menu', 'ContextMenu', 1.25], ['control-right', 'Ctrl', 'ControlRight', 1.25],
  ], 5, 0, 'alpha', 5),
]

const standardKeys = () => {
  const rows = mainRows()
  const navRows = [
    [['insert', 'Ins', 'Insert'], ['home', 'Home', 'Home'], ['page-up', 'PgUp', 'PageUp']],
    [['delete', 'Del', 'Delete'], ['end', 'End', 'End'], ['page-down', 'PgDn', 'PageDown']],
  ]
  navRows.forEach((row, index) => rows[index].push(...sequence(row, index + 1, 16.5, 'navigation', index + 1)))
  const arrows = [
    key('arrow-up', '↑', 'ArrowUp', 21.5, 4, 1, 'arrows', 4),
    key('arrow-left', '←', 'ArrowLeft', 20.5, 5, 1, 'arrows', 5),
    key('arrow-down', '↓', 'ArrowDown', 21.5, 5, 1, 'arrows', 5),
    key('arrow-right', '→', 'ArrowRight', 22.5, 5, 1, 'arrows', 5),
  ]
  const numpadRows = [
    [['num-lock', 'Num', 'NumLock'], ['divide', '/', 'Divide'], ['multiply', '*', 'Multiply'], ['subtract', '-', 'Subtract']],
    [['numpad7', '7', 'Digit7'], ['numpad8', '8', 'Digit8'], ['numpad9', '9', 'Digit9'], ['add', '+', 'Add']],
    [['numpad4', '4', 'Digit4'], ['numpad5', '5', 'Digit5'], ['numpad6', '6', 'Digit6']],
    [['numpad1', '1', 'Digit1'], ['numpad2', '2', 'Digit2'], ['numpad3', '3', 'Digit3'], ['numpad-enter', 'Enter', 'Enter']],
    [['numpad0', '0', 'Digit0', 2], ['decimal', '.', 'Decimal']],
  ]
  const numpad = numpadRows.flatMap((items, index) => {
    const y = index + 1
    const keys = sequence(items, y, 24.5, 'numpad', y)
    if (index === 1) keys[keys.length - 1].height = 2
    if (index === 3) keys[keys.length - 1].height = 2
    if (index === 4) keys[1].x = 26.5
    return keys
  })
  return [...topFunction(), ...rows.flat(), ...arrows, ...numpad]
}

const fullSize = standardKeys()
const tkl = fullSize.filter((item) => item.block !== 'numpad')
const compact75 = fullSize.filter((item) => item.block !== 'numpad' &&
  !['print-screen', 'scroll-lock', 'pause', 'insert', 'delete'].includes(item.id))

const sixtyPercent = (() => {
  const rows = mainRows()
  const keys = [...rows.flat()].map((item) => {
    if (item.id === 'shift-right') return { ...item, width: 2.25 }
    // Keep Esc on the number row so the 60% layout stays five rows tall.
    if (item.row === 1) return { ...item, x: item.x + 1 }
    return item
  })
  keys.push(key('escape', 'Esc', 'Escape', 0, 1, 1, 'alpha', 1))
  return keys.filter((item) => !['control-right'].includes(item.id))
})()

const dpadAbxy = [
  key('dpad-up', '↑', 'ArrowUp', 2, 0, 1.4, 'dpad', 0),
  key('dpad-left', '←', 'ArrowLeft', 0.5, 1.5, 1.4, 'dpad', 1),
  key('dpad-down', '↓', 'ArrowDown', 2, 1.5, 1.4, 'dpad', 1),
  key('dpad-right', '→', 'ArrowRight', 3.5, 1.5, 1.4, 'dpad', 1),
  key('button-x', 'X', 'KeyX', 8, 0, 1.5, 'abxy', 0),
  key('button-y', 'Y', 'KeyY', 9.5, 1.5, 1.5, 'abxy', 1),
  key('button-b', 'B', 'KeyB', 8, 3, 1.5, 'abxy', 2),
  key('button-a', 'A', 'KeyA', 6.5, 1.5, 1.5, 'abxy', 1),
]

const numpadValues = [
  ['num-lock', 'Num', 'NumLock'], ['divide', '/', 'Divide'], ['multiply', '*', 'Multiply'], ['subtract', '-', 'Subtract'],
  ['numpad7', '7', 'Digit7'], ['numpad8', '8', 'Digit8'], ['numpad9', '9', 'Digit9'], ['add', '+', 'Add'],
  ['numpad4', '4', 'Digit4'], ['numpad5', '5', 'Digit5'], ['numpad6', '6', 'Digit6'],
  ['numpad1', '1', 'Digit1'], ['numpad2', '2', 'Digit2'], ['numpad3', '3', 'Digit3'],
  ['numpad-enter', 'Enter', 'Enter'], ['numpad0', '0', 'Digit0', 2], ['decimal', '.', 'Decimal'],
]
const numpadPositions = [
  [0, 0], [1, 0], [2, 0], [3, 0],
  [0, 1], [1, 1], [2, 1], [3, 1],
  [0, 2], [1, 2], [2, 2],
  [0, 3], [1, 3], [2, 3], [3, 3],
  [0, 4], [2, 4],
]
const numericKeypad = numpadValues.map(([id, label, value, width], index) => {
  const [column, row] = numpadPositions[index]
  const item = key(id, label, value, column * 1.2, row * 1.2, width || 1, 'numpad', row)
  if (id === 'add' || id === 'numpad-enter') item.height = 2.2
  return item
})

// Candybar (T9) phone keypads. `value` is the runtime action that InputMapping understands (up/down/left/right/ok,
// choice/back soft keys, ret = end key, clear, star/pound, num0-9), so the J2ME and MRP runtimes can be driven
// by these layouts directly. `group` splits a layout into the halves a landscape game screen sits between.
const T9_DIGITS = [
  ['num1', '1', '.,?'], ['num2', '2', 'abc'], ['num3', '3', 'def'],
  ['num4', '4', 'ghi'], ['num5', '5', 'jkl'], ['num6', '6', 'mno'],
  ['num7', '7', 'pqrs'], ['num8', '8', 'tuv'], ['num9', '9', 'wxyz'],
  ['star', '*', '+'], ['num0', '0', '␣'], ['pound', '#', '⇧'],
]
const phoneKey = (id, label, x, y, width, height, block, group, secondaryLegend, extra) =>
  ({ ...key(id, label, id, x, y, width, block, 0, secondaryLegend), height, group, ...extra })

// The soft keys and the end/clear keys of a candybar phone. `tone` picks the legend colour, `indicator` draws the
// short bar a phone prints over its soft keys.
const t9SoftKeys = { indicator: true }
const t9Side = {
  choice: ['左软键', undefined, t9SoftKeys],
  back: ['右软键', undefined, t9SoftKeys],
  ret: ['挂机', undefined, { tone: 'danger' }],
  clear: ['C', '清除', { tone: 'warning' }],
}
// A function key is a corner block: its box reaches towards the wheel, but the inner corner is cut away by an arc
// concentric with the wheel. That gives the wheel almost the whole navigation area and leaves the four keys the
// corners. KeyboardCanvas.jsx draws the arc; hit-test.js presses only the part of the box outside it.
const T9_ARC_GAP = 0.12
// The four function keys are drawn as icons, not legends: check = left soft key, back = right soft key,
// end = end/hang-up key, clear = clear key. The label/value remain the runtime action and its accessible name.
const T9_ICON = { choice: 'check', back: 'back', ret: 'end', clear: 'clear' }
const t9Arc = (cx, cy, wheelSize) => ({ cx, cy, radius: wheelSize / 2 + T9_ARC_GAP })
const cornerKey = (id, x, y, width, height, corner, arc) => {
  const [label, legend, extra] = t9Side[id]
  return phoneKey(id, label, x, y, width, height, 'soft', 'nav', legend,
    { ...extra, shape: 'corner', corner, arc, icon: T9_ICON[id] })
}

// The 8-way direction wheel: one round key for up / down / left / right with OK at its hub (hit-test.js).
const navWheel = (x, y, size) => phoneKey('dpad', 'OK', x, y, size, size, 'dpad', 'nav', undefined, {
  value: 'dpad', shape: 'wheel', wheel: { up: 'up', down: 'down', left: 'left', right: 'right', center: 'ok' },
})

const t9Digits = ({ x, y, width, height, stepX, stepY }) => T9_DIGITS.map(([id, label, legend], index) =>
  phoneKey(id, label, x + (index % 3) * stepX, y + Math.floor(index / 3) * stepY, width, height, 'numpad', 'numpad', legend))

// Portrait: four corner function keys around a wheel that fills the (now much shorter) navigation area. The keypad
// now spans the phone's full width: 7.4 design units rather than 5, so the digit columns and the arc-cut corner keys
// reach the sides instead of leaving gutters. KeyboardCanvas scales both axes uniformly, so widening the layout does
// not oval the wheel — it keeps its 3.4-unit diameter, centred between the two columns of function keys.
const PORTRAIT_DESIGN_WIDTH = 7.4
const PORTRAIT_WHEEL_SIZE = 3.4
const PORTRAIT_WHEEL = { x: (PORTRAIT_DESIGN_WIDTH - PORTRAIT_WHEEL_SIZE) / 2, y: 0.2, size: PORTRAIT_WHEEL_SIZE }
const portraitArc = t9Arc(PORTRAIT_WHEEL.x + PORTRAIT_WHEEL.size / 2,
  PORTRAIT_WHEEL.y + PORTRAIT_WHEEL.size / 2, PORTRAIT_WHEEL.size)
const PORTRAIT_CORNER_WIDTH = 3.3
const PORTRAIT_CORNER_RIGHT = PORTRAIT_DESIGN_WIDTH - PORTRAIT_CORNER_WIDTH
const t9Portrait = [
  navWheel(PORTRAIT_WHEEL.x, PORTRAIT_WHEEL.y, PORTRAIT_WHEEL.size),
  cornerKey('choice', 0, 0, PORTRAIT_CORNER_WIDTH, 1.55, 'top-left', portraitArc),
  cornerKey('back', PORTRAIT_CORNER_RIGHT, 0, PORTRAIT_CORNER_WIDTH, 1.55, 'top-right', portraitArc),
  cornerKey('ret', 0, 2.25, PORTRAIT_CORNER_WIDTH, 1.55, 'bottom-left', portraitArc),
  cornerKey('clear', PORTRAIT_CORNER_RIGHT, 2.25, PORTRAIT_CORNER_WIDTH, 1.55, 'bottom-right', portraitArc),
  ...t9Digits({ x: 0, y: 3.95, width: 2.4, height: 0.8, stepX: 2.5, stepY: 0.9 }),
]

// Landscape: the same four-corner arrangement in the left side column, digits on the right with a gap between the
// halves for the game screen. The navigation half is shorter than before (2.6 vs 3.54 units), so the wheel dominates
// its column and the four function keys take only the corners.
const LANDSCAPE_WHEEL = { x: 0.4, y: 0.3, size: 2 }
const landscapeArc = t9Arc(LANDSCAPE_WHEEL.x + LANDSCAPE_WHEEL.size / 2,
  LANDSCAPE_WHEEL.y + LANDSCAPE_WHEEL.size / 2, LANDSCAPE_WHEEL.size)
const t9Landscape = [
  navWheel(LANDSCAPE_WHEEL.x, LANDSCAPE_WHEEL.y, LANDSCAPE_WHEEL.size),
  cornerKey('choice', 0, 0, 1.3, 1, 'top-left', landscapeArc),
  cornerKey('back', 1.5, 0, 1.3, 1, 'top-right', landscapeArc),
  cornerKey('ret', 0, 1.6, 1.3, 1, 'bottom-left', landscapeArc),
  cornerKey('clear', 1.5, 1.6, 1.3, 1, 'bottom-right', landscapeArc),
  ...t9Digits({ x: 5.3, y: 0, width: 1.15, height: 0.9, stepX: 1.25, stepY: 0.98 }),
]

export const T9_PORTRAIT = 't9-portrait'
export const T9_LANDSCAPE = 't9-landscape'

export const KEYBOARD_LAYOUTS = [
  { id: 'full-size', label: '全尺寸 104 键', type: 'physical', keys: fullSize },
  { id: 'tkl', label: 'TKL 87 键', type: 'physical', keys: tkl },
  { id: '75-percent', label: '75% 82 键', type: 'physical', keys: compact75 },
  { id: '60-percent', label: '60% 61 键', type: 'physical', keys: sixtyPercent },
  { id: 'dpad-abxy', label: '方向键 + ABXY', type: 'controller', keys: dpadAbxy },
  { id: 'numpad', label: '数字键盘', type: 'controller', keys: numericKeypad },
  { id: T9_PORTRAIT, label: 'T9 直板（竖屏）', type: 'phone', keys: t9Portrait },
  { id: T9_LANDSCAPE, label: 'T9 横屏（左方向 · 右数字）', type: 'phone', keys: t9Landscape },
]

export const getLayout = (id) => KEYBOARD_LAYOUTS.find((layout) => layout.id === id)

/** One half of a layout (the keys of `group`), as a layout of its own. */
export const layoutGroup = (layout, group) => ({ ...layout, id: `${layout.id}:${group}`, keys: layout.keys.filter((item) => item.group === group) })

const cornerIconCache = new WeakMap()

/** Centre each corner icon on its key box, then push it away from the wheel only when the box centre would overlap
 *  the arc, shrinking as a last resort. The wheel centre and radius come from the key's own geometry, so the same
 *  rule produces a centred icon in the wide, short portrait corners and a safe nudge in the tight landscape ones —
 *  no fixed offsets and no hardcoded "outer corner" positions. Keys are immutable and reused, so cache the result. */
export function cornerIconLayout(item) {
  const cached = cornerIconCache.get(item)
  if (cached) return cached
  const { x, y, width, height, corner, arc } = item
  const left = corner.endsWith('left')
  const top = corner.startsWith('top')
  const centreX = arc.cx - x
  const centreY = arc.cy - y

  const place = (size) => {
    const half = size / 2
    // Start from the geometric centre of the key. All four insets are equal so an icon that the arc forces to move
    // keeps the arrangement mirror-symmetric; the indicator bar is pinned to the box top, not tied to the icon.
    const minX = half + 0.04
    const maxX = width - half - 0.04
    const minY = half + 0.04
    const maxY = height - half - 0.04
    let cx = Math.min(Math.max(width / 2, minX), maxX)
    let cy = Math.min(Math.max(height / 2, minY), maxY)
    // Only if the box would cut into the wheel, walk away from the arc centre until the nearest box corner clears it.
    for (let step = 0; step < 60; step++) {
      const nearX = left ? cx + half : cx - half
      const nearY = top ? cy + half : cy - half
      if (Math.hypot(nearX - centreX, nearY - centreY) >= arc.radius) break
      const dx = cx - centreX
      const dy = cy - centreY
      const length = Math.hypot(dx, dy) || 1
      cx = Math.min(Math.max(cx + dx / length * 0.02, minX), maxX)
      cy = Math.min(Math.max(cy + dy / length * 0.02, minY), maxY)
    }
    const nearX = left ? cx + half : cx - half
    const nearY = top ? cy + half : cy - half
    const clear = Math.hypot(nearX - centreX, nearY - centreY) >= arc.radius
    return { size, cx, cy, x: cx - half, y: cy - half, clear }
  }

  let size = Math.min(0.38, width * 0.3, height * 0.4)
  let box = place(size)
  while (!box.clear && size > 0.2) {
    size *= 0.9
    box = place(size)
  }
  const result = {
    ...box,
    indicator: { x: box.cx - box.size / 2, y: 0.04, width: box.size, height: 0.05 },
    anchor: { x: box.cx, y: box.cy },
  }
  cornerIconCache.set(item, result)
  return result
}
