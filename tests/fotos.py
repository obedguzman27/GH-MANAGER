import sys, os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from runner import *
SUBS = '[data-sub],[data-msub],[data-nsub],[data-psub],[data-asub],[data-dsub]'
srv = servidor()
with sync_playwright() as p:
    c = Ctx(p); pg = c.pagina()
    tabs = pg.eval_on_selector_all('.gc-tab', 'els => els.filter(e => e.offsetParent).map(e => e.dataset.tab)')
    for t in tabs:
        pg.click(f'.gc-tab[data-tab="{t}"]'); pg.wait_for_timeout(500)
        subs = pg.query_selector_all(f'#panel-{t} :is({SUBS})')
        for i in range(max(1, len(subs))):
            nombre = t
            if subs:
                s = pg.query_selector_all(f'#panel-{t} :is({SUBS})')[i]
                if not s.is_visible(): continue
                s.click(); pg.wait_for_timeout(400)
                nombre = t + '-' + (s.get_attribute('data-sub') or s.get_attribute('data-msub') or s.get_attribute('data-nsub') or s.get_attribute('data-psub') or s.get_attribute('data-asub') or s.get_attribute('data-dsub'))
            anchos = pg.evaluate("""() => { const W = innerWidth; const out = []; document.querySelectorAll('.gc-panel.active *').forEach(e => { const r = e.getBoundingClientRect(); if (r.width && r.right > W + 2 && e.offsetParent && !e.closest('[style*="overflow"],.inv-subnav,.nom-subnav,.pay-subnav,.aj-subnav,.mov-subnav,.pln-subnav,.doc-subnav,.gl-list,table') ) out.push((e.id||e.className||e.tagName).toString().slice(0,40) + ':' + Math.round(r.right)); }); return [document.documentElement.scrollWidth, out.slice(0,6)]; }""")
            print(nombre, anchos)
            pg.screenshot(path=f'tests/salida/f-{nombre}.png', full_page=True)
    c.cerrar()
srv.shutdown()
