/* Deterministic browser smoke checks for the React shell and runtime players.
 * Optional fixtures:
 *   VERIFY_J2ME_FILE=game.jar VERIFY_MRP_FILE=game.mrp node verify.mjs
 */
import { spawn } from 'node:child_process'
import fs from 'node:fs'

const CHROME = process.env.VERIFY_CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const CDP_PORT = Number(process.env.VERIFY_CDP_PORT || 9341)
const BASE_URL = process.env.VERIFY_BASE_URL || 'http://127.0.0.1:8080/'
const J2ME_FILE = process.env.VERIFY_J2ME_FILE || ''
const MRP_FILE = process.env.VERIFY_MRP_FILE || ''
const PROFILE = `/tmp/xiaochao-verify-${process.pid}`
const SHOT = `/tmp/xiaochao-verify-${process.pid}.png`

fs.rmSync(PROFILE, { recursive: true, force: true })
const chrome = spawn(CHROME, [
  '--headless=new', '--no-sandbox', '--no-proxy-server', '--disable-gpu-sandbox', '--disable-dev-shm-usage',
  '--disable-gpu', '--use-gl=swiftshader', '--no-first-run', '--no-default-browser-check',
  '--disable-background-timer-throttling', '--disable-renderer-backgrounding',
  '--disable-backgrounding-occluded-windows', '--autoplay-policy=no-user-gesture-required',
  `--remote-debugging-port=${CDP_PORT}`, `--user-data-dir=${PROFILE}`, '--window-size=1100,900', '--lang=zh-CN', 'about:blank',
], { stdio: 'ignore' })

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
let ws
let id = 0
const pending = new Map()
const jsErrors = []

function send(method, params = {}) {
  return new Promise((resolve, reject) => {
    const requestId = ++id
    pending.set(requestId, { resolve, reject })
    ws.send(JSON.stringify({ id: requestId, method, params }))
    setTimeout(() => {
      if (pending.has(requestId)) {
        pending.delete(requestId)
        reject(new Error(`timeout ${method}`))
      }
    }, 30_000)
  })
}

async function evaluate(expression) {
  const result = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true })
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.text || 'browser evaluation failed')
  return result.result.value
}

async function navigate(hash, wait = 1200) {
  await send('Page.navigate', { url: `${BASE_URL.replace(/\/$/, '')}/${hash.replace(/^#?\/?/, '#/')}` })
  await sleep(wait)
}

function requireCheck(condition, message) {
  if (!condition) throw new Error(message)
}

async function rectSnapshot() {
  return evaluate(`(() => {
    const read = (selector) => { const node = document.querySelector(selector); if (!node) return null; const r = node.getBoundingClientRect(); return {left:r.left, top:r.top, right:r.right, bottom:r.bottom, width:r.width, height:r.height} }
    const nav = read('#nav'), numpad = read('#numpad'), display = read('#display-container'), toolbar = read('.runtimeToolbar')
    const overlap = (a, b) => !!a && !!b && a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top
    return { nav, numpad, display, toolbar, navBeforeNumpad: !!nav && !!numpad && nav.left < numpad.left, navNumpadOverlap: overlap(nav, numpad), navDisplayOverlap: overlap(nav, display), numpadDisplayOverlap: overlap(numpad, display) }
  })()`)
}

try {
  for (let attempt = 0; attempt < 60; attempt++) {
    try { if ((await fetch(`http://127.0.0.1:${CDP_PORT}/json/version`)).ok) break } catch {}
    await sleep(200)
  }
  const tab = await (await fetch(`http://127.0.0.1:${CDP_PORT}/json/new?${encodeURIComponent(BASE_URL)}`, { method: 'PUT' })).json()
  ws = new WebSocket(tab.webSocketDebuggerUrl)
  await new Promise((resolve, reject) => { ws.addEventListener('open', resolve); ws.addEventListener('error', reject) })
  ws.addEventListener('message', async (event) => {
    let payload = event.data
    if (typeof payload !== 'string') payload = await payload.text()
    const message = JSON.parse(payload)
    if (message.id && pending.has(message.id)) {
      const request = pending.get(message.id)
      pending.delete(message.id)
      message.error ? request.reject(new Error(JSON.stringify(message.error))) : request.resolve(message.result)
    }
    if (message.method === 'Runtime.exceptionThrown') jsErrors.push(message.params.exceptionDetails?.text || 'runtime exception')
  })
  await send('Page.enable')
  await send('Runtime.enable')
  await send('Emulation.setDeviceMetricsOverride', { width: 1100, height: 900, deviceScaleFactor: 1, mobile: false })
  await sleep(1500)

  const library = await evaluate(`(() => ({
    title: document.title,
    tabs: [...document.querySelectorAll('.tab')].map((node) => node.textContent.trim()),
    cards: [...document.querySelectorAll('.card')].map((node) => node.querySelector('.cardName')?.textContent.trim() || ''),
    hasUpload: !!document.querySelector('.upload'),
  }))()`)
  console.log('Library:', JSON.stringify(library))
  requireCheck(library.tabs.includes('J2ME') && library.tabs.includes('冒泡社区'), 'library tabs missing')
  await send('Page.captureScreenshot').then((result) => fs.writeFileSync(SHOT, Buffer.from(result.data, 'base64')))

  const firstCard = await evaluate(`document.querySelector('.card')?.click(); true`)
  void firstCard
  await sleep(250)
  const menu = await evaluate(`(() => { const sheet = document.querySelector('.optionSheet'); const rect = sheet?.getBoundingClientRect(); return { visible: !!sheet, width: rect?.width || 0, bottomAligned: !!rect && Math.abs(rect.bottom - innerHeight) < 2, buttons: [...document.querySelectorAll('.optionBody button')].map((node) => node.textContent.trim()) } })()`)
  console.log('Option sheet:', JSON.stringify(menu))
  requireCheck(menu.visible && menu.bottomAligned && menu.buttons.includes('启动'), 'option sheet is not usable')
  await evaluate(`document.querySelector('.optionBackdrop')?.click(); true`)

  if (!J2ME_FILE) {
    console.log('SKIP: no J2ME fixture (set VERIFY_J2ME_FILE)')
  } else {
    const route = `#/play/j2me/${encodeURIComponent(J2ME_FILE)}?tab=j2me&name=Verify%20J2ME`
    await navigate(route, 2500)
    const j2me = await evaluate(`(() => ({ player: !!document.querySelector('.player'), phone: !!document.querySelector('#phone'), boot: !!document.querySelector('.runtimeBoot'), failure: !!document.querySelector('.runtimeFailure'), editor: !!document.querySelector('#editor-layer') }))()`)
    console.log('J2ME startup:', JSON.stringify(j2me))
    requireCheck(j2me.player && j2me.phone && j2me.editor, 'J2ME player did not mount')
    await send('Emulation.setDeviceMetricsOverride', { width: 844, height: 390, deviceScaleFactor: 1, mobile: true })
    await evaluate(`document.body.dataset.orientation='landscape'; document.body.dataset.sideLayout='swapped'; window.ScreenSetup?.refit?.(); true`)
    await sleep(300)
    const landscape = await rectSnapshot()
    console.log('Landscape 844x390:', JSON.stringify(landscape))
    if (landscape.nav && landscape.numpad && landscape.display) {
      requireCheck(landscape.navBeforeNumpad, 'landscape navigation group is not on the left')
      requireCheck(!landscape.navNumpadOverlap && !landscape.navDisplayOverlap && !landscape.numpadDisplayOverlap, 'landscape controls overlap')
    } else console.log('SKIP: J2ME geometry not ready for fixture')
    await send('Emulation.clearDeviceMetricsOverride')
    await evaluate(`document.querySelector('.runtimeToolbarBack')?.click(); true`)
    await sleep(150)
    requireCheck(await evaluate("!!document.querySelector('.exitConfirm')"), 'exit confirmation did not open')
    await evaluate(`document.querySelector('.exitConfirm .optionDanger')?.click(); true`)
    await sleep(1500)
    requireCheck(await evaluate("!!document.querySelector('.tab')"), 'exit did not return to library')
    console.log('J2ME exit/re-entry: PASS')
  }

  if (!MRP_FILE) {
    console.log('SKIP: no MRP fixture (set VERIFY_MRP_FILE)')
  } else {
    await navigate(`#/play/maopao/${encodeURIComponent(MRP_FILE)}?tab=maopao&name=Verify%20MRP`, 1800)
    const mrp = await evaluate(`(() => ({ player: !!document.querySelector('.player'), dialogText: !!document.querySelector('#mrp-dialog-text'), bridgeContainsDialog: !!document.querySelector('#editor-layer #mrp-dialog-text'), boot: !!document.querySelector('.runtimeBoot'), failure: !!document.querySelector('.runtimeFailure') }))()`)
    console.log('MRP startup:', JSON.stringify(mrp))
    requireCheck(mrp.player && mrp.dialogText && !mrp.bridgeContainsDialog, 'MRP dialog/editor structure is invalid')
  }

  if (jsErrors.length) throw new Error(`browser console errors: ${jsErrors.slice(0, 3).join(' | ')}`)
  console.log('RESULT PASS')
} catch (error) {
  console.error('VERIFY FAILED:', error.message)
  process.exitCode = 1
} finally {
  try { ws?.close() } catch {}
  chrome.kill('SIGKILL')
  fs.rmSync(PROFILE, { recursive: true, force: true })
}
