# J2ME Local JAR and Exit Cleanup

## Scope

Fix two user-visible J2ME issues: installed local JARs must load from IndexedDB rather than an HTTP URL, and leaving a game must stop the legacy runtime before the library screen is shown.

## Design

Local games pass a `local:`-prefixed jar identifier to the legacy runtime. The existing `urlparams.js` and `LocalJars.isLocal()` path then select `LocalJars.load()`, so filenames are never interpreted as server paths. Server-hosted games keep the existing `jar/<filename>` identifier.

The J2ME React wrapper owns runtime lifecycle cleanup. On unmount or exit it invokes the runtime's available stop hooks, cancels animation/timer work where exposed, removes runtime-created DOM nodes, clears runtime globals, and releases the document body runtime class. Cleanup is idempotent so both an explicit exit and React unmount are safe. The existing full-page reload remains the final isolation fallback after the cleanup has run.

## Error handling

Missing local data continues to surface as the existing runtime error instead of falling through to an HTTP 404. Cleanup catches unavailable legacy hooks because older built bundles may not expose every stop function.

## Verification

Build the web and server packages. Confirm the generated runtime receives `local:<filename>` for installed games and `jar/<filename>` for built-ins. Manually exercise launch and return for both paths and ensure no repeated canvas rendering remains after returning to the library.
