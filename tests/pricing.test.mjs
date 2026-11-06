/**
 * Pruebas del motor de precios del servidor.
 *
 * Levanta un Apps Script falso en localhost y verifica que los totales que
 * se le cobran a la clienta sean exactamente los correctos.
 *
 * Correr con:  node tests/pricing.test.mjs
 */

import http from 'node:http';
import assert from 'node:assert/strict';

/* ---------- Datos de la planilla simulada ---------- */

const PRODUCTOS = [
  { ID: 'p1', Nombre: 'Calza Larga Negra', Categoria: 'Calzas Largas', PrecioUSD: 20, Stock: 10, Activo: 'TRUE', Variantes: '[]' },
  { ID: 'p2', Nombre: 'Pijama Corazones', Categoria: 'Pijamas', PrecioUSD: 30, Stock: 2, Activo: 'TRUE', Variantes: '[]' },
  { ID: 'p3', Nombre: 'Conjunto Flores', Categoria: 'Conjuntos', PrecioUSD: 40, Stock: 5, Activo: 'TRUE',
    Variantes: JSON.stringify([{ color: 'Rosa', talle: 'M', stock: 1 }, { color: 'Rosa', talle: 'L', stock: 4 }]) },
  { ID: 'p4', Nombre: 'Remera Oferta', Categoria: 'Remeras', PrecioUSD: 25, PrecioOferta: 9000, Stock: 5, Activo: 'TRUE', Variantes: '[]' },
  { ID: 'p5', Nombre: 'Producto Pausado', Categoria: 'Remeras', PrecioUSD: 25, Stock: 5, Activo: 'FALSE', Variantes: '[]' },
  // Oct/2026: ganancia % propia, redondeo y costo en pesos
  { ID: 'p6', Nombre: 'Top Ganancia 50', Categoria: 'Tops', PrecioUSD: 10, GananciaPct: 50, Stock: 10, Activo: 'TRUE', Variantes: '[]' },
  { ID: 'p7', Nombre: 'Top Precio Impar', Categoria: 'Tops', PrecioUSD: 7.77, Stock: 10, Activo: 'TRUE', Variantes: '[]' },
  // Nov/2026: todo en pesos (sin PrecioUSD)
  { ID: 'p9', Nombre: 'Pijama Pesos', Categoria: 'Pijamas', PrecioARSManual: 16000, CostoARS: 11000, GananciaPct: 45, Stock: 10, Activo: 'TRUE', Variantes: '[]' },
  { ID: 'p8', Nombre: 'Remera Costo Pesos', Categoria: 'Remeras', PrecioUSD: 0, CostoMoneda: 'ARS', CostoARS: 10000, GananciaPct: 30, PrecioARSManual: 13000, Stock: 10, Activo: 'TRUE', Variantes: '[]' },
];

const PROMOS = {
  envioGratisUmbralARS: 150000,
  cupones: [
    { id: 'c1', codigo: 'PRINCESS20', tipo: 'percent', valor: 20, activo: true },
    { id: 'c2', codigo: 'ENVIOGRATIS', tipo: 'shipping', valor: 0, activo: true },
    { id: 'c3', codigo: 'VENCIDO', tipo: 'percent', valor: 50, activo: false },
  ],
  flashSales: [],
  combos: [
    { id: 'k1', nombre: 'Top + Remera', productoIds: ['p6', 'p8'], precioARS: 25000, activo: true },
  ],
  dosPorUno: [],
  preventas: [],
};

let promosActuales = PROMOS;

/* ---------- Servidor falso ---------- */

const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://localhost');
  const action = url.searchParams.get('action');
  res.setHeader('Content-Type', 'application/json');

  if (req.method === 'POST') return res.end(JSON.stringify({ success: true }));

  if (action === 'read') return res.end(JSON.stringify(PRODUCTOS));
  if (action === 'dolar') return res.end(JSON.stringify([{ Fecha: '2026-09-19', Valor: 1000 }]));
  if (action === 'config') {
    return res.end(JSON.stringify({
      promos: JSON.stringify(promosActuales),
      envios: JSON.stringify([
        { id: 'retiro', nombre: 'Retiro en local', precio: 0, activo: true },
        { id: 'correo_argentino', nombre: 'Correo Argentino', precio: 3500, activo: true },
        { id: 'viejo', nombre: 'Metodo dado de baja', precio: 9999, activo: false },
      ]),
    }));
  }
  res.end(JSON.stringify({}));
});

await new Promise((r) => server.listen(0, '127.0.0.1', r));
const puerto = server.address().port;

process.env.APPS_SCRIPT_URL = `http://127.0.0.1:${puerto}/exec`;
process.env.MARGEN_GANANCIA = '1.30';
// Los productos p1–p7 tienen el costo viejo en USD: se pasan a pesos con este dólar fijo
process.env.DOLAR_CONVERSION = '1000';

const { cotizarCarrito, cotizacionAItemsMP } = await import('../api/_lib/pricing.js');

/* ---------- Utilidades ---------- */

let pasaron = 0;
let fallaron = 0;

async function test(nombre, fn) {
  try {
    await fn();
    console.log(`  ok   ${nombre}`);
    pasaron++;
  } catch (e) {
    console.log(`  FALLA ${nombre}`);
    console.log(`        ${e.message}`);
    fallaron++;
  }
}

/** Invalida el cache de 60s entre pruebas que cambian las promos */
async function recargar() {
  const store = await import('../api/_lib/store.js');
  void store;
  await new Promise((r) => setTimeout(r, 5));
}

console.log('\nMotor de precios PrincessLov\n');

/* ---------- Casos ---------- */

await test('precio unitario = USD x dolar x margen', async () => {
  const c = await cotizarCarrito({ items: [{ id: 'p1', cantidad: 1 }], shippingId: 'retiro' });
  assert.equal(c.ok, true, c.errores?.join('; '));
  assert.equal(c.lineas[0].precioUnitario, 26000); // 20 * 1000 * 1.3
  assert.equal(c.total, 26000);
});

await test('suma cantidades y costo de envio', async () => {
  const c = await cotizarCarrito({ items: [{ id: 'p1', cantidad: 2 }], shippingId: 'correo_argentino' });
  assert.equal(c.total, 26000 * 2 + 3500); // 55500
});

await test('precio de oferta le gana al precio calculado', async () => {
  const c = await cotizarCarrito({ items: [{ id: 'p4', cantidad: 1 }], shippingId: 'retiro' });
  assert.equal(c.lineas[0].precioUnitario, 9000); // oferta, no 32500
});

await test('cupon de porcentaje se descuenta del total', async () => {
  const c = await cotizarCarrito({
    items: [{ id: 'p1', cantidad: 2 }], shippingId: 'correo_argentino', promoCode: 'PRINCESS20',
  });
  assert.equal(c.descuentoCupon, 10400);          // 20% de 52000
  assert.equal(c.total, 52000 - 10400 + 3500);    // 45100
});

await test('cupon de envio gratis pone el envio en cero', async () => {
  const c = await cotizarCarrito({
    items: [{ id: 'p1', cantidad: 1 }], shippingId: 'correo_argentino', promoCode: 'ENVIOGRATIS',
  });
  assert.equal(c.costoEnvio, 0);
  assert.equal(c.total, 26000);
});

await test('cupon inactivo se rechaza', async () => {
  const c = await cotizarCarrito({
    items: [{ id: 'p1', cantidad: 1 }], shippingId: 'retiro', promoCode: 'VENCIDO',
  });
  assert.equal(c.ok, false);
});

await test('cupon inventado se rechaza', async () => {
  const c = await cotizarCarrito({
    items: [{ id: 'p1', cantidad: 1 }], shippingId: 'retiro', promoCode: 'REGALAME100',
  });
  assert.equal(c.ok, false);
});

await test('envio gratis automatico al superar el umbral', async () => {
  const c = await cotizarCarrito({ items: [{ id: 'p1', cantidad: 6 }], shippingId: 'correo_argentino' });
  assert.equal(c.subtotalLineas, 156000);
  assert.equal(c.costoEnvio, 0);
  assert.equal(c.total, 156000);
});

await test('rechaza cantidad mayor al stock', async () => {
  const c = await cotizarCarrito({ items: [{ id: 'p2', cantidad: 5 }], shippingId: 'retiro' });
  assert.equal(c.ok, false);
  assert.match(c.errores[0], /solo quedan 2/);
});

await test('respeta el stock de la variante, no el total', async () => {
  const c = await cotizarCarrito({
    items: [{ id: 'p3', cantidad: 2, variante: { color: 'Rosa', talle: 'M' } }], shippingId: 'retiro',
  });
  assert.equal(c.ok, false); // talle M tiene 1, aunque el producto sume 5
});

await test('acepta variante con stock suficiente', async () => {
  const c = await cotizarCarrito({
    items: [{ id: 'p3', cantidad: 3, variante: { color: 'Rosa', talle: 'L' } }], shippingId: 'retiro',
  });
  assert.equal(c.ok, true, c.errores?.join('; '));
  assert.equal(c.lineas[0].variante, 'Rosa / L');
});

await test('rechaza producto inexistente', async () => {
  const c = await cotizarCarrito({ items: [{ id: 'no-existe', cantidad: 1 }], shippingId: 'retiro' });
  assert.equal(c.ok, false);
});

await test('rechaza producto pausado', async () => {
  const c = await cotizarCarrito({ items: [{ id: 'p5', cantidad: 1 }], shippingId: 'retiro' });
  assert.equal(c.ok, false);
});

await test('rechaza metodo de envio inactivo', async () => {
  const c = await cotizarCarrito({ items: [{ id: 'p1', cantidad: 1 }], shippingId: 'viejo' });
  assert.equal(c.ok, false);
});

await test('rechaza metodo de envio inventado', async () => {
  const c = await cotizarCarrito({ items: [{ id: 'p1', cantidad: 1 }], shippingId: 'gratis-total' });
  assert.equal(c.ok, false);
});

await test('rechaza cantidad negativa', async () => {
  const c = await cotizarCarrito({ items: [{ id: 'p1', cantidad: -3 }], shippingId: 'retiro' });
  assert.equal(c.ok, false);
});

await test('rechaza carrito vacio', async () => {
  const c = await cotizarCarrito({ items: [], shippingId: 'retiro' });
  assert.equal(c.ok, false);
});

await test('ignora el precio que manda el navegador', async () => {
  const c = await cotizarCarrito({
    items: [{ id: 'p1', cantidad: 1, precioARS: 1, unit_price: 1, precioUnitario: 1 }],
    shippingId: 'retiro',
  });
  assert.equal(c.lineas[0].precioUnitario, 26000); // no 1
});

/* ---------- Lo que se le manda a Mercado Pago ---------- */

await test('los items de MP suman exactamente el total sin descuento', async () => {
  const c = await cotizarCarrito({ items: [{ id: 'p1', cantidad: 2 }], shippingId: 'correo_argentino' });
  const items = cotizacionAItemsMP(c);
  const suma = items.reduce((s, i) => s + i.unit_price * i.quantity, 0);
  assert.equal(Math.round(suma * 100) / 100, c.total);
});

await test('los items de MP suman exactamente el total con cupon', async () => {
  const c = await cotizarCarrito({
    items: [{ id: 'p1', cantidad: 2 }], shippingId: 'correo_argentino', promoCode: 'PRINCESS20',
  });
  const items = cotizacionAItemsMP(c);
  const suma = items.reduce((s, i) => s + i.unit_price * i.quantity, 0);
  assert.equal(Math.round(suma * 100) / 100, c.total);
});

await test('el prorrateo cuadra con varias lineas y descuento', async () => {
  const c = await cotizarCarrito({
    items: [{ id: 'p1', cantidad: 3 }, { id: 'p2', cantidad: 1 }, { id: 'p4', cantidad: 2 }],
    shippingId: 'correo_argentino',
    promoCode: 'PRINCESS20',
  });
  assert.equal(c.ok, true, c.errores?.join('; '));
  const items = cotizacionAItemsMP(c);
  const suma = items.reduce((s, i) => s + i.unit_price * i.quantity, 0);
  assert.equal(Math.round(suma * 100) / 100, c.total);
});

await test('ningun item de MP tiene precio cero o negativo', async () => {
  const c = await cotizarCarrito({
    items: [{ id: 'p1', cantidad: 2 }], shippingId: 'correo_argentino', promoCode: 'PRINCESS20',
  });
  cotizacionAItemsMP(c).forEach((i) => assert.ok(i.unit_price > 0, `${i.title} = ${i.unit_price}`));
});

await test('ganancia % del producto: USD 10 x 1000 x 1,5', async () => {
  const c = await cotizarCarrito({ items: [{ id: 'p6', cantidad: 1 }], shippingId: 'retiro' });
  assert.equal(c.lineas[0].precioUnitario, 15000);
});

await test('el precio calculado se redondea hacia arriba a $500', async () => {
  const c = await cotizarCarrito({ items: [{ id: 'p7', cantidad: 1 }], shippingId: 'retiro' });
  assert.equal(c.lineas[0].precioUnitario, 10500); // 7.77 * 1000 * 1.3 = 10101
});

await test('costo en pesos: usa el precio guardado y el costo real', async () => {
  const c = await cotizarCarrito({ items: [{ id: 'p8', cantidad: 2 }], shippingId: 'retiro' });
  assert.equal(c.lineas[0].precioUnitario, 13000);
  assert.equal(c.costoTotal, 20000);
});

await test('combo con precio en pesos', async () => {
  const c = await cotizarCarrito({ items: [{ id: 'p6', cantidad: 1 }, { id: 'p8', cantidad: 1 }], shippingId: 'retiro' });
  assert.equal(c.total, 25000); // 15000 + 13000 = 28000 -> combo 25000
});

await test('combo: 2 de cada uno son 2 combos (no uno solo)', async () => {
  const c = await cotizarCarrito({ items: [{ id: 'p6', cantidad: 2 }, { id: 'p8', cantidad: 2 }], shippingId: 'retiro' });
  assert.equal(c.total, 50000);
});

await test('combo: un producto extra se cobra aparte', async () => {
  const c = await cotizarCarrito({ items: [{ id: 'p6', cantidad: 2 }, { id: 'p8', cantidad: 1 }], shippingId: 'retiro' });
  assert.equal(c.total, 25000 + 15000);
});

/* ---------- Todo en pesos (nov/2026) ---------- */

await test('pesos: el precio es el guardado en pesos y no depende del dólar', async () => {
  const c = await cotizarCarrito({ items: [{ id: 'p9', cantidad: 2 }], shippingId: 'retiro' });
  assert.equal(c.ok, true, c.errores?.join('; '));
  assert.equal(c.lineas[0].precioUnitario, 16000);
  assert.equal(c.total, 32000);
  assert.equal(c.costoTotal, 22000);
});

const { precioUnitarioARS } = await import('../api/_lib/pricing.js');
const promosVacias = { flashSales: [], preventas: [] };
const pijama = { id: 'p9', categoria: 'pijamas', precioUSD: 0, precioARSManual: 16000, precioOferta: null };

await test('pesos: flash sale descuenta del precio en pesos', async () => {
  const promos = { ...promosVacias, flashSales: [{ id: 'f1', descuento: 25, categorias: [], activo: true }] };
  assert.equal(precioUnitarioARS(pijama, promos, 1570, 1.3, Date.now(), 500), 12000);
});

await test('pesos: preventa con precio en pesos', async () => {
  const futuro = new Date(Date.now() + 7 * 864e5).toISOString();
  const promos = { ...promosVacias, preventas: [{ id: 'v1', productoId: 'p9', precioARS: 14000, fechaLanzamiento: futuro, activo: true }] };
  assert.equal(precioUnitarioARS(pijama, promos, 1570, 1.3, Date.now(), 500), 14000);
});

await test('pesos: la oferta en pesos le gana si es menor', async () => {
  assert.equal(precioUnitarioARS({ ...pijama, precioOferta: 13500 }, promosVacias, 1570, 1.3, Date.now(), 500), 13500);
});

/* ---------- Resultado ---------- */

server.close();
console.log(`\n${pasaron} pasaron, ${fallaron} fallaron\n`);
process.exit(fallaron ? 1 : 0);
