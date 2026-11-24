// How a runtime family shows its game (the 「游戏表现」 sheet), chosen once for every game of that family.
//   style:     phone (J2ME and MRP share it): 't9' candybar keypad drawn from the keyboard presets (default)
//                                             'classic' the original DOM keypad (custom touch layouts live there)
//              flash: 'gamepad' direction wheel plus A / B action keys
//   visible:   whether the on-screen keypad is shown (the toolbar toggles it); a mouse device starts with the Flash
//              keypad hidden
//   placement: 'docked' the keypad takes its own space and the game screen fits the rest (default)
//              'floating' the game screen fills the stage and the keypad floats over it
//   opacity:   'auto' (docked opaque, floating translucent) or a fixed opacity
//   layout:    'auto' follows the screen; 'portrait' keypad under the screen; 'landscape' keypad halves beside it
//   fit:       how the game screen fills its box: 'contain' whole picture, 'width' fill the width, 'height' fill the
//              height (the other axis is cropped when the picture is larger)
export const KEYPAD_PREFS_EVENT = 'xiaochao:keypadprefs'

export const PLACEMENTS = Object.freeze(['docked', 'floating'])
export const OPACITIES = Object.freeze(['auto', '1', '0.8', '0.6', '0.4'])
export const LAYOUTS = Object.freeze(['auto', 'portrait', 'landscape'])
export const FITS = Object.freeze(['contain', 'width', 'height'])
const FLOATING_OPACITY = 0.6

export const KEYPAD_FAMILIES = Object.freeze({
  phone: Object.freeze({
    storageKey: 'xiaochao.runtimeKeypad.v1',
    styles: Object.freeze(['t9', 'classic']),
    // Styles whose keypad can float over the screen.
    floating: Object.freeze(['t9']),
    defaults: Object.freeze({ style: 't9', visible: true, placement: 'docked', opacity: 'auto', layout: 'auto', fit: 'contain' }),
  }),
  flash: Object.freeze({
    storageKey: 'xiaochao.flashKeypad.v1',
    styles: Object.freeze(['gamepad']),
    floating: Object.freeze(['gamepad']),
    defaults: Object.freeze({ style: 'gamepad', visible: true, placement: 'docked', opacity: 'auto', layout: 'auto', fit: 'contain' }),
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
