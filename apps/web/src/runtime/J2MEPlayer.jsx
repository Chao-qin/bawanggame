import { useEffect, useRef, useState } from 'react'
import { PhoneMarkup } from './PhoneMarkup.jsx'
import { createRuntimeSession, loadClassicInOrder, loadStyle } from './loadScript.js'
import { cleanupRuntimeArtifacts } from './cleanup.js'
import { RuntimeFailure, RuntimeLoading } from './RuntimeStatus.jsx'
import { claimRuntimeDocument, RUNTIME_ALREADY_BOOTED } from './runtime-boot.js'

const styles = ['/style/main.css', '/style/lcdui.css', '/style/feedback.css']
const scripts = ['/config/i18n.js', '/ui-feedback.js', '/debug-graphics.js', '/libs/encoding.js', '/libs/webaudio-tinysynth.min.js', '/libs/BenzAMRRecorder.min.js', '/bld/native.js', '/config/default.js', '/config/settings.js', '/config/localjars.js', '/config/urlparams.js', '/screen.js', '/bld/j2me.js', '/bld/main-all.js', '/debug-native.js', '/bld/lcdui.js', '/bld/net.js', '/btroom.js', '/bld/bt.js', '/bld/media.js', '/bld/micro3d.js', '/bld/m3g.js', '/files.js', '/runtime-extras.js', '/runtime/j2me/touch-layout.js', '/panel.js', '/keypad-canvas.js', '/runtime/j2me/input-mapping.js', '/touchpad.js', '/keymap.js']

export function J2MEPlayer({ game, onExit, onReady }) {
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [progress, setProgress] = useState(null)
  // Latest callbacks without restarting the runtime when a parent re-renders with new function identities.
  const callbacks = useRef({ onExit, onReady })
  callbacks.current = { onExit, onReady }
  function applyRuntimeSettings() {
    const cfg = window.config
    if (!cfg) return
    document.body.dataset.theme = cfg.theme || 'classic'
    document.body.dataset.orientation = ['auto', 'portrait', 'landscape'].includes(cfg.orientation) ? cfg.orientation : 'auto'
    document.body.classList.toggle('fixed-screen', !!cfg.screen)
    const keypad = document.getElementById('keypad')
    if (keypad) keypad.className = 'keypad-' + (cfg.keypad | 0)
    window.TouchLayout?.apply(cfg.touchLayout)
    const gear = document.getElementById('gear')
    if (gear) gear.style.removeProperty('display')
  }
  useEffect(() => {
    if (!claimRuntimeDocument('j2me')) {
      setLoading(false)
      setError(RUNTIME_ALREADY_BOOTED)
      return undefined
    }
    const requestExit = () => callbacks.current.onExit?.()
    document.body.classList.add('runtime-active')
    window.__XIAOCHAO_RUNTIME__ = true
    // The catalog may provide an already escaped filename; main-all.js performs
    // the single URL encoding pass when it requests server-hosted jars.
    let jarFile = game.file
    try { jarFile = decodeURIComponent(jarFile) } catch {}
    window.__XIAOCHAO_RUNTIME_JAR = game.local ? `local:${jarFile}` : `jar/${jarFile}`
    let alive = true
    const session = createRuntimeSession()
    window.__XIAOCHAO_RUNTIME_SESSION__ = session
    ;(async () => {
      try {
        const ensureActive = () => {
          if (!alive || !session.active) throw new Error('运行时已退出')
        }
        await Promise.all(styles.map((src) => loadStyle(src, session)))
        await loadClassicInOrder(scripts, session, (done, total) => {
          if (alive) setProgress({ done, total })
        })
        ensureActive()
        if (window.TouchLayout?.forGame && window.config?.gameId) {
          window.__XIAOCHAO_TOUCH_LAYOUT_ADAPTER__ = window.TouchLayout.forGame(window.config.gameId)
        }
        ensureActive()
        const overlayRoot = document.querySelector('.runtime-overlay-root')
        ;[
          window.__XIAOCHAO_PANEL_MOUNT__,
          window.__XIAOCHAO_BTROOM_MOUNT__,
          window.__XIAOCHAO_FILES_MOUNT__,
          window.__XIAOCHAO_FEEDBACK_MOUNT__,
          window.__XIAOCHAO_DEBUG_NATIVE_MOUNT__,
        ].forEach((mount) => {
          ensureActive()
          mount?.(overlayRoot)
        })
        const mountOverlay = window.__XIAOCHAO_RUNTIME_MOUNT_OVERLAY__
        ;['gear', 'panel', 'btroom', 'files', 'fb-toast', 'fps-hud', 'drawlog-btn'].forEach((id) => {
          ensureActive()
          const node = document.getElementById(id)
          if (node && mountOverlay) mountOverlay(node)
        })
        ensureActive()
        applyRuntimeSettings()
        ensureActive()
        window.ScreenSetup?.setOrientation?.(window.config?.orientation)
        window.ScreenSetup?.refit?.()
        ensureActive()
        window.__XIAOCHAO_RUNTIME_EXTRAS_INIT__?.()
        ensureActive()
        window.__XIAOCHAO_KEYMAP_BOOT__?.()
        ensureActive()
        window.__XIAOCHAO_REQUEST_EXIT = requestExit
        window.showExitScreen = requestExit
        ensureActive()
        if (typeof window.onload === 'function') window.onload(new Event('load'))
        ensureActive()
        callbacks.current.onReady?.()
        setLoading(false)
      } catch (e) {
        if (alive && session.active) {
          session.invalidate()
          cleanupRuntimeArtifacts()
          setLoading(false)
          setError(e.message || String(e))
        }
      }
    })()
    return () => {
      alive = false
      session.invalidate()
      try { window.myflushAll && window.myflushAll() } catch (_) {}
      try { window.__XIAOCHAO_J2ME_CTX && window.__XIAOCHAO_J2ME_CTX.runtime.stop() } catch (_) {}
      document.body.classList.remove('runtime-active')
      window.__XIAOCHAO_RUNTIME__ = false
      window.__XIAOCHAO_RUNTIME_JAR = ''
      window.__XIAOCHAO_REQUEST_EXIT = null
      window.__XIAOCHAO_J2ME_CTX = null
      if (window.__XIAOCHAO_RUNTIME_SESSION__ === session) delete window.__XIAOCHAO_RUNTIME_SESSION__
      cleanupRuntimeArtifacts()
    }
    // Only a different game restarts the runtime (and then it is refused: one game per runtime frame).
  }, [game.file, game.local])
  // A failed boot has already removed the runtime stylesheets: the phone markup would show as raw text.
  return <div className="runtime-view">{loading && !error ? <RuntimeLoading label={progress ? `正在加载模拟器（${progress.done}/${progress.total}）…` : undefined} /> : null}{error ? <RuntimeFailure message={error} /> : <PhoneMarkup />}</div>
}
