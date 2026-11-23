import assert from 'node:assert/strict'
import test from 'node:test'
import { hitTest, keyUnits, WHEEL_HUB, wheelDirections, wheelGeometry } from './hit-test.js'
import { getLayout, T9_LANDSCAPE, T9_PORTRAIT } from './layouts.js'

const layout = getLayout(T9_PORTRAIT)
const wheel = layout.keys.find(({ shape }) => shape === 'wheel')
const { cx, cy, radius } = wheelGeometry(wheel)
// A point on the wheel at `degrees` (screen space: 0 right, 90 down) and `fraction` of its radius.
const at = (degrees, fraction = 0.7) => [cx + Math.cos((degrees * Math.PI) / 180) * radius * fraction, cy + Math.sin((degrees * Math.PI) / 180) * radius * fraction]
const parts = (target) => target.units.map((id) => id.split(':')[1])
const land = (degrees, fraction) => hitTest(layout, ...at(degrees, fraction))

test('main directions own 60° sectors, diagonals the 30° between them and hold both neighbours', () => {
  assert.deepEqual(parts(land(270)), ['up'])
  assert.deepEqual(parts(land(270 + 28)), ['up'], 'still up near the sector edge')
  assert.deepEqual(parts(land(0)), ['right'])
  assert.deepEqual(parts(land(90)), ['down'])
  assert.deepEqual(parts(land(180)), ['left'])
  assert.deepEqual(parts(land(315)), ['up', 'right'])
  assert.deepEqual(parts(land(45)), ['down', 'right'])
  assert.deepEqual(parts(land(135)), ['down', 'left'])
  assert.deepEqual(parts(land(225)), ['up', 'left'])
  assert.deepEqual(parts(land(225, 0.98)), ['up', 'left'], 'out to the rim')
})

test('sector edges have hysteresis so a finger on the edge does not flicker', () => {
  // 33° from up: past the plain edge (30°) into up-right, but a finger already on up keeps it until 36°.
  assert.deepEqual(wheelDirections(270 + 33), ['up', 'right'])
  assert.deepEqual(wheelDirections(270 + 33, ['up']), ['up'])
  assert.deepEqual(wheelDirections(270 + 37, ['up']), ['up', 'right'])
  // And a finger on the diagonal keeps it out to 21° from its centre.
  assert.deepEqual(wheelDirections(315 - 19, ['up', 'right']), ['up', 'right'])
  assert.deepEqual(wheelDirections(315 - 22, ['up', 'right']), ['up'])
})

test('the hub confirms only for a touch that lands on it', () => {
  const landed = land(0, 0.1)
  assert.deepEqual(parts(landed), ['center'])
  assert.equal(landed.hub, true)
  const slidOut = hitTest(layout, ...at(0, 0.7), landed)
  assert.deepEqual(parts(slidOut), ['right'])
  assert.deepEqual(parts(hitTest(layout, ...at(0, 0.1), slidOut)), ['center'], 'back onto the hub it started on')
  const fromDirection = land(0, 0.7)
  assert.deepEqual(parts(hitTest(layout, ...at(0, WHEEL_HUB * 0.5), fromDirection)), [], 'sliding in from a direction does not confirm')
})

test('a finger steering the wheel keeps it past the rim, ahead of the keys beside it', () => {
  const steering = land(0, 0.8)
  const drifted = hitTest(layout, ...at(0, 1.15), steering)
  assert.equal(drifted.keyId, 'dpad')
  assert.deepEqual(parts(drifted), ['right'])
  const landing = hitTest(layout, ...at(0, 1.15))
  assert.notEqual(landing.keyId, 'dpad', 'a touch landing there is not on the wheel')
  assert.equal(hitTest(layout, ...at(0, 1.6), steering).keyId === 'dpad', false, 'far beyond the rim it lets go')
})

test('rectangular keys press inside, nothing between keys, and slide from key to key', () => {
  const five = layout.keys.find(({ id }) => id === 'num5')
  const six = layout.keys.find(({ id }) => id === 'num6')
  const onFive = hitTest(layout, five.x + five.width / 2, five.y + five.height / 2)
  assert.deepEqual(onFive.units, ['num5'])
  const gap = hitTest(layout, five.x + five.width + 0.05, five.y + five.height / 2, onFive)
  assert.deepEqual(gap, { keyId: null, units: [], hub: false })
  assert.deepEqual(hitTest(layout, six.x + 0.2, six.y + 0.2, gap).units, ['num6'])
})

test('wheel units carry the runtime actions', () => {
  for (const id of [T9_PORTRAIT, T9_LANDSCAPE]) {
    const key = getLayout(id).keys.find(({ shape }) => shape === 'wheel')
    assert.deepEqual(keyUnits(key).map(({ id: unitId, value }) => [unitId, value]), [
      ['dpad:up', 'up'], ['dpad:down', 'down'], ['dpad:left', 'left'], ['dpad:right', 'right'], ['dpad:center', 'ok'],
    ])
  }
  const plain = layout.keys.find(({ id }) => id === 'num1')
  assert.deepEqual(keyUnits(plain).map(({ id: unitId, value }) => [unitId, value]), [['num1', 'num1']])
})
