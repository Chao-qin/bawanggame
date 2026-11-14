# Landscape Runtime Layout And Haptics Fix

## Goal

Improve the landscape runtime shown in the user-provided screenshot (`Image #1`
in the task message, approximately 3248x1400): keep the game
surface horizontally centered, give it more usable height, keep navigation keys
visible above the directional pad, collapse the React runtime toolbar into a
floating control in landscape, and make Android virtual-key vibration reliable.

## Scope

- `apps/web/src/App.jsx` and the web runtime stylesheet: add a compact
  landscape toolbar control with an explicit expanded/collapsed state.
- `runtime/j2me/style/main.css`: make the landscape stage use equal side tracks
  around a centered display, reserve only the necessary toolbar space, and
  establish a stable navigation/d-pad stacking order.
- `apps/mobile/android/app/src/main/AndroidManifest.xml`: declare the normal
  Android vibration permission.
- `runtime/j2me/touchpad.js`: route button feedback through a small haptic
  helper that cancels stale patterns, emits one bounded pulse per press, and
  never vibrates when disabled or unsupported.

## Preserved Behavior

- Portrait layout, full-screen entry/exit, game settings, back navigation, and
  existing J2ME/MRP key mappings remain unchanged.
- The DOM keypad remains the input surface. Existing pointer capture,
  long-press selection/context-menu prevention, repeat, and cleanup behavior
  stay active.
- Native text editors retain their current editing behavior.

## Design

The React player owns the visible toolbar. In landscape it renders as a fixed
round control button at the safe-area edge. Clicking the button toggles a
small expanded toolbar containing the existing back, settings, and fullscreen
actions. The player stage receives a state class so the expanded control does
not overlap the game surface. Portrait keeps the current full toolbar.

The landscape runtime stage uses three equal grid tracks with the game display
in the center track. The numeric keypad and navigation keypad are centered in
their own tracks. The center display uses the available viewport height after
the toolbar space and keeps its intrinsic aspect ratio; it is not vertically
offset by the side keypad dimensions. The navigation container gets a higher
stacking context than the d-pad only for its corner soft/mini keys, while the
d-pad keeps its circular center hit area.

Virtual-key feedback calls `navigator.vibrate` through a guarded helper. The
existing `config.vibrate` value is the duration in milliseconds: `0` disables
feedback, positive values are clamped to 8-40ms, and a missing value defaults
to 16ms only on coarse-pointer devices. A press first cancels a stale pattern
with `navigator.vibrate(0)`, then emits exactly one positive-duration pulse.
Unsupported APIs, denied calls, desktop pointers, and configured zero duration
are silent. Android declares `android.permission.VIBRATE` so the WebView can
deliver the pulse.

## Acceptance

1. At a 1365x768 CSS-pixel landscape viewport, the game display bounding box
   center (`(left + right) / 2`, `(top + bottom) / 2`) is within 2% of the
   player stage content box center, and its height is greater with the toolbar
   collapsed than with the toolbar expanded.
2. The landscape toolbar is a single floating control when collapsed and all
   three existing actions remain reachable after expansion.
3. Navigation soft/mini keys are visible and receive pointer events without
   being covered by the d-pad; directional keys still receive their existing
   pointer mappings.
4. With `config.vibrate=20`, a supported coarse-pointer press produces the
   sequence `navigator.vibrate(0)` then one `navigator.vibrate(20)` call. A
   rapid second press repeats that sequence without a stale pattern. With
   `config.vibrate=0`, no vibration call is made. Desktop and unsupported
   WebView environments do not throw.
5. Portrait layout, settings, fullscreen, long-press prevention, and key
   lifecycle cleanup continue to work.

## Verification

- `git diff --check`
- `node --check runtime/j2me/touchpad.js`
- `pnpm --filter @xiaochao/web build`
- `pnpm --filter @xiaochao/mobile typecheck`
- `pnpm mobile:prepare-web`
- `pnpm mobile:build-android`
- `aapt dump permissions apps/mobile/android/app/build/outputs/apk/release/app-release.apk`
  contains `android.permission.VIBRATE`; when an Android device/emulator is
  available, run `adb install -r .../app-release.apk` and
  `adb shell monkey -p com.xiaochao.bawang 1`, then verify the bundled WebView
  starts, the keypad is present, and vibration calls do not log errors. A real
  device run is marked unverified when no device is available.
- Browser layout smoke probe at fixed 1365x768 landscape and 390x844 portrait
  viewports, capturing before/after screenshots against the supplied screenshot
  as a visual reference. Check display centering, collapsed/expanded toolbar
  height, navigation hit testing, and vibration call count with a stubbed
  `navigator.vibrate`.
- Re-enter fullscreen, exit fullscreen, and exercise fullscreen failure in a
  browser with the toolbar collapsed and expanded; verify portrait remains
  centered, long-press on canvas/keypad does not open a menu, active keys are
  released on exit, and the console has no new runtime errors.
