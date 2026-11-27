import { All, Catch, Controller, HttpException, Inject, Injectable, Module, Req, Res } from '@nestjs/common'
import type { ArgumentsHost, ExceptionFilter, LoggerService, OnModuleDestroy, OnModuleInit } from '@nestjs/common'
import { APP_FILTER } from '@nestjs/core'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { resolve } from 'node:path'
import { FeishuSink, feishuConfig } from './feishu-sink.js'
import { parseReports, redact, serverRecord } from './report-record.js'
import type { ReportRecord } from './report-record.js'
import { ReportStore } from './report-store.js'
import { SessionTracker } from './sessions.js'

const logDirectory = () => resolve(process.env.LOG_DIR || '.data/reporting')

export function printReport(record: ReportRecord) {
  const stream = ['error', 'fatal', 'warn'].includes(record.level) ? process.stderr : process.stdout
  stream.write(`${JSON.stringify(record)}\n`)
}

@Injectable()
export class AppLogger implements LoggerService {
  constructor(@Inject(ReportStore) private readonly store: ReportStore) {}

  private emit(level: string, message: unknown, parameters: unknown[]) {
    const record = serverRecord(level, message, parameters)
    printReport(record)
    void this.store.accept([record]).catch(() => process.stderr.write('Log persistence failed; check LOG_DIR and queue capacity\n'))
  }

  log(message: unknown, ...parameters: unknown[]) { this.emit('info', message, parameters) }
  error(message: unknown, ...parameters: unknown[]) { this.emit('error', message, parameters) }
  warn(message: unknown, ...parameters: unknown[]) { this.emit('warn', message, parameters) }
  debug(message: unknown, ...parameters: unknown[]) { this.emit('debug', message, parameters) }
  verbose(message: unknown, ...parameters: unknown[]) { this.emit('debug', message, parameters) }
  fatal(message: unknown, ...parameters: unknown[]) { this.emit('fatal', message, parameters) }
}

function readBody(req: IncomingMessage): Promise<unknown> {
  const limit = 128 * 1024
  if (Number(req.headers['content-length']) > limit) return Promise.reject(new HttpException('Payload too large', 413))
  return new Promise((resolveBody, reject) => {
    const chunks: Buffer[] = []
    let bytes = 0
    let settled = false
    const cleanup = () => {
      clearTimeout(timer)
      req.off('data', data)
      req.off('end', end)
      req.off('error', failure)
      req.off('aborted', aborted)
    }
    const finish = (error?: HttpException) => {
      if (settled) return
      settled = true
      cleanup()
      if (error) { req.resume(); reject(error); return }
      try { resolveBody(JSON.parse(Buffer.concat(chunks).toString('utf8'))) }
      catch { reject(new HttpException('Invalid JSON', 400)) }
    }
    const data = (chunk: Buffer) => {
      bytes += chunk.length
      if (bytes > limit) finish(new HttpException('Payload too large', 413))
      else chunks.push(chunk)
    }
    const end = () => finish()
    const failure = () => finish(new HttpException('Request failed', 400))
    const aborted = () => finish(new HttpException('Request aborted', 400))
    const timer = setTimeout(() => finish(new HttpException('Request timed out', 408)), 5000)
    req.on('data', data).once('end', end).once('error', failure).once('aborted', aborted)
  })
}

@Controller('collect')
class ReportingController {
  constructor(@Inject(ReportStore) private readonly store: ReportStore, @Inject(SessionTracker) private readonly sessions: SessionTracker) {}

  @All()
  async collect(@Req() req: IncomingMessage, @Res() res: ServerResponse) {
    res.setHeader('Access-Control-Allow-Origin', '*')
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
    res.setHeader('Cache-Control', 'no-store')
    if (req.method === 'OPTIONS') { res.writeHead(204).end(); return }
    if (req.method !== 'POST') { res.setHeader('Allow', 'POST, OPTIONS'); res.writeHead(405).end(); return }
    try {
      let records: ReportRecord[]
      const payload = await readBody(req)
      try { records = parseReports(payload) } catch { throw new HttpException('Invalid report batch', 400) }
      const inserted = await this.store.accept(records)
      // Heartbeats outside a game only keep the session alive; printing one every 30 s per open page is noise.
      inserted.filter(record => record.type !== 'heartbeat' || record.play_id).forEach(printReport)
      // The events are stored: a session-table failure must not refuse them (a retry would be deduplicated anyway).
      await this.sessions.observe(inserted).catch(() => process.stderr.write('Session tracking failed; events were stored\n'))
      res.writeHead(204).end()
    } catch (error) {
      const status = error instanceof HttpException ? error.getStatus() : 503
      if (status >= 500) process.stderr.write('Report persistence failed; batch was not acknowledged\n')
      res.setHeader('Connection', 'close')
      res.writeHead(status, { 'Content-Type': 'application/json' }).end(JSON.stringify({ error: status === 503 ? 'reporting_unavailable' : status === 413 ? 'payload_too_large' : 'invalid_report' }))
    }
  }
}

@Catch()
class ReportingExceptionFilter implements ExceptionFilter {
  constructor(@Inject(AppLogger) private readonly logger: AppLogger) {}

  catch(error: unknown, host: ArgumentsHost) {
    const response = host.switchToHttp().getResponse<ServerResponse>()
    const request = host.switchToHttp().getRequest<IncomingMessage>()
    const status = error instanceof HttpException ? error.getStatus() : 500
    this.logger.error(error, { method: request.method, path: redact((request.url || '').split(/[?#]/)[0], 500), status })
    if (response.headersSent) { response.destroy(); return }
    response.writeHead(status, { 'Content-Type': 'application/json' }).end(JSON.stringify({ error: status >= 500 ? 'internal_error' : 'request_failed' }))
  }
}

@Module({
  controllers: [ReportingController],
  providers: [
    { provide: FeishuSink, useFactory: () => new FeishuSink(feishuConfig()) },
    { provide: ReportStore, useFactory: (sink: FeishuSink) => new ReportStore(logDirectory(), sink), inject: [FeishuSink] },
    { provide: SessionTracker, useFactory: (sink: FeishuSink) => new SessionTracker(logDirectory(), sink), inject: [FeishuSink] },
    AppLogger,
    { provide: APP_FILTER, useClass: ReportingExceptionFilter },
  ],
  exports: [ReportStore, AppLogger],
})
export class ReportingModule implements OnModuleInit, OnModuleDestroy {
  constructor(@Inject(ReportStore) private readonly store: ReportStore, @Inject(SessionTracker) private readonly sessions: SessionTracker, @Inject(FeishuSink) private readonly sink: FeishuSink) {}
  onModuleInit() {
    // Said once at startup: otherwise a missing variable only shows as an empty sheet.
    if (!this.sink.enabled) process.stderr.write('Feishu sync is off (FEISHU_* not all set); reports stay in the console and LOG_DIR\n')
    else if (!this.sink.sessionsEnabled) process.stderr.write('Feishu session sheet is off (FEISHU_SESSION_SHEET_ID not set); session state stays in LOG_DIR/sessions.json\n')
    this.store.start()
    this.sessions.start()
  }
  async onModuleDestroy() { await Promise.all([this.store.close(), this.sessions.close()]) }
}
