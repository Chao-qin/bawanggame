import { useEffect, useMemo, useRef, useState } from 'react'
import { recordPlay, fetchRecent, fetchPopular } from './cloud.js'
import { J2MEPlayer } from './runtime/J2MEPlayer.jsx'
import { MrpPlayer } from './runtime/MrpPlayer.jsx'

const TABS = [
  { id: 'j2me', label: 'J2ME' },
  { id: 'maopao', label: '冒泡社区' },
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

function GameCard({ game, onPlay, onRemove }) {
  const initial = (game.name || '?').trim().charAt(0).toUpperCase()
  return (
    <div
      className="card"
      role="button"
      tabIndex={0}
      onClick={() => onPlay(game)}
      onKeyDown={(e) => e.key === 'Enter' && onPlay(game)}
      title={game.desc || game.name}
    >
      {onRemove && (
        <button
          className="card-remove"
          title="删除该游戏"
          onClick={(e) => {
            e.stopPropagation()
            if (window.confirm('删除「' + game.name + '」？')) onRemove(game.file)
          }}
        >
          ✕
        </button>
      )}
      <div className="card-icon">
        {game.iconUrl ? <img src={game.iconUrl} alt="" /> : initial}
      </div>
      <div className="card-name">{game.name}</div>
      <div className="card-meta">
        {[game.vendor, formatSize(game.size), game.local ? '本机' : ''].filter(Boolean).join(' · ') || '\u00a0'}
      </div>
    </div>
  )
}

function MiniCard({ item, onPlay }) {
  const initial = (item.name || '?').trim().charAt(0).toUpperCase()
  const meta = item.plays != null ? item.plays + ' 次游玩' : ''
  return (
    <button className="mini-card" onClick={() => onPlay(item)} title={item.name}>
      <div className="card-icon">{initial}</div>
      <div className="card-name">{item.name}</div>
      {meta && <div className="card-meta">{meta}</div>}
    </button>
  )
}

function GameRow({ title, items, onPlay }) {
  if (!items || items.length === 0) return null
  return (
    <section className="row-section">
      <h2 className="row-title">{title}</h2>
      <div className="row-scroll">
        {items.map((it) => (
          <MiniCard key={it.kind + ':' + it.file} item={it} onPlay={onPlay} />
        ))}
      </div>
    </section>
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

  // 云端榜单：Library 从 player 返回时会重挂载，这里自然刷新
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
          <label className={'upload-btn' + (busy ? ' busy' : '')}>
            {busy ? '导入中…' : '＋ 添加 .jar'}
            <input type="file" accept=".jar" multiple hidden onChange={handleUpload} />
          </label>
        )}
        <span className="count">
          {server.loading ? '加载中…' : server.error ? '加载失败' : games.length + ' 款'}
        </span>
      </div>
      <GameRow title="🔥 大家都在玩" items={popular} onPlay={handlePlay} />
      <GameRow title="🕘 最近在玩" items={recent} onPlay={handlePlay} />
      {server.error && (
        <div className="status error">在线列表加载失败：{server.error}（请确认本地服务已在 8080 端口运行）</div>
      )}
      {!server.error && (
        <div className="grid">
          {games.map((g) => (
            <GameCard
              key={(g.local ? 'local:' : '') + g.kind + ':' + g.file}
              game={g}
              onPlay={handlePlay}
              onRemove={g.local ? local.remove : null}
            />
          ))}
        </div>
      )}
      {!server.error && !server.loading && games.length === 0 && <div className="status">没有匹配的游戏</div>}
    </section>
  )
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
    window.location.assign('/')
  }
  return (
    <div className="player">
      <button className="player-exit" onClick={requestBack} aria-label="返回大厅">‹</button>
      <div ref={stageRef} className="player-stage">
        {game.kind === 'j2me' ? <J2MEPlayer game={game} onExit={requestBack} /> : <MrpPlayer game={game} onExit={requestBack} />}
      </div>
      {confirming && (
        <div className="exit-confirm" role="dialog" aria-modal="true">
          <div className="exit-confirm-box">
            <strong>退出当前游戏？</strong>
            <span>当前游戏进度可能尚未保存。</span>
            <div>
              <button onClick={() => setConfirming(false)}>继续游戏</button>
              <button className="danger" onClick={exit}>退出游戏</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default function App() {
  const [tab, setTab] = useState(() => localStorage.getItem('xiaochao-tab') || 'j2me')
  const [game, setGame] = useState(null)

  function switchTab(id) {
    setTab(id)
    setGame(null)
    localStorage.setItem('xiaochao-tab', id)
  }

  if (game) return <Player game={game} onBack={() => setGame(null)} />

  return (
    <div className="app">
      <header className="header">
        <h1 className="logo">小潮霸王</h1>
        <nav className="tabs">
          {TABS.map((t) => (
            <button
              key={t.id}
              className={'tab' + (tab === t.id ? ' active' : '')}
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
            {tab === t.id && <Library key={t.id} kind={t.id} onPlay={setGame} />}
          </div>
        ))}
      </main>
    </div>
  )
}
