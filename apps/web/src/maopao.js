// 冒泡 (MRP) catalog entries and where each game's file is loaded from.
// The catalog (/maopao/hall/manifest.json) lists every known game. A packed site or app carries only some of them
// (bundled: true); the rest have bundled: false and load from the public vmrp mirror, which allows cross-origin
// reads. A catalog without the flag (the desktop server's full vendor checkout) has every game locally.
export const MRP_CATALOG_URL = '/maopao/hall/manifest.json'
export const MRP_REMOTE_BASE = 'https://vmrp.github.io/public/mrps/'
const LOCAL_BASE = '/maopao/public/mrps/'

export function normalizeMrpEntry(entry) {
  return {
    kind: 'maopao',
    file: entry.file,
    name: entry.name || entry.file,
    vendor: entry.vendor || '',
    desc: entry.desc || '',
    size: entry.size || 0,
    iconUrl: typeof entry.iconUrl === 'string' ? entry.iconUrl : null,
    bundled: entry.bundled !== false,
    compat: typeof entry.compat === 'string' ? entry.compat : null,
    local: false,
  }
}

/** The address of an MRP file for its catalog entry (or the local path when the game is not in the catalog). */
export function mrpFileUrl(file, entry) {
  const base = entry && entry.bundled === false ? MRP_REMOTE_BASE : LOCAL_BASE
  return base + encodeURIComponent(file)
}

/** Labels a library card shows for an MRP game beyond its vendor and size. */
export function mrpBadges(game) {
  return [game.bundled === false ? '需联网' : '', game.compat === 'frozen' ? '可能无法运行' : ''].filter(Boolean)
}

/** Resolves where to load `file` from by reading the catalog; a game started from a URL has no entry in hand. */
export async function resolveMrpFileUrl(file, fetchImpl = fetch) {
  try {
    const response = await fetchImpl(MRP_CATALOG_URL)
    if (!response.ok) return mrpFileUrl(file)
    const catalog = await response.json()
    return mrpFileUrl(file, Array.isArray(catalog) ? catalog.find((entry) => entry && entry.file === file) : null)
  } catch {
    return mrpFileUrl(file)
  }
}
