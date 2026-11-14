# Mobile Responsive System And Input Surface

## Goal

Make the web application usable across compact phones, normal phones, tablets,
desktop browsers, and the React Native WebView host. The runtime keypad must
render through Canvas without allowing the transparent DOM hit map to trigger
text selection, drag behavior, or long-press menus.

## Problems

- Responsive rules are spread across the application shell and legacy runtime
  stylesheet, with no shared viewport or safe-area contract.
- Runtime sizing mixes fixed maxima, viewport units, and orientation overrides;
  a short phone viewport can push the canvas or keypad outside the visible area.
- The keypad uses Canvas for pixels but retains DOM buttons for hit testing. On
  some WebViews, long-pressing those controls can still start selection or a
  context menu before the document-level gesture handler wins.
- WebView insets and the browser visual viewport are not represented by one
  layout state, so rotation and the software keyboard can leave stale geometry.

## Scope

- Add a small shared responsive token layer for viewport, safe-area, keyboard,
  content width, and runtime mode. Browser safe-area values come from CSS
  `env()`; the RN host is the single source of physical insets and passes them
  to the WebView through a versioned bridge payload in CSS pixels.
- Define layout modes by available space and orientation rather than device
  names: compact, mobile, tablet, desktop, portrait, landscape, and short-height.
- Keep app-shell and runtime-shell layout boundaries explicit. The game canvas,
  keypad, toolbar, and overlays must not resize each other implicitly.
- Make the keypad input layer non-selectable and non-draggable at the element
  and event level. Keep pointer capture, accessibility labels, and key release
  cleanup intact.
- Refit runtime layout from `visualViewport`, orientation, fullscreen, and host
  inset changes through one lifecycle entry point.
- Add reproducible browser viewport checks for overflow, safe-area padding,
  canvas fit, keypad hit rectangles, long-press prevention, rotation, and
  software-keyboard geometry.

## Non-goals

- Do not redesign game artwork, key labels, or existing game mappings.
- Do not add a second input engine for mobile.
- Do not special-case named phone models or maintain per-device CSS patches.

## Design

### Responsive contract

The app exposes layout variables from one root contract:

```text
--viewport-width
--viewport-height
--visual-viewport-height
--safe-top
--safe-right
--safe-bottom
--safe-left
--keyboard-height
--content-max-width
```

CSS consumes these values with `env(safe-area-inset-*)` fallbacks. JavaScript
updates the contract only when the visual viewport, orientation, fullscreen, or
host inset changes. Components consume layout mode classes/data attributes;
they do not each install their own resize listeners.

The capacity modes are:

- `compact`: viewport width below 360px
- `mobile`: 360px through 767px
- `tablet`: 768px through 1023px
- `desktop`: 1024px and above
- `short-height`: visual viewport height below 600px

Runtime orientation remains an explicit `portrait` or `landscape` state. The
runtime may select a different composition for short landscape viewports while
preserving the same game surface aspect ratio.

### Runtime boundaries

`responsive.js` is the only owner of external viewport listeners. It writes the
root variables and dispatches a `xiaochao:viewportchange` event containing the
current metrics. React Player, keypad Canvas, MRP fit, the settings panel, and
the LCUI fit adapter consume that event; they do not install their own window
resize/orientation/visualViewport listeners. ResizeObserver remains local to
the keypad Canvas because it observes element geometry rather than viewport
state.

`RuntimeShell` owns the available content rectangle and toolbar safe space.
`GameSurface` fits the fixed logical game canvas inside that rectangle.
`InputLayer` owns the Canvas visual keypad plus transparent DOM hit controls.
`OverlayLayer` owns settings, dialogs, feedback, and text editors. The input
layer never participates in overlay scrolling and overlays never change the
game surface's intrinsic ratio.

### Long-press behavior

The DOM controls remain focusable and discoverable but are not selectable or
draggable. The keypad root and its controls prevent `touchstart`, `touchmove`,
`gesturestart`, `contextmenu`, `selectstart`, and `dragstart` in capture phase,
plus the equivalent CSS callout/selection behavior. Pointer activation calls
`preventDefault()` before capture and clears any existing selection. The
`#editor-layer`, `#mrp-dialog-text`, and settings panel are explicit exceptions:
they keep native focus, text selection, and vertical scrolling. `pointercancel`,
blur, visibility change, and pagehide release all active keys.

### WebView behavior

The host uses the same generated Web resources as the browser. RN removes
`SafeAreaView` edge consumption for the WebView and sends
`host.insets.v1 = { version: 1, top, right, bottom, left }` in CSS pixels from
`useSafeAreaInsets()` (RN logical dp maps to WebView CSS px; physical pixels
are never sent). The injected bridge exposes
`window.__XIAOCHAO_RESPONSIVE_HOST__.setInsets(payload)`; only version `1` is
accepted, every inset is finite and clamped to `>= 0`, and invalid or older
payloads leave the last valid inset unchanged. Orientation changes send a
replacement payload and unmount clears it. Browser builds use CSS `env()`
instead. `visualViewport` remains the source for keyboard height:
`max(0, layoutHeight - visualHeight - offsetTop)`; negative/rotated values are
clamped to zero. The host does not inject device-specific offsets into game
components.

## Acceptance

1. At 320x568, 390x844, 430x932, 844x390, 667x375, 1024x768, and 1365x768,
   `document.documentElement.scrollWidth <= clientWidth + 1` and every visible
   shell/runtime interactive rectangle is within the visual viewport with a
   maximum 1 CSS-pixel overflow.
2. Runtime Canvas and keypad remain inside the visual viewport with host/CSS
   safe-area padding; the Canvas logical aspect-ratio error is <=1% after
   rotation/fullscreen and after one animation-frame refit.
3. Long-pressing every keypad region in Chromium touch emulation produces zero
   `selectstart`, `dragstart`, and `contextmenu` events. Each pointerdown/up or
   pointercancel produces exactly one matching input edge, and no active key
   remains after cancellation. Editor focus/input remains functional.
4. A synthetic visual viewport reduction of at least 200px sets keyboard-open,
   keeps the active editor and primary actions at least 8px inside the reduced
   viewport, and clears keyboard-open/restores geometry within two animation
   frames after dismissal.
5. Desktop mouse input remains silent for haptics and keyboard input continues
   to map to the existing game codes.
6. Generated Web resources and Android packaging use the same responsive code;
   exact APK checks assert `assets/web/index.html`,
   `assets/web/keypad-canvas.js`, `assets/web/touchpad.js`, and
   `assets/index.android.bundle`; no generated staging directory is committed.

## Verification

- Web production build and server/mobile type checks.
- Browser viewport matrix with overflow, bounding-box, and long-press probes;
  save JSON results and screenshots under `/tmp/mobile-responsive-system/`.
- Rotation and visual viewport resize probe with a synthetic keyboard inset;
  record mode transitions, rect bounds, and restoration frame count.
- Mobile Web resource preparation and validation.
- Android release APK resource inspection. Emulator/device installation and
  hardware vibration are reported separately when unavailable.
