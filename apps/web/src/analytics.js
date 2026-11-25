import { randomId } from './localFlash.js'

// Anonymous usage reporting: how many devices use the app, which games they play and for how long.
// The device is known by a random id (the app host's id in the APK, a browser-stored one on the web);
// nothing about the person is collected. Events are queued, stored so a reload or an offline spell
// does not lose them, and posted in batches; docs/superpowers/specs/2026-11-24-usage-analytics-design.md
// describes what the receiving endpoint gets.
export const PROTOCOL_VERSION = 1
export const HOST_ACTIVE_EVENT = 'xiaochao:hostactive'
const DEVICE_KEY = 'xiaochao-device-id'
const QUEUE_KEY = 'xiaochao-analytics-queue'
const MAX_QUEUE = 500
const MAX_BATCH = 50
const HEARTBEAT_MS = 30_000
const FETCH_TIMEOUT_MS = 15_000

function readStorage(storage, key) {
  try { return storage?.getItem(key) ?? null } catch (_) { return null }
}

function writeStorage(storage, key, value) {
  try {
    if (value === null) storage?.removeItem(key)
    else storage?.setItem(key, value)
  } catch (_) {}
}

// null until the APK host has given its id: an id kept by the page would be lost with the next launch's port.
function deviceIdentity(win) {
  const host = win.__XIAOCHAO_RN_HOST__
  if (typeof host?.deviceId === 'string' && host.deviceId) return { deviceId: host.deviceId, platform: String(host.platform || 'app') }
  // Same test as online.js isEmbeddedHost(), which reads the global window.
  if (new URLSearchParams(win.location?.search).get('host') === 'rn') return null
  let deviceId = readStorage(win.localStorage, DEVICE_KEY)
  if (!deviceId) {
    deviceId = randomId()
    writeStorage(win.localStorage, DEVICE_KEY, deviceId)
  }
  return { deviceId, platform: 'web' }
}

function readQueue(storage) {
  try {
    const queue = JSON.parse(readStorage(storage, QUEUE_KEY) || '[]')
    return Array.isArray(queue) ? queue.slice(-MAX_QUEUE) : []
  } catch (_) {
    return []
  }
}

// `now` stamps events; play time is measured on `elapsed`, a monotonic clock a device time change does not move.
export function createAnalytics({ endpoint, win = window, now = Date.now, elapsed = () => win.performance.now(), heartbeatMs = HEARTBEAT_MS }) {
  let identity = null
  const sessionId = randomId()
  const storage = win.localStorage
  let queue = readQueue(storage)
  let sending = false
  let hostActive = true
  let play = null

  const visible = () => hostActive && win.document?.visibilityState !== 'hidden'
  const save = () => writeStorage(storage, QUEUE_KEY, queue.length ? JSON.stringify(queue) : null)
  const envelope = (events) => JSON.stringify({ v: PROTOCOL_VERSION, device_id: identity.deviceId, platform: identity.platform, events })
  // Events wait in the queue until the device is known.
  const ready = () => (identity ??= deviceIdentity(win)) !== null

  function track(type, fields = {}) {
    queue.push({ id: randomId(), type, ts: now(), session_id: sessionId, ...fields })
    if (queue.length > MAX_QUEUE) queue = queue.slice(-MAX_QUEUE)
    save()
  }

  function drop(sent) {
    const ids = new Set(sent.map((event) => event.id))
    queue = queue.filter((event) => !ids.has(event.id))
    save()
  }

  async function flush() {
    if (sending || !queue.length || !ready()) return
    sending = true
    const batch = queue.slice(0, MAX_BATCH)
    // A request that never settles (captive portal, half-open connection) must not hold up every later flush.
    const controller = typeof win.AbortController === 'function' ? new win.AbortController() : null
    const timer = controller ? win.setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS) : 0
    try {
      // text/plain keeps this a CORS simple request: no preflight, the endpoint only needs Access-Control-Allow-Origin.
      const response = await win.fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=UTF-8' },
        body: envelope(batch),
        credentials: 'omit',
        keepalive: true,
        signal: controller?.signal,
      })
      if (response.ok) drop(batch)
      else return
    } catch (_) {
      // Offline or refused: the batch stays queued for the next attempt.
      return
    } finally {
      win.clearTimeout(timer)
      sending = false
    }
    // A backlog (after a long offline spell) goes out batch after batch while the endpoint takes them.
    flush()
  }

  // The page may be gone before a fetch settles; a beacon the browser accepted is taken as sent.
  function flushBeacon() {
    const batch = queue.slice(0, MAX_BATCH)
    if (!batch.length || typeof win.navigator?.sendBeacon !== 'function' || !ready()) return
    try {
      if (win.navigator.sendBeacon(endpoint, new win.Blob([envelope(batch)], { type: 'text/plain;charset=UTF-8' }))) drop(batch)
    } catch (_) {}
  }

  // Foreground play time since the last report; time with the page hidden or the app in the background is not counted.
  function takeActiveMs() {
    const at = elapsed()
    const ms = play.activeMs + (play.resumedAt === null ? 0 : at - play.resumedAt)
    // Whole milliseconds are reported; the fraction carries into the next report so a play's sum stays exact.
    const whole = Math.round(ms)
    play.activeMs = ms - whole
    if (play.resumedAt !== null) play.resumedAt = at
    return whole
  }

  function playFields() {
    return { play_id: play.id, game: play.game }
  }

  function pause() {
    if (play && play.resumedAt !== null) {
      play.activeMs += elapsed() - play.resumedAt
      play.resumedAt = null
      track('heartbeat', { ...playFields(), active_ms: takeActiveMs() })
    }
    flushBeacon()
  }

  function resume() {
    if (play && play.resumedAt === null) play.resumedAt = elapsed()
    flush()
  }

  function endPlay() {
    if (!play) return
    win.clearInterval(play.timer)
    track('game_end', { ...playFields(), active_ms: takeActiveMs() })
    play = null
    flush()
  }

  function startPlay(game) {
    endPlay()
    play = {
      id: randomId(),
      game: { kind: game.kind, file: String(game.file).slice(0, 200), name: String(game.name || game.file).slice(0, 200), local: !!game.local },
      activeMs: 0,
      resumedAt: visible() ? elapsed() : null,
      timer: 0,
    }
    track('game_start', playFields())
    play.timer = win.setInterval(() => {
      if (!visible()) return
      track('heartbeat', { ...playFields(), active_ms: takeActiveMs() })
      flush()
    }, heartbeatMs)
    flush()
    return endPlay
  }

  function start() {
    win.document?.addEventListener('visibilitychange', () => (visible() ? resume() : pause()))
    win.addEventListener('pagehide', pause)
    win.addEventListener('online', flush)
    // The APK host reports going to the background itself: a backgrounded WebView does not always hide the page.
    win.addEventListener(HOST_ACTIVE_EVENT, (event) => {
      hostActive = event.detail !== false
      if (visible()) resume()
      else pause()
    })
    track('app_open')
    flush()
  }

  return { start, startPlay, flush }
}

let installed = null

/** Starts reporting to `endpoint`; without an endpoint nothing is collected or stored. */
export function installAnalytics(endpoint) {
  if (installed || !endpoint) return
  installed = createAnalytics({ endpoint })
  installed.start()
}

/** Marks `game` as being played until the returned function is called. */
export function trackPlay(game) {
  return installed ? installed.startPlay(game) : () => {}
}
