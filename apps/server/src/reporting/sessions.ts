import { mkdir, readFile } from 'node:fs/promises'
import type { Cell } from './feishu-sink.js'
import type { ReportRecord } from './report-record.js'
import { writeAtomic } from './report-store.js'

/** The part of the Feishu sink the session table needs. */
export interface SessionSink {
  readonly sessionsEnabled: boolean
  appendSessions(rows: Cell[][]): Promise<number>
  updateSessions(rows: { row: number; values: Cell[] }[]): Promise<void>
}

export type SessionKind = '应用' | '游玩'
export type SessionStatus = '进行中' | '已退出' | '超时结束'
type Session = {
  kind: SessionKind
  /** Session ID for 应用 rows, play ID for 游玩 rows. */
  id: string
  environment: string
  device_id?: string
  platform?: string
  session_id?: string
  game?: ReportRecord['game']
  started_at: string
  /** Server time of the latest acknowledgement (any event of the session or play). */
  last_ack_at: number
  last_seq: number
  acks: number
  active_ms: number
  status: SessionStatus
  ended_at?: string
  /** Sheet row once appended. */
  row?: number
  /** Changes made / changes written to Feishu; they differ while the row is out of date. */
  rev: number
  synced: number
}

// The page acknowledges every 30 s while it is in front; three missed acknowledgements end the session.
export const SESSION_TIMEOUT_MS = 90_000
const RETENTION = 7 * 24 * 60 * 60 * 1000
const FILE = 'sessions.json'
const keyOf = (kind: SessionKind, id: string) => `${kind}:${id}`

/**
 * Tracks app sessions (one page load of the SPA) and the plays inside them from the events clients send. Every event
 * acknowledges its session (and its play); acknowledgements carry the page's growing seq. A session or play that is
 * not acknowledged for SESSION_TIMEOUT_MS ends at its last acknowledgement, so closing the page, the browser or the
 * app needs no farewell request. One Feishu row per session or play is appended once and then overwritten in place.
 */
export class SessionTracker {
  private sessions = new Map<string, Session>()
  private ready?: Promise<void>
  private flight?: Promise<void>
  private timer?: ReturnType<typeof setInterval>
  private closed = false
  private saved = ''
  private loaded = false

  constructor(private readonly directory: string, private readonly sink: SessionSink, private readonly now: () => number = Date.now) {}

  private initialize(): Promise<void> {
    return this.ready ??= (async () => {
      await mkdir(this.directory, { recursive: true })
      try {
        for (const session of JSON.parse(await readFile(`${this.directory}/${FILE}`, 'utf8')) as Session[]) this.sessions.set(keyOf(session.kind, session.id), session)
      } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error }
      this.loaded = true
    })().catch(error => {
      // Retried on the next call; nothing is saved over the file until it has been read.
      this.ready = undefined
      throw error
    })
  }

  private acknowledge(kind: SessionKind, id: string, record: ReportRecord, at: number) {
    const key = keyOf(kind, id)
    let session = this.sessions.get(key)
    if (!session) {
      session = { kind, id, environment: record.environment, device_id: record.device_id, platform: record.platform, session_id: record.session_id, started_at: record.received_at, last_ack_at: at, last_seq: 0, acks: 0, active_ms: 0, status: '进行中', rev: 0, synced: 0 }
      this.sessions.set(key, session)
    }
    if (kind === '游玩') session.game ??= record.game
    session.last_ack_at = at
    session.acks++
    session.last_seq = Math.max(session.last_seq, record.seq ?? 0)
    session.active_ms += record.active_ms ?? 0
    session.rev++
    if (kind === '游玩' && record.type === 'game_end') {
      session.status = '已退出'
      session.ended_at = record.received_at
    } else if (session.status === '超时结束') {
      // The page came back (it was only in the background): the same session continues.
      session.status = '进行中'
      session.ended_at = undefined
    }
  }

  /** Takes newly accepted records (duplicates already removed by the report store). */
  async observe(records: ReportRecord[]): Promise<void> {
    await this.initialize()
    const at = this.now()
    for (const record of records) {
      if (record.category === 'server' || !record.session_id) continue
      this.acknowledge('应用', record.session_id, record, at)
      if (record.play_id && record.category === 'usage') this.acknowledge('游玩', record.play_id, record, at)
    }
  }

  /** Ends sessions whose acknowledgements stopped, then writes changed rows to Feishu and to disk. */
  sync(): Promise<void> {
    if (this.flight) return this.flight
    if (this.closed) return Promise.resolve()
    const run = async () => {
      await this.initialize()
      const at = this.now()
      for (const [key, session] of this.sessions) {
        if (session.status === '进行中' && at - session.last_ack_at > SESSION_TIMEOUT_MS) {
          session.status = '超时结束'
          session.ended_at = new Date(session.last_ack_at).toISOString()
          session.rev++
        }
        // Without a session sheet nothing is ever synced; ended sessions are still dropped after the retention period.
        const written = session.rev === session.synced || !this.sink.sessionsEnabled
        if (session.status !== '进行中' && written && at - session.last_ack_at > RETENTION) this.sessions.delete(key)
      }
      try {
        if (this.sink.sessionsEnabled) await this.write()
      } finally {
        await this.save()
      }
    }
    this.flight = run().finally(() => { this.flight = undefined })
    return this.flight
  }

  private async save() {
    const data = JSON.stringify([...this.sessions.values()])
    if (data === this.saved) return
    await writeAtomic(this.directory, FILE, data)
    this.saved = data
  }

  private async write() {
    // Revisions are taken before each request: a change arriving while it is in flight keeps its row out of date.
    const changed = [...this.sessions.values()].filter(session => session.rev !== session.synced)
    const fresh = changed.filter(session => !session.row)
    for (let offset = 0; offset < fresh.length; offset += 100) {
      const batch = fresh.slice(offset, offset + 100)
      const revisions = batch.map(session => session.rev)
      const first = await this.sink.appendSessions(batch.map(values))
      // Without the row number the session is appended again on its next change (a duplicate row, not a lost one).
      batch.forEach((session, index) => { if (first) session.row = first + index; session.synced = revisions[index] })
    }
    const known = changed.filter(session => !fresh.includes(session))
    for (let offset = 0; offset < known.length; offset += 100) {
      const batch = known.slice(offset, offset + 100)
      const revisions = batch.map(session => session.rev)
      await this.sink.updateSessions(batch.map(session => ({ row: session.row!, values: values(session) })))
      batch.forEach((session, index) => { session.synced = revisions[index] })
    }
  }

  start(): void {
    if (this.timer || this.closed) return
    this.timer = setInterval(() => {
      void this.sync().catch(() => { process.stderr.write('Session synchronization failed; session rows retained.\n') })
    }, 5000)
    this.timer.unref()
  }

  async close(): Promise<void> {
    if (this.timer) clearInterval(this.timer)
    try { await this.flight } catch {}
    this.closed = true
    if (this.loaded) await this.save().catch(() => process.stderr.write('Session state could not be saved during shutdown.\n'))
  }
}

/** 会话 columns: 类型, ID, 环境, 设备ID, 平台, 会话ID, 游戏类型, 游戏文件, 游戏名称, 开始时间, 最后确认时间, 最后序号, 确认次数, 前台时长毫秒, 状态, 结束时间. */
function values(session: Session): Cell[] {
  return [
    session.kind, session.id, session.environment, session.device_id, session.platform, session.session_id,
    session.game?.kind, session.game?.file, session.game?.name,
    session.started_at, new Date(session.last_ack_at).toISOString(), session.last_seq, session.acks, session.active_ms,
    session.status, session.ended_at,
  ]
}
