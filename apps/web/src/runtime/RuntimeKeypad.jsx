import { useCallback, useEffect, useLayoutEffect, useMemo, useState } from 'react'
import { KeyboardCanvas } from '../keyboard/KeyboardCanvas.jsx'
import { getLayout, layoutGroup, T9_LANDSCAPE, T9_PORTRAIT } from '../keyboard/layouts.js'
import { effectiveLayout, effectiveOpacity, effectivePlacement, KEYPAD_PREFS_EVENT, readKeypadPrefs, writeKeypadPrefs } from './keypad-prefs.js'
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
  if (prefs.style !== 't9' || !prefs.visible) return null
  return layouts.map(([className, layout, label]) => (
    <div key={layout.id} className={`t9Keypad ${className}`} data-runtime-control="t9-keypad">
      <KeyboardCanvas layout={layout} accessibleLabel={label} onKeyDown={keyDown} onKeyUp={keyUp} />
    </div>
  ))
}
