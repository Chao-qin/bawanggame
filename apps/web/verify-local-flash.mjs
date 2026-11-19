import { spawn } from 'node:child_process'
import fs from 'node:fs'

const BASE_URL = process.env.VERIFY_BASE_URL || 'http://127.0.0.1:8080/'
const CDP_PORT = Number(process.env.VERIFY_CDP_PORT || 9342)
const CHROME = process.env.VERIFY_CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const PROFILE = `/tmp/xiaochao-local-flash-${process.pid}`
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
const chrome = spawn(CHROME, ['--headless=new', '--no-sandbox', '--no-proxy-server', '--disable-dev-shm-usage', '--disable-gpu', '--no-first-run', '--no-default-browser-check', `--remote-debugging-port=${CDP_PORT}`, `--user-data-dir=${PROFILE}`, '--window-size=1100,900', 'about:blank'], { stdio: 'ignore' })
const chromeExited = new Promise((resolve) => {
  chrome.once('close', resolve)
  chrome.once('error', resolve)
})
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


async function waitFor(expression, message) {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    if (await evaluate(expression)) return
    await sleep(100)
  }
  throw new Error(message)
}

async function click(selector, text) {
  const found = await evaluate(`(() => {
    const button = [...document.querySelectorAll(${JSON.stringify(selector)})]
      .find((node) => !node.disabled && node.textContent.trim().includes(${JSON.stringify(text)}))
    button?.click()
    return Boolean(button)
  })()`)
  check(found, `Button not found: ${selector} ${text}`)
}

async function submitFlash(name, url, localFile = false) {
  await evaluate(`(() => {
    const inputs = document.querySelectorAll('.flashImportFields input:not([type=file])')
    for (const [index, value] of [${JSON.stringify(name)}, ${JSON.stringify(url)}].entries()) {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(inputs[index], value)
      inputs[index].dispatchEvent(new Event('input', { bubbles: true }))
    }
    if (${localFile}) {
      const input = document.querySelector('#flash-file-input')
      const transfer = new DataTransfer()
      transfer.items.add(new File(['FWS smoke file'], 'smoke.swf'))
      input.files = transfer.files
      input.dispatchEvent(new Event('change', { bubbles: true }))
    }
  })()`)
  await click('.flashImportPanel button[type=submit]', '加入本机')
}

// Minimal stored ZIP fixtures with MIDlet manifests.
const storeJar = 'UEsDBBQAAAAAANy+c10F55o+LgAAAC4AAAAUAAAATUVUQS1JTkYvTUFOSUZFU1QuTUZNYW5pZmVzdC1WZXJzaW9uOiAxLjAKTUlEbGV0LU5hbWU6IFNtb2tlIEphdmEKUEsBAhQDFAAAAAAA3L5zXQXnmj4uAAAALgAAABQAAAAAAAAAAAAAAIABAAAAAE1FVEEtSU5GL01BTklGRVNULk1GUEsFBgAAAAABAAEAQgAAAGAAAAAAAA=='
const importJar = 'UEsDBBQAAAAAANy+c12KmxHaMAAAADAAAAAUAAAATUVUQS1JTkYvTUFOSUZFU1QuTUZNYW5pZmVzdC1WZXJzaW9uOiAxLjAKTUlEbGV0LU5hbWU6IFNtb2tlIEltcG9ydApQSwECFAMUAAAAAADcvnNdipsR2jAAAAAwAAAAFAAAAAAAAAAAAAAAgAEAAAAATUVUQS1JTkYvTUFOSUZFU1QuTUZQSwUGAAAAAAEAAQBCAAAAYgAAAAAA'

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
  check(await evaluate(`document.querySelector('.storeCard button')?.textContent.includes('已加入')`), 'Flash Store did not mark the catalog item as added')
  const localState = await evaluate(`new Promise((resolve, reject) => { const request = indexedDB.open('flash-local'); request.onerror = () => reject(request.error); request.onsuccess = () => { const tx = request.result.transaction('games'); const get = tx.objectStore('games').getAll(); get.onsuccess = () => resolve(get.result.map((item) => ({ id: item.id, name: item.name, key: item.dedupeKey }))); get.onerror = () => reject(get.error) } })`)
  console.log('Local records:', JSON.stringify(localState))
  check(localState.length === 1 && localState[0].key === 'catalog:fruit-madness', 'Flash catalog item was not stored locally')
  const id = localState[0].id

  await evaluate(`(() => {
    const fetchOriginal = window.fetch
    window.smokeFetches = { catalog: 0, url: 0 }
    window.fetch = (input, ...args) => {
      const path = new URL(input, location.href).pathname
      if (path.startsWith('/flash/')) window.smokeFetches.catalog += 1
      if (path === '/smoke-test.swf') {
        window.smokeFetches.url += 1
        return Promise.resolve(new Response('FWS smoke URL'))
      }
      return fetchOriginal(input, ...args)
    }
  })()`)
  await click('.storeCard button', '已加入')
  await waitFor(`document.querySelector('.statusSuccess')?.textContent.includes('已安装过')`, 'Flash catalog duplicate prompt missing')
  check(await evaluate('smokeFetches.catalog === 0'), 'Duplicate Flash catalog entry triggered a download')

  const swfUrl = new URL('/smoke-test.swf', BASE_URL).href
  await submitFlash('Smoke URL', swfUrl)
  await waitFor(`document.querySelector('.statusSuccess')?.textContent.includes('已加入「Smoke URL」')`, 'Initial Flash URL import failed')
  await submitFlash('Smoke URL', swfUrl)
  await waitFor(`document.querySelector('.statusSuccess')?.textContent.includes('已安装过「Smoke URL」')`, 'Flash URL duplicate prompt missing')
  check(await evaluate(`smokeFetches.url === 1 && document.querySelector('.flashImportFields input[type=url]').value === ${JSON.stringify(swfUrl)}`), 'Duplicate URL downloaded or cleared the form')

  await submitFlash('Smoke SWF', '', true)
  await waitFor(`document.querySelector('.statusSuccess')?.textContent.includes('已加入「Smoke SWF」')`, 'Initial SWF upload failed')
  await submitFlash('Smoke SWF', '', true)
  await waitFor(`document.querySelector('.statusSuccess')?.textContent.includes('已安装过「Smoke SWF」')`, 'SWF duplicate prompt missing')

  await navigate('#/library/flash')
  await click('.card', 'Smoke URL')
  await click('.optionSheet button', '选择')
  await waitFor(`document.querySelector('.selectBar')?.textContent.includes('已选 1 个')`, 'Selection did not preselect the first card')
  check(await evaluate(`[...document.querySelectorAll('.card')].some((card) => card.disabled && card.getAttribute('aria-disabled') === 'true')`), 'Online Flash cards remained selectable')
  await click('.card', 'Smoke SWF')
  await waitFor(`document.querySelector('.selectBar')?.textContent.includes('已选 2 个')`, 'Selection did not include both cards')
  await click('.selectBar button', '卸载')
  await waitFor(`!document.querySelector('.selectBar') && document.querySelector('.statusSuccess')?.textContent.includes('已卸载 2 款') && ![...document.querySelectorAll('.card')].some((card) => /Smoke URL|Smoke SWF/.test(card.textContent))`, 'Batch Flash uninstall did not refresh the library')
  await navigate('#/library/flash-store')

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

  // Seed a v1 record before opening the J2ME library to exercise the real upgrade.
  await evaluate(`new Promise((resolve, reject) => {
    const req = indexedDB.open('j2me-local', 1)
    req.onupgradeneeded = () => req.result.createObjectStore('jars', { keyPath: 'file' })
    req.onerror = () => reject(req.error)
    req.onsuccess = () => {
      const db = req.result
      const tx = db.transaction('jars', 'readwrite')
      tx.objectStore('jars').add({ file: 'old.jar', name: 'Legacy JAR', data: new Blob(['legacy']) })
      tx.oncomplete = () => { db.close(); resolve() }
      tx.onabort = () => { db.close(); reject(tx.error) }
    }
  })`)
  await send('Page.addScriptToEvaluateOnNewDocument', { source: `(() => {
    const fetchOriginal = window.fetch
    const bytes = (value) => Uint8Array.from(atob(value), (c) => c.charCodeAt(0))
    window.smokeJarBytes = bytes
    window.smokeDownloads = 0
    window.fetch = (input, ...args) => {
      const url = new URL(input, location.href)
      if (url.pathname === '/__52java/catalog') {
        return Promise.resolve(Response.json({ games: [{ id: 123, name: 'Smoke Java', plays: 0 }], total: 1 }))
      }
      if (url.pathname === '/__52java/download') {
        window.smokeDownloads += 1
        if (url.searchParams.get('id') !== '123') return Promise.resolve(new Response(null, { status: 400 }))
        return Promise.resolve(new Response(bytes(${JSON.stringify(storeJar)})))
      }
      return fetchOriginal(input, ...args)
    }
  })()` })
  await navigate('#/library/store')
  await send('Page.reload')
  await waitFor(`document.querySelector('.storeCard button')?.textContent.includes('加入库')`, '52java test catalog failed to load')
  await click('.storeCard button', '加入库')
  await waitFor(`document.querySelector('.storeCard button')?.textContent.includes('已加入')`, '52java install failed')
  check(await evaluate(`smokeDownloads === 1 && LocalJars.list().then((rows) => rows.some((row) => row.sourceId === '123') && rows.some((row) => row.file === 'old.jar'))`), 'Source ID or v1 JAR record missing')
  await send('Page.reload')
  await waitFor(`document.querySelector('.storeCard button')?.textContent.includes('已加入')`, '52java installed state did not survive reload')
  await click('.storeCard button', '已加入')
  await waitFor(`document.querySelector('.statusSuccess')?.textContent.includes('已安装过')`, '52java duplicate prompt missing')
  check(await evaluate('smokeDownloads === 0'), 'Duplicate 52java game triggered a download')

  await navigate('#/library/j2me')
  await evaluate(`(() => {
    const input = document.querySelector('input[type=file]')
    const transfer = new DataTransfer()
    transfer.items.add(new File([smokeJarBytes(${JSON.stringify(storeJar)})], 'renamed.jar'))
    transfer.items.add(new File([smokeJarBytes(${JSON.stringify(importJar)})], 'import.jar'))
    input.files = transfer.files
    input.dispatchEvent(new Event('change', { bubbles: true }))
  })()`)
  await waitFor(`document.querySelector('.statusSuccess')?.textContent.includes('已导入 1 款，1 款已安装过')`, 'Mixed JAR upload did not report one duplicate and one import')
  check(await evaluate(`LocalJars.list().then((rows) => rows.length === 3 && rows.some((row) => row.file === 'import.jar'))`), 'Mixed JAR upload wrote the wrong records')

  await click('.card', '大宋豪侠')
  check(await evaluate(`![...document.querySelectorAll('.optionSheet button')].some((button) => button.textContent.includes('选择'))`), 'Server game menu exposed selection')
  await click('.optionSheet button[aria-label="关闭"]', '')
  await click('.card', 'Smoke Java')
  await click('.optionSheet button', '选择')

  await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true })
  check(await evaluate(`document.querySelector('.selectBar').getBoundingClientRect().bottom <= document.querySelector('.tabs').getBoundingClientRect().top`), 'Selection bar overlaps phone navigation')
  await click('.card', 'Smoke Import')
  await click('.selectBar button', '卸载')
  await waitFor(`!document.querySelector('.selectBar') && document.querySelector('.statusSuccess')?.textContent.includes('已卸载 2 款')`, 'Batch JAR uninstall did not finish')
  check(await evaluate(`LocalJars.list().then((rows) => rows.length === 1 && rows[0].file === 'old.jar')`), 'Batch JAR uninstall removed the wrong records')
  console.log('Game dedup and batch uninstall smoke: pass')
  console.log('Local Flash store smoke: pass')
} catch (error) {
  console.error('Local Flash store smoke: failed:', error.message)
  process.exitCode = 1
} finally {
  if (ws?.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({ id: 0, method: 'Browser.close' }))
  } else {
    chrome.kill('SIGTERM')
  }
  const killTimer = setTimeout(() => chrome.kill('SIGKILL'), 2000)
  await chromeExited
  clearTimeout(killTimer)
  ws?.close()
  fs.rmSync(PROFILE, { recursive: true, force: true })
}
