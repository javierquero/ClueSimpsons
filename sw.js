const CACHE_NAME = 'clue-simpsons-v38';
const ASSETS = [
  './index.html',
  './manifest.json',
  './dona.png',
  './icon-192.png',
  './icon-512.png',
  './caja-clue-simpsons.png',
  './Homer_Simpson_Revised.ttf'
];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', e => {
  e.respondWith(
    caches.match(e.request).then(cached => cached || fetch(e.request).catch(() => caches.match('./index.html')))
  );
});
