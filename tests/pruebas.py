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
    a.evaluate("""() => { document.querySelector('.gc-type-btn[data-type="gasto"]').click(); }""")
    a.fill('#m-monto', '42')
    a.fill('#m-desc', 'Prueba sin señal')
    a.click('#btn-guardar-mov')
    a.wait_for_timeout(1200)
    movs = valor(None, 'c:prueba::movimientos')
    descs = [m.get('desc') for m in movs]
    assert 'Prueba sin señal' in descs, descs
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

if __name__ == '__main__':
    sys.exit(1 if correr(sys.argv[1:] or list(PRUEBAS)) else 0)
