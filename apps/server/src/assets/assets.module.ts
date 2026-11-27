import { All, Controller, Injectable, Inject, Module, Req, Res } from '@nestjs/common'
import { createReadStream, promises as fs } from 'node:fs'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { extname, join, resolve, sep } from 'node:path'
import { createGzip } from 'node:zlib'
import { requestUrl } from '../common/http-response.js'
import { J2ME_ROOT, JARS_ROOT, MRP_ROOT, MRP_RUNTIME_ROOT, WEB_ROOT } from '../common/project-paths.js'

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.png': 'image/png', '.svg': 'image/svg+xml', '.wasm': 'application/wasm',
  '.jar': 'application/java-archive', '.mrp': 'application/octet-stream',
}

function safeWebPath(urlPath: string) {
  const decoded = decodeURIComponent(urlPath.split('?')[0])
  const target = resolve(WEB_ROOT, decoded.replace(/^\/+/, ''))
  if (target !== WEB_ROOT && !target.startsWith(WEB_ROOT + sep)) return null
  return target
}

function mappedPath(urlPath: string) {
  const path = decodeURIComponent(urlPath.split('?')[0]).replace(/^\/+/, '')
  const aliases: Array<[string, string]> = [
    ['bld/', join(J2ME_ROOT, 'bld') + sep], ['config/', join(J2ME_ROOT, 'config') + sep],
    ['java/', join(J2ME_ROOT, 'java') + sep], ['libs/', join(J2ME_ROOT, 'libs') + sep],
    ['style/', join(J2ME_ROOT, 'style') + sep], ['jar/', JARS_ROOT + sep],
    ['maopao/', MRP_ROOT + sep], ['runtime/j2me/', J2ME_ROOT + sep], ['runtime/mrp/', MRP_RUNTIME_ROOT + sep],
  ]
  for (const [prefix, base] of aliases) {
    if (path.startsWith(prefix)) {
      const target = resolve(base, path.slice(prefix.length))
      if (target === base.slice(0, -1) || target.startsWith(base)) return target
      return null
    }
  }
  const runtimeFiles = new Set(['btroom.js', 'compat.html', 'debug-graphics.js', 'debug-native.js', 'files.js', 'keymap.js', 'keypad-canvas.js', 'layout.js', 'panel.js', 'runtime-extras.js', 'screen.js', 'touch-layout.js', 'touchpad.js', 'ui-feedback.js'])
  if (runtimeFiles.has(path)) return join(J2ME_ROOT, path)
  if (path === 'mrp-runtime.js') return join(MRP_RUNTIME_ROOT, path)
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

@Injectable()
export class AssetsService {
  async send(req: IncomingMessage, res: ServerResponse) {
    const url = requestUrl(req)
    const target = mappedPath(url.pathname === '/' ? '/index.html' : url.pathname)
    if (!target || !(await this.sendFile(req, res, target, immutableRequest(url)))) res.writeHead(404).end('Not found')
  }

  private async sendFile(req: IncomingMessage, res: ServerResponse, target: string, immutable: boolean) {
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
}

// Catch-all: AppModule imports this module last so every API route is matched before it.
@Controller()
class AssetsController {
  constructor(@Inject(AssetsService) private readonly assets: AssetsService) {}

  @All('*')
  async serve(@Req() req: IncomingMessage, @Res() res: ServerResponse) {
    await this.assets.send(req, res)
  }
}

@Module({ controllers: [AssetsController], providers: [AssetsService] })
export class AssetsModule {}
