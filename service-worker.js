// Service worker de GH Manager — guarda una copia local de la app
// para que abra rápido y funcione aunque no haya internet.
// Los datos NO se guardan aquí (eso vive en localStorage / futuro backend),
// solo el "cascarón" de la app (HTML, íconos).

const CACHE_NAME = 'gh-manager-v117';
const ARCHIVOS_CACHE = [
  './',
  './index.html',
  './manifest.json',
  './icon-192.png',
  './icon-512.png',
  './browser-storage.js',
  './supabase-storage.js'
];

// Al instalar se bajan los archivos SIN usar la copia vieja del navegador
// (cache: 'reload'); si no, GitHub Pages puede entregar la versión anterior
// por unos minutos y la "nueva" versión se quedaba con el código viejo.
// Cada archivo se guarda por separado: si uno falla, no se cae todo.
self.addEventListener('install', (evento) => {
  self.skipWaiting();
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

// Permite que la app fuerce la actualización al instante (botón "Actualizar")
self.addEventListener('message', (evento) => {
  if (evento.data === 'skip-waiting') self.skipWaiting();
});

self.addEventListener('activate', (evento) => {
  evento.waitUntil(
    caches.keys().then((nombres) =>
      Promise.all(
        nombres
          .filter((n) => n !== CACHE_NAME)
          .map((n) => caches.delete(n))
      )
    )
  );
  self.clients.claim();
});

// Estrategia: copia guardada primero (la app abre AL INSTANTE, incluso con
// señal débil), y en segundo plano busca una versión nueva para la próxima
// vez — el aviso "Hay una versión nueva de GH Manager" ya le dice al usuario
// cuándo actualizar (y a qué versión), así que no hace falta esperar la red
// en cada apertura.
// Solo aplica al "cascarón" de la app (mismo origen: HTML, JS, íconos).
// Las llamadas a Supabase y a Google Fonts son de OTRO dominio y van
// siempre directo a la red, sin pasar por aquí ni guardarse en caché.
self.addEventListener('fetch', (evento) => {
  if (evento.request.method !== 'GET') return;
  if (new URL(evento.request.url).origin !== self.location.origin) return;

  evento.respondWith((async () => {
    const cache = await caches.open(CACHE_NAME);
    const enCache = await cache.match(evento.request);

    // 'no-cache' = pregunta al servidor si cambió (rápido), en vez de usar
    // una copia vieja del navegador
    const buscarEnRed = fetch(evento.request, { cache: 'no-cache' })
      .then((respuesta) => {
        if (respuesta && respuesta.ok) cache.put(evento.request, respuesta.clone());
        return respuesta;
      })
      .catch(() => null);
    evento.waitUntil(buscarEnRed);  // que termine de guardar aunque ya hayamos respondido

    if (enCache) return enCache;                       // instantáneo
    return (await buscarEnRed) || cache.match('./index.html');  // primera vez / sin caché
  })());
});
