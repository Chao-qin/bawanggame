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
