import { useEffect, useRef, useState } from 'react'
import { createRuntimeSession, loadClassic } from './loadScript.js'
import { RuntimeFailure, RuntimeLoading } from './RuntimeStatus.jsx'
import { get as getLocalFlash } from '../localFlash.js'
import { FlashControls } from './FlashControls.jsx'
import { createFlashKeyboardAdapter } from './keyboard/FlashKeyboardAdapter.js'
import { createKeyboardSession } from './keyboard/KeyboardSession.js'

export function FlashPlayer({ game, onCleanupReady, onExit }) {
  const [keyboardSession] = useState(() => createKeyboardSession({ runtime: 'flash', gameId: game.id || game.file }))
  const hostRef = useRef(null)
  const [playerElement, setPlayerElement] = useState(null)
  const [keyboardAdapter, setKeyboardAdapter] = useState(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [canReturn, setCanReturn] = useState(false)

  useEffect(() => {
    let alive = true
    let player = null
    let objectUrl = ''
    let cleaned = false
    let keyboardAdapter = null
    const session = createRuntimeSession()
    const cleanup = () => {
      if (cleaned) return
      cleaned = true
      alive = false
      session.invalidate()
      keyboardSession.releaseAll()
      keyboardSession.invalidate()
      keyboardAdapter?.cleanup()
      keyboardAdapter = null
      setKeyboardAdapter(null)
      player?.remove()
      player = null
      if (objectUrl) {
        URL.revokeObjectURL(objectUrl)
        objectUrl = ''
      }
    }
    onCleanupReady?.(cleanup)
    const ensureActive = () => {
      if (!alive || !session.active) throw new Error('运行时已退出')
    }

    ;(async () => {
      try {
        window.RufflePlayer = window.RufflePlayer || {}
        window.RufflePlayer.config = {
          ...window.RufflePlayer.config,
          backgroundColor: '#05070a',
          scale: 'showAll',
          letterbox: 'on',
          align: 'center',
        }
        if (!window.RufflePlayer.newest) await loadClassic('/ruffle/ruffle.js', session)
        ensureActive()
        const ruffle = window.RufflePlayer?.newest?.()
        if (!ruffle) throw new Error('Ruffle 播放器未初始化')

        player = ruffle.createPlayer()
        keyboardAdapter = createFlashKeyboardAdapter({ target: player })
        keyboardSession.registerInputRelease(keyboardAdapter.releaseAll)
        setKeyboardAdapter(keyboardAdapter)
        player.tabIndex = 0
        player.style.display = 'block'
        player.style.position = 'absolute'
        player.style.inset = '0'
        player.style.width = '100%'
        player.style.height = '100%'
        player.style.backgroundColor = '#05070a'
        hostRef.current?.appendChild(player)
        setPlayerElement(player)
        player.addEventListener('pointerdown', () => player.focus({ preventScroll: true }))
        ensureActive()
        let source = '/flash/' + encodeURIComponent(game.file)
        if (game.local) {
          const record = await getLocalFlash(game.file)
          objectUrl = URL.createObjectURL(record.data)
          source = objectUrl
        }
        await player.ruffle().load(source)
        ensureActive()
        player.focus({ preventScroll: true })
        setLoading(false)
      } catch (cause) {
        if (alive && session.active) {
          setLoading(false)
          setError(cause?.message || String(cause))
          setCanReturn(cause?.code === 'missing_record')
        }
      }
    })()

    return () => {
      cleanup()
    }
  }, [game.file, game.local, onCleanupReady, keyboardSession])

  return <div className="runtime-view flashRuntimeView">
    {loading && !error ? <RuntimeLoading label="正在启动 Flash 播放器…" /> : null}
    {error ? <RuntimeFailure message={error} onAction={canReturn ? onExit : undefined} actionLabel={canReturn ? '返回 Flash 库' : undefined} /> : null}
    <div ref={hostRef} className="flashRuffleHost" />
    <FlashControls target={playerElement} adapter={keyboardAdapter} session={keyboardSession} gameId={game.id || game.file} />
  </div>
}
