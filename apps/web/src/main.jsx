import React from 'react'
import { createRoot } from 'react-dom/client'
import App from './App.jsx'
import './styles.css'

function render() {
  createRoot(document.getElementById('root')).render(<App />)
}

// LocalJars is a classic runtime script. Load it before React mounts so the
// lobby can list browser-local JARs without a Vite HTML-script warning.
const localJars = document.createElement('script')
localJars.src = '/config/localjars.js'
localJars.onload = render
localJars.onerror = render
document.head.appendChild(localJars)

// PWA：注册站点根 scope 的 Service Worker（开发端口不注册，避免干扰 vite）
if ('serviceWorker' in navigator && location.port !== '5173') {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {})
  })
}
