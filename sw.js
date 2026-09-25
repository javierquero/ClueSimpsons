const CACHE_NAME = 'clue-simpsons-v58';
const APP_SHELL = './index.html';

const ASSETS = [
  './',
  APP_SHELL,
  './tailwind.css',
  './styles.css',
  './js/app.js',
  './manifest.json',
  './dona.webp',
  './icon-192.png',
  './icon-512.png',
  './caja-clue-simpsons.webp',
  './Homer_Simpson_Revised.ttf',
  './Cartas/AsiloSpringfield.png',
  './Cartas/Azulino.png',
  './Cartas/BarradePlutonio.png',
  './Cartas/Blanco.png',
  './Cartas/Bolerama.png',
  './Cartas/CasadelosSimpsons.png',
  './Cartas/Collar.png',
  './Cartas/DonaEnvenenada.png',
  './Cartas/Dorso.png',
  './Cartas/ElCalabozodelAndroide.png',
  './Cartas/ELHolandesFrito.png',
  './Cartas/Escarlata.png',
  './Cartas/EstudiosKrustilu.png',
  './Cartas/GuanteExtensible.png',
  './Cartas/Honda.png',
  './Cartas/KwikEMart.png',
  './Cartas/MansionBurns.png',
  './Cartas/Moradillo.png',
  './Cartas/Mostaza.png',
  './Cartas/PlantaNuclear.png',
  './Cartas/Saxofon.png',
  './Cartas/Verdi.png'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => Promise.all(
      ASSETS.map(async asset => {
        const response = await fetch(asset, { cache: 'reload' });
        if (!response.ok) throw new Error(`No se pudo actualizar ${asset}`);
        await cache.put(asset, response);
      })
    ))
  );
});

self.addEventListener('message', event => {
  if (event.data?.type === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;

  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request).catch(() => caches.match(APP_SHELL))
    );
    return;
  }

  event.respondWith(
    caches.match(event.request).then(cached => {
      if (cached) return cached;

      return fetch(event.request).then(response => {
        if (response.ok || response.type === 'opaque') {
          const copy = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, copy));
        }
        return response;
      });
    })
  );
});
