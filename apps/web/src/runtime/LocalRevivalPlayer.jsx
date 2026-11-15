import { useEffect, useRef, useState } from 'react'

const API = '/dasong/v1/command'
const noop = () => {}

async function command(token, command, payload = {}) {
  const response = await fetch(API, {
    method: 'POST',
    headers: {'content-type': 'application/json', ...(token ? {authorization: `Bearer ${token}`} : {})},
    body: JSON.stringify({command, payload}),
  })
  const body = await response.json()
  if (!response.ok) throw new Error(body.error?.message || `HTTP ${response.status}`)
  return body.data
}

export function LocalRevivalPlayer({ onExit, onCleanupReady }) {
  const [state, setState] = useState({loading: true, error: '', token: '', world: null, character: null, message: '正在进入本地世界…'})
  const inputRef = useRef(null)
  const stoppedRef = useRef(false)
  const keyCleanupRef = useRef(noop)

  useEffect(() => {
    stoppedRef.current = false
    const cleanup = () => {
      if (stoppedRef.current) return
      stoppedRef.current = true
      keyCleanupRef.current()
    }
    onCleanupReady?.(cleanup)
    return cleanup
  }, [onCleanupReady])

  useEffect(() => {
    let alive = true
    const suffix = Math.random().toString(36).slice(2, 8)
    const name = `local_${suffix}`
    ;(async () => {
      try {
        await command('', 'register', {name, password: 'local-revival'})
        const login = await command('', 'login', {name, password: 'local-revival'})
        const token = login.token
        const created = await command(token, 'characters.create', {name: '小侠'},)
        const character = await command(token, 'characters.select', {id: created.id})
        const world = await command(token, 'world.get')
        if (alive && !stoppedRef.current) setState({loading: false, error: '', token, world, character, message: '方向键移动角色'})
      } catch (error) {
        if (alive && !stoppedRef.current) setState((current) => ({...current, loading: false, error: error.message || String(error), message: '本地服务未启动'}))
      }
    })()
    return () => { alive = false }
  }, [])

  useEffect(() => {
    const onKey = (event) => {
      const directions = {ArrowUp: [0, -1], ArrowDown: [0, 1], ArrowLeft: [-1, 0], ArrowRight: [1, 0]}
      const direction = directions[event.key]
      if (stoppedRef.current || !direction || !state.token || !state.character) return
      event.preventDefault()
      move(direction[0], direction[1])
    }
    window.addEventListener('keydown', onKey)
    const cleanup = () => window.removeEventListener('keydown', onKey)
    keyCleanupRef.current = cleanup
    return () => {
      cleanup()
      if (keyCleanupRef.current === cleanup) keyCleanupRef.current = noop
    }
  }, [state.token, state.character])

  async function move(dx, dy) {
    try {
      const result = await command(state.token, 'world.move', {dx, dy})
      const world = await command(state.token, 'world.get')
      if (!stoppedRef.current) setState((current) => ({...current, world, character: {...current.character, x: result.x, y: result.y}, message: `已移动到 (${result.x}, ${result.y})`}))
    } catch (error) {
      if (!stoppedRef.current) setState((current) => ({...current, message: error.message || String(error)}))
    }
  }

  const world = state.world
  const position = state.character ? {x: state.character.x, y: state.character.y} : null
  const npcs = world?.npcs || []
  return <div ref={inputRef} tabIndex={-1} style={{minHeight: '100%', background: '#111827', color: '#e5e7eb', padding: 24, fontFamily: 'system-ui, sans-serif', outline: 'none'}}>
    <div style={{maxWidth: 900, margin: '0 auto'}}>
      <div style={{display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18}}>
        <div><div style={{fontSize: 12, color: '#93c5fd', letterSpacing: 1}}>LOCAL-COMPAT · MAP 1</div><h1 style={{margin: '4px 0 0', fontSize: 26}}>大宋豪侠 · 本地复活</h1></div>
        <button onClick={onExit} style={{background: '#263244', color: '#e5e7eb', border: '1px solid #475569', borderRadius: 8, padding: '9px 14px', cursor: 'pointer'}}>返回大厅</button>
      </div>
      {state.loading && <div style={{padding: 24, background: '#1f2937', borderRadius: 10}}>正在创建本地角色…</div>}
      {state.error && <div style={{padding: 18, background: '#3f1d2e', border: '1px solid #be123c', borderRadius: 10}}>{state.error}。请先启动 `dasong-server`。</div>}
      {!state.loading && !state.error && world && <div style={{display: 'grid', gridTemplateColumns: 'minmax(420px, 1fr) 250px', gap: 20}}>
        <div style={{background: '#172033', border: '1px solid #334155', borderRadius: 10, padding: 18}}>
          <div style={{display: 'grid', gridTemplateColumns: `repeat(${world.map.width}, minmax(28px, 1fr))`, aspectRatio: '1', maxWidth: 600, margin: '0 auto', gap: 3, background: '#0f172a', padding: 5, borderRadius: 8}}>
            {Array.from({length: world.map.width * world.map.height}, (_, index) => { const x = index % world.map.width; const y = Math.floor(index / world.map.width); const blocked = world.map.blocked.some((cell) => cell.x === x && cell.y === y); const npc = npcs.find((item) => item.x === x && item.y === y); const player = position?.x === x && position?.y === y; return <div key={`${x}-${y}`} style={{position: 'relative', display: 'grid', placeItems: 'center', background: blocked ? '#475569' : '#24433d', border: '1px solid #31594e', borderRadius: 3, color: '#f8fafc', fontSize: 20}}>{blocked ? '×' : player ? '⚔' : npc ? '人' : ''}</div> })}
          </div>
          <div style={{textAlign: 'center', color: '#94a3b8', marginTop: 14}}>使用键盘方向键移动</div>
        </div>
        <aside style={{background: '#172033', border: '1px solid #334155', borderRadius: 10, padding: 18}}>
          <h2 style={{fontSize: 17, margin: '0 0 14px'}}>小侠</h2>
          <div style={{display: 'grid', gap: 8, color: '#cbd5e1', fontSize: 14}}><div>坐标：{position ? `${position.x}, ${position.y}` : '-'}</div><div>等级：{state.character?.level ?? 1}</div><div>生命：{state.character?.hp ?? 100} / {state.character?.max_hp ?? 100}</div><div>经验：{state.character?.experience ?? 0}</div><div>金币：{state.character?.gold ?? 0}</div></div>
          <hr style={{border: 0, borderTop: '1px solid #334155', margin: '18px 0'}} />
          <div style={{fontSize: 13, color: '#93c5fd'}}>{state.message}</div>
          {npcs.length > 0 && <div style={{marginTop: 16, fontSize: 13, color: '#cbd5e1'}}>附近：{npcs.map((npc) => npc.name).join('、')}</div>}
        </aside>
      </div>}
    </div>
  </div>
}
