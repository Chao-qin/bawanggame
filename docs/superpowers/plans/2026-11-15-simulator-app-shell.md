# Simulator App Shell Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Standardize the simulator app shell, improve its portrait-first visual hierarchy, and stop Flash/local revival exits from reloading the WebView document.

**Architecture:** Keep the existing hash SPA and runtime components, but make `Player` the single lifecycle owner. Add an explicit runtime exit policy and idempotent cleanup path, then centralize shell tokens and stable stage layering in the existing Uno configuration. Keep reload only for J2ME/MRP and verify the Android back bridge against the same route callback.

**Tech Stack:** React, Vite/UnoCSS, React Native WebView, TypeScript bridge, Node/browser smoke scripts.

**Spec:** `docs/superpowers/specs/2026-11-15-simulator-app-shell-design.md`

---

## Chunk 1: Runtime Policy and Exit Lifecycle

### Task 1: Introduce explicit runtime exit policies

**Files:**
- Modify: `apps/web/src/App.jsx`
- Modify: `apps/web/src/runtime/FlashPlayer.jsx`
- Modify: `apps/web/src/runtime/LocalRevivalPlayer.jsx`
- Inspect: `apps/web/src/runtime/J2MEPlayer.jsx`, `apps/web/src/runtime/MrpPlayer.jsx`, `apps/web/src/runtime/cleanup.js`

- [ ] **Step 1: Write a failing lifecycle assertion**

Extend the existing browser verifier or add a focused browser test helper that instruments `window.location.reload`, opens a Flash route, invokes the exit confirmation, confirms exit, and asserts the library hash is restored without a reload call.

- [ ] **Step 2: Run the assertion to reproduce the bug**

Run the focused verifier against a local production server. Expected: the assertion fails because `Player.exit()` currently schedules `window.location.reload()` for every runtime.

- [ ] **Step 3: Add the policy table, cleanup handle, and idempotent exit state**

Define a small policy map in `App.jsx` keyed by runtime kind. Keep `reload` for `j2me` and `maopao`, and set `dispose` for `flash` and `local-revival`. Add a `runtimeCleanupRef` and pass `onCleanupReady(cleanup)` to the runtime. The callback must register an idempotent synchronous cleanup function. Add a ref guard so only the first confirmed exit performs cleanup and route commit.

- [ ] **Step 4: Move cleanup before route commit and gate reload**

Update `Player.exit()` to clean runtime artifacts and fullscreen first, call `onBack()`, and schedule reload only when the current game policy is `reload`. Do not reload for Flash or local revival. Preserve the existing confirmation UI and route hash behavior.

- [ ] **Step 5: Make runtime cleanup safe on dispose**

Ensure Flash and local revival register cleanup handles that invalidate async work and remove listeners/player nodes synchronously. React effect cleanup must call the same handle as a no-op safety net, and late async work cannot update state after route exit. Do not alter J2ME/MRP engine internals beyond the policy handoff.

- [ ] **Step 6: Run the focused assertion**

Run the browser verifier again. Expected: Flash exit returns to `#/library/flash`, the reload counter remains zero, and re-entry creates a fresh player. Record J2ME/MRP policy checks separately.

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/App.jsx apps/web/src/runtime/FlashPlayer.jsx apps/web/src/runtime/LocalRevivalPlayer.jsx apps/web/verify.mjs
git commit -m "fix: avoid webview reload when leaving disposable runtimes"
```

### Task 2: Unify browser and Android back handling

**Files:**
- Modify: `apps/web/src/App.jsx`
- Modify: `apps/mobile/src/host/protocol.ts`
- Modify: `apps/mobile/App.tsx`
- Test: `apps/mobile/src/host/protocol.test.ts` or the repository's existing bridge test location

- [ ] **Step 1: Add bridge tests for handled and unhandled back**

Assert that the injected bridge reports `handled: true` exactly once for a play hash and `handled: false` for a library hash. Assert that neither case mutates history; the play case invokes the page-level native-back callback and the library case leaves React Native responsible for exiting the host.

- [ ] **Step 2: Route native back through the shell callback**

Keep the native bridge as the single message source, install a page-level callback from `App`, and make it call the same exit-confirmation callback as the toolbar. Remove the `history.back()` call from the injected native bridge. Keep browser `popstate` handling for real browser history events and prevent duplicate confirmations with the exit guard.

- [ ] **Step 3: Run bridge and web checks**

Run the bridge test and browser verifier. Expected: one confirmation per Android back press, cancel leaves the game route intact, confirm returns to the same library tab, and library back exits the host.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/App.jsx apps/mobile/src/host/protocol.ts apps/mobile/App.tsx apps/mobile/src/host
git commit -m "fix: unify simulator back navigation"
```

---

## Chunk 2: Visual Shell Specification and Implementation

### Task 3: Centralize portrait-first shell tokens

**Files:**
- Modify: `apps/web/uno.config.js`
- Modify: `apps/web/src/App.jsx`
- Modify: `apps/web/src/runtime/RuntimeStatus.jsx`
- Modify: `apps/web/src/runtime/FlashPlayer.jsx`

- [ ] **Step 1: Add stable shell classes**

Define tokens and shortcuts for shell surface, panel, border, muted text, accent, danger, control height, and stage layering. Add a stable portrait app bar and runtime stage classes that use safe-area variables and fixed grid tracks.

- [ ] **Step 2: Apply the classes to library and runtime states**

Use the existing component structure but remove one-off runtime colors and inconsistent card treatments. Ensure loading/error/confirmation layers are absolute within the same stage and do not change its size.

- [ ] **Step 3: Add responsive landscape rules**

Keep the game stage full viewport in landscape, collapse the toolbar to its accessible toggle, and reserve safe-area space without changing the canvas dimensions. Verify text and controls fit at narrow portrait widths.

- [ ] **Step 4: Run visual smoke checks**

Run the web build and the browser verifier at 390x844 and 844x390. Capture or query `.player`, `.playerStage`, `.runtimeToolbar`, runtime canvas, and error/confirmation rectangles in boot, running, error, and confirmation states. Expected: no horizontal overflow, stable stage bounds, fixed card heights, text fitting, and no toolbar overlap with the game canvas.

- [ ] **Step 5: Commit**

```bash
git add apps/web/uno.config.js apps/web/src/App.jsx apps/web/src/runtime/RuntimeStatus.jsx apps/web/src/runtime/FlashPlayer.jsx
git commit -m "style: define simulator app shell tokens"
```

### Task 4: Document the runtime contract and acceptance evidence

**Files:**
- Create: `docs/superpowers/specs/2026-11-15-simulator-app-shell-design.md`
- Create: `docs/superpowers/plans/2026-11-15-simulator-app-shell.md`
- Modify: `apps/mobile/README.md`

- [ ] **Step 1: Add the runtime policy table to mobile documentation**

Document portrait-first behavior, landscape game mode, safe-area ownership, the visual utility rules, and which runtime kinds dispose versus reload on exit.

- [ ] **Step 2: Run documentation and diff checks**

Run `git diff --check` and inspect all generated files are ignored.

- [ ] **Step 3: Commit**

```bash
git add docs/superpowers/specs/2026-11-15-simulator-app-shell-design.md docs/superpowers/plans/2026-11-15-simulator-app-shell.md apps/mobile/README.md
git commit -m "docs: specify simulator app shell contract"
```

---

## Chunk 3: Build and Platform Verification

### Task 5: Verify desktop and Android behavior

**Files:**
- No generated build outputs are committed.

- [ ] **Step 1: Run focused web checks**

Run `pnpm build`, `pnpm run pack`, and the browser verifier. Expected: Flash launch, exit without reload, re-entry, and existing runtime routes pass.

- [ ] **Step 2: Prepare and verify mobile assets**

Run `pnpm mobile:prepare-web` and `pnpm mobile:verify-web`. Expected: required assets pass and generated web output remains ignored.

- [ ] **Step 3: Build and install Android**

Run `pnpm mobile:build-android`, install the APK on an API 35 emulator when available, and exercise Flash launch, cancel exit, confirm exit, Android back, and re-entry with network disabled. Record emulator versus physical-device coverage.

- [ ] **Step 4: Check iOS coverage**

Build or inspect the shared iOS web assets when Xcode/simctl are available. Otherwise report iOS runtime validation as unavailable rather than inferring it from Android.

- [ ] **Step 5: Commit any required fixes**

Only commit source fixes discovered by verification; never commit `public/`, `site-deploy/`, `apps/mobile/web/`, APKs, profiles, or logs.

---

## Finalization

- [ ] Run `git diff --check` and `git status --short`.
- [ ] Perform cold-start R1/R2/R3 review passes required by `AGENTS.md`, including diff review, feature audit, and Android/WebView validation.
- [ ] Push `feat/simulator-app-shell` and create one PR through GitHub MCP. Verify title, body, head/base, URL, and open state through MCP.
