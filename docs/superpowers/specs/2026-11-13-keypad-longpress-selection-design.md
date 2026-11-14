# Keypad Long Press Selection Fix

## Goal

Prevent a long press on the virtual keypad from activating browser text selection or drag selection.

## Design

The shared virtual keypad gesture binder will handle `selectstart` and `dragstart` in the capture phase and prevent both events only when they originate inside `#keypad`. On pointer activation it will also clear an existing document selection, so a previously selected label cannot remain highlighted after a keypad press. Existing CSS selection suppression remains as the first layer; the event guard covers browsers that ignore selection styles during long pointer gestures.

The guard is scoped to the keypad and does not affect settings inputs, text editors, or other selectable content.

## Acceptance

1. Long pressing any virtual keypad button leaves `window.getSelection()` empty.
2. Dragging across keypad labels does not create a selection.
3. Settings panel controls and text inputs retain their current behavior.

## Verification

- `git diff --check`
- `node --check runtime/j2me/touchpad.js`
- Web build
- Browser long-press probe against a running J2ME player.
