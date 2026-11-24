import { useCallback, useEffect, useMemo, useRef } from 'react'
import { KeyboardCanvas } from '../keyboard/KeyboardCanvas.jsx'
import { FLASH_LANDSCAPE, FLASH_PORTRAIT, getLayout, layoutGroup } from '../keyboard/layouts.js'
import { keyHaptic } from './haptics.js'
import { useRuntimeOrientation } from './RuntimeKeypad.jsx'

// Layout values are keyboard codes; the `key` a Flash game reads differs for the printable ones.
const KEY_OF_CODE = { Space: ' ', KeyX: 'x' }

function sendKey(target, code, type) {
  target.dispatchEvent(new KeyboardEvent(type, { key: KEY_OF_CODE[code] || code, code, bubbles: true, cancelable: true }))
}

/**
 * The Flash gamepad, drawn by the same canvas keyboard as the T9 keypad: a direction wheel (OK = Enter) and A / B.
 * Portrait shows it under the screen, landscape splits it into the two side columns. Keys are delivered to the Ruffle
 * player as keyboard events; a key held by two fingers is released only when both lift.
 */
export function FlashKeypad({ target, prefs }) {
  const orientation = useRuntimeOrientation()
  const counts = useRef(new Map())

  useEffect(() => {
    if (!target) return undefined
    const held = counts.current
    const releaseAll = () => {
      for (const code of held.keys()) sendKey(target, code, 'keyup')
      held.clear()
    }
    const onVisibility = () => { if (document.hidden) releaseAll() }
    window.addEventListener('blur', releaseAll)
    document.addEventListener('visibilitychange', onVisibility)
    document.addEventListener('fullscreenchange', releaseAll)
    document.addEventListener('webkitfullscreenchange', releaseAll)
    return () => {
      window.removeEventListener('blur', releaseAll)
      document.removeEventListener('visibilitychange', onVisibility)
      document.removeEventListener('fullscreenchange', releaseAll)
      document.removeEventListener('webkitfullscreenchange', releaseAll)
      releaseAll()
    }
  }, [target])

  const layouts = useMemo(() => {
    if (orientation !== 'landscape') return [['flashKeypadFull', getLayout(FLASH_PORTRAIT), 'Flash 手柄']]
    const landscape = getLayout(FLASH_LANDSCAPE)
    return [
      ['flashKeypadNav', layoutGroup(landscape, 'nav'), 'Flash 手柄：方向'],
      ['flashKeypadActions', layoutGroup(landscape, 'actions'), 'Flash 手柄：动作键'],
    ]
  }, [orientation])

  const keyDown = useCallback((unit, _pointerId, event) => {
    if (!target) return
    keyHaptic(event)
    target.focus({ preventScroll: true })
    const count = counts.current.get(unit.value) || 0
    counts.current.set(unit.value, count + 1)
    if (count === 0) sendKey(target, unit.value, 'keydown')
  }, [target])
  const keyUp = useCallback((unit) => {
    if (!target || !counts.current.has(unit.value)) return
    const count = counts.current.get(unit.value) - 1
    if (count > 0) counts.current.set(unit.value, count)
    else {
      counts.current.delete(unit.value)
      sendKey(target, unit.value, 'keyup')
    }
  }, [target])

  if (!target || prefs.style === 'hidden') return null
  return layouts.map(([className, layout, label]) => (
    <div key={layout.id} className={`flashKeypad ${className}`} data-runtime-control="flash-keypad">
      <KeyboardCanvas layout={layout} accessibleLabel={label} onKeyDown={keyDown} onKeyUp={keyUp} />
    </div>
  ))
}
