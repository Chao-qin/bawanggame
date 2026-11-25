import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { phoneActionOf, screenKeypad } from '../keyboard/system.js'
import { effectiveLayout, effectiveOpacity, effectivePlacement, KEYPAD_PREFS_EVENT, readKeypadPrefs, writeKeypadPrefs } from './keypad-prefs.js'
import { keyHaptic } from './haptics.js'
import { ScreenKeypad } from './ScreenKeypad.jsx'
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

/** The orientation of the viewport itself (responsive.js). */
export function viewportOrientation() {
  return document.body.classList.contains('viewport-landscape') ? 'landscape' : 'portrait'
}

// The one layout rule every runtime lays its stage, keypad and toolbar out by: body[data-orientation]. J2ME's
// screen.js sets it (a game's forced orientation, else the 「布局方向」 choice, else the viewport), the MRP stage
// (useKeypadStage) and the Flash player set it from the 「布局方向」 choice or the viewport. The stylesheets
// (runtime/j2me/style/main.css, runtime-keypad.css, mobile-ui.css) key on the same attribute; any other rule would
// put a portrait keypad into the landscape side column, or the reverse.
function currentOrientation() {
  const value = document.body.dataset.orientation
  return value === 'landscape' || value === 'portrait' ? value : viewportOrientation()
}

/** The runtime layout (body[data-orientation], else the viewport). */
export const useRuntimeOrientation = () => useOrientation(currentOrientation)
/** The viewport's own orientation, for a player that sets body[data-orientation] itself (Flash). */
export const useViewportOrientation = () => useOrientation(viewportOrientation)

function useOrientation(read) {
  const [orientation, setOrientation] = useState(read)
  useEffect(() => {
    const sync = () => setOrientation(read())
    const observer = new MutationObserver(sync)
    observer.observe(document.body, { attributes: true, attributeFilter: ['data-orientation', 'class'] })
    window.addEventListener('resize', sync)
    window.addEventListener('xiaochao:viewportchange', sync)
    return () => {
      observer.disconnect()
      window.removeEventListener('resize', sync)
      window.removeEventListener('xiaochao:viewportchange', sync)
    }
  }, [read])
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

/** Lays out the phone runtime stage from the 「游戏表现」 choice: keypad style, shown or hidden, docked or
 *  floating, its opacity, the layout direction and how the game screen fills its box. */
export function useKeypadStage(prefs, { mrp = false } = {}) {
  const placement = effectivePlacement(prefs, 'phone')
  const opacity = effectiveOpacity(prefs, 'phone')
  useLayoutEffect(() => {
    const body = document.body
    body.dataset.keypadStyle = prefs.style
    // A wide keyboard (keyboard/system.js split = false) floats in landscape, so the screen takes the whole stage.
    body.dataset.keypadWide = String(screenKeypad(prefs.style)?.split === false)
    body.dataset.keypadPlacement = placement
    body.dataset.keypadVisible = String(prefs.visible)
    body.dataset.screenFit = prefs.fit
    body.style.setProperty('--runtime-keypad-opacity', String(opacity))
    // J2ME's screen.js resolves the layout itself (a game's forced orientation wins); MRP has only this choice.
    window.__XIAOCHAO_LAYOUT_PREFERENCE__ = prefs.layout
    const syncLayout = () => {
      if (mrp) body.dataset.orientation = effectiveLayout(prefs, viewportOrientation())
    }
    syncLayout()
    window.addEventListener('xiaochao:viewportchange', syncLayout)
    // The game screen fits whatever space the keypad leaves: refit once the new layout is in.
    const frame = requestAnimationFrame(() => {
      try { window.ScreenSetup?.refit?.() } catch {}
      window.dispatchEvent(new Event('resize'))
      window.dispatchEvent(new CustomEvent('xiaochao:viewportchange'))
    })
    return () => {
      cancelAnimationFrame(frame)
      window.removeEventListener('xiaochao:viewportchange', syncLayout)
    }
  }, [prefs.style, prefs.visible, placement, opacity, prefs.layout, prefs.fit, mrp])
}

const PHONE_KEYPAD_CLASSES = { base: 't9Keypad', full: 't9KeypadFull', left: 't9KeypadNav', right: 't9KeypadNumpad', wide: 't9KeypadWide' }

// The gamepad's A / B legends name the keys a Flash game gets; on a phone they are OK and the right soft key.
const PHONE_GAMEPAD_LEGENDS = { 'flash-a': '确认', 'flash-b': '返回' }
const phoneLayout = (layout) => (layout.id.startsWith('flash-')
  ? { ...layout, keys: layout.keys.map((item) => (PHONE_GAMEPAD_LEGENDS[item.id] ? { ...item, secondaryLegend: PHONE_GAMEPAD_LEGENDS[item.id] } : item)) }
  : layout)

/** The phone runtimes' on-screen keyboard: any keyboard of the catalog except the classic DOM keypad. A key presses
 *  its phone action (keyboard/system.js phoneActionOf) through the runtime's input controller. */
export function RuntimeKeypad({ prefs }) {
  const orientation = useRuntimeOrientation()
  const [, update] = useKeypadPrefs('phone')
  // The action each finger pressed, so it releases the same one even if the bindings change meanwhile.
  const held = useRef(new Map())
  const keyDown = useCallback((unit, pointerId, event) => {
    const action = phoneActionOf(unit, window.__XIAOCHAO_INPUT_CONTROLLER__?.keyboardBindings?.())
    if (!action) return
    keyHaptic(event, window.config?.vibrate)
    held.current.set(`${pointerId}:${unit.id}`, action)
    sendAction(action, true, pointerId)
  }, [])
  const keyUp = useCallback((unit, pointerId) => {
    const key = `${pointerId}:${unit.id}`
    const action = held.current.get(key)
    if (!action) return
    held.current.delete(key)
    sendAction(action, false, pointerId)
  }, [])
  if (prefs.style === 'classic' || !prefs.visible) return null
  return <ScreenKeypad style={prefs.style} orientation={orientation} family="phone" prefs={prefs} update={update}
    classes={PHONE_KEYPAD_CLASSES} transformLayout={phoneLayout} onPress={keyDown} onRelease={keyUp} control="t9-keypad" />
}
