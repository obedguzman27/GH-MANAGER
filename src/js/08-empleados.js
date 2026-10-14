  // ====================================================================
  // MÓDULO: EMPLEADOS Y DOCUMENTOS
  // ====================================================================
  const STORAGE_EMPLEADOS = 'empleados';
  let empleados = [];
  let empIdActual = null; // null = nuevo, string = editar

  // Nombre para mostrar: si no hay apellido (trabajadores informales, ej. "Airton"),
  // usa solo el nombre en vez de dejar un espacio de más.
  function empNombreCompleto(emp) {
    return (emp.apellido ? (emp.nombre + ' ' + emp.apellido) : (emp.nombre || '')).trim();
  }
  function empIniciales(emp) {
    if (emp.apellido) return ((emp.nombre || '?')[0] + (emp.apellido || '?')[0]).toUpperCase();
    const n = emp.nombre || '??';
    return (n[0] + (n[1] || '')).toUpperCase();
  }

  const esElectron = !!(window.electronAPI);

  // ---- Storage empleados ----
  async function saveEmpleados() {
    try {
      await window.storage.set(STORAGE_EMPLEADOS, JSON.stringify(empleados));
    } catch(e) {
      throw new Error('No se pudo guardar: ' + e.message);
    }
    clearTimeout(chkSyncT);
    chkSyncT = setTimeout(() => { chkSincronizarTrabajadores().then(chkAvisarNuevos).catch(() => {}); }, 800);
  }

  // empleadosLeidos: true si la lista se leyó de verdad (o de verdad no existe).
  // Si falló por falta de señal, no se publica la lista al check-in (antes se
  // publicaba VACÍA y el visor se quedaba sin trabajadores).
  let empleadosLeidos = false;
  async function loadEmpleados() {
    try {
      const r = await window.storage.get(STORAGE_EMPLEADOS);
      const v = JSON.parse(r.value);
      empleados = Array.isArray(v) ? v : [];
      empleadosLeidos = true;
    } catch (e) { empleados = []; empleadosLeidos = !(e && e.sinSenal); }
  }

  // ---- Check-in del visor: solo NOMBRES (nunca sueldos) ----
  // En "gh-checkin" se guarda _trab (los nombres de los trabajadores activos)
  // para que el visor haga el check-in sin leer Empleados, que trae sueldos y
  // datos personales. Los que el visor agrega llegan en _nuevos y aquí se
  // crean en Empleados con sueldo $0 (el admin les pone el sueldo).
  const CHK_KEY_APP = 'gh-checkin';
  let chkSyncT = null;
  async function chkSincronizarTrabajadores() {
    if (window.GH_ROL === 'visor' || !empleadosLeidos) return 0;
    let obj = {};
    try { const r = await window.storage.get(CHK_KEY_APP); const v = JSON.parse(r.value); if (v && typeof v === 'object' && !Array.isArray(v)) obj = v; }
    catch (e) { if (e && e.sinSenal) return 0; }
    const nuevos = Array.isArray(obj._nuevos) ? obj._nuevos : [];
    let agregados = 0;
    nuevos.forEach((n) => {
      const nombre = String(n || '').replace(/\s+/g, ' ').trim().slice(0, 60);
      if (!nombre || nomBuscarTrab(nombre)) return;
      empleados.push({
        id: 'emp-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6),
        nombre, apellido: '', rol: '', estado: 'activo', sueldo: 0,
        tel: '', email: '', inicio: '', ss: '', emergencia: '', direccion: '', notas: 'Agregado desde el check-in'
      });
      agregados++;
    });
    if (agregados) { try { await window.storage.set(STORAGE_EMPLEADOS, JSON.stringify(empleados)); } catch (e) { return 0; } }
    const lista = empleados.filter((e) => e.estado !== 'inactivo').map((e) => empNombreCompleto(e)).filter(Boolean).sort((a, b) => a.localeCompare(b, 'es'));
    if (JSON.stringify(lista) === JSON.stringify(obj._trab || []) && !nuevos.length) return agregados;
    obj._trab = lista;
    delete obj._nuevos;
    try { await window.storage.set(CHK_KEY_APP, JSON.stringify(obj)); } catch (e) {}
    if (agregados && typeof nomRefreshDl === 'function') { try { nomRefreshDl(); } catch (e) {} }
    return agregados;
  }
  function chkAvisarNuevos(n) {
    if (n) toast(`${n === 1 ? '1 trabajador nuevo' : n + ' trabajadores nuevos'} del check-in — ponle sueldo en Nómina → Trabajadores`, 'info', 5000);
  }
  // Al abrir la app: publica la lista y trae los nuevos que agregó el visor
  (async () => {
    try { if (typeof window.GH_ESPERAR_SESION === 'function') await window.GH_ESPERAR_SESION(); } catch (e) {}
    if (window.GH_ROL === 'visor') return;
    try {
      if (!empleados.length) await loadEmpleados();
      chkAvisarNuevos(await chkSincronizarTrabajadores());
    } catch (e) {}
  })();

  // ---- Render grid ----
  function renderEmpleados() {
    const grid = $('emp-grid');
    grid.innerHTML = '';
    if (empleados.length === 0) {
      grid.innerHTML = '<div class="emp-empty">No hay empleados registrados.<br>Haz clic en <strong>+ Agregar empleado</strong> para empezar.</div>';
      return;
    }
    empleados.forEach((emp) => {
      const initiales = empIniciales(emp);
      const card = document.createElement('div');
      card.className = 'emp-card';
      card.dataset.id = emp.id;
      card.innerHTML = `
        <div class="emp-card-avatar">${initiales}</div>
        <p class="emp-card-name">${escapeHtml(empNombreCompleto(emp))}</p>
        <p class="emp-card-role">${[escapeHtml(emp.rol || ''), Number(emp.sueldo) ? ('$' + Number(emp.sueldo).toFixed(2) + '/día') : ''].filter(Boolean).join(' · ')}</p>
        <span class="emp-card-status ${emp.estado || 'activo'}">${(emp.estado || 'activo').charAt(0).toUpperCase() + (emp.estado || 'activo').slice(1)}</span>
        <p class="emp-card-docs">${escapeHtml(emp.tel || 'Sin teléfono')}</p>
      `;
      card.addEventListener('click', () => abrirModalEmpleado(emp.id));
      grid.appendChild(card);
    });
  }

  // ---- Modal ----
  function abrirModalEmpleado(id) {
    empIdActual = id || null;
    const emp = id ? empleados.find((e) => e.id === id) : null;

    $('emp-modal-titulo').textContent = emp ? empNombreCompleto(emp) : 'Nuevo empleado';
    $('emp-nombre').value = emp?.nombre || '';
    $('emp-apellido').value = emp?.apellido || '';
    $('emp-rol').value = emp?.rol || 'Técnico HVAC';
    $('emp-estado').value = emp?.estado || 'activo';
    $('emp-sueldo').value = emp?.sueldo ? String(emp.sueldo) : '';
    $('emp-tel').value = emp?.tel || '';
    $('emp-email').value = emp?.email || '';
    $('emp-inicio').value = emp?.inicio || '';
    $('emp-ss').value = emp?.ss || '';
    $('emp-emergencia').value = emp?.emergencia || '';
    $('emp-direccion').value = emp?.direccion || '';
    $('emp-notas').value = emp?.notas || '';
    $('emp-status').textContent = '';
    $('btn-eliminar-empleado').style.display = id ? 'inline-block' : 'none';
    $('btn-imprimir-empleado').style.display = id ? 'inline-block' : 'none';
    $('btn-descargar-empleado').style.display = id ? 'inline-block' : 'none';

    // Tabs reset
    document.querySelectorAll('.emp-modal-tab').forEach((t) => t.classList.remove('active'));
    document.querySelector('.emp-modal-tab[data-etab="info"]').classList.add('active');
    $('emp-etab-info').style.display = '';
    $('emp-etab-docs').style.display = 'none';

    // Docs UI
    if (esElectron) {
      $('docs-electron-ui').style.display = '';
      $('docs-web-note').style.display = 'none';
      if (id) cargarDocumentos(id);
    } else {
      $('docs-electron-ui').style.display = 'none';
      $('docs-web-note').style.display = '';
    }

    $('emp-modal').style.display = 'flex';
  }

  // ---- Ficha imprimible de empleado ----
  function construirFichaEmpleado(emp) {
    const row = (label, val) => val ? `<tr><td style="font-weight:600;width:180px;padding:7px 10px;border-bottom:1px solid #eee;color:#555;font-size:12px;">${label}</td><td style="padding:7px 10px;border-bottom:1px solid #eee;font-size:13px;">${escapeHtml(val)}</td></tr>` : '';
    return `
      <div style="display:flex;align-items:center;gap:18px;margin-bottom:22px;padding-bottom:18px;border-bottom:2px solid #0E1830;">
        <div style="width:56px;height:56px;border-radius:50%;background:#0E1830;color:#fff;font-size:22px;font-weight:700;display:flex;align-items:center;justify-content:center;flex-shrink:0;">${empIniciales(emp)}</div>
        <div>
          <div style="font-size:20px;font-weight:700;color:#0E1830;">${escapeHtml(empNombreCompleto(emp))}</div>
          <div style="font-size:13px;color:#555;">${escapeHtml(emp.rol||'')} · <span style="color:${emp.estado==='activo'?'#2E8B84':'#C2622E'};font-weight:600;">${emp.estado==='activo'?'Activo':'Inactivo'}</span></div>
        </div>
        <div style="margin-left:auto;text-align:right;">
          <div style="font-size:11px;color:#888;">${cfgFacturaNombre}</div>
        </div>
      </div>
      <table style="width:100%;border-collapse:collapse;">
        ${row('Sueldo por día', emp.sueldo ? nomFmt(emp.sueldo) : '')}
        ${row('Teléfono', emp.tel)}
        ${row('Email', emp.email)}
        ${row('Dirección', emp.direccion)}
        ${row('Fecha de inicio', emp.inicio)}
        ${row('SS (últimos 4)', emp.ss ? '●●●-●●-'+emp.ss : '')}
        ${row('Contacto de emergencia', emp.emergencia)}
        ${row('Notas', emp.notas)}
      </table>`;
  }

  $('btn-imprimir-empleado').addEventListener('click', () => {
    const emp = empleados.find(e => e.id === empIdActual);
    if (!emp) return;
    ghImprimirEnVentana(construirFichaEmpleado(emp), `Ficha - ${empNombreCompleto(emp)}`);
  });

  $('btn-descargar-empleado').addEventListener('click', () => {
    const emp = empleados.find(e => e.id === empIdActual);
    if (!emp) return;
    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Ficha - ${escapeHtml(empNombreCompleto(emp))}</title>
      <style>body{font-family:Arial,sans-serif;padding:32px;max-width:680px;margin:0 auto;color:#1a1a1a;}</style>
      </head><body>${construirFichaEmpleado(emp)}</body></html>`;
    const blob = new Blob([html], { type: 'text/html;charset=utf-8;' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `ficha-${empNombreCompleto(emp)}.html`.toLowerCase().replace(/\s+/g,'-');
    a.click();
    URL.revokeObjectURL(a.href);
  });

  // ---- Guardar empleado ----
  $('btn-guardar-empleado').addEventListener('click', async () => {
    const nombre = $('emp-nombre').value.trim();
    const apellido = $('emp-apellido').value.trim();
    if (!nombre) { $('emp-status').textContent = 'El nombre es obligatorio'; return; }

    const datos = {
      nombre, apellido,
      rol: $('emp-rol').value,
      estado: $('emp-estado').value,
      sueldo: parseFloat(($('emp-sueldo').value || '0').replace(',', '.')) || 0,
      tel: $('emp-tel').value.trim(),
      email: $('emp-email').value.trim(),
      inicio: $('emp-inicio').value,
      ss: $('emp-ss').value.trim(),
      emergencia: $('emp-emergencia').value.trim(),
      direccion: $('emp-direccion').value.trim(),
      notas: $('emp-notas').value.trim()
    };

    if (empIdActual) {
      const idx = empleados.findIndex((e) => e.id === empIdActual);
      if (idx >= 0) empleados[idx] = { ...empleados[idx], ...datos };
    } else {
      datos.id = 'emp-' + Date.now();
      empleados.push(datos);
      empIdActual = datos.id;
      $('btn-eliminar-empleado').style.display = 'inline-block';
    }

    try {
      await saveEmpleados();
      renderEmpleados();
      $('emp-modal-titulo').textContent = `${datos.nombre} ${datos.apellido}`;
      $('btn-imprimir-empleado').style.display = 'inline-block';
      $('btn-descargar-empleado').style.display = 'inline-block';
      $('emp-status').style.color = 'var(--teal)';
      $('emp-status').textContent = 'Guardado ✓';
      setTimeout(() => { $('emp-status').textContent = ''; }, 2000);
      toast('Empleado guardado ✓', 'success');
    } catch(e) {
      $('emp-status').style.color = 'var(--ember)';
      $('emp-status').textContent = '' + e.message;
    }
  });

  // ---- Eliminar empleado ----
  $('btn-eliminar-empleado').addEventListener('click', async () => {
    if (!empIdActual) return;
    if (!await gcConfirm('¿Eliminar este empleado? Esta acción no se puede deshacer.', { okText: 'Eliminar', danger: true })) return;
    const respaldo = empleados.slice();           // por si el guardado falla
    const idBorrado = empIdActual;
    empleados = empleados.filter((e) => e.id !== idBorrado);
    try {
      await saveEmpleados();
      // Confirmar que de verdad quedó guardado: si el guardado falla en
      // silencio (sin internet, error del servidor), el empleado "revive"
      // al recargar. Mejor avisar aquí que dejar creer que se borró.
      const r = await window.storage.get(STORAGE_EMPLEADOS).catch(() => null);
      let guardados = null;
      try { guardados = JSON.parse(r.value); } catch (e) { guardados = null; }
      if (Array.isArray(guardados) && guardados.some((e) => e.id === idBorrado)) {
        throw new Error('el servidor no aceptó el cambio');
      }
      renderEmpleados();
      $('emp-modal').style.display = 'none';
      toast('Empleado eliminado ✓', 'success');
    } catch (err) {
      empleados = respaldo;                        // deshacer en pantalla
      renderEmpleados();
      toast('No se pudo eliminar (' + (err && err.message ? err.message : err) + '). Revisa tu conexión e intenta otra vez.', 'error', 6000);
    }
  });

  // ---- Tabs del modal ----
  document.querySelectorAll('.emp-modal-tab').forEach((tab) => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.emp-modal-tab').forEach((t) => t.classList.remove('active'));
      tab.classList.add('active');
      $('emp-etab-info').style.display = tab.dataset.etab === 'info' ? '' : 'none';
      $('emp-etab-docs').style.display = tab.dataset.etab === 'docs' ? '' : 'none';
      if (tab.dataset.etab === 'docs' && esElectron && empIdActual) cargarDocumentos(empIdActual);
    });
  });

  // ---- Cerrar modal ----
  $('emp-modal-cerrar').addEventListener('click', () => { $('emp-modal').style.display = 'none'; });
  $('emp-modal').addEventListener('click', (e) => { if (e.target === $('emp-modal')) $('emp-modal').style.display = 'none'; });
  $('btn-nuevo-empleado').addEventListener('click', () => abrirModalEmpleado(null));

  // ---- DOCUMENTOS (solo Electron) ----
  async function cargarDocumentos(empId) {
    if (!esElectron) return;
    const docs = await window.electronAPI.listarDocumentos(empId);
    const list = $('doc-list');
    list.innerHTML = '';
    if (docs.length === 0) {
      list.innerHTML = '<div class="doc-empty">No hay documentos. Usa "Subir PDF" para agregar contratos, seguros o identificaciones.</div>';
      return;
    }
    docs.forEach((doc) => {
      const item = document.createElement('div');
      item.className = 'doc-item';
      const catMatch = doc.match(/^\[([^\]]+)\]/);
      const cat = catMatch ? catMatch[1] : 'Documento';
      const nombreLimpio = catMatch ? doc.slice(catMatch[0].length + 1) : doc;
      item.innerHTML = `
        <div class="doc-info">
          <div class="doc-name">${escapeHtml(nombreLimpio)}</div>
          <div class="doc-cat">${escapeHtml(cat)}</div>
        </div>
        <button class="gc-action-btn" data-i18n="abrir" style="padding:4px 10px;font-size:11px;" data-doc="${escapeHtml(doc)}">Abrir</button>
        <button class="gc-del" data-doc="${escapeHtml(doc)}">✕</button>
      `;
      item.querySelector('.gc-action-btn').addEventListener('click', async () => {
        if (window.electronAPI?.abrirDocumento) {
          await window.electronAPI.abrirDocumento({ trabajadorId: empIdActual, nombreArchivo: doc });
        } else { toast('Para abrir PDFs usa la app de escritorio.', 'info', 3500); }
      });
      item.querySelector('.gc-del').addEventListener('click', async () => {
        if (!await gcConfirm('¿Borrar este documento?', { okText: 'Borrar', danger: true })) return;
        if (window.electronAPI?.eliminarDocumento) {
          await window.electronAPI.eliminarDocumento({ trabajadorId: empIdActual, nombreArchivo: doc });
        }
        cargarDocumentos(empIdActual);
      });
      list.appendChild(item);
    });
  }

  // ---- Subida de docs de empleado via <input file> ----
  const _inputDocEmp = document.createElement('input');
  _inputDocEmp.type = 'file'; _inputDocEmp.accept = '.pdf';
  _inputDocEmp.style.display = 'none';
  document.body.appendChild(_inputDocEmp);

  $('btn-subir-doc').addEventListener('click', () => {
    if (!empIdActual) { toast('Guarda primero los datos del empleado antes de subir documentos.', 'info', 3200); return; }
    _inputDocEmp.value = ''; _inputDocEmp.click();
  });

  _inputDocEmp.addEventListener('change', async () => {
    const file = _inputDocEmp.files[0];
    if (!file || !empIdActual) return;
    const cat = $('doc-categoria').value;
    const nombreBase = file.name.replace(/[/\\:*?"<>|]/g, '-');
    const nombreFinal = `[${cat.replace(/[/\\:*?"<>|]/g, '-')}] ${nombreBase}`;
    try {
      const buffer = Array.from(new Uint8Array(await file.arrayBuffer()));
      if (window.electronAPI?.guardarDocumentoBuffer) {
        await window.electronAPI.guardarDocumentoBuffer({ trabajadorId: empIdActual, nombreArchivo: nombreFinal, buffer });
      } else if (window.electronAPI?.guardarDocumento && file.path) {
        await window.electronAPI.guardarDocumento({ trabajadorId: empIdActual, nombreArchivo: nombreFinal, rutaOrigen: file.path });
      } else {
        toast('Para subir PDFs usa la app de escritorio (Electron).', 'info', 3500); return;
      }
      cargarDocumentos(empIdActual);
    } catch(e) { toast('Error al subir: ' + e.message, 'error', 4000); }
  });

