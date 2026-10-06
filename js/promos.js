/* ============================================
   PROMO ENGINE - Motor de Promociones (Fase 2)
   Combos, 2x1, códigos de descuento, flash sales
   con cuenta regresiva y preventas.

   Fuente de datos (en orden de prioridad):
   1) Google Sheets remoto (Apps Script, clave `promos`)
   2) Overrides del panel admin (localStorage `pl_admin_promos`)
   3) Defaults de `CONFIG.promos` (data/config.js)
   ============================================ */

const PromoEngine = {
  config: null,
  _remote: null,
  _ticker: null,

  endpoint() {
    const url = (typeof CONFIG !== 'undefined' && CONFIG.sheets?.appsScriptUrl) ? CONFIG.sheets.appsScriptUrl : null;
    if (!url || url.includes('TU_SCRIPT_ID')) return null;
    return url;
  },

  defaults() {
    return (typeof CONFIG !== 'undefined' && CONFIG.promos) || {};
  },

  localRaw() {
    try {
      return JSON.parse(localStorage.getItem('pl_admin_promos') || 'null');
    } catch { return null; }
  },

  /** Config efectiva (defaults + remoto + local con prioridad local) */
  _effective() {
    const base = (typeof CONFIG !== 'undefined' && CONFIG.promos) || {};
    const remote = this._remote || {};
    const local = this.localRaw() || {};
    const src = { ...base, ...remote, ...local };
    // Conservar el umbral de envío gratis si viniera del bloque viejo
    if (base.envioGratisUmbralARS != null && src.envioGratisUmbralARS == null) src.envioGratisUmbralARS = base.envioGratisUmbralARS;
    return this.normalize(src);
  },

  normalize(cfg) {
    const arr = (a) => Array.isArray(a) ? a : [];
    return {
      envioGratisUmbralARS: (cfg?.envioGratisUmbralARS === '' || cfg?.envioGratisUmbralARS == null || isNaN(Number(cfg.envioGratisUmbralARS))) ? 150000 : Math.max(0, Number(cfg.envioGratisUmbralARS)),
      cupones: arr(cfg?.cupones).map(c => ({
        id: String(c.id || 'cup_' + String(c.codigo || '').toLowerCase()),
        codigo: String(c.codigo || '').toUpperCase().trim(),
        tipo: ['percent', 'fijo', 'shipping'].includes(c.tipo) ? c.tipo : 'percent',
        // Igual que el servidor: nunca negativo y como mucho 100%
        valor: c.tipo === 'fijo' ? Math.max(0, Number(c.valor) || 0) : Math.min(100, Math.max(0, Number(c.valor) || 0)),
        usosMax: c.usosMax == null ? 1000 : Number(c.usosMax),
        activo: c.activo !== false,
        desc: c.desc || '',
      })),
      flashSales: arr(cfg?.flashSales).map(f => ({
        id: String(f.id || 'flash_' + Date.now().toString(36)),
        nombre: f.nombre || 'Flash Sale',
        descuento: Math.max(0, Math.min(90, Number(f.descuento) || 0)),
        desde: f.desde || null,
        hasta: f.hasta || null,
        categorias: arr(f.categorias),
        activo: f.activo !== false,
      })),
      combos: arr(cfg?.combos).map(c => ({
        id: String(c.id || 'combo_' + Date.now().toString(36)),
        nombre: c.nombre || 'Combo',
        descripcion: c.descripcion || '',
        productoIds: arr(c.productoIds).map(String),
        precioUSD: Number(c.precioUSD) || 0,
        activo: c.activo !== false,
      })),
      dosPorUno: arr(cfg?.dosPorUno).map(d => ({
        id: String(d.id || 'duo_' + Date.now().toString(36)),
        nombre: d.nombre || '2x1',
        categorias: arr(d.categorias),
        activo: d.activo !== false,
      })),
      preventas: arr(cfg?.preventas).map(p => ({
        id: String(p.id || 'prev_' + Date.now().toString(36)),
        productoId: String(p.productoId || ''),
        precioUSD: Number(p.precioUSD) || 0,
        fechaLanzamiento: p.fechaLanzamiento || null,
        activo: p.activo !== false,
      })),
    };
  },

  /** Refresca this.config y avisa a la tienda */
  apply() {
    this.config = this._effective();
    return this.config;
  },

  init() {
    this.apply();
    window.addEventListener('promos:updated', () => {
      this.apply();
      if (typeof App !== 'undefined' && App.renderProductos) {
        App.renderProductos(App.productosFiltrados || SheetsService.productos);
      }
      if (typeof AdminPromos !== 'undefined' && AdminPromos.currentSection) {
        AdminPromos.render();
      }
    });
    this.fetchRemote();
  },

  /** 1) Remoto (Apps Script, clave `promos`) — no bloquea */
  async fetchRemote() {
    const url = this.endpoint();
    if (!url || typeof fetch === 'undefined') return;
    try {
      const u = new URL(url);
      u.searchParams.set('action', 'config');
      const res = await fetch(u, { method: 'GET', headers: { 'Accept': 'application/json' } });
      if (!res.ok) return;
      const data = await res.json();
      const raw = data && data.promos;
      if (!raw) return;
      let parsed = raw;
      if (typeof raw === 'string') { try { parsed = JSON.parse(raw); } catch { return; } }
      if (!parsed || typeof parsed !== 'object') return;
      this._remote = parsed;
      this.apply();
      if (typeof App !== 'undefined' && App.renderProductos) App.renderProductos(App.productosFiltrados || SheetsService.productos);
    } catch (e) {
      console.warn('[Promos] remoto falló, uso local:', e.message);
    }
  },

  /* ---------- SELECCIÓN POR VENTANA DE TIEMPO ---------- */
  ahora() { return Date.now(); },

  _enVentana(f) {
    if (!f.desde && !f.hasta) return true;
    const now = this.ahora();
    if (f.desde && now < new Date(f.desde).getTime()) return false;
    if (f.hasta && now > new Date(f.hasta).getTime()) return false;
    return true;
  },

  flashActiva() {
    if (!this.config) this.apply();
    return this.config.flashSales.filter(f => f.activo && f.descuento > 0 && this._enVentana(f));
  },

  flashDeProducto(producto) {
    if (!producto) return null;
    const cat = producto.categoria || String(producto.categoriaOriginal || '').toLowerCase().replace(/\s+/g, '-');
    return this.flashActiva().find(f => !f.categorias.length || f.categorias.includes(cat)) || null;
  },

  preventaDeProducto(producto) {
    if (!producto || !this.config) return null;
    const p = this.config.preventas.find(x => x.activo && String(x.productoId) === String(producto.id));
    if (!p) return null;
    if (p.fechaLanzamiento && this.ahora() >= new Date(p.fechaLanzamiento).getTime()) return null;
    return p;
  },

  combosDeProducto(producto) {
    if (!producto || !this.config) return [];
    return this.config.combos.filter(c => c.activo && c.productoIds && c.productoIds.includes(String(producto.id)));
  },

  aplicaDosPorUno(producto) {
    if (!producto || !this.config) return false;
    const cat = producto.categoria;
    return this.config.dosPorUno.some(d => d.activo && (!d.categorias.length || d.categorias.includes(cat)));
  },

  /* ---------- PRECIO EFECTIVO (preventa / flash / oferta) ---------- */
  precioVistaUSD(producto) {
    if (!producto) return 0;
    let usd = Number(producto.precioUSD) || 0;
    const flash = this.flashDeProducto(producto);
    if (flash) usd = usd * (1 - flash.descuento / 100);
    const prev = this.preventaDeProducto(producto);
    if (prev && prev.precioUSD > 0) usd = prev.precioUSD;
    return usd;
  },

  precioBaseARS(producto) {
    if (typeof SheetsService !== 'undefined' && SheetsService.calcularPrecioARS) {
      return SheetsService.calcularPrecioARS(Number(producto?.precioUSD) || 0, producto);
    }
    const dolar = (typeof SheetsService !== 'undefined' && SheetsService.cotizacionDolar) || 1200;
    return Math.round((Number(producto?.precioUSD) || 0) * dolar * 1.3);
  },

  /** Precio de vista final (promo > oferta fija, se usa el menor) */
  precioVistaARS(producto) {
    const usd = this.precioVistaUSD(producto);
    let base = (typeof SheetsService !== 'undefined' && SheetsService.calcularPrecioARS)
      ? SheetsService.calcularPrecioARS(usd, producto)
      : Math.round(usd * 1200 * 1.3);
    if (producto && producto.precioOferta && Number(producto.precioOferta) > 0 && Number(producto.precioOferta) < base) {
      return Number(producto.precioOferta);
    }
    return base;
  },

  /** Precio que paga el cliente en el carrito (ya incluye flash/preventa) */
  precioCompraARS(producto) {
    return this.precioVistaARS(producto);
  },

  /* ---------- BADGES ---------- */
  badgePara(producto) {
    const out = [];
    const flash = this.flashDeProducto(producto);
    if (flash) out.push({ texto: '⚡ Flash −' + flash.descuento + '%', clase: 'badge--flash', hasta: flash.hasta || '' });
    const prev = this.preventaDeProducto(producto);
    if (prev) out.push({ texto: '🔖 Preventa', clase: 'badge--preventa' });
    if (this.combosDeProducto(producto).length) out.push({ texto: '🎁 Combo', clase: 'badge--combo' });
    if (this.aplicaDosPorUno(producto)) out.push({ texto: '2x1', clase: 'badge--2x1' });
    return out;
  },

  /* ---------- DESCUENTOS AUTOMÁTICOS DEL CARRITO ---------- */
  descuentoDosPorUno(items, byId) {
    if (!this.config) return 0;
    const duos = this.config.dosPorUno.filter(d => d.activo);
    if (!duos.length) return 0;
    const inScope = (items || []).filter(it => {
      const prod = byId ? byId(it.id) : null;
      return duos.some(d => !d.categorias.length || (prod && d.categorias.includes(prod.categoria)));
    });
    if (!inScope.length) return 0;
    const gratis = [];
    inScope.forEach(it => {
      const n = Math.floor((it.cantidad || 1) / 2);
      for (let i = 0; i < n; i++) gratis.push(it.precioARS || 0);
    });
    gratis.sort((a, b) => a - b);
    return Math.round(gratis.reduce((s, v) => s + v, 0));
  },

  descuentoCombos(items, byId) {
    if (!this.config) return 0;
    if (typeof SheetsService === 'undefined' || !SheetsService.calcularPrecioARS) return 0;
    const combos = this.config.combos.filter(c => c.activo && c.productoIds && c.productoIds.length);
    let total = 0;
    combos.forEach(c => {
      const presente = c.productoIds.every(rid => (items || []).some(it => String(it.id) === String(rid) && (it.cantidad || 1) > 0));
      if (!presente) return;
      const miembros = (items || []).filter(it => c.productoIds.includes(String(it.id)));
      const sumaARS = miembros.reduce((s, it) => s + (it.precioARS || 0) * (it.cantidad || 1), 0);
      const precioComboARS = this.precioBaseARSNull(c.precioUSD);
      if (c.precioUSD > 0) {
        if (precioComboARS > 0 && precioComboARS < sumaARS) total += sumaARS - precioComboARS;
      } else {
        total += sumaARS * 0.10; // sin precio definido => 10% off
      }
    });
    return Math.round(total);
  },

  precioBaseARSNull(usd) {
    return (typeof SheetsService !== 'undefined' && SheetsService.calcularPrecioARS)
      ? SheetsService.calcularPrecioARS(usd)
      : Math.round(usd * 1200 * 1.3);
  },

  /** Líneas de descuento automático para mostrar en el carrito */
  descuentosAutomaticos(items, byId) {
    const lines = [];
    if (typeof byId !== 'function') byId = () => null;
    const d2 = this.descuentoDosPorUno(items, byId);
    if (d2 > 0) lines.push({ id: '2x1', label: 'Promo 2x1', monto: d2 });
    const dc = this.descuentoCombos(items, byId);
    if (dc > 0) lines.push({ id: 'combos', label: 'Combos', monto: dc });
    return lines;
  },

  totalDescuentosAutomaticos(items, byId) {
    return this.descuentosAutomaticos(items, byId).reduce((s, l) => s + l.monto, 0);
  },

  /* ---------- CUPONES ---------- */
  validarCupon(code) {
    if (!this.config) this.apply();
    const cod = String(code || '').trim().toUpperCase();
    if (!cod) return null;
    const cpn = this.config.cupones.find(x => x.activo && x.usosMax > 0 && String(x.codigo).toUpperCase() === cod);
    if (!cpn) return null;
    return { id: cpn.id, tipo: cpn.tipo, valor: cpn.valor, usosMax: cpn.usosMax, desc: cpn.desc || cpn.codigo };
  },

  /* ---------- CUENTA REGRESIVA ---------- */
  restanteHumano(hasta) {
    if (!hasta) return '';
    const diff = Math.max(0, new Date(hasta).getTime() - this.ahora());
    const d = Math.floor(diff / 86400000);
    const h = Math.floor((diff % 86400000) / 3600000);
    const m = Math.floor((diff % 3600000) / 60000);
    const s = Math.floor((diff % 60000) / 1000);
    if (d > 0) return `${d}d ${h}h ${m}m`;
    if (h > 0) return `${h}h ${m}m`;
    return `${m}m ${s}s`;
  },

  iniciarTicker() {
    if (this._ticker || typeof document === 'undefined') return;
    this._ticker = setInterval(() => {
      const els = document.querySelectorAll('[data-countdown]');
      if (!els.length) return;
      els.forEach(el => {
        const hasta = el.getAttribute('data-countdown');
        if (hasta) el.textContent = '⏳ ' + this.restanteHumano(hasta);
      });
    }, 1000);
  },

  esc(s) { return (typeof escHtml === 'function') ? escHtml(s) : String(s ?? ''); }
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { PromoEngine };
}

document.addEventListener('DOMContentLoaded', () => PromoEngine.init());