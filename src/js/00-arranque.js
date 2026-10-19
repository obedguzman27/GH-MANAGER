  // Versión visible de la app (build.mjs pone el número).
  window.GH_APP_VERSION = '__APP_VERSION__';

  // ---- Service worker (instalación PWA + abrir sin internet) ----
  // La versión nueva NO se instala sola a media tarea (antes la app se
  // recargaba sin avisar y se perdía lo que estabas escribiendo): se descarga
  // en segundo plano y aparece un aviso; se aplica cuando tocas "Actualizar".
  // En la app del App Store (Capacitor) los archivos ya vienen dentro: sin service worker.
  window.GH_ES_APP_NATIVA = !!(window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform());
  if ('serviceWorker' in navigator && !window.GH_ES_APP_NATIVA) {
    window.addEventListener('load', () => {
      let pedidaPorUsuario = false;
      navigator.serviceWorker.register('service-worker.js').then((reg) => {
        const revisar = () => reg.update().catch(() => {});
        revisar();
        document.addEventListener('visibilitychange', () => { if (!document.hidden) revisar(); });
        if (reg.waiting && navigator.serviceWorker.controller) mostrarAvisoActualizacion(reg);
        reg.addEventListener('updatefound', () => {
          const nuevo = reg.installing;
          if (!nuevo) return;
          nuevo.addEventListener('statechange', () => {
            if (nuevo.state === 'installed' && navigator.serviceWorker.controller) mostrarAvisoActualizacion(reg);
          });
        });
      }).catch(() => {});
      window.GH_PEDIR_ACTUALIZACION = () => { pedidaPorUsuario = true; };
      let recargado = false;
      navigator.serviceWorker.addEventListener('controllerchange', () => {
        if (recargado || !pedidaPorUsuario) return;
        recargado = true;
        window.location.reload();
      });
    });
  }

  async function mostrarAvisoActualizacion(reg) {
    if (document.getElementById('aviso-update')) return;
    let versionNueva = '';
    try {
      const nombres = await caches.keys();
      for (const n of nombres) {
        const resp = await (await caches.open(n)).match('./app.js', { ignoreSearch: true });
        if (!resp) continue;
        const m = (await resp.clone().text()).match(/GH_APP_VERSION\s*=\s*'([^']+)'/);
        if (m && m[1] && m[1] !== window.GH_APP_VERSION) { versionNueva = m[1]; break; }
      }
    } catch (e) {}
    const barra = document.createElement('div');
    barra.id = 'aviso-update';
    barra.className = 'gh-aviso-update';
    barra.innerHTML = '<span></span><button type="button">Actualizar</button>';
    barra.querySelector('span').textContent = 'Hay una versión nueva de GH Manager' + (versionNueva ? ` (${versionNueva})` : '');
    barra.querySelector('button').addEventListener('click', () => {
      // Si hay cambios guardándose todavía, esperar a que terminen
      const listo = (window.GH_SYNC && window.GH_SYNC.esperarGuardado) ? window.GH_SYNC.esperarGuardado(8000) : Promise.resolve();
      barra.querySelector('button').textContent = 'Actualizando…';
      listo.then(() => {
        if (window.GH_PEDIR_ACTUALIZACION) window.GH_PEDIR_ACTUALIZACION();
        navigator.serviceWorker.getRegistration().then((r) => {
          const w = (r && r.waiting) || (reg && reg.waiting);
          if (w) w.postMessage('skip-waiting'); else window.location.reload();
          setTimeout(() => window.location.reload(), 3000);
        });
      });
    });
    document.body.appendChild(barra);
  }

  // ---- Almacenamiento ----
  // window.storage lo define supabase-storage.js (la nube). Antes, si la nube
  // fallaba, esto guardaba en el teléfono "a escondidas" y decía que sí se
  // guardó: luego la nube devolvía lo viejo y los cambios "desaparecían".
  // Ahora los fallos de la nube los maneja la cola de supabase-storage.js
  // (se reintenta solo y se ve en el indicador de guardado). Solo si no
  // existe la nube (por ejemplo, abrir el archivo sin internet la primera
  // vez) se usa el almacenamiento del navegador.
  if (!window.storage) {
    window.storage = {
      get: async (key) => {
        const v = localStorage.getItem(key);
        if (v === null) throw new Error('not found');
        return { key, value: JSON.parse(v), shared: false };
      },
      set: async (key, value) => { localStorage.setItem(key, JSON.stringify(value)); return { key, value, shared: false }; },
      delete: async (key) => { localStorage.removeItem(key); return { key, deleted: true }; },
      list: async (prefix) => ({ keys: Object.keys(localStorage).filter((k) => !prefix || k.startsWith(prefix)), prefix, shared: false })
    };
  }

