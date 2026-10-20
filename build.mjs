// Construye GH Manager a partir de src/.
//   node build.mjs           -> versión de prueba en ./v2/
//   node build.mjs --raiz    -> versión principal en la raíz del repo
import fs from 'fs';
import path from 'path';

const args = new Set(process.argv.slice(2));
const leer = (p) => fs.readFileSync(p, 'utf8');
const jsDir = 'src/js';
const modulos = fs.readdirSync(jsDir).filter((f) => /^\d\d[a-z]?-.*\.js$/.test(f)).sort();
const arranque = modulos.filter((f) => f.startsWith('00-'));
const app = modulos.filter((f) => !f.startsWith('00-') && !f.startsWith('9'));
const acceso = modulos.filter((f) => f.startsWith('9'));   // control de acceso / visor (alcance propio)

const destino = args.has('--raiz') ? '.' : 'v2';
fs.mkdirSync(path.join(destino, 'vendor'), { recursive: true });

const version = JSON.parse(leer('src/version.json'));
const etiqueta = destino === 'v2' ? version.etiqueta : version.etiqueta.replace(/\s*·\s*prueba\s*$/, '');
const sub = (s) => s.replaceAll('__APP_VERSION__', etiqueta).replaceAll('__CACHE__', version.cache + (destino === 'v2' ? '-prueba' : ''));

// Un solo archivo de JS (los módulos comparten el mismo alcance, igual que antes)
const js = '// GH Manager — generado por build.mjs desde src/js. No editar a mano.\n' +
  arranque.map((f) => `// ---- ${f} ----\n` + leer(path.join(jsDir, f))).join('') +
  '(function () {\n' + app.map((f) => `// ---- ${f} ----\n` + leer(path.join(jsDir, f))).join('') + '})();\n' +
  '(function () {\n' + acceso.map((f) => `// ---- ${f} ----\n` + leer(path.join(jsDir, f))).join('') + '})();\n';
// El rediseño (70-*.css) entra solo en la versión de prueba hasta que se apruebe.
const soloPrueba = (f) => f.startsWith('70-');
const cssFiles = fs.readdirSync('src/css').filter((f) => f.endsWith('.css') && (destino === 'v2' || !soloPrueba(f))).sort();
const css = cssFiles.map((f) => `/* ---- ${f} ---- */\n` + leer(path.join('src/css', f))).join('\n');

let head = leer('src/html/head.html');
if (destino === 'v2') {
  head = head.replace('<title>GH Manager</title>', '<title>GH Manager (prueba)</title>')
    .replace('content="GH Manager">', 'content="GH Prueba">');
}
const body = leer('src/html/body.html');
const fuentePrueba = destino === 'v2' ? '  <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap">\n' : '';
const html = sub(head.replace('</head>', fuentePrueba + '  <link rel="stylesheet" href="app.css?v=__CACHE__">\n</head>')) +
  body +
  '<script src="vendor/supabase-2.117.1.min.js"></script>\n' +
  '<script src="supabase-storage.js?v=' + sub('__CACHE__') + '"></script>\n' +
  '<script src="browser-storage.js"></script>\n' +
  '<script src="app.js?v=' + sub('__CACHE__') + '"></script>\n</body>\n</html>\n';

fs.writeFileSync(path.join(destino, 'index.html'), html);
fs.writeFileSync(path.join(destino, 'app.js'), sub(js));
fs.writeFileSync(path.join(destino, 'app.css'), css);
for (const f of ['supabase-storage.js', 'browser-storage.js', 'service-worker.js', 'manifest.json']) {
  fs.writeFileSync(path.join(destino, f), sub(leer(path.join('src', f))));
}
if (destino === 'v2') {
  const man = JSON.parse(fs.readFileSync(path.join(destino, 'manifest.json'), 'utf8'));
  man.name = 'GH Manager (prueba)'; man.short_name = 'GH Prueba'; man.id = './v2/';
  fs.writeFileSync(path.join(destino, 'manifest.json'), JSON.stringify(man, null, 2));
  for (const f of ['icon-192.png', 'icon-512.png', 'icon-maskable-192.png', 'icon-maskable-512.png', 'apple-touch-icon.png']) fs.copyFileSync(f, path.join(destino, f));
  for (const f of fs.readdirSync('vendor')) fs.copyFileSync(path.join('vendor', f), path.join(destino, 'vendor', f));
}
console.log('Listo →', destino, '(' + etiqueta + ', ' + app.length + ' módulos)');
