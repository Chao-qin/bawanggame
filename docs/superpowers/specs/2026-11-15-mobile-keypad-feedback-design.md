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
  landscape, and orientation transition. Direction arrows match the action
  mapping for all four `TouchLayout` presets; the direction-pad and soft-key
  hit rectangles do not overlap and keep at least `0.2 * --u` clearance where
  they are adjacent. Numeric pressed-state pixels remain inside the idle key
  bounds, with no extra DOM outline. The stage keeps full viewport height when
  the toolbar expands or collapses. A collapsed landscape toolbar retains the
  existing 56px safe-area column on the left so it cannot cover the direction
  pad. Browser bridge stubs
  verify a single default 24 ms request per new coarse-pointer press, no
  repeats while held, and preservation/clamping of explicit values. The 24 ms
  default is for mobile coarse-pointer settings; desktop remains silent by
  default. A given key emits once when its holder count changes from zero to
  one, so an additional finger holding the same key does not emit another
  pulse.
  Web build, JavaScript syntax, mobile typecheck, and mobile web asset staging
  checks pass. Android emulator and physical-device vibration results are
  reported separately; unavailable device checks remain explicit residual
  risks.

## Design

Keep the DOM keypad as the stable hit and accessibility map and keep Canvas as
the only visible keypad renderer. Render positions exclusively from each
control's `getBoundingClientRect()` and derive each arrow's semantic action from
the existing DOM direction slot plus `TouchLayout.visualDpad` mapping. The four
presets (`standard`, `mirror`, `rotate-cw`, `rotate-ccw`) must agree with
`Touchpad`'s geometric hit direction mapping; Canvas must not independently
rotate the layout. Make the smallest targeted spacing and pressed-state changes
in the existing responsive layout. Keep runtime toolbar controls floating over
the stage so toolbar height never reduces the available game height. Preserve
the existing 56px left safe-area column while the toolbar is collapsed in
landscape, including standard and WebKit fullscreen.

Continue to trigger haptics only on the deduplicated transition from no holders
to the first holder for a key. Increase the phone default pulse to 24 ms while
preserving explicit configured durations and the native bridge's bounded
duration contract. Do not emit repeat haptics during key hold or alter key
repeat timing. The React Native WebView host remains the preferred haptic path;
the browser vibration API remains the fallback.

## Failure and Compatibility

The bridge's boolean result only reports whether the WebView message was
accepted for posting: call the browser fallback only when no native bridge is
present, posting returns `false`, or posting throws. Do not retry the fallback
because an asynchronous native acknowledgement is unavailable; this avoids a
possible duplicate pulse. Missing vibration APIs remain harmless.
The UI fix must not modify touch hit testing or game key codes. A browser stub
can prove request delivery and pulse parameters, but it cannot prove physical
motor strength; Android emulator and physical hardware findings must be stated
separately.

## Verification

- Web: build the web package and capture browser screenshots at narrow portrait
  and landscape sizes, then rotate the viewport and re-check positions and
  pressed states. Verify the `0.2 * --u` clearance against live DOM rectangles,
  all four arrow presets against their expected action maps, the pressed-state
  drawing stays within key rectangles, stage height remains the viewport height
  when the toolbar toggles, and collapsed landscape keeps a 56px safe-area
  column at the left without a top inset.
- Touch feedback: dispatch rapid touch presses through the bridge stub and
  assert one request per newly pressed key, no repeated request while held, the
  24 ms default, and explicit duration handling.
- Android: typecheck and stage mobile web assets as required checks. Build,
  install, and launch an APK and verify native motor behavior when Android
  tooling/device access is available; otherwise report APK/device verification
  as uncompleted hardware validation without treating it as a web build pass.
- Review: complete cold-start diff review, feature audit, and WebView/platform
  validation review as required by `AGENTS.md`; document device limitations.
