# Orientation Layout Fix Design

## Goal

Make the J2ME runtime usable in portrait and landscape viewports without
cropping the virtual phone or wasting landscape space.

## Geometry

- The player stage is the only geometry boundary. It is always constrained to
  the available player viewport below the runtime toolbar.
- Portrait uses one column: the display is centered above the keypad and both
  are bounded by the stage width.
- Landscape uses three columns: numeric keypad on the left, display in the
  center, and navigation/function keys on the right. The display keeps its
  logical aspect ratio. Keypad columns use the remaining width and a touchable
  minimum size instead of a fixed viewport percentage.
- Fullscreen and regular runtime use the same layout rules; fullscreen only
  changes the stage viewport boundary.

## State And Refit

`auto` is resolved to the current physical orientation before CSS is applied.
Orientation, fullscreen transitions, and viewport changes schedule one refit
after the new stage geometry exists. Refitting updates the logical canvas size
and its CSS size together.

## Acceptance Criteria

- Portrait runtime has no horizontal overflow or cropped keypad/display.
- Landscape runtime has visible, usable controls on both sides and a centered
  display with no overlap.
- Entering and leaving fullscreen preserves the same orientation geometry and
  recalculates the canvas scale.
- The old grid reset cannot override the landscape column assignment.

## Touch Layout Customization

- Touch layout configuration is separate from external keyboard mapping.
- Presets cover standard, mirrored/rotated D-pad, swapped landscape side groups,
  and numeric keypad order changes while keeping a stable 3x4 grid.
- A visual slot can map to a different game action. Active pointers are released
  before a mapping is changed so no key remains stuck.
- Layout is stored per game with validated values and can be reset independently
  from the other game settings.
- Fullscreen overlays remain inside the fullscreen player element.
