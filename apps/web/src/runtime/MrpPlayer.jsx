import { useEffect, useState } from 'react'
import { PhoneMarkup } from './PhoneMarkup.jsx'
import { createRuntimeSession, loadClassic, loadStyle } from './loadScript.js'
import { cleanupRuntimeArtifacts } from './cleanup.js'
import { RuntimeFailure, RuntimeLoading } from './RuntimeStatus.jsx'
import { createKeyboardSession } from './keyboard/KeyboardSession.js'
import { createKeyboardProfileStorage } from './keyboard/storage.js'

export function MrpPlayer({ game, onExit, onReady }) {
  const [keyboardSession] = useState(() => createKeyboardSession({
    runtime: 'mrp',
    gameId: `mrp:${game.file}`,
  }))
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  useEffect(() => {
    document.body.classList.add('runtime-active')
    window.__XIAOCHAO_RUNTIME_MRP = game.file
    window.__XIAOCHAO_RUNTIME_MRP_URL = `/maopao/public/mrps/${encodeURIComponent(game.file)}`
    const styles = ['/style/main.css', '/style/feedback.css']
    let alive = true
    const session = createRuntimeSession()
    window.__XIAOCHAO_KEYBOARD_SESSION__ = keyboardSession
    window.KeyboardProfileStorage = createKeyboardProfileStorage()
    window.__XIAOCHAO_RUNTIME_SESSION__ = session
    ;(async () => {
      try {
        await Promise.all(styles.map((src) => loadStyle(src, session)))
        const keyboardReady = await keyboardSession.ready
        if (!keyboardReady.available) window.__XIAOCHAO_KEYBOARD_UNAVAILABLE__ = true
        const scripts = ['/config/i18n.js', '/config/settings.js', '/runtime/j2me/touch-layout.js', '/ui-feedback.js']
        for (const src of scripts) {
          await loadClassic(src, session)
          if (!alive || !session.active) return
        }
        const touchLayout = window.TouchLayout?.forGame?.(`mrp:${game.file}`, 'mrp')
        if (touchLayout) {
          window.__XIAOCHAO_TOUCH_LAYOUT_ADAPTER__ = touchLayout
          touchLayout.migrate()
          keyboardSession.refreshConfig()
        }
        for (const src of ['/runtime/j2me/input-mapping.js', '/touchpad.js', '/maopao/vmrp_v1.0/midi.js', '/mrp-runtime.js', '/maopao/vmrp_v1.0/vmrp.js']) {
          await loadClassic(src, session)
          if (!alive || !session.active) return
        }
        if (!alive || !session.active) return
        setLoading(false)
        onReady?.()
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
      try { if (window.Module && window.Module._setEventEnable) window.Module._setEventEnable(false) } catch (_) {}
      try { window.js_stopSound && window.js_stopSound() } catch (_) {}
      document.body.classList.remove('runtime-active')
      window.__XIAOCHAO_RUNTIME_MRP = ''
      window.__XIAOCHAO_RUNTIME_MRP_URL = ''
      if (window.__XIAOCHAO_RUNTIME_SESSION__ === session) delete window.__XIAOCHAO_RUNTIME_SESSION__
      if (window.__XIAOCHAO_KEYBOARD_SESSION__ === keyboardSession) delete window.__XIAOCHAO_KEYBOARD_SESSION__
      delete window.KeyboardProfileStorage
      delete window.__XIAOCHAO_KEYBOARD_UNAVAILABLE__
      cleanupRuntimeArtifacts()
    }
  }, [game.file, keyboardSession])
  return <div className="runtime-view">{loading && !error ? <RuntimeLoading label="正在启动冒泡社区…" /> : null}{error ? <RuntimeFailure message={error} /> : null}<PhoneMarkup mrp keyboardSession={keyboardSession} /></div>
}
