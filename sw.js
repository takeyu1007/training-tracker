// @ts-check
/**
 * Service Worker: ネットワーク優先 (Network-First) + オフラインフォールバック。
 * 頻繁な機能追加や修正が即時反映されるよう、ネットワーク確認を優先する。
 */

const CACHE_VERSION = 'tt-v3';
const CACHE_NAME = `training-tracker-${CACHE_VERSION}`;

const APP_SHELL = [
  './',
  './index.html',
  './manifest.webmanifest',
  './styles/tokens.css',
  './styles/app.css',
  './fonts/outfit-latin.woff2',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-512.png',
  './icons/apple-touch-icon.png',
  './icons/favicon-32.png',
  './src/main.js',
  './src/model.js',
  './src/calc.js',
  './src/format.js',
  './src/storage.js',
  './src/store.js',
  './src/sound.js',
  './src/ui/tabs.js',
  './src/ui/timer.js',
  './src/ui/workout.js',
  './src/ui/nutrition.js',
  './src/ui/analytics.js',
  './src/ui/settings.js',
  './src/ui/toast.js',
];

self.addEventListener('install', (event) => {
  // @ts-ignore
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)).then(() => {
      // @ts-ignore
      return self.skipWaiting();
    }),
  );
});

self.addEventListener('activate', (event) => {
  // @ts-ignore
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys.map((key) => {
            if (key !== CACHE_NAME) {
              return caches.delete(key);
            }
          }),
        ),
      )
      .then(() => {
        // @ts-ignore
        return self.clients.claim();
      }),
  );
});

self.addEventListener('fetch', (event) => {
  // @ts-ignore
  const request = event.request;
  if (request.method !== 'GET') return;

  // @ts-ignore
  event.respondWith(
    fetch(request, { cache: 'no-cache' })
      .then((networkResponse) => {
        if (networkResponse && networkResponse.status === 200) {
          const responseToCache = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(request, responseToCache);
          });
        }
        return networkResponse;
      })
      .catch(async () => {
        const cached = await caches.match(request);
        if (cached) return cached;
        if (request.mode === 'navigate') {
          return caches.match('./index.html');
        }
        throw new Error('Network and cache failed');
      }),
  );
});
