# Runtime Stability and Mobile QA Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make simulator startup, interruption, retry, landscape layout, and browser/mobile verification deterministic in one PR.

**Architecture:** Keep the existing page reload on game exit as the hard runtime reset. Add an alive/session guard around asynchronous style and script loading so an unmounted player cannot complete its mount path. Expose loading/error states in both players, make the browser verifier route-driven and fixture-aware, and add a small set of stable toolbar/layout accessibility rules without changing native bridge contracts.

**Tech Stack:** React 18, Vite, legacy J2ME/MRP browser runtimes, UnoCSS, Node CDP verifier, React Native WebView asset checks.

---

## Chunk 1: Runtime loading lifecycle and user-visible states

### Task 1: Add cancellable session guards to runtime loading

**Files:**
- Modify: `apps/web/src/runtime/loadScript.js`
- Modify: `apps/web/src/runtime/J2MEPlayer.jsx`
- Modify: `apps/web/src/runtime/MrpPlayer.jsx`
- Modify: `apps/web/src/runtime/cleanup.js`

- [ ] Add `createRuntimeSession()` in `loadScript.js`; expose `session.active`, `session.invalidate()`, `session.timeoutMs = 20000`, and resource ownership sets.
- [ ] Change `loadClassic(src, session)` and `loadStyle(href, session)` to attach each DOM node and Promise to that session; reject with `运行时资源加载超时: <src>` after 20 seconds, evict failed entries, and remove unfinished script/link nodes on `invalidate()`.
- [ ] Check `session.active` after every awaited style/script load and before each overlay mount, settings application, runtime boot, and `onReady` callback; late resource events must resolve to no-op.
- [ ] Give MRP the same post-load session checks already used by J2ME.
- [ ] Keep the existing full page reload on explicit game exit as the final VM isolation boundary because already-executed legacy globals cannot be safely reconstructed in the SPA realm.

### Task 2: Add startup, error, and retry UI

**Files:**
- Modify: `apps/web/src/runtime/J2MEPlayer.jsx`
- Modify: `apps/web/src/runtime/MrpPlayer.jsx`
- Modify: `apps/web/uno.config.js`
- Modify: `apps/web/src/App.jsx`

- [ ] Render an accessible loading status while runtime CSS/scripts are pending; hide it only after the runtime handoff reaches its ready callback.
- [ ] Render a bounded error panel with a retry button that calls `window.location.reload()` after session invalidation, using the stable text `模拟器资源加载失败，请重试。`.
- [ ] Keep existing J2ME splash/download screens and MRP loading dialog as the runtime-owned progress states after script initialization.
- [ ] Ensure retry and exit buttons remain usable at 390px width and respect safe-area insets.

## Chunk 2: Toolbar, landscape geometry, and accessibility

### Task 3: Stabilize toolbar controls

**Files:**
- Modify: `apps/web/src/App.jsx`
- Modify: `apps/web/uno.config.js`

- [ ] Give back, settings, and fullscreen controls icon-first labels with `aria-label`, `title`, minimum 40px hit targets, and visible focus styles.
- [ ] Preserve the existing settings readiness gate and fullscreen request fallback.
- [ ] Keep toolbar height measurement and player stage offset synchronized after responsive wrapping.

### Task 4: Add deterministic landscape geometry rules

**Files:**
- Modify: `runtime/j2me/style/main.css`
- Modify: `apps/web/src/runtime/PhoneMarkup.jsx`

- [ ] Add stable data hooks for the runtime stage and control groups without changing key IDs or input mapping.
- [ ] Constrain landscape columns with safe-area-aware minimums and prevent `#nav`, `#numpad`, and `#display-container` from overlapping.
- [ ] Preserve `standard` and `swapped` side layouts and the current default navigation-left behavior.
- [ ] Add `:focus-visible` styling that does not change touch hit rectangles.

## Chunk 3: Deterministic browser and mobile verification

### Task 5: Rewrite the browser smoke flow around explicit routes

**Files:**
- Modify: `apps/web/verify.mjs`

- [ ] Read `VERIFY_BASE_URL`, `VERIFY_J2ME_FILE`, and `VERIFY_MRP_FILE` from environment variables with safe defaults; default timeout is 30 seconds per CDP command.
- [ ] Select games by kind/route rather than the first card; report `SKIP: no J2ME fixture` or `SKIP: no MRP fixture` when the corresponding variable and catalog item are absent.
- [ ] Assert library load, option sheet geometry, startup/loading/error states, exit confirmation, return to library, and repeat entry.
- [ ] Add landscape emulation checks for `844x390`, `1280x720`, and `390x844`; record rects for nav, numpad, display, toolbar, and overlap results.
- [ ] Capture console exceptions and fail on runtime loader, canvas, route, or overlap errors; catalog/network errors remain warnings unless the test explicitly requests that catalog.

### Task 6: Verify mobile bundle and document limits

**Files:**
- Modify: `docs/superpowers/plans/2026-11-14-runtime-stability-mobile-qa.md`
- Test: `apps/mobile/scripts/verify-web-assets.mjs`

- [ ] Run web build, mobile typecheck, mobile asset verification, and the browser verifier with and without optional J2ME/MRP fixtures; expect PASS or an explicit SKIP line for absent fixtures.
- [ ] Record desktop viewport results separately from Android/iOS real-device results.
- [ ] Do not add generated `public/`, `apps/mobile/web/`, APKs, screenshots, or temporary browser profiles to the PR.

### Task 7: Commit and deliver one PR

- [ ] Run `git diff --check` and review the changed-file list for unrelated edits.
- [ ] Complete R1 diff review, feature audit, and applicable validation; fix findings and repeat from R2 as required.
- [ ] Push `fix/runtime-stability-and-mobile-qa` and create one PR against `main`.
