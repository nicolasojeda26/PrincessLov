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
      const precioARS = AdminApp.dolarRate ? (p.precioUSD * AdminApp.dolarRate * (CONFIG?.cotizacion?.margenGanancia || 1.3)) : 0;
      const stockClass = p.stock <= 0 ? 'badge-low-stock' : p.stock <= 5 ? 'badge-low-stock' : 'badge-active';
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
          </td>
          <td>${this.esc(p.categoriaOriginal || p.categoria || '-')}</td>
          <td>${AdminData.formatUSD(p.precioUSD)}</td>
          <td>${p.precioARSManual ? AdminData.formatARS(p.precioARSManual) : AdminData.formatARS(precioARS)}${p.precioOferta ? ` <span class="badge" style="background:#F59E0B;color:white;">Oferta: ${AdminData.formatARS(p.precioOferta)}</span>` : ''}</td>
          <td>
            ${hasVariants ? `
              <div style="display:flex; flex-direction:column; gap:2px;">
                <span class="badge ${variantStock <= 0 ? 'badge-low-stock' : variantStock <= 5 ? 'badge-low-stock' : 'badge-active'}">${variantStock} u. (variantes)</span>
                <small style="color:var(--texto-secundario);">${p.variantes.length} variantes</small>
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
    document.getElementById('pf-preciousd').value = p.precioUSD || 0;
    document.getElementById('pf-precio-ars-manual').value = this.formatInputARS(p.precioARSManual);
    document.getElementById('pf-precio-oferta').value = this.formatInputARS(p.precioOferta);
    document.querySelectorAll('#product-modal .input-ars').forEach(i => this.updateARSPreview(i));
    document.getElementById('pf-margen-personalizado').value = p.margenPersonalizado || '';
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
  addVariantRow(variant = {}) {
    this.variantRowId++;
    const container = document.getElementById('variantes-container');
    const row = document.createElement('div');
    row.className = 'variant-row';
    row.dataset.id = this.variantRowId;
    row.innerHTML = `
      <div class="form-group">
        <label>Color <small>(opcional)</small></label>
        <div style="display:flex; gap:0.5rem; align-items:end;">
          <input type="text" class="variant-color-name" placeholder="Nombre (ej: Borgoña)" value="${this.esc(variant.color || '')}" style="flex:1;">
          <input type="color" class="variant-color-input" value="${/^#[0-9a-f]{6}$/i.test(variant.colorHex || '') ? variant.colorHex : '#800020'}">
        </div>
      </div>
      <div class="form-group">
        <label>Talle <small>(opcional)</small></label>
        <input type="text" class="variant-talle" placeholder="Ej: S, M, L, XL / Único" value="${this.esc(variant.talle || '')}">
      </div>
      <div class="form-group">
        <label>Stock</label>
        <input type="number" class="variant-stock" min="0" value="${Number(variant.stock) || 0}">
      </div>
      <button type="button" class="variant-remove" onclick="this.closest('.variant-row').remove()" title="Eliminar variante">✕</button>
    `;
    container.appendChild(row);
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
    // Variantes: alcanza con talle O color (antes exigía los dos y,
    // si faltaba uno, la fila se descartaba sin avisar)
    const variantes = [];
    const vistas = new Set();
    let errorVariante = '';
    document.querySelectorAll('#variantes-container .variant-row').forEach((row, i) => {
      const color = row.querySelector('.variant-color-name')?.value?.trim() || '';
      const colorHex = row.querySelector('.variant-color-input')?.value || '';
      const talle = row.querySelector('.variant-talle')?.value?.trim() || '';
      const stock = Math.max(0, parseInt(row.querySelector('.variant-stock')?.value) || 0);
      if (!color && !talle) {
        if (stock > 0 && !errorVariante) errorVariante = `En la variante ${i + 1} falta el talle o el color`;
        return; // fila vacía: se ignora
      }
      const clave = (color + '|' + talle).toLowerCase();
      if (vistas.has(clave) && !errorVariante) errorVariante = `La variante "${[talle, color].filter(Boolean).join(' · ')}" está repetida`;
      vistas.add(clave);
      variantes.push({ color, colorHex: color ? colorHex : '', talle, stock });
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
    const precioUSD = parseFloat(document.getElementById('pf-preciousd').value);
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
    if (!(precioUSD > 0) && !(precioManual > 0)) { irATab('precios'); AdminApp.toast('Cargá el precio (USD o precio manual en pesos)', 'error'); return; }
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
      precioUSD: parseFloat(document.getElementById('pf-preciousd').value) || 0,
      precioARSManual: precioManual,
      precioOferta: precioOfertaVal,
      margenPersonalizado: document.getElementById('pf-margen-personalizado').value ? parseFloat(document.getElementById('pf-margen-personalizado').value) / 100 : null,
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

    if (id) {
      AdminData.updateProduct(id, data);
      AdminApp.toast('Producto actualizado correctamente');
    } else {
      AdminData.addProduct(data);
      AdminApp.toast('Producto creado correctamente');
    }

    this.closeForm();
    this.renderTable();
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

    const headers = ['ID', 'Nombre', 'Categoria', 'Subcategoria', 'SKU', 'Descripcion', 'DescripcionCorta', 'PrecioUSD', 'PrecioARSManual', 'PrecioOferta', 'MargenPersonalizado', 'Stock', 'StockMin', 'Peso', 'Dimensiones', 'Imagen', 'Galeria', 'Variantes', 'Caracteristicas', 'Tags', 'Activo', 'Destacado', 'SoloWeb', 'SEOTitle', 'SEODesc'];
    const rows = products.map(p => {
      const galeriaStr = (p.galeria || []).map(g => g.url).join(' | ');
      const variantesStr = (p.variantes || []).map(v => `${v.color}(${v.colorHex})/${v.talle}:${v.stock}`).join(' | ');
      const specsStr = Object.entries(p.caracteristicas || {}).map(([k, v]) => `${k}:${v}`).join(' | ');
      return [
        p.id, p.nombre, p.categoriaOriginal || p.categoria, p.subcategoria, p.sku,
        p.descripcion, p.descripcionCorta, p.precioUSD,
        p.precioARSManual || '', p.precioOferta || '',
        p.margenPersonalizado ? (p.margenPersonalizado * 100) : '',
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