# Runtime Rotation and Fullscreen Design

## Goal

Expand the J2ME runtime rotation choices, make the landscape phone shell use a keyboard-screen-keyboard arrangement, and provide a fullscreen game stage that can be constrained by fixed width or fixed height.

## Scope

- Add eight persisted rotation choices: 0, 45, 90, 135, 180, 225, 270, and 315 degrees.
- Preserve directional key semantics for diagonal angles; remap directional input only for quarter-turn angles.
- Use three columns in landscape when the virtual keypad is visible: numeric keypad, game screen, navigation keypad.
- Make fullscreen apply to the runtime stage for J2ME and revival players, with a persisted fit mode (`fixed-width` or `fixed-height`).
- Keep the existing screen size setting (`auto`, `fit`, or manual dimensions) independent from the fullscreen fit mode.

## Design

`Settings` owns the new rotation and fullscreen fit options. The panel exposes both controls and applies them without restarting the game. `ScreenSetup.refit()` remains the single runtime resize entry point; it will account for the rotated bounding box and fullscreen stage constraints. CSS uses custom properties for the rotation angle and layout dimensions so arbitrary quarter/diagonal angles do not require duplicated selectors.

The React player requests fullscreen on the existing user gesture and exposes a small fullscreen control overlay. The overlay changes the stage fit mode and calls `document.exitFullscreen` only when leaving the game. The runtime body receives the selected mode through a data attribute so the legacy keypad and canvas remain inside the same stage in both portrait and landscape.

## Acceptance Criteria

1. Settings show all eight rotation angles and selecting any angle updates the game view immediately.
2. At 90/270 degree viewport orientation with a visible keypad, the order is keypad, game screen, keypad; neither keypad overlaps or pushes the screen out of view.
3. Entering fullscreen from a game fills the available viewport while preserving the complete virtual screen and controls.
4. Fullscreen fit mode can be switched between fixed width and fixed height and remains selected for that game after reload.
5. Existing `auto`, manual screen size, keypad visibility, and non-fullscreen layouts continue to work.

## Verification

- `npm run build --workspace apps/web`
- `node apps/web/verify.mjs` against the local dev server
- Manual browser checks at portrait and landscape viewport sizes for all rotation and fullscreen fit modes.
