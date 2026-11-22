# J2ME Phone Keypad and Startup Exit Design

## Goal

Restore the traditional phone-style keypad for J2ME portrait play and prevent
the startup lifecycle from showing an exit confirmation or leaving the runtime
blocked after selecting "continue".

## Scope

- Keep the shared SVG keyboard and its logical action adapters.
- Add a phone keypad preset with navigation controls above a numeric keypad,
  and make it the J2ME portrait default unless the user has an explicit
  profile or per-game override.
- Make runtime readiness and exit-confirmation state transition atomically from
  the player's point of view.
- Preserve existing input mappings, saved layouts, normal back/exit behavior,
  and runtime cleanup.

## Behavior

1. A newly opened J2ME game starts with no exit confirmation visible.
2. Native back and toolbar back are ignored while the J2ME runtime is still
   starting, unless the runtime has already reported a terminal failure.
3. Selecting "continue" only dismisses the confirmation overlay; it must not
   stop, invalidate, or reload the runtime.
4. In portrait orientation, the automatic J2ME profile uses the phone keypad
   preset: navigation controls and soft keys above a 3x4 numeric keypad.
   Explicit runtime/orientation assignments, per-game overrides, and custom
   layouts remain authoritative.
5. On teardown, all keyboard sources and runtime hooks are released exactly
   once.

## Implementation Boundaries

The player owns lifecycle gating. The keyboard profile resolver owns layout
selection. Runtime scripts remain adapters and are not rewritten unless a
reproduction proves that they mutate or replace the shared surface.

The built-in layout catalog contains the existing `portrait-dpad`,
`landscape-split`, and `qwerty-72` layouts plus the new `phone-keypad` preset.
The runtime keyboard is an absolute SVG overlay over the runtime stage and does
not participate in document flow; only key nodes accept pointer input.

## Verification

- Unit tests for profile resolution and lifecycle gating.
- Web build.
- Browser shell smoke test covering J2ME startup, portrait layout selection,
  back during startup, continue, and normal exit.
- Android WebView behavior remains a residual risk if no device or emulator is
  available; this must be stated explicitly in delivery.
