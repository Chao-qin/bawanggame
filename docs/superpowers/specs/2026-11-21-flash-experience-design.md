# Flash Store and Gameplay Experience

## Goal and Scope

Improve the Flash catalog discovery and Ruffle play flow on desktop, mobile browsers, and the Android WebView host. Keep the current Flash archive, bundled/local SWF storage, Ruffle runtime, and route lifecycle.

The catalog should lead with searchable archive results and usable artwork. Manual SWF import remains available as a secondary workflow. The player should accept desktop keyboard input and provide touch controls on touch layouts.

## Player Layout and Input

- Portrait: use the available viewport width for the game stage; place the touch keypad in the remaining vertical space below it.
- Landscape, windowed: constrain the game stage by viewport height; place touch keypads in the remaining left and right space.
- Landscape, fullscreen: auto-fit the game to the fullscreen viewport and hide touch keypads for external keyboard use.
- Desktop without touch input: do not reserve space for an on-screen keypad.
- Touch keydown/keyup events are sent to the Ruffle player. Release every held key on pointer cancellation, window blur, document hiding, player teardown, or route exit. Physical key input must not be duplicated by both the browser and forwarding code.
- Provide a compact common control set: directions, confirm, and two action buttons. The SWF remains responsible for title-specific key semantics; no universal game mapping is promised.

## Catalog and Store

- Load the archive's first page on entry and search on submit.
- Return validated HTTPS cover URLs from the catalog parser and display lazy-loaded 4:3 artwork with a stable fallback.
- Keep archive loading, error, empty, result, duplicate, and download states visible and recoverable.
- Move manual URL/file import into a collapsed secondary section without removing the workflow.

## Compatibility and Non-Goals

Preserve J2ME/MRP controls, Flash IndexedDB records and deduplication, bundled games, exit confirmation, fullscreen controls, native-back handling, and Ruffle lifecycle cleanup. Do not alter game SWF binaries or claim all historical Flash content works. No per-game remapping or game backend recreation is included.

## Acceptance and Verification

- Web build, server typecheck/tests, existing browser verification, and a focused browser check for catalog covers and Flash input/lifecycle.
- Desktop: keyboard moves the bundled Fruit Madness game; no touch keypad space is reserved.
- Touch/mobile viewport: touch controls emit down/up, release on interruption, and are visible in portrait and windowed landscape.
- Landscape fullscreen: touch controls disappear and the stage uses the fullscreen area; exit restores windowed landscape controls.
- Catalog: initial results, repeated searches, no results, upstream error, images loading/failing, add and duplicate states.
- Android build and APK asset validation when the local SDK is available. Report emulator/device checks separately; no device result may be inferred from a desktop browser.
