import { handleOnlineRequest, type OnlineDeps } from './onlineProxy'

type Page = { status?: number; body?: string; url?: string; bytes?: number[] }

function responseOf(page: Page): Response {
  const status = page.status ?? 200
  const bytes = page.bytes ?? []
  return {
    ok: status >= 200 && status < 300,
    status,
    url: page.url ?? '',
    headers: { get: () => null },
    text: async () => page.body ?? '',
    blob: async () => ({ size: bytes.length, bytes }) as unknown as Blob,
  } as unknown as Response
}

function deps(pages: Record<string, Page>, download: { status: number; bytes: number; head: number[] } = { status: 200, bytes: 3, head: [] }) {
  const written: Record<string, number[]> = {}
  const unlinked: string[] = []
  const requested: string[] = []
  const value: OnlineDeps = {
    webRoot: '/data/web',
    fetch: async (input) => {
      requested.push(input)
      const page = pages[input]
      if (!page) throw new Error(`unexpected request ${input}`)
      return responseOf(page)
    },
    blobToBase64: async (blob) => JSON.stringify((blob as unknown as { bytes: number[] }).bytes),
    files: {
      mkdir: async () => {},
      writeBase64: async (path, data) => { written[path] = JSON.parse(data) },
      download: async (_url, path) => { written[path] = download.head; return { status: download.status, bytes: download.bytes } },
      head: async (path, length) => (written[path] ?? []).slice(0, length),
      unlink: async (path) => { unlinked.push(path) },
    },
  }
  return { value, written, unlinked, requested }
}

const CATALOG = '<div id="results"><a href="game.php?id=12">仙剑</a> (3) 共 2 页 40 条</div>\n<script>'
const DETAIL = '<div class="results"><h2>仙剑</h2></div><a href="download.php?id=12&amp;xid=3">下载</a>'

describe('handleOnlineRequest', () => {
  it('answers the 52java catalog with the desktop proxy JSON shape', async () => {
    const { value } = deps({ 'https://java.52emu.cn/index.php?q=all&p=2': { body: CATALOG } })
    const result = await handleOnlineRequest('/__52java/catalog?page=2', value)
    expect(result).toEqual({
      status: 200,
      body: { source: 'https://java.52emu.cn', siteUrl: 'https://java.52emu.cn', games: [{ id: '12', name: '仙剑', plays: 3 }], page: 2, pages: 2, total: 40 },
    })
  })

  it('saves a 52java jar after the redirect and returns its local URL', async () => {
    const { value, written } = deps({
      'https://java.52emu.cn/game.php?id=12': { body: DETAIL },
      'https://java.52emu.cn/download.php?id=12&xid=3': { url: 'http://d2.52emu.cn/a.jar', bytes: [0x50, 0x4b, 0x03, 0x04, 1] },
    })
    const result = await handleOnlineRequest('/__52java/download?id=12', value)
    expect(result).toEqual({ status: 200, file: '/__downloads/java-12.jar', body: { name: '仙剑.jar' } })
    expect(written['/data/web/__downloads/java-12.jar']).toEqual([0x50, 0x4b, 0x03, 0x04, 1])
  })

  it('refuses a redirect off the 52emu hosts and a download that is not a jar', async () => {
    const offsite = deps({
      'https://java.52emu.cn/game.php?id=12': { body: DETAIL },
      'https://java.52emu.cn/download.php?id=12&xid=3': { url: 'https://evil.example/a.jar', bytes: [0x50, 0x4b, 0x03, 0x04] },
    })
    expect((await handleOnlineRequest('/__52java/download?id=12', offsite.value)).status).toBe(502)

    const html = deps({
      'https://java.52emu.cn/game.php?id=12': { body: DETAIL },
      'https://java.52emu.cn/download.php?id=12&xid=3': { bytes: [0x3c, 0x68, 0x74, 0x6d] },
    })
    expect(await handleOnlineRequest('/__52java/download?id=12', html.value)).toEqual({ status: 415, body: { error: 'not_a_jar' } })
    expect(html.unlinked).toEqual(['/data/web/__downloads/java-12.jar'])
  })

  it('rejects an invalid game id before any request', async () => {
    const { value, requested } = deps({})
    expect(await handleOnlineRequest('/__52java/download?id=1;rm', value)).toEqual({ status: 400, body: { error: 'invalid_game_id' } })
    expect(requested).toEqual([])
  })

  it('downloads a flash.homes game by its hash and checks the SWF signature', async () => {
    const sha = 'a'.repeat(64)
    const detail = `<script>"propertyID":"sha256","value":"${sha}"</script><h1>Fruit</h1>`
    const ok = deps({ 'https://flash.homes/flash/AB-12': { body: detail } }, { status: 200, bytes: 10, head: [0x46, 0x57, 0x53] })
    expect(await handleOnlineRequest('/__flash/download/ab-12', ok.value)).toEqual({ status: 200, file: '/__downloads/flash-AB-12.swf', body: { name: 'Fruit' } })

    const bad = deps({ 'https://flash.homes/flash/AB-12': { body: detail } }, { status: 200, bytes: 10, head: [0x3c, 0x21, 0x64] })
    expect((await handleOnlineRequest('/__flash/download/AB-12', bad.value)).status).toBe(415)
  })

  it('reports an upstream failure as 502 and an unknown path as 404', async () => {
    const { value } = deps({ 'https://flash.homes/flash': { status: 503 } })
    expect(await handleOnlineRequest('/__flash/catalog', value)).toEqual({ status: 502, body: { error: 'HTTP 503' } })
    expect((await handleOnlineRequest('/__other', value)).status).toBe(404)
  })
})
