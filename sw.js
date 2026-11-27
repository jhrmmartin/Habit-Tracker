// Daymark Service Worker — Offline-First App Shell Cache
const CACHE_NAME = 'daymark-shell-v9';
const APP_SHELL = [
  './',
  './index.html',
  './manifest.webmanifest',
  './favicon.svg',
  './favicon.png',
  './apple-touch-icon.png',
  './css/tokens.css',
  './css/base.css',
  './css/layout.css',
  './css/components.css',
  './supabase-config.js',
  './js/security.js',
  './js/emojis.js',
  './js/store.js',
  './js/streaks.js',
  './js/sync.js',
  './js/ui/toast.js',
  './js/ui/dialogs.js',
  './js/ui/today.js',
  './js/ui/grid.js',
  './js/ui/charts.js',
  './js/ui/journal.js',
  './js/ui/keepsake.js',
  './js/ui/tour.js',
  './js/main.js'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting())
      .catch(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);

  // Never intercept Supabase auth/API/realtime or cross-origin mutations
  if (url.hostname.endsWith('.supabase.co') || url.pathname.includes('/rest/v1/') || url.pathname.includes('/auth/v1/')) {
    return;
  }

  // Same-origin app shell: stale-while-revalidate for fast loads + offline resilience
  if (url.origin === self.location.origin) {
    event.respondWith(
      caches.match(request, { ignoreSearch: request.mode === 'navigate' }).then((cached) => {
        const networkFetch = fetch(request)
          .then((res) => {
            if (res && res.ok && res.type === 'basic') {
              const copy = res.clone();
              caches.open(CACHE_NAME).then((cache) => cache.put(request, copy)).catch(() => {});
            }
            return res;
          })
          .catch(() => cached);
        if (cached) {
          event.waitUntil(networkFetch);
          return cached;
        }
        return networkFetch;
      })
    );
  }
});
