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
const MAX_BATCH_BYTES = 48 * 1024
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
  let inFront = false
  let play = null
  // Every event of this page load carries the next seq; the server ends a session (and its play) whose events stop.
  let seq = 0

  const visible = () => hostActive && win.document?.visibilityState !== 'hidden'
  const save = () => writeStorage(storage, QUEUE_KEY, queue.length ? JSON.stringify(queue) : null)
  const envelope = (events) => JSON.stringify({ v: PROTOCOL_VERSION, device_id: identity.deviceId, platform: identity.platform, events })
  // Events wait in the queue until the device is known.
  const ready = () => (identity ??= deviceIdentity(win)) !== null

  function track(type, fields = {}) {
    queue.push({ id: randomId(), type, ts: now(), session_id: sessionId, seq: ++seq, ...fields })
    if (queue.length > MAX_QUEUE) queue = queue.slice(-MAX_QUEUE)
    save()
  }

  function drop(sent) {
    const ids = new Set(sent.map((event) => event.id))
    queue = queue.filter((event) => !ids.has(event.id))
    save()
  }

  function nextBatch() {
    const batch = []
    const encoder = new TextEncoder()
    // This page load's events go first, so app_open is not held behind a backlog left by an earlier offline visit.
    for (const event of [...queue.filter((entry) => entry.session_id === sessionId), ...queue.filter((entry) => entry.session_id !== sessionId)]) {
      if (encoder.encode(envelope([...batch, event])).byteLength > MAX_BATCH_BYTES) {
        if (batch.length) break
        // Corrupt persisted entries must not block every subsequent valid event.
        queue = queue.filter((entry) => entry !== event)
        save()
        continue
      }
      batch.push(event)
      if (batch.length === MAX_BATCH) break
    }
    return batch
  }

  async function flush() {
    if (sending || !queue.length || !ready()) return
    const batch = nextBatch()
    if (!batch.length) return
    sending = true
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

  // Beacon cannot confirm HTTP acceptance; keep IDs queued until fetch confirms (the server deduplicates).
  function flushBeacon() {
    if (typeof win.navigator?.sendBeacon !== 'function' || !ready()) return
    const batch = nextBatch()
    if (!batch.length) return
    try {
      win.navigator.sendBeacon(endpoint, new win.Blob([envelope(batch)], { type: 'text/plain;charset=UTF-8' }))
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

  function playTime() {
    return { ...playFields(), active_ms: takeActiveMs() }
  }

  // The app session's acknowledgement, sent whether or not a game is open; inside a game it carries the play time.
  function heartbeat() {
    track('heartbeat', play ? playTime() : {})
  }

  function pause() {
    if (inFront) {
      inFront = false
      if (play && play.resumedAt !== null) {
        play.activeMs += elapsed() - play.resumedAt
        play.resumedAt = null
      }
      heartbeat()
    }
    flushBeacon()
  }

  function resume() {
    if (!inFront) {
      inFront = true
      if (play && play.resumedAt === null) play.resumedAt = elapsed()
      // Coming back acknowledges at once, so a session the server timed out while hidden continues without delay.
      heartbeat()
    }
    flush()
  }

  function endPlay() {
    if (!play) return
    track('game_end', playTime())
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
    }
    track('game_start', playFields())
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
    // The first event (seq 1) goes out at once; heartbeats follow every heartbeatMs while the page is in front.
    inFront = visible()
    track('app_open')
    flush()
    win.setInterval(() => {
      if (!visible()) return
      heartbeat()
      flush()
    }, heartbeatMs)
  }

  function reportError(error) {
    track('client_error', { ...(play ? playFields() : {}), error })
    flush()
  }

  return { start, startPlay, flush, reportError }
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

export function reportError(error, context) {
  try { installed?.reportError(normalizeError(error, context)) } catch (_) {}
}

function text(value, limit) {
  try {
    return String(value ?? '').replace(/https?:\/\/[^\s)]+/g, (url) => url.split(/[?#]/)[0])
      .replace(/\b((?:set-)?cookie)\s*:\s*[^\r\n]*/gi, '$1: [redacted]')
      .replace(/(\b[\w-]*(?:authorization|cookie|password|token|secret|api[_-]?key)["']?\s*[:=]\s*)(?:"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|(?:Bearer\s+)?[^\s,;"'}]+)/gi, '$1[redacted]')
      .replace(/\bBearer\s+[^\s,;"']+/gi, 'Bearer [redacted]').slice(0, limit)
  } catch (_) { return '[unreadable]' }
}

export function normalizeError(error, context = {}) {
  try {
    const result = { kind: text(context.kind || 'runtime', 80), message: text(error?.message ?? error, 1000) }
    if (error?.stack) result.stack = text(error.stack, 4000)
    if (context.url) result.url = text(context.url, 500).split(/[?#]/)[0]
    if (Number.isFinite(context.line)) result.line = context.line
    if (Number.isFinite(context.column)) result.column = context.column
    if (context.context) result.context = text(context.context, 500)
    return result
  } catch (_) { return { kind: 'runtime', message: '[unreadable]' } }
}
