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

/** Host features the page may rely on; the page checks them before using a request type. The app announces only
 *  those it can serve on this device (hostCapabilities in App.tsx). */
export type HostCapability = 'online.fetch' | 'orientation.lock'

/** Script that settles the page's pending `request(type, payload)` with `result`. */
export function resolveRequestScript(id: string, result: unknown): string {
  return `window.__XIAOCHAO_RN_HOST__ && window.__XIAOCHAO_RN_HOST__.resolve(${JSON.stringify(id)}, ${JSON.stringify(result)}); true;`
}

/** Who the page runs on, for its usage statistics: the app's anonymous device id (deviceId.ts) and Platform.OS. */
export type HostIdentity = { deviceId: string | null; platform: string | null }

export const injectedBridge = (capabilities: readonly HostCapability[], identity: HostIdentity = { deviceId: null, platform: null }) => `
(function () {
  var version = ${BRIDGE_VERSION};
  var pending = {};
  var nextId = 0;
  function post(message) {
    if (!window.ReactNativeWebView || typeof window.ReactNativeWebView.postMessage !== 'function') return false;
    try {
      window.ReactNativeWebView.postMessage(JSON.stringify(message));
      return true;
    } catch (_) {
      return false;
    }
  }
  function send(type, payload) {
    return post({ version: version, type: type, payload: payload });
  }
  // A request the host answers later through resolve(id, result); unanswered after timeoutMs it fails and is dropped.
  function request(type, payload, timeoutMs) {
    return new Promise(function (resolve, reject) {
      var id = 'q' + (++nextId);
      var timer = 0;
      pending[id] = function (result) {
        if (timer) clearTimeout(timer);
        resolve(result);
      };
      if (!post({ version: version, id: id, type: type, payload: payload })) {
        delete pending[id];
        reject(new Error('host_unavailable'));
        return;
      }
      if (timeoutMs > 0) timer = setTimeout(function () {
        if (!pending[id]) return;
        delete pending[id];
        reject(new Error('host_timeout'));
      }, timeoutMs);
    });
  }
  function resolveRequest(id, result) {
    var done = pending[id];
    if (!done) return false;
    delete pending[id];
    done(result);
    return true;
  }
  window.__XIAOCHAO_NATIVE_BACK__ = function () {
    // A page of the app (e.g. 「键盘」) can take the back key and return to the lobby itself.
    if (typeof window.__XIAOCHAO_NATIVE_BACK_OVERRIDE__ === 'function' && window.__XIAOCHAO_NATIVE_BACK_OVERRIDE__()) {
      send('navigation.back', { handled: true });
      return true;
    }
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
  window.__XIAOCHAO_RN_HOST__ = {
    version: version,
    capabilities: ${JSON.stringify(capabilities)},
    deviceId: ${JSON.stringify(identity.deviceId)},
    platform: ${JSON.stringify(identity.platform)},
    send: send,
    request: request,
    resolve: resolveRequest,
    setInsets: setInsets,
    haptic: haptic
  };
  send('app.ready', { url: window.location.href, userAgent: window.navigator ? window.navigator.userAgent : '' });
})();
true;
`
