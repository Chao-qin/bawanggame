// Key haptics for every on-screen keypad (T9, the Flash gamepad, and the classic keypad through
// window.__XIAOCHAO_HAPTIC_PULSE__): touch input only, the runtime's vibrate setting (24ms if unset), through the
// native host when there is one, else the Vibration API.
const DEFAULT_MS = 24
const MIN_MS = 8
const MAX_MS = 40
// A diagonal on the wheel presses two directions in one move, and two fingers can land in the same frame: one pulse.
const MERGE_MS = 30

/** Pulse length for a vibrate setting; 0 when vibration is off. */
export function hapticDuration(setting) {
  const requested = setting == null || setting === '' ? DEFAULT_MS : Number(setting)
  return requested > 0 ? Math.max(MIN_MS, Math.min(MAX_MS, Math.round(requested))) : 0
}

/** The native bridge, looked up on every pulse: a runtime frame reads its app window's bridge, which may be injected
 *  after the frame started (a copy taken at boot stayed empty for the rest of the game). */
export function nativeHost(win = globalThis.window) {
  for (let current = win, depth = 0; current && depth < 4; depth += 1) {
    try {
      const host = current.__XIAOCHAO_RN_HOST__
      if (host && typeof host.haptic === 'function') return host
    } catch {}
    let parent = null
    try { parent = current.parent } catch {}
    if (!parent || parent === current) break
    current = parent
  }
  return null
}

/** One pulse of `duration` ms. Returns whether a channel accepted it. */
export function pulse(duration, { win = globalThis.window, nav = globalThis.navigator } = {}) {
  if (!(duration > 0)) return false
  const host = nativeHost(win)
  if (host) {
    try { if (host.haptic(duration) !== false) return true } catch {}
  }
  try { return nav?.vibrate?.(duration) === true } catch { return false }
}

/** Creates the haptic for key presses. Timing uses the clock at the press, not event.timeStamp, whose origin differs
 *  between the app document and a runtime frame and between browsers. */
export function createKeyHaptic({ now = () => globalThis.performance?.now?.() ?? Date.now(), send = pulse } = {}) {
  let last = -Infinity
  return function keyHaptic(event, setting) {
    if (event?.pointerType && event.pointerType !== 'touch') return false
    const duration = hapticDuration(setting)
    if (!duration) return false
    const at = now()
    if (at - last < MERGE_MS && at >= last) return false
    last = at
    return send(duration)
  }
}

export const keyHaptic = createKeyHaptic()
