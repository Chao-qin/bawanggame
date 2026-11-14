# Virtual Key Input Latency Fix

## Goal

Make virtual keypad input follow normal physical-key semantics: a press takes
effect at pointer/keyboard activation, a held key remains pressed, and release
does not introduce an artificial timer delay. Preserve the J2ME requirement
that a short tap exposes both edges to the game and preserve MRP press/release
events.

## Scope

- `runtime/j2me/keymap.js`: remove timer-based fallback from the normal input
  path, dispatch the first edge immediately, and keep only the minimum
  frame-boundary coordination needed for a press/release pair.
- `runtime/j2me/touchpad.js`: make pointer capture explicit, keep active keys
  stable while a pointer is held, and stop rejecting valid touches in the
  outer d-pad guard band.
- `runtime/j2me/touchpad.js` and `runtime/j2me/keymap.js`: carry an optional
  `sourceAt` timestamp captured at the original `pointerdown` through the sink
  edge. Extend `KeyTrace.edges()` entries with optional `sourceAt`,
  `deliveredAt`, and `latencyMs` fields. `deliveredAt` is recorded immediately
  around the corresponding MIDP send call. This measures the complete
  pointerdown-to-delivery path without changing existing `t`, `f`, `c`, or `k`
  fields.

## Preserved Behavior

- Existing physical and touch key mappings remain unchanged.
- Multi-pointer edge de-duplication, sliding between d-pad directions,
  configurable repeat, vibration, and blur/visibility release remain active.
- Settings inputs and runtime text editors remain outside keypad handling.

## Design

The touchpad sends `press` on the activation event and `release` on the
corresponding end event. The J2ME adapter calls `MIDP.sendKeyPress` directly
for a new pressed state. A release that arrives before the game has had a
chance to sample the press is deferred only until the next observed
`MIDP.frames` change, using the existing frame setter hook in `keymap.js`; it
is never delayed by a fixed 60ms fallback during normal play. If no frame
arrives, the queued release is flushed by `releaseAll()` on `blur`,
`visibilitychange` (when hidden), or `pagehide`, by runtime teardown, and by a
release-only watchdog after the measured frame interval budget. The watchdog
is a liveness escape for a stalled visible runtime and never runs for a normal
press. This prevents an inactive runtime from holding a logical key forever
while preserving a one-frame tap window during normal play. MRP continues to
receive its native press/release pair immediately.

Pointer capture keeps the original keypad pointer associated with its active
key even when the finger leaves the element during a slide. D-pad hit testing
uses the visible circle and direction thresholds without an outer rejection
band that turns edge presses into no-ops.

## Acceptance

1. A pointerdown on every visible keypad key produces a press trace in the
   same task, without waiting for a timer or animation frame.
2. A short tap produces one press and one release; the J2ME game observes the
   press for at least one frame.
3. Holding a key keeps it down and repeat starts only after `repeatDelay`.
4. Moving between d-pad directions releases the old direction and presses the
   new direction without a stuck key.
5. Pointer cancellation, blur, visibility change, and pagehide release all
   active keys.
6. For at least 100 taps per runtime on desktop Chrome and Android WebView,
   pointerdown-to-`sendKeyPress` p95 is <= 16 ms, with no sample above 50 ms;
   report device/runtime, test duration, average frame interval/FPS, p95, and
   abnormal-frame count. Real-device touch results are reported separately
   from desktop emulation; an unavailable platform is marked unverified.
7. MRP receives exactly one native press and one native release for a short
   tap, and one release on cancellation/blur for a held key.

## Verification

- `git diff --check`
- `node --check runtime/j2me/touchpad.js`
- `node --check runtime/j2me/keymap.js`
- `pnpm --filter @xiaochao/web build`
- Browser/WebView smoke probe using `KeyTrace` for pointerdown-to-press and
  press-to-release timing on J2ME and MRP keypads, including the metric report
  required by acceptance item 6.
- MRP native event trace for short tap, hold/release, and blur cancellation.
