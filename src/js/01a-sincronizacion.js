  // ====================================================================
  // SINCRONIZACIÓN — indicador de guardado y avisos de cambios de otro
  // teléfono (el motor vive en supabase-storage.js → window.GH_SYNC)
  // ====================================================================
  window.GH_TOAST = (m, t, d) => { try { toast(m, t, d); } catch (e) {} };

  (function indicadorGuardado() {
    const sync = window.GH_SYNC;
    const lugar = document.querySelector('.gc-header-right');
    if (!sync || !lugar) return;
    const pill = document.createElement('button');
    pill.type = 'button';
    pill.id = 'gh-sync';
    pill.className = 'gh-sync';
    pill.setAttribute('aria-live', 'polite');
    pill.innerHTML = '<i></i><span></span>';
    lugar.insertBefore(pill, lugar.firstChild);
    let ocultar = null, ultimo = '';
    sync.on((i) => {
      const txt = pill.querySelector('span');
      pill.dataset.estado = i.estado;
      clearTimeout(ocultar);
      if (i.estado === 'guardando') txt.textContent = 'Guardando…';
      else if (i.estado === 'offline') txt.textContent = `Sin señal · ${i.pendientes} por subir`;
      else if (i.estado === 'error') txt.textContent = `Reintentando · ${i.pendientes}`;
      else {
        txt.textContent = ultimo && ultimo !== 'ok' ? 'Guardado ✓' : '';
        ocultar = setTimeout(() => { txt.textContent = ''; }, 2200);
      }
      pill.classList.toggle('con-texto', !!txt.textContent);
      pill.title = i.estado === 'ok' ? 'Todo está guardado en la nube'
        : i.estado === 'offline' ? 'Sin señal: los cambios están guardados en este teléfono y se suben solos al volver la señal'
        : i.estado === 'error' ? 'No se pudo subir todavía (' + (i.error || 'conexión') + '). Se reintenta solo.'
        : 'Subiendo cambios a la nube';
      ultimo = i.estado;
    });
    pill.addEventListener('click', () => {
      const i = sync.info();
      if (i.pendientes) { sync.vaciar(); toast(navigator.onLine ? 'Subiendo cambios pendientes…' : 'Sin señal: tus cambios están a salvo en este teléfono y se suben solos al volver la señal.', 'info', 3500); }
      else toast('Todo está guardado en la nube ✓', 'success', 1800);
    });
  })();

  // ---- Barra "hay cambios de otro teléfono" ----
  function ghBarraRecargar(texto, boton) {
    let barra = document.getElementById('gh-barra-remota');
    if (!barra) {
      barra = document.createElement('div');
      barra.id = 'gh-barra-remota';
      barra.className = 'gh-barra-remota';
      barra.innerHTML = '<span></span><button type="button" class="gh-barra-ok"></button><button type="button" class="gh-barra-x" aria-label="Cerrar">✕</button>';
      document.body.appendChild(barra);
      barra.querySelector('.gh-barra-x').addEventListener('click', () => barra.classList.remove('show'));
      barra.querySelector('.gh-barra-ok').addEventListener('click', async () => {
        barra.querySelector('.gh-barra-ok').textContent = 'Actualizando…';
        await ghRecargarConservando();
      });
    }
    barra.querySelector('span').textContent = texto;
    barra.querySelector('.gh-barra-ok').textContent = boton || 'Actualizar';
    requestAnimationFrame(() => barra.classList.add('show'));
  }
  async function ghRecargarConservando() {
    try {
      const tab = document.querySelector('.gc-tab.active');
      const sub = document.querySelector('.gc-panel.active .active[data-sub], .gc-panel.active .active[data-msub], .gc-panel.active .active[data-nsub], .gc-panel.active .active[data-psub], .gc-panel.active .active[data-asub], .gc-panel.active .active[data-dsub]');
      sessionStorage.setItem('gh-volver-a', JSON.stringify({ tab: tab ? tab.dataset.tab : '', sub: sub ? [...sub.attributes].filter((a) => /^data-.?sub$/.test(a.name)).map((a) => `[${a.name}="${a.value}"]`)[0] : '', y: window.scrollY }));
    } catch (e) {}
    if (window.GH_SYNC) await window.GH_SYNC.esperarGuardado(8000);
    location.reload();
  }
  window.GH_RECARGAR_CONSERVANDO = ghRecargarConservando;
  window.addEventListener('gh-datos-remotos', (e) => {
    const d = e.detail || {};
    if (d.porUnion) ghBarraRecargar('Se juntaron tus cambios con los de otro teléfono. Actualiza para ver todo junto.');
    else ghBarraRecargar('Hay cambios nuevos hechos desde otro teléfono.');
  });
  window.addEventListener('gh-recargar-sugerido', () => {
    ghBarraRecargar('Ya hay señal. Actualiza para ver todos tus datos.');
  });
  // Después de recargar, volver a la misma pantalla
  (function volverAPantalla() {
    let destino = null;
    try { destino = JSON.parse(sessionStorage.getItem('gh-volver-a') || 'null'); sessionStorage.removeItem('gh-volver-a'); } catch (e) {}
    if (!destino || !destino.tab) return;
    const t0 = Date.now();
    const iv = setInterval(() => {
      if (document.getElementById('gh-oculto-inicial') && Date.now() - t0 < 15000) return;
      clearInterval(iv);
      const tab = document.querySelector(`.gc-tab[data-tab="${destino.tab}"]`);
      if (tab && tab.offsetParent) tab.click();
      if (destino.sub) { const s = document.querySelector(`#panel-${destino.tab} ${destino.sub}`); if (s && s.offsetParent) s.click(); }
      if (destino.y) setTimeout(() => window.scrollTo(0, destino.y), 300);
    }, 150);
  })();

