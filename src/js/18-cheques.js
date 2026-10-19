  // ===================== CHEQUES =====================
  // Imprime en cheques láser de hoja carta (cheque de 8½" x 3½" + 2 talones).
  // Dos formatos: cheque EN MEDIO (talón arriba y abajo, como el papel
  // "M/P CHECK" de Bank of America) o cheque ARRIBA (dos talones abajo).
  // Solo se imprime lo que falta (fecha, cantidad, a quién, letras, memo):
  // el banco, la cuenta y el número ya vienen impresos en el papel.
  // Las posiciones son en pulgadas desde la esquina de arriba a la izquierda
  // del cheque; el ajuste en mm mueve todo junto.
  // Registro de cheques/Zelle/cash: UNO SOLO para todas las bases de datos.
  // Las claves que empiezan con "__" no llevan el prefijo de la base y en la
  // nube solo el admin las puede leer o escribir.
  const CHQ_KEY = '__gh-cheques';
  const CHQ_CFG_KEY = '__gh-cheques-cfg';
  const CHQ_KEY_VIEJO = 'gh-cheques';         // antes: un registro por base
  const CHQ_CFG_KEY_VIEJO = 'gh-cheques-cfg';
  const CHQ_FORMATOS = {
    // Cheque en medio (papel M/P CHECK): el cheque empieza a 3½" del borde de arriba
    medio: {
      cheque: 3.5,
      pos: {
        fecha:  { x: 5.95, y: 0.85 },
        monto:  { x: 7.25, y: 0.85 },
        letras: { x: 0.80, y: 1.32 },
        a:      { x: 1.05, y: 1.95 },
        memo:   { x: 0.80, y: 2.55 }
      },
      // talones: debajo del nombre que ya viene impreso arriba de cada uno
      talones: [{ top: 0.55, alto: 2.75 }, { top: 7.45, alto: 3.0 }],
      // espacio del papel que le toca a cada talón (nunca se pasa de ahí)
      zonas: [{ ini: 0.3, fin: 3.38 }, { ini: 7.12, fin: 10.5 }],
      guias: [{ top: 0, alto: 3.5, txt: 'Stub 1' }, { top: 3.5, alto: 3.5, txt: 'Check 8½" x 3½" — TEST PRINT, NOT A CHECK' }, { top: 7, alto: 4, txt: 'Stub 2' }]
    },
    // Cheque arriba (el formato que usaba la app antes)
    arriba: {
      cheque: 0,
      pos: {
        fecha:  { x: 5.95, y: 1.30 },
        monto:  { x: 7.30, y: 1.30 },
        letras: { x: 0.80, y: 1.50 },
        a:      { x: 1.00, y: 1.98 },
        memo:   { x: 0.80, y: 2.82 }
      },
      talones: [{ top: 3.85, alto: 3.15 }, { top: 7.6, alto: 3.15 }],
      zonas: [{ ini: 3.62, fin: 7.15 }, { ini: 7.37, fin: 10.85 }],
      guias: [{ top: 0, alto: 3.5, txt: 'Check 8½" x 3½" — TEST PRINT, NOT A CHECK' }, { top: 3.5, alto: 3.75, txt: 'Stub 1' }, { top: 7.25, alto: 3.75, txt: 'Stub 2' }]
    }
  };
  const chqFormato = () => CHQ_FORMATOS[chqCfg.posicion] || CHQ_FORMATOS.medio;
  // Ajuste por separado de cada parte (mm, + = derecha / abajo), además del "mover todo"
  const CHQ_PARTES = [['fecha', 'Fecha'], ['monto', 'Cantidad ($)'], ['letras', 'Cantidad en letras'], ['a', 'Nombre (a quién)'], ['memo', 'Memo'], ['talon1', 'Talón de arriba'], ['talon2', 'Talón de abajo']];
  const chqAj = (k) => { const a = (chqCfg.ajustes || {})[k] || {}; return { x: (Number(a.x) || 0) / 25.4, y: (Number(a.y) || 0) / 25.4 }; };
  function chqRenderAjustes() {
    const cont = $('chq-ajustes-partes'); if (!cont) return;
    const aj = chqCfg.ajustes || {};
    cont.innerHTML = CHQ_PARTES.map(([k, nom]) => `<div class="chq-aj-fila"><span>${nom}</span>
      <label>→ <input type="number" step="0.5" inputmode="decimal" data-aj="${k}" data-eje="x" value="${Number((aj[k] || {}).x) || 0}"></label>
      <label>↓ <input type="number" step="0.5" inputmode="decimal" data-aj="${k}" data-eje="y" value="${Number((aj[k] || {}).y) || 0}"></label></div>`).join('');
    cont.querySelectorAll('input').forEach((i) => i.addEventListener('change', chqLeerAjustes));
  }
  function chqLeerAjustes() {
    const aj = {};
    document.querySelectorAll('#chq-ajustes-partes input').forEach((i) => {
      const v = parseFloat(i.value) || 0;
      if (!aj[i.dataset.aj]) aj[i.dataset.aj] = { x: 0, y: 0 };
      aj[i.dataset.aj][i.dataset.eje] = v;
    });
    chqCfg.ajustes = aj;
  }
  let chqLista = [];
  let chqCfg = { siguiente: 2000, offX: 0, offY: 0, talones: 'si', posicion: 'medio' };
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
      const [docs, emps, cfg, invs] = await Promise.all([leer(c.codigo, 'gh-nomina'), leer(c.codigo, 'empleados'), leer(c.codigo, 'gh-config').then((v) => v || leer(c.codigo, 'kontaly-config')), leer(c.codigo, KEY_INVOICES)]);
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
    const dir = $('chq-pv-dir'); if (dir) dir.textContent = (typeof cfgFacturaDireccion !== 'undefined' && cfgFacturaDireccion) || '';
    const micr = $('chq-pv-micr'); if (micr) micr.textContent = String($('chq-numero').value || '').padStart(6, '0');
    // Resumen de lo que cubre el cheque (pagos de nómina marcados)
    const tot = $('chq-pv-total');
    if (tot) {
      let marcados = []; try { marcados = chqPagosMarcados(); } catch (e) {}
      const nGan = (() => { try { return chqGananciasMarcadas().length; } catch (e) { return 0; } })();
      const n = marcados.length + nGan;
      tot.hidden = !n;
      if (n) tot.innerHTML = `<span>Cubre <b>${n}</b> pago${n === 1 ? '' : 's'} de nómina</span><b>${nomFmt(m > 0 ? m : 0)}</b>`;
    }
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
    $('chq-posicion').value = CHQ_FORMATOS[chqCfg.posicion] ? chqCfg.posicion : 'medio';
    chqRenderAjustes();
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
  // Meses que el usuario abrió o cerró a mano (se respeta al volver a dibujar)
  const payMesesEstado = {};
  function payListaPorMes(lista, filaFn, op) {
    op = op || {};
    const id = op.id || 'x', todos = !!op.todosAbiertos;
    const meses = [];
    lista.forEach((c) => {
      const k = String(c.fecha || '').slice(0, 7) || 'sin';
      let g = meses[meses.length - 1];
      if (!g || g.k !== k) { g = { k, items: [] }; meses.push(g); }
      g.items.push(c);
    });
    return meses.map((g, i) => {
      const m = Number(g.k.slice(5, 7)) - 1;
      const tit = g.k === 'sin' ? 'Sin fecha' : `${PAY_MESES_LARGOS[m] || ''} ${g.k.slice(0, 4)}`;
      const tot = g.items.filter((c) => !c.anulado).reduce((t, c) => t + (Number(c.monto) || 0), 0);
      const k = id + ':' + g.k;
      const abierto = k in payMesesEstado ? payMesesEstado[k] : (todos || i < 2);
      return `<details class="pay-mesg" data-k="${escapeHtml(k)}"${abierto ? ' open' : ''}>
        <summary class="pay-mes-hd"><span>${tit}</span><b><small>${g.items.length} pago${g.items.length === 1 ? '' : 's'}</small>${nomFmt(tot)}</b></summary>
        <div class="pay-grupo">${g.items.map(filaFn).join('')}</div></details>`;
    }).join('');
  }
  // Tocar una fila abre sus botones (y cierra las demás)
  function payActivarFilas(cont) {
    if (cont.dataset.filas) return;
    cont.dataset.filas = '1';
    cont.addEventListener('click', (e) => {
      const sm = e.target.closest('summary.pay-mes-hd');
      if (!sm || !cont.contains(sm)) return;
      const d = sm.parentElement; payMesesEstado[d.dataset.k] = !d.open;   // se toca antes de abrir/cerrar
    });
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
    const filtrando = !!q || $('chq-sin-nombre').checked || ver !== 'vigentes' || lista.length <= 12;
    tbody.innerHTML = payListaPorMes(lista, (c) => payFilaHTML(c, `
      ${esZelle(c) ? '' : `<button type="button" class="pay-act chq-reimp" data-id="${escapeHtml(c.id)}">${PAY_SVG.imp} Reimprimir</button>`}
      <button type="button" class="pay-act chq-editar" data-id="${escapeHtml(c.id)}">${PAY_SVG.ed} Editar</button>
      ${c.anulado ? `<button type="button" class="pay-act chq-reactivar" data-id="${escapeHtml(c.id)}">${PAY_SVG.si} Quitar anulado</button>`
                  : `<button type="button" class="pay-act chq-anular" data-id="${escapeHtml(c.id)}">${PAY_SVG.no} Anular</button>`}
      <button type="button" class="pay-act peligro chq-borrar" data-id="${escapeHtml(c.id)}">${PAY_SVG.del} Borrar</button>`), { id: 'chq', todosAbiertos: filtrando });
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
  function chqTalonHTML(c, top, titulo, alto, dx) {
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
    return `<div class="talon" style="top:${top}in;height:${alto}in;left:${(0.5 + (dx || 0)).toFixed(3)}in;">
      <div class="t-head"><span>${titulo}</span></div>
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
    const F = chqFormato();
    const P = (k) => ({ x: F.pos[k].x, y: F.pos[k].y + F.cheque });   // en la hoja
    const pos = (k) => `left:${(P(k).x + dx + chqAj(k).x).toFixed(3)}in;top:${(P(k).y + dy + chqAj(k).y).toFixed(3)}in;`;
    const letras = chqEnLetras(c.monto);
    const relleno = '*'.repeat(Math.max(3, 78 - letras.length));
    const talones = chqCfg.talones !== 'no';
    // Cada talón se queda dentro de su espacio del papel, aunque se mueva con
    // el ajuste: si se pasaría, se recorta su alto (y la letra se achica sola).
    // "Mover todo" corrige la impresora, así que el espacio se mueve con él.
    const T = [0, 1].map((i) => {
      const z = F.zonas[i], aj = chqAj('talon' + (i + 1));
      let top = F.talones[i].top + aj.y, alto = F.talones[i].alto;
      top = Math.min(Math.max(top, z.ini), z.fin - 1);           // al menos 1" de alto
      alto = Math.min(alto, z.fin - top);
      const x = Math.min(Math.max(aj.x, -0.3), 0.3);             // de 0.2" a 8.3" de ancho
      return { top: top + dy, alto, x: x + dx };
    });
    const guia = prueba ? `
      ${F.guias.map((g) => `<div class="guia" style="top:${g.top}in;height:${g.alto}in;"><span>${g.txt}</span></div>`).join('')}
      <div class="lbl" style="left:${(P('fecha').x - 0.05).toFixed(2)}in;top:${(P('fecha').y - 0.2).toFixed(2)}in;">DATE</div>
      <div class="lbl" style="left:${(P('monto').x - 0.05).toFixed(2)}in;top:${(P('monto').y - 0.2).toFixed(2)}in;">AMOUNT</div>
      <div class="lbl" style="left:0.3in;top:${(P('letras').y).toFixed(2)}in;">PAY</div>
      <div class="lbl" style="left:0.3in;top:${(P('a').y - 0.2).toFixed(2)}in;">TO THE ORDER OF</div>` : '';
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
  .talon { position: absolute; left: 0.5in; width: 7.5in; overflow: hidden; font-size: 10pt; }
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
  .talon.compacto .dias, .talon.compacto td.dia { display: none; }
  .talon.compacto tr:has(td.dia) { display: none; }
  .t-mas { font-size: .9em; color: #444; margin-top: .3em; }
</style></head><body><div class="pg">
  ${guia}
  <div class="f" style="${pos('fecha')}">${escapeHtml(chqFechaUS(c.fecha))}</div>
  <div class="f" style="${pos('monto')}">**${chqDinero(c.monto)}</div>
  <div class="f letras" style="${pos('letras')}">${escapeHtml(letras)} ${relleno}</div>
  <div class="f" style="${pos('a')}">${escapeHtml(c.a)}</div>
  ${c.memo ? `<div class="f memo" style="${pos('memo')}">${escapeHtml(c.memo)}</div>` : ''}
  ${talones ? chqTalonHTML(c, T[0].top, 'Company copy', T[0].alto, T[0].x) + chqTalonHTML(c, T[1].top, (chqPagosDeCheque(c).length > 1 || (c.ganancias && c.ganancias.length)) ? 'Payee copy' : 'Employee copy', T[1].alto, T[1].x) : ''}
</div>
<script>
  // Si el talón no cabe en su espacio, se achica la letra poco a poco hasta que quepa
  (function () {
    var noCabe = function (t) { return t.scrollHeight > t.clientHeight + 1; };
    document.querySelectorAll('.talon').forEach(function (t) {
      var fs = 10;
      t.style.fontSize = fs + 'pt';
      while (noCabe(t) && fs > 6.5) { fs -= 0.25; t.style.fontSize = fs + 'pt'; }
      // Todavía no cabe: se quitan las líneas de los días (el total y cada pago se quedan)
      if (noCabe(t)) t.classList.add('compacto');
      while (noCabe(t) && fs > 4.5) { fs -= 0.25; t.style.fontSize = fs + 'pt'; }
      // Último recurso: se dejan solo los pagos que caben y se avisa cuántos faltan
      var filas = t.querySelectorAll('.t-det tr');
      var quitadas = 0;
      for (var i = filas.length - 1; i > 0 && noCabe(t); i--) { filas[i].style.display = 'none'; quitadas++; }
      if (quitadas) { var n = document.createElement('div'); n.className = 't-mas'; n.textContent = '+ ' + quitadas + ' more line(s) — see payroll records'; t.querySelector('.t-total').before(n);
        for (var j = filas.length - quitadas - 1; j > 0 && noCabe(t); j--) { filas[j].style.display = 'none'; quitadas++; n.textContent = '+ ' + quitadas + ' more line(s) — see payroll records'; } }
    });
  })();
<\/script></body></html>`;
  }

  // Solo para las pruebas automáticas (servidor local)
  if (location.hostname === '127.0.0.1') window.__GH_TEST_CHQ_DOC = (pagos) => chqDocumento({ numero: 2004, fecha: '2026-10-19', a: 'CRA HVAC', monto: 16000, memo: 'WORK', pagosSnap: pagos }, false);

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
    // El número del registro tiene que ser el mismo que trae impreso la hoja
    if (!await gcConfirm(`¿La hoja de cheque en la impresora es la #${c.numero}?\n\nEl número viene impreso arriba a la derecha de la hoja.`, { okText: `Sí, es la #${c.numero}`, cancelText: 'No, cambiar número' })) {
      $('chq-numero').focus(); $('chq-numero').select && $('chq-numero').select();
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
    chqCfg.posicion = $('chq-posicion').value;
    chqLeerAjustes();
    try { await chqGuardarCfg(); toast('Ajuste guardado'); } catch (e) { toast('No se pudo guardar', 'error'); }
  });
  ['chq-off-x', 'chq-off-y', 'chq-talones', 'chq-posicion'].forEach((id) => $(id).addEventListener('change', () => {
    chqCfg.offX = parseFloat($('chq-off-x').value) || 0;
    chqCfg.offY = parseFloat($('chq-off-y').value) || 0;
    chqCfg.talones = $('chq-talones').value;
    chqCfg.posicion = $('chq-posicion').value;
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

