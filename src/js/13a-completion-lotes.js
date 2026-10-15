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
    const t = glNorm(txt).replace(/[^a-z0-9]+/g, ' ').trim().split(' ').filter((w) => w && !CSL_PALABRAS_FUERA.has(w));
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
    csCambiarTipo(e.rough || !e.pull ? 'rough' : 'pull');
    cslBanner(e.lote);
    toast(`Abierto: ${e.lote}`, 'success', 1800);
  }

  // ---------- Armar el documento para imprimir ----------
  // Orden (para doble cara): facturas primero (cada una con su vuelta en
  // blanco), y por cada lote: Rough-In al frente / Trim-Out atrás, y el Pull
  // Sheet en otra hoja (sus dos páginas, frente y vuelta).
  function ghDocumentoHojas(o) {
    const incluir = Object.assign({ rough: true, trim: true, pull: true }, o.incluir || {});
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
      (o.entradas || []).forEach((e) => {
        const r = incluir.rough && e.rough, t = incluir.trim && e.trim;
        if (r) paginas.push(`<div class="hoja">${csBuildPrint(e.rough, 'rough')}</div>`);
        if (t) paginas.push(`<div class="hoja">${csBuildPrint(e.trim, 'trim')}</div>`);
        if (o.doble && (r ? 1 : 0) + (t ? 1 : 0) === 1) paginas.push(blanca);
        if (incluir.pull && e.pull) paginas.push(`<div class="hoja">${psBuildPrint(e.pull)}</div>`);
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

  function cslFacturasDe(clave, docs) {
    return (docs || []).filter((inv) => (inv.items || []).some((it) => cslCoincide(clave, it.location)));
  }

  // ---------- Pestaña 🖨 Imprimir ----------
  let cslVisible = false;
  const cslMarcados = new Set();
  function cslMostrar(si) {
    cslVisible = !!si;
    const f = $('cs-form-imprimir'), h = $('cs-form-hojas');
    if (f) f.style.display = si ? '' : 'none';
    if (h) h.style.display = si ? 'none' : '';
    document.querySelectorAll('.cs-tipo-btn').forEach((b) => b.classList.toggle('active', si ? b.dataset.cstipo === 'imprimir' : b.dataset.cstipo === csTipo));
    if (si) { cslCargar(true).then(cslRender); cslRender(); }
  }
  window.GH_CSL_MOSTRAR = cslMostrar;
  function cslRender() {
    const cont = $('csl-lista'); if (!cont) return;
    const q = cslClave(($('csl-buscar') || {}).value || '');
    const filas = Object.entries(cslDatos).filter(([k, e]) => e && (!q || q.split('-').every((w) => k.split('-').some((x) => x.startsWith(w)))))
      .sort((a, b) => String(b[1].en || '').localeCompare(String(a[1].en || '')));
    const docs = typeof invDocs !== 'undefined' ? invDocs : [];
    cont.innerHTML = filas.length ? filas.map(([k, e]) => {
      const facts = cslFacturasDe(k, docs);
      const tags = [['rough', 'Rough-In'], ['trim', 'Trim-Out'], ['pull', 'Pull Sheet']].map(([t, n]) => `<span class="csl-tag${e[t] ? ' si' : ''}">${n}</span>`).join('');
      return `<div class="csl-fila${cslMarcados.has(k) ? ' on' : ''}" data-k="${escapeHtml(k)}">
        <label class="csl-sel"><input type="checkbox" ${cslMarcados.has(k) ? 'checked' : ''}><span><b>${escapeHtml(e.lote || k)}</b>
          <small>${tags}${facts.length ? ` <span class="csl-tag si">Factura ${facts.map((f) => '#' + escapeHtml(f.numero || '')).join(', ')}</span>` : ''}</small></span></label>
        <div class="csl-acc"><button type="button" class="gc-action-btn csl-abrir">Abrir</button><button type="button" class="gc-del csl-borrar" aria-label="Borrar">✕</button></div>
      </div>`;
    }).join('') : `<div class="gc-empty" style="display:block;">${Object.keys(cslDatos).length ? 'Ningún lote coincide.' : 'Todavía no hay hojas guardadas. Llena una hoja con su LOT#/SUBDIVISION y se guarda sola aquí.'}</div>`;
    cont.querySelectorAll('.csl-fila').forEach((f) => {
      const k = f.dataset.k;
      f.querySelector('input').addEventListener('change', (ev) => { if (ev.target.checked) cslMarcados.add(k); else cslMarcados.delete(k); f.classList.toggle('on', ev.target.checked); cslCuenta(); });
      f.querySelector('.csl-abrir').addEventListener('click', () => cslAbrir(k));
      f.querySelector('.csl-borrar').addEventListener('click', async () => {
        if (!await gcConfirm(`¿Borrar las hojas guardadas de "${cslDatos[k].lote}"?`, { okText: 'Borrar', danger: true })) return;
        delete cslDatos[k]; cslMarcados.delete(k);
        try { await window.storage.set(CSL_KEY, JSON.stringify(cslDatos)); toast('Hojas borradas', 'info'); } catch (e) { toast('No se pudo borrar', 'error'); }
        cslRender();
      });
    });
    cslCuenta();
  }
  function cslCuenta() {
    const n = [...cslMarcados].filter((k) => cslDatos[k]).length;
    if ($('csl-cuenta')) $('csl-cuenta').textContent = n ? `${n} lote${n === 1 ? '' : 's'} marcado${n === 1 ? '' : 's'}` : 'Marca uno o más lotes';
    if ($('csl-imprimir')) $('csl-imprimir').disabled = !n;
  }
  if ($('csl-buscar')) $('csl-buscar').addEventListener('input', debounce(cslRender, 150));
  if ($('csl-imprimir')) $('csl-imprimir').addEventListener('click', () => {
    const claves = [...cslMarcados].filter((k) => cslDatos[k]);
    const docs = typeof invDocs !== 'undefined' ? invDocs : [];
    const facturas = $('csl-op-factura').checked ? [...new Set(claves.flatMap((k) => cslFacturasDe(k, docs)))] : [];
    window.GH_IMPRIMIR_HOJAS({
      entradas: claves.map((k) => cslDatos[k]), facturas,
      incluir: { rough: $('csl-op-rough').checked, trim: $('csl-op-trim').checked, pull: $('csl-op-pull').checked },
      doble: $('csl-op-doble').checked,
      titulo: claves.length === 1 ? `Hojas ${cslDatos[claves[0]].lote}` : `Hojas (${claves.length} lotes)`
    });
  });

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

