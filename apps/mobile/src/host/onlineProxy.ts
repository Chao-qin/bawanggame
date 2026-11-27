// The installed app has no Node server, so the host answers the page's online requests itself. It serves the same
// paths and JSON as the desktop proxy (apps/server/src/java, apps/server/src/flash) and shares its page parsers. Native requests are
// not subject to CORS, which is why the page cannot fetch these sites directly. A downloaded game is written into
// the static web root and the page reads it back from the local server.
import { parseFlashArchiveDetail, parseFlashArchiveGames } from '../../../server/src/flash/flashCatalog'
import {
  allowedStoreUrl, isZipHeader, JAVA_DEFAULT_BASE, parseStoreCatalog, parseStoreDetail, storeCatalogQuery,
  storeCatalogUrl, storeDetailUrl, storeHosts, storeJarName, validStoreId,
} from '../../../server/src/java/javaCatalog'

export const DOWNLOADS_PATH = '/__downloads'
const FLASH_HOMES_BASE = 'https://flash.homes'
const FLASH_SWF_BASE = 'https://swf.flash.homes'
// The page keeps at most 64 MiB per game (apps/web/src/localFlash.js MAX_FLASH_BYTES). A JAR is read through a
// base64 copy in JS memory (see javaDownload), so it has a lower limit; 52emu JARs are a few MB at most.
const MAX_DOWNLOAD_BYTES = 64 * 1024 * 1024
const MAX_JAR_BYTES = 16 * 1024 * 1024
const SWF_SIGNATURES = new Set(['FWS', 'CWS', 'ZWS'])

export type OnlineResult = { status: number; body?: unknown; file?: string }

/** The file operations the proxy needs (react-native-fs in the app, a stub in tests). */
export type OnlineFiles = {
  mkdir(path: string): Promise<void>
  writeBase64(path: string, data: string): Promise<void>
  download(url: string, path: string): Promise<{ status: number; bytes: number }>
  head(path: string, length: number): Promise<number[]>
  unlink(path: string): Promise<void>
}

export type OnlineDeps = {
  fetch: (input: string, init?: { signal?: AbortSignal }) => Promise<Response>
  files: OnlineFiles
  /** Absolute directory of the static web root; downloads land in <webRoot>/__downloads. */
  webRoot: string
  blobToBase64(blob: Blob): Promise<string>
}

const json = (status: number, body: unknown): OnlineResult => ({ status, body })
// A deadline for one request (AbortSignal.timeout may be missing in the app's JS engine).
async function withDeadline<T>(ms: number, run: (signal: AbortSignal) => Promise<T>): Promise<T> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), ms)
  try { return await run(controller.signal) } finally { clearTimeout(timer) }
}

async function text(deps: OnlineDeps, url: URL | string, ms: number) {
  return withDeadline(ms, async (signal) => {
    const response = await deps.fetch(String(url), { signal })
    if (!response.ok) throw new Error(`HTTP ${response.status}`)
    return response.text()
  })
}

function safeName(value: string) {
  return value.replace(/[^\w.-]+/g, '_').slice(0, 80)
}

async function saveDownload(deps: OnlineDeps, name: string) {
  const dir = `${deps.webRoot}${DOWNLOADS_PATH}`
  await deps.files.mkdir(dir)
  return { path: `${dir}/${name}`, url: `${DOWNLOADS_PATH}/${encodeURIComponent(name)}` }
}

async function javaDownload(deps: OnlineDeps, id: string | null): Promise<OnlineResult> {
  if (!validStoreId(id)) return json(400, { error: 'invalid_game_id' })
  const detail = parseStoreDetail(await text(deps, storeDetailUrl(JAVA_DEFAULT_BASE, id), 10_000), id, JAVA_DEFAULT_BASE)
  if ('error' in detail) return json(404, { error: detail.error })
  const hosts = storeHosts(JAVA_DEFAULT_BASE)
  // 52emu answers download.php with an https -> http redirect to d2.52emu.cn. The native downloader does not follow a
  // protocol change, fetch does; the final URL is checked against the same allowlist as the desktop proxy.
  const source = allowedStoreUrl(detail.downloadUrl.href, hosts).href
  const blob = await withDeadline(60_000, async (signal) => {
    const response = await deps.fetch(source, { signal })
    if (response.url) allowedStoreUrl(response.url, hosts)
    if (!response.ok) throw new Error(`download HTTP ${response.status}`)
    if (Number(response.headers.get('content-length') || 0) > MAX_JAR_BYTES) return null
    return response.blob()
  })
  if (!blob || blob.size > MAX_JAR_BYTES) return json(413, { error: 'jar_too_large' })
  const target = await saveDownload(deps, `java-${id}.jar`)
  await deps.files.writeBase64(target.path, await deps.blobToBase64(blob))
  if (!isZipHeader(await deps.files.head(target.path, 4))) {
    await deps.files.unlink(target.path).catch(() => {})
    return json(415, { error: 'not_a_jar' })
  }
  return { status: 200, file: target.url, body: { name: storeJarName(detail.game) } }
}

async function flashDownload(deps: OnlineDeps, code: string): Promise<OnlineResult> {
  const game = parseFlashArchiveDetail(await text(deps, `${FLASH_HOMES_BASE}/flash/${code}`, 15_000), code)
  if (!game.sha256) return json(502, { error: 'flash_hash_unavailable' })
  if (game.size > MAX_DOWNLOAD_BYTES) return json(413, { error: 'flash_too_large' })
  const target = await saveDownload(deps, `flash-${safeName(code)}.swf`)
  const result = await deps.files.download(`${FLASH_SWF_BASE}/${game.sha256}.swf`, target.path)
  const signature = String.fromCharCode(...(result.status === 200 ? await deps.files.head(target.path, 3) : []))
  if (result.status !== 200 || result.bytes > MAX_DOWNLOAD_BYTES || !SWF_SIGNATURES.has(signature)) {
    await deps.files.unlink(target.path).catch(() => {})
    if (result.status !== 200) return json(502, { error: `flash download HTTP ${result.status}` })
    return json(result.bytes > MAX_DOWNLOAD_BYTES ? 413 : 415, { error: result.bytes > MAX_DOWNLOAD_BYTES ? 'flash_too_large' : 'not_a_swf' })
  }
  return { status: 200, file: target.url, body: { name: game.name } }
}

/** Answers one `/__52java/*` or `/__flash/*` request of the page. */
export async function handleOnlineRequest(path: string, deps: OnlineDeps): Promise<OnlineResult> {
  let url: URL
  try { url = new URL(path, 'http://host.invalid') } catch { return json(400, { error: 'invalid_path' }) }
  try {
    if (url.pathname === '/__52java/catalog') {
      const query = storeCatalogQuery(url.searchParams)
      const catalog = parseStoreCatalog(await text(deps, storeCatalogUrl(JAVA_DEFAULT_BASE, query), 10_000), query.page)
      return json(200, { source: JAVA_DEFAULT_BASE, siteUrl: JAVA_DEFAULT_BASE, ...catalog })
    }
    if (url.pathname === '/__52java/download') return await javaDownload(deps, url.searchParams.get('id'))
    if (url.pathname === '/__52java/open') return json(200, { url: JAVA_DEFAULT_BASE })
    if (url.pathname === '/__flash/catalog') {
      const query = (url.searchParams.get('query') || '').trim().slice(0, 120)
      const html = await text(deps, `${FLASH_HOMES_BASE}/flash${query ? `?q=${encodeURIComponent(query)}` : ''}`, 15_000)
      return json(200, { source: FLASH_HOMES_BASE, games: parseFlashArchiveGames(html) })
    }
    const flash = url.pathname.match(/^\/__flash\/(detail|download)\/([A-Z0-9-]+)$/i)
    if (flash) {
      const code = flash[2].toUpperCase()
      if (flash[1] === 'download') return await flashDownload(deps, code)
      return json(200, { source: FLASH_HOMES_BASE, game: parseFlashArchiveDetail(await text(deps, `${FLASH_HOMES_BASE}/flash/${code}`, 15_000), code) })
    }
    return json(404, { error: 'not_found' })
  } catch (error) {
    return json(502, { error: error instanceof Error ? error.message : String(error) })
  }
}
