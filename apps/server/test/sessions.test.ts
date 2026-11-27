import { chmod, mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Cell } from '../src/reporting/feishu-sink.js'
import type { ReportRecord } from '../src/reporting/report-record.js'
import { SESSION_TIMEOUT_MS, SessionTracker, type SessionSink } from '../src/reporting/sessions.js'

const START = Date.parse('2026-11-27T00:00:00.000Z')
const game = { kind: 'j2me', file: 'snake.jar', name: '贪吃蛇', local: false }
let seq = 0
const record = (type: string, fields: Partial<ReportRecord> = {}): ReportRecord => ({
  id: `${type}-${Math.random()}`, received_at: new Date(START).toISOString(), environment: 'test', category: 'usage', level: 'info', type, ts: 1,
  device_id: 'device-1', platform: 'web', session_id: 'session-1', seq: ++seq, ...fields,
})
const inPlay = (type: string, fields: Partial<ReportRecord> = {}) => record(type, { play_id: 'play-1', game, ...fields })

class FakeSink implements SessionSink {
  sessionsEnabled = true
  rows = new Map<number, Cell[]>()
  next = 2
  appendSessions = vi.fn(async (rows: Cell[][]) => {
    const first = this.next
    for (const row of rows) this.rows.set(this.next++, row)
    return first
  })
  updateSessions = vi.fn(async (rows: { row: number; values: Cell[] }[]) => { for (const { row, values } of rows) this.rows.set(row, values) })
  row(kind: '应用' | '游玩') {
    const row = [...this.rows.values()].find(values => values[0] === kind)!
    return { id: row[1], game: row[8], lastAck: row[10], seq: row[11], acks: row[12], active: row[13], status: row[14], ended: row[15] }
  }
}

const directories: string[] = []
const trackers: SessionTracker[] = []
async function setup(sink = new FakeSink(), directory?: string) {
  directory ??= await mkdtemp(join(tmpdir(), 'sessions-test-'))
  directories.push(directory)
  const clock = { now: START }
  const tracker = new SessionTracker(directory, sink, () => clock.now)
  trackers.push(tracker)
  return { tracker, sink, clock, directory }
}
afterEach(async () => {
  await Promise.all(trackers.splice(0).map(tracker => tracker.close()))
  await Promise.all(directories.splice(0).map(directory => rm(directory, { recursive: true, force: true })))
})

describe('SessionTracker', () => {
  it('opens the app session on the first event and ends it at the last acknowledgement once they stop, as when the browser is closed', async () => {
    const { tracker, sink, clock } = await setup()
    await tracker.observe([record('app_open', { seq: 1 })])
    await tracker.sync()
    expect(sink.row('应用')).toMatchObject({ id: 'session-1', status: '进行中', seq: 1, acks: 1 })
    clock.now += 30_000
    await tracker.observe([record('heartbeat', { seq: 2 })])
    const lastAck = new Date(clock.now).toISOString()
    clock.now += SESSION_TIMEOUT_MS
    await tracker.sync()
    expect(sink.row('应用')).toMatchObject({ status: '进行中', seq: 2, acks: 2, lastAck })
    clock.now += 1
    await tracker.sync()
    expect(sink.row('应用')).toMatchObject({ status: '超时结束', ended: lastAck })
    expect(sink.appendSessions).toHaveBeenCalledTimes(1)
    expect(sink.rows.size).toBe(1)
  })

  it('tracks a play inside the session: exit ends the play only, closing the page ends both', async () => {
    const { tracker, sink, clock } = await setup()
    await tracker.observe([record('app_open'), inPlay('game_start'), inPlay('heartbeat', { active_ms: 30_000 })])
    await tracker.sync()
    expect(sink.rows.size).toBe(2)
    expect(sink.row('游玩')).toMatchObject({ id: 'play-1', game: '贪吃蛇', status: '进行中', acks: 2, active: 30_000 })
    expect(sink.row('应用')).toMatchObject({ acks: 3, active: 30_000 })
    await tracker.observe([inPlay('game_end', { active_ms: 5000, received_at: '2026-11-27T00:01:00.000Z' })])
    await tracker.sync()
    expect(sink.row('游玩')).toMatchObject({ status: '已退出', ended: '2026-11-27T00:01:00.000Z', active: 35_000 })
    expect(sink.row('应用').status).toBe('进行中')
    const next = { play_id: 'play-2' }
    await tracker.observe([inPlay('game_start', next)])
    clock.now += SESSION_TIMEOUT_MS + 1
    await tracker.sync()
    const plays = [...sink.rows.values()].filter(values => values[0] === '游玩').map(values => [values[1], values[14]])
    expect(plays).toEqual([['play-1', '已退出'], ['play-2', '超时结束']])
    expect(sink.row('应用').status).toBe('超时结束')
  })

  it('continues a timed-out session that acknowledges again (the page was only in the background)', async () => {
    const { tracker, sink, clock } = await setup()
    await tracker.observe([record('app_open')])
    clock.now += SESSION_TIMEOUT_MS + 1
    await tracker.sync()
    expect(sink.row('应用').status).toBe('超时结束')
    await tracker.observe([record('heartbeat')])
    await tracker.sync()
    expect(sink.row('应用')).toMatchObject({ status: '进行中', ended: undefined, acks: 2 })
    expect(sink.rows.size).toBe(1)
  })

  it('ignores server logs, counts client errors as acknowledgements, and keeps a change made while its row is written', async () => {
    const sink = new FakeSink()
    let release!: () => void
    sink.appendSessions.mockImplementationOnce(async (rows: Cell[][]) => {
      await new Promise<void>(resolve => { release = resolve })
      rows.forEach((row, index) => sink.rows.set(2 + index, row))
      return 2
    })
    const { tracker } = await setup(sink)
    await tracker.observe([record('server_log', { category: 'server', session_id: undefined }), record('app_open')])
    const writing = tracker.sync()
    await vi.waitFor(() => expect(release).toBeTypeOf('function'))
    await tracker.observe([record('client_error', { category: 'client_error' })])
    release()
    await writing
    expect(sink.rows.size).toBe(1)
    expect(sink.row('应用').acks).toBe(1)
    await tracker.sync()
    expect(sink.row('应用').acks).toBe(2)
    expect(sink.updateSessions).toHaveBeenCalledTimes(1)
  })

  it('survives a restart: rows are not appended twice and silent sessions still time out', async () => {
    const sink = new FakeSink()
    const { tracker, directory, clock } = await setup(sink)
    await tracker.observe([record('app_open')])
    await tracker.sync()
    await tracker.close()
    const restarted = new SessionTracker(directory, sink, () => clock.now)
    trackers.push(restarted)
    clock.now += SESSION_TIMEOUT_MS + 1
    await restarted.sync()
    expect(sink.appendSessions).toHaveBeenCalledTimes(1)
    expect(sink.row('应用').status).toBe('超时结束')
  })

  it('keeps rows to write while Feishu fails, and only saves locally when the sheet is not configured', async () => {
    const sink = new FakeSink()
    sink.appendSessions.mockRejectedValueOnce(new Error('Feishu down'))
    const { tracker } = await setup(sink)
    await tracker.observe([record('app_open')])
    await expect(tracker.sync()).rejects.toThrow('Feishu down')
    await tracker.sync()
    expect(sink.rows.size).toBe(1)
    const disabled = new FakeSink()
    disabled.sessionsEnabled = false
    const other = await setup(disabled)
    await other.tracker.observe([record('app_open')])
    await other.tracker.sync()
    expect(disabled.appendSessions).not.toHaveBeenCalled()
    // Ended sessions are still dropped after a week, so the local state does not grow without a sheet.
    other.clock.now += SESSION_TIMEOUT_MS + 1
    await other.tracker.sync()
    other.clock.now += 7 * 24 * 60 * 60 * 1000
    await other.tracker.sync()
    expect(JSON.parse(await readFile(join(other.directory, 'sessions.json'), 'utf8'))).toEqual([])
  })

  it('re-appends a row whose number Feishu did not return, and updates known rows in batches of 100', async () => {
    const sink = new FakeSink()
    sink.appendSessions.mockResolvedValueOnce(0)
    const { tracker } = await setup(sink)
    await tracker.observe([record('app_open')])
    await tracker.sync()
    await tracker.observe([record('heartbeat')])
    await tracker.sync()
    expect(sink.appendSessions).toHaveBeenCalledTimes(2)
    expect(sink.updateSessions).not.toHaveBeenCalled()
    const many = await setup()
    const opens = Array.from({ length: 150 }, (_, index) => record('app_open', { session_id: `s-${index}` }))
    await many.tracker.observe(opens)
    await many.tracker.sync()
    await many.tracker.observe(opens.map(open => ({ ...open, id: `beat-${open.session_id}`, type: 'heartbeat' })))
    await many.tracker.sync()
    expect(many.sink.updateSessions.mock.calls.map(([rows]) => rows.length)).toEqual([100, 50])
  })

  it('drops ended, written sessions after a week, and retries a state file it could not read without blanking it', async () => {
    const { tracker, sink, clock, directory } = await setup()
    await tracker.observe([record('app_open')])
    clock.now += SESSION_TIMEOUT_MS + 1
    await tracker.sync()
    clock.now += 7 * 24 * 60 * 60 * 1000
    await tracker.sync()
    expect(JSON.parse(await readFile(join(directory, 'sessions.json'), 'utf8'))).toEqual([])
    expect(sink.rows.size).toBe(1)

    const saved = await setup()
    await saved.tracker.observe([record('app_open', { session_id: 'kept' })])
    await saved.tracker.sync()
    await saved.tracker.close()
    const file = join(saved.directory, 'sessions.json')
    const content = await readFile(file, 'utf8')
    await chmod(file, 0)
    const unreadable = new SessionTracker(saved.directory, saved.sink, () => saved.clock.now)
    trackers.push(unreadable)
    const denied = process.getuid?.() !== 0 // root can read a mode-0 file
    if (denied) await expect(unreadable.observe([record('heartbeat', { session_id: 'kept' })])).rejects.toThrow()
    await unreadable.close()
    await chmod(file, 0o600)
    expect(await readFile(file, 'utf8')).toBe(content)
    const retried = new SessionTracker(saved.directory, saved.sink, () => saved.clock.now)
    trackers.push(retried)
    await retried.observe([record('heartbeat', { session_id: 'kept' })])
    await retried.sync()
    expect(saved.sink.appendSessions).toHaveBeenCalledTimes(1)
  })

  it('appends a large backlog in batches of at most 100 rows', async () => {
    const { tracker, sink } = await setup()
    await tracker.observe(Array.from({ length: 250 }, (_, index) => record('app_open', { session_id: `session-${index}` })))
    await tracker.sync()
    expect(sink.appendSessions.mock.calls.map(([rows]) => rows.length)).toEqual([100, 100, 50])
    expect(new Set([...sink.rows.keys()]).size).toBe(250)
  })
})
