import fs from 'node:fs'
import path from 'node:path'

const repoRoot = path.resolve(import.meta.dirname, '../../..')
const ruffleRoot = path.join(repoRoot, 'apps/web/node_modules/@ruffle-rs/ruffle')
const publicRoot = path.join(repoRoot, 'public')
const ruffleFiles = fs.existsSync(ruffleRoot) ? fs.readdirSync(ruffleRoot) : []
const coreFiles = ruffleFiles.filter((name) => /^core\.ruffle\..+\.js$/.test(name))
const wasmFiles = ruffleFiles.filter((name) => name.endsWith('.wasm'))

if (!ruffleFiles.includes('ruffle.js') || !ruffleFiles.includes('LICENSE_MIT') || !ruffleFiles.includes('LICENSE_APACHE') || coreFiles.length !== 2 || wasmFiles.length !== 2) {
  throw new Error('Ruffle package assets are incomplete; expected loader, two cores, two WASM files, and both licenses')
}

const ruffleDest = path.join(publicRoot, 'ruffle')
const flashDest = path.join(publicRoot, 'flash')
fs.mkdirSync(ruffleDest, { recursive: true })
fs.mkdirSync(flashDest, { recursive: true })

for (const name of ['ruffle.js', 'LICENSE_MIT', 'LICENSE_APACHE', ...coreFiles, ...wasmFiles]) {
  fs.copyFileSync(path.join(ruffleRoot, name), path.join(ruffleDest, name))
}

const games = [
  {
    source: 'games/flash/sample-game.swf',
    destination: 'sample-game.swf',
  },
  {
    source: 'games/flash/fruit-madness/FruitMadness.swf',
    destination: 'fruit-madness.swf',
  },
]

const gameLicense = path.join(repoRoot, 'games/flash/fruit-madness/LICENSE')
if (!fs.existsSync(gameLicense)) throw new Error('Missing MIT license for Fruit Madness: games/flash/fruit-madness/LICENSE')

for (const game of games) {
  const source = path.join(repoRoot, game.source)
  if (!fs.existsSync(source)) throw new Error(`Missing bundled Flash game: ${game.source}`)
  fs.copyFileSync(source, path.join(flashDest, game.destination))
}

fs.copyFileSync(
  gameLicense,
  path.join(flashDest, 'fruit-madness-LICENSE'),
)
