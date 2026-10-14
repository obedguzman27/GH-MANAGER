  // ====================================================================
  // MÓDULO: CALENDARIO DE TRABAJOS (dentro de Facturas)
  // ====================================================================
  const CITAS_KEY = 'gh-citas';
  let citas = [];
  let citasCargadas = false;
  let calSemanaOffset = 0;
  let calEditandoId = null;

  const CAL_DIAS = ['Lunes','Martes','Miércoles','Jueves','Viernes','Sábado','Domingo'];
  const CAL_MESES = ['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic'];

  function calLunesDeSemana(offset) {
    const hoy = new Date();
    const dow = hoy.getDay(); // 0=domingo..6=sabado
    const diffAlLunes = dow === 0 ? -6 : 1 - dow;
    const lunes = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate() + diffAlLunes + offset * 7);
    return lunes;
  }
  function calFechaISO(d) {
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }
  async function calCargarDatos() {
    if (citasCargadas) return;
    citasCargadas = true;
    const r = await window.storage.get(CITAS_KEY).catch(() => null);
    try { citas = JSON.parse(r.value); } catch (e) { citas = []; }
    // Migración de una sola vez: versiones anteriores guardaban las fotos
    // completas DENTRO de cada cita, todas juntas en un solo bloque — con
    // unas cuantas fotos ese bloque se volvía demasiado grande y el guardado
    // fallaba en silencio (por eso a veces "desaparecía" la información).
    // Ahora las fotos de cada trabajo se guardan aparte; si encuentra una
    // cita con el formato viejo, la separa y la deja liviana.
    let huboMigracion = false;
    for (const c of citas) {
      if (Array.isArray(c.fotos) && c.fotos.length && c.fotos[0] && c.fotos[0].dataUrl) {
        try { await calGuardarFotosDe(c.id, c.fotos); } catch (e) {}
        c.numFotos = c.fotos.length;
        try { c.portada = await calMiniPortada(c.fotos[0].dataUrl); } catch (e) {}
        delete c.fotos;
        huboMigracion = true;
      }
    }
    if (huboMigracion) { try { await calGuardar(); } catch (e) {} }
    calRender();
  }
  async function calGuardar() {
    // Guarda SOLO los datos livianos de cada trabajo (nunca las fotos
    // completas) — así este guardado nunca se vuelve pesado sin importar
    // cuántas fotos tenga cada trabajo.
    const liviano = citas.map((c) => { const { fotos, ...resto } = c; return resto; });
    try { await window.storage.set(CITAS_KEY, JSON.stringify(liviano)); } catch (e) {}
  }
  async function calGuardarFotosDe(id, fotos) {
    try { await window.storage.set('gh-cita-fotos-' + id, JSON.stringify(fotos)); } catch (e) {}
  }
  async function calCargarFotosDe(id) {
    const r = await window.storage.get('gh-cita-fotos-' + id).catch(() => null);
    try { return JSON.parse(r.value); } catch (e) { return []; }
  }
  // Miniatura chiquita (para la vista de la semana) — separada de las fotos
  // completas, así el bloque principal de citas se queda siempre liviano.
  function calMiniPortada(dataUrlOrigen) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        const lado = 90;
        const canvas = document.createElement('canvas');
        canvas.width = lado; canvas.height = lado;
        const ctx = canvas.getContext('2d');
        const escala = Math.max(lado / img.width, lado / img.height);
        const w = img.width * escala, h = img.height * escala;
        ctx.drawImage(img, (lado - w) / 2, (lado - h) / 2, w, h);
        resolve(canvas.toDataURL('image/jpeg', 0.55));
      };
      img.onerror = reject;
      img.src = dataUrlOrigen;
    });
  }

  function calRender() {
    if (!$('cal-dias-wrap')) return;
    const lunes = calLunesDeSemana(calSemanaOffset);
    const domingo = new Date(lunes.getFullYear(), lunes.getMonth(), lunes.getDate() + 6);
    $('cal-semana-label').textContent = `${lunes.getDate()} ${CAL_MESES[lunes.getMonth()]} – ${domingo.getDate()} ${CAL_MESES[domingo.getMonth()]}`;

    const hoyISO = calFechaISO(new Date());
    const wrap = $('cal-dias-wrap');
    wrap.innerHTML = '';
    for (let i = 0; i < 7; i++) {
      const d = new Date(lunes.getFullYear(), lunes.getMonth(), lunes.getDate() + i);
      const iso = calFechaISO(d);
      const citasDia = citas.filter((c) => c.fecha === iso);

      const dia = document.createElement('div');
      dia.className = 'cal-dia';
      dia.innerHTML = `
        <div class="cal-dia-header${iso === hoyISO ? ' hoy' : ''}">
          <span>${CAL_DIAS[i]} ${d.getDate()} ${CAL_MESES[d.getMonth()]}</span>
          <button type="button" class="cal-add-btn">+ Agregar</button>
        </div>
        <div class="cal-dia-lista"></div>`;
      dia.querySelector('.cal-add-btn').addEventListener('click', () => calAbrirModal(null, iso));

      const lista = dia.querySelector('.cal-dia-lista');
      if (citasDia.length === 0) {
        lista.innerHTML = `<div class="cal-vacio">${idiomaActual() === 'en' ? I18N.cal_sin_trabajos.en : 'Sin trabajos agendados'}</div>`;
      } else {
        citasDia.forEach((c) => {
          const job = document.createElement('div');
          job.className = 'cal-job sel-item sel-card';
          job.dataset.selid = c.id;
          const numFotos = c.numFotos || 0;
          const etiqueta = [c.jobNum, c.loc].filter(Boolean).join(' · ');
          job.innerHTML = `
            <div class="cal-job-body">
              <div class="cal-job-cliente">${escapeHtml(c.cliente || (idiomaActual() === 'en' ? I18N.cal_sin_cliente.en : '(sin cliente)'))}</div>
              <div class="cal-job-desc">${etiqueta ? escapeHtml(etiqueta) + ' — ' : ''}${escapeHtml(c.descripcion || '')}</div>
              ${numFotos ? `<div class="cal-job-fotos">${c.portada ? `<img class="cal-job-foto-mini" src="${c.portada}">` : ''}<span class="cal-job-foto-count">📷 ${numFotos}</span></div>` : ''}
            </div>
            <div class="cal-job-actions">
              <button type="button" class="cal-job-btn" title="Agregar al Calendario del iPhone">📅</button>
              <button type="button" class="cal-job-btn" title="Editar">✎</button>
              <button type="button" class="cal-job-btn" title="Borrar">✕</button>
            </div>`;
          const [btnIcs, btnEditar, btnBorrar] = job.querySelectorAll('.cal-job-btn');
          btnIcs.addEventListener('click', () => calExportarICS([c]));
          btnEditar.addEventListener('click', () => calAbrirModal(c));
          btnBorrar.addEventListener('click', async () => {
            if (!(await gcConfirm('¿Borrar este trabajo agendado?', { okText: 'Borrar', danger: true }))) return;
            citas = citas.filter((x) => x.id !== c.id);
            await calGuardar();
            calRender();
          });
          lista.appendChild(job);
        });
      }
      wrap.appendChild(dia);
    }
    if (typeof calSel !== 'undefined' && calSel) calSel.refrescarTrasRedibujar();
  }

  // ---- Comprimir foto antes de guardarla (misma idea que el logo, pero
  // en JPEG y más grande, pensado para fotos de trabajo, no un ícono) ----
  function calComprimirFoto(file, maxLado = 1280, calidad = 0.72) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      const url = URL.createObjectURL(file);
      img.onload = () => {
        const escala = Math.min(1, maxLado / Math.max(img.width, img.height));
        const w = Math.max(1, Math.round(img.width * escala));
        const h = Math.max(1, Math.round(img.height * escala));
        const canvas = document.createElement('canvas');
        canvas.width = w; canvas.height = h;
        canvas.getContext('2d').drawImage(img, 0, 0, w, h);
        URL.revokeObjectURL(url);
        resolve(canvas.toDataURL('image/jpeg', calidad));
      };
      img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('No se pudo leer la imagen')); };
      img.src = url;
    });
  }

  let calFotosActuales = []; // fotos del trabajo que se está editando en el modal ahora mismo

  function calNombreArchivoFoto(i) {
    const partes = [$('cal-f-job').value.trim(), $('cal-f-loc').value.trim()].filter(Boolean);
    const base = partes.length ? partes.join('-') : 'trabajo';
    const limpio = base.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-zA-Z0-9-]+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
    return `${limpio || 'trabajo'}-foto${i + 1}.jpg`;
  }
  function calRenderFotosGrid() {
    const grid = $('cal-f-fotos-grid');
    grid.innerHTML = calFotosActuales.map((f, i) => `
      <div class="cal-foto-thumb">
        <img src="${f.dataUrl}">
        <button type="button" class="cal-foto-del" data-i="${i}" title="Quitar">✕</button>
        <a class="cal-foto-dl" data-i="${i}" title="Descargar con el nombre del trabajo">⬇</a>
      </div>`).join('');
    grid.querySelectorAll('.cal-foto-del').forEach((btn) => {
      btn.addEventListener('click', () => {
        calFotosActuales.splice(parseInt(btn.dataset.i, 10), 1);
        calRenderFotosGrid();
      });
    });
    grid.querySelectorAll('.cal-foto-dl').forEach((a) => {
      const i = parseInt(a.dataset.i, 10);
      a.href = calFotosActuales[i].dataUrl;
      a.download = calNombreArchivoFoto(i);
    });
  }
  $('cal-f-fotos-input').addEventListener('change', async (e) => {
    const archivos = [...(e.target.files || [])];
    for (const file of archivos) {
      if (!file.type.startsWith('image/')) continue;
      try {
        const dataUrl = await calComprimirFoto(file);
        calFotosActuales.push({ dataUrl });
      } catch (err) {}
    }
    calRenderFotosGrid();
    $('cal-f-fotos-input').value = '';
  });

  const CAL_ULTIMO_KEY = 'gh-cal-ultimo-trabajo';
  function calObtenerUltimo() {
    try { return JSON.parse(localStorage.getItem(ghLK(CAL_ULTIMO_KEY))) || {}; } catch (e) { return {}; }
  }
  function calGuardarUltimo(datos) {
    try { localStorage.setItem(ghLK(CAL_ULTIMO_KEY), JSON.stringify({ cliente: datos.cliente, jobNum: datos.jobNum, loc: datos.loc })); } catch (e) {}
  }

  function calAbrirModal(cita, fechaPredeterminada) {
    calEditandoId = cita ? cita.id : null;
    calFotosActuales = [];
    $('cal-modal-titulo').textContent = idiomaActual() === 'en' ? (cita ? I18N.cal_editar_trabajo.en : I18N.cal_nuevo_trabajo.en) : (cita ? 'Editar trabajo' : 'Nuevo trabajo');
    $('cal-f-fecha').value = cita ? cita.fecha : (fechaPredeterminada || today());
    // Trabajo nuevo: precarga Cliente/Job #/Colonia-Lote con lo último que
    // usaste (lo más común es seguir en el mismo sitio) — si cambiaste de
    // lugar, solo corrige estos tres campos o toca "Es un sitio nuevo".
    const ultimo = !cita ? calObtenerUltimo() : {};
    $('cal-f-cliente').value = cita ? (cita.cliente || '') : (ultimo.cliente || '');
    $('cal-f-job').value = cita ? (cita.jobNum || '') : (ultimo.jobNum || '');
    $('cal-f-loc').value = cita ? (cita.loc || '') : (ultimo.loc || '');
    $('cal-f-desc').value = cita ? (cita.descripcion || '') : '';
    $('cal-f-nuevo-sitio').style.display = (!cita && (ultimo.jobNum || ultimo.loc || ultimo.cliente)) ? 'inline' : 'none';
    calRenderFotosGrid();
    $('cal-modal').style.display = 'flex';
    $('cal-f-fecha').focus();
    // Las fotos completas se traen aparte (viven en su propio espacio de
    // guardado) — si el trabajo tiene, se cargan y se pintan en cuanto lleguen.
    if (cita && cita.numFotos) {
      $('cal-f-fotos-grid').innerHTML = '<div style="grid-column:1/-1;font-size:11px;color:var(--muted);padding:6px 0;">Cargando fotos…</div>';
      calCargarFotosDe(cita.id).then((fotos) => {
        if (calEditandoId !== cita.id) return; // el usuario ya cerró/cambió de trabajo
        calFotosActuales = fotos;
        calRenderFotosGrid();
      });
    }
  }
  $('cal-f-nuevo-sitio').addEventListener('click', (e) => {
    e.preventDefault();
    $('cal-f-cliente').value = ''; $('cal-f-job').value = ''; $('cal-f-loc').value = '';
    $('cal-f-nuevo-sitio').style.display = 'none';
    $('cal-f-cliente').focus();
  });
  $('cal-modal-cancelar').addEventListener('click', () => { $('cal-modal').style.display = 'none'; });
  $('cal-modal').addEventListener('click', (e) => { if (e.target === $('cal-modal')) $('cal-modal').style.display = 'none'; });
  $('cal-modal-guardar').addEventListener('click', async () => {
    const fecha = $('cal-f-fecha').value;
    if (!fecha) { toast('Escribe una fecha', 'error'); return; }
    const btnGuardar = $('cal-modal-guardar');
    btnGuardar.disabled = true;
    const fotos = calFotosActuales;
    const datos = {
      fecha,
      cliente: $('cal-f-cliente').value.trim(),
      jobNum: $('cal-f-job').value.trim(),
      loc: $('cal-f-loc').value.trim(),
      descripcion: $('cal-f-desc').value.trim(),
      numFotos: fotos.length,
      portada: fotos.length ? await calMiniPortada(fotos[0].dataUrl).catch(() => null) : null
    };
    let id = calEditandoId;
    if (id) {
      const idx = citas.findIndex((c) => c.id === id);
      if (idx > -1) citas[idx] = { ...citas[idx], ...datos };
    } else {
      id = 'cita_' + Date.now();
      citas.push({ id, ...datos });
    }
    calGuardarUltimo(datos);
    await calGuardar();
    if (fotos.length) await calGuardarFotosDe(id, fotos);
    btnGuardar.disabled = false;
    $('cal-modal').style.display = 'none';
    calRender();
    toast('Trabajo guardado ✓');
  });

  // ---- Modo selección en Calendario ----
  const calSel = ghCrearSeleccion({
    host: 'cal-sel-host',
    contenedor: 'cal-dias-wrap',
    nombre: 'trabajo', plural: 'trabajos',
    acciones: [
      { id: 'ics', texto: '📅 Al Calendario', fn: (ids) => {
          const sel = ids.map((id) => citas.find((c) => c.id === id)).filter(Boolean);
          if (sel.length) calExportarICS(sel);
        } },
      { id: 'factura', texto: '🧾 A factura', fn: (ids) => {
          const sel = ids.map((id) => citas.find((c) => c.id === id)).filter(Boolean);
          if (!sel.length) return;
          sel.forEach((c) => {
            const tr = invCrearFila({ location: c.loc || '', work: c.descripcion || '', dia: c.fecha || '' });
            $('inv-tbody').appendChild(tr);
          });
          invRenumerar(); invCalcTotales();
          if (!$('inv-cliente').value.trim()) {
            const conCliente = sel.find((c) => c.cliente);
            if (conCliente) $('inv-cliente').value = conCliente.cliente;
          }
          calSel.salir();
          document.querySelector('.gc-tab[data-tab="facturas"]').click();
          document.querySelector('.inv-subtab[data-sub="nueva"]').click();
          toast(`${sel.length} trabajo(s) agregado(s) a la factura ✓`);
        } },
      { id: 'borrar', texto: '🗑 Borrar', peligro: true, fn: async (ids) => {
          if (!await gcConfirm(`¿Borrar ${ids.length} trabajo(s) agendado(s)?`, { okText: 'Borrar', danger: true })) return;
          citas = citas.filter((c) => !ids.includes(c.id));
          await calGuardar();
          calSel.salir();
          calRender();
          toast(`${ids.length} trabajo(s) borrado(s)`, 'info');
        } },
    ],
  });

  $('cal-btn-prev').addEventListener('click', () => { calSemanaOffset--; calRender(); });
  $('cal-btn-next').addEventListener('click', () => { calSemanaOffset++; calRender(); });

  // ---- Exportar a Calendario del iPhone (archivo .ics estándar) ----
  function calICSEscape(t) {
    return String(t || '').replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\n/g, '\\n');
  }
  function calExportarICS(lista) {
    if (!lista.length) { toast('No hay trabajos para exportar', 'info'); return; }
    let ics = 'BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:-//GH Manager//Calendario//ES\r\nCALSCALE:GREGORIAN\r\n';
    lista.forEach((c) => {
      const uid = (c.id || ('cita_' + Date.now())) + '@guzmanhvac.app';
      const prefijo = c.jobNum ? `[${c.jobNum}] ` : '';
      const titulo = calICSEscape(prefijo + (c.cliente ? `${c.cliente}${c.descripcion ? ' — ' + c.descripcion : ''}` : (c.descripcion || 'Trabajo')));
      const [y, m, d] = c.fecha.split('-');
      ics += 'BEGIN:VEVENT\r\n';
      ics += `UID:${uid}\r\n`;
      ics += `SUMMARY:${titulo}\r\n`;
      if (c.loc) ics += `LOCATION:${calICSEscape(c.loc)}\r\n`;
      ics += `DTSTART;VALUE=DATE:${y}${m}${d}\r\n`;
      ics += `DTSTAMP:${new Date().toISOString().replace(/[-:]/g, '').split('.')[0]}Z\r\n`;
      ics += 'END:VEVENT\r\n';
    });
    ics += 'END:VCALENDAR\r\n';
    const nombre = lista.length === 1 ? `trabajo-${lista[0].fecha}.ics` : `trabajos-semana.ics`;
    const blob = new Blob([ics], { type: 'text/calendar;charset=utf-8' });
    if (navigator.canShare) {
      const archivo = new File([blob], nombre, { type: 'text/calendar' });
      if (navigator.canShare({ files: [archivo] })) {
        navigator.share({ files: [archivo], title: 'Trabajos agendados' }).catch(() => {});
        return;
      }
    }
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = nombre;
    a.click();
    URL.revokeObjectURL(a.href);
  }
  $('cal-btn-exportar-semana').addEventListener('click', () => {
    const lunes = calLunesDeSemana(calSemanaOffset);
    const domingo = new Date(lunes.getFullYear(), lunes.getMonth(), lunes.getDate() + 6);
    const inicioISO = calFechaISO(lunes), finISO = calFechaISO(domingo);
    calExportarICS(citas.filter((c) => c.fecha >= inicioISO && c.fecha <= finISO));
  });
  // FIN MÓDULO CALENDARIO DE TRABAJOS
  // ====================================================================

