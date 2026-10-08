/* ============================================
   ADMIN PROMOS - CRUD del Motor de Promociones
   Combos, 2x1, códigos de descuento, flash sales
   y preventas. Guarda en localStorage y (si hay
   Apps Script configurado) también en remoto.
   ============================================ */

const AdminPromos = {
  currentSection: 'promos',
  data: null,

  endpoint() {
    const url = (typeof CONFIG !== 'undefined' && CONFIG.sheets?.appsScriptUrl) ? CONFIG.sheets.appsScriptUrl : null;
    return (url && !url.includes('TU_SCRIPT_ID')) ? url : null;
  },

  pad(n) { return String(n).padStart(2, '0'); },

  toLocalInput(iso) {
    if (!iso) return '';
    const d = new Date(iso);
    if (isNaN(d.getTime())) return '';
    return `${d.getFullYear()}-${this.pad(d.getMonth() + 1)}-${this.pad(d.getDate())}T${this.pad(d.getHours())}:${this.pad(d.getMinutes())}`;
  },

  fromLocalInput(v) { return v ? new Date(v).toISOString() : null; },

  categorias() {
    return (typeof AdminData !== 'undefined' && AdminData.getEffectiveCategorias)
      ? AdminData.getEffectiveCategorias() : (CONFIG.categorias || []);
  },

  productos() {
    return (typeof AdminData !== 'undefined' && AdminData.getProducts)
      ? AdminData.getProducts() : [];
  },

  ready() {
    return typeof AdminData !== 'undefined' && typeof PromoEngine !== 'undefined';
  },

  esc(s) { return (typeof escHtml === 'function') ? escHtml(s) : String(s ?? ''); },

  render(reload = true) {
    const root = document.getElementById('promos-root');
    if (!root) return;
    // Con cambios sin guardar no se recarga desde lo publicado (se perdería lo que estabas editando)
    if ((reload && !this.dirty) || !this.data) {
      this.data = (typeof AdminData.getEffectivePromos === 'function')
        ? AdminData.getEffectivePromos() : (CONFIG.promos || {});
    }
    root.innerHTML = this.layout();
    this.bind(root);
    this.pintarDirty();
  },

  /** Las promos NO se guardan solas: esta barra recuerda tocar "Guardar" */
  marcarDirty() { this.dirty = true; this.pintarDirty(); },
  pintarDirty() {
    const bar = document.getElementById('promos-save-bar');
    if (bar) bar.hidden = !this.dirty;
  },
  descartar() {
    this.dirty = false;
    this.render(true);
  },

  layout() {
    return `
      <div class="promos-grid">
        ${this.card('Cupones / códigos secretos', 'cupones', this.rowsCupones())}
        ${this.card('Flash sales', 'flashSales', this.rowsFlash())}
        ${this.card('Combos', 'combos', this.rowsCombos())}
        ${this.card('2x1', 'dosPorUno', this.rows2x1())}
        ${this.card('Preventas', 'preventas', this.rowsPreventas())}
      </div>
      <div class="promos-persist">
        <button type="button" class="btn btn-primary" data-action="save">💾 Guardar promociones</button>
        <button type="button" class="btn btn-secondary" data-action="reset">↺ Restaurar valores de fábrica</button>
      </div>
      <div class="save-bar" id="promos-save-bar" hidden>
        <span>✏️ Tenés cambios sin guardar en las promos</span>
        <div>
          <button type="button" class="btn btn-secondary" onclick="AdminPromos.descartar()">Descartar</button>
          <button type="button" class="btn btn-primary" onclick="AdminPromos.save()">💾 Guardar y publicar</button>
        </div>
      </div>
    `;
  },

  card(title, kind, rowsHtml, sub) {
    const n = Array.isArray(this.data[kind]) ? this.data[kind].length : 0;
    return `
      <div class="chart-card promos-card" data-kind-index="${kind}">
        <div class="promos-card__head">
          <h3>${title} <span class="promos-count">(${n})</span>${sub ? `<p>${sub}</p>` : ''}</h3>
          <button type="button" class="btn btn-sm btn-secondary" data-add="${kind}">＋ Agregar</button>
        </div>
        <div class="promos-card__rows">${rowsHtml}</div>
      </div>
    `;
  },

  // ---------- FILAS POR TIPO ----------
  rowsCupones() {
    const lista = this.data.cupones || [];
    if (!lista.length) return '<p class="promos-empty">Todavía no hay códigos.</p>';
    return lista.map((c, i) => `
      <div class="promos-row" data-kind="cupones" data-idx="${i}">
        <div class="promos-row__grid">
          <label class="promos-field">Código
            <input type="text" data-field="codigo" value="${this.esc(c.codigo)}" placeholder="WELCOME10">
          </label>
          <label class="promos-field">Tipo
            <select data-field="tipo">
              <option value="percent" ${c.tipo === 'percent' ? 'selected' : ''}>% descuento</option>
              <option value="fijo" ${c.tipo === 'fijo' ? 'selected' : ''}>Monto fijo (ARS)</option>
              <option value="shipping" ${c.tipo === 'shipping' ? 'selected' : ''}>Envío gratis</option>
            </select>
          </label>
          <label class="promos-field">Valor
            <input type="number" step="0.01" min="0" ${c.tipo === 'fijo' ? '' : 'max="100"'} data-field="valor" value="${c.valor}" placeholder="10">
          </label>
          <label class="promos-field">Usos máx.
            <input type="number" min="0" step="1" data-field="usosMax" value="${c.usosMax}" placeholder="1000">
          </label>
        </div>
        <div class="promos-row__grid">
          <label class="promos-field promos-field--grow">Descripción
            <input type="text" data-field="desc" value="${this.esc(c.desc)}" placeholder="10% de descuento">
          </label>
          <label class="promos-field promos-field--check">
            <input type="checkbox" data-field="activo" ${c.activo !== false ? 'checked' : ''}> Activo
          </label>
          <button type="button" class="btn btn-sm btn-danger" data-del="${c.id}">🗑</button>
        </div>
      </div>
    `).join('');
  },

  rowsFlash() {
    const lista = this.data.flashSales || [];
    if (!lista.length) return '<p class="promos-empty">Sin flash sales. Agregá una con fecha de inicio y fin para mostrar el banner con cuenta regresiva.</p>';
    return lista.map((f, i) => `
      <div class="promos-row" data-kind="flashSales" data-idx="${i}">
        <div class="promos-row__grid">
          <label class="promos-field">Nombre
            <input type="text" data-field="nombre" value="${this.esc(f.nombre)}" placeholder="Fin de semana">
          </label>
          <label class="promos-field">Descuento %
            <input type="number" min="0" max="90" data-field="descuento" value="${f.descuento}">
          </label>
          <label class="promos-field">Desde
            <input type="datetime-local" data-field="desde" value="${this.toLocalInput(f.desde)}">
          </label>
          <label class="promos-field">Hasta
            <input type="datetime-local" data-field="hasta" value="${this.toLocalInput(f.hasta)}">
          </label>
        </div>
        <div class="promos-row__grid promos-row__grid--between">
          <div class="promos-field promos-field--grow">
            <span class="promos-label">Categorías (vacío = todas)</span>
            ${this.chips('flashSales', i, 'categorias', f.categorias || [], true)}
          </div>
          <label class="promos-field promos-field--check">
            <input type="checkbox" data-field="activo" ${f.activo !== false ? 'checked' : ''}> Activo
          </label>
          <button type="button" class="btn btn-sm btn-danger" data-del="${f.id}">🗑</button>
        </div>
      </div>
    `).join('');
  },

  rowsCombos() {
    const lista = this.data.combos || [];
    if (!lista.length) return '<p class="promos-empty">Sin combos. Elegí 2 o más productos y un precio especial (en USD).</p>';
    return lista.map((c, i) => `
      <div class="promos-row" data-kind="combos" data-idx="${i}">
        <div class="promos-row__grid">
          <label class="promos-field">Nombre
            <input type="text" data-field="nombre" value="${this.esc(c.nombre)}" placeholder="Set Rosario">
          </label>
          <label class="promos-field">Precio combo (USD, 0 = 10% off)
            <input type="number" step="0.01" data-field="precioUSD" value="${c.precioUSD}">
          </label>
        </div>
        <div class="promos-field promos-field--grow">
          <span class="promos-label">Productos incluidos</span>
          ${this.chips('combos', i, 'productoIds', c.productoIds || [], true)}
        </div>
        <div class="promos-row__grid promos-row__grid--between">
          <label class="promos-field promos-field--grow">Descripción
            <input type="text" data-field="descripcion" value="${this.esc(c.descripcion)}" placeholder="Comprando el set, 2+1 en pijamas">
          </label>
          <label class="promos-field promos-field--check">
            <input type="checkbox" data-field="activo" ${c.activo !== false ? 'checked' : ''}> Activo
          </label>
          <button type="button" class="btn btn-sm btn-danger" data-del="${c.id}">🗑</button>
        </div>
      </div>
    `).join('');
  },

  rows2x1() {
    const lista = this.data.dosPorUno || [];
    if (!lista.length) return '<p class="promos-empty">Sin promo 2x1. Se aplica al agregar 2 unidades del mismo producto (la segunda unidad es gratis).</p>';
    return lista.map((d, i) => `
      <div class="promos-row" data-kind="dosPorUno" data-idx="${i}">
        <div class="promos-row__grid promos-row__grid--between">
          <div class="promos-field promos-field--grow">
            <span class="promos-label">Categorías (vacío = todas)</span>
            ${this.chips('dosPorUno', i, 'categorias', d.categorias || [], true)}
          </div>
          <label class="promos-field promos-field--check">
            <input type="checkbox" data-field="activo" ${d.activo !== false ? 'checked' : ''}> Activo
          </label>
          <button type="button" class="btn btn-sm btn-danger" data-del="${d.id}">🗑</button>
        </div>
      </div>
    `).join('');
  },

  rowsPreventas() {
    const lista = this.data.preventas || [];
    const prods = this.productos();
    const opts = prods.map(p => `<option value="${p.id}">${this.esc(p.nombre)}</option>`).join('');
    if (!lista.length) return '<p class="promos-empty">Sin preventas. Elegí un producto, precio especial (USD) y fecha de lanzamiento.</p>';
    return lista.map((p, i) => `
      <div class="promos-row" data-kind="preventas" data-idx="${i}">
        <div class="promos-row__grid">
          <label class="promos-field">Producto
            <select data-field="productoId">
              <option value="">— Elegir —</option>
              ${opts.replace(`<option value="${p.productoId}">`, `<option value="${p.productoId}" selected>`)}
            </select>
          </label>
          <label class="promos-field">Precio preventa (USD)
            <input type="number" step="0.01" data-field="precioUSD" value="${p.precioUSD}">
          </label>
          <label class="promos-field">Fecha de lanzamiento
            <input type="datetime-local" data-field="fechaLanzamiento" value="${this.toLocalInput(p.fechaLanzamiento)}">
          </label>
          <label class="promos-field promos-field--check">
            <input type="checkbox" data-field="activo" ${p.activo !== false ? 'checked' : ''}> Activo
          </label>
          <button type="button" class="btn btn-sm btn-danger" data-del="${p.id}">🗑</button>
        </div>
      </div>
    `).join('');
  },

  // ---------- CHIPS MULTISELECT ----------
  chips(kind, idx, field, selected, useCats) {
    const selSet = new Set((selected || []).map(x => String(x)));
    const items = useCats
      ? this.categorias().map(c => ({ v: String(c.id), l: c.nombre }))
      : this.productos().map(p => ({ v: String(p.id), l: p.nombre }));
    let html = '<div class="promos-chips">';
    if (items.length) {
      items.forEach(it => {
        const on = selSet.has(it.v);
        html += `<span class="promo-chip${on ? ' is-on' : ''}" data-chipt="${kind}:${idx}:${field}" data-val="${it.v}">${this.esc(it.l)}</span>`;
      });
    } else {
      html += '<span class="promos-empty">No hay ítems disponibles.</span>';
    }
    return html + '</div>';
  },

  // ---------- EVENTOS ----------
  bind(root) {
    root.onchange = (e) => {
      const el = e.target;
      // Los datos de la fila están en el contenedor .promos-row (antes se
      // buscaban en el input y ningún cambio se guardaba).
      const row = el.closest('.promos-row');
      const kind = el.dataset.kind || row?.dataset.kind;
      const idx = el.dataset.idx ?? row?.dataset.idx;
      const field = el.dataset.field;
      if (!kind || idx == null || !field) {
        const addEl = e.target.closest('[data-add]');
        if (addEl) this.add(addEl.getAttribute('data-add'));
        return;
      }
      const rec = (this.data[kind] || [])[Number(idx)];
      if (!rec) return;
      let val = el.value;
      if (el.type === 'checkbox') val = el.checked;
      else if (el.type === 'number') val = Number(val);
      if (field === 'desde' || field === 'hasta' || field === 'fechaLanzamiento') val = this.fromLocalInput(el.value);
      if (kind === 'cupones' && (field === 'valor' || field === 'usosMax')) {
        // Un valor negativo encarecería la compra; un % mayor a 100 la regalaría
        const max = field === 'valor' && rec.tipo !== 'fijo' ? 100 : Infinity;
        const ok = Math.min(max, Math.max(0, Number.isFinite(val) ? val : 0));
        if (ok !== val) {
          const msg = field === 'usosMax' ? 'Los usos no pueden ser negativos'
            : max === 100 ? 'El % del cupón tiene que estar entre 0 y 100' : 'El valor del cupón no puede ser negativo';
          AdminApp.toast?.(msg, 'warning');
          val = ok;
          el.value = ok;
        }
      }
      rec[field] = val;
      this.afterChange();
    };

    root.oninput = (e) => {
      if (e.target.matches('input[type="text"], input[type="number"]')) root.onchange(e);
    };

    root.onclick = (e) => {
      const chip = e.target.closest('[data-chipt]');
      if (chip) {
        e.preventDefault();
        const [kind, idx, field] = chip.getAttribute('data-chipt').split(':');
        const rec = (this.data[kind] || [])[Number(idx)];
        if (!rec) return;
        const arr = Array.isArray(rec[field]) ? rec[field] : [];
        const v = chip.getAttribute('data-val');
        const i = arr.indexOf(v);
        if (i >= 0) arr.splice(i, 1); else arr.push(v);
        rec[field] = arr;
        chip.classList.toggle('is-on', i < 0);
        this.afterChange();
        return;
      }
      const del = e.target.closest('[data-del]');
      if (del) {
        e.preventDefault();
        const kind = del.closest('.promos-row').dataset.kind;
        const id = del.getAttribute('data-del');
        this.data[kind] = (this.data[kind] || []).filter(r => String(r.id) !== String(id));
        this.render(false);
        this.afterChange();
        return;
      }
      const add = e.target.closest('[data-add]');
      if (add) this.add(add.getAttribute('data-add'));
    };

    const saveBtn = root.querySelector('[data-action="save"]');
    if (saveBtn) saveBtn.onclick = () => this.save();
    const resetBtn = root.querySelector('[data-action="reset"]');
    if (resetBtn) resetBtn.onclick = () => this.reset();
  },

  add(kind) {
    const newRec = {
      id: 'x' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
      activo: true,
    };
    if (kind === 'cupones') Object.assign(newRec, { codigo: '', tipo: 'percent', valor: 10, usosMax: 1000, desc: '' });
    else if (kind === 'flashSales') Object.assign(newRec, { nombre: 'Flash Sale', descuento: 10, desde: null, hasta: null, categorias: [] });
    else if (kind === 'combos') Object.assign(newRec, { nombre: 'Combo', descripcion: '', productoIds: [], precioUSD: 0 });
    else if (kind === 'dosPorUno') Object.assign(newRec, { nombre: '2x1', categorias: [] });
    else if (kind === 'preventas') Object.assign(newRec, { productoId: '', precioUSD: 0, fechaLanzamiento: null });
    (this.data[kind] = this.data[kind] || []).push(newRec);
    this.render(false);
    this.afterChange();
  },

  afterChange() {
    this.marcarDirty();
    // Actualiza contadores sin perder el estado
    Object.entries({ cupones: 'cupones', flashSales: 'flashSales', combos: 'combos', dosPorUno: 'dosPorUno', preventas: 'preventas' }).forEach(([kind]) => {
      const card = document.querySelector(`.promos-card[data-kind-index="${kind}"]`);
      if (!card) return;
      const n = Array.isArray(this.data[kind]) ? this.data[kind].length : 0;
      const badge = card.querySelector('.promos-count');
      if (badge) badge.textContent = `(${n})`;
    });
  },

  save() {
    // Cupones: el código va en mayúsculas y sin espacios; dos iguales o uno vacío no sirven
    const cupones = this.data.cupones || [];
    cupones.forEach(c => { c.codigo = String(c.codigo || '').trim().toUpperCase().replace(/\s+/g, ''); });
    if (cupones.some(c => !c.codigo)) { AdminApp.toast?.('Hay un cupón sin código: escribilo o borralo con 🗑', 'error'); return; }
    const repetido = cupones.find((c, i) => cupones.findIndex(x => x.codigo === c.codigo) !== i);
    if (repetido) { AdminApp.toast?.(`El código ${repetido.codigo} está repetido`, 'error'); return; }
    this.dirty = false;
    this.pintarDirty();
    if (typeof AdminData.savePromos === 'function') AdminData.savePromos(this.data);
    else localStorage.setItem('pl_admin_promos', JSON.stringify(this.data));

    // Publicar en la tienda (planilla) si está conectada
    if (typeof AdminSync !== 'undefined' && AdminSync.habilitado()) {
      AdminSync.publicar('save_config', { config: { promos: JSON.stringify(this.data) } }, 'las promociones');
      AdminApp.toast?.('✅ Promociones publicadas en la tienda');
    } else {
      AdminApp.toast?.('💾 Promociones guardadas (en la tienda se ven al conectar la planilla)');
    }
  },

  reset() {
    if (typeof AdminData.resetPromos === 'function') AdminData.resetPromos();
    this.dirty = false;
    this.render();
    AdminApp.toast?.('Restaurados los valores por defecto');
  },
};