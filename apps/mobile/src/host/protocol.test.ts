import { injectedBridge, resolveRequestScript } from './protocol'

type Host = { capabilities: string[]; request(type: string, payload?: unknown, timeoutMs?: number): Promise<unknown>; resolve(id: string, result: unknown): boolean }

function loadBridge(post?: (raw: string) => void, capabilities: Parameters<typeof injectedBridge>[0] = ['online.fetch', 'orientation.lock']) {
  const window: Record<string, unknown> = {
    location: { href: 'http://127.0.0.1/', hash: '' },
    dispatchEvent: () => true,
    ...(post ? { ReactNativeWebView: { postMessage: post } } : {}),
  }
  // eslint-disable-next-line no-new-func
  new Function('window', 'CustomEvent', injectedBridge(capabilities))(window, class {})
  return window.__XIAOCHAO_RN_HOST__ as Host
}

describe('injected bridge requests', () => {
  it('posts a request with an id and settles it from the host script', async () => {
    const sent: Array<{ id?: string; type: string; payload?: unknown }> = []
    const host = loadBridge((raw) => sent.push(JSON.parse(raw)))
    expect(host.capabilities).toEqual(['online.fetch', 'orientation.lock'])
    expect(loadBridge(() => {}, []).capabilities).toEqual([])

    const pending = host.request('online.fetch', { path: '/__flash/catalog' })
    const message = sent.find((item) => item.type === 'online.fetch')
    expect(message).toMatchObject({ payload: { path: '/__flash/catalog' } })
    expect(typeof message?.id).toBe('string')

    const window = { __XIAOCHAO_RN_HOST__: host }
    // eslint-disable-next-line no-new-func
    new Function('window', resolveRequestScript(message!.id!, { status: 200, body: { games: [] } }))(window)
    await expect(pending).resolves.toEqual({ status: 200, body: { games: [] } })
    expect(host.resolve(message!.id!, {})).toBe(false)
  })

  it('drops a request the host leaves unanswered past its timeout', async () => {
    jest.useFakeTimers()
    const sent: Array<{ id?: string }> = []
    const host = loadBridge((raw) => sent.push(JSON.parse(raw)))
    const pending = host.request('online.fetch', {}, 1000)
    jest.advanceTimersByTime(1000)
    await expect(pending).rejects.toThrow('host_timeout')
    expect(host.resolve(sent[sent.length - 1].id!, {})).toBe(false)
    jest.useRealTimers()
  })

  it('rejects at once when there is no native host to post to', async () => {
    await expect(loadBridge().request('online.fetch', {})).rejects.toThrow('host_unavailable')
  })
})
