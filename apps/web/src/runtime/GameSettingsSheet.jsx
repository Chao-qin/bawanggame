import { useEffect, useRef } from 'react'
import { RuntimeSheet } from './RuntimeSheet.jsx'

/** J2ME game settings in the standard runtime sheet. panel.js still builds the settings; while the sheet is open it
 *  renders into the sheet body (window.__XIAOCHAO_SETTINGS_HOST__), and closing from inside the panel closes the
 *  sheet. */
export function GameSettingsSheet({ visible, onClose, getContainer }) {
  const hostRef = useRef(null)
  const closeRef = useRef(onClose)
  closeRef.current = onClose
  useEffect(() => {
    const api = window.__XIAOCHAO_SETTINGS_HOST__
    const host = hostRef.current
    if (!visible || !host || !api) return undefined
    api.attach(host, () => closeRef.current?.())
    return () => api.detach()
  }, [visible])
  return <RuntimeSheet visible={visible} onClose={onClose} title="游戏设置" getContainer={getContainer} forceRender>
    <div ref={hostRef} className="gameSettingsHost" />
  </RuntimeSheet>
}
