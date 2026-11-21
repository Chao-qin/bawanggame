import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import vm from 'node:vm'

const source = readFileSync(new URL('./keyboard-actions.js', import.meta.url), 'utf8')

test('classic installer attaches the canonical ESM catalog to the runtime session', () => {
  const window = { __XIAOCHAO_KEYBOARD_SESSION__: {} }
  vm.runInNewContext(source, { window })
  const actions = { j2me: { up: -1 }, mrp: { up: 12 } }
  assert.equal(window.KeyboardActions.install(actions), actions)
  assert.equal(window.__XIAOCHAO_KEYBOARD_SESSION__.actions, actions)
})

test('classic facade rejects a missing session and does not contain copied mappings', () => {
  const window = {}
  vm.runInNewContext(source, { window })
  assert.equal(window.KeyboardActions.install({}) , null)
  assert.equal(window.KeyboardActions.install, window.KeyboardActions.install)
  assert.doesNotMatch(source, /up\s*:\s*-1|up\s*:\s*12/)
})
