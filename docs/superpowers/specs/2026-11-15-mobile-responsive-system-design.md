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
  content width, and runtime mode.
- Define layout modes by available space and orientation rather than device
  names: compact, mobile, tablet, desktop, portrait, landscape, and short-height.
- Keep app-shell and runtime-shell layout boundaries explicit. The game canvas,
  keypad, toolbar, and overlays must not resize each other implicitly.
- Make the keypad input layer non-selectable and non-draggable at the element
  and event level. Keep pointer capture, accessibility labels, and key release
  cleanup intact.
- Refit runtime layout from `visualViewport`, orientation, and safe-area changes
  through one lifecycle entry point.
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

`RuntimeShell` owns the available content rectangle and toolbar safe space.
`GameSurface` fits the fixed logical game canvas inside that rectangle.
`InputLayer` owns the Canvas visual keypad plus transparent DOM hit controls.
`OverlayLayer` owns settings, dialogs, feedback, and text editors. The input
layer never participates in overlay scrolling and overlays never change the
game surface's intrinsic ratio.

### Long-press behavior

The DOM controls remain focusable and discoverable but are not selectable or
draggable. The keypad root and its controls prevent `contextmenu`, `selectstart`,
`dragstart`, and native long-press callout behavior in both capture listeners
and CSS. Pointer activation calls `preventDefault()` before capture and clears
any existing selection. Text editor controls remain the only exception.

### WebView behavior

The host uses the same generated Web resources as the browser. On resume,
rotation, fullscreen changes, and visual viewport changes, the web runtime
updates the responsive contract and refits once on the next animation frame.
The host does not inject device-specific offsets into game components.

## Acceptance

1. At 320x568, 390x844, 430x932, 844x390, 667x375, 1024x768, and 1365x768,
   no page or runtime view has horizontal overflow.
2. Runtime canvas and keypad remain inside the visual viewport with safe-area
   padding; the canvas keeps its logical aspect ratio after rotation/fullscreen.
3. Long-pressing every keypad region produces no selection, drag, or contextmenu
   event in Chromium touch emulation and the DOM hit controls still dispatch
   the expected pointer edges.
4. A software-keyboard visual viewport reduction keeps the active editor and
   primary actions visible, then restores the previous geometry after dismissal.
5. Desktop mouse input remains silent for haptics and keyboard input continues
   to map to the existing game codes.
6. Generated Web resources and Android packaging use the same responsive code;
   no generated staging directory is committed.

## Verification

- Web production build and server/mobile type checks.
- Browser viewport matrix with overflow, bounding-box, and long-press probes.
- Rotation and visual viewport resize probe with a synthetic keyboard inset.
- Mobile Web resource preparation and validation.
- Android release APK resource inspection. Emulator/device installation and
  hardware vibration are reported separately when unavailable.
