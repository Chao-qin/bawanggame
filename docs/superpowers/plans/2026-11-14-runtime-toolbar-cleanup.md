# Runtime Toolbar and Cleanup Implementation Plan

> **For agentic workers:** Implement this plan in the task worktree.

**Goal:** Simplify the runtime toolbar and make runtime teardown complete.

**Architecture:** React owns visible controls and shell state; the J2ME runtime exposes an idempotent cleanup hook for timers, listeners, and dynamic DOM; CSS keeps runtime styles scoped and removes stale overlays on teardown.

**Tech Stack:** React 18, browser Fullscreen API, vanilla runtime JavaScript, CSS.

---

### Task 1: Toolbar and settings-driven shell

**Files:** `apps/web/src/App.jsx`, `apps/web/src/runtime/J2MEPlayer.jsx`, `runtime/j2me/style/main.css`

- [x] Remove width/height controls from the React toolbar.
- [x] Apply runtime config values to body classes and data attributes while the game is mounted.
- [x] Keep the settings trigger and fullscreen control reachable above the runtime stage.

### Task 2: Runtime teardown

**Files:** `runtime/j2me/runtime-extras.js`, `runtime/j2me/keymap.js`, `apps/web/src/runtime/J2MEPlayer.jsx`, `apps/web/src/runtime/MrpPlayer.jsx`, `apps/web/src/App.jsx`

- [x] Add idempotent runtime cleanup for intervals, wake lock, listeners, pending input, and dynamic nodes.
- [x] Invoke cleanup before route unmount and clear global runtime state.
- [x] Remove stale overlays and runtime styles so the library regains pointer and scroll interaction.

### Task 3: Verification and delivery

- [x] Run `git diff --check` and `pnpm build`.
- [ ] Run `pnpm run pack` after the repository's ignored MRP vendor assets are available.
- [ ] Exercise the service at `http://localhost:8080` and verify runtime exit cleanup.
- [ ] Commit, push, and deliver one PR.
