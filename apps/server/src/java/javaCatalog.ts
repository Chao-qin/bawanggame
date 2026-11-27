// 52emu (java.52emu.cn) page parsing shared by the desktop Node proxy and the Android host, which requests the
// same pages natively. Pure functions: no I/O, no Node-only APIs.

export type StoreGame = { id: string; name: string; plays: number }
export type StoreCatalog = { games: StoreGame[]; page: number; pages: number; total: number }
export type StoreCatalogQuery = { page: number; query: string; category: string; force: boolean }

export const JAVA_DEFAULT_BASE = 'https://java.52emu.cn'
export const JAVA_MAX_PAGE = 371

export function htmlText(value: string) {
  return value.replace(/<[^>]*>/g, '').replace(/&nbsp;|&#160;/gi, ' ').replace(/&amp;/gi, '&').replace(/&lt;/gi, '<').replace(/&gt;/gi, '>').replace(/&quot;/gi, '"').replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n))).trim()
}

/** The catalog query of a `/__52java/catalog` request, clamped to what 52emu accepts. */
export function storeCatalogQuery(params: URLSearchParams): StoreCatalogQuery {
  return {
    page: Math.min(JAVA_MAX_PAGE, Math.max(1, Number(params.get('page')) || 1)),
    query: (params.get('query') || '').trim().slice(0, 80),
    category: (params.get('category') || '').replace(/\D/g, '').slice(0, 2),
    force: params.get('refresh') === '1',
  }
}

export function storeCatalogUrl(base: string, options: Pick<StoreCatalogQuery, 'page' | 'query' | 'category'>) {
  const url = new URL('/index.php', base)
  if (options.query) {
    url.searchParams.set('nkey', options.query)
    url.searchParams.set('qiqi', '搜索游戏')
  } else if (!options.category) {
    // 52emu ignores nsort when q=all is present.
    url.searchParams.set('q', 'all')
  }
  if (options.category) url.searchParams.set('nsort', options.category)
  url.searchParams.set('p', String(options.page))
  return url
}

/** Parses a catalog page; throws when the page is not the catalog markup this parser knows. */
export function parseStoreCatalog(html: string, page: number): StoreCatalog {
  if (!html.includes('id="results"') && !html.includes("id='results'")) throw new Error('52emu catalog markup was not recognized')
  const start = html.search(/<div\s+id=["']results["'][^>]*>/i)
  const tail = start < 0 ? '' : html.slice(start)
  const end = tail.indexOf('</div>\n<script')
  const results = end < 0 ? '' : tail.slice(0, end)
  const games: StoreGame[] = []
  for (const match of results.matchAll(/<a\s+[^>]*href=["']game\.php\?id=(\d+)["'][^>]*>([\s\S]*?)<\/a>\s*\((\d+)\)/gi)) {
    games.push({ id: match[1], name: htmlText(match[2]), plays: Number(match[3]) })
  }
  const pages = Number(results.match(/共\s*(\d+)\s*页/)?.[1] ?? 1)
  const total = Number(results.match(/共\s*\d+\s*页\s*(\d+)\s*条/)?.[1] ?? games.length)
  return { games, page, pages: Math.max(1, pages), total }
}

export function validStoreId(id: string | null): id is string {
  return typeof id === 'string' && /^\d{1,8}$/.test(id)
}

export function storeDetailUrl(base: string, id: string) {
  const url = new URL('/game.php', base)
  url.searchParams.set('id', id)
  return url
}

/** The game title and its download link on a game detail page, or the error the proxy answers with. */
export function parseStoreDetail(html: string, id: string, base: string): { game: StoreGame; downloadUrl: URL } | { error: 'game_not_found' | 'download_not_found' } {
  const titleMarkup = html.match(/<div\s+class=["']results["'][^>]*>\s*<h2>([\s\S]*?)<\/h2>/i)?.[1] ?? ''
  const name = htmlText(titleMarkup.split(/\s*\[<a\b/i)[0])
  if (!name) return { error: 'game_not_found' }
  const download = html.match(/href=["']download\.php\?id=(\d+)&amp;xid=(\d+)["']/i)
  if (!download || download[1] !== id) return { error: 'download_not_found' }
  const downloadUrl = new URL('/download.php', base)
  downloadUrl.searchParams.set('id', id)
  downloadUrl.searchParams.set('xid', download[2])
  return { game: { id, name, plays: 0 }, downloadUrl }
}

/** Hosts a 52emu download may come from (download.php redirects to d2.52emu.cn). */
export function storeHosts(base: string) {
  const host = new URL(base).hostname
  return new Set([host, ...(host === 'java.52emu.cn' ? ['d2.52emu.cn'] : [])])
}

export function allowedStoreUrl(raw: string, hosts: Set<string>) {
  const url = new URL(raw)
  if (!['https:', 'http:'].includes(url.protocol) || !hosts.has(url.hostname) || url.username || url.password || url.port) throw new Error('source is outside 52emu allowlist')
  return url
}

export function storeJarName(game: StoreGame) {
  const baseName = (game.name || game.id).replace(/[^\w一-鿿.-]+/g, '_').slice(0, 80) || game.id
  return baseName.toLowerCase().endsWith('.jar') ? baseName : `${baseName}.jar`
}

/** A JAR is a ZIP: it starts with the local file header signature PK\x03\x04. */
export function isZipHeader(bytes: ArrayLike<number>) {
  return bytes.length >= 4 && bytes[0] === 0x50 && bytes[1] === 0x4b && bytes[2] === 0x03 && bytes[3] === 0x04
}
