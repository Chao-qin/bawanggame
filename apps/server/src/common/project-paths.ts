import { basename, dirname, join, resolve } from 'node:path'

const parent = resolve(import.meta.dirname, '../..')
const serverRoot = basename(parent) === 'dist' ? dirname(parent) : parent

export const PROJECT_ROOT = resolve(serverRoot, '../..')
export const JARS_ROOT = join(PROJECT_ROOT, 'games', 'jar')
export const WEB_ROOT = join(PROJECT_ROOT, 'public')
export const MRP_ROOT = join(PROJECT_ROOT, 'maopao-revival', 'vendor', 'vmrp.github.io')
export const J2ME_ROOT = join(PROJECT_ROOT, 'runtime', 'j2me')
export const MRP_RUNTIME_ROOT = join(PROJECT_ROOT, 'runtime', 'mrp')
