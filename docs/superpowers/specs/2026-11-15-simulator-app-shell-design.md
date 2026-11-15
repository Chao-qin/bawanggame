# Simulator App Shell and Exit Stability

## Goal

Define one visual and lifecycle contract for the simulator app, improve the crowded mobile presentation, and remove the Flash return transition that currently reloads the whole WebView and causes visible flicker.

## Task Contract

- **Target behavior:** The app has a consistent portrait-first library shell, a stable simulator shell for portrait and landscape play, and a single exit path shared by toolbar, browser history, and Android back handling. Flash and local revival return to the library without a document reload; runtimes that require global VM isolation retain a controlled reload policy.
- **Scope:** Shared React web app layout tokens and simulator shell, runtime exit policy, route/back handling, Flash and local revival lifecycle, React Native WebView back bridge behavior, and documentation/tests for the contract.
- **Preserve:** Existing J2ME, MRP, local revival, and Flash game routes; fullscreen and orientation behavior; Android host startup and offline asset serving; existing confirmation before exiting a running game.
- **Acceptance:** No `window.location.reload()` occurs when leaving Flash or local revival; the library returns without a white/blank document transition and preserves the active tab; Android back and toolbar back use the same confirmation and exit path; existing J2ME/MRP reload behavior remains explicit and documented; portrait and landscape shells have stable dimensions at loading, running, error, and confirmation states.

## Product and Visual Rules

The app is a portrait-first mobile simulator library. The library prioritizes scanning: a compact app bar, one tab strip, one search/action row, and a dense game grid. Large marketing-style hero panels, unrelated status rows, decorative gradients, and oversized rounded containers are not used in the main library. Repeated game entries use one restrained card treatment with a consistent icon box, title line, and metadata line. The visual target is intentionally utilitarian: one accent color, neutral surfaces, 8px-or-less radii, no floating card inside card, and no decorative copy competing with the game list. Visual smoke evidence must check narrow portrait screenshots for overflow, clipped text, and inconsistent card heights.

The simulator shell is a full-viewport surface with two modes:

- **Portrait:** a stable 56px top control region below the safe-area inset and a stage occupying the remaining viewport. Loading, error, confirmation, and runtime content are absolutely layered inside the same stage so they cannot change its dimensions.
- **Landscape:** the stage fills the viewport. Controls collapse to a compact top-left affordance when the game needs the width; safe-area variables remain the only source of inset offsets. The control affordance uses an accessible label and never covers the game canvas.

Visual tokens are centralized in the Web Uno configuration: app/background surfaces, panel/card surfaces, border, text, muted text, accent, danger, shell spacing, control height, and shell radius. Runtime components consume shell classes and do not invent a second palette.

## Runtime Contract

Each runtime branch is treated as a shell-managed session with these responsibilities:

- `mount`: create or attach runtime-owned nodes and listeners.
- `ready`: report that the stage can be interacted with.
- `error`: report an actionable error without collapsing the stage.
- `cleanup`: stop runtime work, remove listeners and nodes, and release fullscreen/orientation ownership.
- `exitPolicy`: either `dispose` for runtimes that can safely leave the SPA alive, or `reload` for runtimes whose global VM state cannot be reconstructed safely.

The shell passes a synchronous `onCleanupReady(cleanup)` callback to the runtime component. The parent initializes the cleanup ref with an idempotent no-op, so an exit during loading or failed mount still has a defined cleanup boundary. The runtime registers its real idempotent function as soon as its effect starts; that function invalidates async work, removes runtime-owned DOM/listeners, and stops local work. The parent calls the current function exactly once before committing the library route; React unmount calls the same function again as a no-op safety net. Cleanup is synchronous at the shell boundary; pending promises are invalidated and late completions are ignored rather than awaited.

The current policies are:

| Runtime | Exit policy | Reason |
| --- | --- | --- |
| Flash/Ruffle | `dispose` | Player is a DOM-owned session and can be removed safely. |
| Local revival | `dispose` | React-owned state and listeners are scoped to the component. |
| J2ME | `reload` | The classic VM installs process-wide globals/listeners. |
| MRP | `reload` | Existing runtime cleanup still requires a fresh document realm. |

The shell performs exit in this order: show confirmation, call the registered runtime cleanup, release fullscreen/orientation, commit the library route, then apply the policy. For `dispose`, no document reload is scheduled. For `reload`, the library hash is committed first and a single deferred reload is scheduled. Repeated back signals during cleanup are ignored. The shell exposes no asynchronous child cleanup contract, so route transition cannot be held in a half-mounted state.

## Navigation and WebView Behavior

The web route remains hash-based. The shell owns the transition from `play` to `library`; child runtimes do not call `history.back()` themselves. Browser `popstate`, hash changes, Android injected back, and the toolbar button all enter the same shell callback. The Android bridge emits a `navigation.back` request and invokes a page callback; it does not mutate browser history. A native back request while a game is open reports `handled: true`, opens the existing exit confirmation, and does not navigate twice. A native back request on the library reports `handled: false` so React Native may exit the host. Browser history back remains a separate browser-owned event and is normalized by the App route handler into the same confirmation path.

The WebView must keep the existing local origin and static-server behavior. No remote navigation or new native runtime module is introduced.

## Failure Behavior

- A runtime loading failure remains inside the fixed stage and provides a visible return action.
- A late asynchronous completion after route exit is ignored by the runtime session token.
- Cleanup is idempotent. It may run from route unmount, explicit exit, or native back without throwing.
- A failed controlled reload is not retried in a loop; the next explicit game launch starts a new session.

## Verification

- Build the Web app and run the existing browser smoke verifier.
- Add a focused route/lifecycle test or deterministic browser check that records reload calls, starts Flash and local revival, exits, and asserts the library returns without a reload while the active tab remains selected. Assert one deferred reload for MRP and the existing reload policy for J2ME.
- Exit once during Flash boot and once after Flash failure; assert the initialized no-op or registered cleanup prevents late player attachment or state updates before the library route is committed.
- At 390x844 and 844x390, record `.player`, `.playerStage`, toolbar, and runtime canvas rectangles for boot, running, error, and confirmation states. Assert no horizontal overflow and no toolbar/canvas overlap in landscape.
- Exercise one Android back press in a game, cancel it, confirm it, and press back from the library. Assert one native message and one confirmation per press.
- Run the Android build and launch the APK on an API 35 emulator when available; exercise Flash launch, Android back, cancel, confirm exit, and re-entry. Record physical-device and iOS coverage separately.
- Verify J2ME and MRP still use their documented reload policy and that the WebView native back bridge sends exactly one navigation event per press.
- Run `git diff --check`, Web build, mobile asset preparation/verifier, and relevant tests.

## Non-Goals

- Rewriting the J2ME or MRP engines.
- Removing all document reloads before the legacy runtimes can prove safe disposal.
- Adding a new design system package or a native Flash player.
- Reworking game catalog data, Flash compatibility, or emulator core behavior.
