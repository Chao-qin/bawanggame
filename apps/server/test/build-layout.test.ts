import { dirname, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import ts from 'typescript'
import { describe, expect, it } from 'vitest'

const serverRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')

describe('server build output layout', () => {
  it.each(['src-only Docker context', 'src and test checkout'])('emits dist/src/main.js for %s', context => {
    const configPath = resolve(serverRoot, 'tsconfig.json')
    const config = ts.readConfigFile(configPath, ts.sys.readFile)
    expect(config.error).toBeUndefined()
    const parsed = ts.parseJsonConfigFileContent(config.config, ts.sys, serverRoot)
    expect(parsed.errors).toEqual([])
    const roots = context === 'src-only Docker context'
      ? parsed.fileNames.filter(file => relative(serverRoot, file).startsWith('src/'))
      : parsed.fileNames
    expect(roots.some(file => file.endsWith('/test/nest-app.test.ts'))).toBe(context === 'src and test checkout')
    const program = ts.createProgram(roots, parsed.options)
    const emitted: string[] = []
    const result = program.emit(undefined, file => emitted.push(relative(serverRoot, file)))
    expect(result.emitSkipped).toBe(false)
    expect(emitted).toContain('dist/src/main.js')
    expect(emitted).toContain('dist/src/app.module.js')
    expect(emitted).not.toContain('dist/main.js')
  }, 30_000)
})
