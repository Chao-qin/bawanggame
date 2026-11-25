import test from 'node:test'
import assert from 'node:assert/strict'
import { createOrientationController, toLayoutPoint, toLayoutRect, toPhysicalPoint } from './orientation.js'

// A phone held upright: 400 x 800 CSS px.
function fakeWindow({ coarse = true, host = null, lock = null, width = 400, height = 800 } = {}) {
  const listeners = {}
  class Element {
    constructor(rect, parent = null) { this.rect = rect; this.parent = parent }
    getBoundingClientRect() { return this.rect }
  }
  class Document {
    elementFromPoint(x, y) { return [x, y] }
    elementsFromPoint(x, y) { return [[x, y]] }
  }
  const root = new Element({ left: 0, top: 0, right: width, bottom: height, width, height })
  root.contains = (node) => { for (let n = node; n; n = n.parent) if (n === root) return true; return false }
  const docListeners = {}
  const document = Object.assign(new Document(), {
    documentElement: { dataset: {} },
    fullscreenElement: null,
    getElementById: (id) => (id === 'root' ? root : null),
    addEventListener(type, fn) { (docListeners[type] ||= []).push(fn) },
    removeEventListener(type, fn) { docListeners[type] = (docListeners[type] || []).filter((item) => item !== fn) },
    fire(type) { (docListeners[type] || []).forEach((fn) => fn()) },
  })
  const win = {
    innerWidth: width,
    innerHeight: height,
    document,
    Element,
    Document,
    Event: class { constructor(type) { this.type = type } },
    DOMRect: class { constructor(x, y, w, h) { Object.assign(this, { left: x, top: y, width: w, height: h, right: x + w, bottom: y + h }) } },
    matchMedia: (query) => ({ matches: query === '(pointer: coarse)' ? coarse : !coarse }),
    screen: lock ? { orientation: { lock, unlock() {} } } : {},
    __XIAOCHAO_RN_HOST__: host,
    resizes: 0,
    addEventListener(type, fn) { (listeners[type] ||= []).push(fn) },
    removeEventListener(type, fn) { listeners[type] = (listeners[type] || []).filter((item) => item !== fn) },
    dispatchEvent(event) { if (event.type === 'resize') this.resizes++; (listeners[event.type] || []).forEach((fn) => fn(event)) },
    listeners,
  }
  return { win, root, Element }
}

test('the coordinate maps of a page turned clockwise invert each other', () => {
  assert.deepEqual(toLayoutPoint(390, 10, 400), [10, 10])
  assert.deepEqual(toPhysicalPoint(10, 10, 400), [390, 10])
  // A key at the layout's top-left corner sits at the physical top-right.
  assert.deepEqual(toLayoutRect({ left: 350, top: 0, right: 400, bottom: 100, width: 50, height: 100 }, 400), { left: 0, top: 0, width: 100, height: 50 })
})

test('the app host rotates natively and the page never turns itself', () => {
  const sent = []
  const { win } = fakeWindow({ host: { capabilities: ['orientation.lock'], send: (type, payload) => sent.push([type, payload]) } })
  const controller = createOrientationController(win)
  controller.request('landscape')
  controller.request('landscape')
  controller.request('auto')
  controller.request('auto')
  assert.deepEqual(sent, [['orientation.lock', { mode: 'landscape' }], ['orientation.lock', { mode: 'auto' }], ['orientation.lock', { mode: 'auto' }]],
    'a lock is not repeated, a release always goes out (a runtime frame may have locked the host meanwhile)')
  assert.equal(win.document.documentElement.dataset.forcedRotation, undefined)
})

test('a touch browser without a screen lock turns the page, and the device catching up undoes it', () => {
  const { win } = fakeWindow()
  const controller = createOrientationController(win)
  controller.request('landscape')
  assert.equal(win.document.documentElement.dataset.forcedRotation, 'cw')
  assert.equal(win.resizes, 1)

  win.innerWidth = 800
  win.innerHeight = 400
  win.dispatchEvent(new win.Event('resize'))
  assert.equal(win.document.documentElement.dataset.forcedRotation, undefined)

  win.innerWidth = 400
  win.innerHeight = 800
  win.dispatchEvent(new win.Event('resize'))
  assert.equal(controller.rotated, true)
  controller.request('auto')
  assert.equal(controller.rotated, false)
})

test('a mouse device keeps the old layout-only behaviour', () => {
  const { win } = fakeWindow({ coarse: false })
  createOrientationController(win).request('landscape')
  assert.equal(win.document.documentElement.dataset.forcedRotation, undefined)
})

test('a successful screen lock is used instead of turning the page', async () => {
  let locked = null
  const { win } = fakeWindow({ lock: async (mode) => { locked = mode; win.innerWidth = 800; win.innerHeight = 400 } })
  createOrientationController(win).request('landscape')
  await Promise.resolve()
  await Promise.resolve()
  assert.equal(locked, 'landscape')
  assert.equal(win.document.documentElement.dataset.forcedRotation, undefined)
})

test('while turned, positions inside #root read in layout coordinates and are restored afterwards', () => {
  const { win, root, Element } = fakeWindow()
  const inside = new Element({ left: 350, top: 0, right: 400, bottom: 100, width: 50, height: 100 }, root)
  const outside = new Element({ left: 350, top: 0, right: 400, bottom: 100, width: 50, height: 100 })
  const controller = createOrientationController(win)
  controller.request('landscape')

  const box = inside.getBoundingClientRect()
  assert.deepEqual([box.left, box.top, box.width, box.height], [0, 0, 100, 50])
  assert.equal(outside.getBoundingClientRect().left, 350)
  assert.deepEqual(win.document.elementFromPoint(10, 10), [390, 10])

  const event = { target: inside, clientX: 390, clientY: 10, changedTouches: [{ clientX: 390, clientY: 10 }] }
  win.listeners.touchstart.forEach((fn) => fn(event))
  assert.deepEqual([event.clientX, event.clientY], [10, 10])
  assert.deepEqual([event.changedTouches[0].clientX, event.changedTouches[0].clientY], [10, 10])

  controller.request('auto')
  assert.equal(inside.getBoundingClientRect().left, 350)
  assert.deepEqual(win.document.elementFromPoint(10, 10), [10, 10])
  assert.equal((win.listeners.touchstart || []).length, 0)
})

test('fullscreen never shows a turned page, and every fullscreen entry asks the browser to lock again', async () => {
  const locks = []
  const { win } = fakeWindow({ lock: (mode) => { locks.push(mode); return win.document.fullscreenElement ? Promise.resolve() : Promise.reject(new Error('not fullscreen')) } })
  const controller = createOrientationController(win)
  controller.request('landscape')
  await Promise.resolve(); await Promise.resolve()
  assert.equal(controller.rotated, true, 'outside fullscreen the lock fails and the page turns')

  win.document.fullscreenElement = {}
  win.document.fire('fullscreenchange')
  assert.equal(controller.rotated, false, 'the fullscreen element is shown unturned')
  controller.request(controller.requested)
  win.document.fullscreenElement = null
  win.document.fire('fullscreenchange')
  win.document.fullscreenElement = {}
  win.document.fire('fullscreenchange')
  controller.request(controller.requested)
  assert.deepEqual(locks, ['landscape', 'landscape', 'landscape'], 'the second entry locks again')
})
