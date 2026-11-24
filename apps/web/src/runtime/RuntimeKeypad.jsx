import { useCallback, useEffect, useMemo, useState } from 'react'
import { KeyboardCanvas } from '../keyboard/KeyboardCanvas.jsx'
import { getLayout, layoutGroup, T9_LANDSCAPE, T9_PORTRAIT } from '../keyboard/layouts.js'
import { effectivePlacement, KEYPAD_PREFS_EVENT, readKeypadPrefs, writeKeypadPrefs } from './keypad-prefs.js'
import { keyHaptic } from './haptics.js'
import './runtime-keypad.css'

/** The keypad choice of a runtime family ('phone' for J2ME and MRP, 'flash'), kept in sync across every component
 *  of this document that shows or edits it. */
export function useKeypadPrefs(family = 'phone') {
  const [prefs, setPrefs] = useState(() => readKeypadPrefs(undefined, family))
  useEffect(() => {
    const sync = () => setPrefs(readKeypadPrefs(undefined, family))
    sync()
    window.addEventListener(KEYPAD_PREFS_EVENT, sync)
    window.addEventListener('storage', sync)
    return () => {
      window.removeEventListener(KEYPAD_PREFS_EVENT, sync)
      window.removeEventListener('storage', sync)
    }
  }, [family])
  return [prefs, useCallback((patch) => setPrefs(writeKeypadPrefs(patch, { family })), [family])]
}

// The one orientation rule every runtime lays its stage, keypad and toolbar out by (runtime/j2me/style/main.css uses
// the same): landscape when J2ME's screen.js says so (body[data-orientation], a game's forced orientation) or the
// viewport is landscape (.viewport-landscape from responsive.js — all MRP and Flash have). Any other rule would put
// a portrait keypad into the landscape side column, or the reverse.
function currentOrientation() {
  const body = document.body
  return body.dataset.orientation === 'landscape' || body.classList.contains('viewport-landscape') ? 'landscape' : 'portrait'
}

export function useRuntimeOrientation() {
  const [orientation, setOrientation] = useState(currentOrientation)
  useEffect(() => {
    const sync = () => setOrientation(currentOrientation())
    const observer = new MutationObserver(sync)
    observer.observe(document.body, { attributes: true, attributeFilter: ['data-orientation', 'class'] })
    window.addEventListener('resize', sync)
    window.addEventListener('xiaochao:viewportchange', sync)
    return () => {
      observer.disconnect()
      window.removeEventListener('resize', sync)
      window.removeEventListener('xiaochao:viewportchange', sync)
    }
  }, [])
  return orientation
}

// Both runtimes route every input source through one InputMapping controller (keymap.js for J2ME, mrp-runtime.js
// for MRP). A source holds one action at a time, and one finger can hold two (a diagonal on the wheel), so each
// finger-and-action pair is its own source; two fingers on one key release it only when both lift.
function sendAction(action, pressed, pointerId) {
  const controller = window.__XIAOCHAO_INPUT_CONTROLLER__
  if (!controller) return
  const source = `t9:${pointerId}:${action}`
  if (pressed) controller.press(source, action)
  else controller.release(source, action)
}

/** Lays out the classic keypad / T9 keypad and docked / floating placement for the runtime stage. */
export function useKeypadStage(prefs) {
  useEffect(() => {
    const body = document.body
    body.dataset.keypadStyle = prefs.style
    body.dataset.keypadPlacement = effectivePlacement(prefs, 'phone')
    // The game screen fits whatever space the keypad leaves: refit once the new layout is in.
    const frame = requestAnimationFrame(() => {
      try { window.ScreenSetup?.refit?.() } catch {}
      window.dispatchEvent(new Event('resize'))
      window.dispatchEvent(new CustomEvent('xiaochao:viewportchange'))
    })
    return () => cancelAnimationFrame(frame)
  }, [prefs.style, prefs.placement])
}

export function RuntimeKeypad({ prefs }) {
  const orientation = useRuntimeOrientation()
  const layouts = useMemo(() => {
    if (orientation !== 'landscape') return [['t9KeypadFull', getLayout(T9_PORTRAIT), 'T9 手机键盘']]
    const landscape = getLayout(T9_LANDSCAPE)
    return [
      ['t9KeypadNav', layoutGroup(landscape, 'nav'), 'T9 手机键盘：方向与软键'],
      ['t9KeypadNumpad', layoutGroup(landscape, 'numpad'), 'T9 手机键盘：数字键'],
    ]
  }, [orientation])
  const keyDown = useCallback((key, pointerId, event) => {
    keyHaptic(event, window.config?.vibrate)
    sendAction(key.value, true, pointerId)
  }, [])
  const keyUp = useCallback((key, pointerId) => sendAction(key.value, false, pointerId), [])
  if (prefs.style !== 't9') return null
  return layouts.map(([className, layout, label]) => (
    <div key={layout.id} className={`t9Keypad ${className}`} data-runtime-control="t9-keypad">
      <KeyboardCanvas layout={layout} accessibleLabel={label} onKeyDown={keyDown} onKeyUp={keyUp} />
    </div>
  ))
}
