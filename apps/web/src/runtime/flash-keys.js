// Which keyboard keys the Flash gamepad sends, chosen per game (Flash games disagree: Space / X, Z / X, Shift, WASD…).
export const FLASH_KEYS_STORAGE = 'xiaochao.flashKeys.v1'
export const FLASH_KEYS_EVENT = 'xiaochao:flashkeys'
// The entry the 「键盘」 page edits: the keys of every game that has no choice of its own.
export const FLASH_KEYS_DEFAULT_GAME = '*'

// The keys an action button can send, by keyboard code, with the legend shown on the key and in the sheet.
export const FLASH_ACTION_KEYS = Object.freeze([
  ['Space', '空格'], ['Enter', 'Enter'], ['ShiftLeft', 'Shift'], ['ControlLeft', 'Ctrl'],
  ['KeyZ', 'Z'], ['KeyX', 'X'], ['KeyC', 'C'], ['KeyA', 'A'], ['KeyS', 'S'], ['KeyD', 'D'],
])
export const FLASH_DIRECTION_KEYS = Object.freeze([['arrows', '方向键'], ['wasd', 'WASD']])
const DIRECTIONS = Object.freeze({
  arrows: { up: 'ArrowUp', down: 'ArrowDown', left: 'ArrowLeft', right: 'ArrowRight' },
  wasd: { up: 'KeyW', down: 'KeyS', left: 'KeyA', right: 'KeyD' },
})
export const DEFAULT_FLASH_KEYS = Object.freeze({ directions: 'arrows', ok: 'Enter', a: 'Space', b: 'KeyX' })

const ACTION_CODES = new Set(FLASH_ACTION_KEYS.map(([code]) => code))

export function normalizeFlashKeys(value) {
  const source = value && typeof value === 'object' ? value : {}
  const action = (key) => (ACTION_CODES.has(source[key]) ? source[key] : DEFAULT_FLASH_KEYS[key])
  return {
    directions: Object.hasOwn(DIRECTIONS, source.directions) ? source.directions : DEFAULT_FLASH_KEYS.directions,
    ok: action('ok'),
    a: action('a'),
    b: action('b'),
  }
}

export const directionCodes = (keys) => DIRECTIONS[keys.directions]

export const keyLegend = (code) => FLASH_ACTION_KEYS.find(([value]) => value === code)?.[1] || code

const CODE_KEYS = Object.freeze({
  Space: ' ', ShiftLeft: 'Shift', ShiftRight: 'Shift', ControlLeft: 'Control', ControlRight: 'Control',
  AltLeft: 'Alt', AltRight: 'Alt', MetaLeft: 'Meta', MetaRight: 'Meta', Backquote: '`', Minus: '-', Equal: '=',
  BracketLeft: '[', BracketRight: ']', Backslash: '\\', Semicolon: ';', Quote: "'", Comma: ',', Period: '.', Slash: '/',
  NumpadMultiply: '*', NumpadAdd: '+', NumpadDivide: '/', NumpadSubtract: '-', NumpadDecimal: '.',
})

/** The `key` a game reads for a keyboard code. */
export function keyOfCode(code) {
  if (CODE_KEYS[code]) return CODE_KEYS[code]
  if (/^Key[A-Z]$/.test(code)) return code.slice(3).toLowerCase()
  if (/^(Digit|Numpad)\d$/.test(code)) return code.slice(-1)
  return code
}

function readAll(storage) {
  try {
    const value = JSON.parse(storage?.getItem(FLASH_KEYS_STORAGE) || '{}')
    return value && typeof value === 'object' ? value : {}
  } catch {
    return {}
  }
}

export function readFlashKeys(game, storage = globalThis.localStorage) {
  const all = readAll(storage)
  return normalizeFlashKeys(all[game] ?? all[FLASH_KEYS_DEFAULT_GAME])
}

/** Saves one game's keys and tells this document; returns what was saved. */
export function writeFlashKeys(game, patch, { storage = globalThis.localStorage, target = globalThis } = {}) {
  const all = readAll(storage)
  const next = normalizeFlashKeys({ ...normalizeFlashKeys(all[game] ?? all[FLASH_KEYS_DEFAULT_GAME]), ...patch })
  all[game] = next
  try { storage?.setItem(FLASH_KEYS_STORAGE, JSON.stringify(all)) } catch {}
  try { target?.dispatchEvent?.(new CustomEvent(FLASH_KEYS_EVENT, { detail: { game, keys: next } })) } catch {}
  return next
}
