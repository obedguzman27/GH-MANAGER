  // ====================================================================
  // MEJORAS UX
  // ====================================================================

  // ── Toast notifications ──────────────────────────────────────────────
  function toast(msg, tipo = 'success', duracion = 2500) {
    // Traduce el mensaje si hay una versión en inglés y ese es el idioma activo
    // (coincidencia exacta primero; si no, intenta por el PREFIJO estático de
    // mensajes que terminan en "algo dinámico", como "No se pudo guardar: " + error).
    if (typeof I18N !== 'undefined' && typeof idiomaActual === 'function' && idiomaActual() === 'en') {
      let traducido = null;
      for (const k in I18N) {
        if (I18N[k].es === msg) { traducido = I18N[k].en; break; }
      }
      if (!traducido) {
        // Solo intenta el prefijo con entradas pensadas para eso (terminan en
        // ": " o en espacio, para pegarles texto dinámico después) — así una
        // palabra corta de la interfaz (ej. "Notas") nunca se cuela por error
        // como si fuera el inicio de un mensaje sin relación.
        for (const k in I18N) {
          const es = I18N[k].es;
          if (es && (es.endsWith(': ') || es.endsWith(' ')) && es.length > 5 && msg.indexOf(es) === 0) {
            traducido = I18N[k].en + msg.slice(es.length);
            break;
          }
        }
      }
      if (traducido) msg = traducido;
    }
    const cont = document.getElementById('gc-toast');
    const el = document.createElement('div');
    el.className = `gc-toast-item ${tipo}`;
    const icon = document.createElement('span');
    icon.className = 'gc-toast-icon';
    icon.textContent = tipo === 'success' ? '✓' : tipo === 'error' ? '!' : 'i';
    const txt = document.createElement('span');
    txt.className = 'gc-toast-msg';
    txt.textContent = msg;
    el.appendChild(icon);
    el.appendChild(txt);
    cont.appendChild(el);
    requestAnimationFrame(() => { requestAnimationFrame(() => { el.classList.add('show'); }); });
    setTimeout(() => {
      el.classList.remove('show');
      setTimeout(() => el.remove(), 300);
    }, duracion);
  }

  // ---- Confirmación en pantalla (reemplaza el confirm() feo del navegador) ----
  function gcConfirm(mensaje, opciones = {}) {
    return new Promise((resolve) => {
      const overlay = document.createElement('div');
      overlay.className = 'gc-confirm-overlay';
      const msgHtml = escapeHtml(mensaje).replace(/\n/g, '<br>');
      overlay.innerHTML = `
        <div class="gc-confirm-box">
          <p class="gc-confirm-msg">${msgHtml}</p>
          <div class="gc-confirm-actions">
            <button class="gc-action-btn" data-r="0">${opciones.cancelText || 'Cancelar'}</button>
            <button class="gc-save-btn ${opciones.danger ? 'danger' : ''}" data-r="1">${opciones.okText || 'Confirmar'}</button>
          </div>
        </div>`;
      document.body.appendChild(overlay);
      requestAnimationFrame(() => requestAnimationFrame(() => overlay.classList.add('show')));
      let resuelto = false;
      function cerrar(v) {
        if (resuelto) return;
        resuelto = true;
        overlay.classList.remove('show');
        document.removeEventListener('keydown', onKey);
        setTimeout(() => overlay.remove(), 180);
        resolve(v);
      }
      // Solo cuenta una tecla que se apretó DESPUÉS de abrir el aviso: si no,
      // el mismo Enter con el que guardaste algo lo aceptaba solo.
      const abiertoEn = performance.now();
      function onKey(e) {
        if (e.timeStamp && e.timeStamp < abiertoEn) return;
        if (e.key === 'Escape') cerrar(false);
        if (e.key === 'Enter') { e.preventDefault(); cerrar(true); }
      }
      overlay.querySelector('[data-r="0"]').addEventListener('click', () => cerrar(false));
      overlay.querySelector('[data-r="1"]').addEventListener('click', () => cerrar(true));
      overlay.addEventListener('click', (e) => { if (e.target === overlay) cerrar(false); });
      document.addEventListener('keydown', onKey);
      overlay.querySelector('[data-r="1"]').focus();
    });
  }

  // ── Enter key guarda movimiento ──────────────────────────────────────
  [$('m-fecha'), $('m-cat'), $('m-monto'), $('m-desc')].forEach((el) => {
    if (el) el.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); $('btn-guardar-mov').click(); }
    });
  });

  // ── Auto-focus: tipo → categoría → monto → descripción ──────────────
  $('m-cat').addEventListener('change', () => { if ($('m-cat').value) $('m-monto').focus(); });
  $('m-monto').addEventListener('keydown', (e) => { if (e.key === 'Tab' && !e.shiftKey) { e.preventDefault(); $('m-desc').focus(); } });

  // ====================================================================
  // FIN MEJORAS UX
