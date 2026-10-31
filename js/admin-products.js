/* ============================================
   ADMIN PRODUCTS - CRUD de Productos COMPLETO
   ============================================ */

const AdminProducts = {
  /**
   * Interpreta un precio en pesos como lo escribe alguien en Argentina:
   * "16000", "16.000", "$16.000", "16.000,50", "16 000" → 16000 (redondeado).
   * Antes el campo era type="number" y "16.000" se guardaba como 16.
   */
  parseARS(valor) {
    let t = String(valor ?? '').trim().replace(/[$\s]|ARS/gi, '');
    if (!t) return null;
    if (t.includes(',')) {
      t = t.replace(/\./g, '').replace(',', '.');      // 16.000,50 → 16000.50
    } else if (/^\d{1,3}(\.\d{3})+$/.test(t)) {
      t = t.replace(/\./g, '');                         // 16.000 / 1.250.000
    }
    const n = Number(t);
    return Number.isFinite(n) && n > 0 ? Math.round(n) : null;
  },

  /** Costo en dólares: "12,50" · "12.50" · "USD 12" → 12.5 (en pesos usa parseARS) */
  parseCosto(valor, moneda) {
    if (moneda === 'ARS') return this.parseARS(valor);
    let t = String(valor ?? '').trim().replace(/[$\s]|USD|U\$S|US\$/gi, '');
    if (!t) return null;
    if (/^\d{1,3}(\.\d{3})+(,\d+)?$/.test(t)) t = t.replace(/\./g, '');  // 1.250,50
    t = t.replace(',', '.');
    const n = Number(t);
    return Number.isFinite(n) && n > 0 ? Math.round(n * 100) / 100 : null;
  },

  /** Ganancia % general (Configuración), ej. 30 */
  gananciaGlobalPct() {
    return Math.round(((Number(CONFIG?.cotizacion?.margenGanancia) || 1.3) - 1) * 100);
  },

  /** Lo que hay escrito en Precios: moneda, costo, ganancia y el precio que sale */
  leerCostoForm() {
    const moneda = document.getElementById('pf-costo-moneda')?.value === 'ARS' ? 'ARS' : 'USD';
    const raw = document.getElementById('pf-preciousd')?.value || '';
    const costo = this.parseCosto(raw, moneda);
    const gRaw = document.getElementById('pf-ganancia')?.value ?? '';
    const gananciaPct = gRaw.trim() === '' ? null : Math.max(0, Number(gRaw) || 0);
    const precio = costo ? SheetsService.precioDesdeCosto({ moneda, costo, gananciaPct: gananciaPct ?? this.gananciaGlobalPct() }) : 0;
    return { moneda, raw, costo, gananciaPct, precio };
  },

  /** Recuadro "Precio de venta: $16.000" con la cuenta */
  actualizarPrecioCalculado() {
    const box = document.getElementById('pf-precio-calculado');
    const { moneda, raw, costo, gananciaPct, precio } = this.leerCostoForm();
    const lbl = document.getElementById('pf-costo-label');
    const hint = document.getElementById('pf-costo-hint');
    const inp = document.getElementById('pf-preciousd');
    if (lbl) lbl.textContent = moneda === 'ARS' ? 'Lo que te costó (en pesos) *' : 'Lo que te costó (USD) *';
    if (inp) inp.placeholder = moneda === 'ARS' ? 'Ej: 10.000' : 'Ej: 12,50';
    if (hint) hint.textContent = moneda === 'ARS' ? 'Precio de compra de una unidad, en pesos' : 'Precio de compra de una unidad, en dólares';
    const gHint = document.getElementById('pf-ganancia-hint');
    if (gHint) gHint.textContent = `Vacío = la general (${this.gananciaGlobalPct()}%)`;
    if (!box) return;
    if (raw.trim() && !costo) { box.className = 'precio-calculado precio-calculado--error'; box.textContent = 'Revisá el costo: escribí solo el número'; return; }
    if (!costo) { box.className = 'precio-calculado'; box.innerHTML = ''; return; }
    const g = gananciaPct ?? this.gananciaGlobalPct();
    const dolar = SheetsService.cotizacionDolar || CONFIG.cotizacion.cotizacionManual;
    const costoARS = moneda === 'ARS' ? costo : Math.round(costo * dolar);
    const sinRedondeo = Math.round(costoARS * (1 + g / 100));
    const manual = this.parseARS(document.getElementById('pf-precio-ars-manual')?.value);
    const red = Number(CONFIG?.cotizacion?.redondeo) || 0;
    const pasos = [
      moneda === 'USD' ? `USD ${costo.toLocaleString('es-AR')} × dólar ${AdminData.formatARS(dolar)} = ${AdminData.formatARS(costoARS)}` : `Costo ${AdminData.formatARS(costoARS)}`,
      `+ ${g}% de ganancia = ${AdminData.formatARS(sinRedondeo)}`,
      red && precio !== sinRedondeo ? `redondeado a ${AdminData.formatARS(precio)}` : '',
    ].filter(Boolean).join(' → ');
    box.className = 'precio-calculado' + (manual ? ' precio-calculado--tachado' : '');
    box.innerHTML = `
      <div class="precio-calculado__monto">Precio de venta: <strong>${AdminData.formatARS(precio)}</strong></div>
      <div class="precio-calculado__cuenta">${this.esc(pasos)}</div>
      <div class="precio-calculado__nota">${manual ? `Vas a usar el precio a mano (${AdminData.formatARS(manual)}): ganás ${AdminData.formatARS(manual - costoARS)} por unidad.`
        : `Ganás ${AdminData.formatARS(precio - costoARS)} por unidad.${moneda === 'USD' ? ' Se actualiza solo cuando cambia el dólar.' : ''}`}</div>`;
  },

  formatInputARS(n) {
    return n ? new Intl.NumberFormat('es-AR', { maximumFractionDigits: 0 }).format(n) : '';
  },

  /** Muestra debajo del campo cómo va a quedar el precio en la tienda */
  updateARSPreview(input) {
    const prev = document.querySelector(`.ars-preview[data-for="${input.id}"]`);
    if (!prev) return;
    const raw = input.value.trim();
    const n = this.parseARS(raw);
    prev.classList.toggle('ars-preview--error', !!raw && !n);
    prev.textContent = !raw ? '' : (n ? `En la tienda se ve: ${AdminData.formatARS(n)}` : 'Número no válido');
  },

  searchQuery: '',
  filterCategory: '',
  variantRowId: 0,
  galleryRowId: 0,
  specRowId: 0,
  currentEditId: null,

  esc(s) { return escHtml(s); },
  _tabsListos: false,

  render() {
    this.populateCategories();
    this.initTabs();
    this.renderTable();
  },

  populateCategories() {
    const select = document.getElementById('products-filter-cat');
    const formSelect = document.getElementById('pf-categoria');
    const cats = CONFIG.categorias.filter(c => c.id !== 'todos');

    [select, formSelect].forEach(sel => {
      if (!sel) return;
      const currentVal = sel.value;
      if (sel === select) {
        sel.innerHTML = '<option value="">Todas las categorías</option>';
      } else {
        sel.innerHTML = '<option value="">Seleccionar...</option>';
      }
      cats.forEach(c => {
        sel.innerHTML += `<option value="${escHtml(c.id)}">${escHtml(c.icon || '')} ${escHtml(c.nombre)}</option>`;
      });
      sel.value = currentVal;
    });
  },

  initTabs() {
    if (this._tabsListos) return; // antes sumaba listeners cada vez que entrabas a Productos
    this._tabsListos = true;
    const tabs = document.querySelectorAll('#product-modal .form-tab');
    tabs.forEach(tab => {
      tab.addEventListener('click', () => {
        tabs.forEach(t => { t.classList.remove('active'); t.setAttribute('aria-selected', 'false'); });
        tab.classList.add('active');
        tab.setAttribute('aria-selected', 'true');
        const tabId = tab.dataset.tab;
        document.querySelectorAll('.form-tab-panel').forEach(p => p.classList.remove('active'));
        document.getElementById('tab-' + tabId).classList.add('active');
      });
    });

    ['pf-costo-moneda', 'pf-preciousd', 'pf-ganancia', 'pf-precio-ars-manual'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.addEventListener(el.tagName === 'SELECT' ? 'change' : 'input', () => this.actualizarPrecioCalculado());
    });
    const comboPrecio = document.getElementById('pf-combo-precio');
    if (comboPrecio) comboPrecio.addEventListener('input', () => this.comboResumen());

    // Live preview for main image
    const imgInput = document.getElementById('pf-imagen');
    document.querySelectorAll('#product-modal .input-ars').forEach(inp => {
      if (inp.dataset.arsBound) return;
      inp.dataset.arsBound = '1';
      inp.addEventListener('input', () => this.updateARSPreview(inp));
    });
    if (imgInput) {
      imgInput.addEventListener('input', () => this.updateImagePreview(imgInput.value));
      if (typeof AdminImages !== 'undefined') AdminImages.attach(imgInput);
    }
  },

  updateImagePreview(url) {
    const preview = document.getElementById('pf-imagen-preview');
    const img = document.getElementById('pf-imagen-preview-img');
    if (preview && img) {
      if (url && (url.startsWith('http') || url.startsWith('data:'))) {
        img.src = url;
        preview.style.display = 'block';
      } else {
        preview.style.display = 'none';
      }
    }
  },

  getFiltered() {
    let products = AdminData.getProducts();

    if (this.searchQuery) {
      const q = this.searchQuery.toLowerCase();
      products = products.filter(p =>
        (p.nombre || '').toLowerCase().includes(q) ||
        (p.descripcion || '').toLowerCase().includes(q) ||
        (p.categoria || '').toLowerCase().includes(q) ||
        (p.sku || '').toLowerCase().includes(q)
      );
    }

    if (this.filterCategory) {
      products = products.filter(p => p.categoria === this.filterCategory);
    }

    return products.sort((a, b) => new Date(b.fechaModificacion || 0) - new Date(a.fechaModificacion || 0));
  },

  renderTable() {
    const products = this.getFiltered();
    const tbody = document.getElementById('products-tbody');
    const empty = document.getElementById('products-empty');
    const table = document.getElementById('products-table');

    if (products.length === 0) {
      if (table) table.style.display = 'none';
      if (empty) empty.style.display = 'block';
      return;
    }

    if (table) table.style.display = '';
    if (empty) empty.style.display = 'none';

    tbody.innerHTML = products.map(p => {
      const precioARS = AdminData.precioVentaARS(p);
      const costoTxt = p.costoMoneda === 'ARS' && Number(p.costoARS) > 0 ? AdminData.formatARS(p.costoARS)
        : (Number(p.precioUSD) > 0 ? AdminData.formatUSD(p.precioUSD) : '');
      const gan = p.gananciaPct != null && p.gananciaPct !== '' ? Number(p.gananciaPct) : null;
      // Mismo criterio que las alertas del Inicio: "stock bajo" es 3 o menos
      const stockClass = p.stock <= 3 ? 'badge-low-stock' : 'badge-active';
      const stockLabel = p.stock <= 0 ? 'Sin stock' : p.stock <= 5 ? `${p.stock} u.` : `${p.stock} u.`;
      const hasVariants = p.variantes && p.variantes.length > 0;
      const variantStock = hasVariants ? p.variantes.reduce((s, v) => s + (v.stock || 0), 0) : p.stock;

      return `
        <tr>
          <td>
            <img class="product-thumb" src="${this.esc(p.imagen || '')}" alt="${this.esc(p.nombre)}"
                 onerror="this.onerror=null;this.src='data:image/svg+xml;utf8,<svg xmlns=%22http://www.w3.org/2000/svg%22 width=%2250%22 height=%2250%22><rect width=%2250%22 height=%2250%22 fill=%22%23F8D0DC%22/></svg>'">
          </td>
          <td>
            <div class="product-name-cell">
              <div class="product-name">${this.esc(p.nombre)}</div>
              ${p.sku ? `<div class="product-sku">SKU: ${this.esc(p.sku)}</div>` : ''}
            </div>
            ${p.tags && p.tags.includes('nuevo') ? ' <span class="badge badge-new">Nuevo</span>' : ''}
            ${p.tags && p.tags.includes('oferta') ? ' <span class="badge" style="background:#F59E0B;color:white;">Oferta</span>' : ''}
            ${p.destacado ? ' <span class="badge badge-active">⭐ Destacado</span>' : ''}
            <div><button class="btn btn-sm btn-vender" onclick="AdminProducts.vender('${escJsAttr(p.id)}')" title="Registrar una venta" aria-label="Registrar venta de ${this.esc(p.nombre)}">🛒 Vender</button></div>
          </td>
          <td>${this.esc(p.categoriaOriginal || p.categoria || '-')}</td>
          <td>${costoTxt || '<span style="color:var(--texto-secundario);">—</span>'}${gan != null ? `<br><small style="color:var(--texto-secundario);">+${gan}%</small>` : ''}</td>
          <td>${AdminData.formatARS(p.precioARSManual || SheetsService.calcularPrecioARS(p.precioUSD, p) || precioARS)}${p.precioOferta ? ` <span class="badge" style="background:#F59E0B;color:white;">Oferta: ${AdminData.formatARS(p.precioOferta)}</span>` : ''}${this.combosDelProducto(p.id).some(c => c.activo !== false) ? ' <span class="badge" style="background:#EC4899;color:white;">🎁 Combo</span>' : ''}</td>
          <td>
            ${hasVariants ? `
              <div style="display:flex; flex-direction:column; gap:2px;">
                <span class="badge ${variantStock <= 3 ? 'badge-low-stock' : 'badge-active'}">${variantStock <= 0 ? 'Sin stock' : variantStock + ' u.'}</span>
                <small style="color:var(--texto-secundario);">${this.esc(p.variantes.map(v => [v.talle, v.color].filter(Boolean).join(' ')).filter(Boolean).slice(0, 4).join(', '))}${p.variantes.length > 4 ? '…' : ''}</small>
              </div>
            ` : `<span class="badge ${stockClass}">${stockLabel}</span>`}
          </td>
          <td><span class="badge ${p.activo ? 'badge-active' : 'badge-inactive'}">${p.activo ? 'Activo' : 'Inactivo'}</span></td>
          <td>
            <div class="table-actions">
              <button class="btn btn-sm btn-secondary" onclick="AdminProducts.openForm('${escJsAttr(p.id)}')" title="Editar" aria-label="Editar ${this.esc(p.nombre)}">✏️</button>
              <button class="btn btn-sm btn-danger" onclick="AdminProducts.delete('${escJsAttr(p.id)}')" title="Eliminar" aria-label="Eliminar ${this.esc(p.nombre)}">🗑️</button>
            </div>
          </td>
        </tr>
      `;
    }).join('');
  },

  search(query) {
    this.searchQuery = query;
    this.renderTable();
  },

  filterByCategory(cat) {
    this.filterCategory = cat;
    this.renderTable();
  },

  openForm(id) {
    this.currentEditId = id || null;
    this.populateCategories();
    this.resetForm();
    this.initDynamicSections();

    const modal = document.getElementById('product-modal');
    const title = document.getElementById('product-modal-title');

    if (id) {
      const p = AdminData.getProduct(id);
      if (!p) return;
      title.textContent = 'Editar Producto';
      this.fillForm(p);
    } else {
      title.textContent = 'Nuevo Producto';
    }

    // Reset to first tab
    document.querySelectorAll('.form-tab').forEach(t => { t.classList.remove('active'); t.setAttribute('aria-selected', 'false'); });
    document.querySelectorAll('.form-tab-panel').forEach(p => p.classList.remove('active'));
    document.querySelector('.form-tab[data-tab="basico"]').classList.add('active');
    document.querySelector('.form-tab[data-tab="basico"]').setAttribute('aria-selected', 'true');
    document.getElementById('tab-basico').classList.add('active');

    modal.classList.add('open');
  },

  resetForm() {
    const form = document.getElementById('product-form');
    if (form) form.reset();
    document.getElementById('pf-id').value = '';
    document.getElementById('pf-activo').checked = true;
    document.getElementById('pf-destacado').checked = false;
    document.getElementById('pf-solo-web').checked = false;
    document.getElementById('pf-stock').value = 0;
    document.getElementById('pf-stock-min').value = 5;
    document.getElementById('pf-costo-moneda').value = 'USD';
    document.getElementById('pf-preciousd').value = '';
    document.getElementById('pf-ganancia').value = '';
    this.actualizarPrecioCalculado();
    this.comboCerrar();
    this.renderCombos();
    
    // Clear dynamic sections
    document.getElementById('variantes-container').innerHTML = '';
    document.getElementById('gallery-container').innerHTML = '';
    document.getElementById('specs-container').innerHTML = '';
    
    this.variantRowId = 0;
    this.galleryRowId = 0;
    this.specRowId = 0;
    
    this.updateImagePreview('');
  },

  fillForm(p) {
    document.getElementById('pf-id').value = p.id;
    document.getElementById('pf-nombre').value = p.nombre || '';
    document.getElementById('pf-categoria').value = p.categoria || '';
    document.getElementById('pf-subcategoria').value = p.subcategoria || '';
    document.getElementById('pf-sku').value = p.sku || '';
    const moneda = p.costoMoneda === 'ARS' ? 'ARS' : 'USD';
    document.getElementById('pf-costo-moneda').value = moneda;
    document.getElementById('pf-preciousd').value = moneda === 'ARS'
      ? this.formatInputARS(p.costoARS)
      : (Number(p.precioUSD) > 0 ? String(p.precioUSD).replace('.', ',') : '');
    // Ganancia: la nueva (%) o la vieja "margen personalizado"
    const m = Number(p.margenPersonalizado);
    const g = p.gananciaPct != null && p.gananciaPct !== '' ? Number(p.gananciaPct)
      : (m > 0 ? Math.round((m >= 1 ? m - 1 : m) * 100) : '');
    document.getElementById('pf-ganancia').value = g === '' ? '' : g;
    // Con costo en pesos, el precio calculado se guarda como precio fijo:
    // solo se muestra en "a mano" si es distinto del calculado
    let manual = p.precioARSManual;
    if (moneda === 'ARS' && manual && Number(p.costoARS) > 0) {
      const calc = SheetsService.precioDesdeCosto({ moneda, costo: p.costoARS, gananciaPct: g === '' ? this.gananciaGlobalPct() : g });
      if (Math.round(manual) === calc) manual = null;
    }
    document.getElementById('pf-precio-ars-manual').value = this.formatInputARS(manual);
    document.getElementById('pf-precio-oferta').value = this.formatInputARS(p.precioOferta);
    document.querySelectorAll('#product-modal .input-ars').forEach(i => this.updateARSPreview(i));
    this.actualizarPrecioCalculado();
    this.renderCombos();
    document.getElementById('pf-stock').value = p.stock || 0;
    document.getElementById('pf-stock-min').value = p.stockMin || 5;
    document.getElementById('pf-peso').value = p.peso || '';
    document.getElementById('pf-dimensiones').value = p.dimensiones || '';
    document.getElementById('pf-tags').value = (p.tags || []).join(', ');
    document.getElementById('pf-descripcion').value = p.descripcion || '';
    document.getElementById('pf-descripcion-corta').value = p.descripcionCorta || '';
    document.getElementById('pf-imagen').value = p.imagen || '';
    document.getElementById('pf-activo').checked = p.activo !== false;
    document.getElementById('pf-destacado').checked = p.destacado || false;
    document.getElementById('pf-solo-web').checked = p.soloWeb || false;
    document.getElementById('pf-seo-title').value = p.seoTitle || '';
    document.getElementById('pf-seo-desc').value = p.seoDesc || '';

    this.updateImagePreview(p.imagen);

    // Variantes
    const variantesContainer = document.getElementById('variantes-container');
    if (p.variantes && p.variantes.length > 0) {
      p.variantes.forEach(v => this.addVariantRow(v));
    }

    // Galería
    const galleryContainer = document.getElementById('gallery-container');
    if (p.galeria && p.galeria.length > 0) {
      p.galeria.forEach(g => this.addGalleryRow(g));
    }

    // Características
    const specsContainer = document.getElementById('specs-container');
    if (p.caracteristicas && Object.keys(p.caracteristicas).length > 0) {
      Object.entries(p.caracteristicas).forEach(([key, value]) => this.addSpecRow({ key, value }));
    }
  },

  initDynamicSections() {
    // Add one empty row to each section for easy start
    // this.addVariantRow();
    // this.addGalleryRow();
    // this.addSpecRow();
  },

  // ========== VARIANTES ==========
  addVariantRow(variant) {
    this.variantRowId++;
    const container = document.getElementById('variantes-container');
    // "+ Agregar variante": la fila nueva arranca con el color de la anterior
    // (casi siempre es el mismo color en otro talle)
    if (!variant) {
      const prev = container.querySelector('.variant-row:last-child');
      const pc = prev ? this.leerColorFila(prev) : { color: '', colorHex: '' };
      variant = { color: pc.color, colorHex: pc.colorHex };
    }
    if (!document.getElementById('colores-sugeridos') && typeof Colores !== 'undefined') {
      const dl = document.createElement('datalist');
      dl.id = 'colores-sugeridos';
      dl.innerHTML = Colores.LISTA.map(([n]) => `<option value="${this.esc(n)}">`).join('');
      document.body.appendChild(dl);
    }
    const hexGuardado = /^#[0-9a-f]{6}$/i.test(variant.colorHex || '') ? variant.colorHex
      : (variant.color && typeof Colores !== 'undefined' ? Colores.hexDeNombre(variant.color) : '');
    const row = document.createElement('div');
    row.className = 'variant-row';
    row.dataset.id = this.variantRowId;
    row.dataset.conColor = hexGuardado || variant.color ? '1' : '';
    row.innerHTML = `
      <div class="form-group">
        <label>Color <small>(opcional)</small></label>
        <div class="variant-color-box">
          <input type="color" class="variant-color-input" value="${hexGuardado || '#ffffff'}" title="Elegí el color" aria-label="Elegir color">
          <input type="text" class="variant-color-name" list="colores-sugeridos" placeholder="Sin color (ej: Negro)" value="${this.esc(variant.color || '')}" autocomplete="off">
          <button type="button" class="variant-color-clear" title="Quitar color" aria-label="Quitar color">✕</button>
        </div>
      </div>
      <div class="form-group">
        <label>Talle <small>(opcional)</small></label>
        <input type="text" class="variant-talle" placeholder="Un talle por fila. Ej: M" value="${this.esc(variant.talle || '')}" onblur="AdminProducts.separarFila(this.closest('.variant-row'))">
      </div>
      <div class="form-group">
        <label>Stock</label>
        <input type="number" class="variant-stock" min="0" value="${Number(variant.stock) || 0}">
      </div>
      <button type="button" class="variant-remove" onclick="this.closest('.variant-row').remove()" title="Eliminar variante">✕</button>
    `;
    container.appendChild(row);
    this.prepararColorFila(row);
    return row;
  },

  /**
   * Antes el color solo se guardaba si además se escribía el nombre: si elegían
   * el color en el cuadradito, se perdía y al reabrir aparecía el bordó de fábrica.
   * Ahora: elegir en el cuadradito pone el nombre solo; escribir el nombre pinta el cuadradito.
   */
  prepararColorFila(row) {
    const picker = row.querySelector('.variant-color-input');
    const nombre = row.querySelector('.variant-color-name');
    const pintar = () => row.classList.toggle('variant-row--sin-color', !row.dataset.conColor);
    picker.addEventListener('input', () => {
      row.dataset.conColor = '1';
      if (!nombre.value.trim() || nombre.dataset.auto === '1') {
        nombre.value = typeof Colores !== 'undefined' ? Colores.nombreDeHex(picker.value) : '';
        nombre.dataset.auto = '1';
      }
      pintar();
    });
    nombre.addEventListener('input', () => {
      nombre.dataset.auto = '';
      const hex = typeof Colores !== 'undefined' ? Colores.hexDeNombre(nombre.value) : '';
      if (hex) picker.value = hex;
      row.dataset.conColor = nombre.value.trim() ? '1' : '';
      pintar();
    });
    row.querySelector('.variant-color-clear').addEventListener('click', () => {
      nombre.value = ''; nombre.dataset.auto = ''; picker.value = '#ffffff'; row.dataset.conColor = ''; pintar();
    });
    pintar();
  },

  /** { color, colorHex } de una fila ('' si no tiene color) */
  leerColorFila(row) {
    if (!row.dataset.conColor) return { color: '', colorHex: '' };
    const hex = row.querySelector('.variant-color-input')?.value || '';
    let color = row.querySelector('.variant-color-name')?.value?.trim() || '';
    if (!color && typeof Colores !== 'undefined') color = Colores.nombreDeHex(hex);
    return { color, colorHex: color ? hex : '' };
  },

  /**
   * "S, M" · "M y L" · "XL - 2XL" → ["S","M"] …  (un talle tipo "S/M" queda como uno solo)
   * Si se escribían varios talles en una misma fila, la tienda mostraba un único
   * botón "S,M" y la clienta no podía elegir el talle.
   */
  separarTalles(texto) {
    return String(texto || '').split(/\s*[,;]\s*|\s+y\s+|\s+-\s+/i).map(t => t.trim()).filter(Boolean);
  },

  /** Convierte una fila con varios talles en una fila por talle. Devuelve true si separó. */
  separarFila(row) {
    if (!row) return false;
    const inp = row.querySelector('.variant-talle');
    const talles = this.separarTalles(inp?.value);
    if (talles.length < 2) return false;
    const { color, colorHex } = this.leerColorFila(row);
    const total =Math.max(0, parseInt(row.querySelector('.variant-stock')?.value) || 0);
    // Reparte el stock: si coincide con la cantidad de talles, 1 de cada uno
    const base = Math.floor(total / talles.length);
    let resto = total - base * talles.length;
    let ref = row;
    const nuevas = talles.map(talle => {
      const nueva = this.addVariantRow({ color, colorHex, talle, stock: base + (resto-- > 0 ? 1 : 0) });
      ref.after(nueva); ref = nueva;
      return nueva;
    });
    row.remove();
    nuevas.forEach(n => n.querySelector('.variant-stock').classList.add('input-revisar'));
    const exacto = total === talles.length;
    AdminApp.toast(exacto
      ? `Separé ${talles.join(', ')} en ${talles.length} talles (1 unidad de cada uno). Si no es así, corregí el stock.`
      : `Separé ${talles.join(', ')} en ${talles.length} talles. Revisá cuántas unidades hay de cada uno.`, exacto ? 'success' : 'warning');
    return !exacto;
  },

  // ========== GALERÍA ==========
  addGalleryRow(image = {}) {
    this.galleryRowId++;
    const container = document.getElementById('gallery-container');
    const row = document.createElement('div');
    row.className = 'gallery-row';
    row.dataset.id = this.galleryRowId;
    row.innerHTML = `
      <div class="form-group">
        <label>Foto de galería</label>
        <input type="url" class="gallery-url" placeholder="Tocá &quot;Subir foto&quot; o pegá un link https://" value="${this.esc(image.url || '')}">
      </div>
      <button type="button" class="gallery-remove" onclick="this.closest('.gallery-row').remove()" title="Eliminar">✕</button>
    `;
    container.appendChild(row);
    if (typeof AdminImages !== 'undefined') AdminImages.attach(row.querySelector('.gallery-url'));
  },

  // ========== CARACTERÍSTICAS ==========
  addSpecRow(spec = {}) {
    this.specRowId++;
    const container = document.getElementById('specs-container');
    const row = document.createElement('div');
    row.className = 'spec-row';
    row.dataset.id = this.specRowId;
    row.innerHTML = `
      <div class="form-group">
        <label>Característica (clave)</label>
        <input type="text" class="spec-key" placeholder="Ej: Material, Composición, Cuidado" value="${this.esc(spec.key || '')}">
      </div>
      <div class="form-group">
        <label>Valor</label>
        <input type="text" class="spec-value" placeholder="Ej: 90% Poliéster 10% Elastano" value="${this.esc(spec.value || '')}">
      </div>
      <button type="button" class="spec-remove" onclick="this.closest('.spec-row').remove()" title="Eliminar">✕</button>
    `;
    container.appendChild(row);
  },

  applySpecTemplate(type) {
    const templates = {
      deportivo: {
        'Material': '90% Poliéster 10% Elastano',
        'Tecnología': 'Dry-Fit / Secado rápido',
        'Cuidado': 'Lavar en frío, no planchar',
        'Uso': 'Entrenamiento, running, gym',
        'Origen': 'Nacional'
      },
      pijama: {
        'Material': '100% Algodón peinado',
        'Tela': 'Suave, transpirable, hipoalergénico',
        'Cuidado': 'Lavar en frío, secar a la sombra',
        'Temporada': 'Todo el año',
        'Origen': 'Nacional'
      },
      lenceria: {
        'Material': 'Encaje elástico + Microfibra',
        'Composición': '85% Poliamida 15% Elastano',
        'Cuidado': 'Lavar a mano, no centrifugar',
        'Copa': 'Sin aro / Con aro según modelo',
        'Origen': 'Nacional'
      },
      generico: {
        'Material': '',
        'Composición': '',
        'Cuidado': '',
        'Talle': '',
        'Color': ''
      }
    };

    const template = templates[type];
    if (!template) return;

    const container = document.getElementById('specs-container');
    container.innerHTML = '';
    Object.entries(template).forEach(([key, value]) => this.addSpecRow({ key, value }));
  },

  // ========== GUARDAR ==========
  save(event) {
    event.preventDefault();

    const id = document.getElementById('pf-id').value;
    const catId = document.getElementById('pf-categoria').value;
    const catConfig = CONFIG.categorias.find(c => c.id === catId);

    const irATab = (tab) => document.querySelector(`#product-modal .form-tab[data-tab="${tab}"]`)?.click();
    // Una fila por talle: si quedó alguna con "S, M", se separa antes de guardar
    let revisar = false;
    [...document.querySelectorAll('#variantes-container .variant-row')].forEach(r => { if (this.separarFila(r)) revisar = true; });
    if (revisar) { irATab('variantes'); return; } // el stock no se pudo repartir solo: que lo revise y guarde de nuevo

    // Variantes: alcanza con talle O color (antes exigía los dos y,
    // si faltaba uno, la fila se descartaba sin avisar)
    const variantes = [];
    const vistas = new Set();
    let errorVariante = '';
    // Un solo color en el producto pero puesto solo en alguna fila → va para todas
    const filas = [...document.querySelectorAll('#variantes-container .variant-row')];
    const coloresFilas = filas.map(r => this.leerColorFila(r));
    const distintos = [...new Map(coloresFilas.filter(c => c.color).map(c => [typeof Colores !== 'undefined' ? Colores.normalizar(c.color) : c.color.toLowerCase(), c])).values()];
    if (distintos.length === 1 && coloresFilas.some(c => !c.color)) {
      filas.forEach((r, i) => {
        if (coloresFilas[i].color) return;
        r.querySelector('.variant-color-name').value = distintos[0].color;
        r.querySelector('.variant-color-input').value = distintos[0].colorHex || '#ffffff';
        r.dataset.conColor = '1';
        r.classList.remove('variant-row--sin-color');
      });
    }
    filas.forEach((row, i) => {
      const { color, colorHex } = this.leerColorFila(row);
      const talle =row.querySelector('.variant-talle')?.value?.trim() || '';
      const stock = Math.max(0, parseInt(row.querySelector('.variant-stock')?.value) || 0);
      if (!color && !talle) {
        if (stock > 0 && !errorVariante) errorVariante = `En la variante ${i + 1} falta el talle o el color`;
        return; // fila vacía: se ignora
      }
      const clave = typeof Colores !== 'undefined' ? Colores.normalizar(color) + '|' + Colores.normalizar(talle) : (color + '|' + talle).toLowerCase();
      if (vistas.has(clave) && !errorVariante) errorVariante = `La variante "${[talle, color].filter(Boolean).join(' · ')}" está repetida`;
      vistas.add(clave);
      variantes.push({ color, colorHex, talle, stock });
    });
    if (errorVariante) { irATab('variantes'); AdminApp.toast(errorVariante, 'error'); return; }
    if (variantes.length && !variantes.some(v => v.stock > 0)) {
      if (!confirm('Todas las variantes tienen stock 0, así que el producto va a figurar SIN STOCK. ¿Guardar igual?')) { irATab('variantes'); return; }
    }

    // Collect gallery
    const galeria = [];
    document.querySelectorAll('.gallery-row').forEach(row => {
      const raw = row.querySelector('.gallery-url')?.value?.trim();
      const url = typeof AdminImages !== 'undefined' ? AdminImages.normalizarUrl(raw) : raw;
      if (url && /^(https:\/\/|assets\/)/.test(url)) galeria.push({ url });
    });

    // Collect specs
    const caracteristicas = {};
    document.querySelectorAll('.spec-row').forEach(row => {
      const key = row.querySelector('.spec-key')?.value?.trim();
      const value = row.querySelector('.spec-value')?.value?.trim();
      if (key && value) caracteristicas[key] = value;
    });

    const nombre = document.getElementById('pf-nombre').value.trim();
    const imagenRaw = document.getElementById('pf-imagen').value.trim();
    const imagen = typeof AdminImages !== 'undefined' ? AdminImages.normalizarUrl(imagenRaw) : imagenRaw;
    // El form es novalidate: los campos obligatorios pueden estar en otra
    // pestaña y el navegador bloqueaba el guardado sin decir nada.
    if (!nombre) { irATab('basico'); AdminApp.toast('El producto necesita un nombre', 'error'); return; }
    if (!catId) { irATab('basico'); AdminApp.toast('Elegí una categoría', 'error'); return; }
    const costoForm = this.leerCostoForm();
    if (costoForm.raw.trim() && !costoForm.costo) {
      irATab('precios'); document.getElementById('pf-preciousd').focus();
      AdminApp.toast(costoForm.moneda === 'ARS' ? 'Revisá el costo: escribilo como 10000 o 10.000' : 'Revisá el costo en dólares: escribilo como 12,50', 'error');
      return;
    }
    const precioUSD = costoForm.moneda === 'USD' ? (costoForm.costo || 0) : 0;
    const precioManual = this.parseARS(document.getElementById('pf-precio-ars-manual').value);
    const precioOfertaVal = this.parseARS(document.getElementById('pf-precio-oferta').value);
    for (const id of ['pf-precio-ars-manual', 'pf-precio-oferta']) {
      const el = document.getElementById(id);
      if (el.value.trim() && !this.parseARS(el.value)) {
        irATab('precios');
        el.focus();
        AdminApp.toast('Revisá el precio en pesos: escribilo como 16000 o 16.000', 'error');
        return;
      }
    }
    if (!(costoForm.costo > 0) && !(precioManual > 0)) { irATab('precios'); AdminApp.toast('Cargá lo que te costó (o un precio final a mano)', 'error'); return; }
    if (imagen && !/^(https:\/\/|assets\/|data:image\/)/.test(imagen)) {
      irATab('imagenes');
      AdminApp.toast('La foto principal tiene que ser un link https://. Usá el botón "📷 Subir foto" para subirla desde la compu o el celular.', 'error');
      return;
    }
    // Con variantes, el stock total es la suma de las variantes
    // (antes podía quedar "Sin stock" en la tienda aunque hubiera talles).
    const stockVariantes = variantes.reduce((s, v) => s + v.stock, 0);

    const data = {
      nombre,
      categoria: catId,
      categoriaOriginal: catConfig ? catConfig.nombre : catId,
      subcategoria: document.getElementById('pf-subcategoria').value.trim(),
      sku: document.getElementById('pf-sku').value.trim(),
      precioUSD,
      costoMoneda: costoForm.moneda,
      costoARS: costoForm.moneda === 'ARS' ? (costoForm.costo || 0) : 0,
      // Costo en pesos: la ganancia queda fija en el producto (si no, cambiaría
      // sola al tocar la general sin que cambie el precio guardado)
      gananciaPct: costoForm.gananciaPct ?? (costoForm.moneda === 'ARS' ? this.gananciaGlobalPct() : null),
      // Costo en pesos → el precio calculado se guarda como precio fijo
      precioARSManual: precioManual || (costoForm.moneda === 'ARS' && costoForm.precio > 0 ? costoForm.precio : null),
      precioOferta: precioOfertaVal,
      margenPersonalizado: null, // reemplazado por gananciaPct
      stock: variantes.length ? stockVariantes : (parseInt(document.getElementById('pf-stock').value) || 0),
      stockMin: parseInt(document.getElementById('pf-stock-min').value) || 5,
      peso: parseInt(document.getElementById('pf-peso').value) || null,
      dimensiones: document.getElementById('pf-dimensiones').value.trim(),
      tags: document.getElementById('pf-tags').value.split(',').map(t => t.trim().toLowerCase()).filter(Boolean),
      descripcion: document.getElementById('pf-descripcion').value.trim(),
      descripcionCorta: document.getElementById('pf-descripcion-corta').value.trim(),
      imagen,
      activo: document.getElementById('pf-activo').checked,
      destacado: document.getElementById('pf-destacado').checked,
      soloWeb: document.getElementById('pf-solo-web').checked,
      seoTitle: document.getElementById('pf-seo-title').value.trim(),
      seoDesc: document.getElementById('pf-seo-desc').value.trim(),
      variantes,
      galeria,
      caracteristicas,
    };

    // ¿Bajó el stock a mano? Casi siempre es una venta por WhatsApp que
    // no quedó registrada: se ofrece cargarla como venta.
    const bajas = id ? this.bajasDeStock(AdminData.getProduct(id), data) : [];

    if (id) {
      AdminData.updateProduct(id, data);
      AdminApp.toast('Producto actualizado correctamente');
    } else {
      AdminData.addProduct(data);
      AdminApp.toast('Producto creado correctamente');
    }

    this.closeForm();
    this.renderTable();
    if (bajas.length) this.ofrecerRegistrarVenta(id, bajas);
  },

  /** Variantes (o stock total) que bajaron al editar: [{ variante, cantidad }] */
  bajasDeStock(antes, despues) {
    if (!antes) return [];
    const varsA = Array.isArray(antes.variantes) ? antes.variantes : [];
    const varsD = Array.isArray(despues.variantes) ? despues.variantes : [];
    const clave = v => `${String(v.color || '').trim()} / ${String(v.talle || '').trim()}`;
    if (varsA.length && varsD.length) {
      const out = [];
      varsA.forEach(va => {
        const vd = varsD.find(v => clave(v) === clave(va));
        const diff = (Number(va.stock) || 0) - (Number(vd?.stock) || 0);
        if (vd && diff > 0) out.push({ variante: clave(va), cantidad: diff });
      });
      return out;
    }
    if (!varsA.length && !varsD.length) {
      const diff = (Number(antes.stock) || 0) - (Number(despues.stock) || 0);
      return diff > 0 ? [{ variante: '', cantidad: diff }] : [];
    }
    return [];
  },

  ofrecerRegistrarVenta(id, bajas) {
    const p = AdminData.getProduct(id);
    if (!p) return;
    const detalle = bajas.map(b => `• ${AdminData.varianteLegible(b.variante) || p.nombre}: ${b.cantidad} menos`).join('\n');
    const ok = confirm(`Bajaste el stock de "${p.nombre}":\n${detalle}\n\n¿Fue una venta (por WhatsApp, Instagram o en persona)?\n\nAceptar = la registro en Pedidos para que cuente en tus ventas (el stock no se vuelve a descontar).\nCancelar = solo era una corrección de stock.`);
    if (!ok) return;
    const precio = AdminData.precioVentaARS(p);
    const items = bajas.map(b => ({ productoId: p.id, nombre: p.nombre, variante: b.variante, cantidad: b.cantidad, precioUnitario: precio }));
    const order = AdminData.addOrder({
      cliente: 'Venta por WhatsApp', origen: 'whatsapp', estado: 'confirmado',
      items, notas: 'Registrada al bajar el stock a mano',
    }, { stockYaDescontado: true });
    AdminApp.toast('✅ Venta registrada. Completá el nombre y el pago si querés.');
    // Se abre para completar cliente, precio cobrado y medio de pago
    setTimeout(() => { try { AdminOrders.openForm(order.id); } catch {} }, 200);
  },

  /** Botón 🛒 de la lista: registrar una venta de este producto */
  vender(id) {
    AdminApp.navigate('orders');
    setTimeout(() => AdminOrders.openForm(null, { productoId: id }), 150);
  },

  // ========== COMBOS (se guardan en Promociones) ==========
  combosDelProducto(id) {
    const promos = AdminData.getEffectivePromos() || {};
    return (promos.combos || []).filter(c => (c.productoIds || []).map(String).includes(String(id)));
  },

  renderCombos() {
    const list = document.getElementById('pf-combos-list');
    const btn = document.getElementById('pf-combo-nuevo');
    if (!list) return;
    const id = this.currentEditId;
    if (btn) btn.disabled = !id;
    if (!id) { list.innerHTML = '<p class="form-hint">Guardá el producto primero y después armá combos con él.</p>'; return; }
    const combos = this.combosDelProducto(id);
    list.innerHTML = combos.length ? combos.map(c => {
      const nombres = (c.productoIds || []).map(pid => AdminData.getProduct(pid)?.nombre || '(producto borrado)');
      const precio = typeof PromoEngine !== 'undefined' && PromoEngine.precioCombo ? PromoEngine.precioCombo(c) : (Number(c.precioARS) || 0);
      return `<div class="combo-item${c.activo === false ? ' combo-item--off' : ''}">
        <div><strong>${this.esc(c.nombre || 'Combo')}</strong>${c.activo === false ? ' <span class="badge badge-inactive">Pausado</span>' : ''}<br>
          <small>${this.esc(nombres.join(' + '))}</small></div>
        <div class="combo-item__precio">${precio ? AdminData.formatARS(precio) : '10% off'}</div>
        <button type="button" class="btn btn-sm btn-danger" onclick="AdminProducts.comboBorrar('${escJsAttr(c.id)}')" aria-label="Borrar combo">🗑️</button>
      </div>`;
    }).join('') : '<p class="form-hint">Este producto todavía no está en ningún combo.</p>';
  },

  comboAbrir() {
    if (!this.currentEditId) return;
    document.getElementById('pf-combo-builder').hidden = false;
    document.getElementById('pf-combo-nuevo').hidden = true;
    document.getElementById('pf-combo-otros').innerHTML = '';
    document.getElementById('pf-combo-precio').value = '';
    document.getElementById('pf-combo-nombre').value = '';
    this.updateARSPreview(document.getElementById('pf-combo-precio'));
    this.comboAgregarOtro();
  },

  comboCerrar() {
    const b = document.getElementById('pf-combo-builder');
    if (b) b.hidden = true;
    const n = document.getElementById('pf-combo-nuevo');
    if (n) n.hidden = false;
  },

  comboAgregarOtro() {
    const cont = document.getElementById('pf-combo-otros');
    const prods = AdminData.getProducts().filter(p => String(p.id) !== String(this.currentEditId))
      .sort((a, b) => String(a.nombre).localeCompare(String(b.nombre)));
    const sel = document.createElement('div');
    sel.className = 'combo-otro';
    sel.innerHTML = `<select class="combo-otro__sel" aria-label="Producto del combo">
        <option value="">Elegí el producto…</option>
        ${prods.map(p => {
          const colores = [...new Set((p.variantes || []).map(v => String(v.color || '').trim()).filter(Boolean))];
          return `<option value="${this.esc(p.id)}">${this.esc(p.nombre)}${colores.length ? ' · ' + this.esc(colores.join(', ')) : ''} — ${AdminData.formatARS(AdminData.precioVentaARS(p))}</option>`;
        }).join('')}
      </select>
      <button type="button" class="btn btn-sm btn-danger" onclick="this.parentElement.remove(); AdminProducts.comboResumen()" aria-label="Quitar">✕</button>`;
    sel.querySelector('select').addEventListener('change', () => this.comboResumen());
    cont.appendChild(sel);
    this.comboResumen();
  },

  comboIds() {
    const otros = [...document.querySelectorAll('#pf-combo-otros .combo-otro__sel')].map(s => s.value).filter(Boolean);
    return [String(this.currentEditId), ...otros];
  },

  /** "Por separado $28.000 · combo $25.000 · ahorra $3.000 · te queda $X" */
  comboResumen() {
    const box = document.getElementById('pf-combo-resumen');
    if (!box) return;
    const ids = this.comboIds();
    const prods = ids.map(id => AdminData.getProduct(id)).filter(Boolean);
    if (prods.length < 2) { box.innerHTML = ''; return; }
    const suma = prods.reduce((s, p) => s + AdminData.precioVentaARS(p), 0);
    const costo = prods.reduce((s, p) => s + AdminData.costoUnitarioARS(p), 0);
    const precio = this.parseARS(document.getElementById('pf-combo-precio').value);
    const nombre = document.getElementById('pf-combo-nombre');
    if (nombre && !nombre.value.trim()) nombre.placeholder = 'Ej: ' + prods.map(p => p.nombre).join(' + ').slice(0, 60);
    box.innerHTML = `Por separado: <strong>${AdminData.formatARS(suma)}</strong>` +
      (precio ? ` · Combo: <strong>${AdminData.formatARS(precio)}</strong> · La clienta ahorra ${AdminData.formatARS(Math.max(0, suma - precio))}` : '') +
      (precio && costo ? `<br>Te cuesta ${AdminData.formatARS(costo)} → ganás <strong class="${precio - costo > 0 ? '' : 'texto-error'}">${AdminData.formatARS(precio - costo)}</strong> por combo (${Math.round((precio - costo) / costo * 100)}%)` : '');
  },

  /** Guarda el combo en Promociones y lo publica en la tienda */
  guardarPromos(promos, etiqueta) {
    AdminData.savePromos(promos);
    if (typeof AdminPromos !== 'undefined') AdminPromos.data = null; // que Promociones lo vea al entrar
    if (typeof AdminSync !== 'undefined' && AdminSync.habilitado()) {
      AdminSync.publicar('save_config', { config: { promos: JSON.stringify(promos) } }, etiqueta);
      return true;
    }
    return false;
  },

  comboGuardar() {
    if (typeof AdminPromos !== 'undefined' && AdminPromos.dirty) {
      AdminApp.toast('Tenés cambios sin guardar en Promociones: guardalos o descartalos primero', 'error');
      return;
    }
    const ids = [...new Set(this.comboIds())];
    if (ids.length < 2) { AdminApp.toast('Elegí con qué producto va el combo', 'error'); return; }
    const precio = this.parseARS(document.getElementById('pf-combo-precio').value);
    if (!precio) { AdminApp.toast('Poné el precio del combo en pesos', 'error'); document.getElementById('pf-combo-precio').focus(); return; }
    const prods = ids.map(id => AdminData.getProduct(id)).filter(Boolean);
    const suma = prods.reduce((s, p) => s + AdminData.precioVentaARS(p), 0);
    if (precio >= suma && !confirm(`El combo (${AdminData.formatARS(precio)}) no es más barato que comprar todo por separado (${AdminData.formatARS(suma)}), así que no se va a notar. ¿Guardarlo igual?`)) return;
    const nombre = document.getElementById('pf-combo-nombre').value.trim() || prods.map(p => p.nombre).join(' + ').slice(0, 80);
    const promos = JSON.parse(JSON.stringify(AdminData.getEffectivePromos() || {}));
    promos.combos = Array.isArray(promos.combos) ? promos.combos : [];
    promos.combos.push({ id: 'combo_' + Date.now().toString(36), nombre, descripcion: '', productoIds: ids, precioARS: precio, precioUSD: 0, activo: true });
    const publicado = this.guardarPromos(promos, 'el combo');
    AdminApp.toast(publicado ? '🎁 Combo guardado y publicado en la tienda' : '🎁 Combo guardado (se publica al conectar la planilla)');
    this.comboCerrar();
    this.renderCombos();
  },

  comboBorrar(comboId) {
    if (typeof AdminPromos !== 'undefined' && AdminPromos.dirty) {
      AdminApp.toast('Tenés cambios sin guardar en Promociones: guardalos o descartalos primero', 'error');
      return;
    }
    if (!confirm('¿Borrar este combo?')) return;
    const promos = JSON.parse(JSON.stringify(AdminData.getEffectivePromos() || {}));
    promos.combos = (promos.combos || []).filter(c => String(c.id) !== String(comboId));
    this.guardarPromos(promos, 'la baja del combo');
    AdminApp.toast('Combo borrado');
    this.renderCombos();
  },

  closeForm() {
    document.getElementById('product-modal').classList.remove('open');
    this.resetForm();
  },

  delete(id) {
    const p = AdminData.getProduct(id);
    if (!p) return;
    if (confirm(`¿Eliminar "${p.nombre}"? Esta acción no se puede deshacer.`)) {
      AdminData.deleteProduct(id);
      AdminApp.toast('Producto eliminado');
      this.renderTable();
    }
  },

  exportCSV() {
    const products = AdminData.getProducts();
    if (products.length === 0) {
      AdminApp.toast('No hay productos para exportar', 'error');
      return;
    }

    const headers = ['ID', 'Nombre', 'Categoria', 'Subcategoria', 'SKU', 'Descripcion', 'DescripcionCorta', 'PrecioUSD', 'PrecioARSManual', 'PrecioOferta', 'MargenPersonalizado', 'GananciaPct', 'CostoMoneda', 'CostoARS', 'Stock', 'StockMin', 'Peso', 'Dimensiones', 'Imagen', 'Galeria', 'Variantes', 'Caracteristicas', 'Tags', 'Activo', 'Destacado', 'SoloWeb', 'SEOTitle', 'SEODesc'];
    const rows = products.map(p => {
      const galeriaStr = (p.galeria || []).map(g => g.url).join(' | ');
      const variantesStr = (p.variantes || []).map(v => `${v.color || ''}${v.color ? `(${v.colorHex || ''})` : ''}/${v.talle || ''}:${Number(v.stock) || 0}`).join(' | ');
      const specsStr = Object.entries(p.caracteristicas || {}).map(([k, v]) => `${k}:${v}`).join(' | ');
      return [
        p.id, p.nombre, p.categoriaOriginal || p.categoria, p.subcategoria, p.sku,
        p.descripcion, p.descripcionCorta, p.precioUSD,
        p.precioARSManual || '', p.precioOferta || '',
        p.margenPersonalizado ? (p.margenPersonalizado * 100) : '',
        p.gananciaPct ?? '', p.costoMoneda || 'USD', p.costoARS || '',
        p.stock, p.stockMin || 5, p.peso || '', p.dimensiones || '',
        p.imagen, galeriaStr, variantesStr, specsStr,
        (p.tags || []).join(', '),
        p.activo ? 'TRUE' : 'FALSE',
        p.destacado ? 'TRUE' : 'FALSE',
        p.soloWeb ? 'TRUE' : 'FALSE',
        p.seoTitle || '', p.seoDesc || ''
      ];
    });

    let csv = headers.join(',') + '\n';
    rows.forEach(r => {
      csv += r.map(v => AdminProducts.csvCell(v)).join(',') + '\n';
    });

    this.downloadFile(csv, 'productos_princesslov_completo.csv', 'text/csv');
    AdminApp.toast('CSV completo exportado');
  },

  /** Celda CSV segura: conserva ceros y neutraliza fórmulas (=, +, -, @) al abrir en Excel */
  csvCell(v) {
    let s = v == null ? '' : String(v);
    if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
    return `"${s.replace(/"/g, '""')}"`;
  },

  downloadFile(content, filename, type) {
    const blob = new Blob(['\ufeff' + content], { type: type + ';charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  },
};