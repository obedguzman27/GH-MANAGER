  // ===================== EDITAR UN INVOICE GUARDADO AHÍ MISMO =====================
  // Abre una ventana con todas las líneas del invoice (ingresos, gastos y
  // ajustes). Se pueden cambiar, quitar o agregar; al guardar se recalcula el
  // invoice con las mismas reglas de siempre (taxas, reparto, % de socios) y se
  // queda guardado en su lugar, sin pasar por Movimientos.
  function invEdLineasDe(inv) {
    const filas = [];
    const ref = (inv.gastoItems && inv.gastoItems[0] && inv.gastoItems[0].fecha) || inv.key || today();
    if (Array.isArray(inv.ingresoItems) && inv.ingresoItems.length) inv.ingresoItems.forEach((m) => filas.push({ ...m, tipo: 'ingreso' }));
    else if (Number(inv.ingresos) > 0) filas.push({ fecha: ref, tipo: 'ingreso', cat: catIngresos[0] || 'Ingreso', monto: inv.ingresos, desc: '' });
    (inv.gastoItems || []).forEach((m) => filas.push({ ...m, tipo: 'gasto' }));
    if (Array.isArray(inv.ajusteItems) && inv.ajusteItems.length) inv.ajusteItems.forEach((m) => filas.push({ ...m, tipo: 'ajuste' }));
    else if (inv.ajusteGuzman) {
      const socio = (cfgSocios || [])[0];
      filas.push({ fecha: ref, tipo: 'ajuste', cat: 'Ajuste', monto: Math.abs(inv.ajusteGuzman), ajusteDir: inv.ajusteGuzman < 0 ? 'restar' : 'sumar', ajusteSocioId: socio ? socio.id : 'empresa', desc: '' });
    }
    return filas.map((f, i) => ({ ...f, id: f.id != null ? f.id : Date.now() + i, monto: Number(f.monto) || 0 }));
  }
  // Recalcula un invoice con estas líneas (todas cuentan en la semana del invoice)
  function invEdCalcular(inv, filas) {
    const respaldo = movimientos;
    let r = null;
    try {
      movimientos = filas.filter((f) => Number(f.monto) > 0).map((f) => ({ ...f, fecha: inv.key || f.fecha }));
      r = calcularSemanas()[0] || null;
    } finally { movimientos = respaldo; }
    if (!r) return null;
    const limpias = filas.filter((f) => Number(f.monto) > 0);
    r.gastoItems = limpias.filter((f) => f.tipo === 'gasto').sort((a, b) => (a.fecha || '').localeCompare(b.fecha || ''));
    r.ingresoItems = limpias.filter((f) => f.tipo === 'ingreso');
    r.ajusteItems = limpias.filter((f) => f.tipo === 'ajuste');
    return r;
  }
  function abrirEditorInvoice(inv) {
    let filas = invEdLineasDe(inv);
    const ov = document.createElement('div');
    ov.className = 'gc-confirm-overlay';
    ov.style.alignItems = 'flex-start';
    ov.style.overflowY = 'auto';
    ov.innerHTML = `
      <div class="gc-confirm-box" style="max-width:880px;margin:20px auto;">
        <p style="font-weight:700;font-size:16px;margin:0 0 2px;">Editar invoice</p>
        <p style="font-size:12.5px;color:var(--muted);margin:0 0 14px;">${escapeHtml(inv.label || '')}</p>
        <datalist id="inv-ed-dl-cats">${[...new Set([...(catGastos || []), ...(catIngresos || [])])].map((c) => `<option value="${escapeHtml(c)}">`).join('')}</datalist>
        <div id="inv-ed-filas" style="display:flex;flex-direction:column;gap:8px;"></div>
        <div style="display:flex;flex-wrap:wrap;gap:8px;margin:12px 0 4px;">
          <button type="button" class="gc-action-btn" data-add="ingreso">+ Ingreso</button>
          <button type="button" class="gc-action-btn" data-add="gasto">+ Gasto</button>
          <button type="button" class="gc-action-btn" data-add="ajuste">+ Ajuste</button>
        </div>
        <div id="inv-ed-total" style="margin-top:12px;padding:12px 14px;border:1.5px solid var(--border);border-radius:var(--r-sm);background:var(--surface-2);font-size:13px;"></div>
        <div class="gc-confirm-actions" style="margin-top:16px;flex-wrap:wrap;">
          <button type="button" class="gc-action-btn" data-acc="cancelar">Cancelar</button>
          <button type="button" class="gc-save-btn" data-acc="guardar">Guardar cambios</button>
        </div>
      </div>`;
    document.body.appendChild(ov);
    requestAnimationFrame(() => requestAnimationFrame(() => ov.classList.add('show')));
    const cont = ov.querySelector('#inv-ed-filas');
    const estiloIn = 'padding:8px 10px;border:1.5px solid var(--border);border-radius:6px;font-size:14px;background:var(--card);color:var(--ink);min-width:0;';
    const opcSocios = () => opcionesAjuste().map((o) => `<option value="${escapeHtml(o.id)}">${escapeHtml(o.nombre)}</option>`).join('');
    const colorTipo = { ingreso: 'var(--teal)', gasto: 'var(--ember)', ajuste: 'var(--blue)' };

    function pintar() {
      cont.innerHTML = filas.map((f, i) => `
        <div data-i="${i}" style="display:grid;grid-template-columns:96px 140px minmax(120px,1fr) minmax(120px,1.4fr) 110px 34px;gap:6px;align-items:center;padding:8px;border:1px solid var(--border-soft);border-left:4px solid ${colorTipo[f.tipo] || 'var(--border)'};border-radius:8px;" class="inv-ed-fila">
          <select data-k="tipo" style="${estiloIn}">
            <option value="ingreso"${f.tipo === 'ingreso' ? ' selected' : ''}>Ingreso</option>
            <option value="gasto"${f.tipo === 'gasto' ? ' selected' : ''}>Gasto</option>
            <option value="ajuste"${f.tipo === 'ajuste' ? ' selected' : ''}>Ajuste</option>
          </select>
          <input type="date" data-k="fecha" value="${escapeHtml(f.fecha || '')}" style="${estiloIn}">
          ${f.tipo === 'ajuste'
            ? `<div style="display:flex;gap:4px;min-width:0;"><select data-k="ajusteDir" style="${estiloIn}width:58px;"><option value="sumar"${f.ajusteDir !== 'restar' ? ' selected' : ''}>+</option><option value="restar"${f.ajusteDir === 'restar' ? ' selected' : ''}>−</option></select>
               <select data-k="ajusteSocioId" style="${estiloIn}flex:1;">${opcSocios()}</select></div>`
            : `<input type="text" data-k="cat" list="inv-ed-dl-cats" value="${escapeHtml(f.cat || '')}" placeholder="Categoría" style="${estiloIn}">`}
          <input type="text" data-k="desc" value="${escapeHtml(f.desc || '')}" placeholder="Descripción" style="${estiloIn}">
          <input type="text" inputmode="decimal" data-k="monto" value="${f.monto ? Number(f.monto).toFixed(2) : ''}" placeholder="0.00" style="${estiloIn}text-align:right;">
          <button type="button" class="gc-del" data-quitar="${i}" title="Quitar línea">✕</button>
        </div>`).join('') || '<div class="gc-empty" style="display:block;">Sin líneas. Agrega una abajo.</div>';
      cont.querySelectorAll('select[data-k="ajusteSocioId"]').forEach((sel) => {
        const f = filas[Number(sel.closest('[data-i]').dataset.i)];
        if (f.ajusteSocioId && [...sel.options].some((o) => o.value === f.ajusteSocioId)) sel.value = f.ajusteSocioId;
        else f.ajusteSocioId = sel.value;
      });
      totales();
    }
    function totales() {
      const r = invEdCalcular(inv, filas);
      const box = ov.querySelector('#inv-ed-total');
      if (!r) { box.innerHTML = 'Sin montos todavía.'; return; }
      const pagos = (r.pagos || []).map((p) => `<div style="display:flex;justify-content:space-between;"><span>${escapeHtml(p.nombre)}</span><strong>${fmt(p.total)}</strong></div>`).join('');
      box.innerHTML = `
        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(120px,1fr));gap:8px;margin-bottom:8px;">
          <div>Ingresos<br><strong>${fmt(r.ingresos)}</strong></div>
          <div>Gastos<br><strong>${fmt(r.gastos)}</strong></div>
          <div>Taxas<br><strong>${fmt(r.taxas)}</strong></div>
          <div>Neto<br><strong>${fmt(r.neto)}</strong></div>
        </div>
        <div style="border-top:1px solid var(--border-soft);padding-top:8px;display:flex;flex-direction:column;gap:3px;">${pagos}
          <div style="display:flex;justify-content:space-between;color:var(--muted);"><span>Tax ${escapeHtml(cfgFacturaNombre || '')}</span><span>${fmt(r.taxGuzman)}</span></div></div>`;
    }
    cont.addEventListener('input', (e) => {
      const el = e.target; const fila = el.closest('[data-i]'); if (!fila || !el.dataset.k) return;
      const f = filas[Number(fila.dataset.i)];
      if (el.dataset.k === 'monto') f.monto = parseFloat(String(el.value).replace(/[$,\s]/g, '')) || 0;
      else f[el.dataset.k] = el.value;
      totales();
    });
    cont.addEventListener('change', (e) => {
      const el = e.target; const fila = el.closest('[data-i]'); if (!fila || !el.dataset.k) return;
      const f = filas[Number(fila.dataset.i)];
      if (el.dataset.k === 'tipo') {
        f.tipo = el.value;
        if (f.tipo === 'ajuste') { f.ajusteDir = f.ajusteDir || 'sumar'; f.cat = 'Ajuste +'; }
        else { delete f.ajusteDir; delete f.ajusteSocioId; delete f.ajusteSocioNombre; if (/^Ajuste/.test(f.cat || '')) f.cat = ''; }
        pintar();
      } else if (el.dataset.k === 'ajusteDir' || el.dataset.k === 'ajusteSocioId') {
        f[el.dataset.k] = el.value;
        totales();
      }
    });
    cont.addEventListener('click', (e) => {
      const b = e.target.closest('[data-quitar]'); if (!b) return;
      filas.splice(Number(b.dataset.quitar), 1); pintar();
    });
    ov.querySelectorAll('[data-add]').forEach((b) => b.addEventListener('click', () => {
      const tipo = b.dataset.add;
      const fila = { id: Date.now() + Math.random(), tipo, fecha: inv.key || today(), cat: tipo === 'ajuste' ? 'Ajuste +' : '', desc: '', monto: 0 };
      if (tipo === 'ajuste') fila.ajusteDir = 'sumar';
      filas.push(fila); pintar();
      const ult = cont.querySelector('.inv-ed-fila:last-child input[data-k="cat"], .inv-ed-fila:last-child input[data-k="monto"]');
      if (ult) ult.focus();
    }));
    const cerrar = () => { ov.classList.remove('show'); setTimeout(() => ov.remove(), 180); };
    ov.querySelector('[data-acc="cancelar"]').addEventListener('click', cerrar);
    ov.querySelector('[data-acc="guardar"]').addEventListener('click', async () => {
      const malas = filas.filter((f) => f.tipo !== 'ajuste' && Number(f.monto) > 0 && !String(f.cat || '').trim());
      if (malas.length) { toast('Ponle categoría a todas las líneas', 'error'); return; }
      filas.forEach((f) => {
        if (f.tipo === 'ajuste') { f.cat = f.ajusteDir === 'restar' ? 'Ajuste −' : 'Ajuste +'; f.ajusteSocioNombre = nombreDeAjuste(f.ajusteSocioId); }
        f.cat = String(f.cat || '').trim();
      });
      const r = invEdCalcular(inv, filas);
      if (!r) { toast('El invoice quedó sin montos — agrega al menos una línea', 'error'); return; }
      // Categorías nuevas escritas aquí se agregan a la lista
      let nuevas = false;
      filas.forEach((f) => {
        if (f.tipo === 'gasto' && f.cat && !catGastos.includes(f.cat)) { catGastos.push(f.cat); nuevas = true; }
        if (f.tipo === 'ingreso' && f.cat && !catIngresos.includes(f.cat)) { catIngresos.push(f.cat); nuevas = true; }
      });
      if (nuevas) { try { await saveCatGastos(); await saveCatIngresos(); } catch (e) {} renderCatSelect(); }
      const fijos = { id: inv.id, key: inv.key || r.key, label: inv.label || r.label, guardadoEn: inv.guardadoEn, editadoEn: new Date().toISOString() };
      Object.keys(inv).forEach((k) => { delete inv[k]; });
      Object.assign(inv, r, fijos);
      await saveInvoices();
      renderReparto();
      cerrar();
      toast('Invoice actualizado ✓', 'success');
    });
    pintar();
  }
  // ===================== /EDITAR UN INVOICE GUARDADO =====================

