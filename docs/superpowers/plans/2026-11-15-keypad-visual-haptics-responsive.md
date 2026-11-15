# Keypad Visual, Haptics, and Responsive Typography Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restore the original direction-pad visual language, restore mobile haptics, and make Canvas keypad labels responsive in one reviewable PR.

**Architecture:** The DOM remains the hit/accessibility map and the Canvas remains the sole visible keypad renderer. Canvas reads the existing CSS scale and representative computed font styles. Touchpad emits one haptic per deduplicated coarse-pointer press, preferring the RN bridge and falling back to the Web Vibration API.

**Tech Stack:** Vanilla JavaScript Canvas/DOM, CSS custom properties, React Native, `react-native-webview`, TypeScript, Vite, pnpm.

---

## Chunk 1: Responsive Canvas visual system

**Files:**
- Modify: `runtime/j2me/keypad-canvas.js`
- Reference: `runtime/j2me/style/main.css`
- Test: browser screenshots at 390x844 and 844x390

- [x] **Step 1: Map existing CSS tokens and historical geometry**
  Confirm `--u`, `--phone-*` colors, the system font stack, and the `.mini`, numeric,
  `.dir`, `.key.down`, and `.dir.down` ratios in
  `runtime/j2me/style/main.css` at historical commit `2d8a251`. Keep the current
  DOM rectangles as the geometry source.

- [x] **Step 2: Add Canvas style helpers**
  Read `--u` and representative computed styles from the live keypad. Add helpers
  that produce the CSS font family, weight, and proportional sizes for soft-key,
  numeric, auxiliary, and direction labels. Use the same fallback values when a
  representative node is unavailable.

- [x] **Step 3: Restore d-pad and pressed-state painting**
  Match the CSS d-pad radial background, inset/drop shadows, direction surface,
  arrow proportions, and active blue/alpha states. Ensure portrait draw order
  paints the d-pad and its arrows above the masked soft-key slots while keeping
  the soft-key labels readable.

- [x] **Step 4: Render all text from responsive helpers**
  Replace fixed `18px`, `item.h * 0.45`, and `item.h * 0.24` font calculations with
  the responsive values. Keep labels centered/left-aligned like the CSS layout and
  clamp only enough to prevent clipping on the smallest supported keypad.

- [x] **Step 5: Run syntax and visual smoke checks**
  Run `node --check runtime/j2me/keypad-canvas.js`. Start the existing web service,
  capture portrait and landscape screenshots, and verify no DOM text or duplicate
  active rectangles are visible over the Canvas.

## Chunk 2: Haptic bridge and default feedback

**Files:**
- Modify: `runtime/j2me/touchpad.js`
- Modify: `runtime/j2me/config/settings.js`
- Modify: `apps/mobile/src/host/protocol.ts`
- Modify: `apps/mobile/App.tsx`
- Reference: `apps/mobile/android/app/src/main/AndroidManifest.xml`

- [x] **Step 1: Add the versioned WebView haptic method**
  Extend `__XIAOCHAO_RN_HOST__` with `haptic(duration)` that sends a `haptic`
  message through the existing protocol without changing navigation or inset
  behavior.

- [x] **Step 2: Handle haptic messages in the native host**
  Import React Native `Vibration`, validate an object payload, clamp duration to
  8..40 ms, cancel any prior vibration, and invoke `Vibration.vibrate(duration)`.
  Ignore malformed or non-positive values.

- [x] **Step 3: Route touch feedback through the bridge and fallback**
  Keep coarse-pointer gating and deduplicated `press` behavior. Check that the
  bridge object and `haptic` member are functions before calling them; if the
  bridge is absent or throws, check that `navigator` exists and its `vibrate`
  member is a function before using the Web fallback. A successful bridge call
  suppresses the fallback, and absent APIs never throw.

- [x] **Step 4: Set the phone default to 16 ms**
  Change the mobile default setting from 10 to 16 while preserving explicit user
  settings and desktop default silence.

- [x] **Step 5: Run haptic-focused checks**
  Run `node --check runtime/j2me/touchpad.js`, `pnpm --filter @xiaochao/mobile typecheck`,
  and a browser stub that records bridge/fallback calls for mouse, touch, duplicate
  multi-touch, default 16 ms, explicit 8/40 ms, and out-of-range values. Exercise
  `parseHostMessage` with the `haptic` schema `{ version: 1, type: "haptic",
  payload: { duration: number } }`, wrong versions, malformed payloads, and
  non-positive values.

## Chunk 3: Integrated verification and delivery

**Files:**
- Modify: `docs/superpowers/specs/2026-11-15-keypad-visual-haptics-responsive-design.md`
- Modify: `docs/superpowers/plans/2026-11-15-keypad-visual-haptics-responsive.md`

- [x] **Step 1: Run the web build and repository checks**
  Run `pnpm --filter @xiaochao/web build`, `node --check
  runtime/j2me/keypad-canvas.js`, `node --check runtime/j2me/touchpad.js`,
  `pnpm --filter @xiaochao/mobile typecheck`, `git diff --check`, and inspect the
  diff for generated artifacts. Record command output in the PR description; do
  not commit build output, screenshots, profiles, or logs.

- [x] **Step 2: Validate responsive states**
  Start the local web server used by the repository, then use browser automation
  to capture 390x844 portrait, 844x390 landscape, and a runtime rotation
  transition. Before each active-state capture, dispatch a pointer press or add
  the relevant `.down` class, capture the Canvas-only pressed d-pad/soft-key, then
  release and confirm the class and pixels return to idle. Check arrows, numeric
  labels, soft-key labels, and absence of clipping/overlap.

- [ ] **Step 3: Validate haptic boundaries**
  Record Web API/bridge calls in the browser and report separately whether an
  Android emulator or physical device was available. When Android tooling is
  available, run `pnpm --filter @xiaochao/mobile build-android-release` (or the
  root `pnpm mobile:build-android` / equivalent Gradle release command), record
  the absolute APK path,
  install it with `adb install -r`, launch it, verify `android.permission.VIBRATE`
  in the APK/manifest, and send a WebView `haptic` message through the real host.
  Stub `Vibration` or use an instrumentation log to assert malformed/non-positive
  payload rejection, 8..40 ms clamping, `cancel()` before `vibrate()`, and the
  requested duration. Do not claim physical vibration without a physical-device
  run.

- [x] **Step 4: Update checkboxes and commit**
  Mark completed plan items, commit the implementation, push the single branch,
  and use GitHub MCP to search for duplicates, create one PR containing the
  design doc, implementation, and evidence, then verify the PR title, body,
  branch, and status through MCP.

- [x] **Step 5: Run cold-start review passes**
  Perform the required diff review, feature audit, and Android/WebView validation
  review with new `gpt-6-luna` reviewers at low reasoning and at most 300k tokens
  per context. They receive only the task summary,
  `AGENTS.md`, spec, acceptance criteria, diff, call chain, and verification
  evidence. Save R1/R2/R3 reports using `docs/review-report-template.md` under
  `docs/reviews/2026-11-15-keypad-visual-haptics-responsive-rN-<pass>.md`.
  Fix P0/P1/P2 findings, rerun the affected passes, then report residual risks
  and the PR state. Do not start R4.
