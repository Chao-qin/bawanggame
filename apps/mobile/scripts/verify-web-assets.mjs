import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const mobileRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const webRoot = path.join(mobileRoot, 'web')

const requiredFiles = [
  'index.html',
  '.mobile-resource-version',
  'sw.js',
  'assets',
  'style/main.css',
  'config/settings.js',
  'bld/main-all.js',
  'mrp-runtime.js',
  'maopao/vmrp_v1.0/vmrp.js',
  'maopao/hall/manifest.json',
  'jar-manifest.json',
  'jar',
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
