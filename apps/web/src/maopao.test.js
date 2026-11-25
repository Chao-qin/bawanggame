import test from 'node:test'
import assert from 'node:assert/strict'
import { mrpBadges, mrpFileUrl, MRP_REMOTE_BASE, normalizeMrpEntry, resolveMrpFileUrl } from './maopao.js'

const catalog = [
  { file: 'a b.mrp', name: 'A', bundled: true, compat: 'alive' },
  { file: 'c.mrp', name: 'C', bundled: false, compat: 'frozen' },
  { file: 'd.mrp', name: 'D' },
]
const fetchCatalog = async () => ({ ok: true, json: async () => catalog })

test('a packed game loads locally, an unpacked one from the public mirror', () => {
  assert.equal(mrpFileUrl('a b.mrp', catalog[0]), '/maopao/public/mrps/a%20b.mrp')
  assert.equal(mrpFileUrl('c.mrp', catalog[1]), MRP_REMOTE_BASE + 'c.mrp')
  // The desktop server's catalog has no flag: every game is in its vendor checkout.
  assert.equal(mrpFileUrl('d.mrp', catalog[2]), '/maopao/public/mrps/d.mrp')
})

test('resolving from the catalog covers a game started from its URL', async () => {
  assert.equal(await resolveMrpFileUrl('c.mrp', fetchCatalog), MRP_REMOTE_BASE + 'c.mrp')
  assert.equal(await resolveMrpFileUrl('a b.mrp', fetchCatalog), '/maopao/public/mrps/a%20b.mrp')
  assert.equal(await resolveMrpFileUrl('missing.mrp', fetchCatalog), '/maopao/public/mrps/missing.mrp')
  assert.equal(await resolveMrpFileUrl('c.mrp', async () => { throw new Error('offline') }), '/maopao/public/mrps/c.mrp')
})

test('library entries keep the availability fields and show them as badges', () => {
  const entries = catalog.map(normalizeMrpEntry)
  assert.deepEqual(entries.map((entry) => [entry.bundled, entry.compat]), [[true, 'alive'], [false, 'frozen'], [true, null]])
  assert.deepEqual(entries.map(mrpBadges), [[], ['需联网', '可能无法运行'], []])
})
