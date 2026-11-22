import { Button, DotLoading, Empty, Input, Popup, SearchBar, TextArea } from 'antd-mobile'
import { AppstoreOutline, ArrowsAltOutline, CalculatorOutline, CloseOutline, CompassOutline, LeftOutline, MoreOutline, MovieOutline, SetOutline, ShopbagOutline, ShrinkOutline } from 'antd-mobile-icons'
import { lazy, Suspense, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { useBlocker, useLocation, useNavigate, useParams } from 'react-router-dom'
import { recordPlay, fetchRecent, fetchPopular } from './cloud.js'
import { J2MEPlayer } from './runtime/J2MEPlayer.jsx'
import { MrpPlayer } from './runtime/MrpPlayer.jsx'
import { LocalRevivalPlayer } from './runtime/LocalRevivalPlayer.jsx'
import { FlashPlayer } from './runtime/FlashPlayer.jsx'
import { InputMappingPopup } from './runtime/InputMappingPopup.jsx'
import { PrimaryNavigation } from './components/PrimaryNavigation.jsx'
import { fetchArtwork, validArtwork } from './artwork.js'
import { GameArtwork, LibraryGameEntry, RecentGameEntry, StoreGameEntry } from './components/GameEntry.jsx'
import { cleanupRuntimeArtifacts } from './runtime/cleanup.js'
import { installResponsiveContract } from './responsive.js'
import { addBundled, addFromFile, addFromUrl, fillArtwork, list as listLocalFlash, remove as removeLocalFlash } from './localFlash.js'

const KeyboardTestPage = lazy(() => import('./keyboard/KeyboardTestPage.jsx').then((module) => ({ default: module.KeyboardTestPage })))

const TABS = [
  { id: 'j2me', label: 'J2ME', Icon: AppstoreOutline },
  { id: 'maopao', label: '冒泡社区', Icon: CompassOutline },
  { id: 'flash', label: 'Flash', Icon: MovieOutline },
  { id: 'flash-store', label: 'Flash 商城', Icon: ShopbagOutline },
  { id: 'store', label: '52java 商城', Icon: ShopbagOutline },
]

const TAB_IDS = new Set(TABS.map((item) => item.id))
const GAME_KINDS = new Set(['j2me', 'maopao', 'local-revival', 'flash'])
const FRAME_RUNTIME_KINDS = new Set(['j2me', 'maopao'])
const RUNTIME_EXIT_MESSAGE = 'xiaochao:runtime-exit'
const RUNTIME_READY_MESSAGE = 'xiaochao:runtime-ready'
const noopCleanup = () => {}
const FLASH_GAMES = [
  { kind: 'flash', file: 'fruit-madness.swf', name: 'Fruit Madness', vendor: 'Vladimir Belyaev · MIT', desc: '躲避水果并收集松饼', size: 2236139, iconUrl: null, local: false, catalogId: 'fruit-madness' },
  { kind: 'flash', file: 'sample-game.swf', name: 'Star Catcher', vendor: '内置输入测试', desc: '点击星星得分', size: 1767, iconUrl: null, local: false, catalogId: 'sample-game' },
]

function isEmbeddedHost() {
  return new URLSearchParams(window.location.search).get('host') === 'rn'
}

const mobileApiBase = String(import.meta.env.VITE_52JAVA_API_BASE || '').replace(/\/+$/, '')

function apiPath(path) {
  return isEmbeddedHost() && mobileApiBase ? mobileApiBase + path : path
}

function routeForLibrary(tab) {
  return { type: 'library', tab: TAB_IDS.has(tab) ? tab : 'j2me' }
}

function routeForGame(game, tab) {
  return { type: 'play', tab: TAB_IDS.has(tab) ? tab : 'j2me', game }
}

function routePath(route) {
  if (route.type === 'keyboard-test') return '/test/keyboard'
  if (route.type === 'play') {
    const params = new URLSearchParams()
    params.set('tab', route.tab)
    params.set('name', route.game.name || route.game.file)
    if (route.game.local) params.set('local', '1')
    const suffix = params.toString()
    return '/play/' + encodeURIComponent(route.game.kind) + '/' + encodeURIComponent(route.game.file) + (suffix ? '?' + suffix : '')
  }
  return '/library/' + route.tab
}

function fullscreenElement() {
  return document.fullscreenElement || document.webkitFullscreenElement || null
}

function exitFullscreen() {
  const exit = document.exitFullscreen || document.webkitExitFullscreen
  return typeof exit === 'function' ? Promise.resolve(exit.call(document)) : Promise.resolve()
}

function hasLocalJars() {
  return typeof window !== 'undefined' && window.LocalJars && typeof window.LocalJars.list === 'function'
}

function useServerGames(kind) {
  const [state, setState] = useState({ loading: true, error: null, games: [] })
  useEffect(() => {
    if (kind !== 'maopao') return
    let alive = true
    setState({ loading: true, error: null, games: [] })
    fetch('/maopao/hall/manifest.json')
      .then((r) => {
        if (!r.ok) throw new Error('HTTP ' + r.status)
        return r.json()
      })
      .then((data) => {
        if (!alive) return
        setState({
          loading: false,
          error: null,
          games: data.map((g) => ({
            kind,
            file: g.file,
            name: g.name || g.file,
            vendor: g.vendor || '',
            desc: g.desc || '',
            size: g.size || 0,
            iconUrl: typeof g.iconUrl === 'string' ? g.iconUrl : null,
            local: false,
          })),
        })
      })
      .catch((e) => {
        if (alive) setState({ loading: false, error: String(e.message || e), games: [] })
      })
    return () => {
      alive = false
    }
  }, [kind])
  return kind === 'maopao' ? state : { loading: false, error: null, games: [] }
}

function useServerJars(enabled) {
  const [state, setState] = useState({ loading: true, error: null, games: [] })
  useEffect(() => {
    if (!enabled) return
    let alive = true
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 8000)
    // The RN package serves a static manifest from APK assets; desktop keeps
    // the Node endpoint so its live catalog and icon extraction still work.
    const endpoint = isEmbeddedHost() ? '/jar-manifest.json' : '/__jars'
    fetch(endpoint, { signal: controller.signal })
      .then((r) => {
        if (!r.ok) throw new Error('HTTP ' + r.status)
        return r.json()
      })
      .then((data) => {
        if (!alive) return
        setState({
          loading: false,
          error: null,
          games: data.map((g) => ({
            kind: 'j2me',
            file: g.file,
            name: g.name || g.file,
            vendor: g.vendor || '',
            suiteName: g.suiteName,
            version: g.version,
            desc: '',
            size: 0,
            iconUrl: g.icon ? '/__icon?jar=' + encodeURIComponent(g.file) : null,
            local: false,
          })),
        })
      })
      .catch((e) => {
        if (alive) setState({ loading: false, error: controller.signal.aborted ? '读取服务器列表超时' : String(e.message || e), games: [] })
      })
      .finally(() => clearTimeout(timeout))
    return () => {
      alive = false
      clearTimeout(timeout)
      controller.abort()
    }
  }, [enabled])
  return enabled ? state : { loading: false, error: null, games: [] }
}

function useJavaStore(query, category, page) {
  const embedded = isEmbeddedHost()
  const online = !embedded || Boolean(mobileApiBase)
  const [state, setState] = useState({ loading: online, error: null, offline: !online, games: [], siteUrl: 'https://java.52emu.cn', pages: 1, total: 0 })
  const [tick, setTick] = useState(0)
  useEffect(() => {
    let alive = true
    if (!online) {
      setState({ loading: false, error: null, offline: true, games: [], siteUrl: 'https://java.52emu.cn', pages: 1, total: 0 })
      return () => { alive = false }
    }
    setState((current) => ({ ...current, loading: true, error: null }))
    const params = new URLSearchParams({ page: String(page) })
    if (query) params.set('query', query)
    if (category) params.set('category', category)
    if (tick) params.set('refresh', '1')
    fetch(apiPath('/__52java/catalog?' + params))
      .then((r) => { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json() })
      .then((data) => { if (alive) setState({ loading: false, error: null, offline: false, games: data.games || [], siteUrl: data.siteUrl || 'https://java.52emu.cn', pages: data.pages || 1, total: data.total || 0 }) })
      .catch((e) => { if (alive) setState((current) => ({ ...current, loading: false, error: String(e.message || e) })) })
    return () => { alive = false }
  }, [online, tick, query, category, page])
  return { ...state, refresh: () => setTick((value) => value + 1) }
}

function useLocalJars(enabled) {
  const [games, setGames] = useState([])
  const [error, setError] = useState(null)
  const [loading, setLoading] = useState(enabled)
  const [tick, setTick] = useState(0)

  useEffect(() => {
    if (!enabled) return
    // 等待 LocalJars 全局脚本就绪（index.html 里引入 /config/localjars.js）
    let alive = true
    const tries = 20
    let n = 0
    function poll() {
      if (!alive) return
      if (!hasLocalJars()) {
        if (n++ < tries) return setTimeout(poll, 250)
        setError('本机存储不可用（LocalJars 未加载）')
        setLoading(false)
        return
      }
      window.LocalJars.list()
        .then((infos) => {
          if (!alive) return
          setError(null)
          setGames(
            (infos || []).map((info) => {
              const iconUrl = info.icon ? URL.createObjectURL(info.icon) : null
              return {
                kind: 'j2me',
                file: info.file,
                name: info.name || info.file,
                vendor: info.vendor || '',
                suiteName: info.suiteName,
                version: info.version,
                desc: '',
                size: info.data ? info.data.size : 0,
                iconUrl,
                local: true,
              }
            })
          )
        })
        .catch((e) => { if (alive) setError(String(e.message || e)) })
        .finally(() => { if (alive) setLoading(false) })
    }
    poll()
    return () => {
      alive = false
    }
  }, [enabled, tick])

  useEffect(() => () => {
    for (const game of games) {
      if (game.iconUrl) URL.revokeObjectURL(game.iconUrl)
    }
  }, [games])

  function refresh() {
    setTick((t) => t + 1)
  }

  async function addFiles(files) {
    if (!hasLocalJars()) throw new Error('LocalJars 未加载')
    let added = 0
    let duplicates = 0
    try {
      for (const file of files) {
        try {
          await window.LocalJars.add(file)
          added += 1
        } catch (error) {
          if (error.code !== 'already_installed') throw error
          duplicates += 1
        }
      }
      return { added, duplicates }
    } finally {
      if (added) refresh()
    }
  }

  return { games, error, loading, addFiles, refresh }
}

async function uninstallLocalGame(game) {
  if (game.kind === 'flash') {
    await removeLocalFlash(game.file)
  } else {
    if (!hasLocalJars()) throw new Error('浏览器本机存储不可用')
    const files = game.localFiles || [game.file]
    await window.LocalJars.removeGroup(files)
    for (const file of files) await window.LocalJars.clearData('local:' + file)
  }
}

function useLocalFlash(enabled) {
  const [state, setState] = useState({ loading: enabled, error: null, skipped: 0, games: [] })
  const [tick, setTick] = useState(0)

  useEffect(() => {
    if (!enabled) return
    let alive = true
    setState((current) => ({ ...current, loading: true, error: null }))
    listLocalFlash()
      .then(({ records, skipped }) => {
        if (!alive) return
        setState({
          loading: false,
          error: skipped ? `${skipped} 个本机 Flash 记录已跳过` : null,
          skipped,
          games: records.map((record) => ({
            kind: 'flash',
            file: record.id,
            name: record.name,
            vendor: record.source === 'remote' ? '本机 · 在线来源' : '本机游戏',
            desc: record.description,
            size: record.size,
            iconUrl: validArtwork(record.artwork) ? URL.createObjectURL(record.artwork) : null,
            local: true,
            source: record.source,
            sourceUrl: record.sourceUrl,
            dedupeKey: record.dedupeKey,
          })),
        })
      })
      .catch((error) => {
        if (alive) setState((current) => ({ ...current, loading: false, error: String(error.message || error) }))
      })
    return () => { alive = false }
  }, [enabled, tick])

  useEffect(() => () => {
    for (const game of state.games) if (game.iconUrl) URL.revokeObjectURL(game.iconUrl)
  }, [state.games])

  return {
    ...state,
    refresh: () => setTick((value) => value + 1),
  }
}

function formatSize(n) {
  if (!n) return ''
  if (n >= 1024 * 1024) return (n / 1024 / 1024).toFixed(1) + ' MB'
  return Math.max(1, Math.round(n / 1024)) + ' KB'
}

function localJarName(name, id) {
  const base = String(name || id || 'game').replace(/[\\/:*?"<>|]+/g, '_').trim() || id || 'game'
  return base.toLowerCase().endsWith('.jar') ? base : base + '.jar'
}

function gameKey(game) {
  if (game.identity) return game.identity
  return (game.local ? 'local:' : '') + game.kind + ':' + game.file
}

function duplicateMessage(name) {
  return `已安装过「${name}」，无需重复安装`
}

function GameRow({ title, items, onOpen }) {
  if (!items || items.length === 0) return null
  return (
    <section className="row">
      <h2 className="rowTitle">{title}</h2>
      <div className="rowScroll">
        {items.map((it) => (
          <RecentGameEntry key={it.kind + ':' + it.file} game={it} onOpen={onOpen} />
        ))}
      </div>
    </section>
  )
}

function GameMenu({ game, onStart, onSelect, onRemove, onClose }) {
  const sheet = useRef(null)
  return (
    <Popup visible={!!game} onClose={onClose} closeOnMaskClick destroyOnClose
      afterShow={() => sheet.current?.focus()}
      className="gameMenu" maskClassName="optionBackdrop" bodyClassName="optionSheet">
      {game && <section ref={sheet} role="dialog" aria-modal="true" aria-label="游戏选项" tabIndex={-1}
        onKeyDown={(event) => {
          if (event.key !== 'Tab') return
          const buttons = event.currentTarget.querySelectorAll('button')
          const target = event.shiftKey ? buttons[0] : buttons[buttons.length - 1]
          if (event.target !== target && !(event.shiftKey && event.target === event.currentTarget)) return
          event.preventDefault()
          const next = event.shiftKey ? buttons[buttons.length - 1] : buttons[0]
          next?.focus()
        }}>
        <div className="optionHead">
          <GameArtwork src={game.iconUrl} name={game.name} className="optionIcon" />
          <div className="optionTitle"><strong>{game.name}</strong><span>{[game.vendor, game.kind === 'j2me' ? (game.local ? '本机已安装' : '服务器提供') : game.local ? '本机游戏' : ''].filter(Boolean).join(' · ')}</span></div>
          <Button fill="none" className="iconButton" onClick={onClose} aria-label="关闭"><CloseOutline aria-hidden="true" /></Button>
        </div>
        <div className="optionBody">
          <Button className="optionButton" color="primary" onClick={() => { onStart(game); onClose() }}>启动</Button>
          {game.local && <Button className="optionButton" onClick={() => { onSelect(game); onClose() }}>选择</Button>}
          {game.local && <Button className="optionButton optionDanger" color="danger" fill="outline" onClick={() => { onRemove(game); onClose() }}>卸载</Button>}
        </div>
      </section>}
    </Popup>
  )
}

function Library({ kind, onPlay }) {
  // 两个 hook 无条件调用，保证 hooks 顺序稳定；未命中的运行时返回空列表
  const serverJars = useServerJars(kind === 'j2me')
  const serverMrps = useServerGames(kind)
  const localFlash = useLocalFlash(kind === 'flash')
  const server = kind === 'j2me' ? serverJars : kind === 'maopao' ? serverMrps : { loading: false, error: null, games: [] }
  const local = useLocalJars(kind === 'j2me')
  const [query, setQuery] = useState('')
  const [busy, setBusy] = useState(false)
  const [recent, setRecent] = useState([])
  const [popular, setPopular] = useState([])
  const [menuGame, setMenuGame] = useState(null)
  const [selectMode, setSelectMode] = useState(false)
  const [picked, setPicked] = useState(() => new Set())
  const [removing, setRemoving] = useState(false)
  const [notice, setNotice] = useState(null)
  const loading = server.loading || local.loading || localFlash.loading
  const javaGames = useMemo(() => {
    if (kind !== 'j2me') return []
    const groups = new Map()
    for (const game of [...local.games, ...server.games]) {
      const identity = window.LocalJars?.identity?.(game) || gameKey(game)
      const group = groups.get(identity)
      if (!group) groups.set(identity, { ...game, identity, localFiles: game.local ? [game.file] : [] })
      else if (game.local) group.localFiles.push(game.file)
    }
    return [...groups.values()]
  }, [kind, local.games, server.games])
  const localGames = kind === 'flash' ? localFlash.games : javaGames.filter((game) => game.local)
  const historySources = useMemo(() => {
    const entries = new Map()
    for (const game of [...local.games, ...server.games]) {
      const key = `${game.kind}:${game.file}`
      if (!entries.has(key)) entries.set(key, game)
    }
    return entries
  }, [local.games, server.games])
  const withHistoryArtwork = (items) => items.map((item) => {
    const game = historySources.get(`${item.kind}:${item.file}`)
    return game ? { ...item, ...game } : item
  })
  const selectedGames = localGames.filter((game) => picked.has(gameKey(game)))

  useEffect(() => {
    if (!menuGame) return undefined
    const opener = document.activeElement
    const close = (event) => event.key === 'Escape' && setMenuGame(null)
    window.addEventListener('keydown', close)
    return () => {
      window.removeEventListener('keydown', close)
      if (opener?.isConnected) opener.focus({ preventScroll: true })
    }
  }, [menuGame])

  function refreshHistory() {
    if (kind === 'flash') return
    fetchRecent().then(setRecent)
    fetchPopular().then(setPopular)
  }
  useEffect(refreshHistory, [kind])

  function handlePlay(g) {
    onPlay(g)
    if (g.kind !== 'flash') {
      recordPlay(g)
      refreshHistory()
    }
  }

  function exitSelection() {
    setSelectMode(false)
    setPicked(new Set())
  }

  useEffect(() => {
    if (!selectMode || removing) return undefined
    const close = (event) => {
      if (event.key === 'Escape') exitSelection()
    }
    window.addEventListener('keydown', close)
    return () => window.removeEventListener('keydown', close)
  }, [selectMode, removing])

  function openGame(game) {
    if (removing) return
    if (!selectMode) {
      if (game.kind === 'j2me') {
        const original = (game.local ? local.games : server.games).find((entry) => entry.file === game.file)
        const identity = original && window.LocalJars?.identity?.(original)
        game = javaGames.find((entry) => entry.identity === identity) || game
      }
      setMenuGame(game)
      return
    }
    if (!game.local) return
    const key = gameKey(game)
    setPicked((current) => {
      const next = new Set(current)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  function selectGame(game) {
    setPicked(new Set([gameKey(game)]))
    setNotice(null)
    setSelectMode(true)
  }

  async function removeGames(targets, confirmation) {
    if (busy || removing || targets.length === 0 || !window.confirm(confirmation)) return
    setRemoving(true)
    setNotice(null)
    let failed = 0
    for (const game of targets) {
      try {
        await uninstallLocalGame(game)
      } catch (_) {
        failed += 1
      }
    }
    if (kind === 'flash') localFlash.refresh()
    else local.refresh()
    const removed = targets.length - failed
    setNotice({ text: `已卸载 ${removed} 款` + (failed ? `，${failed} 款卸载失败` : ''), failed })
    exitSelection()
    setRemoving(false)
  }

  const games = useMemo(() => {
    const all = kind === 'flash' ? FLASH_GAMES.concat(localFlash.games) : kind === 'j2me' ? javaGames : server.games
    const q = query.trim().toLowerCase()
    if (!q) return all
    return all.filter(
      (g) => (g.name || '').toLowerCase().includes(q) || (g.vendor || '').toLowerCase().includes(q)
    )
  }, [kind, server.games, javaGames, localFlash.games, query])

  function handleUpload(e) {
    const files = Array.from(e.target.files || [])
    e.target.value = ''
    if (!files.length) return
    setBusy(true)
    setNotice(null)
    local
      .addFiles(files)
      .then(({ added, duplicates }) => {
        setNotice({ text: `已导入 ${added} 款，${duplicates} 款已安装过` })
      })
      .catch((err) => window.alert('导入失败：' + (err.message || err)))
      .finally(() => setBusy(false))
  }

  return (
    <section className={selectMode ? "library librarySelecting" : "library"}>
      <div className="sectionHeading">
        <h2>{TABS.find((tab) => tab.id === kind)?.label}游戏库</h2>
        <span className="count" role="status">
          {loading ? <><DotLoading /> 加载中</> : server.error || local.error || localFlash.error ? '部分加载失败' : games.length + ' 款'}
        </span>
      </div>
      <div className={kind === 'j2me' ? 'toolbar javaLibraryToolbar' : 'toolbar'}>
        <SearchBar
          className="search"
          placeholder={kind === 'j2me' ? '搜索游戏' : kind === 'flash' ? '搜索 Flash 游戏…' : '搜索冒泡游戏…'}
          value={query}
          onChange={setQuery}
        />
        {kind === 'j2me' && (
          <FilePicker fill="outline" accept=".jar" multiple onChange={handleUpload} disabled={busy || selectMode || removing}>
            {busy ? '导入中' : '添加'}
          </FilePicker>
        )}
        {kind === 'j2me' && (
          <Button size="small" fill="outline" disabled={busy || removing || (!selectMode && !localGames.length)} onClick={() => {
            if (selectMode) exitSelection()
            else setSelectMode(true)
          }}>{selectMode ? '取消' : '卸载'}</Button>
        )}
      </div>
      {notice && <div className={notice.failed ? 'status statusError' : 'status statusSuccess'} role={notice.failed ? 'alert' : 'status'}>{notice.text}</div>}
      {!selectMode && kind !== 'flash' && <GameRow title="🔥 大家都在玩" items={withHistoryArtwork(popular)} onOpen={openGame} />}
      {!selectMode && kind !== 'flash' && <GameRow title="🕘 最近在玩" items={withHistoryArtwork(recent)} onOpen={openGame} />}
      {server.error && <div className="status statusError" role="alert">在线列表加载失败：{server.error}（请确认本地服务已在 8080 端口运行）</div>}
      {(kind === 'j2me' ? local.error : localFlash.error) && (
        <div className="status statusError" role="alert">{kind === 'j2me' ? local.error : localFlash.error}</div>
      )}
      <div className="gameGrid">
          {(!loading || kind === 'flash') && games.map((g) => (
            <LibraryGameEntry
              key={gameKey(g)}
              game={g}
              onOpen={openGame}
              selecting={selectMode}
              selected={selectMode && picked.has(gameKey(g))}
              disabled={removing || (selectMode && !g.local)}
            />
          ))}
      </div>
      {!loading && !server.error && !local.error && !localFlash.error && games.length === 0 && <Empty className="emptyPanel" description="没有匹配的游戏" />}
      {selectMode && <div className="selectBar" aria-label="已选游戏操作">
        <span role="status">已选 {selectedGames.length} 个</span>
        <Button color="danger" size="small" disabled={busy || removing || !selectedGames.length}
          onClick={() => removeGames(selectedGames, `卸载所选 ${selectedGames.length} 款游戏？这会删除本机副本及其存档。`)}>
          {removing ? '卸载中…' : kind === 'j2me' ? '批量卸载' : '卸载'}
        </Button>
        <Button size="small" disabled={removing} onClick={exitSelection}>取消</Button>
      </div>}
      <GameMenu
        game={menuGame}
        onStart={handlePlay}
        onSelect={selectGame}
        onRemove={(game) => removeGames([game], game.kind === 'j2me' ? `卸载「${game.name}」的全部本机副本及存档？` : `卸载「${game.name}」？`)}
        onClose={() => setMenuGame(null)}
      />
    </section>
  )
}

function FilePicker({ children, fill, ...inputProps }) {
  const input = useRef(null)
  return (
    <>
      <Button className="upload" size="small" fill={fill} disabled={inputProps.disabled} onClick={() => input.current?.click()}>{children}</Button>
      <input {...inputProps} type="file" ref={input} hidden />
    </>
  )
}

function FlashStore({ onRefreshLibrary }) {
  const local = useLocalFlash(true)
  const archiveOnline = !isEmbeddedHost() || Boolean(mobileApiBase)
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [url, setUrl] = useState('')
  const [file, setFile] = useState(null)
  const [artworkFile, setArtworkFile] = useState(null)
  const [busy, setBusy] = useState('')
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [archiveQuery, setArchiveQuery] = useState('')
  const [archiveGames, setArchiveGames] = useState([])
  const [archiveLoading, setArchiveLoading] = useState(archiveOnline)
  const [archiveError, setArchiveError] = useState('')
  const archiveRequest = useRef(0)
  const added = useMemo(() => new Set(local.games.map((game) => game.dedupeKey)), [local.games])

  async function searchArchive(value = archiveQuery) {
    if (!archiveOnline) return
    const requestId = ++archiveRequest.current
    setArchiveLoading(true)
    setArchiveError('')
    try {
      const response = await fetch(apiPath(`/__flash/catalog?query=${encodeURIComponent(value.trim())}`))
      if (!response.ok) throw new Error(`HTTP ${response.status}`)
      const data = await response.json()
      if (requestId === archiveRequest.current) setArchiveGames(data.games || [])
    } catch (cause) {
      if (requestId === archiveRequest.current) {
        setArchiveGames([])
        setArchiveError('Flash 保存计划暂时不可用：' + (cause.message || cause))
      }
    } finally {
      if (requestId === archiveRequest.current) setArchiveLoading(false)
    }
  }

  useEffect(() => {
    searchArchive('')
    return () => { archiveRequest.current += 1 }
  }, [])

  async function addArchiveGame(game) {
    setBusy(`archive:${game.code}`)
    setError('')
    setMessage('')
    try {
      const suffix = `/__flash/download/${encodeURIComponent(game.code)}`
      const downloadUrl = new URL(apiPath(suffix), window.location.href).href
      const installed = local.games.find((item) => item.dedupeKey === `url:${downloadUrl}`)
      if (installed) {
        if (!installed.iconUrl && game.coverUrl) {
          await fillArtwork(installed.file, await fetchArtwork(game.coverUrl))
          local.refresh()
          onRefreshLibrary()
        }
        setMessage(duplicateMessage(game.name))
        return
      }
      const detailResponse = await fetch(apiPath(`/__flash/detail/${encodeURIComponent(game.code)}`))
      if (!detailResponse.ok) throw new Error(`详情获取失败（HTTP ${detailResponse.status}）`)
      const detail = (await detailResponse.json()).game || game
      await addFromUrl(apiPath(`/__flash/download/${encodeURIComponent(game.code)}`), {
        name: detail.name,
        artwork: await fetchArtwork(detail.coverUrl || game.coverUrl),
        description: `Flash 保存计划 · SHA-256 ${detail.sha256 || '未提供'}`,
      })
      setMessage(`已加入「${detail.name}」，现在可以在 Flash 库中启动。`)
      local.refresh()
      onRefreshLibrary()
    } catch (cause) {
      if (cause.code === 'already_exists') setMessage(duplicateMessage(game.name))
      else setError(cause.message || String(cause))
    } finally {
      setBusy('')
    }
  }

  async function addBundledGame(game) {
    setBusy(game.file)
    setError('')
    setMessage('')
    try {
      await addBundled(game.file, { name: game.name, description: game.desc }, game.catalogId)
      setMessage(`已加入「${game.name}」，现在可以在 Flash 库中启动。`)
      local.refresh()
      onRefreshLibrary()
    } catch (cause) {
      if (cause.code === 'already_exists') {
        setMessage(duplicateMessage(game.name))
        local.refresh()
      } else setError(cause.message || String(cause))
    } finally {
      setBusy('')
    }
  }

  async function submit(event) {
    event.preventDefault()
    setBusy('custom')
    setError('')
    setMessage('')
    try {
      if (!name.trim()) throw new Error('请填写游戏名称')
      if (url.trim() && file) throw new Error('SWF 直链和本地文件只能选择一个')
      if (!url.trim() && !file) throw new Error('请填写 SWF 直链或选择本地文件')
      const metadata = { name, description, artwork: validArtwork(artworkFile) ? artworkFile : undefined }
      if (file) await addFromFile(file, metadata)
      else await addFromUrl(url, metadata)
      setMessage(`已加入「${name.trim()}」，现在可以在 Flash 库中启动。`)
      setName('')
      setDescription('')
      setUrl('')
      setFile(null)
      setArtworkFile(null)
      const input = document.getElementById('flash-file-input')
      if (input) input.value = ''
      const artworkInput = document.getElementById('flash-artwork-input')
      if (artworkInput) artworkInput.value = ''
      local.refresh()
      onRefreshLibrary()
    } catch (cause) {
      if (cause.code === 'already_exists') setMessage(duplicateMessage(name.trim()))
      else setError(cause.message || String(cause))
    } finally {
      setBusy('')
    }
  }

  return <section className="storePage">
    <div className="storeHero flashStoreHero">
      <div><h2 className="storeHeroTitle">Flash 游戏商城</h2><p className="storeHeroText">搜索并加入可在 Ruffle 中运行的 Flash 游戏。</p></div>
      <Button className="ghostButton" size="small" fill="outline" type="button" onClick={() => searchArchive()} disabled={!archiveOnline || archiveLoading}>刷新目录</Button>
    </div>
    {(local.error || error) && <div className="status statusError" role="alert">{error || local.error} <Button className="inlineAction" fill="none" type="button" onClick={local.refresh}>重试</Button></div>}
    {message && <div className="status statusSuccess" role="status">{message}</div>}
    <section className="flashArchiveSection">
      <div className="sectionHeading">
        <div><h3>游戏目录</h3><p>从 Flash 保存计划查找游戏并加入本机库。</p></div>
      </div>
      {archiveOnline ? <form className="flashImportFields" onSubmit={(event) => { event.preventDefault(); searchArchive() }}>
        <label>搜索作品<Input className="field" type="search" placeholder="搜索 Flash 游戏" value={archiveQuery} onChange={setArchiveQuery} /></label>
        <Button className="downloadButton" color="primary" size="small" type="submit" disabled={archiveLoading}>{archiveLoading ? '搜索中…' : '搜索'}</Button>
      </form> : <div className="status" role="status">当前安装包未配置在线商城服务。</div>}
      {archiveError && <div className="status statusError" role="alert">{archiveError}</div>}
      {archiveLoading && <div className="status" role="status"><DotLoading /> 正在加载游戏目录…</div>}
      {archiveOnline && !archiveLoading && !archiveError && archiveGames.length === 0 && <div className="emptyPanel"><strong>{archiveQuery.trim() ? '没有找到匹配的游戏' : '目录暂无游戏'}</strong><span>尝试其他关键词，或稍后刷新目录。</span></div>}
      {archiveGames.length > 0 && <div className="storeGrid archiveGrid">{archiveGames.map((game) => {
        const isAdded = added.has(`url:/__flash/download/${game.code}`) || local.games.some((item) => item.sourceUrl.includes(`/__flash/download/${game.code}`))
        return <StoreGameEntry key={game.code}
          cover={{ src: game.coverUrl, fallback: game.name }}
          title={game.name} metadata="Flash 保存计划" description={game.code}
          action={{ onClick: () => addArchiveGame(game), disabled: busy !== '' || local.loading, label: busy === `archive:${game.code}` ? '下载中…' : isAdded ? '已加入' : '加入' }} />
      })}</div>}
    </section>
    <details className="flashAdvanced">
      <summary>添加本地或直链 SWF</summary>
      <p>直链需要允许跨域下载；本地文件只保存在当前设备。</p>
      <form className="flashImportFields" onSubmit={submit}>
        <label>游戏名称<Input className="field" placeholder="输入游戏名称" value={name} onChange={setName} aria-required="true" /></label>
        <label>SWF 直链<Input className="field" type="url" placeholder="https://…" value={url} onChange={setUrl} /></label>
        <label>游戏说明<TextArea className="field flashDescription" placeholder="选填" rows={2} value={description} onChange={setDescription} /></label>
        <FilePicker id="flash-file-input" accept=".swf,application/x-shockwave-flash" onChange={(event) => setFile(event.target.files?.[0] || null)}>{file ? file.name : '选择本地 SWF'}</FilePicker>
        <FilePicker id="flash-artwork-input" accept="image/png,image/jpeg,image/webp,image/gif,image/avif" onChange={(event) => setArtworkFile(event.target.files?.[0] || null)}>{artworkFile ? artworkFile.name : '选择封面（可选）'}</FilePicker>
        <Button className="downloadButton" color="primary" size="small" type="submit" disabled={busy !== '' || local.loading}>{busy === 'custom' ? '加入中…' : '加入本机'}</Button>
      </form>
    </details>
    <section className="flashBundledSection"><h3>内置游戏</h3><div className="storeGrid">{FLASH_GAMES.map((game) => {
      const key = `catalog:${game.catalogId}`
      const isAdded = added.has(key)
      return <StoreGameEntry key={game.file} icon={game.name.charAt(0)} title={game.name}
        metadata={`内置目录 · ${formatSize(game.size)}`} description={game.desc}
        action={{ onClick: () => addBundledGame(game), disabled: busy !== '' || local.loading, label: busy === game.file ? '下载中…' : isAdded ? '已加入' : '加入本机' }} />
    })}</div></section>
  </section>
}

function Store({ onRefreshLibrary }) {
  const [query, setQuery] = useState('')
  const [appliedQuery, setAppliedQuery] = useState('')
  const [category, setCategory] = useState('')
  const [page, setPage] = useState(1)
  const store = useJavaStore(appliedQuery, category, page)
  const [busy, setBusy] = useState('')
  const [installed, setInstalled] = useState([])
  const [message, setMessage] = useState('')

  useEffect(() => {
    if (!hasLocalJars()) return undefined
    let active = true
    window.LocalJars.list().then((records) => {
      if (active) setInstalled(records)
    }).catch(() => {})
    return () => { active = false }
  }, [])

  function isInstalled(game, records = installed) {
    const id = String(game.id)
    const file = localJarName(game.name, id)
    return records.some((record) => record.sourceId === id || record.file === file)
  }

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'auto' })
  }, [appliedQuery, category, page])
  async function download(game) {
    const id = String(game.id)
    setBusy(id)
    setMessage('')
    try {
      if (!hasLocalJars()) throw new Error('浏览器本机存储不可用')
      const records = await window.LocalJars.list()
      setInstalled(records)
      if (isInstalled(game, records)) {
        if (game.iconUrl && records.some((record) => record.sourceId === id && !record.sourceArtwork)) {
          if (await window.LocalJars.fillArtwork(id, await fetchArtwork(game.iconUrl))) {
            setInstalled(await window.LocalJars.list())
            onRefreshLibrary()
          }
        }
        setMessage(duplicateMessage(game.name))
        return
      }
      const response = await fetch(apiPath('/__52java/download?id=' + encodeURIComponent(id)))
      if (!response.ok) {
        let message = '下载失败'
        try { message = (await response.json()).error || message } catch (_) {}
        throw new Error(message)
      }
      const blob = await response.blob()
      if (!blob.size) throw new Error('下载内容为空')
      const file = new File([blob], localJarName(game.name, id), { type: 'application/java-archive' })
      const record = await window.LocalJars.add(file, { sourceId: id, icon: await fetchArtwork(game.iconUrl) })
      setInstalled([...records, record])
      onRefreshLibrary()
    } catch (error) {
      if (error.code === 'already_installed') setMessage(duplicateMessage(game.name))
      else window.alert('下载失败：' + (error.message || error))
    }
    finally { setBusy('') }
  }
  function search(value) {
    setPage(1)
    setAppliedQuery(value.trim())
  }
  if (store.offline) {
    return <section className="storePage">
      <div className="emptyPanel">
        <strong>在线商城服务未配置</strong>
        <span>打包时设置 MOBILE_52JAVA_API_BASE 后重新构建，即可在安装包中使用 52java 商城。</span>
      </div>
    </section>
  }
  return <section className="storePage">
    <div className="storeHero">
      <div><h2 className="storeHeroTitle">52java 游戏商城</h2><p className="storeHeroText">从经典 Java 游戏目录直接加入你的本地模拟器。</p></div>
      <div className="storeActions"><Button className="ghostButton" size="small" fill="outline" onClick={store.refresh} disabled={store.loading}>刷新目录</Button><a className="ghostButton" href={store.siteUrl} target="_blank" rel="noreferrer">打开原站 ↗</a></div>
    </div>
    <form className="storeFilters" onSubmit={(event) => { event.preventDefault(); search(query) }}>
      <SearchBar className="search" placeholder="搜索 52java 游戏" value={query} onChange={setQuery} onSearch={search} />
      <select className="categorySelect" value={category} onChange={(event) => { setPage(1); setCategory(event.target.value) }} aria-label="游戏分类">
        <option value="">全部分类</option><option value="1">角色</option><option value="2">动作</option><option value="3">益智</option><option value="4">策略</option><option value="5">射击</option><option value="7">冒险</option><option value="8">赛车</option><option value="9">棋牌</option><option value="10">养成</option><option value="11">经营</option><option value="12">飞行</option><option value="13">格斗</option><option value="14">体育</option>
      </select>
      <Button className="ghostButton" size="small" fill="outline" type="submit">搜索</Button>
    </form>
    {message && <div className="status statusSuccess" role="status">{message}</div>}
    {store.error && <div className="status statusError" role="alert">商城目录加载失败：{store.error} <Button className="inlineAction" fill="none" onClick={store.refresh}>重试</Button></div>}
    {store.loading && <div className="status" role="status"><DotLoading /> 正在同步 52java 目录…</div>}
    {!store.loading && !store.error && !store.games.length && <div className="emptyPanel"><strong>{appliedQuery ? '没有匹配的游戏' : '目录暂时为空'}</strong><span>可以调整筛选条件，或稍后刷新目录。</span></div>}
    <div className="storeGrid">{store.games.map((game) => <StoreGameEntry key={game.id}
      cover={{ src: game.iconUrl, fallback: game.name }}
      title={game.name} metadata={`52java · ${game.plays.toLocaleString()} 次下载`} description="经典 Java 手机游戏"
      action={{ onClick: () => download(game), disabled: busy !== '', label: busy === String(game.id) ? '下载中…' : isInstalled(game) ? '已加入' : '加入库' }} />)}</div>
    {!store.loading && !store.error && store.games.length > 0 && <div className="storePagination"><span>第 {page} / {store.pages} 页 · {store.total.toLocaleString()} 款</span><div><Button type="button" size="small" fill="outline" className="ghostButton" disabled={page <= 1} onClick={() => setPage(page - 1)}>上一页</Button><Button type="button" size="small" fill="outline" className="ghostButton" disabled={page >= store.pages} onClick={() => setPage(page + 1)}>下一页</Button></div></div>}
  </section>
}

function Player({ game, onBack, onCancelBack, nativeBackSignal }) {
  const [confirming, setConfirming] = useState(false)
  const [isFullscreen, setIsFullscreen] = useState(() => Boolean(fullscreenElement()))
  const [runtimeReadyFor, setRuntimeReadyFor] = useState('')
  const [toolbarLandscape, setToolbarLandscape] = useState(() => window.matchMedia?.('(orientation: landscape)')?.matches ?? false)
  const [toolbarChoice, setToolbarChoice] = useState(null)
  const [inputMappingOpen, setInputMappingOpen] = useState(false)
  const toolbarCollapsed = toolbarChoice?.landscape === toolbarLandscape ? toolbarChoice.collapsed : toolbarLandscape
  const playerRef = useRef(null)
  const stageRef = useRef(null)
  const lastNativeBackSignal = useRef(nativeBackSignal)
  const runtimeCleanupRef = useRef(noopCleanup)
  const exitStartedRef = useRef(false)
  const settingsReady = game.kind === 'j2me' && runtimeReadyFor === game.file
  const registerRuntimeCleanup = useCallback((cleanup) => {
    runtimeCleanupRef.current = typeof cleanup === 'function' ? cleanup : noopCleanup
  }, [])
  useEffect(() => {
    const syncToolbarMode = () => {
      setToolbarLandscape(document.body.classList.contains('viewport-landscape') || (window.matchMedia?.('(orientation: landscape)')?.matches ?? false))
    }
    window.addEventListener('xiaochao:viewportchange', syncToolbarMode)
    return () => {
      window.removeEventListener('xiaochao:viewportchange', syncToolbarMode)
    }
  }, [])
  useEffect(() => {
    const mountOverlay = (node) => {
      if (!node) return node
      const root = playerRef.current?.querySelector('.runtime-overlay-root')
      if (root) root.append(node)
      else if (!node.isConnected) document.body.append(node)
      return node
    }
    window.__XIAOCHAO_RUNTIME_MOUNT_OVERLAY__ = mountOverlay
    return () => {
      if (window.__XIAOCHAO_RUNTIME_MOUNT_OVERLAY__ === mountOverlay) delete window.__XIAOCHAO_RUNTIME_MOUNT_OVERLAY__
    }
  }, [])
  useEffect(() => {
    const stage = stageRef.current
    if (!stage) return
    let refitFrame = 0
    let refitting = false
    let viewportKey = ''
    const currentViewportKey = () => {
      const viewport = window.visualViewport
      return [window.innerWidth, window.innerHeight, viewport?.width || 0, viewport?.height || 0].join(':')
    }
    const requestRefit = (force = false) => {
      const nextKey = currentViewportKey()
      if (!force && nextKey === viewportKey) return
      viewportKey = nextKey
      if (refitFrame) return
      const schedule = window.requestAnimationFrame || ((callback) => window.setTimeout(callback, 0))
      refitFrame = schedule(() => {
        refitFrame = 0
        const refit = window.ScreenSetup?.refit
        if (typeof refit !== 'function') return
        refitting = true
        try { refit.call(window.ScreenSetup) } finally { refitting = false }
      })
    }
    const syncFullscreen = () => {
      const active = !!fullscreenElement()
      document.body.classList.toggle('fullscreen-active', active)
      if (active) window.ScreenSetup?.lockOrientation?.()
      else window.ScreenSetup?.unlockOrientation?.()
      requestRefit(true)
      setIsFullscreen(active)
      if (active && game.kind === 'flash') {
        playerRef.current?.querySelector('ruffle-player')?.focus({ preventScroll: true })
      }
    }
    syncFullscreen()
    const onViewportResize = () => { if (!refitting) requestRefit() }
    document.addEventListener('fullscreenchange', syncFullscreen)
    document.addEventListener('webkitfullscreenchange', syncFullscreen)
    window.addEventListener('xiaochao:viewportchange', onViewportResize)
    return () => {
      if (refitFrame) {
        const cancel = window.cancelAnimationFrame || window.clearTimeout
        cancel(refitFrame)
      }
      document.body.classList.remove('fullscreen-active')
      document.removeEventListener('fullscreenchange', syncFullscreen)
      document.removeEventListener('webkitfullscreenchange', syncFullscreen)
      window.removeEventListener('xiaochao:viewportchange', onViewportResize)
    }
  }, [])
  useEffect(() => {
    if (nativeBackSignal === lastNativeBackSignal.current) return
    lastNativeBackSignal.current = nativeBackSignal
    setConfirming(true)
  }, [nativeBackSignal])
  useEffect(() => () => {
    runtimeCleanupRef.current()
    if (fullscreenElement()) exitFullscreen().catch(() => {})
    cleanupRuntimeArtifacts()
  }, [])
  const requestBack = useCallback(() => {
    if (!exitStartedRef.current) setConfirming(true)
  }, [])
  const toggleFullscreen = async () => {
    try {
      if (fullscreenElement()) await exitFullscreen()
      else if (playerRef.current?.requestFullscreen || playerRef.current?.webkitRequestFullscreen) {
        const request = playerRef.current.requestFullscreen || playerRef.current.webkitRequestFullscreen
        try {
          await request.call(playerRef.current, { navigationUI: 'hide' })
        } catch (_) {
          // Older Android WebViews reject the options object but still support
          // the fullscreen request itself.
          await request.call(playerRef.current)
        }
      }
    } catch (_) {}
  }
  const openSettings = () => {
    if (typeof window.__XIAOCHAO_OPEN_SETTINGS__ === 'function') {
      window.__XIAOCHAO_OPEN_SETTINGS__()
      return
    }
    const gear = document.getElementById('gear')
    if (gear) gear.click()
  }
  const exit = async () => {
    if (exitStartedRef.current) return
    exitStartedRef.current = true
    if (game.kind === 'j2me' && window.myflushAll) {
      let timer
      try {
        await new Promise((resolve) => {
          timer = window.setTimeout(resolve, 1500)
          window.myflushAll(resolve)
        })
      } catch (_) {} finally { window.clearTimeout(timer) }
    }
    try { window.__XIAOCHAO_J2ME_CTX && window.__XIAOCHAO_J2ME_CTX.runtime.stop() } catch (_) {}
    try { runtimeCleanupRef.current() } catch (_) {}
    if (fullscreenElement()) exitFullscreen().catch(() => {})
    cleanupRuntimeArtifacts()
    setConfirming(false)
    onBack()
  }
  return (
    <div ref={playerRef} className={`player${game.kind === 'j2me' ? ' j2mePlayer' : ''}${game.kind === 'flash' ? ' flashPlayer' : ''}${game.kind === 'flash' && isFullscreen ? ' flashPlayerFullscreen' : ''}${toolbarCollapsed ? ' runtimePlayerToolbarCollapsed' : ''}`}>
      <div className={toolbarCollapsed ? 'runtimeToolbar runtimeToolbarCollapsed' : 'runtimeToolbar'} role="toolbar" aria-label="游戏控制" onClick={(event) => event.stopPropagation()}>
        <Button className="runtimeToolbarToggle" onClick={() => setToolbarChoice({ landscape: toolbarLandscape, collapsed: !toolbarCollapsed })} aria-expanded={!toolbarCollapsed} aria-label={toolbarCollapsed ? '展开游戏控制' : '收起游戏控制'} title={toolbarCollapsed ? '展开游戏控制' : '收起游戏控制'}><MoreOutline aria-hidden="true" /></Button>
        {!toolbarCollapsed && <div className="runtimeToolbarContent">
          <Button className="runtimeToolbarButton runtimeToolbarBack" onClick={requestBack} aria-label="返回大厅" title="返回大厅"><LeftOutline aria-hidden="true" /></Button>
          <strong className="runtimeGame" title={game.name || game.file}>{game.name || game.file}</strong>
          <span className="runtimeToolbarSpacer" />
          {game.kind === 'j2me' && <Button className="runtimeToolbarButton runtimeToolbarIconButton" onClick={openSettings} aria-label="游戏设置" title="游戏设置" disabled={!settingsReady}><SetOutline aria-hidden="true" /></Button>}
          {(game.kind === 'j2me' || game.kind === 'maopao') && <Button className="runtimeToolbarButton runtimeToolbarIconButton" onClick={() => setInputMappingOpen(true)} aria-label="按键映射" title="按键映射" disabled={runtimeReadyFor !== game.file}><CalculatorOutline aria-hidden="true" /></Button>}
          <Button className="runtimeToolbarButton runtimeToolbarIconButton" onClick={toggleFullscreen} aria-label={isFullscreen ? '退出全屏' : '进入全屏'} title={isFullscreen ? '退出全屏' : '进入全屏'}>{isFullscreen ? <ShrinkOutline aria-hidden="true" /> : <ArrowsAltOutline aria-hidden="true" />}</Button>
        </div>}
      </div>
      <div ref={stageRef} className={game.kind === 'flash' ? 'playerStage flashPlayerStage' : 'playerStage'}>
        {game.kind === 'local-revival' ? <LocalRevivalPlayer onExit={requestBack} onCleanupReady={registerRuntimeCleanup} /> : game.kind === 'j2me' ? <J2MEPlayer game={game} onExit={requestBack} onReady={() => setRuntimeReadyFor(game.file)} /> : game.kind === 'flash' ? <FlashPlayer game={game} onCleanupReady={registerRuntimeCleanup} onExit={onBack} /> : <MrpPlayer game={game} onExit={requestBack} onReady={() => setRuntimeReadyFor(game.file)} />}
      </div>
      <div className="runtime-overlay-root" />
      <InputMappingPopup visible={inputMappingOpen} onClose={() => setInputMappingOpen(false)} />
      {confirming && (
        <div className="exitConfirm" role="dialog" aria-modal="true" aria-label="退出当前游戏？">
          <div className="exitBox">
            <strong>退出当前游戏？</strong>
            <span>当前游戏进度可能尚未保存。</span>
            <div>
              <Button className="optionButton" onClick={() => { setConfirming(false); onCancelBack?.() }}>继续游戏</Button>
              <Button className="optionButton optionDanger" color="danger" fill="outline" onClick={exit}>退出游戏</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function useNativeBackRequest() {
  const [signal, setSignal] = useState(0)
  const request = useCallback(() => setSignal((value) => value + 1), [])
  return [signal, request]
}

export function isRuntimeFrame() {
  return window.frameElement?.classList.contains('runtimeFrame') && new URLSearchParams(window.location.search).get('runtime-frame') === '1'
}

export function RuntimeFramePage() {
  const { kind, '*': file = '' } = useParams()
  const location = useLocation()
  const query = new URLSearchParams(location.search)
  const [nativeBackSignal, requestBack] = useNativeBackRequest()
  const leave = useCallback(() => window.parent.postMessage(RUNTIME_EXIT_MESSAGE, window.location.origin), [])
  const name = query.get('name') || file.split('/').pop() || file
  const game = GAME_KINDS.has(kind) && file
    ? { kind, file, name, vendor: '', desc: '', size: 0, iconUrl: null, local: query.get('local') === '1' }
    : null

  useLayoutEffect(() => {
    const parent = window.parent
    window.__XIAOCHAO_RN_HOST__ = parent.__XIAOCHAO_RN_HOST__
    window.__XIAOCHAO_RESPONSIVE_INSETS__ = parent.__XIAOCHAO_RESPONSIVE_INSETS__
    const cleanup = installResponsiveContract()
    window.__XIAOCHAO_NATIVE_BACK_REQUEST__ = requestBack
    parent.postMessage(RUNTIME_READY_MESSAGE, window.location.origin)
    return () => {
      delete window.__XIAOCHAO_NATIVE_BACK_REQUEST__
      delete window.__XIAOCHAO_RN_HOST__
      cleanup()
    }
  }, [requestBack])

  return game && FRAME_RUNTIME_KINDS.has(game.kind)
    ? <Player game={game} nativeBackSignal={nativeBackSignal} onBack={leave} />
    : null
}

function RuntimeFrame({ route, nativeBackSignal, onBack }) {
  const frame = useRef(null)
  const lastBackSignal = useRef(nativeBackSignal)
  const pendingBack = useRef(false)
  const url = new URL(window.location.href)
  url.searchParams.set('runtime-frame', '1')
  url.hash = routePath(route)

  useLayoutEffect(() => {
    const syncInsets = () => {
      const insets = window.__XIAOCHAO_RESPONSIVE_INSETS__
      if (insets) frame.current?.contentWindow?.__XIAOCHAO_RESPONSIVE_HOST__?.setInsets(insets)
    }
    const receive = (event) => {
      if (event.origin !== window.location.origin || event.source !== frame.current?.contentWindow) return
      if (event.data === RUNTIME_EXIT_MESSAGE) onBack()
      if (event.data === RUNTIME_READY_MESSAGE) {
        syncInsets()
        event.source.focus()
        if (pendingBack.current) {
          pendingBack.current = false
          event.source.__XIAOCHAO_NATIVE_BACK_REQUEST__?.()
        }
      }
    }
    window.addEventListener('message', receive)
    window.addEventListener('xiaochao:hostinsets', syncInsets)
    return () => {
      window.removeEventListener('message', receive)
      window.removeEventListener('xiaochao:hostinsets', syncInsets)
    }
  }, [onBack])

  useEffect(() => {
    if (lastBackSignal.current === nativeBackSignal) return
    lastBackSignal.current = nativeBackSignal
    const requestBack = frame.current?.contentWindow?.__XIAOCHAO_NATIVE_BACK_REQUEST__
    if (requestBack) requestBack()
    else pendingBack.current = true
  }, [nativeBackSignal])

  return <iframe ref={frame} className="runtimeFrame" title={route.game.name} src={url.href} allow="autoplay; fullscreen" />
}

export default function App() {
  useEffect(() => installResponsiveContract(), [])
  const location = useLocation()
  const params = useParams()
  const navigate = useNavigate()
  const query = new URLSearchParams(location.search)
  const routeType = location.pathname === '/test/keyboard'
    ? 'keyboard-test'
    : location.pathname.startsWith('/play/')
      ? 'play'
      : 'library'
  const tabParam = params.tab || query.get('tab') || localStorage.getItem('xiaochao-tab') || 'j2me'
  const tab = TAB_IDS.has(tabParam) ? tabParam : 'j2me'
  const gameFile = params['*'] || ''
  const gameName = query.get('name') || gameFile.split('/').pop() || gameFile
  const game = routeType === 'play' && GAME_KINDS.has(params.kind) && gameFile
    ? {
      kind: params.kind,
      file: gameFile,
      name: gameName,
      vendor: '',
      desc: '',
      size: 0,
      iconUrl: null,
      local: query.get('local') === '1',
    }
    : null
  const route = routeType === 'play' && game
    ? routeForGame(game, query.get('tab') || tab)
    : routeType === 'keyboard-test'
      ? { type: 'keyboard-test' }
      : routeForLibrary(tab)
  const [nativeBackSignal, requestBack] = useNativeBackRequest()
  const libraryScroll = useRef(null)
  const playing = route.type === 'play'
  const keyboardTest = route.type === 'keyboard-test'
  const directEntryStarted = useRef(false)
  const shouldBlock = useCallback(({ currentLocation, nextLocation, historyAction }) =>
    currentLocation.pathname.startsWith('/play/') && currentLocation.pathname !== nextLocation.pathname, [])
  const blocker = useBlocker(shouldBlock)

  useLayoutEffect(() => {
    if (!playing && libraryScroll.current !== null) {
      window.scrollTo(0, libraryScroll.current)
      libraryScroll.current = null
    }
  }, [playing])

  useEffect(() => {
    window.__XIAOCHAO_NATIVE_BACK_REQUEST__ = requestBack
    return () => {
      if (window.__XIAOCHAO_NATIVE_BACK_REQUEST__ === requestBack) delete window.__XIAOCHAO_NATIVE_BACK_REQUEST__
    }
  }, [requestBack])

  useEffect(() => {
    if (route.type === 'library') localStorage.setItem('xiaochao-tab', route.tab)
  }, [route.type, route.tab])

  useEffect(() => {
    if (routeType === 'library' && params.tab !== tab) navigate(routePath(routeForLibrary(tab)), { replace: true })
  }, [navigate, params.tab, routeType, tab])

  useEffect(() => {
    if (blocker.state !== 'blocked') return
    requestBack()
  }, [blocker.state, requestBack])

  useEffect(() => {
    if (route.type === 'play' && !location.state?.xiaochaoGameEntry && !directEntryStarted.current) {
      directEntryStarted.current = true
      navigate(routePath(routeForLibrary(route.tab)), {
        replace: true,
        state: { pendingDirectPlay: routePath(route) },
      })
      return
    }
    if (route.type === 'library' && location.state?.pendingDirectPlay) {
      navigate(location.state.pendingDirectPlay, {
        state: { xiaochaoGameEntry: true, originTab: route.tab },
      })
    }
  }, [location.state, navigate, route])

  function switchTab(id) {
    const next = routeForLibrary(id)
    navigate(routePath(next))
    localStorage.setItem('xiaochao-tab', id)
  }

  function startGame(game) {
    libraryScroll.current = window.scrollY
    const next = routeForGame(game, tab)
    navigate(routePath(next), { state: { xiaochaoGameEntry: true, originTab: tab } })
  }

  const leaveGame = useCallback(() => {
    const originTab = TAB_IDS.has(location.state?.originTab) ? location.state.originTab : tab
    const next = routeForLibrary(originTab)
    if (blocker.state === 'blocked') blocker.proceed()
    else navigate(routePath(next), { replace: true })
    localStorage.setItem('xiaochao-tab', next.tab)
  }, [blocker, location.state, navigate, tab])
  const cancelBlockedBack = useCallback(() => {
    if (blocker.state === 'blocked') blocker.reset()
  }, [blocker])

  const [libraryTick, setLibraryTick] = useState(0)

  return <>
    <div className="appShell" hidden={playing || keyboardTest}>
      <header className="header">
        <div className="brand"><AppstoreOutline aria-hidden="true" /><h1>小潮霸王</h1></div>
        <PrimaryNavigation items={TABS} activeId={tab} onSelect={switchTab} />
      </header>
      <main className="main">
        {TABS.map((t) => (
          <div key={t.id} className="pane">
            {tab === t.id && (t.id === 'store' ? <Store key={t.id} onRefreshLibrary={() => setLibraryTick((value) => value + 1)} /> : t.id === 'flash-store' ? <FlashStore key={t.id} onRefreshLibrary={() => setLibraryTick((value) => value + 1)} /> : <Library key={t.id + libraryTick} kind={t.id} onPlay={startGame} />)}
          </div>
        ))}
      </main>
    </div>
    {keyboardTest && <Suspense fallback={null}><KeyboardTestPage /></Suspense>}
    {playing && (FRAME_RUNTIME_KINDS.has(route.game.kind)
      ? <RuntimeFrame key={routePath(route)} route={route} nativeBackSignal={nativeBackSignal} onBack={leaveGame} />
      : <Player game={route.game} nativeBackSignal={nativeBackSignal} onBack={leaveGame} onCancelBack={cancelBlockedBack} />)}
  </>
}
