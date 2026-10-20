  // ====================================================================
  // MÓDULO: PAPELES IMPORTANTES
  // ====================================================================
  let papelesFiltroActual = 'Todos';

  function parsearPapel(nombre) {
    // formato: [Categoria] nombre-real.pdf
    const m = nombre.match(/^\[([^\]]+)\]\s*(.+)$/);
    return m ? { cat: m[1], nombre: m[2] } : { cat: 'Otro', nombre };
  }

  async function renderPapeles() {
    const lista = $('papeles-lista');
    const filtros = $('papeles-filtros');
    lista.innerHTML = '';
    filtros.innerHTML = '';

    const archivos = await window.ghArchivos.papelesListar();
    const parsed = archivos.map(f => ({ archivo: f, ...parsearPapel(f) }));

    // Categorías que existen
    const cats = ['Todos', ...new Set(parsed.map(p => p.cat))];
    cats.forEach(cat => {
      const btn = document.createElement('button');
      btn.className = 'gc-action-btn';
      btn.style.cssText = 'padding:5px 14px;font-size:12px;' + (cat === papelesFiltroActual ? 'background:var(--ink);color:#fff;' : '');
      btn.textContent = cat;
      btn.addEventListener('click', () => { papelesFiltroActual = cat; renderPapeles(); });
      filtros.appendChild(btn);
    });

    const visibles = papelesFiltroActual === 'Todos' ? parsed : parsed.filter(p => p.cat === papelesFiltroActual);

    if (visibles.length === 0) {
      lista.innerHTML = '<div class="doc-empty" style="padding:40px;text-align:center;color:var(--text-muted);">No hay papeles en esta categoría.<br>Usa "+ Subir PDF" para agregar documentos.</div>';
      return;
    }

    // Agrupar por categoría
    const grupos = {};
    visibles.forEach(p => { if (!grupos[p.cat]) grupos[p.cat] = []; grupos[p.cat].push(p); });

    Object.entries(grupos).forEach(([cat, docs]) => {
      const seccion = document.createElement('div');
      seccion.style.marginBottom = '24px';
      seccion.innerHTML = `<p style="font-family:'Zilla Slab',serif;font-weight:600;font-size:14px;color:var(--ink);margin-bottom:10px;">${escapeHtml(cat)}</p>`;
      const docList = document.createElement('div');
      docList.className = 'doc-list';
      docs.forEach(p => {
        const item = document.createElement('div');
        item.className = 'doc-item';
        item.innerHTML = `
          <div class="doc-info">
            <div class="doc-name">${escapeHtml(p.nombre)}</div>
            <div class="doc-cat">${escapeHtml(cat)}</div>
          </div>
          <button class="gc-action-btn" data-i18n="abrir" style="padding:4px 12px;font-size:12px;" data-archivo="${escapeHtml(p.archivo)}">Abrir</button>
          <button class="gc-del" data-archivo="${escapeHtml(p.archivo)}">✕</button>
        `;
        item.querySelector('.gc-action-btn').addEventListener('click', async () => {
          await window.ghArchivos.papelesAbrir(p.archivo);
        });
        item.querySelector('.gc-del').addEventListener('click', async () => {
          if (!await gcConfirm(`¿Borrar "${p.nombre}"?`, { okText: 'Borrar', danger: true })) return;
          await window.ghArchivos.papelesEliminar(p.archivo);
          renderPapeles();
        });
        docList.appendChild(item);
      });
      seccion.appendChild(docList);
      lista.appendChild(seccion);
    });
  }

  // ---- Subida de papeles via <input file> ----
  const _inputPapel = document.createElement('input');
  _inputPapel.type = 'file'; _inputPapel.accept = '.pdf';
  _inputPapel.style.display = 'none';
  document.body.appendChild(_inputPapel);

  $('btn-subir-papel').addEventListener('click', () => {
    _inputPapel.value = ''; _inputPapel.click();
  });

  _inputPapel.addEventListener('change', async () => {
    const file = _inputPapel.files[0];
    if (!file) return;
    const cat = $('papeles-cat-nueva').value;
    // Quitar caracteres inválidos del nombre antes de enviarlo
    const nombreBase = file.name.replace(/[/\\:*?"<>|]/g, '-');
    const nombreFinal = `[${cat.replace(/[/\\:*?"<>|]/g, '-')}] ${nombreBase}`;
    try {
      const buffer = Array.from(new Uint8Array(await file.arrayBuffer()));
      await window.ghArchivos.papelesSubirBuffer({ nombreArchivo: nombreFinal, buffer });
      papelesFiltroActual = cat;
      renderPapeles();
    } catch(e) { toast('Error al subir: ' + e.message, 'error', 4000); }
  });

  // ---- Sub-pestañas de Ajustes (General, Empleados, Papeles, Categorías) ----
  document.querySelectorAll('.aj-subtab').forEach((tab) => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.aj-subtab').forEach((t) => t.classList.remove('active'));
      document.querySelectorAll('.aj-subpanel').forEach((p) => p.classList.remove('active'));
      tab.classList.add('active');
      const sub = tab.dataset.asub;
      $('aj-sub-' + sub).classList.add('active');
      // Inicializar cada sección al abrirla
      if (sub === 'documentacion') { loadEmpleados().then(() => renderEmpleados()); renderPapeles(); }
      if (sub === 'categorias') { renderCategorias(); }
      if (sub === 'general') { cargarFormAjustes(); }
      if (sub === 'avanzado') { if (typeof cargarFormAjustes === 'function') cargarFormAjustes(); }
    });
  });

  // ---- Sub-pestañas dentro de Documentación (Empleados / Papeles) ----
  document.querySelectorAll('.doc-subtab').forEach((tab) => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.doc-subtab').forEach((t) => t.classList.remove('active'));
      document.querySelectorAll('.doc-subpanel').forEach((p) => p.classList.remove('active'));
      tab.classList.add('active');
      $('doc-sub-' + tab.dataset.dsub).classList.add('active');
      if (tab.dataset.dsub === 'empleados') { loadEmpleados().then(() => renderEmpleados()); }
      if (tab.dataset.dsub === 'papeles') { renderPapeles(); }
    });
  });

  // Solo admin: nombres de socios, y la sub-pestaña Documentación.
  // Se llama al iniciar sesión (para que empleados nunca las vean) y cada
  // vez que se abre Ajustes → General.
  function ajAplicarRestriccionesRol() {
    const esAdminGral = (window.GH_ROL || 'admin') === 'admin';
    const cardSocios = $('aj-card-socios'); if (cardSocios) cardSocios.style.display = esAdminGral ? 'block' : 'none';
    const tabDoc = $('aj-subtab-documentacion'); if (tabDoc) tabDoc.style.display = esAdminGral ? '' : 'none';
    const tabAvanzado = $('aj-subtab-avanzado'); if (tabAvanzado) tabAvanzado.style.display = esAdminGral ? '' : 'none';
    // Payroll (cheques, Zelle/cash, 1099) solo para el admin
    const tabPay = document.querySelector('.gc-tab[data-tab="payroll"]');
    if (tabPay) {
      tabPay.style.display = esAdminGral ? '' : 'none';
      if (!esAdminGral && tabPay.classList.contains('active')) { const t = document.querySelector('.gc-tab[data-tab="movimientos"]'); if (t) t.click(); }
    }
    // Datos de factura: visibles para todos, pero solo el admin puede editarlos
    ['aj-factura-nombre', 'aj-direccion-empresa'].forEach((id) => {
      const el = $(id); if (el) el.disabled = !esAdminGral;
    });
    const btnGuardarFactura = $('aj-btn-guardar-factura'); if (btnGuardarFactura) btnGuardarFactura.style.display = esAdminGral ? '' : 'none';
    const notaFacturaSoloAdmin = $('aj-factura-solo-admin-nota'); if (notaFacturaSoloAdmin) notaFacturaSoloAdmin.style.display = esAdminGral ? 'none' : 'block';
    if (!esAdminGral) {
      // Si por alguna razón quedó activa una sub-pestaña restringida, regresar a General
      const activa = document.querySelector('.aj-subtab.active');
      if (activa && (activa.dataset.asub === 'documentacion' || activa.dataset.asub === 'avanzado')) {
        document.querySelector('.aj-subtab[data-asub="general"]')?.click();
      }
    }
    return esAdminGral;
  }

  // ===================== RESPALDO AUTOMÁTICO (solo admin) =====================
  // Cada 7 días (al abrir la app) se guarda una copia de los datos de la base
  // de datos activa y otra del registro de Payroll, en la nube, sin las fotos.
  // Se conservan las últimas 4 copias de cada una.
  const RB_DIAS = 7, RB_SLOTS = 4;
  const rbEsAdmin = () => (window.GH_ROL || 'admin') === 'admin';
  const rbCuenta = () => (typeof window.GH_GET_CUENTA === 'function' && window.GH_GET_CUENTA()) || 'principal';
  const rbMetaKey = (n) => '__gh-respaldo-meta::' + n;
  const rbDatoKey = (n, slot) => '__gh-respaldo::' + n + '::' + slot;
  async function rbLeerMeta(n) {
    try { const r = await window.storage.get(rbMetaKey(n)); const v = JSON.parse(r.value); return Array.isArray(v) ? v : []; } catch (e) { return []; }
  }
  async function rbJuntarDatos(n) {
    let keys;
    if (n === 'payroll') keys = ['__gh-cheques', '__gh-cheques-cfg', '__gh-1099-info'];
    else {
      const l = await window.storage.list('');
      keys = (l.keys || []).filter((k) => !k.startsWith('__') && !/fotos/i.test(k) && !k.startsWith('gh-cfg-cache'));
    }
    const pares = await Promise.all(keys.map((k) => window.storage.get(k).then((r) => [k, r.value]).catch(() => null)));
    const datos = {}; pares.filter(Boolean).forEach(([k, v]) => { datos[k] = v; });
    return datos;
  }
  async function rbHacer(n) {
    const datos = await rbJuntarDatos(n);
    const cuantos = Object.keys(datos).length;
    if (!cuantos) return null;
    const meta = await rbLeerMeta(n);
    const ult = meta.length ? meta.slice().sort((a, b) => b.fecha.localeCompare(a.fecha))[0] : null;
    const slot = ult ? (ult.slot + 1) % RB_SLOTS : 0;
    const fecha = new Date().toISOString();
    await window.storage.set(rbDatoKey(n, slot), JSON.stringify({ app: 'GH Manager', tipo: 'respaldo-automatico', nombre: n, fecha, datos }));
    const nueva = meta.filter((m) => m.slot !== slot).concat([{ slot, fecha, n: cuantos }]);
    await window.storage.set(rbMetaKey(n), JSON.stringify(nueva));
    return { slot, fecha, n: cuantos };
  }
  async function rbAuto() {
    if (!rbEsAdmin() || window.__rbCorrio) return;
    window.__rbCorrio = true;
    try {
      for (const n of [rbCuenta(), 'payroll']) {
        const meta = await rbLeerMeta(n);
        const ult = meta.length ? meta.map((m) => m.fecha).sort().pop() : null;
        if (!ult || (Date.now() - new Date(ult).getTime()) > RB_DIAS * 86400000) await rbHacer(n);
      }
    } catch (e) {}
  }
  const rbFechaTxt = (iso) => new Date(iso).toLocaleDateString('es-MX', { day: 'numeric', month: 'short', year: 'numeric' });
  async function rbRender() {
    const card = $('rb-card'); if (!card) return;
    card.style.display = rbEsAdmin() ? '' : 'none';
    if (!rbEsAdmin()) return;
    const cuenta = rbCuenta();
    const [mDb, mPay] = await Promise.all([rbLeerMeta(cuenta), rbLeerMeta('payroll')]);
    const ord = (m) => m.slice().sort((a, b) => b.fecha.localeCompare(a.fecha));
    const ultDb = ord(mDb)[0];
    $('rb-estado').innerHTML = ultDb
      ? `Último respaldo de esta base de datos: <b>${rbFechaTxt(ultDb.fecha)}</b> (${ultDb.n} grupos de datos). Se hace solo cada ${RB_DIAS} días.`
      : 'Todavía no hay respaldo de esta base de datos. Se hace solo la próxima vez que abras la app, o dale "Respaldar ahora".';
    const fila = (n, m, restaurar) => `<div class="rb-fila"><span>${rbFechaTxt(m.fecha)}<small>${n === 'payroll' ? 'Payroll (cheques, Zelle, 1099)' : 'Esta base de datos'} · ${m.n} grupos</small></span>
      <span><button type="button" class="gc-action-btn rb-baja" data-n="${escapeHtml(n)}" data-s="${m.slot}">Descargar</button>${restaurar ? `<button type="button" class="gc-action-btn rb-rest" data-n="${escapeHtml(n)}" data-s="${m.slot}">Restaurar</button>` : ''}</span></div>`;
    $('rb-lista').innerHTML = ord(mDb).map((m) => fila(cuenta, m, true)).join('') + ord(mPay).slice(0, 2).map((m) => fila('payroll', m, false)).join('');
    $('rb-lista').querySelectorAll('.rb-baja').forEach((b) => b.addEventListener('click', async () => {
      try {
        const r = await window.storage.get(rbDatoKey(b.dataset.n, b.dataset.s));
        const url = URL.createObjectURL(new Blob([r.value], { type: 'application/json' }));
        const a = document.createElement('a'); a.href = url; a.download = `respaldo-${b.dataset.n}-${ghFechaLocal(new Date())}.json`; document.body.appendChild(a); a.click(); a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 5000);
      } catch (e) { toast('No se pudo descargar ese respaldo', 'error'); }
    }));
    $('rb-lista').querySelectorAll('.rb-rest').forEach((b) => b.addEventListener('click', async () => {
      try {
        const r = await window.storage.get(rbDatoKey(b.dataset.n, b.dataset.s));
        const dato = JSON.parse(r.value);
        if (!await gcConfirm(`¿Restaurar el respaldo del ${rbFechaTxt(dato.fecha)}?\n\nLos datos actuales de esta base de datos se reemplazan por los de ese día. Antes se guarda una copia de los datos de ahora.`, { okText: 'Restaurar', danger: true })) return;
        await rbHacer(rbCuenta());
        for (const [k, v] of Object.entries(dato.datos || {})) await window.storage.set(k, v);
        toast('Respaldo restaurado. Recargando…', 'success', 2500);
        setTimeout(() => location.reload(), 1500);
      } catch (e) { toast('No se pudo restaurar', 'error'); }
    }));
  }
  if ($('rb-ahora')) $('rb-ahora').addEventListener('click', async () => {
    const b = $('rb-ahora'); b.disabled = true; b.textContent = 'Respaldando…';
    try { await rbHacer(rbCuenta()); await rbHacer('payroll'); toast('Respaldo guardado', 'success'); }
    catch (e) { toast('No se pudo guardar el respaldo', 'error'); }
    b.disabled = false; b.textContent = 'Respaldar ahora'; rbRender();
  });
  setTimeout(() => { try { rbAuto(); } catch (e) {} }, 9000);

  // ---- Opciones: nombres de socios + datos de factura (en la nube) ----
  function cargarFormAjustes() {
    ajAplicarRestriccionesRol();
    try { rbRender(); } catch (e) {}
    if (typeof ajRefrescarPreviewLogo === 'function') ajRefrescarPreviewLogo();

    ajSociosEdit = cfgSocios.map((s) => ({ ...s }));
    if ($('aj-tasa-taxas')) $('aj-tasa-taxas').value = String(+(TASA_TAXAS * 100).toFixed(2));
    if (typeof ajRenderSociosLista === 'function') ajRenderSociosLista();
    $('aj-factura-nombre').value = cfgFacturaNombre;
    $('aj-direccion-empresa').value = cfgFacturaDireccion;
    // Casilla: nombre de factura sigue al socio principal
    aplicarFacturaSigueSocio(cfgFacturaSigueSocio);
    ajMostrarPanelesAdmin();
  }

  // Cuenta actual + tarjetas de admin (Bases de datos, Usuarios). Se llama al
  // iniciar sesión (para que no dependa de dar click en algo primero) y cada
  // vez que se abre Ajustes → General.
  function ajMostrarPanelesAdmin() {
    if (typeof window.GH_GET_CUENTA === 'function') {
      $('aj-cuenta-actual').value = 'cargando…';
      ajCargarCuentas().then(() => {
        const actual = window.GH_GET_CUENTA();
        $('aj-cuenta-actual').value = ajNombreDe(actual);
        const esAdmin = (window.GH_ROL || 'admin') === 'admin';
        // Menú para cambiar de base de datos (solo admin)
        $('aj-switch-wrap').style.display = esAdmin ? 'block' : 'none';
        if (esAdmin) ajLlenarSelect($('aj-cuenta-select'), actual);
        // Tarjetas de admin
        const cardBD = $('aj-card-bd'); if (cardBD) cardBD.style.display = esAdmin ? 'block' : 'none';
        const cardAdmin = $('aj-card-admin'); if (cardAdmin) cardAdmin.style.display = (esAdmin && typeof window.GH_LISTAR_USUARIOS === 'function') ? 'block' : 'none';
        if (esAdmin) { ajRenderBD(); if (typeof window.GH_LISTAR_USUARIOS === 'function') ajCargarUsuarios(); }
      });
    } else {
      const wrap = $('aj-card-cuentas'); if (wrap) wrap.style.display = 'none';
    }
  }
  // ---- Lista dinámica de socios (agregar / editar / quitar) ----
  let ajSociosEdit = []; // copia de trabajo mientras se edita, no se guarda hasta dar "Guardar"

  function ajRenderSociosLista() {
    const cont = $('aj-socios-lista');
    if (!cont) return;
    const cabecera = `
      <div style="display:flex;gap:10px;align-items:center;padding:12px 14px;margin-bottom:6px;background:var(--accent-bg);border-radius:var(--r-sm);">
        <div style="flex:1;min-width:0;">
          <div style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.5px;color:var(--muted);">Empresa (recibe los ajustes)</div>
          <div style="font-size:13.5px;font-weight:700;color:var(--ink);">${escapeHtml(cfgFacturaNombre || 'Empresa')}</div>
        </div>
        <div style="font-size:11px;color:var(--muted);text-align:right;">Se cambia arriba,<br>en Name of Company</div>
      </div>`;
    const filas = ajSociosEdit.map((s, i) => `
      <div class="aj-socio-row" data-idx="${i}" style="display:flex;gap:10px;align-items:end;padding:12px 0;${i > 0 ? 'border-top:1px solid var(--border-soft);' : ''}">
        <div class="gc-field" style="flex:2;min-width:0;">
          <label>Socio ${i + 1}</label>
          <input type="text" class="aj-socio-nombre" data-idx="${i}" placeholder="Nombre del socio" value="${escapeHtml(s.nombre)}">
        </div>
        <div class="gc-field" style="flex:0 0 90px;min-width:0;">
          <label data-i18n="tax">Tax %</label>
          <input type="text" inputmode="decimal" class="aj-socio-bonopct" data-idx="${i}" value="${s.bonoPct}">
        </div>
        <button type="button" class="gc-del aj-socio-del" data-idx="${i}" title="Quitar socio">✕</button>
      </div>`).join('');
    const vacio = `<p style="font-size:12.5px;color:var(--muted);padding:10px 0;">Sin socios — la empresa se lleva el 100% de cada semana.</p>`;
    cont.innerHTML = cabecera + (ajSociosEdit.length ? filas : vacio);
    cont.querySelectorAll('.aj-socio-del').forEach((btn) => {
      btn.addEventListener('click', () => {
        ajSociosEdit.splice(Number(btn.dataset.idx), 1);
        ajRenderSociosLista();
      });
    });
  }
  if ($('aj-btn-add-socio')) {
    $('aj-btn-add-socio').addEventListener('click', () => {
      ajSociosEdit.push({ id: 'socio-' + Date.now(), nombre: '', bonoPct: 0 });
      ajRenderSociosLista();
    });
  }

  // Casilla: el nombre de factura/nómina sigue al Socio 2 (o al único socio, si es uno solo)
  function aplicarFacturaSigueSocio(activo) {
    $('aj-factura-nombre-wrap').style.display = activo ? 'none' : 'block';
    if (activo) $('aj-factura-nombre').value = cfgSocioMitad;
  }

  // Guardar socios (nombres + % de bono de cada uno)
  if ($('aj-btn-guardar-socios')) {
    $('aj-btn-guardar-socios').addEventListener('click', async () => {
      const filas = Array.from(document.querySelectorAll('.aj-socio-row'));
      const nuevos = filas.map((fila) => {
        const idx = Number(fila.dataset.idx);
        const nombre = fila.querySelector('.aj-socio-nombre').value.trim();
        const bonoPct = Math.max(0, Math.min(100, parseFloat((fila.querySelector('.aj-socio-bonopct').value || '0').replace(',', '.')) || 0));
        return { id: (ajSociosEdit[idx] && ajSociosEdit[idx].id) || ('socio-' + Date.now() + '-' + idx), nombre, bonoPct };
      });
      if (nuevos.some((s) => !s.nombre)) { toast('Escribe el nombre de todos los socios', 'error'); return; }
      // Tax de la semana (% de los ingresos que se aparta antes de repartir)
      const tasaTxt = ($('aj-tasa-taxas').value || '').replace(',', '.').trim();
      const tasaNum = parseFloat(tasaTxt);
      if (tasaTxt !== '' && (isNaN(tasaNum) || tasaNum < 0 || tasaNum >= 100)) {
        toast('El tax debe ser un número entre 0 y 99', 'error'); return;
      }
      if (tasaTxt !== '') TASA_TAXAS = tasaNum / 100;

      cfgSocios = nuevos;
      actualizarAliasSocios();
      ajSociosEdit = cfgSocios.map((s) => ({ ...s }));
      // Si la factura/nómina sigue al socio principal (2° o único), actualizar su nombre también
      if (cfgFacturaSigueSocio) { cfgFacturaNombre = cfgSocioMitad; if ($('aj-factura-nombre')) $('aj-factura-nombre').value = cfgFacturaNombre; }
      await guardarConfig();
      aplicarNombresEstaticos();
      renderReparto();
      if (typeof renderBusqueda === 'function') renderBusqueda();
      ajRenderSociosLista();
      renderMovimientos();
      toast('Socios y tax guardados ✓', 'success');
    });
  }

  // Guardar datos de factura (nombre + dirección) — en la nube
  // ---- Forzar actualización de la app desde Ajustes ----
  if ($('btn-forzar-actualizacion')) {
    $('btn-forzar-actualizacion').addEventListener('click', async () => {
      const btn = $('btn-forzar-actualizacion');
      const status = $('forzar-act-status');
      if (!('serviceWorker' in navigator)) {
        status.textContent = 'Tu navegador no soporta esto. Cierra la app por completo y ábrela de nuevo.';
        return;
      }
      btn.disabled = true;
      status.textContent = 'Buscando una versión nueva…';
      try {
        const reg = await navigator.serviceWorker.getRegistration();
        if (!reg) {
          status.textContent = 'No se pudo revisar. Cierra la app por completo y ábrela de nuevo.';
          btn.disabled = false;
          return;
        }
        await reg.update();
        // Dar tiempo a que, si hay una versión nueva, termine de instalarse
        // (esto dispara los mismos avisos 'updatefound'/'statechange' de siempre).
        const esperar = (ms) => new Promise((r) => setTimeout(r, ms));
        await esperar(1500);
        if (!reg.waiting && reg.installing) await esperar(1500); // seguía instalando, dar un poco más de tiempo
        if (reg.waiting) {
          status.textContent = 'Encontramos una versión nueva — actualizando…';
          reg.waiting.postMessage('skip-waiting');
          // El listener de controllerchange que ya existe recarga la página solo.
        } else {
          status.textContent = `Ya tienes la versión más reciente (${APP_VERSION}).`;
          btn.disabled = false;
        }
      } catch (e) {
        status.textContent = 'No se pudo revisar la actualización. Intenta de nuevo.';
        btn.disabled = false;
      }
    });
  }

  $('aj-btn-guardar-factura').addEventListener('click', async () => {
    cfgFacturaNombre = $('aj-factura-nombre').value.trim() || cfgFacturaNombre;
    cfgFacturaDireccion = $('aj-direccion-empresa').value.trim();
    await guardarConfig();
    // Reflejar la dirección en el formulario de factura si existe
    const invDir = $('inv-direccion-emisor');
    if (invDir) invDir.value = cfgFacturaDireccion;
    aplicarNombresEstaticos();
    toast('Datos de la empresa guardados ✓', 'success');
  });

  // ---- Bases de datos con nombre + administración (solo admin) ----
  let ajCuentas = []; // [{codigo, nombre}]

  function ajSlug(nombre) {
    return (nombre || '').trim().toLowerCase().replace(/[^a-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '') || ('bd-' + Date.now());
  }
  function ajNombreDe(codigo) {
    const c = ajCuentas.find((x) => x.codigo === codigo);
    if (c) return c.nombre;
    if (codigo === 'principal' && typeof ajPrincipal !== 'undefined') return ajPrincipal.nombre;
    return codigo;
  }

  // La principal ahora también se puede renombrar y quitar de la lista.
  // Su nombre y si está oculta se guardan en la misma lista, como una
  // entrada más con codigo 'principal'. (Sus datos nunca se borran.)
  let ajPrincipal = { codigo: 'principal', nombre: 'Principal (información original)', oculta: false };
  // Se arma la lista nueva aparte y se cambia de una sola vez al final: antes
  // se vaciaba y se llenaba con pausas en medio, y si dos partes de la app la
  // cargaban al mismo tiempo (Ajustes y el selector de Principal) las bases
  // salían repetidas un momento.
  async function ajCargarCuentas() {
    const nuevas = [];
    let guardadas = null;
    try { const r = await window.storage.get('__cuentas_lista'); guardadas = JSON.parse(r.value); } catch (e) {}
    if (!Array.isArray(guardadas)) { try { guardadas = JSON.parse(localStorage.getItem('gh-cuentas-cache') || 'null'); } catch (e) {} }
    else { try { localStorage.setItem('gh-cuentas-cache', JSON.stringify(guardadas)); } catch (e) {} }
    const pr = Array.isArray(guardadas) ? guardadas.find((c) => c && c.codigo === 'principal') : null;
    ajPrincipal = { codigo: 'principal', nombre: (pr && pr.nombre) || 'Principal (información original)', oculta: !!(pr && (pr.oculta || pr.borrada)), borrada: !!(pr && pr.borrada), escondida: !!(pr && pr.escondida) };
    // "escondida" = no sale en el selector de Principal ni en Nómina (sigue existiendo y se ve en Ajustes)
    if (!ajPrincipal.oculta) nuevas.push({ codigo: 'principal', nombre: ajPrincipal.nombre, ...(ajPrincipal.escondida ? { escondida: true } : {}) });
    if (Array.isArray(guardadas)) guardadas.forEach((c) => {
      if (c && c.codigo && c.codigo !== 'principal' && !nuevas.some((x) => x.codigo === c.codigo)) nuevas.push({ codigo: c.codigo, nombre: c.nombre || c.codigo, ...(c.escondida ? { escondida: true } : {}) });
    });
    ajCuentas = nuevas;
    return ajCuentas;
  }
  async function ajGuardarCuentas() {
    const enLista = ajCuentas.find((c) => c.codigo === 'principal');
    if (enLista) { ajPrincipal.nombre = enLista.nombre; ajPrincipal.escondida = !!enLista.escondida; }
    ajPrincipal.oculta = !enLista;
    const vistos = new Set(['principal']);
    const guardar = [{ codigo: 'principal', nombre: ajPrincipal.nombre, oculta: ajPrincipal.oculta || !!ajPrincipal.borrada, ...(ajPrincipal.borrada ? { borrada: true } : {}), ...(ajPrincipal.escondida ? { escondida: true } : {}) },
      ...ajCuentas.filter((c) => c.codigo !== 'principal' && !vistos.has(c.codigo) && vistos.add(c.codigo))];
    await window.storage.set('__cuentas_lista', JSON.stringify(guardar));
    try { localStorage.setItem('gh-cuentas-cache', JSON.stringify(guardar)); } catch (e) {}
  }

  // Rellena un <select> con las bases de datos
  function ajLlenarSelect(sel, seleccionado) {
    if (!sel) return;
    sel.innerHTML = ajCuentas.map((c) => `<option value="${escapeHtml(c.codigo)}"${c.codigo === seleccionado ? ' selected' : ''}>${escapeHtml(c.nombre)}</option>`).join('');
  }

  // Render de la lista de bases de datos (admin)
  function ajRenderBD() {
    const cont = $('aj-bd-lista');
    if (!cont) return;
    const actual = (window.GH_GET_CUENTA && window.GH_GET_CUENTA()) || 'principal';
    cont.innerHTML = ajCuentas.map((c) => `
      <div class="aj-bd-fila" data-codigo="${escapeHtml(c.codigo)}" style="display:flex;justify-content:space-between;align-items:center;gap:10px;padding:8px 0;border-bottom:1px solid var(--border);">
        <div class="aj-bd-nombre" style="flex:1;min-width:0;${c.escondida ? 'opacity:.6;' : ''}"><span style="font-weight:600;">${escapeHtml(c.nombre)}</span> <span style="font-size:11px;color:var(--muted);">(${escapeHtml(c.codigo)})${c.codigo === actual ? ' · <strong style="color:var(--accent-dk);">en uso</strong>' : ''}${c.escondida ? ' · oculta' : ''}</span></div>
        <div style="display:flex;gap:6px;flex-shrink:0;flex-wrap:wrap;justify-content:flex-end;">
          <button type="button" class="gc-action-btn aj-bd-ocultar" data-codigo="${escapeHtml(c.codigo)}" title="${c.escondida ? 'Que vuelva a salir en Principal y en Nómina' : 'Que no salga en Principal ni en Nómina'}" style="padding:4px 10px;font-size:12px;">${c.escondida ? 'Mostrar' : 'Ocultar'}</button>
          <button type="button" class="gc-action-btn aj-bd-ren" data-codigo="${escapeHtml(c.codigo)}" style="padding:4px 10px;font-size:12px;">✎ Nombre</button>
          <button class="gc-del aj-bd-del" data-codigo="${escapeHtml(c.codigo)}">✕</button>
        </div>
      </div>`).join('') + (ajPrincipal.oculta && !ajPrincipal.borrada ? `
      <p style="font-size:11.5px;color:var(--muted);margin-top:10px;">"${escapeHtml(ajPrincipal.nombre)}" está quitada de la lista. <button type="button" class="gc-action-btn" id="aj-bd-reponer" style="padding:3px 10px;font-size:11.5px;">Volver a mostrarla</button></p>` : '');
    // Ocultar / mostrar: la base no se borra, solo deja de salir en Principal y en Nómina
    cont.querySelectorAll('.aj-bd-ocultar').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const cu = ajCuentas.find((c) => c.codigo === btn.dataset.codigo); if (!cu) return;
        if (cu.escondida) delete cu.escondida; else cu.escondida = true;
        try { await ajGuardarCuentas(); } catch (e) { toast('No se pudo guardar', 'error'); return; }
        ajRenderBD();
        try { ghBDHeroPintar(); } catch (e) {}
        toast(cu.escondida ? `"${cu.nombre}" ya no sale en Principal ni en Nómina` : `"${cu.nombre}" vuelve a salir`, 'success');
      });
    });
    // Cambiar el nombre (el código interno no cambia, así los datos siguen en su lugar)
    cont.querySelectorAll('.aj-bd-ren').forEach((btn) => {
      btn.addEventListener('click', () => {
        const fila = btn.closest('.aj-bd-fila'), caja = fila.querySelector('.aj-bd-nombre');
        const cu = ajCuentas.find((c) => c.codigo === btn.dataset.codigo); if (!cu) return;
        caja.innerHTML = `<div style="display:flex;gap:6px;"><input type="text" class="aj-bd-ren-in" value="${escapeHtml(cu.nombre)}" style="flex:1;min-width:0;font-family:'Inter',sans-serif;font-size:13.5px;padding:7px 10px;border:1.5px solid var(--border);border-radius:8px;"><button type="button" class="gc-save-btn aj-bd-ren-ok" style="padding:6px 12px;font-size:12.5px;">Guardar</button></div>`;
        btn.style.display = 'none';
        const inp = caja.querySelector('input'); inp.focus(); inp.select();
        const guardar = async () => {
          const nuevo = inp.value.trim();
          if (!nuevo) { toast('Escribe un nombre', 'error'); return; }
          cu.nombre = nuevo;
          try { await ajGuardarCuentas(); } catch (e) { toast('No se pudo guardar el nombre', 'error'); return; }
          ajRenderBD();
          ajLlenarSelect($('aj-cuenta-select'), window.GH_GET_CUENTA && window.GH_GET_CUENTA());
          if ($('aj-cuenta-actual')) $('aj-cuenta-actual').value = ajNombreDe(window.GH_GET_CUENTA ? window.GH_GET_CUENTA() : 'principal');
          toast('Nombre cambiado ✓', 'success');
        };
        caja.querySelector('.aj-bd-ren-ok').addEventListener('click', guardar);
        inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') guardar(); if (e.key === 'Escape') ajRenderBD(); });
      });
    });
    if ($('aj-bd-reponer')) $('aj-bd-reponer').addEventListener('click', async () => {
      ajCuentas.unshift({ codigo: 'principal', nombre: ajPrincipal.nombre });
      await ajGuardarCuentas(); ajRenderBD();
      ajLlenarSelect($('aj-cuenta-select'), window.GH_GET_CUENTA && window.GH_GET_CUENTA());
      toast('Base de datos de vuelta en la lista ✓', 'success');
    });
    cont.querySelectorAll('.aj-bd-del').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const cod = btn.dataset.codigo;
        if (ajCuentas.length <= 1) { toast('Tiene que quedar al menos una base de datos', 'error'); return; }
        if (cod === actual) {
          // Es la que estás usando: se quita de la lista y te cambias a otra en el mismo paso
          const otra = ajCuentas.find((c) => c.codigo !== cod);
          if (typeof window.GH_SET_CUENTA !== 'function') { toast('Solo funciona con sesión en la nube', 'info'); return; }
          if (!await gcConfirm(`Estás usando "${ajNombreDe(cod)}". ¿Quitarla de la lista y cambiarte a "${otra.nombre}"?\n\nSu información no se borra; la puedes volver a poner en la lista cuando quieras.`, { okText: 'Quitar y cambiar', danger: true })) return;
          ajCuentas = ajCuentas.filter((c) => c.codigo !== cod);
          try { await ajGuardarCuentas(); await window.GH_SET_CUENTA(otra.codigo); }
          catch (e) { toast('No se pudo quitar: ' + ((e && e.message) || e), 'error', 5000); await ajCargarCuentas(); ajRenderBD(); return; }
          toast('Quitada. Cambiando a ' + otra.nombre + '…', 'success');
          setTimeout(() => location.reload(), 700);
          return;
        }
        if (!await gcConfirm(`¿Quitar la base de datos "${ajNombreDe(cod)}" de la lista? La información no se borra, pero dejará de aparecer para elegir o asignar.`, { okText: 'Quitar', danger: true })) return;
        ajCuentas = ajCuentas.filter((c) => c.codigo !== cod);
        await ajGuardarCuentas();
        ajRenderBD();
        ajLlenarSelect($('aj-cuenta-select'), window.GH_GET_CUENTA && window.GH_GET_CUENTA());
        toast('Base de datos quitada de la lista', 'info');
      });
    });
  }

  // Crear una base de datos nueva con nombre
  if ($('aj-btn-add-bd')) {
    $('aj-btn-add-bd').addEventListener('click', async () => {
      const nombre = ($('aj-bd-nueva').value || '').trim();
      if (!nombre) { toast('Escribe un nombre para la base de datos', 'error'); return; }
      const codigo = ajSlug(nombre);
      if (ajCuentas.some((c) => c.codigo === codigo)) { toast('Ya existe una base de datos con ese nombre', 'info'); return; }
      ajCuentas.push({ codigo, nombre });
      try {
        await ajGuardarCuentas();
      } catch (e) {
        ajCuentas = ajCuentas.filter((c) => c.codigo !== codigo); // revertir
        const detalle = (e && (e.message || e.msg)) ? (e.message || e.msg) : String(e);
        toast('No se pudo crear. Puede que tu usuario no sea admin en Supabase. Detalle: ' + detalle, 'error', 6000);
        return;
      }
      $('aj-bd-nueva').value = '';
      ajRenderBD();
      ajLlenarSelect($('aj-cuenta-select'), window.GH_GET_CUENTA && window.GH_GET_CUENTA());
      ajCargarUsuarios();
      toast('Base de datos creada ✓', 'success');
    });
  }

  // Cambiar la base de datos que ve el usuario actual (menú)
  if ($('aj-btn-cambiar-cuenta')) {
    $('aj-btn-cambiar-cuenta').addEventListener('click', async () => {
      if (typeof window.GH_SET_CUENTA !== 'function') { toast('Solo funciona con sesión en la nube', 'info'); return; }
      const codigo = $('aj-cuenta-select').value;
      const actual = window.GH_GET_CUENTA();
      if (codigo === actual) { toast('Ya estás en esa base de datos', 'info'); return; }
      if (!await gcConfirm(`¿Ver la base de datos "${ajNombreDe(codigo)}"?`, { okText: 'Cambiar' })) return;
      await window.GH_SET_CUENTA(codigo);
      toast('Cambiando…', 'success');
      setTimeout(() => location.reload(), 700);
    });
  }

  // ---- Cambiar de base de datos desde Principal (solo admin) ----
  // Usa las mismas piezas que Ajustes → Bases de datos: la lista (ajCuentas),
  // GH_SET_CUENTA y recargar. Para los demás roles el selector queda oculto.
  function ghBDHeroEsAdmin() {
    return typeof window.GH_GET_CUENTA === 'function' && typeof window.GH_SET_CUENTA === 'function' &&
           (window.GH_ROL || 'admin') === 'admin';
  }
  function ghBDHeroPintar() {
    const wrap = $('gh-bd'), sel = $('gh-bd-select');
    if (!wrap || !sel) return;
    if (!ghBDHeroEsAdmin()) { wrap.style.display = 'none'; return; }
    const actual = window.GH_GET_CUENTA();
    const lista = (ajCuentas || []).filter((c) => !c.escondida || c.codigo === actual).map((c) => ({ codigo: c.codigo, nombre: c.nombre }));
    // Si la base actual no está en la lista (p. ej. fue quitada), igual se muestra
    if (!lista.some((c) => c.codigo === actual)) lista.unshift({ codigo: actual, nombre: ajNombreDe(actual) });
    sel.innerHTML = lista.map((c) => `<option value="${escapeHtml(c.codigo)}"${c.codigo === actual ? ' selected' : ''}>${escapeHtml(c.nombre)}</option>`).join('');
    sel.value = actual;
    $('gh-bd-nombre').textContent = ajNombreDe(actual);
    wrap.style.display = 'inline-flex';
    wrap.title = lista.length > 1 ? 'Cambiar de base de datos' : 'Base de datos en uso';
  }
  async function ghBDHeroIniciar() {
    if (!$('gh-bd')) return;
    if (!ghBDHeroEsAdmin()) { $('gh-bd').style.display = 'none'; return; }
    try { await ajCargarCuentas(); } catch (e) {}
    ghBDHeroPintar();
  }
  if ($('gh-bd-select')) {
    $('gh-bd-select').addEventListener('change', async (e) => {
      const sel = e.target;
      const codigo = sel.value;
      const actual = window.GH_GET_CUENTA();
      if (codigo === actual) return;
      if (!await gcConfirm(`¿Cambiar a la base de datos "${ajNombreDe(codigo)}"?`, { okText: 'Cambiar' })) { sel.value = actual; return; }
      try { await window.GH_SET_CUENTA(codigo); }
      catch (err) { sel.value = actual; toast('No se pudo cambiar de base de datos', 'error'); return; }
      toast('Cambiando a ' + ajNombreDe(codigo) + '…', 'success');
      setTimeout(() => location.reload(), 600);
    });
    // Al arrancar: esperar a saber el rol (con login en la nube) y pintar
    if (typeof window.GH_ESPERAR_SESION === 'function') {
      Promise.resolve(window.GH_ESPERAR_SESION()).catch(() => {}).then(ghBDHeroIniciar);
    } else {
      ghBDHeroIniciar();
    }
  }

  async function ajCargarUsuarios() {
    const cont = $('aj-usuarios-lista');
    const msg = $('aj-usuarios-msg');
    if (!cont) return;
    cont.innerHTML = '<p style="font-size:13px;color:var(--muted);">Cargando usuarios…</p>';
    msg.textContent = '';
    if (typeof window.GH_LISTAR_USUARIOS !== 'function') { cont.innerHTML = ''; msg.textContent = 'Solo disponible con sesión en la nube.'; return; }
    let usuarios;
    try { usuarios = await window.GH_LISTAR_USUARIOS(); }
    catch (e) { cont.innerHTML = ''; msg.textContent = 'No se pudo leer la lista de usuarios. Puede que Supabase no permita al admin ver a los demás (hay que ajustar permisos). Detalle: ' + (e.message || e); return; }
    if (!usuarios || usuarios.length === 0) { cont.innerHTML = ''; msg.textContent = 'No hay usuarios para mostrar.'; return; }
    if (usuarios.length === 1) msg.textContent = 'Solo se ve tu propio usuario. Si esperabas ver más, hay que dar permiso en Supabase para que el admin lea todos los perfiles.';
    else msg.textContent = '';

    cont.innerHTML = '';
    usuarios.forEach((u) => {
      // Asegurar que la cuenta del usuario aparezca en el menú aunque no esté en la lista
      const opciones = ajCuentas.slice();
      if (!opciones.some((c) => c.codigo === u.cuenta)) opciones.push({ codigo: u.cuenta, nombre: u.cuenta });
      const optsHtml = opciones.map((c) => `<option value="${escapeHtml(c.codigo)}"${c.codigo === u.cuenta ? ' selected' : ''}>${escapeHtml(c.nombre)}</option>`).join('');
      // Checkboxes de bases de datos permitidas, solo relevante para rol "visor"
      const visorSeleccionadas = new Set(u.cuentasVisor || []);
      const checksHtml = opciones.map((c) => `
        <label style="display:flex;align-items:center;gap:7px;padding:6px 0;font-size:13px;color:var(--ink);cursor:pointer;font-weight:400;">
          <input type="checkbox" class="admin-visor-cuenta-chk" data-id="${u.id}" value="${escapeHtml(c.codigo)}"${visorSeleccionadas.has(c.codigo) ? ' checked' : ''} style="width:15px;height:15px;">
          ${escapeHtml(c.nombre)}
        </label>`).join('');
      const card = document.createElement('div');
      card.className = 'us-card';
      const esYo = u.id === window.GH_USER_ID;
      const inicial = escapeHtml(((u.nombre || '?').trim()[0] || '?').toUpperCase());
      const rolTxt = { admin: 'Admin', empleado: 'Empleado', visor: 'Visor' }[u.rol] || u.rol;
      card.innerHTML = `
        <div class="us-head">
          <div class="us-av">${inicial}</div>
          <div><div class="us-nom">${escapeHtml(u.nombre || '(sin nombre)')}${esYo ? ' · tú' : ''}</div><div class="us-sub">${escapeHtml(rolTxt)}</div></div>
          <span class="us-badge ${u.activo ? 'on' : 'off'}">${u.activo ? 'Activo' : 'Pendiente'}</span>
        </div>
        <div class="us-grid">
          <div class="gc-field"><label data-i18n="base_de_datos_que_ve">Base de datos que ve</label>
            <select class="admin-cuenta-sel" data-id="${u.id}">${optsHtml}</select>
          </div>
          <div class="gc-field"><label data-i18n="rol">Rol</label>
            <select class="admin-rol-sel" data-id="${u.id}">
              <option value="admin" data-i18n="admin_edita_todo"${u.rol === 'admin' ? ' selected' : ''}>Admin (edita todo)</option>
              <option value="empleado" data-i18n="empleado_edita_su_base_de_datos"${u.rol === 'empleado' ? ' selected' : ''}>Empleado (edita su base de datos)</option>
              <option value="visor" data-i18n="visor_solo_lectura"${u.rol === 'visor' ? ' selected' : ''}>Visor (solo lectura)</option>
            </select>
          </div>
        </div>
        <div class="admin-visor-cuentas-wrap us-visor" data-id="${u.id}" style="display:${u.rol === 'visor' ? 'block' : 'none'};">
          <p class="us-visor-t">Bases de datos que puede ver</p>
          <p style="font-size:11.5px;color:var(--muted);margin-bottom:4px;">Marca las que quieras. Sin ninguna marcada, usa solo la de arriba.</p>
          ${checksHtml}
        </div>
        <div class="us-acc">
          <button class="gc-save-btn admin-guardar" data-i18n="guardar_cambios" data-id="${u.id}">Guardar cambios</button>
          <button class="us-ghost admin-toggle-activo" data-id="${u.id}" data-activo="${u.activo ? '1' : '0'}">${u.activo ? 'Desactivar' : 'Aprobar / activar'}</button>
          ${esYo ? '' : `<button class="us-ghost admin-clave" data-id="${u.id}" data-nombre="${escapeHtml(u.nombre || '')}">Nueva contraseña</button>
          <span class="us-sp"></span>
          <button class="us-del admin-eliminar" data-id="${u.id}" data-nombre="${escapeHtml(u.nombre || '')}">Eliminar</button>`}
        </div>
        <div class="us-clave-out"></div>`;
      cont.appendChild(card);
    });

    // Mostrar/ocultar la lista de bases de datos del visor según el rol elegido
    cont.querySelectorAll('.admin-rol-sel').forEach((sel) => {
      sel.addEventListener('change', () => {
        const wrap = cont.querySelector(`.admin-visor-cuentas-wrap[data-id="${sel.dataset.id}"]`);
        if (wrap) wrap.style.display = sel.value === 'visor' ? 'block' : 'none';
      });
    });

    // Guardar (base de datos + rol + bases de datos del visor)
    cont.querySelectorAll('.admin-guardar').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const id = btn.dataset.id;
        const cuenta = cont.querySelector(`.admin-cuenta-sel[data-id="${id}"]`).value;
        const rol = cont.querySelector(`.admin-rol-sel[data-id="${id}"]`).value;
        try {
          await window.GH_ASIGNAR_CUENTA(id, cuenta);
          await window.GH_ACTUALIZAR_PERFIL(id, { rol });
          if (rol === 'visor' && typeof window.GH_GUARDAR_CUENTAS_VISOR === 'function') {
            const marcadas = Array.from(cont.querySelectorAll(`.admin-visor-cuenta-chk[data-id="${id}"]:checked`)).map((c) => c.value);
            await window.GH_GUARDAR_CUENTAS_VISOR(id, marcadas);
          }
          toast('Cambios guardados ✓', 'success');
        } catch (e) { toast('No se pudo guardar: ' + (e.message || e), 'error', 4000); }
      });
    });
    // Activar / desactivar
    cont.querySelectorAll('.admin-toggle-activo').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const id = btn.dataset.id;
        const nuevo = btn.dataset.activo !== '1';
        try {
          await window.GH_ACTUALIZAR_PERFIL(id, { activo: nuevo });
          toast(nuevo ? 'Usuario activado ✓' : 'Usuario desactivado', 'success');
          ajCargarUsuarios();
        } catch (e) { toast('No se pudo cambiar: ' + (e.message || e), 'error', 4000); }
      });
    });
    // Nueva contraseña (no se pueden ver las actuales: están cifradas)
    cont.querySelectorAll('.admin-clave').forEach((btn) => {
      btn.addEventListener('click', async () => {
        if (typeof window.GH_PONER_CLAVE !== 'function') return;
        if (!await gcConfirm(`¿Poner una contraseña nueva a "${btn.dataset.nombre || 'este usuario'}"? La anterior dejará de funcionar.`, { okText: 'Generar' })) return;
        const abc = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ', num = '23456789';
        const rnd = (set, n) => Array.from(crypto.getRandomValues(new Uint32Array(n))).map((x) => set[x % set.length]).join('');
        const clave = rnd(abc, 6) + rnd(num, 3) + rnd(abc, 1);
        try {
          await window.GH_PONER_CLAVE(btn.dataset.id, clave);
          const out = btn.closest('.us-card').querySelector('.us-clave-out');
          out.innerHTML = `<div class="us-clave">Contraseña nueva: <code>${escapeHtml(clave)}</code><div style="font-size:11.5px;color:var(--muted);margin-top:4px;">Cópiala y mándasela ahora. Después ya no se puede volver a ver.</div></div>`;
          try { await navigator.clipboard.writeText(clave); toast('Contraseña copiada ✓', 'success'); } catch (e) { toast('Contraseña cambiada ✓', 'success'); }
        } catch (e) { toast('No se pudo: ' + (e.message || e), 'error', 5000); }
      });
    });
    // Eliminar usuario
    cont.querySelectorAll('.admin-eliminar').forEach((btn) => {
      btn.addEventListener('click', async () => {
        if (typeof window.GH_ELIMINAR_USUARIO !== 'function') return;
        if (!await gcConfirm(`¿Eliminar a "${btn.dataset.nombre || 'este usuario'}" para siempre? Ya no podrá entrar. Los datos de la base de datos no se borran.`, { okText: 'Eliminar', danger: true })) return;
        try {
          await window.GH_ELIMINAR_USUARIO(btn.dataset.id);
          toast('Usuario eliminado', 'success');
          ajCargarUsuarios();
        } catch (e) { toast('No se pudo eliminar: ' + (e.message || e), 'error', 5000); }
      });
    });
  }

  if ($('aj-btn-refrescar-usuarios')) {
    $('aj-btn-refrescar-usuarios').addEventListener('click', ajCargarUsuarios);
  }

