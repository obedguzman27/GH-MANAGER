  // ====================================================================
  // MÓDULO: PLANOS (fotos de planos, buscables por nombre/constructor)
  // ====================================================================
  const PLANOS_KEY = 'gh-planos';
  let planos = [];
  let planosCargados = false;
  let plnEditandoId = null;
  let plnFotosActuales = [];

  async function plnCargarDatos() {
    if (planosCargados) return;
    planosCargados = true;
    const r = await window.storage.get(PLANOS_KEY).catch(() => null);
    try { planos = JSON.parse(r.value); } catch (e) { planos = []; }
    // Misma migración que Calendario: separa fotos guardadas con el formato
    // viejo (todas juntas en el mismo bloque) para que el guardado principal
    // se quede liviano sin importar cuántas fotos tenga cada plano.
    let huboMigracion = false;
    for (const p of planos) {
      if (Array.isArray(p.fotos) && p.fotos.length && p.fotos[0] && p.fotos[0].dataUrl) {
        try { await plnGuardarFotosDe(p.id, p.fotos); } catch (e) {}
        p.numFotos = p.fotos.length;
        try { p.portada = await plnMiniPortada(p.fotos[0].dataUrl); } catch (e) {}
        delete p.fotos;
        huboMigracion = true;
      }
    }
    if (huboMigracion) { try { await plnGuardar(); } catch (e) {} }
    plnRender();
    plnRenderEditar();
  }
  async function plnGuardar() {
    const liviano = planos.map((p) => { const { fotos, ...resto } = p; return resto; });
    try { await window.storage.set(PLANOS_KEY, JSON.stringify(liviano)); } catch (e) {}
  }
  async function plnGuardarFotosDe(id, fotos) {
    try { await window.storage.set('gh-plano-fotos-' + id, JSON.stringify(fotos)); } catch (e) {}
  }
  async function plnCargarFotosDe(id) {
    const r = await window.storage.get('gh-plano-fotos-' + id).catch(() => null);
    try { return JSON.parse(r.value); } catch (e) { return []; }
  }
  function plnMiniPortada(dataUrlOrigen) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        const w0 = 260, h0 = 195; // 4:3, coincide con la tarjeta de la cuadrícula
        const canvas = document.createElement('canvas');
        canvas.width = w0; canvas.height = h0;
        const ctx = canvas.getContext('2d');
        const escala = Math.max(w0 / img.width, h0 / img.height);
        const w = img.width * escala, h = img.height * escala;
        ctx.drawImage(img, (w0 - w) / 2, (h0 - h) / 2, w, h);
        resolve(canvas.toDataURL('image/jpeg', 0.62));
      };
      img.onerror = reject;
      img.src = dataUrlOrigen;
    });
  }

  function plnRefreshDlConstructores() {
    const dl = $('dl-planos-constructores');
    if (!dl) return;
    const nombres = [...new Set(planos.map((p) => p.constructor).filter(Boolean))].sort();
    dl.innerHTML = nombres.map((n) => `<option value="${escapeHtml(n)}">`).join('');
  }

  const PLN_ICONO_VACIO = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="M21 15l-5-5-9 9"/></svg>`;

  // ---- Ver planos: cuadrícula, tocar abre el visor de fotos ----
  function plnRender() {
    if (!$('pln-grid')) return;
    const filtro = ($('pln-buscar').value || '').trim().toLowerCase();
    const filtrados = planos.filter((p) => !filtro
      || (p.nombre || '').toLowerCase().includes(filtro)
      || (p.constructor || '').toLowerCase().includes(filtro));

    $('pln-empty').style.display = planos.length === 0 ? 'block' : 'none';
    $('pln-grid').style.display = planos.length === 0 ? 'none' : 'grid';

    const grid = $('pln-grid');
    grid.innerHTML = '';
    filtrados.forEach((p) => {
      const card = document.createElement('div');
      card.className = 'pln-card sel-item sel-card';
      card.dataset.selid = p.id;
      card.innerHTML = `
        <div class="pln-card-foto-wrap">
          <div class="pln-card-foto">${p.portada ? `<img src="${p.portada}">` : PLN_ICONO_VACIO}</div>
        </div>
        <div class="pln-card-body">
          <div class="pln-card-nombre">${escapeHtml(p.nombre || '(sin nombre)')}</div>
          <div class="pln-card-constructor">${escapeHtml(p.constructor || '')}</div>
          ${p.fase ? `<span class="pln-card-fase">${escapeHtml(p.fase)}</span>` : ''}
        </div>`;
      card.addEventListener('click', () => plnAbrirVisor(p));
      grid.appendChild(card);
    });
    if (filtrados.length === 0 && planos.length > 0) {
      grid.innerHTML = `<div class="gc-empty" style="grid-column:1/-1;">Ningún plano coincide con "${escapeHtml(filtro)}".</div>`;
    }
    if (typeof plnSel !== 'undefined' && plnSel) plnSel.refrescarTrasRedibujar();
  }
  $('pln-buscar').addEventListener('input', debounce(plnRender, 160));

  // ---- Modo selección en Planos ----
  const plnSel = ghCrearSeleccion({
    host: 'pln-sel-host',
    contenedor: 'pln-grid',
    nombre: 'plano', plural: 'planos',
    acciones: [
      { id: 'compartir', texto: '↗ Compartir', fn: async (ids) => {
          const sel = ids.map((id) => planos.find((p) => p.id === id)).filter(Boolean);
          if (!sel.length) return;
          // Comparte las fotos de los planos marcados (lo útil de un plano es la imagen)
          const archivos = [];
          for (const p of sel) {
            const fotos = p.numFotos ? await plnCargarFotosDe(p.id) : [];
            const base = (p.nombre || 'plano').normalize('NFKD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-zA-Z0-9-]+/g,'-').replace(/-+/g,'-').replace(/^-|-$/g,'');
            fotos.forEach((f, i) => {
              const bin = atob(f.dataUrl.split(',')[1]);
              const bytes = new Uint8Array(bin.length);
              for (let k = 0; k < bin.length; k++) bytes[k] = bin.charCodeAt(k);
              archivos.push(new File([bytes], `${base}-${i + 1}.jpg`, { type: 'image/jpeg' }));
            });
          }
          if (!archivos.length) { toast('Esos planos no tienen fotos', 'info'); return; }
          try {
            if (navigator.canShare && navigator.canShare({ files: archivos })) {
              await navigator.share({ files: archivos, title: `${sel.length} plano(s)` });
              return;
            }
          } catch (e) { if (e && e.name === 'AbortError') return; }
          archivos.forEach((f) => { const a = document.createElement('a'); a.href = URL.createObjectURL(f); a.download = f.name; a.click(); URL.revokeObjectURL(a.href); });
          toast('Se descargaron las fotos', 'info', 4000);
        } },
      { id: 'imprimir', texto: '🖨 Imprimir', fn: async (ids) => {
          const sel = ids.map((id) => planos.find((p) => p.id === id)).filter(Boolean);
          const partes = [];
          for (const p of sel) {
            const fotos = p.numFotos ? await plnCargarFotosDe(p.id) : [];
            partes.push(`<h1>${escapeHtml(p.nombre || '')}</h1>
              <div class="ps-badge">${escapeHtml([p.constructor, p.fase].filter(Boolean).join(' · '))}</div>
              ${fotos.map((f) => `<img src="${f.dataUrl}" style="width:100%;max-height:900px;object-fit:contain;margin-bottom:12px;">`).join('')}`);
          }
          if (!partes.length) { toast('Nada que imprimir', 'info'); return; }
          ghImprimirEnVentana(partes.map((p) => `<div class="gh-doc">${p}</div>`).join(''), `Planos (${sel.length})`);
        } },
      { id: 'borrar', texto: '🗑 Borrar', peligro: true, fn: async (ids) => {
          if (!await gcConfirm(`¿Borrar ${ids.length} plano(s)? Esta acción no se puede deshacer.`, { okText: 'Borrar', danger: true })) return;
          planos = planos.filter((p) => !ids.includes(p.id));
          await plnGuardar();
          plnSel.salir();
          plnRefreshDlConstructores();
          plnRender(); plnRenderEditar();
          toast(`${ids.length} plano(s) borrado(s)`, 'info');
        } },
    ],
  });

  // ---- Editar / Borrar: lista aparte, con lápiz y ✕ ----
  function plnRenderEditar() {
    if (!$('pln-lista-editar')) return;
    const filtro = ($('pln-buscar-editar').value || '').trim().toLowerCase();
    const filtrados = planos.filter((p) => !filtro
      || (p.nombre || '').toLowerCase().includes(filtro)
      || (p.constructor || '').toLowerCase().includes(filtro));

    $('pln-empty-editar').style.display = planos.length === 0 ? 'block' : 'none';
    const lista = $('pln-lista-editar');
    lista.innerHTML = '';
    filtrados.forEach((p) => {
      const row = document.createElement('div');
      row.className = 'pln-edit-row';
      row.innerHTML = `
        ${p.portada ? `<img class="pln-edit-thumb" src="${p.portada}">` : `<div class="pln-edit-thumb-vacio">${PLN_ICONO_VACIO}</div>`}
        <div class="pln-edit-body">
          <div class="pln-edit-nombre">${escapeHtml(p.nombre || '(sin nombre)')}</div>
          <div class="pln-edit-constructor">${escapeHtml(p.constructor || '')}${p.fase ? ' · ' + escapeHtml(p.fase) : ''}</div>
        </div>
        <div class="pln-edit-actions">
          <button type="button" class="pln-edit-btn" title="Editar">✎</button>
          <button type="button" class="pln-edit-btn" title="Borrar">✕</button>
        </div>`;
      const [btnEditar, btnBorrar] = row.querySelectorAll('.pln-edit-btn');
      btnEditar.addEventListener('click', () => plnAbrirModal(p));
      btnBorrar.addEventListener('click', async () => {
        if (!(await gcConfirm(idiomaActual() === 'en' ? I18N.t_borrar_este_plano.en : '¿Borrar este plano?', { okText: idiomaActual() === 'en' ? 'Delete' : 'Borrar', danger: true }))) return;
        planos = planos.filter((x) => x.id !== p.id);
        await plnGuardar();
        plnRefreshDlConstructores();
        plnRender();
        plnRenderEditar();
      });
      lista.appendChild(row);
    });
    if (filtrados.length === 0 && planos.length > 0) {
      lista.innerHTML = `<div class="gc-empty">Ningún plano coincide con "${escapeHtml(filtro)}".</div>`;
    }
  }
  $('pln-buscar-editar').addEventListener('input', debounce(plnRenderEditar, 160));

  document.querySelectorAll('.pln-subtab').forEach((tab) => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.pln-subtab').forEach((t) => t.classList.remove('active'));
      document.querySelectorAll('.pln-subpanel').forEach((p) => p.classList.remove('active'));
      tab.classList.add('active');
      $('pln-sub-' + tab.dataset.psub).classList.add('active');
      if (tab.dataset.psub === 'editar') plnRenderEditar();
    });
  });

  // ---- Visor de fotos a pantalla completa (pestaña "Ver planos") ----
  let plnVisorFotos = [];
  let plnVisorIdx = 0;
  async function plnAbrirVisor(plano) {
    $('pln-viewer-titulo').textContent = plano.nombre || '(sin nombre)';
    $('pln-viewer-sub').textContent = [plano.constructor, plano.fase].filter(Boolean).join(' · ');
    $('pln-viewer-img').src = plano.portada || '';
    $('pln-viewer').style.display = 'flex';
    plnVisorFotos = [];
    plnVisorIdx = 0;
    if (plano.numFotos) {
      const fotos = await plnCargarFotosDe(plano.id);
      if ($('pln-viewer').style.display !== 'flex') return; // se cerró mientras cargaba
      plnVisorFotos = fotos;
      plnVisorMostrar(0);
    }
  }
  function plnVisorMostrar(idx) {
    if (!plnVisorFotos.length) return;
    plnVisorIdx = (idx + plnVisorFotos.length) % plnVisorFotos.length;
    $('pln-viewer-img').src = plnVisorFotos[plnVisorIdx].dataUrl;
    const varias = plnVisorFotos.length > 1;
    $('pln-viewer-prev').style.display = varias ? 'flex' : 'none';
    $('pln-viewer-next').style.display = varias ? 'flex' : 'none';
    $('pln-viewer-dots').innerHTML = varias
      ? plnVisorFotos.map((_, i) => `<span class="pln-viewer-dot${i === plnVisorIdx ? ' on' : ''}"></span>`).join('')
      : '';
  }
  $('pln-viewer-prev').addEventListener('click', () => plnVisorMostrar(plnVisorIdx - 1));
  $('pln-viewer-next').addEventListener('click', () => plnVisorMostrar(plnVisorIdx + 1));
  $('pln-viewer-cerrar').addEventListener('click', () => { $('pln-viewer').style.display = 'none'; });

  function plnRenderFotosGrid() {
    const grid = $('pln-f-fotos-grid');
    grid.innerHTML = plnFotosActuales.map((f, i) => `
      <div class="cal-foto-thumb">
        <img src="${f.dataUrl}">
        <button type="button" class="cal-foto-del" data-i="${i}" title="Quitar">✕</button>
        <a class="cal-foto-dl" data-i="${i}" title="Descargar">⬇</a>
      </div>`).join('');
    grid.querySelectorAll('.cal-foto-del').forEach((btn) => {
      btn.addEventListener('click', () => {
        plnFotosActuales.splice(parseInt(btn.dataset.i, 10), 1);
        plnRenderFotosGrid();
      });
    });
    grid.querySelectorAll('.cal-foto-dl').forEach((a) => {
      const i = parseInt(a.dataset.i, 10);
      const partes = [$('pln-f-nombre').value.trim(), $('pln-f-constructor').value.trim()].filter(Boolean);
      const base = (partes.length ? partes.join('-') : 'plano').normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-zA-Z0-9-]+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
      a.href = plnFotosActuales[i].dataUrl;
      a.download = `${base || 'plano'}-foto${i + 1}.jpg`;
    });
  }
  $('pln-f-fotos-input').addEventListener('change', async (e) => {
    const archivos = [...(e.target.files || [])];
    for (const file of archivos) {
      if (!file.type.startsWith('image/')) continue;
      try {
        const dataUrl = await calComprimirFoto(file, 1400, 0.74);
        plnFotosActuales.push({ dataUrl });
      } catch (err) {}
    }
    plnRenderFotosGrid();
    $('pln-f-fotos-input').value = '';
  });

  let plnFaseActual = '';
  document.querySelectorAll('.pln-fase-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      plnFaseActual = plnFaseActual === btn.dataset.fase ? '' : btn.dataset.fase;
      document.querySelectorAll('.pln-fase-btn').forEach((b) => b.classList.toggle('active', b.dataset.fase === plnFaseActual));
    });
  });

  function plnAbrirModal(plano) {
    plnEditandoId = plano ? plano.id : null;
    plnFotosActuales = [];
    plnFaseActual = plano ? (plano.fase || '') : '';
    document.querySelectorAll('.pln-fase-btn').forEach((b) => b.classList.toggle('active', b.dataset.fase === plnFaseActual));
    $('pln-modal-titulo').textContent = idiomaActual() === 'en' ? (plano ? I18N.pln_editar_plano.en : I18N.pln_nuevo_plano.en) : (plano ? 'Editar plano' : 'Nuevo plano');
    $('pln-f-nombre').value = plano ? (plano.nombre || '') : '';
    $('pln-f-constructor').value = plano ? (plano.constructor || '') : '';
    plnRenderFotosGrid();
    $('pln-modal').style.display = 'flex';
    if (plano && plano.numFotos) {
      $('pln-f-fotos-grid').innerHTML = '<div style="grid-column:1/-1;font-size:11px;color:var(--muted);padding:6px 0;">Cargando fotos…</div>';
      plnCargarFotosDe(plano.id).then((fotos) => {
        if (plnEditandoId !== plano.id) return;
        plnFotosActuales = fotos;
        plnRenderFotosGrid();
      });
    }
  }
  $('pln-btn-nuevo').addEventListener('click', () => plnAbrirModal(null));
  $('pln-modal-cancelar').addEventListener('click', () => { $('pln-modal').style.display = 'none'; });
  $('pln-modal').addEventListener('click', (e) => { if (e.target === $('pln-modal')) $('pln-modal').style.display = 'none'; });
  $('pln-modal-guardar').addEventListener('click', async () => {
    const nombre = $('pln-f-nombre').value.trim();
    if (!nombre) { toast('Escribe el nombre del plano', 'error'); return; }
    const btnGuardar = $('pln-modal-guardar');
    btnGuardar.disabled = true;
    const fotos = plnFotosActuales;
    const datos = {
      nombre,
      constructor: $('pln-f-constructor').value.trim(),
      fase: plnFaseActual,
      numFotos: fotos.length,
      portada: fotos.length ? await plnMiniPortada(fotos[0].dataUrl).catch(() => null) : null
    };
    let id = plnEditandoId;
    if (id) {
      const idx = planos.findIndex((p) => p.id === id);
      if (idx > -1) planos[idx] = { ...planos[idx], ...datos };
    } else {
      id = 'plano_' + Date.now();
      planos.push({ id, fecha: today(), ...datos });
    }
    await plnGuardar();
    if (fotos.length) await plnGuardarFotosDe(id, fotos);
    btnGuardar.disabled = false;
    plnRefreshDlConstructores();
    $('pln-modal').style.display = 'none';
    plnRender();
    plnRenderEditar();
    toast('Plano guardado ✓');
  });

  document.querySelectorAll('.gc-tab').forEach((tab) => {
    if (tab.dataset.tab === 'planos') {
      tab.addEventListener('click', async () => {
        await plnCargarDatos();
        plnRefreshDlConstructores();
      });
    }
  });

