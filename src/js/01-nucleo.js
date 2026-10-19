  const KEY_MOV = 'movimientos';
  const KEY_CAT_GASTO = 'catGastos';
  const KEY_CAT_INGRESO = 'catIngresos';
  const KEY_INVOICES = 'invoicesGuardados';
  let TASA_TAXAS = 0.10;   // configurable en Ajustes → Avanzado → Socios

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
  // La semana elegida decide en qué semana (invoice) cuenta el ingreso; la
  // FECHA es el día en que se metió el cobro (antes se ponía el viernes de esa
  // semana y el cobro quedaba con fecha atrasada).
  let ingresoSemanaKey = '';
  function actualizarSemanaIngreso() {
    const base = new Date();
    base.setDate(base.getDate() + ingresoSemanaOffset * 7);
    const baseIso = ghFechaLocal(base);
    const monday = mondayOf(baseIso);
    const friday = new Date(monday);
    friday.setDate(monday.getDate() + 4);
    ingresoSemanaKey = ghFechaLocal(monday);
    $('ingreso-semana-label').textContent = labelSemanaLunesAViernes(monday, friday);
  }
  // Fecha con la que se agrupa un movimiento por semana: la semana elegida
  // (ingresos) o su fecha
  function movRefSemana(m) { return (m && m.semana) || (m && m.fecha) || today(); }

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

