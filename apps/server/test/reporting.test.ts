import 'reflect-metadata'
import { NestFactory } from '@nestjs/core'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AppModule } from '../src/app.module.js'
import { FeishuSink } from '../src/reporting/feishu-sink.js'
import { parseReports, redact, serverRecord } from '../src/reporting/report-record.js'
import { ReportStore } from '../src/reporting/report-store.js'
import { AppLogger } from '../src/reporting/reporting.module.js'

const event = { id: 'event-1', type: 'app_open', ts: 1000, session_id: 'session-1' }
const envelope = { v: 1, device_id: 'device-1', platform: 'web', events: [event] }

describe('report protocol and Feishu sink', () => {
  afterEach(() => vi.unstubAllEnvs())

  it('validates the whole batch and trusts only the server environment', () => {
    vi.stubEnv('LOG_ENV', 'test')
    const [record] = parseReports({ ...envelope, environment: 'forged' })
    expect(record.environment).toBe('test')
    for (const events of [[{ ...event, type: 'unknown' }], [{ ...event, ts: Infinity }], [{ ...event, type: 'game_end' }], Array(51).fill(event)]) expect(() => parseReports({ ...envelope, events })).toThrow()
    expect(() => parseReports({ ...envelope, device_id: null })).toThrow()
  })

  it('redacts credentials, circular values and URL queries', () => {
    vi.stubEnv('FEISHU_APP_SECRET', 'test-credential-123')
    const message = redact(new Error('test-credential-123 Bearer abc https://example.com/a?token=123'))
    expect(message).not.toContain('test-credential-123')
    expect(message).not.toContain('Bearer abc')
    expect(message).not.toContain('?token')
    const circular: Record<string, unknown> = { password: 'hidden' }
    circular.self = circular
    expect(redact(circular)).not.toContain('hidden')
    expect(redact(circular)).toContain('[Circular]')
    const raw = '{"password":"test-private value","access_token":"test-token","client_secret":"test-secret","status":"ready"}\nCookie: theme=dark; session=test-session\nSet-Cookie: session=test-set; Path=/\nstatus=healthy'
    const result = redact(raw)
    for (const secret of ['test-private', 'value', 'test-token', 'test-secret', 'test-session', 'test-set']) expect(result).not.toContain(secret)
    expect(result).toContain('"status":"ready"')
    expect(result).toContain('status=healthy')
  })

  it('uses tenant tokens, separates categories and protects spreadsheet formulas', async () => {
    const requests: { url: string; body: Record<string, unknown>; headers: Record<string, string> }[] = []
    const fetcher = vi.fn(async (url, options) => {
      requests.push({ url: String(url), body: JSON.parse(String(options?.body)), headers: options?.headers as Record<string, string> })
      return new Response(JSON.stringify(String(url).includes('/auth/') ? { code: 0, tenant_access_token: 'fake-token', expire: 7200 } : { code: 0, data: {} }))
    }) as unknown as typeof fetch
    const sink = new FeishuSink({ appId: 'test-app', appSecret: 'test-secret', spreadsheet: 'test-book', sheets: { usage: 'usage', client_error: 'errors', server: 'server' } }, fetcher)
    const record = serverRecord('error', '=IMPORTXML("https://outside.invalid")')
    await sink.append([record])
    await sink.append(parseReports(envelope))
    expect(requests).toHaveLength(3)
    expect(requests[0].headers.Authorization).toBeUndefined()
    expect(requests[1].headers.Authorization).toBe('Bearer fake-token')
    expect(requests[1].body.valueRange).toMatchObject({ range: 'server!A1:S1' })
    expect(((requests[1].body.valueRange as { values: unknown[][] }).values[0][15] as string).startsWith("'=")).toBe(true)
    expect(requests[2].body.valueRange).toMatchObject({ range: 'usage!A1:S1' })
  })

  it('refreshes rejected credentials without exposing the upstream body', async () => {
    let authentication = 0
    let rejected = true
    const fetcher = vi.fn(async url => {
      if (String(url).includes('/auth/')) { authentication++; return new Response(JSON.stringify({ code: 0, tenant_access_token: 'token', expire: 7200 })) }
      return new Response(JSON.stringify(rejected ? { code: 99991677, msg: 'upstream contains test-secret' } : { code: 0 }), { status: rejected ? 401 : 200 })
    }) as unknown as typeof fetch
    const sink = new FeishuSink({ appId: 'app', appSecret: 'test-secret', spreadsheet: 'book', sheets: { usage: 'u', client_error: 'e', server: 's' } }, fetcher)
    await expect(sink.append([serverRecord('error', 'test')])).rejects.not.toThrow('test-secret')
    rejected = false
    await sink.append([serverRecord('info', 'retry')])
    expect(authentication).toBe(2)
  })
})

describe('Nest report endpoint', () => {
  let directory: string
  let app: Awaited<ReturnType<typeof NestFactory.create>>
  let base: string

  beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), 'bawang-report-http-'))
    vi.stubEnv('LOG_DIR', directory)
    vi.stubEnv('LOG_ENV', 'test')
    for (const key of ['FEISHU_APP_ID', 'FEISHU_APP_SECRET', 'FEISHU_SPREADSHEET_TOKEN', 'FEISHU_USAGE_SHEET_ID', 'FEISHU_ERROR_SHEET_ID', 'FEISHU_SERVER_SHEET_ID']) vi.stubEnv(key, '')
    app = await NestFactory.create(AppModule, { logger: false, bodyParser: false })
    await app.listen(0, '127.0.0.1')
    base = `http://127.0.0.1:${app.getHttpServer().address().port}`
  })

  afterEach(async () => {
    await app?.close()
    await rm(directory, { recursive: true, force: true })
    vi.restoreAllMocks()
    vi.unstubAllEnvs()
  })

  it('accepts text/plain reports before the catch-all route, persists and deduplicates', async () => {
    const store = app.get(ReportStore)
    const accepted = vi.spyOn(store, 'accept')
    for (let attempt = 0; attempt < 2; attempt++) {
      const response = await fetch(`${base}/collect`, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=UTF-8' }, body: JSON.stringify(envelope) })
      expect(response.status).toBe(204)
      expect(response.headers.get('access-control-allow-origin')).toBe('*')
    }
    expect(await accepted.mock.results[0].value).toHaveLength(1)
    expect(await accepted.mock.results[1].value).toHaveLength(0)
    const preflight = await fetch(`${base}/collect`, { method: 'OPTIONS' })
    expect(preflight.status).toBe(204)
    expect((await fetch(`${base}/collect`)).status).toBe(405)
    expect((await fetch(`${base}/__52java/open`)).status).toBe(200)
  })

  it('rejects malformed and oversized input, and does not acknowledge disk failures', async () => {
    for (const body of ['not JSON', JSON.stringify({ ...envelope, events: [{ ...event, type: 'unknown' }] })]) {
      expect((await fetch(`${base}/collect`, { method: 'POST', body })).status).toBe(400)
    }
    expect((await fetch(`${base}/collect`, { method: 'POST', body: ' '.repeat(128 * 1024 + 1) })).status).toBe(413)
    vi.spyOn(app.get(ReportStore), 'accept').mockRejectedValue(new Error('disk full'))
    expect((await fetch(`${base}/collect`, { method: 'POST', body: JSON.stringify(envelope) })).status).toBe(503)
  })

  it('routes server logs through the same durable store', async () => {
    const accepted = vi.spyOn(app.get(ReportStore), 'accept')
    app.get(AppLogger).error(new Error('server diagnostic'), { Authorization: 'Bearer hidden' })
    await accepted.mock.results[0].value
    const record = accepted.mock.calls[0][0][0]
    expect(record.category).toBe('server')
    expect(record.message).toContain('server diagnostic')
    expect(record.context).not.toContain('hidden')
  })
})
