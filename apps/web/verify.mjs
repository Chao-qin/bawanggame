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
const UI_VIEWPORTS = [[320, 568], [365, 708], [390, 844], [430, 932], [844, 390], [667, 375], [1024, 768], [1365, 768]]
const UI_ROUTES = [
  ['J2ME library', '#/library/j2me'],
  ['Maopao library', '#/library/maopao'],
  ['Flash library', '#/library/flash'],
  ['Flash store', '#/library/flash-store'],
  ['Java store', '#/library/store'],
]

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
let inRuntimeFrame = false
let id = 0
const pending = new Map()
const jsErrors = []
const networkWarnings = []
const optionalShellAssets = /(?:^|\/)(?:manifest\.webmanifest|icon-(?:180|192)\.png)(?:$|\?)/
function isOptionalShellAsset(url = '') {
  return optionalShellAssets.test(url) || (!MRP_FILE && /\/maopao\/hall\/manifest\.json(?:\?|$)/.test(url))
}
function isExpectedProbeFailure(value = '') {
  return value.includes('layout-probe.jar')
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
  if (inRuntimeFrame) {
    expression = `document.querySelector('.runtimeFrame')?.contentWindow.eval(${JSON.stringify(expression)})`
  }
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

async function waitFor(predicate, description, attempts = 30) {
  for (let attempt = 0; attempt < attempts; attempt++) {
    if (await evaluate(`!!(${predicate})`)) return
    await sleep(100)
  }
  throw new Error(`timeout waiting for ${description}`)
}

async function inspectUiViewport(label, width, height) {
  await send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: width < 768 })
  await evaluate('window.dispatchEvent(new Event("resize"))')
  await sleep(140)
  const snapshot = await evaluate(`(() => {
    const rect = (node) => {
      if (!node) return null
      const r = node.getBoundingClientRect()
      return {left:r.left, top:r.top, right:r.right, bottom:r.bottom, width:r.width, height:r.height}
    }
    const overlap = (a,b) => !!a && !!b && a.left < b.right - 1 && a.right > b.left + 1 && a.top < b.bottom - 1 && a.bottom > b.top + 1
    const nav = document.querySelector('.tabs')
    const navItems = [...document.querySelectorAll('.tabs .tab')]
    const shell = document.querySelector('.appShell')
    const main = document.querySelector('.main')
    const gameGrid = document.querySelector('.gameGrid')
    const storeGrid = document.querySelector('.storeGrid')
    const entries = [...document.querySelectorAll('.card, .miniCard, .storeCard')].slice(0, 40)
    const overflowNodes = [...document.querySelectorAll('body *')].filter((node) => {
      const r = node.getBoundingClientRect()
      return r.width > 0 && r.right > innerWidth + 1
    }).slice(0, 8).map((node) => ({
      tag: node.tagName, className: typeof node.className === 'string' ? node.className : '',
      right: Math.round(node.getBoundingClientRect().right), width: Math.round(node.getBoundingClientRect().width),
    }))
    const badEntries = entries.filter((entry) => {
      const action = entry.querySelector('.downloadButton')
      const info = entry.querySelector('.storeInfo')
      return action && info && overlap(rect(action), rect(info))
    }).length
    const badBarEntries = entries.filter((entry) => {
      const artwork = entry.querySelector('.gameArtwork, .cardIcon')
      const info = entry.querySelector('.gameEntryInfo, .storeInfo')
      if (!artwork || !info) return false
      return artwork.getBoundingClientRect().right > info.getBoundingClientRect().left + 1
        || info.getBoundingClientRect().width < 32
    }).length
    const navRect = rect(nav)
    const shellRect = rect(shell)
    return {
      scrollWidth: document.documentElement.scrollWidth,
      overflowNodes,
      nav: navRect, shell: shellRect, main: rect(main),
      navVisible: !!nav && navRect.width > 0 && navRect.height > 0,
      navSlots: navItems.map(rect),
      navPosition: nav ? getComputedStyle(nav).position : 'missing',
      navOutsideViewport: !!navRect && (navRect.left < -1 || navRect.right > innerWidth + 1 || navRect.top < -1 || navRect.bottom > innerHeight + 1),
      mainOutsideShell: !!main && !!shellRect && (main.getBoundingClientRect().left < shellRect.left - 1 || main.getBoundingClientRect().right > shellRect.right + 1),
      gameColumns: gameGrid ? getComputedStyle(gameGrid).gridTemplateColumns.split(' ').length : 0,
      storeColumns: storeGrid ? getComputedStyle(storeGrid).gridTemplateColumns.split(' ').length : 0,
      entryCount: entries.length, badEntries, badBarEntries,
      controls: [...document.querySelectorAll('.toolbar, .storeFilters, .storeActions')].map((node) => {
        const r = rect(node)
        const children = [...node.children].filter((child) => getComputedStyle(child).display !== 'none').map(rect)
        return {childOutside:children.some((child) => child && (child.left < r.left - 1 || child.right > r.right + 1))}
      })
    }
  })()`)
  console.log(`UI ${label} ${width}x${height}:`, JSON.stringify(snapshot))
  requireCheck(snapshot.scrollWidth <= width + 1, `${label} has horizontal document overflow at ${width}x${height}`)
  requireCheck(snapshot.navVisible && !snapshot.navOutsideViewport, `${label} navigation is missing or outside viewport at ${width}x${height}`)
  if (snapshot.navSlots.length) {
    const widths = snapshot.navSlots.map((slot) => slot.width)
    requireCheck(Math.max(...widths) - Math.min(...widths) <= 1, `${label} navigation slots are not equal width at ${width}x${height}`)
  }
  requireCheck(!snapshot.mainOutsideShell, `${label} main content escapes shell at ${width}x${height}`)
  requireCheck(snapshot.badEntries === 0, `${label} entry action overlaps metadata at ${width}x${height}`)
  requireCheck(snapshot.badBarEntries === 0, `${label} game artwork and information are not arranged as one bar at ${width}x${height}`)
  requireCheck(snapshot.controls.every((control) => !control.childOutside), `${label} toolbar/filter child escapes its row at ${width}x${height}`)
  if (width < 768 && height >= 481) {
    requireCheck(Math.abs(snapshot.nav.bottom - height) < 2, `${label} mobile bottom navigation is not viewport-aligned at ${width}x${height}`)
  }
  if (width >= 768) {
    requireCheck(snapshot.navPosition !== 'fixed', `${label} desktop navigation is fixed over content at ${width}x${height}`)
    requireCheck(snapshot.nav.top >= snapshot.shell.top - 1 && snapshot.nav.bottom <= snapshot.shell.top + 150, `${label} desktop navigation is not in the header flow at ${width}x${height}`)
  }
  if (width <= 420) {
    if (snapshot.gameColumns) requireCheck(snapshot.gameColumns === 1, `${label} library is not a single-column list at ${width}x${height}`)
    if (snapshot.storeColumns) requireCheck(snapshot.storeColumns === 1, `${label} store is not a single-column list at ${width}x${height}`)
  }
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
    if (message.method === 'Fetch.requestPaused') {
      const url = message.params.request.url
      const body = /__52java\/catalog/.test(url)
        ? JSON.stringify({ games: [{ id: 1, name: '响应式验证游戏标题示例', plays: 12345 }], pages: 1, total: 1, siteUrl: 'https://java.52emu.cn' })
        : JSON.stringify({ games: [{ code: 'VERIFY-001', name: '响应式验证 Flash 标题示例', coverUrl: '/docs/revival-player.png' }] })
      send('Fetch.fulfillRequest', {
        requestId: message.params.requestId,
        responseCode: 200,
        responseHeaders: [{ name: 'Content-Type', value: 'application/json; charset=utf-8' }],
        body: Buffer.from(body).toString('base64'),
      }).catch((error) => jsErrors.push(`catalog stub: ${error.message}`))
    }
    if (message.method === 'Runtime.exceptionThrown') {
      const details = message.params.exceptionDetails
      const text = details?.exception?.description || details?.text || 'runtime exception'
      if (!isExpectedProbeFailure(text)) jsErrors.push(text)
    }
    if (message.method === 'Runtime.consoleAPICalled' && message.params.type === 'error') {
      const text = (message.params.args || []).map((arg) => arg.value ?? arg.description ?? '').join(' ') || 'console.error'
      if (!isExpectedProbeFailure(text) && !/Failed to load resource|Manifest fetch .*manifest\.webmanifest/.test(text)) jsErrors.push(text)
    }
    if (message.method === 'Log.entryAdded' && message.params.entry?.level === 'error') {
      const entry = message.params.entry
      if (!isOptionalShellAsset(entry.url) && !isExpectedProbeFailure(entry.url) && !isExpectedProbeFailure(entry.text) && !/Failed to load resource|Manifest fetch .*manifest\.webmanifest/.test(entry.text || '')) jsErrors.push(entry.text || 'browser log error')
    }
    if (message.method === 'Network.responseReceived' && message.params.response.status >= 400) {
      const response = message.params.response
      const catalogRequest = /\/__52java\/catalog(?:\?|$)/.test(response.url)
      const optionalMrpManifest = !MRP_FILE && /\/maopao\/hall\/manifest\.json(?:\?|$)/.test(response.url)
      if (isOptionalShellAsset(response.url) || isExpectedProbeFailure(response.url) || catalogRequest || optionalMrpManifest) networkWarnings.push(`HTTP ${response.status} ${response.url}`)
      else jsErrors.push(`HTTP ${response.status} ${response.url}`)
    }
  })
  await send('Page.enable')
  await send('Runtime.enable')
  await send('Log.enable')
  await send('Network.enable')
  await send('Fetch.enable', {
    patterns: [
      { urlPattern: '*://*/__52java/catalog*' },
      { urlPattern: '*://*/__flash/catalog*' },
    ],
  })
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

  for (const [label, route] of UI_ROUTES) {
    await navigate(route, 500)
    if (route.endsWith('/store')) await waitFor("document.querySelector('.storeCard')", 'Java catalog fixture')
    if (route.endsWith('/flash-store')) {
      await waitFor("document.querySelector('.flashCover img')", 'Flash catalog fixture')
      requireCheck(await evaluate(`(() => {
        const section = document.querySelector('.flashArchiveSection')
        const form = section.querySelector('.flashImportFields')
        const grid = section.querySelector('.archiveGrid')
        return grid.getBoundingClientRect().top > form.getBoundingClientRect().bottom &&
          getComputedStyle(grid.querySelector('img')).objectFit === 'contain'
      })()`), 'Flash results touch search or crop the thumbnail')
    }
    for (const [width, height] of UI_VIEWPORTS) {
      await inspectUiViewport(label, width, height)
    }
  }
  await send('Emulation.clearDeviceMetricsOverride')
  await navigate('#/library/j2me', 350)

  await send('Emulation.setDeviceMetricsOverride', { width: 320, height: 720, deviceScaleFactor: 1, mobile: true })
  requireCheck(await evaluate(`[...document.querySelectorAll('.javaLibraryToolbar > button')].length === 2 &&
    [...document.querySelectorAll('.javaLibraryToolbar > button')].every((button) => {
      const range = document.createRange()
      range.selectNodeContents(button)
      const label = range.getBoundingClientRect()
      const box = button.getBoundingClientRect()
      return label.width > 0 && Math.abs(label.left + label.width / 2 - box.left - box.width / 2) < 2 &&
        Math.abs(label.top + label.height / 2 - box.top - box.height / 2) < 2
    })`), 'Java toolbar button labels are off-center')
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

  await navigate('#/play/flash/fruit-madness.swf?tab=flash&name=Fruit%20Madness', 3000)
  const flash = await evaluate(`(() => ({ player: !!document.querySelector('.player'), stage: !!document.querySelector('.playerStage'), runtime: !!document.querySelector('ruffle-player'), reloads: window.__XIAOCHAO_RUNTIME_RELOAD_COUNT__ || 0 }))()`)
  console.log('Flash startup:', JSON.stringify(flash))
  requireCheck(flash.player && flash.stage, 'Flash player did not mount')
  const svgContract = await evaluate(`(() => ({
    surface: !!document.querySelector('.keyboard-surface'),
    count: document.querySelectorAll('.keyboard-surface [data-control-id]').length,
    htmlButtons: document.querySelectorAll('.keyboard-surface button').length,
    foreignObjects: document.querySelectorAll('.keyboard-surface foreignObject').length,
    actionPrefix: [...document.querySelectorAll('.keyboard-surface [data-action-id]')].every((node) => node.dataset.actionId.startsWith('flash-key:')),
    shapeFill: getComputedStyle(document.querySelector('.keyboard-key rect')).fill,
    shapeStroke: getComputedStyle(document.querySelector('.keyboard-key rect')).stroke,
    labelFill: getComputedStyle(document.querySelector('.keyboard-key text')).fill,
    labelHeight: document.querySelector('.keyboard-key text')?.getBoundingClientRect().height || 0,
  }))()`)
  requireCheck(svgContract.surface && svgContract.count === 72 && svgContract.htmlButtons === 0 && svgContract.foreignObjects === 0 && svgContract.actionPrefix, `Flash SVG contract invalid: ${JSON.stringify(svgContract)}`)
  requireCheck(svgContract.shapeFill === 'rgb(57, 67, 79)' && svgContract.shapeStroke === 'rgb(135, 147, 161)' && svgContract.labelFill === 'rgb(255, 255, 255)' && svgContract.labelHeight > 4, `Flash SVG colors or labels invalid: ${JSON.stringify(svgContract)}`)
  console.log('Flash SVG contract:', JSON.stringify(svgContract))
  await evaluate(`(() => { const player = document.querySelector('ruffle-player'); window.__flashKeyEvents = []; player?.focus(); for (const type of ['keydown', 'keyup']) document.addEventListener(type, (event) => { if (['ArrowRight','ArrowLeft'].includes(event.key)) window.__flashKeyEvents.push([type, event.key]) }, true); return { player: !!player, focused: document.activeElement === player } })()`)
  await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'ArrowRight', code: 'ArrowRight', windowsVirtualKeyCode: 39 })
  await send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'ArrowRight', code: 'ArrowRight', windowsVirtualKeyCode: 39 })
  requireCheck(await evaluate(`JSON.stringify(window.__flashKeyEvents) === JSON.stringify([['keydown','ArrowRight'],['keyup','ArrowRight']])`), 'physical keyboard events did not reach Ruffle exactly once')
  for (const [width, height] of [[390, 844], [844, 390]]) {
    await send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: true })
    await send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 })
    await sleep(180)
    const layout = await evaluate(`(() => {
      const read = (selector) => { const node = document.querySelector(selector); if (!node) return null; const r = node.getBoundingClientRect(); return {left:r.left, top:r.top, right:r.right, bottom:r.bottom, width:r.width, height:r.height} }
      const toolbar = read('.runtimeToolbar')
      const stage = read('.playerStage')
      const canvas = read('ruffle-player')
       const controls = read('.keyboard-surface')
      const collapsed = document.querySelector('.runtimeToolbar')?.classList.contains('runtimeToolbarCollapsed')
       return {toolbar, stage, canvas, controls, controlsDisplay: getComputedStyle(document.querySelector('.keyboard-surface')).display, collapsed, scrollWidth: document.documentElement.scrollWidth, viewportWidth: innerWidth, viewportHeight: innerHeight}
    })()`)
    console.log(`Flash layout ${width}x${height}:`, JSON.stringify(layout))
    requireCheck(layout.stage && layout.canvas && layout.stage.width > 0 && layout.stage.height > 0, `Flash stage is unstable at ${width}x${height}`)
    requireCheck(layout.scrollWidth <= layout.viewportWidth + 1, `Flash layout overflows horizontally at ${width}x${height}`)
    requireCheck(layout.controlsDisplay !== 'none', `Touch controls are hidden at ${width}x${height}`)
     requireCheck(layout.controls.left <= 1 && layout.controls.top <= 1 && layout.controls.right >= width - 1 && layout.controls.bottom >= height - 1, 'SVG keyboard surface does not cover the runtime viewport')
  }
  await evaluate(`document.querySelector('.runtimeToolbarToggle[aria-expanded="false"]')?.click(); true`)
  const fullscreenButton = await evaluate(`(() => { const r=document.querySelector('.runtimeToolbarIconButton[aria-label="进入全屏"]').getBoundingClientRect(); return {x:r.x+r.width/2,y:r.y+r.height/2} })()`)
  await send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [fullscreenButton] })
  await send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
  await sleep(250)
   const fullscreenControls = await evaluate(`({ fullscreen: !!document.fullscreenElement, hidden: getComputedStyle(document.querySelector('.keyboard-surface')).display === 'none', stage: (() => { const r=document.querySelector('.playerStage').getBoundingClientRect(); return {left:r.left,top:r.top,right:r.right,bottom:r.bottom} })() })`)
  console.log('Flash fullscreen:', JSON.stringify(fullscreenControls))
  requireCheck(fullscreenControls.fullscreen && fullscreenControls.hidden && fullscreenControls.stage.left <= 1 && fullscreenControls.stage.top <= 1, 'landscape fullscreen should auto-fit without touch controls')
  requireCheck(await evaluate(`document.activeElement?.matches('ruffle-player')`), 'Flash did not regain keyboard focus when entering fullscreen')
  await evaluate('document.exitFullscreen()')
  await sleep(150)
   requireCheck(await evaluate(`getComputedStyle(document.querySelector('.keyboard-surface')).display !== 'none'`), 'touch controls did not return after fullscreen exit')
  await send('Emulation.setTouchEmulationEnabled', { enabled: false })
  await send('Emulation.clearDeviceMetricsOverride')
  await evaluate(`window.__XIAOCHAO_NATIVE_BACK_REQUEST__?.(); true`)
  await sleep(150)
  requireCheck(await evaluate("!!document.querySelector('.exitConfirm')"), 'Flash exit confirmation did not open')
  await evaluate(`document.querySelector('.exitConfirm .optionDanger')?.click(); true`)
  await sleep(500)
  const flashExit = await evaluate(`(() => ({ hash: window.location.hash, tab: document.querySelector('.tabActive')?.textContent.trim() || '', reloads: window.__XIAOCHAO_RUNTIME_RELOAD_COUNT__ || 0, player: !!document.querySelector('.player') }))()`)
  console.log('Flash exit:', JSON.stringify(flashExit))
  requireCheck(flashExit.hash === '#/library/flash' && flashExit.tab === 'Flash' && flashExit.reloads === 0 && !flashExit.player, 'Flash exit reloaded or lost the active library tab')

  if (!J2ME_FILE) {
    console.log('SKIP: no J2ME fixture for runtime SVG checks (set VERIFY_J2ME_FILE)')
  } else {
  await navigate(`#\/play\/j2me\/${encodeURIComponent(J2ME_FILE)}?tab=j2me&name=Verify%20J2ME`, 800)
  await waitFor("document.querySelector('.runtimeFrame')?.contentDocument?.querySelector('#phone')", 'J2ME runtime markup')
  await waitFor("!![...document.querySelector('.runtimeFrame').contentDocument.styleSheets].find((sheet) => sheet.href?.includes('/style/main.css'))", 'J2ME runtime stylesheet')
   for (const [width, height] of [[844, 390], [667, 375], [390, 844]]) {
    await send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: true })
    const layout = await evaluate(`(() => {
      const frame = document.querySelector('.runtimeFrame')
      const doc = frame.contentDocument
      doc.body.dataset.orientation = '${width > height ? 'landscape' : 'portrait'}'
      const surface = doc.querySelector('.keyboard-surface')
      const rect = surface?.getBoundingClientRect()
      const keys = [...(surface?.querySelectorAll('[data-control-id]') || [])]
      return {
        surface: !!surface,
        rect: rect && {left:rect.left,top:rect.top,right:rect.right,bottom:rect.bottom,width:rect.width,height:rect.height},
        keyCount: keys.length,
        numericKeys: keys.filter((node) => /^key-|^(num|star|pound)/.test(node.dataset.controlId)).length,
        buttons: surface?.querySelectorAll('button').length || 0,
        scrollWidth:doc.documentElement.scrollWidth,
      }
    })()`)
    console.log(`J2ME layout ${width}x${height}:`, JSON.stringify(layout))
    requireCheck(layout.scrollWidth <= width + 1, `J2ME runtime overflows horizontally at ${width}x${height}`)
    requireCheck(layout.surface && layout.rect.width > 0 && layout.rect.height > 0, `J2ME SVG surface missing at ${width}x${height}`)
    requireCheck(layout.keyCount > 0 && layout.numericKeys >= 12, `J2ME SVG keypad inventory incomplete at ${width}x${height}`)
    requireCheck(layout.buttons === 0, `HTML buttons remain inside the J2ME SVG keyboard at ${width}x${height}`)
  }
  await send('Emulation.clearDeviceMetricsOverride')
  await evaluate(`(() => {
    const frame = document.querySelector('.runtimeFrame')
    frame?.contentWindow?.__XIAOCHAO_NATIVE_BACK_REQUEST__?.()
    return true
  })()`)
  await waitFor("document.querySelector('.runtimeFrame')?.contentDocument?.querySelector('.exitConfirm')", 'J2ME exit confirmation')
  await evaluate(`document.querySelector('.runtimeFrame').contentDocument.querySelector('.exitConfirm .optionDanger').click(); true`)
  await waitFor("!document.querySelector('.runtimeFrame')", 'J2ME runtime cleanup')
  }
  await navigate('#/play/flash/fruit-madness.swf?tab=flash&name=Fruit%20Madness', 1200)
  requireCheck(await evaluate("!!document.querySelector('.playerStage')"), 'Flash re-entry did not mount')
  await evaluate(`[...document.querySelectorAll('.tab')].find(node => node.textContent.includes('Flash 商城'))?.click()`)
  await sleep(3000)
  const flashStore = await evaluate(`(() => ({ images: [...document.querySelectorAll('.flashCover img')].filter((image) => !!image.getAttribute('src')).length, failedImages: [...document.querySelectorAll('.flashCover img')].filter((image) => image.hidden).length, importCollapsed: !document.querySelector('.flashAdvanced')?.open }))()`)
  console.log('Flash store:', JSON.stringify(flashStore))
  requireCheck(flashStore.images > 0 && flashStore.importCollapsed, 'Flash store did not show archive artwork or keep import secondary')

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
  requireCheck(await evaluate("!!document.querySelector('.exitConfirm')"), 'Local Revival exit confirmation did not open')
  await evaluate(`document.querySelector('.exitConfirm .optionDanger')?.click(); true`)
  await sleep(400)
  const localExit = await evaluate(`({ hash: window.location.hash, reloads: window.__XIAOCHAO_RUNTIME_RELOAD_COUNT__ || 0 })`)
  console.log('Local revival exit:', JSON.stringify(localExit))
  requireCheck(localExit.hash === '#/library/j2me' && localExit.reloads === 0, 'Local revival exit reloaded or returned to the wrong tab')

  if (!J2ME_FILE) {
    console.log('SKIP: no J2ME fixture (set VERIFY_J2ME_FILE)')
  } else {
    const route = `#/play/j2me/${encodeURIComponent(J2ME_FILE)}?tab=j2me&name=Verify%20J2ME`
    inRuntimeFrame = true
    await navigate(route, 2500)
    const j2me = await evaluate(`(() => {
      const surface = document.querySelector('.keyboard-surface')
      const key = surface?.querySelector('[data-action-id="num1"]')
      const rect = (node) => { if (!node) return null; const r=node.getBoundingClientRect(); return {x:r.x,y:r.y,width:r.width,height:r.height} }
      const keyShape = key?.querySelector('rect, circle')
      const keyLabel = key?.querySelector('text')
      return {
        player: !!document.querySelector('.player'),
        phone: !!document.querySelector('#phone'),
        boot: !!document.querySelector('.runtimeBoot'),
        failure: !!document.querySelector('.runtimeFailure'),
        editor: !!document.querySelector('#editor-layer'),
        exitConfirm: !!document.querySelector('.exitConfirm'),
        surface: rect(surface),
        key: rect(key),
        keyFill: keyShape ? getComputedStyle(keyShape).fill : null,
        keyStroke: keyShape ? getComputedStyle(keyShape).stroke : null,
        keyTextFill: keyLabel ? getComputedStyle(keyLabel).fill : null,
        keyTextHeight: keyLabel?.getBoundingClientRect().height || 0,
        keyCount: surface?.querySelectorAll('[data-control-id]').length || 0,
        htmlButtons: surface?.querySelectorAll('button').length || 0,
        states: window.__XIAOCHAO_VERIFY_RUNTIME_STATES__ || [],
      }
    })()`)
    console.log('J2ME startup:', JSON.stringify(j2me))
    requireCheck(j2me.player && j2me.phone && j2me.editor, 'J2ME player did not mount')
    requireCheck(!j2me.exitConfirm, 'J2ME showed an exit confirmation immediately after startup')
    requireCheck(j2me.surface?.width > 0 && j2me.surface?.height > 0 && j2me.keyCount >= 12 && j2me.htmlButtons === 0, 'J2ME SVG keyboard is missing or collapsed')
    requireCheck(j2me.key?.width >= 24 && j2me.key?.height >= 24, 'J2ME SVG numeric key is too small')
    requireCheck(j2me.keyFill === 'rgb(57, 67, 79)' && j2me.keyStroke === 'rgb(135, 147, 161)' && j2me.keyTextFill === 'rgb(255, 255, 255)' && j2me.keyTextHeight > 4, 'J2ME SVG key colors or labels are invalid')
    requireCheck(j2me.states.includes('boot') || j2me.states.includes('failure') || j2me.boot || j2me.failure, 'J2ME startup state was never rendered')
    const viewports = [[844, 390], [1280, 720], [390, 844], [320, 568], [375, 667]]
    for (const [width, height] of viewports) {
      await send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: true })
      await evaluate(`document.body.dataset.orientation='${width > height ? 'landscape' : 'portrait'}'; window.TouchLayout?.apply(window.TouchLayout.defaults()); window.ScreenSetup?.refit?.(); true`)
      await sleep(100)
      const snapshot = await evaluate(`(() => {
        const surface=document.querySelector('.keyboard-surface'), key=surface?.querySelector('[data-action-id="num1"]')
        const bounds=(node)=>{if(!node)return null;const r=node.getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height}}
        const shape=key?.querySelector('rect,circle'), label=key?.querySelector('text')
        return {surface:bounds(surface),key:bounds(key),keyFill:shape?getComputedStyle(shape).fill:null,keyStroke:shape?getComputedStyle(shape).stroke:null,keyTextFill:label?getComputedStyle(label).fill:null,keyTextHeight:label?.getBoundingClientRect().height||0,count:surface?.querySelectorAll('[data-control-id]').length||0,buttons:surface?.querySelectorAll('button').length||0,exit:!!document.querySelector('.exitConfirm'),scrollWidth:document.documentElement.scrollWidth}
      })()`)
      console.log(`J2ME SVG ${width}x${height}:`, JSON.stringify(snapshot))
      requireCheck(snapshot.surface?.width > 0 && snapshot.surface?.height > 0 && snapshot.count >= 12 && snapshot.buttons === 0, `J2ME SVG keyboard invalid at ${width}x${height}`)
      requireCheck(snapshot.key?.width >= 24 && snapshot.key?.height >= 24, `J2ME numeric key too small at ${width}x${height}`)
      requireCheck(snapshot.keyFill === 'rgb(57, 67, 79)' && snapshot.keyStroke === 'rgb(135, 147, 161)' && snapshot.keyTextFill === 'rgb(255, 255, 255)' && snapshot.keyTextHeight > 4, `J2ME key colors or labels invalid at ${width}x${height}`)
      requireCheck(!snapshot.exit, `J2ME shows an exit confirmation at ${width}x${height}`)
      requireCheck(snapshot.scrollWidth <= width + 1, `J2ME runtime overflows at ${width}x${height}`)
      if (width === 375) {
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
    await sleep(150)
    await evaluate(`document.body.dataset.orientation='landscape'; window.TouchLayout.apply({...window.TouchLayout.defaults(), sides:'standard'}); window.ScreenSetup?.refit?.(); true`)
    const standard = await rectSnapshot()
    requireCheck(!standard.navBeforeNumpad, 'standard side layout should keep navigation on the right')
    await evaluate(`window.TouchLayout.apply(window.TouchLayout.defaults()); window.ScreenSetup?.refit?.(); true`)
    await send('Emulation.clearDeviceMetricsOverride')
    await clickPlayerBack()
    await sleep(150)
    requireCheck(await evaluate("!!document.querySelector('.exitConfirm')"), 'exit confirmation did not open')
    await evaluate(`document.querySelector('.exitConfirm .optionDanger')?.click(); true`)
    inRuntimeFrame = false
    await sleep(1500)
    requireCheck(await evaluate("!!document.querySelector('.tab')"), 'exit did not return to library')
    inRuntimeFrame = true
    await navigate(route, 2500)
    const secondEntry = await evaluate(`(() => ({ player: !!document.querySelector('.player'), states: window.__XIAOCHAO_VERIFY_RUNTIME_STATES__ || [] }))()`)
    requireCheck(secondEntry.player, 'J2ME second entry did not mount')
    console.log('J2ME exit/re-entry: PASS', JSON.stringify(secondEntry))
    await clickPlayerBack()
    await sleep(150)
    await evaluate(`document.querySelector('.exitConfirm .optionDanger')?.click(); true`)
    inRuntimeFrame = false
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

  if (jsErrors.length) {
    console.error('BROWSER ERRORS:', JSON.stringify(jsErrors.slice(0, 20)))
    throw new Error(`browser console errors: ${jsErrors.slice(0, 3).join(' | ')}`)
  }
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
