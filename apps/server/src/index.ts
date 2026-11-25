import { createReadStream, promises as fs } from 'node:fs'
import { createServer, IncomingMessage, ServerResponse } from 'node:http'
import { connect as tcpConnect } from 'node:net'
import crypto from 'node:crypto'
import { networkInterfaces } from 'node:os'
import { connect as tlsConnect } from 'node:tls'
import { extname, join, normalize, resolve, sep } from 'node:path'
import { URL } from 'node:url'
import { createGzip } from 'node:zlib'
import { WebSocketServer, WebSocket } from 'ws'
import yauzl from 'yauzl'
import { parseFlashArchiveDetail, parseFlashArchiveGames, type FlashArchiveGame } from './flashCatalog.js'
import { allowedStoreUrl, isZipHeader, JAVA_DEFAULT_BASE, parseStoreCatalog, parseStoreDetail, storeCatalogQuery, storeCatalogUrl, storeDetailUrl, storeHosts, storeJarName, validStoreId, type StoreCatalog, type StoreCatalogQuery, type StoreGame } from './javaCatalog.js'

const PROJECT = resolve(import.meta.dirname, '../../..')
const defaultPort = process.env.NODE_ENV === 'production' ? 8080 : 8000
const PORT = Number(process.env.PORT ?? defaultPort)
const JAVA_BASE = (process.env['52JAVA_BASE_URL'] ?? JAVA_DEFAULT_BASE).replace(/\/$/, '')
const JAVA_HOSTS = storeHosts(JAVA_BASE)
const JAVA_MAX_BYTES = Number(process.env['52JAVA_MAX_BYTES'] ?? 64 * 1024 * 1024)
const FLASH_HOMES_BASE = (process.env.FLASH_HOMES_BASE_URL ?? 'https://flash.homes').replace(/\/$/, '')
const FLASH_MAX_BYTES = Number(process.env.FLASH_MAX_BYTES ?? 128 * 1024 * 1024)
const JARS = join(PROJECT, 'games', 'jar')
const WEB = join(PROJECT, 'public')
const MRP = join(PROJECT, 'maopao-revival', 'vendor', 'vmrp.github.io')
const J2ME = join(PROJECT, 'runtime', 'j2me')
const MRPRUNTIME = join(PROJECT, 'runtime', 'mrp')
const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.png': 'image/png', '.svg': 'image/svg+xml', '.wasm': 'application/wasm',
  '.jar': 'application/java-archive', '.mrp': 'application/octet-stream',
}

const storeCache = new Map<string, { expires: number; value: StoreCatalog }>()
const flashArchiveCache = new Map<string, { expires: number; value: FlashArchiveGame[] }>()

function json(res: ServerResponse, status: number, value: unknown) {
  res.writeHead(status, {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-cache',
  })
  res.end(JSON.stringify(value))
}

async function flashHomesPage(path: string) {
  const response = await fetch(new URL(path, FLASH_HOMES_BASE), { signal: AbortSignal.timeout(15_000) })
  if (!response.ok) throw new Error(`flash.homes HTTP ${response.status}`)
  return response.text()
}

async function flashArchiveCatalog(query: string) {
  const key = query.trim()
  const cached = flashArchiveCache.get(key)
  if (cached && cached.expires > Date.now()) return cached.value
  const html = await flashHomesPage(`/flash${key ? `?q=${encodeURIComponent(key)}` : ''}`)
  const games = parseFlashArchiveGames(html)
  flashArchiveCache.set(key, { expires: Date.now() + 60_000, value: games })
  return games
}

async function storeCatalog(options: StoreCatalogQuery): Promise<StoreCatalog> {
  const key = `${options.page}:${options.query}:${options.category}`
  const cached = storeCache.get(key)
  if (!options.force && cached && cached.expires > Date.now()) return cached.value
  const response = await fetch(storeCatalogUrl(JAVA_BASE, options), { signal: AbortSignal.timeout(10_000) })
  if (!response.ok) throw new Error(`catalog HTTP ${response.status}`)
  const value = parseStoreCatalog(await response.text(), options.page)
  storeCache.set(key, { expires: Date.now() + 60_000, value })
  return value
}

async function storeDownload(res: ServerResponse, id: string) {
  if (!validStoreId(id)) return json(res, 400, { error: 'invalid_game_id' })
  try {
    const detailResponse = await fetch(storeDetailUrl(JAVA_BASE, id), { signal: AbortSignal.timeout(10_000) })
    if (!detailResponse.ok) return json(res, 502, { error: `game detail HTTP ${detailResponse.status}` })
    const detail = parseStoreDetail(await detailResponse.text(), id, JAVA_BASE)
    if ('error' in detail) return json(res, 404, { error: detail.error })
    const { game, downloadUrl } = detail
    const source = allowedStoreUrl(downloadUrl.toString(), JAVA_HOSTS)
    const response = await fetch(source, { signal: AbortSignal.timeout(30_000), redirect: 'manual' })
    if (response.status >= 300 && response.status < 400) {
      const redirect = response.headers.get('location')
      if (!redirect) return json(res, 502, { error: 'invalid_download_redirect' })
      const target = allowedStoreUrl(new URL(redirect, source).toString(), JAVA_HOSTS)
      const redirected = await fetch(target, { signal: AbortSignal.timeout(30_000), redirect: 'manual' })
      if (redirected.status >= 300 && redirected.status < 400) return json(res, 502, { error: 'too_many_download_redirects' })
      return await streamStoreResponse(res, game, redirected)
    }
    return await streamStoreResponse(res, game, response)
  } catch (error) { return json(res, 502, { error: String(error instanceof Error ? error.message : error) }) }
}

async function streamStoreResponse(res: ServerResponse, game: StoreGame, response: Response) {
    if (!response.ok || !response.body) return json(res, 502, { error: `download HTTP ${response.status}` })
    const contentType = response.headers.get('content-type') || ''
    const length = Number(response.headers.get('content-length') || 0)
    if (length > JAVA_MAX_BYTES) return json(res, 413, { error: 'jar_too_large' })
    const reader = response.body.getReader()
    const prefix: Uint8Array[] = []
    let prefixLength = 0
    while (prefixLength < 4) {
      const part = await reader.read()
      if (part.done || !part.value) return json(res, 415, { error: `not_a_jar (${contentType})` })
      prefix.push(part.value)
      prefixLength += part.value.byteLength
    }
    if (!isZipHeader(Buffer.concat(prefix.map(part => Buffer.from(part))))) return json(res, 415, { error: `not_a_jar (${contentType})` })
    const encodedName = encodeURIComponent(storeJarName(game))
    res.writeHead(200, {
      'Access-Control-Allow-Origin': '*',
      'Content-Type': 'application/java-archive',
      ...(length ? { 'Content-Length': String(length) } : {}),
      'Content-Disposition': `attachment; filename*=UTF-8''${encodedName}`,
      'Cache-Control': 'no-store',
    })
    let total = 0
    const writeChunk = async (chunk: Uint8Array) => {
      total += chunk.byteLength
      if (total > JAVA_MAX_BYTES) {
        await reader.cancel()
        res.destroy()
        return false
      }
      if (!res.write(Buffer.from(chunk))) await new Promise<void>(resolve => res.once('drain', resolve))
      return true
    }
    for (const part of prefix) if (!(await writeChunk(part))) return
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      if (!(await writeChunk(value))) return
    }
    res.end()
}

function safePath(urlPath: string) {
  const decoded = decodeURIComponent(urlPath.split('?')[0])
  const relative = decoded.replace(/^\/+/, '')
  const target = resolve(PROJECT, relative)
  if (target !== PROJECT && !target.startsWith(PROJECT + sep)) return null
  return target
}

function safeWebPath(urlPath: string) {
  const decoded = decodeURIComponent(urlPath.split('?')[0])
  const target = resolve(WEB, decoded.replace(/^\/+/, ''))
  if (target !== WEB && !target.startsWith(WEB + sep)) return null
  return target
}

function mappedPath(urlPath: string) {
  const path = decodeURIComponent(urlPath.split('?')[0]).replace(/^\/+/, '')
  const aliases: Array<[string, string]> = [
    ['bld/', join(J2ME, 'bld') + sep], ['config/', join(J2ME, 'config') + sep],
    ['java/', join(J2ME, 'java') + sep], ['libs/', join(J2ME, 'libs') + sep],
    ['style/', join(J2ME, 'style') + sep], ['jar/', JARS + sep],
    ['maopao/', MRP + sep], ['runtime/j2me/', J2ME + sep], ['runtime/mrp/', MRPRUNTIME + sep],
  ]
  for (const [prefix, base] of aliases) {
    if (path.startsWith(prefix)) {
      const target = resolve(base, path.slice(prefix.length))
      if (target === base.slice(0, -1) || target.startsWith(base)) return target
      return null
    }
  }
  const runtimeFiles = new Set(['btroom.js', 'compat.html', 'debug-graphics.js', 'debug-native.js', 'files.js', 'keymap.js', 'keypad-canvas.js', 'layout.js', 'panel.js', 'runtime-extras.js', 'screen.js', 'touch-layout.js', 'touchpad.js', 'ui-feedback.js'])
  if (runtimeFiles.has(path)) return join(J2ME, path)
  if (path === 'mrp-runtime.js') return join(MRPRUNTIME, path)
  return safeWebPath(urlPath)
}

// .uc2 / .ext are the MRP runtime's bitmap fonts and native library (vmrp_v1.0/fs): ~3.6MB that gzip to ~0.9MB and
// are fetched on every MRP launch. JARs, MRPs and images are already compressed.
const COMPRESSIBLE = new Set(['.html', '.js', '.css', '.json', '.svg', '.wasm', '.uc2', '.ext'])

// Names that change whenever their content does: Vite's hashed bundles (/assets/), Ruffle's hashed core and wasm
// (/ruffle/, staged by apps/web/scripts/stage-flash-assets.mjs) and runtime scripts requested with the runtime
// version (?v=, apps/web/src/runtime/loadScript.js; /ruffle/ruffle.js is one of them). Bump RUNTIME_VERSION whenever
// a runtime script changes or Ruffle is upgraded. The browser may keep these without revalidating — a launch
// otherwise spends one round trip per runtime file on 304s.
const HASHED_RUFFLE = /^\/ruffle\/(core\.ruffle\.[0-9a-f]{16,}\.js|[0-9a-f]{16,}\.wasm)$/
function immutableRequest(url: URL) {
  return url.searchParams.has('v') || url.pathname.startsWith('/assets/') || HASHED_RUFFLE.test(url.pathname)
}

async function sendFile(req: IncomingMessage, res: ServerResponse, target: string, immutable = false) {
  try {
    const stat = await fs.stat(target)
    if (!stat.isFile()) return false
    // no-cache keeps every other request revalidated; the ETag turns an unchanged runtime file into a 304 instead
    // of a full download (the J2ME runtime is several MB of scripts loaded on every game launch).
    const etag = `W/"${stat.size.toString(16)}-${Math.floor(stat.mtimeMs).toString(16)}"`
    const headers: Record<string, string> = {
      'Content-Type': MIME[extname(target)] ?? 'application/octet-stream',
      'Cache-Control': immutable ? 'public, max-age=31536000, immutable' : 'no-cache',
      ETag: etag,
      Vary: 'Accept-Encoding',
    }
    if (req.headers['if-none-match'] === etag) {
      res.writeHead(304, headers).end()
      return true
    }
    const gzip = COMPRESSIBLE.has(extname(target)) && /\bgzip\b/.test(String(req.headers['accept-encoding'] ?? ''))
    if (gzip) headers['Content-Encoding'] = 'gzip'
    else headers['Content-Length'] = String(stat.size)
    res.writeHead(200, headers)
    const file = createReadStream(target)
    file.on('error', () => res.destroy())
    if (gzip) file.pipe(createGzip()).pipe(res)
    else file.pipe(res)
    return true
  } catch { return false }
}

function manifestInfo(file: string) {
  return new Promise<{ name: string; suiteName: string; vendor: string; version: string; icon: string } | null>((done) => {
    yauzl.open(file, { lazyEntries: true }, (err, zip) => {
      if (err || !zip) return done(null)
      zip.readEntry()
      zip.on('entry', entry => {
        if (entry.fileName !== 'META-INF/MANIFEST.MF') return zip.readEntry()
        zip.openReadStream(entry, (streamErr, stream) => {
          if (streamErr || !stream) return done(null)
          const chunks: Buffer[] = []
          stream.on('data', c => chunks.push(c))
          stream.on('end', () => {
            const attrs: Record<string, string> = {}
            for (const line of Buffer.concat(chunks).toString('utf8').replace(/\r?\n /g, '').split(/\r?\n/)) {
              const i = line.indexOf(':')
              if (i > 0) attrs[line.slice(0, i).trim()] = line.slice(i + 1).trim()
            }
            const midlet = (attrs['MIDlet-1'] ?? '').split(',')
            const suiteName = attrs['MIDlet-Name'] || midlet[0]?.trim()
            done({ name: midlet[0]?.trim() || suiteName || file.split('/').pop()!.replace(/\.jar$/i, ''), suiteName, vendor: attrs['MIDlet-Vendor'] ?? '', version: attrs['MIDlet-Version'] ?? '', icon: attrs['MIDlet-Icon'] || midlet[1]?.trim() || '' })
          })
        })
      })
      zip.on('end', () => done(null))
      zip.on('error', () => done(null))
    })
  })
}

function zipEntry(file: string, wanted: string) {
  return new Promise<Buffer | null>((done) => {
    yauzl.open(file, { lazyEntries: true }, (err, zip) => {
      if (err || !zip) return done(null)
      zip.readEntry()
      zip.on('entry', entry => {
        if (entry.fileName !== wanted) return zip.readEntry()
        zip.openReadStream(entry, (streamErr, stream) => {
          if (streamErr || !stream) return done(null)
          const chunks: Buffer[] = []
          stream.on('data', c => chunks.push(c))
          stream.on('end', () => done(Buffer.concat(chunks)))
          stream.on('error', () => done(null))
        })
      })
      zip.on('end', () => done(null))
      zip.on('error', () => done(null))
    })
  })
}

async function jars(res: ServerResponse) {
  const names = (await fs.readdir(JARS)).filter(n => n.toLowerCase().endsWith('.jar')).sort()
  const items = []
  for (const name of names) {
    const info = await manifestInfo(join(JARS, name))
    if (info) items.push({ ...info, file: name, icon: Boolean(info.icon) })
  }
  res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-cache' })
  res.end(JSON.stringify(items))
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`)
  if (req.method === 'OPTIONS' && url.pathname.startsWith('/__52java/')) {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    })
    return res.end()
  }
  if (url.pathname === '/__jars') return jars(res)
  if (url.pathname === '/__icon') {
    const name = url.searchParams.get('jar') ?? ''
    const file = resolve(JARS, name)
    if (!file.startsWith(JARS + sep) || !file.toLowerCase().endsWith('.jar')) return res.writeHead(404).end()
    const info = await manifestInfo(file)
    if (!info?.icon) return res.writeHead(404).end()
    const data = await zipEntry(file, info.icon.replace(/^\//, ''))
    if (!data) return res.writeHead(404).end()
    res.writeHead(200, { 'Content-Type': 'image/png', 'Cache-Control': 'no-cache' })
    return res.end(data)
  }
  if (url.pathname === '/__52java/catalog') {
    try {
      const catalog = await storeCatalog(storeCatalogQuery(url.searchParams))
      return json(res, 200, { source: JAVA_BASE, siteUrl: JAVA_BASE, ...catalog })
    } catch (error) {
      console.error('52emu catalog error:', error)
      return json(res, 502, { error: 'catalog_unavailable', siteUrl: JAVA_BASE })
    }
  }
  if (url.pathname === '/__52java/download') {
    const id = url.searchParams.get('id')
    if (!id) return json(res, 400, { error: 'missing_id' })
    return storeDownload(res, id)
  }
  if (url.pathname === '/__52java/open') return json(res, 200, { url: JAVA_BASE })
  if (url.pathname === '/__flash/catalog') {
    try {
      const query = (url.searchParams.get('query') || '').trim().slice(0, 120)
      return json(res, 200, { source: FLASH_HOMES_BASE, games: await flashArchiveCatalog(query) })
    } catch (error) {
      console.error('flash.homes catalog error:', error)
      return json(res, 502, { error: 'flash_catalog_unavailable' })
    }
  }
  const flashDetail = url.pathname.match(/^\/__flash\/detail\/([A-Z0-9-]+)$/i)
  if (flashDetail) {
    try {
      const code = flashDetail[1].toUpperCase()
      const detail = await flashHomesPage(`/flash/${code}`)
      return json(res, 200, { source: FLASH_HOMES_BASE, game: parseFlashArchiveDetail(detail, code) })
    } catch (error) {
      return json(res, 502, { error: String(error instanceof Error ? error.message : error) })
    }
  }
  const flashDownload = url.pathname.match(/^\/__flash\/download\/([A-Z0-9-]+)$/i)
  if (flashDownload) {
    try {
      const code = flashDownload[1].toUpperCase()
      const detail = await flashHomesPage(`/flash/${code}`)
      const game = parseFlashArchiveDetail(detail, code)
      if (!game.sha256) return json(res, 502, { error: 'flash_hash_unavailable' })
      const source = new URL(`https://swf.flash.homes/${game.sha256}.swf`)
      const response = await fetch(source, { signal: AbortSignal.timeout(60_000), redirect: 'follow' })
      if (!response.ok || !response.body) return json(res, 502, { error: `flash download HTTP ${response.status}` })
      const length = Number(response.headers.get('content-length') || 0)
      if (length > FLASH_MAX_BYTES) return json(res, 413, { error: 'flash_too_large' })
      res.writeHead(200, {
        'Access-Control-Allow-Origin': '*',
        'Content-Type': 'application/x-shockwave-flash',
        ...(length ? { 'Content-Length': String(length) } : {}),
        'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(game.name)}.swf`,
        'Cache-Control': 'no-store',
      })
      const reader = response.body.getReader()
      let total = 0
      while (true) {
        const part = await reader.read()
        if (part.done) break
        total += part.value.byteLength
        if (total > FLASH_MAX_BYTES) { await reader.cancel(); res.destroy(); return }
        if (!res.write(Buffer.from(part.value))) await new Promise<void>(resolve => res.once('drain', resolve))
      }
      return res.end()
    } catch (error) {
      return json(res, 502, { error: String(error instanceof Error ? error.message : error) })
    }
  }
  const target = mappedPath(url.pathname === '/' ? '/index.html' : url.pathname)
  if (!target || !(await sendFile(req, res, target, immutableRequest(url)))) res.writeHead(404).end('Not found')
})

const wss = new WebSocketServer({ noServer: true })
server.on('upgrade', (req, socket, head) => {
  const path = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`).pathname
  if (path === '/__proxy' || path === '/__bt') {
    wss.handleUpgrade(req, socket, head, ws => handleSocket(path, req, ws))
  } else socket.destroy()
})

type Radio = { ws: WebSocket; addr: string; name: string; services: Map<string, string>; links: Set<number>; room: string }
const rooms = new Map<string, { pass: string; net: string; peers: Map<string, Radio> }>()
const links = new Map<number, [Radio, Radio]>()
let nextLink = 0

function send(r: Radio, message: object) { if (r.ws.readyState === WebSocket.OPEN) r.ws.send(JSON.stringify(message)) }
function notifyPeers(room: { peers: Map<string, Radio> }) {
  const list = [...room.peers.keys()]
  for (const peer of room.peers.values()) send(peer, { t: 'peers', n: list.length, list })
}

function handleBt(req: IncomingMessage, ws: WebSocket) {
  const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`)
  const mode = url.searchParams.get('mode') ?? 'near'
  const roomKey = mode === 'near' ? `n:${req.socket.remoteAddress ?? ''}` : `r:${(url.searchParams.get('room') ?? '').trim().toLowerCase()}`
  const pass = url.searchParams.get('pass') ?? ''
  let room = rooms.get(roomKey)
  if (!room) {
    if (mode === 'join') { ws.send(JSON.stringify({ t: 'err', msg: 'notfound' })); return ws.close() }
    room = { pass, net: url.searchParams.get('net') === 'turn' ? 'turn' : 'auto', peers: new Map() }
    rooms.set(roomKey, room)
  } else if (mode === 'create') return ws.close()
  else if (room.pass !== pass) return ws.close()
  if (room.peers.size >= 8) return ws.close()
  let addr = (url.searchParams.get('addr') ?? '').toUpperCase()
  if (!/^[0-9A-F]{12}$/.test(addr) || room.peers.has(addr)) addr = crypto.randomBytes(6).toString('hex').toUpperCase()
  const radio: Radio = { ws, addr, name: url.searchParams.get('name') || `J2ME-${addr.slice(-4)}`, services: new Map(), links: new Set(), room: roomKey }
  room.peers.set(addr, radio)
  send(radio, { t: 'hi', addr, name: radio.name, ice: null, net: room.net }); notifyPeers(room)
  ws.on('message', (raw, binary) => binary ? relayBtData(radio, raw as Buffer) : btControl(radio, JSON.parse(raw.toString())))
  ws.on('close', () => leaveBt(radio))
}

function leaveBt(r: Radio) {
  const room = rooms.get(r.room); if (!room) return
  room.peers.delete(r.addr)
  for (const link of r.links) { const pair = links.get(link); if (!pair) continue; const other = pair[0] === r ? pair[1] : pair[0]; other.links.delete(link); send(other, { t: 'close', link, gone: 1 }); links.delete(link) }
  if (!room.peers.size) rooms.delete(r.room); else notifyPeers(room)
}

function btControl(r: Radio, m: any) {
  const room = rooms.get(r.room); if (!room) return
  const peers = room.peers; let reply: any
  if (m.t === 'inq') reply = { t: 'inq', q: m.q, devs: [...peers.values()].filter(p => p !== r).map(p => [p.addr, '5a020c', p.name]) }
  else if (m.t === 'sdp') { const p = peers.get(m.addr); reply = { t: 'sdp', q: m.q, recs: p ? [...p.services.entries()] : null } }
  else if (m.t === 'reg') { if (String(m.attrs).length <= 8192) r.services.set(String(m.key).slice(0, 8), String(m.attrs)); return }
  else if (m.t === 'unreg') { r.services.delete(m.key); return }
  else if (m.t === 'conn') {
    const p = peers.get(m.addr); if (!p || p === r) reply = { t: 'conn', q: m.q, link: -1 }
    else if (!p.services.has(m.key)) reply = { t: 'conn', q: m.q, link: -2 }
    else { p.services.delete(m.key); const link = ++nextLink; links.set(link, [r, p]); r.links.add(link); p.links.add(link); reply = { t: 'conn', q: m.q, link, name: p.name }; send(p, { t: 'in', key: m.key, link, peer: r.addr, name: r.name }) }
  } else if (m.t === 'sig' || m.t === 'p2p') { const p = peers.get(m.to); if (p) send(p, { ...m, from: r.addr }) ; return }
  else if (m.t === 'close') { const pair = links.get(m.link); if (!pair || !pair.includes(r)) return; const other = pair[0] === r ? pair[1] : pair[0]; links.delete(m.link); r.links.delete(m.link); other.links.delete(m.link); send(other, { t: 'close', link: m.link }); return }
  if (reply) send(r, reply)
}

function relayBtData(r: Radio, data: Buffer) { if (data.length < 4) return; const link = data.readUInt32BE(0); const pair = links.get(link); if (!pair || !pair.includes(r)) return; const other = pair[0] === r ? pair[1] : pair[0]; if (other.ws.readyState === WebSocket.OPEN) other.ws.send(data)
}

function handleSocket(path: string, req: IncomingMessage, ws: WebSocket) {
  if (path === '/__bt') {
    handleBt(req, ws)
    return
  }
  const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`)
  const host = url.searchParams.get('host') ?? ''
  const port = Number(url.searchParams.get('port') ?? 0)
  if (!host || !port) return ws.close()
  const tcp = url.searchParams.get('tls') === '1' ? tlsConnect({ host, port, servername: host }) : tcpConnect({ host, port })
  tcp.once('connect', () => ws.send('ok'))
  tcp.on('data', data => { if (ws.readyState === WebSocket.OPEN) ws.send(data) })
  tcp.on('error', () => ws.close())
  ws.on('message', (data, binary) => { if (binary) tcp.write(data as Buffer); else if (data.toString() === 'shut') tcp.end() })
  ws.on('close', () => tcp.destroy())
}

const lanAddress = Object.values(networkInterfaces())
  .flat()
  .find((item) => item && item.family === 'IPv4' && !item.internal)?.address
server.listen(PORT, '0.0.0.0', () => {
  console.log(`http://localhost:${PORT}`)
  if (lanAddress) console.log(`http://${lanAddress}:${PORT}`)
})
