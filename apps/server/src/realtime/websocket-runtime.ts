import type { IncomingMessage } from 'node:http'
import { connect as tcpConnect } from 'node:net'
import crypto from 'node:crypto'
import { connect as tlsConnect } from 'node:tls'
import { WebSocketServer, WebSocket } from 'ws'

export function createWebSocketRuntime() {
  const wss = new WebSocketServer({ noServer: true })
  function handleUpgrade(req: IncomingMessage, socket: import('node:stream').Duplex, head: Buffer) {
    const path = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`).pathname
    if (path === '/__proxy' || path === '/__bt') {
      wss.handleUpgrade(req, socket, head, ws => handleSocket(path, req, ws))
    } else socket.destroy()
  }

  type Radio = { ws: WebSocket; addr: string; name: string; services: Map<string, string>; links: Set<number>; room: string }
  const rooms = new Map<string, { pass: string; net: string; peers: Map<string, Radio> }>()
  const links = new Map<number, [Radio, Radio]>()
  let nextLink = 0
  const proxySockets = new Set<import('node:net').Socket>()

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
    ws.on('message', (raw, binary) => {
      if (binary) return relayBtData(radio, raw as Buffer)
      try {
        const message: unknown = JSON.parse(raw.toString())
        if (!message || typeof message !== 'object' || Array.isArray(message)) return ws.close()
        btControl(radio, message)
      } catch {
        ws.close()
      }
    })
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
    ws.on('error', () => ws.terminate())
    if (path === '/__bt') {
      handleBt(req, ws)
      return
    }
    const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`)
    const host = url.searchParams.get('host') ?? ''
    const port = Number(url.searchParams.get('port') ?? 0)
    if (!host || !Number.isInteger(port) || port < 1 || port > 65535) return ws.close()
    const tcp = url.searchParams.get('tls') === '1' ? tlsConnect({ host, port, servername: host }) : tcpConnect({ host, port })
    proxySockets.add(tcp)
    tcp.once('close', () => proxySockets.delete(tcp))
    tcp.once('connect', () => { if (ws.readyState === WebSocket.OPEN) ws.send('ok') })
    tcp.on('data', data => { if (ws.readyState === WebSocket.OPEN) ws.send(data) })
    tcp.on('error', () => ws.close())
    ws.on('message', (data, binary) => { if (binary) tcp.write(data as Buffer); else if (data.toString() === 'shut') tcp.end() })
    ws.on('close', () => tcp.destroy())
  }

  return {
    handleUpgrade,
    close() {
      for (const client of wss.clients) client.terminate()
      for (const socket of proxySockets) socket.destroy()
      proxySockets.clear()
      rooms.clear()
      links.clear()
      nextLink = 0
      return new Promise<void>((resolve, reject) => {
        wss.close(error => error ? reject(error) : resolve())
      })
    },
  }
}
