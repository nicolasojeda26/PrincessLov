/* ============================================
   ADMIN APP - Controlador Principal
   ============================================ */

const AdminApp = {
  currentSection: 'dashboard',
  dolarRate: 1200,

  /** Título, subtítulo y ayuda corta de cada sección (lo que ve la dueña) */
  SECTIONS: {
    dashboard: ['Inicio', 'Resumen de tu tienda', ''],
    orders: ['Pedidos', 'Lo que te compran', 'Los pedidos de la web llegan como "Pendiente" y ya descuentan el stock. Cuando la clienta paga, pasalo a "Confirmado". Si no compra, ponelo en "Cancelado": el stock vuelve solo.'],
    products: ['Productos', 'Tu catálogo', 'Todo lo que cargues o edites acá se publica en la tienda. Los productos "Inactivos" no se muestran.'],
    promos: ['Promos y cupones', 'Descuentos, 2x1, combos y ofertas relámpago', 'Los cupones los escribe la clienta en el carrito. El 2x1, combos y flash sales se aplican solos.'],
    home: ['Página principal', 'Editá lo que ven tus clientas', 'Tocá una sección para abrirla, cambiá textos o fotos y apretá "Guardar y publicar". En la vista previa ves cómo queda. Con el interruptor verde mostrás u ocultás cada sección.'],
    categories: ['Categorías', 'Cómo se agrupa tu catálogo', 'Aparecen en los filtros, en el menú "Colección" y en el pie de la página.'],
    club: ['Club Prince', 'Cajas de suscripción', 'Editá las 3 cajas y los textos del club. Abajo ves quién se anotó.'],
    shipping: ['Envíos', 'Formas de entrega y precios', 'Lo que pongas acá es lo que la clienta elige en el carrito y en el pedido.'],
    financial: ['Finanzas', 'Ingresos, costos y ganancia', 'Elegí el período arriba. La ganancia se calcula con el costo que cargues en cada pedido.'],
    expenses: ['Gastos', 'Lo que gastás en el negocio', 'Cargá alquiler, envoltorios, publicidad, etc. para ver tu ganancia real en Finanzas.'],
    import: ['Importar / Exportar', 'Carga masiva y respaldos', 'Subí un Excel para cargar muchos productos de una, o descargá tus datos como respaldo.'],
    settings: ['Configuración', 'Datos del negocio y conexión', ''],
  },

  async init() {
    await this.loadDolarRate();
    AdminData.applyCustomToConfig?.();
    AdminSettings.load();
    const inicial = (location.hash || '').replace('#', '');
    this.navigate(this.HASH_TO_SECTION[inicial] || 'dashboard');
    window.addEventListener('hashchange', () => {
      const sec = this.HASH_TO_SECTION[(location.hash || '').replace('#', '')];
      if (sec && sec !== this.currentSection) this.navigate(sec);
    });
  },

  HASH_TO_SECTION: {
    inicio: 'dashboard', pedidos: 'orders', productos: 'products', promociones: 'promos',
    pagina: 'home', categorias: 'categories', club: 'club', envios: 'shipping',
    finanzas: 'financial', gastos: 'expenses', importar: 'import', configuracion: 'settings',
  },

  navigate(section) {
    if (section === 'content') section = 'home'; // nombre viejo
    if (!this.SECTIONS[section]) section = 'dashboard';

    // Cambios sin guardar en el editor de la página
    if (this.currentSection === 'home' && section !== 'home' && typeof AdminHome !== 'undefined' && AdminHome.dirty) {
      if (!confirm('Tenés cambios sin guardar en la página principal. ¿Salir igual?')) return false;
      AdminHome.descartar(false);
    }

    this.currentSection = section;

    document.querySelectorAll('.admin-section').forEach(s => s.classList.remove('active'));
    document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));

    const sectionEl = document.getElementById('section-' + section);
    if (sectionEl) sectionEl.classList.add('active');

    const navEl = document.querySelector(`.nav-item[data-section="${section}"]`);
    if (navEl) navEl.classList.add('active');

    const [title, breadcrumb, help] = this.SECTIONS[section];
    document.getElementById('page-title').textContent = title;
    document.getElementById('page-breadcrumb').textContent = breadcrumb;
    const helpEl = document.getElementById('section-help');
    if (helpEl) { helpEl.textContent = help ? 'ℹ️ ' + help : ''; helpEl.hidden = !help; }
    document.body.dataset.section = section;

    const hash = Object.keys(this.HASH_TO_SECTION).find(k => this.HASH_TO_SECTION[k] === section);
    if (hash && location.hash !== '#' + hash) history.replaceState(null, '', '#' + hash);

    this.toggleMenu(false);
    this.renderSection(section);
    this.actualizarBadges();
    window.scrollTo({ top: 0 });
    return false;
  },

  renderSection(section) {
    switch (section) {
      case 'dashboard': AdminDashboard.render(); this.renderChecklist(); break;
      case 'products': AdminProducts.render(); break;
      case 'orders': AdminOrders.render(); break;
      case 'expenses': AdminExpenses.render(); break;
      case 'financial': AdminDashboard.renderFinancial(); break;
      case 'home': AdminHome.render(); break;
      case 'categories': AdminContent.renderCategorias(); break;
      case 'club': AdminContent.renderClub(); break;
      case 'shipping': AdminEnvios.render(); break;
      case 'promos': AdminPromos.render(); break;
      case 'settings': AdminSettings.render(); break;
    }
  },

  /** Menú lateral en celular */
  toggleMenu(abrir) {
    const open = typeof abrir === 'boolean' ? abrir : !document.body.classList.contains('menu-open');
    document.body.classList.toggle('menu-open', open);
  },

  /** Contadores del menú: pedidos pendientes y productos sin stock */
  actualizarBadges() {
    const pend = AdminData.getOrders().filter(o => (o.estado || 'pendiente') === 'pendiente').length;
    const sinStock = AdminData.getProducts().filter(p => p.activo !== false && (Number(p.stock) || 0) <= 0).length;
    const set = (id, n) => { const el = document.getElementById(id); if (el) { el.textContent = n; el.hidden = !n; } };
    set('nav-badge-orders', pend);
    set('nav-badge-stock', sinStock);
    const qa = document.getElementById('qa-pendientes');
    if (qa) qa.textContent = pend;
  },

  /** Lista de "Primeros pasos" del inicio: se tilda sola a medida que avanza */
  renderChecklist() {
    const ul = document.getElementById('checklist');
    const card = document.getElementById('checklist-card');
    if (!ul || !card) return;
    const cont = AdminData.getContenido();
    const pasos = [
      { ok: !!SheetsService.appsScriptUrl && typeof AdminSync !== 'undefined' && !!AdminSync.token(), txt: 'Conectar la planilla de Google (para que tus cambios se vean en la tienda)', ir: 'settings' },
      { ok: AdminData.getProducts().length > 0, txt: 'Cargar tus productos con foto y precio', ir: 'products' },
      { ok: !!cont, txt: 'Personalizar la página principal (portada, textos, fotos)', ir: 'home' },
      { ok: !!AdminData.getSettings().whatsapp, txt: 'Revisar tu WhatsApp y datos del negocio', ir: 'settings' },
    ];
    const hechos = pasos.filter(p => p.ok).length;
    card.hidden = hechos === pasos.length;
    ul.innerHTML = pasos.map(p => `
      <li class="checklist__item ${p.ok ? 'checklist__item--ok' : ''}">
        <span class="checklist__check" aria-hidden="true">${p.ok ? '✓' : ''}</span>
        <span class="checklist__txt">${escHtml(p.txt)}</span>
        ${p.ok ? '' : `<button class="btn btn-sm btn-secondary" onclick="AdminApp.navigate('${p.ir}')">Ir →</button>`}
      </li>`).join('');
    const title = document.getElementById('welcome-title');
    if (title) {
      const h = new Date().getHours();
      title.textContent = (h < 13 ? '¡Buen día' : h < 20 ? '¡Buenas tardes' : '¡Buenas noches') + '! 👋';
    }
  },

  async loadDolarRate() {
    try {
      const resp = await fetch('https://criptoya.com/api/dolar');
      const data = await resp.json();
      this.dolarRate = data.oficial?.ask || data.blue?.ask || 1200;
    } catch {
      this.dolarRate = 1200;
    }
    const el = document.getElementById('admin-dolar-value');
    if (el) el.textContent = '$' + this.dolarRate.toLocaleString('es-AR');
  },

  toast(message, type = 'success') {
    const container = document.getElementById('admin-toast-container');
    if (!container) return;
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.textContent = message;
    container.appendChild(toast);
    setTimeout(() => {
      toast.style.animation = 'toastOut 0.3s ease forwards';
      setTimeout(() => toast.remove(), 300);
    }, 3200);
  },

  formatDate(iso) {
    if (!iso) return '-';
    const d = new Date(iso);
    return d.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' });
  },

  formatDateTime(iso) {
    if (!iso) return '-';
    const d = new Date(iso);
    return d.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  },
};

document.addEventListener('DOMContentLoaded', () => AdminApp.init());
window.addEventListener('keydown', (e) => { if (e.key === 'Escape') AdminApp.toggleMenu(false); });
