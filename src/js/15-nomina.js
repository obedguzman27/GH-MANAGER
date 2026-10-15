  // ====================================================================
  // MÓDULO: NÓMINA (pagos a trabajadores)
  // ====================================================================
  const NOM_KEY = 'gh-nomina'; // entradas de pago
  const TRAB_NOM_KEY_VIEJO = 'gh-trabajadores'; // formato viejo [{nombre, sueldo}] — solo para migrar una vez
  let nomDocs = [];
  let nomCheckin = {};   // check-in que hace el visor: { fecha: { v: { nombre: 1|0 }, por, en } }
  const NOM_CHK_KEY = 'gh-checkin';
  async function nomCargarCheckin() {
    try { const r = await window.storage.get(NOM_CHK_KEY); const v = JSON.parse(r.value); nomCheckin = (v && typeof v === 'object' && !Array.isArray(v)) ? v : {}; }
    catch (e) { nomCheckin = {}; }
  }

  const nomFmt = n => { const v = Math.round((Number(n) || 0) * 100) / 100; return (v < 0 ? '-$' : '$') + Math.abs(v).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); };
  const nomToday = () => ghFechaLocal(new Date());

  // Los trabajadores de Nómina AHORA viven en Empleados (empleados[]). Busca
  // por nombre completo (o solo nombre, para los que no tienen apellido).
  function nomBuscarTrab(nombre) {
    const n = (nombre || '').trim().toLowerCase();
    if (!n) return null;
    return empleados.find((e) => empNombreCompleto(e).toLowerCase() === n);
  }

  // Migra una sola vez la lista vieja de "gh-trabajadores" (si existe) hacia
  // Empleados, para no perder sueldos ya configurados. No duplica: si el
  // nombre ya existe en Empleados, lo deja como está.
  async function nomMigrarTrabajadoresViejos(listaVieja) {
    const lista = (listaVieja || []).map((t) => typeof t === 'string' ? { nombre: t, sueldo: 0 } : { nombre: t.nombre || '', sueldo: Number(t.sueldo) || 0 });
    let cambiaron = false;
    lista.forEach((t) => {
      if (!t.nombre || nomBuscarTrab(t.nombre)) return;
      empleados.push({
        id: 'emp-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6),
        nombre: t.nombre, apellido: '', rol: '', estado: 'activo', sueldo: t.sueldo,
        tel: '', email: '', inicio: '', ss: '', emergencia: '', direccion: '', notas: ''
      });
      cambiaron = true;
    });
    if (cambiaron) await saveEmpleados();
    // Esta migración debe correr UNA sola vez: si la lista vieja se queda
    // guardada, cada vez que se abre Nómina vuelve a copiar esos nombres —
    // y un empleado que borraste "revive" solo. Por eso, una vez copiada,
    // se borra la lista vieja.
    try {
      if (window.storage.delete) await window.storage.delete(TRAB_NOM_KEY_VIEJO);
      else await window.storage.set(TRAB_NOM_KEY_VIEJO, '[]');
    } catch (e) {
      try { await window.storage.set(TRAB_NOM_KEY_VIEJO, '[]'); } catch (e2) {}
    }
  }

  // Sub-tabs
  document.querySelectorAll('.nom-subtab').forEach((tab) => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.nom-subtab').forEach((t) => t.classList.remove('active'));
      document.querySelectorAll('.nom-subpanel').forEach((p) => p.classList.remove('active'));
      tab.classList.add('active');
      $('nom-sub-' + tab.dataset.nsub).classList.add('active');
      if (tab.dataset.nsub === 'semanal') nomRenderSemanal();
      if (tab.dataset.nsub === 'historial') nomRenderHist();
      if (tab.dataset.nsub === 'buscar') nomRenderBuscar();
      if (tab.dataset.nsub === 'resumen') nomRenderResumen();
      if (tab.dataset.nsub === 'trabajadores') nomRenderTrabajadores();
    });
  });

  async function nomSaveDocs() { await window.storage.set(NOM_KEY, JSON.stringify(nomDocs)); }

  // Junta recibos repetidos: si quedaron dos o más pagos de la MISMA persona
  // en la MISMA semana (pasaba al editar antes de esta corrección), se unen en
  // uno solo sumando los días, sin perder nada.
  async function nomLimpiarDuplicados() {
    const porClave = new Map();
    const fusionados = [];
    let huboCambios = false;
    (nomDocs || []).forEach((n) => {
      const dd = Array.isArray(n.dias) ? n.dias.slice().sort() : [];
      const ref = dd[0] || (n.creadoEn || '').slice(0, 10);
      const wk = ref ? nomWeekKey(ref) : '';
      const clave = (n.trabajador || '') + '|' + wk;
      if (!wk || !porClave.has(clave)) {
        porClave.set(clave, n);
        fusionados.push(n);
        return;
      }
      // Ya había uno: se fusiona en el primero
      const base = porClave.get(clave);
      base.dias = [...new Set([...(base.dias || []), ...dd])].sort();
      base.extraMonto = (Number(base.extraMonto) || 0) + (Number(n.extraMonto) || 0);
      if (!base.extraDesc && n.extraDesc) base.extraDesc = n.extraDesc;
      const sueldo = Number(base.sueldoDia) || 0;
      base.monto = sueldo > 0
        ? sueldo * base.dias.length + (Number(base.extraMonto) || 0)
        : (Number(base.monto) || 0) + (Number(n.monto) || 0);
      huboCambios = true;
    });
    if (huboCambios) {
      nomDocs = fusionados;
      try { await nomSaveDocs(); } catch (e) {}
    }
  }
  function nomRefreshDl() {
    // Solo trabajadores activos aparecen para buscar/seleccionar
    const activos = empleados.filter((e) => e.estado !== 'inactivo');
    ['dl-trabajadores', 'dl-trabajadores-2', 'dl-trab-todos'].forEach((id) => {
      const dl = document.getElementById(id);
      if (dl) dl.innerHTML = activos.map((e) => `<option value="${escapeHtml(empNombreCompleto(e))}">`).join('');
    });
  }

  // ---- Semana activa del formulario de Registrar pago ----
  let nomRegSemanaOffset = 0; // 0 = semana actual, -1 = semana pasada, +1 = próxima
  let nomGridFilas = []; // [{ nombre, sueldo, dias:[...], monto, montoTocado, pagos:[ids], nota, extraDesc, extraMonto, extraAbierto }]

  // OJO: aquí NO se puede usar toISOString(), porque convierte a horario de
  // Greenwich y en Nashville (5-6 horas atrás) la fecha se adelanta un día:
  // tocabas "lunes 15" y se guardaba el 16. Se arma la fecha con el día
  // local tal cual.
  function nomFechaLocalISO(d) {
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }
  function nomGridFechasSemana() {
    const base = new Date();
    base.setDate(base.getDate() + nomRegSemanaOffset * 7);
    const dowLun = (base.getDay() + 6) % 7; // 0 = lunes
    const lunes = new Date(base); lunes.setDate(base.getDate() - dowLun);
    const out = [];
    for (let i = 0; i < 7; i++) { const d = new Date(lunes); d.setDate(lunes.getDate() + i); out.push(nomFechaLocalISO(d)); }
    return out;
  }

  // Arma la lista de TODOS los trabajadores activos (+ cualquiera con pago
  // esta semana aunque ahora esté inactivo) para la semana actualmente
  // seleccionada, con sus días/monto ya guardados (si los hay).
  function nomGridAbrirSemana() {
    const fechas = nomGridFechasSemana();
    $('nom-grid-sem-titulo').textContent = `Semana del ${nomFechaCortaTexto(fechas[0])} al ${nomFechaCortaTexto(fechas[6])}`;
    const wk = fechas[0];
    const semanas = nomAgruparSemanas();
    const trabMap = semanas.get(wk) || new Map();
    const activos = empleados.filter((e) => e.estado !== 'inactivo').map((e) => empNombreCompleto(e));
    const nombresConPago = [...trabMap.keys()];
    const nombresCheckin = [];
    fechas.forEach((f) => { const v = (nomCheckin[f] || {}).v || {}; Object.keys(v).forEach((n) => { if (v[n] === 1) nombresCheckin.push(n); }); });
    const nombres = [...new Set([...activos, ...nombresConPago, ...nombresCheckin])];

    nomGridFilas = nombres.map((nombre) => {
      const t = nomBuscarTrab(nombre);
      const existente = trabMap.get(nombre);
      const dias = existente ? [...new Set(existente.dias)].sort() : [];
      const monto = existente ? existente.monto : 0;
      const pagos = existente ? existente.pagos.map((p) => p.id) : [];
      const primerPago = existente && existente.pagos.length ? existente.pagos[0] : null;
      // Una semana ya pagada se queda con el sueldo de ESE pago: si después le
      // subes el sueldo, las semanas viejas no cambian solas al tocarlas.
      const sueldoGuardado = primerPago ? Number(primerPago.sueldoDia) || 0 : 0;
      return {
        nombre, sueldo: sueldoGuardado || (t ? (t.sueldo || 0) : 0), dias, monto, montoTocado: false, pagos, tocado: false,
        nota: primerPago ? (primerPago.nota || '') : '',
        extraDesc: primerPago ? (primerPago.extraDesc || '') : '',
        extraMonto: primerPago ? (Number(primerPago.extraMonto) || 0) : 0,
        extraAbierto: false
      };
    }).map((fila) => {
      // Lo que marcó el visor en el check-in de esta semana
      fila.chk = {};
      // si ese día hubo check-in y no lo marcaron, es que no vino
      fechas.forEach((f) => { const reg = nomCheckin[f]; if (!reg || !reg.v || !Object.keys(reg.v).length) return; fila.chk[f] = reg.v[fila.nombre] === 1 ? 1 : 0; });
      const diasChk = fechas.filter((f) => fila.chk[f] === 1);
      // Sin pago guardado todavía: los días salen marcados solos (el admin revisa y guarda)
      if (!fila.pagos.length && diasChk.length) {
        fila.dias = diasChk;
        fila.monto = diasChk.length * fila.sueldo;
        fila.tocado = true;
        fila.deCheckin = true;
      }
      return fila;
    }).sort((a, b) => {
      if ((b.dias.length > 0) !== (a.dias.length > 0)) return (b.dias.length > 0) ? 1 : -1;
      return a.nombre.localeCompare(b.nombre);
    });

    nomGridRender();
  }

  function nomGridRender() {
    const cont = $('nom-grid-lista');
    if (!cont) return;
    const aviso = $('nom-chk-aviso');
    if (aviso) {
      const pre = nomGridFilas.filter((f) => f.deCheckin);
      const fechasS = nomGridFechasSemana();
      const conChk = nomGridFilas.filter((f) => f.chk && Object.keys(f.chk).length);
      const distintos = nomGridFilas.filter((f) => !f.deCheckin && f.pagos.length && f.chk && Object.keys(f.chk).length &&
        fechasS.filter((x) => f.chk[x] === 1).join() !== fechasS.filter((x) => f.dias.includes(x)).join());
      let txt = '', dif = false;
      if (pre.length) txt = `El check-in marcó los días de ${pre.length} trabajador${pre.length === 1 ? '' : 'es'}. Revisa y presiona <b>Guardar cambios de la semana</b>.`;
      if (distintos.length) { txt += (txt ? '<br>' : '') + `${distintos.length === 1 ? '1 trabajador tiene' : distintos.length + ' trabajadores tienen'} días distintos a su check-in (${distintos.map((f) => escapeHtml(f.nombre)).join(', ')}).`; dif = !pre.length; }
      if (!txt && conChk.length) txt = 'Los puntos en los días son el check-in: verde = vino, rojo = no vino.';
      aviso.innerHTML = txt;
      aviso.classList.toggle('on', !!txt);
      aviso.classList.toggle('dif', dif);
    }
    $('nom-grid-empty').style.display = nomGridFilas.length === 0 ? 'block' : 'none';
    const fechas = nomGridFechasSemana();
    const letras = ['L', 'M', 'M', 'J', 'V', 'S', 'D'];

    cont.innerHTML = nomGridFilas.map((fila, fi) => {
      const botones = fechas.map((f, i) => {
        const d = new Date(f + 'T00:00:00');
        const sel = fila.dias.includes(f);
        return `<button type="button" class="nom-grid-dia" data-fi="${fi}" data-fecha="${f}"
          style="height:44px;border-radius:8px;font-size:11.5px;font-weight:700;cursor:pointer;
          border:1.5px solid ${sel ? 'var(--navy)' : 'var(--border)'};
          background:${sel ? 'var(--navy)' : '#fff'};color:${sel ? '#fff' : 'var(--ink)'};
          display:flex;flex-direction:column;align-items:center;justify-content:center;line-height:1.25;">
          <span style="font-size:9.5px;opacity:.8;">${letras[i]}</span>${d.getDate()}${fila.chk && fila.chk[f] === 1 ? '<i class="chk-dot si" title="Check-in: vino"></i>' : fila.chk && fila.chk[f] === 0 ? '<i class="chk-dot no" title="Check-in: no vino"></i>' : ''}</button>`;
      }).join('');
      return `
        <div class="gc-card" data-grid-nombre="${escapeHtml(fila.nombre)}" style="margin-bottom:10px;padding:12px 14px;">
          <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:10px;margin-bottom:10px;">
            <div>
              <div style="font-weight:600;font-size:13.5px;color:var(--ink);">${escapeHtml(fila.nombre)}</div>
              <div style="font-size:11px;color:var(--muted);">sueldo: ${nomFmt(fila.sueldo)}/día${fila.pagos.length > 1 ? ' · varios pagos (se juntan al guardar)' : ''}</div>
              <button type="button" class="nom-grid-extra-toggle" data-fi="${fi}" style="background:none;border:none;padding:0;margin-top:4px;font-size:11px;color:var(--teal-dk);text-decoration:underline;cursor:pointer;">${fila.extraMonto ? `Extra: ${nomFmt(fila.extraMonto)} ✎` : '+ agregar extra'}</button>
            </div>
            <div style="text-align:right;">
              <div style="font-size:10px;color:var(--muted);text-transform:uppercase;">Monto</div>
              <input type="text" class="nom-grid-monto" data-fi="${fi}" value="${fila.monto ? fila.monto.toFixed(2) : ''}" inputmode="decimal" placeholder="0.00"
                style="width:92px;text-align:right;font-family:'IBM Plex Mono',monospace;font-weight:700;padding:6px 8px;border:1.5px solid var(--border);border-radius:8px;">
            </div>
          </div>
          ${fila.extraAbierto ? `
          <div style="display:grid;grid-template-columns:2fr 1fr;gap:8px;margin-bottom:10px;padding:10px;background:#FDEEE6;border-radius:8px;border:1px solid #F0C9B4;">
            <div><label style="font-size:10px;color:var(--muted);text-transform:uppercase;display:block;margin-bottom:3px;">Concepto</label><input type="text" class="nom-grid-extra-desc" data-fi="${fi}" value="${escapeHtml(fila.extraDesc || '')}" style="width:100%;padding:6px 8px;border:1.5px solid var(--border);border-radius:6px;font-size:12.5px;box-sizing:border-box;"></div>
            <div><label style="font-size:10px;color:var(--muted);text-transform:uppercase;display:block;margin-bottom:3px;">Monto extra</label><input type="text" class="nom-grid-extra-monto" data-fi="${fi}" value="${fila.extraMonto ? fila.extraMonto.toFixed(2) : ''}" inputmode="decimal" placeholder="0.00" style="width:100%;padding:6px 8px;border:1.5px solid var(--border);border-radius:6px;font-size:12.5px;box-sizing:border-box;"></div>
          </div>` : ''}
          <div style="display:grid;grid-template-columns:repeat(7,1fr);gap:5px;">${botones}</div>
        </div>`;
    }).join('');

    cont.querySelectorAll('.nom-grid-dia').forEach((btn) => {
      btn.addEventListener('click', () => {
        const fi = Number(btn.dataset.fi);
        const fila = nomGridFilas[fi];
        const f = btn.dataset.fecha;
        const idx = fila.dias.indexOf(f);
        if (idx >= 0) fila.dias.splice(idx, 1); else { fila.dias.push(f); fila.dias.sort(); }
        fila.tocado = true; fila.deCheckin = false;
        if (!fila.montoTocado) fila.monto = (fila.dias.length * fila.sueldo) + (fila.extraMonto || 0);
        nomGridRender();
      });
    });
    cont.querySelectorAll('.nom-grid-monto').forEach((inp) => {
      inp.addEventListener('input', () => {
        const fi = Number(inp.dataset.fi);
        nomGridFilas[fi].montoTocado = true;
        nomGridFilas[fi].tocado = true; nomGridFilas[fi].deCheckin = false;
        nomGridFilas[fi].monto = parseFloat(inp.value.replace(',', '.')) || 0;
        nomActualizarResumen();
      });
    });
    cont.querySelectorAll('.nom-grid-extra-toggle').forEach((btn) => {
      btn.addEventListener('click', () => {
        const fi = Number(btn.dataset.fi);
        nomGridFilas[fi].extraAbierto = !nomGridFilas[fi].extraAbierto;
        nomGridRender();
      });
    });
    cont.querySelectorAll('.nom-grid-extra-desc').forEach((inp) => {
      inp.addEventListener('input', () => {
        const fi = Number(inp.dataset.fi);
        nomGridFilas[fi].extraDesc = inp.value;
        nomGridFilas[fi].tocado = true; nomGridFilas[fi].deCheckin = false;
        nomActualizarResumen();
      });
    });
    cont.querySelectorAll('.nom-grid-extra-monto').forEach((inp) => {
      inp.addEventListener('input', () => {
        const fi = Number(inp.dataset.fi);
        const fila = nomGridFilas[fi];
        fila.extraMonto = parseFloat(inp.value.replace(',', '.')) || 0;
        fila.tocado = true; fila.deCheckin = false;
        if (!fila.montoTocado) {
          fila.monto = (fila.dias.length * fila.sueldo) + fila.extraMonto;
          const montoInp = cont.querySelector(`.nom-grid-monto[data-fi="${fi}"]`);
          if (montoInp) montoInp.value = fila.monto ? fila.monto.toFixed(2) : '';
        }
        nomActualizarResumen();
      });
    });
    nomActualizarResumen();
  }

  // ---- Total de la semana y aviso de cambios sin guardar ----
  function nomHayCambios() { return nomGridFilas.some((f) => f.tocado); }
  function nomActualizarResumen() {
    const cont = $('nom-resumen-sem'); if (!cont) return;
    const conPago = nomGridFilas.filter((f) => f.dias.length || (Number(f.monto) || 0) > 0);
    const total = conPago.reduce((t, f) => t + (Number(f.monto) || 0), 0);
    const dias = conPago.reduce((t, f) => t + f.dias.length, 0);
    cont.innerHTML = conPago.length
      ? `<span><b>${conPago.length}</b> trabajador${conPago.length === 1 ? '' : 'es'} · <b>${dias}</b> día${dias === 1 ? '' : 's'}</span><strong>${nomFmt(total)}</strong>`
      : '<span>Nadie tiene días marcados esta semana.</span>';
    const pend = nomHayCambios();
    const barra = $('nom-guardar-barra');
    if (barra) barra.classList.toggle('pendiente', pend);
    document.body.classList.toggle('nom-pend', pend);
    const txt = $('nom-pend-txt');
    if (txt) txt.textContent = pend ? 'Cambios sin guardar' : '';
  }
  // Antes de cambiar de semana con cambios sin guardar, preguntar
  async function nomCambiarSemana(delta) {
    if (nomHayCambios()) {
      const ok = await gcConfirm('Tienes cambios sin guardar en esta semana.\n\n¿Guardarlos antes de cambiar de semana?', { okText: 'Guardar y seguir', cancelText: 'No guardar' });
      if (ok) { await nomGuardarSemana(); if (nomHayCambios()) return; }
    }
    nomRegSemanaOffset += delta; nomGridAbrirSemana();
  }
  $('nom-grid-sem-prev').addEventListener('click', () => nomCambiarSemana(-1));
  $('nom-grid-sem-next').addEventListener('click', () => nomCambiarSemana(1));
  window.addEventListener('beforeunload', (e) => { if (nomHayCambios()) { e.preventDefault(); e.returnValue = ''; } });
  document.querySelectorAll('.gc-tab').forEach((t) => t.addEventListener('click', () => {
    if (t.dataset.tab !== 'nomina' && nomHayCambios()) toast('Ojo: dejaste cambios sin guardar en Nómina → Registrar pago', 'info', 4500);
  }));

  // Agregar un trabajador nuevo a la lista de esta semana (si el nombre no
  // existe en Empleados, lo crea con sueldo $0, editable luego).
  async function nomGridAgregarTrabajador() {
    const nombre = $('nom-grid-buscar').value.trim();
    if (!nombre) return;
    const existente = nomBuscarTrab(nombre);
    const nombreFinal = existente ? empNombreCompleto(existente) : nombre;
    if (nomGridFilas.some((f) => f.nombre === nombreFinal)) {
      $('nom-grid-buscar').value = '';
      toast('Ya está en la lista de esta semana', 'info');
      return;
    }
    let sueldo = 0;
    if (!existente) {
      empleados.push({
        id: 'emp-' + Date.now(), nombre, apellido: '', rol: '', estado: 'activo', sueldo: 0,
        tel: '', email: '', inicio: '', ss: '', emergencia: '', direccion: '', notas: ''
      });
      await saveEmpleados();
      nomRefreshDl();
    } else {
      sueldo = existente.sueldo || 0;
    }
    nomGridFilas.push({ nombre: nombreFinal, sueldo, dias: [], monto: 0, montoTocado: false, pagos: [], tocado: false, nota: '', extraDesc: '', extraMonto: 0, extraAbierto: false });
    nomGridFilas.sort((a, b) => { if ((b.dias.length > 0) !== (a.dias.length > 0)) return (b.dias.length > 0) ? 1 : -1; return a.nombre.localeCompare(b.nombre); });
    $('nom-grid-buscar').value = '';
    nomGridRender();
    $('nom-grid-buscar').focus();
  }
  $('nom-grid-btn-add').addEventListener('click', nomGridAgregarTrabajador);
  $('nom-grid-buscar').addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); nomGridAgregarTrabajador(); } });

  // Nombre completo del día con fecha: "Lunes 4 de Agosto de 2026"
  function nomFechaCompleta(fechaStr) {
    const d = new Date(fechaStr + 'T00:00:00');
    if (isNaN(d)) return fechaStr;
    const dias = ['Domingo','Lunes','Martes','Miércoles','Jueves','Viernes','Sábado'];
    const meses = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
    return `${dias[d.getDay()]} ${d.getDate()} de ${meses[d.getMonth()]} de ${d.getFullYear()}`;
  }

  // ---- Guardar cambios de la semana (crea/actualiza/quita pagos de todos los trabajadores a la vez) ----
  $('nom-grid-guardar').addEventListener('click', () => nomGuardarSemana());
  async function nomGuardarSemana() {
    let creados = 0, actualizados = 0, borrados = 0;
    nomGridFilas.forEach((fila) => {
      if (!fila.tocado) return; // nadie tocó esta fila — no hay nada que guardar
      if (fila.dias.length > 0) {
        // Antes de nada: busca CUALQUIER pago que ya exista de esta persona en
        // esta misma semana, aunque la fila no lo tuviera enlazado (pasaba si
        // el nombre cambió o si la fecha se había guardado corrida). Así se
        // actualiza el que ya está en vez de crear uno nuevo y duplicarlo.
        const semanaDeEstaFila = nomWeekKey(fila.dias.slice().sort()[0]);
        const mismoNombre = (a, b) => String(a || '').replace(/\s+/g, ' ').trim().toLowerCase() === String(b || '').replace(/\s+/g, ' ').trim().toLowerCase();
        const yaExistentes = nomDocs.filter((n) => {
          if (!mismoNombre(n.trabajador, fila.nombre)) return false;
          const dd = Array.isArray(n.dias) ? n.dias.slice().sort() : [];
          const ref = dd[0] || (n.creadoEn || '').slice(0, 10);
          return ref && nomWeekKey(ref) === semanaDeEstaFila;
        });
        const idsExistentes = yaExistentes.map((n) => n.id);
        const idPrincipal = fila.pagos[0] || idsExistentes[0] ||
          (Date.now().toString() + '-' + Math.random().toString(36).slice(2, 7));
        const original = nomDocs.find((n) => n.id === idPrincipal) || null;
        const entrada = {
          id: idPrincipal, trabajador: fila.nombre, dias: [...fila.dias],
          sueldoDia: fila.sueldo, extraDesc: fila.extraDesc || '', extraMonto: fila.extraMonto || 0,
          monto: fila.monto, nota: fila.nota || '',
          creadoEn: original ? original.creadoEn : new Date().toISOString()
        };
        const idx = nomDocs.findIndex((n) => n.id === idPrincipal);
        if (idx >= 0) { nomDocs[idx] = entrada; actualizados++; } else { nomDocs.push(entrada); creados++; }
        // Quita cualquier otro pago repetido de esa persona en esa semana,
        // para que nunca queden dos recibos de lo mismo.
        const sobrantes = new Set([...fila.pagos.slice(1), ...idsExistentes]);
        sobrantes.delete(idPrincipal);
        if (sobrantes.size) nomDocs = nomDocs.filter((n) => !sobrantes.has(n.id));
      } else if (fila.pagos.length > 0) {
        nomDocs = nomDocs.filter((n) => !fila.pagos.includes(n.id));
        borrados += fila.pagos.length;
      }
    });

    const btnG = $('nom-grid-guardar');
    btnG.disabled = true;
    try { await nomSaveDocs(); }
    catch (e) {
      btnG.disabled = false;
      toast('No se pudo guardar la semana: ' + ((e && e.message) || e), 'error', 5000);
      return;
    }
    btnG.disabled = false;
    nomGridAbrirSemana();
    if (typeof nomRenderRegLedger === 'function') nomRenderRegLedger();
    if (typeof nomRenderSemanal === 'function') nomRenderSemanal();
    const partes = [];
    if (creados) partes.push(`${creados} agregado(s)`);
    if (actualizados) partes.push(`${actualizados} actualizado(s)`);
    if (borrados) partes.push(`${borrados} quitado(s)`);
    toast(partes.length ? `Semana guardada — ${partes.join(', ')} ✓` : 'Sin cambios', 'success');
  }

  // Lleva al usuario a Registrar pago, en la semana que corresponde, y si
  // se da un nombre, resalta su tarjeta (usado por "Editar" en Historial,
  // Pagos guardados y Recibo semanal).
  function nomIrARegistrarSemana(resaltarNombre) {
    document.querySelector('.nom-subtab[data-nsub="registro"]').click();
    nomGridAbrirSemana();
    window.scrollTo({ top: 0, behavior: 'smooth' });
    if (resaltarNombre) {
      toast('Ahí está ' + resaltarNombre + ' en la lista de esta semana', 'info', 3000);
      setTimeout(() => {
        const fila = document.querySelector(`#nom-grid-lista [data-grid-nombre="${CSS.escape(resaltarNombre)}"]`);
        if (fila) {
          fila.scrollIntoView({ behavior: 'smooth', block: 'center' });
          fila.style.boxShadow = '0 0 0 2.5px var(--teal)';
          setTimeout(() => { fila.style.boxShadow = ''; }, 2000);
        }
      }, 200);
    }
  }

  // Salta a la semana de un pago existente y resalta a su trabajador
  // (usado por los botones "Editar" de Historial y Pagos guardados).
  function nomEditar(entrada) {
    const dias = Array.isArray(entrada.dias) ? entrada.dias.slice().sort() : [];
    const primerDia = dias[0] || (entrada.creadoEn || '').slice(0, 10);
    if (primerDia) {
      const mondayEntrada = mondayOf(primerDia);
      const mondayHoy = mondayOf(nomToday());
      nomRegSemanaOffset = Math.round((mondayEntrada - mondayHoy) / (7 * 24 * 60 * 60 * 1000));
    }
    nomIrARegistrarSemana(entrada.trabajador);
  }

  // Salta a una semana específica (clave = lunes) desde una tarjeta de
  // Recibo semanal, y opcionalmente resalta a un trabajador.
  function nomIrASemana(wk, resaltarNombre) {
    const mondayWk = new Date(wk + 'T00:00:00');
    const mondayHoy = mondayOf(nomToday());
    nomRegSemanaOffset = Math.round((mondayWk - mondayHoy) / (7 * 24 * 60 * 60 * 1000));
    nomIrARegistrarSemana(resaltarNombre);
  }

  // ---- Recibo tipo invoice ----
  function nomBuildRecibo(n) {
    const FC = facturaColores();
    const dias = Array.isArray(n.dias) ? n.dias.slice().sort() : [];
    const sueldoDia = Number(n.sueldoDia) || 0;
    const extraMonto = Number(n.extraMonto) || 0;
    const totalDias = dias.length;
    const subtotalDias = sueldoDia > 0 ? sueldoDia * totalDias : (Number(n.monto) || 0) - extraMonto;

    const filasDias = dias.map((f, i) => `
      <tr>
        <td style="padding:8px 6px;border-bottom:1px solid #e5e5e5;font-size:12.5px;">${i + 1}</td>
        <td style="padding:8px 6px;border-bottom:1px solid #e5e5e5;font-size:12.5px;">${invFechaNum(f)}</td>
        <td style="padding:8px 6px;border-bottom:1px solid #e5e5e5;text-align:right;font-size:12.5px;">${sueldoDia > 0 ? nomFmt(sueldoDia) : '—'}</td>
      </tr>`).join('');

    return `
      <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:24px;border-bottom:3px solid ${FC.p};padding-bottom:18px;">
        <div>
          <div style="font-size:22px;font-weight:700;color:${FC.p};font-family:Georgia,serif;">${escapeHtml(cfgFacturaNombre)}</div>
          ${cfgFacturaDireccion ? `<div style="font-size:11.5px;color:#707A8C;margin-top:2px;">${escapeHtml(cfgFacturaDireccion)}</div>` : ''}
          <div style="font-size:12px;color:#666;margin-top:3px;">Recibo de pago a trabajador</div>
        </div>
        <div style="text-align:right;">
          <div style="font-size:20px;font-weight:700;color:${FC.p};letter-spacing:1px;">RECIBO</div>
          <div style="font-size:12px;color:#888;margin-top:3px;">${invFechaNum((n.creadoEn || '').slice(0, 10))}</div>
        </div>
      </div>

      <div style="margin-bottom:20px;">
        <div style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:#999;margin-bottom:5px;">Trabajador</div>
        <div style="font-size:17px;font-weight:700;color:${FC.p};">${escapeHtml(n.trabajador || '')}</div>
      </div>

      <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.5px;color:${FC.p};margin-bottom:8px;">Días trabajados</div>
      <table style="width:100%;border-collapse:collapse;margin-bottom:18px;">
        <thead><tr style="background:${FC.p};">
          <th style="padding:9px 6px;text-align:left;font-size:10px;color:rgba(255,255,255,.85);text-transform:uppercase;width:34px;">#</th>
          <th style="padding:9px 6px;text-align:left;font-size:10px;color:rgba(255,255,255,.85);text-transform:uppercase;" data-i18n="h_dia">Día</th>
          <th style="padding:9px 6px;text-align:right;font-size:10px;color:rgba(255,255,255,.85);text-transform:uppercase;width:110px;" data-i18n="h_sueldo_dia">Sueldo/día</th>
        </tr></thead>
        <tbody>${filasDias || '<tr><td colspan="3" style="padding:8px;font-size:12.5px;">Sin días</td></tr>'}</tbody>
      </table>

      <div style="display:flex;justify-content:flex-end;">
        <table style="font-size:13px;width:280px;">
          <tr><td style="padding:5px 0;color:#666;">${totalDias} día(s)${sueldoDia > 0 ? ` × ${nomFmt(sueldoDia)}` : ''}</td><td style="padding:5px 0;text-align:right;font-weight:600;">${nomFmt(subtotalDias)}</td></tr>
          ${extraMonto ? `<tr><td style="padding:5px 0;color:#C2622E;">Extra${n.extraDesc ? ` — ${escapeHtml(n.extraDesc)}` : ''}</td><td style="padding:5px 0;text-align:right;font-weight:600;color:#C2622E;">${nomFmt(extraMonto)}</td></tr>` : ''}
          <tr style="border-top:2px solid ${FC.p};"><td style="padding:10px 0;font-size:15px;font-weight:700;color:${FC.p};">TOTAL A PAGAR</td><td style="padding:10px 0;text-align:right;font-size:15px;font-weight:700;color:${FC.p};">${nomFmt(n.monto)}</td></tr>
        </table>
      </div>

      ${n.nota ? `<div style="margin-top:22px;padding:12px 16px;background:#F5F8FC;border-left:3px solid ${FC.p};border-radius:6px;font-size:12.5px;color:#444;"><strong>Nota:</strong> ${escapeHtml(n.nota)}</div>` : ''}

      <div style="margin-top:40px;display:flex;justify-content:space-between;gap:40px;">
        <div style="flex:1;border-top:1px solid #999;padding-top:6px;text-align:center;font-size:11px;color:#888;">Firma del trabajador</div>
        <div style="flex:1;border-top:1px solid #999;padding-top:6px;text-align:center;font-size:11px;color:#888;">Firma de ${escapeHtml(cfgFacturaNombre)}</div>
      </div>
      <div style="margin-top:22px;padding-top:12px;border-top:1px solid #eee;text-align:center;font-size:11px;color:#aaa;">${escapeHtml(cfgFacturaNombre)} · Recibo de pago</div>`;
  }

  let nomReciboEnVista = null;
  function nomMostrarRecibo(n) {
    nomReciboEnVista = n;
    $('nom-recibo-content').innerHTML = nomBuildRecibo(n);
    $('nom-btn-imprimir-recibo').style.display = '';
    $('nom-btn-descargar-recibo').style.display = '';
    $('nom-ov').style.display = 'flex';
  }
  $('nom-btn-imprimir-recibo').addEventListener('click', () => {
    if (!nomReciboEnVista) return;
    ghImprimirEnVentana(nomBuildRecibo(nomReciboEnVista), `Recibo - ${nomReciboEnVista.trabajador || ''}`);
  });
  $('nom-btn-descargar-recibo').addEventListener('click', () => {
    if (!nomReciboEnVista) return;
    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Recibo ${escapeHtml(nomReciboEnVista.trabajador || '')}</title><style>body{font-family:Arial,sans-serif;padding:32px;max-width:800px;margin:0 auto;}</style></head><body>${nomBuildRecibo(nomReciboEnVista)}</body></html>`;
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([html], { type: 'text/html;charset=utf-8;' }));
    a.download = `recibo-${(nomReciboEnVista.trabajador || 'pago').replace(/[^a-z0-9]/gi, '-').toLowerCase()}.html`;
    a.click(); URL.revokeObjectURL(a.href);
  });
  $('nom-btn-cerrar-recibo').addEventListener('click', () => { $('nom-ov').style.display = 'none'; nomReciboEnVista = null; });
  $('nom-ov').addEventListener('click', (e) => { if (e.target.id === 'nom-ov') { $('nom-ov').style.display = 'none'; nomReciboEnVista = null; } });

  // Formatear lista de fechas para mostrar
  function nomFechasTexto(dias) {
    if (!Array.isArray(dias)) return typeof dias === 'number' ? `${dias} día(s)` : '';
    if (dias.length === 0) return '—';
    // "lun 5, mar 6, mié 7 oct" (antes salía 2026-10-05, 2026-10-06…)
    const D = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'], M = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
    const ord = [...new Set(dias)].sort();
    return ord.map((f, i) => {
      const d = new Date(f + 'T00:00:00');
      if (isNaN(d)) return f;
      const sig = ord[i + 1] ? new Date(ord[i + 1] + 'T00:00:00') : null;
      const finMes = !sig || sig.getMonth() !== d.getMonth();
      return `${D[d.getDay()]} ${d.getDate()}${finMes ? ' ' + M[d.getMonth()] : ''}`;
    }).join(', ');
  }
  function nomCuentaDias(dias) {
    return Array.isArray(dias) ? dias.length : (Number(dias) || 0);
  }

  // ---- Historial ----
  function nomRenderHist() {
    const buscar = $('nom-hist-buscar').value.trim().toLowerCase();
    const tbody = $('nom-hist-tbody');
    tbody.innerHTML = '';
    const filtrados = nomDocs.filter((n) => !buscar ||
      (n.trabajador || '').toLowerCase().includes(buscar) ||
      (n.nota || '').toLowerCase().includes(buscar)
    ).sort((a, b) => (b.creadoEn || '').localeCompare(a.creadoEn || ''));

    $('nom-hist-empty').style.display = filtrados.length === 0 ? 'block' : 'none';
    $('nom-hist-tbl').style.display = filtrados.length === 0 ? 'none' : 'table';

    filtrados.forEach((n) => {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td style="font-weight:500;">${escapeHtml(n.trabajador || '')}</td>
        <td class="num">${nomCuentaDias(n.dias)}</td>
        <td style="font-size:12px;color:var(--muted);">${escapeHtml(nomFechasTexto(n.dias))}</td>
        <td class="num" style="font-weight:700;color:var(--teal);">${nomFmt(n.monto)}</td>
        <td style="font-size:12.5px;color:var(--muted);">${escapeHtml(n.nota || '')}</td>
        <td style="white-space:nowrap;">
          <button class="gc-action-btn nom-ver-btn" data-i18n="ver" data-id="${n.id}" style="padding:4px 10px;font-size:11.5px;">Ver</button>
          <button class="gc-action-btn nom-imp-btn" data-i18n="imprimir" data-id="${n.id}" style="padding:4px 10px;font-size:11.5px;margin-left:3px;">Imprimir</button>
          <button class="gc-action-btn nom-edit-btn" data-id="${n.id}" style="padding:4px 10px;font-size:11.5px;margin-left:3px;">✎</button>
          <button class="gc-del nom-del-btn" data-id="${n.id}" style="margin-left:3px;">✕</button>
        </td>`;
      tbody.appendChild(tr);
    });

    tbody.querySelectorAll('.nom-ver-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        const n = nomDocs.find((x) => x.id === btn.dataset.id);
        if (n) nomMostrarRecibo(n);
      });
    });
    tbody.querySelectorAll('.nom-imp-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        const n = nomDocs.find((x) => x.id === btn.dataset.id);
        if (!n) return;
        ghImprimirEnVentana(nomBuildRecibo(n), `Recibo - ${n.trabajador || ''}`);
      });
    });
    tbody.querySelectorAll('.nom-edit-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        const n = nomDocs.find((x) => x.id === btn.dataset.id);
        if (n) nomEditar(n);
      });
    });
    tbody.querySelectorAll('.nom-del-btn').forEach((btn) => {
      btn.addEventListener('click', async () => {
        if (!await gcConfirm('¿Eliminar este pago?', { okText: 'Eliminar', danger: true })) return;
        nomDocs = nomDocs.filter((x) => x.id !== btn.dataset.id);
        await nomSaveDocs();
        toast('Pago eliminado', 'info');
        nomRenderHist();
      });
    });
  }
  $('nom-hist-buscar').addEventListener('input', debounce(nomRenderHist, 160));

  // ---- Buscar por persona (con intervalos) ----
  function nomInfoPeriodo(fechaStr, intervalo) {
    const d = new Date(fechaStr + 'T00:00:00');
    if (isNaN(d)) return 'Sin fecha';
    if (intervalo === 'año') return String(d.getFullYear());
    if (intervalo === 'mes') {
      const meses = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
      return `${meses[d.getMonth()]} ${d.getFullYear()}`;
    }
    if (intervalo === 'semana') {
      const dt = new Date(d);
      const day = (dt.getDay() + 6) % 7;
      dt.setDate(dt.getDate() - day);
      const lunes = ghFechaLocal(dt);
      const fin = new Date(dt); fin.setDate(fin.getDate() + 6);
      return `Semana del ${lunes} al ${ghFechaLocal(fin)}`;
    }
    return 'Todo';
  }

  // Para intervalos, cada pago se reparte por sus días (cada día cuenta con su fecha)
  // Repartimos el monto proporcionalmente entre los días del pago
  function nomExpandirPagos(pagos) {
    const filas = [];
    pagos.forEach((n) => {
      const dias = Array.isArray(n.dias) ? n.dias : [];
      if (dias.length === 0) {
        // Pago sin fechas (formato viejo): usar creadoEn como referencia
        filas.push({ fecha: (n.creadoEn || '').slice(0, 10), monto: Number(n.monto) || 0, dias: nomCuentaDias(n.dias) });
      } else {
        const porDia = (Number(n.monto) || 0) / dias.length;
        dias.forEach((f) => filas.push({ fecha: f, monto: porDia, dias: 1 }));
      }
    });
    return filas;
  }

  function nomRenderBuscar() {
    const persona = $('nom-buscar-persona').value.trim().toLowerCase();
    const intervalo = $('nom-buscar-intervalo').value;
    const cont = $('nom-buscar-resultado');

    if (!persona) {
      cont.innerHTML = '<div class="gc-empty">Escribe el nombre de un trabajador para ver cuánto lleva ganando.</div>';
      return;
    }

    const pagos = nomDocs.filter((n) => (n.trabajador || '').toLowerCase().includes(persona));
    if (pagos.length === 0) {
      cont.innerHTML = '<div class="gc-empty">No hay pagos registrados para ese trabajador.</div>';
      return;
    }

    const totalGeneral = pagos.reduce((s, n) => s + (Number(n.monto) || 0), 0);
    const totalDias = pagos.reduce((s, n) => s + nomCuentaDias(n.dias), 0);
    const nombreReal = pagos[0].trabajador;

    let html = `
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:18px;">
        <div class="gc-stat" style="border-color:var(--teal);"><div class="gc-stat-icon" style="background:var(--teal-bg);">$</div><div><div class="gc-stat-label">Total ganado — ${escapeHtml(nombreReal)}</div><div class="gc-stat-val" style="color:var(--teal);">${nomFmt(totalGeneral)}</div></div></div>
        <div class="gc-stat" style="border-color:var(--navy);"><div class="gc-stat-icon" style="background:#EEF2FF;">#</div><div><div class="gc-stat-label">Días trabajados en total</div><div class="gc-stat-val" style="color:var(--navy);">${totalDias}</div></div></div>
      </div>`;

    if (intervalo !== 'todo') {
      const filas = nomExpandirPagos(pagos);
      const grupos = new Map();
      filas.forEach((f) => {
        const periodo = nomInfoPeriodo(f.fecha || '', intervalo);
        if (!grupos.has(periodo)) grupos.set(periodo, { monto: 0, dias: 0 });
        const g = grupos.get(periodo);
        g.monto += f.monto;
        g.dias += f.dias;
      });

      const periodos = [...grupos.entries()].sort((a, b) => b[0].localeCompare(a[0]));
      html += `<table class="inv-list-t"><thead><tr><th>Periodo (${intervalo})</th><th class="num" data-i18n="h_dias">Días</th><th class="num" data-i18n="h_ganado">Ganado</th></tr></thead><tbody>`;
      periodos.forEach(([periodo, g]) => {
        html += `<tr>
          <td style="font-weight:500;">${escapeHtml(periodo)}</td>
          <td class="num">${g.dias}</td>
          <td class="num" style="font-weight:700;color:var(--teal);">${nomFmt(g.monto)}</td>
        </tr>`;
      });
      html += '</tbody></table>';
    } else {
      html += `<table class="inv-list-t"><thead><tr><th class="num" data-i18n="h_dias">Días</th><th data-i18n="h_fechas_trabajadas">Fechas trabajadas</th><th class="num" data-i18n="h_monto">Monto</th><th data-i18n="h_nota">Nota</th></tr></thead><tbody>`;
      pagos.sort((a, b) => (b.creadoEn || '').localeCompare(a.creadoEn || '')).forEach((n) => {
        html += `<tr>
          <td class="num">${nomCuentaDias(n.dias)}</td>
          <td style="font-size:12px;color:var(--muted);">${escapeHtml(nomFechasTexto(n.dias))}</td>
          <td class="num" style="font-weight:700;color:var(--teal);">${nomFmt(n.monto)}</td>
          <td style="font-size:12.5px;color:var(--muted);">${escapeHtml(n.nota || '')}</td>
        </tr>`;
      });
      html += '</tbody></table>';
    }

    cont.innerHTML = html;
  }
  // ---- Resumen por trabajador: año, este mes, días y barras por mes ----
  function nomRenderResumen() {
    const sel = $('nr-anio'); if (!sel) return;
    const hoy = nomToday(), anioHoy = hoy.slice(0, 4), mesHoy = hoy.slice(5, 7);
    const filas = [];
    nomDocs.forEach((n) => { nomExpandirPagos([n]).forEach((f) => { if (f.fecha) filas.push({ t: (n.trabajador || 'Sin nombre').trim(), f: f.fecha, m: f.monto, d: f.dias }); }); });
    const anios = [...new Set(filas.map((x) => x.f.slice(0, 4)).concat([anioHoy]))].sort().reverse();
    const prev = sel.value;
    sel.innerHTML = anios.map((a) => `<option value="${a}">${a}</option>`).join('');
    sel.value = anios.includes(prev) ? prev : anioHoy;
    const anio = sel.value;
    const por = new Map();
    filas.filter((x) => x.f.startsWith(anio)).forEach((x) => {
      const k = x.t.toLowerCase();
      if (!por.has(k)) por.set(k, { nombre: x.t, total: 0, dias: 0, mes: 0, meses: new Array(12).fill(0) });
      const g = por.get(k); g.total += x.m; g.dias += x.d;
      const mi = Number(x.f.slice(5, 7)) - 1; if (mi >= 0 && mi < 12) g.meses[mi] += x.m;
      if (anio === anioHoy && x.f.slice(5, 7) === mesHoy) g.mes += x.m;
    });
    const lista = [...por.values()].sort((a, b) => b.total - a.total);
    const totalAnio = lista.reduce((t, g) => t + g.total, 0), totalMes = lista.reduce((t, g) => t + g.mes, 0);
    $('nr-kpis').innerHTML = `
      <div class="nr-kpi"><span>Pagado en ${anio}</span><b>${nomFmt(totalAnio)}</b></div>
      <div class="nr-kpi"><span>${anio === anioHoy ? 'Este mes' : 'Trabajadores'}</span><b>${anio === anioHoy ? nomFmt(totalMes) : lista.length}</b></div>`;
    const MC = ['E', 'F', 'M', 'A', 'M', 'J', 'J', 'A', 'S', 'O', 'N', 'D'];
    $('nr-lista').innerHTML = lista.length ? lista.map((g) => {
      const max = Math.max(1, ...g.meses);
      return `<div class="nr-fila">
        <div class="nr-top"><span class="nr-nom">${escapeHtml(g.nombre)}</span><span class="nr-tot">${nomFmt(g.total)}</span></div>
        <div class="nr-sub">${g.dias} día${g.dias === 1 ? '' : 's'} trabajados${anio === anioHoy ? ' · este mes ' + nomFmt(g.mes) : ''}${g.dias ? ' · promedio ' + nomFmt(g.total / g.dias) + '/día' : ''}</div>
        <div class="nr-barras">${g.meses.map((v, i) => `<div class="nr-b" title="${MESES_CORTOS[i]}: ${nomFmt(v)}"><i style="height:${Math.round(v / max * 34)}px;${v ? '' : 'opacity:.2;'}"></i><em>${MC[i]}</em></div>`).join('')}</div>
      </div>`;
    }).join('') : '<div class="gc-empty">No hay pagos de nómina en ese año.</div>';
  }
  if ($('nr-anio')) $('nr-anio').addEventListener('change', nomRenderResumen);

  $('nom-buscar-persona').addEventListener('input', debounce(nomRenderBuscar, 160));
  $('nom-buscar-intervalo').addEventListener('change', nomRenderBuscar);

  // ---- Trabajadores (ahora es una vista rápida de Empleados, con su sueldo) ----
  function nomRenderTrabajadores() {
    const tbody = $('trab-nom-tbody');
    tbody.innerHTML = '';
    const activos = empleados.filter((e) => e.estado !== 'inactivo');
    $('trab-nom-empty').style.display = activos.length === 0 ? 'block' : 'none';
    $('trab-nom-tbl').style.display = activos.length === 0 ? 'none' : 'table';

    activos.forEach((emp) => {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td class="trab-nombre-cel" data-id="${emp.id}" style="font-weight:600;">
          <span class="trab-nombre-txt">${escapeHtml(empNombreCompleto(emp))}</span>
          <button type="button" class="gc-action-btn trab-nombre-edit" data-id="${emp.id}" title="Cambiar el nombre" style="padding:4px 10px;font-size:11.5px;margin-left:6px;">✎ Nombre</button>
        </td>
        <td class="num" style="font-weight:700;color:var(--teal);">${nomFmt(emp.sueldo)}</td>
        <td style="white-space:nowrap;">
          <input type="text" inputmode="decimal" class="trab-sueldo-input" data-id="${emp.id}" placeholder="Nuevo sueldo $" style="width:110px;padding:6px 10px;border:1.5px solid var(--border);border-radius:6px;font-size:12.5px;">
          <button class="gc-action-btn trab-sueldo-set" data-i18n="guardar" data-id="${emp.id}" style="padding:5px 12px;font-size:11.5px;margin-left:4px;">Guardar</button>
        </td>
        <td><button class="gc-action-btn trab-nom-del" data-i18n="inactivo" data-id="${emp.id}" style="padding:5px 10px;font-size:11px;" title="Marcar inactivo (no se borra su información)">Inactivo</button></td>
        <td><select class="trab-pagar-a" data-id="${emp.id}" style="min-width:170px;padding:6px 8px;border:1.5px solid var(--border);border-radius:6px;font-size:12.5px;">${nomOpcionesPagarA(emp)}</select></td>`;
      tbody.appendChild(tr);
    });

    tbody.querySelectorAll('.trab-pagar-a').forEach((sel) => {
      sel.addEventListener('change', async () => {
        const emp = empleados.find((e) => e.id === sel.dataset.id);
        if (!emp) return;
        if (sel.value === '__otro__') {
          // Escribir a quién (ej. CRA HVAC en una base donde no es socio): solo gasto, sin %
          const cel = sel.parentElement;
          cel.innerHTML = `<div style="display:flex;gap:6px;"><input type="text" class="trab-pagar-otro" placeholder="Ej. CRA HVAC" autocomplete="off" style="flex:1;min-width:0;padding:6px 8px;border:1.5px solid var(--border);border-radius:6px;font-size:16px;"><button type="button" class="gc-save-btn" style="padding:6px 12px;font-size:12.5px;">Guardar</button></div>`;
          const inp = cel.querySelector('input'); inp.focus();
          const ok = async () => {
            const nombre = inp.value.replace(/\s+/g, ' ').trim();
            if (!nombre) { nomRenderTrabajadores(); return; }
            emp.pagarA = 'nombre:' + nombre;
            try { await saveEmpleados(); toast(`${empNombreCompleto(emp)}: se le paga a ${nombre} (sin %)`); } catch (e) { toast('No se pudo guardar', 'error'); }
            nomRenderTrabajadores();
          };
          cel.querySelector('button').addEventListener('click', ok);
          inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') ok(); if (e.key === 'Escape') nomRenderTrabajadores(); });
          return;
        }
        emp.pagarA = sel.value;
        try { await saveEmpleados(); toast(sel.value ? `${empNombreCompleto(emp)}: se le paga a ${sel.options[sel.selectedIndex].text}` : `${empNombreCompleto(emp)}: se le paga directo`); }
        catch (e) { toast('No se pudo guardar', 'error'); }
      });
    });

    // ✎ Nombre: se edita ahí mismo; al guardar, el nombre nuevo también se
    // pone en los pagos ya registrados de esa persona (historial, recibos,
    // buscar por persona), para que no quede "partida" en dos nombres.
    tbody.querySelectorAll('.trab-nombre-edit').forEach((btn) => {
      btn.addEventListener('click', () => {
        const id = btn.dataset.id;
        const emp = empleados.find((e) => e.id === id);
        const cel = tbody.querySelector(`.trab-nombre-cel[data-id="${id}"]`);
        if (!emp || !cel) return;
        const viejo = empNombreCompleto(emp);
        cel.innerHTML = `<div style="display:flex;gap:6px;align-items:center;flex-wrap:wrap;">
          <input type="text" class="trab-nombre-input" value="${escapeHtml(viejo)}" autocomplete="off" style="flex:1;min-width:140px;padding:8px 10px;border:1.5px solid var(--border);border-radius:8px;font-size:16px;">
          <button type="button" class="gc-save-btn trab-nombre-ok" style="padding:8px 14px;font-size:12.5px;">Guardar</button>
          <button type="button" class="gc-action-btn trab-nombre-no" style="padding:7px 12px;font-size:12.5px;">Cancelar</button></div>`;
        const inp = cel.querySelector('.trab-nombre-input');
        inp.focus(); inp.select();
        const cancelar = () => nomRenderTrabajadores();
        const guardar = async () => {
          const nuevo = inp.value.replace(/\s+/g, ' ').trim();
          if (!nuevo) { toast('Escribe un nombre', 'error'); inp.focus(); return; }
          if (nuevo === viejo) { cancelar(); return; }
          const otro = nomBuscarTrab(nuevo);
          if (otro && otro.id !== id) { toast(`Ya hay un trabajador llamado "${nuevo}"`, 'error'); inp.focus(); return; }
          const pagos = nomDocs.filter((n) => (n.trabajador || '').trim().toLowerCase() === viejo.toLowerCase());
          if (pagos.length && !await gcConfirm(`¿Cambiar "${viejo}" por "${nuevo}"?\n\nTambién se cambia en sus ${pagos.length} pago(s) ya registrado(s), para que su historial siga junto.`, { okText: 'Cambiar nombre' })) return;
          emp.nombre = nuevo; emp.apellido = '';
          pagos.forEach((n) => { n.trabajador = nuevo; });
          nomGridFilas.forEach((f) => { if ((f.nombre || '').trim().toLowerCase() === viejo.toLowerCase()) f.nombre = nuevo; });
          await saveEmpleados();
          if (pagos.length) await nomSaveDocs();
          nomRefreshDl();
          nomRenderTrabajadores();
          try { nomGridRender(); nomRenderHist(); nomRenderRegLedger(); nomRenderSemanal(); nomRenderBuscar(); } catch (e) {}
          try { if (typeof renderEmpleados === 'function') renderEmpleados(); } catch (e) {}
          toast('Nombre actualizado ✓', 'success');
        };
        cel.querySelector('.trab-nombre-ok').addEventListener('click', guardar);
        cel.querySelector('.trab-nombre-no').addEventListener('click', cancelar);
        inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); guardar(); } if (e.key === 'Escape') cancelar(); });
      });
    });

    tbody.querySelectorAll('.trab-sueldo-set').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const id = btn.dataset.id;
        const idx = empleados.findIndex((e) => e.id === id);
        if (idx < 0) return;
        const input = tbody.querySelector(`.trab-sueldo-input[data-id="${id}"]`);
        const nuevo = parseFloat((input.value || '').replace(',', '.'));
        if (isNaN(nuevo) || nuevo < 0) { toast('Escribe un sueldo válido', 'error'); return; }
        empleados[idx].sueldo = nuevo;
        await saveEmpleados();
        nomRenderTrabajadores();
        // Si el trabajador está en la grilla de Registrar pago, actualizar su sueldo ahí también
        const nombreCompleto = empNombreCompleto(empleados[idx]);
        const fila = nomGridFilas.find((f) => f.nombre === nombreCompleto);
        if (fila) {
          fila.sueldo = nuevo;
          if (!fila.montoTocado) fila.monto = (fila.dias.length * fila.sueldo) + (fila.extraMonto || 0);
          nomGridRender();
        }
        toast('Sueldo actualizado ✓', 'success');
      });
    });
    tbody.querySelectorAll('.trab-sueldo-input').forEach((inp) => {
      inp.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') tbody.querySelector(`.trab-sueldo-set[data-id="${inp.dataset.id}"]`).click();
      });
    });
    tbody.querySelectorAll('.trab-nom-del').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const id = btn.dataset.id;
        const idx = empleados.findIndex((e) => e.id === id);
        if (idx < 0) return;
        const nombre = empNombreCompleto(empleados[idx]);
        if (!await gcConfirm(`¿Marcar a ${nombre} como inactivo? Ya no aparecerá para nuevos pagos, pero su información y sus pagos ya registrados se conservan. Puedes reactivarlo luego desde Ajustes → Empleados.`, { okText: 'Marcar inactivo', danger: true })) return;
        empleados[idx].estado = 'inactivo';
        await saveEmpleados();
        nomRefreshDl();
        nomRenderTrabajadores();
        toast('Trabajador marcado como inactivo', 'info');
      });
    });
  }
  $('trab-nom-btn-add').addEventListener('click', async () => {
    const val = $('trab-nom-nuevo').value.trim();
    const sueldo = parseFloat(($('trab-nom-sueldo').value || '0').replace(',', '.')) || 0;
    if (!val) return;
    if (nomBuscarTrab(val)) { toast('Ya existe', 'info'); return; }
    empleados.push({
      id: 'emp-' + Date.now(), nombre: val, apellido: '', rol: '', estado: 'activo', sueldo,
      tel: '', email: '', inicio: '', ss: '', emergencia: '', direccion: '', notas: ''
    });
    await saveEmpleados();
    nomRefreshDl();
    $('trab-nom-nuevo').value = '';
    $('trab-nom-sueldo').value = '';
    nomRenderTrabajadores();
    toast('Trabajador agregado ✓');
  });
  $('trab-nom-nuevo').addEventListener('keydown', (e) => { if (e.key === 'Enter') $('trab-nom-sueldo').focus(); });
  $('trab-nom-sueldo').addEventListener('keydown', (e) => { if (e.key === 'Enter') $('trab-nom-btn-add').click(); });

  // ---- Carga inicial de Nómina ----
  let nomCargado = false;
  document.querySelectorAll('.gc-tab').forEach((tab) => {
    if (tab.dataset.tab === 'nomina') {
      tab.addEventListener('click', async () => {
        if (!nomCargado) {
          await nomAsegurarCargado();
        } else {
          // Ya estaba abierta: trae el check-in más reciente. Si el admin no
          // ha tocado nada a mano en esta semana, se vuelve a armar la lista.
          try { chkAvisarNuevos(await chkSincronizarTrabajadores()); } catch (e) {}
          const antes = JSON.stringify(nomCheckin);
          await nomCargarCheckin();
          const sinTocar = !nomGridFilas.some((f) => f.tocado && !f.deCheckin);
          if (JSON.stringify(nomCheckin) !== antes && sinTocar) nomGridAbrirSemana();
        }
      });
    }
  });
  // Carga la nómina una sola vez (la usan Nómina y Payroll)
  let nomCargaPromesa = null;
  function nomAsegurarCargado() {
    if (nomCargado && !nomCargaPromesa) return Promise.resolve();
    if (!nomCargaPromesa) nomCargaPromesa = (async () => {
          nomCargado = true;
          // Las tres lecturas son independientes: se piden a la vez (más rápido,
          // sobre todo con conexión lenta) en vez de una tras otra.
          const [rDocs, rEmp, rViejo] = await Promise.all([
            window.storage.get(NOM_KEY).catch(() => null),
            window.storage.get(STORAGE_EMPLEADOS).catch(() => null),
            window.storage.get(TRAB_NOM_KEY_VIEJO).catch(() => null),
            nomCargarCheckin()
          ]);
          try { nomDocs = JSON.parse(rDocs.value); } catch (e) { nomDocs = []; }
          if (!Array.isArray(nomDocs)) nomDocs = [];
          if (!rDocs && window.GH_SYNC && window.GH_SYNC.hayLecturasFallidas()) toast('No se pudo leer la nómina (sin señal). Lo que guardes se junta con lo de la nube.', 'error', 5000);
          await nomLimpiarDuplicados();   // junta recibos repetidos de la misma persona/semana
          try { const v = JSON.parse(rEmp.value); if (Array.isArray(v)) { empleados = v; empleadosLeidos = true; } } catch (e) { /* puede que ya se hayan cargado antes en esta sesión */ }
          // Migración de una sola vez: si había trabajadores en el formato viejo
          // que aún no están en Empleados, se agregan ahí (sin duplicar).
          if (rViejo) { try { await nomMigrarTrabajadoresViejos(JSON.parse(rViejo.value)); } catch (e) {} }
          try { chkAvisarNuevos(await chkSincronizarTrabajadores()); } catch (e) {}
          nomRefreshDl();
          nomRegSemanaOffset = 0;
          nomGridAbrirSemana();
          nomRenderRegLedger();
    })();
    return nomCargaPromesa;
  }

  // ====================================================================
  // RECIBO SEMANAL
  // ====================================================================
  const RECIBOS_KEY = 'gh-recibos-semanales';
  let nomCopias = [];

  // Día abreviado con número: "Lun 4"
  function nomDiaCorto(fechaStr) {
    const d = new Date(fechaStr + 'T00:00:00');
    if (isNaN(d)) return fechaStr;
    const dias = ['Dom','Lun','Mar','Mié','Jue','Vie','Sáb'];
    return `${dias[d.getDay()]} ${d.getDate()}`;
  }
  // Clave de semana (lunes) a partir de una fecha
  function nomWeekKey(fechaStr) {
    const d = new Date(fechaStr + 'T00:00:00');
    if (isNaN(d)) return '';
    const day = (d.getDay() + 6) % 7; // lunes=0
    const lunes = new Date(d); lunes.setDate(d.getDate() - day);
    return ghFechaLocal(lunes);
  }
  function nomWeekRango(weekKey) {
    const lunes = new Date(weekKey + 'T00:00:00');
    const domingo = new Date(lunes); domingo.setDate(lunes.getDate() + 6);
    return { inicio: weekKey, fin: ghFechaLocal(domingo) };
  }
  function nomFechaCortaTexto(fechaStr) {
    const d = new Date(fechaStr + 'T00:00:00');
    if (isNaN(d)) return fechaStr;
    const meses = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];
    return `${d.getDate()} ${meses[d.getMonth()]} ${d.getFullYear()}`;
  }

  // Agrupar pagos por semana → trabajador
  function nomAgruparSemanas() {
    const semanas = new Map();
    nomDocs.forEach((n) => {
      const dias = Array.isArray(n.dias) ? n.dias.slice().sort() : [];
      const refDay = dias[0] || (n.creadoEn || '').slice(0, 10);
      if (!refDay) return;
      const wk = nomWeekKey(refDay);
      if (!wk) return;
      if (!semanas.has(wk)) semanas.set(wk, new Map());
      const trabMap = semanas.get(wk);
      if (!trabMap.has(n.trabajador)) trabMap.set(n.trabajador, { dias: [], monto: 0, pagos: [] });
      const t = trabMap.get(n.trabajador);
      t.dias.push(...dias);
      t.monto += Number(n.monto) || 0;
      t.pagos.push(n);
    });
    return semanas;
  }

  // Render de la vista semanal (tipo Movimientos)
  function nomRenderSemanal() {
    const cont = $('nom-semanas-cont');
    cont.innerHTML = '';
    const semanas = nomAgruparSemanas();
    $('nom-semanas-empty').style.display = semanas.size === 0 ? 'block' : 'none';

    const claves = [...semanas.keys()].sort((a, b) => b.localeCompare(a)); // más reciente primero
    claves.forEach((wk) => {
      const trabMap = semanas.get(wk);
      const rango = nomWeekRango(wk);
      let totalSemana = 0;

      let filas = '';
      [...trabMap.entries()].forEach(([nombre, t]) => {
        totalSemana += t.monto;
        const diasUnicos = [...new Set(t.dias)].sort();
        const diasTxt = diasUnicos.map(nomDiaCorto).join(', ');
        filas += `
          <div style="display:flex;justify-content:space-between;align-items:center;padding:10px 12px;border-bottom:1px solid #F0F4FA;gap:12px;">
            <div style="flex:1;min-width:0;">
              <div style="font-weight:600;color:var(--ink);font-size:13.5px;">${escapeHtml(nombre)}</div>
              <div style="font-size:12px;color:var(--muted);margin-top:2px;">trabajó: ${escapeHtml(diasTxt)} <span style="color:var(--navy);font-weight:600;">(${diasUnicos.length} día${diasUnicos.length!==1?'s':''})</span>${t.pagos.length > 1 ? ` · ${t.pagos.length} pagos` : ''}</div>
            </div>
            <div style="display:flex;align-items:center;gap:10px;flex-shrink:0;">
              <div style="font-family:'IBM Plex Mono',monospace;font-weight:700;color:var(--teal);font-size:14px;white-space:nowrap;">${nomFmt(t.monto)}</div>
              <button type="button" class="gc-action-btn nom-sem-editar-trab" data-i18n="editar" data-wk="${wk}" data-nombre="${escapeHtml(nombre)}" style="padding:4px 10px;font-size:11px;" title="Editar este pago">Editar</button>
            </div>
          </div>`;
      });

      const card = document.createElement('div');
      card.className = 'gc-card';
      card.style.marginBottom = '16px';
      card.innerHTML = `
        <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:10px;margin-bottom:12px;">
          <p style="font-family:'Zilla Slab',serif;font-size:15px;font-weight:600;color:var(--ink);margin:0;">Semana del ${nomFechaCortaTexto(rango.inicio)} al ${nomFechaCortaTexto(rango.fin)}</p>
          <div style="display:flex;gap:8px;flex-wrap:wrap;">
            <button class="gc-action-btn nom-sem-editar" data-i18n="editar_semana" data-wk="${wk}" style="padding:5px 12px;font-size:11.5px;">Editar semana</button>
            <button class="gc-action-btn nom-sem-ver" data-i18n="ver_recibo" data-wk="${wk}" style="padding:5px 12px;font-size:11.5px;">Ver recibo</button>
            <button class="gc-action-btn nom-sem-imp" data-i18n="imprimir" data-wk="${wk}" style="padding:5px 12px;font-size:11.5px;">Imprimir</button>
          </div>
        </div>
        <div style="border:1px solid var(--border);border-radius:10px;overflow:hidden;">
          ${filas}
          <div style="display:flex;justify-content:space-between;align-items:center;padding:12px;background:var(--navy);color:#fff;">
            <span style="font-weight:600;font-size:13px;">TOTAL DE LA SEMANA</span>
            <span style="font-family:'IBM Plex Mono',monospace;font-weight:700;font-size:15px;">${nomFmt(totalSemana)}</span>
          </div>
        </div>`;
      cont.appendChild(card);
    });

    // Listeners
    cont.querySelectorAll('.nom-sem-editar').forEach((btn) => {
      btn.addEventListener('click', () => nomIrASemana(btn.dataset.wk));
    });
    cont.querySelectorAll('.nom-sem-ver').forEach((btn) => {
      btn.addEventListener('click', () => nomMostrarReciboSemanal(btn.dataset.wk));
    });
    cont.querySelectorAll('.nom-sem-imp').forEach((btn) => {
      btn.addEventListener('click', () => {
        ghImprimirEnVentana(nomBuildReciboSemanal(btn.dataset.wk), 'Recibo semanal');
      });
    });
    cont.querySelectorAll('.nom-sem-editar-trab').forEach((btn) => {
      btn.addEventListener('click', () => nomIrASemana(btn.dataset.wk, btn.dataset.nombre));
    });
  }

  // Construir el recibo semanal (invoice de toda la semana)
  function nomBuildReciboSemanal(wk) {
    const FC = facturaColores();
    const semanas = nomAgruparSemanas();
    const trabMap = semanas.get(wk);
    if (!trabMap) return '<div>Sin datos</div>';
    const rango = nomWeekRango(wk);
    let totalSemana = 0;

    const filas = [...trabMap.entries()].map(([nombre, t]) => {
      totalSemana += t.monto;
      const diasUnicos = [...new Set(t.dias)].sort();
      const diasTxt = diasUnicos.map((f) => nomDiaCorto(f)).join(', ');
      return `
        <tr>
          <td style="padding:9px 8px;border-bottom:1px solid #e5e5e5;font-size:12.5px;font-weight:600;">${escapeHtml(nombre)}</td>
          <td style="padding:9px 8px;border-bottom:1px solid #e5e5e5;font-size:12px;color:#555;">${escapeHtml(diasTxt)}</td>
          <td style="padding:9px 8px;border-bottom:1px solid #e5e5e5;text-align:center;font-size:12.5px;">${diasUnicos.length}</td>
          <td style="padding:9px 8px;border-bottom:1px solid #e5e5e5;text-align:right;font-size:12.5px;font-weight:600;">${nomFmt(t.monto)}</td>
        </tr>`;
    }).join('');

    return `
      <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:22px;border-bottom:3px solid ${FC.p};padding-bottom:18px;">
        <div>
          <div style="font-size:22px;font-weight:700;color:${FC.p};font-family:Georgia,serif;">${escapeHtml(cfgFacturaNombre)}</div>
          ${cfgFacturaDireccion ? `<div style="font-size:11.5px;color:#707A8C;margin-top:2px;">${escapeHtml(cfgFacturaDireccion)}</div>` : ''}
          <div style="font-size:12px;color:#666;margin-top:3px;">Recibo de nómina semanal</div>
        </div>
        <div style="text-align:right;">
          <div style="font-size:20px;font-weight:700;color:${FC.p};letter-spacing:1px;">NÓMINA</div>
          <div style="font-size:13px;font-weight:600;color:${FC.p};margin-top:6px;">Semana</div>
          <div style="font-size:12px;color:#666;">${invFechaNum(rango.inicio)}</div>
          <div style="font-size:12px;color:#666;">al ${invFechaNum(rango.fin)}</div>
        </div>
      </div>

      <table style="width:100%;border-collapse:collapse;margin-bottom:18px;">
        <thead><tr style="background:${FC.p};">
          <th style="padding:10px 8px;text-align:left;font-size:10px;color:rgba(255,255,255,.85);text-transform:uppercase;" data-i18n="trabajador">Trabajador</th>
          <th style="padding:10px 8px;text-align:left;font-size:10px;color:rgba(255,255,255,.85);text-transform:uppercase;" data-i18n="h_dias_trabajados">Días trabajados</th>
          <th style="padding:10px 8px;text-align:center;font-size:10px;color:rgba(255,255,255,.85);text-transform:uppercase;width:60px;" data-i18n="h_dias">Días</th>
          <th style="padding:10px 8px;text-align:right;font-size:10px;color:rgba(255,255,255,.85);text-transform:uppercase;width:110px;" data-i18n="h_total">Total</th>
        </tr></thead>
        <tbody>${filas}</tbody>
      </table>

      <div style="display:flex;justify-content:flex-end;">
        <table style="font-size:14px;width:260px;">
          <tr style="border-top:2px solid ${FC.p};"><td style="padding:10px 0;font-size:15px;font-weight:700;color:${FC.p};">TOTAL SEMANA</td><td style="padding:10px 0;text-align:right;font-size:15px;font-weight:700;color:${FC.p};">${nomFmt(totalSemana)}</td></tr>
        </table>
      </div>

      <div style="margin-top:34px;padding-top:12px;border-top:1px solid #eee;text-align:center;font-size:11px;color:#aaa;">${escapeHtml(cfgFacturaNombre)} · Nómina semanal · Semana del ${nomFechaCortaTexto(rango.inicio)} al ${nomFechaCortaTexto(rango.fin)}</div>`;
  }

  let nomSemReciboWk = null;
  function nomMostrarReciboSemanal(wk) {
    nomSemReciboWk = wk;
    nomReciboEnVista = { _semanal: true, wk };
    $('nom-recibo-content').innerHTML = nomBuildReciboSemanal(wk);
    $('nom-btn-imprimir-recibo').style.display = 'none';
    $('nom-btn-descargar-recibo').style.display = 'none';
    $('nom-ov').style.display = 'flex';
  }

  // ---- Ledger de pagos guardados (en Registrar pago) ----
  function nomRenderRegLedger() {
    const buscar = ($('nom-reg-buscar').value || '').trim().toLowerCase(); const cont = $('nom-reg-ledger');
    cont.innerHTML = '';

    let lista = nomDocs.slice().sort((a, b) => (b.creadoEn || '').localeCompare(a.creadoEn || ''));
    if (buscar) {
      lista = lista.filter((n) =>
        (n.trabajador || '').toLowerCase().includes(buscar) ||
        (n.nota || '').toLowerCase().includes(buscar)
      );
    }
    $('nom-reg-empty').style.display = lista.length === 0 ? 'block' : 'none';

    // Optimización: solo mostrar los 20 más recientes si no hay búsqueda
    const MAX = 20;
    const recortada = (!buscar && lista.length >MAX) ? lista.slice(0, MAX) : lista;

    // Construir el HTML de una sola vez (más rápido que muchos appendChild)
    const filas = recortada.map((n) => {
      const dias = Array.isArray(n.dias) ? [...new Set(n.dias)].sort() : [];
      const diasTxt = dias.length ? dias.map(nomDiaCorto).join(', ') : (typeof n.dias === 'number' ? `${n.dias} día(s)` : '—');
      return `
        <div style="display:flex;justify-content:space-between;align-items:center;padding:10px 12px;border-bottom:1px solid #F0F4FA;gap:12px;" data-id="${n.id}">
          <div style="flex:1;min-width:0;">
            <div style="font-weight:600;color:var(--ink);font-size:13.5px;">${escapeHtml(n.trabajador || '')}</div>
            <div style="font-size:12px;color:var(--muted);margin-top:2px;">trabajó: ${escapeHtml(diasTxt)} <span style="color:var(--navy);font-weight:600;">(${dias.length || nomCuentaDias(n.dias)} día${(dias.length||0)!==1?'s':''})</span>${n.nota ? ' · ' + escapeHtml(n.nota) : ''}</div>
          </div>
          <div style="font-family:'IBM Plex Mono',monospace;font-weight:700;color:var(--teal);font-size:14px;white-space:nowrap;">${nomFmt(n.monto)}</div>
          <div style="white-space:nowrap;display:flex;gap:3px;">
            <button class="gc-action-btn nom-reg-ver" data-i18n="ver" data-id="${n.id}" style="padding:4px 9px;font-size:11px;">Ver</button>
            <button class="gc-action-btn nom-reg-imp" data-i18n="imprimir" data-id="${n.id}" style="padding:4px 9px;font-size:11px;">Imprimir</button>
            <button class="gc-action-btn nom-reg-edit" data-id="${n.id}" style="padding:4px 9px;font-size:11px;">✎</button>
            <button class="gc-del nom-reg-del" data-id="${n.id}">✕</button>
          </div>
        </div>`;
    }).join('');

    const aviso = (!buscar && lista.length >MAX)
      ? `<div style="padding:10px 12px;text-align:center;font-size:12px;color:var(--muted);">Mostrando los ${MAX} más recientes de ${lista.length}. Usa el buscador o ve al Historial para ver todos.</div>`
      : '';

    cont.innerHTML = `<div style="border:1px solid var(--border);border-radius:10px;overflow:hidden;">${filas}${aviso}</div>`;

    // Delegación de eventos (más eficiente que un listener por botón)
    cont.querySelectorAll('.nom-reg-ver').forEach((b) => b.addEventListener('click', () => { const n = nomDocs.find((x) => x.id === b.dataset.id); if (n) nomMostrarRecibo(n); }));
    cont.querySelectorAll('.nom-reg-imp').forEach((b) => b.addEventListener('click', () => {
      const n = nomDocs.find((x) => x.id === b.dataset.id); if (!n) return;
      ghImprimirEnVentana(nomBuildRecibo(n), `Recibo - ${n.trabajador || ''}`);
    }));
    cont.querySelectorAll('.nom-reg-edit').forEach((b) => b.addEventListener('click', () => { const n = nomDocs.find((x) => x.id === b.dataset.id); if (n) nomEditar(n); }));
    cont.querySelectorAll('.nom-reg-del').forEach((b) => b.addEventListener('click', async () => {
      if (!await gcConfirm('¿Eliminar este pago?', { okText: 'Eliminar', danger: true })) return;
      nomDocs = nomDocs.filter((x) => x.id !== b.dataset.id);
      await nomSaveDocs();
      toast('Pago eliminado', 'info');
      nomRenderRegLedger();
    }));
  }
  $('nom-reg-buscar').addEventListener('input', debounce(nomRenderRegLedger, 160));



  // ====================================================================
  // FIN MÓDULO NÓMINA
  // ====================================================================

  // ---- Carga inicial ----
  // Empleados y papeles se cargan solo al abrir su sección en Ajustes (más rápido el arranque)
  loadAll();
