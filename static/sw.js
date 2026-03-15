/* =========================================================
   Booker Service Worker
   - Cache-first for static assets (CSS, JS, fonts, icons)
   - Network-first for API calls and HTML pages
   ========================================================= */

/* eslint-disable no-restricted-globals */
const CACHE_VERSION = 'booker-v1';
const STATIC_CACHE  = `${CACHE_VERSION}-static`;
const API_CACHE     = `${CACHE_VERSION}-api`;

const STATIC_ASSETS = [
  '/',
  '/login',
  '/static/css/md3.css',
  '/static/js/app.js',
  '/static/manifest.json',
  '/static/icons/icon-192.png',
  '/static/icons/icon-512.png',
  'https://fonts.googleapis.com/css2?family=Google+Sans:wght@400;500;700&family=Roboto:wght@400;500&display=swap',
];

// ── Install: pre-cache static shell ──────────────────────
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(STATIC_CACHE)
      .then(cache => cache.addAll(STATIC_ASSETS))
      .then(() => self.skipWaiting())
  );
});

// ── Activate: purge old caches ────────────────────────────
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys
          .filter(k => k.startsWith('booker-') && k !== STATIC_CACHE && k !== API_CACHE)
          .map(k => caches.delete(k))
      )
    ).then(() => self.clients.claim())
  );
});

// ── Fetch strategy ────────────────────────────────────────
self.addEventListener('fetch', event => {
  const { request } = event;
  const url = new URL(request.url);

  // Skip non-GET and cross-origin (except Google Fonts)
  if (request.method !== 'GET') return;
  if (url.origin !== location.origin && !url.hostname.includes('fonts.g')) return;

  // API requests → network-first, no offline cache for writes
  if (url.pathname.startsWith('/api/')) {
    event.respondWith(networkFirst(request, API_CACHE, 5000));
    return;
  }

  // Static assets → cache-first
  if (
    url.pathname.startsWith('/static/') ||
    url.hostname.includes('fonts.g')
  ) {
    event.respondWith(cacheFirst(request, STATIC_CACHE));
    return;
  }

  // HTML navigation → network-first, fall back to cached shell
  event.respondWith(networkFirst(request, STATIC_CACHE, 8000));
});

// ── Strategies ────────────────────────────────────────────
async function cacheFirst(request, cacheName) {
  const cached = await caches.match(request);
  if (cached) return cached;
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(cacheName);
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    return new Response('Offline – asset not cached', { status: 503 });
  }
}

async function networkFirst(request, cacheName, timeoutMs = 6000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(request, { signal: controller.signal });
    clearTimeout(timer);
    if (response.ok && cacheName === STATIC_CACHE) {
      const cache = await caches.open(cacheName);
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    clearTimeout(timer);
    const cached = await caches.match(request);
    if (cached) return cached;
    // Offline fallback for HTML navigation
    const shell = await caches.match('/');
    if (shell) return shell;
    return new Response(
      '<h1 style="font-family:sans-serif;padding:2rem">Booker is offline</h1>',
      { status: 503, headers: { 'Content-Type': 'text/html' } }
    );
  }
}
