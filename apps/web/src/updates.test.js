import assert from 'node:assert/strict'
import test from 'node:test'
import { compareVersions, fetchRemoteMeta, parseAnnouncements } from './updates.js'

test('compares dotted versions numerically and ignores a leading v', () => {
  assert.ok(compareVersions('1.10.0', '1.9.9') > 0)
  assert.ok(compareVersions('v1.2', '1.2.1') < 0)
  assert.equal(compareVersions('v1.2.0', '1.2'), 0)
})

test('keeps active, well-formed, undismissed announcements with https links only', () => {
  const now = Date.parse('2026-11-27T00:00:00Z')
  const items = parseAnnouncements([
    { id: 'a', title: '维护', body: '今晚维护', url: 'https://example.com' },
    { id: 'b', title: '已关闭' },
    { id: 'c', title: '未开始', start: '2026-12-01' },
    { id: 'd', title: '已过期', end: '2026-11-01' },
    { id: 'e', title: '外链', url: 'javascript:alert(1)' },
    { title: '缺 id' },
    null,
  ], { now, dismissed: ['b'] })
  assert.deepEqual(items, [
    { id: 'a', title: '维护', body: '今晚维护', url: 'https://example.com' },
    { id: 'e', title: '外链', body: '', url: '' },
  ])
  assert.deepEqual(parseAnnouncements({ id: 'x' }), [])
})

test('reads version and announcements from GitHub main, falling back to the jsDelivr mirror', async () => {
  const requested = []
  const fetcher = async (url) => {
    requested.push(url)
    if (url.startsWith('https://raw.githubusercontent.com/')) throw new Error('blocked')
    const body = url.endsWith('/package.json') ? { version: '1.2.0' } : [{ id: 'a', title: '公告' }]
    return { ok: true, json: async () => body }
  }
  assert.deepEqual(await fetchRemoteMeta(fetcher), { version: '1.2.0', announcements: [{ id: 'a', title: '公告' }] })
  assert.ok(requested.every(url => /^https:\/\/(raw\.githubusercontent\.com\/Chao-qin\/bawanggame\/main|cdn\.jsdelivr\.net\/gh\/Chao-qin\/bawanggame@main)\//.test(url)))
  assert.ok(requested.some(url => url.startsWith('https://cdn.jsdelivr.net/')))
})

test('a source that fails everywhere leaves only that part null', async () => {
  const fetcher = async (url) => url.endsWith('/package.json')
    ? { ok: false, status: 404 }
    : { ok: true, json: async () => [{ id: 'a', title: '公告' }] }
  assert.deepEqual(await fetchRemoteMeta(fetcher), { version: null, announcements: [{ id: 'a', title: '公告' }] })
})

test('a request that never answers times out and falls back to the mirror', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] })
  const fetcher = (url, { signal }) => url.startsWith('https://raw.githubusercontent.com/')
    ? new Promise((_, reject) => signal.addEventListener('abort', () => reject(new Error('aborted'))))
    : Promise.resolve({ ok: true, json: async () => (url.endsWith('/package.json') ? { version: '2.0.0' } : []) })
  const pending = fetchRemoteMeta(fetcher)
  t.mock.timers.tick(8000)
  assert.deepEqual(await pending, { version: '2.0.0', announcements: [] })
})
