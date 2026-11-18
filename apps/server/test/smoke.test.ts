import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

describe('小潮霸王 server layout', () => {
  it('has the web shell and simulator runtime', () => {
    const root = resolve(import.meta.dirname, '../../..')
    expect(existsSync(resolve(root, 'public/index.html'))).toBe(true)
    expect(existsSync(resolve(root, 'apps/web/src/runtime/J2MEPlayer.jsx'))).toBe(true)
    expect(existsSync(resolve(root, 'games/jar'))).toBe(true)
  })
})
