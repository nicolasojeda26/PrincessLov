/**
 * POST /api/mercadopago/webhook
 * ------------------------------------------------------------------
 * Unica fuente de verdad sobre si un pago se acredito.
 *
 * Que cambio respecto de la version anterior:
 *  - Valida la firma x-signature (antes cualquiera podia inventar pagos).
 *  - Procesa ANTES de responder: en serverless, responder primero mata el
 *    proceso y el pedido nunca se actualizaba.
 *  - Descuenta stock cuando el pago queda aprobado.
 *
 * Configurar en: Mercado Pago > Tus integraciones > Webhooks
 *   URL:     https://tu-dominio.vercel.app/api/mercadopago/webhook
 *   Evento:  Pagos
 *
 * Variables de entorno:
 *   MP_ACCESS_TOKEN     Access Token
 *   MP_WEBHOOK_SECRET   "Clave secreta" que muestra el panel de webhooks
 *   APPS_SCRIPT_URL     Web App de Google Apps Script
 * ------------------------------------------------------------------
 */

import crypto from 'node:crypto';
import { postToAppsScript, appsScriptUrl } from '../_lib/store.js';

/**
 * Firma de Mercado Pago.
 * Manifest: id:<data.id>;request-id:<x-request-id>;ts:<ts>;
 */
function firmaValida(req) {
  const secret = process.env.MP_WEBHOOK_SECRET;

  if (!secret) {
    // Sin secreto no podemos verificar. Lo permitimos para no romper la tienda,
    // pero queda registrado: configuralo apenas puedas.
    console.warn('[MP Webhook] MP_WEBHOOK_SECRET no configurado: notificacion aceptada sin verificar');
    return true;
  }

  const signature = req.headers['x-signature'];
  const requestId = req.headers['x-request-id'] || '';
  if (!signature) return false;

  const partes = {};
  String(signature).split(',').forEach((p) => {
    const [k, v] = p.split('=');
    if (k && v) partes[k.trim()] = v.trim();
  });

  const ts = partes.ts;
  const hash = partes.v1;
  if (!ts || !hash) return false;

  // Rechazar notificaciones viejas (replay): 5 minutos de tolerancia
  const edadMs = Math.abs(Date.now() - Number(ts) * 1000);
  if (Number.isFinite(edadMs) && edadMs > 5 * 60 * 1000) {
    console.warn('[MP Webhook] Notificacion fuera de ventana temporal');
    return false;
  }

  let dataId = req.query?.['data.id'] ?? req.query?.id ?? '';
  dataId = String(dataId);
  if (/[a-zA-Z]/.test(dataId)) dataId = dataId.toLowerCase();

  const manifest = `id:${dataId};request-id:${requestId};ts:${ts};`;
  const esperado = crypto.createHmac('sha256', secret).update(manifest).digest('hex');

  try {
    return crypto.timingSafeEqual(Buffer.from(esperado, 'hex'), Buffer.from(hash, 'hex'));
  } catch {
    return false;
  }
}

async function traerPago(paymentId) {
  const accessToken = process.env.MP_ACCESS_TOKEN;
  if (!accessToken) throw new Error('MP_ACCESS_TOKEN no configurado');

  const res = await fetch(`https://api.mercadopago.com/v1/payments/${paymentId}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) throw new Error(`No se pudo leer el pago ${paymentId}: HTTP ${res.status}`);
  return res.json();
}

export default async function handler(req, res) {
  // Cobro online desactivado: los pedidos se cierran por WhatsApp.
  // Para reactivar Mercado Pago, cargar MP_ENABLED=true en Vercel.
  if (process.env.MP_ENABLED !== 'true') {
    return res.status(404).json({ error: 'No disponible' });
  }

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Metodo no permitido' });

  if (!firmaValida(req)) {
    console.error('[MP Webhook] Firma invalida, notificacion descartada');
    return res.status(401).json({ error: 'Firma invalida' });
  }

  const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : req.body || {};
  const tipo = body.type || body.topic || req.query?.type || req.query?.topic;
  const paymentId = body?.data?.id || req.query?.['data.id'] || req.query?.id;

  // Solo nos interesan los pagos. El resto se confirma y se ignora.
  if (tipo !== 'payment' || !paymentId) {
    return res.status(200).json({ received: true, ignored: true });
  }

  try {
    const pago = await traerPago(paymentId);
    const ref = pago.external_reference;

    if (!ref) {
      console.warn(`[MP Webhook] Pago ${paymentId} sin external_reference`);
      return res.status(200).json({ received: true, sinReferencia: true });
    }

    console.log(`[MP Webhook] Pago ${paymentId} -> ${pago.status} (${pago.status_detail}) ref=${ref}`);

    if (appsScriptUrl()) {
      await postToAppsScript('webhook_mp', {
        externalReference: ref,
        mpPaymentId: String(paymentId),
        status: pago.status,
        statusDetail: pago.status_detail,
        amount: pago.transaction_amount,
        currency: pago.currency_id,
        payerEmail: pago.payer?.email || '',
        cupon: pago.metadata?.cupon || '',
        paidAt: pago.date_approved || '',
        // El Apps Script descuenta stock solo la primera vez que ve "approved"
        descontarStock: pago.status === 'approved',
      });
    } else {
      console.warn('[MP Webhook] APPS_SCRIPT_URL sin configurar: el pedido no se guardo');
    }

    return res.status(200).json({ received: true, status: pago.status });
  } catch (error) {
    console.error('[MP Webhook] Error procesando:', error.message);
    // 500 hace que Mercado Pago reintente la notificacion mas tarde.
    return res.status(500).json({ error: 'Error procesando la notificacion' });
  }
}
