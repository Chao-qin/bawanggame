# Ruffle Flash WebView Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add offline Ruffle playback to the shared game library and package one original AS3 test game for desktop web and mobile WebViews.

**Architecture:** Pin the official Ruffle self-hosted npm distribution and stage its runtime files and licenses in the static site. Add a Flash library entry and a focused player component that uses the existing route, loader, status, and exit patterns; keep the SWF source and compiled fixture in `games/flash`.

**Tech Stack:** React, Vite, Ruffle WebAssembly, Apache Flex SDK, Node.js packaging scripts, React Native WebView.

**Spec:** `docs/superpowers/specs/2026-11-15-ruffle-flash-webview-design.md`

---

## Chunk 1: Test Game and Offline Assets

### Task 1: Create the original AS3 test game

**Files:**
- Create: `games/flash/src/Main.as`
- Create: `games/flash/sample-game.swf`
- Create: `games/flash/LICENSE`
- Create: `games/flash/README.md`

- [x] **Step 1: Implement a small touch-friendly AS3 arcade game**

Use vector-only drawing, built-in text, and simple touch/mouse input. Successful interaction must visibly increment the score. Avoid network, audio, external fonts, and external assets.

- [x] **Step 2: Compile with Apache Flex SDK 4.16.1**

Set `FLEX_HOME` to Apache Flex SDK 4.16.1. Set `PLAYERGLOBAL_HOME="$FLEX_HOME/frameworks/libs/player"`, create its `27.0` directory, and download the pinned MPL-1.1 `playerglobal.swc` from the URL recorded in `games/flash/README.md`. This compiler-only file remains outside the repository and app package.

Run: `PLAYERGLOBAL_HOME="$PLAYERGLOBAL_HOME" "$FLEX_HOME/bin/mxmlc" -version`
Expected: output identifies compiler version `4.16.1`.

Run: `PLAYERGLOBAL_HOME="$PLAYERGLOBAL_HOME" "$FLEX_HOME/bin/mxmlc" -target-player=27.0 -output=games/flash/sample-game.swf -static-link-runtime-shared-libraries=true -use-network=false games/flash/src/Main.as`
Expected: compilation exits successfully and creates `games/flash/sample-game.swf`.

- [x] **Step 3: Verify the SWF header and metadata**

Run: `file games/flash/sample-game.swf`
Expected: a valid compressed or uncompressed SWF file, not an HTML error/download page.

Run: `xxd -l 16 games/flash/sample-game.swf`
Expected: a valid `FWS` or `CWS` signature and a plausible Flash version.

- [x] **Step 4: Document the sample license and exact rebuild command**

Add a short MIT license for the original game and record Apache Flex SDK 4.16.1, the pinned MPL-1.1 playerglobal source, version-check command, and exact compile command in `games/flash/README.md`.

### Task 2: Pin and stage Ruffle for offline playback

**Files:**
- Modify: `apps/web/package.json`
- Modify: `pnpm-lock.yaml`
- Modify: `pack-site.sh`
- Modify: `apps/mobile/scripts/verify-web-assets.mjs`
- Modify: `patches/react-native-static-server@0.5.0.patch`

- [x] **Step 1: Add the exact Ruffle dependency**

Run: `pnpm --filter @xiaochao/web add --save-exact @ruffle-rs/ruffle@0.7.1`
Expected: `apps/web/package.json` pins `0.7.1` and `pnpm-lock.yaml` records the same version.

- [x] **Step 2: Extend site packaging**

Update `pack-site.sh` to copy the package's `ruffle.js`, hashed `core.ruffle.*.js` chunks, both `.wasm` modules, and `LICENSE_MIT`/`LICENSE_APACHE` into `site-deploy/ruffle/`. Also copy `games/flash/sample-game.swf` into `site-deploy/flash/`. Fail with a clear message if package assets are missing.

- [x] **Step 3: Extend mobile asset verification**

Update `apps/mobile/scripts/verify-web-assets.mjs` to require the Ruffle loader, both core chunks, both WASM modules, both license files, and the sample SWF. Keep generated `apps/mobile/web` assets untracked.

- [x] **Step 4: Add WASM MIME mapping to the existing static-server patch**

Extend `patches/react-native-static-server@0.5.0.patch`: add `wasm=application/wasm` to Android's NanoHTTPD MIME map and set the iOS GCDWebServer file response's `contentType` to `application/wasm` for `.wasm` paths. Preserve all other content types. Run `pnpm install --lockfile-only` to refresh the patched dependency hash, then `pnpm install --frozen-lockfile` to confirm that the patch applies.

- [x] **Step 5: Run site and mobile asset packaging**

Run: `pnpm install --frozen-lockfile`
Expected: dependency installation succeeds from the updated lockfile.

Run: `pnpm build && pnpm run pack`
Expected: site build and pack complete; required files exist under `site-deploy/ruffle/` and `site-deploy/flash/`.

Run: `pnpm mobile:prepare-web`
Expected: this runs the web build, packs the site, copies it to mobile assets, then verifies the assets and prints their generated size.

Run: `find site-deploy/ruffle -maxdepth 1 -type f -print`
Expected: list includes `ruffle.js`, two `core.ruffle.*.js` chunks, two hashed `.wasm` modules, `LICENSE_MIT`, and `LICENSE_APACHE`; `site-deploy/flash/sample-game.swf` exists.

---

## Chunk 2: Flash Library and Player Lifecycle

### Task 3: Add Flash game routing and Ruffle player UI

**Files:**
- Modify: `apps/web/src/App.jsx`
- Create: `apps/web/src/runtime/FlashPlayer.jsx`

- [x] **Step 1: Add an isolated Flash library entry and route kind**

Add a Flash tab and one static game record pointing to `flash/sample-game.swf`. Add `flash` to supported play route kinds and render `FlashPlayer` for that kind. In `Library`, call hooks unconditionally. Change `useServerJars(enabled)` to return `{ loading: false, error: null, games: [] }` and skip fetching when `enabled` is false; call it with `kind === 'j2me'`. Call `useServerGames(kind)` and ensure the hook fetches only for `maopao`. Select a neutral `{ loading: false, error: null, games: [] }` server state for `flash`; use only the static record and hide shared recent/popular rows so no J2ME/MRP game or catalog status appears there. Preserve current route history and J2ME/MRP data paths.

- [x] **Step 2: Implement Ruffle script loading and player creation**

In `FlashPlayer`, create a runtime session through `createRuntimeSession` and dynamically load `/ruffle/ruffle.js` through `loadClassic` only when the Ruffle global is not already present. Create the player with `RufflePlayer.newest().createPlayer()`, set width and height to fill the stage, append it, and load `/flash/sample-game.swf`.

- [x] **Step 3: Handle asynchronous route exit and errors**

Guard asynchronous initialization with an active flag. Await and catch script initialization and `player.ruffle().load()` failures, including WASM and SWF load errors; show the existing runtime failure component only while the route is active. On unmount, invalidate the runtime session and call `player.remove()`; Ruffle's custom element `disconnectedCallback` destroys its emulator instance. Ignore late completions/errors after exit and ensure re-entry creates a fresh element.

- [x] **Step 4: Size the Flash element within the existing player frame**

Use the existing `.runtime-view` UnoCSS shortcut for the wrapper and inline dimensions on the Ruffle element. Do not change the J2ME/MRP runtime stylesheet.

- [x] **Step 5: Run the web build and focused browser smoke flow**

Validation used the Android WebView host: Flash tab and game launch, score increment, exit/re-entry, offline replay, plus an MRP game launch/exit. Desktop browser and J2ME VM gameplay were not separately exercised.

Run: `pnpm build && pnpm run pack`
Expected: build succeeds and the staged site contains all Ruffle and SWF resources.

Run a local web server and verify: Flash tab appears; the sample game starts; clicking/touching the target increments the score; returning to the library and launching again works; existing J2ME and MRP routes still render their current player branches.

### Task 4: Verify the Android WebView package

**Files:**
- No source changes expected unless verification reveals a packaging or MIME issue.

- [x] **Step 1: Build the Android release APK**

Run: `pnpm mobile:build-android`
Expected: release APK is generated at `apps/mobile/android/app/build/outputs/apk/release/app-release.apk`.

- [x] **Step 2: Inspect APK resources and Android WASM MIME response**

Run: `unzip -l apps/mobile/android/app/build/outputs/apk/release/app-release.apk`
Expected: APK contains `ruffle.js`, both WASM modules, core chunks, licenses, and `sample-game.swf`.

Run: `adb devices -l`
Expected: identify an emulator/device or record that none is attached.

When an Android target is available, install with `adb install -r apps/mobile/android/app/build/outputs/apk/release/app-release.apk` and launch with `adb shell am start -n com.xiaochao.bawang/.MainActivity`. Read the assigned port from `adb logcat -d -s FPStaticServerModule`.

Forward that port with `adb forward tcp:<host-port> tcp:<device-port>`, then run `curl -I http://127.0.0.1:<host-port>/ruffle/172de42e6619eac8f371.wasm`. Expected: `Content-Type: application/wasm`. Remove the forward after the request. Open Flash in the app and confirm Ruffle initializes without a WebAssembly MIME error.

- [x] **Step 3: Run Android offline playback smoke test**

On an available Android emulator, run `adb shell svc wifi disable` and `adb shell svc data disable`, open the Flash tab, increment the score, exit, and relaunch the game. Restore Wi-Fi/data after validation. Record whether the target was an emulator or a real device. If no Android target is attached, mark install, runtime MIME, and offline interaction as unverified; do not infer them from a successful build.

- [x] **Step 4: Check iOS packaging and MIME mapping**

The shared site contains the same assets and the patched iOS file response sets `.wasm` to `application/wasm`. iOS simulator/device execution was unavailable because `xcrun simctl` is not installed in this environment.

Confirm the same Flash assets are produced in the shared Web bundle and the patched iOS GCDWebServer response sets `.wasm` to `application/wasm`. If Xcode and an iOS simulator are available, build/launch and confirm Ruffle initializes; otherwise report iOS runtime validation as not performed.

---

## Finalization

- [ ] Run `git diff --check` and inspect `git status --short` to exclude generated `public/`, `site-deploy/`, `apps/mobile/web/`, APKs, and logs.
- [ ] Commit the spec and plan documents, then commit the implementation on the same branch.
- [ ] Run the required cold-start diff review and feature audit, plus Android/WebView validation review; address review findings and repeat applicable passes.
- [ ] Push `feat/ruffle-flash-webview` and create one PR through GitHub MCP. Verify its title, description, base/head branches, URL, and open state through MCP.
