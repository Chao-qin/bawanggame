import { SCREEN_KEYPADS } from '../keyboard/system.js'

// How a runtime family shows its game (the 「游戏表现」 sheet), chosen once for every game of that family.
//   style:     any on-screen keyboard of the catalog (keyboard/system.js SCREEN_KEYPADS: T9, gamepad, D-pad + ABXY,
//              numeric keypad, 60% / 75% / TKL / full-size keyboards); J2ME and MRP default to 't9' and also offer
//              'classic', the original DOM keypad (custom touch layouts live there); Flash defaults to 'gamepad'
//   visible:   whether the on-screen keypad is shown (the toolbar toggles it); a mouse device starts with the Flash
//              keypad hidden
//   placement: 'docked' the keypad takes its own space and the game screen fits the rest (default)
//              'floating' the game screen fills the stage and the keypad floats over it
//   opacity:   'auto' (docked opaque, floating translucent) or a fixed opacity
//   layout:    'auto' follows the screen; 'portrait' keypad under the screen; 'landscape' keypad halves beside it
//   fit:       how the game screen fills its box: 'contain' whole picture, 'width' fill the width, 'height' fill the
//              height (the other axis is cropped when the picture is larger)
//   scale:     size of the floating keypad, 0.6–1.6 (the floating keypad's menu: 大小)
//   offsets:   where each floating keypad piece was dragged, per piece ('portrait:full', 'landscape:nav', …), as
//              [x, y] fractions of the stage size from the piece's own place
export const KEYPAD_PREFS_EVENT = 'xiaochao:keypadprefs'

const CANVAS_STYLES = SCREEN_KEYPADS.map((keypad) => keypad.id)
const firstThen = (first) => Object.freeze([first, ...CANVAS_STYLES.filter((id) => id !== first)])

export const PLACEMENTS = Object.freeze(['docked', 'floating'])
export const OPACITIES = Object.freeze(['auto', '1', '0.8', '0.6', '0.4'])
export const LAYOUTS = Object.freeze(['auto', 'portrait', 'landscape'])
export const FITS = Object.freeze(['contain', 'width', 'height'])
const FLOATING_OPACITY = 0.6
export const SCALE_RANGE = Object.freeze({ min: 0.6, max: 1.6, step: 0.1 })

export const KEYPAD_FAMILIES = Object.freeze({
  phone: Object.freeze({
    storageKey: 'xiaochao.runtimeKeypad.v1',
    styles: Object.freeze([...firstThen('t9'), 'classic']),
    // Styles whose keypad can float over the screen: every drawn keyboard, not the classic DOM keypad.
    floating: Object.freeze(CANVAS_STYLES),
    defaults: Object.freeze({ style: 't9', visible: true, placement: 'docked', opacity: 'auto', layout: 'auto', fit: 'contain', scale: 1, offsets: Object.freeze({}) }),
  }),
  flash: Object.freeze({
    storageKey: 'xiaochao.flashKeypad.v1',
    styles: firstThen('gamepad'),
    floating: Object.freeze(CANVAS_STYLES),
    defaults: Object.freeze({ style: 'gamepad', visible: true, placement: 'docked', opacity: 'auto', layout: 'auto', fit: 'contain', scale: 1, offsets: Object.freeze({}) }),
    // A mouse-and-keyboard device keeps a clear screen until the player asks for the keys.
    fineVisible: false,
  }),
})

export const KEYPAD_PREFS_KEY = KEYPAD_FAMILIES.phone.storageKey
export const DEFAULT_KEYPAD_PREFS = KEYPAD_FAMILIES.phone.defaults

const familyOf = (family) => KEYPAD_FAMILIES[family] || KEYPAD_FAMILIES.phone

function defaultsFor(family) {
  const { defaults, fineVisible } = familyOf(family)
  let fine = false
  try { fine = fineVisible != null && !globalThis.matchMedia?.('(pointer: coarse)')?.matches && Boolean(globalThis.matchMedia?.('(pointer: fine)')?.matches) } catch {}
  return fine ? { ...defaults, visible: fineVisible } : defaults
}

export function clampScale(value) {
  const number = Number(value)
  if (!Number.isFinite(number)) return 1
  const stepped = Math.round(number / SCALE_RANGE.step) * SCALE_RANGE.step
  return Math.round(Math.min(SCALE_RANGE.max, Math.max(SCALE_RANGE.min, stepped)) * 10) / 10
}

function normalizeOffsets(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
  const offsets = {}
  for (const [piece, point] of Object.entries(value)) {
    if (!/^(portrait|landscape):[a-z]+$/.test(piece) || !Array.isArray(point) || point.length !== 2) continue
    const [x, y] = point.map(Number)
    if (Number.isFinite(x) && Number.isFinite(y)) offsets[piece] = [Math.min(1, Math.max(-1, x)), Math.min(1, Math.max(-1, y))]
  }
  return offsets
}

export function normalizeKeypadPrefs(value, family = 'phone') {
  const { styles } = familyOf(family)
  const defaults = defaultsFor(family)
  const source = value && typeof value === 'object' ? value : {}
  const pick = (list, key) => (list.includes(source[key]) ? source[key] : defaults[key])
  return {
    style: pick(styles, 'style'),
    // The Flash 'hidden' style of the first release is the keypad switched off.
    visible: typeof source.visible === 'boolean' ? source.visible : source.style === 'hidden' ? false : defaults.visible,
    placement: pick(PLACEMENTS, 'placement'),
    opacity: pick(OPACITIES, 'opacity'),
    layout: pick(LAYOUTS, 'layout'),
    fit: pick(FITS, 'fit'),
    scale: source.scale == null ? defaults.scale : clampScale(source.scale),
    offsets: normalizeOffsets(source.offsets),
  }
}

/** The placement the stage actually uses: a style that cannot float is always docked. */
export function effectivePlacement(prefs, family = 'phone') {
  return familyOf(family).floating.includes(prefs.style) ? prefs.placement : 'docked'
}

/** The keypad opacity the stage uses: 'auto' is opaque docked and translucent floating. */
export function effectiveOpacity(prefs, family = 'phone') {
  if (prefs.opacity !== 'auto') return Number(prefs.opacity)
  return effectivePlacement(prefs, family) === 'floating' ? FLOATING_OPACITY : 1
}

/** The layout a stage uses: the chosen one, or the screen's own orientation. */
export function effectiveLayout(prefs, screenOrientation) {
  return prefs.layout === 'auto' ? screenOrientation : prefs.layout
}

export function readKeypadPrefs(storage = globalThis.localStorage, family = 'phone') {
  try {
    return normalizeKeypadPrefs(JSON.parse(storage?.getItem(familyOf(family).storageKey) || 'null'), family)
  } catch {
    return { ...defaultsFor(family) }
  }
}

/** Saves the merged prefs and tells every keypad in this document; returns what was saved. */
export function writeKeypadPrefs(patch, { storage = globalThis.localStorage, target = globalThis, family = 'phone' } = {}) {
  const next = normalizeKeypadPrefs({ ...readKeypadPrefs(storage, family), ...patch }, family)
  try { storage?.setItem(familyOf(family).storageKey, JSON.stringify(next)) } catch {}
  try { target?.dispatchEvent?.(new CustomEvent(KEYPAD_PREFS_EVENT, { detail: next })) } catch {}
  return next
}
