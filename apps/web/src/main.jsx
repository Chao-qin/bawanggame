import React from 'react'
import { createRoot } from 'react-dom/client'
import App from './App.jsx'
import './styles.css'

createRoot(document.getElementById('root')).render(<App />)

// PWA：注册站点根 scope 的 Service Worker（开发端口不注册，避免干扰 vite）
if ('serviceWorker' in navigator && location.port !== '5173') {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {})
  })
}
