import { KeyboardSurface } from './keyboard/KeyboardSurface.jsx'

export function FlashControls({ adapter, ...props }) {
  return <KeyboardSurface {...props} runtime="flash" input={adapter} />
}
