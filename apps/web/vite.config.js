import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import legacy from '@vitejs/plugin-legacy'
import UnoCSS from 'unocss/vite'

const apiTarget = `http://127.0.0.1:${process.env.PORT || 8080}`

// 构建产物部署到小潮霸王项目根目录，由 Node 服务直接提供 React PWA 首页。
// 模拟器内核资源在站点根路径，开发时代理到 8080。
const proxyTargets = [
  '/__icon',
  '/__jars',
  '/__52java',
  '/__flash',
  '/ruffle',
  '/flash',
  '/dasong',
  '/jar',
  '/maopao',
  '/compat.html',
  '/java',
  '/style',
  '/config',
  '/bld',
  '/libs',
  '/index.js',
  '/files.js',
  '/touchpad.js',
  '/keypad-canvas.js',
  '/touch-layout.js',
  '/keymap.js',
  '/layout.js',
  '/mrp-runtime.js',
  '/panel.js',
  '/screen.js',
  '/ui-feedback.js',
  '/runtime-extras.js',
  '/runtime/j2me',
  '/debug-graphics.js',
  '/debug-native.js',
  '/btroom.js',
]

export default defineConfig({
  root: '.',
  base: '/',
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
  plugins: [
    react(),
    UnoCSS(),
    legacy({
      targets: [
        'last 2 Chrome versions',
        'last 2 Firefox versions',
        'last 2 Safari versions',
        'last 2 Edge versions',
        'last 2 ChromeAndroid versions',
      ],
      renderLegacyChunks: true,
      polyfills: true,
      modernPolyfills: true,
    }),
  ],
  server: {
    port: 5173,
    proxy: {
      ...Object.fromEntries(proxyTargets.filter((p) => p !== '/dasong').map((p) => [p, apiTarget])),
      '/dasong': {target: 'http://127.0.0.1:8091', changeOrigin: true, rewrite: (path) => path.replace(/^\/dasong/, '')},
    },
  },
})
