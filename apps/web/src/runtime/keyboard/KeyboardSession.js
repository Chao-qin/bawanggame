const DEFAULT_TIMEOUT = 3000
let nextSessionId = 0

function unavailableResult(reason) {
  return { available: false, reason }
}

export function createKeyboardSession(options = {}) {
  const id = options.id || `keyboard-session-${++nextSessionId}`
  const timeout = Number.isFinite(options.timeout) ? options.timeout : DEFAULT_TIMEOUT
  let surface = null
  let profile = options.profile
  let invalid = false
  let settled = false
  let timer
  const pressedListeners = new Set()
  const profileListeners = new Set()
  let resolveReady
  const ready = new Promise((resolve) => { resolveReady = resolve })

  const settleUnavailable = (reason) => {
    if (settled) return
    settled = true
    clearTimeout(timer)
    resolveReady(unavailableResult(reason))
  }
  timer = setTimeout(() => settleUnavailable('timeout'), timeout)

  const session = {
    id,
    ready,
    getSurface: () => surface,
    getProfile: () => profile,
    registerSurface(nextSurface, nextProfile) {
      if (invalid || settled) {
        nextSurface?.setAttribute?.('aria-disabled', 'true')
        return { accepted: false, available: false, reason: invalid ? 'invalidated' : 'timeout' }
      }
      if (!nextSurface) return { accepted: false, available: false, reason: 'missing-surface' }
      surface = nextSurface
      if (nextProfile !== undefined) profile = nextProfile
      settled = true
      clearTimeout(timer)
      resolveReady({ available: true, surface, profile })
      return { accepted: true, available: true }
    },
    unregisterSurface(target = surface) {
      if (target && target === surface) surface = null
      if (!invalid) session.releaseAll()
    },
    subscribePressed(listener) {
      pressedListeners.add(listener)
      return () => pressedListeners.delete(listener)
    },
    subscribeProfile(listener) {
      profileListeners.add(listener)
      return () => profileListeners.delete(listener)
    },
    notifyPressed(pressed) {
      if (invalid) return
      pressedListeners.forEach((listener) => listener(pressed))
    },
    notifyProfile(nextProfile) {
      if (invalid) return
      profile = nextProfile
      profileListeners.forEach((listener) => listener(nextProfile))
    },
    releaseAll() {
      if (invalid) return
      pressedListeners.forEach((listener) => listener(new Set()))
    },
    invalidate() {
      if (invalid) return
      invalid = true
      session.releaseAll()
      surface?.setAttribute?.('aria-disabled', 'true')
      surface = null
      pressedListeners.clear()
      profileListeners.clear()
      settleUnavailable('invalidated')
    },
    get active() { return !invalid },
  }
  return session
}

export function createKeyboardSessionRegistry(options) {
  return createKeyboardSession(options)
}
