const MODE_NAMES = ['compact', 'mobile', 'tablet', 'desktop']
const ORIENTATION_NAMES = ['portrait', 'landscape']

function numberOrZero(value) {
  const number = Number(value)
  return Number.isFinite(number) && number >= 0 ? number : 0
}

function viewportSize(win) {
  const visual = win.visualViewport
  const width = Math.max(0, Number(win.innerWidth) || Number(win.document.documentElement.clientWidth) || 0)
  const height = Math.max(0, Number(win.innerHeight) || Number(win.document.documentElement.clientHeight) || 0)
  // While orientation.js turns the page by 90°, the app lays out in the turned viewport.
  if (win.document.documentElement.dataset.forcedRotation === 'cw') return { width: height, height: width, visualHeight: width, visualOffsetTop: 0 }
  const visualHeight = Math.max(0, Number(visual?.height) || height)
  const visualOffsetTop = Math.max(0, Number(visual?.offsetTop) || 0)
  return { width, height, visualHeight, visualOffsetTop }
}

function modeForWidth(width) {
  if (width < 360) return 'compact'
  if (width < 768) return 'mobile'
  if (width < 1024) return 'tablet'
  return 'desktop'
}

function readInsets(win) {
  const host = win.__XIAOCHAO_RESPONSIVE_INSETS__ || win.__XIAOCHAO_RESPONSIVE_HOST__?.insets
  if (!host || host.version !== 1) return null
  return {
    top: numberOrZero(host.top),
    right: numberOrZero(host.right),
    bottom: numberOrZero(host.bottom),
    left: numberOrZero(host.left),
  }
}

export function installResponsiveContract(win = window) {
  const doc = win.document
  const root = doc.documentElement
  const body = doc.body
  if (!root || !body) return () => {}
  if (win.__XIAOCHAO_RESPONSIVE_CLEANUP__) win.__XIAOCHAO_RESPONSIVE_CLEANUP__()

  let frame = 0
  let destroyed = false
  const events = []
  const host = win.__XIAOCHAO_RESPONSIVE_HOST__ || {}
  host.version = 1
  host.insets = win.__XIAOCHAO_RESPONSIVE_INSETS__ || host.insets || null
  host.setInsets = (payload) => {
    if (!payload || payload.version !== 1) return false
    const insets = {
      version: 1,
      top: numberOrZero(payload.top),
      right: numberOrZero(payload.right),
      bottom: numberOrZero(payload.bottom),
      left: numberOrZero(payload.left),
    }
    host.insets = insets
    win.__XIAOCHAO_RESPONSIVE_INSETS__ = insets
    schedule()
    return true
  }
  win.__XIAOCHAO_RESPONSIVE_HOST__ = host

  function setData(name, value) {
    root.dataset[name] = value
    body.dataset[name] = value
  }

  function refresh() {
    frame = 0
    if (destroyed) return
    const { width, height, visualHeight, visualOffsetTop } = viewportSize(win)
    const mode = modeForWidth(width)
    const orientation = width >= height ? 'landscape' : 'portrait'
    const keyboardHeight = Math.max(0, height - visualHeight - visualOffsetTop)
    const shortHeight = height < 600
    const insets = readInsets(win)
    root.style.setProperty('--viewport-width', `${width}px`)
    root.style.setProperty('--viewport-height', `${height}px`)
    root.style.setProperty('--visual-viewport-height', `${visualHeight}px`)
    root.style.setProperty('--keyboard-height', `${keyboardHeight}px`)
    if (insets) {
      root.style.setProperty('--safe-area-top', `${insets.top}px`)
      root.style.setProperty('--safe-area-right', `${insets.right}px`)
      root.style.setProperty('--safe-area-bottom', `${insets.bottom}px`)
      root.style.setProperty('--safe-area-left', `${insets.left}px`)
    } else {
      ;['top', 'right', 'bottom', 'left'].forEach((side) => root.style.removeProperty(`--safe-area-${side}`))
    }
    setData('viewportMode', mode)
    setData('viewportOrientation', orientation)
    setData('viewportShortHeight', shortHeight ? 'true' : 'false')
    setData('keyboardOpen', keyboardHeight > 80 ? 'true' : 'false')
    body.classList.remove(...MODE_NAMES.map((item) => `viewport-${item}`), ...ORIENTATION_NAMES.map((item) => `viewport-${item}`), 'viewport-short-height', 'keyboard-open')
    body.classList.add(`viewport-${mode}`, `viewport-${orientation}`)
    if (shortHeight) body.classList.add('viewport-short-height')
    if (keyboardHeight > 80) body.classList.add('keyboard-open')
    win.dispatchEvent(new CustomEvent('xiaochao:viewportchange', { detail: { width, height, visualHeight, keyboardHeight, mode, orientation, shortHeight, insets: insets || { top: 0, right: 0, bottom: 0, left: 0 } } }))
  }

  function schedule() {
    if (destroyed || frame) return
    const raf = win.requestAnimationFrame || ((callback) => win.setTimeout(callback, 0))
    frame = -1
    const id = raf(refresh)
    if (frame === -1) frame = id || 1
  }

  function listen(target, type) {
    if (!target?.addEventListener) return
    target.addEventListener(type, schedule, { passive: true })
    events.push([target, type])
  }

  listen(win, 'resize')
  listen(win, 'orientationchange')
  listen(doc, 'fullscreenchange')
  listen(doc, 'webkitfullscreenchange')
  listen(win.visualViewport, 'resize')
  listen(win.visualViewport, 'scroll')
  refresh()

  const cleanup = () => {
    if (destroyed) return
    destroyed = true
    if (frame) (win.cancelAnimationFrame || win.clearTimeout)(frame)
    events.forEach(([target, type]) => target.removeEventListener(type, schedule))
    body.classList.remove(...MODE_NAMES.map((item) => `viewport-${item}`), ...ORIENTATION_NAMES.map((item) => `viewport-${item}`), 'viewport-short-height', 'keyboard-open')
    ;['viewportWidth', 'viewportHeight', 'visualViewportHeight', 'keyboardHeight', 'safeAreaTop', 'safeAreaRight', 'safeAreaBottom', 'safeAreaLeft'].forEach((name) => root.style.removeProperty(`--${name.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`)}`))
    ;['viewportMode', 'viewportOrientation', 'viewportShortHeight', 'keyboardOpen'].forEach((name) => {
      delete root.dataset[name]
      delete body.dataset[name]
    })
    host.insets = null
    if (win.__XIAOCHAO_RESPONSIVE_INSETS__) delete win.__XIAOCHAO_RESPONSIVE_INSETS__
    if (win.__XIAOCHAO_RESPONSIVE_CLEANUP__ === cleanup) delete win.__XIAOCHAO_RESPONSIVE_CLEANUP__
  }
  win.__XIAOCHAO_RESPONSIVE_CLEANUP__ = cleanup
  return cleanup
}

