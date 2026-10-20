  // ====================================================================

  // ---- Buscar / Anual ----
  // Construye la lista completa de movimientos: activos + archivados en invoices guardados
  function todosMov() {
    const lista = [...movimientos];

    invoicesGuardados.forEach((inv) => {
      // Movimientos de gastos archivados en este invoice
      if (Array.isArray(inv.gastoItems)) {
        inv.gastoItems.forEach((gi) => {
          // Solo agrega si no existe ya en movimientos activos (evita duplicados)
          if (!movimientos.find((m) => m.id === gi.id)) {
            lista.push({ ...gi, _archivado: true });
          }
        });
      }
      // Ingreso archivado
      const fechaRef = inv.key ? inv.key + '-01' : null;
      const fechaInv = inv.gastoItems?.[0]?.fecha || fechaRef || today();

      if (inv.ingresos && !movimientos.find((m) =>
        m.origen === 'historial-2026' && weekInfo(m.fecha).key === inv.key && m.tipo === 'ingreso')
        && !lista.find((m) => m._invId === inv.id && m.tipo === 'ingreso')) {
        lista.push({ id: 'inv-ing-' + inv.id, fecha: fechaInv, tipo: 'ingreso', cat: 'Ingresos semanales', monto: inv.ingresos, desc: inv.label || '', _invId: inv.id, _archivado: true });
      }
      // Pago a GUZMAN HVAC
      if (inv.pagoCra != null && !lista.find((m) => m._invId === inv.id && m.cat === 'Pago ' + cfgSocioBonus)) {
        lista.push({ id: 'inv-cra-' + inv.id, fecha: fechaInv, tipo: 'gasto', cat: 'Pago ' + cfgSocioBonus, monto: inv.pagoCra, desc: inv.label || '', _invId: inv.id, _archivado: true });
      }
      // Pago a CRA HVAC
      if (inv.pagoGuzman != null && !lista.find((m) => m._invId === inv.id && m.cat === 'Pago ' + cfgSocioMitad)) {
        lista.push({ id: 'inv-guz-' + inv.id, fecha: fechaInv, tipo: 'gasto', cat: 'Pago ' + cfgSocioMitad, monto: inv.pagoGuzman, desc: inv.label || '', _invId: inv.id, _archivado: true });
      }
      // Ajuste a CRA HVAC (desglosado) — solo si hubo ajuste en la semana
      if (inv.ajusteGuzman && !lista.find((m) => m._invId === inv.id && m.cat && m.cat.startsWith('Ajuste'))) {
        const esSuma = inv.ajusteGuzman > 0;
        lista.push({
          id: 'inv-aj-' + inv.id,
          fecha: fechaInv,
          tipo: 'ajuste',
          cat: esSuma ? ('Ajuste + ' + cfgSocioBonus) : ('Ajuste − ' + cfgSocioBonus),
          monto: Math.abs(inv.ajusteGuzman),
          desc: inv.label || '',
          _invId: inv.id, _archivado: true
        });
      }
    });

    return lista;
  }

  function renderAnios() {
    const select = $('b-anio');
    const actual = select.value;
    const todos = todosMov();
    const anios = [...new Set(todos.map((m) => (m.fecha || today()).slice(0, 4)))].sort().reverse();
    select.innerHTML = '<option value="todos" data-i18n="todos_los_anos">Todos los años</option>' + anios.map((a) => `<option value="${a}">${a}</option>`).join('');
    if (actual && (actual === 'todos' || anios.includes(actual))) select.value = actual;
  }

  // Resalta en amarillo la parte que coincide con lo buscado
  function ghResaltar(txt, buscar) {
    if (!buscar || !txt) return escapeHtml(txt || '');
    const t = String(txt);
    const i = t.toLowerCase().indexOf(buscar);
    if (i < 0) return escapeHtml(t);
    return escapeHtml(t.slice(0, i))
      + '<mark style="background:#FBF0D4;color:var(--gold);padding:0 2px;border-radius:3px;">' + escapeHtml(t.slice(i, i + buscar.length)) + '</mark>'
      + escapeHtml(t.slice(i + buscar.length));
  }

  let ghUltimaBusqueda = [];   // lo que se está mostrando ahora, para poder exportarlo

  // Al buscar, sube la vista a los resultados para no tener que bajar a mano.
  // Solo se mueve cuando de verdad hace falta (si los resultados ya se ven,
  // se queda quieto) y no interrumpe mientras se sigue escribiendo.
  let ghScrollTimer = null;
  function ghSubirAResultados() {
    const dest = $('b-resultados');
    if (!dest) return;
    clearTimeout(ghScrollTimer);
    ghScrollTimer = setTimeout(() => {
      const r = dest.getBoundingClientRect();
      const esMovil = window.matchMedia('(max-width: 720px)').matches;
      const margen = esMovil ? 70 : 90;   // deja espacio para el encabezado fijo
      // Si el bloque de resultados no se ve completo en pantalla, súbelo.
      if (r.top > window.innerHeight * 0.55 || r.top < 0) {
        window.scrollTo({ top: window.scrollY + r.top - margen, behavior: 'smooth' });
      }
    }, 420);
  }

  // ---- Búsqueda global: coincidencias fuera de Movimientos ----
  function ghBuscarGlobal(texto) {
    const card = $('b-global-card');
    const cont = $('b-global-lista');
    if (!card || !cont) return;
    if (!texto || texto.length < 2) { card.style.display = 'none'; cont.innerHTML = ''; return; }

    const grupos = [];
    const agrega = (titulo, items, alTocar) => {
      if (items.length) grupos.push({ titulo, items: items.slice(0, 8), total: items.length, alTocar });
    };

    // Facturas guardadas
    agrega('Facturas', (invDocs || []).filter((d) =>
      (d.numero || '').toLowerCase().includes(texto) || (d.cliente || '').toLowerCase().includes(texto) ||
      (d.items || []).some((it) => (it.location || '').toLowerCase().includes(texto) || (it.work || '').toLowerCase().includes(texto))
    ).map((d) => `${d.numero || '(sin número)'} · ${d.cliente || '—'} · ${invFmt(d.total)}`),
      () => { document.querySelector('.gc-tab[data-tab="facturas"]').click(); document.querySelector('.inv-subtab[data-sub="guardadas"]').click(); });


    // Planos

    // Clientes y colonias
    agrega('Clientes', (invClientes || []).filter((c) => (c || '').toLowerCase().includes(texto)),
      () => { document.querySelector('.gc-tab[data-tab="facturas"]').click(); invAbrirCarpeta('clientes'); });
    agrega('Colonias', (invColonias || []).filter((c) => (c || '').toLowerCase().includes(texto)),
      () => { document.querySelector('.gc-tab[data-tab="facturas"]').click(); invAbrirCarpeta('colonias'); });

    // Trabajadores (nómina)
    agrega('Trabajadores', (empleados || []).filter((e) =>
      `${e.nombre || ''} ${e.apellido || ''}`.toLowerCase().includes(texto)
    ).map((e) => `${e.nombre || ''} ${e.apellido || ''}`.trim()),
      () => document.querySelector('.gc-tab[data-tab="nomina"]').click());

    if (!grupos.length) { card.style.display = 'none'; cont.innerHTML = ''; return; }
    card.style.display = 'block';
    cont.innerHTML = '';
    grupos.forEach((g) => {
      const bloque = document.createElement('div');
      bloque.style.cssText = 'padding:11px 0;border-top:1px solid var(--border-soft);';
      bloque.innerHTML = `
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;">
          <span style="font-size:10.5px;font-weight:700;text-transform:uppercase;letter-spacing:.5px;color:var(--muted);">${g.titulo} (${g.total})</span>
          <button type="button" class="gc-action-btn" style="padding:4px 11px;font-size:11px;">Ir →</button>
        </div>
        ${g.items.map((t) => `<div style="font-size:12.5px;color:var(--ink);padding:2px 0;">${escapeHtml(t)}</div>`).join('')}
        ${g.total > g.items.length ? `<div style="font-size:11px;color:var(--muted-soft);padding-top:3px;">y ${g.total - g.items.length} más…</div>` : ''}`;
      bloque.querySelector('button').addEventListener('click', g.alTocar);
      cont.appendChild(bloque);
    });
  }

  // ---- Atajos de rango de fechas ----
  document.querySelectorAll('.b-rango').forEach((btn) => {
    btn.addEventListener('click', () => {
      const hoy = new Date();
      const iso = (d) => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
      let desde, hasta;
      switch (btn.dataset.rango) {
        case 'mes':
          desde = new Date(hoy.getFullYear(), hoy.getMonth(), 1); hasta = new Date(hoy.getFullYear(), hoy.getMonth() + 1, 0); break;
        case 'mes-pasado':
          desde = new Date(hoy.getFullYear(), hoy.getMonth() - 1, 1); hasta = new Date(hoy.getFullYear(), hoy.getMonth(), 0); break;
        case '30':
          desde = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate() - 29); hasta = hoy; break;
        default:
          desde = new Date(hoy.getFullYear(), 0, 1); hasta = new Date(hoy.getFullYear(), 11, 31);
      }
      $('b-desde').value = iso(desde);
      $('b-hasta').value = iso(hasta);
      renderBusqueda();
    });
  });

  function renderBusqueda() {
    const texto = $('b-texto').value.trim().toLowerCase();
    const anio = $('b-anio').value || 'todos';
    const desde = $('b-desde') ? $('b-desde').value : '';
    const hasta = $('b-hasta') ? $('b-hasta').value : '';
    const tipoFiltro = $('b-tipo') ? $('b-tipo').value : 'todos';
    const usaRango = !!(desde || hasta); // si hay fechas, mandan sobre "Año"

    const min = parseFloat(($('b-min') ? $('b-min').value : '').replace(',', '.'));
    const max = parseFloat(($('b-max') ? $('b-max').value : '').replace(',', '.'));
    const orden = $('b-orden') ? $('b-orden').value : 'fecha-desc';

    const filtrados = todosMov().filter((m) => {
      const fecha = m.fecha || '';
      const monto = Number(m.monto) || 0;
      const okFecha = usaRango
        ? (!desde || fecha >= desde) && (!hasta || fecha <= hasta)
        : (anio === 'todos' || fecha.slice(0, 4) === anio);
      const okTipo = tipoFiltro === 'todos' || m.tipo === tipoFiltro;
      const okMonto = (isNaN(min) || monto >= min) && (isNaN(max) || monto <= max);
      const okTexto = !texto
        || (m.cat || '').toLowerCase().includes(texto)
        || (m.desc || '').toLowerCase().includes(texto)
        || String(m.monto || '').includes(texto);
      return okFecha && okTipo && okMonto && okTexto;
    }).sort((a, b) => {
      const fa = a.fecha || '', fb = b.fecha || '';
      const ma = Number(a.monto) || 0, mb = Number(b.monto) || 0;
      switch (orden) {
        case 'fecha-asc': return fa.localeCompare(fb);
        case 'monto-desc': return mb - ma;
        case 'monto-asc': return ma - mb;
        case 'cat': return (a.cat || '').localeCompare(b.cat || '');
        default: return fb.localeCompare(fa);   // fecha más nueva primero
      }
    });

    // Detalle
    const tbody = $('tbody-buscar');
    tbody.innerHTML = '';
    $('empty-buscar').style.display = filtrados.length === 0 ? 'block' : 'none';
    let total = 0;
    filtrados.forEach((m) => {
      total += Number(m.monto) || 0;
      const tr = document.createElement('tr');
      const tipoTxt = m.tipo === 'ingreso' ? 'Ingreso' : m.tipo === 'ajuste' ? 'Ajuste' : 'Gasto';
      tr.innerHTML = `
        <td>${invFechaNum(m.fecha)}</td>
        <td><span class="gc-tipo-tag ${m.tipo}">${tipoTxt}</span></td>
        <td>${ghResaltar(m.cat || '', texto)}</td>
        <td>${ghResaltar(m.desc || '', texto)}</td>
        <td class="gc-num">${fmt(m.monto)}</td>
      `;
      tbody.appendChild(tr);
    });
    $('total-buscar').textContent = fmt(total);

    // Resumen de lo encontrado (ingresos / gastos / neto de lo filtrado)
    const cajaRes = $('b-resumen-resultados');
    if (cajaRes) {
      if (!filtrados.length) {
        cajaRes.style.display = texto || usaRango || tipoFiltro !== 'todos' ? 'block' : 'none';
        cajaRes.innerHTML = 'Sin resultados con estos filtros.';
      } else {
        const ing = filtrados.filter((m) => m.tipo === 'ingreso').reduce((a, m) => a + (Number(m.monto) || 0), 0);
        const gas = filtrados.filter((m) => m.tipo === 'gasto').reduce((a, m) => a + (Number(m.monto) || 0), 0);
        cajaRes.style.display = 'block';
        cajaRes.innerHTML = `<strong>${filtrados.length}</strong> movimiento(s) · `
          + `ingresos <strong style="color:var(--teal-dk);">${fmt(ing)}</strong> · `
          + `gastos <strong style="color:var(--ember);">${fmt(gas)}</strong> · `
          + `neto <strong>${fmt(ing - gas)}</strong>`;
      }
    }

    ghUltimaBusqueda = filtrados;
    ghBuscarGlobal(texto);
    if (texto.length >= 2 && filtrados.length) ghSubirAResultados();

    // Resumen por categoría
    const resumen = new Map();
    filtrados.forEach((m) => {
      const key = m.cat + '||' + m.tipo;
      if (!resumen.has(key)) resumen.set(key, { cat: m.cat, tipo: m.tipo, total: 0, count: 0 });
      const r = resumen.get(key);
      r.total += Number(m.monto) || 0;
      r.count += 1;
    });
    const filas = [...resumen.values()].sort((a, b) => b.total - a.total);
    const tbodyR = $('tbody-resumen-cat');
    tbodyR.innerHTML = '';
    $('empty-resumen-cat').style.display = filas.length === 0 ? 'block' : 'none';
    filas.forEach((r) => {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>${escapeHtml(r.cat)}</td>
        <td><span class="gc-tipo-tag ${r.tipo}">${r.tipo === 'ingreso' ? 'Ingreso' : r.tipo === 'ajuste' ? 'Ajuste' : 'Gasto'}</span></td>
        <td class="gc-num">${r.count}</td>
        <td class="gc-num">${fmt(r.total)}</td>
      `;
      tbodyR.appendChild(tr);
    });

    renderDonutGastos(filas);
  }

  // ---- Donut SVG: gastos por categoría (top 6 + "Otros") ----
  const DONUT_COLORES = ['#0E8F82', '#C6551E', '#4F6FA8', '#9B7220', '#7A5AA8', '#3E8FBF', '#8895AC'];
  function renderDonutGastos(filas) {
    const wrap = $('gc-chart-cat-cont');
    const svgCont = $('gc-donut-svg');
    const legendCont = $('gc-donut-legend');
    if (!wrap || !svgCont || !legendCont) return;

    const gastos = filas.filter((r) => r.tipo === 'gasto' && r.total > 0).sort((a, b) => b.total - a.total);
    if (gastos.length === 0) { wrap.style.display = 'none'; return; }
    wrap.style.display = 'block';

    const top = gastos.slice(0, 6);
    const restoTotal = gastos.slice(6).reduce((s, r) => s + r.total, 0);
    const slices = restoTotal > 0 ? [...top, { cat: 'Otros', total: restoTotal }] : top;
    const total = slices.reduce((s, r) => s + r.total, 0) || 1;

    const R = 70, CX = 80, CY = 80, STROKE = 26;
    const circ = 2 * Math.PI * R;
    let acumulado = 0;
    const arcos = slices.map((s, i) => {
      const frac = s.total / total;
      const dash = frac * circ;
      const offset = -acumulado * circ;
      acumulado += frac;
      return `<circle cx="${CX}" cy="${CY}" r="${R}" fill="none" stroke="${DONUT_COLORES[i % DONUT_COLORES.length]}" stroke-width="${STROKE}" stroke-dasharray="${dash.toFixed(1)} ${(circ - dash).toFixed(1)}" stroke-dashoffset="${offset.toFixed(1)}" transform="rotate(-90 ${CX} ${CY})"><title>${escapeHtml(s.cat)}: ${fmt(s.total)}</title></circle>`;
    }).join('');

    svgCont.innerHTML = `<svg viewBox="0 0 160 160" width="160" height="160">${arcos}<text x="${CX}" y="${CY + 4}" text-anchor="middle" font-family="'IBM Plex Mono',monospace" font-size="12" font-weight="600" fill="var(--ink)">${fmt(total).replace('.00','')}</text></svg>`;

    legendCont.innerHTML = slices.map((s, i) => `
      <div class="gc-donut-leg-item">
        <span class="sw" style="background:${DONUT_COLORES[i % DONUT_COLORES.length]};"></span>
        <span>${escapeHtml(s.cat)}</span>
        <span class="val">${fmt(s.total)}</span>
      </div>
    `).join('');
  }

  // ---- Filtros rápidos (un toque) ----
  function bqMarcar() {
    const d = $('b-desde').value, h = $('b-hasta').value, t = $('b-tipo').value;
    const r = bqRango();
    document.querySelectorAll('#bq-chips [data-bq]').forEach((b) => {
      const k = b.dataset.bq; const x = r[k];
      b.classList.toggle('on', k === 'todo' ? false : !!(x && x[0] === d && x[1] === h));
    });
    document.querySelectorAll('#bq-chips [data-bqt]').forEach((b) => b.classList.toggle('on', t === b.dataset.bqt));
  }
  function bqRango() {
    const hoy = new Date(); hoy.setHours(12, 0, 0, 0);
    const f = ghFechaLocal;
    const lun = new Date(hoy); lun.setDate(hoy.getDate() - ((hoy.getDay() + 6) % 7));
    const dom = new Date(lun); dom.setDate(lun.getDate() + 6);
    const y = hoy.getFullYear(), m = hoy.getMonth();
    return {
      hoy: [f(hoy), f(hoy)], semana: [f(lun), f(dom)],
      mes: [f(new Date(y, m, 1)), f(new Date(y, m + 1, 0))],
      mespasado: [f(new Date(y, m - 1, 1)), f(new Date(y, m, 0))],
      '30': [f(new Date(hoy.getTime() - 29 * 86400000)), f(hoy)],
      anio: [f(new Date(y, 0, 1)), f(new Date(y, 11, 31))]
    };
  }
  document.querySelectorAll('#bq-chips [data-bq]').forEach((b) => b.addEventListener('click', () => {
    const k = b.dataset.bq;
    if (k === 'todo') { $('b-desde').value = ''; $('b-hasta').value = ''; $('b-tipo').value = 'todos'; }
    else { const [d, h] = bqRango()[k]; $('b-desde').value = d; $('b-hasta').value = h; }
    renderBusqueda(); bqMarcar();
  }));
  document.querySelectorAll('#bq-chips [data-bqt]').forEach((b) => b.addEventListener('click', () => {
    $('b-tipo').value = $('b-tipo').value === b.dataset.bqt ? 'todos' : b.dataset.bqt;
    renderBusqueda(); bqMarcar();
  }));
  ['b-desde', 'b-hasta', 'b-tipo'].forEach((id) => { if ($(id)) $(id).addEventListener('change', bqMarcar); });

  $('b-texto').addEventListener('input', debounce(renderBusqueda, 160));
  $('b-anio').addEventListener('change', renderBusqueda);
  if ($('b-desde')) $('b-desde').addEventListener('change', renderBusqueda);
  if ($('b-hasta')) $('b-hasta').addEventListener('change', renderBusqueda);
  if ($('b-tipo')) $('b-tipo').addEventListener('change', renderBusqueda);
  if ($('b-min')) $('b-min').addEventListener('input', debounce(renderBusqueda, 200));
  if ($('b-max')) $('b-max').addEventListener('input', debounce(renderBusqueda, 200));
  if ($('b-orden')) $('b-orden').addEventListener('change', renderBusqueda);
  if ($('b-limpiar-fechas')) {
    $('b-limpiar-fechas').addEventListener('click', () => {
      $('b-desde').value = '';
      $('b-hasta').value = '';
      renderBusqueda();
    });
  }
  if ($('b-limpiar-todo')) {
    $('b-limpiar-todo').addEventListener('click', () => {
      ['b-texto', 'b-desde', 'b-hasta', 'b-min', 'b-max'].forEach((id) => { if ($(id)) $(id).value = ''; });
      if ($('b-tipo')) $('b-tipo').value = 'todos';
      if ($('b-anio')) $('b-anio').value = 'todos';
      if ($('b-orden')) $('b-orden').value = 'fecha-desc';
      renderBusqueda();
      toast('Filtros limpiados', 'info', 1500);
    });
  }
  if ($('b-exportar')) {
    $('b-exportar').addEventListener('click', () => {
      if (!ghUltimaBusqueda.length) { toast('No hay resultados para exportar', 'info'); return; }
      const filas = [['Fecha', 'Tipo', 'Categoría', 'Descripción', 'Monto', 'Deducible']];
      ghUltimaBusqueda.forEach((m) => filas.push([
        m.fecha || '',
        m.tipo === 'ingreso' ? 'Ingreso' : m.tipo === 'ajuste' ? 'Ajuste' : 'Gasto',
        m.cat || '', m.desc || '', String(Number(m.monto) || 0),
        m.tipo === 'gasto' ? (m.deducible ? 'Sí' : 'No') : ''
      ]));
      const csv = filas.map((f) => f.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n');
      const a = document.createElement('a');
      a.href = URL.createObjectURL(new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8;' }));
      a.download = `busqueda-${today()}.csv`;
      a.click(); URL.revokeObjectURL(a.href);
      toast(`${ghUltimaBusqueda.length} resultado(s) exportado(s) ✓`);
    });
  }
  document.getElementById('taxas-anio-filtro').addEventListener('change', () => { renderResumenTaxas(); renderTotalPorSocio(); });

  // ---- Vista previa como hoja impresa ----
  // "Semana del lunes 28 de septiembre al viernes 2 de octubre" -> "28 sep – 2 oct"
  const INV_MESES_CORTOS = { enero:'ene', febrero:'feb', marzo:'mar', abril:'abr', mayo:'may', junio:'jun', julio:'jul', agosto:'ago', septiembre:'sep', setiembre:'sep', octubre:'oct', noviembre:'nov', diciembre:'dic' };
  function invRangoCorto(label) {
    const m = /(\d{1,2}) de ([a-záéíóú]+)(?: de \d{4})? al \w+ (\d{1,2}) de ([a-záéíóú]+)/i.exec(label || '');
    if (!m) return '';
    const mes = (x) => INV_MESES_CORTOS[String(x).toLowerCase()] || String(x).slice(0, 3).toLowerCase();
    return `${m[1]} ${mes(m[2])} – ${m[3]} ${mes(m[4])}`;
  }

  // Reparto de un invoice guardado, normalizado: lo usan el detalle en pantalla y
  // el documento que se imprime/envía, así los dos siempre dicen lo mismo.
  function invPagosNormalizados(inv) {
    if (Array.isArray(inv.pagos) && inv.pagos.length) {
          // Invoices guardados cuando la empresa estaba también en la lista de
          // socios traen el mismo nombre dos veces con la mitad cada uno. Se
          // juntan en una sola línea con el monto completo.
          const porNombre = new Map();
          inv.pagos.forEach((p) => {
            const k = String(p.nombre || '').trim().toLowerCase();
            if (!porNombre.has(k)) { porNombre.set(k, { ...p }); return; }
            const a = porNombre.get(k);
            a.base = (Number(a.base) || 0) + (Number(p.base) || 0);
            a.ajuste = (Number(a.ajuste) || 0) + (Number(p.ajuste) || 0);
            a.bono = (Number(a.bono) || 0) + (Number(p.bono) || 0);
            a.total = (Number(a.total) || 0) + (Number(p.total) || 0);
          });
          return [...porNombre.values()];
    }
          // Invoices guardados antes de que existiera la lista de pagos: se
          // reconstruye. La empresa SIEMPRE sale (una sola vez); el socio
          // solo si esa semana de verdad le tocó algo — así, cuando hay un
          // único dueño, no se repite el mismo nombre dos veces.
          const arr = [{
            nombre: cfgFacturaNombre || 'Empresa',
            base: inv.mitad != null ? inv.mitad : inv.neto,
            ajuste: inv.ajusteGuzman || 0, bono: 0, bonoPct: null,
            total: inv.pagoGuzman != null ? inv.pagoGuzman : inv.neto
          }];
          const claveEmp = (cfgFacturaNombre || '').trim().toLowerCase();
          const socioReal = (cfgSocios || []).find((x) => x && x.nombre && x.nombre.trim().toLowerCase() !== claveEmp);
          // Si ese socio ya no está en la lista (se quitó después), el pago
          // que se le registró en esa semana igual debe verse: se muestra con
          // su nombre de antes si se conoce, o simplemente como "Socio".
          const aliasSocio = String(cfgSocioBonus || '').trim();
          const aliasUtil = aliasSocio && aliasSocio.toLowerCase() !== claveEmp && !/^socio \d+$/i.test(aliasSocio) ? aliasSocio : '';
          const nombreSocio = (socioReal && socioReal.nombre) || aliasUtil || 'Socio';
          if (Number(inv.pagoCra) > 0) {
            arr.push({ nombre: nombreSocio, base: inv.mitad, ajuste: 0, bono: inv.bonoCra || 0, bonoPct: null, total: inv.pagoCra });
          }
          return arr;
  }

  function construirHTMLInvoice(inv) {
    const filasGasto = (inv.gastoItems || []).length
      ? inv.gastoItems.map((m) => `
          <tr><td>${invFechaNum(m.fecha)}</td><td>${escapeHtml(m.cat || '')}</td><td>${escapeHtml(m.desc || '')}</td><td class="num">${fmt(m.monto)}</td></tr>
        `).join('')
      : `<tr><td colspan="4" style="color:#777; font-style:italic;">Sin gastos capturados esta semana</td></tr>`;

    const guardadoNum = inv.guardadoEn
      ? (() => { const d = new Date(inv.guardadoEn);
          return `${String(d.getMonth()+1).padStart(2,'0')}/${String(d.getDate()).padStart(2,'0')}/${d.getFullYear()}`; })()
      : '';
    return `
      <h1>${escapeHtml(cfgFacturaNombre)}</h1>
      ${cfgFacturaDireccion ? `<div class="ps-addr">${escapeHtml(cfgFacturaDireccion)}</div>` : ''}
      <div class="ps-badge">${escapeHtml(inv.label || '')}${guardadoNum ? ' · guardado el ' + guardadoNum : ''}</div>

      <h2>Detalle de gastos</h2>
      <table>
        <thead><tr><th data-i18n="fecha">Fecha</th><th data-i18n="categoria">Categoría</th><th data-i18n="descripcion">Descripción</th><th class="num" data-i18n="h_monto">Monto</th></tr></thead>
        <tbody>${filasGasto}</tbody>
        <tfoot>
          <tr><td colspan="3">Subtotal gastos</td><td class="num">${fmt(inv.gastos)}</td></tr>
          <tr class="ps-tax"><td colspan="3">Taxas (10% de ingresos)</td><td class="num">${fmt(inv.taxas)}</td></tr>
          <tr class="ps-total"><td colspan="3">Total gastos</td><td class="num">${fmt(inv.gastosTotales)}</td></tr>
        </tfoot>
      </table>

      <h2>Resumen de la semana</h2>
      <table>
        <tbody>
          <tr><td>Ingresos</td><td class="num">${fmt(inv.ingresos)}</td></tr>
          <tr><td>Total gastos (incluye taxas)</td><td class="num">${fmt(inv.gastosTotales)}</td></tr>
          <tr><td>Neto a repartir</td><td class="num">${fmt(inv.neto)}</td></tr>
          ${inv.ajusteGuzman ? `<tr><td>Ajuste ${inv.ajusteGuzman > 0 ? '(+)' : '(−)'}</td><td class="num">${fmt(inv.ajusteGuzman)}</td></tr>` : ''}
          <tr><td>Taxas restantes (después de tax)</td><td class="num">${fmt(inv.taxGuzman)}</td></tr>
        </tbody>
      </table>

      <h2>Reparto</h2>
      <div class="ps-split">
        ${invPagosNormalizados(inv).map((p) => `
          <div class="ps-split-box">
            <div class="ps-name">${escapeHtml(p.nombre)}</div>
            <div class="ps-total">${fmt(p.total)}</div>
            <div class="ps-note">parte ${fmt(p.base)}${p.bono ? ` + tax${p.bonoPct != null ? ' ' + p.bonoPct + '%' : ''} (${fmt(p.bono)})` : ''}${p.ajuste ? ` + ajuste ${fmt(p.ajuste)}` : ''}</div>
          </div>`).join('')}
      </div>
    `;
  }

  // Vista en pantalla del invoice guardado (el documento que se imprime, se envía
  // o se descarga sigue saliendo de construirHTMLInvoice, sin cambios).
  function construirVistaInvoicePantalla(inv) {
    const fmtOpc = (v) => (v == null || v === '' || isNaN(Number(v))) ? '—' : fmt(v);
    const dG = inv.guardadoEn ? new Date(inv.guardadoEn) : null;
    const guardadoNum = dG && !isNaN(dG)
      ? `${String(dG.getMonth() + 1).padStart(2, '0')}/${String(dG.getDate()).padStart(2, '0')}/${dG.getFullYear()}` : '';
    const rango = invRangoCorto(inv.label);
    const gastos = Array.isArray(inv.gastoItems) ? inv.gastoItems : [];
    const filasGasto = gastos.length ? gastos.map((m) => `
        <div class="iv-row">
          <div class="iv-row-l"><b>${escapeHtml(m.desc || m.cat || '—')}</b><span>${invFechaNum(m.fecha)}${m.cat && m.desc ? ' · ' + escapeHtml(m.cat) : ''}</span></div>
          <div class="iv-row-v">${fmt(m.monto)}</div>
        </div>`).join('') : '<div class="iv-vacio">Sin gastos capturados esta semana</div>';
    const pagos = invPagosNormalizados(inv).map((p, k) => `
        <div class="iv-pay c${k % 4}">
          <div class="iv-pay-n">${escapeHtml(p.nombre || '—')}</div>
          <div class="iv-pay-v">${fmtOpc(p.total)}</div>
          <div class="iv-pay-note">parte ${fmt(p.base)}${p.bono ? ` + tax${p.bonoPct != null ? ' ' + p.bonoPct + '%' : ''} (${fmt(p.bono)})` : ''}${p.ajuste ? ` + ajuste ${fmt(p.ajuste)}` : ''}</div>
        </div>`).join('');
    return `
      <div class="iv">
        <div class="iv-hero">
          <div class="iv-hero-top">
            <div>
              <div class="iv-co">${escapeHtml(cfgFacturaNombre || '')}</div>
              ${cfgFacturaDireccion ? `<div class="iv-addr">${escapeHtml(cfgFacturaDireccion)}</div>` : ''}
            </div>
            <span class="iv-chip">Invoice</span>
          </div>
          <div class="iv-week">${escapeHtml(rango || inv.label || '')}</div>
          <div class="iv-sub">${escapeHtml(inv.label || '')}${guardadoNum ? ' · guardado el ' + guardadoNum : ''}</div>
          <div class="iv-kpis">
            <div class="iv-kpi"><span>Ingresos</span><b>${fmtOpc(inv.ingresos)}</b></div>
            <div class="iv-kpi"><span>Gastos</span><b class="gas">${fmtOpc(inv.gastosTotales)}</b></div>
            <div class="iv-kpi"><span>Neto</span><b>${fmtOpc(inv.neto)}</b></div>
          </div>
        </div>

        <div class="iv-sec">
          <div class="iv-h">Reparto</div>
          <div class="iv-pays">${pagos || '<div class="iv-vacio">Sin reparto guardado</div>'}</div>
        </div>

        <div class="iv-sec">
          <div class="iv-h">Detalle de gastos</div>
          ${filasGasto}
          <div class="iv-tot"><span>Subtotal gastos</span><b>${fmt(inv.gastos)}</b></div>
          <div class="iv-tot"><span>Taxas (10% de ingresos)</span><b>${fmt(inv.taxas)}</b></div>
          <div class="iv-tot fuerte"><span>Total gastos</span><b>${fmt(inv.gastosTotales)}</b></div>
        </div>

        <div class="iv-sec">
          <div class="iv-h">Resumen de la semana</div>
          <div class="iv-tot"><span>Ingresos</span><b>${fmt(inv.ingresos)}</b></div>
          <div class="iv-tot"><span>Total gastos (incluye taxas)</span><b>${fmt(inv.gastosTotales)}</b></div>
          <div class="iv-tot"><span>Neto a repartir</span><b>${fmt(inv.neto)}</b></div>
          ${inv.ajusteGuzman ? `<div class="iv-tot"><span>Ajuste ${inv.ajusteGuzman > 0 ? '(+)' : '(−)'}</span><b>${fmt(inv.ajusteGuzman)}</b></div>` : ''}
          <div class="iv-tot"><span>Taxas restantes (después de tax)</span><b>${fmt(inv.taxGuzman)}</b></div>
        </div>
      </div>`;
  }

  let invoiceEnVista = null;

  function mostrarVistaImpresion(inv) {
    invoiceEnVista = inv;
    const sheet = $('modal-print-sheet');
    const overlay = $('modal-print');
    sheet.innerHTML = '';
    overlay.style.display = 'flex';
    // Fuerza a Safari/iOS a redibujar antes de meter el contenido — en la app
    // instalada a veces se queda en blanco si se cambia todo de un jalón.
    void overlay.offsetHeight;
    requestAnimationFrame(() => {
      // Se ve igual que la hoja impresa: el mismo documento dentro de un marco.
      sheet.classList.remove('iv-sheet');
      const frame = document.createElement('iframe');
      frame.title = 'Invoice';
      frame.style.cssText = 'display:block;width:100%;min-height:600px;border:0;background:#fff;border-radius:6px;';
      const ajustarAlto = () => {
        try { const d = frame.contentWindow.document; frame.style.height = (Math.max(d.body.scrollHeight, d.documentElement.scrollHeight) + 8) + 'px'; } catch (e) {}
      };
      frame.addEventListener('load', () => { ajustarAlto(); setTimeout(ajustarAlto, 300); });
      try { frame.srcdoc = ghDocImpresion(construirHTMLInvoice(inv), 'Invoice ' + (inv.label || '')); sheet.appendChild(frame); }
      catch (e) {
        try { const v = construirVistaInvoicePantalla(inv); sheet.classList.add('iv-sheet'); sheet.innerHTML = v; }
        catch (e2) { sheet.innerHTML = construirHTMLInvoice(inv); }
      }
    });
  }


  function ghConstruirHTMLDescargaReparto() {
    const cuerpo = construirHTMLInvoice(invoiceEnVista);
    return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Invoice - ${escapeHtml(invoiceEnVista.label || '')}</title>
      <style>
        body { font-family: Arial, Helvetica, sans-serif; color: #1a1a1a; padding: 32px; max-width: 780px; margin: 0 auto; }
        h1 { font-size: 21px; margin: 0; }
        .ps-addr { font-size: 12px; color: #555; margin: 4px 0 4px; }
        .ps-badge { font-size: 11px; color: #555; margin-bottom: 20px; }
        h2 { font-size: 13.5px; text-transform: uppercase; letter-spacing: 0.5px; color: #1B2A4A; border-bottom: 1px solid #1B2A4A; padding-bottom: 4px; margin: 26px 0 8px; }
        table { width: 100%; border-collapse: collapse; font-size: 12.5px; }
        th { text-align: left; border-bottom: 1.5px solid #1a1a1a; padding: 6px 4px; font-size: 10.5px; text-transform: uppercase; }
        .num { text-align: right; }
        td { padding: 6px 4px; border-bottom: 1px solid #ccc; }
        tfoot td { padding: 7px 4px; font-weight: 600; }
        tfoot tr.ps-tax td { border-top: 1px solid #1a1a1a; }
        tfoot tr.ps-total td { border-top: 2px solid #1a1a1a; font-size: 14px; }
        .ps-split { display: grid; grid-template-columns: 1fr 1fr; gap: 24px; margin-top: 10px; }
        .ps-split-box { border: 1.5px solid #1a1a1a; padding: 14px; }
        .ps-split-box .ps-name { font-weight: 700; font-size: 13px; margin-bottom: 6px; }
        .ps-split-box .ps-total { font-size: 19px; font-weight: 700; }
        .ps-split-box .ps-note { font-size: 11px; color: #555; margin-top: 4px; }
        .tip { font-size: 11px; color: #888; margin-bottom: 12px; }
        @media print { .tip { display: none; } }
      </style></head>
      <body><div class="tip">Presiona Ctrl+P (o Cmd+P en Mac) para imprimir.</div>${cuerpo}</body></html>`;
  }

  $('btn-imprimir-modal').addEventListener('click', () => {
    if (!invoiceEnVista) return;
    ghImprimirEnVentana(construirHTMLInvoice(invoiceEnVista), `Invoice ${invoiceEnVista.label || ''}`);
  });

  $('btn-enviar-desde-modal').addEventListener('click', async () => {
    if (!invoiceEnVista) return;
    const html = ghConstruirHTMLDescargaReparto();
    const nombreArchivo = `invoice-${(invoiceEnVista.key || 'semana')}.html`;
    const resumen = `Invoice ${invoiceEnVista.label || ''}`;
    try {
      const archivo = new File([html], nombreArchivo, { type: 'text/html' });
      if (navigator.canShare && navigator.canShare({ files: [archivo] })) {
        await navigator.share({ files: [archivo], title: resumen, text: resumen });
        return;
      }
    } catch (e) {
      if (e && e.name === 'AbortError') return;
    }
    if (navigator.share) {
      try { await navigator.share({ title: resumen, text: resumen }); }
      catch (e) { if (!e || e.name !== 'AbortError') toast('No se pudo abrir para compartir — usa Descargar.', 'error'); }
    } else {
      toast('Este navegador no soporta compartir directo — usa el botón Descargar.', 'info');
    }
  });

  // Resumen del invoice en texto, listo para pegar en WhatsApp o en un correo
  function ghTextoInvoice(inv) {
    const L = [];
    L.push(`*${cfgFacturaNombre || 'Invoice'}*`);
    L.push(`Invoice ${inv.label || ''}`);
    L.push('');
    L.push(`Ingresos: ${fmt(inv.ingresos)}`);
    L.push(`Gastos (con taxas): ${fmt(inv.gastosTotales)}`);
    L.push(`Neto a repartir: ${fmt(inv.neto)}`);
    const pagos = invPagosNormalizados(inv);
    if (pagos.length) {
      L.push(''); L.push('Reparto:');
      pagos.forEach((p) => L.push(`• ${p.nombre}: ${fmt(p.total)}`));
    }
    return L.join('\n');
  }
  function ghAbrirEnlace(url) {
    const a = document.createElement('a');
    a.href = url; a.target = '_blank'; a.rel = 'noopener';
    document.body.appendChild(a); a.click(); a.remove();
  }
  $('btn-wa-modal').addEventListener('click', () => {
    if (!invoiceEnVista) return;
    ghAbrirEnlace('https://wa.me/?text=' + encodeURIComponent(ghTextoInvoice(invoiceEnVista)));
  });
  $('btn-correo-modal').addEventListener('click', () => {
    if (!invoiceEnVista) return;
    const asunto = `${cfgFacturaNombre || 'Invoice'} — Invoice ${invoiceEnVista.label || ''}`;
    window.location.href = 'mailto:?subject=' + encodeURIComponent(asunto) + '&body=' + encodeURIComponent(ghTextoInvoice(invoiceEnVista).replace(/\*/g, ''));
  });

  $('btn-cerrar-modal').addEventListener('click', () => {
    $('modal-print').style.display = 'none';
    invoiceEnVista = null;
  });
  $('modal-print').addEventListener('click', (e) => {
    if (e.target.id === 'modal-print') { $('modal-print').style.display = 'none'; invoiceEnVista = null; }
  });

  $('btn-descargar-desde-modal').addEventListener('click', () => {
    if (!invoiceEnVista) return;
    const html = ghConstruirHTMLDescargaReparto();
    const blob = new Blob([html], { type: 'text/html;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `invoice-${(invoiceEnVista.key || 'semana')}.html`; a.click();
    URL.revokeObjectURL(url);
  });

  // ---- Imprimir (descarga archivo, no abre ventana) ----
  $('btn-imprimir').addEventListener('click', () => {
    const sorted = [...movimientos].sort((a, b) => (a.fecha || '').localeCompare(b.fecha || '') || String(a.id).localeCompare(String(b.id)));
    const grupos = new Map();
    sorted.forEach((m) => {
      const { key, label } = weekInfo(movRefSemana(m));
      if (!grupos.has(key)) grupos.set(key, { label, items: [] });
      grupos.get(key).items.push(m);
    });

    let filasMov = '';
    [...grupos.keys()].sort().forEach((key) => {
      const g = grupos.get(key);
      filasMov += `<tr><td colspan="5" style="background:#EFE4D2;font-weight:700;padding:6px;border-top:1px solid #B8935F;border-bottom:1px solid #B8935F;">${escapeHtml(g.label)}</td></tr>`;
      g.items.forEach((m) => {
        filasMov += `<tr>
          <td style="padding:6px;border-bottom:1px solid #ddd;">${m.fecha || ''}</td>
          <td style="padding:6px;border-bottom:1px solid #ddd;">${m.tipo === 'ingreso' ? 'Ingreso' : (m.tipo === 'ajuste' ? ('Ajuste ' + (m.ajusteDir === 'restar' ? '−' : '+') + (m.ajusteSocioNombre ? ' ' + escapeHtml(m.ajusteSocioNombre) : '')) : 'Gasto')}</td>
          <td style="padding:6px;border-bottom:1px solid #ddd;">${escapeHtml(m.cat || '')}</td>
          <td style="padding:6px;border-bottom:1px solid #ddd;">${escapeHtml(m.desc || '')}</td>
          <td style="padding:6px;border-bottom:1px solid #ddd;text-align:right;">${fmt(m.monto)}</td>
        </tr>`;
      });
    });

    // Reparto: una columna por cada quien entra (la empresa y, si hay, cada
    // socio). Sin socios solo sale la empresa y su tax.
    const semanas = calcularSemanas();
    const nombreEmp = (cfgFacturaNombre || 'Empresa').trim();
    const colsReparto = [];
    semanas.forEach((s) => (s.pagos || []).forEach((p) => { if (!colsReparto.some((c) => c.id === p.id)) colsReparto.push({ id: p.id, nombre: p.nombre }); }));
    if (!colsReparto.length) colsReparto.push({ id: 'empresa', nombre: nombreEmp });
    const tdR = 'padding:6px;border-bottom:1px solid #ddd;text-align:right;';
    const thR = 'text-align:right;border-bottom:2px solid #1B2A4A;padding:6px;font-size:10px;text-transform:uppercase;';
    let filasReparto = '';
    semanas.forEach((s) => {
      const celdas = colsReparto.map((c) => {
        const p = (s.pagos || []).find((x) => x.id === c.id);
        return `<td style="${tdR}">${p ? fmt(p.total) : '—'}</td>`;
      }).join('');
      filasReparto += `<tr>
        <td style="padding:6px;border-bottom:1px solid #ddd;">${escapeHtml(s.label)}</td>
        <td style="${tdR}">${fmt(s.ingresos)}</td>
        <td style="${tdR}">${fmt(s.gastos)}</td>
        <td style="${tdR}">${fmt(s.taxas)}</td>
        <td style="${tdR}">${fmt(s.neto)}</td>
        ${celdas}
        <td style="${tdR}">${fmt(s.taxGuzman)}</td>
      </tr>`;
    });
    const thSocios = colsReparto.map((c) => `<th style="${thR}">${escapeHtml(c.nombre)}</th>`).join('');
    const totalCols = 6 + colsReparto.length;

    const cuerpoHTML = `
      <div style="font-family:Arial,Helvetica,sans-serif;color:#2A2A2A;">
        <h1 style="font-size:20px;margin:0;">${escapeHtml(nombreEmp)}</h1>
        <h2 style="font-size:14px;margin:20px 0 8px;color:#1B2A4A;">Movimientos</h2>
        <table style="width:100%;border-collapse:collapse;font-size:11.5px;margin-bottom:16px;">
          <thead><tr>
            <th style="text-align:left;border-bottom:2px solid #1B2A4A;padding:6px;font-size:10px;text-transform:uppercase;" data-i18n="fecha">Fecha</th>
            <th style="text-align:left;border-bottom:2px solid #1B2A4A;padding:6px;font-size:10px;text-transform:uppercase;" data-i18n="tipo">Tipo</th>
            <th style="text-align:left;border-bottom:2px solid #1B2A4A;padding:6px;font-size:10px;text-transform:uppercase;" data-i18n="categoria">Categoría</th>
            <th style="text-align:left;border-bottom:2px solid #1B2A4A;padding:6px;font-size:10px;text-transform:uppercase;" data-i18n="descripcion">Descripción</th>
            <th style="text-align:right;border-bottom:2px solid #1B2A4A;padding:6px;font-size:10px;text-transform:uppercase;" data-i18n="h_monto">Monto</th>
          </tr></thead>
          <tbody>${filasMov || '<tr><td colspan="5" style="padding:6px;">Sin movimientos</td></tr>'}</tbody>
        </table>
        <h2 style="font-size:14px;margin:20px 0 8px;color:#1B2A4A;">Reparto semanal</h2>
        <table style="width:100%;border-collapse:collapse;font-size:11.5px;">
          <thead><tr>
            <th style="text-align:left;border-bottom:2px solid #1B2A4A;padding:6px;font-size:10px;text-transform:uppercase;" data-i18n="h_semana">Semana</th>
            <th style="text-align:right;border-bottom:2px solid #1B2A4A;padding:6px;font-size:10px;text-transform:uppercase;" data-i18n="h_ingresos">Ingresos</th>
            <th style="text-align:right;border-bottom:2px solid #1B2A4A;padding:6px;font-size:10px;text-transform:uppercase;" data-i18n="h_gastos">Gastos</th>
            <th style="text-align:right;border-bottom:2px solid #1B2A4A;padding:6px;font-size:10px;text-transform:uppercase;" data-i18n="h_taxas">Taxas</th>
            <th style="text-align:right;border-bottom:2px solid #1B2A4A;padding:6px;font-size:10px;text-transform:uppercase;" data-i18n="h_neto">Neto</th>
            ${thSocios}
            <th style="${thR}">Tax ${escapeHtml(nombreEmp)}</th>
          </tr></thead>
          <tbody>${filasReparto || `<tr><td colspan="${totalCols}" style="padding:6px;">Sin datos</td></tr>`}</tbody>
        </table>
      </div>`;

    // Imprimir directo (no descargar) — usa el método que funciona en iPhone
    ghImprimirEnVentana(cuerpoHTML, 'Registro de movimientos');
  });

  // ---- Respaldo completo (para guardar en OneDrive) ----
  $('btn-descargar-respaldo').addEventListener('click', async () => {
    // Leer datos de todos los módulos EN PARALELO (antes eran 8 lecturas en
    // fila, una tras otra — esto tarda lo mismo que la más lenta, no la suma).
    let empleadosData = [], facturasData = [], coloniasData = [], clientesData = [], trabajosData = [];
    let nominaData = [], trabajadoresData = [], recibosData = [];
    const [rEmp, rFact, rCol, rCli, rTrab, rNom, rTrabj, rRecibos] = await Promise.all([
      window.storage.get('empleados').catch(() => null),
      window.storage.get('gh-invoices').catch(() => null),
      window.storage.get('gh-colonias').catch(() => null),
      window.storage.get('gh-clientes').catch(() => null),
      window.storage.get('gh-trabajos').catch(() => null),
      window.storage.get('gh-nomina').catch(() => null),
      window.storage.get('gh-trabajadores').catch(() => null),
      window.storage.get('gh-recibos-semanales').catch(() => null),
    ]);
    try { empleadosData = JSON.parse(rEmp.value); } catch (e) {}
    try { facturasData = JSON.parse(rFact.value); } catch (e) {}
    try { coloniasData = JSON.parse(rCol.value); } catch (e) {}
    try { clientesData = JSON.parse(rCli.value); } catch (e) {}
    try { trabajosData = JSON.parse(rTrab.value); } catch (e) {}
    try { nominaData = JSON.parse(rNom.value); } catch (e) {}
    try { trabajadoresData = JSON.parse(rTrabj.value); } catch (e) {}
    try { recibosData = JSON.parse(rRecibos.value); } catch (e) {}

    const respaldo = {
      app: 'GH Manager',
      version: 3,
      generadoEn: new Date().toISOString(),
      // Cuentas y reparto
      movimientos,
      catGastos,
      catIngresos,
      invoicesGuardados,
      // Empleados
      empleados: empleadosData,
      // Facturas
      facturas: facturasData,
      colonias: coloniasData,
      clientes: clientesData,
      trabajos: trabajosData,
      // Nómina
      nomina: nominaData,
      trabajadores: trabajadoresData,
      recibosSemanales: recibosData
    };
    const blob = new Blob([JSON.stringify(respaldo, null, 2)], { type: 'application/json;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `respaldo-guzman-hvac-${today()}.json`;
    a.click();
    URL.revokeObjectURL(url);
    $('ultimo-respaldo-info').textContent = 'Último respaldo descargado: ' + new Date().toLocaleString('es-MX', { dateStyle: 'medium', timeStyle: 'short' });
    toast('Respaldo completo descargado ✓', 'success');
  });

  // ---- Trimestre rápido: llena el rango de fechas con un clic (para reportes al contador) ----
  (function () {
    const inputAnio = $('rep-trim-anio');
    if (inputAnio) inputAnio.value = new Date().getFullYear();
    document.querySelectorAll('[data-trim]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const anio = parseInt(inputAnio.value, 10) || new Date().getFullYear();
        const trimestre = parseInt(btn.dataset.trim, 10);
        const mesInicio = (trimestre - 1) * 3;
        const desde = new Date(anio, mesInicio, 1);
        const hasta = new Date(anio, mesInicio + 3, 0);
        $('rep-desde').value = ghFechaLocal(desde);
        $('rep-hasta').value = ghFechaLocal(hasta);
        toast(`Rango puesto: Q${trimestre} ${anio}`, 'info');
      });
    });
  })();

  // ---- Reportes y exportación (Excel + PDF) ----
  // Trae nómina y empleados frescos de storage (por si no se visitaron esas
  // pestañas todavía); movimientos e invoices ya están siempre cargados.
  async function repObtenerDatos() {
    const leer = async (key) => { try { const r = await window.storage.get(key); return JSON.parse(r.value); } catch (e) { return []; } };
    const [nomina, emps] = await Promise.all([leer('gh-nomina'), leer(STORAGE_EMPLEADOS)]);
    const desde = $('rep-desde').value || null;
    const hasta = $('rep-hasta').value || null;
    const enRango = (fecha) => (!desde || fecha >= desde) && (!hasta || fecha <= hasta);
    return {
      movs: movimientos.filter((m) => enRango(m.fecha || '')),
      invs: invoicesGuardados.filter((i) => enRango((i.guardadoEn || '').slice(0, 10))),
      nomina: nomina.filter((n) => enRango((n.creadoEn || '').slice(0, 10))),
      emps, desde, hasta
    };
  }

  // El generador de Excel pesa mucho: se carga solo cuando se usa
  function ghCargarXLSX() {
    if (typeof XLSX !== 'undefined') return Promise.resolve(true);
    if (!window.__ghXlsxP) window.__ghXlsxP = new Promise((res) => {
      const sc = document.createElement('script'); sc.src = 'vendor/xlsx-0.18.5.full.min.js';
      sc.onload = () => res(typeof XLSX !== 'undefined'); sc.onerror = () => { window.__ghXlsxP = null; res(false); };
      document.head.appendChild(sc);
    });
    return window.__ghXlsxP;
  }
  $('btn-reporte-excel').addEventListener('click', async () => {
    await ghCargarXLSX();
    if (typeof XLSX === 'undefined') { toast('No se pudo cargar el generador de Excel. Revisa tu conexión e intenta de nuevo.', 'error', 4000); return; }
    const { movs, invs, nomina, emps } = await repObtenerDatos();
    const wb = XLSX.utils.book_new();

    const hojaMovs = movs.map((m) => ({
      Fecha: m.fecha || '', Tipo: m.tipo === 'ingreso' ? 'Ingreso' : m.tipo === 'gasto' ? 'Gasto' : 'Ajuste',
      Categoría: m.cat || '', Descripción: m.desc || '', Monto: Number(m.monto) || 0,
      Deducible: m.tipo === 'gasto' ? (m.deducible ? 'Sí' : 'No') : ''
    }));
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(hojaMovs), 'Movimientos');

    // Hoja aparte solo con los gastos marcados como deducibles — lista para el contador
    const gastosDeducibles = movs.filter((m) => m.tipo === 'gasto' && m.deducible);
    if (gastosDeducibles.length) {
      const hojaDeducibles = gastosDeducibles.map((m) => ({
        Fecha: m.fecha || '', Categoría: m.cat || '', Descripción: m.desc || '', Monto: Number(m.monto) || 0
      }));
      hojaDeducibles.push({ Fecha: '', Categoría: '', Descripción: 'TOTAL DEDUCIBLE', Monto: gastosDeducibles.reduce((s, m) => s + (Number(m.monto) || 0), 0) });
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(hojaDeducibles), 'Gastos deducibles');
    }

    const hojaInv = invs.map((i) => {
      const fila = {
        Semana: i.label || '', Guardado: (i.guardadoEn || '').slice(0, 10),
        Ingresos: i.ingresos || 0, Gastos: i.gastos || 0, Taxas: i.taxas || 0
      };
      const pagos = Array.isArray(i.pagos) && i.pagos.length ? i.pagos : [{ nombre: cfgSocioBonus, total: i.pagoCra || 0 }, { nombre: cfgSocioMitad, total: i.pagoGuzman || 0 }];
      pagos.forEach((p) => { fila[p.nombre] = p.total; });
      return fila;
    });
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(hojaInv), 'Invoices guardados');

    const hojaNom = nomina.map((n) => ({
      Trabajador: n.trabajador || '', Fecha: (n.creadoEn || '').slice(0, 10),
      'Días trabajados': (n.dias || []).length, 'Sueldo por día': n.sueldoDia || 0,
      Extra: n.extraDesc || '', 'Monto extra': n.extraMonto || 0, 'Monto total': n.monto || 0, Nota: n.nota || ''
    }));
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(hojaNom), 'Nómina');

    const hojaEmp = emps.map((e) => ({
      Nombre: empNombreCompleto(e), Rol: e.rol || '', Estado: e.estado === 'inactivo' ? 'Inactivo' : 'Activo',
      'Sueldo por día': e.sueldo || 0, Teléfono: e.tel || '', Email: e.email || '',
      Dirección: e.direccion || '', 'Fecha de inicio': e.inicio || ''
    }));
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(hojaEmp), 'Empleados');

    // Descargar el Excel. En el iPhone instalado, la descarga directa a veces
    // no hace nada (Safari la bloquea), así que ahí se comparte el archivo por
    // el menú de iOS (donde puedes elegir Guardar en Archivos, Mail, etc.).
    const nombreArchivo = `reporte-guzman-hvac-${today()}.xlsx`;
    if (!movs.length && !invs.length && !nomina.length && !emps.length) {
      toast('No hay datos en ese rango para exportar', 'info', 3500);
      return;
    }
    try {
      if (ghEsStandalone() && navigator.canShare) {
        const wbout = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
        const archivo = new File([wbout], nombreArchivo, { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
        if (navigator.canShare({ files: [archivo] })) {
          await navigator.share({ files: [archivo], title: 'Reporte GH Manager' });
          return;
        }
      }
    } catch (e) {
      if (e && e.name === 'AbortError') return; // el usuario cerró el menú
    }
    // Vía normal (navegador de escritorio o si compartir no está disponible)
    XLSX.writeFile(wb, nombreArchivo);
    toast('Excel descargado ✓', 'success');
  });

  // Resumen de una página para el contador: por trimestre, por categoría y nómina
  $('btn-reporte-contador').addEventListener('click', async () => {
    let { movs, nomina, desde, hasta } = await repObtenerDatos();
    if (!desde && !hasta) { const y = new Date().getFullYear(); desde = y + '-01-01'; hasta = y + '-12-31'; movs = movimientos.filter((m) => (m.fecha || '') >= desde && (m.fecha || '') <= hasta); }
    const suma = (a) => a.reduce((t, m) => t + (Number(m.monto) || 0), 0);
    const ing = movs.filter((m) => m.tipo === 'ingreso'), gas = movs.filter((m) => m.tipo === 'gasto');
    const filasNom = [];
    nomina.forEach((n) => nomExpandirPagos([n]).forEach((f) => { if (f.fecha && (!desde || f.fecha >= desde) && (!hasta || f.fecha <= hasta)) filasNom.push({ t: (n.trabajador || 'Sin nombre').trim(), f: f.fecha, m: f.monto }); }));
    const trimDe = (f) => Math.floor((Number(String(f).slice(5, 7)) - 1) / 3);
    const q = [0, 1, 2, 3].map((i) => ({ ing: suma(ing.filter((m) => trimDe(m.fecha) === i)), gas: suma(gas.filter((m) => trimDe(m.fecha) === i)), nom: filasNom.filter((x) => trimDe(x.f) === i).reduce((t, x) => t + x.m, 0) }));
    const porCat = (arr) => { const mp = new Map(); arr.forEach((m) => { const c = (m.cat || 'Sin categoría').trim() || 'Sin categoría'; mp.set(c, (mp.get(c) || 0) + (Number(m.monto) || 0)); }); return [...mp.entries()].sort((a, b) => b[1] - a[1]); };
    const porTrab = new Map(); filasNom.forEach((x) => porTrab.set(x.t, (porTrab.get(x.t) || 0) + x.m));
    const tI = suma(ing), tG = suma(gas), tN = filasNom.reduce((t, x) => t + x.m, 0);
    const nfNeg = (v) => v < 0 ? '−' + nomFmt(-v) : nomFmt(v);
    const tabla = (titulo, filas, total) => `<h2>${titulo}</h2><table><tbody>${filas.map(([c, v]) => `<tr><td>${escapeHtml(c)}</td><td class="num">${v ? nomFmt(v) : '—'}</td></tr>`).join('') || '<tr><td style="color:#777;">Sin datos.</td><td></td></tr>'}</tbody><tfoot><tr class="ps-total"><td>Total</td><td class="num">${nomFmt(total)}</td></tr></tfoot></table>`;
    const html = `<h1>${escapeHtml(cfgFacturaNombre || 'GUZMAN HVAC')}</h1>
      ${cfgFacturaDireccion ? `<div class="ps-addr">${escapeHtml(cfgFacturaDireccion)}</div>` : ''}
      <div class="ps-badge">Resumen para el contador · ${escapeHtml(desde || '…')} a ${escapeHtml(hasta || '…')}</div>
      <h2>Por trimestre</h2>
      <table><thead><tr><th></th><th class="num">Ingresos</th><th class="num">Gastos</th><th class="num">Nómina</th><th class="num">Neto</th></tr></thead><tbody>
        ${q.map((r, i) => `<tr><td>Q${i + 1}</td><td class="num">${nomFmt(r.ing)}</td><td class="num">${nomFmt(r.gas)}</td><td class="num">${nomFmt(r.nom)}</td><td class="num">${nfNeg(r.ing - r.gas)}</td></tr>`).join('')}
      </tbody><tfoot><tr class="ps-total"><td>Total</td><td class="num">${nomFmt(tI)}</td><td class="num">${nomFmt(tG)}</td><td class="num">${nomFmt(tN)}</td><td class="num">${nfNeg(tI - tG)}</td></tr></tfoot></table>
      ${tabla('Ingresos por categoría', porCat(ing), tI)}
      ${tabla('Gastos por categoría', porCat(gas), tG)}
      ${tabla('Nómina por trabajador', [...porTrab.entries()].sort((a, b) => b[1] - a[1]), tN)}
      <div class="ps-addr" style="margin-top:14px;">Base de datos: ${escapeHtml(cfgFacturaNombre || '')}. Los gastos no incluyen las taxas; la nómina sale de los días registrados.</div>`;
    ghImprimirEnVentana(html, 'Resumen contador');
  });

  $('btn-reporte-pdf').addEventListener('click', async () => {
    const { movs, invs, nomina, emps, desde, hasta } = await repObtenerDatos();
    const totIng = movs.filter((m) => m.tipo === 'ingreso').reduce((s, m) => s + (Number(m.monto) || 0), 0);
    const totGas = movs.filter((m) => m.tipo === 'gasto').reduce((s, m) => s + (Number(m.monto) || 0), 0);
    const totNomina = nomina.reduce((s, n) => s + (Number(n.monto) || 0), 0);
    const activos = emps.filter((e) => e.estado !== 'inactivo');
    const filaMov = (m) => `<tr><td>${escapeHtml(m.fecha || '')}</td><td>${m.tipo === 'ingreso' ? 'Ingreso' : m.tipo === 'gasto' ? 'Gasto' : 'Ajuste'}</td><td>${escapeHtml(m.cat || '')}</td><td>${escapeHtml(m.desc || '')}</td><td style="text-align:right;">${fmt(m.monto)}</td></tr>`;
    const filaInv = (i) => {
      const pagos = Array.isArray(i.pagos) && i.pagos.length ? i.pagos : [{ nombre: cfgSocioBonus, total: i.pagoCra || 0 }, { nombre: cfgSocioMitad, total: i.pagoGuzman || 0 }];
      return `<tr><td>${escapeHtml(i.label || '')}</td><td style="text-align:right;">${fmt(i.ingresos)}</td><td style="text-align:right;">${fmt(i.gastos)}</td>${pagos.map((p) => `<td style="text-align:right;">${fmt(p.total)}</td>`).join('')}</tr>`;
    };
    const filaNom = (n) => `<tr><td>${escapeHtml(n.trabajador || '')}</td><td>${(n.creadoEn || '').slice(0, 10)}</td><td style="text-align:center;">${(n.dias || []).length}</td><td style="text-align:right;">${fmt(n.monto)}</td></tr>`;
    const filaEmp = (e) => `<tr><td>${escapeHtml(empNombreCompleto(e))}</td><td>${escapeHtml(e.rol || '')}</td><td style="text-align:right;">${e.sueldo ? fmt(e.sueldo) + '/día' : '—'}</td></tr>`;
    const rangoTxt = (desde || hasta) ? `${desde || '…'} a ${hasta || '…'}` : 'Todo el historial';

    const html = `
      <div style="font-family:'Inter',sans-serif;color:#131C2E;">
        <div style="border-bottom:2px solid #131C2E;padding-bottom:14px;margin-bottom:18px;">
          <div style="font-family:'Zilla Slab',serif;font-size:22px;font-weight:700;">Reporte — ${escapeHtml(cfgFacturaNombre)}</div>
          <div style="font-size:12px;color:#63708C;">Rango: ${escapeHtml(rangoTxt)} · Generado: ${new Date().toLocaleString('es-MX', { dateStyle: 'medium', timeStyle: 'short' })}</div>
        </div>
        <div style="display:flex;gap:14px;margin-bottom:22px;flex-wrap:wrap;">
          <div style="flex:1;min-width:140px;border:1px solid #DCE3EF;border-radius:10px;padding:12px;"><div style="font-size:10.5px;color:#63708C;text-transform:uppercase;">Ingresos</div><div style="font-size:19px;font-weight:700;color:#0E8F82;">${fmt(totIng)}</div></div>
          <div style="flex:1;min-width:140px;border:1px solid #DCE3EF;border-radius:10px;padding:12px;"><div style="font-size:10.5px;color:#63708C;text-transform:uppercase;">Gastos</div><div style="font-size:19px;font-weight:700;color:#C6551E;">${fmt(totGas)}</div></div>
          <div style="flex:1;min-width:140px;border:1px solid #DCE3EF;border-radius:10px;padding:12px;"><div style="font-size:10.5px;color:#63708C;text-transform:uppercase;">Neto</div><div style="font-size:19px;font-weight:700;">${fmt(totIng - totGas)}</div></div>
          <div style="flex:1;min-width:140px;border:1px solid #DCE3EF;border-radius:10px;padding:12px;"><div style="font-size:10.5px;color:#63708C;text-transform:uppercase;">Nómina pagada</div><div style="font-size:19px;font-weight:700;">${fmt(totNomina)}</div></div>
        </div>

        <div style="font-family:'Zilla Slab',serif;font-size:15px;font-weight:700;margin-bottom:8px;">Invoices guardados (${invs.length})</div>
        <table style="width:100%;border-collapse:collapse;font-size:11.5px;margin-bottom:20px;">
          <thead><tr style="background:#F5F7FC;"><th style="text-align:left;padding:6px;" data-i18n="h_semana">Semana</th><th style="text-align:right;padding:6px;" data-i18n="h_ingresos">Ingresos</th><th style="text-align:right;padding:6px;" data-i18n="h_gastos">Gastos</th>${(cfgSocios && cfgSocios.length ? cfgSocios : [{ nombre: cfgSocioBonus }, { nombre: cfgSocioMitad }]).map((s) => `<th style="text-align:right;padding:6px;">${escapeHtml(s.nombre)}</th>`).join('')}</tr></thead>
          <tbody>${invs.map(filaInv).join('') || `<tr><td colspan="${3 + (cfgSocios && cfgSocios.length ? cfgSocios.length : 2)}" style="padding:8px;color:#63708C;">Sin invoices en este rango.</td></tr>`}</tbody>
        </table>

        <div style="font-family:'Zilla Slab',serif;font-size:15px;font-weight:700;margin-bottom:8px;">Movimientos (${movs.length})</div>
        <table style="width:100%;border-collapse:collapse;font-size:11.5px;margin-bottom:20px;">
          <thead><tr style="background:#F5F7FC;"><th style="text-align:left;padding:6px;" data-i18n="fecha">Fecha</th><th style="text-align:left;padding:6px;" data-i18n="tipo">Tipo</th><th style="text-align:left;padding:6px;" data-i18n="categoria">Categoría</th><th style="text-align:left;padding:6px;" data-i18n="descripcion">Descripción</th><th style="text-align:right;padding:6px;" data-i18n="h_monto">Monto</th></tr></thead>
          <tbody>${movs.map(filaMov).join('') || '<tr><td colspan="5" style="padding:8px;color:#63708C;">Sin movimientos en este rango.</td></tr>'}</tbody>
        </table>

        <div style="font-family:'Zilla Slab',serif;font-size:15px;font-weight:700;margin-bottom:8px;">Nómina (${nomina.length} pagos)</div>
        <table style="width:100%;border-collapse:collapse;font-size:11.5px;margin-bottom:20px;">
          <thead><tr style="background:#F5F7FC;"><th style="text-align:left;padding:6px;" data-i18n="trabajador">Trabajador</th><th style="text-align:left;padding:6px;" data-i18n="fecha">Fecha</th><th style="text-align:center;padding:6px;" data-i18n="h_dias">Días</th><th style="text-align:right;padding:6px;" data-i18n="h_monto">Monto</th></tr></thead>
          <tbody>${nomina.map(filaNom).join('') || '<tr><td colspan="4" style="padding:8px;color:#63708C;">Sin pagos en este rango.</td></tr>'}</tbody>
        </table>

        <div style="font-family:'Zilla Slab',serif;font-size:15px;font-weight:700;margin-bottom:8px;">Empleados activos (${activos.length})</div>
        <table style="width:100%;border-collapse:collapse;font-size:11.5px;">
          <thead><tr style="background:#F5F7FC;"><th style="text-align:left;padding:6px;" data-i18n="h_nombre">Nombre</th><th style="text-align:left;padding:6px;" data-i18n="rol">Rol</th><th style="text-align:right;padding:6px;" data-i18n="h_sueldo">Sueldo</th></tr></thead>
          <tbody>${activos.map(filaEmp).join('') || '<tr><td colspan="3" style="padding:8px;color:#63708C;">Sin empleados activos.</td></tr>'}</tbody>
        </table>
      </div>`;
    ghImprimirEnVentana(html, `Reporte - ${cfgFacturaNombre} - ${today()}`);
  });

  $('input-restaurar-respaldo').addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;
    // Feedback inmediato: si algo falla después de esto, al menos sabemos que
    // el archivo sí se seleccionó y el problema está en la lectura/procesamiento.
    $('status-restaurar').textContent = 'Leyendo "' + file.name + '"…';
    const reader = new FileReader();
    reader.onerror = () => {
      $('status-restaurar').textContent = 'No se pudo leer el archivo (error al abrirlo). Intenta de nuevo o elige otro archivo.';
    };
    reader.onload = async () => {
      try {
        const data = JSON.parse(reader.result);
        if (!data.movimientos && !data.empleados && !data.facturas) {
          $('status-restaurar').textContent = 'Ese archivo no parece ser un respaldo válido de esta app';
          return;
        }
        const confirmar = await gcConfirm('Esto va a reemplazar TODOS los datos actuales (movimientos, invoices, empleados, facturas, colonias, clientes y trabajos) con los del respaldo. ¿Continuar?', { okText: 'Restaurar', danger: true });
        if (!confirmar) { $('status-restaurar').textContent = 'Restauración cancelada.'; $('input-restaurar-respaldo').value = ''; return; }

        // Cuentas y reparto
        movimientos = data.movimientos || [];
        catGastos = data.catGastos || catGastos;
        catIngresos = data.catIngresos || catIngresos;
        invoicesGuardados = data.invoicesGuardados || [];
        await saveMov();
        await saveCatGastos();
        await saveCatIngresos();
        await saveInvoices();

        // Empleados
        if (data.empleados) {
          await window.storage.set('empleados', JSON.stringify(data.empleados));
          try { empleados = data.empleados || []; renderEmpleados(); } catch (e) {}
        }
        // Facturas y sus catálogos
        if (data.facturas) await window.storage.set('gh-invoices', JSON.stringify(data.facturas));
        if (data.colonias) await window.storage.set('gh-colonias', JSON.stringify(data.colonias));
        if (data.clientes) await window.storage.set('gh-clientes', JSON.stringify(data.clientes));
        if (data.trabajos) await window.storage.set('gh-trabajos', JSON.stringify(data.trabajos));
        try {
          if (data.facturas) invDocs = data.facturas;
          if (data.colonias) invColonias = data.colonias;
          if (data.clientes) invClientes = data.clientes;
          if (data.trabajos) invTrabajos = data.trabajos;
          invRefreshDlClientes(); invRefreshDlTrabajos(); invRefreshDlColonias();
        } catch (e) {}
        // Nómina
        if (data.nomina) await window.storage.set('gh-nomina', JSON.stringify(data.nomina));
        if (data.trabajadores) await window.storage.set('gh-trabajadores', JSON.stringify(data.trabajadores));
        if (data.recibosSemanales) await window.storage.set('gh-recibos-semanales', JSON.stringify(data.recibosSemanales));
        try {
          if (data.nomina) nomDocs = data.nomina;
          // Los trabajadores de un respaldo viejo se integran a Empleados (sin duplicar).
          if (data.trabajadores) { await nomMigrarTrabajadoresViejos(data.trabajadores); await saveEmpleados(); }
          nomCargado = true; // ya quedó cargado con lo restaurado; evita que un futuro click lo pise
          nomRefreshDl();
          nomRenderRegLedger(); nomRenderHist(); nomRenderTrabajadores(); nomRenderSemanal();
          if (typeof nomGridAbrirSemana === 'function') nomGridAbrirSemana();
        } catch (e) {}

        renderCategorias();
        renderCatSelect();
        renderMovimientos();
        renderReparto();

        $('status-restaurar').textContent = 'Respaldo restaurado — todos los datos (registro, facturas y nómina) ya están actualizados.';
        toast('Respaldo restaurado ✓ — todo actualizado', 'success', 4000);
        $('input-restaurar-respaldo').value = '';
        // Devolver el foco del teclado a la ventana (se pierde tras el selector)
        setTimeout(() => { try { window.focus(); document.body.focus(); } catch(e){} }, 60);
      } catch (err) {
        $('status-restaurar').textContent = 'No se pudo leer el archivo: ' + (err && err.message ? err.message : 'error desconocido');
        setTimeout(() => { try { window.focus(); } catch(e){} }, 60);
      }
    };
    reader.readAsText(file);
  });
  // Al abrir el selector de archivos, reforzar el foco al cerrarse
  $('input-restaurar-respaldo').addEventListener('click', () => {
    setTimeout(() => { try { window.focus(); document.body.focus(); } catch(e){} }, 300);
  });

  // ---- Export CSV ----
  $('btn-export').addEventListener('click', () => {
    const sorted = [...movimientos].sort((a, b) => (a.fecha || '').localeCompare(b.fecha || ''));
    let rows = [['Fecha','Tipo','Categoría','Descripción','Monto']];
    sorted.forEach((m) => rows.push([m.fecha, m.tipo, m.cat, m.desc, m.monto]));
    const csv = rows.map((r) => r.map((c) => `"${String(c ?? '').replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'movimientos-guzman-hvac.csv'; a.click();
    URL.revokeObjectURL(url);
  });

