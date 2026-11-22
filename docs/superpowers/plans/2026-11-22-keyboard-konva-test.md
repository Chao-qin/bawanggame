# React Konva Keyboard Test Page Implementation Plan

> **For agentic workers:** REQUIRED: Follow this plan task-by-task with review checkpoints. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a hash-routed React test page that renders six interactive keyboard/controller layouts with reusable React Konva components.

**Architecture:** Keep layout geometry in a plain data module and rendering/input lifecycle in a focused Konva component. Add a test-page component for selecting layouts and displaying active keys/events, then add a narrowly scoped hash route in the existing application. Verify pure layout contracts with Node's built-in test runner and exercise routing, resizing, pointer lifecycle, and responsive bounds through the existing Chrome CDP smoke harness. Chunk 2 is not complete until Chunk 3's browser checks pass.

**Tech Stack:** React 18, Vite, `react-konva`, `konva`, Node.js `node:test`, existing Chrome DevTools Protocol smoke harness.

---

## File Map

- Modify `apps/web/package.json`: add the `konva` and `react-konva` runtime dependencies.
- Create `apps/web/src/keyboard/layouts.js`: define six immutable, data-driven keyboard layouts and stable key metadata.
- Create `apps/web/src/keyboard/layouts.test.js`: verify counts, unique IDs, key values, and representative block membership using `node:test`.
- Create `apps/web/src/keyboard/pointer-state.js`: implement pure pointer/key state transitions used by the canvas.
- Create `apps/web/src/keyboard/pointer-state.test.js`: verify pointer concurrency, cancellation, duplicate/unknown events, and release-all behavior using `node:test`.
- Create `apps/web/src/keyboard/pointer-state.js`: implement pure pointer/key state transitions used by the canvas.
- Create `apps/web/src/keyboard/pointer-state.test.js`: verify concurrent pointers, per-pointer cancellation, duplicate events, and global release with `node:test`.
- Create `apps/web/src/keyboard/KeyboardCanvas.jsx`: measure the parent, render a uniformly scaled Konva stage, and own pointer-to-key pressed state and cleanup.
- Create `apps/web/src/keyboard/KeyboardTestPage.jsx`: provide category/layout selectors and current pressed-key/latest-event feedback.
- Create `apps/web/src/keyboard/keyboard-test.css`: style the isolated test route and responsive canvas without changing library styles.
- Modify `apps/web/src/App.jsx`: recognize and render `#/test/keyboard` while preserving library/play route behavior.
- Modify `apps/web/verify.mjs`: add test-route smoke coverage for all layouts, direct route entry, canvas sizing, real touch pointers, and small viewport bounds.

## Chunk 1: Layout Data and Contracts

### Task 1: Add layout data and executable layout checks

**Files:**
- Create: `apps/web/src/keyboard/layouts.js`
- Create: `apps/web/src/keyboard/layouts.test.js`
- Modify: `apps/web/package.json`

- [ ] **Step 1: Add Konva dependencies**

Run from repository root:

```bash
pnpm --filter @xiaochao/web add konva react-konva
```

Expected: `apps/web/package.json` and the workspace lockfile record compatible runtime versions, with no unrelated dependency changes.
The workspace lockfile is the repository-root `pnpm-lock.yaml`.

- [ ] **Step 2: Write failing layout contract tests**

Create `apps/web/src/keyboard/layouts.test.js` with `node:test` and `node:assert/strict`. Assert:
- exported layout IDs are exactly `full-size`, `tkl`, `75-percent`, `60-percent`, `dpad-abxy`, and `numpad`;
- physical key counts are 104, 87, 82, and 61; the D-pad/ABXY layout has 8 controls and numpad has 17;
- every physical layout has exactly six numbered rows (0-5), each row contains the expected ANSI QWERTY sequence for its included keys, and every key has a unique ID, row, block/group, non-empty label/value, positive width/height, and finite x/y coordinates;
- physical keys use conventional US ANSI labels and stable DOM-style values, including `Escape`, `Tab`, `CapsLock`, `Shift`, `Control`, `Alt`, `Space`, `Enter`, `Backspace`, `KeyQ`-`KeyP`, `KeyA`-`KeyL`, `KeyZ`-`KeyM`, and `Digit1`-`Digit0`; assert representative label/value pairs such as `1`/`Digit1`, `!`/`Digit1` where secondary legends are modeled, and `Q`/`KeyQ`;
- exact physical structure: full-size has function, alphanumeric, navigation, arrow, and numeric-keypad blocks; TKL has function, alphanumeric, navigation, and arrow blocks but no numeric keypad; 75% has function, alphanumeric, compact navigation, and arrow blocks but no numeric keypad; 60% has only its integrated alphanumeric block, with no dedicated function, navigation, arrow, or numeric-keypad block;
- representative geometry is expressed in 1u-relative coordinates: assert standard widths for `Backspace` (2u), `Tab` (1.5u), `CapsLock` (1.75u), left/right `Shift` (2.25u/2.75u), `Enter` (2.25u), and `Space` (6.25u); assert row y positions increase by exactly 1u, Q/A/Z row origins are staggered by 0.25u/0.5u/0.75u relative to the number-row origin, and keys are ordered left-to-right without overlapping within each row/block; assert distinct blocks have at least 0.5u separation and the full-size numeric keypad is to the right of navigation/arrows;
- controller data has exactly the four direction values `ArrowUp`, `ArrowDown`, `ArrowLeft`, `ArrowRight` and A/B/X/Y values `KeyA`, `KeyB`, `KeyX`, `KeyY`; numpad has exactly these 17 values in physical arrangement order: `NumLock`, `Divide`, `Multiply`, `Subtract`, `Digit7`, `Digit8`, `Digit9`, `Add`, `Digit4`, `Digit5`, `Digit6`, `Digit1`, `Digit2`, `Digit3`, `Enter`, `Digit0`, `Decimal`.

Also create `layouts.js` with `export const KEYBOARD_LAYOUTS = []` and `export const getLayout = (id) => undefined`. Tests import these exact named exports, assert the array's expected IDs/counts, then use `assert.ok(getLayout('full-size'))` before accessing any key structure. This ensures missing layout data fails through a named assertion rather than a property-access exception.

- [ ] **Step 3: Run the layout tests and verify the expected failure**

Run:

```bash
node --test apps/web/src/keyboard/layouts.test.js
```

Expected: the test file loads successfully and named `test(...)` cases fail their assertions against the empty array/undefined result (not due to module loading or property-access errors).

- [ ] **Step 4: Implement the six layout definitions**

Replace the empty export in `layouts.js` with one shared key factory and six plain-data layouts. Each physical key records `id`, `label`, `value`, `row`, `block`, `x`, `y`, `width`, and `height`, plus an optional `secondaryLegend`; controller/numpad keys use the same geometry and identity fields. Use 1u-relative coordinates with unit height and the conventional six physical rows at y=0 through 5: function row, number row, Q row, A row, Z row, and bottom modifier row. Place keys left-to-right without overlapping bounds within each row; preserve standard ANSI stagger by offsetting Q row 0.25u, A row 0.5u, and Z row 0.75u from the number-row origin.

Use conventional ANSI widths: ordinary keys 1u; Backspace 2u; Tab 1.5u; CapsLock 1.75u; left/right Shift 2.25u/2.75u; Enter 2.25u; Space 6.25u. Use explicit horizontal gaps between function-key groups and between the alphanumeric, navigation, arrow, and numeric-keypad blocks; keep these block offsets consistent across the four physical layouts. Full-size places navigation and inverted-T arrows to the right of alphanumeric keys, then the numeric keypad to their right. TKL removes only the numeric keypad; 75% uses a compact navigation cluster and keeps the function row and arrows; 60% integrates the function legends with the number row and has no dedicated navigation, arrow, or numeric-keypad blocks. Use US ANSI legends and stable DOM-style values; numeric-keypad keys use the spec's exact values (`NumLock`, `Divide`, `Multiply`, `Subtract`, `Add`, `Enter`, `Decimal`, and `Digit0`-`Digit9`), while number-row keys use `Digit0`-`Digit9`. Define the D-pad/ABXY controls and numeric keypad as compact, clearly separated blocks with stable placements and no layout-specific rendering logic.

- [ ] **Step 5: Run the layout tests**

Run:

```bash
node --test apps/web/src/keyboard/layouts.test.js
```

Expected: all 7 named layout-contract subtests PASS (IDs/counts; six-row QWERTY structure; key identity/geometry; ANSI legends/values; physical blocks; representative ANSI geometry; controller and exact numpad values). Keep this count aligned with the top-level `test(...)` cases in the test file.

- [ ] **Step 6: Commit the layout data and tests**

```bash
git add apps/web/package.json pnpm-lock.yaml apps/web/src/keyboard/layouts.js apps/web/src/keyboard/layouts.test.js
git commit -m "feat: define keyboard test layouts"
```

### Task 2: Add testable pointer state transitions

**Files:**
- Create: `apps/web/src/keyboard/pointer-state.js`
- Create: `apps/web/src/keyboard/pointer-state.test.js`

- [ ] **Step 1: Write failing pointer-state tests**

Use `node:test` to specify pointer down, pointer up, pointer cancel, duplicate down, unknown up/cancel, same-key multi-pointer, and release-all transitions. Assert duplicate down for an already-held pointer preserves its original mapping; unknown up/cancel preserves all mappings; release-all returns every held pointer/key pair and leaves an empty map; two pointers holding the same key keep that key in the derived pressed set until both release it; callbacks and transitions remain pointer-specific. Include the case where IDs 11 and 12 hold separate keys, canceling 11 releases only its key and keeps 12 active, then releasing 12 clears the final key.

Create `pointer-state.js` with these exact named exports and signatures: `createPointerState()`, `pointerDown(state, pointerId, keyId)`, `pointerUp(state, pointerId)`, `pointerCancel(state, pointerId)`, `releaseAll(state)`, and `pressedKeyIds(state)`. Initially return an empty `{ pointers: {} }` state from `createPointerState`, return the input state unchanged from transition functions, return an empty array from `releaseAll`, and an empty `Set` from `pressedKeyIds`. Tests import these names and assert returned state values directly, ensuring red failures are assertion failures rather than module/property errors.

- [ ] **Step 2: Run tests and verify expected failure**

Run:

```bash
node --test apps/web/src/keyboard/pointer-state.test.js
```

Expected: the test file loads successfully and named `test(...)` cases fail their state assertions against placeholder/no-op exports, not due to import or property-access errors.

- [ ] **Step 3: Implement pure transition helpers**

Replace the placeholder functions with immutable helpers matching the exact signatures above. Track `pointerId -> keyId`, ignore duplicate down for an already-held pointer, leave state unchanged for unknown up/cancel IDs, release only the matching pointer on up/cancel, derive a unique set of key IDs still held by one or more pointers, and implement `releaseAll(state)` to return `{ state: emptyState, released: [{pointerId, keyId}, ...] }` for blur/unmount callbacks. Keep DOM capture and callbacks out of this module.

- [ ] **Step 4: Run pointer-state tests**

Run:

```bash
node --test apps/web/src/keyboard/pointer-state.test.js
```

Expected: all named state-transition tests pass, including cancel-one/preserve-another.

- [ ] **Step 5: Commit pointer-state behavior**

```bash
git add apps/web/src/keyboard/pointer-state.js apps/web/src/keyboard/pointer-state.test.js
git commit -m "test: define keyboard pointer state transitions"
```

## Chunk 2: Reusable Konva Canvas and Test Page

### Task 3: Implement responsive keyboard canvas and pointer lifecycle

**Files:**
- Create: `apps/web/src/keyboard/KeyboardCanvas.jsx`
- Use: `apps/web/src/keyboard/pointer-state.js`

- [ ] **Step 1: Define canvas behavior from layout input**

The canvas accepts `layout`, `onKeyDown`, `onKeyUp`, and an optional accessible label. Derive the layout's drawing bounds from key positions and dimensions, including gaps between blocks.

- [ ] **Step 2: Add parent measurement and zero-width behavior**

Use `ResizeObserver` on the containing element. Do not mount a Konva `Stage` until measured width is greater than zero. Use the measured height, falling back to 360px only when height is unavailable, and uniformly scale the complete layout to fit both dimensions without internal scrolling.

- [ ] **Step 3: Render keys in Konva**

Render each key as a stable keyed Konva group with a key body and centered primary/secondary legends. Use fixed stage dimensions from the measured container and computed scale; pressed keys receive a distinct fill/stroke without changing geometry.

- [ ] **Step 4: Implement pointer state and cleanup**

Use Konva layout `onPointerDown`, `onPointerUp`, and `onPointerCancel` handlers to identify the hit key and native Pointer Events on the Stage container DOM element (or its canvas child) to call `setPointerCapture(pointerId)` after a valid press. Release capture on up/cancel; loss of capture alone must not synthesize a release. Delegate state transitions to `pointer-state.js`, allow concurrent pointers, and invoke callbacks once per transition with `(keyData, pointerId)`. A pointer stays associated with its original key until up/cancel; moving across keys does not transfer it. Pointer leave retains the key; cancel releases only that pointer. Blur/unmount release all held keys and captures before listener cleanup. Apply `touch-action: none` to the host. Unit tests for cancel-one/preserve-another are the deterministic contract check; browser smoke verifies actual captured touch pointers and their independent pointerup events.

- [ ] **Step 5: Verify web compilation**

Run:

```bash
pnpm --filter @xiaochao/web build
```

Expected: Vite compiles the new Konva component and the production build completes.

- [ ] **Step 6: Commit the canvas**

```bash
git add apps/web/src/keyboard/KeyboardCanvas.jsx
git commit -m "feat: render interactive keyboard canvas"
```

### Task 4: Add the keyboard test page and route

**Files:**
- Create: `apps/web/src/keyboard/KeyboardTestPage.jsx`
- Create: `apps/web/src/keyboard/keyboard-test.css`
- Modify: `apps/web/src/App.jsx`

- [ ] **Step 1: Build the test page selection and feedback UI**

Render category tabs for physical keyboards and game controllers, then layout selection controls for the active category. Mount `KeyboardCanvas` with the selected layout. Show all currently pressed key labels/values and the latest press/release event in arrival order. Keep the page usable on narrow screens and use existing theme tokens where appropriate.

- [ ] **Step 2: Add isolated page styles**

Create `keyboard-test.css` with a constrained content area, non-nested page sections, compact selectors, and a responsive canvas host with a measurable width and height. Avoid changes to global library selectors.

- [ ] **Step 3: Integrate the hash route**

In `App.jsx`, add a dedicated `{type: 'keyboard-test'}` route representation to route parsing and serialize it exactly as `#/test/keyboard`. Render the page instead of the library shell for that route. Keep the special play-route history guard scoped to actual `play` routes, and ensure existing unknown hashes still fall back and normalize to the same library route as before. Direct URL entry, hash navigation from the page, and browser back/forward must preserve library and play route behavior.

- [ ] **Step 4: Run layout tests and build**

Run:

```bash
node --test apps/web/src/keyboard/layouts.test.js
pnpm --filter @xiaochao/web build
```

Expected: tests PASS and build succeeds with no route or JSX errors.

- [ ] **Step 5: Commit the page and route**

```bash
git add apps/web/src/App.jsx apps/web/src/keyboard/KeyboardTestPage.jsx apps/web/src/keyboard/keyboard-test.css
git commit -m "feat: add keyboard layout test route"
```

## Chunk 3: Browser Verification

### Task 5: Extend browser smoke checks and verify interactions

**Files:**
- Modify: `apps/web/verify.mjs`

- [ ] **Step 1: Add a test-route smoke flow**

Navigate directly to `#/test/keyboard`, assert the page is mounted, iterate all six layouts, and assert rendered key counts match the layout contract. Verify category/layout selection updates the visible active layout. Navigate to `#/library/j2me`, verify its normal tab is rendered, use browser back/forward to return to the test route, and verify an unknown hash still falls back to the library. Open the existing sample Flash play route `#/play/flash/sample-game.swf?tab=flash&name=Star%20Catcher`, assert the player stage mounts, then exercise its existing back/exit path and assert it returns to the Flash library without normalizing to the keyboard test route.

- [ ] **Step 2: Verify pointer lifecycle**

Use CDP mouse input to press/release a physical key and a controller key. Assert exactly one press/release event in feedback. Move a held pointer outside the key/canvas and assert it remains pressed until pointer up. For concurrency, enable CDP touch emulation and dispatch `Input.dispatchTouchEvent` with `touchStart` containing two distinct touch points (IDs 11 and 12) on different keys. Dispatch the first `touchEnd` with the remaining active touch point 12 in `touchPoints`; assert the key at point 11 releases while point 12's key stays active. Dispatch the final `touchEnd` with an empty `touchPoints` list and assert point 12's key releases. Dispatch window blur with a held pointer and assert all keys release. Single-pointer `pointercancel` isolation is asserted by Task 2's pure state tests because CDP touch cancellation cancels the entire active touch sequence rather than one chosen pointer.

- [ ] **Step 3: Verify zero-width recovery and responsive bounds**

Temporarily set the canvas host width to zero and assert no Stage is mounted; restore its width and assert a Stage appears, the selected layout's expected number of keys is present, and every key's client bounds are within the canvas host. At 320x568 and 390x844 viewports, check the canvas host and rendered Stage stay within the viewport with no document horizontal overflow.

- [ ] **Step 4: Run the browser verification**

Check `lsof -nP -iTCP:5174 -sTCP:LISTEN`. If occupied, inspect 5175, 5176, and onward and choose the first free port. Do not stop an existing listener. Substitute the selected number consistently for `5174` in every command and listener check below. Launch Vite directly (not through `pnpm`) with strict port binding so a race fails instead of silently changing ports:

```bash
cd apps/web
PORT=5174
node node_modules/vite/bin/vite.js --host 127.0.0.1 --port "$PORT" --strictPort > /private/var/folders/s9/gp4l6bj941b74q3x86mq3ng40000gn/T/keyboard-konva-vite.log 2>&1 &
VITE_PID=$!
echo "$VITE_PID"
```

Keep that terminal open so `VITE_PID` remains available for cleanup. In a second terminal, run from the repository root using the same selected port:

```bash
VERIFY_BASE_URL="http://127.0.0.1:5174/" node apps/web/verify.mjs
```

Expected: `RESULT PASS`; existing runtime fixture skips are reported as skips if optional fixtures are absent. Back in the launch terminal, stop only the recorded PID using `kill -TERM "$VITE_PID"`, verify `ps -p "$VITE_PID"` shows it exited, then verify `lsof -nP -iTCP:5174 -sTCP:LISTEN` reports no listener. Do not stop any process that was already listening before the test.

- [ ] **Step 5: Run final checks**

Run:

```bash
node --test apps/web/src/keyboard/layouts.test.js
pnpm --filter @xiaochao/web build
git diff --check
git status --short
```

Expected: layout/state tests and build pass and whitespace check is clean. After committing all planned chunks, `git status --short` must be empty.

- [ ] **Step 6: Commit verification coverage**

```bash
git add apps/web/verify.mjs
git commit -m "test: verify keyboard canvas interactions"
```
