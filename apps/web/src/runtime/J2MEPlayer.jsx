import { useEffect, useState } from 'react'
import { PhoneMarkup } from './PhoneMarkup.jsx'
import { createRuntimeSession, loadClassic, loadStyle } from './loadScript.js'
import { cleanupRuntimeArtifacts } from './cleanup.js'
import { RuntimeFailure, RuntimeLoading } from './RuntimeStatus.jsx'
import { createKeyboardSession } from './keyboard/KeyboardSession.js'

const styles = ['/style/main.css', '/style/lcdui.css', '/style/feedback.css']
const scripts = ['/config/i18n.js', '/ui-feedback.js', '/debug-graphics.js', '/libs/encoding.js', '/libs/webaudio-tinysynth.min.js', '/libs/BenzAMRRecorder.min.js', '/bld/native.js', '/config/default.js', '/config/settings.js', '/config/localjars.js', '/config/urlparams.js', '/screen.js', '/bld/j2me.js', '/bld/main-all.js', '/debug-native.js', '/bld/lcdui.js', '/bld/net.js', '/btroom.js', '/bld/bt.js', '/bld/media.js', '/bld/micro3d.js', '/bld/m3g.js', '/files.js', '/runtime-extras.js', '/runtime/j2me/touch-layout.js', '/panel.js', '/keypad-canvas.js', '/runtime/j2me/input-mapping.js', '/touchpad.js', '/keymap.js']

export function J2MEPlayer({ game, onExit, onReady }) {
  const [keyboardSession] = useState(() => createKeyboardSession())
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
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
    document.body.classList.add('runtime-active')
    window.__XIAOCHAO_RUNTIME__ = true
    // The catalog may provide an already escaped filename; main-all.js performs
    // the single URL encoding pass when it requests server-hosted jars.
    let jarFile = game.file
    try { jarFile = decodeURIComponent(jarFile) } catch {}
    window.__XIAOCHAO_RUNTIME_JAR = game.local ? `local:${jarFile}` : `jar/${jarFile}`
    let alive = true
    const session = createRuntimeSession()
    window.__XIAOCHAO_KEYBOARD_SESSION__ = keyboardSession
    window.__XIAOCHAO_RUNTIME_SESSION__ = session
    ;(async () => {
      try {
        const ensureActive = () => {
          if (!alive || !session.active) throw new Error('运行时已退出')
        }
        await Promise.all(styles.map((src) => loadStyle(src, session)))
        const keyboardReady = await keyboardSession.ready
        if (keyboardReady.available) {
          window.__XIAOCHAO_KEYBOARD_SESSION__ = keyboardSession
        } else {
          window.__XIAOCHAO_KEYBOARD_UNAVAILABLE__ = true
        }
        for (const src of scripts) {
          await loadClassic(src, session)
          ensureActive()
        }
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
        window.__XIAOCHAO_REQUEST_EXIT = onExit
        window.showExitScreen = onExit
        ensureActive()
        if (typeof window.onload === 'function') window.onload(new Event('load'))
        ensureActive()
        onReady?.()
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
      keyboardSession.invalidate()
      try { window.myflushAll && window.myflushAll() } catch (_) {}
      try { window.__XIAOCHAO_J2ME_CTX && window.__XIAOCHAO_J2ME_CTX.runtime.stop() } catch (_) {}
      document.body.classList.remove('runtime-active')
      window.__XIAOCHAO_RUNTIME__ = false
      window.__XIAOCHAO_RUNTIME_JAR = ''
      window.__XIAOCHAO_REQUEST_EXIT = null
      window.__XIAOCHAO_J2ME_CTX = null
      if (window.__XIAOCHAO_RUNTIME_SESSION__ === session) delete window.__XIAOCHAO_RUNTIME_SESSION__
      if (window.__XIAOCHAO_KEYBOARD_SESSION__ === keyboardSession) delete window.__XIAOCHAO_KEYBOARD_SESSION__
      delete window.__XIAOCHAO_KEYBOARD_UNAVAILABLE__
      cleanupRuntimeArtifacts()
    }
  }, [game, onExit, keyboardSession])
  return <div className="runtime-view">{loading && !error ? <RuntimeLoading /> : null}{error ? <RuntimeFailure message={error} /> : null}<PhoneMarkup /></div>
}
