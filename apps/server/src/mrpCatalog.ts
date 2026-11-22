import { promises as fs } from 'node:fs'
import { basename, join } from 'node:path'

export type MrpManifestRecord = { file: string; size?: number; name?: string; vendor?: string; desc?: string; w?: number; h?: number; iconUrl?: string; coverUrl?: string }
export type MrpCatalogEntry = MrpManifestRecord & { available: boolean; runtimeAvailable: boolean; gameAvailable: boolean; availabilityReason: string | null; artworkUrl: string | null }

export function normalizeMrpManifest(value: unknown): MrpManifestRecord[] {
  if (!Array.isArray(value) || value.length === 0) throw new Error('MRP catalog is empty or malformed')
  return value.map((item) => {
    if (!item || typeof item !== 'object' || typeof (item as MrpManifestRecord).file !== 'string') throw new Error('MRP catalog contains an invalid game record')
    const file = (item as MrpManifestRecord).file
    if (basename(file) !== file || !file.toLowerCase().endsWith('.mrp')) throw new Error('MRP catalog contains an unsafe game path')
    return item as MrpManifestRecord
  })
}

export function artworkUrl(record: MrpManifestRecord): string | null {
  const value = record.iconUrl || record.coverUrl
  return value && (value.startsWith('/') || /^https:\/\//i.test(value)) ? value : null
}

export function enrichMrpCatalog(records: MrpManifestRecord[], runtimeAvailable: boolean, availableFiles: Set<string>): MrpCatalogEntry[] {
  return records.map((record) => {
    const gameAvailable = availableFiles.has(record.file)
    return { ...record, available: runtimeAvailable && gameAvailable, runtimeAvailable, gameAvailable, availabilityReason: runtimeAvailable && gameAvailable ? null : !runtimeAvailable ? 'MRP 运行时未安装' : '游戏文件未安装', artworkUrl: artworkUrl(record) }
  })
}

export async function loadMrpCatalog(root: string, runtimeRoot: string, gameRoot: string) {
  const records = normalizeMrpManifest(JSON.parse(await fs.readFile(join(root, 'hall', 'manifest.json'), 'utf8')))
  const runtimeAvailable = await exists(join(runtimeRoot, 'index.html'))
  const files = new Set<string>()
  for (const record of records) if (await exists(join(gameRoot, record.file))) files.add(record.file)
  return { games: enrichMrpCatalog(records, runtimeAvailable, files), runtimeAvailable }
}

async function exists(path: string) {
  try { await fs.access(path); return true } catch { return false }
}
