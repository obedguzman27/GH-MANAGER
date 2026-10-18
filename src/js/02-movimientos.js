  // ============================================================
  // LISTA EDITABLE (categorías, clientes, trabajos, colonias)
  // Buscar, contar usos, cambiar el nombre ahí mismo, quitar y ordenar A–Z.
  // ============================================================
  const glNorm = (t) => String(t == null ? '' : t).normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
  function ghListaEditable(o) {
    const cont = typeof o.cont === 'string' ? $(o.cont) : o.cont;
    if (!cont) return;
    cont.style.display = 'block';
    if (!cont.querySelector(':scope > .gl-tools')) {
      cont.innerHTML = `<div class="gl-tools">
          <input type="search" class="gl-q" placeholder="Buscar…" autocomplete="off" aria-label="Buscar en la lista">
          <span class="gl-n"></span>
          <button type="button" class="gl-orden" title="Ordenar la lista de la A a la Z">A–Z</button>
        </div><div class="gl-list"></div>`;
      cont.querySelector('.gl-q').addEventListener('input', () => ghListaEditable(cont.__gl));
      cont.querySelector('.gl-orden').addEventListener('click', async () => {
        const c = cont.__gl; if (!c.ordenar) return;
        await c.ordenar(); ghListaEditable(c); toast('Lista ordenada de la A a la Z ✓', 'success', 1800);
      });
    }
    cont.__gl = o;
    const items = o.items() || [];
    const q = glNorm(cont.querySelector('.gl-q').value);
    const lista = cont.querySelector('.gl-list');
    const filas = items.map((it, i) => ({ it, i, nom: o.nombre ? o.nombre(it) : String(it) }))
      .filter((f) => !q || glNorm(f.nom).includes(q));
    cont.querySelector('.gl-n').textContent = q ? `${filas.length} de ${items.length}` : `${items.length}`;
    cont.querySelector('.gl-orden').style.display = items.length > 1 && o.ordenar ? '' : 'none';
    if (!items.length) { lista.innerHTML = `<div class="gl-vacio">${escapeHtml(o.vacio || 'La lista está vacía. Agrega arriba.')}</div>`; return; }
    if (!filas.length) { lista.innerHTML = `<div class="gl-vacio">Nada coincide con "${escapeHtml(cont.querySelector('.gl-q').value)}".</div>`; return; }
    lista.innerHTML = filas.map((f) => {
      const usos = o.uso ? o.uso(f.nom, f.it) : 0;
      return `<div class="gl-row" data-i="${f.i}">
        <span class="gl-nom">${escapeHtml(f.nom)}</span>
        ${o.uso ? `<span class="gl-uso${usos ? '' : ' cero'}" title="${usos} ${o.usoTxt || 'usos'}">${usos}</span>` : ''}
        ${o.extra ? `<span class="gl-extra">${o.extra(f.it, f.i)}</span>` : ''}
        <button type="button" class="gl-btn gl-ed" title="Cambiar el nombre" aria-label="Cambiar el nombre">✎</button>
        <button type="button" class="gl-btn gl-del" title="Quitar" aria-label="Quitar">✕</button>
      </div>`;
    }).join('');
    lista.querySelectorAll('.gl-row').forEach((row) => {
      const i = Number(row.dataset.i);
      if (o.conectarExtra) o.conectarExtra(row, i);
      row.querySelector('.gl-del').addEventListener('click', async () => {
        const it = o.items()[i]; const nom = o.nombre ? o.nombre(it) : String(it);
        const usos = o.uso ? o.uso(nom, it) : 0;
        if (usos && !await gcConfirm(`"${nom}" se usa en ${usos} ${o.usoTxt || 'registros'}. ¿Quitarla de la lista?\n\nLo que ya está guardado no cambia.`, { okText: 'Quitar', danger: true })) return;
        await o.borrar(i);
        ghListaEditable(o);
        toast(`"${nom}" quitado de la lista`, 'info', 2000);
      });
      row.querySelector('.gl-ed').addEventListener('click', () => {
        const it = o.items()[i]; const viejo = o.nombre ? o.nombre(it) : String(it);
        const span = row.querySelector('.gl-nom');
        row.classList.add('editando');
        span.innerHTML = `<input type="text" class="gl-in" value="${escapeHtml(viejo)}" autocomplete="off"><button type="button" class="gl-btn gl-ok" title="Guardar">✓</button>`;
        const inp = span.querySelector('input'); inp.focus(); inp.select();
        let listo = false;
        const guardar = async () => {
          if (listo) return;
          const nuevo = inp.value.replace(/\s+/g, ' ').trim();
          if (!nuevo || nuevo === viejo) { listo = true; ghListaEditable(o); return; }
          const otro = o.items().findIndex((x, k) => k !== i && glNorm(o.nombre ? o.nombre(x) : x) === glNorm(nuevo));
          if (otro >= 0) { toast(`Ya hay "${nuevo}" en la lista`, 'error'); inp.focus(); return; }
          listo = true;
          await o.renombrar(i, nuevo, viejo);
          ghListaEditable(o);
          toast(`Cambiado a "${nuevo}" ✓`, 'success', 2000);
        };
        span.querySelector('.gl-ok').addEventListener('click', guardar);
        inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); guardar(); } if (e.key === 'Escape') { listo = true; ghListaEditable(o); } });
      });
    });
  }
  const glOrdenarArr = (arr, nombre) => arr.sort((a, b) => (nombre ? nombre(a) : String(a)).localeCompare(nombre ? nombre(b) : String(b), 'es', { sensitivity: 'base' }));
  // ---- Categorías (gestión): editables, con usos ----
  function glUsoCat(tipo, nom) {
    const k = glNorm(nom);
    let n = (movimientos || []).filter((m) => m.tipo === tipo && glNorm(m.cat) === k).length;
    (invoicesGuardados || []).forEach((inv) => { (((tipo === 'gasto' ? inv.gastoItems : inv.ingresoItems)) || []).forEach((g) => { if (glNorm(g.cat) === k) n++; }); });
    return n;
  }
  async function glRenombrarCat(tipo, lista, i, nuevo, viejo) {
    lista[i] = nuevo;
    const k = glNorm(viejo);
    let cambios = 0;
    (movimientos || []).forEach((m) => { if (m.tipo === tipo && glNorm(m.cat) === k) { m.cat = nuevo; cambios++; } });
    let cambiosInv = 0;
    (invoicesGuardados || []).forEach((inv) => { (((tipo === 'gasto' ? inv.gastoItems : inv.ingresoItems)) || []).forEach((g) => { if (glNorm(g.cat) === k) { g.cat = nuevo; cambiosInv++; } }); });
    if (tipo === 'gasto') await saveCatGastos(); else await saveCatIngresos();
    if (cambios) await saveMov();
    if (cambiosInv) { try { await saveInvoices(); } catch (e) {} }
    renderCatSelect(); try { renderMovimientos(); } catch (e) {}
  }
  function renderCategorias() {
    ghListaEditable({
      cont: 'lista-gastos', items: () => catGastos, uso: (n) => glUsoCat('gasto', n), usoTxt: 'gastos registrados',
      vacio: 'Sin categorías de gasto. Agrega la primera arriba.',
      renombrar: (i, nuevo, viejo) => glRenombrarCat('gasto', catGastos, i, nuevo, viejo),
      borrar: async (i) => { catGastos.splice(i, 1); renderCatSelect(); await saveCatGastos(); },
      ordenar: async () => { glOrdenarArr(catGastos); renderCatSelect(); await saveCatGastos(); }
    });
    ghListaEditable({
      cont: 'lista-ingresos', items: () => catIngresos, uso: (n) => glUsoCat('ingreso', n), usoTxt: 'ingresos registrados',
      vacio: 'Sin categorías de ingreso. Agrega la primera arriba.',
      renombrar: (i, nuevo, viejo) => glRenombrarCat('ingreso', catIngresos, i, nuevo, viejo),
      borrar: async (i) => { catIngresos.splice(i, 1); renderCatSelect(); await saveCatIngresos(); },
      ordenar: async () => { glOrdenarArr(catIngresos); renderCatSelect(); await saveCatIngresos(); }
    });
  }

  $('btn-agregar-gasto').addEventListener('click', () => {
    const val = $('cat-gasto-nueva').value.trim();
    if (!val || catGastos.includes(val)) { $('cat-gasto-nueva').value = ''; return; }
    catGastos.push(val); $('cat-gasto-nueva').value = '';
    renderCategorias(); renderCatSelect(); saveCatGastos();
  });
  $('cat-gasto-nueva').addEventListener('keydown', (e) => { if (e.key === 'Enter') $('btn-agregar-gasto').click(); });

  $('btn-agregar-ingreso').addEventListener('click', () => {
    const val = $('cat-ingreso-nueva').value.trim();
    if (!val || catIngresos.includes(val)) { $('cat-ingreso-nueva').value = ''; return; }
    catIngresos.push(val); $('cat-ingreso-nueva').value = '';
    renderCategorias(); renderCatSelect(); saveCatIngresos();
  });
  $('cat-ingreso-nueva').addEventListener('keydown', (e) => { if (e.key === 'Enter') $('btn-agregar-ingreso').click(); });

  // ---- Categoría rápida desde Movimientos (sin salir de la pantalla) ----
  $('m-cat').addEventListener('change', () => {
    if ($('m-cat').value !== '__nueva__') return;
    $('mov-cat-nueva-row').style.display = 'block';
    $('mov-cat-nueva-input').value = '';
    $('mov-cat-nueva-input').focus();
  });
  function movCancelarCatNueva() {
    $('mov-cat-nueva-row').style.display = 'none';
    renderCatSelect(); // vuelve a la primera categoría en vez de dejar "+ Nueva categoría…" seleccionado
  }
  $('mov-cat-nueva-cancelar').addEventListener('click', movCancelarCatNueva);
  async function movGuardarCatNueva() {
    const val = $('mov-cat-nueva-input').value.trim();
    if (!val) { movCancelarCatNueva(); return; }
    const lista = tipoActual === 'ingreso' ? catIngresos : catGastos;
    if (!lista.includes(val)) {
      lista.push(val);
      if (tipoActual === 'ingreso') await saveCatIngresos(); else await saveCatGastos();
      if (typeof renderCategorias === 'function') renderCategorias();
    }
    $('mov-cat-nueva-row').style.display = 'none';
    renderCatSelect();
    $('m-cat').value = val; // deja seleccionada la que se acaba de crear
    toast('Categoría agregada ✓', 'success', 1800);
  }
  $('mov-cat-nueva-guardar').addEventListener('click', movGuardarCatNueva);
  $('mov-cat-nueva-input').addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); movGuardarCatNueva(); } });

  // ---- Sugerencias de descripción: recuerda lo que ya se ha escrito antes ----
  function refrescarSugerenciasDesc() {
    const dl = $('dl-desc-sugeridas');
    if (!dl) return;
    const vistas = new Set();
    const unicas = [];
    [...movimientos].sort((a, b) => (b.fecha || '').localeCompare(a.fecha || '')).forEach((m) => {
      const d = (m.desc || '').trim();
      if (d && !vistas.has(d.toLowerCase())) { vistas.add(d.toLowerCase()); unicas.push(d); }
    });
    dl.innerHTML = unicas.slice(0, 40).map((d) => `<option value="${escapeHtml(d)}">`).join('');
  }

  // ---- Guardar movimiento ----
  function limpiarFormularioMov(avisar) {
    if (tipoActual === 'ingreso') actualizarSemanaIngreso(); // mantiene la semana seleccionada
    $('m-fecha').value = today();   // la fecha siempre es el día en que se mete
    $('m-monto').value = '';
    $('m-desc').value = '';
    $('m-deducible').checked = false;
    // Reset ajuste-related fields
    ajusteDir = 'sumar';
    ajusteSocioSel = '';
    document.querySelectorAll('.ajuste-dir-btn').forEach((b) => b.classList.toggle('active', b.dataset.dir === 'sumar'));
    actualizarSociosAjusteSelect();
    // El tipo (Ingreso/Gasto/Ajuste) se queda donde el usuario lo dejó — no se resetea
    renderCatSelect();
    refrescarSugerenciasDesc();
    if (avisar) {
      $('status-mov').textContent = 'Formulario limpiado';
      setTimeout(() => { $('status-mov').textContent = ''; }, 1200);
    }
  }
  $('btn-limpiar-mov').addEventListener('click', () => limpiarFormularioMov(true));

  $('btn-guardar-mov').addEventListener('click', () => {
    const fecha = $('m-fecha').value || today();
    const esAjuste = tipoActual === 'ajuste';
    const cat = esAjuste ? (ajusteDir === 'sumar' ? 'Ajuste +' : 'Ajuste −') : $('m-cat').value;
    const monto = parseFloat($('m-monto').value.replace(',', '.'));
    const desc = $('m-desc').value.trim();
    const deducible = tipoActual === 'gasto' && $('m-deducible').checked;

    if (!esAjuste && !cat) { $('status-mov').textContent = 'Agrega al menos una categoría primero'; return; }
    if (cat === '__nueva__') { $('status-mov').textContent = 'Termina de agregar la categoría nueva, o elige una de la lista'; $('mov-cat-nueva-row').style.display = 'block'; $('mov-cat-nueva-input').focus(); return; }
    if (esAjuste && !ajusteSocioSel) { $('status-mov').textContent = 'Elige a quién va el ajuste'; toast('Elige a quién va el ajuste', 'error'); return; }
    if (!monto || monto <= 0) {
      $('status-mov').textContent = 'Captura un monto válido';
      setTimeout(() => { $('status-mov').textContent = ''; }, 1800);
      return;
    }

    if (movEditandoId != null) {
      // Actualizar el movimiento existente
      const idx = movimientos.findIndex((x) => x.id === movEditandoId);
      if (idx >= 0) {
        const orig = movimientos[idx];
        const fechaCambio = !esAjuste && tipoActual === 'gasto' && orig.tipo === 'gasto' && orig.fecha !== fecha;
        movimientos[idx] = { ...orig, id: movEditandoId, fecha, tipo: tipoActual, cat, monto, desc, deducible };
        if (tipoActual === 'ingreso' && ingresoSemanaKey) movimientos[idx].semana = ingresoSemanaKey; else delete movimientos[idx].semana;
        // Preservar datos de ajuste para movimientos tipo ajuste
        if (esAjuste) {
          movimientos[idx].ajusteDir = ajusteDir;
          movimientos[idx].ajusteSocioId = ajusteSocioSel;
          movimientos[idx].ajusteSocioNombre = nombreDeAjuste(ajusteSocioSel);
        } else if (tipoActual !== 'ajuste') {
          // Si no es ajuste, limpiar datos de ajuste
          delete movimientos[idx].ajusteDir;
          delete movimientos[idx].ajusteSocioIdx;
          delete movimientos[idx].ajusteSocioNombre;
          delete movimientos[idx].ajusteSocioId;
        }

        // Si es un gasto y cambió de fecha, mover también los demás gastos activos
        // de esa misma semana (invoice) a la nueva fecha — sin tocar invoices ya guardados.
        var otrosMovidos = 0;
        if (fechaCambio) {
          const semanaOriginal = weekInfo(orig.fecha).key;
          movimientos.forEach((m) => {
            if (m.id === movEditandoId || m.tipo !== 'gasto') return;
            if (weekInfo(m.fecha).key === semanaOriginal) { m.fecha = fecha; otrosMovidos++; }
          });
        }
      }
      movEditandoId = null;
      $('btn-guardar-mov').textContent = 'Guardar movimiento';
      limpiarFormularioMov(false);
      saveMov();
      renderMovimientos();
      renderReparto();
      toast(otrosMovidos > 0
        ? `Movimiento actualizado ✓ — fecha cambiada también en ${otrosMovidos} gasto(s) más de esa semana`
        : 'Movimiento actualizado ✓', 'success', otrosMovidos > 0 ? 3800 : undefined);
      return;
    }

    const nuevo = { id: Date.now(), fecha, tipo: tipoActual, cat, monto, desc, deducible };
    if (tipoActual === 'ingreso' && ingresoSemanaKey) nuevo.semana = ingresoSemanaKey;
    if (esAjuste) {
      nuevo.ajusteDir = ajusteDir;
      nuevo.ajusteSocioId = ajusteSocioSel;
      nuevo.ajusteSocioNombre = nombreDeAjuste(ajusteSocioSel);
    }
    movimientos.push(nuevo);
    limpiarFormularioMov(false);
    saveMov();
    renderMovimientos();
    renderReparto();
    const nombreSocio = nombreDeAjuste(ajusteSocioSel) || 'socio';
    toast(esAjuste ? `Ajuste a ${nombreSocio} guardado ✓` : 'Movimiento guardado ✓', 'success');
  });

  // ---- Hoja de movimientos agrupada por semana ----


  // ---- Resumen del día (tarjeta de arriba en Registro) ----
  async function ghActualizarHero() {
    const h = new Date().getHours();
    const saludo = h < 12 ? 'Buen día' : h < 19 ? 'Buenas tardes' : 'Buenas noches';
    const el = $('gh-hero-saludo');
    if (!el) return;
    el.textContent = saludo;
    $('gh-hero-fecha').textContent = new Date().toLocaleDateString('es-MX', { weekday: 'long', day: 'numeric', month: 'long' });

    // Por cobrar: facturas guardadas que no están marcadas como pagadas.
    // Se leen directo del almacenamiento porque Facturas puede no haberse
    // abierto todavía en esta sesión (y entonces invDocs estaría vacío).
    let docs = invDocs;
    if (!docs || !docs.length) {
      const r = await window.storage.get(INV_KEY).catch(() => null);
      try { docs = JSON.parse(r.value); } catch (e) { docs = []; }
    }
    // Semana pasada (lunes a domingo): es la que se cobra y se paga esta semana
    const hoyD = new Date(today() + 'T00:00:00');
    const lunesPas = new Date(hoyD); lunesPas.setDate(hoyD.getDate() - ((hoyD.getDay() + 6) % 7) - 7);
    const domPas = new Date(lunesPas); domPas.setDate(lunesPas.getDate() + 6);
    const iniPas = ghFechaLocal(lunesPas), finPas = ghFechaLocal(domPas);
    const enSemPas = (iso) => !!iso && iso >= iniPas && iso <= finPas;
    const mesesC = ['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic'];
    const rangoTxt = `${lunesPas.getDate()} ${mesesC[lunesPas.getMonth()]} – ${domPas.getDate()} ${mesesC[domPas.getMonth()]}`;

    // Por cobrar: facturas pendientes del trabajo de la semana pasada (por la
    // fecha de sus líneas; si no traen fecha, por la fecha de la factura).
    const deSemPasada = (d) => {
      const dias = (d.items || []).map((it) => it.dia).filter((x) => /^\d{4}-\d{2}-\d{2}$/.test(x || ''));
      return dias.length ? dias.some(enSemPas) : enSemPas(d.fecha);
    };
    const pend = (docs || []).filter((d) => !d.pagada && deSemPasada(d));
    const totalPend = pend.reduce((sum, d) => sum + (Number(d.total) || 0), 0);
    $('gh-val-cobrar').textContent = fmt(totalPend);
    $('gh-sub-cobrar').textContent = (pend.length === 1 ? '1 factura' : `${pend.length} facturas`) + ' · ' + rangoTxt;
    $('gh-tile-cobrar').classList.toggle('alerta', pend.length > 0);

    // Nómina de la semana pasada (lo que se paga esta semana)
    let nom = [];
    try { const rn = await window.storage.get('gh-nomina'); nom = JSON.parse(rn.value) || []; } catch (e) { nom = []; }
    let totalNom = 0; const trabNom = new Set();
    (nom || []).forEach((n) => {
      const dias = Array.isArray(n.dias) ? n.dias.slice().sort() : [];
      const ref = dias[0] || (n.creadoEn || '').slice(0, 10);
      if (!enSemPas(ref)) return;
      totalNom += Number(n.monto) || 0;
      if (n.trabajador) trabNom.add(n.trabajador);
    });
    $('gh-val-nomina').textContent = fmt(totalNom);
    $('gh-sub-nomina').textContent = (trabNom.size === 1 ? '1 trabajador' : `${trabNom.size} trabajadores`) + ' · ' + rangoTxt;

    // Trabajos agendados para hoy
    let lista = citas;
    if (!lista || !lista.length) {
      const r2 = await window.storage.get(CITAS_KEY).catch(() => null);
      try { lista = JSON.parse(r2.value); } catch (e) { lista = []; }
    }
    const hoyISO = today();
    const deHoy = (lista || []).filter((c) => c.fecha === hoyISO);
    $('gh-val-hoy').textContent = String(deHoy.length);
    $('gh-sub-hoy').textContent = deHoy.length === 1 ? 'trabajo agendado' : 'trabajos agendados';

    // Neto de la semana en curso
    const semanas = calcularSemanas();
    const keyHoy = weekInfo(hoyISO).key;
    const sem = semanas.find((x) => x.key === keyHoy);
    $('gh-val-semana').textContent = fmt(sem ? sem.neto : 0);
  }

  (function () {
    const t1 = $('gh-tile-cobrar'), t2 = $('gh-tile-hoy'), t3 = $('gh-tile-semana'), rf = $('gh-hero-refresh');
    if (t1) t1.addEventListener('click', () => {
      document.querySelector('.gc-tab[data-tab="facturas"]').click();
      document.querySelector('.inv-subtab[data-sub="guardadas"]').click();
    });
    // (Calendario quitado: la ficha "Hoy" ya no se muestra)
    const t4 = $('gh-tile-nomina');
    if (t4) t4.addEventListener('click', () => document.querySelector('.gc-tab[data-tab="nomina"]').click());
    if (t3) t3.addEventListener('click', () => document.querySelector('.mov-subtab[data-msub="invoices"]').click());
    if (rf) rf.addEventListener('click', () => { ghActualizarHero(); toast('Resumen actualizado ✓', 'info', 1500); });
  })();

  function actualizarStats() {
    const hoy = today();
    const semAct = weekInfo(hoy).key;
    const fechaSemPasada = new Date(hoy + 'T00:00:00'); fechaSemPasada.setDate(fechaSemPasada.getDate() - 7);
    const semAnt = weekInfo(ghFechaLocal(fechaSemPasada)).key;

    const movSem = movimientos.filter(m => weekInfo(movRefSemana(m)).key === semAct);
    const movAnt = movimientos.filter(m => weekInfo(movRefSemana(m)).key === semAnt);
    const ing = movSem.filter(m => m.tipo === 'ingreso').reduce((s,m) => s + (Number(m.monto)||0), 0);
    const gas = movSem.filter(m => m.tipo === 'gasto').reduce((s,m) => s + (Number(m.monto)||0), 0);
    const ingAnt = movAnt.filter(m => m.tipo === 'ingreso').reduce((s,m) => s + (Number(m.monto)||0), 0);
    const gasAnt = movAnt.filter(m => m.tipo === 'gasto').reduce((s,m) => s + (Number(m.monto)||0), 0);
    // Igual que el resumen de arriba: el neto ya descuenta las taxas (antes salían dos "Neto semana" distintos)
    const net = ing - gas - ing * TASA_TAXAS;
    if ($('stat-ing')) $('stat-ing').textContent = fmt(ing);
    if ($('stat-gas')) $('stat-gas').textContent = fmt(gas);
    if ($('stat-net')) { $('stat-net').textContent = fmt(net); $('stat-net').style.color = net >= 0 ? 'var(--teal)' : 'var(--ember)'; }
    if ($('stat-inv')) $('stat-inv').textContent = invoicesGuardados.length;
    renderStatDelta('stat-ing-delta', ing, ingAnt, true);
    renderStatDelta('stat-gas-delta', gas, gasAnt, false);
    // Totales acumulados de todos los invoices guardados
    let totTaxas = 0, totCra = 0, totTaxGuzman = 0;
    invoicesGuardados.forEach((inv) => {
      totTaxas += (inv.taxas || 0);
      totCra += (inv.pagoCra || 0);
      totTaxGuzman += (inv.taxGuzman || 0);
    });
    if ($('stat-taxas-total')) $('stat-taxas-total').textContent = fmt(totTaxas);
    if ($('stat-cra-total')) $('stat-cra-total').textContent = fmt(totCra);
    if ($('stat-tax-guzman')) $('stat-tax-guzman').textContent = fmt(totTaxGuzman);
  }

  // Compara esta semana contra la pasada. subirEsBueno=true para ingresos
  // (subir = verde), false para gastos (subir = naranja/alerta).
  function renderStatDelta(elId, actual, anterior, subirEsBueno) {
    const el = $(elId);
    if (!el) return;
    if (anterior <= 0) { el.textContent = ''; return; } // sin semana pasada que comparar
    const cambio = ((actual - anterior) / anterior) * 100;
    if (Math.abs(cambio) < 1) { el.textContent = 'igual que la semana pasada'; el.style.color = 'var(--muted)'; return; }
    const subio = cambio > 0;
    const esBueno = subio === subirEsBueno;
    el.style.color = esBueno ? 'var(--teal-dk)' : 'var(--ember)';
    el.textContent = (subio ? '↑ ' : '↓ ') + Math.abs(cambio).toFixed(0) + '% vs. semana pasada';
  }

  let movMostrarTodasSemanas = false; // por defecto solo semanas recientes, para no saturar el libro
  const MOV_SEMANAS_LIMITE = 8;

  // ---- Modo selección en Movimientos ----
  const movSel = ghCrearSeleccion({
    host: 'mov-sel-host',
    contenedor: 'tbody-mov',
    nombre: 'movimiento', plural: 'movimientos',
    acciones: [
      { id: 'deducible', texto: '✓ Deducible', fn: async (ids) => {
          let n = 0;
          ids.forEach((id) => {
            const m = movimientos.find((x) => String(x.id) === id);
            if (m && m.tipo === 'gasto') { m.deducible = true; n++; }
          });
          if (!n) { toast('Marca gastos para poder hacerlos deducibles', 'info'); return; }
          await saveMov(); renderMovimientos();
          toast(`${n} gasto(s) marcado(s) como deducible(s) ✓`);
        } },
      { id: 'csv', texto: '⬇ Exportar', fn: (ids) => {
          const sel = ids.map((id) => movimientos.find((x) => String(x.id) === id)).filter(Boolean);
          if (!sel.length) return;
          const filas = [['Fecha','Tipo','Categoría','Descripción','Monto','Deducible']];
          sel.forEach((m) => filas.push([
            m.fecha || '', m.tipo === 'ingreso' ? 'Ingreso' : m.tipo === 'ajuste' ? 'Ajuste' : 'Gasto',
            m.cat || '', m.desc || '', String(Number(m.monto) || 0),
            m.tipo === 'gasto' ? (m.deducible ? 'Sí' : 'No') : ''
          ]));
          const csv = filas.map((f) => f.map((c) => `"${String(c).replace(/"/g,'""')}"`).join(',')).join('\n');
          const a = document.createElement('a');
          a.href = URL.createObjectURL(new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8;' }));
          a.download = `movimientos-${today()}.csv`; a.click(); URL.revokeObjectURL(a.href);
          toast(`${sel.length} movimiento(s) exportado(s) ✓`);
        } },
      { id: 'borrar', texto: '🗑 Borrar', peligro: true, fn: async (ids) => {
          if (!await gcConfirm(`¿Eliminar ${ids.length} movimiento(s)? Esta acción no se puede deshacer.`, { okText: 'Eliminar', danger: true })) return;
          movimientos = movimientos.filter((m) => !ids.includes(String(m.id)));
          await saveMov();
          movSel.salir();
          renderMovimientos(); renderReparto();
          toast(`${ids.length} movimiento(s) eliminado(s)`, 'info');
        } },
    ],
  });

  function renderMovimientos() {
    const tbody = $('tbody-mov');
    tbody.innerHTML = '';
    const sorted = [...movimientos].sort((a, b) => (a.fecha || '').localeCompare(b.fecha || '') || String(a.id).localeCompare(String(b.id)));
    $('empty-mov').style.display = sorted.length === 0 ? 'block' : 'none';

    const grupos = new Map();
    sorted.forEach((m) => {
      const { key, label } = weekInfo(movRefSemana(m));
      if (!grupos.has(key)) grupos.set(key, { label, items: [] });
      grupos.get(key).items.push(m);
    });

    let keys = [...grupos.keys()].sort();
    const totalSemanas = keys.length;
    let semanasOcultas = 0;
    if (!movMostrarTodasSemanas && keys.length > MOV_SEMANAS_LIMITE) {
      semanasOcultas = keys.length - MOV_SEMANAS_LIMITE;
      keys = keys.slice(semanasOcultas); // conserva las más recientes (están ordenadas ascendente)
    }
    const filaVerMas = $('mov-ver-mas-row');
    const btnVerMas = $('mov-ver-mas-btn');
    if (filaVerMas && btnVerMas) {
      if (semanasOcultas > 0) {
        filaVerMas.style.display = 'block';
        btnVerMas.textContent = `Ver ${semanasOcultas} semana${semanasOcultas === 1 ? '' : 's'} anterior${semanasOcultas === 1 ? '' : 'es'} (${totalSemanas} en total)`;
      } else if (movMostrarTodasSemanas && totalSemanas > MOV_SEMANAS_LIMITE) {
        filaVerMas.style.display = 'block';
        btnVerMas.textContent = 'Mostrar solo las semanas recientes';
      } else {
        filaVerMas.style.display = 'none';
      }
    }

    keys.forEach((key) => {
      const g = grupos.get(key);
      const trWeek = document.createElement('tr');
      trWeek.className = 'gc-week-row';
      trWeek.innerHTML = `<td colspan="6">${escapeHtml(g.label)}</td>`;
      tbody.appendChild(trWeek);

      g.items.forEach((m) => {
        const tr = document.createElement('tr');
        tr.className = 'sel-item';
        tr.dataset.selid = String(m.id);
        const tipoLabel = m.tipo === 'ingreso' ? 'Ingreso' : m.tipo === 'ajuste' ? (m.ajusteDir === 'restar' ? '± Ajuste −' : '± Ajuste +') : 'Gasto';
        const tipoColor = m.tipo === 'ingreso' ? 'var(--income)' : m.tipo === 'ajuste' ? '#4A6FA8' : 'var(--expense)';
        tr.innerHTML = `
          <td>${m.fecha || ''}</td>
          <td><span class="gc-tipo-tag ${m.tipo}">${tipoLabel}</span></td>
          <td>${escapeHtml(m.cat || '')}${m.tipo === 'gasto' && m.deducible ? ' <span title="Deducible de impuestos" style="display:inline-block;font-size:9px;font-weight:800;color:var(--gold);background:var(--gold-bg);padding:2px 7px;border-radius:8px;letter-spacing:.3px;vertical-align:middle;">DEDUCIBLE</span>' : ''}</td>
          <td>${escapeHtml(m.desc || '')}${m.tipo === 'ajuste' ? (() => { const nom = nombreDeAjuste(idSocioDeAjuste(m)) || m.ajusteSocioNombre || ''; return nom ? ' <span style="font-size:10px;font-weight:700;color:#4A6FA8;">→ ' + escapeHtml(nom) + '</span>' : ''; })() : ''}</td>
          <td class="gc-num" style="color:${tipoColor}">${fmt(m.monto)}</td>
          <td style="white-space:nowrap;">
            <button class="gc-action-btn gc-dup-mov" data-id="${m.id}" title="Repetir este movimiento" style="padding:3px 9px;font-size:11px;">⧉</button>
            <button class="gc-action-btn gc-edit-mov" data-id="${m.id}" style="padding:3px 9px;font-size:11px;margin-left:2px;">✎</button>
            <button class="gc-del" data-id="${m.id}" style="margin-left:2px;">✕</button>
          </td>
        `;
        tbody.appendChild(tr);
      });
    });

    if (typeof movSel !== 'undefined' && movSel) movSel.refrescarTrasRedibujar();

    tbody.querySelectorAll('.gc-dup-mov').forEach((btn) => {
      btn.addEventListener('click', () => {
        const m = movimientos.find((x) => String(x.id) === btn.dataset.id);
        if (!m) return;
        duplicarMovimiento(m);
      });
    });

    tbody.querySelectorAll('.gc-edit-mov').forEach((btn) => {
      btn.addEventListener('click', () => {
        const m = movimientos.find((x) => String(x.id) === btn.dataset.id);
        if (!m) return;
        editarMovimiento(m);
      });
    });

    tbody.querySelectorAll('.gc-del').forEach((btn) => {
      btn.addEventListener('click', async () => {
        if (!await gcConfirm('¿Eliminar este movimiento? Esta acción no se puede deshacer.', { okText: 'Eliminar', danger: true })) return;
        movimientos = movimientos.filter((m) => String(m.id) !== btn.dataset.id);
        saveMov();
        renderMovimientos();
        renderReparto();
        toast('Movimiento eliminado', 'info');
      });
    });

    renderGraficaSemanal();
    try { renderGastosPorCat(); } catch (e) {}
  }
  // ---- Gastos por categoría en Principal: semana / mes / año, con comparación ----
  let gpModo = 'mes', gpOff = 0;
  try { const g = localStorage.getItem('gh-gp-modo'); if (g === 'sem' || g === 'mes' || g === 'anio') gpModo = g; } catch (e) {}
  function gpPeriodo(off) {
    const hoy = new Date(); hoy.setHours(12, 0, 0, 0);
    if (gpModo === 'sem') {
      const d = new Date(hoy); d.setDate(d.getDate() - 7 * off);
      const info = weekInfo(ghFechaLocal(d));
      return { id: info.key, label: info.label, match: (f) => weekInfo(f).key === info.key };
    }
    if (gpModo === 'mes') {
      const d = new Date(hoy.getFullYear(), hoy.getMonth() - off, 1);
      const k = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
      const nom = d.toLocaleDateString('es-MX', { month: 'long', year: 'numeric' });
      return { id: k, label: nom.charAt(0).toUpperCase() + nom.slice(1), match: (f) => String(f).slice(0, 7) === k };
    }
    const y = String(hoy.getFullYear() - off);
    return { id: y, label: 'Año ' + y, match: (f) => String(f).slice(0, 4) === y };
  }
  function gpGastos(per) {
    const por = new Map(); let total = 0;
    movimientos.forEach((m) => {
      if (m.tipo !== 'gasto' || !per.match(m.fecha || '')) return;
      const monto = Number(m.monto) || 0; if (monto <= 0) return;
      const c = (m.cat || 'Sin categoría').trim() || 'Sin categoría';
      por.set(c, (por.get(c) || 0) + monto); total += monto;
    });
    return { total, filas: [...por.entries()].map(([cat, t]) => ({ cat, total: t })).sort((a, b) => b.total - a.total) };
  }
  function renderGastosPorCat() {
    const card = $('gp-cat-card'); if (!card) return;
    const hayGastos = movimientos.some((m) => m.tipo === 'gasto');
    card.style.display = hayGastos ? 'block' : 'none';
    if (!hayGastos) return;
    card.querySelectorAll('#gp-seg button').forEach((b) => b.classList.toggle('on', b.dataset.gp === gpModo));
    const per = gpPeriodo(gpOff), ant = gpPeriodo(gpOff + 1);
    const { total, filas } = gpGastos(per), antTot = gpGastos(ant).total;
    $('gp-rango').textContent = per.label;
    const nav = card.querySelectorAll('[data-gpnav]'); if (nav[1]) nav[1].disabled = gpOff <= 0;
    let delta = '';
    if (antTot > 0 && total > 0) {
      const pct = Math.round((total - antTot) / antTot * 100);
      delta = `<span class="gp-delta ${pct > 0 ? 'sube' : 'baja'}">${pct > 0 ? '▲' : '▼'} ${Math.abs(pct)}% vs ${gpModo === 'sem' ? 'semana' : gpModo === 'mes' ? 'mes' : 'año'} anterior</span>`;
    } else if (antTot > 0 && total === 0) delta = `<span class="gp-delta baja">Antes: ${fmt(antTot)}</span>`;
    $('gp-total').innerHTML = `<b>${fmt(total)}</b> gastados ${delta}`;
    if (!filas.length) {
      $('gp-donut').innerHTML = '';
      $('gp-leyenda').innerHTML = '<div style="color:var(--muted);font-size:13px;padding:6px 0;">Sin gastos en este período.</div>';
      return;
    }
    const COL = ['#0E8C6E', '#D0621E', '#3D5BD9', '#946510', '#7A4FB5', '#2F9BC8', '#8A8F9C'];
    const top = filas.slice(0, 6), resto = filas.slice(6).reduce((t, r) => t + r.total, 0);
    const trozos = resto > 0 ? [...top, { cat: 'Otros', total: resto }] : top;
    const R = 62, C = 2 * Math.PI * R; let acu = 0;
    const arcos = trozos.map((t, i) => {
      const fr = t.total / total, dash = fr * C, off = -acu * C; acu += fr;
      return `<circle cx="80" cy="80" r="${R}" fill="none" stroke="${COL[i % COL.length]}" stroke-width="24" stroke-dasharray="${Math.max(0, dash - (trozos.length > 1 ? 2 : 0)).toFixed(1)} ${(C - dash + (trozos.length > 1 ? 2 : 0)).toFixed(1)}" stroke-dashoffset="${off.toFixed(1)}" transform="rotate(-90 80 80)"/>`;
    }).join('');
    $('gp-donut').innerHTML = `<svg viewBox="0 0 160 160" width="160" height="160" role="img" aria-label="Gastos por categoría">${arcos}
      <text x="80" y="76" text-anchor="middle" font-size="10" fill="var(--muted)" font-weight="700">TOTAL</text>
      <text x="80" y="94" text-anchor="middle" font-size="14" fill="var(--ink)" font-weight="800">${escapeHtml(fmt(total).replace('.00', ''))}</text></svg>`;
    $('gp-leyenda').innerHTML = trozos.map((t, i) => `<div class="gc-donut-leg-item">
      <span class="sw" style="background:${COL[i % COL.length]};"></span><span style="min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${escapeHtml(t.cat)}</span>
      <span class="val">${Math.round(t.total / total * 100)}% · ${fmt(t.total)}</span></div>`).join('');
  }
  document.querySelectorAll('#gp-seg button').forEach((b) => b.addEventListener('click', () => {
    gpModo = b.dataset.gp; gpOff = 0;
    try { localStorage.setItem('gh-gp-modo', gpModo); } catch (e) {}
    renderGastosPorCat();
  }));
  document.querySelectorAll('[data-gpnav]').forEach((b) => b.addEventListener('click', () => {
    gpOff = Math.max(0, gpOff - Number(b.dataset.gpnav)); renderGastosPorCat();
  }));
  if ($('mov-ver-mas-btn')) {
    $('mov-ver-mas-btn').addEventListener('click', () => {
      movMostrarTodasSemanas = !movMostrarTodasSemanas;
      renderMovimientos();
    });
  }

  // ---- Resumen con gráfica (semanas o meses) ----
  // Junta lo que hay en la hoja activa con los invoices ya guardados, para
  // que el historial no desaparezca al guardar una semana.
  // (var a propósito: renderGraficaSemanal puede llamarse antes de que se lea esta línea)
  var RES_MESES_LARGO = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
  var RES_MESES = ['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic'];
  var resModo = (function () { try { return localStorage.getItem('gh-res-modo') === 'mes' ? 'mes' : 'sem'; } catch (e) { return 'sem'; } })();
  var resSel = null;   // clave del grupo tocado
  var resPag = 0, resAnio = 0, resNavInfo = { prev: false, next: false, max: 0 };
  function resSemanasTodas() {
    const porSemana = new Map();
    const sumar = (key, label, x) => {
      if (!key) return;
      const a = porSemana.get(key) || { key, label: label || '', ingresos: 0, gastos: 0, neto: 0 };
      a.ingresos += Number(x.ingresos) || 0;
      a.gastos += Number(x.gastosTotales) || 0;
      a.neto += Number(x.neto) || 0;
      if (!a.label && label) a.label = label;
      porSemana.set(key, a);
    };
    (invoicesGuardados || []).forEach((inv) => {
      let key = inv.key;
      if (!key) {
        const f = (inv.gastoItems && inv.gastoItems[0] && inv.gastoItems[0].fecha) || (inv.ingresoItems && inv.ingresoItems[0] && inv.ingresoItems[0].fecha) || (inv.guardadoEn ? String(inv.guardadoEn).slice(0, 10) : '');
        if (f) { try { key = weekInfo(f).key; } catch (e) {} }
      }
      sumar(key, inv.label, inv);
    });
    try { calcularSemanas().forEach((sm) => sumar(sm.key, sm.label, sm)); } catch (e) {}
    return [...porSemana.values()].sort((x, y) => x.key.localeCompare(y.key));
  }
  function resDatos() {
    const semanas = resSemanasTodas();
    const hoy = new Date();
    if (resModo === 'sem') {
      // páginas de 8 semanas; resPag = 0 son las más recientes
      const porPag = 8;
      resNavInfo.max = Math.max(0, Math.ceil(semanas.length / porPag) - 1);
      if (resPag > resNavInfo.max) resPag = resNavInfo.max;
      if (resPag < 0) resPag = 0;
      const fin = semanas.length - resPag * porPag;
      const trozo = semanas.slice(Math.max(0, fin - porPag), Math.max(0, fin));
      resNavInfo.prev = resPag < resNavInfo.max;
      resNavInfo.next = resPag > 0;
      return trozo.map((x) => {
        const [yy, mm, dd] = x.key.split('-').map(Number);
        return { ...x, corto: `${dd} ${RES_MESES[(mm || 1) - 1]}`, titulo: (typeof invRangoCorto === 'function' && invRangoCorto(x.label)) || x.label || x.key };
      });
    }
    // Meses: los 12 meses del año elegido (enero a diciembre)
    const anios = semanas.map((x) => Number(x.key.slice(0, 4))).filter(Boolean);
    const anioHoy = hoy.getFullYear();
    const minA = anios.length ? Math.min(anioHoy, ...anios) : anioHoy;
    const maxA = anios.length ? Math.max(anioHoy, ...anios) : anioHoy;
    if (!resAnio) resAnio = anioHoy;
    if (resAnio < minA) resAnio = minA;
    if (resAnio > maxA) resAnio = maxA;
    resNavInfo.prev = resAnio > minA;
    resNavInfo.next = resAnio < maxA;
    const meses = RES_MESES.map((nom, i) => ({ key: `${resAnio}-${String(i + 1).padStart(2, '0')}`, ingresos: 0, gastos: 0, neto: 0, n: 0, nom }));
    semanas.forEach((x) => {
      if (Number(x.key.slice(0, 4)) !== resAnio) return;
      const a = meses[Number(x.key.slice(5, 7)) - 1];
      if (!a) return;
      a.ingresos += x.ingresos; a.gastos += x.gastos; a.neto += x.neto; a.n += 1;
    });
    const hoyK = `${anioHoy}-${String(hoy.getMonth() + 1).padStart(2, '0')}`;
    return meses.map((x) => ({ ...x, futuro: x.key > hoyK && !x.n, corto: x.nom.charAt(0).toUpperCase() + x.nom.slice(1, 3),
      titulo: `${RES_MESES_LARGO[Number(x.key.slice(5, 7)) - 1]} ${resAnio}` + (x.n ? ` · ${x.n} semana${x.n === 1 ? '' : 's'}` : ' · sin movimientos') }));
  }
  // ---- Récords: mejor semana, mejor mes, factura más grande, racha ----
  var REC_TROFEO = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8 21h8M12 17v4M7 4h10v5a5 5 0 0 1-10 0z"/><path d="M17 5h3v2a3 3 0 0 1-3 3M7 5H4v2a3 3 0 0 0 3 3"/></svg>';
  var recDocs = null;
  async function ghRenderRecords() {
    const card = $('gh-records'), grid = $('gh-rec-grid');
    if (!card || !grid) return;
    let docs = (typeof invDocs !== 'undefined' && invDocs && invDocs.length) ? invDocs : recDocs;
    if (!docs) {
      docs = [];
      try {
        const r = await window.storage.get('gh-invoices');
        const v = JSON.parse(r.value);
        if (Array.isArray(v)) { docs = v; recDocs = v; }
      } catch (e) {}
    }
    const semanas = resSemanasTodas().filter((x) => x.ingresos > 0 || x.gastos > 0);
    const tiles = [];
    const hoyIso = today();
    let semHoy = ''; try { semHoy = weekInfo(hoyIso).key; } catch (e) {}
    const mesHoy = hoyIso.slice(0, 7);
    const [ay, am] = [Number(hoyIso.slice(0, 4)), Number(hoyIso.slice(5, 7))];
    // semana pasada también cuenta como "nuevo" (es la que se acaba de cerrar)
    let semPas = ''; try { const d = new Date(hoyIso + 'T00:00:00'); d.setDate(d.getDate() - 7); semPas = weekInfo(ghFechaLocal(d)).key; } catch (e) {}
    if (semanas.length) {
      const mejor = semanas.reduce((m, x) => (x.ingresos > m.ingresos ? x : m), semanas[0]);
      if (mejor.ingresos > 0) {
        const [y, mm, dd] = mejor.key.split('-').map(Number);
        tiles.push({ lbl: 'Mejor semana', val: fmt(mejor.ingresos), sub: `Semana del ${dd} ${RES_MESES[mm - 1]}${y !== ay ? ' ' + y : ''}`, nuevo: mejor.key === semHoy || mejor.key === semPas });
      }
      const porMes = new Map();
      semanas.forEach((x) => { const k = x.key.slice(0, 7); porMes.set(k, (porMes.get(k) || 0) + x.ingresos); });
      let mk = '', mv = 0; porMes.forEach((v, k) => { if (v > mv) { mv = v; mk = k; } });
      if (mk) tiles.push({ lbl: 'Mejor mes', val: fmt(mv), sub: `${RES_MESES_LARGO[Number(mk.slice(5, 7)) - 1]} ${mk.slice(0, 4)}`, nuevo: mk === mesHoy });
      // racha: semanas seguidas ganando (neto > 0); una semana sin nada la corta
      let cur = 0, mejorRacha = 0, prevKey = '';
      semanas.forEach((x) => {
        const seguida = !!prevKey && Math.round((new Date(x.key + 'T00:00:00') - new Date(prevKey + 'T00:00:00')) / 864e5) === 7;
        cur = x.neto > 0 ? (seguida ? cur + 1 : 1) : 0;
        mejorRacha = Math.max(mejorRacha, cur);
        prevKey = x.key;
      });
      // si la última semana con movimientos ya no es esta ni la pasada, la racha se cortó
      const racha = (prevKey === semHoy || prevKey === semPas) ? cur : 0;
      if (mejorRacha > 1) tiles.push({ lbl: 'Racha ganando', val: `${racha} semana${racha === 1 ? '' : 's'}`, sub: racha >= mejorRacha ? '¡Tu mejor racha!' : `Récord: ${mejorRacha} semanas`, nuevo: racha >= mejorRacha && racha > 1 });
    }
    const conTotal = (docs || []).filter((d) => Number(d.total) > 0);
    if (conTotal.length) {
      const f = conTotal.reduce((m, d) => (Number(d.total) > Number(m.total) ? d : m), conTotal[0]);
      const fe = /^\d{4}-\d{2}-\d{2}$/.test(f.fecha || '') ? `${Number(f.fecha.slice(8, 10))} ${RES_MESES[Number(f.fecha.slice(5, 7)) - 1]} ${f.fecha.slice(0, 4)}` : '';
      tiles.push({ lbl: 'Factura más grande', val: fmt(Number(f.total)), sub: [f.numero ? '#' + f.numero : '', f.cliente || '', fe].filter(Boolean).join(' · '), nuevo: (f.fecha || '').slice(0, 7) === mesHoy });
    }
    card.style.display = tiles.length ? '' : 'none';
    const sub = $('gh-rec-sub'); if (sub) sub.textContent = semanas.length ? `${semanas.length} semana${semanas.length === 1 ? '' : 's'} registradas` : '';
    grid.innerHTML = tiles.map((t) => `<div class="gh-rec">
      <div class="gh-rec-lbl">${REC_TROFEO}${escapeHtml(t.lbl)}</div>
      <div class="gh-rec-val">${escapeHtml(t.val)}${t.nuevo ? '<span class="gh-rec-nuevo">NUEVO</span>' : ''}</div>
      <div class="gh-rec-sub">${escapeHtml(t.sub)}</div></div>`).join('');
  }
  function renderGraficaSemanal() {
    if (!RES_MESES) return;   // todavía no se inicializa (se vuelve a llamar después)
    ghRenderRecords();
    const cont = $('gc-chart-semanal');
    const wrap = $('gc-chart-semanal-cont');
    if (!cont || !wrap) return;
    wrap.style.display = 'block';
    wrap.querySelectorAll('.gh-res-seg button').forEach((b) => b.classList.toggle('on', b.dataset.res === resModo));
    let datos = resDatos();
    const navB = wrap.querySelectorAll('.gh-res-nav button');
    if (navB[0]) navB[0].disabled = !resNavInfo.prev;
    if (navB[1]) navB[1].disabled = !resNavInfo.next;
    const nav = wrap.querySelector('.gh-res-nav');
    if (resModo === 'mes' && !datos.some((x) => x.n)) {
      // el año no tiene nada: si ningún año tiene, se muestra el mensaje de vacío
      if (!resNavInfo.prev && !resNavInfo.next) datos = [];
    }
    if (nav) nav.style.display = datos.length ? '' : 'none';
    wrap.classList.toggle('vacio', !datos.length);
    const kpis = $('gh-res-kpis'), det = $('gh-res-det'), rango = $('gh-res-rango');
    if (!datos.length) {
      if (kpis) kpis.innerHTML = '';
      if (det) det.innerHTML = '';
      if (rango) rango.textContent = '';
      cont.innerHTML = '<div class="gh-res-vacio">Cuando registres ingresos y gastos, aquí verás cómo te va cada semana y cada mes.</div>';
      return;
    }
    const tot = datos.reduce((t, x) => ({ i: t.i + x.ingresos, g: t.g + x.gastos, n: t.n + x.neto }), { i: 0, g: 0, n: 0 });
    if (rango) {
      if (resModo === 'mes') rango.textContent = `Año ${resAnio}`;
      else {
        const pr = datos[0].key.split('-').map(Number), ul = datos[datos.length - 1].key.split('-').map(Number);
        const txt = (d) => `${d[2]} ${RES_MESES[(d[1] || 1) - 1]}${d[0] !== new Date().getFullYear() ? ' ' + d[0] : ''}`;
        rango.textContent = resPag === 0 ? (datos.length === 1 ? '1 semana' : `Últimas ${datos.length} semanas`) : `${txt(pr)} – ${txt(ul)}`;
      }
    }
    if (kpis) kpis.innerHTML = `
      <div class="gh-res-kpi i"><span>Ingresos</span><b>${fmt(tot.i)}</b></div>
      <div class="gh-res-kpi g"><span>Gastos</span><b>${fmt(tot.g)}</b></div>
      <div class="gh-res-kpi"><span>Neto</span><b style="color:${tot.n < 0 ? 'var(--ember)' : 'var(--ink)'}">${fmt(tot.n)}</b></div>`;

    if (!datos.some((x) => x.key === resSel)) {
      if (resModo === 'mes') {
        const hoyK = `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}`;
        const conDatos = datos.filter((x) => x.n);
        const mesHoy = datos.find((x) => x.key === hoyK);
        resSel = mesHoy && mesHoy.n ? hoyK : (conDatos.length ? conDatos[conDatos.length - 1].key : (mesHoy ? hoyK : datos[0].key));
      } else resSel = datos[datos.length - 1].key;
    }
    const W = 340, H = 168, padL = 6, padR = 6, padT = 18, padB = 24;
    const plotW = W - padL - padR, plotH = H - padT - padB;
    const maxVal = Math.max(1, ...datos.map((x) => Math.max(x.ingresos, x.gastos, x.neto)));
    const n = datos.length;
    const bandW = plotW / Math.max(n, 4);
    const x0 = padL + (plotW - bandW * n) / 2;
    const barW = Math.max(6, Math.min(16, bandW * 0.26));
    const y = (v) => padT + plotH - (Math.max(0, v) / maxVal) * plotH;
    const base = padT + plotH;
    let grid = '';
    [0.5, 1].forEach((f) => {
      const gy = (padT + plotH - f * plotH).toFixed(1);
      grid += `<line x1="${padL}" y1="${gy}" x2="${W - padR}" y2="${gy}" stroke="var(--border-soft)" stroke-width="1" stroke-dasharray="3 4"/>`;
    });
    grid += `<line x1="${padL}" y1="${base}" x2="${W - padR}" y2="${base}" stroke="var(--border)" stroke-width="1"/>`;
    grid += `<text x="${W - padR}" y="${padT - 6}" text-anchor="end" font-size="9.5" fill="var(--muted)" font-weight="600">${fmt(maxVal).replace('.00', '')}</text>`;
    let grupos = '', linea = '', puntos = '';
    datos.forEach((x, i) => {
      const cx = x0 + bandW * i + bandW / 2;
      const on = x.key === resSel;
      const yi = y(x.ingresos), yg = y(x.gastos), yn = y(x.neto);
      grupos += `<g class="grp${on ? ' on' : ''}" data-k="${escapeHtml(x.key)}">
        <rect class="hit" x="${(cx - bandW / 2 + 2).toFixed(1)}" y="${padT - 4}" width="${(bandW - 4).toFixed(1)}" height="${(plotH + 4 + 20).toFixed(1)}" rx="8"/>
        <rect x="${(cx - barW - 1.5).toFixed(1)}" y="${yi.toFixed(1)}" width="${barW.toFixed(1)}" height="${Math.max(0, base - yi).toFixed(1)}" rx="3" fill="var(--teal)" opacity="${on ? 1 : .78}"/>
        <rect x="${(cx + 1.5).toFixed(1)}" y="${yg.toFixed(1)}" width="${barW.toFixed(1)}" height="${Math.max(0, base - yg).toFixed(1)}" rx="3" fill="var(--ember)" opacity="${on ? 1 : .78}"/>
        <text x="${cx.toFixed(1)}" y="${H - 7}" text-anchor="middle" font-size="${n > 8 ? 9 : 10}" fill="${on ? 'var(--ink)' : 'var(--muted)'}" font-weight="${on ? 800 : 600}">${escapeHtml(x.corto)}</text>
      </g>`;
      if (x.futuro) return;
      linea += `${linea ? 'L' : 'M'}${cx.toFixed(1)} ${yn.toFixed(1)} `;
      puntos += `<circle cx="${cx.toFixed(1)}" cy="${yn.toFixed(1)}" r="${on ? 4 : 3}" fill="var(--card)" stroke="var(--ink)" stroke-width="2" pointer-events="none"/>`;
    });
    cont.innerHTML = `<svg class="gh-res-svg" viewBox="0 0 ${W} ${H}" role="img" aria-label="Ingresos y gastos por ${resModo === 'sem' ? 'semana' : 'mes'}">
      ${grid}${grupos}
      ${n > 1 ? `<path d="${linea}" fill="none" stroke="var(--ink)" stroke-width="1.6" stroke-linejoin="round" stroke-linecap="round" opacity=".55" pointer-events="none"/>` : ''}
      ${puntos}</svg>`;
    const s0 = datos.find((x) => x.key === resSel);
    if (det && s0) det.innerHTML = `<b>${escapeHtml(s0.titulo)}</b>
      <span class="v">Ingresos <b style="color:var(--teal-dk)">${fmt(s0.ingresos)}</b> · Gastos <b style="color:var(--ember)">${fmt(s0.gastos)}</b> · Neto <b>${fmt(s0.neto)}</b></span>`;
    cont.querySelectorAll('.grp').forEach((g) => g.addEventListener('click', () => { resSel = g.dataset.k; renderGraficaSemanal(); }));
  }
  document.querySelectorAll('#gc-chart-semanal-cont .gh-res-seg button').forEach((b) => {
    b.addEventListener('click', () => {
      resModo = b.dataset.res === 'mes' ? 'mes' : 'sem';
      resSel = null; resPag = 0; resAnio = 0;
      try { localStorage.setItem('gh-res-modo', resModo); } catch (e) {}
      renderGraficaSemanal();
    });
  });

  document.querySelectorAll('#gc-chart-semanal-cont .gh-res-nav button').forEach((b) => {
    b.addEventListener('click', () => {
      const d = Number(b.dataset.nav);   // -1 = más viejo, 1 = más nuevo
      if (resModo === 'mes') resAnio += d; else resPag -= d;
      resSel = null;
      renderGraficaSemanal();
    });
  });

  // ---- Acciones rápidas (botón ＋) ----
  function ghTabVisible(tab) {
    const b = document.querySelector(`.gc-tab[data-tab="${tab}"]`);
    return !!(b && b.style.display !== 'none' && getComputedStyle(b).display !== 'none');
  }
  function ghVisible(sel) {
    const el = document.querySelector(sel);
    return !!(el && el.style.display !== 'none' && getComputedStyle(el).display !== 'none');
  }
  function ghIrA(tab, sub) {
    const b = document.querySelector(`.gc-tab[data-tab="${tab}"]`);
    if (!b) return false;
    if (!b.classList.contains('active')) b.click();
    if (sub) { const sb = document.querySelector(sub); if (sb && !sb.classList.contains('active')) sb.click(); }
    return true;
  }
  function ghBajarA(el, extra) {
    if (!el) return;
    const top = el.getBoundingClientRect().top + window.scrollY - (extra || 80);
    window.scrollTo({ top: Math.max(0, top), behavior: 'smooth' });
  }
  const QA_SVG_FACT = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 2.5h12v19l-3-2-3 2-3-2-3 2z"/><path d="M9 7.5h6M9 11.5h6"/></svg>';
  const QA_SVG_CHECK = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="5" y="3" width="14" height="18" rx="2"/><path d="m9 12 2 2 4-4"/></svg>';
  const QA_SVG_LUPA = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/></svg>';
  const QA_SVG_GUARDAR = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 3h11l3 3v15H5z"/><path d="M8 3v5h8V3M8 21v-7h8v7"/></svg>';
  function ghQaMov(tipo) {
    ghIrA('movimientos', '.mov-subtab[data-msub="movs"]');
    const tb = document.querySelector(`.gc-type-btn[data-type="${tipo}"]:not(.ajuste-dir-btn)`);
    if (tb) tb.click();
    const monto = $('m-monto');
    if (monto) {
      try { monto.focus({ preventScroll: true }); } catch (e) { monto.focus(); }
      ghBajarA(monto.closest('.gc-card'), 76);
    }
  }
  const GH_QA = [
    { id: 'ingreso', txt: 'Nuevo ingreso', ic: '↑', cls: 'i', tab: 'movimientos', ok: () => true, fn: () => ghQaMov('ingreso') },
    { id: 'gasto', txt: 'Nuevo gasto', ic: '↓', cls: 'g', tab: 'movimientos', ok: () => true, fn: () => ghQaMov('gasto') },
    { id: 'ajuste', txt: 'Ajuste a socio', ic: '±', cls: 'a', tab: 'movimientos', ok: () => ghVisible('.gc-type-btn[data-type="ajuste"]'), fn: () => ghQaMov('ajuste') },
    { id: 'factura', txt: 'Nueva factura', ic: QA_SVG_FACT, cls: 'f', tab: 'facturas', ok: () => true,
      fn: () => { ghIrA('facturas', '.inv-subtab[data-sub="nueva"]'); window.scrollTo({ top: 0, behavior: 'smooth' }); } },
    { id: 'invoice', txt: 'Guardar invoice de la semana', ic: QA_SVG_GUARDAR, cls: '', tab: 'movimientos', ok: () => !!$('btn-guardar-invoice-top'),
      fn: () => { ghIrA('movimientos', '.mov-subtab[data-msub="movs"]'); $('btn-guardar-invoice-top').click(); } },
    { id: 'nomina', txt: 'Pagar nómina', ic: '$', cls: 'i', tab: 'nomina', ok: () => true,
      fn: () => { ghIrA('nomina', '.nom-subtab[data-nsub="registro"]'); window.scrollTo({ top: 0, behavior: 'smooth' }); } },
    { id: 'completion', txt: 'Completion sheet', ic: QA_SVG_CHECK, cls: '', tab: 'facturas', ok: () => { const s = document.getElementById('inv-sub-completion'); return !!s && s.style.display !== 'none'; },
      fn: () => { ghIrA('facturas', '.inv-subtab[data-sub="nueva"]'); setTimeout(() => ghBajarA(document.getElementById('inv-sub-completion')), 250); } },
    { id: 'buscar', txt: 'Buscar', ic: QA_SVG_LUPA, cls: '', tab: 'buscar', ok: () => true,
      fn: () => { ghIrA('buscar'); const q = $('b-texto'); if (q) { try { q.focus({ preventScroll: true }); } catch (e) {} } window.scrollTo({ top: 0, behavior: 'smooth' }); } },
  ];
  let ghQaOv = null, ghFab = null;
  function ghQaCerrar() {
    if (!ghQaOv) return;
    ghQaOv.classList.remove('show');
    document.body.classList.remove('gh-qa-abierto');
  }
  function ghQaAbrir() {
    if (!ghQaOv) {
      ghQaOv = document.createElement('div');
      ghQaOv.className = 'gh-qa-ov no-print';
      ghQaOv.innerHTML = '<div class="gh-qa" role="dialog" aria-label="Acciones rápidas"><div class="gh-qa-grip"></div><p class="gh-qa-t">Acciones rápidas</p><div class="gh-qa-grid"></div></div>';
      ghQaOv.addEventListener('click', (e) => { if (e.target === ghQaOv) ghQaCerrar(); });
      document.addEventListener('keydown', (e) => { if (e.key === 'Escape') ghQaCerrar(); });
      document.body.appendChild(ghQaOv);
    }
    const grid = ghQaOv.querySelector('.gh-qa-grid');
    grid.innerHTML = '';
    GH_QA.filter((a) => ghTabVisible(a.tab) && a.ok()).forEach((a) => {
      const b = document.createElement('button');
      b.type = 'button'; b.className = 'gh-qa-btn'; b.dataset.qa = a.id;
      b.innerHTML = `<span class="gh-qa-ic ${a.cls}">${a.ic}</span><span>${a.txt}</span>`;
      b.addEventListener('click', () => { ghQaCerrar(); a.fn(); });
      grid.appendChild(b);
    });
    document.body.classList.add('gh-qa-abierto');
    requestAnimationFrame(() => ghQaOv.classList.add('show'));
  }
  function ghFabIniciar() {
    if (ghFab || window.GH_ROL === 'visor') return;
    ghFab = document.createElement('button');
    ghFab.type = 'button'; ghFab.className = 'gh-fab no-print'; ghFab.id = 'gh-fab';
    ghFab.title = 'Acciones rápidas'; ghFab.setAttribute('aria-label', 'Acciones rápidas');
    ghFab.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>';
    ghFab.addEventListener('click', () => { if (document.body.classList.contains('gh-qa-abierto')) ghQaCerrar(); else ghQaAbrir(); });
    document.body.appendChild(ghFab);
  }
  if (typeof window.GH_ESPERAR_SESION === 'function') {
    window.GH_ESPERAR_SESION().then(ghFabIniciar, ghFabIniciar);
  } else {
    ghFabIniciar();
  }

  // ---- Guardar una semana como invoice (desde Movimientos) ----
  async function guardarSemanaComoInvoice(key) {
    const semanas = calcularSemanas();
    const s = semanas.find((sem) => sem.key === key);
    if (!s) return;
    const ok = await gcConfirm(`¿Guardar el invoice de "${s.label}"?\n\nLos movimientos de esa semana se archivan en Registro y se quitan de la hoja activa.`, { okText: 'Guardar invoice' });
    if (!ok) return;

    const registro = { ...s, id: Date.now(), guardadoEn: new Date().toISOString() };
    // Primero se guarda el invoice; SOLO si se guardó se quitan los
    // movimientos de la hoja (antes, si fallaba, la semana se perdía).
    invoicesGuardados.push(registro);
    try { await window.storage.set(KEY_INVOICES, JSON.stringify(invoicesGuardados)); }
    catch (e) {
      invoicesGuardados = invoicesGuardados.filter((x) => x !== registro);
      toast('No se pudo guardar el invoice, la semana sigue en la hoja: ' + ((e && e.message) || e), 'error', 6000);
      return;
    }
    movimientos = movimientos.filter((m) => weekInfo(movRefSemana(m)).key !== s.key);
    await saveMov();

    renderMovimientos();
    renderReparto();
    toast('Invoice guardado y archivado en Registro ✓', 'success', 3000);
  }

  // ---- Botón "Guardar invoice" de arriba (elige qué semana) ----
  $('btn-guardar-invoice-top').addEventListener('click', () => {
    const semanas = calcularSemanas();
    if (semanas.length === 0) {
      toast('No hay movimientos para guardar', 'info');
      return;
    }
    if (semanas.length === 1) {
      guardarSemanaComoInvoice(semanas[0].key);
      return;
    }
    // Varias semanas: mostrar modal de selección
    mostrarSelectorSemana(semanas);
  });

  function mostrarSelectorSemana(semanas) {
    let overlay = document.getElementById('selector-semana-ov');
    if (overlay) overlay.remove();
    overlay = document.createElement('div');
    overlay.id = 'selector-semana-ov';
    overlay.style.cssText = 'position:fixed;inset:0;background:rgba(22,35,63,.5);z-index:1500;display:flex;align-items:center;justify-content:center;backdrop-filter:blur(3px);padding:20px;';
    const botones = semanas.map((s) =>
      `<button class="sel-sem-btn" data-key="${s.key}" style="display:block;width:100%;text-align:left;padding:12px 16px;margin-bottom:8px;background:#F5F8FC;border:1.5px solid var(--border);border-radius:10px;font-family:'Inter',sans-serif;font-size:13.5px;font-weight:600;color:var(--ink);cursor:pointer;">${s.label} — Neto: ${fmt(s.neto)}</button>`
    ).join('');
    overlay.innerHTML = `
      <div style="background:#fff;border-radius:14px;padding:24px;max-width:460px;width:100%;box-shadow:0 24px 80px rgba(22,35,63,.22);">
        <p style="font-family:'Zilla Slab',serif;font-size:17px;font-weight:600;color:var(--ink);margin-bottom:6px;">¿Qué semana quieres guardar?</p>
        <p style="font-size:12.5px;color:var(--muted);margin-bottom:16px;">Elige la semana que se archivará como invoice.</p>
        ${botones}
        <button id="sel-sem-cancelar" style="width:100%;padding:10px;margin-top:6px;background:none;border:1.5px solid var(--border);border-radius:10px;font-family:'Inter',sans-serif;font-size:13px;font-weight:600;color:var(--muted);cursor:pointer;">Cancelar</button>
      </div>`;
    document.body.appendChild(overlay);
    overlay.querySelectorAll('.sel-sem-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        overlay.remove();
        guardarSemanaComoInvoice(btn.dataset.key);
      });
    });
    overlay.querySelector('#sel-sem-cancelar').addEventListener('click', () => overlay.remove());
    overlay.addEventListener('click', (e) => { if (e.target.id === 'selector-semana-ov') overlay.remove(); });
  }

  // ---- Editar un movimiento existente ----
  function editarMovimiento(m) {
    movEditandoId = m.id;
    tipoActual = m.tipo;
    document.querySelectorAll('.gc-type-toggle > .gc-type-btn').forEach((b) => {
      b.classList.toggle('active', b.dataset.type === m.tipo);
    });
    // Mostrar/ocultar campos según tipo
    const esAjuste = m.tipo === 'ajuste';
    const esIngreso = m.tipo === 'ingreso';
    const hayParaAjuste = cfgSocios && cfgSocios.length > 0;
    $('ajuste-direccion-row').style.display = (esAjuste && hayParaAjuste) ? 'block' : 'none';
    $('cat-field-wrap').style.display = esAjuste ? 'none' : 'block';
    $('ingreso-semana-row').style.display = esIngreso ? 'block' : 'none';
    $('gasto-deducible-row').style.display = m.tipo === 'gasto' ? 'block' : 'none';
    $('m-deducible').checked = !!m.deducible;
    if (esAjuste) {
      ajusteDir = m.ajusteDir || 'sumar';
      ajusteSocioSel = idSocioDeAjuste(m) || '';
      document.querySelectorAll('.ajuste-dir-btn').forEach((b) => {
        b.classList.toggle('active', b.dataset.dir === ajusteDir);
      });
      actualizarSociosAjusteSelect();
    }
    renderCatSelect();
    $('m-fecha').value = m.fecha || today();
    if (esIngreso) {
      // Calcular a cuántas semanas de diferencia está la fecha guardada, para que
      // el selector de semana (‹ ›) quede sincronizado con lo que se está editando.
      const mondayEntrada = mondayOf(movRefSemana(m));
      const mondayHoy = mondayOf(today());
      ingresoSemanaOffset = Math.round((mondayEntrada - mondayHoy) / (7 * 24 * 60 * 60 * 1000));
      const friday = new Date(mondayEntrada);
      friday.setDate(mondayEntrada.getDate() + 4);
      $('ingreso-semana-label').textContent = labelSemanaLunesAViernes(mondayEntrada, friday);
      ingresoSemanaKey = ghFechaLocal(mondayEntrada);
    }
    if (!esAjuste) $('m-cat').value = m.cat || '';
    $('m-monto').value = m.monto != null ? String(m.monto) : '';
    $('m-desc').value = m.desc || '';
    $('btn-guardar-mov').textContent = 'Actualizar movimiento';
    document.querySelector('.gc-tab[data-tab="movimientos"]').click();
    window.scrollTo({ top: 0, behavior: 'smooth' });
    $('m-monto').focus();
    toast('Editando movimiento — cambia los datos y guarda', 'info', 3000);
  }

  // ---- Repetir movimiento (duplicar con la fecha de hoy, para gastos/ingresos recurrentes) ----
  function duplicarMovimiento(m) {
    movEditandoId = null; // aunque se parezca a editar, al Guardar crea uno NUEVO
    tipoActual = m.tipo;
    document.querySelectorAll('.gc-type-toggle > .gc-type-btn').forEach((b) => {
      b.classList.toggle('active', b.dataset.type === m.tipo);
    });
    const esAjuste = m.tipo === 'ajuste';
    const esIngreso = m.tipo === 'ingreso';
    const hayParaAjuste = cfgSocios && cfgSocios.length > 0;
    $('ajuste-direccion-row').style.display = (esAjuste && hayParaAjuste) ? 'block' : 'none';
    $('cat-field-wrap').style.display = esAjuste ? 'none' : 'block';
    $('ingreso-semana-row').style.display = esIngreso ? 'block' : 'none';
    $('gasto-deducible-row').style.display = m.tipo === 'gasto' ? 'block' : 'none';
    $('m-deducible').checked = !!m.deducible;
    if (esAjuste) {
      ajusteDir = m.ajusteDir || 'sumar';
      ajusteSocioSel = idSocioDeAjuste(m) || '';
      document.querySelectorAll('.ajuste-dir-btn').forEach((b) => {
        b.classList.toggle('active', b.dataset.dir === ajusteDir);
      });
      actualizarSociosAjusteSelect();
    }
    renderCatSelect();
    if (esIngreso) { ingresoSemanaOffset = 0; actualizarSemanaIngreso(); } // semana actual, no la del original
    $('m-fecha').value = today();
    if (!esAjuste) $('m-cat').value = m.cat || '';
    $('m-monto').value = m.monto != null ? String(m.monto) : '';
    $('m-desc').value = m.desc || '';
    $('btn-guardar-mov').textContent = 'Guardar movimiento';
    document.querySelector('.gc-tab[data-tab="movimientos"]').click();
    window.scrollTo({ top: 0, behavior: 'smooth' });
    $('m-monto').focus();
    toast('Movimiento repetido con la fecha de hoy — revisa el monto y guarda', 'info', 3200);
  }

  // ---- Reparto semanal ----
  // Devuelve el id del socio al que va un ajuste (por id guardado o, en
  // ajustes anteriores, por su posición en la lista de socios).
  function idSocioDeAjuste(m) {
    const lista = cfgSocios || [];
    if (m.ajusteSocioId === 'empresa') return 'empresa';
    if (m.ajusteSocioId && lista.some((x) => x.id === m.ajusteSocioId)) return m.ajusteSocioId;
    // Si el socio se renombró/borró, buscarlo por nombre
    if (m.ajusteSocioNombre) { const porNombre = opcionesAjuste().find((x) => nombreDeAjuste(x.id).toLowerCase() === m.ajusteSocioNombre.toLowerCase()); if (porNombre) return porNombre.id; }
    if (m.ajusteSocioIdx != null && lista[m.ajusteSocioIdx]) return lista[m.ajusteSocioIdx].id;
    // Ajustes viejos sin socio: iban al primer socio después de la compañía
    const ops = opcionesAjuste();
    return ops[1] ? ops[1].id : null;
  }

  function calcularSemanas() {
    const grupos = new Map();
    movimientos.forEach((m) => {
      const { key, label } = weekInfo(movRefSemana(m));
      if (!grupos.has(key)) {
        grupos.set(key, { label, ingresos: 0, gastos: 0, gastoItems: [], ajustesPorSocio: {}, ajusteItems: [], ingresoItems: [] });
      }
      const g = grupos.get(key);
      if (m.tipo === 'ingreso') { g.ingresos += Number(m.monto) || 0; g.ingresoItems.push(m); }
      else if (m.tipo === 'ajuste') {
        const signo = m.ajusteDir === 'restar' ? -1 : 1;
        const monto = signo * (Number(m.monto) || 0);
        // Se guarda por id del socio (estable aunque cambie el orden de la lista).
        // Ajustes viejos sin socio elegido van al primer socio después de la empresa.
        const socioKey = idSocioDeAjuste(m) || '__legacy__';
        g.ajustesPorSocio[socioKey] = (g.ajustesPorSocio[socioKey] || 0) + monto;
        g.ajusteItems.push(m);
      }
      else { g.gastos += Number(m.monto) || 0; g.gastoItems.push(m); }
    });

    const resultado = [];
    [...grupos.keys()].sort().forEach((key) => {
      const g = grupos.get(key);
      // Todo se calcula en centavos exactos: así el reparto siempre suma
      // igual al neto (antes podía salir 1 centavo de más o de menos).
      const c2 = (n) => Math.round((Number(n) || 0) * 100) / 100;
      g.ingresos = c2(g.ingresos); g.gastos = c2(g.gastos);
      const taxas = c2(g.ingresos * TASA_TAXAS);
      const gastosTotales = c2(g.gastos + taxas);
      const neto = c2(g.ingresos - gastosTotales);

      // Reparto en partes iguales entre TODOS los socios de la lista (1, 2 o
      // más). Si solo hay uno, "su parte" es el 100% — sale solo, sin caso
      // especial. Los ajustes manuales van al socio seleccionado; el bono de
      // cada quien es su propio porcentaje sobre (su parte + su ajuste).
      // La EMPRESA siempre entra en el reparto y va primero. Los socios son
      // opcionales: sin ninguno, la empresa se lleva todo; con socios, la
      // semana se divide en partes iguales entre la empresa y ellos.
      const nombreEmpresa = (cfgFacturaNombre || 'Empresa').trim();
      const claveEmpresa = nombreEmpresa.toLowerCase();
      const lista = [
        { id: 'empresa', nombre: nombreEmpresa, bonoPct: 0, esEmpresa: true },
        // Si la empresa quedó también dentro de la lista de socios (de una
        // versión anterior), no debe contarse dos veces ni salir repetida
        // en el reparto del invoice.
        ...((cfgSocios || []).filter((x) => x && x.nombre && x.nombre.trim().toLowerCase() !== claveEmpresa))
      ];
      // Parte igual para cada uno; los centavos que sobran al dividir van a
      // la empresa (la primera), para que las partes sumen exacto el neto.
      const netoCent = Math.round(neto * 100);
      const parteCent = Math.trunc(netoCent / lista.length);
      const sobraCent = netoCent - parteCent * lista.length;
      const base = parteCent / 100;
      const pagos = lista.map((s, i) => {
        const suBase = i === 0 ? (parteCent + sobraCent) / 100 : base;
        const ajusteSocio = c2((g.ajustesPorSocio[s.id] || 0) + (i === 1 ? (g.ajustesPorSocio['__legacy__'] || 0) : 0));
        const baseConAjuste = c2(suBase + ajusteSocio);
        const pct = Number(s.bonoPct) || 0;
        const bono = baseConAjuste > 0 ? c2(baseConAjuste * (pct / 100)) : 0;
        return { id: s.id, nombre: s.nombre, bonoPct: pct, base: suBase, ajuste: ajusteSocio, bono, total: c2(baseConAjuste + bono), esEmpresa: !!s.esEmpresa };
      });
      const bonoCra = c2(pagos.reduce((sum, p) => sum + p.bono, 0)); // bono total que sale de las taxas
      const taxGuzman = c2(taxas - bonoCra);

      // Alias de compatibilidad con el resto de la app (1° y 2° socio):
      const mitad = base;
      const pagoCra = pagos[0] ? pagos[0].total : 0;
      const pagoGuzman = pagos[1] ? pagos[1].total : 0;
      // Desglose del bono del segundo socio en "de su mitad" vs "de su ajuste" (solo para mostrarlo detallado en la factura/recibo)
      const pct1 = pagos[1] ? pagos[1].bonoPct : 0;
      const ajusteGuzman = pagos[1] ? pagos[1].ajuste : 0;
      const bonoTotal1 = pagos[1] ? pagos[1].bono : 0;
      const bonoBase = base > 0 ? c2(base * (pct1 / 100)) : 0;
      const bonoAjuste = c2(bonoTotal1 - bonoBase);   // así las dos partes suman el bono exacto

      const gastoItems = [...g.gastoItems].sort((a, b) => (a.fecha || '').localeCompare(b.fecha || ''));
      resultado.push({ key, label: g.label, ingresos: g.ingresos, gastos: g.gastos, gastoItems, ajusteGuzman: ajusteGuzman, ajusteItems: g.ajusteItems, ingresoItems: g.ingresoItems, taxas, gastosTotales, neto, mitad, bonoBase, bonoAjuste, bonoCra, pagoCra, pagoGuzman, taxGuzman, pagos });
    });
    return resultado;
  }

  function renderReparto() {
    actualizarStats();
    ghActualizarHero();
    // Las tarjetas de semanas activas ya no se muestran en Registro.
    // El botón "Guardar invoice" ahora está en Movimientos (por semana).
    renderInvoicesGuardados();
    renderResumenTaxas();
    if (typeof renderTotalPorSocio === 'function') renderTotalPorSocio();
  }

  function renderInvoicesGuardados() {
    const tbody = $('tbody-invoices-guardados');
    tbody.innerHTML = '';
    // Ordenados por la fecha de la semana (la más reciente arriba); si dos son
    // de la misma semana, el último guardado primero.
    const fechaInv = (inv) => inv.key || (Array.isArray(inv.ingresoItems) && inv.ingresoItems[0] && inv.ingresoItems[0].fecha) || (inv.guardadoEn || '').slice(0, 10);
    const sorted = [...invoicesGuardados].sort((a, b) => fechaInv(b).localeCompare(fechaInv(a)) || (b.guardadoEn || '').localeCompare(a.guardadoEn || ''));
    const hayDatos = sorted.length > 0;
    $('empty-invoices-guardados').style.display = hayDatos ? 'none' : 'block';
    $('tabla-invoices-guardados').style.display = hayDatos ? 'block' : 'none';

    // Encabezado: una columna de pago por cada socio actual (mínimo 1)
    const listaSocios = cfgSocios && cfgSocios.length ? cfgSocios : [{ nombre: cfgSocioBonus }];
    const filaEnc = $('tabla-invoices-thead-row');
    if (filaEnc) {
      filaEnc.innerHTML = `<th data-i18n="h_semana">Semana</th><th data-i18n="h_guardado">Guardado</th><th class="num" data-i18n="h_gastos">Gastos</th>${listaSocios.map((s) => `<th class="num">${escapeHtml(s.nombre)}</th>`).join('')}<th></th>`;
    }

    const fmtOpc = (v) => (v == null || v === '' || isNaN(Number(v))) ? '—' : fmt(v);
    sorted.forEach((inv, idxInv) => {
      const idInv = idxInv; // posición en la lista: siempre existe, aunque el invoice viejo no traiga id/key
      const dGuard = inv.guardadoEn ? new Date(inv.guardadoEn) : null;
      const fechaGuardado = dGuard && !isNaN(dGuard) ? dGuard.toLocaleDateString('es-MX', { day: 'numeric', month: 'short', year: 'numeric' }) : '';
      const titulo = invRangoCorto(inv.label) || inv.label || 'Invoice';
      // Mismo reparto que se ve en "Ver" (nombres tal como se guardaron)
      let pagos = [];
      try { pagos = invPagosNormalizados(inv); } catch (e) { pagos = []; }
      const filasPago = pagos.map((p, k) => `
          <div class="ig-pago"><span class="ig-dot c${k % 4}"></span><span class="ig-pago-n">${escapeHtml(p.nombre || '—')}</span><span class="ig-pago-v">${fmtOpc(p.total)}</span></div>`).join('');
      const tr = document.createElement('tr');
      tr.className = 'sel-item';
      tr.dataset.selid = String(idxInv);
      tr.innerHTML = `
        <td colspan="9" class="ig-td">
          <div class="ig">
            <div class="ig-top">
              <div class="ig-tit" title="${escapeHtml(inv.label || '')}">${escapeHtml(titulo)}</div>
              ${fechaGuardado ? `<span class="ig-fecha">Guardado ${escapeHtml(fechaGuardado)}</span>` : ''}
            </div>
            <div class="ig-kpis">
              <div class="ig-kpi"><span>Ingresos</span><b class="ing">${fmtOpc(inv.ingresos)}</b></div>
              <div class="ig-kpi"><span>Gastos</span><b class="gas">${fmtOpc(inv.gastosTotales)}</b></div>
              <div class="ig-kpi"><span>Neto</span><b>${fmtOpc(inv.neto)}</b></div>
            </div>
            ${filasPago ? `<div class="ig-pagos"><div class="ig-pagos-t">Reparto</div>${filasPago}</div>` : ''}
            <div class="ig-acc">
              <button class="gc-action-btn gc-ver-invoice-btn" data-i18n="ver" data-id="${idInv}">Ver</button>
              <button class="gc-action-btn gc-editar-invoice-btn" data-i18n="editar_2" data-id="${idInv}">✎ Editar</button>
              <button class="gc-action-btn gc-reabrir-invoice-btn" data-id="${idInv}" title="Devuelve los movimientos a la hoja de Movimientos">↩ Reabrir</button>
              <button class="gc-del" data-id="${idInv}" title="Eliminar">✕</button>
            </div>
          </div>
        </td>`;
      tbody.appendChild(tr);
    });

    tbody.querySelectorAll('.gc-ver-invoice-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        const inv = sorted[Number(btn.dataset.id)];
        if (!inv) { toast('No se pudo abrir este invoice', 'error'); return; }
        try {
          mostrarVistaImpresion(inv);
        } catch (e) {
          // Nunca dejar el botón "mudo": si algo truena al armar la vista, avisar.
          toast('No se pudo mostrar el invoice: ' + (e && e.message ? e.message : e), 'error', 5000);
        }
      });
    });

    tbody.querySelectorAll('.gc-editar-invoice-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        const inv = sorted[Number(btn.dataset.id)];
        if (!inv) { toast('No se pudo abrir este invoice', 'error'); return; }
        abrirEditorInvoice(inv);
      });
    });

    tbody.querySelectorAll('.gc-reabrir-invoice-btn').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const inv = sorted[Number(btn.dataset.id)];
        if (!inv) return;
        const ok = await gcConfirm(`¿Reabrir el invoice de "${inv.label}"?\n\nLos movimientos volverán a la hoja de Movimientos para que los edites (agregar lo que faltó cobrar, corregir montos, etc). El invoice guardado se quita de la lista y luego lo vuelves a guardar cuando termines.`, { okText: 'Reabrir' });
        if (!ok) return;

        // Reconstruir los movimientos de ese invoice y devolverlos a la hoja activa
        const movsReabiertos = [];
        // Gastos (guardados en gastoItems)
        const nuevoId = () => Date.now() + Math.random();
        (inv.gastoItems || []).forEach((g) => {
          movsReabiertos.push({ ...g, id: nuevoId(), tipo: 'gasto' });
        });
        // Ajustes: vuelven tal cual (socio, sumar/restar, monto, descripción).
        if (Array.isArray(inv.ajusteItems) && inv.ajusteItems.length) {
          inv.ajusteItems.forEach((a) => movsReabiertos.push({ ...a, id: nuevoId(), tipo: 'ajuste' }));
        } else if (inv.ajusteGuzman) {
          // Invoice viejo que solo guardó el total del ajuste: se rehace como un ajuste al mismo socio.
          const socio = (cfgSocios || [])[0];
          const fechaAj = inv.gastoItems && inv.gastoItems[0] ? inv.gastoItems[0].fecha : today();
          movsReabiertos.push({ id: nuevoId(), fecha: fechaAj, tipo: 'ajuste', cat: 'Ajuste', monto: Math.abs(inv.ajusteGuzman),
            ajusteDir: inv.ajusteGuzman < 0 ? 'restar' : 'sumar', ajusteSocioId: socio ? socio.id : null,
            desc: 'Ajuste reabierto de ' + (inv.label || '') });
        }
        // Ingresos: si el invoice guardó cada línea, vuelven igual; si no, como una sola línea con el total.
        if (Array.isArray(inv.ingresoItems) && inv.ingresoItems.length) {
          inv.ingresoItems.forEach((g) => movsReabiertos.push({ ...g, id: nuevoId(), tipo: 'ingreso' }));
        } else if (inv.ingresos > 0) {
          const fechaIng = inv.gastoItems && inv.gastoItems[0] ? inv.gastoItems[0].fecha : today();
          movsReabiertos.push({ id: Date.now() + Math.random(), fecha: fechaIng, tipo: 'ingreso', cat: (catIngresos[0] || 'Ingreso'), monto: inv.ingresos, desc: 'Ingreso reabierto de ' + (inv.label || '') });
        }

        movimientos.push(...movsReabiertos);
        invoicesGuardados = invoicesGuardados.filter((x) => x !== inv);
        saveMov();
        saveInvoices();
        renderMovimientos();
        renderReparto();
        renderInvoicesGuardados();
        document.querySelector('.gc-tab[data-tab="movimientos"]').click();
        window.scrollTo({ top: 0, behavior: 'smooth' });
        toast('Invoice reabierto — edita los movimientos y vuelve a guardarlo', 'info', 4000);
      });
    });

    tbody.querySelectorAll('.gc-del').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const inv = sorted[Number(btn.dataset.id)];
        if (!inv) { toast('No se pudo identificar este invoice', 'error'); return; }
        if (!await gcConfirm('¿Eliminar este invoice guardado? Esta acción no se puede deshacer.', { okText: 'Eliminar', danger: true })) return;
        // Quita exactamente ese invoice (por referencia), no por id — así
        // funciona igual con invoices viejos que no traen id ni key.
        invoicesGuardados = invoicesGuardados.filter((x) => x !== inv);
        saveInvoices();
        renderInvoicesGuardados();
        renderReparto();
        toast('Invoice eliminado', 'info');
      });
    });
    if (regSel) regSel.refrescarTrasRedibujar();
    regSelOrden = sorted;
    try { renderGraficaSemanal(); } catch (e) {}   // para que las acciones sepan a qué invoice corresponde cada marca
  }

  // ---- Modo selección en Registro → Invoices guardados ----
  let regSelOrden = [];
  const regSel = ghCrearSeleccion({
    host: 'reg-sel-host',
    contenedor: 'tbody-invoices-guardados',
    nombre: 'invoice', plural: 'invoices',
    acciones: [
      { id: 'compartir', texto: '↗ Compartir', fn: async (ids) => {
          const docs = ids.map((i) => regSelOrden[Number(i)]).filter(Boolean);
          if (!docs.length) return;
          const html = ghDocumentoCombinado(docs.map((d) => construirHTMLInvoice(d)), 'Invoices');
          await ghCompartirHTML(html, `invoices-${docs.length}.html`, `${docs.length} invoice(s)`);
        } },
      { id: 'imprimir', texto: '🖨 Imprimir', fn: (ids) => {
          const docs = ids.map((i) => regSelOrden[Number(i)]).filter(Boolean);
          if (!docs.length) return;
          ghImprimirEnVentana(docs.map((d) => `<div class="gh-doc">${construirHTMLInvoice(d)}</div>`).join(''), `Invoices (${docs.length})`);
        } },
      { id: 'borrar', texto: '🗑 Borrar', peligro: true, fn: async (ids) => {
          const docs = ids.map((i) => regSelOrden[Number(i)]).filter(Boolean);
          if (!docs.length) return;
          if (!await gcConfirm(`¿Eliminar ${docs.length} invoice(s) guardado(s)? Esta acción no se puede deshacer.`, { okText: 'Eliminar', danger: true })) return;
          invoicesGuardados = invoicesGuardados.filter((x) => !docs.includes(x));
          saveInvoices();
          regSel.salir();
          renderInvoicesGuardados();
          renderReparto();
          toast(`${docs.length} invoice(s) eliminado(s)`, 'info');
        } },
    ],
  });

  // ---- Total pagado por socio (suma de todos los invoices del año filtrado) ----
  function renderTotalPorSocio() {
    const cont = $('total-socios-lista');
    if (!cont) return;
    const filtroAnio = ($('taxas-anio-filtro') || {}).value || 'todos';
    const invs = invoicesGuardados.filter((inv) => filtroAnio === 'todos' || (inv.guardadoEn || '').startsWith(filtroAnio));
    const totales = new Map(); // nombre del socio -> total acumulado
    invs.forEach((inv) => {
      const pagos = Array.isArray(inv.pagos) && inv.pagos.length
        ? inv.pagos
        : [{ nombre: cfgSocioBonus, total: inv.pagoCra || 0 }, { nombre: cfgSocioMitad, total: inv.pagoGuzman || 0 }];
      pagos.forEach((p) => {
        if (!p.nombre) return;
        totales.set(p.nombre, (totales.get(p.nombre) || 0) + (Number(p.total) || 0));
      });
    });
    const lista = [...totales.entries()].sort((a, b) => b[1] - a[1]);
    $('empty-total-socios').style.display = lista.length === 0 ? 'block' : 'none';
    cont.style.display = lista.length === 0 ? 'none' : 'grid';
    cont.innerHTML = lista.map(([nombre, total], i) => `
      <div style="background:#F5F7FC;border-radius:12px;padding:14px 16px;border-left:3px solid ${DONUT_COLORES[i % DONUT_COLORES.length]};">
        <div style="font-size:11px;color:var(--muted);text-transform:uppercase;letter-spacing:.4px;font-weight:700;margin-bottom:4px;">${escapeHtml(nombre)}</div>
        <div style="font-size:19px;font-weight:700;color:var(--ink);font-family:'IBM Plex Mono',monospace;">${fmt(total)}</div>
      </div>`).join('');
  }

  // ---- Resumen anual de Taxas ----
  function renderResumenTaxas() {
    const filtroAnio = ($('taxas-anio-filtro') || {}).value || 'todos';
    const tbody = $('tbody-taxas-resumen');
    const tfoot = $('tfoot-taxas-resumen');
    tbody.innerHTML = '';
    tfoot.innerHTML = '';

    // Filtrar por año
    const invs = invoicesGuardados.filter((inv) => {
      if (filtroAnio === 'todos') return true;
      const fecha = inv.guardadoEn || '';
      return fecha.startsWith(filtroAnio);
    });

    $('empty-taxas-resumen').style.display = invs.length === 0 ? 'block' : 'none';
    $('tabla-taxas-resumen').style.display = invs.length === 0 ? 'none' : 'table';

    let totIng = 0, totGas = 0, totNeto = 0, totTaxas = 0, totBono = 0, totRest = 0;

    // Ordenar por fecha de guardado
    const sorted = [...invs].sort((a, b) => (a.guardadoEn || '').localeCompare(b.guardadoEn || ''));

    sorted.forEach((inv, i) => {
      const neto = inv.neto ?? 0;
      const bono = inv.bonoCra ?? 0;
      const rest = inv.taxGuzman ?? 0;
      const taxas = inv.taxas ?? 0;
      const ing = inv.ingresos ?? 0;
      const gas = inv.gastos ?? 0;

      totIng += ing;
      totGas += gas;
      totNeto += neto;
      totTaxas += taxas;
      totBono += bono;
      totRest += rest;

      const netoNeg = neto < 0;
      const tr = document.createElement('tr');
      if (netoNeg) tr.style.background = '#FFF5F5';
      tr.innerHTML = `
        <td style="font-size:12px;">${escapeHtml(inv.label || inv.key || '')}${netoNeg ? ' <span style="color:var(--ember);font-size:10px;font-weight:700;">NEGATIVO</span>' : ''}</td>
        <td class="num" style="color:var(--teal);font-family:'IBM Plex Mono',monospace;">${fmt(ing)}</td>
        <td class="num" style="color:var(--ember);font-family:'IBM Plex Mono',monospace;">${fmt(gas)}</td>
        <td class="num" style="color:${netoNeg ? 'var(--ember)' : 'var(--ink)'};font-family:'IBM Plex Mono',monospace;font-weight:600;">${fmt(neto)}</td>
        <td class="num" style="color:var(--gold);font-family:'IBM Plex Mono',monospace;">${fmt(taxas)}</td>
        <td class="num" style="color:var(--muted);font-family:'IBM Plex Mono',monospace;">${bono > 0 ? '− ' + fmt(bono) : '—'}</td>
        <td class="num" style="background:#FBF0D4;color:var(--gold);font-family:'IBM Plex Mono',monospace;font-weight:700;">${fmt(rest)}</td>
      `;
      tbody.appendChild(tr);
    });

    // Totales
    if (invs.length > 0) {
      tfoot.innerHTML = `
        <tr style="background:#F0F4FA;font-weight:700;">
          <td style="padding:10px 12px;font-size:12.5px;">TOTAL (${invs.length} invoices)</td>
          <td class="num" style="padding:10px 12px;color:var(--teal);font-family:'IBM Plex Mono',monospace;">${fmt(totIng)}</td>
          <td class="num" style="padding:10px 12px;color:var(--ember);font-family:'IBM Plex Mono',monospace;">${fmt(totGas)}</td>
          <td class="num" style="padding:10px 12px;font-family:'IBM Plex Mono',monospace;">${fmt(totNeto)}</td>
          <td class="num" style="padding:10px 12px;color:var(--gold);font-family:'IBM Plex Mono',monospace;">${fmt(totTaxas)}</td>
          <td class="num" style="padding:10px 12px;color:var(--muted);font-family:'IBM Plex Mono',monospace;">− ${fmt(totBono)}</td>
          <td class="num" style="padding:10px 12px;background:#FBF0D4;color:var(--gold);font-family:'IBM Plex Mono',monospace;font-size:15px;">${fmt(totRest)}</td>
        </tr>`;
    }

    // Poblar el select de años
    const selectAnio = $('taxas-anio-filtro');
    const aniosActual = selectAnio.value;
    const anios = [...new Set(invoicesGuardados.map((inv) => (inv.guardadoEn || '').slice(0, 4)).filter(Boolean))].sort().reverse();
    selectAnio.innerHTML = '<option value="todos" data-i18n="todos_los_anos">Todos los años</option>' + anios.map((a) => `<option value="${a}">${a}</option>`).join('');
    if (aniosActual && (aniosActual === 'todos' || anios.includes(aniosActual))) selectAnio.value = aniosActual;
  }

