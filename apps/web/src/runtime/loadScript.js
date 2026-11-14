const loaded = new Map()
const RUNTIME_VERSION = '20261114-2'

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
  if (document.querySelector(`link[data-runtime-style="${url}"]`)) return
  const link = document.createElement('link')
  link.rel = 'stylesheet'
  link.href = url
  link.dataset.runtimeStyle = url
  document.head.appendChild(link)
}
