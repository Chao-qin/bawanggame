import { ACTION_CATALOG } from './actions.js'

function dispatch(target, type, payload) {
  const EventConstructor = globalThis.KeyboardEvent
  const event = EventConstructor ? new EventConstructor(type, {
    key: payload.key,
    code: payload.code,
    bubbles: true,
    cancelable: true,
  }) : { type, key: payload.key, code: payload.code, bubbles: true, cancelable: true }
  target.dispatchEvent(event)
}

export function createFlashKeyboardAdapter({ target, catalog = ACTION_CATALOG, eventTarget = globalThis } = {}) {
  const sources = new Map()
  const counts = new Map()

  const releaseAll = () => {
    for (const actionId of counts.keys()) {
      const payload = catalog[actionId]?.flash
      if (payload) dispatch(target, 'keyup', payload)
    }
    sources.clear()
    counts.clear()
  }

  const press = (sourceId, actionId) => {
    if (!target || sources.has(sourceId)) return false
    const payload = catalog[actionId]?.flash
    if (!payload) return false
    sources.set(sourceId, actionId)
    const count = counts.get(actionId) || 0
    counts.set(actionId, count + 1)
    if (count === 0) dispatch(target, 'keydown', payload)
    return true
  }

  const release = (sourceId) => {
    const actionId = sources.get(sourceId)
    if (!actionId) return false
    sources.delete(sourceId)
    const count = (counts.get(actionId) || 1) - 1
    if (count > 0) counts.set(actionId, count)
    else {
      counts.delete(actionId)
      dispatch(target, 'keyup', catalog[actionId].flash)
    }
    return true
  }

  const onBlur = () => releaseAll()
  const onVisibility = () => { if (eventTarget.document?.hidden) releaseAll() }
  const onFullscreen = () => releaseAll()
  eventTarget.addEventListener?.('blur', onBlur)
  eventTarget.document?.addEventListener?.('visibilitychange', onVisibility)
  eventTarget.document?.addEventListener?.('fullscreenchange', onFullscreen)
  eventTarget.document?.addEventListener?.('webkitfullscreenchange', onFullscreen)

  return {
    press,
    release,
    releaseAll,
    get heldSources() { return sources.size },
    get heldActions() { return counts.size },
    cleanup() {
      releaseAll()
      eventTarget.removeEventListener?.('blur', onBlur)
      eventTarget.document?.removeEventListener?.('visibilitychange', onVisibility)
      eventTarget.document?.removeEventListener?.('fullscreenchange', onFullscreen)
      eventTarget.document?.removeEventListener?.('webkitfullscreenchange', onFullscreen)
    },
  }
}
