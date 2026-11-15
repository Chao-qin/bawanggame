export const BRIDGE_VERSION = 1 as const

export type HostMessage = {
  version: typeof BRIDGE_VERSION
  id?: string
  type: string
  payload?: unknown
}

export type HapticPayload = {
  duration: number
}

export function parseHostMessage(raw: string): HostMessage | null {
  try {
    const value = JSON.parse(raw) as Partial<HostMessage>
    if (value.version !== BRIDGE_VERSION || typeof value.type !== 'string') return null
    return value as HostMessage
  } catch {
    return null
  }
}

export function encodeHostMessage(type: string, payload?: unknown, id?: string): string {
  return JSON.stringify({ version: BRIDGE_VERSION, ...(id ? { id } : {}), type, ...(payload === undefined ? {} : { payload }) })
}

export const injectedBridge = `
(function () {
  var version = ${BRIDGE_VERSION};
  function send(type, payload) {
    if (!window.ReactNativeWebView || typeof window.ReactNativeWebView.postMessage !== 'function') return false;
    try {
      window.ReactNativeWebView.postMessage(JSON.stringify({ version: version, type: type, payload: payload }));
      return true;
    } catch (_) {
      return false;
    }
  }
  window.__XIAOCHAO_NATIVE_BACK__ = function () {
    var isGame = /^#\\/play\\//.test(window.location.hash);
    send('navigation.back', { handled: isGame });
    if (isGame && typeof window.__XIAOCHAO_NATIVE_BACK_REQUEST__ === 'function') {
      window.__XIAOCHAO_NATIVE_BACK_REQUEST__();
    }
    return isGame;
  };
  function haptic(duration) {
    if (typeof duration !== 'number' || !isFinite(duration) || duration <= 0) return false;
    return send('haptic', { duration: Math.round(duration) });
  }
  function setInsets(payload) {
    if (!payload || payload.version !== 1) return false;
    var insets = {
      version: 1,
      top: Math.max(0, Number(payload.top) || 0),
      right: Math.max(0, Number(payload.right) || 0),
      bottom: Math.max(0, Number(payload.bottom) || 0),
      left: Math.max(0, Number(payload.left) || 0)
    };
    window.__XIAOCHAO_RESPONSIVE_INSETS__ = insets;
    window.__XIAOCHAO_RESPONSIVE_HOST__ = window.__XIAOCHAO_RESPONSIVE_HOST__ || {};
    window.__XIAOCHAO_RESPONSIVE_HOST__.version = 1;
    window.__XIAOCHAO_RESPONSIVE_HOST__.insets = insets;
    if (typeof window.__XIAOCHAO_RESPONSIVE_HOST__.setInsets === 'function') {
      window.__XIAOCHAO_RESPONSIVE_HOST__.setInsets(insets);
    }
    window.dispatchEvent(new CustomEvent('xiaochao:hostinsets', { detail: insets }));
    return true;
  }
  window.__XIAOCHAO_RN_HOST__ = { version: version, send: send, setInsets: setInsets, haptic: haptic };
  send('app.ready', { url: window.location.href });
})();
true;
`
