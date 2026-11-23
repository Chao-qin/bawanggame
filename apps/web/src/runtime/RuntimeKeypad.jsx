import { useCallback, useEffect, useMemo, useState } from 'react'
import { KeyboardCanvas } from '../keyboard/KeyboardCanvas.jsx'
import { getLayout, layoutGroup, T9_LANDSCAPE, T9_PORTRAIT } from '../keyboard/layouts.js'
import { KEYPAD_PREFS_EVENT, readKeypadPrefs, writeKeypadPrefs } from './keypad-prefs.js'
import './runtime-keypad.css'

/** The keypad choice, kept in sync across every component of this document that shows or edits it. */
export function useKeypadPrefs() {
  const [prefs, setPrefs] = useState(readKeypadPrefs)
  useEffect(() => {
    const sync = () => setPrefs(readKeypadPrefs())
    window.addEventListener(KEYPAD_PREFS_EVENT, sync)
    window.addEventListener('storage', sync)
    return () => {
      window.removeEventListener(KEYPAD_PREFS_EVENT, sync)
      window.removeEventListener('storage', sync)
    }
  }, [])
  return [prefs, useCallback((patch) => setPrefs(writeKeypadPrefs(patch)), [])]
}

// The same rule the runtime stylesheet lays the stage out by (runtime/j2me/style/main.css): landscape when J2ME's
// screen.js says so (body[data-orientation], a game's forced orientation) or the viewport is landscape
// (.viewport-landscape from responsive.js — all MRP has). Any other rule would put a portrait keypad into the
// landscape side column, or the reverse.
function currentOrientation() {
  const body = document.body
  return body.dataset.orientation === 'landscape' || body.classList.contains('viewport-landscape') ? 'landscape' : 'portrait'
}

function useRuntimeOrientation() {
  const [orientation, setOrientation] = useState(currentOrientation)
  useEffect(() => {
    const sync = () => setOrientation(currentOrientation())
    const observer = new MutationObserver(sync)
    observer.observe(document.body, { attributes: true, attributeFilter: ['data-orientation', 'class'] })
    window.addEventListener('resize', sync)
    return () => {
      observer.disconnect()
      window.removeEventListener('resize', sync)
    }
  }, [])
  return orientation
}

// Same rule as the classic keypad (touchpad.js): touch input only, the runtime's vibrate setting (24ms if unset),
// through the native host when there is one. A diagonal on the wheel presses two directions in one move: one pulse.
let lastHaptic = -Infinity
function haptic(event) {
  if (event?.pointerType && event.pointerType !== 'touch') return
  if (event?.timeStamp != null && Math.abs(event.timeStamp - lastHaptic) < 30) return
  lastHaptic = event?.timeStamp ?? 0
  const setting = window.config?.vibrate
  const requested = setting == null ? 24 : Number(setting)
  if (!(requested > 0)) return
  const duration = Math.max(8, Math.min(40, Math.round(requested)))
  try { if (window.__XIAOCHAO_RN_HOST__?.haptic?.(duration)) return } catch {}
  try { navigator.vibrate?.(duration) } catch {}
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
    body.dataset.keypadPlacement = prefs.style === 't9' ? prefs.placement : 'docked'
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
    haptic(event)
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
