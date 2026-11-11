# 52java Modern Phone Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a controlled 52java storefront that downloads JARs into the local library and modernize the simulator shell without breaking the legacy runtime.

**Architecture:** Extend the existing Node server with allowlisted 52java catalog/download endpoints. Add a React marketplace view and refreshable local library state, then improve the app shell and phone overlay with CSS/Uno shortcuts while preserving runtime element ids.

**Tech Stack:** React 18, Vite, UnoCSS, Node HTTP/TypeScript, yauzl, browser local storage.

---

### Task 1: 52emu server adapter

**Files:** Modify `apps/server/src/index.ts`, `apps/server/test/smoke.test.ts`.

- [x] Parse `index.php` search/category/page results and game detail download options.
- [x] Restrict download redirects to `java.52emu.cn` and `d2.52emu.cn`, enforce JAR size/signature, and avoid overwrite.
- [x] Add `GET /__52java/catalog` and `GET /__52java/download?id=...` with useful JSON errors.
- [x] Verify endpoint contracts and live 52emu catalog/download through HTTP.
- [x] Run server typecheck and tests.

### Task 2: Marketplace UI and library refresh

**Files:** Modify `apps/web/src/App.jsx`, `apps/web/uno.config.js`, `apps/web/vite.config.js`.

- [x] Add 52java navigation and catalog hook with loading/error/retry states.
- [x] Add download buttons with per-item progress state, successful local-library refresh, and open-original-site action.
- [x] Refresh the local JAR list after server downloads.
- [x] Add modern shell sections, filters, stats, and responsive card styles.
- [x] Build the web app.

### Task 3: Modern simulator shell

**Files:** Modify `apps/web/src/App.jsx`, `apps/web/src/runtime/PhoneMarkup.jsx`, `apps/web/uno.config.js`.

- [x] Add a runtime toolbar with status/exit affordances and accessible labels.
- [x] Add device status indicators and modern framing while preserving legacy ids and keyboard controls.
- [x] Check mobile and desktop sizing in browser.

### Task 4: End-to-end verification and integration

- [x] Start the server and production web build in the feature clone.
- [x] Verify root page, marketplace, live catalog, download success, JAR list refresh, and simulator view in Chromium.
- [x] Fix issues found during browser inspection.
- [ ] Commit feature branch, merge into main, rebuild package, and report the resulting artifact.
