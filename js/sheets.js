/* ============================================
   SHEETS SERVICE - Google Sheets via Apps Script API
   Con cache, fallback local, y sincronía bidireccional
   ============================================ */

function escHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

/**
 * Escapa un valor para usarlo DENTRO de un string JS entre comillas simples
 * que a su vez va dentro de un atributo HTML (ej: onclick="f('${escJsAttr(id)}')").
 */
function escJsAttr(s) {
  return escHtml(String(s ?? '').replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/[\r\n]/g, ' '));
}

/** URL de Apps Script válida (ignora el placeholder TU_SCRIPT_ID) */
function appsScriptConfigurado() {
  const url = (typeof CONFIG !== 'undefined' && CONFIG.sheets?.appsScriptUrl) || '';
  return /^https:\/\/script\.google\.com\//.test(url) && !url.includes('TU_SCRIPT_ID') ? url : null;
}

const SheetsService = {
  productos: [],
  cotizacionDolar: null,
  lastFetch: null,
  cache: null,
  cacheExpiry: 5 * 60 * 1000, // 5 min cache
  dolarCacheAt: null,
  dolarFetching: null,
  
  // URL del Google Apps Script Web App (configurar en Vercel env o data/config.js)
  appsScriptUrl: null,

  /**
   * Inicializa la URL del Apps Script desde config
   */
  init() {
    this.appsScriptUrl = appsScriptConfigurado();
  },

  /**
   * Parsea un CSV string a array de objetos
   */
  parseCSV(csvText) {
    const lines = csvText.trim().split('\n');
    if (lines.length < 2) return [];

    const headers = this.parseCSVLine(lines[0]);
    const data = [];

    for (let i = 1; i < lines.length; i++) {
      if (!lines[i].trim()) continue;
      const values = this.parseCSVLine(lines[i]);
      const obj = {};
      headers.forEach((header, idx) => {
        obj[header.trim()] = (values[idx] || '').trim();
      });
      data.push(obj);
    }
    return data;
  },

  parseCSVLine(line) {
    const result = [];
    let current = '';
    let inQuotes = false;

    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      if (char === '"') {
        inQuotes = !inQuotes;
      } else if (char === ',' && !inQuotes) {
        result.push(current);
        current = '';
      } else {
        current += char;
      }
    }
    result.push(current);
    return result;
  },

  /**
   * Carga productos - Intenta Apps Script primero, luego CSV público, luego fallback local
   */
  async cargarProductos(forceRefresh = false) {
    // Verificar cache
    if (!forceRefresh && this.cache && Date.now() - this.cache.timestamp < this.cacheExpiry) {
      this.productos = this.cache.data;
      return this.productos;
    }

    // 1. Intentar Google Apps Script (bidireccional, con todos los campos nuevos)
    if (this.appsScriptUrl) {
      try {
        const data = await this.fetchFromAppsScript('read', { sheet: 'productos' });
        if (data && data.length > 0) {
          this.productos = this.mapAppsScriptProducts(data);
          this.setCache(this.productos);
          return this.productos;
        }
      } catch (e) {
        console.warn('[Sheets] Apps Script falló:', e.message);
      }
    }

    // 2. CSV público de Google Sheets (solo lectura, campos básicos)
    const csvUrl = CONFIG.sheets?.url || '';
    if (csvUrl && !csvUrl.includes('TU_SHEET_ID')) try {
      const response = await fetch(csvUrl);
      if (response.ok) {
        const csvText = await response.text();
        const rawData = this.parseCSV(csvText);
        this.productos = this.mapCSVProducts(rawData);
        this.setCache(this.productos);
        return this.productos;
      }
    } catch (e) {
      console.warn('[Sheets] CSV público falló:', e.message);
    }

    // 3. Fallback local (data/productos.csv)
    return this.cargarFallback();
  },

  /**
   * Mapea datos del Apps Script (formato completo con campos nuevos)
   */
  mapAppsScriptProducts(raw) {
    return raw
      .filter(p => p.Activo === true || p.Activo === 'TRUE' || p.Activo === 'true')
      .map(p => ({
        id: p.ID || this.generarId(),
        nombre: p.Nombre || 'Sin nombre',
        categoria: this.resolverCategoria(p.Categoria),
        categoriaOriginal: p.Categoria || '',
        subcategoria: p.Subcategoria || '',
        descripcion: p.Descripcion || '',
        descripcionCorta: p.DescripcionCorta || '',
        precioUSD: parseFloat(p.PrecioUSD) || 0,
        precioARSManual: p.PrecioARSManual ? parseFloat(p.PrecioARSManual) : null,
        precioOferta: p.PrecioOferta ? parseFloat(p.PrecioOferta) : null,
        margenPersonalizado: p.MargenPersonalizado ? parseFloat(p.MargenPersonalizado) / 100 : null,
        imagen: p.Imagen || CONFIG.imagenes.placeholder,
        stock: parseInt(p.Stock) || 0,
        stockMin: parseInt(p.StockMin) || 5,
        peso: p.Peso ? parseInt(p.Peso) : null,
        dimensiones: p.Dimensiones || '',
        tags: p.Tags ? p.Tags.split(',').map(t => t.trim().toLowerCase()) : [],
        sku: p.SKU || '',
        galeria: this.parseJSONSafe(p.Galeria, []),
        variantes: this.parseJSONSafe(p.Variantes, []),
        caracteristicas: this.parseJSONSafe(p.Caracteristicas, {}),
        activo: p.Activo === true || p.Activo === 'TRUE' || p.Activo === 'true',
        destacado: p.Destacado === true || p.Destacado === 'TRUE',
        soloWeb: p.SoloWeb === true || p.SoloWeb === 'TRUE',
        seoTitle: p.SEOTitle || '',
        seoDesc: p.SEODesc || '',
        fechaCreacion: p.FechaCreacion,
        fechaModificacion: p.FechaModificacion,
      }));
  },

  /**
   * Mapea CSV público (formato legacy básico)
   */
  mapCSVProducts(raw) {
    return raw
      .filter(p => p['Activo'] && p['Activo'].toUpperCase() === 'TRUE')
      .map(p => ({
        id: p['ID'] || this.generarId(),
        nombre: p['Nombre'] || 'Sin nombre',
        categoria: this.resolverCategoria(p['Categoria']),
        categoriaOriginal: p['Categoria'] || '',
        subcategoria: p['Subcategoria'] || '',
        descripcion: p['Descripcion'] || '',
        descripcionCorta: '',
        precioUSD: parseFloat(p['PrecioUSD']) || 0,
        precioARSManual: null,
        precioOferta: null,
        margenPersonalizado: null,
        imagen: p['Imagen'] || CONFIG.imagenes.placeholder,
        stock: parseInt(p['Stock']) || 0,
        stockMin: 5,
        peso: null,
        dimensiones: '',
        tags: p['Tags'] ? p['Tags'].split(',').map(t => t.trim().toLowerCase()) : [],
        sku: '',
        galeria: [],
        variantes: [],
        caracteristicas: {},
        activo: true,
        destacado: false,
        soloWeb: false,
        seoTitle: '',
        seoDesc: '',
      }));
  },

  /**
   * Lee Galeria/Variantes/Caracteristicas de la planilla.
   * Se guardaban codificadas DOS veces ('"[]"'): al leerlas quedaba el texto
   * "[]" en vez de una lista, todos los productos parecían tener variantes
   * (no se podían agregar al carrito) y la ficha fallaba al abrirse.
   * Ahora decodifica hasta obtener el tipo correcto (sirve para filas viejas).
   */
  parseJSONSafe(str, fallback) {
    let v = str;
    for (let i = 0; i < 3 && typeof v === 'string'; i++) {
      if (!v.trim()) return fallback;
      try { v = JSON.parse(v); } catch { return fallback; }
    }
    if (v == null) return fallback;
    if (Array.isArray(fallback)) return Array.isArray(v) ? v : fallback;
    if (fallback && typeof fallback === 'object') return (typeof v === 'object' && !Array.isArray(v)) ? v : fallback;
    return v;
  },

  /**
   * Fetch genérico al Apps Script
   */
  async fetchFromAppsScript(action, params = {}) {
    const url = new URL(this.appsScriptUrl);
    url.searchParams.set('action', action);
    Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));

    const response = await fetch(url, {
      method: 'GET',
      headers: { 'Accept': 'application/json' },
    });

    if (!response.ok) throw new Error(`Apps Script HTTP ${response.status}`);
    const data = await response.json();
    if (data.error) throw new Error(data.error);
    return data;
  },

  /**
   * Post al Apps Script (para escrituras)
   */
  async postToAppsScript(action, data = {}, opts = {}) {
    if (!this.appsScriptUrl) this.appsScriptUrl = appsScriptConfigurado();
    if (!this.appsScriptUrl) throw new Error('Apps Script no configurado');
    // Token de administración: solo existe en el navegador del admin
    // (se carga en Admin > Configuración). La tienda pública no lo tiene.
    let token = '';
    try { token = localStorage.getItem('pl_admin_token') || ''; } catch {}
    // text/plain evita el "preflight" CORS, que Apps Script no soporta.
    const response = await fetch(this.appsScriptUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ action, ...data, ...(token ? { token } : {}) }),
      keepalive: !!opts.keepalive,
    });

    if (!response.ok) throw new Error(`Apps Script HTTP ${response.status}`);
    const result = await response.json();
    if (result.error) throw new Error(result.error);
    return result;
  },

  setCache(data) {
    this.cache = { data, timestamp: Date.now() };
  },

  invalidateCache() {
    this.cache = null;
  },

  /**
   * Carga fallback local (data/productos.csv)
   */
  cargarFallback() {
    return fetch('data/productos.csv')
      .then(r => r.text())
      .then(csv => {
        const rawData = this.parseCSV(csv);
        this.productos = this.mapCSVProducts(rawData);
        this.setCache(this.productos);
        return this.productos;
      })
      .catch(() => {
        this.productos = [];
        this.setCache([]);
        return [];
      });
  },

  /**
   * Obtiene cotización del dólar - Apps Script > CriptoYa > Manual
   */
  async obtenerCotizacion() {
    if (!CONFIG.cotizacion.autoCotizacion) {
      this.cotizacionDolar = CONFIG.cotizacion.cotizacionManual;
      return this.cotizacionDolar;
    }

    // Cache de 5 min: evitar llamadas repetidas a la API por render
    const now = Date.now();
    if (this.cotizacionDolar && this.dolarCacheAt && (now - this.dolarCacheAt) < this.cacheExpiry) {
      return this.cotizacionDolar;
    }
    // Si ya hay una búsqueda en vuelo, reutilizarla
    if (this.dolarFetching) {
      return this.dolarFetching;
    }

    this.dolarFetching = this._fetchCotizacion().finally(() => { this.dolarFetching = null; });
    return this.dolarFetching;
  },

  async _fetchCotizacion() {
    // 1. Apps Script (si tiene historial propio)
    if (this.appsScriptUrl) {
      try {
        const data = await this.fetchFromAppsScript('dolar');
        if (data && data.length > 0) {
          const latest = data[data.length - 1];
          this.cotizacionDolar = parseFloat(latest.Valor) || CONFIG.cotizacion.cotizacionManual;
          this.dolarCacheAt = Date.now();
          return this.cotizacionDolar;
        }
      } catch (e) {
        console.warn('[Dólar] Apps Script falló:', e.message);
      }
    }

    // 2. CriptoYa API
    try {
      const response = await fetch(CONFIG.sheets.dolarUrl);
      const data = await response.json();
      this.cotizacionDolar = data.oficial?.ask || data.blue?.ask || CONFIG.cotizacion.cotizacionManual;
      this.dolarCacheAt = Date.now();
      return this.cotizacionDolar;
    } catch (error) {
      console.warn('[Dólar] CriptoYa falló:', error.message);
    }

    // 3. Manual
    this.cotizacionDolar = CONFIG.cotizacion.cotizacionManual;
    this.dolarCacheAt = Date.now();
    return this.cotizacionDolar;
  },

  /**
   * Calcula precio ARS con soporte para precio manual, oferta y margen personalizado
   */
  calcularPrecioARS(precioUSD, producto = null) {
    if (!this.cotizacionDolar) this.cotizacionDolar = CONFIG.cotizacion.cotizacionManual;
    
    // Si el producto tiene precio ARS manual fijo, usar ese
    if (producto?.precioARSManual) return producto.precioARSManual;
    
    // Calcular con margen (personalizado o global)
    const margen = producto?.margenPersonalizado ?? CONFIG.cotizacion.margenGanancia;
    const precio = precioUSD * this.cotizacionDolar * margen;
    return Math.round(precio);
  },

  formatPrecioARS(precio) {
    return new Intl.NumberFormat('es-AR', {
      style: 'currency',
      currency: 'ARS',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(precio || 0);
  },

  formatPrecioUSD(precio) {
    return 'USD ' + new Intl.NumberFormat('en-US', { minimumFractionDigits: 2 }).format(precio || 0);
  },

  generarId() {
    return 'prod_' + Date.now().toString(36) + Math.random().toString(36).substr(2, 9);
  },

  // ==================== MÉTODOS DE CONSULTA ====================

  obtenerProducto(id) {
    return this.productos.find(p => p.id === id) || null;
  },

  obtenerProductos() {
    return this.productos;
  },

  /** "Colección Íntima" → "coleccion-intima" */
  slugCategoria(v) {
    return String(v ?? '').trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  },

  /**
   * La planilla guarda el NOMBRE de la categoría ("Calzas Largas"), no su ID.
   * Antes el ID se sacaba del nombre, así que renombrar una categoría o usar
   * tildes dejaba los productos fuera de su categoría. Ahora se busca por
   * nombre actual, por ID y por nombres anteriores (alias).
   */
  resolverCategoria(valor) {
    const key = this.slugCategoria(valor);
    if (!key) return '';
    const cats = this.obtenerTodasCategorias() || [];
    const porNombre = cats.find(c => this.slugCategoria(c.nombre) === key);
    if (porNombre) return porNombre.id;
    const porId = cats.find(c => c.id === valor || this.slugCategoria(c.id) === key);
    if (porId) return porId.id;
    const porAlias = cats.find(c => Array.isArray(c.alias) && c.alias.some(a => this.slugCategoria(a) === key));
    return porAlias ? porAlias.id : key;
  },

  /** Vuelve a ubicar los productos cuando llegan las categorías publicadas */
  reasignarCategorias() {
    (this.productos || []).forEach(p => { p.categoria = this.resolverCategoria(p.categoriaOriginal || p.categoria); });
  },

  obtenerCategoriasConConteo() {
    const conteo = {};
    this.productos.forEach(p => {
      if (p.activo) conteo[p.categoria] = (conteo[p.categoria] || 0) + 1;
    });

    const cats = (typeof AdminData !== 'undefined' && AdminData.getEffectiveCategorias) ? AdminData.getEffectiveCategorias() : (CONFIG.categorias || []);
    const conocidas = new Set(cats.map(c => c.id));
    const result = cats
      .filter(cat => cat.id !== 'todos')
      .map(cat => ({ ...cat, count: conteo[cat.id] || 0 }));
    // Categorías que vienen de la planilla y no están configuradas: se muestran igual
    // (antes quedaban invisibles en los filtros, ej. "Calzas").
    Object.keys(conteo).forEach(id => {
      if (!id || conocidas.has(id)) return;
      const ejemplo = this.productos.find(p => p.categoria === id);
      result.push({ id, nombre: ejemplo?.categoriaOriginal || id, icon: '', grupo: 'Otros', count: conteo[id] });
    });
    return result.filter(cat => cat.count > 0);
  },

  // Para mega menú / showcase: todas las categorías (sin filtro por conteo)
  obtenerTodasCategorias() {
    if (typeof AdminData !== 'undefined' && AdminData.getEffectiveCategorias) return AdminData.getEffectiveCategorias();
    return CONFIG.categorias || [];
  },

  /** ¿El producto está en oferta? (precio de oferta o flash sale más barato que el normal) */
  enOferta(p) {
    if (!p) return false;
    const base = this.calcularPrecioARS(p.precioUSD, p);
    const vista = (typeof PromoEngine !== 'undefined' && PromoEngine.precioVistaARS) ? PromoEngine.precioVistaARS(p) : base;
    return vista > 0 && vista < base;
  },

  /** Grupos del menú (sin repetir, ignora mayúsculas/tildes): [{ id:'grupo:lenceria', nombre:'Lencería' }] */
  obtenerGrupos() {
    const vistos = new Map();
    (this.obtenerTodasCategorias() || []).forEach(c => {
      if (c.id === 'todos') return;
      const nombre = String(c.grupo || '').trim();
      const slug = this.slugCategoria(nombre);
      if (slug && !vistos.has(slug)) vistos.set(slug, { id: 'grupo:' + slug, nombre });
    });
    return [...vistos.values()];
  },

  /** Nombre para mostrar de un filtro: categoría, grupo ("grupo:lenceria") u "ofertas" */
  nombreFiltro(id) {
    if (!id || id === 'todos') return '';
    if (String(id).startsWith('grupo:')) return this.obtenerGrupos().find(g => g.id === id)?.nombre || '';
    const cat = (this.obtenerTodasCategorias() || []).find(c => c.id === id);
    if (cat) return String(cat.nombre || '').trim();
    if (id === 'ofertas') return 'Ofertas';
    return this.productos.find(p => p.categoria === id)?.categoriaOriginal || '';
  },

  /**
   * Filtra por categoría. También acepta:
   *  - "ofertas": todo lo que tiene precio de oferta o flash sale (+ la categoría Ofertas si existe)
   *  - "grupo:<nombre>": todas las categorías de ese grupo del menú (ej. toda la Lencería)
   */
  filtrarPorCategoria(categoriaId) {
    const activos = this.productos.filter(p => p.activo);
    if (!categoriaId || categoriaId === 'todos') return activos;
    if (categoriaId === 'ofertas') return activos.filter(p => p.categoria === 'ofertas' || this.enOferta(p));
    if (String(categoriaId).startsWith('grupo:')) {
      const slug = String(categoriaId).slice(6);
      const ids = new Set((this.obtenerTodasCategorias() || []).filter(c => this.slugCategoria(c.grupo) === slug).map(c => c.id));
      return activos.filter(p => ids.has(p.categoria));
    }
    return activos.filter(p => p.categoria === categoriaId);
  },

  /** Texto sin tildes ni mayúsculas, para buscar ("camisolin" encuentra "Camisolín") */
  normalizarTexto(v) {
    return String(v ?? '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  },

  /**
   * Versión liviana de una foto subida a Google Drive (las originales pesan
   * ~500 KB cada una; en la grilla alcanza con 600 px de ancho).
   */
  fotoChica(url, ancho = 600) {
    const u = String(url || '');
    return /^https:\/\/lh3\.googleusercontent\.com\/d\/[\w-]+$/.test(u) ? `${u}=w${ancho}` : u;
  },

  buscarProductos(texto) {
    const n = (v) => this.normalizarTexto(v);
    const query = n(texto).trim();
    if (!query) return this.productos.filter(p => p.activo);

    return this.productos.filter(p => p.activo && (
      n(p.nombre).includes(query) ||
      n(p.descripcion).includes(query) ||
      n(p.categoriaOriginal).includes(query) ||
      n(this.nombreFiltro(p.categoria)).includes(query) ||
      (p.tags || []).some(t => n(t).includes(query)) ||
      (p.sku && n(p.sku).includes(query))
    ));
  },

  // ==================== SINCRONÍA ADMIN → SHEETS ====================

  /**
   * Guarda producto en Google Sheets via Apps Script
   */
  async guardarProducto(producto) {
    if (!this.appsScriptUrl) {
      console.warn('[Sheets] Apps Script no configurado, guardando solo localStorage');
      return this.guardarLocal(producto);
    }

    try {
      await this.postToAppsScript('upsert_product', { product: this.serializeForSheets(producto) });
      this.invalidateCache();
      await this.cargarProductos(true);
      return { success: true };
    } catch (error) {
      console.error('[Sheets] Error guardando en Sheets:', error);
      // Fallback local
      return this.guardarLocal(producto);
    }
  },

  async eliminarProducto(id) {
    if (!this.appsScriptUrl) return this.eliminarLocal(id);

    try {
      await this.postToAppsScript('delete_product', { id });
      this.invalidateCache();
      await this.cargarProductos(true);
      return { success: true };
    } catch (error) {
      console.error('[Sheets] Error eliminando:', error);
      return this.eliminarLocal(id);
    }
  },

  serializeForSheets(p) {
    return {
      id: p.id,
      nombre: p.nombre,
      categoria: p.categoria,
      categoriaOriginal: p.categoriaOriginal,
      subcategoria: p.subcategoria || '',
      descripcion: p.descripcion || '',
      descripcionCorta: p.descripcionCorta || '',
      precioUSD: p.precioUSD,
      precioARSManual: p.precioARSManual,
      precioOferta: p.precioOferta,
      margenPersonalizado: p.margenPersonalizado ? p.margenPersonalizado * 100 : null,
      imagen: p.imagen,
      stock: p.stock,
      stockMin: p.stockMin || 5,
      peso: p.peso,
      dimensiones: p.dimensiones,
      tags: Array.isArray(p.tags) ? p.tags.join(', ') : (p.tags || ''),
      sku: p.sku || '',
      // El Apps Script ya los convierte a texto: mandarlos como lista/objeto
      // (antes se mandaban como texto y quedaban codificados dos veces)
      galeria: Array.isArray(p.galeria) ? p.galeria : this.parseJSONSafe(p.galeria, []),
      variantes: Array.isArray(p.variantes) ? p.variantes : this.parseJSONSafe(p.variantes, []),
      caracteristicas: (p.caracteristicas && typeof p.caracteristicas === 'object') ? p.caracteristicas : this.parseJSONSafe(p.caracteristicas, {}),
      activo: p.activo,
      destacado: p.destacado,
      soloWeb: p.soloWeb,
      seoTitle: p.seoTitle || '',
      seoDesc: p.seoDesc || '',
    };
  },

  // ==================== LOCALSTORAGE FALLBACK ====================

  guardarLocal(producto) {
    const productos = JSON.parse(localStorage.getItem('pl_products') || '[]');
    const idx = productos.findIndex(p => p.id === producto.id);
    if (idx >= 0) productos[idx] = producto;
    else productos.push(producto);
    localStorage.setItem('pl_products', JSON.stringify(productos));
    this.productos = productos;
    this.setCache(productos);
    return { success: true, local: true };
  },

  eliminarLocal(id) {
    let productos = JSON.parse(localStorage.getItem('pl_products') || '[]');
    productos = productos.filter(p => p.id !== id);
    localStorage.setItem('pl_products', JSON.stringify(productos));
    this.productos = productos;
    this.setCache(productos);
    return { success: true, local: true };
  },

  // ==================== PEDIDOS (para checkout) ====================

  async crearPedido(orderData) {
    if (!this.appsScriptUrl) return this.crearPedidoLocal(orderData);

    try {
      return await this.postToAppsScript('create_order', { order: orderData });
    } catch (error) {
      console.error('[Sheets] Error creando pedido:', error);
      return this.crearPedidoLocal(orderData);
    }
  },

  crearPedidoLocal(orderData) {
    const orders = JSON.parse(localStorage.getItem('pl_orders') || '[]');
    orderData.id = orderData.id || 'ord_' + Date.now();
    orderData.fecha = new Date().toISOString();
    orders.push(orderData);
    localStorage.setItem('pl_orders', JSON.stringify(orders));
    return { success: true, local: true };
  },

  // ==================== CONFIG PÚBLICA (tienda) ====================

  /**
   * Trae de la hoja Config lo que el admin publica para la tienda
   * (textos, categorías, envíos, WhatsApp...) y lo aplica sobre CONFIG.
   * Así los cambios del admin llegan a TODAS las clientas, no solo a tu navegador.
   */
  async cargarConfigPublica(opts = {}) {
    if (!this.appsScriptUrl) return null;
    // En la vista previa del admin manda lo guardado en este navegador
    // (así la dueña ve su cambio al instante, antes de que se publique).
    let local = {};
    if (opts.preview) {
      const has = (k) => { try { return !!localStorage.getItem(k); } catch { return false; } };
      local = { categorias: has('pl_admin_categorias'), contenido: has('pl_admin_contenido'), envios: has('pl_admin_envios') };
    }
    try {
      const remote = await this.fetchFromAppsScript('config');
      if (!remote || typeof remote !== 'object') return null;
      const parse = (v) => { if (typeof v !== 'string') return v; try { return JSON.parse(v); } catch { return null; } };
      const cats = parse(remote.categorias);
      if (!local.categorias && Array.isArray(cats) && cats.length) CONFIG.categorias = cats;
      this.reasignarCategorias();
      const cont = parse(remote.contenido);
      if (!local.contenido && cont && typeof cont === 'object') {
        const base = CONFIG.contenido || {};
        const merged = { ...base, ...cont };
        ['showcase', 'servicios', 'promoBand', 'cta', 'newsletter', 'footer', 'productos', 'secciones', 'clubPrince'].forEach(k => {
          if (cont[k] && typeof cont[k] === 'object' && !Array.isArray(cont[k])) merged[k] = { ...(base[k] || {}), ...cont[k] };
        });
        CONFIG.contenido = merged;
      }
      const envios = parse(remote.envios);
      if (!local.envios && Array.isArray(envios) && envios.length) CONFIG.envios = envios;
      if (remote.promos && typeof PromoEngine !== 'undefined') {
        const pr = parse(remote.promos);
        if (pr && typeof pr === 'object') { PromoEngine._remote = pr; PromoEngine.apply?.(); }
      }
      const wa = String(remote.whatsapp || '').replace(/\D/g, '');
      if (wa.length >= 10) CONFIG.negocio.whatsapp = wa;
      if (remote.instagram) CONFIG.negocio.instagram = String(remote.instagram).replace(/^@/, '');
      if (remote.nombre) CONFIG.negocio.nombre = String(remote.nombre);
      if (Number(remote.margen) > 0) CONFIG.cotizacion.margenGanancia = Number(remote.margen);
      if (Number(remote.dolarManual) > 0) CONFIG.cotizacion.cotizacionManual = Number(remote.dolarManual);
      return remote;
    } catch (e) {
      console.warn('[Sheets] config pública no disponible:', e.message);
      return null;
    }
  },

  // ==================== CONFIG (sincronía settings) ====================

  async obtenerConfig() {
    if (!this.appsScriptUrl) return this.obtenerConfigLocal();

    try {
      return await this.fetchFromAppsScript('config');
    } catch (e) {
      return this.obtenerConfigLocal();
    }
  },

  obtenerConfigLocal() {
    return JSON.parse(localStorage.getItem('pl_config') || '{}');
  },

  async guardarConfig(config) {
    if (!this.appsScriptUrl) return this.guardarConfigLocal(config);

    try {
      return await this.postToAppsScript('save_config', { config });
    } catch (e) {
      this.guardarConfigLocal(config);
      return { success: false, error: e.message };
    }
  },

  guardarConfigLocal(config) {
    localStorage.setItem('pl_config', JSON.stringify(config));
    return { success: true };
  },

  // ==================== UTILIDADES ====================

  // Forzar recarga completa (útil después de cambios en admin)
  async refrescarTodo() {
    this.invalidateCache();
    await this.cargarProductos(true);
    this.cotizacionDolar = null;
    await this.obtenerCotizacion();
  },
};

// Auto-inicializar al cargar
document.addEventListener('DOMContentLoaded', () => SheetsService.init());