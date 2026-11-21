import { KeyboardSurface } from './keyboard/KeyboardSurface.jsx'

export function FlashControls({ adapter, session, gameId, ...props }) {
  return <KeyboardSurface {...props} session={session} gameId={gameId} runtime="flash" input={adapter} />
}
