# Mobile Responsive System Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents are available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Establish one responsive layout contract for the web app and WebView, eliminate keypad long-press selection, and keep the game runtime inside every supported mobile viewport.

**Architecture:** A new `responsive.js` controller owns viewport mode classes and CSS variables at the document root. App-shell Uno shortcuts and legacy runtime CSS consume that contract without installing competing resize listeners. The keypad remains Canvas-rendered with a transparent DOM hit map, but the Touchpad layer captures native touch/gesture events and blocks selection, dragging, and context menus before browser defaults run.

**Tech Stack:** React, UnoCSS shortcuts/preflights, CSS environment variables, Visual Viewport API, Pointer Events, classic runtime JavaScript, React Native WebView.

---

## Chunk 1: Input surface and long-press protection

**Files:**
- Modify: `runtime/j2me/touchpad.js`
- Modify: `apps/web/src/runtime/PhoneMarkup.jsx`
- Modify: `runtime/j2me/style/main.css`

- [ ] **Step 1: Add a focused native gesture guard**

  In `Touchpad.bind`, add capture listeners for `touchstart`, `touchmove`,
  `gesturestart`, `contextmenu`, `selectstart`, and `dragstart`. The guard must
  only act when the event target is inside `#keypad`, must call
  `preventDefault()` before browser selection/callout handling, and must not
  affect the text editor or settings panel exceptions.

- [ ] **Step 2: Preserve pointer delivery while guarding defaults**

  Keep the existing pointerdown hit test, pointer capture, slide transitions,
  repeat timers, and release cleanup unchanged. Add a direct keypad gesture
  handler in `PhoneMarkup` as a fallback for WebViews that do not bubble native
  `selectstart`/`contextmenu` consistently. Do not place handlers on the Canvas
  that would prevent the transparent DOM hit map from receiving pointer events.

- [ ] **Step 3: Make the hit layer explicitly non-selectable**

  Add `-webkit-user-select`, `user-select`, `-webkit-touch-callout`,
  `-webkit-user-drag`, `touch-action: none`, and `pointer-events` declarations
  to the keypad root and controls. Keep the Canvas `pointer-events: none` and
  DOM controls at the interactive z-index. Add a focus-visible style that does
  not reintroduce browser outlines over the Canvas artwork.

- [ ] **Step 4: Run the input regression checks**

  Run `node --check runtime/j2me/touchpad.js`, `node --check runtime/j2me/keypad-canvas.js`,
  and the browser long-press probe. Expected: no `selectstart`, `contextmenu`,
  or `dragstart` event for every keypad region; pointer press/release counts
  remain one edge each.

## Chunk 2: Shared responsive contract

**Files:**
- Create: `apps/web/src/responsive.js`
- Modify: `apps/web/src/App.jsx`
- Modify: `apps/web/uno.config.js`
- Modify: `apps/mobile/App.tsx`
- Modify: `apps/mobile/src/host/protocol.ts`

- [ ] **Step 1: Implement the document responsive controller**

  Add `installResponsiveContract()` with one idempotent set of listeners for
  `resize`, `orientationchange`, `fullscreenchange`, and
  `visualViewport.resize/scroll`. On each animation frame, write
  `--viewport-width`, `--viewport-height`, `--visual-viewport-height`,
  `--keyboard-height`, and mode data attributes/classes for compact/mobile/
  tablet/desktop, portrait/landscape, and short-height. Return cleanup that
  cancels the frame and removes every listener/class/variable.

  Consume the versioned RN bridge payload
  `setInsets({ version: 1, top, right, bottom, left })` in CSS pixels when
  present; browser builds keep `env(safe-area-inset-*)` as the fallback.

- [ ] **Step 2: Mount the controller once at the app root**

  Install the controller from `App`, before library/player content is rendered.
  Keep the existing Player refit for legacy canvas internals, but make it call
  the responsive contract refresh instead of maintaining independent viewport
  state. Preserve fullscreen and route cleanup behavior.

- [ ] **Step 3: Define WebView-safe defaults**

  Ensure the root contract works when `visualViewport` is missing and when the
  WebView reports zero safe-area environment values. Use `100dvh` with a
  `100vh` fallback and never depend on a named device or platform user agent.

- [ ] **Step 4: Verify the contract in isolation**

  Run a Node/browser probe that changes viewport metrics and asserts the mode
  classes, keyboard height, orientation, and cleanup behavior. Expected:
  320px maps to compact, 390px to mobile, 768px to tablet, 1024px to desktop,
  and a visual viewport shorter than the layout viewport sets keyboard-open.

## Chunk 3: App shell responsive layout

**Files:**
- Modify: `apps/web/uno.config.js`
- Modify: `apps/web/src/App.jsx` only where semantic wrappers or responsive
  class hooks are needed.

- [ ] **Step 1: Normalize shell width and spacing tokens**

  Replace scattered mobile-only preflight patches with contract-driven shell
  rules. Keep a readable max content width, use safe-area padding at the page
  edges, and prevent header/tabs from forcing horizontal overflow.

- [ ] **Step 2: Make library and store controls wrap predictably**

  Keep search, upload, counts, filters, and pagination usable at 320px. Set
  `min-width: 0` on flexible children, allow action groups to wrap, and use
  `clamp()`/grid minimums for cards instead of device-specific overrides.

- [ ] **Step 3: Make sheets and dialogs keyboard-aware**

  Use the visual viewport contract for maximum sheet height and bottom padding.
  Preserve scroll ownership inside option/settings sheets and keep primary
  actions above the software keyboard.

- [ ] **Step 4: Run shell viewport checks**

  At 320x568, 390x844, 430x932, 1024x768, and 1365x768 assert no horizontal
  overflow, visible tab labels, usable search/filter controls, and dialog
  buttons within the visual viewport.

## Chunk 4: Runtime responsive layout

**Files:**
- Modify: `runtime/j2me/style/main.css`
- Modify: `apps/web/src/runtime/J2MEPlayer.jsx`
- Modify: `apps/web/src/runtime/MrpPlayer.jsx`
- Modify: `runtime/j2me/keypad-canvas.js`
- Modify: `runtime/j2me/panel.js`
- Modify: `runtime/j2me/bld/lcdui.js`
- Modify: `runtime/mrp/mrp-runtime.js`

- [ ] **Step 1: Replace fixed runtime sizing with contract dimensions**

  Use the responsive variables for stage padding, toolbar space, display
  container height, and keypad unit size. Keep the logical game canvas ratio
  authoritative and cap controls by available width/height.

- [ ] **Step 2: Define compact, portrait, landscape, and short-height modes**

  Make portrait stack display then keypad without clipping at 320px. Make
  landscape allocate equal side tracks around the display, and reduce keypad
  units in short-height mode without reducing touch hit targets below the
  minimum. Use safe-area padding on the outermost stage only.

- [ ] **Step 3: Refine Canvas and hit-map geometry**

  Have `keypad-canvas.js` observe the contract mode and one shared resize frame;
  redraw after orientation/fullscreen/keyboard changes; and keep DOM rects and
  Canvas coordinates in the same viewport coordinate space. Ensure the Canvas
  never intercepts events and the transparent DOM map remains aligned.

- [ ] **Step 4: Verify runtime geometry and interaction**

  Probe all target viewports for canvas bounds, keypad bounds, display aspect
  ratio, safe-area padding, and button rectangles. Rotate between portrait and
  landscape and simulate a visual viewport reduction; assert the next frame
  restores a usable layout and all active keys release on cancellation. The
  probe must dispatch `pointercancel` and verify one release edge per held
  code. Long-press every keypad region and assert zero `selectstart`,
  `contextmenu`, and `dragstart` events; editor and MRP dialog text remain
  editable, and settings sheets retain vertical scrolling.

## Chunk 5: WebView packaging and validation matrix

**Files:**
- Modify: `apps/mobile/App.tsx` for the required versioned inset bridge and
  WebView viewport settings.
- Modify: `apps/mobile/src/host/protocol.ts` for the typed inset payload/helper.
- Modify: `docs/superpowers/specs/2026-11-15-mobile-responsive-system-design.md`
- Modify: this plan as each step completes.

- [ ] **Step 1: Validate browser and WebView resource parity**

  Run the Web production build, `pnpm mobile:prepare-web`, and
  `pnpm mobile:verify-web`. Confirm the generated mobile Web root contains the
  responsive controller, runtime CSS, Canvas keypad, and touchpad scripts.
  Save viewport JSON, screenshots, and long-press event logs under
  `/tmp/mobile-responsive-system/`.

- [ ] **Step 2: Build and inspect Android packaging**

  Run `pnpm mobile:build-android`, inspect the bundle and Web assets inside the
  release APK, and check the existing vibration permission. Assert exact
  entries for `apps/mobile/web/index.html`, `apps/mobile/web/style/main.css`,
  `apps/mobile/web/keypad-canvas.js`, and `apps/mobile/web/touchpad.js`.
  Install/start only when an emulator/device is available; report the absence
  explicitly.

- [ ] **Step 3: Complete cold-start reviews**

  Run a fresh diff review, feature audit, and Android/WebView validation review
  against the current diff and this spec. Fix all P0-P2 findings, then repeat
  the applicable reviews before delivery.

- [ ] **Step 4: Commit, push, and create one PR**

  Run `git diff --check`, remove generated staging output, commit the complete
  responsive/input change on `fix/mobile-responsive-system`, push it, create
  one PR against `main`, and verify the PR title, body, branch, and status with
  GitHub MCP.
