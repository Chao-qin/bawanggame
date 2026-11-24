// The on-screen keypad each runtime family uses, chosen once for every game of that family.
//   phone (J2ME and MRP share it):
//     style:     't9'       candybar T9 keypad drawn from the keyboard presets (default)
//                'classic'  the original DOM keypad (custom touch layouts live there)
//   flash:
//     style:     'gamepad'  direction wheel plus A / B action keys (default)
//                'hidden'   no on-screen keys: mouse / touch-on-screen games (default with a mouse)
//   placement:   'docked'   the keypad takes its own space and the game screen fits the rest (default)
//                'floating' the game screen fills the stage and a translucent keypad floats over it
export const KEYPAD_PREFS_EVENT = 'xiaochao:keypadprefs'

export const KEYPAD_FAMILIES = Object.freeze({
  phone: Object.freeze({
    storageKey: 'xiaochao.runtimeKeypad.v1',
    styles: Object.freeze(['t9', 'classic']),
    // Styles whose keypad can float over the screen.
    floating: Object.freeze(['t9']),
    defaults: Object.freeze({ style: 't9', placement: 'docked' }),
  }),
  flash: Object.freeze({
    storageKey: 'xiaochao.flashKeypad.v1',
    styles: Object.freeze(['gamepad', 'hidden']),
    floating: Object.freeze(['gamepad']),
    defaults: Object.freeze({ style: 'gamepad', placement: 'docked' }),
    // A mouse-and-keyboard device keeps a clear screen until the player asks for the keys.
    fineStyle: 'hidden',
  }),
})

const PLACEMENTS = new Set(['docked', 'floating'])

export const KEYPAD_PREFS_KEY = KEYPAD_FAMILIES.phone.storageKey
export const DEFAULT_KEYPAD_PREFS = KEYPAD_FAMILIES.phone.defaults

const familyOf = (family) => KEYPAD_FAMILIES[family] || KEYPAD_FAMILIES.phone

function defaultsFor(family) {
  const { defaults, fineStyle } = familyOf(family)
  let fine = false
  try { fine = Boolean(fineStyle) && !globalThis.matchMedia?.('(pointer: coarse)')?.matches && Boolean(globalThis.matchMedia?.('(pointer: fine)')?.matches) } catch {}
  return fine ? { ...defaults, style: fineStyle } : defaults
}

export function normalizeKeypadPrefs(value, family = 'phone') {
  const { styles } = familyOf(family)
  const defaults = defaultsFor(family)
  const source = value && typeof value === 'object' ? value : {}
  return {
    style: styles.includes(source.style) ? source.style : defaults.style,
    placement: PLACEMENTS.has(source.placement) ? source.placement : defaults.placement,
  }
}

/** The placement the stage actually uses: a style that cannot float is always docked. */
export function effectivePlacement(prefs, family = 'phone') {
  return familyOf(family).floating.includes(prefs.style) ? prefs.placement : 'docked'
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
