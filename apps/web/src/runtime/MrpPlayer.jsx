import { useEffect, useState } from 'react'
import { PhoneMarkup } from './PhoneMarkup.jsx'
import { loadClassic, loadStyle } from './loadScript.js'

export function MrpPlayer({ game, onExit }) {
  const [error, setError] = useState('')
  useEffect(() => {
    window.__XIAOCHAO_RUNTIME_MRP = game.file
    window.__XIAOCHAO_RUNTIME_MRP_URL = `/maopao/public/mrps/${encodeURIComponent(game.file)}`
    loadStyle('/style/main.css'); loadStyle('/style/feedback.css')
    let alive = true
    ;(async () => {
      try {
        await loadClassic('/config/i18n.js')
        await loadClassic('/ui-feedback.js')
        await loadClassic('/touchpad.js')
        await loadClassic('/maopao/vmrp_v1.0/midi.js')
        await loadClassic('/mrp-runtime.js')
        await loadClassic('/maopao/vmrp_v1.0/vmrp.js')
      } catch (e) { if (alive) setError(e.message || String(e)) }
    })()
    return () => { alive = false; window.__XIAOCHAO_RUNTIME_MRP = ''; window.__XIAOCHAO_RUNTIME_MRP_URL = '' }
  }, [game, onExit])
  return <div className="runtime-view">{error ? <div className="runtime-error">{error}</div> : null}<PhoneMarkup mrp /></div>
}
