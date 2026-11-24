import assert from 'node:assert/strict'
import test from 'node:test'
import { flashPlayerBox } from './flash-player-box.js'

const box = { width: 400, height: 600 }
const movie = { width: 800, height: 600 }

test('whole picture: the movie fits inside the box, centred', () => {
  assert.deepEqual(flashPlayerBox('contain', box, movie), { left: 0, top: 150, width: 400, height: 300 })
})

test('fill the width or the height: that axis fills the box, the other is centred and may overflow', () => {
  assert.deepEqual(flashPlayerBox('width', box, movie), { left: 0, top: 150, width: 400, height: 300 })
  assert.deepEqual(flashPlayerBox('height', box, movie), { left: -200, top: 0, width: 800, height: 600 })
})

test('no movie size yet: no box (the player keeps filling its host)', () => {
  assert.equal(flashPlayerBox('contain', box, null), null)
})
