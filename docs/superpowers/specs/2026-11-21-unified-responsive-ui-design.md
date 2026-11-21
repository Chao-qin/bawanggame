# Unified Responsive UI And Development Standards

## Task Contract

- **Goal behavior:** Give the web app and embedded WebView a consistent, responsive UI across the library, stores, navigation, and game runtimes. Establish project rules that prevent layout and component drift.
- **Scope:** `apps/web` UI and responsive contract; `apps/mobile/web` runtime CSS and its responsive integration; UI standards, component ownership, and browser/WebView verification documentation.
- **Preserve:** Routes and browser history, game metadata and artwork, JAR/SWF/MRP launch and storage behavior, runtime input mappings and engine behavior, fullscreen and exit lifecycle, host safe-area bridge, and current theme intent.
- **Acceptance:** No UI overflow or overlap across the agreed viewport matrix; navigation, catalog cards, filters, control regions, and game surfaces remain legible and usable in portrait, landscape, short-height, fullscreen, browser, and embedded WebView contexts. Existing game launch, keyboard/touch input, rotation, return, and cleanup checks continue to pass.

## Context And Confirmed Decisions

Screenshots show mismatched information density and card layouts, crowded store filters, fixed navigation competing with scrollable content, and game controls competing with the game surface in landscape. Source inspection confirms that styles are spread across `apps/web/src/mobile-ui.css`, UnoCSS preflight strings in `apps/web/uno.config.js`, and `apps/mobile/web/style/main.css`. The React runtime also maintains viewport-derived toolbar state while the shared responsive contract dispatches viewport events.

Confirmed design decisions:

- Preserve a dark default theme and expose semantic theme tokens. Do not add theme switching UI in this task.
- Use bottom navigation on phones and top navigation on tablet/desktop while preserving entry order and route state.
- Use a single-column game list on narrow screens and a grid at wider widths. Reuse one game-entry visual contract for library and catalog entries, with variants only for content-specific metadata and actions.
- In landscape runtime layouts, reserve left and right control regions around a centered, aspect-ratio-preserving game surface. Scale controls against available height and safe areas on short screens.
- Include both browser UI and the embedded React Native WebView output.
- Govern legacy simulator runtime CSS but preserve engine and input-mapping behavior.
- Deliver all implementation, documentation, and verification in one branch and one PR.

## Design

### Layout And Component System

Define three explicit layout domains:

1. **Application shell:** brand, primary navigation, page content, and page-level status.
2. **Catalog surfaces:** library cards, recent/popular rows, search/filter controls, catalog results, and pagination.
3. **Runtime shell:** runtime toolbar, game surface, input regions, and overlays.

Each domain owns its scroll container. Fixed or sticky navigation must reserve its actual measured space rather than relying on unrelated hard-coded bottom padding. Runtime controls and overlays must not participate in game-surface sizing.

Create or extract focused shared components for primary navigation, game entries, section headings, search/filter rows, status/empty states, and runtime control regions. Keep content-specific differences explicit through props/variants rather than selectors that depend on nested DOM structure. Avoid a broad rewrite of `App.jsx`; extract only boundaries needed to make ownership clear.

### Responsive Contract

Continue using `responsive.js` as the single owner of viewport listeners and the WebView safe-area bridge. It publishes width, layout height, visual viewport height, keyboard height, safe-area insets, orientation, and short-height state. Components consume root variables and mode attributes rather than registering duplicate resize/orientation listeners.

Use available geometry, not device names:

- Compact/mobile: one-column entries, touch-sized actions, bottom navigation.
- Tablet/desktop: top navigation, constrained readable content width, adaptive catalog grid.
- Portrait runtime: game surface above or between control bands according to runtime capability; controls remain reachable and do not cover the rendered game.
- Landscape runtime: left controls, centered game surface, right controls; preserve the intrinsic game aspect ratio and adapt control size to viewport height.
- Short-height runtime: reduce spacing and control dimensions within documented minimum hit-target rules; do not let toolbar, game surface, and controls overlap.
- Safe areas and visual viewport changes must be honored after rotation, fullscreen transitions, and keyboard appearance.

### Theme And Component Rules

Define semantic tokens for page background, surfaces, elevated surfaces, borders, primary and secondary text, accent, danger, focus, spacing, radii, typography, control height, and content width. The default theme retains the current dark/teal direction, but components must use tokens rather than embedding independent colors or arbitrary values. Keep contrast and focus indicators explicit.

Component guidance:

- A shared game-entry component supports library and store variants, but maintains stable icon/artwork geometry, title, secondary metadata, and primary action placement.
- Search and filter controls wrap or stack before becoming crowded. Submit actions remain visible and keyboard accessible.
- Icon-only controls require accessible names and focus treatment.
- Touch controls have stable hit areas and do not resize when labels or states change.
- Loading, empty, offline, error, disabled, selected, and installed states use consistent status patterns.
- Long titles may truncate only when the full title remains available through accessible text/title behavior; important metadata must not displace the primary action.

### Project Structure And Development Standards

Document current and target ownership without moving files solely for cosmetic organization:

- `apps/web/src/components/`: reusable shell, catalog, and status components.
- `apps/web/src/runtime/`: runtime adapters, runtime shell/control components, and lifecycle integration.
- `apps/web/src/styles/` (or the existing stylesheet location until a focused migration is justified): semantic tokens and domain styles. Do not leave overlapping theme/layout definitions in UnoCSS preflight and CSS.
- `apps/web/src/responsive.js`: sole viewport/safe-area event owner.
- `apps/mobile/web/`: legacy simulator engine and runtime assets. CSS changes must preserve the engine's DOM/API contract; new app-level UI belongs in `apps/web`.
- `apps/web/verify.mjs` and focused tests: reproducible browser geometry and workflow checks.
- `docs/ui-development-standards.md`: directory responsibilities, component API rules, styling/token rules, responsive rules, code review checklist, and verification workflow.

Development workflow for future UI changes:

1. State target behavior, scope, preserved behavior, and measurable acceptance criteria.
2. Identify the owning layout domain and existing component/token before adding new styles.
3. Add or update a focused failing geometry/behavior check where practical.
4. Implement the smallest component or stylesheet change within its owner.
5. Run formatting/lint checks available in the repository, production build, browser viewport matrix, and relevant runtime flow checks.
6. For WebView-affecting changes, prepare and validate packaged web assets; for Android packaging changes, inspect the APK and separately report emulator/real-device coverage.
7. Review for overflow, overlap, focus visibility, touch target size, text clipping, lifecycle cleanup, generated artifacts, and inconsistent tokens before PR.

### Scope Exclusions

- No game engine changes or input mapping redesign.
- No user-selectable theme UI.
- No unrelated application architecture rewrite or business logic changes.
- No claim of real-device validation when only desktop browser emulation or an emulator is available.

## Verification

### Browser Viewport Matrix

At minimum validate:

- `320x568`, `365x708`, `390x844`, `430x932`
- `844x390`, `667x375`, `1024x768`, `1365x768`

For library and both stores, check document overflow, visible navigation bounds, search/filter wrapping, card content/action overlap, and bottom/top content clearance. For runtime screens, check toolbar, game surface, control regions, safe areas, and overlays for viewport bounds and pairwise overlap. Test portrait, landscape, short landscape, fullscreen entry/exit, and rotation restoration.

### Functional Regression

- Route and browser Back behavior remain intact.
- Library card launch, option sheet, import/uninstall flows, and store search/add flows remain intact.
- Touch and physical keyboard events retain matching press/release semantics.
- J2ME/MRP runtime keyboard, keypad, launch, exit, re-entry, and cleanup behavior is unchanged.
- Flash stage aspect ratio and touch controls remain correct before and after fullscreen.
- Responsive contract continues to accept versioned WebView safe-area updates and clears listeners/state on unmount.

### WebView/Packaging

- Build production Web assets and prepare/verify the mobile Web bundle.
- Inspect required generated asset paths and ensure generated staging artifacts are not committed.
- If an Android build is run, inspect APK assets and distinguish emulator from real-device results.

## Residual Risk

The supplied screenshots do not provide exact viewport/device metadata. Browser geometry tests can prove layout bounds but cannot fully represent vendor WebView behavior, physical cutouts, touch ergonomics, or every legacy game aspect ratio. Real-device checks must be recorded separately when hardware is unavailable.
