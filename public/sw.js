const CACHE_NAME = 'cardforge-studio-v3'
const PUBLIC_FILES = ['favicon.svg', 'manifest.webmanifest']

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE_NAME)
      const scope = self.registration.scope
      await cache.add(scope)
      try {
        const response = await fetch(new URL('precache-manifest.json', scope), { cache: 'no-cache' })
        if (response.ok) {
          const files = await response.json()
          await cache.addAll([...files, ...PUBLIC_FILES].map((file) => new URL(file, scope).href))
        }
      } catch {
        // Installing while offline: runtime caching below fills the cache as files are requested.
      }
      await self.skipWaiting()
    })(),
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys()
      await Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key)))
      await self.clients.claim()
    })(),
  )
})

self.addEventListener('fetch', (event) => {
  const request = event.request
  if (request.method !== 'GET' || new URL(request.url).origin !== self.location.origin) return

  if (request.mode === 'navigate') {
    // Network first for the page so new deployments load; fall back to the cached shell offline.
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response.ok) void caches.open(CACHE_NAME).then((cache) => cache.put(self.registration.scope, response.clone()))
          return response
        })
        .catch(() => caches.match(self.registration.scope)),
    )
    return
  }

  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) return cached
      return fetch(request).then((response) => {
        if (response.ok) void caches.open(CACHE_NAME).then((cache) => cache.put(request, response.clone()))
        return response
      })
    }),
  )
})