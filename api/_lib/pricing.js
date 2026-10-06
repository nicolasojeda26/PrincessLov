/**
 * api/_lib/pricing.js
 * ------------------------------------------------------------------
 * Motor de precios AUTORITATIVO.
 *
 * Replica la logica de js/promos.js y js/sheets.js pero del lado del
 * servidor. El navegador solo manda que producto y que cantidad quiere
 * comprar; el precio SIEMPRE se calcula aca contra la planilla.
 *
 * Si cambias una regla de precios en js/promos.js, cambiala tambien aca.
 * ------------------------------------------------------------------
 */

import { getProductos, getCotizacion, getStoreConfig, margenGlobal, getUsosCupon } from './store.js';

const arr = (a) => (Array.isArray(a) ? a : []);
const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);

/* ================= Normalizacion de promociones ================= */

/** Un valor mal cargado (negativo, o mas de 100%) nunca puede encarecer ni regalar de mas */
function valorCupon(c) {
  const v = Math.max(0, num(c.valor));
  return c.tipo === 'fijo' ? v : Math.min(100, v);
}

export function normalizePromos(cfg) {
  return {
    envioGratisUmbralARS: (cfg?.envioGratisUmbralARS === '' || cfg?.envioGratisUmbralARS == null) ? 150000 : Math.max(0, num(cfg.envioGratisUmbralARS)),
    cupones: arr(cfg?.cupones).map((c) => ({
      id: String(c.id || 'cup_' + String(c.codigo || '').toLowerCase()),
      codigo: String(c.codigo || '').toUpperCase().trim(),
      tipo: ['percent', 'fijo', 'shipping'].includes(c.tipo) ? c.tipo : 'percent',
      valor: valorCupon(c),
      usosMax: c.usosMax == null ? 1000 : num(c.usosMax),
      activo: c.activo !== false,
      desc: c.desc || '',
    })),
    flashSales: arr(cfg?.flashSales).map((f) => ({
      id: String(f.id || 'flash'),
      nombre: f.nombre || 'Flash Sale',
      descuento: Math.max(0, Math.min(90, num(f.descuento))),
      desde: f.desde || null,
      hasta: f.hasta || null,
      categorias: arr(f.categorias),
      activo: f.activo !== false,
    })),
    combos: arr(cfg?.combos).map((c) => ({
      id: String(c.id || 'combo'),
      nombre: c.nombre || 'Combo',
      productoIds: arr(c.productoIds).map(String),
      precioUSD: num(c.precioUSD),
      activo: c.activo !== false,
    })),
    dosPorUno: arr(cfg?.dosPorUno).map((d) => ({
      id: String(d.id || 'duo'),
      nombre: d.nombre || '2x1',
      categorias: arr(d.categorias),
      activo: d.activo !== false,
    })),
    preventas: arr(cfg?.preventas).map((p) => ({
      id: String(p.id || 'prev'),
      productoId: String(p.productoId || ''),
      precioUSD: num(p.precioUSD),
      fechaLanzamiento: p.fechaLanzamiento || null,
      activo: p.activo !== false,
    })),
  };
}

/* ================= Precio unitario ================= */

function enVentana(f, ahora) {
  if (!f.desde && !f.hasta) return true;
  if (f.desde && ahora < new Date(f.desde).getTime()) return false;
  if (f.hasta && ahora > new Date(f.hasta).getTime()) return false;
  return true;
}

function flashDeProducto(producto, promos, ahora) {
  return (
    promos.flashSales.find(
      (f) =>
        f.activo &&
        f.descuento > 0 &&
        enVentana(f, ahora) &&
        (!f.categorias.length || f.categorias.includes(producto.categoria))
    ) || null
  );
}

function preventaDeProducto(producto, promos, ahora) {
  const p = promos.preventas.find((x) => x.activo && String(x.productoId) === String(producto.id));
  if (!p) return null;
  if (p.fechaLanzamiento && ahora >= new Date(p.fechaLanzamiento).getTime()) return null;
  return p;
}

/** Equivalente a SheetsService.calcularPrecioARS */
export function calcularPrecioARS(precioUSD, producto, dolar, margen) {
  if (producto?.precioARSManual) return Math.round(producto.precioARSManual);
  const m = producto?.margenPersonalizado ?? margen;
  return Math.round(precioUSD * dolar * m);
}

/** Equivalente a PromoEngine.precioVistaARS / precioCompraARS */
export function precioUnitarioARS(producto, promos, dolar, margen, ahora = Date.now()) {
  let usd = num(producto.precioUSD);

  const flash = flashDeProducto(producto, promos, ahora);
  if (flash) usd = usd * (1 - flash.descuento / 100);

  const prev = preventaDeProducto(producto, promos, ahora);
  if (prev && prev.precioUSD > 0) usd = prev.precioUSD;

  const base = calcularPrecioARS(usd, producto, dolar, margen);

  if (producto.precioOferta > 0 && producto.precioOferta < base) {
    return Math.round(producto.precioOferta);
  }
  return base;
}

/* ================= Stock (respeta variantes) ================= */

function stockDisponible(producto, variante) {
  if (variante && Array.isArray(producto.variantes) && producto.variantes.length) {
    const v = producto.variantes.find(
      (vv) => vv.color === variante.color && vv.talle === variante.talle
    );
    if (v) return num(v.stock);
  }
  return num(producto.stock);
}

/* ================= Descuentos automaticos ================= */

function descuentoDosPorUno(lineas, promos) {
  const duos = promos.dosPorUno.filter((d) => d.activo);
  if (!duos.length) return 0;

  const gratis = [];
  lineas.forEach((l) => {
    const aplica = duos.some((d) => !d.categorias.length || d.categorias.includes(l.categoria));
    if (!aplica) return;
    const n = Math.floor(l.cantidad / 2);
    for (let i = 0; i < n; i++) gratis.push(l.precioUnitario);
  });
  gratis.sort((a, b) => a - b);
  return Math.round(gratis.reduce((s, v) => s + v, 0));
}

function descuentoCombos(lineas, promos, dolar, margen) {
  let total = 0;
  promos.combos
    .filter((c) => c.activo && c.productoIds.length)
    .forEach((c) => {
      const presente = c.productoIds.every((rid) =>
        lineas.some((l) => String(l.id) === String(rid) && l.cantidad > 0)
      );
      if (!presente) return;

      const miembros = lineas.filter((l) => c.productoIds.includes(String(l.id)));
      const sumaARS = miembros.reduce((s, l) => s + l.precioUnitario * l.cantidad, 0);

      if (c.precioUSD > 0) {
        const precioCombo = calcularPrecioARS(c.precioUSD, null, dolar, margen);
        if (precioCombo > 0 && precioCombo < sumaARS) total += sumaARS - precioCombo;
      } else {
        total += sumaARS * 0.1;
      }
    });
  return Math.round(total);
}

export function validarCupon(codigo, promos) {
  const cod = String(codigo || '').trim().toUpperCase();
  if (!cod) return null;
  return promos.cupones.find((c) => c.activo && c.codigo === cod) || null;
}

/* ================= Cotizacion del carrito ================= */

/**
 * Calcula el total real a cobrar.
 *
 * @param {Object} input
 * @param {Array}  input.items      [{ id, cantidad, variante: {color, talle}|null }]
 * @param {string} input.shippingId id de CONFIG.envios
 * @param {string} input.promoCode  codigo de cupon (opcional)
 * @returns {Promise<Object>} cotizacion completa
 */
export async function cotizarCarrito({ items, shippingId, promoCode }) {
  const errores = [];

  if (!Array.isArray(items) || items.length === 0) {
    return { ok: false, errores: ['El carrito esta vacio'] };
  }
  if (items.length > 50) {
    return { ok: false, errores: ['Demasiados productos en el carrito'] };
  }

  const [productos, dolar, storeConfig] = await Promise.all([
    getProductos(),
    getCotizacion(),
    getStoreConfig(),
  ]);

  if (!productos.size) {
    return {
      ok: false,
      errores: ['No se pudo leer el catalogo. Intenta de nuevo en un minuto.'],
    };
  }

  const promos = normalizePromos(storeConfig.promos);
  const margen = margenGlobal();
  const ahora = Date.now();

  /* --- Lineas --- */
  const lineas = [];

  for (const raw of items) {
    const id = String(raw?.id ?? '');
    const cantidad = Math.floor(num(raw?.cantidad));
    const variante = raw?.variante && raw.variante.color != null ? raw.variante : null;

    if (!id) { errores.push('Producto sin identificar en el carrito'); continue; }
    if (cantidad <= 0) { errores.push(`Cantidad invalida para el producto ${id}`); continue; }
    if (cantidad > 20) { errores.push(`Cantidad demasiado alta para ${id}`); continue; }

    const producto = productos.get(id);
    if (!producto) {
      errores.push(`Un producto de tu carrito ya no esta disponible`);
      continue;
    }

    const disponible = stockDisponible(producto, variante);
    if (disponible <= 0) {
      errores.push(`${producto.nombre}: sin stock`);
      continue;
    }
    if (cantidad > disponible) {
      errores.push(`${producto.nombre}: solo quedan ${disponible} unidades`);
      continue;
    }

    const precioUnitario = precioUnitarioARS(producto, promos, dolar, margen, ahora);
    if (precioUnitario <= 0) {
      errores.push(`${producto.nombre}: precio no disponible`);
      continue;
    }

    lineas.push({
      id: producto.id,
      nombre: producto.nombre,
      categoria: producto.categoria,
      imagen: producto.imagen,
      variante: variante ? `${variante.color} / ${variante.talle}` : null,
      _variant: variante,
      cantidad,
      precioUnitario,
      subtotal: precioUnitario * cantidad,
      precioUSD: producto.precioUSD,
    });
  }

  if (errores.length) return { ok: false, errores };

  /* --- Totales --- */
  const subtotalLineas = lineas.reduce((s, l) => s + l.subtotal, 0);

  const descuentosAuto = [];
  const d2x1 = descuentoDosPorUno(lineas, promos);
  if (d2x1 > 0) descuentosAuto.push({ id: '2x1', label: 'Promo 2x1', monto: d2x1 });
  const dCombo = descuentoCombos(lineas, promos, dolar, margen);
  if (dCombo > 0) descuentosAuto.push({ id: 'combos', label: 'Combos', monto: dCombo });
  const totalAuto = descuentosAuto.reduce((s, d) => s + d.monto, 0);

  /* --- Envio --- */
  const envio = storeConfig.envios.find((e) => e.id === shippingId && e.activo !== false);
  if (!envio) {
    return { ok: false, errores: ['Selecciona un metodo de envio valido'] };
  }
  let costoEnvio = num(envio.precio);

  /* --- Cupon --- */
  let descuentoCupon = 0;
  let cuponAplicado = null;
  if (promoCode) {
    const cupon = validarCupon(promoCode, promos);
    if (!cupon || cupon.usosMax <= 0) {
      return { ok: false, errores: ['El codigo de descuento no es valido o expiro'] };
    }
    const usados = await getUsosCupon(cupon.codigo);
    if (usados != null && usados >= cupon.usosMax) {
      return { ok: false, errores: ['El codigo de descuento ya alcanzo su limite de usos'] };
    }
    cuponAplicado = { codigo: cupon.codigo, tipo: cupon.tipo, valor: cupon.valor };
    if (cupon.tipo === 'percent') {
      descuentoCupon = Math.round((subtotalLineas * cupon.valor) / 100);
    } else if (cupon.tipo === 'fijo') {
      descuentoCupon = Math.min(Math.round(cupon.valor), subtotalLineas);
    } else if (cupon.tipo === 'shipping') {
      costoEnvio = 0;
    }
  }

  /* --- Envio gratis por umbral --- */
  const baseUmbral = subtotalLineas - totalAuto - descuentoCupon;
  if (promos.envioGratisUmbralARS > 0 && baseUmbral >= promos.envioGratisUmbralARS) {
    costoEnvio = 0;
  }

  // Puede dar 0 (ej. cupon 100% de influencer con retiro): la cotizacion es
  // valida, pero Mercado Pago no cobra $0 y create-preference lo deriva.
  const total = Math.max(0, subtotalLineas - totalAuto - descuentoCupon + costoEnvio);

  /* --- Costo estimado (para el margen que muestra el admin) --- */
  const costoTotal = Math.round(
    lineas.reduce((s, l) => s + l.precioUSD * l.cantidad, 0) * dolar
  );

  return {
    ok: true,
    errores: [],
    lineas,
    subtotalLineas,
    descuentosAuto,
    totalDescuentoAuto: totalAuto,
    cupon: cuponAplicado,
    descuentoCupon,
    envio: { id: envio.id, nombre: envio.nombre, precio: costoEnvio },
    costoEnvio,
    total,
    costoTotal,
    cotizacionDolar: dolar,
  };
}

/**
 * Convierte la cotizacion en los items que entiende Mercado Pago.
 * Los descuentos van como una linea negativa no se permite en MP, asi que
 * se prorratean sobre el precio unitario de cada linea y el resto se ajusta
 * en la ultima, para que la suma de MP sea exactamente el total calculado.
 * Se trabaja en centavos: si el resto no se divide justo por la cantidad,
 * la ultima linea se parte en dos (ej. 2 x $9104,27 + 1 x $9104,28).
 */
export function cotizacionAItemsMP(cot) {
  const descuentoTotal = cot.totalDescuentoAuto + cot.descuentoCupon;
  const netoProductos = Math.max(0, cot.subtotalLineas - descuentoTotal);
  const items = [];

  const itemDe = (l, quantity, unitPrice) => ({
    id: String(l.id),
    title: l.variante ? `${l.nombre} (${l.variante})` : l.nombre,
    quantity,
    unit_price: unitPrice,
    currency_id: 'ARS',
    picture_url: l.imagen || undefined,
    category_id: 'fashion',
  });

  if (descuentoTotal <= 0) {
    cot.lineas.forEach((l) => items.push(itemDe(l, l.cantidad, l.precioUnitario)));
  } else if (netoProductos > 0) {
    // Prorrateo proporcional al peso de cada linea
    const factor = netoProductos / cot.subtotalLineas;
    const objetivoCts = Math.round(netoProductos * 100);
    let acumuladoCts = 0;
    cot.lineas.forEach((l, i) => {
      if (i < cot.lineas.length - 1) {
        const unitCts = Math.max(1, Math.round(l.precioUnitario * factor * 100));
        acumuladoCts += unitCts * l.cantidad;
        items.push(itemDe(l, l.cantidad, unitCts / 100));
        return;
      }
      // La ultima linea absorbe el redondeo para cuadrar al centavo exacto
      const restoCts = objetivoCts - acumuladoCts;
      const baseCts = Math.max(1, Math.floor(restoCts / l.cantidad));
      const conCentavoExtra = Math.max(0, restoCts - baseCts * l.cantidad);
      if (l.cantidad - conCentavoExtra > 0) {
        items.push(itemDe(l, l.cantidad - conCentavoExtra, baseCts / 100));
      }
      if (conCentavoExtra > 0) items.push(itemDe(l, conCentavoExtra, (baseCts + 1) / 100));
    });
  }
  // netoProductos === 0: los productos quedaron bonificados por completo y
  // MP no acepta items en $0, asi que solo se cobra el envio.

  if (cot.costoEnvio > 0) {
    items.push({
      id: 'envio',
      title: netoProductos > 0 || !cot.lineas.length
        ? `Envio - ${cot.envio.nombre}`
        : `Envio - ${cot.envio.nombre} (productos bonificados)`,
      quantity: 1,
      unit_price: cot.costoEnvio,
      currency_id: 'ARS',
      category_id: 'services',
    });
  }

  return items;
}
