import React from 'react'
import { ConfigProvider } from 'antd-mobile'
import zhCN from 'antd-mobile/es/locales/zh-CN'
import { createRoot } from 'react-dom/client'
import '@unocss/reset/tailwind.css'
import 'virtual:uno.css'
import './mobile-ui.css'
import App from './App.jsx'

function render() {
  createRoot(document.getElementById('root')).render(<ConfigProvider locale={zhCN}><App /></ConfigProvider>)
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
if ('serviceWorker' in navigator && location.port !== '5173') {
  clearLegacyBrowserState().catch(() => {})
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {})
  })
}
