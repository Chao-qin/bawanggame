# Landscape Runtime Layout And Haptics Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix landscape runtime centering, toolbar space, navigation-key visibility, and Android virtual-key vibration feedback.

**Architecture:** The React player owns toolbar state and exposes a compact landscape control while the legacy runtime owns the phone canvas and keypad. CSS changes are limited to landscape grid tracks, stacking contexts, and toolbar positioning. `touchpad.js` keeps DOM pointer semantics and adds a guarded haptic helper; Android only supplies the missing manifest capability.

**Tech Stack:** React, CSS grid/flex, Browser Pointer Events, classic runtime JavaScript, React Native WebView, Android Gradle.

---

## Chunk 1: Landscape toolbar and stage layout

**Files:**
- Modify: `apps/web/src/App.jsx:500-660` (toolbar markup around the `return` block near line 638)
- Modify: `runtime/j2me/style/main.css:774-890`

- [ ] **Step 1: Add toolbar state and compact landscape markup**

  Add a local `toolbarCollapsed` state initialized from the current orientation
  and update it when orientation/fullscreen changes. In landscape render a
  round toggle button with an accessible label and the existing actions inside
  an expandable group; keep the current full toolbar markup in portrait.

- [ ] **Step 2: Preserve action handlers and focus behavior**

  Reuse `requestBack`, `openSettings`, and `toggleFullscreen`. Stop toolbar
  clicks from reaching the player and close the expanded group only on an
  explicit toggle or when leaving landscape. Do not change route history or
  fullscreen API behavior.

- [ ] **Step 3: Center the landscape display in equal tracks**

  Change the landscape grid to equal flexible side columns and a center column
  constrained by the display aspect ratio. Position the stage below only the
  expanded toolbar space; when collapsed, let the stage use the extra height.
  Define `#display-container`, `#display`, and `#canvas` min/max constraints so
  the display bounding box is centered in the stage content box at 1365x768.

- [ ] **Step 4: Fix navigation/d-pad stacking**

  Give `#nav` a local stacking context above the d-pad corner masks and keep
  `.key` pointer events enabled. Ensure `#choice`, `#back`, `#ret`, and `#clear`
  remain visible and clickable without changing direction geometry.

- [ ] **Step 5: Run web syntax/build checks**

  Run `pnpm --filter @xiaochao/web build` and `git diff --check`.
  Expected: Vite succeeds and no whitespace errors are reported.

## Chunk 2: Haptics and Android permission

**Files:**
- Modify: `runtime/j2me/touchpad.js:80-105`
- Modify: `apps/mobile/android/app/src/main/AndroidManifest.xml:1-8`

- [ ] **Step 1: Add the guarded haptic helper**

  Add a helper that accepts the originating `pointerType`. Treat `touch` as
  coarse, `mouse`/`pen` as silent, and use
  `matchMedia('(pointer: coarse)')` only when the type is absent. Read
  `feedback.vibrate`, use 16ms when it is missing on coarse pointers, return
  for zero/desktop/unsupported APIs, clamp positive durations to 8-40ms, call
  `navigator.vibrate(0)`, then call one positive duration. Catch denied API
  calls so desktop and unsupported WebViews remain quiet.

- [ ] **Step 2: Route press feedback through the helper**

  Store `pointerType` in each held pointer and pass it through `move`,
  `beginOk`, and `clearHold` to `press`. Replace the direct
  `navigator.vibrate(fb.vibrate)` call in `press` with the helper. Keep
  multi-pointer edge de-duplication so only one pulse occurs for a shared
  platform key edge; repeats do not vibrate.

- [ ] **Step 3: Declare Android capability**

  Add `<uses-permission android:name="android.permission.VIBRATE" />` beside the
  existing Android permissions. Do not add a runtime permission prompt because
  this is a normal permission.

- [ ] **Step 4: Run runtime and mobile checks**

  Run `node --check runtime/j2me/touchpad.js` and
  `pnpm --filter @xiaochao/mobile typecheck`.

## Chunk 3: Browser and Android verification

**Files:**
- No new tracked files; keep screenshots/logs outside the repository or in
  ignored temporary paths.

- [ ] **Step 1: Run the browser smoke probe**

  Start the app with `pnpm --filter @xiaochao/web dev --host 127.0.0.1`.
  At 1365x768 and 390x844, check the display center, collapsed/expanded
  toolbar height, navigation hit targets, and console errors. Stub
  `navigator.vibrate` and assert `[0, 20]` for a 20ms coarse-pointer press,
  `[0, 16]` for missing duration on touch, no calls for duration 0 or a mouse
  pointer, no throw for missing/unsupported/denied APIs, and a fresh `[0, 20]`
  sequence on a rapid second press. Capture screenshots for the visual record.

- [ ] **Step 2: Verify Android packaging and startup**

  Run `pnpm mobile:prepare-web` and
  `pnpm mobile:build-android-release`, then inspect
  `apps/mobile/android/app/build/outputs/apk/release/app-release.apk` with
  `aapt dump permissions`. If an emulator/device is available, install with
  `adb install -r apps/mobile/android/app/build/outputs/apk/release/app-release.apk`
  and start with `adb shell monkey -p
  com.xiaochao.bawang 1`; verify WebView assets, keypad presence, and no
  vibration errors. Record unavailable device validation explicitly.

- [ ] **Step 3: Verify lifecycle regressions**

  Exercise portrait, landscape, fullscreen enter/exit/failure, toolbar toggle,
  long-press on canvas/keypad, pointer cancellation, and exit cleanup. Confirm
  no active key remains down and no new console errors occur.

- [ ] **Step 4: Commit implementation**

  ```bash
  git add apps/web/src/App.jsx runtime/j2me/style/main.css runtime/j2me/touchpad.js apps/mobile/android/app/src/main/AndroidManifest.xml docs/superpowers/specs/2026-11-14-landscape-toolbar-haptics-design.md docs/superpowers/plans/2026-11-14-landscape-toolbar-haptics.md
  git commit -m "fix: improve landscape runtime and key haptics"
  ```
