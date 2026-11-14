# Orientation Layout Fix Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make portrait and landscape J2ME runtime layouts fit their viewport, use the available landscape width for controls, and refit the logical canvas after orientation/fullscreen changes.

**Architecture:** Keep one runtime stage as the geometry boundary. Resolve `auto` orientation in `ScreenSetup`, use a bounded portrait flex layout and a three-column landscape grid, and let the existing refit lifecycle recalculate canvas dimensions after CSS geometry settles.

**Tech Stack:** React, classic runtime JavaScript, CSS grid/flex, Vite, pnpm.

---

## Chunk 1: Fix Orientation State And Geometry Rules

**Files:**
- Modify: `runtime/j2me/screen.js:293-330`
- Modify: `runtime/j2me/style/main.css:86-115, 754-810`

- [ ] **Step 1: Normalize resolved orientation state**

  Ensure `syncOrientation()` always writes the resolved `portrait` or `landscape` value for `auto`, and keep `setOrientation()` as the single entry point used by settings and runtime startup.

- [ ] **Step 2: Remove the grid reset that overrides landscape placement**

  Replace the runtime reset of `grid-area`/`grid-column` with only the flex sizing needed in portrait. Preserve the landscape rules that assign numeric keypad to column 1 and navigation keys to column 3.

- [ ] **Step 3: Make portrait stage and keypad width-constrained**

  Set the portrait stage, phone, display container, and keypad to `width: 100%` with `max-width: 100%` and `min-width: 0`; constrain the canvas through its display container so no child can create horizontal overflow.

- [ ] **Step 4: Replace fixed landscape column caps**

  Use a three-column grid with a max-content center column and flexible side columns. Compute the keypad unit from available stage height/width with a touchable lower bound and cap it by the side column width, so keys scale up on wide landscape screens.

- [ ] **Step 5: Run static checks**

  Run `git diff --check` and `node --check runtime/j2me/screen.js`.

## Chunk 2: Verify Runtime Scenarios

**Files:**
- Modify: none
- Test artifacts: `artifacts/orientation-*.png`, `artifacts/runtime-*.png` (untracked)

- [ ] **Step 1: Start the server and web dev server from this worktree**

  Confirm `/screen.js` and `/style/main.css` resolve from the same worktree and that `__jars` contains the smoke-test JAR.

- [ ] **Step 2: Capture portrait and landscape runtime screenshots**

  Use `SoundProbe.jar` at 390×844 and 844×390. Verify portrait content is not clipped, and landscape has numeric keypad left, screen center, and navigation keys right with usable key sizes.

- [ ] **Step 3: Run builds and checks**

  Run `pnpm --filter @xiaochao/web build`, `pnpm --filter @xiaochao/mobile typecheck`, `git diff --check`, and `node --check runtime/j2me/screen.js`.

- [ ] **Step 4: Commit the implementation**

  ```bash
  git add runtime/j2me/screen.js runtime/j2me/style/main.css
  git commit -m "fix: make orientation layouts fill the runtime viewport"
  ```

## Chunk 3: Add Touch Layout Customization

**Files:**
- Create: `runtime/j2me/touch-layout.js`
- Modify: `runtime/j2me/config/settings.js`
- Modify: `runtime/j2me/config/urlparams.js`
- Modify: `runtime/j2me/keymap.js`
- Modify: `runtime/j2me/touchpad.js`
- Modify: `runtime/j2me/panel.js`
- Modify: `runtime/j2me/style/main.css`
- Modify: `apps/web/src/runtime/J2MEPlayer.jsx`

- [ ] **Step 1: Add a validated per-game touch layout model**

  Store preset, side placement, numeric slot order, and visual-slot action mapping separately from external keyboard `keymap` values.

- [ ] **Step 2: Add stable preset and slot application**

  Apply D-pad placement, side-group placement, and numeric grid order through data attributes and slot order. Keep the DOM grid stable and validate every permutation before applying it.

- [ ] **Step 3: Route touch gestures through visual-slot mappings**

  Make touch hit testing resolve a visual slot first, then convert that slot to the configured game action. Release all active pointers before rebinding so changes cannot leave a key pressed.

- [ ] **Step 4: Add settings controls**

  Add preset selectors, side swap, numeric order editing, action mapping controls, and independent reset in the settings panel. Keep external keyboard mapping in its existing section.

- [ ] **Step 5: Verify the settings/fullscreen lifecycle**

  Check applying, resetting, and re-entering fullscreen in portrait and landscape. Confirm overlays remain clickable and `TouchDiagnostics.sizes()` reports stable key rectangles.
