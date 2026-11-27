import { Logger } from '@nestjs/common'
import type { IncomingMessage, ServerResponse } from 'node:http'

const logger = new Logger('Http')

export function requestUrl(req: IncomingMessage) {
  return new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`)
}

export function sendJson(res: ServerResponse, status: number, value: unknown, cause?: unknown) {
  if (status >= 500) logger.error(cause ?? value)
  res.writeHead(status, {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-cache',
  })
  res.end(JSON.stringify(value))
}
