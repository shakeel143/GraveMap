// ═══════════════════════════════════════════════════════════════
//  GraveMap Service Worker — PWA / Offline Mode
//  Strategy:
//    - App Shell (HTML, CSS, JS, fonts): Cache-first
//    - Firebase / API calls: Network-first with cache fallback
//    - Map tiles: Cache-first with network fallback (tile size limit)
// ═══════════════════════════════════════════════════════════════

const CACHE_VERSION = 'gravemap-v1';
const TILE_CACHE = 'gravemap-tiles-v1';

// Core app shell assets to precache on install
const APP_SHELL = [
  './',
  'index.html',
  'css/style.css',
  'js/app.js',
  'manifest.json',
  'favicon.png',
  // Leaflet
  'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css',
  'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js',
  // Leaflet Geoman
  'https://unpkg.com/@geoman-io/leaflet-geoman-free@2.16.0/dist/leaflet-geoman.css',
  'https://unpkg.com/@geoman-io/leaflet-geoman-free@2.16.0/dist/leaflet-geoman.min.js',
  // QR Code lib
  'https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js',
  // Google Fonts
  'https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;600;700;800&display=swap'
];

// ─── INSTALL: precache app shell ────────────────────────────────
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_VERSION).then(cache => {
      // Use individual adds so one failure doesn't block everything
      return Promise.allSettled(
        APP_SHELL.map(url => cache.add(url).catch(err => {
          console.warn('[SW] Failed to cache:', url, err);
        }))
      );
    }).then(() => {
      console.log('[SW] App shell cached. Skipping waiting.');
      return self.skipWaiting();
    })
  );
});

// ─── ACTIVATE: clean up old caches ──────────────────────────────
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys
          .filter(key => key !== CACHE_VERSION && key !== TILE_CACHE)
          .map(key => {
            console.log('[SW] Deleting old cache:', key);
            return caches.delete(key);
          })
      )
    ).then(() => {
      console.log('[SW] Activated. Claiming clients.');
      return self.clients.claim();
    })
  );
});

// ─── FETCH: routing logic ────────────────────────────────────────
self.addEventListener('fetch', event => {
  const { request } = event;
  const url = new URL(request.url);

  // Skip non-GET requests
  if (request.method !== 'GET') return;

  // Skip Chrome extensions and devtools
  if (!url.protocol.startsWith('http')) return;

  // ── Firebase / Google APIs: Network-first, cache fallback ──
  if (
    url.hostname.includes('firebase') ||
    url.hostname.includes('firebaseio') ||
    url.hostname.includes('googleapis.com') ||
    url.hostname.includes('gstatic.com')
  ) {
    event.respondWith(networkFirstWithFallback(request, CACHE_VERSION));
    return;
  }

  // ── Map tiles: Cache-first (tiles don't change) ──
  if (
    url.hostname.includes('arcgisonline.com') ||
    url.hostname.includes('tile.openstreetmap.org') ||
    url.hostname.includes('tiles.stadiamaps.com') ||
    url.pathname.match(/\/tile\/|\.png$|\.jpg$|\.jpeg$|\.webp$/)
  ) {
    event.respondWith(cacheFirstWithNetwork(request, TILE_CACHE));
    return;
  }

  // ── App shell: Cache-first ──
  event.respondWith(cacheFirstWithNetwork(request, CACHE_VERSION));
});

// ─── Strategy: Cache-first, fall back to network ────────────────
async function cacheFirstWithNetwork(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);
  if (cached) return cached;

  try {
    const networkResponse = await fetch(request);
    if (networkResponse && networkResponse.status === 200) {
      // Don't cache opaque responses for tiles (can fill storage)
      if (cacheName === TILE_CACHE && networkResponse.type === 'opaque') {
        return networkResponse;
      }
      cache.put(request, networkResponse.clone());
    }
    return networkResponse;
  } catch (err) {
    console.warn('[SW] Fetch failed (offline?):', request.url);
    // Return offline page for navigation requests
    if (request.mode === 'navigate') {
      const offlinePage = await cache.match('/index.html');
      if (offlinePage) return offlinePage;
    }
    throw err;
  }
}

// ─── Strategy: Network-first, fall back to cache ────────────────
async function networkFirstWithFallback(request, cacheName) {
  try {
    const networkResponse = await fetch(request);
    if (networkResponse && networkResponse.status === 200) {
      const cache = await caches.open(cacheName);
      cache.put(request, networkResponse.clone());
    }
    return networkResponse;
  } catch (err) {
    const cache = await caches.open(cacheName);
    const cached = await cache.match(request);
    if (cached) return cached;
    throw err;
  }
}

// ─── Message handler: force update from client ──────────────────
self.addEventListener('message', event => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
  if (event.data && event.data.type === 'CLEAR_CACHE') {
    caches.keys().then(keys =>
      Promise.all(keys.map(key => caches.delete(key)))
    ).then(() => {
      event.source.postMessage({ type: 'CACHE_CLEARED' });
    });
  }
});
