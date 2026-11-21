const SHAPES = new Set(['rect', 'rounded-rect', 'circle', 'dpad-segment'])
const RUNTIMES = new Set(['flash', 'j2me', 'mrp'])
const ORIENTATIONS = new Set(['portrait', 'landscape'])

function deepFreeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value)
    Object.values(value).forEach(deepFreeze)
  }
  return value
}

function control(id, actionId, label, x, y, width, height, shape = 'rounded-rect', extra = {}) {
  return {
    id, actionId, label, visible: true, x, y, width, height, rotation: 0,
    z: 0, shape, ...extra,
  }
}

const qwertyCodes = [
  ...'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('').map((letter) => [`Key${letter}`, letter.toLowerCase()]),
  ...'0123456789'.split('').map((digit) => [`Digit${digit}`, digit]),
  ...[
    ['Minus', '-'], ['Equal', '='], ['BracketLeft', '['], ['BracketRight', ']'],
    ['Backslash', '\\'], ['Semicolon', ';'], ['Quote', "'"], ['Comma', ','],
    ['Period', '.'], ['Slash', '/'], ['Backquote', '`'],
  ],
  ...[['ArrowUp', '↑'], ['ArrowDown', '↓'], ['ArrowLeft', '←'], ['ArrowRight', '→']],
  ...[['Space', 'Space'], ['Enter', 'Enter'], ['Backspace', 'Backspace'], ['Tab', 'Tab'],
    ['Escape', 'Escape'], ['ShiftLeft', 'Shift'], ['ControlLeft', 'Ctrl'], ['AltLeft', 'Alt']],
  ...Array.from({ length: 12 }, (_, index) => [`F${index + 1}`, `F${index + 1}`]),
  ['Delete', 'Delete'],
]

const qwertyControls = qwertyCodes.map(([code, label], index) => {
  const columns = 12
  const row = Math.floor(index / columns)
  const column = index % columns
  const width = code === 'Space' ? 0.24 : code.endsWith('Left') ? 0.09 : 0.065
  const x = Math.min(0.96 - width, 0.02 + column * 0.081)
  return control(`flash-${code}`, `flash-key:${code}`, label, x, 0.08 + row * 0.14, width, 0.105, 'rounded-rect', { z: index })
})

const dpadControls = [
  control('up', 'up', '↑', 0.12, 0.67, 0.12, 0.1, 'dpad-segment'),
  control('right', 'right', '→', 0.24, 0.77, 0.12, 0.1, 'dpad-segment'),
  control('down', 'down', '↓', 0.12, 0.87, 0.12, 0.1, 'dpad-segment'),
  control('left', 'left', '←', 0, 0.77, 0.12, 0.1, 'dpad-segment'),
]
const numericControls = [
  ...['1', '2', '3', '4', '5', '6', '7', '8', '9', 'star', '0', 'pound'].map((key, index) => {
    const column = index % 3
    const row = Math.floor(index / 3)
    const label = key === 'star' ? '*' : key === 'pound' ? '#' : key
    const actionId = key === 'star' || key === 'pound' ? key : `num${key}`
    return control(`key-${key}`, actionId, label, 0.66 + column * 0.11, 0.58 + row * 0.105, 0.095, 0.09)
  }),
  control('ok', 'ok', 'OK', 0.39, 0.77, 0.12, 0.1),
  control('choice', 'choice', 'Soft 1', 0.52, 0.77, 0.12, 0.1),
  control('back', 'back', 'Soft 2', 0.65, 0.77, 0.12, 0.1),
  control('ret', 'ret', 'Back', 0.78, 0.77, 0.12, 0.1),
  control('clear', 'clear', 'Clear', 0.52, 0.88, 0.12, 0.1),
]

const BUILTIN_LAYOUTS = deepFreeze({
  'qwerty-72': {
    id: 'qwerty-72', schemaVersion: 1, name: 'Game QWERTY 72',
    target: { runtime: 'flash', orientation: 'any' }, controls: qwertyControls,
  },
  'landscape-split': {
    id: 'landscape-split', schemaVersion: 1, name: 'Landscape Split',
    target: { runtime: 'j2me', orientation: 'landscape' },
    controls: [
      ...dpadControls.map((item) => ({ ...item, x: item.x * 0.8 })),
      ...numericControls.map((item) => ({ ...item, x: 0.58 + (item.x - 0.58) * 0.9 })),
    ],
  },
  'portrait-dpad': {
    id: 'portrait-dpad', schemaVersion: 1, name: 'Portrait D-pad',
    target: { runtime: 'j2me', orientation: 'portrait' },
    controls: [...dpadControls, ...numericControls],
  },
})

const BUILTIN_THEMES = deepFreeze({
  classic: { id: 'classic', schemaVersion: 1, tokens: { background: '#20262e', keyFill: '#39434f', text: '#ffffff', border: '#8793a1', pressed: '#38a169', focused: '#f6c344' } },
  'high-contrast': { id: 'high-contrast', schemaVersion: 1, tokens: { background: '#000000', keyFill: '#111111', text: '#ffffff', border: '#ffffff', pressed: '#ffde00', focused: '#00e5ff' } },
  light: { id: 'light', schemaVersion: 1, tokens: { background: '#edf1f4', keyFill: '#ffffff', text: '#18212b', border: '#56616d', pressed: '#a7e2bf', focused: '#c84d13' } },
})

const DEFAULT_PROFILES = deepFreeze({
  flash: {
    portrait: { layoutId: 'qwerty-72', themeId: 'classic' },
    landscape: { layoutId: 'qwerty-72', themeId: 'classic' },
  },
  j2me: {
    portrait: { layoutId: 'portrait-dpad', themeId: 'classic' },
    landscape: { layoutId: 'landscape-split', themeId: 'classic' },
  },
  mrp: {
    portrait: { layoutId: 'portrait-dpad', themeId: 'classic' },
    landscape: { layoutId: 'landscape-split', themeId: 'classic' },
  },
})

export function normalizeLayout(record) {
  if (!record || typeof record !== 'object' || Array.isArray(record)) throw new TypeError('Layout must be an object')
  if (typeof record.id !== 'string' || !record.id || record.schemaVersion !== 1) throw new TypeError('Unsupported layout identity or version')
  if (typeof record.name !== 'string' || !record.name) throw new TypeError('Layout name is required')
  const target = record.target && typeof record.target === 'object' ? { ...record.target } : {}
  if (target.runtime != null && !RUNTIMES.has(target.runtime)) throw new TypeError('Unsupported layout runtime')
  if (target.orientation != null && target.orientation !== 'any' && !ORIENTATIONS.has(target.orientation)) throw new TypeError('Unsupported layout orientation')
  if (!Array.isArray(record.controls)) throw new TypeError('Layout controls must be an array')
  const ids = new Set()
  const controls = record.controls.map((item) => {
    if (!item || typeof item !== 'object' || typeof item.id !== 'string' || !item.id || ids.has(item.id)) throw new TypeError('Control IDs must be unique')
    ids.add(item.id)
    if (typeof item.actionId !== 'string' || !item.actionId) throw new TypeError('Control actionId is required')
    if (!SHAPES.has(item.shape)) throw new TypeError('Unsupported control shape')
    const x = Number(item.x), y = Number(item.y), width = Number(item.width), height = Number(item.height)
    const rotation = Number(item.rotation ?? 0), z = Number(item.z ?? item.zOrder ?? 0)
    if (![x, y, width, height, rotation, z].every(Number.isFinite) || width <= 0 || height <= 0 || x < 0 || y < 0 || x + width > 1 || y + height > 1) {
      throw new TypeError('Control geometry must be finite, positive, and within normalized stage bounds')
    }
    return {
      ...item, id: item.id, actionId: item.actionId, label: String(item.label ?? item.actionId),
      visible: item.visible !== false, x, y, width, height, rotation, z,
    }
  })
  return { ...record, target, controls }
}

export function validateKeyboardConfig(config) {
  if (!config || typeof config !== 'object' || config.schemaVersion !== 1) throw new TypeError('Unsupported keyboard config version')
  if (!config.customLayouts || typeof config.customLayouts !== 'object' || Array.isArray(config.customLayouts)) throw new TypeError('customLayouts must be an object')
  Object.entries(config.customLayouts).forEach(([id, layout]) => {
    const normalized = normalizeLayout(layout)
    if (normalized.id !== id || Object.hasOwn(BUILTIN_LAYOUTS, id)) throw new TypeError('Custom layout key does not match its ID')
  })
  if (!config.profileAssignments || typeof config.profileAssignments !== 'object' || Array.isArray(config.profileAssignments)) throw new TypeError('profileAssignments must be an object')
  for (const [key, assignment] of Object.entries(config.profileAssignments)) {
    if (!/^(flash|j2me|mrp):(portrait|landscape)$/.test(key) || !assignment || typeof assignment.layoutId !== 'string' || !Object.hasOwn(BUILTIN_THEMES, assignment.themeId) && typeof assignment.themeId !== 'string') throw new TypeError('Invalid profile assignment')
  }
  for (const field of ['perGameOverrides']) {
    if (!config[field] || typeof config[field] !== 'object' || Array.isArray(config[field])) throw new TypeError(`${field} must be an object`)
  }
  if (!Array.isArray(config.migrationBackups)) throw new TypeError('migrationBackups must be an array')
  return true
}

function clone(value) {
  return JSON.parse(JSON.stringify(value))
}

export function resolveProfile(config = {}, { runtime, orientation, gameId } = {}) {
  const validRuntime = RUNTIMES.has(runtime) ? runtime : 'j2me'
  const validOrientation = ORIENTATIONS.has(orientation) ? orientation : 'portrait'
  const key = `${validRuntime}:${validOrientation}`
  const explicit = config.profileAssignments?.[key]
  const legacy = gameId != null ? config.perGameOverrides?.[gameId]?.[validRuntime] : null
  const chosen = explicit || legacy || DEFAULT_PROFILES[validRuntime][validOrientation]
  const layoutId = chosen?.layoutId
  const themeId = chosen?.themeId || DEFAULT_PROFILES[validRuntime][validOrientation].themeId
  const layouts = { ...BUILTIN_LAYOUTS, ...(config.customLayouts || {}) }
  const layout = layouts[layoutId] || BUILTIN_LAYOUTS[DEFAULT_PROFILES[validRuntime][validOrientation].layoutId]
  const theme = BUILTIN_THEMES[themeId] || BUILTIN_THEMES.classic
  return { runtime: validRuntime, orientation: validOrientation, layoutId: layout.id, themeId: theme.id, layout, theme, source: explicit ? 'explicit' : legacy ? 'per-game' : 'default' }
}

export function clearExplicitAssignment(config, runtime, orientation) {
  const next = clone(config)
  delete next.profileAssignments?.[`${runtime}:${orientation}`]
  return next
}

export function clearPerGameOverride(config, gameId, runtime) {
  const next = clone(config)
  if (next.perGameOverrides?.[gameId]) {
    delete next.perGameOverrides[gameId][runtime]
    if (Object.keys(next.perGameOverrides[gameId]).length === 0) delete next.perGameOverrides[gameId]
  }
  return next
}

export { BUILTIN_LAYOUTS, BUILTIN_THEMES, DEFAULT_PROFILES }
