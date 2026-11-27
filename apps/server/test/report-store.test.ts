import { mkdtemp, readdir, rm, utimes } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ReportQueueFullError, ReportStore, type ReportSink } from '../src/reporting/report-store.js'
import type { ReportRecord } from '../src/reporting/report-record.js'

const record = (id: string, category: ReportRecord['category'] = 'usage'): ReportRecord => ({ id, category, device_id: 'device', received_at: '2026-11-26T00:00:00.000Z', environment: 'test', level: 'info', type: 'app_open', ts: 1 })
const directories: string[] = []
const stores: ReportStore[] = []
async function setup(sink: ReportSink = { enabled: true, append: vi.fn(async () => {}) }) {
  const directory = await mkdtemp(join(tmpdir(), 'report-store-test-'))
  directories.push(directory)
  const store = new ReportStore(directory, sink)
  stores.push(store)
  return { directory, store, sink }
}
afterEach(async () => {
  await Promise.all(stores.splice(0).map(store => store.close().catch(() => {})))
  await Promise.all(directories.splice(0).map(directory => rm(directory, { recursive: true, force: true })))
})

describe('ReportStore', () => {
  it('gives heartbeats outside a game a receipt at once: deduplicated, never queued or sent to the event sheet', async () => {
    const disabled = { enabled: false, append: vi.fn(async () => {}) }
    const { store, directory } = await setup(disabled)
    const lobby = { ...record('lobby'), type: 'heartbeat' }
    const play = { ...record('play'), type: 'heartbeat', play_id: 'play-1' }
    expect((await store.accept([lobby, play])).map(item => item.id)).toEqual(['lobby', 'play'])
    expect(await store.accept([lobby])).toEqual([])
    expect(await readdir(join(directory, 'pending'))).toHaveLength(1)
    expect(await readdir(join(directory, 'sent'))).toHaveLength(1)
    const enabled = await setup()
    await enabled.store.accept([{ ...record('lobby-3'), type: 'heartbeat' }])
    await enabled.store.flush()
    expect(enabled.sink.append).not.toHaveBeenCalled()
  })

  it('recovers pending records and keeps sent receipts across restarts', async () => {
    const { store, directory, sink } = await setup()
    expect(await store.accept([record('a'), record('a')])).toHaveLength(1)
    await store.close()
    const recovered = new ReportStore(directory, sink)
    stores.push(recovered)
    expect(await recovered.accept([record('a')])).toEqual([])
    await recovered.flush()
    expect(sink.append).toHaveBeenCalledWith([expect.objectContaining({ id: 'a' })])
    await recovered.close()
    const third = new ReportStore(directory, sink)
    stores.push(third)
    expect(await third.accept([record('a')])).toEqual([])
    expect(await readdir(join(directory, 'pending'))).toEqual([])
  })

  it('keeps failed groups and acknowledges only successful batches', async () => {
    const append = vi.fn().mockResolvedValueOnce(undefined).mockRejectedValueOnce(new Error('offline')).mockResolvedValue(undefined)
    const { store, directory } = await setup({ enabled: true, append })
    await store.accept(Array.from({ length: 51 }, (_, i) => record(String(i))))
    await store.accept([record('error', 'client_error')])
    await expect(store.flush()).rejects.toThrow('offline')
    expect(await readdir(join(directory, 'pending'))).toHaveLength(2)
    await store.flush()
    expect(append.mock.calls.map(call => call[0].length)).toEqual([50, 1, 1, 1])
    expect(append.mock.calls.at(-1)?.[0][0].category).toBe('client_error')
    expect(await readdir(join(directory, 'pending'))).toHaveLength(0)
  })

  it('does not block acceptance during network I/O and shares concurrent flushes', async () => {
    let release!: () => void
    let entered!: () => void
    const enteredPromise = new Promise<void>(resolve => { entered = resolve })
    const append = vi.fn(async () => { entered(); await new Promise<void>(resolve => { release = resolve }) })
    const { store, directory } = await setup({ enabled: true, append })
    await Promise.all([store.accept([record('a')]), store.accept([record('a')])])
    const flushing = store.flush()
    expect(store.flush()).toBe(flushing)
    await enteredPromise
    expect(await store.accept([record('a'), record('b')])).toEqual([record('b')])
    let closed = false
    const closing = store.close().then(() => { closed = true })
    await Promise.resolve()
    expect(closed).toBe(false)
    release()
    await Promise.all([flushing, closing])
    expect(append).toHaveBeenCalledTimes(1)
    expect(await readdir(join(directory, 'pending'))).toHaveLength(1)
  })

  it('keeps local data when disabled and expires receipts after seven days', async () => {
    const { store, directory, sink } = await setup({ enabled: false, append: vi.fn(async () => {}) })
    await store.accept([record('a')])
    await store.flush()
    expect(sink.append).not.toHaveBeenCalled()
    await store.close()
    const enabled = new ReportStore(directory, { enabled: true, append: vi.fn(async () => {}) })
    stores.push(enabled)
    await enabled.flush()
    const [receipt] = await readdir(join(directory, 'sent'))
    const old = new Date(Date.now() - 8 * 86400000)
    await utimes(join(directory, 'sent', receipt), old, old)
    expect(await enabled.accept([record('a')])).toHaveLength(1)
  })

  it('rejects a batch exceeding byte capacity without partially accepting it', async () => {
    const { store, directory } = await setup()
    const huge = { ...record('large'), message: 'x'.repeat(50 * 1024 * 1024) }
    await expect(store.accept([record('small'), huge])).rejects.toBeInstanceOf(ReportQueueFullError)
    expect(await readdir(join(directory, 'pending'))).toHaveLength(0)
    expect(await store.accept([record('small')])).toHaveLength(1)
  })

  it('rejects an oversized batch by pending count before writing any record', async () => {
    const { store, directory } = await setup()
    await expect(store.accept(Array.from({ length: 5001 }, (_, i) => record(String(i))))).rejects.toBeInstanceOf(ReportQueueFullError)
    expect(await readdir(join(directory, 'pending'))).toEqual([])
  })

  it('stops before the next batch when closing and preserves the remainder', async () => {
    let release!: () => void
    let entered!: () => void
    const started = new Promise<void>(resolve => { entered = resolve })
    const append = vi.fn(async () => { entered(); await new Promise<void>(resolve => { release = resolve }) })
    const { store, directory } = await setup({ enabled: true, append })
    await store.accept(Array.from({ length: 51 }, (_, i) => record(String(i))))
    const flight = store.flush()
    await started
    const closing = store.close()
    release()
    await Promise.all([closing, flight])
    expect(append).toHaveBeenCalledTimes(1)
    expect(await readdir(join(directory, 'pending'))).toHaveLength(1)
  })

  it('does not fail shutdown if the in-flight sink fails', async () => {
    let reject!: (error: Error) => void
    let entered!: () => void
    const started = new Promise<void>(resolve => { entered = resolve })
    const { store, directory } = await setup({ enabled: true, append: async () => {
      entered()
      await new Promise<void>((_resolve, rejectPromise) => { reject = rejectPromise })
    } })
    await store.accept([record('a')])
    const flight = store.flush().catch(() => {})
    await started
    const closing = store.close()
    reject(new Error('offline'))
    await expect(closing).resolves.toBeUndefined()
    await flight
    expect(await readdir(join(directory, 'pending'))).toHaveLength(1)
  })
})
