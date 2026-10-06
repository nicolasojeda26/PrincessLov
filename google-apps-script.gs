/**
 * Google Apps Script - Backend de PrincessLov (Google Sheets)
 *
 * INSTRUCCIONES DE DEPLOY (ver también SEGURIDAD.md):
 * 1. Abrí tu Google Sheet > Extensiones > Apps Script
 * 2. Borrá el código por defecto y pegá este archivo completo. Guardá.
 * 3. Configuración del proyecto (ícono ⚙️) > Propiedades del script > Agregar:
 *      ADMIN_TOKEN     = una clave larga y aleatoria (32+ caracteres).
 *                        La misma se pega en Admin > Configuración > "Token de administración"
 *                        y, si usás las funciones de /api, en Vercel como APPS_SCRIPT_ADMIN_TOKEN.
 *      SPREADSHEET_ID  = (opcional) el ID de la planilla, si el script no está dentro de ella.
 * 4. Ejecutá una vez la función setupSheets (menú ▶) y aceptá los permisos.
 *    Después ejecutá una vez autorizarDrive (permiso de Drive para las fotos).
 * 5. Implementar > Nueva implementación > Aplicación web
 *      - Ejecutar como: Yo
 *      - Quién tiene acceso: Cualquier usuario
 * 6. Copiá la URL /exec y pegala en data/config.js > sheets.appsScriptUrl.
 *
 * MODELO DE SEGURIDAD
 * - Cualquiera puede: leer el catálogo (solo productos activos), leer la config
 *   pública de la tienda, consultar stock, y CREAR pedidos / leads / suscripciones /
 *   solicitudes de arrepentimiento (validados, con límite de frecuencia).
 * - Solo con ADMIN_TOKEN: leer pedidos, gastos y leads, editar productos,
 *   pedidos, gastos y configuración. Sin ADMIN_TOKEN configurado, todo lo
 *   administrativo queda bloqueado.
 * - Todo texto que llega de la web se limpia para evitar "inyección de
 *   fórmulas" en la planilla (celdas que empiezan con = + - @).
 */

// ============================================
// CONFIGURACIÓN
// ============================================
const SPREADSHEET_ID = 'TU_SHEET_ID_AQUI'; // o usá la propiedad SPREADSHEET_ID
const SHEET_NAMES = {
  PRODUCTOS: 'Productos',
  PEDIDOS: 'Pedidos',
  GASTOS: 'Gastos',
  CONFIG: 'Config',
  DOLAR: 'Dolar_Historial',
  CLUBPRINCE: 'ClubPrince_Leads',
  NEWSLETTER: 'Newsletter',
  ARREPENTIMIENTO: 'Arrepentimiento',
};

const HEADERS = {
  PRODUCTOS: [
    'ID', 'Nombre', 'Categoria', 'Subcategoria', 'Descripcion', 'PrecioUSD',
    'Imagen', 'Stock', 'Activo', 'Tags', 'SKU', 'PrecioARSManual', 'PrecioOferta',
    'MargenPersonalizado', 'Peso', 'Dimensiones', 'Galeria', 'Variantes',
    'Caracteristicas', 'Destacado', 'SoloWeb', 'SEOTitle', 'SEODesc',
    'DescripcionCorta', 'StockMin'
  ],
  PEDIDOS: [
    'ID', 'Fecha', 'Cliente', 'Telefono', 'Email', 'Direccion', 'Localidad',
    'Provincia', 'Estado', 'MedioPago', 'MetodoEnvio', 'Total', 'CostoTotal',
    'Notas', 'Items', 'MP_PaymentID', 'MP_Status', 'StockDescontado', 'Origen', 'Cupon'
  ],
  GASTOS: ['ID', 'Fecha', 'Concepto', 'Monto', 'Categoria', 'Notas'],
  CONFIG: ['Clave', 'Valor'],
  DOLAR: ['Fecha', 'Valor'],
  CLUBPRINCE: ['ID', 'Fecha', 'Nombre', 'Telefono', 'Ciudad', 'Origen', 'Estado', 'Plan'],
  NEWSLETTER: ['ID', 'Fecha', 'Email'],
  ARREPENTIMIENTO: ['ID', 'Fecha', 'Nombre', 'Telefono', 'Email', 'Pedido', 'FechaRecepcion', 'Productos', 'Motivo', 'Estado'],
};

// Nombre real de hoja -> clave de HEADERS (antes "ClubPrince_Leads" y
// "Dolar_Historial" no encontraban sus encabezados y la escritura fallaba)
const HEADER_KEY_BY_SHEET = Object.keys(SHEET_NAMES).reduce(function (acc, k) {
  acc[SHEET_NAMES[k]] = k;
  return acc;
}, {});

// Claves de la hoja Config que la tienda puede leer sin token.
// Lo demás (gastos fijos, costos, etc.) es privado.
const CONFIG_PUBLICA = ['promos', 'clubPrince_boxes', 'contenido', 'categorias', 'envios',
  'whatsapp', 'instagram', 'nombre', 'margen', 'dolarManual'];

// coupon_uses es publico: los codigos ya estan en la config publica y solo
// devuelve un numero (lo usa el carrito para respetar "Usos max.")
const PUBLIC_GET = ['read', 'config', 'dolar', 'check_stock', 'coupon_uses'];
const PUBLIC_POST = ['create_order', 'club_prince_lead', 'subscribe_newsletter', 'arrepentimiento'];

// ============================================
// ENTRY POINTS (doGet/doPost)
// ============================================

function doGet(e) {
  const p = (e && e.parameter) || {};
  const action = p.action || 'read';
  try {
    const esAdmin = tokenValido(p.token);
    if (PUBLIC_GET.indexOf(action) === -1 && !esAdmin) {
      return jsonResponse({ error: 'No autorizado' });
    }
    let result;
    switch (action) {
      case 'read':
        // Público: solo el catálogo, y solo productos activos
        if (!esAdmin && String(p.sheet || 'productos').toLowerCase() !== 'productos') {
          return jsonResponse({ error: 'No autorizado' });
        }
        result = esAdmin ? readSheet(p.sheet || 'productos') : catalogoPublico();
        break;
      case 'read_all': result = readAllSheets(); break;
      case 'search': result = searchProducts(p.q, p.category); break;
      case 'stats': result = getStats(p.period); break;
      case 'config': result = esAdmin ? getConfig() : getConfigPublica(); break;
      case 'dolar': result = getDolarHistory(); break;
      case 'check_stock': result = checkStock(p.ids); break;
      case 'order_status': result = getOrderStatus(p.ref); break;
      case 'coupon_uses': result = getCouponUses(p.code); break;
      default: result = { error: 'Acción no válida' };
    }
    return jsonResponse(result);
  } catch (error) {
    return jsonResponse({ error: String(error && error.message || error) });
  }
}

function doPost(e) {
  let data = {};
  try {
    data = JSON.parse((e && e.postData && e.postData.contents) || '{}');
  } catch (err) {
    return jsonResponse({ error: 'JSON inválido' });
  }
  const action = data.action;
  try {
    const esAdmin = tokenValido(data.token);
    if (PUBLIC_POST.indexOf(action) === -1 && !esAdmin) {
      return jsonResponse({ error: 'No autorizado' });
    }
    if (!esAdmin && !limiteOk(action)) {
      return jsonResponse({ error: 'Demasiadas solicitudes. Probá en unos minutos.' });
    }
    let result;
    switch (action) {
      // --- públicas (validadas) ---
      case 'create_order': result = createOrder(data.order, esAdmin); break;
      case 'club_prince_lead': result = createClubPrinceLead(data.lead || data); break;
      case 'subscribe_newsletter': result = subscribeNewsletter(data.email || data.subscriber); break;
      case 'arrepentimiento': result = createArrepentimiento(data.solicitud || {}); break;
      // --- solo admin ---
      case 'admin_read': result = readSheet(data.sheet || 'pedidos'); break;
      case 'upsert_product': result = upsertProduct(data.product); break;
      case 'delete_product': result = deleteProduct(data.id); break;
      case 'update_order': result = updateOrder(data.id, data.updates); break;
      case 'delete_order': result = deleteRowById(SHEET_NAMES.PEDIDOS, data.id); break;
      case 'create_expense': result = createExpense(data.expense); break;
      case 'delete_expense': result = deleteRowById(SHEET_NAMES.GASTOS, data.id); break;
      case 'save_config': result = saveConfig(data.config); break;
      case 'add_dolar_rate': result = addDolarRate(data.valor); break;
      case 'upload_image': result = uploadImage(data.image); break;
      case 'webhook_mp': result = processWebhookMP(data); break;
      default: result = { error: 'Acción no válida' };
    }
    return jsonResponse(result);
  } catch (error) {
    return jsonResponse({ error: String(error && error.message || error) });
  }
}

// ============================================
// SEGURIDAD
// ============================================

function tokenValido(token) {
  const esperado = PropertiesService.getScriptProperties().getProperty('ADMIN_TOKEN');
  if (!esperado || esperado.length < 16 || !token) return false;
  const a = String(token), b = String(esperado);
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/** Límite global por acción: máx. N escrituras públicas por minuto */
function limiteOk(action) {
  const max = { create_order: 20, club_prince_lead: 10, subscribe_newsletter: 10, arrepentimiento: 10 }[action] || 10;
  const cache = CacheService.getScriptCache();
  const key = 'rl_' + action + '_' + Math.floor(Date.now() / 60000);
  const n = Number(cache.get(key) || 0);
  if (n >= max) return false;
  cache.put(key, String(n + 1), 120);
  return true;
}

/**
 * Limpia texto que viene de la web: recorta, saca caracteres de control y
 * neutraliza fórmulas (=IMPORTXML(...), +cmd, -2+3, @SUM) anteponiendo '.
 */
function limpio(v, max) {
  let s = String(v == null ? '' : v).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '').trim();
  if (max) s = s.slice(0, max);
  if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
  return s;
}

function numero(v, min, max) {
  const n = Number(v);
  if (!isFinite(n)) return 0;
  return Math.min(Math.max(n, min), max);
}

// ============================================
// HELPERS
// ============================================

function jsonResponse(data) {
  // Nota: ContentService no permite setear headers (antes había un
  // .setHeaders que rompía TODAS las respuestas). Apps Script ya agrega CORS.
  return ContentService.createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}

function getSpreadsheet() {
  const prop = PropertiesService.getScriptProperties().getProperty('SPREADSHEET_ID');
  const id = prop || (SPREADSHEET_ID.indexOf('TU_SHEET_ID') === -1 ? SPREADSHEET_ID : '');
  return id ? SpreadsheetApp.openById(id) : SpreadsheetApp.getActiveSpreadsheet();
}

function headersDe(name) {
  return HEADERS[HEADER_KEY_BY_SHEET[name] || String(name).toUpperCase()] || null;
}

function getSheet(name) {
  const ss = getSpreadsheet();
  let sheet = ss.getSheetByName(name);
  if (!sheet) {
    sheet = ss.insertSheet(name);
    const headers = headersDe(name);
    if (headers) sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
  }
  return sheet;
}

function getAllData(sheetName) {
  const sheet = getSheet(sheetName);
  const lastRow = sheet.getLastRow();
  const lastCol = sheet.getLastColumn();
  if (lastRow < 2 || lastCol < 1) return [];
  const data = sheet.getRange(2, 1, lastRow - 1, lastCol).getValues();
  const headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0];
  return data.map(function (row) {
    const obj = {};
    headers.forEach(function (h, i) { if (h) obj[h] = row[i]; });
    return obj;
  });
}

/**
 * Escribe una fila respetando los encabezados REALES de la hoja (si falta
 * una columna, la agrega al final). Si id existe, actualiza esa fila.
 */
function writeRow(sheetName, rowData, id) {
  const sheet = getSheet(sheetName);
  let lastCol = sheet.getLastColumn();
  let headers = lastCol ? sheet.getRange(1, 1, 1, lastCol).getValues()[0] : [];
  if (!headers.filter(String).length) {
    headers = headersDe(sheetName) || Object.keys(rowData);
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
  }
  Object.keys(rowData).forEach(function (k) {
    if (headers.indexOf(k) === -1) {
      headers.push(k);
      sheet.getRange(1, headers.length).setValue(k);
    }
  });

  const lastRow = sheet.getLastRow();
  let targetRow = -1;
  if (id && lastRow > 1) {
    const ids = sheet.getRange(2, 1, lastRow - 1, 1).getValues().map(function (r) { return String(r[0]); });
    const idx = ids.indexOf(String(id));
    if (idx !== -1) targetRow = idx + 2;
  }
  if (targetRow === -1) targetRow = lastRow + 1;

  let current = [];
  if (targetRow <= lastRow) current = sheet.getRange(targetRow, 1, 1, headers.length).getValues()[0];
  const values = headers.map(function (h, i) {
    return rowData[h] !== undefined ? rowData[h] : (current[i] !== undefined ? current[i] : '');
  });
  sheet.getRange(targetRow, 1, 1, headers.length).setValues([values]);
  return targetRow;
}

function existeId(sheetName, id) {
  const sheet = getSheet(sheetName);
  const lastRow = sheet.getLastRow();
  if (!id || lastRow < 2) return false;
  return sheet.getRange(2, 1, lastRow - 1, 1).getValues().some(function (r) { return String(r[0]) === String(id); });
}

function deleteRowById(sheetName, id) {
  const sheet = getSheet(sheetName);
  const lastRow = sheet.getLastRow();
  if (!id || lastRow < 2) return { error: 'No encontrado' };
  const ids = sheet.getRange(2, 1, lastRow - 1, 1).getValues().map(function (r) { return String(r[0]); });
  const idx = ids.indexOf(String(id));
  if (idx === -1) return { error: 'No encontrado' };
  sheet.deleteRow(idx + 2);
  return { success: true };
}

/** Catálogo para la tienda: solo activos y sin columnas internas */
function catalogoPublico() {
  return readSheet('productos')
    .filter(function (p) { return p.Activo === true || p.Activo === 'TRUE' || p.Activo === 'true'; })
    .map(function (p) {
      const out = {};
      Object.keys(p).forEach(function (k) { if (k !== 'Peso' && k !== 'Dimensiones') out[k] = p[k]; });
      return out;
    });
}

function getConfigPublica() {
  const all = getConfig();
  const out = {};
  CONFIG_PUBLICA.forEach(function (k) { if (all[k] !== undefined && all[k] !== '') out[k] = all[k]; });
  return out;
}

// ============================================
// PRODUCTOS
// ============================================

function readSheet(sheetName) {
  return getAllData(SHEET_NAMES[sheetName.toUpperCase()] || sheetName);
}

function readAllSheets() {
  return {
    productos: readSheet('productos'),
    pedidos: readSheet('pedidos'),
    gastos: readSheet('gastos'),
    config: getConfig(),
    dolar: getDolarHistory(),
  };
}

function searchProducts(query, category) {
  const products = readSheet('productos');
  const q = (query || '').toLowerCase();
  return products.filter(p => {
    const matchesQuery = !q || 
      (p.Nombre?.toLowerCase().includes(q)) ||
      (p.Descripcion?.toLowerCase().includes(q)) ||
      (p.Categoria?.toLowerCase().includes(q)) ||
      (p.Tags?.toLowerCase().includes(q)) ||
      (p.SKU?.toLowerCase().includes(q));
    const matchesCat = !category || category === 'todos' || p.Categoria === category;
    return matchesQuery && matchesCat && p.Activo === true;
  });
}

function upsertProduct(product) {
  if (!product || !product.nombre) return { error: 'Producto inválido' };
  const sheetName = SHEET_NAMES.PRODUCTOS;

  const rowData = {
    ID: product.id || `prod_${Date.now()}`,
    Nombre: product.nombre,
    Categoria: product.categoriaOriginal || product.categoria,
    Subcategoria: product.subcategoria || '',
    Descripcion: product.descripcion || '',
    PrecioUSD: product.precioUSD,
    Imagen: product.imagen || '',
    Stock: product.stock || 0,
    Activo: product.activo !== false,
    Tags: Array.isArray(product.tags) ? product.tags.join(', ') : (product.tags || ''),
    SKU: product.sku || '',
    PrecioARSManual: product.precioARSManual || '',
    PrecioOferta: product.precioOferta || '',
    MargenPersonalizado: product.margenPersonalizado || '',
    Peso: product.peso || '',
    Dimensiones: product.dimensiones || '',
    Galeria: JSON.stringify(product.galeria || []),
    Variantes: JSON.stringify(product.variantes || []),
    Caracteristicas: JSON.stringify(product.caracteristicas || {}),
    Destacado: product.destacado || false,
    SoloWeb: product.soloWeb || false,
    SEOTitle: product.seoTitle || '',
    SEODesc: product.seoDesc || '',
    DescripcionCorta: product.descripcionCorta || '',
    StockMin: product.stockMin || 5,
  };

  writeRow(sheetName, rowData, product.id);
  return { success: true, id: rowData.ID };
}

function deleteProduct(id) {
  return deleteRowById(SHEET_NAMES.PRODUCTOS, id);
}

// ============================================
// PEDIDOS
// ============================================

/**
 * Crea un pedido.
 * - Desde la web (sin token): se valida todo, queda siempre "pendiente",
 *   no puede pisar un pedido existente y no toca el stock.
 * - Desde el admin (con token): puede crear o actualizar con cualquier estado.
 */
function createOrder(order, esAdmin) {
  if (!order || typeof order !== 'object') return { error: 'Pedido inválido' };
  const sheetName = SHEET_NAMES.PEDIDOS;

  let id = limpio(order.id, 40);
  if (!esAdmin) {
    if (!/^PL-\d{6}-\d{4}$/.test(id)) id = 'PL-' + Utilities.formatDate(new Date(), 'GMT-3', 'yyMMdd') + '-' + String(Math.floor(Math.random() * 10000)).padStart(4, '0');
    if (existeId(sheetName, id)) return { error: 'Pedido duplicado' };
    const tel = String(order.telefono || '').replace(/\D/g, '');
    if (!limpio(order.cliente, 80) || tel.length < 8 || tel.length > 15) return { error: 'Faltan datos del cliente' };
  }
  if (!id) id = 'ord_' + Date.now();

  const itemsRaw = Array.isArray(order.items) ? order.items.slice(0, 40) : [];
  const items = itemsRaw.map(function (it) {
    return {
      productoId: limpio(it.productoId || it.id, 60),
      nombre: limpio(it.nombre, 120),
      variante: limpio(it.variante, 60),
      cantidad: numero(it.cantidad, 1, 99),
      precioUnitario: numero(it.precioUnitario, 0, 100000000),
    };
  });
  if (!esAdmin && !items.length) return { error: 'El pedido no tiene productos' };

  const rowData = {
    ID: id,
    Fecha: new Date().toISOString(),
    Cliente: limpio(order.cliente, 80),
    Telefono: limpio(order.telefono, 20),
    Email: limpio(order.email, 100),
    Direccion: limpio(order.direccion, 150),
    Localidad: limpio(order.localidad, 60),
    Provincia: limpio(order.provincia, 40),
    Estado: esAdmin ? limpio(order.estado || 'pendiente', 20) : 'pendiente',
    MedioPago: limpio(order.medioPago, 40),
    MetodoEnvio: limpio(order.metodoEnvio, 60),
    Total: numero(order.total, 0, 1000000000),
    CostoTotal: esAdmin ? numero(order.costoTotal, 0, 1000000000) : 0,
    Notas: limpio(order.notas, 400),
    Items: JSON.stringify(items),
    MP_PaymentID: esAdmin ? limpio(order.mpPaymentId, 40) : '',
    MP_Status: esAdmin ? limpio(order.mpStatus, 20) : '',
    Origen: esAdmin ? limpio(order.origen || 'admin', 20) : 'web-whatsapp',
    Cupon: limpio(order.cupon, 30).toUpperCase(),
  };

  const lock = LockService.getScriptLock();
  lock.waitLock(15000);
  try {
    writeRow(sheetName, rowData, id);
  } finally {
    lock.releaseLock();
  }
  return { success: true, id: id };
}

function updateOrder(id, updates) {
  const sheet = getSheet(SHEET_NAMES.PEDIDOS);
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return { error: 'No hay pedidos' };
  
  const ids = sheet.getRange(2, 1, lastRow - 1, 1).getValues().map(function (r) { return String(r[0]); });
  const idx = ids.indexOf(String(id));
  if (idx === -1) return { error: 'Pedido no encontrado' };
  
  const row = idx + 2;
  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  
  // Leer fila actual
  const current = sheet.getRange(row, 1, 1, headers.length).getValues()[0];
  const rowData = {};
  headers.forEach((h, i) => rowData[h] = current[i]);
  
  // Aplicar actualizaciones (solo columnas existentes, sin cambiar el ID)
  Object.keys(updates || {}).forEach(function (k) {
    if (k === 'ID' || headers.indexOf(k) === -1) return;
    const v = updates[k];
    rowData[k] = (typeof v === 'number' || typeof v === 'boolean') ? v : limpio(typeof v === 'object' ? JSON.stringify(v) : v, 5000);
  });
  
  // Escribir
  const values = headers.map(h => rowData[h] !== undefined ? rowData[h] : '');
  sheet.getRange(row, 1, 1, headers.length).setValues([values]);
  
  return { success: true };
}

// ============================================
// GASTOS
// ============================================

function createExpense(expense) {
  const id = expense.id || `exp_${Date.now()}`;
  const rowData = {
    ID: id,
    Fecha: expense.fecha || new Date().toISOString(),
    Concepto: limpio(expense.concepto, 120),
    Monto: numero(expense.monto, 0, 1000000000),
    Categoria: limpio(expense.categoria, 40),
    Notas: limpio(expense.notas, 400),
  };
  writeRow(SHEET_NAMES.GASTOS, rowData, id);
  return { success: true, id };
}

// ============================================
// CONFIG
// ============================================

function getConfig() {
  const data = readSheet('config');
  const config = {};
  data.forEach(row => {
    if (row.Clave) config[row.Clave] = row.Valor;
  });
  return config;
}

function saveConfig(configObj) {
  if (!configObj || typeof configObj !== 'object') return { error: 'Config inválida' };
  const sheet = getSheet(SHEET_NAMES.CONFIG);
  const existing = getConfig();
  const merged = Object.assign({}, existing);
  Object.keys(configObj).forEach(function (k) {
    const v = configObj[k];
    // Los objetos se guardan como JSON (antes quedaban como "[object Object]")
    merged[k] = (v !== null && typeof v === 'object') ? JSON.stringify(v) : v;
  });
  
  // Limpiar y reescribir
  const lastRow = sheet.getLastRow();
  if (lastRow > 1) sheet.getRange(2, 1, lastRow - 1, 2).clearContent();
  
  const rows = Object.entries(merged).map(([k, v]) => [k, v]);
  if (rows.length) sheet.getRange(2, 1, rows.length, 2).setValues(rows);
  
  return { success: true, config: merged };
}

// ============================================
// CLUB PRINCE — LEADS
// ============================================

function createClubPrinceLead(lead) {
  const nombre = limpio(lead.nombre || lead.Nombre, 80);
  const telefono = limpio(lead.telefono || lead.Telefono, 20);
  const ciudad = limpio(lead.ciudad || lead.Ciudad, 60);
  if (!nombre || String(telefono).replace(/\D/g, '').length < 8 || !ciudad) return { error: 'Faltan campos: Nombre, Teléfono y Ciudad son obligatorios' };
  const id = 'club_' + Date.now() + '_' + Math.floor(Math.random() * 1000);
  const rowData = {
    ID: id,
    Fecha: new Date().toISOString(),
    Nombre: nombre,
    Telefono: telefono,
    Ciudad: ciudad,
    Origen: 'Club Prince Web',
    Estado: 'nuevo',
    Plan: limpio(lead.plan || lead.Plan, 60),
  };
  writeRow(SHEET_NAMES.CLUBPRINCE, rowData, id);
  return { success: true, id };
}

/**
 * Newsletter: guarda el email en la hoja Newsletter
 */
function subscribeNewsletter(email) {
  const emailStr = (email || '').toString().trim().toLowerCase().slice(0, 100);
  if (!emailStr || !/^[^\s@=+\-][^\s@]*@[^\s@]+\.[^\s@]+$/.test(emailStr)) {
    return { error: 'Email inválido' };
  }
  const sheet = getSheet(SHEET_NAMES.NEWSLETTER);
  const lastRow = sheet.getLastRow();
  if (lastRow > 1) {
    const existing = sheet.getRange(2, 3, lastRow - 1, 1).getValues().map(r => String(r[0]).toLowerCase());
    if (existing.indexOf(emailStr) !== -1) {
      return { success: true, duplicate: true };
    }
  }
  const id = `news_${Date.now()}`;
  const rowData = { ID: id, Fecha: new Date().toISOString(), Email: emailStr };
  writeRow(SHEET_NAMES.NEWSLETTER, rowData, id);
  return { success: true, id };
}

// ============================================
// BOTÓN DE ARREPENTIMIENTO (Res. 424/2020)
// ============================================

function createArrepentimiento(sol) {
  const codigo = limpio(sol.codigo, 30);
  if (!/^ARR-\d{6}-[0-9A-Z]{5}$/.test(codigo)) return { error: 'Código inválido' };
  const nombre = limpio(sol.nombre, 80);
  const telefono = limpio(sol.telefono, 20);
  if (!nombre || String(telefono).replace(/\D/g, '').length < 8) return { error: 'Faltan datos' };
  if (existeId(SHEET_NAMES.ARREPENTIMIENTO, codigo)) return { success: true, duplicate: true };
  writeRow(SHEET_NAMES.ARREPENTIMIENTO, {
    ID: codigo,
    Fecha: new Date().toISOString(),
    Nombre: nombre,
    Telefono: telefono,
    Email: limpio(sol.email, 100),
    Pedido: limpio(sol.pedido, 30),
    FechaRecepcion: limpio(sol.fechaRecepcion, 10),
    Productos: limpio(sol.productos, 300),
    Motivo: limpio(sol.motivo, 300),
    Estado: 'nuevo',
  }, codigo);
  return { success: true, id: codigo };
}

// ============================================
// DÓLAR
// ============================================

function getDolarHistory() {
  return readSheet('dolar');
}

function addDolarRate(valor) {
  const rowData = {
    Fecha: new Date().toISOString(),
    Valor: numero(valor, 1, 100000),
  };
  writeRow(SHEET_NAMES.DOLAR, rowData);
  return { success: true };
}

// ============================================
// WEBHOOK MERCADO PAGO
// ============================================

function processWebhookMP(data) {
  // Llamado SOLO por /api/mercadopago/webhook (con token), que ya verificó la firma de MP.
  // Recibe: { externalReference, mpPaymentId, status, statusDetail, amount, descontarStock }
  if (!data.externalReference) return { error: 'Falta externalReference' };

  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(20000);
  } catch (e) {
    return { error: 'Sistema ocupado, reintentar' };
  }

  try {
    const sheet = getSheet(SHEET_NAMES.PEDIDOS);
    asegurarColumna(sheet, 'StockDescontado');

    const fila = buscarFilaPedido(sheet, data.externalReference);

    // Si el pedido no existe (fallo el pre-registro), lo creamos ahora:
    // asi nunca se pierde un pago acreditado.
    if (!fila) {
      createOrder({
        id: data.externalReference,
        cliente: data.payerName || 'Cliente Mercado Pago',
        email: data.payerEmail || '',
        telefono: '',
        direccion: '',
        localidad: '',
        provincia: '',
        estado: mapMPStatus(data.status),
        medioPago: 'Mercado Pago',
        metodoEnvio: '',
        total: data.amount || 0,
        notas: 'Pedido reconstruido desde el webhook de Mercado Pago.',
        items: [],
        mpPaymentId: data.mpPaymentId,
        mpStatus: data.status,
        cupon: data.cupon || '',
      });
      return { success: true, creado: true };
    }

    const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
    const valores = sheet.getRange(fila, 1, 1, headers.length).getValues()[0];
    const pedido = {};
    headers.forEach(function (h, i) { pedido[h] = valores[i]; });

    // Idempotencia: Mercado Pago reenvia la misma notificacion varias veces.
    const yaDescontado = String(pedido.StockDescontado || '').toLowerCase() === 'si';
    const debeDescontar = data.descontarStock === true && data.status === 'approved' && !yaDescontado;

    const updates = {
      MP_PaymentID: data.mpPaymentId || pedido.MP_PaymentID,
      MP_Status: data.status,
      Estado: mapMPStatus(data.status),
    };

    if (debeDescontar) {
      const items = parseItemsPedido(pedido.Items);
      descontarStock(items);
      updates.StockDescontado = 'si';
      updates.Notas = String(pedido.Notas || '') + ' | Pago acreditado ' + new Date().toISOString();
    }

    updateOrder(data.externalReference, updates);

    return { success: true, stockDescontado: debeDescontar };
  } finally {
    lock.releaseLock();
  }
}

/** Busca la fila (1-indexed) de un pedido por ID. Devuelve null si no existe. */
function buscarFilaPedido(sheet, id) {
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return null;
  const ids = sheet.getRange(2, 1, lastRow - 1, 1).getValues().flat();
  const idx = ids.findIndex(function (v) { return String(v) === String(id); });
  return idx === -1 ? null : idx + 2;
}

/** Agrega una columna al final si todavia no existe en la hoja. */
function asegurarColumna(sheet, nombre) {
  const lastCol = sheet.getLastColumn();
  const headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0];
  if (headers.indexOf(nombre) !== -1) return headers.indexOf(nombre) + 1;
  sheet.getRange(1, lastCol + 1).setValue(nombre);
  return lastCol + 1;
}

function parseItemsPedido(raw) {
  try {
    if (!raw) return [];
    if (typeof raw === 'object') return raw;
    return JSON.parse(raw);
  } catch (e) {
    return [];
  }
}

/**
 * Descuenta stock de los productos vendidos.
 * Si el item tiene variante, descuenta de esa variante y recalcula el total.
 */
function descontarStock(items) {
  if (!items || !items.length) return;

  const sheet = getSheet(SHEET_NAMES.PRODUCTOS);
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return;

  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  const colID = headers.indexOf('ID');
  const colStock = headers.indexOf('Stock');
  const colVariantes = headers.indexOf('Variantes');
  if (colID === -1 || colStock === -1) return;

  const datos = sheet.getRange(2, 1, lastRow - 1, headers.length).getValues();

  items.forEach(function (item) {
    const pid = String(item.productoId || item.id || '');
    const cant = Number(item.cantidad) || 0;
    if (!pid || cant <= 0) return;

    const idx = datos.findIndex(function (r) { return String(r[colID]) === pid; });
    if (idx === -1) return;

    const fila = idx + 2;

    // Variante: "Rojo / M"
    if (item.variante && colVariantes !== -1) {
      const partes = String(item.variante).split('/');
      const color = (partes[0] || '').trim();
      const talle = (partes[1] || '').trim();
      let variantes = [];
      try { variantes = JSON.parse(datos[idx][colVariantes] || '[]'); } catch (e) { variantes = []; }

      if (variantes.length) {
        let tocada = false;
        variantes = variantes.map(function (v) {
          if (v.color === color && v.talle === talle) {
            tocada = true;
            v.stock = Math.max(0, (Number(v.stock) || 0) - cant);
          }
          return v;
        });
        if (tocada) {
          sheet.getRange(fila, colVariantes + 1).setValue(JSON.stringify(variantes));
          const totalVar = variantes.reduce(function (s, v) { return s + (Number(v.stock) || 0); }, 0);
          sheet.getRange(fila, colStock + 1).setValue(totalVar);
          return;
        }
      }
    }

    const stockActual = Number(datos[idx][colStock]) || 0;
    sheet.getRange(fila, colStock + 1).setValue(Math.max(0, stockActual - cant));
  });
}

/**
 * Stock actual de una lista de IDs. Lo consume js/cart.js antes de pagar.
 * Devuelve { "prod_1": 4, "prod_2": 0 }
 */
function checkStock(idsParam) {
  const ids = String(idsParam || '').split(',').map(function (s) { return s.trim(); }).filter(String);
  const productos = readSheet('productos');
  const out = {};

  productos.forEach(function (p) {
    const id = String(p.ID || '');
    if (!id) return;
    if (ids.length && ids.indexOf(id) === -1) return;
    const activo = p.Activo === true || p.Activo === 'TRUE' || p.Activo === 'true';
    out[id] = activo ? (Number(p.Stock) || 0) : 0;
  });

  return out;
}

/** Estado de un pedido, para la pantalla de "volviste de Mercado Pago". */
function getOrderStatus(ref) {
  if (!ref) return { encontrado: false };

  const sheet = getSheet(SHEET_NAMES.PEDIDOS);
  const fila = buscarFilaPedido(sheet, ref);
  if (!fila) return { encontrado: false };

  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  const valores = sheet.getRange(fila, 1, 1, headers.length).getValues()[0];
  const pedido = {};
  headers.forEach(function (h, i) { pedido[h] = valores[i]; });

  return {
    encontrado: true,
    estado: pedido.Estado || 'pendiente',
    mpStatus: pedido.MP_Status || '',
    total: Number(pedido.Total) || 0,
  };
}

/**
 * Cuantos pedidos usaron un cupon, para respetar "Usos máx." del admin.
 * Cuenta solo pedidos que avanzaron (no pendientes ni cancelados): un carrito
 * abandonado en Mercado Pago no consume usos. Para pedidos viejos sin la
 * columna Cupon, lo busca en las Notas ("Cupon: CODIGO" o "Cupón: CODIGO").
 */
function getCouponUses(code) {
  const codigo = String(code || '').toUpperCase().trim();
  if (!codigo) return { usos: 0 };
  const enNotas = new RegExp('Cup[oó]n: ' + codigo.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '(\\s|\\||$)', 'i');
  const usos = getAllData(SHEET_NAMES.PEDIDOS).filter(function (p) {
    const estado = String(p.Estado || '').toLowerCase();
    if (!estado || estado === 'pendiente' || estado === 'cancelado') return false;
    const cupon = String(p.Cupon || '').toUpperCase().trim();
    return cupon ? cupon === codigo : enNotas.test(String(p.Notas || ''));
  }).length;
  return { usos: usos };
}

function mapMPStatus(mpStatus) {
  const map = {
    'approved': 'confirmado',
    'pending': 'pendiente',
    'rejected': 'cancelado',
    'cancelled': 'cancelado',
    'refunded': 'cancelado',
    'in_process': 'pendiente',
    'in_mediation': 'pendiente',
  };
  return map[mpStatus] || mpStatus;
}

// ============================================
// ESTADÍSTICAS
// ============================================

function getStats(period) {
  const orders = readSheet('pedidos').filter(o => o.Estado !== 'cancelado');
  const now = new Date();
  
  // Filtrar por período
  let filtered = orders;
  if (period && period !== 'all') {
    const cutoff = new Date(now);
    switch (period) {
      case 'hoy': cutoff.setHours(0,0,0,0); break;
      case 'semana': cutoff.setDate(cutoff.getDate() - 7); break;
      case 'mes': cutoff.setMonth(cutoff.getMonth() - 1); break;
      case 'trimestre': cutoff.setMonth(cutoff.getMonth() - 3); break;
      case 'anio': cutoff.setFullYear(cutoff.getFullYear() - 1); break;
    }
    filtered = orders.filter(o => new Date(o.Fecha) >= cutoff);
  }
  
  const ingresos = filtered.reduce((s, o) => s + (Number(o.Total) || 0), 0);
  const costos = filtered.reduce((s, o) => s + (Number(o.CostoTotal) || 0), 0);
  const ganancia = ingresos - costos;
  const margen = ingresos > 0 ? (ganancia / ingresos * 100) : 0;
  
  const porEstado = {};
  ['pendiente', 'confirmado', 'en_preparacion', 'enviado', 'entregado'].forEach(e => {
    porEstado[e] = filtered.filter(o => o.Estado === e).length;
  });
  
  // Top productos
  const vendidos = {};
  filtered.forEach(o => {
    try {
      const items = JSON.parse(o.Items || '[]');
      items.forEach(item => {
        vendidos[item.productoId] = (vendidos[item.productoId] || 0) + item.cantidad;
      });
    } catch (e) {}
  });
  
  const products = readSheet('productos');
  const topProductos = Object.entries(vendidos)
    .map(([id, cant]) => {
      const p = products.find(pr => pr.ID == id);
      return { id, nombre: p?.Nombre || id, cantidad: cant };
    })
    .sort((a, b) => b.cantidad - a.cantidad)
    .slice(0, 10);
  
  // Ventas por día (últimos 30)
  const ventasPorDia = {};
  for (let i = 29; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    const key = d.toISOString().slice(0, 10);
    ventasPorDia[key] = { fecha: key, ingresos: 0, pedidos: 0 };
  }
  filtered.forEach(o => {
    const key = (o.Fecha || '').slice(0, 10);
    if (ventasPorDia[key]) {
      ventasPorDia[key].ingresos += Number(o.Total) || 0;
      ventasPorDia[key].pedidos += 1;
    }
  });
  
  return {
    periodo: period || 'total',
    totalPedidos: filtered.length,
    pedidosActivos: filtered.filter(o => !['entregado', 'cancelado'].includes(o.Estado)).length,
    ingresos,
    costos,
    ganancia,
    margen,
    ticketProm: filtered.length > 0 ? ingresos / filtered.length : 0,
    porEstado,
    topProductos,
    ventasPorDia: Object.values(ventasPorDia),
  };
}

// ============================================
// UTILIDADES
// ============================================

function testConnection() {
  try {
    const ss = getSpreadsheet();
    return { success: true, sheets: ss.getSheets().map(s => s.getName()) };
  } catch (e) {
    return { error: e.toString() };
  }
}

// ============================================
// FOTOS DE PRODUCTOS (Google Drive)
// ============================================
// El admin achica la foto y la manda en JPG; acá se guarda en una carpeta de
// Drive compartida "cualquiera con el link (lector)" y se devuelve un link que
// la tienda puede mostrar. En la planilla queda solo el link.

const IMG_MAX_BYTES = 5 * 1024 * 1024;
const IMG_TIPOS = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };

function carpetaImagenes() {
  const props = PropertiesService.getScriptProperties();
  const id = props.getProperty('IMG_FOLDER_ID');
  if (id) {
    try { return DriveApp.getFolderById(id); } catch (e) { /* la borraron: se crea otra */ }
  }
  const folder = DriveApp.createFolder('PrincessLov - Fotos de productos');
  try { folder.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW); } catch (e) {}
  props.setProperty('IMG_FOLDER_ID', folder.getId());
  return folder;
}

/** Verifica por contenido (no por nombre) que sea JPG, PNG o WEBP */
function tipoRealImagen(bytes) {
  const b = function (i) { return bytes[i] & 0xff; };
  if (bytes.length < 12) return null;
  if (b(0) === 0xff && b(1) === 0xd8 && b(2) === 0xff) return 'image/jpeg';
  if (b(0) === 0x89 && b(1) === 0x50 && b(2) === 0x4e && b(3) === 0x47) return 'image/png';
  if (b(0) === 0x52 && b(1) === 0x49 && b(2) === 0x46 && b(3) === 0x46 &&
      b(8) === 0x57 && b(9) === 0x45 && b(10) === 0x42 && b(11) === 0x50) return 'image/webp';
  return null;
}

function uploadImage(img) {
  if (!img || typeof img.data !== 'string') return { error: 'Foto inválida' };
  let bytes;
  try {
    bytes = Utilities.base64Decode(img.data.replace(/^data:[^,]*,/, ''));
  } catch (e) {
    return { error: 'La foto llegó dañada' };
  }
  if (!bytes.length || bytes.length > IMG_MAX_BYTES) return { error: 'La foto pesa demasiado (máx. 5 MB)' };
  const tipo = tipoRealImagen(bytes);
  if (!tipo) return { error: 'Formato no soportado (usá JPG, PNG o WEBP)' };

  const base = String(img.name || 'producto').replace(/\.[^.]*$/, '')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\w-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'producto';
  const nombre = base + '-' + Utilities.formatDate(new Date(), 'America/Argentina/Buenos_Aires', 'yyyyMMdd-HHmmss') +
    '.' + IMG_TIPOS[tipo];

  const file = carpetaImagenes().createFile(Utilities.newBlob(bytes, tipo, nombre));
  file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
  return { success: true, id: file.getId(), url: 'https://lh3.googleusercontent.com/d/' + file.getId() };
}

// Ejecutar UNA vez después de pegar esta versión: pide el permiso de Google
// Drive y crea la carpeta de fotos. En el registro aparece el link a la carpeta.
function autorizarDrive() {
  const folder = carpetaImagenes();
  Logger.log('Carpeta de fotos: ' + folder.getUrl());
  return { success: true, carpeta: folder.getUrl() };
}

// Ejecutar una vez para crear hojas si no existen
function setupSheets() {
  Object.values(SHEET_NAMES).forEach(name => {
    const sheet = getSheet(name);
    const headers = headersDe(name);
    if (headers && sheet.getLastRow() === 0) {
      sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    }
  });
  return { success: true, message: 'Hojas creadas/verificadas' };
}