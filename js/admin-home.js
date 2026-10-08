/* ============================================
   EDITOR DE LA PÁGINA PRINCIPAL + ENVÍOS
   --------------------------------------------
   Cada sección de la tienda (en el mismo orden en que aparece) se
   abre como una tarjeta con sus textos, fotos y botón de mostrar/ocultar.
   A la derecha hay una vista previa real de la tienda que se recarga
   al guardar. Todo se guarda en `contenido` (AdminData) y, con la
   planilla conectada, se publica para todas las clientas.
   ============================================ */

const IMG_OK = /^(https:\/\/|assets\/|data:image\/)/;

/** Esquema del editor: sección → grupos → campos (path dentro de `contenido`) */
const HOME_SECTIONS = [
  {
    id: 'promoBar', icon: '📣', name: 'Barra de anuncios', desc: 'Las frases cortas que pasan arriba de todo.',
    anchor: '', vis: 'promoBar',
    groups: [{ fields: [
      { k: 'promoBar.0', label: 'Frase 1', max: 60, ph: 'Envíos gratis en Puerto Iguazú' },
      { k: 'promoBar.1', label: 'Frase 2', max: 60 },
      { k: 'promoBar.2', label: 'Frase 3', max: 60 },
    ] }],
  },
  {
    id: 'hero', icon: '🖼️', name: 'Portada (carrusel)', desc: 'Las 3 fotos grandes del principio, con su título y botón.',
    anchor: 'hero', vis: 'hero',
    groups: [0, 1, 2].map(i => ({
      title: `Foto ${i + 1}`,
      fields: [
        { k: `hero.${i}.image`, label: 'Foto', type: 'image' },
        { k: `hero.${i}.kicker`, label: 'Texto chiquito (arriba)', max: 50 },
        { k: `hero.${i}.title`, label: 'Título grande', max: 50 },
        { k: `hero.${i}.desc`, label: 'Descripción', max: 140, type: 'textarea' },
        { k: `hero.${i}.cta`, label: 'Texto del botón', max: 25 },
        { k: `hero.${i}.categoria`, label: 'El botón lleva a…', type: 'cat' },
      ],
    })),
  },
  {
    id: 'club', icon: '👑', name: 'Club Prince', desc: 'Las cajas de suscripción. Se editan en su propia sección.',
    anchor: 'club-prince', vis: 'club', link: 'club',
    groups: [],
  },
  {
    id: 'showcase', icon: '🗂️', name: 'Explorá por categoría', desc: 'Las 4 tarjetas con foto que llevan a cada categoría.',
    anchor: 'categories', vis: 'showcase',
    groups: [
      { fields: [
        { k: 'showcase.kicker', label: 'Texto chiquito', max: 40 },
        { k: 'showcase.title', label: 'Título', max: 50 },
      ] },
      ...[0, 1, 2, 3].map(i => ({
        title: `Tarjeta ${i + 1}${i === 0 ? ' (la grande)' : ''}`,
        fields: [
          { k: `showcase.cards.${i}.image`, label: 'Foto', type: 'image' },
          { k: `showcase.cards.${i}.title`, label: 'Nombre en la tarjeta', max: 30 },
          { k: `showcase.cards.${i}.categoria`, label: 'Lleva a la categoría', type: 'cat' },
          { k: `showcase.cards.${i}.icon`, label: 'Emoji (opcional)', type: 'emoji' },
          { k: `showcase.cards.${i}.oculta`, label: '¿Se muestra en la tienda?', type: 'select',
            options: [['', 'Sí, mostrar esta tarjeta'], ['1', 'No, ocultarla']] },
        ],
      })),
    ],
  },
  {
    id: 'promoBand', icon: '🔥', name: 'Banner de ofertas', desc: 'La franja con foto que invita a ver las ofertas. Aparece antes de los productos.',
    anchor: 'promo-band', vis: 'promoBand',
    groups: [{ fields: [
      { k: 'promoBand.image', label: 'Foto', type: 'image' },
      { k: 'promoBand.kicker', label: 'Texto chiquito', max: 40 },
      { k: 'promoBand.title', label: 'Título', max: 50 },
      { k: 'promoBand.desc', label: 'Descripción', max: 160, type: 'textarea' },
      { k: 'promoBand.cta', label: 'Texto del botón', max: 25 },
      { k: 'promoBand.categoria', label: 'El botón lleva a…', type: 'cat' },
    ] }],
  },
  {
    id: 'productos', icon: '👗', name: 'Catálogo de productos', desc: 'El encabezado de la grilla. Los productos se cargan en "Productos".',
    anchor: 'productos', vis: null, link: 'products',
    groups: [{ fields: [
      { k: 'productos.kicker', label: 'Texto chiquito', max: 40, ph: 'La selección' },
      { k: 'productos.title', label: 'Título', max: 50, ph: 'Todos los productos' },
    ] }],
  },
  {
    id: 'servicios', icon: '💼', name: 'Servicios', desc: 'Las 4 tarjetas con lo que ofrecés (envíos, asesoría, etc.).',
    anchor: 'servicios', vis: 'servicios',
    groups: [
      { fields: [
        { k: 'servicios.kicker', label: 'Texto chiquito', max: 40 },
        { k: 'servicios.title', label: 'Título', max: 60 },
      ] },
      ...[0, 1, 2, 3].map(i => ({
        title: `Tarjeta ${i + 1}`,
        fields: [
          { k: `servicios.items.${i}.icon`, label: 'Emoji', type: 'emoji' },
          { k: `servicios.items.${i}.title`, label: 'Título', max: 40 },
          { k: `servicios.items.${i}.desc`, label: 'Descripción', max: 160, type: 'textarea' },
        ],
      })),
    ],
  },
  {
    id: 'cta', icon: '💬', name: '¿Tenés dudas? (WhatsApp)', desc: 'El bloque marrón que invita a escribirte por WhatsApp.',
    anchor: 'contacto', vis: 'cta',
    groups: [{ fields: [
      { k: 'cta.title', label: 'Título', max: 40 },
      { k: 'cta.desc', label: 'Descripción', max: 160, type: 'textarea' },
      { k: 'cta.btn', label: 'Texto del botón', max: 25 },
      { k: 'cta.icon', label: 'Emoji del botón', type: 'emoji' },
    ] }],
  },
  {
    id: 'newsletter', icon: '✉️', name: 'Suscripción por email', desc: 'Solo se muestra si la planilla de Google está conectada.',
    anchor: 'newsletter', vis: 'newsletter',
    groups: [{ fields: [
      { k: 'newsletter.title', label: 'Título', max: 50 },
      { k: 'newsletter.desc', label: 'Descripción', max: 160, type: 'textarea' },
      { k: 'newsletter.placeholder', label: 'Texto dentro del casillero', max: 40 },
      { k: 'newsletter.btn', label: 'Texto del botón', max: 20 },
    ] }],
  },
  {
    id: 'footer', icon: '📍', name: 'Pie de página y contacto', desc: 'Descripción de la marca, frase, ubicación y envíos.',
    anchor: 'site-footer', vis: null,
    groups: [{ fields: [
      { k: 'footer.tagline', label: 'Descripción de la marca', max: 160, type: 'textarea' },
      { k: 'footer.frase', label: 'Frase (en cursiva)', max: 60, ph: 'Tu espacio favorito de girlie vibes 🎀' },
      { k: 'footer.direccion', label: 'Ubicación', max: 60, ph: 'Puerto Iguazú, Misiones' },
      { k: 'footer.enviosTexto', label: 'Texto de envíos', max: 60, ph: 'Envíos a todo el país' },
    ], note: 'El número de WhatsApp y el Instagram se cambian en Configuración. La lista de envíos, en Envíos.' }],
  },
];

const SECCIONES_DEFAULT = { promoBar: true, hero: true, club: true, showcase: true, servicios: true, promoBand: true, cta: true, newsletter: true };

const AdminHome = {
  draft: null,
  dirty: false,
  abierta: 'hero',
  device: 'mobile',

  /* ---------- Datos ---------- */
  defaults() {
    const c = JSON.parse(JSON.stringify(CONFIG.contenido || {}));
    c.productos = c.productos || { kicker: 'La selección', title: 'Todos los productos' };
    c.footer = { tagline: '', frase: CONFIG.negocio?.tagline || '', direccion: 'Puerto Iguazú, Misiones', enviosTexto: CONFIG.negocio?.envios || 'Envíos a todo el país', ...(c.footer || {}) };
    c.secciones = { ...SECCIONES_DEFAULT, ...(c.secciones || {}) };
    return c;
  },

  cargarDraft() {
    const base = this.defaults();
    const custom = AdminData.getContenido() || {};
    const d = { ...base, ...JSON.parse(JSON.stringify(custom)) };
    // Mezcla profunda de los objetos de primer nivel para no perder campos nuevos
    ['productos', 'footer', 'showcase', 'servicios', 'promoBand', 'cta', 'newsletter'].forEach(k => {
      d[k] = { ...(base[k] || {}), ...(custom[k] || {}) };
    });
    d.secciones = { ...SECCIONES_DEFAULT, ...(custom.secciones || {}) };
    this.draft = d;
    this.dirty = false;
  },

  get(path) {
    return path.split('.').reduce((o, k) => (o == null ? undefined : o[k]), this.draft);
  },

  set(path, value) {
    const keys = path.split('.');
    let o = this.draft;
    keys.slice(0, -1).forEach((k, i) => {
      const next = keys[i + 1];
      if (o[k] == null) o[k] = /^\d+$/.test(next) ? [] : {};
      o = o[k];
    });
    o[keys[keys.length - 1]] = value;
  },

  /* ---------- Render ---------- */
  render() {
    const root = document.getElementById('home-editor-root');
    if (!root) return;
    if (!this.draft || !this.dirty) this.cargarDraft();

    root.innerHTML = `
      <div class="home-editor">
        <div class="home-editor__list">
          <a class="btn btn-secondary home-preview-mobile" href="index.html?preview=1" target="_blank" rel="noopener">👁 Ver cómo queda mi página</a>
          ${HOME_SECTIONS.map(sec => this.renderSeccion(sec)).join('')}
          <div class="home-editor__reset">
            <button type="button" class="btn btn-sm btn-ghost" onclick="AdminHome.restaurarTodo()">↺ Volver a la página original</button>
          </div>
        </div>
        <aside class="home-preview" aria-label="Vista previa de la tienda">
          <div class="home-preview__bar">
            <strong>Vista previa</strong>
            <div class="home-preview__devices" role="group" aria-label="Tamaño de pantalla">
              <button type="button" class="${this.device === 'mobile' ? 'active' : ''}" onclick="AdminHome.setDevice('mobile')">📱 Celular</button>
              <button type="button" class="${this.device === 'desktop' ? 'active' : ''}" onclick="AdminHome.setDevice('desktop')">💻 Compu</button>
            </div>
            <button type="button" class="btn btn-sm btn-secondary" onclick="AdminHome.recargarPreview()" title="Recargar">↻</button>
          </div>
          <div class="home-preview__frame" id="home-preview-frame">
            <iframe id="home-preview-iframe" title="Vista previa de la tienda" src="index.html?preview=1" onload="setTimeout(()=>AdminHome.irAPreview(AdminHome.anchorDe(AdminHome.abierta)), 900)"></iframe>
          </div>
          <p class="home-preview__hint">La vista previa muestra lo último que guardaste.</p>
        </aside>
      </div>
      <div class="save-bar" id="home-save-bar" hidden>
        <span>✏️ Tenés cambios sin guardar</span>
        <div>
          <button type="button" class="btn btn-secondary" onclick="AdminHome.descartar(true)">Descartar</button>
          <button type="button" class="btn btn-primary" onclick="AdminHome.guardar()">💾 Guardar y publicar</button>
        </div>
      </div>
    `;
    this.bindInputs(root);
    this.ajustarPreview();
    this.pintarDirty();
    if (!this._resizeBound) {
      window.addEventListener('resize', () => this.ajustarPreview());
      this._resizeBound = true;
    }
  },

  anchorDe(id) {
    return HOME_SECTIONS.find(s => s.id === id)?.anchor || '';
  },

  renderSeccion(sec) {
    const abierta = this.abierta === sec.id;
    const visible = sec.vis ? this.draft.secciones?.[sec.vis] !== false : true;
    const toggle = sec.vis ? `
      <label class="vis-switch" title="Mostrar u ocultar esta sección en la tienda">
        <input type="checkbox" data-vis="${sec.vis}" ${visible ? 'checked' : ''}>
        <span class="vis-switch__track"></span>
        <span class="vis-switch__label">${visible ? 'Visible' : 'Oculta'}</span>
      </label>` : '';
    const cuerpo = sec.groups.map(g => `
      <div class="field-group">
        ${g.title ? `<h4 class="field-group__title">${escHtml(g.title)}</h4>` : ''}
        <div class="field-grid">${g.fields.map(f => this.renderCampo(f)).join('')}</div>
        ${g.note ? `<p class="form-hint">${escHtml(g.note)}</p>` : ''}
      </div>`).join('');
    const link = sec.link ? `<button type="button" class="btn btn-secondary btn-sm" onclick="AdminApp.navigate('${sec.link}')">Ir a ${escHtml(AdminApp.SECTIONS[sec.link][0])} →</button>` : '';
    return `
      <div class="home-sec ${abierta ? 'home-sec--open' : ''} ${visible ? '' : 'home-sec--hidden'}" data-sec="${sec.id}">
        <div class="home-sec__head">
          <button type="button" class="home-sec__open" onclick="AdminHome.abrir('${sec.id}')" aria-expanded="${abierta}">
            <span class="home-sec__icon" aria-hidden="true">${sec.icon}</span>
            <span class="home-sec__txt"><strong>${escHtml(sec.name)}</strong><small>${escHtml(sec.desc)}</small></span>
            <span class="home-sec__chev" aria-hidden="true">▾</span>
          </button>
          ${toggle}
        </div>
        <div class="home-sec__body" ${abierta ? '' : 'hidden'}>
          ${cuerpo}
          ${link}
        </div>
      </div>`;
  },

  renderCampo(f) {
    const v = this.get(f.k) ?? '';
    const id = 'he-' + f.k.replace(/\./g, '-');
    const common = `id="${id}" data-k="${escHtml(f.k)}" ${f.max ? `maxlength="${f.max}"` : ''} placeholder="${escHtml(f.ph || '')}"`;
    if (f.type === 'textarea') {
      return `<div class="form-group form-group--full"><label for="${id}">${escHtml(f.label)}</label><textarea ${common} rows="2">${escHtml(v)}</textarea></div>`;
    }
    if (f.type === 'emoji') {
      return `<div class="form-group form-group--emoji"><label for="${id}">${escHtml(f.label)}</label><input type="text" ${common} maxlength="4" value="${escHtml(v)}"></div>`;
    }
    if (f.type === 'select') {
      const opts = f.options.map(([val, txt]) => `<option value="${escHtml(val)}" ${String(v) === val ? 'selected' : ''}>${escHtml(txt)}</option>`).join('');
      return `<div class="form-group"><label for="${id}">${escHtml(f.label)}</label><select id="${id}" data-k="${escHtml(f.k)}">${opts}</select></div>`;
    }
    if (f.type === 'cat') {
      const cats = AdminData.getEffectiveCategorias();
      const grupos = (typeof SheetsService !== 'undefined' && SheetsService.obtenerGrupos) ? SheetsService.obtenerGrupos() : [];
      const lista = [
        { id: 'todos', nombre: 'Todos los productos', icon: '📦' },
        { id: 'ofertas', nombre: 'Ofertas (todo lo que tiene precio de oferta)', icon: '🔥' },
        ...grupos.map(g => ({ id: g.id, nombre: `Todo ${g.nombre} (grupo completo)`, icon: '🗂️' })),
        ...cats.filter(c => c.id !== 'todos' && c.id !== 'ofertas'),
      ];
      // Si lo guardado ya no existe (categoría borrada), se avisa en vez de mostrar otra cosa
      if (v && !lista.some(c => c.id === v)) lista.unshift({ id: v, nombre: `⚠️ ${v} (ya no existe: elegí otra)`, icon: '' });
      const opts = lista
        .map(c => `<option value="${escHtml(c.id)}" ${c.id === v ? 'selected' : ''}>${escHtml((c.icon ? c.icon + ' ' : '') + c.nombre)}</option>`).join('');
      return `<div class="form-group"><label for="${id}">${escHtml(f.label)}</label><select id="${id}" data-k="${escHtml(f.k)}">${opts}</select></div>`;
    }
    if (f.type === 'image') {
      const fotos = this.fotosDisponibles();
      return `
        <div class="form-group form-group--full image-field">
          <label for="${id}">${escHtml(f.label)}</label>
          <div class="image-field__row">
            <img class="image-field__thumb" src="${IMG_OK.test(v) ? escHtml(v) : ''}" alt="" ${IMG_OK.test(v) ? '' : 'hidden'}>
            <div class="image-field__inputs">
              <input type="url" ${common} value="${escHtml(v)}" placeholder="Tocá &quot;Subir foto&quot; o pegá un link https://">
              <select data-pick="${escHtml(f.k)}" aria-label="Elegir una foto ya cargada">
                <option value="">…o elegí una foto que ya cargaste</option>
                ${fotos.map(ft => `<option value="${escHtml(ft.url)}">${escHtml(ft.label)}</option>`).join('')}
              </select>
            </div>
          </div>
          <p class="form-hint image-field__err" hidden>El link tiene que empezar con https://. Lo más fácil: tocá "📷 Subir foto".</p>
        </div>`;
    }
    return `<div class="form-group"><label for="${id}">${escHtml(f.label)}</label><input type="text" ${common} value="${escHtml(v)}"></div>`;
  },

  /** Fotos para elegir sin tener que pegar links: las de la tienda y las de los productos */
  fotosDisponibles() {
    const base = [
      { url: 'assets/conjunto-deportivo-borgona.jpg', label: 'Conjunto deportivo borgoña' },
      { url: 'assets/conjunto-flores-rosa.jpg', label: 'Conjunto flores rosa' },
      { url: 'assets/pijama-corazones-negro.jpg', label: 'Pijama corazones' },
    ];
    const vistos = new Set(base.map(b => b.url));
    AdminData.getProducts().forEach(p => {
      [p.imagen, ...(p.galeria || []).map(g => g.url)].forEach(u => {
        if (u && IMG_OK.test(u) && !u.startsWith('data:') && !vistos.has(u)) { vistos.add(u); base.push({ url: u, label: `Producto: ${p.nombre}` }); }
      });
    });
    return base;
  },

  bindInputs(root) {
    // Botón "📷 Subir foto" en cada campo de foto (sube a Google Drive, igual que en Productos)
    if (typeof AdminImages !== 'undefined') {
      root.querySelectorAll('.image-field input[type="url"]').forEach(inp => AdminImages.attach(inp));
    }
    root.querySelectorAll('[data-k]').forEach(el => {
      const ev = el.tagName === 'SELECT' ? 'change' : 'input';
      el.addEventListener(ev, () => {
        this.set(el.dataset.k, el.value);
        if (el.type === 'url') this.validarImagen(el);
        this.marcarDirty();
      });
    });
    root.querySelectorAll('[data-pick]').forEach(sel => {
      sel.addEventListener('change', () => {
        if (!sel.value) return;
        const input = root.querySelector(`[data-k="${CSS.escape(sel.dataset.pick)}"]`);
        if (input) { input.value = sel.value; input.dispatchEvent(new Event('input')); }
        sel.value = '';
      });
    });
    root.querySelectorAll('[data-vis]').forEach(chk => {
      chk.addEventListener('change', () => {
        this.draft.secciones = this.draft.secciones || { ...SECCIONES_DEFAULT };
        this.draft.secciones[chk.dataset.vis] = chk.checked;
        const card = chk.closest('.home-sec');
        card?.classList.toggle('home-sec--hidden', !chk.checked);
        const lbl = chk.parentElement.querySelector('.vis-switch__label');
        if (lbl) lbl.textContent = chk.checked ? 'Visible' : 'Oculta';
        this.marcarDirty();
      });
    });
  },

  validarImagen(el) {
    const v = el.value.trim();
    const ok = !v || IMG_OK.test(v);
    el.classList.toggle('input-error', !ok);
    const wrap = el.closest('.image-field');
    const err = wrap?.querySelector('.image-field__err');
    if (err) err.hidden = ok;
    const thumb = wrap?.querySelector('.image-field__thumb');
    if (thumb) { thumb.hidden = !(v && ok); if (v && ok) thumb.src = v; }
    return ok;
  },

  marcarDirty() {
    this.dirty = true;
    this.pintarDirty();
  },

  pintarDirty() {
    const bar = document.getElementById('home-save-bar');
    if (bar) bar.hidden = !this.dirty;
  },

  abrir(id) {
    this.abierta = this.abierta === id ? '' : id;
    document.querySelectorAll('.home-sec').forEach(card => {
      const open = card.dataset.sec === this.abierta;
      card.classList.toggle('home-sec--open', open);
      card.querySelector('.home-sec__body').hidden = !open;
      card.querySelector('.home-sec__open').setAttribute('aria-expanded', String(open));
    });
    if (this.abierta) this.irAPreview(this.anchorDe(this.abierta));
  },

  /* ---------- Vista previa ---------- */
  setDevice(d) {
    this.device = d;
    document.querySelectorAll('.home-preview__devices button').forEach(b => b.classList.toggle('active', b.textContent.includes(d === 'mobile' ? 'Celular' : 'Compu')));
    this.ajustarPreview();
  },

  ajustarPreview() {
    const box = document.getElementById('home-preview-frame');
    const iframe = document.getElementById('home-preview-iframe');
    if (!box || !iframe) return;
    const ancho = this.device === 'mobile' ? 390 : 1280;
    const alto = this.device === 'mobile' ? 780 : 900;
    const escala = Math.min(1, box.clientWidth / ancho);
    iframe.style.width = ancho + 'px';
    iframe.style.height = alto + 'px';
    iframe.style.transform = `scale(${escala})`;
    box.style.height = Math.round(alto * escala) + 'px';
  },

  irAPreview(anchor) {
    const iframe = document.getElementById('home-preview-iframe');
    if (!iframe) return;
    try {
      // Ojo: scrollIntoView dentro del iframe también movería el panel;
      // por eso se desplaza solo la ventana del iframe.
      const win = iframe.contentWindow;
      const el = anchor ? win?.document?.getElementById(anchor) : null;
      const top = el ? el.getBoundingClientRect().top + win.scrollY - 70 : 0;
      win?.scrollTo({ top: Math.max(0, top), behavior: 'smooth' });
    } catch {}
  },

  recargarPreview() {
    const iframe = document.getElementById('home-preview-iframe');
    if (!iframe) return;
    iframe.src = `index.html?preview=1&t=${Date.now()}`;
  },

  /* ---------- Guardar ---------- */
  guardar() {
    const malas = [...document.querySelectorAll('#home-editor-root input[type="url"]')].filter(el => !this.validarImagen(el));
    if (malas.length) {
      malas[0].scrollIntoView({ behavior: 'smooth', block: 'center' });
      AdminApp.toast('Hay una foto con un link inválido: tiene que empezar con https://', 'error');
      return;
    }
    // Limpieza: sin frases vacías en la barra de anuncios
    this.draft.promoBar = (this.draft.promoBar || []).map(s => String(s || '').trim()).filter(Boolean);
    const clubPrevio = AdminData.getContenido()?.clubPrince;
    const aGuardar = JSON.parse(JSON.stringify(this.draft));
    if (clubPrevio) aGuardar.clubPrince = clubPrevio; // el club se edita en su sección
    else delete aGuardar.clubPrince;
    AdminData.saveContenido(aGuardar);
    this.dirty = false;
    this.pintarDirty();
    this.recargarPreview();
    const publicado = typeof AdminSync !== 'undefined' && AdminSync.habilitado();
    AdminApp.toast(publicado ? '✅ Guardado y publicado en la tienda' : '💾 Guardado. Se ve en la vista previa; para que lo vean tus clientas conectá la planilla.');
  },

  descartar(preguntar = true) {
    if (preguntar && !confirm('¿Descartar los cambios que no guardaste?')) return;
    this.cargarDraft();
    if (AdminApp.currentSection === 'home') this.render();
  },

  restaurarTodo() {
    if (!confirm('¿Volver a los textos y fotos originales de toda la página principal? (El Club Prince no cambia.)')) return;
    const club = AdminData.getContenido()?.clubPrince;
    AdminData.saveContenido(club ? { clubPrince: club } : {});
    this.cargarDraft();
    this.render();
    this.recargarPreview();
    AdminApp.toast('Página principal restaurada');
  },
};

/* ============================================
   ENVÍOS
   ============================================ */
const AdminEnvios = {
  KEY: 'pl_admin_envios',
  lista: null,
  umbral: 0,

  getEnvios() {
    try {
      const v = JSON.parse(localStorage.getItem(this.KEY) || 'null');
      if (Array.isArray(v) && v.length) return v;
    } catch {}
    return JSON.parse(JSON.stringify(CONFIG.envios || []));
  },

  render() {
    const root = document.getElementById('shipping-editor-root');
    if (!root) return;
    this.lista = this.getEnvios();
    const promos = AdminData.getEffectivePromos();
    this.umbral = promos.envioGratisUmbralARS ?? 150000;
    root.innerHTML = `
      <div class="chart-card">
        <h3>🚚 Formas de envío</h3>
        <p class="form-hint">Poné el precio en pesos (0 = gratis). Desactivá una opción para ocultarla sin borrarla.</p>
        <div class="envios-list" id="envios-list"></div>
        <button type="button" class="btn btn-secondary" onclick="AdminEnvios.agregar()">+ Agregar forma de envío</button>
      </div>
      <div class="chart-card">
        <h3>🎁 Envío gratis por monto</h3>
        <div class="form-group" style="max-width:320px;">
          <label for="envio-umbral">Envío gratis a partir de ($)</label>
          <input type="number" id="envio-umbral" min="0" step="1000" value="${Number(this.umbral) || 0}">
          <p class="form-hint">Si el carrito llega a este monto, el envío sale gratis. Poné 0 para desactivarlo.</p>
        </div>
      </div>
      <div class="save-bar save-bar--static">
        <span>Los cambios se aplican al carrito y al pedido por WhatsApp.</span>
        <button type="button" class="btn btn-primary" onclick="AdminEnvios.guardar()">💾 Guardar envíos</button>
      </div>`;
    this.pintarLista();
  },

  pintarLista() {
    const el = document.getElementById('envios-list');
    if (!el) return;
    el.innerHTML = this.lista.map((e, i) => `
      <div class="envio-row ${e.activo === false ? 'envio-row--off' : ''}" data-i="${i}">
        <div class="form-group"><label>Nombre</label><input type="text" data-f="nombre" value="${escHtml(e.nombre || '')}" maxlength="40" placeholder="Ej: Correo Argentino"></div>
        <div class="form-group"><label>Detalle</label><input type="text" data-f="descripcion" value="${escHtml(e.descripcion || '')}" maxlength="50" placeholder="Ej: A todo el país"></div>
        <div class="form-group form-group--precio"><label>Precio $</label><input type="number" data-f="precio" min="0" step="100" value="${Number(e.precio) || 0}"></div>
        <label class="check-inline" title="Si la clienta elige esta opción, no se le pide dirección"><input type="checkbox" data-f="retiro" ${e.retiro || e.id === 'retiro' ? 'checked' : ''}> Retira en persona</label>
        <label class="check-inline"><input type="checkbox" data-f="activo" ${e.activo !== false ? 'checked' : ''}> Activo</label>
        <div class="envio-row__btns">
          <button type="button" class="btn btn-xs btn-secondary" onclick="AdminEnvios.mover(${i},-1)" aria-label="Subir">↑</button>
          <button type="button" class="btn btn-xs btn-secondary" onclick="AdminEnvios.mover(${i},1)" aria-label="Bajar">↓</button>
          <button type="button" class="btn btn-xs btn-danger" onclick="AdminEnvios.quitar(${i})" aria-label="Eliminar">✕</button>
        </div>
      </div>`).join('');
    el.querySelectorAll('[data-f]').forEach(inp => {
      inp.addEventListener(inp.type === 'checkbox' ? 'change' : 'input', () => {
        const i = Number(inp.closest('.envio-row').dataset.i);
        const f = inp.dataset.f;
        this.lista[i][f] = inp.type === 'checkbox' ? inp.checked : (f === 'precio' ? Math.max(0, Number(inp.value) || 0) : inp.value);
        if (f === 'activo') inp.closest('.envio-row').classList.toggle('envio-row--off', !inp.checked);
      });
    });
  },

  agregar() {
    this.lista.push({ id: '', nombre: '', descripcion: '', precio: 0, activo: true });
    this.pintarLista();
    document.querySelector('#envios-list .envio-row:last-child input')?.focus();
  },

  quitar(i) {
    if (!confirm(`¿Eliminar "${this.lista[i].nombre || 'esta opción'}"?`)) return;
    this.lista.splice(i, 1);
    this.pintarLista();
  },

  mover(i, d) {
    const j = i + d;
    if (j < 0 || j >= this.lista.length) return;
    [this.lista[i], this.lista[j]] = [this.lista[j], this.lista[i]];
    this.pintarLista();
  },

  slug(s) {
    return String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
  },

  guardar() {
    const lista = this.lista.map(e => ({ ...e, nombre: String(e.nombre || '').trim(), descripcion: String(e.descripcion || '').trim() }))
      .filter(e => e.nombre);
    if (!lista.length) { AdminApp.toast('Tiene que haber al menos una forma de envío', 'error'); return; }
    if (!lista.some(e => e.activo !== false)) { AdminApp.toast('Dejá al menos una forma de envío activa', 'error'); return; }
    const usados = new Set();
    lista.forEach(e => {
      let id = e.id || this.slug(e.nombre) || 'envio';
      while (usados.has(id)) id += '_2';
      usados.add(id);
      e.id = id;
      e.precio = Number(e.precio) || 0;
      e.retiro = !!e.retiro;
    });
    try { localStorage.setItem(this.KEY, JSON.stringify(lista)); } catch {}
    CONFIG.envios = lista;

    const umbral = Math.max(0, Number(document.getElementById('envio-umbral')?.value) || 0);
    const promos = { ...AdminData.getEffectivePromos(), envioGratisUmbralARS: umbral };
    AdminData.savePromos(promos);

    if (typeof AdminSync !== 'undefined' && AdminSync.habilitado()) {
      AdminSync.publicar('save_config', { config: { envios: JSON.stringify(lista), promos: JSON.stringify(promos) } }, 'los envíos');
      AdminApp.toast('✅ Envíos publicados en la tienda');
    } else {
      AdminApp.toast('💾 Envíos guardados (en la tienda se ven al conectar la planilla)');
    }
    this.render();
  },
};
