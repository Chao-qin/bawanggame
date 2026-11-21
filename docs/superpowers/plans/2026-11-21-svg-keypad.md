# Unified SVG Keyboard System Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the split HTML/Canvas keyboard implementations with one SVG-driven, profile-based keyboard shared by Flash, J2ME, and MRP, including reusable layouts, themes, action mappings, and an SVG-only editor.

**Architecture:** Keep platform input delivery in the existing J2ME, MRP, and Ruffle adapters, but route all virtual, physical, and gamepad sources through stable logical action IDs. React owns the SVG surface and session bridge; classic runtime scripts bind their existing input state machines to that bridge. Versioned layout/profile storage and the editor consume the same schema used by the runtime.

**Tech Stack:** React 18, native SVG, existing Vite runtime, browser Pointer Events, existing `node:test`/VM tests, Chrome CDP smoke verification.

---

## Main-Agent Schedule

1. Complete Chunk 1 tasks in dependency order: Task 1, then Task 2, then Task 3.
   The main agent reviews each handoff, integrates the files, runs tests, and
   commits before opening the next dependency boundary.
2. After the Chunk 1 gate, run Task 5 and Task 9 concurrently. They have
   disjoint file ownership.
3. After Task 5 handoff, run Task 6. Then run Task 7 after Task 6.
4. Run Task 10 only after Tasks 3, 6, and 9 are integrated because the editor
   renders the runtime `KeyboardSurface`. Run Task 11 after all runtime and
   editor work is integrated.
5. Implementation workers never stage or commit in the shared worktree. The
   main agent owns integration, shared-file edits, serial commits, tests,
   verifier runs, and PR delivery. Any conditional `loadScript.js` or
   `apps/web/package.json` edits are owned only by the main agent after
   confirming they are required; workers must return that need as a handoff
    note instead of editing those shared files.

## File Map

Create:
- `apps/web/src/runtime/keyboard/actions.js` — canonical action catalog, Flash key payloads, platform code maps, and legacy alias migration.
- `apps/web/src/runtime/keyboard/storage.js` — versioned global layout/profile/theme persistence and atomic record updates.
- `apps/web/src/runtime/keyboard/profiles.js` — built-in layouts, themes, profile precedence, normalization, and validation.
- `apps/web/src/runtime/keyboard/KeyboardSession.js` — per-runtime session bridge registry, readiness timeout, surface registration, pressed-state subscription, and invalidation.
- `apps/web/src/runtime/keyboard/KeyboardSurface.jsx` — shared SVG runtime surface and pointer bridge integration.
- `apps/web/src/runtime/keyboard/KeyboardTestPage.jsx` — dedicated browser harness for runtime keyboard assertions with fake session sinks.
- `apps/web/src/runtime/keyboard/KeyboardEditor.jsx` — SVG-only layout editor.
- `apps/web/src/runtime/keyboard/editor-model.js` — editor selection, geometry operations, z-order, and validation.
- `runtime/j2me/keyboard-actions.js` — thin classic-script facade installer that receives the ESM catalog from the per-session bridge without duplicating catalog data.
- `runtime/j2me/keyboard-actions.test.mjs` — classic action-map and migration tests.
- `apps/web/src/runtime/keyboard/actions.test.mjs` — canonical catalog, Flash payload inventory, and legacy alias tests.
- `apps/web/src/runtime/keyboard/storage.test.mjs` — versioned storage envelope, atomic writes, backup, malformed-record, and cancel tests.
- `apps/web/src/runtime/keyboard/FlashKeyboardAdapter.test.mjs` — exact Flash key/code payload and lifecycle tests.
- `apps/web/src/runtime/keyboard/profiles.test.mjs` — preset, profile precedence, validation, and persistence-shape tests.
- `apps/web/src/runtime/keyboard/KeyboardSession.test.mjs` — bridge readiness, timeout, stale registration, and teardown tests.
- `apps/web/src/runtime/keyboard/editor-model.test.mjs` — SVG editor geometry and keyboard-operation tests.
- `runtime/j2me/touchpad.test.mjs` — pointer surface, SVG hit geometry, diagonal ownership, slide, capture, and release tests.
- `runtime/j2me/touch-layout.test.mjs` — legacy touch-layout normalization and migration regression tests.
- `runtime/j2me/keypad-adapters.test.mjs` — VM integration tests for the actual J2ME/MRP adapter scripts with fake MIDP and `c_event` sinks.
- `apps/web/src/runtime/keyboard/FlashKeyboardAdapter.js` — Ruffle action to key/code event adapter.

Modify:
- `apps/web/src/runtime/PhoneMarkup.jsx` — render the shared SVG surface in the runtime stage; remove keypad HTML buttons and keypad Canvas.
- `apps/web/src/runtime/J2MEPlayer.jsx` — create a fresh keyboard session before loading classic scripts and await surface readiness.
- `apps/web/src/runtime/MrpPlayer.jsx` — use the same session startup/teardown contract.
- `apps/web/src/runtime/FlashPlayer.jsx` — mount the SVG keyboard and route logical actions to Ruffle key/code events.
- `apps/web/src/runtime/FlashControls.jsx` — replace HTML-button implementation with the shared SVG surface or remove the obsolete component.
- `apps/web/src/main.jsx` — render the dedicated keyboard browser harness when `?keyboard-test=1` is present.
- `apps/web/src/runtime/cleanup.js` — invalidate keyboard sessions and remove stale bridge state before runtime unmount.
- `apps/web/src/runtime/InputMappingPopup.jsx` — expose physical-key mapping and keyboard profile/editor entry points without rendering keyboard HTML controls.
- `runtime/j2me/touchpad.js` — accept an SVG surface, use SVG key geometry/IDs, publish pressed control IDs, and preserve multi-touch, sliding, D-pad, repeat, haptics, and lifecycle release.
- `runtime/j2me/keymap.js` — bind canonical actions and surface bridge instead of DOM button lookup; preserve J2ME frame synchronization.
- `runtime/mrp/mrp-runtime.js` — bind canonical actions and surface bridge instead of DOM button lookup; preserve `c_event`.
- `runtime/j2me/input-mapping.js` — ignore editor-subtree keyboard events, use canonical action IDs, migrate legacy physical bindings, and preserve gamepad behavior.
- `runtime/j2me/touch-layout.js` — migrate legacy touch-layout records into profile overrides and stop mutating DOM key order.
- `apps/web/src/runtime/loadScript.js` — expose session-specific readiness only if startup plumbing requires a loader hook.
- `apps/web/verify.mjs` — add runtime keyboard inventory, orientation, SVG pass-through, input balance, and re-entry checks.
- `apps/web/package.json` — add only test scripts if needed; do not add Konva or another drawing dependency.
- `runtime/j2me/style/main.css` — remove keypad button/canvas painting rules and add only SVG host/layout rules.
- `apps/web/src/mobile-ui.css` — style the editor host and runtime status without HTML keyboard controls.
- `runtime/j2me/input-mapping.test.mjs` — router ownership, editor isolation, duplicate keydown, shared sources, and centralized repeat tests.

Delete after replacement:
- `runtime/j2me/keypad-canvas.js` — no longer loaded or needed once SVG owns runtime keypad rendering.

---

## Chunk 1: Schema, Persistence, and Input Core

**Ownership and scheduling:** Task 1 owns `actions.js`, the classic facade,
and action tests. Task 2 runs after Task 1 publishes its catalog API and owns
storage/profile modules plus `touch-layout.js` tests. Task 3 runs after Tasks 1
and 2 hand off; it owns `input-mapping.js`, `input-mapping.test.mjs`,
`touchpad.js`, and `touchpad.test.mjs`. No two workers edit the same file
concurrently. Workers return changes in the shared task worktree without
staging or committing; the main agent reviews, stages, and commits serially.

### Task 1: Define the canonical action catalog

**Files:**
- Create: `apps/web/src/runtime/keyboard/actions.js`
- Create: `runtime/j2me/keyboard-actions.js`
- Test: `apps/web/src/runtime/keyboard/actions.test.mjs`
- Test: `runtime/j2me/keyboard-actions.test.mjs`

- [ ] **Step 1: Write failing catalog and platform-map tests**

  Cover the existing IDs `up`, `down`, `left`, `right`, `ok`, `choice`, `back`,
  `ret`, `clear`, `num0`-`num9`, `star`, and `pound`. Assert exact J2ME and MRP
  codes, `back`/`ret` distinction, unsupported-action handling, and the
  explicit Flash `key`/`code` pair for the full built-in set: A-Z, 0-9, Space,
  arrows, Enter, Backspace, Tab, Escape, Delete, F1-F12, ShiftLeft,
  ControlLeft, AltLeft, and every listed punctuation code. Cover
  `custom:<stable-id>` records storing both values.

- [ ] **Step 2: Run the focused tests and verify failure**

  Run:
  `node --test apps/web/src/runtime/keyboard/actions.test.mjs runtime/j2me/keyboard-actions.test.mjs`

  Expected: FAIL because the canonical action modules do not exist.

- [ ] **Step 3: Implement catalog and classic facade**

  Export normalized action records, Flash payload records, J2ME/MRP code maps,
  platform support checks, and source-aware migration:
  `touchLayout.back -> back`, `config.keymap.back -> ret`,
  `soft-right -> back`, `soft-left -> choice`, `confirm -> ok`, and
  `digit-N -> numN`. The classic facade exports an installer that accepts the
  ESM catalog object from `KeyboardSession`; it contains no copied maps. The
  bridge exposes it as `window.__XIAOCHAO_KEYBOARD_SESSION__.actions` before
  classic scripts bind. J2ME/MRP script lists load the facade after bridge
  readiness and before their input adapters. Unknown physical bindings remain
  records as `{ control, actionId: null, active: false }`; the mapping UI shows
  inactive entries and allows reassignment.

- [ ] **Step 4: Run focused tests**

  Run the same `node --test` command.

  Expected: PASS, including exact adapter maps and migration cases.

- [ ] **Step 5: Handoff**

  Return the tested files to the main agent. Workers do not stage or commit.

### Task 2: Add versioned layout/profile/theme storage

**Files:**
- Create: `apps/web/src/runtime/keyboard/storage.js`
- Create: `apps/web/src/runtime/keyboard/storage.test.mjs`
- Create: `apps/web/src/runtime/keyboard/profiles.js`
- Test: `apps/web/src/runtime/keyboard/profiles.test.mjs`
- Modify: `runtime/j2me/touch-layout.js`
- Test: `runtime/j2me/touch-layout.test.mjs`

- [ ] **Step 1: Write failing schema and precedence tests**

  Test normalized controls, finite positive geometry, immutable built-ins, the
  exact three default routing rows, at least three themes, explicit profile
  precedence over migrated per-game overrides, clear operations, malformed
  record fallback, atomic save/cancel, and legacy number/D-pad/side/action
  migration. Assert the exact migration result:
  `perGameOverrides[gameId][runtime] = { layoutId, controlOverrides }`, where
  `controlOverrides` stores D-pad rotation, side group, number-slot order, and
  slot-to-action IDs. Assert backup records preserve the untouched source and
  unsupported fields.

- [ ] **Step 2: Run focused tests and verify failure**

  Run:
  `node --test apps/web/src/runtime/keyboard/storage.test.mjs apps/web/src/runtime/keyboard/profiles.test.mjs runtime/j2me/touch-layout.test.mjs`

  Expected: FAIL for the new schema and profile APIs while existing legacy
  touch-layout tests remain the compatibility baseline.

- [ ] **Step 3: Implement schema, presets, themes, and storage**

  Export `loadKeyboardConfig(storage)` and `saveKeyboardConfig(next, storage)`
  using one JSON envelope at `xiaochao.keyboard.v1`; a validated
  `localStorage.setItem` replaces the envelope atomically. Isolate malformed
  records, preserve unrelated valid records, and store backups under
  `migrationBackups`. Define normalized full-stage coordinates, shape kinds,
  z-order, immutable built-in records, classic/high-contrast/light themes, and
  atomic updates. Include the 72-key, landscape split, and portrait D-pad
  layouts.

- [ ] **Step 4: Adapt legacy TouchLayout**

  Make `TouchLayout` normalize old per-game records into
  `perGameOverrides[gameId][runtime] = { layoutId, controlOverrides }` without
  mutating DOM order. Keep the original record until the new envelope write
  succeeds. Expose a compatibility adapter and dispatch
  `xiaochao:keyboardprofilechange` with runtime/profile detail. The later
  session bridge subscribes to this event; this chunk does not depend on
  `KeyboardSession`.

- [ ] **Step 5: Verify migration fixtures**

  Cover D-pad rotation, side selection, twelve number-slot orders, every
  action slot, invalid individual fields, and malformed records. Assert the
  exact normalized override, untouched backup, and that the source is not
  overwritten until the versioned envelope write succeeds.

- [ ] **Step 6: Run focused tests**

  Run the commands from Step 2 and confirm all old and new tests pass.

- [ ] **Step 7: Handoff**

  Return the tested files to the main agent. Workers do not stage or commit.

### Task 3: Implement the source-aware action router

**Files:**
- Modify: `runtime/j2me/input-mapping.js`
- Modify: `runtime/j2me/touchpad.js`
- Modify: `runtime/j2me/input-mapping.test.mjs`
- Create: `runtime/j2me/touchpad.test.mjs`

- [ ] **Step 1: Write failing source-routing tests**

  Cover duplicate keydown suppression, two physical keys mapped to one action,
  pointer/action ownership for diagonal D-pad presses, pointer slide release
  then press, action-level repeat while any source remains held, and complete
  release on blur/visibility/profile change. Execute the actual classic script
  in a VM harness with fake SVG surface/key nodes implementing
  `addEventListener`, `getBoundingClientRect`, `setPointerCapture`, and
  `releasePointerCapture`.

- [ ] **Step 2: Run focused tests and verify failure**

  Run:
  `node --test runtime/j2me/input-mapping.test.mjs runtime/j2me/touchpad.test.mjs`

  Expected: FAIL for source identity and router behavior not yet implemented.

- [ ] **Step 3: Implement router and Touchpad surface contract**

  `InputMapping` alone owns source IDs, per-action reference counts, and repeat
  timers through `press(sourceId, actionId, meta)`,
  `release(sourceId, actionId, meta)`, and `repeat(actionId)`. `Touchpad` owns
  gesture interpretation and emits source edges; it must not maintain a second
  holder count or repeat timer. Pointer source IDs are
  `pointer:<pointerId>:<actionId>`. Change `Touchpad.bind` to accept
  `{ surface, actionMap, input, onPressedChange, ... }`. Resolve SVG control
  IDs and live SVG bounds; key groups use `data-control-id` and z-order, while
  D-pad radial regions use the D-pad group bounds and existing thresholds.
  Preserve center modes, diagonal behavior, haptics, pointer capture, and
  emergency release.

- [ ] **Step 4: Run focused tests and syntax checks**

  Run:
  `node --test runtime/j2me/input-mapping.test.mjs runtime/j2me/touchpad.test.mjs`
  `node --check runtime/j2me/touchpad.js`
  `node --check runtime/j2me/input-mapping.js`

  Expected: PASS.

- [ ] **Step 5: Handoff**

  Return the tested files to the main agent. Workers do not stage or commit.

### Task 4: Verify Chunk 1 gate

- [ ] Run:
  `node --test apps/web/src/runtime/keyboard/*.test.mjs runtime/j2me/*test.mjs`
- [ ] Run:
  `git diff --check`
- [ ] Confirm schema, migration/backup, source ref-count, duplicate keydown,
  pointer slide, repeat, platform maps, unknown binding retention, and both
  `back` migration meanings pass before starting Chunk 2.

## Chunk 2: SVG Runtime Surface and Runtime Adapters

**Ownership and scheduling:** Task 5 owns `KeyboardSession.js`,
`KeyboardSession.test.mjs`, and player session creation/cleanup. Task 6 starts
only after Task 5 handoff and owns `PhoneMarkup.jsx`, `KeyboardSurface.jsx`,
J2ME/MRP classic adapters, `keypad-adapters.test.mjs`, keypad CSS, and verifier
runtime-surface assertions.
Task 7 starts only after Task 6 and owns Flash player/adapter files plus its own
`FlashKeyboardAdapter.test.mjs`. The main agent alone edits shared player
session files during integration and performs serialized commits. Tasks 5 and
9 may run concurrently after Chunk 1 because their source/test file ownership
does not overlap.

### Task 5: Implement session-scoped keyboard bridge

**Files:**
- Create: `apps/web/src/runtime/keyboard/KeyboardSession.js`
- Create: `apps/web/src/runtime/keyboard/KeyboardSession.test.mjs`
- Modify: `apps/web/src/runtime/J2MEPlayer.jsx`
- Modify: `apps/web/src/runtime/MrpPlayer.jsx`
- Modify: `apps/web/src/runtime/cleanup.js`

- [ ] **Step 1: Write failing bridge lifecycle tests**

  Test fresh registry per runtime session, registration before bind,
  three-second bounded readiness, timeout cleanup, late registration
  rejection/disabled surface, teardown invalidation, and late callback
  isolation from a new session.

- [ ] **Step 2: Run focused tests and verify failure**

  `node --test apps/web/src/runtime/keyboard/KeyboardSession.test.mjs`

  Expected: FAIL because the session bridge does not exist.

- [ ] **Step 3: Implement the bridge**

  Provide `createKeyboardSession`, `registerSurface`, `getSurface`,
  `getProfile`, `subscribePressed`, `subscribeProfile`, `releaseAll`,
  readiness timeout, unregister, and invalidation. Ensure late registration is
  rejected and a new runtime session cannot observe an old SVG root.

- [ ] **Step 4: Wire J2ME/MRP startup and cleanup**

  Create the session with a lazy `useState(() => createKeyboardSession(...))`
  initializer before the first player render; do not create it in `useEffect`.
  Pass its ID to `PhoneMarkup`. Child layout effects register the SVG before
  the player's passive effect starts script loading. Await readiness, then
  load the classic action facade before `keymap.js` or `mrp-runtime.js`. If the
  three-second wait expires, continue emulator startup with physical input,
  skip virtual adapter binding, and report the keypad-unavailable status.
  Invalidate/release before React unmount.

- [ ] **Step 5: Run bridge tests and handoff**

  `node --test apps/web/src/runtime/keyboard/KeyboardSession.test.mjs`

  Expected: PASS.

  Return bridge and player startup files to the main agent. Workers do not
  stage or commit; Task 6 owns `PhoneMarkup.jsx`.

### Task 6: Build the shared SVG runtime keyboard

**Files:**
- Create: `apps/web/src/runtime/keyboard/KeyboardSurface.jsx`
- Create: `apps/web/src/runtime/keyboard/KeyboardTestPage.jsx`
- Create: `runtime/j2me/keypad-adapters.test.mjs`
- Modify: `apps/web/src/runtime/PhoneMarkup.jsx`
- Modify: `apps/web/src/main.jsx`
- Modify: `runtime/j2me/keymap.js`
- Modify: `runtime/mrp/mrp-runtime.js`
- Modify: `runtime/j2me/style/main.css`
- Delete: `runtime/j2me/keypad-canvas.js`
- Modify: `apps/web/verify.mjs`
- Create: `apps/web/src/runtime/keyboard/KeyboardTestPage.jsx`

- [ ] **Step 1: Add a browser test harness**

  Render `KeyboardSurface` with a fake session/sink on a dedicated
  `?keyboard-test=1` test route. Use the existing Chrome CDP verifier rather
  than adding a React test dependency. Add assertions for no keypad HTML
  controls/Canvas/`foreignObject`, stable SVG IDs, exact 72-key count, theme,
  full-stage geometry, unsupported-action visibility, and empty-stage
  pass-through.

- [ ] **Step 2: Implement the shared SVG surface**

  Render one stage-sized SVG with key groups in z-order, labels, focus
  semantics, token-based themes, pressed/focused states, and platform action
  support. Set root `pointer-events: none`; opt only visible key nodes into
  pointer events. Subscribe to bridge pressed/profile updates without a
  permanent animation loop.
  The session ID and bridge are passed as component props from `PhoneMarkup`;
  the surface never performs a global stale-session lookup.

- [ ] **Step 3: Rebind J2ME and MRP adapters**

  Replace DOM button lookup and `.down`/`.tap` mutation with control/action
  bridge callbacks. Preserve Java frame synchronization and MRP `c_event`,
  existing key overrides, TouchLayout action mapping, focus restoration, and
  cleanup hooks.
  Each classic adapter reads the action catalog and surface only from the
  session bridge installed before its script loads. On profile change, the
  bridge first calls `input.releaseAll()`, updates the profile, then the
  existing controller reads the new SVG group bounds; it does not attach a
  second listener set. Add `keypad-adapters.test.mjs` coverage that evaluates
  actual J2ME/MRP adapter scripts in isolated VM contexts with a fake bridge,
  MIDP frame queue, `Module._c_event`, and touch-layout adapter. Assert exact
  platform codes for representative presses/releases and release-all behavior.

- [ ] **Step 4: Remove obsolete keypad painting**

  Remove keypad Canvas script loading, old button markup, icon imports, and
  keypad-only CSS painting/mask rules. Keep phone display Canvas, editor
  inputs, dialogs, panels, and non-keyboard DOM unchanged.

- [ ] **Step 5: Run syntax/build checks**

  Run:
  `node --check runtime/j2me/keymap.js`
  `node --check runtime/mrp/mrp-runtime.js`
  `node --test runtime/j2me/keypad-adapters.test.mjs`
  `pnpm --filter @xiaochao/web build`
  Start the web app and run `node apps/web/verify.mjs --keyboard-only` against
  the dedicated harness route; the verifier must fail if the test route does
  not report its assertions.

  Expected: PASS; build must not reference `keypad-canvas.js` or keypad HTML
  button selectors.

- [ ] **Step 6: Handoff to main agent**

  Main agent reviews integration, owns shared player files, stages and commits.

### Task 7: Replace Flash controls with the shared action adapter

**Files:**
- Modify: `apps/web/src/runtime/FlashPlayer.jsx`
- Modify: `apps/web/src/runtime/FlashControls.jsx`
- Create: `apps/web/src/runtime/keyboard/FlashKeyboardAdapter.js`
- Create: `apps/web/src/runtime/keyboard/FlashKeyboardAdapter.test.mjs`

- [ ] **Step 1: Write failing Flash adapter tests**

  Assert exact paired keydown/keyup `key` and `code` payloads for the complete
  Flash built-in key set and custom Flash records. Assert multi-pointer
  ref-counting and blur/fullscreen/runtime release using a fake Ruffle target
  that records dispatched events.

- [ ] **Step 2: Implement the adapter**

  Route logical actions to the active Ruffle player using catalog-stored
  `key`/`code` pairs. Keep repeat disabled unless the Flash profile enables it,
  and release all active events on target change or cleanup.

- [ ] **Step 3: Mount the shared SVG surface**

  Remove the HTML Flash button tree and render the same `KeyboardSurface` with
  the Flash QWERTY profile in portrait and landscape. Ensure the player remains
  focusable and empty SVG space does not block Ruffle pointer interaction.

- [ ] **Step 4: Run tests/build and handoff**

  Run:
  `node --test apps/web/src/runtime/keyboard/FlashKeyboardAdapter.test.mjs`
  `pnpm --filter @xiaochao/web build`

  Expected: PASS.

  Handoff files to the main agent for integration and serialized commit.

### Task 8: Verify Chunk 2 gate

- [ ] Run:
  `pnpm --filter @xiaochao/web build`
- [ ] Run:
  `node --test apps/web/src/runtime/keyboard/KeyboardSession.test.mjs apps/web/src/runtime/keyboard/FlashKeyboardAdapter.test.mjs runtime/j2me/input-mapping.test.mjs runtime/j2me/touchpad.test.mjs runtime/j2me/keypad-adapters.test.mjs`
- [ ] Run the dedicated browser harness:
  `node apps/web/verify.mjs --keyboard-only`
- [ ] Run `git diff --check`.
- [ ] Run the browser verifier with available fixtures:
  `node apps/web/verify.mjs`
- [ ] VM adapter integration tests are mandatory even when emulator fixtures
  are unavailable; fixture-backed browser verification adds evidence but does
  not replace them.
- [ ] Confirm 72-key inventory, orientation routing, SVG pass-through,
  pointer cancellation, adapter down/up balance, session recreation, late
  bridge rejection, and Flash key/code payload assertions pass.

## Chunk 3: SVG-Only Editor, Persistence UI, and Delivery Verification

### Task 9: Implement editor model and validation

**Files:**
- Create: `apps/web/src/runtime/keyboard/editor-model.js`
- Create: `apps/web/src/runtime/keyboard/editor-model.test.mjs`

This task may run concurrently with Task 5 after Chunk 1. It owns only the two
editor-model files and does not edit profile/schema files.

- [ ] **Step 1: Write failing editor-model tests**

  Cover clone-built-in immutability, add/hide controls, drag/resize in
  normalized coordinates, z-order changes, action reassignment, finite/positive
  geometry, out-of-stage save rejection, overlap/small-target warnings, keys
  obscured by the emulator display, keys crossing the safe-area boundary,
  explicit profile assignment clearing, migrated per-game override clearing,
  and generated names.

- [ ] **Step 2: Implement pure editor operations**

  Keep editor state independent from runtime input. Return immutable layout
  records, deterministic selection/focus order, validation diagnostics, and
  atomic save candidates. Do not dispatch emulator actions.

- [ ] **Step 3: Run tests and handoff**

  `node --test apps/web/src/runtime/keyboard/editor-model.test.mjs`

  Expected: PASS.

  Return the model and tests to the main agent. Workers do not stage or commit.

### Task 10: Render the SVG-only keyboard editor

**Files:**
- Create: `apps/web/src/runtime/keyboard/KeyboardEditor.jsx`
- Modify: `apps/web/src/runtime/InputMappingPopup.jsx`
- Modify: `apps/web/src/mobile-ui.css`
- Modify: `runtime/j2me/input-mapping.js`

Task 10 runs only after Tasks 3, 6, and 9. The main agent owns
`runtime/j2me/input-mapping.js` integration because Task 3 already owns its
router changes; the editor worker owns only `KeyboardEditor.jsx`,
`InputMappingPopup.jsx`, and editor CSS.

- [ ] **Step 1: Implement the SVG editor surface**

  Render stage preview, profile/theme selectors, catalog entries, selection
  handles, geometry steppers, action assignment, z-order commands, validation
  diagnostics, explicit-profile clearing, legacy per-game override clearing,
  and save/discard/restore commands as SVG nodes. Do not use HTML controls,
  `foreignObject`, text inputs, or buttons.

- [ ] **Step 2: Implement focus and keyboard behavior**

  Apply the specified Tab/Shift+Tab order, focus rings, Enter/Space command
  activation, arrow movement, modifier-arrow resize, and editor subtree event
  suppression. Entering edit mode releases runtime sources; leaving restores
  normal routing.

- [ ] **Step 3: Connect persistence**

  Load global layouts/profiles/themes, clone immutable presets, save atomic
  custom records, discard without mutation, restore defaults, and surface
  malformed-record reset diagnostics. Persist profile-assignment clearing and
  per-game override clearing independently; verify clearing a migrated
  override does not delete its reusable global layout. Keep generated names.

- [ ] **Step 4: Run editor tests/build and handoff**

  Run:
  `node --test apps/web/src/runtime/keyboard/editor-model.test.mjs`
  `pnpm --filter @xiaochao/web build`

  Expected: PASS. Rendered-editor event-isolation and focus behavior are
  verified in Task 11's browser checks.

  Return the editor files to the main agent. Workers do not stage or commit.

### Task 11: Add browser smoke coverage and delivery checks

**Files:**
- Modify: `apps/web/verify.mjs`
- Modify: `docs/superpowers/specs/2026-11-21-svg-keypad-design.md` only if verification discovers a required clarification.

- [ ] **Step 1: Add verifier assertions**

  Add checks for no keyboard HTML controls/Canvas, SVG key inventory and
  labels, profile switching, theme switching, portrait/landscape defaults,
  editor isolation, save/discard/reload, pointer press/release balance, and
  J2ME/MRP/Flash teardown and re-entry. Scope markup checks to the runtime
  keyboard and editor subtrees; assert they contain no HTML controls,
  `foreignObject`, or embedded HTML. Do not reject unrelated application DOM.
  Verify editor Tab/Shift+Tab focus order, focus rings and accessible labels,
  Enter/Space activation, restore-defaults, and that navigation, selection,
  geometry changes, save, discard, and restore never dispatch game input.
  Verify profile assignment clearing returns to automatic routing, migrated
  per-game override clearing reveals the explicit assignment/default, and both
  remain cleared after reload. Verify emulator-display obstruction and
  safe-area-boundary warnings independently appear for affected controls and
  disappear after moving each control clear of the respective region.

- [ ] **Step 2: Run available verification**

  Start both dev services in the task worktree with:
  `pnpm dev`

  Wait for server `http://127.0.0.1:8080` and Vite `http://127.0.0.1:5173`.
  Run the harness against Vite:
  `VERIFY_BASE_URL=http://127.0.0.1:5173/ node apps/web/verify.mjs --keyboard-only`

  Then run the full smoke suite against the same base URL:
  `VERIFY_BASE_URL=http://127.0.0.1:5173/ node apps/web/verify.mjs`

  With fixtures available, also run:
  `VERIFY_J2ME_FILE=<jar> VERIFY_MRP_FILE=<mrp> node apps/web/verify.mjs`.

- [ ] **Step 3: Run final checks**

  Run:
  `pnpm --filter @xiaochao/web build`
  `node --test apps/web/src/runtime/keyboard/*.test.mjs runtime/j2me/*test.mjs`
  `git diff --check`
  `git status --short --branch`

  Expected: build, all tests, verifier checks, and diff checks pass. Record
  unavailable real-device/WebView and screen-reader verification explicitly.

- [ ] **Step 4: Handoff verification changes**

  Return verifier changes to the main agent for review and serialized commit.

### Task 12: Prepare PR delivery

- [ ] Review `git diff origin/main...HEAD` for unrelated changes and generated
  artifacts.
- [ ] Run `git status --short --branch` and confirm only intended source,
  tests, and docs are present.
- [ ] Search existing GitHub PRs through GitHub MCP to avoid creating a
  duplicate, then locate and follow the repository PR template.
- [ ] Push `feat/svg-keypad` and create one PR through GitHub MCP.
- [ ] Verify the PR title, body, source branch, target branch, and linked
  validation evidence through GitHub MCP.
