import sys, os, json
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from runner import *  # noqa

@prueba
def abre_y_recorre(p, c):
    pg = c.pagina()
    foto(pg, 'inicio')
    tabs = pg.eval_on_selector_all('.gc-tab', 'els => els.filter(e => e.offsetParent).map(e => e.dataset.tab)')
    assert len(tabs) >= 5, tabs
    for t in tabs:
        pg.click(f'.gc-tab[data-tab="{t}"]')
        pg.wait_for_timeout(300)
        assert pg.is_visible(f'#panel-{t}'), t
        subs = pg.eval_on_selector_all(f'#panel-{t} button[data-sub],#panel-{t} button[data-msub],#panel-{t} button[data-nsub],#panel-{t} button[data-psub],#panel-{t} button[data-asub],#panel-{t} button[data-dsub]',
            'els => els.filter(e => e.offsetParent).map((e,i) => i)')
        for i in subs:
            b = pg.query_selector_all(f'#panel-{t} button[data-sub],#panel-{t} button[data-msub],#panel-{t} button[data-nsub],#panel-{t} button[data-psub],#panel-{t} button[data-asub],#panel-{t} button[data-dsub]')[i]
            if b.is_visible(): b.click(); pg.wait_for_timeout(200)
        foto(pg, 'tab-' + t)

LEER = "async (k) => { try { return JSON.parse((await window.storage.get(k)).value); } catch (e) { return 'ERR:' + e.message; } }"
GUARDAR = "async ([k, v]) => { const r = await window.storage.set(k, JSON.stringify(v)); return r; }"

@prueba
def dos_telefonos_no_se_pisan(p, c):
    a = c.pagina()
    b = c.otro(p).pagina()
    na = a.evaluate(LEER, 'gh-nomina'); nb = b.evaluate(LEER, 'gh-nomina')
    assert isinstance(na, list) and len(na) == 15, na
    na.append({'id': 'A1', 'trabajador': 'Desde A', 'dias': [], 'monto': 1})
    a.evaluate(GUARDAR, ['gh-nomina', na])
    nb.append({'id': 'B1', 'trabajador': 'Desde B', 'dias': [], 'monto': 2})
    nb[0]['monto'] = 999   # B también cambia uno existente
    b.evaluate(GUARDAR, ['gh-nomina', nb])
    final = valor(None, 'c:prueba::gh-nomina')
    ids = [x['id'] for x in final]
    assert 'A1' in ids and 'B1' in ids, ids
    assert final[0]['monto'] == 999
    assert len(final) == 17, len(final)
    # A borra uno y B (sin recargar) agrega otro: el borrado se respeta y lo de B queda
    na2 = [x for x in na if x['id'] != 'A1']
    a.evaluate(GUARDAR, ['gh-nomina', na2])
    nb.append({'id': 'B2', 'trabajador': 'Otro de B', 'dias': [], 'monto': 3})
    b.evaluate(GUARDAR, ['gh-nomina', nb])
    ids = [x['id'] for x in valor(None, 'c:prueba::gh-nomina')]
    assert 'A1' not in ids and 'B1' in ids and 'B2' in ids, ids

@prueba
def sin_senal_se_guarda_despues(p, c):
    a = c.pagina()
    cats = a.evaluate(LEER, 'catGastos')
    a.evaluate('() => { window.FAKE.offline = true; }')
    r = a.evaluate(GUARDAR, ['catGastos', cats + ['Sin señal']])
    assert valor(None, 'c:prueba::catGastos') == cats
    assert a.evaluate('() => window.GH_SYNC.info().pendientes') == 1
    # se cierra la app sin señal y se vuelve a abrir con señal
    a.close()
    a2 = c.pagina()
    a2.wait_for_timeout(1500)
    assert 'Sin señal' in valor(None, 'c:prueba::catGastos'), valor(None, 'c:prueba::catGastos')
    assert a2.evaluate('() => window.GH_SYNC.info().pendientes') == 0

@prueba
def lectura_fallida_no_borra_todo(p, c):
    # El teléfono ya había entrado antes; ahora abre SIN señal: no pudo leer
    # los movimientos (los ve vacíos)
    c.pagina().close()
    a = c.pagina(offline=True)
    a.evaluate('() => { window.FAKE.offline = false; }')
    # guarda un movimiento nuevo con la app (memoria vacía)
    a.click('.gc-tab[data-tab="movimientos"]')
    a.wait_for_function("() => [...document.querySelectorAll('#m-cat option')].some(o => o.value && o.value !== '__nueva__')", timeout=15000)
    a.evaluate("""() => { document.querySelector('.gc-type-btn[data-type="gasto"]').click(); }""")
    a.fill('#m-monto', '42')
    a.fill('#m-desc', 'Prueba sin señal')
    a.click('#btn-guardar-mov')
    a.wait_for_timeout(1200)
    movs = valor(None, 'c:prueba::movimientos')
    descs = [m.get('desc') for m in movs]
    assert 'Prueba sin señal' in descs, (descs, a.inner_text('#status-mov'), a.input_value('#m-cat'), a.evaluate('() => [window.GH_SYNC.info(), [...document.querySelectorAll(".gc-toast-item")].map(x => x.textContent)]'))
    assert len(movs) == 4, descs   # los 3 de antes siguen ahí

@prueba
def sin_permiso_avisa(p, c):
    a = c.pagina()
    a.evaluate('() => { window.FAKE.fallarEscrituras = true; }')
    r = a.evaluate("""async () => { try { await window.storage.set('catGastos', '["x"]'); return 'ok'; } catch (e) { return 'ERR ' + e.message; } }""")
    assert r.startswith('ERR') and 'permiso' in r, r
    assert a.evaluate('() => window.GH_SYNC.info().pendientes') == 0
    c.errores.clear()

def tab(pg, t, sub=None, attr='data-sub'):
    pg.click(f'.gc-tab[data-tab="{t}"]'); pg.wait_for_timeout(500)
    if sub: pg.click(f'#panel-{t} [{attr}="{sub}"]'); pg.wait_for_timeout(400)

@prueba
def factura_nueva_y_editar(p, c):
    pg = c.pagina()
    tab(pg, 'facturas')
    num = pg.input_value('#inv-num')
    assert num == '1010', num
    filas = pg.query_selector_all('#inv-tbody tr')
    filas[0].query_selector('.inv-loc').fill('Lot 5 Oak Hills')
    filas[0].query_selector('.inv-work').fill('Trim')
    filas[0].query_selector('.inv-work').dispatch_event('change')
    assert filas[0].query_selector('.inv-amt').input_value() == '250.00'
    # Enter pasa al siguiente campo, no guarda
    filas[0].query_selector('.inv-loc').press('Enter')
    assert len(valor(None, 'c:prueba::gh-invoices')) == 4
    pg.fill('#inv-cliente-direccion', 'Dirección especial 99')
    pg.click('#inv-btn-guardar'); pg.wait_for_timeout(800)
    docs = valor(None, 'c:prueba::gh-invoices')
    nueva = [d for d in docs if d['numero'] == '1010'][0]
    assert nueva['total'] == 250 and nueva['clienteDireccion'] == 'Dirección especial 99', nueva
    # editar otra factura: debe traer SU dirección, no la última usada
    tab(pg, 'facturas', 'guardadas')
    pg.evaluate("""() => { const b=[...document.querySelectorAll('#inv-list-tbody [data-a="editar"]')].find(x => x.closest('tr').textContent.includes('1007')); b.click(); }""")
    pg.wait_for_timeout(400)
    assert pg.input_value('#inv-cliente-direccion') == '123 Main St, Nashville, TN'
    pg.click('#inv-btn-guardar'); pg.wait_for_timeout(800)
    d = [d for d in valor(None, 'c:prueba::gh-invoices') if d['numero'] == '1007'][0]
    assert d['clienteDireccion'] == '123 Main St, Nashville, TN' and d.get('editadoEn') and d['creadoEn'].startswith('20'), d
    # número repetido pide confirmación
    pg.fill('#inv-num', '1007')
    pg.query_selector_all('#inv-tbody tr')[0].query_selector('.inv-amt').fill('10')
    pg.click('#inv-btn-guardar'); pg.wait_for_timeout(400)
    assert pg.is_visible('.gc-confirm-overlay'), 'no avisó del número repetido'
    pg.click('.gc-confirm-overlay [data-r="0"]')

@prueba
def nomina_semana_y_movimientos_con_socio(p, c):
    pg = c.pagina()
    tab(pg, 'nomina')
    # marcar 2 días a Pedro Lopez en la semana actual
    for i in [0, 1]:
        pg.click(f'#nom-grid-lista [data-grid-nombre="Pedro Lopez"] .nom-grid-dia >> nth={i}')
    pg.click('#nom-grid-guardar'); pg.wait_for_timeout(800)
    nom = valor(None, 'c:prueba::gh-nomina')
    pedro = [n for n in nom if n['trabajador'] == 'Pedro Lopez' and len(n['dias']) == 2]
    assert pedro and pedro[0]['monto'] == 300, pedro
    # Nueva página (sin abrir Nómina): agregar la nómina de la semana pasada a movimientos
    pg2 = c.pagina()
    pg2.click('#mov-nom-abrir'); pg2.wait_for_timeout(1200)
    pg2.click('#mov-nom-agregar'); pg2.wait_for_timeout(1000)
    movs = valor(None, 'c:prueba::movimientos')
    ajustes = [m for m in movs if m['tipo'] == 'ajuste' and m.get('nominaSemana')]
    gastos = [m for m in movs if m['tipo'] == 'gasto' and m.get('nominaSemana')]
    assert ajustes and ajustes[0]['ajusteSocioNombre'] == 'CRA HVAC', ajustes
    cra = [g for g in gastos if g['cat'] == 'CRA HVAC']
    assert cra and abs(cra[0]['monto'] - ajustes[0]['monto']) < .01, (cra, ajustes)

@prueba
def cheque_se_registra_antes_de_imprimir(p, c):
    pg = c.pagina()
    pg.evaluate("() => { window.__impresos = 0; HTMLIFrameElement.prototype.__p = 1; }")
    tab(pg, 'payroll'); pg.wait_for_timeout(800)
    pg.fill('#chq-a', 'Pedro Lopez'); pg.fill('#chq-monto', '450')
    pg.evaluate("() => { window.FAKE.fallarEscrituras = true; }")
    pg.click('#chq-btn-imprimir'); pg.wait_for_timeout(800)
    assert not pg.query_selector('#gh-print-frame'), 'imprimió aunque no se guardó'
    pg.evaluate("() => { window.FAKE.fallarEscrituras = false; }")
    pg.click('#chq-btn-imprimir'); pg.wait_for_timeout(1000)
    lista = valor(None, '__gh-cheques')
    assert lista and lista[-1]['a'] == 'Pedro Lopez' and lista[-1]['monto'] == 450, lista
    c.errores.clear()

@prueba
def checkin_dos_visores(p, c):
    v1 = c.otro(p, usuario='u-visor').pagina()
    v2 = c.otro(p, usuario='u-visor').pagina()
    v1.wait_for_selector('.chk-fila'); v2.wait_for_selector('.chk-fila')
    v1.click('.chk-fila[data-n="Pedro Lopez"]')
    v2.click('.chk-fila[data-n="Juan Martinez"]')
    v1.wait_for_timeout(1500)
    chk = valor(None, 'c:prueba::gh-checkin')
    dias = [k for k in chk if k[:2] == '20']
    assert dias, chk
    marcados = chk[dias[0]]['v']
    assert 'Pedro Lopez' in marcados and 'Juan Martinez' in marcados, marcados

@prueba
def movimientos_semana_invoice_y_reabrir(p, c):
    pg = c.pagina()
    # gasto
    pg.click('.gc-type-btn[data-type="gasto"]')
    pg.select_option('#m-cat', 'Material'); pg.fill('#m-monto', '100'); pg.fill('#m-desc', 'Tubo')
    pg.click('#btn-guardar-mov'); pg.wait_for_timeout(500)
    # ajuste a CRA
    pg.click('.gc-type-btn[data-type="ajuste"]')
    pg.select_option('#ajuste-socio-select', 'socio-1'); pg.fill('#m-monto', '50')
    pg.click('#btn-guardar-mov'); pg.wait_for_timeout(700)
    movs = valor(None, 'c:prueba::movimientos')
    assert len(movs) == 5, movs
    aj = [m for m in movs if m['tipo'] == 'ajuste'][0]
    assert aj['ajusteSocioId'] == 'socio-1' and aj['ajusteSocioNombre'] == 'CRA HVAC', aj
    # cálculo del reparto: ingresos 3200, gastos 85.5+140+100, taxas 320
    sem = pg.evaluate("""() => { const btn = document.getElementById('btn-guardar-invoice-top'); return true; }""")
    pg.click('#btn-guardar-invoice-top'); pg.wait_for_timeout(400)
    assert not pg.is_visible('#selector-semana-ov'), 'hay más de una semana'
    pg.click('.gc-confirm-overlay [data-r="1"]'); pg.wait_for_timeout(900)
    invs = valor(None, 'c:prueba::invoicesGuardados')
    assert len(invs) == 1, invs
    inv = invs[0]
    neto = 3200 - (85.5 + 140 + 100) - 320
    assert abs(inv['neto'] - neto) < .01, (inv['neto'], neto)
    cra = [x for x in inv['pagos'] if x['id'] == 'socio-1'][0]
    esperado = (neto / 2 + 50) * 1.10
    assert abs(cra['total'] - esperado) < .01, (cra, esperado)
    assert abs(inv['taxGuzman'] - (320 - (neto / 2 + 50) * .10)) < .01
    assert valor(None, 'c:prueba::movimientos') == [], valor(None, 'c:prueba::movimientos')
    # reabrir
    pg.click('.mov-subtab[data-msub="invoices"]'); pg.wait_for_timeout(500)
    btn = pg.query_selector('#tbody-invoices-guardados button:has-text("Reabrir"), #tbody-invoices-guardados [data-a="reabrir"], #tbody-invoices-guardados .gc-reabrir')
    assert btn, 'no hay botón reabrir'
    btn.click(); pg.wait_for_timeout(400)
    if pg.is_visible('.gc-confirm-overlay'): pg.click('.gc-confirm-overlay [data-r="1"]')
    pg.wait_for_timeout(900)
    assert valor(None, 'c:prueba::invoicesGuardados') == []
    assert len(valor(None, 'c:prueba::movimientos')) == 5

@prueba
def zelle_y_1099(p, c):
    pg = c.pagina()
    tab(pg, 'payroll', 'zelle', 'data-psub'); pg.wait_for_timeout(500)
    pg.click('#zc-btn-nuevo'); pg.fill('#zc-a', 'Mario Diaz'); pg.fill('#zc-monto', '700'); pg.click('#zc-guardar'); pg.wait_for_timeout(700)
    lista = valor(None, '__gh-cheques')
    assert lista and lista[-1]['a'] == 'Mario Diaz' and lista[-1]['metodo'] in ('zelle', 'cash'), lista
    tab(pg, 'payroll', 'r1099', 'data-psub'); pg.wait_for_timeout(600)
    assert 'Mario Diaz' in pg.inner_text('#panel-payroll')

@prueba
def socios_y_base_nueva(p, c):
    pg = c.pagina()
    tab(pg, 'respaldo', 'avanzado', 'data-asub'); pg.wait_for_timeout(500)
    pg.fill('#aj-bd-nueva', 'Base Nueva'); pg.click('#aj-btn-add-bd'); pg.wait_for_timeout(900)
    cuentas = valor(None, '__cuentas_lista')
    assert any(x.get('nombre') == 'Base Nueva' for x in cuentas), cuentas
    assert any(x.get('nombre') == 'Base de prueba' for x in cuentas), cuentas

@prueba
def unir_listas_casos(p, c):
    pg = c.pagina()
    r = pg.evaluate("""() => {
      const U = (b, l, r) => JSON.parse(window.GH_SYNC.unirTexto(JSON.stringify(b), JSON.stringify(l), JSON.stringify(r)));
      const out = {};
      out.dup = U([], [{id:1,a:1},{id:1,a:2}], [{id:1,a:1},{id:1,a:2},{id:2}]).length;   // no colapsa duplicados
      out.nombre = U([{nombre:'Trim',precio:250}], [{nombre:'Trim',precio:300}], [{nombre:'Trim',precio:250},{nombre:'Gas',precio:75}]);
      out.obj = U({a:1,b:1}, {a:2,b:1}, {a:1,b:3});
      out.strs = U(['x','y'], ['x','y','z'], ['x','w']);
      return out; }""")
    assert r['dup'] == 3, r
    assert r['nombre'] == [{'nombre':'Trim','precio':300},{'nombre':'Gas','precio':75}], r
    assert r['obj'] == {'a':2,'b':3}, r
    assert sorted(r['strs']) == ['w','x','z'], r

@prueba
def visor_sin_senal_y_permiso(p, c):
    # 1) abre con señal (guarda copia), marca a alguien
    v = c.otro(p, usuario='u-visor')
    pg = v.pagina(); pg.wait_for_selector('.chk-fila')
    pg.click('.chk-fila[data-n="Mario Diaz"]'); pg.wait_for_timeout(900)
    pg.close()
    # 2) abre SIN señal: ve la lista y la marca de antes (copia del teléfono)
    pg2 = v.ctx.new_page(); pg2.add_init_script('window.__offlineInicial = true;')
    pg2.goto(URL); pg2.wait_for_selector('.chk-fila', timeout=15000); pg2.wait_for_timeout(500)
    assert pg2.query_selector('.chk-fila[data-n="Mario Diaz"].es-si'), 'sin señal no muestra lo guardado'
    assert 'Sin señal' in pg2.inner_text('.vz-hero')
    # marca otro sin señal → queda pendiente; vuelve la señal → se sube
    pg2.click('.chk-fila[data-n="Carlos Ruiz"]'); pg2.wait_for_timeout(600)
    pg2.evaluate("() => { window.FAKE.offline = false; window.dispatchEvent(new Event('online')); }"); pg2.wait_for_timeout(1500)
    chk = valor(None, 'c:prueba::gh-checkin')
    dia = [k for k in chk if k[:2] == '20'][0]
    assert 'Carlos Ruiz' in chk[dia]['v'] and 'Mario Diaz' in chk[dia]['v'], chk
    # 3) sin permiso: no se queda "pendiente" para siempre
    pg2.evaluate("() => { window.FAKE.fallarEscrituras = true; }")
    pg2.click('.chk-fila[data-n="Juan Martinez"]'); pg2.wait_for_timeout(900)
    assert 'permiso' in pg2.inner_text('.vz-estado'), pg2.inner_text('.vz-estado')
    assert not pg2.evaluate("() => Object.keys(localStorage).some(k => k.startsWith('gh-chk-pend') && localStorage.getItem(k) !== '[]')")
    # 4) cambiar contraseña no truena (antes: toast no existía)
    pg2.evaluate("() => { window.FAKE.fallarEscrituras = false; }")
    pg2.click('.visor-tab[data-visor-cuenta="__ajustes"]'); pg2.click('#visor-btn-cambiar-clave')
    pg2.fill('#visor-clave-actual', 'prueba123'); pg2.fill('#visor-clave-nueva', 'nueva123'); pg2.fill('#visor-clave-nueva2', 'nueva123')
    pg2.evaluate("() => { localStorage.setItem('fake-session', JSON.stringify({ user: { id: 'u-visor', email: 'visor@guzmanhvac.app' } })); }")
    pg2.click('#visor-btn-guardar-clave'); pg2.wait_for_timeout(800)
    assert not pg2.is_visible('#visor-cambiar-clave-form'), pg2.inner_text('#visor-clave-msg')

@prueba
def visor_orden_por_frecuencia(p, c):
    import datetime
    d = db()
    hoy = datetime.date.today()
    chk = json.loads(d['datos_app']['c:prueba::gh-checkin']['valor'])
    veces = {'Mario Diaz': 9, 'Pedro Lopez': 6, 'Juan Martinez': 3, 'Carlos Ruiz': 1}   # Luis: 0
    for k in range(1, 12):
        f = (hoy - datetime.timedelta(days=k)).isoformat()
        chk[f] = {'v': {n: 1 for n, x in veces.items() if x >= k}}
    d['datos_app']['c:prueba::gh-checkin']['valor'] = json.dumps(chk)
    poner_db(d)
    pg = c.otro(p, usuario='u-visor').pagina(); pg.wait_for_selector('.chk-fila')
    orden = pg.eval_on_selector_all('.chk-fila', 'els => els.map(e => e.dataset.n)')
    assert orden == ['Mario Diaz', 'Pedro Lopez', 'Juan Martinez', 'Carlos Ruiz', 'Luis Hernandez'], orden
    # marcar a Luis hoy NO lo sube (la lista no brinca)
    pg.click('.chk-fila[data-n="Luis Hernandez"]'); pg.wait_for_timeout(900)
    assert pg.eval_on_selector_all('.chk-fila', 'els => els.map(e => e.dataset.n)')[-1] == 'Luis Hernandez'
    pg.click('.vz-vista [data-vista="semana"]'); pg.wait_for_timeout(300)
    filas = pg.eval_on_selector_all('.vz-tr:not(.vz-th):not(.vz-tf) .vz-tn', 'els => els.map(e => e.title)')
    assert filas[0] == 'Mario Diaz', filas

@prueba
def borrador_factura_y_nomina_pendiente(p, c):
    pg = c.pagina()
    tab(pg, 'facturas')
    f = pg.query_selector_all('#inv-tbody tr')[0]
    f.query_selector('.inv-loc').fill('Lot 77 Borrador'); f.query_selector('.inv-amt').fill('321')
    pg.wait_for_timeout(700)
    pg.close()
    pg2 = c.pagina(); tab(pg2, 'facturas'); pg2.wait_for_timeout(500)
    assert pg2.query_selector_all('#inv-tbody tr')[0].query_selector('.inv-loc').input_value() == 'Lot 77 Borrador'
    pg2.click('#inv-btn-guardar'); pg2.wait_for_timeout(900)
    assert pg2.evaluate("() => !Object.keys(localStorage).some(k => k.startsWith('gh-inv-borrador'))")
    # Nómina: total y aviso de cambios sin guardar
    tab(pg2, 'nomina')
    pg2.click('#nom-grid-lista [data-grid-nombre="Mario Diaz"] .nom-grid-dia >> nth=0'); pg2.wait_for_timeout(200)
    assert 'pendiente' in pg2.get_attribute('#nom-guardar-barra', 'class')
    assert '$180.00' in pg2.inner_text('#nom-resumen-sem'), pg2.inner_text('#nom-resumen-sem')
    pg2.click('#nom-grid-sem-prev'); pg2.wait_for_timeout(300)
    assert pg2.is_visible('.gc-confirm-overlay')
    pg2.click('.gc-confirm-overlay [data-r="1"]'); pg2.wait_for_timeout(900)
    nom = valor(None, 'c:prueba::gh-nomina')
    assert any(n['trabajador'] == 'Mario Diaz' and n['monto'] == 180 for n in nom), 'no guardó al cambiar de semana'

@prueba
def duplicar_factura(p, c):
    pg = c.pagina()
    tab(pg, 'facturas', 'guardadas')
    pg.evaluate("""() => [...document.querySelectorAll('#inv-list-tbody [data-a="duplicar"]')].find(x => x.closest('tr').textContent.includes('1007')).click()""")
    pg.wait_for_timeout(500)
    assert pg.is_visible('#inv-sub-nueva')
    assert pg.input_value('#inv-num') == '1010', pg.input_value('#inv-num')
    assert pg.input_value('#inv-editando') == ''
    filas = pg.query_selector_all('#inv-tbody tr')
    assert filas[0].query_selector('.inv-loc').input_value() == 'Lot 12 Oak Hills'
    assert filas[0].query_selector('.inv-dia').input_value() == ''
    pg.click('#inv-btn-guardar'); pg.wait_for_timeout(900)
    docs = valor(None, 'c:prueba::gh-invoices')
    assert len(docs) == 5, len(docs)
    nueva = [d for d in docs if d['numero'] == '1010'][0]
    assert nueva['total'] == 1225 and not nueva['pagada'] and nueva['clienteDireccion'] == '123 Main St, Nashville, TN', nueva
    assert [d for d in docs if d['numero'] == '1007'][0]['total'] == 1225   # la original no cambia

@prueba
def fotos_en_almacen_y_migracion(p, c):
    import base64
    png = 'data:image/png;base64,' + base64.b64encode(bytes.fromhex('89504e470d0a1a0a0000000d4948445200000001000000010806000000') + b'x'*40).decode()
    d = db()
    # una foto vieja guardada dentro de la base (formato de antes)
    d['datos_app']['c:prueba::gh-cita-fotos-cita-1'] = {'clave': 'c:prueba::gh-cita-fotos-cita-1', 'valor': json.dumps([{'dataUrl': png, 'nombre': 'vieja.png'}]), 'actualizado_en': '2026-10-01T12:00:00.000+00:00'}
    d['datos_app']['c:prueba::gh-citas']['valor'] = json.dumps([{'id': 'cita-1', 'fecha': '2026-10-14', 'cliente': 'Airtron', 'loc': 'Lot 20', 'descripcion': 'Trim', 'numFotos': 1, 'portada': ''}])
    poner_db(d)
    pg = c.pagina()
    r = pg.evaluate("""async (png) => { const v = await window.GH_FOTOS.cargar('cita', 'cita-1'); await new Promise(r => setTimeout(r, 2500)); return v.length && v[0].dataUrl === png; }""", png)
    assert r, 'no cargó la foto vieja'
    lista = valor(None, 'c:prueba::gh-cita-fotos-cita-1')
    assert isinstance(lista, dict) and lista['archivos'][0]['path'].startswith('prueba/cita/cita-1/'), lista
    assert len(db()['storage']) == 1
    # se vuelve a leer desde el almacén igualita
    r2 = pg.evaluate("""async (png) => { const v = await window.GH_FOTOS.cargar('cita', 'cita-1'); return v.length === 1 && v[0].dataUrl === png; }""", png)
    assert r2
    # quitar la foto: se borra del almacén
    pg.evaluate("async () => { await window.GH_FOTOS.guardar('cita', 'cita-1', []); }")
    assert db()['storage'] == {}, db()['storage']
    # sin almacén (bucket no existe): se guarda como antes, sin perder nada
    pg2 = c.pagina(); pg2.evaluate("() => { window.FAKE.sinBucket = true; }")
    pg2.evaluate("async (png) => { await window.GH_FOTOS.guardar('plano', 'p1', [{ dataUrl: png }]); }", png)
    assert valor(None, 'c:prueba::gh-plano-fotos-p1')[0]['dataUrl'] == png

def _imprimir_capturado(pg):
    return pg.evaluate("() => { const f = document.getElementById('gh-print-frame'); return f ? f.contentDocument.documentElement.outerHTML : ''; }")

@prueba
def completion_por_lote_e_imprimir(p, c):
    pg = c.pagina()
    pg.add_init_script("window.print = () => {};")
    pg.evaluate("() => { HTMLIFrameElement.prototype.focus = function(){}; }")
    tab(pg, 'facturas', 'completion')
    # Rough-In de Greystone 165
    pg.fill('#cs-lote', 'Greystone 165'); pg.fill('#cs-leadman', 'Pedro'); pg.check('#cs-completo')
    pg.wait_for_timeout(1800)
    # Trim-Out del mismo lote, escrito distinto
    pg.click('.cs-tipo-btn[data-cstipo="trim"]'); pg.wait_for_timeout(200)
    pg.fill('#cs-lote', 'Lot 165 Greystone'); pg.fill('#cs-leadman', 'Juan')
    pg.wait_for_timeout(1800)
    # Pull Sheet
    pg.click('.cs-tipo-btn[data-cstipo="pull"]'); pg.wait_for_timeout(400)
    pg.fill('#ps-hoja input[data-h="job"]', 'J-77'); pg.wait_for_timeout(1800)
    datos = valor(None, 'c:prueba::gh-completion')
    assert list(datos.keys()) == ['165-greystone'], datos.keys()
    e = datos['165-greystone']
    assert e['rough']['leadman'] == 'Pedro' and e['trim']['leadman'] == 'Juan' and e['pull']['job'] == 'J-77', e
    # otro lote, escrito con letras a medias: no deja basura
    pg.click('.cs-tipo-btn[data-cstipo="rough"]'); pg.wait_for_timeout(200)
    pg.fill('#cs-lote', 'Oak 1'); pg.wait_for_timeout(1500); pg.fill('#cs-lote', 'Oak 12'); pg.wait_for_timeout(1800)
    assert sorted(valor(None, 'c:prueba::gh-completion').keys()) == ['12-oak', '165-greystone'], valor(None, 'c:prueba::gh-completion').keys()
    # Imprimir: marcar Greystone, con factura
    pg.click('.cs-tipo-btn[data-cstipo="imprimir"]'); pg.wait_for_timeout(600)
    pg.check('.csl-fila[data-k="165-greystone"] input'); pg.check('#csl-op-factura')
    pg.click('#csl-imprimir'); pg.wait_for_timeout(800)
    html = _imprimir_capturado(pg)
    assert html.count('class="pag"') == 2 and html.count('class="ps-pag"') == 2, (html.count('class="pag"'), html.count('class="ps-pag"'))
    assert 'Pedro' in html and 'Juan' in html
    # Abrir lote: vuelve a la pantalla de hojas con sus datos
    pg.click('.cs-tipo-btn[data-cstipo="imprimir"]'); pg.wait_for_timeout(400)
    pg.click('.csl-fila[data-k="165-greystone"] .csl-abrir'); pg.wait_for_timeout(500)
    assert pg.input_value('#cs-leadman') == 'Pedro'

@prueba
def imprimir_trae_factura_sin_tocar_nada(p, c):
    # Entrar directo a Imprimir (las facturas aún cargando): igual salen
    d = db()
    d['datos_app']['c:prueba::gh-completion'] = {'clave': 'c:prueba::gh-completion', 'actualizado_en': '2026-10-01T12:00:00.000+00:00',
      'valor': json.dumps({'12-hills-oak': {'lote': 'OAK HILLS 12', 'rough': {'lote': 'OAK HILLS 12', 'leadman': 'Mario', 'checks': {}}}})}
    poner_db(d)
    pg = c.pagina()
    pg.add_init_script("window.print = () => {};")
    pg.evaluate("() => { HTMLIFrameElement.prototype.focus = function(){}; }")
    pg.click('.gc-tab[data-tab="facturas"]'); pg.click('#panel-facturas [data-sub="completion"]')
    pg.click('.cs-tipo-btn[data-cstipo="imprimir"]')
    pg.wait_for_function("() => /Factura #.*1007/.test((document.querySelector('.csl-fila[data-k=\"12-hills-oak\"]') || {}).textContent || '')", timeout=5000)
    pg.check('.csl-fila[data-k="12-hills-oak"] input')
    pg.click('#csl-imprimir'); pg.wait_for_timeout(800)
    html = _imprimir_capturado(pg)
    assert 'INVOICE' in html and 'Mario' in html, html[:300]
    # Solo había Rough-In: el Trim-Out y el Pull Sheet salen en blanco, en orden
    assert html.count('class="pag"') == 2 and html.count('class="ps-pag"') == 2, (html.count('class="pag"'), html.count('class="ps-pag"'))
    i_inv, i_rough, i_trim, i_pull = html.find('INVOICE'), html.find('ROUGH-IN'), html.find('TRIM-OUT'), html.find('class="ps-pag"')
    assert -1 < i_inv < i_rough < i_trim < i_pull, (i_inv, i_rough, i_trim, i_pull)
    # En Rough-In ya no está "Imprimir esta"
    pg.click('.cs-tipo-btn[data-cstipo="rough"]'); pg.wait_for_timeout(300)
    assert not pg.is_visible('#cs-btn-imprimir') and pg.is_visible('#cs-btn-imprimir-ambas'), (pg.is_visible('#cs-btn-imprimir'), pg.is_visible('#cs-btn-imprimir-ambas'), pg.is_visible('#cs-form-hojas'))

@prueba
def visor_imprime_hojas_y_factura(p, c):
    d = db()
    d['datos_app']['c:prueba::gh-completion'] = {'clave': 'c:prueba::gh-completion', 'actualizado_en': '2026-10-01T12:00:00.000+00:00',
      'valor': json.dumps({'12-hills-oak': {'lote': 'Lot 12 Oak Hills', 'rough': {'lote': 'Lot 12 Oak Hills', 'leadman': 'Mario', 'checks': {}}, 'trim': {'lote': 'Lot 12 Oak Hills', 'leadman': 'Luis', 'checks': {}}}})}
    d['datos_app']['c:prueba::gh-factura-pub'] = {'clave': 'c:prueba::gh-factura-pub', 'actualizado_en': '2026-10-01T12:00:00.000+00:00', 'valor': json.dumps({'nombre': 'GUZMAN HVAC', 'direccion': '500 Demo', 'logo': '', 'color': 'clasico'})}
    poner_db(d)
    v = c.otro(p, usuario='u-visor'); pg = v.pagina()
    pg.evaluate("() => { HTMLIFrameElement.prototype.focus = function(){}; }")
    pg.wait_for_selector('.chk-fila')
    pg.click('.vz-vista [data-vista="imprimir"]'); pg.wait_for_selector('.vz-imp-btn')
    assert 'Factura #1007' in pg.inner_text('.vz-imp-lista') or 'Factura #' in pg.inner_text('.vz-imp-lista'), pg.inner_text('.vz-imp-lista')
    pg.click('.vz-imp-btn'); pg.wait_for_timeout(800)
    html = _imprimir_capturado(pg)
    assert 'INVOICE' in html and 'GUZMAN HVAC' in html and html.count('class="pag"') == 2, html[:300]

if __name__ == '__main__':
    sys.exit(1 if correr(sys.argv[1:] or list(PRUEBAS)) else 0)
