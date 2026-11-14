export const BRIDGE_VERSION = 1 as const

export type HostMessage = {
  version: typeof BRIDGE_VERSION
  id?: string
  type: string
  payload?: unknown
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
    if (!window.ReactNativeWebView) return;
    window.ReactNativeWebView.postMessage(JSON.stringify({ version: version, type: type, payload: payload }));
  }
  window.__XIAOCHAO_NATIVE_BACK__ = function () {
    var isGame = /^#\\/play\\//.test(window.location.hash);
    send('navigation.back', { handled: isGame });
    if (isGame) window.history.back();
    return isGame;
  };
  window.__XIAOCHAO_RN_HOST__ = { version: version, send: send };
  send('app.ready', { url: window.location.href });
})();
true;
`
