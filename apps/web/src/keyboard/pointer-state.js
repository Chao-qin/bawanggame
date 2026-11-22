export const createPointerState = () => ({ pointers: {} })
export const pointerDown = (state, pointerId, keyId) => {
  if (Object.hasOwn(state.pointers, pointerId)) return state
  return { pointers: { ...state.pointers, [pointerId]: keyId } }
}
const releasePointer = (state, pointerId) => {
  if (!Object.hasOwn(state.pointers, pointerId)) return { state, released: null }
  const pointers = { ...state.pointers }
  const keyId = pointers[pointerId]
  delete pointers[pointerId]
  return { state: { pointers }, released: { pointerId: String(pointerId), keyId } }
}
export const pointerUp = (state, pointerId) => releasePointer(state, pointerId).state
export const pointerCancel = (state, pointerId) => releasePointer(state, pointerId).state
export const releaseAll = (state) => ({
  state: createPointerState(),
  released: Object.entries(state.pointers).map(([pointerId, keyId]) => ({ pointerId, keyId })),
})
export const pressedKeyIds = (state) => new Set(Object.values(state.pointers))
