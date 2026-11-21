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
  const actionCatalog = { ...catalog }

  const releaseAll = () => {
    for (const actionId of counts.keys()) {
      const payload = actionCatalog[actionId]?.flash
      if (payload) dispatch(target, 'keyup', payload)
    }
    sources.clear()
    counts.clear()
  }

  const press = (sourceId, actionId) => {
    if (!target || sources.has(sourceId)) return false
    const payload = actionCatalog[actionId]?.flash
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
      dispatch(target, 'keyup', actionCatalog[actionId].flash)
    }
    return true
  }
  const releasePointer = (pointerId) => {
    const prefix = `pointer:${pointerId}:`
    const matches = Array.from(sources.keys()).filter((sourceId) => sourceId.startsWith(prefix))
    const fallback = matches.length ? matches : sources.size === 1
      ? Array.from(sources.keys()).filter((sourceId) => sourceId.startsWith('pointer:'))
      : []
    fallback.forEach(release)
  }

  const onBlur = () => releaseAll()
  const onPointerEnd = (event) => releasePointer(event.pointerId)
  const onVisibility = () => { if (eventTarget.document?.hidden) releaseAll() }
  const onFullscreen = () => releaseAll()
  eventTarget.addEventListener?.('blur', onBlur)
  eventTarget.addEventListener?.('pointerup', onPointerEnd, true)
  eventTarget.addEventListener?.('pointercancel', onPointerEnd, true)
  eventTarget.document?.addEventListener?.('visibilitychange', onVisibility)
  eventTarget.document?.addEventListener?.('fullscreenchange', onFullscreen)
  eventTarget.document?.addEventListener?.('webkitfullscreenchange', onFullscreen)

  return {
    registerAction(action) {
      if (!action || typeof action.actionId !== 'string' || !action.actionId.startsWith('custom:') ||
        typeof action.flash?.key !== 'string' || typeof action.flash?.code !== 'string') return false
      actionCatalog[action.actionId] = action
      return true
    },
    press,
    release,
    releasePointer,
    releaseAll,
    get heldSources() { return sources.size },
    get heldActions() { return counts.size },
    cleanup() {
      releaseAll()
      eventTarget.removeEventListener?.('blur', onBlur)
      eventTarget.removeEventListener?.('pointerup', onPointerEnd, true)
      eventTarget.removeEventListener?.('pointercancel', onPointerEnd, true)
      eventTarget.document?.removeEventListener?.('visibilitychange', onVisibility)
      eventTarget.document?.removeEventListener?.('fullscreenchange', onFullscreen)
      eventTarget.document?.removeEventListener?.('webkitfullscreenchange', onFullscreen)
    },
  }
}
