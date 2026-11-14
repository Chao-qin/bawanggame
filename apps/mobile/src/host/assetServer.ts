import { Platform } from 'react-native'
import * as RNFS from 'react-native-fs'
import StaticServer from 'react-native-static-server'

let activeServer: StaticServer | null = null

export async function startAssetServer(): Promise<string> {
  if (activeServer?.origin) return activeServer.origin

  const root = await resolveWebRoot()
  activeServer = new StaticServer(0, root, { localOnly: true, keepAlive: true })
  try {
    return await activeServer.start()
  } catch (error) {
    activeServer = null
    throw error
  }
}

export async function stopAssetServer(): Promise<void> {
  if (!activeServer) return
  const server = activeServer
  activeServer = null
  server.kill()
}

async function resolveWebRoot(): Promise<string> {
  if (Platform.OS === 'ios') {
    const root = `${RNFS.MainBundlePath}/web`
    if (!(await RNFS.exists(`${root}/index.html`))) throw new Error('移动端 Web 资源未被打入 iOS bundle')
    return root
  }

  const root = `${RNFS.DocumentDirectoryPath}/web`
  const marker = 'web/.mobile-resource-version'
  const expected = await RNFS.readFileAssets(marker, 'utf8').catch(() => '')
  const installedMarker = await RNFS.readFile(`${root}/.mobile-resource-version`, 'utf8').catch(() => '')
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
