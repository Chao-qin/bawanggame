# Unified Virtual Keyboard System

## Goal

Replace the separate J2ME/MRP and Flash virtual-keyboard implementations with
one configurable keyboard system. The in-game keyboard and its layout editor
must render their complete interactive surfaces with SVG; neither surface may
contain HTML controls or `foreignObject`.

The system provides:

- A shared logical action catalog and runtime-specific input adapters.
- Three or more built-in layouts: a 72-key game-focused QWERTY layout, a
  landscape split-control layout, and a traditional portrait D-pad layout.
- Multiple selectable built-in themes.
- Automatic layout/theme selection by runtime and viewport orientation, with
  editable rules and manual overrides.
- Globally reusable custom layouts edited in an SVG-only visual editor.
- Physical keyboard bindings that resolve to the same logical actions as
  virtual-key input.

## Scope

- Replace the J2ME/MRP HTML keypad buttons and Canvas keypad renderer with a
  shared React SVG keyboard surface.
- Replace Flash's separate HTML-button controls with the shared SVG surface.
- Define a versioned keyboard schema for actions, layouts, themes, and profile
  assignments.
- Add an SVG layout editor that can add/hide keys, move and resize keys, change
  action assignments and stacking order, preview, save, discard, and restore.
- Adapt existing J2ME, MRP, and Ruffle input paths to consume logical actions.
- Preserve current multi-touch, sliding, D-pad center, repeat, haptic, keyboard,
  gamepad, runtime cleanup, and text-entry behavior where applicable.
- Migrate or preserve existing per-game touch-layout and physical-key bindings.

The emulator display Canvas, phone/game stage, editors for game text entry,
settings outside the keyboard editor, dialogs, and the surrounding application
DOM remain unchanged. The editor may be mounted in an existing application
surface, but all visible and interactive editor controls are SVG nodes.

## Non-goals

- Replacing the emulator display renderer.
- Arbitrary freehand paths or user-authored vector artwork for keys.
- A custom theme editor; users select among built-in themes.
- Cross-platform guarantees for screen-reader behavior beyond explicit SVG
  labels and focus semantics.
- A continuous animation loop while the keyboard is idle.

## Architecture

### Action catalog and input routing

Every keyboard control references a stable `actionId`. Layout labels and
geometry are presentation data; they do not define emulator behavior.

The initial action catalog preserves existing runtime IDs: `up`, `down`,
`left`, `right`, `ok`, `choice`, `back`, `ret`, `clear`, `num0` through
`num9`, `star`, and `pound`. Additional Flash actions use
`flash:<KeyboardEvent.code>` and custom non-emulator controls use
`custom:<stable-id>`. Catalog entries are versioned records; Flash entries
include both the DOM `KeyboardEvent.key` value and `KeyboardEvent.code` value
that the adapter dispatches. Built-in pairs are explicit: `KeyA`-`KeyZ` map to
lowercase `a`-`z`; `Digit0`-`Digit9` map to `0`-`9`; `Space` maps to a single
space; arrow codes map to same-named arrow key values; Enter, Backspace, Tab,
Escape, Delete, and F1-F12 use same-named key/code values; `ShiftLeft`,
`ControlLeft`, and `AltLeft` map to `Shift`, `Control`, and `Alt`; and
`Minus`, `Equal`, `BracketLeft`, `BracketRight`, `Backslash`, `Semicolon`,
`Quote`, `Comma`, `Period`, `Slash`, and `Backquote` map respectively to `-`,
`=`, `[`, `]`, `\\`, `;`, `'`, `,`, `.`, `/`, and `` ` ``. Custom Flash
entries store both values rather than deriving one from the other.

J2ME maps the shared IDs to its existing codes: directions `-1` through `-4`,
`ok=-5`, `choice=-6`, `back=-7`, `clear=-8`, `ret=-11`, `star=42`,
`pound=35`, and `numN=48+N`. MRP maps directions `12` through `15`, `ok=20`,
`choice=17`, `back=18`, `ret=16`, `clear=23`, `star=10`, `pound=11`, and
`numN=N`. Each adapter retains its existing named-key overrides. Platform
support is explicit; unsupported actions remain editable but are disabled in
runtime layouts for that platform.

Legacy touch-layout aliases migrate as `confirm -> ok`, `soft-left -> choice`,
`soft-right -> back`, and `digit-N -> numN`. Migration is source-aware:
touch-layout action slot `back` means the right soft key and remains `back`;
Java `config.keymap.back` means hangup and migrates to `ret`. Existing
`InputMapping.keyboard` IDs, including Escape -> `ret`, remain unchanged.
`back` and `ret` remain distinct: `back` is the right soft key and `ret` is the
hangup/return key.

Physical keyboard bindings map `KeyboardEvent.code` to `actionId`. Pointer
presses on SVG keys also produce `actionId`. Each source has a stable identity:
`keyboard:<code>`, `pointer:<pointerId>:<actionId>`, or
`gamepad:<padIndex>:<control>`. Repeated `keydown` events for a source already
held are ignored. Two physical keys mapped to the same action remain separate
sources and release independently.

The shared router reference-counts sources per action. It emits one logical
down edge when the first source presses and one up edge when the last source
releases. An action-level repeat timer runs only while at least one source is
held and repeat is enabled; it stops after the last release. Blur, visibility
loss, orientation/profile changes, and runtime teardown release every source.
When a pointer slides between controls, its pointer/action source releases the
previous action before pressing the next. A diagonal D-pad press creates one
source per active direction action under the same pointer ID; moving from a
diagonal to a cardinal direction releases only the departed direction source.

Runtime adapters translate logical actions into platform events:

- Flash dispatches paired `keydown`/`keyup` events to the active Ruffle player
  using the configured `key` and `code`.
- J2ME converts actions through its existing key-code and frame-synchronized
  MIDP input path.
- MRP converts actions through its existing key-code and `c_event` path.

The physical-key binding UI reuses the existing capture flow. Bindings remain
game-specific to preserve current behavior. Stored bindings already using the
shared IDs remain unchanged; legacy aliases are migrated with the same table
above, and unknown bindings are preserved but marked inactive until reassigned.
Existing gamepad bindings continue to enter the same action router. Existing
per-game repeat delay and interval settings remain authoritative for J2ME/MRP;
the router receives those values from each runtime adapter. Flash repeat
follows its current runtime policy and is disabled unless enabled by the Flash
profile.

### Layout data

Layouts are versioned records with:

- Stable layout ID, generated display name, schema version, and target metadata.
- A list of controls with stable control ID, `actionId`, label, visibility,
  normalized `x`, `y`, `width`, and `height`, rotation, and z-order.
- A supported SVG shape kind selected from a bounded catalog of rectangles,
  rounded rectangles, circles, and D-pad segments.

Coordinates are normalized against the entire runtime stage, not a fixed
keypad dock. The stage-sized SVG view uses the same SVG nodes for drawing and
pointer hit testing; input code must not maintain duplicate key coordinates.
The editor previews the runtime stage, safe area, emulator display, and
potentially obscured regions.

Built-in layouts are immutable. Editing a built-in creates a globally reusable
custom copy. The 72-key QWERTY preset is game-focused and compact rather than a
full desktop keyboard with a numeric keypad. Its exact set is 26 letters, 10
digits, 11 punctuation keys (`-`, `=`, `[`, `]`, `\\`, `;`, `'`, `,`, `.`, `/`,
and `` ` ``), four arrows, eight common controls (Space, Enter, Backspace, Tab,
Escape, Shift, Ctrl, Alt), F1-F12, and Delete. It remains selected in both
Flash orientations by default; narrow targets may trigger size/overlap
warnings.

### Layout and theme profiles

The profile resolver selects a layout and theme using runtime type and actual
viewport orientation (`portrait` or `landscape`). Assignment precedence is:

1. The user's explicit runtime/orientation assignment.
2. A per-game migrated legacy layout override when no explicit assignment exists.
3. The built-in default for that runtime/orientation.

The profile editor can clear an explicit assignment to return to automatic
selection. It can also clear a migrated per-game override, after which that
game follows the explicit runtime/orientation assignment or built-in default.
Both clear operations are persisted.

Defaults are:

| Runtime | Portrait | Landscape |
| --- | --- | --- |
| Flash | 72-key game QWERTY | 72-key game QWERTY |
| J2ME | Traditional D-pad keypad | Landscape split-control layout |
| MRP | Traditional D-pad keypad | Landscape split-control layout |

The landscape split layout places the directional controls and remaining
keypad controls in separate left/right groups. Users can change the assignment
for each runtime/orientation pair or manually lock a profile. A layout change
releases all active sources before the new geometry becomes interactive.

Themes are versioned token sets for background, key fill, text, border, and
pressed/focused states. Layouts and themes are selected independently. The
initial selector exposes at least three built-in themes (classic, high
contrast, and light) and stores the chosen theme with each runtime/orientation
profile.

### SVG runtime surface

One shared React component renders an SVG root spanning the runtime stage. It
renders only visible controls from the resolved layout, in z-order. Each key
node has a stable control ID, action ID, visible label, and explicit SVG focus
and accessibility attributes. The root ignores pointer events; visible key
nodes receive them, so empty space passes through to the game or emulator.
Pointer input targets the same SVG nodes.

The existing classic scripts remain platform adapters during this change. The
React component registers a runtime bridge before J2ME/MRP scripts bind input.
The bridge contract is:

- `getSurface()` returns the mounted stage-sized SVG root.
- `getProfile()` returns the active runtime/orientation layout and theme.
- `subscribePressed(listener)` reports the set of currently pressed control
  IDs for SVG rendering.
- `subscribeProfile(listener)` notifies the surface after orientation or
  assignment changes.
- `releaseAll()` clears held input before a profile change or teardown.

Each runtime session creates a fresh keyboard bridge registry keyed by its
session ID before rendering the runtime player. The React SVG component
registers its mounted root and bridge methods from a layout effect against that
session registry. Runtime startup awaits that registry's ready promise, which
is notified by registration. The wait is bounded to three seconds; timeout
resolves unavailable and clears the timer. Session teardown unregisters the
surface, releases input, invalidates the registry, and resolves any pending
wait as unavailable. A later runtime always creates a new registry and promise.
J2ME/MRP scripts that bind virtual input load only after readiness. If mounting
fails or times out, physical input remains enabled and the runtime reports
virtual input as unavailable.
Registration after timeout or session invalidation is rejected. The React
surface receives the unavailable result, hides or disables virtual keys for
that session, and does not retry; the runtime status surface explains that
virtual keyboard input is unavailable. A new session gets a fresh registry.

`Touchpad.bind({ surface, actionMap, onPressedChange, ... })` receives the SVG
root, active action mapping, and pressed-state callback. It binds pointer
listeners to that root, uses SVG elements and their live bounding boxes for hit
tests, and publishes pressed control IDs through the callback. J2ME `keymap.js`,
MRP `mrp-runtime.js`, and Flash's React adapter provide their existing platform
sinks through the same logical action contract.

Startup and teardown order:

1. The runtime session creates its bridge registry before player render.
2. React mounts the SVG surface and registers it from a layout effect.
3. Runtime startup awaits the registry with a three-second timeout before
   loading scripts that bind virtual input.
4. The selected runtime initializes its adapter and binds the input controller
   to `getSurface()`.
5. On layout/orientation change, the controller releases active inputs, the
   profile resolver updates the SVG, and hit testing reads the new SVG geometry.
6. On runtime exit, the controller releases all keys and timers, detaches
   listeners, the component unregisters its surface, and the session invalidates
   the registry before React unmounts.

If the SVG surface or required runtime sink is unavailable, the runtime remains
open but reports the keypad as unavailable through its existing runtime status
surface; it must not swallow input silently or leave keys held.

The SVG root has `pointer-events: none`; visible key nodes opt into pointer
events. The controller listens on the root and uses pointer capture there.
Pointer cancel, lost pointer capture, and release outside the stage release the
associated source. Empty SVG space remains transparent to the underlying game.

### SVG layout editor

The editor is a separate React SVG surface with no HTML controls or embedded
HTML. It includes an SVG-rendered stage preview, key catalog, profile/theme
selectors, action assignment controls, selection handles, validation
indicators, and save/discard/restore commands. SVG commands expose focus,
labels, and keyboard activation. Arrow keys move a selected control; modifier
plus arrow keys resize it; SVG-rendered steppers adjust normalized geometry
precisely; Enter/Space activates selected commands.
Tab/Shift+Tab follows a stable order: profile, theme, key catalog, selected
control geometry/actions, z-order commands, then save/discard/restore. Catalog
entries, selectors, and selection handles expose focus rings and can be
activated or adjusted without a pointer.

The editor root marks its subtree with `data-keyboard-editor`. The global
physical-key router ignores events whose target is inside that subtree. The
editor prevents default and stops propagation for its handled navigation and
command keys. Entering edit mode first releases all runtime input; leaving edit
mode restores normal routing. Tests must prove that editor navigation,
selection, adjustment, and save commands never dispatch emulator actions.

Users can select a runtime/orientation profile, clone a built-in layout, add
or hide catalog keys, drag and resize key shapes, change z-order and logical
action, and preview the result without sending input to the emulator. New
layouts receive generated names. The editor writes the same versioned layout
records consumed by runtime rendering.

Validation reports keys outside the stage, overlapping hit targets, small
touch targets, and controls obscured by the emulator or safe-area boundary.
Coordinates and dimensions must be finite, dimensions must be positive, and
visible controls must remain within normalized stage bounds. The editor
prevents saving out-of-stage geometry. Overlap and small-target warnings do
not prevent saving; runtime hit testing follows saved SVG z-order, with the
topmost control receiving the press.

## Persistence and Migration

- Built-in layouts and themes ship as versioned immutable defaults.
- Custom layouts, profile assignments, and theme choices live in a versioned
  global user configuration store and are reusable across games.
- Physical keyboard bindings remain per-game, matching current persistence.
- Existing J2ME/MRP per-game touch-layout settings are migrated into per-game
  layout overrides. D-pad rotation becomes SVG arrow rotation, side selection
  becomes the left/right group assignment, number order becomes control
  positions, and action-slot mappings become `actionId` assignments.
- Existing physical-key bindings using runtime action names stay unchanged.
  Legacy `config.keymap.back` maps to `ret`; legacy touch-layout `back` stays
  `back`; `soft-right` maps to `back`. Unknown binding records are retained
  inactive rather than deleted.
- A user's explicit runtime/orientation assignment supersedes a migrated
  per-game override. Clearing the per-game override removes only that migrated
  compatibility layer; it does not delete the global custom layout. Clearing
  the explicit assignment returns to automatic selection, then the migrated
  override if one remains, then the built-in default.
- If a legacy record contains unsupported values, preserve the raw record in a
  migration backup, apply valid fields, and report the fallback; do not
  overwrite the original until the migrated record is saved successfully.
- Invalid or unsupported stored records fall back to the matching built-in
  profile while preserving unrelated valid records.
- Save operations are atomic at the record level; canceling the editor leaves
  the previous record unchanged.

## Compatibility Requirements

- J2ME, MRP, and Flash use the same layout/profile/theme model and SVG surface.
- Existing physical key and gamepad mappings remain functional.
- J2ME/MRP D-pad rotation, number ordering, soft-key assignments, side swapping,
  center confirmation modes, long-press repeat, and haptics remain functional.
- Flash keys dispatch balanced keydown/keyup events to Ruffle, including
  multi-pointer presses and release on blur/fullscreen/runtime exit.
- Viewport orientation changes select the configured profile without changing
  emulator screen orientation policy.
- Text input, runtime dialogs, settings outside the keyboard editor, and game
  display interaction continue to work.
- Edit mode never dispatches key events to the emulator.

## Error Handling and State

- A missing surface or runtime adapter marks virtual input unavailable and
  reports a runtime status error; emulator startup continues where possible.
- Pointer cancel, lost capture, blur, page hide, fullscreen transitions where
  relevant, visibility loss, profile changes, and unmount release every held
  action.
- Runtime session teardown unregisters and invalidates its bridge; late
  readiness or callbacks from an old session cannot bind to a new surface.
- Overlap and small hit targets produce editor warnings; saved custom layouts
  remain intact until the user changes them.
- If a profile record is malformed, use its runtime/orientation built-in
  fallback and expose a recoverable reset action.
- Adapter errors release the affected source and are logged with runtime and
  action IDs.

## Acceptance

- The single PR is completed through three gated phases:
  1. Schema, storage/migration, action router/adapters, and unit tests.
     Gate: schema validation, legacy migration/backup, source ref-count,
     duplicate keydown, pointer slide transition, repeat timer, platform
     action-to-code, unknown-binding retention, and source-aware `back`
     migration tests pass.
  2. Runtime SVG surface, three built-in layouts, themes, profile resolver,
     and Flash/J2ME/MRP integration tests.
     Gate: 72-key inventory, orientation routing, SVG pass-through, pointer
     cancellation, adapter down/up balance, session bridge teardown/recreation,
     late bridge registration rejection, and all three runtime integration
     test groups pass. Flash tests assert matching keydown/keyup `key` and
     `code` payloads for representative letters, digits, Space, arrows, Enter,
     Backspace, modifiers, and punctuation.
  3. SVG-only editor, validation, persistence flows, and cross-runtime browser
     smoke tests.
     Gate: editor keyboard navigation/actions are isolated from game input;
     layout save/discard/reload, validation warnings, and portrait/landscape
     browser smoke tests pass.
  Each phase's tests pass before work proceeds to the next phase.
- The in-game keypad and layout editor render no HTML controls or
  `foreignObject`; the keypad surface is SVG, not Canvas.
- At least three immutable built-in layouts exist, including the 72-key
  game-focused QWERTY, landscape split controls, and traditional portrait
  D-pad keypad.
- Flash defaults to the 72-key layout in portrait and landscape. J2ME/MRP
  default to portrait D-pad and landscape split controls.
- Runtime/orientation profile assignments and built-in themes can be changed
  and persist after reload.
- The SVG editor can clone a built-in, add/hide/move/resize/reorder controls,
  reassign actions, show validation warnings, save, discard, and restore.
- Custom layouts are globally reusable, immutable presets remain unchanged,
  and malformed storage recovers to a built-in without losing other records.
- Touch and physical input for the same action produce balanced, deduplicated
  down/up events; multiple simultaneous sources do not release one another.
- D-pad radial movement, diagonal input, center modes, sliding, repeat,
  haptics, gamepad mapping, and lifecycle release pass focused tests.
- Flash, J2ME, and MRP browser smoke tests cover portrait, landscape, profile
  switching, key labels, multi-touch, and clean runtime teardown.
- Build, unit tests, browser verification, and `git diff --check` pass.
- SVG focus/labels and screen-reader results are documented for tested browser
  and WebView environments; unsupported combinations remain explicit.
