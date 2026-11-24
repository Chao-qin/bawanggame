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

// Portrait: four corner function keys around a wheel that fills the navigation area. The keypad spans the phone's
// full width (7.4 design units), so the digit columns and the arc-cut corner keys reach the sides. The wheel takes
// 4.2 of those units: the function keys keep only the corners the wheel leaves, and the digit block below keeps its
// own key size — the keypad grows a little taller instead of squeezing the digits. KeyboardCanvas scales both axes
// uniformly, so the wheel stays round.
const PORTRAIT_DESIGN_WIDTH = 7.4
const PORTRAIT_WHEEL_SIZE = 4.2
const PORTRAIT_NAV_HEIGHT = 4.3
const PORTRAIT_WHEEL = { x: (PORTRAIT_DESIGN_WIDTH - PORTRAIT_WHEEL_SIZE) / 2, y: (PORTRAIT_NAV_HEIGHT - PORTRAIT_WHEEL_SIZE) / 2, size: PORTRAIT_WHEEL_SIZE }
const portraitArc = t9Arc(PORTRAIT_WHEEL.x + PORTRAIT_WHEEL.size / 2,
  PORTRAIT_WHEEL.y + PORTRAIT_WHEEL.size / 2, PORTRAIT_WHEEL.size)
const PORTRAIT_CORNER_WIDTH = 3.6
const PORTRAIT_CORNER_HEIGHT = 1.9
const PORTRAIT_CORNER_RIGHT = PORTRAIT_DESIGN_WIDTH - PORTRAIT_CORNER_WIDTH
const PORTRAIT_CORNER_BOTTOM = PORTRAIT_NAV_HEIGHT - PORTRAIT_CORNER_HEIGHT
// The digit block: the same key size as before the wheel grew, starting just under the navigation area.
export const T9_PORTRAIT_DIGITS = Object.freeze({ x: 0, y: PORTRAIT_NAV_HEIGHT + 0.15, width: 2.4, height: 0.8, stepX: 2.5, stepY: 0.9 })
const t9Portrait = [
  navWheel(PORTRAIT_WHEEL.x, PORTRAIT_WHEEL.y, PORTRAIT_WHEEL.size),
  cornerKey('choice', 0, 0, PORTRAIT_CORNER_WIDTH, PORTRAIT_CORNER_HEIGHT, 'top-left', portraitArc),
  cornerKey('back', PORTRAIT_CORNER_RIGHT, 0, PORTRAIT_CORNER_WIDTH, PORTRAIT_CORNER_HEIGHT, 'top-right', portraitArc),
  cornerKey('ret', 0, PORTRAIT_CORNER_BOTTOM, PORTRAIT_CORNER_WIDTH, PORTRAIT_CORNER_HEIGHT, 'bottom-left', portraitArc),
  cornerKey('clear', PORTRAIT_CORNER_RIGHT, PORTRAIT_CORNER_BOTTOM, PORTRAIT_CORNER_WIDTH, PORTRAIT_CORNER_HEIGHT, 'bottom-right', portraitArc),
  ...t9Digits(T9_PORTRAIT_DIGITS),
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

// The Flash gamepad: a direction wheel (OK = Enter at its hub) and two action keys. `value` is the keyboard code
// the key sends to the Flash player; the secondary legend names that key so the player can see what each button is.
const flashWheel = (x, y, size) => phoneKey('flash-dpad', 'OK', x, y, size, size, 'dpad', 'nav', undefined, {
  value: 'dpad', shape: 'wheel', wheel: { up: 'ArrowUp', down: 'ArrowDown', left: 'ArrowLeft', right: 'ArrowRight', center: 'Enter' },
})
const flashAction = (id, label, value, legend, x, y, size) =>
  ({ ...phoneKey(id, label, x, y, size, size, 'abxy', 'actions', legend), value, radius: size / 2 })
const flashPortrait = [
  flashWheel(0.3, 0.1, 3.4),
  flashAction('flash-b', 'B', 'KeyX', 'X', 4.1, 1.75, 1.5),
  flashAction('flash-a', 'A', 'Space', '空格', 5.75, 0.25, 1.5),
]
const flashLandscape = [
  flashWheel(0, 0, 2.6),
  flashAction('flash-b', 'B', 'KeyX', 'X', 5.2, 1.3, 1.2),
  flashAction('flash-a', 'A', 'Space', '空格', 6.6, 0.1, 1.2),
]

export const T9_PORTRAIT = 't9-portrait'
export const T9_LANDSCAPE = 't9-landscape'
export const FLASH_PORTRAIT = 'flash-portrait'
export const FLASH_LANDSCAPE = 'flash-landscape'

export const KEYBOARD_LAYOUTS = [
  { id: 'full-size', label: '全尺寸 104 键', type: 'physical', keys: fullSize },
  { id: 'tkl', label: 'TKL 87 键', type: 'physical', keys: tkl },
  { id: '75-percent', label: '75% 82 键', type: 'physical', keys: compact75 },
  { id: '60-percent', label: '60% 61 键', type: 'physical', keys: sixtyPercent },
  { id: 'dpad-abxy', label: '方向键 + ABXY', type: 'controller', keys: dpadAbxy },
  { id: 'numpad', label: '数字键盘', type: 'controller', keys: numericKeypad },
  { id: T9_PORTRAIT, label: 'T9 直板（竖屏）', type: 'phone', keys: t9Portrait },
  { id: T9_LANDSCAPE, label: 'T9 横屏（左方向 · 右数字）', type: 'phone', keys: t9Landscape },
  { id: FLASH_PORTRAIT, label: 'Flash 手柄（竖屏）', type: 'controller', keys: flashPortrait },
  { id: FLASH_LANDSCAPE, label: 'Flash 手柄（横屏）', type: 'controller', keys: flashLandscape },
]

export const getLayout = (id) => KEYBOARD_LAYOUTS.find((layout) => layout.id === id)

/** One half of a layout (the keys of `group`), as a layout of its own. */
export const layoutGroup = (layout, group) => ({ ...layout, id: `${layout.id}:${group}`, keys: layout.keys.filter((item) => item.group === group) })

const cornerIconCache = new WeakMap()

// Room kept between an icon and the key's edges, in layout units.
const ICON_MARGIN = 0.04
const ICON_GRID = 64

/** How far (x, y) — in the key's own units — is from the edge of the part of the key you can see: the box minus the
 *  disc the wheel cuts out of it. Negative outside that part. */
export function cornerClearance(item, x, y) {
  const { width, height, arc } = item
  const edges = Math.min(x, width - x, y, height - y) - ICON_MARGIN
  const wheel = Math.hypot(x - (arc.cx - item.x), y - (arc.cy - item.y)) - arc.radius
  return Math.min(edges, wheel)
}

/** Place each corner icon at the visual centre of what is left of its key, not at the box's geometric centre: the
 *  wheel cuts an arc out of the inner corner, so the box centre sits on (or next to) the cut. The visual centre is
 *  the centre of the largest circle that fits in the visible part; among near-equal centres the one closest to that
 *  part's centroid wins, so a long thin band does not pull the icon to one end. Everything is computed from the key's
 *  own box and arc on a grid symmetric about the box, so mirrored keys get mirrored icons. Keys are immutable and
 *  reused, so the result is cached. */
export function cornerIconLayout(item) {
  const cached = cornerIconCache.get(item)
  if (cached) return cached
  const { width, height } = item
  const samples = []
  let sumX = 0
  let sumY = 0
  for (let i = 0; i < ICON_GRID; i++) {
    for (let j = 0; j < ICON_GRID; j++) {
      const x = (width * (i + 0.5)) / ICON_GRID
      const y = (height * (j + 0.5)) / ICON_GRID
      const clearance = cornerClearance(item, x, y)
      if (clearance <= 0) continue
      samples.push({ x, y, clearance })
      sumX += x
      sumY += y
    }
  }
  const centroid = { x: sumX / samples.length, y: sumY / samples.length }
  const deepest = Math.max(...samples.map(({ clearance }) => clearance))
  const best = samples
    .filter(({ clearance }) => clearance >= deepest * 0.92)
    .reduce((a, b) => (Math.hypot(b.x - centroid.x, b.y - centroid.y) < Math.hypot(a.x - centroid.x, a.y - centroid.y) ? b : a))
  // The icon's square fits inside the circle of the clearance at its centre (half-diagonal = 0.71 × size).
  const size = Math.min(0.42, best.clearance * 1.2)
  const half = size / 2
  const result = {
    size,
    cx: best.x,
    cy: best.y,
    x: best.x - half,
    y: best.y - half,
    // A soft key's bar sits just above its icon, as a candybar phone prints it.
    indicator: { x: best.x - half, y: Math.max(ICON_MARGIN, best.y - half - 0.16), width: size, height: 0.05 },
    anchor: { x: best.x, y: best.y },
  }
  cornerIconCache.set(item, result)
  return result
}
