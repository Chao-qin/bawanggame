// 本地游玩记录：不依赖云服务、登录或 publishable key。
// 数据只保存在当前浏览器的 localStorage 中，不会上传网络。
const STORAGE_KEY = 'xiaochao-play-history'
const MAX_RECORDS = 100

function readHistory() {
  try {
    const value = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]')
    return Array.isArray(value) ? value : []
  } catch (_) {
    return []
  }
}

function writeHistory(items) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(items.slice(0, MAX_RECORDS)))
  } catch (_) {}
}

// A browser-installed game and a server game can share a file name; they are different games.
function keyOf(game) {
  return `${game.kind}:${game.local ? 'local' : 'server'}:${game.file}`
}

/** 记录一次游玩到当前浏览器。 */
export function recordPlay(game) {
  const now = Date.now()
  const item = {
    kind: game.kind,
    file: game.file,
    local: !!game.local,
    name: game.name || game.file,
    vendor: game.vendor || '',
    created_at: now,
    count: 1,
  }
  const history = readHistory()
  const previous = history.find((entry) => keyOf(entry) === keyOf(item))
  if (previous) item.count = (previous.count || 1) + 1
  writeHistory([item, ...history.filter((entry) => keyOf(entry) !== keyOf(item))])
}

/** 当前浏览器最近打开的游戏。 */
export function fetchRecent(limit = 12) {
  return Promise.resolve(
    readHistory().sort((a, b) => b.created_at - a.created_at).slice(0, limit),
  )
}

/** 当前浏览器打开次数最多的游戏，作为本地热门榜。 */
export function fetchPopular(limit = 12) {
  return Promise.resolve(
    readHistory()
      .sort((a, b) => (b.count || 1) - (a.count || 1) || b.created_at - a.created_at)
      .slice(0, limit),
  )
}
