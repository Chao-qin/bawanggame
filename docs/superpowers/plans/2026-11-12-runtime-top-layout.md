# 运行时顶部布局修复实施计划

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove the player toolbar and prevent the runtime editor layer from creating a white block above the game screen.

**Architecture:** Keep the player shell and exit flow unchanged, remove only the centered toolbar markup, and let the runtime view occupy the full player stage. Make the legacy editor layer an absolute overlay so hidden inputs cannot affect phone layout.

**Tech Stack:** React, UnoCSS, legacy J2ME CSS loaded by Vite.

---

### Task 1: Remove the centered player toolbar

**Files:**
- Modify: `apps/web/src/App.jsx:437-444`

- [ ] Remove the `.runtimeToolbar` element from `Player` while keeping `.playerExit`, the stage ref, and exit confirmation behavior.
- [ ] Confirm no code depends on `.runtimeToolbar` for exit handling.

### Task 2: Restore full runtime viewport and isolate editor overlay

**Files:**
- Modify: `apps/web/uno.config.js:48-50`
- Modify: `runtime/j2me/style/main.css:80-90`
- Modify: `runtime/j2me/style/lcdui.css:410-430`

- [ ] Let `.runtime-view` fill the player stage instead of reserving a fixed top offset.
- [ ] Keep the runtime stage centered and constrained by the legacy phone sizing rules.
- [ ] Ensure `#editor-layer`/`.lc-editors` remain absolutely positioned overlays with no layout contribution, transparent backgrounds, and a controlled stacking order.
- [ ] Preserve visible text editor behavior by changing only the hidden container and positioning rules.

### Task 3: Verify the player layout

**Files:**
- Test: `apps/web/verify.mjs`

- [ ] Run the existing web verification command from `apps/web/package.json`.
- [ ] Build the web app and confirm UnoCSS emits the updated runtime view rule.
- [ ] Inspect the changed files and verify the toolbar is absent while the return button remains.
- [ ] Commit the implementation with a focused message.
