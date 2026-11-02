/**
 * Pruebas del Apps Script (google-apps-script.gs) con una planilla simulada.
 * Corre el mismo código que se pega en Google, con SpreadsheetApp,
 * LockService, etc. de mentira.
 *
 * Correr con:  node tests/apps-script.test.mjs
 */
import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';

const TOKEN = 'tok-apps-script-1234567890';

/* ---------- Planilla simulada ---------- */
function crearPlanilla() {
  const hojas = new Map();
  const hoja = (name) => {
    const data = []; // filas (arrays); la 1 son los encabezados
    const s = {
      name, data,
      getLastRow: () => data.length,
      getLastColumn: () => data.reduce((m, r) => Math.max(m, r.length), 0),
      getRange: (r, c, nr = 1, nc = 1) => ({
        getValues: () => Array.from({ length: nr }, (_, i) => Array.from({ length: nc }, (_, j) => (data[r - 1 + i] || [])[c - 1 + j] ?? '')),
        setValues: (vals) => vals.forEach((row, i) => { data[r - 1 + i] = data[r - 1 + i] || []; row.forEach((v, j) => { data[r - 1 + i][c - 1 + j] = v; }); }),
        setValue: (v) => { data[r - 1] = data[r - 1] || []; data[r - 1][c - 1] = v; },
      }),
      deleteRow: (r) => data.splice(r - 1, 1),
    };
    return s;
  };
  return {
    hojas,
    getSheetByName: (n) => hojas.get(n) || null,
    insertSheet: (n) => { const h = hoja(n); hojas.set(n, h); return h; },
  };
}

function cargarScript() {
  const ss = crearPlanilla();
  const cache = new Map();
  const ctx = {
    console,
    SpreadsheetApp: { getActiveSpreadsheet: () => ss, openById: () => ss },
    PropertiesService: { getScriptProperties: () => ({ getProperty: (k) => (k === 'ADMIN_TOKEN' ? TOKEN : null) }) },
    LockService: { getScriptLock: () => ({ waitLock() {}, releaseLock() {} }) },
    CacheService: { getScriptCache: () => ({ get: (k) => cache.get(k) ?? null, put: (k, v) => cache.set(k, v) }) },
    ContentService: { MimeType: { JSON: 'json' }, createTextOutput: (t) => ({ setMimeType: () => ({ body: t }) }) },
    Utilities: { formatDate: (d, tz, f) => '261102' },
    DriveApp: {},
  };
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(new URL('../google-apps-script.gs', import.meta.url), 'utf8'), ctx);
  const post = (action, data = {}, token = TOKEN) => JSON.parse(ctx.doPost({ postData: { contents: JSON.stringify({ action, token, ...data }) } }).body);
  const get = (action, params = {}) => JSON.parse(ctx.doGet({ parameter: { action, ...params } }).body);
  const filas = (nombre) => {
    const h = ss.getSheetByName(nombre);
    if (!h || h.data.length < 2) return [];
    const [hd, ...rows] = h.data;
    return rows.map(r => Object.fromEntries(hd.map((k, i) => [k, r[i]])));
  };
  return { ctx, ss, post, get, filas };
}

let pasaron = 0, fallaron = 0;
function test(nombre, fn) {
  try { fn(); console.log('  ok   ' + nombre); pasaron++; }
  catch (e) { console.log('  FALLA ' + nombre + '\n        ' + e.message); fallaron++; }
}

console.log('\nApps Script (planilla simulada)\n');
const { post, get, filas, ss } = cargarScript();

test('fin_version responde 1 con token', () => assert.equal(post('fin_version').version, 1));
test('sin token: no autorizado', () => assert.match(post('fin_version', {}, 'malo').error, /autorizado/));
test('fin_upsert crea la hoja Cuentas con encabezados', () => {
  assert.equal(post('fin_upsert', { sheet: 'cuentas', row: { ID: 'cta_mp', Nombre: 'Mercado Pago', TipoCuenta: 'billetera', SaldoInicial: 0, ComisionPct: 6.29, Activa: true, Orden: 2 } }).success, true);
  const f = filas('Cuentas');
  assert.equal(f.length, 1);
  assert.equal(f[0].ComisionPct, 6.29);
  assert.ok(ss.getSheetByName('Cuentas').data[0].includes('Notas'));
});
test('fin_upsert actualiza la misma fila (no duplica)', () => {
  post('fin_upsert', { sheet: 'cuentas', row: { ID: 'cta_mp', ComisionPct: 5 } });
  const f = filas('Cuentas');
  assert.equal(f.length, 1);
  assert.equal(f[0].ComisionPct, 5);
  assert.equal(f[0].Nombre, 'Mercado Pago');
});
test('fin_upsert: montos negativos quedan como número (ajustes)', () => {
  post('fin_upsert', { sheet: 'movimientos', row: { ID: 'mov1', Tipo: 'ajuste', Monto: -500, CuentaId: 'cta_efectivo' } });
  assert.equal(filas('Movimientos')[0].Monto, -500);
});
test('fin_upsert: texto con fórmula se neutraliza', () => {
  post('fin_upsert', { sheet: 'clientes', row: { ID: 'cli1', Nombre: '=IMPORTXML("x")' } });
  assert.equal(filas('Clientes')[0].Nombre, '\'=IMPORTXML("x")');
});
test('fin_upsert: hoja no permitida', () => assert.match(post('fin_upsert', { sheet: 'Productos', row: { ID: 'x' } }).error, /no permitida/));
test('fin_upsert: columnas nuevas se agregan solas (Gastos.CobroId)', () => {
  post('fin_upsert', { sheet: 'gastos', row: { ID: 'g1', Concepto: 'Comisión', Monto: 780, Tipo: 'comercializacion', CobroId: 'mov9' } });
  const g = filas('Gastos')[0];
  assert.equal(g.CobroId, 'mov9');
  assert.equal(g.Tipo, 'comercializacion');
});
test('fin_delete borra la fila', () => {
  assert.equal(post('fin_delete', { sheet: 'clientes', id: 'cli1' }).success, true);
  assert.equal(filas('Clientes').length, 0);
});
test('admin_read lee las hojas de finanzas', () => {
  const r = post('admin_read', { sheet: 'movimientos' });
  assert.ok(Array.isArray(r) && r[0].ID === 'mov1');
});
test('config pública incluye redondeo y no los gastos fijos', () => {
  post('save_config', { config: { redondeo: 500, gastosRecurrentes: '{"plantillas":[]}', margen: 1.3 } });
  const c = get('config');
  assert.equal(Number(c.redondeo), 500);
  assert.equal(c.gastosRecurrentes, undefined);
});
test('upsert_product guarda costo en pesos y ganancia', () => {
  post('upsert_product', { product: { id: 'p1', nombre: 'Remera', categoria: 'remeras', precioUSD: 0, costoMoneda: 'ARS', costoARS: 8000, gananciaPct: 25, precioARSManual: 10000, stock: 3, activo: true, variantes: [{ color: 'Negro', talle: 'M', stock: 3 }] } });
  const p = filas('Productos')[0];
  assert.equal(p.CostoMoneda, 'ARS');
  assert.equal(p.CostoARS, 8000);
  assert.equal(p.GananciaPct, 25);
});
test('pedido de la web: descuenta stock del talle', () => {
  const r = post('create_order', { order: { cliente: 'Ana', telefono: '3757111222', total: 10000, items: [{ productoId: 'p1', nombre: 'Remera', variante: 'Negro / M', cantidad: 2, precioUnitario: 5000 }] } }, '');
  assert.equal(r.success, true);
  const p = filas('Productos')[0];
  assert.equal(Number(p.Stock), 1);
  assert.equal(JSON.parse(p.Variantes)[0].stock, 1);
  const ped = filas('Pedidos')[0];
  assert.equal(ped.StockDescontado, 'si');
  assert.equal(ped.Origen, 'web-whatsapp');
});
test('update_order agrega las columnas Cobro/EnvioCosto/ClienteId', () => {
  const id = filas('Pedidos')[0].ID;
  assert.equal(post('update_order', { id, updates: { Estado: 'confirmado', Cobro: 'pendiente', EnvioCosto: 4500, ClienteId: 'cli_9' } }).success, true);
  const ped = filas('Pedidos')[0];
  assert.equal(ped.Cobro, 'pendiente');
  assert.equal(ped.EnvioCosto, 4500);
  assert.equal(ped.ClienteId, 'cli_9');
  assert.equal(ped.Estado, 'confirmado');
});
test('adjust_stock devuelve stock al cancelar', () => {
  const r = post('adjust_stock', { productoId: 'p1', variante: 'Negro / M', delta: 2 });
  assert.equal(r.stock, 3);
});
test('público: no puede leer finanzas ni pedidos', () => {
  assert.match(get('read', { sheet: 'movimientos' }).error, /autorizado/);
  assert.match(post('admin_read', { sheet: 'cuentas' }, '').error, /autorizado/);
});

console.log(`\n${pasaron} pasaron, ${fallaron} fallaron\n`);
process.exit(fallaron ? 1 : 0);
