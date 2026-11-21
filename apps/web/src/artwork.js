const maxBytes = 512 * 1024
const imageTypes = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/gif', 'image/avif'])

export function validArtwork(blob) {
  return blob instanceof Blob && blob.size > 0 && blob.size <= maxBytes && imageTypes.has(blob.type)
}

export async function fetchArtwork(value) {
  if (!value) return undefined
  try {
    const url = new URL(value, window.location.href)
    if (!['https:', 'http:'].includes(url.protocol)) return undefined
    const response = await fetch(url, { credentials: 'omit', signal: AbortSignal.timeout(4000) })
    const type = response.headers.get('content-type')?.split(';')[0].trim()
    if (!response.ok || !response.body || !imageTypes.has(type)) return undefined
    const reader = response.body.getReader()
    const chunks = []
    let size = 0
    try {
      for (;;) {
        const { done, value } = await reader.read()
        if (done) break
        size += value.byteLength
        if (size > maxBytes) {
          await reader.cancel()
          return undefined
        }
        chunks.push(value)
      }
    } finally {
      reader.releaseLock()
    }
    if (!size) return undefined
    const blob = new Blob(chunks, { type })
    const objectUrl = URL.createObjectURL(blob)
    try {
      const image = new Image()
      image.src = objectUrl
      await image.decode()
      return blob
    } finally {
      URL.revokeObjectURL(objectUrl)
    }
  } catch {
    return undefined
  }
}
