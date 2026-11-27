import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const mobileRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const webRoot = path.join(mobileRoot, 'web')

const requiredFiles = [
  'index.html',
  'mobile-resource-version',
  'sw.js',
  'assets',
  'style/main.css',
  'keypad-canvas.js',
  'touchpad.js',
  'runtime/j2me/input-mapping.js',
  'runtime/j2me/touch-layout.js',
  'config/settings.js',
  'bld/main-all.js',
  'mrp-runtime.js',
  'runtime/mrp/vmrp/vmrp.js',
  'runtime/mrp/vmrp/vmrp.wasm',
  'maopao/hall/manifest.json',
  'jar-manifest.json',
  'jar',
  'ruffle/ruffle.js',
  'ruffle/core.ruffle.16d61072ac7fdc4d5013.js',
  'ruffle/core.ruffle.994eeef0a471a88cd0e3.js',
  'ruffle/172de42e6619eac8f371.wasm',
  'ruffle/878d548199cddef07035.wasm',
  'ruffle/LICENSE_MIT',
  'ruffle/LICENSE_APACHE',
  'flash/fruit-madness.swf',
  'flash/fruit-madness-LICENSE',
  'flash/sample-game.swf',
  'flash/sample-game-LICENSE',
]

const missing = requiredFiles.filter((entry) => !fs.existsSync(path.join(webRoot, entry)))
if (missing.length) {
  console.error(`移动端 Web 资源不完整，缺少: ${missing.join(', ')}`)
  process.exit(1)
}

const index = fs.readFileSync(path.join(webRoot, 'index.html'), 'utf8')
if (!index.includes('id="root"')) {
  console.error('移动端 Web 资源缺少 React root 节点')
  process.exit(1)
}

const bundleFiles = fs.readdirSync(path.join(webRoot, 'assets'))
  .filter((entry) => entry.endsWith('.js'))
  .map((entry) => fs.readFileSync(path.join(webRoot, 'assets', entry), 'utf8'))
if (!bundleFiles.some((content) => content.includes('viewportMode') && content.includes('keyboard-height'))) {
  console.error('移动端 Web 资源缺少响应式控制器')
  process.exit(1)
}

console.log(`移动端 Web 资源校验通过: ${webRoot}`)
console.log(`资源大小: ${formatBytes(directorySize(webRoot))}`)

function directorySize(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).reduce((total, entry) => {
    const target = path.join(directory, entry.name)
    return total + (entry.isDirectory() ? directorySize(target) : fs.statSync(target).size)
  }, 0)
}

function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KiB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MiB`
}
