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
execFileSync('pnpm', ['build'], { cwd: repoRoot, stdio: 'inherit' })
console.log('打包模拟器运行时和游戏资源...')
execFileSync('pnpm', ['run', 'pack'], { cwd: repoRoot, stdio: 'inherit' })

if (!fs.existsSync(generatedSite)) {
  throw new Error(`找不到 Web 打包目录: ${generatedSite}`)
}

fs.rmSync(target, { recursive: true, force: true })
fs.cpSync(generatedSite, target, { recursive: true })
const revision = execFileSync('git', ['rev-parse', '--short', 'HEAD'], { cwd: repoRoot, encoding: 'utf8' }).trim()
fs.writeFileSync(path.join(target, '.mobile-resource-version'), `${revision}\n`, 'utf8')
fs.rmSync(androidAssetsTarget, { recursive: true, force: true })
fs.cpSync(target, androidAssetsTarget, { recursive: true })
execFileSync(process.execPath, [path.join(mobileRoot, 'scripts/verify-web-assets.mjs')], { stdio: 'inherit' })
console.log(`移动端 Web 资源已生成: ${target}`)
