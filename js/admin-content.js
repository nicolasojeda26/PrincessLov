/* ============================================
   ADMIN CONTENT - Categorías y frases del home
   ============================================ */

const AdminContent = {
  /** Compatibilidad: la sección vieja "Contenido" ahora está dividida */
  render() { this.renderCategorias(); },
  switchTab(which) {
    AdminApp.navigate(which === 'club' ? 'club' : which === 'frases' ? 'home' : 'categories');
  },

  renderClub() {
    this.renderFrases();
    this.renderClubLeads();
  },

  /* ---------- CATEGORÍAS ---------- */
  /** "  lenceria " → "lenceria" (sin espacios de más) */
  limpio(v) { return String(v ?? '').replace(/\s+/g, ' ').trim(); },

  claveGrupo(g) {
    return this.limpio(g).toLocaleLowerCase('es').normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  },

  /** Grupos existentes sin repetir (ignora mayúsculas/espacios), para elegir de la lista */
  gruposExistentes(cats) {
    const vistos = new Map();
    (cats || AdminData.getEffectiveCategorias()).forEach(c => {
      const g = this.limpio(c.grupo);
      if (g && !vistos.has(this.claveGrupo(g))) vistos.set(this.claveGrupo(g), g);
    });
    ['Indumentaria Deportiva', 'Pijamas', 'Lencería', 'Ofertas'].forEach(g => {
      if (!vistos.has(this.claveGrupo(g))) vistos.set(this.claveGrupo(g), g);
    });
    return [...vistos.values()];
  },

  /** Si escriben "lenceria" y ya existe "Lenceria", usa el que ya existe */
  unificarGrupo(valor, cats) {
    const g = this.limpio(valor);
    if (!g) return '';
    const existente = this.gruposExistentes(cats).find(x => this.claveGrupo(x) === this.claveGrupo(g));
    return existente || g;
  },

  conteoProductos() {
    const n = {};
    try { (AdminData.getProducts() || []).forEach(p => { if (p.categoria) n[p.categoria] = (n[p.categoria] || 0) + 1; }); } catch {}
    return n;
  },

  renderCategorias() {
    const cats = AdminData.getEffectiveCategorias();
    const tbody = document.getElementById('cats-tbody');
    if (!tbody) return;
    const conteo = this.conteoProductos();
    const dl = document.getElementById('grupos-list');
    if (dl) dl.innerHTML = this.gruposExistentes(cats).map(g => `<option value="${this.esc(g)}">`).join('');

    tbody.innerHTML = cats.map(c => {
      const esTodos = c.id === 'todos';
      const n = conteo[c.id] || 0;
      const estado = esTodos ? '<small style="color:var(--texto-secundario);">Muestra todo el catálogo</small>'
        : n ? `<small style="color:#15803d;">✓ ${n} producto${n === 1 ? '' : 's'} · visible</small>`
        : `<small style="color:#b45309;" title="Aparece en el menú Colección. En los filtros y el pie aparece cuando le cargues un producto.">⚠ Sin productos · solo en el menú</small>`;
      return `
      <tr>
        <td style="white-space:nowrap;">
          <input type="text" value="${this.esc(c.icon)}" style="width:52px; text-align:center;" placeholder="—" maxlength="8"
            aria-label="Emoji de ${this.esc(c.nombre)}" onchange="AdminContent.updateCatField('${escJsAttr(c.id)}','icon',this.value)">
          ${c.icon ? `<button type="button" class="btn btn-xs btn-ghost" title="Quitar emoji" onclick="AdminContent.updateCatField('${escJsAttr(c.id)}','icon','')">✕</button>` : ''}
        </td>
        <td><input type="text" value="${this.esc(c.nombre)}" data-id="${this.esc(c.id)}" data-field="nombre" style="width:100%;" onchange="AdminContent.updateCatField('${escJsAttr(c.id)}','nombre',this.value)">
          ${estado}</td>
        <td><small style="color:var(--texto-secundario);" title="El ID no cambia aunque cambies el nombre: así los productos siguen en su categoría">${this.esc(c.id)}</small></td>
        <td><input type="text" value="${this.esc(c.grupo)}" style="width:100%;" placeholder="Elegí un grupo" list="grupos-list" ${esTodos ? 'disabled' : ''}
          onchange="AdminContent.updateCatField('${escJsAttr(c.id)}','grupo',this.value)"></td>
        <td style="white-space:nowrap;">
          <button class="btn btn-xs btn-secondary" title="Subir" onclick="AdminContent.moveCat('${escJsAttr(c.id)}',-1)">↑</button>
          <button class="btn btn-xs btn-secondary" title="Bajar" onclick="AdminContent.moveCat('${escJsAttr(c.id)}',1)">↓</button>
          ${esTodos ? '' : `<button class="btn btn-xs btn-ghost" style="color:var(--rojo-500);" title="Borrar" onclick="AdminContent.removeCat('${escJsAttr(c.id)}')">✕</button>`}
        </td>
      </tr>`;
    }).join('');
  },

  updateCatField(id, field, value) {
    const cats = AdminData.getEffectiveCategorias();
    let v = field === 'icon' ? String(value ?? '').trim() : this.limpio(value);
    if (field === 'nombre' && !v) { AdminApp.toast('El nombre no puede quedar vacío', 'error'); this.renderCategorias(); return; }
    if (field === 'grupo') v = this.unificarGrupo(v, cats.filter(c => c.id !== id));
    AdminData.saveCategorias(cats.map(c => {
      if (c.id !== id) return c;
      const cambio = { ...c, [field]: v };
      // Los productos guardan el nombre: el nombre viejo queda como alias
      // para que sigan apareciendo en esta categoría.
      if (field === 'nombre' && this.limpio(c.nombre) && this.limpio(c.nombre) !== v) {
        cambio.alias = [...new Set([...(c.alias || []), this.limpio(c.nombre)])];
      }
      return cambio;
    }));
    AdminApp.toast(field === 'icon' && !v ? 'Emoji quitado' : 'Categoría actualizada');
    this.renderCategorias();
  },

  addCat() {
    const nombre = this.limpio(document.getElementById('new-cat-nombre')?.value);
    const icon = String(document.getElementById('new-cat-icon')?.value || '').trim();
    const cats = AdminData.getEffectiveCategorias();
    const grupo = this.unificarGrupo(document.getElementById('new-cat-grupo')?.value, cats) || 'Otros';
    if (!nombre) { AdminApp.toast('Poné un nombre', 'error'); return; }
    const id = nombre.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'');
    if (!id) { AdminApp.toast('Nombre inválido', 'error'); return; }
    if (cats.some(c => c.id === id)) { AdminApp.toast('Ya existe una categoría con ese nombre', 'error'); return; }
    const nueva = { id, nombre, icon, grupo };
    const todosIdx = cats.findIndex(c => c.id === 'todos');
    if (todosIdx >= 0) cats.splice(todosIdx, 0, nueva); else cats.push(nueva);
    AdminData.saveCategorias(cats);
    document.getElementById('new-cat-nombre').value = '';
    document.getElementById('new-cat-icon').value = '';
    AdminApp.toast('Categoría agregada. Cargale productos para que aparezca en los filtros de la tienda.');
    this.renderCategorias();
  },

  removeCat(id) {
    if (id === 'todos') { AdminApp.toast('No se puede borrar "Todos"', 'error'); return; }
    const cat = AdminData.getEffectiveCategorias().find(c => c.id === id);
    const n = this.conteoProductos()[id] || 0;
    const aviso = n ? `\n\nTiene ${n} producto${n === 1 ? '' : 's'}: van a dejar de aparecer en su categoría hasta que los pases a otra.` : '';
    if (!confirm(`¿Borrar la categoría "${cat?.nombre || id}"?${aviso}`)) return;
    AdminData.saveCategorias(AdminData.getEffectiveCategorias().filter(c => c.id !== id));
    this.renderCategorias();
  },

  moveCat(id, dir) {
    const cats = [...AdminData.getEffectiveCategorias()];
    const idx = cats.findIndex(c=>c.id===id);
    if (idx<0) return;
    const nIdx = idx + dir;
    if (nIdx <0 || nIdx >= cats.length) return;
    // "Todos" queda siempre al final
    if (cats[idx].id === 'todos' || cats[nIdx].id === 'todos') return;
    [cats[idx], cats[nIdx]] = [cats[nIdx], cats[idx]];
    AdminData.saveCategorias(cats);
    this.renderCategorias();
  },

  resetCats() {
    if (!confirm('¿Restaurar categorías por defecto?')) return;
    AdminData.resetCategorias();
    AdminApp.toast('Categorías restauradas');
    this.renderCategorias();
  },

  /* ---------- FRASES / HOME ---------- */
  renderFrases() {
    const cont = AdminData.getEffectiveContenido();
    const q = (id) => document.getElementById(id);
    // Promo bar
    if (q('fr-promo-1')) q('fr-promo-1').value = cont.promoBar?.[0] || '';
    if (q('fr-promo-2')) q('fr-promo-2').value = cont.promoBar?.[1] || '';
    if (q('fr-promo-3')) q('fr-promo-3').value = cont.promoBar?.[2] || '';
    // Hero (3 slides)
    for (let i=0;i<3;i++){
      const h = cont.hero?.[i] || {};
      if (q('fr-hero-'+i+'-kicker')) q('fr-hero-'+i+'-kicker').value = h.kicker || '';
      if (q('fr-hero-'+i+'-title')) q('fr-hero-'+i+'-title').value = h.title || '';
      if (q('fr-hero-'+i+'-desc')) q('fr-hero-'+i+'-desc').value = h.desc || '';
      if (q('fr-hero-'+i+'-cta')) q('fr-hero-'+i+'-cta').value = h.cta || '';
      if (q('fr-hero-'+i+'-cat')) q('fr-hero-'+i+'-cat').value = h.categoria || '';
    }
    // Showcase
    if (q('fr-show-kicker')) q('fr-show-kicker').value = cont.showcase?.kicker || '';
    if (q('fr-show-title')) q('fr-show-title').value = cont.showcase?.title || '';
    // Servicios
    if (q('fr-serv-kicker')) q('fr-serv-kicker').value = cont.servicios?.kicker || '';
    if (q('fr-serv-title')) q('fr-serv-title').value = cont.servicios?.title || '';
    for (let i=0;i<4;i++){
      const s = cont.servicios?.items?.[i] || {};
      if (q('fr-serv-'+i+'-icon')) q('fr-serv-'+i+'-icon').value = s.icon || '';
      if (q('fr-serv-'+i+'-title')) q('fr-serv-'+i+'-title').value = s.title || '';
      if (q('fr-serv-'+i+'-desc')) q('fr-serv-'+i+'-desc').value = s.desc || '';
    }
    // Promo band + CTA + Newsletter + Footer
    if (q('fr-band-kicker')) q('fr-band-kicker').value = cont.promoBand?.kicker || '';
    if (q('fr-band-title')) q('fr-band-title').value = cont.promoBand?.title || '';
    if (q('fr-band-desc')) q('fr-band-desc').value = cont.promoBand?.desc || '';
    if (q('fr-band-cta')) q('fr-band-cta').value = cont.promoBand?.cta || '';
    if (q('fr-cta-title')) q('fr-cta-title').value = cont.cta?.title || '';
    if (q('fr-cta-desc')) q('fr-cta-desc').value = cont.cta?.desc || '';
    if (q('fr-cta-btn')) q('fr-cta-btn').value = cont.cta?.btn || '';
    if (q('fr-cta-icon')) q('fr-cta-icon').value = cont.cta?.icon || '';
    if (q('fr-nl-title')) q('fr-nl-title').value = cont.newsletter?.title || '';
    if (q('fr-nl-desc')) q('fr-nl-desc').value = cont.newsletter?.desc || '';
    if (q('fr-nl-btn')) q('fr-nl-btn').value = cont.newsletter?.btn || '';
    if (q('fr-footer-tagline')) q('fr-footer-tagline').value = cont.footer?.tagline || '';
    // Club Prince
    const cp = cont.clubPrince || CONFIG.contenido?.clubPrince || {};
    if (q('fr-club-badge')) q('fr-club-badge').value = cp.badge || '';
    if (q('fr-club-title')) q('fr-club-title').value = cp.title || '';
    if (q('fr-club-title-accent')) q('fr-club-title-accent').value = cp.titleAccent || '';
    if (q('fr-club-subtitle')) q('fr-club-subtitle').value = cp.subtitle || '';
    if (q('fr-club-desc')) q('fr-club-desc').value = cp.desc || '';
    if (q('fr-club-benefit-0')) q('fr-club-benefit-0').value = cp.benefits?.[0] || '';
    if (q('fr-club-benefit-1')) q('fr-club-benefit-1').value = cp.benefits?.[1] || '';
    if (q('fr-club-benefit-2')) q('fr-club-benefit-2').value = cp.benefits?.[2] || '';
    if (q('fr-club-form-title')) q('fr-club-form-title').value = cp.formTitle || '';
    if (q('fr-club-form-desc')) q('fr-club-form-desc').value = cp.formDesc || '';
    for (let i=0;i<3;i++){
      const b = cp.boxes?.[i] || {};
      if (q('fr-club-box-'+i+'-nombre')) q('fr-club-box-'+i+'-nombre').value = b.nombre || '';
      if (q('fr-club-box-'+i+'-desc')) q('fr-club-box-'+i+'-desc').value = b.descripcionCorta || b.desc || '';
      if (q('fr-club-box-'+i+'-detalle')) q('fr-club-box-'+i+'-detalle').value = b.detalleCompleto || '';
      if (q('fr-club-box-'+i+'-imagen')) q('fr-club-box-'+i+'-imagen').value = b.imagenUrl || b.imagen || '';
      if (q('fr-club-box-'+i+'-precio')) q('fr-club-box-'+i+'-precio').value = b.precioUSD || '';
      if (q('fr-club-box-'+i+'-icon')) q('fr-club-box-'+i+'-icon').value = b.icon || '';
      if (q('fr-club-box-'+i+'-tag')) q('fr-club-box-'+i+'-tag').value = b.tag || '';
    }
  },

  saveClub(e) {
    if (e) e.preventDefault();
    const get = (id) => document.getElementById(id)?.value.trim() || '';
    const cont = AdminData.getEffectiveContenido();
    const clubPrince = {
        ...(cont.clubPrince || CONFIG.contenido?.clubPrince || {}),
        badge: get('fr-club-badge') || (cont.clubPrince?.badge || CONFIG.contenido?.clubPrince?.badge),
        title: get('fr-club-title') || (cont.clubPrince?.title || CONFIG.contenido?.clubPrince?.title),
        titleAccent: get('fr-club-title-accent') || (cont.clubPrince?.titleAccent || CONFIG.contenido?.clubPrince?.titleAccent),
        subtitle: get('fr-club-subtitle') || (cont.clubPrince?.subtitle || CONFIG.contenido?.clubPrince?.subtitle),
        desc: get('fr-club-desc') || (cont.clubPrince?.desc || CONFIG.contenido?.clubPrince?.desc),
        benefits: [get('fr-club-benefit-0'), get('fr-club-benefit-1'), get('fr-club-benefit-2')].filter(Boolean),
        formTitle: get('fr-club-form-title') || (cont.clubPrince?.formTitle),
        formDesc: get('fr-club-form-desc') || (cont.clubPrince?.formDesc),
        boxes: [0,1,2].map(i=> {
          const base = (cont.clubPrince?.boxes?.[i] || CONFIG.contenido?.clubPrince?.boxes?.[i] || {});
          const corta = get('fr-club-box-'+i+'-desc') || base.descripcionCorta || base.desc;
          return {
            ...base,
            id: base.id || `box-${i}`,
            nombre: get('fr-club-box-'+i+'-nombre') || base.nombre,
            descripcionCorta: corta,
            desc: corta, // alias histórico
            detalleCompleto: get('fr-club-box-'+i+'-detalle') || base.detalleCompleto || '',
            imagenUrl: get('fr-club-box-'+i+'-imagen') || base.imagenUrl || base.imagen || '',
            precioUSD: parseFloat(get('fr-club-box-'+i+'-precio')) || base.precioUSD || 0,
            icon: get('fr-club-box-'+i+'-icon') || base.icon,
            tag: get('fr-club-box-'+i+'-tag') || base.tag,
            destacado: base.destacado || i===1,
          };
        }),
      };
    // Solo se toca el Club Prince: el resto de la página no cambia
    AdminData.saveContenido({ ...(AdminData.getContenido() || {}), clubPrince });
    try {
      if (typeof AdminSync !== 'undefined' && AdminSync.habilitado()) {
        AdminSync.publicar('save_config', { config: { clubPrince_boxes: JSON.stringify(clubPrince.boxes) } }, 'las cajas del Club Prince');
      }
    } catch {}
    AdminApp.toast((typeof AdminSync !== 'undefined' && AdminSync.habilitado()) ? '✅ Club Prince publicado en la tienda' : 'Guardado en este navegador (falta conectar la planilla para publicarlo)');
  },

  /** Compatibilidad con llamadas viejas */
  saveFrases(e) { return this.saveClub(e); },

  resetClub() {
    if (!confirm('¿Volver a los textos y cajas originales del Club Prince?')) return;
    const custom = { ...(AdminData.getContenido() || {}) };
    delete custom.clubPrince;
    AdminData.saveContenido(custom);
    if (typeof AdminSync !== 'undefined' && AdminSync.habilitado()) {
      AdminSync.publicar('save_config', { config: { clubPrince_boxes: '' } }, 'el Club Prince');
    }
    this.renderFrases();
    AdminApp.toast('Club Prince restaurado');
  },

  renderClubLeads(){
    const el = document.getElementById('club-leads-list'); if(!el) return;
    let leads = [];
    try { leads = JSON.parse(localStorage.getItem('pl_clubprince_leads')||'[]').reverse().slice(0,20); } catch {}
    if (!leads.length) { el.innerHTML = '<p style="color:var(--texto-secundario); font-size:0.85rem; background:var(--gris-100); padding:0.8rem; border-radius:8px;">Aún no hay leads. Con la planilla conectada aparecen acá; si no, las interesadas te escriben directo por WhatsApp.</p>'; return; }
    el.innerHTML = `<div class="table-container"><table class="products-table" style="font-size:0.85rem;"><thead><tr><th>Fecha</th><th>Nombre</th><th>Teléfono</th><th>Ciudad</th><th>Plan</th></tr></thead><tbody>${leads.map(l=> `<tr><td>${this.esc(new Date(l.fecha).toLocaleDateString('es-AR'))}</td><td>${this.esc(l.nombre)}</td><td>${this.esc(l.telefono)}</td><td>${this.esc(l.ciudad)}</td><td>${this.esc(l.plan || '-')}</td></tr>`).join('')}</tbody></table></div>`;
  },

  esc(s){ return escHtml(s); }
};
