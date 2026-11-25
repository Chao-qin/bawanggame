// One way for the page to reach the online stores (52java, Flash 保存计划):
//   - a browser served by the Node server requests its relative /__52java/* and /__flash/* paths;
//   - an app package built with MOBILE_52JAVA_API_BASE requests that remote server instead;
//   - otherwise the installed app's host answers the same paths natively (apps/mobile/src/host/onlineProxy.ts).
const remoteBase = String(import.meta.env.VITE_52JAVA_API_BASE || '').replace(/\/+$/, '')
const HOST_TIMEOUT_MS = 120_000

export function isEmbeddedHost() {
  return new URLSearchParams(window.location.search).get('host') === 'rn'
}

function nativeHost() {
  const host = window.__XIAOCHAO_RN_HOST__
  return host && typeof host.request === 'function' && Array.isArray(host.capabilities) && host.capabilities.includes('online.fetch') ? host : null
}

/** 'server' (HTTP to a Node proxy), 'host' (the app answers natively) or 'offline' (neither is available). */
export function onlineMode() {
  if (!isEmbeddedHost() || remoteBase) return 'server'
  return nativeHost() ? 'host' : 'offline'
}

export function onlineAvailable() {
  return onlineMode() !== 'offline'
}

function serverUrl(path) {
  return isEmbeddedHost() && remoteBase ? remoteBase + path : path
}

/** Requests an online store path and resolves with a standard Response, whichever side answers it. */
export async function onlineFetch(path) {
  const mode = onlineMode()
  if (mode === 'server') return fetch(serverUrl(path))
  if (mode === 'offline') throw new Error('当前环境无法访问在线商城')
  let result
  try {
    result = await nativeHost().request('online.fetch', { path }, HOST_TIMEOUT_MS)
  } catch (cause) {
    throw new Error(cause?.message === 'host_timeout' ? '请求超时' : '安装包服务不可用')
  }
  const status = Number(result?.status) || 502
  // A download is saved into the app's static root; read it back from the local server.
  if (status === 200 && typeof result.file === 'string') return fetch(result.file)
  return new Response(JSON.stringify(result?.body ?? null), { status, headers: { 'Content-Type': 'application/json' } })
}

/** A stable address that identifies an online game across launches (the app's local port changes every start). */
export function onlineSourceUrl(path) {
  if (onlineMode() === 'host') return new URL(path, 'https://app.xiaochao.invalid').href
  return new URL(serverUrl(path), window.location.href).href
}
