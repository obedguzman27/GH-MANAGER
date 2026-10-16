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
    // Completion Sheets va abajo de la factura (+ Nueva Factura)
    const sec = $('inv-sub-completion');
    if (sec) sec.style.display = csActivo ? '' : 'none';
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
