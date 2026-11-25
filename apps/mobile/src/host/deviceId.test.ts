import { loadDeviceId, randomUuid, type DeviceIdFiles } from './deviceId'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/

function memoryFiles(initial: Record<string, string> = {}, { failWrite = false, failRead = false } = {}) {
  const store = { ...initial }
  const files: DeviceIdFiles = {
    exists: async (path) => path in store,
    readFile: async (path) => {
      if (failRead) throw new Error('read failed')
      return store[path]
    },
    writeFile: async (path, contents) => {
      if (failWrite) throw new Error('disk full')
      store[path] = contents
    },
  }
  return { files, store }
}

describe('device id', () => {
  it('formats random digits as a version 4 UUID', () => {
    expect(randomUuid(() => 0)).toBe('00000000-0000-4000-8000-000000000000')
    expect(randomUuid(() => 0.999)).toBe('ffffffff-ffff-4fff-bfff-ffffffffffff')
    expect(randomUuid()).toMatch(UUID)
  })

  it('creates the id once and returns the stored one on later launches', async () => {
    const { files, store } = memoryFiles()
    const first = await loadDeviceId(files, '/data/device-id')
    expect(first).toMatch(UUID)
    expect(store['/data/device-id']).toBe(first)
    expect(await loadDeviceId(files, '/data/device-id')).toBe(first)
  })

  it('replaces a damaged stored id', async () => {
    const { files, store } = memoryFiles({ '/data/device-id': 'not-an-id' })
    const id = await loadDeviceId(files, '/data/device-id')
    expect(id).toMatch(UUID)
    expect(store['/data/device-id']).toBe(id)
  })

  it('still gives an id for this launch when storage fails', async () => {
    expect(await loadDeviceId(memoryFiles({}, { failWrite: true }).files, '/data/device-id')).toMatch(UUID)
    const stored = '3f2b8c1e-0d4a-4b6e-9a7c-1e2d3f4a5b6c'
    const unreadable = memoryFiles({ '/data/device-id': stored }, { failRead: true })
    expect(await loadDeviceId(unreadable.files, '/data/device-id')).toMatch(UUID)
    // A failed read does not replace the stored id, or the device would be counted twice from then on.
    expect(unreadable.store['/data/device-id']).toBe(stored)
  })
})
