// Supabase falso para pruebas locales (reemplaza vendor/supabase-*.js).
// Guarda todo en localStorage['fake-db'] para que dos pestañas = dos teléfonos.
(function () {
  // La "nube" vive en el servidor de pruebas (/__db): así dos navegadores
  // distintos = dos teléfonos que comparten la misma base de datos.
  const xhr = (m, cuerpo) => { const x = new XMLHttpRequest(); x.open(m, '/__db', false); x.send(cuerpo || null); return x.responseText; };
  const leerDB = () => { try { return JSON.parse(xhr('GET')) || {}; } catch (e) { return {}; } };
  const guardarDB = (db) => xhr('POST', JSON.stringify(db));
  const tabla = (db, t) => (db[t] = db[t] || {});
  const pkDe = (t) => (t === 'datos_app' ? 'clave' : 'id');
  window.FAKE = { offline: !!window.__offlineInicial, latencia: 5, log: [], fallarEscrituras: false };
  const red = () => new Promise((r) => setTimeout(r, window.FAKE.latencia));
  const errRed = { message: 'TypeError: Failed to fetch', code: '' };

  function likeRx(p) { return new RegExp('^' + p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/%/g, '.*').replace(/_/g, '.') + '$'); }
  // jsonb: lo que se guarda como texto se devuelve como texto
  const sesion = () => { try { return JSON.parse(localStorage.getItem('fake-session')); } catch (e) { return null; } };

  function Q(t) {
    const st = { t, op: 'select', filtros: [], cols: '*', datos: null, single: false, ret: false };
    const api = {
      select(c) { if (st.op === 'select') st.cols = c || '*'; else st.ret = true; return api; },
      eq(c, v) { st.filtros.push((r) => String(r[c]) === String(v) || (c === 'actualizado_en' && Date.parse(r[c]) === Date.parse(v))); return api; },
      like(c, p) { const rx = likeRx(p); st.filtros.push((r) => rx.test(r[c] || '')); return api; },
      not(c, op, p) { const rx = likeRx(p); st.filtros.push((r) => !rx.test(r[c] || '')); return api; },
      in(c, arr) { st.filtros.push((r) => arr.map(String).includes(String(r[c]))); return api; },
      order() { return api; }, limit() { return api; },
      maybeSingle() { st.single = true; return api; },
      single() { st.single = true; return api; },
      insert(d) { st.op = 'insert'; st.datos = d; return api; },
      update(d) { st.op = 'update'; st.datos = d; return api; },
      upsert(d) { st.op = 'upsert'; st.datos = d; return api; },
      delete() { st.op = 'delete'; return api; },
      then(ok, ko) { return ejecutar(st).then(ok, ko); }
    };
    return api;
  }
  const proyectar = (r, cols) => {
    if (cols === '*' || !cols) return { ...r };
    const o = {}; cols.split(',').map((x) => x.trim()).forEach((c) => { o[c] = r[c]; }); return o;
  };
  async function ejecutar(st) {
    await red();
    window.FAKE.log.push(st.op + ' ' + st.t);
    if (window.FAKE.offline) return { data: null, error: errRed };
    if (!sesion()) return { data: null, error: { message: 'JWT expired', code: 'PGRST301' } };
    const db = leerDB(); const T = tabla(db, st.t); const pk = pkDe(st.t);
    const filas = () => Object.values(T).filter((r) => st.filtros.every((f) => f(r)));
    if (st.op === 'select') {
      const res = filas().map((r) => proyectar(r, st.cols));
      if (st.single) return { data: res[0] || null, error: null };
      return { data: res, error: null };
    }
    if (window.FAKE.fallarEscrituras) return { data: null, error: { message: 'new row violates row-level security policy', code: '42501' } };
    const conHora = (d) => ({ ...d, actualizado_en: d.actualizado_en ? new Date(d.actualizado_en).toISOString().replace('Z', '+00:00') : d.actualizado_en });
    if (st.op === 'insert') {
      const arr = Array.isArray(st.datos) ? st.datos : [st.datos];
      for (const d of arr) if (T[d[pk]]) return { data: null, error: { code: '23505', message: 'duplicate key' } };
      const out = arr.map((d) => (T[d[pk]] = conHora(d)));
      guardarDB(db);
      return { data: st.ret ? out.map((r) => proyectar(r, 'actualizado_en')) : null, error: null };
    }
    if (st.op === 'upsert') {
      const arr = Array.isArray(st.datos) ? st.datos : [st.datos];
      arr.forEach((d) => { T[d[pk]] = { ...(T[d[pk]] || {}), ...conHora(d) }; });
      guardarDB(db); return { data: null, error: null };
    }
    if (st.op === 'update') {
      const fs = filas(); fs.forEach((r) => Object.assign(r, conHora(st.datos)));
      guardarDB(db);
      return { data: st.ret ? fs.map((r) => proyectar(r, 'actualizado_en')) : null, error: null };
    }
    if (st.op === 'delete') { filas().forEach((r) => delete T[r[pk]]); guardarDB(db); return { data: null, error: null }; }
  }

  const auth = {
    async getSession() { const s = sesion(); return { data: { session: s }, error: null }; },
    async getUser() { const s = sesion(); return { data: { user: s ? s.user : null }, error: null }; },
    async signInWithPassword({ email, password }) {
      await red();
      if (window.FAKE.offline) return { data: null, error: errRed };
      const db = leerDB(); const u = Object.values(tabla(db, 'usuarios')).find((x) => x.email === email && x.password === password);
      if (!u) return { data: null, error: { message: 'Invalid login credentials' } };
      localStorage.setItem('fake-session', JSON.stringify({ user: { id: u.id, email } }));
      return { data: {}, error: null };
    },
    async signUp({ email, password }) {
      const db = leerDB(); const id = 'u-' + Date.now(); tabla(db, 'usuarios')[id] = { id, email, password }; guardarDB(db);
      localStorage.setItem('fake-session', JSON.stringify({ user: { id, email } }));
      return { data: {}, error: null };
    },
    async signOut() { localStorage.removeItem('fake-session'); return { error: null }; },
    async updateUser() { return { error: null }; }
  };
  const aDataUrl = (blob) => new Promise((r) => { const f = new FileReader(); f.onload = () => r(f.result); f.readAsDataURL(blob); });
  const storage = { from: (bucket) => ({
    async upload(path, blob) {
      await red(); if (window.FAKE.offline) return { data: null, error: errRed };
      if (window.FAKE.sinBucket) return { data: null, error: { message: 'Bucket not found' } };
      const db = leerDB(); tabla(db, 'storage')[bucket + '/' + path] = await aDataUrl(blob); guardarDB(db); return { data: { path }, error: null };
    },
    async download(path) {
      await red(); if (window.FAKE.offline) return { data: null, error: errRed };
      const u = (leerDB().storage || {})[bucket + '/' + path]; if (!u) return { data: null, error: { message: 'Object not found' } };
      return { data: await (await fetch(u)).blob(), error: null };
    },
    async remove(paths) { const db = leerDB(); paths.forEach((p) => delete tabla(db, 'storage')[bucket + '/' + p]); guardarDB(db); return { data: null, error: null }; }
  }) };
  window.supabase = { createClient: () => ({ auth, storage, from: (t) => Q(t), rpc: async () => ({ error: { message: 'function does not exist' } }) }) };
})();
