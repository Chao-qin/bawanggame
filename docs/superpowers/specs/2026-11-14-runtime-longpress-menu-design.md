# Suppress Runtime Long Press Menus

## Goal

Prevent mobile browser/WebView long press actions from opening the system selection menu over the running game.

## Cause

The previous fix guarded selection and context menus only when the event target was inside `#keypad`. The game canvas, settings gear, fullscreen controls, and player exit button are outside that selector, so a long press on those controls can still produce the browser menu.

## Design

Add a shared runtime gesture guard to the React player shell and the phone markup. It prevents `contextmenu`, `selectstart`, and `dragstart` for runtime UI targets, while allowing native editing targets (`input`, `textarea`, and `[contenteditable=true]`) to retain their browser behavior. The guard is applied at the player boundary so controls outside the phone markup are covered as well.

## Acceptance

1. Long pressing the canvas, virtual keypad, gear, fullscreen controls, or exit button does not open the browser selection menu.
2. MRP and J2ME text inputs remain selectable/editable when active.
3. No change is made to the library, store, or other non-runtime pages.

## Verification

- `corepack pnpm --filter @xiaochao/web build`
- `git diff --check`
- Browser long-press probe on canvas, keypad, and fullscreen controls.
