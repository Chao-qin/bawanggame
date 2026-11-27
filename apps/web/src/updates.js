// Version check and announcements. Both come from the GitHub main branch (raw files, then the jsDelivr mirror),
// never from our own server, so polling costs this project no bandwidth.
const REPO = 'Chao-qin/bawanggame'
const SOURCES = [
  file => `https://raw.githubusercontent.com/${REPO}/main/${file}`,
  file => `https://cdn.jsdelivr.net/gh/${REPO}@main/${file}`,
]
export const APK_DOWNLOAD_URL = `https://github.com/${REPO}/releases/latest/download/xiaochao-bawang.apk`
export const CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000
const FETCH_TIMEOUT_MS = 8000
const MAX_ANNOUNCEMENTS = 3

/** Compares dotted numeric versions ("v1.2.0" == "1.2"); returns <0, 0 or >0. */
export function compareVersions(a, b) {
  const parts = value => String(value).trim().replace(/^v/i, '').split('.').map(part => Number.parseInt(part, 10) || 0)
  const left = parts(a)
  const right = parts(b)
  for (let i = 0; i < Math.max(left.length, right.length); i += 1) {
    const diff = (left[i] || 0) - (right[i] || 0)
    if (diff) return diff
  }
  return 0
}

function inWindow(value, now) {
  const start = value.start ? Date.parse(value.start) : Number.NaN
  const end = value.end ? Date.parse(value.end) : Number.NaN
  return !(start > now) && !(end < now)
}

/** Keeps well-formed announcements that are active now and not dismissed, in file order. */
export function parseAnnouncements(value, { now = Date.now(), dismissed = [] } = {}) {
  if (!Array.isArray(value)) return []
  const hidden = new Set(dismissed)
  return value
    .filter(item => item && typeof item.id === 'string' && item.id && typeof item.title === 'string' && item.title)
    .filter(item => !hidden.has(item.id) && inWindow(item, now))
    .slice(0, MAX_ANNOUNCEMENTS)
    .map(item => ({
      id: item.id,
      title: item.title.slice(0, 80),
      body: typeof item.body === 'string' ? item.body.slice(0, 300) : '',
      url: typeof item.url === 'string' && /^https:\/\//i.test(item.url) ? item.url : '',
    }))
}

async function fetchJson(file, fetcher) {
  let lastError
  for (const source of SOURCES) {
    // AbortSignal.timeout needs Chrome 103 and has no polyfill; WebViews from Chrome 87 must be served too.
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)
    try {
      const response = await fetcher(source(file), { cache: 'no-store', signal: controller.signal })
      if (!response.ok) throw new Error(`HTTP ${response.status}`)
      return await response.json()
    } catch (error) { lastError = error } finally { clearTimeout(timer) }
  }
  throw lastError
}

/** Latest version on main and its announcements; a part that cannot be fetched comes back null. */
export async function fetchRemoteMeta(fetcher = fetch) {
  const [pkg, announcements] = await Promise.allSettled([fetchJson('package.json', fetcher), fetchJson('announcements.json', fetcher)])
  return {
    version: pkg.status === 'fulfilled' && typeof pkg.value?.version === 'string' ? pkg.value.version : null,
    announcements: announcements.status === 'fulfilled' ? announcements.value : null,
  }
}
