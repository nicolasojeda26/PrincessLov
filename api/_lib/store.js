/**
 * api/_lib/store.js
 * ------------------------------------------------------------------
 * Acceso a los datos de la tienda DESDE EL SERVIDOR.
 *
 * Por que existe: el navegador NO es una fuente confiable de precios.
 * Todo lo que se cobra se recalcula aca, leyendo la misma planilla de
 * Google Sheets que usa el panel admin.
 *
 * Variables de entorno (Vercel > Settings > Environment Variables):
 *   APPS_SCRIPT_URL   URL /exec del Web App de Google Apps Script
 *   SHEETS_CSV_URL    (opcional) CSV publicado, se usa si falla Apps Script
 *   DOLAR_CONVERSION  (opcional) dolar fijo SOLO para pasar a pesos datos viejos en USD. Default 1570
 *   MARGEN_GANANCIA   (opcional) markup global. Default 1.30
 * ------------------------------------------------------------------
 */

const CACHE_MS = 60 * 1000; // 1 minuto: suficiente para no golpear Sheets en cada pago
const _cache = new Map();

async function cached(key, fn) {
  const hit = _cache.get(key);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.value;
  const value = await fn();
  _cache.set(key, { at: Date.now(), value });
  return value;
}

export function appsScriptUrl() {
  const url = process.env.APPS_SCRIPT_URL || '';
  if (!url || url.includes('TU_SCRIPT_ID')) return null;
  return url;
}

export function margenGlobal() {
  return Number(process.env.MARGEN_GANANCIA) || 1.30;
}

/** Redondeo de precios calculados (tiene que coincidir con CONFIG.cotizacion.redondeo de data/config.js) */
export function redondeoGlobal() {
  const v = process.env.REDONDEO;
  return v !== undefined && v !== '' && Number(v) >= 0 ? Number(v) : 500;
}

/**
 * Todo en pesos (nov/2026): el dolar ya no se consulta. Este valor fijo solo pasa a
 * pesos datos viejos que quedaron en USD (igual que CONFIG.cotizacion.dolarConversion).
 */
export function dolarConversion() {
  return Number(process.env.DOLAR_CONVERSION) || 1570;
}

/* ================= Apps Script ================= */

export async function getFromAppsScript(action, params = {}) {
  const base = appsScriptUrl();
  if (!base) throw new Error('APPS_SCRIPT_URL no configurada');

  const url = new URL(base);
  url.searchParams.set('action', action);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  if (process.env.APPS_SCRIPT_ADMIN_TOKEN) url.searchParams.set('token', process.env.APPS_SCRIPT_ADMIN_TOKEN);

  const res = await fetch(url, {
    method: 'GET',
    headers: { Accept: 'application/json' },
    redirect: 'follow', // Apps Script siempre redirige a googleusercontent
  });
  if (!res.ok) throw new Error(`Apps Script GET ${action}: HTTP ${res.status}`);
  return res.json();
}

export async function postToAppsScript(action, payload = {}) {
  const base = appsScriptUrl();
  if (!base) throw new Error('APPS_SCRIPT_URL no configurada');

  // El servidor es de confianza: firma sus llamadas con el token de admin
  // (misma clave que ADMIN_TOKEN en las propiedades del Apps Script).
  const token = process.env.APPS_SCRIPT_ADMIN_TOKEN || '';
  const res = await fetch(base, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify({ action, ...payload, ...(token ? { token } : {}) }),
    redirect: 'follow',
  });
  if (!res.ok) throw new Error(`Apps Script POST ${action}: HTTP ${res.status}`);
  return res.json();
}

/* ================= Productos ================= */

function num(v) {
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : 0;
}

function bool(v) {
  return v === true || v === 'TRUE' || v === 'true' || v === 1;
}

function parseJSONSafe(str, fallback) {
  try {
    if (str == null || str === '') return fallback;
    if (typeof str === 'object') return str;
    return JSON.parse(str);
  } catch {
    return fallback;
  }
}

/** Mismo mapeo que js/sheets.js mapAppsScriptProducts, para que los precios coincidan */
function mapProducto(p) {
  return {
    id: String(p.ID ?? ''),
    nombre: p.Nombre || 'Sin nombre',
    categoria: String(p.Categoria || '').toLowerCase().replace(/\s+/g, '-'),
    precioUSD: num(p.PrecioUSD),
    precioARSManual: p.PrecioARSManual ? num(p.PrecioARSManual) : null,
    precioOferta: p.PrecioOferta ? num(p.PrecioOferta) : null,
    margenPersonalizado: p.MargenPersonalizado ? num(p.MargenPersonalizado) / 100 : null,
    gananciaPct: p.GananciaPct !== undefined && p.GananciaPct !== '' && p.GananciaPct !== null && Number.isFinite(Number(p.GananciaPct)) ? Number(p.GananciaPct) : null,
    costoMoneda: String(p.CostoMoneda || '').toUpperCase() === 'ARS' ? 'ARS' : 'USD',
    costoARS: num(p.CostoARS),
    imagen: p.Imagen || '',
    stock: parseInt(p.Stock, 10) || 0,
    variantes: parseJSONSafe(p.Variantes, []),
    tags: p.Tags ? String(p.Tags).split(',').map((t) => t.trim().toLowerCase()) : [],
    activo: bool(p.Activo),
  };
}

/* --- CSV de respaldo --- */

function parseCSVLine(line) {
  const out = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') { cur += '"'; i++; }
      else inQuotes = !inQuotes;
    } else if (ch === ',' && !inQuotes) {
      out.push(cur); cur = '';
    } else {
      cur += ch;
    }
  }
  out.push(cur);
  return out.map((s) => s.trim());
}

async function productosDesdeCSV() {
  const url = process.env.SHEETS_CSV_URL;
  if (!url || url.includes('TU_SHEET_ID')) return [];
  const res = await fetch(url);
  if (!res.ok) return [];
  const text = await res.text();
  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  if (lines.length < 2) return [];
  const headers = parseCSVLine(lines[0]);
  return lines.slice(1).map((line) => {
    const cells = parseCSVLine(line);
    const row = {};
    headers.forEach((h, i) => { row[h] = cells[i] ?? ''; });
    return mapProducto(row);
  });
}

/** Devuelve un Map id -> producto, solo activos */
export async function getProductos() {
  return cached('productos', async () => {
    let lista = [];
    try {
      const raw = await getFromAppsScript('read', { sheet: 'productos' });
      if (Array.isArray(raw)) lista = raw.map(mapProducto);
    } catch (e) {
      console.warn('[store] Apps Script productos fallo, intento CSV:', e.message);
    }
    if (!lista.length) {
      try { lista = await productosDesdeCSV(); } catch (e) {
        console.warn('[store] CSV fallo:', e.message);
      }
    }
    const map = new Map();
    lista.filter((p) => p.activo && p.id).forEach((p) => map.set(String(p.id), p));
    return map;
  });
}

/* ================= Dolar (solo datos viejos) ================= */

/** Se mantiene el nombre por compatibilidad: devuelve el dolar fijo de conversion, sin consultar nada */
export async function getCotizacion() {
  return dolarConversion();
}

/* ================= Config (promos + envios) ================= */

/**
 * Envios de respaldo. Deben coincidir con CONFIG.envios de data/config.js.
 * Si la hoja Config tiene la clave "envios" (JSON), esa gana y este bloque
 * queda como red de seguridad.
 */
const ENVIOS_FALLBACK = [
  { id: 'retiro', nombre: 'Retiro en local', precio: 0, activo: true },
  { id: 'envio_gratis_iguazu', nombre: 'Envio gratis Puerto Iguazu', precio: 0, activo: true },
  { id: 'neo_encomienda', nombre: 'Neo Encomienda', precio: 2500, activo: true },
  { id: 'correo_argentino', nombre: 'Correo Argentino', precio: 3500, activo: true },
  { id: 'flecha_bootstrap', nombre: 'Flecha Cargo / Via Cargo', precio: 4000, activo: true },
];

export async function getStoreConfig() {
  return cached('config', async () => {
    let raw = {};
    try {
      raw = (await getFromAppsScript('config')) || {};
    } catch (e) {
      console.warn('[store] config Apps Script fallo:', e.message);
    }

    const promos = parseJSONSafe(raw.promos, {}) || {};
    const envios = parseJSONSafe(raw.envios, null);

    return {
      promos,
      envios: Array.isArray(envios) && envios.length ? envios : ENVIOS_FALLBACK,
      envioGratisUmbralARS: num(promos.envioGratisUmbralARS) || 150000,
      // El admin lo guarda en la hoja Config; si no esta, el valor por defecto de Vercel
      redondeo: raw.redondeo !== undefined && raw.redondeo !== '' && Number(raw.redondeo) >= 0 ? Number(raw.redondeo) : redondeoGlobal(),
    };
  });
}

/* ================= Usos de cupones ================= */

/**
 * Cuantos pedidos ya pagados usaron un cupon (para respetar "Usos max.").
 * Sin cache: el limite tiene que valer en el momento de cada compra.
 * Devuelve null si no se puede saber (Apps Script sin configurar, caido o
 * desactualizado): en ese caso no se bloquea la venta.
 */
export async function getUsosCupon(codigo) {
  if (!appsScriptUrl()) return null;
  try {
    const data = await getFromAppsScript('coupon_uses', { code: codigo });
    return Number.isFinite(Number(data?.usos)) ? Number(data.usos) : null;
  } catch (e) {
    console.warn('[store] no se pudieron contar los usos del cupon:', e.message);
    return null;
  }
}
