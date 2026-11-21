export function FlashControls({ surface: KeyboardSurface, ...props }) {
  if (!KeyboardSurface) return null
  return <KeyboardSurface {...props} runtime="flash" />
}
