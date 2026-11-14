# RN WebView Host Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an Android/iOS React Native host that bundles the existing React simulator site and serves it to a WebView from a local HTTP server.

**Architecture:** The existing `pnpm build && pnpm pack` pipeline remains the source of truth for the Web application. A mobile preparation script copies and validates `site-deploy` into `apps/mobile/web`; RN starts `react-native-static-server` against that directory and points `react-native-webview` at the loopback URL. RN owns lifecycle, loading/error states, system bars, and native back dispatch while the Web app owns game routes and exit confirmation.

**Tech Stack:** React Native 0.88, TypeScript, `react-native-webview`, `react-native-static-server`, Metro, Android Gradle, CocoaPods.

---

## Chunk 1: Workspace and Web asset pipeline

### Task 1: Add mobile workspace package metadata

**Files:**
- Create: `apps/mobile/package.json`
- Create: `apps/mobile/tsconfig.json`
- Create: `apps/mobile/metro.config.js`
- Modify: `package.json`
- Modify: `.gitignore`

- [ ] Add `@xiaochao/mobile` scripts for `start`, `android`, `ios`, `prepare-web`, `lint`, and `typecheck`.
- [ ] Pin compatible React Native, WebView, static server, and React dependencies.
- [ ] Configure Metro to resolve the mobile package without traversing the generated web directory.
- [ ] Ignore generated `apps/mobile/web` output while keeping an empty marker directory.

### Task 2: Implement reproducible Web resource preparation

**Files:**
- Create: `apps/mobile/scripts/prepare-web.mjs`
- Create: `apps/mobile/web/.gitkeep`
- Modify: `package.json`

- [ ] Run the root Web build and site packaging from the repository root.
- [ ] Replace `apps/mobile/web` with a copy of `site-deploy`.
- [ ] Validate `index.html`, `assets`, J2ME runtime directories/files, `jar`, and `maopao` resources before returning success.
- [ ] Make failures actionable and exit non-zero before any native build can package incomplete content.
- [ ] Add a root `mobile:prepare-web` script that delegates to the mobile package.

## Chunk 2: RN host runtime

### Task 3: Add RN entry point and host state machine

**Files:**
- Create: `apps/mobile/index.js`
- Create: `apps/mobile/App.tsx`
- Create: `apps/mobile/src/host/assetServer.ts`
- Create: `apps/mobile/src/host/protocol.ts`
- Create: `apps/mobile/src/host/styles.ts`

- [ ] Start a loopback `StaticServer` from the generated `web` directory and expose a promise-based `start/stop` lifecycle.
- [ ] Render loading, WebView, and retryable error states with a stable dark background.
- [ ] Configure WebView JavaScript, DOM storage, media playback, inline media, mixed content, and origin whitelist for the local origin.
- [ ] Inject a versioned RN bridge bootstrap and handle `app.ready`, `navigation.back`, and `app.reload` messages with validation.
- [ ] Send a network state message when the host resumes or the connectivity API is available.
- [ ] Stop the server on unmount and retry startup once after a load error.

### Task 4: Implement native back behavior

**Files:**
- Modify: `apps/mobile/App.tsx`
- Create: `apps/mobile/src/host/back.ts`

- [ ] Register `BackHandler` only while the host is mounted.
- [ ] Ask WebView history to go back before emitting `navigation.back`.
- [ ] Avoid exiting the native app while a Web game route is active; let the existing Web confirmation dialog decide.
- [ ] Exit the RN host only when the WebView reports no game route and no history remains.

## Chunk 3: Native project and packaging

### Task 5: Generate Android/iOS RN projects and wire bundled assets

**Files:**
- Create: `apps/mobile/android/**`
- Create: `apps/mobile/ios/**`
- Create: `apps/mobile/react-native.config.js`
- Create: `apps/mobile/.eslintrc.js`
- Create: `apps/mobile/.prettierrc.js`

- [ ] Generate the React Native 0.88 Android and iOS shells with the package name `com.xiaochao.bawang`.
- [ ] Configure Android assets to include `apps/mobile/web` and apply dark status/navigation bar colors.
- [ ] Configure iOS Xcode resources to include `apps/mobile/web` and use a dark launch/background color.
- [ ] Add native build phases or scripts so `mobile:prepare-web` runs before debug/release resource packaging.
- [ ] Configure Android immersive fullscreen flags only at the native host layer; keep Web runtime rotation behavior unchanged.

### Task 6: Document developer and release workflows

**Files:**
- Create: `apps/mobile/README.md`
- Modify: `README.md`

- [ ] Document Node/pnpm, Android SDK, Xcode/CocoaPods prerequisites.
- [ ] Document `pnpm mobile:prepare-web`, `pnpm --filter @xiaochao/mobile start`, `android`, and `ios` commands.
- [ ] Explain that the Web assets are generated and must not be edited in `apps/mobile/web`.
- [ ] Document local server lifecycle, WebView loading behavior, and native back semantics.

## Chunk 4: Verification

### Task 7: Add deterministic host checks

**Files:**
- Create: `apps/mobile/scripts/verify-web-assets.mjs`
- Create: `apps/mobile/src/host/protocol.test.ts`
- Modify: `apps/mobile/package.json`

- [ ] Test protocol validation for valid messages, unknown messages, and malformed payloads.
- [ ] Verify generated assets contain the React entrypoint, J2ME/MRP runtime files, and at least one game resource.
- [ ] Run `pnpm mobile:prepare-web`, `pnpm --filter @xiaochao/mobile typecheck`, and the mobile protocol tests.
- [ ] Run Android/iOS configuration checks where the local SDKs are available; report unavailable native toolchains without claiming a device build.
- [ ] Run `git diff --check` and inspect the generated resource size before commit.

