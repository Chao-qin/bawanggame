import { useEffect, useState } from 'react'
import { PhoneMarkup } from './PhoneMarkup.jsx'
import { loadClassic, loadStyle } from './loadScript.js'

const styles = ['/style/main.css', '/style/lcdui.css', '/style/feedback.css']
const scripts = ['/config/i18n.js', '/ui-feedback.js', '/debug-graphics.js', '/libs/encoding.js', '/libs/webaudio-tinysynth.min.js', '/libs/BenzAMRRecorder.min.js', '/bld/native.js', '/config/default.js', '/config/settings.js', '/config/localjars.js', '/config/urlparams.js', '/screen.js', '/bld/j2me.js', '/bld/main-all.js', '/debug-native.js', '/bld/lcdui.js', '/bld/net.js', '/btroom.js', '/bld/bt.js', '/bld/media.js', '/bld/micro3d.js', '/bld/m3g.js', '/files.js', '/runtime-extras.js', '/panel.js', '/touchpad.js', '/keymap.js', '/layout.js']

export function J2MEPlayer({ game, onExit }) {
  const [error, setError] = useState('')
  useEffect(() => {
    document.body.classList.add('runtime-active')
    window.__XIAOCHAO_RUNTIME__ = true
    // The catalog may provide an already escaped filename; main-all.js performs
    // the single URL encoding pass when it requests server-hosted jars.
    let jarFile = game.file
    try { jarFile = decodeURIComponent(jarFile) } catch {}
    window.__XIAOCHAO_RUNTIME_JAR = game.local ? `local:${jarFile}` : `jar/${jarFile}`
    styles.forEach(loadStyle)
    let alive = true
    ;(async () => {
      try {
        for (const src of scripts) await loadClassic(src)
        if (!alive) return
        window.__XIAOCHAO_REQUEST_EXIT = onExit
        window.showExitScreen = onExit
        if (typeof window.onload === 'function') window.onload(new Event('load'))
      } catch (e) { if (alive) setError(e.message || String(e)) }
    })()
    return () => {
      alive = false
      try { window.myflushAll && window.myflushAll() } catch (_) {}
      try { window.__XIAOCHAO_J2ME_CTX && window.__XIAOCHAO_J2ME_CTX.runtime.stop() } catch (_) {}
      document.body.classList.remove('runtime-active')
      window.__XIAOCHAO_RUNTIME__ = false
      window.__XIAOCHAO_RUNTIME_JAR = ''
      window.__XIAOCHAO_REQUEST_EXIT = null
      window.__XIAOCHAO_J2ME_CTX = null
    }
  }, [game, onExit])
  return <div className="runtime-view">{error ? <div className="runtime-error">{error}</div> : null}<PhoneMarkup /></div>
}
