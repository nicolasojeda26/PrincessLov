/* ============================================
   FINANZAS — pantallas (nov/2026)
   Gastos · Cuentas · Clientes · Proveedores · Socios · Caja
   (los reportes están en admin-reportes.js)
   ============================================ */

/* ---------- Formularios y ventanas ---------- */
const FinUI = {
  _form: null,
  esc(s) { return escHtml(s == null ? '' : s); },
  ars(n) { return AdminData.formatARS(n || 0); },
  hoyInput() { const d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); },
  fechaInput(iso) { if (!iso) return ''; const d = new Date(iso); return isNaN(d) ? '' : d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); },
  /** "2026-11-02" → ISO al mediodía (si es hoy, con la hora actual para ordenar bien) */
  isoDeInput(v) {
    if (!v) return new Date().toISOString();
    if (v === this.hoyInput()) return new Date().toISOString();
    return new Date(v + 'T12:00:00').toISOString();
  },
  fecha(iso) { return iso ? AdminApp.formatDate(iso) : '—'; },
  mesActual() { return Fin.mesDe(new Date().toISOString()); },

  /** Opciones "¿Con qué se pagó / cobró?": cuentas, socios y (opcional) "queda pendiente" */
  opcionesPago({ pendiente = true, textoPendiente = 'Queda pendiente', socios = true } = {}) {
    const o = Fin.cuentas(true).map(c => ({ v: 'cuenta:' + c.id, l: `${(Fin.TIPOS_CUENTA.find(t => t.id === c.tipoCuenta) || {}).icon || '💰'} ${c.nombre}` }));
    if (socios) Fin.list('socios').forEach(s => o.push({ v: 'socio:' + s.id, l: `🤝 ${s.nombre} (de su bolsillo)` }));
    if (pendiente) o.unshift({ v: 'pendiente', l: '⏳ ' + textoPendiente });
    return o;
  },
  leerPago(v) {
    if (!v || v === 'pendiente' || v === 'nada') return null;
    const [t, id] = String(v).split(':');
    return t === 'socio' ? { socioId: id } : { cuentaId: id };
  },

  /**
   * Abre un formulario.
   * campos: [{ name, label, type: text|money|number|select|date|month|textarea|pills|check|html,
   *            options:[{v,l}], hint, required, full, show:(vals)=>bool, placeholder }]
   * guardar(vals) → texto de error, o nada para cerrar
   */
  form({ titulo, campos, valores = {}, guardar, textoBoton = '💾 Guardar', alCambiar }) {
    this._form = { campos, guardar, alCambiar };
    document.getElementById('fin-modal-title').textContent = titulo;
    const body = document.getElementById('fin-modal-body');
    body.innerHTML = `<form id="fin-form" class="fin-form" novalidate><div class="form-grid">${campos.map(c => this.campoHtml(c, valores[c.name])).join('')}</div><p class="fin-form__error" id="fin-form-error" hidden></p></form>`;
    document.getElementById('fin-modal-footer').innerHTML = `
      <button type="button" class="btn btn-primary" id="fin-form-ok">${textoBoton}</button>
      <button type="button" class="btn btn-secondary" onclick="FinUI.cerrar()">Cancelar</button>`;
    const form = document.getElementById('fin-form');
    form.addEventListener('input', () => this.refrescarForm());
    form.addEventListener('change', () => this.refrescarForm());
    form.addEventListener('click', (e) => {
      const pill = e.target.closest('[data-pill]');
      if (!pill) return;
      const [name, v] = [pill.dataset.pill, pill.dataset.v];
      form.querySelector(`input[name="${name}"]`).value = v;
      form.querySelectorAll(`[data-pill="${name}"]`).forEach(b => b.classList.toggle('is-on', b.dataset.v === v));
      this.refrescarForm();
    });
    form.addEventListener('submit', (e) => { e.preventDefault(); this.enviar(); });
    document.getElementById('fin-form-ok').onclick = () => this.enviar();
    this.refrescarForm();
    document.getElementById('fin-modal').classList.add('open');
    setTimeout(() => form.querySelector('input:not([type=hidden]),select,textarea')?.focus(), 50);
  },

  campoHtml(c, val) {
    const v = val ?? c.default ?? '';
    const id = 'ff-' + c.name;
    const hint = c.hint ? `<small class="form-hint" id="${id}-hint">${c.hint}</small>` : `<small class="form-hint" id="${id}-hint"></small>`;
    const cls = 'form-group' + (c.full ? ' form-group--full' : '');
    const lbl = `<label for="${id}">${this.esc(c.label)}${c.required ? ' *' : ''}</label>`;
    switch (c.type) {
      case 'select':
        return `<div class="${cls}" data-campo="${c.name}">${lbl}<select id="${id}" name="${c.name}">${(c.options || []).map(o => `<option value="${this.esc(o.v)}" ${String(o.v) === String(v) ? 'selected' : ''}>${this.esc(o.l)}</option>`).join('')}</select>${hint}</div>`;
      case 'textarea':
        return `<div class="${cls}" data-campo="${c.name}">${lbl}<textarea id="${id}" name="${c.name}" rows="2" placeholder="${this.esc(c.placeholder || '')}">${this.esc(v)}</textarea>${hint}</div>`;
      case 'pills':
        return `<div class="${cls} form-group--full" data-campo="${c.name}"><label>${this.esc(c.label)}</label><input type="hidden" name="${c.name}" value="${this.esc(v)}"><div class="fin-pills">${(c.options || []).map(o => `<button type="button" class="fin-pill${String(o.v) === String(v) ? ' is-on' : ''}" data-pill="${c.name}" data-v="${this.esc(o.v)}" title="${this.esc(o.t || '')}">${this.esc(o.l)}</button>`).join('')}</div>${hint}</div>`;
      case 'check':
        return `<div class="${cls}" data-campo="${c.name}"><label class="fin-check"><input type="checkbox" id="${id}" name="${c.name}" ${v === true || v === 'true' ? 'checked' : ''}> ${this.esc(c.label)}</label>${hint}</div>`;
      case 'html':
        return `<div class="${cls} form-group--full" data-campo="${c.name}">${c.html || ''}</div>`;
      default: {
        const t = c.type === 'money' ? 'text' : (c.type || 'text');
        const extra = c.type === 'money' ? 'inputmode="decimal" autocomplete="off"' : (c.type === 'number' ? 'step="any"' : '');
        const valor = c.type === 'money' && v !== '' && v != null ? String(v).replace('.', ',') : v;
        return `<div class="${cls}" data-campo="${c.name}">${lbl}<input type="${t}" id="${id}" name="${c.name}" value="${this.esc(valor)}" placeholder="${this.esc(c.placeholder || '')}" ${extra}>${hint}</div>`;
      }
    }
  },

  valores() {
    const form = document.getElementById('fin-form');
    const out = {};
    (this._form?.campos || []).forEach(c => {
      const el = form?.querySelector(`[name="${c.name}"]`);
      if (!el) return;
      if (c.type === 'check') out[c.name] = el.checked;
      else if (c.type === 'money') out[c.name] = Fin.parseMonto(el.value);
      else if (c.type === 'number') out[c.name] = el.value === '' ? null : Number(el.value);
      else out[c.name] = el.value;
    });
    return out;
  },

  refrescarForm() {
    if (!this._form) return;
    const vals = this.valores();
    this._form.campos.forEach(c => {
      const box = document.querySelector(`#fin-form [data-campo="${c.name}"]`);
      if (box && c.show) box.hidden = !c.show(vals);
    });
    try { this._form.alCambiar?.(vals); } catch (e) { console.warn(e); }
  },

  hint(name, html) { const el = document.getElementById('ff-' + name + '-hint'); if (el) el.innerHTML = html || ''; },

  enviar() {
    const vals = this.valores();
    for (const c of this._form.campos) {
      const box = document.querySelector(`#fin-form [data-campo="${c.name}"]`);
      if (c.required && !box?.hidden && (vals[c.name] === '' || vals[c.name] == null)) return this.error(`Completá "${c.label}"`);
    }
    let err;
    try { err = this._form.guardar(vals); } catch (e) { console.error(e); err = 'No se pudo guardar: ' + e.message; }
    if (err) return this.error(err);
    this.cerrar();
    AdminApp.renderSection(AdminApp.currentSection);
  },

  error(msg) { const el = document.getElementById('fin-form-error'); if (el) { el.textContent = msg; el.hidden = false; } },

  /** Ventana solo para mirar (detalle, cuenta corriente…) */
  ver(titulo, html, botones = '') {
    this._form = null;
    document.getElementById('fin-modal-title').textContent = titulo;
    document.getElementById('fin-modal-body').innerHTML = html;
    document.getElementById('fin-modal-footer').innerHTML = botones + '<button type="button" class="btn btn-secondary" onclick="FinUI.cerrar()">Cerrar</button>';
    document.getElementById('fin-modal').classList.add('open');
  },

  cerrar() { document.getElementById('fin-modal').classList.remove('open'); this._form = null; },

  /** Aviso cuando el Apps Script todavía no tiene las hojas de finanzas */
  avisoPlanilla() {
    if (typeof AdminSync === 'undefined' || !AdminSync.habilitado() || Fin.remotoOk || !AdminSync.ultimaSync) return '';
    return `<div class="local-warning">⚠️ <strong>Falta actualizar el Apps Script</strong> para guardar las finanzas en la planilla. Mientras tanto se guardan solo en este navegador.</div>`;
  },

  tarjetas(items) {
    return `<div class="fin-cards">${items.map(i => `<div class="fin-card${i.cls ? ' fin-card--' + i.cls : ''}"${i.onclick ? ` role="button" tabindex="0" onclick="${i.onclick}"` : ''}><div class="fin-card__label">${i.label}</div><div class="fin-card__valor">${i.valor}</div>${i.sub ? `<div class="fin-card__sub">${i.sub}</div>` : ''}</div>`).join('')}</div>`;
  },

  tabla(cols, filas, vacio = 'No hay nada cargado todavía.') {
    if (!filas.length) return `<div class="fin-vacio">${vacio}</div>`;
    return `<div class="table-container fin-table-wrap"><table class="products-table fin-table"><thead><tr>${cols.map(c => `<th class="${c.num ? 'num' : ''}">${c.l}</th>`).join('')}</tr></thead><tbody>${filas.map(f => `<tr${f._attrs ? ' ' + f._attrs : ''}>${cols.map(c => `<td class="${c.num ? 'num' : ''}" data-label="${this.esc(c.l)}">${f[c.k] ?? ''}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
  },

  badgeEstado(e) {
    const m = { pagado: ['Pagado', '#059669'], parcial: ['Pago parcial', '#D97706'], pendiente: ['Pendiente', '#DC2626'], cancelado: ['Cancelado', '#6B7280'] };
    const [t, c] = m[e] || [e, '#6B7280'];
    return `<span class="badge" style="background:${c};color:#fff;">${t}</span>`;
  },
};

/* ======================== GASTOS ======================== */
const AdminExpenses = {
  filtros: { mes: '', tipo: '', estado: '', proveedor: '', q: '' },

  render() {
    const root = document.getElementById('expenses-root');
    if (!root) return;
    if (!this.filtros.mes && this.filtros.mes !== 'todos') this.filtros.mes = FinUI.mesActual();
    const todos = Fin.gastos();
    const f = this.filtros;
    let lista = todos.filter(g => (f.mes === 'todos' || g.mes === f.mes) && (!f.tipo || g.tipo === f.tipo) &&
      (!f.estado || Fin.estadoGasto(g) === f.estado) && (!f.proveedor || String(g.proveedorId) === f.proveedor) &&
      (!f.q || `${g.concepto} ${g.categoria} ${g.notas}`.toLowerCase().includes(f.q.toLowerCase())));
    lista.sort((a, b) => (b.mes || '').localeCompare(a.mes || '') || new Date(b.fecha) - new Date(a.fecha));
    const total = lista.reduce((s, g) => s + (Number(g.monto) || 0), 0);
    const pagado = lista.reduce((s, g) => s + Fin.pagadoDeGasto(g), 0);
    const meses = [...new Set([FinUI.mesActual(), ...todos.map(g => g.mes).filter(Boolean)])].sort().reverse();
    const provs = Fin.list('proveedores');

    root.innerHTML = `
      ${FinUI.avisoPlanilla()}
      <div class="products-toolbar">
        <div class="toolbar-left fin-filtros">
          <select onchange="AdminExpenses.filtrar('mes', this.value)" aria-label="Mes">
            <option value="todos" ${f.mes === 'todos' ? 'selected' : ''}>Todos los meses</option>
            ${meses.map(m => `<option value="${m}" ${f.mes === m ? 'selected' : ''}>${Fin.nombreMes(m)}</option>`).join('')}
          </select>
          <select onchange="AdminExpenses.filtrar('tipo', this.value)" aria-label="Tipo">
            <option value="">Todos los tipos</option>
            ${Fin.TIPOS_GASTO.map(t => `<option value="${t.id}" ${f.tipo === t.id ? 'selected' : ''}>${t.icon} ${t.label}</option>`).join('')}
          </select>
          <select onchange="AdminExpenses.filtrar('estado', this.value)" aria-label="Estado">
            <option value="">Pagados y pendientes</option>
            <option value="pendiente" ${f.estado === 'pendiente' ? 'selected' : ''}>Pendientes</option>
            <option value="parcial" ${f.estado === 'parcial' ? 'selected' : ''}>Pago parcial</option>
            <option value="pagado" ${f.estado === 'pagado' ? 'selected' : ''}>Pagados</option>
          </select>
          ${provs.length ? `<select onchange="AdminExpenses.filtrar('proveedor', this.value)" aria-label="Proveedor"><option value="">Todos los proveedores</option>${provs.map(p => `<option value="${FinUI.esc(p.id)}" ${f.proveedor === String(p.id) ? 'selected' : ''}>${FinUI.esc(p.nombre)}</option>`).join('')}</select>` : ''}
          <input type="text" class="search-input" placeholder="Buscar gasto…" value="${FinUI.esc(f.q)}" oninput="AdminExpenses.filtros.q=this.value; clearTimeout(this._t); this._t=setTimeout(()=>AdminExpenses.render(),300)">
        </div>
        <div class="toolbar-right">
          <button class="btn btn-primary" onclick="AdminExpenses.openForm()">+ Nuevo gasto</button>
          <button class="btn btn-secondary" onclick="AdminExpenses.recurrentes()">🔁 Gastos fijos del mes</button>
        </div>
      </div>
      ${FinUI.tarjetas([
        { label: 'Total de gastos', valor: FinUI.ars(total), sub: `${lista.length} gasto${lista.length !== 1 ? 's' : ''}` },
        { label: 'Pagado', valor: FinUI.ars(pagado), cls: 'ok' },
        { label: 'Pendiente de pago', valor: FinUI.ars(total - pagado), cls: total - pagado > 0 ? 'alerta' : '' },
        ...Fin.TIPOS_GASTO.filter(t => lista.some(g => g.tipo === t.id)).slice(0, 3).map(t => ({ label: `${t.icon} ${t.label}`, valor: FinUI.ars(lista.filter(g => g.tipo === t.id).reduce((s, g) => s + (Number(g.monto) || 0), 0)) })),
      ])}
      ${FinUI.tabla([
        { k: 'mes', l: 'Mes' }, { k: 'concepto', l: 'Gasto' }, { k: 'tipo', l: 'Tipo' }, { k: 'prov', l: 'Proveedor' },
        { k: 'monto', l: 'Monto', num: true }, { k: 'estado', l: 'Estado' }, { k: 'acc', l: '' },
      ], lista.map(g => {
        const t = Fin.tipoGasto(g.tipo);
        const est = Fin.estadoGasto(g);
        const resta = (Number(g.monto) || 0) - Fin.pagadoDeGasto(g);
        return {
          mes: g.mes ? Fin.nombreMes(g.mes) : FinUI.fecha(g.fecha),
          concepto: `<strong>${FinUI.esc(g.concepto)}</strong>${g.categoria ? `<br><small>${FinUI.esc(g.categoria)}</small>` : ''}${g.origen === 'recurrente' ? ' <span class="badge">🔁 fijo</span>' : ''}${g.origen === 'comision' ? ' <span class="badge">automático</span>' : ''}`,
          tipo: `${t.icon} ${t.label}`,
          prov: FinUI.esc(Fin.get('proveedores', g.proveedorId)?.nombre || ''),
          monto: `<strong>${FinUI.ars(g.monto)}</strong>${g.moneda === 'USD' && g.montoUSD ? `<br><small>USD ${g.montoUSD} × ${FinUI.ars(g.cotizacion)}</small>` : ''}`,
          estado: FinUI.badgeEstado(est) + (est !== 'pagado' ? `<br><small>Falta ${FinUI.ars(resta)}</small>` : ''),
          acc: `<div class="table-actions">${est !== 'pagado' ? `<button class="btn btn-sm btn-primary" onclick="AdminExpenses.pagar('${escJsAttr(g.id)}')">Pagar</button>` : ''}
            <button class="btn btn-sm btn-secondary" onclick="AdminExpenses.openForm('${escJsAttr(g.id)}')" aria-label="Editar">✏️</button>
            <button class="btn btn-sm btn-danger" onclick="AdminExpenses.delete('${escJsAttr(g.id)}')" aria-label="Eliminar gasto">🗑️</button></div>`,
        };
      }), 'No hay gastos con estos filtros. Tocá "+ Nuevo gasto" para cargar alquiler, publicidad, monotributo, etc.')}`;
  },

  filtrar(k, v) { this.filtros[k] = v; this.render(); },

  /** Gasto nuevo o edición (como "Nuevo Gasto" de Gestión Moda) */
  openForm(id) {
    const g = id ? Fin.gastos().find(x => String(x.id) === String(id)) : null;
    const meses = [];
    const hoy = new Date();
    for (let i = -12; i <= 3; i++) meses.push(Fin.mesDe(new Date(hoy.getFullYear(), hoy.getMonth() + i, 15).toISOString()));
    const provs = Fin.list('proveedores');
    const editMonto = !g || Fin.pagosDeGasto(g.id).length === 0;
    FinUI.form({
      titulo: g ? 'Editar gasto' : 'Nuevo gasto',
      valores: g ? { ...g, montoTxt: g.moneda === 'USD' ? g.montoUSD : g.monto, pago: 'pendiente', fechaComprobante: FinUI.fechaInput(g.fechaComprobante) } :
        { tipo: 'administracion', mes: FinUI.mesActual(), moneda: 'ARS', iva: 0, pago: 'cuenta:' + (Fin.cuentaPorDefecto()?.id || ''), fechaPago: FinUI.hoyInput() },
      campos: [
        { name: 'tipo', label: 'Tipo de gasto', type: 'pills', options: Fin.TIPOS_GASTO.map(t => ({ v: t.id, l: `${t.icon} ${t.label}`, t: t.ayuda })), hint: '' },
        { name: 'concepto', label: 'Descripción', required: true, placeholder: 'Ej: Alquiler del local, Publicidad Instagram, Monotributo' },
        { name: 'proveedorId', label: 'Proveedor (opcional)', type: 'select', options: [{ v: '', l: '— Sin proveedor —' }, ...provs.map(p => ({ v: p.id, l: p.nombre })), { v: '__nuevo', l: '➕ Proveedor nuevo…' }] },
        { name: 'proveedorNuevo', label: 'Nombre del proveedor nuevo', show: v => v.proveedorId === '__nuevo' },
        { name: 'categoria', label: 'Categoría (opcional)', placeholder: 'Ej: Servicios, Publicidad, Packaging' },
        { name: 'moneda', label: 'Moneda', type: 'select', options: [{ v: 'ARS', l: 'Pesos' }, { v: 'USD', l: 'Dólares (se pasa a pesos)' }] },
        { name: 'montoTxt', label: 'Gasto total', type: 'money', required: true, placeholder: 'Ej: 35.000', hint: editMonto ? 'Con impuestos incluidos' : 'Ya tiene pagos: para cambiar el monto, borrá los pagos o el gasto' },
        { name: 'iva', label: 'IVA incluido', type: 'select', options: [{ v: 0, l: 'Sin IVA' }, { v: 21, l: '21 %' }, { v: 10.5, l: '10,5 %' }, { v: 27, l: '27 %' }] },
        { name: 'mes', label: 'Mes del gasto', type: 'select', options: meses.map(m => ({ v: m, l: Fin.nombreMes(m) })), hint: 'El mes del servicio, no el del pago' },
        { name: 'fechaComprobante', label: 'Fecha del comprobante (opcional)', type: 'date' },
        ...(g ? [] : [
          { name: 'pago', label: '¿Ya está pagado?', type: 'select', options: FinUI.opcionesPago({ textoPendiente: 'Queda pendiente (lo pago después)' }) },
          { name: 'fechaPago', label: 'Fecha de pago', type: 'date', show: v => v.pago !== 'pendiente' },
          { name: 'repetir', label: 'Repetir todos los meses (guardarlo como gasto fijo)', type: 'check' },
        ]),
        { name: 'notas', label: 'Notas (opcional)', type: 'textarea', full: true },
      ],
      alCambiar: (v) => {
        FinUI.hint('tipo', Fin.tipoGasto(v.tipo).ayuda);
        if (v.moneda === 'USD' && v.montoTxt > 0) FinUI.hint('montoTxt', `USD ${v.montoTxt} × dólar ${FinUI.ars(AdminData.dolarActual())} = <strong>${FinUI.ars(Math.round(v.montoTxt * AdminData.dolarActual()))}</strong>`);
        else if (editMonto) FinUI.hint('montoTxt', 'Con impuestos incluidos');
        const el = document.getElementById('ff-montoTxt');
        if (el) el.disabled = !editMonto;
      },
      guardar: (v) => {
        if (!(v.montoTxt > 0) && editMonto) return 'Escribí el monto del gasto (ej: 35.000)';
        let proveedorId = v.proveedorId;
        if (proveedorId === '__nuevo') {
          if (!String(v.proveedorNuevo || '').trim()) return 'Escribí el nombre del proveedor nuevo';
          proveedorId = Fin.save('proveedores', { nombre: v.proveedorNuevo.trim(), tipoProveedor: 'gastos', telefono: '', email: '', cuit: '', notas: '' }).id;
        }
        const usd = v.moneda === 'USD';
        const dolar = AdminData.dolarActual();
        const datos = {
          tipo: v.tipo, concepto: v.concepto.trim(), proveedorId, categoria: v.categoria.trim(), iva: Number(v.iva) || 0,
          mes: v.mes, fechaComprobante: v.fechaComprobante ? FinUI.isoDeInput(v.fechaComprobante) : '', notas: v.notas.trim(),
        };
        if (editMonto) Object.assign(datos, { moneda: usd ? 'USD' : 'ARS', montoUSD: usd ? v.montoTxt : 0, cotizacion: usd ? (g?.moneda === 'USD' && g.montoUSD === v.montoTxt ? g.cotizacion : dolar) : 0 });
        if (editMonto) datos.monto = usd ? Math.round(v.montoTxt * datos.cotizacion) : v.montoTxt;
        if (g) {
          AdminData.updateExpense(g.id, { ...datos, pagadoExterno: g.pagadoExterno === true ? true : false });
          AdminApp.toast('Gasto actualizado');
          return;
        }
        const pago = FinUI.leerPago(v.pago);
        Fin.crearGasto({ ...datos, fecha: new Date().toISOString() }, pago ? { ...pago, fecha: FinUI.isoDeInput(v.fechaPago) } : null);
        if (v.repetir) {
          const r = Fin.recurrentes();
          r.plantillas.push({ id: Fin.nuevoId('rec'), concepto: datos.concepto, tipo: datos.tipo, categoria: datos.categoria, proveedorId, iva: datos.iva,
            moneda: datos.moneda, monto: usd ? v.montoTxt : v.montoTxt, cuentaId: pago?.cuentaId || '', socioId: pago?.socioId || '', activa: true });
          Fin.guardarRecurrentes(r);
          // El de este mes ya está cargado: se marca como generado
          const recien = Fin.gastos().filter(x => x.concepto === datos.concepto && x.mes === datos.mes).pop();
          if (recien) AdminData.updateExpense(recien.id, { recurrenteId: r.plantillas[r.plantillas.length - 1].id, origen: 'recurrente' });
        }
        AdminApp.toast(pago ? '✅ Gasto cargado y pagado' : '⏳ Gasto cargado como pendiente');
      },
    });
  },

  pagar(id) {
    const g = Fin.gastos().find(x => String(x.id) === String(id));
    if (!g) return;
    const resta = Math.round(((Number(g.monto) || 0) - Fin.pagadoDeGasto(g)) * 100) / 100;
    FinUI.form({
      titulo: `Pagar: ${g.concepto}`,
      valores: { monto: resta, pago: 'cuenta:' + (Fin.cuentaPorDefecto()?.id || ''), fecha: FinUI.hoyInput() },
      campos: [
        { name: 'info', type: 'html', html: `<p>Total ${FinUI.ars(g.monto)} · ya pagado ${FinUI.ars(Fin.pagadoDeGasto(g))} · <strong>falta ${FinUI.ars(resta)}</strong></p>` },
        { name: 'monto', label: 'Monto que pagás', type: 'money', required: true },
        { name: 'pago', label: 'Desde', type: 'select', options: FinUI.opcionesPago({ pendiente: false }) },
        { name: 'fecha', label: 'Fecha', type: 'date' },
      ],
      textoBoton: '💸 Registrar pago',
      guardar: (v) => {
        if (!(v.monto > 0)) return 'Escribí cuánto pagás';
        if (v.monto > resta + 0.5) return `No puede ser más de lo que falta (${FinUI.ars(resta)})`;
        Fin.pagarGasto(g, { ...FinUI.leerPago(v.pago), monto: v.monto, fecha: FinUI.isoDeInput(v.fecha) });
        AdminApp.toast('✅ Pago registrado');
      },
    });
  },

  delete(id) {
    const g = Fin.gastos().find(x => String(x.id) === String(id));
    if (!g) return;
    const pagos = Fin.pagosDeGasto(id).length;
    if (!confirm(`¿Eliminar "${g.concepto}"?${pagos ? `\n\nTambién se borran sus ${pagos} pago(s) y la plata vuelve a la cuenta.` : ''}`)) return;
    Fin.borrarGasto(id);
    AdminApp.toast('Gasto eliminado');
    this.render();
  },

  /* ---------- Gastos fijos (plantilla) ---------- */
  recurrentes(mes) {
    const r = Fin.recurrentes();
    mes = mes || FinUI.mesActual();
    const filas = r.plantillas.map(p => {
      const gen = Fin.generadoDe(p.id, mes);
      const usd = p.moneda === 'USD';
      return `<tr data-rec="${FinUI.esc(p.id)}">
        <td data-label="Gasto"><strong>${FinUI.esc(p.concepto)}</strong><br><small>${Fin.tipoGasto(p.tipo).icon} ${Fin.tipoGasto(p.tipo).label}${p.proveedorId ? ' · ' + FinUI.esc(Fin.get('proveedores', p.proveedorId)?.nombre || '') : ''}</small></td>
        <td data-label="Monto">${gen ? FinUI.ars(gen.monto) : `<input type="text" inputmode="decimal" class="rec-monto" value="${String(p.monto).replace('.', ',')}" aria-label="Monto">${usd ? ' <small>USD</small>' : ''}`}</td>
        <td data-label="Pagar">${gen ? FinUI.badgeEstado(Fin.estadoGasto(gen)) : `<select class="rec-pago" aria-label="Pago">${FinUI.opcionesPago({ textoPendiente: 'Pendiente' }).map(o => `<option value="${FinUI.esc(o.v)}" ${(p.cuentaId && o.v === 'cuenta:' + p.cuentaId) || (p.socioId && o.v === 'socio:' + p.socioId) ? 'selected' : ''}>${FinUI.esc(o.l)}</option>`).join('')}</select>`}</td>
        <td data-label="">${gen ? '✅ Aplicado' : `<label class="fin-check"><input type="checkbox" class="rec-on" checked> Generar</label>`}
          <button type="button" class="btn btn-sm btn-danger" onclick="AdminExpenses.borrarPlantilla('${escJsAttr(p.id)}')" aria-label="Quitar de los fijos">🗑️</button></td>
      </tr>`;
    }).join('');
    const opcMes = [-2, -1, 0, 1].map(i => { const d = new Date(); return Fin.mesDe(new Date(d.getFullYear(), d.getMonth() + i, 15).toISOString()); });
    FinUI.ver('🔁 Gastos fijos del mes', `
      <p class="form-hint">Los gastos que se repiten todos los meses (alquiler, contador, internet…). Cargalos una vez y cada mes los generás con un toque, ajustando el monto si cambió.</p>
      <div class="fin-filtros" style="margin:0.75rem 0;">
        <label>Mes: <select id="rec-mes" onchange="AdminExpenses.recurrentes(this.value)">${opcMes.map(m => `<option value="${m}" ${m === mes ? 'selected' : ''}>${Fin.nombreMes(m)}</option>`).join('')}</select></label>
      </div>
      ${r.plantillas.length ? `<div class="table-container"><table class="products-table fin-table"><thead><tr><th>Gasto</th><th>Monto</th><th>Pago</th><th></th></tr></thead><tbody>${filas}</tbody></table></div>`
        : '<div class="fin-vacio">Todavía no hay gastos fijos. Agregalos con el botón de abajo, o tildá "Repetir todos los meses" al cargar un gasto.</div>'}
      <button type="button" class="btn btn-sm btn-secondary" onclick="AdminExpenses.nuevaPlantilla()" style="margin-top:0.75rem;">+ Agregar gasto fijo</button>
      <div class="fin-auto">
        <label class="fin-check"><input type="checkbox" id="rec-auto" ${r.auto.activo ? 'checked' : ''}> Generarlos solos todos los meses, el día <input type="number" id="rec-dia" min="1" max="31" value="${Number(r.auto.dia) || 1}" style="width:4rem;"></label>
        <label class="fin-check"><input type="checkbox" id="rec-pagos" ${r.auto.registrarPagos ? 'checked' : ''}> Registrar también los pagos (con la cuenta de cada gasto)</label>
        <small class="form-hint">Se generan la primera vez que abrís el panel después de ese día.</small>
      </div>`,
      `<button type="button" class="btn btn-secondary" onclick="AdminExpenses.guardarAuto()">💾 Guardar opciones</button>
       <button type="button" class="btn btn-primary" id="rec-aplicar" onclick="AdminExpenses.aplicarMes()">✅ Generar gastos de ${Fin.nombreMes(mes)}</button>`);
  },

  guardarAuto() {
    const r = Fin.recurrentes();
    r.auto = { ...r.auto, activo: document.getElementById('rec-auto').checked, dia: Math.min(31, Math.max(1, Number(document.getElementById('rec-dia').value) || 1)), registrarPagos: document.getElementById('rec-pagos').checked };
    Fin.guardarRecurrentes(r);
    AdminApp.toast('Opciones guardadas');
  },

  aplicarMes() {
    const mes = document.getElementById('rec-mes').value;
    const items = [...document.querySelectorAll('#fin-modal-body tr[data-rec]')].filter(tr => tr.querySelector('.rec-on')?.checked).map(tr => {
      const pago = FinUI.leerPago(tr.querySelector('.rec-pago')?.value);
      return { plantillaId: tr.dataset.rec, monto: Fin.parseMonto(tr.querySelector('.rec-monto')?.value), pagar: !!pago, ...(pago || {}) };
    });
    if (!items.length) { AdminApp.toast('No hay gastos para generar en ese mes', 'error'); return; }
    const n = Fin.aplicarMes(mes, items);
    AdminApp.toast(`✅ Se generaron ${n} gastos de ${Fin.nombreMes(mes)}`);
    this.filtros.mes = mes;
    FinUI.cerrar();
    if (AdminApp.currentSection === 'expenses') this.render(); else AdminApp.navigate('expenses');
  },

  nuevaPlantilla() {
    const provs = Fin.list('proveedores');
    FinUI.form({
      titulo: 'Nuevo gasto fijo',
      valores: { tipo: 'administracion', moneda: 'ARS', pago: 'pendiente' },
      campos: [
        { name: 'tipo', label: 'Tipo de gasto', type: 'pills', options: Fin.TIPOS_GASTO.map(t => ({ v: t.id, l: `${t.icon} ${t.label}` })) },
        { name: 'concepto', label: 'Descripción', required: true, placeholder: 'Ej: Alquiler' },
        { name: 'proveedorId', label: 'Proveedor', type: 'select', options: [{ v: '', l: '— Sin proveedor —' }, ...provs.map(p => ({ v: p.id, l: p.nombre }))] },
        { name: 'categoria', label: 'Categoría' },
        { name: 'moneda', label: 'Moneda', type: 'select', options: [{ v: 'ARS', l: 'Pesos' }, { v: 'USD', l: 'Dólares' }] },
        { name: 'monto', label: 'Monto habitual', type: 'money', required: true },
        { name: 'pago', label: 'Se paga habitualmente con', type: 'select', options: FinUI.opcionesPago({ textoPendiente: 'Lo elijo cada mes' }) },
      ],
      guardar: (v) => {
        if (!(v.monto > 0)) return 'Escribí el monto';
        const pago = FinUI.leerPago(v.pago) || {};
        const r = Fin.recurrentes();
        r.plantillas.push({ id: Fin.nuevoId('rec'), concepto: v.concepto.trim(), tipo: v.tipo, categoria: v.categoria.trim(), proveedorId: v.proveedorId, iva: 0, moneda: v.moneda, monto: v.monto, cuentaId: pago.cuentaId || '', socioId: pago.socioId || '', activa: true });
        Fin.guardarRecurrentes(r);
        setTimeout(() => AdminExpenses.recurrentes(), 50);
      },
    });
  },

  borrarPlantilla(id) {
    if (!confirm('¿Quitar este gasto de los fijos? Los gastos que ya generó no se borran.')) return;
    const r = Fin.recurrentes();
    r.plantillas = r.plantillas.filter(p => String(p.id) !== String(id));
    Fin.guardarRecurrentes(r);
    this.recurrentes(document.getElementById('rec-mes')?.value);
  },
};

/* ======================== CUENTAS ======================== */
const AdminCuentas = {
  render() {
    const root = document.getElementById('cuentas-root');
    if (!root) return;
    const cuentas = Fin.cuentas();
    const disponible = Fin.disponible();
    root.innerHTML = `
      ${FinUI.avisoPlanilla()}
      <div class="products-toolbar"><div class="toolbar-left"></div><div class="toolbar-right">
        <button class="btn btn-primary" onclick="AdminCuentas.openForm()">+ Nueva cuenta</button>
        <button class="btn btn-secondary" onclick="AdminCuentas.transferir()">🔁 Transferir entre cuentas</button>
      </div></div>
      ${FinUI.tarjetas([
        { label: 'Disponible en cuentas', valor: FinUI.ars(disponible), cls: disponible < 0 ? 'alerta' : 'ok' },
        { label: 'A cobrar de clientes', valor: FinUI.ars(Fin.aCobrar()), onclick: "AdminApp.navigate('clientes')" },
        { label: 'A pagar a proveedores', valor: FinUI.ars(Fin.aPagar()), onclick: "AdminExpenses.filtros={mes:'todos',tipo:'',estado:'pendiente',proveedor:'',q:''};AdminApp.navigate('expenses')" },
      ])}
      ${FinUI.tabla([{ k: 'nombre', l: 'Cuenta' }, { k: 'tipo', l: 'Tipo' }, { k: 'comision', l: 'Comisión por cobro', num: true }, { k: 'saldo', l: 'Saldo', num: true }, { k: 'acc', l: '' }],
        cuentas.map(c => {
          const t = Fin.TIPOS_CUENTA.find(x => x.id === c.tipoCuenta) || {};
          const saldo = Fin.saldoCuenta(c);
          return {
            nombre: `<strong>${FinUI.esc(c.nombre)}</strong>${c.activa === false ? ' <span class="badge badge-inactive">Inactiva</span>' : ''}`,
            tipo: `${t.icon || ''} ${FinUI.esc(t.label || '')}`,
            comision: Number(c.comisionPct) ? `${String(c.comisionPct).replace(".", ",")}%` : '—',
            saldo: `<strong class="${saldo < 0 ? 'texto-error' : ''}">${FinUI.ars(saldo)}</strong>`,
            acc: `<div class="table-actions"><button class="btn btn-sm btn-secondary" onclick="AdminCuentas.detalle('${escJsAttr(c.id)}')">Movimientos</button>
              <button class="btn btn-sm btn-secondary" onclick="AdminCuentas.ajustar('${escJsAttr(c.id)}')" title="Corregir el saldo">⚖️</button>
              <button class="btn btn-sm btn-secondary" onclick="AdminCuentas.openForm('${escJsAttr(c.id)}')" aria-label="Editar">✏️</button></div>`,
          };
        }))}
      <p class="form-hint">💡 Las cuentas son dónde está la plata: la caja de efectivo, Mercado Pago, el banco. Cada cobro de una venta suma en una cuenta y cada pago de un gasto resta. Si Mercado Pago te cobra comisión, ponela en la cuenta y se carga sola como gasto en cada cobro.</p>`;
  },

  openForm(id) {
    const c = id ? Fin.get('cuentas', id) : null;
    FinUI.form({
      titulo: c ? 'Editar cuenta' : 'Nueva cuenta',
      valores: c || { tipoCuenta: 'billetera', saldoInicial: 0, comisionPct: 0, activa: true },
      campos: [
        { name: 'nombre', label: 'Nombre', required: true, placeholder: 'Ej: Mercado Pago, Caja del local, Banco Nación' },
        { name: 'tipoCuenta', label: 'Tipo', type: 'select', options: Fin.TIPOS_CUENTA.map(t => ({ v: t.id, l: `${t.icon} ${t.label}` })) },
        { name: 'saldoInicial', label: 'Saldo inicial', type: 'money', hint: 'Lo que había en la cuenta al empezar a usar Finanzas' },
        { name: 'comisionPct', label: 'Comisión por cobro (%)', type: 'number', hint: 'Ej: 6,29 para Mercado Pago. Se carga sola como gasto en cada cobro.' },
        { name: 'activa', label: 'Cuenta activa', type: 'check' },
      ],
      guardar: (v) => {
        if (!v.nombre.trim()) return 'Poné un nombre';
        Fin.save('cuentas', { ...(c || {}), nombre: v.nombre.trim(), tipoCuenta: v.tipoCuenta, saldoInicial: v.saldoInicial || 0, comisionPct: Math.max(0, Number(v.comisionPct) || 0), activa: v.activa, orden: c?.orden ?? Fin.cuentas().length + 1 });
        AdminApp.toast('Cuenta guardada');
      },
    });
  },

  transferir() {
    const ops = Fin.cuentas(true).map(c => ({ v: c.id, l: `${c.nombre} (${FinUI.ars(Fin.saldoCuenta(c))})` }));
    if (ops.length < 2) { AdminApp.toast('Necesitás al menos 2 cuentas', 'error'); return; }
    FinUI.form({
      titulo: '🔁 Transferir entre cuentas',
      valores: { desde: ops[0].v, hacia: ops[1].v, fecha: FinUI.hoyInput() },
      campos: [
        { name: 'desde', label: 'Desde', type: 'select', options: ops },
        { name: 'hacia', label: 'Hacia', type: 'select', options: ops },
        { name: 'monto', label: 'Monto', type: 'money', required: true },
        { name: 'fecha', label: 'Fecha', type: 'date' },
        { name: 'nota', label: 'Nota (opcional)', placeholder: 'Ej: Retiro de Mercado Pago al banco' },
      ],
      textoBoton: '🔁 Transferir',
      guardar: (v) => {
        if (v.desde === v.hacia) return 'Elegí dos cuentas distintas';
        if (!(v.monto > 0)) return 'Escribí el monto';
        Fin.transferir({ desdeId: v.desde, haciaId: v.hacia, monto: v.monto, fecha: FinUI.isoDeInput(v.fecha), nota: v.nota });
        AdminApp.toast('✅ Transferencia registrada');
      },
    });
  },

  ajustar(id) {
    const c = Fin.get('cuentas', id);
    if (!c) return;
    FinUI.form({
      titulo: `⚖️ Corregir saldo de ${c.nombre}`,
      valores: { saldo: Fin.saldoCuenta(c) },
      campos: [
        { name: 'info', type: 'html', html: `<p>El sistema calcula <strong>${FinUI.ars(Fin.saldoCuenta(c))}</strong>. Si en la realidad hay otro monto, escribilo y se registra un ajuste por la diferencia.</p>` },
        { name: 'saldo', label: 'Saldo real', type: 'money', required: true },
        { name: 'nota', label: 'Motivo', placeholder: 'Ej: Faltaba cargar una venta' },
      ],
      guardar: (v) => {
        if (v.saldo == null) return 'Escribí el saldo real';
        const m = Fin.ajustarSaldo(id, v.saldo, v.nota || 'Ajuste de saldo');
        AdminApp.toast(m ? '✅ Saldo corregido' : 'El saldo ya era ese');
      },
    });
  },

  detalle(id) {
    const c = Fin.get('cuentas', id);
    if (!c) return;
    const movs = Fin.movimientosDeCuenta(id);
    FinUI.ver(`Movimientos de ${c.nombre}`, `
      <p>Saldo actual: <strong>${FinUI.ars(Fin.saldoCuenta(c))}</strong> · saldo inicial ${FinUI.ars(c.saldoInicial)}</p>
      ${FinUI.tabla([{ k: 'fecha', l: 'Fecha' }, { k: 'tipo', l: 'Movimiento' }, { k: 'det', l: 'Detalle' }, { k: 'monto', l: 'Monto', num: true }, { k: 'acc', l: '' }],
        movs.map(m => {
          const ef = Fin.efecto(m, id);
          return { fecha: FinUI.fecha(m.fecha), tipo: Fin.ETIQUETA_MOV[m.tipo] || m.tipo, det: FinUI.esc(m.tipo === 'transferencia' ? `${Fin.get('cuentas', m.cuentaId)?.nombre || '?'} → ${Fin.get('cuentas', m.cuentaDestinoId)?.nombre || '?'}` : (m.nota || '')),
            monto: `<strong style="color:${ef < 0 ? '#DC2626' : '#059669'}">${ef < 0 ? '−' : '+'}${FinUI.ars(Math.abs(ef))}</strong>`,
            acc: ['transferencia', 'ajuste', 'aporte', 'retiro', 'cobro_cuenta'].includes(m.tipo) ? `<button class="btn btn-sm btn-danger" onclick="AdminCuentas.borrarMov('${escJsAttr(m.id)}','${escJsAttr(id)}')" aria-label="Borrar">🗑️</button>` : '' };
        }), 'Sin movimientos todavía.')}
      <p class="form-hint">Los cobros y pagos se borran desde la venta o el gasto.</p>`);
  },

  borrarMov(movId, cuentaId) {
    if (!confirm('¿Borrar este movimiento? El saldo se recalcula.')) return;
    Fin.remove('movimientos', movId);
    this.detalle(cuentaId);
    this.render();
  },
};

/* ======================== CLIENTES ======================== */
const AdminClientes = {
  q: '', soloDeuda: false,

  render() {
    const root = document.getElementById('clientes-root');
    if (!root) return;
    let lista = Fin.clientesResumen();
    if (this.q) { const q = this.q.toLowerCase(); lista = lista.filter(r => `${r.nombre} ${r.telefono}`.toLowerCase().includes(q)); }
    if (this.soloDeuda) lista = lista.filter(r => r.deuda > 0);
    lista.sort((a, b) => b.deuda - a.deuda || new Date(b.ultima || 0) - new Date(a.ultima || 0));
    const deuda = Fin.aCobrar();
    root.innerHTML = `
      ${FinUI.avisoPlanilla()}
      <div class="products-toolbar">
        <div class="toolbar-left fin-filtros">
          <input type="text" class="search-input" placeholder="Buscar cliente o teléfono…" value="${FinUI.esc(this.q)}" oninput="AdminClientes.q=this.value; clearTimeout(this._t); this._t=setTimeout(()=>AdminClientes.render(),300)">
          <label class="fin-check"><input type="checkbox" ${this.soloDeuda ? 'checked' : ''} onchange="AdminClientes.soloDeuda=this.checked; AdminClientes.render()"> Solo los que deben</label>
        </div>
        <div class="toolbar-right"><button class="btn btn-primary" onclick="AdminClientes.openForm()">+ Nuevo cliente</button></div>
      </div>
      ${FinUI.tarjetas([
        { label: 'Clientes', valor: String(lista.length) },
        { label: 'A cobrar', valor: FinUI.ars(deuda), cls: deuda > 0 ? 'alerta' : 'ok' },
        { label: 'Con deuda', valor: String(Fin.clientesResumen().filter(r => r.deuda > 0).length) },
      ])}
      ${FinUI.tabla([{ k: 'nombre', l: 'Cliente' }, { k: 'compras', l: 'Compras', num: true }, { k: 'comprado', l: 'Total comprado', num: true }, { k: 'ultima', l: 'Última compra' }, { k: 'deuda', l: 'Debe', num: true }, { k: 'acc', l: '' }],
        lista.map(r => ({
          nombre: `<strong>${FinUI.esc(r.nombre)}</strong>${r.telefono ? `<br><small>📞 ${FinUI.esc(r.telefono)}</small>` : ''}${!r.ficha ? ' <span class="badge" title="Compró por la web: no tiene ficha">web</span>' : ''}`,
          compras: r.compras, comprado: FinUI.ars(r.comprado), ultima: r.ultima ? FinUI.fecha(r.ultima) : '—',
          deuda: r.deuda > 0 ? `<strong class="texto-error">${FinUI.ars(r.deuda)}</strong>` : (r.deuda < 0 ? `<span style="color:#059669">A favor ${FinUI.ars(-r.deuda)}</span>` : '—'),
          acc: `<div class="table-actions">
            ${r.deuda > 0 ? `<button class="btn btn-sm btn-primary" onclick="AdminClientes.cobrar('${escJsAttr(r.clave)}')">Cobrar</button>` : ''}
            <button class="btn btn-sm btn-secondary" onclick="AdminClientes.cuentaCorriente('${escJsAttr(r.clave)}')">Cuenta corriente</button>
            ${r.ficha ? `<button class="btn btn-sm btn-secondary" onclick="AdminClientes.openForm('${escJsAttr(r.ficha.id)}')" aria-label="Editar">✏️</button>`
              : `<button class="btn btn-sm btn-secondary" onclick="AdminClientes.crearFicha('${escJsAttr(r.clave)}')" title="Guardar como cliente">💾</button>`}</div>`,
        })), 'Todavía no hay clientes. Se suman solos con cada venta.')}`;
  },

  campos() {
    return [
      { name: 'nombre', label: 'Nombre', required: true }, { name: 'telefono', label: 'Teléfono / WhatsApp' },
      { name: 'email', label: 'Email' }, { name: 'direccion', label: 'Dirección' },
      { name: 'localidad', label: 'Localidad' }, { name: 'provincia', label: 'Provincia' },
      { name: 'cuit', label: 'CUIT / DNI (para facturar)' }, { name: 'notas', label: 'Notas', type: 'textarea', full: true },
    ];
  },

  openForm(id, pre) {
    const c = id ? Fin.get('clientes', id) : null;
    FinUI.form({
      titulo: c ? 'Editar cliente' : 'Nuevo cliente', valores: c || pre || {}, campos: this.campos(),
      guardar: (v) => {
        if (!v.nombre.trim()) return 'Poné el nombre';
        Fin.save('clientes', { ...(c || {}), ...Object.fromEntries(Object.entries(v).map(([k, x]) => [k, String(x ?? '').trim()])) });
        AdminApp.toast('Cliente guardado');
      },
    });
  },

  crearFicha(clave) {
    const r = Fin.clientesResumen().find(x => x.clave === clave);
    const o = r?.pedidos?.[0] || {};
    this.openForm(null, { nombre: r?.nombre || '', telefono: r?.telefono || '', email: o.email || '', direccion: o.direccion || '', localidad: o.localidad || '', provincia: o.provincia || '' });
  },

  cuentaCorriente(clave) {
    const r = Fin.clientesResumen().find(x => x.clave === clave);
    if (!r) return;
    const movs = Fin.cuentaCorriente(clave);
    FinUI.ver(`Cuenta corriente · ${r.nombre}`, `
      ${FinUI.tarjetas([{ label: 'Compras', valor: String(r.compras) }, { label: 'Total comprado', valor: FinUI.ars(r.comprado) }, { label: r.deuda >= 0 ? 'Debe' : 'Saldo a favor', valor: FinUI.ars(Math.abs(r.deuda)), cls: r.deuda > 0 ? 'alerta' : 'ok' }])}
      ${FinUI.tabla([{ k: 'fecha', l: 'Fecha' }, { k: 'tipo', l: 'Movimiento' }, { k: 'detalle', l: 'Detalle' }, { k: 'debe', l: 'Debe', num: true }, { k: 'haber', l: 'Pagó', num: true }, { k: 'saldo', l: 'Saldo', num: true }],
        movs.map(m => ({ fecha: FinUI.fecha(m.fecha), tipo: m.tipo, detalle: FinUI.esc(m.detalle), debe: m.debe ? FinUI.ars(m.debe) : '', haber: m.haber ? FinUI.ars(m.haber) : '', saldo: `<strong>${FinUI.ars(m.saldo)}</strong>` })), 'Sin movimientos.')}`,
      r.deuda > 0 ? `<button type="button" class="btn btn-primary" onclick="AdminClientes.cobrar('${escJsAttr(clave)}')">💰 Cobrar</button>` : '');
  },

  cobrar(clave) {
    const r = Fin.clientesResumen().find(x => x.clave === clave);
    if (!r) return;
    FinUI.form({
      titulo: `💰 Cobrar a ${r.nombre}`,
      valores: { monto: Math.max(0, r.deuda), pago: 'cuenta:' + (Fin.cuentaPorDefecto()?.id || ''), fecha: FinUI.hoyInput() },
      campos: [
        { name: 'info', type: 'html', html: `<p>Debe <strong>${FinUI.ars(r.deuda)}</strong>. El pago se aplica a las ventas más viejas.${r.ficha ? ' Si paga de más, queda como saldo a favor.' : ''}</p>` },
        { name: 'monto', label: 'Monto que paga', type: 'money', required: true },
        { name: 'pago', label: 'Entra en', type: 'select', options: FinUI.opcionesPago({ pendiente: false }) },
        { name: 'fecha', label: 'Fecha', type: 'date' },
      ],
      textoBoton: '💰 Registrar cobro',
      guardar: (v) => {
        if (!(v.monto > 0)) return 'Escribí el monto';
        if (!r.ficha && v.monto > r.deuda + 0.5) return `No tiene ficha de cliente: no puede pagar más de lo que debe (${FinUI.ars(r.deuda)})`;
        Fin.cobrarACliente(clave, { ...FinUI.leerPago(v.pago), monto: v.monto, fecha: FinUI.isoDeInput(v.fecha) });
        AdminApp.toast('✅ Cobro registrado');
      },
    });
  },
};

/* ======================== PROVEEDORES ======================== */
const AdminProveedores = {
  render() {
    const root = document.getElementById('proveedores-root');
    if (!root) return;
    const lista = Fin.proveedoresResumen().sort((a, b) => b.deuda - a.deuda || String(a.nombre).localeCompare(String(b.nombre)));
    root.innerHTML = `
      ${FinUI.avisoPlanilla()}
      <div class="products-toolbar"><div class="toolbar-left"></div><div class="toolbar-right"><button class="btn btn-primary" onclick="AdminProveedores.openForm()">+ Nuevo proveedor</button></div></div>
      ${FinUI.tarjetas([{ label: 'Proveedores', valor: String(lista.length) }, { label: 'A pagar', valor: FinUI.ars(Fin.aPagar()), cls: Fin.aPagar() > 0 ? 'alerta' : 'ok' }])}
      ${FinUI.tabla([{ k: 'nombre', l: 'Proveedor' }, { k: 'tipo', l: 'De qué' }, { k: 'total', l: 'Total gastado', num: true }, { k: 'deuda', l: 'Le debés', num: true }, { k: 'acc', l: '' }],
        lista.map(p => ({
          nombre: `<strong>${FinUI.esc(p.nombre)}</strong>${p.telefono ? `<br><small>📞 ${FinUI.esc(p.telefono)}</small>` : ''}`,
          tipo: p.tipoProveedor === 'mercaderia' ? '👗 Mercadería' : '🧾 Gastos y servicios',
          total: FinUI.ars(p.total), deuda: p.deuda > 0 ? `<strong class="texto-error">${FinUI.ars(p.deuda)}</strong>` : '—',
          acc: `<div class="table-actions"><button class="btn btn-sm btn-secondary" onclick="AdminProveedores.detalle('${escJsAttr(p.id)}')">Ver gastos</button>
            <button class="btn btn-sm btn-secondary" onclick="AdminProveedores.openForm('${escJsAttr(p.id)}')" aria-label="Editar">✏️</button>
            <button class="btn btn-sm btn-danger" onclick="AdminProveedores.borrar('${escJsAttr(p.id)}')" aria-label="Eliminar">🗑️</button></div>`,
        })), 'Todavía no hay proveedores. Agregalos acá o al cargar un gasto.')}`;
  },

  openForm(id) {
    const p = id ? Fin.get('proveedores', id) : null;
    FinUI.form({
      titulo: p ? 'Editar proveedor' : 'Nuevo proveedor', valores: p || { tipoProveedor: 'mercaderia' },
      campos: [
        { name: 'nombre', label: 'Nombre', required: true },
        { name: 'tipoProveedor', label: 'Te vende', type: 'select', options: [{ v: 'mercaderia', l: '👗 Mercadería (ropa, lencería…)' }, { v: 'gastos', l: '🧾 Servicios y gastos (alquiler, luz, correo…)' }] },
        { name: 'telefono', label: 'Teléfono' }, { name: 'email', label: 'Email' }, { name: 'cuit', label: 'CUIT' },
        { name: 'notas', label: 'Notas', type: 'textarea', full: true },
      ],
      guardar: (v) => {
        if (!v.nombre.trim()) return 'Poné el nombre';
        Fin.save('proveedores', { ...(p || {}), ...Object.fromEntries(Object.entries(v).map(([k, x]) => [k, String(x ?? '').trim()])) });
        AdminApp.toast('Proveedor guardado');
      },
    });
  },

  detalle(id) {
    const p = Fin.proveedoresResumen().find(x => String(x.id) === String(id));
    if (!p) return;
    FinUI.ver(`${p.nombre}`, `
      ${FinUI.tarjetas([{ label: 'Total', valor: FinUI.ars(p.total) }, { label: 'Le debés', valor: FinUI.ars(p.deuda), cls: p.deuda > 0 ? 'alerta' : 'ok' }])}
      ${FinUI.tabla([{ k: 'mes', l: 'Mes' }, { k: 'concepto', l: 'Gasto' }, { k: 'monto', l: 'Monto', num: true }, { k: 'estado', l: 'Estado' }, { k: 'acc', l: '' }],
        p.gastos.sort((a, b) => (b.mes || '').localeCompare(a.mes || '')).map(g => ({
          mes: g.mes ? Fin.nombreMes(g.mes) : '', concepto: FinUI.esc(g.concepto), monto: FinUI.ars(g.monto), estado: FinUI.badgeEstado(Fin.estadoGasto(g)),
          acc: Fin.estadoGasto(g) !== 'pagado' ? `<button class="btn btn-sm btn-primary" onclick="AdminExpenses.pagar('${escJsAttr(g.id)}')">Pagar</button>` : '',
        })), 'No tiene gastos cargados.')}`);
  },

  borrar(id) {
    const p = Fin.proveedoresResumen().find(x => String(x.id) === String(id));
    if (!p) return;
    if (!confirm(`¿Eliminar a ${p.nombre}?${p.gastos.length ? `\n\nSus ${p.gastos.length} gastos quedan, pero sin proveedor.` : ''}`)) return;
    p.gastos.forEach(g => AdminData.updateExpense(g.id, { proveedorId: '' }));
    Fin.remove('proveedores', id);
    this.render();
  },
};

/* ======================== SOCIOS ======================== */
const AdminSocios = {
  render() {
    const root = document.getElementById('socios-root');
    if (!root) return;
    const socios = Fin.sociosResumen();
    const movs = Fin.list('movimientos').filter(m => ['aporte', 'retiro'].includes(m.tipo)).sort((a, b) => new Date(b.fecha) - new Date(a.fecha));
    const tot = t => movs.filter(m => m.tipo === t).reduce((s, m) => s + (Number(m.monto) || 0), 0);
    root.innerHTML = `
      ${FinUI.avisoPlanilla()}
      <div class="products-toolbar"><div class="toolbar-left"></div><div class="toolbar-right">
        <button class="btn btn-primary" onclick="AdminSocios.movimiento()" ${socios.length ? '' : 'disabled'}>+ Aporte o retiro</button>
        <button class="btn btn-secondary" onclick="AdminSocios.openForm()">+ Nuevo socio</button>
      </div></div>
      ${FinUI.tarjetas([{ label: 'Aportes', valor: FinUI.ars(tot('aporte')), cls: 'ok' }, { label: 'Retiros', valor: FinUI.ars(tot('retiro')) }, { label: 'Neto (aportes − retiros)', valor: FinUI.ars(tot('aporte') - tot('retiro')) }])}
      ${FinUI.tabla([{ k: 'nombre', l: 'Socio' }, { k: 'pct', l: 'Participación', num: true }, { k: 'aportes', l: 'Aportó', num: true }, { k: 'retiros', l: 'Retiró', num: true }, { k: 'neto', l: 'Neto', num: true }, { k: 'acc', l: '' }],
        socios.map(s => ({ nombre: `<strong>${FinUI.esc(s.nombre)}</strong>`, pct: s.pct.toFixed(1) + '%', aportes: FinUI.ars(s.aportes + s.pagoConSuPlata), retiros: FinUI.ars(s.retiros + s.cobroParaEl), neto: `<strong>${FinUI.ars(s.neto)}</strong>`,
          acc: `<div class="table-actions"><button class="btn btn-sm btn-secondary" onclick="AdminSocios.openForm('${escJsAttr(s.id)}')" aria-label="Editar">✏️</button></div>` })),
        'Cargá a las dueñas del negocio (ej. Yanela) para registrar la plata que ponen y la que sacan. Los retiros no son gastos: no bajan la ganancia.')}
      <h3 class="fin-subtitulo">Últimos aportes y retiros</h3>
      ${FinUI.tabla([{ k: 'fecha', l: 'Fecha' }, { k: 'socio', l: 'Socio' }, { k: 'tipo', l: 'Tipo' }, { k: 'cuenta', l: 'Cuenta' }, { k: 'monto', l: 'Monto', num: true }, { k: 'nota', l: 'Nota' }, { k: 'acc', l: '' }],
        movs.slice(0, 100).map(m => ({ fecha: FinUI.fecha(m.fecha), socio: FinUI.esc(Fin.get('socios', m.socioId)?.nombre || '—'), tipo: Fin.ETIQUETA_MOV[m.tipo], cuenta: FinUI.esc(Fin.get('cuentas', m.cuentaId)?.nombre || '—'),
          monto: FinUI.ars(m.monto), nota: FinUI.esc(m.nota || ''), acc: `<button class="btn btn-sm btn-danger" onclick="AdminSocios.borrarMov('${escJsAttr(m.id)}')" aria-label="Borrar">🗑️</button>` })), 'Sin movimientos.')}`;
  },

  openForm(id) {
    const s = id ? Fin.get('socios', id) : null;
    FinUI.form({
      titulo: s ? 'Editar socio' : 'Nuevo socio', valores: s || { participacion: 1 },
      campos: [
        { name: 'nombre', label: 'Nombre', required: true },
        { name: 'participacion', label: 'Participación', type: 'number', hint: 'Como acciones: 1 y 1 = 50% cada una; 70 y 30 = 70% y 30%' },
        { name: 'email', label: 'Email (opcional)' },
      ],
      guardar: (v) => {
        if (!v.nombre.trim()) return 'Poné el nombre';
        Fin.save('socios', { ...(s || {}), nombre: v.nombre.trim(), participacion: Math.max(0, Number(v.participacion) || 0), email: v.email.trim(), notas: s?.notas || '' });
        AdminApp.toast('Socio guardado');
      },
    });
  },

  movimiento() {
    const socios = Fin.list('socios');
    FinUI.form({
      titulo: 'Aporte o retiro', valores: { socioId: socios[0]?.id, tipo: 'retiro', cuentaId: Fin.cuentaPorDefecto()?.id, fecha: FinUI.hoyInput() },
      campos: [
        { name: 'tipo', label: 'Tipo', type: 'pills', options: [{ v: 'aporte', l: '➕ Aporte (pone plata)' }, { v: 'retiro', l: '➖ Retiro (saca plata)' }] },
        { name: 'socioId', label: 'Socio', type: 'select', options: socios.map(s => ({ v: s.id, l: s.nombre })) },
        { name: 'cuentaId', label: 'Cuenta', type: 'select', options: Fin.cuentas(true).map(c => ({ v: c.id, l: `${c.nombre} (${FinUI.ars(Fin.saldoCuenta(c))})` })) },
        { name: 'monto', label: 'Monto', type: 'money', required: true },
        { name: 'fecha', label: 'Fecha', type: 'date' },
        { name: 'nota', label: 'Observaciones', placeholder: 'Ej: Sueldo de noviembre, capital inicial' },
      ],
      guardar: (v) => {
        if (!(v.monto > 0)) return 'Escribí el monto';
        Fin.aporteRetiro({ ...v, fecha: FinUI.isoDeInput(v.fecha) });
        AdminApp.toast(v.tipo === 'retiro' ? '✅ Retiro registrado' : '✅ Aporte registrado');
      },
    });
  },

  borrarMov(id) {
    if (!confirm('¿Borrar este movimiento? El saldo de la cuenta se recalcula.')) return;
    Fin.remove('movimientos', id);
    this.render();
  },
};

/* ======================== CAJA (TURNOS) ======================== */
const AdminCaja = {
  render() {
    const root = document.getElementById('caja-root');
    if (!root) return;
    const t = Fin.turnoAbierto();
    const hist = Fin.list('turnos').filter(x => x.estado === 'cerrado').sort((a, b) => new Date(b.fecha) - new Date(a.fecha));
    let panel;
    if (t) {
      const r = Fin.resumenTurno(t);
      const cuenta = Fin.get('cuentas', t.cuentaId);
      panel = `
        <div class="chart-card fin-turno">
          <h3>🟢 Caja abierta desde ${AdminApp.formatDateTime ? AdminApp.formatDateTime(t.fecha) : FinUI.fecha(t.fecha)}</h3>
          ${FinUI.tarjetas([
            { label: `Fondo inicial (${FinUI.esc(cuenta?.nombre || 'Efectivo')})`, valor: FinUI.ars(t.montoInicial) },
            { label: 'Entradas en efectivo', valor: FinUI.ars(r.entradas), cls: 'ok' },
            { label: 'Salidas en efectivo', valor: FinUI.ars(r.salidas) },
            { label: 'Tendría que haber', valor: FinUI.ars(r.esperado), cls: 'destacada' },
          ])}
          ${Object.keys(r.cobrosPorCuenta).length ? `<p><strong>Cobros del turno por cuenta:</strong> ${Object.entries(r.cobrosPorCuenta).map(([k, v]) => `${FinUI.esc(k)} ${FinUI.ars(v)}`).join(' · ')}</p>` : ''}
          ${FinUI.tabla([{ k: 'fecha', l: 'Hora' }, { k: 'tipo', l: 'Movimiento' }, { k: 'nota', l: 'Detalle' }, { k: 'monto', l: 'Monto', num: true }],
            r.movimientos.map(m => { const ef = Fin.efecto(m, t.cuentaId); return { fecha: new Date(m.fecha).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' }), tipo: Fin.ETIQUETA_MOV[m.tipo] || m.tipo, nota: FinUI.esc(m.nota || ''), monto: `<strong style="color:${ef < 0 ? '#DC2626' : '#059669'}">${ef < 0 ? '−' : '+'}${FinUI.ars(Math.abs(ef))}</strong>` }; }),
            'Todavía no hubo movimientos de efectivo en este turno.')}
          <div style="display:flex; gap:0.5rem; flex-wrap:wrap; margin-top:1rem;">
            <button class="btn btn-primary" onclick="AdminCaja.cerrar()">🔒 Cerrar caja (arqueo)</button>
            <button class="btn btn-secondary" onclick="AdminOrders.openForm(null, { origen: 'local' })">🛒 Venta en el local</button>
            <button class="btn btn-secondary" onclick="AdminExpenses.openForm()">💸 Gasto</button>
          </div>
        </div>`;
    } else {
      panel = `<div class="chart-card fin-turno"><h3>Caja cerrada</h3><p>Abrí la caja al empezar el día con el efectivo que tenés. Al cerrar, contás la plata y el sistema te dice si sobra o falta.</p>
        <button class="btn btn-primary" onclick="AdminCaja.abrir()">🟢 Abrir caja</button></div>`;
    }
    root.innerHTML = `${FinUI.avisoPlanilla()}${panel}
      <h3 class="fin-subtitulo">Cierres anteriores</h3>
      ${FinUI.tabla([{ k: 'fecha', l: 'Abrió' }, { k: 'cierre', l: 'Cerró' }, { k: 'ini', l: 'Fondo', num: true }, { k: 'esp', l: 'Esperado', num: true }, { k: 'cont', l: 'Contado', num: true }, { k: 'dif', l: 'Diferencia', num: true }],
        hist.slice(0, 60).map(x => ({ fecha: FinUI.fecha(x.fecha), cierre: FinUI.fecha(x.cierre), ini: FinUI.ars(x.montoInicial), esp: FinUI.ars(x.esperado), cont: FinUI.ars(x.contado),
          dif: Number(x.diferencia) ? `<strong class="${x.diferencia < 0 ? 'texto-error' : ''}">${x.diferencia > 0 ? 'Sobró ' : 'Faltó '}${FinUI.ars(Math.abs(x.diferencia))}</strong>` : '✅ Justo' })), 'Todavía no cerraste ninguna caja.')}`;
  },

  abrir() {
    const ef = Fin.cuentaEfectivo();
    FinUI.form({
      titulo: '🟢 Abrir caja', valores: { cuentaId: ef?.id, montoInicial: ef ? Math.max(0, Fin.saldoCuenta(ef)) : 0 },
      campos: [
        { name: 'cuentaId', label: 'Cuenta de efectivo', type: 'select', options: Fin.cuentas(true).map(c => ({ v: c.id, l: c.nombre })) },
        { name: 'montoInicial', label: 'Efectivo con el que arrancás', type: 'money', hint: 'Contá la plata de la caja' },
        { name: 'notas', label: 'Notas (opcional)' },
      ],
      textoBoton: '🟢 Abrir',
      guardar: (v) => { Fin.abrirTurno({ cuentaId: v.cuentaId, montoInicial: v.montoInicial || 0, notas: v.notas }); AdminApp.toast('Caja abierta'); },
    });
  },

  cerrar() {
    const t = Fin.turnoAbierto();
    if (!t) return;
    const r = Fin.resumenTurno(t);
    const billetes = [20000, 10000, 2000, 1000, 500, 200, 100];
    FinUI.form({
      titulo: '🔒 Cerrar caja', valores: { ajustar: true },
      campos: [
        { name: 'info', type: 'html', html: `<p>Tendría que haber <strong>${FinUI.ars(r.esperado)}</strong> en efectivo.</p>
          <details class="fin-billetes"><summary>Contar por billete (opcional)</summary><div class="fin-billetes__grid">${billetes.map(b => `<label>$${b.toLocaleString('es-AR')} × <input type="number" min="0" data-billete="${b}" oninput="AdminCaja.sumarBilletes()"></label>`).join('')}</div></details>` },
        { name: 'contado', label: 'Efectivo que contaste', type: 'money', required: true },
        { name: 'ajustar', label: 'Si sobra o falta, corregir el saldo de la cuenta', type: 'check' },
        { name: 'notas', label: 'Notas (opcional)' },
      ],
      textoBoton: '🔒 Cerrar caja',
      alCambiar: (v) => {
        if (v.contado == null) { FinUI.hint('contado', ''); return; }
        const d = Math.round((v.contado - r.esperado) * 100) / 100;
        FinUI.hint('contado', d === 0 ? '✅ Da justo' : (d > 0 ? `Sobran <strong>${FinUI.ars(d)}</strong>` : `<span class="texto-error">Faltan <strong>${FinUI.ars(-d)}</strong></span>`));
      },
      guardar: (v) => {
        if (v.contado == null) return 'Escribí cuánto efectivo contaste';
        const c = Fin.cerrarTurno(t, v.contado, v.notas, v.ajustar);
        AdminApp.toast(c.diferencia ? `Caja cerrada · ${c.diferencia > 0 ? 'sobraron' : 'faltaron'} ${FinUI.ars(Math.abs(c.diferencia))}` : '✅ Caja cerrada: da justo');
      },
    });
  },

  sumarBilletes() {
    const total = [...document.querySelectorAll('[data-billete]')].reduce((s, i) => s + (Number(i.value) || 0) * Number(i.dataset.billete), 0);
    const el = document.getElementById('ff-contado');
    if (el) { el.value = total ? String(total) : ''; FinUI.refrescarForm(); }
  },
};

window.addEventListener('fin:cambio', () => { try { AdminApp.actualizarBadges?.(); } catch {} });
