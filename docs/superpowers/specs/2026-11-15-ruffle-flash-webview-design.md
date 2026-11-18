# Ruffle Flash WebView Integration

## Goal

Add offline Flash game playback to 小潮霸王 through Ruffle, with a redistributable, complete Flash game and a small original AS3 input smoke fixture for the shared web app and React Native WebView host.

## Task Contract

- **Target behavior:** Flash library entries launch bundled SWFs through Ruffle. Playback works from both the normal `public/` web root and packaged mobile site without downloading the player or games at runtime.
- **Scope:** Shared React web app, web-build asset staging, static site packaging, mobile web asset preparation, `.wasm` MIME handling in the existing cross-platform static server, an original input smoke fixture, and the MIT-licensed Fruit Madness game from its upstream repository.
- **Preserve:** Existing J2ME, MRP, and local revival routes; current route history, exit confirmation, fullscreen controls, and offline mobile startup behavior.
- **Acceptance:** Web build copies Ruffle and both games into `public/`, and static packaging carries them into `site-deploy`; browser smoke validation exercises load, game interaction, exit, and re-entry; Android APK contains the player, WASM, both SWFs, and licenses and plays offline. iOS must at least package the same static resources; device validation will be reported separately if unavailable.

## Architecture

Use the official `@ruffle-rs/ruffle` self-hosted distribution, pinned to version `0.7.1`, in the shared web application. Copy the package's runtime JavaScript, both WASM variants, and license files into the static site during the existing packaging flow. Ruffle and the test SWF are served from the app's local HTTP origin, so desktop web builds and mobile WebViews use the same paths and do not require remote runtime requests. Patch the existing `react-native-static-server` Android and iOS file responses to serve `.wasm` as `application/wasm`; keep all other MIME handling unchanged.

The npm tarball contains root-level `ruffle.js`, two hashed `core.ruffle.*.js` chunks, two hashed `.wasm` modules, and `LICENSE_MIT`/`LICENSE_APACHE`. Stage these package files under `/ruffle/` in the built site and dynamically load `/ruffle/ruffle.js`. The self-hosted API uses `window.RufflePlayer.newest().createPlayer()` and `player.ruffle().load('/flash/sample-game.swf')`.

Add a Flash tab with only the built-in test entry; do not show shared recent/popular rows containing games from other runtime kinds, and do not inherit J2ME/MRP catalog loading or errors. Add a dedicated `FlashPlayer` component. The component creates a Ruffle player for the SWF and reports load/runtime errors through the existing runtime status UI. Guard asynchronous script/player initialization with an active-route token: if the route exits before initialization completes, do not create or attach a player; if it exits after creation, detach and dispose of the player and remove route-owned listeners. Late failures must not update an inactive route. Re-entry creates a fresh player instance. Reuse the existing game route, exit confirmation, back handling, stage sizing, and fullscreen controls. Do not add a native Ruffle module.

The Flash catalog contains Fruit Madness, a complete ActionScript 3 arcade game distributed under the upstream MIT license, and Star Catcher, a small original input smoke fixture. Keep the upstream game SWF and its license together under `games/flash/fruit-madness`; record its source URL and pinned commit. Keep the fixture source, its MIT license, and Apache Flex compiler version/invocation in `games/flash/README.md`. Star Catcher's primary interaction visibly increments its score; this fixture is not a claim of broad ActionScript compatibility.

The regular web build is served directly from repository `public/` by the Node server. A dedicated build staging script must copy Ruffle, both game SWFs, and their licenses there; `pack-site.sh` then carries them into `site-deploy` for native mobile packaging. Vite development proxies `/ruffle/*` and `/flash/*` to that same local server, matching the existing runtime asset proxy pattern. This keeps those paths valid in desktop production, development, and WebView hosting.

## Data and Resource Flow

1. `apps/web` loads Ruffle's self-hosted JavaScript from a local static path.
2. The Ruffle script selects a WASM module and initializes a player within the Flash route.
3. The player loads the bundled SWF from the same local origin.
4. The web build stages the SWF files and Ruffle runtime into `public/`; the existing `pack-site.sh` copies that tree into `site-deploy`.
5. `apps/mobile/scripts/prepare-web.mjs` copies that static site into WebView resources; Android serves it from the existing loopback HTTP server, and iOS bundles the same output.

## Failure and Lifecycle Behavior

- If Ruffle's script or WASM fails to load, show a clear runtime error and allow the user to return to the library.
- If the SWF fails to load, keep the player route usable so the user can leave it without crashing the app.
- If the route exits after player creation, dispose of the player and remove its DOM/listeners before returning to the library. A late script or SWF failure must not update an inactive route; re-entry starts a new player instance.
- Do not request remote game content or enable arbitrary external navigation as part of this integration.

## Non-Goals

- Reimplementing Adobe Flash Player or changing Ruffle's emulator core.
- Importing arbitrary user SWF files.
- Promising compatibility with every SWF, ActionScript API, Stage3D title, or Flash backend service.
- Adding native Android/iOS playback modules, online game catalogs, saves, or game-specific accounts.

## Verification

- Run the web build and site packer; verify the SWF, Ruffle JavaScript, both WASM files, and license files are in the staged site.
- Run a local browser smoke flow: open Flash tab, start the test game, perform its primary interaction and confirm the score changes, return to the library, and start it again.
- Build the Android release APK and inspect its assets for the Ruffle loader, both hashed WASM modules, SWF, and licenses. Install and launch it on an emulator or device, disable network access, inspect a `.wasm` response for `Content-Type: application/wasm`, confirm WebView instantiates the module, then repeat the interaction. Verify the iOS static-server response mapping in its native implementation and run on an iOS simulator/device when available.
- Confirm existing J2ME and MRP launch/exit flows still build and route through the unchanged player branches.
- Report iOS packaging/build/device coverage separately from Android results.

## Constraints and Risks

- The current official Ruffle npm package is about 30 MB unpacked and includes two WASM variants. This increases the app download size; keeping both allows Ruffle to select the compatible module at runtime.
- Ruffle's ActionScript and Flash API support is incomplete. The bundled AS3 smoke game validates only basic AVM2 execution, display-list drawing, and input handling.
- Rebuilding the SWF requires Apache Flex SDK 4.16.1 and the MPL-1.1 `playerglobal.swc` API definitions for Flash Player 27.0. Record the exact source/license and command; do not bundle this compiler-only file in the app.
- This integration does not restore closed Flash backends or server-side services used by historical games.
