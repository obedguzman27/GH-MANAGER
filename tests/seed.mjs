// Datos de prueba INVENTADOS (no son los reales) con la misma forma que la app.
import fs from 'fs';
const P = 'c:prueba::';
const hoy = new Date();
const iso = (d) => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
const dia = (n) => { const d = new Date(hoy); d.setDate(d.getDate() + n); return iso(d); };
const lunes = (n) => { const d = new Date(hoy); d.setDate(d.getDate() - ((d.getDay() + 6) % 7) + 7 * n); return d; };
const sem = (n, k) => { const d = lunes(n); d.setDate(d.getDate() + k); return iso(d); };
const ts = '2026-10-01T12:00:00.000+00:00';
const fila = (clave, obj) => ({ clave, valor: JSON.stringify(obj), actualizado_por: 'u-admin', actualizado_en: ts });

const trabajadores = ['Pedro Lopez', 'Juan Martinez', 'Luis Hernandez', 'Mario Diaz', 'Carlos Ruiz'];
const nomina = [];
for (let s = -3; s <= -1; s++) trabajadores.forEach((t, i) => {
  const dias = [0, 1, 2, 3, 4].slice(0, 3 + (i % 3)).map((k) => sem(s, k));
  nomina.push({ id: `nom-${s}-${i}`, trabajador: t, dias, sueldoDia: 150 + 10 * i, extraDesc: '', extraMonto: 0, monto: dias.length * (150 + 10 * i), nota: '', creadoEn: sem(s, 4) + 'T18:00:00.000Z' });
});
const invoices = [];
for (let s = -4; s <= -1; s++) invoices.push({
  id: 'inv-' + s, numero: String(1000 + s + 10), fecha: sem(s, 4), cliente: 'Airtron', clienteDireccion: '123 Main St, Nashville, TN',
  direccionEmisor: '500 Demo Rd, Nashville, TN', items: [
    { dia: sem(s, 0), location: 'Lot 12 Oak Hills', work: 'Trim', tons: '', amount: 250 },
    { dia: sem(s, 1), location: 'Lot 14 Oak Hills', work: 'Gas', tons: '', amount: 75 },
    { dia: sem(s, 2), location: 'Lot 3 River Bend', work: 'Rough In', tons: '3', amount: 900 }],
  subtotal: 1225, taxPct: 0, tax: 0, total: 1225, notas: '', pagada: s < -2, creadoEn: sem(s, 4) + 'T20:00:00.000Z' });

const db = {
  usuarios: { 'u-admin': { id: 'u-admin', email: 'admin@guzmanhvac.app', password: 'prueba123' },
              'u-visor': { id: 'u-visor', email: 'visor@guzmanhvac.app', password: 'prueba123' } },
  perfiles: { 'u-admin': { id: 'u-admin', nombre: 'Admin Prueba', rol: 'admin', activo: true },
              'u-visor': { id: 'u-visor', nombre: 'Visor Prueba', rol: 'visor', activo: true } },
  datos_app: {}
};
const D = db.datos_app;
const poner = (clave, obj) => { D[clave] = fila(clave, obj); };
poner('__cuenta::u-admin', null); D['__cuenta::u-admin'].valor = 'prueba';
poner('__cuenta::u-visor', null); D['__cuenta::u-visor'].valor = 'prueba';
poner('__visor_cuentas::u-visor', ['prueba']); D['__visor_cuentas::u-visor'].valor = JSON.stringify(['prueba']);
poner('__cuentas_lista', [{ codigo: 'prueba', nombre: 'Base de prueba' }, { codigo: 'otra', nombre: 'Otra base' }]);
poner(P + 'kontaly-config', { socios: [{ id: 'socio-1', nombre: 'CRA HVAC', bonoPct: 10 }], socioBonus: 'CRA HVAC', socioMitad: 'GUZMAN HVAC',
  facturaNombre: 'GUZMAN HVAC', facturaDireccion: '500 Demo Rd, Nashville, TN', facturaSigueSocio: false, sociosMigrados: true,
  logoDataUrl: '', facturaColor: 'clasico', logoEnApp: false, ultimoCliente: 'Airtron', ultimoClienteDir: '123 Main St', tasaTaxas: 0.1 });
poner(P + 'catGastos', ['Gas', 'Home Depot', 'Material', 'Nómina', 'Herramientas']);
poner(P + 'catIngresos', ['Airtron']);
poner(P + 'movimientos', [
  { id: 1, fecha: dia(-2), tipo: 'ingreso', cat: 'Airtron', monto: 3200, desc: 'Pago semanal', deducible: false },
  { id: 2, fecha: dia(-1), tipo: 'gasto', cat: 'Gas', monto: 85.5, desc: 'Gasolina', deducible: true },
  { id: 3, fecha: dia(-1), tipo: 'gasto', cat: 'Home Depot', monto: 140, desc: 'Material', deducible: false }]);
poner(P + 'invoicesGuardados', []);
poner(P + 'gh-invoices', invoices);
poner(P + 'gh-nomina', nomina);
poner(P + 'gh-trabajos', [{ nombre: 'Trim', precio: 250, porTon: false }, { nombre: 'Gas', precio: 75, porTon: false }, { nombre: 'Rough In', precio: 300, porTon: true }]);
poner(P + 'gh-colonias', ['Oak Hills', 'River Bend', 'Maple Creek']);
poner(P + 'gh-clientes', ['Airtron']);
poner(P + 'empleados', trabajadores.map((t, i) => ({ id: 'emp-' + i, nombre: t.split(' ')[0], apellido: t.split(' ')[1], rol: 'Técnico', estado: 'activo', sueldo: 150 + 10 * i, tel: '', email: '', direccion: '', emergencia: '', inicio: '2026-01-05', notas: '', ss: '' })));
poner(P + 'gh-checkin', { _trab: trabajadores });
poner(P + 'gh-cheques', []);
poner(P + 'gh-cheques-cfg', { offX: 0, offY: 0, talones: true, siguiente: 1001 });
poner(P + 'gh-citas', [{ id: 'cita-1', fecha: dia(0), cliente: 'Airtron', loc: 'Lot 20 Oak Hills', descripcion: 'Trim out', jobNum: 'J-1', numFotos: 0, portada: '' }]);
poner(P + 'gh-planos', []);
poner(P + 'gh-recibos-semanales', []);
fs.writeFileSync(new URL('./seed.json', import.meta.url), JSON.stringify(db));
console.log('seed listo:', Object.keys(D).length, 'claves');
