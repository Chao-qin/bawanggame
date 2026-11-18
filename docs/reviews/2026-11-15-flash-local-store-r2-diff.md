# Review Report

## Context

- PR: #33
- Base SHA: `5d9c57120040d4c1e907045ac32fda9d7debebb7`
- Head SHA: `3615148`
- Reviewer model: `gpt-6-luna`
- Reasoning: `low`
- Context budget: `300k`
- Review round: `R2`
- Review pass: `diff`

## Findings

### [P2] Recover from synchronous IndexedDB open errors — `apps/web/src/localFlash.js`

Trigger -> private mode or a disabled storage implementation throws synchronously from `indexedDB.open` -> the cached promise remains rejected -> retry keeps failing even after storage becomes available.

Fix: wrap `indexedDB.open` in `try/catch` and clear the cached promise. Fixed in `f8a794e`.

### [P2] Bound remote redirects — `apps/web/src/localFlash.js`

Trigger -> a remote SWF responds with a redirect chain -> unrestricted `redirect: "follow"` delegates an unbounded chain to the browser -> redirect handling cannot enforce the documented limit.

Fix: use manual redirects, validate each HTTP/HTTPS Location, and cap hops at five. Fixed in `f8a794e`.

## Verification

- Commands: `pnpm --filter @xiaochao/web build`, `node --check apps/web/src/localFlash.js`, local Flash smoke.
- Device/runtime: desktop browser and static review.
- Result: findings fixed before R3.

## Residual Risk

- Live CORS and remote redirect endpoints were not available for dynamic testing.

## Decision

- `fix_required`
