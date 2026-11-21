# Flash Store and Gameplay Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Improve Flash catalog browsing, Ruffle input, and orientation/fullscreen layouts for desktop and touch users.

**Architecture:** Keep the existing Flash route and Ruffle player. Enrich catalog results with validated artwork URLs, reorganize the store around archive search, and add a Flash-specific touch keypad that dispatches paired keyboard events to the Ruffle element with explicit release cleanup. Use player state and viewport media rules for portrait, landscape, and fullscreen layout modes.

**Tech Stack:** React, Vite, CSS, Node.js, Ruffle 0.7.1, Playwright/CDP browser verification.

---

## Chunk 1: Catalog Artwork and Search UX

### Task 1: Expose and render archive artwork

**Files:**
- Modify: `apps/server/src/index.ts`
- Modify: `apps/web/src/App.jsx`
- Modify: `apps/web/src/mobile-ui.css`
- Test: `apps/server/test/` and existing web browser verification

- [ ] Add focused parser coverage for present, absent, and rejected cover URLs.
- [ ] Extract only HTTPS `screenshots.flash.homes` cover URLs into archive catalog items.
- [ ] Fetch the first archive page on entry, preserve submit-based search, and prevent stale searches from replacing newer results.
- [ ] Render lazy 4:3 cover images with an image-error fallback; show explicit loading, empty, and error states.
- [ ] Move custom SWF import into a collapsed secondary disclosure while preserving all validation and submit behavior.

## Chunk 2: Flash Keyboard and Touch Controls

### Task 2: Deliver desktop and touch key events

**Files:**
- Create: `apps/web/src/runtime/FlashControls.jsx`
- Modify: `apps/web/src/runtime/FlashPlayer.jsx`
- Modify: `apps/web/src/App.jsx`
- Modify: `apps/web/src/mobile-ui.css`
- Test: focused browser interaction verification

- [ ] Make the Ruffle element focusable and focus it after a deliberate game interaction without stealing focus from toolbar controls.
- [ ] Add common direction, confirm, and action touch buttons that send paired keyboard events to Ruffle.
- [ ] Ensure physical keyboard controls reach Ruffle once, without duplicate forwarded events.
- [ ] Release held keys on pointer up/cancel/lost capture, blur, hidden document, and player teardown.
- [ ] Verify keyboard movement and touch press/release on the bundled input-capable SWF.

## Chunk 3: Responsive Flash Layout and End-to-End Validation

### Task 3: Fit orientation and fullscreen modes

**Files:**
- Modify: `apps/web/src/App.jsx`
- Modify: `apps/web/src/mobile-ui.css`
- Modify: `apps/web/verify.mjs` or add a focused Flash verification script

- [ ] Add Flash-specific portrait layout: viewport-width stage and keypad in remaining vertical space.
- [ ] Add windowed landscape layout: viewport-height stage and touch keypads in the side space.
- [ ] Hide touch controls and auto-fit the stage in landscape fullscreen; restore side keypads on fullscreen exit.
- [ ] Keep desktop without touch input free of reserved keypad space.
- [ ] Run web build, server typecheck/tests, browser verification at portrait and landscape sizes, and verify Flash enter/exit/re-entry and key cleanup.
- [ ] Run Android build and APK asset checks if the environment has the SDK; report real-device validation separately.
