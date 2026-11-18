import { dispatchHapticMessage } from './haptics'

describe('dispatchHapticMessage', () => {
  const createVibration = () => ({ vibrate: jest.fn<void, [number]>() })

  it.each([
    ['wrong message type', { type: 'other', payload: { duration: 24 } }],
    ['missing payload', { type: 'haptic' }],
    ['missing duration', { type: 'haptic', payload: {} }],
    ['string duration', { type: 'haptic', payload: { duration: '24' } }],
    ['non-finite duration', { type: 'haptic', payload: { duration: Number.NaN } }],
    ['zero duration', { type: 'haptic', payload: { duration: 0 } }],
    ['negative duration', { type: 'haptic', payload: { duration: -1 } }],
  ])('ignores %s', (_name, message) => {
    const vibration = createVibration()

    expect(dispatchHapticMessage(message, vibration)).toBe(false)
    expect(vibration.vibrate).not.toHaveBeenCalled()
  })

  it.each([
    [1, 8],
    [8, 8],
    [24, 24],
    [40, 40],
    [41, 40],
  ])('bounds %i ms to %i ms', (input, expected) => {
    const vibration = createVibration()

    expect(dispatchHapticMessage({ type: 'haptic', payload: { duration: input } }, vibration)).toBe(true)
    expect(vibration.vibrate).toHaveBeenCalledTimes(1)
    expect(vibration.vibrate).toHaveBeenCalledWith(expected)
  })

  it('dispatches rapid accepted messages in order without canceling an earlier pulse', () => {
    const calls: number[] = []
    const vibration = { vibrate: (duration: number) => calls.push(duration) }

    expect(dispatchHapticMessage({ type: 'haptic', payload: { duration: 24 } }, vibration)).toBe(true)
    expect(dispatchHapticMessage({ type: 'haptic', payload: { duration: 8 } }, vibration)).toBe(true)

    expect(calls).toEqual([24, 8])
  })
})
