const loaded = new Map()

export function loadClassic(src) {
  if (loaded.has(src)) return loaded.get(src)
  const promise = new Promise((resolve, reject) => {
    const script = document.createElement('script')
    script.src = src
    script.async = false
    script.onload = () => resolve()
    script.onerror = () => reject(new Error(`加载运行时失败: ${src}`))
    document.head.appendChild(script)
  })
  loaded.set(src, promise)
  return promise
}

export function loadStyle(href) {
  if (document.querySelector(`link[data-runtime-style="${href}"]`)) return
  const link = document.createElement('link')
  link.rel = 'stylesheet'
  link.href = href
  link.dataset.runtimeStyle = href
  document.head.appendChild(link)
}
