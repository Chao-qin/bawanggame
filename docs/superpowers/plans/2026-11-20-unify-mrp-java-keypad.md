# Unify MRP and Java Keypad Implementation Plan

> **For agentic workers:** This plan is implemented in the task worktree. Steps use checkbox (`- [x]`) syntax to record completed work.

**Goal:** Make the MRP virtual keypad use the same slots, layouts, touch actions, and per-game configuration model as the Java keypad.

**Architecture:** Reuse `TouchLayout` as the canonical layout/action contract and the existing shared DOM, Canvas renderer, and Touchpad gesture engine. Persist MRP layouts through the existing game settings store under an MRP-specific game ID, then adapt logical actions to MRP codes in `mrp-runtime.js`.

**Tech Stack:** ES5 runtime scripts, React/antd-mobile settings popup, localStorage-backed `Settings`, Node tests, Vite build.

---

## File Structure

- Modify `runtime/j2me/touch-layout.js` to expose per-game layout storage through the existing `Settings` API.
- Modify `runtime/mrp/mrp-runtime.js` to load/apply the MRP layout and bind its action slots to MRP codes.
- Modify `apps/web/src/runtime/J2MEPlayer.jsx` and `apps/web/src/runtime/cleanup.js` to expose and clear the shared layout adapter.
- Modify `apps/web/src/runtime/InputMappingPopup.jsx` and `apps/web/src/mobile-ui.css` to expose the same touch-layout controls for MRP and Java.
- Modify `apps/web/src/runtime/MrpPlayer.jsx` only to load the shared settings and layout modules before MRP initialization.
- Add `runtime/j2me/touch-layout.test.mjs` for default, normalization, action mapping contract, and per-game persistence behavior.

## Implementation

- [x] Add a shared `TouchLayout.forGame(gameId)` adapter using `Settings.touchLayout` and `Settings.setTouchLayout`.
- [x] Bind J2ME to the shared adapter without changing existing defaults or saved `touchLayout` records.
- [x] Apply the same layout in MRP, including D-pad visual direction, left/right landscape placement, digit ordering, and slot-to-action mappings.
- [x] Rebind MRP Touchpad after layout edits and release active controls during rebind.
- [x] Add a touch-layout view to the shared toolbar popup with Java's layout options and reset behavior.
- [x] Verify defaults, saved MRP settings, action-to-MRP-code routing, cleanup paths, build, and browser shell smoke. No game fixtures were present for gameplay testing.
- [x] Search for duplicate PRs/templates, commit, push, create one draft PR via GitHub MCP, and verify its metadata. Independent cold-start review remains pending under repository review policy.
