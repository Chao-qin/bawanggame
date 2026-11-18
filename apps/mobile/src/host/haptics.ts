type HapticMessage = {
  type: string
  payload?: unknown
}

export type VibrationAdapter = {
  vibrate: (duration: number) => void
}

export function dispatchHapticMessage(message: HapticMessage, vibration: VibrationAdapter): boolean {
  if (message.type !== 'haptic' || typeof message.payload !== 'object' || message.payload === null) return false
  if (!('duration' in message.payload)) return false

  const duration = message.payload.duration
  if (typeof duration !== 'number' || !Number.isFinite(duration) || duration <= 0) return false

  vibration.vibrate(Math.max(8, Math.min(40, Math.round(duration))))
  return true
}
