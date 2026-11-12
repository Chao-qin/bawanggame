# Runtime Rotation and Fullscreen Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Expand runtime rotation, provide a keyboard-screen-keyboard landscape shell, and make the game stage fullscreen with fixed-width or fixed-height fitting.

**Architecture:** Keep persisted options in the legacy `Settings` module and route every geometry update through `ScreenSetup.refit()`. Use CSS custom properties and data attributes for arbitrary rotation and fullscreen fit modes, while React owns the fullscreen stage request and a small runtime overlay.

**Tech Stack:** React, Vite, legacy browser JavaScript, CSS, localStorage, Fullscreen API.

---

## Chunk 1: Runtime Settings and Rotation

**Files:**
- Modify: `runtime/j2me/config/settings.js`
- Modify: `runtime/j2me/config/urlparams.js`
- Modify: `runtime/j2me/keymap.js`
- Modify: `runtime/j2me/panel.js`

- [ ] Add eight rotation options and a persisted `fullscreenFit` option with fixed-width/fixed-height values.
- [ ] Parse and validate the options from URL and local settings, preserving current defaults.
- [ ] Apply arbitrary rotation as a CSS variable; keep directional key remapping only for 90/270-degree turns.
- [ ] Add panel controls and update them without restarting the game.

## Chunk 2: Stage Geometry and Landscape Layout

**Files:**
- Modify: `runtime/j2me/screen.js`
- Modify: `runtime/j2me/style/main.css`

- [ ] Make stage sizing account for rotation bounding boxes and fullscreen fit mode.
- [ ] Add the landscape three-column keyboard-screen-keyboard arrangement with safe-area padding.
- [ ] Ensure portrait and free layout modes continue to use existing geometry.

## Chunk 3: Fullscreen Player Controls

**Files:**
- Modify: `apps/web/src/App.jsx`
- Modify: `runtime/j2me/style/main.css`

- [ ] Move fullscreen behavior to the player stage and expose a compact fit-mode control overlay.
- [ ] Persist fit mode per game and reflect fullscreen state changes.
- [ ] Ensure exiting a game releases fullscreen and leaves no overlay behind.

## Chunk 4: Verification and Delivery

**Files:**
- Modify: `apps/web/verify.mjs` only if existing checks need a stable selector.

- [ ] Run `git diff --check` and the web build.
- [ ] Run the existing browser verification script against a local server.
- [ ] Inspect responsive geometry at portrait and landscape viewport sizes.
- [ ] Commit implementation, push branch, search existing GitHub PRs/issues with GitHub MCP, and create and verify one PR.
