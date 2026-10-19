  // ============================================================
  // SEGURIDAD: bloqueo con Face ID / PIN (local a este teléfono —
  // no usa window.storage porque una credencial de Face ID no tiene
  // sentido fuera del dispositivo donde se creó; así tampoco afecta
  // a otros teléfonos).
  // Expuesto en window.GH_APPLOCK_* para que el script de "control de
  // acceso" al final del archivo pueda usarlo antes de revelar la app.
  // ============================================================
  const APPLOCK_KEY = 'gh-applock-enabled';
  const APPLOCK_CRED_KEY = 'gh-applock-cred-id';
  const APPLOCK_PIN_HASH_KEY = 'gh-applock-pin-hash';

  async function ghSha256Hex(texto) {
    const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(texto));
    return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
  }

  function applockHabilitado() {
    try { return localStorage.getItem(APPLOCK_KEY) === '1'; } catch (e) { return false; }
  }

  function mostrarPantallaBloqueo(onDesbloqueado) {
    const overlay = document.createElement('div');
    overlay.id = 'gh-applock-overlay';
    overlay.style.cssText = 'position:fixed;inset:0;z-index:999999;background:linear-gradient(135deg,#0E1830 0%,#213661 100%);display:flex;align-items:center;justify-content:center;flex-direction:column;gap:20px;font-family:Inter,sans-serif;color:#fff;text-align:center;padding:26px;';
    let credId = null;
    try { credId = localStorage.getItem(APPLOCK_CRED_KEY); } catch (e) {}
    overlay.innerHTML = `
      <svg width="72" height="72" viewBox="0 0 512 512" xmlns="http://www.w3.org/2000/svg" style="border-radius:17px;box-shadow:0 6px 24px rgba(0,0,0,.35);"><rect width="512" height="512" rx="116" fill="#FFFFFF"/><path d="M212.8 206.1 A65.1 65.1 0 1 0 235.9 260.5" fill="none" stroke="#121316" stroke-width="25.2" stroke-linecap="round"/><path d="M176.8 256.0 H367.7" fill="none" stroke="#121316" stroke-width="25.2" stroke-linecap="round"/><path d="M305.6 190.9 V321.1 M367.7 190.9 V321.1" fill="none" stroke="#121316" stroke-width="25.2" stroke-linecap="round"/><circle cx="406.2" cy="314.5" r="11.1" fill="#E8803A"/></svg>
      <div style="font-size:16.5px;font-weight:700;">GH Manager bloqueada</div>
      <div id="gh-applock-msg" style="font-size:12.5px;color:rgba(255,255,255,.72);min-height:18px;max-width:280px;"></div>
      ${credId ? `<button id="gh-applock-btn-faceid" style="background:#0C9184;color:#fff;border:none;padding:14px 28px;border-radius:999px;font-weight:700;font-size:14.5px;cursor:pointer;">Desbloquear con Face ID</button>` : ''}
      <div id="gh-applock-pin-zona" style="${credId ? 'display:none;' : ''}width:100%;max-width:260px;">
        <input id="gh-applock-pin-input" type="password" inputmode="numeric" pattern="[0-9]*" maxlength="8" placeholder="PIN" style="width:100%;text-align:center;font-size:22px;letter-spacing:8px;padding:13px;border-radius:12px;border:none;margin-bottom:10px;box-sizing:border-box;">
        <button id="gh-applock-btn-pin" style="width:100%;background:#C2611B;color:#fff;border:none;padding:13px;border-radius:999px;font-weight:700;font-size:14px;cursor:pointer;">Desbloquear con PIN</button>
      </div>
      ${credId ? `<button id="gh-applock-usar-pin" style="background:none;border:none;color:rgba(255,255,255,.62);font-size:12.5px;text-decoration:underline;cursor:pointer;padding:6px;">Usar PIN en su lugar</button>` : ''}
    `;
    document.body.appendChild(overlay);

    const msg = (t) => { const m = document.getElementById('gh-applock-msg'); if (m) m.textContent = t; };

    function intentarFaceId() {
      if (!credId) return;
      msg('');
      // Igual que al registrarlo: sin ninguna espera antes de esta llamada,
      // o el iPhone la rechaza por no venir directo del toque.
      navigator.credentials.get({
        publicKey: {
          challenge: crypto.getRandomValues(new Uint8Array(24)),
          allowCredentials: [{ id: Uint8Array.from(atob(credId), (c) => c.charCodeAt(0)), type: 'public-key' }],
          userVerification: 'required',
          timeout: 60000
        }
      }).then(() => {
        overlay.remove();
        onDesbloqueado();
      }).catch((e) => {
        const n = (e && e.name) || '';
        msg(n === 'NotAllowedError'
          ? 'Face ID se canceló. Toca el botón otra vez o usa tu PIN.'
          : 'No se pudo verificar (' + (n || 'error') + '). Usa tu PIN.');
      });
    }
    const btnFace = document.getElementById('gh-applock-btn-faceid');
    if (btnFace) btnFace.addEventListener('click', intentarFaceId);
    // Nota: Face ID/WebAuthn se dispara SOLO desde el botón (gesto directo del
    // usuario) — Safari rechaza silenciosamente el intento si se llama sin un
    // tap justo antes, así que no conviene intentarlo automático al abrir.

    const btnUsarPin = document.getElementById('gh-applock-usar-pin');
    if (btnUsarPin) btnUsarPin.addEventListener('click', () => {
      document.getElementById('gh-applock-pin-zona').style.display = 'block';
      document.getElementById('gh-applock-pin-input').focus();
    });

    async function intentarPin() {
      const input = document.getElementById('gh-applock-pin-input');
      const pin = (input.value || '').trim();
      if (!pin) return;
      let hashGuardado = null;
      try { hashGuardado = localStorage.getItem(APPLOCK_PIN_HASH_KEY); } catch (e) {}
      const hashIntento = await ghSha256Hex('gh-pin::' + pin);
      if (hashGuardado && hashIntento === hashGuardado) {
        overlay.remove();
        onDesbloqueado();
      } else {
        msg('PIN incorrecto.');
        input.value = '';
        input.focus();
      }
    }
    const btnPin = document.getElementById('gh-applock-btn-pin');
    if (btnPin) btnPin.addEventListener('click', intentarPin);
    const pinInput = document.getElementById('gh-applock-pin-input');
    if (pinInput) pinInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') intentarPin(); });
  }

  window.GH_APPLOCK_VERIFICAR_Y_REVELAR = function (callback) {
    if (!applockHabilitado()) { callback(); return; }
    mostrarPantallaBloqueo(callback);
  };

  // ---- Configuración del bloqueo (Ajustes → Seguridad) ----
  (function () {
    const toggle = $('aj-applock-toggle');
    const config = $('aj-applock-config');
    if (!toggle || !config) return;

    function actualizarEstadoFaceId() {
      const el = $('aj-applock-faceid-estado');
      if (!el) return;
      let tiene = null;
      try { tiene = localStorage.getItem(APPLOCK_CRED_KEY); } catch (e) {}
      el.textContent = tiene ? 'Face ID activado en este teléfono ✓' : 'Face ID no activado en este teléfono todavía.';
    }

    toggle.checked = applockHabilitado();
    // La configuración (Face ID / PIN) va SIEMPRE visible: es el paso previo
    // para poder prender el interruptor. Si se escondiera hasta prenderlo,
    // no habría forma de activarlo nunca.
    actualizarEstadoFaceId();

    toggle.addEventListener('change', () => {
      let tieneCred = null, tienePin = null;
      try { tieneCred = localStorage.getItem(APPLOCK_CRED_KEY); tienePin = localStorage.getItem(APPLOCK_PIN_HASH_KEY); } catch (e) {}
      if (toggle.checked && !tieneCred && !tienePin) {
        toast('Primero activa Face ID o guarda un PIN aquí abajo, para no quedar fuera de la app.', 'info', 4500);
        toggle.checked = false;
        const btn = $('aj-applock-btn-faceid');
        if (btn) { btn.scrollIntoView({ behavior: 'smooth', block: 'center' }); }
        return;
      }
      try { localStorage.setItem(APPLOCK_KEY, toggle.checked ? '1' : '0'); } catch (e) {}
      toast(toggle.checked ? 'Bloqueo activado en este teléfono ✓' : 'Bloqueo desactivado', 'success');
    });

    // Safari (iPhone) exige que Face ID se pida en el MISMO instante del
    // toque: si antes de llamarlo se hace cualquier espera (await), iOS
    // considera que ya no viene de un gesto del usuario y lo rechaza sin
    // explicación. Por eso la comprobación de disponibilidad se hace al
    // cargar la pantalla, y el botón llama a Face ID de inmediato.
    let ghFaceIdDisponible = null;
    if (window.PublicKeyCredential && PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable) {
      PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable()
        .then((ok) => { ghFaceIdDisponible = ok; })
        .catch(() => { ghFaceIdDisponible = false; });
    }

    const btnFaceId = $('aj-applock-btn-faceid');
    if (btnFaceId) btnFaceId.addEventListener('click', () => {
      if (!window.isSecureContext) {
        toast('Face ID necesita que la app se abra con https:// (candado). Con http:// el iPhone no lo permite.', 'error', 6000);
        return;
      }
      if (!window.PublicKeyCredential) { toast('Este navegador no soporta Face ID/Touch ID para apps web.', 'error', 4000); return; }
      if (ghFaceIdDisponible === false) { toast('Este dispositivo no tiene Face ID/Touch ID disponible para apps web.', 'error', 4000); return; }

      // OJO: sin await antes de esta línea (ver nota de arriba).
      navigator.credentials.create({
        publicKey: {
          challenge: crypto.getRandomValues(new Uint8Array(24)),
          rp: { name: 'GH Manager' },
          user: { id: crypto.getRandomValues(new Uint8Array(16)), name: (window.GH_NOMBRE || 'usuario'), displayName: (window.GH_NOMBRE || 'Usuario') },
          pubKeyCredParams: [{ type: 'public-key', alg: -7 }, { type: 'public-key', alg: -257 }],
          authenticatorSelection: { authenticatorAttachment: 'platform', userVerification: 'required', residentKey: 'preferred' },
          timeout: 60000
        }
      }).then((cred) => {
        const credIdB64 = btoa(String.fromCharCode(...new Uint8Array(cred.rawId)));
        try { localStorage.setItem(APPLOCK_CRED_KEY, credIdB64); } catch (e) {}
        actualizarEstadoFaceId();
        toast('Face ID activado en este teléfono ✓', 'success');
      }).catch((e) => {
        // Mostrar el motivo real ayuda a saber qué pasó en vez de adivinar.
        const nombre = (e && e.name) || '';
        let msg;
        if (nombre === 'NotAllowedError') msg = 'Face ID se canceló o el iPhone no lo permitió. Intenta otra vez tocando el botón directo.';
        else if (nombre === 'NotSupportedError') msg = 'Este iPhone no soporta Face ID para apps web.';
        else if (nombre === 'SecurityError') msg = 'Face ID necesita https:// (candado) y un dominio válido.';
        else if (nombre === 'InvalidStateError') msg = 'Ya hay un Face ID registrado para esta app en este iPhone.';
        else msg = 'No se pudo activar Face ID (' + (nombre || (e && e.message) || 'error') + ').';
        toast(msg, 'error', 6000);
      });
    });

    const btnGuardarPin = $('aj-applock-btn-guardar-pin');
    if (btnGuardarPin) btnGuardarPin.addEventListener('click', async () => {
      const pin = ($('aj-applock-pin-nuevo').value || '').trim();
      if (!/^\d{4,8}$/.test(pin)) { toast('El PIN debe tener de 4 a 8 números.', 'error', 3000); return; }
      const hash = await ghSha256Hex('gh-pin::' + pin);
      try { localStorage.setItem(APPLOCK_PIN_HASH_KEY, hash); } catch (e) {}
      $('aj-applock-pin-nuevo').value = '';
      toast('PIN guardado ✓', 'success');
    });
  })();

  // ---- Logo para las facturas (lo que ve el cliente; no cambia el de la app) ----
  function ajRefrescarPreviewLogo() {
    if (typeof fcRender === 'function') { try { fcRender(); } catch (e) {} }
    aplicarLogo();
    const prev = $('aj-logo-preview');
    const btnQuitar = $('aj-logo-quitar');
    if (cfgLogoDataUrl) { prev.src = cfgLogoDataUrl; prev.style.display = ''; btnQuitar.style.display = ''; }
    else { prev.style.display = 'none'; btnQuitar.style.display = 'none'; }
  }
  // Redimensiona la imagen a un cuadro pequeño (para no guardar archivos pesados)
  function ajRedimensionarImagen(file, maxLado) {
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
        resolve(canvas.toDataURL('image/png'));
      };
      img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('No se pudo leer la imagen')); };
      img.src = url;
    });
  }
  if ($('aj-logo-input')) {
    $('aj-logo-input').addEventListener('change', async (e) => {
      const file = e.target.files && e.target.files[0];
      if (!file) return;
      if (!file.type.startsWith('image/')) { $('aj-logo-status').textContent = 'Elige un archivo de imagen (PNG, JPG).'; return; }
      $('aj-logo-status').textContent = 'Procesando…';
      try {
        cfgLogoDataUrl = await ajRedimensionarImagen(file, 200);
        await guardarConfig();
        aplicarLogo();
        ajRefrescarPreviewLogo();
        $('aj-logo-status').textContent = '';
        toast('Logo actualizado ✓', 'success');
      } catch (err) {
        $('aj-logo-status').textContent = 'No se pudo procesar la imagen. Intenta con otra.';
      }
      $('aj-logo-input').value = '';
    });
  }
  if ($('aj-logo-quitar')) {
    $('aj-logo-quitar').addEventListener('click', async () => {
      if (!await gcConfirm('¿Quitar el logo de la factura?', { okText: 'Quitar' })) return;
      cfgLogoDataUrl = '';
      await guardarConfig();
      aplicarLogo();
      ajRefrescarPreviewLogo();
      toast('Logo de la factura quitado', 'info');
    });
  }

  // ---- Colores de facturas y recibos (Ajustes → Name of Company) ----
  function fcRender() {
    const box = $('fc-sws'); if (!box) return;
    const sel = cfgFacturaColor;
    const esCustom = !!(sel && typeof sel === 'object');
    box.innerHTML = Object.entries(FACT_COLORES).map(([k, c]) =>
      `<button type="button" class="fc-sw${!esCustom && (sel === k || (!FACT_COLORES[sel] && k === 'clasico')) ? ' on' : ''}" data-fc="${k}" title="${c.n}" aria-label="${c.n}" style="--p:${c.p};--a:${c.a};"></button>`).join('')
      + `<button type="button" class="fc-sw custom${esCustom ? ' on' : ''}" data-fc="custom" title="Personalizado" aria-label="Personalizado"></button>`;
    const fc = facturaColores();
    $('fc-custom').classList.toggle('on', esCustom);
    $('fc-p').value = fc.p; $('fc-a').value = fc.a;
    const prev = $('fc-prev');
    prev.style.setProperty('--fp', fc.p); prev.style.setProperty('--fa', fc.a);
    $('fc-prev-nom').textContent = cfgFacturaNombre || 'Tu compañía';
  }
  async function fcGuardar(v) {
    cfgFacturaColor = v;
    fcRender();
    await guardarConfig();
  }
  if ($('fc-sws')) {
    $('fc-sws').addEventListener('click', async (e) => {
      const b = e.target.closest('.fc-sw'); if (!b) return;
      if (b.dataset.fc === 'custom') {
        const fc = facturaColores();
        await fcGuardar({ p: fc.p, a: fc.a });
      } else {
        await fcGuardar(b.dataset.fc);
      }
      toast('Colores de la factura guardados ✓', 'success', 1600);
    });
    let fcT = null;
    ['fc-p', 'fc-a'].forEach((id) => $(id).addEventListener('input', () => {
      const v = { p: $('fc-p').value, a: $('fc-a').value };
      if (!esHex(v.p) || !esHex(v.a)) return;
      cfgFacturaColor = v; fcRender();
      clearTimeout(fcT); fcT = setTimeout(() => guardarConfig(), 500);
    }));
    fcRender();
  }
  if ($('aj-logo-app')) {
    $('aj-logo-app').addEventListener('change', async () => {
      cfgLogoEnApp = $('aj-logo-app').checked;
      aplicarLogo();
      await guardarConfig();
    });
  }

  // ---- Mi cuenta: solo aplica en la versión con login (GH_ESPERAR_SESION) ----
  (function initCuenta() {
    if (typeof window.GH_ESPERAR_SESION !== 'function') {
      const card = $('aj-card-cuenta');
      if (card) card.style.display = 'none'; // sin login: no aplica
      return;
    }
    window.GH_ESPERAR_SESION().then(() => {
      $('aj-cuenta-nombre').textContent = window.GH_NOMBRE || 'usuario';
      $('aj-cuenta-rol').textContent = window.GH_ROL ? `(${window.GH_ROL})` : '';
      if (typeof ajAplicarRestriccionesRol === 'function') ajAplicarRestriccionesRol();
      if (typeof cargarFormAjustes === 'function') cargarFormAjustes();
      const btn = $('btn-cerrar-sesion');
      btn.style.display = 'inline-block';
      btn.addEventListener('click', async () => {
        if (!await gcConfirm('¿Cerrar tu sesión?', { okText: 'Cerrar sesión' })) return;
        if (typeof window.GH_CERRAR_SESION === 'function') window.GH_CERRAR_SESION();
      });

      // ---- Cambiar contraseña ----
      if (typeof window.GH_CAMBIAR_CONTRASENA === 'function') {
        const wrap = $('aj-cambiar-clave-wrap');
        const form = $('aj-cambiar-clave-form');
        const abrir = $('btn-abrir-cambiar-clave');
        const msg = $('aj-clave-msg');
        if (wrap) wrap.style.display = 'block';
        const limpiar = () => {
          ['aj-clave-actual', 'aj-clave-nueva', 'aj-clave-nueva2'].forEach((id) => { if ($(id)) $(id).value = ''; });
          if (msg) { msg.textContent = ''; msg.style.color = 'var(--ember)'; }
        };
        if (abrir) abrir.addEventListener('click', () => {
          form.style.display = form.style.display === 'none' ? 'block' : 'none';
          if (form.style.display === 'block') { limpiar(); $('aj-clave-actual').focus(); }
        });
        if ($('btn-cancelar-clave')) $('btn-cancelar-clave').addEventListener('click', () => { form.style.display = 'none'; limpiar(); });
        if ($('btn-guardar-clave')) $('btn-guardar-clave').addEventListener('click', async () => {
          const actual = $('aj-clave-actual').value;
          const nueva = $('aj-clave-nueva').value;
          const nueva2 = $('aj-clave-nueva2').value;
          msg.style.color = 'var(--ember)';
          if (!actual || !nueva || !nueva2) { msg.textContent = 'Llena los tres campos.'; return; }
          if (nueva.length < 6) { msg.textContent = 'La nueva debe tener al menos 6 caracteres.'; return; }
          if (!(/[a-zA-Z]/.test(nueva) && /[0-9]/.test(nueva))) { msg.textContent = 'La nueva debe tener letras y números.'; return; }
          if (nueva !== nueva2) { msg.textContent = 'Las dos contraseñas nuevas no coinciden.'; return; }
          if (nueva === actual) { msg.textContent = 'La nueva no puede ser igual a la actual.'; return; }
          const btnG = $('btn-guardar-clave');
          btnG.disabled = true; msg.style.color = 'var(--muted)'; msg.textContent = 'Guardando…';
          const r = await window.GH_CAMBIAR_CONTRASENA(actual, nueva);
          btnG.disabled = false;
          if (r && r.ok) {
            form.style.display = 'none'; limpiar();
            toast('Contraseña cambiada ✓', 'success', 3000);
          } else {
            msg.style.color = 'var(--ember)';
            msg.textContent = (r && r.error) || 'No se pudo cambiar.';
          }
        });
      }
    });
  })();

