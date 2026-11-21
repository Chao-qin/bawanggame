# UI Development Standards

## Ownership

- `apps/web/src/App.jsx` owns route-level composition and workflow state. Keep reusable presentation and layout primitives out of this file when extraction creates a stable, shared API.
- `apps/web/src/components/` owns reusable application-shell, catalog-entry, navigation, and status components.
- `apps/web/src/runtime/` owns React runtime adapters, runtime controls, and runtime lifecycle integration. Do not put game-engine code here.
- `apps/web/src/responsive.js` is the single owner of viewport, orientation, visual-viewport, and host safe-area listeners. Other modules consume its root CSS variables, data attributes, and `xiaochao:viewportchange` event.
- `apps/web/src/mobile-ui.css` currently owns most application UI styling. Keep changes there unless a focused stylesheet extraction gives one domain clear ownership and removes conflicting rules. Do not create files only to match an idealized folder tree.
- `apps/web/uno.config.js` owns utility shortcuts, not a second copy of application theme or responsive layout rules.
- `apps/mobile/web/` contains the legacy simulator engine and runtime assets. New application UI belongs in `apps/web`; legacy CSS may change to adapt the runtime shell, but its DOM/API contract and input behavior must remain stable.
- `apps/web/verify.mjs` owns browser workflow and geometry smoke checks. Keep tests reproducible and explicitly report optional fixtures.

## Components And Visual Tokens

- Search for an existing component or token before adding another.
- Extract components when they remove meaningful duplication or define a stable layout boundary. Prefer explicit variants and data props over selectors coupled to deep DOM structure.
- Repeated game entries share stable artwork/icon geometry, title, secondary metadata, and action placement. Variants may change the metadata and available actions, not the basic hierarchy.
- Define colors, typography, spacing, radii, control dimensions, focus, and content width as semantic CSS variables. Components consume tokens; avoid independent hard-coded values for application chrome.
- Keep type sizes stable across viewport changes. Use responsive constraints for layout and hit-area dimensions, not viewport-scaled font sizes.
- Use icons from the existing icon library. Icon-only controls require an accessible name, a visible focus state, and a stable hit area.
- Keep loading, empty, offline, error, disabled, selected, and installed states visually distinct and consistent.
- Allow long text to wrap when it carries useful information. If it must truncate, preserve the full value for assistive technology and an appropriate title/accessible description. Primary actions must not be pushed off-screen by metadata.

## Responsive Layout

- Design against available width, visual height, orientation, and safe-area insets, not named device models.
- The app shell, catalog content, and runtime shell each own a clear scroll/layout boundary.
- Fixed navigation must reserve corresponding content space with the same token or measured geometry. Do not compensate with an unrelated magic padding value.
- Search/filter controls wrap or stack before labels or touch targets become crowded.
- Runtime toolbar, game surface, input regions, and overlays are independent regions. Controls and overlays must not alter the intrinsic game-surface ratio.
- Landscape runtime layout reserves left and right control regions around the centered game surface. Short-height layouts scale gaps and controls while maintaining usable targets; no region may overlap or escape the visual viewport.
- Recheck rotation, fullscreen entry/exit, keyboard/visual viewport changes, and host inset updates. Do not add component-local viewport listeners when the responsive contract already publishes the change.

## Change Workflow

1. Record target behavior, scope, preserved behavior, and measurable acceptance criteria before implementation.
2. Identify the owning component/layout domain and existing tokens before writing CSS.
3. Add or update a focused failing behavior or geometry check where practical.
4. Keep changes within the owning module. Do not mix unrelated cleanup into the UI task.
5. Run the production build and browser checks at `320x568`, `365x708`, `390x844`, `430x932`, `844x390`, `667x375`, `1024x768`, and `1365x768`.
6. Check overflow, pairwise overlap, text clipping, visible focus, touch target bounds, safe areas, and loading/error/empty states.
7. For WebView changes, prepare and verify packaged web assets. For Android changes, inspect the APK and report emulator and physical-device validation separately.
8. Preserve generated staging directories, APKs, and temporary browser profiles outside the PR unless the task explicitly requires them.
9. Complete the repository's required diff review, feature audit, and applicable platform validation before delivery. Report commands, results, unavailable fixtures, untested devices, and residual risks.

## Review Checklist

- [ ] Correct component and stylesheet ownership; no competing token/layout definitions.
- [ ] No horizontal overflow, unintended overlap, or fixed navigation covering content.
- [ ] Cards preserve readable hierarchy and stable primary action placement.
- [ ] Controls remain reachable, labeled, focusable, and usable with touch and keyboard.
- [ ] Runtime game surface preserves its ratio through orientation and fullscreen changes.
- [ ] Browser and embedded WebView consume the same responsive contract and current assets.
- [ ] Routes, storage, game launch, input mapping, exit, and cleanup behavior remain intact.
- [ ] Verification claims match the actual browser, WebView, emulator, and device evidence.
