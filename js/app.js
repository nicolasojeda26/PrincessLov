/* ============================================================
   APP - PrincessLov Tienda Online (Zara/Mango Style)
   ============================================================ */

const App = {
  productosFiltrados: [],
  categoriaActual: 'todos',
  stockFilter: 'all',
  sortOrder: 'featured',

  async init() {
    try {
      this.applyCustomConfig?.();
      // Config publicada desde el admin (textos, categorías, envíos, WhatsApp)
      // y productos en paralelo para que la carga sea más rápida.
      await Promise.all([
        SheetsService.cargarConfigPublica({ preview: this.esPreview() }),
        SheetsService.cargarProductos(),
      ]);
      await SheetsService.obtenerCotizacion();

      CartService.init();
      CartService.onChange(() => this.actualizarUI());
      CartService.sincronizarStock();

      this.renderContenidoCustom?.();
      // Los textos del Club Prince se pintan apenas carga la página, antes de que
      // llegue lo publicado desde el admin: se repintan ahora con la versión final.
      if (typeof ClubPrince !== 'undefined') ClubPrince.renderBoxesFromConfig?.();
      this.renderDolarTicker();
      this.renderSidebarFilters();
      this.renderCatBar();
      this.renderMegaMenu?.();
      this.renderShowcase?.();
      this.renderServicios?.();

      // Mostrar skeletons mientras se cargan
      this.showSkeletons(8);

      // Restaurar filtros: URL tiene prioridad sobre sessionStorage
      this._loadFromURL();
      this._loadFilters();
      this._validarFiltros();
      this._applyFilterUI();

      this.aplicarFiltros();
      this.renderStockCounts();
      this.renderCartSidebar();
      this.actualizarUI();
      this.setupWhatsAppLink();
      this.renderFlashBanner();
      if (typeof PromoEngine !== 'undefined') {
        PromoEngine.apply();
        PromoEngine.iniciarTicker();
      }

      this.setupNewsletter();
      this.hideLoading();
    } catch (error) {
      console.error('[App] Error inicializando:', error);
      this.hideLoading();
    }
  },

  /* ---------- DÓLAR TICKER ---------- */
  renderDolarTicker() {
    const el = document.getElementById('dolar-valor');
    if (el && SheetsService.cotizacionDolar != null) el.textContent = '$' + SheetsService.cotizacionDolar.toLocaleString('es-AR');
  },

  /* ---------- SIDEBAR DRAWER FILTERS ---------- */
  renderSidebarFilters() {
    const container = document.getElementById('filter-categories');
    if (!container) return;

    const cats = SheetsService.obtenerCategoriasConConteo();

    container.innerHTML = `
      <button class="filter-btn ${this.categoriaActual === 'todos' ? 'filter-btn--active' : ''}" onclick="App.filtrarCategoria('todos')" data-cat="todos">
        <span>Todos los productos</span>
        <span class="filter-btn__count">${SheetsService.productos.length}</span>
      </button>
      ${cats.map(cat => `
        <button class="filter-btn ${cat.id === this.categoriaActual ? 'filter-btn--active' : ''}" onclick="App.filtrarCategoria('${escJsAttr(cat.id)}')" data-cat="${escHtml(cat.id)}">
          <span><span aria-hidden="true">${escHtml(cat.icon || '')}</span> ${escHtml(cat.nombre)}</span>
          <span class="filter-btn__count">${cat.count}</span>
        </button>
      `).join('')}
    `;
  },

  /* ---------- CATEGORY PILLS (horizontal scroll) ---------- */
  renderCatBar() {
    const container = document.getElementById('cat-pills');
    if (!container) return;

    const cats = SheetsService.obtenerCategoriasConConteo();

    // Keep "Todos" as first pill, then categories
    container.innerHTML = `
      <button class="cat-pill ${this.categoriaActual === 'todos' ? 'cat-pill--active' : ''}" onclick="App.filtrarCategoria('todos')" data-cat="todos" aria-pressed="${this.categoriaActual === 'todos'}">Todos</button>
      ${cats.map(cat => `
        <button class="cat-pill ${cat.id === this.categoriaActual ? 'cat-pill--active' : ''}" onclick="App.filtrarCategoria('${escJsAttr(cat.id)}')" data-cat="${escHtml(cat.id)}" aria-pressed="${cat.id === this.categoriaActual}">
          <span aria-hidden="true">${escHtml(cat.icon || '')}</span> ${escHtml(cat.nombre)}
        </button>
      `).join('')}
    `;
  },

  /* ---------- IR A TODOS LOS PRODUCTOS ---------- */
  goAll() {
    if (this.sortOrder === 'newest') this.setSortOrder('featured');
    this.filtrarCategoria('todos');
    this.setStockFilter('all');
    ComponentReveal.scrollToProducts();
  },

  /** "Novedades": todo el catálogo con lo último cargado primero */
  goNovedades() {
    this.categoriaActual = 'todos';
    this.stockFilter = 'all';
    this.setSortOrder('newest');
    this.filtrarCategoria('todos');
    const t = document.getElementById('productos-title'); if (t) t.textContent = 'Novedades';
    ComponentReveal.scrollToProducts();
  },

  /* ---------- SCROLL A PRODUCTOS ---------- */
  scrollToProducts() {
    ComponentReveal.scrollToProducts();
  },

  /* ---------- FILTRADO Y ORDENAMIENTO ---------- */
  aplicarFiltros() {
    let productos = [...SheetsService.productos];

    if (this.categoriaActual !== 'todos') {
      productos = SheetsService.filtrarPorCategoria(this.categoriaActual);
    }

    if (this.stockFilter === 'in') {
      productos = productos.filter(p => p.stock > 0);
    } else if (this.stockFilter === 'out') {
      productos = productos.filter(p => p.stock <= 0);
    }

    // Ordenar por el precio que ve la clienta (respeta precio manual en pesos y ofertas)
    const precio = (p) => (typeof PromoEngine !== 'undefined' && PromoEngine.precioVistaARS) ? PromoEngine.precioVistaARS(p) : SheetsService.calcularPrecioARS(p.precioUSD, p);
    const orden = new Map(SheetsService.productos.map((p, i) => [p.id, i]));
    switch (this.sortOrder) {
      case 'newest': productos.sort((a, b) => orden.get(b.id) - orden.get(a.id)); break; // lo último cargado primero
      case 'price-asc': productos.sort((a, b) => precio(a) - precio(b)); break;
      case 'price-desc': productos.sort((a, b) => precio(b) - precio(a)); break;
      case 'name': productos.sort((a, b) => a.nombre.localeCompare(b.nombre, 'es')); break;
      default: productos.sort((a, b) => (b.destacado ? 1 : 0) - (a.destacado ? 1 : 0));
    }

    this.renderProductos(productos);
  },

  filtrarCategoria(catId) {
    // Un link a una categoría o grupo que ya no existe muestra todo (no una página vacía)
    if (catId !== 'todos' && !SheetsService.nombreFiltro(catId)) catId = 'todos';
    this.categoriaActual = catId;

    // Sidebar filters
    document.querySelectorAll('#filter-categories .filter-btn').forEach(btn => {
      btn.classList.toggle('filter-btn--active', btn.dataset.cat === catId);
    });

    // Category bar pills
    document.querySelectorAll('.cat-pill').forEach(pill => {
      const active = pill.dataset.cat === catId;
      pill.classList.toggle('cat-pill--active', active);
      pill.setAttribute('aria-pressed', active);
    });

    // Section title
    const titleEl = document.getElementById('productos-title');
    if (titleEl) {
      if (catId === 'todos') titleEl.textContent = this.sortOrder === 'newest' ? 'Novedades' : (CONFIG.contenido?.productos?.title || 'Todos los productos');
      else titleEl.textContent = SheetsService.nombreFiltro(catId) || 'Productos';
    }

    this._saveFilters();
    this._syncURL();
    this.aplicarFiltros();
  },

  setStockFilter(filter) {
    this.stockFilter = filter;
    document.querySelectorAll('#filter-stock .filter-btn').forEach(btn => {
      btn.classList.toggle('filter-btn--active', btn.dataset.filter === filter);
    });
    this._saveFilters();
    this._syncURL();
    this.aplicarFiltros();
  },

  setSortOrder(order) {
    this.sortOrder = order;
    document.querySelectorAll('#filter-sort .filter-btn').forEach(btn => {
      btn.classList.toggle('filter-btn--active', btn.dataset.sort === order);
    });
    const titleEl = document.getElementById('productos-title');
    if (titleEl && this.categoriaActual === 'todos') {
      titleEl.textContent = order === 'newest' ? 'Novedades' : (CONFIG.contenido?.productos?.title || 'Todos los productos');
    }
    this._saveFilters();
    this._syncURL();
    this.aplicarFiltros();
  },

  /* ---------- FILTROS PERSISTENTES ---------- */
  _saveFilters() {
    try {
      sessionStorage.setItem('pl_filters', JSON.stringify({
        cat: this.categoriaActual,
        stock: this.stockFilter,
        sort: this.sortOrder,
      }));
    } catch {}
  },

  _loadFilters() {
    try {
      const raw = sessionStorage.getItem('pl_filters');
      if (!raw) return;
      const f = JSON.parse(raw);
      // El link (?cat=…) tiene prioridad sobre lo que quedó guardado de la visita anterior
      const url = new URLSearchParams(window.location.search);
      if (!url.has('cat') && f.cat && f.cat !== 'todos') this.categoriaActual = f.cat;
      if (!url.has('stock') && f.stock && f.stock !== 'all') this.stockFilter = f.stock;
      if (!url.has('sort') && f.sort && f.sort !== 'featured') this.sortOrder = f.sort;
    } catch {}
  },

  /** Si el filtro guardado o del link ya no existe (categoría borrada o renombrada), vuelve a "Todos" */
  _validarFiltros() {
    const c = this.categoriaActual;
    if (c && c !== 'todos' && !SheetsService.nombreFiltro(c)) this.categoriaActual = 'todos';
    if (!['all', 'in', 'out'].includes(this.stockFilter)) this.stockFilter = 'all';
    if (!['featured', 'newest', 'price-asc', 'price-desc', 'name'].includes(this.sortOrder)) this.sortOrder = 'featured';
  },

  _applyFilterUI() {
    // Botones de categoría
    document.querySelectorAll('#filter-categories .filter-btn').forEach(btn => {
      btn.classList.toggle('filter-btn--active', btn.dataset.cat === this.categoriaActual);
    });
    document.querySelectorAll('.cat-pill').forEach(pill => {
      const active = pill.dataset.cat === this.categoriaActual;
      pill.classList.toggle('cat-pill--active', active);
      pill.setAttribute('aria-pressed', active);
    });
    // Botones de stock
    document.querySelectorAll('#filter-stock .filter-btn').forEach(btn => {
      btn.classList.toggle('filter-btn--active', btn.dataset.filter === this.stockFilter);
    });
    // Botones de orden
    document.querySelectorAll('#filter-sort .filter-btn').forEach(btn => {
      btn.classList.toggle('filter-btn--active', btn.dataset.sort === this.sortOrder);
    });
    // Título de sección
    const titleEl = document.getElementById('productos-title');
    if (titleEl && this.categoriaActual !== 'todos') {
      const nombre = SheetsService.nombreFiltro(this.categoriaActual);
      if (nombre) titleEl.textContent = nombre;
    } else if (titleEl && this.sortOrder === 'newest') titleEl.textContent = 'Novedades';
  },

  /* ---------- FILTROS EN URL ---------- */
  _syncURL() {
    const params = new URLSearchParams();
    if (this.categoriaActual && this.categoriaActual !== 'todos') params.set('cat', this.categoriaActual);
    if (this.stockFilter && this.stockFilter !== 'all') params.set('stock', this.stockFilter);
    if (this.sortOrder && this.sortOrder !== 'featured') params.set('sort', this.sortOrder);
    const qs = params.toString();
    const newURL = qs ? `${window.location.pathname}?${qs}` : window.location.pathname;
    window.history.replaceState({}, '', newURL);
  },

  _loadFromURL() {
    const params = new URLSearchParams(window.location.search);
    if (params.has('cat')) this.categoriaActual = params.get('cat') || 'todos';
    if (params.has('stock')) this.stockFilter = params.get('stock') || 'all';
    if (params.has('sort')) this.sortOrder = params.get('sort') || 'featured';
  },

  /* ---------- HEADER SEARCH ---------- */
  handleHeaderSearch(query) {
    // If user types in header search, open search overlay and delegate
    if (query && query.trim().length >= 2) {
      const overlay = document.getElementById('search-overlay');
      if (overlay && !overlay.classList.contains('search-overlay--open')) {
        this.toggleSearch();
      }
      const input = document.getElementById('search-input');
      if (input) input.value = query;
      this.handleSearch(query);
    } else if (query.trim().length === 0) {
      this.aplicarFiltros();
    }
  },

  /* ---------- PRODUCTOS GRID ---------- */
  renderProductos(productos) {
    const grid = document.getElementById('productos-grid');
    const countEl = document.getElementById('productos-count');
    const emptyEl = document.getElementById('productos-empty');
    if (!grid) return;

    this.productosFiltrados = productos;

    if (countEl) countEl.textContent = `${productos.length} producto${productos.length !== 1 ? 's' : ''}`;

    if (productos.length === 0) {
      grid.style.display = 'none';
      if (emptyEl) {
        emptyEl.style.display = 'block';
        // Poblar sugerencias de categorías
        const catsEl = document.getElementById('empty-categories');
        if (catsEl) {
          const cats = (typeof SheetsService !== 'undefined' && SheetsService.obtenerCategoriasConConteo)
            ? SheetsService.obtenerCategoriasConConteo().filter(c => c.id !== 'todos' && c.count > 0)
            : [];
          catsEl.innerHTML = cats.slice(0, 6).map(c =>
            `<button class="grid-empty__cat-btn" onclick="App.filtrarCategoria('${escJsAttr(c.id)}')">${c.icon ? escHtml(c.icon) + ' ' : ''}${escHtml(c.nombre)}</button>`
          ).join('');
        }
      }
      return;
    }

    grid.style.display = 'grid';
    if (emptyEl) emptyEl.style.display = 'none';

    grid.innerHTML = productos.map(p => {
      const basePrecio = SheetsService.calcularPrecioARS(p.precioUSD, p);
      const precioARS = (typeof PromoEngine !== 'undefined' && PromoEngine.precioVistaARS) ? PromoEngine.precioVistaARS(p) : basePrecio;
      const sinStock = p.stock <= 0;

      let badge = '';
      const promoBadges = (typeof PromoEngine !== 'undefined' && PromoEngine.badgePara) ? PromoEngine.badgePara(p) : [];
      if (sinStock) badge = '<span class="badge badge--low">Sin stock</span>';
      else if (promoBadges.length) {
        badge = promoBadges.map(b => `<span class="badge ${b.clase}">${escHtml(b.texto)}</span>`).join('');
      } else if (p.tags.includes('nuevo')) badge = '<span class="badge badge--new">Nuevo</span>';
      else if (p.tags.includes('oferta')) badge = '<span class="badge badge--sale">Oferta</span>';
      else if (p.stock <= 3) badge = '<span class="badge badge--low">Últimas unidades</span>';

      const flashBadge = promoBadges.find(b => b.hasta);
      const countdown = flashBadge
        ? `<span class="promo-countdown" data-countdown="${escHtml(flashBadge.hasta)}">⏳ ${PromoEngine.restanteHumano(flashBadge.hasta)}</span>`
        : '';

      return `
        <article class="product-card" data-id="${escHtml(p.id)}" role="listitem" tabindex="0" aria-label="${escHtml(p.nombre)}" onclick="App.openProductModal('${escJsAttr(p.id)}')" onkeydown="if(event.key==='Enter'){App.openProductModal('${escJsAttr(p.id)}')}">
          <div class="product-card__media">
            ${badge}
            ${countdown}
            <img class="product-card__image" src="${escHtml(SheetsService.fotoChica(p.imagen, 600))}" alt="${escHtml(p.nombre)}"
                 loading="lazy"
                 onerror="this.onerror=null;this.src='data:image/svg+xml;utf8,<svg xmlns=%22http://www.w3.org/2000/svg%22 width=%22300%22 height=%22400%22><rect width=%22300%22 height=%22400%22 fill=%22%23eedbd8%22/><text x=%2250%25%22 y=%2250%25%22 text-anchor=%22middle%22 dy=%22.3em%22 fill=%22%239c684c%22 font-size=%2216%22>PrincessLov</text></svg>'">
            <button class="product-card__quick" data-id="${escHtml(p.id)}" aria-label="Agregar ${escHtml(p.nombre)} al carrito" ${sinStock ? 'disabled' : ''}>
              <span aria-hidden="true">🛒</span>
            </button>
          </div>
          <div class="product-card__info">
            <div class="product-card__cat">${escHtml(SheetsService.nombreFiltro(p.categoria) || p.categoriaOriginal)}</div>
            <h3 class="product-card__name">${escHtml(p.nombre)}</h3>
            <div class="product-card__prices">
              ${precioARS < basePrecio
                ? `<span class="price price--old">${SheetsService.formatPrecioARS(basePrecio)}</span><span class="price price--current">${SheetsService.formatPrecioARS(precioARS)}</span>`
                : `<span class="price price--current">${SheetsService.formatPrecioARS(precioARS)}</span>`}
            </div>
            <div class="product-card__stock ${sinStock ? 'product-card__stock--low' : ''}">
              ${sinStock ? 'Sin stock' : (p.stock <= 3 ? `¡Quedan ${p.stock}!` : 'En stock')}
            </div>
          </div>
        </article>
      `;
    }).join('');

    if (grid.querySelector('[data-countdown]') && typeof PromoEngine !== 'undefined') PromoEngine.iniciarTicker();

    // Delegación quick-add (no abre modal)
    grid.querySelectorAll('.product-card__quick').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        if (btn.disabled) return;
        const id = btn.dataset.id;
        const producto = SheetsService.obtenerProducto(id);
        if (!producto) return;
        if (producto.variantes && producto.variantes.length > 0) {
          // Producto con variantes: pedir que elija color/talle desde la ficha
          this.showToast(this.textoElegirVariante(producto));
          this.openProductModal(id);
          return;
        }
        if (producto.stock > 0) this.avisarAgregado(CartService.addItem(producto), producto.nombre);
      });
    });
  },

  /* ---------- PRODUCT DETAIL MODAL ---------- */
  openProductModal(productId) {
    const producto = SheetsService.obtenerProducto(productId);
    if (!producto) return;

    const modal = document.getElementById('product-modal');
    if (!modal) return;

    // Main image
    const mainImg = document.getElementById('product-modal-main-img');
    if (mainImg) {
      mainImg.src = producto.imagen;
      mainImg.alt = producto.nombre;
    }

    // Thumbnails
    const thumbsContainer = document.getElementById('product-modal-thumbs');
    if (thumbsContainer) {
      const images = [producto.imagen, ...(producto.galeria || []).map(g => g.url)].filter(Boolean);
      thumbsContainer.innerHTML = images.map((img, idx) => `
        <img class="product-modal__thumb ${idx === 0 ? 'active' : ''}" src="${escHtml(SheetsService.fotoChica(img, 200))}" data-full="${escHtml(img)}" alt="${escHtml(producto.nombre)} - vista ${idx + 1}" 
             onclick="App.switchProductModalImage(this)" loading="lazy" onerror="this.remove()">
      `).join('');
    }

    // Badges
    const badgesEl = document.getElementById('product-modal-badges');
    if (badgesEl) {
      const badges = [];
      const promoBadges = (typeof PromoEngine !== 'undefined' && PromoEngine.badgePara) ? PromoEngine.badgePara(producto) : [];
      const promoModalClases = { 'badge--flash': 'product-modal__badge--flash', 'badge--preventa': 'product-modal__badge--preventa', 'badge--combo': 'product-modal__badge--combo', 'badge--2x1': 'product-modal__badge--2x1' };
      promoBadges.forEach(b => badges.push(`<span class="product-modal__badge ${promoModalClases[b.clase] || b.clase}">${escHtml(b.texto)}</span>`));
      if (producto.tags?.includes('nuevo')) badges.push('<span class="product-modal__badge product-modal__badge--new">Nuevo</span>');
      if (producto.tags?.includes('oferta')) badges.push('<span class="product-modal__badge product-modal__badge--oferta">Oferta</span>');
      if (producto.destacado) badges.push('<span class="product-modal__badge product-modal__badge--bestseller">Destacado</span>');
      badgesEl.innerHTML = badges.join('');
    }

    // Title
    const titleEl = document.getElementById('product-modal-title');
    if (titleEl) titleEl.textContent = producto.nombre;

    // SKU
    const skuEl = document.getElementById('product-modal-sku');
    if (skuEl) {
      if (producto.sku) {
        skuEl.textContent = `SKU: ${producto.sku}`;
      } else {
        skuEl.textContent = '';
      }
    }

    // Price
    const priceRowEl = document.getElementById('product-modal-price-row');
    if (priceRowEl) {
      const basePrecio = producto.precioARSManual || SheetsService.calcularPrecioARS(producto.precioUSD);
      const precioARS = (typeof PromoEngine !== 'undefined' && PromoEngine.precioVistaARS) ? PromoEngine.precioVistaARS(producto) : basePrecio;
      let priceHtml = `<span class="product-modal__price">${SheetsService.formatPrecioARS(precioARS)}</span>`;
      if (precioARS < basePrecio) {
        const pct = Math.round((1 - precioARS / basePrecio) * 100);
        priceHtml = `<span class="product-modal__price-old">${SheetsService.formatPrecioARS(basePrecio)}</span> <span class="product-modal__price">${SheetsService.formatPrecioARS(precioARS)}</span> <span class="product-modal__discount-badge">-${pct}%</span>`;
      }
      if (typeof PromoEngine !== 'undefined' && PromoEngine.preventaDeProducto && PromoEngine.preventaDeProducto(producto)) {
        priceHtml += `<br><span class="product-modal__preventa-note">🔖 Preventa: precio especial. Te lo reservamos y lo despachamos en el lanzamiento.</span>`;
      }
      priceRowEl.innerHTML = priceHtml;
    }

    // Description
    const descEl = document.getElementById('product-modal-desc');
    if (descEl) descEl.textContent = producto.descripcion || 'Sin descripción disponible.';

    // Specs
    const specsEl = document.getElementById('product-modal-specs');
    const specsGridEl = document.getElementById('product-modal-specs-grid');
    if (specsEl && specsGridEl && producto.caracteristicas && Object.keys(producto.caracteristicas).length > 0) {
      specsGridEl.innerHTML = Object.entries(producto.caracteristicas).map(([key, value]) => `
        <div class="product-modal__spec-item">
          <span class="product-modal__spec-label">${escHtml(key)}</span>
          <span class="product-modal__spec-value">${escHtml(value)}</span>
        </div>
      `).join('');
      specsEl.style.display = 'block';
    } else if (specsEl) {
      specsEl.style.display = 'none';
    }

    // Variants
    const variantsEl = document.getElementById('product-modal-variants');
    const variantsContainerEl = document.getElementById('product-modal-variants-container');
    if (variantsEl && variantsContainerEl && producto.variantes && producto.variantes.length > 0) {
      // Group by color
      // Agrupa por color. Si una opción no tiene color (solo talle) no se dibuja el círculo;
      // si no tiene talle, el botón muestra el color.
      const colors = [...new Set(producto.variantes.map(v => v.color || ''))];
      let html = '';
      colors.forEach((color, colorIdx) => {
        const variantsOfColor = producto.variantes.filter(v => (v.color || '') === color);
        const colorHex = variantsOfColor[0]?.colorHex || '#800020';
        const conTalles = variantsOfColor.some(v => v.talle);
        html += `
          <div class="product-modal__variant-group">
            ${color && conTalles ? `<div class="product-modal__variant-label" style="display:flex; align-items:center; gap:0.5rem;">
              <span style="width:16px;height:16px;border-radius:50%;background:${/^#[0-9a-f]{3,8}$/i.test(colorHex) ? colorHex : '#800020'};border:1px solid var(--border);"></span>
              ${escHtml(color)}
            </div>` : (!color && colorIdx === 0 ? '<div class="product-modal__variant-label">Talle</div>' : '')}
            <div class="product-modal__variant-options">
              ${variantsOfColor.map(v => `
                <button class="product-modal__variant-option ${v.stock <= 0 ? 'disabled' : ''}" 
                        data-color="${escHtml(color)}" data-talle="${escHtml(v.talle || '')}" data-stock="${Number(v.stock) || 0}"
                        onclick="App.selectProductVariant(this)" ${v.stock <= 0 ? 'disabled' : ''}>
                  ${v.talle ? escHtml(v.talle) : `<span style="display:inline-block;width:10px;height:10px;border-radius:50%;margin-right:4px;background:${/^#[0-9a-f]{3,8}$/i.test(v.colorHex || '') ? v.colorHex : '#800020'};"></span>${escHtml(color)}`}
                  ${v.stock > 0 && v.stock <= 5 ? `<span style="font-size:0.65rem;color:#F59E0B;"> (${v.stock})</span>` : ''}
                </button>
              `).join('')}
            </div>
          </div>
        `;
      });
      variantsContainerEl.innerHTML = html;
      variantsEl.style.display = 'block';
    } else if (variantsEl) {
      variantsEl.style.display = 'none';
    }

    // Stock info
    const stockInfoEl = document.getElementById('product-modal-stock-info');
    if (stockInfoEl) {
      const totalStock = (producto.variantes && producto.variantes.length > 0) 
        ? producto.variantes.reduce((s, v) => s + (v.stock || 0), 0) 
        : producto.stock;
      
      let stockClass = 'in-stock';
      let stockText = `Disponible: ${totalStock} unidades`;
      if (totalStock <= 0) { stockClass = 'out-stock'; stockText = 'Sin stock disponible'; }
      else if (totalStock <= 5) { stockClass = 'low-stock'; stockText = `¡Solo ${totalStock} unidades!`; }
      
      stockInfoEl.innerHTML = `<span class="product-modal__stock-info ${stockClass}">${stockText}</span>`;
    }

    // Store current product ID for add to cart
    modal.dataset.productId = producto.id;
    modal.dataset.selectedColor = '';
    modal.dataset.selectedTalle = '';
    modal.dataset.variantSel = '';

    // Open modal
    modal.classList.add('open');
    document.body.classList.add('no-scroll');
  },

  closeProductModal() {
    const modal = document.getElementById('product-modal');
    if (modal) {
      modal.classList.remove('open');
      modal.dataset.productId = '';
      modal.dataset.selectedColor = '';
      modal.dataset.selectedTalle = '';
      modal.dataset.variantSel = '';
      document.body.classList.remove('no-scroll');
    }
  },

  switchProductModalImage(thumbEl) {
    const mainImg = document.getElementById('product-modal-main-img');
    if (mainImg && thumbEl) mainImg.src = thumbEl.dataset.full || thumbEl.src;
    document.querySelectorAll('.product-modal__thumb').forEach(t => t.classList.remove('active'));
    thumbEl.classList.add('active');
  },

  /** "Elegí el talle" / "Elegí el color" / "Elegí color y talle" según lo que tenga el producto */
  textoElegirVariante(producto) {
    const vs = producto?.variantes || [];
    const talles = vs.some(v => v.talle), colores = vs.some(v => v.color);
    return talles && colores ? 'Elegí color y talle' : talles ? 'Elegí el talle' : 'Elegí el color';
  },

  selectProductVariant(btn) {
    if (btn.classList.contains('disabled')) return;
    
    document.querySelectorAll('.product-modal__variant-option').forEach(b => b.classList.remove('selected'));
    btn.classList.add('selected');
    
    const modal = document.getElementById('product-modal');
    modal.dataset.selectedColor = btn.dataset.color;
    modal.dataset.selectedTalle = btn.dataset.talle;
    modal.dataset.variantSel = '1';
    
    // Update stock info
    const stock = parseInt(btn.dataset.stock) || 0;
    const stockInfoEl = document.getElementById('product-modal-stock-info');
    if (stockInfoEl) {
      let stockClass = 'in-stock';
      let stockText = `Stock para esta variante: ${stock} unidades`;
      if (stock <= 0) { stockClass = 'out-stock'; stockText = 'Esta variante sin stock'; }
      else if (stock <= 5) { stockClass = 'low-stock'; stockText = `¡Solo ${stock} unidades de esta variante!`; }
      stockInfoEl.innerHTML = `<span class="product-modal__stock-info ${stockClass}">${stockText}</span>`;
    }
  },

  addToCartFromModal() {
    const modal = document.getElementById('product-modal');
    const productId = modal?.dataset.productId;
    const selectedColor = modal?.dataset.selectedColor;
    const selectedTalle = modal?.dataset.selectedTalle;

    const producto = SheetsService.obtenerProducto(productId);
    if (!producto) return;

    // Check if product has variants and one is required
    if (producto.variantes && producto.variantes.length > 0) {
      if (modal.dataset.variantSel !== '1') {
        this.showToast(this.textoElegirVariante(producto));
        return;
      }

      const variant = producto.variantes.find(v => (v.color || '') === selectedColor && (v.talle || '') === selectedTalle);
      if (!variant || variant.stock <= 0) {
        this.showToast('Variante sin stock');
        return;
      }
      
      // Add with variant info
      const itemWithVariant = { ...producto, _variant: { color: selectedColor, talle: selectedTalle } };
      this.avisarAgregado(CartService.addItem(itemWithVariant), `${producto.nombre} (${[selectedTalle, selectedColor].filter(Boolean).join(' · ')})`);
    } else {
      // No variants
      if (producto.stock <= 0) {
        this.showToast('Sin stock');
        return;
      }
      this.avisarAgregado(CartService.addItem(producto), producto.nombre);
    }
    
    this.closeProductModal();
  },

  /**
   * Quick-add universal: si el producto tiene variantes, pide elegir desde la ficha
   */
  quickAdd(productId) {
    const producto = SheetsService.obtenerProducto(productId);
    if (!producto) return;
    if (producto.variantes && producto.variantes.length > 0) {
      this.showToast(this.textoElegirVariante(producto));
      this.openProductModal(productId);
      return;
    }
    if (producto.stock <= 0) {
      this.showToast('Sin stock en este momento');
      return;
    }
    this.avisarAgregado(CartService.addItem(producto), producto.nombre);
  },

  /** Mensaje después de agregar al carrito: avisa si ya no quedan más unidades para sumar */
  avisarAgregado(resultado, nombre) {
    if (resultado === 'max') this.showToast(`Ya tenés en el carrito todas las unidades disponibles de ${nombre}`);
    else if (resultado === false) this.showToast('Sin stock en este momento');
    else this.showToast(`Agregado: ${nombre}`);
  },

  buyViaWhatsAppFromModal() {
    const modal = document.getElementById('product-modal');
    const productId = modal?.dataset.productId;
    const selectedColor = modal?.dataset.selectedColor;
    const selectedTalle = modal?.dataset.selectedTalle;
    
    const producto = SheetsService.obtenerProducto(productId);
    if (!producto) return;

    let variantText = '';
    if (producto.variantes && producto.variantes.length > 0) {
      if (modal.dataset.variantSel !== '1') {
        this.showToast(this.textoElegirVariante(producto));
        return;
      }
      variantText = ' - ' + [selectedTalle && `Talle: ${selectedTalle}`, selectedColor && `Color: ${selectedColor}`].filter(Boolean).join(', ');
    }

    const precioARS = (typeof PromoEngine !== 'undefined' && PromoEngine.precioVistaARS) ? PromoEngine.precioVistaARS(producto) : (producto.precioARSManual || SheetsService.calcularPrecioARS(producto.precioUSD));
    const texto = `¡Hola! Me interesa este producto:\n• ${producto.nombre}${variantText}\nPrecio: ${SheetsService.formatPrecioARS(precioARS)}\n\n¿Está disponible?`;
    CartService.abrirWhatsApp(texto);
    this.closeProductModal();
  },

  /* ---------- SIDEBAR DRAWER ---------- */
  openSidebar() {
    document.getElementById('sidebar')?.classList.add('drawer--open');
    document.getElementById('sidebar-overlay')?.classList.add('drawer-overlay--open');
    document.body.classList.add('no-scroll');
  },

  closeSidebar() {
    document.getElementById('sidebar')?.classList.remove('drawer--open');
    document.getElementById('sidebar-overlay')?.classList.remove('drawer-overlay--open');
    document.body.classList.remove('no-scroll');
  },

  /* ---------- CARRITO ---------- */
  renderFlashBanner() {
    const banner = document.getElementById('promos-banner');
    if (!banner || typeof PromoEngine === 'undefined' || !PromoEngine.config) return;
    const flashes = PromoEngine.flashActiva();
    if (!flashes.length) {
      banner.style.display = 'none';
      return;
    }
    const chips = flashes.filter(f => f.hasta).map(f =>
      `<span class="promo-banner__chip">⚡ ${PromoEngine.esc(f.nombre)} −${f.descuento}% <b data-countdown="${f.hasta}">⏳ ${PromoEngine.restanteHumano(f.hasta)}</b></span>`
    ).join('');
    banner.innerHTML = chips;
    banner.style.display = 'flex';
    if (banner.querySelector('[data-countdown]')) PromoEngine.iniciarTicker();
  },

  renderCartSidebar() {
    const itemsContainer = document.getElementById('cart-items');
    const totalsEl = document.getElementById('cart-totals');
    const headerCountEl = document.getElementById('cart-header-count');
    const footerEl = document.getElementById('cart-footer');
    if (!itemsContainer) return;

    const items = CartService.items;

    // Header count
    if (headerCountEl) {
      headerCountEl.textContent = `${items.length} producto${items.length !== 1 ? 's' : ''}`;
    }

    if (items.length === 0) {
      itemsContainer.innerHTML = `
        <div class="cart__empty">
          <div class="cart__empty-illustration" aria-hidden="true"></div>
          <h4 class="cart__empty-title">Tu carrito está vacío</h4>
          <p class="cart__empty-desc">Agregá tus productos favoritos y completá tu compra en pocos pasos.</p>
          <button class="btn btn--primary cart__empty-btn" onclick="App.closeCart(); App.scrollToProducts();">Seguir comprando</button>
        </div>
      `;
      if (footerEl) footerEl.innerHTML = '';
      if (totalsEl) totalsEl.innerHTML = '';
      this.hidePromoShippingCrossSell();
      return;
    }

    // Render items with premium layout
    itemsContainer.innerHTML = items.map(item => {
      const stock = CartService.getItemStock(item);
      const lowStock = stock > 0 && stock <= 3;
      const priceARS = item.precioARS * item.cantidad;
      const discount = item.descuento || 0;

      return `
        <article class="cart-item" data-id="${escHtml(item.key || item.id)}" role="listitem">
          <div class="cart-item__media">
            <img class="cart-item__image" src="${escHtml(SheetsService.fotoChica(item.imagen, 200))}" alt="${escHtml(item.nombre)}"
                 loading="lazy"
                 onerror="this.onerror=null;this.src='data:image/svg+xml;utf8,<svg xmlns=%22http://www.w3.org/2000/svg%22 width=%2272%22 height=%2296%22><rect width=%2272%22 height=%2296%22 fill=%22%23eedbd8%22/></svg>'">
            ${lowStock ? '<span class="cart-item__badge cart-item__badge--low">Pocas unidades</span>' : ''}
            ${item.sinStock ? '<span class="cart-item__badge cart-item__badge--out">Sin stock</span>' : ''}
          </div>
          <div class="cart-item__details">
            <h4 class="cart-item__name">${escHtml(item.nombre)}</h4>
            ${item.variante ? `<p class="cart-item__variant">${escHtml(String(item.variante).split('/').map(x => x.trim()).filter(Boolean).reverse().join(' · '))}</p>` : ''}
            ${item.sinStock ? '<p class="cart-item__variant cart-item__status-warn">Sin stock en este momento. Elegí otra opción o esperá el reabastecimiento.</p>' : ''}
            ${item.stockAjustado ? `<p class="cart-item__variant cart-item__status-warn">Stock ajustado a ${item.cantidad} u. disponibles.</p>` : ''}
            <div class="cart-item__price-row">
              <span class="cart-item__price">${SheetsService.formatPrecioARS(priceARS)}</span>
              ${discount ? `<span class="cart-item__discount">-${discount}%</span>` : ''}
            </div>
            <div class="cart-item__qty">
              <div class="qty-selector" role="group" aria-label="Cantidad de ${escHtml(item.nombre)}">
                <button class="qty-btn" data-action="minus" data-id="${escHtml(item.key || item.id)}" aria-label="Disminuir cantidad" ${item.cantidad <= 1 ? 'disabled' : ''}>−</button>
                <input type="number" class="qty-input" data-id="${escHtml(item.key || item.id)}" value="${item.cantidad}" min="1" max="${Math.max(stock, 1)}" aria-label="Cantidad" readonly>
                <button class="qty-btn" data-action="plus" data-id="${escHtml(item.key || item.id)}" aria-label="Aumentar cantidad" ${stock <= 0 || item.cantidad >= stock ? 'disabled' : ''}>+</button>
              </div>
              <button class="cart-item__remove" data-action="remove" data-id="${escHtml(item.key || item.id)}" aria-label="Eliminar ${escHtml(item.nombre)}" title="Eliminar">
                <span aria-hidden="true">🗑️</span>
              </button>
            </div>
          </div>
        </article>
      `;
    }).join('');

    // Totals breakdown
    const subtotal = CartService.getLineasSubtotalARS();
    const shipping = CartService.getShippingCost() || 0;
    const discount = CartService.getDiscountAmount() || 0;
    const total = CartService.getTotalARS();
    const count = CartService.getTotalItems();
    const freeShippingThreshold = CartService.getFreeShippingThreshold();
    const baseEnvioGratis = subtotal - discount;
    const progress = freeShippingThreshold > 0 ? Math.min((baseEnvioGratis / freeShippingThreshold) * 100, 100) : 0;
    const remaining = Math.max(freeShippingThreshold - baseEnvioGratis, 0);
    const progressWrap = document.getElementById('free-shipping-progress');
    if (progressWrap) progressWrap.style.display = freeShippingThreshold > 0 ? '' : 'none';
    this.renderShippingOptions();

    // Update free shipping progress
    const freeBarFill = document.getElementById('free-bar-fill');
    const freeText = document.getElementById('free-text');
    const freeAmount = document.getElementById('free-amount');
    if (freeBarFill) freeBarFill.style.width = `${progress}%`;
    if (freeAmount) freeAmount.textContent = SheetsService.formatPrecioARS(remaining);
    if (freeText) {
      if (CartService.hasFreeShipping()) {
        freeText.innerHTML = `¡Tenés <strong>envío gratis</strong>! 🎉`;
      } else {
        freeText.innerHTML = `Agregá <strong>${SheetsService.formatPrecioARS(remaining)}</strong> más para envío gratis`;
      }
    }

    // Totals breakdown
    if (totalsEl) {
      totalsEl.innerHTML = `
        <div class="cart__totals-row cart__totals-row--subtotal">
          <span class="cart__totals-label">Subtotal (<span id="totals-count">${count} item${count !== 1 ? 's' : ''}</span>)</span>
          <span>${SheetsService.formatPrecioARS(subtotal)}</span>
        </div>
        ${discount > 0 ? `
        <div class="cart__totals-row cart__totals-row--discount">
          <span class="cart__totals-label">Descuento</span>
          <span>−${SheetsService.formatPrecioARS(discount)}</span>
        </div>` : ''}
        <div class="cart__totals-row cart__totals-row--shipping">
          <span class="cart__totals-label">Envío</span>
          <span>${CartService.shippingId ? (shipping > 0 ? SheetsService.formatPrecioARS(shipping) : 'Gratis') : 'A elegir'}</span>
        </div>
        <div class="cart__totals-row cart__totals-row--total">
          <span class="cart__totals-label">Total</span>
          <span>${SheetsService.formatPrecioARS(total)}</span>
        </div>
      `;
    }

    // Cross-sell recommendations
    this.renderCrossSell();

    // Re-bind quantity inputs (readonly but keyboard accessible)
    itemsContainer.querySelectorAll('.qty-input').forEach(input => {
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') { e.preventDefault(); input.blur(); }
      });
    });
  },

  actualizarUI() {
    const count = CartService.getTotalItems();
    const countEl = document.getElementById('cart-count');
    if (countEl) {
      countEl.textContent = count;
      countEl.style.display = count > 0 ? 'flex' : 'none';
    }
    const headerCountEl = document.getElementById('cart-header-count');
    if (headerCountEl) {
      headerCountEl.textContent = `${count} producto${count !== 1 ? 's' : ''}`;
    }
    this.renderCartSidebar();
  },

  /* ---------- CART ADVANCED FEATURES ---------- */

  togglePromo() {
    const promo = document.getElementById('cart-promo');
    const form = document.getElementById('promo-form');
    const toggle = promo?.querySelector('.cart__promo-toggle');
    if (!promo || !form) return;
    const open = form.style.display !== 'none';
    form.style.display = open ? 'none' : 'flex';
    promo.classList.toggle('cart__promo--open', !open);
    toggle?.setAttribute('aria-expanded', !open);
    if (!open) {
      setTimeout(() => document.getElementById('promo-input')?.focus(), 50);
    }
  },

  async applyPromo(e) {
    e.preventDefault();
    const input = document.getElementById('promo-input');
    const messageEl = document.getElementById('promo-message');
    if (!input || !messageEl) return;
    const code = input.value.trim().toUpperCase();
    if (!code) return;

    // Cupones del Motor de Promociones (gestionables desde el admin)
    const promo = (typeof PromoEngine !== 'undefined' && PromoEngine.validarCupon) ? PromoEngine.validarCupon(code) : null;

    // "Usos máx.": cuenta los pedidos que ya confirmaste con este código
    if (promo && await this.cuponAgotado(code, promo)) {
      messageEl.textContent = '✗ Este código ya alcanzó su límite de usos';
      messageEl.className = 'cart__promo-message cart__promo-message--error';
      return;
    }

    if (promo) {
      CartService.applyPromo(code, promo);
      messageEl.textContent = `✓ ${promo.desc} aplicado`;
      messageEl.className = 'cart__promo-message cart__promo-message--success';
      input.value = '';
      this.renderCartSidebar();
    } else {
      messageEl.textContent = '✗ Código inválido o expirado';
      messageEl.className = 'cart__promo-message cart__promo-message--error';
    }
  },

  /** true si el cupón ya llegó a "Usos máx." (si la planilla no responde, no se bloquea) */
  async cuponAgotado(code, promo) {
    if (!(promo.usosMax > 0) || !SheetsService.appsScriptUrl) return false;
    try {
      const data = await SheetsService.fetchFromAppsScript('coupon_uses', { code });
      return Number(data?.usos) >= promo.usosMax;
    } catch {
      return false;
    }
  },

  /** Opciones de envío dentro del carrito (antes había un "calcular por CP" simulado) */
  /** Desplegable de envíos: cerrado por defecto para que se vean los productos */
  toggleShippingOptions(abrir) {
    const el = document.getElementById('shipping-result');
    const btn = document.getElementById('shipping-toggle');
    if (!el || !btn) return;
    const open = typeof abrir === 'boolean' ? abrir : el.hidden;
    el.hidden = !open;
    btn.setAttribute('aria-expanded', String(open));
    btn.classList.toggle('cart__shipping-toggle--open', open);
  },

  renderShippingOptions() {
    const el = document.getElementById('shipping-result');
    if (!el) return;
    const gratis = CartService.hasFreeShipping();
    const elegido = CartService.getShippingOption();
    const txt = document.getElementById('shipping-toggle-text');
    if (txt) {
      if (elegido) {
        const costo = CartService.getShippingCost();
        txt.innerHTML = `Envío: <strong>${escHtml(elegido.nombre)}</strong> · ${costo > 0 ? SheetsService.formatPrecioARS(costo) : 'Gratis'}`;
      } else {
        txt.textContent = 'Elegí cómo te llega';
      }
    }
    el.innerHTML = (CONFIG.envios || []).filter(e => e.activo !== false).map(e => {
      const sel = CartService.shippingId === e.id;
      const precio = Number(e.precio) > 0 && !gratis ? SheetsService.formatPrecioARS(e.precio) : 'Gratis';
      return `
        <button type="button" class="cart__shipping-option ${sel ? 'cart__shipping-option--selected' : ''}" data-shipping="${escHtml(e.id)}" aria-pressed="${sel}">
          <span class="cart__shipping-option-label">
            <span class="cart__shipping-option-name">${escHtml(e.nombre)}</span>
            <span class="cart__shipping-option-desc">${escHtml(e.descripcion || '')}</span>
          </span>
          <span class="cart__shipping-option-price">${precio}</span>
        </button>`;
    }).join('');
  },

  calculateShipping(e) { if (e) e.preventDefault(); this.renderShippingOptions(); },

  renderCrossSell() {
    const grid = document.getElementById('cross-sell-grid');
    const section = document.getElementById('cart-cross-sell');
    if (!grid || !section) return;

    const items = CartService.items;
    const currentIds = new Set(items.map(i => i.id));
    const allProducts = SheetsService.productos.filter(p => p.stock > 0 && !currentIds.has(p.id));
    const recommended = allProducts
      .sort((a, b) => (b.destacado ? 1 : 0) - (a.destacado ? 1 : 0) || b.stock - a.stock)
      .slice(0, 2);

    if (recommended.length === 0) {
      section.style.display = 'none';
      return;
    }

    grid.innerHTML = recommended.map(p => {
      const precioARS = (typeof PromoEngine !== 'undefined' && PromoEngine.precioVistaARS) ? PromoEngine.precioVistaARS(p) : SheetsService.calcularPrecioARS(p.precioUSD, p);
      return `
        <button class="cart__cross-sell-item" onclick="App.quickAdd('${escJsAttr(p.id)}')" aria-label="Agregar ${escHtml(p.nombre)} - ${SheetsService.formatPrecioARS(precioARS)}">
          <img class="cart__cross-sell-img" src="${escHtml(SheetsService.fotoChica(p.imagen, 200))}" alt="" loading="lazy"
               onerror="this.onerror=null;this.src='data:image/svg+xml;utf8,<svg xmlns=%22http://www.w3.org/2000/svg%22 width=%2256%22 height=%2256%22><rect width=%2256%22 height=%2256%22 fill=%22%23eedbd8%22/></svg>'">
          <div class="cart__cross-sell-info">
            <span class="cart__cross-sell-name">${escHtml(p.nombre)}</span>
            <span class="cart__cross-sell-price">${SheetsService.formatPrecioARS(precioARS)}</span>
          </div>
        </button>
      `;
    }).join('');

    section.style.display = 'block';
  },

  hidePromoShippingCrossSell() {
    const promoForm = document.getElementById('promo-form');
    const promoMsg = document.getElementById('promo-message');
    const shippingRes = document.getElementById('shipping-result');
    const crossSell = document.getElementById('cart-cross-sell');
    const promo = document.getElementById('cart-promo');
    if (promo) promo.classList.remove('cart__promo--open');
    if (promoForm) promoForm.style.display = 'none';
    if (promoMsg) promoMsg.textContent = '';
    if (shippingRes) shippingRes.hidden = true;
    if (crossSell) crossSell.style.display = 'none';
  },

  selectShipping(shippingId) {
    const envio = (CONFIG.envios || []).find(e => e.id === shippingId);
    if (!envio) return;
    CartService.setShipping(envio.id); // save() → listeners → re-render
    this.toggleShippingOptions(false);  // se cierra solo al elegir
  },

  openCart() {
    document.getElementById('cart-overlay')?.classList.add('cart-overlay--open');
    document.getElementById('cart-sidebar')?.classList.add('cart-sidebar--open');
    document.body.classList.add('no-scroll');
  },

  closeCart() {
    document.getElementById('cart-overlay')?.classList.remove('cart-overlay--open');
    document.getElementById('cart-sidebar')?.classList.remove('cart-sidebar--open');
    document.body.classList.remove('no-scroll');
  },

  /** Consulta rápida por WhatsApp con el carrito (sin datos de envío) */
  enviarCarritoWhatsApp() {
    if (CartService.items.length === 0) { this.showToast('El carrito está vacío'); return; }
    CartService.enviarWhatsApp(CartService.getShippingOption(), null);
    this.closeCart();
  },

  /* ---------- CHECKOUT ---------- */
  openCheckout() {
    if (CartService.items.length === 0) { this.showToast('El carrito está vacío'); return; }
    this.closeCart();
    CheckoutService.renderCheckout();
    const m = document.getElementById('checkout-modal');
    if (m) { m.classList.add('modal-overlay--open'); m.setAttribute('aria-hidden', 'false'); }
    document.body.classList.add('no-scroll');
    setTimeout(() => document.getElementById('checkout-nombre')?.focus(), 100);
  },

  closeCheckout() {
    const m = document.getElementById('checkout-modal');
    if (m) { m.classList.remove('modal-overlay--open'); m.setAttribute('aria-hidden', 'true'); }
    document.body.classList.remove('no-scroll');
  },

  /* ---------- SEARCH OVERLAY ---------- */
  toggleSearch() {
    const overlay = document.getElementById('search-overlay');
    if (!overlay) return;
    overlay.classList.toggle('search-overlay--open');
    const btn = document.getElementById('search-btn');
    if (btn) btn.setAttribute('aria-expanded', overlay.classList.contains('search-overlay--open'));
    if (overlay.classList.contains('search-overlay--open')) {
      document.getElementById('search-input')?.focus();
      document.body.classList.add('no-scroll');
    } else {
      document.body.classList.remove('no-scroll');
      const input = document.getElementById('search-input');
      if (input) input.value = '';
      const resultsEl = document.getElementById('search-results');
      if (resultsEl) resultsEl.innerHTML = '';
    }
  },

  handleSearch(query) {
    const resultsEl = document.getElementById('search-results');
    if (!query || query.trim().length < 2) {
      if (resultsEl) resultsEl.innerHTML = '';
      if (query.trim().length === 0) this.aplicarFiltros();
      return;
    }

    const results = SheetsService.buscarProductos(query);

    if (resultsEl && document.getElementById('search-overlay')?.classList.contains('search-overlay--open')) {
      if (results.length === 0) {
        resultsEl.innerHTML = '<div class="search__empty">No se encontraron productos</div>';
        return;
      }
      resultsEl.innerHTML = results.slice(0, 8).map(p => {
        const precioARS = (typeof PromoEngine !== 'undefined' && PromoEngine.precioVistaARS) ? PromoEngine.precioVistaARS(p) : SheetsService.calcularPrecioARS(p.precioUSD);
        return `
          <button class="search__result" onclick="App.toggleSearch(); App.openProductModal('${escJsAttr(p.id)}');" aria-label="${escHtml(p.nombre)} - ${SheetsService.formatPrecioARS(precioARS)}">
            <img class="search__result-img" src="${escHtml(SheetsService.fotoChica(p.imagen, 200))}" alt="" loading="lazy" onerror="this.onerror=null;this.src='data:image/svg+xml;utf8,<svg xmlns=%22http://www.w3.org/2000/svg%22 width=%2248%22 height=%2264%22><rect width=%2248%22 height=%2264%22 fill=%22%23eedbd8%22/></svg>'">
            <div>
              <div class="search__result-name">${escHtml(p.nombre)}</div>
              <div class="search__result-price">${SheetsService.formatPrecioARS(precioARS)}</div>
            </div>
          </button>
        `;
      }).join('');
    } else {
      this.renderProductos(results);
    }
  },

  /* ---------- MOBILE MENU ---------- */
  openMobileMenu() {
    document.getElementById('mobile-menu')?.classList.add('mobile-menu--open');
    document.getElementById('menu-btn')?.setAttribute('aria-expanded', 'true');
    document.body.classList.add('no-scroll');
  },

  closeMobileMenu() {
    document.getElementById('mobile-menu')?.classList.remove('mobile-menu--open');
    document.getElementById('menu-btn')?.setAttribute('aria-expanded', 'false');
    document.body.classList.remove('no-scroll');
  },

  /* ---------- TOAST ---------- */
  showToast(message) {
    const container = document.getElementById('toast-container');
    if (!container) return;
    const toast = document.createElement('div');
    toast.className = 'toast';
    const icon = document.createElement('span');
    icon.setAttribute('aria-hidden', 'true');
    icon.textContent = '✨ ';
    toast.appendChild(icon);
    toast.appendChild(document.createTextNode(String(message ?? '')));
    container.appendChild(toast);
    setTimeout(() => {
      toast.classList.add('toast--out');
      setTimeout(() => toast.remove(), 200);
    }, 2500);
  },

  /* ---------- LOADING ---------- */
  hideLoading() {
    const el = document.getElementById('loading-screen');
    if (el) {
      el.classList.add('loading-screen--hidden');
      setTimeout(() => el.remove(), 500);
    }
  },

  showSkeletons(count = 8) {
    const grid = document.getElementById('productos-grid');
    if (!grid) return;
    const skeleton = Array.from({ length: count }, () => `
      <div class="skeleton-card">
        <div class="skeleton-card__media"></div>
        <div class="skeleton-card__info">
          <div class="skeleton-card__line skeleton-card__line--short"></div>
          <div class="skeleton-card__line skeleton-card__line--med"></div>
          <div class="skeleton-card__line"></div>
        </div>
      </div>
    `).join('');
    grid.innerHTML = skeleton;
  },

  /* ---------- WHATSAPP ---------- */
  setupWhatsAppLink() {
    const btn = document.getElementById('contacto-whatsapp-btn');
    if (btn) { btn.href = CartService.whatsappUrl('¡Hola! Quiero consultar por sus productos.'); btn.rel = 'noopener'; }
    const footerWa = document.getElementById('footer-whatsapp-link');
    if (footerWa) {
      footerWa.href = CartService.whatsappUrl('¡Hola! Quiero hacer una consulta.');
      footerWa.rel = 'noopener';
      footerWa.textContent = '📱 WhatsApp: Escribinos';
    }
    const ig = CONFIG.negocio.instagram;
    const igUrl = ig ? `https://instagram.com/${ig}` : null;

    // Ícono de Instagram
    const footerIg = document.getElementById('footer-instagram');
    if (footerIg) {
      if (igUrl) footerIg.href = igUrl;
      else footerIg.style.display = 'none';
    }

    // Línea de Instagram en la columna de contacto
    const footerIgLink = document.getElementById('footer-instagram-link');
    if (footerIgLink) {
      if (igUrl) {
        footerIgLink.href = igUrl;
        footerIgLink.textContent = `📸 Instagram: @${ig}`;
      } else {
        footerIgLink.parentElement?.remove();
      }
    }

    // Facebook: solo si está cargado en la config
    const footerFb = document.getElementById('footer-facebook');
    if (footerFb) {
      if (CONFIG.negocio.facebook) footerFb.href = CONFIG.negocio.facebook;
      else footerFb.style.display = 'none';
    }

    // Frase del perfil
    const tagline = document.getElementById('footer-tagline');
    const frase = CONFIG.contenido?.footer?.frase || CONFIG.negocio.tagline;
    if (tagline && frase) tagline.textContent = frase;

    this.renderFooterCats();
  },

  /* ---------- FOOTER CATEGORÍAS ---------- */
  renderFooterCats() {
    const el = document.getElementById('footer-cats');
    if (!el) return;
    const cats = SheetsService.obtenerCategoriasConConteo().slice(0, 6);
    el.innerHTML = cats.map(cat => `
      <li><a href="#productos" class="footer__link" onclick="App.filtrarCategoria('${escJsAttr(cat.id)}'); App.scrollToProducts(); return false;">${escHtml(cat.nombre)}</a></li>
    `).join('');
  },

  /* ---------- NEWSLETTER ---------- */
  /**
   * Sin planilla conectada, el mail quedaba guardado solo en el navegador
   * de la clienta (nunca te llegaba). Ahora la sección se oculta hasta que
   * el Apps Script esté configurado.
   */
  setupNewsletter() {
    const sec = document.getElementById('newsletter');
    if (sec) sec.style.display = (SheetsService.appsScriptUrl && this._newsletterVisible !== false) ? '' : 'none';
  },

  async subscribeNewsletter(e) {
    e.preventDefault();
    const input = document.getElementById('newsletter-email');
    const msg = document.getElementById('newsletter-msg');
    const btn = e.target.querySelector('button[type="submit"]');
    const email = input?.value.trim();
    const setMsg = (t, ok) => { if (msg) { msg.textContent = t; msg.className = 'newsletter__msg newsletter__msg--' + (ok ? 'success' : 'error'); } };
    if (!email || email.length > 100 || !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) {
      setMsg('Ingresá un correo válido.', false);
      return;
    }
    if (e.target.querySelector('.hp-field input')?.value) return; // bot
    if (btn) btn.disabled = true;
    try {
      await SheetsService.postToAppsScript('subscribe_newsletter', { email });
      setMsg('¡Gracias por suscribirte! Te avisaremos de las novedades. 💕', true);
      if (input) input.value = '';
    } catch (err) {
      setMsg('No pudimos registrarte ahora. Probá de nuevo en un rato.', false);
    } finally {
      if (btn) btn.disabled = false;
    }
  },

  /* ---------- CONTADORES DE STOCK (filtros) ---------- */
  renderStockCounts() {
    const prods = SheetsService.productos || [];
    const set = (id, n) => { const el = document.getElementById(id); if (el) el.textContent = n; };
    set('stock-count-all', prods.length);
    set('stock-count-in', prods.filter(p => p.stock > 0).length);
    set('stock-count-out', prods.filter(p => p.stock <= 0).length);
  },

  /* ---------- CONTENIDO EDITABLE (categorías + frases) ---------- */
  /** ¿La tienda se está viendo dentro de la vista previa del admin? */
  esPreview() {
    return new URLSearchParams(location.search).get('preview') === '1';
  },

  /**
   * Cambios guardados desde el admin en ESTE navegador (vista previa de la
   * dueña). Para las clientas, los cambios llegan desde la planilla
   * (SheetsService.cargarConfigPublica).
   */
  applyCustomConfig() {
    const leer = (k) => { try { return JSON.parse(localStorage.getItem(k) || 'null'); } catch { return null; } };
    try {
      const cats = leer('pl_admin_categorias');
      if (Array.isArray(cats) && cats.length) CONFIG.categorias = cats;
      const obj = leer('pl_admin_contenido');
      if (obj && typeof obj === 'object') {
        const base = CONFIG.contenido || {};
        const merged = { ...base, ...obj };
        // objetos de primer nivel: mezcla para no perder campos por defecto
        ['showcase', 'servicios', 'promoBand', 'cta', 'newsletter', 'footer', 'productos', 'secciones', 'clubPrince'].forEach(k => {
          if (obj[k] && typeof obj[k] === 'object' && !Array.isArray(obj[k])) merged[k] = { ...(base[k] || {}), ...obj[k] };
        });
        CONFIG.contenido = merged;
      }
      const envios = leer('pl_admin_envios');
      if (Array.isArray(envios) && envios.length) CONFIG.envios = envios;
      const set = leer('pl_admin_settings');
      if (set && typeof set === 'object') {
        const wa = String(set.whatsapp || '').replace(/\D/g, '');
        if (wa.length >= 10) CONFIG.negocio.whatsapp = wa;
        if (set.instagram) CONFIG.negocio.instagram = String(set.instagram).replace(/^@/, '');
        if (set.nombre) CONFIG.negocio.nombre = set.nombre;
      }
    } catch (e) { console.warn('[App] custom config', e); }
    if (this.esPreview()) document.documentElement.classList.add('is-preview');
  },

  renderContenidoCustom() {
    const c = CONFIG.contenido; if (!c) return;
    try {
      // Secciones visibles u ocultas (Admin > Página principal)
      const vis = { promoBar: true, hero: true, club: true, showcase: true, servicios: true, promoBand: true, cta: true, newsletter: true, ...(c.secciones || {}) };
      const mostrar = (sel, on) => document.querySelectorAll(sel).forEach(el => { el.hidden = !on; el.classList.toggle('is-hidden-by-admin', !on); });
      mostrar('.promo-bar', vis.promoBar !== false);
      mostrar('#hero', vis.hero !== false);
      mostrar('#club-prince, [data-club-link]', vis.club !== false);
      mostrar('#categories', vis.showcase !== false);
      mostrar('#servicios', vis.servicios !== false);
      mostrar('#promo-band', vis.promoBand !== false);
      mostrar('#contacto', vis.cta !== false);
      this._newsletterVisible = vis.newsletter !== false;

      // Promo bar (hasta 3 frases; las vacías se ocultan)
      if (c.promoBar && Array.isArray(c.promoBar)) {
        const frases = c.promoBar.map(t => String(t || '').trim()).filter(Boolean);
        const slides = document.querySelectorAll('.promo-bar__slide');
        const dots = document.querySelectorAll('.promo-bar__dot');
        slides.forEach((sl, i) => { sl.textContent = frases[i] || ''; sl.hidden = !frases[i]; });
        dots.forEach((d, i) => { d.hidden = !frases[i + 1]; });
        if (!frases.length) mostrar('.promo-bar', false);
      }
      // Hero (3 slides)
      if (c.hero && Array.isArray(c.hero)) {
        const slides = document.querySelectorAll('.hero__slide');
        c.hero.forEach((h, i) => {
          const s = slides[i]; if (!s) return;
          const kicker = s.querySelector('.hero__kicker'); if (kicker && h.kicker) kicker.textContent = h.kicker;
          const title = s.querySelector('.hero__title'); if (title && h.title) title.textContent = h.title;
          const desc = s.querySelector('.hero__desc'); if (desc && h.desc) desc.textContent = h.desc;
          const cta = s.querySelector('.hero__cta'); if (cta) { if (h.cta) cta.textContent = h.cta; if (h.categoria) cta.setAttribute('onclick', `App.filtrarCategoria('${String(h.categoria).replace(/[^a-z0-9:-]/gi, '')}'); scrollToProducts(); return false;`); }
          const img = s.querySelector('.hero__media img'); if (img && h.image && /^(https:|assets\/|data:image\/)/.test(h.image)) img.src = h.image;
        });
      }
      // Showcase
      if (c.showcase) {
        const kicker = document.querySelector('.cat-showcase .sec-head__kicker'); if (kicker && c.showcase.kicker) kicker.textContent = c.showcase.kicker;
        const title = document.querySelector('.cat-showcase .sec-head__title'); if (title && c.showcase.title) title.textContent = c.showcase.title;
      }
      // Servicios
      if (c.servicios) {
        const sk = document.querySelector('.services .sec-head__kicker'); if (sk && c.servicios.kicker) sk.textContent = c.servicios.kicker;
        const st = document.querySelector('.services .sec-head__title'); if (st && c.servicios.title) st.textContent = c.servicios.title;
        if (c.servicios.items) {
          const cards = document.querySelectorAll('.service-card');
          c.servicios.items.forEach((it, i) => {
            const card = cards[i]; if (!card) return;
            const ic = card.querySelector('.service-card__icon'); if (ic && it.icon) ic.textContent = it.icon;
            const ti = card.querySelector('.service-card__title'); if (ti && it.title) ti.textContent = it.title;
            const de = card.querySelector('.service-card__desc'); if (de && it.desc) de.textContent = it.desc;
          });
        }
      }
      // Promo band
      if (c.promoBand) {
        const pk = document.querySelector('.promo-band__kicker'); if (pk && c.promoBand.kicker) pk.textContent = c.promoBand.kicker;
        const pt = document.querySelector('.promo-band__title'); if (pt && c.promoBand.title) pt.textContent = c.promoBand.title;
        const pd = document.querySelector('.promo-band__desc'); if (pd && c.promoBand.desc) pd.textContent = c.promoBand.desc;
        const pc = document.querySelector('.promo-band__cta'); if (pc) { if (c.promoBand.cta) pc.textContent = c.promoBand.cta; if (c.promoBand.categoria) pc.setAttribute('onclick', `App.filtrarCategoria('${String(c.promoBand.categoria).replace(/[^a-z0-9:-]/gi, '')}'); scrollToProducts(); return false;`); }
        const pi = document.querySelector('.promo-band__img img'); if (pi && c.promoBand.image && /^(https:|assets\/|data:image\/)/.test(c.promoBand.image)) pi.src = c.promoBand.image;
      }
      // CTA
      if (c.cta) {
        const ct = document.querySelector('.cta__title'); if (ct && c.cta.title) ct.textContent = c.cta.title;
        const cd = document.querySelector('.cta__desc'); if (cd && c.cta.desc) cd.textContent = c.cta.desc;
        const cb = document.querySelector('.cta__btn'); if (cb) { if (c.cta.btn) cb.lastChild.textContent = ' ' + c.cta.btn; const ic = cb.querySelector('span'); if (ic && c.cta.icon) ic.textContent = c.cta.icon; }
      }
      // Newsletter
      if (c.newsletter) {
        const nt = document.querySelector('.newsletter__title'); if (nt && c.newsletter.title) nt.textContent = c.newsletter.title;
        const nd = document.querySelector('.newsletter__desc'); if (nd && c.newsletter.desc) nd.textContent = c.newsletter.desc;
        const nb = document.querySelector('.newsletter__btn'); if (nb && c.newsletter.btn) nb.textContent = c.newsletter.btn;
        const ni = document.querySelector('.newsletter__input'); if (ni && c.newsletter.placeholder) ni.placeholder = c.newsletter.placeholder;
      }
      // Catálogo: encabezado
      if (c.productos) {
        const pk = document.getElementById('productos-kicker'); if (pk && c.productos.kicker) pk.textContent = c.productos.kicker;
        const pt = document.getElementById('productos-title'); if (pt && c.productos.title && this.categoriaActual === 'todos') pt.textContent = c.productos.title;
      }
      // Footer: descripción, frase, ubicación, envíos
      if (c.footer?.tagline) { const ft = document.querySelector('.footer__tagline'); if (ft) ft.textContent = c.footer.tagline; }
      if (c.footer?.direccion) { const fd = document.getElementById('footer-direccion'); if (fd) fd.textContent = '📍 ' + c.footer.direccion; }
      if (c.footer?.enviosTexto) { const fe = document.getElementById('footer-envios-texto'); if (fe) fe.textContent = '🚚 ' + c.footer.enviosTexto; }
      const fl = document.getElementById('footer-envios');
      if (fl && Array.isArray(CONFIG.envios)) {
        fl.innerHTML = CONFIG.envios.filter(e => e.activo !== false).map(e => `<li><span class="footer__link">${escHtml(e.nombre)}${e.descripcion ? ` <small>(${escHtml(e.descripcion)})</small>` : ''}</span></li>`).join('');
      }
    } catch (e) { console.warn('[App] renderContenidoCustom', e); }
  },

  renderMegaMenu() {
    const nav = document.getElementById('mega-mujer'); if (!nav) return;
    const cats = (typeof AdminData !== 'undefined' && AdminData.getEffectiveCategorias) ? AdminData.getEffectiveCategorias() : (CONFIG.categorias || []);
    // Agrupar sin distinguir mayúsculas ni espacios ("Lenceria" = "lenceria ").
    // Antes solo se mostraban los 2 primeros grupos: el resto no aparecía nunca.
    const grouped = new Map();
    cats.forEach(c => {
      if (c.id === 'todos') return;
      const nombreGrupo = String(c.grupo || '').trim() || 'Otros';
      const clave = nombreGrupo.toLocaleLowerCase('es').normalize('NFD').replace(/[\u0300-\u036f]/g, '');
      if (!grouped.has(clave)) grouped.set(clave, { nombre: nombreGrupo, cats: [] });
      grouped.get(clave).cats.push(c);
    });
    let html = '';
    grouped.forEach(({ nombre: grupo, cats: lista }) => {
      const idGrupo = 'grupo:' + SheetsService.slugCategoria(grupo);
      html += `<div class="mega-menu__col"><h4 class="mega-menu__heading"><a href="#productos" onclick="App.filtrarCategoria('${escJsAttr(idGrupo)}')">${escHtml(grupo)}</a></h4>`;
      lista.forEach(cat => {
        // Una categoría que se llama igual que su grupo ("Pijamas" en "Pijamas") se muestra como "Ver todo"
        const nombre = String(cat.nombre || '').trim();
        const mismo = SheetsService.slugCategoria(nombre) === SheetsService.slugCategoria(grupo);
        const texto = mismo ? 'Ver todo' : (cat.icon ? escHtml(cat.icon) + ' ' : '') + escHtml(nombre);
        html += `<a href="#productos" class="mega-menu__link${mismo ? ' mega-menu__link--all' : ''}" onclick="App.filtrarCategoria('${escJsAttr(cat.id)}')">${texto}</a>`;
      });
      html += `</div>`;
    });
    // Columna promo (ofertas u última)
    const hayOfertas = SheetsService.filtrarPorCategoria('ofertas').length > 0;
    const promoCat = hayOfertas ? { id: 'ofertas', nombre: 'Ofertas' } : { id: 'todos', nombre: 'Ver todo' };
    html += `<div class="mega-menu__col mega-menu__col--promo"><a href="#productos" class="mega-menu__promo" onclick="App.filtrarCategoria('${escJsAttr(promoCat.id)}')"><img src="assets/conjunto-deportivo-borgona.jpg" alt=""><span class="mega-menu__promo-label">${escHtml(promoCat.id === 'todos' ? 'Ver todo' : promoCat.nombre)}</span></a></div>`;
    nav.innerHTML = html;
  },

  renderShowcase() {
    const grid = document.querySelector('.cat-showcase__grid'); if (!grid) return;
    const cont = CONFIG.contenido?.showcase;
    const todas = cont?.cards || [];
    if (!todas.length) return;
    // Las tarjetas marcadas como ocultas no se muestran; la grilla se adapta a las que quedan
    const cards = todas.filter(c => c && String(c.oculta || '') !== '1' && (String(c.title || '').trim() || c.image));
    grid.className = 'cat-showcase__grid cat-showcase__grid--n' + cards.length;
    const seccion = document.getElementById('categories');
    if (!cards.length) { grid.innerHTML = ''; if (seccion) seccion.hidden = true; return; }
    grid.innerHTML = cards.map((card, idx) => {
      const large = idx === 0 && cards.length >= 3 ? ' cat-card--large' : '';
      const cat = card.categoria || 'todos';
      const safeImg = card.image && /^(https:|assets\/|data:image\/)/.test(card.image) ? card.image : '';
      const img = safeImg || 'data:image/svg+xml;utf8,' + encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="600" height="700"><rect width="600" height="700" fill="#eedbd8"/><text x="50%" y="50%" text-anchor="middle" dy=".3em" fill="#9c684c" font-size="20">${escHtml(card.title)}</text></svg>`);
      const icon = card.icon ? `<span class="cat-card__icon" aria-hidden="true">${escHtml(card.icon)}</span>` : '';
      return `<a href="#productos" class="cat-card${large} is-revealed" onclick="App.filtrarCategoria('${escJsAttr(cat)}'); ComponentReveal.scrollToProducts(); return false;"><img src="${escHtml(img)}" alt="${escHtml(card.title)}" loading="lazy"><div class="cat-card__overlay">${icon}<h3 class="cat-card__title">${escHtml(card.title)}</h3><span class="cat-card__link-under">Comprar →</span></div></a>`;
    }).join('');
  },

  renderServicios() { /* ya manejado en renderContenidoCustom */ },
};

/* ============================================
   EVENT LISTENERS
   ============================================ */
document.addEventListener('DOMContentLoaded', () => App.init());

document.addEventListener('click', (e) => {
  /* Quick-add from product card */
  const quickBtn = e.target.closest('.product-card__quick');
  if (quickBtn) {
    if (quickBtn.disabled) return;
    App.quickAdd(quickBtn.dataset.id);
    return;
  }

  /* Search */
  if (e.target.closest('#search-btn')) { App.toggleSearch(); return; }

  /* Cart open/close */
  if (e.target.closest('#cart-btn')) { App.openCart(); return; }
  if (e.target.id === 'cart-overlay' || e.target.closest('.cart__close')) { App.closeCart(); return; }

  /* Checkout close */
  if (e.target.id === 'checkout-modal' || e.target.closest('.modal__close')) { App.closeCheckout(); return; }

  /* Mobile menu */
  if (e.target.closest('#menu-btn')) { App.openMobileMenu(); return; }

  /* Promo toggle: lo maneja el onclick del botón (antes se ejecutaba dos
     veces —onclick + este listener— y el formulario de cupón nunca abría) */
  if (e.target.closest('.cart__promo-toggle')) return;

  /* Promo form submit */
  if (e.target.closest('#promo-form')) { return; } // handled by onsubmit

  /* Shipping form submit */
  if (e.target.closest('#shipping-form')) { return; } // handled by onsubmit

  /* Shipping option selection */
  const shippingOpt = e.target.closest('.cart__shipping-option[data-shipping]');
  if (shippingOpt) {
    App.selectShipping(shippingOpt.dataset.shipping);
    return;
  }

  /* Cross-sell add */
  if (e.target.closest('.cart__cross-sell-item')) { return; } // handled by onclick

  /* Cart qty */
  if (e.target.closest('.qty-btn')) {
    const btn = e.target.closest('.qty-btn');
    const id = btn.dataset.id;
    const action = btn.dataset.action;
    const item = CartService.items.find(i => (i.key === id || i.id === id));
    if (item) {
      if (action === 'plus') CartService.updateQuantity(id, item.cantidad + 1);
      else if (action === 'minus') CartService.updateQuantity(id, item.cantidad - 1);
    }
    return;
  }

  /* Cart remove */
  if (e.target.closest('.cart-item__remove')) {
    const id = e.target.closest('.cart-item__remove').dataset.id;
    const itemEl = document.querySelector(`.cart-item[data-id="${CSS.escape(id)}"]`);
    if (itemEl) itemEl.classList.add('cart-item--removing');
    setTimeout(() => CartService.removeItem(id), 200);
    return;
  }
});

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    App.closeCart();
    App.closeCheckout();
    App.closeMobileMenu();
    App.closeSidebar();
    App.closeProductModal();
    if (typeof ClubPrince !== 'undefined') ClubPrince.closeBoxModal();
    const so = document.getElementById('search-overlay');
    if (so?.classList.contains('search-overlay--open')) App.toggleSearch();
  }
});