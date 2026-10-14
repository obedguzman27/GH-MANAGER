"""Toca todos los botones de todas las pantallas y anota los errores."""
import sys, os, json
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from runner import *

CERRAR = """() => {
  document.querySelectorAll('.gc-confirm-overlay [data-r="0"]').forEach(b => b.click());
  document.querySelectorAll('#gh-print-frame').forEach(f => f.remove());
  ['inv-ov','nom-ov','cal-modal','emp-modal','pln-modal'].forEach(id => { const e = document.getElementById(id); if (e && getComputedStyle(e).display !== 'none') e.style.display='none'; });
  document.querySelectorAll('.emp-modal.show,.cal-modal.show,.gh-qa-ov.show').forEach(e => e.classList.remove('show'));
}"""
SUBS = '[data-sub],[data-msub],[data-nsub],[data-psub],[data-asub],[data-dsub],[data-carpeta]'
PELIGRO = ['cerrar sesión','cerrar sesion','salir','borrar todo','restaurar','importar','eliminar todo','cambiar de base']

def explorar(p, ancho=390):
    ESTADO['db'] = SEED
    c = Ctx(p, ancho=ancho)
    c.ctx.add_init_script("window.print = () => {}; window.open = () => null;")
    pg = c.pagina()
    pg.on('dialog', lambda d: d.dismiss())
    pg.evaluate("""() => { window.__toasts = []; new MutationObserver(ms => ms.forEach(m => m.addedNodes.forEach(n => { if (n.classList && n.classList.contains('error')) window.__toasts.push(n.textContent); }))).observe(document.getElementById('gc-toast'), {childList:true}); }""")
    clics = 0
    hallazgos = []
    tabs = pg.eval_on_selector_all('.gc-tab', 'els => els.filter(e => e.offsetParent).map(e => e.dataset.tab)')
    for t in tabs:
        pg.click(f'.gc-tab[data-tab="{t}"]'); pg.wait_for_timeout(500)
        nsubs = len(pg.query_selector_all(f'#panel-{t} :is({SUBS})'))
        for si in range(max(1, nsubs)):
            subs = pg.query_selector_all(f'#panel-{t} :is({SUBS})')
            sub = ''
            if subs and si < len(subs):
                if not subs[si].is_visible(): continue
                sub = subs[si].inner_text().strip()[:30]
                subs[si].click(); pg.wait_for_timeout(350)
            botones = pg.eval_on_selector_all(f'#panel-{t} button', """els => els.map((e,i) => ({i, t:(e.innerText||e.title||e.getAttribute('aria-label')||'').trim().slice(0,40), v: !!e.offsetParent && !e.disabled}))""")
            for b in botones:
                if not b['v'] or any(x in b['t'].lower() for x in PELIGRO): continue
                antes = len(c.errores)
                try:
                    el = pg.query_selector_all(f'#panel-{t} button')[b['i']]
                    if not el.is_visible(): continue
                    el.click(timeout=1500); pg.wait_for_timeout(250); clics += 1
                except Exception as e:
                    continue
                pg.evaluate(CERRAR); pg.wait_for_timeout(120)
                nuevos = [x for x in c.errores[antes:] if 'Failed to load resource' not in x]
                ts = pg.evaluate('() => window.__toasts.splice(0)')
                nuevos += ['TOAST: ' + x for x in ts]
                if nuevos: hallazgos.append((t, sub, b['t'], nuevos[:3]))
                # volver a la misma pestaña/sub si un botón navegó
                if not pg.is_visible(f'#panel-{t}'):
                    pg.click(f'.gc-tab[data-tab="{t}"]'); pg.wait_for_timeout(300)
                    if sub and subs: 
                        s2 = pg.query_selector_all(f'#panel-{t} :is({SUBS})')
                        if si < len(s2) and s2[si].is_visible(): s2[si].click(); pg.wait_for_timeout(250)
    print('clics:', clics)
    c.cerrar()
    return hallazgos

if __name__ == '__main__':
    srv = servidor()
    with sync_playwright() as p:
        for ancho in [390, 1280]:
            h = explorar(p, ancho)
            print(f'--- ancho {ancho}: {len(h)} hallazgos')
            for x in h: print(json.dumps(x, ensure_ascii=False)[:400])
    srv.shutdown()
