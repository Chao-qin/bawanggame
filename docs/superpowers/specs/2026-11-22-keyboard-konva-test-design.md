# React Konva Keyboard Test Page

## Goal

Add a keyboard-rendering test page to the existing React web application. The page should exercise reusable React Konva components for physical keyboard layouts and game controllers without changing the normal game-library experience.

## Scope

- Add an in-app hash route at `#/test/keyboard`.
- Add reusable, data-driven React Konva components for:
  - Full-size, TKL, 75%, and 60% physical keyboard layouts.
  - A directional pad with ABXY buttons.
  - A numeric keypad controller.
- Allow switching between layout categories and individual layouts.
- Support pointer and touch press/release events, expose key values through callbacks, and show current key feedback.
- Keep the existing application entry point, library routes, and runtime keyboard mapping behavior unchanged.

## Design

The test page owns layout selection and event feedback. A reusable keyboard canvas receives a selected layout and press/release callbacks. Layouts are represented as structured key data (stable id, label, value, position, dimensions, and optional secondary legend), so the shared canvas can render different physical sizes and controller arrangements without layout-specific rendering code.

The physical layouts use US ANSI legends and these key counts: full-size 104-key, TKL 87-key, 75% 82-key, and 60% 61-key. All have the standard six-row arrangement and a QWERTY alphanumeric block. Full-size adds a dedicated navigation cluster, inverted-T arrows, and numeric keypad; TKL retains the navigation cluster and arrows but removes the numeric keypad; 75% retains a compact navigation cluster, arrows, and function row but no numeric keypad; 60% has no dedicated function, navigation, arrow, or numeric-keypad blocks. Key labels use conventional US legends and values use stable DOM-style key names (`Escape`, `KeyQ`, `Digit1`, `ArrowUp`, etc.). Positions and sizes are defined in units relative to a 1u key; wider keys, row staggering, and separated blocks use those same coordinates. The game controller layouts contain four directional buttons (`ArrowUp`, `ArrowDown`, `ArrowLeft`, `ArrowRight`) plus A/B/X/Y (`KeyA`, `KeyB`, `KeyX`, `KeyY`), and a standard 17-key numeric keypad (`NumLock`, `Divide`, `Multiply`, `Subtract`, `Digit7`-`Digit9`, `Add`, `Digit4`-`Digit6`, `Digit1`-`Digit3`, `Enter`, `Digit0`, `Decimal`).

The canvas handles input through Pointer Events only, so a physical pointer or touch produces one event stream without compatibility mouse duplicates. Each pointer may hold one key; multiple pointers can hold multiple keys concurrently. Pointer capture keeps a press active when the pointer leaves its key or the canvas; leaving a key alone does not release it. Pointer up releases that pointer's key, pointer cancel releases only the key held by that pointer, and window blur or unmount releases all remaining keys. The page displays all currently pressed keys and the most recently handled press/release event, ordered by callback arrival. Callbacks receive the key data and pointer id.

The canvas observes its parent size and scales the complete layout uniformly to fit without internal scrolling. It does not create a Konva Stage until the parent has a measurable width greater than zero. If the parent has no measurable height, the canvas uses a 360px minimum drawing height. Touch interaction disables browser gesture handling over the canvas.

The page is integrated into the current hash-route handling as a dedicated test route. It is not a standalone app or a production tab.

## Acceptance Criteria

1. Opening `#/test/keyboard` renders inside the existing React application.
2. The user can select each of the four physical layouts and two game-controller layouts.
3. Physical layouts render exactly 104, 87, 82, and 61 keys respectively; the directional controller renders 8 controls and the numeric keypad renders 17 keys. Representative checks verify the full-size numeric keypad, TKL navigation cluster, 75% function row, and 60% absence of dedicated function/navigation/arrow/numeric blocks.
4. Pointer and touch press/release interactions report the associated key value exactly once and visibly update pressed state.
5. Multiple held pointers are represented concurrently; pointer leave keeps a key held, pointer cancellation releases only that pointer, and window blur/unmount do not leave keys stuck.
6. The canvas remains within its container at narrow viewport widths and scales its layout without horizontal overflow.
7. Existing library/play routes and runtime mapping behavior remain unchanged.
8. The web app builds successfully and the test route passes a browser smoke check.
9. A zero-width parent initially creates no Stage; after its width becomes measurable, the observer creates a non-clipped Stage and renders the selected layout.

## Out of Scope

- Dragging, resizing, or editing key layouts.
- Persisting user-defined layouts.
- Replacing or changing the existing game runtime keyboard-mapping UI.
- Adding the test page to the production navigation.

## Verification

- Build the web workspace.
- Run the web dev server and verify direct navigation to `#/test/keyboard`.
- Exercise layout switching and pointer/touch press and release behavior.
- Check a desktop viewport and a narrow/mobile viewport for clipping or overflow.
