# Flash Local Store Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a local-only Flash store that downloads or imports SWF files into the user's IndexedDB and plays them through the existing Ruffle player.

**Architecture:** Keep server storage unchanged. Add a browser IndexedDB repository for Flash records, a Flash Store route with built-in metadata plus URL/file import controls, and extend the existing Flash library/player to load local Blob records through object URLs.

**Tech Stack:** React 18, Vite, browser IndexedDB, Blob/object URLs, existing Ruffle runtime, Node smoke server.

---

## Chunk 1: Local Flash Repository

### Task 1: Add IndexedDB repository and validation

**Files:**
- Create: `apps/web/src/localFlash.js`
- Modify: `apps/web/src/types.d.ts` only if the existing declarations need the API exposed to TypeScript tooling

- [ ] **Step 1: Implement database open/list/get/add/remove helpers**

  Use database `flash-local`, version `1`, object store `games` with `keyPath: "id"` and a unique `dedupeKey` index. Store Blob data, source type (`bundled`, `remote`, or `file`), and metadata in one record. Generate an id with `crypto.randomUUID()` when available, with a timestamp/random fallback for older WebViews.

- [ ] **Step 2: Add SWF and size validation**

  Accept only `FWS`, `CWS`, or `ZWS` signatures and reject files larger than 64 MiB before opening a write transaction. Normalize names and descriptions while preserving the original source URL. Require exactly one source (URL or local file), accept only `http/https` URLs, and use a chunked remote reader with an abort controller so a missing `Content-Length` cannot bypass the limit.

- [ ] **Step 3: Add clear errors and deterministic ordering**

  Return valid records sorted by `addedAt` descending, report and skip malformed records, and surface database open/upgrade/quota errors. Derive a stable `dedupeKey` from catalog id, normalized URL, or local file SHA-256; enforce it with a unique index and replace Blob/metadata while preserving `id` and `addedAt` on repeat imports.

- [ ] **Step 4: Run the web build**

  Run `pnpm --filter @xiaochao/web build`.

  Expected: Vite build succeeds.

## Chunk 2: Flash Library and Player Integration

### Task 2: Load local Flash records in the library

**Files:**
- Modify: `apps/web/src/App.jsx:1-450`
- Modify: `apps/web/src/runtime/FlashPlayer.jsx:1-70`

- [ ] **Step 1: Add local Flash hook and route data**

  Import the repository, call the hook unconditionally from `Library`, merge local records only for `kind === "flash"`, and encode `local=1` plus the record id in the existing play hash.

- [ ] **Step 2: Add local game menu actions**

  Mark local records with `local: true`, show the existing uninstall action, and delete the IndexedDB record after confirmation. Keep J2ME local jar behavior unchanged.

- [ ] **Step 3: Make FlashPlayer resolve local Blob data**

  For local games call `LocalFlash.get(game.file)`, create an object URL, load it with Ruffle, and revoke it during cleanup. If the id is missing or malformed, show a player failure with a return-to-library action. Keep the current `/flash/<file>` path for bundled games.

- [ ] **Step 4: Preserve route and lifecycle behavior**

  A page reload on a local Flash play hash must recover by id. Exiting must remove the player and object URL without forcing a full page reload.

- [ ] **Step 5: Run existing build and Flash smoke checks**

  Run `pnpm --filter @xiaochao/web build` and the existing `node apps/web/verify.mjs` against the local server.

  Expected: existing bundled Flash startup, responsive layout, exit, and re-entry checks remain green.

## Chunk 3: Flash Store UI

### Task 3: Add the local-only Flash Store route and controls

**Files:**
- Modify: `apps/web/src/App.jsx:10-30,454-513,760-781`
- Modify: `apps/web/uno.config.js` only if the existing store classes cannot express the form layout

- [ ] **Step 1: Add a `flash-store` tab and route rendering**

  Keep the existing `store` tab for 52java. Render a new `FlashStore` component for `flash-store` and leave all other tabs on `Library`.

- [ ] **Step 2: Add built-in catalog and import form**

  Show metadata for the bundled SWFs as downloadable local entries using an explicit bundled source and catalog id. Add a form with required name, optional description, and mutually exclusive SWF URL or hidden `.swf` file input. The form submits through the same repository validation path and rejects both/neither source. Register `flash-store` in `TAB_IDS`, route it as `#/library/flash-store`, and keep direct-load fallback/history behavior explicit.

- [ ] **Step 3: Add download states and errors**

  Disable the active action during download/import, show “已加入” for records already present, and render errors for CORS, HTTP, size, invalid SWF, duplicate, quota, or IndexedDB failures without writing partial data.

- [ ] **Step 4: Add local store smoke flow**

  Extend `apps/web/verify.mjs` or add a focused browser smoke script to import the bundled sample SWF through the Flash Store, verify the local card, reload the page, start it, exit, assert `URL.revokeObjectURL` and no `ruffle-player`, and delete it. Also navigate to a missing local id and verify the failure state can return to the Flash library.

- [ ] **Step 5: Run web checks**

  Run `pnpm --filter @xiaochao/web build`, `pnpm --filter @xiaochao/server typecheck`, and the browser smoke flow.

## Chunk 4: Packaging and Delivery

### Task 4: Verify mobile packaging and prepare the PR

**Files:**
- Modify: `apps/mobile/README.md` only if the local Flash workflow needs documentation
- Create: `docs/reviews/...` review artifacts as required by `AGENTS.md`

- [ ] **Step 1: Verify generated assets**

  Run `pnpm mobile:prepare-web` and `pnpm mobile:verify-web`.

- [ ] **Step 2: Build the Android release APK**

  Run `pnpm mobile:build-android` and inspect the APK for the existing Ruffle/Web assets. Confirm no user Flash records are included in generated assets.

- [ ] **Step 3: Run `git diff --check` and review status**

  Confirm only source, docs, and review artifacts are tracked; remove generated `public/`, `site-deploy/`, `apps/mobile/web/`, APKs, and temporary browser profiles from version control.

- [ ] **Step 4: Commit and push**

  Use focused commits with `feat: add local flash store` and `docs: record flash store verification`, push `feat/flash-local-store`, and create one GitHub PR from that branch.
