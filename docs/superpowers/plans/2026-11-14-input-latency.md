# Virtual Key Input Latency Fix Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make keypad presses reach J2ME and MRP immediately while preserving held-key, repeat, slide, and cleanup semantics.

**Architecture:** Keep `touchpad.js` as the shared pointer gesture state machine. It emits press/release edges immediately and captures active pointers. Keep `keymap.js` as the J2ME delivery adapter, but remove its timer fallback from normal release handling: a press is sent synchronously, and a release waits only for the next observed game frame when required to expose a short tap. MRP remains a direct native event sink.

**Tech Stack:** Browser Pointer Events, classic runtime JavaScript, J2ME MIDP event bridge, Vite/pnpm web build.

---

## Chunk 1: J2ME edge delivery

**Files:**
- Modify: `runtime/j2me/keymap.js:45-245`
- Modify: `runtime/j2me/keymap.js:335-380` if diagnostics need a delivery timestamp

- [ ] **Step 1: Add a focused input timing helper and edge metadata**

  Add an edge metadata argument to the touchpad sink. Capture the mandatory
  `performance.now()` value in `pointerdown`, carry it through `press`/`release`
  and `keymap.js` `enqueue`, then track it beside the per-code queue entry.
  Record `deliveredAt` immediately after the MIDP send call with the same clock;
  missing pointer fields invalidate the probe sample. Keep the existing
  `KeyTrace.edges()` fields compatible and append the timing fields.

- [ ] **Step 2: Change normal press dispatch to synchronous delivery**

  Update `flush`/`kick` so a newly requested pressed state is sent in the same call stack when it has not already changed in the current frame. Do not schedule `fallbackMs()` for this path.

- [ ] **Step 3: Keep only one-frame protection for a short tap**

  When a release follows a press before the next observed `MIDP.frames` change,
  leave the release queued and flush it from `onFrame`. Remove the fixed timer
  fallback from normal presses. Keep a release-only watchdog with budget
  `Math.max(32, Math.min(120, 2 * median(last 9 frame gaps)))`, using 34ms
  before two real gaps exist, for a visible runtime whose frame counter stops;
  cancel it when `onFrame`, `releaseAll`, or teardown flushes the edge.
  Preserve `releaseAll()` as an explicit forced cleanup path.

- [ ] **Step 4: Preserve repeat behavior and physical keyboard behavior**

  Verify `sendKeyRepeat`, physical keydown/keyup, `tapFrames`, and `keyHold` do not make the initial press wait. Keep repeat scheduling based on `repeatDelay` and `repeatInterval` only.

- [ ] **Step 5: Run syntax checks**

  Run `node --check runtime/j2me/keymap.js`.
  Expected: exit 0.

## Chunk 2: Pointer input and hit testing

**Files:**
- Modify: `runtime/j2me/touchpad.js:280-345`

- [ ] **Step 1: Capture active pointers on activation**

  On a recognized `pointerdown`, store the capture target in a
  `captures[pointerId]` map and call `setPointerCapture` on the resolved key
  (or `#keypad`) when supported. Release it from the map and call
  `releasePointerCapture` on `pointerup`/`pointercancel`; retain document-level
  listeners as the fallback when capture APIs are unavailable.

- [ ] **Step 2: Remove the outer d-pad rejection band**

  Keep contact-radius information for diagnostics, but do not return a null hit solely because the point is within the circle edge guard. A point inside the visible d-pad circle must resolve to center or direction according to the existing thresholds.

- [ ] **Step 3: Preserve slide transitions and cleanup**

  Ensure pointer capture does not prevent `pointermove` from changing direction,
  and ensure all captured pointers are released by `clearHold`, `releaseAll`,
  and `destroy`.

- [ ] **Step 4: Run syntax checks**

  Run `node --check runtime/j2me/touchpad.js`.
  Expected: exit 0.

## Chunk 3: Verification and documentation

**Files:**
- Modify: `docs/superpowers/specs/2026-11-14-input-latency-design.md` only if implementation evidence changes the acceptance wording.

- [ ] **Step 1: Run diff hygiene checks**

  Run `git diff --check`.
  Expected: no output and exit 0.

- [ ] **Step 2: Build the web app**

  Run `pnpm --filter @xiaochao/web build`.
  Expected: Vite build succeeds and generated `public/` is treated as an untracked build artifact, not committed.

- [ ] **Step 3: Run a 100-tap latency probe per runtime**

  Start the web server with `pnpm --filter @xiaochao/web dev --host
  127.0.0.1`, open the printed URL, and paste the repository's browser probe
  into DevTools to run 100 scripted taps against a numeric key and 100 against
  a direction in desktop Chrome. Repeat the same probe in Android WebView when
  an emulator/device is available. For each runtime, collect
  `KeyTrace.edges()` and frame samples for at least 10 seconds; calculate
  average frame interval/FPS, p95 `latencyMs`, maximum normal-play latency,
  and abnormal frames (interval > 50 ms). Pass only when p95 <= 16 ms and no
  normal-play sample exceeds 50 ms. Record the exact device/runtime and mark
  unavailable WebView or real-device runs as unverified.

- [ ] **Step 4: Verify MRP native event counts and lifecycle**

  Instrument the existing `cEvent` sink in the browser probe (without changing
  production behavior), then assert one native press and one native release
  for a short tap, one release after hold, and one release after blur or
  pointercancel. Check J2ME `KeyTrace.pending()` is empty after each lifecycle
  case.

- [ ] **Step 5: Record residual risk**

  Report whether Android WebView and a real touch device were tested separately.
  If only desktop emulation is available, state that limitation explicitly.

- [ ] **Step 6: Commit the implementation**

  Run:

  ```bash
  git add runtime/j2me/keymap.js runtime/j2me/touchpad.js docs/superpowers/specs/2026-11-14-input-latency-design.md docs/superpowers/plans/2026-11-14-input-latency.md
  git commit -m "fix: reduce virtual keypad input latency"
  ```
