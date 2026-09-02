const GHRAB_SW_CONTRACT = 'ghrab-service-worker-v1';
const CACHE_NAME = 'ghrab-maturita-desk-v0.10.0-hf1';
const CACHE_PREFIXES = ['ghrab-maturita-desk-v'];
const CORE_ASSETS = [
  './',
  './index.html',
  './manifest.webmanifest',
  './ghrab-platform.consumer.json',
  './config/brand-manifest.json',
  './config/platform-manifest.json',
  './src/main.js',
  './src/content-import-bridge.js',
  './src/demo-content.js',
  './src/exam-engine.js',
  './src/notes.js',
  './src/content-validator.js',
  './src/content-pack.js',
  './src/content-pack-store.js',
  './src/review-model.js',
  './src/review-store.js',
  './src/review-patch.js',
  './src/fact-check.js',
  './src/net/read-limited.js',
  './src/device-runtime.js',
  './src/pilot.js',
  './src/session-coordinator.js',
  './src/providers/runtime.js',
  './src/providers/auth-lease.js',
  './src/providers/auth-provider.js',
  './src/providers/content-provider.js',
  './src/providers/registry.js',
  './src/styles.css',
  './assets/icons/app-mark.svg',
  './assets/icons/icon-32.png',
  './assets/icons/icon-48.png',
  './assets/icons/icon-72.png',
  './assets/icons/icon-96.png',
  './assets/icons/icon-128.png',
  './assets/icons/icon-180.png',
  './assets/icons/icon-192.png',
  './assets/icons/icon-512.png',
  './assets/icons/icon-maskable-512.png',
  './assets/demo/picture-a.svg',
  './assets/demo/picture-b.svg'
];

self.addEventListener('message', event => {
  if (['GHRAB_SKIP_WAITING', 'SKIP_WAITING'].includes(event.data?.type)) self.skipWaiting();
});

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    await cache.addAll(CORE_ASSETS);
  })());
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys
      .filter(key => CACHE_PREFIXES.some(prefix => key.startsWith(prefix)) && key !== CACHE_NAME)
      .map(key => caches.delete(key)));
    await self.clients.claim();
  })());
});

async function cacheFirstCore(request) {
  const cache = await caches.open(CACHE_NAME);
  const cached = await cache.match(canonicalCacheRequest(request), { ignoreSearch: true });
  if (cached) return cached;
  const response = await fetch(request, { cache: 'no-store' });
  if (response?.ok) await cache.put(canonicalCacheRequest(request), response.clone());
  return response;
}

async function networkFirstCore(request) {
  const cache = await caches.open(CACHE_NAME);
  try {
    const response = await fetch(request, { cache: 'no-store' });
    if (!response?.ok) throw new Error(`HTTP ${response?.status || 0}`);
    await cache.put(canonicalCacheRequest(request), response.clone());
    return response;
  } catch (error) {
    const cached = await cache.match(canonicalCacheRequest(request), { ignoreSearch: true });
    if (cached) return cached;
    throw error;
  }
}

async function navigationNetworkFirst(request, scopePath) {
  try {
    return await fetch(request, { cache: 'no-store' });
  } catch (error) {
    const url = new URL(request.url);
    const relative = relativeAssetPath(url, scopePath);
    const canonicalEntry = relative === './' || relative === './index.html';
    if (canonicalEntry) {
      const cache = await caches.open(CACHE_NAME);
      const fallback = await cache.match('./index.html', { ignoreSearch: true });
      if (fallback) return fallback;
    }
    return new Response('Maturita Desk: tato offline cesta není dostupná. Otevřete aplikaci z její hlavní adresy.', {
      status: 503,
      headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' }
    });
  }
}

function relativeAssetPath(url, scopePath) {
  if (!url.pathname.startsWith(scopePath)) return '';
  const tail = url.pathname.slice(scopePath.length);
  return tail ? `./${tail}` : './';
}

function isCoreAsset(url, scopePath) {
  return CORE_ASSETS.includes(relativeAssetPath(url, scopePath));
}

function canonicalCacheRequest(request) {
  const url = new URL(request.url);
  url.search = '';
  url.hash = '';
  return new Request(url.href, { method: 'GET', credentials: 'same-origin' });
}

function isProtectedOrRuntime(url, scopePath) {
  const relative = url.pathname.slice(scopePath.length);
  return /^(?:api|auth|session|health|content-pack|protected-content)(?:\/|$)/.test(relative) ||
    relative.endsWith('.mdesk') || relative.endsWith('.mdreview') ||
    relative === 'runtime-config.js' || relative === 'config/deployment.json';
}

self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  const scopePath = new URL('./', self.location.href).pathname;
  if (!url.pathname.startsWith(scopePath) || request.cache === 'no-store' || isProtectedOrRuntime(url, scopePath)) return;

  if (request.mode === 'navigate') {
    event.respondWith(navigationNetworkFirst(request, scopePath));
    return;
  }
  if (!isCoreAsset(url, scopePath)) return;
  if (url.pathname.endsWith('/manifest.webmanifest') || url.pathname.endsWith('/ghrab-platform.consumer.json')) {
    event.respondWith(networkFirstCore(request));
    return;
  }
  event.respondWith(cacheFirstCore(request));
});
