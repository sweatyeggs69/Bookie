/* =========================================================
   Bookie Service Worker
   - Cache-first for static assets (CSS, JS, fonts, icons)
   - Network-first for HTML pages; API calls are not intercepted
   ========================================================= */

/* eslint-disable no-restricted-globals */
const CACHE_VERSION = 'bookie-v2';
const STATIC_CACHE  = `${CACHE_VERSION}-static`;
const API_CACHE     = `${CACHE_VERSION}-api`;

// Only files that actually exist: cache.addAll() rejects if any request
// fails, which previously made every install of this worker fail.
const STATIC_ASSETS = [
  '/',
  '/static/site.webmanifest',
  '/static/favicon.png',
  '/static/icon-192.png',
  '/static/icon-512.png',
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
          .filter(k => k.startsWith('bookie-') && k !== STATIC_CACHE && k !== API_CACHE)
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

  // API requests go straight to the network. Routing them through
  // networkFirst() aborted slow calls (metadata search, update check) after a
  // few seconds and answered with the cached HTML shell instead of JSON.
  if (url.pathname.startsWith('/api/')) return;

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
      '<h1 style="font-family:sans-serif;padding:2rem">Bookie is offline</h1>',
      { status: 503, headers: { 'Content-Type': 'text/html' } }
    );
  }
}
