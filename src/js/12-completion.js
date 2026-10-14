  // ====================================================================
  // MÓDULO: COMPLETION SHEETS (American Heating & Cooling)
  // Dos hojas: Rough-In y Trim-Out. Leadman, builder y lote se comparten
  // (es la misma casa); lo demás es propio de cada hoja. Cada una se guarda
  // sola como borrador en el teléfono, y se pueden imprimir juntas en dos
  // páginas para frente y vuelta.
  // ====================================================================
  const CS_KEY = (tipo) => ghLK('gh-cs-' + tipo);
  const CS_HOJAS = {
    rough: {
      titulo: 'ROUGH-IN', nombre: 'Rough-In',
      izq: [
        'All boots checked and are straight and strapped (if needed)',
        'Duct installed correctly with no crimped flex',
        'Duct work strapped and not too tightly',
        'Duct work has proper clearance from roof',
        'Zone dampers and by-pass installed properly',
        'Proper clearance in front of unit (30" min.)',
        'Accessibility clearance (30"H x 24"W unobstructed)',
        'Furnace or air handler is properly sealed',
        'Unit has correct size drain pan (3" min. on all sides)',
        'Copper sweated, strapped and armaflex to unit',
        'Drains have proper fall, strapped, glue and trapped',
        'Door on furnace',
        'Flue connected with proper clearance and support',
        'Flue cap(s) has proper height from roof deck',
        'Flue pipe(s) has more vertical rise than horizontal slope'
      ],
      der: [
        'Flue pipe(s) sleeved from contact with insulation',
        'Notched walls have correct nail plates/framing straps',
        'Thermostat wire not touching any metal',
        'Bath fans connected or left so the electrician can connect',
        'Dryer vent cap installed and sealed; screen removed',
        "Dryer vent not to be over 25' in length (90°=5', 45°=2.5')",
        'Gas lines run to proper location and strapped properly',
        'Gas pipe sleeved when passing through exterior walls',
        'Gas line has {lbs} pounds of pressure in it',
        'Dryer vent has 2" or more clearance from inside wall',
        'Primary drain has armaflex per code',
        'Line sets stubbed outside the house 18" and sealed',
        'Any armaflex damage repaired',
        'Job site clean',
        'Completed trim list in pack'
      ]
    },
    trim: {
      titulo: 'TRIM-OUT', nombre: 'Trim-Out',
      izq: [
        'All ceiling grilles are installed and squared to wall',
        'All floor grilles are installed',
        'All return grilles are level, squared',
        'All return grilles open and close properly',
        'All filters are installed',
        'Grilles are straight with no finger prints or scratches',
        'All thermostats are installed, level and secured',
        'Butterfly damper installed (if sealed crawlspace)',
        'ALL manuals are left in kitchen cabinet drawer',
        'All vent caps are on straight and sealed',
        'Interior dryer vent ring is on',
        'All gas appliances connected to piping',
        'Gas pressure gauge has {lbs} lbs. of pressure and holding for 30 minutes',
        'Gas meter connected',
        'Equipment is completely on pad'
      ],
      der: [
        'Nitrogen in refrigerant system / # of Pounds {nitro}',
        'Indoor unit checked and finished',
        'All accessories installed (zoning, air cleaner, etc.)',
        'Proper clearance from electrical disconnect(s)',
        'Proper clearance to service side of equipment',
        'Seal-tite run correctly',
        'Electrical finished / breakers installed (disconnect)',
        'Heater kit marked on heat pump applications',
        'Drains run down to ground and out 18" from foundation',
        'Condensate pump installed (if needed) with low voltage connected and plug in drain pan',
        'Flashing installed and sealed on packaged unit',
        'All penetrations sealed',
        'Outdoor units completed and level',
        'Critter-guard installed and sealed',
        'Locking service port caps installed (City of Franklin, City of Brentwood)'
      ]
    }
  };
  let csTipo = 'rough';
  let csEstadoAntes = '';   // para poder destocar Job is complete / not complete

  function csTextoItem(t, editable, datos) {
    const campoNum = (k) => editable
      ? `<input type="text" inputmode="decimal" class="cs-num" data-num="${k}" value="${escapeHtml((datos && datos[k]) || '')}">`
      : `<span style="display:inline-block;min-width:44px;border-bottom:1px solid #222;text-align:center;">${escapeHtml((datos && datos[k]) || '') || '&nbsp;'}</span>`;
    return escapeHtml(t).replace('{lbs}', campoNum('lbs')).replace('{nitro}', campoNum('nitro'));
  }

  function csRenderChecklist(datos) {
    const cont = $('cs-checklist');
    if (!cont) return;
    const hoja = CS_HOJAS[csTipo];
    const marcados = (datos && datos.checks) || {};
    const col = (lista, pref) => lista.map((t, i) => `
      <label class="cs-item"><input type="checkbox" data-cs="${pref}${i}" ${marcados[pref + i] ? 'checked' : ''}>
        <span>${csTextoItem(t, true, datos)}</span></label>`).join('');
    cont.innerHTML = `<div>${col(hoja.izq, 'L')}</div><div>${col(hoja.der, 'R')}</div>`;
    cont.querySelectorAll('.cs-num').forEach((i) => {
      i.addEventListener('click', (e) => e.preventDefault());   // escribir no marca la casilla
      i.addEventListener('input', csGuardarBorrador);
    });
    cont.querySelectorAll('input[type=checkbox]').forEach((c) => c.addEventListener('change', csGuardarBorrador));
  }

  // Lo que se ve en pantalla, separado en lo compartido y lo propio de la hoja
  // Cada hoja (Rough-In y Trim-Out) es completamente independiente: nada se
  // comparte entre ellas, ni siquiera Leadman/Builder/Lote — cada una se
  // llena y se guarda por su cuenta.
  function csLeer() {
    const checks = {};
    document.querySelectorAll('#cs-checklist input[data-cs]').forEach((c) => { checks[c.dataset.cs] = c.checked; });
    const num = (k) => { const el = document.querySelector(`#cs-checklist .cs-num[data-num="${k}"]`); return el ? el.value.trim() : ''; };
    const estadoSel = document.querySelector('input[name="cs-estado"]:checked');
    return {
      leadman: $('cs-leadman').value.trim(), builder: $('cs-builder').value.trim(), lote: $('cs-lote').value.trim(),
      fecha: $('cs-fecha').value, estado: estadoSel ? estadoSel.value : '',
      trabajo: $('cs-trabajo').value, tiempo: $('cs-tiempo').value.trim(), material: $('cs-material').value,
      ahc: $('cs-ahc').checked, ahcFecha: $('cs-ahc-fecha').value, ahcHora: $('cs-ahc-hora').value,
      salesman: $('cs-salesman').checked, customer: $('cs-customer').checked,
      lbs: num('lbs'), nitro: num('nitro'), checks
    };
  }

  function csLeerGuardado(tipo) {
    try { return JSON.parse(localStorage.getItem(CS_KEY(tipo)) || '{}') || {}; } catch (e) { return {}; }
  }

  function csLlenar(d) {
    d = d || {};
    $('cs-titulo').textContent = CS_HOJAS[csTipo].nombre + ' Completion Sheet';
    document.querySelectorAll('.cs-tipo-btn').forEach((b) => b.classList.toggle('active', b.dataset.cstipo === csTipo));
    // Nada se llena solo: cada hoja se escribe a mano, con clic.
    $('cs-fecha').value = d.fecha || '';
    $('cs-leadman').value = d.leadman || '';
    $('cs-builder').value = d.builder || '';
    $('cs-lote').value = d.lote || '';
    $('cs-completo').checked = d.estado === 'completo';
    $('cs-incompleto').checked = d.estado === 'incompleto';
    if (typeof csEstadoAntes !== 'undefined') csEstadoAntes = d.estado || '';
    $('cs-trabajo').value = d.trabajo || '';
    $('cs-tiempo').value = d.tiempo || '';
    $('cs-material').value = d.material || '';
    $('cs-ahc').checked = !!d.ahc;
    $('cs-ahc-fecha').value = d.ahcFecha || '';
    $('cs-ahc-hora').value = d.ahcHora || '';
    $('cs-salesman').checked = !!d.salesman;
    $('cs-customer').checked = !!d.customer;
    csRenderChecklist(d);
  }

  function csGuardarBorrador() {
    if (csTipo === 'pull') return;   // el Pull Sheet se guarda aparte
    const d = csLeer();
    try { localStorage.setItem(CS_KEY(csTipo), JSON.stringify(d)); } catch (e) {}
    if (csTipo !== 'trim') csCompartirLote(d.lote, csTipo);   // Trim-Out no comparte nada
  }

  // Lot# / Subdivision es el mismo en Rough-In y Pull Sheet: si cambia en una,
  // se actualiza en la otra. La hoja Trim-Out NO se llena sola nunca: se
  // escribe a mano y nada de otras hojas ni de las facturas la toca.
  const CS_HOJAS_LIGADAS = ['rough', 'pull'];
  function csCompartirLote(lote, origen) {
    lote = lote || '';
    CS_HOJAS_LIGADAS.forEach((t) => {
      if (t === origen) return;
      const clave = t === 'pull' ? ghLK('gh-cs-pull') : CS_KEY(t);
      try {
        const d = JSON.parse(localStorage.getItem(clave) || '{}') || {};
        if ((d.lote || '') === lote) return;
        d.lote = lote;
        localStorage.setItem(clave, JSON.stringify(d));
      } catch (e) {}
    });
  }

  // Desde Nueva Factura (botón 📋 de una línea): pone esa subdivisión (y la
  // fecha solo a Rough-In) en Rough-In y Pull Sheet. Trim-Out no se toca.
  function csAplicarDesdeFactura(lote, fecha) {
    if (csTipo === 'pull') psGuardarBorrador(); else csGuardarBorrador();
    CS_HOJAS_LIGADAS.forEach((t) => {
      const clave = t === 'pull' ? ghLK('gh-cs-pull') : CS_KEY(t);
      try {
        const d = JSON.parse(localStorage.getItem(clave) || '{}') || {};
        d.lote = lote;
        if (fecha && t !== 'pull') d.fecha = fecha;   // al Pull Sheet nunca se le pone la fecha sola
        localStorage.setItem(clave, JSON.stringify(d));
      } catch (e) {}
    });
    if (csTipo === 'pull') psLlenar(psLeerGuardado()); else csLlenar(csLeerGuardado(csTipo));
    const activo = typeof csActivo === 'undefined' || csActivo;
    toast(activo ? `Completion Sheets actualizadas: ${lote} ✓` : `Guardado en Completion Sheets: ${lote} (actívalas en Ajustes → Avanzado)`, 'success', 3000);
  }

  function csFechaUS(iso) {
    if (!iso) return '____/____/______';
    const p = iso.split('-'); return `${p[1]}/${p[2]}/${p[0]}`;
  }
  function csHora12(hhmm) {
    if (!hhmm) return '________';
    const [h, m] = hhmm.split(':').map(Number);
    return `${((h + 11) % 12) + 1}:${String(m).padStart(2, '0')} ${h >= 12 ? 'PM' : 'AM'}`;
  }

  // Estilo de la hoja impresa: medido sobre el PDF original de American
  // Heating & Cooling (papel carta 8½×11, letra Calibri). Todo en pulgadas y
  // puntos para que salga del mismo tamaño que el papel de verdad.
  const CS_PRINT_CSS = `
    @page { size: letter; margin: 0; }
    * { box-sizing: border-box; }
    html, body { margin: 0; padding: 0; background: #fff; }
    body { font-family: 'Carlito', 'Calibri', 'Helvetica Neue', Arial, sans-serif; color: #111;
           -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    .pag { width: 8.5in; padding: 0.62in 0.82in 0 0.85in; }
    .pag + .pag { page-break-before: always; break-before: page; }
    .t1 { text-align: center; font-weight: 700; font-size: 13.7pt; line-height: 0.23in; }
    .t3 { text-align: center; font-size: 15.5pt; line-height: 0.27in; margin-bottom: 0.05in; }
    .t3.b { font-weight: 700; }
    .enc { display: flex; }
    .enc .izq { width: 3.65in; }
    .enc .der { padding-left: 0; }
    .fila { height: 0.207in; line-height: 0.207in; white-space: nowrap; font-size: 12.5pt; }
    .der .fila { font-size: 11pt; }
    .campo { display: inline-block; border-bottom: 1px solid #111; line-height: 1.05; padding: 0 3px;
             font-size: 11pt; vertical-align: baseline; overflow: hidden; white-space: nowrap; }
    .caja { display: inline-block; width: 0.11in; height: 0.11in; border: 1px solid #111; margin-right: 0.06in;
            vertical-align: -0.01in; text-align: center; font-size: 8pt; line-height: 0.1in; }
    .etq { font-size: 12pt; height: 0.12in; line-height: 0.12in; margin-top: 0.07in; }
    .linea { height: 0.2in; border-bottom: 1px solid #333; font-size: 10.5pt; line-height: 0.2in;
             padding: 0 2px; white-space: nowrap; overflow: hidden; }
    .tiempo { font-size: 12pt; height: 0.2in; line-height: 0.2in; margin-top: 0.08in; white-space: nowrap; }
    .avisos { margin-top: 0.07in; }
    .avisos .fila { font-size: 12pt; height: 0.215in; line-height: 0.215in; }
    .chk-tit { font-size: 13.4pt; height: 0.26in; line-height: 0.26in; }
    .chk { display: flex; }
    .chk .col { width: 3.72in; }
    .chk .col + .col { width: 3.11in; }
    .it { display: flex; align-items: flex-start; min-height: 0.243in; font-size: 8.7pt; line-height: 1.15; }
    .it .rl { flex: 0 0 0.22in; height: 0.13in; border-bottom: 1px solid #111; margin-right: 0.25in;
              text-align: center; font-weight: 700; font-size: 9pt; line-height: 0.12in; }
    .col + .col .it .rl { margin-right: 0.08in; }
    .it .tx { flex: 1; padding-top: 0.005in; }
    .num { display: inline-block; min-width: 0.5in; border-bottom: 1px solid #111; text-align: center; }
  `;

  function csDocumento(paginas, titulo) {
    return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${escapeHtml(titulo || 'Completion Sheet')}</title>
      <link rel="preconnect" href="https://fonts.googleapis.com">
      <link href="https://fonts.googleapis.com/css2?family=Carlito:wght@400;700&display=block" rel="stylesheet">
      <style>${CS_PRINT_CSS}</style></head><body>${paginas.join('')}</body></html>`;
  }

  function csBuildPrint(d, tipo) {
    const hoja = CS_HOJAS[tipo];
    const caja = (on) => `<span class="caja">${on ? '✓' : ''}</span>`;
    const campo = (txt, ancho) => `<span class="campo" style="width:${ancho}in;">${escapeHtml(txt || '') || '&nbsp;'}</span>`;
    const fecha = (iso) => {
      if (!iso) return `${campo('', 0.3)}/${campo('', 0.3)}/${campo('', 0.42)}`;
      const p = iso.split('-');
      return `${campo(p[1], 0.3)}/${campo(p[2], 0.3)}/${campo(p[0], 0.42)}`;
    };
    const lineas = (txt, n) => {
      const partes = String(txt || '').split('\n');
      let out = '';
      for (let i = 0; i < n; i++) {
        const t = i === n - 1 ? partes.slice(i).join('  ') : (partes[i] || '');
        out += `<div class="linea">${escapeHtml(t)}</div>`;
      }
      return out;
    };
    const num = (k) => `<span class="num">${escapeHtml(d[k] || '') || '&nbsp;'}</span>`;
    const texto = (t) => escapeHtml(t).replace('{lbs}', num('lbs')).replace('{nitro}', num('nitro'));
    const col = (lista, pref) => lista.map((t, i) =>
      `<div class="it"><span class="rl">${d.checks && d.checks[pref + i] ? '✓' : ''}</span><span class="tx">${texto(t)}</span></div>`).join('');

    return `
      <div class="pag">
        <div class="t1">AMERICAN HEATING &amp; COOLING</div>
        <div class="t1">NEW CONSTRUCTION COMPLETION SHEET</div>
        <div class="t3${tipo === 'rough' ? ' b' : ''}">${hoja.titulo}</div>
        <div class="enc">
          <div class="izq">
            <div class="fila">DATE ${fecha(d.fecha)}</div>
            <div class="fila">LEADMAN ${campo(d.leadman, 2.35)}</div>
            <div class="fila">BUILDER NAME ${campo(d.builder, 2.0)}</div>
            <div class="fila">LOT#/SUBDIVISION ${campo(d.lote, 1.75)}</div>
          </div>
          <div class="der">
            <div class="fila">${caja(d.estado === 'completo')}Job is complete and ready for inspection</div>
            <div class="fila">${caja(d.estado === 'incompleto')}Job is not complete</div>
          </div>
        </div>
        <div class="etq">Additional work to be performed:</div>
        ${lineas(d.trabajo, 7)}
        <div class="tiempo">Time needed: ${campo(d.tiempo, 3.95)}</div>
        <div class="etq" style="margin-top:0.15in;">Material needed:</div>
        ${lineas(d.material, 5)}
        <div class="avisos">
          <div class="fila">${caja(d.ahc)}AHC informed / scheduled for ${d.ahcFecha ? fecha(d.ahcFecha) : fecha('')} &nbsp;Time ${campo(d.ahcHora ? csHora12(d.ahcHora) : '', 0.55)}</div>
          <div class="fila">${caja(d.salesman)}Salesman informed</div>
          <div class="fila">${caja(d.customer)}Customer informed</div>
        </div>
        <div class="chk-tit">CHECKLIST</div>
        <div class="chk">
          <div class="col">${col(hoja.izq, 'L')}</div>
          <div class="col">${col(hoja.der, 'R')}</div>
        </div>
      </div>`;
  }

  function csCambiarTipo(tipo) {
    if (tipo === csTipo) return;
    if (csTipo === 'pull') { if (psModo === 'editar') psCambiarModo('llenar'); psGuardarBorrador(); } else csGuardarBorrador();   // guarda la hoja que estaba en pantalla
    csTipo = tipo;
    csMostrarForma();
    if (tipo === 'pull') psLlenar(psLeerGuardado());
    else csLlenar(csLeerGuardado(tipo));
  }

  // Rough-In / Trim-Out usan la forma con checklist; el Pull Sheet la suya.
  function csMostrarForma() {
    const esPull = csTipo === 'pull';
    $('cs-form-pull').style.display = esPull ? '' : 'none';
    $('cs-form-check').style.display = esPull ? 'none' : '';
    $('cs-btn-imprimir-ambas').style.display = esPull ? 'none' : '';
    $('cs-btn-imprimir').textContent = esPull ? '🖨 Imprimir (2 páginas)' : '🖨 Imprimir esta';
    document.querySelectorAll('.cs-tipo-btn').forEach((b) => b.classList.toggle('active', b.dataset.cstipo === csTipo));
    if (esPull) { $('cs-titulo').textContent = 'Trim Out Pull Sheet'; requestAnimationFrame(psAplicarZoom); }
  }

  (function csIniciar() {
    if (!$('cs-checklist')) return;
    // Pasar el borrador de la versión anterior (solo había Trim-Out)
    try {
      const viejo = localStorage.getItem('gh-trimout-borrador');
      if (viejo && !localStorage.getItem(CS_KEY('trim'))) {
        localStorage.setItem(CS_KEY('trim'), viejo);
      }
      localStorage.removeItem('gh-trimout-borrador');
      localStorage.removeItem('gh-cs-comun');   // ya no se usa: las hojas son independientes
    } catch (e) {}

    csLlenar(csLeerGuardado(csTipo));
    ['cs-fecha','cs-leadman','cs-builder','cs-lote','cs-trabajo','cs-tiempo','cs-material','cs-ahc','cs-ahc-fecha','cs-ahc-hora','cs-salesman','cs-customer','cs-completo','cs-incompleto']
      .forEach((id) => { const el = $(id); if (el) { el.addEventListener('input', csGuardarBorrador); el.addEventListener('change', csGuardarBorrador); } });

    // "Job is complete" / "Job is not complete" son opcionales: al tocar la
    // que ya estaba marcada, se destoca (queda sin ninguna elegida).
    document.querySelectorAll('input[name="cs-estado"]').forEach((r) => {
      r.addEventListener('click', () => {
        if (csEstadoAntes === r.value) {
          r.checked = false;
          csEstadoAntes = '';
          csGuardarBorrador();
        } else {
          csEstadoAntes = r.value;
        }
      });
    });

    document.querySelectorAll('.cs-tipo-btn').forEach((b) => b.addEventListener('click', () => csCambiarTipo(b.dataset.cstipo)));

    $('cs-btn-imprimir').addEventListener('click', () => {
      if (csTipo === 'pull') {
        psGuardarBorrador();
        const dp = psLeerGuardado();
        const tp = `Pull Sheet ${dp.lote || ''}`.trim();
        ghImprimirEnVentana('', tp, psDocumento(tp));
        toast('En la ventana de impresión elige "Doble cara" para frente y vuelta', 'info', 4500);
        return;
      }
      csGuardarBorrador();
      const d = csLeerGuardado(csTipo);
      const titulo = `${CS_HOJAS[csTipo].nombre} ${d.lote || ''}`.trim();
      ghImprimirEnVentana('', titulo, csDocumento([csBuildPrint(d, csTipo)], titulo));
    });

    // Las dos hojas en dos páginas (Rough-In primero, Trim-Out después), para
    // imprimir a doble cara: una al frente y otra al reverso de la misma hoja.
    $('cs-btn-imprimir-ambas').addEventListener('click', () => {
      csGuardarBorrador();
      const rough = csLeerGuardado('rough');
      const trim = csLeerGuardado('trim');
      const titulo = `Completion ${rough.lote || trim.lote || ''}`.trim();
      ghImprimirEnVentana('', titulo, csDocumento([csBuildPrint(rough, 'rough'), csBuildPrint(trim, 'trim')], titulo));
      toast('En la ventana de impresión elige "Doble cara" para frente y vuelta', 'info', 4500);
    });

    $('cs-btn-limpiar').addEventListener('click', async () => {
      if (csTipo === 'pull') {
        if (!await gcConfirm('¿Limpiar el Pull Sheet para empezar uno nuevo?', { okText: 'Limpiar' })) return;
        try { localStorage.removeItem(ghLK(PS_KEY)); } catch (e) {}
        psLlenar({});
        toast('Hoja limpia', 'info', 1500);
        return;
      }
      if (!await gcConfirm(`¿Limpiar la hoja de ${CS_HOJAS[csTipo].nombre} para empezar una nueva?`, { okText: 'Limpiar' })) return;
      try { localStorage.removeItem(CS_KEY(csTipo)); } catch (e) {}
      csLlenar({});
      toast('Hoja limpia', 'info', 1500);
    });
  })();
  // FIN MÓDULO COMPLETION SHEETS
  // ====================================================================

