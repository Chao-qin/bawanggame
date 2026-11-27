import { All, Controller, Inject, Injectable, Module, Param, Req, Res } from '@nestjs/common'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { requestUrl, sendJson } from '../common/http-response.js'
import { parseFlashArchiveDetail, parseFlashArchiveGames, type FlashArchiveGame } from './flashCatalog.js'

@Injectable()
export class FlashService {
  readonly base = (process.env.FLASH_HOMES_BASE_URL ?? 'https://flash.homes').replace(/\/$/, '')
  private readonly maxBytes = Number(process.env.FLASH_MAX_BYTES ?? 128 * 1024 * 1024)
  private readonly cache = new Map<string, { expires: number; value: FlashArchiveGame[] }>()

  private async page(path: string) {
    const response = await fetch(new URL(path, this.base), { signal: AbortSignal.timeout(15_000) })
    if (!response.ok) throw new Error(`flash.homes HTTP ${response.status}`)
    return response.text()
  }

  async catalog(query: string) {
    const key = query.trim()
    const cached = this.cache.get(key)
    if (cached && cached.expires > Date.now()) return cached.value
    const html = await this.page(`/flash${key ? `?q=${encodeURIComponent(key)}` : ''}`)
    const games = parseFlashArchiveGames(html)
    this.cache.set(key, { expires: Date.now() + 60_000, value: games })
    return games
  }

  async detail(code: string) {
    return parseFlashArchiveDetail(await this.page(`/flash/${code}`), code)
  }

  async download(res: ServerResponse, code: string) {
    const game = await this.detail(code)
    if (!game.sha256) return sendJson(res, 502, { error: 'flash_hash_unavailable' })
    const source = new URL(`https://swf.flash.homes/${game.sha256}.swf`)
    const response = await fetch(source, { signal: AbortSignal.timeout(60_000), redirect: 'follow' })
    if (!response.ok || !response.body) return sendJson(res, 502, { error: `flash download HTTP ${response.status}` })
    const length = Number(response.headers.get('content-length') || 0)
    if (length > this.maxBytes) return sendJson(res, 413, { error: 'flash_too_large' })
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
      if (total > this.maxBytes) { await reader.cancel(); res.destroy(); return }
      if (!res.write(Buffer.from(part.value))) await new Promise<void>(resolve => res.once('drain', resolve))
    }
    res.end()
  }
}

function errorMessage(error: unknown) {
  return String(error instanceof Error ? error.message : error)
}

// Game codes outside this pattern fall through to the static asset routes, which answer 404.
@Controller('__flash')
class FlashController {
  constructor(@Inject(FlashService) private readonly flash: FlashService) {}

  @All('catalog')
  async catalog(@Req() req: IncomingMessage, @Res() res: ServerResponse) {
    try {
      const query = (requestUrl(req).searchParams.get('query') || '').trim().slice(0, 120)
      sendJson(res, 200, { source: this.flash.base, games: await this.flash.catalog(query) })
    } catch (error) {
      sendJson(res, 502, { error: 'flash_catalog_unavailable' }, error)
    }
  }

  @All('detail/:code([A-Za-z0-9-]+)')
  async detail(@Param('code') code: string, @Res() res: ServerResponse) {
    try {
      sendJson(res, 200, { source: this.flash.base, game: await this.flash.detail(code.toUpperCase()) })
    } catch (error) {
      sendJson(res, 502, { error: errorMessage(error) }, error)
    }
  }

  @All('download/:code([A-Za-z0-9-]+)')
  async download(@Param('code') code: string, @Res() res: ServerResponse) {
    try {
      await this.flash.download(res, code.toUpperCase())
    } catch (error) {
      sendJson(res, 502, { error: errorMessage(error) }, error)
    }
  }
}

@Module({ controllers: [FlashController], providers: [FlashService] })
export class FlashModule {}
