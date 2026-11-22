import { describe, expect, it } from 'vitest'
import { enrichMrpCatalog, normalizeMrpManifest } from '../src/mrpCatalog.js'

describe('MRP catalog', () => {
  it('normalizes safe records and rejects empty or unsafe catalogs', () => {
    expect(normalizeMrpManifest([{ file: 'demo.mrp', name: 'Demo' }])).toHaveLength(1)
    expect(() => normalizeMrpManifest([])).toThrow()
    expect(() => normalizeMrpManifest([{ file: '../demo.mrp' }])).toThrow()
  })

  it('accepts single-slash local artwork and HTTPS artwork only', () => {
    expect(enrichMrpCatalog([{ file: 'a.mrp', iconUrl: '/covers/a.png' }], false, new Set())[0].artworkUrl).toBe('/covers/a.png')
    expect(enrichMrpCatalog([{ file: 'a.mrp', iconUrl: '//bad.example/a.png' }], false, new Set())[0].artworkUrl).toBeNull()
    expect(enrichMrpCatalog([{ file: 'a.mrp', iconUrl: 'http://bad.example/a.png' }], false, new Set())[0].artworkUrl).toBeNull()
  })

  it('reports missing runtime and package independently', () => {
    const records = [{ file: 'demo.mrp', name: 'Demo' }, { file: 'other.mrp', name: 'Other' }]
    expect(enrichMrpCatalog(records, false, new Set(['demo.mrp']))).toMatchObject([
      { available: false, runtimeAvailable: false, gameAvailable: true, availabilityReason: 'MRP 运行时未安装' },
      { available: false, runtimeAvailable: false, gameAvailable: false },
    ])
    expect(enrichMrpCatalog(records, true, new Set(['demo.mrp']))[0]).toMatchObject({ available: true, artworkUrl: null })
  })
})
