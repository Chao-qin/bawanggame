import { All, Controller, Inject, Injectable, Module, Options, Req, Res } from '@nestjs/common'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { requestUrl, sendJson } from '../common/http-response.js'
import { allowedStoreUrl, isZipHeader, JAVA_DEFAULT_BASE, parseStoreCatalog, parseStoreDetail, storeCatalogQuery, storeCatalogUrl, storeDetailUrl, storeHosts, storeJarName, validStoreId, type StoreCatalog, type StoreCatalogQuery, type StoreGame } from './javaCatalog.js'

@Injectable()
export class JavaService {
  readonly base = (process.env['52JAVA_BASE_URL'] ?? JAVA_DEFAULT_BASE).replace(/\/$/, '')
  private readonly hosts = storeHosts(this.base)
  private readonly maxBytes = Number(process.env['52JAVA_MAX_BYTES'] ?? 64 * 1024 * 1024)
  private readonly cache = new Map<string, { expires: number; value: StoreCatalog }>()

  async catalog(options: StoreCatalogQuery): Promise<StoreCatalog> {
    const key = `${options.page}:${options.query}:${options.category}`
    const cached = this.cache.get(key)
    if (!options.force && cached && cached.expires > Date.now()) return cached.value
    const response = await fetch(storeCatalogUrl(this.base, options), { signal: AbortSignal.timeout(10_000) })
    if (!response.ok) throw new Error(`catalog HTTP ${response.status}`)
    const value = parseStoreCatalog(await response.text(), options.page)
    this.cache.set(key, { expires: Date.now() + 60_000, value })
    return value
  }

  async download(res: ServerResponse, id: string) {
    if (!validStoreId(id)) return sendJson(res, 400, { error: 'invalid_game_id' })
    try {
      const detailResponse = await fetch(storeDetailUrl(this.base, id), { signal: AbortSignal.timeout(10_000) })
      if (!detailResponse.ok) return sendJson(res, 502, { error: `game detail HTTP ${detailResponse.status}` })
      const detail = parseStoreDetail(await detailResponse.text(), id, this.base)
      if ('error' in detail) return sendJson(res, 404, { error: detail.error })
      const { game, downloadUrl } = detail
      const source = allowedStoreUrl(downloadUrl.toString(), this.hosts)
      const response = await fetch(source, { signal: AbortSignal.timeout(30_000), redirect: 'manual' })
      if (response.status >= 300 && response.status < 400) {
        const redirect = response.headers.get('location')
        if (!redirect) return sendJson(res, 502, { error: 'invalid_download_redirect' })
        const target = allowedStoreUrl(new URL(redirect, source).toString(), this.hosts)
        const redirected = await fetch(target, { signal: AbortSignal.timeout(30_000), redirect: 'manual' })
        if (redirected.status >= 300 && redirected.status < 400) return sendJson(res, 502, { error: 'too_many_download_redirects' })
        return await this.stream(res, game, redirected)
      }
      return await this.stream(res, game, response)
    } catch (error) { return sendJson(res, 502, { error: String(error instanceof Error ? error.message : error) }, error) }
  }

  private async stream(res: ServerResponse, game: StoreGame, response: Response) {
    if (!response.ok || !response.body) return sendJson(res, 502, { error: `download HTTP ${response.status}` })
    const contentType = response.headers.get('content-type') || ''
    const length = Number(response.headers.get('content-length') || 0)
    if (length > this.maxBytes) return sendJson(res, 413, { error: 'jar_too_large' })
    const reader = response.body.getReader()
    const prefix: Uint8Array[] = []
    let prefixLength = 0
    while (prefixLength < 4) {
      const part = await reader.read()
      if (part.done || !part.value) return sendJson(res, 415, { error: `not_a_jar (${contentType})` })
      prefix.push(part.value)
      prefixLength += part.value.byteLength
    }
    if (!isZipHeader(Buffer.concat(prefix.map(part => Buffer.from(part))))) return sendJson(res, 415, { error: `not_a_jar (${contentType})` })
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
      if (total > this.maxBytes) {
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
}

@Controller('__52java')
class JavaController {
  constructor(@Inject(JavaService) private readonly java: JavaService) {}

  // Registered first so it answers preflight for every /__52java/ path, including the routes below.
  @Options('*')
  preflight(@Res() res: ServerResponse) {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    })
    res.end()
  }

  @All('catalog')
  async catalog(@Req() req: IncomingMessage, @Res() res: ServerResponse) {
    try {
      const catalog = await this.java.catalog(storeCatalogQuery(requestUrl(req).searchParams))
      sendJson(res, 200, { source: this.java.base, siteUrl: this.java.base, ...catalog })
    } catch (error) {
      sendJson(res, 502, { error: 'catalog_unavailable', siteUrl: this.java.base }, error)
    }
  }

  @All('download')
  async download(@Req() req: IncomingMessage, @Res() res: ServerResponse) {
    const id = requestUrl(req).searchParams.get('id')
    if (!id) return sendJson(res, 400, { error: 'missing_id' })
    await this.java.download(res, id)
  }

  @All('open')
  open(@Res() res: ServerResponse) {
    sendJson(res, 200, { url: this.java.base })
  }
}

@Module({ controllers: [JavaController], providers: [JavaService] })
export class JavaModule {}
