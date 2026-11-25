import { Platform } from 'react-native'
import * as RNFS from 'react-native-fs'
import StaticServer from 'react-native-static-server'
import { DOWNLOADS_PATH, type OnlineFiles } from './onlineProxy'

let activeServer: StaticServer | null = null
let activeRoot: string | null = null

/** The directory the local server serves; null until it has started. */
export function webRoot(): string | null {
  return activeServer ? activeRoot : null
}

export async function startAssetServer(): Promise<string> {
  if (activeServer?.origin) return activeServer.origin

  const root = await resolveWebRoot()
  // Downloads only live until the page has copied them into its own storage.
  if (Platform.OS === 'android') await removeDirectory(`${root}${DOWNLOADS_PATH}`).catch(() => {})
  activeServer = new StaticServer(0, root, { localOnly: true, keepAlive: true })
  activeRoot = root
  try {
    return await activeServer.start()
  } catch (error) {
    activeServer = null
    activeRoot = null
    throw error
  }
}

export async function stopAssetServer(): Promise<void> {
  if (!activeServer) return
  const server = activeServer
  activeServer = null
  activeRoot = null
  server.kill()
}

export const onlineFiles: OnlineFiles = {
  mkdir: (path) => RNFS.mkdir(path),
  writeBase64: (path, data) => RNFS.writeFile(path, data, 'base64'),
  async download(url, path) {
    const result = await RNFS.downloadFile({ fromUrl: url, toFile: path, readTimeout: 60_000, connectionTimeout: 15_000 }).promise
    return { status: result.statusCode, bytes: result.bytesWritten }
  },
  // The signatures checked (PK\x03\x04, FWS/CWS/ZWS) are all ASCII.
  async head(path, length) {
    const text = await RNFS.read(path, length, 0, 'ascii')
    return Array.from(text, (char) => char.charCodeAt(0))
  },
  unlink: (path) => RNFS.unlink(path),
}

/** Reads a blob as base64 with the platform FileReader (no copy through JS strings of binary data). */
export function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(reader.error || new Error('blob read failed'))
    reader.onload = () => {
      const value = String(reader.result || '')
      resolve(value.slice(value.indexOf(',') + 1))
    }
    reader.readAsDataURL(blob)
  })
}

async function resolveWebRoot(): Promise<string> {
  if (Platform.OS === 'ios') {
    const root = `${RNFS.MainBundlePath}/web`
    if (!(await RNFS.exists(`${root}/index.html`))) throw new Error('移动端 Web 资源未被打入 iOS bundle')
    return root
  }

  const root = `${RNFS.DocumentDirectoryPath}/web`
  const marker = 'web/mobile-resource-version'
  const expected = await RNFS.readFileAssets(marker, 'utf8').catch(() => '')
  const installedMarker = await RNFS.readFile(`${root}/mobile-resource-version`, 'utf8').catch(() => '')
  if (expected.trim() !== installedMarker.trim() || !(await RNFS.exists(`${root}/index.html`))) {
    await removeDirectory(root)
    await copyAssetDirectory('web', root)
  }
  if (!(await RNFS.exists(`${root}/index.html`))) throw new Error('移动端 Web 资源复制失败')
  return root
}

async function copyAssetDirectory(source: string, target: string): Promise<void> {
  await RNFS.mkdir(target)
  const entries = await RNFS.readDirAssets(source)
  await Promise.all(entries.map(async (entry) => {
    const sourcePath = `${source}/${entry.name}`
    const targetPath = `${target}/${entry.name}`
    if (entry.isDirectory()) return copyAssetDirectory(sourcePath, targetPath)
    await RNFS.copyFileAssets(sourcePath, targetPath)
  }))
}

async function removeDirectory(directory: string): Promise<void> {
  if (!(await RNFS.exists(directory))) return
  const entries = await RNFS.readDir(directory)
  await Promise.all(entries.map(async (entry) => {
    if (entry.isDirectory()) return removeDirectory(entry.path)
    return RNFS.unlink(entry.path)
  }))
  await RNFS.unlink(directory)
}
