export const MAX_FLASH_BYTES = 64 * 1024 * 1024

const DB_NAME = 'flash-local'
const DB_VERSION = 1
const STORE_NAME = 'games'
const MAX_REDIRECTS = 5
const SWF_SIGNATURES = new Set(['FWS', 'CWS', 'ZWS'])
let databasePromise

const SHA256_K = [
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
]

function sha256Fallback(bytes) {
  const bitLength = bytes.length * 8
  const paddedLength = Math.ceil((bytes.length + 9) / 64) * 64
  const padded = new Uint8Array(paddedLength)
  padded.set(bytes)
  padded[bytes.length] = 0x80
  const view = new DataView(padded.buffer)
  view.setUint32(paddedLength - 4, bitLength >>> 0)
  let h0 = 0x6a09e667; let h1 = 0xbb67ae85; let h2 = 0x3c6ef372; let h3 = 0xa54ff53a
  let h4 = 0x510e527f; let h5 = 0x9b05688c; let h6 = 0x1f83d9ab; let h7 = 0x5be0cd19
  const w = new Uint32Array(64)
  const rotr = (value, amount) => (value >>> amount) | (value << (32 - amount))
  for (let offset = 0; offset < padded.length; offset += 64) {
    for (let i = 0; i < 16; i++) w[i] = view.getUint32(offset + i * 4)
    for (let i = 16; i < 64; i++) {
      const s0 = rotr(w[i - 15], 7) ^ rotr(w[i - 15], 18) ^ (w[i - 15] >>> 3)
      const s1 = rotr(w[i - 2], 17) ^ rotr(w[i - 2], 19) ^ (w[i - 2] >>> 10)
      w[i] = (w[i - 16] + s0 + w[i - 7] + s1) >>> 0
    }
    let a = h0; let b = h1; let c = h2; let d = h3; let e = h4; let f = h5; let g = h6; let h = h7
    for (let i = 0; i < 64; i++) {
      const s1 = rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25)
      const choose = (e & f) ^ (~e & g)
      const temp1 = (h + s1 + choose + SHA256_K[i] + w[i]) >>> 0
      const s0 = rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22)
      const majority = (a & b) ^ (a & c) ^ (b & c)
      const temp2 = (s0 + majority) >>> 0
      h = g; g = f; f = e; e = (d + temp1) >>> 0; d = c; c = b; b = a; a = (temp1 + temp2) >>> 0
    }
    h0 = (h0 + a) >>> 0; h1 = (h1 + b) >>> 0; h2 = (h2 + c) >>> 0; h3 = (h3 + d) >>> 0
    h4 = (h4 + e) >>> 0; h5 = (h5 + f) >>> 0; h6 = (h6 + g) >>> 0; h7 = (h7 + h) >>> 0
  }
  return [h0, h1, h2, h3, h4, h5, h6, h7].map((value) => value.toString(16).padStart(8, '0')).join('')
}

function flashError(code, message) {
  const error = new Error(message)
  error.code = code
  return error
}

function database() {
  if (typeof indexedDB === 'undefined') return Promise.reject(flashError('storage_unavailable', '本机存储不可用'))
  if (databasePromise) return databasePromise
  let openPromise
  const promise = new Promise((resolve, reject) => {
    let request
    const failOpen = (error) => {
      if (databasePromise === openPromise) databasePromise = undefined
      reject(error)
    }
    try {
      request = indexedDB.open(DB_NAME, DB_VERSION)
    } catch (_) {
      failOpen(flashError('storage_unavailable', '无法打开本机 Flash 存储'))
      return
    }
    request.onupgradeneeded = () => {
      const store = request.result.objectStoreNames.contains(STORE_NAME)
        ? request.result.transaction.objectStore(STORE_NAME)
        : request.result.createObjectStore(STORE_NAME, { keyPath: 'id' })
      if (!store.indexNames.contains('dedupeKey')) store.createIndex('dedupeKey', 'dedupeKey', { unique: true })
    }
    request.onsuccess = () => {
      const db = request.result
      db.onversionchange = () => {
        db.close()
        if (databasePromise === openPromise) databasePromise = undefined
      }
      resolve(db)
    }
    request.onerror = () => failOpen(flashError('storage_unavailable', '无法打开本机 Flash 存储'))
    request.onblocked = () => failOpen(flashError('storage_blocked', '本机 Flash 存储正被其他页面占用'))
  })
  openPromise = promise
  databasePromise = promise
  promise.catch(() => {
    if (databasePromise === promise) databasePromise = undefined
  })
  return databasePromise
}

function transaction(mode, operation) {
  return database().then((db) => new Promise((resolve, reject) => {
    let value
    let settled = false
    const tx = db.transaction(STORE_NAME, mode)
    try {
      value = Promise.resolve(operation(tx.objectStore(STORE_NAME)))
      value.catch(() => {})
    } catch (error) {
      reject(error)
      return
    }
    tx.oncomplete = () => {
      if (!settled) {
        settled = true
        resolve(value)
      }
    }
    tx.onerror = tx.onabort = () => {
      if (settled) return
      settled = true
      const cause = tx.error
      if (cause?.name === 'QuotaExceededError') reject(flashError('quota_exceeded', '本机存储空间不足'))
      else reject(flashError('storage_error', cause?.message || '本机 Flash 存储失败'))
    }
  }))
}

function requestValue(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error || flashError('storage_error', '读取本机 Flash 存储失败'))
  })
}

function normalizeText(value, fallback = '') {
  return String(value ?? '').trim().slice(0, 200) || fallback
}

function randomId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID()
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`
}

function normalizedUrl(value) {
  let url
  try { url = new URL(String(value), window.location.href) } catch (_) { throw flashError('invalid_url', '请输入有效的 SWF 地址') }
  if (!['http:', 'https:'].includes(url.protocol)) throw flashError('invalid_url', 'SWF 地址只能使用 HTTP 或 HTTPS')
  url.username = ''
  url.password = ''
  return url.href
}

async function digestHex(blob) {
  const bytes = await blob.arrayBuffer()
  if (typeof crypto !== 'undefined' && crypto.subtle) {
    const digest = await crypto.subtle.digest('SHA-256', bytes)
    return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('')
  }
  return sha256Fallback(new Uint8Array(bytes))
}

export async function validateSwf(blob) {
  if (!(blob instanceof Blob)) throw flashError('invalid_file', '请选择 SWF 文件')
  if (!blob.size) throw flashError('invalid_file', 'SWF 文件为空')
  if (blob.size > MAX_FLASH_BYTES) throw flashError('too_large', 'SWF 文件不能超过 64 MiB')
  const header = new Uint8Array(await blob.slice(0, 3).arrayBuffer())
  const signature = String.fromCharCode(...header)
  if (!SWF_SIGNATURES.has(signature)) throw flashError('invalid_swf', '文件不是有效的 SWF')
  return blob
}

export async function fetchSwf(url, signal) {
  let sourceUrl = normalizedUrl(url)
  let response
  for (let redirects = 0; redirects <= MAX_REDIRECTS; redirects++) {
    try {
      response = await fetch(sourceUrl, { credentials: 'omit', redirect: 'manual', signal })
    } catch (cause) {
      if (cause?.name === 'AbortError') throw flashError('cancelled', '下载已取消')
      throw flashError('network_error', '无法下载 SWF，请检查网络或目标站点的 CORS 设置')
    }
    if (response.status < 300 || response.status >= 400) break
    if (redirects === MAX_REDIRECTS) throw flashError('redirect_error', 'SWF 重定向次数过多')
    const location = response.headers.get('location')
    if (!location) throw flashError('redirect_error', 'SWF 重定向地址不可用')
    try { sourceUrl = normalizedUrl(new URL(location, sourceUrl).href) } catch (_) { throw flashError('redirect_error', 'SWF 重定向地址无效') }
  }
  if (!response) throw flashError('network_error', '无法下载 SWF')
  if (response.type === 'opaqueredirect') throw flashError('redirect_error', 'SWF 重定向需要目标站点允许跨域读取')
  if (!response.ok) throw flashError('http_error', `SWF 下载失败（HTTP ${response.status}）`)
  const length = Number(response.headers.get('content-length') || 0)
  if (length > MAX_FLASH_BYTES) throw flashError('too_large', 'SWF 文件不能超过 64 MiB')
  if (!response.body) return validateSwf(await response.blob())
  const reader = response.body.getReader()
  const chunks = []
  let total = 0
  try {
    while (true) {
      const part = await reader.read()
      if (part.done) break
      total += part.value.byteLength
      if (total > MAX_FLASH_BYTES) {
        await reader.cancel()
        throw flashError('too_large', 'SWF 文件不能超过 64 MiB')
      }
      chunks.push(part.value)
    }
  } finally {
    reader.releaseLock()
  }
  return validateSwf(new Blob(chunks, { type: response.headers.get('content-type') || 'application/x-shockwave-flash' }))
}

function validRecord(record) {
  return record && typeof record.id === 'string' && typeof record.dedupeKey === 'string' &&
    typeof record.name === 'string' && record.name && record.data instanceof Blob &&
    Number.isFinite(record.size) && record.size === record.data.size &&
    ['bundled', 'remote', 'file'].includes(record.source)
}

export async function list() {
  const rows = await transaction('readonly', (store) => requestValue(store.getAll()))
  const records = rows.filter(validRecord).sort((a, b) => b.addedAt - a.addedAt)
  return { records, skipped: rows.length - records.length }
}

export async function get(id) {
  const record = await transaction('readonly', (store) => requestValue(store.get(String(id))))
  if (!validRecord(record)) throw flashError('missing_record', '本机游戏不存在或已损坏')
  return record
}

function alreadyExists() {
  return flashError('already_exists', '该游戏已安装过')
}

export async function has(dedupeKey) {
  const key = await transaction('readonly', (store) => requestValue(store.index('dedupeKey').getKey(dedupeKey)))
  return key !== undefined
}

export async function add({ name, description = '', source, sourceUrl = '', blob, dedupeKey, artwork }) {
  const cleanName = normalizeText(name)
  if (!cleanName) throw flashError('invalid_name', '请输入游戏名称')
  await validateSwf(blob)
  if (!['bundled', 'remote', 'file'].includes(source)) throw flashError('invalid_source', '请选择游戏来源')
  const key = String(dedupeKey || '')
  if (!key) throw flashError('invalid_source', '缺少游戏来源标识')
  const now = Date.now()
  const record = await transaction('readwrite', (store) => {
    const existingRequest = store.index('dedupeKey').get(key)
    const result = new Promise((resolve, reject) => {
      existingRequest.onsuccess = () => {
        if (existingRequest.result) {
          resolve(null)
          return
        }
        const record = {
          id: randomId(),
          dedupeKey: key,
          source,
          sourceUrl: String(sourceUrl || ''),
          name: cleanName,
          description: normalizeText(description),
          data: blob,
          artwork,
          size: blob.size,
          addedAt: now,
          updatedAt: now,
        }
        const request = store.add(record)
        request.onsuccess = () => resolve(record)
        request.onerror = () => reject(request.error || flashError('storage_error', '保存本机 Flash 游戏失败'))
      }
      existingRequest.onerror = () => reject(existingRequest.error || flashError('storage_error', '读取本机 Flash 游戏失败'))
    })
    return result
  })
  if (!record) throw alreadyExists()
  return record
}

export async function remove(id) {
  return transaction('readwrite', (store) => requestValue(store.delete(String(id))))
}

export async function fillArtwork(id, artwork) {
  if (!artwork) return
  return transaction('readwrite', async (store) => {
    const record = await requestValue(store.get(String(id)))
    if (validRecord(record) && !record.artwork) {
      await requestValue(store.put({ ...record, artwork }))
    }
  })
}

export async function addFromFile(file, metadata = {}) {
  const blob = await validateSwf(file)
  const dedupeKey = `sha256:${await digestHex(blob)}`
  if (await has(dedupeKey)) throw alreadyExists()
  return add({
    ...metadata,
    source: 'file',
    sourceUrl: '',
    blob,
    dedupeKey,
  })
}

export async function addFromUrl(url, metadata = {}, signal) {
  const sourceUrl = normalizedUrl(url)
  const dedupeKey = `url:${sourceUrl}`
  if (await has(dedupeKey)) throw alreadyExists()
  const blob = await fetchSwf(sourceUrl, signal)
  return add({
    ...metadata,
    source: 'remote',
    sourceUrl,
    blob,
    dedupeKey,
  })
}

export async function addBundled(file, metadata = {}, catalogId = file) {
  const sourceUrl = `/flash/${encodeURIComponent(file)}`
  const dedupeKey = `catalog:${catalogId}`
  if (await has(dedupeKey)) throw alreadyExists()
  const blob = await fetchSwf(sourceUrl)
  return add({
    ...metadata,
    source: 'bundled',
    sourceUrl,
    blob,
    dedupeKey,
  })
}
