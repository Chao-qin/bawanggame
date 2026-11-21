# Game Artwork Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Preserve available artwork across installation and game surfaces.

**Architecture:** Keep optional images with existing per-runtime records. Resolve history display against installed and catalog metadata without changing launch identities.

**Tech Stack:** React, IndexedDB, Node, Chromium CDP.

## Chunk 1: Persistence and presentation

- [ ] Add Flash artwork persistence and optional import in `apps/web/src/localFlash.js` and `apps/web/src/App.jsx`. In `apps/web/verify.mjs` verify fixture artwork survives reload and a failed image does not fail installation.
- [ ] Add JAR catalog metadata and reliable backfill in `runtime/j2me/config/localjars.js`, `apps/server/src/index.ts`, and `apps/web/src/App.jsx`. Keep package icon fallback and support optional artwork in the MRP manifest.
- [ ] Reuse resolved images in `apps/web/src/components/GameEntry.jsx` and `apps/web/src/App.jsx`, including missing/broken images. Verify existing same-name records are not cross-linked.
- [ ] Fix Flash results spacing and cover fit in `apps/web/src/mobile-ui.css`; assert positive spacing and `object-fit: contain` in `apps/web/verify.mjs`.
- [ ] Reproduce the portrait keypad issue inside the J2ME iframe using a playable fixture. Compare the computed geometry and saved layout state for `#nav`, `#numpad`, and `#canvas`; fix the responsible layout rule in `runtime/j2me/style/main.css` or its adapter. Add portrait assertions for visible keys, row gaps, and press/release behavior to `apps/web/verify.mjs`.
- [ ] Verify that `runtime/j2me/keypad-canvas.js` paints soft/function key icons in Canvas mode and that the DOM fallback retains its icons.
- [ ] Run `pnpm test`, `pnpm build`, `node apps/web/verify.mjs` against the rebuilt service, and packaged Android/WebView verification. Run cold reviews and publish one PR.
