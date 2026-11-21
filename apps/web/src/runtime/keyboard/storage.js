import { BUILTIN_LAYOUTS, validateKeyboardConfig } from './profiles.js'

export const STORAGE_KEY = 'xiaochao.keyboard.v1'

export function createEmptyKeyboardConfig() {
  return {
    schemaVersion: 1,
    customLayouts: {},
    profileAssignments: {},
    perGameOverrides: {},
    migrationBackups: [],
  }
}

function clone(value) {
  return JSON.parse(JSON.stringify(value))
}

function storageOrDefault(storage) {
  if (storage) return storage
  try { return globalThis.localStorage } catch { return null }
}

function backup(config, record, reason, path) {
  config.migrationBackups.push({ source: 'xiaochao.keyboard.v1', path, reason, record: clone(record) })
}

function sanitizeEnvelope(parsed) {
  if (!parsed || parsed.schemaVersion !== 1 || typeof parsed !== 'object' || Array.isArray(parsed)) {
    const fresh = createEmptyKeyboardConfig()
    backup(fresh, parsed, 'unsupported-or-malformed-envelope', '$')
    return fresh
  }
  const config = {
    ...createEmptyKeyboardConfig(),
    ...parsed,
    customLayouts: parsed.customLayouts && typeof parsed.customLayouts === 'object' && !Array.isArray(parsed.customLayouts) ? { ...parsed.customLayouts } : {},
    profileAssignments: parsed.profileAssignments && typeof parsed.profileAssignments === 'object' && !Array.isArray(parsed.profileAssignments) ? { ...parsed.profileAssignments } : {},
    perGameOverrides: parsed.perGameOverrides && typeof parsed.perGameOverrides === 'object' && !Array.isArray(parsed.perGameOverrides) ? { ...parsed.perGameOverrides } : {},
    migrationBackups: Array.isArray(parsed.migrationBackups) ? [...parsed.migrationBackups] : [],
  }
  for (const [id, record] of Object.entries(config.customLayouts)) {
    try {
      const candidate = { ...config, customLayouts: { [id]: record }, profileAssignments: {}, perGameOverrides: {} }
      validateKeyboardConfig(candidate)
    } catch (error) {
      delete config.customLayouts[id]
      backup(config, record, error.message, `customLayouts.${id}`)
    }
  }
  const assignments = { ...config.profileAssignments }
  for (const [key, assignment] of Object.entries(assignments)) {
    try {
      validateKeyboardConfig({ ...config, profileAssignments: { [key]: assignment } })
    } catch (error) {
      delete config.profileAssignments[key]
      backup(config, assignment, error.message, `profileAssignments.${key}`)
    }
  }
  for (const [gameId, runtimes] of Object.entries(config.perGameOverrides)) {
    if (!runtimes || typeof runtimes !== 'object' || Array.isArray(runtimes)) {
      delete config.perGameOverrides[gameId]
      backup(config, runtimes, 'invalid-per-game-overrides', `perGameOverrides.${gameId}`)
      continue
    }
    for (const [runtime, override] of Object.entries(runtimes)) {
      if (!['flash', 'j2me', 'mrp'].includes(runtime) || !override || typeof override.layoutId !== 'string' || !override.controlOverrides || typeof override.controlOverrides !== 'object') {
        delete runtimes[runtime]
        backup(config, override, 'invalid-per-game-override', `perGameOverrides.${gameId}.${runtime}`)
      }
    }
    if (!Object.keys(runtimes).length) delete config.perGameOverrides[gameId]
  }
  try { validateKeyboardConfig(config) } catch (error) {
    backup(config, config.profileAssignments, error.message, 'profileAssignments')
    config.profileAssignments = {}
  }
  return config
}

export function loadKeyboardConfig(storage) {
  const target = storageOrDefault(storage)
  if (!target) return createEmptyKeyboardConfig()
  let raw
  try { raw = target.getItem(STORAGE_KEY) } catch { return createEmptyKeyboardConfig() }
  if (raw == null) return createEmptyKeyboardConfig()
  try {
    const result = sanitizeEnvelope(JSON.parse(raw))
    return result
  } catch {
    const fresh = createEmptyKeyboardConfig()
    backup(fresh, raw, 'invalid-json-envelope', '$')
    return fresh
  }
}

export function saveKeyboardConfig(next, storage) {
  const target = storageOrDefault(storage)
  if (!target) return false
  try {
    validateKeyboardConfig(next)
    const serialized = JSON.stringify(next)
    if (typeof serialized !== 'string') return false
    target.setItem(STORAGE_KEY, serialized)
    return true
  } catch {
    return false
  }
}

export function updateKeyboardConfig(mutator, storage) {
  if (typeof mutator !== 'function') return false
  const target = storageOrDefault(storage)
  if (!target) return false
  const current = loadKeyboardConfig(target)
  const next = clone(current)
  try {
    const result = mutator(next) || next
    return saveKeyboardConfig(result, target)
  } catch {
    return false
  }
}

export function createKeyboardProfileStorage(storage) {
  return {
    load: () => loadKeyboardConfig(storage),
    save: (next) => saveKeyboardConfig(next, storage),
    update: (mutator) => updateKeyboardConfig(mutator, storage),
    builtins: BUILTIN_LAYOUTS,
  }
}
