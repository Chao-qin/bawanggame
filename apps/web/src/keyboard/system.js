// The keyboard system: every runtime keyboard family, its actions and keypads, and the global key / gamepad
// bindings the 「键盘」 page edits. The input engine itself is runtime/j2me/input-mapping.js (window.InputMapping);
// it owns the default bindings and reads the same storage, so a game without bindings of its own follows this page.
import { FLASH_LANDSCAPE, FLASH_PORTRAIT, getLayout, T9_LANDSCAPE, T9_PORTRAIT } from './layouts.js'
import { directionCodes } from '../runtime/flash-keys.js'

export const INPUT_ENGINE_URL = '/runtime/j2me/input-mapping.js'
export const INPUT_BINDING_EVENT = 'xiaochao:globalinput'

// Every on-screen keyboard the runtimes can show, drawn by KeyboardCanvas from the presets in layouts.js. `values`
// says what a key carries: 'action' (a phone action: up, ok, num5…) or 'code' (a keyboard code: ArrowUp, KeyZ…).
// A split keyboard sits in the two side columns of a landscape layout; a wide one stays whole.
export const SCREEN_KEYPADS = Object.freeze([
  { id: 't9', name: 'T9 手机键盘', description: '方向轮盘、软键与数字键', portrait: T9_PORTRAIT, landscape: T9_LANDSCAPE, values: 'action', split: true },
  { id: 'gamepad', name: '游戏手柄', description: '方向轮盘与 A / B 键', portrait: FLASH_PORTRAIT, landscape: FLASH_LANDSCAPE, values: 'code', split: true },
  { id: 'dpad-abxy', name: '方向键 + ABXY', description: '十字方向键与 A、B、X、Y', portrait: 'dpad-abxy', landscape: 'dpad-abxy', values: 'code', split: true },
  { id: 'numpad', name: '数字小键盘', description: '0–9 与运算键', portrait: 'numpad', landscape: 'numpad', values: 'code', split: false },
  { id: '60-percent', name: '60% 键盘', description: '61 键：字母、数字与常用键', portrait: '60-percent', landscape: '60-percent', values: 'code', split: false },
  { id: '75-percent', name: '75% 键盘', description: '82 键：加功能键与方向键', portrait: '75-percent', landscape: '75-percent', values: 'code', split: false },
  { id: 'tkl', name: 'TKL 键盘', description: '87 键：无数字小键盘', portrait: 'tkl', landscape: 'tkl', values: 'code', split: false },
  { id: 'full-size', name: '全尺寸键盘', description: '104 键完整键盘', portrait: 'full-size', landscape: 'full-size', values: 'code', split: false },
].map(Object.freeze))
// J2ME and MRP also keep their original DOM keypad (custom touch layouts live there).
export const CLASSIC_KEYPAD = Object.freeze({ id: 'classic', name: '经典键盘', description: '原来的圆形方向键，支持自定义触屏键位' })

export const screenKeypad = (id) => SCREEN_KEYPADS.find((keypad) => keypad.id === id) || null

// A split keyboard's halves: by the preset's own groups (T9, gamepad), else by its key blocks (D-pad | ABXY).
function halves(layout) {
  const field = layout.keys.some((item) => item.group) ? 'group' : 'block'
  const names = [...new Set(layout.keys.map((item) => item[field]))]
  return names.slice(0, 2).map((name) => ({ ...layout, id: `${layout.id}:${name}`, keys: layout.keys.filter((item) => item[field] === name) }))
}

/** The pieces a keyboard shows in a layout: one whole keyboard, or (split, landscape) a left and a right half.
 *  `piece` names the piece for its saved floating position. */
export function keypadPieces(id, orientation) {
  const keypad = screenKeypad(id)
  if (!keypad) return []
  const landscape = orientation === 'landscape'
  const layout = getLayout(landscape ? keypad.landscape : keypad.portrait)
  if (!landscape) return [{ piece: 'portrait:full', part: 'full', layout, origin: 'center bottom' }]
  if (!keypad.split) return [{ piece: 'landscape:full', part: 'wide', layout, origin: 'center bottom' }]
  const [left, right] = halves(layout)
  return [
    { piece: 'landscape:nav', part: 'left', layout: left, origin: 'left center' },
    { piece: 'landscape:actions', part: 'right', layout: right, origin: 'right center' },
  ]
}

const PHONE_ACTIONS = [
  ['up', '上'], ['down', '下'], ['left', '左'], ['right', '右'], ['ok', '确认'],
  ['choice', '左软键'], ['back', '右软键'], ['ret', '返回'], ['clear', '清除'],
  ['star', '*'], ['pound', '#'],
  ...Array.from({ length: 10 }, (_, digit) => [`num${digit}`, String(digit)]),
]
const FLASH_ACTIONS = [['up', '上'], ['down', '下'], ['left', '左'], ['right', '右'], ['ok', '确认（OK）'], ['a', 'A 键'], ['b', 'B 键']]

/** Each family names the runtimes it serves, the actions its keys press, and the keyboard the 「键盘」 page draws so
 *  an action can be picked by tapping its key. Every family can show any keyboard of SCREEN_KEYPADS. */
export const KEYBOARD_FAMILIES = Object.freeze({
  phone: Object.freeze({
    id: 'phone',
    name: '手机键盘',
    runtimes: Object.freeze(['j2me', 'maopao']),
    runtimeLabel: 'J2ME · 冒泡社区',
    actions: Object.freeze(PHONE_ACTIONS),
    preview: T9_PORTRAIT,
  }),
  flash: Object.freeze({
    id: 'flash',
    name: 'Flash 手柄',
    runtimes: Object.freeze(['flash']),
    runtimeLabel: 'Flash',
    actions: Object.freeze(FLASH_ACTIONS),
    preview: FLASH_PORTRAIT,
  }),
})

export function familyForRuntime(kind) {
  return Object.values(KEYBOARD_FAMILIES).find((family) => family.runtimes.includes(kind)) || null
}

export function actionLabel(family, action) {
  return KEYBOARD_FAMILIES[family]?.actions.find(([id]) => id === action)?.[1] || action
}

const KEY_NAMES = {
  ArrowUp: '↑', ArrowDown: '↓', ArrowLeft: '←', ArrowRight: '→', Space: '空格', Enter: 'Enter', Escape: 'Esc',
  Backspace: '退格', Delete: 'Delete', ShiftLeft: '左 Shift', ShiftRight: '右 Shift', ControlLeft: '左 Ctrl',
  ControlRight: '右 Ctrl', AltLeft: '左 Alt', AltRight: '右 Alt', Tab: 'Tab', Minus: '-', Equal: '=',
  NumpadMultiply: '小键盘 *', NumpadAdd: '小键盘 +', SoftLeft: '左软键', SoftRight: '右软键',
}

/** A readable name for a binding control: a keyboard code or key, or a gamepad button / axis direction. */
export function controlName(control) {
  if (control.startsWith('button:')) return `手柄按钮 ${Number(control.slice(7)) + 1}`
  const axis = /^axis:(\d+):([+-])$/.exec(control)
  if (axis) return `摇杆轴 ${Number(axis[1]) + 1} ${axis[2] === '-' ? '负向' : '正向'}`
  if (KEY_NAMES[control]) return KEY_NAMES[control]
  if (/^Key[A-Z]$/.test(control)) return control.slice(3)
  if (/^Digit\d$/.test(control)) return control.slice(5)
  if (/^Numpad\d$/.test(control)) return `小键盘 ${control.slice(6)}`
  return control
}

/** The controls bound to one action, readable; '未绑定' when there is none. */
export function controlsFor(bindings, action) {
  return Object.keys(bindings || {}).filter((control) => bindings[control] === action).map(controlName).join('、') || '未绑定'
}

/** Binds `control` to `action` alone: the action's previous controls are dropped, as a capture in a game does. */
export function bindControl(bindings, action, control) {
  const next = Object.fromEntries(Object.entries(bindings || {}).filter(([, value]) => value !== action))
  next[control] = action
  return next
}

export function unbindAction(bindings, action) {
  return Object.fromEntries(Object.entries(bindings || {}).filter(([, value]) => value !== action))
}

export const globalBindingsKey = (family) => `xiaochao.input.v1.global.${family}`

function isMap(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

/** The family's global bindings, completed from the engine's defaults where the page has saved none. */
export function readGlobalBindings(family, defaults, storage = globalThis.localStorage) {
  let saved = {}
  try { saved = JSON.parse(storage?.getItem(globalBindingsKey(family)) || '{}') || {} } catch {}
  return {
    keyboard: { ...(isMap(saved.keyboard) ? saved.keyboard : defaults.keyboard) },
    gamepad: { ...(isMap(saved.gamepad) ? saved.gamepad : defaults.gamepad) },
  }
}

export function writeGlobalBindings(family, bindings, { storage = globalThis.localStorage, target = globalThis } = {}) {
  const value = { keyboard: { ...bindings.keyboard }, gamepad: { ...bindings.gamepad } }
  try { storage?.setItem(globalBindingsKey(family), JSON.stringify(value)) } catch {}
  try { target?.dispatchEvent?.(new CustomEvent(INPUT_BINDING_EVENT, { detail: { family, bindings: value } })) } catch {}
  return value
}

/** The first gamepad control held down in `pads` ('button:N' or 'axis:N:±'), as the engine names it. */
export function heldGamepadControl(pads) {
  for (const pad of pads || []) {
    if (!pad) continue
    const button = Array.from(pad.buttons || []).findIndex((item) => item?.pressed)
    if (button >= 0) return `button:${button}`
    const axes = Array.from(pad.axes || [])
    for (let axis = 0; axis < axes.length; axis++) {
      if (axes[axis] <= -0.7) return `axis:${axis}:-`
      if (axes[axis] >= 0.7) return `axis:${axis}:+`
    }
  }
  return null
}

/** Waits for the next key press or gamepad control; resolves with { kind, control } or null when `signal` aborts. */
export function captureNextControl({ signal, win = globalThis } = {}) {
  return new Promise((resolve) => {
    let timer = 0
    const finish = (value) => {
      win.removeEventListener('keydown', onKey, true)
      if (timer) win.clearInterval(timer)
      signal?.removeEventListener?.('abort', onAbort)
      resolve(value)
    }
    const onKey = (event) => {
      event.preventDefault()
      event.stopImmediatePropagation()
      finish({ kind: 'keyboard', control: event.code || event.key })
    }
    const onAbort = () => finish(null)
    if (signal?.aborted) return resolve(null)
    win.addEventListener('keydown', onKey, true)
    signal?.addEventListener?.('abort', onAbort)
    // A button already held when the capture starts (e.g. the one that opened it) does not count.
    let ignored = heldGamepadControl(win.navigator?.getGamepads?.() || [])
    timer = win.setInterval(() => {
      let pads = []
      try { pads = win.navigator?.getGamepads?.() || [] } catch {}
      const control = heldGamepadControl(pads)
      if (control && control !== ignored) finish({ kind: 'gamepad', control })
      else if (!control) ignored = null
    }, 50)
  })
}

/** Whether a gamepad is connected now. */
export function gamepadConnected(win = globalThis) {
  try { return Array.from(win.navigator?.getGamepads?.() || []).some(Boolean) } catch { return false }
}

const FLASH_PREVIEW_ACTIONS = { ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right', Enter: 'ok' }

/** The family action a key of the family's keypad preview stands for (the page binds it when the key is tapped). */
export function previewAction(family, unit) {
  if (!unit) return null
  if (family === 'flash') {
    if (String(unit.id).startsWith('flash-a')) return 'a'
    if (String(unit.id).startsWith('flash-b')) return 'b'
    return FLASH_PREVIEW_ACTIONS[unit.value] || null
  }
  return KEYBOARD_FAMILIES.phone.actions.some(([id]) => id === unit.value) ? unit.value : null
}

// What a screen key does in each family. Phone runtimes take actions: a key that carries a keyboard code acts like
// that key on a physical keyboard (the family's 按键映射), and controller-style buttons have a fixed meaning.
const PHONE_BUTTON_ACTIONS = Object.freeze({
  'flash-a': 'ok', 'flash-b': 'back', 'button-a': 'ok', 'button-b': 'back', 'button-x': 'choice', 'button-y': 'clear',
  multiply: 'star', add: 'pound',
})
const PHONE_ACTION_IDS = new Set(PHONE_ACTIONS.map(([id]) => id))

/** The phone action of a screen key (`unit` from KeyboardCanvas), given the game's keyboard bindings. */
export function phoneActionOf(unit, keyboardBindings) {
  if (PHONE_ACTION_IDS.has(unit.value)) return unit.value
  if (PHONE_BUTTON_ACTIONS[unit.keyId]) return PHONE_BUTTON_ACTIONS[unit.keyId]
  const action = keyboardBindings?.[unit.value]
  return PHONE_ACTION_IDS.has(action) ? action : null
}

// Flash games read keyboard keys. A phone-action key sends the key a phone keyboard would; the numeric keypad
// preset's operator keys are named without their Numpad prefix.
const FLASH_ACTION_CODES = Object.freeze({ ret: 'Escape', clear: 'Backspace', star: 'NumpadMultiply', pound: 'NumpadAdd' })
const NUMPAD_CODES = Object.freeze({ Multiply: 'NumpadMultiply', Add: 'NumpadAdd', Divide: 'NumpadDivide', Subtract: 'NumpadSubtract', Decimal: 'NumpadDecimal' })

/** The keyboard code a screen key sends to a Flash game, given the game's 本游戏按键 (directions, OK, A, B). */
export function flashCodeOf(unit, flashKeys) {
  const value = unit.value
  if (['up', 'down', 'left', 'right'].includes(value)) return directionCodes(flashKeys)[value]
  if (value === 'ok') return flashKeys.ok
  if (value === 'choice') return flashKeys.a
  if (value === 'back') return flashKeys.b
  if (/^num\d$/.test(value)) return `Digit${value.slice(3)}`
  return FLASH_ACTION_CODES[value] || NUMPAD_CODES[value] || value || null
}
