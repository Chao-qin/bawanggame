# Review Report

## Context

- PR: Not created
- Base SHA: `e92e76bd66190d33a13f96206d18917f48fb62cf`
- Head SHA: `031c8836e6d0ba694d70847daad5d0efd70a7b6c`
- Reviewer model: `gpt-6-luna`
- Reasoning: `low`
- Context budget: `300k`
- Review round: `R2`
- Review pass: `feature-audit`

## Findings

### [P2] Canvas direction arrows ignore the active visual layout — `runtime/j2me/keypad-canvas.js:140`

Trigger: choose the `mirror`, `rotate-cw`, or `rotate-ccw` TouchLayout preset, then enter the runtime and inspect the visible D-pad arrows. User action -> `TouchLayout.visualDpad` maps an action to a DOM slot in `keymap.js`/`touchpad.js` -> `keypad-canvas.js` iterates the physical DOM IDs and calls `drawArrow(item, id, ...)` -> the arrow is oriented from the slot ID alone. The CSS moves that slot to the mapped physical position, but Canvas never converts the slot back to its semantic action. For example, in `mirror`, the right action is delivered by the `left` slot; `drawArrow(..., "left", ...)` paints a left arrow at that right-side slot. The hit rectangle still delivers the correct key code, but the cue tells the user the opposite direction. The same mismatch occurs for both rotated presets, so directional play can be systematically misread even though presses work.

Fix: derive the arrow orientation from the semantic action assigned to each rendered slot (using the inverse of `TouchLayout.visualDpad` for the active preset), or expose the existing action-to-slot mapping to the Canvas renderer. Add a pixel or geometry assertion for all four presets, not only a DOM slot-map assertion.

## Verification

- Commands: Read the current `origin/main...HEAD` diff and traced `PhoneMarkup` DOM slots, `TouchLayout.visualDpad`, CSS preset placement, `keymap.js`/`touchpad.js` hit mapping and holder-edge haptics, Canvas observers/destroy, toolbar/fullscreen CSS, React runtime cleanup, and the native haptic bridge. No source or runtime tests were run by this read-only audit.
- Device/runtime: Static cold-start feature audit; Android tooling and a physical device were unavailable. Existing R1 browser/build evidence was treated as supplied evidence and does not pixel-classify arrow glyphs for each preset.
- Result: `fix_required` for the P2 finding above.

## Residual Risk

- APK build/install/launch, WebView startup, emulator vibration, and physical-device vibration remain unverified because Java and `adb` are unavailable.
- Browser bridge assertions establish request delivery and duration bounds, not physical motor strength or timing.
- Fullscreen behavior was only exercised through the recorded headless failure path; successful standard and WebKit fullscreen transitions require platform verification.

## Decision

- `fix_required`

