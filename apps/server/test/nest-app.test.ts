import 'reflect-metadata'
import { NestFactory } from '@nestjs/core'
import { once } from 'node:events'
import { createServer, type Server, type Socket } from 'node:net'
import { WebSocket } from 'ws'
import { afterEach, describe, expect, it } from 'vitest'
import { AppModule } from '../src/app.module.js'

describe('Nest server adapter', () => {
  let app: Awaited<ReturnType<typeof NestFactory.create>> | undefined
  let secondApp: typeof app
  let echo: Server | undefined
  const clients: WebSocket[] = []
  const tcpSockets = new Set<Socket>()

  async function startApp() {
    const instance = await NestFactory.create(AppModule, { logger: false, bodyParser: false })
    await instance.listen(0, '127.0.0.1')
    const address = instance.getHttpServer().address()
    if (!address || typeof address === 'string') throw new Error('expected a TCP listener')
    return { instance, base: `http://127.0.0.1:${address.port}` }
  }

  function socket(base: string, path: string) {
    const client = new WebSocket(`${base.replace('http:', 'ws:')}${path}`)
    clients.push(client)
    const messages: string[] = []
    const waiters: Array<(message: string) => void> = []
    client.on('message', data => {
      const message = data.toString()
      const waiter = waiters.shift()
      if (waiter) waiter(message)
      else messages.push(message)
    })
    return {
      client,
      message: () => messages.length ? Promise.resolve(messages.shift()!) : new Promise<string>(resolve => waiters.push(resolve)),
    }
  }

  afterEach(async () => {
    for (const client of clients.splice(0)) client.terminate()
    for (const tcp of tcpSockets) tcp.destroy()
    await app?.close()
    await secondApp?.close()
    if (echo?.listening) await new Promise<void>((resolve, reject) => echo!.close(error => error ? reject(error) : resolve()))
    app = undefined
    secondApp = undefined
    echo = undefined
  })

  it('serves existing API and static asset routes', async () => {
    app = await NestFactory.create(AppModule, { logger: false, bodyParser: false })
    await app.listen(0, '127.0.0.1')
    const address = app.getHttpServer().address()
    if (!address || typeof address === 'string') throw new Error('expected an ephemeral TCP listener')
    const base = `http://127.0.0.1:${address.port}`

    const api = await fetch(`${base}/__52java/open`)
    expect(api.status).toBe(200)
    expect(await api.json()).toEqual({ url: 'https://java.52emu.cn' })
    expect(api.headers.get('access-control-allow-origin')).toBe('*')
    expect(api.headers.get('cache-control')).toBe('no-cache')

    const preflight = await fetch(`${base}/__52java/catalog`, { method: 'OPTIONS' })
    expect(preflight.status).toBe(204)
    expect(preflight.headers.get('access-control-allow-methods')).toBe('GET, OPTIONS')

    const asset = await fetch(`${base}/runtime/j2me/compat.html`)
    expect(asset.status).toBe(200)
    expect(asset.headers.get('content-type')).toContain('text/html')
    expect(asset.headers.get('cache-control')).toBe('no-cache')
    const etag = asset.headers.get('etag')!
    await asset.arrayBuffer()
    const cached = await fetch(`${base}/runtime/j2me/compat.html`, { headers: { 'if-none-match': etag } })
    expect(cached.status).toBe(304)
    const versioned = await fetch(`${base}/runtime/j2me/compat.html?v=test`)
    expect(versioned.headers.get('cache-control')).toBe('public, max-age=31536000, immutable')
    await versioned.arrayBuffer()
  })

  it('closes active Bluetooth, proxy WebSocket and proxy TCP connections on app.close', async () => {
    echo = createServer(tcp => {
      tcpSockets.add(tcp)
      tcp.once('close', () => tcpSockets.delete(tcp))
      tcp.on('data', data => tcp.write(data))
    })
    echo.listen(0, '127.0.0.1')
    await once(echo, 'listening')
    const address = echo.address()
    if (!address || typeof address === 'string') throw new Error('expected echo TCP listener')
    const started = await startApp()
    app = started.instance
    const bt = socket(started.base, '/__bt?mode=create&room=shutdown')
    expect(JSON.parse(await bt.message()).t).toBe('hi')
    const proxy = socket(started.base, `/__proxy?host=127.0.0.1&port=${address.port}`)
    expect(await proxy.message()).toBe('ok')
    proxy.client.send(Buffer.from('echo'))
    expect(await proxy.message()).toBe('echo')
    const btClosed = once(bt.client, 'close')
    const proxyClosed = once(proxy.client, 'close')
    const tcpClosed = Promise.all([...tcpSockets].map(tcp => once(tcp, 'close')))
    expect(tcpSockets.size).toBe(1)
    await app.close()
    app = undefined
    await Promise.all([btClosed, proxyClosed, tcpClosed])
    expect(tcpSockets.size).toBe(0)
    expect(started.instance.getHttpServer().listening).toBe(false)
  })

  it('isolates Bluetooth rooms between Nest application instances', async () => {
    const first = await startApp()
    app = first.instance
    const second = await startApp()
    secondApp = second.instance
    const owner = socket(first.base, '/__bt?mode=create&room=isolated')
    expect(JSON.parse(await owner.message()).t).toBe('hi')
    const stranger = socket(second.base, '/__bt?mode=join&room=isolated')
    expect(JSON.parse(await stranger.message())).toEqual({ t: 'err', msg: 'notfound' })
    const peer = socket(first.base, '/__bt?mode=join&room=isolated')
    expect(JSON.parse(await peer.message()).t).toBe('hi')
    expect(JSON.parse(await peer.message()).n).toBe(2)
  })

  it('rejects unknown upgrade paths without affecting HTTP', async () => {
    const started = await startApp()
    app = started.instance
    const unknown = socket(started.base, '/unknown-upgrade')
    const rejected = new Promise<Error>(resolve => unknown.client.once('error', resolve))
    const closed = new Promise<void>(resolve => unknown.client.once('close', () => resolve()))
    expect(await rejected).toBeInstanceOf(Error)
    await closed
    expect((await fetch(`${started.base}/__52java/open`)).status).toBe(200)
  })

  it('closes invalid Bluetooth messages and proxy ports while keeping HTTP available', async () => {
    const started = await startApp()
    app = started.instance
    for (const message of [
      '{', 'null', '42', '"text"', '[]',
      JSON.stringify({ t: 'reg', attrs: { toString: null }, key: 'x' }),
      JSON.stringify({ t: 'reg', attrs: '', key: { toString: null } }),
    ]) {
      const bt = socket(started.base, '/__bt')
      expect(JSON.parse(await bt.message()).t).toBe('hi')
      const closed = once(bt.client, 'close')
      bt.client.send(message)
      await closed
      expect((await fetch(`${started.base}/__52java/open`)).status).toBe(200)
    }
    for (const port of ['-1', '1.5', '65536']) {
      const proxy = socket(started.base, `/__proxy?host=127.0.0.1&port=${port}`)
      await once(proxy.client, 'close')
      expect((await fetch(`${started.base}/__52java/open`)).status).toBe(200)
    }
  })
})
