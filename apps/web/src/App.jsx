import { useEffect, useMemo, useRef, useState } from 'react'
import { recordPlay, fetchRecent, fetchPopular } from './cloud.js'
import { J2MEPlayer } from './runtime/J2MEPlayer.jsx'
import { MrpPlayer } from './runtime/MrpPlayer.jsx'

const TABS = [
  { id: 'j2me', label: 'J2ME' },
  { id: 'maopao', label: '冒泡社区' },
  { id: 'store', label: '52java 商城' },
]

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

function useServerJars() {
  const [state, setState] = useState({ loading: true, error: null, games: [] })
  useEffect(() => {
    let alive = true
    fetch('/__jars')
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
  }, [])
  return state
}

function useJavaStore(query, category, page) {
  const [state, setState] = useState({ loading: true, error: null, games: [], siteUrl: 'https://java.52emu.cn', pages: 1, total: 0 })
  const [tick, setTick] = useState(0)
  useEffect(() => {
    let alive = true
    setState((current) => ({ ...current, loading: true, error: null }))
    const params = new URLSearchParams({ page: String(page) })
    if (query) params.set('query', query)
    if (category) params.set('category', category)
    if (tick) params.set('refresh', '1')
    fetch('/__52java/catalog?' + params)
      .then((r) => { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json() })
      .then((data) => { if (alive) setState({ loading: false, error: null, games: data.games || [], siteUrl: data.siteUrl || 'https://java.52emu.cn', pages: data.pages || 1, total: data.total || 0 }) })
      .catch((e) => { if (alive) setState((current) => ({ ...current, loading: false, error: String(e.message || e) })) })
    return () => { alive = false }
  }, [tick, query, category, page])
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

function formatSize(n) {
  if (!n) return ''
  if (n >= 1024 * 1024) return (n / 1024 / 1024).toFixed(1) + ' MB'
  return Math.max(1, Math.round(n / 1024)) + ' KB'
}

function GameCard({ game, onOpen, selected }) {
  const initial = (game.name || '?').trim().charAt(0).toUpperCase()
  return (
    <div
      className={'card ' + (selected ? 'cardSelected' : '')}
      role="button"
      tabIndex={0}
      onClick={() => onOpen(game)}
      onKeyDown={(e) => e.key === 'Enter' && onOpen(game)}
      title={game.desc || game.name}
    >
      <div className="cardIcon">
        {game.iconUrl ? <img className="h-full w-full object-contain image-render-pixel" src={game.iconUrl} alt="" /> : initial}
      </div>
      <div className="cardName">{game.name}</div>
      <div className="cardMeta">
        {[game.vendor, formatSize(game.size), game.local ? '本机' : ''].filter(Boolean).join(' · ') || '\u00a0'}
      </div>
    </div>
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
  if (!game) return null
  return (
    <div className="optionBackdrop" role="presentation" onClick={onClose}>
      <section className="optionSheet" role="dialog" aria-modal="true" aria-label="游戏选项" onClick={(e) => e.stopPropagation()}>
        <div className="optionHead">
          <div className="optionIcon">{(game.name || '?').trim().charAt(0).toUpperCase()}</div>
          <div className="min-w-0 grid gap-1"><strong className="overflow-hidden text-ellipsis whitespace-nowrap">{game.name}</strong><span>{game.vendor || (game.local ? '本机游戏' : '在线游戏')}</span></div>
          <button className="border-0 bg-transparent text-2xl text-dim" onClick={onClose} aria-label="关闭">×</button>
        </div>
        <div className="optionBody">
          <button className="optionButton" onClick={() => { onSelect(game); onClose() }}>选择</button>
          <button className="optionButton optionPrimary" onClick={() => { onStart(game); onClose() }}>启动</button>
          {game.local && <button className="optionButton optionDanger" onClick={() => { onRemove(game); onClose() }}>卸载</button>}
        </div>
      </section>
    </div>
  )
}

function Library({ kind, onPlay }) {
  // 两个 hook 无条件调用，保证 hooks 顺序稳定；未命中的运行时返回空列表
  const serverJars = useServerJars()
  const serverMrps = useServerGames('maopao')
  const server = kind === 'j2me' ? serverJars : serverMrps
  const local = useLocalJars(kind === 'j2me')
  const [query, setQuery] = useState('')
  const [busy, setBusy] = useState(false)
  const [recent, setRecent] = useState([])
  const [popular, setPopular] = useState([])
  const [menuGame, setMenuGame] = useState(null)
  const [selectedGame, setSelectedGame] = useState(null)

  useEffect(() => {
    if (!menuGame) return undefined
    const close = (event) => event.key === 'Escape' && setMenuGame(null)
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    window.addEventListener('keydown', close)
    return () => {
      document.body.style.overflow = previousOverflow
      window.removeEventListener('keydown', close)
    }
  }, [menuGame])

  // 本地榜单：Library 从 player 返回时会重挂载，重新读取 localStorage。
  useEffect(() => {
    fetchRecent().then(setRecent)
    fetchPopular().then(setPopular)
  }, [])

  function handlePlay(g) {
    // 在用户点击游戏卡片的手势链路里请求全屏，避免浏览器拦截自动全屏。
    if (document.documentElement.requestFullscreen && !document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(() => {})
    }
    onPlay(g)
    recordPlay(g)
  }

  function openMenu(g) { setMenuGame(g) }

  function removeFromMenu(g) {
    if (!g.local) return
    if (window.confirm('卸载「' + g.name + '」？')) local.remove(g.file)
  }

  const games = useMemo(() => {
    const all = server.games.concat(local.games)
    const q = query.trim().toLowerCase()
    if (!q) return all
    return all.filter(
      (g) => (g.name || '').toLowerCase().includes(q) || (g.vendor || '').toLowerCase().includes(q)
    )
  }, [server.games, local.games, query])

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
      <div className="toolbar">
        <input
          className="search"
          type="search"
          placeholder={'搜索' + (kind === 'j2me' ? ' J2ME' : ' 冒泡') + '游戏…'}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        {kind === 'j2me' && (
          <label className={'upload' + (busy ? ' opacity-60 pointer-events-none' : '')}>
            {busy ? '导入中…' : '＋ 添加 .jar'}
            <input type="file" accept=".jar" multiple hidden onChange={handleUpload} />
          </label>
        )}
        <span className="count">
          {server.loading ? '加载中…' : server.error ? '加载失败' : games.length + ' 款'}
        </span>
      </div>
      <GameRow title="🔥 大家都在玩" items={popular} onOpen={openMenu} />
      <GameRow title="🕘 最近在玩" items={recent} onOpen={openMenu} />
      {server.error && (
        <div className="status statusError">在线列表加载失败：{server.error}（请确认本地服务已在 8080 端口运行）</div>
      )}
      {!server.error && (
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
      )}
      {!server.error && !server.loading && games.length === 0 && <div className="status">没有匹配的游戏</div>}
      <GameMenu
        game={menuGame}
        onStart={handlePlay}
        onSelect={setSelectedGame}
        onRemove={removeFromMenu}
        onClose={() => setMenuGame(null)}
      />
    </section>
  )
}

function Store({ onRefreshLibrary }) {
  const [query, setQuery] = useState('')
  const [appliedQuery, setAppliedQuery] = useState('')
  const [category, setCategory] = useState('')
  const [page, setPage] = useState(1)
  const store = useJavaStore(appliedQuery, category, page)
  const [busy, setBusy] = useState('')
  const [done, setDone] = useState('')
  async function download(game) {
    setBusy(game.id); setDone('')
    try {
      const response = await fetch('/__52java/download?id=' + encodeURIComponent(game.id))
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || '下载失败')
      setDone(game.id)
      onRefreshLibrary()
    } catch (error) { window.alert('下载失败：' + (error.message || error)) }
    finally { setBusy('') }
  }
  return <section className="storePage">
    <div className="storeHero">
      <div><span className="eyebrow">REMOTE LIBRARY</span><h2 className="storeHeroTitle">52java 游戏商城</h2><p className="storeHeroText">从经典 Java 游戏目录直接加入你的本地模拟器。</p></div>
      <div className="storeActions"><button className="ghostButton" onClick={store.refresh} disabled={store.loading}>刷新目录</button><a className="ghostButton" href={store.siteUrl} target="_blank" rel="noreferrer">打开原站 ↗</a></div>
    </div>
    <form className="storeFilters" onSubmit={(event) => { event.preventDefault(); setPage(1); setAppliedQuery(query.trim()) }}>
      <input className="search" type="search" placeholder="搜索 52java 游戏" value={query} onChange={(event) => setQuery(event.target.value)} />
      <select className="categorySelect" value={category} onChange={(event) => { setPage(1); setCategory(event.target.value) }} aria-label="游戏分类">
        <option value="">全部分类</option><option value="1">角色</option><option value="2">动作</option><option value="3">益智</option><option value="4">策略</option><option value="5">射击</option><option value="7">冒险</option><option value="8">赛车</option><option value="9">棋牌</option><option value="10">养成</option><option value="11">经营</option><option value="12">飞行</option><option value="13">格斗</option><option value="14">体育</option>
      </select>
      <button className="ghostButton" type="submit">搜索</button>
    </form>
    {store.error && <div className="status statusError">商城目录加载失败：{store.error} <button className="inlineAction" onClick={store.refresh}>重试</button></div>}
    {store.loading && <div className="status">正在同步 52java 目录…</div>}
    {!store.loading && !store.error && !store.games.length && <div className="emptyPanel"><strong>{appliedQuery ? '没有匹配的游戏' : '目录暂时为空'}</strong><span>可以调整筛选条件，或稍后刷新目录。</span></div>}
    <div className="storeGrid">{store.games.map((game) => <article className="storeCard" key={game.id}>
      <div className="storeIcon">{game.iconUrl ? <img src={game.iconUrl} alt="" /> : (game.name || '?').charAt(0)}</div>
      <div className="storeInfo"><h3 className="storeInfoTitle">{game.name}</h3><p className="storeInfoMeta">52java · {game.plays.toLocaleString()} 次下载</p><span className="storeInfoDesc">经典 Java 手机游戏</span></div>
      <button className="downloadButton" onClick={() => download(game)} disabled={busy === game.id}>{busy === game.id ? '下载中…' : done === game.id ? '已加入' : '加入库'}</button>
    </article>)}</div>
    {!store.loading && !store.error && store.games.length > 0 && <div className="storePagination"><span>第 {page} / {store.pages} 页 · {store.total.toLocaleString()} 款</span><div><button className="ghostButton" disabled={page <= 1} onClick={() => setPage(page - 1)}>上一页</button><button className="ghostButton" disabled={page >= store.pages} onClick={() => setPage(page + 1)}>下一页</button></div></div>}
  </section>
}

function Player({ game, onBack }) {
  const [confirming, setConfirming] = useState(false)
  const stageRef = useRef(null)
  useEffect(() => {
    const stage = stageRef.current
    if (!stage) return
    const enter = async () => {
      try {
        if (!document.fullscreenElement && stage.requestFullscreen) await stage.requestFullscreen()
      } catch (_) {}
    }
    enter()
    return () => {
      if (document.fullscreenElement && document.exitFullscreen) document.exitFullscreen().catch(() => {})
    }
  }, [])
  function requestBack() { setConfirming(true) }
  const exit = () => {
    if (document.fullscreenElement && document.exitFullscreen) document.exitFullscreen().catch(() => {})
    // The legacy VM patches globals and installs document/window listeners;
    // hard-navigate after unmount to give the next game a pristine JS realm.
    window.location.reload()
  }
  return (
    <div className="player">
      <button className="playerExit" onClick={requestBack} aria-label="返回大厅">‹</button>
      <div ref={stageRef} className="playerStage">
        <div className="runtimeToolbar"><span className="runtimeLive"><i /> 正在运行</span><span className="runtimeGame">{game.name}</span><button onClick={requestBack}>退出</button></div>
        {game.kind === 'j2me' ? <J2MEPlayer game={game} onExit={requestBack} /> : <MrpPlayer game={game} onExit={requestBack} />}
      </div>
      {confirming && (
        <div className="exitConfirm" role="dialog" aria-modal="true">
          <div className="exitBox">
            <strong>退出当前游戏？</strong>
            <span>当前游戏进度可能尚未保存。</span>
            <div>
              <button className="optionButton" onClick={() => setConfirming(false)}>继续游戏</button>
              <button className="optionButton optionDanger" onClick={exit}>退出游戏</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default function App() {
  const [tab, setTab] = useState(() => {
    const requested = new URLSearchParams(location.search).get('tab')
    return TABS.some((item) => item.id === requested) ? requested : localStorage.getItem('xiaochao-tab') || 'j2me'
  })
  const [game, setGame] = useState(null)

  function switchTab(id) {
    setTab(id)
    setGame(null)
    localStorage.setItem('xiaochao-tab', id)
  }

  const [libraryTick, setLibraryTick] = useState(0)
  if (game) return <Player game={game} onBack={() => setGame(null)} />

  return (
    <div className="appShell app">
      <header className="header">
        <div><h1 className="logo">小潮霸王</h1><span className="tagline">RETRO JAVA ARCADE</span></div>
        <nav className="tabs">
          {TABS.map((t) => (
            <button
              key={t.id}
              className={'tab' + (tab === t.id ? ' tabActive' : '')}
              onClick={() => switchTab(t.id)}
            >
              {t.label}
            </button>
          ))}
        </nav>
      </header>
      <main className="main">
        {TABS.map((t) => (
          <div key={t.id} className="pane">
            {tab === t.id && (t.id === 'store' ? <Store key={t.id} onRefreshLibrary={() => setLibraryTick((value) => value + 1)} /> : <Library key={t.id + libraryTick} kind={t.id} onPlay={setGame} />)}
          </div>
        ))}
      </main>
    </div>
  )
}
