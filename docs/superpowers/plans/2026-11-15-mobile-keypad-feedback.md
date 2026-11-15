# Mobile Keypad Visual and Haptic Feedback Repair Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Repair the mobile keypad layout and visual regressions and improve touch haptic feedback in one PR.

**Architecture:** Preserve DOM hit targets and use Canvas as the only visible keypad renderer. Use existing touch layout mappings as the source of directional action labels. Keep toolbar controls overlaid on the runtime stage, and issue one 24 ms default native haptic for the first coarse-pointer holder of each key.

**Tech Stack:** React, CSS, Canvas, JavaScript, React Native WebView, TypeScript, Vite, pnpm, Playwright/browser automation.

---

## Files and Responsibilities

- `apps/web/src/App.jsx`: renders runtime controls and the collapsed-toolbar state.
- `runtime/j2me/style/main.css`: stage, toolbar, keypad spacing, and numeric pressed state.
- `runtime/j2me/keypad-canvas.js`: render arrows and pressed controls using live DOM rectangles and touch-layout semantics.
- `runtime/j2me/touchpad.js`: preserve deduplication and use the mobile default haptic request.
- `runtime/j2me/config/settings.js`: set the mobile default vibration duration.
- `apps/mobile/src/host/haptics.ts`: validate/clamp native haptic requests and dispatch to an injected vibration adapter.
- `apps/mobile/src/host/haptics.test.ts`: verify duration boundaries, invalid messages, and rapid consecutive dispatch.
- `apps/mobile/App.tsx`: delegate the bridge message to the tested native haptic helper.
- `docs/superpowers/specs/2026-11-15-mobile-keypad-feedback-design.md`: approved scope and acceptance contract.
- `docs/superpowers/plans/2026-11-15-mobile-keypad-feedback.md`: implementation and verification record.

## Chunk 1: Diagnose and Repair Keypad Geometry and Visuals

**Files:**
- Modify: `runtime/j2me/keypad-canvas.js`
- Modify: `runtime/j2me/style/main.css`
- Possibly modify: `apps/web/src/App.jsx`

- [x] **Step 1: Trace rendered and semantic D-pad mappings**
  Compare the four `TouchLayout` presets, CSS slot placement, `Touchpad` geometric direction lookup, and Canvas arrow rendering. Use this screen-slot to game-action mapping as the verification oracle: `standard` = up→up, right→right, down→down, left→left; `mirror` = up→up, right→left, down→down, left→right; `rotate-cw` = up→left, right→up, down→right, left→down; `rotate-ccw` = up→right, right→down, down→left, left→up.
- [x] **Step 2: Correct only the mismatched rendering/layout rules**
  Keep rectangles from `getBoundingClientRect()` as the position source. Make Canvas glyphs correspond to the action assigned to each rendered slot. Add spacing so adjacent D-pad and soft-key hit bounds have at least `0.2 * --u` clearance at the narrow portrait layout. Remove duplicate active offset/outline artifacts while preserving active colors.
- [x] **Step 3: Make toolbar an overlay without shrinking the stage**
  Inspect fullscreen and non-fullscreen player styles. Ensure the toolbar never reserves top height. Preserve the existing 56px safe-area column at the left while the toolbar is collapsed in landscape, including WebKit fullscreen. Confirm safe-area positioning and pointer interaction remain correct.
- [x] **Step 4: Capture and inspect visual states**
  Run the web app and capture narrow portrait, landscape, and rotation transition at idle and pressed states. Compare D-pad screen slots to the mapping in Step 1; measure adjacent D-pad/soft-key bounding rectangles for at least `0.2 * --u` clearance; confirm numeric pressed pixels and DOM controls stay within their pre-press bounds; verify toolbar toggles preserve stage height in fullscreen and non-fullscreen and collapsed landscape preserves the 56px safe-area column at the left; and inspect for overlap/clipping. Correct issues before proceeding.

## Chunk 2: Improve Mobile Haptic Feedback

**Files:**
- Modify: `runtime/j2me/config/settings.js`
- Inspect/modify: `runtime/j2me/touchpad.js`
- Create: `apps/mobile/src/host/haptics.ts`
- Create: `apps/mobile/src/host/haptics.test.ts`
- Inspect/modify: `apps/mobile/App.tsx`
- Reference: `apps/mobile/src/host/protocol.ts`

- [x] **Step 1: Set the mobile coarse-pointer default to 24 ms**
  Preserve explicit settings and desktop silence. Do not change repeat timers or emit haptics during hold/repeat.
- [x] **Step 2: Verify holder-edge and bridge behavior**
  Confirm one haptic request when a key's holder count changes from zero to one, including rapid release/re-press, and no second request for an additional holder of the same key. Verify bridge posting returns false or throws before the browser fallback is attempted; a successful asynchronous post must not trigger a duplicate fallback pulse.
- [x] **Step 3: Verify native duration bounds and rapid requests**
  Extract native payload validation/clamping and vibration dispatch into `apps/mobile/src/host/haptics.ts`, with `Vibration` passed as an adapter. Add Jest coverage asserting malformed/non-positive values are ignored; inputs `1`, `8`, `24`, `40`, and `41` produce bounded durations `8`, `8`, `24`, `40`, and `40`; and two accepted rapid messages each dispatch one pulse in order. Run `pnpm --filter @xiaochao/mobile exec jest --runInBand --config '{"transform":{"^.+\\.[jt]sx?$":"babel-jest"}}'`. Keep cancellation behavior only if the adapter test proves every accepted rapid request still dispatches; otherwise remove cancellation between presses and test the revised behavior.

## Chunk 3: Integrated Verification, Review, and PR

**Files:**
- Update: implementation plan checkboxes and evidence
- Update: design spec only if implementation discovers a necessary scope correction

- [x] **Step 1: Run required checks**
  Run `pnpm --filter @xiaochao/web build`, `node --check runtime/j2me/keypad-canvas.js`, `node --check runtime/j2me/touchpad.js`, `pnpm --filter @xiaochao/mobile typecheck`, `pnpm mobile:prepare-web`, `pnpm mobile:verify-web`, and `git diff --check`. Remove generated artifacts from the PR worktree after verification.
  Re-run after the `origin/main` rebase: Web build, both runtime syntax checks, mobile typecheck, haptic Jest (13 tests), mobile resource preparation and verification (52.0 MiB), and `git diff --check` all pass.
- [x] **Step 2: Record browser and haptic evidence**
  At narrow portrait and landscape viewports, verify D-pad arrows for all presets, `0.2 * --u` gap, pressed-state bounds, toolbar toggle stage height, the 56px left safe-area column while collapsed in landscape, and rotation transition. Use a browser bridge stub to record 24 ms defaults, rapid re-presses, multi-holder deduplication, and explicit duration values. Keep screenshot output and temporary browser profiles out of Git.
  Latest Chrome CDP runs pass: portrait gaps are 7.56px against a 7.55px minimum; all four D-pad maps match; numeric pressed bounds are unchanged; landscape collapsed stage is `left=56,width=788,height=390`; expanded stage is `844x390`; haptics are native `[24,24,40]`, fallback `[40]`, and desktop default `0`. Fullscreen request is denied by headless Chrome (`TypeError: not granted`), so only the failure path is recorded.
- [x] **Step 3: Record Android/device limits**
  The Android release build was attempted but could not start because this environment has no Java runtime; `adb` is also unavailable. The manifest declares `android.permission.VIBRATE`, and the generated Android assets contain the staged 52 MiB WebView package. APK resource inspection, install/launch, emulator vibration, and physical-device vibration remain unverified.
- [x] **Step 4: Complete cold-start review passes**
  Run R1 diff review, feature audit, and WebView/platform validation review in that order. Resolve P0/P1/P2 findings with a fixer after all applicable R1 passes complete. If a P0/P1 cannot be fixed safely, escalate and stop delivery. Re-run applicable cold-start reviews after fixes; stop by R3. A P2 remaining after R3 blocks delivery unless an authorized owner records risk acceptance, follow-up owner, and due/target date in a traceable artifact. Save reports under `docs/reviews/` using `docs/review-report-template.md`.
- [ ] **Step 5: Commit, push, and open one PR**
  Check `git diff --check`, commit only task files, push `fix/mobile-keypad-feedback`, search for duplicate PRs/templates with GitHub MCP, create one PR through GitHub MCP, then verify PR title/body/head/base/status through MCP. Finish the PR description or delivery report with branch, commit, PR URL/status, core files and behavior changes, verification commands/results, absolute build artifact paths if produced, and unverified scenarios/environment limits/residual risks.
