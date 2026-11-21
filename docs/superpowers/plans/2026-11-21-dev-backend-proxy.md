# Web Development Backend Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `pnpm dev` run the API and web client together, with Vite forwarding API and icon requests.

**Architecture:** Use pnpm's parallel filtered execution for the existing web and server dev scripts. Configure Vite to forward `/__flash` and `/__icon` to the Node server, using `PORT` (default 8080) for the target.

**Tech Stack:** pnpm workspaces, Vite, Node.js.

---

## Chunk 1: Development Startup

### Task 1: Start both workspace services

**Files:**
- Modify: `package.json`
- Modify: `apps/web/vite.config.js`

- [ ] Change the root `dev` script to run the existing `@xiaochao/web` and `@xiaochao/server` dev scripts concurrently through pnpm filters.
- [ ] Add `/__flash` and `/__icon` to the API proxy targets and derive the target port from `PORT`, defaulting to 8080.
- [ ] Run `pnpm dev`, verify the UI and proxied Flash catalog and icon endpoints, then repeat with a non-default `PORT` and verify both services stop together.
- [ ] Run build, server typecheck, server tests, and `git diff --check`.
