import { dispatchOrientationMessage } from './orientation'

describe('dispatchOrientationMessage', () => {
  it.each(['auto', 'portrait', 'landscape'] as const)('passes %s to the native module', (mode) => {
    const lock = jest.fn()
    expect(dispatchOrientationMessage({ type: 'orientation.lock', payload: { mode } }, { lock })).toBe(true)
    expect(lock).toHaveBeenCalledWith(mode)
  })

  it.each([
    ['another message', { type: 'haptic', payload: { mode: 'landscape' } }],
    ['an unknown mode', { type: 'orientation.lock', payload: { mode: 'reverse' } }],
    ['no payload', { type: 'orientation.lock' }],
  ])('ignores %s', (_name, message) => {
    const lock = jest.fn()
    expect(dispatchOrientationMessage(message, { lock })).toBe(false)
    expect(lock).not.toHaveBeenCalled()
  })

  it('does nothing when the native module is missing', () => {
    expect(dispatchOrientationMessage({ type: 'orientation.lock', payload: { mode: 'landscape' } }, undefined)).toBe(false)
  })
})
