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
    set('set-dolar-manual', settings.dolarManual || CONFIG?.cotizacion?.cotizacionManual || '');
    set('set-margen', settings.margen || CONFIG?.cotizacion?.margenGanancia || '');

    // Gastos fijos
    const gf = settings.gastosFijos || {};
    set('set-gasto-alquiler', gf.alquiler || '');
    set('set-gasto-servicios', gf.servicios || '');
    set('set-gasto-internet', gf.internet || '');
    set('set-gasto-transporte', gf.transporte || '');
    set('set-gasto-otros', gf.otros || '');

    // Costos variables
    const cv = settings.costosVariables || {};
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
          ['set-nombre', 'set-whatsapp', 'set-email', 'set-instagram', 'set-dolar-manual', 'set-margen'].forEach(id => {
            const el = document.getElementById(id);
            const key = { 'set-nombre': 'nombre', 'set-whatsapp': 'whatsapp', 'set-email': 'email', 'set-instagram': 'instagram', 'set-dolar-manual': 'dolarManual', 'set-margen': 'margen' }[id];
            const val = AdminData.getSettings()[key];
            if (el && document.activeElement !== el && val != null && val !== '') el.value = val;
          });
        }
      }).catch(() => {});
    }
  },

  /**
   * Carga settings a nivel global (CONFIG y ADMIN_CONFIG).
   * LO NECESITA AdminApp.init() — no eliminar.
   */
  load() {
    const settings = AdminData.getSettings();

    if (settings.dolarManual) CONFIG.cotizacion.cotizacionManual = Number(settings.dolarManual) || CONFIG.cotizacion.cotizacionManual;
    if (settings.margen) CONFIG.cotizacion.margenGanancia = Number(settings.margen) || CONFIG.cotizacion.margenGanancia;
    if (settings.whatsapp) CONFIG.negocio.whatsapp = settings.whatsapp;
    if (settings.nombre) CONFIG.negocio.nombre = settings.nombre;
    if (settings.email) CONFIG.negocio.email = settings.email;
    if (settings.instagram) CONFIG.negocio.instagram = settings.instagram;

    // Gastos fijos
    if (settings.gastosFijos) Object.assign(ADMIN_CONFIG.gastosFijos, settings.gastosFijos);
    // Costos variables
    if (settings.costosVariables) Object.assign(ADMIN_CONFIG.costosVariables, settings.costosVariables);

    // Sincronizar también hacia SheetsService (para la tienda)
    if (SheetsService) {
      SheetsService.cotizacionDolar = SheetsService.cotizacionDolar || Number(settings.dolarManual) || CONFIG.cotizacion.cotizacionManual;
    }
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
      dolarManual: Number(s.dolarManual) || 1200,
      margen: Number(s.margen) || 1.30,
      gastosFijos: {
        alquiler: gastosFijos.alquiler || 0,
        servicios: gastosFijos.servicios || 0,
        internet: gastosFijos.internet || 0,
        transporte: gastosFijos.transporte || 0,
        otros: gastosFijos.otros || 0,
      },
      costosVariables: {
        envoltorio: costosVariables.envoltorio || 0,
        etiqueta: costosVariables.etiqueta || 0,
        comisionMP: costosVariables.comisionMP || 0.035,
      },
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
    const margen = parseFloat(get('set-margen'));
    if (margen && (margen < 1 || margen > 5)) {
      AdminApp.toast('El margen es un multiplicador: 1.30 = 30% de ganancia', 'error');
      return;
    }
    const settings = {
      nombre: get('set-nombre').trim(),
      whatsapp,
      email: get('set-email').trim(),
      instagram: get('set-instagram').trim().replace(/^@/, ''),
      dolarManual: parseFloat(get('set-dolar-manual')) || 1200,
      margen: parseFloat(get('set-margen')) || 1.30,
      gastosFijos: {
        alquiler: parseFloat(get('set-gasto-alquiler')) || 0,
        servicios: parseFloat(get('set-gasto-servicios')) || 0,
        internet: parseFloat(get('set-gasto-internet')) || 0,
        transporte: parseFloat(get('set-gasto-transporte')) || 0,
        otros: parseFloat(get('set-gasto-otros')) || 0,
      },
      costosVariables: {
        envoltorio: parseFloat(get('set-cv-envoltorio')) || 0,
        etiqueta: parseFloat(get('set-cv-etiqueta')) || 0,
        comisionMP: parseFloat(get('set-cv-comision')) || 0.035,
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
    CONFIG.cotizacion.cotizacionManual = settings.dolarManual;
    CONFIG.cotizacion.margenGanancia = settings.margen;

    // Disparar evento personalizado para que otros módulos reaccionen
    window.dispatchEvent(new CustomEvent('config:updated', { detail: settings }));
  },
};

/* ============================================
   EVENTOS GLOBALES PARA SINCRONÍA
   ============================================ */


// Sincronizar dólar cuando cambia en admin
window.addEventListener('dolar:updated', (e) => {
  if (window.SheetsService) {
    SheetsService.cotizacionDolar = e.detail;
    if (window.App && App.productosFiltrados) {
      App.renderProductos(App.productosFiltrados);
    }
  }
});

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
