const entries = new Map()
let nextSessionId = 1
const RUNTIME_VERSION = '20261123-4'
const DEFAULT_TIMEOUT_MS = 45_000

function versioned(src) {
  return `${src}${src.includes('?') ? '&' : '?'}v=${RUNTIME_VERSION}`
}

export function createRuntimeSession(timeoutMs = DEFAULT_TIMEOUT_MS) {
  let watchdog = null
  const session = {
    id: nextSessionId++,
    active: true,
    keys: new Set(),
    // Restarted whenever a resource of this session starts or finishes. The session times out only when
    // nothing has finished for timeoutMs, so a large script on a slow network is not failed while it and
    // the others are still downloading in parallel.
    touch() {
      clearTimeout(watchdog)
      watchdog = null
      if (!session.active || !session.keys.size || !Number.isFinite(timeoutMs)) return
      watchdog = setTimeout(() => {
        for (const key of Array.from(session.keys)) entries.get(key)?.timeout()
      }, timeoutMs)
    },
    invalidate() {
      if (!session.active) return
      session.active = false
      clearTimeout(watchdog)
      for (const key of Array.from(session.keys)) {
        const entry = entries.get(key)
        if (entry?.session === session) entry.cancel()
      }
      session.keys.clear()
    },
  }
  return session
}

const globalSession = createRuntimeSession(Number.POSITIVE_INFINITY)

function sessionFor(value) {
  return value || globalSession
}

function loadResource(kind, src, sessionValue, createElement) {
  const session = sessionFor(sessionValue)
  if (!session.active) return Promise.reject(new Error('运行时已退出'))
  const url = versioned(src)
  const key = `${session.id}:${kind}:${url}`
  const previous = entries.get(key)
  if (previous) return previous.promise

  let element = null
  let settled = false
  let resolvePromise
  let rejectPromise
  const promise = new Promise((resolve, reject) => {
    resolvePromise = resolve
    rejectPromise = reject
  })
  const settle = (error) => {
    if (settled) return
    settled = true
    session.keys.delete(key)
    if (entries.get(key) === entry) entries.delete(key)
    session.touch()
    if (error) rejectPromise(error)
    else resolvePromise()
  }
  const entry = {
    session,
    promise,
    cancel() {
      settle(new Error('运行时已退出'))
      element?.remove()
    },
    timeout() {
      settle(new Error(`运行时资源加载超时: ${src}`))
      element?.remove()
    },
  }

  entries.set(key, entry)
  session.keys.add(key)
  element = createElement(url, () => {
    if (!session.active) return settle(new Error('运行时已退出'))
    settle()
  }, () => settle(new Error(`加载运行时失败: ${src}`)))
  element.dataset.runtimeSession = String(session.id)
  session.touch()
  document.head.appendChild(element)
  return promise
}

export function loadClassic(src, session) {
  return loadResource('script', src, session, (url, onLoad, onError) => {
    const script = document.createElement('script')
    script.src = url
    script.async = false
    script.onload = onLoad
    script.onerror = onError
    script.dataset.runtimeScript = url
    return script
  })
}

export function loadStyle(href, session) {
  return loadResource('style', href, session, (url, onLoad, onError) => {
    const link = document.createElement('link')
    link.rel = 'stylesheet'
    link.href = url
    link.dataset.runtimeStyle = url
    link.onload = onLoad
    link.onerror = onError
    return link
  })
}

// All scripts download in parallel and still execute in list order (dynamic scripts with async = false).
// Resolves after the last one ran; rejects with the first failure in list order.
export async function loadClassicInOrder(sources, session, onProgress) {
  const pending = sources.map((src) => loadClassic(src, session))
  // Later failures (a timeout or exit cancels every pending script) are reported through the first one.
  pending.forEach((promise) => promise.catch(() => {}))
  for (let index = 0; index < pending.length; index++) {
    await pending[index]
    onProgress?.(index + 1, pending.length)
  }
}
