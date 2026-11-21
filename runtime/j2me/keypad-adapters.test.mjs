import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import vm from 'node:vm'

const keymapSource = await readFile(new URL('./keymap.js', import.meta.url), 'utf8')
const mrpSource = await readFile(new URL('../mrp/mrp-runtime.js', import.meta.url), 'utf8')

function surface() {
  return { querySelector() { return null }, addEventListener() {}, removeEventListener() {} }
}

test('J2ME adapter delivers exact MIDP codes and release-all through the SVG bridge', () => {
  const events = []
  let bindOptions
  const context = {
    console, config: { touchLayout: {}, keyRepeat: 0, keymap: {}, keys: { up: -1, down: -2, left: -3, right: -4, ok: -5, soft1: -6, soft2: -7, clear: -8, back: -11 } }, vmSetTimeout() {},
    performance: { now: () => 1 }, MIDP: { frames: 0, sendKeyPress: (code) => events.push(['press', code]), sendKeyRelease: (code) => events.push(['release', code]) },
    window: { requestAnimationFrame: (callback) => callback(1000), setTimeout, clearTimeout, addEventListener() {}, __XIAOCHAO_KEYBOARD_SESSION__: { getSurface: () => surface() } },
    document: { addEventListener() {} },
    TouchLayout: { mapButtons: (buttons) => buttons }, Touchpad: { bind: (options) => { bindOptions = options; return { destroy() {}, info() { return {} }, sizes() { return {} } } } },
    InputMapping: { create: (options) => ({ press: (source, action, meta) => options.sink.press(action, source, meta), release: (source, action, meta) => options.sink.release(action, source, meta), repeat() {}, destroy() {} }) },
    setTimeout, clearTimeout, isFinite, Object, Number, Math,
  }
  context.window.Touchpad = context.Touchpad
  context.window.TouchLayout = context.TouchLayout
  context.window.InputMapping = context.InputMapping
  context.window.window = context.window
  vm.runInNewContext(keymapSource, context)
  context.window.__XIAOCHAO_KEYMAP_BOOT__()
  bindOptions.input.press('pointer:1:up', 'up')
  assert.deepEqual(events, [['press', -1]])
  bindOptions.input.press('pointer:1:num2', 'num2')
  assert.deepEqual(events.at(-1), ['press', 50])
  bindOptions.input.release('pointer:1:up', 'up')
  assert.deepEqual(events.at(-1), ['release', -1])
  context.window.__XIAOCHAO_INPUT_CONTROLLER__?.releaseAll?.()
})

test('MRP adapter source contains the SVG bridge and exact c_event mapping', () => {
  assert.match(mrpSource, /getSurface\(\)/)
  assert.match(mrpSource, /buttons\[control\.id\] = control\.actionId/)
  assert.match(mrpSource, /actionMap\[control\.id\] = control\.actionId/)
  assert.match(mrpSource, /cEvent\(0, KEYCODES\[action\]\)/)
  assert.match(mrpSource, /cEvent\(1, KEYCODES\[action\]\)/)
  assert.match(mrpSource, /input: inputController/)
})
