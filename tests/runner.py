"""Pruebas de GH Manager en un navegador sin pantalla, con Supabase falso.
Uso: python3 tests/pruebas.py [prueba ...]   (desde la raíz del repo; usa ./v2)
"""
import json, os, sys, threading, time, http.server, socketserver, functools
from playwright.sync_api import sync_playwright

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CARPETA = os.environ.get('GH_CARPETA', 'v2')
PUERTO = int(os.environ.get('GH_PUERTO', '8765'))
FAKE = open(os.path.join(RAIZ, 'tests', 'fake-supabase.js')).read()
SEED = open(os.path.join(RAIZ, 'tests', 'seed.json')).read()
SALIDA = os.path.join(RAIZ, 'tests', 'salida'); os.makedirs(SALIDA, exist_ok=True)

ESTADO = {'db': SEED}
class Silencio(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a): pass
    def do_GET(self):
        if self.path.startswith('/__db'):
            b = ESTADO['db'].encode(); self.send_response(200); self.send_header('Content-Type', 'application/json'); self.send_header('Content-Length', str(len(b))); self.end_headers(); self.wfile.write(b); return
        return super().do_GET()
    def do_POST(self):
        if self.path.startswith('/__db'):
            n = int(self.headers.get('Content-Length', 0)); ESTADO['db'] = self.rfile.read(n).decode()
            self.send_response(204); self.end_headers(); return
        self.send_response(404); self.end_headers()
def servidor():
    h = functools.partial(Silencio, directory=RAIZ)
    socketserver.TCPServer.allow_reuse_address = True
    s = socketserver.ThreadingTCPServer(('127.0.0.1', PUERTO), h)
    threading.Thread(target=s.serve_forever, daemon=True).start()
    return s

URL = f'http://127.0.0.1:{PUERTO}/{CARPETA}/index.html'
INIT = """
(() => {
  if (!localStorage.getItem('fake-session') && !window.__sinSesion) localStorage.setItem('fake-session', JSON.stringify({ user: { id: '%s', email: 'x' } }));
})();
"""

class Ctx:
    def otro(self, p, **kw):
        o = Ctx(p, **kw); self.extra.append(o); return o
    def __init__(self, p, usuario='u-admin', ancho=390, alto=844):
        self.extra = []
        self.b = p.chromium.launch()
        self.ctx = self.b.new_context(viewport={'width': ancho, 'height': alto}, service_workers='block')
        self.ctx.route(lambda u: 'fonts.g' in u, lambda r: r.abort())
        self.ctx.route('**/vendor/supabase-*.js', lambda r: r.fulfill(body=FAKE, content_type='application/javascript'))
        self.ctx.add_init_script(INIT % usuario)
        self.errores = []
    def pagina(self, offline=False):
        pg = self.ctx.new_page()
        if offline: pg.add_init_script('window.__offlineInicial = true;')
        pg.on('pageerror', lambda e: self.errores.append('pageerror: ' + str(e)))
        pg.on('console', lambda m: self.errores.append('console.' + m.type + ': ' + m.text) if m.type == 'error' else None)
        pg.goto(URL)
        pg.wait_for_function("() => !document.getElementById('gh-oculto-inicial')", timeout=15000)
        pg.wait_for_timeout(600)
        return pg
    def cerrar(self):
        for o in self.extra: o.cerrar()
        self.b.close()

def db(pg=None):
    return json.loads(ESTADO['db'])
def poner_db(d): ESTADO['db'] = json.dumps(d)
def valor(pg, clave):
    r = db(pg)['datos_app'].get(clave)
    return json.loads(r['valor']) if r else None
def foto(pg, nombre):
    pg.screenshot(path=os.path.join(SALIDA, nombre + '.png'), full_page=False)

PRUEBAS = {}
def prueba(fn): PRUEBAS[fn.__name__] = fn; return fn

def correr(nombres):
    srv = servidor()
    fallos = 0
    with sync_playwright() as p:
        for n in nombres:
            ESTADO['db'] = SEED
            c = Ctx(p)
            t0 = time.time()
            try:
                PRUEBAS[n](p, c)
                todos = c.errores + [e for o in c.extra for e in o.errores]
                errs = [e for e in todos if 'favicon' not in e and 'fonts.g' not in e and 'ERR_' not in e and 'Failed to load resource' not in e]
                if errs: raise AssertionError('errores en consola:\n  ' + '\n  '.join(errs[:12]))
                print(f'✓ {n} ({time.time()-t0:.1f}s)')
            except Exception as e:
                fallos += 1
                print(f'✗ {n}: {e}')
                for x in c.errores[:15]: print('    ', x[:300])
            finally:
                c.cerrar()
    srv.shutdown()
    print(f'\n{len(nombres)-fallos}/{len(nombres)} bien')
    return fallos

