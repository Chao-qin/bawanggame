import { useMemo } from 'react'
import { KeyboardCanvas } from '../keyboard/KeyboardCanvas.jsx'
import { keypadPieces, screenKeypad } from '../keyboard/system.js'
import { effectivePlacement } from './keypad-prefs.js'
import { KeypadPiece } from './KeypadPiece.jsx'

const PART_LABELS = { full: '', wide: '', left: '：左半', right: '：右半' }

/**
 * Any on-screen keyboard of the catalog (keyboard/system.js SCREEN_KEYPADS) for one runtime family: the whole keyboard,
 * or its two halves beside a landscape screen, each a KeypadPiece (docked, or floating and draggable). The family
 * decides what a key does (`onPress` / `onRelease` get KeyboardCanvas's key units) and names the pieces' classes
 * its stylesheet lays out: { base, full, left, right, wide }.
 */
export function ScreenKeypad({ style, orientation, family, prefs, update, classes, opacity, transformLayout, onPress, onRelease, control }) {
  const keypad = screenKeypad(style)
  const pieces = useMemo(() => keypadPieces(style, orientation)
    .map((item) => ({ ...item, layout: transformLayout ? transformLayout(item.layout) : item.layout })), [style, orientation, transformLayout])
  if (!keypad) return null
  const floating = effectivePlacement(prefs, family) === 'floating'
  // A wide keyboard has no halves for the landscape side columns: there it always floats (and can be dragged).
  return pieces.map((item) => (
    <KeypadPiece key={item.layout.id} floating={floating || item.part === 'wide'} family={family} piece={item.piece} origin={item.origin} prefs={prefs} update={update}
      className={`${classes.base} ${classes[item.part]}`} style={opacity == null ? undefined : { opacity }} data-runtime-control={control}>
      <KeyboardCanvas layout={item.layout} accessibleLabel={`${keypad.name}${PART_LABELS[item.part]}`} onKeyDown={onPress} onKeyUp={onRelease} />
    </KeypadPiece>
  ))
}
