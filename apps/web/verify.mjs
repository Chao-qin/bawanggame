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

fs.rmSync(PROFILE, { recursive: true, force: true })
const chrome = spawn(CHROME, [
  '--headless=new', '--no-sandbox', '--no-proxy-server', '--disable-gpu-sandbox', '--disable-dev-shm-usage',
  '--disable-gpu', '--use-gl=swiftshader', '--no-first-run', '--no-default-browser-check',
  '--disable-background-timer-throttling', '--disable-renderer-backgrounding',
  '--disable-backgrounding-occluded-windows', '--autoplay-policy=no-user-gesture-required',
  `--remote-debugging-port=${CDP_PORT}`, `--user-data-dir=${PROFILE}`, '--window-size=1100,900', '--lang=zh-CN', 'about:blank',
], { stdio: 'ignore' })

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
const chromeExited = new Promise((resolve) => {
  chrome.once('close', resolve)
  chrome.once('error', resolve)
})
let ws
let id = 0
const pending = new Map()
const jsErrors = []
const networkWarnings = []
const optionalShellAssets = /(?:^|\/)(?:manifest\.webmanifest|icon-(?:180|192)\.png)(?:$|\?)/
function isOptionalShellAsset(url = '') {
  return optionalShellAssets.test(url) || (!MRP_FILE && /\/maopao\/hall\/manifest\.json(?:\?|$)/.test(url))
}

function send(method, params = {}) {
  return new Promise((resolve, reject) => {
    const requestId = ++id
    const timer = setTimeout(() => {
      if (pending.has(requestId)) {
        pending.delete(requestId)
        reject(new Error(`timeout ${method}`))
      }
    }, 30_000)
    pending.set(requestId, { resolve, reject, timer })
    ws.send(JSON.stringify({ id: requestId, method, params }))
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

async function clickPlayerBack() {
  // Viewport changes and runtime startup can reapply the collapsed layout.
  await sleep(250)
  for (let attempt = 0; attempt < 20; attempt++) {
    const clicked = await evaluate(`(() => {
      const back = document.querySelector('.runtimeToolbarBack')
      if (back) {
        back.click()
        return true
      }
      document.querySelector('.runtimeToolbarToggle')?.click()
      return false
    })()`)
    if (clicked) return
    await sleep(100)
  }
  throw new Error('Back control is missing from expanded toolbar')
}

async function rectSnapshot() {
  return evaluate(`(() => {
    const read = (selector) => {
      const node = document.querySelector(selector)
      if (!node) return null
      const {left, top, right, bottom} = node.getBoundingClientRect()
      const style = getComputedStyle(node)
      return {left: left + parseFloat(style.paddingLeft), top, right: right - parseFloat(style.paddingRight), bottom}
    }
    // The landscape viewport wrapper spans the viewport. Measure the display
    // itself and exclude the keypad's horizontal gutters from hit regions.
    const nav = read('#nav'), numpad = read('#numpad'), display = read('#display'), toolbar = read('.runtimeToolbar')
    const overlap = (a, b) => !!a && !!b && a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top
    return { nav, numpad, display, toolbar, sideLayout: document.body.dataset.sideLayout || '', navBeforeNumpad: !!nav && !!numpad && nav.left < numpad.left, navNumpadOverlap: overlap(nav, numpad), navDisplayOverlap: overlap(nav, display), numpadDisplayOverlap: overlap(numpad, display) }
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
      clearTimeout(request.timer)
      message.error ? request.reject(new Error(JSON.stringify(message.error))) : request.resolve(message.result)
    }
    if (message.method === 'Runtime.exceptionThrown') {
      const details = message.params.exceptionDetails
      jsErrors.push(details?.exception?.description || details?.text || 'runtime exception')
    }
    if (message.method === 'Runtime.consoleAPICalled' && message.params.type === 'error') {
      const text = (message.params.args || []).map((arg) => arg.value ?? arg.description ?? '').join(' ') || 'console.error'
      if (!/Failed to load resource|Manifest fetch .*manifest\.webmanifest/.test(text)) jsErrors.push(text)
    }
    if (message.method === 'Log.entryAdded' && message.params.entry?.level === 'error') {
      const entry = message.params.entry
      if (!isOptionalShellAsset(entry.url) && !/Failed to load resource|Manifest fetch .*manifest\.webmanifest/.test(entry.text || '')) jsErrors.push(entry.text || 'browser log error')
    }
    if (message.method === 'Network.responseReceived' && message.params.response.status >= 400) {
      const response = message.params.response
      const catalogRequest = /\/__52java\/catalog(?:\?|$)/.test(response.url)
      const optionalMrpManifest = !MRP_FILE && /\/maopao\/hall\/manifest\.json(?:\?|$)/.test(response.url)
      if (isOptionalShellAsset(response.url) || catalogRequest || optionalMrpManifest) networkWarnings.push(`HTTP ${response.status} ${response.url}`)
      else jsErrors.push(`HTTP ${response.status} ${response.url}`)
    }
  })
  await send('Page.enable')
  await send('Runtime.enable')
  await send('Log.enable')
  await send('Network.enable')
  const runtimeStateObserver = `
    window.__XIAOCHAO_VERIFY_RUNTIME_STATES__ = []
    new MutationObserver(() => {
      if (document.querySelector('.runtimeBoot') && !window.__XIAOCHAO_VERIFY_RUNTIME_STATES__.includes('boot')) window.__XIAOCHAO_VERIFY_RUNTIME_STATES__.push('boot')
      if (document.querySelector('.runtimeFailure') && !window.__XIAOCHAO_VERIFY_RUNTIME_STATES__.includes('failure')) window.__XIAOCHAO_VERIFY_RUNTIME_STATES__.push('failure')
    }).observe(document, { childList: true, subtree: true })
  `
  await send('Page.addScriptToEvaluateOnNewDocument', { source: runtimeStateObserver })
  await evaluate(`(() => { ${runtimeStateObserver} })()`)
  await send('Emulation.setDeviceMetricsOverride', { width: 1100, height: 900, deviceScaleFactor: 1, mobile: false })
  await sleep(1500)

  const library = await evaluate(`(() => ({
    title: document.title,
    tabs: [...document.querySelectorAll('.tab')].map((node) => node.textContent.trim()),
    cards: [...document.querySelectorAll('.card')].map((node) => node.querySelector('.cardName')?.textContent.trim() || ''),
    hasUpload: !!document.querySelector('.upload'),
  }))()`)
  console.log('Library:', JSON.stringify(library))
  requireCheck(JSON.stringify(library.tabs) === JSON.stringify(['J2ME', '冒泡社区', 'Flash', 'Flash 商城', '52java 商城']), 'library tabs missing')
  requireCheck(library.hasUpload, 'JAR import missing')

  await send('Emulation.setDeviceMetricsOverride', { width: 320, height: 720, deviceScaleFactor: 1, mobile: true })
  const mobileNav = await evaluate(`(() => {
    const nav = document.querySelector('.tabs')
    return { bottom: nav.getBoundingClientRect().bottom, height: innerHeight, active: nav.querySelector('[aria-current="page"]')?.innerText, overflow: document.documentElement.scrollWidth > innerWidth }
  })()`)
  requireCheck(!mobileNav.overflow && Math.abs(mobileNav.bottom - mobileNav.height) < 2 && mobileNav.active === 'J2ME', 'mobile navigation overflows or lost its active state')
  await evaluate(`[...document.querySelectorAll('.tab')].find(node => node.textContent === 'Flash').click()`)
  requireCheck(await evaluate("location.hash === '#/library/flash'"), 'mobile tab did not update route')
  await evaluate("history.back()")
  await sleep(300)
  requireCheck(await evaluate("document.querySelector('.tab[aria-current=page]')?.textContent === 'J2ME'"), 'browser Back did not restore selected tab')
  await send('Emulation.clearDeviceMetricsOverride')

  const optionTarget = await evaluate(`(() => {
    const card = [...document.querySelectorAll('.card')].find((node) => node.querySelector('.cardName')?.textContent.includes('本地复活'))
    card?.click()
    return !!card
  })()`)
  if (optionTarget) {
    for (let attempt = 0; attempt < 40; attempt++) {
      if (await evaluate("document.activeElement?.getAttribute('aria-label') === '游戏选项'")) break
      await sleep(50)
    }
    const menu = await evaluate(`(() => { const sheet = document.querySelector('.optionSheet'); const rect = sheet?.getBoundingClientRect(); return { visible: !!sheet, width: rect?.width || 0, bottomAligned: !!rect && Math.abs(rect.bottom - innerHeight) < 2, buttons: [...document.querySelectorAll('.optionBody button')].map((node) => node.textContent.trim()) } })()`)
    console.log('Option sheet:', JSON.stringify(menu))
    requireCheck(menu.visible && menu.bottomAligned && menu.buttons.includes('启动'), 'option sheet is not usable')
    await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 })
    requireCheck(await evaluate("!document.querySelector('.optionSheet [role=dialog]')"), 'Escape did not dismiss the option sheet')
  } else console.log('SKIP: no local-revival card for option sheet')

  await navigate('#/play/flash/fruit-madness.swf?tab=flash&name=Fruit%20Madness', 2500)
  const flash = await evaluate(`(() => ({ player: !!document.querySelector('.player'), stage: !!document.querySelector('.playerStage'), runtime: !!document.querySelector('ruffle-player'), reloads: window.__XIAOCHAO_RUNTIME_RELOAD_COUNT__ || 0 }))()`)
  console.log('Flash startup:', JSON.stringify(flash))
  requireCheck(flash.player && flash.stage, 'Flash player did not mount')
  for (const [width, height] of [[390, 844], [844, 390]]) {
    await send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: true })
    await sleep(180)
    const layout = await evaluate(`(() => {
      const read = (selector) => { const node = document.querySelector(selector); if (!node) return null; const r = node.getBoundingClientRect(); return {left:r.left, top:r.top, right:r.right, bottom:r.bottom, width:r.width, height:r.height} }
      const toolbar = read('.runtimeToolbar')
      const stage = read('.playerStage')
      const canvas = read('ruffle-player')
      const collapsed = document.querySelector('.runtimeToolbar')?.classList.contains('runtimeToolbarCollapsed')
      return {toolbar, stage, canvas, collapsed, scrollWidth: document.documentElement.scrollWidth, viewportWidth: innerWidth}
    })()`)
    console.log(`Flash layout ${width}x${height}:`, JSON.stringify(layout))
    requireCheck(layout.stage && layout.canvas && layout.stage.width > 0 && layout.stage.height > 0, `Flash stage is unstable at ${width}x${height}`)
    requireCheck(layout.scrollWidth <= layout.viewportWidth + 1, `Flash layout overflows horizontally at ${width}x${height}`)
    if (width > height && layout.collapsed) requireCheck(layout.toolbar.right <= layout.stage.left + 1, `Landscape toolbar overlaps Flash stage at ${width}x${height}`)
    if (width <= height && !layout.collapsed) requireCheck(layout.toolbar.bottom <= layout.stage.top + 1, `Portrait toolbar overlaps Flash stage at ${width}x${height}`)
  }
  await send('Emulation.clearDeviceMetricsOverride')
  await evaluate(`window.__XIAOCHAO_NATIVE_BACK_REQUEST__?.(); true`)
  await sleep(150)
  requireCheck(await evaluate("!!document.querySelector('.exitConfirm')"), 'Flash exit confirmation did not open')
  await evaluate(`document.querySelector('.exitConfirm .optionDanger')?.click(); true`)
  await sleep(500)
  const flashExit = await evaluate(`(() => ({ hash: window.location.hash, tab: document.querySelector('.tabActive')?.textContent.trim() || '', reloads: window.__XIAOCHAO_RUNTIME_RELOAD_COUNT__ || 0, player: !!document.querySelector('.player') }))()`)
  console.log('Flash exit:', JSON.stringify(flashExit))
  requireCheck(flashExit.hash === '#/library/flash' && flashExit.tab === 'Flash' && flashExit.reloads === 0 && !flashExit.player, 'Flash exit reloaded or lost the active library tab')
  await navigate('#/play/flash/fruit-madness.swf?tab=flash&name=Fruit%20Madness', 1200)
  requireCheck(await evaluate("!!document.querySelector('.playerStage')"), 'Flash re-entry did not mount')

  await evaluate(`(() => {
    const originalFetch = window.fetch.bind(window)
    window.fetch = (input, init) => {
      if (!String(input).includes('/dasong/v1/command')) return originalFetch(input, init)
      const command = JSON.parse(init?.body || '{}').command
      const data = command === 'login' ? {token: 'verify-token'} : command === 'characters.create' ? {id: 1} : command === 'characters.select' ? {id: 1, name: '小侠', x: 0, y: 0, level: 1, hp: 100, max_hp: 100, experience: 0, gold: 0} : command === 'world.get' ? {map: {width: 2, height: 2, blocked: []}, npcs: []} : {}
      return Promise.resolve(new Response(JSON.stringify({data}), {status: 200, headers: {'content-type': 'application/json'}}))
    }
    window.location.hash = '#/play/local-revival/local-revival?tab=j2me&name=Local%20Revival'
    return true
  })()`)
  await sleep(500)
  await evaluate(`window.__XIAOCHAO_NATIVE_BACK_REQUEST__?.(); true`)
  await sleep(100)
  await evaluate(`document.querySelector('.exitConfirm .optionDanger')?.click(); true`)
  await sleep(400)
  const localExit = await evaluate(`({ hash: window.location.hash, reloads: window.__XIAOCHAO_RUNTIME_RELOAD_COUNT__ || 0 })`)
  console.log('Local revival exit:', JSON.stringify(localExit))
  requireCheck(localExit.hash === '#/library/j2me' && localExit.reloads === 0, 'Local revival exit reloaded or returned to the wrong tab')

  if (!J2ME_FILE) {
    console.log('SKIP: no J2ME fixture (set VERIFY_J2ME_FILE)')
  } else {
    const route = `#/play/j2me/${encodeURIComponent(J2ME_FILE)}?tab=j2me&name=Verify%20J2ME`
    await navigate(route, 2500)
    const j2me = await evaluate(`(() => ({ player: !!document.querySelector('.player'), phone: !!document.querySelector('#phone'), boot: !!document.querySelector('.runtimeBoot'), failure: !!document.querySelector('.runtimeFailure'), editor: !!document.querySelector('#editor-layer'), states: window.__XIAOCHAO_VERIFY_RUNTIME_STATES__ || [] }))()`)
    console.log('J2ME startup:', JSON.stringify(j2me))
    requireCheck(j2me.player && j2me.phone && j2me.editor, 'J2ME player did not mount')
    requireCheck(j2me.states.includes('boot') || j2me.states.includes('failure') || j2me.boot || j2me.failure, 'J2ME startup state was never rendered')
    const viewports = [[844, 390], [1280, 720], [390, 844], [375, 667]]
    for (const [width, height] of viewports) {
      await send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: true })
      await evaluate(`document.body.dataset.orientation='${width > height ? 'landscape' : 'portrait'}'; window.TouchLayout?.apply(window.TouchLayout.defaults()); window.ScreenSetup?.refit?.(); true`)
      await sleep(100)
      const snapshot = await rectSnapshot()
      console.log(`Viewport ${width}x${height}:`, JSON.stringify(snapshot))
      if (width === 375) {
        const portrait = await evaluate(`(() => {
          const rect = (id) => document.querySelector(id).getBoundingClientRect()
          const canvas = rect('#canvas')
          return {
            canvasHeight: canvas.height,
            headerGap: canvas.top - rect('.runtimeToolbar').bottom,
            leftGap: rect('#ret').top - rect('#choice').bottom,
            rightGap: rect('#clear').top - rect('#back').bottom,
          }
        })()`)
        console.log('J2ME portrait gaps:', JSON.stringify(portrait))
        requireCheck(portrait.canvasHeight > 0 && portrait.headerGap > 0, 'J2ME toolbar overlaps the game canvas')
        requireCheck(portrait.leftGap > 0 && portrait.rightGap > 0, 'J2ME side buttons have no vertical gap')
        const toolbar = await evaluate(`(() => {
          const toggle = document.querySelector('.runtimeToolbarToggle')
          const buttons = [...document.querySelectorAll('.runtimeToolbar .adm-button')]
          const centered = buttons.every((button) => {
            const outer = button.getBoundingClientRect()
            const icon = button.querySelector('svg, span > span').getBoundingClientRect()
            return outer.width > 0 && Math.abs(outer.left + outer.width / 2 - icon.left - icon.width / 2) < 1
              && Math.abs(outer.top + outer.height / 2 - icon.top - icon.height / 2) < 1
          })
          toggle.click()
          return centered
        })()`)
        requireCheck(toolbar, 'J2ME toolbar icons are off-center')
        await sleep(100)
        await send('Emulation.setDeviceMetricsOverride', { width: 376, height: 667, deviceScaleFactor: 1, mobile: true })
        await sleep(100)
        requireCheck(await evaluate(`(() => {
          const toggle = document.querySelector('.runtimeToolbarToggle')
          const floating = toggle.getBoundingClientRect()
          const stage = document.querySelector('.playerStage').getBoundingClientRect()
          return toggle.getAttribute('aria-expanded') === 'false' && floating.left < 16 && stage.width === innerWidth
        })()`), 'J2ME toolbar did not stay collapsed at the left after a portrait resize')
        await evaluate("document.querySelector('.runtimeToolbarToggle').click(); true")
        await sleep(100)
        requireCheck(await evaluate("document.querySelector('.runtimeToolbarToggle').getAttribute('aria-expanded') === 'true'"), 'J2ME toolbar did not reopen')
      }
      if (snapshot.nav && snapshot.numpad && snapshot.display) {
        requireCheck(!snapshot.navNumpadOverlap && !snapshot.navDisplayOverlap && !snapshot.numpadDisplayOverlap, `controls overlap at ${width}x${height}`)
        if (width > height) requireCheck(snapshot.navBeforeNumpad && snapshot.sideLayout === 'swapped', `default navigation is not on the left at ${width}x${height}`)
      } else console.log(`SKIP: J2ME geometry not ready at ${width}x${height}`)
    }
    await send('Emulation.setDeviceMetricsOverride', { width: 844, height: 390, deviceScaleFactor: 1, mobile: true })
    await evaluate(`document.body.dataset.orientation='landscape'; document.body.dataset.sideLayout='standard'; window.ScreenSetup?.refit?.(); true`)
    const standard = await rectSnapshot()
    requireCheck(!standard.navBeforeNumpad, 'standard side layout should keep navigation on the right')
    await evaluate(`document.body.dataset.sideLayout='swapped'; window.ScreenSetup?.refit?.(); true`)
    await send('Emulation.clearDeviceMetricsOverride')
    await clickPlayerBack()
    await sleep(150)
    requireCheck(await evaluate("!!document.querySelector('.exitConfirm')"), 'exit confirmation did not open')
    await evaluate(`document.querySelector('.exitConfirm .optionDanger')?.click(); true`)
    await sleep(1500)
    requireCheck(await evaluate("!!document.querySelector('.tab')"), 'exit did not return to library')
    await navigate(route, 2500)
    const secondEntry = await evaluate(`(() => ({ player: !!document.querySelector('.player'), states: window.__XIAOCHAO_VERIFY_RUNTIME_STATES__ || [] }))()`)
    requireCheck(secondEntry.player, 'J2ME second entry did not mount')
    console.log('J2ME exit/re-entry: PASS', JSON.stringify(secondEntry))
    await clickPlayerBack()
    await sleep(150)
    await evaluate(`document.querySelector('.exitConfirm .optionDanger')?.click(); true`)
    await sleep(1500)
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
  if (networkWarnings.length) console.log('WARN:', networkWarnings.slice(0, 3).join(' | '))
  console.log('RESULT PASS')
} catch (error) {
  console.error('VERIFY FAILED:', error.message)
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
