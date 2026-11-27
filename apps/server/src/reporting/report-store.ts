import { createHash, randomUUID } from 'node:crypto'
import { mkdir, open, readdir, readFile, rename, stat, unlink } from 'node:fs/promises'
import { join } from 'node:path'
import type { ReportRecord } from './report-record.js'

export interface ReportSink {
  readonly enabled: boolean
  append(records: ReportRecord[]): Promise<void>
}

export class ReportQueueFullError extends Error {
  constructor() { super('Report queue is full'); this.name = 'ReportQueueFullError' }
}

const MAX_BYTES = 50 * 1024 * 1024
const MAX_RECORDS = 5000
const RETENTION = 7 * 24 * 60 * 60 * 1000
const keyOf = (record: ReportRecord) => createHash('sha256').update(JSON.stringify([record.category, record.device_id ?? '', record.id])).digest('hex')

export class ReportStore {
  private readonly pending: string
  private readonly sent: string
  private readonly entries = new Map<string, number>()
  private bytes = 0
  private tail: Promise<unknown> = Promise.resolve()
  private ready?: Promise<void>
  private flight?: Promise<void>
  private timer?: ReturnType<typeof setInterval>
  private closed = false

  constructor(directory: string, private readonly sink: ReportSink) {
    this.pending = join(directory, 'pending')
    this.sent = join(directory, 'sent')
  }

  private serial<T>(operation: () => Promise<T>): Promise<T> {
    const next = this.tail.then(operation)
    this.tail = next.catch(() => {})
    return next
  }

  private async syncDirectory(directory: string) {
    const handle = await open(directory, 'r')
    try { await handle.sync() } finally { await handle.close() }
  }

  private async atomic(directory: string, key: string, data: string) {
    const temporary = join(directory, `${key}.${randomUUID()}.tmp`)
    const handle = await open(temporary, 'wx', 0o600)
    try { await handle.writeFile(data); await handle.sync() } finally { await handle.close() }
    await rename(temporary, join(directory, `${key}.json`))
    await this.syncDirectory(directory)
  }

  private async cleanup() {
    for (const file of await readdir(this.sent)) {
      if (!/^[a-f0-9]{64}\.json$/.test(file)) continue
      if (Date.now() - (await stat(join(this.sent, file))).mtimeMs > RETENTION) await unlink(join(this.sent, file))
    }
  }

  private initialize(): Promise<void> {
    return this.ready ??= (async () => {
      await mkdir(this.pending, { recursive: true })
      await mkdir(this.sent, { recursive: true })
      const receipts = new Set(await readdir(this.sent))
      for (const file of await readdir(this.pending)) {
        if (!/^[a-f0-9]{64}\.json$/.test(file)) continue
        if (receipts.has(file)) { await unlink(join(this.pending, file)); continue }
        const size = (await stat(join(this.pending, file))).size
        this.entries.set(file.slice(0, -5), size)
        this.bytes += size
      }
      await this.cleanup()
    })()
  }

  accept(records: ReportRecord[]): Promise<ReportRecord[]> {
    if (this.closed) return Promise.reject(new Error('Report store is closed'))
    return this.serial(async () => {
      await this.initialize()
      const fresh = new Map<string, { record: ReportRecord; data: string }>()
      for (const record of records) {
        const key = keyOf(record)
        if (this.entries.has(key) || fresh.has(key)) continue
        try {
          const receipt = await stat(join(this.sent, `${key}.json`))
          if (Date.now() - receipt.mtimeMs <= RETENTION) continue
          await unlink(join(this.sent, `${key}.json`))
        } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error }
        fresh.set(key, { record, data: JSON.stringify(record) })
      }
      const size = [...fresh.values()].reduce((sum, item) => sum + Buffer.byteLength(item.data), 0)
      if (fresh.size && (this.entries.size + fresh.size > MAX_RECORDS || this.bytes + size > MAX_BYTES)) throw new ReportQueueFullError()
      for (const [key, { data }] of fresh) {
        await this.atomic(this.pending, key, data)
        const length = Buffer.byteLength(data)
        this.entries.set(key, length)
        this.bytes += length
      }
      return [...fresh.values()].map(item => item.record)
    })
  }

  flush(): Promise<void> {
    if (this.flight) return this.flight
    if (this.closed) return Promise.resolve()
    const run = async () => {
      const snapshot = await this.serial(async () => {
        await this.initialize()
        await this.cleanup()
        return [...this.entries.keys()]
      })
      if (!this.sink.enabled) return
      const groups = new Map<string, { key: string; record: ReportRecord }[]>()
      for (const key of snapshot) {
        const record = JSON.parse(await readFile(join(this.pending, `${key}.json`), 'utf8')) as ReportRecord
        const group = groups.get(record.category) ?? []
        group.push({ key, record })
        groups.set(record.category, group)
      }
      for (const group of groups.values()) {
        for (let offset = 0; offset < group.length; offset += 50) {
          if (this.closed) return
          const batch = group.slice(offset, offset + 50)
          await this.sink.append(batch.map(item => item.record))
          await this.serial(async () => {
            for (const { key } of batch) {
              await this.atomic(this.sent, key, '')
              await unlink(join(this.pending, `${key}.json`))
              this.bytes -= this.entries.get(key) ?? 0
              this.entries.delete(key)
            }
            await this.syncDirectory(this.pending)
          })
        }
      }
    }
    this.flight = run().finally(() => { this.flight = undefined })
    return this.flight
  }

  start(): void {
    if (this.timer || this.closed) return
    this.timer = setInterval(() => {
      void this.flush().catch(() => { process.stderr.write('Report synchronization failed; queued records retained.\n') })
    }, 5000)
    this.timer.unref()
  }

  async close(): Promise<void> {
    this.closed = true
    if (this.timer) clearInterval(this.timer)
    try { await this.flight } catch {
      process.stderr.write('Report synchronization failed during shutdown; queued records retained.\n')
    } finally { await this.tail }
  }
}
