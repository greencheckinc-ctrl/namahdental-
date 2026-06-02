// ============================================================
//  Namah Dental – Service Worker  (sw.js)
//  Cache-first for app shell, network-first for Firebase data
// ============================================================

const CACHE_NAME   = 'namah-dental-v1';
const CACHE_ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './icons/icon-192.png',
  './icons/icon-512.png'
];

// ── Install: pre-cache app shell ─────────────────────────────
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      return cache.addAll(CACHE_ASSETS);
    })
  );
  self.skipWaiting();
});

// ── Activate: delete old caches ──────────────────────────────
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys
          .filter(key => key !== CACHE_NAME)
          .map(key => caches.delete(key))
      )
    )
  );
  self.clients.claim();
});

// ── Fetch strategy ───────────────────────────────────────────
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);

  // ① Firebase / external APIs → network-only (don't cache)
  if (
    url.hostname.includes('firebaseio.com') ||
    url.hostname.includes('firebase.google') ||
    url.hostname.includes('googleapis.com') ||
    url.hostname.includes('gstatic.com') ||
    url.hostname.includes('firebasestorage') ||
    url.hostname.includes('identitytoolkit') ||
    url.protocol === 'chrome-extension:'
  ) {
    return; // let the browser handle it normally
  }

  // ② Non-GET requests → network-only
  if (event.request.method !== 'GET') return;

  // ③ Navigation requests (HTML pages) → network-first, cache fallback
  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request)
        .then(response => {
          if (response && response.status === 200) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
          }
          return response;
        })
        .catch(() => caches.match('./index.html'))
    );
    return;
  }

  // ④ Everything else (CSS, JS, images) → cache-first, network fallback
  event.respondWith(
    caches.match(event.request).then(cached => {
      if (cached) return cached;

      return fetch(event.request).then(response => {
        if (!response || response.status !== 200 || response.type === 'opaque') {
          return response;
        }
        const clone = response.clone();
        caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
        return response;
      });
    })
  );
});

// ── Background Sync: flush offline queue on reconnect ────────
self.addEventListener('sync', event => {
  if (event.tag === 'namah-sync') {
    // The app's own sync logic runs in the page; just notify all clients
    event.waitUntil(
      self.clients.matchAll().then(clients =>
        clients.forEach(client =>
          client.postMessage({ type: 'SYNC_NOW' })
        )
      )
    );
  }
});

// ── Push Notifications (optional – wired up if needed) ───────
self.addEventListener('push', event => {
  const data = event.data ? event.data.json() : {};
  const title   = data.title   || 'Namah Dental';
  const options = {
    body:    data.body    || 'You have a new notification.',
    icon:    data.icon    || './icons/icon-192.png',
    badge:   data.badge   || './icons/icon-72.png',
    data:    data.url     || '/',
    vibrate: [200, 100, 200]
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  event.waitUntil(
    clients.openWindow(event.notification.data || '/')
  );
});
