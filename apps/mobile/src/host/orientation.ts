// The page asks the host to turn the whole app when the player picks portrait or landscape by hand; 'auto' hands
// the choice back to the phone's rotation sensor. Android rotates the activity (XiaochaoOrientationModule.kt).
export type OrientationMode = 'auto' | 'portrait' | 'landscape'
export type OrientationModule = { lock(mode: OrientationMode): void }

const MODES = new Set<OrientationMode>(['auto', 'portrait', 'landscape'])

export function dispatchOrientationMessage(message: { type: string; payload?: unknown }, module: OrientationModule | undefined): boolean {
  if (message.type !== 'orientation.lock' || !module) return false
  const mode = (message.payload as { mode?: unknown } | undefined)?.mode
  if (typeof mode !== 'string' || !MODES.has(mode as OrientationMode)) return false
  module.lock(mode as OrientationMode)
  return true
}
