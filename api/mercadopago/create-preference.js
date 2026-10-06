/**
 * POST /api/mercadopago/create-preference
 * ------------------------------------------------------------------
 * Crea la preferencia de pago de Checkout Pro.
 *
 * REGLA DE ORO: el navegador manda QUE quiere comprar, nunca CUANTO cuesta.
 * Los precios se recalculan aca contra Google Sheets (ver _lib/pricing.js).
 *
 * Body esperado:
 * {
 *   items: [{ id, cantidad, variante: {color, talle} | null }],
 *   shippingId: "correo_argentino",
 *   promoCode: "PRINCESS20" | null,
 *   cliente: { nombre, email, telefono, direccion, localidad, provincia },
 *   totalEsperado: 123456   // opcional, solo para detectar desfasajes
 * }
 *
 * Variables de entorno:
 *   MP_ACCESS_TOKEN   Access Token (TEST-... o APP_USR-...)
 *   FRONTEND_URL      https://tu-dominio.vercel.app  (sin barra final)
 *   APPS_SCRIPT_URL   Web App de Google Apps Script
 * ------------------------------------------------------------------
 */

import { cotizarCarrito, cotizacionAItemsMP } from '../_lib/pricing.js';
import { postToAppsScript, appsScriptUrl } from '../_lib/store.js';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

function limpiar(v, max = 200) {
  return String(v ?? '').trim().slice(0, max);
}

function frontendUrl(req) {
  const env = process.env.FRONTEND_URL;
  if (env) return env.replace(/\/$/, '');
  const host = req.headers['x-forwarded-host'] || req.headers.host;
  const proto = req.headers['x-forwarded-proto'] || 'https';
  return `${proto}://${host}`;
}

function nuevaReferencia() {
  const rnd = Math.random().toString(36).slice(2, 8);
  return `ord_${Date.now().toString(36)}_${rnd}`;
}

export default async function handler(req, res) {
  // Cobro online desactivado: los pedidos se cierran por WhatsApp.
  // Para reactivar Mercado Pago, cargar MP_ENABLED=true en Vercel.
  if (process.env.MP_ENABLED !== 'true') {
    return res.status(404).json({ error: 'No disponible' });
  }

  const origin = process.env.FRONTEND_URL || '*';
  res.setHeader('Access-Control-Allow-Origin', origin);
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Metodo no permitido' });

  const accessToken = process.env.MP_ACCESS_TOKEN;
  if (!accessToken) {
    console.error('[MP] Falta MP_ACCESS_TOKEN');
    return res.status(500).json({ error: 'La tienda todavia no tiene configurado el cobro online. Escribinos por WhatsApp.' });
  }

  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body || {};
    const { items, shippingId, promoCode, cliente = {}, totalEsperado } = body;

    /* ---------- 1. Validar datos del cliente ---------- */
    const datos = {
      nombre: limpiar(cliente.nombre, 120),
      email: limpiar(cliente.email, 120).toLowerCase(),
      telefono: limpiar(cliente.telefono, 40),
      direccion: limpiar(cliente.direccion, 200),
      localidad: limpiar(cliente.localidad, 100),
      provincia: limpiar(cliente.provincia, 100),
      medioPago: limpiar(cliente.medioPago, 50) || 'Mercado Pago',
    };

    const faltantes = ['nombre', 'email', 'telefono', 'direccion', 'localidad', 'provincia']
      .filter((k) => !datos[k]);
    if (faltantes.length) {
      return res.status(400).json({ error: `Faltan datos obligatorios: ${faltantes.join(', ')}` });
    }
    if (!EMAIL_RE.test(datos.email)) {
      return res.status(400).json({ error: 'El email no parece valido' });
    }

    /* ---------- 2. Recalcular el carrito en el servidor ---------- */
    const cot = await cotizarCarrito({ items, shippingId, promoCode });

    if (!cot.ok) {
      return res.status(409).json({
        error: cot.errores[0] || 'No pudimos confirmar tu carrito',
        errores: cot.errores,
        recalcular: true,
      });
    }

    // Mercado Pago no cobra $0 (ej. cupon 100% de influencer con retiro):
    // el checkout ofrece cerrar el pedido por WhatsApp.
    if (cot.total <= 0) {
      return res.status(409).json({
        error: 'Tu pedido quedo sin costo con este cupon. Finalizalo por WhatsApp para coordinar la entrega.',
        totalCero: true,
      });
    }

    // Aviso (no bloqueante) si el total del navegador no coincide: suele pasar
    // cuando cambio el dolar o vencio una promo mientras la clienta compraba.
    const desfasaje =
      Number.isFinite(Number(totalEsperado)) && Math.abs(Number(totalEsperado) - cot.total) > 1;
    if (desfasaje) {
      console.warn(`[MP] Total recalculado: navegador=${totalEsperado} servidor=${cot.total}`);
    }

    /* ---------- 3. Registrar el pedido como pendiente ---------- */
    const externalReference = nuevaReferencia();

    if (appsScriptUrl()) {
      try {
        await postToAppsScript('create_order', {
          order: {
            id: externalReference,
            cliente: datos.nombre,
            telefono: datos.telefono,
            email: datos.email,
            direccion: datos.direccion,
            localidad: datos.localidad,
            provincia: datos.provincia,
            estado: 'pendiente',
            medioPago: 'Mercado Pago',
            metodoEnvio: cot.envio.id,
            total: cot.total,
            costoTotal: cot.costoTotal,
            cupon: cot.cupon?.codigo || '',
            notas: [
              'Preferencia creada, esperando pago.',
              cot.cupon ? `Cupon: ${cot.cupon.codigo}` : '',
              cot.descuentosAuto.map((d) => d.label).join(', '),
            ].filter(Boolean).join(' | '),
            items: cot.lineas.map((l) => ({
              productoId: l.id,
              nombre: l.nombre,
              variante: l.variante,
              cantidad: l.cantidad,
              precioUnitario: l.precioUnitario,
            })),
            mpStatus: 'pending',
          },
        });
      } catch (e) {
        // No abortamos el pago: el webhook vuelve a intentar registrar el pedido.
        console.error('[MP] No se pudo pre-registrar el pedido:', e.message);
      }
    }

    /* ---------- 4. Crear la preferencia en Mercado Pago ---------- */
    const base = frontendUrl(req);
    const telDigits = datos.telefono.replace(/\D/g, '');

    const preference = {
      items: cotizacionAItemsMP(cot),
      payer: {
        name: datos.nombre,
        email: datos.email,
        phone: telDigits ? { area_code: '', number: telDigits } : undefined,
        address: {
          street_name: datos.direccion,
          zip_code: '',
        },
      },
      back_urls: {
        success: `${base}/?pago=ok&ref=${externalReference}`,
        failure: `${base}/?pago=error&ref=${externalReference}`,
        pending: `${base}/?pago=pendiente&ref=${externalReference}`,
      },
      auto_return: 'approved',
      external_reference: externalReference,
      notification_url: `${base}/api/mercadopago/webhook`,
      statement_descriptor: 'PRINCESSLOV',
      binary_mode: false,
      metadata: {
        store: 'princesslov',
        envio_id: cot.envio.id,
        envio_nombre: cot.envio.nombre,
        envio_precio: cot.costoEnvio,
        cupon: cot.cupon?.codigo || '',
        localidad: datos.localidad,
        provincia: datos.provincia,
        telefono: datos.telefono,
      },
    };

    const mpRes = await fetch('https://api.mercadopago.com/checkout/preferences', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
        'X-Idempotency-Key': externalReference,
      },
      body: JSON.stringify(preference),
    });

    const data = await mpRes.json();

    if (!mpRes.ok) {
      console.error('[MP] Error creando preferencia:', JSON.stringify(data));
      return res.status(502).json({
        error: 'Mercado Pago rechazo la solicitud. Proba de nuevo o escribinos por WhatsApp.',
      });
    }

    const usarSandbox = process.env.MP_USE_SANDBOX === 'true';
    const checkoutUrl = usarSandbox && data.sandbox_init_point ? data.sandbox_init_point : data.init_point;

    return res.status(200).json({
      preference_id: data.id,
      init_point: checkoutUrl,
      external_reference: externalReference,
      total: cot.total,
      recalculado: desfasaje,
      resumen: {
        subtotal: cot.subtotalLineas,
        descuentos: cot.totalDescuentoAuto + cot.descuentoCupon,
        envio: cot.costoEnvio,
        total: cot.total,
      },
    });
  } catch (error) {
    console.error('[MP] Error interno:', error);
    return res.status(500).json({ error: 'Error interno. Proba de nuevo en un momento.' });
  }
}
