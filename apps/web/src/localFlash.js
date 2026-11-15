export const MAX_FLASH_BYTES = 64 * 1024 * 1024

const DB_NAME = 'flash-local'
const DB_VERSION = 1
const STORE_NAME = 'games'
const SWF_SIGNATURES = new Set(['FWS', 'CWS', 'ZWS'])
let databasePromise

function flashError(code, message) {
  const error = new Error(message)
  error.code = code
  return error
}

function database() {
  if (typeof indexedDB === 'undefined') return Promise.reject(flashError('storage_unavailable', '本机存储不可用'))
  if (databasePromise) return databasePromise
  databasePromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION)
    request.onupgradeneeded = () => {
      const store = request.result.objectStoreNames.contains(STORE_NAME)
        ? request.result.transaction.objectStore(STORE_NAME)
        : request.result.createObjectStore(STORE_NAME, { keyPath: 'id' })
      if (!store.indexNames.contains('dedupeKey')) store.createIndex('dedupeKey', 'dedupeKey', { unique: true })
    }
    request.onsuccess = () => {
      const db = request.result
      db.onversionchange = () => db.close()
      resolve(db)
    }
    request.onerror = () => reject(flashError('storage_unavailable', '无法打开本机 Flash 存储'))
    request.onblocked = () => reject(flashError('storage_blocked', '本机 Flash 存储正被其他页面占用'))
  })
  return databasePromise
}

function transaction(mode, operation) {
  return database().then((db) => new Promise((resolve, reject) => {
    let value
    let settled = false
    const tx = db.transaction(STORE_NAME, mode)
    try {
      value = operation(tx.objectStore(STORE_NAME))
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
  let hash = 2166136261
  for (const byte of new Uint8Array(bytes)) hash = Math.imul(hash ^ byte, 16777619)
  return `fnv-${(hash >>> 0).toString(16)}`
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
  const sourceUrl = normalizedUrl(url)
  let response
  try {
    response = await fetch(sourceUrl, { credentials: 'omit', redirect: 'follow', signal })
  } catch (cause) {
    if (cause?.name === 'AbortError') throw flashError('cancelled', '下载已取消')
    throw flashError('network_error', '无法下载 SWF，请检查网络或目标站点的 CORS 设置')
  }
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

export async function add({ name, description = '', source, sourceUrl = '', blob, dedupeKey }) {
  const cleanName = normalizeText(name)
  if (!cleanName) throw flashError('invalid_name', '请输入游戏名称')
  await validateSwf(blob)
  if (!['bundled', 'remote', 'file'].includes(source)) throw flashError('invalid_source', '请选择游戏来源')
  const key = String(dedupeKey || '')
  if (!key) throw flashError('invalid_source', '缺少游戏来源标识')
  const now = Date.now()
  return transaction('readwrite', (store) => {
    const existingRequest = store.index('dedupeKey').get(key)
    const result = new Promise((resolve, reject) => {
      existingRequest.onsuccess = () => {
        const existing = existingRequest.result
        const record = {
          id: existing?.id || randomId(),
          dedupeKey: key,
          source,
          sourceUrl: String(sourceUrl || ''),
          name: cleanName,
          description: normalizeText(description),
          data: blob,
          size: blob.size,
          addedAt: existing?.addedAt || now,
          updatedAt: now,
        }
        const request = store.put(record)
        request.onsuccess = () => resolve(record)
        request.onerror = () => reject(request.error || flashError('storage_error', '保存本机 Flash 游戏失败'))
      }
      existingRequest.onerror = () => reject(existingRequest.error || flashError('storage_error', '读取本机 Flash 游戏失败'))
    })
    return result
  })
}

export async function remove(id) {
  return transaction('readwrite', (store) => requestValue(store.delete(String(id))))
}

export async function addFromFile(file, metadata = {}) {
  const blob = await validateSwf(file)
  return add({
    ...metadata,
    source: 'file',
    sourceUrl: '',
    blob,
    dedupeKey: `sha256:${await digestHex(blob)}`,
  })
}

export async function addFromUrl(url, metadata = {}, signal) {
  const sourceUrl = normalizedUrl(url)
  const blob = await fetchSwf(sourceUrl, signal)
  return add({
    ...metadata,
    source: 'remote',
    sourceUrl,
    blob,
    dedupeKey: `url:${sourceUrl}`,
  })
}

export async function addBundled(file, metadata = {}) {
  const sourceUrl = `/flash/${encodeURIComponent(file)}`
  const blob = await fetchSwf(sourceUrl)
  return add({
    ...metadata,
    source: 'bundled',
    sourceUrl,
    blob,
    dedupeKey: `catalog:${file}`,
  })
}
