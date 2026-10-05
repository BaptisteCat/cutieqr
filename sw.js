// Service worker : met toute l'application en cache pour un usage hors ligne.
// Stratégie « stale-while-revalidate » : réponse immédiate depuis le cache, mise à
// jour en arrière-plan. Changer VERSION à chaque publication purge l'ancien cache.
const VERSION = 'cutieqr-v3';

const ASSETS = [
  './',
  'index.html',
  'manifest.webmanifest',
  'css/kit/juritel-design.css',
  'css/kit/fonts.css',
  'css/kit/fonts/inter-latin.woff2',
  'css/kit/fonts/inter-latin-ext.woff2',
  'css/kit/fonts/playfair-display-italic-latin.woff2',
  'css/kit/fonts/playfair-display-italic-latin-ext.woff2',
  'css/kit/fonts/monsieur-la-doulaise-latin.woff2',
  'css/kit/fonts/monsieur-la-doulaise-latin-ext.woff2',
  'css/kit/fonts/bodoni-moda-latin.woff2',
  'css/kit/fonts/bodoni-moda-latin-ext.woff2',
  'css/styles.css',
  'js/app.js',
  'js/export.js',
  'js/payload.js',
  'js/presets.js',
  'js/render.js',
  'js/store.js',
  'js/sync.js',
  'js/theme.js',
  'vendor/qrcode.js',
  'vendor/jsQR.js',
  'vendor/jspdf.umd.min.js',
  'vendor/svg2pdf.umd.min.js',
  'icons/icon.svg',
  'icons/icon-180.png',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'icons/icon-maskable-512.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(VERSION).then((cache) => cache.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET' || new URL(request.url).origin !== self.location.origin) return;
  event.respondWith((async () => {
    const cache = await caches.open(VERSION);
    const cached = await cache.match(request, { ignoreSearch: true });
    const network = fetch(request)
      .then((response) => {
        if (response.ok) cache.put(request, response.clone());
        return response;
      })
      .catch(() => null);
    if (cached) {
      event.waitUntil(network);
      return cached;
    }
    const response = await network;
    if (response) return response;
    if (request.mode === 'navigate') return (await cache.match('index.html')) || Response.error();
    return Response.error();
  })());
});
