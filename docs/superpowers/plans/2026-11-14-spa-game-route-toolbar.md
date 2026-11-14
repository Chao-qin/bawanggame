# SPA Game Route and Runtime Toolbar Implementation Plan

> **For agentic workers:** Implement this plan in the task worktree.

**Goal:** 用 hash SPA 路由管理大厅和游戏，并整理运行时顶部控制。

**Architecture:** `App.jsx` 负责路由解析、导航和原生返回确认；`Player` 负责统一 toolbar 与播放器卸载；`PhoneMarkup`/runtime CSS 隐藏旧视觉状态条并为 toolbar 让出稳定层级。

**Tech Stack:** React 18, browser History API, CSS, Vite.

---

### Task 1: Route state and browser back handling

**Files:** `apps/web/src/App.jsx`

- [x] Add hash route encode/decode helpers for library and play routes.
- [x] Initialize app state from hash and synchronize `hashchange`/`popstate`.
- [x] Push game routes and tab routes instead of only changing React state.
- [x] While playing, restore the current game route and open the existing exit confirmation when native back fires.
- [x] Confirmed exit cleans up runtime/fullscreen and commits the library route; cancelled exit restores the game route.

### Task 2: Unified runtime toolbar

**Files:** `apps/web/src/App.jsx`, `apps/web/src/runtime/PhoneMarkup.jsx`, `runtime/j2me/style/main.css`, `apps/web/uno.config.js`

- [x] Move all player controls into a fixed toolbar with explicit accessible buttons.
- [x] Keep settings compatibility by invoking the legacy `#gear` button without rendering its old visual placeholder.
- [x] Keep fit width/height and fullscreen controls usable in every rotation and fullscreen mode.
- [x] Remove the visible legacy device status bar and reserve toolbar-safe runtime space.

### Task 3: Verification

**Files:** build output only

- [x] Run `git diff --check` and `pnpm build` in the task worktree.
- [ ] Inspect the generated app and exercise route/control behavior against the existing local service.
- [ ] Commit and push the single branch for one PR.
