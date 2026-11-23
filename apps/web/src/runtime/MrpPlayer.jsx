import { useEffect, useRef, useState } from 'react'
import { PhoneMarkup } from './PhoneMarkup.jsx'
import { createRuntimeSession, loadClassicInOrder, loadStyle } from './loadScript.js'
import { cleanupRuntimeArtifacts } from './cleanup.js'
import { RuntimeFailure, RuntimeLoading } from './RuntimeStatus.jsx'
import { claimRuntimeDocument, RUNTIME_ALREADY_BOOTED } from './runtime-boot.js'

export function MrpPlayer({ game, onReady }) {
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const callbacks = useRef({ onReady })
  callbacks.current = { onReady }
  useEffect(() => {
    if (!claimRuntimeDocument('mrp')) {
      setLoading(false)
      setError(RUNTIME_ALREADY_BOOTED)
      return undefined
    }
    document.body.classList.add('runtime-active')
    window.__XIAOCHAO_RUNTIME_MRP = game.file
    window.__XIAOCHAO_RUNTIME_MRP_URL = `/maopao/public/mrps/${encodeURIComponent(game.file)}`
    const styles = ['/style/main.css', '/style/feedback.css']
    let alive = true
    const session = createRuntimeSession()
    window.__XIAOCHAO_RUNTIME_SESSION__ = session
    ;(async () => {
      try {
        await Promise.all(styles.map((src) => loadStyle(src, session)))
        await loadClassicInOrder(['/config/i18n.js', '/config/settings.js', '/runtime/j2me/touch-layout.js', '/ui-feedback.js', '/keypad-canvas.js', '/runtime/j2me/input-mapping.js', '/touchpad.js', '/maopao/vmrp_v1.0/midi.js', '/mrp-runtime.js', '/maopao/vmrp_v1.0/vmrp.js'], session)
        if (!alive || !session.active) return
        setLoading(false)
        callbacks.current.onReady?.()
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
      try { if (window.Module && window.Module._setEventEnable) window.Module._setEventEnable(false) } catch (_) {}
      try { window.js_stopSound && window.js_stopSound() } catch (_) {}
      document.body.classList.remove('runtime-active')
      window.__XIAOCHAO_RUNTIME_MRP = ''
      window.__XIAOCHAO_RUNTIME_MRP_URL = ''
      if (window.__XIAOCHAO_RUNTIME_SESSION__ === session) delete window.__XIAOCHAO_RUNTIME_SESSION__
      cleanupRuntimeArtifacts()
    }
  }, [game.file])
  return <div className="runtime-view">{loading && !error ? <RuntimeLoading label="正在启动冒泡社区…" /> : null}{error ? <RuntimeFailure message={error} /> : <PhoneMarkup mrp />}</div>
}
