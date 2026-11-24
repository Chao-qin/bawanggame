// Key haptics for every on-screen keypad (T9, the Flash gamepad, and the classic keypad through
// window.__XIAOCHAO_HAPTIC_PULSE__): touch input only, the runtime's vibrate setting (24ms if unset), through the
// native host when there is one, else the Vibration API.
const DEFAULT_MS = 24
const MIN_MS = 8
const MAX_MS = 40

/** Pulse length for a vibrate setting; 0 when vibration is off. */
export function hapticDuration(setting) {
  const requested = setting == null || setting === '' ? DEFAULT_MS : Number(setting)
  return requested > 0 ? Math.max(MIN_MS, Math.min(MAX_MS, Math.round(requested))) : 0
}

/** This window and the same-origin windows above it, innermost first (a runtime frame, then the app window). */
function windowChain(win) {
  const chain = []
  for (let current = win, depth = 0; current && depth < 4; depth += 1) {
    chain.push(current)
    let parent = null
    try { parent = current.parent } catch {}
    if (!parent || parent === current) break
    try { void parent.navigator } catch { break } // another origin: stop
    current = parent
  }
  return chain
}

/** The native bridge, looked up on every pulse, outermost window first: the app window holds the bridge the native
 *  host injected, and a runtime frame's copy of it (taken when the frame started) is only a fallback. */
export function nativeHost(win = globalThis.window) {
  for (const current of windowChain(win).reverse()) {
    try {
      const host = current.__XIAOCHAO_RN_HOST__
      if (host && typeof host.haptic === 'function') return host
    } catch {}
  }
  return null
}

/** The Vibration API of the outermost same-origin window. Browsers only vibrate for a document the user has
 *  interacted with: each game starts in a new runtime frame, and a touch only counts as interaction once it ends,
 *  so the frame's own navigator ignored at least the first press of every game. The app window got the tap that
 *  started the game. */
function vibrationNavigator(win) {
  const chain = windowChain(win)
  for (const current of chain.reverse()) {
    try { if (typeof current.navigator?.vibrate === 'function') return current.navigator } catch {}
  }
  return globalThis.navigator
}

/** One pulse of `duration` ms. Returns whether a channel accepted it. */
export function pulse(duration, { win = globalThis.window, nav } = {}) {
  if (!(duration > 0)) return false
  const host = nativeHost(win)
  if (host) {
    try { if (host.haptic(duration) !== false) return true } catch {}
  }
  const vibration = nav || vibrationNavigator(win)
  try { return vibration?.vibrate?.(duration) === true } catch { return false }
}

/** Creates the haptic for key presses: one pulse per press event. A diagonal on the wheel presses two directions with
 *  one event, so it pulses once. Presses are not merged by time: a busy game delays the handlers, and presses that
 *  queued up behind it run back to back, so a time window dropped real presses. */
export function createKeyHaptic({ send = pulse } = {}) {
  let lastEvent = null
  return function keyHaptic(event, setting) {
    if (event?.pointerType && event.pointerType !== 'touch') return false
    const duration = hapticDuration(setting)
    if (!duration) return false
    if (event && event === lastEvent) return false
    lastEvent = event ?? null
    return send(duration)
  }
}

export const keyHaptic = createKeyHaptic()
