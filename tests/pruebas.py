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

if __name__ == '__main__':
    sys.exit(1 if correr(sys.argv[1:] or list(PRUEBAS)) else 0)
