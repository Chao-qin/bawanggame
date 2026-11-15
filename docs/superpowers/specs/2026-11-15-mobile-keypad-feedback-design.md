# Mobile Keypad Visual and Haptic Feedback Repair

## Goal

Repair the mobile keypad layout and visual regressions shown in the user
screenshots, and make touch haptics perceptible and timely. Deliver the work in
one pull request.

## Task Contract

- **Target behavior:** The direction pad displays arrows that match their hit
  directions and retains the existing keypad visual language. Direction keys
  and adjacent soft keys have clear spacing. Numeric pressed states do not
  introduce a displaced outline. Runtime toolbar and floating controls do not
  reserve space that compresses the game or keypad. Each new touch press emits
  one stronger haptic pulse; holding a key does not repeat haptics.
- **Scope:** Runtime toolbar sizing/placement in `apps/web/src/App.jsx` and
  `runtime/j2me/style/main.css`; Canvas keypad painting in
  `runtime/j2me/keypad-canvas.js`; touch haptic defaults and edge handling in
  `runtime/j2me/touchpad.js` and `runtime/j2me/config/settings.js`; native
  bridge pulse delivery in `apps/mobile/App.tsx` where needed; focused docs and
  verification evidence.
- **Preserve:** Existing DOM hit targets and accessibility semantics, key
  mapping, direction-layout presets, immediate press/release behavior, long
  press and repeat timing, desktop mouse behavior, safe-area handling, toolbar
  actions, and user-configured vibration values.
- **Acceptance:** Browser screenshots and geometry checks cover narrow portrait,
  landscape, and orientation transition; visual checks cover idle and pressed
  direction/numeric/soft keys, toolbar overlay, and control spacing. Browser
  bridge stubs verify a single default 24 ms request per new coarse-pointer
  press, no repeats while held, and preservation/clamping of explicit values.
  Web build, JavaScript syntax, mobile typecheck, and mobile web asset staging
  checks pass. Android emulator and physical-device vibration results are
  reported separately; unavailable device checks remain explicit residual
  risks.

## Design

Keep the DOM keypad as the stable hit and accessibility map and keep Canvas as
the only visible keypad renderer. Derive the visible arrow direction from the
actual layout preset / rendered DOM geometry so visual direction cannot drift
from hit testing. Make the smallest targeted spacing and pressed-state changes
in the existing responsive layout. Keep runtime toolbar controls floating over
the stage, and ensure the measured toolbar height does not become a permanent
layout reservation in fullscreen.

Continue to trigger haptics only on the deduplicated transition from no holders
to the first holder for a key. Increase the phone default pulse to 24 ms while
preserving explicit configured durations and the native bridge's bounded
duration contract. Do not emit repeat haptics during key hold or alter key
repeat timing. The React Native WebView host remains the preferred haptic path;
the browser vibration API remains the fallback.

## Failure and Compatibility

If native haptics are unavailable or the bridge rejects a message, the browser
fallback is attempted where supported. Missing vibration APIs remain harmless.
The UI fix must not modify touch hit testing or game key codes. A browser stub
can prove request delivery and pulse parameters, but it cannot prove physical
motor strength; Android emulator and physical hardware findings must be stated
separately.

## Verification

- Web: build the web package and capture browser screenshots at narrow portrait
  and landscape sizes, then rotate the viewport and re-check positions and
  pressed states.
- Touch feedback: dispatch rapid touch presses through the bridge stub and
  assert one request per newly pressed key, no repeated request while held, the
  24 ms default, and explicit duration handling.
- Android: typecheck and stage mobile web assets; build/install/launch an APK
  and verify the native bridge only when Android tooling is available.
- Review: complete cold-start diff review, feature audit, and WebView/platform
  validation review as required by `AGENTS.md`; document device limitations.
