// Which keys each pointer holds. A pointer is tracked from the moment it lands on the keyboard until it lifts, even
// while it sits between keys, so a finger slid across the keyboard leaves one key and enters the next. One pointer
// may hold several keys at once (a diagonal on the direction wheel holds two directions).
//
// A target is what a pointer is over: { keyId, units: [unitId…], hub } — keyId is the layout key under it (null
// between keys), units the actions it holds there, hub whether it landed on the wheel's centre (see hit-test.js).
const EMPTY = Object.freeze({ keyId: null, units: Object.freeze([]), hub: false })

export const createPointerState = () => ({ pointers: {} })

const tracked = (state, pointerId) => Object.hasOwn(state.pointers, pointerId)

export const pointerTarget = (state, pointerId) => (tracked(state, pointerId) ? state.pointers[pointerId] : EMPTY)

/** Starts tracking a pointer. A pointer already tracked keeps its target. Returns the units it now holds. */
export const pointerDown = (state, pointerId, target = EMPTY) => {
  if (tracked(state, pointerId)) return { state, pressed: [] }
  return { state: { pointers: { ...state.pointers, [pointerId]: { ...EMPTY, ...target } } }, pressed: [...(target.units || [])] }
}

/** Moves a tracked pointer onto `target`: the units it left are released and the ones it entered pressed. */
export const pointerMove = (state, pointerId, target = EMPTY) => {
  if (!tracked(state, pointerId)) return { state, pressed: [], released: [] }
  const previous = state.pointers[pointerId]
  const next = { ...EMPTY, ...target, hub: previous.hub }
  return {
    state: { pointers: { ...state.pointers, [pointerId]: next } },
    released: previous.units.filter((unit) => !next.units.includes(unit)),
    pressed: next.units.filter((unit) => !previous.units.includes(unit)),
  }
}

/** Stops tracking a pointer (lift or cancel); returns the units it held. */
export const pointerUp = (state, pointerId) => {
  if (!tracked(state, pointerId)) return { state, released: [] }
  const pointers = { ...state.pointers }
  const { units } = pointers[pointerId]
  delete pointers[pointerId]
  return { state: { pointers }, released: [...units] }
}

export const releaseAll = (state) => ({
  state: createPointerState(),
  released: Object.entries(state.pointers).flatMap(([pointerId, { units }]) => units.map((unitId) => ({ pointerId, unitId }))),
})

export const pressedKeyIds = (state) => new Set(Object.values(state.pointers).flatMap(({ units }) => units))
