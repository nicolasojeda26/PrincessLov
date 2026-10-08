/* ============================================
   ADMIN DATA - Capa de Persistencia Local
   ============================================ */

const AdminData = {
  // ==========================================
  // CLAVES DE STORAGE
  // ==========================================
  KEYS: {
    products: 'pl_admin_products',
    orders: 'pl_admin_orders',
    expenses: 'pl_admin_expenses',
    settings: 'pl_admin_settings',
    dolarHistory: 'pl_admin_dolar_history',
    categorias: 'pl_admin_categorias',
    contenido: 'pl_admin_contenido',
    promos: 'pl_admin_promos',
  },

  // ==========================================
  // PRODUCTOS
  // ==========================================
  _readJSON(key, fallback) {
    try {
      const v = JSON.parse(localStorage.getItem(key) || 'null');
      return v == null ? fallback : v;
    } catch { return fallback; }
  },

  getProducts() {
    const v = this._readJSON(this.KEYS.products, []);
    return Array.isArray(v) ? v : [];
  },

  saveProducts(products) {
    localStorage.setItem(this.KEYS.products, JSON.stringify(products));
  },

  addProduct(product) {
    const products = this.getProducts();
    product.id = product.id || this.generateId();
    product.fechaCreacion = product.fechaCreacion || new Date().toISOString();
    product.fechaModificacion = new Date().toISOString();
    products.push(product);
    this.saveProducts(products);
    return product;
  },

  updateProduct(id, updates) {
    const products = this.getProducts();
    const idx = products.findIndex(p => p.id === id);
    if (idx === -1) return null;
    products[idx] = { ...products[idx], ...updates, fechaModificacion: new Date().toISOString() };
    this.saveProducts(products);
    return products[idx];
  },

  deleteProduct(id) {
    const products = this.getProducts().filter(p => p.id !== id);
    this.saveProducts(products);
  },

  getProduct(id) {
    return this.getProducts().find(p => p.id === id) || null;
  },

  // Devuelve el grupo de categoría (ej: "Indumentaria Deportiva", "Pijamas")
  getGrupoProducto(productoId) {
    const prod = this.getProduct(productoId);
    if (!prod) return 'General';
    const cats = this.getEffectiveCategorias ? this.getEffectiveCategorias() : (CONFIG.categorias || []);
    const cat = cats.find(c => c.id === prod.categoria);
    return cat?.grupo || prod.grupo || prod.categoriaOriginal || 'General';
  },

  // Aplica categorías/contenido guardados a CONFIG (llamar al iniciar tienda y admin)
  applyCustomToConfig() {
    try {
      const cats = this.getCategorias();
      if (cats) CONFIG.categorias = cats;
      const cont = this.getContenido();
      if (cont) CONFIG.contenido = this.getEffectiveContenido();
    } catch {}
  },

  importProducts(csvData) {
    const existing = this.getProducts();
    const existingIds = new Set(existing.map(p => String(p.id)));
    let added = 0, updated = 0;

    csvData.forEach(item => {
      if (existingIds.has(String(item.id))) {
        const idx = existing.findIndex(p => String(p.id) === String(item.id));
        existing[idx] = { ...existing[idx], ...item, fechaModificacion: new Date().toISOString() };
        updated++;
      } else {
        item.fechaCreacion = new Date().toISOString();
        item.fechaModificacion = new Date().toISOString();
        existing.push(item);
        added++;
      }
    });

    this.saveProducts(existing);
    return { added, updated, total: existing.length };
  },

  // ==========================================
  // PEDIDOS / VENTAS
  // ==========================================
  getOrders() {
    const v = this._readJSON(this.KEYS.orders, []);
    return Array.isArray(v) ? v : [];
  },

  /** Estados en los que la mercadería ya está comprometida */
  ESTADOS_CON_STOCK: ['confirmado', 'preparando', 'enviado', 'entregado'],

  _moverStock(order, signo) {
    (order.items || []).forEach(item => this.adjustStock(item.productoId, signo * (Number(item.cantidad) || 0), item.variante));
  },

  saveOrders(orders) {
    localStorage.setItem(this.KEYS.orders, JSON.stringify(orders));
  },

  addOrder(order) {
    const orders = this.getOrders();
    order.id = order.id || this.generateId();
    order.fecha = order.fecha || new Date().toISOString();
    order.estado = order.estado || 'pendiente';
    order.items = order.items || [];
    if (!order.total) {
      order.total = order.items.reduce((s, i) => s + ((i.precioUnitario || 0) * i.cantidad), 0);
    }
    if (order.costoTotal == null) order.costoTotal = 0;
    // El stock se descuenta cuando el pedido está confirmado (o más avanzado).
    // Un pedido "pendiente" (ej. recién llegado por WhatsApp) todavía no reserva stock.
    order.stockDescontado = false;
    if (this.ESTADOS_CON_STOCK.includes(order.estado) && order.items.length) {
      this._moverStock(order, -1);
      order.stockDescontado = true;
    }
    orders.push(order);
    this.saveOrders(orders);
    return order;
  },

  updateOrder(id, updates) {
    const orders = this.getOrders();
    const idx = orders.findIndex(o => o.id === id);
    if (idx === -1) return null;

    const oldOrder = orders[idx];
    const nuevo = { ...oldOrder, ...updates, fechaModificacion: new Date().toISOString() };

    // Stock: primero devolvemos lo que había descontado el pedido viejo y
    // después descontamos según el estado/ítems nuevos. Así funciona al
    // confirmar, cancelar, reactivar o editar cantidades (antes solo
    // devolvía stock al cancelar y nunca lo volvía a descontar).
    if (oldOrder.stockDescontado) this._moverStock(oldOrder, +1);
    nuevo.stockDescontado = false;
    if (this.ESTADOS_CON_STOCK.includes(nuevo.estado) && (nuevo.items || []).length) {
      this._moverStock(nuevo, -1);
      nuevo.stockDescontado = true;
    }

    orders[idx] = nuevo;
    this.saveOrders(orders);
    return orders[idx];
  },

  deleteOrder(id) {
    const order = this.getOrder(id);
    if (order && order.stockDescontado) this._moverStock(order, +1);
    const orders = this.getOrders().filter(o => o.id !== id);
    this.saveOrders(orders);
  },

  getOrder(id) {
    return this.getOrders().find(o => o.id === id) || null;
  },

  // ==========================================
  // GASTOS
  // ==========================================
  getExpenses() {
    const v = this._readJSON(this.KEYS.expenses, []);
    return Array.isArray(v) ? v : [];
  },

  saveExpenses(expenses) {
    localStorage.setItem(this.KEYS.expenses, JSON.stringify(expenses));
  },

  addExpense(expense) {
    const expenses = this.getExpenses();
    expense.id = expense.id || this.generateId();
    expense.fecha = expense.fecha || new Date().toISOString();
    expenses.push(expense);
    this.saveExpenses(expenses);
    return expense;
  },

  deleteExpense(id) {
    const expenses = this.getExpenses().filter(e => e.id !== id);
    this.saveExpenses(expenses);
  },

  getTotalExpenses(period) {
    const expenses = this.getExpenses();
    if (!period) return expenses.reduce((s, e) => s + (e.monto || 0), 0);
    return expenses.filter(e => this.isInPeriod(e.fecha, period)).reduce((s, e) => s + (e.monto || 0), 0);
  },

  // ==========================================
  // STOCK
  // ==========================================
  /**
   * Ajusta stock. Si se indica variante ("Color / Talle"), ajusta esa variante
   * y recalcula el total del producto.
   */
  adjustStock(productId, delta, variante) {
    const products = this.getProducts();
    const idx = products.findIndex(p => String(p.id) === String(productId));
    if (idx === -1 || !delta) return null;
    const p = products[idx];
    const vars = Array.isArray(p.variantes) ? p.variantes : [];
    let tocada = false;
    if (variante && vars.length) {
      const [color, talle] = String(variante).split('/').map(x => x.trim());
      const v = vars.find(x => String(x.color || '').trim() === (color || '') && String(x.talle || '').trim() === (talle || ''));
      if (v) {
        v.stock = Math.max(0, (Number(v.stock) || 0) + delta);
        p.stock = vars.reduce((s, x) => s + (Number(x.stock) || 0), 0);
        tocada = true;
      }
    }
    if (!tocada) p.stock = Math.max(0, (Number(p.stock) || 0) + delta);
    p.fechaModificacion = new Date().toISOString();
    this.saveProducts(products);
    window.dispatchEvent(new CustomEvent('admin:stock', { detail: p }));
    return p;
  },

  /** "Negro / M" → "Talle M · Negro";  "/ S" → "Talle S";  "Rosa /" → "Rosa" */
  varianteLegible(variante) {
    const [color, talle] = String(variante || '').split('/').map(x => x.trim());
    return [talle && `Talle ${talle}`, color].filter(Boolean).join(' · ');
  },

  /** Precio de venta real en pesos (precio fijo, oferta, flash o USD × dólar × margen) */
  precioVentaARS(p) {
    if (!p) return 0;
    try {
      if (typeof PromoEngine !== 'undefined' && PromoEngine.precioVistaARS) return Math.round(PromoEngine.precioVistaARS(p)) || 0;
      if (typeof SheetsService !== 'undefined') return Math.round(SheetsService.calcularPrecioARS(p.precioUSD, p)) || 0;
    } catch {}
    return Number(p.precioARSManual) || 0;
  },

  getLowStockProducts(threshold = 5) {
    return this.getProducts().filter(p => p.activo && (p.stock || 0) <= threshold);
  },

  // ==========================================
  // CATEGORÍAS EDITABLES
  // ==========================================
  getCategorias() {
    const saved = localStorage.getItem(this.KEYS.categorias);
    if (saved) try { const arr = JSON.parse(saved); if (Array.isArray(arr) && arr.length) return arr; } catch {}
    return null; // usar CONFIG.categorias por defecto
  },
  getEffectiveCategorias() {
    return this.getCategorias() || CONFIG.categorias || [];
  },
  saveCategorias(cats) {
    localStorage.setItem(this.KEYS.categorias, JSON.stringify(cats));
    // Aplicar en vivo a CONFIG y notificar a la tienda
    try { CONFIG.categorias = cats; } catch {}
    window.dispatchEvent(new CustomEvent('categorias:updated', { detail: cats }));
  },
  resetCategorias() {
    localStorage.removeItem(this.KEYS.categorias);
    try { CONFIG.categorias = this.getEffectiveCategorias(); } catch {}
    window.dispatchEvent(new CustomEvent('categorias:updated', { detail: this.getEffectiveCategorias() }));
  },

  // ==========================================
  // CONTENIDO EDITABLE (home)
  // ==========================================
  getContenido() {
    const saved = localStorage.getItem(this.KEYS.contenido);
    if (saved) try { const obj = JSON.parse(saved); if (obj && typeof obj === 'object') return obj; } catch {}
    return null;
  },
  getEffectiveContenido() {
    const custom = this.getContenido();
    if (!custom) return CONFIG.contenido || {};
    // merge shallow: custom sobreescribe defaults
    return { ...(CONFIG.contenido || {}), ...custom, promoBar: custom.promoBar || CONFIG.contenido?.promoBar, hero: custom.hero || CONFIG.contenido?.hero, showcase: custom.showcase || CONFIG.contenido?.showcase, servicios: custom.servicios || CONFIG.contenido?.servicios, promoBand: custom.promoBand || CONFIG.contenido?.promoBand, cta: custom.cta || CONFIG.contenido?.cta, newsletter: custom.newsletter || CONFIG.contenido?.newsletter, footer: custom.footer || CONFIG.contenido?.footer };
  },
  saveContenido(cont) {
    localStorage.setItem(this.KEYS.contenido, JSON.stringify(cont));
    try { CONFIG.contenido = this.getEffectiveContenido(); } catch {}
    window.dispatchEvent(new CustomEvent('contenido:updated', { detail: cont }));
  },
  resetContenido() {
    localStorage.removeItem(this.KEYS.contenido);
    try { CONFIG.contenido = this.getEffectiveContenido(); } catch {}
    window.dispatchEvent(new CustomEvent('contenido:updated', { detail: this.getEffectiveContenido() }));
  },

  // ==========================================
  // PROMOS (motor de promociones, Fase 2)
  // ==========================================
  getPromos() {
    const saved = localStorage.getItem(this.KEYS.promos);
    if (saved) try { const obj = JSON.parse(saved); if (obj && typeof obj === 'object') return obj; } catch {}
    return null;
  },
  getEffectivePromos() {
    const custom = this.getPromos();
    const base = CONFIG?.promos || {};
    return custom ? { ...base, ...custom, cupones: custom.cupones ?? base.cupones, flashSales: custom.flashSales ?? base.flashSales, combos: custom.combos ?? base.combos, dosPorUno: custom.dosPorUno ?? base.dosPorUno, preventas: custom.preventas ?? base.preventas } : base;
  },
  savePromos(promos) {
    localStorage.setItem(this.KEYS.promos, JSON.stringify(promos));
    window.dispatchEvent(new CustomEvent('promos:updated', { detail: promos }));
  },
  resetPromos() {
    localStorage.removeItem(this.KEYS.promos);
    window.dispatchEvent(new CustomEvent('promos:updated', { detail: this.getEffectivePromos() }));
  },

  // ==========================================
  // CONFIGURACIÓN
  // ==========================================
  getSettings() {
    const v = this._readJSON(this.KEYS.settings, {});
    return v && typeof v === 'object' ? v : {};
  },

  saveSettings(settings) {
    localStorage.setItem(this.KEYS.settings, JSON.stringify(settings));
  },

  // ==========================================
  // HISTORIAL DÓLAR
  // ==========================================
  addDolarRate(rate) {
    const history = this._readJSON(this.KEYS.dolarHistory, []);
    history.push({ fecha: new Date().toISOString(), valor: rate });
    // Mantener solo últimos 90 días
    if (history.length > 90) history.splice(0, history.length - 90);
    localStorage.setItem(this.KEYS.dolarHistory, JSON.stringify(history));
  },

  getDolarHistory() {
    return this._readJSON(this.KEYS.dolarHistory, []);
  },

  // ==========================================
  // ESTADÍSTICAS / MÉTRICAS
  // ==========================================
  getStats(periodo) {
    const orders = this.getOrders().filter(o => o.estado !== 'cancelado');
    const products = this.getProducts();
    const now = new Date();

    // Filtrar por período
    const filtered = periodo ? orders.filter(o => this.isInPeriod(o.fecha, periodo)) : orders;

    const ingresos = filtered.reduce((s, o) => s + (o.total || 0), 0);
    const costos = filtered.reduce((s, o) => s + (o.costoTotal || 0), 0);
    const ganancia = ingresos - costos;
    const margen = ingresos > 0 ? (ganancia / ingresos * 100) : 0;

    // Pedidos por estado
    const porEstado = {};
    ADMIN_CONFIG.estadosPedido.forEach(ep => {
      porEstado[ep.id] = filtered.filter(o => o.estado === ep.id).length;
    });

    // Productos más vendidos
    const vendidos = {};
    filtered.forEach(o => {
      (o.items || []).forEach(item => {
        vendidos[item.productoId] = (vendidos[item.productoId] || 0) + item.cantidad;
      });
    });

    const topProductos = Object.entries(vendidos)
      .map(([id, cant]) => {
        const prod = products.find(p => p.id === id);
        return { id, nombre: prod?.nombre || id, cantidad: cant };
      })
      .sort((a, b) => b.cantidad - a.cantidad)
      .slice(0, 10);

    // Ganancia por grupo de categoría (deportivo, pijamas, etc.)
    // Ordena la ganancia de cada pedido por el grupo del producto vendido
    // y la reparte proporcionalmente al revenue de los items
    const grupos = {};
    filtered.forEach(o => {
      const orderItems = o.items || [];
      const revenueItems = orderItems.reduce((s, it) => s + ((it.precioUnitario || 0) * (it.cantidad || 1)), 0);

      if (orderItems.length > 0) {
        // Repartir la ganancia del pedido proporcionalmente al revenue de cada item
        orderItems.forEach(it => {
          const g = this.getGrupoProducto(it.productoId);
          if (!grupos[g]) grupos[g] = { grupo: g, ingresos: 0, costos: 0, ganancia: 0 };
          const share = revenueItems > 0 ? ((it.precioUnitario || 0) * (it.cantidad || 1)) / revenueItems : 1 / orderItems.length;
          grupos[g].ingresos += (o.total || 0) * share;
          grupos[g].costos += (o.costoTotal || 0) * share;
        });
      } else {
        // Pedido sin items: agrupar en "General"
        const g = 'General';
        if (!grupos[g]) grupos[g] = { grupo: g, ingresos: 0, costos: 0, ganancia: 0 };
        grupos[g].ingresos += (o.total || 0);
        grupos[g].costos += (o.costoTotal || 0);
      }
    });
    Object.values(grupos).forEach(g => { g.ganancia = g.ingresos - g.costos; });
    const gananciaPorGrupo = Object.values(grupos).sort((a, b) => b.ganancia - a.ganancia);

    // Ventas por día (últimos 30 días)
    const ventasPorDia = {};
    for (let i = 29; i >= 0; i--) {
      const d = new Date(now);
      d.setDate(d.getDate() - i);
      const key = d.toISOString().slice(0, 10);
      ventasPorDia[key] = { fecha: key, ingresos: 0, pedidos: 0 };
    }
    filtered.forEach(o => {
      const key = o.fecha?.slice(0, 10);
      if (ventasPorDia[key]) {
        ventasPorDia[key].ingresos += o.total || 0;
        ventasPorDia[key].pedidos += 1;
      }
    });

    // Ticket promedio
    const ticketProm = filtered.length > 0 ? ingresos / filtered.length : 0;

    return {
      periodo: periodo || 'total',
      totalPedidos: filtered.length,
      pedidosActivos: filtered.filter(o => !['entregado', 'cancelado'].includes(o.estado)).length,
      ingresos,
      costos,
      ganancia,
      margen,
      ticketProm,
      porEstado,
      topProductos,
      ventasPorDia: Object.values(ventasPorDia),
      gananciaPorGrupo,
    };
  },

  /**
   * Punto de equilibrio: cuántas unidades necesitás vender para cubrir gastos fijos
   */
  calcularPuntoEquilibrio(dolar) {
    const gastos = ADMIN_CONFIG.gastosFijos;
    const costosVar = ADMIN_CONFIG.costosVariables;
    const totalGastosFijos = Object.values(gastos).reduce((s, v) => s + (v || 0), 0);

    // Calcular ganancia promedio por unidad (usando productos activos)
    const products = this.getProducts().filter(p => p.activo && p.precioUSD > 0);
    if (products.length === 0) return { unidades: 0, monto: 0, gastosFijos: totalGastosFijos, gananciaPromUnit: 0 };

    let gananciaTotalUSD = 0;
    products.forEach(p => {
      const precioVenta = p.precioUSD * (dolar || 1200) * (CONFIG?.cotizacion?.margenGanancia || 1.3);
      const costoTotal = p.precioUSD + costosVar.envoltorio + costosVar.etiqueta;
      const costoARS = costoTotal * (dolar || 1200);
      const comisionMP = precioVenta * costosVar.comisionMP;
      const gananciaUnit = precioVenta - costoARS - comisionMP;
      gananciaTotalUSD += gananciaUnit;
    });

    const gananciaPromUnit = gananciaTotalUSD / products.length;
    const unidades = gananciaPromUnit > 0 ? Math.ceil(totalGastosFijos / gananciaPromUnit) : 0;

    return {
      unidades,
      monto: unidades * gananciaPromUnit,
      gastosFijos: totalGastosFijos,
      gananciaPromUnit,
    };
  },

  // ==========================================
  // UTILIDADES
  // ==========================================
  generateId() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  },

  isInPeriod(fecha, periodo) {
    if (!fecha) return false;
    const d = new Date(fecha);
    const now = new Date();
    switch (periodo) {
      case 'hoy':
        return d.toDateString() === now.toDateString();
      case 'semana': {
        const weekAgo = new Date(now);
        weekAgo.setDate(weekAgo.getDate() - 7);
        return d >= weekAgo;
      }
      case 'mes': {
        const monthAgo = new Date(now);
        monthAgo.setMonth(monthAgo.getMonth() - 1);
        return d >= monthAgo;
      }
      case 'trimestre': {
        const qAgo = new Date(now);
        qAgo.setMonth(qAgo.getMonth() - 3);
        return d >= qAgo;
      }
      case 'anio': {
        const yAgo = new Date(now);
        yAgo.setFullYear(yAgo.getFullYear() - 1);
        return d >= yAgo;
      }
      default:
        return true;
    }
  },

  formatARS(val) {
    return new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', minimumFractionDigits: 0 }).format(val || 0);
  },

  formatUSD(val) {
    return 'USD ' + new Intl.NumberFormat('en-US', { minimumFractionDigits: 2 }).format(val || 0);
  },

  formatNumber(val) {
    return new Intl.NumberFormat('es-AR').format(val || 0);
  },
};
