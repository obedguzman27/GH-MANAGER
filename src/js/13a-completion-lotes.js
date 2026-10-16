  // ====================================================================
  // COMPLETION SHEETS GUARDADAS POR LOTE Y COLONIA + IMPRIMIR
  // Cada hoja (Rough-In, Trim-Out, Pull Sheet) se guarda sola en la nube
  // bajo su LOT#/SUBDIVISION (ej. "Greystone 165"), en "gh-completion":
  //   { "165-greystone": { lote, rough:{...}, trim:{...}, pull:{...}, en, por } }
  // "Lot 165 Greystone" y "greystone 165" son el mismo lote.
  // La pestaña 🖨 Imprimir junta todo para imprimir de una vez; el visor
  // también puede imprimir (hojas + factura del lote).
  // ====================================================================
  const CSL_KEY = 'gh-completion';
  const CSL_PALABRAS_FUERA = new Set(['lot', 'lote', 'lt', 'no', 'num', 'number', 'subdivision', 'sub']);
  function cslClave(txt) {
    // "Timberwalk124" = "Timberwalk 124"
    const t = glNorm(txt).replace(/([a-z])(\d)/g, '$1 $2').replace(/[^a-z0-9]+/g, ' ').trim().split(' ').filter((w) => w && !CSL_PALABRAS_FUERA.has(w));
    return [...new Set(t)].sort().join('-');
  }
  // ¿Esta línea de factura (ej. "Lot 165 Greystone Ph 2") es de este lote?
  function cslCoincide(clave, texto) {
    if (!clave) return false;
    const tiene = new Set(cslClave(texto).split('-'));
    return clave.split('-').every((w) => tiene.has(w));
  }
  window.GH_CSL_CLAVE = cslClave;
  window.GH_CSL_COINCIDE = cslCoincide;

  let cslDatos = {};
  let cslCargaProm = null;
  function cslCargar(forzar) {
    if (cslCargaProm && !forzar) return cslCargaProm;
    cslCargaProm = (async () => {
      try { const r = await window.storage.get(CSL_KEY); const v = JSON.parse(r.value); cslDatos = v && typeof v === 'object' && !Array.isArray(v) ? v : {}; }
      catch (e) { if (!(e && e.sinSenal)) cslDatos = {}; }
      return cslDatos;
    })();
    return cslCargaProm;
  }

  // ¿La hoja tiene algo escrito además del lote?
  function cslTieneDatos(tipo, d) {
    if (!d) return false;
    if (tipo === 'pull') return !!(d.fecha || d.job || d.builder || d.puller || d.installer || (d.q && Object.keys(d.q).length));
    return !!(d.fecha || d.leadman || d.builder || d.estado || d.trabajo || d.tiempo || d.material || d.ahc || d.salesman || d.customer || d.lbs || d.nitro ||
      (d.checks && Object.values(d.checks).some(Boolean)));
  }

  const cslTimers = {}, cslUltima = {}, cslCreadas = new Set();
  function cslProgramar(tipo, d) {
    if (window.GH_ROL === 'visor' || !d || !String(d.lote || '').trim()) return;
    clearTimeout(cslTimers[tipo]);
    const copia = JSON.parse(JSON.stringify(d));
    cslTimers[tipo] = setTimeout(() => cslGuardarHoja(tipo, copia).catch(() => {}), 1200);
  }
  async function cslGuardarHoja(tipo, d) {
    const clave = cslClave(d.lote);
    if (!clave || !cslTieneDatos(tipo, d)) return;
    await cslCargar();
    // Si mientras escribías el lote se guardó uno a medias ("Greystone 16"),
    // ese se quita y queda solo el bueno
    const prev = cslUltima[tipo];
    // (solo si el anterior era el mismo lote escrito a medias: "1 oak" → "12 oak")
    const aMedias = (a, b) => a.split('-').every((w) => b.split('-').some((x) => x.startsWith(w)));
    if (prev && prev !== clave && aMedias(prev, clave) && cslCreadas.has(prev) && cslDatos[prev]) {
      const otras = ['rough', 'trim', 'pull'].filter((t) => t !== tipo && cslDatos[prev][t]);
      if (!otras.length) delete cslDatos[prev]; else delete cslDatos[prev][tipo];
    }
    cslUltima[tipo] = clave;
    if (!cslDatos[clave]) { cslDatos[clave] = { lote: d.lote }; cslCreadas.add(clave); }
    const e = cslDatos[clave];
    e[tipo] = d; e.lote = d.lote; e.en = new Date().toISOString(); e.por = window.GH_NOMBRE || '';
    try {
      await window.storage.set(CSL_KEY, JSON.stringify(cslDatos));
      cslBanner(d.lote);
      cslRender();
    } catch (err) { toast('No se pudo guardar la hoja en la nube: ' + ((err && err.message) || err), 'error', 5000); }
  }
  function cslBanner(lote) {
    const b = $('cs-lote-guardado'); if (!b) return;
    b.innerHTML = lote ? `☁ Guardada en <b>${escapeHtml(lote)}</b> · ${new Date().toLocaleTimeString('es-MX', { hour: 'numeric', minute: '2-digit' })}` : '';
    b.classList.toggle('on', !!lote);
  }

  // Abrir un lote guardado: pone sus hojas en pantalla para seguir llenándolas
  function cslAbrir(clave) {
    const e = cslDatos[clave]; if (!e) return;
    try {
      ['rough', 'trim'].forEach((t) => localStorage.setItem(CS_KEY(t), JSON.stringify(e[t] || { lote: e.lote })));
      localStorage.setItem(ghLK(PS_KEY), JSON.stringify(e.pull || { lote: e.lote }));
    } catch (err) {}
    ['rough', 'trim', 'pull'].forEach((t) => { cslUltima[t] = clave; });
    cslMostrar(false);
    csTipo = '';            // fuerza que se vuelva a pintar
    csCambiarTipo(e.rough || !e.trim ? 'rough' : 'trim');
    const sec = $('inv-sub-completion'); if (sec) sec.scrollIntoView({ behavior: 'smooth', block: 'start' });
    cslBanner(e.lote);
    toast(`Abierto: ${e.lote}`, 'success', 1800);
  }

  // ---------- De la factura a las Completion Sheets ----------
  // Cada línea de la factura con ROUGH / TRIM pasa sola su fecha y su
  // SUBDIVISION al lote (mismas reglas que las hojas):
  //  - Rough-In: lote + fecha. El Pull Sheet va ligado al Rough-In: recibe el
  //    lote, pero nunca la fecha sola.
  //  - Trim-Out: lote + fecha.
  //  - Leadman y builder se comparten entre las hojas del mismo lote; si el
  //    lote es nuevo se usa el último leadman que se escribió.
  //  - "Bradshaw Farms 118,119,128" = tres lotes.
  //  - Lo que ya está escrito en la hoja no se borra (solo se pone la fecha).
  function cslTiposDeTrabajo(work) {
    const w = glNorm(work || '');
    const t = [];
    if (/\brough|\br\s*\/\s*i\b/.test(w)) t.push('rough');
    if (/\btrim|\bt\s*\/\s*o\b/.test(w)) t.push('trim');
    return t;
  }
  function cslDividirLotes(loc) {
    const txt = String(loc || '').trim();
    const m = txt.match(/^(.*?[a-z].*?)\s+(\d+[a-z]?(?:\s*(?:,|&|\by\b|\band\b)\s*\d+[a-z]?)+)\s*$/i);
    if (!m) return txt ? [txt] : [];
    return m[2].split(/\s*(?:,|&|\by\b|\band\b)\s*/i).filter(Boolean).map((n) => `${m[1].trim()} ${n}`);
  }
  function cslUltimoLeadman() {
    const e = Object.values(cslDatos).filter(Boolean).sort((a, b) => String(b.en || '').localeCompare(String(a.en || '')));
    for (const x of e) { const l = (x.rough && x.rough.leadman) || (x.trim && x.trim.leadman); if (l) return l; }
    try { return (JSON.parse(localStorage.getItem(CS_KEY('rough')) || '{}') || {}).leadman || ''; } catch (err) { return ''; }
  }
  // lineas: [{ location, work, dia }]; tipos forzados (botón 📋 de la línea) opcional
  async function cslDesdeLineas(lineas, forzar) {
    await cslCargar(true);
    const lead = cslUltimoLeadman();
    const hechos = [];
    lineas.forEach((it) => {
      const tipos = forzar || cslTiposDeTrabajo(it.work);
      if (!tipos.length) return;
      cslDividirLotes(it.location).forEach((lote) => {
        const k = cslClave(lote); if (!k) return;
        const e = cslDatos[k] || (cslDatos[k] = { lote });
        const comp = e.rough || e.trim || {};
        const compartido = { leadman: comp.leadman || lead || '', builder: comp.builder || '' };
        const poner = (t, conFecha) => {
          const d = e[t] ? { ...e[t] } : { checks: {} };
          d.lote = d.lote || e.lote || lote;
          if (t !== 'pull') {
            if (!d.leadman && compartido.leadman) d.leadman = compartido.leadman;
            if (!d.builder && compartido.builder) d.builder = compartido.builder;
            if (conFecha && it.dia) d.fecha = it.dia;
          } else if (!d.builder && compartido.builder) d.builder = compartido.builder;
          e[t] = d;
        };
        tipos.forEach((t) => poner(t, true));
        e.lote = e.lote || lote; e.en = new Date().toISOString(); e.por = window.GH_NOMBRE || '';
        hechos.push(`${e.lote} (${tipos.map((t) => (t === 'rough' ? 'Rough-In' : 'Trim-Out')).join(' + ')})`);
      });
    });
    if (!hechos.length) return [];
    await window.storage.set(CSL_KEY, JSON.stringify(cslDatos));
    cslRender();
    return [...new Set(hechos)];
  }
  window.GH_CSL_DESDE_LINEAS = cslDesdeLineas;

  // Casilla en la factura: "Pasar a Completion Sheets" (se recuerda)
  const CSL_AUTO_KEY = () => ghLK('gh-inv-cs-auto');
  function cslAutoActivo() {
    try { return localStorage.getItem(CSL_AUTO_KEY()) !== '0'; } catch (e) { return true; }
  }
  if ($('inv-cs-auto')) {
    $('inv-cs-auto').checked = cslAutoActivo();
    $('inv-cs-auto').addEventListener('change', (ev) => { try { localStorage.setItem(CSL_AUTO_KEY(), ev.target.checked ? '1' : '0'); } catch (e) {} });
  }
  // Se llama al guardar la factura
  window.GH_CSL_FACTURA_GUARDADA = async (inv) => {
    if (typeof csActivo !== 'undefined' && !csActivo) return;
    if (!$('inv-cs-auto') || !$('inv-cs-auto').checked) return;
    try {
      const hechos = await cslDesdeLineas(inv.items || []);
      if (hechos.length) toast(`📋 Completion Sheets: ${hechos.slice(0, 3).join(', ')}${hechos.length > 3 ? ` y ${hechos.length - 3} más` : ''}`, 'success', 4500);
    } catch (e) { toast('La factura se guardó, pero no se pudieron pasar las Completion Sheets: ' + ((e && e.message) || e), 'error', 5000); }
  };

  // ---------- Armar el documento para imprimir ----------
  // Orden (para doble cara): facturas primero (cada una con su vuelta en
  // blanco), y por cada lote: Rough-In al frente / Trim-Out atrás, y el Pull
  // Sheet en otra hoja (sus dos páginas, frente y vuelta). Siempre salen las
  // tres aunque alguna no se haya llenado (sale en blanco con el lote).
  function ghDocumentoHojas(o) {
    const incluir = Object.assign({ rough: true, trim: true }, o.incluir || {}, { pull: false });   // el Pull Sheet ya no se imprime
    const paginas = [];
    const blanca = '<div class="hoja blanca"></div>';
    const layoutAntes = psLayout;
    const cfgAntes = { n: cfgFacturaNombre, l: cfgLogoDataUrl, c: cfgFacturaColor };
    try {
      if (o.layout) { try { psLayout = psNormalizar(o.layout); } catch (e) {} }
      if (o.cfg) { cfgFacturaNombre = o.cfg.nombre || cfgFacturaNombre; cfgLogoDataUrl = o.cfg.logo || ''; cfgFacturaColor = o.cfg.color || cfgFacturaColor; }
      (o.facturas || []).forEach((inv) => {
        paginas.push(`<div class="hoja inv-pag">${invBuildPrint(inv)}</div>`);
        if (o.doble) paginas.push(blanca);
      });
      // Las hojas que falten (ej. Trim-Out sin llenar) salen en blanco con el lote
      (o.entradas || []).forEach((e) => {
        const vacia = { lote: e.lote || '', checks: {} };
        const r = incluir.rough, t = incluir.trim;
        if (r) paginas.push(`<div class="hoja">${csBuildPrint(e.rough || vacia, 'rough')}</div>`);
        if (t) paginas.push(`<div class="hoja">${csBuildPrint(e.trim || vacia, 'trim')}</div>`);
        if (o.doble && (r ? 1 : 0) + (t ? 1 : 0) === 1) paginas.push(blanca);
        if (incluir.pull) paginas.push(`<div class="hoja">${psBuildPrint(e.pull || { lote: e.lote || '', q: {} })}</div>`);
      });
    } finally {
      psLayout = layoutAntes;
      cfgFacturaNombre = cfgAntes.n; cfgLogoDataUrl = cfgAntes.l; cfgFacturaColor = cfgAntes.c;
    }
    if (!paginas.length) return null;
    const titulo = o.titulo || 'Completion sheets';
    return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${escapeHtml(titulo)}</title>
      <link rel="preconnect" href="https://fonts.googleapis.com">
      <link href="https://fonts.googleapis.com/css2?family=Carlito:wght@400;700&display=block" rel="stylesheet">
      <style>${CS_PRINT_CSS}${PS_PRINT_CSS}
        .hoja { break-before: page; page-break-before: always; }
        .hoja:first-child { break-before: auto; page-break-before: auto; }
        .hoja > .pag:first-child, .hoja > .ps-pag:first-child { break-before: auto !important; page-break-before: auto !important; }
        .hoja.blanca { height: 1px; }
        .inv-pag { width: 8.5in; padding: 0.55in 0.6in; font-family: Arial, Helvetica, sans-serif; font-size: 12.5px; color: #1a1a1a; }
        .inv-pag table { border-collapse: collapse; }
      </style></head><body>${paginas.join('')}</body></html>`;
  }
  window.GH_IMPRIMIR_HOJAS = (o) => {
    const doc = ghDocumentoHojas(o);
    if (!doc) { toast('No hay nada que imprimir con lo que marcaste', 'info'); return false; }
    ghImprimirEnVentana('', o.titulo || 'Completion sheets', doc);
    if (o.doble) toast('En la ventana de impresión elige "Doble cara" (frente y vuelta)', 'info', 4500);
    return true;
  };

  // Facturas guardadas: si todavía no se abrió la pestaña Facturas en esta
  // sesión, se leen aquí (antes salían vacías)
  let cslInvCache = null;
  function cslDocs() { return (typeof invDocs !== 'undefined' && invDocs.length) ? invDocs : (cslInvCache || []); }
  async function cslCargarFacturas() {
    if (typeof invDocs !== 'undefined' && invDocs.length) return invDocs;
    try { const r = await window.storage.get(INV_KEY); const v = JSON.parse(r.value); cslInvCache = Array.isArray(v) ? v : []; } catch (e) { if (!cslInvCache) cslInvCache = []; }
    return cslInvCache;
  }
  function cslFacturasDe(clave, docs) {
    return (docs || []).filter((inv) => (inv.items || []).some((it) => cslCoincide(clave, it.location)));
  }

  // ---------- Hojas guardadas (abajo de la factura) ----------
  // Cada base tiene las suyas (gh-completion se guarda por base).
  function cslMostrar() {
    const h = $('cs-form-hojas'); if (h) h.style.display = '';
    document.querySelectorAll('.cs-tipo-btn').forEach((b) => b.classList.toggle('active', b.dataset.cstipo === csTipo));
  }
  window.GH_CSL_MOSTRAR = cslMostrar;
  function cslRender() {
    const cont = $('csl-lista'); if (!cont) return;
    const q = cslClave(($('csl-buscar') || {}).value || '');
    const filas = Object.entries(cslDatos).filter(([k, e]) => e && (e.rough || e.trim) && (!q || q.split('-').every((w) => k.split('-').some((x) => x.startsWith(w)))))
      .sort((a, b) => String(b[1].en || '').localeCompare(String(a[1].en || '')));
    const docs = cslDocs();
    const total = filas.length;
    cont.innerHTML = total ? filas.slice(0, 60).map(([k, e]) => {
      const facts = cslFacturasDe(k, docs);
      const fecha = (e.rough && e.rough.fecha) || (e.trim && e.trim.fecha) || '';
      const tags = [['rough', 'Rough-In'], ['trim', 'Trim-Out']].map(([t, n]) => `<span class="csl-tag${e[t] ? ' si' : ''}">${n}${e[t] && e[t].fecha ? ' ' + escapeHtml(csFechaUS(e[t].fecha).slice(0, 5)) : ''}</span>`).join('');
      return `<div class="csl-fila" data-k="${escapeHtml(k)}">
        <div class="csl-sel"><span><b>${escapeHtml(e.lote || k)}</b>
          <small>${tags}${facts.length ? ` <span class="csl-tag si">Factura ${facts.map((f) => '#' + escapeHtml(f.numero || '')).join(', ')}</span>` : ''}</small></span></div>
        <div class="csl-acc"><button type="button" class="gc-action-btn csl-abrir">Abrir</button><button type="button" class="gc-action-btn csl-imp" title="Imprimir Rough-In y Trim-Out">🖨</button><button type="button" class="gc-del csl-borrar" aria-label="Borrar">✕</button></div>
      </div>`;
    }).join('') + (total > 60 ? `<div class="gc-empty" style="display:block;">Y ${total - 60} más… usa el buscador.</div>` : '')
      : `<div class="gc-empty" style="display:block;">${Object.keys(cslDatos).length && q ? 'Ningún lote coincide.' : 'Todavía no hay hojas guardadas. Llena una hoja con su LOT#/SUBDIVISION o guarda una factura con Rough-In / Trim-Out.'}</div>`;
    cont.querySelectorAll('.csl-fila').forEach((f) => {
      const k = f.dataset.k;
      f.querySelector('.csl-abrir').addEventListener('click', () => cslAbrir(k));
      f.querySelector('.csl-imp').addEventListener('click', () => {
        const e = cslDatos[k]; if (!e) return;
        window.GH_IMPRIMIR_HOJAS({ entradas: [e], doble: true, titulo: `Completion ${e.lote || ''}`.trim() });
      });
      f.querySelector('.csl-borrar').addEventListener('click', async () => {
        if (!await gcConfirm(`¿Borrar las hojas guardadas de "${cslDatos[k].lote}"?`, { okText: 'Borrar', danger: true })) return;
        delete cslDatos[k];
        try { await window.storage.set(CSL_KEY, JSON.stringify(cslDatos)); toast('Hojas borradas', 'info'); } catch (e) { toast('No se pudo borrar', 'error'); }
        cslRender();
      });
    });
  }
  if ($('csl-buscar')) $('csl-buscar').addEventListener('input', debounce(cslRender, 150));
  // Cargar la lista al abrir Facturas
  document.querySelectorAll('.gc-tab[data-tab="facturas"], .inv-subtab[data-sub="nueva"]').forEach((b) => b.addEventListener('click', () => {
    Promise.all([cslCargar(true), cslCargarFacturas()]).then(cslRender).catch(() => {});
  }));

  // Factura guardada → imprimir la factura con las hojas de sus lotes
  async function cslImprimirFacturaConHojas(inv) {
    await cslCargar(true);
    const claves = Object.keys(cslDatos).filter((k) => (inv.items || []).some((it) => cslCoincide(k, it.location)));
    if (!claves.length) toast('Esta factura no tiene completion sheets guardadas; se imprime sola', 'info', 3500);
    window.GH_IMPRIMIR_HOJAS({ facturas: [inv], entradas: claves.map((k) => cslDatos[k]), doble: true, titulo: `Invoice ${inv.numero || ''} + hojas` });
  }

  // Datos de la compañía para que el visor pueda imprimir la factura
  // (nombre, dirección, logo y colores; nada de socios ni dinero)
  async function cslPublicarFactura() {
    if (window.GH_ROL === 'visor' || !cfgCargada) return;
    const pub = { nombre: cfgFacturaNombre || '', direccion: cfgFacturaDireccion || '', logo: cfgLogoDataUrl || '', color: cfgFacturaColor || 'clasico' };
    const marca = 'gh-fpub:' + ((window.GH_GET_CUENTA && window.GH_GET_CUENTA()) || 'principal');
    const txt = JSON.stringify(pub);
    try { if (localStorage.getItem(marca) === txt) return; } catch (e) {}
    try { await window.storage.set('gh-factura-pub', txt); localStorage.setItem(marca, txt); } catch (e) {}
  }
  window.GH_PUBLICAR_FACTURA = cslPublicarFactura;
  setTimeout(cslPublicarFactura, 8000);

