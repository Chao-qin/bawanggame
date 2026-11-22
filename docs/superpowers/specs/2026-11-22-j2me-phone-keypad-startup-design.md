# J2ME Phone Keypad and Startup Exit Design

## Goal

Restore the traditional phone-style keypad for J2ME portrait play and prevent
the startup lifecycle from showing an exit confirmation or leaving the runtime
blocked after selecting "continue".

## Scope

- Keep the shared SVG keyboard and its logical action adapters.
- Ensure J2ME portrait resolves to the traditional D-pad keypad unless the user
  has an explicit profile or per-game override.
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
4. In portrait orientation, the active J2ME layout exposes the phone D-pad,
   soft keys, numeric keypad, and supported controls in the shared SVG surface.
5. On teardown, all keyboard sources and runtime hooks are released exactly
   once.

## Implementation Boundaries

The player owns lifecycle gating. The keyboard profile resolver owns layout
selection. Runtime scripts remain adapters and are not rewritten unless a
reproduction proves that they mutate or replace the shared surface.

## Verification

- Unit tests for profile resolution and lifecycle gating.
- Web build.
- Browser shell smoke test covering J2ME startup, portrait layout selection,
  back during startup, continue, and normal exit.
- Android WebView behavior remains a residual risk if no device or emulator is
  available; this must be stated explicitly in delivery.
