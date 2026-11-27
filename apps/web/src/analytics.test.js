import test from 'node:test'
import assert from 'node:assert/strict'
import { createAnalytics, HOST_ACTIVE_EVENT, installAnalytics, trackPlay, reportError, normalizeError } from './analytics.js'

const ENDPOINT = 'https://stats.example.com/collect'
const GAME = { kind: 'j2me', file: 'snake.jar', name: '贪吃蛇', local: false }

function fakeWindow({ storage = new Map(), host, search = '', fetchOk = true, beaconOk = true } = {}) {
  const listeners = {}
  const docListeners = {}
  const posts = []
  const beacons = []
  let clock = 1_000_000
  let monotonic = 0
  let interval = null
  const timeouts = []
  const win = {
    __XIAOCHAO_RN_HOST__: host,
    location: { search },
    localStorage: {
      getItem: (key) => (storage.has(key) ? storage.get(key) : null),
      setItem: (key, value) => storage.set(key, String(value)),
      removeItem: (key) => storage.delete(key),
    },
    document: {
      visibilityState: 'visible',
      addEventListener: (type, fn) => { docListeners[type] = fn },
    },
    addEventListener: (type, fn) => { listeners[type] = fn },
    setInterval: (fn) => { interval = fn; return 1 },
    clearInterval: () => { interval = null },
    setTimeout: (fn) => timeouts.push(fn),
    clearTimeout: (id) => { timeouts[id - 1] = null },
    AbortController,
    fetch: async (url, init) => {
      posts.push({ url, init, body: JSON.parse(init.body) })
      if (fetchOk === 'throw') throw new TypeError('Failed to fetch')
      return { ok: fetchOk }
    },
    navigator: { sendBeacon: (url, blob) => { beacons.push({ url, blob }); return beaconOk } },
    Blob: class { constructor(parts, options) { this.text = parts.join(''); this.type = options.type } },
  }
  const env = {
    win,
    storage,
    posts,
    beacons,
    now: () => clock,
    elapsed: () => monotonic,
    advance: (ms) => { clock += ms; monotonic += ms },
    setDeviceClock: (ms) => { clock = ms },
    runTimeouts: () => timeouts.splice(0).forEach((fn) => fn?.()),
    tick: () => interval?.(),
    hide: () => { win.document.visibilityState = 'hidden'; docListeners.visibilitychange() },
    show: () => { win.document.visibilityState = 'visible'; docListeners.visibilitychange() },
    hostActive: (active) => listeners[HOST_ACTIVE_EVENT]({ detail: active }),
    pagehide: () => listeners.pagehide(),
    online: () => listeners.online(),
  }
  return env
}

const settle = () => new Promise((resolve) => setImmediate(resolve))
const events = (posts) => posts.flatMap((post) => post.body.events)

function start(env) {
  const analytics = createAnalytics({ endpoint: ENDPOINT, win: env.win, now: env.now, elapsed: env.elapsed, heartbeatMs: 30_000 })
  analytics.start()
  return analytics
}

test('a web device keeps one random id across launches and reports the app opening', async () => {
  const env = fakeWindow()
  start(env)
  await settle()
  const [post] = env.posts
  assert.equal(post.url, ENDPOINT)
  assert.equal(post.init.method, 'POST')
  // A CORS simple request: no preflight before each batch.
  assert.equal(post.init.headers['Content-Type'], 'text/plain;charset=UTF-8')
  assert.equal(post.init.credentials, 'omit')
  assert.equal(Object.hasOwn(post.init, 'keepalive'), false)
  assert.equal(post.body.v, 1)
  assert.equal(post.body.platform, 'web')
  assert.match(post.body.device_id, /\S{8,}/)
  assert.deepEqual(post.body.events.map((event) => event.type), ['app_open'])

  const again = fakeWindow({ storage: env.storage })
  start(again)
  await settle()
  assert.equal(again.posts[0].body.device_id, post.body.device_id)
  assert.notEqual(again.posts[0].body.events[0].session_id, post.body.events[0].session_id)
})

test('in the APK the app host id and platform are used instead of browser storage', async () => {
  const env = fakeWindow({ host: { deviceId: '3f2b8c1e-0d4a-4b6e-9a7c-1e2d3f4a5b6c', platform: 'android' } })
  start(env)
  await settle()
  assert.equal(env.posts[0].body.device_id, '3f2b8c1e-0d4a-4b6e-9a7c-1e2d3f4a5b6c')
  assert.equal(env.posts[0].body.platform, 'android')
  assert.equal(env.storage.has('xiaochao-device-id'), false)
})

test('in the APK nothing is sent or stored under a page id before the app host gives its id', async () => {
  const env = fakeWindow({ search: '?host=rn', fetchOk: 'throw' })
  start(env)
  await settle()
  env.pagehide()
  assert.equal(env.posts.length, 0)
  assert.equal(env.beacons.length, 0)
  assert.equal(env.storage.has('xiaochao-device-id'), false)
  assert.equal(JSON.parse(env.storage.get('xiaochao-analytics-queue')).length, 1)

  env.win.__XIAOCHAO_RN_HOST__ = { deviceId: '3f2b8c1e-0d4a-4b6e-9a7c-1e2d3f4a5b6c', platform: 'android' }
  env.online()
  await settle()
  assert.equal(env.posts[0].body.device_id, '3f2b8c1e-0d4a-4b6e-9a7c-1e2d3f4a5b6c')
  assert.deepEqual(env.posts[0].body.events.map((event) => event.type), ['app_open'])
})

test('a device clock change does not change the play time', async () => {
  const env = fakeWindow()
  const analytics = start(env)
  const end = analytics.startPlay(GAME)
  await settle()
  env.advance(10_000.4)
  env.setDeviceClock(0) // the clock is set back by hours
  env.advance(4_999.6)
  end()
  await settle()
  const ends = events(env.posts).filter((event) => event.type === 'game_end')
  assert.equal(ends[0].active_ms, 15_000)
})

test('a request that never settles is given up so later flushes still go out', async () => {
  const env = fakeWindow()
  env.win.fetch = (url, init) => new Promise((resolve, reject) => {
    env.posts.push({ url, init, body: JSON.parse(init.body) })
    init.signal.addEventListener('abort', () => reject(init.signal.reason))
  })
  const analytics = start(env)
  await settle()
  analytics.flush()
  assert.equal(env.posts.length, 1) // the first one is still pending
  env.runTimeouts()
  await settle()
  analytics.flush()
  assert.equal(env.posts.length, 2)
})

test('play time counts only the time the game is in front', async () => {
  const env = fakeWindow()
  const analytics = start(env)
  const end = analytics.startPlay(GAME)
  await settle()

  env.advance(30_000)
  env.tick()
  await settle()
  env.advance(5_000)
  env.hide()
  env.advance(600_000) // ten minutes away from the page
  env.tick() // a throttled timer firing while hidden adds nothing
  env.show()
  await settle()
  env.advance(30_000)
  env.hostActive(false) // the APK went to the background without hiding the page
  env.advance(120_000)
  env.hostActive(true)
  await settle()
  env.advance(12_000)
  end()
  await settle()

  const sent = [...new Map(events(env.posts).concat(env.beacons.flatMap((beacon) => JSON.parse(beacon.blob.text).events)).map((event) => [event.id, event])).values()]
  const plays = sent.filter((event) => event.play_id).sort((a, b) => a.ts - b.ts)
  assert.equal(new Set(sent.map((event) => event.id)).size, sent.length)
  assert.equal(new Set(plays.map((event) => event.play_id)).size, 1)
  assert.deepEqual(plays[0].game, { kind: 'j2me', file: 'snake.jar', name: '贪吃蛇', local: false })
  assert.equal(plays[0].type, 'game_start')
  assert.equal(plays.at(-1).type, 'game_end')
  assert.equal(plays.reduce((sum, event) => sum + (event.active_ms || 0), 0), 30_000 + 5_000 + 30_000 + 12_000)
})

test('events the endpoint did not take stay queued, survive a reload and are sent later', async () => {
  const env = fakeWindow({ fetchOk: 'throw' })
  const analytics = start(env)
  analytics.startPlay(GAME)()
  await settle()
  const queued = JSON.parse(env.storage.get('xiaochao-analytics-queue'))
  assert.deepEqual(queued.map((event) => event.type), ['app_open', 'game_start', 'game_end'])

  const refused = fakeWindow({ storage: env.storage, fetchOk: false })
  start(refused)
  await settle()
  assert.equal(JSON.parse(env.storage.get('xiaochao-analytics-queue')).length, 4)

  const later = fakeWindow({ storage: env.storage })
  start(later)
  await settle()
  assert.deepEqual(events(later.posts).map((event) => event.type), ['app_open', 'game_start', 'game_end', 'app_open', 'app_open'])
  assert.equal(new Set(events(later.posts).map((event) => event.id)).size, 5)
  assert.equal(env.storage.has('xiaochao-analytics-queue'), false)
})

test('a backlog goes out batch after batch once the endpoint takes it', async () => {
  const env = fakeWindow({ fetchOk: 'throw' })
  const analytics = start(env)
  for (let i = 0; i < 60; i++) analytics.startPlay(GAME)
  await settle()
  assert.equal(JSON.parse(env.storage.get('xiaochao-analytics-queue')).length, 120) // app_open + 60 starts + 59 ends
  env.win.fetch = async (url, init) => { env.posts.push({ url, init, body: JSON.parse(init.body) }); return { ok: true } }
  env.posts.length = 0
  env.online()
  for (let i = 0; i < 5; i++) await settle()
  assert.deepEqual(env.posts.map((post) => post.body.events.length), [50, 50, 20])
  assert.equal(env.storage.has('xiaochao-analytics-queue'), false)
})

test('reconnecting sends what was queued offline', async () => {
  const env = fakeWindow({ fetchOk: 'throw' })
  start(env)
  await settle()
  env.win.fetch = async (url, init) => { env.posts.push({ url, init, body: JSON.parse(init.body) }); return { ok: true } }
  env.online()
  await settle()
  assert.equal(env.storage.has('xiaochao-analytics-queue'), false)
})

test('beacon acceptance retains the queue until fetch confirms HTTP success', async () => {
  const env = fakeWindow({ fetchOk: 'throw' })
  const analytics = start(env)
  analytics.startPlay(GAME)
  await settle()
  env.advance(8_000)
  env.pagehide()
  const beacon = JSON.parse(env.beacons[0].blob.text)
  assert.equal(env.beacons[0].url, ENDPOINT)
  assert.equal(env.beacons[0].blob.type, 'text/plain;charset=UTF-8')
  assert.deepEqual(beacon.events.map((event) => event.type), ['app_open', 'game_start', 'heartbeat'])
  assert.equal(beacon.events[2].active_ms, 8_000)
  assert.equal(JSON.parse(env.storage.get('xiaochao-analytics-queue')).length, 3)
  env.win.fetch = async (url, init) => { env.posts.push({ body: JSON.parse(init.body) }); return { ok: true } }
  env.online()
  await settle()
  assert.equal(env.storage.has('xiaochao-analytics-queue'), false)

  const refused = fakeWindow({ fetchOk: 'throw', beaconOk: false })
  start(refused)
  await settle()
  refused.pagehide()
  assert.equal(JSON.parse(refused.storage.get('xiaochao-analytics-queue')).length, 1)
})

test('without an endpoint nothing is collected', () => {
  installAnalytics('')
  assert.equal(typeof trackPlay(GAME), 'function')
  assert.equal(trackPlay(GAME)(), undefined)
  assert.doesNotThrow(() => reportError(new Error('disabled')))
})

test('client errors share the durable queue, session and current play', async () => {
  const env = fakeWindow({ fetchOk: false })
  const analytics = start(env)
  analytics.startPlay(GAME)
  analytics.reportError({ kind: 'runtime', message: 'failed' })
  await settle()
  const queue = JSON.parse(env.storage.get('xiaochao-analytics-queue'))
  const error = queue.at(-1)
  assert.equal(error.type, 'client_error')
  assert.equal(error.session_id, queue[0].session_id)
  assert.equal(error.play_id, queue[1].play_id)
  assert.deepEqual(error.game, GAME)
  assert.equal(error.error.message, 'failed')
})

test('long multibyte errors drain in ordered byte-budgeted batches after reconnecting', async () => {
  const env = fakeWindow({ fetchOk: 'throw' })
  const analytics = start(env)
  for (let i = 0; i < 60; i++) {
    analytics.reportError({ kind: 'runtime', message: '中文😀'.repeat(200), stack: '中文😀'.repeat(800) })
  }
  await settle()
  const queued = JSON.parse(env.storage.get('xiaochao-analytics-queue'))
  env.pagehide()
  const beaconBody = env.beacons[0].blob.text
  assert.ok(Buffer.byteLength(beaconBody, 'utf8') <= 48 * 1024)
  assert.ok(JSON.parse(beaconBody).events.length < 50)
  assert.deepEqual(JSON.parse(env.storage.get('xiaochao-analytics-queue')), queued)
  env.posts.length = 0
  env.win.fetch = async (url, init) => { env.posts.push({ init, body: JSON.parse(init.body) }); return { ok: true } }
  env.online()
  await settle()
  assert.ok(env.posts.length > 1)
  for (const post of env.posts) {
    assert.ok(Buffer.byteLength(post.init.body, 'utf8') <= 48 * 1024)
    assert.ok(post.body.events.length <= 50)
  }
  assert.deepEqual(events(env.posts).map(event => event.id), queued.map(event => event.id))
  assert.equal(env.storage.has('xiaochao-analytics-queue'), false)
})

test('oversized corrupt persisted events cannot block valid events', async () => {
  const corrupt = { id: 'corrupt', error: { message: '😀'.repeat(50_000) } }
  const valid = { id: 'valid', type: 'client_error', error: { kind: 'runtime', message: 'ok' } }
  const storage = new Map([['xiaochao-analytics-queue', JSON.stringify([corrupt, valid])]])
  const env = fakeWindow({ storage })
  start(env)
  await settle()
  assert.deepEqual(events(env.posts).map(event => event.id).slice(0, 1), ['valid'])
  assert.equal(events(env.posts).some(event => event.id === 'corrupt'), false)
  assert.equal(storage.has('xiaochao-analytics-queue'), false)
})

test('credential text redaction covers quoted values and complete cookie headers', () => {
  const raw = '{"password":"test-private value","access_token":"test-token","client_secret":"test-secret","status":"ready"}\nCookie: theme=dark; session=test-session\nSet-Cookie: session=test-set; Path=/\nstatus=healthy'
  const result = normalizeError(raw).message
  for (const secret of ['test-private', 'value', 'test-token', 'test-secret', 'test-session', 'test-set']) assert.equal(result.includes(secret), false)
  assert.ok(result.includes('"status":"ready"'))
  assert.ok(result.includes('status=healthy'))
})
