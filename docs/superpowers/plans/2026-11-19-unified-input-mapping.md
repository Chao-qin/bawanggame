# Unified Input Mapping Implementation Plan

> **For agentic workers:** Implement this plan in the task worktree. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Route touch, keyboard, and Gamepad controls through shared logical actions before dispatching to J2ME or MRP.

**Architecture:** Add a small browser-side action controller with source-aware held-action tracking and runtime sinks. Keep the existing touch gesture recognizer and J2ME frame synchronization, adapt both runtimes to the controller, and persist Gamepad bindings per game with defaults for existing keyboard/touch behavior.

**Tech Stack:** Existing ES5 classic runtime scripts, React settings UI, Web Gamepad API, localStorage-backed game settings, Node verification and web build.

---

## File Structure

- Create `runtime/input/action-map.js` for logical action names, configurable physical controls, action reference counting, Gamepad polling, and teardown.
- Modify `apps/web/src/runtime/J2MEPlayer.jsx` and `apps/web/src/runtime/MrpPlayer.jsx` only for script loading, mounting, and cleanup integration.
- Modify `runtime/j2me/keymap.js` to use action IDs for touch and keyboard while retaining `mapped()` and MIDP edge scheduling.
- Modify `runtime/mrp/mrp-runtime.js` to route touch and supported keyboard actions through logical actions without duplicate SDL events.
- Modify J2ME settings/panel only if required to expose shared bindings without removing legacy keymap support.
- Create focused Node tests for action ownership, button/axis edges, disconnect, and keyboard mapping.
- Keep the research spec and this plan in the PR.

## Chunk 1: Shared Action Controller

- [x] Define stable action IDs for directions, confirm, soft keys, back, clear, digits, star, and pound.
- [x] Implement source-token ownership so one press is emitted for the first holder and release for the final holder.
- [x] Implement Gamepad button polling and axis threshold hysteresis.
- [x] Ensure disconnect, blur, hidden document, and destroy release all source-owned actions.
- [x] Add deterministic tests using mocked `navigator.getGamepads`, timers, and sink.

## Chunk 2: Runtime Adapters

- [x] Adapt J2ME touch and physical keyboard to shared actions while retaining frame-safe MIDP delivery and model key conversion.
- [x] Adapt MRP touch and keyboard to shared actions, preventing duplicate SDL delivery.
- [x] Add runtime-session cleanup so remounting does not leave polling or held actions alive.
- [x] Keep old keymap and touchLayout localStorage readers intact.

## Chunk 3: User Mapping and Verification

- [x] Expose per-game keyboard/Gamepad binding capture and restore defaults in the shared player toolbar.
- [x] Map analog axes to directions with dead-zone and hysteresis.
- [x] Run targeted Node tests, syntax checks, web build, and browser shell smoke checks.
- [x] Check `git diff --check`, document unsupported native system buttons, and record unverified physical-device scenarios.
- [ ] Commit task files, push branch, search for duplicate PRs/templates via GitHub MCP, create one PR, and verify its metadata via MCP.
