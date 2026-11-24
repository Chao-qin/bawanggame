import assert from 'node:assert/strict'
import test from 'node:test'
import { allowsSelection, installSelectionGuard } from './selection-guard.js'

function element(tag, userSelect = 'none', parentElement = null) {
  return { nodeType: 1, tag, userSelect, parentElement, isContentEditable: false, matches: (selector) => selector.split(', ').includes(tag) }
}

const view = { getComputedStyle: (el) => ({ userSelect: el.userSelect }), navigator: {} }

function fakeDocument(selection) {
  const handlers = {}
  const doc = {
    defaultView: view,
    activeElement: null,
    getSelection: () => selection,
    addEventListener: (type, handler) => { handlers[type] = handler },
  }
  installSelectionGuard(doc)
  return { doc, handlers }
}

function fire(handler, target, extra = {}) {
  const event = { target, defaultPrevented: false, preventDefault() { this.defaultPrevented = true }, ...extra }
  handler(event)
  return event.defaultPrevented
}

test('selection follows CSS: inputs and user-select:text areas allowed, user-select:none blocked', () => {
  const panel = element('div', 'text')
  assert.equal(allowsSelection(element('input'), view), true)
  assert.equal(allowsSelection(element('textarea'), view), true)
  assert.equal(allowsSelection(panel, view), true)
  assert.equal(allowsSelection({ nodeType: 3, parentElement: panel }, view), true)
  assert.equal(allowsSelection(element('span'), view), false)
  assert.equal(allowsSelection({ nodeType: 3, parentElement: element('span') }, view), false)
  assert.equal(allowsSelection(null, view), false)
})

test('user-select:auto (spec-compliant engines) resolves through ancestors', () => {
  assert.equal(allowsSelection(element('span', 'auto', element('body', 'none')), view), false)
  assert.equal(allowsSelection(element('span', 'auto', element('div', 'auto', element('div', 'text'))), view), true)
  assert.equal(allowsSelection(element('span', 'auto'), view), true)
})

test('selectstart and touch long-press menus are blocked outside selectable areas', () => {
  const { handlers } = fakeDocument(null)
  assert.equal(fire(handlers.selectstart, element('span')), true)
  assert.equal(fire(handlers.selectstart, element('input')), false)
  assert.equal(fire(handlers.contextmenu, element('span'), { pointerType: 'touch' }), true)
  assert.equal(fire(handlers.contextmenu, element('textarea'), { pointerType: 'touch' }), false)
})

test('long-press contextmenu without pointerType (Safari, UC kernels) is blocked after a touch', () => {
  const { handlers } = fakeDocument(null)
  handlers.touchstart({})
  assert.equal(fire(handlers.contextmenu, element('span')), true)
  handlers.pointerdown({ pointerType: 'touch' })
  assert.equal(fire(handlers.contextmenu, element('span')), true)
})

test('desktop right-click and the keyboard menu key keep their menu', () => {
  const { handlers } = fakeDocument(null)
  assert.equal(fire(handlers.contextmenu, element('span')), false)
  assert.equal(fire(handlers.contextmenu, element('span'), { pointerType: 'mouse' }), false)
  handlers.pointerdown({ pointerType: 'mouse' })
  assert.equal(fire(handlers.contextmenu, element('span')), false)
  assert.equal(fire(handlers.contextmenu, element('span'), { pointerType: '' }), false)
})

test('stray selections are cleared unless they sit in a selectable area or an input has focus', () => {
  let cleared = 0
  const selection = { isCollapsed: false, anchorNode: element('span'), removeAllRanges: () => { cleared += 1 } }
  const { doc, handlers } = fakeDocument(selection)
  handlers.selectionchange()
  assert.equal(cleared, 1)

  selection.anchorNode = element('div', 'text')
  handlers.selectionchange()
  assert.equal(cleared, 1)

  selection.anchorNode = element('span')
  doc.activeElement = element('input')
  handlers.selectionchange()
  assert.equal(cleared, 1)

  doc.activeElement = null
  selection.isCollapsed = true
  handlers.selectionchange()
  assert.equal(cleared, 1)
})

test('UC-kernel long-press menu switch is turned off when present and ignored when it throws', () => {
  const calls = []
  const doc = { ...fakeDocument(null).doc, defaultView: { ...view, navigator: { control: { longpressMenu: (on) => calls.push(on) } } } }
  installSelectionGuard(doc)
  assert.deepEqual(calls, [false])
  const throwing = { ...doc, defaultView: { ...view, navigator: { control: { longpressMenu: () => { throw new Error('denied') } } } } }
  assert.doesNotThrow(() => installSelectionGuard(throwing))
})
