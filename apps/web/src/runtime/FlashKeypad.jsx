import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { KeyboardCanvas } from '../keyboard/KeyboardCanvas.jsx'
import { FLASH_LANDSCAPE, FLASH_PORTRAIT, getLayout, layoutGroup } from '../keyboard/layouts.js'
import { keyHaptic } from './haptics.js'
import { directionCodes, FLASH_KEYS_EVENT, keyLegend, keyOfCode, readFlashKeys, writeFlashKeys } from './flash-keys.js'

function sendKey(target, code, type) {
  target.dispatchEvent(new KeyboardEvent(type, { key: keyOfCode(code), code, bubbles: true, cancelable: true }))
}

/** One game's Flash keys, kept in sync with the sheet that edits them. */
export function useFlashKeys(game) {
  const [keys, setKeys] = useState(() => readFlashKeys(game))
  useEffect(() => {
    const sync = () => setKeys(readFlashKeys(game))
    sync()
    window.addEventListener(FLASH_KEYS_EVENT, sync)
    window.addEventListener('storage', sync)
    return () => {
      window.removeEventListener(FLASH_KEYS_EVENT, sync)
      window.removeEventListener('storage', sync)
    }
  }, [game])
  return [keys, useCallback((patch) => setKeys(writeFlashKeys(game, patch)), [game])]
}

/** The preset with this game's keys: the wheel sends its directions and OK, the action keys their keys, and each
 *  action key's small legend names the key it sends. */
function withKeys(layout, keys) {
  const directions = directionCodes(keys)
  return {
    ...layout,
    keys: layout.keys.map((item) => {
      if (item.shape === 'wheel') return { ...item, wheel: { ...directions, center: keys.ok } }
      if (item.id === 'flash-a') return { ...item, value: keys.a, secondaryLegend: keyLegend(keys.a) }
      if (item.id === 'flash-b') return { ...item, value: keys.b, secondaryLegend: keyLegend(keys.b) }
      return item
    }),
  }
}

/**
 * The Flash gamepad, drawn by the same canvas keyboard as the T9 keypad: a direction wheel (OK at its hub) and A / B.
 * A portrait layout shows it under the screen, a landscape one splits it into the two side columns. Keys are
 * delivered to the Ruffle player as keyboard events; a key held by two fingers is released only when both lift.
 */
export function FlashKeypad({ target, visible, layout, opacity, keys }) {
  const counts = useRef(new Map())

  const releaseAll = useCallback(() => {
    if (!target) return
    for (const code of counts.current.keys()) sendKey(target, code, 'keyup')
    counts.current.clear()
  }, [target])

  useEffect(() => {
    if (!target) return undefined
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
  }, [target, releaseAll])
  // A remapped key must not stay held under its old code.
  useEffect(() => releaseAll, [keys, releaseAll])

  const layouts = useMemo(() => {
    if (layout !== 'landscape') return [['flashKeypadFull', withKeys(getLayout(FLASH_PORTRAIT), keys), 'Flash 手柄']]
    const landscape = withKeys(getLayout(FLASH_LANDSCAPE), keys)
    return [
      ['flashKeypadNav', layoutGroup(landscape, 'nav'), 'Flash 手柄：方向'],
      ['flashKeypadActions', layoutGroup(landscape, 'actions'), 'Flash 手柄：动作键'],
    ]
  }, [layout, keys])

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

  if (!target || !visible) return null
  return layouts.map(([className, keyLayout, label]) => (
    <div key={keyLayout.id} className={`flashKeypad ${className}`} style={{ opacity }} data-runtime-control="flash-keypad">
      <KeyboardCanvas layout={keyLayout} accessibleLabel={label} onKeyDown={keyDown} onKeyUp={keyUp} />
    </div>
  ))
}
