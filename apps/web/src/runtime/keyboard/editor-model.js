import { clearExplicitAssignment, clearPerGameOverride, normalizeLayout } from './profiles.js'

const clone = (value) => JSON.parse(JSON.stringify(value))
const finite = (value) => typeof value === 'number' && Number.isFinite(value)

function geometry(control) {
  return [control.x, control.y, control.width, control.height].every(finite)
    && control.width > 0 && control.height > 0
    && control.x >= 0 && control.y >= 0
    && control.x + control.width <= 1 && control.y + control.height <= 1
}

function controlIndex(layout, controlId) {
  const index = layout.controls.findIndex((control) => control.id === controlId)
  if (index < 0) throw new RangeError(`Unknown control: ${controlId}`)
  return index
}

function updateControl(layout, controlId, patch) {
  const next = clone(layout)
  const index = controlIndex(next, controlId)
  const control = { ...next.controls[index], ...patch }
  if (![control.x, control.y, control.width, control.height].every(finite)
    || control.width <= 0 || control.height <= 0) throw new RangeError('Control geometry must be finite and positive')
  next.controls[index] = control
  return next
}

export function generateLayoutName(name = 'Keyboard Layout') {
  const base = String(name).replace(/\s+\(Custom(?: \d+)?\)$/, '')
  return `${base} (Custom)`
}

export function cloneLayoutForEditing(layout, { id, name } = {}) {
  const next = clone(layout)
  next.id = id || `${layout.id}-custom`
  next.name = name || generateLayoutName(layout.name)
  return next
}

export function addControl(layout, control) {
  const next = clone(layout)
  const id = String(control.id || `control-${next.controls.length + 1}`)
  if (next.controls.some((item) => item.id === id)) throw new RangeError(`Duplicate control: ${id}`)
  const item = {
    id, actionId: String(control.actionId || 'custom:control'), label: String(control.label || control.actionId || id),
    visible: control.visible !== false, x: control.x, y: control.y, width: control.width, height: control.height,
    rotation: control.rotation || 0, z: control.z ?? next.controls.length, shape: control.shape || 'rounded-rect',
  }
  if (!geometry(item)) throw new RangeError('Control geometry must be finite, positive, and in stage')
  next.controls.push(item)
  return next
}

export const hideControl = (layout, controlId, hidden = true) => updateControl(layout, controlId, { visible: !hidden })
export const moveControl = (layout, controlId, patch) => updateControl(layout, controlId, { x: patch.x, y: patch.y })
export const resizeControl = (layout, controlId, patch) => updateControl(layout, controlId, { width: patch.width, height: patch.height })
export const reassignAction = (layout, controlId, actionId, label) => updateControl(layout, controlId, { actionId, ...(label == null ? {} : { label }) })
export const reorderControl = (layout, controlId, z) => {
  if (!finite(z)) throw new RangeError('z-order must be finite')
  return updateControl(layout, controlId, { z })
}

export function validateLayout(layout) {
  const errors = []
  for (const control of layout?.controls || []) {
    if (!geometry(control)) errors.push({ type: 'invalid-geometry', controlId: control.id })
  }
  return { valid: errors.length === 0, errors }
}

function intersects(a, b) {
  return a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y
}

function regionWarning(control, region, type) {
  return intersects(control, region) ? { type, controlId: control.id } : null
}

export function getLayoutWarnings(layout, options = {}) {
  const controls = (layout.controls || []).filter((control) => control.visible !== false)
  const warnings = []
  const minWidth = options.minWidth ?? 0.06
  const minHeight = options.minHeight ?? 0.06
  controls.forEach((control, index) => {
    if (control.width < minWidth || control.height < minHeight) warnings.push({ type: 'small-target', controlId: control.id })
    controls.slice(index + 1).forEach((other) => {
      if (intersects(control, other)) warnings.push({ type: 'overlap', controlId: control.id, otherControlId: other.id })
    })
    if (options.emulatorDisplay) {
      const warning = regionWarning(control, options.emulatorDisplay, 'emulator-obstruction')
      if (warning) warnings.push(warning)
    }
    if (options.safeArea) {
      const boundary = { x: 0, y: 0, width: 1, height: 1 }
      if (options.safeArea.x != null && (control.x < options.safeArea.x || control.x + control.width > options.safeArea.x + options.safeArea.width
        || control.y < options.safeArea.y || control.y + control.height > options.safeArea.y + options.safeArea.height)) {
        warnings.push({ type: 'safe-area', controlId: control.id })
      } else if (regionWarning(control, boundary, 'safe-area')) warnings.push(regionWarning(control, options.safeArea, 'safe-area'))
    }
  })
  return warnings
}

export const clearExplicitProfileAssignment = clearExplicitAssignment
export const clearMigratedPerGameOverride = clearPerGameOverride
export { normalizeLayout }
