# Unified Responsive UI Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Unify the library, stores, navigation, runtime controls, and legacy runtime CSS across responsive browser and embedded WebView layouts, while adding durable UI development standards.

**Architecture:** Keep the responsive contract as the sole viewport/safe-area event owner. Separate app shell, catalog entries, and runtime geometry into explicit style/component domains; use semantic tokens and shared controls without changing game-engine or input-mapping behavior. Verify geometry and workflows in Chromium, then validate the packaged WebView assets.

**Tech Stack:** React 18, Ant Design Mobile, Vite, UnoCSS, legacy simulator CSS/JavaScript, Node browser smoke harness, Android asset verification scripts.

---

## Chunk 1: Baseline And Standards

### Task 1: Record baseline behavior and implementable geometry probes

**Files:**
- Modify: `apps/web/verify.mjs`
- Reference: `docs/superpowers/specs/2026-11-21-unified-responsive-ui-design.md`

- [x] **Step 1: Map current route fixtures and browser harness lifecycle**

Inspect `apps/web/verify.mjs`, `package.json`, and `apps/server/package.json`. Record the exact command that serves `BASE_URL`, the available route fixtures, and current conditional skips. Do not assume a remote catalog is available in offline CI.

- [x] **Step 2: Add viewport snapshots for library and stores**

Extend the CDP harness to navigate with `location.hash` to each library/store route at the approved viewport matrix. Capture shell/nav/card/filter rectangles and document scroll dimensions. Assert horizontal overflow, navigation bounds, card action overlap, and content clearance. Mock only catalog endpoints that are unavailable in the local test server.

- [x] **Step 3: Add runtime geometry assertions**

Capture toolbar, game surface, legacy `#display`, `#nav`, `#numpad`, and touch control regions when present. Assert viewport containment and no unintended overlap, while preserving existing gameplay input assertions. If JAR/MRP fixtures are absent, log an explicit skip and retain their current optional fixture contract.

- [x] **Step 4: Run baseline checks and record failing cases**

Run: `pnpm --filter @xiaochao/web build`

Run: `pnpm --filter @xiaochao/web dev -- --host 127.0.0.1 --port 5173` in one terminal, then in another run `VERIFY_BASE_URL=http://127.0.0.1:5173/ node apps/web/verify.mjs`.

Expected: output includes measured geometry and names each failing viewport/check; optional JAR/MRP scenarios are clearly marked `SKIP`.

### Task 2: Add UI development standards

**Files:**
- Create: `docs/ui-development-standards.md`
- Reference: `AGENTS.md`
- Reference: `docs/superpowers/specs/2026-11-21-unified-responsive-ui-design.md`

- [x] **Step 1: Document directory ownership**

Define the responsibilities of `apps/web/src`, its reusable components, runtime adapters, responsive contract, styles, tests, and the legacy `apps/mobile/web` runtime assets. State where new app UI must live and when legacy files may be changed.

- [x] **Step 2: Document component and styling rules**

Specify semantic token usage, component APIs/variants, stable geometry, accessible icon controls, text overflow behavior, focus states, touch targets, and status/empty/loading patterns.

- [x] **Step 3: Document the UI change workflow**

Include task contract, acceptance metrics, responsive matrix, browser/WebView checks, review checklist, generated artifact exclusions, and honest device coverage reporting.

## Chunk 2: Tokens And Shared Components

### Task 3: Consolidate semantic theme tokens

**Files:**
- Create: `apps/web/src/styles/tokens.css` (only if an existing stylesheet cannot own tokens cleanly)
- Modify: `apps/web/src/main.jsx`
- Modify: `apps/web/uno.config.js`
- Modify: `apps/web/src/mobile-ui.css`

- [x] **Step 1: Add semantic default-theme tokens**

First confirm stylesheet ownership and import order. Define background/surface/text/border/accent/danger/focus, spacing, radius, typography, control sizing, and content-width tokens in the smallest existing owner; create `tokens.css` only if it reduces duplication without introducing another style entrypoint. Preserve the current dark and teal visual direction.

- [x] **Step 2: Remove duplicate token ownership**

Import the token stylesheet once. Replace duplicated hard-coded theme values in UnoCSS runtime toolbar shortcuts and app CSS with semantic variables. Keep engine-owned colors in `apps/mobile/web` only where they represent game rendering rather than application chrome.

- [x] **Step 3: Build and scan for remaining app-level literals**

Run: `pnpm --filter @xiaochao/web build`

Review `mobile-ui.css` and `uno.config.js` for accidental parallel theme definitions.

### Task 4: Extract shared application UI components

**Files:**
- Create as needed: `apps/web/src/components/PrimaryNavigation.jsx`
- Create as needed: `apps/web/src/components/GameEntry.jsx`
- Create as needed: `apps/web/src/components/SectionHeading.jsx`
- Create as needed: `apps/web/src/components/StatusPanel.jsx`
- Modify: `apps/web/src/App.jsx`
- Modify: `apps/web/src/mobile-ui.css`

- [x] **Step 1: Map current JSX ownership and choose focused extraction boundaries**

Identify existing repeated markup and public behavior in `App.jsx`. Extract only components that reduce meaningful duplication or make layout ownership explicit; do not create a component per element or move files only to satisfy the proposed directory tree.

- [x] **Step 2: Extract primary navigation when it clarifies responsive ownership**

Preserve existing route IDs, history behavior, active-page semantics, labels, and icon library. Render a single navigation component whose placement is controlled by responsive layout.

- [x] **Step 3: Extract game entry**

Support library, recent/popular, archive store, bundled Flash, and 52java metadata/action variants while keeping icon/art geometry and title/action alignment stable.

- [x] **Step 4: Normalize section and status patterns**

Review found no further extraction needed: existing status and section patterns have distinct retry/action contracts. Their behavior and copy remain unchanged.

- [x] **Step 5: Run build and browser checks**

Run: `pnpm --filter @xiaochao/web build`

Run the server using `pnpm --filter @xiaochao/server dev`, then run `node apps/web/verify.mjs`.

Expected: route, tab, add/install, and player workflows remain functional.

## Chunk 3: Shell And Catalog Layout

### Task 5: Rework navigation and application shell breakpoints

**Files:**
- Modify: `apps/web/src/mobile-ui.css` or create `apps/web/src/styles/app-shell.css` if the existing stylesheet's ownership is too broad
- Modify: `apps/web/src/App.jsx`
- Modify: `apps/web/src/components/PrimaryNavigation.jsx`
- Modify: `apps/web/verify.mjs`

- [x] **Step 1: Implement phone bottom navigation**

Use stable icon/label columns, safe-area-aware height, and a shared measured layout token for content clearance. Ensure active and focus states remain visible.

- [x] **Step 2: Implement tablet/desktop top navigation**

Move navigation into the header flow at tablet/desktop widths. Keep order and active route unchanged; constrain content width and avoid fixed overlays.

- [x] **Step 3: Validate shell geometry**

Run the browser matrix and assert navigation visibility/bounds, content clearance, and no horizontal overflow at compact width and short landscape.

### Task 6: Normalize library and store entry layouts

**Files:**
- Modify: `apps/web/src/components/GameEntry.jsx`
- Modify: `apps/web/src/App.jsx`
- Modify: existing app shell/catalog stylesheet or the focused files created in Task 5
- Modify: `apps/web/verify.mjs`

- [x] **Step 1: Implement narrow-screen list entries**

Use a consistent row with fixed icon/art geometry, flexible text column, and stable action column where an action exists. Stack search, category, and submit controls when they cannot fit without shrinking touch targets.

- [x] **Step 2: Implement wider-screen adaptive grids**

Define minimum usable card widths and bounded content width. Keep title, source metadata, size/count, and primary action hierarchy consistent across catalog variants.

- [x] **Step 3: Validate long content and states**

Test long Chinese/Latin names, missing artwork, loading, empty, error, offline, installed, and disabled states at 320px and 365px widths. Assert no action overlap or unlabeled icon control.

## Chunk 4: Runtime Geometry And Legacy CSS

### Task 7: Make React runtime layout consume one responsive state

**Files:**
- Modify: `apps/web/src/App.jsx`
- Modify: `apps/web/src/responsive.js` only if an event detail/token is missing
- Modify: existing runtime shell stylesheet or a focused runtime stylesheet if extraction is justified
- Modify: `apps/web/verify.mjs`

- [ ] **Step 1: Remove duplicate viewport-derived state**

Derive toolbar orientation/collapse behavior from the responsive contract event/data attributes where possible. Preserve user collapse choice across resize only according to the confirmed orientation-specific behavior.

- [x] **Step 2: Define explicit runtime regions**

The existing Flash runtime already separates toolbar, game surface, controls, and overlays; this task preserves that boundary and validates its fullscreen behavior.

- [x] **Step 3: Validate Flash and React runtime geometry**

Flash portrait/landscape, fullscreen entry/exit, stage containment, touch controls, keyboard focus, and paired keydown/keyup passed. Safe-area simulation remains unverified.

### Task 8: Govern legacy simulator runtime CSS

**Files:**
- Modify: `runtime/j2me/style/main.css`
- Modify: `apps/web/src/mobile-ui.css` or runtime stylesheet established by Task 7
- Modify: `apps/web/verify.mjs`
- Reference: runtime DOM/API in `apps/mobile/web` and React runtime adapters

- [x] **Step 1: Map ownership and cascade before editing**

Inventory selectors affecting `#phone`, `#display-container`, `#display`, `#nav`, `#numpad`, `#keypad`, `.playerStage`, toolbar, fullscreen, and orientation. Record which file owns each layout boundary in comments/docs where ownership is not obvious.

- [x] **Step 2: Consolidate app-level runtime layout rules**

Group rules by runtime domain and remove conflicting duplicate overrides. Preserve engine-required selectors and JavaScript contracts; do not change key mappings or engine code.

- [x] **Step 3: Implement side-controls/center-surface landscape geometry**

Reserve side regions and center the game display with intrinsic aspect ratio. Scale keypad/control dimensions and gaps against available height while respecting minimum hit targets and safe-area insets.

- [x] **Step 4: Preserve portrait and short-height behavior**

Short-height landscape scaling is defined. Actual J2ME portrait geometry remains unverified without a JAR fixture; synthetic portrait geometry is explicitly skipped because the emulator has no initialized game canvas.

- [x] **Step 5: Verify runtime regression matrix**

J2ME landscape geometry passed at 844x390 and 667x375. JAR/MRP gameplay, portrait, and touch event checks were skipped because no fixtures are available.

## Chunk 5: WebView, Review, And Delivery

### Task 9: Validate mobile WebView packaging and safe areas

**Files:**
- Modify: `apps/mobile/scripts/verify-web-assets.mjs` only if new required assets are introduced
- Modify: `apps/web/verify.mjs`
- Reference: `apps/mobile/App.tsx`

- [ ] **Step 1: Prepare and verify packaged Web assets**

Run: `pnpm mobile:prepare-web`

Run: `pnpm mobile:verify-web`

Confirm the new shared components/styles are included and generated staging files remain untracked.

- [ ] **Step 2: Validate host inset lifecycle**

Run existing host/type checks and browser simulation for versioned inset updates, rotation, fullscreen, and teardown. Verify root safe-area tokens update without stale values.

- [ ] **Step 3: Build Android only if toolchain is available**

Run: `pnpm mobile:build-android`

Inspect required Web assets and bundle in the APK. Report build/install/launch results separately; do not claim real-device verification without a physical device.

### Task 10: Final regression and one-PR review

**Files:**
- All files changed by Tasks 1-9
- Create review evidence under `docs/reviews/` if required by repository review workflow

- [x] **Step 1: Run all non-destructive applicable checks**

Run:

```sh
pnpm --filter @xiaochao/web build
node apps/web/verify.mjs
pnpm mobile:verify-web
pnpm mobile:typecheck
git diff --check
```

Web build, Chromium viewport/workflow smoke, `node --check apps/web/verify.mjs`, `pnpm mobile:typecheck`, and `git diff --check` passed. `pnpm mobile:prepare-web` was not run because it recursively deletes and recreates existing ignored user directories `apps/mobile/web` and `apps/mobile/android/app/src/main/assets/web`. Consequently packaged WebView/APK verification remains pending.

- [ ] **Step 2: Perform cold-start diff and feature review**

Use `docs/review-matrix.md` and `docs/review-report-template.md`. Review the current diff, workflows, validation evidence, platform limitations, and residual risks before any fixer changes.

- [ ] **Step 3: Fix findings and repeat applicable review passes**

Complete all required review passes in order, stop on unresolved P0/P1 or unaccepted P2 per repository rules, and do not exceed R3.

- [ ] **Step 4: Prepare one PR**

Keep one branch and one PR for the complete task. Search for the repository PR template through GitHub MCP before PR creation; include scope, behavior, verification evidence, build paths, and residual risks.
