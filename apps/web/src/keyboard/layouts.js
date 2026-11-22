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
  const keys = [...rows.flat()].map((item) => item.id === 'shift-right' ? { ...item, width: 2.25 } : item)
  keys.push(key('escape', 'Esc', 'Escape', 0, 0, 1, 'alpha', 0))
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

export const KEYBOARD_LAYOUTS = [
  { id: 'full-size', label: '全尺寸 104 键', type: 'physical', keys: fullSize },
  { id: 'tkl', label: 'TKL 87 键', type: 'physical', keys: tkl },
  { id: '75-percent', label: '75% 82 键', type: 'physical', keys: compact75 },
  { id: '60-percent', label: '60% 61 键', type: 'physical', keys: sixtyPercent },
  { id: 'dpad-abxy', label: '方向键 + ABXY', type: 'controller', keys: dpadAbxy },
  { id: 'numpad', label: '数字键盘', type: 'controller', keys: numericKeypad },
]

export const getLayout = (id) => KEYBOARD_LAYOUTS.find((layout) => layout.id === id)
