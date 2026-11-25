import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createRuntimeSession, loadClassic } from './loadScript.js'
import { RuntimeFailure, RuntimeLoading } from './RuntimeStatus.jsx'
import { get as getLocalFlash } from '../localFlash.js'
import { FlashKeypad, useFlashKeys } from './FlashKeypad.jsx'
import { useKeypadPrefs, useViewportOrientation } from './RuntimeKeypad.jsx'
import { effectiveLayout, effectiveOpacity, effectivePlacement } from './keypad-prefs.js'
import { flashPlayerBox } from './flash-player-box.js'
import { directionCodes, keyOfCode } from './flash-keys.js'
import { INPUT_ENGINE_URL } from '../keyboard/system.js'

// Ruffle tears a movie down when its element leaves the document. An exit while the movie is still loading removes
// the element before Ruffle has created the movie, which then starts — and plays its sound — in the detached element.
// Silence it, then attach and detach the element once more so Ruffle destroys it.
function destroyDetachedPlayer(element) {
  try {
    const api = element.ruffle?.()
    api?.suspend?.()
    if (api) api.volume = 0
  } catch {}
  if (element.isConnected) return
  element.style.display = 'none'
  document.body.appendChild(element)
  element.remove()
}

// The key a Flash gamepad action sends in this game (its 「本游戏按键」 choice).
function codeForAction(keys, action) {
  if (action === 'ok' || action === 'a' || action === 'b') return keys[action]
  return directionCodes(keys)[action] || null
}

export function FlashPlayer({ game, onCleanupReady, onExit }) {
  const hostRef = useRef(null)
  const [playerElement, setPlayerElement] = useState(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [canReturn, setCanReturn] = useState(false)
  const [movie, setMovie] = useState(null)
  const [keypadPrefs, updateKeypadPrefs] = useKeypadPrefs('flash')
  const [flashKeys] = useFlashKeys(game.file)
  const layout = effectiveLayout(keypadPrefs, useViewportOrientation())
  const keysRef = useRef(flashKeys)
  keysRef.current = flashKeys

  // The app body carries the layout while Flash plays, so the toolbar and stage follow the same rule as the phone
  // runtimes (mobile-ui.css); the lobby gets its body back on exit.
  useLayoutEffect(() => {
    document.body.dataset.orientation = layout
    return () => { delete document.body.dataset.orientation }
  }, [layout])

  // Size the player to the movie inside its host (whole picture / width / height), and again whenever the host
  // changes size (keypad shown or hidden, rotation, fullscreen).
  useLayoutEffect(() => {
    const host = hostRef.current
    if (!host || !playerElement) return undefined
    const place = () => {
      const rect = host.getBoundingClientRect()
      const box = flashPlayerBox(keypadPrefs.fit, rect, movie)
      const style = playerElement.style
      if (!box) {
        Object.assign(style, { left: '0px', top: '0px', width: '100%', height: '100%' })
        return
      }
      Object.assign(style, { left: `${box.left}px`, top: `${box.top}px`, width: `${box.width}px`, height: `${box.height}px` })
    }
    place()
    const observer = new ResizeObserver(place)
    observer.observe(host)
    return () => observer.disconnect()
  }, [playerElement, movie, keypadPrefs.fit])

  useEffect(() => {
    let alive = true
    let player = null
    let objectUrl = ''
    let cleaned = false
    let input = null
    const session = createRuntimeSession()
    const cleanup = () => {
      if (cleaned) return
      cleaned = true
      alive = false
      session.invalidate()
      resetInput()
      player?.remove()
      player = null
      if (objectUrl) {
        URL.revokeObjectURL(objectUrl)
        objectUrl = ''
      }
    }
    function resetInput() {
      if (input && window.__XIAOCHAO_INPUT_CONTROLLER__ === input) delete window.__XIAOCHAO_INPUT_CONTROLLER__
      input?.destroy()
      input = null
      if (window.__XIAOCHAO_INPUT_RESET__ === resetInput) delete window.__XIAOCHAO_INPUT_RESET__
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
          // 触屏长按不弹 Ruffle 菜单，桌面右键保留。
          contextMenu: 'rightClickOnly',
        }
        if (!window.RufflePlayer.newest) await loadClassic('/ruffle/ruffle.js', session)
        ensureActive()
        const ruffle = window.RufflePlayer?.newest?.()
        if (!ruffle) throw new Error('Ruffle 播放器未初始化')

        player = ruffle.createPlayer()
        player.tabIndex = 0
        player.style.display = 'block'
        player.style.position = 'absolute'
        player.style.left = '0'
        player.style.top = '0'
        player.style.width = '100%'
        player.style.height = '100%'
        player.style.backgroundColor = '#05070a'
        hostRef.current?.appendChild(player)
        setPlayerElement(player)
        player.addEventListener('pointerdown', () => player.focus({ preventScroll: true }))
        // The element from the event: cleanup clears `player`, and the event can still arrive after an exit.
        player.addEventListener('loadedmetadata', (event) => {
          if (!alive) return
          const metadata = event.currentTarget?.ruffle?.().metadata
          if (metadata?.width > 0 && metadata?.height > 0) setMovie({ width: metadata.width, height: metadata.height })
        })
        ensureActive()
        let source = '/flash/' + encodeURIComponent(game.file)
        if (game.local) {
          const record = await getLocalFlash(game.file)
          objectUrl = URL.createObjectURL(record.data)
          source = objectUrl
        }
        ensureActive()
        const loading = player
        await loading.ruffle().load(source)
        if (!alive || !session.active) destroyDetachedPlayer(loading)
        ensureActive()
        // Gamepads and remapped keyboard keys (the 「键盘」 page / 按键映射) go through the shared input engine and
        // reach the game as the keys this game's gamepad sends; unbound keyboard keys reach Ruffle untouched.
        await loadClassic(INPUT_ENGINE_URL, session)
        ensureActive()
        const target = player
        const send = (action, type) => {
          const code = codeForAction(keysRef.current, action)
          if (code) target.dispatchEvent(new KeyboardEvent(type, { key: keyOfCode(code), code, bubbles: true, cancelable: true }))
        }
        input = window.InputMapping?.create({
          family: 'flash',
          gameId: 'flash:' + game.file,
          keyboard: true,
          gamepad: true,
          trustedOnly: true,
          repeat: false,
          sink: { press: (action) => send(action, 'keydown'), release: (action) => send(action, 'keyup') },
        }) || null
        if (input) {
          window.__XIAOCHAO_INPUT_CONTROLLER__ = input
          window.__XIAOCHAO_INPUT_RESET__ = resetInput
        }
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
  }, [game.file, game.local, onCleanupReady])

  // The same stage contract as the phone runtimes: docked keys take their own space (under the screen in portrait, the
  // side columns in landscape) and the screen fits the rest; floating keys sit over a full-stage screen.
  return <div className="runtime-view flashRuntimeView" data-orientation={layout} data-placement={effectivePlacement(keypadPrefs, 'flash')}>
    {loading && !error ? <RuntimeLoading label="正在启动 Flash 播放器…" /> : null}
    {error ? <RuntimeFailure message={error} onAction={canReturn ? onExit : undefined} actionLabel={canReturn ? '返回 Flash 库' : undefined} /> : null}
    <div ref={hostRef} className="flashRuffleHost" />
    <FlashKeypad target={playerElement} visible={keypadPrefs.visible} layout={layout}
      opacity={effectiveOpacity(keypadPrefs, 'flash')} keys={flashKeys} prefs={keypadPrefs} update={updateKeypadPrefs} />
  </div>
}
