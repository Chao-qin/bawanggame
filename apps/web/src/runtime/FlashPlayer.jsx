import { useEffect, useRef, useState } from 'react'
import { createRuntimeSession, loadClassic } from './loadScript.js'
import { RuntimeFailure, RuntimeLoading } from './RuntimeStatus.jsx'

export function FlashPlayer({ game }) {
  const hostRef = useRef(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let alive = true
    let player = null
    const session = createRuntimeSession()
    const ensureActive = () => {
      if (!alive || !session.active) throw new Error('运行时已退出')
    }

    ;(async () => {
      try {
        window.RufflePlayer = window.RufflePlayer || {}
        window.RufflePlayer.config = {
          ...window.RufflePlayer.config,
          backgroundColor: '#05070a',
        }
        if (!window.RufflePlayer.newest) await loadClassic('/ruffle/ruffle.js', session)
        ensureActive()
        const ruffle = window.RufflePlayer?.newest?.()
        if (!ruffle) throw new Error('Ruffle 播放器未初始化')

        player = ruffle.createPlayer()
        player.style.display = 'block'
        player.style.position = 'absolute'
        player.style.inset = '0'
        player.style.width = '100%'
        player.style.height = '100%'
        player.style.backgroundColor = '#05070a'
        hostRef.current?.appendChild(player)
        ensureActive()
        await player.ruffle().load('/flash/' + encodeURIComponent(game.file))
        ensureActive()
        setLoading(false)
      } catch (cause) {
        if (alive && session.active) {
          setLoading(false)
          setError(cause?.message || String(cause))
        }
      }
    })()

    return () => {
      alive = false
      session.invalidate()
      player?.remove()
      player = null
    }
  }, [game.file])

  return <div className="runtime-view">
    {loading && !error ? <RuntimeLoading label="正在启动 Flash 播放器…" /> : null}
    {error ? <RuntimeFailure message={error} /> : null}
    <div ref={hostRef} className="absolute inset-0" />
  </div>
}
