// Turns the whole app when a game asks for portrait or landscape (the 「布局方向」 choice, or a J2ME game's own
// screen orientation), and hands rotation back to the device for 'auto'. In order of preference:
//   1. the installed app's host rotates its activity (apps/mobile/src/host/orientation.ts);
//   2. the browser locks the screen orientation (screen.orientation.lock: Android Chrome in fullscreen);
//   3. on a touch device, the page rotates #root by 90° (CSS) while the device is held the other way.
// While the page is rotated, every reader of pointer coordinates (Konva keypads, the touchpad, the J2ME and MRP
// engines) works in the rotated layout's coordinates: getBoundingClientRect, elementFromPoint and the client
// coordinates of pointer, mouse and touch events are translated for elements inside #root. Ruffle reads offsetX,
// which the browser already reports in the element's own (rotated) coordinates.
export const ORIENTATION_MODES = Object.freeze(['auto', 'portrait', 'landscape'])
const POINTER_EVENTS = ['pointerdown', 'pointermove', 'pointerup', 'pointercancel', 'pointerover', 'pointerout', 'pointerenter', 'pointerleave',
  'mousedown', 'mousemove', 'mouseup', 'mouseover', 'mouseout', 'click', 'dblclick', 'contextmenu', 'wheel',
  'touchstart', 'touchmove', 'touchend', 'touchcancel']

/** Maps a physical viewport point to the rotated layout (rotated 90° clockwise, physical width `width`). */
export function toLayoutPoint(x, y, width) {
  return [y, width - x]
}

/** Maps a rotated-layout point back to the physical viewport. */
export function toPhysicalPoint(x, y, width) {
  return [width - y, x]
}

/** The rotated-layout box of an element from its physical (axis-aligned) box. */
export function toLayoutRect(rect, width) {
  return { left: rect.top, top: width - rect.right, width: rect.height, height: rect.width }
}

function nativeHost(win) {
  const host = win.__XIAOCHAO_RN_HOST__
  return host && typeof host.send === 'function' && Array.isArray(host.capabilities) && host.capabilities.includes('orientation.lock') ? host : null
}

function fullscreenElement(doc) {
  return doc.fullscreenElement || doc.webkitFullscreenElement || null
}

function coarsePointer(win) {
  try { return Boolean(win.matchMedia?.('(pointer: coarse)')?.matches) } catch { return false }
}

function installCoordinateShim(win, root) {
  const doc = win.document
  const elementProto = win.Element.prototype
  const docProto = win.Document.prototype
  const rect = elementProto.getBoundingClientRect
  const fromPoint = docProto.elementFromPoint
  const fromPoints = docProto.elementsFromPoint
  const width = () => win.innerWidth
  const inside = (node) => node && node !== root && root.contains(node)
  const mapped = new WeakSet()

  elementProto.getBoundingClientRect = function getBoundingClientRect() {
    const box = rect.call(this)
    if (!inside(this)) return box
    const layout = toLayoutRect(box, width())
    return new win.DOMRect(layout.left, layout.top, layout.width, layout.height)
  }
  docProto.elementFromPoint = function elementFromPoint(x, y) {
    return fromPoint.call(this, ...toPhysicalPoint(x, y, width()))
  }
  if (fromPoints) {
    docProto.elementsFromPoint = function elementsFromPoint(x, y) {
      return fromPoints.call(this, ...toPhysicalPoint(x, y, width()))
    }
  }

  const remap = (target) => {
    if (!target || mapped.has(target) || typeof target.clientX !== 'number') return
    mapped.add(target)
    const [x, y] = toLayoutPoint(target.clientX, target.clientY, width())
    for (const [name, value] of [['clientX', x], ['clientY', y], ['pageX', x], ['pageY', y], ['x', x], ['y', y]]) {
      try { Object.defineProperty(target, name, { value, configurable: true }) } catch {}
    }
  }
  const onEvent = (event) => {
    if (!inside(event.target)) return
    remap(event)
    for (const list of [event.touches, event.changedTouches, event.targetTouches]) {
      if (list) for (let i = 0; i < list.length; i++) remap(list[i])
    }
  }
  POINTER_EVENTS.forEach((type) => win.addEventListener(type, onEvent, { capture: true, passive: true }))

  return () => {
    elementProto.getBoundingClientRect = rect
    docProto.elementFromPoint = fromPoint
    if (fromPoints) docProto.elementsFromPoint = fromPoints
    POINTER_EVENTS.forEach((type) => win.removeEventListener(type, onEvent, { capture: true }))
  }
}

/** One controller per window; the app installs it at start (main.jsx) and publishes request() for the runtimes. */
export function createOrientationController(win = window) {
  const doc = win.document
  let requested = 'auto'
  let sent = null
  let locked = null
  let removeShim = null

  const rotated = () => doc.documentElement.dataset.forcedRotation === 'cw'

  function setRotation(on) {
    if (on === rotated()) return
    const root = doc.getElementById('root')
    if (on && !root) return
    if (on) {
      doc.documentElement.dataset.forcedRotation = 'cw'
      removeShim = installCoordinateShim(win, root)
    } else {
      delete doc.documentElement.dataset.forcedRotation
      removeShim?.()
      removeShim = null
    }
    // responsive.js re-reads the (now swapped) viewport and every layout follows.
    win.dispatchEvent(new win.Event('resize'))
  }

  // A fullscreen element leaves #root's transform behind (the top layer is not transformed), so the page is never
  // turned while one is shown; fullscreen is where the browser's own screen lock works.
  function update() {
    const physical = win.innerWidth >= win.innerHeight ? 'landscape' : 'portrait'
    setRotation(requested !== 'auto' && !nativeHost(win) && coarsePointer(win) && physical !== requested && !fullscreenElement(doc))
  }

  // Leaving fullscreen releases the browser's screen lock; the next fullscreen entry has to lock again.
  function onFullscreenChange() {
    if (!fullscreenElement(doc)) locked = null
    update()
  }

  function request(mode) {
    const next = ORIENTATION_MODES.includes(mode) ? mode : 'auto'
    requested = next
    const host = nativeHost(win)
    if (host) {
      // 'auto' always goes out: another document (a runtime frame) may have locked the host since this one last sent.
      if (sent !== next || next === 'auto') host.send('orientation.lock', { mode: next })
      sent = next
      setRotation(false)
      return
    }
    const orientation = win.screen?.orientation
    if (next === 'auto') {
      if (locked) try { orientation?.unlock?.() } catch {}
      locked = null
    } else if (locked !== next && typeof orientation?.lock === 'function') {
      locked = next
      orientation.lock(next).then(update, () => { if (locked === next) locked = null })
    }
    update()
  }

  win.addEventListener('resize', update)
  win.addEventListener('orientationchange', update)
  doc.addEventListener?.('fullscreenchange', onFullscreenChange)
  doc.addEventListener?.('webkitfullscreenchange', onFullscreenChange)
  return {
    request,
    get requested() { return requested },
    get rotated() { return rotated() },
    destroy() {
      win.removeEventListener('resize', update)
      win.removeEventListener('orientationchange', update)
      doc.removeEventListener?.('fullscreenchange', onFullscreenChange)
      doc.removeEventListener?.('webkitfullscreenchange', onFullscreenChange)
      requested = 'auto'
      setRotation(false)
    },
  }
}

export function installOrientationController(win = window) {
  win.__XIAOCHAO_ORIENTATION__?.destroy()
  const controller = createOrientationController(win)
  win.__XIAOCHAO_ORIENTATION__ = controller
  return controller
}

/** Asks for an orientation; a no-op before the controller is installed. */
export function requestOrientation(mode, win = window) {
  win.__XIAOCHAO_ORIENTATION__?.request(mode)
}
