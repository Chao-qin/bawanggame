# Simulator Startup and Landscape Layout Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Prevent simulator editor bridges from flashing as browser white inputs and make the default landscape keypad place navigation on the left while preserving saved layouts.

**Architecture:** Put an initial isolation class on the React editor layer so the first browser paint cannot expose the six bridge nodes. The legacy J2ME runtime still owns editor visibility and positioning after it loads; CSS only supplies the initial offscreen state and lets the runtime stylesheet take over. Change the touch-layout default from `standard` to `swapped`, leaving normalized persisted values untouched, and remove duplicate landscape width declarations.

**Tech Stack:** React 18, Vite, legacy J2ME browser runtime, CSS, localStorage.

---

## Chunk 1: Runtime editor first-paint isolation

### Task 1: Add a stable initial editor-layer state

**Files:**
- Modify: `apps/web/src/runtime/PhoneMarkup.jsx`
- Modify: `runtime/j2me/style/main.css`
- Modify: `runtime/j2me/bld/lcdui.js`

- [x] Add `runtime-editor-layer` plus inline `position:absolute`, offscreen `left/top`, 1px size, clipping, opacity, visibility, and pointer-event values to `#editor-layer` in `PhoneMarkup`.
- [x] Clear the initial inline style in `bld/lcdui.js` immediately before changing the layer class to `.lc-editors`, allowing the existing canvas-aligned `left/top/width/height/transform` declarations to take over without setting `display:none` on the parent.
- [x] Make `loadStyle` awaitable and load J2ME CSS before legacy scripts, so the handoff cannot clear inline isolation while CSS is still pending.
- [x] Keep `.textEditor.show { display:block }` as the only individual-editor visibility trigger.
- [x] Run `pnpm --filter @xiaochao/web build`; expect exit code 0 and a generated stylesheet containing `runtime-editor-layer`.

### Task 2: Keep MRP editor bridges isolated

**Files:**
- Modify: `runtime/j2me/style/main.css`

- [x] Reuse the same offscreen behavior for `.mrp-stage #editor-layer` after the runtime stylesheet loads.
- [x] Verify with a DOM selector probe that `.mrp-stage #editor-layer` matches the six bridge nodes only and `#mrp-dialog-text` remains outside the layer.

## Chunk 2: Landscape default and layout cleanup

### Task 3: Change only the default side order

**Files:**
- Modify: `runtime/j2me/touch-layout.js`
- Modify: `runtime/j2me/style/main.css`

- [x] Set `DEFAULT.sides` to `swapped` so an unset layout maps navigation to column 1 and numbers to column 3.
- [x] Update `validSides` to accept both explicit `standard` and `swapped` values, falling back to the new default only for missing/invalid values; keep `localStorage` loading unchanged.
- [x] Remove the duplicate `body.runtime-active #nav` selector from the general width rule.
- [x] Keep the landscape swapped selectors as the single source of truth for column placement.

### Task 4: Verify layout and input behavior

**Files:**
- Test: `apps/web/verify.mjs` or an equivalent browser/Node smoke script if the existing verifier does not cover runtime DOM.

- [ ] Run `pnpm --filter @xiaochao/web build`.
- [ ] Start the existing web server in the task worktree and open a Chromium page at a desktop viewport.
- [x] Use a browser smoke page that delays `/style/main.css` and `/style/lcdui.css`, sample `#editor-layer` before releasing those responses, then release them and confirm a J2ME editor with `.show` can be restored to the canvas overlay.
- [x] Run a Node assertion probe against the isolated touch-layout module: expect `defaults().sides === 'swapped'`, `normalize({ sides: 'standard' }).sides === 'standard'`, `normalize({ sides: 'swapped' }).sides === 'swapped'`, and invalid values to fall back to `swapped`.
- [x] Run `git diff --check`; expect no output, and record real-device input/rotation as unverified.

### Task 5: Commit the single-PR change

**Files:**
- Commit all modified spec, plan, source, and style files in this worktree.

- [x] Review `git status --short` for generated artifacts and remove them from the commit set.
- [ ] Commit with `fix: hide simulator editor bridges on startup`.
