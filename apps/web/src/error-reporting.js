import { normalizeError, reportError as enqueueError } from './analytics.js'
export { normalizeError } from './analytics.js'

const FRAME_ERROR_EVENT = 'xiaochao:clienterror'

export function reportError(error, context, win = window) {
  try {
    if (error?.name === 'AbortError') return
    const normalized = normalizeError(error, context)
    if (win.parent && win.parent !== win) {
      if (win.parent.location.origin === win.location.origin) {
        win.parent.dispatchEvent(new win.parent.CustomEvent(FRAME_ERROR_EVENT, { detail: normalized }))
      }
    } else enqueueError(normalized, normalized)
  } catch (_) {}
}

export function installErrorReporting(win = window) {
  win.addEventListener('error', (event) => {
    if (event.target && event.target !== win) {
      const target = event.target
      reportError('Resource failed to load', { kind: 'resource', url: target.currentSrc || target.src || target.href }, win)
    } else {
      reportError(event.error ?? event.message, { kind: 'uncaught', url: event.filename, line: event.lineno, column: event.colno }, win)
    }
  }, true)
  win.addEventListener('unhandledrejection', (event) => reportError(event.reason, { kind: 'unhandledrejection' }, win))
  if (!win.parent || win.parent === win) {
    win.addEventListener(FRAME_ERROR_EVENT, (event) => enqueueError(event.detail, event.detail))
  }
}
