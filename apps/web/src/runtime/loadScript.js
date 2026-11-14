const loaded = new Map()
const loadedStyles = new Map()
const RUNTIME_VERSION = '20261114-5'

function versioned(src) {
  return `${src}${src.includes('?') ? '&' : '?'}v=${RUNTIME_VERSION}`
}

export function loadClassic(src) {
  const url = versioned(src)
  if (loaded.has(url)) return loaded.get(url)
  const promise = new Promise((resolve, reject) => {
    const script = document.createElement('script')
    script.src = url
    script.async = false
    script.onload = () => resolve()
    script.onerror = () => reject(new Error(`加载运行时失败: ${src}`))
    document.head.appendChild(script)
  })
  loaded.set(url, promise)
  return promise
}

export function loadStyle(href) {
  const url = versioned(href)
  const existing = document.querySelector(`link[data-runtime-style="${url}"]`)
  if (existing) {
    if (loadedStyles.has(url)) return loadedStyles.get(url)
    const promise = existing.sheet ? Promise.resolve() : new Promise((resolve, reject) => {
      existing.addEventListener('load', resolve, { once: true })
      existing.addEventListener('error', () => reject(new Error(`加载运行时样式失败: ${href}`)), { once: true })
    })
    loadedStyles.set(url, promise)
    promise.catch(() => {
      if (loadedStyles.get(url) === promise) loadedStyles.delete(url)
    })
    return promise
  }
  loadedStyles.delete(url)
  const link = document.createElement('link')
  link.rel = 'stylesheet'
  link.href = url
  link.dataset.runtimeStyle = url
  const promise = new Promise((resolve, reject) => {
    link.addEventListener('load', resolve, { once: true })
    link.addEventListener('error', () => reject(new Error(`加载运行时样式失败: ${href}`)), { once: true })
  })
  loadedStyles.set(url, promise)
  document.head.appendChild(link)
  promise.catch(() => {
    if (loadedStyles.get(url) === promise) loadedStyles.delete(url)
  })
  return promise
}
