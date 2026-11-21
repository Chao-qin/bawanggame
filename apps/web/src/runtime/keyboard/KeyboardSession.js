const DEFAULT_TIMEOUT = 3000
let nextSessionId = 0
import { loadKeyboardConfig, saveKeyboardConfig } from './storage.js'
import { resolveProfile } from './profiles.js'

function unavailableResult(reason) {
  return { available: false, reason }
}

export function createKeyboardSession(options = {}) {
  const id = options.id || `keyboard-session-${++nextSessionId}`
  const timeout = Number.isFinite(options.timeout) ? options.timeout : DEFAULT_TIMEOUT
  const runtime = options.runtime || 'j2me'
  const gameId = options.gameId
  let config = options.config || loadKeyboardConfig()
  let surface = null
  let currentGameId = gameId
  const currentOrientation = () => options.orientation || (typeof window !== 'undefined' && window.innerWidth > window.innerHeight ? 'landscape' : 'portrait')
  let profile = options.profile || resolveProfile(config, { runtime, orientation: currentOrientation(), gameId: currentGameId })
  let invalid = false
  let settled = false
  let timer
  const pressedListeners = new Set()
  const profileListeners = new Set()
  const inputReleaseCallbacks = new Set()
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
    getConfig: () => config,
    setGameId(nextGameId) {
      currentGameId = nextGameId
      return session.refreshConfig()
    },
    refreshConfig(nextConfig) {
      if (invalid) return profile
      config = nextConfig || loadKeyboardConfig()
      session.releaseAll()
      profile = resolveProfile(config, { runtime, orientation: currentOrientation(), gameId: currentGameId })
      profileListeners.forEach((listener) => listener(profile))
      try { window.__XIAOCHAO_KEYMAP_REBIND__?.() } catch {}
      return profile
    },
    saveConfig(nextConfig) {
      if (!saveKeyboardConfig(nextConfig)) return false
      session.refreshConfig(nextConfig)
      return true
    },
    registerInputRelease(callback) {
      if (typeof callback !== 'function') return () => {}
      inputReleaseCallbacks.add(callback)
      return () => inputReleaseCallbacks.delete(callback)
    },
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
      inputReleaseCallbacks.forEach((callback) => {
        try { callback() } catch {}
      })
      pressedListeners.forEach((listener) => listener(new Set()))
    },
    invalidate() {
      if (invalid) return
      session.releaseAll()
      invalid = true
      surface?.setAttribute?.('aria-disabled', 'true')
      surface = null
      pressedListeners.clear()
      profileListeners.clear()
      inputReleaseCallbacks.clear()
      settleUnavailable('invalidated')
    },
    get active() { return !invalid },
  }
  const host = typeof window !== 'undefined' ? window : null
  const refresh = () => session.refreshConfig()
  const onOrientation = () => session.refreshConfig()
  host?.addEventListener('xiaochao:keyboardprofilechange', refresh)
  host?.addEventListener('xiaochao:viewportchange', onOrientation)
  const originalInvalidate = session.invalidate
  session.invalidate = function () {
    host?.removeEventListener('xiaochao:keyboardprofilechange', refresh)
    host?.removeEventListener('xiaochao:viewportchange', onOrientation)
    originalInvalidate()
  }
  return session
}

export function createKeyboardSessionRegistry(options) {
  return createKeyboardSession(options)
}
