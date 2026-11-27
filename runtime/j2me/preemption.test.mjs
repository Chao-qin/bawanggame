import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import vm from 'node:vm'

// Loads the VM core (bld/native.js provides ASM and the Relooper) without a page, enough to analyse and compile methods.
function loadVm() {
  const context = { config: {}, debugString: 0, console, performance, TextDecoder, TextEncoder }
  context.window = context
  vm.createContext(context)
  for (const file of ['bld/native.js', 'bld/j2me.js']) {
    vm.runInContext(readFileSync(new URL(file, import.meta.url), 'utf8'), context, { filename: file })
  }
  return context.J2ME
}

// A class file `Loop extends java/lang/Object` whose static (I)V methods have the given bytecode.
function classFile(methods) {
  const pool = []
  const u2 = (value) => [value >> 8 & 0xff, value & 0xff]
  const u4 = (value) => [...u2(value >>> 16), ...u2(value & 0xffff)]
  const utf8 = (text) => { pool.push([1, ...u2(text.length), ...Buffer.from(text)]); return pool.length }
  const classRef = (name) => { const index = utf8(name); pool.push([7, ...u2(index)]); return pool.length }
  const self = classRef('Loop')
  const parent = classRef('java/lang/Object')
  const code = utf8('Code')
  const signature = utf8('(I)V')
  const bodies = Object.entries(methods).map(([name, bytes]) => {
    const attribute = [...u2(1), ...u2(1), ...u4(bytes.length), ...bytes, ...u2(0), ...u2(0)]
    return [...u2(0x0009), ...u2(utf8(name)), ...u2(signature), ...u2(1), ...u2(code), ...u4(attribute.length), ...attribute]
  })
  return new Uint8Array([
    0xca, 0xfe, 0xba, 0xbe, ...u2(3), ...u2(45), ...u2(pool.length + 1), ...pool.flat(),
    ...u2(0x0021), ...u2(self), ...u2(parent), ...u2(0), ...u2(0), ...u2(bodies.length), ...bodies.flat(), ...u2(0),
  ])
}

const IFEQ = 0x99
const IFNE = 0x9a
const ILOAD_0 = 0x1a
const ICONST_0 = 0x03
const POP = 0x57
const RETURN = 0xb1
const NONE = 0
const LIKELY = 7

const J2ME = loadVm()
const loop = new J2ME.ClassInfo(classFile({
  // while (n != 0) {}  -- a busy-wait that calls nothing.
  spin: [ILOAD_0, IFNE, 0xff, 0xff, RETURN],
  // if (n == 0) return; return;  -- forward branches only.
  straight: [ILOAD_0, IFEQ, 0x00, 0x04, RETURN, RETURN],
  // The same busy-wait after two instructions, so its loop header is not the method entry.
  spinLater: [ICONST_0, POP, ILOAD_0, IFNE, 0xff, 0xff, RETURN],
}))
const method = (name) => loop.getLocalMethodByNameString(name, '(I)V')

test('a small loop that calls nothing can be preempted', () => {
  assert.equal(J2ME.canYield(method('spin')), LIKELY)
})

test('a method without a backward branch still cannot yield', () => {
  assert.equal(J2ME.canYield(method('straight')), NONE)
})

test('compiled code checks for preemption at a loop header, not only on entry', () => {
  const body = J2ME.baselineCompileMethod(method('spinLater'), 0 /* Runtime */).body
  assert.equal(body.match(/PE\(\)/g)?.length, 2, body)
})
