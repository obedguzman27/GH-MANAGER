// ============================================================
// GH Manager — Conexión con Supabase (usuario y contraseña + roles)
// y MOTOR DE SINCRONIZACIÓN
// ============================================================
// Define window.storage ANTES de que el resto de la app cargue.
// También expone window.GH_ROL / window.GH_NOMBRE y window.GH_SYNC.
//
// Cómo se guarda ahora (v200):
//  • Cada dato (clave) recuerda la versión que se leyó de la nube. Al guardar,
//    solo se escribe si nadie más lo cambió mientras tanto. Si otro teléfono
//    lo cambió, se JUNTAN los dos cambios (no se borra lo del otro).
//  • Si no hay señal o la sesión venció, el cambio se queda en una cola en
//    este teléfono y se sube solo cuando se pueda (aunque cierres la app).
//  • Si al abrir no se pudo leer un dato, la app NO lo trata como vacío al
//    guardar: se junta con lo que haya en la nube (antes se borraba todo).
//  • Cada rato se revisa si otro teléfono cambió algo y se avisa.

(function () {
  if (!window.supabase || !window.supabase.createClient) {
    document.addEventListener('DOMContentLoaded', () => {
      const overlay = document.createElement('div');
      overlay.className = 'gh-fatal';
      overlay.innerHTML = `
        <div style="max-width:340px;">
          <div style="font-size:18px;font-weight:700;margin-bottom:10px;">No se pudo cargar el sistema de acceso</div>
          <div style="font-size:13.5px;opacity:.85;line-height:1.5;">Revisa que tengas conexión a internet y vuelve a abrir la app. Si el problema sigue, cierra la app por completo (no solo minimizarla) y ábrela de nuevo.</div>
        </div>`;
      overlay.style.cssText = 'position:fixed;inset:0;z-index:99999;background:#0F1115;color:#fff;display:flex;align-items:center;justify-content:center;text-align:center;font-family:sans-serif;padding:30px;';
      document.body.appendChild(overlay);
    });
    return;
  }

  const SUPABASE_URL = 'https://cubhmlclqovvmsdskooc.supabase.co';
  const SUPABASE_ANON_KEY = 'sb_publishable_drw-q0SBYKj0I3fV0BKvmA_0nmV1DkW';
  const DOMINIO_INTERNO = '@guzmanhvac.app';
  const MINUTOS_INACTIVIDAD = 30;

  const client = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { storage: window.localStorage, persistSession: true, autoRefreshToken: true }
  });
  window.GH_SUPABASE = client;

  function bloqueoAppActivo() {
    try { return localStorage.getItem('gh-applock-enabled') === '1'; } catch (e) { return false; }
  }

  let resolverSesion, sesionLista, sesionActiva = false;
  function nuevaEsperaSesion() { sesionActiva = false; sesionLista = new Promise((r) => { resolverSesion = r; }); }
  nuevaEsperaSesion();
  function marcarSesionLista() { sesionActiva = true; resolverSesion(); Sync.despertar(); }

  // La sesión se cierra tras 30 min SIN USAR la app (antes eran 30 min desde
  // que entraste, aunque estuvieras trabajando — y lo que guardabas después
  // no llegaba a la nube). Con Face ID / PIN activado no se cierra.
  let temporizadorSesion = null;
  function programarExpiracion() {
    if (temporizadorSesion) clearTimeout(temporizadorSesion);
    if (bloqueoAppActivo() || !sesionActiva) return;
    temporizadorSesion = setTimeout(async () => {
      await Sync.esperarGuardado(10000);
      try { await client.auth.signOut(); } catch (e) {}
      nuevaEsperaSesion();
      mostrarFormularioLogin('Tu sesión se cerró después de ' + MINUTOS_INACTIVIDAD + ' minutos sin usar la app. Vuelve a entrar.');
    }, MINUTOS_INACTIVIDAD * 60 * 1000);
  }
  let ultimoToque = 0;
  ['pointerdown', 'keydown'].forEach((ev) => document.addEventListener(ev, () => {
    const t = Date.now();
    if (t - ultimoToque > 20000) { ultimoToque = t; programarExpiracion(); }
  }, true));

  function usuarioAEmail(usuario) {
    const limpio = usuario.trim().toLowerCase().split('@')[0].replace(/[^a-z0-9._-]+/g, '.');
    return limpio + DOMINIO_INTERNO;
  }
  function esperar(ms) { return new Promise((r) => setTimeout(r, ms)); }

  async function crearPerfil(usuario) {
    let ultimoError = null;
    for (let intento = 0; intento < 6; intento++) {
      const { data: { session } } = await client.auth.getSession();
      if (!session) { await esperar(400); continue; }
      const { data: existente } = await client.from('perfiles').select('id').eq('id', session.user.id).maybeSingle();
      if (existente) return;
      const { error } = await client.from('perfiles').insert({ id: session.user.id, nombre: usuario, rol: 'visor', activo: false });
      if (!error) return;
      ultimoError = error;
      await esperar(500);
    }
    throw ultimoError || new Error('No se pudo crear el perfil.');
  }

  function aplicarPerfilGlobal(perfil) {
    // Ante la duda, el MÍNIMO acceso: si no se pudo leer el rol, "visor".
    window.GH_ROL = perfil && perfil.rol ? String(perfil.rol).trim().toLowerCase() : 'visor';
    window.GH_NOMBRE = perfil && perfil.nombre ? perfil.nombre : '';
  }

  // ---------- Pantalla de usuario / contraseña ----------
  function mostrarFormularioLogin(mensajeError) {
    let overlay = document.getElementById('gh-login-overlay');
    if (overlay) overlay.remove();
    overlay = document.createElement('div');
    overlay.id = 'gh-login-overlay';
    overlay.className = 'gh-login';
    overlay.innerHTML = `
      <div class="gh-login-card">
        <svg class="gh-login-logo" width="64" height="64" viewBox="0 0 512 512" xmlns="http://www.w3.org/2000/svg"><rect width="512" height="512" rx="116" fill="#FFFFFF"/><path d="M212.8 206.1 A65.1 65.1 0 1 0 235.9 260.5" fill="none" stroke="#121316" stroke-width="25.2" stroke-linecap="round"/><path d="M176.8 256.0 H367.7" fill="none" stroke="#121316" stroke-width="25.2" stroke-linecap="round"/><path d="M305.6 190.9 V321.1 M367.7 190.9 V321.1" fill="none" stroke="#121316" stroke-width="25.2" stroke-linecap="round"/><circle cx="406.2" cy="314.5" r="11.1" fill="#E8803A"/></svg>
        <div class="gh-login-titulo">GH Manager</div>
        <div id="gh-login-subtitulo" class="gh-login-sub">Inicia sesión</div>
        <form id="gh-login-form" method="post" action="#" autocomplete="on" novalidate>
          <label class="gh-login-campo"><span>Usuario</span>
            <input id="gh-usuario-input" name="username" type="text" autocomplete="username" autocapitalize="none" autocorrect="off" spellcheck="false" inputmode="text"></label>
          <label class="gh-login-campo"><span>Contraseña</span>
            <input id="gh-clave-input" name="password" type="password" autocomplete="current-password"></label>
          <div id="gh-clave-pista" class="gh-login-pista" style="display:none;">Al menos 6 caracteres, con letras y números.</div>
          <div id="gh-login-error" class="gh-login-error" role="alert"></div>
          <button id="gh-login-btn" type="submit" class="gh-login-btn">Entrar</button>
        </form>
        <button id="gh-modo-btn" type="button" class="gh-login-modo">¿No tienes cuenta? Crear cuenta</button>
      </div>`;
    document.body.appendChild(overlay);
    document.getElementById('gh-login-error').textContent = mensajeError || '';

    const usuarioInput = document.getElementById('gh-usuario-input');
    const claveInput = document.getElementById('gh-clave-input');
    const btn = document.getElementById('gh-login-btn');
    const modoBtn = document.getElementById('gh-modo-btn');
    const subtitulo = document.getElementById('gh-login-subtitulo');
    usuarioInput.focus();
    let modoRegistro = false;

    modoBtn.addEventListener('click', () => {
      modoRegistro = !modoRegistro;
      claveInput.setAttribute('autocomplete', modoRegistro ? 'new-password' : 'current-password');
      subtitulo.textContent = modoRegistro ? 'Crea tu cuenta' : 'Inicia sesión';
      btn.textContent = modoRegistro ? 'Crear cuenta' : 'Entrar';
      modoBtn.textContent = modoRegistro ? '¿Ya tienes cuenta? Entrar' : '¿No tienes cuenta? Crear cuenta';
      document.getElementById('gh-clave-pista').style.display = modoRegistro ? 'block' : 'none';
    });

    async function intentar() {
      const usuario = usuarioInput.value.trim();
      const clave = claveInput.value;
      const errorDiv = document.getElementById('gh-login-error');
      const listo = (txt) => { errorDiv.textContent = txt || ''; btn.disabled = false; btn.textContent = modoRegistro ? 'Crear cuenta' : 'Entrar'; };
      if (!usuario || !clave) return listo('Escribe tu usuario y contraseña.');
      if (clave.length < 6) return listo('La contraseña debe tener al menos 6 caracteres.');
      if (modoRegistro && !(/[a-zA-Z]/.test(clave) && /[0-9]/.test(clave))) return listo('La contraseña debe tener letras y números.');
      btn.disabled = true; btn.textContent = modoRegistro ? 'Creando…' : 'Entrando…';
      errorDiv.textContent = '';
      const email = usuarioAEmail(usuario);
      try {
        const resultado = modoRegistro
          ? await client.auth.signUp({ email, password: clave })
          : await client.auth.signInWithPassword({ email, password: clave });
        if (resultado.error) {
          const m = resultado.error.message || '';
          return listo(/invalid login/i.test(m) ? 'Usuario o contraseña incorrectos.' : /already registered/i.test(m) ? 'Ese usuario ya existe.' : (m || 'Ocurrió un error. Intenta de nuevo.'));
        }
        if (modoRegistro) {
          try { await crearPerfil(usuario); }
          catch (e) { return listo('Cuenta creada, pero no se pudo guardar el perfil: ' + (e.message || e)); }
          try { await client.auth.signOut(); } catch (e) {}
          modoRegistro = false;
          subtitulo.textContent = 'Inicia sesión';
          modoBtn.textContent = '¿No tienes cuenta? Crear cuenta';
          return listo('Cuenta creada. Un administrador debe aprobarla antes de que puedas entrar.');
        }
        const { data: { user } } = await client.auth.getUser();
        const { data: perfil } = await client.from('perfiles').select('activo,rol,nombre').eq('id', user.id).maybeSingle();
        if (!perfil || !perfil.activo) {
          try { await client.auth.signOut(); } catch (e) {}
          return listo('Tu cuenta no está activa. Contacta al administrador.');
        }
        aplicarPerfilGlobal(perfil);
        await cargarCuentaActiva();
        iniciarPrecarga();
        overlay.remove();
        marcarSesionLista();
        programarExpiracion();
      } catch (e) {
        listo('No se pudo conectar: ' + (e.message || e));
      }
    }

    const formLogin = document.getElementById('gh-login-form');
    let enviando = false;
    formLogin.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (enviando) return;
      enviando = true;
      try { await intentar(); } finally { enviando = false; }
    });
  }

  async function iniciarSesion() {
    try {
      const { data: { session } } = await client.auth.getSession();
      if (session) {
        const { data: perfil, error } = await client.from('perfiles').select('activo,rol,nombre').eq('id', session.user.id).maybeSingle();
        if (perfil && perfil.activo) {
          try { localStorage.setItem('gh-perfil-cache', JSON.stringify({ id: session.user.id, rol: perfil.rol, nombre: perfil.nombre })); } catch (e) {}
          aplicarPerfilGlobal(perfil);
          await cargarCuentaActiva();
          iniciarPrecarga();
          marcarSesionLista();
          programarExpiracion();
          return;
        }
        // Sin señal al abrir (o señal muy débil): entrar con el último perfil
        // conocido de este teléfono, en vez de pedir la contraseña. Lo que se
        // guarde queda en la cola y se sube cuando vuelva la señal.
        if (error) {
          let cache = null;
          try { cache = JSON.parse(localStorage.getItem('gh-perfil-cache') || 'null'); } catch (e) {}
          if (cache && cache.id === session.user.id) {
            aplicarPerfilGlobal(cache);
            window.GH_USER_ID = cache.id;
            try { cuentaActiva = localStorage.getItem('gh-cuenta-cache:' + cache.id) || 'principal'; } catch (e) {}
            Sync.lecturaFallida();
            marcarSesionLista();
            return;
          }
        }
      }
    } catch (e) {}
    mostrarFormularioLogin();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', iniciarSesion);
  else iniciarSesion();

  window.GH_ESPERAR_SESION = () => sesionLista;
  window.GH_CERRAR_SESION = async () => {
    await Sync.esperarGuardado(8000);
    try { await client.auth.signOut(); } catch (e) {}
    location.reload();
  };
  window.GH_CAMBIAR_CONTRASENA = async (actual, nueva) => {
    try {
      const { data: { user } } = await client.auth.getUser();
      if (!user || !user.email) return { ok: false, error: 'No hay sesión activa.' };
      const check = await client.auth.signInWithPassword({ email: user.email, password: actual });
      if (check.error) return { ok: false, error: 'La contraseña actual no es correcta.' };
      const { error } = await client.auth.updateUser({ password: nueva });
      if (error) return { ok: false, error: error.message || 'No se pudo cambiar la contraseña.' };
      return { ok: true };
    } catch (e) {
      return { ok: false, error: (e && e.message) || 'Ocurrió un error.' };
    }
  };

  // ---------- Cuentas (bases de datos) ----------
  let cuentaActiva = 'principal';
  const limpiarCodigo = (codigo) => (codigo || 'principal').trim().toLowerCase().replace(/[^a-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '') || 'principal';
  const prefijoDe = (codigo) => (codigo && codigo !== 'principal') ? ('c:' + codigo + '::') : '';
  function prefijoActual() { return prefijoDe(cuentaActiva); }
  function claveConCuenta(key) { return key.startsWith('__') ? key : prefijoActual() + key; }

  async function miUsuarioId() {
    if (window.GH_USER_ID) return window.GH_USER_ID;
    try { const { data: { session } } = await client.auth.getSession(); return session && session.user ? session.user.id : null; } catch (e) { return null; }
  }

  async function cargarCuentaActiva() {
    try {
      const { data: { session } } = await client.auth.getSession();
      const user = session && session.user;
      if (!user) { cuentaActiva = 'principal'; return; }
      window.GH_USER_ID = user.id;
      const { data, error } = await client.from('datos_app').select('valor').eq('clave', '__cuenta::' + user.id).maybeSingle();
      if (error) throw error;
      cuentaActiva = (data && data.valor) ? data.valor : 'principal';
      try { localStorage.setItem('gh-cuenta-cache:' + user.id, cuentaActiva); } catch (e) {}
    } catch (e) {
      try { cuentaActiva = localStorage.getItem('gh-cuenta-cache:' + (window.GH_USER_ID || '')) || 'principal'; } catch (e2) { cuentaActiva = 'principal'; }
    }
  }

  // =====================================================================
  // MOTOR DE SINCRONIZACIÓN
  // =====================================================================
  const COLA_KEY = 'gh-sync-cola-v1';
  const Sync = (function () {
    const base = new Map();      // clave -> { valor, version, conocido }
    const cola = new Map();      // clave -> { valor, base:{valor,version,conocido}, seq, ts }
    const enVuelo = new Map();   // clave -> Promise
    const esperas = [];          // { clave, seq, resolve, reject }
    const oyentes = new Set();
    let seq = 0, estado = 'ok', ultimoError = '', temporizador = null, intentos = 0, lecturasFallidas = 0;
    function lecturaFallida() {
      lecturasFallidas++;
      const avisar = () => { try { window.dispatchEvent(new CustomEvent('gh-recargar-sugerido')); } catch (e) {} };
      if (lecturasFallidas === 1) {
        setTimeout(() => { try { window.dispatchEvent(new CustomEvent('gh-lectura-sin-senal')); } catch (e) {} }, 300);
        window.addEventListener('online', avisar, { once: true });
        // señal débil (navigator dice "en línea"): revisar cada 20 s si ya se puede leer
        const iv = setInterval(async () => {
          if (!navigator.onLine || document.hidden) return;
          try { const { error } = await client.from('datos_app').select('clave').limit(1); if (!error) { clearInterval(iv); avisar(); } } catch (e) {}
        }, 20000);
      }
    }
    const remotosAvisados = new Map(); // clave -> version que ya se avisó

    // ---- cola guardada en el teléfono (sobrevive a cerrar la app) ----
    function persistir() {
      try {
        if (!cola.size) { localStorage.removeItem(COLA_KEY); return true; }
        const obj = {};
        cola.forEach((v, k) => { obj[k] = { valor: v.valor, base: v.base, ts: v.ts }; });
        let txt = JSON.stringify(obj);
        if (txt.length > 3500000) {
          // muy grande (fotos): sin la copia base, la nube junta sin borrar nada
          Object.values(obj).forEach((v) => { v.base = { conocido: false }; });
          txt = JSON.stringify(obj);
        }
        localStorage.setItem(COLA_KEY, txt);
        return true;
      } catch (e) { return false; }
    }
    try {
      const guardada = JSON.parse(localStorage.getItem(COLA_KEY) || 'null');
      if (guardada && typeof guardada === 'object') {
        Object.entries(guardada).forEach(([k, v]) => {
          if (v && typeof v.valor === 'string') cola.set(k, { valor: v.valor, base: v.base || { conocido: false }, seq: ++seq, ts: v.ts || Date.now() });
        });
      }
    } catch (e) {}

    // ---- estado visible (indicador "Guardado / Guardando / Sin señal") ----
    function avisar() {
      const info = { estado, pendientes: cola.size, error: ultimoError };
      oyentes.forEach((fn) => { try { fn(info); } catch (e) {} });
    }
    function ponerEstado(e, err) { estado = e; if (err !== undefined) ultimoError = err; avisar(); }

    // ---- unir cambios (de este teléfono y de otro) ----
    const parse = (t) => { if (t == null) return undefined; try { return JSON.parse(t); } catch (e) { return undefined; } };
    const igual = (a, b) => JSON.stringify(a) === JSON.stringify(b);
    const esObj = (x) => x && typeof x === 'object' && !Array.isArray(x);
    // Identidad de un elemento de lista: su id; si no tiene, su código o
    // nombre (cuentas, trabajos); si no, el elemento completo. Si hay dos
    // con la misma identidad, se numeran para que nunca se junten en uno.
    const idBase = (x) => {
      if (esObj(x)) {
        if (x.id != null && x.id !== '') return 'i:' + String(x.id);
        if (x.codigo != null && x.codigo !== '') return 'c:' + String(x.codigo).toLowerCase();
        if (typeof x.nombre === 'string' && x.nombre.trim()) return 'n:' + x.nombre.trim().toLowerCase();
      }
      return 'j:' + JSON.stringify(x);
    };
    const conIds = (arr) => { const n = new Map(); return arr.map((x) => { const k = idBase(x); const c = (n.get(k) || 0) + 1; n.set(k, c); return [c > 1 ? k + '#' + c : k, x]; }); };
    const idsDe = (arr) => conIds(arr).map((p) => p[0]);

    function unirListas(b, l, r) {
      b = Array.isArray(b) ? b : [];
      const mb = new Map(conIds(b));
      const ml = new Map(conIds(l));
      const mr = new Map(conIds(r));
      const res = new Map(conIds(r));
      // lo que este teléfono agregó o cambió
      ml.forEach((x, id) => {
        if (!mb.has(id)) { res.set(id, x); return; }
        const cambioAqui = !igual(mb.get(id), x);
        if (!cambioAqui) return;
        if (mr.has(id) && !igual(mr.get(id), mb.get(id)) && esObj(x) && esObj(mr.get(id))) res.set(id, unirObjetos(mb.get(id), x, mr.get(id)));
        else res.set(id, x);
      });
      // lo que este teléfono borró (solo si el otro no lo tocó)
      mb.forEach((x, id) => {
        if (ml.has(id)) return;
        if (mr.has(id) && igual(mr.get(id), x)) res.delete(id);
      });
      // orden: el de este teléfono, y lo nuevo del otro al final
      const orden = [];
      const visto = new Set();
      idsDe(l).forEach((id) => { if (res.has(id) && !visto.has(id)) { orden.push(res.get(id)); visto.add(id); } });
      idsDe(r).forEach((id) => { if (res.has(id) && !visto.has(id)) { orden.push(res.get(id)); visto.add(id); } });
      res.forEach((x, id) => { if (!visto.has(id)) { orden.push(x); visto.add(id); } });
      return orden;
    }
    function unirObjetos(b, l, r) {
      b = esObj(b) ? b : {};
      const res = { ...r };
      new Set([...Object.keys(b), ...Object.keys(l), ...Object.keys(r)]).forEach((k) => {
        const enB = k in b, enL = k in l, enR = k in r;
        if (enL && enB && igual(l[k], b[k])) return;           // aquí no cambió: lo del otro
        if (!enL && enB) {                                      // aquí se borró
          if (!enR || igual(r[k], b[k])) delete res[k];
          return;
        }
        if (!enL) return;
        res[k] = unir(enB ? b[k] : undefined, l[k], enR ? r[k] : undefined);
      });
      return res;
    }
    function unir(b, l, r) {
      if (r === undefined) return l;
      if (Array.isArray(l) && Array.isArray(r)) return unirListas(b, l, r);
      if (esObj(l) && esObj(r)) return unirObjetos(b, l, r);
      return l;
    }
    function unirTexto(bTxt, lTxt, rTxt) {
      const l = parse(lTxt), r = parse(rTxt);
      if (l === undefined || r === undefined) return lTxt;   // no es JSON: gana este teléfono
      const b = parse(bTxt);
      const m = unir(b, l, r);
      return igual(m, l) ? lTxt : JSON.stringify(m);
    }

    // ---- comunicación con la nube ----
    async function leerRemoto(clave) {
      const { data, error } = await client.from('datos_app').select('valor, actualizado_en').eq('clave', clave).maybeSingle();
      if (error) throw error;
      return data ? { existe: true, valor: data.valor, version: data.actualizado_en } : { existe: false, valor: null, version: null };
    }
    const sinPermiso = (error) => error && (error.code === '42501' || /row-level security|permission denied/i.test(error.message || ''));
    function lanzar(error) {
      if (sinPermiso(error)) { const e = new Error('Tu usuario no tiene permiso para guardar esto.'); e.permiso = true; throw e; }
      throw error;
    }
    async function escribirCondicional(clave, valor, versionEsperada) {
      const fila = { valor, actualizado_por: await miUsuarioId(), actualizado_en: new Date().toISOString() };
      if (versionEsperada) {
        const { data, error } = await client.from('datos_app').update(fila).eq('clave', clave).eq('actualizado_en', versionEsperada).select('actualizado_en');
        if (error) lanzar(error);
        return data && data.length ? data[0].actualizado_en : null;   // null = alguien más lo cambió
      }
      const { data, error } = await client.from('datos_app').insert({ clave, ...fila }).select('actualizado_en');
      if (error) { if (error.code === '23505') return null; lanzar(error); }
      return data && data.length ? data[0].actualizado_en : fila.actualizado_en;
    }

    async function subirClave(clave) {
      for (let vuelta = 0; vuelta < 6; vuelta++) {
        const p = cola.get(clave);
        if (!p) return;
        const miSeq = p.seq, local = p.valor;
        let b = p.base || { conocido: false };
        let aEscribir = local, version;
        if (b.conocido) {
          version = await escribirCondicional(clave, local, b.version || null);
        }
        if (!version) {
          // Otro teléfono lo cambió (o no sabemos qué hay): juntar y reintentar
          const r = await leerRemoto(clave);
          if (b.conocido && r.version === b.version && r.existe === !!b.version) {
            // Nada cambió allá y aun así no se pudo: no hay permiso
            const e = new Error('Tu usuario no tiene permiso para guardar esto.'); e.permiso = true; throw e;
          }
          aEscribir = r.existe ? unirTexto(b.conocido ? b.valor : null, local, r.valor) : local;
          version = await escribirCondicional(clave, aEscribir, r.existe ? r.version : null);
          if (!version) { p.base = b.conocido ? b : { conocido: false }; continue; }   // cambió otra vez: otra vuelta
          if (aEscribir !== local) notificarRemoto([clave], true);
        }
        // Guardado ✓. La base es lo que la app tiene en memoria (local), con la
        // versión nueva: así el siguiente guardado no "borra" lo del otro.
        base.set(clave, { valor: local, version, conocido: true });
        remotosAvisados.delete(clave);
        const actual = cola.get(clave);
        if (actual && actual.seq === miSeq) cola.delete(clave);
        else if (actual) actual.base = { valor: local, version, conocido: true };
        persistir();
        resolverEsperas(clave, miSeq);
        if (!cola.has(clave)) return;
      }
      throw new Error('Demasiados cambios al mismo tiempo, se reintentará.');
    }

    function resolverEsperas(clave, hasta, error) {
      for (let i = esperas.length - 1; i >= 0; i--) {
        const w = esperas[i];
        if (w.clave === clave && w.seq <= hasta) { esperas.splice(i, 1); error ? w.reject(error) : w.resolve(); }
      }
    }

    async function vaciar() {
      if (temporizador) { clearTimeout(temporizador); temporizador = null; }
      if (!sesionActiva || !cola.size) { if (!cola.size) ponerEstado('ok', ''); return; }
      ponerEstado('guardando');
      let falloRed = false;
      for (const clave of [...cola.keys()]) {
        if (enVuelo.has(clave)) continue;
        const prom = subirClave(clave).catch((err) => {
          if (err && err.permiso) {
            const p = cola.get(clave);
            cola.delete(clave); persistir();
            resolverEsperas(clave, p ? p.seq : Infinity, err);
            ultimoError = err.message;
            if (window.GH_TOAST) window.GH_TOAST(err.message, 'error', 5000);
          } else {
            falloRed = true; ultimoError = (err && err.message) || String(err);
            // quien espera este guardado ya puede seguir: quedó en la cola del teléfono
            const p = cola.get(clave);
            if (p) esperas.filter((w) => w.clave === clave && w.seq <= p.seq).forEach((w) => { w.pendiente = true; });
            for (let i = esperas.length - 1; i >= 0; i--) if (esperas[i].pendiente) { esperas[i].resolve({ pendiente: true }); esperas.splice(i, 1); }
          }
        }).finally(() => enVuelo.delete(clave));
        enVuelo.set(clave, prom);
      }
      await Promise.all([...enVuelo.values()]);
      if (cola.size && !falloRed) return vaciar();   // llegaron cambios mientras se subía
      if (falloRed) {
        intentos++;
        ponerEstado(navigator.onLine ? 'error' : 'offline');
        temporizador = setTimeout(vaciar, Math.min(60000, 2000 * Math.pow(2, Math.min(intentos, 5))));
      } else {
        intentos = 0;
        ponerEstado('ok', '');
      }
    }
    let programado = null;
    function despertar() {
      if (programado) return;
      programado = setTimeout(() => { programado = null; vaciar(); }, 60);
    }

    // ---- API para window.storage ----
    function registrarLeido(clave, existe, valor, version) {
      if (cola.has(clave)) return;   // lo de este teléfono manda hasta que se suba
      base.set(clave, { valor: existe ? valor : null, version: existe ? version : null, conocido: true });
    }
    function guardar(clave, valor) {
      const s = ++seq;
      const previo = cola.get(clave);
      const b = previo ? previo.base : (base.get(clave) || { conocido: false });
      cola.set(clave, { valor, base: b, seq: s, ts: Date.now() });
      const ok = persistir();
      ponerEstado(sesionActiva && navigator.onLine ? 'guardando' : 'offline');
      return new Promise((resolve, reject) => {
        esperas.push({ clave, seq: s, resolve, reject });
        if (!ok && !navigator.onLine) { /* sin espacio y sin señal: avisar */ }
        if (!sesionActiva || !navigator.onLine) {
          // sin señal / sin sesión: queda en la cola del teléfono
          if (ok) { const i = esperas.findIndex((w) => w.seq === s); if (i >= 0) esperas.splice(i, 1); resolve({ pendiente: true }); }
          else reject(new Error('No hay señal y el teléfono no tiene espacio para guardar el cambio.'));
          return;
        }
        despertar();
      });
    }
    function pendienteDe(clave) { const p = cola.get(clave); return p ? p.valor : undefined; }
    function olvidar(clave) { cola.delete(clave); base.delete(clave); persistir(); }

    // ---- revisar si otro teléfono cambió algo ----
    function notificarRemoto(claves, porUnion) {
      try { window.dispatchEvent(new CustomEvent('gh-datos-remotos', { detail: { claves, porUnion: !!porUnion } })); } catch (e) {}
    }
    async function revisarRemotos() {
      if (!sesionActiva || document.hidden || !navigator.onLine || window.GH_ROL === 'visor') return;
      const pfx = prefijoActual();
      try {
        let q = client.from('datos_app').select('clave, actualizado_en').not('clave', 'like', '%fotos%');
        q = pfx ? q.like('clave', pfx + '%') : q.not('clave', 'like', 'c:%');
        const { data, error } = await q;
        if (error || !data) return;
        const cambiadas = [];
        data.forEach((f) => {
          const b = base.get(f.clave);
          if (!b || !b.conocido || cola.has(f.clave) || enVuelo.has(f.clave)) return;
          if (b.version !== f.actualizado_en && remotosAvisados.get(f.clave) !== f.actualizado_en) {
            remotosAvisados.set(f.clave, f.actualizado_en);
            cambiadas.push(f.clave.slice(pfx.length));
          }
        });
        if (cambiadas.length) notificarRemoto(cambiadas, false);
      } catch (e) {}
    }
    document.addEventListener('visibilitychange', () => { if (!document.hidden) { vaciar(); revisarRemotos(); } });
    window.addEventListener('online', () => { intentos = 0; vaciar(); });
    window.addEventListener('offline', () => ponerEstado(cola.size ? 'offline' : 'ok'));
    setInterval(revisarRemotos, 90000);
    window.addEventListener('beforeunload', (e) => { if (cola.size && navigator.onLine) { vaciar(); } });

    return {
      guardar, registrarLeido, pendienteDe, lecturaFallida, hayLecturasFallidas: () => lecturasFallidas > 0, olvidar, despertar, vaciar, revisarRemotos,
      unirTexto,   // (para pruebas)
      esperarGuardado(ms) {
        if (!cola.size || !navigator.onLine || !sesionActiva) return Promise.resolve();
        return new Promise((res) => {
          const fin = setTimeout(res, ms || 8000);
          const fn = (i) => { if (!i.pendientes || i.estado !== 'guardando') { clearTimeout(fin); oyentes.delete(fn); res(); } };
          oyentes.add(fn); vaciar();
        });
      },
      on(fn) { oyentes.add(fn); fn({ estado, pendientes: cola.size, error: ultimoError }); return () => oyentes.delete(fn); },
      info() { return { estado, pendientes: cola.size, error: ultimoError }; }
    };
  })();
  window.GH_SYNC = Sync;

  // ---------- Precarga (velocidad) ----------
  // Al abrir, UNA consulta trae todos los datos de la base activa (menos fotos).
  let precargaMapa = null, precargaPromesa = null, precargaUsadas = new Set();
  function iniciarPrecarga() {
    precargaMapa = null; precargaUsadas = new Set();
    if (window.GH_ROL === 'visor') { precargaPromesa = null; return; }
    const pfx = prefijoActual();
    let q = client.from('datos_app').select('clave, valor, actualizado_en').not('clave', 'like', '%fotos%');
    q = pfx ? q.like('clave', pfx + '%') : q.not('clave', 'like', 'c:%');
    precargaPromesa = q.then(({ data, error }) => {
      if (error || !data) return null;
      const m = new Map(); data.forEach((r) => m.set(r.clave, r));
      precargaMapa = m; return m;
    }, () => null);
  }
  // undefined = la precarga no sabe; null = la precarga confirmó que no existe
  async function leerPrecarga(claveCompleta) {
    if (!precargaPromesa) return undefined;
    const m = await Promise.race([precargaPromesa, new Promise((r) => setTimeout(() => r(null), 6000))]);
    if (!m) return undefined;
    if (precargaUsadas.has(claveCompleta)) return undefined;   // ya se usó: leer de la nube
    precargaUsadas.add(claveCompleta);
    if (!m.has(claveCompleta)) {
      // las claves con "fotos" y las globales (__) no vienen en la precarga
      if (/fotos/.test(claveCompleta) || claveCompleta.startsWith('__')) return undefined;
      return null;
    }
    return m.get(claveCompleta);
  }

  window.GH_GET_CUENTA = () => cuentaActiva;
  window.GH_SET_CUENTA = async (codigo) => {
    const c = limpiarCodigo(codigo);
    if (window.GH_ROL === 'visor' && typeof window.GH_MIS_CUENTAS_VISOR === 'function') {
      try {
        const permitidas = await window.GH_MIS_CUENTAS_VISOR();
        if (Array.isArray(permitidas) && permitidas.length && !permitidas.includes(c)) throw new Error('cuenta-no-permitida');
      } catch (e) {
        if (e && e.message === 'cuenta-no-permitida') throw new Error('Esta base de datos no está permitida para tu usuario.');
      }
    }
    // Antes de cambiar de base, terminar de subir lo pendiente
    await Sync.esperarGuardado(10000);
    const { data: { user } } = await client.auth.getUser();
    if (user) {
      const { error } = await client.from('datos_app').upsert({ clave: '__cuenta::' + user.id, valor: c, actualizado_por: user.id, actualizado_en: new Date().toISOString() });
      if (error) throw error;
    }
    cuentaActiva = c;
    precargaMapa = null; precargaPromesa = null;
    return c;
  };

  // Leer / escribir en una base ESPECÍFICA (visor, cheques de varias bases)
  const versionesOtras = new Map();
  window.GH_LEER_DE_CUENTA = async (codigoCuenta, key) => {
    await sesionLista;
    const claveCompleta = key.startsWith('__') ? key : (prefijoDe(codigoCuenta) + key);
    try {
      const { data, error } = await client.from('datos_app').select('valor, actualizado_en').eq('clave', claveCompleta).maybeSingle();
      if (error) throw error;
      versionesOtras.set(claveCompleta, data ? data.actualizado_en : null);
      return data ? data.valor : null;
    } catch (e) {
      versionesOtras.delete(claveCompleta);
      if (key === 'gh-checkin') throw e;   // el check-in necesita saber que no hubo señal
      return null;
    }
  };
  // Escribe solo si nadie lo cambió desde la última lectura; si lo cambiaron,
  // lanza un error "conflicto" para que se vuelva a leer y aplicar.
  window.GH_ESCRIBIR_EN_CUENTA = async (codigoCuenta, key, value) => {
    await sesionLista;
    const clave = prefijoDe(codigoCuenta) + key;
    const fila = { valor: value, actualizado_por: await miUsuarioId(), actualizado_en: new Date().toISOString() };
    if (versionesOtras.has(clave)) {
      const v = versionesOtras.get(clave);
      let res;
      if (v) res = await client.from('datos_app').update(fila).eq('clave', clave).eq('actualizado_en', v).select('actualizado_en');
      else res = await client.from('datos_app').insert({ clave, ...fila }).select('actualizado_en');
      if (res.error && res.error.code !== '23505') throw res.error;
      if (res.error || !res.data || !res.data.length) { versionesOtras.delete(clave); const e = new Error('conflicto'); e.conflicto = true; throw e; }
      versionesOtras.set(clave, res.data[0].actualizado_en);
      return true;
    }
    const { error } = await client.from('datos_app').upsert({ clave, ...fila });
    if (error) throw error;
    return true;
  };

  // ---------- Administración de usuarios y cuentas (solo admin) ----------
  window.GH_LISTAR_USUARIOS = async () => {
    await sesionLista;
    const { data: perfiles, error } = await client.from('perfiles').select('id, nombre, rol, activo');
    if (error) throw error;
    const { data: mapeos } = await client.from('datos_app').select('clave, valor').like('clave', '__cuenta::%');
    const cuentaDe = {};
    (mapeos || []).forEach((m) => { cuentaDe[m.clave.replace('__cuenta::', '')] = m.valor; });
    const { data: visorMapeos } = await client.from('datos_app').select('clave, valor').like('clave', '__visor_cuentas::%');
    const cuentasVisorDe = {};
    (visorMapeos || []).forEach((m) => { try { cuentasVisorDe[m.clave.replace('__visor_cuentas::', '')] = JSON.parse(m.valor) || []; } catch (e) {} });
    return (perfiles || []).map((p) => ({ id: p.id, nombre: p.nombre, rol: p.rol, activo: p.activo, cuenta: cuentaDe[p.id] || 'principal', cuentasVisor: cuentasVisorDe[p.id] || null }));
  };
  async function upsertGlobal(clave, valor) {
    const { data: { user } } = await client.auth.getUser();
    const { error } = await client.from('datos_app').upsert({ clave, valor, actualizado_por: user ? user.id : null, actualizado_en: new Date().toISOString() });
    if (error) throw error;
  }
  window.GH_ASIGNAR_CUENTA = async (userId, codigo) => { await sesionLista; const c = limpiarCodigo(codigo); await upsertGlobal('__cuenta::' + userId, c); return c; };
  window.GH_GUARDAR_CUENTAS_VISOR = async (userId, listaCodigos) => {
    await sesionLista;
    const limpia = [...new Set((listaCodigos || []).map(limpiarCodigo))];
    await upsertGlobal('__visor_cuentas::' + userId, JSON.stringify(limpia));
    return limpia;
  };
  window.GH_OBTENER_CUENTAS_VISOR = async (userId) => {
    await sesionLista;
    const { data } = await client.from('datos_app').select('valor').eq('clave', '__visor_cuentas::' + userId).maybeSingle();
    try { return data && data.valor ? JSON.parse(data.valor) : null; } catch (e) { return null; }
  };
  window.GH_MIS_CUENTAS_VISOR = async () => { if (!window.GH_USER_ID) return null; return window.GH_OBTENER_CUENTAS_VISOR(window.GH_USER_ID); };
  window.GH_ACTUALIZAR_PERFIL = async (userId, cambios) => {
    await sesionLista;
    const { error } = await client.from('perfiles').update(cambios).eq('id', userId);
    if (error) throw error;
  };
  const faltaSql = (error) => /function|schema cache|does not exist/i.test(error.message || '');
  window.GH_ELIMINAR_USUARIO = async (userId) => {
    await sesionLista;
    const { error } = await client.rpc('admin_eliminar_usuario', { p_id: userId });
    if (error) throw new Error(faltaSql(error) ? 'Esta función todavía no está activada en la base de datos.' : error.message);
  };
  window.GH_PONER_CLAVE = async (userId, clave) => {
    await sesionLista;
    const { error } = await client.rpc('admin_poner_clave', { p_id: userId, p_clave: clave });
    if (error) throw new Error(faltaSql(error) ? 'Esta función todavía no está activada en la base de datos.' : error.message);
  };

  // ---------- window.storage (lo que usa toda la app) ----------
  async function leerConReintentos(clave) {
    let ultimo;
    for (let i = 0; i < 3; i++) {
      try { return await (async () => {
        const { data, error } = await client.from('datos_app').select('valor, actualizado_en').eq('clave', clave).maybeSingle();
        if (error) throw error;
        return data;
      })(); } catch (e) { ultimo = e; if (!navigator.onLine) break; await esperar(500 * (i + 1)); }
    }
    throw ultimo;
  }
  // ---------- Copia local (para abrir sin señal) ----------
  // Cada dato que se lee bien de la nube se copia en el teléfono. Si después
  // se abre la app sin señal, se muestra esa copia (en vez de pantallas
  // vacías). Lo que se guarde así se JUNTA con la nube al volver la señal.
  const CACHE_PFX = 'gh-copia:';
  function copiaGuardar(clave, valor) {
    if (/fotos/.test(clave) || typeof valor !== 'string' || valor.length > 300000) return;
    try { localStorage.setItem(CACHE_PFX + (window.GH_USER_ID || '') + ':' + clave, valor); }
    catch (e) {
      // sin espacio: borrar copias viejas y seguir
      try { Object.keys(localStorage).filter((k) => k.startsWith(CACHE_PFX)).forEach((k) => localStorage.removeItem(k)); } catch (e2) {}
    }
  }
  function copiaLeer(clave) {
    try { return localStorage.getItem(CACHE_PFX + (window.GH_USER_ID || '') + ':' + clave); } catch (e) { return null; }
  }

  window.storage = {
    get: async (key) => {
      await sesionLista;
      if (window.GH_ROL === 'visor' && !key.startsWith('__')) throw new Error('not found');
      const clave = claveConCuenta(key);
      // Un cambio de este teléfono que todavía no se sube manda
      const pend = Sync.pendienteDe(clave);
      if (pend !== undefined) return { key, value: pend, shared: false, pendiente: true };
      const pre = await leerPrecarga(clave);
      if (pre === null) { Sync.registrarLeido(clave, false); throw new Error('not found'); }
      if (pre) { Sync.registrarLeido(clave, true, pre.valor, pre.actualizado_en); copiaGuardar(clave, pre.valor); return { key, value: pre.valor, shared: false }; }
      let data;
      try { data = await leerConReintentos(clave); }
      catch (e) {
        // No se pudo leer (señal, sesión). OJO: NO se registra como leído, así
        // que si la app guarda esta clave, se juntará con la nube sin borrarla.
        Sync.lecturaFallida();
        const copia = copiaLeer(clave);
        if (copia != null) return { key, value: copia, shared: false, deCopia: true };
        const err = new Error('not found'); err.sinSenal = true; throw err;
      }
      if (!data) { Sync.registrarLeido(clave, false); throw new Error('not found'); }
      Sync.registrarLeido(clave, true, data.valor, data.actualizado_en);
      copiaGuardar(clave, data.valor);
      return { key, value: data.valor, shared: false };
    },
    set: async (key, value) => {
      await sesionLista;
      if (window.GH_ROL === 'visor') return { key, value, shared: false };
      if (typeof value !== 'string') value = JSON.stringify(value);
      await Sync.guardar(claveConCuenta(key), value);
      return { key, value, shared: false };
    },
    delete: async (key) => {
      await sesionLista;
      if (window.GH_ROL === 'visor') return { key, deleted: false, shared: false };
      const clave = claveConCuenta(key);
      Sync.olvidar(clave);
      const { error } = await client.from('datos_app').delete().eq('clave', clave);
      if (error) throw error;
      Sync.registrarLeido(clave, false);
      return { key, deleted: true, shared: false };
    },
    list: async (prefix) => {
      await sesionLista;
      const pfx = prefijoActual();
      let q = client.from('datos_app').select('clave');
      if (pfx) q = q.like('clave', pfx + (prefix || '') + '%');
      else if (prefix) q = q.like('clave', prefix + '%');
      const { data, error } = await q;
      if (error) throw error;
      let keys = (data || []).map((r) => r.clave);
      if (pfx) keys = keys.filter((k) => k.startsWith(pfx)).map((k) => k.slice(pfx.length));
      else keys = keys.filter((k) => !k.startsWith('c:') && !k.startsWith('__'));
      return { keys, prefix, shared: false };
    }
  };
})();
