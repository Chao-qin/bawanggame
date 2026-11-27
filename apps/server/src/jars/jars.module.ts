import { All, Controller, Injectable, Inject, Module, Req, Res } from '@nestjs/common'
import { promises as fs } from 'node:fs'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { join, resolve, sep } from 'node:path'
import yauzl from 'yauzl'
import { requestUrl } from '../common/http-response.js'
import { JARS_ROOT } from '../common/project-paths.js'

type ManifestInfo = { name: string; suiteName: string; vendor: string; version: string; icon: string }

function manifestInfo(file: string) {
  return new Promise<ManifestInfo | null>((done) => {
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

@Injectable()
export class JarsService {
  async list() {
    const names = (await fs.readdir(JARS_ROOT)).filter(n => n.toLowerCase().endsWith('.jar')).sort()
    const items = []
    for (const name of names) {
      const info = await manifestInfo(join(JARS_ROOT, name))
      if (info) items.push({ ...info, file: name, icon: Boolean(info.icon) })
    }
    return items
  }

  async icon(name: string) {
    const file = resolve(JARS_ROOT, name)
    if (!file.startsWith(JARS_ROOT + sep) || !file.toLowerCase().endsWith('.jar')) return null
    const info = await manifestInfo(file)
    if (!info?.icon) return null
    return zipEntry(file, info.icon.replace(/^\//, ''))
  }
}

@Controller()
class JarsController {
  constructor(@Inject(JarsService) private readonly jars: JarsService) {}

  @All('__jars')
  async list(@Res() res: ServerResponse) {
    const items = await this.jars.list()
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-cache' })
    res.end(JSON.stringify(items))
  }

  @All('__icon')
  async icon(@Req() req: IncomingMessage, @Res() res: ServerResponse) {
    const data = await this.jars.icon(requestUrl(req).searchParams.get('jar') ?? '')
    if (!data) return res.writeHead(404).end()
    res.writeHead(200, { 'Content-Type': 'image/png', 'Cache-Control': 'no-cache' })
    res.end(data)
  }
}

@Module({ controllers: [JarsController], providers: [JarsService] })
export class JarsModule {}
