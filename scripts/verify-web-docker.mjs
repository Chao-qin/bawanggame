import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { unlink, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('../', import.meta.url))
const project = 'bawang-smoke-' + randomUUID().slice(0, 8)
const filename = project + '.jar'
const jarPath = new URL('../games/jar/' + filename, import.meta.url)
// A stored ZIP containing META-INF/MANIFEST.MF with MIDlet-Name: Smoke Java.
const jar = Buffer.from('UEsDBBQAAAAAANy+c10F55o+LgAAAC4AAAAUAAAATUVUQS1JTkYvTUFOSUZFU1QuTUZNYW5pZmVzdC1WZXJzaW9uOiAxLjAKTUlEbGV0LU5hbWU6IFNtb2tlIEphdmEKUEsBAhQDFAAAAAAA3L5zXQXnmj4uAAAALgAAABQAAAAAAAAAAAAAAIABAAAAAE1FVEEtSU5GL01BTklGRVNULk1GUEsFBgAAAAABAAEAQgAAAGAAAAAAAA==', 'base64')
let fixtureCreated = false

function compose(args, stdio = 'inherit') {
  return execFileSync('docker', ['compose', '-p', project, '-f', 'compose.yaml', ...args], {
    cwd: root,
    env: { ...process.env, WEB_BIND: '127.0.0.1', WEB_PORT: '0' },
    encoding: 'utf8',
    stdio,
  })
}

try {
  compose(['up', '--build', '-d', '--wait', '--wait-timeout', '60'])
  const base = 'http://' + compose(['port', 'web', '8080'], 'pipe').trim()
  async function request(path, options = {}, status = 200) {
    const response = await fetch(new URL(path, base), { signal: AbortSignal.timeout(10000), ...options })
    assert.equal(response.status, status, path)
    return response
  }

  const html = await (await request('/')).text()
  const entry = html.match(/src="(\/assets\/[^"]+\.js)"/)?.[1]
  assert.ok(entry, 'The homepage references the built JavaScript')
  await (await request(entry)).arrayBuffer()
  assert.match(await (await request('/config/localjars.js')).text(), /LocalJars/)
  assert.equal((await request('/ruffle/ruffle.js')).headers.get('content-type'), 'text/javascript; charset=utf-8')
  const swf = Buffer.from(await (await request('/flash/fruit-madness.swf')).arrayBuffer())
  assert.match(swf.subarray(0, 3).toString(), /^(FWS|CWS|ZWS)$/)
  assert.deepEqual(await (await request('/maopao/hall/manifest.json')).json(), [])

  await writeFile(jarPath, jar, { flag: 'wx', mode: 0o644 })
  fixtureCreated = true
  const games = await (await request('/__jars')).json()
  assert.equal(games.find((game) => game.file === filename)?.name, 'Smoke Java')
  assert.deepEqual(Buffer.from(await (await request('/jar/' + filename)).arrayBuffer()), jar)
  compose(['exec', '-T', 'web', 'sh', '-ec', 'test "$(id -u)" -ne 0 && test ! -w /app/games/jar'])

  const preflight = await request('/__52java/download', {
    method: 'OPTIONS',
    headers: { Origin: 'http://example.test', 'Access-Control-Request-Method': 'GET' },
  }, 204)
  assert.equal(preflight.headers.get('access-control-allow-origin'), '*')
  await (await request('/__52java/download', {}, 400)).json()
  console.log('Docker Web smoke passed')
} finally {
  try {
    if (fixtureCreated) await unlink(jarPath)
  } finally {
    compose(['down', '--rmi', 'local'])
  }
}
