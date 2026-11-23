// Which keys a point on the keyboard presses, in layout units. Shared by every KeyboardCanvas, so all of them press
// on landing, follow a sliding finger from key to key, and let go when it leaves a key.
//
// A key with `shape: 'wheel'` is an 8-way direction wheel: its four main directions own 60° sectors and the four
// diagonals the 30° between them, where both neighbouring directions are held. Its hub is the centre key, pressed
// only by a touch that lands there — sliding in from a direction lets the direction go without confirming.

export const WHEEL_HUB = 0.34 // hub radius, as a fraction of the wheel radius
const DIAGONAL_HALF = 15 // degrees either side of a diagonal
const HYSTERESIS = 6 // degrees a finger must cross past a sector edge before the sector changes
const WHEEL_KEEP = 1.25 // a finger steering the wheel keeps it out to this many radii (thumbs drift)

// Screen angles: 0° points right and angles grow clockwise, so 90° is down.
const MAINS = [['right', 0], ['down', 90], ['left', 180], ['up', 270]]
const DIAGONALS = [['down', 'right', 45], ['down', 'left', 135], ['up', 'left', 225], ['up', 'right', 315]]
const DIRECTIONS = ['up', 'down', 'left', 'right']
const ARROWS = { up: '↑', down: '↓', left: '←', right: '→' }

const units = new WeakMap()

/** The units a key presses: the key itself, or one per wheel direction plus the hub. Stable per key object. */
export function keyUnits(key) {
  let list = units.get(key)
  if (list) return list
  if (key.shape === 'wheel') {
    list = [...DIRECTIONS, 'center'].filter((part) => key.wheel?.[part]).map((part) => ({
      id: `${key.id}:${part}`, keyId: key.id, part, value: key.wheel[part], label: part === 'center' ? key.label : ARROWS[part],
    }))
  } else {
    list = [{ id: key.id, keyId: key.id, value: key.value, label: key.label, key }]
  }
  units.set(key, list)
  return list
}

const unitOf = (key, part) => keyUnits(key).find((unit) => unit.part === part)

export function wheelGeometry(key) {
  const radius = Math.min(key.width, key.height) / 2
  return { cx: key.x + key.width / 2, cy: key.y + key.height / 2, radius }
}

const angleBetween = (a, b) => Math.abs(((a - b + 540) % 360) - 180)

/** Direction parts held at angle `angle` (degrees, screen space), given the parts held a moment ago. */
export function wheelDirections(angle, previous = []) {
  const held = new Set(previous)
  for (const [vertical, horizontal, centre] of DIAGONALS) {
    const onDiagonal = held.has(vertical) && held.has(horizontal)
    const onNeighbour = !onDiagonal && (held.has(vertical) || held.has(horizontal))
    const half = DIAGONAL_HALF + (onDiagonal ? HYSTERESIS : onNeighbour ? -HYSTERESIS : 0)
    if (angleBetween(angle, centre) < half) return [vertical, horizontal]
  }
  return [MAINS.reduce((best, item) => (angleBetween(angle, item[1]) < angleBetween(angle, best[1]) ? item : best))[0]]
}

function wheelTarget(key, x, y, previous, landing) {
  const { cx, cy, radius } = wheelGeometry(key)
  const dx = x - cx
  const dy = y - cy
  const distance = Math.hypot(dx, dy)
  if (distance < radius * WHEEL_HUB) {
    const hub = landing ? true : previous.hub
    const center = unitOf(key, 'center')
    return { keyId: key.id, units: hub && center ? [center.id] : [], hub }
  }
  const held = previous.keyId === key.id ? previous.units.map((id) => id.slice(key.id.length + 1)) : []
  const angle = (Math.atan2(dy, dx) * 180) / Math.PI
  const parts = wheelDirections((angle + 360) % 360, held)
  return { keyId: key.id, units: parts.map((part) => unitOf(key, part)?.id).filter(Boolean), hub: landing ? false : previous.hub }
}

const contains = (key, x, y) => x >= key.x && x < key.x + key.width && y >= key.y && y < key.y + key.height

/**
 * The target under (x, y). `previous` is what this pointer held a moment ago (omit it for a pointer that is landing).
 * Returns { keyId, units, hub }: keyId null and no units between keys.
 */
export function hitTest(layout, x, y, previous) {
  const landing = !previous
  const prev = previous || { keyId: null, units: [], hub: false }
  const steering = !landing && prev.keyId && layout.keys.find((key) => key.id === prev.keyId && key.shape === 'wheel')
  if (steering) {
    const { cx, cy, radius } = wheelGeometry(steering)
    if (Math.hypot(x - cx, y - cy) <= radius * WHEEL_KEEP) return wheelTarget(steering, x, y, prev, false)
  }
  for (const key of layout.keys) {
    if (key.shape === 'wheel') {
      const { cx, cy, radius } = wheelGeometry(key)
      if (Math.hypot(x - cx, y - cy) <= radius) return wheelTarget(key, x, y, prev, landing)
    } else if (contains(key, x, y)) {
      return { keyId: key.id, units: [key.id], hub: landing ? false : prev.hub }
    }
  }
  return { keyId: null, units: [], hub: landing ? false : prev.hub }
}

/** Every unit of a layout by id. */
export function layoutUnits(layout) {
  return new Map(layout.keys.flatMap((key) => keyUnits(key)).map((unit) => [unit.id, unit]))
}
