import { randomUUID } from 'node:crypto'

export type ReportCategory = 'usage' | 'client_error' | 'server'
export type ReportRecord = {
  id: string
  received_at: string
  environment: string
  category: ReportCategory
  level: string
  type: string
  ts: number
  device_id?: string
  platform?: string
  session_id?: string
  play_id?: string
  game?: { kind: string; file: string; name: string; local: boolean }
  active_ms?: number
  message?: string
  context?: string
  error?: { kind: string; message: string; stack: string; url: string; context: string; line?: number; column?: number }
}

export function redact(value: unknown, limit = 2000): string {
  let text: string
  try {
    const seen = new WeakSet<object>()
    text = typeof value === 'string' ? value : value instanceof Error ? `${value.name}: ${value.message}\n${value.stack ?? ''}` : JSON.stringify(value, (key, item) => {
      if (/secret|password|authorization|cookie|token|api[_-]?key/i.test(key)) return '[REDACTED]'
      if (item && typeof item === 'object') {
        if (seen.has(item)) return '[Circular]'
        seen.add(item)
      }
      return item
    }) ?? String(value)
  } catch { text = '[Unserializable]' }
  for (const secret of [process.env.FEISHU_APP_SECRET, process.env.TURN_SECRET].filter((item): item is string => !!item)) text = text.split(secret).join('[REDACTED]')
  return text
    .replace(/\b((?:set-)?cookie)\s*:\s*[^\r\n]*/gi, '$1: [REDACTED]')
    .replace(/(\b[\w-]*(?:authorization|cookie|password|token|secret|api[_-]?key)["']?\s*[:=]\s*)(?:"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|(?:Bearer\s+)?[^\s,;"'}]+)/gi, '$1[REDACTED]')
    .replace(/\bBearer\s+[^\s,;"']+/gi, 'Bearer [REDACTED]')
    .replace(/https?:\/\/[^\s<>"')]+/gi, raw => {
      try { const url = new URL(raw); return `${url.origin}${url.pathname}` } catch { return '[URL]' }
    }).slice(0, limit)
}

function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('expected object')
  return value as Record<string, unknown>
}

function identifier(value: unknown, max = 128): string {
  if (typeof value !== 'string' || !value.trim() || value.length > max) throw new Error('invalid identifier')
  return redact(value, max)
}

export function environment() { return redact(process.env.LOG_ENV || process.env.NODE_ENV || 'development', 64) }

export function serverRecord(level: string, message: unknown, context?: unknown): ReportRecord {
  return { id: randomUUID(), received_at: new Date().toISOString(), environment: environment(), category: 'server', level, type: 'server_log', ts: Date.now(), message: redact(message), context: redact(context ?? '', 1000) }
}

export function parseReports(value: unknown): ReportRecord[] {
  const body = object(value)
  if (body.v !== 1 || !Array.isArray(body.events) || !body.events.length || body.events.length > 50) throw new Error('invalid batch')
  const deviceId = identifier(body.device_id)
  const platform = identifier(body.platform, 32)
  const receivedAt = new Date().toISOString()
  return body.events.map(item => {
    const event = object(item)
    const type = identifier(event.type, 32)
    if (!['app_open', 'game_start', 'heartbeat', 'game_end', 'client_error'].includes(type)) throw new Error('invalid event type')
    if (typeof event.ts !== 'number' || !Number.isSafeInteger(event.ts) || Math.abs(event.ts) > 8.64e15) throw new Error('invalid timestamp')
    const record: ReportRecord = { id: identifier(event.id), received_at: receivedAt, environment: environment(), category: type === 'client_error' ? 'client_error' : 'usage', level: type === 'client_error' ? 'error' : 'info', type, ts: event.ts, device_id: deviceId, platform, session_id: identifier(event.session_id) }
    if (event.play_id !== undefined) record.play_id = identifier(event.play_id)
    if (event.game !== undefined) {
      const game = object(event.game)
      const kind = identifier(game.kind, 32)
      if (!['j2me', 'maopao', 'flash', 'local-revival'].includes(kind)) throw new Error('invalid game kind')
      record.game = { kind, file: redact(identifier(game.file, 200), 200), name: redact(game.name ?? game.file, 200), local: game.local === true }
    }
    if (['game_start', 'heartbeat', 'game_end'].includes(type) && (!record.play_id || !record.game)) throw new Error('missing game')
    if (type === 'heartbeat' || type === 'game_end') {
      if (typeof event.active_ms !== 'number' || !Number.isSafeInteger(event.active_ms) || event.active_ms < 0) throw new Error('invalid duration')
      record.active_ms = event.active_ms
    }
    if (type === 'client_error') {
      const error = object(event.error)
      record.error = { kind: redact(identifier(error.kind, 80), 80), message: redact(error.message), stack: redact(error.stack ?? '', 6000), url: redact(error.url ?? '', 500), context: redact(error.context ?? '', 1000) }
      for (const key of ['line', 'column'] as const) if (typeof error[key] === 'number' && Number.isSafeInteger(error[key]) && error[key] >= 0) record.error[key] = error[key]
    }
    return record
  })
}
