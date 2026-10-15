  // ====================================================================
  // FOTOS — se guardan como archivos en Supabase Storage (bucket "fotos"),
  // no dentro de la base de datos. En la base solo queda la lista de
  // archivos de cada trabajo/plano. Las fotos viejas (guardadas dentro de la
  // base) se siguen viendo y se mudan solas al abrirlas.
  // Para el resto de la app nada cambia: guardar/cargar siguen usando
  // [{ dataUrl, nombre }].
  // ====================================================================
  const GH_FOTOS = (function () {
    const BUCKET = 'fotos';
    const cache = new Map();              // path -> dataUrl
    let disponible = null;                // null = no se sabe, true/false
    const cli = () => window.GH_SUPABASE;
    const cuenta = () => ((typeof window.GH_GET_CUENTA === 'function' && window.GH_GET_CUENTA()) || 'principal');
    const claveDe = (tipo, id) => `gh-${tipo}-fotos-${id}`;

    function dataUrlABlob(dataUrl) {
      const [cab, datos] = String(dataUrl).split(',');
      const tipo = (cab.match(/data:([^;]+)/) || [])[1] || 'image/jpeg';
      const bin = atob(datos || ''); const arr = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
      return new Blob([arr], { type: tipo });
    }
    function blobADataUrl(blob) {
      return new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = rej; r.readAsDataURL(blob); });
    }
    // Huella corta del contenido: la misma foto no se vuelve a subir
    async function huella(dataUrl) {
      try {
        const buf = new TextEncoder().encode(dataUrl);
        const h = await crypto.subtle.digest('SHA-256', buf);
        return [...new Uint8Array(h)].slice(0, 10).map((b) => b.toString(16).padStart(2, '0')).join('');
      } catch (e) { let h = 0; for (let i = 0; i < dataUrl.length; i += 7) h = (h * 31 + dataUrl.charCodeAt(i)) >>> 0; return h.toString(16) + dataUrl.length.toString(16); }
    }
    const ext = (dataUrl) => (/^data:image\/png/.test(dataUrl) ? 'png' : /^data:image\/webp/.test(dataUrl) ? 'webp' : 'jpg');

    async function leerLista(tipo, id) {
      const r = await window.storage.get(claveDe(tipo, id)).catch(() => null);
      if (!r) return null;
      try { return JSON.parse(r.value); } catch (e) { return null; }
    }
    const esFormatoNuevo = (v) => v && typeof v === 'object' && !Array.isArray(v) && Array.isArray(v.archivos);

    async function subirTodas(tipo, id, fotos) {
      const c = cli(); if (!c || !c.storage) throw new Error('sin-storage');
      const base = `${cuenta()}/${tipo}/${id}/`;
      const archivos = [];
      for (const f of fotos) {
        if (!f || !f.dataUrl) continue;
        const path = base + (await huella(f.dataUrl)) + '.' + ext(f.dataUrl);
        if (!cache.has(path)) {
          const { error } = await c.storage.from(BUCKET).upload(path, dataUrlABlob(f.dataUrl), { upsert: true, contentType: dataUrlABlob(f.dataUrl).type });
          if (error && !/exists|duplicate/i.test(error.message || '')) throw error;
          cache.set(path, f.dataUrl);
        }
        archivos.push({ path, nombre: f.nombre || '' });
      }
      return archivos;
    }

    async function guardar(tipo, id, fotos) {
      fotos = Array.isArray(fotos) ? fotos : [];
      const anterior = await leerLista(tipo, id);
      if (disponible !== false) {
        try {
          const archivos = await subirTodas(tipo, id, fotos);
          await window.storage.set(claveDe(tipo, id), JSON.stringify({ archivos }));
          disponible = true;
          // Borrar del almacén las fotos que se quitaron
          if (esFormatoNuevo(anterior)) {
            const quedan = new Set(archivos.map((a) => a.path));
            const sobran = anterior.archivos.map((a) => a.path).filter((p) => !quedan.has(p));
            if (sobran.length) cli().storage.from(BUCKET).remove(sobran).catch(() => {});
          }
          return;
        } catch (e) {
          if (/bucket not found|sin-storage/i.test(String(e && e.message))) disponible = false;
          else throw e;
        }
      }
      // Sin almacén de fotos: como antes (dentro de la base)
      await window.storage.set(claveDe(tipo, id), JSON.stringify(fotos));
    }

    async function cargar(tipo, id) {
      const v = await leerLista(tipo, id);
      if (!v) return [];
      if (Array.isArray(v)) {
        // Formato viejo: se ve igual y se muda al almacén en segundo plano
        if (v.length && disponible !== false && window.GH_ROL !== 'visor') setTimeout(() => guardar(tipo, id, v).catch(() => {}), 1500);
        return v;
      }
      if (!esFormatoNuevo(v)) return [];
      const c = cli();
      const salida = await Promise.all(v.archivos.map(async (a) => {
        if (cache.has(a.path)) return { dataUrl: cache.get(a.path), nombre: a.nombre };
        try {
          const { data, error } = await c.storage.from(BUCKET).download(a.path);
          if (error || !data) throw error || new Error('sin datos');
          const url = await blobADataUrl(data);
          cache.set(a.path, url);
          return { dataUrl: url, nombre: a.nombre };
        } catch (e) { return null; }
      }));
      const ok = salida.filter(Boolean);
      if (ok.length < v.archivos.length) toast(`No se pudieron bajar ${v.archivos.length - ok.length} foto(s). Revisa la señal.`, 'error', 4000);
      return ok;
    }

    async function borrar(tipo, id) {
      const v = await leerLista(tipo, id);
      if (esFormatoNuevo(v) && v.archivos.length) { try { await cli().storage.from(BUCKET).remove(v.archivos.map((a) => a.path)); } catch (e) {} }
      try { await window.storage.delete(claveDe(tipo, id)); } catch (e) {}
    }
    return { guardar, cargar, borrar };
  })();
  window.GH_FOTOS = GH_FOTOS;

