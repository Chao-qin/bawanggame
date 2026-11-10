import { createReadStream, existsSync, promises as fs } from 'node:fs'
import { createServer, IncomingMessage, ServerResponse } from 'node:http'
import { connect as tcpConnect } from 'node:net'
import crypto from 'node:crypto'
import { connect as tlsConnect } from 'node:tls'
import { extname, join, normalize, resolve, sep } from 'node:path'
import { URL } from 'node:url'
import { WebSocketServer, WebSocket } from 'ws'
import yauzl from 'yauzl'

const PROJECT = resolve(import.meta.dirname, '../../..')
const PORT = Number(process.env.PORT ?? 8080)
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

server.listen(PORT, () => console.log(`http://localhost:${PORT}`))
