
  /* ============================================================
     Control de acceso por rol. El bloque de arriba (gh-oculto-inicial)
     esconde nav/body desde el primer pintado siempre; aquí se decide
     cuándo y qué revelar. En Windows/CRA (sin login, sin
     window.GH_ESPERAR_SESION) se revela de inmediato.
     ============================================================ */
  // Envoltura defensiva: si por algún motivo el módulo de seguridad no cargó,
  // nunca debe dejar a alguien afuera de su propia app — revela directo.
  function revelarConBloqueo() {
    (window.GH_APPLOCK_VERIFICAR_Y_REVELAR || function (cb) { cb(); })(revelarAppNormal);
  }

  if (typeof window.GH_ESPERAR_SESION !== 'function') { revelarConBloqueo(); return; } // no aplica (Windows / CRA) — no hay nada que esperar

  window.GH_ESPERAR_SESION().then(async () => {
    const rol = window.GH_ROL;
    // admin = acceso total (con panel de administración)
    // empleado = acceso normal para editar su base de datos, sin administración
    // visor = una pestaña por cada base de datos que el admin le dio, solo lectura
    if (rol === 'visor') {
      // Arma la interfaz restringida (ya oculta los paneles normales por su
      // cuenta) ANTES de revelar — así el visor nunca ve, ni un instante,
      // la app normal con datos completos.
      await aplicarModoVisorMultiCuenta();
      revelarConBloqueo();
    } else {
      revelarConBloqueo();
    }
  });

  function revelarAppNormal() {
    const oculto = document.getElementById('gh-oculto-inicial');
    if (oculto) oculto.remove();
  }

  // ============================================================
  // MODO VISOR — una pestaña por cada base de datos que el admin
  // le haya dado, cada una con Invoices guardados + Recibo semanal.
  // Todo de solo lectura. (Script aislado: trae sus propias
  // funciones auxiliares — escapeHtml/fmt/etc. de la app principal
  // no son accesibles desde aquí.)
  // ============================================================
  const CHK_KEY = 'gh-checkin';
  const toast = (m, t, d) => { if (window.GH_TOAST) window.GH_TOAST(m, t, d); };
  // Copia del check-in en el teléfono, para abrir sin señal
  const CHK_COPIA = (codigo) => 'gh-chk-copia-' + (window.GH_USER_ID || '') + '-' + codigo;
  function chkCopiaGuardar(codigo, obj) { try { localStorage.setItem(CHK_COPIA(codigo), JSON.stringify(obj)); } catch (e) {} }
  function chkCopiaLeer(codigo) { try { const v = JSON.parse(localStorage.getItem(CHK_COPIA(codigo)) || 'null'); return v && typeof v === 'object' && !Array.isArray(v) ? v : null; } catch (e) { return null; } }
  const esSinPermiso = (e) => !!e && (e.code === '42501' || /row-level security|permission denied|permiso/i.test(e.message || ''));
  function escapeHtmlVisor(str) {
    const d = document.createElement('div');
    d.textContent = str == null ? '' : String(str);
    return d.innerHTML;
  }
  function fmtVisor(n) {
    return '$' + (Number(n) || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }
  // (Este script es aparte: la versión de la app principal no se ve desde aquí)
  function ghFechaLocal(d) {
    d = d || new Date();
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }
  function diaCortoVisor(fechaStr) {
    const d = new Date(fechaStr + 'T00:00:00');
    if (isNaN(d)) return fechaStr;
    const dias = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
    return `${dias[d.getDay()]} ${d.getDate()}`;
  }
  function weekKeyVisor(fechaStr) {
    const d = new Date(fechaStr + 'T00:00:00');
    if (isNaN(d)) return '';
    const day = (d.getDay() + 6) % 7;
    const lunes = new Date(d); lunes.setDate(d.getDate() - day);
    return ghFechaLocal(lunes);
  }
  function weekRangoVisor(weekKey) {
    const lunes = new Date(weekKey + 'T00:00:00');
    const domingo = new Date(lunes); domingo.setDate(lunes.getDate() + 6);
    return { inicio: weekKey, fin: ghFechaLocal(domingo) };
  }
  function fechaCortaVisor(fechaStr) {
    const d = new Date(fechaStr + 'T00:00:00');
    if (isNaN(d)) return fechaStr;
    const meses = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
    return `${d.getDate()} ${meses[d.getMonth()]} ${d.getFullYear()}`;
  }

  async function aplicarModoVisorMultiCuenta() {
    // 1. ¿A qué bases de datos tiene acceso? (el admin las eligió en Ajustes → Avanzado → Usuarios)
    let cuentas = null;
    try { if (typeof window.GH_MIS_CUENTAS_VISOR === 'function') cuentas = await window.GH_MIS_CUENTAS_VISOR(); } catch (e) {}
    if (!Array.isArray(cuentas) || cuentas.length === 0) {
      // Respaldo: si nunca se configuró una lista, usar solo su base de datos de siempre (como antes)
      const activa = (typeof window.GH_GET_CUENTA === 'function') ? window.GH_GET_CUENTA() : 'principal';
      cuentas = [activa];
    }

    // 2. Nombres amigables de cada base de datos
    let listaNombres = [];
    try {
      const r = await window.storage.get('__cuentas_lista');
      listaNombres = JSON.parse(r.value) || [];
    } catch (e) {}
    const ocultas = new Set((listaNombres || []).filter((c) => c && c.escondida).map((c) => c.codigo));
    const visibles = cuentas.filter((c) => !ocultas.has(c));
    if (visibles.length) cuentas = visibles;
    const nombreDe = (codigo) => {
      const enc = listaNombres.find((c) => c.codigo === codigo);
      if (enc && enc.nombre) return enc.nombre;
      return codigo === 'principal' ? 'Principal' : codigo;
    };

    // 3. Cargar SOLO el check-in de cada base de datos permitida (trae los
    //    nombres de los trabajadores, sin sueldos ni nada más)
    const datosPorCuenta = {};
    await Promise.all(cuentas.map(async (codigo) => {
      let checkin = null, sinSenal = false;
      try { const r = await window.GH_LEER_DE_CUENTA(codigo, CHK_KEY); checkin = r ? JSON.parse(r) : {}; }
      catch (e) { sinSenal = true; checkin = chkCopiaLeer(codigo); }
      if (!checkin || typeof checkin !== 'object' || Array.isArray(checkin)) checkin = {};
      if (!sinSenal) chkCopiaGuardar(codigo, checkin);
      datosPorCuenta[codigo] = { nombre: nombreDe(codigo), checkin, sinSenal, leidoEn: sinSenal ? null : new Date().toISOString() };
    }));

    construirInterfazVisor(cuentas, datosPorCuenta);
  }

  function construirInterfazVisor(cuentas, datosPorCuenta) {
    // Ocultar el nav y los paneles normales de la app directamente por JS
    // (más confiable que una hoja de estilos, que puede perder la pelea de
    // especificidad contra el CSS grande de la app).
    document.querySelectorAll('nav.gc-nav > .gc-tab').forEach((t) => {
      t.style.setProperty('display', 'none', 'important');
    });
    document.querySelectorAll('.gc-body > .gc-panel').forEach((p) => {
      p.style.setProperty('display', 'none', 'important');
    });
    document.body.classList.add('gh-modo-visor2');

    const nav = document.querySelector('nav.gc-nav');
    const body = document.querySelector('.gc-body');
    if (!nav || !body) return;

    // ---- Botones de navegación: uno por base de datos + "Ajustes" al final ----
    cuentas.forEach((codigo, i) => {
      const btn = document.createElement('button');
      btn.className = 'gc-tab visor-tab' + (i === 0 ? ' active' : '');
      btn.dataset.visorCuenta = codigo;
      btn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="3.5" width="16" height="17" rx="2.5"/><path d="m8.5 12.5 2.5 2.5 4.5-5"/></svg>';
      btn.appendChild(document.createTextNode(datosPorCuenta[codigo].nombre));
      btn.addEventListener('click', () => activarPanelVisor(codigo));
      nav.appendChild(btn);
    });
    const btnAjustes = document.createElement('button');
    btnAjustes.className = 'gc-tab visor-tab';
    btnAjustes.dataset.visorCuenta = '__ajustes';
    btnAjustes.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/></svg>Mi cuenta';
    btnAjustes.addEventListener('click', () => activarPanelVisor('__ajustes'));
    nav.appendChild(btnAjustes);

    // ---- Un panel por base de datos (Invoices guardados + Recibo semanal) ----
    cuentas.forEach((codigo, i) => {
      const d = datosPorCuenta[codigo];
      const panel = document.createElement('div');
      panel.className = 'gc-panel visor-panel' + (i === 0 ? ' active' : '');
      panel.dataset.visorCuenta = codigo;
      panel.innerHTML = `<div class="chk-cont"></div>`;
      body.appendChild(panel);
      montarCheckinVisor(panel.querySelector('.chk-cont'), codigo, d);
    });

    // ---- Panel de Ajustes (color de acento + cerrar sesión) ----
    const panelAjustes = document.createElement('div');
    panelAjustes.className = 'gc-panel visor-panel';
    panelAjustes.dataset.visorCuenta = '__ajustes';
    const vzNombre = window.GH_NOMBRE || 'Usuario';
    panelAjustes.innerHTML = `
      <section class="vz-perfil">
        <span class="vz-av grande" style="--c:${vzColor(vzNombre)}">${escapeHtmlVisor(vzIniciales(vzNombre))}</span>
        <div><b>${escapeHtmlVisor(vzNombre)}</b><span>Check-in · ${cuentas.map((c) => escapeHtmlVisor(datosPorCuenta[c].nombre)).join(', ')}</span></div>
      </section>

      <div class="vz-card vz-aj">
        <p class="vz-aj-tit">Apariencia</p>
        <div class="gh-tema-seg">
          <button type="button" data-tema-opt="auto"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="9"/><path d="M12 3v18" /><path d="M12 3a9 9 0 0 1 0 18z" fill="currentColor"/></svg>Automático</button>
          <button type="button" data-tema-opt="claro"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>Claro</button>
          <button type="button" data-tema-opt="oscuro"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z"/></svg>Oscuro</button>
        </div>
        <p class="vz-aj-sub">Color</p>
        <div id="visor-accent-picker" class="vz-sws"><button type="button" class="visor-accent-sw" data-accent="cobre" title="Cobre" style="--sw:linear-gradient(135deg,#C46E20,#A2560F);"></button><button type="button" class="visor-accent-sw" data-accent="teal" title="Teal" style="--sw:linear-gradient(135deg,#0E8F82,#0B6F65);"></button><button type="button" class="visor-accent-sw" data-accent="indigo" title="Índigo" style="--sw:linear-gradient(135deg,#4F6FA8,#3A5486);"></button><button type="button" class="visor-accent-sw" data-accent="verde" title="Verde" style="--sw:linear-gradient(135deg,#4E9350,#397239);"></button><button type="button" class="visor-accent-sw" data-accent="azul" title="Azul" style="--sw:linear-gradient(135deg,#2F7BD9,#1F5FB0);"></button><button type="button" class="visor-accent-sw" data-accent="rojo" title="Rojo" style="--sw:linear-gradient(135deg,#C8402F,#A02E20);"></button><button type="button" class="visor-accent-sw" data-accent="morado" title="Morado" style="--sw:linear-gradient(135deg,#7A4FB5,#5E3990);"></button><button type="button" class="visor-accent-sw" data-accent="grafito" title="Grafito" style="--sw:linear-gradient(135deg,#4A4D55,#22242A);"></button></div>
      </div>

      <div class="vz-card vz-aj">
        <p class="vz-aj-tit">Seguridad</p>
        <button type="button" class="vz-aj-fila" id="visor-btn-cambiar-clave"><span>Cambiar contraseña</span><i>›</i></button>
        <div id="visor-cambiar-clave-form" class="vz-clave" style="display:none;">
          <div class="gc-field"><label>Contraseña actual</label><input type="password" id="visor-clave-actual" autocomplete="current-password"></div>
          <div class="gc-field"><label>Contraseña nueva</label><input type="password" id="visor-clave-nueva" autocomplete="new-password"><small>Al menos 6 caracteres, con letras y números.</small></div>
          <div class="gc-field"><label>Repite la nueva</label><input type="password" id="visor-clave-nueva2" autocomplete="new-password"></div>
          <div id="visor-clave-msg" class="vz-clave-msg"></div>
          <div class="vz-clave-btns"><button type="button" class="vz-add-cancel" id="visor-btn-cancelar-clave">Cancelar</button><button type="button" class="vz-add-ok" id="visor-btn-guardar-clave">Guardar</button></div>
        </div>
      </div>

      <button type="button" class="vz-salir" id="visor-btn-cerrar-sesion">Cerrar sesión</button>
    `;
    body.appendChild(panelAjustes);

    // ---- Cambiar contraseña (modo visor) ----
    if (typeof window.GH_CAMBIAR_CONTRASENA === 'function') {
      const vForm = panelAjustes.querySelector('#visor-cambiar-clave-form');
      const vMsg = panelAjustes.querySelector('#visor-clave-msg');
      const vLimpiar = () => {
        ['visor-clave-actual', 'visor-clave-nueva', 'visor-clave-nueva2'].forEach((id) => { const el = panelAjustes.querySelector('#' + id); if (el) el.value = ''; });
        if (vMsg) { vMsg.textContent = ''; vMsg.style.color = 'var(--ember)'; }
      };
      panelAjustes.querySelector('#visor-btn-cambiar-clave').addEventListener('click', () => {
        vForm.style.display = vForm.style.display === 'none' ? 'block' : 'none';
        if (vForm.style.display === 'block') { vLimpiar(); panelAjustes.querySelector('#visor-clave-actual').focus(); }
      });
      panelAjustes.querySelector('#visor-btn-cancelar-clave').addEventListener('click', () => { vForm.style.display = 'none'; vLimpiar(); });
      panelAjustes.querySelector('#visor-btn-guardar-clave').addEventListener('click', async () => {
        const actual = panelAjustes.querySelector('#visor-clave-actual').value;
        const nueva = panelAjustes.querySelector('#visor-clave-nueva').value;
        const nueva2 = panelAjustes.querySelector('#visor-clave-nueva2').value;
        vMsg.style.color = 'var(--ember)';
        if (!actual || !nueva || !nueva2) { vMsg.textContent = 'Llena los tres campos.'; return; }
        if (nueva.length < 6) { vMsg.textContent = 'La nueva debe tener al menos 6 caracteres.'; return; }
        if (!(/[a-zA-Z]/.test(nueva) && /[0-9]/.test(nueva))) { vMsg.textContent = 'La nueva debe tener letras y números.'; return; }
        if (nueva !== nueva2) { vMsg.textContent = 'Las dos contraseñas nuevas no coinciden.'; return; }
        if (nueva === actual) { vMsg.textContent = 'La nueva no puede ser igual a la actual.'; return; }
        const bg = panelAjustes.querySelector('#visor-btn-guardar-clave');
        bg.disabled = true; vMsg.style.color = 'var(--muted)'; vMsg.textContent = 'Guardando…';
        const r = await window.GH_CAMBIAR_CONTRASENA(actual, nueva);
        bg.disabled = false;
        if (r && r.ok) { vForm.style.display = 'none'; vLimpiar(); toast('Contraseña cambiada ✓', 'success', 3000); }
        else { vMsg.style.color = 'var(--ember)'; vMsg.textContent = (r && r.error) || 'No se pudo cambiar.'; }
      });
    }

    // Color de acento (mismo sistema de guardado que el resto de la app: por cuenta, en la nube)
    function aplicarAcentoVisor(nombre) {
      if (nombre === 'cobre') document.documentElement.removeAttribute('data-accent');
      else document.documentElement.setAttribute('data-accent', nombre);
      panelAjustes.querySelectorAll('.visor-accent-sw').forEach((sw) => {
        sw.classList.toggle('active', sw.dataset.accent === nombre);
      });
    }
    (() => {
      let guardado = 'cobre';
      try { guardado = localStorage.getItem('gh-accent-visor') || 'cobre'; } catch (e) {}
      aplicarAcentoVisor(guardado);
    })();
    if (window.GH_TEMA) window.GH_TEMA.aplicar();
    panelAjustes.querySelectorAll('.visor-accent-sw').forEach((sw) => {
      sw.addEventListener('click', async () => {
        aplicarAcentoVisor(sw.dataset.accent);
        try { localStorage.setItem('gh-accent-visor', sw.dataset.accent); } catch (e) {}
      });
    });
    panelAjustes.querySelector('#visor-btn-cerrar-sesion').addEventListener('click', () => {
      if (typeof window.GH_CERRAR_SESION === 'function') window.GH_CERRAR_SESION();
    });

    function activarPanelVisor(codigo) {
      document.querySelectorAll('.visor-tab').forEach((t) => t.classList.toggle('active', t.dataset.visorCuenta === codigo));
      document.querySelectorAll('.visor-panel').forEach((p) => p.classList.toggle('active', p.dataset.visorCuenta === codigo));
    }

    document.body.classList.add('gh-modo-visor');
    aplicarBloqueoEdicionVisor();
  }

  // ============================================================
  // CHECK-IN — el visor marca quién vino y quién no, cada día.
  // Se guarda en "gh-checkin" de esa base de datos:
  //   { "2026-10-08": { v: { "Juan Pérez": 1, "Pedro": 0 }, por, en } }
  // (1 = vino, 0 = no vino, sin nombre = sin marcar). En Nómina →
  // Registrar pago esos días ya salen marcados para que el admin revise.
  // ============================================================
  const CHK_DIAS = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
  const CHK_MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
  const CHK_MAX_ATRAS = 13;   // se puede corregir hasta 2 semanas atrás
  function chkNombre(e) { return ((e && e.apellido) ? (e.nombre + ' ' + e.apellido) : ((e && e.nombre) || '')).trim(); }
  function chkSumarDias(iso, n) { const d = new Date(iso + 'T00:00:00'); d.setDate(d.getDate() + n); return ghFechaLocal(d); }
  function chkHora(isoTs) {
    const d = new Date(isoTs); if (isNaN(d)) return '';
    return d.toLocaleTimeString('es-MX', { hour: 'numeric', minute: '2-digit' });
  }

  const VZ_COLORES = ['#0E8F82', '#C46E20', '#4F6FA8', '#7A4FB5', '#C8402F', '#3F8F45', '#B8860B', '#2F7BD9'];
  function vzIniciales(n) {
    const p = String(n || '').trim().split(/\s+/).filter(Boolean);
    return ((p[0] || '?')[0] + (p.length > 1 ? p[p.length - 1][0] : (p[0] || '')[1] || '')).toUpperCase();
  }
  function vzColor(n) { let h = 0; for (const c of String(n)) h = (h * 31 + c.charCodeAt(0)) >>> 0; return VZ_COLORES[h % VZ_COLORES.length]; }
  // "Carlos Ruiz Pérez" → "Carlos R." (para la tabla de la semana)
  function vzCorto(n) { const p = String(n || '').trim().split(/\s+/); return p.length > 1 ? p[0] + ' ' + p[1][0] + '.' : (p[0] || ''); }
  function vzSaludo() { const h = new Date().getHours(); return h < 12 ? 'Buen día' : h < 19 ? 'Buenas tardes' : 'Buenas noches'; }

  function montarCheckinVisor(cont, codigo, d) {
    if (!cont) return;
    const hoy = ghFechaLocal(new Date());
    const minimo = chkSumarDias(hoy, -CHK_MAX_ATRAS);
    const PEND_KEY = 'gh-chk-pend-' + (window.GH_USER_ID || '') + '-' + codigo;   // cambios sin señal (se guardan al volver)
    try { const viejo = localStorage.getItem('gh-chk-pend-' + codigo); if (viejo && !localStorage.getItem(PEND_KEY)) { localStorage.setItem(PEND_KEY, viejo); } localStorage.removeItem('gh-chk-pend-' + codigo); } catch (e) {}
    let fecha = hoy;
    let vista = 'dia';                // 'dia' | 'semana'
    let filtro = '', chip = 'todos';  // búsqueda y filtro Vinieron / No vinieron
    let estado = '', estadoTipo = '';
    let deshacer = null;              // { dia, antes:{...} } después de un cambio grande
    let agregarAbierto = false, agregando = false;
    let guardando = 0;
    let pendientes = [];
    try { pendientes = JSON.parse(localStorage.getItem(PEND_KEY) || '[]') || []; } catch (e) { pendientes = []; }
    const guardarPend = () => { try { if (pendientes.length) localStorage.setItem(PEND_KEY, JSON.stringify(pendientes)); else localStorage.removeItem(PEND_KEY); } catch (e) {} };

    const norm = (x) => String(x || '').replace(/\s+/g, ' ').trim();
    const vibrar = () => { try { if (navigator.vibrate) navigator.vibrate(8); } catch (e) {} };
    const lunesDe = (iso) => { const x = new Date(iso + 'T00:00:00'); return chkSumarDias(iso, -((x.getDay() + 6) % 7)); };
    const sinAcentos = (t) => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
    const marcadosDe = (f) => ({ ...(((d.checkin[f] || {}).v) || {}) });
    const diaCorto = (f) => { const x = new Date(f + 'T00:00:00'); return `${CHK_DIAS[x.getDay()].slice(0, 3).toLowerCase()} ${x.getDate()}`; };
    const trabajadores = (extraDias) => {
      const lista = Array.isArray(d.checkin._trab) ? d.checkin._trab : [];
      const nuevos = Array.isArray(d.checkin._nuevos) ? d.checkin._nuevos : [];
      const delDia = [];
      (extraDias || [fecha]).forEach((f) => delDia.push(...Object.keys(marcadosDe(f))));
      return [...new Set([...lista, ...nuevos, ...delDia].map(norm).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'es'));
    };
    // último día anterior (hasta 7 atrás) que tenga check-in, para "Igual que…"
    const diaAnteriorConDatos = () => {
      for (let k = 1; k <= 7; k++) { const f = chkSumarDias(fecha, -k); if (f < minimo) break; if (Object.keys(marcadosDe(f)).length) return f; }
      return '';
    };

    function aplicarFiltro() {
      const q = sinAcentos(filtro.trim());
      let visibles = 0;
      cont.querySelectorAll('.chk-fila').forEach((f) => {
        const okQ = !q || sinAcentos(f.dataset.n).includes(q);
        const si = f.classList.contains('es-si');
        const okC = chip === 'todos' || (chip === 'si' ? si : !si);
        const ok = okQ && okC;
        f.style.display = ok ? '' : 'none';
        if (ok) visibles++;
      });
      const vacio = cont.querySelector('.vz-sinres');
      if (vacio) vacio.style.display = visibles ? 'none' : '';
    }

    function htmlHero(si, total) {
      const pct = total ? si / total : 0;
      const lunes = lunesDe(fecha);
      const letras = ['L', 'M', 'M', 'J', 'V', 'S', 'D'];
      const dias = letras.map((l, i) => {
        const f = chkSumarDias(lunes, i);
        const n = Object.keys(marcadosDe(f)).length;
        const off = f > hoy || f < minimo;
        return `<button type="button" class="vz-dia${f === fecha && vista === 'dia' ? ' on' : ''}${f === hoy ? ' hoy' : ''}" data-f="${f}" ${off ? 'disabled' : ''} aria-label="${CHK_DIAS[new Date(f + 'T00:00:00').getDay()]} ${Number(f.slice(8))}">
          <span class="l">${l}</span><span class="n">${Number(f.slice(8))}</span><span class="c">${n ? n : ''}</span></button>`;
      }).join('');
      const sinSenal = pendientes.length
        ? `<div class="vz-offline">Sin señal · ${pendientes.length} cambio${pendientes.length === 1 ? '' : 's'} por guardar</div>`
        : d.sinSenal ? `<div class="vz-offline">Sin señal · viendo lo último guardado</div>`
        : d.leidoEn ? `<button type="button" class="vz-act" title="Traer lo que marcaron desde otro teléfono">Actualizado ${chkHora(d.leidoEn)} <span aria-hidden="true">⟳</span></button>` : '';
      return `
        <section class="vz-hero">
          <div class="vz-hero-top">
            <div class="vz-hero-txt">
              <div class="vz-saludo">${vzSaludo()}${window.GH_NOMBRE ? ', ' + escapeHtmlVisor(window.GH_NOMBRE) : ''}</div>
              <div class="vz-base"><i></i>${escapeHtmlVisor(d.nombre)}</div>
              ${sinSenal}
            </div>
            <div class="vz-ring" style="--p:${(pct * 100).toFixed(1)}" role="img" aria-label="${si} de ${total} vinieron">
              <div><b>${si}</b><span>de ${total}</span></div>
            </div>
          </div>
          <div class="vz-semana">
            <button type="button" class="vz-sem-nav chk-nav" data-nav="-7" aria-label="Semana anterior" ${lunes <= minimo ? 'disabled' : ''}>‹</button>
            <div class="vz-dias">${dias}</div>
            <button type="button" class="vz-sem-nav chk-nav" data-nav="7" aria-label="Semana siguiente" ${chkSumarDias(lunes, 7) > hoy ? 'disabled' : ''}>›</button>
          </div>
          <div class="vz-vista" role="tablist">
            <button type="button" data-vista="dia" class="${vista === 'dia' ? 'on' : ''}">Día</button>
            <button type="button" data-vista="semana" class="${vista === 'semana' ? 'on' : ''}">Semana</button>
          </div>
        </section>`;
    }

    function htmlEstado(quien) {
      const btnDeshacer = deshacer && deshacer.dia === fecha ? ' <button type="button" class="vz-deshacer">Deshacer</button>' : '';
      return `<div class="chk-estado vz-estado ${estadoTipo}">${estado || quien}${btnDeshacer}</div>`;
    }

    function htmlAgregar(total) {
      const valAdd = (cont.querySelector('.chk-add-in') || {}).value || '';
      return agregarAbierto || !total ? `
          <form class="chk-add vz-add" autocomplete="off">
            <input type="text" class="chk-add-in" maxlength="60" placeholder="Nombre del trabajador nuevo" aria-label="Nombre del trabajador nuevo" value="${escapeHtmlVisor(valAdd)}" ${agregando ? 'disabled' : ''}>
            <div class="vz-add-btns">
              ${total ? `<button type="button" class="vz-add-cancel">Cancelar</button>` : ''}
              <button type="submit" class="vz-add-ok" ${agregando ? 'disabled' : ''}>${agregando ? 'Agregando…' : 'Agregar'}</button>
            </div>
            <p class="vz-add-nota">Se marca como que vino ${vista === 'semana' ? 'hoy' : 'este día'}. El sueldo lo pone el administrador.</p>
          </form>`
        : `<button type="button" class="vz-add-abrir">+ Agregar trabajador nuevo</button>`;
    }

    function renderDia() {
      const nombres = trabajadores();
      const reg = d.checkin[fecha] || { v: {} };
      const v = reg.v || {};
      const si = nombres.filter((n) => v[n] === 1).length;
      const total = nombres.length;
      const pct = total ? si / total : 0;
      const dt = new Date(fecha + 'T00:00:00');
      const etiqueta = fecha === hoy ? 'Hoy' : fecha === chkSumarDias(hoy, -1) ? 'Ayer' : '';
      const quien = reg.por ? `Marcado por ${escapeHtmlVisor(reg.por)}${reg.en ? ' · ' + chkHora(reg.en) : ''}` : 'Toca a los que vinieron';
      const ant = !si ? diaAnteriorConDatos() : '';
      const nAnt = ant ? Object.keys(marcadosDe(ant)).filter((n) => nombres.includes(n)).length : 0;
      return htmlHero(si, total) + `
        <div class="vz-dia-head">
          <div style="min-width:0;">
            <div class="vz-fecha">${etiqueta ? `<span class="vz-chip">${etiqueta}</span>` : ''}${CHK_DIAS[dt.getDay()]} ${dt.getDate()} de ${CHK_MESES[dt.getMonth()]}</div>
            ${htmlEstado(quien)}
          </div>
          ${total ? `<button type="button" class="vz-todos chk-todos" data-todos="${si < total ? 1 : 0}">${si < total ? '✓ Todos' : 'Quitar todos'}</button>` : ''}
        </div>
        ${ant && nAnt ? `<button type="button" class="vz-copiar" data-de="${ant}"><span>↺</span> Igual que ${fecha !== hoy || ant !== chkSumarDias(hoy, -1) ? diaCorto(ant) : 'ayer'} <b>${nAnt}</b></button>` : ''}
        <div class="vz-card">
          ${total ? `
          <div class="vz-chips" role="tablist">
            <button type="button" data-chip="todos" class="${chip === 'todos' ? 'on' : ''}">Todos <b>${total}</b></button>
            <button type="button" data-chip="si" class="si ${chip === 'si' ? 'on' : ''}">Vinieron <b>${si}</b></button>
            <button type="button" data-chip="no" class="no ${chip === 'no' ? 'on' : ''}">${si ? 'No vinieron' : 'Sin marcar'} <b>${total - si}</b></button>
          </div>
          <div class="vz-barra" aria-hidden="true"><i style="width:${(pct * 100).toFixed(1)}%"></i></div>
          ${total > 6 ? `<label class="vz-buscar"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg><input type="search" class="vz-q" placeholder="Buscar trabajador" value="${escapeHtmlVisor(filtro)}" autocomplete="off" enterkeyhint="search"></label>` : ''}
          <div class="vz-lista">
            ${nombres.map((n) => `
              <button type="button" class="chk-fila vz-fila${v[n] === 1 ? ' es-si' : ''}" data-n="${escapeHtmlVisor(n)}" aria-pressed="${v[n] === 1}">
                <span class="vz-av" style="--c:${vzColor(n)}">${escapeHtmlVisor(vzIniciales(n))}</span>
                <span class="chk-nom vz-nom">${escapeHtmlVisor(n)}<small>${v[n] === 1 ? 'Vino' : si ? 'No vino' : 'Sin marcar'}</small></span>
                <span class="vz-check" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"><path d="m5 12.5 4.5 4.5L19 7.5"/></svg></span>
              </button>`).join('')}
            <div class="vz-sinres" style="display:none;">Nadie aquí.</div>
          </div>`
          : `<div class="vz-vacio"><div class="vz-vacio-ic">👷</div><b>Todavía no hay trabajadores</b><span>Agrega al primero aquí abajo.</span></div>`}
          ${htmlAgregar(total)}
        </div>
        ${si ? `<button type="button" class="vz-compartir"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v12M7 8l5-5 5 5"/><path d="M5 13v6a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-6"/></svg>Compartir el check-in del día</button>` : ''}`;
    }

    function renderSemana() {
      const lunes = lunesDe(fecha);
      const fechas = [0, 1, 2, 3, 4, 5, 6].map((k) => chkSumarDias(lunes, k));
      const nombres = trabajadores(fechas);
      const letras = ['L', 'M', 'M', 'J', 'V', 'S', 'D'];
      const marcas = fechas.map((f) => marcadosDe(f));
      const totDia = marcas.map((m) => nombres.filter((n) => m[n] === 1).length);
      const siHoy = nombres.filter((n) => marcadosDe(fecha)[n] === 1).length;
      const totSemana = totDia.reduce((a, b) => a + b, 0);
      const ultimo = new Date(fechas[6] + 'T00:00:00');
      const prim = new Date(fechas[0] + 'T00:00:00');
      return htmlHero(siHoy, nombres.length) + `
        <div class="vz-dia-head">
          <div style="min-width:0;">
            <div class="vz-fecha">Semana del ${prim.getDate()}${prim.getMonth() !== ultimo.getMonth() ? ' de ' + CHK_MESES[prim.getMonth()] : ''} al ${ultimo.getDate()} de ${CHK_MESES[ultimo.getMonth()]}</div>
            ${htmlEstado(`${totSemana} día${totSemana === 1 ? "" : "s"} trabajado${totSemana === 1 ? "" : "s"} en total · toca para corregir`)}
          </div>
        </div>
        <div class="vz-card vz-sem-card">
          ${nombres.length ? `
          <div class="vz-tabla" role="grid">
            <div class="vz-tr vz-th"><span class="vz-tn">Trabajador</span>${letras.map((l, i) => `<span class="${fechas[i] === hoy ? 'hoy' : ''}">${l}<small>${Number(fechas[i].slice(8))}</small></span>`).join('')}<span class="vz-tt">Días</span></div>
            ${nombres.map((n) => {
              const dn = marcas.filter((m) => m[n] === 1).length;
              return `<div class="vz-tr"><span class="vz-tn" title="${escapeHtmlVisor(n)}"><i class="vz-pt" style="--c:${vzColor(n)}"></i><em>${escapeHtmlVisor(vzCorto(n))}</em></span>${fechas.map((f, i) => {
                const off = f > hoy || f < minimo;
                const on = marcas[i][n] === 1;
                return `<button type="button" class="vz-cel${on ? ' on' : ''}" data-n="${escapeHtmlVisor(n)}" data-f="${f}" ${off ? 'disabled' : ''} aria-label="${escapeHtmlVisor(n)} ${diaCorto(f)}: ${on ? 'vino' : 'no vino'}">${on ? '✓' : ''}</button>`;
              }).join('')}<span class="vz-tt"><b>${dn}</b></span></div>`;
            }).join('')}
            <div class="vz-tr vz-tf"><span class="vz-tn">Vinieron</span>${totDia.map((t) => `<span>${t || ''}</span>`).join('')}<span class="vz-tt"><b>${totSemana}</b></span></div>
          </div>`
          : `<div class="vz-vacio"><div class="vz-vacio-ic">👷</div><b>Todavía no hay trabajadores</b><span>Agrega al primero aquí abajo.</span></div>`}
          ${htmlAgregar(nombres.length)}
        </div>
        ${totSemana ? `<button type="button" class="vz-compartir vz-compartir-sem"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v12M7 8l5-5 5 5"/><path d="M5 13v6a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-6"/></svg>Compartir la semana</button>` : ''}`;
    }

    function render() {
      const enfAdd = document.activeElement && document.activeElement.classList.contains('chk-add-in');
      const enfQ = document.activeElement && document.activeElement.classList.contains('vz-q');
      cont.innerHTML = vista === 'semana' ? renderSemana() : renderDia();
      if (filtro || chip !== 'todos') aplicarFiltro();
      if (enfAdd) { const i = cont.querySelector('.chk-add-in'); if (i) i.focus(); }
      if (enfQ) { const i = cont.querySelector('.vz-q'); if (i) { i.focus(); i.setSelectionRange(i.value.length, i.value.length); } }
      conectar();
    }

    function conectar() {
      const on = (sel, ev, fn) => cont.querySelectorAll(sel).forEach((el) => el.addEventListener(ev, (e) => fn(el, e)));
      on('.vz-dia', 'click', (b) => { if (b.disabled) return; fecha = b.dataset.f; vista = 'dia'; estado = ''; estadoTipo = ''; deshacer = null; render(); });
      on('.vz-sem-nav', 'click', (b) => {
        let nf = chkSumarDias(fecha, Number(b.dataset.nav));
        if (nf > hoy) nf = hoy;
        if (nf < minimo) nf = minimo;
        fecha = nf; estado = ''; estadoTipo = ''; deshacer = null; render();
      });
      on('.vz-vista button', 'click', (b) => { vista = b.dataset.vista; estado = ''; estadoTipo = ''; render(); });
      on('.chk-fila', 'click', (b) => {
        const n = b.dataset.n; const v = marcadosDe(fecha);
        vibrar(); deshacer = null;
        guardar({ dia: fecha, marcar: { [n]: v[n] === 1 ? null : 1 } });
      });
      on('.vz-cel', 'click', (b) => {
        if (b.disabled) return;
        const v = marcadosDe(b.dataset.f);
        vibrar(); deshacer = null;
        guardar({ dia: b.dataset.f, marcar: { [b.dataset.n]: v[b.dataset.n] === 1 ? null : 1 } });
      });
      on('.chk-todos', 'click', (b) => {
        const nombres = trabajadores();
        const antes = marcadosDe(fecha);
        const marcar = {};
        nombres.forEach((n) => { marcar[n] = b.dataset.todos === '1' ? 1 : null; });
        vibrar();
        deshacer = { dia: fecha, antes };
        guardar({ dia: fecha, marcar }, b.dataset.todos === '1' ? 'Todos marcados ✓' : 'Se quitaron todos');
      });
      on('.vz-copiar', 'click', (b) => {
        const nombres = trabajadores();
        const de = marcadosDe(b.dataset.de);
        const antes = marcadosDe(fecha);
        const marcar = {};
        nombres.forEach((n) => { marcar[n] = de[n] === 1 ? 1 : null; });
        vibrar();
        deshacer = { dia: fecha, antes };
        guardar({ dia: fecha, marcar }, `Copiado de ${diaCorto(b.dataset.de)} ✓`);
      });
      on('.vz-deshacer', 'click', () => {
        if (!deshacer) return;
        const { dia, antes } = deshacer;
        const marcar = {};
        new Set([...Object.keys(marcadosDe(dia)), ...Object.keys(antes)]).forEach((n) => { marcar[n] = antes[n] === 1 ? 1 : null; });
        deshacer = null;
        guardar({ dia, marcar }, 'Listo, quedó como antes');
      });
      on('.vz-chips button', 'click', (b) => {
        chip = b.dataset.chip;
        cont.querySelectorAll('.vz-chips button').forEach((x) => x.classList.toggle('on', x === b));
        aplicarFiltro();
      });
      on('.vz-q', 'input', (q) => { filtro = q.value; aplicarFiltro(); });
      on('.vz-add-abrir', 'click', () => { agregarAbierto = true; render(); const i = cont.querySelector('.chk-add-in'); if (i) i.focus(); });
      on('.vz-add-cancel', 'click', () => { agregarAbierto = false; const i = cont.querySelector('.chk-add-in'); if (i) i.value = ''; render(); });
      on('.chk-add', 'submit', (form, e) => {
        e.preventDefault();
        const inp = cont.querySelector('.chk-add-in');
        const nombre = norm(inp.value);
        if (!nombre) { inp.focus(); return; }
        const ya = trabajadores().find((x) => x.toLowerCase() === nombre.toLowerCase());
        if (ya) { estado = `${escapeHtmlVisor(ya)} ya está en la lista.`; estadoTipo = 'aviso'; render(); return; }
        const dia = vista === 'semana' ? hoy : fecha;
        guardar({ dia, marcar: { [nombre]: 1 }, nuevo: nombre }, `${escapeHtmlVisor(nombre)} agregado ✓`);
      });
      on('.vz-compartir', 'click', (b) => (b.classList.contains('vz-compartir-sem') ? compartirSemana() : compartir()));
      on('.vz-act', 'click', async (b) => { b.disabled = true; b.textContent = 'Actualizando…'; await refrescar(true); render(); });
    }

    async function compartir() {
      const nombres = trabajadores();
      const v = marcadosDe(fecha);
      const si = nombres.filter((n) => v[n] === 1), no = nombres.filter((n) => v[n] !== 1);
      const dt = new Date(fecha + 'T00:00:00');
      const texto = `Check-in ${d.nombre} · ${CHK_DIAS[dt.getDay()]} ${dt.getDate()} de ${CHK_MESES[dt.getMonth()]}\n\n` +
        `✅ Vinieron (${si.length}):\n${si.map((n) => '• ' + n).join('\n') || '—'}\n\n` +
        `❌ No vinieron (${no.length}):\n${no.map((n) => '• ' + n).join('\n') || '—'}`;
      try {
        if (navigator.share) { await navigator.share({ text: texto }); return; }
      } catch (e) { if (e && e.name === 'AbortError') return; }
      try { await navigator.clipboard.writeText(texto); estado = 'Copiado — pégalo en WhatsApp'; estadoTipo = 'ok'; }
      catch (e) { estado = 'No se pudo compartir en este teléfono'; estadoTipo = 'error'; }
      render();
    }

    async function compartirSemana() {
      const lunes = lunesDe(fecha);
      const fechas = [0, 1, 2, 3, 4, 5, 6].map((k) => chkSumarDias(lunes, k));
      const nombres = trabajadores(fechas);
      const ini = new Date(fechas[0] + 'T00:00:00'), fin = new Date(fechas[6] + 'T00:00:00');
      const lineas = nombres.map((n) => {
        const dias = fechas.filter((f) => marcadosDe(f)[n] === 1);
        return dias.length ? `• ${n}: ${dias.length} día${dias.length === 1 ? '' : 's'} (${dias.map(diaCorto).join(', ')})` : '';
      }).filter(Boolean);
      const texto = `Check-in ${d.nombre} · semana del ${ini.getDate()}${ini.getMonth() !== fin.getMonth() ? ' de ' + CHK_MESES[ini.getMonth()] : ''} al ${fin.getDate()} de ${CHK_MESES[fin.getMonth()]}\n\n${lineas.join('\n') || '—'}`;
      try { if (navigator.share) { await navigator.share({ text: texto }); return; } } catch (e) { if (e && e.name === 'AbortError') return; }
      try { await navigator.clipboard.writeText(texto); estado = 'Copiado — pégalo en WhatsApp'; estadoTipo = 'ok'; }
      catch (e) { estado = 'No se pudo compartir en este teléfono'; estadoTipo = 'error'; }
      render();
    }

    function aplicar(obj, cambio) {
      if (cambio.nuevo) {
        obj._nuevos = Array.isArray(obj._nuevos) ? obj._nuevos : [];
        if (!obj._nuevos.includes(cambio.nuevo)) obj._nuevos.push(cambio.nuevo);
        obj._trab = Array.isArray(obj._trab) ? obj._trab : [];
        if (!obj._trab.includes(cambio.nuevo)) obj._trab.push(cambio.nuevo);
      }
      const dia = cambio.dia;
      const reg = obj[dia] && typeof obj[dia] === 'object' ? obj[dia] : { v: {} };
      reg.v = reg.v || {};
      Object.entries(cambio.marcar || {}).forEach(([n, val]) => { if (val === 1) reg.v[n] = 1; else delete reg.v[n]; });
      // solo se guardan los que vinieron (los que no están marcados no fueron)
      Object.keys(reg.v).forEach((n) => { if (reg.v[n] !== 1) delete reg.v[n]; });
      reg.por = window.GH_NOMBRE || 'visor';
      reg.en = cambio.en || new Date().toISOString();
      if (Object.keys(reg.v).length) obj[dia] = reg; else delete obj[dia];
    }

    // Sube a la nube una lista de cambios (lee lo último y aplica encima)
    // Si otro teléfono guardó en el mismo instante, se vuelve a leer y se
    // aplica encima (antes el último en guardar borraba lo del otro).
    async function subir(cambios) {
      for (let intento = 0; ; intento++) {
        let actual = {};
        const r = await window.GH_LEER_DE_CUENTA(codigo, CHK_KEY);   // si no hay señal, esto falla
        try { actual = r ? JSON.parse(r) : {}; } catch (e) { actual = {}; }
        if (!actual || typeof actual !== 'object' || Array.isArray(actual)) actual = {};
        cambios.forEach((c) => aplicar(actual, c));
        const corte = chkSumarDias(hoy, -120);   // solo los últimos 120 días
        Object.keys(actual).forEach((k) => { if (/^\d{4}-\d{2}-\d{2}$/.test(k) && k < corte) delete actual[k]; });
        try { await window.GH_ESCRIBIR_EN_CUENTA(codigo, CHK_KEY, JSON.stringify(actual)); return actual; }
        catch (e) { if (!(e && e.conflicto) || intento >= 4) throw e; }
      }
    }

    let cola = Promise.resolve();
    let enCola = [];   // cambios tocados que todavía no se suben
    const reaplicarCola = () => enCola.forEach((c) => aplicar(d.checkin, c));
    function guardar(cambio, textoOk) {
      cambio.en = new Date().toISOString();
      enCola.push(cambio);
      aplicar(d.checkin, cambio);   // se ve al instante
      estado = 'Guardando…'; estadoTipo = 'guardando';
      if (cambio.nuevo) agregando = true;
      render();
      guardando++;
      cola = cola.then(async () => {
        try {
          // primero lo que se quedó pendiente sin señal, luego este cambio
          d.checkin = await subir([...pendientes, cambio]);
          chkCopiaGuardar(codigo, d.checkin); d.sinSenal = false; d.leidoEn = new Date().toISOString();
          enCola = enCola.filter((c) => c !== cambio);
          reaplicarCola();   // lo que tocó mientras se guardaba sigue viéndose
          pendientes = []; guardarPend();
          estado = textoOk || ('Guardado ✓ ' + chkHora(new Date().toISOString()));
          estadoTipo = 'ok';
          if (cambio.nuevo) { agregarAbierto = false; const i = cont.querySelector('.chk-add-in'); if (i) i.value = ''; }
        } catch (e) {
          enCola = enCola.filter((c) => c !== cambio);
          if (esSinPermiso(e)) {
            // No es falta de señal: el admin quitó el permiso. No se queda
            // esperando para siempre; se deshace en pantalla y se avisa.
            try { const r = await window.GH_LEER_DE_CUENTA(codigo, CHK_KEY); d.checkin = r ? JSON.parse(r) : d.checkin; } catch (e2) {}
            estado = 'No tienes permiso para marcar aquí. Pídele al administrador que te dé acceso.'; estadoTipo = 'error';
          } else {
            pendientes.push(cambio); guardarPend();
            estado = 'Sin señal — se guarda solo cuando vuelva'; estadoTipo = 'aviso';
          }
          if (cambio.nuevo) agregarAbierto = false;
        }
        agregando = false;
        guardando--;
        render();
      });
    }

    // Reintenta lo pendiente cuando vuelve la señal
    async function reintentar() {
      if (!pendientes.length || guardando) return;
      guardando++;
      cola = cola.then(async () => {
        try {
          d.checkin = await subir(pendientes);
          chkCopiaGuardar(codigo, d.checkin); d.sinSenal = false; d.leidoEn = new Date().toISOString();
          reaplicarCola();
          pendientes = []; guardarPend();
          estado = 'Ya se guardó lo que tenías pendiente ✓'; estadoTipo = 'ok';
        } catch (e) {
          if (esSinPermiso(e)) { pendientes = []; guardarPend(); estado = 'No tienes permiso para marcar aquí. Pídele al administrador que te dé acceso.'; estadoTipo = 'error'; }
        }
        guardando--;
        render();
      });
    }

    // Trae lo que otros marcaron desde otro teléfono (al volver a la app y cada minuto)
    async function refrescar(forzado) {
      if (guardando || pendientes.length || (document.hidden && !forzado)) return;
      try {
        const r = await window.GH_LEER_DE_CUENTA(codigo, CHK_KEY);
        const nuevo = r ? JSON.parse(r) : {};
        if (!nuevo || typeof nuevo !== 'object' || Array.isArray(nuevo)) return;
        const eraSinSenal = d.sinSenal;
        d.sinSenal = false; d.leidoEn = new Date().toISOString(); chkCopiaGuardar(codigo, nuevo);
        const act = cont.querySelector('.vz-act'); if (act && !forzado) act.firstChild.textContent = 'Actualizado ' + chkHora(d.leidoEn) + ' ';
        if (JSON.stringify(nuevo) === JSON.stringify(d.checkin)) { if (eraSinSenal || forzado) render(); return; }
        if (guardando) return;
        d.checkin = nuevo;
        const activo = document.activeElement;
        if (activo && cont.contains(activo) && /INPUT/.test(activo.tagName)) return; // no estorbar si está escribiendo
        render();
      } catch (e) { if (forzado) { d.sinSenal = true; estado = 'Sin señal — no se pudo actualizar'; estadoTipo = 'aviso'; } }
    }
    window.addEventListener('online', () => { reintentar(); refrescar(); });
    document.addEventListener('visibilitychange', () => { if (!document.hidden) { reintentar(); refrescar(); } });
    setInterval(() => { if (pendientes.length) reintentar(); else refrescar(); }, 60000);

    // Si quedó algo sin guardar de antes (sin señal), se muestra y se reintenta
    if (pendientes.length) { pendientes.forEach((c) => aplicar(d.checkin, c)); setTimeout(reintentar, 500); }
    render();
  }

  // Bloqueo de edición: por si algún elemento interactivo quedara dentro de
  // estos paneles nuevos, no se puede editar nada (todo es texto/tablas, pero
  // esto es un respaldo).
  function aplicarBloqueoEdicionVisor() {
    // El visor ya solo tiene su check-in; lo que puede guardar lo controla la
    // base de datos (solo "gh-checkin" de sus bases). No hace falta candado
    // aquí, y el viejo bloqueaba también el formulario de la contraseña.
    document.body.classList.add('gh-visor-v2');
  }
