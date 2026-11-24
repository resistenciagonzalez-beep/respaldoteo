/*
 * Service worker de Familia Teo - Bolillero Virtual.
 *
 * Qué hace (y qué NO hace):
 * - La página siempre se pide primero a internet. Solo si no hay señal se usa la
 *   última copia guardada, para que la plataforma abra igual.
 * - Los archivos de la plataforma (/assets/...) nunca cambian de contenido, así que
 *   se guardan y se reutilizan (abre más rápido).
 * - Las letras (Google Fonts) y los íconos se guardan para usarlos sin señal.
 * - NO toca Firebase ni ningún dato: las partidas siguen guardándose como siempre.
 * - /version.json nunca se guarda (es el que avisa "Hay una versión nueva").
 */
const VERSION = 'v1';
const PAGE_CACHE = 'teo-pagina-' + VERSION;
const ASSET_CACHE = 'teo-archivos-' + VERSION;
const FONT_CACHE = 'teo-letras-' + VERSION;
const KNOWN_CACHES = [PAGE_CACHE, ASSET_CACHE, FONT_CACHE];
const MAX_ASSETS = 80;
const NETWORK_TIMEOUT_MS = 5000;

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(PAGE_CACHE)
      .then((cache) => cache.addAll(['/', '/manifest.webmanifest', '/icons/icon-192.png']))
      .catch(() => undefined)
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith('teo-') && !KNOWN_CACHES.includes(k)).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

function withTimeout(promise, ms) {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('timeout')), ms);
    promise.then(
      (v) => {
        clearTimeout(t);
        resolve(v);
      },
      (e) => {
        clearTimeout(t);
        reject(e);
      }
    );
  });
}

async function trimCache(cacheName, max) {
  const cache = await caches.open(cacheName);
  const keys = await cache.keys();
  for (let i = 0; i < keys.length - max; i++) await cache.delete(keys[i]);
}

// Página: primero internet; sin señal, la última copia guardada
async function handleNavigation(request) {
  const cache = await caches.open(PAGE_CACHE);
  try {
    const response = await withTimeout(fetch(request), NETWORK_TIMEOUT_MS);
    if (response && response.ok) cache.put('/', response.clone()).catch(() => undefined);
    return response;
  } catch (err) {
    const cached = (await cache.match('/')) || (await cache.match(request));
    if (cached) return cached;
    throw err;
  }
}

// Archivos con nombre único (/assets/...): primero la copia guardada
async function handleAsset(request) {
  const cache = await caches.open(ASSET_CACHE);
  const cached = await cache.match(request);
  if (cached) return cached;
  const response = await fetch(request);
  if (response && response.ok) {
    cache.put(request, response.clone()).then(() => trimCache(ASSET_CACHE, MAX_ASSETS)).catch(() => undefined);
  }
  return response;
}

// Letras e íconos: se usa la copia guardada y se actualiza por detrás
async function handleStaleWhileRevalidate(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);
  const network = fetch(request)
    .then((response) => {
      if (response && (response.ok || response.type === 'opaque')) cache.put(request, response.clone()).catch(() => undefined);
      return response;
    })
    .catch(() => cached);
  return cached || network;
}

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);

  // Google Fonts
  if (url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com') {
    event.respondWith(handleStaleWhileRevalidate(request, FONT_CACHE));
    return;
  }

  // Todo lo demás de otros sitios (Firebase, Google, etc.) no se toca
  if (url.origin !== self.location.origin) return;
  if (url.pathname === '/version.json' || url.pathname === '/sw.js') return;

  if (request.mode === 'navigate') {
    event.respondWith(handleNavigation(request));
    return;
  }
  if (url.pathname.startsWith('/assets/')) {
    event.respondWith(handleAsset(request));
    return;
  }
  if (url.pathname.startsWith('/icons/') || url.pathname === '/manifest.webmanifest') {
    event.respondWith(handleStaleWhileRevalidate(request, PAGE_CACHE));
  }
});
