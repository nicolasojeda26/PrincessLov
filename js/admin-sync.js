/* ============================================
   ADMIN SYNC — Conecta el panel con Google Sheets
   --------------------------------------------
   Antes el admin guardaba todo en el localStorage de TU navegador:
   productos, pedidos y textos nunca llegaban a la tienda publicada.

   Ahora, con la planilla conectada y el token de administración cargado:
   - Al abrir el panel se traen productos, pedidos, gastos, leads del
     Club Prince y la config publicada.
   - Cada alta/edición/baja se publica en la planilla al instante, y la
     tienda la lee de ahí para todas las clientas.
   - Lo que existía solo en este navegador se sube en la primera sincronización.
   ============================================ */

const AdminSync = {
  TOKEN_KEY: 'pl_admin_token',
  ultimaSync: null,
  errores: 0,

  token() {
    try { return localStorage.getItem(this.TOKEN_KEY) || ''; } catch { return ''; }
  },

  habilitado() {
    return !!(SheetsService.appsScriptUrl && this.token());
  },

  /* ---------- Estado visible ---------- */
  badge(estado, texto) {
    const el = document.getElementById('admin-sync-badge');
    if (!el) return;
    el.className = 'sync-badge sync-badge--' + estado;
    el.textContent = texto;
  },

  pintarEstado() {
    if (!SheetsService.appsScriptUrl) {
      this.badge('local', '⚠️ Sin planilla: solo local');
      el_title('Configurá sheets.appsScriptUrl en data/config.js para publicar cambios en la tienda.');
    } else if (!this.token()) {
      this.badge('local', '🔐 Falta el token');
      el_title('Cargá el token en Configuración para leer pedidos y publicar cambios.');
    } else if (this.errores) {
      this.badge('error', '❌ Error de sincronización');
    } else if (this.ultimaSync) {
      const hora = this.ultimaSync.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' });
      this.badge('ok', `✅ Sincronizado ${hora}`);
    }
    function el_title(t) { const el = document.getElementById('admin-sync-badge'); if (el) el.title = t; }
  },

  /** Aviso en las secciones cuando los cambios no llegan a la tienda */
  avisoLocal() {
    document.querySelectorAll('.local-warning').forEach(n => n.remove());
    if (this.habilitado()) return;
    ['section-products', 'section-orders', 'section-home', 'section-shipping', 'section-club', 'section-categories'].forEach(id => {
      const sec = document.getElementById(id);
      if (!sec) return;
      const div = document.createElement('div');
      div.className = 'local-warning';
      div.innerHTML = !SheetsService.appsScriptUrl
        ? '⚠️ <strong>La planilla no está conectada.</strong> Lo que cargues acá queda solo en esta computadora y <strong>no aparece en la tienda</strong>. Para conectarla seguí los pasos de SEGURIDAD.md (o pedíselo a quien administra la web).'
        : '🔐 <strong>Falta el token de administración.</strong> Cargalo en Configuración para ver los pedidos que llegan de la web y publicar tus cambios en la tienda.';
      sec.prepend(div);
    });
  },

  /* ---------- Token ---------- */
  guardarToken() {
    const input = document.getElementById('set-admin-token');
    const val = (input?.value || '').trim();
    try {
      if (val) localStorage.setItem(this.TOKEN_KEY, val);
      else localStorage.removeItem(this.TOKEN_KEY);
    } catch {}
    if (input) input.value = '';
    if (!val) {
      AdminApp.toast('Token borrado de este navegador');
      this.ultimaSync = null;
      this.pintarEstado();
      this.avisoLocal();
      return;
    }
    if (val.length < 16) { AdminApp.toast('El token es muy corto (mínimo 16 caracteres)', 'error'); return; }
    this.sincronizar(true);
  },

  /* ---------- Llamadas ---------- */
  async post(action, data) {
    if (!this.habilitado()) return null;
    const res = await SheetsService.postToAppsScript(action, data);
    if (res && res.error) throw new Error(res.error);
    return res;
  },

  /** Publica un cambio sin bloquear la UI; avisa si falla */
  publicar(action, data, etiqueta) {
    if (!this.habilitado()) return;
    this.post(action, data)
      .then(() => { this.errores = 0; this.ultimaSync = new Date(); this.pintarEstado(); })
      .catch(err => {
        this.errores++;
        this.pintarEstado();
        const msg = /autorizado/i.test(err.message) ? 'token inválido' : err.message;
        AdminApp.toast(`⚠️ No se publicó ${etiqueta || 'el cambio'} en la tienda (${msg})`, 'error');
      });
  },

  /** Manda a la planilla un movimiento de stock y deja el producto local igual al de la planilla */
  publicarAjusteStock(d) {
    if (!d || !d.productId || !d.delta || !this.habilitado()) return;
    this.post('adjust_stock', { productoId: d.productId, variante: d.variante || '', delta: d.delta })
      .then((res) => {
        if (res && res.error) throw new Error(res.error);
        this.errores = 0; this.ultimaSync = new Date(); this.pintarEstado();
        if (!res || typeof res.stock !== 'number') return;
        const prods = AdminData.getProducts();
        const p = prods.find(x => String(x.id) === String(d.productId));
        if (!p) return;
        p.stock = res.stock;
        if (Array.isArray(res.variantes)) p.variantes = res.variantes;
        AdminData.saveProducts(prods);
        if (AdminApp.currentSection === 'products' || AdminApp.currentSection === 'dashboard') {
          try { AdminApp.renderSection(AdminApp.currentSection); } catch {}
        }
      })
      .catch(err => {
        this.errores++;
        this.pintarEstado();
        const nombre = d.producto?.nombre ? `"${d.producto.nombre}"` : 'el producto';
        // Apps Script viejo (sin adjust_stock): se publica el producto entero como antes
        if (/no válida/i.test(err.message) && d.producto) {
          this.publicar('upsert_product', { product: SheetsService.serializeForSheets(d.producto) }, nombre);
          return;
        }
        AdminApp.toast(`⚠️ No se actualizó el stock de ${nombre} en la tienda (${err.message})`, 'error');
      });
  },

  async leer(sheet) {
    const res = await this.post('admin_read', { sheet });
    if (res && !Array.isArray(res) && res.error) throw new Error(res.error);
    return Array.isArray(res) ? res : [];
  },

  /* ---------- Mapeos planilla <-> admin ---------- */
  productoDesdeHoja(row) {
    const [p] = SheetsService.mapAppsScriptProducts([{ ...row, Activo: true }]);
    p.activo = row.Activo === true || row.Activo === 'TRUE' || row.Activo === 'true';
    p.id = String(row.ID || p.id);
    return p;
  },

  pedidoDesdeHoja(r) {
    let items = [];
    try { items = typeof r.Items === 'string' ? JSON.parse(r.Items || '[]') : (r.Items || []); } catch {}
    return {
      id: String(r.ID),
      fecha: r.Fecha ? new Date(r.Fecha).toISOString() : new Date().toISOString(),
      cliente: String(r.Cliente || ''),
      telefono: String(r.Telefono || ''),
      email: String(r.Email || ''),
      direccion: String(r.Direccion || ''),
      localidad: String(r.Localidad || ''),
      provincia: String(r.Provincia || ''),
      estado: String(r.Estado || 'pendiente'),
      medioPago: String(r.MedioPago || ''),
      metodoEnvio: String(r.MetodoEnvio || ''),
      total: Number(r.Total) || 0,
      costoTotal: Number(r.CostoTotal) || 0,
      notas: String(r.Notas || ''),
      items: Array.isArray(items) ? items : [],
      origen: String(r.Origen || ''),
      stockDescontado: String(r.StockDescontado || '').toLowerCase() === 'si',
    };
  },

  pedidoParaHoja(o) {
    return {
      Cliente: o.cliente || '', Telefono: o.telefono || '', Email: o.email || '',
      Direccion: o.direccion || '', Localidad: o.localidad || '', Provincia: o.provincia || '',
      Estado: o.estado || 'pendiente', MedioPago: o.medioPago || '', MetodoEnvio: o.metodoEnvio || '',
      Total: Number(o.total) || 0, CostoTotal: Number(o.costoTotal) || 0, Notas: o.notas || '',
      Items: JSON.stringify(o.items || []), StockDescontado: o.stockDescontado ? 'si' : 'no',
    };
  },

  gastoDesdeHoja(r) {
    return { id: String(r.ID), fecha: r.Fecha ? new Date(r.Fecha).toISOString() : '', concepto: String(r.Concepto || ''), monto: Number(r.Monto) || 0, categoria: String(r.Categoria || ''), notas: String(r.Notas || '') };
  },

  /* ---------- Sincronización completa ---------- */
  async sincronizar(manual = false) {
    this.pintarEstado();
    this.avisoLocal();
    if (!this.habilitado()) {
      if (manual) AdminApp.toast(SheetsService.appsScriptUrl ? 'Cargá el token en Configuración' : 'La planilla no está configurada', 'error');
      return;
    }
    this.badge('local', '⏳ Sincronizando…');
    try {
      const [prods, pedidos, gastos, leads, config] = await Promise.all([
        this.leer('productos'), this.leer('pedidos'), this.leer('gastos'),
        this.leer('clubprince'), this.leer('config'),
      ]);

      // Productos: la planilla manda; lo que solo existía acá se sube
      const remotos = prods.filter(r => r.ID).map(r => this.productoDesdeHoja(r));
      const idsRemotos = new Set(remotos.map(p => p.id));
      const soloLocales = AdminData.getProducts().filter(p => !idsRemotos.has(String(p.id)));
      for (const p of soloLocales) {
        await this.post('upsert_product', { product: SheetsService.serializeForSheets(p) });
      }
      AdminData.saveProducts([...remotos, ...soloLocales]);

      // Pedidos
      const pedRemotos = pedidos.filter(r => r.ID).map(r => this.pedidoDesdeHoja(r));
      const idsPed = new Set(pedRemotos.map(o => o.id));
      const pedLocales = AdminData.getOrders().filter(o => !idsPed.has(String(o.id)));
      for (const o of pedLocales) {
        await this.post('create_order', { order: { ...o, origen: 'admin' } });
        await this.post('update_order', { id: o.id, updates: this.pedidoParaHoja(o) });
      }
      AdminData.saveOrders([...pedRemotos, ...pedLocales]);

      // Gastos
      const gasRemotos = gastos.filter(r => r.ID).map(r => this.gastoDesdeHoja(r));
      const idsGas = new Set(gasRemotos.map(g => g.id));
      const gasLocales = AdminData.getExpenses().filter(g => !idsGas.has(String(g.id)));
      for (const g of gasLocales) await this.post('create_expense', { expense: g });
      AdminData.saveExpenses([...gasRemotos, ...gasLocales]);

      // Leads del Club Prince (solo lectura)
      try {
        localStorage.setItem('pl_clubprince_leads', JSON.stringify(leads.map(l => ({
          id: String(l.ID), fecha: l.Fecha, nombre: String(l.Nombre || ''), telefono: String(l.Telefono || ''),
          ciudad: String(l.Ciudad || ''), plan: String(l.Plan || ''), estado: String(l.Estado || ''),
        }))));
      } catch {}

      // Config publicada: el admin edita lo mismo que ven las clientas
      const cfg = {};
      config.forEach(r => { if (r.Clave) cfg[r.Clave] = r.Valor; });
      const parse = (v) => { if (typeof v !== 'string') return v; try { return JSON.parse(v); } catch { return null; } };
      this._silencio = true;
      try {
        const cats = parse(cfg.categorias);
        if (Array.isArray(cats) && cats.length) AdminData.saveCategorias(cats);
        const prods = AdminData.getProducts();
        let movidos = false;
        prods.forEach(p => {
          const id = SheetsService.resolverCategoria(p.categoriaOriginal || p.categoria);
          if (id && id !== p.categoria) { p.categoria = id; movidos = true; }
        });
        if (movidos) AdminData.saveProducts(prods);
        const cont = parse(cfg.contenido);
        if (cont && typeof cont === 'object') AdminData.saveContenido(cont);
        const promos = parse(cfg.promos);
        if (promos && typeof promos === 'object') localStorage.setItem(AdminData.KEYS.promos, JSON.stringify(promos));
        const envios = parse(cfg.envios);
        if (Array.isArray(envios) && envios.length) { localStorage.setItem('pl_admin_envios', JSON.stringify(envios)); CONFIG.envios = envios; }
      } finally { this._silencio = false; }

      this.errores = 0;
      this.ultimaSync = new Date();
      this.pintarEstado();
      this.avisoLocal();
      const editando = (AdminApp.currentSection === 'home' && typeof AdminHome !== 'undefined' && AdminHome.dirty)
        || (AdminApp.currentSection === 'promos' && typeof AdminPromos !== 'undefined' && AdminPromos.dirty);
      if (!editando) AdminApp.renderSection(AdminApp.currentSection);
      AdminApp.actualizarBadges?.();
      const subidos = soloLocales.length + pedLocales.length + gasLocales.length;
      if (manual || subidos) AdminApp.toast(`✅ Sincronizado con Google Sheets${subidos ? ` (${subidos} registros locales subidos)` : ''}`);
    } catch (err) {
      this.errores++;
      this.pintarEstado();
      const msg = /autorizado/i.test(err.message) ? 'el token no coincide con ADMIN_TOKEN del Apps Script' : err.message;
      AdminApp.toast('❌ No se pudo sincronizar: ' + msg, 'error');
    }
  },

  /* ---------- Enganches sobre AdminData ---------- */
  engancharAdminData() {
    const self = this;
    const wrap = (nombre, despues) => {
      const orig = AdminData[nombre].bind(AdminData);
      AdminData[nombre] = function (...args) {
        const antes = (nombre === 'deleteOrder' || nombre === 'deleteExpense' || nombre === 'deleteProduct') ? args[0] : null;
        const res = orig(...args);
        try { if (!self._silencio) despues(res, args, antes); } catch (e) { console.warn('[AdminSync]', e); }
        try { AdminApp.actualizarBadges?.(); } catch {}
        return res;
      };
    };
    const prod = (p) => p && self.publicar('upsert_product', { product: SheetsService.serializeForSheets(p) }, `"${p.nombre}"`);

    wrap('addProduct', (p) => prod(p));
    wrap('updateProduct', (p) => prod(p));
    wrap('deleteProduct', (_r, _a, id) => self.publicar('delete_product', { id }, 'la baja del producto'));
    wrap('importProducts', () => {
      const prods = AdminData.getProducts();
      (async () => {
        for (const p of prods) {
          try { await self.post('upsert_product', { product: SheetsService.serializeForSheets(p) }); } catch (e) { self.errores++; }
        }
        self.pintarEstado();
        if (self.habilitado()) AdminApp.toast(self.errores ? '⚠️ Algunos productos no se publicaron' : '✅ Importación publicada en la tienda');
      })();
    });
    wrap('addOrder', (o) => {
      if (!o) return;
      self.post('create_order', { order: { ...o, origen: 'admin' } })
        .then(() => self.publicar('update_order', { id: o.id, updates: self.pedidoParaHoja(o) }, 'el pedido'))
        .catch(e => AdminApp.toast('⚠️ El pedido no se guardó en la planilla: ' + e.message, 'error'));
    });
    wrap('updateOrder', (o) => o && self.publicar('update_order', { id: o.id, updates: self.pedidoParaHoja(o) }, 'el pedido'));
    wrap('deleteOrder', (_r, _a, id) => self.publicar('delete_order', { id }, 'la baja del pedido'));
    wrap('addExpense', (g) => g && self.publicar('create_expense', { expense: g }, 'el gasto'));
    wrap('deleteExpense', (_r, _a, id) => self.publicar('delete_expense', { id }, 'la baja del gasto'));
    wrap('saveCategorias', () => self.publicar('save_config', { config: { categorias: JSON.stringify(AdminData.getEffectiveCategorias()) } }, 'las categorías'));
    wrap('resetCategorias', () => self.publicar('save_config', { config: { categorias: '' } }, 'las categorías'));
    wrap('saveContenido', () => self.publicar('save_config', { config: { contenido: JSON.stringify(AdminData.getContenido() || {}) } }, 'los textos del home'));
    wrap('resetContenido', () => self.publicar('save_config', { config: { contenido: '' } }, 'los textos del home'));

    // Cambios de stock por pedidos (cancelar/reactivar/editar): se manda solo la
    // diferencia ("restá 1 del talle M"), así no se pisa lo que la web ya descontó.
    window.addEventListener('admin:stock', (e) => { if (!self._silencio) self.publicarAjusteStock(e.detail); });
  },

  init() {
    this.engancharAdminData();
    this.pintarEstado();
    this.avisoLocal();
    if (this.habilitado()) this.sincronizar(false);
    // Pedidos nuevos sin recargar: al volver a la pestaña/app y cada 2 minutos
    // (nunca con una ventana de edición abierta, para no pisar lo que se está escribiendo).
    const refrescar = () => {
      if (!this.habilitado() || document.hidden || this._sincronizando) return;
      if (document.querySelector('.modal.open, .modal-overlay.open')) return;
      if (this.ultimaSync && Date.now() - this.ultimaSync.getTime() < 60 * 1000) return;
      this._sincronizando = true;
      this.sincronizar(false).finally(() => { this._sincronizando = false; });
    };
    document.addEventListener('visibilitychange', refrescar);
    setInterval(refrescar, 2 * 60 * 1000);
  },
};

document.addEventListener('DOMContentLoaded', () => {
  // SheetsService.init corre en su propio DOMContentLoaded (antes que este)
  if (!SheetsService.appsScriptUrl) SheetsService.appsScriptUrl = appsScriptConfigurado();
  AdminSync.init();
});
