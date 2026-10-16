// Service worker de GH Manager — guarda el "cascarón" de la app (HTML, JS,
// CSS, íconos) para que abra rápido y funcione sin señal. Los datos NO se
// guardan aquí: viven en la nube (Supabase).
const CACHE_NAME = 'gh-manager-v213';
const PREFIJO = CACHE_NAME.replace(/-v\d+.*$/, '');      // "gh-manager"
const CANAL = CACHE_NAME.endsWith('-prueba') ? '-prueba' : '';
const ARCHIVOS_CACHE = [
  './', './index.html', './app.js', './app.css', './manifest.json',
  './icon-192.png', './icon-512.png', './icon-maskable-192.png', './icon-maskable-512.png', './apple-touch-icon.png',
  './browser-storage.js', './supabase-storage.js', './vendor/supabase-2.117.1.min.js', './vendor/xlsx-0.18.5.full.min.js'
];

// Se descarga la versión nueva completa, pero NO se activa sola: espera a
// que el usuario toque "Actualizar" (así no se recarga a media tarea).
self.addEventListener('install', (evento) => {
  evento.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    await Promise.all(ARCHIVOS_CACHE.map(async (url) => {
      try {
        const r = await fetch(new Request(url, { cache: 'reload' }));
        if (r && r.ok) await cache.put(url, r);
      } catch (e) {}
    }));
  })());
});

self.addEventListener('message', (evento) => {
  if (evento.data === 'skip-waiting') self.skipWaiting();
});

// Solo borra copias viejas de ESTE mismo canal (la versión de prueba y la
// principal no se borran la una a la otra).
self.addEventListener('activate', (evento) => {
  evento.waitUntil((async () => {
    const nombres = await caches.keys();
    await Promise.all(nombres
      .filter((n) => n !== CACHE_NAME && n.startsWith(PREFIJO + '-v') && (CANAL ? n.endsWith(CANAL) : !n.endsWith('-prueba')))
      .map((n) => caches.delete(n)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (evento) => {
  if (evento.request.method !== 'GET') return;
  const url = new URL(evento.request.url);
  if (url.origin === 'https://fonts.googleapis.com' || url.origin === 'https://fonts.gstatic.com') {
    evento.respondWith((async () => {
      const cache = await caches.open('gh-fuentes-v1');
      const enCache = await cache.match(evento.request);
      if (enCache) return enCache;
      try {
        const r = await fetch(evento.request);
        if (r && (r.ok || r.type === 'opaque')) cache.put(evento.request, r.clone());
        return r;
      } catch (e) { return Response.error(); }
    })());
    return;
  }
  if (url.origin !== self.location.origin) return;
  // Copia de ESTA versión primero (todo el cascarón coincide entre sí: nunca
  // se mezcla un index.html nuevo con un app.js viejo); si no está, la red.
  evento.respondWith((async () => {
    const cache = await caches.open(CACHE_NAME);
    const enCache = await cache.match(evento.request, { ignoreSearch: true });
    if (enCache) return enCache;
    try {
      return await fetch(evento.request);
    } catch (e) {
      return (evento.request.mode === 'navigate' && await cache.match('./index.html')) || Response.error();
    }
  })());
});
