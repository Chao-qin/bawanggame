import 'reflect-metadata'
import { NestFactory } from '@nestjs/core'
import { once } from 'node:events'
import { createServer, type Server } from 'node:http'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { AppModule } from '../src/app.module.js'

// Every route answered by the module that owns it, with the static catch-all registered after all of them.
describe('module routes', () => {
  let app: Awaited<ReturnType<typeof NestFactory.create>>
  let upstream: Server
  let upstreamBase: string
  let base: string
  const upstreamPaths: string[] = []
  const savedEnv = { java: process.env['52JAVA_BASE_URL'], flash: process.env.FLASH_HOMES_BASE_URL }

  beforeAll(async () => {
    upstream = createServer((req, res) => {
      upstreamPaths.push(req.url ?? '')
      res.writeHead(500).end()
    })
    upstream.listen(0, '127.0.0.1')
    await once(upstream, 'listening')
    const address = upstream.address()
    if (!address || typeof address === 'string') throw new Error('expected upstream TCP listener')
    upstreamBase = `http://127.0.0.1:${address.port}`
    process.env['52JAVA_BASE_URL'] = upstreamBase
    process.env.FLASH_HOMES_BASE_URL = upstreamBase
    app = await NestFactory.create(AppModule, { logger: false, bodyParser: false })
    await app.listen(0, '127.0.0.1')
    const listener = app.getHttpServer().address()
    if (!listener || typeof listener === 'string') throw new Error('expected app TCP listener')
    base = `http://127.0.0.1:${listener.port}`
  })

  afterAll(async () => {
    await app?.close()
    await new Promise<void>(resolve => upstream.close(() => resolve()))
    for (const [key, value] of [['52JAVA_BASE_URL', savedEnv.java], ['FLASH_HOMES_BASE_URL', savedEnv.flash]] as const) {
      if (value === undefined) delete process.env[key]
      else process.env[key] = value
    }
  })

  it('routes Java catalog and download requests to the Java module', async () => {
    const catalog = await fetch(`${base}/__52java/catalog?page=1`)
    expect(catalog.status).toBe(502)
    expect(await catalog.json()).toEqual({ error: 'catalog_unavailable', siteUrl: upstreamBase })
    expect(upstreamPaths.some(path => path.startsWith('/index.php'))).toBe(true)

    const missing = await fetch(`${base}/__52java/download`)
    expect(missing.status).toBe(400)
    expect(await missing.json()).toEqual({ error: 'missing_id' })
    const invalid = await fetch(`${base}/__52java/download?id=abc`)
    expect(invalid.status).toBe(400)
    expect(await invalid.json()).toEqual({ error: 'invalid_game_id' })
  })

  it('answers preflight for any /__52java/ path and leaves unknown GETs to the asset fallback', async () => {
    const preflight = await fetch(`${base}/__52java/unknown`, { method: 'OPTIONS' })
    expect(preflight.status).toBe(204)
    expect(preflight.headers.get('access-control-allow-headers')).toBe('Content-Type')
    const unknown = await fetch(`${base}/__52java/unknown`)
    expect(unknown.status).toBe(404)
    expect(await unknown.text()).toBe('Not found')
  })

  it('routes Flash catalog and detail requests and upper-cases the game code', async () => {
    const catalog = await fetch(`${base}/__flash/catalog?query=abc`)
    expect(catalog.status).toBe(502)
    expect(await catalog.json()).toEqual({ error: 'flash_catalog_unavailable' })

    const detail = await fetch(`${base}/__flash/detail/abc-1`)
    expect(detail.status).toBe(502)
    expect(await detail.json()).toEqual({ error: 'flash.homes HTTP 500' })
    expect(upstreamPaths).toContain('/flash/ABC-1')

    const download = await fetch(`${base}/__flash/download/abc-2`)
    expect(download.status).toBe(502)
    expect(upstreamPaths).toContain('/flash/ABC-2')

    const badCode = await fetch(`${base}/__flash/detail/a_b`)
    expect(badCode.status).toBe(404)
    expect(await badCode.text()).toBe('Not found')
  })

  it('serves the local JAR list and rejects icon paths outside the JAR directory', async () => {
    const jars = await fetch(`${base}/__jars`)
    expect(jars.status).toBe(200)
    expect(jars.headers.get('content-type')).toBe('application/json; charset=utf-8')
    expect(Array.isArray(await jars.json())).toBe(true)
    expect((await fetch(`${base}/__icon?jar=../../package.json`)).status).toBe(404)
  })

  it('keeps /collect ahead of the asset fallback and serves the web shell at /', async () => {
    const collect = await fetch(`${base}/collect`, { method: 'OPTIONS' })
    expect(collect.status).toBe(204)
    expect(collect.headers.get('access-control-allow-methods')).toBe('POST, OPTIONS')

    const shell = await fetch(`${base}/`)
    expect(shell.status).toBe(200)
    expect(shell.headers.get('content-type')).toBe('text/html; charset=utf-8')
    await shell.arrayBuffer()
    expect((await fetch(`${base}/%2E%2E%2Fpackage.json`)).status).toBe(404)
  })
})
