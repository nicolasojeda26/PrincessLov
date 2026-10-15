/* ============================================
   CLUB PRINCE — Landing, cajas y lead gen
   Las cajas son 100% CMS: se obtienen (en orden) de
   1) Google Sheets (Apps Script, clave `clubPrince_boxes`),
   2) overrides del panel admin (localStorage `pl_admin_contenido`),
   3) defaults de `CONFIG.contenido.clubPrince.boxes`.
   Form: Nombre, Teléfono, Ciudad (+ plan vinculado al Modal)
         -> POST a Apps Script sheet ClubPrince_Leads (+ columna Plan)
   Checkout: si carrito tiene club-prince, WhatsApp inicia con
         "Yanela del club Prince quiero esto"
   ============================================ */

/**
 * @typedef {Object} ClubBox Suscripción del Club Prince (objeto CMS)
 * @property {string} id
 * @property {string} nombre
 * @property {string} descripcionCorta Texto visible en la tarjeta
 * @property {string} detalleCompleto Texto visible en el Modal
 * @property {number} precioUSD Precio base (se convierte a ARS con margen)
 * @property {number} precio Precio ARS calculado (solo lectura, se genera al normalizar)
 * @property {string} imagenUrl URL de imagen ('' = placeholder condicional)
 * @property {string} icon Emoji/icono de respaldo
 * @property {string} tag Badge superior ("Más elegida", "Premium", "Deluxe")
 * @property {boolean} destacado Resalta la tarjeta
 */

const ClubPrince = {
  boxes: [],
  boxesLoaded: false,
  boxesFetching: null,
  selectedPlan: null,

  endpoint() {
    return (typeof appsScriptConfigurado === 'function') ? appsScriptConfigurado() : null;
  },

  init() {
    const form = document.getElementById('club-prince-form');
    if (form) {
      form.addEventListener('submit', (e) => this.onSubmit(e));
      const planSel = document.getElementById('club-plan');
      if (planSel) planSel.addEventListener('change', () => { this.selectedPlan = planSel.value || null; });
    }
    this.renderBoxesFromConfig();
    // Escucha actualizaciones de contenido editable (admin)
    window.addEventListener('contenido:updated', () => {
      this.boxesLoaded = false;
      this.boxesFetching = null;
      this.renderBoxesFromConfig();
    });
  },

  /** Defaults del bundle (siempre disponibles offline) */
  defaultBoxes() {
    const cfg = (typeof CONFIG !== 'undefined' && CONFIG.contenido?.clubPrince) ? CONFIG.contenido.clubPrince : null;
    return Array.isArray(cfg?.boxes) ? cfg.boxes : [];
  },

  /** Overrides guardados por el panel admin en este navegador */
  localBoxes() {
    try {
      const raw = localStorage.getItem('pl_admin_contenido');
      if (!raw) return null;
      const obj = JSON.parse(raw);
      const boxes = obj?.clubPrince?.boxes;
      return Array.isArray(boxes) && boxes.length ? boxes : null;
    } catch { return null; }
  },

  /**
   * Normaliza cualquier forma histórica de caja al objeto CMS
   * @param {any} raw
   * @returns {ClubBox}
   */
  normalizeBox(raw = {}) {
    const r = raw && typeof raw === 'object' ? raw : {};
    const descripcionCorta = r.descripcionCorta || r.desc || '';
    return {
      id: String(r.id || ''),
      nombre: r.nombre || '',
      descripcionCorta,
      desc: descripcionCorta, // alias histórico
      detalleCompleto: r.detalleCompleto || '',
      precioUSD: parseFloat(r.precioUSD) || 0,
      precio: 0, // se calcula abajo
      imagenUrl: /^(https:|assets\/)/.test(String(r.imagenUrl || r.imagen || '')) ? String(r.imagenUrl || r.imagen) : '',
      icon: r.icon || '🎀',
      tag: r.tag || '',
      destacado: !!r.destacado,
    };
  },

  precioARS(box) {
    const b = box && typeof box === 'object' ? box : {};
    try {
      if (typeof SheetsService !== 'undefined' && SheetsService.calcularPrecioARS) {
        return SheetsService.calcularPrecioARS(b.precioUSD || 0);
      }
    } catch {}
    const dolar = (typeof SheetsService !== 'undefined' && SheetsService.cotizacionDolar) || 1200;
    return Math.round((b.precioUSD || 0) * dolar * 1.3);
  },

  formatARS(value) {
    try {
      if (typeof SheetsService !== 'undefined' && SheetsService.formatPrecioARS) {
        return SheetsService.formatPrecioARS(value);
      }
    } catch {}
    return `$ ${Number(value || 0).toLocaleString('es-AR')}`;
  },

  /**
   * Obtiene las cajas (fetch remoto Sheets > admin local > defaults).
   * Equivalente al useEffect/fetch del componente.
   * @returns {Promise<ClubBox[]>}
   */
  async fetchBoxes() {
    if (this.boxesLoaded) return this.boxes;
    if (this.boxesFetching) return this.boxesFetching;

    this.boxesFetching = (async () => {
      // 0. Vista previa del admin: manda lo guardado en este navegador
      const preview = new URLSearchParams(location.search).get('preview') === '1';
      const localPrev = preview ? this.localBoxes() : null;
      // 1. Google Sheets (Apps Script, clave `clubPrince_boxes`)
      const url = localPrev ? null : this.endpoint();
      if (url && typeof fetch !== 'undefined') {
        try {
          let data = null;
          if (typeof SheetsService !== 'undefined' && SheetsService.configRemota) {
            data = await SheetsService.configRemota(); // misma llamada que usa la tienda
          } else {
            const u = new URL(url);
            u.searchParams.set('action', 'config');
            const res = await fetch(u, { method: 'GET', headers: { 'Accept': 'application/json' } });
            if (res.ok) data = await res.json();
          }
          if (data) {
            const raw = data && data.clubPrince_boxes;
            const arr = typeof raw === 'string' ? JSON.parse(raw) : raw;
            if (Array.isArray(arr) && arr.length) {
              this.boxes = arr.map(b => this.normalizeBox(b));
              this.boxesLoaded = true;
              return this.boxes;
            }
          }
        } catch (e) {
          console.warn('[ClubPrince] remoto falló, uso local:', e.message);
        }
      }
      // 2. Overrides del admin (localStorage)
      const local = this.localBoxes();
      if (local) {
        this.boxes = local.map(b => this.normalizeBox(b));
      } else {
        // 3. Defaults del bundle
        this.boxes = this.defaultBoxes().map(b => this.normalizeBox(b));
      }
      this.boxes.forEach(b => { b.precio = this.precioARS(b); });
      this.boxesLoaded = true;
      return this.boxes;
    })();

    try {
      return await this.boxesFetching;
    } finally {
      this.boxesFetching = null;
    }
  },

  /** Acceso sincrónico (usa lo ya cargado o defaults+local) */
  getBoxes() {
    if (this.boxesLoaded) return this.boxes;
    const local = this.localBoxes();
    const src = local || this.defaultBoxes();
    return src.map(b => { const n = this.normalizeBox(b); n.precio = this.precioARS(n); return n; });
  },

  getBox(boxId) {
    return this.getBoxes().find(b => b.id === boxId) || null;
  },

  async renderBoxesFromConfig() {
    const cfg = (typeof CONFIG !== 'undefined' && CONFIG.contenido?.clubPrince) ? CONFIG.contenido.clubPrince : null;
    if (!cfg && !this.defaultBoxes().length && !this.localBoxes()) return;
    // Head
    if (cfg) {
      const b = document.getElementById('club-badge'); if (b && cfg.badge) b.textContent = cfg.badge;
      const t = document.getElementById('club-title-accent'); if (t && cfg.titleAccent) t.textContent = cfg.titleAccent;
      const ti = document.getElementById('club-title'); if (ti && cfg.title && ti.firstChild) ti.firstChild.textContent = cfg.title + ' ';
      const sub = document.getElementById('club-subtitle'); if (sub && cfg.subtitle) sub.textContent = cfg.subtitle;
      const descEl = document.getElementById('club-desc'); if (descEl && cfg.desc) descEl.textContent = cfg.desc;
      const ft = document.getElementById('club-form-title'); if (ft && cfg.formTitle) ft.textContent = cfg.formTitle;
      const fd = document.getElementById('club-form-desc'); if (fd && cfg.formDesc) fd.textContent = cfg.formDesc;
      if (cfg.benefits && Array.isArray(cfg.benefits)) {
        const ben = document.getElementById('club-benefits');
        if (ben) ben.innerHTML = cfg.benefits.map((x, i) => `${i ? '<span class="dot">·</span>' : ''}<span>${this.esc(x)}</span>`).join('');
      }
    }
    // Boxes (CMS): nombre + descripcionCorta + botón "Ver más" (sin precio ni agregar)
    const boxes = await this.fetchBoxes();
    const wrap = document.getElementById('club-boxes');
    if (wrap && boxes.length) {
      wrap.innerHTML = boxes.map((box) => {
        const feat = box.destacado ? ' club-box--featured' : '';
        const btnClass = box.destacado ? 'btn--primary' : 'btn--dark';
        return `<article class="club-box${feat}" data-box="${this.esc(box.id)}">
          <div class="club-box__stripe" aria-hidden="true"></div>
          <div class="club-box__icon" aria-hidden="true">${this.esc(box.icon || '🎀')}</div>
          ${box.tag ? `<span class="club-box__tag">${this.esc(box.tag)}</span>` : ''}
          <h3 class="club-box__name">${this.esc(box.nombre)}</h3>
          <p class="club-box__meta">${this.esc(box.descripcionCorta)}</p>
          <button class="btn ${btnClass} btn--block" onclick="ClubPrince.openBoxModal('${escJsAttr(box.id)}')">Ver más</button>
        </article>`;
      }).join('');
    }
    this.renderPlanSelect();
  },

  /** Select de plan del formulario, vinculado a la selección del Modal */
  renderPlanSelect() {
    const sel = document.getElementById('club-plan');
    if (!sel) return;
    const boxes = this.getBoxes();
    const current = this.selectedPlan || sel.value || null;
    sel.innerHTML = boxes.map(b => `<option value="${this.esc(b.id)}">${this.esc(b.nombre)}</option>`).join('');
    if (current && boxes.some(b => b.id === current)) {
      sel.value = current;
      this.selectedPlan = current;
    } else if (boxes.length) {
      this.selectedPlan = this.selectedPlan || boxes[0].id;
      sel.value = this.selectedPlan;
    }
  },

  /** Vincula el formulario con la caja vista/elegida en el Modal */
  setPlan(boxId) {
    if (!boxId) return;
    this.selectedPlan = boxId;
    const sel = document.getElementById('club-plan');
    if (sel) sel.value = boxId;
  },

  getSelectedBox() {
    return this.getBox(this.selectedPlan) || this.getBoxes()[0] || null;
  },

  // ==================== MODAL (vista detalle) ====================

  openBoxModal(boxId) {
    const box = this.getBox(boxId);
    if (!box) return;
    this.setPlan(box.id);

    const modal = document.getElementById('club-modal');
    if (!modal) return;

    const img = document.getElementById('club-modal-img');
    const ph = document.getElementById('club-modal-placeholder');
    if (box.imagenUrl) {
      if (img) { img.src = box.imagenUrl; img.alt = box.nombre; img.style.display = 'block'; }
      if (ph) ph.style.display = 'none';
    } else {
      if (img) img.style.display = 'none';
      if (ph) {
        ph.style.display = 'flex';
        ph.innerHTML = `<span aria-hidden="true">${this.esc(box.icon || '🎀')}</span>`;
      }
    }

    const tag = document.getElementById('club-modal-tag');
    if (tag) { tag.textContent = box.tag || ''; tag.style.display = box.tag ? '' : 'none'; }
    const name = document.getElementById('club-modal-name');
    if (name) name.textContent = box.nombre;
    const short = document.getElementById('club-modal-short');
    if (short) short.textContent = box.descripcionCorta || '';
    const detail = document.getElementById('club-modal-detail');
    if (detail) {
      const txt = box.detalleCompleto || box.descripcionCorta || '';
      detail.innerHTML = this.esc(txt).replace(/\n/g, '<br>');
    }
    const price = document.getElementById('club-modal-price');
    if (price) price.textContent = this.formatARS(this.precioARS(box));

    // El formulario para sumarse arranca cerrado en cada caja
    this.ocultarFormulario();
    const msg = document.getElementById('club-form-msg');
    if (msg) { msg.textContent = ''; msg.className = 'club-prince__form-msg'; }

    modal.dataset.boxId = box.id;
    modal.classList.add('open');
    modal.setAttribute('aria-hidden', 'false');
    document.body.classList.add('no-scroll');
  },

  /** Muestra el formulario "Quiero sumarme" dentro del modal de la caja */
  mostrarFormulario() {
    const wrap = document.getElementById('club-form-wrap');
    const btn = document.getElementById('club-join-btn');
    if (!wrap) return;
    const modal = document.getElementById('club-modal');
    if (modal?.dataset.boxId) this.setPlan(modal.dataset.boxId);
    const box = this.getSelectedBox();
    const title = document.getElementById('club-form-title');
    if (title && box) title.textContent = `Quiero la ${box.nombre}`;
    wrap.hidden = false;
    if (btn) { btn.hidden = true; btn.setAttribute('aria-expanded', 'true'); }
    wrap.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    setTimeout(() => document.getElementById('club-nombre')?.focus({ preventScroll: true }), 250);
  },

  ocultarFormulario() {
    const wrap = document.getElementById('club-form-wrap');
    const btn = document.getElementById('club-join-btn');
    if (wrap) wrap.hidden = true;
    if (btn) { btn.hidden = false; btn.setAttribute('aria-expanded', 'false'); }
  },

  closeBoxModal() {
    const modal = document.getElementById('club-modal');
    if (!modal) return;
    modal.classList.remove('open');
    modal.setAttribute('aria-hidden', 'true');
    modal.dataset.boxId = '';
    document.body.classList.remove('no-scroll');
  },

  addBoxFromModal() {
    const modal = document.getElementById('club-modal');
    const boxId = modal?.dataset.boxId || this.selectedPlan;
    if (!boxId) return;
    this.setPlan(boxId);
    this.closeBoxModal();
    this.addBoxToCart(boxId);
  },

  // ==================== CHECKOUT (lógica condicional WhatsApp) ====================

  addBoxToCart(boxId) {
    const box = this.getBox(boxId);
    if (!box) { if (typeof App !== 'undefined') App.showToast('Caja no encontrada'); return; }
    this.setPlan(box.id);
    // Crear producto virtual Club Prince (se marca como categoría club-prince para la lógica condicional de WhatsApp)
    const producto = {
      id: box.id,
      nombre: `Club Prince — ${box.nombre}`,
      descripcion: box.detalleCompleto || box.descripcionCorta || '',
      descripcionCorta: box.descripcionCorta || '',
      categoria: 'club-prince',
      categoriaOriginal: 'Club Prince',
      precioUSD: box.precioUSD,
      precioARSManual: null,
      imagen: box.imagenUrl || (typeof CONFIG !== 'undefined' && CONFIG.imagenes?.placeholder) || '',
      stock: 999,
      activo: true,
      isClubPrince: true,
      tags: ['club-prince', 'club', 'suscripcion'],
      variantes: [],
    };
    if (typeof CartService !== 'undefined') {
      CartService.addItem(producto);
      if (typeof App !== 'undefined') {
        App.showToast?.(`Agregado: ${producto.nombre}`);
        if (App.openCart) App.openCart();
      }
    }
  },

  // ==================== LEAD FORM ====================

  async onSubmit(e) {
    e.preventDefault();
    const nombre = document.getElementById('club-nombre')?.value.trim();
    const telefono = document.getElementById('club-telefono')?.value.trim();
    const ciudad = document.getElementById('club-ciudad')?.value.trim();
    const planBox = this.getSelectedBox();
    const plan = planBox ? planBox.nombre : '';
    const msgEl = document.getElementById('club-form-msg');
    const btn = document.getElementById('club-submit-btn');

    const setMsg = (t, ok) => {
      if (!msgEl) return;
      msgEl.textContent = t;
      msgEl.className = 'club-prince__form-msg ' + (ok ? 'club-prince__form-msg--ok' : 'club-prince__form-msg--err');
    };

    if (!nombre || !telefono || !ciudad) { setMsg('Completá nombre, teléfono y ciudad.', false); return; }
    if (telefono.replace(/\D/g, '').length < 8) { setMsg('Revisá el teléfono.', false); return; }

    if (btn) { btn.disabled = true; btn.textContent = 'Enviando…'; }

    const lead = { nombre: nombre.slice(0, 80), telefono: telefono.slice(0, 20), ciudad: ciudad.slice(0, 60), plan, origen: 'Club Prince Web', estado: 'nuevo' };
    const textoWa = `Yanela del club Prince quiero sumarme 👑\n\nNombre: ${lead.nombre}\nTeléfono: ${lead.telefono}\nCiudad: ${lead.ciudad}${plan ? `\nPlan: ${plan}` : ''}`;
    const ok = () => {
      setMsg('¡Gracias! Te escribimos por WhatsApp para activar tu suscripción. 💕', true);
      e.target.reset();
      this.renderPlanSelect();
    };

    // Sin planilla conectada: el lead viaja por WhatsApp (antes quedaba
    // guardado solo en el celular de la clienta y nunca te llegaba).
    // Se abre ANTES de cualquier await para que el celular no lo bloquee.
    const url = this.endpoint();
    if (!url) {
      CartService.abrirWhatsApp(textoWa);
      ok();
      if (btn) { btn.disabled = false; btn.textContent = '✨ Quiero ser parte'; }
      return;
    }

    try {
      await SheetsService.postToAppsScript('club_prince_lead', { lead });
      ok();
      if (typeof App !== 'undefined') App.showToast('¡Bienvenida al Club Prince! 👑');
    } catch (err) {
      console.warn('[ClubPrince] no se pudo guardar el lead:', err.message);
      setMsg('No pudimos registrarte automáticamente. Tocá el botón de nuevo para enviarnos tus datos por WhatsApp.', false);
      // Segundo intento: sin endpoint → WhatsApp
      this.endpoint = () => null;
    } finally {
      if (btn) { btn.disabled = false; btn.textContent = '✨ Quiero ser parte'; }
    }
  },

  esc(s) { return escHtml(s); }
};

document.addEventListener('DOMContentLoaded', () => ClubPrince.init());
