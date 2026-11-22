# MRP Catalog Availability and Artwork Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show the tracked MRP catalog in the default deployment, accurately gate launch by installed runtime/package availability, and display supplied covers or a clear placeholder.

**Architecture:** Add a small server catalog module that reads and validates the tracked manifest and enriches entries with runtime/package state. Serve it through `/__mrp/catalog`; the React library consumes the API and passes launch availability and artwork through the existing game-menu path. Package the tracked catalog in the default Docker image without packaging proprietary MRP binaries.

**Tech Stack:** Node.js 22, TypeScript, React 18, Vite, Vitest, existing Docker/Compose setup.

---

## Chunk 1: Server Catalog Contract

**Files:**
- Create: `apps/server/src/mrpCatalog.ts`
- Create: `apps/server/test/mrpCatalog.test.ts`
- Modify: `apps/server/src/index.ts`
- Modify: `Dockerfile`
- Modify: `apps/server/test/smoke.test.ts`

- [ ] **Step 1: Add failing catalog and availability tests**

Test a valid tracked manifest, missing manifest, malformed manifest, empty manifest, missing runtime, missing package, and a complete install. Test artwork URL selection accepts only a safe local URL/path and preserves absent covers as `null`.

- [ ] **Step 2: Run the focused server tests**

Run: `pnpm --filter @xiaochao/server test -- mrpCatalog`

Expected: FAIL because the catalog loader/enrichment module does not exist.

- [ ] **Step 3: Implement manifest loading and resource status**

Create pure helpers accepting manifest records and booleans for runtime/package existence. Validate `file` as a basename ending in `.mrp`; preserve name/vendor/description/size/dimensions; return `runtimeAvailable`, `gameAvailable`, `available`, and optional `iconUrl`. A missing optional vendor directory is a normal unavailable state, not an empty catalog.

- [ ] **Step 4: Add `/__mrp/catalog`**

Read the tracked `maopao-revival/hall/manifest.json` and stat the vmrp entry point and each referenced game file. Return `{ games, runtimeAvailable }`. Return a non-2xx JSON error for unreadable/malformed catalog data; do not convert it to `games: []`.

- [ ] **Step 5: Package the tracked catalog in Docker**

Copy `maopao-revival/hall/manifest.json` into the image at its tracked-source path. Remove the Dockerfile command that creates an empty vendor directory and writes `[]`; keep proprietary games and vmrp runtime out of the default image. Preserve the optional Compose mounts.

- [ ] **Step 6: Run server tests and commit**

Run: `pnpm --filter @xiaochao/server test && pnpm --filter @xiaochao/server typecheck`

Expected: all existing and new tests pass.

Commit: `fix: serve the tracked maopao catalog`

## Chunk 2: React Availability and Artwork States

**Files:**
- Modify: `apps/web/src/App.jsx`
- Modify: `apps/web/src/components/GameEntry.jsx`
- Modify: `apps/web/src/mobile-ui.css`
- Test: `apps/web/src/runtime/mrpCatalog.test.mjs` or existing browser verifier contract

- [ ] **Step 1: Add a failing web contract test**

Test normalization of server records into MRP game entries, retaining `available`, `availabilityReason`, and `iconUrl`; test that unavailable entries remain selectable for details but cannot invoke Start.

- [ ] **Step 2: Run the focused test**

Run: `node --test apps/web/src/runtime/mrpCatalog.test.mjs`

Expected: FAIL before the normalizer and launch-state contract are added.

- [ ] **Step 3: Switch the MRP library to the catalog API**

Fetch `/__mrp/catalog`, validate the response shape, and preserve HTTP/malformed response failures as visible list errors. Map returned availability and optional artwork into game records.

- [ ] **Step 4: Gate launch without hiding catalog entries**

Keep unavailable cards browsable. In the game dialog, show the precise missing-runtime or missing-game state and disable Start. Do not block navigation to the details dialog or hide records.

- [ ] **Step 5: Render honest artwork fallback**

Pass a provided safe cover URL to `GameArtwork`; when absent or broken, render the existing title-derived fallback with a distinct MRP placeholder style/label. Do not synthesize screenshots or ship proprietary images.

- [ ] **Step 6: Run focused browser/web tests and commit**

Run: `node --test apps/web/src/runtime/mrpCatalog.test.mjs && pnpm --filter @xiaochao/web build`

Expected: tests pass and production build succeeds.

Commit: `feat: show maopao catalog availability in library`

## Chunk 3: Docker and Browser Verification

**Files:**
- Modify: `apps/web/verify.mjs`
- Modify: `scripts/verify-web-docker.mjs` if it owns default-image assertions
- Modify: `README.md`

- [ ] **Step 1: Add default and configured catalog smoke checks**

Verify the default server returns the tracked catalog, reports MRP runtime unavailable, and marks entries non-launchable. With a temporary runtime entry and one package fixture, verify that entry becomes launchable. Verify missing artwork renders the explicit placeholder and an optional supplied artwork URL is used.

- [ ] **Step 2: Run browser verification**

Start the PR worktree Vite server with the Node server as proxy target. Run the browser verifier on `/library/maopao`, asserting a nonzero catalog count, visible unavailable status, disabled Start, and artwork fallback.

- [ ] **Step 3: Run Docker verification**

Run: `node scripts/verify-web-docker.mjs`

Expected: the default image serves catalog entries and does not claim game/runtime availability; no MRP proprietary package is included.

- [ ] **Step 4: Review, push, and create one PR**

Run `git diff --check`, the full server/web tests, build, and `git status --short`. Search for an existing PR and PR template using GitHub MCP, push `fix/maopao-catalog-artwork`, create one PR, and verify its metadata through MCP.

Record that actual game launch and real cover images require a user-supplied vmrp runtime/game library or approved artwork; the default catalog-only Docker image must not claim otherwise.
