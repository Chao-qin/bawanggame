# Canvas Keypad Visual, Haptics, and Responsive Typography

## Goal

Restore the original virtual keypad direction-pad appearance while keeping the
Canvas renderer as the only visible keypad layer. Restore mobile haptic feedback
through the React Native WebView host and keep a browser vibration fallback. Make
all Canvas labels follow the same responsive scale as the CSS keypad.

## Scope

- `runtime/j2me/keypad-canvas.js`: draw the d-pad and active states using the
  existing CSS visual language, and derive font family and sizes from the
  rendered DOM/`--u` values.
- `runtime/j2me/touchpad.js`: route coarse-pointer haptics through the native
  host when available, then fall back to `navigator.vibrate`, preserving one
  haptic event per deduplicated key press.
- `runtime/j2me/config/settings.js`: use 16 ms as the phone default.
- `apps/mobile/src/host/protocol.ts` and `apps/mobile/App.tsx`: add and handle a
  versioned `haptic` WebView message with bounded duration validation.

## Non-goals

- Change key hit testing, repeat timing, platform key codes, or orientation
  policy.
- Add a second visible DOM keypad renderer.
- Claim physical-device vibration support without a device run.

## Design

The Canvas renderer will read `getComputedStyle` from representative controls
and CSS custom property `--u`, then use the same system font stack and size
ratios as the original `.mini`, numeric, and auxiliary labels. D-pad geometry
and colors will mirror `#dpad`, `.dir`, `.dir::before`, `.key.down`, and
`.dir.down`; DOM controls remain transparent hit and accessibility elements.

Touch feedback will call `window.__XIAOCHAO_RN_HOST__.haptic(duration)` when the
bridge is present. The injected bridge sends `{ type: "haptic", payload:
{ duration } }`; the native handler clamps the duration and calls React Native
`Vibration.cancel()` followed by `Vibration.vibrate(duration)`. Web browsers use
the same bounded duration through `navigator.vibrate`.

## Acceptance

- Direction arrows, d-pad gradients, soft-key labels, and pressed states match
  the existing CSS style in portrait and landscape screenshots.
- Canvas label sizes change with the keypad scale at 390x844 and 844x390, with
  no clipping or overlap.
- Each coarse-pointer key press records one 16 ms default haptic request, with
  explicit configured values preserved and mouse/pen input ignored.
- JavaScript syntax, mobile TypeScript, web build, and diff checks pass.
- Validation reports browser stubs/simulators separately from physical-device
  vibration verification.
