import { describe, expect, it } from 'vitest'
import { allowedStoreUrl, isZipHeader, parseStoreCatalog, parseStoreDetail, storeCatalogQuery, storeCatalogUrl, storeHosts, storeJarName } from '../src/java/javaCatalog.js'

const BASE = 'https://java.52emu.cn'

describe('52emu catalog parsing', () => {
  it('reads games, page count and total from the results block', () => {
    const html = '<div id="results"><a href="game.php?id=12">仙剑&amp;奇侠</a> (345)<br><a href="game.php?id=7"><b>雷电</b></a> (9) 共 3 页 61 条</div>\n<script></script>'
    expect(parseStoreCatalog(html, 2)).toEqual({
      games: [{ id: '12', name: '仙剑&奇侠', plays: 345 }, { id: '7', name: '雷电', plays: 9 }],
      page: 2, pages: 3, total: 61,
    })
  })

  it('rejects a page without the results block instead of reporting an empty catalog', () => {
    expect(() => parseStoreCatalog('<html>maintenance</html>', 1)).toThrow(/not recognized/)
  })

  it('clamps request parameters and builds the same 52emu URL for every caller', () => {
    const query = storeCatalogQuery(new URLSearchParams('page=999&query=%20abc%20&category=1x2&refresh=1'))
    expect(query).toEqual({ page: 371, query: 'abc', category: '12', force: true })
    expect(storeCatalogUrl(BASE, { page: 1, query: '', category: '' }).search).toBe('?q=all&p=1')
    expect(storeCatalogUrl(BASE, { page: 2, query: '', category: '5' }).search).toBe('?nsort=5&p=2')
  })
})

describe('52emu download resolution', () => {
  it('finds the title and the download link of the requested game only', () => {
    const html = '<div class="results"><h2>仙剑奇侠传 [<a href="#">x</a>]</h2></div><a href="download.php?id=10388&amp;xid=3">下载</a>'
    const detail = parseStoreDetail(html, '10388', BASE)
    expect('error' in detail).toBe(false)
    if ('error' in detail) return
    expect(detail.game.name).toBe('仙剑奇侠传')
    expect(detail.downloadUrl.href).toBe('https://java.52emu.cn/download.php?id=10388&xid=3')
    expect(parseStoreDetail(html, '1', BASE)).toEqual({ error: 'download_not_found' })
    expect(parseStoreDetail('<p>404</p>', '1', BASE)).toEqual({ error: 'game_not_found' })
  })

  it('allows only the 52emu hosts without credentials or ports', () => {
    const hosts = storeHosts(BASE)
    expect(allowedStoreUrl('http://d2.52emu.cn/a.jar', hosts).hostname).toBe('d2.52emu.cn')
    expect(() => allowedStoreUrl('https://evil.example/a.jar', hosts)).toThrow()
    expect(() => allowedStoreUrl('https://java.52emu.cn:8443/a.jar', hosts)).toThrow()
  })

  it('names the jar safely and checks the ZIP signature', () => {
    expect(storeJarName({ id: '1', name: '仙剑/奇侠 传', plays: 0 })).toBe('仙剑_奇侠_传.jar')
    expect(isZipHeader([0x50, 0x4b, 0x03, 0x04, 0])).toBe(true)
    expect(isZipHeader([0x3c, 0x68, 0x74, 0x6d])).toBe(false)
  })
})
