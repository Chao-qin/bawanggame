const CACHE = 'xiaochao-bawang-v2'

self.addEventListener('install', () => self.skipWaiting())

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(key => key !== CACHE).map(key => caches.delete(key))))
      .then(() => self.clients.claim()),
  )
})

self.addEventListener('fetch', event => {
  const request = event.request
  if (request.method !== 'GET' || new URL(request.url).origin !== self.location.origin) return

  // HTML and JSON must always see the current app/runtime state.
  if (request.mode === 'navigate' || request.url.endsWith('.json')) {
    event.respondWith(fetch(request).catch(() => caches.match(request)))
    return
  }

  event.respondWith(
    caches.match(request).then(cached => cached || fetch(request).then(response => {
      // Only successful responses: this is cache-first, so a cached 404 or 500 from a deploy or a restart
      // would be served for that runtime file from then on.
      if (response.ok && response.type === 'basic') {
        const copy = response.clone()
        caches.open(CACHE).then(cache => cache.put(request, copy))
      }
      return response
    })),
  )
})
