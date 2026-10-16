// GH Manager — generado por build.mjs desde src/js. No editar a mano.
// ---- 00-arranque.js ----
  // Versión visible de la app (build.mjs pone el número).
  window.GH_APP_VERSION = 'v211 · prueba';

  // ---- Service worker (instalación PWA + abrir sin internet) ----
  // La versión nueva NO se instala sola a media tarea (antes la app se
  // recargaba sin avisar y se perdía lo que estabas escribiendo): se descarga
  // en segundo plano y aparece un aviso; se aplica cuando tocas "Actualizar".
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      let pedidaPorUsuario = false;
      navigator.serviceWorker.register('service-worker.js').then((reg) => {
        const revisar = () => reg.update().catch(() => {});
        revisar();
        document.addEventListener('visibilitychange', () => { if (!document.hidden) revisar(); });
        if (reg.waiting && navigator.serviceWorker.controller) mostrarAvisoActualizacion(reg);
        reg.addEventListener('updatefound', () => {
          const nuevo = reg.installing;
          if (!nuevo) return;
          nuevo.addEventListener('statechange', () => {
            if (nuevo.state === 'installed' && navigator.serviceWorker.controller) mostrarAvisoActualizacion(reg);
          });
        });
      }).catch(() => {});
      window.GH_PEDIR_ACTUALIZACION = () => { pedidaPorUsuario = true; };
      let recargado = false;
      navigator.serviceWorker.addEventListener('controllerchange', () => {
        if (recargado || !pedidaPorUsuario) return;
        recargado = true;
        window.location.reload();
      });
    });
  }

  async function mostrarAvisoActualizacion(reg) {
    if (document.getElementById('aviso-update')) return;
    let versionNueva = '';
    try {
      const nombres = await caches.keys();
      for (const n of nombres) {
        const resp = await (await caches.open(n)).match('./app.js', { ignoreSearch: true });
        if (!resp) continue;
        const m = (await resp.clone().text()).match(/GH_APP_VERSION\s*=\s*'([^']+)'/);
        if (m && m[1] && m[1] !== window.GH_APP_VERSION) { versionNueva = m[1]; break; }
      }
    } catch (e) {}
    const barra = document.createElement('div');
    barra.id = 'aviso-update';
    barra.className = 'gh-aviso-update';
    barra.innerHTML = '<span></span><button type="button">Actualizar</button>';
    barra.querySelector('span').textContent = 'Hay una versión nueva de GH Manager' + (versionNueva ? ` (${versionNueva})` : '');
    barra.querySelector('button').addEventListener('click', () => {
      // Si hay cambios guardándose todavía, esperar a que terminen
      const listo = (window.GH_SYNC && window.GH_SYNC.esperarGuardado) ? window.GH_SYNC.esperarGuardado(8000) : Promise.resolve();
      barra.querySelector('button').textContent = 'Actualizando…';
      listo.then(() => {
        if (window.GH_PEDIR_ACTUALIZACION) window.GH_PEDIR_ACTUALIZACION();
        navigator.serviceWorker.getRegistration().then((r) => {
          const w = (r && r.waiting) || (reg && reg.waiting);
          if (w) w.postMessage('skip-waiting'); else window.location.reload();
          setTimeout(() => window.location.reload(), 3000);
        });
      });
    });
    document.body.appendChild(barra);
  }

  // ---- Almacenamiento ----
  // window.storage lo define supabase-storage.js (la nube). Antes, si la nube
  // fallaba, esto guardaba en el teléfono "a escondidas" y decía que sí se
  // guardó: luego la nube devolvía lo viejo y los cambios "desaparecían".
  // Ahora los fallos de la nube los maneja la cola de supabase-storage.js
  // (se reintenta solo y se ve en el indicador de guardado). Solo si no
  // existe la nube (por ejemplo, abrir el archivo sin internet la primera
  // vez) se usa el almacenamiento del navegador.
  if (!window.storage) {
    window.storage = {
      get: async (key) => {
        const v = localStorage.getItem(key);
        if (v === null) throw new Error('not found');
        return { key, value: JSON.parse(v), shared: false };
      },
      set: async (key, value) => { localStorage.setItem(key, JSON.stringify(value)); return { key, value, shared: false }; },
      delete: async (key) => { localStorage.removeItem(key); return { key, deleted: true }; },
      list: async (prefix) => ({ keys: Object.keys(localStorage).filter((k) => !prefix || k.startsWith(prefix)), prefix, shared: false })
    };
  }

(function () {
// ---- 01-nucleo.js ----
  const KEY_MOV = 'movimientos';
  const KEY_CAT_GASTO = 'catGastos';
  const KEY_CAT_INGRESO = 'catIngresos';
  const KEY_INVOICES = 'invoicesGuardados';
  let TASA_TAXAS = 0.10;   // configurable en Ajustes → Avanzado → Socios
  const BONO_CRA = 0.10;

  // ---- Aviso de conexión (la app depende de internet para guardar en la nube) ----
  function actualizarBannerConexion() {
    let banner = document.getElementById('gc-offline-banner');
    if (!navigator.onLine) {
      if (!banner) {
        banner = document.createElement('div');
        banner.id = 'gc-offline-banner';
        banner.className = 'gc-banner offline';
        banner.textContent = 'Sin señal — lo que guardes se queda en este teléfono y se sube solo cuando vuelva la señal.';
        document.body.insertBefore(banner, document.body.firstChild);
      }
    } else if (banner) {
      banner.remove();
    }
  }
  window.addEventListener('online', () => { actualizarBannerConexion(); toast('Volvió la señal ✓', 'success'); });
  window.addEventListener('offline', () => { actualizarBannerConexion(); toast('Se perdió la conexión a internet', 'error', 4000); });
  actualizarBannerConexion();

  // ---- Manejo global de errores: mostrar un aviso en vez de fallar en silencio ----
  // (se ignoran avisos inofensivos del navegador y de extensiones; el error
  // real queda en la consola para poder encontrarlo)
  let ultimoAvisoError = 0;
  const avisoError = (txt) => {
    if (Date.now() - ultimoAvisoError < 5000) return;
    ultimoAvisoError = Date.now();
    try { toast(txt, 'error', 4000); } catch (err) {}
  };
  window.addEventListener('error', (e) => {
    const m = String((e && e.message) || '');
    if (!m || /ResizeObserver|Script error|extension/i.test(m)) return;
    avisoError('Ocurrió un error inesperado. Si algo no se guardó, inténtalo de nuevo.');
  });
  window.addEventListener('unhandledrejection', (e) => {
    const m = String((e && e.reason && (e.reason.message || e.reason)) || '');
    if (/AbortError|not found|cancel/i.test(m)) return;
    avisoError('No se pudo completar una acción. ' + (navigator.onLine ? 'Intenta de nuevo.' : 'No hay señal.'));
  });

  // ¿Estamos en la base de datos original ("principal")? Las demás bases
  // empiezan vacías: sin categorías, colonias, clientes ni nombres de ejemplo.
  function ghEsBasePrincipal() {
    try { return !window.GH_GET_CUENTA || (window.GH_GET_CUENTA() || 'principal') === 'principal'; } catch (e) { return true; }
  }
  // Clave de este aparato separada por base de datos (borradores de hojas,
  // etc.), para que lo de una base no aparezca en otra. La principal usa la
  // clave de siempre, así no se pierde nada de lo que ya estaba guardado.
  function ghLK(k) {
    return ghEsBasePrincipal() ? k : (k + '@' + window.GH_GET_CUENTA());
  }
  // Categorías para una base que nunca guardó su lista: la principal usa las
  // de siempre; las demás solo las que ya usan sus propios movimientos.
  function ghCatsIniciales(tipo, defecto) {
    if (ghEsBasePrincipal()) return defecto.slice();
    const set = new Set();
    (movimientos || []).forEach((m) => { if (m && m.tipo === tipo && m.cat) set.add(m.cat); });
    return [...set];
  }

  const DEFAULT_GASTOS = [
    "Harbor Freight","Home Depot","Gas","Comestibles","Liability Insurance","Work Compensation",
    "Herramientas","Ariel Chirinos","Utilidades","Mantenimiento","Nacional General","Material",
    "Emin Guzman","Extra","Renovaciones","Sairi Soto","Ferguson","Amazon","Subscriciones"
  ];
  const DEFAULT_INGRESOS = ["Airtron"];

  // Historial importado desde la hoja de cálculo original (enero-mayo 2026).
  // Cada Subtotal GUZMAN HVAC fue verificado contra la hoja original antes de importar.

  let movimientos = [];
  let catGastos = [];
  let catIngresos = [];
  let invoicesGuardados = [];
  let tipoActual = 'ingreso';
  let movEditandoId = null;

  const $ = (id) => document.getElementById(id);
  // Dinero: -$225.50 (antes salía $-225.50). Redondea a centavos para no mostrar -$0.00.
  const fmt = (n) => { const v = Math.round((Number(n) || 0) * 100) / 100; return (v < 0 ? '-$' : '$') + Math.abs(v).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); };
  // Versión visible de la app — súbela cada vez que haya cambios para confirmar que cargó la nueva
  const APP_VERSION = window.GH_APP_VERSION;
  (function mostrarVersion() {
    const b = document.getElementById('app-version-badge');
    if (b) b.textContent = APP_VERSION;
    const a = document.getElementById('app-version-acerca');
    if (a) a.textContent = APP_VERSION;
  })();
  // Debounce: evita re-renderizar en cada tecla (más rápido y fluido)
  const debounce = (fn, ms = 180) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };

  // ====================================================================
  // MODO SELECCIÓN (reutilizable, estilo app: "Seleccionar" → marcar
  // varios → barra de acciones abajo con Borrar / Compartir / Imprimir).
  // Se conecta a cualquier lista: tabla o cuadrícula de tarjetas.
  // ====================================================================
  const GH_SEL = { activo: null }; // solo una lista en modo selección a la vez

  function ghCrearSeleccion(cfg) {
    // cfg: { host, contenedor, nombre, plural, acciones: [{id,texto,peligro,fn(ids)}] }
    const host = typeof cfg.host === 'string' ? document.getElementById(cfg.host) : cfg.host;
    if (!host) return null;

    const api = { modo: false, ids: new Set() };

    const barra = document.createElement('div');
    barra.className = 'sel-toolbar';
    const btnModo = document.createElement('button');
    btnModo.type = 'button'; btnModo.className = 'sel-btn'; btnModo.textContent = 'Seleccionar';
    const btnTodos = document.createElement('button');
    btnTodos.type = 'button'; btnTodos.className = 'sel-btn'; btnTodos.textContent = 'Todos';
    btnTodos.style.display = 'none';
    const cuenta = document.createElement('span');
    cuenta.className = 'sel-count';
    barra.appendChild(btnModo); barra.appendChild(btnTodos); barra.appendChild(cuenta);
    host.appendChild(barra);

    const accionbar = document.createElement('div');
    accionbar.className = 'sel-actionbar';
    cfg.acciones.forEach((a) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'sel-act' + (a.peligro ? ' peligro' : '');
      b.textContent = a.texto;
      b.addEventListener('click', async () => {
        const ids = [...api.ids];
        if (!ids.length) return;
        try { await a.fn(ids); } catch (e) { toast('No se pudo completar: ' + (e && e.message ? e.message : e), 'error', 5000); }
      });
      accionbar.appendChild(b);
    });
    document.body.appendChild(accionbar);

    function contenedor() {
      return typeof cfg.contenedor === 'string' ? document.getElementById(cfg.contenedor) : cfg.contenedor();
    }

    function refrescar() {
      const n = api.ids.size;
      cuenta.textContent = api.modo ? (n ? `${n} ${n === 1 ? cfg.nombre : cfg.plural}` : 'Toca para marcar') : '';
      accionbar.classList.toggle('show', api.modo && n > 0);
      accionbar.querySelectorAll('.sel-act').forEach((b) => { b.disabled = n === 0; });
    }

    function salir() {
      api.modo = false; api.ids.clear();
      const c = contenedor();
      if (c) {
        c.classList.remove('sel-modo');
        c.querySelectorAll('.sel-on').forEach((el) => el.classList.remove('sel-on'));
      }
      btnModo.textContent = 'Seleccionar'; btnModo.classList.remove('on');
      btnTodos.style.display = 'none';
      GH_SEL.activo = null;
      refrescar();
    }
    api.salir = salir;

    btnModo.addEventListener('click', () => {
      if (api.modo) { salir(); return; }
      if (GH_SEL.activo && GH_SEL.activo !== api) GH_SEL.activo.salir();
      api.modo = true; GH_SEL.activo = api;
      const c = contenedor();
      if (c) c.classList.add('sel-modo');
      btnModo.textContent = 'Cancelar'; btnModo.classList.add('on');
      btnTodos.style.display = 'inline-block';
      refrescar();
    });

    btnTodos.addEventListener('click', () => {
      const c = contenedor();
      if (!c) return;
      const items = [...c.querySelectorAll('.sel-item')];
      const faltan = items.some((el) => !el.classList.contains('sel-on'));
      items.forEach((el) => {
        el.classList.toggle('sel-on', faltan);
        if (faltan) api.ids.add(el.dataset.selid); else api.ids.delete(el.dataset.selid);
      });
      btnTodos.textContent = faltan ? 'Ninguno' : 'Todos';
      refrescar();
    });

    // Un solo manejador para toda la lista (funciona aunque las filas se
    // vuelvan a dibujar). En captura, para ganarle a los botones de cada fila.
    const contClick = contenedor();
    if (contClick) {
      contClick.addEventListener('click', (e) => {
        if (!api.modo) return;
        const item = e.target.closest ? e.target.closest('.sel-item') : null;
        if (!item) return;
        e.preventDefault(); e.stopPropagation();
        const id = item.dataset.selid;
        if (item.classList.toggle('sel-on')) api.ids.add(id); else api.ids.delete(id);
        refrescar();
      }, true);
    }

    api.refrescarTrasRedibujar = () => {
      const c = contenedor();
      if (api.modo && c) {
        c.classList.add('sel-modo');
        c.querySelectorAll('.sel-item').forEach((el) => {
          el.classList.toggle('sel-on', api.ids.has(el.dataset.selid));
        });
      }
      refrescar();
    };

    refrescar();
    return api;
  }

  // Compartir/imprimir varios documentos juntos, en un solo archivo
  function ghDocumentoCombinado(partes, titulo) {
    return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${escapeHtml(titulo || 'Documentos')}</title>
      <style>
        @page { margin: 14mm; }
        body { font-family: Arial, Helvetica, sans-serif; color:#1a1a1a; margin:0; padding:24px; max-width:820px; }
        table { width:100%; border-collapse:collapse; }
        h1 { font-size:21px; margin:0; } h2 { font-size:13.5px; text-transform:uppercase; letter-spacing:.5px; color:#1B2A4A; border-bottom:1px solid #1B2A4A; padding-bottom:4px; margin:22px 0 8px; }
        th { text-align:left; border-bottom:1.5px solid #1a1a1a; padding:6px 4px; font-size:10.5px; text-transform:uppercase; }
        td { padding:6px 4px; border-bottom:1px solid #ccc; font-size:12.5px; }
        .num, .r { text-align:right; }
        tfoot td { padding:7px 4px; font-weight:600; }
        tfoot tr.ps-tax td { border-top:1px solid #1a1a1a; }
        tfoot tr.ps-total td { border-top:2px solid #1a1a1a; font-size:14px; }
        .ps-addr { font-size:12px; color:#555; margin:4px 0; } .ps-badge { font-size:11px; color:#555; margin-bottom:18px; }
        .ps-split { display:grid; grid-template-columns:repeat(auto-fit, minmax(210px, 1fr)); gap:24px; margin-top:10px; }
        .ps-split-box { border:1.5px solid #1a1a1a; padding:14px; }
        .ps-split-box .ps-name { font-weight:700; font-size:13px; margin-bottom:6px; }
        .ps-split-box .ps-total { font-size:19px; font-weight:700; }
        .ps-split-box .ps-note { font-size:11px; color:#555; margin-top:4px; }
        .gh-doc + .gh-doc { page-break-before: always; border-top: 2px dashed #bbb; margin-top: 34px; padding-top: 26px; }
      </style></head><body>${partes.map((p) => `<div class="gh-doc">${p}</div>`).join('')}</body></html>`;
  }

  async function ghCompartirHTML(html, nombreArchivo, resumen) {
    try {
      const archivo = new File([html], nombreArchivo, { type: 'text/html' });
      if (navigator.canShare && navigator.canShare({ files: [archivo] })) {
        await navigator.share({ files: [archivo], title: resumen, text: resumen });
        return;
      }
    } catch (e) { if (e && e.name === 'AbortError') return; }
    // Respaldo: descargar el archivo
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([html], { type: 'text/html;charset=utf-8;' }));
    a.download = nombreArchivo; a.click(); URL.revokeObjectURL(a.href);
    toast('Se descargó el archivo (este navegador no comparte directo)', 'info', 4000);
  }

  // Fecha en formato YYYY-MM-DD usando el día LOCAL. No se usa toISOString()
  // porque convierte a horario de Greenwich y en Nashville (5-6 h atrás) la
  // fecha se adelanta un día — causaba que al marcar "lunes 15" se guardara 16.
  const ghFechaLocal = (d) => (d || new Date()).getFullYear() + '-' +
    String((d || new Date()).getMonth() + 1).padStart(2, '0') + '-' +
    String((d || new Date()).getDate()).padStart(2, '0');
  const today = () => ghFechaLocal(new Date());

  // ============================================================
  // CONFIGURACIÓN DE NOMBRES (socios + factura) — se guarda en la nube
  // ============================================================
  // cfgSocios: lista de socios, cada uno { id, nombre, bonoPct }. El reparto
  // de cada semana se divide en partes iguales entre todos los que haya en
  // la lista (1, 2 o más); el ajuste manual (Movimientos → Ajuste) siempre
  // es del SEGUNDO socio de la lista. bonoPct = porcentaje de bono (0-100),
  // 0 significa que ese socio no recibe bono.
  const CFG_KEY = 'kontaly-config';
  // De fábrica NO hay socios: los que tengas vienen de tu configuración en la
  // nube. (Antes venían 2 de ejemplo y, si la nube tardaba en contestar, se
  // guardaban encima de los tuyos — por eso "regresaba" un socio borrado.)
  let cfgSocios = [];
  // Alias de compatibilidad: apuntan siempre al 1° y 2° socio de la lista.
  // Muchas partes de la app (facturas, nómina, etiquetas) solo necesitan
  // "el nombre principal", así que se siguen leyendo desde aquí.
  let cfgSocioBonus = 'CRA HVAC';
  let cfgSocioMitad = 'GUZMAN HVAC';
  function actualizarAliasSocios() {
    cfgSocioBonus = (cfgSocios[0] && cfgSocios[0].nombre) || 'Socio 1';
    cfgSocioMitad = (cfgSocios[1] && cfgSocios[1].nombre) || cfgFacturaNombre || 'Socio 2';
  }
  let cfgFacturaNombre = 'GUZMAN HVAC';
  let cfgFacturaDireccion = '';
  let cfgFacturaSigueSocio = true; // (obsoleto) antes el nombre seguía al Socio 2
  let cfgSociosMigrados = false;   // ya se separó la empresa de la lista de socios
  let cfgLogoDataUrl = ''; // logo para las FACTURAS (aparte del logo de la app)
  let cfgFacturaColor = 'clasico'; // colores de facturas y recibos (preset o {p,a})
  let cfgLogoEnApp = false;        // usar el logo de la compañía también arriba en la app
  let cfgUltimoCliente = ''; // último "Bill To" usado en Facturas — se mantiene hasta que lo cambien
  let cfgUltimoClienteDir = ''; // última dirección del cliente — se recuerda igual que el nombre

  // Copia local de la última configuración buena, por base de datos. Si al
  // abrir la app la nube no contesta (sesión vencida, sin señal), se usa esta
  // copia en vez de los valores de fábrica, y nunca se guardan encima.
  const cfgCacheKey = () => 'gh-cfg-cache:' + ((typeof window.GH_GET_CUENTA === 'function' && window.GH_GET_CUENTA()) || 'principal');
  let cfgCargada = false;   // true cuando ya se leyó la config real (nube o copia)
  async function cfgLeerSeguro() {
    let sinSenal = false;
    for (let intento = 0; intento < 3; intento++) {
      try {
        const r = await window.storage.get(CFG_KEY);
        const c = JSON.parse(r.value);
        if (c && typeof c === 'object') {
          try { localStorage.setItem(cfgCacheKey(), r.value); } catch (e) {}
          return c;
        }
      } catch (e) { sinSenal = !!(e && e.sinSenal); if (!sinSenal && intento === 0 && e && e.message === 'not found') break; }
      if (intento < 2) await new Promise((res) => setTimeout(res, 800 * (intento + 1)));
    }
    const copia = localStorage.getItem(cfgCacheKey());
    if (copia) { setTimeout(() => cargarConfig(), 15000); return JSON.parse(copia); }   // reintenta la nube más tarde
    const err = new Error('sin-config'); err.sinSenal = sinSenal; throw err;
  }

  async function cargarConfig() {
    try {
      const c = await cfgLeerSeguro();
      cfgCargada = true;
      if (Array.isArray(c.socios)) {
        // Formato nuevo: usar tal cual (normalizando por si falta algún campo)
        // Nota: permitimos socios vacío [] para bases de datos sin socios
        cfgSocios = c.socios.map((s, i) => ({
          id: s.id || ('socio-' + (i + 1)),
          nombre: s.nombre || ('Socio ' + (i + 1)),
          bonoPct: Number(s.bonoPct) || 0
        }));
      } else if (c.socioBonus) {
        // Migración desde el formato viejo (Socio 1 / Socio 2 fijos + on/off)
        cfgSocios = [{ id: 'socio-1', nombre: c.socioBonus, bonoPct: c.socio1Bono ? 10 : 0 }];
        if (c.socioMitad && c.socioMitad !== c.socioBonus) {
          cfgSocios.push({ id: 'socio-2', nombre: c.socioMitad, bonoPct: c.socio2Bono ? 10 : 0 });
        }
      }
      actualizarAliasSocios();
      if (c.facturaNombre) cfgFacturaNombre = c.facturaNombre;
      if (typeof c.facturaDireccion === 'string') cfgFacturaDireccion = c.facturaDireccion;
      if (typeof c.facturaSigueSocio === 'boolean') cfgFacturaSigueSocio = c.facturaSigueSocio;
      if (typeof c.sociosMigrados === 'boolean') cfgSociosMigrados = c.sociosMigrados;
      if (typeof c.logoDataUrl === 'string') cfgLogoDataUrl = c.logoDataUrl;
      if (c.facturaColor) cfgFacturaColor = c.facturaColor;
      if (typeof c.logoEnApp === 'boolean') cfgLogoEnApp = c.logoEnApp;
      if (typeof c.ultimoCliente === 'string') cfgUltimoCliente = c.ultimoCliente;
      if (typeof c.ultimoClienteDir === 'string') cfgUltimoClienteDir = c.ultimoClienteDir;
      if (typeof c.tasaTaxas === 'number' && c.tasaTaxas >= 0 && c.tasaTaxas < 1) TASA_TAXAS = c.tasaTaxas;
    } catch (e) {
      if (e && e.sinSenal) {
        // No se pudo leer (sin señal) y no hay copia: NO es una base nueva.
        // No se guarda nada (para no borrar el nombre de la compañía ni los
        // socios) y se vuelve a intentar en un rato.
        setTimeout(() => cargarConfig().then(() => { try { renderMovimientos(); renderReparto(); } catch (e2) {} }), 15000);
        aplicarNombresEstaticos();
        return;
      }
      // No hay configuración ni en la nube ni en este teléfono: base de datos nueva.
      cfgCargada = true;
      if (ghEsBasePrincipal()) {
        // Migración: si había una dirección vieja en localStorage, usarla
        try { const d = localStorage.getItem('cra-direccion'); if (d) cfgFacturaDireccion = d; } catch (e2) {}
      } else {
        // Base de datos nueva: empieza en blanco (el nombre de la compañía
        // se pone en Ajustes). Nada se copia de otra base.
        cfgFacturaNombre = ''; cfgFacturaDireccion = ''; cfgSocios = []; cfgUltimoCliente = ''; cfgUltimoClienteDir = '';
        cfgLogoDataUrl = ''; cfgFacturaColor = 'clasico'; cfgLogoEnApp = false;
      }
    }
    // Si el nombre de factura sigue al socio, mantenerlo sincronizado
    // Antes la empresa era "el Socio 2" de la lista. Ahora la empresa va
    // aparte (Name of Company) y la lista son SOLO los socios, que además
    // son opcionales. Esta migración corre una sola vez.
    // La empresa nunca debe estar dentro de la lista de socios (pasaba en
    // versiones anteriores, y hacía que el reparto saliera duplicado).
    (function limpiarEmpresaDeSocios() {
      const clave = (cfgFacturaNombre || '').trim().toLowerCase();
      if (!clave || !Array.isArray(cfgSocios)) return;
      const antes = cfgSocios.length;
      cfgSocios = cfgSocios.filter((x) => x && x.nombre && x.nombre.trim().toLowerCase() !== clave);
      if (cfgSocios.length !== antes) guardarConfig();
    })();

    if (!cfgSociosMigrados) {
      if (cfgFacturaSigueSocio && cfgSocios.length >= 2) {
        cfgFacturaNombre = (cfgSocios[1] && cfgSocios[1].nombre) || cfgFacturaNombre;
        cfgSocios = cfgSocios.filter((_, i) => i !== 1);   // quitar a la empresa de la lista
      }
      cfgFacturaSigueSocio = false;
      cfgSociosMigrados = true;
      guardarConfig();
    }
    actualizarAliasSocios();
    aplicarNombresEstaticos();
    aplicarLogo();
    // Si el formulario de Ajustes ya se había pintado con valores por defecto
    // (porque la sesión resolvió antes que esta carga), lo refresca ahora con
    // los valores reales — así nunca se queda mostrando datos viejos.
    if (typeof cargarFormAjustes === 'function' && document.getElementById('aj-socios-lista')) cargarFormAjustes();
    // "Bill To" recuerda la última compañía usada, hasta que la cambien a propósito
    const campoCliente = $('inv-cliente');
    if (campoCliente && !campoCliente.value) campoCliente.value = cfgUltimoCliente;
    const campoCliDir = document.getElementById('inv-cliente-direccion');
    if (campoCliDir && !campoCliDir.value) campoCliDir.value = cfgUltimoClienteDir;
    const campoDirEmp = document.getElementById('inv-direccion-emisor');
    if (campoDirEmp && !campoDirEmp.value) campoDirEmp.value = cfgFacturaDireccion;
  }
  async function guardarConfig() {
    // Nunca guardar antes de haber leído la configuración real: así no se
    // pisan tus socios con valores de fábrica.
    if (!cfgCargada) return;
    const c = {
      socios: cfgSocios,
      socioBonus: cfgSocioBonus, socioMitad: cfgSocioMitad, // se dejan también por compatibilidad hacia atrás
      facturaNombre: cfgFacturaNombre, facturaDireccion: cfgFacturaDireccion,
      facturaSigueSocio: cfgFacturaSigueSocio, sociosMigrados: cfgSociosMigrados, logoDataUrl: cfgLogoDataUrl, facturaColor: cfgFacturaColor, logoEnApp: cfgLogoEnApp,
      ultimoCliente: cfgUltimoCliente, ultimoClienteDir: cfgUltimoClienteDir, tasaTaxas: TASA_TAXAS
    };
    try { localStorage.setItem(cfgCacheKey(), JSON.stringify(c)); } catch (e) {}
    try { await window.storage.set(CFG_KEY, JSON.stringify(c)); } catch (e) {}
    if (window.GH_PUBLICAR_FACTURA) window.GH_PUBLICAR_FACTURA();
  }
  // El encabezado usa el logo de la app (GH Manager), salvo que en Ajustes se
  // elija "usar mi logo también en la app" y haya un logo subido.
  function aplicarLogo() {
    const badge = document.querySelector('.gc-logo-badge');
    const img = document.getElementById('gc-logo-custom');
    const usar = !!(cfgLogoEnApp && cfgLogoDataUrl);
    if (badge) badge.style.display = usar ? 'none' : '';
    if (img) {
      if (usar) { img.src = cfgLogoDataUrl; img.style.display = ''; }
      else { img.style.display = 'none'; img.removeAttribute('src'); }
    }
    const t = document.getElementById('aj-logo-app');
    if (t) { t.checked = !!cfgLogoEnApp; t.disabled = !cfgLogoDataUrl; }
  }

  // ---- Colores de facturas y recibos ----
  const FACT_COLORES = {
    clasico: { n: 'Clásico', p: '#0E1830', a: '#C2611B' },
    azul:    { n: 'Azul',    p: '#123A73', a: '#2F7BD9' },
    verde:   { n: 'Verde',   p: '#143D2B', a: '#2E9B5A' },
    teal:    { n: 'Teal',    p: '#0B3B3B', a: '#0E8F82' },
    rojo:    { n: 'Rojo',    p: '#4A1416', a: '#C8302F' },
    morado:  { n: 'Morado',  p: '#2E1A47', a: '#8A4FD0' },
    negro:   { n: 'Negro',   p: '#111111', a: '#8A8A8A' },
  };
  const esHex = (h) => typeof h === 'string' && /^#[0-9a-f]{6}$/i.test(h);
  function mezclarHex(h1, h2, t) {
    const a = parseInt(h1.slice(1), 16), b = parseInt(h2.slice(1), 16);
    const c = (sh) => Math.round(((a >> sh) & 255) * (1 - t) + ((b >> sh) & 255) * t);
    return '#' + [16, 8, 0].map((sh) => c(sh).toString(16).padStart(2, '0')).join('');
  }
  function facturaColores(sel) {
    const c = sel === undefined ? cfgFacturaColor : sel;
    let p, a;
    if (c && typeof c === 'object' && esHex(c.p) && esHex(c.a)) { p = c.p; a = c.a; }
    else { const k = FACT_COLORES[c] || FACT_COLORES.clasico; p = k.p; a = k.a; }
    const clasico = p === FACT_COLORES.clasico.p && a === FACT_COLORES.clasico.a;
    return { p, a,
      tint: clasico ? '#FBEAD8' : mezclarHex(a, '#ffffff', 0.86),
      tintTxt: clasico ? '#5C3B1B' : mezclarHex(a, '#000000', 0.55) };
  }

  // Actualiza los textos fijos del HTML que muestran los nombres de los socios
  function aplicarNombresEstaticos() {
    document.querySelectorAll('.socio-bonus').forEach((e) => { e.textContent = cfgSocioBonus; });
    document.querySelectorAll('.socio-mitad').forEach((e) => { e.textContent = cfgSocioMitad; });
  }

  // ============================================================
  // RECORDATORIOS — avisan al abrir la app (no son notificaciones
  // push reales: solo se muestran si la app está abierta).
  // ============================================================
  const fmtDia = (iso) => { const [y, m, d] = iso.split('-'); return `${d}/${m}`; };

  const MESES_ES = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'];

  function mondayOf(iso) {
    const d = new Date(iso + 'T00:00:00');
    const day = d.getDay();
    const diff = d.getDate() - day + (day === 0 ? -6 : 1);
    const monday = new Date(d);
    monday.setDate(diff);
    return monday;
  }
  // Etiqueta "Semana del lunes D al viernes D de mes" (o "de mes1 al ... de mes2" si cruza de mes)
  function labelSemanaLunesAViernes(monday, friday) {
    const dM = monday.getDate(), dV = friday.getDate();
    const mM = MESES_ES[monday.getMonth()], mV = MESES_ES[friday.getMonth()];
    if (monday.getMonth() === friday.getMonth()) {
      return `Semana del lunes ${dM} al viernes ${dV} de ${mV}`;
    }
    return `Semana del lunes ${dM} de ${mM} al viernes ${dV} de ${mV}`;
  }
  function weekInfo(iso) {
    const monday = mondayOf(iso);
    const friday = new Date(monday);
    friday.setDate(monday.getDate() + 4);
    const key = ghFechaLocal(monday);
    const label = labelSemanaLunesAViernes(monday, friday);
    return { key, label };
  }

  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  // ---- Tabs ----
  // ---- Selector de semana para ingresos: flechas ‹ › + "Semana del lunes D al viernes D de mes" ----
  let ingresoSemanaOffset = 0; // 0 = semana actual; -1 = semana pasada; +1 = próxima semana
  function actualizarSemanaIngreso() {
    const base = new Date();
    base.setDate(base.getDate() + ingresoSemanaOffset * 7);
    const baseIso = ghFechaLocal(base);
    const monday = mondayOf(baseIso);
    const friday = new Date(monday);
    friday.setDate(monday.getDate() + 4);
    $('m-fecha').value = ghFechaLocal(friday);
    $('ingreso-semana-label').textContent = labelSemanaLunesAViernes(monday, friday);
  }

  document.querySelectorAll('.gc-tab').forEach((tab) => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.gc-tab').forEach((t) => t.classList.remove('active'));
      document.querySelectorAll('.gc-panel').forEach((p) => p.classList.remove('active'));
      tab.classList.add('active');
      $('panel-' + tab.dataset.tab).classList.add('active');
      if (tab.dataset.tab === 'buscar') { renderAnios(); renderBusqueda(); renderResumenTaxas(); renderTotalPorSocio(); }
      if (tab.dataset.tab === 'calendario') calCargarDatos();
      if (tab.dataset.tab === 'movimientos') { ghActualizarHero(); if (typeof ghBDHeroPintar === 'function') ghBDHeroPintar(); }
    });
  });

  // ---- Sub-pestañas (carpetas) de Movimientos: Movimientos, Invoices guardados, Categorías ----
  document.querySelectorAll('.mov-subtab').forEach((tab) => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.mov-subtab').forEach((t) => t.classList.remove('active'));
      document.querySelectorAll('.mov-subpanel').forEach((p) => p.classList.remove('active'));
      tab.classList.add('active');
      const sub = tab.dataset.msub;
      $('mov-sub-' + sub).classList.add('active');
      if (sub === 'invoices') renderReparto();
      if (sub === 'categorias') renderCategorias();
    });
  });

  $('m-fecha').value = today();
  $('ingreso-semana-row').style.display = 'block';
  actualizarSemanaIngreso();
  $('gc-fecha-actual').textContent = new Date().toLocaleDateString('es-MX', { day: 'numeric', month: 'long', year: 'numeric' });

  // ---- Load ----
  async function loadAll() {
    // Leer todo en paralelo (más rápido que una tras otra)
    const [rMov, rGas, rIng, rInv] = await Promise.all([
      window.storage.get(KEY_MOV, false).catch(() => null),
      window.storage.get(KEY_CAT_GASTO, false).catch(() => null),
      window.storage.get(KEY_CAT_INGRESO, false).catch(() => null),
      window.storage.get(KEY_INVOICES, false).catch(() => null),
      cargarConfig(), // nombres de socios + factura (nube)
    ]);
    try { movimientos = rMov && rMov.value ? JSON.parse(rMov.value) : []; } catch (e) { movimientos = []; }
    try { catGastos = rGas && rGas.value ? JSON.parse(rGas.value) : ghCatsIniciales('gasto', DEFAULT_GASTOS); } catch (e) { catGastos = ghCatsIniciales('gasto', DEFAULT_GASTOS); }
    try { catIngresos = rIng && rIng.value ? JSON.parse(rIng.value) : ghCatsIniciales('ingreso', DEFAULT_INGRESOS); } catch (e) { catIngresos = ghCatsIniciales('ingreso', DEFAULT_INGRESOS); }
    try { invoicesGuardados = rInv && rInv.value ? JSON.parse(rInv.value) : []; } catch (e) { invoicesGuardados = []; }

    aplicarNombresEstaticos();
    renderCategorias();
    renderCatSelect();
    renderMovimientos();
    actualizarStats();
    refrescarSugerenciasDesc();
    ghActualizarHero();   // resumen del día, arriba de todo
  }

  async function saveMov() {
    $('status-mov').textContent = 'Guardando…';
    try {
      await window.storage.set(KEY_MOV, JSON.stringify(movimientos), false);
      $('status-mov').textContent = 'Guardado';
      setTimeout(() => { $('status-mov').textContent = ''; }, 1200);
    } catch (e) { $('status-mov').textContent = 'No se pudo guardar'; }
  }
  async function saveCatGastos() { try { await window.storage.set(KEY_CAT_GASTO, JSON.stringify(catGastos), false); } catch (e) {} }
  async function saveCatIngresos() { try { await window.storage.set(KEY_CAT_INGRESO, JSON.stringify(catIngresos), false); } catch (e) {} }
  async function saveInvoices() { try { await window.storage.set(KEY_INVOICES, JSON.stringify(invoicesGuardados), false); } catch (e) {} }

  // ---- Toggle tipo ----
  let ajusteDir = 'sumar';
  let ajusteSocioSel = ''; // id de quien recibe el ajuste: 'empresa' o el id del socio ('' = sin elegir)
  // Todos los que entran en el reparto: la compañía primero y luego los socios
  function opcionesAjuste() {
    const nombreEmpresa = (cfgFacturaNombre || 'Empresa').trim();
    const clave = nombreEmpresa.toLowerCase();
    return [{ id: 'empresa', nombre: nombreEmpresa + ' (compañía)' },
      ...(cfgSocios || []).filter((x) => x && x.nombre && x.nombre.trim().toLowerCase() !== clave)
        .map((x) => ({ id: x.id, nombre: x.nombre }))];
  }
  function nombreDeAjuste(id) {
    const o = opcionesAjuste().find((x) => x.id === id);
    return o ? o.nombre.replace(/ \(compañía\)$/, '') : '';
  }
  document.querySelectorAll('.gc-type-toggle > .gc-type-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.gc-type-toggle > .gc-type-btn').forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      tipoActual = btn.dataset.type;
      // Mostrar/ocultar campos según el tipo
      const esAjuste = tipoActual === 'ajuste';
      const esIngreso = tipoActual === 'ingreso';
      const hayParaAjuste = cfgSocios && cfgSocios.length > 0;
      // Solo mostrar ajuste si hay socios disponibles
      $('ajuste-direccion-row').style.display = (esAjuste && hayParaAjuste) ? 'block' : 'none';
      if (esAjuste && hayParaAjuste) actualizarSociosAjusteSelect();   // siempre con la lista de socios actual
      // Si no hay socios pero se clickeó ajuste, desactivar y mostrar aviso
      if (esAjuste && !hayParaAjuste) {
        btn.classList.remove('active');
        tipoActual = 'ingreso';
        document.querySelector('.gc-type-btn[data-type="ingreso"]').classList.add('active');
        toast('Agrega al menos un socio en Ajustes → Nombres de socios', 'error');
      }
      $('cat-field-wrap').style.display = esAjuste ? 'none' : 'block';
      $('ingreso-semana-row').style.display = esIngreso ? 'block' : 'none';
      $('gasto-deducible-row').style.display = tipoActual === 'gasto' ? 'block' : 'none';
      if (esIngreso) actualizarSemanaIngreso();
      if ($('mov-cat-nueva-row')) $('mov-cat-nueva-row').style.display = 'none';
      renderCatSelect();
    });
  });

  $('ingreso-semana-prev').addEventListener('click', () => { ingresoSemanaOffset--; actualizarSemanaIngreso(); });
  $('ingreso-semana-next').addEventListener('click', () => { ingresoSemanaOffset++; actualizarSemanaIngreso(); });

  // Toggle dirección del ajuste (sumar/restar)
  document.querySelectorAll('.ajuste-dir-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.ajuste-dir-btn').forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      ajusteDir = btn.dataset.dir;
    });
  });

  // Actualizar dropdown de socios para ajuste
  function actualizarSociosAjusteSelect() {
    const select = $('ajuste-socio-select');
    if (!select) return;
    const ops = opcionesAjuste();
    select.innerHTML = '<option value="">-- Selecciona a quién va --</option>' +
      ops.map((o) => `<option value="${escapeHtml(o.id)}">${escapeHtml(o.nombre)}</option>`).join('');
    if (!ops.some((o) => o.id === ajusteSocioSel)) ajusteSocioSel = '';
    select.value = ajusteSocioSel;
    actualizarInfoAjuste();
  }
  function actualizarInfoAjuste() {
    const infoText = $('ajuste-info-text');
    if (!infoText) return;
    const nombre = ajusteSocioSel ? nombreDeAjuste(ajusteSocioSel) : 'un socio';
    infoText.innerHTML = `Al sumar/restar dinero a <strong>${escapeHtml(nombre)}</strong>, también genera tax si tiene tax activado (igual que con su parte normal, sale de las taxas). Ej: pagó a un trabajador, compró algo, o le debe algo al otro.`;
  }

  $('ajuste-socio-select').addEventListener('change', (e) => {
    ajusteSocioSel = e.target.value || '';
    actualizarInfoAjuste();
  });

  function renderCatSelect() {
    const select = $('m-cat');
    select.innerHTML = '';
    const lista = tipoActual === 'ingreso' ? catIngresos : catGastos;
    // Sin categorías (o todavía cargando): que no quede elegido "+ Nueva categoría…"
    if (!lista.length) { const o = document.createElement('option'); o.value = ''; o.textContent = 'Elige una categoría…'; select.appendChild(o); }
    lista.forEach((c) => {
      const opt = document.createElement('option');
      opt.value = c; opt.textContent = c;
      select.appendChild(opt);
    });
    const optNueva = document.createElement('option');
    optNueva.value = '__nueva__';
    optNueva.textContent = '+ Nueva categoría…';
    select.appendChild(optNueva);
  }

// ---- 01a-sincronizacion.js ----
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
  window.addEventListener('gh-lectura-sin-senal', () => {
    toast('Sin señal: ves lo último que se guardó en este teléfono. Lo que cambies se sube solo cuando vuelva la señal.', 'info', 6000);
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

// ---- 01b-fotos.js ----
  // ====================================================================
  // FOTOS — se guardan como archivos en Supabase Storage (bucket "fotos"),
  // no dentro de la base de datos. En la base solo queda la lista de
  // archivos de cada trabajo/plano. Las fotos viejas (guardadas dentro de la
  // base) se siguen viendo y se mudan solas al abrirlas.
  // Para el resto de la app nada cambia: guardar/cargar siguen usando
  // [{ dataUrl, nombre }].
  // ====================================================================
  const GH_FOTOS = (function () {
    const BUCKET = 'fotos';
    const cache = new Map();              // path -> dataUrl
    let disponible = null;                // null = no se sabe, true/false
    const cli = () => window.GH_SUPABASE;
    const cuenta = () => ((typeof window.GH_GET_CUENTA === 'function' && window.GH_GET_CUENTA()) || 'principal');
    const claveDe = (tipo, id) => `gh-${tipo}-fotos-${id}`;

    function dataUrlABlob(dataUrl) {
      const [cab, datos] = String(dataUrl).split(',');
      const tipo = (cab.match(/data:([^;]+)/) || [])[1] || 'image/jpeg';
      const bin = atob(datos || ''); const arr = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
      return new Blob([arr], { type: tipo });
    }
    function blobADataUrl(blob) {
      return new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = rej; r.readAsDataURL(blob); });
    }
    // Huella corta del contenido: la misma foto no se vuelve a subir
    async function huella(dataUrl) {
      try {
        const buf = new TextEncoder().encode(dataUrl);
        const h = await crypto.subtle.digest('SHA-256', buf);
        return [...new Uint8Array(h)].slice(0, 10).map((b) => b.toString(16).padStart(2, '0')).join('');
      } catch (e) { let h = 0; for (let i = 0; i < dataUrl.length; i += 7) h = (h * 31 + dataUrl.charCodeAt(i)) >>> 0; return h.toString(16) + dataUrl.length.toString(16); }
    }
    const ext = (dataUrl) => (/^data:image\/png/.test(dataUrl) ? 'png' : /^data:image\/webp/.test(dataUrl) ? 'webp' : 'jpg');

    async function leerLista(tipo, id) {
      const r = await window.storage.get(claveDe(tipo, id)).catch(() => null);
      if (!r) return null;
      try { return JSON.parse(r.value); } catch (e) { return null; }
    }
    const esFormatoNuevo = (v) => v && typeof v === 'object' && !Array.isArray(v) && Array.isArray(v.archivos);

    async function subirTodas(tipo, id, fotos) {
      const c = cli(); if (!c || !c.storage) throw new Error('sin-storage');
      const base = `${cuenta()}/${tipo}/${id}/`;
      const archivos = [];
      for (const f of fotos) {
        if (!f || !f.dataUrl) continue;
        const path = base + (await huella(f.dataUrl)) + '.' + ext(f.dataUrl);
        if (!cache.has(path)) {
          const { error } = await c.storage.from(BUCKET).upload(path, dataUrlABlob(f.dataUrl), { upsert: true, contentType: dataUrlABlob(f.dataUrl).type });
          if (error && !/exists|duplicate/i.test(error.message || '')) throw error;
          cache.set(path, f.dataUrl);
        }
        archivos.push({ path, nombre: f.nombre || '' });
      }
      return archivos;
    }

    async function guardar(tipo, id, fotos) {
      fotos = Array.isArray(fotos) ? fotos : [];
      const anterior = await leerLista(tipo, id);
      if (disponible !== false) {
        try {
          const archivos = await subirTodas(tipo, id, fotos);
          await window.storage.set(claveDe(tipo, id), JSON.stringify({ archivos }));
          disponible = true;
          // Borrar del almacén las fotos que se quitaron
          if (esFormatoNuevo(anterior)) {
            const quedan = new Set(archivos.map((a) => a.path));
            const sobran = anterior.archivos.map((a) => a.path).filter((p) => !quedan.has(p));
            if (sobran.length) cli().storage.from(BUCKET).remove(sobran).catch(() => {});
          }
          return;
        } catch (e) {
          if (/bucket not found|sin-storage/i.test(String(e && e.message))) disponible = false;
          else throw e;
        }
      }
      // Sin almacén de fotos: como antes (dentro de la base)
      await window.storage.set(claveDe(tipo, id), JSON.stringify(fotos));
    }

    async function cargar(tipo, id) {
      const v = await leerLista(tipo, id);
      if (!v) return [];
      if (Array.isArray(v)) {
        // Formato viejo: se ve igual y se muda al almacén en segundo plano
        if (v.length && disponible !== false && window.GH_ROL !== 'visor') setTimeout(() => guardar(tipo, id, v).catch(() => {}), 1500);
        return v;
      }
      if (!esFormatoNuevo(v)) return [];
      const c = cli();
      const salida = await Promise.all(v.archivos.map(async (a) => {
        if (cache.has(a.path)) return { dataUrl: cache.get(a.path), nombre: a.nombre };
        try {
          const { data, error } = await c.storage.from(BUCKET).download(a.path);
          if (error || !data) throw error || new Error('sin datos');
          const url = await blobADataUrl(data);
          cache.set(a.path, url);
          return { dataUrl: url, nombre: a.nombre };
        } catch (e) { return null; }
      }));
      const ok = salida.filter(Boolean);
      if (ok.length < v.archivos.length) toast(`No se pudieron bajar ${v.archivos.length - ok.length} foto(s). Revisa la señal.`, 'error', 4000);
      return ok;
    }

    async function borrar(tipo, id) {
      const v = await leerLista(tipo, id);
      if (esFormatoNuevo(v) && v.archivos.length) { try { await cli().storage.from(BUCKET).remove(v.archivos.map((a) => a.path)); } catch (e) {} }
      try { await window.storage.delete(claveDe(tipo, id)); } catch (e) {}
    }
    return { guardar, cargar, borrar };
  })();
  window.GH_FOTOS = GH_FOTOS;

// ---- 02-movimientos.js ----
  // ============================================================
  // LISTA EDITABLE (categorías, clientes, trabajos, colonias)
  // Buscar, contar usos, cambiar el nombre ahí mismo, quitar y ordenar A–Z.
  // ============================================================
  const glNorm = (t) => String(t == null ? '' : t).normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
  function ghListaEditable(o) {
    const cont = typeof o.cont === 'string' ? $(o.cont) : o.cont;
    if (!cont) return;
    cont.style.display = 'block';
    if (!cont.querySelector(':scope > .gl-tools')) {
      cont.innerHTML = `<div class="gl-tools">
          <input type="search" class="gl-q" placeholder="Buscar…" autocomplete="off" aria-label="Buscar en la lista">
          <span class="gl-n"></span>
          <button type="button" class="gl-orden" title="Ordenar la lista de la A a la Z">A–Z</button>
        </div><div class="gl-list"></div>`;
      cont.querySelector('.gl-q').addEventListener('input', () => ghListaEditable(cont.__gl));
      cont.querySelector('.gl-orden').addEventListener('click', async () => {
        const c = cont.__gl; if (!c.ordenar) return;
        await c.ordenar(); ghListaEditable(c); toast('Lista ordenada de la A a la Z ✓', 'success', 1800);
      });
    }
    cont.__gl = o;
    const items = o.items() || [];
    const q = glNorm(cont.querySelector('.gl-q').value);
    const lista = cont.querySelector('.gl-list');
    const filas = items.map((it, i) => ({ it, i, nom: o.nombre ? o.nombre(it) : String(it) }))
      .filter((f) => !q || glNorm(f.nom).includes(q));
    cont.querySelector('.gl-n').textContent = q ? `${filas.length} de ${items.length}` : `${items.length}`;
    cont.querySelector('.gl-orden').style.display = items.length > 1 && o.ordenar ? '' : 'none';
    if (!items.length) { lista.innerHTML = `<div class="gl-vacio">${escapeHtml(o.vacio || 'La lista está vacía. Agrega arriba.')}</div>`; return; }
    if (!filas.length) { lista.innerHTML = `<div class="gl-vacio">Nada coincide con "${escapeHtml(cont.querySelector('.gl-q').value)}".</div>`; return; }
    lista.innerHTML = filas.map((f) => {
      const usos = o.uso ? o.uso(f.nom, f.it) : 0;
      return `<div class="gl-row" data-i="${f.i}">
        <span class="gl-nom">${escapeHtml(f.nom)}</span>
        ${o.uso ? `<span class="gl-uso${usos ? '' : ' cero'}" title="${usos} ${o.usoTxt || 'usos'}">${usos}</span>` : ''}
        ${o.extra ? `<span class="gl-extra">${o.extra(f.it, f.i)}</span>` : ''}
        <button type="button" class="gl-btn gl-ed" title="Cambiar el nombre" aria-label="Cambiar el nombre">✎</button>
        <button type="button" class="gl-btn gl-del" title="Quitar" aria-label="Quitar">✕</button>
      </div>`;
    }).join('');
    lista.querySelectorAll('.gl-row').forEach((row) => {
      const i = Number(row.dataset.i);
      if (o.conectarExtra) o.conectarExtra(row, i);
      row.querySelector('.gl-del').addEventListener('click', async () => {
        const it = o.items()[i]; const nom = o.nombre ? o.nombre(it) : String(it);
        const usos = o.uso ? o.uso(nom, it) : 0;
        if (usos && !await gcConfirm(`"${nom}" se usa en ${usos} ${o.usoTxt || 'registros'}. ¿Quitarla de la lista?\n\nLo que ya está guardado no cambia.`, { okText: 'Quitar', danger: true })) return;
        await o.borrar(i);
        ghListaEditable(o);
        toast(`"${nom}" quitado de la lista`, 'info', 2000);
      });
      row.querySelector('.gl-ed').addEventListener('click', () => {
        const it = o.items()[i]; const viejo = o.nombre ? o.nombre(it) : String(it);
        const span = row.querySelector('.gl-nom');
        row.classList.add('editando');
        span.innerHTML = `<input type="text" class="gl-in" value="${escapeHtml(viejo)}" autocomplete="off"><button type="button" class="gl-btn gl-ok" title="Guardar">✓</button>`;
        const inp = span.querySelector('input'); inp.focus(); inp.select();
        let listo = false;
        const guardar = async () => {
          if (listo) return;
          const nuevo = inp.value.replace(/\s+/g, ' ').trim();
          if (!nuevo || nuevo === viejo) { listo = true; ghListaEditable(o); return; }
          const otro = o.items().findIndex((x, k) => k !== i && glNorm(o.nombre ? o.nombre(x) : x) === glNorm(nuevo));
          if (otro >= 0) { toast(`Ya hay "${nuevo}" en la lista`, 'error'); inp.focus(); return; }
          listo = true;
          await o.renombrar(i, nuevo, viejo);
          ghListaEditable(o);
          toast(`Cambiado a "${nuevo}" ✓`, 'success', 2000);
        };
        span.querySelector('.gl-ok').addEventListener('click', guardar);
        inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); guardar(); } if (e.key === 'Escape') { listo = true; ghListaEditable(o); } });
      });
    });
  }
  const glOrdenarArr = (arr, nombre) => arr.sort((a, b) => (nombre ? nombre(a) : String(a)).localeCompare(nombre ? nombre(b) : String(b), 'es', { sensitivity: 'base' }));
  // ---- Categorías (gestión): editables, con usos ----
  function glUsoCat(tipo, nom) {
    const k = glNorm(nom);
    let n = (movimientos || []).filter((m) => m.tipo === tipo && glNorm(m.cat) === k).length;
    (invoicesGuardados || []).forEach((inv) => { (((tipo === 'gasto' ? inv.gastoItems : inv.ingresoItems)) || []).forEach((g) => { if (glNorm(g.cat) === k) n++; }); });
    return n;
  }
  async function glRenombrarCat(tipo, lista, i, nuevo, viejo) {
    lista[i] = nuevo;
    const k = glNorm(viejo);
    let cambios = 0;
    (movimientos || []).forEach((m) => { if (m.tipo === tipo && glNorm(m.cat) === k) { m.cat = nuevo; cambios++; } });
    let cambiosInv = 0;
    (invoicesGuardados || []).forEach((inv) => { (((tipo === 'gasto' ? inv.gastoItems : inv.ingresoItems)) || []).forEach((g) => { if (glNorm(g.cat) === k) { g.cat = nuevo; cambiosInv++; } }); });
    if (tipo === 'gasto') await saveCatGastos(); else await saveCatIngresos();
    if (cambios) await saveMov();
    if (cambiosInv) { try { await saveInvoices(); } catch (e) {} }
    renderCatSelect(); try { renderMovimientos(); } catch (e) {}
  }
  function renderCategorias() {
    ghListaEditable({
      cont: 'lista-gastos', items: () => catGastos, uso: (n) => glUsoCat('gasto', n), usoTxt: 'gastos registrados',
      vacio: 'Sin categorías de gasto. Agrega la primera arriba.',
      renombrar: (i, nuevo, viejo) => glRenombrarCat('gasto', catGastos, i, nuevo, viejo),
      borrar: async (i) => { catGastos.splice(i, 1); renderCatSelect(); await saveCatGastos(); },
      ordenar: async () => { glOrdenarArr(catGastos); renderCatSelect(); await saveCatGastos(); }
    });
    ghListaEditable({
      cont: 'lista-ingresos', items: () => catIngresos, uso: (n) => glUsoCat('ingreso', n), usoTxt: 'ingresos registrados',
      vacio: 'Sin categorías de ingreso. Agrega la primera arriba.',
      renombrar: (i, nuevo, viejo) => glRenombrarCat('ingreso', catIngresos, i, nuevo, viejo),
      borrar: async (i) => { catIngresos.splice(i, 1); renderCatSelect(); await saveCatIngresos(); },
      ordenar: async () => { glOrdenarArr(catIngresos); renderCatSelect(); await saveCatIngresos(); }
    });
  }

  $('btn-agregar-gasto').addEventListener('click', () => {
    const val = $('cat-gasto-nueva').value.trim();
    if (!val || catGastos.includes(val)) { $('cat-gasto-nueva').value = ''; return; }
    catGastos.push(val); $('cat-gasto-nueva').value = '';
    renderCategorias(); renderCatSelect(); saveCatGastos();
  });
  $('cat-gasto-nueva').addEventListener('keydown', (e) => { if (e.key === 'Enter') $('btn-agregar-gasto').click(); });

  $('btn-agregar-ingreso').addEventListener('click', () => {
    const val = $('cat-ingreso-nueva').value.trim();
    if (!val || catIngresos.includes(val)) { $('cat-ingreso-nueva').value = ''; return; }
    catIngresos.push(val); $('cat-ingreso-nueva').value = '';
    renderCategorias(); renderCatSelect(); saveCatIngresos();
  });
  $('cat-ingreso-nueva').addEventListener('keydown', (e) => { if (e.key === 'Enter') $('btn-agregar-ingreso').click(); });

  // ---- Categoría rápida desde Movimientos (sin salir de la pantalla) ----
  $('m-cat').addEventListener('change', () => {
    if ($('m-cat').value !== '__nueva__') return;
    $('mov-cat-nueva-row').style.display = 'block';
    $('mov-cat-nueva-input').value = '';
    $('mov-cat-nueva-input').focus();
  });
  function movCancelarCatNueva() {
    $('mov-cat-nueva-row').style.display = 'none';
    renderCatSelect(); // vuelve a la primera categoría en vez de dejar "+ Nueva categoría…" seleccionado
  }
  $('mov-cat-nueva-cancelar').addEventListener('click', movCancelarCatNueva);
  async function movGuardarCatNueva() {
    const val = $('mov-cat-nueva-input').value.trim();
    if (!val) { movCancelarCatNueva(); return; }
    const lista = tipoActual === 'ingreso' ? catIngresos : catGastos;
    if (!lista.includes(val)) {
      lista.push(val);
      if (tipoActual === 'ingreso') await saveCatIngresos(); else await saveCatGastos();
      if (typeof renderCategorias === 'function') renderCategorias();
    }
    $('mov-cat-nueva-row').style.display = 'none';
    renderCatSelect();
    $('m-cat').value = val; // deja seleccionada la que se acaba de crear
    toast('Categoría agregada ✓', 'success', 1800);
  }
  $('mov-cat-nueva-guardar').addEventListener('click', movGuardarCatNueva);
  $('mov-cat-nueva-input').addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); movGuardarCatNueva(); } });

  // ---- Sugerencias de descripción: recuerda lo que ya se ha escrito antes ----
  function refrescarSugerenciasDesc() {
    const dl = $('dl-desc-sugeridas');
    if (!dl) return;
    const vistas = new Set();
    const unicas = [];
    [...movimientos].sort((a, b) => (b.fecha || '').localeCompare(a.fecha || '')).forEach((m) => {
      const d = (m.desc || '').trim();
      if (d && !vistas.has(d.toLowerCase())) { vistas.add(d.toLowerCase()); unicas.push(d); }
    });
    dl.innerHTML = unicas.slice(0, 40).map((d) => `<option value="${escapeHtml(d)}">`).join('');
  }

  // ---- Guardar movimiento ----
  function limpiarFormularioMov(avisar) {
    if (tipoActual === 'ingreso') {
      actualizarSemanaIngreso(); // mantiene la semana seleccionada, no la resetea a hoy
    } else {
      $('m-fecha').value = today();
    }
    $('m-monto').value = '';
    $('m-desc').value = '';
    $('m-deducible').checked = false;
    // Reset ajuste-related fields
    ajusteDir = 'sumar';
    ajusteSocioSel = '';
    document.querySelectorAll('.ajuste-dir-btn').forEach((b) => b.classList.toggle('active', b.dataset.dir === 'sumar'));
    actualizarSociosAjusteSelect();
    // El tipo (Ingreso/Gasto/Ajuste) se queda donde el usuario lo dejó — no se resetea
    renderCatSelect();
    refrescarSugerenciasDesc();
    if (avisar) {
      $('status-mov').textContent = 'Formulario limpiado';
      setTimeout(() => { $('status-mov').textContent = ''; }, 1200);
    }
  }
  $('btn-limpiar-mov').addEventListener('click', () => limpiarFormularioMov(true));

  $('btn-guardar-mov').addEventListener('click', () => {
    const fecha = $('m-fecha').value || today();
    const esAjuste = tipoActual === 'ajuste';
    const cat = esAjuste ? (ajusteDir === 'sumar' ? 'Ajuste +' : 'Ajuste −') : $('m-cat').value;
    const monto = parseFloat($('m-monto').value.replace(',', '.'));
    const desc = $('m-desc').value.trim();
    const deducible = tipoActual === 'gasto' && $('m-deducible').checked;

    if (!esAjuste && !cat) { $('status-mov').textContent = 'Agrega al menos una categoría primero'; return; }
    if (cat === '__nueva__') { $('status-mov').textContent = 'Termina de agregar la categoría nueva, o elige una de la lista'; $('mov-cat-nueva-row').style.display = 'block'; $('mov-cat-nueva-input').focus(); return; }
    if (esAjuste && !ajusteSocioSel) { $('status-mov').textContent = 'Elige a quién va el ajuste'; toast('Elige a quién va el ajuste', 'error'); return; }
    if (!monto || monto <= 0) {
      $('status-mov').textContent = 'Captura un monto válido';
      setTimeout(() => { $('status-mov').textContent = ''; }, 1800);
      return;
    }

    if (movEditandoId != null) {
      // Actualizar el movimiento existente
      const idx = movimientos.findIndex((x) => x.id === movEditandoId);
      if (idx >= 0) {
        const orig = movimientos[idx];
        const fechaCambio = !esAjuste && tipoActual === 'gasto' && orig.tipo === 'gasto' && orig.fecha !== fecha;
        movimientos[idx] = { id: movEditandoId, fecha, tipo: tipoActual, cat, monto, desc, deducible };
        // Preservar datos de ajuste para movimientos tipo ajuste
        if (esAjuste) {
          movimientos[idx].ajusteDir = ajusteDir;
          movimientos[idx].ajusteSocioId = ajusteSocioSel;
          movimientos[idx].ajusteSocioNombre = nombreDeAjuste(ajusteSocioSel);
        } else if (tipoActual !== 'ajuste') {
          // Si no es ajuste, limpiar datos de ajuste
          delete movimientos[idx].ajusteDir;
          delete movimientos[idx].ajusteSocioIdx;
          delete movimientos[idx].ajusteSocioNombre;
          delete movimientos[idx].ajusteSocioId;
        }

        // Si es un gasto y cambió de fecha, mover también los demás gastos activos
        // de esa misma semana (invoice) a la nueva fecha — sin tocar invoices ya guardados.
        var otrosMovidos = 0;
        if (fechaCambio) {
          const semanaOriginal = weekInfo(orig.fecha).key;
          movimientos.forEach((m) => {
            if (m.id === movEditandoId || m.tipo !== 'gasto') return;
            if (weekInfo(m.fecha).key === semanaOriginal) { m.fecha = fecha; otrosMovidos++; }
          });
        }
      }
      movEditandoId = null;
      $('btn-guardar-mov').textContent = 'Guardar movimiento';
      limpiarFormularioMov(false);
      saveMov();
      renderMovimientos();
      renderReparto();
      toast(otrosMovidos > 0
        ? `Movimiento actualizado ✓ — fecha cambiada también en ${otrosMovidos} gasto(s) más de esa semana`
        : 'Movimiento actualizado ✓', 'success', otrosMovidos > 0 ? 3800 : undefined);
      return;
    }

    const nuevo = { id: Date.now(), fecha, tipo: tipoActual, cat, monto, desc, deducible };
    if (esAjuste) {
      nuevo.ajusteDir = ajusteDir;
      nuevo.ajusteSocioId = ajusteSocioSel;
      nuevo.ajusteSocioNombre = nombreDeAjuste(ajusteSocioSel);
    }
    movimientos.push(nuevo);
    limpiarFormularioMov(false);
    saveMov();
    renderMovimientos();
    renderReparto();
    const nombreSocio = nombreDeAjuste(ajusteSocioSel) || 'socio';
    toast(esAjuste ? `Ajuste a ${nombreSocio} guardado ✓` : 'Movimiento guardado ✓', 'success');
  });

  // ---- Hoja de movimientos agrupada por semana ----


  // ---- Resumen del día (tarjeta de arriba en Registro) ----
  async function ghActualizarHero() {
    const h = new Date().getHours();
    const saludo = h < 12 ? 'Buen día' : h < 19 ? 'Buenas tardes' : 'Buenas noches';
    const el = $('gh-hero-saludo');
    if (!el) return;
    el.textContent = saludo;
    $('gh-hero-fecha').textContent = new Date().toLocaleDateString('es-MX', { weekday: 'long', day: 'numeric', month: 'long' });

    // Por cobrar: facturas guardadas que no están marcadas como pagadas.
    // Se leen directo del almacenamiento porque Facturas puede no haberse
    // abierto todavía en esta sesión (y entonces invDocs estaría vacío).
    let docs = invDocs;
    if (!docs || !docs.length) {
      const r = await window.storage.get(INV_KEY).catch(() => null);
      try { docs = JSON.parse(r.value); } catch (e) { docs = []; }
    }
    // Semana pasada (lunes a domingo): es la que se cobra y se paga esta semana
    const hoyD = new Date(today() + 'T00:00:00');
    const lunesPas = new Date(hoyD); lunesPas.setDate(hoyD.getDate() - ((hoyD.getDay() + 6) % 7) - 7);
    const domPas = new Date(lunesPas); domPas.setDate(lunesPas.getDate() + 6);
    const iniPas = ghFechaLocal(lunesPas), finPas = ghFechaLocal(domPas);
    const enSemPas = (iso) => !!iso && iso >= iniPas && iso <= finPas;
    const mesesC = ['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic'];
    const rangoTxt = `${lunesPas.getDate()} ${mesesC[lunesPas.getMonth()]} – ${domPas.getDate()} ${mesesC[domPas.getMonth()]}`;

    // Por cobrar: facturas pendientes del trabajo de la semana pasada (por la
    // fecha de sus líneas; si no traen fecha, por la fecha de la factura).
    const deSemPasada = (d) => {
      const dias = (d.items || []).map((it) => it.dia).filter((x) => /^\d{4}-\d{2}-\d{2}$/.test(x || ''));
      return dias.length ? dias.some(enSemPas) : enSemPas(d.fecha);
    };
    const pend = (docs || []).filter((d) => !d.pagada && deSemPasada(d));
    const totalPend = pend.reduce((sum, d) => sum + (Number(d.total) || 0), 0);
    $('gh-val-cobrar').textContent = fmt(totalPend);
    $('gh-sub-cobrar').textContent = (pend.length === 1 ? '1 factura' : `${pend.length} facturas`) + ' · ' + rangoTxt;
    $('gh-tile-cobrar').classList.toggle('alerta', pend.length > 0);

    // Nómina de la semana pasada (lo que se paga esta semana)
    let nom = [];
    try { const rn = await window.storage.get('gh-nomina'); nom = JSON.parse(rn.value) || []; } catch (e) { nom = []; }
    let totalNom = 0; const trabNom = new Set();
    (nom || []).forEach((n) => {
      const dias = Array.isArray(n.dias) ? n.dias.slice().sort() : [];
      const ref = dias[0] || (n.creadoEn || '').slice(0, 10);
      if (!enSemPas(ref)) return;
      totalNom += Number(n.monto) || 0;
      if (n.trabajador) trabNom.add(n.trabajador);
    });
    $('gh-val-nomina').textContent = fmt(totalNom);
    $('gh-sub-nomina').textContent = (trabNom.size === 1 ? '1 trabajador' : `${trabNom.size} trabajadores`) + ' · ' + rangoTxt;

    // Trabajos agendados para hoy
    let lista = citas;
    if (!lista || !lista.length) {
      const r2 = await window.storage.get(CITAS_KEY).catch(() => null);
      try { lista = JSON.parse(r2.value); } catch (e) { lista = []; }
    }
    const hoyISO = today();
    const deHoy = (lista || []).filter((c) => c.fecha === hoyISO);
    $('gh-val-hoy').textContent = String(deHoy.length);
    $('gh-sub-hoy').textContent = deHoy.length === 1 ? 'trabajo agendado' : 'trabajos agendados';

    // Neto de la semana en curso
    const semanas = calcularSemanas();
    const keyHoy = weekInfo(hoyISO).key;
    const sem = semanas.find((x) => x.key === keyHoy);
    $('gh-val-semana').textContent = fmt(sem ? sem.neto : 0);
  }

  (function () {
    const t1 = $('gh-tile-cobrar'), t2 = $('gh-tile-hoy'), t3 = $('gh-tile-semana'), rf = $('gh-hero-refresh');
    if (t1) t1.addEventListener('click', () => {
      document.querySelector('.gc-tab[data-tab="facturas"]').click();
      document.querySelector('.inv-subtab[data-sub="guardadas"]').click();
    });
    // (Calendario quitado: la ficha "Hoy" ya no se muestra)
    const t4 = $('gh-tile-nomina');
    if (t4) t4.addEventListener('click', () => document.querySelector('.gc-tab[data-tab="nomina"]').click());
    if (t3) t3.addEventListener('click', () => document.querySelector('.mov-subtab[data-msub="invoices"]').click());
    if (rf) rf.addEventListener('click', () => { ghActualizarHero(); toast('Resumen actualizado ✓', 'info', 1500); });
  })();

  function actualizarStats() {
    const hoy = today();
    const semAct = weekInfo(hoy).key;
    const fechaSemPasada = new Date(hoy + 'T00:00:00'); fechaSemPasada.setDate(fechaSemPasada.getDate() - 7);
    const semAnt = weekInfo(ghFechaLocal(fechaSemPasada)).key;

    const movSem = movimientos.filter(m => weekInfo(m.fecha || hoy).key === semAct);
    const movAnt = movimientos.filter(m => weekInfo(m.fecha || hoy).key === semAnt);
    const ing = movSem.filter(m => m.tipo === 'ingreso').reduce((s,m) => s + (Number(m.monto)||0), 0);
    const gas = movSem.filter(m => m.tipo === 'gasto').reduce((s,m) => s + (Number(m.monto)||0), 0);
    const ingAnt = movAnt.filter(m => m.tipo === 'ingreso').reduce((s,m) => s + (Number(m.monto)||0), 0);
    const gasAnt = movAnt.filter(m => m.tipo === 'gasto').reduce((s,m) => s + (Number(m.monto)||0), 0);
    // Igual que el resumen de arriba: el neto ya descuenta las taxas (antes salían dos "Neto semana" distintos)
    const net = ing - gas - ing * TASA_TAXAS;
    if ($('stat-ing')) $('stat-ing').textContent = fmt(ing);
    if ($('stat-gas')) $('stat-gas').textContent = fmt(gas);
    if ($('stat-net')) { $('stat-net').textContent = fmt(net); $('stat-net').style.color = net >= 0 ? 'var(--teal)' : 'var(--ember)'; }
    if ($('stat-inv')) $('stat-inv').textContent = invoicesGuardados.length;
    renderStatDelta('stat-ing-delta', ing, ingAnt, true);
    renderStatDelta('stat-gas-delta', gas, gasAnt, false);
    // Totales acumulados de todos los invoices guardados
    let totTaxas = 0, totCra = 0, totTaxGuzman = 0;
    invoicesGuardados.forEach((inv) => {
      totTaxas += (inv.taxas || 0);
      totCra += (inv.pagoCra || 0);
      totTaxGuzman += (inv.taxGuzman || 0);
    });
    if ($('stat-taxas-total')) $('stat-taxas-total').textContent = fmt(totTaxas);
    if ($('stat-cra-total')) $('stat-cra-total').textContent = fmt(totCra);
    if ($('stat-tax-guzman')) $('stat-tax-guzman').textContent = fmt(totTaxGuzman);
  }

  // Compara esta semana contra la pasada. subirEsBueno=true para ingresos
  // (subir = verde), false para gastos (subir = naranja/alerta).
  function renderStatDelta(elId, actual, anterior, subirEsBueno) {
    const el = $(elId);
    if (!el) return;
    if (anterior <= 0) { el.textContent = ''; return; } // sin semana pasada que comparar
    const cambio = ((actual - anterior) / anterior) * 100;
    if (Math.abs(cambio) < 1) { el.textContent = 'igual que la semana pasada'; el.style.color = 'var(--muted)'; return; }
    const subio = cambio > 0;
    const esBueno = subio === subirEsBueno;
    el.style.color = esBueno ? 'var(--teal-dk)' : 'var(--ember)';
    el.textContent = (subio ? '↑ ' : '↓ ') + Math.abs(cambio).toFixed(0) + '% vs. semana pasada';
  }

  let movMostrarTodasSemanas = false; // por defecto solo semanas recientes, para no saturar el libro
  const MOV_SEMANAS_LIMITE = 8;

  // ---- Modo selección en Movimientos ----
  const movSel = ghCrearSeleccion({
    host: 'mov-sel-host',
    contenedor: 'tbody-mov',
    nombre: 'movimiento', plural: 'movimientos',
    acciones: [
      { id: 'deducible', texto: '✓ Deducible', fn: async (ids) => {
          let n = 0;
          ids.forEach((id) => {
            const m = movimientos.find((x) => String(x.id) === id);
            if (m && m.tipo === 'gasto') { m.deducible = true; n++; }
          });
          if (!n) { toast('Marca gastos para poder hacerlos deducibles', 'info'); return; }
          await saveMov(); renderMovimientos();
          toast(`${n} gasto(s) marcado(s) como deducible(s) ✓`);
        } },
      { id: 'csv', texto: '⬇ Exportar', fn: (ids) => {
          const sel = ids.map((id) => movimientos.find((x) => String(x.id) === id)).filter(Boolean);
          if (!sel.length) return;
          const filas = [['Fecha','Tipo','Categoría','Descripción','Monto','Deducible']];
          sel.forEach((m) => filas.push([
            m.fecha || '', m.tipo === 'ingreso' ? 'Ingreso' : m.tipo === 'ajuste' ? 'Ajuste' : 'Gasto',
            m.cat || '', m.desc || '', String(Number(m.monto) || 0),
            m.tipo === 'gasto' ? (m.deducible ? 'Sí' : 'No') : ''
          ]));
          const csv = filas.map((f) => f.map((c) => `"${String(c).replace(/"/g,'""')}"`).join(',')).join('\n');
          const a = document.createElement('a');
          a.href = URL.createObjectURL(new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8;' }));
          a.download = `movimientos-${today()}.csv`; a.click(); URL.revokeObjectURL(a.href);
          toast(`${sel.length} movimiento(s) exportado(s) ✓`);
        } },
      { id: 'borrar', texto: '🗑 Borrar', peligro: true, fn: async (ids) => {
          if (!await gcConfirm(`¿Eliminar ${ids.length} movimiento(s)? Esta acción no se puede deshacer.`, { okText: 'Eliminar', danger: true })) return;
          movimientos = movimientos.filter((m) => !ids.includes(String(m.id)));
          await saveMov();
          movSel.salir();
          renderMovimientos(); renderReparto();
          toast(`${ids.length} movimiento(s) eliminado(s)`, 'info');
        } },
    ],
  });

  function renderMovimientos() {
    const tbody = $('tbody-mov');
    tbody.innerHTML = '';
    const sorted = [...movimientos].sort((a, b) => (a.fecha || '').localeCompare(b.fecha || '') || String(a.id).localeCompare(String(b.id)));
    $('empty-mov').style.display = sorted.length === 0 ? 'block' : 'none';

    const grupos = new Map();
    sorted.forEach((m) => {
      const { key, label } = weekInfo(m.fecha || today());
      if (!grupos.has(key)) grupos.set(key, { label, items: [] });
      grupos.get(key).items.push(m);
    });

    let keys = [...grupos.keys()].sort();
    const totalSemanas = keys.length;
    let semanasOcultas = 0;
    if (!movMostrarTodasSemanas && keys.length > MOV_SEMANAS_LIMITE) {
      semanasOcultas = keys.length - MOV_SEMANAS_LIMITE;
      keys = keys.slice(semanasOcultas); // conserva las más recientes (están ordenadas ascendente)
    }
    const filaVerMas = $('mov-ver-mas-row');
    const btnVerMas = $('mov-ver-mas-btn');
    if (filaVerMas && btnVerMas) {
      if (semanasOcultas > 0) {
        filaVerMas.style.display = 'block';
        btnVerMas.textContent = `Ver ${semanasOcultas} semana${semanasOcultas === 1 ? '' : 's'} anterior${semanasOcultas === 1 ? '' : 'es'} (${totalSemanas} en total)`;
      } else if (movMostrarTodasSemanas && totalSemanas > MOV_SEMANAS_LIMITE) {
        filaVerMas.style.display = 'block';
        btnVerMas.textContent = 'Mostrar solo las semanas recientes';
      } else {
        filaVerMas.style.display = 'none';
      }
    }

    keys.forEach((key) => {
      const g = grupos.get(key);
      const trWeek = document.createElement('tr');
      trWeek.className = 'gc-week-row';
      trWeek.innerHTML = `<td colspan="6">${escapeHtml(g.label)}</td>`;
      tbody.appendChild(trWeek);

      g.items.forEach((m) => {
        const tr = document.createElement('tr');
        tr.className = 'sel-item';
        tr.dataset.selid = String(m.id);
        const tipoLabel = m.tipo === 'ingreso' ? 'Ingreso' : m.tipo === 'ajuste' ? (m.ajusteDir === 'restar' ? '± Ajuste −' : '± Ajuste +') : 'Gasto';
        const tipoColor = m.tipo === 'ingreso' ? 'var(--income)' : m.tipo === 'ajuste' ? '#4A6FA8' : 'var(--expense)';
        tr.innerHTML = `
          <td>${m.fecha || ''}</td>
          <td><span class="gc-tipo-tag ${m.tipo}">${tipoLabel}</span></td>
          <td>${escapeHtml(m.cat || '')}${m.tipo === 'gasto' && m.deducible ? ' <span title="Deducible de impuestos" style="display:inline-block;font-size:9px;font-weight:800;color:var(--gold);background:var(--gold-bg);padding:2px 7px;border-radius:8px;letter-spacing:.3px;vertical-align:middle;">DEDUCIBLE</span>' : ''}</td>
          <td>${escapeHtml(m.desc || '')}${m.tipo === 'ajuste' ? (() => { const nom = nombreDeAjuste(idSocioDeAjuste(m)) || m.ajusteSocioNombre || ''; return nom ? ' <span style="font-size:10px;font-weight:700;color:#4A6FA8;">→ ' + escapeHtml(nom) + '</span>' : ''; })() : ''}</td>
          <td class="gc-num" style="color:${tipoColor}">${fmt(m.monto)}</td>
          <td style="white-space:nowrap;">
            <button class="gc-action-btn gc-dup-mov" data-id="${m.id}" title="Repetir este movimiento" style="padding:3px 9px;font-size:11px;">⧉</button>
            <button class="gc-action-btn gc-edit-mov" data-id="${m.id}" style="padding:3px 9px;font-size:11px;margin-left:2px;">✎</button>
            <button class="gc-del" data-id="${m.id}" style="margin-left:2px;">✕</button>
          </td>
        `;
        tbody.appendChild(tr);
      });
    });

    if (typeof movSel !== 'undefined' && movSel) movSel.refrescarTrasRedibujar();

    tbody.querySelectorAll('.gc-dup-mov').forEach((btn) => {
      btn.addEventListener('click', () => {
        const m = movimientos.find((x) => String(x.id) === btn.dataset.id);
        if (!m) return;
        duplicarMovimiento(m);
      });
    });

    tbody.querySelectorAll('.gc-edit-mov').forEach((btn) => {
      btn.addEventListener('click', () => {
        const m = movimientos.find((x) => String(x.id) === btn.dataset.id);
        if (!m) return;
        editarMovimiento(m);
      });
    });

    tbody.querySelectorAll('.gc-del').forEach((btn) => {
      btn.addEventListener('click', async () => {
        if (!await gcConfirm('¿Eliminar este movimiento? Esta acción no se puede deshacer.', { okText: 'Eliminar', danger: true })) return;
        movimientos = movimientos.filter((m) => String(m.id) !== btn.dataset.id);
        saveMov();
        renderMovimientos();
        renderReparto();
        toast('Movimiento eliminado', 'info');
      });
    });

    renderGraficaSemanal();
    try { renderGastosPorCat(); } catch (e) {}
  }
  // ---- Gastos por categoría en Principal: semana / mes / año, con comparación ----
  let gpModo = 'mes', gpOff = 0;
  try { const g = localStorage.getItem('gh-gp-modo'); if (g === 'sem' || g === 'mes' || g === 'anio') gpModo = g; } catch (e) {}
  function gpPeriodo(off) {
    const hoy = new Date(); hoy.setHours(12, 0, 0, 0);
    if (gpModo === 'sem') {
      const d = new Date(hoy); d.setDate(d.getDate() - 7 * off);
      const info = weekInfo(ghFechaLocal(d));
      return { id: info.key, label: info.label, match: (f) => weekInfo(f).key === info.key };
    }
    if (gpModo === 'mes') {
      const d = new Date(hoy.getFullYear(), hoy.getMonth() - off, 1);
      const k = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
      const nom = d.toLocaleDateString('es-MX', { month: 'long', year: 'numeric' });
      return { id: k, label: nom.charAt(0).toUpperCase() + nom.slice(1), match: (f) => String(f).slice(0, 7) === k };
    }
    const y = String(hoy.getFullYear() - off);
    return { id: y, label: 'Año ' + y, match: (f) => String(f).slice(0, 4) === y };
  }
  function gpGastos(per) {
    const por = new Map(); let total = 0;
    movimientos.forEach((m) => {
      if (m.tipo !== 'gasto' || !per.match(m.fecha || '')) return;
      const monto = Number(m.monto) || 0; if (monto <= 0) return;
      const c = (m.cat || 'Sin categoría').trim() || 'Sin categoría';
      por.set(c, (por.get(c) || 0) + monto); total += monto;
    });
    return { total, filas: [...por.entries()].map(([cat, t]) => ({ cat, total: t })).sort((a, b) => b.total - a.total) };
  }
  function renderGastosPorCat() {
    const card = $('gp-cat-card'); if (!card) return;
    const hayGastos = movimientos.some((m) => m.tipo === 'gasto');
    card.style.display = hayGastos ? 'block' : 'none';
    if (!hayGastos) return;
    card.querySelectorAll('#gp-seg button').forEach((b) => b.classList.toggle('on', b.dataset.gp === gpModo));
    const per = gpPeriodo(gpOff), ant = gpPeriodo(gpOff + 1);
    const { total, filas } = gpGastos(per), antTot = gpGastos(ant).total;
    $('gp-rango').textContent = per.label;
    const nav = card.querySelectorAll('[data-gpnav]'); if (nav[1]) nav[1].disabled = gpOff <= 0;
    let delta = '';
    if (antTot > 0 && total > 0) {
      const pct = Math.round((total - antTot) / antTot * 100);
      delta = `<span class="gp-delta ${pct > 0 ? 'sube' : 'baja'}">${pct > 0 ? '▲' : '▼'} ${Math.abs(pct)}% vs ${gpModo === 'sem' ? 'semana' : gpModo === 'mes' ? 'mes' : 'año'} anterior</span>`;
    } else if (antTot > 0 && total === 0) delta = `<span class="gp-delta baja">Antes: ${fmt(antTot)}</span>`;
    $('gp-total').innerHTML = `<b>${fmt(total)}</b> gastados ${delta}`;
    if (!filas.length) {
      $('gp-donut').innerHTML = '';
      $('gp-leyenda').innerHTML = '<div style="color:var(--muted);font-size:13px;padding:6px 0;">Sin gastos en este período.</div>';
      return;
    }
    const COL = ['#0E8C6E', '#D0621E', '#3D5BD9', '#946510', '#7A4FB5', '#2F9BC8', '#8A8F9C'];
    const top = filas.slice(0, 6), resto = filas.slice(6).reduce((t, r) => t + r.total, 0);
    const trozos = resto > 0 ? [...top, { cat: 'Otros', total: resto }] : top;
    const R = 62, C = 2 * Math.PI * R; let acu = 0;
    const arcos = trozos.map((t, i) => {
      const fr = t.total / total, dash = fr * C, off = -acu * C; acu += fr;
      return `<circle cx="80" cy="80" r="${R}" fill="none" stroke="${COL[i % COL.length]}" stroke-width="24" stroke-dasharray="${Math.max(0, dash - (trozos.length > 1 ? 2 : 0)).toFixed(1)} ${(C - dash + (trozos.length > 1 ? 2 : 0)).toFixed(1)}" stroke-dashoffset="${off.toFixed(1)}" transform="rotate(-90 80 80)"/>`;
    }).join('');
    $('gp-donut').innerHTML = `<svg viewBox="0 0 160 160" width="160" height="160" role="img" aria-label="Gastos por categoría">${arcos}
      <text x="80" y="76" text-anchor="middle" font-size="10" fill="var(--muted)" font-weight="700">TOTAL</text>
      <text x="80" y="94" text-anchor="middle" font-size="14" fill="var(--ink)" font-weight="800">${escapeHtml(fmt(total).replace('.00', ''))}</text></svg>`;
    $('gp-leyenda').innerHTML = trozos.map((t, i) => `<div class="gc-donut-leg-item">
      <span class="sw" style="background:${COL[i % COL.length]};"></span><span style="min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${escapeHtml(t.cat)}</span>
      <span class="val">${Math.round(t.total / total * 100)}% · ${fmt(t.total)}</span></div>`).join('');
  }
  document.querySelectorAll('#gp-seg button').forEach((b) => b.addEventListener('click', () => {
    gpModo = b.dataset.gp; gpOff = 0;
    try { localStorage.setItem('gh-gp-modo', gpModo); } catch (e) {}
    renderGastosPorCat();
  }));
  document.querySelectorAll('[data-gpnav]').forEach((b) => b.addEventListener('click', () => {
    gpOff = Math.max(0, gpOff - Number(b.dataset.gpnav)); renderGastosPorCat();
  }));
  if ($('mov-ver-mas-btn')) {
    $('mov-ver-mas-btn').addEventListener('click', () => {
      movMostrarTodasSemanas = !movMostrarTodasSemanas;
      renderMovimientos();
    });
  }

  // ---- Resumen con gráfica (semanas o meses) ----
  // Junta lo que hay en la hoja activa con los invoices ya guardados, para
  // que el historial no desaparezca al guardar una semana.
  // (var a propósito: renderGraficaSemanal puede llamarse antes de que se lea esta línea)
  var RES_MESES_LARGO = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
  var RES_MESES = ['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic'];
  var resModo = (function () { try { return localStorage.getItem('gh-res-modo') === 'mes' ? 'mes' : 'sem'; } catch (e) { return 'sem'; } })();
  var resSel = null;   // clave del grupo tocado
  var resPag = 0, resAnio = 0, resNavInfo = { prev: false, next: false, max: 0 };
  function resSemanasTodas() {
    const porSemana = new Map();
    const sumar = (key, label, x) => {
      if (!key) return;
      const a = porSemana.get(key) || { key, label: label || '', ingresos: 0, gastos: 0, neto: 0 };
      a.ingresos += Number(x.ingresos) || 0;
      a.gastos += Number(x.gastosTotales) || 0;
      a.neto += Number(x.neto) || 0;
      if (!a.label && label) a.label = label;
      porSemana.set(key, a);
    };
    (invoicesGuardados || []).forEach((inv) => {
      let key = inv.key;
      if (!key) {
        const f = (inv.gastoItems && inv.gastoItems[0] && inv.gastoItems[0].fecha) || (inv.ingresoItems && inv.ingresoItems[0] && inv.ingresoItems[0].fecha) || (inv.guardadoEn ? String(inv.guardadoEn).slice(0, 10) : '');
        if (f) { try { key = weekInfo(f).key; } catch (e) {} }
      }
      sumar(key, inv.label, inv);
    });
    try { calcularSemanas().forEach((sm) => sumar(sm.key, sm.label, sm)); } catch (e) {}
    return [...porSemana.values()].sort((x, y) => x.key.localeCompare(y.key));
  }
  function resDatos() {
    const semanas = resSemanasTodas();
    const hoy = new Date();
    if (resModo === 'sem') {
      // páginas de 8 semanas; resPag = 0 son las más recientes
      const porPag = 8;
      resNavInfo.max = Math.max(0, Math.ceil(semanas.length / porPag) - 1);
      if (resPag > resNavInfo.max) resPag = resNavInfo.max;
      if (resPag < 0) resPag = 0;
      const fin = semanas.length - resPag * porPag;
      const trozo = semanas.slice(Math.max(0, fin - porPag), Math.max(0, fin));
      resNavInfo.prev = resPag < resNavInfo.max;
      resNavInfo.next = resPag > 0;
      return trozo.map((x) => {
        const [yy, mm, dd] = x.key.split('-').map(Number);
        return { ...x, corto: `${dd} ${RES_MESES[(mm || 1) - 1]}`, titulo: (typeof invRangoCorto === 'function' && invRangoCorto(x.label)) || x.label || x.key };
      });
    }
    // Meses: los 12 meses del año elegido (enero a diciembre)
    const anios = semanas.map((x) => Number(x.key.slice(0, 4))).filter(Boolean);
    const anioHoy = hoy.getFullYear();
    const minA = anios.length ? Math.min(anioHoy, ...anios) : anioHoy;
    const maxA = anios.length ? Math.max(anioHoy, ...anios) : anioHoy;
    if (!resAnio) resAnio = anioHoy;
    if (resAnio < minA) resAnio = minA;
    if (resAnio > maxA) resAnio = maxA;
    resNavInfo.prev = resAnio > minA;
    resNavInfo.next = resAnio < maxA;
    const meses = RES_MESES.map((nom, i) => ({ key: `${resAnio}-${String(i + 1).padStart(2, '0')}`, ingresos: 0, gastos: 0, neto: 0, n: 0, nom }));
    semanas.forEach((x) => {
      if (Number(x.key.slice(0, 4)) !== resAnio) return;
      const a = meses[Number(x.key.slice(5, 7)) - 1];
      if (!a) return;
      a.ingresos += x.ingresos; a.gastos += x.gastos; a.neto += x.neto; a.n += 1;
    });
    const hoyK = `${anioHoy}-${String(hoy.getMonth() + 1).padStart(2, '0')}`;
    return meses.map((x) => ({ ...x, futuro: x.key > hoyK && !x.n, corto: x.nom.charAt(0).toUpperCase() + x.nom.slice(1, 3),
      titulo: `${RES_MESES_LARGO[Number(x.key.slice(5, 7)) - 1]} ${resAnio}` + (x.n ? ` · ${x.n} semana${x.n === 1 ? '' : 's'}` : ' · sin movimientos') }));
  }
  // ---- Récords: mejor semana, mejor mes, factura más grande, racha ----
  var REC_TROFEO = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8 21h8M12 17v4M7 4h10v5a5 5 0 0 1-10 0z"/><path d="M17 5h3v2a3 3 0 0 1-3 3M7 5H4v2a3 3 0 0 0 3 3"/></svg>';
  var recDocs = null;
  async function ghRenderRecords() {
    const card = $('gh-records'), grid = $('gh-rec-grid');
    if (!card || !grid) return;
    let docs = (typeof invDocs !== 'undefined' && invDocs && invDocs.length) ? invDocs : recDocs;
    if (!docs) {
      docs = [];
      try {
        const r = await window.storage.get('gh-invoices');
        const v = JSON.parse(r.value);
        if (Array.isArray(v)) { docs = v; recDocs = v; }
      } catch (e) {}
    }
    const semanas = resSemanasTodas().filter((x) => x.ingresos > 0 || x.gastos > 0);
    const tiles = [];
    const hoyIso = today();
    let semHoy = ''; try { semHoy = weekInfo(hoyIso).key; } catch (e) {}
    const mesHoy = hoyIso.slice(0, 7);
    const [ay, am] = [Number(hoyIso.slice(0, 4)), Number(hoyIso.slice(5, 7))];
    // semana pasada también cuenta como "nuevo" (es la que se acaba de cerrar)
    let semPas = ''; try { const d = new Date(hoyIso + 'T00:00:00'); d.setDate(d.getDate() - 7); semPas = weekInfo(ghFechaLocal(d)).key; } catch (e) {}
    if (semanas.length) {
      const mejor = semanas.reduce((m, x) => (x.ingresos > m.ingresos ? x : m), semanas[0]);
      if (mejor.ingresos > 0) {
        const [y, mm, dd] = mejor.key.split('-').map(Number);
        tiles.push({ lbl: 'Mejor semana', val: fmt(mejor.ingresos), sub: `Semana del ${dd} ${RES_MESES[mm - 1]}${y !== ay ? ' ' + y : ''}`, nuevo: mejor.key === semHoy || mejor.key === semPas });
      }
      const porMes = new Map();
      semanas.forEach((x) => { const k = x.key.slice(0, 7); porMes.set(k, (porMes.get(k) || 0) + x.ingresos); });
      let mk = '', mv = 0; porMes.forEach((v, k) => { if (v > mv) { mv = v; mk = k; } });
      if (mk) tiles.push({ lbl: 'Mejor mes', val: fmt(mv), sub: `${RES_MESES_LARGO[Number(mk.slice(5, 7)) - 1]} ${mk.slice(0, 4)}`, nuevo: mk === mesHoy });
      // racha: semanas seguidas ganando (neto > 0); una semana sin nada la corta
      let cur = 0, mejorRacha = 0, prevKey = '';
      semanas.forEach((x) => {
        const seguida = !!prevKey && Math.round((new Date(x.key + 'T00:00:00') - new Date(prevKey + 'T00:00:00')) / 864e5) === 7;
        cur = x.neto > 0 ? (seguida ? cur + 1 : 1) : 0;
        mejorRacha = Math.max(mejorRacha, cur);
        prevKey = x.key;
      });
      // si la última semana con movimientos ya no es esta ni la pasada, la racha se cortó
      const racha = (prevKey === semHoy || prevKey === semPas) ? cur : 0;
      if (mejorRacha > 1) tiles.push({ lbl: 'Racha ganando', val: `${racha} semana${racha === 1 ? '' : 's'}`, sub: racha >= mejorRacha ? '¡Tu mejor racha!' : `Récord: ${mejorRacha} semanas`, nuevo: racha >= mejorRacha && racha > 1 });
    }
    const conTotal = (docs || []).filter((d) => Number(d.total) > 0);
    if (conTotal.length) {
      const f = conTotal.reduce((m, d) => (Number(d.total) > Number(m.total) ? d : m), conTotal[0]);
      const fe = /^\d{4}-\d{2}-\d{2}$/.test(f.fecha || '') ? `${Number(f.fecha.slice(8, 10))} ${RES_MESES[Number(f.fecha.slice(5, 7)) - 1]} ${f.fecha.slice(0, 4)}` : '';
      tiles.push({ lbl: 'Factura más grande', val: fmt(Number(f.total)), sub: [f.numero ? '#' + f.numero : '', f.cliente || '', fe].filter(Boolean).join(' · '), nuevo: (f.fecha || '').slice(0, 7) === mesHoy });
    }
    card.style.display = tiles.length ? '' : 'none';
    const sub = $('gh-rec-sub'); if (sub) sub.textContent = semanas.length ? `${semanas.length} semana${semanas.length === 1 ? '' : 's'} registradas` : '';
    grid.innerHTML = tiles.map((t) => `<div class="gh-rec">
      <div class="gh-rec-lbl">${REC_TROFEO}${escapeHtml(t.lbl)}</div>
      <div class="gh-rec-val">${escapeHtml(t.val)}${t.nuevo ? '<span class="gh-rec-nuevo">NUEVO</span>' : ''}</div>
      <div class="gh-rec-sub">${escapeHtml(t.sub)}</div></div>`).join('');
  }
  function renderGraficaSemanal() {
    if (!RES_MESES) return;   // todavía no se inicializa (se vuelve a llamar después)
    ghRenderRecords();
    const cont = $('gc-chart-semanal');
    const wrap = $('gc-chart-semanal-cont');
    if (!cont || !wrap) return;
    wrap.style.display = 'block';
    wrap.querySelectorAll('.gh-res-seg button').forEach((b) => b.classList.toggle('on', b.dataset.res === resModo));
    let datos = resDatos();
    const navB = wrap.querySelectorAll('.gh-res-nav button');
    if (navB[0]) navB[0].disabled = !resNavInfo.prev;
    if (navB[1]) navB[1].disabled = !resNavInfo.next;
    const nav = wrap.querySelector('.gh-res-nav');
    if (resModo === 'mes' && !datos.some((x) => x.n)) {
      // el año no tiene nada: si ningún año tiene, se muestra el mensaje de vacío
      if (!resNavInfo.prev && !resNavInfo.next) datos = [];
    }
    if (nav) nav.style.display = datos.length ? '' : 'none';
    wrap.classList.toggle('vacio', !datos.length);
    const kpis = $('gh-res-kpis'), det = $('gh-res-det'), rango = $('gh-res-rango');
    if (!datos.length) {
      if (kpis) kpis.innerHTML = '';
      if (det) det.innerHTML = '';
      if (rango) rango.textContent = '';
      cont.innerHTML = '<div class="gh-res-vacio">Cuando registres ingresos y gastos, aquí verás cómo te va cada semana y cada mes.</div>';
      return;
    }
    const tot = datos.reduce((t, x) => ({ i: t.i + x.ingresos, g: t.g + x.gastos, n: t.n + x.neto }), { i: 0, g: 0, n: 0 });
    if (rango) {
      if (resModo === 'mes') rango.textContent = `Año ${resAnio}`;
      else {
        const pr = datos[0].key.split('-').map(Number), ul = datos[datos.length - 1].key.split('-').map(Number);
        const txt = (d) => `${d[2]} ${RES_MESES[(d[1] || 1) - 1]}${d[0] !== new Date().getFullYear() ? ' ' + d[0] : ''}`;
        rango.textContent = resPag === 0 ? (datos.length === 1 ? '1 semana' : `Últimas ${datos.length} semanas`) : `${txt(pr)} – ${txt(ul)}`;
      }
    }
    if (kpis) kpis.innerHTML = `
      <div class="gh-res-kpi i"><span>Ingresos</span><b>${fmt(tot.i)}</b></div>
      <div class="gh-res-kpi g"><span>Gastos</span><b>${fmt(tot.g)}</b></div>
      <div class="gh-res-kpi"><span>Neto</span><b style="color:${tot.n < 0 ? 'var(--ember)' : 'var(--ink)'}">${fmt(tot.n)}</b></div>`;

    if (!datos.some((x) => x.key === resSel)) {
      if (resModo === 'mes') {
        const hoyK = `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}`;
        const conDatos = datos.filter((x) => x.n);
        const mesHoy = datos.find((x) => x.key === hoyK);
        resSel = mesHoy && mesHoy.n ? hoyK : (conDatos.length ? conDatos[conDatos.length - 1].key : (mesHoy ? hoyK : datos[0].key));
      } else resSel = datos[datos.length - 1].key;
    }
    const W = 340, H = 168, padL = 6, padR = 6, padT = 18, padB = 24;
    const plotW = W - padL - padR, plotH = H - padT - padB;
    const maxVal = Math.max(1, ...datos.map((x) => Math.max(x.ingresos, x.gastos, x.neto)));
    const n = datos.length;
    const bandW = plotW / Math.max(n, 4);
    const x0 = padL + (plotW - bandW * n) / 2;
    const barW = Math.max(6, Math.min(16, bandW * 0.26));
    const y = (v) => padT + plotH - (Math.max(0, v) / maxVal) * plotH;
    const base = padT + plotH;
    let grid = '';
    [0.5, 1].forEach((f) => {
      const gy = (padT + plotH - f * plotH).toFixed(1);
      grid += `<line x1="${padL}" y1="${gy}" x2="${W - padR}" y2="${gy}" stroke="var(--border-soft)" stroke-width="1" stroke-dasharray="3 4"/>`;
    });
    grid += `<line x1="${padL}" y1="${base}" x2="${W - padR}" y2="${base}" stroke="var(--border)" stroke-width="1"/>`;
    grid += `<text x="${W - padR}" y="${padT - 6}" text-anchor="end" font-size="9.5" fill="var(--muted)" font-weight="600">${fmt(maxVal).replace('.00', '')}</text>`;
    let grupos = '', linea = '', puntos = '';
    datos.forEach((x, i) => {
      const cx = x0 + bandW * i + bandW / 2;
      const on = x.key === resSel;
      const yi = y(x.ingresos), yg = y(x.gastos), yn = y(x.neto);
      grupos += `<g class="grp${on ? ' on' : ''}" data-k="${escapeHtml(x.key)}">
        <rect class="hit" x="${(cx - bandW / 2 + 2).toFixed(1)}" y="${padT - 4}" width="${(bandW - 4).toFixed(1)}" height="${(plotH + 4 + 20).toFixed(1)}" rx="8"/>
        <rect x="${(cx - barW - 1.5).toFixed(1)}" y="${yi.toFixed(1)}" width="${barW.toFixed(1)}" height="${Math.max(0, base - yi).toFixed(1)}" rx="3" fill="var(--teal)" opacity="${on ? 1 : .78}"/>
        <rect x="${(cx + 1.5).toFixed(1)}" y="${yg.toFixed(1)}" width="${barW.toFixed(1)}" height="${Math.max(0, base - yg).toFixed(1)}" rx="3" fill="var(--ember)" opacity="${on ? 1 : .78}"/>
        <text x="${cx.toFixed(1)}" y="${H - 7}" text-anchor="middle" font-size="${n > 8 ? 9 : 10}" fill="${on ? 'var(--ink)' : 'var(--muted)'}" font-weight="${on ? 800 : 600}">${escapeHtml(x.corto)}</text>
      </g>`;
      if (x.futuro) return;
      linea += `${linea ? 'L' : 'M'}${cx.toFixed(1)} ${yn.toFixed(1)} `;
      puntos += `<circle cx="${cx.toFixed(1)}" cy="${yn.toFixed(1)}" r="${on ? 4 : 3}" fill="var(--card)" stroke="var(--ink)" stroke-width="2" pointer-events="none"/>`;
    });
    cont.innerHTML = `<svg class="gh-res-svg" viewBox="0 0 ${W} ${H}" role="img" aria-label="Ingresos y gastos por ${resModo === 'sem' ? 'semana' : 'mes'}">
      ${grid}${grupos}
      ${n > 1 ? `<path d="${linea}" fill="none" stroke="var(--ink)" stroke-width="1.6" stroke-linejoin="round" stroke-linecap="round" opacity=".55" pointer-events="none"/>` : ''}
      ${puntos}</svg>`;
    const s0 = datos.find((x) => x.key === resSel);
    if (det && s0) det.innerHTML = `<b>${escapeHtml(s0.titulo)}</b>
      <span class="v">Ingresos <b style="color:var(--teal-dk)">${fmt(s0.ingresos)}</b> · Gastos <b style="color:var(--ember)">${fmt(s0.gastos)}</b> · Neto <b>${fmt(s0.neto)}</b></span>`;
    cont.querySelectorAll('.grp').forEach((g) => g.addEventListener('click', () => { resSel = g.dataset.k; renderGraficaSemanal(); }));
  }
  document.querySelectorAll('#gc-chart-semanal-cont .gh-res-seg button').forEach((b) => {
    b.addEventListener('click', () => {
      resModo = b.dataset.res === 'mes' ? 'mes' : 'sem';
      resSel = null; resPag = 0; resAnio = 0;
      try { localStorage.setItem('gh-res-modo', resModo); } catch (e) {}
      renderGraficaSemanal();
    });
  });

  document.querySelectorAll('#gc-chart-semanal-cont .gh-res-nav button').forEach((b) => {
    b.addEventListener('click', () => {
      const d = Number(b.dataset.nav);   // -1 = más viejo, 1 = más nuevo
      if (resModo === 'mes') resAnio += d; else resPag -= d;
      resSel = null;
      renderGraficaSemanal();
    });
  });

  // ---- Acciones rápidas (botón ＋) ----
  function ghTabVisible(tab) {
    const b = document.querySelector(`.gc-tab[data-tab="${tab}"]`);
    return !!(b && b.style.display !== 'none' && getComputedStyle(b).display !== 'none');
  }
  function ghVisible(sel) {
    const el = document.querySelector(sel);
    return !!(el && el.style.display !== 'none' && getComputedStyle(el).display !== 'none');
  }
  function ghIrA(tab, sub) {
    const b = document.querySelector(`.gc-tab[data-tab="${tab}"]`);
    if (!b) return false;
    if (!b.classList.contains('active')) b.click();
    if (sub) { const sb = document.querySelector(sub); if (sb && !sb.classList.contains('active')) sb.click(); }
    return true;
  }
  function ghBajarA(el, extra) {
    if (!el) return;
    const top = el.getBoundingClientRect().top + window.scrollY - (extra || 80);
    window.scrollTo({ top: Math.max(0, top), behavior: 'smooth' });
  }
  const QA_SVG_FACT = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 2.5h12v19l-3-2-3 2-3-2-3 2z"/><path d="M9 7.5h6M9 11.5h6"/></svg>';
  const QA_SVG_CHECK = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="5" y="3" width="14" height="18" rx="2"/><path d="m9 12 2 2 4-4"/></svg>';
  const QA_SVG_LUPA = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/></svg>';
  const QA_SVG_GUARDAR = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 3h11l3 3v15H5z"/><path d="M8 3v5h8V3M8 21v-7h8v7"/></svg>';
  function ghQaMov(tipo) {
    ghIrA('movimientos', '.mov-subtab[data-msub="movs"]');
    const tb = document.querySelector(`.gc-type-btn[data-type="${tipo}"]:not(.ajuste-dir-btn)`);
    if (tb) tb.click();
    const monto = $('m-monto');
    if (monto) {
      try { monto.focus({ preventScroll: true }); } catch (e) { monto.focus(); }
      ghBajarA(monto.closest('.gc-card'), 76);
    }
  }
  const GH_QA = [
    { id: 'ingreso', txt: 'Nuevo ingreso', ic: '↑', cls: 'i', tab: 'movimientos', ok: () => true, fn: () => ghQaMov('ingreso') },
    { id: 'gasto', txt: 'Nuevo gasto', ic: '↓', cls: 'g', tab: 'movimientos', ok: () => true, fn: () => ghQaMov('gasto') },
    { id: 'ajuste', txt: 'Ajuste a socio', ic: '±', cls: 'a', tab: 'movimientos', ok: () => ghVisible('.gc-type-btn[data-type="ajuste"]'), fn: () => ghQaMov('ajuste') },
    { id: 'factura', txt: 'Nueva factura', ic: QA_SVG_FACT, cls: 'f', tab: 'facturas', ok: () => true,
      fn: () => { ghIrA('facturas', '.inv-subtab[data-sub="nueva"]'); window.scrollTo({ top: 0, behavior: 'smooth' }); } },
    { id: 'invoice', txt: 'Guardar invoice de la semana', ic: QA_SVG_GUARDAR, cls: '', tab: 'movimientos', ok: () => !!$('btn-guardar-invoice-top'),
      fn: () => { ghIrA('movimientos', '.mov-subtab[data-msub="movs"]'); $('btn-guardar-invoice-top').click(); } },
    { id: 'nomina', txt: 'Pagar nómina', ic: '$', cls: 'i', tab: 'nomina', ok: () => true,
      fn: () => { ghIrA('nomina', '.nom-subtab[data-nsub="registro"]'); window.scrollTo({ top: 0, behavior: 'smooth' }); } },
    { id: 'completion', txt: 'Completion sheet', ic: QA_SVG_CHECK, cls: '', tab: 'facturas', ok: () => ghVisible('.inv-subtab[data-sub="completion"]'),
      fn: () => { ghIrA('facturas', '.inv-subtab[data-sub="completion"]'); window.scrollTo({ top: 0, behavior: 'smooth' }); } },
    { id: 'buscar', txt: 'Buscar', ic: QA_SVG_LUPA, cls: '', tab: 'buscar', ok: () => true,
      fn: () => { ghIrA('buscar'); const q = $('b-texto'); if (q) { try { q.focus({ preventScroll: true }); } catch (e) {} } window.scrollTo({ top: 0, behavior: 'smooth' }); } },
  ];
  let ghQaOv = null, ghFab = null;
  function ghQaCerrar() {
    if (!ghQaOv) return;
    ghQaOv.classList.remove('show');
    document.body.classList.remove('gh-qa-abierto');
  }
  function ghQaAbrir() {
    if (!ghQaOv) {
      ghQaOv = document.createElement('div');
      ghQaOv.className = 'gh-qa-ov no-print';
      ghQaOv.innerHTML = '<div class="gh-qa" role="dialog" aria-label="Acciones rápidas"><div class="gh-qa-grip"></div><p class="gh-qa-t">Acciones rápidas</p><div class="gh-qa-grid"></div></div>';
      ghQaOv.addEventListener('click', (e) => { if (e.target === ghQaOv) ghQaCerrar(); });
      document.addEventListener('keydown', (e) => { if (e.key === 'Escape') ghQaCerrar(); });
      document.body.appendChild(ghQaOv);
    }
    const grid = ghQaOv.querySelector('.gh-qa-grid');
    grid.innerHTML = '';
    GH_QA.filter((a) => ghTabVisible(a.tab) && a.ok()).forEach((a) => {
      const b = document.createElement('button');
      b.type = 'button'; b.className = 'gh-qa-btn'; b.dataset.qa = a.id;
      b.innerHTML = `<span class="gh-qa-ic ${a.cls}">${a.ic}</span><span>${a.txt}</span>`;
      b.addEventListener('click', () => { ghQaCerrar(); a.fn(); });
      grid.appendChild(b);
    });
    document.body.classList.add('gh-qa-abierto');
    requestAnimationFrame(() => ghQaOv.classList.add('show'));
  }
  function ghFabIniciar() {
    if (ghFab || window.GH_ROL === 'visor') return;
    ghFab = document.createElement('button');
    ghFab.type = 'button'; ghFab.className = 'gh-fab no-print'; ghFab.id = 'gh-fab';
    ghFab.title = 'Acciones rápidas'; ghFab.setAttribute('aria-label', 'Acciones rápidas');
    ghFab.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>';
    ghFab.addEventListener('click', () => { if (document.body.classList.contains('gh-qa-abierto')) ghQaCerrar(); else ghQaAbrir(); });
    document.body.appendChild(ghFab);
  }
  if (typeof window.GH_ESPERAR_SESION === 'function') {
    window.GH_ESPERAR_SESION().then(ghFabIniciar, ghFabIniciar);
  } else {
    ghFabIniciar();
  }

  // ---- Guardar una semana como invoice (desde Movimientos) ----
  async function guardarSemanaComoInvoice(key) {
    const semanas = calcularSemanas();
    const s = semanas.find((sem) => sem.key === key);
    if (!s) return;
    const ok = await gcConfirm(`¿Guardar el invoice de "${s.label}"?\n\nLos movimientos de esa semana se archivan en Registro y se quitan de la hoja activa.`, { okText: 'Guardar invoice' });
    if (!ok) return;

    const registro = { ...s, id: Date.now(), guardadoEn: new Date().toISOString() };
    // Primero se guarda el invoice; SOLO si se guardó se quitan los
    // movimientos de la hoja (antes, si fallaba, la semana se perdía).
    invoicesGuardados.push(registro);
    try { await window.storage.set(KEY_INVOICES, JSON.stringify(invoicesGuardados)); }
    catch (e) {
      invoicesGuardados = invoicesGuardados.filter((x) => x !== registro);
      toast('No se pudo guardar el invoice, la semana sigue en la hoja: ' + ((e && e.message) || e), 'error', 6000);
      return;
    }
    movimientos = movimientos.filter((m) => weekInfo(m.fecha || today()).key !== s.key);
    await saveMov();

    renderMovimientos();
    renderReparto();
    toast('Invoice guardado y archivado en Registro ✓', 'success', 3000);
  }

  // ---- Botón "Guardar invoice" de arriba (elige qué semana) ----
  $('btn-guardar-invoice-top').addEventListener('click', () => {
    const semanas = calcularSemanas();
    if (semanas.length === 0) {
      toast('No hay movimientos para guardar', 'info');
      return;
    }
    if (semanas.length === 1) {
      guardarSemanaComoInvoice(semanas[0].key);
      return;
    }
    // Varias semanas: mostrar modal de selección
    mostrarSelectorSemana(semanas);
  });

  function mostrarSelectorSemana(semanas) {
    let overlay = document.getElementById('selector-semana-ov');
    if (overlay) overlay.remove();
    overlay = document.createElement('div');
    overlay.id = 'selector-semana-ov';
    overlay.style.cssText = 'position:fixed;inset:0;background:rgba(22,35,63,.5);z-index:1500;display:flex;align-items:center;justify-content:center;backdrop-filter:blur(3px);padding:20px;';
    const botones = semanas.map((s) =>
      `<button class="sel-sem-btn" data-key="${s.key}" style="display:block;width:100%;text-align:left;padding:12px 16px;margin-bottom:8px;background:#F5F8FC;border:1.5px solid var(--border);border-radius:10px;font-family:'Inter',sans-serif;font-size:13.5px;font-weight:600;color:var(--ink);cursor:pointer;">${s.label} — Neto: ${fmt(s.neto)}</button>`
    ).join('');
    overlay.innerHTML = `
      <div style="background:#fff;border-radius:14px;padding:24px;max-width:460px;width:100%;box-shadow:0 24px 80px rgba(22,35,63,.22);">
        <p style="font-family:'Zilla Slab',serif;font-size:17px;font-weight:600;color:var(--ink);margin-bottom:6px;">¿Qué semana quieres guardar?</p>
        <p style="font-size:12.5px;color:var(--muted);margin-bottom:16px;">Elige la semana que se archivará como invoice.</p>
        ${botones}
        <button id="sel-sem-cancelar" style="width:100%;padding:10px;margin-top:6px;background:none;border:1.5px solid var(--border);border-radius:10px;font-family:'Inter',sans-serif;font-size:13px;font-weight:600;color:var(--muted);cursor:pointer;">Cancelar</button>
      </div>`;
    document.body.appendChild(overlay);
    overlay.querySelectorAll('.sel-sem-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        overlay.remove();
        guardarSemanaComoInvoice(btn.dataset.key);
      });
    });
    overlay.querySelector('#sel-sem-cancelar').addEventListener('click', () => overlay.remove());
    overlay.addEventListener('click', (e) => { if (e.target.id === 'selector-semana-ov') overlay.remove(); });
  }

  // ---- Editar un movimiento existente ----
  function editarMovimiento(m) {
    movEditandoId = m.id;
    tipoActual = m.tipo;
    document.querySelectorAll('.gc-type-toggle > .gc-type-btn').forEach((b) => {
      b.classList.toggle('active', b.dataset.type === m.tipo);
    });
    // Mostrar/ocultar campos según tipo
    const esAjuste = m.tipo === 'ajuste';
    const esIngreso = m.tipo === 'ingreso';
    const hayParaAjuste = cfgSocios && cfgSocios.length > 0;
    $('ajuste-direccion-row').style.display = (esAjuste && hayParaAjuste) ? 'block' : 'none';
    $('cat-field-wrap').style.display = esAjuste ? 'none' : 'block';
    $('ingreso-semana-row').style.display = esIngreso ? 'block' : 'none';
    $('gasto-deducible-row').style.display = m.tipo === 'gasto' ? 'block' : 'none';
    $('m-deducible').checked = !!m.deducible;
    if (esAjuste) {
      ajusteDir = m.ajusteDir || 'sumar';
      ajusteSocioSel = idSocioDeAjuste(m) || '';
      document.querySelectorAll('.ajuste-dir-btn').forEach((b) => {
        b.classList.toggle('active', b.dataset.dir === ajusteDir);
      });
      actualizarSociosAjusteSelect();
    }
    renderCatSelect();
    $('m-fecha').value = m.fecha || today();
    if (esIngreso) {
      // Calcular a cuántas semanas de diferencia está la fecha guardada, para que
      // el selector de semana (‹ ›) quede sincronizado con lo que se está editando.
      const mondayEntrada = mondayOf(m.fecha || today());
      const mondayHoy = mondayOf(today());
      ingresoSemanaOffset = Math.round((mondayEntrada - mondayHoy) / (7 * 24 * 60 * 60 * 1000));
      const friday = new Date(mondayEntrada);
      friday.setDate(mondayEntrada.getDate() + 4);
      $('ingreso-semana-label').textContent = labelSemanaLunesAViernes(mondayEntrada, friday);
    }
    if (!esAjuste) $('m-cat').value = m.cat || '';
    $('m-monto').value = m.monto != null ? String(m.monto) : '';
    $('m-desc').value = m.desc || '';
    $('btn-guardar-mov').textContent = 'Actualizar movimiento';
    document.querySelector('.gc-tab[data-tab="movimientos"]').click();
    window.scrollTo({ top: 0, behavior: 'smooth' });
    $('m-monto').focus();
    toast('Editando movimiento — cambia los datos y guarda', 'info', 3000);
  }

  // ---- Repetir movimiento (duplicar con la fecha de hoy, para gastos/ingresos recurrentes) ----
  function duplicarMovimiento(m) {
    movEditandoId = null; // aunque se parezca a editar, al Guardar crea uno NUEVO
    tipoActual = m.tipo;
    document.querySelectorAll('.gc-type-toggle > .gc-type-btn').forEach((b) => {
      b.classList.toggle('active', b.dataset.type === m.tipo);
    });
    const esAjuste = m.tipo === 'ajuste';
    const esIngreso = m.tipo === 'ingreso';
    const hayParaAjuste = cfgSocios && cfgSocios.length > 0;
    $('ajuste-direccion-row').style.display = (esAjuste && hayParaAjuste) ? 'block' : 'none';
    $('cat-field-wrap').style.display = esAjuste ? 'none' : 'block';
    $('ingreso-semana-row').style.display = esIngreso ? 'block' : 'none';
    $('gasto-deducible-row').style.display = m.tipo === 'gasto' ? 'block' : 'none';
    $('m-deducible').checked = !!m.deducible;
    if (esAjuste) {
      ajusteDir = m.ajusteDir || 'sumar';
      ajusteSocioSel = idSocioDeAjuste(m) || '';
      document.querySelectorAll('.ajuste-dir-btn').forEach((b) => {
        b.classList.toggle('active', b.dataset.dir === ajusteDir);
      });
      actualizarSociosAjusteSelect();
    }
    renderCatSelect();
    if (esIngreso) { ingresoSemanaOffset = 0; actualizarSemanaIngreso(); } // semana actual, no la del original
    else { $('m-fecha').value = today(); }
    if (!esAjuste) $('m-cat').value = m.cat || '';
    $('m-monto').value = m.monto != null ? String(m.monto) : '';
    $('m-desc').value = m.desc || '';
    $('btn-guardar-mov').textContent = 'Guardar movimiento';
    document.querySelector('.gc-tab[data-tab="movimientos"]').click();
    window.scrollTo({ top: 0, behavior: 'smooth' });
    $('m-monto').focus();
    toast('Movimiento repetido con la fecha de hoy — revisa el monto y guarda', 'info', 3200);
  }

  // ---- Reparto semanal ----
  // Devuelve el id del socio al que va un ajuste (por id guardado o, en
  // ajustes anteriores, por su posición en la lista de socios).
  function idSocioDeAjuste(m) {
    const lista = cfgSocios || [];
    if (m.ajusteSocioId === 'empresa') return 'empresa';
    if (m.ajusteSocioId && lista.some((x) => x.id === m.ajusteSocioId)) return m.ajusteSocioId;
    // Si el socio se renombró/borró, buscarlo por nombre
    if (m.ajusteSocioNombre) { const porNombre = opcionesAjuste().find((x) => nombreDeAjuste(x.id).toLowerCase() === m.ajusteSocioNombre.toLowerCase()); if (porNombre) return porNombre.id; }
    if (m.ajusteSocioIdx != null && lista[m.ajusteSocioIdx]) return lista[m.ajusteSocioIdx].id;
    // Ajustes viejos sin socio: iban al primer socio después de la compañía
    const ops = opcionesAjuste();
    return ops[1] ? ops[1].id : null;
  }

  function calcularSemanas() {
    const grupos = new Map();
    movimientos.forEach((m) => {
      const { key, label } = weekInfo(m.fecha || today());
      if (!grupos.has(key)) {
        grupos.set(key, { label, ingresos: 0, gastos: 0, gastoItems: [], ajustesPorSocio: {}, ajusteItems: [], ingresoItems: [] });
      }
      const g = grupos.get(key);
      if (m.tipo === 'ingreso') { g.ingresos += Number(m.monto) || 0; g.ingresoItems.push(m); }
      else if (m.tipo === 'ajuste') {
        const signo = m.ajusteDir === 'restar' ? -1 : 1;
        const monto = signo * (Number(m.monto) || 0);
        // Se guarda por id del socio (estable aunque cambie el orden de la lista).
        // Ajustes viejos sin socio elegido van al primer socio después de la empresa.
        const socioKey = idSocioDeAjuste(m) || '__legacy__';
        g.ajustesPorSocio[socioKey] = (g.ajustesPorSocio[socioKey] || 0) + monto;
        g.ajusteItems.push(m);
      }
      else { g.gastos += Number(m.monto) || 0; g.gastoItems.push(m); }
    });

    const resultado = [];
    [...grupos.keys()].sort().forEach((key) => {
      const g = grupos.get(key);
      const taxas = g.ingresos * TASA_TAXAS;
      const gastosTotales = g.gastos + taxas;
      const neto = g.ingresos - gastosTotales;

      // Reparto en partes iguales entre TODOS los socios de la lista (1, 2 o
      // más). Si solo hay uno, "su parte" es el 100% — sale solo, sin caso
      // especial. Los ajustes manuales van al socio seleccionado; el bono de
      // cada quien es su propio porcentaje sobre (su parte + su ajuste).
      // La EMPRESA siempre entra en el reparto y va primero. Los socios son
      // opcionales: sin ninguno, la empresa se lleva todo; con socios, la
      // semana se divide en partes iguales entre la empresa y ellos.
      const nombreEmpresa = (cfgFacturaNombre || 'Empresa').trim();
      const claveEmpresa = nombreEmpresa.toLowerCase();
      const lista = [
        { id: 'empresa', nombre: nombreEmpresa, bonoPct: 0, esEmpresa: true },
        // Si la empresa quedó también dentro de la lista de socios (de una
        // versión anterior), no debe contarse dos veces ni salir repetida
        // en el reparto del invoice.
        ...((cfgSocios || []).filter((x) => x && x.nombre && x.nombre.trim().toLowerCase() !== claveEmpresa))
      ];
      const base = neto / lista.length;
      const pagos = lista.map((s, i) => {
        const ajusteSocio = (g.ajustesPorSocio[s.id] || 0) + (i === 1 ? (g.ajustesPorSocio['__legacy__'] || 0) : 0);
        const baseConAjuste = base + ajusteSocio;
        const pct = Number(s.bonoPct) || 0;
        const bono = baseConAjuste > 0 ? baseConAjuste * (pct / 100) : 0;
        return { id: s.id, nombre: s.nombre, bonoPct: pct, base, ajuste: ajusteSocio, bono, total: baseConAjuste + bono, esEmpresa: !!s.esEmpresa };
      });
      const bonoCra = pagos.reduce((sum, p) => sum + p.bono, 0); // bono total que sale de las taxas
      const taxGuzman = taxas - bonoCra;

      // Alias de compatibilidad con el resto de la app (1° y 2° socio):
      const mitad = base;
      const pagoCra = pagos[0] ? pagos[0].total : 0;
      const pagoGuzman = pagos[1] ? pagos[1].total : 0;
      // Desglose del bono del segundo socio en "de su mitad" vs "de su ajuste" (solo para mostrarlo detallado en la factura/recibo)
      const pct1 = pagos[1] ? pagos[1].bonoPct : 0;
      const bonoBase = base > 0 ? base * (pct1 / 100) : 0;
      const ajusteGuzman = pagos[1] ? pagos[1].ajuste : 0;
      const bonoAjuste = ajusteGuzman * (pct1 / 100);

      const gastoItems = [...g.gastoItems].sort((a, b) => (a.fecha || '').localeCompare(b.fecha || ''));
      resultado.push({ key, label: g.label, ingresos: g.ingresos, gastos: g.gastos, gastoItems, ajusteGuzman: ajusteGuzman, ajusteItems: g.ajusteItems, ingresoItems: g.ingresoItems, taxas, gastosTotales, neto, mitad, bonoBase, bonoAjuste, bonoCra, pagoCra, pagoGuzman, taxGuzman, pagos });
    });
    return resultado;
  }

  function renderReparto() {
    actualizarStats();
    ghActualizarHero();
    // Las tarjetas de semanas activas ya no se muestran en Registro.
    // El botón "Guardar invoice" ahora está en Movimientos (por semana).
    renderInvoicesGuardados();
    renderResumenTaxas();
    if (typeof renderTotalPorSocio === 'function') renderTotalPorSocio();
  }

  function renderInvoicesGuardados() {
    const tbody = $('tbody-invoices-guardados');
    tbody.innerHTML = '';
    // Ordenados por la fecha de la semana (la más reciente arriba); si dos son
    // de la misma semana, el último guardado primero.
    const fechaInv = (inv) => inv.key || (Array.isArray(inv.ingresoItems) && inv.ingresoItems[0] && inv.ingresoItems[0].fecha) || (inv.guardadoEn || '').slice(0, 10);
    const sorted = [...invoicesGuardados].sort((a, b) => fechaInv(b).localeCompare(fechaInv(a)) || (b.guardadoEn || '').localeCompare(a.guardadoEn || ''));
    const hayDatos = sorted.length > 0;
    $('empty-invoices-guardados').style.display = hayDatos ? 'none' : 'block';
    $('tabla-invoices-guardados').style.display = hayDatos ? 'block' : 'none';

    // Encabezado: una columna de pago por cada socio actual (mínimo 1)
    const listaSocios = cfgSocios && cfgSocios.length ? cfgSocios : [{ nombre: cfgSocioBonus }];
    const filaEnc = $('tabla-invoices-thead-row');
    if (filaEnc) {
      filaEnc.innerHTML = `<th data-i18n="h_semana">Semana</th><th data-i18n="h_guardado">Guardado</th><th class="num" data-i18n="h_gastos">Gastos</th>${listaSocios.map((s) => `<th class="num">${escapeHtml(s.nombre)}</th>`).join('')}<th></th>`;
    }

    const fmtOpc = (v) => (v == null || v === '' || isNaN(Number(v))) ? '—' : fmt(v);
    sorted.forEach((inv, idxInv) => {
      const idInv = idxInv; // posición en la lista: siempre existe, aunque el invoice viejo no traiga id/key
      const dGuard = inv.guardadoEn ? new Date(inv.guardadoEn) : null;
      const fechaGuardado = dGuard && !isNaN(dGuard) ? dGuard.toLocaleDateString('es-MX', { day: 'numeric', month: 'short', year: 'numeric' }) : '';
      const titulo = invRangoCorto(inv.label) || inv.label || 'Invoice';
      // Mismo reparto que se ve en "Ver" (nombres tal como se guardaron)
      let pagos = [];
      try { pagos = invPagosNormalizados(inv); } catch (e) { pagos = []; }
      const filasPago = pagos.map((p, k) => `
          <div class="ig-pago"><span class="ig-dot c${k % 4}"></span><span class="ig-pago-n">${escapeHtml(p.nombre || '—')}</span><span class="ig-pago-v">${fmtOpc(p.total)}</span></div>`).join('');
      const tr = document.createElement('tr');
      tr.className = 'sel-item';
      tr.dataset.selid = String(idxInv);
      tr.innerHTML = `
        <td colspan="9" class="ig-td">
          <div class="ig">
            <div class="ig-top">
              <div class="ig-tit" title="${escapeHtml(inv.label || '')}">${escapeHtml(titulo)}</div>
              ${fechaGuardado ? `<span class="ig-fecha">Guardado ${escapeHtml(fechaGuardado)}</span>` : ''}
            </div>
            <div class="ig-kpis">
              <div class="ig-kpi"><span>Ingresos</span><b class="ing">${fmtOpc(inv.ingresos)}</b></div>
              <div class="ig-kpi"><span>Gastos</span><b class="gas">${fmtOpc(inv.gastosTotales)}</b></div>
              <div class="ig-kpi"><span>Neto</span><b>${fmtOpc(inv.neto)}</b></div>
            </div>
            ${filasPago ? `<div class="ig-pagos"><div class="ig-pagos-t">Reparto</div>${filasPago}</div>` : ''}
            <div class="ig-acc">
              <button class="gc-action-btn gc-ver-invoice-btn" data-i18n="ver" data-id="${idInv}">Ver</button>
              <button class="gc-action-btn gc-editar-invoice-btn" data-i18n="editar_2" data-id="${idInv}">✎ Editar</button>
              <button class="gc-action-btn gc-reabrir-invoice-btn" data-id="${idInv}" title="Devuelve los movimientos a la hoja de Movimientos">↩ Reabrir</button>
              <button class="gc-del" data-id="${idInv}" title="Eliminar">✕</button>
            </div>
          </div>
        </td>`;
      tbody.appendChild(tr);
    });

    tbody.querySelectorAll('.gc-ver-invoice-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        const inv = sorted[Number(btn.dataset.id)];
        if (!inv) { toast('No se pudo abrir este invoice', 'error'); return; }
        try {
          mostrarVistaImpresion(inv);
        } catch (e) {
          // Nunca dejar el botón "mudo": si algo truena al armar la vista, avisar.
          toast('No se pudo mostrar el invoice: ' + (e && e.message ? e.message : e), 'error', 5000);
        }
      });
    });

    tbody.querySelectorAll('.gc-editar-invoice-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        const inv = sorted[Number(btn.dataset.id)];
        if (!inv) { toast('No se pudo abrir este invoice', 'error'); return; }
        abrirEditorInvoice(inv);
      });
    });

    tbody.querySelectorAll('.gc-reabrir-invoice-btn').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const inv = sorted[Number(btn.dataset.id)];
        if (!inv) return;
        const ok = await gcConfirm(`¿Reabrir el invoice de "${inv.label}"?\n\nLos movimientos volverán a la hoja de Movimientos para que los edites (agregar lo que faltó cobrar, corregir montos, etc). El invoice guardado se quita de la lista y luego lo vuelves a guardar cuando termines.`, { okText: 'Reabrir' });
        if (!ok) return;

        // Reconstruir los movimientos de ese invoice y devolverlos a la hoja activa
        const movsReabiertos = [];
        // Gastos (guardados en gastoItems)
        const nuevoId = () => Date.now() + Math.random();
        (inv.gastoItems || []).forEach((g) => {
          movsReabiertos.push({ ...g, id: nuevoId(), tipo: 'gasto' });
        });
        // Ajustes: vuelven tal cual (socio, sumar/restar, monto, descripción).
        if (Array.isArray(inv.ajusteItems) && inv.ajusteItems.length) {
          inv.ajusteItems.forEach((a) => movsReabiertos.push({ ...a, id: nuevoId(), tipo: 'ajuste' }));
        } else if (inv.ajusteGuzman) {
          // Invoice viejo que solo guardó el total del ajuste: se rehace como un ajuste al mismo socio.
          const socio = (cfgSocios || [])[0];
          const fechaAj = inv.gastoItems && inv.gastoItems[0] ? inv.gastoItems[0].fecha : today();
          movsReabiertos.push({ id: nuevoId(), fecha: fechaAj, tipo: 'ajuste', cat: 'Ajuste', monto: Math.abs(inv.ajusteGuzman),
            ajusteDir: inv.ajusteGuzman < 0 ? 'restar' : 'sumar', ajusteSocioId: socio ? socio.id : null,
            desc: 'Ajuste reabierto de ' + (inv.label || '') });
        }
        // Ingresos: si el invoice guardó cada línea, vuelven igual; si no, como una sola línea con el total.
        if (Array.isArray(inv.ingresoItems) && inv.ingresoItems.length) {
          inv.ingresoItems.forEach((g) => movsReabiertos.push({ ...g, id: nuevoId(), tipo: 'ingreso' }));
        } else if (inv.ingresos > 0) {
          const fechaIng = inv.gastoItems && inv.gastoItems[0] ? inv.gastoItems[0].fecha : today();
          movsReabiertos.push({ id: Date.now() + Math.random(), fecha: fechaIng, tipo: 'ingreso', cat: (catIngresos[0] || 'Ingreso'), monto: inv.ingresos, desc: 'Ingreso reabierto de ' + (inv.label || '') });
        }

        movimientos.push(...movsReabiertos);
        invoicesGuardados = invoicesGuardados.filter((x) => x !== inv);
        saveMov();
        saveInvoices();
        renderMovimientos();
        renderReparto();
        renderInvoicesGuardados();
        document.querySelector('.gc-tab[data-tab="movimientos"]').click();
        window.scrollTo({ top: 0, behavior: 'smooth' });
        toast('Invoice reabierto — edita los movimientos y vuelve a guardarlo', 'info', 4000);
      });
    });

    tbody.querySelectorAll('.gc-del').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const inv = sorted[Number(btn.dataset.id)];
        if (!inv) { toast('No se pudo identificar este invoice', 'error'); return; }
        if (!await gcConfirm('¿Eliminar este invoice guardado? Esta acción no se puede deshacer.', { okText: 'Eliminar', danger: true })) return;
        // Quita exactamente ese invoice (por referencia), no por id — así
        // funciona igual con invoices viejos que no traen id ni key.
        invoicesGuardados = invoicesGuardados.filter((x) => x !== inv);
        saveInvoices();
        renderInvoicesGuardados();
        renderReparto();
        toast('Invoice eliminado', 'info');
      });
    });
    if (regSel) regSel.refrescarTrasRedibujar();
    regSelOrden = sorted;
    try { renderGraficaSemanal(); } catch (e) {}   // para que las acciones sepan a qué invoice corresponde cada marca
  }

  // ---- Modo selección en Registro → Invoices guardados ----
  let regSelOrden = [];
  const regSel = ghCrearSeleccion({
    host: 'reg-sel-host',
    contenedor: 'tbody-invoices-guardados',
    nombre: 'invoice', plural: 'invoices',
    acciones: [
      { id: 'compartir', texto: '↗ Compartir', fn: async (ids) => {
          const docs = ids.map((i) => regSelOrden[Number(i)]).filter(Boolean);
          if (!docs.length) return;
          const html = ghDocumentoCombinado(docs.map((d) => construirHTMLInvoice(d)), 'Invoices');
          await ghCompartirHTML(html, `invoices-${docs.length}.html`, `${docs.length} invoice(s)`);
        } },
      { id: 'imprimir', texto: '🖨 Imprimir', fn: (ids) => {
          const docs = ids.map((i) => regSelOrden[Number(i)]).filter(Boolean);
          if (!docs.length) return;
          ghImprimirEnVentana(docs.map((d) => `<div class="gh-doc">${construirHTMLInvoice(d)}</div>`).join(''), `Invoices (${docs.length})`);
        } },
      { id: 'borrar', texto: '🗑 Borrar', peligro: true, fn: async (ids) => {
          const docs = ids.map((i) => regSelOrden[Number(i)]).filter(Boolean);
          if (!docs.length) return;
          if (!await gcConfirm(`¿Eliminar ${docs.length} invoice(s) guardado(s)? Esta acción no se puede deshacer.`, { okText: 'Eliminar', danger: true })) return;
          invoicesGuardados = invoicesGuardados.filter((x) => !docs.includes(x));
          saveInvoices();
          regSel.salir();
          renderInvoicesGuardados();
          renderReparto();
          toast(`${docs.length} invoice(s) eliminado(s)`, 'info');
        } },
    ],
  });

  // ---- Total pagado por socio (suma de todos los invoices del año filtrado) ----
  function renderTotalPorSocio() {
    const cont = $('total-socios-lista');
    if (!cont) return;
    const filtroAnio = ($('taxas-anio-filtro') || {}).value || 'todos';
    const invs = invoicesGuardados.filter((inv) => filtroAnio === 'todos' || (inv.guardadoEn || '').startsWith(filtroAnio));
    const totales = new Map(); // nombre del socio -> total acumulado
    invs.forEach((inv) => {
      const pagos = Array.isArray(inv.pagos) && inv.pagos.length
        ? inv.pagos
        : [{ nombre: cfgSocioBonus, total: inv.pagoCra || 0 }, { nombre: cfgSocioMitad, total: inv.pagoGuzman || 0 }];
      pagos.forEach((p) => {
        if (!p.nombre) return;
        totales.set(p.nombre, (totales.get(p.nombre) || 0) + (Number(p.total) || 0));
      });
    });
    const lista = [...totales.entries()].sort((a, b) => b[1] - a[1]);
    $('empty-total-socios').style.display = lista.length === 0 ? 'block' : 'none';
    cont.style.display = lista.length === 0 ? 'none' : 'grid';
    cont.innerHTML = lista.map(([nombre, total], i) => `
      <div style="background:#F5F7FC;border-radius:12px;padding:14px 16px;border-left:3px solid ${DONUT_COLORES[i % DONUT_COLORES.length]};">
        <div style="font-size:11px;color:var(--muted);text-transform:uppercase;letter-spacing:.4px;font-weight:700;margin-bottom:4px;">${escapeHtml(nombre)}</div>
        <div style="font-size:19px;font-weight:700;color:var(--ink);font-family:'IBM Plex Mono',monospace;">${fmt(total)}</div>
      </div>`).join('');
  }

  // ---- Resumen anual de Taxas ----
  function renderResumenTaxas() {
    const filtroAnio = ($('taxas-anio-filtro') || {}).value || 'todos';
    const tbody = $('tbody-taxas-resumen');
    const tfoot = $('tfoot-taxas-resumen');
    tbody.innerHTML = '';
    tfoot.innerHTML = '';

    // Filtrar por año
    const invs = invoicesGuardados.filter((inv) => {
      if (filtroAnio === 'todos') return true;
      const fecha = inv.guardadoEn || '';
      return fecha.startsWith(filtroAnio);
    });

    $('empty-taxas-resumen').style.display = invs.length === 0 ? 'block' : 'none';
    $('tabla-taxas-resumen').style.display = invs.length === 0 ? 'none' : 'table';

    let totIng = 0, totGas = 0, totNeto = 0, totTaxas = 0, totBono = 0, totRest = 0;

    // Ordenar por fecha de guardado
    const sorted = [...invs].sort((a, b) => (a.guardadoEn || '').localeCompare(b.guardadoEn || ''));

    sorted.forEach((inv, i) => {
      const neto = inv.neto ?? 0;
      const bono = inv.bonoCra ?? 0;
      const rest = inv.taxGuzman ?? 0;
      const taxas = inv.taxas ?? 0;
      const ing = inv.ingresos ?? 0;
      const gas = inv.gastos ?? 0;

      totIng += ing;
      totGas += gas;
      totNeto += neto;
      totTaxas += taxas;
      totBono += bono;
      totRest += rest;

      const netoNeg = neto < 0;
      const tr = document.createElement('tr');
      if (netoNeg) tr.style.background = '#FFF5F5';
      tr.innerHTML = `
        <td style="font-size:12px;">${escapeHtml(inv.label || inv.key || '')}${netoNeg ? ' <span style="color:var(--ember);font-size:10px;font-weight:700;">NEGATIVO</span>' : ''}</td>
        <td class="num" style="color:var(--teal);font-family:'IBM Plex Mono',monospace;">${fmt(ing)}</td>
        <td class="num" style="color:var(--ember);font-family:'IBM Plex Mono',monospace;">${fmt(gas)}</td>
        <td class="num" style="color:${netoNeg ? 'var(--ember)' : 'var(--ink)'};font-family:'IBM Plex Mono',monospace;font-weight:600;">${fmt(neto)}</td>
        <td class="num" style="color:var(--gold);font-family:'IBM Plex Mono',monospace;">${fmt(taxas)}</td>
        <td class="num" style="color:var(--muted);font-family:'IBM Plex Mono',monospace;">${bono > 0 ? '− ' + fmt(bono) : '—'}</td>
        <td class="num" style="background:#FBF0D4;color:var(--gold);font-family:'IBM Plex Mono',monospace;font-weight:700;">${fmt(rest)}</td>
      `;
      tbody.appendChild(tr);
    });

    // Totales
    if (invs.length > 0) {
      tfoot.innerHTML = `
        <tr style="background:#F0F4FA;font-weight:700;">
          <td style="padding:10px 12px;font-size:12.5px;">TOTAL (${invs.length} invoices)</td>
          <td class="num" style="padding:10px 12px;color:var(--teal);font-family:'IBM Plex Mono',monospace;">${fmt(totIng)}</td>
          <td class="num" style="padding:10px 12px;color:var(--ember);font-family:'IBM Plex Mono',monospace;">${fmt(totGas)}</td>
          <td class="num" style="padding:10px 12px;font-family:'IBM Plex Mono',monospace;">${fmt(totNeto)}</td>
          <td class="num" style="padding:10px 12px;color:var(--gold);font-family:'IBM Plex Mono',monospace;">${fmt(totTaxas)}</td>
          <td class="num" style="padding:10px 12px;color:var(--muted);font-family:'IBM Plex Mono',monospace;">− ${fmt(totBono)}</td>
          <td class="num" style="padding:10px 12px;background:#FBF0D4;color:var(--gold);font-family:'IBM Plex Mono',monospace;font-size:15px;">${fmt(totRest)}</td>
        </tr>`;
    }

    // Poblar el select de años
    const selectAnio = $('taxas-anio-filtro');
    const aniosActual = selectAnio.value;
    const anios = [...new Set(invoicesGuardados.map((inv) => (inv.guardadoEn || '').slice(0, 4)).filter(Boolean))].sort().reverse();
    selectAnio.innerHTML = '<option value="todos" data-i18n="todos_los_anos">Todos los años</option>' + anios.map((a) => `<option value="${a}">${a}</option>`).join('');
    if (aniosActual && (aniosActual === 'todos' || anios.includes(aniosActual))) selectAnio.value = aniosActual;
  }

// ---- 03-ux.js ----
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
// ---- 04-buscar-reportes.js ----
  // ====================================================================

  // ---- Buscar / Anual ----
  // Construye la lista completa de movimientos: activos + archivados en invoices guardados
  function todosMov() {
    const lista = [...movimientos];

    invoicesGuardados.forEach((inv) => {
      // Movimientos de gastos archivados en este invoice
      if (Array.isArray(inv.gastoItems)) {
        inv.gastoItems.forEach((gi) => {
          // Solo agrega si no existe ya en movimientos activos (evita duplicados)
          if (!movimientos.find((m) => m.id === gi.id)) {
            lista.push({ ...gi, _archivado: true });
          }
        });
      }
      // Ingreso archivado
      const fechaRef = inv.key ? inv.key + '-01' : null;
      const fechaInv = inv.gastoItems?.[0]?.fecha || fechaRef || today();

      if (inv.ingresos && !movimientos.find((m) =>
        m.origen === 'historial-2026' && weekInfo(m.fecha).key === inv.key && m.tipo === 'ingreso')
        && !lista.find((m) => m._invId === inv.id && m.tipo === 'ingreso')) {
        lista.push({ id: 'inv-ing-' + inv.id, fecha: fechaInv, tipo: 'ingreso', cat: 'Ingresos semanales', monto: inv.ingresos, desc: inv.label || '', _invId: inv.id, _archivado: true });
      }
      // Pago a GUZMAN HVAC
      if (inv.pagoCra != null && !lista.find((m) => m._invId === inv.id && m.cat === 'Pago ' + cfgSocioBonus)) {
        lista.push({ id: 'inv-cra-' + inv.id, fecha: fechaInv, tipo: 'gasto', cat: 'Pago ' + cfgSocioBonus, monto: inv.pagoCra, desc: inv.label || '', _invId: inv.id, _archivado: true });
      }
      // Pago a CRA HVAC
      if (inv.pagoGuzman != null && !lista.find((m) => m._invId === inv.id && m.cat === 'Pago ' + cfgSocioMitad)) {
        lista.push({ id: 'inv-guz-' + inv.id, fecha: fechaInv, tipo: 'gasto', cat: 'Pago ' + cfgSocioMitad, monto: inv.pagoGuzman, desc: inv.label || '', _invId: inv.id, _archivado: true });
      }
      // Ajuste a CRA HVAC (desglosado) — solo si hubo ajuste en la semana
      if (inv.ajusteGuzman && !lista.find((m) => m._invId === inv.id && m.cat && m.cat.startsWith('Ajuste'))) {
        const esSuma = inv.ajusteGuzman > 0;
        lista.push({
          id: 'inv-aj-' + inv.id,
          fecha: fechaInv,
          tipo: 'ajuste',
          cat: esSuma ? ('Ajuste + ' + cfgSocioBonus) : ('Ajuste − ' + cfgSocioBonus),
          monto: Math.abs(inv.ajusteGuzman),
          desc: inv.label || '',
          _invId: inv.id, _archivado: true
        });
      }
    });

    return lista;
  }

  function renderAnios() {
    const select = $('b-anio');
    const actual = select.value;
    const todos = todosMov();
    const anios = [...new Set(todos.map((m) => (m.fecha || today()).slice(0, 4)))].sort().reverse();
    select.innerHTML = '<option value="todos" data-i18n="todos_los_anos">Todos los años</option>' + anios.map((a) => `<option value="${a}">${a}</option>`).join('');
    if (actual && (actual === 'todos' || anios.includes(actual))) select.value = actual;
  }

  // Resalta en amarillo la parte que coincide con lo buscado
  function ghResaltar(txt, buscar) {
    if (!buscar || !txt) return escapeHtml(txt || '');
    const t = String(txt);
    const i = t.toLowerCase().indexOf(buscar);
    if (i < 0) return escapeHtml(t);
    return escapeHtml(t.slice(0, i))
      + '<mark style="background:#FBF0D4;color:var(--gold);padding:0 2px;border-radius:3px;">' + escapeHtml(t.slice(i, i + buscar.length)) + '</mark>'
      + escapeHtml(t.slice(i + buscar.length));
  }

  let ghUltimaBusqueda = [];   // lo que se está mostrando ahora, para poder exportarlo

  // Al buscar, sube la vista a los resultados para no tener que bajar a mano.
  // Solo se mueve cuando de verdad hace falta (si los resultados ya se ven,
  // se queda quieto) y no interrumpe mientras se sigue escribiendo.
  let ghScrollTimer = null;
  function ghSubirAResultados() {
    const dest = $('b-resultados');
    if (!dest) return;
    clearTimeout(ghScrollTimer);
    ghScrollTimer = setTimeout(() => {
      const r = dest.getBoundingClientRect();
      const esMovil = window.matchMedia('(max-width: 720px)').matches;
      const margen = esMovil ? 70 : 90;   // deja espacio para el encabezado fijo
      // Si el bloque de resultados no se ve completo en pantalla, súbelo.
      if (r.top > window.innerHeight * 0.55 || r.top < 0) {
        window.scrollTo({ top: window.scrollY + r.top - margen, behavior: 'smooth' });
      }
    }, 420);
  }

  // ---- Búsqueda global: coincidencias fuera de Movimientos ----
  function ghBuscarGlobal(texto) {
    const card = $('b-global-card');
    const cont = $('b-global-lista');
    if (!card || !cont) return;
    if (!texto || texto.length < 2) { card.style.display = 'none'; cont.innerHTML = ''; return; }

    const grupos = [];
    const agrega = (titulo, items, alTocar) => {
      if (items.length) grupos.push({ titulo, items: items.slice(0, 8), total: items.length, alTocar });
    };

    // Facturas guardadas
    agrega('Facturas', (invDocs || []).filter((d) =>
      (d.numero || '').toLowerCase().includes(texto) || (d.cliente || '').toLowerCase().includes(texto) ||
      (d.items || []).some((it) => (it.location || '').toLowerCase().includes(texto) || (it.work || '').toLowerCase().includes(texto))
    ).map((d) => `${d.numero || '(sin número)'} · ${d.cliente || '—'} · ${invFmt(d.total)}`),
      () => { document.querySelector('.gc-tab[data-tab="facturas"]').click(); document.querySelector('.inv-subtab[data-sub="guardadas"]').click(); });


    // Planos

    // Clientes y colonias
    agrega('Clientes', (invClientes || []).filter((c) => (c || '').toLowerCase().includes(texto)),
      () => { document.querySelector('.gc-tab[data-tab="facturas"]').click(); invAbrirCarpeta('clientes'); });
    agrega('Colonias', (invColonias || []).filter((c) => (c || '').toLowerCase().includes(texto)),
      () => { document.querySelector('.gc-tab[data-tab="facturas"]').click(); invAbrirCarpeta('colonias'); });

    // Trabajadores (nómina)
    agrega('Trabajadores', (empleados || []).filter((e) =>
      `${e.nombre || ''} ${e.apellido || ''}`.toLowerCase().includes(texto)
    ).map((e) => `${e.nombre || ''} ${e.apellido || ''}`.trim()),
      () => document.querySelector('.gc-tab[data-tab="nomina"]').click());

    if (!grupos.length) { card.style.display = 'none'; cont.innerHTML = ''; return; }
    card.style.display = 'block';
    cont.innerHTML = '';
    grupos.forEach((g) => {
      const bloque = document.createElement('div');
      bloque.style.cssText = 'padding:11px 0;border-top:1px solid var(--border-soft);';
      bloque.innerHTML = `
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;">
          <span style="font-size:10.5px;font-weight:700;text-transform:uppercase;letter-spacing:.5px;color:var(--muted);">${g.titulo} (${g.total})</span>
          <button type="button" class="gc-action-btn" style="padding:4px 11px;font-size:11px;">Ir →</button>
        </div>
        ${g.items.map((t) => `<div style="font-size:12.5px;color:var(--ink);padding:2px 0;">${escapeHtml(t)}</div>`).join('')}
        ${g.total > g.items.length ? `<div style="font-size:11px;color:var(--muted-soft);padding-top:3px;">y ${g.total - g.items.length} más…</div>` : ''}`;
      bloque.querySelector('button').addEventListener('click', g.alTocar);
      cont.appendChild(bloque);
    });
  }

  // ---- Atajos de rango de fechas ----
  document.querySelectorAll('.b-rango').forEach((btn) => {
    btn.addEventListener('click', () => {
      const hoy = new Date();
      const iso = (d) => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
      let desde, hasta;
      switch (btn.dataset.rango) {
        case 'mes':
          desde = new Date(hoy.getFullYear(), hoy.getMonth(), 1); hasta = new Date(hoy.getFullYear(), hoy.getMonth() + 1, 0); break;
        case 'mes-pasado':
          desde = new Date(hoy.getFullYear(), hoy.getMonth() - 1, 1); hasta = new Date(hoy.getFullYear(), hoy.getMonth(), 0); break;
        case '30':
          desde = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate() - 29); hasta = hoy; break;
        default:
          desde = new Date(hoy.getFullYear(), 0, 1); hasta = new Date(hoy.getFullYear(), 11, 31);
      }
      $('b-desde').value = iso(desde);
      $('b-hasta').value = iso(hasta);
      renderBusqueda();
    });
  });

  function renderBusqueda() {
    const texto = $('b-texto').value.trim().toLowerCase();
    const anio = $('b-anio').value || 'todos';
    const desde = $('b-desde') ? $('b-desde').value : '';
    const hasta = $('b-hasta') ? $('b-hasta').value : '';
    const tipoFiltro = $('b-tipo') ? $('b-tipo').value : 'todos';
    const usaRango = !!(desde || hasta); // si hay fechas, mandan sobre "Año"

    const min = parseFloat(($('b-min') ? $('b-min').value : '').replace(',', '.'));
    const max = parseFloat(($('b-max') ? $('b-max').value : '').replace(',', '.'));
    const orden = $('b-orden') ? $('b-orden').value : 'fecha-desc';

    const filtrados = todosMov().filter((m) => {
      const fecha = m.fecha || '';
      const monto = Number(m.monto) || 0;
      const okFecha = usaRango
        ? (!desde || fecha >= desde) && (!hasta || fecha <= hasta)
        : (anio === 'todos' || fecha.slice(0, 4) === anio);
      const okTipo = tipoFiltro === 'todos' || m.tipo === tipoFiltro;
      const okMonto = (isNaN(min) || monto >= min) && (isNaN(max) || monto <= max);
      const okTexto = !texto
        || (m.cat || '').toLowerCase().includes(texto)
        || (m.desc || '').toLowerCase().includes(texto)
        || String(m.monto || '').includes(texto);
      return okFecha && okTipo && okMonto && okTexto;
    }).sort((a, b) => {
      const fa = a.fecha || '', fb = b.fecha || '';
      const ma = Number(a.monto) || 0, mb = Number(b.monto) || 0;
      switch (orden) {
        case 'fecha-asc': return fa.localeCompare(fb);
        case 'monto-desc': return mb - ma;
        case 'monto-asc': return ma - mb;
        case 'cat': return (a.cat || '').localeCompare(b.cat || '');
        default: return fb.localeCompare(fa);   // fecha más nueva primero
      }
    });

    // Detalle
    const tbody = $('tbody-buscar');
    tbody.innerHTML = '';
    $('empty-buscar').style.display = filtrados.length === 0 ? 'block' : 'none';
    let total = 0;
    filtrados.forEach((m) => {
      total += Number(m.monto) || 0;
      const tr = document.createElement('tr');
      const tipoTxt = m.tipo === 'ingreso' ? 'Ingreso' : m.tipo === 'ajuste' ? 'Ajuste' : 'Gasto';
      tr.innerHTML = `
        <td>${invFechaNum(m.fecha)}</td>
        <td><span class="gc-tipo-tag ${m.tipo}">${tipoTxt}</span></td>
        <td>${ghResaltar(m.cat || '', texto)}</td>
        <td>${ghResaltar(m.desc || '', texto)}</td>
        <td class="gc-num">${fmt(m.monto)}</td>
      `;
      tbody.appendChild(tr);
    });
    $('total-buscar').textContent = fmt(total);

    // Resumen de lo encontrado (ingresos / gastos / neto de lo filtrado)
    const cajaRes = $('b-resumen-resultados');
    if (cajaRes) {
      if (!filtrados.length) {
        cajaRes.style.display = texto || usaRango || tipoFiltro !== 'todos' ? 'block' : 'none';
        cajaRes.innerHTML = 'Sin resultados con estos filtros.';
      } else {
        const ing = filtrados.filter((m) => m.tipo === 'ingreso').reduce((a, m) => a + (Number(m.monto) || 0), 0);
        const gas = filtrados.filter((m) => m.tipo === 'gasto').reduce((a, m) => a + (Number(m.monto) || 0), 0);
        cajaRes.style.display = 'block';
        cajaRes.innerHTML = `<strong>${filtrados.length}</strong> movimiento(s) · `
          + `ingresos <strong style="color:var(--teal-dk);">${fmt(ing)}</strong> · `
          + `gastos <strong style="color:var(--ember);">${fmt(gas)}</strong> · `
          + `neto <strong>${fmt(ing - gas)}</strong>`;
      }
    }

    ghUltimaBusqueda = filtrados;
    ghBuscarGlobal(texto);
    if (texto.length >= 2 && filtrados.length) ghSubirAResultados();

    // Resumen por categoría
    const resumen = new Map();
    filtrados.forEach((m) => {
      const key = m.cat + '||' + m.tipo;
      if (!resumen.has(key)) resumen.set(key, { cat: m.cat, tipo: m.tipo, total: 0, count: 0 });
      const r = resumen.get(key);
      r.total += Number(m.monto) || 0;
      r.count += 1;
    });
    const filas = [...resumen.values()].sort((a, b) => b.total - a.total);
    const tbodyR = $('tbody-resumen-cat');
    tbodyR.innerHTML = '';
    $('empty-resumen-cat').style.display = filas.length === 0 ? 'block' : 'none';
    filas.forEach((r) => {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>${escapeHtml(r.cat)}</td>
        <td><span class="gc-tipo-tag ${r.tipo}">${r.tipo === 'ingreso' ? 'Ingreso' : r.tipo === 'ajuste' ? 'Ajuste' : 'Gasto'}</span></td>
        <td class="gc-num">${r.count}</td>
        <td class="gc-num">${fmt(r.total)}</td>
      `;
      tbodyR.appendChild(tr);
    });

    renderDonutGastos(filas);
  }

  // ---- Donut SVG: gastos por categoría (top 6 + "Otros") ----
  const DONUT_COLORES = ['#0E8F82', '#C6551E', '#4F6FA8', '#9B7220', '#7A5AA8', '#3E8FBF', '#8895AC'];
  function renderDonutGastos(filas) {
    const wrap = $('gc-chart-cat-cont');
    const svgCont = $('gc-donut-svg');
    const legendCont = $('gc-donut-legend');
    if (!wrap || !svgCont || !legendCont) return;

    const gastos = filas.filter((r) => r.tipo === 'gasto' && r.total > 0).sort((a, b) => b.total - a.total);
    if (gastos.length === 0) { wrap.style.display = 'none'; return; }
    wrap.style.display = 'block';

    const top = gastos.slice(0, 6);
    const restoTotal = gastos.slice(6).reduce((s, r) => s + r.total, 0);
    const slices = restoTotal > 0 ? [...top, { cat: 'Otros', total: restoTotal }] : top;
    const total = slices.reduce((s, r) => s + r.total, 0) || 1;

    const R = 70, CX = 80, CY = 80, STROKE = 26;
    const circ = 2 * Math.PI * R;
    let acumulado = 0;
    const arcos = slices.map((s, i) => {
      const frac = s.total / total;
      const dash = frac * circ;
      const offset = -acumulado * circ;
      acumulado += frac;
      return `<circle cx="${CX}" cy="${CY}" r="${R}" fill="none" stroke="${DONUT_COLORES[i % DONUT_COLORES.length]}" stroke-width="${STROKE}" stroke-dasharray="${dash.toFixed(1)} ${(circ - dash).toFixed(1)}" stroke-dashoffset="${offset.toFixed(1)}" transform="rotate(-90 ${CX} ${CY})"><title>${escapeHtml(s.cat)}: ${fmt(s.total)}</title></circle>`;
    }).join('');

    svgCont.innerHTML = `<svg viewBox="0 0 160 160" width="160" height="160">${arcos}<text x="${CX}" y="${CY + 4}" text-anchor="middle" font-family="'IBM Plex Mono',monospace" font-size="12" font-weight="600" fill="var(--ink)">${fmt(total).replace('.00','')}</text></svg>`;

    legendCont.innerHTML = slices.map((s, i) => `
      <div class="gc-donut-leg-item">
        <span class="sw" style="background:${DONUT_COLORES[i % DONUT_COLORES.length]};"></span>
        <span>${escapeHtml(s.cat)}</span>
        <span class="val">${fmt(s.total)}</span>
      </div>
    `).join('');
  }

  // ---- Filtros rápidos (un toque) ----
  function bqMarcar() {
    const d = $('b-desde').value, h = $('b-hasta').value, t = $('b-tipo').value;
    const r = bqRango();
    document.querySelectorAll('#bq-chips [data-bq]').forEach((b) => {
      const k = b.dataset.bq; const x = r[k];
      b.classList.toggle('on', k === 'todo' ? false : !!(x && x[0] === d && x[1] === h));
    });
    document.querySelectorAll('#bq-chips [data-bqt]').forEach((b) => b.classList.toggle('on', t === b.dataset.bqt));
  }
  function bqRango() {
    const hoy = new Date(); hoy.setHours(12, 0, 0, 0);
    const f = ghFechaLocal;
    const lun = new Date(hoy); lun.setDate(hoy.getDate() - ((hoy.getDay() + 6) % 7));
    const dom = new Date(lun); dom.setDate(lun.getDate() + 6);
    const y = hoy.getFullYear(), m = hoy.getMonth();
    return {
      hoy: [f(hoy), f(hoy)], semana: [f(lun), f(dom)],
      mes: [f(new Date(y, m, 1)), f(new Date(y, m + 1, 0))],
      mespasado: [f(new Date(y, m - 1, 1)), f(new Date(y, m, 0))],
      '30': [f(new Date(hoy.getTime() - 29 * 86400000)), f(hoy)],
      anio: [f(new Date(y, 0, 1)), f(new Date(y, 11, 31))]
    };
  }
  document.querySelectorAll('#bq-chips [data-bq]').forEach((b) => b.addEventListener('click', () => {
    const k = b.dataset.bq;
    if (k === 'todo') { $('b-desde').value = ''; $('b-hasta').value = ''; $('b-tipo').value = 'todos'; }
    else { const [d, h] = bqRango()[k]; $('b-desde').value = d; $('b-hasta').value = h; }
    renderBusqueda(); bqMarcar();
  }));
  document.querySelectorAll('#bq-chips [data-bqt]').forEach((b) => b.addEventListener('click', () => {
    $('b-tipo').value = $('b-tipo').value === b.dataset.bqt ? 'todos' : b.dataset.bqt;
    renderBusqueda(); bqMarcar();
  }));
  ['b-desde', 'b-hasta', 'b-tipo'].forEach((id) => { if ($(id)) $(id).addEventListener('change', bqMarcar); });

  $('b-texto').addEventListener('input', debounce(renderBusqueda, 160));
  $('b-anio').addEventListener('change', renderBusqueda);
  if ($('b-desde')) $('b-desde').addEventListener('change', renderBusqueda);
  if ($('b-hasta')) $('b-hasta').addEventListener('change', renderBusqueda);
  if ($('b-tipo')) $('b-tipo').addEventListener('change', renderBusqueda);
  if ($('b-min')) $('b-min').addEventListener('input', debounce(renderBusqueda, 200));
  if ($('b-max')) $('b-max').addEventListener('input', debounce(renderBusqueda, 200));
  if ($('b-orden')) $('b-orden').addEventListener('change', renderBusqueda);
  if ($('b-limpiar-fechas')) {
    $('b-limpiar-fechas').addEventListener('click', () => {
      $('b-desde').value = '';
      $('b-hasta').value = '';
      renderBusqueda();
    });
  }
  if ($('b-limpiar-todo')) {
    $('b-limpiar-todo').addEventListener('click', () => {
      ['b-texto', 'b-desde', 'b-hasta', 'b-min', 'b-max'].forEach((id) => { if ($(id)) $(id).value = ''; });
      if ($('b-tipo')) $('b-tipo').value = 'todos';
      if ($('b-anio')) $('b-anio').value = 'todos';
      if ($('b-orden')) $('b-orden').value = 'fecha-desc';
      renderBusqueda();
      toast('Filtros limpiados', 'info', 1500);
    });
  }
  if ($('b-exportar')) {
    $('b-exportar').addEventListener('click', () => {
      if (!ghUltimaBusqueda.length) { toast('No hay resultados para exportar', 'info'); return; }
      const filas = [['Fecha', 'Tipo', 'Categoría', 'Descripción', 'Monto', 'Deducible']];
      ghUltimaBusqueda.forEach((m) => filas.push([
        m.fecha || '',
        m.tipo === 'ingreso' ? 'Ingreso' : m.tipo === 'ajuste' ? 'Ajuste' : 'Gasto',
        m.cat || '', m.desc || '', String(Number(m.monto) || 0),
        m.tipo === 'gasto' ? (m.deducible ? 'Sí' : 'No') : ''
      ]));
      const csv = filas.map((f) => f.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n');
      const a = document.createElement('a');
      a.href = URL.createObjectURL(new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8;' }));
      a.download = `busqueda-${today()}.csv`;
      a.click(); URL.revokeObjectURL(a.href);
      toast(`${ghUltimaBusqueda.length} resultado(s) exportado(s) ✓`);
    });
  }
  document.getElementById('taxas-anio-filtro').addEventListener('change', () => { renderResumenTaxas(); renderTotalPorSocio(); });

  // ---- Vista previa como hoja impresa ----
  // "Semana del lunes 28 de septiembre al viernes 2 de octubre" -> "28 sep – 2 oct"
  const INV_MESES_CORTOS = { enero:'ene', febrero:'feb', marzo:'mar', abril:'abr', mayo:'may', junio:'jun', julio:'jul', agosto:'ago', septiembre:'sep', setiembre:'sep', octubre:'oct', noviembre:'nov', diciembre:'dic' };
  function invRangoCorto(label) {
    const m = /(\d{1,2}) de ([a-záéíóú]+)(?: de \d{4})? al \w+ (\d{1,2}) de ([a-záéíóú]+)/i.exec(label || '');
    if (!m) return '';
    const mes = (x) => INV_MESES_CORTOS[String(x).toLowerCase()] || String(x).slice(0, 3).toLowerCase();
    return `${m[1]} ${mes(m[2])} – ${m[3]} ${mes(m[4])}`;
  }

  // Reparto de un invoice guardado, normalizado: lo usan el detalle en pantalla y
  // el documento que se imprime/envía, así los dos siempre dicen lo mismo.
  function invPagosNormalizados(inv) {
    if (Array.isArray(inv.pagos) && inv.pagos.length) {
          // Invoices guardados cuando la empresa estaba también en la lista de
          // socios traen el mismo nombre dos veces con la mitad cada uno. Se
          // juntan en una sola línea con el monto completo.
          const porNombre = new Map();
          inv.pagos.forEach((p) => {
            const k = String(p.nombre || '').trim().toLowerCase();
            if (!porNombre.has(k)) { porNombre.set(k, { ...p }); return; }
            const a = porNombre.get(k);
            a.base = (Number(a.base) || 0) + (Number(p.base) || 0);
            a.ajuste = (Number(a.ajuste) || 0) + (Number(p.ajuste) || 0);
            a.bono = (Number(a.bono) || 0) + (Number(p.bono) || 0);
            a.total = (Number(a.total) || 0) + (Number(p.total) || 0);
          });
          return [...porNombre.values()];
    }
          // Invoices guardados antes de que existiera la lista de pagos: se
          // reconstruye. La empresa SIEMPRE sale (una sola vez); el socio
          // solo si esa semana de verdad le tocó algo — así, cuando hay un
          // único dueño, no se repite el mismo nombre dos veces.
          const arr = [{
            nombre: cfgFacturaNombre || 'Empresa',
            base: inv.mitad != null ? inv.mitad : inv.neto,
            ajuste: inv.ajusteGuzman || 0, bono: 0, bonoPct: null,
            total: inv.pagoGuzman != null ? inv.pagoGuzman : inv.neto
          }];
          const claveEmp = (cfgFacturaNombre || '').trim().toLowerCase();
          const socioReal = (cfgSocios || []).find((x) => x && x.nombre && x.nombre.trim().toLowerCase() !== claveEmp);
          // Si ese socio ya no está en la lista (se quitó después), el pago
          // que se le registró en esa semana igual debe verse: se muestra con
          // su nombre de antes si se conoce, o simplemente como "Socio".
          const aliasSocio = String(cfgSocioBonus || '').trim();
          const aliasUtil = aliasSocio && aliasSocio.toLowerCase() !== claveEmp && !/^socio \d+$/i.test(aliasSocio) ? aliasSocio : '';
          const nombreSocio = (socioReal && socioReal.nombre) || aliasUtil || 'Socio';
          if (Number(inv.pagoCra) > 0) {
            arr.push({ nombre: nombreSocio, base: inv.mitad, ajuste: 0, bono: inv.bonoCra || 0, bonoPct: null, total: inv.pagoCra });
          }
          return arr;
  }

  function construirHTMLInvoice(inv) {
    const filasGasto = (inv.gastoItems || []).length
      ? inv.gastoItems.map((m) => `
          <tr><td>${invFechaNum(m.fecha)}</td><td>${escapeHtml(m.cat || '')}</td><td>${escapeHtml(m.desc || '')}</td><td class="num">${fmt(m.monto)}</td></tr>
        `).join('')
      : `<tr><td colspan="4" style="color:#777; font-style:italic;">Sin gastos capturados esta semana</td></tr>`;

    const guardadoNum = inv.guardadoEn
      ? (() => { const d = new Date(inv.guardadoEn);
          return `${String(d.getMonth()+1).padStart(2,'0')}/${String(d.getDate()).padStart(2,'0')}/${d.getFullYear()}`; })()
      : '';
    return `
      <h1>${cfgFacturaNombre}</h1>
      ${cfgFacturaDireccion ? `<div class="ps-addr">${escapeHtml(cfgFacturaDireccion)}</div>` : ''}
      <div class="ps-badge">${escapeHtml(inv.label || '')}${guardadoNum ? ' · guardado el ' + guardadoNum : ''}</div>

      <h2>Detalle de gastos</h2>
      <table>
        <thead><tr><th data-i18n="fecha">Fecha</th><th data-i18n="categoria">Categoría</th><th data-i18n="descripcion">Descripción</th><th class="num" data-i18n="h_monto">Monto</th></tr></thead>
        <tbody>${filasGasto}</tbody>
        <tfoot>
          <tr><td colspan="3">Subtotal gastos</td><td class="num">${fmt(inv.gastos)}</td></tr>
          <tr class="ps-tax"><td colspan="3">Taxas (10% de ingresos)</td><td class="num">${fmt(inv.taxas)}</td></tr>
          <tr class="ps-total"><td colspan="3">Total gastos</td><td class="num">${fmt(inv.gastosTotales)}</td></tr>
        </tfoot>
      </table>

      <h2>Resumen de la semana</h2>
      <table>
        <tbody>
          <tr><td>Ingresos</td><td class="num">${fmt(inv.ingresos)}</td></tr>
          <tr><td>Total gastos (incluye taxas)</td><td class="num">${fmt(inv.gastosTotales)}</td></tr>
          <tr><td>Neto a repartir</td><td class="num">${fmt(inv.neto)}</td></tr>
          ${inv.ajusteGuzman ? `<tr><td>Ajuste ${inv.ajusteGuzman > 0 ? '(+)' : '(−)'}</td><td class="num">${fmt(inv.ajusteGuzman)}</td></tr>` : ''}
          <tr><td>Taxas restantes (después de tax)</td><td class="num">${fmt(inv.taxGuzman)}</td></tr>
        </tbody>
      </table>

      <h2>Reparto</h2>
      <div class="ps-split">
        ${invPagosNormalizados(inv).map((p) => `
          <div class="ps-split-box">
            <div class="ps-name">${escapeHtml(p.nombre)}</div>
            <div class="ps-total">${fmt(p.total)}</div>
            <div class="ps-note">parte ${fmt(p.base)}${p.bono ? ` + tax${p.bonoPct != null ? ' ' + p.bonoPct + '%' : ''} (${fmt(p.bono)})` : ''}${p.ajuste ? ` + ajuste ${fmt(p.ajuste)}` : ''}</div>
          </div>`).join('')}
      </div>
    `;
  }

  // Vista en pantalla del invoice guardado (el documento que se imprime, se envía
  // o se descarga sigue saliendo de construirHTMLInvoice, sin cambios).
  function construirVistaInvoicePantalla(inv) {
    const fmtOpc = (v) => (v == null || v === '' || isNaN(Number(v))) ? '—' : fmt(v);
    const dG = inv.guardadoEn ? new Date(inv.guardadoEn) : null;
    const guardadoNum = dG && !isNaN(dG)
      ? `${String(dG.getMonth() + 1).padStart(2, '0')}/${String(dG.getDate()).padStart(2, '0')}/${dG.getFullYear()}` : '';
    const rango = invRangoCorto(inv.label);
    const gastos = Array.isArray(inv.gastoItems) ? inv.gastoItems : [];
    const filasGasto = gastos.length ? gastos.map((m) => `
        <div class="iv-row">
          <div class="iv-row-l"><b>${escapeHtml(m.desc || m.cat || '—')}</b><span>${invFechaNum(m.fecha)}${m.cat && m.desc ? ' · ' + escapeHtml(m.cat) : ''}</span></div>
          <div class="iv-row-v">${fmt(m.monto)}</div>
        </div>`).join('') : '<div class="iv-vacio">Sin gastos capturados esta semana</div>';
    const pagos = invPagosNormalizados(inv).map((p, k) => `
        <div class="iv-pay c${k % 4}">
          <div class="iv-pay-n">${escapeHtml(p.nombre || '—')}</div>
          <div class="iv-pay-v">${fmtOpc(p.total)}</div>
          <div class="iv-pay-note">parte ${fmt(p.base)}${p.bono ? ` + tax${p.bonoPct != null ? ' ' + p.bonoPct + '%' : ''} (${fmt(p.bono)})` : ''}${p.ajuste ? ` + ajuste ${fmt(p.ajuste)}` : ''}</div>
        </div>`).join('');
    return `
      <div class="iv">
        <div class="iv-hero">
          <div class="iv-hero-top">
            <div>
              <div class="iv-co">${escapeHtml(cfgFacturaNombre || '')}</div>
              ${cfgFacturaDireccion ? `<div class="iv-addr">${escapeHtml(cfgFacturaDireccion)}</div>` : ''}
            </div>
            <span class="iv-chip">Invoice</span>
          </div>
          <div class="iv-week">${escapeHtml(rango || inv.label || '')}</div>
          <div class="iv-sub">${escapeHtml(inv.label || '')}${guardadoNum ? ' · guardado el ' + guardadoNum : ''}</div>
          <div class="iv-kpis">
            <div class="iv-kpi"><span>Ingresos</span><b>${fmtOpc(inv.ingresos)}</b></div>
            <div class="iv-kpi"><span>Gastos</span><b class="gas">${fmtOpc(inv.gastosTotales)}</b></div>
            <div class="iv-kpi"><span>Neto</span><b>${fmtOpc(inv.neto)}</b></div>
          </div>
        </div>

        <div class="iv-sec">
          <div class="iv-h">Reparto</div>
          <div class="iv-pays">${pagos || '<div class="iv-vacio">Sin reparto guardado</div>'}</div>
        </div>

        <div class="iv-sec">
          <div class="iv-h">Detalle de gastos</div>
          ${filasGasto}
          <div class="iv-tot"><span>Subtotal gastos</span><b>${fmt(inv.gastos)}</b></div>
          <div class="iv-tot"><span>Taxas (10% de ingresos)</span><b>${fmt(inv.taxas)}</b></div>
          <div class="iv-tot fuerte"><span>Total gastos</span><b>${fmt(inv.gastosTotales)}</b></div>
        </div>

        <div class="iv-sec">
          <div class="iv-h">Resumen de la semana</div>
          <div class="iv-tot"><span>Ingresos</span><b>${fmt(inv.ingresos)}</b></div>
          <div class="iv-tot"><span>Total gastos (incluye taxas)</span><b>${fmt(inv.gastosTotales)}</b></div>
          <div class="iv-tot"><span>Neto a repartir</span><b>${fmt(inv.neto)}</b></div>
          ${inv.ajusteGuzman ? `<div class="iv-tot"><span>Ajuste ${inv.ajusteGuzman > 0 ? '(+)' : '(−)'}</span><b>${fmt(inv.ajusteGuzman)}</b></div>` : ''}
          <div class="iv-tot"><span>Taxas restantes (después de tax)</span><b>${fmt(inv.taxGuzman)}</b></div>
        </div>
      </div>`;
  }

  let invoiceEnVista = null;

  function mostrarVistaImpresion(inv) {
    invoiceEnVista = inv;
    const sheet = $('modal-print-sheet');
    const overlay = $('modal-print');
    sheet.innerHTML = '';
    overlay.style.display = 'flex';
    // Fuerza a Safari/iOS a redibujar antes de meter el contenido — en la app
    // instalada a veces se queda en blanco si se cambia todo de un jalón.
    void overlay.offsetHeight;
    requestAnimationFrame(() => {
      // Se ve igual que la hoja impresa: el mismo documento dentro de un marco.
      sheet.classList.remove('iv-sheet');
      const frame = document.createElement('iframe');
      frame.title = 'Invoice';
      frame.style.cssText = 'display:block;width:100%;min-height:600px;border:0;background:#fff;border-radius:6px;';
      const ajustarAlto = () => {
        try { const d = frame.contentWindow.document; frame.style.height = (Math.max(d.body.scrollHeight, d.documentElement.scrollHeight) + 8) + 'px'; } catch (e) {}
      };
      frame.addEventListener('load', () => { ajustarAlto(); setTimeout(ajustarAlto, 300); });
      try { frame.srcdoc = ghDocImpresion(construirHTMLInvoice(inv), 'Invoice ' + (inv.label || '')); sheet.appendChild(frame); }
      catch (e) {
        try { const v = construirVistaInvoicePantalla(inv); sheet.classList.add('iv-sheet'); sheet.innerHTML = v; }
        catch (e2) { sheet.innerHTML = construirHTMLInvoice(inv); }
      }
    });
  }

  // (Ya no se usa directamente — se dejó por compatibilidad. Redirige al
  //  método que sí funciona en el iPhone instalado.)
  function imprimirContenido(htmlCuerpo, titulo) {
    ghImprimirEnVentana(htmlCuerpo, titulo);
  }

  function ghConstruirHTMLDescargaReparto() {
    const cuerpo = construirHTMLInvoice(invoiceEnVista);
    return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Invoice - ${escapeHtml(invoiceEnVista.label || '')}</title>
      <style>
        body { font-family: Arial, Helvetica, sans-serif; color: #1a1a1a; padding: 32px; max-width: 780px; margin: 0 auto; }
        h1 { font-size: 21px; margin: 0; }
        .ps-addr { font-size: 12px; color: #555; margin: 4px 0 4px; }
        .ps-badge { font-size: 11px; color: #555; margin-bottom: 20px; }
        h2 { font-size: 13.5px; text-transform: uppercase; letter-spacing: 0.5px; color: #1B2A4A; border-bottom: 1px solid #1B2A4A; padding-bottom: 4px; margin: 26px 0 8px; }
        table { width: 100%; border-collapse: collapse; font-size: 12.5px; }
        th { text-align: left; border-bottom: 1.5px solid #1a1a1a; padding: 6px 4px; font-size: 10.5px; text-transform: uppercase; }
        .num { text-align: right; }
        td { padding: 6px 4px; border-bottom: 1px solid #ccc; }
        tfoot td { padding: 7px 4px; font-weight: 600; }
        tfoot tr.ps-tax td { border-top: 1px solid #1a1a1a; }
        tfoot tr.ps-total td { border-top: 2px solid #1a1a1a; font-size: 14px; }
        .ps-split { display: grid; grid-template-columns: 1fr 1fr; gap: 24px; margin-top: 10px; }
        .ps-split-box { border: 1.5px solid #1a1a1a; padding: 14px; }
        .ps-split-box .ps-name { font-weight: 700; font-size: 13px; margin-bottom: 6px; }
        .ps-split-box .ps-total { font-size: 19px; font-weight: 700; }
        .ps-split-box .ps-note { font-size: 11px; color: #555; margin-top: 4px; }
        .tip { font-size: 11px; color: #888; margin-bottom: 12px; }
        @media print { .tip { display: none; } }
      </style></head>
      <body><div class="tip">Presiona Ctrl+P (o Cmd+P en Mac) para imprimir.</div>${cuerpo}</body></html>`;
  }

  $('btn-imprimir-modal').addEventListener('click', () => {
    if (!invoiceEnVista) return;
    ghImprimirEnVentana(construirHTMLInvoice(invoiceEnVista), `Invoice ${invoiceEnVista.label || ''}`);
  });

  $('btn-enviar-desde-modal').addEventListener('click', async () => {
    if (!invoiceEnVista) return;
    const html = ghConstruirHTMLDescargaReparto();
    const nombreArchivo = `invoice-${(invoiceEnVista.key || 'semana')}.html`;
    const resumen = `Invoice ${invoiceEnVista.label || ''}`;
    try {
      const archivo = new File([html], nombreArchivo, { type: 'text/html' });
      if (navigator.canShare && navigator.canShare({ files: [archivo] })) {
        await navigator.share({ files: [archivo], title: resumen, text: resumen });
        return;
      }
    } catch (e) {
      if (e && e.name === 'AbortError') return;
    }
    if (navigator.share) {
      try { await navigator.share({ title: resumen, text: resumen }); }
      catch (e) { if (!e || e.name !== 'AbortError') toast('No se pudo abrir para compartir — usa Descargar.', 'error'); }
    } else {
      toast('Este navegador no soporta compartir directo — usa el botón Descargar.', 'info');
    }
  });

  // Resumen del invoice en texto, listo para pegar en WhatsApp o en un correo
  function ghTextoInvoice(inv) {
    const L = [];
    L.push(`*${cfgFacturaNombre || 'Invoice'}*`);
    L.push(`Invoice ${inv.label || ''}`);
    L.push('');
    L.push(`Ingresos: ${fmt(inv.ingresos)}`);
    L.push(`Gastos (con taxas): ${fmt(inv.gastosTotales)}`);
    L.push(`Neto a repartir: ${fmt(inv.neto)}`);
    const pagos = invPagosNormalizados(inv);
    if (pagos.length) {
      L.push(''); L.push('Reparto:');
      pagos.forEach((p) => L.push(`• ${p.nombre}: ${fmt(p.total)}`));
    }
    return L.join('\n');
  }
  function ghAbrirEnlace(url) {
    const a = document.createElement('a');
    a.href = url; a.target = '_blank'; a.rel = 'noopener';
    document.body.appendChild(a); a.click(); a.remove();
  }
  $('btn-wa-modal').addEventListener('click', () => {
    if (!invoiceEnVista) return;
    ghAbrirEnlace('https://wa.me/?text=' + encodeURIComponent(ghTextoInvoice(invoiceEnVista)));
  });
  $('btn-correo-modal').addEventListener('click', () => {
    if (!invoiceEnVista) return;
    const asunto = `${cfgFacturaNombre || 'Invoice'} — Invoice ${invoiceEnVista.label || ''}`;
    window.location.href = 'mailto:?subject=' + encodeURIComponent(asunto) + '&body=' + encodeURIComponent(ghTextoInvoice(invoiceEnVista).replace(/\*/g, ''));
  });

  $('btn-cerrar-modal').addEventListener('click', () => {
    $('modal-print').style.display = 'none';
    invoiceEnVista = null;
  });
  $('modal-print').addEventListener('click', (e) => {
    if (e.target.id === 'modal-print') { $('modal-print').style.display = 'none'; invoiceEnVista = null; }
  });

  $('btn-descargar-desde-modal').addEventListener('click', () => {
    if (!invoiceEnVista) return;
    const html = ghConstruirHTMLDescargaReparto();
    const blob = new Blob([html], { type: 'text/html;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `invoice-${(invoiceEnVista.key || 'semana')}.html`; a.click();
    URL.revokeObjectURL(url);
  });

  // ---- Imprimir (descarga archivo, no abre ventana) ----
  $('btn-imprimir').addEventListener('click', () => {
    const sorted = [...movimientos].sort((a, b) => (a.fecha || '').localeCompare(b.fecha || '') || String(a.id).localeCompare(String(b.id)));
    const grupos = new Map();
    sorted.forEach((m) => {
      const { key, label } = weekInfo(m.fecha || today());
      if (!grupos.has(key)) grupos.set(key, { label, items: [] });
      grupos.get(key).items.push(m);
    });

    let filasMov = '';
    [...grupos.keys()].sort().forEach((key) => {
      const g = grupos.get(key);
      filasMov += `<tr><td colspan="5" style="background:#EFE4D2;font-weight:700;padding:6px;border-top:1px solid #B8935F;border-bottom:1px solid #B8935F;">${escapeHtml(g.label)}</td></tr>`;
      g.items.forEach((m) => {
        filasMov += `<tr>
          <td style="padding:6px;border-bottom:1px solid #ddd;">${m.fecha || ''}</td>
          <td style="padding:6px;border-bottom:1px solid #ddd;">${m.tipo === 'ingreso' ? 'Ingreso' : (m.tipo === 'ajuste' ? ('Ajuste ' + (m.ajusteDir === 'restar' ? '−' : '+') + (m.ajusteSocioNombre ? ' ' + escapeHtml(m.ajusteSocioNombre) : '')) : 'Gasto')}</td>
          <td style="padding:6px;border-bottom:1px solid #ddd;">${escapeHtml(m.cat || '')}</td>
          <td style="padding:6px;border-bottom:1px solid #ddd;">${escapeHtml(m.desc || '')}</td>
          <td style="padding:6px;border-bottom:1px solid #ddd;text-align:right;">${fmt(m.monto)}</td>
        </tr>`;
      });
    });

    // Reparto: una columna por cada quien entra (la empresa y, si hay, cada
    // socio). Sin socios solo sale la empresa y su tax.
    const semanas = calcularSemanas();
    const nombreEmp = (cfgFacturaNombre || 'Empresa').trim();
    const colsReparto = [];
    semanas.forEach((s) => (s.pagos || []).forEach((p) => { if (!colsReparto.some((c) => c.id === p.id)) colsReparto.push({ id: p.id, nombre: p.nombre }); }));
    if (!colsReparto.length) colsReparto.push({ id: 'empresa', nombre: nombreEmp });
    const tdR = 'padding:6px;border-bottom:1px solid #ddd;text-align:right;';
    const thR = 'text-align:right;border-bottom:2px solid #1B2A4A;padding:6px;font-size:10px;text-transform:uppercase;';
    let filasReparto = '';
    semanas.forEach((s) => {
      const celdas = colsReparto.map((c) => {
        const p = (s.pagos || []).find((x) => x.id === c.id);
        return `<td style="${tdR}">${p ? fmt(p.total) : '—'}</td>`;
      }).join('');
      filasReparto += `<tr>
        <td style="padding:6px;border-bottom:1px solid #ddd;">${escapeHtml(s.label)}</td>
        <td style="${tdR}">${fmt(s.ingresos)}</td>
        <td style="${tdR}">${fmt(s.gastos)}</td>
        <td style="${tdR}">${fmt(s.taxas)}</td>
        <td style="${tdR}">${fmt(s.neto)}</td>
        ${celdas}
        <td style="${tdR}">${fmt(s.taxGuzman)}</td>
      </tr>`;
    });
    const thSocios = colsReparto.map((c) => `<th style="${thR}">${escapeHtml(c.nombre)}</th>`).join('');
    const totalCols = 6 + colsReparto.length;

    const cuerpoHTML = `
      <div style="font-family:Arial,Helvetica,sans-serif;color:#2A2A2A;">
        <h1 style="font-size:20px;margin:0;">${escapeHtml(nombreEmp)}</h1>
        <h2 style="font-size:14px;margin:20px 0 8px;color:#1B2A4A;">Movimientos</h2>
        <table style="width:100%;border-collapse:collapse;font-size:11.5px;margin-bottom:16px;">
          <thead><tr>
            <th style="text-align:left;border-bottom:2px solid #1B2A4A;padding:6px;font-size:10px;text-transform:uppercase;" data-i18n="fecha">Fecha</th>
            <th style="text-align:left;border-bottom:2px solid #1B2A4A;padding:6px;font-size:10px;text-transform:uppercase;" data-i18n="tipo">Tipo</th>
            <th style="text-align:left;border-bottom:2px solid #1B2A4A;padding:6px;font-size:10px;text-transform:uppercase;" data-i18n="categoria">Categoría</th>
            <th style="text-align:left;border-bottom:2px solid #1B2A4A;padding:6px;font-size:10px;text-transform:uppercase;" data-i18n="descripcion">Descripción</th>
            <th style="text-align:right;border-bottom:2px solid #1B2A4A;padding:6px;font-size:10px;text-transform:uppercase;" data-i18n="h_monto">Monto</th>
          </tr></thead>
          <tbody>${filasMov || '<tr><td colspan="5" style="padding:6px;">Sin movimientos</td></tr>'}</tbody>
        </table>
        <h2 style="font-size:14px;margin:20px 0 8px;color:#1B2A4A;">Reparto semanal</h2>
        <table style="width:100%;border-collapse:collapse;font-size:11.5px;">
          <thead><tr>
            <th style="text-align:left;border-bottom:2px solid #1B2A4A;padding:6px;font-size:10px;text-transform:uppercase;" data-i18n="h_semana">Semana</th>
            <th style="text-align:right;border-bottom:2px solid #1B2A4A;padding:6px;font-size:10px;text-transform:uppercase;" data-i18n="h_ingresos">Ingresos</th>
            <th style="text-align:right;border-bottom:2px solid #1B2A4A;padding:6px;font-size:10px;text-transform:uppercase;" data-i18n="h_gastos">Gastos</th>
            <th style="text-align:right;border-bottom:2px solid #1B2A4A;padding:6px;font-size:10px;text-transform:uppercase;" data-i18n="h_taxas">Taxas</th>
            <th style="text-align:right;border-bottom:2px solid #1B2A4A;padding:6px;font-size:10px;text-transform:uppercase;" data-i18n="h_neto">Neto</th>
            ${thSocios}
            <th style="${thR}">Tax ${escapeHtml(nombreEmp)}</th>
          </tr></thead>
          <tbody>${filasReparto || `<tr><td colspan="${totalCols}" style="padding:6px;">Sin datos</td></tr>`}</tbody>
        </table>
      </div>`;

    // Imprimir directo (no descargar) — usa el método que funciona en iPhone
    ghImprimirEnVentana(cuerpoHTML, 'Registro de movimientos');
  });

  // ---- Respaldo completo (para guardar en OneDrive) ----
  $('btn-descargar-respaldo').addEventListener('click', async () => {
    // Leer datos de todos los módulos EN PARALELO (antes eran 8 lecturas en
    // fila, una tras otra — esto tarda lo mismo que la más lenta, no la suma).
    let empleadosData = [], facturasData = [], coloniasData = [], clientesData = [], trabajosData = [];
    let nominaData = [], trabajadoresData = [], recibosData = [];
    const [rEmp, rFact, rCol, rCli, rTrab, rNom, rTrabj, rRecibos] = await Promise.all([
      window.storage.get('empleados').catch(() => null),
      window.storage.get('gh-invoices').catch(() => null),
      window.storage.get('gh-colonias').catch(() => null),
      window.storage.get('gh-clientes').catch(() => null),
      window.storage.get('gh-trabajos').catch(() => null),
      window.storage.get('gh-nomina').catch(() => null),
      window.storage.get('gh-trabajadores').catch(() => null),
      window.storage.get('gh-recibos-semanales').catch(() => null),
    ]);
    try { empleadosData = JSON.parse(rEmp.value); } catch (e) {}
    try { facturasData = JSON.parse(rFact.value); } catch (e) {}
    try { coloniasData = JSON.parse(rCol.value); } catch (e) {}
    try { clientesData = JSON.parse(rCli.value); } catch (e) {}
    try { trabajosData = JSON.parse(rTrab.value); } catch (e) {}
    try { nominaData = JSON.parse(rNom.value); } catch (e) {}
    try { trabajadoresData = JSON.parse(rTrabj.value); } catch (e) {}
    try { recibosData = JSON.parse(rRecibos.value); } catch (e) {}

    const respaldo = {
      app: 'GH Manager',
      version: 3,
      generadoEn: new Date().toISOString(),
      // Cuentas y reparto
      movimientos,
      catGastos,
      catIngresos,
      invoicesGuardados,
      // Empleados
      empleados: empleadosData,
      // Facturas
      facturas: facturasData,
      colonias: coloniasData,
      clientes: clientesData,
      trabajos: trabajosData,
      // Nómina
      nomina: nominaData,
      trabajadores: trabajadoresData,
      recibosSemanales: recibosData
    };
    const blob = new Blob([JSON.stringify(respaldo, null, 2)], { type: 'application/json;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `respaldo-guzman-hvac-${today()}.json`;
    a.click();
    URL.revokeObjectURL(url);
    $('ultimo-respaldo-info').textContent = 'Último respaldo descargado: ' + new Date().toLocaleString('es-MX', { dateStyle: 'medium', timeStyle: 'short' });
    toast('Respaldo completo descargado ✓', 'success');
  });

  // ---- Trimestre rápido: llena el rango de fechas con un clic (para reportes al contador) ----
  (function () {
    const inputAnio = $('rep-trim-anio');
    if (inputAnio) inputAnio.value = new Date().getFullYear();
    document.querySelectorAll('[data-trim]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const anio = parseInt(inputAnio.value, 10) || new Date().getFullYear();
        const trimestre = parseInt(btn.dataset.trim, 10);
        const mesInicio = (trimestre - 1) * 3;
        const desde = new Date(anio, mesInicio, 1);
        const hasta = new Date(anio, mesInicio + 3, 0);
        $('rep-desde').value = ghFechaLocal(desde);
        $('rep-hasta').value = ghFechaLocal(hasta);
        toast(`Rango puesto: Q${trimestre} ${anio}`, 'info');
      });
    });
  })();

  // ---- Reportes y exportación (Excel + PDF) ----
  // Trae nómina y empleados frescos de storage (por si no se visitaron esas
  // pestañas todavía); movimientos e invoices ya están siempre cargados.
  async function repObtenerDatos() {
    const leer = async (key) => { try { const r = await window.storage.get(key); return JSON.parse(r.value); } catch (e) { return []; } };
    const [nomina, emps] = await Promise.all([leer('gh-nomina'), leer(STORAGE_EMPLEADOS)]);
    const desde = $('rep-desde').value || null;
    const hasta = $('rep-hasta').value || null;
    const enRango = (fecha) => (!desde || fecha >= desde) && (!hasta || fecha <= hasta);
    return {
      movs: movimientos.filter((m) => enRango(m.fecha || '')),
      invs: invoicesGuardados.filter((i) => enRango((i.guardadoEn || '').slice(0, 10))),
      nomina: nomina.filter((n) => enRango((n.creadoEn || '').slice(0, 10))),
      emps, desde, hasta
    };
  }

  // El generador de Excel pesa mucho: se carga solo cuando se usa
  function ghCargarXLSX() {
    if (typeof XLSX !== 'undefined') return Promise.resolve(true);
    if (!window.__ghXlsxP) window.__ghXlsxP = new Promise((res) => {
      const sc = document.createElement('script'); sc.src = 'vendor/xlsx-0.18.5.full.min.js';
      sc.onload = () => res(typeof XLSX !== 'undefined'); sc.onerror = () => { window.__ghXlsxP = null; res(false); };
      document.head.appendChild(sc);
    });
    return window.__ghXlsxP;
  }
  $('btn-reporte-excel').addEventListener('click', async () => {
    await ghCargarXLSX();
    if (typeof XLSX === 'undefined') { toast('No se pudo cargar el generador de Excel. Revisa tu conexión e intenta de nuevo.', 'error', 4000); return; }
    const { movs, invs, nomina, emps } = await repObtenerDatos();
    const wb = XLSX.utils.book_new();

    const hojaMovs = movs.map((m) => ({
      Fecha: m.fecha || '', Tipo: m.tipo === 'ingreso' ? 'Ingreso' : m.tipo === 'gasto' ? 'Gasto' : 'Ajuste',
      Categoría: m.cat || '', Descripción: m.desc || '', Monto: Number(m.monto) || 0,
      Deducible: m.tipo === 'gasto' ? (m.deducible ? 'Sí' : 'No') : ''
    }));
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(hojaMovs), 'Movimientos');

    // Hoja aparte solo con los gastos marcados como deducibles — lista para el contador
    const gastosDeducibles = movs.filter((m) => m.tipo === 'gasto' && m.deducible);
    if (gastosDeducibles.length) {
      const hojaDeducibles = gastosDeducibles.map((m) => ({
        Fecha: m.fecha || '', Categoría: m.cat || '', Descripción: m.desc || '', Monto: Number(m.monto) || 0
      }));
      hojaDeducibles.push({ Fecha: '', Categoría: '', Descripción: 'TOTAL DEDUCIBLE', Monto: gastosDeducibles.reduce((s, m) => s + (Number(m.monto) || 0), 0) });
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(hojaDeducibles), 'Gastos deducibles');
    }

    const hojaInv = invs.map((i) => {
      const fila = {
        Semana: i.label || '', Guardado: (i.guardadoEn || '').slice(0, 10),
        Ingresos: i.ingresos || 0, Gastos: i.gastos || 0, Taxas: i.taxas || 0
      };
      const pagos = Array.isArray(i.pagos) && i.pagos.length ? i.pagos : [{ nombre: cfgSocioBonus, total: i.pagoCra || 0 }, { nombre: cfgSocioMitad, total: i.pagoGuzman || 0 }];
      pagos.forEach((p) => { fila[p.nombre] = p.total; });
      return fila;
    });
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(hojaInv), 'Invoices guardados');

    const hojaNom = nomina.map((n) => ({
      Trabajador: n.trabajador || '', Fecha: (n.creadoEn || '').slice(0, 10),
      'Días trabajados': (n.dias || []).length, 'Sueldo por día': n.sueldoDia || 0,
      Extra: n.extraDesc || '', 'Monto extra': n.extraMonto || 0, 'Monto total': n.monto || 0, Nota: n.nota || ''
    }));
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(hojaNom), 'Nómina');

    const hojaEmp = emps.map((e) => ({
      Nombre: empNombreCompleto(e), Rol: e.rol || '', Estado: e.estado === 'inactivo' ? 'Inactivo' : 'Activo',
      'Sueldo por día': e.sueldo || 0, Teléfono: e.tel || '', Email: e.email || '',
      Dirección: e.direccion || '', 'Fecha de inicio': e.inicio || ''
    }));
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(hojaEmp), 'Empleados');

    // Descargar el Excel. En el iPhone instalado, la descarga directa a veces
    // no hace nada (Safari la bloquea), así que ahí se comparte el archivo por
    // el menú de iOS (donde puedes elegir Guardar en Archivos, Mail, etc.).
    const nombreArchivo = `reporte-guzman-hvac-${today()}.xlsx`;
    if (!movs.length && !invs.length && !nomina.length && !emps.length) {
      toast('No hay datos en ese rango para exportar', 'info', 3500);
      return;
    }
    try {
      if (ghEsStandalone() && navigator.canShare) {
        const wbout = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
        const archivo = new File([wbout], nombreArchivo, { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
        if (navigator.canShare({ files: [archivo] })) {
          await navigator.share({ files: [archivo], title: 'Reporte GH Manager' });
          return;
        }
      }
    } catch (e) {
      if (e && e.name === 'AbortError') return; // el usuario cerró el menú
    }
    // Vía normal (navegador de escritorio o si compartir no está disponible)
    XLSX.writeFile(wb, nombreArchivo);
    toast('Excel descargado ✓', 'success');
  });

  // Resumen de una página para el contador: por trimestre, por categoría y nómina
  $('btn-reporte-contador').addEventListener('click', async () => {
    let { movs, nomina, desde, hasta } = await repObtenerDatos();
    if (!desde && !hasta) { const y = new Date().getFullYear(); desde = y + '-01-01'; hasta = y + '-12-31'; movs = movimientos.filter((m) => (m.fecha || '') >= desde && (m.fecha || '') <= hasta); }
    const suma = (a) => a.reduce((t, m) => t + (Number(m.monto) || 0), 0);
    const ing = movs.filter((m) => m.tipo === 'ingreso'), gas = movs.filter((m) => m.tipo === 'gasto');
    const filasNom = [];
    nomina.forEach((n) => nomExpandirPagos([n]).forEach((f) => { if (f.fecha && (!desde || f.fecha >= desde) && (!hasta || f.fecha <= hasta)) filasNom.push({ t: (n.trabajador || 'Sin nombre').trim(), f: f.fecha, m: f.monto }); }));
    const trimDe = (f) => Math.floor((Number(String(f).slice(5, 7)) - 1) / 3);
    const q = [0, 1, 2, 3].map((i) => ({ ing: suma(ing.filter((m) => trimDe(m.fecha) === i)), gas: suma(gas.filter((m) => trimDe(m.fecha) === i)), nom: filasNom.filter((x) => trimDe(x.f) === i).reduce((t, x) => t + x.m, 0) }));
    const porCat = (arr) => { const mp = new Map(); arr.forEach((m) => { const c = (m.cat || 'Sin categoría').trim() || 'Sin categoría'; mp.set(c, (mp.get(c) || 0) + (Number(m.monto) || 0)); }); return [...mp.entries()].sort((a, b) => b[1] - a[1]); };
    const porTrab = new Map(); filasNom.forEach((x) => porTrab.set(x.t, (porTrab.get(x.t) || 0) + x.m));
    const tI = suma(ing), tG = suma(gas), tN = filasNom.reduce((t, x) => t + x.m, 0);
    const nfNeg = (v) => v < 0 ? '−' + nomFmt(-v) : nomFmt(v);
    const tabla = (titulo, filas, total) => `<h2>${titulo}</h2><table><tbody>${filas.map(([c, v]) => `<tr><td>${escapeHtml(c)}</td><td class="num">${v ? nomFmt(v) : '—'}</td></tr>`).join('') || '<tr><td style="color:#777;">Sin datos.</td><td></td></tr>'}</tbody><tfoot><tr class="ps-total"><td>Total</td><td class="num">${nomFmt(total)}</td></tr></tfoot></table>`;
    const html = `<h1>${escapeHtml(cfgFacturaNombre || 'GUZMAN HVAC')}</h1>
      ${cfgFacturaDireccion ? `<div class="ps-addr">${escapeHtml(cfgFacturaDireccion)}</div>` : ''}
      <div class="ps-badge">Resumen para el contador · ${escapeHtml(desde || '…')} a ${escapeHtml(hasta || '…')}</div>
      <h2>Por trimestre</h2>
      <table><thead><tr><th></th><th class="num">Ingresos</th><th class="num">Gastos</th><th class="num">Nómina</th><th class="num">Neto</th></tr></thead><tbody>
        ${q.map((r, i) => `<tr><td>Q${i + 1}</td><td class="num">${nomFmt(r.ing)}</td><td class="num">${nomFmt(r.gas)}</td><td class="num">${nomFmt(r.nom)}</td><td class="num">${nfNeg(r.ing - r.gas)}</td></tr>`).join('')}
      </tbody><tfoot><tr class="ps-total"><td>Total</td><td class="num">${nomFmt(tI)}</td><td class="num">${nomFmt(tG)}</td><td class="num">${nomFmt(tN)}</td><td class="num">${nfNeg(tI - tG)}</td></tr></tfoot></table>
      ${tabla('Ingresos por categoría', porCat(ing), tI)}
      ${tabla('Gastos por categoría', porCat(gas), tG)}
      ${tabla('Nómina por trabajador', [...porTrab.entries()].sort((a, b) => b[1] - a[1]), tN)}
      <div class="ps-addr" style="margin-top:14px;">Base de datos: ${escapeHtml(cfgFacturaNombre || '')}. Los gastos no incluyen las taxas; la nómina sale de los días registrados.</div>`;
    ghImprimirEnVentana(html, 'Resumen contador');
  });

  $('btn-reporte-pdf').addEventListener('click', async () => {
    const { movs, invs, nomina, emps, desde, hasta } = await repObtenerDatos();
    const totIng = movs.filter((m) => m.tipo === 'ingreso').reduce((s, m) => s + (Number(m.monto) || 0), 0);
    const totGas = movs.filter((m) => m.tipo === 'gasto').reduce((s, m) => s + (Number(m.monto) || 0), 0);
    const totNomina = nomina.reduce((s, n) => s + (Number(n.monto) || 0), 0);
    const activos = emps.filter((e) => e.estado !== 'inactivo');
    const filaMov = (m) => `<tr><td>${escapeHtml(m.fecha || '')}</td><td>${m.tipo === 'ingreso' ? 'Ingreso' : m.tipo === 'gasto' ? 'Gasto' : 'Ajuste'}</td><td>${escapeHtml(m.cat || '')}</td><td>${escapeHtml(m.desc || '')}</td><td style="text-align:right;">${fmt(m.monto)}</td></tr>`;
    const filaInv = (i) => {
      const pagos = Array.isArray(i.pagos) && i.pagos.length ? i.pagos : [{ nombre: cfgSocioBonus, total: i.pagoCra || 0 }, { nombre: cfgSocioMitad, total: i.pagoGuzman || 0 }];
      return `<tr><td>${escapeHtml(i.label || '')}</td><td style="text-align:right;">${fmt(i.ingresos)}</td><td style="text-align:right;">${fmt(i.gastos)}</td>${pagos.map((p) => `<td style="text-align:right;">${fmt(p.total)}</td>`).join('')}</tr>`;
    };
    const filaNom = (n) => `<tr><td>${escapeHtml(n.trabajador || '')}</td><td>${(n.creadoEn || '').slice(0, 10)}</td><td style="text-align:center;">${(n.dias || []).length}</td><td style="text-align:right;">${fmt(n.monto)}</td></tr>`;
    const filaEmp = (e) => `<tr><td>${escapeHtml(empNombreCompleto(e))}</td><td>${escapeHtml(e.rol || '')}</td><td style="text-align:right;">${e.sueldo ? fmt(e.sueldo) + '/día' : '—'}</td></tr>`;
    const rangoTxt = (desde || hasta) ? `${desde || '…'} a ${hasta || '…'}` : 'Todo el historial';

    const html = `
      <div style="font-family:'Inter',sans-serif;color:#131C2E;">
        <div style="border-bottom:2px solid #131C2E;padding-bottom:14px;margin-bottom:18px;">
          <div style="font-family:'Zilla Slab',serif;font-size:22px;font-weight:700;">Reporte — ${escapeHtml(cfgFacturaNombre)}</div>
          <div style="font-size:12px;color:#63708C;">Rango: ${escapeHtml(rangoTxt)} · Generado: ${new Date().toLocaleString('es-MX', { dateStyle: 'medium', timeStyle: 'short' })}</div>
        </div>
        <div style="display:flex;gap:14px;margin-bottom:22px;flex-wrap:wrap;">
          <div style="flex:1;min-width:140px;border:1px solid #DCE3EF;border-radius:10px;padding:12px;"><div style="font-size:10.5px;color:#63708C;text-transform:uppercase;">Ingresos</div><div style="font-size:19px;font-weight:700;color:#0E8F82;">${fmt(totIng)}</div></div>
          <div style="flex:1;min-width:140px;border:1px solid #DCE3EF;border-radius:10px;padding:12px;"><div style="font-size:10.5px;color:#63708C;text-transform:uppercase;">Gastos</div><div style="font-size:19px;font-weight:700;color:#C6551E;">${fmt(totGas)}</div></div>
          <div style="flex:1;min-width:140px;border:1px solid #DCE3EF;border-radius:10px;padding:12px;"><div style="font-size:10.5px;color:#63708C;text-transform:uppercase;">Neto</div><div style="font-size:19px;font-weight:700;">${fmt(totIng - totGas)}</div></div>
          <div style="flex:1;min-width:140px;border:1px solid #DCE3EF;border-radius:10px;padding:12px;"><div style="font-size:10.5px;color:#63708C;text-transform:uppercase;">Nómina pagada</div><div style="font-size:19px;font-weight:700;">${fmt(totNomina)}</div></div>
        </div>

        <div style="font-family:'Zilla Slab',serif;font-size:15px;font-weight:700;margin-bottom:8px;">Invoices guardados (${invs.length})</div>
        <table style="width:100%;border-collapse:collapse;font-size:11.5px;margin-bottom:20px;">
          <thead><tr style="background:#F5F7FC;"><th style="text-align:left;padding:6px;" data-i18n="h_semana">Semana</th><th style="text-align:right;padding:6px;" data-i18n="h_ingresos">Ingresos</th><th style="text-align:right;padding:6px;" data-i18n="h_gastos">Gastos</th>${(cfgSocios && cfgSocios.length ? cfgSocios : [{ nombre: cfgSocioBonus }, { nombre: cfgSocioMitad }]).map((s) => `<th style="text-align:right;padding:6px;">${escapeHtml(s.nombre)}</th>`).join('')}</tr></thead>
          <tbody>${invs.map(filaInv).join('') || `<tr><td colspan="${3 + (cfgSocios && cfgSocios.length ? cfgSocios.length : 2)}" style="padding:8px;color:#63708C;">Sin invoices en este rango.</td></tr>`}</tbody>
        </table>

        <div style="font-family:'Zilla Slab',serif;font-size:15px;font-weight:700;margin-bottom:8px;">Movimientos (${movs.length})</div>
        <table style="width:100%;border-collapse:collapse;font-size:11.5px;margin-bottom:20px;">
          <thead><tr style="background:#F5F7FC;"><th style="text-align:left;padding:6px;" data-i18n="fecha">Fecha</th><th style="text-align:left;padding:6px;" data-i18n="tipo">Tipo</th><th style="text-align:left;padding:6px;" data-i18n="categoria">Categoría</th><th style="text-align:left;padding:6px;" data-i18n="descripcion">Descripción</th><th style="text-align:right;padding:6px;" data-i18n="h_monto">Monto</th></tr></thead>
          <tbody>${movs.map(filaMov).join('') || '<tr><td colspan="5" style="padding:8px;color:#63708C;">Sin movimientos en este rango.</td></tr>'}</tbody>
        </table>

        <div style="font-family:'Zilla Slab',serif;font-size:15px;font-weight:700;margin-bottom:8px;">Nómina (${nomina.length} pagos)</div>
        <table style="width:100%;border-collapse:collapse;font-size:11.5px;margin-bottom:20px;">
          <thead><tr style="background:#F5F7FC;"><th style="text-align:left;padding:6px;" data-i18n="trabajador">Trabajador</th><th style="text-align:left;padding:6px;" data-i18n="fecha">Fecha</th><th style="text-align:center;padding:6px;" data-i18n="h_dias">Días</th><th style="text-align:right;padding:6px;" data-i18n="h_monto">Monto</th></tr></thead>
          <tbody>${nomina.map(filaNom).join('') || '<tr><td colspan="4" style="padding:8px;color:#63708C;">Sin pagos en este rango.</td></tr>'}</tbody>
        </table>

        <div style="font-family:'Zilla Slab',serif;font-size:15px;font-weight:700;margin-bottom:8px;">Empleados activos (${activos.length})</div>
        <table style="width:100%;border-collapse:collapse;font-size:11.5px;">
          <thead><tr style="background:#F5F7FC;"><th style="text-align:left;padding:6px;" data-i18n="h_nombre">Nombre</th><th style="text-align:left;padding:6px;" data-i18n="rol">Rol</th><th style="text-align:right;padding:6px;" data-i18n="h_sueldo">Sueldo</th></tr></thead>
          <tbody>${activos.map(filaEmp).join('') || '<tr><td colspan="3" style="padding:8px;color:#63708C;">Sin empleados activos.</td></tr>'}</tbody>
        </table>
      </div>`;
    ghImprimirEnVentana(html, `Reporte - ${cfgFacturaNombre} - ${today()}`);
  });

  $('input-restaurar-respaldo').addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;
    // Feedback inmediato: si algo falla después de esto, al menos sabemos que
    // el archivo sí se seleccionó y el problema está en la lectura/procesamiento.
    $('status-restaurar').textContent = 'Leyendo "' + file.name + '"…';
    const reader = new FileReader();
    reader.onerror = () => {
      $('status-restaurar').textContent = 'No se pudo leer el archivo (error al abrirlo). Intenta de nuevo o elige otro archivo.';
    };
    reader.onload = async () => {
      try {
        const data = JSON.parse(reader.result);
        if (!data.movimientos && !data.empleados && !data.facturas) {
          $('status-restaurar').textContent = 'Ese archivo no parece ser un respaldo válido de esta app';
          return;
        }
        const confirmar = await gcConfirm('Esto va a reemplazar TODOS los datos actuales (movimientos, invoices, empleados, facturas, colonias, clientes y trabajos) con los del respaldo. ¿Continuar?', { okText: 'Restaurar', danger: true });
        if (!confirmar) { $('status-restaurar').textContent = 'Restauración cancelada.'; $('input-restaurar-respaldo').value = ''; return; }

        // Cuentas y reparto
        movimientos = data.movimientos || [];
        catGastos = data.catGastos || catGastos;
        catIngresos = data.catIngresos || catIngresos;
        invoicesGuardados = data.invoicesGuardados || [];
        await saveMov();
        await saveCatGastos();
        await saveCatIngresos();
        await saveInvoices();

        // Empleados
        if (data.empleados) {
          await window.storage.set('empleados', JSON.stringify(data.empleados));
          try { empleados = data.empleados || []; renderEmpleados(); } catch (e) {}
        }
        // Facturas y sus catálogos
        if (data.facturas) await window.storage.set('gh-invoices', JSON.stringify(data.facturas));
        if (data.colonias) await window.storage.set('gh-colonias', JSON.stringify(data.colonias));
        if (data.clientes) await window.storage.set('gh-clientes', JSON.stringify(data.clientes));
        if (data.trabajos) await window.storage.set('gh-trabajos', JSON.stringify(data.trabajos));
        try {
          if (data.facturas) invDocs = data.facturas;
          if (data.colonias) invColonias = data.colonias;
          if (data.clientes) invClientes = data.clientes;
          if (data.trabajos) invTrabajos = data.trabajos;
          invRefreshDlClientes(); invRefreshDlTrabajos(); invRefreshDlColonias();
        } catch (e) {}
        // Nómina
        if (data.nomina) await window.storage.set('gh-nomina', JSON.stringify(data.nomina));
        if (data.trabajadores) await window.storage.set('gh-trabajadores', JSON.stringify(data.trabajadores));
        if (data.recibosSemanales) await window.storage.set('gh-recibos-semanales', JSON.stringify(data.recibosSemanales));
        try {
          if (data.nomina) nomDocs = data.nomina;
          // Los trabajadores de un respaldo viejo se integran a Empleados (sin duplicar).
          if (data.trabajadores) { await nomMigrarTrabajadoresViejos(data.trabajadores); await saveEmpleados(); }
          nomCargado = true; // ya quedó cargado con lo restaurado; evita que un futuro click lo pise
          nomRefreshDl();
          nomRenderRegLedger(); nomRenderHist(); nomRenderTrabajadores(); nomRenderSemanal();
          if (typeof nomGridAbrirSemana === 'function') nomGridAbrirSemana();
        } catch (e) {}

        renderCategorias();
        renderCatSelect();
        renderMovimientos();
        renderReparto();

        $('status-restaurar').textContent = 'Respaldo restaurado — todos los datos (registro, facturas y nómina) ya están actualizados.';
        toast('Respaldo restaurado ✓ — todo actualizado', 'success', 4000);
        $('input-restaurar-respaldo').value = '';
        // Devolver el foco del teclado a la ventana (Electron lo pierde tras el selector)
        setTimeout(() => { try { window.focus(); document.body.focus(); } catch(e){} }, 60);
      } catch (err) {
        $('status-restaurar').textContent = 'No se pudo leer el archivo: ' + (err && err.message ? err.message : 'error desconocido');
        setTimeout(() => { try { window.focus(); } catch(e){} }, 60);
      }
    };
    reader.readAsText(file);
  });
  // Al abrir el selector de archivos, reforzar el foco al cerrarse
  $('input-restaurar-respaldo').addEventListener('click', () => {
    setTimeout(() => { try { window.focus(); document.body.focus(); } catch(e){} }, 300);
  });

  // ---- Export CSV ----
  $('btn-export').addEventListener('click', () => {
    const sorted = [...movimientos].sort((a, b) => (a.fecha || '').localeCompare(b.fecha || ''));
    let rows = [['Fecha','Tipo','Categoría','Descripción','Monto']];
    sorted.forEach((m) => rows.push([m.fecha, m.tipo, m.cat, m.desc, m.monto]));
    const csv = rows.map((r) => r.map((c) => `"${String(c ?? '').replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'movimientos-guzman-hvac.csv'; a.click();
    URL.revokeObjectURL(url);
  });

// ---- 05-papeles-ajustes.js ----
  // ====================================================================
  // MÓDULO: PAPELES IMPORTANTES
  // ====================================================================
  let papelesFiltroActual = 'Todos';

  function parsearPapel(nombre) {
    // formato: [Categoria] nombre-real.pdf
    const m = nombre.match(/^\[([^\]]+)\]\s*(.+)$/);
    return m ? { cat: m[1], nombre: m[2] } : { cat: 'Otro', nombre };
  }

  async function renderPapeles() {
    const lista = $('papeles-lista');
    const filtros = $('papeles-filtros');
    lista.innerHTML = '';
    filtros.innerHTML = '';

    if (!esElectron) {
      $('papeles-web-note').style.display = '';
      $('btn-subir-papel').style.display = 'none';
      return;
    }

    const archivos = await window.electronAPI.papelesListar();
    const parsed = archivos.map(f => ({ archivo: f, ...parsearPapel(f) }));

    // Categorías que existen
    const cats = ['Todos', ...new Set(parsed.map(p => p.cat))];
    cats.forEach(cat => {
      const btn = document.createElement('button');
      btn.className = 'gc-action-btn';
      btn.style.cssText = 'padding:5px 14px;font-size:12px;' + (cat === papelesFiltroActual ? 'background:var(--ink);color:#fff;' : '');
      btn.textContent = cat;
      btn.addEventListener('click', () => { papelesFiltroActual = cat; renderPapeles(); });
      filtros.appendChild(btn);
    });

    const visibles = papelesFiltroActual === 'Todos' ? parsed : parsed.filter(p => p.cat === papelesFiltroActual);

    if (visibles.length === 0) {
      lista.innerHTML = '<div class="doc-empty" style="padding:40px;text-align:center;color:var(--text-muted);">No hay papeles en esta categoría.<br>Usa "+ Subir PDF" para agregar documentos.</div>';
      return;
    }

    // Agrupar por categoría
    const grupos = {};
    visibles.forEach(p => { if (!grupos[p.cat]) grupos[p.cat] = []; grupos[p.cat].push(p); });

    Object.entries(grupos).forEach(([cat, docs]) => {
      const seccion = document.createElement('div');
      seccion.style.marginBottom = '24px';
      seccion.innerHTML = `<p style="font-family:'Zilla Slab',serif;font-weight:600;font-size:14px;color:var(--ink);margin-bottom:10px;">${cat}</p>`;
      const docList = document.createElement('div');
      docList.className = 'doc-list';
      docs.forEach(p => {
        const item = document.createElement('div');
        item.className = 'doc-item';
        item.innerHTML = `
          <div class="doc-info">
            <div class="doc-name">${escapeHtml(p.nombre)}</div>
            <div class="doc-cat">${escapeHtml(cat)}</div>
          </div>
          <button class="gc-action-btn" data-i18n="abrir" style="padding:4px 12px;font-size:12px;" data-archivo="${escapeHtml(p.archivo)}">Abrir</button>
          <button class="gc-del" data-archivo="${escapeHtml(p.archivo)}">✕</button>
        `;
        item.querySelector('.gc-action-btn').addEventListener('click', async () => {
          await window.electronAPI.papelesAbrir(p.archivo);
        });
        item.querySelector('.gc-del').addEventListener('click', async () => {
          if (!await gcConfirm(`¿Borrar "${p.nombre}"?`, { okText: 'Borrar', danger: true })) return;
          await window.electronAPI.papelesEliminar(p.archivo);
          renderPapeles();
        });
        docList.appendChild(item);
      });
      seccion.appendChild(docList);
      lista.appendChild(seccion);
    });
  }

  // ---- Subida de papeles via <input file> (funciona en Electron y navegador) ----
  const _inputPapel = document.createElement('input');
  _inputPapel.type = 'file'; _inputPapel.accept = '.pdf';
  _inputPapel.style.display = 'none';
  document.body.appendChild(_inputPapel);

  $('btn-subir-papel').addEventListener('click', () => {
    _inputPapel.value = ''; _inputPapel.click();
  });

  _inputPapel.addEventListener('change', async () => {
    const file = _inputPapel.files[0];
    if (!file) return;
    const cat = $('papeles-cat-nueva').value;
    // Quitar caracteres inválidos del nombre antes de enviarlo
    const nombreBase = file.name.replace(/[/\\:*?"<>|]/g, '-');
    const nombreFinal = `[${cat.replace(/[/\\:*?"<>|]/g, '-')}] ${nombreBase}`;
    try {
      const buffer = Array.from(new Uint8Array(await file.arrayBuffer()));
      if (window.electronAPI?.papelesSubirBuffer) {
        await window.electronAPI.papelesSubirBuffer({ nombreArchivo: nombreFinal, buffer });
      } else if (window.electronAPI?.papelesSubir && file.path) {
        await window.electronAPI.papelesSubir({ nombreArchivo: nombreFinal, rutaOrigen: file.path });
      } else {
        toast('Para guardar PDFs en la app usa la app de escritorio (Electron).', 'info', 3500); return;
      }
      papelesFiltroActual = cat;
      renderPapeles();
    } catch(e) { toast('Error al subir: ' + e.message, 'error', 4000); }
  });

  // ---- Sub-pestañas de Ajustes (General, Empleados, Papeles, Categorías) ----
  document.querySelectorAll('.aj-subtab').forEach((tab) => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.aj-subtab').forEach((t) => t.classList.remove('active'));
      document.querySelectorAll('.aj-subpanel').forEach((p) => p.classList.remove('active'));
      tab.classList.add('active');
      const sub = tab.dataset.asub;
      $('aj-sub-' + sub).classList.add('active');
      // Inicializar cada sección al abrirla
      if (sub === 'documentacion') { loadEmpleados().then(() => renderEmpleados()); renderPapeles(); }
      if (sub === 'categorias') { renderCategorias(); }
      if (sub === 'general') { cargarFormAjustes(); }
      if (sub === 'avanzado') { if (typeof cargarFormAjustes === 'function') cargarFormAjustes(); }
    });
  });

  // ---- Sub-pestañas dentro de Documentación (Empleados / Papeles) ----
  document.querySelectorAll('.doc-subtab').forEach((tab) => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.doc-subtab').forEach((t) => t.classList.remove('active'));
      document.querySelectorAll('.doc-subpanel').forEach((p) => p.classList.remove('active'));
      tab.classList.add('active');
      $('doc-sub-' + tab.dataset.dsub).classList.add('active');
      if (tab.dataset.dsub === 'empleados') { loadEmpleados().then(() => renderEmpleados()); }
      if (tab.dataset.dsub === 'papeles') { renderPapeles(); }
    });
  });

  // Solo admin: nombres de socios, y la sub-pestaña Documentación.
  // Se llama al iniciar sesión (para que empleados nunca las vean) y cada
  // vez que se abre Ajustes → General.
  function ajAplicarRestriccionesRol() {
    const esAdminGral = (window.GH_ROL || 'admin') === 'admin';
    const cardSocios = $('aj-card-socios'); if (cardSocios) cardSocios.style.display = esAdminGral ? 'block' : 'none';
    const tabDoc = $('aj-subtab-documentacion'); if (tabDoc) tabDoc.style.display = esAdminGral ? '' : 'none';
    const tabAvanzado = $('aj-subtab-avanzado'); if (tabAvanzado) tabAvanzado.style.display = esAdminGral ? '' : 'none';
    // Payroll (cheques, Zelle/cash, 1099) solo para el admin
    const tabPay = document.querySelector('.gc-tab[data-tab="payroll"]');
    if (tabPay) {
      tabPay.style.display = esAdminGral ? '' : 'none';
      if (!esAdminGral && tabPay.classList.contains('active')) { const t = document.querySelector('.gc-tab[data-tab="movimientos"]'); if (t) t.click(); }
    }
    // Datos de factura: visibles para todos, pero solo el admin puede editarlos
    ['aj-factura-nombre', 'aj-direccion-empresa'].forEach((id) => {
      const el = $(id); if (el) el.disabled = !esAdminGral;
    });
    const btnGuardarFactura = $('aj-btn-guardar-factura'); if (btnGuardarFactura) btnGuardarFactura.style.display = esAdminGral ? '' : 'none';
    const notaFacturaSoloAdmin = $('aj-factura-solo-admin-nota'); if (notaFacturaSoloAdmin) notaFacturaSoloAdmin.style.display = esAdminGral ? 'none' : 'block';
    if (!esAdminGral) {
      // Si por alguna razón quedó activa una sub-pestaña restringida, regresar a General
      const activa = document.querySelector('.aj-subtab.active');
      if (activa && (activa.dataset.asub === 'documentacion' || activa.dataset.asub === 'avanzado')) {
        document.querySelector('.aj-subtab[data-asub="general"]')?.click();
      }
    }
    return esAdminGral;
  }

  // ===================== RESPALDO AUTOMÁTICO (solo admin) =====================
  // Cada 7 días (al abrir la app) se guarda una copia de los datos de la base
  // de datos activa y otra del registro de Payroll, en la nube, sin las fotos.
  // Se conservan las últimas 4 copias de cada una.
  const RB_DIAS = 7, RB_SLOTS = 4;
  const rbEsAdmin = () => (window.GH_ROL || 'admin') === 'admin';
  const rbCuenta = () => (typeof window.GH_GET_CUENTA === 'function' && window.GH_GET_CUENTA()) || 'principal';
  const rbMetaKey = (n) => '__gh-respaldo-meta::' + n;
  const rbDatoKey = (n, slot) => '__gh-respaldo::' + n + '::' + slot;
  async function rbLeerMeta(n) {
    try { const r = await window.storage.get(rbMetaKey(n)); const v = JSON.parse(r.value); return Array.isArray(v) ? v : []; } catch (e) { return []; }
  }
  async function rbJuntarDatos(n) {
    let keys;
    if (n === 'payroll') keys = ['__gh-cheques', '__gh-cheques-cfg', '__gh-1099-info'];
    else {
      const l = await window.storage.list('');
      keys = (l.keys || []).filter((k) => !k.startsWith('__') && !/fotos/i.test(k) && !k.startsWith('gh-cfg-cache'));
    }
    const pares = await Promise.all(keys.map((k) => window.storage.get(k).then((r) => [k, r.value]).catch(() => null)));
    const datos = {}; pares.filter(Boolean).forEach(([k, v]) => { datos[k] = v; });
    return datos;
  }
  async function rbHacer(n) {
    const datos = await rbJuntarDatos(n);
    const cuantos = Object.keys(datos).length;
    if (!cuantos) return null;
    const meta = await rbLeerMeta(n);
    const ult = meta.length ? meta.slice().sort((a, b) => b.fecha.localeCompare(a.fecha))[0] : null;
    const slot = ult ? (ult.slot + 1) % RB_SLOTS : 0;
    const fecha = new Date().toISOString();
    await window.storage.set(rbDatoKey(n, slot), JSON.stringify({ app: 'GH Manager', tipo: 'respaldo-automatico', nombre: n, fecha, datos }));
    const nueva = meta.filter((m) => m.slot !== slot).concat([{ slot, fecha, n: cuantos }]);
    await window.storage.set(rbMetaKey(n), JSON.stringify(nueva));
    return { slot, fecha, n: cuantos };
  }
  async function rbAuto() {
    if (!rbEsAdmin() || window.__rbCorrio) return;
    window.__rbCorrio = true;
    try {
      for (const n of [rbCuenta(), 'payroll']) {
        const meta = await rbLeerMeta(n);
        const ult = meta.length ? meta.map((m) => m.fecha).sort().pop() : null;
        if (!ult || (Date.now() - new Date(ult).getTime()) > RB_DIAS * 86400000) await rbHacer(n);
      }
    } catch (e) {}
  }
  const rbFechaTxt = (iso) => new Date(iso).toLocaleDateString('es-MX', { day: 'numeric', month: 'short', year: 'numeric' });
  async function rbRender() {
    const card = $('rb-card'); if (!card) return;
    card.style.display = rbEsAdmin() ? '' : 'none';
    if (!rbEsAdmin()) return;
    const cuenta = rbCuenta();
    const [mDb, mPay] = await Promise.all([rbLeerMeta(cuenta), rbLeerMeta('payroll')]);
    const ord = (m) => m.slice().sort((a, b) => b.fecha.localeCompare(a.fecha));
    const ultDb = ord(mDb)[0];
    $('rb-estado').innerHTML = ultDb
      ? `Último respaldo de esta base de datos: <b>${rbFechaTxt(ultDb.fecha)}</b> (${ultDb.n} grupos de datos). Se hace solo cada ${RB_DIAS} días.`
      : 'Todavía no hay respaldo de esta base de datos. Se hace solo la próxima vez que abras la app, o dale "Respaldar ahora".';
    const fila = (n, m, restaurar) => `<div class="rb-fila"><span>${rbFechaTxt(m.fecha)}<small>${n === 'payroll' ? 'Payroll (cheques, Zelle, 1099)' : 'Esta base de datos'} · ${m.n} grupos</small></span>
      <span><button type="button" class="gc-action-btn rb-baja" data-n="${escapeHtml(n)}" data-s="${m.slot}">Descargar</button>${restaurar ? `<button type="button" class="gc-action-btn rb-rest" data-n="${escapeHtml(n)}" data-s="${m.slot}">Restaurar</button>` : ''}</span></div>`;
    $('rb-lista').innerHTML = ord(mDb).map((m) => fila(cuenta, m, true)).join('') + ord(mPay).slice(0, 2).map((m) => fila('payroll', m, false)).join('');
    $('rb-lista').querySelectorAll('.rb-baja').forEach((b) => b.addEventListener('click', async () => {
      try {
        const r = await window.storage.get(rbDatoKey(b.dataset.n, b.dataset.s));
        const url = URL.createObjectURL(new Blob([r.value], { type: 'application/json' }));
        const a = document.createElement('a'); a.href = url; a.download = `respaldo-${b.dataset.n}-${ghFechaLocal(new Date())}.json`; document.body.appendChild(a); a.click(); a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 5000);
      } catch (e) { toast('No se pudo descargar ese respaldo', 'error'); }
    }));
    $('rb-lista').querySelectorAll('.rb-rest').forEach((b) => b.addEventListener('click', async () => {
      try {
        const r = await window.storage.get(rbDatoKey(b.dataset.n, b.dataset.s));
        const dato = JSON.parse(r.value);
        if (!await gcConfirm(`¿Restaurar el respaldo del ${rbFechaTxt(dato.fecha)}?\n\nLos datos actuales de esta base de datos se reemplazan por los de ese día. Antes se guarda una copia de los datos de ahora.`, { okText: 'Restaurar', danger: true })) return;
        await rbHacer(rbCuenta());
        for (const [k, v] of Object.entries(dato.datos || {})) await window.storage.set(k, v);
        toast('Respaldo restaurado. Recargando…', 'success', 2500);
        setTimeout(() => location.reload(), 1500);
      } catch (e) { toast('No se pudo restaurar', 'error'); }
    }));
  }
  if ($('rb-ahora')) $('rb-ahora').addEventListener('click', async () => {
    const b = $('rb-ahora'); b.disabled = true; b.textContent = 'Respaldando…';
    try { await rbHacer(rbCuenta()); await rbHacer('payroll'); toast('Respaldo guardado', 'success'); }
    catch (e) { toast('No se pudo guardar el respaldo', 'error'); }
    b.disabled = false; b.textContent = 'Respaldar ahora'; rbRender();
  });
  setTimeout(() => { try { rbAuto(); } catch (e) {} }, 9000);

  // ---- Opciones: nombres de socios + datos de factura (en la nube) ----
  function cargarFormAjustes() {
    ajAplicarRestriccionesRol();
    try { rbRender(); } catch (e) {}
    if (typeof ajRefrescarPreviewLogo === 'function') ajRefrescarPreviewLogo();

    ajSociosEdit = cfgSocios.map((s) => ({ ...s }));
    if ($('aj-tasa-taxas')) $('aj-tasa-taxas').value = String(+(TASA_TAXAS * 100).toFixed(2));
    if (typeof ajRenderSociosLista === 'function') ajRenderSociosLista();
    $('aj-factura-nombre').value = cfgFacturaNombre;
    $('aj-direccion-empresa').value = cfgFacturaDireccion;
    // Casilla: nombre de factura sigue al socio principal
    aplicarFacturaSigueSocio(cfgFacturaSigueSocio);
    ajMostrarPanelesAdmin();
  }

  // Cuenta actual + tarjetas de admin (Bases de datos, Usuarios). Se llama al
  // iniciar sesión (para que no dependa de dar click en algo primero) y cada
  // vez que se abre Ajustes → General.
  function ajMostrarPanelesAdmin() {
    if (typeof window.GH_GET_CUENTA === 'function') {
      $('aj-cuenta-actual').value = 'cargando…';
      ajCargarCuentas().then(() => {
        const actual = window.GH_GET_CUENTA();
        $('aj-cuenta-actual').value = ajNombreDe(actual);
        const esAdmin = (window.GH_ROL || 'admin') === 'admin';
        // Menú para cambiar de base de datos (solo admin)
        $('aj-switch-wrap').style.display = esAdmin ? 'block' : 'none';
        if (esAdmin) ajLlenarSelect($('aj-cuenta-select'), actual);
        // Tarjetas de admin
        const cardBD = $('aj-card-bd'); if (cardBD) cardBD.style.display = esAdmin ? 'block' : 'none';
        const cardAdmin = $('aj-card-admin'); if (cardAdmin) cardAdmin.style.display = (esAdmin && typeof window.GH_LISTAR_USUARIOS === 'function') ? 'block' : 'none';
        if (esAdmin) { ajRenderBD(); if (typeof window.GH_LISTAR_USUARIOS === 'function') ajCargarUsuarios(); }
      });
    } else {
      const wrap = $('aj-card-cuentas'); if (wrap) wrap.style.display = 'none';
    }
  }
  // ---- Lista dinámica de socios (agregar / editar / quitar) ----
  let ajSociosEdit = []; // copia de trabajo mientras se edita, no se guarda hasta dar "Guardar"

  function ajRenderSociosLista() {
    const cont = $('aj-socios-lista');
    if (!cont) return;
    const cabecera = `
      <div style="display:flex;gap:10px;align-items:center;padding:12px 14px;margin-bottom:6px;background:var(--accent-bg);border-radius:var(--r-sm);">
        <div style="flex:1;min-width:0;">
          <div style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.5px;color:var(--muted);">Empresa (recibe los ajustes)</div>
          <div style="font-size:13.5px;font-weight:700;color:var(--ink);">${escapeHtml(cfgFacturaNombre || 'Empresa')}</div>
        </div>
        <div style="font-size:11px;color:var(--muted);text-align:right;">Se cambia arriba,<br>en Name of Company</div>
      </div>`;
    const filas = ajSociosEdit.map((s, i) => `
      <div class="aj-socio-row" data-idx="${i}" style="display:flex;gap:10px;align-items:end;padding:12px 0;${i > 0 ? 'border-top:1px solid var(--border-soft);' : ''}">
        <div class="gc-field" style="flex:2;min-width:0;">
          <label>Socio ${i + 1}</label>
          <input type="text" class="aj-socio-nombre" data-idx="${i}" placeholder="Nombre del socio" value="${escapeHtml(s.nombre)}">
        </div>
        <div class="gc-field" style="flex:0 0 90px;min-width:0;">
          <label data-i18n="tax">Tax %</label>
          <input type="text" inputmode="decimal" class="aj-socio-bonopct" data-idx="${i}" value="${s.bonoPct}">
        </div>
        <button type="button" class="gc-del aj-socio-del" data-idx="${i}" title="Quitar socio">✕</button>
      </div>`).join('');
    const vacio = `<p style="font-size:12.5px;color:var(--muted);padding:10px 0;">Sin socios — la empresa se lleva el 100% de cada semana.</p>`;
    cont.innerHTML = cabecera + (ajSociosEdit.length ? filas : vacio);
    cont.querySelectorAll('.aj-socio-del').forEach((btn) => {
      btn.addEventListener('click', () => {
        ajSociosEdit.splice(Number(btn.dataset.idx), 1);
        ajRenderSociosLista();
      });
    });
  }
  if ($('aj-btn-add-socio')) {
    $('aj-btn-add-socio').addEventListener('click', () => {
      ajSociosEdit.push({ id: 'socio-' + Date.now(), nombre: '', bonoPct: 0 });
      ajRenderSociosLista();
    });
  }

  // Casilla: el nombre de factura/nómina sigue al Socio 2 (o al único socio, si es uno solo)
  function aplicarFacturaSigueSocio(activo) {
    $('aj-factura-nombre-wrap').style.display = activo ? 'none' : 'block';
    if (activo) $('aj-factura-nombre').value = cfgSocioMitad;
  }

  // Guardar socios (nombres + % de bono de cada uno)
  if ($('aj-btn-guardar-socios')) {
    $('aj-btn-guardar-socios').addEventListener('click', async () => {
      const filas = Array.from(document.querySelectorAll('.aj-socio-row'));
      const nuevos = filas.map((fila) => {
        const idx = Number(fila.dataset.idx);
        const nombre = fila.querySelector('.aj-socio-nombre').value.trim();
        const bonoPct = Math.max(0, Math.min(100, parseFloat((fila.querySelector('.aj-socio-bonopct').value || '0').replace(',', '.')) || 0));
        return { id: (ajSociosEdit[idx] && ajSociosEdit[idx].id) || ('socio-' + Date.now() + '-' + idx), nombre, bonoPct };
      });
      if (nuevos.some((s) => !s.nombre)) { toast('Escribe el nombre de todos los socios', 'error'); return; }
      // Tax de la semana (% de los ingresos que se aparta antes de repartir)
      const tasaTxt = ($('aj-tasa-taxas').value || '').replace(',', '.').trim();
      const tasaNum = parseFloat(tasaTxt);
      if (tasaTxt !== '' && (isNaN(tasaNum) || tasaNum < 0 || tasaNum >= 100)) {
        toast('El tax debe ser un número entre 0 y 99', 'error'); return;
      }
      if (tasaTxt !== '') TASA_TAXAS = tasaNum / 100;

      cfgSocios = nuevos;
      actualizarAliasSocios();
      ajSociosEdit = cfgSocios.map((s) => ({ ...s }));
      // Si la factura/nómina sigue al socio principal (2° o único), actualizar su nombre también
      if (cfgFacturaSigueSocio) { cfgFacturaNombre = cfgSocioMitad; if ($('aj-factura-nombre')) $('aj-factura-nombre').value = cfgFacturaNombre; }
      await guardarConfig();
      aplicarNombresEstaticos();
      renderReparto();
      if (typeof renderBusqueda === 'function') renderBusqueda();
      ajRenderSociosLista();
      renderMovimientos();
      toast('Socios y tax guardados ✓', 'success');
    });
  }

  // Guardar datos de factura (nombre + dirección) — en la nube
  // ---- Forzar actualización de la app desde Ajustes ----
  if ($('btn-forzar-actualizacion')) {
    $('btn-forzar-actualizacion').addEventListener('click', async () => {
      const btn = $('btn-forzar-actualizacion');
      const status = $('forzar-act-status');
      if (!('serviceWorker' in navigator)) {
        status.textContent = 'Tu navegador no soporta esto. Cierra la app por completo y ábrela de nuevo.';
        return;
      }
      btn.disabled = true;
      status.textContent = 'Buscando una versión nueva…';
      try {
        const reg = await navigator.serviceWorker.getRegistration();
        if (!reg) {
          status.textContent = 'No se pudo revisar. Cierra la app por completo y ábrela de nuevo.';
          btn.disabled = false;
          return;
        }
        await reg.update();
        // Dar tiempo a que, si hay una versión nueva, termine de instalarse
        // (esto dispara los mismos avisos 'updatefound'/'statechange' de siempre).
        const esperar = (ms) => new Promise((r) => setTimeout(r, ms));
        await esperar(1500);
        if (!reg.waiting && reg.installing) await esperar(1500); // seguía instalando, dar un poco más de tiempo
        if (reg.waiting) {
          status.textContent = 'Encontramos una versión nueva — actualizando…';
          reg.waiting.postMessage('skip-waiting');
          // El listener de controllerchange que ya existe recarga la página solo.
        } else {
          status.textContent = `Ya tienes la versión más reciente (${APP_VERSION}).`;
          btn.disabled = false;
        }
      } catch (e) {
        status.textContent = 'No se pudo revisar la actualización. Intenta de nuevo.';
        btn.disabled = false;
      }
    });
  }

  $('aj-btn-guardar-factura').addEventListener('click', async () => {
    cfgFacturaNombre = $('aj-factura-nombre').value.trim() || cfgFacturaNombre;
    cfgFacturaDireccion = $('aj-direccion-empresa').value.trim();
    await guardarConfig();
    // Reflejar la dirección en el formulario de factura si existe
    const invDir = $('inv-direccion-emisor');
    if (invDir) invDir.value = cfgFacturaDireccion;
    aplicarNombresEstaticos();
    toast('Datos de la empresa guardados ✓', 'success');
  });

  // ---- Bases de datos con nombre + administración (solo admin) ----
  let ajCuentas = []; // [{codigo, nombre}]

  function ajSlug(nombre) {
    return (nombre || '').trim().toLowerCase().replace(/[^a-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '') || ('bd-' + Date.now());
  }
  function ajNombreDe(codigo) {
    const c = ajCuentas.find((x) => x.codigo === codigo);
    if (c) return c.nombre;
    if (codigo === 'principal' && typeof ajPrincipal !== 'undefined') return ajPrincipal.nombre;
    return codigo;
  }

  // La principal ahora también se puede renombrar y quitar de la lista.
  // Su nombre y si está oculta se guardan en la misma lista, como una
  // entrada más con codigo 'principal'. (Sus datos nunca se borran.)
  let ajPrincipal = { codigo: 'principal', nombre: 'Principal (información original)', oculta: false };
  // Se arma la lista nueva aparte y se cambia de una sola vez al final: antes
  // se vaciaba y se llenaba con pausas en medio, y si dos partes de la app la
  // cargaban al mismo tiempo (Ajustes y el selector de Principal) las bases
  // salían repetidas un momento.
  async function ajCargarCuentas() {
    const nuevas = [];
    let guardadas = null;
    try { const r = await window.storage.get('__cuentas_lista'); guardadas = JSON.parse(r.value); } catch (e) {}
    if (!Array.isArray(guardadas)) { try { guardadas = JSON.parse(localStorage.getItem('gh-cuentas-cache') || 'null'); } catch (e) {} }
    else { try { localStorage.setItem('gh-cuentas-cache', JSON.stringify(guardadas)); } catch (e) {} }
    const pr = Array.isArray(guardadas) ? guardadas.find((c) => c && c.codigo === 'principal') : null;
    ajPrincipal = { codigo: 'principal', nombre: (pr && pr.nombre) || 'Principal (información original)', oculta: !!(pr && (pr.oculta || pr.borrada)), borrada: !!(pr && pr.borrada), escondida: !!(pr && pr.escondida) };
    // "escondida" = no sale en el selector de Principal ni en Nómina (sigue existiendo y se ve en Ajustes)
    if (!ajPrincipal.oculta) nuevas.push({ codigo: 'principal', nombre: ajPrincipal.nombre, ...(ajPrincipal.escondida ? { escondida: true } : {}) });
    if (Array.isArray(guardadas)) guardadas.forEach((c) => {
      if (c && c.codigo && c.codigo !== 'principal' && !nuevas.some((x) => x.codigo === c.codigo)) nuevas.push({ codigo: c.codigo, nombre: c.nombre || c.codigo, ...(c.escondida ? { escondida: true } : {}) });
    });
    ajCuentas = nuevas;
    return ajCuentas;
  }
  async function ajGuardarCuentas() {
    const enLista = ajCuentas.find((c) => c.codigo === 'principal');
    if (enLista) { ajPrincipal.nombre = enLista.nombre; ajPrincipal.escondida = !!enLista.escondida; }
    ajPrincipal.oculta = !enLista;
    const vistos = new Set(['principal']);
    const guardar = [{ codigo: 'principal', nombre: ajPrincipal.nombre, oculta: ajPrincipal.oculta || !!ajPrincipal.borrada, ...(ajPrincipal.borrada ? { borrada: true } : {}), ...(ajPrincipal.escondida ? { escondida: true } : {}) },
      ...ajCuentas.filter((c) => c.codigo !== 'principal' && !vistos.has(c.codigo) && vistos.add(c.codigo))];
    await window.storage.set('__cuentas_lista', JSON.stringify(guardar));
    try { localStorage.setItem('gh-cuentas-cache', JSON.stringify(guardar)); } catch (e) {}
  }

  // Rellena un <select> con las bases de datos
  function ajLlenarSelect(sel, seleccionado) {
    if (!sel) return;
    sel.innerHTML = ajCuentas.map((c) => `<option value="${escapeHtml(c.codigo)}"${c.codigo === seleccionado ? ' selected' : ''}>${escapeHtml(c.nombre)}</option>`).join('');
  }

  // Render de la lista de bases de datos (admin)
  function ajRenderBD() {
    const cont = $('aj-bd-lista');
    if (!cont) return;
    const actual = (window.GH_GET_CUENTA && window.GH_GET_CUENTA()) || 'principal';
    cont.innerHTML = ajCuentas.map((c) => `
      <div class="aj-bd-fila" data-codigo="${escapeHtml(c.codigo)}" style="display:flex;justify-content:space-between;align-items:center;gap:10px;padding:8px 0;border-bottom:1px solid var(--border);">
        <div class="aj-bd-nombre" style="flex:1;min-width:0;${c.escondida ? 'opacity:.6;' : ''}"><span style="font-weight:600;">${escapeHtml(c.nombre)}</span> <span style="font-size:11px;color:var(--muted);">(${escapeHtml(c.codigo)})${c.codigo === actual ? ' · <strong style="color:var(--accent-dk);">en uso</strong>' : ''}${c.escondida ? ' · oculta' : ''}</span></div>
        <div style="display:flex;gap:6px;flex-shrink:0;flex-wrap:wrap;justify-content:flex-end;">
          <button type="button" class="gc-action-btn aj-bd-ocultar" data-codigo="${escapeHtml(c.codigo)}" title="${c.escondida ? 'Que vuelva a salir en Principal y en Nómina' : 'Que no salga en Principal ni en Nómina'}" style="padding:4px 10px;font-size:12px;">${c.escondida ? 'Mostrar' : 'Ocultar'}</button>
          <button type="button" class="gc-action-btn aj-bd-ren" data-codigo="${escapeHtml(c.codigo)}" style="padding:4px 10px;font-size:12px;">✎ Nombre</button>
          <button class="gc-del aj-bd-del" data-codigo="${escapeHtml(c.codigo)}">✕</button>
        </div>
      </div>`).join('') + (ajPrincipal.oculta && !ajPrincipal.borrada ? `
      <p style="font-size:11.5px;color:var(--muted);margin-top:10px;">"${escapeHtml(ajPrincipal.nombre)}" está quitada de la lista. <button type="button" class="gc-action-btn" id="aj-bd-reponer" style="padding:3px 10px;font-size:11.5px;">Volver a mostrarla</button></p>` : '');
    // Ocultar / mostrar: la base no se borra, solo deja de salir en Principal y en Nómina
    cont.querySelectorAll('.aj-bd-ocultar').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const cu = ajCuentas.find((c) => c.codigo === btn.dataset.codigo); if (!cu) return;
        if (cu.escondida) delete cu.escondida; else cu.escondida = true;
        try { await ajGuardarCuentas(); } catch (e) { toast('No se pudo guardar', 'error'); return; }
        ajRenderBD();
        try { ghBDHeroPintar(); } catch (e) {}
        toast(cu.escondida ? `"${cu.nombre}" ya no sale en Principal ni en Nómina` : `"${cu.nombre}" vuelve a salir`, 'success');
      });
    });
    // Cambiar el nombre (el código interno no cambia, así los datos siguen en su lugar)
    cont.querySelectorAll('.aj-bd-ren').forEach((btn) => {
      btn.addEventListener('click', () => {
        const fila = btn.closest('.aj-bd-fila'), caja = fila.querySelector('.aj-bd-nombre');
        const cu = ajCuentas.find((c) => c.codigo === btn.dataset.codigo); if (!cu) return;
        caja.innerHTML = `<div style="display:flex;gap:6px;"><input type="text" class="aj-bd-ren-in" value="${escapeHtml(cu.nombre)}" style="flex:1;min-width:0;font-family:'Inter',sans-serif;font-size:13.5px;padding:7px 10px;border:1.5px solid var(--border);border-radius:8px;"><button type="button" class="gc-save-btn aj-bd-ren-ok" style="padding:6px 12px;font-size:12.5px;">Guardar</button></div>`;
        btn.style.display = 'none';
        const inp = caja.querySelector('input'); inp.focus(); inp.select();
        const guardar = async () => {
          const nuevo = inp.value.trim();
          if (!nuevo) { toast('Escribe un nombre', 'error'); return; }
          cu.nombre = nuevo;
          try { await ajGuardarCuentas(); } catch (e) { toast('No se pudo guardar el nombre', 'error'); return; }
          ajRenderBD();
          ajLlenarSelect($('aj-cuenta-select'), window.GH_GET_CUENTA && window.GH_GET_CUENTA());
          if ($('aj-cuenta-actual')) $('aj-cuenta-actual').value = ajNombreDe(window.GH_GET_CUENTA ? window.GH_GET_CUENTA() : 'principal');
          toast('Nombre cambiado ✓', 'success');
        };
        caja.querySelector('.aj-bd-ren-ok').addEventListener('click', guardar);
        inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') guardar(); if (e.key === 'Escape') ajRenderBD(); });
      });
    });
    if ($('aj-bd-reponer')) $('aj-bd-reponer').addEventListener('click', async () => {
      ajCuentas.unshift({ codigo: 'principal', nombre: ajPrincipal.nombre });
      await ajGuardarCuentas(); ajRenderBD();
      ajLlenarSelect($('aj-cuenta-select'), window.GH_GET_CUENTA && window.GH_GET_CUENTA());
      toast('Base de datos de vuelta en la lista ✓', 'success');
    });
    cont.querySelectorAll('.aj-bd-del').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const cod = btn.dataset.codigo;
        if (ajCuentas.length <= 1) { toast('Tiene que quedar al menos una base de datos', 'error'); return; }
        if (cod === actual) {
          // Es la que estás usando: se quita de la lista y te cambias a otra en el mismo paso
          const otra = ajCuentas.find((c) => c.codigo !== cod);
          if (typeof window.GH_SET_CUENTA !== 'function') { toast('Solo funciona con sesión en la nube', 'info'); return; }
          if (!await gcConfirm(`Estás usando "${ajNombreDe(cod)}". ¿Quitarla de la lista y cambiarte a "${otra.nombre}"?\n\nSu información no se borra; la puedes volver a poner en la lista cuando quieras.`, { okText: 'Quitar y cambiar', danger: true })) return;
          ajCuentas = ajCuentas.filter((c) => c.codigo !== cod);
          try { await ajGuardarCuentas(); await window.GH_SET_CUENTA(otra.codigo); }
          catch (e) { toast('No se pudo quitar: ' + ((e && e.message) || e), 'error', 5000); await ajCargarCuentas(); ajRenderBD(); return; }
          toast('Quitada. Cambiando a ' + otra.nombre + '…', 'success');
          setTimeout(() => location.reload(), 700);
          return;
        }
        if (!await gcConfirm(`¿Quitar la base de datos "${ajNombreDe(cod)}" de la lista? La información no se borra, pero dejará de aparecer para elegir o asignar.`, { okText: 'Quitar', danger: true })) return;
        ajCuentas = ajCuentas.filter((c) => c.codigo !== cod);
        await ajGuardarCuentas();
        ajRenderBD();
        ajLlenarSelect($('aj-cuenta-select'), window.GH_GET_CUENTA && window.GH_GET_CUENTA());
        toast('Base de datos quitada de la lista', 'info');
      });
    });
  }

  // Crear una base de datos nueva con nombre
  if ($('aj-btn-add-bd')) {
    $('aj-btn-add-bd').addEventListener('click', async () => {
      const nombre = ($('aj-bd-nueva').value || '').trim();
      if (!nombre) { toast('Escribe un nombre para la base de datos', 'error'); return; }
      const codigo = ajSlug(nombre);
      if (ajCuentas.some((c) => c.codigo === codigo)) { toast('Ya existe una base de datos con ese nombre', 'info'); return; }
      ajCuentas.push({ codigo, nombre });
      try {
        await ajGuardarCuentas();
      } catch (e) {
        ajCuentas = ajCuentas.filter((c) => c.codigo !== codigo); // revertir
        const detalle = (e && (e.message || e.msg)) ? (e.message || e.msg) : String(e);
        toast('No se pudo crear. Puede que tu usuario no sea admin en Supabase. Detalle: ' + detalle, 'error', 6000);
        return;
      }
      $('aj-bd-nueva').value = '';
      ajRenderBD();
      ajLlenarSelect($('aj-cuenta-select'), window.GH_GET_CUENTA && window.GH_GET_CUENTA());
      ajCargarUsuarios();
      toast('Base de datos creada ✓', 'success');
    });
  }

  // Cambiar la base de datos que ve el usuario actual (menú)
  if ($('aj-btn-cambiar-cuenta')) {
    $('aj-btn-cambiar-cuenta').addEventListener('click', async () => {
      if (typeof window.GH_SET_CUENTA !== 'function') { toast('Solo funciona con sesión en la nube', 'info'); return; }
      const codigo = $('aj-cuenta-select').value;
      const actual = window.GH_GET_CUENTA();
      if (codigo === actual) { toast('Ya estás en esa base de datos', 'info'); return; }
      if (!await gcConfirm(`¿Ver la base de datos "${ajNombreDe(codigo)}"?`, { okText: 'Cambiar' })) return;
      await window.GH_SET_CUENTA(codigo);
      toast('Cambiando…', 'success');
      setTimeout(() => location.reload(), 700);
    });
  }

  // ---- Cambiar de base de datos desde Principal (solo admin) ----
  // Usa las mismas piezas que Ajustes → Bases de datos: la lista (ajCuentas),
  // GH_SET_CUENTA y recargar. Para los demás roles el selector queda oculto.
  function ghBDHeroEsAdmin() {
    return typeof window.GH_GET_CUENTA === 'function' && typeof window.GH_SET_CUENTA === 'function' &&
           (window.GH_ROL || 'admin') === 'admin';
  }
  function ghBDHeroPintar() {
    const wrap = $('gh-bd'), sel = $('gh-bd-select');
    if (!wrap || !sel) return;
    if (!ghBDHeroEsAdmin()) { wrap.style.display = 'none'; return; }
    const actual = window.GH_GET_CUENTA();
    const lista = (ajCuentas || []).filter((c) => !c.escondida || c.codigo === actual).map((c) => ({ codigo: c.codigo, nombre: c.nombre }));
    // Si la base actual no está en la lista (p. ej. fue quitada), igual se muestra
    if (!lista.some((c) => c.codigo === actual)) lista.unshift({ codigo: actual, nombre: ajNombreDe(actual) });
    sel.innerHTML = lista.map((c) => `<option value="${escapeHtml(c.codigo)}"${c.codigo === actual ? ' selected' : ''}>${escapeHtml(c.nombre)}</option>`).join('');
    sel.value = actual;
    $('gh-bd-nombre').textContent = ajNombreDe(actual);
    wrap.style.display = 'inline-flex';
    wrap.title = lista.length > 1 ? 'Cambiar de base de datos' : 'Base de datos en uso';
  }
  async function ghBDHeroIniciar() {
    if (!$('gh-bd')) return;
    if (!ghBDHeroEsAdmin()) { $('gh-bd').style.display = 'none'; return; }
    try { await ajCargarCuentas(); } catch (e) {}
    ghBDHeroPintar();
  }
  if ($('gh-bd-select')) {
    $('gh-bd-select').addEventListener('change', async (e) => {
      const sel = e.target;
      const codigo = sel.value;
      const actual = window.GH_GET_CUENTA();
      if (codigo === actual) return;
      if (!await gcConfirm(`¿Cambiar a la base de datos "${ajNombreDe(codigo)}"?`, { okText: 'Cambiar' })) { sel.value = actual; return; }
      try { await window.GH_SET_CUENTA(codigo); }
      catch (err) { sel.value = actual; toast('No se pudo cambiar de base de datos', 'error'); return; }
      toast('Cambiando a ' + ajNombreDe(codigo) + '…', 'success');
      setTimeout(() => location.reload(), 600);
    });
    // Al arrancar: esperar a saber el rol (con login en la nube) y pintar
    if (typeof window.GH_ESPERAR_SESION === 'function') {
      Promise.resolve(window.GH_ESPERAR_SESION()).catch(() => {}).then(ghBDHeroIniciar);
    } else {
      ghBDHeroIniciar();
    }
  }

  async function ajCargarUsuarios() {
    const cont = $('aj-usuarios-lista');
    const msg = $('aj-usuarios-msg');
    if (!cont) return;
    cont.innerHTML = '<p style="font-size:13px;color:var(--muted);">Cargando usuarios…</p>';
    msg.textContent = '';
    if (typeof window.GH_LISTAR_USUARIOS !== 'function') { cont.innerHTML = ''; msg.textContent = 'Solo disponible con sesión en la nube.'; return; }
    let usuarios;
    try { usuarios = await window.GH_LISTAR_USUARIOS(); }
    catch (e) { cont.innerHTML = ''; msg.textContent = 'No se pudo leer la lista de usuarios. Puede que Supabase no permita al admin ver a los demás (hay que ajustar permisos). Detalle: ' + (e.message || e); return; }
    if (!usuarios || usuarios.length === 0) { cont.innerHTML = ''; msg.textContent = 'No hay usuarios para mostrar.'; return; }
    if (usuarios.length === 1) msg.textContent = 'Solo se ve tu propio usuario. Si esperabas ver más, hay que dar permiso en Supabase para que el admin lea todos los perfiles.';
    else msg.textContent = '';

    cont.innerHTML = '';
    usuarios.forEach((u) => {
      // Asegurar que la cuenta del usuario aparezca en el menú aunque no esté en la lista
      const opciones = ajCuentas.slice();
      if (!opciones.some((c) => c.codigo === u.cuenta)) opciones.push({ codigo: u.cuenta, nombre: u.cuenta });
      const optsHtml = opciones.map((c) => `<option value="${escapeHtml(c.codigo)}"${c.codigo === u.cuenta ? ' selected' : ''}>${escapeHtml(c.nombre)}</option>`).join('');
      // Checkboxes de bases de datos permitidas, solo relevante para rol "visor"
      const visorSeleccionadas = new Set(u.cuentasVisor || []);
      const checksHtml = opciones.map((c) => `
        <label style="display:flex;align-items:center;gap:7px;padding:6px 0;font-size:13px;color:var(--ink);cursor:pointer;font-weight:400;">
          <input type="checkbox" class="admin-visor-cuenta-chk" data-id="${u.id}" value="${escapeHtml(c.codigo)}"${visorSeleccionadas.has(c.codigo) ? ' checked' : ''} style="width:15px;height:15px;">
          ${escapeHtml(c.nombre)}
        </label>`).join('');
      const card = document.createElement('div');
      card.className = 'us-card';
      const esYo = u.id === window.GH_USER_ID;
      const inicial = escapeHtml(((u.nombre || '?').trim()[0] || '?').toUpperCase());
      const rolTxt = { admin: 'Admin', empleado: 'Empleado', visor: 'Visor' }[u.rol] || u.rol;
      card.innerHTML = `
        <div class="us-head">
          <div class="us-av">${inicial}</div>
          <div><div class="us-nom">${escapeHtml(u.nombre || '(sin nombre)')}${esYo ? ' · tú' : ''}</div><div class="us-sub">${escapeHtml(rolTxt)}</div></div>
          <span class="us-badge ${u.activo ? 'on' : 'off'}">${u.activo ? 'Activo' : 'Pendiente'}</span>
        </div>
        <div class="us-grid">
          <div class="gc-field"><label data-i18n="base_de_datos_que_ve">Base de datos que ve</label>
            <select class="admin-cuenta-sel" data-id="${u.id}">${optsHtml}</select>
          </div>
          <div class="gc-field"><label data-i18n="rol">Rol</label>
            <select class="admin-rol-sel" data-id="${u.id}">
              <option value="admin" data-i18n="admin_edita_todo"${u.rol === 'admin' ? ' selected' : ''}>Admin (edita todo)</option>
              <option value="empleado" data-i18n="empleado_edita_su_base_de_datos"${u.rol === 'empleado' ? ' selected' : ''}>Empleado (edita su base de datos)</option>
              <option value="visor" data-i18n="visor_solo_lectura"${u.rol === 'visor' ? ' selected' : ''}>Visor (solo lectura)</option>
            </select>
          </div>
        </div>
        <div class="admin-visor-cuentas-wrap us-visor" data-id="${u.id}" style="display:${u.rol === 'visor' ? 'block' : 'none'};">
          <p class="us-visor-t">Bases de datos que puede ver</p>
          <p style="font-size:11.5px;color:var(--muted);margin-bottom:4px;">Marca las que quieras. Sin ninguna marcada, usa solo la de arriba.</p>
          ${checksHtml}
        </div>
        <div class="us-acc">
          <button class="gc-save-btn admin-guardar" data-i18n="guardar_cambios" data-id="${u.id}">Guardar cambios</button>
          <button class="us-ghost admin-toggle-activo" data-id="${u.id}" data-activo="${u.activo ? '1' : '0'}">${u.activo ? 'Desactivar' : 'Aprobar / activar'}</button>
          ${esYo ? '' : `<button class="us-ghost admin-clave" data-id="${u.id}" data-nombre="${escapeHtml(u.nombre || '')}">Nueva contraseña</button>
          <span class="us-sp"></span>
          <button class="us-del admin-eliminar" data-id="${u.id}" data-nombre="${escapeHtml(u.nombre || '')}">Eliminar</button>`}
        </div>
        <div class="us-clave-out"></div>`;
      cont.appendChild(card);
    });

    // Mostrar/ocultar la lista de bases de datos del visor según el rol elegido
    cont.querySelectorAll('.admin-rol-sel').forEach((sel) => {
      sel.addEventListener('change', () => {
        const wrap = cont.querySelector(`.admin-visor-cuentas-wrap[data-id="${sel.dataset.id}"]`);
        if (wrap) wrap.style.display = sel.value === 'visor' ? 'block' : 'none';
      });
    });

    // Guardar (base de datos + rol + bases de datos del visor)
    cont.querySelectorAll('.admin-guardar').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const id = btn.dataset.id;
        const cuenta = cont.querySelector(`.admin-cuenta-sel[data-id="${id}"]`).value;
        const rol = cont.querySelector(`.admin-rol-sel[data-id="${id}"]`).value;
        try {
          await window.GH_ASIGNAR_CUENTA(id, cuenta);
          await window.GH_ACTUALIZAR_PERFIL(id, { rol });
          if (rol === 'visor' && typeof window.GH_GUARDAR_CUENTAS_VISOR === 'function') {
            const marcadas = Array.from(cont.querySelectorAll(`.admin-visor-cuenta-chk[data-id="${id}"]:checked`)).map((c) => c.value);
            await window.GH_GUARDAR_CUENTAS_VISOR(id, marcadas);
          }
          toast('Cambios guardados ✓', 'success');
        } catch (e) { toast('No se pudo guardar: ' + (e.message || e), 'error', 4000); }
      });
    });
    // Activar / desactivar
    cont.querySelectorAll('.admin-toggle-activo').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const id = btn.dataset.id;
        const nuevo = btn.dataset.activo !== '1';
        try {
          await window.GH_ACTUALIZAR_PERFIL(id, { activo: nuevo });
          toast(nuevo ? 'Usuario activado ✓' : 'Usuario desactivado', 'success');
          ajCargarUsuarios();
        } catch (e) { toast('No se pudo cambiar: ' + (e.message || e), 'error', 4000); }
      });
    });
    // Nueva contraseña (no se pueden ver las actuales: están cifradas)
    cont.querySelectorAll('.admin-clave').forEach((btn) => {
      btn.addEventListener('click', async () => {
        if (typeof window.GH_PONER_CLAVE !== 'function') return;
        if (!await gcConfirm(`¿Poner una contraseña nueva a "${btn.dataset.nombre || 'este usuario'}"? La anterior dejará de funcionar.`, { okText: 'Generar' })) return;
        const abc = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ', num = '23456789';
        const rnd = (set, n) => Array.from(crypto.getRandomValues(new Uint32Array(n))).map((x) => set[x % set.length]).join('');
        const clave = rnd(abc, 6) + rnd(num, 3) + rnd(abc, 1);
        try {
          await window.GH_PONER_CLAVE(btn.dataset.id, clave);
          const out = btn.closest('.us-card').querySelector('.us-clave-out');
          out.innerHTML = `<div class="us-clave">Contraseña nueva: <code>${escapeHtml(clave)}</code><div style="font-size:11.5px;color:var(--muted);margin-top:4px;">Cópiala y mándasela ahora. Después ya no se puede volver a ver.</div></div>`;
          try { await navigator.clipboard.writeText(clave); toast('Contraseña copiada ✓', 'success'); } catch (e) { toast('Contraseña cambiada ✓', 'success'); }
        } catch (e) { toast('No se pudo: ' + (e.message || e), 'error', 5000); }
      });
    });
    // Eliminar usuario
    cont.querySelectorAll('.admin-eliminar').forEach((btn) => {
      btn.addEventListener('click', async () => {
        if (typeof window.GH_ELIMINAR_USUARIO !== 'function') return;
        if (!await gcConfirm(`¿Eliminar a "${btn.dataset.nombre || 'este usuario'}" para siempre? Ya no podrá entrar. Los datos de la base de datos no se borran.`, { okText: 'Eliminar', danger: true })) return;
        try {
          await window.GH_ELIMINAR_USUARIO(btn.dataset.id);
          toast('Usuario eliminado', 'success');
          ajCargarUsuarios();
        } catch (e) { toast('No se pudo eliminar: ' + (e.message || e), 'error', 5000); }
      });
    });
  }

  if ($('aj-btn-refrescar-usuarios')) {
    $('aj-btn-refrescar-usuarios').addEventListener('click', ajCargarUsuarios);
  }

// ---- 06-idioma.js ----
  // ============================================================
  // IDIOMA: Español / English (local a este teléfono — traduce
  // menús, títulos y botones marcados con data-i18n; no toca datos).
  // ============================================================
  const I18N = {
    abrir: {es:'Abrir',en:'Open'},
    acerca_de: {es:'Acerca de',en:'About'},
    activar_face_id_en_este_telefono: {es:'Activar Face ID en este teléfono',en:'Turn on Face ID on this phone'},
    activo: {es:'Activo',en:'Active'},
    actualizar_lista: {es:'Actualizar lista',en:'Refresh list'},
    admin_edita_todo: {es:'Admin (edita todo)',en:'Admin (edits everything)'},
    agregar: {es:'+ Agregar',en:'+ Add'},
    agregar_2: {es:'Agregar',en:'Add'},
    agregar_empleado: {es:'+ Agregar empleado',en:'+ Add employee'},
    agregar_movimiento: {es:'Agregar movimiento',en:'Add transaction'},
    agregar_socio: {es:'+ Agregar socio',en:'+ Add partner'},
    ajuste: {es:'± Ajuste',en:'± Adjustment'},
    ajustes: {es:'Ajustes',en:'Settings'},
    ano: {es:'Año',en:'Year'},
    apariencia: {es:'Apariencia',en:'Appearance'},
    apellido_s: {es:'Apellido(s)',en:'Last name(s)'},
    avanzado: {es:'Avanzado',en:'Advanced'},
    banco: {es:'Banco',en:'Bank'},
    base_de_datos_actual: {es:'Base de datos actual',en:'Current database'},
    base_de_datos_de_clientes: {es:'Base de datos de Clientes',en:'Client database'},
    base_de_datos_que_estas_viendo: {es:'Base de datos que estás viendo',en:'Database you are viewing'},
    base_de_datos_que_ve: {es:'Base de datos que ve',en:'Database they can see'},
    bases_de_datos: {es:'Bases de datos',en:'Databases'},
    bill_to_nombre_compania: {es:'Bill To — Nombre / Compañía',en:'Bill To — Name / Company'},
    buscar: {es:'Buscar',en:'Search'},
    buscar_actualizacion_ahora: {es:'Buscar actualización ahora',en:'Check for update now'},
    buscar_en_tiempo_real: {es:'Buscar en tiempo real',en:'Live search'},
    buscar_por_persona: {es:'Buscar por persona',en:'Search by person'},
    cambiar_a_otra_base_de_datos: {es:'Cambiar a otra base de datos',en:'Switch to another database'},
    cancelar: {es:'Cancelar',en:'Cancel'},
    categoria: {es:'Categoría',en:'Category'},
    categorias: {es:'Categorías',en:'Categories'},
    cerrar: {es:'Cerrar',en:'Close'},
    cerrar_sesion: {es:'Cerrar sesión',en:'Log out'},
    clientes: {es:'Clientes',en:'Clients'},
    cobrado: {es:'Cobrado',en:'Collected'},
    cobros_por_casa: {es:'Cobros por casa',en:'Collections by house'},
    colonias: {es:'Colonias',en:'Subdivisions'},
    colonias_subdivisions: {es:'Colonias / Subdivisions',en:'Subdivisions'},
    contacto_de_emergencia: {es:'Contacto de emergencia',en:'Emergency contact'},
    contrato: {es:'Contrato',en:'Contract'},
    contratos: {es:'Contratos',en:'Contracts'},
    crear: {es:'+ Crear',en:'+ Create'},
    csv: {es:'⬇ CSV',en:'⬇ CSV'},
    cuanto_lleva_ganando_una_persona: {es:'Cuánto lleva ganando una persona',en:'How much a person has earned'},
    datos_de_la_factura_y_recibos: {es:'Datos de la factura y recibos',en:'Invoice & receipt details'},
    descargar: {es:'⬇ Descargar',en:'⬇ Download'},
    descargar_excel_completo: {es:'Descargar Excel completo',en:'Download full Excel'},
    descargar_reporte_en_pdf: {es:'Descargar reporte en PDF',en:'Download PDF report'},
    descargar_respaldo: {es:'Descargar respaldo',en:'Download backup'},
    descargar_respaldo_completo: {es:'Descargar respaldo completo',en:'Download full backup'},
    descripcion: {es:'Descripción',en:'Description'},
    descripciones_de_trabajo: {es:'Descripciones de Trabajo',en:'Job descriptions'},
    desde_opcional: {es:'Desde (opcional)',en:'From (optional)'},
    direccion: {es:'Dirección',en:'Address'},
    direccion_aparece_en_la_factura: {es:'Dirección (aparece en la factura)',en:'Address (shows on invoice)'},
    direccion_opcional_aparece_en_la_factura: {es:'Dirección (opcional — aparece en la factura)',en:'Address (optional — shows on invoice)'},
    editar: {es:'Editar',en:'Edit'},
    editar_2: {es:'✎ Editar',en:'✎ Edit'},
    editar_semana: {es:'Editar semana',en:'Edit week'},
    eliminar: {es:'Eliminar',en:'Delete'},
    email: {es:'Email',en:'Email'},
    empleado_edita_su_base_de_datos: {es:'Empleado (edita su base de datos)',en:'Employee (edits their database)'},
    empleados: {es:'Empleados',en:'Employees'},
    en_que_se_va_el_dinero_gastos_por_catego: {es:'En qué se va el dinero — gastos por categoría',en:'Where the money goes — expenses by category'},
    enviar: {es:'↗ Enviar',en:'↗ Share'},
    estado: {es:'Estado',en:'Status'},
    facturas: {es:'Facturas',en:'Invoices'},
    facturas_guardadas: {es:'Facturas Guardadas',en:'Saved invoices'},
    fecha: {es:'Fecha',en:'Date'},
    fecha_de_inicio: {es:'Fecha de inicio',en:'Start date'},
    fila: {es:'+ Fila',en:'+ Row'},
    gasto: {es:'↓ Gasto',en:'↓ Expense'},
    general: {es:'General',en:'General'},
    gobierno: {es:'Gobierno',en:'Government'},
    guardadas: {es:'Guardadas',en:'Saved'},
    guardar: {es:'Guardar',en:'Save'},
    guardar_cambios: {es:'Guardar cambios',en:'Save changes'},
    guardar_cambios_de_la_semana: {es:'Guardar cambios de la semana',en:'Save week changes'},
    guardar_datos_de_factura: {es:'Guardar datos de factura',en:'Save invoice details'},
    guardar_factura: {es:'Guardar Factura',en:'Save Invoice'},
    guardar_invoice: {es:'Guardar invoice',en:'Save invoice'},
    guardar_movimiento: {es:'Guardar movimiento',en:'Save transaction'},
    guardar_pin: {es:'Guardar PIN',en:'Save PIN'},
    guardar_socios: {es:'Guardar socios',en:'Save partners'},
    hasta_opcional: {es:'Hasta (opcional)',en:'To (optional)'},
    historial: {es:'Historial',en:'History'},
    historial_de_pagos: {es:'Historial de pagos',en:'Payment history'},
    identificacion: {es:'Identificación',en:'ID'},
    idioma: {es:'Idioma',en:'Language'},
    imprimir: {es:'Imprimir',en:'Print'},
    inactivo: {es:'Inactivo',en:'Inactive'},
    informacion: {es:'Información',en:'Information'},
    ingreso: {es:'↑ Ingreso',en:'↑ Income'},
    intervalo: {es:'Intervalo',en:'Interval'},
    invoice: {es:'Invoice #',en:'Invoice #'},
    invoices_guardados: {es:'Invoices guardados',en:'Saved invoices'},
    irs_taxes: {es:'IRS - Taxes',en:'IRS - Taxes'},
    licencia: {es:'Licencia',en:'License'},
    licencias: {es:'Licencias',en:'Licenses'},
    limpiar: {es:'Limpiar',en:'Clear'},
    limpiar_fechas: {es:'Limpiar fechas',en:'Clear dates'},
    mi_cuenta: {es:'Mi cuenta',en:'My account'},
    monto: {es:'Monto ($)',en:'Amount ($)'},
    movimientos: {es:'Movimientos',en:'Transactions'},
    nombre_de_la_nueva_base_de_datos: {es:'Nombre de la nueva base de datos',en:'New database name'},
    nombre_de_la_nueva_categoria: {es:'Nombre de la nueva categoría',en:'New category name'},
    nombre_del_trabajador: {es:'Nombre del trabajador',en:'Worker name'},
    nombre_en_la_factura_recibos: {es:'Nombre en la factura / recibos',en:'Name on invoice / receipts'},
    nombre_s: {es:'Nombre(s)',en:'First name(s)'},
    nomina: {es:'Nómina',en:'Payroll'},
    notas: {es:'Notas',en:'Notes'},
    nueva_factura: {es:'+ Nueva Factura',en:'+ New Invoice'},
    otro: {es:'Otro',en:'Other'},
    pagos_guardados: {es:'Pagos guardados',en:'Saved payments'},
    papeles: {es:'Papeles',en:'Documents'},
    pendiente: {es:'Pendiente',en:'Pending'},
    pendientes: {es:'Pendientes',en:'Pending'},
    pin_de_respaldo_4_a_8_numeros: {es:'PIN de respaldo (4 a 8 números)',en:'Backup PIN (4 to 8 digits)'},
    por_ano: {es:'Por año',en:'Yearly'},
    por_mes: {es:'Por mes',en:'Monthly'},
    por_semana: {es:'Por semana',en:'Weekly'},
    propiedad: {es:'Propiedad',en:'Property'},
    puesto_rol: {es:'Puesto / Rol',en:'Position / Role'},
    que_semana_es_este_ingreso: {es:'¿Qué semana es este ingreso?',en:'Which week is this income for?'},
    quitar_logo: {es:'Quitar logo',en:'Remove logo'},
    rango_de_fechas_opcional_vacio_todo: {es:'Rango de fechas (opcional — vacío = todo)',en:'Date range (optional — blank = everything)'},
    recibo_semanal: {es:'Recibo semanal',en:'Weekly receipt'},
    registrar_pago: {es:'Registrar pago',en:'Log payment'},
    registro: {es:'Registro',en:'Log'},
    tab_principal: {es:'Principal',en:'Home'},
    sub_registro: {es:'Registro',en:'Log'},
    reportes_y_exportacion: {es:'Reportes y exportación',en:'Reports & export'},
    restar: {es:'− Restar',en:'− Subtract'},
    restaurar_respaldo: {es:'Restaurar respaldo',en:'Restore backup'},
    resumen_anual_taxas_y_pago_por_socio: {es:'Resumen anual — Taxas y pago por socio',en:'Annual summary — Taxes & partner payout'},
    rol: {es:'Rol',en:'Role'},
    seguridad: {es:'Seguridad',en:'Security'},
    seguro: {es:'Seguro',en:'Insurance'},
    seleccionar: {es:'— Seleccionar —',en:'— Select —'},
    socios_reparto: {es:'Socios (reparto)',en:'Partners (split)'},
    solo_ajustes: {es:'Solo ajustes',en:'Adjustments only'},
    solo_gastos: {es:'Solo gastos',en:'Expenses only'},
    solo_ingresos: {es:'Solo ingresos',en:'Income only'},
    ss_ultimos_4: {es:'SS (últimos 4)',en:'SSN (last 4)'},
    subir_pdf: {es:'+ Subir PDF',en:'+ Upload PDF'},
    sueldo_por_dia: {es:'Sueldo por día ($)',en:'Pay per day ($)'},
    sumar: {es:'+ Sumar',en:'+ Add'},
    tax: {es:'Tax %',en:'Tax %'},
    telefono: {es:'Teléfono',en:'Phone'},
    tendencia_ultimas_semanas: {es:'Tendencia — últimas semanas',en:'Trend — last few weeks'},
    tipo: {es:'Tipo',en:'Type'},
    todo_el_tiempo: {es:'Todo el tiempo',en:'All time'},
    todos: {es:'Todos',en:'All'},
    todos_los_anos: {es:'Todos los años',en:'All years'},
    total_pagado_por_socio: {es:'Total pagado por socio',en:'Total paid per partner'},
    trabajador: {es:'Trabajador',en:'Worker'},
    trabajadores: {es:'Trabajadores',en:'Workers'},
    trabajadores_y_sus_sueldos: {es:'Trabajadores y sus sueldos',en:'Workers & their pay'},
    trabajos: {es:'Trabajos',en:'Jobs'},
    trimestre_rapido_para_el_contador: {es:'Trimestre rápido (para el contador)',en:'Quick quarter (for your accountant)'},
    usuarios_y_a_que_base_de_datos_entran: {es:'Usuarios y a qué base de datos entran',en:'Users & which database they access'},
    vehiculos: {es:'Vehículos',en:'Vehicles'},
    ver: {es:'Ver',en:'View'},
    ver_esta_base_de_datos: {es:'Ver esta base de datos',en:'View this database'},
    ver_recibo: {es:'Ver recibo',en:'View receipt'},
    visor_solo_lectura: {es:'Visor (solo lectura)',en:'Viewer (read-only)'},
    vista_previa: {es:'Vista previa',en:'Preview'},
    t_agrega_al_menos_un_trabajo: {es:'Agrega al menos un trabajo',en:'Add at least one job'},
    t_agrega_un_numero_de_factura: {es:'Agrega un número de factura',en:'Add an invoice number'},
    t_ahi_esta: {es:'Ahí está ',en:'There it is: '},
    t_base_de_datos_creada: {es:'Base de datos creada ✓',en:'Database created ✓'},
    t_base_de_datos_quitada_de_la_lista: {es:'Base de datos quitada de la lista',en:'Database removed from the list'},
    t_cambiando: {es:'Cambiando…',en:'Switching…'},
    t_cambios_guardados: {es:'Cambios guardados ✓',en:'Changes saved ✓'},
    t_categoria_agregada: {es:'Categoría agregada ✓',en:'Category added ✓'},
    t_cliente_agregado: {es:'Cliente agregado ✓',en:'Client added ✓'},
    t_cliente_eliminado: {es:'Cliente eliminado',en:'Client deleted'},
    t_colonia_agregada: {es:'Colonia agregada ✓',en:'Subdivision added ✓'},
    t_colonia_eliminada: {es:'Colonia eliminada',en:'Subdivision deleted'},
    t_color_de_acento_actualizado: {es:'Color de acento actualizado ✓',en:'Accent color updated ✓'},
    t_conexion_restablecida: {es:'Conexión restablecida ✓',en:'Connection restored ✓'},
    t_datos_de_factura_guardados: {es:'Datos de factura guardados ✓',en:'Invoice details saved ✓'},
    t_debe_haber_al_menos_un_socio: {es:'Debe haber al menos un socio',en:'There must be at least one partner'},
    t_descripcion_agregada: {es:'Descripción agregada ✓',en:'Description added ✓'},
    t_descripcion_eliminada: {es:'Descripción eliminada',en:'Description deleted'},
    t_editando: {es:'Editando ',en:'Editing '},
    t_editando_movimiento_cambia_los_datos_y_g: {es:'Editando movimiento — cambia los datos y guarda',en:'Editing transaction — change the details and save'},
    t_el_pin_debe_tener_de_4_a_8_numeros: {es:'El PIN debe tener de 4 a 8 números.',en:'The PIN must be 4 to 8 digits.'},
    t_empleado_guardado: {es:'Empleado guardado ✓',en:'Employee saved ✓'},
    t_error_al_subir: {es:'Error al subir: ',en:'Upload error: '},
    t_escribe_el_nombre_de_todos_los_socios: {es:'Escribe el nombre de todos los socios',en:'Enter every partner\'s name'},
    t_escribe_un_nombre_para_la_base_de_datos: {es:'Escribe un nombre para la base de datos',en:'Enter a name for the database'},
    t_escribe_un_sueldo_valido: {es:'Escribe un sueldo válido',en:'Enter a valid pay rate'},
    t_este_dispositivo_no_tiene_face_id_touch_: {es:'Este dispositivo no tiene Face ID/Touch ID disponible.',en:'This device does not have Face ID/Touch ID available.'},
    t_este_navegador_no_soporta_face_id_touch_: {es:'Este navegador no soporta Face ID/Touch ID para apps web.',en:'This browser does not support Face ID/Touch ID for web apps.'},
    t_este_navegador_no_soporta_compartir_dire: {es:'Este navegador no soporta compartir directo — usa el botón Descargar.',en:'This browser does not support direct sharing — use the Download button.'},
    t_excel_descargado: {es:'Excel descargado ✓',en:'Excel downloaded ✓'},
    t_face_id_activado_en_este_telefono: {es:'Face ID activado en este teléfono ✓',en:'Face ID turned on for this phone ✓'},
    t_factura_eliminada: {es:'Factura eliminada',en:'Invoice deleted'},
    t_guarda_primero_los_datos_del_empleado_an: {es:'Guarda primero los datos del empleado antes de subir documentos.',en:'Save the employee\'s details first before uploading documents.'},
    t_invoice_eliminado: {es:'Invoice eliminado',en:'Invoice deleted'},
    t_invoice_guardado_y_archivado_en_registro: {es:'Invoice guardado y archivado en Registro ✓',en:'Invoice saved and filed under Log ✓'},
    t_invoice_reabierto_edita_los_movimientos_: {es:'Invoice reabierto — edita los movimientos y vuelve a guardarlo',en:'Invoice reopened — edit the transactions and save it again'},
    t_logo_actualizado: {es:'Logo actualizado ✓',en:'Logo updated ✓'},
    t_logo_de_guzman_hvac_restaurado: {es:'Logo de la factura quitado',en:'Invoice logo removed'},
    t_movimiento_eliminado: {es:'Movimiento eliminado',en:'Transaction deleted'},
    t_movimiento_repetido_con_la_fecha_de_hoy_: {es:'Movimiento repetido con la fecha de hoy — revisa el monto y guarda',en:'Transaction repeated with today\'s date — check the amount and save'},
    t_no_hay_movimientos_para_guardar: {es:'No hay movimientos para guardar',en:'No transactions to save'},
    t_no_se_pudo_abrir_para_compartir_usa_desc: {es:'No se pudo abrir para compartir — usa Descargar.',en:'Could not open to share — use Download.'},
    t_no_se_pudo_activar_face_id_intenta_de_nu: {es:'No se pudo activar Face ID — intenta de nuevo.',en:'Could not turn on Face ID — try again.'},
    t_no_se_pudo_cambiar: {es:'No se pudo cambiar: ',en:'Could not switch: '},
    t_no_se_pudo_cargar_el_generador_de_excel_: {es:'No se pudo cargar el generador de Excel. Revisa tu conexión e intenta de nuevo.',en:'Could not load the Excel generator. Check your connection and try again.'},
    t_no_se_pudo_completar_una_accion_problema: {es:'No se pudo completar una acción (problema de conexión o datos). Intenta de nuevo.',en:'Could not complete an action (connection or data issue). Try again.'},
    t_no_se_pudo_crear_puede_que_tu_usuario_no: {es:'No se pudo crear. Puede que tu usuario no sea admin en Supabase. Detalle: ',en:'Could not create it. Your user may not be an admin in Supabase. Detail: '},
    t_no_se_pudo_guardar: {es:'No se pudo guardar: ',en:'Could not save: '},
    t_ocurrio_un_error_inesperado_si_algo_no_s: {es:'Ocurrió un error inesperado. Si algo no se guardó, inténtalo de nuevo.',en:'An unexpected error occurred. If something did not save, try again.'},
    t_pin_guardado: {es:'PIN guardado ✓',en:'PIN saved ✓'},
    t_pago_eliminado: {es:'Pago eliminado',en:'Payment deleted'},
    t_para_abrir_pdfs_usa_la_app_de_escritorio: {es:'Para abrir PDFs usa la app de escritorio.',en:'To open PDFs, use the desktop app.'},
    t_para_guardar_pdfs_en_la_app_usa_la_app_d: {es:'Para guardar PDFs en la app usa la app de escritorio (Electron).',en:'To save PDFs in the app, use the desktop app (Electron).'},
    t_para_subir_pdfs_usa_la_app_de_escritorio: {es:'Para subir PDFs usa la app de escritorio (Electron).',en:'To upload PDFs, use the desktop app (Electron).'},
    t_primero_activa_face_id_o_guarda_un_pin_p: {es:'Primero activa Face ID o guarda un PIN, para no quedar fuera de la app.',en:'First turn on Face ID or save a PIN, so you never get locked out.'},
    t_respaldo_completo_descargado: {es:'Respaldo completo descargado ✓',en:'Full backup downloaded ✓'},
    t_respaldo_restaurado_todo_actualizado: {es:'Respaldo restaurado ✓ — todo actualizado',en:'Backup restored ✓ — everything is up to date'},
    t_se_perdio_la_conexion_a_internet: {es:'Se perdió la conexión a internet',en:'Internet connection lost'},
    t_socios_guardados: {es:'Socios guardados ✓',en:'Partners saved ✓'},
    t_solo_funciona_con_sesion_en_la_nube: {es:'Solo funciona con sesión en la nube',en:'Only works when signed in to the cloud'},
    t_sueldo_actualizado: {es:'Sueldo actualizado ✓',en:'Pay rate updated ✓'},
    t_trabajador_agregado: {es:'Trabajador agregado ✓',en:'Worker added ✓'},
    t_trabajador_marcado_como_inactivo: {es:'Trabajador marcado como inactivo',en:'Worker marked inactive'},
    t_ya_esta_en_la_lista_de_esta_semana: {es:'Ya está en la lista de esta semana',en:'Already on this week\'s list'},
    t_ya_estas_en_esa_base_de_datos: {es:'Ya estás en esa base de datos',en:'You are already on that database'},
    t_ya_existe: {es:'Ya existe',en:'Already exists'},
    t_ya_existe_una_base_de_datos_con_ese_nomb: {es:'Ya existe una base de datos con ese nombre',en:'A database with that name already exists'},
    h_ajustar_sueldo: {es:'Ajustar sueldo',en:'Adjust pay'},
    h_cliente: {es:'Cliente',en:'Client'},
    h_colonia_lote: {es:'Colonia / Lote',en:'Subdivision / Lot'},
    h_concepto: {es:'Concepto',en:'Concept'},
    h_dia: {es:'Día',en:'Day'},
    h_dias: {es:'Días',en:'Days'},
    h_dias_trabajados: {es:'Días trabajados',en:'Days worked'},
    h_factura: {es:'Factura',en:'Invoice'},
    h_fechas_trabajadas: {es:'Fechas trabajadas',en:'Dates worked'},
    h_ganado: {es:'Ganado',en:'Earned'},
    h_gastos: {es:'Gastos',en:'Expenses'},
    h_guardado: {es:'Guardado',en:'Saved'},
    h_ingresos: {es:'Ingresos',en:'Income'},
    h_monto: {es:'Monto',en:'Amount'},
    h_movs: {es:'Movs.',en:'Txns.'},
    h_neto: {es:'Neto',en:'Net'},
    h_nombre: {es:'Nombre',en:'Name'},
    h_nota: {es:'Nota',en:'Note'},
    h_semana: {es:'Semana',en:'Week'},
    h_semana_invoice: {es:'Semana / Invoice',en:'Week / Invoice'},
    h_sueldo: {es:'Sueldo',en:'Pay'},
    h_sueldo_por_dia: {es:'Sueldo por día',en:'Pay per day'},
    h_sueldo_dia: {es:'Sueldo/día',en:'Pay/day'},
    h_tax_guzman: {es:'Tax Guzman',en:'Guzman Tax'},
    h_tax_total: {es:'Tax total',en:'Total tax'},
    h_taxas: {es:'Taxas',en:'Taxes'},
    h_taxas_10: {es:'Taxas (10%)',en:'Taxes (10%)'},
    h_taxas_restantes: {es:'Taxas Restantes',en:'Remaining Taxes'},
    h_total: {es:'Total',en:'Total'},
    h_trabajo: {es:'Trabajo',en:'Job'},
    cal_calendario: {es:'📅 Calendario',en:'📅 Calendar'},
    cal_calendario_de_trabajos: {es:'Calendario de trabajos',en:'Work calendar'},
    cal_calendario_tab: {es:'Calendario',en:'Calendar'},
    cal_nuevo_sitio: {es:'Es un sitio nuevo — limpiar estos datos',en:'This is a new site — clear these fields'},
    cal_work_performed: {es:'Work Performed',en:'Work Performed'},
    planos_tab: {es:'Planos',en:'Plans'},
    pln_planos_titulo: {es:'Planos',en:'Plans'},
    pln_agregar_plano: {es:'+ Agregar plano',en:'+ Add plan'},
    pln_nombre_del_plano: {es:'Nombre del plano',en:'Plan name'},
    pln_constructor: {es:'Constructor',en:'Builder'},
    pln_fotos_del_plano: {es:'Fotos del plano',en:'Plan photos'},
    pln_nuevo_plano: {es:'Nuevo plano',en:'New plan'},
    pln_editar_plano: {es:'Editar plano',en:'Edit plan'},
    pln_ver_planos: {es:'Ver planos',en:'View plans'},
    pln_editar_borrar: {es:'Editar / Borrar',en:'Edit / Delete'},
    pln_etapa: {es:'Etapa',en:'Stage'},
    documentacion: {es:'Documentación',en:'Documents'},
    pln_editar_o_borrar_planos: {es:'Editar o borrar planos',en:'Edit or delete plans'},
    t_escribe_el_nombre_del_plano: {es:'Escribe el nombre del plano',en:'Enter the plan name'},
    t_plano_guardado: {es:'Plano guardado ✓',en:'Plan saved ✓'},
    t_borrar_este_plano: {es:'¿Borrar este plano?',en:'Delete this plan?'},
    cal_hora_opcional: {es:'Hora (opcional)',en:'Time (optional)'},
    cal_direccion_desc: {es:'Dirección / Descripción del trabajo',en:'Address / Job description'},
    cal_exportar_semana: {es:'📅 Exportar semana a Calendario',en:'📅 Export week to Calendar'},
    cal_nuevo_trabajo: {es:'Nuevo trabajo',en:'New job'},
    cal_editar_trabajo: {es:'Editar trabajo',en:'Edit job'},
    cal_sin_trabajos: {es:'Sin trabajos agendados',en:'No jobs scheduled'},
    cal_sin_cliente: {es:'(sin cliente)',en:'(no client)'},
    t_trabajo_guardado: {es:'Trabajo guardado ✓',en:'Job saved ✓'},
    t_no_hay_trabajos_exportar: {es:'No hay trabajos para exportar',en:'No jobs to export'},
    t_escribe_una_fecha: {es:'Escribe una fecha',en:'Enter a date'},
    t_borrar_trabajo_agendado: {es:'¿Borrar este trabajo agendado?',en:'Delete this scheduled job?'}
  };
  const IDIOMA_KEY = 'gh-idioma';

  function idiomaActual() {
    try { return localStorage.getItem(IDIOMA_KEY) || 'es'; } catch (e) { return 'es'; }
  }

  // Cambia solo el último nodo de texto directo de un elemento, sin tocar
  // hijos como <svg> (los íconos de las pestañas) — así nunca se borra un ícono.
  function ghSetTextoPreservandoIconos(el, texto) {
    for (let i = el.childNodes.length - 1; i >= 0; i--) {
      if (el.childNodes[i].nodeType === 3) { el.childNodes[i].nodeValue = texto; return; }
    }
    el.textContent = texto;
  }

  function aplicarIdioma(lang) {
    document.documentElement.lang = lang === 'en' ? 'en' : 'es';
    document.querySelectorAll('[data-i18n]').forEach((el) => {
      const entry = I18N[el.dataset.i18n];
      if (!entry) return;
      ghSetTextoPreservandoIconos(el, lang === 'en' ? entry.en : entry.es);
    });
    document.querySelectorAll('.gh-lang-btn').forEach((b) => {
      b.classList.toggle('active', b.dataset.lang === lang);
    });
    try { localStorage.setItem(IDIOMA_KEY, lang); } catch (e) {}
  }

  aplicarIdioma(idiomaActual());
  document.querySelectorAll('.gh-lang-btn').forEach((btn) => {
    btn.addEventListener('click', () => aplicarIdioma(btn.dataset.lang));
  });

  // ---- Apariencia: color de acento (guardado por base de datos/cuenta) ----
  const ACCENT_KEY = 'kontaly-accent';
  function aplicarAcento(nombre) {
    if (nombre === 'cobre') document.documentElement.removeAttribute('data-accent');
    else document.documentElement.setAttribute('data-accent', nombre);
    document.querySelectorAll('.aj-accent-sw').forEach((sw) => {
      sw.classList.toggle('active', sw.dataset.accent === nombre);
    });
  }
  // Pintura instantánea con lo último visto en este aparato (sin parpadeo);
  // luego se corrige con el color real de la base de datos que se abrió.
  (function initAcentoInstantaneo() {
    let guardado = 'cobre';
    try { guardado = localStorage.getItem('gh-accent-ultimo') || 'cobre'; } catch (e) {}
    aplicarAcento(guardado);
  })();
  async function initAcentoPorCuenta() {
    if (typeof window.GH_ESPERAR_SESION === 'function') { try { await window.GH_ESPERAR_SESION(); } catch (e) {} }
    let guardado = 'cobre';
    try { const r = await window.storage.get(ACCENT_KEY); guardado = JSON.parse(r.value) || 'cobre'; } catch (e) {}
    aplicarAcento(guardado);
    try { localStorage.setItem('gh-accent-ultimo', guardado); } catch (e) {}
  }
  initAcentoPorCuenta();
  document.querySelectorAll('.aj-accent-sw').forEach((sw) => {
    sw.addEventListener('click', async () => {
      const nombre = sw.dataset.accent;
      aplicarAcento(nombre);
      try { localStorage.setItem('gh-accent-ultimo', nombre); } catch (e) {}
      try { await window.storage.set(ACCENT_KEY, JSON.stringify(nombre)); } catch (e) {}
      toast('Color de acento actualizado ✓', 'success', 1800);
    });
  });

// ---- 07-seguridad.js ----
  // ============================================================
  // SEGURIDAD: bloqueo con Face ID / PIN (local a este teléfono —
  // no usa window.storage porque una credencial de Face ID no tiene
  // sentido fuera del dispositivo donde se creó; así tampoco afecta
  // a la versión de escritorio ni a otros teléfonos).
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
      if (card) card.style.display = 'none'; // versión de escritorio / sin login: no aplica
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

// ---- 08-empleados.js ----
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
      ss: $('emp-ss').value.replace(/\D/g, '').slice(-4),   // solo los últimos 4 (nunca el número completo)
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

// ---- 09-facturas-base.js ----
  // ====================================================================
  // MÓDULO: FACTURAS (INVOICES)
  // ====================================================================
  const INV_KEY = 'gh-invoices';
  const COL_KEY = 'gh-colonias';
  const CLI_KEY = 'gh-clientes';
  const TRB_KEY = 'gh-trabajos';
  let invDocs = [], invColonias = [], invClientes = [], invTrabajos = [], invEnVista = null, invFilaC = 0;

  const INV_COL_DEFAULT = [
    'Hamlet at Carothers Crossing','Idle Reserve','Briley Downs','Fairhaven',
    'Kings Landing','Garrett Farms','Parkhaven','Hartmann Landing','Spring Branch',
    'Riley Farms','Northridge Park',"Marlon's Creek",'Brush Creek','Shelton Square',
    'The Estates at Highland Reserves','The Greens at Legacy Townhomes',
    'Tiger Hill Townhomes','Twin Lakes','Highland Reserve','Hickory Cove',
    'Glenview Farms','Bradshaw Farms Reserve','Campbell Place','Timberwalk'
  ];
  const INV_CLI_DEFAULT = ['Airtron'];
  const INV_TRB_DEFAULT = [
    'Trim install','Rough-in installation','Unit installation',
    'Duct work','Thermostat installation','Filter replacement',
    'Maintenance service','System inspection','Repair service',
    'Coil cleaning','Refrigerant recharge','Fan motor replacement'
  ];
  const invFmt = n => { const v = Math.round((Number(n) || 0) * 100) / 100; return (v < 0 ? '-$' : '$') + Math.abs(v).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); };
  // Días en inglés para la columna DAY de la factura (el invoice siempre se ve en inglés)
  const INV_DIAS_SEMANA = ['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'];
  // Fecha en números para los documentos (MM/DD/YYYY), nunca en letras
  // Fecha con guiones para la columna DATE de la factura: 09-19-2026
  function invFechaGuion(fechaISO) {
    if (!fechaISO) return '';
    const p = String(fechaISO).slice(0, 10).split('-');
    if (p.length !== 3) return fechaISO;
    return `${p[1]}-${p[2]}-${p[0]}`;
  }
  function invFechaNum(fechaISO) {
    if (!fechaISO) return '';
    const p = String(fechaISO).slice(0, 10).split('-');
    if (p.length !== 3) return fechaISO;
    return `${p[1]}/${p[2]}/${p[0]}`;
  }
  function invDiaDeFecha(fechaISO) {
    if (!fechaISO) return '';
    const [y, m, d] = fechaISO.split('-').map(Number);
    const dow = new Date(y, m - 1, d).getDay(); // 0=domingo
    return dow === 0 ? 'Sunday' : INV_DIAS_SEMANA[dow - 1];
  }

// ---- 10-calendario.js ----
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
  // Fotos: archivos en el almacén de fotos (antes iban dentro de la base de
  // datos y la hacían pesada). Si falla, se avisa (antes se perdían sin aviso).
  async function calGuardarFotosDe(id, fotos) {
    try { await GH_FOTOS.guardar('cita', id, fotos); }
    catch (e) { toast('No se pudieron guardar las fotos: ' + ((e && e.message) || e), 'error', 5000); }
  }
  async function calCargarFotosDe(id) {
    try { return await GH_FOTOS.cargar('cita', id); } catch (e) { return []; }
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
            citas = citas.filter((x) => x.id !== c.id); GH_FOTOS.borrar('cita', c.id).catch(() => {});
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
          citas = citas.filter((c) => !ids.includes(c.id)); ids.forEach((id) => GH_FOTOS.borrar('cita', id).catch(() => {}));
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

// ---- 11-planos.js ----
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
  // Fotos: archivos en el almacén de fotos (antes iban dentro de la base de
  // datos y la hacían pesada). Si falla, se avisa (antes se perdían sin aviso).
  async function plnGuardarFotosDe(id, fotos) {
    try { await GH_FOTOS.guardar('plano', id, fotos); }
    catch (e) { toast('No se pudieron guardar las fotos: ' + ((e && e.message) || e), 'error', 5000); }
  }
  async function plnCargarFotosDe(id) {
    try { return await GH_FOTOS.cargar('plano', id); } catch (e) { return []; }
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
          planos = planos.filter((p) => !ids.includes(p.id)); ids.forEach((id) => GH_FOTOS.borrar('plano', id).catch(() => {}));
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
        planos = planos.filter((x) => x.id !== p.id); GH_FOTOS.borrar('plano', p.id).catch(() => {});
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

// ---- 12-completion.js ----
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
    cslProgramar(csTipo, d);   // y se guarda en la nube bajo su lote / colonia
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
    if (tipo === 'imprimir') {
      if (csTipo === 'pull') { if (psModo === 'editar') psCambiarModo('llenar'); psGuardarBorrador(); } else if (csTipo) csGuardarBorrador();
      cslMostrar(true); return;
    }
    if (cslVisible) { cslMostrar(false); if (tipo === csTipo) return; }
    if (tipo === csTipo) return;
    if (csTipo === 'pull') { if (psModo === 'editar') psCambiarModo('llenar'); psGuardarBorrador(); } else if (csTipo) csGuardarBorrador();   // guarda la hoja que estaba en pantalla
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
    // En Rough-In / Trim-Out solo queda "Imprimir las dos" (frente y vuelta)
    $('cs-btn-imprimir').style.display = esPull ? '' : 'none';
    $('cs-btn-imprimir').textContent = '🖨 Imprimir (2 páginas)';
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
      let trim = csLeerGuardado('trim');
      // Si el Trim-Out es de otro lote (o está vacío), sale en blanco con el lote del Rough-In
      const kr = cslClave(rough.lote || ''), kt = cslClave(trim.lote || '');
      if (kr && kt !== kr) trim = { lote: rough.lote, checks: {} };
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

// ---- 13-pullsheet.js ----
  // ====================================================================
  // MÓDULO: TRIM OUT PULL SHEET (AHC — Standard Trim)
  // Copia del papel de American Heating & Cooling: 2 páginas carta, letra
  // Calibri ~9pt, mismas columnas (PART · DESCRIPTION · ORDER · SHIP) y los
  // mismos renglones. En pantalla solo se llenan ORDER y SHIP de cada parte.
  // ====================================================================
  const PS_KEY = 'gh-cs-pull';
  const _S = (t) => ({ s: t }), _B = null;
  const _I = (p, d) => ({ p, d });
  // Papel actualizado (oct 2026): la página de PIPE va primero y la de GAS PIPE después.
  const PS_PAGINAS = [
    {
      // Columnas medidas sobre el escaneo (pulgadas, desde el borde de la hoja)
      x: [0.165, 1.29, 1.505, 2.355, 2.57, 2.96, 3.175, 3.685, 4.205, 5.2, 5.415, 6.525, 6.74, 7.135, 7.35, 7.86, 8.085],
      top: 0.29, tituloX: 4.15, subX: 4.425, titulo: 'AHC TRIM OUT PULL SHEET',
      // índices de columna: [part, desc, order, ship] de cada lado
      izq: [0, 2, 4, 6], der: [8, 10, 12, 14],
      L: [
        _S('PIPE'),
        _I('RMP20', '20" round pipe'), _I('RMP18', '18" round pipe'), _I('RMP16', '16" round pipe'), _I('RMP14', '14" round pipe'),
        _I('RMP12', '12" round pipe'), _I('RMP10', '10" round pipe'), _I('RMP6', '6" round pipe'), _I('RMP428GA', '4" round pipe'),
        _B,
        _S('90 DEGREE'),
        _I('90MP6', '6" 90'), _I('90MP4', '4" 90'),
        _B,
        _S('ELECTRICAL'),
        _I('E 34 SEAL', '3/4" sealtite'), _I('E 34 SEALC90', '3/4" sealtite 90'), _I('E 34 SEALCST', '3/4" sealtite straight'), _I('E 34 RS', '3/4" rigid strap'),
        _I('E 12 SEAL', '1/2" sealtite'), _I('E 12 SEALC90', '1/2" sealtite 90'), _I('E 12 SEALCST', '1/2" sealtite straight'), _I('E 12 RS', '1/2" rigid strap'),
        _I('E TOG', 'toggle switch'), _I('E COV', 'switch cover'), _I('E 24 HB', '2"x4" handy box'), _I('WTHHN10B', '#10 black wire'),
        _I('WTHHN10G', '#10 green wire'), _I('WTHHN8B', '#8 black wire'), _I('WTHHN6B', '#6 black wire'),
        _B,
        _S('COPPER'),
        _I('LS7838', '7/8" copper lineset'), _I('C7890', '7/8" copper 90'), _I('A7834', '7/8"x3/4" armaflex'), _I('LS3438', '3/4" copper lineset'),
        _I('C3490', '3/4" copper 90'),
        _B,
        _S('THERMOSTATS'),
        _I('TH2110U4004', 'HW PROS200 gas stat'), _I('TH2210U4005', 'HW PROS200 H/P stat'), _I('ECOBEE6 (NVR)', 'Ecobee 6 stat'), _I('ECOBEE3LITE', 'Ecobee 3 lite stat'),
        _B,
        _S('FLEX'),
        _I('FD20R8', '20" R8 Flex'), _I('FD18R8', '18" R8 Flex'), _I('FD16R8', '16" R8 Flex'), _I('FD14R8', '14" R8 Flex'), _I('FD12R8', '12" R8 Flex'),
        _I('FD10R8', '10" R8 Flex'), _I('FD8R8', '8" R8 Flex'), _I('FD7R8', '7" R8 Flex'), _I('FD6R8', '6" R8 Flex'), _I('FD5R8', '5" R8 Flex')
      ],
      R: [
        _S('FILTER GRILLS'),
        _I('FG1212 170FF', '12x12'), _I('FG1414 170FF', '14x14'), _I('FG1616 170FF', '16x16'), _I('FG1818 170FF', '18x18'),
        _I('FG1420170FF', '14x20'), _I('FG1425170FF', '14x25'), _I('FG1430170FF', '14x30'), _I('FG1630 170FF', '16x30'),
        _I('FG2020170FF', '20x20'), _I('FG2025170FF', '20x25'), _I('FG2030170FF', '20x30'), _I('FG3020170FF', '30x20'),
        _I('FG2430170FF', '24x30'), _I('FG2436170FF', '24x36'),
        _B,
        _S('FILTERS'),
        _I('F12121', '12x12 1" filter'), _I('F1414 1', '14x14 1" filter'), _I('F16161', '16x16 1" filter'), _I('F1818 1', '18x18 1" filter'),
        _I('F14201', '14x20 1" filter'), _I('F14251', '14x25 1" filter'), _I('F14301', '14x30 1" filter'), _I('F1630 1', '16x30 1" filter'),
        _I('F20201', '20x20 1" filter'), _I('F20251', '20x25 1" filter'), _I('F20301', '20x30 1" filter'), _I('F24301', '24x30 1" filter'),
        _I('F24361', '24x36 1" filter'),
        _B,
        _S('FLOOR REGISTERS'),
        _I('FR4X10302', '4x10 Floor grill'), _I('FR4X12302', '4x12 Floor grill'), _I('FR4X14302', '4x14 Floor grill'),
        _B,
        _S('CEILING REGISTERS'),
        _I('4X10 140', '4x10 three way'), _I('4X12 140', '4x12 three way'), _I('4X14 140', '4x14 three way'),
        _B,
        _S('ONE WAY CEILING(NVR)'),
        _I('4X10 ONEWAY', '4x10 One way grill'), _I('4X12 ONEWAY', '4x12 One way grill'), _I('4X14 ONEWAY', '4x14 One way grill'),
        _B,
        _S('BARRIER POSTS'),
        _I('WHP4', 'water heater post'), _I('TITANHDANCHOR', 'drive anchor'),
        _B,
        _S('PVC'),
        _I('PVC34PIPE', '3/4" pvc pipe'), _I('PVC3490', '3/4" pvc 90'), _I('PVC34MA', '3/4" pvc male adapt'), _I('PVC34C', '3/4" pvc coupling'),
        _I('PVC34PT', '3/4" pvc p-trap')
      ]
    },
    {
      x: [0.215, 1.215, 1.43, 2.335, 2.555, 2.94, 3.155, 3.665, 3.945, 4.71, 4.925, 5.75, 5.965, 6.525, 6.74, 7.25],
      top: 0.30, tituloX: 3.775, subX: 4.025, titulo: 'AHC TRIM OUT PULL SHEET',
      izq: [0, 2, 4, 6], der: [8, 10, 12, 14],
      L: [
        _S('GAS PIPE'),
        _I('BP11421', '1 1/4" gas pipe'), _I('BP121', '1" gas pipe'), _I('BP3421', '3/4" gas pipe'), _I('BP1221', '1/2" gas pipe'),
        _I('BP11490', '1 1/4" 90 degree'), _I('BP114C', '1 1/4" cap'), _I('BP114CP', '1 1/4" coupling'), _I('BP114T', '1 1/4" tee'),
        _I('BP114X6N', '1 1/4"x6" nipple'), _I('BP114X1BR', '1 1/4"x1" bell reducer'), _I('BP190', '1" 90 degree'), _I('BP1C', '1" cap'),
        _I('BP1CP', '1" coupling'), _I('BP1T', '1" tee'), _I('BP1X2N', '1"x2" nipple'), _I('BP1X6N', '1"x6" nipple'),
        _I('BP1X34BR', '1"x3/4" bell reducer'), _I('BP3490', '3/4" 90 degree'), _I('BP34C', '3/4" cap'), _I('BP34CP', '3/4" coupling'),
        _I('BP34T', '3/4" tee'), _I('BP34UN', '3/4" union'), _I('BP34GV', '3/4" gas valve'), _I('BP34X2N', '3/4"x2" nipple'),
        _I('BP34X6N', '3/4"x6" nipple'), _I('BP34X12BR', '3/4"x1/2" bell reducer'), _I('BP1290', '1/2" 90 degree'), _I('BP12C', '1/2" cap'),
        _I('BP12CP', '1/2" coupling'), _I('BP12T', '1/2" tee'), _I('BP12GV', '1/2" gas valve'), _I('BP12UN', '1/2" union'),
        _I('BP12X2N', '1/2"x2" nipple'), _I('BP12X3N', '1/2"x3" nipple'), _I('BP12X4N', '1/2"x4" nipple'), _I('BP12X5N', '1/2"x5" nipple'),
        _I('BP12X6N', '1/2"x6" nipple'), _I('TEST GUAGE', 'test gauge'), _I('BP3812MPT', '3/8"x1/2" mpt fitt'), _I('BP38FN', '3/8" flare nut'),
        _I('BPCHRKEYWALLST', 'chrome wall key'), _I('BPCHRKEYFLOOAGL', 'chrome floor key'), _I('FLEXGASHOSE', '1/2" flex gas hose'),
        _I('BP12TP', '1/2" trac pipe'), _I('BP12TPF', '1/2" trac pipe fitting')
      ],
      R: [
        _S('MISC'),
        _I('FLEXTAPE', 'flex tape'), _I('M SEAL FLOSS', 'sealfloss'), _I('6AL', '6" alum flex'), _I('8AL', '8" alum flex'),
        _I('M CAULK L', 'latex caulk'), _I('M CAULK S', 'silicone caulk'), _I('6JENNAIR', '6" jenn-air cap'), _I('8JENAIR', '8" Jenn air cap'),
        _I('DVC4', 'white dryer vent cap'), _I('4EVECAP', 'white eve cap'), _I('DVC4B', 'brown dryer vent cap'), _I('4BROWNEVECAP', 'brown eve cap'),
        _I('CS3', 'Drain pan float switch'), _I('LOCKINGPORTCAP', 'locking service port caps'), _I('M 8X2 SCREWS', '8X2 White screws'),
        _I('6EVECAP', 'white eve cap'), _I('6BROWNEVE', 'brown eve cap'), _I('DRYERBOXRING', 'Dryer Trim Ring'), _I('PAD3636', '36X36 AC PAD'),
        _I('6302K', 'AprilAire Zoneboard'), _I('6X14 170', '6X14 Tranfer Grill'), _I('M DRIVEPINS', '1 1/4 Drive pins'), _I('ANCHOR KIT', 'Plastic anchor kit'),
        _I('COPU', 'Condensate Pump'), _I('WN72B', 'Blue wire nuts'), _I('WN73B', 'Orange wire nuts'),
        _B,
        _S('SHEET METAL'),
        _I('SM PB U14', '#14 plenum box'), _I('SM PB U17', '#17 plenum box'), _I('SM PB U21', '#21 plenum box'), _I('SMDP18 30X72', 'large drain pan'),
        _I('SMDP17', 'small drain pan'), _I('SM3696', 'sheet metal'), _I('SM UNIT FL 7', 'angle flashing'), _I('SM UNIT FL 4', 'unit flashing'),
        _I('SR2 G', '14" sq to rnd- set'), _I('SR2.5-3.5 G', '16" sq to rnd- set'), _I('SR4 G', '18" sq to rnd- set'), _I('SR5 G', '20" sq to rnd- set'),
        _B,
        _S('DOUBLE WALL'),
        _I('4RD F', '4RD flashing'), _I('4RD SC', '4RD storm collar'), _I('4RD C', '4RD cap'), _I('4RD 60', '4RD 60"'), _I('4RD 36', '4RD 36"'),
        _I('4RD 24', '4RD 24"'), _I('4RD 18', '4RD 18"'), _I('4RD 12', '4RD 12"'), _I('4RD 90', '4RD 90 degree'), _I('4RD AJ12', '4RD 12" adjust')
      ]
    }
  ];
  const PS_FILAS = 56;            // renglones de partes por lado (igual que el papel nuevo)
  const PS_ALTO = 0.15625;        // alto de cada renglón en pulgadas
  const psClave = (pg, lado, i) => `${pg}${lado}${i}`;

  // ---- Hoja editable: textos y orden de los renglones ----
  // psLayout guarda qué va en cada renglón ({s: sección} | {p, d} | null vacío).
  // Empieza igual que el papel; lo que cambies se guarda en la nube.
  const PS_LAYOUT_KEY = 'gh-ps-layout';
  const psCopiarCol = (col) => Array.from({ length: PS_FILAS }, (_, i) => (col[i] ? { ...col[i] } : null));
  const psLayoutOriginal = () => PS_PAGINAS.map((pg) => ({ L: psCopiarCol(pg.L), R: psCopiarCol(pg.R) }));
  // v2 = papel de oct 2026. Los arreglos sin versión son del papel anterior:
  // se cambian por el papel nuevo y las cantidades se pasan por código de parte.
  const PS_LAYOUT_VER = 2;
  const PS_V1_CODIGOS = [{"L":[null,"BP11421","BP121","BP3421","BP1221","BP11490","BP114C","BP114CP","BP114T","BP114X6N","BP114X1BR","BP190","BP1C","BP1CP","BP1T","BP1X2N","BP1X6N","BP1X34BR","BP3490","BP34C","BP34CP","BP34T","BP34UN","BP34GV","BP34X2N","BP34X6N","BP34X12BR","BP1290","BP12C","BP12CP","BP12T","BP12GV","BP12UN","BP12X2N","BP12X3N","BP12X4N","BP12X5N","BP12X6N","TEST GUAGE","BP3812MPT","BP38FN","BPCHRKEYWALLST","BPCHRKEYFLOOAGL","FLEXGASHOSE","BP12TP","BP12TPF"],"R":[null,"FLEXTAPE","M SEAL FLOSS","6AL","M CAULK L","M CAULK S","6JENNAIR","DVC4","4EVECAP","DVC4B","4BROWNEVECAP","FLSW","LOCKINGPORTCAP",null,null,"SM PB U14","SM PB U17","SM PB U21","SMDP18 30X72","SMDP17","SM3696","SM UNIT FL 7","SM UNIT FL 4","SR2 G","SR2.5-3.5 G","SR4 G","SR5 G",null,null,"4RD F","4RD SC","4RD C","4RD 60","4RD 36","4RD 24","4RD 18","4RD 12","4RD 90","4RD AJ12",null,null,"6EVECAP","6BROWNEVE",""]},{"L":[null,"RMP20","RMP18","RMP16","RMP14","RMP12","RMP10","RMP6","RMP4",null,null,"90MP6","90MP4",null,null,"E 34 SEAL","E 34 SEALC90","E 34 SEALCST","E 34 RS","E 12 SEAL","E 12 SEALC90","E 12 SEALCST","E 12 RS","E TOG","E COV","E 24 HB","WTHHN10B","WTHHN10G","WTHHN8B","WTHHN6B",null,null,"LS7838","C7890","A7834","LS3438","C3490",null,null,"TH4110U2005AMER","TH4210U2002AMER",null,null,"FD20R8","FD18R8","FD16R8","FD14R8","FD12R8","FD10R8","FD8R8","FD7R8","FD6R8","FD5R8"],"R":[null,"FG1212 170FF","FG1414 170FF","FG1616 170FF","FG1818 170FF","FG1420170FF","FG1425170FF","FG1430170FF","FG1630 170FF","FG2020170FF","FG2025170FF","FG2030170FF","FG3020170FF","FG2430170FF","FG2436170FF",null,null,"F12121","F1414 1","F16161","F1818 1","F14201","F14251","F14301","F1630 1","F20201","F20251","F20301","F24301","F24361",null,null,"FR4X10302","FR4X12302","FR4X14302",null,null,"4X10 140","4X12 140","4X14 140",null,null,"WHP","WHP4","TITANHDANCHOR",null,null,"PVC34PIPE","PVC3490","PVC34MA","PVC34C","PVC34PT"]}];
  const PS_ALIAS = { 'RMP4': 'RMP428GA', 'FLSW': 'CS3' };
  function psNormalizar(lay) {
    if (lay && !Array.isArray(lay) && lay.v === PS_LAYOUT_VER && Array.isArray(lay.p) && lay.p.length === PS_PAGINAS.length) {
      return lay.p.map((pg) => ({ L: psCopiarCol((pg && pg.L) || []), R: psCopiarCol((pg && pg.R) || []) }));
    }
    return psLayoutOriginal();
  }
  const psLayoutJSON = () => JSON.stringify({ v: PS_LAYOUT_VER, p: psLayout });
  // Pasa las cantidades de un borrador del papel viejo a los renglones del
  // papel nuevo (mismo código de parte). Corre una sola vez por borrador.
  function psMigrarBorrador() {
    try {
      const d = JSON.parse(localStorage.getItem(ghLK(PS_KEY)) || 'null');
      if (!d || d.qv === PS_LAYOUT_VER) return;
      const q = d.q || {};
      if (Object.keys(q).length) {
        let ref = PS_V1_CODIGOS;
        try {
          const crudo = JSON.parse(localStorage.getItem(ghLK(PS_LAYOUT_KEY)) || 'null');
          if (Array.isArray(crudo) && crudo.length === 2) ref = crudo.map((pg) => ({ L: (pg.L || []).map((f) => (f && !f.s ? f.p : null)), R: (pg.R || []).map((f) => (f && !f.s ? f.p : null)) }));
        } catch (e) {}
        const norm = (c) => { const k = String(c || '').trim().toUpperCase(); return PS_ALIAS[k] || k; };
        const pos = new Map();
        psLayoutOriginal().forEach((pg, n) => ['L', 'R'].forEach((l) => pg[l].forEach((f, i) => {
          if (!f || f.s || !f.p) return; const k = norm(f.p); if (!pos.has(k)) pos.set(k, []); pos.get(k).push(psClave(n, l, i));
        })));
        const usados = {}, nq = {};
        ref.forEach((pg, n) => ['L', 'R'].forEach((l) => ((pg && pg[l]) || []).forEach((cod, i) => {
          if (!cod) return; const k = norm(cod); const lst = pos.get(k); if (!lst) return;
          const u = usados[k] || 0; const dest = lst[u]; if (!dest) return; usados[k] = u + 1;
          ['o', 's'].forEach((c) => { const v = q[psClave(n, l, i) + c]; if (v) nq[dest + c] = v; });
        })));
        d.q = nq;
      }
      d.qv = PS_LAYOUT_VER;
      localStorage.setItem(ghLK(PS_KEY), JSON.stringify(d));
    } catch (e) {}
  }
  let psLayout = (() => { try { return psNormalizar(JSON.parse(localStorage.getItem(ghLK(PS_LAYOUT_KEY)))); } catch (e) { return psLayoutOriginal(); } })();
  let psModo = 'llenar';     // 'llenar' (cantidades) o 'editar' (textos y orden)
  let psSel = null;          // renglón elegido en modo editar: {n, lado, i}
  let psGuardarLayoutT = null;
  function psGuardarLayout() {
    try { localStorage.setItem(ghLK(PS_LAYOUT_KEY), psLayoutJSON()); } catch (e) {}
    clearTimeout(psGuardarLayoutT);
    psGuardarLayoutT = setTimeout(async () => { try { await window.storage.set(PS_LAYOUT_KEY, psLayoutJSON()); } catch (e) {} }, 600);
  }
  async function psCargarLayoutNube() {
    // Ya con la sesión lista se sabe qué base es: vuelve a leer las hojas
    // con las claves de ESTA base (al abrir se leyeron antes de saberlo).
    if (typeof window.GH_ESPERAR_SESION === 'function') { try { await window.GH_ESPERAR_SESION(); } catch (e) {} }
    psMigrarBorrador();
    psCfgCargar();
    try {
      const local = (() => { try { return psNormalizar(JSON.parse(localStorage.getItem(ghLK(PS_LAYOUT_KEY)))); } catch (e) { return psLayoutOriginal(); } })();
      if (JSON.stringify(local) !== JSON.stringify(psLayout)) psLayout = local;
      if (csTipo === 'pull') { if ($('ps-hoja') && psModo === 'llenar') psLlenar(psLeerGuardado()); }
      else csLlenar(csLeerGuardado(csTipo));
    } catch (e) {}
    try {
      const r = await window.storage.get(PS_LAYOUT_KEY);
      if (r && r.value) {
        const nube = psNormalizar(JSON.parse(r.value));
        if (JSON.stringify(nube) !== JSON.stringify(psLayout)) {
          psLayout = nube;
          try { localStorage.setItem(ghLK(PS_LAYOUT_KEY), psLayoutJSON()); } catch (e) {}
          if ($('ps-hoja') && psModo === 'llenar') psLlenar(psLeerGuardado());
        }
      }
    } catch (e) {}
  }

  // Reordena una columna (página n, lado L/R): nuevo[j] = viejo[perm[j]].
  // Las cantidades (ORDER/SHIP) se mueven junto con su renglón.
  function psPermutar(n, lado, perm) {
    const col = psLayout[n][lado];
    psLayout[n][lado] = perm.map((k) => (k == null ? null : col[k]));
    const d = psLeerGuardado(); const q = d.q || {}; const nq = { ...q };
    for (let j = 0; j < PS_FILAS; j++) { delete nq[psClave(n, lado, j) + 'o']; delete nq[psClave(n, lado, j) + 's']; }
    perm.forEach((k, j) => {
      if (k == null) return;
      ['o', 's'].forEach((c) => { const v = q[psClave(n, lado, k) + c]; if (v) nq[psClave(n, lado, j) + c] = v; });
    });
    d.q = nq;
    try { localStorage.setItem(ghLK(PS_KEY), JSON.stringify(d)); } catch (e) {}
    psGuardarLayout();
  }
  const psIdent = () => Array.from({ length: PS_FILAS }, (_, j) => j);

  function psAccion(accion) {
    if (!psSel) { toast('Primero toca un renglón de la hoja', 'info', 2200); return; }
    const { n, lado } = psSel; let { i } = psSel;
    const col = psLayout[n][lado];
    if (accion === 'subir' || accion === 'bajar') {
      const j = accion === 'subir' ? i - 1 : i + 1;
      if (j < 0 || j >= PS_FILAS) return;
      const perm = psIdent(); perm[i] = j; perm[j] = i;
      psPermutar(n, lado, perm); i = j;
    } else if (accion === 'insertar') {
      if (col[PS_FILAS - 1]) { toast('No cabe otro renglón en esta columna: quita uno de abajo primero', 'error', 3200); return; }
      const perm = psIdent().map((j) => (j < i ? j : j === i ? null : j - 1));
      psPermutar(n, lado, perm);
    } else if (accion === 'quitar') {
      const perm = psIdent().map((j) => (j < i ? j : (j + 1 < PS_FILAS ? j + 1 : null)));
      psPermutar(n, lado, perm);
    } else if (accion === 'seccion') {
      const f = col[i];
      if (f && f.s) col[i] = { p: f.s, d: '' };
      else {
        col[i] = { s: (f && (f.p || f.d)) || 'NEW SECTION' };
        const d = psLeerGuardado(); if (d.q) { delete d.q[psClave(n, lado, i) + 'o']; delete d.q[psClave(n, lado, i) + 's']; }
        try { localStorage.setItem(ghLK(PS_KEY), JSON.stringify(d)); } catch (e) {}
      }
      psGuardarLayout();
    }
    psSel = { n, lado, i };
    psLlenar(psLeerGuardado());
  }

  function psMarcarSel() {
    document.querySelectorAll('#ps-hoja td.sel').forEach((td) => td.classList.remove('sel'));
    const info = $('ps-sel-info');
    if (!psSel) { if (info) info.textContent = 'Toca un renglón de la hoja para moverlo o cambiarlo'; return; }
    const r = `${psSel.n}|${psSel.lado}|${psSel.i}`;
    document.querySelectorAll(`#ps-hoja td[data-r="${r}"]`).forEach((td) => td.classList.add('sel'));
    const f = psLayout[psSel.n][psSel.lado][psSel.i];
    const nombre = f ? (f.s || f.p || f.d || '(sin nombre)') : '(renglón vacío)';
    if (info) info.innerHTML = `<strong>${escapeHtml(nombre)}</strong> · página ${psSel.n + 1}, lado ${psSel.lado === 'L' ? 'izquierdo' : 'derecho'}, renglón ${psSel.i + 1}`;
    const bs = $('ps-ed-seccion'); if (bs) bs.textContent = f && f.s ? '↺ Hacer parte' : '▤ Hacer sección';
  }

  function psCambiarModo(modo) {
    if (psModo === 'llenar' && modo === 'editar') psGuardarBorrador();
    psModo = modo;
    psSel = null;
    $('ps-editbar').style.display = modo === 'editar' ? '' : 'none';
    $('ps-btn-editar').textContent = modo === 'editar' ? '✓ Listo' : '✎ Editar hoja';
    $('ps-btn-editar').classList.toggle('gc-save-btn', modo === 'editar');
    $('ps-hoja').classList.toggle('editando', modo === 'editar');
    psLlenar(psLeerGuardado());
  }

  function psLeerGuardado() {
    try { return JSON.parse(localStorage.getItem(ghLK(PS_KEY)) || '{}') || {}; } catch (e) { return {}; }
  }
  function psLeer() {
    const q = {};
    document.querySelectorAll('#ps-hoja input[data-ps]').forEach((i) => { if (i.value.trim()) q[i.dataset.ps] = i.value.trim(); });
    const h = (k) => { const el = document.querySelector(`#ps-hoja input[data-h="${k}"]`); return el ? el.value.trim() : ''; };
    return { fecha: h('fecha'), job: h('job'), builder: h('builder'), lote: h('lote'), puller: h('puller'), installer: h('installer'), q, qv: PS_LAYOUT_VER };
  }
  function psGuardarBorrador() {
    if (psModo === 'editar') return;   // en modo editar no hay casillas de cantidades en pantalla
    const d = psLeer();
    try { localStorage.setItem(ghLK(PS_KEY), JSON.stringify(d)); } catch (e) {}
    csCompartirLote(d.lote, 'pull');
    cslProgramar('pull', d);
    psContar();
  }
  function psContar() {
    const n = [...document.querySelectorAll('#ps-hoja input[data-ps]')].filter((i) => i.value.trim()).length;
    const el = $('ps-contador'); if (el) el.textContent = n ? `${n} casilla${n === 1 ? '' : 's'} llena${n === 1 ? '' : 's'}` : '';
  }

  function psLlenar(d) {
    d = d || {};
    const hoja = $('ps-hoja');
    hoja.innerHTML = psBuildPrint(d, psModo === 'editar' ? 'editar' : true);
    if (psModo === 'editar') {
      hoja.querySelectorAll('input[data-e]').forEach((inp) => {
        const [n, lado, i, campo] = inp.dataset.e.split('|');
        const sel = () => { psSel = { n: +n, lado, i: +i }; psMarcarSel(); };
        inp.addEventListener('focus', sel);
        inp.addEventListener('input', () => {
          const col = psLayout[+n][lado]; const v = inp.value;
          if (campo === 's') col[+i] = v.trim() ? { s: v } : null;
          else {
            const f = col[+i] && !col[+i].s ? col[+i] : { p: '', d: '' };
            f[campo] = v; col[+i] = (f.p || f.d) ? f : null;
          }
          psGuardarLayout(); psMarcarSel();
        });
      });
      hoja.querySelectorAll('td[data-r]').forEach((td) => td.addEventListener('click', (e) => {
        if (e.target.tagName === 'INPUT') return;
        const [n, lado, i] = td.dataset.r.split('|'); psSel = { n: +n, lado, i: +i }; psMarcarSel();
      }));
      psMarcarSel(); psAplicarZoom();
      return;
    }
    hoja.querySelectorAll('input').forEach((i) => {
      // El encabezado sale en las dos páginas: lo que escribes en una se copia a la otra
      if (i.dataset.h) i.addEventListener('input', () => {
        hoja.querySelectorAll(`input[data-h="${i.dataset.h}"]`).forEach((o) => { if (o !== i) o.value = i.value; });
      });
      i.addEventListener('input', psGuardarBorrador);
      i.addEventListener('change', psGuardarBorrador);
    });
    psAplicarZoom();
    psContar();
  }

  // Zoom de la hoja en pantalla: "Ajustar" la hace caber a lo ancho; con +/−
  // se agranda para escribir cómodo (se recorre de lado con el dedo).
  let psZoom = null;   // null = ajustar a lo ancho
  function psAplicarZoom() {
    const hoja = $('ps-hoja'), marco = $('ps-marco-hoja');
    if (!hoja || !marco) return;
    const anchoHoja = 8.5 * 96 + 2;
    const ajustar = Math.min(1, (marco.clientWidth || anchoHoja) / anchoHoja);
    const z = psZoom == null ? ajustar : psZoom;
    hoja.style.zoom = z;
    const lbl = $('ps-zoom-lbl'); if (lbl) lbl.textContent = Math.round(z * 100) + '%';
  }
  function psCambiarZoom(delta) {
    const actual = parseFloat($('ps-hoja').style.zoom) || 1;
    psZoom = Math.max(0.35, Math.min(2, Math.round((actual + delta) * 20) / 20));
    psAplicarZoom();
  }

  const PS_PRINT_CSS = `
    @page { size: letter; margin: 0; }
    * { box-sizing: border-box; }
    html, body { margin: 0; padding: 0; background: #fff; }
    body { font-family: 'Carlito', 'Calibri', 'Helvetica Neue', Arial, sans-serif; color: #111;
           -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    /* 10.9in (no 11): en iPhone una página de 11in exactas se pasa por un pelo
       y Safari mete una hoja en blanco detrás de cada página */
    .ps-pag { position: relative; width: 8.5in; height: 10.9in; overflow: hidden; break-inside: avoid; page-break-inside: avoid; }
    .ps-pag + .ps-pag { page-break-before: always; break-before: page; }
    .ps-t { position: absolute; font-size: 8.9pt; font-weight: 700; white-space: nowrap; line-height: ${PS_ALTO}in; height: ${PS_ALTO}in; }
    .ps-g { position: absolute; border-collapse: collapse; table-layout: fixed; font-size: 8.9pt; }
    .ps-g td { height: ${PS_ALTO}in; padding: 0 0 0 0.025in; border: 0.6pt solid #8a8a8a; white-space: nowrap;
               overflow: visible; line-height: ${PS_ALTO - 0.01}in; vertical-align: bottom; }
    .ps-g td.v { border-bottom: 1pt solid #111; text-align: center; padding: 0; font-size: 9.5pt; font-weight: 700; }
    .ps-g td.b { font-weight: 700; }
    .ps-g td.ov { position: relative; }
    .ps-g td.ov span { position: absolute; left: 0.025in; bottom: 0; background: transparent; }
    .ps-g td.v.q span { left: 0; right: 0; text-align: center; }
    .ps-marco { position: absolute; border: 1.2pt solid #111; pointer-events: none; }
  `;

  // Mide cuánto ocupa un texto con la letra de la hoja (pulgadas)
  let psCtx = null;
  function psMedir(texto, negrita) {
    try {
      psCtx = psCtx || document.createElement('canvas').getContext('2d');
      psCtx.font = `${negrita ? '700 ' : ''}8.9pt Carlito, Calibri, Arial, sans-serif`;
      return psCtx.measureText(String(texto)).width / 96;
    } catch (e) { return String(texto).length * 0.055; }
  }
  // Cuando termina de cargar la letra de la hoja, se vuelve a dibujar (para medir bien)
  try {
    if (document.fonts && document.fonts.load) Promise.all([document.fonts.load('8.9pt Carlito'), document.fonts.load('700 8.9pt Carlito')]).then(() => {
      if ($('ps-hoja') && $('ps-hoja').innerHTML && typeof psLlenar === 'function' && psModo === 'llenar') { psGuardarBorrador(); psLlenar(psLeerGuardado()); }
    }).catch(() => {});
  } catch (e) {}
  function psBuildPrint(d, editable) {
    d = d || {};
    const modoEditar = editable === 'editar';
    const q = d.q || {};
    const fechaUS = d.fecha ? csFechaUS(d.fecha) : '';
    return PS_PAGINAS.map((pg, n) => {
      const x = pg.x, nc = x.length - 1;
      const anchos = x.slice(1).map((v, i) => (v - x[i]).toFixed(3));
      const anchosN = anchos.map(Number);
      const cols = anchos.map((w) => `<col style="width:${w}in">`).join('');
      // Una fila de la tabla: arreglo de {c: columna, t: texto, cls, span}
      const fila = (celdas) => {
        let out = '<tr>', c = 0;
        const porCol = {}; celdas.forEach((x2) => { if (!x2.soloR) porCol[x2.c] = x2; });
        const rPorCol = {}; celdas.forEach((x2) => { if (x2.soloR) rPorCol[x2.c] = x2.r; });
        // Como en el papel: si el texto no cabe en su casilla, sigue sobre las
        // casillas vacías de al lado y la raya desaparece solo en ese tramo.
        // Si choca con una casilla ocupada, la letra se hace un poco más chica.
        const ocupada = new Set();
        celdas.forEach((x2) => { if (x2.soloR) return; const tiene = (x2.t != null && x2.t !== '') || x2.e || (x2.k && (editable === true || (x2.raw != null && x2.raw !== ''))); if (tiene) for (let j = x2.c; j < x2.c + (x2.span || 1); j++) ocupada.add(j); });
        const sinRaya = new Set(), achicar = {};
        celdas.forEach((x2) => {
          if (x2.soloR || x2.k || x2.e || !x2.t || /\bv\b/.test(x2.cls || '')) return;
          const span = x2.span || 1;
          const necesita = psMedir(x2.t, /\bb\b/.test(x2.cls || '')) + 0.03;
          let hay = 0; for (let j = x2.c; j < x2.c + span; j++) hay += anchosN[j] || 0;
          let j = x2.c + span;
          while (necesita > hay && j < nc && !ocupada.has(j)) { sinRaya.add(j - 1); hay += anchosN[j]; j++; }
          if (necesita > hay) achicar[x2.c] = Math.max(0.72, hay / necesita);
        });
        const raya = (col) => (sinRaya.has(col) ? ' style="border-right-style:hidden"' : '');
        while (c < nc) {
          const cel = porCol[c];
          if (cel) {
            const span = cel.span || 1;
            let txt = cel.t ? `<span${achicar[c] ? ` style="font-size:${(8.9 * achicar[c]).toFixed(2)}pt"` : ''}>${escapeHtml(cel.t)}</span>` : '';
            if (modoEditar && cel.e) {
              txt = `<input type="text" class="ps-e" data-e="${cel.e}" value="${escapeHtml(cel.raw || '')}" autocomplete="off" autocapitalize="characters" spellcheck="false">`;
            } else if (editable === true && cel.k) {
              const val = cel.k === 'h:fecha' ? (d.fecha || '') : (cel.raw || '');
              txt = `<input type="${cel.k === 'h:fecha' ? 'date' : 'text'}" ${cel.k.startsWith('h:') ? `data-h="${cel.k.slice(2)}"` : `data-ps="${cel.k}" inputmode="decimal"`} value="${escapeHtml(val)}" autocomplete="off">`;
            }
            out += `<td class="ov ${cel.cls || ''}"${span > 1 ? ` colspan="${span}"` : ''}${cel.r ? ` data-r="${cel.r}"` : ''}${raya(c + span - 1)}>${txt}</td>`;
            c += span;
          } else { out += `<td${rPorCol[c] ? ` data-r="${rPorCol[c]}"` : ''}${raya(c)}></td>`; c++; }
        }
        return out + '</tr>';
      };
      const [lp, ld, lo, ls] = pg.izq, [rp, rd, ro, rs] = pg.der;
      let filas = '';
      // 1-2: título (va encima, posicionado aparte, como en el papel)
      filas += fila([]) + fila([]);
      // 3-5: encabezado
      const enc = [['DATE', fechaUS, 'fecha', 'LOT/SUB', d.lote, 'lote'], ['JOB', d.job, 'job', 'PULLER', d.puller, 'puller'], ['BUILDER', d.builder, 'builder', 'INSTALLER', d.installer, 'installer']];
      enc.forEach(([a, va, ka, b, vb, kb]) => {
        const ed = true;   // en pantalla se puede escribir en el encabezado de las dos páginas
        filas += fila([
          { c: ld, t: a, cls: 'b' }, { c: lo, t: va, cls: 'v', span: ls - lo + 1, k: ed ? 'h:' + ka : null, raw: va },
          { c: rd, t: b, cls: 'b' }, { c: ro, t: vb, cls: 'v', span: rs - ro + 1, k: ed ? 'h:' + kb : null, raw: vb }
        ]);
      });
      filas += fila([]);
      filas += fila([{ c: lp, t: 'PART' }, { c: ld, t: 'DESCRIPTION' }, { c: lo, t: 'ORDER' }, { c: ls, t: 'SHIP' },
                     { c: rp, t: 'PART' }, { c: rd, t: 'DESCRIPTION' }, { c: ro, t: 'ORDER' }, { c: rs, t: 'SHIP' }]);
      filas += fila([]);
      for (let i = 0; i < PS_FILAS; i++) {
        const celdas = [];
        [['L', lp, ld, lo, ls], ['R', rp, rd, ro, rs]].forEach(([lado, p, de, o, s]) => {
          const f = (psLayout[n] && psLayout[n][lado][i]) || null;
          const r = `${n}|${lado}|${i}`;
          if (modoEditar) {
            // Todo el renglón de ese lado es tocable para elegirlo
            for (let c2 = p; c2 <= s + 1 && c2 < nc; c2++) celdas.push({ c: c2, r, soloR: true });
            if (f && f.s) { celdas.push({ c: p, cls: 'b', span: de - p + 1, e: `${r}|s`, raw: f.s, r }); return; }
            celdas.push({ c: p, e: `${r}|p`, raw: f ? f.p : '', r }, { c: de, e: `${r}|d`, raw: f ? f.d : '', r },
              { c: o, cls: f ? 'v q' : '', r }, { c: s, cls: f ? 'v q' : '', r });
            return;
          }
          if (!f) return;
          if (f.s) { celdas.push({ c: p, t: f.s, cls: 'b' }); return; }
          const k = psClave(n, lado, i);
          celdas.push({ c: p, t: f.p }, { c: de, t: f.d },
            { c: o, t: q[k + 'o'] || '', cls: 'v q', k: k + 'o', raw: q[k + 'o'] || '' },
            { c: s, t: q[k + 's'] || '', cls: 'v q', k: k + 's', raw: q[k + 's'] || '' });
        });
        filas += fila(celdas);
      }
      const ancho = (x[nc] - x[0]).toFixed(3), alto = ((PS_FILAS + 8) * PS_ALTO).toFixed(3);
      return `<div class="ps-pag">
        <table class="ps-g" style="left:${x[0]}in;top:${pg.top}in;width:${ancho}in;">${cols}${filas}</table>
        <div class="ps-marco" style="left:${x[0]}in;top:${pg.top}in;width:${ancho}in;height:${alto}in;"></div>
        <div class="ps-t" style="left:${pg.tituloX}in;top:${pg.top}in;">${pg.titulo}</div>
        <div class="ps-t" style="left:${pg.subX}in;top:${(pg.top + PS_ALTO).toFixed(4)}in;">STANDARD TRIM</div>
      </div>`;
    }).join('');
  }

  function psDocumento(titulo) {
    return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${escapeHtml(titulo)}</title>
      <link rel="preconnect" href="https://fonts.googleapis.com">
      <link href="https://fonts.googleapis.com/css2?family=Carlito:wght@400;700&display=block" rel="stylesheet">
      <style>${PS_PRINT_CSS}</style></head><body>${psBuildPrint(psLeerGuardado())}</body></html>`;
  }

  // ---- Configuraciones de material (ej. "Casa de gas") ----
  // Guardan las cantidades de ORDER por código de parte, así siguen sirviendo
  // aunque muevas renglones o cambie el papel. Viven en la base de datos.
  const PS_CFG_KEY = 'gh-ps-config';
  let psCfgs = [];
  const psCodigo = (c) => String(c || '').trim().toUpperCase();
  async function psCfgCargar() {
    let lista = null;
    try { const r = await window.storage.get(PS_CFG_KEY); lista = r && r.value ? JSON.parse(r.value) : null; } catch (e) { lista = null; }
    if (!Array.isArray(lista)) {
      // Solo la base principal empieza con un ejemplo (lo marcado en tu hoja de papel)
      lista = ghEsBasePrincipal() ? [{ id: 'cfg-ejemplo', nombre: 'Casa de gas (ejemplo de tu hoja)', items: { 'TH2110U4004': { o: '2' }, '4X10 140': { o: '3' }, '4X12 140': { o: '4' }, '4X14 140': { o: '4' }, 'DRYERBOXRING': { o: '1' } } }] : [];
    }
    psCfgs = lista;
    psCfgPintar();
  }
  async function psCfgGuardar() { try { await window.storage.set(PS_CFG_KEY, JSON.stringify(psCfgs)); } catch (e) { toast('No se pudo guardar la configuración', 'error'); } }
  function psCfgPintar() {
    const sel = $('ps-cfg-sel'); if (!sel) return;
    const v = sel.value;
    sel.innerHTML = '<option value="">Configuración de material…</option>' + psCfgs.map((c) => `<option value="${escapeHtml(c.id)}">${escapeHtml(c.nombre)} (${Object.keys(c.items || {}).length})</option>`).join('');
    if (psCfgs.some((c) => c.id === v)) sel.value = v;
  }
  // Posiciones (claves de casilla) de cada código en la hoja actual
  function psPosiciones() {
    const m = new Map();
    psLayout.forEach((pg, n) => ['L', 'R'].forEach((l) => pg[l].forEach((f, i) => {
      if (!f || f.s || !f.p) return; const k = psCodigo(f.p); if (!m.has(k)) m.set(k, []); m.get(k).push(psClave(n, l, i));
    })));
    return m;
  }
  function psCfgDesdeHoja() {
    if (psModo === 'editar') psCambiarModo('llenar');
    psGuardarBorrador();
    const q = (psLeerGuardado().q) || {};
    const items = {};
    psLayout.forEach((pg, n) => ['L', 'R'].forEach((l) => pg[l].forEach((f, i) => {
      if (!f || f.s || !f.p) return;
      const o = q[psClave(n, l, i) + 'o']; if (o) items[psCodigo(f.p)] = { o };
    })));
    return items;
  }
  async function psCfgAplicar(cfg) {
    if (psModo === 'editar') psCambiarModo('llenar');
    psGuardarBorrador();
    const d = psLeerGuardado(); const q = d.q || {};
    const hay = Object.keys(q).some((k) => k.endsWith('o') && q[k]);
    if (hay && !await gcConfirm(`¿Aplicar "${cfg.nombre}"? Se reemplazan las cantidades de ORDER que ya tiene la hoja (SHIP y el encabezado no se tocan).`, { okText: 'Aplicar' })) return;
    Object.keys(q).forEach((k) => { if (k.endsWith('o')) delete q[k]; });
    const pos = psPosiciones(); let puestos = 0; const faltan = [];
    Object.entries(cfg.items || {}).forEach(([cod, v]) => {
      const lst = pos.get(psCodigo(cod));
      if (!lst || !lst.length || !v || !v.o) { if (v && v.o) faltan.push(cod); return; }
      q[lst[0] + 'o'] = v.o; puestos++;
    });
    d.q = q; d.qv = PS_LAYOUT_VER;
    try { localStorage.setItem(ghLK(PS_KEY), JSON.stringify(d)); } catch (e) {}
    psLlenar(psLeerGuardado());
    toast(`"${cfg.nombre}" aplicada: ${puestos} parte(s)` + (faltan.length ? ` · no están en la hoja: ${faltan.slice(0, 4).join(', ')}` : ''), faltan.length ? 'info' : 'success', 4000);
  }
  function psCfgIniciar() {
    if (!$('ps-cfg')) return;
    $('ps-cfg-aplicar').addEventListener('click', () => {
      const c = psCfgs.find((x) => x.id === $('ps-cfg-sel').value);
      if (!c) { toast('Elige una configuración', 'info'); $('ps-cfg-sel').focus(); return; }
      psCfgAplicar(c);
    });
    const abrir = (si) => { $('ps-cfg-nueva').style.display = si ? '' : 'none'; if (si) { const c = psCfgs.find((x) => x.id === $('ps-cfg-sel').value); $('ps-cfg-nombre').value = c ? c.nombre : ''; $('ps-cfg-nombre').focus(); } };
    $('ps-cfg-nueva-btn').addEventListener('click', () => abrir($('ps-cfg-nueva').style.display === 'none'));
    $('ps-cfg-nueva-no').addEventListener('click', () => abrir(false));
    const guardar = async () => {
      const nombre = $('ps-cfg-nombre').value.replace(/\s+/g, ' ').trim();
      if (!nombre) { toast('Ponle nombre (ej. Casa de gas)', 'error'); $('ps-cfg-nombre').focus(); return; }
      const items = psCfgDesdeHoja();
      if (!Object.keys(items).length) { toast('Primero escribe cantidades en ORDER de la hoja', 'error'); return; }
      const existe = psCfgs.find((x) => x.nombre.toLowerCase() === nombre.toLowerCase());
      if (existe) {
        if (!await gcConfirm(`Ya hay una configuración "${existe.nombre}". ¿Reemplazarla con lo que tiene la hoja ahora?`, { okText: 'Reemplazar' })) return;
        existe.items = items;
      } else psCfgs.push({ id: 'cfg-' + Date.now(), nombre, items });
      await psCfgGuardar(); psCfgPintar();
      $('ps-cfg-sel').value = (existe || psCfgs[psCfgs.length - 1]).id;
      abrir(false);
      toast(`Configuración "${nombre}" guardada (${Object.keys(items).length} partes) ✓`, 'success');
    };
    $('ps-cfg-nueva-ok').addEventListener('click', guardar);
    $('ps-cfg-nombre').addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); guardar(); } if (e.key === 'Escape') abrir(false); });
    $('ps-cfg-borrar').addEventListener('click', async () => {
      const c = psCfgs.find((x) => x.id === $('ps-cfg-sel').value);
      if (!c) { toast('Elige la configuración que quieres borrar', 'info'); return; }
      if (!await gcConfirm(`¿Borrar la configuración "${c.nombre}"? La hoja no cambia.`, { okText: 'Borrar', danger: true })) return;
      psCfgs = psCfgs.filter((x) => x !== c); await psCfgGuardar(); psCfgPintar();
    });
    $('ps-cfg-limpiar').addEventListener('click', async () => {
      if (!await gcConfirm('¿Borrar todas las cantidades (ORDER y SHIP) de la hoja? El encabezado se queda.', { okText: 'Limpiar' })) return;
      if (psModo === 'editar') psCambiarModo('llenar');
      psGuardarBorrador();
      const d = psLeerGuardado(); d.q = {}; d.qv = PS_LAYOUT_VER;
      try { localStorage.setItem(ghLK(PS_KEY), JSON.stringify(d)); } catch (e) {}
      psLlenar(psLeerGuardado());
    });
  }

  // ---- Moverse con las flechas del teclado (y Enter = abajo) ----
  // Se busca la casilla vecina por su posición en pantalla, así sirve igual
  // en ORDER/SHIP, en el encabezado y en modo "Editar hoja".
  function psVecino(actual, dir) {
    const hoja = $('ps-hoja');
    const r0 = actual.getBoundingClientRect();
    const cx0 = r0.left + r0.width / 2, cy0 = r0.top + r0.height / 2;
    let mejor = null, mejorD = Infinity;
    hoja.querySelectorAll('input').forEach((el) => {
      if (el === actual || el.disabled || el.type === 'hidden') return;
      const r = el.getBoundingClientRect(); if (!r.width || !r.height) return;
      const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
      let d;
      if (dir === 'ArrowUp' || dir === 'ArrowDown') {
        const solapa = r.left < r0.right - 1 && r.right > r0.left + 1;
        if (!solapa) return;
        const dy = dir === 'ArrowDown' ? cy - cy0 : cy0 - cy;
        if (dy <= r0.height * 0.5) return;
        d = dy + Math.abs(cx - cx0) * 0.01;
      } else {
        const misma = Math.abs(cy - cy0) < Math.max(r0.height, r.height) * 0.6;
        if (!misma) return;
        const dx = dir === 'ArrowRight' ? cx - cx0 : cx0 - cx;
        if (dx <= 1) return;
        d = dx;
      }
      if (d < mejorD) { mejorD = d; mejor = el; }
    });
    return mejor;
  }
  function psTeclas(e) {
    const t = e.target;
    if (!t || t.tagName !== 'INPUT') return;
    const k = e.key;
    if (!['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Enter'].includes(k)) return;
    if (e.altKey || e.ctrlKey || e.metaKey) return;
    if (t.type === 'date' && k !== 'Enter') return;   // en la fecha las flechas cambian día/mes
    if ((k === 'ArrowLeft' || k === 'ArrowRight') && t.type === 'text') {
      const v = t.value || '', a = t.selectionStart, b = t.selectionEnd;
      const todo = v.length > 0 && a === 0 && b === v.length;
      if (!todo && a != null) {
        if (k === 'ArrowLeft' && !(a === 0 && b === 0)) return;
        if (k === 'ArrowRight' && !(a === v.length && b === v.length)) return;
      }
    }
    const dir = k === 'Enter' ? (e.shiftKey ? 'ArrowUp' : 'ArrowDown') : k;
    const dest = psVecino(t, dir);
    e.preventDefault();
    if (dest) {
      dest.focus();
      try { if (dest.type === 'text') dest.select(); } catch (err) {}
    }
  }

  (function psIniciar() {
    if (!$('ps-hoja')) return;
    $('ps-hoja').addEventListener('keydown', psTeclas);
    psCfgIniciar();
    try {
      if (!localStorage.getItem('gh-ps-fecha-limpia')) {
        const d0 = psLeerGuardado(); if (d0.fecha) { delete d0.fecha; localStorage.setItem(ghLK(PS_KEY), JSON.stringify(d0)); }
        localStorage.setItem('gh-ps-fecha-limpia', '1');
      }
    } catch (e) {}
    psMigrarBorrador();
    psLlenar(psLeerGuardado());
    $('ps-zoom-menos').addEventListener('click', () => psCambiarZoom(-0.15));
    $('ps-zoom-mas').addEventListener('click', () => psCambiarZoom(0.15));
    $('ps-zoom-ajustar').addEventListener('click', () => { psZoom = null; psAplicarZoom(); });
    window.addEventListener('resize', psAplicarZoom);
    $('ps-btn-editar').addEventListener('click', () => psCambiarModo(psModo === 'editar' ? 'llenar' : 'editar'));
    document.querySelectorAll('#ps-editbar [data-psacc]').forEach((b) => b.addEventListener('click', () => psAccion(b.dataset.psacc)));
    $('ps-ed-restaurar').addEventListener('click', async () => {
      if (!await gcConfirm('¿Regresar el Pull Sheet a como viene en el papel? Se pierden los cambios de textos y orden (las cantidades que escribiste también se borran).', { okText: 'Restaurar', danger: true })) return;
      psLayout = psLayoutOriginal(); psGuardarLayout();
      const d = psLeerGuardado(); d.q = {}; try { localStorage.setItem(ghLK(PS_KEY), JSON.stringify(d)); } catch (e) {}
      psSel = null; psLlenar(psLeerGuardado());
      toast('Pull Sheet como el original ✓', 'info', 2000);
    });
    psCargarLayoutNube();
  })();
  // ---- Activar / desactivar Completion Sheets (Ajustes → Avanzado) ----
  const CS_ACTIVO_KEY = 'gh-cfg-completion';
  let csActivo = true;   // encendido de fábrica: así nadie pierde lo que ya usa
  function csAplicarActivo() {
    const tab = document.querySelector('.inv-subtab[data-sub="completion"]');
    if (tab) tab.style.display = csActivo ? '' : 'none';
    if (!csActivo && tab && tab.classList.contains('active')) document.querySelector('.inv-subtab[data-sub="nueva"]').click();
    document.querySelectorAll('.inv-mini[title*="Completion"]').forEach((b) => { b.style.display = csActivo ? '' : 'none'; });
    const t = $('aj-cs-toggle'); if (t) t.checked = csActivo;
    const op = $('inv-cs-op'); if (op) op.style.display = csActivo ? '' : 'none';
  }
  async function csCargarActivo() {
    try { const r = await window.storage.get(CS_ACTIVO_KEY); if (r && r.value != null) csActivo = JSON.parse(r.value) !== false; } catch (e) {}
    csAplicarActivo();
  }
  if ($('aj-cs-toggle')) $('aj-cs-toggle').addEventListener('change', async (e) => {
    csActivo = e.target.checked;
    csAplicarActivo();
    try { await window.storage.set(CS_ACTIVO_KEY, JSON.stringify(csActivo)); } catch (err) {}
    toast(csActivo ? 'Completion Sheets activadas ✓' : 'Completion Sheets desactivadas', 'info', 2000);
  });
  csCargarActivo();
  document.querySelector('.gc-tab[data-tab="facturas"]').addEventListener('click', () => csCargarActivo());
  // FIN MÓDULO TRIM OUT PULL SHEET
// ---- 13a-completion-lotes.js ----
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
        tipos.forEach((t) => {
          poner(t, true);
          if (t === 'rough') poner('pull', false);
        });
        e.lote = e.lote || lote; e.en = new Date().toISOString(); e.por = window.GH_NOMBRE || '';
        hechos.push(`${e.lote} (${tipos.map((t) => (t === 'rough' ? 'Rough-In' : 'Trim-Out')).join(' + ')})`);
      });
    });
    if (!hechos.length) return [];
    await window.storage.set(CSL_KEY, JSON.stringify(cslDatos));
    if (cslVisible) cslRender();
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

  // ---------- Pestaña 🖨 Imprimir ----------
  let cslVisible = false;
  const cslMarcados = new Set();
  function cslMostrar(si) {
    cslVisible = !!si;
    const f = $('cs-form-imprimir'), h = $('cs-form-hojas');
    if (f) f.style.display = si ? '' : 'none';
    if (h) h.style.display = si ? 'none' : '';
    document.querySelectorAll('.cs-tipo-btn').forEach((b) => b.classList.toggle('active', si ? b.dataset.cstipo === 'imprimir' : b.dataset.cstipo === csTipo));
    if (si) { Promise.all([cslCargar(true), cslCargarFacturas()]).then(cslRender); cslRender(); }
  }
  window.GH_CSL_MOSTRAR = cslMostrar;
  function cslRender() {
    const cont = $('csl-lista'); if (!cont) return;
    const q = cslClave(($('csl-buscar') || {}).value || '');
    const filas = Object.entries(cslDatos).filter(([k, e]) => e && (!q || q.split('-').every((w) => k.split('-').some((x) => x.startsWith(w)))))
      .sort((a, b) => String(b[1].en || '').localeCompare(String(a[1].en || '')));
    const docs = cslDocs();
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
  if ($('csl-imprimir')) $('csl-imprimir').addEventListener('click', async () => {
    const claves = [...cslMarcados].filter((k) => cslDatos[k]);
    const docs = $('csl-op-factura').checked ? await cslCargarFacturas() : [];
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

// ---- 14-facturas.js ----
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
      // y queda guardado en su lote (si el trabajo no dice Rough/Trim, va como Rough-In)
      if (window.GH_CSL_DESDE_LINEAS) {
        const it = { location: lote, work: wrkIn.value, dia: diaSel.value };
        const tipos = /rough|trim|r\s*\/\s*i|t\s*\/\s*o/i.test(wrkIn.value) ? null : ['rough'];
        window.GH_CSL_DESDE_LINEAS([it], tipos).catch(() => {});
      }
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
    if (window.GH_CSL_FACTURA_GUARDADA) window.GH_CSL_FACTURA_GUARDADA(inv);
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
          ${csActivo ? `<button class="gc-action-btn" style="padding:4px 10px;font-size:11.5px;margin-left:4px;" data-a="conhojas" data-id="${inv.id}" title="Imprimir esta factura con las completion sheets de sus lotes">🖨 + Hojas</button>` : ''}
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
        if (btn.dataset.a==='conhojas') cslImprimirFacturaConHojas(inv);
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

// ---- 15-nomina.js ----
  // ====================================================================
  // MÓDULO: NÓMINA (pagos a trabajadores)
  // ====================================================================
  const NOM_KEY = 'gh-nomina'; // entradas de pago
  const TRAB_NOM_KEY_VIEJO = 'gh-trabajadores'; // formato viejo [{nombre, sueldo}] — solo para migrar una vez
  let nomDocs = [];
  let nomCheckin = {};   // check-in que hace el visor: { fecha: { v: { nombre: 1|0 }, por, en } }
  const NOM_CHK_KEY = 'gh-checkin';
  async function nomCargarCheckin() {
    try { const r = await window.storage.get(NOM_CHK_KEY); const v = JSON.parse(r.value); nomCheckin = (v && typeof v === 'object' && !Array.isArray(v)) ? v : {}; }
    catch (e) { nomCheckin = {}; }
  }

  const nomFmt = n => { const v = Math.round((Number(n) || 0) * 100) / 100; return (v < 0 ? '-$' : '$') + Math.abs(v).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); };
  const nomToday = () => ghFechaLocal(new Date());

  // Los trabajadores de Nómina AHORA viven en Empleados (empleados[]). Busca
  // por nombre completo (o solo nombre, para los que no tienen apellido).
  function nomBuscarTrab(nombre) {
    const n = (nombre || '').trim().toLowerCase();
    if (!n) return null;
    return empleados.find((e) => empNombreCompleto(e).toLowerCase() === n);
  }

  // Migra una sola vez la lista vieja de "gh-trabajadores" (si existe) hacia
  // Empleados, para no perder sueldos ya configurados. No duplica: si el
  // nombre ya existe en Empleados, lo deja como está.
  async function nomMigrarTrabajadoresViejos(listaVieja) {
    const lista = (listaVieja || []).map((t) => typeof t === 'string' ? { nombre: t, sueldo: 0 } : { nombre: t.nombre || '', sueldo: Number(t.sueldo) || 0 });
    let cambiaron = false;
    lista.forEach((t) => {
      if (!t.nombre || nomBuscarTrab(t.nombre)) return;
      empleados.push({
        id: 'emp-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6),
        nombre: t.nombre, apellido: '', rol: '', estado: 'activo', sueldo: t.sueldo,
        tel: '', email: '', inicio: '', ss: '', emergencia: '', direccion: '', notas: ''
      });
      cambiaron = true;
    });
    if (cambiaron) await saveEmpleados();
    // Esta migración debe correr UNA sola vez: si la lista vieja se queda
    // guardada, cada vez que se abre Nómina vuelve a copiar esos nombres —
    // y un empleado que borraste "revive" solo. Por eso, una vez copiada,
    // se borra la lista vieja.
    try {
      if (window.storage.delete) await window.storage.delete(TRAB_NOM_KEY_VIEJO);
      else await window.storage.set(TRAB_NOM_KEY_VIEJO, '[]');
    } catch (e) {
      try { await window.storage.set(TRAB_NOM_KEY_VIEJO, '[]'); } catch (e2) {}
    }
  }

  // Sub-tabs
  document.querySelectorAll('.nom-subtab').forEach((tab) => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.nom-subtab').forEach((t) => t.classList.remove('active'));
      document.querySelectorAll('.nom-subpanel').forEach((p) => p.classList.remove('active'));
      tab.classList.add('active');
      $('nom-sub-' + tab.dataset.nsub).classList.add('active');
      if (tab.dataset.nsub === 'semanal') nomRenderSemanal();
      if (tab.dataset.nsub === 'historial') nomRenderHist();
      if (tab.dataset.nsub === 'buscar') nomRenderBuscar();
      if (tab.dataset.nsub === 'resumen') nomRenderResumen();
      if (tab.dataset.nsub === 'trabajadores') nomRenderTrabajadores();
    });
  });

  async function nomSaveDocs() { await window.storage.set(NOM_KEY, JSON.stringify(nomDocs)); }

  // Junta recibos repetidos: si quedaron dos o más pagos de la MISMA persona
  // en la MISMA semana (pasaba al editar antes de esta corrección), se unen en
  // uno solo sumando los días, sin perder nada.
  async function nomLimpiarDuplicados() {
    const porClave = new Map();
    const fusionados = [];
    let huboCambios = false;
    (nomDocs || []).forEach((n) => {
      const dd = Array.isArray(n.dias) ? n.dias.slice().sort() : [];
      const ref = dd[0] || (n.creadoEn || '').slice(0, 10);
      const wk = ref ? nomWeekKey(ref) : '';
      const clave = (n.trabajador || '') + '|' + wk;
      if (!wk || !porClave.has(clave)) {
        porClave.set(clave, n);
        fusionados.push(n);
        return;
      }
      // Ya había uno: se fusiona en el primero
      const base = porClave.get(clave);
      base.dias = [...new Set([...(base.dias || []), ...dd])].sort();
      base.extraMonto = (Number(base.extraMonto) || 0) + (Number(n.extraMonto) || 0);
      if (!base.extraDesc && n.extraDesc) base.extraDesc = n.extraDesc;
      const sueldo = Number(base.sueldoDia) || 0;
      base.monto = sueldo > 0
        ? sueldo * base.dias.length + (Number(base.extraMonto) || 0)
        : (Number(base.monto) || 0) + (Number(n.monto) || 0);
      huboCambios = true;
    });
    if (huboCambios) {
      nomDocs = fusionados;
      try { await nomSaveDocs(); } catch (e) {}
    }
  }
  function nomRefreshDl() {
    // Solo trabajadores activos aparecen para buscar/seleccionar
    const activos = empleados.filter((e) => e.estado !== 'inactivo');
    ['dl-trabajadores', 'dl-trabajadores-2', 'dl-trab-todos'].forEach((id) => {
      const dl = document.getElementById(id);
      if (dl) dl.innerHTML = activos.map((e) => `<option value="${escapeHtml(empNombreCompleto(e))}">`).join('');
    });
  }

  // ---- Semana activa del formulario de Registrar pago ----
  let nomRegSemanaOffset = 0; // 0 = semana actual, -1 = semana pasada, +1 = próxima
  let nomGridFilas = []; // [{ nombre, sueldo, dias:[...], monto, montoTocado, pagos:[ids], nota, extraDesc, extraMonto, extraAbierto }]

  // OJO: aquí NO se puede usar toISOString(), porque convierte a horario de
  // Greenwich y en Nashville (5-6 horas atrás) la fecha se adelanta un día:
  // tocabas "lunes 15" y se guardaba el 16. Se arma la fecha con el día
  // local tal cual.
  function nomFechaLocalISO(d) {
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }
  function nomGridFechasSemana() {
    const base = new Date();
    base.setDate(base.getDate() + nomRegSemanaOffset * 7);
    const dowLun = (base.getDay() + 6) % 7; // 0 = lunes
    const lunes = new Date(base); lunes.setDate(base.getDate() - dowLun);
    const out = [];
    for (let i = 0; i < 7; i++) { const d = new Date(lunes); d.setDate(lunes.getDate() + i); out.push(nomFechaLocalISO(d)); }
    return out;
  }

  // Arma la lista de TODOS los trabajadores activos (+ cualquiera con pago
  // esta semana aunque ahora esté inactivo) para la semana actualmente
  // seleccionada, con sus días/monto ya guardados (si los hay).
  function nomGridAbrirSemana() {
    const fechas = nomGridFechasSemana();
    $('nom-grid-sem-titulo').textContent = `Semana del ${nomFechaCortaTexto(fechas[0])} al ${nomFechaCortaTexto(fechas[6])}`;
    const wk = fechas[0];
    const semanas = nomAgruparSemanas();
    const trabMap = semanas.get(wk) || new Map();
    const activos = empleados.filter((e) => e.estado !== 'inactivo').map((e) => empNombreCompleto(e));
    const nombresConPago = [...trabMap.keys()];
    const nombresCheckin = [];
    fechas.forEach((f) => { const v = (nomCheckin[f] || {}).v || {}; Object.keys(v).forEach((n) => { if (v[n] === 1) nombresCheckin.push(n); }); });
    const nombres = [...new Set([...activos, ...nombresConPago, ...nombresCheckin])];

    nomGridFilas = nombres.map((nombre) => {
      const t = nomBuscarTrab(nombre);
      const existente = trabMap.get(nombre);
      const dias = existente ? [...new Set(existente.dias)].sort() : [];
      const monto = existente ? existente.monto : 0;
      const pagos = existente ? existente.pagos.map((p) => p.id) : [];
      const primerPago = existente && existente.pagos.length ? existente.pagos[0] : null;
      // Una semana ya pagada se queda con el sueldo de ESE pago: si después le
      // subes el sueldo, las semanas viejas no cambian solas al tocarlas.
      const sueldoGuardado = primerPago ? Number(primerPago.sueldoDia) || 0 : 0;
      return {
        nombre, sueldo: sueldoGuardado || (t ? (t.sueldo || 0) : 0), dias, monto, montoTocado: false, pagos, tocado: false,
        nota: primerPago ? (primerPago.nota || '') : '',
        extraDesc: primerPago ? (primerPago.extraDesc || '') : '',
        extraMonto: primerPago ? (Number(primerPago.extraMonto) || 0) : 0,
        extraAbierto: false
      };
    }).map((fila) => {
      // Lo que marcó el visor en el check-in de esta semana
      fila.chk = {};
      // si ese día hubo check-in y no lo marcaron, es que no vino
      fechas.forEach((f) => { const reg = nomCheckin[f]; if (!reg || !reg.v || !Object.keys(reg.v).length) return; fila.chk[f] = reg.v[fila.nombre] === 1 ? 1 : 0; });
      const diasChk = fechas.filter((f) => fila.chk[f] === 1);
      // Sin pago guardado todavía: los días salen marcados solos (el admin revisa y guarda)
      if (!fila.pagos.length && diasChk.length) {
        fila.dias = diasChk;
        fila.monto = diasChk.length * fila.sueldo;
        fila.tocado = true;
        fila.deCheckin = true;
      }
      return fila;
    }).sort((a, b) => {
      if ((b.dias.length > 0) !== (a.dias.length > 0)) return (b.dias.length > 0) ? 1 : -1;
      return a.nombre.localeCompare(b.nombre);
    });

    nomGridRender();
  }

  function nomGridRender() {
    const cont = $('nom-grid-lista');
    if (!cont) return;
    const aviso = $('nom-chk-aviso');
    if (aviso) {
      const pre = nomGridFilas.filter((f) => f.deCheckin);
      const fechasS = nomGridFechasSemana();
      const conChk = nomGridFilas.filter((f) => f.chk && Object.keys(f.chk).length);
      const distintos = nomGridFilas.filter((f) => !f.deCheckin && f.pagos.length && f.chk && Object.keys(f.chk).length &&
        fechasS.filter((x) => f.chk[x] === 1).join() !== fechasS.filter((x) => f.dias.includes(x)).join());
      let txt = '', dif = false;
      if (pre.length) txt = `El check-in marcó los días de ${pre.length} trabajador${pre.length === 1 ? '' : 'es'}. Revisa y presiona <b>Guardar cambios de la semana</b>.`;
      if (distintos.length) { txt += (txt ? '<br>' : '') + `${distintos.length === 1 ? '1 trabajador tiene' : distintos.length + ' trabajadores tienen'} días distintos a su check-in (${distintos.map((f) => escapeHtml(f.nombre)).join(', ')}).`; dif = !pre.length; }
      if (!txt && conChk.length) txt = 'Los puntos en los días son el check-in: verde = vino, rojo = no vino.';
      aviso.innerHTML = txt;
      aviso.classList.toggle('on', !!txt);
      aviso.classList.toggle('dif', dif);
    }
    $('nom-grid-empty').style.display = nomGridFilas.length === 0 ? 'block' : 'none';
    const fechas = nomGridFechasSemana();
    const letras = ['L', 'M', 'M', 'J', 'V', 'S', 'D'];

    cont.innerHTML = nomGridFilas.map((fila, fi) => {
      const botones = fechas.map((f, i) => {
        const d = new Date(f + 'T00:00:00');
        const sel = fila.dias.includes(f);
        return `<button type="button" class="nom-grid-dia" data-fi="${fi}" data-fecha="${f}"
          style="height:44px;border-radius:8px;font-size:11.5px;font-weight:700;cursor:pointer;
          border:1.5px solid ${sel ? 'var(--navy)' : 'var(--border)'};
          background:${sel ? 'var(--navy)' : '#fff'};color:${sel ? '#fff' : 'var(--ink)'};
          display:flex;flex-direction:column;align-items:center;justify-content:center;line-height:1.25;">
          <span style="font-size:9.5px;opacity:.8;">${letras[i]}</span>${d.getDate()}${fila.chk && fila.chk[f] === 1 ? '<i class="chk-dot si" title="Check-in: vino"></i>' : fila.chk && fila.chk[f] === 0 ? '<i class="chk-dot no" title="Check-in: no vino"></i>' : ''}</button>`;
      }).join('');
      return `
        <div class="gc-card" data-grid-nombre="${escapeHtml(fila.nombre)}" style="margin-bottom:10px;padding:12px 14px;">
          <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:10px;margin-bottom:10px;">
            <div>
              <div style="font-weight:600;font-size:13.5px;color:var(--ink);">${escapeHtml(fila.nombre)}</div>
              <div style="font-size:11px;color:var(--muted);">sueldo: ${nomFmt(fila.sueldo)}/día${fila.pagos.length > 1 ? ' · varios pagos (se juntan al guardar)' : ''}</div>
              <button type="button" class="nom-grid-extra-toggle" data-fi="${fi}" style="background:none;border:none;padding:0;margin-top:4px;font-size:11px;color:var(--teal-dk);text-decoration:underline;cursor:pointer;">${fila.extraMonto ? `Extra: ${nomFmt(fila.extraMonto)} ✎` : '+ agregar extra'}</button>
            </div>
            <div style="text-align:right;">
              <div style="font-size:10px;color:var(--muted);text-transform:uppercase;">Monto</div>
              <input type="text" class="nom-grid-monto" data-fi="${fi}" value="${fila.monto ? fila.monto.toFixed(2) : ''}" inputmode="decimal" placeholder="0.00"
                style="width:92px;text-align:right;font-family:'IBM Plex Mono',monospace;font-weight:700;padding:6px 8px;border:1.5px solid var(--border);border-radius:8px;">
            </div>
          </div>
          ${fila.extraAbierto ? `
          <div style="display:grid;grid-template-columns:2fr 1fr;gap:8px;margin-bottom:10px;padding:10px;background:#FDEEE6;border-radius:8px;border:1px solid #F0C9B4;">
            <div><label style="font-size:10px;color:var(--muted);text-transform:uppercase;display:block;margin-bottom:3px;">Concepto</label><input type="text" class="nom-grid-extra-desc" data-fi="${fi}" value="${escapeHtml(fila.extraDesc || '')}" style="width:100%;padding:6px 8px;border:1.5px solid var(--border);border-radius:6px;font-size:12.5px;box-sizing:border-box;"></div>
            <div><label style="font-size:10px;color:var(--muted);text-transform:uppercase;display:block;margin-bottom:3px;">Monto extra</label><input type="text" class="nom-grid-extra-monto" data-fi="${fi}" value="${fila.extraMonto ? fila.extraMonto.toFixed(2) : ''}" inputmode="decimal" placeholder="0.00" style="width:100%;padding:6px 8px;border:1.5px solid var(--border);border-radius:6px;font-size:12.5px;box-sizing:border-box;"></div>
          </div>` : ''}
          <div style="display:grid;grid-template-columns:repeat(7,1fr);gap:5px;">${botones}</div>
        </div>`;
    }).join('');

    cont.querySelectorAll('.nom-grid-dia').forEach((btn) => {
      btn.addEventListener('click', () => {
        const fi = Number(btn.dataset.fi);
        const fila = nomGridFilas[fi];
        const f = btn.dataset.fecha;
        const idx = fila.dias.indexOf(f);
        if (idx >= 0) fila.dias.splice(idx, 1); else { fila.dias.push(f); fila.dias.sort(); }
        fila.tocado = true; fila.deCheckin = false;
        if (!fila.montoTocado) fila.monto = (fila.dias.length * fila.sueldo) + (fila.extraMonto || 0);
        nomGridRender();
      });
    });
    cont.querySelectorAll('.nom-grid-monto').forEach((inp) => {
      inp.addEventListener('input', () => {
        const fi = Number(inp.dataset.fi);
        nomGridFilas[fi].montoTocado = true;
        nomGridFilas[fi].tocado = true; nomGridFilas[fi].deCheckin = false;
        nomGridFilas[fi].monto = parseFloat(inp.value.replace(',', '.')) || 0;
        nomActualizarResumen();
      });
    });
    cont.querySelectorAll('.nom-grid-extra-toggle').forEach((btn) => {
      btn.addEventListener('click', () => {
        const fi = Number(btn.dataset.fi);
        nomGridFilas[fi].extraAbierto = !nomGridFilas[fi].extraAbierto;
        nomGridRender();
      });
    });
    cont.querySelectorAll('.nom-grid-extra-desc').forEach((inp) => {
      inp.addEventListener('input', () => {
        const fi = Number(inp.dataset.fi);
        nomGridFilas[fi].extraDesc = inp.value;
        nomGridFilas[fi].tocado = true; nomGridFilas[fi].deCheckin = false;
        nomActualizarResumen();
      });
    });
    cont.querySelectorAll('.nom-grid-extra-monto').forEach((inp) => {
      inp.addEventListener('input', () => {
        const fi = Number(inp.dataset.fi);
        const fila = nomGridFilas[fi];
        fila.extraMonto = parseFloat(inp.value.replace(',', '.')) || 0;
        fila.tocado = true; fila.deCheckin = false;
        if (!fila.montoTocado) {
          fila.monto = (fila.dias.length * fila.sueldo) + fila.extraMonto;
          const montoInp = cont.querySelector(`.nom-grid-monto[data-fi="${fi}"]`);
          if (montoInp) montoInp.value = fila.monto ? fila.monto.toFixed(2) : '';
        }
        nomActualizarResumen();
      });
    });
    nomActualizarResumen();
  }

  // ---- Total de la semana y aviso de cambios sin guardar ----
  function nomHayCambios() { return nomGridFilas.some((f) => f.tocado); }
  function nomActualizarResumen() {
    const cont = $('nom-resumen-sem'); if (!cont) return;
    const conPago = nomGridFilas.filter((f) => f.dias.length || (Number(f.monto) || 0) > 0);
    const total = conPago.reduce((t, f) => t + (Number(f.monto) || 0), 0);
    const dias = conPago.reduce((t, f) => t + f.dias.length, 0);
    cont.innerHTML = conPago.length
      ? `<span><b>${conPago.length}</b> trabajador${conPago.length === 1 ? '' : 'es'} · <b>${dias}</b> día${dias === 1 ? '' : 's'}</span><strong>${nomFmt(total)}</strong>`
      : '<span>Nadie tiene días marcados esta semana.</span>';
    const pend = nomHayCambios();
    const barra = $('nom-guardar-barra');
    if (barra) barra.classList.toggle('pendiente', pend);
    document.body.classList.toggle('nom-pend', pend);
    const txt = $('nom-pend-txt');
    if (txt) txt.textContent = pend ? 'Cambios sin guardar' : '';
  }
  // Antes de cambiar de semana con cambios sin guardar, preguntar
  async function nomCambiarSemana(delta) {
    if (nomHayCambios()) {
      const ok = await gcConfirm('Tienes cambios sin guardar en esta semana.\n\n¿Guardarlos antes de cambiar de semana?', { okText: 'Guardar y seguir', cancelText: 'No guardar' });
      if (ok) { await nomGuardarSemana(); if (nomHayCambios()) return; }
    }
    nomRegSemanaOffset += delta; nomGridAbrirSemana();
  }
  $('nom-grid-sem-prev').addEventListener('click', () => nomCambiarSemana(-1));
  $('nom-grid-sem-next').addEventListener('click', () => nomCambiarSemana(1));
  window.addEventListener('beforeunload', (e) => { if (nomHayCambios()) { e.preventDefault(); e.returnValue = ''; } });
  document.querySelectorAll('.gc-tab').forEach((t) => t.addEventListener('click', () => {
    if (t.dataset.tab !== 'nomina' && nomHayCambios()) toast('Ojo: dejaste cambios sin guardar en Nómina → Registrar pago', 'info', 4500);
  }));

  // Agregar un trabajador nuevo a la lista de esta semana (si el nombre no
  // existe en Empleados, lo crea con sueldo $0, editable luego).
  async function nomGridAgregarTrabajador() {
    const nombre = $('nom-grid-buscar').value.trim();
    if (!nombre) return;
    const existente = nomBuscarTrab(nombre);
    const nombreFinal = existente ? empNombreCompleto(existente) : nombre;
    if (nomGridFilas.some((f) => f.nombre === nombreFinal)) {
      $('nom-grid-buscar').value = '';
      toast('Ya está en la lista de esta semana', 'info');
      return;
    }
    let sueldo = 0;
    if (!existente) {
      empleados.push({
        id: 'emp-' + Date.now(), nombre, apellido: '', rol: '', estado: 'activo', sueldo: 0,
        tel: '', email: '', inicio: '', ss: '', emergencia: '', direccion: '', notas: ''
      });
      await saveEmpleados();
      nomRefreshDl();
    } else {
      sueldo = existente.sueldo || 0;
    }
    nomGridFilas.push({ nombre: nombreFinal, sueldo, dias: [], monto: 0, montoTocado: false, pagos: [], tocado: false, nota: '', extraDesc: '', extraMonto: 0, extraAbierto: false });
    nomGridFilas.sort((a, b) => { if ((b.dias.length > 0) !== (a.dias.length > 0)) return (b.dias.length > 0) ? 1 : -1; return a.nombre.localeCompare(b.nombre); });
    $('nom-grid-buscar').value = '';
    nomGridRender();
    $('nom-grid-buscar').focus();
  }
  $('nom-grid-btn-add').addEventListener('click', nomGridAgregarTrabajador);
  $('nom-grid-buscar').addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); nomGridAgregarTrabajador(); } });

  // Nombre completo del día con fecha: "Lunes 4 de Agosto de 2026"
  function nomFechaCompleta(fechaStr) {
    const d = new Date(fechaStr + 'T00:00:00');
    if (isNaN(d)) return fechaStr;
    const dias = ['Domingo','Lunes','Martes','Miércoles','Jueves','Viernes','Sábado'];
    const meses = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
    return `${dias[d.getDay()]} ${d.getDate()} de ${meses[d.getMonth()]} de ${d.getFullYear()}`;
  }

  // ---- Guardar cambios de la semana (crea/actualiza/quita pagos de todos los trabajadores a la vez) ----
  $('nom-grid-guardar').addEventListener('click', () => nomGuardarSemana());
  async function nomGuardarSemana() {
    let creados = 0, actualizados = 0, borrados = 0;
    nomGridFilas.forEach((fila) => {
      if (!fila.tocado) return; // nadie tocó esta fila — no hay nada que guardar
      if (fila.dias.length > 0) {
        // Antes de nada: busca CUALQUIER pago que ya exista de esta persona en
        // esta misma semana, aunque la fila no lo tuviera enlazado (pasaba si
        // el nombre cambió o si la fecha se había guardado corrida). Así se
        // actualiza el que ya está en vez de crear uno nuevo y duplicarlo.
        const semanaDeEstaFila = nomWeekKey(fila.dias.slice().sort()[0]);
        const mismoNombre = (a, b) => String(a || '').replace(/\s+/g, ' ').trim().toLowerCase() === String(b || '').replace(/\s+/g, ' ').trim().toLowerCase();
        const yaExistentes = nomDocs.filter((n) => {
          if (!mismoNombre(n.trabajador, fila.nombre)) return false;
          const dd = Array.isArray(n.dias) ? n.dias.slice().sort() : [];
          const ref = dd[0] || (n.creadoEn || '').slice(0, 10);
          return ref && nomWeekKey(ref) === semanaDeEstaFila;
        });
        const idsExistentes = yaExistentes.map((n) => n.id);
        const idPrincipal = fila.pagos[0] || idsExistentes[0] ||
          (Date.now().toString() + '-' + Math.random().toString(36).slice(2, 7));
        const original = nomDocs.find((n) => n.id === idPrincipal) || null;
        const entrada = {
          id: idPrincipal, trabajador: fila.nombre, dias: [...fila.dias],
          sueldoDia: fila.sueldo, extraDesc: fila.extraDesc || '', extraMonto: fila.extraMonto || 0,
          monto: fila.monto, nota: fila.nota || '',
          creadoEn: original ? original.creadoEn : new Date().toISOString()
        };
        const idx = nomDocs.findIndex((n) => n.id === idPrincipal);
        if (idx >= 0) { nomDocs[idx] = entrada; actualizados++; } else { nomDocs.push(entrada); creados++; }
        // Quita cualquier otro pago repetido de esa persona en esa semana,
        // para que nunca queden dos recibos de lo mismo.
        const sobrantes = new Set([...fila.pagos.slice(1), ...idsExistentes]);
        sobrantes.delete(idPrincipal);
        if (sobrantes.size) nomDocs = nomDocs.filter((n) => !sobrantes.has(n.id));
      } else if (fila.pagos.length > 0) {
        nomDocs = nomDocs.filter((n) => !fila.pagos.includes(n.id));
        borrados += fila.pagos.length;
      }
    });

    const btnG = $('nom-grid-guardar');
    btnG.disabled = true;
    try { await nomSaveDocs(); }
    catch (e) {
      btnG.disabled = false;
      toast('No se pudo guardar la semana: ' + ((e && e.message) || e), 'error', 5000);
      return;
    }
    btnG.disabled = false;
    nomGridAbrirSemana();
    if (typeof nomRenderRegLedger === 'function') nomRenderRegLedger();
    if (typeof nomRenderSemanal === 'function') nomRenderSemanal();
    const partes = [];
    if (creados) partes.push(`${creados} agregado(s)`);
    if (actualizados) partes.push(`${actualizados} actualizado(s)`);
    if (borrados) partes.push(`${borrados} quitado(s)`);
    toast(partes.length ? `Semana guardada — ${partes.join(', ')} ✓` : 'Sin cambios', 'success');
  }

  // Lleva al usuario a Registrar pago, en la semana que corresponde, y si
  // se da un nombre, resalta su tarjeta (usado por "Editar" en Historial,
  // Pagos guardados y Recibo semanal).
  function nomIrARegistrarSemana(resaltarNombre) {
    document.querySelector('.nom-subtab[data-nsub="registro"]').click();
    nomGridAbrirSemana();
    window.scrollTo({ top: 0, behavior: 'smooth' });
    if (resaltarNombre) {
      toast('Ahí está ' + resaltarNombre + ' en la lista de esta semana', 'info', 3000);
      setTimeout(() => {
        const fila = document.querySelector(`#nom-grid-lista [data-grid-nombre="${CSS.escape(resaltarNombre)}"]`);
        if (fila) {
          fila.scrollIntoView({ behavior: 'smooth', block: 'center' });
          fila.style.boxShadow = '0 0 0 2.5px var(--teal)';
          setTimeout(() => { fila.style.boxShadow = ''; }, 2000);
        }
      }, 200);
    }
  }

  // Salta a la semana de un pago existente y resalta a su trabajador
  // (usado por los botones "Editar" de Historial y Pagos guardados).
  function nomEditar(entrada) {
    const dias = Array.isArray(entrada.dias) ? entrada.dias.slice().sort() : [];
    const primerDia = dias[0] || (entrada.creadoEn || '').slice(0, 10);
    if (primerDia) {
      const mondayEntrada = mondayOf(primerDia);
      const mondayHoy = mondayOf(nomToday());
      nomRegSemanaOffset = Math.round((mondayEntrada - mondayHoy) / (7 * 24 * 60 * 60 * 1000));
    }
    nomIrARegistrarSemana(entrada.trabajador);
  }

  // Salta a una semana específica (clave = lunes) desde una tarjeta de
  // Recibo semanal, y opcionalmente resalta a un trabajador.
  function nomIrASemana(wk, resaltarNombre) {
    const mondayWk = new Date(wk + 'T00:00:00');
    const mondayHoy = mondayOf(nomToday());
    nomRegSemanaOffset = Math.round((mondayWk - mondayHoy) / (7 * 24 * 60 * 60 * 1000));
    nomIrARegistrarSemana(resaltarNombre);
  }

  // ---- Recibo tipo invoice ----
  function nomBuildRecibo(n) {
    const FC = facturaColores();
    const dias = Array.isArray(n.dias) ? n.dias.slice().sort() : [];
    const sueldoDia = Number(n.sueldoDia) || 0;
    const extraMonto = Number(n.extraMonto) || 0;
    const totalDias = dias.length;
    const subtotalDias = sueldoDia > 0 ? sueldoDia * totalDias : (Number(n.monto) || 0) - extraMonto;

    const filasDias = dias.map((f, i) => `
      <tr>
        <td style="padding:8px 6px;border-bottom:1px solid #e5e5e5;font-size:12.5px;">${i + 1}</td>
        <td style="padding:8px 6px;border-bottom:1px solid #e5e5e5;font-size:12.5px;">${invFechaNum(f)}</td>
        <td style="padding:8px 6px;border-bottom:1px solid #e5e5e5;text-align:right;font-size:12.5px;">${sueldoDia > 0 ? nomFmt(sueldoDia) : '—'}</td>
      </tr>`).join('');

    return `
      <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:24px;border-bottom:3px solid ${FC.p};padding-bottom:18px;">
        <div>
          <div style="font-size:22px;font-weight:700;color:${FC.p};font-family:Georgia,serif;">${escapeHtml(cfgFacturaNombre)}</div>
          ${cfgFacturaDireccion ? `<div style="font-size:11.5px;color:#707A8C;margin-top:2px;">${escapeHtml(cfgFacturaDireccion)}</div>` : ''}
          <div style="font-size:12px;color:#666;margin-top:3px;">Recibo de pago a trabajador</div>
        </div>
        <div style="text-align:right;">
          <div style="font-size:20px;font-weight:700;color:${FC.p};letter-spacing:1px;">RECIBO</div>
          <div style="font-size:12px;color:#888;margin-top:3px;">${invFechaNum((n.creadoEn || '').slice(0, 10))}</div>
        </div>
      </div>

      <div style="margin-bottom:20px;">
        <div style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:#999;margin-bottom:5px;">Trabajador</div>
        <div style="font-size:17px;font-weight:700;color:${FC.p};">${escapeHtml(n.trabajador || '')}</div>
      </div>

      <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.5px;color:${FC.p};margin-bottom:8px;">Días trabajados</div>
      <table style="width:100%;border-collapse:collapse;margin-bottom:18px;">
        <thead><tr style="background:${FC.p};">
          <th style="padding:9px 6px;text-align:left;font-size:10px;color:rgba(255,255,255,.85);text-transform:uppercase;width:34px;">#</th>
          <th style="padding:9px 6px;text-align:left;font-size:10px;color:rgba(255,255,255,.85);text-transform:uppercase;" data-i18n="h_dia">Día</th>
          <th style="padding:9px 6px;text-align:right;font-size:10px;color:rgba(255,255,255,.85);text-transform:uppercase;width:110px;" data-i18n="h_sueldo_dia">Sueldo/día</th>
        </tr></thead>
        <tbody>${filasDias || '<tr><td colspan="3" style="padding:8px;font-size:12.5px;">Sin días</td></tr>'}</tbody>
      </table>

      <div style="display:flex;justify-content:flex-end;">
        <table style="font-size:13px;width:280px;">
          <tr><td style="padding:5px 0;color:#666;">${totalDias} día(s)${sueldoDia > 0 ? ` × ${nomFmt(sueldoDia)}` : ''}</td><td style="padding:5px 0;text-align:right;font-weight:600;">${nomFmt(subtotalDias)}</td></tr>
          ${extraMonto ? `<tr><td style="padding:5px 0;color:#C2622E;">Extra${n.extraDesc ? ` — ${escapeHtml(n.extraDesc)}` : ''}</td><td style="padding:5px 0;text-align:right;font-weight:600;color:#C2622E;">${nomFmt(extraMonto)}</td></tr>` : ''}
          <tr style="border-top:2px solid ${FC.p};"><td style="padding:10px 0;font-size:15px;font-weight:700;color:${FC.p};">TOTAL A PAGAR</td><td style="padding:10px 0;text-align:right;font-size:15px;font-weight:700;color:${FC.p};">${nomFmt(n.monto)}</td></tr>
        </table>
      </div>

      ${n.nota ? `<div style="margin-top:22px;padding:12px 16px;background:#F5F8FC;border-left:3px solid ${FC.p};border-radius:6px;font-size:12.5px;color:#444;"><strong>Nota:</strong> ${escapeHtml(n.nota)}</div>` : ''}

      <div style="margin-top:40px;display:flex;justify-content:space-between;gap:40px;">
        <div style="flex:1;border-top:1px solid #999;padding-top:6px;text-align:center;font-size:11px;color:#888;">Firma del trabajador</div>
        <div style="flex:1;border-top:1px solid #999;padding-top:6px;text-align:center;font-size:11px;color:#888;">Firma de ${escapeHtml(cfgFacturaNombre)}</div>
      </div>
      <div style="margin-top:22px;padding-top:12px;border-top:1px solid #eee;text-align:center;font-size:11px;color:#aaa;">${escapeHtml(cfgFacturaNombre)} · Recibo de pago</div>`;
  }

  let nomReciboEnVista = null;
  function nomMostrarRecibo(n) {
    nomReciboEnVista = n;
    $('nom-recibo-content').innerHTML = nomBuildRecibo(n);
    $('nom-btn-imprimir-recibo').style.display = '';
    $('nom-btn-descargar-recibo').style.display = '';
    $('nom-ov').style.display = 'flex';
  }
  $('nom-btn-imprimir-recibo').addEventListener('click', () => {
    if (!nomReciboEnVista) return;
    ghImprimirEnVentana(nomBuildRecibo(nomReciboEnVista), `Recibo - ${nomReciboEnVista.trabajador || ''}`);
  });
  $('nom-btn-descargar-recibo').addEventListener('click', () => {
    if (!nomReciboEnVista) return;
    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Recibo ${escapeHtml(nomReciboEnVista.trabajador || '')}</title><style>body{font-family:Arial,sans-serif;padding:32px;max-width:800px;margin:0 auto;}</style></head><body>${nomBuildRecibo(nomReciboEnVista)}</body></html>`;
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([html], { type: 'text/html;charset=utf-8;' }));
    a.download = `recibo-${(nomReciboEnVista.trabajador || 'pago').replace(/[^a-z0-9]/gi, '-').toLowerCase()}.html`;
    a.click(); URL.revokeObjectURL(a.href);
  });
  $('nom-btn-cerrar-recibo').addEventListener('click', () => { $('nom-ov').style.display = 'none'; nomReciboEnVista = null; });
  $('nom-ov').addEventListener('click', (e) => { if (e.target.id === 'nom-ov') { $('nom-ov').style.display = 'none'; nomReciboEnVista = null; } });

  // Formatear lista de fechas para mostrar
  function nomFechasTexto(dias) {
    if (!Array.isArray(dias)) return typeof dias === 'number' ? `${dias} día(s)` : '';
    if (dias.length === 0) return '—';
    // "lun 5, mar 6, mié 7 oct" (antes salía 2026-10-05, 2026-10-06…)
    const D = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'], M = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
    const ord = [...new Set(dias)].sort();
    return ord.map((f, i) => {
      const d = new Date(f + 'T00:00:00');
      if (isNaN(d)) return f;
      const sig = ord[i + 1] ? new Date(ord[i + 1] + 'T00:00:00') : null;
      const finMes = !sig || sig.getMonth() !== d.getMonth();
      return `${D[d.getDay()]} ${d.getDate()}${finMes ? ' ' + M[d.getMonth()] : ''}`;
    }).join(', ');
  }
  function nomCuentaDias(dias) {
    return Array.isArray(dias) ? dias.length : (Number(dias) || 0);
  }

  // ---- Historial ----
  function nomRenderHist() {
    const buscar = $('nom-hist-buscar').value.trim().toLowerCase();
    const tbody = $('nom-hist-tbody');
    tbody.innerHTML = '';
    const filtrados = nomDocs.filter((n) => !buscar ||
      (n.trabajador || '').toLowerCase().includes(buscar) ||
      (n.nota || '').toLowerCase().includes(buscar)
    ).sort((a, b) => (b.creadoEn || '').localeCompare(a.creadoEn || ''));

    $('nom-hist-empty').style.display = filtrados.length === 0 ? 'block' : 'none';
    $('nom-hist-tbl').style.display = filtrados.length === 0 ? 'none' : 'table';

    filtrados.forEach((n) => {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td style="font-weight:500;">${escapeHtml(n.trabajador || '')}</td>
        <td class="num">${nomCuentaDias(n.dias)}</td>
        <td style="font-size:12px;color:var(--muted);">${escapeHtml(nomFechasTexto(n.dias))}</td>
        <td class="num" style="font-weight:700;color:var(--teal);">${nomFmt(n.monto)}</td>
        <td style="font-size:12.5px;color:var(--muted);">${escapeHtml(n.nota || '')}</td>
        <td style="white-space:nowrap;">
          <button class="gc-action-btn nom-ver-btn" data-i18n="ver" data-id="${n.id}" style="padding:4px 10px;font-size:11.5px;">Ver</button>
          <button class="gc-action-btn nom-imp-btn" data-i18n="imprimir" data-id="${n.id}" style="padding:4px 10px;font-size:11.5px;margin-left:3px;">Imprimir</button>
          <button class="gc-action-btn nom-edit-btn" data-id="${n.id}" style="padding:4px 10px;font-size:11.5px;margin-left:3px;">✎</button>
          <button class="gc-del nom-del-btn" data-id="${n.id}" style="margin-left:3px;">✕</button>
        </td>`;
      tbody.appendChild(tr);
    });

    tbody.querySelectorAll('.nom-ver-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        const n = nomDocs.find((x) => x.id === btn.dataset.id);
        if (n) nomMostrarRecibo(n);
      });
    });
    tbody.querySelectorAll('.nom-imp-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        const n = nomDocs.find((x) => x.id === btn.dataset.id);
        if (!n) return;
        ghImprimirEnVentana(nomBuildRecibo(n), `Recibo - ${n.trabajador || ''}`);
      });
    });
    tbody.querySelectorAll('.nom-edit-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        const n = nomDocs.find((x) => x.id === btn.dataset.id);
        if (n) nomEditar(n);
      });
    });
    tbody.querySelectorAll('.nom-del-btn').forEach((btn) => {
      btn.addEventListener('click', async () => {
        if (!await gcConfirm('¿Eliminar este pago?', { okText: 'Eliminar', danger: true })) return;
        nomDocs = nomDocs.filter((x) => x.id !== btn.dataset.id);
        await nomSaveDocs();
        toast('Pago eliminado', 'info');
        nomRenderHist();
      });
    });
  }
  $('nom-hist-buscar').addEventListener('input', debounce(nomRenderHist, 160));

  // ---- Buscar por persona (con intervalos) ----
  function nomInfoPeriodo(fechaStr, intervalo) {
    const d = new Date(fechaStr + 'T00:00:00');
    if (isNaN(d)) return 'Sin fecha';
    if (intervalo === 'año') return String(d.getFullYear());
    if (intervalo === 'mes') {
      const meses = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
      return `${meses[d.getMonth()]} ${d.getFullYear()}`;
    }
    if (intervalo === 'semana') {
      const dt = new Date(d);
      const day = (dt.getDay() + 6) % 7;
      dt.setDate(dt.getDate() - day);
      const lunes = ghFechaLocal(dt);
      const fin = new Date(dt); fin.setDate(fin.getDate() + 6);
      return `Semana del ${lunes} al ${ghFechaLocal(fin)}`;
    }
    return 'Todo';
  }

  // Para intervalos, cada pago se reparte por sus días (cada día cuenta con su fecha)
  // Repartimos el monto proporcionalmente entre los días del pago
  function nomExpandirPagos(pagos) {
    const filas = [];
    pagos.forEach((n) => {
      const dias = Array.isArray(n.dias) ? n.dias : [];
      if (dias.length === 0) {
        // Pago sin fechas (formato viejo): usar creadoEn como referencia
        filas.push({ fecha: (n.creadoEn || '').slice(0, 10), monto: Number(n.monto) || 0, dias: nomCuentaDias(n.dias) });
      } else {
        const porDia = (Number(n.monto) || 0) / dias.length;
        dias.forEach((f) => filas.push({ fecha: f, monto: porDia, dias: 1 }));
      }
    });
    return filas;
  }

  function nomRenderBuscar() {
    const persona = $('nom-buscar-persona').value.trim().toLowerCase();
    const intervalo = $('nom-buscar-intervalo').value;
    const cont = $('nom-buscar-resultado');

    if (!persona) {
      cont.innerHTML = '<div class="gc-empty">Escribe el nombre de un trabajador para ver cuánto lleva ganando.</div>';
      return;
    }

    const pagos = nomDocs.filter((n) => (n.trabajador || '').toLowerCase().includes(persona));
    if (pagos.length === 0) {
      cont.innerHTML = '<div class="gc-empty">No hay pagos registrados para ese trabajador.</div>';
      return;
    }

    const totalGeneral = pagos.reduce((s, n) => s + (Number(n.monto) || 0), 0);
    const totalDias = pagos.reduce((s, n) => s + nomCuentaDias(n.dias), 0);
    const nombreReal = pagos[0].trabajador;

    let html = `
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:18px;">
        <div class="gc-stat" style="border-color:var(--teal);"><div class="gc-stat-icon" style="background:var(--teal-bg);">$</div><div><div class="gc-stat-label">Total ganado — ${escapeHtml(nombreReal)}</div><div class="gc-stat-val" style="color:var(--teal);">${nomFmt(totalGeneral)}</div></div></div>
        <div class="gc-stat" style="border-color:var(--navy);"><div class="gc-stat-icon" style="background:#EEF2FF;">#</div><div><div class="gc-stat-label">Días trabajados en total</div><div class="gc-stat-val" style="color:var(--navy);">${totalDias}</div></div></div>
      </div>`;

    if (intervalo !== 'todo') {
      const filas = nomExpandirPagos(pagos);
      const grupos = new Map();
      filas.forEach((f) => {
        const periodo = nomInfoPeriodo(f.fecha || '', intervalo);
        if (!grupos.has(periodo)) grupos.set(periodo, { monto: 0, dias: 0 });
        const g = grupos.get(periodo);
        g.monto += f.monto;
        g.dias += f.dias;
      });

      const periodos = [...grupos.entries()].sort((a, b) => b[0].localeCompare(a[0]));
      html += `<table class="inv-list-t"><thead><tr><th>Periodo (${intervalo})</th><th class="num" data-i18n="h_dias">Días</th><th class="num" data-i18n="h_ganado">Ganado</th></tr></thead><tbody>`;
      periodos.forEach(([periodo, g]) => {
        html += `<tr>
          <td style="font-weight:500;">${escapeHtml(periodo)}</td>
          <td class="num">${g.dias}</td>
          <td class="num" style="font-weight:700;color:var(--teal);">${nomFmt(g.monto)}</td>
        </tr>`;
      });
      html += '</tbody></table>';
    } else {
      html += `<table class="inv-list-t"><thead><tr><th class="num" data-i18n="h_dias">Días</th><th data-i18n="h_fechas_trabajadas">Fechas trabajadas</th><th class="num" data-i18n="h_monto">Monto</th><th data-i18n="h_nota">Nota</th></tr></thead><tbody>`;
      pagos.sort((a, b) => (b.creadoEn || '').localeCompare(a.creadoEn || '')).forEach((n) => {
        html += `<tr>
          <td class="num">${nomCuentaDias(n.dias)}</td>
          <td style="font-size:12px;color:var(--muted);">${escapeHtml(nomFechasTexto(n.dias))}</td>
          <td class="num" style="font-weight:700;color:var(--teal);">${nomFmt(n.monto)}</td>
          <td style="font-size:12.5px;color:var(--muted);">${escapeHtml(n.nota || '')}</td>
        </tr>`;
      });
      html += '</tbody></table>';
    }

    cont.innerHTML = html;
  }
  // ---- Resumen por trabajador: año, este mes, días y barras por mes ----
  function nomRenderResumen() {
    const sel = $('nr-anio'); if (!sel) return;
    const hoy = nomToday(), anioHoy = hoy.slice(0, 4), mesHoy = hoy.slice(5, 7);
    const filas = [];
    nomDocs.forEach((n) => { nomExpandirPagos([n]).forEach((f) => { if (f.fecha) filas.push({ t: (n.trabajador || 'Sin nombre').trim(), f: f.fecha, m: f.monto, d: f.dias }); }); });
    const anios = [...new Set(filas.map((x) => x.f.slice(0, 4)).concat([anioHoy]))].sort().reverse();
    const prev = sel.value;
    sel.innerHTML = anios.map((a) => `<option value="${a}">${a}</option>`).join('');
    sel.value = anios.includes(prev) ? prev : anioHoy;
    const anio = sel.value;
    const por = new Map();
    filas.filter((x) => x.f.startsWith(anio)).forEach((x) => {
      const k = x.t.toLowerCase();
      if (!por.has(k)) por.set(k, { nombre: x.t, total: 0, dias: 0, mes: 0, meses: new Array(12).fill(0) });
      const g = por.get(k); g.total += x.m; g.dias += x.d;
      const mi = Number(x.f.slice(5, 7)) - 1; if (mi >= 0 && mi < 12) g.meses[mi] += x.m;
      if (anio === anioHoy && x.f.slice(5, 7) === mesHoy) g.mes += x.m;
    });
    const lista = [...por.values()].sort((a, b) => b.total - a.total);
    const totalAnio = lista.reduce((t, g) => t + g.total, 0), totalMes = lista.reduce((t, g) => t + g.mes, 0);
    $('nr-kpis').innerHTML = `
      <div class="nr-kpi"><span>Pagado en ${anio}</span><b>${nomFmt(totalAnio)}</b></div>
      <div class="nr-kpi"><span>${anio === anioHoy ? 'Este mes' : 'Trabajadores'}</span><b>${anio === anioHoy ? nomFmt(totalMes) : lista.length}</b></div>`;
    const MC = ['E', 'F', 'M', 'A', 'M', 'J', 'J', 'A', 'S', 'O', 'N', 'D'];
    $('nr-lista').innerHTML = lista.length ? lista.map((g) => {
      const max = Math.max(1, ...g.meses);
      return `<div class="nr-fila">
        <div class="nr-top"><span class="nr-nom">${escapeHtml(g.nombre)}</span><span class="nr-tot">${nomFmt(g.total)}</span></div>
        <div class="nr-sub">${g.dias} día${g.dias === 1 ? '' : 's'} trabajados${anio === anioHoy ? ' · este mes ' + nomFmt(g.mes) : ''}${g.dias ? ' · promedio ' + nomFmt(g.total / g.dias) + '/día' : ''}</div>
        <div class="nr-barras">${g.meses.map((v, i) => `<div class="nr-b" title="${MESES_CORTOS[i]}: ${nomFmt(v)}"><i style="height:${Math.round(v / max * 34)}px;${v ? '' : 'opacity:.2;'}"></i><em>${MC[i]}</em></div>`).join('')}</div>
      </div>`;
    }).join('') : '<div class="gc-empty">No hay pagos de nómina en ese año.</div>';
  }
  if ($('nr-anio')) $('nr-anio').addEventListener('change', nomRenderResumen);

  $('nom-buscar-persona').addEventListener('input', debounce(nomRenderBuscar, 160));
  $('nom-buscar-intervalo').addEventListener('change', nomRenderBuscar);

  // ---- Trabajadores (ahora es una vista rápida de Empleados, con su sueldo) ----
  function nomRenderTrabajadores() {
    const tbody = $('trab-nom-tbody');
    tbody.innerHTML = '';
    const activos = empleados.filter((e) => e.estado !== 'inactivo');
    $('trab-nom-empty').style.display = activos.length === 0 ? 'block' : 'none';
    $('trab-nom-tbl').style.display = activos.length === 0 ? 'none' : 'table';

    activos.forEach((emp) => {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td class="trab-nombre-cel" data-id="${emp.id}" style="font-weight:600;">
          <span class="trab-nombre-txt">${escapeHtml(empNombreCompleto(emp))}</span>
          <button type="button" class="gc-action-btn trab-nombre-edit" data-id="${emp.id}" title="Cambiar el nombre" style="padding:4px 10px;font-size:11.5px;margin-left:6px;">✎ Nombre</button>
        </td>
        <td class="num" style="font-weight:700;color:var(--teal);">${nomFmt(emp.sueldo)}</td>
        <td style="white-space:nowrap;">
          <input type="text" inputmode="decimal" class="trab-sueldo-input" data-id="${emp.id}" placeholder="Nuevo sueldo $" style="width:110px;padding:6px 10px;border:1.5px solid var(--border);border-radius:6px;font-size:12.5px;">
          <button class="gc-action-btn trab-sueldo-set" data-i18n="guardar" data-id="${emp.id}" style="padding:5px 12px;font-size:11.5px;margin-left:4px;">Guardar</button>
        </td>
        <td><button class="gc-action-btn trab-nom-del" data-i18n="inactivo" data-id="${emp.id}" style="padding:5px 10px;font-size:11px;" title="Marcar inactivo (no se borra su información)">Inactivo</button></td>
        <td><select class="trab-pagar-a" data-id="${emp.id}" style="min-width:170px;padding:6px 8px;border:1.5px solid var(--border);border-radius:6px;font-size:12.5px;">${nomOpcionesPagarA(emp)}</select></td>`;
      tbody.appendChild(tr);
    });

    tbody.querySelectorAll('.trab-pagar-a').forEach((sel) => {
      sel.addEventListener('change', async () => {
        const emp = empleados.find((e) => e.id === sel.dataset.id);
        if (!emp) return;
        if (sel.value === '__otro__') {
          // Escribir a quién (ej. CRA HVAC en una base donde no es socio): solo gasto, sin %
          const cel = sel.parentElement;
          cel.innerHTML = `<div style="display:flex;gap:6px;"><input type="text" class="trab-pagar-otro" placeholder="Ej. CRA HVAC" autocomplete="off" style="flex:1;min-width:0;padding:6px 8px;border:1.5px solid var(--border);border-radius:6px;font-size:16px;"><button type="button" class="gc-save-btn" style="padding:6px 12px;font-size:12.5px;">Guardar</button></div>`;
          const inp = cel.querySelector('input'); inp.focus();
          const ok = async () => {
            const nombre = inp.value.replace(/\s+/g, ' ').trim();
            if (!nombre) { nomRenderTrabajadores(); return; }
            emp.pagarA = 'nombre:' + nombre;
            try { await saveEmpleados(); toast(`${empNombreCompleto(emp)}: se le paga a ${nombre} (sin %)`); } catch (e) { toast('No se pudo guardar', 'error'); }
            nomRenderTrabajadores();
          };
          cel.querySelector('button').addEventListener('click', ok);
          inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') ok(); if (e.key === 'Escape') nomRenderTrabajadores(); });
          return;
        }
        emp.pagarA = sel.value;
        try { await saveEmpleados(); toast(sel.value ? `${empNombreCompleto(emp)}: se le paga a ${sel.options[sel.selectedIndex].text}` : `${empNombreCompleto(emp)}: se le paga directo`); }
        catch (e) { toast('No se pudo guardar', 'error'); }
      });
    });

    // ✎ Nombre: se edita ahí mismo; al guardar, el nombre nuevo también se
    // pone en los pagos ya registrados de esa persona (historial, recibos,
    // buscar por persona), para que no quede "partida" en dos nombres.
    tbody.querySelectorAll('.trab-nombre-edit').forEach((btn) => {
      btn.addEventListener('click', () => {
        const id = btn.dataset.id;
        const emp = empleados.find((e) => e.id === id);
        const cel = tbody.querySelector(`.trab-nombre-cel[data-id="${id}"]`);
        if (!emp || !cel) return;
        const viejo = empNombreCompleto(emp);
        cel.innerHTML = `<div style="display:flex;gap:6px;align-items:center;flex-wrap:wrap;">
          <input type="text" class="trab-nombre-input" value="${escapeHtml(viejo)}" autocomplete="off" style="flex:1;min-width:140px;padding:8px 10px;border:1.5px solid var(--border);border-radius:8px;font-size:16px;">
          <button type="button" class="gc-save-btn trab-nombre-ok" style="padding:8px 14px;font-size:12.5px;">Guardar</button>
          <button type="button" class="gc-action-btn trab-nombre-no" style="padding:7px 12px;font-size:12.5px;">Cancelar</button></div>`;
        const inp = cel.querySelector('.trab-nombre-input');
        inp.focus(); inp.select();
        const cancelar = () => nomRenderTrabajadores();
        const guardar = async () => {
          const nuevo = inp.value.replace(/\s+/g, ' ').trim();
          if (!nuevo) { toast('Escribe un nombre', 'error'); inp.focus(); return; }
          if (nuevo === viejo) { cancelar(); return; }
          const otro = nomBuscarTrab(nuevo);
          if (otro && otro.id !== id) { toast(`Ya hay un trabajador llamado "${nuevo}"`, 'error'); inp.focus(); return; }
          const pagos = nomDocs.filter((n) => (n.trabajador || '').trim().toLowerCase() === viejo.toLowerCase());
          if (pagos.length && !await gcConfirm(`¿Cambiar "${viejo}" por "${nuevo}"?\n\nTambién se cambia en sus ${pagos.length} pago(s) ya registrado(s), para que su historial siga junto.`, { okText: 'Cambiar nombre' })) return;
          emp.nombre = nuevo; emp.apellido = '';
          pagos.forEach((n) => { n.trabajador = nuevo; });
          nomGridFilas.forEach((f) => { if ((f.nombre || '').trim().toLowerCase() === viejo.toLowerCase()) f.nombre = nuevo; });
          await saveEmpleados();
          if (pagos.length) await nomSaveDocs();
          nomRefreshDl();
          nomRenderTrabajadores();
          try { nomGridRender(); nomRenderHist(); nomRenderRegLedger(); nomRenderSemanal(); nomRenderBuscar(); } catch (e) {}
          try { if (typeof renderEmpleados === 'function') renderEmpleados(); } catch (e) {}
          toast('Nombre actualizado ✓', 'success');
        };
        cel.querySelector('.trab-nombre-ok').addEventListener('click', guardar);
        cel.querySelector('.trab-nombre-no').addEventListener('click', cancelar);
        inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); guardar(); } if (e.key === 'Escape') cancelar(); });
      });
    });

    tbody.querySelectorAll('.trab-sueldo-set').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const id = btn.dataset.id;
        const idx = empleados.findIndex((e) => e.id === id);
        if (idx < 0) return;
        const input = tbody.querySelector(`.trab-sueldo-input[data-id="${id}"]`);
        const nuevo = parseFloat((input.value || '').replace(',', '.'));
        if (isNaN(nuevo) || nuevo < 0) { toast('Escribe un sueldo válido', 'error'); return; }
        empleados[idx].sueldo = nuevo;
        await saveEmpleados();
        nomRenderTrabajadores();
        // Si el trabajador está en la grilla de Registrar pago, actualizar su sueldo ahí también
        const nombreCompleto = empNombreCompleto(empleados[idx]);
        const fila = nomGridFilas.find((f) => f.nombre === nombreCompleto);
        if (fila) {
          fila.sueldo = nuevo;
          if (!fila.montoTocado) fila.monto = (fila.dias.length * fila.sueldo) + (fila.extraMonto || 0);
          nomGridRender();
        }
        toast('Sueldo actualizado ✓', 'success');
      });
    });
    tbody.querySelectorAll('.trab-sueldo-input').forEach((inp) => {
      inp.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') tbody.querySelector(`.trab-sueldo-set[data-id="${inp.dataset.id}"]`).click();
      });
    });
    tbody.querySelectorAll('.trab-nom-del').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const id = btn.dataset.id;
        const idx = empleados.findIndex((e) => e.id === id);
        if (idx < 0) return;
        const nombre = empNombreCompleto(empleados[idx]);
        if (!await gcConfirm(`¿Marcar a ${nombre} como inactivo? Ya no aparecerá para nuevos pagos, pero su información y sus pagos ya registrados se conservan. Puedes reactivarlo luego desde Ajustes → Empleados.`, { okText: 'Marcar inactivo', danger: true })) return;
        empleados[idx].estado = 'inactivo';
        await saveEmpleados();
        nomRefreshDl();
        nomRenderTrabajadores();
        toast('Trabajador marcado como inactivo', 'info');
      });
    });
  }
  $('trab-nom-btn-add').addEventListener('click', async () => {
    const val = $('trab-nom-nuevo').value.trim();
    const sueldo = parseFloat(($('trab-nom-sueldo').value || '0').replace(',', '.')) || 0;
    if (!val) return;
    if (nomBuscarTrab(val)) { toast('Ya existe', 'info'); return; }
    empleados.push({
      id: 'emp-' + Date.now(), nombre: val, apellido: '', rol: '', estado: 'activo', sueldo,
      tel: '', email: '', inicio: '', ss: '', emergencia: '', direccion: '', notas: ''
    });
    await saveEmpleados();
    nomRefreshDl();
    $('trab-nom-nuevo').value = '';
    $('trab-nom-sueldo').value = '';
    nomRenderTrabajadores();
    toast('Trabajador agregado ✓');
  });
  $('trab-nom-nuevo').addEventListener('keydown', (e) => { if (e.key === 'Enter') $('trab-nom-sueldo').focus(); });
  $('trab-nom-sueldo').addEventListener('keydown', (e) => { if (e.key === 'Enter') $('trab-nom-btn-add').click(); });

  // ---- Carga inicial de Nómina ----
  let nomCargado = false;
  document.querySelectorAll('.gc-tab').forEach((tab) => {
    if (tab.dataset.tab === 'nomina') {
      tab.addEventListener('click', async () => {
        if (!nomCargado) {
          await nomAsegurarCargado();
        } else {
          // Ya estaba abierta: trae el check-in más reciente. Si el admin no
          // ha tocado nada a mano en esta semana, se vuelve a armar la lista.
          try { chkAvisarNuevos(await chkSincronizarTrabajadores()); } catch (e) {}
          const antes = JSON.stringify(nomCheckin);
          await nomCargarCheckin();
          const sinTocar = !nomGridFilas.some((f) => f.tocado && !f.deCheckin);
          if (JSON.stringify(nomCheckin) !== antes && sinTocar) nomGridAbrirSemana();
        }
      });
    }
  });
  // Carga la nómina una sola vez (la usan Nómina y Payroll)
  let nomCargaPromesa = null;
  function nomAsegurarCargado() {
    if (nomCargado && !nomCargaPromesa) return Promise.resolve();
    if (!nomCargaPromesa) nomCargaPromesa = (async () => {
          nomCargado = true;
          // Las tres lecturas son independientes: se piden a la vez (más rápido,
          // sobre todo con conexión lenta) en vez de una tras otra.
          const [rDocs, rEmp, rViejo] = await Promise.all([
            window.storage.get(NOM_KEY).catch(() => null),
            window.storage.get(STORAGE_EMPLEADOS).catch(() => null),
            window.storage.get(TRAB_NOM_KEY_VIEJO).catch(() => null),
            nomCargarCheckin()
          ]);
          try { nomDocs = JSON.parse(rDocs.value); } catch (e) { nomDocs = []; }
          if (!Array.isArray(nomDocs)) nomDocs = [];
          if (!rDocs && window.GH_SYNC && window.GH_SYNC.hayLecturasFallidas()) toast('No se pudo leer la nómina (sin señal). Lo que guardes se junta con lo de la nube.', 'error', 5000);
          await nomLimpiarDuplicados();   // junta recibos repetidos de la misma persona/semana
          try { const v = JSON.parse(rEmp.value); if (Array.isArray(v)) { empleados = v; empleadosLeidos = true; } } catch (e) { /* puede que ya se hayan cargado antes en esta sesión */ }
          // Migración de una sola vez: si había trabajadores en el formato viejo
          // que aún no están en Empleados, se agregan ahí (sin duplicar).
          if (rViejo) { try { await nomMigrarTrabajadoresViejos(JSON.parse(rViejo.value)); } catch (e) {} }
          try { chkAvisarNuevos(await chkSincronizarTrabajadores()); } catch (e) {}
          nomRefreshDl();
          nomRegSemanaOffset = 0;
          nomGridAbrirSemana();
          nomRenderRegLedger();
    })();
    return nomCargaPromesa;
  }

  // ====================================================================
  // RECIBO SEMANAL
  // ====================================================================
  const RECIBOS_KEY = 'gh-recibos-semanales';
  let nomCopias = [];

  // Día abreviado con número: "Lun 4"
  function nomDiaCorto(fechaStr) {
    const d = new Date(fechaStr + 'T00:00:00');
    if (isNaN(d)) return fechaStr;
    const dias = ['Dom','Lun','Mar','Mié','Jue','Vie','Sáb'];
    return `${dias[d.getDay()]} ${d.getDate()}`;
  }
  // Clave de semana (lunes) a partir de una fecha
  function nomWeekKey(fechaStr) {
    const d = new Date(fechaStr + 'T00:00:00');
    if (isNaN(d)) return '';
    const day = (d.getDay() + 6) % 7; // lunes=0
    const lunes = new Date(d); lunes.setDate(d.getDate() - day);
    return ghFechaLocal(lunes);
  }
  function nomWeekRango(weekKey) {
    const lunes = new Date(weekKey + 'T00:00:00');
    const domingo = new Date(lunes); domingo.setDate(lunes.getDate() + 6);
    return { inicio: weekKey, fin: ghFechaLocal(domingo) };
  }
  function nomFechaCortaTexto(fechaStr) {
    const d = new Date(fechaStr + 'T00:00:00');
    if (isNaN(d)) return fechaStr;
    const meses = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];
    return `${d.getDate()} ${meses[d.getMonth()]} ${d.getFullYear()}`;
  }

  // Agrupar pagos por semana → trabajador
  function nomAgruparSemanas() {
    const semanas = new Map();
    nomDocs.forEach((n) => {
      const dias = Array.isArray(n.dias) ? n.dias.slice().sort() : [];
      const refDay = dias[0] || (n.creadoEn || '').slice(0, 10);
      if (!refDay) return;
      const wk = nomWeekKey(refDay);
      if (!wk) return;
      if (!semanas.has(wk)) semanas.set(wk, new Map());
      const trabMap = semanas.get(wk);
      if (!trabMap.has(n.trabajador)) trabMap.set(n.trabajador, { dias: [], monto: 0, pagos: [] });
      const t = trabMap.get(n.trabajador);
      t.dias.push(...dias);
      t.monto += Number(n.monto) || 0;
      t.pagos.push(n);
    });
    return semanas;
  }

  // Render de la vista semanal (tipo Movimientos)
  function nomRenderSemanal() {
    const cont = $('nom-semanas-cont');
    cont.innerHTML = '';
    const semanas = nomAgruparSemanas();
    $('nom-semanas-empty').style.display = semanas.size === 0 ? 'block' : 'none';

    const claves = [...semanas.keys()].sort((a, b) => b.localeCompare(a)); // más reciente primero
    claves.forEach((wk) => {
      const trabMap = semanas.get(wk);
      const rango = nomWeekRango(wk);
      let totalSemana = 0;

      let filas = '';
      [...trabMap.entries()].forEach(([nombre, t]) => {
        totalSemana += t.monto;
        const diasUnicos = [...new Set(t.dias)].sort();
        const diasTxt = diasUnicos.map(nomDiaCorto).join(', ');
        filas += `
          <div style="display:flex;justify-content:space-between;align-items:center;padding:10px 12px;border-bottom:1px solid #F0F4FA;gap:12px;">
            <div style="flex:1;min-width:0;">
              <div style="font-weight:600;color:var(--ink);font-size:13.5px;">${escapeHtml(nombre)}</div>
              <div style="font-size:12px;color:var(--muted);margin-top:2px;">trabajó: ${escapeHtml(diasTxt)} <span style="color:var(--navy);font-weight:600;">(${diasUnicos.length} día${diasUnicos.length!==1?'s':''})</span>${t.pagos.length > 1 ? ` · ${t.pagos.length} pagos` : ''}</div>
            </div>
            <div style="display:flex;align-items:center;gap:10px;flex-shrink:0;">
              <div style="font-family:'IBM Plex Mono',monospace;font-weight:700;color:var(--teal);font-size:14px;white-space:nowrap;">${nomFmt(t.monto)}</div>
              <button type="button" class="gc-action-btn nom-sem-editar-trab" data-i18n="editar" data-wk="${wk}" data-nombre="${escapeHtml(nombre)}" style="padding:4px 10px;font-size:11px;" title="Editar este pago">Editar</button>
            </div>
          </div>`;
      });

      const card = document.createElement('div');
      card.className = 'gc-card';
      card.style.marginBottom = '16px';
      card.innerHTML = `
        <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:10px;margin-bottom:12px;">
          <p style="font-family:'Zilla Slab',serif;font-size:15px;font-weight:600;color:var(--ink);margin:0;">Semana del ${nomFechaCortaTexto(rango.inicio)} al ${nomFechaCortaTexto(rango.fin)}</p>
          <div style="display:flex;gap:8px;flex-wrap:wrap;">
            <button class="gc-action-btn nom-sem-editar" data-i18n="editar_semana" data-wk="${wk}" style="padding:5px 12px;font-size:11.5px;">Editar semana</button>
            <button class="gc-action-btn nom-sem-ver" data-i18n="ver_recibo" data-wk="${wk}" style="padding:5px 12px;font-size:11.5px;">Ver recibo</button>
            <button class="gc-action-btn nom-sem-imp" data-i18n="imprimir" data-wk="${wk}" style="padding:5px 12px;font-size:11.5px;">Imprimir</button>
          </div>
        </div>
        <div style="border:1px solid var(--border);border-radius:10px;overflow:hidden;">
          ${filas}
          <div style="display:flex;justify-content:space-between;align-items:center;padding:12px;background:var(--navy);color:#fff;">
            <span style="font-weight:600;font-size:13px;">TOTAL DE LA SEMANA</span>
            <span style="font-family:'IBM Plex Mono',monospace;font-weight:700;font-size:15px;">${nomFmt(totalSemana)}</span>
          </div>
        </div>`;
      cont.appendChild(card);
    });

    // Listeners
    cont.querySelectorAll('.nom-sem-editar').forEach((btn) => {
      btn.addEventListener('click', () => nomIrASemana(btn.dataset.wk));
    });
    cont.querySelectorAll('.nom-sem-ver').forEach((btn) => {
      btn.addEventListener('click', () => nomMostrarReciboSemanal(btn.dataset.wk));
    });
    cont.querySelectorAll('.nom-sem-imp').forEach((btn) => {
      btn.addEventListener('click', () => {
        ghImprimirEnVentana(nomBuildReciboSemanal(btn.dataset.wk), 'Recibo semanal');
      });
    });
    cont.querySelectorAll('.nom-sem-editar-trab').forEach((btn) => {
      btn.addEventListener('click', () => nomIrASemana(btn.dataset.wk, btn.dataset.nombre));
    });
  }

  // Construir el recibo semanal (invoice de toda la semana)
  function nomBuildReciboSemanal(wk) {
    const FC = facturaColores();
    const semanas = nomAgruparSemanas();
    const trabMap = semanas.get(wk);
    if (!trabMap) return '<div>Sin datos</div>';
    const rango = nomWeekRango(wk);
    let totalSemana = 0;

    const filas = [...trabMap.entries()].map(([nombre, t]) => {
      totalSemana += t.monto;
      const diasUnicos = [...new Set(t.dias)].sort();
      const diasTxt = diasUnicos.map((f) => nomDiaCorto(f)).join(', ');
      return `
        <tr>
          <td style="padding:9px 8px;border-bottom:1px solid #e5e5e5;font-size:12.5px;font-weight:600;">${escapeHtml(nombre)}</td>
          <td style="padding:9px 8px;border-bottom:1px solid #e5e5e5;font-size:12px;color:#555;">${escapeHtml(diasTxt)}</td>
          <td style="padding:9px 8px;border-bottom:1px solid #e5e5e5;text-align:center;font-size:12.5px;">${diasUnicos.length}</td>
          <td style="padding:9px 8px;border-bottom:1px solid #e5e5e5;text-align:right;font-size:12.5px;font-weight:600;">${nomFmt(t.monto)}</td>
        </tr>`;
    }).join('');

    return `
      <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:22px;border-bottom:3px solid ${FC.p};padding-bottom:18px;">
        <div>
          <div style="font-size:22px;font-weight:700;color:${FC.p};font-family:Georgia,serif;">${escapeHtml(cfgFacturaNombre)}</div>
          ${cfgFacturaDireccion ? `<div style="font-size:11.5px;color:#707A8C;margin-top:2px;">${escapeHtml(cfgFacturaDireccion)}</div>` : ''}
          <div style="font-size:12px;color:#666;margin-top:3px;">Recibo de nómina semanal</div>
        </div>
        <div style="text-align:right;">
          <div style="font-size:20px;font-weight:700;color:${FC.p};letter-spacing:1px;">NÓMINA</div>
          <div style="font-size:13px;font-weight:600;color:${FC.p};margin-top:6px;">Semana</div>
          <div style="font-size:12px;color:#666;">${invFechaNum(rango.inicio)}</div>
          <div style="font-size:12px;color:#666;">al ${invFechaNum(rango.fin)}</div>
        </div>
      </div>

      <table style="width:100%;border-collapse:collapse;margin-bottom:18px;">
        <thead><tr style="background:${FC.p};">
          <th style="padding:10px 8px;text-align:left;font-size:10px;color:rgba(255,255,255,.85);text-transform:uppercase;" data-i18n="trabajador">Trabajador</th>
          <th style="padding:10px 8px;text-align:left;font-size:10px;color:rgba(255,255,255,.85);text-transform:uppercase;" data-i18n="h_dias_trabajados">Días trabajados</th>
          <th style="padding:10px 8px;text-align:center;font-size:10px;color:rgba(255,255,255,.85);text-transform:uppercase;width:60px;" data-i18n="h_dias">Días</th>
          <th style="padding:10px 8px;text-align:right;font-size:10px;color:rgba(255,255,255,.85);text-transform:uppercase;width:110px;" data-i18n="h_total">Total</th>
        </tr></thead>
        <tbody>${filas}</tbody>
      </table>

      <div style="display:flex;justify-content:flex-end;">
        <table style="font-size:14px;width:260px;">
          <tr style="border-top:2px solid ${FC.p};"><td style="padding:10px 0;font-size:15px;font-weight:700;color:${FC.p};">TOTAL SEMANA</td><td style="padding:10px 0;text-align:right;font-size:15px;font-weight:700;color:${FC.p};">${nomFmt(totalSemana)}</td></tr>
        </table>
      </div>

      <div style="margin-top:34px;padding-top:12px;border-top:1px solid #eee;text-align:center;font-size:11px;color:#aaa;">${escapeHtml(cfgFacturaNombre)} · Nómina semanal · Semana del ${nomFechaCortaTexto(rango.inicio)} al ${nomFechaCortaTexto(rango.fin)}</div>`;
  }

  let nomSemReciboWk = null;
  function nomMostrarReciboSemanal(wk) {
    nomSemReciboWk = wk;
    nomReciboEnVista = { _semanal: true, wk };
    $('nom-recibo-content').innerHTML = nomBuildReciboSemanal(wk);
    $('nom-btn-imprimir-recibo').style.display = 'none';
    $('nom-btn-descargar-recibo').style.display = 'none';
    $('nom-ov').style.display = 'flex';
  }

  // ---- Ledger de pagos guardados (en Registrar pago) ----
  function nomRenderRegLedger() {
    const buscar = ($('nom-reg-buscar').value || '').trim().toLowerCase(); const cont = $('nom-reg-ledger');
    cont.innerHTML = '';

    let lista = nomDocs.slice().sort((a, b) => (b.creadoEn || '').localeCompare(a.creadoEn || ''));
    if (buscar) {
      lista = lista.filter((n) =>
        (n.trabajador || '').toLowerCase().includes(buscar) ||
        (n.nota || '').toLowerCase().includes(buscar)
      );
    }
    $('nom-reg-empty').style.display = lista.length === 0 ? 'block' : 'none';

    // Optimización: solo mostrar los 20 más recientes si no hay búsqueda
    const MAX = 20;
    const recortada = (!buscar && lista.length >MAX) ? lista.slice(0, MAX) : lista;

    // Construir el HTML de una sola vez (más rápido que muchos appendChild)
    const filas = recortada.map((n) => {
      const dias = Array.isArray(n.dias) ? [...new Set(n.dias)].sort() : [];
      const diasTxt = dias.length ? dias.map(nomDiaCorto).join(', ') : (typeof n.dias === 'number' ? `${n.dias} día(s)` : '—');
      return `
        <div style="display:flex;justify-content:space-between;align-items:center;padding:10px 12px;border-bottom:1px solid #F0F4FA;gap:12px;" data-id="${n.id}">
          <div style="flex:1;min-width:0;">
            <div style="font-weight:600;color:var(--ink);font-size:13.5px;">${escapeHtml(n.trabajador || '')}</div>
            <div style="font-size:12px;color:var(--muted);margin-top:2px;">trabajó: ${escapeHtml(diasTxt)} <span style="color:var(--navy);font-weight:600;">(${dias.length || nomCuentaDias(n.dias)} día${(dias.length||0)!==1?'s':''})</span>${n.nota ? ' · ' + escapeHtml(n.nota) : ''}</div>
          </div>
          <div style="font-family:'IBM Plex Mono',monospace;font-weight:700;color:var(--teal);font-size:14px;white-space:nowrap;">${nomFmt(n.monto)}</div>
          <div style="white-space:nowrap;display:flex;gap:3px;">
            <button class="gc-action-btn nom-reg-ver" data-i18n="ver" data-id="${n.id}" style="padding:4px 9px;font-size:11px;">Ver</button>
            <button class="gc-action-btn nom-reg-imp" data-i18n="imprimir" data-id="${n.id}" style="padding:4px 9px;font-size:11px;">Imprimir</button>
            <button class="gc-action-btn nom-reg-edit" data-id="${n.id}" style="padding:4px 9px;font-size:11px;">✎</button>
            <button class="gc-del nom-reg-del" data-id="${n.id}">✕</button>
          </div>
        </div>`;
    }).join('');

    const aviso = (!buscar && lista.length >MAX)
      ? `<div style="padding:10px 12px;text-align:center;font-size:12px;color:var(--muted);">Mostrando los ${MAX} más recientes de ${lista.length}. Usa el buscador o ve al Historial para ver todos.</div>`
      : '';

    cont.innerHTML = `<div style="border:1px solid var(--border);border-radius:10px;overflow:hidden;">${filas}${aviso}</div>`;

    // Delegación de eventos (más eficiente que un listener por botón)
    cont.querySelectorAll('.nom-reg-ver').forEach((b) => b.addEventListener('click', () => { const n = nomDocs.find((x) => x.id === b.dataset.id); if (n) nomMostrarRecibo(n); }));
    cont.querySelectorAll('.nom-reg-imp').forEach((b) => b.addEventListener('click', () => {
      const n = nomDocs.find((x) => x.id === b.dataset.id); if (!n) return;
      ghImprimirEnVentana(nomBuildRecibo(n), `Recibo - ${n.trabajador || ''}`);
    }));
    cont.querySelectorAll('.nom-reg-edit').forEach((b) => b.addEventListener('click', () => { const n = nomDocs.find((x) => x.id === b.dataset.id); if (n) nomEditar(n); }));
    cont.querySelectorAll('.nom-reg-del').forEach((b) => b.addEventListener('click', async () => {
      if (!await gcConfirm('¿Eliminar este pago?', { okText: 'Eliminar', danger: true })) return;
      nomDocs = nomDocs.filter((x) => x.id !== b.dataset.id);
      await nomSaveDocs();
      toast('Pago eliminado', 'info');
      nomRenderRegLedger();
    }));
  }
  $('nom-reg-buscar').addEventListener('input', debounce(nomRenderRegLedger, 160));



  // ====================================================================
  // FIN MÓDULO NÓMINA
  // ====================================================================

  // ---- Carga inicial ----
  // Empleados y papeles se cargan solo al abrir su sección en Ajustes (más rápido el arranque)
  loadAll();
// ---- 16-invoice-editor.js ----
  // ===================== EDITAR UN INVOICE GUARDADO AHÍ MISMO =====================
  // Abre una ventana con todas las líneas del invoice (ingresos, gastos y
  // ajustes). Se pueden cambiar, quitar o agregar; al guardar se recalcula el
  // invoice con las mismas reglas de siempre (taxas, reparto, % de socios) y se
  // queda guardado en su lugar, sin pasar por Movimientos.
  function invEdLineasDe(inv) {
    const filas = [];
    const ref = (inv.gastoItems && inv.gastoItems[0] && inv.gastoItems[0].fecha) || inv.key || today();
    if (Array.isArray(inv.ingresoItems) && inv.ingresoItems.length) inv.ingresoItems.forEach((m) => filas.push({ ...m, tipo: 'ingreso' }));
    else if (Number(inv.ingresos) > 0) filas.push({ fecha: ref, tipo: 'ingreso', cat: catIngresos[0] || 'Ingreso', monto: inv.ingresos, desc: '' });
    (inv.gastoItems || []).forEach((m) => filas.push({ ...m, tipo: 'gasto' }));
    if (Array.isArray(inv.ajusteItems) && inv.ajusteItems.length) inv.ajusteItems.forEach((m) => filas.push({ ...m, tipo: 'ajuste' }));
    else if (inv.ajusteGuzman) {
      const socio = (cfgSocios || [])[0];
      filas.push({ fecha: ref, tipo: 'ajuste', cat: 'Ajuste', monto: Math.abs(inv.ajusteGuzman), ajusteDir: inv.ajusteGuzman < 0 ? 'restar' : 'sumar', ajusteSocioId: socio ? socio.id : 'empresa', desc: '' });
    }
    return filas.map((f, i) => ({ ...f, id: f.id != null ? f.id : Date.now() + i, monto: Number(f.monto) || 0 }));
  }
  // Recalcula un invoice con estas líneas (todas cuentan en la semana del invoice)
  function invEdCalcular(inv, filas) {
    const respaldo = movimientos;
    let r = null;
    try {
      movimientos = filas.filter((f) => Number(f.monto) > 0).map((f) => ({ ...f, fecha: inv.key || f.fecha }));
      r = calcularSemanas()[0] || null;
    } finally { movimientos = respaldo; }
    if (!r) return null;
    const limpias = filas.filter((f) => Number(f.monto) > 0);
    r.gastoItems = limpias.filter((f) => f.tipo === 'gasto').sort((a, b) => (a.fecha || '').localeCompare(b.fecha || ''));
    r.ingresoItems = limpias.filter((f) => f.tipo === 'ingreso');
    r.ajusteItems = limpias.filter((f) => f.tipo === 'ajuste');
    return r;
  }
  function abrirEditorInvoice(inv) {
    let filas = invEdLineasDe(inv);
    const ov = document.createElement('div');
    ov.className = 'gc-confirm-overlay';
    ov.style.alignItems = 'flex-start';
    ov.style.overflowY = 'auto';
    ov.innerHTML = `
      <div class="gc-confirm-box" style="max-width:880px;margin:20px auto;">
        <p style="font-weight:700;font-size:16px;margin:0 0 2px;">Editar invoice</p>
        <p style="font-size:12.5px;color:var(--muted);margin:0 0 14px;">${escapeHtml(inv.label || '')}</p>
        <datalist id="inv-ed-dl-cats">${[...new Set([...(catGastos || []), ...(catIngresos || [])])].map((c) => `<option value="${escapeHtml(c)}">`).join('')}</datalist>
        <div id="inv-ed-filas" style="display:flex;flex-direction:column;gap:8px;"></div>
        <div style="display:flex;flex-wrap:wrap;gap:8px;margin:12px 0 4px;">
          <button type="button" class="gc-action-btn" data-add="ingreso">+ Ingreso</button>
          <button type="button" class="gc-action-btn" data-add="gasto">+ Gasto</button>
          <button type="button" class="gc-action-btn" data-add="ajuste">+ Ajuste</button>
        </div>
        <div id="inv-ed-total" style="margin-top:12px;padding:12px 14px;border:1.5px solid var(--border);border-radius:var(--r-sm);background:var(--surface-2);font-size:13px;"></div>
        <div class="gc-confirm-actions" style="margin-top:16px;flex-wrap:wrap;">
          <button type="button" class="gc-action-btn" data-acc="cancelar">Cancelar</button>
          <button type="button" class="gc-save-btn" data-acc="guardar">Guardar cambios</button>
        </div>
      </div>`;
    document.body.appendChild(ov);
    requestAnimationFrame(() => requestAnimationFrame(() => ov.classList.add('show')));
    const cont = ov.querySelector('#inv-ed-filas');
    const estiloIn = 'padding:8px 10px;border:1.5px solid var(--border);border-radius:6px;font-size:14px;background:var(--card);color:var(--ink);min-width:0;';
    const opcSocios = () => opcionesAjuste().map((o) => `<option value="${escapeHtml(o.id)}">${escapeHtml(o.nombre)}</option>`).join('');
    const colorTipo = { ingreso: 'var(--teal)', gasto: 'var(--ember)', ajuste: 'var(--blue)' };

    function pintar() {
      cont.innerHTML = filas.map((f, i) => `
        <div data-i="${i}" style="display:grid;grid-template-columns:96px 140px minmax(120px,1fr) minmax(120px,1.4fr) 110px 34px;gap:6px;align-items:center;padding:8px;border:1px solid var(--border-soft);border-left:4px solid ${colorTipo[f.tipo] || 'var(--border)'};border-radius:8px;" class="inv-ed-fila">
          <select data-k="tipo" style="${estiloIn}">
            <option value="ingreso"${f.tipo === 'ingreso' ? ' selected' : ''}>Ingreso</option>
            <option value="gasto"${f.tipo === 'gasto' ? ' selected' : ''}>Gasto</option>
            <option value="ajuste"${f.tipo === 'ajuste' ? ' selected' : ''}>Ajuste</option>
          </select>
          <input type="date" data-k="fecha" value="${escapeHtml(f.fecha || '')}" style="${estiloIn}">
          ${f.tipo === 'ajuste'
            ? `<div style="display:flex;gap:4px;min-width:0;"><select data-k="ajusteDir" style="${estiloIn}width:58px;"><option value="sumar"${f.ajusteDir !== 'restar' ? ' selected' : ''}>+</option><option value="restar"${f.ajusteDir === 'restar' ? ' selected' : ''}>−</option></select>
               <select data-k="ajusteSocioId" style="${estiloIn}flex:1;">${opcSocios()}</select></div>`
            : `<input type="text" data-k="cat" list="inv-ed-dl-cats" value="${escapeHtml(f.cat || '')}" placeholder="Categoría" style="${estiloIn}">`}
          <input type="text" data-k="desc" value="${escapeHtml(f.desc || '')}" placeholder="Descripción" style="${estiloIn}">
          <input type="text" inputmode="decimal" data-k="monto" value="${f.monto ? Number(f.monto).toFixed(2) : ''}" placeholder="0.00" style="${estiloIn}text-align:right;">
          <button type="button" class="gc-del" data-quitar="${i}" title="Quitar línea">✕</button>
        </div>`).join('') || '<div class="gc-empty" style="display:block;">Sin líneas. Agrega una abajo.</div>';
      cont.querySelectorAll('select[data-k="ajusteSocioId"]').forEach((sel) => {
        const f = filas[Number(sel.closest('[data-i]').dataset.i)];
        if (f.ajusteSocioId && [...sel.options].some((o) => o.value === f.ajusteSocioId)) sel.value = f.ajusteSocioId;
        else f.ajusteSocioId = sel.value;
      });
      totales();
    }
    function totales() {
      const r = invEdCalcular(inv, filas);
      const box = ov.querySelector('#inv-ed-total');
      if (!r) { box.innerHTML = 'Sin montos todavía.'; return; }
      const pagos = (r.pagos || []).map((p) => `<div style="display:flex;justify-content:space-between;"><span>${escapeHtml(p.nombre)}</span><strong>${fmt(p.total)}</strong></div>`).join('');
      box.innerHTML = `
        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(120px,1fr));gap:8px;margin-bottom:8px;">
          <div>Ingresos<br><strong>${fmt(r.ingresos)}</strong></div>
          <div>Gastos<br><strong>${fmt(r.gastos)}</strong></div>
          <div>Taxas<br><strong>${fmt(r.taxas)}</strong></div>
          <div>Neto<br><strong>${fmt(r.neto)}</strong></div>
        </div>
        <div style="border-top:1px solid var(--border-soft);padding-top:8px;display:flex;flex-direction:column;gap:3px;">${pagos}
          <div style="display:flex;justify-content:space-between;color:var(--muted);"><span>Tax ${escapeHtml(cfgFacturaNombre || '')}</span><span>${fmt(r.taxGuzman)}</span></div></div>`;
    }
    cont.addEventListener('input', (e) => {
      const el = e.target; const fila = el.closest('[data-i]'); if (!fila || !el.dataset.k) return;
      const f = filas[Number(fila.dataset.i)];
      if (el.dataset.k === 'monto') f.monto = parseFloat(String(el.value).replace(/[$,\s]/g, '')) || 0;
      else f[el.dataset.k] = el.value;
      totales();
    });
    cont.addEventListener('change', (e) => {
      const el = e.target; const fila = el.closest('[data-i]'); if (!fila || !el.dataset.k) return;
      const f = filas[Number(fila.dataset.i)];
      if (el.dataset.k === 'tipo') {
        f.tipo = el.value;
        if (f.tipo === 'ajuste') { f.ajusteDir = f.ajusteDir || 'sumar'; f.cat = 'Ajuste +'; }
        else { delete f.ajusteDir; delete f.ajusteSocioId; delete f.ajusteSocioNombre; if (/^Ajuste/.test(f.cat || '')) f.cat = ''; }
        pintar();
      } else if (el.dataset.k === 'ajusteDir' || el.dataset.k === 'ajusteSocioId') {
        f[el.dataset.k] = el.value;
        totales();
      }
    });
    cont.addEventListener('click', (e) => {
      const b = e.target.closest('[data-quitar]'); if (!b) return;
      filas.splice(Number(b.dataset.quitar), 1); pintar();
    });
    ov.querySelectorAll('[data-add]').forEach((b) => b.addEventListener('click', () => {
      const tipo = b.dataset.add;
      const fila = { id: Date.now() + Math.random(), tipo, fecha: inv.key || today(), cat: tipo === 'ajuste' ? 'Ajuste +' : '', desc: '', monto: 0 };
      if (tipo === 'ajuste') fila.ajusteDir = 'sumar';
      filas.push(fila); pintar();
      const ult = cont.querySelector('.inv-ed-fila:last-child input[data-k="cat"], .inv-ed-fila:last-child input[data-k="monto"]');
      if (ult) ult.focus();
    }));
    const cerrar = () => { ov.classList.remove('show'); setTimeout(() => ov.remove(), 180); };
    ov.querySelector('[data-acc="cancelar"]').addEventListener('click', cerrar);
    ov.querySelector('[data-acc="guardar"]').addEventListener('click', async () => {
      const malas = filas.filter((f) => f.tipo !== 'ajuste' && Number(f.monto) > 0 && !String(f.cat || '').trim());
      if (malas.length) { toast('Ponle categoría a todas las líneas', 'error'); return; }
      filas.forEach((f) => {
        if (f.tipo === 'ajuste') { f.cat = f.ajusteDir === 'restar' ? 'Ajuste −' : 'Ajuste +'; f.ajusteSocioNombre = nombreDeAjuste(f.ajusteSocioId); }
        f.cat = String(f.cat || '').trim();
      });
      const r = invEdCalcular(inv, filas);
      if (!r) { toast('El invoice quedó sin montos — agrega al menos una línea', 'error'); return; }
      // Categorías nuevas escritas aquí se agregan a la lista
      let nuevas = false;
      filas.forEach((f) => {
        if (f.tipo === 'gasto' && f.cat && !catGastos.includes(f.cat)) { catGastos.push(f.cat); nuevas = true; }
        if (f.tipo === 'ingreso' && f.cat && !catIngresos.includes(f.cat)) { catIngresos.push(f.cat); nuevas = true; }
      });
      if (nuevas) { try { await saveCatGastos(); await saveCatIngresos(); } catch (e) {} renderCatSelect(); }
      const fijos = { id: inv.id, key: inv.key || r.key, label: inv.label || r.label, guardadoEn: inv.guardadoEn, editadoEn: new Date().toISOString() };
      Object.keys(inv).forEach((k) => { delete inv[k]; });
      Object.assign(inv, r, fijos);
      await saveInvoices();
      renderReparto();
      cerrar();
      toast('Invoice actualizado ✓', 'success');
    });
    pintar();
  }
  // ===================== /EDITAR UN INVOICE GUARDADO =====================

// ---- 17-nomina-pago.js ----
  // ===================== NÓMINA: A QUIÉN SE LE PAGA =====================
  // Cada trabajador puede cobrar directo, o su sueldo se le da a un socio
  // (ej. CRA HVAC, que gana su % encima) o a otro trabajador (ej. Ariel
  // Chirinos cobra lo de él y su esposa). Se guarda en emp.pagarA:
  // '' = directo, 'socio:<id>' o 'trab:<id del empleado>'.
  function nomSociosParaPago() {
    const clave = (cfgFacturaNombre || '').trim().toLowerCase();
    return (cfgSocios || []).filter((x) => x && x.nombre && x.nombre.trim().toLowerCase() !== clave);
  }
  function nomOpcionesPagarA(emp) {
    const actual = emp.pagarA || '';
    const op = (v, t) => `<option value="${escapeHtml(v)}"${v === actual ? ' selected' : ''}>${escapeHtml(t)}</option>`;
    const socios = nomSociosParaPago().map((x) => op('socio:' + x.id, x.nombre + ' (socio)'));
    const otros = empleados.filter((e) => e.estado !== 'inactivo' && e.id !== emp.id)
      .map((e) => op('trab:' + e.id, empNombreCompleto(e)));
    const libre = actual.startsWith('nombre:') ? op(actual, actual.slice(7) + ' (sin %)') : '';
    return op('', 'Directo (a él)') + socios.join('') + otros.join('') + libre + '<option value="__otro__">Otro nombre… (sin %)</option>';
  }
  // Quién cobra el pago de un trabajador → { key, nombre, tipo: 'socio' | 'trab', socioId, bonoPct }
  function nomReceptorDe(nombreTrab, ctx) {
    // ctx = { empleados, socios } de otra base de datos (para cheques); sin ctx, la base actual
    const emps = ctx ? ctx.empleados : empleados;
    const nBusca = String(nombreTrab || '').trim().toLowerCase();
    const emp = ctx ? emps.find((e) => empNombreCompleto(e).toLowerCase() === nBusca) : nomBuscarTrab(nombreTrab);
    // Si en la otra base no se escogió a quién se le paga, se usa lo de esta base (mismo nombre)
    if (ctx && !(emp && emp.pagarA) && nomBuscarTrab(nombreTrab) && nomBuscarTrab(nombreTrab).pagarA) return nomReceptorDe(nombreTrab);
    const pa = (emp && emp.pagarA) || '';
    if (pa.startsWith('socio:')) {
      const socio = (ctx ? ctx.socios : nomSociosParaPago()).find((x) => x.id === pa.slice(6));
      if (socio) return { key: pa, nombre: socio.nombre, tipo: 'socio', socioId: socio.id, bonoPct: Number(socio.bonoPct) || 0 };
    }
    if (pa.startsWith('nombre:') && pa.slice(7).trim()) {
      return { key: 'nombre:' + pa.slice(7).trim().toLowerCase(), nombre: pa.slice(7).trim(), tipo: 'otro' };
    }
    if (pa.startsWith('trab:')) {
      const t = emps.find((e) => e.id === pa.slice(5) && e.estado !== 'inactivo');
      if (t) return { key: 'trab:' + t.id, nombre: empNombreCompleto(t), tipo: 'trab' };
    }
    return { key: 'trab:' + (emp ? emp.id : String(nombreTrab || '').toLowerCase()), nombre: emp ? empNombreCompleto(emp) : (nombreTrab || ''), tipo: 'trab' };
  }
  // Pagos de una semana agrupados por quién cobra (socios primero)
  function nomAgruparSemana(weekKey, docs) {
    const grupos = new Map();
    (docs || nomDocs || []).filter((n) => chqSemanaDe(n) === weekKey && Number(n.monto) > 0).forEach((n) => {
      const r = nomReceptorDe(n.trabajador, n._ctx);
      const clave = String(r.nombre || '').trim().toLowerCase();
      if (!grupos.has(clave)) grupos.set(clave, Object.assign({}, r, { pagos: [], total: 0 }));
      const g = grupos.get(clave);
      g.pagos.push(n);
      g.total += Number(n.monto) || 0;
    });
    return [...grupos.values()].map((g) => Object.assign(g, { total: Math.round(g.total * 100) / 100 }))
      .sort((a, b) => ((a.tipo === 'socio') === (b.tipo === 'socio') ? a.nombre.localeCompare(b.nombre) : (a.tipo === 'socio' ? -1 : 1)));
  }
  function nomSemanasConPagos() {
    const set = new Set();
    (nomDocs || []).forEach((n) => { const k = chqSemanaDe(n); if (k) set.add(k); });
    return [...set].sort().reverse();
  }
  function nomEtiquetaSemana(k) {
    const r = nomWeekRango(k);
    const f = (iso) => { const d = new Date(iso + 'T00:00:00'); return d.toLocaleDateString('es-MX', { day: 'numeric', month: 'short' }); };
    return `${f(r.inicio)} – ${f(r.fin)}`;
  }

  // ---- Movimientos → Agregar nómina de la semana ----
  async function movNomAbrir() {
    // Hace falta la nómina Y los empleados (con "a quién se le paga"): sin
    // empleados, lo de CRA HVAC salía como gasto suelto sin su ajuste ni su %.
    try { await nomAsegurarCargado(); } catch (e) {}
    if (!empleados || !empleados.length) { try { await loadEmpleados(); } catch (e) {} }
    const semanas = nomSemanasConPagos();
    const sel = $('mov-nom-semana');
    if (!semanas.length) { toast('No hay nómina registrada todavía (Nómina → Registrar pago)', 'error', 3500); return; }
    // Por defecto la semana pasada (la que se paga esta semana), si existe
    const hoy = nomToday();
    const pasada = (() => { const d = new Date(nomWeekKey(hoy) + 'T00:00:00'); d.setDate(d.getDate() - 7); return ghFechaLocal(d); })();
    const yaAgregadas = new Set(movimientos.filter((m) => m.nominaSemana).map((m) => m.nominaSemana));
    sel.innerHTML = semanas.slice(0, 20).map((k) => `<option value="${k}">${escapeHtml(nomEtiquetaSemana(k))}${yaAgregadas.has(k) ? ' · ya agregada' : ''}</option>`).join('');
    sel.value = semanas.includes(pasada) ? pasada : semanas[0];
    $('mov-nom-fecha').value = today();
    $('mov-nom-panel').style.display = 'block';
    movNomResumen();
  }
  function movNomResumen() {
    const k = $('mov-nom-semana').value;
    const grupos = nomAgruparSemana(k);
    const total = grupos.reduce((t, g) => t + g.total, 0);
    const filas = grupos.map((g) => {
      const quienes = g.pagos.map((n) => `${escapeHtml(n.trabajador || '')} (${nomCuentaDias(n.dias)} d)`).join(', ');
      const pct = g.tipo === 'socio' ? g.bonoPct : 0;
      let nota = '';
      if (g.tipo === 'otro') {
        nota = `<div style="font-size:12px;color:var(--muted);margin-top:3px;">Gasto de nómina, sin % (no es socio en esta base)</div>`;
      } else if (g.tipo === 'socio') {
        nota = pct > 0
          ? `<div style="font-size:12px;color:var(--teal);margin-top:3px;">Gasto + ajuste a ${escapeHtml(g.nombre)} · su ${pct}%: ${nomFmt(g.total * pct / 100)} (de las taxas)</div>`
          : `<div style="font-size:12px;color:var(--ember);margin-top:3px;">${escapeHtml(g.nombre)} tiene 0% en Ajustes → Socios. Ponle 10% para que gane su porcentaje.</div>`;
      } else {
        nota = `<div style="font-size:12px;color:var(--muted);margin-top:3px;">Gasto de nómina, sin %</div>`;
      }
      return `<div style="display:flex;justify-content:space-between;gap:12px;padding:9px 0;border-bottom:1px solid var(--border-soft);">
        <div style="min-width:0;"><strong>${escapeHtml(g.nombre)}</strong>${g.tipo === 'socio' ? ' <span style="font-size:11px;color:var(--muted);">socio</span>' : ''}
          <div style="font-size:12.5px;color:var(--muted);">${quienes}</div>${nota}</div>
        <strong style="white-space:nowrap;">${nomFmt(g.total)}</strong></div>`;
    }).join('');
    $('mov-nom-resumen').innerHTML = grupos.length
      ? filas + `<div style="display:flex;justify-content:space-between;padding-top:10px;font-weight:700;font-size:14.5px;"><span>Total nómina (se cobra una vez)</span><span>${nomFmt(total)}</span></div>`
      : '<div class="gc-empty" style="display:block;">Esa semana no tiene pagos.</div>';
  }
  async function movNomAgregar() {
    const k = $('mov-nom-semana').value;
    const fecha = $('mov-nom-fecha').value || today();
    const grupos = nomAgruparSemana(k);
    if (!grupos.length) { toast('Esa semana no tiene pagos', 'error'); return; }
    const previos = movimientos.filter((m) => m.nominaSemana === k);
    if (previos.length) {
      const ok = await gcConfirm(`La nómina de ${nomEtiquetaSemana(k)} ya está en movimientos (${previos.length} movimiento(s)).\n\n¿Reemplazarla con la de ahora?`, { okText: 'Reemplazar' });
      if (!ok) return;
      movimientos = movimientos.filter((m) => m.nominaSemana !== k);
    }
    const semanaTxt = nomEtiquetaSemana(k);
    let base = Date.now();
    let nuevasCats = false;
    grupos.forEach((g) => {
      const detalle = g.pagos.map((n) => ({ trabajador: n.trabajador, dias: Array.isArray(n.dias) ? n.dias.slice().sort() : n.dias, sueldoDia: n.sueldoDia || 0, extraDesc: n.extraDesc || '', extraMonto: n.extraMonto || 0, monto: n.monto }));
      const quienes = g.pagos.map((n) => `${n.trabajador} ${nomCuentaDias(n.dias)}d`).join(', ');
      if (!catGastos.includes(g.nombre)) { catGastos.push(g.nombre); nuevasCats = true; }
      movimientos.push({ id: base++, fecha, tipo: 'gasto', cat: g.nombre, monto: g.total,
        desc: `Nómina ${semanaTxt}: ${quienes}`, deducible: false, nominaSemana: k, nominaDetalle: detalle });
      if (g.tipo === 'socio') {
        movimientos.push({ id: base++, fecha, tipo: 'ajuste', cat: 'Ajuste +', monto: g.total,
          desc: `Nómina ${semanaTxt} (${g.pagos.length} trabajador${g.pagos.length === 1 ? '' : 'es'}): ${quienes}`, deducible: false,
          ajusteDir: 'sumar', ajusteSocioId: g.socioId, ajusteSocioNombre: nombreDeAjuste(g.socioId) || g.nombre,
          nominaSemana: k, nominaDetalle: detalle });
      }
    });
    if (nuevasCats) { try { await saveCatGastos(); } catch (e) {} renderCatSelect(); try { renderCategorias(); } catch (e) {} }
    try { await saveMov(); } catch (e) { toast('No se pudo guardar la nómina en movimientos: ' + ((e && e.message) || e), 'error', 5000); return; }
    renderMovimientos();
    try { renderReparto(); } catch (e) {}
    try { actualizarStats(); } catch (e) {}
    try { refrescarSugerenciasDesc(); ghActualizarHero(); } catch (e) {}
    $('mov-nom-panel').style.display = 'none';
    const total = grupos.reduce((t, g) => t + g.total, 0);
    toast(`Nómina ${semanaTxt} agregada: ${nomFmt(total)}`, 'success', 3200);
  }
  $('mov-nom-abrir').addEventListener('click', () => {
    if ($('mov-nom-panel').style.display === 'block') { $('mov-nom-panel').style.display = 'none'; return; }
    movNomAbrir();
  });
  $('mov-nom-cerrar').addEventListener('click', () => { $('mov-nom-panel').style.display = 'none'; });
  $('mov-nom-semana').addEventListener('change', movNomResumen);
  $('mov-nom-agregar').addEventListener('click', movNomAgregar);
  // ===================== /NÓMINA: A QUIÉN SE LE PAGA =====================

// ---- 18-cheques.js ----
  // ===================== CHEQUES =====================
  // Imprime en cheques láser de hoja carta con el cheque arriba (8½" x 3½")
  // y dos talones abajo. Las posiciones están en pulgadas desde la esquina
  // de arriba a la izquierda de la hoja; el ajuste en mm mueve todo junto.
  // Registro de cheques/Zelle/cash: UNO SOLO para todas las bases de datos.
  // Las claves que empiezan con "__" no llevan el prefijo de la base y en la
  // nube solo el admin las puede leer o escribir.
  const CHQ_KEY = '__gh-cheques';
  const CHQ_CFG_KEY = '__gh-cheques-cfg';
  const CHQ_KEY_VIEJO = 'gh-cheques';         // antes: un registro por base
  const CHQ_CFG_KEY_VIEJO = 'gh-cheques-cfg';
  const CHQ_POS = {
    fecha:  { x: 5.95, y: 1.30 },
    monto:  { x: 7.30, y: 1.30 },
    letras: { x: 0.80, y: 1.50 },
    a:      { x: 1.00, y: 1.98 },
    memo:   { x: 0.80, y: 2.82 }
  };
  let chqLista = [];
  let chqCfg = { siguiente: 2000, offX: 0, offY: 0, talones: 'si' };
  let chqCargado = false;

  const CHQ_UNOS = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Eleven', 'Twelve',
    'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
  const CHQ_DECENAS = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];
  function chqMenosDeMil(n) {
    const p = [];
    if (n >= 100) { p.push(CHQ_UNOS[Math.floor(n / 100)] + ' Hundred'); n %= 100; }
    if (n >= 20) p.push(CHQ_DECENAS[Math.floor(n / 10)] + (n % 10 ? '-' + CHQ_UNOS[n % 10] : ''));
    else if (n > 0) p.push(CHQ_UNOS[n]);
    return p.join(' ');
  }
  // 1250.5 → "One Thousand Two Hundred Fifty and 50/100"
  function chqEnLetras(monto) {
    const centavos = Math.round((Number(monto) || 0) * 100);
    let d = Math.floor(centavos / 100);
    const c = centavos % 100;
    const p = [];
    if (d === 0) p.push('Zero');
    [[1e6, 'Million'], [1e3, 'Thousand']].forEach(([v, nom]) => {
      if (d >= v) { p.push(chqMenosDeMil(Math.floor(d / v)) + ' ' + nom); d %= v; }
    });
    if (d > 0) p.push(chqMenosDeMil(d));
    return p.join(' ') + ' and ' + String(c).padStart(2, '0') + '/100';
  }
  const chqDinero = (n) => (Number(n) || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  function chqFechaUS(iso) {
    const [y, m, d] = String(iso || '').split('-');
    return y && m && d ? `${m}/${d}/${y}` : '';
  }

  async function chqCargar() {
    // existe=false SOLO si de verdad no hay registro en la nube. Antes, si no
    // había señal al abrir, se creía que no existía y se copiaban encima los
    // cheques viejos de la base — se perdían cheques del registro compartido.
    let existe = true;
    try { const r = await window.storage.get(CHQ_KEY); chqLista = JSON.parse(r.value) || []; }
    catch (e) { chqLista = []; existe = !!(e && e.sinSenal); if (e && e.sinSenal) toast('No se pudo leer el registro de cheques (sin señal).', 'error', 4000); }
    try {
      const r = await window.storage.get(CHQ_CFG_KEY);
      const c = JSON.parse(r.value);
      if (c && typeof c === 'object') chqCfg = Object.assign(chqCfg, c);
    } catch (e) {}
    // Primera vez con el registro compartido: se traen los cheques que había en esta base
    if (!existe) {
      try {
        const r = await window.storage.get(CHQ_KEY_VIEJO);
        const viejos = JSON.parse(r.value);
        if (Array.isArray(viejos) && viejos.length) {
          const base = chqBaseActual();
          chqLista = viejos.map((c) => Object.assign({ base }, c));
          try { const rc = await window.storage.get(CHQ_CFG_KEY_VIEJO); const c = JSON.parse(rc.value); if (c && typeof c === 'object') chqCfg = Object.assign(chqCfg, c); } catch (e) {}
          try { await chqGuardarLista(); await chqGuardarCfg(); } catch (e) {}
        }
      } catch (e) {}
    }
    chqCargado = true;
  }
  // Nombre de la base de datos en la que se está trabajando (se guarda en cada pago)
  function chqBaseActual() {
    try { return chqNombreBase((typeof window.GH_GET_CUENTA === 'function' && window.GH_GET_CUENTA()) || 'principal'); } catch (e) { return ''; }
  }
  async function chqGuardarLista() { await window.storage.set(CHQ_KEY, JSON.stringify(chqLista)); }
  async function chqGuardarCfg() { await window.storage.set(CHQ_CFG_KEY, JSON.stringify(chqCfg)); }

  function chqSiguienteNumero() {
    const usados = chqLista.filter((c) => c.metodo !== 'zelle' && !c.importado).map((c) => Number(c.numero) || 0);
    return Math.max(Number(chqCfg.siguiente) || 1, usados.length ? Math.max(...usados) + 1 : 0);
  }

  // Semana de un pago de nómina (lunes de la semana del primer día trabajado)
  function chqSemanaDe(n) {
    const dd = Array.isArray(n.dias) ? n.dias.slice().sort() : [];
    const ref = dd[0] || (n.creadoEn || '').slice(0, 10);
    return ref ? nomWeekKey(ref) : '';
  }
  // Nómina de las OTRAS bases de datos (para hacer cheques con trabajadores que
  // se apuntaron en otra base). Se lee sin cambiar de base.
  let chqOtras = [];        // pagos de otras bases, con id "base|id" y su contexto
  let chqBasesInfo = [];    // [{ codigo, nombre }]
  // Ganancias de socio: lo que le toca a cada socio en un invoice, SIN contar
  // la nómina que se le pasó como ajuste (esa ya va por trabajador en el cheque).
  let chqGanancias = [];
  function chqAgregarGanancias(inv, base, baseNombre, estado) {
    if (!inv || !inv.key) return;
    let pagos = [];
    try { pagos = invPagosNormalizados(inv); } catch (e) { pagos = Array.isArray(inv.pagos) ? inv.pagos : []; }
    pagos.forEach((p) => {
      if (!p || p.esEmpresa || p.id === 'empresa' || !p.nombre) return;
      const nombre = String(p.nombre).trim();
      // Ganancia = lo que le toca al socio SIN ningún ajuste (los ajustes son el
      // sueldo de los trabajadores que ya van por separado en el cheque). Su %
      // (incluido el 10% de los trabajadores) sí cuenta como ganancia.
      let ajuste = Number(p.ajuste);
      if (!isFinite(ajuste) || p.ajuste == null) {
        ajuste = (inv.ajusteItems || []).filter((a) => a && (a.ajusteSocioId === p.id ||
          String(a.ajusteSocioNombre || '').trim().toLowerCase() === nombre.toLowerCase()))
          .reduce((t, a) => t + (a.ajusteDir === 'restar' ? -1 : 1) * (Number(a.monto) || 0), 0);
      }
      const r2 = (n) => Math.round(n * 100) / 100;
      const ganancia = r2((Number(p.total) || 0) - ajuste);
      if (!(ganancia > 0)) return;
      // Separado: su parte, su % sobre la parte (taxas de ganancia) y su % sobre
      // los sueldos que se le pasaron (taxas de payroll).
      const parte = Number(p.base);
      const bono = Number(p.bono) || 0;
      let pct = Number(p.bonoPct);
      if (!isFinite(pct) || p.bonoPct == null) pct = (parte + ajuste) > 0 ? (bono / (parte + ajuste)) * 100 : 0;
      let det = null;
      if (isFinite(parte) && p.base != null) {
        const taxPay = r2(ajuste > 0 ? ajuste * pct / 100 : 0);
        const taxGan = r2(ganancia - parte - taxPay);
        det = { parte: r2(parte), taxGan, taxPay, pct: r2(pct) };
      }
      const id = base + '|' + inv.key + '|' + nombre.toLowerCase() + '|' + estado;
      if (chqGanancias.some((g) => g.id === id)) return;
      chqGanancias.push({ id, base, baseNombre, semana: inv.key, label: inv.label || '', nombre, ganancia, det, estado });
    });
  }
  function chqCargarGananciasPropias() {
    const actual = (typeof window.GH_GET_CUENTA === 'function' && window.GH_GET_CUENTA()) || 'principal';
    const nombreBase = chqNombreBase(actual);
    chqGanancias = chqGanancias.filter((g) => g.base !== actual);
    (invoicesGuardados || []).forEach((inv) => chqAgregarGanancias(inv, actual, nombreBase, 'guardado'));
    try { calcularSemanas().forEach((sem) => chqAgregarGanancias(sem, actual, nombreBase, 'abierta')); } catch (e) {}
  }
  function chqNombreBase(codigo) {
    const b = (chqBasesInfo || []).find((x) => x.codigo === codigo);
    if (b && b.nombre) return b.nombre;
    try { const n = ajNombreDe(codigo); if (n) return n; } catch (e) {}
    return codigo === 'principal' ? 'Principal' : codigo;
  }
  async function chqCargarOtrasBases() {
    chqOtras = [];
    chqBasesInfo = [];
    chqGanancias = [];
    if (typeof window.GH_LEER_DE_CUENTA !== 'function' || typeof window.GH_GET_CUENTA !== 'function') return;
    let cuentas = [];
    try { cuentas = await ajCargarCuentas(); } catch (e) { cuentas = []; }
    const actual = window.GH_GET_CUENTA() || 'principal';
    cuentas = cuentas.filter((c) => !c.escondida || c.codigo === actual);
    chqBasesInfo = cuentas.map((c) => ({ codigo: c.codigo, nombre: c.nombre }));
    if (!chqBasesInfo.some((c) => c.codigo === actual)) chqBasesInfo.unshift({ codigo: actual, nombre: 'Esta base' });
    const leer = async (codigo, key) => { try { const v = await window.GH_LEER_DE_CUENTA(codigo, key); return v ? JSON.parse(v) : null; } catch (e) { return null; } };
    await Promise.all(cuentas.filter((c) => c.codigo !== actual).map(async (c) => {
      const [docs, emps, cfg, invs] = await Promise.all([leer(c.codigo, 'gh-nomina'), leer(c.codigo, 'empleados'), leer(c.codigo, 'kontaly-config'), leer(c.codigo, KEY_INVOICES)]);
      if (Array.isArray(invs)) invs.forEach((inv) => chqAgregarGanancias(inv, c.codigo, c.nombre, 'guardado'));
      if (!Array.isArray(docs) || !docs.length) return;
      const ctx = {
        empleados: Array.isArray(emps) ? emps : [],
        socios: (cfg && Array.isArray(cfg.socios) ? cfg.socios : []).filter((x) => x && x.nombre)
      };
      docs.forEach((n) => chqOtras.push(Object.assign({}, n, { id: c.codigo + '|' + n.id, _base: c.codigo, _baseNombre: c.nombre, _ctx: ctx })));
    }));
  }
  function chqFuente() {
    const actual = (typeof window.GH_GET_CUENTA === 'function' && window.GH_GET_CUENTA()) || 'principal';
    const propios = (nomDocs || []).map((n) => Object.assign({}, n, { _base: actual, _baseNombre: chqNombreBase(actual) }));
    const sel = $('chq-base').value || 'todas';
    const todos = propios.concat(chqOtras);
    return sel === 'todas' ? todos : todos.filter((n) => n._base === sel);
  }
  function chqLlenarBases() {
    const sel = $('chq-base');
    const previo = sel.value || 'todas';
    const actual = (typeof window.GH_GET_CUENTA === 'function' && window.GH_GET_CUENTA()) || 'principal';
    const lista = chqBasesInfo.length ? chqBasesInfo : [{ codigo: actual, nombre: 'Esta base' }];
    sel.innerHTML = '<option value="todas">Todas las bases de datos</option>' +
      lista.map((c) => `<option value="${escapeHtml(c.codigo)}">${escapeHtml(c.nombre)}${c.codigo === actual ? ' (esta)' : ''}</option>`).join('');
    sel.value = [...sel.options].some((o) => o.value === previo) ? previo : 'todas';
    $('chq-base-wrap').style.display = lista.length > 1 ? '' : 'none';
  }
  function chqLlenarSelectNomina() {
    const sel = $('chq-semana');
    const actual = sel.value;
    const semanas = {};
    chqFuente().forEach((n) => { const k = chqSemanaDe(n); if (k) (semanas[k] = semanas[k] || []).push(n); });
    const claves = Object.keys(semanas).sort().reverse().slice(0, 16);
    sel.innerHTML = '<option value="">— Escribir a mano —</option>' + claves.map((k) => {
      const r = nomWeekRango(k);
      const total = semanas[k].reduce((t, n) => t + (Number(n.monto) || 0), 0);
      return `<option value="${k}">Semana ${chqFechaUS(r.inicio)} – ${chqFechaUS(r.fin)} · ${semanas[k].length} pago(s) · ${nomFmt(total)}</option>`;
    }).join('');
    if (actual && claves.includes(actual)) sel.value = actual;
    chqRenderPagosSemana();
    // Sugerencias para "Páguese a": socios (ej. CRA HVAC), trabajadores y a quien ya se le hizo cheque
    const nombres = new Set();
    (cfgSocios || []).forEach((x) => x && x.nombre && nombres.add(x.nombre));
    (empleados || []).filter((e) => e.estado !== 'inactivo').forEach((e) => nombres.add(empNombreCompleto(e)));
    chqLista.forEach((c) => c.a && nombres.add(c.a));
    $('dl-chq-a').innerHTML = [...nombres].map((x) => `<option value="${escapeHtml(x)}">`).join('');
  }
  // Lista de la semana: SOLO quien cobra cheque (ej. CRA HVAC con sus trabajadores
  // adentro, Ariel con lo de él y su esposa). Los trabajadores ya no salen sueltos.
  // Los checkboxes .chq-pago (escondidos) siguen diciendo qué va en el cheque.
  function chqChequeDePago(id) {
    return chqLista.find((c) => !c.anulado && (c.metodo || 'cheque') === 'cheque' &&
      ((Array.isArray(c.nomIds) && c.nomIds.includes(id)) || c.nomId === id));
  }
  function chqRenderPagosSemana() {
    const k = $('chq-semana').value;
    const cont = $('chq-pagos-lista');
    const gruposAntes = new Set([...document.querySelectorAll('#chq-pagos-lista .chq-grupo-cb:checked')].map((cb) => cb.value));
    const fuente = chqFuente();
    const variasBases = new Set(fuente.map((n) => n._base)).size > 1;
    const grupos = k ? nomAgruparSemana(k, fuente) : [];
    const dTxt = (n) => { const d = nomCuentaDias(n.dias); return `${d} día${d === 1 ? '' : 's'}${variasBases && n._baseNombre ? ' · ' + escapeHtml(n._baseNombre) : ''}`; };
    $('chq-btn-toda-semana').style.display = 'none';
    cont.style.display = grupos.length ? 'block' : 'none';
    cont.innerHTML = grupos.map((g, i) => {
      const clave = String(g.nombre || '').trim().toLowerCase();
      const hechos = [...new Set(g.pagos.map((n) => chqChequeDePago(n.id)).filter(Boolean).map((c) => '#' + c.numero))];
      const soloEl = g.pagos.length === 1 && String(g.pagos[0].trabajador || '').trim().toLowerCase() === clave;
      const detalle = soloEl ? dTxt(g.pagos[0]) : g.pagos.map((n) => `${escapeHtml(n.trabajador || '')} (${dTxt(n)})`).join(', ');
      return `
      <label style="display:flex;align-items:flex-start;gap:10px;padding:9px 0;cursor:pointer;font-size:13.5px;text-transform:none;letter-spacing:0;font-weight:400;color:var(--ink);margin:0;${i ? 'border-top:1px solid var(--border-soft);' : ''}${hechos.length ? 'opacity:.6;' : ''}">
        <input type="checkbox" class="chq-grupo-cb" value="${escapeHtml(clave)}" data-i="${i}" style="width:18px;height:18px;margin-top:1px;flex-shrink:0;">
        <span style="flex:1;min-width:0;">
          <strong>${escapeHtml(g.nombre)}</strong>${hechos.length ? ` <span style="font-size:11.5px;color:var(--muted);">· ya tiene cheque ${hechos.join(', ')}</span>` : ''}
          <span style="display:block;color:var(--muted);font-size:12px;margin-top:2px;">${detalle}</span>
        </span>
        <strong>${nomFmt(g.total)}</strong>
        ${g.pagos.map((n) => `<input type="checkbox" class="chq-pago" value="${escapeHtml(n.id)}" hidden>`).join('')}
      </label>`;
    }).join('');
    cont.querySelectorAll('.chq-grupo-cb').forEach((cb) => {
      const marcar = () => cb.closest('label').querySelectorAll('.chq-pago').forEach((p) => { p.checked = cb.checked; });
      if (gruposAntes.has(cb.value)) { cb.checked = true; marcar(); }
      cb.addEventListener('change', () => {
        marcar();
        const sel = [...cont.querySelectorAll('.chq-grupo-cb:checked')].map((x) => grupos[Number(x.dataset.i)]);
        const a = $('chq-a');
        if (sel.length === 1) a.value = sel[0].nombre;
        else if (!sel.length && grupos.some((g) => g.nombre === a.value.trim())) a.value = '';
        chqRenderGanancias();
        chqRecalcularMonto();
      });
    });
  }
  function chqRenderGanancias() {
    const quien = $('chq-a').value.trim().toLowerCase();
    const sel = $('chq-base').value || 'todas';
    const marcadas = new Set([...document.querySelectorAll('#chq-gan-lista .chq-gan:checked')].map((cb) => cb.value));
    const lista = quien ? chqGanancias.filter((g) => g.nombre.toLowerCase() === quien && (sel === 'todas' || g.base === sel))
      .sort((a, b) => b.semana.localeCompare(a.semana)).slice(0, 12) : [];
    $('chq-gan-wrap').style.display = lista.length ? 'block' : 'none';
    $('chq-gan-lista').innerHTML = lista.map((g) => `
      <label style="display:flex;align-items:center;gap:10px;padding:7px 0;cursor:pointer;font-size:13.5px;">
        <input type="checkbox" class="chq-gan" value="${escapeHtml(g.id)}" ${marcadas.has(g.id) ? 'checked' : ''} style="width:18px;height:18px;">
        <span style="flex:1;">${escapeHtml(g.baseNombre)} · semana ${escapeHtml(nomEtiquetaSemana(g.semana))}${g.estado === 'abierta' ? ' <span style="font-size:11px;color:var(--muted);">(sin guardar)</span>' : ''}</span>
        <strong>${nomFmt(g.ganancia)}</strong>
      </label>
      ${g.det ? `<div style="font-size:12px;color:var(--muted);padding:0 0 8px 28px;margin-top:-4px;">Ganancia ${nomFmt(g.det.parte)} · Taxas de ganancia ${nomFmt(g.det.taxGan)} · Taxas de payroll ${nomFmt(g.det.taxPay)}</div>` : ''}`).join('');
    $('chq-gan-lista').querySelectorAll('.chq-gan').forEach((cb) => cb.addEventListener('change', chqRecalcularMonto));
  }
  function chqGananciasMarcadas() {
    const ids = new Set([...document.querySelectorAll('#chq-gan-lista .chq-gan:checked')].map((cb) => cb.value));
    return chqGanancias.filter((g) => ids.has(g.id));
  }
  function chqRecalcularMonto() {
    const t = chqPagosMarcados().reduce((s, n) => s + (Number(n.monto) || 0), 0) +
      chqGananciasMarcadas().reduce((s, g) => s + g.ganancia, 0);
    if (t > 0) $('chq-monto').value = (Math.round(t * 100) / 100).toFixed(2);
    if (!$('chq-memo').value.trim()) $('chq-memo').value = 'WORK';
    chqActualizarLetras();
  }
  function chqPagosMarcados() {
    return [...document.querySelectorAll('#chq-pagos-lista .chq-pago:checked')]
      .map((cb) => chqFuente().find((n) => n.id === cb.value)).filter(Boolean);
  }
  // Suma lo marcado. Con un solo pago pone al trabajador como "Páguese a";
  // con varios deja el nombre para que escribas a quién (ej. CRA HVAC).
  function chqAplicarPagos() {
    const pagos = chqPagosMarcados();
    if (!pagos.length) { chqRecalcularMonto(); return; }
    const a = $('chq-a');
    const nombresPagos = chqFuente().map((n) => n.trabajador);
    if (pagos.length === 1) { if (!a.value.trim() || nombresPagos.includes(a.value.trim())) a.value = pagos[0].trabajador || ''; }
    else if (nombresPagos.includes(a.value.trim())) { a.value = ''; a.focus(); }
    chqRenderGanancias();
    chqRecalcularMonto();
  }

  function chqActualizarLetras() {
    const m = parseFloat($('chq-monto').value);
    $('chq-letras').textContent = m > 0 ? chqEnLetras(m) : '—';
    // Vista previa del cheque
    $('chq-pv-co').textContent = cfgFacturaNombre || 'GUZMAN HVAC';
    $('chq-pv-num').textContent = $('chq-numero').value || '—';
    $('chq-pv-fecha').textContent = $('chq-fecha').value ? chqFechaUS($('chq-fecha').value) : '—';
    $('chq-pv-a').textContent = $('chq-a').value.trim();
    $('chq-pv-monto').textContent = m > 0 ? m.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '0.00';
    $('chq-pv-memo').textContent = $('chq-memo').value.trim();
  }
  ['chq-a', 'chq-fecha', 'chq-memo', 'chq-numero'].forEach((id) => { $(id).addEventListener('input', () => chqActualizarLetras()); $(id).addEventListener('change', () => chqActualizarLetras()); });

  async function chqRender() {
    if (!chqCargado) await chqCargar();
    chqLlenarBases();
    chqCargarGananciasPropias();
    chqLlenarSelectNomina();
    chqRenderGanancias();
    chqCargarOtrasBases().then(() => { chqLlenarBases(); chqCargarGananciasPropias(); chqLlenarSelectNomina(); chqRenderGanancias(); }).catch(() => {});
    if (!$('chq-fecha').value) $('chq-fecha').value = nomToday();
    if (!$('chq-numero').value) $('chq-numero').value = chqSiguienteNumero();
    $('chq-off-x').value = chqCfg.offX || 0;
    $('chq-off-y').value = chqCfg.offY || 0;
    $('chq-talones').value = chqCfg.talones || 'si';
    chqActualizarLetras();
    chqRenderLista();
  }

  // ---- Diseño compartido de Payroll: filas, lista por mes, totales por persona ----
  const PAY_MESES_LARGOS = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
  const PAY_SVG = {
    imp: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9V3h12v6"/><rect x="3" y="9" width="18" height="8" rx="2"/><path d="M7 14h10v7H7z"/></svg>',
    ed: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 20h4L19 9l-4-4L4 16z"/></svg>',
    no: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="9"/><path d="m6 6 12 12"/></svg>',
    si: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="m5 12 5 5 9-10"/></svg>',
    del: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13"/></svg>'
  };
  const payVariasBases = () => new Set(chqLista.map((c) => c.base).filter(Boolean)).size > 1;
  function payFechaCorta(iso) {
    const m = Number(String(iso || '').slice(5, 7)) - 1, d = Number(String(iso || '').slice(8, 10));
    return m >= 0 && d ? `${d} ${MESES_CORTOS[m]}` : '';
  }
  function payIcono(c) {
    if (c.metodo === 'zelle') return '<div class="pay-ico zel">Zelle</div>';
    if (c.metodo === 'cash') return '<div class="pay-ico cash">Cash</div>';
    return `<div class="pay-ico"><small>#</small>${escapeHtml(String(c.numero || '—'))}</div>`;
  }
  function payIniciales(nombre) {
    const p = String(nombre || '').trim().split(/\s+/).filter(Boolean);
    return escapeHtml(((p[0] || '?')[0] + (p.length > 1 ? p[p.length - 1][0] : '')).toUpperCase());
  }
  // Fila de un pago (cheque, Zelle o cash). acts = botones que salen al tocarla.
  function payFilaHTML(c, acts) {
    const nom = (c.a || '').trim();
    const meta = [payFechaCorta(c.fecha), c.memo, c.conf, payVariasBases() ? c.base : ''].filter(Boolean).map(escapeHtml).join(' · ');
    const tags = (c.anulado ? '<span class="pay-tag rojo">Anulado</span>' : '') +
      (c.importado ? '<span class="pay-tag">del banco</span>' : (c.manual && (c.metodo || 'cheque') === 'cheque' ? '<span class="pay-tag">a mano</span>' : ''));
    return `<div class="pay-row${c.anulado ? ' anulado' : ''}" data-id="${escapeHtml(c.id)}">
      <button type="button" class="pay-row-main">${payIcono(c)}
        <span class="pay-row-txt"><span class="pay-row-nom${nom ? '' : ' sin'}">${nom ? escapeHtml(nom) : 'Sin nombre'}${tags}</span><span class="pay-row-meta">${meta}</span></span>
        <span class="pay-row-amt">${nomFmt(c.monto)}</span><span class="pay-chev"></span>
      </button>
      <div class="pay-row-acts">${acts}</div>
    </div>`;
  }
  // Agrupa por mes (la lista ya viene ordenada, más nuevo primero)
  function payListaPorMes(lista, filaFn) {
    const meses = [];
    lista.forEach((c) => {
      const k = String(c.fecha || '').slice(0, 7) || 'sin';
      let g = meses[meses.length - 1];
      if (!g || g.k !== k) { g = { k, items: [] }; meses.push(g); }
      g.items.push(c);
    });
    return meses.map((g) => {
      const m = Number(g.k.slice(5, 7)) - 1;
      const tit = g.k === 'sin' ? 'Sin fecha' : `${PAY_MESES_LARGOS[m] || ''} ${g.k.slice(0, 4)}`;
      const tot = g.items.filter((c) => !c.anulado).reduce((t, c) => t + (Number(c.monto) || 0), 0);
      return `<div class="pay-mes-hd"><span>${tit}</span><b><small>${g.items.length}</small>${nomFmt(tot)}</b></div>
        <div class="pay-grupo">${g.items.map(filaFn).join('')}</div>`;
    }).join('');
  }
  // Tocar una fila abre sus botones (y cierra las demás)
  function payActivarFilas(cont) {
    if (cont.dataset.filas) return;
    cont.dataset.filas = '1';
    cont.addEventListener('click', (e) => {
      const main = e.target.closest('.pay-row-main');
      if (!main || !cont.contains(main) || main.classList.contains('r99-f')) return;
      const row = main.closest('.pay-row');
      const abrir = !row.classList.contains('open');
      cont.querySelectorAll('.pay-row.open').forEach((r) => r.classList.remove('open'));
      if (abrir) row.classList.add('open');
    });
  }
  // Totales por persona (plegable con barritas)
  const payPersonasAbiertas = {};
  function payPersonasHTML(id, grupos, titulo, extra, borrar) {
    if (!grupos.length) return '';
    const max = Math.max(1, ...grupos.map((g) => g.total));
    const tot = grupos.reduce((t, g) => t + g.total, 0);
    return `<details class="pay-personas" data-pp="${id}"${payPersonasAbiertas[id] ? ' open' : ''}>
      <summary>${titulo}<span class="r">${grupos.length} persona${grupos.length === 1 ? '' : 's'} · ${nomFmt(tot)}</span></summary>
      <div class="pay-personas-b">${grupos.map((g) => `<div class="pay-per" data-n="${escapeHtml(g.nombre)}">
        <div class="pay-per-top"><span>${escapeHtml(g.nombre)} <small>· ${g.n} pago${g.n === 1 ? '' : 's'}${extra ? extra(g) : ''}</small></span><span class="pay-per-der"><strong>${nomFmt(g.total)}</strong>${borrar ? `<button type="button" class="pay-per-del" data-n="${escapeHtml(g.nombre)}" title="Borrar todos los pagos de ${escapeHtml(g.nombre)}" aria-label="Borrar todos los pagos de ${escapeHtml(g.nombre)}">${PAY_SVG.del}</button>` : ''}</span></div>
        <div class="pay-bar"><i style="width:${Math.max(2, Math.round(g.total / max * 100))}%"></i></div></div>`).join('')}</div>
    </details>`;
  }
  function payPersonasRecordar(cont) {
    const d = cont.querySelector('.pay-personas');
    if (d) d.addEventListener('toggle', () => { payPersonasAbiertas[d.dataset.pp] = d.open; });
  }

  // ---- Registro de cheques: buscar, total por persona, borrar, editar, agregar a mano ----
  let chqEditandoId = null;
  function chqRenderLista() {
    const tbody = $('chq-tbody');
    // Años que hay en el registro (y el actual)
    const anios = [...new Set(chqLista.map((c) => String(c.fecha || '').slice(0, 4)).filter(Boolean).concat([String(new Date().getFullYear())]))].sort().reverse();
    const selA = $('chq-anio'), anioPrev = selA.value || String(new Date().getFullYear());
    selA.innerHTML = '<option value="">Todos los años</option>' + anios.map((a) => `<option value="${a}">${a}</option>`).join('');
    selA.value = anios.includes(anioPrev) || anioPrev === '' ? anioPrev : '';
    const q = $('chq-buscar').value.trim().toLowerCase();
    const anio = selA.value, ver = $('chq-ver').value, tipo = $('chq-tipo').value;
    const esZelle = (c) => (c.metodo || 'cheque') !== 'cheque';
    const lista = chqLista.filter((c) => {
      if (anio && String(c.fecha || '').slice(0, 4) !== anio) return false;
      if (tipo === 'zelle' && !esZelle(c)) return false;
      if (tipo === 'cheque' && esZelle(c)) return false;
      if (ver === 'vigentes' && c.anulado) return false;
      if (ver === 'anulados' && !c.anulado) return false;
      if ($('chq-sin-nombre').checked && (c.a || '').trim()) return false;
      if (!q) return true;
      return String(c.numero || '').includes(q) || (c.a || '').toLowerCase().includes(q) || (c.memo || '').toLowerCase().includes(q) ||
        (c.conf || '').toLowerCase().includes(q) || (c.base || '').toLowerCase().includes(q) || (esZelle(c) && 'zelle'.includes(q));
    }).sort((a, b) => (b.fecha || '').localeCompare(a.fecha || '') || (Number(b.numero) || 0) - (Number(a.numero) || 0));

    // Total por persona (sin anulados)
    const porPersona = new Map();
    lista.filter((c) => !c.anulado).forEach((c) => {
      const k = (c.a || '').replace(/\s+/g, ' ').trim().toLowerCase();
      if (!porPersona.has(k)) porPersona.set(k, { nombre: (c.a || '').replace(/\s+/g, ' ').trim() || 'Sin nombre', n: 0, total: 0 });
      const g = porPersona.get(k); g.n++; g.total += Number(c.monto) || 0;
    });
    const grupos = [...porPersona.values()].sort((a, b) => b.total - a.total);
    const granTotal = grupos.reduce((t, g) => t + g.total, 0);
    const nAnul = lista.filter((c) => c.anulado).length;
    $('chq-sub').textContent = lista.length
      ? `${lista.length - nAnul} cheque${lista.length - nAnul === 1 ? '' : 's'}${anio ? ' en ' + anio : ''} · ${nomFmt(granTotal)}${nAnul ? ` · ${nAnul} anulado${nAnul === 1 ? '' : 's'}` : ''}`
      : '';
    $('chq-resumen').innerHTML = payPersonasHTML('chq', grupos, 'Total por persona');
    payPersonasRecordar($('chq-resumen'));
    $('chq-resumen').querySelectorAll('.pay-per').forEach((d) => d.addEventListener('click', () => {
      if (d.dataset.n === 'Sin nombre') { $('chq-buscar').value = ''; $('chq-sin-nombre').checked = true; } else $('chq-buscar').value = d.dataset.n;
      chqRenderLista();
    }));
    document.querySelectorAll('[data-chq-ver]').forEach((b) => b.classList.toggle('on', b.dataset.chqVer === ver));

    $('chq-empty').style.display = lista.length ? 'none' : 'block';
    $('chq-empty').textContent = chqLista.length ? 'No hay cheques con esa búsqueda.' : 'Todavía no hay cheques.';
    $('chq-tbl').style.display = lista.length ? 'block' : 'none';
    tbody.innerHTML = payListaPorMes(lista, (c) => payFilaHTML(c, `
      ${esZelle(c) ? '' : `<button type="button" class="pay-act chq-reimp" data-id="${escapeHtml(c.id)}">${PAY_SVG.imp} Reimprimir</button>`}
      <button type="button" class="pay-act chq-editar" data-id="${escapeHtml(c.id)}">${PAY_SVG.ed} Editar</button>
      ${c.anulado ? `<button type="button" class="pay-act chq-reactivar" data-id="${escapeHtml(c.id)}">${PAY_SVG.si} Quitar anulado</button>`
                  : `<button type="button" class="pay-act chq-anular" data-id="${escapeHtml(c.id)}">${PAY_SVG.no} Anular</button>`}
      <button type="button" class="pay-act peligro chq-borrar" data-id="${escapeHtml(c.id)}">${PAY_SVG.del} Borrar</button>`));
    payActivarFilas(tbody);
    const buscar = (id) => chqLista.find((x) => x.id === id);
    tbody.querySelectorAll('.chq-reimp').forEach((b) => b.addEventListener('click', () => {
      const c = buscar(b.dataset.id);
      if (c) ghImprimirEnVentana('', `Cheque ${c.numero}`, chqDocumento(c, false));
    }));
    tbody.querySelectorAll('.chq-editar').forEach((b) => b.addEventListener('click', () => { const c = buscar(b.dataset.id); if (c) chqAbrirManual(c); }));
    tbody.querySelectorAll('.chq-anular, .chq-reactivar').forEach((b) => b.addEventListener('click', async () => {
      const c = buscar(b.dataset.id); if (!c) return;
      c.anulado = b.classList.contains('chq-anular');
      try { await chqGuardarLista(); toast(c.anulado ? `Cheque #${c.numero} anulado` : `Cheque #${c.numero} activo otra vez`); } catch (e) { toast('No se pudo guardar', 'error'); }
      chqRenderLista();
    }));
    tbody.querySelectorAll('.chq-borrar').forEach((b) => b.addEventListener('click', async () => {
      const c = buscar(b.dataset.id); if (!c) return;
      const nombreC = c.metodo === 'zelle' ? 'el Zelle' : `el cheque #${c.numero}`;
      if (!await gcConfirm(`¿Borrar ${nombreC} de ${c.a || 'sin nombre'} (${nomFmt(c.monto)})?\n\nSe quita del registro para siempre.`, { okText: 'Borrar', danger: true })) return;
      chqLista = chqLista.filter((x) => x.id !== c.id);
      // Si era el último número usado, ese número se puede volver a usar
      const num = Number(c.numero) || 0;
      if (c.metodo !== 'zelle' && !c.importado && num && !chqLista.some((x) => (Number(x.numero) || 0) >= num) && (Number(chqCfg.siguiente) || 0) > num) chqCfg.siguiente = num;
      try { await chqGuardarLista(); await chqGuardarCfg(); toast(c.metodo === 'zelle' ? 'Zelle borrado' : `Cheque #${c.numero} borrado`); } catch (e) { toast('No se pudo borrar', 'error'); }
      $('chq-numero').value = chqSiguienteNumero();
      chqRenderLista();
    }));
  }
  // Agregar a mano (cheques que ya se escribieron este año) o editar uno
  function chqAbrirManual(c) {
    chqEditandoId = c ? c.id : null;
    $('chq-manual-titulo').textContent = c ? (c.metodo === 'zelle' ? 'Editar Zelle' : `Editar cheque #${c.numero}`) : 'Agregar cheque a mano (no se imprime)';
    $('chq-m-tipo').value = c && c.metodo === 'zelle' ? 'zelle' : 'cheque';
    chqTipoManual();
    $('chq-m-num').value = c ? (c.metodo === 'zelle' ? (c.conf || '') : c.numero) : '';
    $('chq-m-fecha').value = c ? (c.fecha || '') : nomToday();
    $('chq-m-monto').value = c ? (Number(c.monto) || 0).toFixed(2) : '';
    $('chq-m-a').value = c ? (c.a || '') : '';
    $('chq-m-memo').value = c ? (c.memo || '') : 'WORK';
    $('chq-manual').style.display = 'block';
    (c ? (c.a ? $('chq-m-monto') : $('chq-m-a')) : $('chq-m-num')).focus();
  }
  function chqTipoManual() {
    const z = $('chq-m-tipo').value === 'zelle';
    $('chq-m-num-lbl').textContent = z ? 'Confirmación (opcional)' : 'Número';
  }
  async function chqGuardarManual() {
    const esZ = $('chq-m-tipo').value === 'zelle';
    const numero = esZ ? null : parseInt($('chq-m-num').value, 10);
    const monto = Math.round((parseFloat($('chq-m-monto').value) || 0) * 100) / 100;
    const a = $('chq-m-a').value.replace(/\s+/g, ' ').trim();
    if (!esZ && !numero) { toast('Escribe el número del cheque', 'error'); $('chq-m-num').focus(); return; }
    if (!a) { toast('Escribe a quién se le pagó', 'error'); $('chq-m-a').focus(); return; }
    if (!(monto > 0)) { toast('Escribe la cantidad', 'error'); $('chq-m-monto').focus(); return; }
    const repetido = esZ ? null : chqLista.find((x) => x.metodo !== 'zelle' && Number(x.numero) === numero && x.id !== chqEditandoId && !x.anulado);
    if (repetido && !await gcConfirm(`Ya hay un cheque #${numero} (${repetido.a}). ¿Guardarlo de todos modos?`, { okText: 'Guardar' })) return;
    const datos = { numero, metodo: esZ ? 'zelle' : 'cheque', conf: esZ ? $('chq-m-num').value.trim() : '', fecha: $('chq-m-fecha').value || nomToday(), a, monto, memo: $('chq-m-memo').value.trim() };
    if (chqEditandoId) {
      const c = chqLista.find((x) => x.id === chqEditandoId);
      if (c) Object.assign(c, datos);
    } else {
      chqLista.push(Object.assign({ id: Date.now().toString() + '-' + Math.random().toString(36).slice(2, 7), manual: true, creadoEn: new Date().toISOString(), base: chqBaseActual() }, datos));
    }
    const quien = esZ ? 'Zelle' : `Cheque #${numero}`;
    try { await chqGuardarLista(); toast(chqEditandoId ? `${quien} actualizado` : `${quien} agregado`); } catch (e) { toast('No se pudo guardar', 'error'); return; }
    const editado = !!chqEditandoId;
    chqEditandoId = null;
    if (editado) { $('chq-manual').style.display = 'none'; }
    else { $('chq-m-num').value = esZ ? '' : numero + 1; $('chq-m-monto').value = ''; $('chq-m-a').value = ''; $('chq-m-a').focus(); }
    $('chq-numero').value = chqSiguienteNumero();
    chqRenderLista();
  }

  function chqDatosFormulario() {
    return {
      a: $('chq-a').value.trim(),
      monto: Math.round((parseFloat($('chq-monto').value) || 0) * 100) / 100,
      fecha: $('chq-fecha').value || nomToday(),
      memo: $('chq-memo').value.trim(),
      numero: parseInt($('chq-numero').value, 10) || chqSiguienteNumero(),
      nomIds: chqPagosMarcados().map((n) => n.id),
      pagosSnap: chqPagosMarcados().map((n) => ({ id: n.id, trabajador: n.trabajador, dias: n.dias, sueldoDia: n.sueldoDia || 0, extraDesc: n.extraDesc || '', extraMonto: n.extraMonto || 0, monto: n.monto, base: n._baseNombre || '' })),
      ganancias: chqGananciasMarcadas().map((g) => ({ base: g.baseNombre, semana: g.semana, ganancia: g.ganancia, det: g.det || null }))
    };
  }

  // Talón: comprobante con el detalle del pago (se imprime 2 veces).
  // "2026-10-05" → "Monday, October 5, 2026"
  function chqDiaEnIngles(iso) {
    const d = new Date(String(iso) + 'T00:00:00');
    if (isNaN(d)) return String(iso || '');
    return d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
  }

  // Talón (stub): comprobante en inglés con los días trabajados (se imprime 2 veces).
  // Si el cheque cubre varios trabajadores (ej. a CRA HVAC), sale cada uno con sus días.
  function chqPagosDeCheque(c) {
    if (Array.isArray(c.pagosSnap) && c.pagosSnap.length) return c.pagosSnap;
    const ids = Array.isArray(c.nomIds) ? c.nomIds : (c.nomId ? [c.nomId] : []);
    return ids.map((id) => (nomDocs || []).find((x) => x.id === id)).filter(Boolean);
  }
  function chqSemanaIngles(key) {
    const r = nomWeekRango(key);
    const f = (iso) => new Date(iso + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    return `${f(r.inicio)} – ${f(r.fin)}`;
  }
  function chqTalonHTML(c, top, titulo) {
    const pagos = chqPagosDeCheque(c);
    const gan = Array.isArray(c.ganancias) ? c.ganancias : [];
    const baseDe = (n) => n.base || n._baseNombre || '';
    let detalle = '';
    if (pagos.length === 1 && !gan.length) {
      const n = pagos[0];
      const dias = (Array.isArray(n.dias) ? n.dias.slice() : []).sort();
      const cuantos = nomCuentaDias(n.dias); // pagos viejos guardaban solo el número de días
      const lineas = dias.map((d) => `<tr><td class="dia">${escapeHtml(chqDiaEnIngles(d))}</td><td class="r"></td></tr>`);
      const filas = [`<tr><td><strong>Days worked: ${cuantos}</strong>${baseDe(n) ? ` <span class="src">· ${escapeHtml(baseDe(n))}</span>` : ''}</td><td class="r"></td></tr>`, ...lineas];
      if (Number(n.sueldoDia) && cuantos) filas.push(`<tr><td>Daily rate: ${nomFmt(n.sueldoDia)} × ${cuantos}</td><td class="r">${nomFmt(Number(n.sueldoDia) * cuantos)}</td></tr>`);
      if (Number(n.extraMonto)) filas.push(`<tr><td>Extra${n.extraDesc ? ': ' + escapeHtml(n.extraDesc) : ''}</td><td class="r">${nomFmt(n.extraMonto)}</td></tr>`);
      detalle = `<table class="t-det">${filas.join('')}</table>`;
    } else if (pagos.length || gan.length) {
      const filas = pagos.map((n) => {
        const dias = (Array.isArray(n.dias) ? n.dias.slice() : []).sort();
        const cuantos = nomCuentaDias(n.dias);
        const diasTxt = dias.map((d) => {
          const f = new Date(d + 'T00:00:00');
          return isNaN(f) ? d : f.toLocaleDateString('en-US', { weekday: 'long', month: 'numeric', day: 'numeric' });
        }).join(', ');
        const extra = Number(n.extraMonto) ? ` · Extra${n.extraDesc ? ' (' + escapeHtml(n.extraDesc) + ')' : ''}: ${nomFmt(n.extraMonto)}` : '';
        return `<tr><td><strong>${escapeHtml(n.trabajador || '')}</strong> — ${cuantos} day${cuantos === 1 ? '' : 's'}${Number(n.sueldoDia) ? ' × ' + nomFmt(n.sueldoDia) : ''}${extra}${baseDe(n) ? ` <span class="src">· ${escapeHtml(baseDe(n))}</span>` : ''}
          ${diasTxt ? `<div class="dias">${escapeHtml(diasTxt)}</div>` : ''}</td><td class="r">${nomFmt(n.monto)}</td></tr>`;
      });
      const filasGan = gan.map((g) => {
        const enc = `${escapeHtml(g.base || '')} · week ${escapeHtml(chqSemanaIngles(g.semana))}`;
        if (!g.det) return `<tr><td><strong>Profit share</strong> — ${enc}</td><td class="r">${nomFmt(g.ganancia)}</td></tr>`;
        const pct = g.det.pct ? ` (${Number(g.det.pct).toFixed(g.det.pct % 1 ? 2 : 0)}%)` : '';
        return `<tr><td><strong>${enc}</strong>
            <div class="dias">Profit ${nomFmt(g.det.parte)} · Profit tax${pct} ${nomFmt(g.det.taxGan)} · Payroll tax${pct} ${nomFmt(g.det.taxPay)}</div></td>
          <td class="r">${nomFmt(g.ganancia)}</td></tr>`;
      });
      const tit = pagos.length ? `<tr><td><strong>Payroll — ${pagos.length} worker${pagos.length === 1 ? '' : 's'}</strong></td><td class="r"></td></tr>` : '';
      const titGan = gan.length ? `<tr><td><strong>Partnership profit (after expenses)</strong></td><td class="r"></td></tr>` : '';
      detalle = `<table class="t-det multi">${tit}${filas.join('')}${titGan}${filasGan.join('')}</table>`;
    }
    return `<div class="talon" style="top:${top}in;">
      <div class="t-head"><span>${escapeHtml(cfgFacturaNombre || 'GUZMAN HVAC')}</span><span>${titulo} · Check #${escapeHtml(String(c.numero))}</span></div>
      <table class="t-main">
        <tr><td class="k">Date</td><td>${escapeHtml(chqFechaUS(c.fecha))}</td></tr>
        <tr><td class="k">Paid to</td><td>${escapeHtml(c.a)}</td></tr>
        ${c.memo ? `<tr><td class="k">Memo</td><td>${escapeHtml(c.memo)}</td></tr>` : ''}
      </table>
      ${detalle}
      <div class="t-total">Total: $${chqDinero(c.monto)}</div>
    </div>`;
  }

  // Documento completo de una hoja carta. prueba=true dibuja el contorno del
  // cheque y de los talones para comparar contra la luz en papel blanco.
  function chqDocumento(c, prueba) {
    const dx = (Number(chqCfg.offX) || 0) / 25.4;
    const dy = (Number(chqCfg.offY) || 0) / 25.4;
    const pos = (k) => `left:${(CHQ_POS[k].x + dx).toFixed(3)}in;top:${(CHQ_POS[k].y + dy).toFixed(3)}in;`;
    const letras = chqEnLetras(c.monto);
    const relleno = '*'.repeat(Math.max(3, 78 - letras.length));
    const talones = chqCfg.talones !== 'no';
    const guia = prueba ? `
      <div class="guia" style="top:0;height:3.5in;"><span>Check 8½" x 3½" — TEST PRINT, NOT A CHECK</span></div>
      <div class="guia" style="top:3.5in;height:3.75in;"><span>Stub 1</span></div>
      <div class="guia" style="top:7.25in;height:3.75in;"><span>Stub 2</span></div>
      <div class="lbl" style="left:${(CHQ_POS.fecha.x - 0.05).toFixed(2)}in;top:${(CHQ_POS.fecha.y - 0.2).toFixed(2)}in;">DATE</div>
      <div class="lbl" style="left:${(CHQ_POS.monto.x - 0.05).toFixed(2)}in;top:${(CHQ_POS.monto.y - 0.2).toFixed(2)}in;">AMOUNT</div>
      <div class="lbl" style="left:0.3in;top:${(CHQ_POS.letras.y).toFixed(2)}in;">PAY</div>
      <div class="lbl" style="left:0.3in;top:${(CHQ_POS.a.y - 0.2).toFixed(2)}in;">TO THE ORDER OF</div>` : '';
    return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Check ${escapeHtml(String(c.numero))}</title>
<style>
  @page { size: letter; margin: 0; }
  html, body { margin: 0; padding: 0; background: #fff; }
  .pg { position: relative; width: 8.5in; height: 11in; overflow: hidden; color: #000; font-family: Arial, Helvetica, sans-serif; }
  .f { position: absolute; white-space: nowrap; font-size: 11pt; font-weight: bold; }
  .f.letras { width: 6.3in; overflow: hidden; }
  .f.memo { font-size: 9.5pt; font-weight: normal; }
  .guia { position: absolute; left: 0.1in; width: 8.3in; box-sizing: border-box; border: 1px dashed #777; }
  .guia span { position: absolute; left: 6px; bottom: 4px; font-size: 8pt; color: #777; }
  .lbl { position: absolute; font-size: 7pt; color: #888; }
  /* Talón: todo en "em", así se achica junto cuando no cabe (ver script al final) */
  .talon { position: absolute; left: 0.5in; width: 7.5in; height: 3.15in; overflow: hidden; font-size: 10pt; }
  .t-head { display: flex; justify-content: space-between; font-weight: bold; border-bottom: 1.5px solid #000; padding-bottom: .35em; margin-bottom: .5em; }
  .t-main, .t-det { border-collapse: collapse; width: 100%; }
  .t-main td, .t-det td { padding: .15em 0; vertical-align: top; }
  .t-main td.k { width: 1.1in; color: #444; }
  .t-det { margin-top: .5em; border-top: 1px solid #bbb; }
  .t-det td.r { text-align: right; white-space: nowrap; padding-left: 1em; }
  .t-det td.dia { padding-left: 1.4em; }
  .t-det.multi td { padding: .25em 0; border-bottom: 1px solid #e2e2e2; font-size: .95em; }
  .t-det .dias { font-size: .88em; color: #333; padding-left: 1.2em; margin-top: .1em; }
  .t-det .src { font-size: .88em; color: #555; font-weight: normal; }
  .t-total { margin-top: .6em; font-weight: bold; font-size: 1.2em; text-align: right; }
</style></head><body><div class="pg">
  ${guia}
  <div class="f" style="${pos('fecha')}">${escapeHtml(chqFechaUS(c.fecha))}</div>
  <div class="f" style="${pos('monto')}">**${chqDinero(c.monto)}</div>
  <div class="f letras" style="${pos('letras')}">${escapeHtml(letras)} ${relleno}</div>
  <div class="f" style="${pos('a')}">${escapeHtml(c.a)}</div>
  ${c.memo ? `<div class="f memo" style="${pos('memo')}">${escapeHtml(c.memo)}</div>` : ''}
  ${talones ? chqTalonHTML(c, 3.85 + dy, (chqPagosDeCheque(c).length > 1 || (c.ganancias && c.ganancias.length)) ? 'Payee copy' : 'Employee copy') + chqTalonHTML(c, 7.6 + dy, 'Company copy') : ''}
</div>
<script>
  // Si el talón no cabe en su espacio, se achica la letra poco a poco hasta que quepa
  (function () {
    document.querySelectorAll('.talon').forEach(function (t) {
      var fs = 10;
      t.style.fontSize = fs + 'pt';
      while (t.scrollHeight > t.clientHeight + 1 && fs > 5) { fs -= 0.25; t.style.fontSize = fs + 'pt'; }
    });
  })();
<\/script></body></html>`;
  }

  function chqValidar(c) {
    if (!c.a) { toast('Escribe a quién se le paga', 'error'); $('chq-a').focus(); return false; }
    if (!(c.monto > 0)) { toast('Escribe la cantidad', 'error'); $('chq-monto').focus(); return false; }
    return true;
  }

  $('chq-semana').addEventListener('change', chqRenderPagosSemana);
  $('chq-buscar').addEventListener('input', chqRenderLista);
  $('chq-anio').addEventListener('change', chqRenderLista);
  $('chq-ver').addEventListener('change', chqRenderLista);
  $('chq-btn-manual').addEventListener('click', () => chqAbrirManual(null));
  $('chq-m-tipo').addEventListener('change', chqTipoManual);
  // Borrar TODO el registro (cheques y Zelle) de esta base de datos
  $('chq-btn-borrar-todo').addEventListener('click', async () => {
    if (!chqCargado) await chqCargar();
    if (!chqLista.length) { toast('El registro ya está vacío', 'info'); return; }
    // El registro es compartido por TODAS las bases: aquí solo se borran los
    // cheques de la base en la que estás (antes se borraban los de todas).
    const baseAqui = chqBaseActual();
    const deAqui = (c) => (c.metodo || 'cheque') === 'cheque' && (!c.base || c.base === baseAqui);
    const nC = chqLista.filter(deAqui).length;
    if (!nC) { toast('No hay cheques de esta base que borrar', 'info'); return; }
    if (!await gcConfirm(`¿Borrar los cheques de "${baseAqui}"?\n\n${nC} cheque(s) se borran para siempre. Los de otras bases, los Zelle y el cash no se tocan.`, { okText: 'Borrar cheques', danger: true })) return;
    if (!await gcConfirm('¿Seguro? Esto no se puede deshacer.', { okText: 'Sí, borrar', danger: true })) return;
    chqLista = chqLista.filter((c) => !deAqui(c));
    try { await chqGuardarLista(); toast('Registro de cheques borrado', 'success'); } catch (e) { toast('No se pudo borrar', 'error'); return; }
    $('chq-numero').value = chqSiguienteNumero();
    chqRenderLista();
  });
  $('chq-tipo').addEventListener('change', chqRenderLista);
  $('chq-sin-nombre').addEventListener('change', chqRenderLista);
  // Importar cheques/Zelle de un archivo (ej. lo sacado del banco). No repite:
  // cheques con el mismo número o Zelle con la misma confirmación se saltan.
  $('chq-btn-importar').addEventListener('click', () => $('chq-file').click());
  $('chq-file').addEventListener('change', async (e) => {
    const f = e.target.files && e.target.files[0];
    e.target.value = '';
    if (!f) return;
    let datos;
    try { datos = JSON.parse(await f.text()); } catch (err) { toast('Ese archivo no se pudo leer', 'error'); return; }
    const filas = Array.isArray(datos) ? datos : (datos && Array.isArray(datos.cheques) ? datos.cheques : null);
    if (!filas) { toast('El archivo no trae cheques', 'error'); return; }
    if (!chqCargado) await chqCargar();
    let nuevos = 0, repetidos = 0, completados = 0;
    filas.forEach((r, i) => {
      const z = r.metodo === 'zelle';
      const monto = Math.round((Number(r.monto) || 0) * 100) / 100;
      if (!(monto > 0) || !r.fecha) return;
      const ya = z
        ? chqLista.find((x) => x.metodo === 'zelle' && ((r.conf && x.conf === r.conf) || (!r.conf && x.fecha === r.fecha && Number(x.monto) === monto && (x.a || '') === (r.a || ''))))
        : chqLista.find((x) => x.metodo !== 'zelle' && Number(x.numero) === Number(r.numero));
      if (ya) {
        // Si ya estaba pero sin nombre, se le pone el nombre (y el memo) del archivo
        if (!(ya.a || '').trim() && (r.a || '').trim()) {
          ya.a = r.a.trim();
          if (!(ya.memo || '').trim() && r.memo) ya.memo = r.memo;
          completados++;
        } else repetidos++;
        return;
      }
      chqLista.push({ id: Date.now().toString() + '-' + i + '-' + Math.random().toString(36).slice(2, 6), metodo: z ? 'zelle' : 'cheque',
        numero: z ? null : Number(r.numero) || null, conf: r.conf || '', fecha: r.fecha, a: r.a || '', monto, memo: r.memo || '',
        manual: true, importado: true, creadoEn: new Date().toISOString(), base: chqBaseActual() });
      nuevos++;
    });
    try { await chqGuardarLista(); } catch (err) { toast('No se pudo guardar', 'error'); return; }
    $('chq-numero').value = chqSiguienteNumero();
    chqRenderLista();
    toast(`${nuevos} agregado(s)${completados ? ` · ${completados} con nombre puesto` : ''}${repetidos ? ` · ${repetidos} ya estaban` : ''}`, 'success', 5000);
  });
  $('chq-m-cancelar').addEventListener('click', () => { chqEditandoId = null; $('chq-manual').style.display = 'none'; });
  $('chq-m-guardar').addEventListener('click', chqGuardarManual);
  ['chq-m-num', 'chq-m-fecha', 'chq-m-monto', 'chq-m-a', 'chq-m-memo'].forEach((id) => $(id).addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); chqGuardarManual(); } }));
  $('chq-base').addEventListener('change', () => { chqLlenarSelectNomina(); chqRenderGanancias(); });
  $('chq-btn-toda-semana').addEventListener('click', () => {
    document.querySelectorAll('#chq-pagos-lista .chq-pago').forEach((cb) => { cb.checked = true; });
    chqAplicarPagos();
  });
  $('chq-monto').addEventListener('input', chqActualizarLetras);
  document.querySelectorAll('[data-chq-ver]').forEach((b) => b.addEventListener('click', () => { $('chq-ver').value = b.dataset.chqVer; chqRenderLista(); }));
  document.querySelectorAll('[data-zc-tipo]').forEach((b) => b.addEventListener('click', () => { $('zc-tipo').value = b.dataset.zcTipo; zcRender(); }));
  // Menú ⋯: se cierra al escoger algo o al tocar afuera
  document.querySelectorAll('.pay-menu').forEach((m) => {
    m.querySelectorAll('.pay-menu-pop button').forEach((b) => b.addEventListener('click', () => m.removeAttribute('open')));
  });
  document.addEventListener('click', (e) => { document.querySelectorAll('.pay-menu[open]').forEach((m) => { if (!m.contains(e.target)) m.removeAttribute('open'); }); });
  $('chq-a').addEventListener('input', chqRenderGanancias);
  $('chq-a').addEventListener('change', chqRenderGanancias);

  $('chq-btn-prueba').addEventListener('click', () => {
    const c = chqDatosFormulario();
    if (!c.a) c.a = 'John Smith';
    if (!(c.monto > 0)) c.monto = 1250;
    ghImprimirEnVentana('', 'Prueba de cheque', chqDocumento(c, true));
  });

  $('chq-btn-imprimir').addEventListener('click', async () => {
    const c = chqDatosFormulario();
    if (!chqValidar(c)) return;
    const repetido = chqLista.find((x) => x.metodo !== 'zelle' && Number(x.numero) === c.numero && !x.anulado);
    if (repetido) {
      toast(`El cheque #${c.numero} ya se usó (${repetido.a}). Reimprímelo desde Cheques guardados o cambia el número.`, 'error', 5000);
      return;
    }
    c.id = Date.now().toString() + '-' + Math.random().toString(36).slice(2, 7);
    c.creadoEn = new Date().toISOString();
    c.base = chqBaseActual();
    chqLista.push(c);
    const sigAntes = chqCfg.siguiente;
    chqCfg.siguiente = c.numero + 1;
    try { await chqGuardarLista(); await chqGuardarCfg(); }
    catch (e) {
      // Si no quedó registrado NO se imprime: un cheque impreso sin registro
      // hace que su número se vuelva a usar.
      chqLista = chqLista.filter((x) => x !== c); chqCfg.siguiente = sigAntes;
      toast('No se pudo guardar el cheque, no se imprimió: ' + ((e && e.message) || e), 'error', 6000);
      return;
    }
    ghImprimirEnVentana('', `Cheque ${c.numero}`, chqDocumento(c, false));
    // Deja el formulario listo para el siguiente
    document.querySelectorAll('#chq-pagos-lista .chq-pago, #chq-pagos-lista .chq-grupo-cb, #chq-gan-lista .chq-gan').forEach((cb) => { cb.checked = false; });
    $('chq-gan-wrap').style.display = 'none';
    $('chq-a').value = ''; $('chq-monto').value = ''; $('chq-memo').value = 'WORK';
    $('chq-numero').value = chqSiguienteNumero();
    chqActualizarLetras();
    chqRenderLista();
    chqRenderPagosSemana();
    toast(`Cheque #${c.numero} guardado en Cheques guardados`);
  });

  $('chq-btn-guardar-ajuste').addEventListener('click', async () => {
    chqCfg.offX = parseFloat($('chq-off-x').value) || 0;
    chqCfg.offY = parseFloat($('chq-off-y').value) || 0;
    chqCfg.talones = $('chq-talones').value;
    try { await chqGuardarCfg(); toast('Ajuste guardado'); } catch (e) { toast('No se pudo guardar', 'error'); }
  });
  ['chq-off-x', 'chq-off-y', 'chq-talones'].forEach((id) => $(id).addEventListener('change', () => {
    chqCfg.offX = parseFloat($('chq-off-x').value) || 0;
    chqCfg.offY = parseFloat($('chq-off-y').value) || 0;
    chqCfg.talones = $('chq-talones').value;
  }));

  // ---- Payroll: pestaña principal y sus sub-pestañas ----
  function payMostrar(sub) {
    document.querySelectorAll('.pay-subtab').forEach((t) => t.classList.toggle('active', t.dataset.psub === sub));
    document.querySelectorAll('.pay-subpanel').forEach((p) => p.classList.toggle('active', p.id === 'pay-sub-' + sub));
  }
  async function payAbrir(sub) {
    if ((window.GH_ROL || 'admin') !== 'admin') { toast('Payroll es solo para el administrador', 'error'); return; }
    await nomAsegurarCargado();
    if (!chqCargado) await chqCargar();
    await r99CargarInfo();
    payResumen();
    if (sub === 'cheques') chqRender();
    if (sub === 'guardados') chqRenderLista();
    if (sub === 'zelle') { try { chqLlenarSelectNomina(); } catch (e) {} zcRender(); }
    if (sub === 'r1099') { $('r99-anio').dataset.ok = ''; r99Render(); }
  }
  document.querySelectorAll('.pay-subtab').forEach((t) => t.addEventListener('click', () => { payMostrar(t.dataset.psub); payAbrir(t.dataset.psub); }));
  document.querySelector('.gc-tab[data-tab="payroll"]').addEventListener('click', () => {
    const activa = document.querySelector('.pay-subtab.active');
    payAbrir(activa ? activa.dataset.psub : 'cheques');
  });

// ---- 19-zelle-1099.js ----
  // ===================== ZELLE Y CASH =====================
  // Se guardan en la misma lista que los cheques (gh-cheques) con metodo
  // 'zelle' o 'cash'; aquí solo se ven esos.
  let zcEditandoId = null;
  const zcEs = (c) => c.metodo === 'zelle' || c.metodo === 'cash';
  function zcAnios(sel, lista) {
    const prev = sel.value || String(new Date().getFullYear());
    const anios = [...new Set(lista.map((c) => String(c.fecha || '').slice(0, 4)).filter(Boolean).concat([String(new Date().getFullYear())]))].sort().reverse();
    sel.innerHTML = '<option value="">Todos los años</option>' + anios.map((a) => `<option value="${a}">${a}</option>`).join('');
    sel.value = (anios.includes(prev) || prev === '') ? prev : '';
    return sel.value;
  }
  function zcRender() {
    const todos = chqLista.filter(zcEs);
    const anio = zcAnios($('zc-anio'), todos);
    const tipo = $('zc-tipo').value, q = $('zc-buscar').value.trim().toLowerCase();
    const lista = todos.filter((c) => (!anio || String(c.fecha || '').startsWith(anio)) && (!tipo || c.metodo === tipo) && !c.anulado &&
      (!q || (c.a || '').toLowerCase().includes(q) || (c.memo || '').toLowerCase().includes(q) || (c.conf || '').toLowerCase().includes(q)))
      .sort((a, b) => (b.fecha || '').localeCompare(a.fecha || ''));
    const porP = new Map();
    lista.forEach((c) => {
      const k = (c.a || '').trim().toLowerCase() || '—';
      if (!porP.has(k)) porP.set(k, { nombre: (c.a || '').trim() || 'Sin nombre', z: 0, cash: 0, n: 0 });
      const g = porP.get(k); g.n++; if (c.metodo === 'cash') g.cash += Number(c.monto) || 0; else g.z += Number(c.monto) || 0;
    });
    const grupos = [...porP.values()].map((g) => Object.assign(g, { total: g.z + g.cash })).sort((a, b) => b.total - a.total);
    const tz = grupos.reduce((t, g) => t + g.z, 0), tc = grupos.reduce((t, g) => t + g.cash, 0);
    $('zc-resumen').innerHTML = (lista.length ? `<div class="pay-stats">
        <div class="pay-stat"><div class="l">Zelle${anio ? ' ' + anio : ''}</div><div class="v">${nomFmt(tz)}</div></div>
        <div class="pay-stat"><div class="l">Cash${anio ? ' ' + anio : ''}</div><div class="v">${nomFmt(tc)}</div></div></div>` : '') +
      payPersonasHTML('zc', grupos, 'Total por persona', (g) => g.z && g.cash ? ` · Zelle ${nomFmt(g.z)} · Cash ${nomFmt(g.cash)}` : '', true);
    payPersonasRecordar($('zc-resumen'));
    $('zc-resumen').querySelectorAll('.pay-per').forEach((d) => d.addEventListener('click', (e) => { if (e.target.closest('.pay-per-del')) return; $('zc-buscar').value = d.dataset.n === 'Sin nombre' ? '' : d.dataset.n; zcRender(); }));
    // Borrar todos los pagos (Zelle/Cash) de una persona, de lo que se está viendo
    $('zc-resumen').querySelectorAll('.pay-per-del').forEach((b) => b.addEventListener('click', async (e) => {
      e.stopPropagation();
      const nombre = b.dataset.n;
      const clave = nombre === 'Sin nombre' ? '' : nombre.toLowerCase();
      const ids = new Set(lista.filter((c) => (c.a || '').trim().toLowerCase() === clave).map((c) => c.id));
      if (!ids.size) return;
      const total = lista.filter((c) => ids.has(c.id)).reduce((t, c) => t + (Number(c.monto) || 0), 0);
      const que = tipo === 'cash' ? 'pago(s) en Cash' : (tipo === 'zelle' ? 'Zelle' : 'pago(s) de Zelle y Cash');
      if (!await gcConfirm(`¿Borrar los ${ids.size} ${que} de ${nombre}${anio ? ' en ' + anio : ''}?\n\nSon ${nomFmt(total)}. Se quitan para siempre. Los cheques no se tocan.`, { okText: 'Borrar ' + ids.size, danger: true })) return;
      chqLista = chqLista.filter((x) => !ids.has(x.id));
      try { await chqGuardarLista(); toast(`${ids.size} pago(s) de ${nombre} borrados`, 'success'); } catch (err) { toast('No se pudo borrar', 'error'); }
      if ($('zc-buscar').value.trim().toLowerCase() === clave) $('zc-buscar').value = '';
      zcRender(); payResumen();
    }));
    document.querySelectorAll('[data-zc-tipo]').forEach((b) => b.classList.toggle('on', b.dataset.zcTipo === tipo));
    $('zc-empty').style.display = lista.length ? 'none' : 'block';
    $('zc-tbl').style.display = lista.length ? 'block' : 'none';
    $('zc-tbody').innerHTML = payListaPorMes(lista, (c) => payFilaHTML(c, `
      <button type="button" class="pay-act zc-ed" data-id="${escapeHtml(c.id)}">${PAY_SVG.ed} Editar</button>
      <button type="button" class="pay-act peligro zc-del" data-id="${escapeHtml(c.id)}">${PAY_SVG.del} Borrar</button>`));
    payActivarFilas($('zc-tbody'));
    $('zc-tbody').querySelectorAll('.zc-ed').forEach((b) => b.addEventListener('click', () => zcAbrir(chqLista.find((x) => x.id === b.dataset.id))));
    $('zc-tbody').querySelectorAll('.zc-del').forEach((b) => b.addEventListener('click', async () => {
      const c = chqLista.find((x) => x.id === b.dataset.id); if (!c) return;
      if (!await gcConfirm(`¿Borrar este ${c.metodo === 'cash' ? 'pago en cash' : 'Zelle'} a ${c.a || 'sin nombre'} (${nomFmt(c.monto)})?`, { okText: 'Borrar', danger: true })) return;
      chqLista = chqLista.filter((x) => x.id !== c.id);
      try { await chqGuardarLista(); toast('Borrado'); } catch (e) { toast('No se pudo borrar', 'error'); }
      zcRender();
    }));
  }
  function zcAbrir(c) {
    zcEditandoId = c ? c.id : null;
    $('zc-form-titulo').textContent = c ? 'Editar pago' : 'Agregar pago';
    $('zc-tipo-f').value = c ? (c.metodo === 'cash' ? 'cash' : 'zelle') : ($('zc-tipo').value || 'zelle');
    $('zc-fecha').value = c ? (c.fecha || '') : nomToday();
    $('zc-monto').value = c ? (Number(c.monto) || 0).toFixed(2) : '';
    $('zc-a').value = c ? (c.a || '') : '';
    $('zc-memo').value = c ? (c.memo || '') : '';
    $('zc-form').style.display = 'block';
    (c ? $('zc-monto') : $('zc-a')).focus();
  }
  async function zcGuardar() {
    const monto = Math.round((parseFloat($('zc-monto').value) || 0) * 100) / 100;
    const a = $('zc-a').value.replace(/\s+/g, ' ').trim();
    if (!a) { toast('Escribe a quién se le pagó', 'error'); $('zc-a').focus(); return; }
    if (!(monto > 0)) { toast('Escribe la cantidad', 'error'); $('zc-monto').focus(); return; }
    const datos = { metodo: $('zc-tipo-f').value, fecha: $('zc-fecha').value || nomToday(), a, monto, memo: $('zc-memo').value.trim(), numero: null };
    if (zcEditandoId) { const c = chqLista.find((x) => x.id === zcEditandoId); if (c) Object.assign(c, datos); }
    else chqLista.push(Object.assign({ id: Date.now().toString() + '-' + Math.random().toString(36).slice(2, 7), manual: true, creadoEn: new Date().toISOString(), base: chqBaseActual() }, datos));
    try { await chqGuardarLista(); toast(zcEditandoId ? 'Pago actualizado' : 'Pago agregado'); } catch (e) { toast('No se pudo guardar', 'error'); return; }
    const era = zcEditandoId; zcEditandoId = null;
    if (era) $('zc-form').style.display = 'none';
    else { $('zc-monto').value = ''; $('zc-a').value = ''; $('zc-memo').value = ''; $('zc-a').focus(); }
    zcRender();
  }
  $('zc-btn-nuevo').addEventListener('click', () => zcAbrir(null));
  $('zc-cancelar').addEventListener('click', () => { zcEditandoId = null; $('zc-form').style.display = 'none'; });
  $('zc-guardar').addEventListener('click', zcGuardar);
  ['zc-fecha', 'zc-monto', 'zc-a', 'zc-memo'].forEach((id) => $(id).addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); zcGuardar(); } }));
  ['zc-buscar'].forEach((id) => $(id).addEventListener('input', zcRender));
  ['zc-anio', 'zc-tipo'].forEach((id) => $(id).addEventListener('change', zcRender));


  // ===================== 1099 =====================
  // Datos de cada persona para el 1099 (W-9): dirección, número de taxes,
  // si es compañía y si NO le toca 1099. Clave "__": solo el admin la ve.
  const R99_INFO_KEY = '__gh-1099-info';
  let r99Info = {};
  let r99InfoCargada = false;
  async function r99CargarInfo() {
    if (r99InfoCargada) return;
    try { const r = await window.storage.get(R99_INFO_KEY); const v = JSON.parse(r.value); if (v && typeof v === 'object') r99Info = v; } catch (e) {}
    r99InfoCargada = true;
  }
  async function r99GuardarInfo() { await window.storage.set(R99_INFO_KEY, JSON.stringify(r99Info)); }
  const r99Clave = (n) => String(n || '').replace(/\s+/g, ' ').trim().toLowerCase();
  const MESES_CORTOS = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];

  function r99Datos() {
    const anio = $('r99-anio').value || String(new Date().getFullYear());
    const umbral = Number(chqCfg.umbral1099 != null ? chqCfg.umbral1099 : 2000) || 0;
    const porP = new Map();
    chqLista.filter((c) => !c.anulado && String(c.fecha || '').startsWith(anio)).forEach((c) => {
      const nombre = (c.a || '').trim() || 'Sin nombre';
      const k = r99Clave(nombre);
      if (!porP.has(k)) porP.set(k, { clave: k, nombre, cheque: 0, zelle: 0, cash: 0, pagos: [], meses: new Array(12).fill(0) });
      const g = porP.get(k);
      const m = c.metodo === 'zelle' ? 'zelle' : (c.metodo === 'cash' ? 'cash' : 'cheque');
      const monto = Number(c.monto) || 0;
      g[m] += monto; g.pagos.push(c);
      const mes = Number(String(c.fecha || '').slice(5, 7)) - 1; if (mes >= 0 && mes < 12) g.meses[mes] += monto;
    });
    const filas = [...porP.values()].map((g) => {
      const info = r99Info[g.clave] || {};
      const total = g.cheque + g.zelle + g.cash;
      const sinNombre = g.nombre === 'Sin nombre';
      return Object.assign(g, { total, info, excluido: !!info.excluir, lleva: !sinNombre && !info.excluir && total >= umbral, w9: !!(info.tin && info.dir) });
    }).sort((a, b) => b.total - a.total);
    return { anio, umbral, filas };
  }
  function r99LlenarAnios() {
    const prev = $('r99-anio').value;
    const anios = [...new Set(chqLista.map((c) => String(c.fecha || '').slice(0, 4)).filter(Boolean).concat([String(new Date().getFullYear())]))].sort().reverse();
    $('r99-anio').innerHTML = anios.map((a) => `<option value="${a}">${a}</option>`).join('');
    $('r99-anio').value = anios.includes(prev) ? prev : anios[0];
  }
  function r99Render() {
    if (!$('r99-anio').dataset.ok) { r99LlenarAnios(); $('r99-anio').dataset.ok = '1'; }
    $('r99-umbral').value = chqCfg.umbral1099 != null ? chqCfg.umbral1099 : 2000;
    const { anio, umbral, filas } = r99Datos();
    const vis = $('r99-solo').checked ? filas.filter((f) => f.lleva) : filas;
    const llevan = filas.filter((f) => f.lleva);
    const faltaW9 = llevan.filter((f) => !f.w9).length;
    const sinNombre = filas.find((f) => f.nombre === 'Sin nombre');
    const totalAnio = filas.reduce((t, f) => t + f.total, 0);
    $('r99-resumen').innerHTML = `<div class="pay-stats">
      <div class="pay-stat"><div class="l">Pagado ${anio}</div><div class="v">${nomFmt(totalAnio)}</div></div>
      <div class="pay-stat"><div class="l">Llevan 1099</div><div class="v">${llevan.length}</div></div>
      <div class="pay-stat ${faltaW9 ? 'rojo' : (llevan.length ? 'verde' : '')}"><div class="l">W-9</div><div class="v">${faltaW9 ? faltaW9 + ' faltan' : (llevan.length ? 'Completo' : '—')}</div></div>
      ${sinNombre ? `<div class="pay-stat rojo"><div class="l">Sin nombre</div><div class="v">${sinNombre.pagos.length}</div></div>` : ''}</div>`;
    const selK = $('r99-detalle').dataset.k || '';
    $('r99-tbody').innerHTML = vis.length ? `<div class="pay-grupo">${vis.map((f) => {
      const partes = [f.cheque ? 'Cheques ' + nomFmt(f.cheque) : '', f.zelle ? 'Zelle ' + nomFmt(f.zelle) : '', f.cash ? 'Cash ' + nomFmt(f.cash) : ''].filter(Boolean).join(' · ');
      const chip = f.excluido ? '<span class="pay-tag">No le toca</span>'
        : (f.lleva ? (f.w9 ? '<span class="pay-tag verde">1099 · W-9 ✓</span>' : '<span class="pay-tag rojo">1099 · falta W-9</span>') : '');
      return `<div class="pay-row${f.clave === selK ? ' sel' : ''}"${f.excluido ? ' style="opacity:.6;"' : ''}>
        <button type="button" class="pay-row-main r99-f" data-k="${escapeHtml(f.clave)}">
          <div class="pay-ico per">${f.nombre === 'Sin nombre' ? '?' : payIniciales(f.nombre)}</div>
          <span class="pay-row-txt"><span class="pay-row-nom${f.nombre === 'Sin nombre' ? ' sin' : ''}">${escapeHtml(f.nombre)}${f.info.compania ? '<span class="pay-tag">compañía</span>' : ''}</span><span class="pay-row-meta wrap">${partes}</span></span>
          <span class="pay-row-der"><span class="pay-row-amt">${nomFmt(f.total)}</span>${chip}</span><span class="pay-chev der"></span>
        </button></div>`;
    }).join('')}</div>` : '<div class="gc-empty">No hay pagos en ese año.</div>';
    $('r99-tbody').querySelectorAll('.r99-f').forEach((tr) => tr.addEventListener('click', () => { r99Detalle(tr.dataset.k); $('r99-tbody').querySelectorAll('.pay-row').forEach((r) => r.classList.toggle('sel', r.contains(tr))); }));
    if ($('r99-detalle').dataset.k) r99Detalle($('r99-detalle').dataset.k, true);
  }
  function r99Detalle(clave, sinScroll) {
    const { anio, filas } = r99Datos();
    const f = filas.find((x) => x.clave === clave);
    const box = $('r99-detalle');
    if (!f) { box.innerHTML = ''; box.dataset.k = ''; return; }
    box.dataset.k = clave;
    const info = f.info || {};
    const max = Math.max(1, ...f.meses);
    const pagos = f.pagos.slice().sort((a, b) => (a.fecha || '').localeCompare(b.fecha || ''));
    const inp = 'width:100%;padding:8px 10px;border:1.5px solid var(--border);border-radius:8px;font-size:15px;background:var(--card);color:var(--ink);';
    box.innerHTML = `<div class="pay-form" style="margin:0;background:var(--card);box-shadow:var(--shadow-sm);">
      <div style="display:flex;justify-content:space-between;gap:10px;flex-wrap:wrap;align-items:baseline;">
        <div style="font-weight:800;font-size:16px;">${escapeHtml(f.nombre)}</div>
        <div style="font-weight:800;font-size:18px;">${nomFmt(f.total)} <span style="font-size:12px;color:var(--muted);font-weight:600;">${anio}</span></div>
      </div>
      <div class="pay-meses" style="margin:10px 0 4px;">${f.meses.map((v, i) => `<div class="pay-mes" title="${MESES_CORTOS[i]}: ${nomFmt(v)}"><div class="b" style="height:${Math.round(v / max * 72)}px;${v ? '' : 'opacity:.25;'}"></div><div class="m">${MESES_CORTOS[i]}</div></div>`).join('')}</div>
      ${f.nombre !== 'Sin nombre' ? `
      <div style="margin-top:12px;padding-top:12px;border-top:1px solid var(--border-soft);">
        <div style="font-weight:700;font-size:13.5px;margin-bottom:8px;">Datos para el 1099 (W-9)</div>
        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:10px;">
          <label style="font-size:12px;color:var(--muted);">Número de taxes (SSN, ITIN o EIN)<span style="display:flex;gap:6px;align-items:center;"><input type="password" id="r99-i-tin" value="${escapeHtml(info.tin || '')}" autocomplete="off" spellcheck="false" style="${inp};flex:1;min-width:0;"><button type="button" class="gc-action-btn" id="r99-i-tin-ver" style="padding:6px 10px;font-size:12px;margin-top:4px;">Mostrar</button></span></label>
          <label style="font-size:12px;color:var(--muted);">Dirección<input type="text" id="r99-i-dir" value="${escapeHtml(info.dir || '')}" autocomplete="off" style="${inp}"></label>
          <label style="font-size:12px;color:var(--muted);">Ciudad, estado y ZIP<input type="text" id="r99-i-ciudad" value="${escapeHtml(info.ciudad || '')}" autocomplete="off" style="${inp}"></label>
        </div>
        <div style="display:flex;flex-wrap:wrap;gap:8px 18px;margin-top:10px;font-size:13.5px;">
          <label style="display:flex;align-items:center;gap:8px;cursor:pointer;"><input type="checkbox" id="r99-i-comp" ${info.compania ? 'checked' : ''} style="width:18px;height:18px;"> Es compañía</label>
          <label style="display:flex;align-items:center;gap:8px;cursor:pointer;"><input type="checkbox" id="r99-i-excl" ${info.excluir ? 'checked' : ''} style="width:18px;height:18px;"> No le toca 1099 (ej. yo mismo, corporación)</label>
        </div>
        <div style="display:flex;justify-content:flex-end;gap:8px;flex-wrap:wrap;margin-top:10px;"><button type="button" class="gc-action-btn" id="r99-i-hoja">Imprimir hoja 1099</button><button type="button" class="gc-save-btn" id="r99-i-guardar">Guardar datos</button></div>
      </div>` : '<p style="font-size:12.5px;color:var(--ember);margin-top:10px;">Ponle nombre a estos pagos en Cheques o en Zelle y Cash.</p>'}
      <div style="margin-top:12px;padding-top:8px;border-top:1px solid var(--border-soft);">
        ${pagos.map((c) => `<div style="display:flex;justify-content:space-between;gap:10px;padding:5px 0;border-bottom:1px solid var(--border-soft);font-size:13px;">
          <span>${escapeHtml(chqFechaUS(c.fecha))} · ${c.metodo === 'zelle' ? 'Zelle' : (c.metodo === 'cash' ? 'Cash' : 'Cheque #' + escapeHtml(String(c.numero || '')))}${c.base ? ` <span style="color:var(--muted);font-size:11.5px;">· ${escapeHtml(c.base)}</span>` : ''}</span><span>${nomFmt(c.monto)}</span></div>`).join('')}
      </div></div>`;
    const ver = $('r99-i-tin-ver');
    if (ver) ver.addEventListener('click', () => {
      const i = $('r99-i-tin'); const mostrar = i.type === 'password';
      i.type = mostrar ? 'text' : 'password'; ver.textContent = mostrar ? 'Ocultar' : 'Mostrar';
      if (mostrar) setTimeout(() => { if (i.isConnected) { i.type = 'password'; ver.textContent = 'Mostrar'; } }, 20000);
    });
    const g = $('r99-i-guardar');
    if (g) g.addEventListener('click', async () => {
      r99Info[clave] = Object.assign({}, r99Info[clave] || {}, {
        nombre: f.nombre,
        tin: $('r99-i-tin').value.trim(), dir: $('r99-i-dir').value.trim(), ciudad: $('r99-i-ciudad').value.trim(),
        compania: $('r99-i-comp').checked, excluir: $('r99-i-excl').checked
      });
      try { await r99GuardarInfo(); toast('Datos guardados'); } catch (e) { toast('No se pudo guardar', 'error'); return; }
      r99Render(); payResumen();
    });
    const hj = $('r99-i-hoja');
    if (hj) hj.addEventListener('click', () => ghImprimirEnVentana(r99HojaHTML(f, anio), '1099 ' + f.nombre + ' ' + anio));
    if (!sinScroll) box.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }
  // Hoja de apoyo para el contador: quién paga, a quién, cuánto y cuándo.
  // (No es el formulario oficial del IRS — trae los datos para llenarlo.)
  function r99HojaHTML(f, anio) {
    const info = f.info || {};
    const pagos = f.pagos.slice().sort((a, b) => (a.fecha || '').localeCompare(b.fecha || ''));
    const met = (c) => c.metodo === 'zelle' ? 'Zelle' : (c.metodo === 'cash' ? 'Cash' : 'Cheque #' + (c.numero || ''));
    const dir = [info.dir, info.ciudad].filter(Boolean).join(', ');
    return `<h1>${escapeHtml(cfgFacturaNombre || 'GUZMAN HVAC')}</h1>
      ${cfgFacturaDireccion ? `<div class="ps-addr">${escapeHtml(cfgFacturaDireccion)}</div>` : ''}
      <div class="ps-badge">Pagos a contratista ${anio} — hoja de apoyo para el formulario 1099-NEC</div>
      <h2>Quien recibió el pago</h2>
      <table><tbody>
        <tr><td style="width:34%;">Nombre</td><td><strong>${escapeHtml(f.nombre)}</strong>${info.compania ? ' (compañía)' : ''}</td></tr>
        <tr><td>Número de taxes (SSN / ITIN / EIN)</td><td>${escapeHtml(info.tin || '— falta —')}</td></tr>
        <tr><td>Dirección</td><td>${escapeHtml(dir || '— falta —')}</td></tr>
      </tbody></table>
      <h2>Total pagado en ${anio}</h2>
      <table><tbody>
        <tr><td>Cheques</td><td class="num">${nomFmt(f.cheque)}</td></tr>
        <tr><td>Zelle</td><td class="num">${nomFmt(f.zelle)}</td></tr>
        <tr><td>Cash</td><td class="num">${nomFmt(f.cash)}</td></tr>
      </tbody><tfoot><tr class="ps-total"><td>Total (casilla 1 — compensación a no empleados)</td><td class="num">${nomFmt(f.total)}</td></tr></tfoot></table>
      <h2>Detalle de pagos</h2>
      <table><thead><tr><th>Fecha</th><th>Forma de pago</th><th>Nota</th><th class="num">Monto</th></tr></thead>
        <tbody>${pagos.map((c) => `<tr><td>${escapeHtml(chqFechaUS(c.fecha))}</td><td>${escapeHtml(met(c))}</td><td>${escapeHtml(c.memo || '')}</td><td class="num">${nomFmt(c.monto)}</td></tr>`).join('')}</tbody></table>
      <div class="ps-addr" style="margin-top:14px;">Documento interno de apoyo. No es el formulario oficial del IRS.</div>`;
  }
  function r99HTML() {
    const { anio, umbral, filas } = r99Datos();
    const vis = $('r99-solo').checked ? filas.filter((f) => f.lleva) : filas;
    return `<h1>${escapeHtml(cfgFacturaNombre || 'GUZMAN HVAC')}</h1>
      <div class="ps-addr">Pagos por persona ${anio} (cheques, Zelle y cash) · límite 1099: ${nomFmt(umbral)}</div>
      <table><thead><tr><th>Persona</th><th>Dirección</th><th class="num">Cheques</th><th class="num">Zelle</th><th class="num">Cash</th><th class="num">Total</th><th>1099</th></tr></thead>
      <tbody>${vis.map((f) => `<tr><td>${escapeHtml(f.nombre)}${f.info.compania ? ' (compañía)' : ''}</td><td>${escapeHtml([f.info.dir, f.info.ciudad].filter(Boolean).join(', '))}</td><td class="num">${nomFmt(f.cheque)}</td><td class="num">${nomFmt(f.zelle)}</td><td class="num">${nomFmt(f.cash)}</td><td class="num"><strong>${nomFmt(f.total)}</strong></td><td>${f.excluido ? 'No le toca' : (f.lleva ? 'Sí' : 'No')}</td></tr>`).join('')}</tbody>
      <tfoot><tr class="ps-total"><td>Total</td><td></td><td class="num">${nomFmt(vis.reduce((t, f) => t + f.cheque, 0))}</td><td class="num">${nomFmt(vis.reduce((t, f) => t + f.zelle, 0))}</td><td class="num">${nomFmt(vis.reduce((t, f) => t + f.cash, 0))}</td><td class="num">${nomFmt(vis.reduce((t, f) => t + f.total, 0))}</td><td></td></tr></tfoot></table>`;
  }
  $('r99-anio').addEventListener('change', () => { $('r99-detalle').innerHTML = ''; $('r99-detalle').dataset.k = ''; r99Render(); });
  $('r99-solo').addEventListener('change', r99Render);
  $('r99-umbral').addEventListener('change', async () => {
    chqCfg.umbral1099 = Math.max(0, Number($('r99-umbral').value) || 0);
    try { await chqGuardarCfg(); } catch (e) {}
    r99Render(); payResumen();
  });
  $('r99-imprimir').addEventListener('click', () => ghImprimirEnVentana(r99HTML(), '1099 ' + $('r99-anio').value));
  $('r99-hojas').addEventListener('click', () => {
    const { anio, filas } = r99Datos();
    const llevan = filas.filter((f) => f.lleva);
    if (!llevan.length) { toast('Nadie llega al límite del 1099 todavía', 'info'); return; }
    ghImprimirEnVentana(llevan.map((f) => `<div class="gh-doc" style="page-break-after:always;">${r99HojaHTML(f, anio)}</div>`).join(''), `Hojas 1099 ${anio} (${llevan.length})`);
  });
  $('r99-csv').addEventListener('click', () => {
    const { anio, filas } = r99Datos();
    const q = (v) => '"' + String(v == null ? '' : v).replace(/"/g, '""') + '"';
    const csv = ['Persona,Compania,Numero de taxes,Direccion,Ciudad estado ZIP,Cheques,Zelle,Cash,Total,1099']
      .concat(filas.map((f) => [q(f.nombre), f.info.compania ? 'Si' : 'No', q(f.info.tin), q(f.info.dir), q(f.info.ciudad),
        f.cheque.toFixed(2), f.zelle.toFixed(2), f.cash.toFixed(2), f.total.toFixed(2), f.excluido ? 'No le toca' : (f.lleva ? 'Si' : 'No')].join(','))).join('\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
    const a = document.createElement('a'); a.href = url; a.download = `pagos-1099-${anio}.csv`; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  });

  // ===================== RESUMEN DE PAYROLL =====================
  function payResumen() {
    const anio = String(new Date().getFullYear());
    const del = chqLista.filter((c) => !c.anulado && String(c.fecha || '').startsWith(anio));
    const suma = (m) => del.filter((c) => (c.metodo || 'cheque') === m).reduce((t, c) => t + (Number(c.monto) || 0), 0);
    const tCh = suma('cheque'), tZ = suma('zelle'), tCa = suma('cash');
    const nCh = del.filter((c) => (c.metodo || 'cheque') === 'cheque').length;
    const sinNombre = chqLista.filter((c) => !c.anulado && !(c.a || '').trim()).length;
    let llevan = 0, faltaW9 = 0;
    try {
      const prev = $('r99-anio').value; if (!$('r99-anio').options.length) r99LlenarAnios();
      $('r99-anio').value = anio;
      const d = r99Datos(); llevan = d.filas.filter((f) => f.lleva).length; faltaW9 = d.filas.filter((f) => f.lleva && !f.w9).length;
      if (prev) $('r99-anio').value = prev;
    } catch (e) {}
    $('pay-res-anio').textContent = anio;
    $('pay-kpis').innerHTML = `
      <div class="pay-kpi"><div class="l">Pagado en ${anio}</div><div class="v">${nomFmt(tCh + tZ + tCa)}</div><div class="s">Cheques ${nomFmt(tCh)} · Zelle ${nomFmt(tZ)}${tCa ? ' · Cash ' + nomFmt(tCa) : ''}</div></div>
      <div class="pay-kpi click" data-ir="guardados"><div class="l">Cheques</div><div class="v">${nCh}</div><div class="s">Próximo: #${chqSiguienteNumero()}</div></div>
      <div class="pay-kpi click ${sinNombre ? 'alerta' : ''}" data-ir="sin-nombre"><div class="l">Sin nombre</div><div class="v">${sinNombre}</div><div class="s">${sinNombre ? 'Toca para ponérselo' : 'Todo con nombre ✓'}</div></div>
      <div class="pay-kpi click ${faltaW9 ? 'alerta' : ''}" data-ir="r1099"><div class="l">Llevan 1099</div><div class="v">${llevan}</div><div class="s">${faltaW9 ? faltaW9 + ' sin W-9' : (llevan ? 'Con W-9 ✓' : 'Ninguno todavía')}</div></div>`;
    $('pay-kpis').querySelectorAll('.pay-kpi.click').forEach((k) => k.addEventListener('click', () => {
      const ir = k.dataset.ir;
      if (ir === 'sin-nombre') {
        const hayCh = chqLista.some((c) => !c.anulado && !(c.a || '').trim() && (c.metodo || 'cheque') === 'cheque');
        const sub = hayCh ? 'guardados' : 'zelle';
        payMostrar(sub); payAbrir(sub).then(() => { if (sub === 'guardados') { $('chq-sin-nombre').checked = true; chqRenderLista(); $('chq-tbl').scrollIntoView({ behavior: 'smooth' }); } });
      } else { payMostrar(ir); payAbrir(ir); }
    }));
    const meses = new Array(12).fill(0);
    del.forEach((c) => { const m = Number(String(c.fecha || '').slice(5, 7)) - 1; if (m >= 0 && m < 12) meses[m] += Number(c.monto) || 0; });
    const max = Math.max(1, ...meses);
    $('pay-meses').innerHTML = `<div style="font-size:11px;font-weight:700;color:var(--muted);text-transform:uppercase;letter-spacing:.5px;margin-bottom:6px;">Pagado por mes</div>
      <div class="pay-meses">${meses.map((v, i) => `<div class="pay-mes${i === new Date().getMonth() ? ' hoy' : ''}" title="${MESES_CORTOS[i]}: ${nomFmt(v)}"><div class="b" style="height:${Math.round(v / max * 72)}px;${v ? '' : 'opacity:.25;'}"></div><div class="m">${MESES_CORTOS[i]}</div></div>`).join('')}</div>`;
  }

  // ===================== UNIR NOMBRES =====================
  function payUnirRender() {
    const q = $('pay-unir-buscar').value.trim().toLowerCase();
    const marcados = new Set([...document.querySelectorAll('#pay-unir-lista .pu-cb:checked')].map((c) => c.value));
    const porN = new Map();
    chqLista.forEach((c) => {
      const n = (c.a || '').replace(/\s+/g, ' ').trim(); if (!n) return;
      const k = n.toLowerCase();
      if (!porN.has(k)) porN.set(k, { k, nombres: new Map(), n: 0, total: 0 });
      const g = porN.get(k); g.n++; if (!c.anulado) g.total += Number(c.monto) || 0;
      g.nombres.set(n, (g.nombres.get(n) || 0) + 1);
    });
    const lista = [...porN.values()].map((g) => Object.assign(g, { nombre: [...g.nombres.entries()].sort((a, b) => b[1] - a[1])[0][0] }))
      .filter((g) => !q || g.k.includes(q) || marcados.has(g.k)).sort((a, b) => a.nombre.localeCompare(b.nombre));
    $('pay-unir-lista').innerHTML = lista.map((g) => `<label style="display:flex;align-items:center;gap:10px;padding:7px 0;border-bottom:1px solid var(--border-soft);cursor:pointer;font-size:14px;">
      <input type="checkbox" class="pu-cb" value="${escapeHtml(g.k)}" data-n="${escapeHtml(g.nombre)}" ${marcados.has(g.k) ? 'checked' : ''} style="width:18px;height:18px;">
      <span style="flex:1;min-width:0;">${escapeHtml(g.nombre)} <span style="font-size:12px;color:var(--muted);">· ${g.n} pago${g.n === 1 ? '' : 's'}</span></span><strong style="white-space:nowrap;">${nomFmt(g.total)}</strong></label>`).join('')
      || '<div style="color:var(--muted);padding:8px 0;">No hay nombres.</div>';
    $('pay-unir-lista').querySelectorAll('.pu-cb').forEach((cb) => cb.addEventListener('change', () => {
      const sel = [...document.querySelectorAll('#pay-unir-lista .pu-cb:checked')];
      if (sel.length && !$('pay-unir-nombre').value.trim()) $('pay-unir-nombre').value = sel[0].dataset.n;
    }));
  }
  $('pay-btn-unir').addEventListener('click', () => {
    const box = $('pay-unir');
    if (box.style.display === 'block') { box.style.display = 'none'; return; }
    box.style.display = 'block'; $('pay-unir-buscar').value = ''; $('pay-unir-nombre').value = ''; payUnirRender(); $('pay-unir-buscar').focus();
  });
  $('pay-unir-buscar').addEventListener('input', payUnirRender);
  $('pay-unir-cancelar').addEventListener('click', () => { $('pay-unir').style.display = 'none'; });
  $('pay-unir-ok').addEventListener('click', async () => {
    const sel = [...document.querySelectorAll('#pay-unir-lista .pu-cb:checked')].map((c) => c.value);
    const nuevo = $('pay-unir-nombre').value.replace(/\s+/g, ' ').trim();
    if (sel.length < 1) { toast('Marca los nombres que quieres unir', 'error'); return; }
    if (!nuevo) { toast('Escribe cómo debe quedar el nombre', 'error'); $('pay-unir-nombre').focus(); return; }
    const claves = new Set(sel);
    const afectados = chqLista.filter((c) => claves.has((c.a || '').replace(/\s+/g, ' ').trim().toLowerCase()));
    if (!await gcConfirm(`¿Cambiar ${afectados.length} pago(s) de ${sel.length} nombre(s) a "${nuevo}"?`, { okText: 'Unir' })) return;
    afectados.forEach((c) => { c.a = nuevo; });
    // Los datos del W-9 se pasan al nombre nuevo si este no tiene
    await r99CargarInfo();
    const kNuevo = r99Clave(nuevo);
    sel.forEach((k) => { if (k !== kNuevo && r99Info[k]) { if (!r99Info[kNuevo]) r99Info[kNuevo] = Object.assign({}, r99Info[k], { nombre: nuevo }); delete r99Info[k]; } });
    try { await chqGuardarLista(); await r99GuardarInfo(); toast(`Listo: ${afectados.length} pago(s) ahora dicen "${nuevo}"`, 'success', 3500); } catch (e) { toast('No se pudo guardar', 'error'); return; }
    $('pay-unir').style.display = 'none';
    payResumen();
    const act = document.querySelector('.pay-subtab.active'); if (act) payAbrir(act.dataset.psub);
  });

  // ===================== /ZELLE Y CASH · 1099 =====================
  // ===================== /CHEQUES =====================

})();
(function () {
// ---- 90-visor.js ----

  /* ============================================================
     Control de acceso por rol. El bloque de arriba (gh-oculto-inicial)
     esconde nav/body desde el primer pintado siempre; aquí se decide
     cuándo y qué revelar. En Windows/CRA (sin login, sin
     window.GH_ESPERAR_SESION) se revela de inmediato.
     ============================================================ */
  // Envoltura defensiva: si por algún motivo el módulo de seguridad no cargó,
  // nunca debe dejar a alguien afuera de su propia app — revela directo.
  function revelarConBloqueo() {
    (window.GH_APPLOCK_VERIFICAR_Y_REVELAR || function (cb) { cb(); })(revelarAppNormal);
  }

  if (typeof window.GH_ESPERAR_SESION !== 'function') { revelarConBloqueo(); return; } // no aplica (Windows / CRA) — no hay nada que esperar

  window.GH_ESPERAR_SESION().then(async () => {
    const rol = window.GH_ROL;
    // admin = acceso total (con panel de administración)
    // empleado = acceso normal para editar su base de datos, sin administración
    // visor = una pestaña por cada base de datos que el admin le dio, solo lectura
    if (rol === 'visor') {
      // Arma la interfaz restringida (ya oculta los paneles normales por su
      // cuenta) ANTES de revelar — así el visor nunca ve, ni un instante,
      // la app normal con datos completos.
      await aplicarModoVisorMultiCuenta();
      revelarConBloqueo();
    } else {
      revelarConBloqueo();
    }
  });

  function revelarAppNormal() {
    const oculto = document.getElementById('gh-oculto-inicial');
    if (oculto) oculto.remove();
  }

  // ============================================================
  // MODO VISOR — una pestaña por cada base de datos que el admin
  // le haya dado, cada una con Invoices guardados + Recibo semanal.
  // Todo de solo lectura. (Script aislado: trae sus propias
  // funciones auxiliares — escapeHtml/fmt/etc. de la app principal
  // no son accesibles desde aquí.)
  // ============================================================
  const CHK_KEY = 'gh-checkin';
  const toast = (m, t, d) => { if (window.GH_TOAST) window.GH_TOAST(m, t, d); };
  // Copia del check-in en el teléfono, para abrir sin señal
  const CHK_COPIA = (codigo) => 'gh-chk-copia-' + (window.GH_USER_ID || '') + '-' + codigo;
  function chkCopiaGuardar(codigo, obj) { try { localStorage.setItem(CHK_COPIA(codigo), JSON.stringify(obj)); } catch (e) {} }
  function chkCopiaLeer(codigo) { try { const v = JSON.parse(localStorage.getItem(CHK_COPIA(codigo)) || 'null'); return v && typeof v === 'object' && !Array.isArray(v) ? v : null; } catch (e) { return null; } }
  const esSinPermiso = (e) => !!e && (e.code === '42501' || /row-level security|permission denied|permiso/i.test(e.message || ''));
  function escapeHtmlVisor(str) {
    const d = document.createElement('div');
    d.textContent = str == null ? '' : String(str);
    return d.innerHTML;
  }
  function fmtVisor(n) {
    return '$' + (Number(n) || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }
  // (Este script es aparte: la versión de la app principal no se ve desde aquí)
  function ghFechaLocal(d) {
    d = d || new Date();
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }
  function diaCortoVisor(fechaStr) {
    const d = new Date(fechaStr + 'T00:00:00');
    if (isNaN(d)) return fechaStr;
    const dias = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
    return `${dias[d.getDay()]} ${d.getDate()}`;
  }
  function weekKeyVisor(fechaStr) {
    const d = new Date(fechaStr + 'T00:00:00');
    if (isNaN(d)) return '';
    const day = (d.getDay() + 6) % 7;
    const lunes = new Date(d); lunes.setDate(d.getDate() - day);
    return ghFechaLocal(lunes);
  }
  function weekRangoVisor(weekKey) {
    const lunes = new Date(weekKey + 'T00:00:00');
    const domingo = new Date(lunes); domingo.setDate(lunes.getDate() + 6);
    return { inicio: weekKey, fin: ghFechaLocal(domingo) };
  }
  function fechaCortaVisor(fechaStr) {
    const d = new Date(fechaStr + 'T00:00:00');
    if (isNaN(d)) return fechaStr;
    const meses = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
    return `${d.getDate()} ${meses[d.getMonth()]} ${d.getFullYear()}`;
  }

  async function aplicarModoVisorMultiCuenta() {
    // 1. ¿A qué bases de datos tiene acceso? (el admin las eligió en Ajustes → Avanzado → Usuarios)
    let cuentas = null;
    try { if (typeof window.GH_MIS_CUENTAS_VISOR === 'function') cuentas = await window.GH_MIS_CUENTAS_VISOR(); } catch (e) {}
    if (!Array.isArray(cuentas) || cuentas.length === 0) {
      // Respaldo: si nunca se configuró una lista, usar solo su base de datos de siempre (como antes)
      const activa = (typeof window.GH_GET_CUENTA === 'function') ? window.GH_GET_CUENTA() : 'principal';
      cuentas = [activa];
    }

    // 2. Nombres amigables de cada base de datos
    let listaNombres = [];
    try {
      const r = await window.storage.get('__cuentas_lista');
      listaNombres = JSON.parse(r.value) || [];
    } catch (e) {}
    const ocultas = new Set((listaNombres || []).filter((c) => c && c.escondida).map((c) => c.codigo));
    const visibles = cuentas.filter((c) => !ocultas.has(c));
    if (visibles.length) cuentas = visibles;
    const nombreDe = (codigo) => {
      const enc = listaNombres.find((c) => c.codigo === codigo);
      if (enc && enc.nombre) return enc.nombre;
      return codigo === 'principal' ? 'Principal' : codigo;
    };

    // 3. Cargar SOLO el check-in de cada base de datos permitida (trae los
    //    nombres de los trabajadores, sin sueldos ni nada más)
    const datosPorCuenta = {};
    await Promise.all(cuentas.map(async (codigo) => {
      let checkin = null, sinSenal = false;
      try { const r = await window.GH_LEER_DE_CUENTA(codigo, CHK_KEY); checkin = r ? JSON.parse(r) : {}; }
      catch (e) { sinSenal = true; checkin = chkCopiaLeer(codigo); }
      if (!checkin || typeof checkin !== 'object' || Array.isArray(checkin)) checkin = {};
      if (!sinSenal) chkCopiaGuardar(codigo, checkin);
      datosPorCuenta[codigo] = { nombre: nombreDe(codigo), checkin, sinSenal, leidoEn: sinSenal ? null : new Date().toISOString() };
    }));

    construirInterfazVisor(cuentas, datosPorCuenta);
  }

  function construirInterfazVisor(cuentas, datosPorCuenta) {
    // Ocultar el nav y los paneles normales de la app directamente por JS
    // (más confiable que una hoja de estilos, que puede perder la pelea de
    // especificidad contra el CSS grande de la app).
    document.querySelectorAll('nav.gc-nav > .gc-tab').forEach((t) => {
      t.style.setProperty('display', 'none', 'important');
    });
    document.querySelectorAll('.gc-body > .gc-panel').forEach((p) => {
      p.style.setProperty('display', 'none', 'important');
    });
    document.body.classList.add('gh-modo-visor2');

    const nav = document.querySelector('nav.gc-nav');
    const body = document.querySelector('.gc-body');
    if (!nav || !body) return;

    // ---- Botones de navegación: uno por base de datos + "Ajustes" al final ----
    cuentas.forEach((codigo, i) => {
      const btn = document.createElement('button');
      btn.className = 'gc-tab visor-tab' + (i === 0 ? ' active' : '');
      btn.dataset.visorCuenta = codigo;
      btn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="3.5" width="16" height="17" rx="2.5"/><path d="m8.5 12.5 2.5 2.5 4.5-5"/></svg>';
      btn.appendChild(document.createTextNode(datosPorCuenta[codigo].nombre));
      btn.addEventListener('click', () => activarPanelVisor(codigo));
      nav.appendChild(btn);
    });
    const btnAjustes = document.createElement('button');
    btnAjustes.className = 'gc-tab visor-tab';
    btnAjustes.dataset.visorCuenta = '__ajustes';
    btnAjustes.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/></svg>Mi cuenta';
    btnAjustes.addEventListener('click', () => activarPanelVisor('__ajustes'));
    nav.appendChild(btnAjustes);

    // ---- Un panel por base de datos (Invoices guardados + Recibo semanal) ----
    cuentas.forEach((codigo, i) => {
      const d = datosPorCuenta[codigo];
      const panel = document.createElement('div');
      panel.className = 'gc-panel visor-panel' + (i === 0 ? ' active' : '');
      panel.dataset.visorCuenta = codigo;
      panel.innerHTML = `<div class="chk-cont"></div>`;
      body.appendChild(panel);
      montarCheckinVisor(panel.querySelector('.chk-cont'), codigo, d);
    });

    // ---- Panel de Ajustes (color de acento + cerrar sesión) ----
    const panelAjustes = document.createElement('div');
    panelAjustes.className = 'gc-panel visor-panel';
    panelAjustes.dataset.visorCuenta = '__ajustes';
    const vzNombre = window.GH_NOMBRE || 'Usuario';
    panelAjustes.innerHTML = `
      <section class="vz-perfil">
        <span class="vz-av grande" style="--c:${vzColor(vzNombre)}">${escapeHtmlVisor(vzIniciales(vzNombre))}</span>
        <div><b>${escapeHtmlVisor(vzNombre)}</b><span>Check-in · ${cuentas.map((c) => escapeHtmlVisor(datosPorCuenta[c].nombre)).join(', ')}</span></div>
      </section>

      <div class="vz-card vz-aj">
        <p class="vz-aj-tit">Apariencia</p>
        <div class="gh-tema-seg">
          <button type="button" data-tema-opt="auto"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="9"/><path d="M12 3v18" /><path d="M12 3a9 9 0 0 1 0 18z" fill="currentColor"/></svg>Automático</button>
          <button type="button" data-tema-opt="claro"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>Claro</button>
          <button type="button" data-tema-opt="oscuro"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z"/></svg>Oscuro</button>
        </div>
        <p class="vz-aj-sub">Color</p>
        <div id="visor-accent-picker" class="vz-sws"><button type="button" class="visor-accent-sw" data-accent="cobre" title="Cobre" style="--sw:linear-gradient(135deg,#C46E20,#A2560F);"></button><button type="button" class="visor-accent-sw" data-accent="teal" title="Teal" style="--sw:linear-gradient(135deg,#0E8F82,#0B6F65);"></button><button type="button" class="visor-accent-sw" data-accent="indigo" title="Índigo" style="--sw:linear-gradient(135deg,#4F6FA8,#3A5486);"></button><button type="button" class="visor-accent-sw" data-accent="verde" title="Verde" style="--sw:linear-gradient(135deg,#4E9350,#397239);"></button><button type="button" class="visor-accent-sw" data-accent="azul" title="Azul" style="--sw:linear-gradient(135deg,#2F7BD9,#1F5FB0);"></button><button type="button" class="visor-accent-sw" data-accent="rojo" title="Rojo" style="--sw:linear-gradient(135deg,#C8402F,#A02E20);"></button><button type="button" class="visor-accent-sw" data-accent="morado" title="Morado" style="--sw:linear-gradient(135deg,#7A4FB5,#5E3990);"></button><button type="button" class="visor-accent-sw" data-accent="grafito" title="Grafito" style="--sw:linear-gradient(135deg,#4A4D55,#22242A);"></button></div>
      </div>

      <div class="vz-card vz-aj">
        <p class="vz-aj-tit">Seguridad</p>
        <button type="button" class="vz-aj-fila" id="visor-btn-cambiar-clave"><span>Cambiar contraseña</span><i>›</i></button>
        <div id="visor-cambiar-clave-form" class="vz-clave" style="display:none;">
          <div class="gc-field"><label>Contraseña actual</label><input type="password" id="visor-clave-actual" autocomplete="current-password"></div>
          <div class="gc-field"><label>Contraseña nueva</label><input type="password" id="visor-clave-nueva" autocomplete="new-password"><small>Al menos 6 caracteres, con letras y números.</small></div>
          <div class="gc-field"><label>Repite la nueva</label><input type="password" id="visor-clave-nueva2" autocomplete="new-password"></div>
          <div id="visor-clave-msg" class="vz-clave-msg"></div>
          <div class="vz-clave-btns"><button type="button" class="vz-add-cancel" id="visor-btn-cancelar-clave">Cancelar</button><button type="button" class="vz-add-ok" id="visor-btn-guardar-clave">Guardar</button></div>
        </div>
      </div>

      <button type="button" class="vz-salir" id="visor-btn-cerrar-sesion">Cerrar sesión</button>
    `;
    body.appendChild(panelAjustes);

    // ---- Cambiar contraseña (modo visor) ----
    if (typeof window.GH_CAMBIAR_CONTRASENA === 'function') {
      const vForm = panelAjustes.querySelector('#visor-cambiar-clave-form');
      const vMsg = panelAjustes.querySelector('#visor-clave-msg');
      const vLimpiar = () => {
        ['visor-clave-actual', 'visor-clave-nueva', 'visor-clave-nueva2'].forEach((id) => { const el = panelAjustes.querySelector('#' + id); if (el) el.value = ''; });
        if (vMsg) { vMsg.textContent = ''; vMsg.style.color = 'var(--ember)'; }
      };
      panelAjustes.querySelector('#visor-btn-cambiar-clave').addEventListener('click', () => {
        vForm.style.display = vForm.style.display === 'none' ? 'block' : 'none';
        if (vForm.style.display === 'block') { vLimpiar(); panelAjustes.querySelector('#visor-clave-actual').focus(); }
      });
      panelAjustes.querySelector('#visor-btn-cancelar-clave').addEventListener('click', () => { vForm.style.display = 'none'; vLimpiar(); });
      panelAjustes.querySelector('#visor-btn-guardar-clave').addEventListener('click', async () => {
        const actual = panelAjustes.querySelector('#visor-clave-actual').value;
        const nueva = panelAjustes.querySelector('#visor-clave-nueva').value;
        const nueva2 = panelAjustes.querySelector('#visor-clave-nueva2').value;
        vMsg.style.color = 'var(--ember)';
        if (!actual || !nueva || !nueva2) { vMsg.textContent = 'Llena los tres campos.'; return; }
        if (nueva.length < 6) { vMsg.textContent = 'La nueva debe tener al menos 6 caracteres.'; return; }
        if (!(/[a-zA-Z]/.test(nueva) && /[0-9]/.test(nueva))) { vMsg.textContent = 'La nueva debe tener letras y números.'; return; }
        if (nueva !== nueva2) { vMsg.textContent = 'Las dos contraseñas nuevas no coinciden.'; return; }
        if (nueva === actual) { vMsg.textContent = 'La nueva no puede ser igual a la actual.'; return; }
        const bg = panelAjustes.querySelector('#visor-btn-guardar-clave');
        bg.disabled = true; vMsg.style.color = 'var(--muted)'; vMsg.textContent = 'Guardando…';
        const r = await window.GH_CAMBIAR_CONTRASENA(actual, nueva);
        bg.disabled = false;
        if (r && r.ok) { vForm.style.display = 'none'; vLimpiar(); toast('Contraseña cambiada ✓', 'success', 3000); }
        else { vMsg.style.color = 'var(--ember)'; vMsg.textContent = (r && r.error) || 'No se pudo cambiar.'; }
      });
    }

    // Color de acento (mismo sistema de guardado que el resto de la app: por cuenta, en la nube)
    function aplicarAcentoVisor(nombre) {
      if (nombre === 'cobre') document.documentElement.removeAttribute('data-accent');
      else document.documentElement.setAttribute('data-accent', nombre);
      panelAjustes.querySelectorAll('.visor-accent-sw').forEach((sw) => {
        sw.classList.toggle('active', sw.dataset.accent === nombre);
      });
    }
    (() => {
      let guardado = 'cobre';
      try { guardado = localStorage.getItem('gh-accent-visor') || 'cobre'; } catch (e) {}
      aplicarAcentoVisor(guardado);
    })();
    if (window.GH_TEMA) window.GH_TEMA.aplicar();
    panelAjustes.querySelectorAll('.visor-accent-sw').forEach((sw) => {
      sw.addEventListener('click', async () => {
        aplicarAcentoVisor(sw.dataset.accent);
        try { localStorage.setItem('gh-accent-visor', sw.dataset.accent); } catch (e) {}
      });
    });
    panelAjustes.querySelector('#visor-btn-cerrar-sesion').addEventListener('click', () => {
      if (typeof window.GH_CERRAR_SESION === 'function') window.GH_CERRAR_SESION();
    });

    function activarPanelVisor(codigo) {
      document.querySelectorAll('.visor-tab').forEach((t) => t.classList.toggle('active', t.dataset.visorCuenta === codigo));
      document.querySelectorAll('.visor-panel').forEach((p) => p.classList.toggle('active', p.dataset.visorCuenta === codigo));
    }

    document.body.classList.add('gh-modo-visor');
    aplicarBloqueoEdicionVisor();
  }

  // ============================================================
  // CHECK-IN — el visor marca quién vino y quién no, cada día.
  // Se guarda en "gh-checkin" de esa base de datos:
  //   { "2026-10-08": { v: { "Juan Pérez": 1, "Pedro": 0 }, por, en } }
  // (1 = vino, 0 = no vino, sin nombre = sin marcar). En Nómina →
  // Registrar pago esos días ya salen marcados para que el admin revise.
  // ============================================================
  const CHK_DIAS = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
  const CHK_MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
  const CHK_MAX_ATRAS = 13;   // se puede corregir hasta 2 semanas atrás
  function chkNombre(e) { return ((e && e.apellido) ? (e.nombre + ' ' + e.apellido) : ((e && e.nombre) || '')).trim(); }
  function chkSumarDias(iso, n) { const d = new Date(iso + 'T00:00:00'); d.setDate(d.getDate() + n); return ghFechaLocal(d); }
  function chkHora(isoTs) {
    const d = new Date(isoTs); if (isNaN(d)) return '';
    return d.toLocaleTimeString('es-MX', { hour: 'numeric', minute: '2-digit' });
  }

  const VZ_COLORES = ['#0E8F82', '#C46E20', '#4F6FA8', '#7A4FB5', '#C8402F', '#3F8F45', '#B8860B', '#2F7BD9'];
  function vzIniciales(n) {
    const p = String(n || '').trim().split(/\s+/).filter(Boolean);
    return ((p[0] || '?')[0] + (p.length > 1 ? p[p.length - 1][0] : (p[0] || '')[1] || '')).toUpperCase();
  }
  function vzColor(n) { let h = 0; for (const c of String(n)) h = (h * 31 + c.charCodeAt(0)) >>> 0; return VZ_COLORES[h % VZ_COLORES.length]; }
  // "Carlos Ruiz Pérez" → "Carlos R." (para la tabla de la semana)
  function vzCorto(n) { const p = String(n || '').trim().split(/\s+/); return p.length > 1 ? p[0] + ' ' + p[1][0] + '.' : (p[0] || ''); }
  function vzSaludo() { const h = new Date().getHours(); return h < 12 ? 'Buen día' : h < 19 ? 'Buenas tardes' : 'Buenas noches'; }

  function montarCheckinVisor(cont, codigo, d) {
    if (!cont) return;
    const hoy = ghFechaLocal(new Date());
    const minimo = chkSumarDias(hoy, -CHK_MAX_ATRAS);
    const PEND_KEY = 'gh-chk-pend-' + (window.GH_USER_ID || '') + '-' + codigo;   // cambios sin señal (se guardan al volver)
    try { const viejo = localStorage.getItem('gh-chk-pend-' + codigo); if (viejo && !localStorage.getItem(PEND_KEY)) { localStorage.setItem(PEND_KEY, viejo); } localStorage.removeItem('gh-chk-pend-' + codigo); } catch (e) {}
    let fecha = hoy;
    let vista = 'dia';                // 'dia' | 'semana'
    let filtro = '', chip = 'todos';  // búsqueda y filtro Vinieron / No vinieron
    let estado = '', estadoTipo = '';
    let deshacer = null;              // { dia, antes:{...} } después de un cambio grande
    let agregarAbierto = false, agregando = false;
    let guardando = 0;
    let pendientes = [];
    try { pendientes = JSON.parse(localStorage.getItem(PEND_KEY) || '[]') || []; } catch (e) { pendientes = []; }
    const guardarPend = () => { try { if (pendientes.length) localStorage.setItem(PEND_KEY, JSON.stringify(pendientes)); else localStorage.removeItem(PEND_KEY); } catch (e) {} };

    const norm = (x) => String(x || '').replace(/\s+/g, ' ').trim();
    const vibrar = () => { try { if (navigator.vibrate) navigator.vibrate(8); } catch (e) {} };
    const lunesDe = (iso) => { const x = new Date(iso + 'T00:00:00'); return chkSumarDias(iso, -((x.getDay() + 6) % 7)); };
    const sinAcentos = (t) => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
    const marcadosDe = (f) => ({ ...(((d.checkin[f] || {}).v) || {}) });
    const diaCorto = (f) => { const x = new Date(f + 'T00:00:00'); return `${CHK_DIAS[x.getDay()].slice(0, 3).toLowerCase()} ${x.getDate()}`; };
    const trabajadores = (extraDias) => {
      const lista = Array.isArray(d.checkin._trab) ? d.checkin._trab : [];
      const nuevos = Array.isArray(d.checkin._nuevos) ? d.checkin._nuevos : [];
      const delDia = [];
      (extraDias || [fecha]).forEach((f) => delDia.push(...Object.keys(marcadosDe(f))));
      return [...new Set([...lista, ...nuevos, ...delDia].map(norm).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'es'));
    };
    // Orden: arriba los que más vienen a trabajar, abajo los que menos.
    // Se cuentan los días que vinieron en las últimas 8 semanas, SIN contar
    // los días que se están marcando (así la lista no brinca al tocar a alguien).
    // Si empatan, por nombre.
    const porFrecuencia = (nombres, excluir) => {
      const fuera = new Set(excluir || []);
      const desde = chkSumarDias(hoy, -56);
      const cuenta = {};
      Object.keys(d.checkin).forEach((f) => {
        if (!/^\d{4}-\d{2}-\d{2}$/.test(f) || f < desde || fuera.has(f)) return;
        const v = (d.checkin[f] || {}).v || {};
        Object.keys(v).forEach((n) => { if (v[n] === 1) { const k = norm(n); cuenta[k] = (cuenta[k] || 0) + 1; } });
      });
      return nombres.slice().sort((a, b) => ((cuenta[b] || 0) - (cuenta[a] || 0)) || a.localeCompare(b, 'es'));
    };
    // último día anterior (hasta 7 atrás) que tenga check-in, para "Igual que…"
    const diaAnteriorConDatos = () => {
      for (let k = 1; k <= 7; k++) { const f = chkSumarDias(fecha, -k); if (f < minimo) break; if (Object.keys(marcadosDe(f)).length) return f; }
      return '';
    };

    function aplicarFiltro() {
      const q = sinAcentos(filtro.trim());
      let visibles = 0;
      cont.querySelectorAll('.chk-fila').forEach((f) => {
        const okQ = !q || sinAcentos(f.dataset.n).includes(q);
        const si = f.classList.contains('es-si');
        const okC = chip === 'todos' || (chip === 'si' ? si : !si);
        const ok = okQ && okC;
        f.style.display = ok ? '' : 'none';
        if (ok) visibles++;
      });
      const vacio = cont.querySelector('.vz-sinres');
      if (vacio) vacio.style.display = visibles ? 'none' : '';
    }

    function htmlHero(si, total) {
      const pct = total ? si / total : 0;
      const lunes = lunesDe(fecha);
      const letras = ['L', 'M', 'M', 'J', 'V', 'S', 'D'];
      const dias = letras.map((l, i) => {
        const f = chkSumarDias(lunes, i);
        const n = Object.keys(marcadosDe(f)).length;
        const off = f > hoy || f < minimo;
        return `<button type="button" class="vz-dia${f === fecha && vista === 'dia' ? ' on' : ''}${f === hoy ? ' hoy' : ''}" data-f="${f}" ${off ? 'disabled' : ''} aria-label="${CHK_DIAS[new Date(f + 'T00:00:00').getDay()]} ${Number(f.slice(8))}">
          <span class="l">${l}</span><span class="n">${Number(f.slice(8))}</span><span class="c">${n ? n : ''}</span></button>`;
      }).join('');
      const sinSenal = pendientes.length
        ? `<div class="vz-offline">Sin señal · ${pendientes.length} cambio${pendientes.length === 1 ? '' : 's'} por guardar</div>`
        : d.sinSenal ? `<div class="vz-offline">Sin señal · viendo lo último guardado</div>`
        : d.leidoEn ? `<button type="button" class="vz-act" title="Traer lo que marcaron desde otro teléfono">Actualizado ${chkHora(d.leidoEn)} <span aria-hidden="true">⟳</span></button>` : '';
      return `
        <section class="vz-hero">
          <div class="vz-hero-top">
            <div class="vz-hero-txt">
              <div class="vz-saludo">${vzSaludo()}${window.GH_NOMBRE ? ', ' + escapeHtmlVisor(window.GH_NOMBRE) : ''}</div>
              <div class="vz-base"><i></i>${escapeHtmlVisor(d.nombre)}</div>
              ${sinSenal}
            </div>
            <div class="vz-ring" style="--p:${(pct * 100).toFixed(1)}" role="img" aria-label="${si} de ${total} vinieron">
              <div><b>${si}</b><span>de ${total}</span></div>
            </div>
          </div>
          <div class="vz-semana">
            <button type="button" class="vz-sem-nav chk-nav" data-nav="-7" aria-label="Semana anterior" ${lunes <= minimo ? 'disabled' : ''}>‹</button>
            <div class="vz-dias">${dias}</div>
            <button type="button" class="vz-sem-nav chk-nav" data-nav="7" aria-label="Semana siguiente" ${chkSumarDias(lunes, 7) > hoy ? 'disabled' : ''}>›</button>
          </div>
          <div class="vz-vista" role="tablist">
            <button type="button" data-vista="dia" class="${vista === 'dia' ? 'on' : ''}">Día</button>
            <button type="button" data-vista="semana" class="${vista === 'semana' ? 'on' : ''}">Semana</button>
            <button type="button" data-vista="imprimir" class="${vista === 'imprimir' ? 'on' : ''}">🖨 Imprimir</button>
          </div>
        </section>`;
    }

    function htmlEstado(quien) {
      const btnDeshacer = deshacer && deshacer.dia === fecha ? ' <button type="button" class="vz-deshacer">Deshacer</button>' : '';
      return `<div class="chk-estado vz-estado ${estadoTipo}">${estado || quien}${btnDeshacer}</div>`;
    }

    function htmlAgregar(total) {
      const valAdd = (cont.querySelector('.chk-add-in') || {}).value || '';
      return agregarAbierto || !total ? `
          <form class="chk-add vz-add" autocomplete="off">
            <input type="text" class="chk-add-in" maxlength="60" placeholder="Nombre del trabajador nuevo" aria-label="Nombre del trabajador nuevo" value="${escapeHtmlVisor(valAdd)}" ${agregando ? 'disabled' : ''}>
            <div class="vz-add-btns">
              ${total ? `<button type="button" class="vz-add-cancel">Cancelar</button>` : ''}
              <button type="submit" class="vz-add-ok" ${agregando ? 'disabled' : ''}>${agregando ? 'Agregando…' : 'Agregar'}</button>
            </div>
            <p class="vz-add-nota">Se marca como que vino ${vista === 'semana' ? 'hoy' : 'este día'}. El sueldo lo pone el administrador.</p>
          </form>`
        : `<button type="button" class="vz-add-abrir">+ Agregar trabajador nuevo</button>`;
    }

    function renderDia() {
      const nombres = porFrecuencia(trabajadores(), [fecha]);
      const reg = d.checkin[fecha] || { v: {} };
      const v = reg.v || {};
      const si = nombres.filter((n) => v[n] === 1).length;
      const total = nombres.length;
      const pct = total ? si / total : 0;
      const dt = new Date(fecha + 'T00:00:00');
      const etiqueta = fecha === hoy ? 'Hoy' : fecha === chkSumarDias(hoy, -1) ? 'Ayer' : '';
      const quien = reg.por ? `Marcado por ${escapeHtmlVisor(reg.por)}${reg.en ? ' · ' + chkHora(reg.en) : ''}` : 'Toca a los que vinieron';
      const ant = !si ? diaAnteriorConDatos() : '';
      const nAnt = ant ? Object.keys(marcadosDe(ant)).filter((n) => nombres.includes(n)).length : 0;
      return htmlHero(si, total) + `
        <div class="vz-dia-head">
          <div style="min-width:0;">
            <div class="vz-fecha">${etiqueta ? `<span class="vz-chip">${etiqueta}</span>` : ''}${CHK_DIAS[dt.getDay()]} ${dt.getDate()} de ${CHK_MESES[dt.getMonth()]}</div>
            ${htmlEstado(quien)}
          </div>
          ${total ? `<button type="button" class="vz-todos chk-todos" data-todos="${si < total ? 1 : 0}">${si < total ? '✓ Todos' : 'Quitar todos'}</button>` : ''}
        </div>
        ${ant && nAnt ? `<button type="button" class="vz-copiar" data-de="${ant}"><span>↺</span> Igual que ${fecha !== hoy || ant !== chkSumarDias(hoy, -1) ? diaCorto(ant) : 'ayer'} <b>${nAnt}</b></button>` : ''}
        <div class="vz-card">
          ${total ? `
          <div class="vz-chips" role="tablist">
            <button type="button" data-chip="todos" class="${chip === 'todos' ? 'on' : ''}">Todos <b>${total}</b></button>
            <button type="button" data-chip="si" class="si ${chip === 'si' ? 'on' : ''}">Vinieron <b>${si}</b></button>
            <button type="button" data-chip="no" class="no ${chip === 'no' ? 'on' : ''}">${si ? 'No vinieron' : 'Sin marcar'} <b>${total - si}</b></button>
          </div>
          <div class="vz-barra" aria-hidden="true"><i style="width:${(pct * 100).toFixed(1)}%"></i></div>
          ${total > 6 ? `<label class="vz-buscar"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg><input type="search" class="vz-q" placeholder="Buscar trabajador" value="${escapeHtmlVisor(filtro)}" autocomplete="off" enterkeyhint="search"></label>` : ''}
          <div class="vz-lista">
            ${nombres.map((n) => `
              <button type="button" class="chk-fila vz-fila${v[n] === 1 ? ' es-si' : ''}" data-n="${escapeHtmlVisor(n)}" aria-pressed="${v[n] === 1}">
                <span class="vz-av" style="--c:${vzColor(n)}">${escapeHtmlVisor(vzIniciales(n))}</span>
                <span class="chk-nom vz-nom">${escapeHtmlVisor(n)}<small>${v[n] === 1 ? 'Vino' : si ? 'No vino' : 'Sin marcar'}</small></span>
                <span class="vz-check" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"><path d="m5 12.5 4.5 4.5L19 7.5"/></svg></span>
              </button>`).join('')}
            <div class="vz-sinres" style="display:none;">Nadie aquí.</div>
          </div>`
          : `<div class="vz-vacio"><div class="vz-vacio-ic">👷</div><b>Todavía no hay trabajadores</b><span>Agrega al primero aquí abajo.</span></div>`}
          ${htmlAgregar(total)}
        </div>
        ${si ? `<button type="button" class="vz-compartir"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v12M7 8l5-5 5 5"/><path d="M5 13v6a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-6"/></svg>Compartir el check-in del día</button>` : ''}`;
    }

    function renderSemana() {
      const lunes = lunesDe(fecha);
      const fechas = [0, 1, 2, 3, 4, 5, 6].map((k) => chkSumarDias(lunes, k));
      const nombres = porFrecuencia(trabajadores(fechas), fechas);
      const letras = ['L', 'M', 'M', 'J', 'V', 'S', 'D'];
      const marcas = fechas.map((f) => marcadosDe(f));
      const totDia = marcas.map((m) => nombres.filter((n) => m[n] === 1).length);
      const siHoy = nombres.filter((n) => marcadosDe(fecha)[n] === 1).length;
      const totSemana = totDia.reduce((a, b) => a + b, 0);
      const ultimo = new Date(fechas[6] + 'T00:00:00');
      const prim = new Date(fechas[0] + 'T00:00:00');
      return htmlHero(siHoy, nombres.length) + `
        <div class="vz-dia-head">
          <div style="min-width:0;">
            <div class="vz-fecha">Semana del ${prim.getDate()}${prim.getMonth() !== ultimo.getMonth() ? ' de ' + CHK_MESES[prim.getMonth()] : ''} al ${ultimo.getDate()} de ${CHK_MESES[ultimo.getMonth()]}</div>
            ${htmlEstado(`${totSemana} día${totSemana === 1 ? "" : "s"} trabajado${totSemana === 1 ? "" : "s"} en total · toca para corregir`)}
          </div>
        </div>
        <div class="vz-card vz-sem-card">
          ${nombres.length ? `
          <div class="vz-tabla" role="grid">
            <div class="vz-tr vz-th"><span class="vz-tn">Trabajador</span>${letras.map((l, i) => `<span class="${fechas[i] === hoy ? 'hoy' : ''}">${l}<small>${Number(fechas[i].slice(8))}</small></span>`).join('')}<span class="vz-tt">Días</span></div>
            ${nombres.map((n) => {
              const dn = marcas.filter((m) => m[n] === 1).length;
              return `<div class="vz-tr"><span class="vz-tn" title="${escapeHtmlVisor(n)}"><i class="vz-pt" style="--c:${vzColor(n)}"></i><em>${escapeHtmlVisor(vzCorto(n))}</em></span>${fechas.map((f, i) => {
                const off = f > hoy || f < minimo;
                const on = marcas[i][n] === 1;
                return `<button type="button" class="vz-cel${on ? ' on' : ''}" data-n="${escapeHtmlVisor(n)}" data-f="${f}" ${off ? 'disabled' : ''} aria-label="${escapeHtmlVisor(n)} ${diaCorto(f)}: ${on ? 'vino' : 'no vino'}">${on ? '✓' : ''}</button>`;
              }).join('')}<span class="vz-tt"><b>${dn}</b></span></div>`;
            }).join('')}
            <div class="vz-tr vz-tf"><span class="vz-tn">Vinieron</span>${totDia.map((t) => `<span>${t || ''}</span>`).join('')}<span class="vz-tt"><b>${totSemana}</b></span></div>
          </div>`
          : `<div class="vz-vacio"><div class="vz-vacio-ic">👷</div><b>Todavía no hay trabajadores</b><span>Agrega al primero aquí abajo.</span></div>`}
          ${htmlAgregar(nombres.length)}
        </div>
        ${totSemana ? `<button type="button" class="vz-compartir vz-compartir-sem"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v12M7 8l5-5 5 5"/><path d="M5 13v6a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-6"/></svg>Compartir la semana</button>` : ''}`;
    }

    function render() {
      const enfAdd = document.activeElement && document.activeElement.classList.contains('chk-add-in');
      const enfQ = document.activeElement && document.activeElement.classList.contains('vz-q');
      cont.innerHTML = vista === 'semana' ? renderSemana() : vista === 'imprimir' ? renderImprimir() : renderDia();
      if (filtro || chip !== 'todos') aplicarFiltro();
      if (enfAdd) { const i = cont.querySelector('.chk-add-in'); if (i) i.focus(); }
      if (enfQ) { const i = cont.querySelector('.vz-q'); if (i) { i.focus(); i.setSelectionRange(i.value.length, i.value.length); } }
      conectar();
    }

    function conectar() {
      const on = (sel, ev, fn) => cont.querySelectorAll(sel).forEach((el) => el.addEventListener(ev, (e) => fn(el, e)));
      on('.vz-dia', 'click', (b) => { if (b.disabled) return; fecha = b.dataset.f; vista = 'dia'; estado = ''; estadoTipo = ''; deshacer = null; render(); });
      on('.vz-sem-nav', 'click', (b) => {
        let nf = chkSumarDias(fecha, Number(b.dataset.nav));
        if (nf > hoy) nf = hoy;
        if (nf < minimo) nf = minimo;
        fecha = nf; estado = ''; estadoTipo = ''; deshacer = null; render();
      });
      on('.vz-vista button', 'click', (b) => { vista = b.dataset.vista; estado = ''; estadoTipo = ''; if (vista === 'imprimir') impCargar(); render(); });
      on('.vz-imp-buscar', 'input', (i) => { impFiltro = i.value; const l = cont.querySelector('.vz-imp-lista'); if (l) { l.outerHTML = htmlImpLista(); conectarImp(); } });
      conectarImp();
      on('.chk-fila', 'click', (b) => {
        const n = b.dataset.n; const v = marcadosDe(fecha);
        vibrar(); deshacer = null;
        guardar({ dia: fecha, marcar: { [n]: v[n] === 1 ? null : 1 } });
      });
      on('.vz-cel', 'click', (b) => {
        if (b.disabled) return;
        const v = marcadosDe(b.dataset.f);
        vibrar(); deshacer = null;
        guardar({ dia: b.dataset.f, marcar: { [b.dataset.n]: v[b.dataset.n] === 1 ? null : 1 } });
      });
      on('.chk-todos', 'click', (b) => {
        const nombres = trabajadores();
        const antes = marcadosDe(fecha);
        const marcar = {};
        nombres.forEach((n) => { marcar[n] = b.dataset.todos === '1' ? 1 : null; });
        vibrar();
        deshacer = { dia: fecha, antes };
        guardar({ dia: fecha, marcar }, b.dataset.todos === '1' ? 'Todos marcados ✓' : 'Se quitaron todos');
      });
      on('.vz-copiar', 'click', (b) => {
        const nombres = trabajadores();
        const de = marcadosDe(b.dataset.de);
        const antes = marcadosDe(fecha);
        const marcar = {};
        nombres.forEach((n) => { marcar[n] = de[n] === 1 ? 1 : null; });
        vibrar();
        deshacer = { dia: fecha, antes };
        guardar({ dia: fecha, marcar }, `Copiado de ${diaCorto(b.dataset.de)} ✓`);
      });
      on('.vz-deshacer', 'click', () => {
        if (!deshacer) return;
        const { dia, antes } = deshacer;
        const marcar = {};
        new Set([...Object.keys(marcadosDe(dia)), ...Object.keys(antes)]).forEach((n) => { marcar[n] = antes[n] === 1 ? 1 : null; });
        deshacer = null;
        guardar({ dia, marcar }, 'Listo, quedó como antes');
      });
      on('.vz-chips button', 'click', (b) => {
        chip = b.dataset.chip;
        cont.querySelectorAll('.vz-chips button').forEach((x) => x.classList.toggle('on', x === b));
        aplicarFiltro();
      });
      on('.vz-q', 'input', (q) => { filtro = q.value; aplicarFiltro(); });
      on('.vz-add-abrir', 'click', () => { agregarAbierto = true; render(); const i = cont.querySelector('.chk-add-in'); if (i) i.focus(); });
      on('.vz-add-cancel', 'click', () => { agregarAbierto = false; const i = cont.querySelector('.chk-add-in'); if (i) i.value = ''; render(); });
      on('.chk-add', 'submit', (form, e) => {
        e.preventDefault();
        const inp = cont.querySelector('.chk-add-in');
        const nombre = norm(inp.value);
        if (!nombre) { inp.focus(); return; }
        const ya = trabajadores().find((x) => x.toLowerCase() === nombre.toLowerCase());
        if (ya) { estado = `${escapeHtmlVisor(ya)} ya está en la lista.`; estadoTipo = 'aviso'; render(); return; }
        const dia = vista === 'semana' ? hoy : fecha;
        guardar({ dia, marcar: { [nombre]: 1 }, nuevo: nombre }, `${escapeHtmlVisor(nombre)} agregado ✓`);
      });
      on('.vz-compartir', 'click', (b) => (b.classList.contains('vz-compartir-sem') ? compartirSemana() : compartir()));
      on('.vz-act', 'click', async (b) => { b.disabled = true; b.textContent = 'Actualizando…'; await refrescar(true); render(); });
    }

    async function compartir() {
      const nombres = trabajadores();
      const v = marcadosDe(fecha);
      const si = nombres.filter((n) => v[n] === 1), no = nombres.filter((n) => v[n] !== 1);
      const dt = new Date(fecha + 'T00:00:00');
      const texto = `Check-in ${d.nombre} · ${CHK_DIAS[dt.getDay()]} ${dt.getDate()} de ${CHK_MESES[dt.getMonth()]}\n\n` +
        `✅ Vinieron (${si.length}):\n${si.map((n) => '• ' + n).join('\n') || '—'}\n\n` +
        `❌ No vinieron (${no.length}):\n${no.map((n) => '• ' + n).join('\n') || '—'}`;
      try {
        if (navigator.share) { await navigator.share({ text: texto }); return; }
      } catch (e) { if (e && e.name === 'AbortError') return; }
      try { await navigator.clipboard.writeText(texto); estado = 'Copiado — pégalo en WhatsApp'; estadoTipo = 'ok'; }
      catch (e) { estado = 'No se pudo compartir en este teléfono'; estadoTipo = 'error'; }
      render();
    }

    // ---- Imprimir hojas (completion sheets) y factura de un lote ----
    let imp = null, impCargando = false, impFiltro = '';
    async function impCargar() {
      if (impCargando) return; impCargando = true;
      const leer = async (k) => { try { const r = await window.GH_LEER_DE_CUENTA(codigo, k); return r ? JSON.parse(r) : null; } catch (e) { return undefined; } };
      const [hojas, facturas, cfg, layout] = await Promise.all([leer('gh-completion'), leer('gh-invoices'), leer('gh-factura-pub'), leer('gh-ps-layout')]);
      imp = { hojas: hojas && typeof hojas === 'object' ? hojas : {}, facturas: Array.isArray(facturas) ? facturas : [], cfg: cfg || null, layout: layout || null,
        sinSenal: hojas === undefined };
      impCargando = false;
      if (vista === 'imprimir') render();
    }
    function htmlImpLista() {
      if (!imp) return '<div class="vz-imp-lista"><div class="vz-sinres">Cargando…</div></div>';
      const q = window.GH_CSL_CLAVE ? window.GH_CSL_CLAVE(impFiltro) : '';
      const filas = Object.entries(imp.hojas).filter(([k, e]) => e && (!q || q.split('-').every((w) => k.split('-').some((x) => x.startsWith(w)))))
        .sort((a, b) => String(b[1].en || '').localeCompare(String(a[1].en || '')));
      if (!filas.length) {
        const msg = imp.sinSenal ? 'Sin señal: no se pudieron traer las hojas.'
          : Object.keys(imp.hojas).length ? 'Ningún lote coincide.' : 'Todavía no hay hojas guardadas en esta base (o el administrador aún no te dio permiso de verlas).';
        return `<div class="vz-imp-lista"><div class="vz-vacio"><span>${msg}</span></div></div>`;
      }
      return `<div class="vz-imp-lista">${filas.slice(0, 40).map(([k, e]) => {
        const facts = imp.facturas.filter((inv) => (inv.items || []).some((it) => window.GH_CSL_COINCIDE(k, it.location)));
        const hojas = [['rough', 'Rough-In'], ['trim', 'Trim-Out'], ['pull', 'Pull Sheet']].filter(([t]) => e[t]).map(([, n]) => n);
        return `<div class="vz-imp-fila"><div style="min-width:0;"><b>${escapeHtmlVisor(e.lote || k)}</b>
          <small>${escapeHtmlVisor(hojas.join(' · ') || 'Sin hojas')}${facts.length ? ' · Factura ' + facts.map((f) => '#' + escapeHtmlVisor(f.numero || '')).join(', ') : ''}</small></div>
          <button type="button" class="vz-imp-btn" data-k="${escapeHtmlVisor(k)}">🖨 Imprimir</button></div>`;
      }).join('')}</div>`;
    }
    function renderImprimir() {
      const nn = trabajadores(), vv = marcadosDe(fecha);
      return htmlHero(nn.filter((x) => vv[x] === 1).length, nn.length) + `
        <div class="vz-dia-head"><div style="min-width:0;"><div class="vz-fecha">Imprimir hojas</div>
          <div class="chk-estado vz-estado ${estadoTipo}">${estado || 'Busca el lote y toca Imprimir: salen sus completion sheets y su factura.'}</div></div></div>
        <div class="vz-card">
          <input type="search" class="vz-imp-buscar" placeholder="Buscar lote o colonia (ej. Greystone 165)" value="${escapeHtmlVisor(impFiltro)}" autocomplete="off" enterkeyhint="search">
          ${htmlImpLista()}
        </div>`;
    }
    function conectarImp() {
      cont.querySelectorAll('.vz-imp-btn').forEach((b) => b.addEventListener('click', () => {
        const e = imp && imp.hojas[b.dataset.k]; if (!e || !window.GH_IMPRIMIR_HOJAS) return;
        const facts = imp.facturas.filter((inv) => (inv.items || []).some((it) => window.GH_CSL_COINCIDE(b.dataset.k, it.location)));
        window.GH_IMPRIMIR_HOJAS({ entradas: [e], facturas: facts, doble: true, cfg: imp.cfg, layout: imp.layout, titulo: 'Hojas ' + (e.lote || '') });
      }));
    }

    async function compartirSemana() {
      const lunes = lunesDe(fecha);
      const fechas = [0, 1, 2, 3, 4, 5, 6].map((k) => chkSumarDias(lunes, k));
      const nombres = trabajadores(fechas);
      const ini = new Date(fechas[0] + 'T00:00:00'), fin = new Date(fechas[6] + 'T00:00:00');
      const lineas = nombres.map((n) => {
        const dias = fechas.filter((f) => marcadosDe(f)[n] === 1);
        return dias.length ? `• ${n}: ${dias.length} día${dias.length === 1 ? '' : 's'} (${dias.map(diaCorto).join(', ')})` : '';
      }).filter(Boolean);
      const texto = `Check-in ${d.nombre} · semana del ${ini.getDate()}${ini.getMonth() !== fin.getMonth() ? ' de ' + CHK_MESES[ini.getMonth()] : ''} al ${fin.getDate()} de ${CHK_MESES[fin.getMonth()]}\n\n${lineas.join('\n') || '—'}`;
      try { if (navigator.share) { await navigator.share({ text: texto }); return; } } catch (e) { if (e && e.name === 'AbortError') return; }
      try { await navigator.clipboard.writeText(texto); estado = 'Copiado — pégalo en WhatsApp'; estadoTipo = 'ok'; }
      catch (e) { estado = 'No se pudo compartir en este teléfono'; estadoTipo = 'error'; }
      render();
    }

    function aplicar(obj, cambio) {
      if (cambio.nuevo) {
        obj._nuevos = Array.isArray(obj._nuevos) ? obj._nuevos : [];
        if (!obj._nuevos.includes(cambio.nuevo)) obj._nuevos.push(cambio.nuevo);
        obj._trab = Array.isArray(obj._trab) ? obj._trab : [];
        if (!obj._trab.includes(cambio.nuevo)) obj._trab.push(cambio.nuevo);
      }
      const dia = cambio.dia;
      const reg = obj[dia] && typeof obj[dia] === 'object' ? obj[dia] : { v: {} };
      reg.v = reg.v || {};
      Object.entries(cambio.marcar || {}).forEach(([n, val]) => { if (val === 1) reg.v[n] = 1; else delete reg.v[n]; });
      // solo se guardan los que vinieron (los que no están marcados no fueron)
      Object.keys(reg.v).forEach((n) => { if (reg.v[n] !== 1) delete reg.v[n]; });
      reg.por = window.GH_NOMBRE || 'visor';
      reg.en = cambio.en || new Date().toISOString();
      if (Object.keys(reg.v).length) obj[dia] = reg; else delete obj[dia];
    }

    // Sube a la nube una lista de cambios (lee lo último y aplica encima)
    // Si otro teléfono guardó en el mismo instante, se vuelve a leer y se
    // aplica encima (antes el último en guardar borraba lo del otro).
    async function subir(cambios) {
      for (let intento = 0; ; intento++) {
        let actual = {};
        const r = await window.GH_LEER_DE_CUENTA(codigo, CHK_KEY);   // si no hay señal, esto falla
        try { actual = r ? JSON.parse(r) : {}; } catch (e) { actual = {}; }
        if (!actual || typeof actual !== 'object' || Array.isArray(actual)) actual = {};
        cambios.forEach((c) => aplicar(actual, c));
        const corte = chkSumarDias(hoy, -120);   // solo los últimos 120 días
        Object.keys(actual).forEach((k) => { if (/^\d{4}-\d{2}-\d{2}$/.test(k) && k < corte) delete actual[k]; });
        try { await window.GH_ESCRIBIR_EN_CUENTA(codigo, CHK_KEY, JSON.stringify(actual)); return actual; }
        catch (e) { if (!(e && e.conflicto) || intento >= 4) throw e; }
      }
    }

    let cola = Promise.resolve();
    let enCola = [];   // cambios tocados que todavía no se suben
    const reaplicarCola = () => enCola.forEach((c) => aplicar(d.checkin, c));
    function guardar(cambio, textoOk) {
      cambio.en = new Date().toISOString();
      enCola.push(cambio);
      aplicar(d.checkin, cambio);   // se ve al instante
      estado = 'Guardando…'; estadoTipo = 'guardando';
      if (cambio.nuevo) agregando = true;
      render();
      guardando++;
      cola = cola.then(async () => {
        try {
          // primero lo que se quedó pendiente sin señal, luego este cambio
          d.checkin = await subir([...pendientes, cambio]);
          chkCopiaGuardar(codigo, d.checkin); d.sinSenal = false; d.leidoEn = new Date().toISOString();
          enCola = enCola.filter((c) => c !== cambio);
          reaplicarCola();   // lo que tocó mientras se guardaba sigue viéndose
          pendientes = []; guardarPend();
          estado = textoOk || ('Guardado ✓ ' + chkHora(new Date().toISOString()));
          estadoTipo = 'ok';
          if (cambio.nuevo) { agregarAbierto = false; const i = cont.querySelector('.chk-add-in'); if (i) i.value = ''; }
        } catch (e) {
          enCola = enCola.filter((c) => c !== cambio);
          if (esSinPermiso(e)) {
            // No es falta de señal: el admin quitó el permiso. No se queda
            // esperando para siempre; se deshace en pantalla y se avisa.
            try { const r = await window.GH_LEER_DE_CUENTA(codigo, CHK_KEY); d.checkin = r ? JSON.parse(r) : d.checkin; } catch (e2) {}
            estado = 'No tienes permiso para marcar aquí. Pídele al administrador que te dé acceso.'; estadoTipo = 'error';
          } else {
            pendientes.push(cambio); guardarPend();
            estado = 'Sin señal — se guarda solo cuando vuelva'; estadoTipo = 'aviso';
          }
          if (cambio.nuevo) agregarAbierto = false;
        }
        agregando = false;
        guardando--;
        render();
      });
    }

    // Reintenta lo pendiente cuando vuelve la señal
    async function reintentar() {
      if (!pendientes.length || guardando) return;
      guardando++;
      cola = cola.then(async () => {
        try {
          d.checkin = await subir(pendientes);
          chkCopiaGuardar(codigo, d.checkin); d.sinSenal = false; d.leidoEn = new Date().toISOString();
          reaplicarCola();
          pendientes = []; guardarPend();
          estado = 'Ya se guardó lo que tenías pendiente ✓'; estadoTipo = 'ok';
        } catch (e) {
          if (esSinPermiso(e)) { pendientes = []; guardarPend(); estado = 'No tienes permiso para marcar aquí. Pídele al administrador que te dé acceso.'; estadoTipo = 'error'; }
        }
        guardando--;
        render();
      });
    }

    // Trae lo que otros marcaron desde otro teléfono (al volver a la app y cada minuto)
    async function refrescar(forzado) {
      if (guardando || pendientes.length || (document.hidden && !forzado)) return;
      try {
        const r = await window.GH_LEER_DE_CUENTA(codigo, CHK_KEY);
        const nuevo = r ? JSON.parse(r) : {};
        if (!nuevo || typeof nuevo !== 'object' || Array.isArray(nuevo)) return;
        const eraSinSenal = d.sinSenal;
        d.sinSenal = false; d.leidoEn = new Date().toISOString(); chkCopiaGuardar(codigo, nuevo);
        const act = cont.querySelector('.vz-act'); if (act && !forzado) act.firstChild.textContent = 'Actualizado ' + chkHora(d.leidoEn) + ' ';
        if (JSON.stringify(nuevo) === JSON.stringify(d.checkin)) { if (eraSinSenal || forzado) render(); return; }
        if (guardando) return;
        d.checkin = nuevo;
        const activo = document.activeElement;
        if (activo && cont.contains(activo) && /INPUT/.test(activo.tagName)) return; // no estorbar si está escribiendo
        render();
      } catch (e) { if (forzado) { d.sinSenal = true; estado = 'Sin señal — no se pudo actualizar'; estadoTipo = 'aviso'; } }
    }
    window.addEventListener('online', () => { reintentar(); refrescar(); });
    document.addEventListener('visibilitychange', () => { if (!document.hidden) { reintentar(); refrescar(); } });
    setInterval(() => { if (pendientes.length) reintentar(); else refrescar(); }, 60000);

    // Si quedó algo sin guardar de antes (sin señal), se muestra y se reintenta
    if (pendientes.length) { pendientes.forEach((c) => aplicar(d.checkin, c)); setTimeout(reintentar, 500); }
    render();
  }

  // Bloqueo de edición: por si algún elemento interactivo quedara dentro de
  // estos paneles nuevos, no se puede editar nada (todo es texto/tablas, pero
  // esto es un respaldo).
  function aplicarBloqueoEdicionVisor() {
    // El visor ya solo tiene su check-in; lo que puede guardar lo controla la
    // base de datos (solo "gh-checkin" de sus bases). No hace falta candado
    // aquí, y el viejo bloqueaba también el formulario de la contraseña.
    document.body.classList.add('gh-visor-v2');
  }
})();
