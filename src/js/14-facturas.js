  // ====================================================================

  // FIN MÓDULO PLANOS
  // ====================================================================

  const invToday = () => ghFechaLocal(new Date());

  // Sub-tabs de facturas
  document.querySelectorAll('.inv-subtab').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.inv-subtab').forEach(t => t.classList.remove('active'));
      document.querySelectorAll('.inv-subpanel').forEach(p => p.classList.remove('active'));
      tab.classList.add('active');
      $('inv-sub-' + tab.dataset.sub).classList.add('active');
      if (tab.dataset.sub === 'carpeta') invMostrarCarpeta(invCarpetaActual);
      if (tab.dataset.sub === 'guardadas') invRenderLista();
      if (tab.dataset.sub === 'cobros') invRenderCobros();
      if (tab.dataset.sub === 'colonias') invRenderColonias();
      if (tab.dataset.sub === 'clientes') invRenderClientes();
      if (tab.dataset.sub === 'trabajos') invRenderTrabajos();
    });
  });

  // Carpeta "Listas": Clientes, Trabajos y Colonias dentro de Facturas
  let invCarpetaActual = 'clientes';
  function invMostrarCarpeta(cual) {
    invCarpetaActual = cual;
    ['clientes', 'trabajos', 'colonias'].forEach((c) => $('inv-sub-' + c).classList.toggle('active', c === cual));
    document.querySelectorAll('.inv-carpeta-btn').forEach((b) => b.classList.toggle('active', b.dataset.carpeta === cual));
    if (cual === 'colonias') invRenderColonias();
    if (cual === 'clientes') invRenderClientes();
    if (cual === 'trabajos') invRenderTrabajos();
  }
  function invAbrirCarpeta(cual) {
    invCarpetaActual = cual;
    const t = document.querySelector(`.inv-subtab[data-sub="${cual}"]`); if (t) t.click();
  }
  document.querySelectorAll('.inv-carpeta-btn').forEach((b) => b.addEventListener('click', () => invMostrarCarpeta(b.dataset.carpeta)));

  async function invSaveInv() { await window.storage.set(INV_KEY, JSON.stringify(invDocs)); recDocs = null; if (typeof ghRenderRecords === 'function') ghRenderRecords(); }
  async function invSaveCol() { await window.storage.set(COL_KEY, JSON.stringify(invColonias)); invRefreshDlColonias(); }
  async function invSaveCli() { await window.storage.set(CLI_KEY, JSON.stringify(invClientes)); invRefreshDlClientes(); }
  async function invSaveTrb() { await window.storage.set(TRB_KEY, JSON.stringify(invTrabajos)); invRefreshDlTrabajos(); }

  function invRefreshDlClientes() {
    const dl = document.getElementById('dl-clientes');
    if (dl) dl.innerHTML = invClientes.map(c=>`<option value="${escapeHtml(c)}">`).join('');
  }
  function invRefreshDlColonias() {
    const dl = document.getElementById('dl-colonias');
    if (dl) dl.innerHTML = invColonias.map(c=>`<option value="${escapeHtml(c)}">`).join('');
  }
  function invRefreshDlTrabajos() {
    const dl = document.getElementById('dl-trabajos');
    if (dl) dl.innerHTML = invTrabajos.map(t=>`<option value="${escapeHtml(trbNombre(t))}">`).join('');
    // también actualizar datalists en filas existentes
    document.querySelectorAll('.dl-trabajos-row').forEach(d => {
      d.innerHTML = invTrabajos.map(t=>`<option value="${escapeHtml(trbNombre(t))}">`).join('');
    });
  }

  function invColOpts(sel = '') {
    return ['<option value="" data-i18n="seleccionar">— Seleccionar —</option>',
      ...invColonias.map(c => `<option value="${escapeHtml(c)}"${c===sel?' selected':''}>${escapeHtml(c)}</option>`)
    ].join('');
  }

  function invRefreshSelects() {
    document.querySelectorAll('.dl-colonias-row').forEach(d => {
      d.innerHTML = invColonias.map(c=>`<option value="${escapeHtml(c)}">`).join('');
    });
  }

  function invCrearFila(item) {
    item = item || {};
    const tr = document.createElement('tr');
    tr.dataset.f = ++invFilaC;

    const mkTd = () => document.createElement('td');
    const mkIn = (cls, ph, val) => { const i=document.createElement('input'); i.type='text'; i.className=cls; i.placeholder=ph; i.value=val||''; return i; };

    const numTd = mkTd(); numTd.className='inv-num-c'; numTd.textContent=invFilaC; tr.appendChild(numTd);

    // DATE: calendario real. Se guarda la fecha completa y en la factura
    // se imprime como MM-DD-YYYY (ej. 09-19-2026).
    const diaTd = mkTd();
    const diaSel = document.createElement('input');
    diaSel.type = 'date';
    diaSel.className = 'inv-dia';
    // Acepta lo guardado como fecha (nuevo) o como nombre de día (facturas viejas)
    diaSel.value = (item.dia && /^\d{4}-\d{2}-\d{2}$/.test(item.dia)) ? item.dia : '';
    diaTd.appendChild(diaSel); tr.appendChild(diaTd);

    const locTd=mkTd();
    const locDl=document.createElement('datalist'); locDl.className='dl-colonias-row'; locDl.id='dl-col-'+invFilaC;
    locDl.innerHTML = invColonias.map(c=>`<option value="${escapeHtml(c)}">`).join('');
    const locIn=mkIn('inv-loc','Colonia + lote (escribe o selecciona)',item.location);
    locIn.setAttribute('list','dl-col-'+invFilaC); locIn.autocomplete='off';
    locTd.appendChild(locDl); locTd.appendChild(locIn); tr.appendChild(locTd);
    const wrkTd=mkTd();
    const wrkDl=document.createElement('datalist'); wrkDl.className='dl-trabajos-row'; wrkDl.id='dl-trab-'+invFilaC;
    wrkDl.innerHTML = invTrabajos.map(t=>`<option value="${escapeHtml(trbNombre(t))}">`).join('');
    const wrkIn=mkIn('inv-work','Descripción del trabajo (escribe o selecciona)',item.work);
    wrkIn.setAttribute('list','dl-trab-'+invFilaC); wrkIn.autocomplete='off';
    wrkTd.appendChild(wrkDl); wrkTd.appendChild(wrkIn); tr.appendChild(wrkTd);
    const tonTd=mkTd(); tonTd.className='r';
    const tonIn=mkIn('inv-tons','—', item.tons||''); tonIn.inputMode='decimal'; tonIn.style.textAlign='right';
    const tonPista=document.createElement('div');
    tonPista.style.cssText='font-size:9.5px;color:var(--muted-soft);margin-top:2px;text-align:right;min-height:11px;';
    tonTd.appendChild(tonIn); tonTd.appendChild(tonPista); tr.appendChild(tonTd);
    const amtTd=mkTd(); amtTd.className='r'; const amtIn=mkIn('inv-amt','0.00',item.amount||''); amtIn.inputMode='decimal'; amtTd.appendChild(amtIn); tr.appendChild(amtTd);
    const delTd=mkTd(); delTd.className='inv-acc';
    const dupBtn=document.createElement('button'); dupBtn.type='button'; dupBtn.className='inv-mini'; dupBtn.title='Duplicar fecha y subdivisión en una línea nueva'; dupBtn.textContent='⧉';
    const csBtn=document.createElement('button'); csBtn.type='button'; csBtn.className='inv-mini'; csBtn.title='Usar esta subdivisión en Completion Sheets (Rough-In y Pull Sheet)'; csBtn.textContent='📋';
    const delBtn=document.createElement('button'); delBtn.className='gc-del'; delBtn.type='button'; delBtn.textContent='✕';
    try { if (!csActivo) csBtn.style.display = 'none'; } catch (e) {}
    delTd.appendChild(dupBtn); delTd.appendChild(csBtn); delTd.appendChild(delBtn); tr.appendChild(delTd);
    // Duplicar: misma fecha y subdivisión, justo debajo, sin volver a escribirlas
    dupBtn.addEventListener('click', () => {
      const nueva = invCrearFila({ dia: diaSel.value, location: locIn.value });
      tr.after(nueva); invRenumerar(); invCalcTotales();
      nueva.querySelector('.inv-work').focus();
    });
    // Pasar la subdivisión (y la fecha) de esta línea a las Completion Sheets
    csBtn.addEventListener('click', () => {
      const lote = locIn.value.trim();
      if (!lote) { toast('Esta línea no tiene subdivisión todavía', 'error'); return; }
      if (typeof csAplicarDesdeFactura === 'function') csAplicarDesdeFactura(lote, diaSel.value);
    });

    // Cálculo automático del monto según el trabajo elegido:
    //  - Si el trabajo se cobra POR TONELADA: monto = precio × toneladas.
    //  - Si es precio fijo: se pone ese precio tal cual.
    // En ambos casos el monto queda editable: si lo cambias a mano, se respeta
    // y ya no se vuelve a recalcular solo (para no pisarte lo que escribiste).
    let montoEditadoAMano = !!item.amount;
    amtIn.addEventListener('input', () => { montoEditadoAMano = true; });

    function recalcularMonto(forzar) {
      const t = trbBuscar(wrkIn.value);
      if (!t) return;
      const precio = trbPrecio(t);
      if (!precio) return;
      if (montoEditadoAMano && !forzar) return;
      if (trbPorTonelada(t)) {
        const tons = parseFloat((tonIn.value || '').replace(',', '.'));
        if (!tons || tons <= 0) return;          // sin toneladas todavía, no calcula
        amtIn.value = (precio * tons).toFixed(2);
      } else {
        amtIn.value = precio.toFixed(2);
      }
      invCalcTotales();
    }

    // Muestra debajo del campo de toneladas a cuánto se está cobrando, para
    // que se vea de inmediato si va a multiplicar o no (y por qué no).
    function actualizarPistaTons() {
      const t = trbBuscar(wrkIn.value);
      if (!t) { tonPista.textContent = ''; tonIn.placeholder = '—'; return; }
      if (trbPorTonelada(t)) {
        const p = trbPrecio(t);
        tonIn.placeholder = 'tons';
        tonPista.textContent = p ? `× ${invFmt(p)}/ton` : 'falta precio';
        tonPista.style.color = p ? 'var(--accent-dk)' : 'var(--ember)';
      } else {
        tonIn.placeholder = '—';
        tonPista.textContent = 'precio fijo';
        tonPista.style.color = 'var(--muted-soft)';
      }
    }

    wrkIn.addEventListener('change', () => {
      actualizarPistaTons();
      montoEditadoAMano = false;   // cambió el trabajo: recalcular
      recalcularMonto(true);
    });
    wrkIn.addEventListener('input', actualizarPistaTons);
    actualizarPistaTons();
    // Al escribir las toneladas, recalcula
    tonIn.addEventListener('input', () => { montoEditadoAMano = false; recalcularMonto(true); invCalcTotales(); });

    amtIn.addEventListener('input', invCalcTotales);
    delBtn.addEventListener('click', () => { tr.remove(); invRenumerar(); invCalcTotales(); });
    // Enter pasa al siguiente campo (antes guardaba la factura a medias)
    [locIn, wrkIn, tonIn, amtIn].forEach(i => i.addEventListener('keydown', e => {
      if (e.key !== 'Enter') return;
      e.preventDefault();
      const campos = [...$('inv-tbody').querySelectorAll('input')];
      const sig = campos[campos.indexOf(i) + 1];
      if (sig) sig.focus(); else $('inv-btn-add').click();
    }));

    return tr;
  }

  function invRenumerar() {
    $('inv-tbody').querySelectorAll('tr').forEach((tr,i) => tr.querySelector('.inv-num-c').textContent=i+1);
  }

  $('inv-btn-add').addEventListener('click', () => {
    const tr = invCrearFila();
    $('inv-tbody').appendChild(tr);
    invRenumerar();
    tr.querySelector('.inv-loc').focus();
    invCalcTotales();
  });

  // ---- Puente Calendario → Factura: trae Job #/Colonia-Lote/Descripción de
  // los trabajos agendados esta semana, sin tener que volver a escribirlos ----
  $('inv-btn-cargar-semana').addEventListener('click', async () => {
    await calCargarDatos();
    const lunes = calLunesDeSemana(calSemanaOffset);
    const domingo = new Date(lunes.getFullYear(), lunes.getMonth(), lunes.getDate() + 6);
    const inicioISO = calFechaISO(lunes), finISO = calFechaISO(domingo);
    const citasSemana = citas.filter((c) => c.fecha >= inicioISO && c.fecha <= finISO
      && (c.jobNum || c.loc || c.descripcion));
    if (!citasSemana.length) {
      toast('No hay trabajos agendados con datos esta semana (revisa la pestaña 📅 Calendario)', 'info', 3500);
      return;
    }
    citasSemana.forEach((c) => {
      const tr = invCrearFila({ location: c.loc || '', work: c.descripcion || '', dia: c.fecha || '' });
      $('inv-tbody').appendChild(tr);
    });
    invRenumerar();
    invCalcTotales();
    if (!$('inv-cliente').value.trim()) {
      const conCliente = citasSemana.find((c) => c.cliente);
      if (conCliente) $('inv-cliente').value = conCliente.cliente;
    }
    toast(`${citasSemana.length} trabajo(s) cargado(s) de esta semana ✓`);
  });

  function invCalcTotales() {
    let sub = 0;
    $('inv-tbody').querySelectorAll('.inv-amt').forEach(i => { sub += parseFloat((i.value||'0').replace(',','.'))||0; });
    // Suma de toneladas de todas las líneas (solo se muestra si hay alguna)
    let tons = 0;
    $('inv-tbody').querySelectorAll('.inv-tons').forEach(i => { tons += parseFloat((i.value||'0').replace(',','.'))||0; });
    if ($('inv-t-tons-row')) {
      $('inv-t-tons-row').style.display = tons > 0 ? '' : 'none';
      $('inv-t-tons').textContent = (Math.round(tons * 100) / 100).toString();
    }
    const pct = parseFloat($('inv-tax').value)||0;
    const tax = sub*pct/100;
    $('inv-t-sub').textContent = invFmt(sub);
    $('inv-t-tax').textContent = invFmt(tax);
    $('inv-t-total').textContent = invFmt(sub+tax);
    return {subtotal:sub, tax, total:sub+tax, taxPct:pct};
  }
  $('inv-tax').addEventListener('input', invCalcTotales);

  function invAutoNum() {
    // Solo número, consecutivo. Toma el número más alto ya usado y suma uno,
    // así no se repite aunque se borre alguna factura de en medio.
    let mayor = 0;
    (invDocs || []).forEach((d) => {
      const n = parseInt(String(d.numero || '').replace(/\D/g, ''), 10);
      if (!isNaN(n) && n > mayor) mayor = n;
    });
    return String(mayor + 1);
  }

  function invLimpiar() {
    $('inv-editando').value = '';
    $('inv-num').value = invAutoNum();
    $('inv-fecha').value = invToday();
    // Bill To NO se limpia: se mantiene hasta que el usuario lo cambie a propósito
    $('inv-direccion-emisor').value = cfgFacturaDireccion || '';
    $('inv-notas').value = '';
    $('inv-tax').value = '0';
    $('inv-tbody').innerHTML = '';
    invRellenarLineas();
    invRenumerar(); invCalcTotales();
  }
  // Una factura siempre empieza con 6 líneas listas para llenar (las vacías no se guardan)
  const INV_LINEAS_MIN = 6;
  function invRellenarLineas() {
    const tb = $('inv-tbody');
    while (tb.querySelectorAll('tr').length < INV_LINEAS_MIN) tb.appendChild(invCrearFila());
  }
  $('inv-btn-limpiar').addEventListener('click', () => { invBorradorBorrar(); invLimpiar(); });

  // ---- Borrador: lo que vas escribiendo en una factura se guarda en este
  // teléfono, así si se cierra la app (o se acaba la batería) no se pierde ----
  const invBorradorKey = () => ghLK('gh-inv-borrador');
  function invLeerFormulario() {
    const items = [];
    $('inv-tbody').querySelectorAll('tr').forEach((tr) => {
      const it = { dia: tr.querySelector('.inv-dia').value, location: tr.querySelector('.inv-loc').value, work: tr.querySelector('.inv-work').value,
        tons: tr.querySelector('.inv-tons').value, amount: tr.querySelector('.inv-amt').value };
      if (it.location || it.work || it.tons || it.amount) items.push(it);
    });
    return { editando: $('inv-editando').value, numero: $('inv-num').value, fecha: $('inv-fecha').value, cliente: $('inv-cliente').value,
      clienteDireccion: ($('inv-cliente-direccion') || {}).value || '', direccionEmisor: $('inv-direccion-emisor').value,
      notas: $('inv-notas').value, taxPct: $('inv-tax').value, items, en: Date.now() };
  }
  let invBorradorT = null;
  function invBorradorGuardar() {
    clearTimeout(invBorradorT);
    invBorradorT = setTimeout(() => {
      const b = invLeerFormulario();
      try {
        if (b.items.length || b.notas) localStorage.setItem(invBorradorKey(), JSON.stringify(b));
        else localStorage.removeItem(invBorradorKey());
      } catch (e) {}
    }, 400);
  }
  function invBorradorBorrar() { clearTimeout(invBorradorT); try { localStorage.removeItem(invBorradorKey()); } catch (e) {} }
  function invBorradorRestaurar() {
    let b = null;
    try { b = JSON.parse(localStorage.getItem(invBorradorKey()) || 'null'); } catch (e) {}
    if (!b || !Array.isArray(b.items) || (!b.items.length && !b.notas)) return false;
    if (Date.now() - (b.en || 0) > 30 * 86400000) { invBorradorBorrar(); return false; }
    $('inv-editando').value = b.editando && invDocs.some((i) => i.id === b.editando) ? b.editando : '';
    $('inv-num').value = b.numero || invAutoNum();
    $('inv-fecha').value = b.fecha || invToday();
    if (b.cliente) $('inv-cliente').value = b.cliente;
    if ($('inv-cliente-direccion') && b.clienteDireccion) $('inv-cliente-direccion').value = b.clienteDireccion;
    if (b.direccionEmisor) $('inv-direccion-emisor').value = b.direccionEmisor;
    $('inv-notas').value = b.notas || '';
    $('inv-tax').value = b.taxPct || '0';
    $('inv-tbody').innerHTML = '';
    b.items.forEach((it) => $('inv-tbody').appendChild(invCrearFila(it)));
    invRellenarLineas(); invRenumerar(); invCalcTotales();
    toast('Recuperé la factura que estabas haciendo ✓', 'info', 3500);
    return true;
  }
  const invForm = document.getElementById('inv-sub-nueva');
  if (invForm) { invForm.addEventListener('input', invBorradorGuardar); invForm.addEventListener('change', invBorradorGuardar); invForm.addEventListener('click', (e) => { if (e.target.closest('.gc-del, .inv-mini')) invBorradorGuardar(); }); }

  $('inv-btn-guardar').addEventListener('click', async () => {
    const num = $('inv-num').value.trim();
    if (!num) { toast('Agrega un número de factura', 'error'); return; }
    const items = [];
    $('inv-tbody').querySelectorAll('tr').forEach(tr => {
      const loc = tr.querySelector('.inv-loc').value;
      const work = tr.querySelector('.inv-work').value.trim();
      const amt = parseFloat((tr.querySelector('.inv-amt').value||'0').replace(',','.'))||0;
      const dia = tr.querySelector('.inv-dia').value;
      const tons = tr.querySelector('.inv-tons').value.trim();
      if (loc||work||amt||tons) items.push({location:loc,work,amount:amt,dia,tons});
    });
    if (!items.length) { toast('Agrega al menos un trabajo', 'error'); return; }
    const tots = invCalcTotales();
    const idExistente = $('inv-editando').value;
    const existente = idExistente ? invDocs.find(i => i.id === idExistente) : null;
    const repetida = invDocs.find((i) => i.id !== idExistente && String(i.numero || '').trim().toLowerCase() === num.toLowerCase());
    if (repetida && !await gcConfirm(`Ya existe la factura #${num} (${repetida.cliente || 'sin cliente'}, ${invFechaNum(repetida.fecha)}).\n\n¿Guardar otra con el mismo número?`, { okText: 'Guardar igual', cancelText: 'Cambiar número' })) {
      $('inv-num').focus(); return;
    }
    const btnG = $('inv-btn-guardar'); btnG.disabled = true;
    const inv = {
      ...(existente || {}),
      id: idExistente || Date.now().toString(),
      numero: num, fecha: $('inv-fecha').value, cliente: $('inv-cliente').value.trim(),
      direccionEmisor: $('inv-direccion-emisor').value.trim(),
      clienteDireccion: $('inv-cliente-direccion').value.trim(),
      notas: $('inv-notas').value.trim(), items, ...tots,
      creadoEn: (existente && existente.creadoEn) || new Date().toISOString(),
      pagada: existente ? !!existente.pagada : false // nueva = pendiente de cobro; si ya existía, se conserva su estado
    };
    if (existente) inv.editadoEn = new Date().toISOString();
    const idx = invDocs.findIndex(i => i.id===inv.id);
    if (idx>=0) invDocs[idx]=inv; else invDocs.push(inv);
    if (inv.direccionEmisor && inv.direccionEmisor !== cfgFacturaDireccion) { cfgFacturaDireccion = inv.direccionEmisor; guardarConfig(); }
    let cambio = false;
    if (inv.cliente && inv.cliente !== cfgUltimoCliente) { cfgUltimoCliente = inv.cliente; cambio = true; }
    if (inv.clienteDireccion !== undefined && inv.clienteDireccion !== cfgUltimoClienteDir) { cfgUltimoClienteDir = inv.clienteDireccion; cambio = true; }
    if (cambio) guardarConfig();
    try { await invSaveInv(); }
    catch (e) {
      // no se guardó: se deja la factura en pantalla para no perderla
      if (idx >= 0 && existente) invDocs[idx] = existente; else invDocs = invDocs.filter((i) => i !== inv);
      btnG.disabled = false;
      toast('No se pudo guardar la factura: ' + ((e && e.message) || e), 'error', 5000);
      return;
    }
    btnG.disabled = false;
    invBorradorBorrar();
    toast(idx>=0 ? 'Factura actualizada ✓' : 'Factura guardada ✓');
    invLimpiar();
    if (document.getElementById('cobros-tbody')) invRenderCobros();
  });

  function invEditar(inv) {
    $('inv-editando').value = inv.id;
    $('inv-num').value = inv.numero;
    $('inv-fecha').value = inv.fecha||invToday();
    $('inv-cliente').value = inv.cliente||'';
    if ($('inv-cliente-direccion')) $('inv-cliente-direccion').value = inv.clienteDireccion || '';
    $('inv-direccion-emisor').value = inv.direccionEmisor||cfgFacturaDireccion||'';
    $('inv-notas').value = inv.notas||'';
    $('inv-tax').value = inv.taxPct||0;
    $('inv-tbody').innerHTML = '';
    (inv.items||[]).forEach(it => $('inv-tbody').appendChild(invCrearFila(it)));
    invRellenarLineas();
    invRenumerar(); invCalcTotales();
    document.querySelector('.inv-subtab[data-sub="nueva"]').click();
    toast('Editando '+inv.numero, 'info');
  }

  // Duplicar: una factura NUEVA con lo mismo (cliente, direcciones, trabajos,
  // toneladas, montos, notas y tax), con el siguiente número y la fecha de hoy.
  // Las fechas de cada línea se dejan en blanco para poner las de este trabajo.
  async function invDuplicar(inv) {
    const tieneLineas = $('inv-tbody') && [...$('inv-tbody').querySelectorAll('tr')].some((tr) =>
      tr.querySelector('.inv-loc').value || tr.querySelector('.inv-work').value || tr.querySelector('.inv-amt').value);
    if (tieneLineas && !await gcConfirm('Ya tienes una factura a medias en "Nueva factura".\n\n¿Reemplazarla con la copia?', { okText: 'Reemplazar' })) return;
    $('inv-editando').value = '';
    $('inv-num').value = invAutoNum();
    $('inv-fecha').value = invToday();
    $('inv-cliente').value = inv.cliente || '';
    if ($('inv-cliente-direccion')) $('inv-cliente-direccion').value = inv.clienteDireccion || '';
    $('inv-direccion-emisor').value = inv.direccionEmisor || cfgFacturaDireccion || '';
    $('inv-notas').value = inv.notas || '';
    $('inv-tax').value = inv.taxPct || 0;
    $('inv-tbody').innerHTML = '';
    (inv.items || []).forEach((it) => $('inv-tbody').appendChild(invCrearFila({ ...it, dia: '' })));
    invRellenarLineas(); invRenumerar(); invCalcTotales();
    document.querySelector('.inv-subtab[data-sub="nueva"]').click();
    window.scrollTo({ top: 0, behavior: 'smooth' });
    if (typeof invBorradorGuardar === 'function') invBorradorGuardar();
    toast(`Copia de la factura ${inv.numero || ''} lista como #${$('inv-num').value} — pon las fechas y guarda`, 'success', 4500);
  }

  function invBuildPrint(inv) {
    const FC = facturaColores();
    const rows = (inv.items||[]).map((it,i) => `<tr style="background:${i%2?'#F7F9FC':'#fff'};">
      <td style="padding:9px 8px;border-bottom:1px solid #E6EAF2;color:#8A93A6;font-size:11.5px;">${i+1}</td>
      <td style="padding:9px 8px;border-bottom:1px solid #E6EAF2;font-size:11.5px;color:#5C6B85;white-space:nowrap;">${/^\d{4}-\d{2}-\d{2}$/.test(it.dia || '') ? invFechaGuion(it.dia) : escapeHtml(it.dia || '')}</td>
      <td style="padding:9px 8px;border-bottom:1px solid #E6EAF2;">${escapeHtml(it.location||'')}</td>
      <td style="padding:9px 8px;border-bottom:1px solid #E6EAF2;">${escapeHtml(it.work||'')}</td>
      <td style="padding:9px 8px;border-bottom:1px solid #E6EAF2;text-align:right;">${escapeHtml(it.tons||'')}</td>
      <td style="padding:9px 8px;border-bottom:1px solid #E6EAF2;text-align:right;font-weight:700;">${invFmt(it.amount)}</td>
    </tr>`).join('');
    // El logo de la FACTURA es el que se sube en Ajustes → Name of Company.
    // Es aparte del logo de la app (GH Manager): la factura la ve el cliente,
    // así que ahí va el logo del negocio, no el de la app.
    const logoSvg = cfgLogoDataUrl
      ? `<img src="${cfgLogoDataUrl}" alt="" style="width:52px;height:52px;object-fit:contain;flex-shrink:0;">`
      : '';
    return `
      <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:14px;">
        <div style="display:flex;align-items:center;gap:13px;">
          ${logoSvg}
          <div>
            <div style="font-size:22px;font-weight:700;color:${FC.p};font-family:Georgia,'Times New Roman',serif;letter-spacing:.2px;">${escapeHtml(cfgFacturaNombre)}</div>
            ${inv.direccionEmisor ? `<div style="font-size:11.5px;color:#707A8C;margin-top:2px;">${escapeHtml(inv.direccionEmisor)}</div>` : ''}
          </div>
        </div>
        <div style="text-align:right;">
          <div style="font-size:25px;font-weight:700;color:${FC.p};letter-spacing:2px;">INVOICE</div>
          <div style="font-size:13.5px;font-weight:600;color:#555;margin-top:4px;">${escapeHtml(inv.numero||'')}</div>
          <div style="font-size:11.5px;color:#93A0B8;margin-top:2px;">${invFechaNum(inv.fecha)}</div>
        </div>
      </div>
      <div style="height:3px;background:linear-gradient(90deg,${FC.a},${FC.p} 65%);border-radius:2px;margin-bottom:24px;"></div>
      ${(inv.cliente || inv.clienteDireccion)?`<div style="margin-bottom:22px;"><div style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:#A3ACBD;margin-bottom:5px;">Bill To</div>${inv.cliente?`<div style="font-size:15px;font-weight:700;color:${FC.p};">${escapeHtml(inv.cliente)}</div>`:''}${inv.clienteDireccion?`<div style="font-size:12px;color:#5C6B85;margin-top:2px;">${escapeHtml(inv.clienteDireccion)}</div>`:''}</div>`:''}
      <table style="width:100%;border-collapse:collapse;margin-bottom:18px;font-size:12.5px;">
        <thead><tr style="background:${FC.p};">
          <th style="padding:11px 8px;text-align:left;font-size:10px;color:rgba(255,255,255,.62);text-transform:uppercase;letter-spacing:.5px;width:30px;">#</th>
          <th style="padding:11px 8px;text-align:left;font-size:10px;color:rgba(255,255,255,.8);text-transform:uppercase;letter-spacing:.5px;width:94px;">Date</th>
          <th style="padding:11px 8px;text-align:left;font-size:10px;color:rgba(255,255,255,.92);text-transform:uppercase;letter-spacing:.5px;width:200px;">Subdivision</th>
          <th style="padding:11px 8px;text-align:left;font-size:10px;color:rgba(255,255,255,.92);text-transform:uppercase;letter-spacing:.5px;">Work Performed</th>
          <th style="padding:11px 8px;text-align:right;font-size:10px;color:rgba(255,255,255,.8);text-transform:uppercase;letter-spacing:.5px;width:64px;">Tons</th>
          <th style="padding:11px 8px;text-align:right;font-size:10px;color:rgba(255,255,255,.92);text-transform:uppercase;letter-spacing:.5px;width:120px;">Amount Due</th>
        </tr></thead>
        <tbody>${rows}</tbody>
      </table>
      <div style="display:flex;justify-content:flex-end;">
        <table style="font-size:13px;width:240px;border-collapse:collapse;">
          ${(() => {
            const tot = (inv.items || []).reduce((a, it) => a + (parseFloat(String(it.tons || '').replace(',', '.')) || 0), 0);
            return tot > 0 ? `<tr><td style="padding:5px 4px;color:#707A8C;">Total tons</td><td style="padding:5px 4px;text-align:right;font-weight:600;color:#333;">${Math.round(tot * 100) / 100}</td></tr>` : '';
          })()}
          <tr><td style="padding:5px 4px;color:#707A8C;">Subtotal</td><td style="padding:5px 4px;text-align:right;font-weight:600;color:#333;">${invFmt(inv.subtotal)}</td></tr>
          ${inv.taxPct?`<tr><td style="padding:5px 4px;color:#96721F;">Tax (${inv.taxPct}%)</td><td style="padding:5px 4px;text-align:right;font-weight:600;color:#96721F;">${invFmt(inv.tax)}</td></tr>`:''}
          <tr><td colspan="2" style="padding:6px 4px 0;"><div style="height:2px;background:${FC.p};border-radius:2px;"></div></td></tr>
          <tr><td style="padding:11px 12px;font-size:15px;font-weight:700;color:#fff;background:${FC.p};border-radius:8px 0 0 8px;">TOTAL</td><td style="padding:11px 12px;text-align:right;font-size:15px;font-weight:700;color:#fff;background:${FC.p};border-radius:0 8px 8px 0;">${invFmt(inv.total)}</td></tr>
        </table>
      </div>
      ${inv.notas?`<div style="margin-top:24px;padding:13px 17px;background:${FC.tint};border-left:3px solid ${FC.a};border-radius:8px;font-size:12.5px;color:${FC.tintTxt};line-height:1.6;"><strong style="color:${FC.p};">Notes:</strong> ${escapeHtml(inv.notas)}</div>`:''}`;
  }

  function invMostrarVista(inv) {
    invEnVista = inv;
    const sheet = $('inv-print-content');
    const overlay = $('inv-ov');
    sheet.innerHTML = '';
    overlay.style.display = 'flex';
    void overlay.offsetHeight;
    requestAnimationFrame(() => {
      sheet.innerHTML = invBuildPrint(inv);
    });
  }

  $('inv-btn-preview').addEventListener('click', () => {
    const items=[];
    $('inv-tbody').querySelectorAll('tr').forEach(tr=>{
      const loc=tr.querySelector('.inv-loc').value;
      const work=tr.querySelector('.inv-work').value.trim();
      const amt=parseFloat((tr.querySelector('.inv-amt').value||'0').replace(',','.'))||0;
      const dia=tr.querySelector('.inv-dia').value;
      const tons=tr.querySelector('.inv-tons').value.trim();
      if(loc||work||amt||tons) items.push({location:loc,work,amount:amt,dia,tons});
    });
    const tots=invCalcTotales();
    invMostrarVista({numero:$('inv-num').value||'---',fecha:$('inv-fecha').value,cliente:$('inv-cliente').value,clienteDireccion:$('inv-cliente-direccion').value,direccionEmisor:$('inv-direccion-emisor').value,notas:$('inv-notas').value,items,...tots});
  });

  function ghEsStandalone() {
    return window.navigator.standalone === true || (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches);
  }

  // Imprime en una ventana aparte, con su propio estilo — no depende del CSS
  // de la app ni de #print-area, que es lo que causaba la hoja en blanco.
  function ghImprimirEnVentana(htmlCuerpo, titulo, docCompleto) {
    // docCompleto: documento HTML ya armado con su propio estilo (ej. las
    // Completion Sheets, que deben salir idénticas al papel original).
    const html = docCompleto || ghDocImpresion(htmlCuerpo, titulo);
    ghImprimirDoc(html);
  }
  // Documento con el mismo estilo de la hoja impresa (lo usan Imprimir y "Ver" de invoices)
  function ghDocImpresion(htmlCuerpo, titulo) {
    return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${escapeHtml(titulo || 'Invoice')}</title>
      <style>
        @page { margin: 14mm; }
        body { font-family: Arial, Helvetica, sans-serif; color:#1a1a1a; margin:0; padding:24px; max-width:820px; }
        table { width:100%; border-collapse:collapse; }
        h1 { font-size:21px; margin:0; }
        h2 { font-size:13.5px; text-transform:uppercase; letter-spacing:.5px; color:#1B2A4A; border-bottom:1px solid #1B2A4A; padding-bottom:4px; margin:22px 0 8px; }
        .ps-addr { font-size:12px; color:#555; margin:4px 0; }
        .ps-badge { font-size:11px; color:#555; margin-bottom:18px; }
        th { text-align:left; border-bottom:1.5px solid #1a1a1a; padding:6px 4px; font-size:10.5px; text-transform:uppercase; }
        td { padding:6px 4px; border-bottom:1px solid #ccc; font-size:12.5px; }
        .num { text-align:right; }
        tfoot td { padding:7px 4px; font-weight:600; }
        tfoot tr.ps-tax td { border-top:1px solid #1a1a1a; }
        tfoot tr.ps-total td { border-top:2px solid #1a1a1a; font-size:14px; }
        .ps-split { display:grid; grid-template-columns:repeat(auto-fit, minmax(210px, 1fr)); gap:24px; margin-top:10px; }
        .ps-split-box { border:1.5px solid #1a1a1a; padding:14px; }
        .ps-split-box .ps-name { font-weight:700; font-size:13px; margin-bottom:6px; }
        .ps-split-box .ps-total { font-size:19px; font-weight:700; }
        .ps-split-box .ps-note { font-size:11px; color:#555; margin-top:4px; }
      </style></head><body>${htmlCuerpo}</body></html>`;
  }
  function ghImprimirDoc(html) {
    // Imprime desde un marco oculto dentro de la misma página: funciona en
    // Windows y también dentro de la app instalada del iPhone (donde abrir
    // ventanas nuevas está bloqueado). Se espera a que el contenido esté
    // dibujado antes de mandar a imprimir, que es lo que evita la hoja en blanco.
    const anterior = document.getElementById('gh-print-frame');
    if (anterior) anterior.remove();
    const frame = document.createElement('iframe');
    frame.id = 'gh-print-frame';
    frame.setAttribute('aria-hidden', 'true');
    frame.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden;';
    document.body.appendChild(frame);

    const doc = frame.contentWindow.document;
    doc.open();
    doc.write(html);
    doc.close();

    const lanzar = async () => {
      // Espera a que la letra termine de cargar (máx. 2 s); si no, sale con
      // otra letra y cambian los tamaños.
      try {
        const fd = frame.contentWindow.document.fonts;
        if (fd && fd.ready) await Promise.race([fd.ready, new Promise((r) => setTimeout(r, 2000))]);
      } catch (e) {}
      try {
        frame.contentWindow.focus();
        frame.contentWindow.print();
      } catch (e) {
        toast('No se pudo abrir la impresión — usa Descargar y abre el archivo.', 'error', 5000);
      }
      setTimeout(() => { const f = document.getElementById('gh-print-frame'); if (f) f.remove(); }, 60000);
    };
    if (frame.contentWindow.document.readyState === 'complete') setTimeout(lanzar, 300);
    else frame.onload = () => setTimeout(lanzar, 300);
  }

  $('inv-btn-imprimir').addEventListener('click', () => {
    if (!invEnVista) return;
    ghImprimirEnVentana(invBuildPrint(invEnVista), `Invoice ${invEnVista.numero || ''}`);
  });

  $('inv-btn-descargar').addEventListener('click', () => {
    if (!invEnVista) return;
    const html=`<!DOCTYPE html><html><head><meta charset="utf-8"><title>Invoice ${escapeHtml(invEnVista.numero||'')}</title><style>body{font-family:Arial,sans-serif;padding:32px;max-width:800px;margin:0 auto;}</style></head><body>${invBuildPrint(invEnVista)}</body></html>`;
    const a=document.createElement('a'); a.href=URL.createObjectURL(new Blob([html],{type:'text/html;charset=utf-8;'}));
    a.download=`invoice-${(invEnVista.numero||'inv').replace(/[^a-z0-9]/gi,'-').toLowerCase()}.html`;
    a.click(); URL.revokeObjectURL(a.href);
  });

  // ---- Enviar (share sheet nativo: Mensajes, WhatsApp, Mail…) ----
  $('inv-btn-enviar').addEventListener('click', async () => {
    if (!invEnVista) return;
    const html=`<!DOCTYPE html><html><head><meta charset="utf-8"><title>Invoice ${escapeHtml(invEnVista.numero||'')}</title><style>body{font-family:Arial,sans-serif;padding:32px;max-width:800px;margin:0 auto;}</style></head><body>${invBuildPrint(invEnVista)}</body></html>`;
    const nombreArchivo = `invoice-${(invEnVista.numero||'inv').replace(/[^a-z0-9]/gi,'-').toLowerCase()}.html`;
    const resumen = `Invoice ${invEnVista.numero||''}${invEnVista.cliente?' — '+invEnVista.cliente:''} — ${invFmt(invEnVista.total)}`;
    try {
      const archivo = new File([html], nombreArchivo, { type: 'text/html' });
      if (navigator.canShare && navigator.canShare({ files: [archivo] })) {
        await navigator.share({ files: [archivo], title: `Invoice ${invEnVista.numero||''}`, text: resumen });
        return;
      }
    } catch (e) {
      if (e && e.name === 'AbortError') return; // el usuario cerró el share sheet sin elegir nada
    }
    // Respaldo si el navegador no puede compartir archivos: comparte solo el resumen en texto.
    if (navigator.share) {
      try { await navigator.share({ title: `Invoice ${invEnVista.numero||''}`, text: resumen }); }
      catch (e) { if (!e || e.name !== 'AbortError') toast('No se pudo abrir para compartir — usa Descargar.', 'error'); }
    } else {
      toast('Este navegador no soporta compartir directo — usa el botón Descargar.', 'info');
    }
  });

  $('inv-btn-cerrar-ov').addEventListener('click', () => { $('inv-ov').style.display='none'; invEnVista=null; });
  $('inv-ov').addEventListener('click', e => { if(e.target.id==='inv-ov'){$('inv-ov').style.display='none';invEnVista=null;} });

  // Filtros de Guardadas: lote, subdivisión y estado (además del buscador)
  let invEstadoFiltro = 'todas';
  function invCoincideLoteSub(inv, lote, sub) {
    if (!lote && !sub) return true;
    const loteRe = lote ? new RegExp('(^|[^0-9a-z])' + lote.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '($|[^0-9a-z])', 'i') : null;
    const subN = glNorm(sub);
    return (inv.items || []).some((it) => {
      const loc = String(it.location || '');
      return (!loteRe || loteRe.test(loc.replace(/^\s*(lot|lote)\s*#?\s*/i, ' '))) && (!subN || glNorm(loc).includes(subN));
    });
  }
  function invRenderLista() {
    const buscar = $('inv-buscar').value.trim().toLowerCase();
    const fLote = ($('inv-f-lote') ? $('inv-f-lote').value : '').trim().replace(/^#/, '');
    const fSub = ($('inv-f-sub') ? $('inv-f-sub').value : '').trim();
    const tbody = $('inv-list-tbody');
    tbody.innerHTML = '';
    const filtradas = invDocs.filter(inv => !buscar ||
      (inv.numero||'').toLowerCase().includes(buscar) || (inv.cliente||'').toLowerCase().includes(buscar) ||
      (inv.items||[]).some(it=>(it.location||'').toLowerCase().includes(buscar)||(it.work||'').toLowerCase().includes(buscar))
    ).filter((inv) => invCoincideLoteSub(inv, fLote, fSub))
     .filter((inv) => invEstadoFiltro === 'todas' || (invEstadoFiltro === 'pagadas' ? !!inv.pagada : !inv.pagada))
     .sort((a,b)=>(b.fecha||'').localeCompare(a.fecha||'') || (b.creadoEn||'').localeCompare(a.creadoEn||''));
    const hayFiltro = !!(buscar || fLote || fSub || invEstadoFiltro !== 'todas');
    if ($('inv-f-limpiar')) $('inv-f-limpiar').style.display = hayFiltro ? '' : 'none';
    $('inv-list-empty').style.display = filtradas.length===0?'block':'none';
    $('inv-list-tbl').style.display = filtradas.length===0?'none':'table';

    // Info de resultados
    if ($('inv-buscar-info')) {
      const tot = filtradas.reduce((t, i) => t + (Number(i.total) || 0), 0);
      const pend = filtradas.filter((i) => !i.pagada).reduce((t, i) => t + (Number(i.total) || 0), 0);
      $('inv-buscar-info').innerHTML = `<b>${filtradas.length}</b> ${hayFiltro ? `de ${invDocs.length} ` : ''}factura(s) · Total <b>${invFmt(tot)}</b> · Por cobrar <b class="pend">${invFmt(pend)}</b>`;
    }

    const resalta = (txt) => {
      if (!buscar || !txt) return escapeHtml(txt || '');
      const t = String(txt);
      const idx = t.toLowerCase().indexOf(buscar);
      if (idx < 0) return escapeHtml(t);
      return escapeHtml(t.slice(0,idx)) + '<mark style="background:#FBF0D4;color:var(--gold);padding:0 2px;border-radius:3px;">' + escapeHtml(t.slice(idx,idx+buscar.length)) + '</mark>' + escapeHtml(t.slice(idx+buscar.length));
    };

    filtradas.forEach(inv => {
      const tr=document.createElement('tr');
      tr.className = 'sel-item';
      tr.dataset.selid = inv.id;
      const pagada = !!inv.pagada;
      tr.innerHTML=`
        <td style="font-family:'IBM Plex Mono',monospace;font-weight:600;">${escapeHtml(inv.numero||'')}</td>
        <td>${invFechaNum(inv.fecha)}</td>
        <td style="font-weight:500;">${escapeHtml(inv.cliente||'—')}</td>
        <td class="r" style="font-weight:700;color:var(--teal);font-family:'IBM Plex Mono',monospace;">${invFmt(inv.total)}</td>
        <td style="white-space:nowrap;">
          <button class="inv-toggle-pagada" data-id="${inv.id}" style="font-size:11px;font-weight:700;padding:4px 10px;border-radius:20px;border:1.5px solid ${pagada ? 'var(--teal)' : 'var(--ember)'};background:${pagada ? 'var(--teal-bg)' : 'var(--ember-bg)'};color:${pagada ? 'var(--teal-dk)' : 'var(--ember)'};cursor:pointer;">${pagada ? 'Pagada' : 'Pendiente'}</button>
        </td>
        <td style="white-space:nowrap;">
          <button class="gc-action-btn" data-i18n="ver" style="padding:4px 10px;font-size:11.5px;" data-a="ver" data-id="${inv.id}">Ver</button>
          <button class="gc-action-btn" data-i18n="editar" style="padding:4px 10px;font-size:11.5px;margin-left:4px;" data-a="editar" data-id="${inv.id}">Editar</button>
          <button class="gc-action-btn" style="padding:4px 10px;font-size:11.5px;margin-left:4px;" data-a="duplicar" data-id="${inv.id}" title="Hacer una factura nueva igual a esta">Duplicar</button>
          <button class="gc-del" style="margin-left:4px;" data-a="borrar" data-id="${inv.id}">✕</button>
        </td>`;
      tbody.appendChild(tr);
    });
    tbody.querySelectorAll('.inv-toggle-pagada').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const inv = invDocs.find(i => i.id === btn.dataset.id);
        if (!inv) return;
        inv.pagada = !inv.pagada;
        await invSaveInv();
        invRenderLista();
        toast(inv.pagada ? 'Marcada como pagada ✓' : 'Marcada como pendiente de cobro', inv.pagada ? 'success' : 'info');
      });
    });
    tbody.querySelectorAll('[data-a]').forEach(btn => {
      btn.addEventListener('click', async e => {
        e.stopPropagation();
        const inv = invDocs.find(i=>i.id===btn.dataset.id);
        if (!inv) return;
        if (btn.dataset.a==='ver') invMostrarVista(inv);
        if (btn.dataset.a==='editar') invEditar(inv);
        if (btn.dataset.a==='duplicar') invDuplicar(inv);
        if (btn.dataset.a==='borrar') {
          if (!await gcConfirm(`¿Eliminar ${inv.numero}?`, { okText: 'Eliminar', danger: true })) return;
          invDocs = invDocs.filter(i=>i.id!==inv.id);
          await invSaveInv(); toast('Factura eliminada','info'); invRenderLista(); if (document.getElementById('cobros-tbody')) invRenderCobros();
        }
      });
    });
    if (invSel) invSel.refrescarTrasRedibujar();
  }
  $('inv-buscar').addEventListener('input', debounce(invRenderLista, 160));
  ['inv-f-lote', 'inv-f-sub'].forEach((id) => { if ($(id)) { $(id).addEventListener('input', debounce(invRenderLista, 160)); $(id).addEventListener('change', invRenderLista); } });
  document.querySelectorAll('.inv-estados [data-est]').forEach((b) => b.addEventListener('click', () => {
    invEstadoFiltro = b.dataset.est;
    document.querySelectorAll('.inv-estados [data-est]').forEach((x) => x.classList.toggle('on', x === b));
    invRenderLista();
  }));
  if ($('inv-f-limpiar')) $('inv-f-limpiar').addEventListener('click', () => {
    $('inv-buscar').value = ''; $('inv-f-lote').value = ''; $('inv-f-sub').value = '';
    invEstadoFiltro = 'todas';
    document.querySelectorAll('.inv-estados [data-est]').forEach((x) => x.classList.toggle('on', x.dataset.est === 'todas'));
    invRenderLista();
  });

  // ---- Modo selección en Facturas Guardadas ----
  const invSel = ghCrearSeleccion({
    host: 'inv-sel-host',
    contenedor: 'inv-list-tbody',
    nombre: 'factura', plural: 'facturas',
    acciones: [
      { id: 'compartir', texto: '↗ Compartir', fn: async (ids) => {
          const docs = ids.map((id) => invDocs.find((i) => i.id === id)).filter(Boolean);
          if (!docs.length) return;
          const html = ghDocumentoCombinado(docs.map((d) => invBuildPrint(d)), 'Facturas');
          await ghCompartirHTML(html, docs.length === 1 ? `invoice-${(docs[0].numero||'inv')}.html` : `facturas-${docs.length}.html`, `${docs.length} factura(s)`);
        } },
      { id: 'imprimir', texto: '🖨 Imprimir', fn: (ids) => {
          const docs = ids.map((id) => invDocs.find((i) => i.id === id)).filter(Boolean);
          if (!docs.length) return;
          ghImprimirEnVentana(docs.map((d) => `<div class="gh-doc">${invBuildPrint(d)}</div>`).join(''), `Facturas (${docs.length})`);
        } },
      { id: 'duplicar', texto: '⧉ Duplicar', fn: async (ids) => {
          if (ids.length !== 1) { toast('Marca solo una factura para duplicar', 'info'); return; }
          const inv = invDocs.find((i) => i.id === ids[0]); if (!inv) return;
          invSel.salir(); invDuplicar(inv);
        } },
      { id: 'pagada', texto: '✓ Pagada', fn: async (ids) => {
          ids.forEach((id) => { const inv = invDocs.find((i) => i.id === id); if (inv) inv.pagada = true; });
          await invSaveInv(); invRenderLista();
          toast(`${ids.length} factura(s) marcada(s) como pagada(s) ✓`);
        } },
      { id: 'borrar', texto: '🗑 Borrar', peligro: true, fn: async (ids) => {
          if (!await gcConfirm(`¿Eliminar ${ids.length} factura(s)? Esta acción no se puede deshacer.`, { okText: 'Eliminar', danger: true })) return;
          invDocs = invDocs.filter((i) => !ids.includes(i.id));
          await invSaveInv();
          invSel.salir();
          invRenderLista();
          if (document.getElementById('cobros-tbody')) invRenderCobros();
          toast(`${ids.length} factura(s) eliminada(s)`, 'info');
        } },
    ],
  });

  // ---- Cobros por casa: cada trabajo de cada factura como un cobro individual ----
  function invRenderCobros() {
    const buscar = $('cobros-buscar').value.trim().toLowerCase();
    const tbody = $('cobros-tbody');
    tbody.innerHTML = '';

    // Aplanar: cada item de cada factura es un cobro
    const cobros = [];
    invDocs.forEach(inv => {
      (inv.items || []).forEach(it => {
        cobros.push({
          tons: it.tons || '', location: it.location || '', work: it.work || '',
          amount: it.amount || 0, numero: inv.numero || '', cliente: inv.cliente || '',
          fecha: inv.fecha || '', creadoEn: inv.creadoEn || ''
        });
      });
    });

    const filtrados = cobros.filter(c => !buscar ||
      String(c.tons || '').toLowerCase().includes(buscar) ||
      c.location.toLowerCase().includes(buscar) ||
      c.work.toLowerCase().includes(buscar) ||
      c.numero.toLowerCase().includes(buscar) ||
      c.cliente.toLowerCase().includes(buscar)
    ).sort((a,b) => (b.creadoEn||'').localeCompare(a.creadoEn||''));

    $('cobros-empty').style.display = filtrados.length===0 ? 'block' : 'none';
    $('cobros-tbl').style.display = filtrados.length===0 ? 'none' : 'table';

    if ($('cobros-info')) {
      if (buscar) $('cobros-info').textContent = `${filtrados.length} cobro(s) encontrado(s) para "${buscar}"`;
      else $('cobros-info').textContent = `${cobros.length} cobro(s) en total`;
    }

    const resalta = (txt) => {
      if (!buscar || !txt) return escapeHtml(txt || '');
      const t = String(txt);
      const idx = t.toLowerCase().indexOf(buscar);
      if (idx < 0) return escapeHtml(t);
      return escapeHtml(t.slice(0,idx)) + '<mark style="background:#FBF0D4;color:var(--gold);padding:0 2px;border-radius:3px;">' + escapeHtml(t.slice(idx,idx+buscar.length)) + '</mark>' + escapeHtml(t.slice(idx+buscar.length));
    };

    filtrados.forEach(c => {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td style="font-family:'IBM Plex Mono',monospace;font-weight:600;text-align:right;">${escapeHtml(c.tons || '') || '—'}</td>
        <td style="font-weight:500;">${resalta(c.location) || '—'}</td>
        <td style="font-size:12.5px;">${resalta(c.work) || '—'}</td>
        <td style="font-family:'IBM Plex Mono',monospace;font-size:12px;color:var(--muted);">${resalta(c.numero)}</td>
        <td style="font-size:12.5px;">${escapeHtml(c.cliente || '—')}</td>
        <td class="r" style="font-weight:700;color:var(--teal);font-family:'IBM Plex Mono',monospace;">${invFmt(c.amount)}</td>
      `;
      tbody.appendChild(tr);
    });
  }
  $('cobros-buscar').addEventListener('input', debounce(invRenderCobros, 160));

  // ---- Listas de Facturas: Colonias, Clientes y Trabajos (editables) ----
  async function glPreguntarFacturas(n, que, viejo, nuevo) {
    if (!n) return false;
    return gcConfirm(`"${viejo}" aparece en ${n} factura(s) guardada(s).\n\n¿Cambiarlo también ahí por "${nuevo}"?`, { okText: 'Sí, en todas', cancelText: 'No, solo la lista' });
  }
  const glFactUsoLoc = (nom) => { const k = glNorm(nom); return k ? invDocs.filter((inv) => (inv.items || []).some((it) => glNorm(it.location).includes(k))).length : 0; };
  function invRenderColonias() {
    ghListaEditable({
      cont: 'col-list', items: () => invColonias, uso: glFactUsoLoc, usoTxt: 'facturas',
      vacio: 'No hay colonias. Agrega la primera arriba.',
      renombrar: async (i, nuevo, viejo) => {
        invColonias[i] = nuevo; await invSaveCol(); invRefreshSelects();
        const n = glFactUsoLoc(viejo);
        if (await glPreguntarFacturas(n, 'colonia', viejo, nuevo)) {
          const re = new RegExp(viejo.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
          invDocs.forEach((inv) => (inv.items || []).forEach((it) => { if (it.location) it.location = it.location.replace(re, nuevo); }));
          await invSaveInv(); invRenderLista();
        }
      },
      borrar: async (i) => { invColonias.splice(i, 1); await invSaveCol(); invRefreshSelects(); },
      ordenar: async () => { glOrdenarArr(invColonias); await invSaveCol(); invRefreshSelects(); }
    });
  }
  const glFactUsoCli = (nom) => invDocs.filter((inv) => glNorm(inv.cliente) === glNorm(nom)).length;
  function invRenderClientes() {
    ghListaEditable({
      cont: 'cli-list', items: () => invClientes, uso: glFactUsoCli, usoTxt: 'facturas',
      vacio: 'No hay clientes. Agrega el primero arriba.',
      renombrar: async (i, nuevo, viejo) => {
        invClientes[i] = nuevo; await invSaveCli();
        const n = glFactUsoCli(viejo);
        if (await glPreguntarFacturas(n, 'cliente', viejo, nuevo)) {
          invDocs.forEach((inv) => { if (glNorm(inv.cliente) === glNorm(viejo)) inv.cliente = nuevo; });
          await invSaveInv(); invRenderLista();
        }
        if (glNorm(cfgUltimoCliente) === glNorm(viejo)) { cfgUltimoCliente = nuevo; try { guardarConfig(); } catch (e) {} }
      },
      borrar: async (i) => { invClientes.splice(i, 1); await invSaveCli(); },
      ordenar: async () => { glOrdenarArr(invClientes); await invSaveCli(); }
    });
  }

  // Los trabajos antes eran solo texto. Ahora pueden llevar un precio por
  // defecto: {nombre, precio}. Estas dos funciones permiten trabajar con
  // los dos formatos, para no perder lo que ya estaba guardado.
  function trbNombre(t) { return typeof t === 'string' ? t : (t && t.nombre) || ''; }
  function trbPrecio(t) { return typeof t === 'string' ? 0 : (Number(t && t.precio) || 0); }
  // Si el trabajo se cobra por tonelada, el precio guardado es POR TONELADA
  // y en la factura se multiplica por las toneladas de esa casa.
  function trbPorTonelada(t) { return typeof t === 'string' ? false : !!(t && t.porTon); }
  // Busca el trabajo guardado sin ser quisquilloso: ignora mayúsculas,
  // acentos, guiones y espacios de más. Así "Rough In", "rough-in" y
  // "ROUGH  IN" encuentran el mismo trabajo y el precio sí se aplica.
  function trbNormalizar(txt) {
    return String(txt || '')
      .normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '');
  }
  function trbBuscar(nombre) {
    const clave = trbNormalizar(nombre);
    if (!clave) return null;
    return (invTrabajos || []).find((t) => trbNormalizar(trbNombre(t)) === clave) || null;
  }

  const glFactUsoTrb = (nom) => { const k = trbNormalizar(nom); return k ? invDocs.filter((inv) => (inv.items || []).some((it) => trbNormalizar(it.work) === k)).length : 0; };
  function invRenderTrabajos() {
    ghListaEditable({
      cont: 'trab-list', items: () => invTrabajos, nombre: trbNombre, uso: glFactUsoTrb, usoTxt: 'facturas',
      vacio: 'No hay descripciones. Agrega la primera arriba.',
      extra: (t, i) => `<label class="gl-ton" title="El precio es por tonelada; en la factura se multiplica por las toneladas">
          <input type="checkbox" class="trb-porton" ${trbPorTonelada(t) ? 'checked' : ''}> por ton</label>
        <input type="text" inputmode="decimal" class="trb-precio" value="${trbPrecio(t) || ''}" placeholder="${trbPorTonelada(t) ? '$/ton' : 'Precio'}" aria-label="Precio">`,
      conectarExtra: (row, i) => {
        const inp = row.querySelector('.trb-precio'), chk = row.querySelector('.trb-porton');
        inp.addEventListener('change', async () => {
          const p = parseFloat((inp.value || '').replace(/[$,\s]/g, '')) || 0;
          const porTon = trbPorTonelada(invTrabajos[i]);
          invTrabajos[i] = { nombre: trbNombre(invTrabajos[i]), precio: p, porTon };
          await invSaveTrb();
          toast(p ? `Precio guardado: ${invFmt(p)}${porTon ? ' por tonelada' : ''}` : 'Precio quitado', 'success', 2200);
        });
        chk.addEventListener('change', async () => {
          invTrabajos[i] = { nombre: trbNombre(invTrabajos[i]), precio: trbPrecio(invTrabajos[i]), porTon: chk.checked };
          await invSaveTrb(); invRenderTrabajos();
          toast(chk.checked ? 'Ahora se cobra por tonelada' : 'Ahora es precio fijo', 'success', 2200);
        });
      },
      renombrar: async (i, nuevo, viejo) => {
        const t = invTrabajos[i];
        invTrabajos[i] = typeof t === 'string' ? nuevo : { ...t, nombre: nuevo };
        await invSaveTrb();
        const n = glFactUsoTrb(viejo);
        if (await glPreguntarFacturas(n, 'trabajo', viejo, nuevo)) {
          invDocs.forEach((inv) => (inv.items || []).forEach((it) => { if (trbNormalizar(it.work) === trbNormalizar(viejo)) it.work = nuevo; }));
          await invSaveInv(); invRenderLista();
        }
      },
      borrar: async (i) => { invTrabajos.splice(i, 1); await invSaveTrb(); },
      ordenar: async () => { glOrdenarArr(invTrabajos, trbNombre); await invSaveTrb(); }
    });
  }

  $('cli-btn-add').addEventListener('click', async () => {
    const val=$('cli-nueva').value.trim();
    if (!val) return;
    if (invClientes.includes(val)){toast('Ya existe','info');return;}
    invClientes.push(val); await invSaveCli();
    $('cli-nueva').value=''; invRenderClientes(); toast('Cliente agregado ✓');
  });
  $('cli-nueva').addEventListener('keydown', e => { if(e.key==='Enter') $('cli-btn-add').click(); });

  $('trab-btn-add').addEventListener('click', async () => {
    const val=$('trab-nueva').value.trim();
    if (!val) return;
    if (trbBuscar(val)){toast('Ya existe','info');return;}
    const precio = parseFloat((($('trab-precio') && $('trab-precio').value) || '').replace(',', '.')) || 0;
    invTrabajos.push({ nombre: val, precio }); await invSaveTrb();
    $('trab-nueva').value='';
    if ($('trab-precio')) $('trab-precio').value='';
    invRenderTrabajos(); toast('Descripción agregada ✓');
  });
  $('trab-nueva').addEventListener('keydown', e => { if(e.key==='Enter') $('trab-btn-add').click(); });

  $('col-btn-add').addEventListener('click', async () => {
    const val=$('col-nueva').value.trim();
    if (!val) return;
    if (invColonias.includes(val)){toast('Ya existe','info');return;}
    invColonias.push(val); await invSaveCol();
    $('col-nueva').value=''; invRenderColonias(); invRefreshSelects(); toast('Colonia agregada ✓');
  });
  $('col-nueva').addEventListener('keydown', e => { if(e.key==='Enter') $('col-btn-add').click(); });

  // Cargar facturas cuando se activa la pestaña
  document.querySelectorAll('.gc-tab').forEach(tab => {
    if (tab.dataset.tab==='facturas') {
      tab.addEventListener('click', async () => {
        // Cargar datos si aún no están inicializados
        if (!$('inv-num').value) {
          // Las 4 lecturas son independientes: se piden a la vez (antes eran
          // una tras otra, tardando la suma de las 4 en vez del máximo).
          // (e => e): si no se pudo leer por falta de señal, se sabe y NO se
          // guardan las listas de fábrica encima de las tuyas
          const [rInv, rCol, rCli, rTrb] = await Promise.all([INV_KEY, COL_KEY, CLI_KEY, TRB_KEY].map((k) => window.storage.get(k).catch((e) => e)));
          const ok = (r) => r && typeof r.value === 'string';
          const nunca = (r) => r instanceof Error && !r.sinSenal;   // de verdad no existe
          try { invDocs = ok(rInv) ? JSON.parse(rInv.value) : []; } catch (e) { invDocs = []; }
          if (!Array.isArray(invDocs)) invDocs = [];
          const invBaseNueva = !ghEsBasePrincipal();
          const cargarLista = async (r, def, guardar) => {
            try { if (ok(r)) { const v = JSON.parse(r.value); if (Array.isArray(v)) return v; } } catch (e) {}
            const lista = invBaseNueva ? [] : [...def];
            if (nunca(r) && lista.length) { try { await guardar(lista); } catch (e) {} }
            return lista;
          };
          invColonias = await cargarLista(rCol, INV_COL_DEFAULT, (l) => { invColonias = l; return invSaveCol(); });
          invClientes = await cargarLista(rCli, INV_CLI_DEFAULT, (l) => { invClientes = l; return invSaveCli(); });
          invTrabajos = await cargarLista(rTrb, INV_TRB_DEFAULT, (l) => { invTrabajos = l; return invSaveTrb(); });
          invRefreshDlClientes(); invRefreshDlTrabajos(); invRefreshDlColonias();
          $('inv-num').value = invAutoNum();   // siguiente número, según las facturas ya guardadas
          $('inv-fecha').value = invToday();
          $('inv-tbody').innerHTML='';
          invRellenarLineas();
          invRenumerar(); invCalcTotales();
          invBorradorRestaurar();
        }
      });
    }
  });

  // ====================================================================
  // FIN MÓDULO FACTURAS
  // ====================================================================

