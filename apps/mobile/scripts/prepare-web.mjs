import fs from 'node:fs'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const mobileRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const repoRoot = path.resolve(mobileRoot, '../..')
const generatedSite = path.join(repoRoot, 'site-deploy')
const target = path.join(mobileRoot, 'web')
const androidAssetsTarget = path.join(mobileRoot, 'android/app/src/main/assets/web')

const mrpVendor = path.join(repoRoot, 'maopao-revival/vendor/vmrp.github.io')
if (!fs.existsSync(path.join(mrpVendor, 'vmrp_v1.0/fs')) || !fs.existsSync(path.join(mrpVendor, 'public/mrps'))) {
  throw new Error('缺少冒泡运行时资源，请先按 maopao-revival/README.md 克隆 vendor/vmrp.github.io')
}

console.log('构建 React Web 应用...')
const buildEnv = { ...process.env }
if (process.env.MOBILE_52JAVA_API_BASE) buildEnv.VITE_52JAVA_API_BASE = process.env.MOBILE_52JAVA_API_BASE
execFileSync('pnpm', ['build'], { cwd: repoRoot, env: buildEnv, stdio: 'inherit' })
console.log('打包模拟器运行时和游戏资源...')
execFileSync('pnpm', ['run', 'pack'], { cwd: repoRoot, stdio: 'inherit' })

if (!fs.existsSync(generatedSite)) {
  throw new Error(`找不到 Web 打包目录: ${generatedSite}`)
}

fs.rmSync(target, { recursive: true, force: true })
fs.cpSync(generatedSite, target, { recursive: true })
const revision = execFileSync('git', ['rev-parse', '--short', 'HEAD'], { cwd: repoRoot, encoding: 'utf8' }).trim()
fs.writeFileSync(path.join(target, '.mobile-resource-version'), `${revision}\n`, 'utf8')
const jarRoot = path.join(target, 'jar')
const jarManifest = fs.readdirSync(jarRoot, { withFileTypes: true })
  .filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith('.jar'))
  .sort((a, b) => a.name.localeCompare(b.name, 'zh-CN'))
  .map((entry) => ({
    kind: 'j2me',
    file: entry.name,
    name: entry.name.replace(/\.jar$/i, ''),
    vendor: '',
    desc: '本地内置游戏',
    size: fs.statSync(path.join(jarRoot, entry.name)).size,
    icon: false,
  }))
fs.writeFileSync(path.join(target, 'jar-manifest.json'), `${JSON.stringify(jarManifest)}\n`, 'utf8')
fs.rmSync(androidAssetsTarget, { recursive: true, force: true })
fs.cpSync(target, androidAssetsTarget, { recursive: true })
execFileSync(process.execPath, [path.join(mobileRoot, 'scripts/verify-web-assets.mjs')], { stdio: 'inherit' })
console.log(`移动端 Web 资源已生成: ${target}`)
