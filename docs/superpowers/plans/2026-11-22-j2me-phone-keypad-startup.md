# J2ME Phone Keypad and Startup Exit Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make J2ME honor its configured portrait phone keypad and prevent stale startup exit requests from blocking the runtime.

**Architecture:** Keep the shared SVG keyboard. Make profile resolution honor explicit runtime orientation and migrated per-game layout precedence, then refresh the keyboard session after J2ME loads and applies runtime configuration. Isolate Player back-request gating in a small pure helper so startup, terminal failure, and ready states can be tested without mounting the full application.

**Tech Stack:** React 18, Vite, ES modules, Node's built-in test runner, existing J2ME runtime scripts.

---

## Chunk 1: Profile Selection and Runtime Orientation

**Files:**
- Modify: `apps/web/src/runtime/keyboard/profiles.js`
- Modify: `apps/web/src/runtime/keyboard/KeyboardSession.js`
- Modify: `apps/web/src/runtime/J2MEPlayer.jsx`
- Test: `apps/web/src/runtime/keyboard/profiles.test.mjs`
- Test: `apps/web/src/runtime/keyboard/KeyboardSession.test.mjs`

- [ ] **Step 1: Add a failing profile precedence test**

Add a migrated J2ME portrait override whose `layoutId` is `landscape-split`, then assert `resolveProfile` returns that layout and reports `source: 'per-game'` when no explicit assignment exists.

- [ ] **Step 2: Run the focused profile test**

Run: `node --test apps/web/src/runtime/keyboard/profiles.test.mjs`

Expected: FAIL because `resolveProfile` currently ignores the migrated override's `layoutId`.

- [ ] **Step 3: Implement profile precedence**

Use `explicit || legacy || DEFAULT_PROFILES[...]` for the selected layout record, while retaining the existing rule that explicit assignments suppress per-game control overrides. Keep invalid/missing layout IDs falling back to the built-in default.

- [ ] **Step 4: Add a failing orientation-source test**

Extend the keyboard session test with a mocked `window.config.orientation = 'portrait'` and a landscape viewport. Assert that the session resolves the J2ME portrait profile rather than the viewport landscape profile, and that `refreshConfig()` re-resolves after config changes.

- [ ] **Step 5: Run the focused session test**

Run: `node --test apps/web/src/runtime/keyboard/KeyboardSession.test.mjs`

Expected: FAIL because the session currently derives orientation only from `window.innerWidth` and `window.innerHeight`.

- [ ] **Step 6: Implement configured orientation resolution**

Add a small orientation resolver in `KeyboardSession.js`: valid `window.config.orientation` values `portrait` and `landscape` take precedence for J2ME/MRP; `auto` and invalid values use the viewport. Ensure the same resolver is used for initial profile creation and refresh.

- [ ] **Step 7: Refresh after applying J2ME settings**

In `J2MEPlayer.jsx`, refresh the keyboard session immediately after `applyRuntimeSettings()` and `ScreenSetup.setOrientation()` have applied the runtime configuration, before keymap boot. This keeps the shared SVG surface and the runtime adapter on the same profile.

- [ ] **Step 8: Run the focused tests and commit**

Run: `node --test apps/web/src/runtime/keyboard/profiles.test.mjs apps/web/src/runtime/keyboard/KeyboardSession.test.mjs`

Expected: PASS.

Commit: `fix: honor j2me phone keypad profile`

## Chunk 2: Startup Exit Request Gating

**Files:**
- Create: `apps/web/src/runtime/runtimeBackGate.js`
- Test: `apps/web/src/runtime/runtimeBackGate.test.mjs`
- Modify: `apps/web/src/App.jsx`

- [ ] **Step 1: Write failing pure state tests**

Cover these transitions: startup rejects back requests; ready accepts a new request; failed accepts a new request; dismissing a confirmation does not create another request; an already-consumed signal is not replayed when readiness changes.

- [ ] **Step 2: Run the focused gate test**

Run: `node --test apps/web/src/runtime/runtimeBackGate.test.mjs`

Expected: FAIL because the helper does not exist.

- [ ] **Step 3: Implement the gate**

Create a pure helper that tracks the last observed native-back signal and runtime phase (`starting`, `ready`, `failed`). It returns whether a signal is a new actionable request, updates the signal cursor even while starting, and never mutates runtime state when the confirmation is dismissed.

- [ ] **Step 4: Integrate the gate into Player**

Replace the inline `nativeBackSignal` readiness checks in `App.jsx` with the helper. Keep toolbar back guarded by the same phase, preserve the existing terminal-error escape path, and leave the Continue button as a presentation-only dismissal.

- [ ] **Step 5: Run the gate test**

Run: `node --test apps/web/src/runtime/runtimeBackGate.test.mjs`

Expected: PASS.

- [ ] **Step 6: Commit the lifecycle fix**

Run: `git diff --check && git add apps/web/src/runtime/runtimeBackGate.js apps/web/src/runtime/runtimeBackGate.test.mjs apps/web/src/App.jsx && git commit -m "fix: ignore stale runtime exit requests"`

## Chunk 3: Verification and Delivery

**Files:**
- Modify: `docs/superpowers/specs/2026-11-22-j2me-phone-keypad-startup-design.md` only if implementation evidence changes scope
- Modify: `docs/superpowers/plans/2026-11-22-j2me-phone-keypad-startup.md` to mark completed steps

- [ ] **Step 1: Run all keyboard/runtime unit tests**

Run: `node --test apps/web/src/runtime/keyboard/*.test.mjs apps/web/src/runtime/runtimeBackGate.test.mjs runtime/j2me/*test.mjs`

Expected: PASS.

- [ ] **Step 2: Build the web application**

Run: `pnpm --filter @xiaochao/web build`

Expected: Vite build succeeds and generated files remain untracked/ignored.

- [ ] **Step 3: Run browser shell smoke verification**

Start the web dev server on an available port and verify the J2ME route at desktop and portrait-sized viewports. Confirm the SVG contains `up`, `down`, `left`, `right`, numeric, soft-key, and `ret` controls; startup has no exit dialog; a back request opens the dialog only after ready; Continue leaves the runtime mounted.

- [ ] **Step 4: Review the diff**

Run: `git diff --check`, `git status --short`, and inspect `git diff origin/main...HEAD`.

- [ ] **Step 5: Create and verify the PR**

Push `fix/j2me-phone-keypad-startup`, search for duplicate PRs/templates through GitHub MCP, create one PR using the repository template if present, and verify title, body, base/head branches, and status. Record unavailable Android WebView validation as residual risk if no emulator/device is available.
