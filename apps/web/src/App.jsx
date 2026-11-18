import { Button, Card, DotLoading, Empty, Input, Popup, SearchBar, TextArea } from 'antd-mobile'
import { AddOutline, AppstoreOutline, CloseOutline, CompassOutline, LeftOutline, MoreOutline, MovieOutline, SetOutline, ShopbagOutline } from 'antd-mobile-icons'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { recordPlay, fetchRecent, fetchPopular } from './cloud.js'
import { J2MEPlayer } from './runtime/J2MEPlayer.jsx'
import { MrpPlayer } from './runtime/MrpPlayer.jsx'
import { LocalRevivalPlayer } from './runtime/LocalRevivalPlayer.jsx'
import { FlashPlayer } from './runtime/FlashPlayer.jsx'
import { cleanupRuntimeArtifacts } from './runtime/cleanup.js'
import { installResponsiveContract } from './responsive.js'
import { addBundled, addFromFile, addFromUrl, list as listLocalFlash, remove as removeLocalFlash } from './localFlash.js'

const TABS = [
  { id: 'j2me', label: 'J2ME', Icon: AppstoreOutline },
  { id: 'maopao', label: '冒泡社区', Icon: CompassOutline },
  { id: 'flash', label: 'Flash', Icon: MovieOutline },
  { id: 'flash-store', label: 'Flash 商城', Icon: ShopbagOutline },
  { id: 'store', label: '52java 商城', Icon: ShopbagOutline },
]

const TAB_IDS = new Set(TABS.map((item) => item.id))
const GAME_KINDS = new Set(['j2me', 'maopao', 'local-revival', 'flash'])
const RUNTIME_EXIT_POLICIES = Object.freeze({
  flash: 'dispose',
  'local-revival': 'dispose',
  j2me: 'reload',
  maopao: 'reload',
})
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

function decodeRoutePart(value, fallback = '') {
  try { return decodeURIComponent(value || fallback) } catch (_) { return fallback }
}

function routeForLibrary(tab) {
  return { type: 'library', tab: TAB_IDS.has(tab) ? tab : 'j2me' }
}

function routeForGame(game, tab) {
  return { type: 'play', tab: TAB_IDS.has(tab) ? tab : 'j2me', game }
}

function routeHash(route) {
  if (route.type === 'play') {
    const params = new URLSearchParams()
    params.set('tab', route.tab)
    params.set('name', route.game.name || route.game.file)
    if (route.game.local) params.set('local', '1')
    const suffix = params.toString()
    return '#/play/' + encodeURIComponent(route.game.kind) + '/' + encodeURIComponent(route.game.file) + (suffix ? '?' + suffix : '')
  }
  return '#/library/' + route.tab
}

function fullscreenElement() {
  return document.fullscreenElement || document.webkitFullscreenElement || null
}

function exitFullscreen() {
  const exit = document.exitFullscreen || document.webkitExitFullscreen
  return typeof exit === 'function' ? Promise.resolve(exit.call(document)) : Promise.resolve()
}

function parseRoute(hash = '') {
  const value = String(hash || '').replace(/^#\/?/, '')
  const [path, queryString = ''] = value.split('?')
  const parts = path.split('/')
  if (parts[0] === 'play' && parts[1] && parts[2]) {
    const kind = decodeRoutePart(parts[1])
    const file = decodeRoutePart(parts[2])
    const query = new URLSearchParams(queryString)
    if (GAME_KINDS.has(kind) && file) {
      const name = query.get('name') || file.split('/').pop() || file
      return routeForGame({ kind, file, name, vendor: '', desc: '', size: 0, iconUrl: null, local: query.get('local') === '1' }, query.get('tab'))
    }
  }
  if (parts[0] === 'library') return routeForLibrary(decodeRoutePart(parts[1], 'j2me'))
  const requested = new URLSearchParams(window.location.search).get('tab')
  return routeForLibrary(TAB_IDS.has(requested) ? requested : (localStorage.getItem('xiaochao-tab') || 'j2me'))
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
            iconUrl: null,
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
    // The RN package serves a static manifest from APK assets; desktop keeps
    // the Node endpoint so its live catalog and icon extraction still work.
    const endpoint = isEmbeddedHost() ? '/jar-manifest.json' : '/__jars'
    fetch(endpoint)
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
            desc: '',
            size: 0,
            iconUrl: g.icon ? '/__icon?jar=' + encodeURIComponent(g.file) : null,
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
        return
      }
      window.LocalJars.list()
        .then((infos) => {
          if (!alive) return
          setGames(
            (infos || []).map((info) => ({
              kind: 'j2me',
              file: info.file,
              name: info.name || info.file,
              vendor: info.vendor || '',
              desc: '',
              size: info.data ? info.data.size : 0,
              iconUrl: info.icon ? URL.createObjectURL(info.icon) : null,
              local: true,
            }))
          )
        })
        .catch((e) => setError(String(e.message || e)))
    }
    poll()
    return () => {
      alive = false
    }
  }, [enabled, tick])

  function refresh() {
    setTick((t) => t + 1)
  }

  async function addFiles(files) {
    if (!hasLocalJars()) throw new Error('LocalJars 未加载')
    for (const f of files) {
      await window.LocalJars.add(f)
    }
    refresh()
  }

  async function remove(file) {
    if (!hasLocalJars()) return
    await window.LocalJars.remove(file)
    await window.LocalJars.clearData('local:' + file)
    refresh()
  }

  return { games, error, addFiles, remove, refresh }
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
            iconUrl: null,
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

  return {
    ...state,
    refresh: () => setTick((value) => value + 1),
    remove: async (id) => { await removeLocalFlash(id); setTick((value) => value + 1) },
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

function GameCard({ game, onOpen, selected }) {
  const initial = (game.name || '?').trim().charAt(0).toUpperCase()
  return (
    <button
      type="button"
      className={'card' + (selected ? ' cardSelected' : '')}
      aria-pressed={!!selected}
      onClick={() => onOpen(game)}
      title={game.desc || game.name}
    >
      <div className="cardIcon">
        {game.iconUrl ? <img className="h-full w-full object-contain image-render-pixel" src={game.iconUrl} alt="" /> : initial}
      </div>
      <div className="cardName">{game.name}</div>
      <div className="cardMeta">
        {[game.vendor, formatSize(game.size), game.local ? '本机' : ''].filter(Boolean).join(' · ') || '\u00a0'}
      </div>
    </button>
  )
}

function MiniCard({ item, onOpen }) {
  const initial = (item.name || '?').trim().charAt(0).toUpperCase()
  const meta = item.plays != null ? item.plays + ' 次游玩' : ''
  return (
    <button className="miniCard" onClick={() => onOpen(item)} title={item.name}>
      <div className="cardIcon">{initial}</div>
      <div className="cardName">{item.name}</div>
      {meta && <div className="cardMeta">{meta}</div>}
    </button>
  )
}

function GameRow({ title, items, onOpen }) {
  if (!items || items.length === 0) return null
  return (
    <section className="row">
      <h2 className="rowTitle">{title}</h2>
      <div className="rowScroll">
        {items.map((it) => (
          <MiniCard key={it.kind + ':' + it.file} item={it} onOpen={onOpen} />
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
          <div className="optionIcon" aria-hidden="true">{(game.name || '?').trim().charAt(0).toUpperCase()}</div>
          <div className="optionTitle"><strong>{game.name}</strong><span>{game.vendor || (game.local ? '本机游戏' : '在线游戏')}</span></div>
          <Button fill="none" className="iconButton" onClick={onClose} aria-label="关闭"><CloseOutline aria-hidden="true" /></Button>
        </div>
        <div className="optionBody">
          <Button className="optionButton" color="primary" onClick={() => { onStart(game); onClose() }}>启动</Button>
          <Button className="optionButton" onClick={() => { onSelect(game); onClose() }}>选择</Button>
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
  const [selectedGame, setSelectedGame] = useState(null)

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

  // 本地榜单：Library 从 player 返回时会重挂载，重新读取 localStorage。
  useEffect(() => {
    if (kind === 'flash') return
    fetchRecent().then(setRecent)
    fetchPopular().then(setPopular)
  }, [kind])

  function handlePlay(g) {
    onPlay(g)
    if (g.kind !== 'flash') recordPlay(g)
  }

  function openMenu(g) { setMenuGame(g) }

  function removeLocalGame(g) {
    if (!g.local) return
    if (window.confirm('卸载「' + g.name + '」？')) {
      if (g.kind === 'flash') localFlash.remove(g.file)
      else local.remove(g.file)
    }
  }

  const games = useMemo(() => {
    const revival = kind === 'j2me' ? [{kind: 'local-revival', file: 'local-revival', name: '大宋豪侠 · 本地复活', vendor: '本地服务端', desc: '可移动地图、NPC 和基础战斗', size: 0, local: false}] : []
    const all = kind === 'flash' ? FLASH_GAMES.concat(localFlash.games) : revival.concat(server.games, local.games)
    const q = query.trim().toLowerCase()
    if (!q) return all
    return all.filter(
      (g) => (g.name || '').toLowerCase().includes(q) || (g.vendor || '').toLowerCase().includes(q)
    )
  }, [kind, server.games, local.games, localFlash.games, query])

  function handleUpload(e) {
    const files = Array.from(e.target.files || [])
    e.target.value = ''
    if (!files.length) return
    setBusy(true)
    local
      .addFiles(files)
      .catch((err) => window.alert('导入失败：' + (err.message || err)))
      .finally(() => setBusy(false))
  }

  return (
    <section className="library">
      <div className="sectionHeading">
        <h2>{TABS.find((tab) => tab.id === kind)?.label}游戏库</h2>
        <span className="count" role="status">
          {server.loading || localFlash.loading ? <><DotLoading /> 加载中</> : server.error || localFlash.error ? '部分加载失败' : games.length + ' 款'}
        </span>
      </div>
      <div className="toolbar">
        <SearchBar
          className="search"
          placeholder={'搜索' + (kind === 'j2me' ? ' J2ME' : kind === 'flash' ? ' Flash' : ' 冒泡') + '游戏…'}
          value={query}
          onChange={setQuery}
        />
        {kind === 'j2me' && (
          <FilePicker accept=".jar" multiple onChange={handleUpload} disabled={busy}>
            {busy ? '导入中…' : <><AddOutline aria-hidden="true" /> 添加 JAR</>}
          </FilePicker>
        )}
      </div>
      {kind !== 'flash' && <GameRow title="🔥 大家都在玩" items={popular} onOpen={openMenu} />}
      {kind !== 'flash' && <GameRow title="🕘 最近在玩" items={recent} onOpen={openMenu} />}
      {(server.error || localFlash.error) && (
        <div className="status statusError" role="alert">{server.error ? `在线列表加载失败：${server.error}（请确认本地服务已在 8080 端口运行）` : localFlash.error}</div>
      )}
      <div className="gameGrid">
          {games.map((g) => (
            <GameCard
              key={(g.local ? 'local:' : '') + g.kind + ':' + g.file}
              game={g}
              onOpen={openMenu}
              selected={selectedGame && selectedGame.file === g.file && selectedGame.kind === g.kind}
            />
          ))}
      </div>
      {!server.error && !localFlash.error && !server.loading && !localFlash.loading && games.length === 0 && <Empty className="emptyPanel" description="没有匹配的游戏" />}
      <GameMenu
        game={menuGame}
        onStart={handlePlay}
        onSelect={setSelectedGame}
        onRemove={removeLocalGame}
        onClose={() => setMenuGame(null)}
      />
    </section>
  )
}

function FilePicker({ children, ...inputProps }) {
  const input = useRef(null)
  return (
    <>
      <Button className="upload" size="small" disabled={inputProps.disabled} onClick={() => input.current?.click()}>{children}</Button>
      <input {...inputProps} type="file" ref={input} hidden />
    </>
  )
}

function FlashStore({ onRefreshLibrary }) {
  const local = useLocalFlash(true)
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [url, setUrl] = useState('')
  const [file, setFile] = useState(null)
  const [busy, setBusy] = useState('')
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const added = useMemo(() => new Set(local.games.map((game) => game.dedupeKey)), [local.games])

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
      setError(cause.message || String(cause))
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
      if (file) await addFromFile(file, { name, description })
      else await addFromUrl(url, { name, description })
      setMessage(`已加入「${name.trim()}」，现在可以在 Flash 库中启动。`)
      setName('')
      setDescription('')
      setUrl('')
      setFile(null)
      const input = document.getElementById('flash-file-input')
      if (input) input.value = ''
      local.refresh()
      onRefreshLibrary()
    } catch (cause) {
      setError(cause.message || String(cause))
    } finally {
      setBusy('')
    }
  }

  return <section className="storePage">
    <div className="storeHero">
      <div><h2 className="storeHeroTitle">Flash 游戏商城</h2><p className="storeHeroText">游戏下载到当前设备的本机存储，服务器不会保存你的游戏文件。</p></div>
      <Button className="ghostButton" size="small" fill="outline" type="button" onClick={local.refresh} disabled={local.loading}>刷新本机库</Button>
    </div>
    {(local.error || error) && <div className="status statusError" role="alert">{error || local.error} <Button className="inlineAction" fill="none" type="button" onClick={local.refresh}>重试</Button></div>}
    {message && <div className="status statusSuccess" role="status">{message}</div>}
    <form className="flashImportPanel" onSubmit={submit}>
      <h3>添加 Flash 游戏</h3>
      <p>输入允许跨域读取的 SWF 直链，或选择本地文件。</p>
      <div className="flashImportFields">
        <label>游戏名称<Input className="field" placeholder="输入游戏名称" value={name} onChange={setName} aria-required="true" /></label>
        <label>SWF 直链<Input className="field" type="url" placeholder="https://…" value={url} onChange={setUrl} /></label>
        <label>游戏说明<TextArea className="field flashDescription" placeholder="选填" rows={2} value={description} onChange={setDescription} /></label>
        <FilePicker id="flash-file-input" accept=".swf,application/x-shockwave-flash" onChange={(event) => setFile(event.target.files?.[0] || null)}>
          {file ? file.name : '选择本地 SWF'}
        </FilePicker>
        <Button className="downloadButton" color="primary" size="small" type="submit" disabled={busy !== '' || local.loading}>{busy === 'custom' ? '加入中…' : '加入本机'}</Button>
      </div>
    </form>
    <div className="storeGrid">{FLASH_GAMES.map((game) => {
      const key = `catalog:${game.catalogId}`
      const isAdded = added.has(key)
      return <Card className="storeCard" bodyClassName="storeCardBody" key={game.file}>
        <div className="storeIcon">{game.name.charAt(0)}</div>
        <div className="storeInfo"><h3 className="storeInfoTitle">{game.name}</h3><p className="storeInfoMeta">内置目录 · {formatSize(game.size)}</p><span className="storeInfoDesc">{game.desc}</span></div>
        <Button className="downloadButton" color="primary" size="small" type="button" onClick={() => addBundledGame(game)} disabled={busy !== '' || local.loading}>{busy === game.file ? '下载中…' : isAdded ? '已加入' : '加入本机'}</Button>
      </Card>
    })}</div>
  </section>
}

function Store({ onRefreshLibrary }) {
  const [query, setQuery] = useState('')
  const [appliedQuery, setAppliedQuery] = useState('')
  const [category, setCategory] = useState('')
  const [page, setPage] = useState(1)
  const store = useJavaStore(appliedQuery, category, page)
  const [busy, setBusy] = useState('')
  const [done, setDone] = useState('')
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'auto' })
  }, [appliedQuery, category, page])
  async function download(game) {
    setBusy(game.id); setDone('')
    try {
      if (!hasLocalJars()) throw new Error('浏览器本机存储不可用')
      const response = await fetch(apiPath('/__52java/download?id=' + encodeURIComponent(game.id)))
      if (!response.ok) {
        let message = '下载失败'
        try { message = (await response.json()).error || message } catch (_) {}
        throw new Error(message)
      }
      const blob = await response.blob()
      if (!blob.size) throw new Error('下载内容为空')
      await window.LocalJars.add(new File([blob], localJarName(game.name, game.id), { type: 'application/java-archive' }))
      setDone(game.id)
      onRefreshLibrary()
    } catch (error) { window.alert('下载失败：' + (error.message || error)) }
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
    {store.error && <div className="status statusError" role="alert">商城目录加载失败：{store.error} <Button className="inlineAction" fill="none" onClick={store.refresh}>重试</Button></div>}
    {store.loading && <div className="status" role="status"><DotLoading /> 正在同步 52java 目录…</div>}
    {!store.loading && !store.error && !store.games.length && <div className="emptyPanel"><strong>{appliedQuery ? '没有匹配的游戏' : '目录暂时为空'}</strong><span>可以调整筛选条件，或稍后刷新目录。</span></div>}
    <div className="storeGrid">{store.games.map((game) => <Card className="storeCard" bodyClassName="storeCardBody" key={game.id}>
      <div className="storeIcon">{game.iconUrl ? <img src={game.iconUrl} alt="" /> : (game.name || '?').charAt(0)}</div>
      <div className="storeInfo"><h3 className="storeInfoTitle">{game.name}</h3><p className="storeInfoMeta">52java · {game.plays.toLocaleString()} 次下载</p><span className="storeInfoDesc">经典 Java 手机游戏</span></div>
      <Button className="downloadButton" color="primary" size="small" onClick={() => download(game)} disabled={busy === game.id}>{busy === game.id ? '下载中…' : done === game.id ? '已加入' : '加入库'}</Button>
    </Card>)}</div>
    {!store.loading && !store.error && store.games.length > 0 && <div className="storePagination"><span>第 {page} / {store.pages} 页 · {store.total.toLocaleString()} 款</span><div><Button type="button" size="small" fill="outline" className="ghostButton" disabled={page <= 1} onClick={() => setPage(page - 1)}>上一页</Button><Button type="button" size="small" fill="outline" className="ghostButton" disabled={page >= store.pages} onClick={() => setPage(page + 1)}>下一页</Button></div></div>}
  </section>
}

function Player({ game, onBack, nativeBackSignal }) {
  const [confirming, setConfirming] = useState(false)
  const [isFullscreen, setIsFullscreen] = useState(() => Boolean(fullscreenElement()))
  const [runtimeReadyFor, setRuntimeReadyFor] = useState('')
  const [toolbarCollapsed, setToolbarCollapsed] = useState(() => window.matchMedia?.('(orientation: landscape)')?.matches ?? false)
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
      setToolbarCollapsed(document.body.classList.contains('viewport-landscape') || (window.matchMedia?.('(orientation: landscape)')?.matches ?? false))
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
  const exit = () => {
    if (exitStartedRef.current) return
    exitStartedRef.current = true
    try { window.myflushAll && window.myflushAll() } catch (_) {}
    try { window.__XIAOCHAO_J2ME_CTX && window.__XIAOCHAO_J2ME_CTX.runtime.stop() } catch (_) {}
    try { runtimeCleanupRef.current() } catch (_) {}
    if (fullscreenElement()) exitFullscreen().catch(() => {})
    cleanupRuntimeArtifacts()
    setConfirming(false)
    onBack()
    if (RUNTIME_EXIT_POLICIES[game.kind] === 'reload') {
      // The classic VM installs process-wide listeners and caches globals that
      // cannot be safely reconstructed inside the SPA realm. Reload after the
      // library hash is committed so the next game starts from a fresh realm.
      window.__XIAOCHAO_RUNTIME_RELOAD_COUNT__ = (window.__XIAOCHAO_RUNTIME_RELOAD_COUNT__ || 0) + 1
      window.setTimeout(() => window.location.reload(), 0)
    }
  }
  return (
    <div ref={playerRef} className={`player${toolbarCollapsed ? ' runtimePlayerToolbarCollapsed' : ''}`}>
      <div className={toolbarCollapsed ? 'runtimeToolbar runtimeToolbarCollapsed' : 'runtimeToolbar'} role="toolbar" aria-label="游戏控制" onClick={(event) => event.stopPropagation()}>
        <Button className="runtimeToolbarToggle" onClick={() => setToolbarCollapsed((value) => !value)} aria-expanded={!toolbarCollapsed} aria-label={toolbarCollapsed ? '展开游戏控制' : '收起游戏控制'} title={toolbarCollapsed ? '展开游戏控制' : '收起游戏控制'}><MoreOutline aria-hidden="true" /></Button>
        {!toolbarCollapsed && <div className="runtimeToolbarContent">
          <Button className="runtimeToolbarButton runtimeToolbarBack" onClick={requestBack} aria-label="返回大厅" title="返回大厅"><LeftOutline aria-hidden="true" /></Button>
          <strong className="runtimeGame" title={game.name || game.file}>{game.name || game.file}</strong>
          <span className="runtimeToolbarSpacer" />
          {game.kind === 'j2me' && <Button className="runtimeToolbarButton runtimeToolbarIconButton" onClick={openSettings} aria-label="游戏设置" title="游戏设置" disabled={!settingsReady}><SetOutline aria-hidden="true" /></Button>}
          <Button className="runtimeToolbarButton runtimeToolbarIconButton" onClick={toggleFullscreen} aria-label={isFullscreen ? '退出全屏' : '进入全屏'} title={isFullscreen ? '退出全屏' : '进入全屏'}><span aria-hidden="true">{isFullscreen ? '⤢' : '⛶'}</span></Button>
        </div>}
      </div>
      <div ref={stageRef} className={game.kind === 'flash' ? 'playerStage flashPlayerStage' : 'playerStage'}>
        {game.kind === 'local-revival' ? <LocalRevivalPlayer onExit={requestBack} onCleanupReady={registerRuntimeCleanup} /> : game.kind === 'j2me' ? <J2MEPlayer game={game} onExit={requestBack} onReady={() => setRuntimeReadyFor(game.file)} /> : game.kind === 'flash' ? <FlashPlayer game={game} onCleanupReady={registerRuntimeCleanup} onExit={onBack} /> : <MrpPlayer game={game} onExit={requestBack} onReady={() => setRuntimeReadyFor(game.file)} />}
      </div>
      <div className="runtime-overlay-root" />
      {confirming && (
        <div className="exitConfirm" role="dialog" aria-modal="true" aria-label="退出当前游戏？">
          <div className="exitBox">
            <strong>退出当前游戏？</strong>
            <span>当前游戏进度可能尚未保存。</span>
            <div>
              <Button className="optionButton" onClick={() => setConfirming(false)}>继续游戏</Button>
              <Button className="optionButton optionDanger" color="danger" fill="outline" onClick={exit}>退出游戏</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default function App() {
  useEffect(() => installResponsiveContract(), [])
  const [route, setRoute] = useState(() => parseRoute(window.location.hash))
  const [nativeBackSignal, setNativeBackSignal] = useState(0)
  const routeRef = useRef(route)
  const restoringHistory = useRef(false)

  useEffect(() => {
    const requestNativeBack = () => setNativeBackSignal((value) => value + 1)
    window.__XIAOCHAO_NATIVE_BACK_REQUEST__ = requestNativeBack
    return () => {
      if (window.__XIAOCHAO_NATIVE_BACK_REQUEST__ === requestNativeBack) delete window.__XIAOCHAO_NATIVE_BACK_REQUEST__
    }
  }, [])

  useEffect(() => { routeRef.current = route }, [route])

  useEffect(() => {
    const normalized = routeHash(route)
    const historyState = window.history.state || {}
    if (route.type === 'play' && !historyState.xiaochaoGameEntry) {
      const library = routeForLibrary(route.tab)
      window.history.replaceState({ xiaochaoRoute: routeHash(library), xiaochaoLibraryEntry: true }, '', routeHash(library))
      window.history.pushState({ xiaochaoRoute: normalized, xiaochaoGameEntry: true }, '', normalized)
    } else if (window.location.hash !== normalized) {
      window.history.replaceState({ xiaochaoRoute: normalized }, '', normalized)
    }
    const handleLocation = () => {
      const next = parseRoute(window.location.hash)
      const current = routeRef.current
      if (current.type === 'play' && next.type !== 'play') {
        if (!restoringHistory.current) {
          restoringHistory.current = true
          window.history.forward()
          setNativeBackSignal((value) => value + 1)
        }
        return
      }
      if (restoringHistory.current) restoringHistory.current = false
      setRoute(next)
      if (next.type === 'library') localStorage.setItem('xiaochao-tab', next.tab)
    }
    window.addEventListener('popstate', handleLocation)
    window.addEventListener('hashchange', handleLocation)
    return () => {
      window.removeEventListener('popstate', handleLocation)
      window.removeEventListener('hashchange', handleLocation)
    }
  }, [])

  const tab = route.type === 'play' ? route.tab : route.tab

  function switchTab(id) {
    const next = routeForLibrary(id)
    window.history.pushState({ xiaochaoRoute: routeHash(next) }, '', routeHash(next))
    setRoute(next)
    localStorage.setItem('xiaochao-tab', id)
  }

  function startGame(game) {
    const next = routeForGame(game, tab)
    window.history.pushState({ xiaochaoRoute: routeHash(next), xiaochaoGameEntry: true }, '', routeHash(next))
    setRoute(next)
  }

  function leaveGame() {
    const next = routeForLibrary(route.type === 'play' ? route.tab : tab)
    window.history.replaceState({ xiaochaoRoute: routeHash(next) }, '', routeHash(next))
    setRoute(next)
    localStorage.setItem('xiaochao-tab', next.tab)
  }

  const [libraryTick, setLibraryTick] = useState(0)
  if (route.type === 'play') return <Player game={route.game} nativeBackSignal={nativeBackSignal} onBack={leaveGame} />

  return (
    <div className="appShell">
      <header className="header">
        <div className="brand"><AppstoreOutline aria-hidden="true" /><h1>小潮霸王</h1></div>
        <nav className="tabs" aria-label="游戏库和商城">
          {TABS.map(({ id, label, Icon }) => (
            <Button
              key={id}
              className={'tab' + (tab === id ? ' tabActive' : '')}
              fill="none"
              aria-current={tab === id ? 'page' : undefined}
              onClick={() => switchTab(id)}
            >
              <Icon aria-hidden="true" />
              <span>{label}</span>
            </Button>
          ))}
        </nav>
      </header>
      <main className="main">
        {TABS.map((t) => (
          <div key={t.id} className="pane">
            {tab === t.id && (t.id === 'store' ? <Store key={t.id} onRefreshLibrary={() => setLibraryTick((value) => value + 1)} /> : t.id === 'flash-store' ? <FlashStore key={t.id} onRefreshLibrary={() => setLibraryTick((value) => value + 1)} /> : <Library key={t.id + libraryTick} kind={t.id} onPlay={startGame} />)}
          </div>
        ))}
      </main>
    </div>
  )
}
