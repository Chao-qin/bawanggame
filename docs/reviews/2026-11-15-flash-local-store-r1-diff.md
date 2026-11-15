# Review Report

## Context

- PR: #33
- Base SHA: `5d9c57120040d4c1e907045ac32fda9d7debebb7`
- Head SHA: `5d55ee5`
- Reviewer model: `gpt-6-luna`
- Reasoning: `low`
- Context budget: `300k`
- Review round: `R1`
- Review pass: `diff`

## Findings

### [P2] Do not label the non-cryptographic fallback as SHA-256 — `apps/web/src/localFlash.js`

Trigger -> `addFromFile` calls `digestHex` in a WebView without `crypto.subtle` -> a 32-bit FNV value is stored under a `sha256:` key -> different files can collide and replace one another.

Fix: use a real SHA-256 implementation or reject unsupported environments. Fixed in `3615148` with a pure JavaScript SHA-256 fallback.

### [P2] Reset failed IndexedDB open state — `apps/web/src/localFlash.js`

Trigger -> the first `indexedDB.open` fails or is blocked -> the rejected `databasePromise` is reused -> the visible retry action cannot recover during the session.

Fix: clear the cached open promise on open errors. Fixed in `3615148` and extended for synchronous open failures in `f8a794e`.

## Verification

- Commands: `pnpm --filter @xiaochao/web build`, `git diff --check`.
- Device/runtime: static cold-start diff review.
- Result: findings fixed before subsequent review rounds.

## Residual Risk

- Android WebView and real-device persistence were not available in this pass.

## Decision

- `fix_required`
