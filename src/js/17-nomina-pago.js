  // ===================== NÓMINA: A QUIÉN SE LE PAGA =====================
  // Cada trabajador puede cobrar directo, o su sueldo se le da a un socio
  // (ej. CRA HVAC, que gana su % encima) o a otro trabajador (ej. Ariel
  // Chirinos cobra lo de él y su esposa). Se guarda en emp.pagarA:
  // '' = directo, 'socio:<id>' o 'trab:<id del empleado>'.
  function nomSociosParaPago() {
    const clave = (cfgFacturaNombre || '').trim().toLowerCase();
    return (cfgSocios || []).filter((x) => x && x.nombre && x.nombre.trim().toLowerCase() !== clave);
  }
  function nomOpcionesPagarA(emp) {
    const actual = emp.pagarA || '';
    const op = (v, t) => `<option value="${escapeHtml(v)}"${v === actual ? ' selected' : ''}>${escapeHtml(t)}</option>`;
    const socios = nomSociosParaPago().map((x) => op('socio:' + x.id, x.nombre + ' (socio)'));
    const otros = empleados.filter((e) => e.estado !== 'inactivo' && e.id !== emp.id)
      .map((e) => op('trab:' + e.id, empNombreCompleto(e)));
    const libre = actual.startsWith('nombre:') ? op(actual, actual.slice(7) + ' (sin %)') : '';
    return op('', 'Directo (a él)') + socios.join('') + otros.join('') + libre + '<option value="__otro__">Otro nombre… (sin %)</option>';
  }
  // Quién cobra el pago de un trabajador → { key, nombre, tipo: 'socio' | 'trab', socioId, bonoPct }
  function nomReceptorDe(nombreTrab, ctx) {
    // ctx = { empleados, socios } de otra base de datos (para cheques); sin ctx, la base actual
    const emps = ctx ? ctx.empleados : empleados;
    const nBusca = String(nombreTrab || '').trim().toLowerCase();
    const emp = ctx ? emps.find((e) => empNombreCompleto(e).toLowerCase() === nBusca) : nomBuscarTrab(nombreTrab);
    // Si en la otra base no se escogió a quién se le paga, se usa lo de esta base (mismo nombre)
    if (ctx && !(emp && emp.pagarA) && nomBuscarTrab(nombreTrab) && nomBuscarTrab(nombreTrab).pagarA) return nomReceptorDe(nombreTrab);
    const pa = (emp && emp.pagarA) || '';
    if (pa.startsWith('socio:')) {
      const socio = (ctx ? ctx.socios : nomSociosParaPago()).find((x) => x.id === pa.slice(6));
      if (socio) return { key: pa, nombre: socio.nombre, tipo: 'socio', socioId: socio.id, bonoPct: Number(socio.bonoPct) || 0 };
    }
    if (pa.startsWith('nombre:') && pa.slice(7).trim()) {
      return { key: 'nombre:' + pa.slice(7).trim().toLowerCase(), nombre: pa.slice(7).trim(), tipo: 'otro' };
    }
    if (pa.startsWith('trab:')) {
      const t = emps.find((e) => e.id === pa.slice(5) && e.estado !== 'inactivo');
      if (t) return { key: 'trab:' + t.id, nombre: empNombreCompleto(t), tipo: 'trab' };
    }
    return { key: 'trab:' + (emp ? emp.id : String(nombreTrab || '').toLowerCase()), nombre: emp ? empNombreCompleto(emp) : (nombreTrab || ''), tipo: 'trab' };
  }
  // Pagos de una semana agrupados por quién cobra (socios primero)
  function nomAgruparSemana(weekKey, docs) {
    const grupos = new Map();
    (docs || nomDocs || []).filter((n) => chqSemanaDe(n) === weekKey && Number(n.monto) > 0).forEach((n) => {
      const r = nomReceptorDe(n.trabajador, n._ctx);
      const clave = String(r.nombre || '').trim().toLowerCase();
      if (!grupos.has(clave)) grupos.set(clave, Object.assign({}, r, { pagos: [], total: 0 }));
      const g = grupos.get(clave);
      g.pagos.push(n);
      g.total += Number(n.monto) || 0;
    });
    return [...grupos.values()].map((g) => Object.assign(g, { total: Math.round(g.total * 100) / 100 }))
      .sort((a, b) => ((a.tipo === 'socio') === (b.tipo === 'socio') ? a.nombre.localeCompare(b.nombre) : (a.tipo === 'socio' ? -1 : 1)));
  }
  function nomSemanasConPagos() {
    const set = new Set();
    (nomDocs || []).forEach((n) => { const k = chqSemanaDe(n); if (k) set.add(k); });
    return [...set].sort().reverse();
  }
  function nomEtiquetaSemana(k) {
    const r = nomWeekRango(k);
    const f = (iso) => { const d = new Date(iso + 'T00:00:00'); return d.toLocaleDateString('es-MX', { day: 'numeric', month: 'short' }); };
    return `${f(r.inicio)} – ${f(r.fin)}`;
  }

  // ---- Movimientos → Agregar nómina de la semana ----
  async function movNomAbrir() {
    // Hace falta la nómina Y los empleados (con "a quién se le paga"): sin
    // empleados, lo de CRA HVAC salía como gasto suelto sin su ajuste ni su %.
    try { await nomAsegurarCargado(); } catch (e) {}
    if (!empleados || !empleados.length) { try { await loadEmpleados(); } catch (e) {} }
    const semanas = nomSemanasConPagos();
    const sel = $('mov-nom-semana');
    if (!semanas.length) { toast('No hay nómina registrada todavía (Nómina → Registrar pago)', 'error', 3500); return; }
    // Por defecto la semana pasada (la que se paga esta semana), si existe
    const hoy = nomToday();
    const pasada = (() => { const d = new Date(nomWeekKey(hoy) + 'T00:00:00'); d.setDate(d.getDate() - 7); return ghFechaLocal(d); })();
    const yaAgregadas = new Set(movimientos.filter((m) => m.nominaSemana).map((m) => m.nominaSemana));
    sel.innerHTML = semanas.slice(0, 20).map((k) => `<option value="${k}">${escapeHtml(nomEtiquetaSemana(k))}${yaAgregadas.has(k) ? ' · ya agregada' : ''}</option>`).join('');
    sel.value = semanas.includes(pasada) ? pasada : semanas[0];
    $('mov-nom-fecha').value = today();
    $('mov-nom-panel').style.display = 'block';
    movNomResumen();
  }
  function movNomResumen() {
    const k = $('mov-nom-semana').value;
    const grupos = nomAgruparSemana(k);
    const total = grupos.reduce((t, g) => t + g.total, 0);
    const filas = grupos.map((g) => {
      const quienes = g.pagos.map((n) => `${escapeHtml(n.trabajador || '')} (${nomCuentaDias(n.dias)} d)`).join(', ');
      const pct = g.tipo === 'socio' ? g.bonoPct : 0;
      let nota = '';
      if (g.tipo === 'otro') {
        nota = `<div style="font-size:12px;color:var(--muted);margin-top:3px;">Gasto de nómina, sin % (no es socio en esta base)</div>`;
      } else if (g.tipo === 'socio') {
        nota = pct > 0
          ? `<div style="font-size:12px;color:var(--teal);margin-top:3px;">Gasto + ajuste a ${escapeHtml(g.nombre)} · su ${pct}%: ${nomFmt(g.total * pct / 100)} (de las taxas)</div>`
          : `<div style="font-size:12px;color:var(--ember);margin-top:3px;">${escapeHtml(g.nombre)} tiene 0% en Ajustes → Socios. Ponle 10% para que gane su porcentaje.</div>`;
      } else {
        nota = `<div style="font-size:12px;color:var(--muted);margin-top:3px;">Gasto de nómina, sin %</div>`;
      }
      return `<div style="display:flex;justify-content:space-between;gap:12px;padding:9px 0;border-bottom:1px solid var(--border-soft);">
        <div style="min-width:0;"><strong>${escapeHtml(g.nombre)}</strong>${g.tipo === 'socio' ? ' <span style="font-size:11px;color:var(--muted);">socio</span>' : ''}
          <div style="font-size:12.5px;color:var(--muted);">${quienes}</div>${nota}</div>
        <strong style="white-space:nowrap;">${nomFmt(g.total)}</strong></div>`;
    }).join('');
    $('mov-nom-resumen').innerHTML = grupos.length
      ? filas + `<div style="display:flex;justify-content:space-between;padding-top:10px;font-weight:700;font-size:14.5px;"><span>Total nómina (se cobra una vez)</span><span>${nomFmt(total)}</span></div>`
      : '<div class="gc-empty" style="display:block;">Esa semana no tiene pagos.</div>';
  }
  async function movNomAgregar() {
    const k = $('mov-nom-semana').value;
    const fecha = $('mov-nom-fecha').value || today();
    const grupos = nomAgruparSemana(k);
    if (!grupos.length) { toast('Esa semana no tiene pagos', 'error'); return; }
    const previos = movimientos.filter((m) => m.nominaSemana === k);
    if (previos.length) {
      const ok = await gcConfirm(`La nómina de ${nomEtiquetaSemana(k)} ya está en movimientos (${previos.length} movimiento(s)).\n\n¿Reemplazarla con la de ahora?`, { okText: 'Reemplazar' });
      if (!ok) return;
      movimientos = movimientos.filter((m) => m.nominaSemana !== k);
    }
    const semanaTxt = nomEtiquetaSemana(k);
    let base = Date.now();
    let nuevasCats = false;
    grupos.forEach((g) => {
      const detalle = g.pagos.map((n) => ({ trabajador: n.trabajador, dias: Array.isArray(n.dias) ? n.dias.slice().sort() : n.dias, sueldoDia: n.sueldoDia || 0, extraDesc: n.extraDesc || '', extraMonto: n.extraMonto || 0, monto: n.monto }));
      const quienes = g.pagos.map((n) => `${n.trabajador} ${nomCuentaDias(n.dias)}d`).join(', ');
      if (!catGastos.includes(g.nombre)) { catGastos.push(g.nombre); nuevasCats = true; }
      movimientos.push({ id: base++, fecha, tipo: 'gasto', cat: g.nombre, monto: g.total,
        desc: `Nómina ${semanaTxt}: ${quienes}`, deducible: false, nominaSemana: k, nominaDetalle: detalle });
      if (g.tipo === 'socio') {
        movimientos.push({ id: base++, fecha, tipo: 'ajuste', cat: 'Ajuste +', monto: g.total,
          desc: `Nómina ${semanaTxt} (${g.pagos.length} trabajador${g.pagos.length === 1 ? '' : 'es'}): ${quienes}`, deducible: false,
          ajusteDir: 'sumar', ajusteSocioId: g.socioId, ajusteSocioNombre: nombreDeAjuste(g.socioId) || g.nombre,
          nominaSemana: k, nominaDetalle: detalle });
      }
    });
    if (nuevasCats) { try { await saveCatGastos(); } catch (e) {} renderCatSelect(); try { renderCategorias(); } catch (e) {} }
    try { await saveMov(); } catch (e) { toast('No se pudo guardar la nómina en movimientos: ' + ((e && e.message) || e), 'error', 5000); return; }
    renderMovimientos();
    try { renderReparto(); } catch (e) {}
    try { actualizarStats(); } catch (e) {}
    try { refrescarSugerenciasDesc(); ghActualizarHero(); } catch (e) {}
    $('mov-nom-panel').style.display = 'none';
    const total = grupos.reduce((t, g) => t + g.total, 0);
    toast(`Nómina ${semanaTxt} agregada: ${nomFmt(total)}`, 'success', 3200);
  }
  $('mov-nom-abrir').addEventListener('click', () => {
    if ($('mov-nom-panel').style.display === 'block') { $('mov-nom-panel').style.display = 'none'; return; }
    movNomAbrir();
  });
  $('mov-nom-cerrar').addEventListener('click', () => { $('mov-nom-panel').style.display = 'none'; });
  $('mov-nom-semana').addEventListener('change', movNomResumen);
  $('mov-nom-agregar').addEventListener('click', movNomAgregar);
  // ===================== /NÓMINA: A QUIÉN SE LE PAGA =====================

