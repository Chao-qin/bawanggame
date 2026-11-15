import { spawn } from 'node:child_process'

const BASE_URL = process.env.VERIFY_BASE_URL || 'http://127.0.0.1:8080/'
const CDP_PORT = Number(process.env.VERIFY_CDP_PORT || 9342)
const CHROME = process.env.VERIFY_CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const PROFILE = `/tmp/xiaochao-local-flash-${process.pid}`
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
const chrome = spawn(CHROME, ['--headless=new', '--no-sandbox', '--no-proxy-server', '--disable-dev-shm-usage', '--disable-gpu', '--no-first-run', '--no-default-browser-check', `--remote-debugging-port=${CDP_PORT}`, `--user-data-dir=${PROFILE}`, '--window-size=1100,900', 'about:blank'], { stdio: 'ignore' })
let ws
let nextId = 0
const pending = new Map()

async function connect() {
  for (let attempt = 0; attempt < 60; attempt++) {
    try {
      if ((await fetch(`http://127.0.0.1:${CDP_PORT}/json/version`)).ok) break
    } catch (_) {}
    await sleep(100)
  }
  const tab = await (await fetch(`http://127.0.0.1:${CDP_PORT}/json/new?${encodeURIComponent(BASE_URL)}`, { method: 'PUT' })).json()
  ws = new WebSocket(tab.webSocketDebuggerUrl)
  await new Promise((resolve, reject) => { ws.addEventListener('open', resolve); ws.addEventListener('error', reject) })
  ws.addEventListener('message', (event) => {
    const message = JSON.parse(String(event.data))
    if (message.method === 'Runtime.exceptionThrown') console.error('Browser exception:', message.params.exceptionDetails?.exception?.description || message.params.exceptionDetails?.text)
    if (message.method === 'Page.javascriptDialogOpening') {
      send('Page.handleJavaScriptDialog', { accept: true }).catch(() => {})
      return
    }
    if (!message.id || !pending.has(message.id)) return
    const request = pending.get(message.id)
    pending.delete(message.id)
    message.error ? request.reject(new Error(JSON.stringify(message.error))) : request.resolve(message.result)
  })
}

function send(method, params = {}) {
  return new Promise((resolve, reject) => {
    const id = ++nextId
    pending.set(id, { resolve, reject })
    ws.send(JSON.stringify({ id, method, params }))
  })
}

async function evaluate(expression) {
  const result = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true })
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text || 'browser evaluation failed')
  return result.result.value
}

async function navigate(hash) {
  await send('Page.navigate', { url: `${BASE_URL.replace(/\/$/, '')}/${hash.replace(/^#?\/?/, '#/')}` })
  await sleep(1200)
}

function check(condition, message) {
  if (!condition) throw new Error(message)
}

try {
  await connect()
  await send('Page.enable')
  await send('Runtime.enable')
  await send('Page.setDownloadBehavior', { behavior: 'deny' })
  await evaluate(`(() => { window.__revokedUrls = []; const revoke = URL.revokeObjectURL; URL.revokeObjectURL = (value) => { window.__revokedUrls.push(value); return revoke.call(URL, value) } })()`)

  await navigate('#/library/flash-store')
  const addButton = await evaluate(`(() => { const button = [...document.querySelectorAll('.storeCard button')].find((node) => node.textContent.includes('加入')); if (!button) return false; button.click(); return true })()`)
  if (!addButton) {
    const state = await evaluate(`({ hash: location.hash, tabs: [...document.querySelectorAll('.tab')].map((node) => node.textContent.trim()), cards: document.querySelectorAll('.storeCard').length, buttons: [...document.querySelectorAll('button')].map((node) => node.textContent.trim()) })`)
    throw new Error(`Flash Store catalog button missing: ${JSON.stringify(state)}`)
  }
  await sleep(900)
  const localState = await evaluate(`new Promise((resolve, reject) => { const request = indexedDB.open('flash-local'); request.onerror = () => reject(request.error); request.onsuccess = () => { const tx = request.result.transaction('games'); const get = tx.objectStore('games').getAll(); get.onsuccess = () => resolve(get.result.map((item) => ({ id: item.id, name: item.name, key: item.dedupeKey }))); get.onerror = () => reject(get.error) } })`)
  console.log('Local records:', JSON.stringify(localState))
  check(localState.length === 1 && localState[0].key === 'catalog:fruit-madness.swf', 'Flash catalog item was not stored locally')
  const id = localState[0].id

  await send('Page.reload')
  await sleep(1200)
  await evaluate(`(() => { window.__revokedUrls = []; const revoke = URL.revokeObjectURL; URL.revokeObjectURL = (value) => { window.__revokedUrls.push(value); return revoke.call(URL, value) } })()`)
  console.log('After reload:', JSON.stringify(await evaluate(`({ hash: location.hash, body: document.body.innerText.slice(0, 120) })`)))
  check(await evaluate(`!!document.querySelector('.tabActive') && document.querySelector('.tabActive').textContent.includes('Flash 商城')`), 'Flash Store did not survive reload')

  console.log('Opening local player')
  await navigate(`#/play/flash/${encodeURIComponent(id)}?tab=flash&name=Fruit%20Madness&local=1`)
  console.log('Local player page ready')
  check(await evaluate(`!!document.querySelector('ruffle-player')`), 'Local Flash player did not mount')
  await evaluate(`window.__XIAOCHAO_NATIVE_BACK_REQUEST__?.(); true`)
  await sleep(150)
  check(await evaluate(`!!document.querySelector('.exitConfirm')`), 'Local Flash exit confirmation did not open')
  await evaluate(`document.querySelector('.exitConfirm .optionDanger')?.click(); true`)
  await sleep(600)
  check(await evaluate(`!document.querySelector('ruffle-player') && window.__revokedUrls.length > 0`), 'Local Flash cleanup did not remove player and revoke object URL')

  await navigate(`#/play/flash/missing-id?tab=flash&name=Missing&local=1`)
  check(await evaluate(`document.querySelector('.runtimeFailure')?.textContent.includes('本机游戏不存在')`), 'Missing local Flash id did not show a recoverable failure')
  await evaluate(`document.querySelector('.runtimeFailureButton')?.click(); true`)
  await sleep(300)
  check(await evaluate(`window.location.hash === '#/library/flash'`), 'Missing local Flash id did not return to the Flash library')

  const deleted = await evaluate(`(() => { const cards = [...document.querySelectorAll('.card')]; cards.at(-1)?.click(); return cards.length })()`)
  check(deleted > 2, 'Local Flash card was not listed in the Flash library')
  await sleep(150)
  await evaluate(`document.querySelector('.optionDanger')?.click(); true`)
  await sleep(150)
  await sleep(500)
  const remaining = await evaluate(`new Promise((resolve, reject) => { const request = indexedDB.open('flash-local'); request.onerror = () => reject(request.error); request.onsuccess = () => { const tx = request.result.transaction('games'); const get = tx.objectStore('games').getAll(); get.onsuccess = () => resolve(get.result.length); get.onerror = () => reject(get.error) } })`)
  check(remaining === 0, 'Deleting local Flash game did not remove IndexedDB record')
  console.log('Local Flash store smoke: pass')
} catch (error) {
  console.error('Local Flash store smoke: failed:', error.message)
  process.exitCode = 1
} finally {
  ws?.close()
  chrome.kill('SIGTERM')
}
