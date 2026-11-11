# J2ME Local JAR and Exit Cleanup Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make installed JARs load from IndexedDB and stop the J2ME runtime cleanly when leaving a game.

**Architecture:** Keep server JARs on the existing `jar/` URL path. Prefix local identifiers with `local:` so the legacy loader selects `LocalJars.load()`. Add an idempotent cleanup bridge in the React runtime wrapper and invoke it before the existing page reload fallback.

**Tech Stack:** React 18, browser IndexedDB, legacy J2ME JavaScript runtime, Vite.

---

## Chunk 1: Local JAR resolution

### Task 1: Pass the correct local identifier

**Files:**
- Modify: `apps/web/src/runtime/J2MEPlayer.jsx`

- [x] Set `window.__XIAOCHAO_RUNTIME_JAR` to `local:<decoded filename>` for local games and retain `jar/<filename>` for server games.
- [x] Keep decoding exactly once before adding the prefix.
- [x] Confirm the value matches `LocalJars.isLocal()` in `runtime/j2me/config/localjars.js`.

## Chunk 2: Runtime teardown

### Task 2: Add idempotent J2ME cleanup

**Files:**
- Modify: `apps/web/src/runtime/J2MEPlayer.jsx`
- Modify: `apps/web/src/App.jsx`

- [x] Add a cleanup function that calls exposed runtime stop/flush hooks when present, removes runtime-created overlays/canvas nodes, clears runtime globals, and removes `runtime-active`.
- [x] Expose the active VM context so `Player.exit()` can stop it before reloading.
- [x] Make React effect cleanup call the same runtime stop hooks and tolerate missing hooks.
- [x] Preserve full-screen exit and page reload as the final isolation fallback.

## Chunk 3: Verification

### Task 3: Build and inspect the behavior

**Files:**
- No additional files.

- [x] Run `pnpm --filter @xiaochao/web build`.
- [x] Run `pnpm --filter @xiaochao/server typecheck`.
- [x] Inspect the built runtime path for `local:<filename>` and `jar/<filename>` identifiers. Manual browser exercise remains recommended because no browser harness is configured.
