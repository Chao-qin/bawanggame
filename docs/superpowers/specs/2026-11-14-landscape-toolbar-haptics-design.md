# Landscape Runtime Layout And Haptics Fix

## Goal

Improve the landscape runtime shown in the supplied screenshot: keep the game
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

Virtual-key feedback calls `navigator.vibrate` through a guarded helper. A
press cancels any previous pattern and emits one clamped pulse (default 16ms
on coarse-pointer devices). Unsupported APIs, denied calls, desktop pointers,
and configured zero duration are silent. Android declares
`android.permission.VIBRATE` so the WebView can deliver the pulse.

## Acceptance

1. At a landscape viewport, the game display's bounding-box center is within
   2% of the viewport center and its height increases when the toolbar is
   collapsed.
2. The landscape toolbar is a single floating control when collapsed and all
   three existing actions remain reachable after expansion.
3. Navigation soft/mini keys are visible and receive pointer events without
   being covered by the d-pad; directional keys still receive their existing
   pointer mappings.
4. A supported coarse-pointer press produces one vibration pulse within the
   configured duration; a rapid second press does not leave an old vibration
   pattern running. Desktop and unsupported WebView environments do not throw.
5. Portrait layout, settings, fullscreen, long-press prevention, and key
   lifecycle cleanup continue to work.

## Verification

- `git diff --check`
- `node --check runtime/j2me/touchpad.js`
- `pnpm --filter @xiaochao/web build`
- `pnpm --filter @xiaochao/mobile typecheck`
- Android manifest inspection for `android.permission.VIBRATE`
- Browser layout smoke probe at portrait and landscape viewports, checking
  display centering, toolbar toggle, navigation hit testing, and vibration API
  call count with a stubbed `navigator.vibrate`.
