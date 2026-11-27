import React from 'react'
import { ConfigProvider } from 'antd-mobile'
import zhCN from 'antd-mobile/es/locales/zh-CN'
import { createRoot } from 'react-dom/client'
import { RouterProvider } from 'react-router-dom'
import '@unocss/reset/tailwind.css'
import 'virtual:uno.css'
import './mobile-ui.css'
import { isRuntimeFrame } from './App.jsx'
import { createApplicationRouter } from './router.jsx'
import { installSelectionGuard } from './selection-guard.js'
import { installOrientationController } from './orientation.js'
import { installAnalytics } from './analytics.js'
import { installErrorReporting } from './error-reporting.js'

installSelectionGuard()
const runtimeFrame = isRuntimeFrame()
// VITE_ANALYTICS_URL: a full URL reports there; 'off' turns reporting off. Unset or empty (a CI variable that was never
// set) reports to this site's own /collect, except in the APK, which has no server of its own and needs a full URL.
const configuredEndpoint = import.meta.env.VITE_ANALYTICS_URL || ''
const endpoint = configuredEndpoint === 'off' ? '' : configuredEndpoint || (new URLSearchParams(location.search).get('host') === 'rn' ? '' : '/collect')
if (!runtimeFrame) installAnalytics(endpoint)
installErrorReporting()
// The J2ME / MRP frame turns itself (its own #root) and reaches the app host through the parent's bridge.
installOrientationController()
const router = createApplicationRouter(runtimeFrame)

function render() {
  createRoot(document.getElementById('root')).render(<ConfigProvider locale={zhCN}><RouterProvider router={router} /></ConfigProvider>)
}

async function clearLegacyBrowserState() {
  if (!('serviceWorker' in navigator)) return
  const registrations = await navigator.serviceWorker.getRegistrations()
  await Promise.all(registrations.map(registration => registration.unregister()))
  if ('caches' in window) {
    const keys = await caches.keys()
    await Promise.all(keys.map(key => caches.delete(key)))
  }
}

// LocalJars is a classic runtime script. Load it before React mounts so the
// lobby can list browser-local JARs without a Vite HTML-script warning.
const localJars = document.createElement('script')
localJars.src = '/config/localjars.js'
localJars.onload = render
localJars.onerror = render
document.head.appendChild(localJars)

// 清理旧版本缓存，避免旧的 /app 页面或过期运行时继续被浏览器提供。
if (!runtimeFrame && 'serviceWorker' in navigator && location.port !== '5173') {
  clearLegacyBrowserState().catch(() => {})
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {})
  })
}
