/* ============================================
   ADMIN SETTINGS - Configuración con Sincronía en Vivo
   ============================================ */

const AdminSettings = {
  render() {
    const settings = AdminData.getSettings();
    const set = (id, val) => {
      const el = document.getElementById(id);
      if (el) el.value = val == null ? '' : val;
    };

    set('set-nombre', settings.nombre || 'PrincessLov');
    // Si todavía no se guardó nada, se muestra lo que la tienda está usando hoy
    // (antes los campos aparecían vacíos aunque la tienda tuviera WhatsApp e Instagram).
    const neg = (typeof CONFIG !== 'undefined' && CONFIG.negocio) || {};
    set('set-whatsapp', settings.whatsapp || neg.whatsapp || '');
    set('set-email', settings.email || neg.email || '');
    set('set-instagram', settings.instagram || neg.instagram || '');
    // El margen se guarda como multiplicador (1.30) pero se muestra como % (30)
    set('set-margen', this.margenAPct(settings.margen || CONFIG?.cotizacion?.margenGanancia));
    set('set-redondeo', String(this.redondeoActual(settings)));
    set('set-impuesto-ventas', settings.impuestoVentasPct || '');

    // Gastos fijos
    const gf = settings.gastosFijos || {};
    set('set-gasto-alquiler', gf.alquiler || '');
    set('set-gasto-servicios', gf.servicios || '');
    set('set-gasto-internet', gf.internet || '');
    set('set-gasto-transporte', gf.transporte || '');
    set('set-gasto-otros', gf.otros || '');

    // Costos variables (en pesos)
    const cv = this.costosVariablesEnPesos(settings.costosVariables);
    set('set-cv-envoltorio', cv.envoltorio || '');
    set('set-cv-etiqueta', cv.etiqueta || '');
    set('set-cv-comision', cv.comisionMP || '');

    const box = document.querySelector('#section-settings details.tech-box');
    if (box && typeof AdminSync !== 'undefined') box.open = !AdminSync.habilitado();
    const tok = document.getElementById('set-admin-token');
    if (tok) tok.placeholder = (typeof AdminSync !== 'undefined' && AdminSync.token()) ? '•••••• token cargado (pegá otro para cambiarlo)' : 'Pegá el token (32+ caracteres)';

    // Traer la config completa (incluye datos privados) solo con token
    if (typeof AdminSync !== 'undefined' && AdminSync.habilitado()) {
      AdminSync.leer('config').then(rows => {
        const remote = {};
        rows.forEach(r => { if (r.Clave) remote[r.Clave] = r.Valor; });
        if (remote.whatsapp || remote.nombre) {
          AdminData.saveSettings(this.sanitize(remote));
          this.load();
          ['set-nombre', 'set-whatsapp', 'set-email', 'set-instagram', 'set-margen'].forEach(id => {
            const el = document.getElementById(id);
            const key = { 'set-nombre': 'nombre', 'set-whatsapp': 'whatsapp', 'set-email': 'email', 'set-instagram': 'instagram', 'set-margen': 'margen' }[id];
            let val = AdminData.getSettings()[key];
            if (key === 'margen') val = this.margenAPct(val);
            if (el && document.activeElement !== el && val != null && val !== '') el.value = val;
          });
          const red = document.getElementById('set-redondeo');
          if (red && document.activeElement !== red) red.value = String(this.redondeoActual(AdminData.getSettings()));
        }
      }).catch(() => {});
    }
  },

  /**
   * Carga settings a nivel global (CONFIG y ADMIN_CONFIG).
   * LO NECESITA AdminApp.init() — no eliminar.
   */
  margenAPct(m) {
    const n = Number(m);
    return n > 0 ? Math.round((n - 1) * 100) : '';
  },

  /**
   * Envoltorio y etiqueta en pesos. Hasta nov/2026 se cargaban en USD (ej. 0,50):
   * los guardados sin moneda se pasan a pesos con el dólar fijo de conversión.
   */
  costosVariablesEnPesos(cv) {
    const c = { ...(cv && typeof cv === 'object' ? cv : {}) };
    if (c.moneda !== 'ARS') {
      const dolar = (typeof SheetsService !== 'undefined' && SheetsService.dolarConversion) ? SheetsService.dolarConversion() : 1570;
      ['envoltorio', 'etiqueta'].forEach(k => { if (Number(c[k]) > 0) c[k] = Math.round(Number(c[k]) * dolar); });
      c.moneda = 'ARS';
    }
    return c;
  },

  redondeoActual(settings) {
    const r = settings?.redondeo;
    if (r !== undefined && r !== null && r !== '' && Number(r) >= 0) return Number(r);
    return Number(CONFIG?.cotizacion?.redondeo) || 0;
  },

  load() {
    const settings = AdminData.getSettings();
    if (settings.redondeo !== undefined && settings.redondeo !== '' && Number(settings.redondeo) >= 0) CONFIG.cotizacion.redondeo = Number(settings.redondeo);

    if (settings.margen) CONFIG.cotizacion.margenGanancia = Number(settings.margen) || CONFIG.cotizacion.margenGanancia;
    if (settings.whatsapp) CONFIG.negocio.whatsapp = settings.whatsapp;
    if (settings.nombre) CONFIG.negocio.nombre = settings.nombre;
    if (settings.email) CONFIG.negocio.email = settings.email;
    if (settings.instagram) CONFIG.negocio.instagram = settings.instagram;

    // Gastos fijos
    if (settings.gastosFijos) Object.assign(ADMIN_CONFIG.gastosFijos, settings.gastosFijos);
    // Costos variables (en pesos)
    if (settings.costosVariables) Object.assign(ADMIN_CONFIG.costosVariables, this.costosVariablesEnPesos(settings.costosVariables));
  },

  sanitize(settings) {
    // Normaliza las settings remote para que coincidan con el formato del admin
    const s = settings || {};
    const obj = (v) => { if (v && typeof v === 'object') return v; try { return JSON.parse(v || '{}') || {}; } catch { return {}; } };
    const gastosFijos = obj(s.gastosFijos);
    const costosVariables = obj(s.costosVariables);
    return {
      nombre: s.nombre || 'PrincessLov',
      whatsapp: String(s.whatsapp || '').replace(/\D/g, ''),
      email: s.email || '',
      instagram: s.instagram || '',
      margen: Number(s.margen) || 1.30,
      redondeo: s.redondeo !== undefined && s.redondeo !== '' && Number(s.redondeo) >= 0 ? Number(s.redondeo) : (Number(CONFIG?.cotizacion?.redondeo) || 0),
      impuestoVentasPct: Math.max(0, Number(s.impuestoVentasPct) || 0),
      gastosFijos: {
        alquiler: gastosFijos.alquiler || 0,
        servicios: gastosFijos.servicios || 0,
        internet: gastosFijos.internet || 0,
        transporte: gastosFijos.transporte || 0,
        otros: gastosFijos.otros || 0,
      },
      costosVariables: this.costosVariablesEnPesos({
        envoltorio: costosVariables.envoltorio || 0,
        etiqueta: costosVariables.etiqueta || 0,
        comisionMP: costosVariables.comisionMP || 0.035,
        moneda: costosVariables.moneda,
      }),
    };
  },

  save(event) {
    event.preventDefault();
    const get = (id) => {
      const el = document.getElementById(id);
      return el ? el.value : '';
    };

    const whatsapp = get('set-whatsapp').replace(/\D/g, '');
    if (whatsapp && (whatsapp.length < 10 || whatsapp.length > 15)) {
      AdminApp.toast('El WhatsApp tiene que ir con código de país, sin espacios. Ej: 5493757338837', 'error');
      return;
    }
    // Se escribe como % (30); se guarda como multiplicador (1.30) como siempre
    const pct = parseFloat(get('set-margen'));
    if (get('set-margen').trim() && !(pct >= 0 && pct <= 400)) {
      AdminApp.toast('La ganancia va en %: por ejemplo 30', 'error');
      return;
    }
    const margen = pct >= 0 ? Math.round((1 + pct / 100) * 10000) / 10000 : 1.30;
    const settings = {
      nombre: get('set-nombre').trim(),
      whatsapp,
      email: get('set-email').trim(),
      instagram: get('set-instagram').trim().replace(/^@/, ''),
      margen,
      redondeo: Number(get('set-redondeo')) || 0,
      impuestoVentasPct: Math.max(0, Math.min(50, parseFloat(get('set-impuesto-ventas')) || 0)),
      gastosFijos: {
        alquiler: parseFloat(get('set-gasto-alquiler')) || 0,
        servicios: parseFloat(get('set-gasto-servicios')) || 0,
        internet: parseFloat(get('set-gasto-internet')) || 0,
        transporte: parseFloat(get('set-gasto-transporte')) || 0,
        otros: parseFloat(get('set-gasto-otros')) || 0,
      },
      costosVariables: {
        envoltorio: Math.round(parseFloat(get('set-cv-envoltorio')) || 0),
        etiqueta: Math.round(parseFloat(get('set-cv-etiqueta')) || 0),
        comisionMP: parseFloat(get('set-cv-comision')) || 0.035,
        moneda: 'ARS',
      },
    };

    // Guardar local (fuente de verdad del admin)
    AdminData.saveSettings(settings);

    // Sincronizar a Sheets si está configurado (necesita el token)
    if (typeof AdminSync !== 'undefined' && AdminSync.habilitado()) {
      SheetsService.guardarConfig(settings).then(result => {
        if (result.success) {
          AdminApp.toast('✅ Configuración guardada y sincronizada a la tienda');
        } else {
          AdminApp.toast('⚠️ Guardado local. No se sincronizó a Sheets.', 'error');
        }
      }).catch(() => {
        AdminApp.toast('⚠️ Guardado local. No se sincronizó a Sheets.', 'error');
      });
    } else {
      AdminApp.toast('Configuración guardada en este navegador (sin publicar: falta conectar la planilla)');
    }

    this.load();
    this.applyToLiveStore(settings);
  },

  /**
   * Aplica settings INMEDIATAMENTE a CONFIG global (tienda en vivo)
   * Sin necesidad de recargar la página
   */
  applyToLiveStore(settings) {
    if (!window.CONFIG) return;
    if (settings.nombre) CONFIG.negocio.nombre = settings.nombre;
    if (settings.whatsapp) CONFIG.negocio.whatsapp = settings.whatsapp;
    if (settings.email) CONFIG.negocio.email = settings.email;
    if (settings.instagram) CONFIG.negocio.instagram = settings.instagram;
    CONFIG.cotizacion.margenGanancia = settings.margen;
    CONFIG.cotizacion.redondeo = Number(settings.redondeo) || 0;

    // Disparar evento personalizado para que otros módulos reaccionen
    window.dispatchEvent(new CustomEvent('config:updated', { detail: settings }));
  },
};

/* ============================================
   EVENTOS GLOBALES PARA SINCRONÍA
   ============================================ */


// Sincronizar productos cuando cambian en admin
window.addEventListener('products:updated', async () => {
  if (window.SheetsService) {
    await SheetsService.refrescarTodo();
    if (window.App) {
      App.renderProductos(App.productosFiltrados || SheetsService.productos);
      App.renderSidebarFilters();
      App.renderCatBar();
    }
  }
});

// Helper global para forzar sync desde consola
window.forceSync = async () => {
  if (window.SheetsService) {
    await SheetsService.refrescarTodo();
    if (window.App) {
      App.renderProductos(App.productosFiltrados || SheetsService.productos);
      App.renderSidebarFilters();
      App.renderCatBar();
    }
    console.log('✅ Sync forzado completado');
  }
};
