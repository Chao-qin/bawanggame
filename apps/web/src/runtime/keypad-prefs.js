// The on-screen keypad the J2ME and MRP runtimes use, chosen once for every game.
//   style:     't9'       candybar T9 keypad drawn from the keyboard presets (default)
//              'classic'  the original DOM keypad (custom touch layouts live there)
//   placement: 'docked'   the keypad takes its own space and the game screen fits the rest (default)
//              'floating' the game screen fills the stage and a translucent keypad floats over it (T9 only)
export const KEYPAD_PREFS_KEY = 'xiaochao.runtimeKeypad.v1'
export const KEYPAD_PREFS_EVENT = 'xiaochao:keypadprefs'
export const DEFAULT_KEYPAD_PREFS = Object.freeze({ style: 't9', placement: 'docked' })

const STYLES = new Set(['t9', 'classic'])
const PLACEMENTS = new Set(['docked', 'floating'])

export function normalizeKeypadPrefs(value) {
  const source = value && typeof value === 'object' ? value : {}
  return {
    style: STYLES.has(source.style) ? source.style : DEFAULT_KEYPAD_PREFS.style,
    placement: PLACEMENTS.has(source.placement) ? source.placement : DEFAULT_KEYPAD_PREFS.placement,
  }
}

export function readKeypadPrefs(storage = globalThis.localStorage) {
  try {
    return normalizeKeypadPrefs(JSON.parse(storage?.getItem(KEYPAD_PREFS_KEY) || 'null'))
  } catch {
    return { ...DEFAULT_KEYPAD_PREFS }
  }
}

/** Saves the merged prefs and tells every keypad in this document; returns what was saved. */
export function writeKeypadPrefs(patch, { storage = globalThis.localStorage, target = globalThis } = {}) {
  const next = normalizeKeypadPrefs({ ...readKeypadPrefs(storage), ...patch })
  try { storage?.setItem(KEYPAD_PREFS_KEY, JSON.stringify(next)) } catch {}
  try { target?.dispatchEvent?.(new CustomEvent(KEYPAD_PREFS_EVENT, { detail: next })) } catch {}
  return next
}
