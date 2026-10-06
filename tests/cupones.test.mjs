/**
 * QA de cupones y descuentos.
 *
 * Parte 1: casos limite del motor del servidor (lo que realmente se cobra).
 * Parte 2: el carrito del navegador (js/promos.js + js/cart.js) contra el
 *          servidor, para detectar totales que la clienta ve distintos de
 *          lo que se le cobra (o de lo que se manda por WhatsApp).
 *
 * Correr con:  node tests/cupones.test.mjs
 */

import http from 'node:http';
import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';

/* ---------- Datos simulados ---------- */

const PRODUCTOS = [
  { ID: 'p1', Nombre: 'Calza Larga Negra', Categoria: 'Calzas Largas', PrecioUSD: 20, Stock: 50, Activo: 'TRUE', Variantes: '[]' },
  { ID: 'p6', Nombre: 'Pijama Estrellas', Categoria: 'Pijamas', PrecioUSD: 10, Stock: 20, Activo: 'TRUE', Variantes: '[]' },
  { ID: 'p7', Nombre: 'Top Impar', Categoria: 'Tops', PrecioUSD: 7.69, Stock: 20, Activo: 'TRUE', Variantes: '[]' },
];

const ENVIOS = [
  { id: 'retiro', nombre: 'Retiro en local', precio: 0, activo: true },
  { id: 'correo_argentino', nombre: 'Correo Argentino', precio: 3500, activo: true },
];

const PROMOS = {
  envioGratisUmbralARS: 150000,
  cupones: [
    { id: 'c1', codigo: 'PRINCESS20', tipo: 'percent', valor: 20, activo: true, desc: '20% off' },
    { id: 'c2', codigo: 'ENVIOGRATIS', tipo: 'shipping', valor: 0, activo: true, desc: 'Envio gratis' },
    { id: 'c3', codigo: 'FIJO5000', tipo: 'fijo', valor: 5000, activo: true, desc: '$5000 off' },
    { id: 'c4', codigo: 'FIJOGRANDE', tipo: 'fijo', valor: 999999, activo: true, desc: 'Fijo enorme' },
    { id: 'c5', codigo: 'INFLU100', tipo: 'percent', valor: 100, activo: true, desc: 'Regalo influencer' },
    { id: 'c6', codigo: 'NEGATIVO', tipo: 'percent', valor: -20, activo: true, desc: 'Mal cargado' },
    { id: 'c7', codigo: ' influ10 ', tipo: 'percent', valor: 10, activo: true, desc: 'Cargado en minuscula' },
    { id: 'c8', codigo: 'LIMITADO', tipo: 'percent', valor: 10, usosMax: 0, activo: true, desc: 'Sin usos' },
    { id: 'c9', codigo: 'INFLUAGOTADO', tipo: 'percent', valor: 15, usosMax: 3, activo: true, desc: 'Ya usado 3 veces' },
    { id: 'c10', codigo: 'INFLUQUEDAN', tipo: 'percent', valor: 15, usosMax: 3, activo: true, desc: 'Usado 2 veces' },
    { id: 'c11', codigo: 'PASADO', tipo: 'percent', valor: 150, activo: true, desc: 'Mas de 100%' },
  ],
  flashSales: [],
  combos: [],
  dosPorUno: [{ id: 'd1', nombre: '2x1 Pijamas', categorias: ['pijamas'], activo: true }],
  preventas: [],
};

const DOLAR = 1000;
const MARGEN = 1.3;
const ars = (usd) => Math.round(usd * DOLAR * MARGEN);

/* ---------- Apps Script falso ---------- */

// Pedidos ya pagados por cupon (lo que contaria la hoja Pedidos)
const USOS = { INFLUAGOTADO: 3, INFLUQUEDAN: 2 };
const posts = [];

const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://localhost');
  const action = url.searchParams.get('action');
  res.setHeader('Content-Type', 'application/json');
  if (req.method === 'POST') {
    let body = '';
    req.on('data', (c) => (body += c));
    req.on('end', () => {
      posts.push(JSON.parse(body || '{}'));
      res.end(JSON.stringify({ success: true }));
    });
    return;
  }
  if (action === 'coupon_uses') return res.end(JSON.stringify({ usos: USOS[url.searchParams.get('code')] || 0 }));
  if (action === 'read') return res.end(JSON.stringify(PRODUCTOS));
  if (action === 'dolar') return res.end(JSON.stringify([{ Fecha: '2026-10-05', Valor: DOLAR }]));
  if (action === 'config') {
    return res.end(JSON.stringify({ promos: JSON.stringify(PROMOS), envios: JSON.stringify(ENVIOS) }));
  }
  res.end(JSON.stringify({}));
});

await new Promise((r) => server.listen(0, '127.0.0.1', r));
process.env.APPS_SCRIPT_URL = `http://127.0.0.1:${server.address().port}/exec`;
process.env.MARGEN_GANANCIA = String(MARGEN);

const { cotizarCarrito, cotizacionAItemsMP } = await import('../api/_lib/pricing.js');

/* ---------- Carrito del navegador en una sandbox ---------- */

function nuevoCarrito() {
  const storage = new Map();
  const productos = PRODUCTOS.map((p) => ({
    id: p.ID, nombre: p.Nombre, categoria: p.Categoria.toLowerCase().replace(/\s+/g, '-'), precioUSD: p.PrecioUSD, stock: p.Stock, variantes: [],
  }));
  const ctx = {
    console,
    localStorage: {
      getItem: (k) => (storage.has(k) ? storage.get(k) : null),
      setItem: (k, v) => storage.set(k, String(v)),
      removeItem: (k) => storage.delete(k),
    },
    window: { addEventListener() {}, dispatchEvent() {} },
    document: { addEventListener() {}, querySelectorAll: () => [] },
    CONFIG: { promos: PROMOS, envios: ENVIOS, sheets: { appsScriptUrl: '' } },
    SheetsService: {
      productos,
      cotizacionDolar: DOLAR,
      calcularPrecioARS: (usd, producto) => {
        if (producto?.precioARSManual) return Math.round(producto.precioARSManual);
        return Math.round(usd * DOLAR * (producto?.margenPersonalizado ?? MARGEN));
      },
      obtenerProducto: (id) => productos.find((p) => p.id === id),
      formatPrecioARS: (n) => '$' + n,
    },
  };
  vm.createContext(ctx);
  const src =
    fs.readFileSync(new URL('../js/promos.js', import.meta.url), 'utf8') + '\n' +
    fs.readFileSync(new URL('../js/cart.js', import.meta.url), 'utf8') +
    '\nglobalThis.PromoEngine = PromoEngine; globalThis.CartService = CartService;';
  vm.runInContext(src, ctx);
  ctx.PromoEngine.apply();
  const cart = ctx.CartService;
  const prod = (id) => productos.find((p) => p.id === id);
  return {
    cart,
    agregar: (id, cant = 1) => cart.addItem(prod(id), cant),
    /** Replica App.applyPromo: valida con PromoEngine y aplica */
    cupon: (code) => {
      const promo = ctx.PromoEngine.validarCupon(code);
      if (promo) cart.applyPromo(code.trim().toUpperCase(), promo);
      return promo;
    },
    envio: (id) => {
      const e = ENVIOS.find((x) => x.id === id);
      cart.setShipping(e.id, e.precio);
    },
    /** Lo que el checkout le mandaria al servidor */
    alServidor: () =>
      cotizarCarrito({
        items: cart.items.map((i) => ({ id: i.id, cantidad: i.cantidad, variante: null })),
        shippingId: cart.shippingId,
        promoCode: cart.promoCode,
      }),
  };
}

/* ---------- Utilidades ---------- */

let pasaron = 0;
let fallaron = 0;
const fallas = [];

async function test(nombre, fn) {
  try {
    await fn();
    console.log(`  ok    ${nombre}`);
    pasaron++;
  } catch (e) {
    console.log(`  FALLA ${nombre}`);
    console.log(`        ${e.message.split('\n')[0]}`);
    fallas.push(nombre);
    fallaron++;
  }
}

const sumaMP = (c) =>
  Math.round(cotizacionAItemsMP(c).reduce((s, i) => s + i.unit_price * i.quantity, 0) * 100) / 100;

/* ================= PARTE 1: servidor ================= */

console.log('\nQA cupones - servidor\n');

await test('el codigo se acepta en minuscula y con espacios', async () => {
  const c = await cotizarCarrito({ items: [{ id: 'p1', cantidad: 1 }], shippingId: 'retiro', promoCode: '  princess20 ' });
  assert.equal(c.ok, true, c.errores?.join('; '));
  assert.equal(c.descuentoCupon, ars(20) * 0.2);
});

await test('cupon cargado en minuscula en el admin igual funciona', async () => {
  const c = await cotizarCarrito({ items: [{ id: 'p1', cantidad: 1 }], shippingId: 'retiro', promoCode: 'INFLU10' });
  assert.equal(c.ok, true, c.errores?.join('; '));
  assert.equal(c.descuentoCupon, ars(20) * 0.1);
});

await test('cupon fijo descuenta el monto exacto', async () => {
  const c = await cotizarCarrito({ items: [{ id: 'p1', cantidad: 1 }], shippingId: 'correo_argentino', promoCode: 'FIJO5000' });
  assert.equal(c.descuentoCupon, 5000);
  assert.equal(c.total, ars(20) - 5000 + 3500);
});

await test('cupon fijo mayor al carrito: solo paga el envio', async () => {
  const c = await cotizarCarrito({ items: [{ id: 'p1', cantidad: 1 }], shippingId: 'correo_argentino', promoCode: 'FIJOGRANDE' });
  assert.equal(c.ok, true, c.errores?.join('; '));
  assert.equal(c.total, 3500);
});

await test('cupon fijo mayor al carrito: Mercado Pago cobra lo mismo que el total', async () => {
  const c = await cotizarCarrito({ items: [{ id: 'p1', cantidad: 1 }], shippingId: 'correo_argentino', promoCode: 'FIJOGRANDE' });
  assert.equal(sumaMP(c), c.total);
});

await test('cupon 100% para influencer con retiro: cotizacion valida en $0', async () => {
  const c = await cotizarCarrito({ items: [{ id: 'p1', cantidad: 1 }], shippingId: 'retiro', promoCode: 'INFLU100' });
  assert.equal(c.ok, true, c.errores?.join('; '));
  assert.equal(c.total, 0);
});

await test('cupon 100% con envio: solo se cobra el envio y MP cuadra', async () => {
  const c = await cotizarCarrito({ items: [{ id: 'p1', cantidad: 2 }], shippingId: 'correo_argentino', promoCode: 'INFLU100' });
  assert.equal(c.total, 3500);
  assert.equal(sumaMP(c), 3500);
  cotizacionAItemsMP(c).forEach((i) => assert.ok(i.unit_price > 0, `${i.title} = ${i.unit_price}`));
});

await test('cupon cargado con mas de 100% se toma como 100%', async () => {
  const c = await cotizarCarrito({ items: [{ id: 'p1', cantidad: 1 }], shippingId: 'correo_argentino', promoCode: 'PASADO' });
  assert.equal(c.descuentoCupon, ars(20));
  assert.equal(c.total, 3500);
});

await test('cupon con porcentaje negativo no aumenta el precio', async () => {
  const c = await cotizarCarrito({ items: [{ id: 'p1', cantidad: 1 }], shippingId: 'retiro', promoCode: 'NEGATIVO' });
  assert.ok(!c.ok || c.total <= ars(20), `total ${c.total} > precio ${ars(20)}`);
});

await test('cupon con usosMax 0 se rechaza', async () => {
  const c = await cotizarCarrito({ items: [{ id: 'p1', cantidad: 1 }], shippingId: 'retiro', promoCode: 'LIMITADO' });
  assert.equal(c.ok, false);
});

await test('cupon que ya llego a su limite de usos se rechaza', async () => {
  const c = await cotizarCarrito({ items: [{ id: 'p1', cantidad: 1 }], shippingId: 'retiro', promoCode: 'INFLUAGOTADO' });
  assert.equal(c.ok, false);
  assert.match(c.errores[0], /limite de usos/);
});

await test('cupon con usos disponibles se acepta', async () => {
  const c = await cotizarCarrito({ items: [{ id: 'p1', cantidad: 1 }], shippingId: 'retiro', promoCode: 'INFLUQUEDAN' });
  assert.equal(c.ok, true, c.errores?.join('; '));
});

await test('el cupon de envio gratis no descuenta productos', async () => {
  const c = await cotizarCarrito({ items: [{ id: 'p1', cantidad: 2 }], shippingId: 'correo_argentino', promoCode: 'ENVIOGRATIS' });
  assert.equal(c.descuentoCupon, 0);
  assert.equal(c.total, ars(20) * 2);
});

await test('2x1 de pijamas: la segunda es gratis', async () => {
  const c = await cotizarCarrito({ items: [{ id: 'p6', cantidad: 2 }], shippingId: 'retiro' });
  assert.equal(c.totalDescuentoAuto, ars(10));
  assert.equal(c.total, ars(10));
});

// A DEFINIR (no es un bug): hoy el % del cupon se calcula sobre el precio
// bruto, incluida la prenda que ya es gratis por el 2x1. Este test fija el
// comportamiento actual para que cualquier cambio sea a proposito.
await test('2x1 + cupon 20%: hoy el 20% se calcula sobre el bruto (incluye la gratis)', async () => {
  const c = await cotizarCarrito({ items: [{ id: 'p6', cantidad: 2 }], shippingId: 'retiro', promoCode: 'PRINCESS20' });
  assert.equal(c.descuentoCupon, ars(10) * 2 * 0.2);
  assert.equal(c.total, ars(10) * 2 - ars(10) - ars(10) * 2 * 0.2);
});

await test('2x1 + cupon fijo grande no deja el pedido en total invalido', async () => {
  const c = await cotizarCarrito({ items: [{ id: 'p6', cantidad: 2 }, { id: 'p1', cantidad: 1 }], shippingId: 'correo_argentino', promoCode: 'FIJO5000' });
  assert.equal(c.ok, true, c.errores?.join('; '));
  assert.equal(c.total, ars(10) * 2 + ars(20) - ars(10) - 5000 + 3500);
});

await test('cupon que baja el carrito del umbral hace pagar el envio', async () => {
  // 6 calzas = 156.000 (supera 150.000). Con 20% queda 124.800 => paga envio.
  const c = await cotizarCarrito({ items: [{ id: 'p1', cantidad: 6 }], shippingId: 'correo_argentino', promoCode: 'PRINCESS20' });
  assert.equal(c.costoEnvio, 3500);
});

await test('prorrateo con cupon: ultima linea con cantidad 3 cuadra al centavo', async () => {
  const c = await cotizarCarrito({
    items: [{ id: 'p1', cantidad: 1 }, { id: 'p7', cantidad: 3 }], shippingId: 'retiro', promoCode: 'FIJO5000',
  });
  assert.equal(c.ok, true, c.errores?.join('; '));
  assert.equal(sumaMP(c), c.total);
});

/* ================= Endpoint de pago ================= */

console.log('\nQA cupones - endpoint de Mercado Pago\n');

process.env.MP_ENABLED = 'true';
process.env.MP_ACCESS_TOKEN = 'TEST-token-falso';
const fetchReal = globalThis.fetch;
let preferenciasMP = 0;
globalThis.fetch = async (url, opts) => {
  if (String(url).includes('api.mercadopago.com')) {
    preferenciasMP++;
    return new Response(JSON.stringify({ id: 'pref-1', init_point: 'https://mp.test/pagar' }), { status: 201 });
  }
  return fetchReal(url, opts);
};
const { default: crearPreferencia } = await import('../api/mercadopago/create-preference.js');

async function pagar(body) {
  const res = {
    statusCode: 200, body: null,
    setHeader() {}, status(c) { this.statusCode = c; return this; },
    json(b) { this.body = b; return this; }, end() { return this; },
  };
  const cliente = {
    nombre: 'Ana', email: 'ana@test.com', telefono: '1155555555',
    direccion: 'Calle 1', localidad: 'Rosario', provincia: 'Santa Fe',
  };
  await crearPreferencia({ method: 'POST', headers: { host: 'tienda.test' }, body: { cliente, ...body } }, res);
  return res;
}

await test('pedido en $0 no va a Mercado Pago y ofrece WhatsApp', async () => {
  const antes = preferenciasMP;
  const r = await pagar({ items: [{ id: 'p1', cantidad: 1 }], shippingId: 'retiro', promoCode: 'INFLU100' });
  assert.equal(r.statusCode, 409);
  assert.equal(r.body.totalCero, true);
  assert.equal(preferenciasMP, antes);
});

await test('el pedido guarda el cupon usado (para contar los usos)', async () => {
  posts.length = 0;
  const r = await pagar({ items: [{ id: 'p1', cantidad: 1 }], shippingId: 'retiro', promoCode: 'princess20' });
  assert.equal(r.statusCode, 200, JSON.stringify(r.body));
  const orden = posts.find((p) => p.action === 'create_order');
  assert.equal(orden?.order?.cupon, 'PRINCESS20');
});

/* ================= PARTE 2: carrito vs servidor ================= */

console.log('\nQA cupones - lo que ve la clienta vs lo que se cobra\n');

await test('carrito simple + 20%: el carrito muestra lo mismo que se cobra', async () => {
  const t = nuevoCarrito();
  t.agregar('p1', 2);
  t.envio('correo_argentino');
  t.cupon('PRINCESS20');
  const c = await t.alServidor();
  assert.equal(t.cart.getTotalARS(), c.total);
});

await test('aplicar 20% y DESPUES agregar productos: el descuento se actualiza', async () => {
  const t = nuevoCarrito();
  t.agregar('p1', 1);
  t.envio('correo_argentino');
  t.cupon('PRINCESS20');
  t.agregar('p1', 2); // ahora son 3
  const c = await t.alServidor();
  assert.equal(t.cart.getTotalARS(), c.total, `carrito ${t.cart.getTotalARS()} vs servidor ${c.total}`);
});

await test('aplicar 20% y DESPUES quitar productos: el total no queda negativo', async () => {
  const t = nuevoCarrito();
  t.agregar('p1', 3);
  t.agregar('p7', 1);
  t.envio('retiro');
  t.cupon('PRINCESS20');
  t.cart.removeItem('p1');
  const c = await t.alServidor();
  assert.ok(t.cart.getTotalARS() >= 0, `carrito muestra ${t.cart.getTotalARS()}`);
  assert.equal(t.cart.getTotalARS(), c.total, `carrito ${t.cart.getTotalARS()} vs servidor ${c.total}`);
});

await test('ENVIOGRATIS y despues elegir envio: sigue siendo gratis', async () => {
  const t = nuevoCarrito();
  t.agregar('p1', 1);
  t.cupon('ENVIOGRATIS');
  t.envio('correo_argentino'); // como en el checkout
  const c = await t.alServidor();
  assert.equal(t.cart.getTotalARS(), c.total, `carrito ${t.cart.getTotalARS()} vs servidor ${c.total}`);
});

await test('quitar ENVIOGRATIS vuelve a cobrar el envio', async () => {
  const t = nuevoCarrito();
  t.agregar('p1', 1);
  t.envio('correo_argentino');
  t.cupon('ENVIOGRATIS');
  t.cart.removePromo();
  const c = await t.alServidor();
  assert.equal(t.cart.getTotalARS(), c.total, `carrito ${t.cart.getTotalARS()} vs servidor ${c.total}`);
});

await test('superar el umbral de envio gratis: el carrito no cobra envio', async () => {
  const t = nuevoCarrito();
  t.agregar('p1', 6); // 156.000
  t.envio('correo_argentino');
  const c = await t.alServidor();
  assert.equal(t.cart.getTotalARS(), c.total, `carrito ${t.cart.getTotalARS()} vs servidor ${c.total}`);
});

await test('2x1 + 20%: el carrito coincide con el servidor', async () => {
  const t = nuevoCarrito();
  t.agregar('p6', 2);
  t.envio('retiro');
  t.cupon('PRINCESS20');
  const c = await t.alServidor();
  assert.equal(t.cart.getTotalARS(), c.total, `carrito ${t.cart.getTotalARS()} vs servidor ${c.total}`);
});

await test('cupon fijo grande: el carrito no muestra total negativo', async () => {
  const t = nuevoCarrito();
  t.agregar('p6', 2);
  t.envio('retiro');
  t.cupon('FIJO5000');
  assert.ok(t.cart.getTotalARS() >= 0, `carrito muestra ${t.cart.getTotalARS()}`);
});

await test('cupon que baja del umbral: el carrito tambien cobra el envio', async () => {
  const t = nuevoCarrito();
  t.agregar('p1', 6);
  t.envio('correo_argentino');
  t.cupon('PRINCESS20');
  const c = await t.alServidor();
  assert.equal(t.cart.getShippingCost(), 3500);
  assert.equal(t.cart.getTotalARS(), c.total);
});

await test('300 carritos al azar: carrito = servidor = Mercado Pago', async () => {
  let semilla = 42;
  const azar = (n) => { semilla = (semilla * 1103515245 + 12345) % 2147483648; return semilla % n; };
  const codigos = [null, 'PRINCESS20', 'ENVIOGRATIS', 'FIJO5000', 'FIJOGRANDE', 'INFLU10', 'INFLU100', 'NEGATIVO', 'PASADO'];
  for (let k = 0; k < 300; k++) {
    const t = nuevoCarrito();
    ['p1', 'p6', 'p7'].forEach((id) => { const n = azar(4); if (n) t.agregar(id, n); });
    if (!t.cart.items.length) t.agregar('p7', 1);
    t.envio(azar(2) ? 'retiro' : 'correo_argentino');
    const codigo = codigos[azar(codigos.length)];
    if (codigo) t.cupon(codigo);
    if (azar(3) === 0) t.agregar('p6', 1 + azar(3)); // cambiar el carrito despues del cupon
    const c = await t.alServidor();
    const caso = `#${k} ${t.cart.items.map((i) => i.id + 'x' + i.cantidad).join(',')} ${codigo} ${t.cart.shippingId}`;
    assert.equal(c.ok, true, `${caso}: ${c.errores?.join('; ')}`);
    assert.equal(t.cart.getTotalARS(), c.total, `${caso}: carrito ${t.cart.getTotalARS()} vs servidor ${c.total}`);
    if (c.total > 0) assert.equal(sumaMP(c), c.total, `${caso}: MP ${sumaMP(c)} vs ${c.total}`);
  }
});

/* ---------- Resultado ---------- */

server.close();
console.log(`\n${pasaron} pasaron, ${fallaron} fallaron\n`);
process.exit(fallaron ? 1 : 0);
