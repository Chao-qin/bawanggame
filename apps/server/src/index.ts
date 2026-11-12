import { createReadStream, promises as fs } from 'node:fs'
import { createServer, IncomingMessage, ServerResponse } from 'node:http'
import { connect as tcpConnect } from 'node:net'
import crypto from 'node:crypto'
import { networkInterfaces } from 'node:os'
import { connect as tlsConnect } from 'node:tls'
import { extname, join, normalize, resolve, sep } from 'node:path'
import { URL } from 'node:url'
import { WebSocketServer, WebSocket } from 'ws'
import yauzl from 'yauzl'

const PROJECT = resolve(import.meta.dirname, '../../..')
const PORT = Number(process.env.PORT ?? 8080)
const JAVA_BASE = (process.env['52JAVA_BASE_URL'] ?? 'https://java.52emu.cn').replace(/\/$/, '')
const JAVA_HOSTS = new Set([new URL(JAVA_BASE).hostname, ...(new URL(JAVA_BASE).hostname === 'java.52emu.cn' ? ['d2.52emu.cn'] : [])])
const JAVA_MAX_BYTES = Number(process.env['52JAVA_MAX_BYTES'] ?? 64 * 1024 * 1024)
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

type StoreGame = { id: string; name: string; plays: number }
type StoreCatalog = { games: StoreGame[]; page: number; pages: number; total: number }
const storeCache = new Map<string, { expires: number; value: StoreCatalog }>()

function json(res: ServerResponse, status: number, value: unknown) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-cache' })
  res.end(JSON.stringify(value))
}

function htmlText(value: string) {
  return value.replace(/<[^>]*>/g, '').replace(/&nbsp;|&#160;/gi, ' ').replace(/&amp;/gi, '&').replace(/&lt;/gi, '<').replace(/&gt;/gi, '>').replace(/&quot;/gi, '"').replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n))).trim()
}

function parseStoreCatalog(html: string, page: number): StoreCatalog {
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

async function storeCatalog(options: { page: number; query: string; category: string; force: boolean }): Promise<StoreCatalog> {
  const key = `${options.page}:${options.query}:${options.category}`
  const cached = storeCache.get(key)
  if (!options.force && cached && cached.expires > Date.now()) return cached.value
  try {
    const url = new URL('/index.php', JAVA_BASE)
    if (options.query) {
      url.searchParams.set('nkey', options.query)
      url.searchParams.set('qiqi', '搜索游戏')
    } else if (!options.category) {
      // 52emu ignores nsort when q=all is present.
      url.searchParams.set('q', 'all')
    }
    if (options.category) url.searchParams.set('nsort', options.category)
    url.searchParams.set('p', String(options.page))
    const response = await fetch(url, { signal: AbortSignal.timeout(10_000) })
    if (!response.ok) throw new Error(`catalog HTTP ${response.status}`)
    const html = await response.text()
    const value = parseStoreCatalog(html, options.page)
    if (!html.includes('id="results"') && !html.includes("id='results'")) throw new Error('52emu catalog markup was not recognized')
    storeCache.set(key, { expires: Date.now() + 60_000, value })
    return value
  } catch (error) { throw error }
}

function allowedStoreUrl(raw: string) {
  const url = new URL(raw)
  if (!['https:', 'http:'].includes(url.protocol) || !JAVA_HOSTS.has(url.hostname) || url.username || url.password || url.port) throw new Error('source is outside 52emu allowlist')
  return url
}

async function storeDownload(res: ServerResponse, id: string) {
  if (!/^\d{1,8}$/.test(id)) return json(res, 400, { error: 'invalid_game_id' })
  try {
    const detailUrl = new URL('/game.php', JAVA_BASE)
    detailUrl.searchParams.set('id', id)
    const detailResponse = await fetch(detailUrl, { signal: AbortSignal.timeout(10_000) })
    if (!detailResponse.ok) return json(res, 502, { error: `game detail HTTP ${detailResponse.status}` })
    const detail = await detailResponse.text()
    const titleMarkup = detail.match(/<div\s+class=["']results["'][^>]*>\s*<h2>([\s\S]*?)<\/h2>/i)?.[1] ?? ''
    const title = htmlText(titleMarkup.split(/\s*\[<a\b/i)[0])
    if (!title) return json(res, 404, { error: 'game_not_found' })
    const download = detail.match(/href=["']download\.php\?id=(\d+)&amp;xid=(\d+)["']/i)
    if (!download || download[1] !== id) return json(res, 404, { error: 'download_not_found' })
    const game: StoreGame = { id, name: title, plays: 0 }
    const downloadUrl = new URL('/download.php', JAVA_BASE)
    downloadUrl.searchParams.set('id', id)
    downloadUrl.searchParams.set('xid', download[2])
    const source = allowedStoreUrl(downloadUrl.toString())
    const response = await fetch(source, { signal: AbortSignal.timeout(30_000), redirect: 'manual' })
    if (response.status >= 300 && response.status < 400) {
      const redirect = response.headers.get('location')
      if (!redirect) return json(res, 502, { error: 'invalid_download_redirect' })
      const target = allowedStoreUrl(new URL(redirect, source).toString())
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
    const firstBytes = Buffer.concat(prefix.map(part => Buffer.from(part)))
    if (firstBytes.readUInt32BE(0) !== 0x504b0304) return json(res, 415, { error: `not_a_jar (${contentType})` })
    const baseName = (game.name || game.id).replace(/[^\w\u4e00-\u9fff.-]+/g, '_').slice(0, 80) || game.id
    const name = baseName.toLowerCase().endsWith('.jar') ? baseName : `${baseName}.jar`
    const encodedName = encodeURIComponent(name)
    res.writeHead(200, {
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
  const runtimeFiles = new Set(['btroom.js', 'compat.html', 'debug-graphics.js', 'debug-native.js', 'files.js', 'keymap.js', 'layout.js', 'panel.js', 'runtime-extras.js', 'screen.js', 'touchpad.js', 'ui-feedback.js'])
  if (runtimeFiles.has(path)) return join(J2ME, path)
  if (path === 'mrp-runtime.js') return join(MRPRUNTIME, path)
  return safeWebPath(urlPath)
}

async function sendFile(res: ServerResponse, target: string) {
  try {
    const stat = await fs.stat(target)
    if (!stat.isFile()) return false
    res.writeHead(200, { 'Content-Type': MIME[extname(target)] ?? 'application/octet-stream', 'Cache-Control': 'no-cache' })
    createReadStream(target).pipe(res)
    return true
  } catch { return false }
}

function manifestInfo(file: string) {
  return new Promise<{ name: string; vendor: string; icon: string } | null>((done) => {
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
            done({ name: midlet[0]?.trim() || attrs['MIDlet-Name'] || file.split('/').pop()!.replace(/\.jar$/i, ''), vendor: attrs['MIDlet-Vendor'] ?? '', icon: attrs['MIDlet-Icon'] || midlet[1]?.trim() || '' })
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
    if (info) items.push({ file: name, name: info.name, vendor: info.vendor, icon: Boolean(info.icon) })
  }
  res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-cache' })
  res.end(JSON.stringify(items))
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`)
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
      const page = Math.min(371, Math.max(1, Number(url.searchParams.get('page')) || 1))
      const catalog = await storeCatalog({ page, query: (url.searchParams.get('query') || '').trim().slice(0, 80), category: (url.searchParams.get('category') || '').replace(/\D/g, '').slice(0, 2), force: url.searchParams.get('refresh') === '1' })
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
  const target = mappedPath(url.pathname === '/' ? '/index.html' : url.pathname)
  if (!target || !(await sendFile(res, target))) res.writeHead(404).end('Not found')
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
