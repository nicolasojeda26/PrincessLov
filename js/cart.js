/* ============================================
   CART SERVICE - Carrito de Compras (con soporte variantes)
   ============================================ */

const CartService = {
  items: [],
  listeners: [],
  shippingId: null,
  shippingCost: 0,
  discountAmount: 0,
  promoCode: null,
  promoData: null,
  _autoLines: [],

  /**
   * Inicializa el carrito desde localStorage
   */
  init() {
    let saved = null;
    try { saved = localStorage.getItem('princesslov_cart'); } catch {}
    if (saved) {
      try {
        const data = JSON.parse(saved);
        if (Array.isArray(data)) {
          this.items = data;
        } else if (data && typeof data === 'object') {
          this.items = Array.isArray(data.items) ? data.items : [];
          this.shippingId = data.shippingId || null;
          this.shippingCost = data.shippingCost || 0;
          this.discountAmount = data.discountAmount || 0;
          this.promoCode = data.promoCode || null;
          this.promoData = data.promoData || null;
        }
      } catch (e) {
        this.items = [];
      }
    }
    // Datos corruptos o manipulados en localStorage: descartamos lo inválido
    this.items = this.items.filter(i => i && i.id != null && Number(i.cantidad) > 0)
      .map(i => ({ ...i, cantidad: Math.min(Math.floor(Number(i.cantidad)) || 1, 99) }));
    this.notifyListeners();
  },

  /**
   * Guarda el carrito completo en localStorage
   */
  save() {
    // Mantener los campos derivados al día (compatibilidad con código viejo)
    this.discountAmount = this.getCouponDiscount();
    this.shippingCost = this.getShippingCost();
    try {
      localStorage.setItem('princesslov_cart', JSON.stringify({
        items: this.items,
        shippingId: this.shippingId,
        promoCode: this.promoCode,
        promoData: this.promoData,
      }));
    } catch {}
    this.notifyListeners();
  },

  /**
   * Registra un listener para cambios en el carrito
   */
  onChange(callback) {
    this.listeners.push(callback);
  },

  /**
   * Notifica a los listeners
   */
  notifyListeners() {
    const count = this.getTotalItems();
    const total = this.getTotalARS();
    this.listeners.forEach(cb => cb({ items: this.items, count, total }));
  },

  /**
   * Agrega un producto al carrito (soporta variantes)
   */
  addItem(producto, cantidad = 1, variant = null) {
    // Soporta variante por parámetro o embebida en el producto (producto._variant)
    const v = variant || producto._variant || null;
    // Crear clave única: id + variante (color+talle)
    const variantKey = v ? `${v.color}|${v.talle}` : 'default';
    const itemKey = `${producto.id}::${variantKey}`;

    const existing = this.items.find(i => i.key === itemKey);

    // Límite de stock: si hay variante, usar el stock de esa variante
    const stockLimite = v
      ? (Array.isArray(producto.variantes)
        ? (producto.variantes.find(vv => (vv.color || '') === (v.color || '') && (vv.talle || '') === (v.talle || ''))?.stock ?? producto.stock)
        : producto.stock)
      : producto.stock;

    // Calcular precio ARS del producto (precio manual, oferta, preventa, flash y margen)
    const precioARS = (typeof PromoEngine !== 'undefined' && PromoEngine.precioCompraARS)
      ? PromoEngine.precioCompraARS(producto)
      : SheetsService.calcularPrecioARS(producto.precioUSD, producto);
    const precioUSD = producto.precioUSD;

    if (!(stockLimite > 0)) return;

    if (existing) {
      existing.cantidad = Math.min(existing.cantidad + cantidad, stockLimite);
    } else {
      const item = {
        key: itemKey,
        id: producto.id,
        nombre: producto.nombre,
        imagen: producto.imagen,
        precioUSD: precioUSD,
        precioARS: precioARS,
        cantidad: Math.min(cantidad, stockLimite),
        stock: stockLimite,
        categoria: producto.categoria || producto.categoriaOriginal || null,
        isClubPrince: !!(producto.isClubPrince || producto.categoria === 'club-prince'),
        variante: v ? `${v.color} / ${v.talle}` : null,
        _variant: v, // Para referencia interna
      };
      this.items.push(item);
    }

    this.save();
  },

  /**
   * Remueve un producto del carrito
   */
  removeItem(productId) {
    // Soporta tanto ID simple como key compuesta
    this.items = this.items.filter(i => i.key !== productId && i.id !== productId);
    this.save();
  },

  /**
   * Actualiza la cantidad de un producto
   */
  updateQuantity(productId, newQty) {
    const item = this.items.find(i => i.key === productId || i.id === productId);
    if (item) {
      if (newQty <= 0) {
        this.removeItem(productId);
      } else {
        item.cantidad = Math.min(newQty, this.getItemStock(item));
        this.save();
      }
    }
  },

  /**
   * Devuelve el stock disponible real para un item (respeta la variante)
   */
  getItemStock(item) {
    const producto = SheetsService.obtenerProducto(item.id);
    if (item._variant && producto && Array.isArray(producto.variantes) && producto.variantes.length) {
      const v = producto.variantes.find(vv => (vv.color || '') === (item._variant.color || '') && (vv.talle || '') === (item._variant.talle || ''));
      if (v) return v.stock || 0;
    }
    return producto ? (producto.stock || 0) : (item.stock ?? 99);
  },

  /**
   * Sincroniza stock/cantidades del carrito con los datos actuales y marca
   * items sin stock o con cantidad ajustada (avisos entre sesiones)
   */
  sincronizarStock() {
    if (!Array.isArray(this.items) || this.items.length === 0) return 0;
    let cambios = 0;
    this.items.forEach(item => {
      if (item.isClubPrince) return;
      const stock = this.getItemStock(item);
      if (stock <= 0) {
        const yaMarcado = item.sinStock;
        item.sinStock = true;
        item.stockAjustado = false;
        if (!yaMarcado) cambios++;
      } else if (item.cantidad > stock) {
        const yaAjustado = item.stockAjustado;
        item.cantidad = stock;
        item.stockAjustado = true;
        item.sinStock = false;
        if (!yaAjustado) cambios++;
      } else {
        item.sinStock = false;
        item.stockAjustado = false;
      }
    });
    if (cambios > 0) this.save();
    return cambios;
  },

  /**
   * Verifica stock en tiempo real contra el servidor
   * Retorna { ok: boolean, message: string, adjusted: boolean }
   */
  async verifyStock() {
    if (!this.items.length) return { ok: true, message: '', adjusted: false };

    // Intentar verificar contra Apps Script (si está configurado)
    const url = (typeof CONFIG !== 'undefined' && CONFIG.sheets?.appsScriptUrl && !CONFIG.sheets.appsScriptUrl.includes('TU_SCRIPT_ID'))
      ? CONFIG.sheets.appsScriptUrl : null;

    let stockMap = {};

    if (url && typeof fetch !== 'undefined') {
      try {
        const ids = this.items.filter(i => !i.isClubPrince).map(i => i.id);
        const u = new URL(url);
        u.searchParams.set('action', 'check_stock');
        u.searchParams.set('ids', ids.join(','));
        const res = await fetch(u, { method: 'GET', headers: { 'Accept': 'application/json' } });
        if (res.ok) {
          const data = await res.json();
          if (data && typeof data === 'object') stockMap = data;
        }
      } catch (e) {
        console.warn('[Cart] verifyStock remoto falló:', e.message);
      }
    }

    // Fallback: usar stock local de SheetsService
    if (!Object.keys(stockMap).length && typeof SheetsService !== 'undefined') {
      this.items.forEach(item => {
        if (item.isClubPrince) return;
        const prod = SheetsService.obtenerProducto(item.id);
        if (prod) stockMap[item.id] = prod.stock;
      });
    }

    let adjusted = false;
    const warnings = [];

    this.items.forEach(item => {
      if (item.isClubPrince) return;
      const serverStock = stockMap[item.id];
      if (serverStock == null) return;

      if (serverStock <= 0 && !item.sinStock) {
        item.sinStock = true;
        item.stockAjustado = false;
        warnings.push(`${item.nombre}: sin stock`);
        adjusted = true;
      } else if (item.cantidad > serverStock) {
        item.cantidad = serverStock;
        item.stockAjustado = true;
        item.sinStock = false;
        warnings.push(`${item.nombre}: ajustado a ${serverStock} u.`);
        adjusted = true;
      }
    });

    if (adjusted) this.save();

    return {
      ok: warnings.length === 0,
      message: warnings.length ? `Stock actualizado: ${warnings.join(', ')}` : '',
      adjusted,
    };
  },

  /**
   * Obtiene el total de items
   */
  getTotalItems() {
    return this.items.reduce((sum, i) => sum + i.cantidad, 0);
  },

  /**
   * Total "bruto" de líneas (sin restar 2x1/combos ni cupón)
   */
  getLineasSubtotalARS() {
    this.items.forEach(item => {
      // Recalcular por si cambió el dólar o expiró una promo
      const producto = SheetsService.obtenerProducto(item.id);
      if (producto) {
        item.precioARS = (typeof PromoEngine !== 'undefined' && PromoEngine.precioCompraARS)
          ? PromoEngine.precioCompraARS(producto)
          : SheetsService.calcularPrecioARS(producto.precioUSD, producto);
      }
    });
    return this.items.reduce((sum, i) => sum + (i.precioARS * i.cantidad), 0);
  },

  /**
   * Descuentos automáticos (2x1 y combos) del carrito actual
   */
  calcAutoDiscount() {
    this._autoLines = [];
    if (typeof PromoEngine === 'undefined') return 0;
    const byId = (id) => SheetsService.obtenerProducto(id);
    const lines = PromoEngine.descuentosAutomaticos(this.items, byId);
    this._autoLines = lines;
    return lines.reduce((s, l) => s + l.monto, 0);
  },

  getAutoDiscountLines() {
    return this._autoLines || [];
  },

  /**
   * Obtiene el subtotal en ARS (líneas - descuentos automáticos 2x1/combos)
   */
  getSubtotalARS() {
    const lineas = this.getLineasSubtotalARS();
    return Math.max(0, lineas - this.calcAutoDiscount());
  },

  /**
   * Obtiene el total en ARS (líneas - descuentos automáticos - cupón + envío)
   */
  getTotalARS() {
    const lineas = this.getLineasSubtotalARS();
    const auto = this.calcAutoDiscount();
    const coupon = this.getCouponDiscount();
    const shipping = this.getShippingCost();
    return Math.max(0, lineas - auto - coupon + shipping);
  },

  /**
   * Descuento del cupón, recalculado en cada llamada.
   * (Antes se calculaba una sola vez al aplicarlo: si después agregabas
   * productos, el 20% seguía siendo sobre el carrito viejo.)
   * Misma regla que el servidor (api/_lib/pricing.js): % sobre las líneas.
   */
  getCouponDiscount() {
    const promo = this.promoData;
    if (!promo || !this.items.length) return 0;
    // El cupón pudo haberse desactivado desde el admin
    if (this.promoCode && typeof PromoEngine !== 'undefined' && PromoEngine.validarCupon && !PromoEngine.validarCupon(this.promoCode)) return 0;
    const type = promo.type || promo.tipo;
    const value = Number(promo.value != null ? promo.value : promo.valor) || 0;
    const lineas = this.getLineasSubtotalARS();
    if (type === 'percent') return Math.round(lineas * Math.min(value, 100) / 100);
    if (type === 'fijo') return Math.min(Math.round(value), lineas);
    return 0;
  },

  /** Umbral de envío gratis (editable desde Admin > Promociones) */
  getFreeShippingThreshold() {
    const cfg = (typeof PromoEngine !== 'undefined' && PromoEngine.config) ? PromoEngine.config : null;
    const v = cfg ? cfg.envioGratisUmbralARS : CONFIG?.promos?.envioGratisUmbralARS;
    return Math.max(0, Number(v) || 0);
  },

  /** Envío seleccionado (objeto de CONFIG.envios) o null */
  getShippingOption() {
    if (!this.shippingId) return null;
    return (CONFIG.envios || []).find(e => e.id === this.shippingId && e.activo !== false) || null;
  },

  /** ¿El pedido alcanza el envío gratis (por monto o por cupón)? */
  hasFreeShipping() {
    const type = this.promoData ? (this.promoData.type || this.promoData.tipo) : null;
    if (type === 'shipping' && this.getCouponDiscount() === 0 && this.promoCode &&
        (typeof PromoEngine === 'undefined' || !PromoEngine.validarCupon || PromoEngine.validarCupon(this.promoCode))) return true;
    const umbral = this.getFreeShippingThreshold();
    if (umbral <= 0) return false;
    const base = this.getLineasSubtotalARS() - this.calcAutoDiscount() - this.getCouponDiscount();
    return base >= umbral;
  },

  /**
   * Costo de envío, recalculado siempre desde la opción elegida.
   * Aplica el envío gratis por monto (antes se mostraba "¡Tenés envío gratis!"
   * pero el costo se seguía cobrando).
   */
  getShippingCost() {
    const envio = this.getShippingOption();
    if (!envio) return 0;
    if (this.hasFreeShipping()) return 0;
    return Number(envio.precio) || 0;
  },

  /**
   * Obtiene el monto total de descuento (cupón + promos automáticas)
   */
  getDiscountAmount() {
    return this.getCouponDiscount() + this.calcAutoDiscount();
  },

  /**
   * Establece el envío seleccionado (el costo se calcula solo)
   */
  setShipping(shippingId) {
    this.shippingId = shippingId || null;
    this.save();
  },

  /**
   * Aplica un código promocional
   */
  applyPromo(code, promo) {
    this.promoCode = code;
    this.promoData = { tipo: promo.type || promo.tipo, valor: promo.value != null ? promo.value : promo.valor, desc: promo.desc || '' };
    this.save();
  },

  /**
   * Remueve el código promocional
   */
  removePromo() {
    this.promoCode = null;
    this.promoData = null;
    this.discountAmount = 0;
    this.save();
  },

  /**
   * Obtiene el total en USD
   */
  getTotalUSD() {
    return this.items.reduce((sum, i) => sum + (i.precioUSD * i.cantidad), 0);
  },

  /**
   * Limpia el carrito
   */
  clear() {
    this.items = [];
    this.shippingId = null;
    this.shippingCost = 0;
    this.discountAmount = 0;
    this.promoCode = null;
    this.promoData = null;
    this._autoLines = [];
    this.save();
  },

  /**
   * Genera el texto para WhatsApp (completo con variantes)
   */
  /**
   * Detecta si el carrito contiene al menos un producto VIP del Club Prince
   * @returns {boolean}
   */
  _hasClubPrinceItem() {
    return this.items.some(i => {
      const prod = (typeof SheetsService !== 'undefined' && SheetsService.obtenerProducto) ? SheetsService.obtenerProducto(i.id) : null;
      const catMatch = (prod?.categoria === 'club-prince') || (i.categoria === 'club-prince') || (i.isClubPrince === true) || (prod?.isClubPrince === true);
      const tagMatch = Array.isArray(prod?.tags) && prod.tags.some(t => String(t).toLowerCase().includes('club'));
      return catMatch || tagMatch;
    });
  },

  /**
   * Arma el texto del pedido para WhatsApp.
   * @param {object|null} envio      opción de CONFIG.envios
   * @param {object|null} datos      datos del formulario de checkout
   * @param {string} [pedidoId]      número de pedido (ej: PL-250925-4821)
   */
  generarMensajeWhatsApp(envio, datos, pedidoId) {
    const f = (n) => SheetsService.formatPrecioARS(n);
    const lineas = this.items.map(i => {
      const v = i._variant ? ` (${[i._variant.talle && 'Talle ' + i._variant.talle, i._variant.color].filter(Boolean).join(' · ')})` : '';
      return `• ${i.nombre}${v} x${i.cantidad} — ${f(i.precioARS * i.cantidad)}`;
    });

    const subtotal = this.getLineasSubtotalARS();
    const cupon = this.getCouponDiscount();
    const autoLines = (this.calcAutoDiscount(), this.getAutoDiscountLines());
    const envioCosto = this.getShippingCost();
    const total = this.getTotalARS();

    const res = [`Subtotal: ${f(subtotal)}`];
    if (cupon > 0) res.push(`Descuento${this.promoCode ? ' (' + this.promoCode + ')' : ''}: -${f(cupon)}`);
    autoLines.forEach(l => res.push(`${l.label}: -${f(l.monto)}`));
    if (envio) {
      res.push(`Envío: ${envio.nombre} — ${envioCosto > 0 ? f(envioCosto) : 'GRATIS'}`);
    } else {
      res.push('Envío: a coordinar');
    }

    const esClub = this._hasClubPrinceItem();
    const tienda = CONFIG.negocio?.nombre || 'PrincessLov';
    const partes = [];
    partes.push(esClub ? 'Yanela del club Prince quiero esto 👑' : `¡Hola ${tienda}! 🛍️ Quiero hacer este pedido:`);
    if (pedidoId) partes.push(`*Pedido #${pedidoId}*`);
    partes.push('', '*Productos*', ...lineas, '', ...res, `*Total: ${f(total)}*`);

    if (datos) {
      partes.push('', `*Forma de pago:* ${datos.medioPago || 'A coordinar'}`);
      partes.push('', '*Mis datos*');
      partes.push(`Nombre: ${datos.nombre || '-'}`);
      if (datos.telefono) partes.push(`Teléfono: ${datos.telefono}`);
      if (datos.email) partes.push(`Email: ${datos.email}`);
      const esRetiro = !!(envio && (envio.retiro || envio.id === 'retiro'));
      if (!esRetiro) {
        const dir = [datos.direccion, datos.localidad, datos.provincia].filter(Boolean).join(', ');
        if (dir) partes.push(`Dirección: ${dir}`);
        if (datos.cp) partes.push(`CP: ${datos.cp}`);
      }
      if (datos.notas) partes.push(`Notas: ${datos.notas}`);
    }
    partes.push('', 'Quedo atenta para coordinar el pago y el envío. ¡Gracias! 💕');
    return partes.join('\n');
  },

  /** URL wa.me al número de la tienda con el texto dado */
  whatsappUrl(texto) {
    const numero = String(CONFIG.negocio?.whatsapp || '').replace(/\D/g, '');
    return `https://wa.me/${numero}?text=${encodeURIComponent(texto)}`;
  },

  /**
   * Abre WhatsApp. Debe llamarse directo desde el click (sin await antes),
   * si no los celulares bloquean la ventana. Si igual se bloquea, navega.
   * @returns {string} la URL usada
   */
  abrirWhatsApp(texto) {
    const url = this.whatsappUrl(texto);
    let win = null;
    try { win = window.open(url, '_blank'); } catch {}
    if (win) {
      try { win.opener = null; } catch {}
    } else {
      window.location.href = url;
    }
    return url;
  },

  /**
   * Abre WhatsApp con el mensaje del pedido
   */
  enviarWhatsApp(envioSeleccionado, datosCliente, pedidoId) {
    return this.abrirWhatsApp(this.generarMensajeWhatsApp(envioSeleccionado, datosCliente, pedidoId));
  },

  /**
   * Genera mensaje simplificado para un solo producto (quick WhatsApp)
   */
  generarMensajeProducto(producto, cantidad = 1, variant = null) {
    const isClub = (producto.categoria === 'club-prince' || producto.isClubPrince || (Array.isArray(producto.tags) && producto.tags.some(t => String(t).toLowerCase().includes('club'))));
    const precioARS = (typeof PromoEngine !== 'undefined' && PromoEngine.precioVistaARS) ? PromoEngine.precioVistaARS(producto) : SheetsService.calcularPrecioARS(producto.precioUSD, producto);
    const variantText = variant ? `\n${variant.color} / ${variant.talle}` : '';
    if (isClub) {
      return `Yanela del club Prince quiero esto\n\n• ${producto.nombre}${variantText} x${cantidad} - ${SheetsService.formatPrecioARS(precioARS * cantidad)}`;
    }
    const texto = `Hola! Me interesa: ${producto.nombre}${variantText}\nCantidad: ${cantidad}\nPrecio: ${SheetsService.formatPrecioARS(precioARS * cantidad)}`;
    return texto;
  },

  /**
   * Versión tipada del generador de URL de WhatsApp (if/else VIP) — para uso directo / tests
   * @param {Array<{id:string,categoria?:string,isClubPrince?:boolean}>} items
   * @param {string} detallePedido - string ya formado con items y totales
   * @returns {string} url wa.me con encodeURIComponent
   */
  buildWhatsAppUrl(items, detallePedido) {
    const hasVip = (items || []).some(it =>
      it.categoria === 'club-prince' || it.categoria === 'Club Prince' || it.isClubPrince === true ||
      (Array.isArray(it.tags) && it.tags.some(t => String(t).toLowerCase().includes('club')))
    );
    const header = hasVip ? 'Yanela del club Prince quiero esto' : `Hola! Quiero hacer un pedido en ${CONFIG.negocio?.nombre || 'PrincessLov'} 🛍️`;
    const mensaje = `${header}\n\n${detallePedido}`;
    return this.whatsappUrl(mensaje);
  },
};