  // ===================== ZELLE Y CASH =====================
  // Se guardan en la misma lista que los cheques (gh-cheques) con metodo
  // 'zelle' o 'cash'; aquí solo se ven esos.
  let zcEditandoId = null;
  const zcEs = (c) => c.metodo === 'zelle' || c.metodo === 'cash';
  function zcAnios(sel, lista) {
    const prev = sel.value || String(new Date().getFullYear());
    const anios = [...new Set(lista.map((c) => String(c.fecha || '').slice(0, 4)).filter(Boolean).concat([String(new Date().getFullYear())]))].sort().reverse();
    sel.innerHTML = '<option value="">Todos los años</option>' + anios.map((a) => `<option value="${a}">${a}</option>`).join('');
    sel.value = (anios.includes(prev) || prev === '') ? prev : '';
    return sel.value;
  }
  function zcRender() {
    const todos = chqLista.filter(zcEs);
    const anio = zcAnios($('zc-anio'), todos);
    const tipo = $('zc-tipo').value, q = $('zc-buscar').value.trim().toLowerCase();
    const lista = todos.filter((c) => (!anio || String(c.fecha || '').startsWith(anio)) && (!tipo || c.metodo === tipo) && !c.anulado &&
      (!q || (c.a || '').toLowerCase().includes(q) || (c.memo || '').toLowerCase().includes(q) || (c.conf || '').toLowerCase().includes(q)))
      .sort((a, b) => (b.fecha || '').localeCompare(a.fecha || ''));
    const porP = new Map();
    lista.forEach((c) => {
      const k = (c.a || '').trim().toLowerCase() || '—';
      if (!porP.has(k)) porP.set(k, { nombre: (c.a || '').trim() || 'Sin nombre', z: 0, cash: 0, n: 0 });
      const g = porP.get(k); g.n++; if (c.metodo === 'cash') g.cash += Number(c.monto) || 0; else g.z += Number(c.monto) || 0;
    });
    const grupos = [...porP.values()].map((g) => Object.assign(g, { total: g.z + g.cash })).sort((a, b) => b.total - a.total);
    const tz = grupos.reduce((t, g) => t + g.z, 0), tc = grupos.reduce((t, g) => t + g.cash, 0);
    $('zc-resumen').innerHTML = (lista.length ? `<div class="pay-stats">
        <div class="pay-stat"><div class="l">Zelle${anio ? ' ' + anio : ''}</div><div class="v">${nomFmt(tz)}</div></div>
        <div class="pay-stat"><div class="l">Cash${anio ? ' ' + anio : ''}</div><div class="v">${nomFmt(tc)}</div></div></div>` : '') +
      payPersonasHTML('zc', grupos, 'Total por persona', (g) => g.z && g.cash ? ` · Zelle ${nomFmt(g.z)} · Cash ${nomFmt(g.cash)}` : '', true);
    payPersonasRecordar($('zc-resumen'));
    $('zc-resumen').querySelectorAll('.pay-per').forEach((d) => d.addEventListener('click', (e) => { if (e.target.closest('.pay-per-del')) return; $('zc-buscar').value = d.dataset.n === 'Sin nombre' ? '' : d.dataset.n; zcRender(); }));
    // Borrar todos los pagos (Zelle/Cash) de una persona, de lo que se está viendo
    $('zc-resumen').querySelectorAll('.pay-per-del').forEach((b) => b.addEventListener('click', async (e) => {
      e.stopPropagation();
      const nombre = b.dataset.n;
      const clave = nombre === 'Sin nombre' ? '' : nombre.toLowerCase();
      const ids = new Set(lista.filter((c) => (c.a || '').trim().toLowerCase() === clave).map((c) => c.id));
      if (!ids.size) return;
      const total = lista.filter((c) => ids.has(c.id)).reduce((t, c) => t + (Number(c.monto) || 0), 0);
      const que = tipo === 'cash' ? 'pago(s) en Cash' : (tipo === 'zelle' ? 'Zelle' : 'pago(s) de Zelle y Cash');
      if (!await gcConfirm(`¿Borrar los ${ids.size} ${que} de ${nombre}${anio ? ' en ' + anio : ''}?\n\nSon ${nomFmt(total)}. Se quitan para siempre. Los cheques no se tocan.`, { okText: 'Borrar ' + ids.size, danger: true })) return;
      chqLista = chqLista.filter((x) => !ids.has(x.id));
      try { await chqGuardarLista(); toast(`${ids.size} pago(s) de ${nombre} borrados`, 'success'); } catch (err) { toast('No se pudo borrar', 'error'); }
      if ($('zc-buscar').value.trim().toLowerCase() === clave) $('zc-buscar').value = '';
      zcRender(); payResumen();
    }));
    document.querySelectorAll('[data-zc-tipo]').forEach((b) => b.classList.toggle('on', b.dataset.zcTipo === tipo));
    $('zc-empty').style.display = lista.length ? 'none' : 'block';
    $('zc-tbl').style.display = lista.length ? 'block' : 'none';
    $('zc-tbody').innerHTML = payListaPorMes(lista, (c) => payFilaHTML(c, `
      <button type="button" class="pay-act zc-ed" data-id="${escapeHtml(c.id)}">${PAY_SVG.ed} Editar</button>
      <button type="button" class="pay-act peligro zc-del" data-id="${escapeHtml(c.id)}">${PAY_SVG.del} Borrar</button>`), { id: 'zc', todosAbiertos: !!$('zc-buscar').value.trim() || lista.length <= 12 });
    payActivarFilas($('zc-tbody'));
    $('zc-tbody').querySelectorAll('.zc-ed').forEach((b) => b.addEventListener('click', () => zcAbrir(chqLista.find((x) => x.id === b.dataset.id))));
    $('zc-tbody').querySelectorAll('.zc-del').forEach((b) => b.addEventListener('click', async () => {
      const c = chqLista.find((x) => x.id === b.dataset.id); if (!c) return;
      if (!await gcConfirm(`¿Borrar este ${c.metodo === 'cash' ? 'pago en cash' : 'Zelle'} a ${c.a || 'sin nombre'} (${nomFmt(c.monto)})?`, { okText: 'Borrar', danger: true })) return;
      chqLista = chqLista.filter((x) => x.id !== c.id);
      try { await chqGuardarLista(); toast('Borrado'); } catch (e) { toast('No se pudo borrar', 'error'); }
      zcRender();
    }));
  }
  function zcAbrir(c) {
    zcEditandoId = c ? c.id : null;
    $('zc-form-titulo').textContent = c ? 'Editar pago' : 'Agregar pago';
    $('zc-tipo-f').value = c ? (c.metodo === 'cash' ? 'cash' : 'zelle') : ($('zc-tipo').value || 'zelle');
    $('zc-fecha').value = c ? (c.fecha || '') : nomToday();
    $('zc-monto').value = c ? (Number(c.monto) || 0).toFixed(2) : '';
    $('zc-a').value = c ? (c.a || '') : '';
    $('zc-memo').value = c ? (c.memo || '') : '';
    $('zc-form').style.display = 'block';
    (c ? $('zc-monto') : $('zc-a')).focus();
  }
  async function zcGuardar() {
    const monto = Math.round((parseFloat($('zc-monto').value) || 0) * 100) / 100;
    const a = $('zc-a').value.replace(/\s+/g, ' ').trim();
    if (!a) { toast('Escribe a quién se le pagó', 'error'); $('zc-a').focus(); return; }
    if (!(monto > 0)) { toast('Escribe la cantidad', 'error'); $('zc-monto').focus(); return; }
    const datos = { metodo: $('zc-tipo-f').value, fecha: $('zc-fecha').value || nomToday(), a, monto, memo: $('zc-memo').value.trim(), numero: null };
    if (zcEditandoId) { const c = chqLista.find((x) => x.id === zcEditandoId); if (c) Object.assign(c, datos); }
    else chqLista.push(Object.assign({ id: Date.now().toString() + '-' + Math.random().toString(36).slice(2, 7), manual: true, creadoEn: new Date().toISOString(), base: chqBaseActual() }, datos));
    try { await chqGuardarLista(); toast(zcEditandoId ? 'Pago actualizado' : 'Pago agregado'); } catch (e) { toast('No se pudo guardar', 'error'); return; }
    const era = zcEditandoId; zcEditandoId = null;
    if (era) $('zc-form').style.display = 'none';
    else { $('zc-monto').value = ''; $('zc-a').value = ''; $('zc-memo').value = ''; $('zc-a').focus(); }
    zcRender();
  }
  $('zc-btn-nuevo').addEventListener('click', () => zcAbrir(null));
  $('zc-cancelar').addEventListener('click', () => { zcEditandoId = null; $('zc-form').style.display = 'none'; });
  $('zc-guardar').addEventListener('click', zcGuardar);
  ['zc-fecha', 'zc-monto', 'zc-a', 'zc-memo'].forEach((id) => $(id).addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); zcGuardar(); } }));
  ['zc-buscar'].forEach((id) => $(id).addEventListener('input', zcRender));
  ['zc-anio', 'zc-tipo'].forEach((id) => $(id).addEventListener('change', zcRender));


  // ===================== 1099 =====================
  // Datos de cada persona para el 1099 (W-9): dirección, número de taxes,
  // si es compañía y si NO le toca 1099. Clave "__": solo el admin la ve.
  const R99_INFO_KEY = '__gh-1099-info';
  let r99Info = {};
  let r99InfoCargada = false;
  async function r99CargarInfo() {
    if (r99InfoCargada) return;
    try { const r = await window.storage.get(R99_INFO_KEY); const v = JSON.parse(r.value); if (v && typeof v === 'object') r99Info = v; } catch (e) {}
    r99InfoCargada = true;
  }
  async function r99GuardarInfo() { await window.storage.set(R99_INFO_KEY, JSON.stringify(r99Info)); }
  const r99Clave = (n) => String(n || '').replace(/\s+/g, ' ').trim().toLowerCase();
  const MESES_CORTOS = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];

  function r99Datos() {
    const anio = $('r99-anio').value || String(new Date().getFullYear());
    const umbral = Number(chqCfg.umbral1099 != null ? chqCfg.umbral1099 : 2000) || 0;
    const porP = new Map();
    chqLista.filter((c) => !c.anulado && String(c.fecha || '').startsWith(anio)).forEach((c) => {
      const nombre = (c.a || '').trim() || 'Sin nombre';
      const k = r99Clave(nombre);
      if (!porP.has(k)) porP.set(k, { clave: k, nombre, cheque: 0, zelle: 0, cash: 0, pagos: [], meses: new Array(12).fill(0) });
      const g = porP.get(k);
      const m = c.metodo === 'zelle' ? 'zelle' : (c.metodo === 'cash' ? 'cash' : 'cheque');
      const monto = Number(c.monto) || 0;
      g[m] += monto; g.pagos.push(c);
      const mes = Number(String(c.fecha || '').slice(5, 7)) - 1; if (mes >= 0 && mes < 12) g.meses[mes] += monto;
    });
    const filas = [...porP.values()].map((g) => {
      const info = r99Info[g.clave] || {};
      const total = g.cheque + g.zelle + g.cash;
      const sinNombre = g.nombre === 'Sin nombre';
      return Object.assign(g, { total, info, excluido: !!info.excluir, lleva: !sinNombre && !info.excluir && total >= umbral, w9: !!(info.tin && info.dir) });
    }).sort((a, b) => b.total - a.total);
    return { anio, umbral, filas };
  }
  function r99LlenarAnios() {
    const prev = $('r99-anio').value;
    const anios = [...new Set(chqLista.map((c) => String(c.fecha || '').slice(0, 4)).filter(Boolean).concat([String(new Date().getFullYear())]))].sort().reverse();
    $('r99-anio').innerHTML = anios.map((a) => `<option value="${a}">${a}</option>`).join('');
    $('r99-anio').value = anios.includes(prev) ? prev : anios[0];
  }
  function r99Render() {
    if (!$('r99-anio').dataset.ok) { r99LlenarAnios(); $('r99-anio').dataset.ok = '1'; }
    $('r99-umbral').value = chqCfg.umbral1099 != null ? chqCfg.umbral1099 : 2000;
    const { anio, umbral, filas } = r99Datos();
    const vis = $('r99-solo').checked ? filas.filter((f) => f.lleva) : filas;
    const llevan = filas.filter((f) => f.lleva);
    const faltaW9 = llevan.filter((f) => !f.w9).length;
    const sinNombre = filas.find((f) => f.nombre === 'Sin nombre');
    const totalAnio = filas.reduce((t, f) => t + f.total, 0);
    $('r99-resumen').innerHTML = `<div class="pay-stats">
      <div class="pay-stat"><div class="l">Pagado ${anio}</div><div class="v">${nomFmt(totalAnio)}</div></div>
      <div class="pay-stat"><div class="l">Llevan 1099</div><div class="v">${llevan.length}</div></div>
      <div class="pay-stat ${faltaW9 ? 'rojo' : (llevan.length ? 'verde' : '')}"><div class="l">W-9</div><div class="v">${faltaW9 ? faltaW9 + ' faltan' : (llevan.length ? 'Completo' : '—')}</div></div>
      ${sinNombre ? `<div class="pay-stat rojo"><div class="l">Sin nombre</div><div class="v">${sinNombre.pagos.length}</div></div>` : ''}</div>`;
    const selK = $('r99-detalle').dataset.k || '';
    $('r99-tbody').innerHTML = vis.length ? `<div class="pay-grupo">${vis.map((f) => {
      const partes = [f.cheque ? 'Cheques ' + nomFmt(f.cheque) : '', f.zelle ? 'Zelle ' + nomFmt(f.zelle) : '', f.cash ? 'Cash ' + nomFmt(f.cash) : ''].filter(Boolean).join(' · ');
      const chip = f.excluido ? '<span class="pay-tag">No le toca</span>'
        : (f.lleva ? (f.w9 ? '<span class="pay-tag verde">1099 · W-9 ✓</span>' : '<span class="pay-tag rojo">1099 · falta W-9</span>') : '');
      return `<div class="pay-row${f.clave === selK ? ' sel' : ''}"${f.excluido ? ' style="opacity:.6;"' : ''}>
        <button type="button" class="pay-row-main r99-f" data-k="${escapeHtml(f.clave)}">
          <div class="pay-ico per">${f.nombre === 'Sin nombre' ? '?' : payIniciales(f.nombre)}</div>
          <span class="pay-row-txt"><span class="pay-row-nom${f.nombre === 'Sin nombre' ? ' sin' : ''}">${escapeHtml(f.nombre)}${f.info.compania ? '<span class="pay-tag">compañía</span>' : ''}</span><span class="pay-row-meta wrap">${partes}</span></span>
          <span class="pay-row-der"><span class="pay-row-amt">${nomFmt(f.total)}</span>${chip}</span><span class="pay-chev der"></span>
        </button></div>`;
    }).join('')}</div>` : '<div class="gc-empty">No hay pagos en ese año.</div>';
    $('r99-tbody').querySelectorAll('.r99-f').forEach((tr) => tr.addEventListener('click', () => { r99Detalle(tr.dataset.k); $('r99-tbody').querySelectorAll('.pay-row').forEach((r) => r.classList.toggle('sel', r.contains(tr))); }));
    if ($('r99-detalle').dataset.k) r99Detalle($('r99-detalle').dataset.k, true);
  }
  function r99Detalle(clave, sinScroll) {
    const { anio, filas } = r99Datos();
    const f = filas.find((x) => x.clave === clave);
    const box = $('r99-detalle');
    if (!f) { box.innerHTML = ''; box.dataset.k = ''; return; }
    box.dataset.k = clave;
    const info = f.info || {};
    const max = Math.max(1, ...f.meses);
    const pagos = f.pagos.slice().sort((a, b) => (a.fecha || '').localeCompare(b.fecha || ''));
    const inp = 'width:100%;padding:8px 10px;border:1.5px solid var(--border);border-radius:8px;font-size:15px;background:var(--card);color:var(--ink);';
    box.innerHTML = `<div class="pay-form" style="margin:0;background:var(--card);box-shadow:var(--shadow-sm);">
      <div style="display:flex;justify-content:space-between;gap:10px;flex-wrap:wrap;align-items:baseline;">
        <div style="font-weight:800;font-size:16px;">${escapeHtml(f.nombre)}</div>
        <div style="font-weight:800;font-size:18px;">${nomFmt(f.total)} <span style="font-size:12px;color:var(--muted);font-weight:600;">${anio}</span></div>
      </div>
      <div class="pay-meses" style="margin:10px 0 4px;">${f.meses.map((v, i) => `<div class="pay-mes" title="${MESES_CORTOS[i]}: ${nomFmt(v)}"><div class="b" style="height:${Math.round(v / max * 72)}px;${v ? '' : 'opacity:.25;'}"></div><div class="m">${MESES_CORTOS[i]}</div></div>`).join('')}</div>
      ${f.nombre !== 'Sin nombre' ? `
      <div style="margin-top:12px;padding-top:12px;border-top:1px solid var(--border-soft);">
        <div style="font-weight:700;font-size:13.5px;margin-bottom:8px;">Datos para el 1099 (W-9)</div>
        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:10px;">
          <label style="font-size:12px;color:var(--muted);">Número de taxes (SSN, ITIN o EIN)<span style="display:flex;gap:6px;align-items:center;"><input type="password" id="r99-i-tin" value="${escapeHtml(info.tin || '')}" autocomplete="off" spellcheck="false" style="${inp};flex:1;min-width:0;"><button type="button" class="gc-action-btn" id="r99-i-tin-ver" style="padding:6px 10px;font-size:12px;margin-top:4px;">Mostrar</button></span></label>
          <label style="font-size:12px;color:var(--muted);">Dirección<input type="text" id="r99-i-dir" value="${escapeHtml(info.dir || '')}" autocomplete="off" style="${inp}"></label>
          <label style="font-size:12px;color:var(--muted);">Ciudad, estado y ZIP<input type="text" id="r99-i-ciudad" value="${escapeHtml(info.ciudad || '')}" autocomplete="off" style="${inp}"></label>
        </div>
        <div style="display:flex;flex-wrap:wrap;gap:8px 18px;margin-top:10px;font-size:13.5px;">
          <label style="display:flex;align-items:center;gap:8px;cursor:pointer;"><input type="checkbox" id="r99-i-comp" ${info.compania ? 'checked' : ''} style="width:18px;height:18px;"> Es compañía</label>
          <label style="display:flex;align-items:center;gap:8px;cursor:pointer;"><input type="checkbox" id="r99-i-excl" ${info.excluir ? 'checked' : ''} style="width:18px;height:18px;"> No le toca 1099 (ej. yo mismo, corporación)</label>
        </div>
        <div style="display:flex;justify-content:flex-end;gap:8px;flex-wrap:wrap;margin-top:10px;"><button type="button" class="gc-action-btn" id="r99-i-hoja">Imprimir hoja 1099</button><button type="button" class="gc-save-btn" id="r99-i-guardar">Guardar datos</button></div>
      </div>` : '<p style="font-size:12.5px;color:var(--ember);margin-top:10px;">Ponle nombre a estos pagos en Cheques o en Zelle y Cash.</p>'}
      <div style="margin-top:12px;padding-top:8px;border-top:1px solid var(--border-soft);">
        ${pagos.map((c) => `<div style="display:flex;justify-content:space-between;gap:10px;padding:5px 0;border-bottom:1px solid var(--border-soft);font-size:13px;">
          <span>${escapeHtml(chqFechaUS(c.fecha))} · ${c.metodo === 'zelle' ? 'Zelle' : (c.metodo === 'cash' ? 'Cash' : 'Cheque #' + escapeHtml(String(c.numero || '')))}${c.base ? ` <span style="color:var(--muted);font-size:11.5px;">· ${escapeHtml(c.base)}</span>` : ''}</span><span>${nomFmt(c.monto)}</span></div>`).join('')}
      </div></div>`;
    const ver = $('r99-i-tin-ver');
    if (ver) ver.addEventListener('click', () => {
      const i = $('r99-i-tin'); const mostrar = i.type === 'password';
      i.type = mostrar ? 'text' : 'password'; ver.textContent = mostrar ? 'Ocultar' : 'Mostrar';
      if (mostrar) setTimeout(() => { if (i.isConnected) { i.type = 'password'; ver.textContent = 'Mostrar'; } }, 20000);
    });
    const g = $('r99-i-guardar');
    if (g) g.addEventListener('click', async () => {
      r99Info[clave] = Object.assign({}, r99Info[clave] || {}, {
        nombre: f.nombre,
        tin: $('r99-i-tin').value.trim(), dir: $('r99-i-dir').value.trim(), ciudad: $('r99-i-ciudad').value.trim(),
        compania: $('r99-i-comp').checked, excluir: $('r99-i-excl').checked
      });
      try { await r99GuardarInfo(); toast('Datos guardados'); } catch (e) { toast('No se pudo guardar', 'error'); return; }
      r99Render(); payResumen();
    });
    const hj = $('r99-i-hoja');
    if (hj) hj.addEventListener('click', () => ghImprimirEnVentana(r99HojaHTML(f, anio), '1099 ' + f.nombre + ' ' + anio));
    if (!sinScroll) box.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }
  // Hoja de apoyo para el contador: quién paga, a quién, cuánto y cuándo.
  // (No es el formulario oficial del IRS — trae los datos para llenarlo.)
  function r99HojaHTML(f, anio) {
    const info = f.info || {};
    const pagos = f.pagos.slice().sort((a, b) => (a.fecha || '').localeCompare(b.fecha || ''));
    const met = (c) => c.metodo === 'zelle' ? 'Zelle' : (c.metodo === 'cash' ? 'Cash' : 'Cheque #' + (c.numero || ''));
    const dir = [info.dir, info.ciudad].filter(Boolean).join(', ');
    return `<h1>${escapeHtml(cfgFacturaNombre || 'GUZMAN HVAC')}</h1>
      ${cfgFacturaDireccion ? `<div class="ps-addr">${escapeHtml(cfgFacturaDireccion)}</div>` : ''}
      <div class="ps-badge">Pagos a contratista ${anio} — hoja de apoyo para el formulario 1099-NEC</div>
      <h2>Quien recibió el pago</h2>
      <table><tbody>
        <tr><td style="width:34%;">Nombre</td><td><strong>${escapeHtml(f.nombre)}</strong>${info.compania ? ' (compañía)' : ''}</td></tr>
        <tr><td>Número de taxes (SSN / ITIN / EIN)</td><td>${escapeHtml(info.tin || '— falta —')}</td></tr>
        <tr><td>Dirección</td><td>${escapeHtml(dir || '— falta —')}</td></tr>
      </tbody></table>
      <h2>Total pagado en ${anio}</h2>
      <table><tbody>
        <tr><td>Cheques</td><td class="num">${nomFmt(f.cheque)}</td></tr>
        <tr><td>Zelle</td><td class="num">${nomFmt(f.zelle)}</td></tr>
        <tr><td>Cash</td><td class="num">${nomFmt(f.cash)}</td></tr>
      </tbody><tfoot><tr class="ps-total"><td>Total (casilla 1 — compensación a no empleados)</td><td class="num">${nomFmt(f.total)}</td></tr></tfoot></table>
      <h2>Detalle de pagos</h2>
      <table><thead><tr><th>Fecha</th><th>Forma de pago</th><th>Nota</th><th class="num">Monto</th></tr></thead>
        <tbody>${pagos.map((c) => `<tr><td>${escapeHtml(chqFechaUS(c.fecha))}</td><td>${escapeHtml(met(c))}</td><td>${escapeHtml(c.memo || '')}</td><td class="num">${nomFmt(c.monto)}</td></tr>`).join('')}</tbody></table>
      <div class="ps-addr" style="margin-top:14px;">Documento interno de apoyo. No es el formulario oficial del IRS.</div>`;
  }
  function r99HTML() {
    const { anio, umbral, filas } = r99Datos();
    const vis = $('r99-solo').checked ? filas.filter((f) => f.lleva) : filas;
    return `<h1>${escapeHtml(cfgFacturaNombre || 'GUZMAN HVAC')}</h1>
      <div class="ps-addr">Pagos por persona ${anio} (cheques, Zelle y cash) · límite 1099: ${nomFmt(umbral)}</div>
      <table><thead><tr><th>Persona</th><th>Dirección</th><th class="num">Cheques</th><th class="num">Zelle</th><th class="num">Cash</th><th class="num">Total</th><th>1099</th></tr></thead>
      <tbody>${vis.map((f) => `<tr><td>${escapeHtml(f.nombre)}${f.info.compania ? ' (compañía)' : ''}</td><td>${escapeHtml([f.info.dir, f.info.ciudad].filter(Boolean).join(', '))}</td><td class="num">${nomFmt(f.cheque)}</td><td class="num">${nomFmt(f.zelle)}</td><td class="num">${nomFmt(f.cash)}</td><td class="num"><strong>${nomFmt(f.total)}</strong></td><td>${f.excluido ? 'No le toca' : (f.lleva ? 'Sí' : 'No')}</td></tr>`).join('')}</tbody>
      <tfoot><tr class="ps-total"><td>Total</td><td></td><td class="num">${nomFmt(vis.reduce((t, f) => t + f.cheque, 0))}</td><td class="num">${nomFmt(vis.reduce((t, f) => t + f.zelle, 0))}</td><td class="num">${nomFmt(vis.reduce((t, f) => t + f.cash, 0))}</td><td class="num">${nomFmt(vis.reduce((t, f) => t + f.total, 0))}</td><td></td></tr></tfoot></table>`;
  }
  $('r99-anio').addEventListener('change', () => { $('r99-detalle').innerHTML = ''; $('r99-detalle').dataset.k = ''; r99Render(); });
  $('r99-solo').addEventListener('change', r99Render);
  $('r99-umbral').addEventListener('change', async () => {
    chqCfg.umbral1099 = Math.max(0, Number($('r99-umbral').value) || 0);
    try { await chqGuardarCfg(); } catch (e) {}
    r99Render(); payResumen();
  });
  $('r99-imprimir').addEventListener('click', () => ghImprimirEnVentana(r99HTML(), '1099 ' + $('r99-anio').value));
  $('r99-hojas').addEventListener('click', () => {
    const { anio, filas } = r99Datos();
    const llevan = filas.filter((f) => f.lleva);
    if (!llevan.length) { toast('Nadie llega al límite del 1099 todavía', 'info'); return; }
    ghImprimirEnVentana(llevan.map((f) => `<div class="gh-doc" style="page-break-after:always;">${r99HojaHTML(f, anio)}</div>`).join(''), `Hojas 1099 ${anio} (${llevan.length})`);
  });
  $('r99-csv').addEventListener('click', () => {
    const { anio, filas } = r99Datos();
    const q = (v) => '"' + String(v == null ? '' : v).replace(/"/g, '""') + '"';
    const csv = ['Persona,Compania,Numero de taxes,Direccion,Ciudad estado ZIP,Cheques,Zelle,Cash,Total,1099']
      .concat(filas.map((f) => [q(f.nombre), f.info.compania ? 'Si' : 'No', q(f.info.tin), q(f.info.dir), q(f.info.ciudad),
        f.cheque.toFixed(2), f.zelle.toFixed(2), f.cash.toFixed(2), f.total.toFixed(2), f.excluido ? 'No le toca' : (f.lleva ? 'Si' : 'No')].join(','))).join('\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
    const a = document.createElement('a'); a.href = url; a.download = `pagos-1099-${anio}.csv`; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  });

  // ===================== RESUMEN DE PAYROLL =====================
  function payResumen() {
    const anio = String(new Date().getFullYear());
    const del = chqLista.filter((c) => !c.anulado && String(c.fecha || '').startsWith(anio));
    const suma = (m) => del.filter((c) => (c.metodo || 'cheque') === m).reduce((t, c) => t + (Number(c.monto) || 0), 0);
    const tCh = suma('cheque'), tZ = suma('zelle'), tCa = suma('cash');
    const nCh = del.filter((c) => (c.metodo || 'cheque') === 'cheque').length;
    const sinNombre = chqLista.filter((c) => !c.anulado && !(c.a || '').trim()).length;
    let llevan = 0, faltaW9 = 0;
    try {
      const prev = $('r99-anio').value; if (!$('r99-anio').options.length) r99LlenarAnios();
      $('r99-anio').value = anio;
      const d = r99Datos(); llevan = d.filas.filter((f) => f.lleva).length; faltaW9 = d.filas.filter((f) => f.lleva && !f.w9).length;
      if (prev) $('r99-anio').value = prev;
    } catch (e) {}
    $('pay-res-anio').textContent = anio;
    const total = tCh + tZ + tCa;
    const pct = (v) => (total > 0 ? Math.max(v > 0 ? 1.5 : 0, v / total * 100) : 0);
    const ley = [['ch', 'Cheques', tCh], ['ze', 'Zelle', tZ], ['ca', 'Cash', tCa]];
    const hoyMes = new Date().getMonth();
    const meses = new Array(12).fill(0);
    del.forEach((c) => { const m = Number(String(c.fecha || '').slice(5, 7)) - 1; if (m >= 0 && m < 12) meses[m] += Number(c.monto) || 0; });
    const esteMes = meses[hoyMes], mesPasado = hoyMes > 0 ? meses[hoyMes - 1] : 0;
    $('pay-kpis').innerHTML = `
      <div class="pay-hero-main">
        <div class="pay-hero-lbl">Pagado en ${anio}</div>
        <div class="pay-hero-total">${nomFmt(total)}</div>
        <div class="pay-mix" role="img" aria-label="Cheques ${nomFmt(tCh)}, Zelle ${nomFmt(tZ)}, Cash ${nomFmt(tCa)}">${total > 0 ? ley.map(([k, , v]) => v > 0 ? `<i class="${k}" style="width:${pct(v).toFixed(2)}%"></i>` : '').join('') : '<i class="vacio"></i>'}</div>
        <div class="pay-mix-ley">${ley.map(([k, n, v]) => `<span><b class="pay-dot ${k}"></b>${n}<em>${nomFmt(v)}</em></span>`).join('')}</div>
      </div>
      <div class="pay-hero-tiles">
        <button type="button" class="pay-kpi click" data-ir="guardados"><span class="l">Cheques</span><span class="v">${nCh}</span><span class="s">Próximo #${chqSiguienteNumero()}</span></button>
        <button type="button" class="pay-kpi click ${sinNombre ? 'alerta' : 'ok'}" data-ir="sin-nombre"><span class="l">Sin nombre</span><span class="v">${sinNombre}</span><span class="s">${sinNombre ? 'Toca para arreglar' : 'Todos ✓'}</span></button>
        <button type="button" class="pay-kpi click ${faltaW9 ? 'alerta' : (llevan ? 'ok' : '')}" data-ir="r1099"><span class="l">Llevan 1099</span><span class="v">${llevan}</span><span class="s">${faltaW9 ? faltaW9 + ' sin W-9' : (llevan ? 'Con W-9 ✓' : 'Ninguno todavía')}</span></button>
      </div>`;
    $('pay-kpis').querySelectorAll('.pay-kpi.click').forEach((k) => k.addEventListener('click', () => {
      const ir = k.dataset.ir;
      if (ir === 'sin-nombre') {
        const hayCh = chqLista.some((c) => !c.anulado && !(c.a || '').trim() && (c.metodo || 'cheque') === 'cheque');
        const sub = hayCh ? 'guardados' : 'zelle';
        payMostrar(sub); payAbrir(sub).then(() => { if (sub === 'guardados') { $('chq-sin-nombre').checked = true; chqRenderLista(); $('chq-tbl').scrollIntoView({ behavior: 'smooth' }); } });
      } else { payMostrar(ir); payAbrir(ir); }
    }));
    const max = Math.max(1, ...meses);
    $('pay-meses').innerHTML = `<div class="pay-hero-meses-hd"><span>Por mes</span><span>Este mes <b>${nomFmt(esteMes)}</b>${hoyMes > 0 ? ` · ${MESES_CORTOS[hoyMes - 1]} <b>${nomFmt(mesPasado)}</b>` : ''}</span></div>
      <div class="pay-meses">${meses.map((v, i) => `<div class="pay-mes${i === hoyMes ? ' hoy' : ''}${i > hoyMes ? ' futuro' : ''}" title="${MESES_CORTOS[i]}: ${nomFmt(v)}"><div class="bw"><div class="b" style="height:${v ? Math.max(4, Math.round(v / max * 100)) : 0}%"></div></div><div class="m">${MESES_CORTOS[i].slice(0, 1)}<span>${MESES_CORTOS[i].slice(1)}</span></div></div>`).join('')}</div>`;
  }

  // ===================== UNIR NOMBRES =====================
  function payUnirRender() {
    const q = $('pay-unir-buscar').value.trim().toLowerCase();
    const marcados = new Set([...document.querySelectorAll('#pay-unir-lista .pu-cb:checked')].map((c) => c.value));
    const porN = new Map();
    chqLista.forEach((c) => {
      const n = (c.a || '').replace(/\s+/g, ' ').trim(); if (!n) return;
      const k = n.toLowerCase();
      if (!porN.has(k)) porN.set(k, { k, nombres: new Map(), n: 0, total: 0 });
      const g = porN.get(k); g.n++; if (!c.anulado) g.total += Number(c.monto) || 0;
      g.nombres.set(n, (g.nombres.get(n) || 0) + 1);
    });
    const lista = [...porN.values()].map((g) => Object.assign(g, { nombre: [...g.nombres.entries()].sort((a, b) => b[1] - a[1])[0][0] }))
      .filter((g) => !q || g.k.includes(q) || marcados.has(g.k)).sort((a, b) => a.nombre.localeCompare(b.nombre));
    $('pay-unir-lista').innerHTML = lista.map((g) => `<label style="display:flex;align-items:center;gap:10px;padding:7px 0;border-bottom:1px solid var(--border-soft);cursor:pointer;font-size:14px;">
      <input type="checkbox" class="pu-cb" value="${escapeHtml(g.k)}" data-n="${escapeHtml(g.nombre)}" ${marcados.has(g.k) ? 'checked' : ''} style="width:18px;height:18px;">
      <span style="flex:1;min-width:0;">${escapeHtml(g.nombre)} <span style="font-size:12px;color:var(--muted);">· ${g.n} pago${g.n === 1 ? '' : 's'}</span></span><strong style="white-space:nowrap;">${nomFmt(g.total)}</strong></label>`).join('')
      || '<div style="color:var(--muted);padding:8px 0;">No hay nombres.</div>';
    $('pay-unir-lista').querySelectorAll('.pu-cb').forEach((cb) => cb.addEventListener('change', () => {
      const sel = [...document.querySelectorAll('#pay-unir-lista .pu-cb:checked')];
      if (sel.length && !$('pay-unir-nombre').value.trim()) $('pay-unir-nombre').value = sel[0].dataset.n;
    }));
  }
  $('pay-btn-unir').addEventListener('click', () => {
    const box = $('pay-unir');
    if (box.style.display === 'block') { box.style.display = 'none'; return; }
    box.style.display = 'block'; $('pay-unir-buscar').value = ''; $('pay-unir-nombre').value = ''; payUnirRender(); $('pay-unir-buscar').focus();
  });
  $('pay-unir-buscar').addEventListener('input', payUnirRender);
  $('pay-unir-cancelar').addEventListener('click', () => { $('pay-unir').style.display = 'none'; });
  $('pay-unir-ok').addEventListener('click', async () => {
    const sel = [...document.querySelectorAll('#pay-unir-lista .pu-cb:checked')].map((c) => c.value);
    const nuevo = $('pay-unir-nombre').value.replace(/\s+/g, ' ').trim();
    if (sel.length < 1) { toast('Marca los nombres que quieres unir', 'error'); return; }
    if (!nuevo) { toast('Escribe cómo debe quedar el nombre', 'error'); $('pay-unir-nombre').focus(); return; }
    const claves = new Set(sel);
    const afectados = chqLista.filter((c) => claves.has((c.a || '').replace(/\s+/g, ' ').trim().toLowerCase()));
    if (!await gcConfirm(`¿Cambiar ${afectados.length} pago(s) de ${sel.length} nombre(s) a "${nuevo}"?`, { okText: 'Unir' })) return;
    afectados.forEach((c) => { c.a = nuevo; });
    // Los datos del W-9 se pasan al nombre nuevo si este no tiene
    await r99CargarInfo();
    const kNuevo = r99Clave(nuevo);
    sel.forEach((k) => { if (k !== kNuevo && r99Info[k]) { if (!r99Info[kNuevo]) r99Info[kNuevo] = Object.assign({}, r99Info[k], { nombre: nuevo }); delete r99Info[k]; } });
    try { await chqGuardarLista(); await r99GuardarInfo(); toast(`Listo: ${afectados.length} pago(s) ahora dicen "${nuevo}"`, 'success', 3500); } catch (e) { toast('No se pudo guardar', 'error'); return; }
    $('pay-unir').style.display = 'none';
    payResumen();
    const act = document.querySelector('.pay-subtab.active'); if (act) payAbrir(act.dataset.psub);
  });

  // ===================== /ZELLE Y CASH · 1099 =====================
  // ===================== /CHEQUES =====================

