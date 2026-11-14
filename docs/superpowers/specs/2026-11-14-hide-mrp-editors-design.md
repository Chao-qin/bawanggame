# Hide Unused MRP Editor Controls

## Goal

Remove the white browser input boxes that appear above the MRP game screen.

## Cause

`PhoneMarkup` includes six legacy J2ME text editor bridge elements. J2ME loads `lcdui.css`, which keeps them hidden until a real editor is shown. MRP loads only the shared phone shell stylesheet, so those elements fall back to browser default input rendering.

## Design

Scope a rule to `.mrp-stage #editor-layer` and move the unused bridge layer outside the viewport with zero visual and pointer impact. MRP text entry continues through its own `#mrp-dialog-text` textarea, so this rule does not affect dialogs or the game canvas. J2ME remains unchanged because its editor layer is not inside `.mrp-stage`.

## Acceptance

1. MRP screens contain no visible white editor boxes above the canvas.
2. MRP edit dialogs still show and accept text in `#mrp-dialog-text`.
3. J2ME text editor behavior is unchanged.

## Verification

- `corepack pnpm --filter @xiaochao/web build`
- `git diff --check`
- Browser computed-style probe for the MRP editor layer and dialog textarea.
