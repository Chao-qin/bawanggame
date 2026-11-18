# Review Report

## Context

- PR: Not created
- Base SHA: `e92e76bd66190d33a13f96206d18917f48fb62cf`
- Head SHA: `031c8836e6d0ba694d70847daad5d0efd70a7b6c`
- Reviewer model: `gpt-6-luna`
- Reasoning: `low`
- Context budget: `300k`
- Review round: `R2`
- Review pass: `diff`

## Findings

### [P2] Canvas arrows ignore configured D-pad action mapping — runtime/j2me/keypad-canvas.js:130

Trigger -> `TouchLayout.apply()` can select `mirror`, `rotate-cw`, or `rotate-ccw`, and `keymap.js` passes `TouchLayout.visualDpad` into `Touchpad.bind`; a pointer in the DOM `up`/`right`/`down`/`left` slot is consequently delivered as the mapped action. The Canvas path `drawDpad()` calls `drawArrow(item, id, ...)`, and `drawArrow()` chooses the glyph solely from the slot `id`, without calling `TouchLayout.visualDpad(id, config.touchLayout)`. In the mirror and rotated presets the visible arrow therefore points to a different action than the hit target sends (for example, the `right` slot sends `left` while still displaying a right arrow). This makes the configurable keypad misleading and can cause wrong directional input during play.

Fix: resolve each slot's semantic action through the same `TouchLayout.visualDpad` mapping used by `Touchpad`/`keymap` before selecting the arrow glyph, with a standard-layout fallback when the mapping module is unavailable. Add or run a browser check for all four presets that compares each rendered slot's arrow direction with the action delivered by its hit path.

## Verification

- Commands: `git diff --find-renames origin/main...HEAD`; `git diff --check origin/main...HEAD`; inspected `runtime/j2me/keypad-canvas.js`, `runtime/j2me/touch-layout.js`, `runtime/j2me/touchpad.js`, and `runtime/j2me/keymap.js` call paths.
- Device/runtime: Static cold-start diff review; no Android runtime or physical device available in this pass.
- Result: `fix_required` due to the P2 mapping/rendering mismatch above.

## Residual Risk

- Unverified: Android APK build/install/launch, WebView fullscreen behavior, native vibration timing, and physical-device motor strength.
- The existing R1 browser evidence covers geometry and bridge delivery, but does not establish Canvas arrow semantics for non-standard D-pad presets.

## Decision

- `fix_required`
