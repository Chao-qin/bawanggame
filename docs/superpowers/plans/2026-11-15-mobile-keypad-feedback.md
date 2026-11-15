# Mobile Keypad Visual and Haptic Feedback Repair Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Repair the mobile keypad layout and visual regressions and improve touch haptic feedback in one PR.

**Architecture:** Preserve DOM hit targets and use Canvas as the only visible keypad renderer. Use existing touch layout mappings as the source of directional action labels. Keep toolbar controls overlaid on the runtime stage, and issue one 24 ms default native haptic for the first coarse-pointer holder of each key.

**Tech Stack:** React, CSS, Canvas, JavaScript, React Native WebView, TypeScript, Vite, pnpm, Playwright/browser automation.

---

## Files and Responsibilities

- `apps/web/src/App.jsx`: reports toolbar height and renders runtime controls; only adjust measurement if CSS overlay behavior needs it.
- `runtime/j2me/style/main.css`: stage, toolbar, keypad spacing, and numeric pressed state.
- `runtime/j2me/keypad-canvas.js`: render arrows and pressed controls using live DOM rectangles and touch-layout semantics.
- `runtime/j2me/touchpad.js`: preserve deduplication and use the mobile default haptic request.
- `runtime/j2me/config/settings.js`: set the mobile default vibration duration.
- `apps/mobile/App.tsx`: retain native bounded pulse behavior; change only if validation finds cancellation/dispatch causes missed rapid pulses.
- `docs/superpowers/specs/2026-11-15-mobile-keypad-feedback-design.md`: approved scope and acceptance contract.
- `docs/superpowers/plans/2026-11-15-mobile-keypad-feedback.md`: implementation and verification record.

## Chunk 1: Diagnose and Repair Keypad Geometry and Visuals

**Files:**
- Modify: `runtime/j2me/keypad-canvas.js`
- Modify: `runtime/j2me/style/main.css`
- Possibly modify: `apps/web/src/App.jsx`

- [ ] **Step 1: Trace rendered and semantic D-pad mappings**
  Compare the four `TouchLayout` presets, CSS slot placement, `Touchpad` geometric direction lookup, and Canvas arrow rendering. Use this screen-slot to game-action mapping as the verification oracle: `standard` = up→up, right→right, down→down, left→left; `mirror` = up→up, right→left, down→down, left→right; `rotate-cw` = up→left, right→up, down→right, left→down; `rotate-ccw` = up→right, right→down, down→left, left→up.
- [ ] **Step 2: Correct only the mismatched rendering/layout rules**
  Keep rectangles from `getBoundingClientRect()` as the position source. Make Canvas glyphs correspond to the action assigned to each rendered slot. Add spacing so adjacent D-pad and soft-key hit bounds have at least `0.2 * --u` clearance at the narrow portrait layout. Remove duplicate active offset/outline artifacts while preserving active colors.
- [ ] **Step 3: Make toolbar an overlay without shrinking the stage**
  Inspect fullscreen and non-fullscreen player styles. Ensure expanding/collapsing the toolbar does not change the stage's width or height in either mode, and floating controls do not reserve toolbar height in layout. Confirm safe-area positioning and pointer interaction remain correct.
- [ ] **Step 4: Capture and inspect visual states**
  Run the web app and capture narrow portrait, landscape, and rotation transition at idle and pressed states. Compare D-pad screen slots to the mapping in Step 1; measure adjacent D-pad/soft-key bounding rectangles for at least `0.2 * --u` clearance; confirm numeric pressed pixels and DOM controls stay within their pre-press bounds; verify toolbar toggles preserve stage width/height in fullscreen and non-fullscreen; and inspect for overlap/clipping. Correct issues before proceeding.

## Chunk 2: Improve Mobile Haptic Feedback

**Files:**
- Modify: `runtime/j2me/config/settings.js`
- Inspect/modify: `runtime/j2me/touchpad.js`
- Inspect/modify: `apps/mobile/App.tsx`
- Reference: `apps/mobile/src/host/protocol.ts`

- [ ] **Step 1: Set the mobile coarse-pointer default to 24 ms**
  Preserve explicit settings and desktop silence. Do not change repeat timers or emit haptics during hold/repeat.
- [ ] **Step 2: Verify holder-edge and bridge behavior**
  Confirm one haptic request when a key's holder count changes from zero to one, including rapid release/re-press, and no second request for an additional holder of the same key. Verify bridge posting returns false or throws before the browser fallback is attempted; a successful asynchronous post must not trigger a duplicate fallback pulse.
- [ ] **Step 3: Verify native duration bounds and rapid requests**
  Ensure the WebView host receives and clamps positive durations to 8..40 ms and preserves cancel-before-vibrate semantics where that does not cancel a still-active rapid press. If repeated `cancel()` calls cause perceived misses, replace cancellation with a bounded native pulse strategy that preserves distinct press edges.

## Chunk 3: Integrated Verification, Review, and PR

**Files:**
- Update: implementation plan checkboxes and evidence
- Update: design spec only if implementation discovers a necessary scope correction

- [ ] **Step 1: Run required checks**
  Run `pnpm --filter @xiaochao/web build`, `node --check runtime/j2me/keypad-canvas.js`, `node --check runtime/j2me/touchpad.js`, `pnpm --filter @xiaochao/mobile typecheck`, `pnpm mobile:prepare-web`, `pnpm mobile:verify-web`, and `git diff --check`. Remove generated artifacts from the PR worktree after verification.
- [ ] **Step 2: Record browser and haptic evidence**
  At narrow portrait and landscape viewports, verify D-pad arrows for all presets, `0.2 * --u` gap, pressed-state bounds, toolbar toggle stage bounds, and rotation transition. Use a browser bridge stub to record 24 ms defaults, rapid re-presses, multi-holder deduplication, and explicit duration values. Keep screenshot output and temporary browser profiles out of Git.
- [ ] **Step 3: Record Android/device limits**
  When Android tooling is available, build, install, and launch the APK; verify `android.permission.VIBRATE` and native message delivery. Report emulator and physical-device vibration separately. If unavailable, state that limitation and do not claim hardware haptics are fully validated.
- [ ] **Step 4: Complete cold-start review passes**
  Run R1 diff review, feature audit, and WebView/platform validation review in that order. Resolve P0/P1/P2 findings with a fixer after all applicable R1 passes complete. Re-run applicable cold-start reviews after fixes; stop by R3. Save reports under `docs/reviews/` using `docs/review-report-template.md`.
- [ ] **Step 5: Commit, push, and open one PR**
  Check `git diff --check`, commit only task files, push `fix/mobile-keypad-feedback`, search for duplicate PRs/templates with GitHub MCP, create one PR through GitHub MCP, then verify PR title/body/head/base/status through MCP.
