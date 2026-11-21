const sharedActionIds = [
  'up', 'down', 'left', 'right', 'ok', 'choice', 'back', 'ret', 'clear',
  ...Array.from({ length: 10 }, (_, digit) => `num${digit}`),
  'star', 'pound',
]

export const J2ME_CODES = Object.freeze({
  up: -1,
  down: -2,
  left: -3,
  right: -4,
  ok: -5,
  choice: -6,
  back: -7,
  ret: -11,
  clear: -8,
  ...Object.fromEntries(Array.from({ length: 10 }, (_, digit) => [`num${digit}`, 48 + digit])),
  star: 42,
  pound: 35,
})

export const MRP_CODES = Object.freeze({
  up: 12,
  down: 13,
  left: 14,
  right: 15,
  ok: 20,
  choice: 17,
  back: 18,
  ret: 16,
  clear: 23,
  ...Object.fromEntries(Array.from({ length: 10 }, (_, digit) => [`num${digit}`, digit])),
  star: 10,
  pound: 11,
})

function freezeRecord(record) {
  if (record.flash) Object.freeze(record.flash)
  if (record.platforms) Object.freeze(record.platforms)
  return Object.freeze(record)
}

const entries = Object.fromEntries(sharedActionIds.map((actionId) => [
  actionId,
  freezeRecord({
    actionId,
    label: actionId,
    platforms: { j2me: true, mrp: true },
  }),
]))

const flashKeys = [
  ...Array.from({ length: 26 }, (_, index) => {
    const letter = String.fromCharCode(65 + index)
    return [`Key${letter}`, letter.toLowerCase()]
  }),
  ...Array.from({ length: 10 }, (_, digit) => [`Digit${digit}`, String(digit)]),
  ['Space', ' '],
  ['ArrowUp', 'ArrowUp'],
  ['ArrowDown', 'ArrowDown'],
  ['ArrowLeft', 'ArrowLeft'],
  ['ArrowRight', 'ArrowRight'],
  ['Enter', 'Enter'],
  ['Backspace', 'Backspace'],
  ['Tab', 'Tab'],
  ['Escape', 'Escape'],
  ['Delete', 'Delete'],
  ...Array.from({ length: 12 }, (_, index) => [`F${index + 1}`, `F${index + 1}`]),
  ['ShiftLeft', 'Shift'],
  ['ControlLeft', 'Control'],
  ['AltLeft', 'Alt'],
  ['Minus', '-'],
  ['Equal', '='],
  ['BracketLeft', '['],
  ['BracketRight', ']'],
  ['Backslash', '\\'],
  ['Semicolon', ';'],
  ['Quote', "'"],
  ['Comma', ','],
  ['Period', '.'],
  ['Slash', '/'],
  ['Backquote', '`'],
]

export const FLASH_KEY_CATALOG = Object.freeze(Object.fromEntries(flashKeys.map(([code, key]) => {
  const actionId = `flash:${code}`
  const payload = Object.freeze({ actionId, key, code, runtime: 'flash' })
  entries[actionId] = freezeRecord({
    actionId,
    label: key === ' ' ? 'Space' : key,
    flash: { key, code },
    platforms: { flash: true },
  })
  return [actionId, payload]
})))

export const ACTION_CATALOG = Object.freeze(entries)
export const ACTION_IDS = Object.freeze(Object.keys(ACTION_CATALOG))
export const ACTIONS = ACTION_CATALOG

const aliases = Object.freeze({
  confirm: 'ok',
  'soft-left': 'choice',
  'soft-right': 'back',
})

function runtimeAlias(id, source) {
  if (source === 'touchLayout' || source === 'touch-layout') {
    if (id === 'back') return 'back'
  }
  if (source === 'config.keymap' || source === 'config.keymap.back') {
    if (id === 'back') return 'ret'
  }
  if (source === 'InputMapping.keyboard' && id === 'Escape') return 'Escape'
  const digit = /^digit-([0-9])$/.exec(id)
  if (digit) return `num${digit[1]}`
  return aliases[id] || id
}

export function migrateActionId(actionId, source = 'action') {
  if (typeof actionId !== 'string') return actionId
  return runtimeAlias(actionId, source)
}

export function isActionSupported(actionId, runtime, catalog = ACTION_CATALOG) {
  const action = catalog?.[actionId]
  return Boolean(action?.platforms?.[runtime])
}

export function createCustomFlashAction(stableId, key, code) {
  if (typeof stableId !== 'string' || !stableId.trim()) {
    throw new TypeError('A custom Flash action requires a stable ID')
  }
  if (typeof key !== 'string' || typeof code !== 'string' || !key || !code) {
    throw new TypeError('A custom Flash action requires both key and code values')
  }
  const actionId = `custom:${stableId}`
  return freezeRecord({
    actionId,
    label: stableId,
    flash: { key, code },
    platforms: { flash: true },
  })
}

export function migratePhysicalBinding(binding) {
  const control = binding?.control
  const actionId = migrateActionId(binding?.actionId, 'physical')
  if (typeof control !== 'string' || !control || !isActionSupported(actionId, 'j2me') &&
    !isActionSupported(actionId, 'mrp') && !isActionSupported(actionId, 'flash') &&
    !binding?.catalog?.[actionId]) {
    return { control, actionId: null, active: false }
  }
  return { control, actionId, active: true }
}
