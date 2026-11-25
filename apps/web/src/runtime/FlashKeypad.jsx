import { useCallback, useEffect, useRef, useState } from 'react'
import { flashCodeOf } from '../keyboard/system.js'
import { keyHaptic } from './haptics.js'
import { directionCodes, FLASH_KEYS_EVENT, keyLegend, keyOfCode, readFlashKeys, writeFlashKeys } from './flash-keys.js'
import { ScreenKeypad } from './ScreenKeypad.jsx'

const FLASH_KEYPAD_CLASSES = { base: 'flashKeypad', full: 'flashKeypadFull', left: 'flashKeypadNav', right: 'flashKeypadActions', wide: 'flashKeypadWide' }

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
 * The Flash on-screen keyboard: any keyboard of the catalog (keyboard/system.js), the gamepad (direction wheel with OK,
 * A / B) by default. Keys are delivered to the Ruffle player as keyboard events — the gamepad's with this game's keys,
 * a T9 key as the key a phone keyboard would send; a key held by two fingers is released only when both lift.
 */
export function FlashKeypad({ target, visible, layout, opacity, keys, prefs, update }) {
  const counts = useRef(new Map())
  // The code each finger's key sent, so it releases the same one even if the game's keys change meanwhile.
  const held = useRef(new Map())

  const releaseAll = useCallback(() => {
    if (!target) return
    for (const code of counts.current.keys()) sendKey(target, code, 'keyup')
    counts.current.clear()
    held.current.clear()
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

  // The gamepad shows this game's keys on its buttons; other keyboards are drawn as they are.
  const gamepadKeys = useCallback((piece) => (piece.id.startsWith('flash-') ? withKeys(piece, keys) : piece), [keys])
  const keyDown = useCallback((unit, pointerId, event) => {
    if (!target) return
    const code = flashCodeOf(unit, keys)
    if (!code) return
    keyHaptic(event)
    target.focus({ preventScroll: true })
    held.current.set(`${pointerId}:${unit.id}`, code)
    const count = counts.current.get(code) || 0
    counts.current.set(code, count + 1)
    if (count === 0) sendKey(target, code, 'keydown')
  }, [target, keys])
  const keyUp = useCallback((unit, pointerId) => {
    const id = `${pointerId}:${unit.id}`
    const code = held.current.get(id)
    held.current.delete(id)
    if (!target || !code || !counts.current.has(code)) return
    const count = counts.current.get(code) - 1
    if (count > 0) counts.current.set(code, count)
    else {
      counts.current.delete(code)
      sendKey(target, code, 'keyup')
    }
  }, [target])

  if (!target || !visible) return null
  return <ScreenKeypad style={prefs.style} orientation={layout} family="flash" prefs={prefs} update={update}
    classes={FLASH_KEYPAD_CLASSES} opacity={opacity} transformLayout={gamepadKeys} onPress={keyDown} onRelease={keyUp} control="flash-keypad" />
}
