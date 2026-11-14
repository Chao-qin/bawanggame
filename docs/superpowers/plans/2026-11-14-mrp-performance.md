# MRP Performance Fix Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reduce MRP frame submission overhead in mobile WebView while preserving rendering, controls, and fallback compatibility.

**Architecture:** Pre-create the MRP canvas 2D context with low-latency, opaque options before Emscripten initializes, so the generated runtime reuses that context. Gate verbose Emscripten logs behind `mrpDebug=1`; production keeps the console quiet while debugging remains available by URL.

**Tech Stack:** Plain browser JavaScript, Emscripten WASM MRP runtime, React/Vite web build, Node HTTP server, Chrome CDP smoke checks.

---

## Chunk 1: Runtime change

### Task 1: Preconfigure the MRP Canvas

**Files:**
- Modify: `runtime/mrp/mrp-runtime.js:104-126`

- [x] Add a guarded `canvas.getContext('2d', { alpha: false, desynchronized: true })` call before `window.Module` is created.
- [x] Set `imageSmoothingEnabled = false` when the context exposes that property.
- [x] Keep the existing Canvas element and dimensions unchanged; if context creation throws, continue with Emscripten's normal fallback.

### Task 2: Gate runtime logs

**Files:**
- Modify: `runtime/mrp/mrp-runtime.js:285-325`

- [x] Read `mrpDebug=1` from the current URL.
- [x] Use no-op `Module.print` and `Module.printErr` functions by default.
- [x] Restore `console.log` and `console.error` only when `mrpDebug=1` is present.

### Task 3: Commit the runtime patch

- [x] Run `node --check runtime/mrp/mrp-runtime.js`.
- [x] Run `git diff --check`.
- [x] Commit with `perf: reduce mrp canvas overhead`.

## Chunk 2: Build and runtime verification

### Task 4: Build the web application

**Files:**
- No source changes expected.

- [x] Run `pnpm build`.
- [x] Confirm the web build contains the updated runtime version.

### Task 5: Smoke test an MRP game

**Files:**
- No source changes expected.

- [x] Use the existing Node service on port 8080 and open a known MRP route directly.
- [x] Verify the player, Canvas, WASM `Module`, 240x320 internal surface, and virtual keypad exist.
- [x] Verify the default page emits no runtime console logs after startup, then repeat with `?mrpDebug=1` and confirm logs are available.

### Task 6: Measure frame pacing

**Files:**
- No source changes expected.

- [x] Record five seconds of `requestAnimationFrame` intervals with Chrome CDP.
- [x] Record long tasks and report average frame interval, p95 interval, frames over 33ms, and maximum long task.
- [x] Run `git status --short --branch` and ensure only intended commits/files are present.

### Task 7: Finalize PR branch

- [x] Summarize the measured result and residual device-specific risk.
- [x] Provide the branch and commit for PR creation.
