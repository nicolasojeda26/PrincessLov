/* ============================================
   ADMIN ORDERS - Gestión de Pedidos
   ============================================ */

const AdminOrders = {
  searchQuery: '',
  filterStatus: '',
  filterOrigen: '',

  esc(s) { return escHtml(s); },

  render() {
    this.populateFilters();
    this.renderList();
  },

  populateFilters() {
    const statusSelect = document.getElementById('orders-filter-status');
    const ofEstado = document.getElementById('of-estado');
    const ofPago = document.getElementById('of-pago');
    const ofEnvio = document.getElementById('of-envio');
    const ofOrigen = document.getElementById('of-origen');
    const filtroOrigen = document.getElementById('orders-filter-origen');
    const origenes = ADMIN_CONFIG.origenesVenta || [];
    if (ofOrigen) ofOrigen.innerHTML = origenes.map(o => `<option value="${o.id}">${o.icon} ${o.label}</option>`).join('');
    if (filtroOrigen) {
      const v = filtroOrigen.value;
      filtroOrigen.innerHTML = '<option value="">Todos los canales</option>' + origenes.map(o => `<option value="${o.id}">${o.icon} ${o.label}</option>`).join('');
      filtroOrigen.value = v;
    }

    if (statusSelect) {
      statusSelect.innerHTML = '<option value="">Todos los estados</option>';
      ADMIN_CONFIG.estadosPedido.forEach(ep => {
        statusSelect.innerHTML += `<option value="${ep.id}">${ep.icon} ${ep.label}</option>`;
      });
    }

    if (ofEstado) {
      ofEstado.innerHTML = '';
      ADMIN_CONFIG.estadosPedido.forEach(ep => {
        ofEstado.innerHTML += `<option value="${ep.id}">${ep.icon} ${ep.label}</option>`;
      });
    }

    if (ofPago) {
      ofPago.innerHTML = '';
      ADMIN_CONFIG.mediosPago.forEach(mp => {
        ofPago.innerHTML += `<option value="${mp}">${mp}</option>`;
      });
    }

    if (ofEnvio) {
      ofEnvio.innerHTML = '';
      ADMIN_CONFIG.metodosEnvio.forEach(me => {
        ofEnvio.innerHTML += `<option value="${me}">${me}</option>`;
      });
    }
  },

  getFiltered() {
    let orders = AdminData.getOrders();

    if (this.searchQuery) {
      const q = this.searchQuery.toLowerCase();
      orders = orders.filter(o =>
        (o.cliente || '').toLowerCase().includes(q) ||
        String(o.id || '').toLowerCase().includes(q) ||
        String(o.telefono || '').includes(q) ||
        (o.notas || '').toLowerCase().includes(q)
      );
    }

    if (this.filterStatus) {
      orders = orders.filter(o => o.estado === this.filterStatus);
    }

    if (this.filterOrigen) {
      orders = orders.filter(o => AdminData.origenDe(o).id === this.filterOrigen);
    }

    return orders.sort((a, b) => new Date(b.fecha || 0) - new Date(a.fecha || 0));
  },

  renderList() {
    const orders = this.getFiltered();
    const container = document.getElementById('orders-list');
    const empty = document.getElementById('orders-empty');

    if (orders.length === 0) {
      if (container) container.innerHTML = '';
      if (empty) empty.style.display = 'block';
      return;
    }

    if (empty) empty.style.display = 'none';

    container.innerHTML = orders.map(o => {
      const estado = ADMIN_CONFIG.estadosPedido.find(ep => ep.id === o.estado) || ADMIN_CONFIG.estadosPedido[0];
      const items = (o.items || []).map(i => {
        const prod = AdminData.getProduct(i.productoId);
        return `${this.esc(prod?.nombre || i.nombre || i.productoId)}${AdminData.varianteLegible(i.variante) ? ` (${this.esc(AdminData.varianteLegible(i.variante))})` : ''} x${Number(i.cantidad) || 0}`;
      }).join(', ');
      const tel = String(o.telefono || '').replace(/\D/g, '');
      const telWa = tel ? (tel.startsWith('54') ? tel : '549' + tel.replace(/^0/, '')) : '';
      const waLink = telWa ? `https://wa.me/${telWa}?text=${encodeURIComponent(`¡Hola ${o.cliente || ''}! Te escribimos de PrincessLov por tu pedido #${o.id}.`)}` : '';

      return `
        <div class="order-card" style="border-left:4px solid ${estado.color};">
          <div style="display:flex; justify-content:space-between; align-items:start; margin-bottom:0.75rem;">
            <div>
              <strong style="font-size:1rem;">${this.esc(o.cliente || 'Sin cliente')}</strong>
              <span style="font-size:0.8rem; color:var(--texto-secundario); margin-left:0.5rem;">#${this.esc(String(o.id || '').startsWith('PL-') ? o.id : String(o.id || '').slice(-6).toUpperCase())}</span>
              <span class="order-origin">${AdminData.origenDe(o).icon} ${this.esc(AdminData.origenDe(o).label)}</span>
              ${(() => { const p = Fin.pagoDePedido(o); return p.estado === 'pendiente' || p.estado === 'parcial' ? `<span class="order-origin order-debe">⏳ Debe ${AdminData.formatARS(p.saldo)}</span>` : (p.estado === 'pagado' && !p.sinRegistrar ? '<span class="order-origin">💳 Cobrado</span>' : ''); })()}
            </div>
            <span class="badge" style="background:${estado.color}; color:white;">${estado.icon} ${estado.label}</span>
          </div>
          <div style="font-size:0.85rem; color:var(--texto-secundario); margin-bottom:0.5rem;">
            ${items || 'Sin items'}
          </div>
          <div style="display:flex; justify-content:space-between; align-items:center;">
            <div style="font-size:0.8rem; color:var(--texto-secundario);">
              📅 ${AdminApp.formatDate(o.fecha)} &nbsp;|&nbsp; 💳 ${this.esc(o.medioPago || '-')} &nbsp;|&nbsp; 🚚 ${this.esc(o.metodoEnvio || '-')}${o.localidad ? ` &nbsp;|&nbsp; 📍 ${this.esc(o.localidad)}` : ''}
            </div>
            <strong style="color:var(--borgona-300);">${AdminData.formatARS(o.total || 0)}</strong>
          </div>
          <div style="display:flex; gap:0.5rem; margin-top:0.75rem;">
            <button class="btn btn-sm btn-secondary" onclick="AdminOrders.openForm('${escJsAttr(o.id)}')">✏️ Editar</button>
            ${waLink ? `<a class="btn btn-sm btn-secondary" href="${this.esc(waLink)}" target="_blank" rel="noopener">💬 WhatsApp</a>` : ''}
            <button class="btn btn-sm btn-danger" onclick="AdminOrders.delete('${escJsAttr(o.id)}')" aria-label="Eliminar pedido">🗑️</button>
          </div>
        </div>
      `;
    }).join('');
  },

  search(query) {
    this.searchQuery = query;
    this.renderList();
  },

  filterByStatus(status) {
    this.filterStatus = status;
    this.renderList();
  },

  filterByOrigen(origen) {
    this.filterOrigen = origen;
    this.renderList();
  },

  /**
   * @param {string} id     pedido a editar (vacío = venta nueva)
   * @param {Object} pre    datos para una venta nueva: { productoId, variante }
   */
  openForm(id, pre = {}) {
    this.populateFilters();
    const modal = document.getElementById('order-modal');
    const title = document.getElementById('order-modal-title');
    const container = document.getElementById('order-items-container');

    if (id) {
      const o = AdminData.getOrder(id);
      if (!o) return;
      title.textContent = 'Editar Pedido #' + (String(id).startsWith('PL-') ? id : String(id).slice(-6).toUpperCase());
      document.getElementById('of-id').value = o.id;
      document.getElementById('of-cliente').value = o.cliente || '';
      document.getElementById('of-telefono').value = o.telefono || '';
      document.getElementById('of-email').value = o.email || '';
      document.getElementById('of-estado').value = o.estado || 'pendiente';
      document.getElementById('of-pago').value = o.medioPago || '';
      document.getElementById('of-envio').value = o.metodoEnvio || '';
      document.getElementById('of-direccion').value = o.direccion || '';
      document.getElementById('of-origen').value = AdminData.origenDe(o).id;
      // Los pedidos de la web llegan sin costo: se sugiere el calculado
      const costoEl = document.getElementById('of-costo');
      costoEl.value = Number(o.costoTotal) || AdminData.costoPedido(o) || 0;
      costoEl.dataset.auto = Number(o.costoTotal) ? '' : costoEl.value;
      document.getElementById('of-notas').value = o.notas || '';

      container.innerHTML = '';
      (o.items || []).forEach(item => this.addItemRow(item));
      this.prepararCobro(o);
    } else {
      title.textContent = 'Registrar venta';
      document.getElementById('order-form').reset();
      document.getElementById('of-id').value = '';
      // Venta cargada a mano (WhatsApp, Instagram, en persona): ya está hecha
      document.getElementById('of-estado').value = 'confirmado';
      document.getElementById('of-origen').value = pre.origen || 'whatsapp';
      const costoEl = document.getElementById('of-costo');
      costoEl.value = '';
      costoEl.dataset.auto = '';
      container.innerHTML = '';
      const prod = pre.productoId ? AdminData.getProduct(pre.productoId) : null;
      this.addItemRow(prod ? { productoId: prod.id, cantidad: 1, precioUnitario: AdminData.precioVentaARS(prod), variante: pre.variante || '' } : undefined);
      this.recalcularCosto();
      this.prepararCobro(null);
    }

    modal.classList.add('open');
  },

  closeForm() {
    document.getElementById('order-modal').classList.remove('open');
  },

  addItemRow(item) {
    const container = document.getElementById('order-items-container');
    const products = AdminData.getProducts();
    const row = document.createElement('div');
    row.className = 'form-grid order-item-row';
    row.innerHTML = `
      <div class="form-group" style="margin-bottom:0;">
        <select class="order-item-product" required onchange="AdminOrders.onProductChange(this)">
          <option value="">Producto...</option>
          ${products.map(p => {
            // Precio real de venta en pesos (antes se calculaba desde el USD y daba $0 en productos con precio fijo)
            const precioARS = AdminData.precioVentaARS(p);
            // Con el color en el nombre: hay varios productos que se llaman igual (uno por color)
            const colores = [...new Set((p.variantes || []).map(v => String(v.color || '').trim()).filter(Boolean))];
            return `<option value="${escHtml(p.id)}" data-price="${precioARS}" ${item && String(item.productoId) === String(p.id) ? 'selected' : ''}>${escHtml(p.nombre)}${colores.length ? ' · ' + escHtml(colores.join(', ')) : ''} — ${AdminData.formatARS(precioARS)}${p.stock > 0 ? '' : ' (sin stock)'}</option>`;
          }).join('')}
        </select>
      </div>
      <div class="form-group" style="margin-bottom:0;">
        <input type="number" class="order-item-cant" min="1" value="${item ? item.cantidad : 1}" placeholder="Cant." required oninput="AdminOrders.recalcularCosto()">
      </div>
      <div class="form-group" style="margin-bottom:0;">
        <input type="number" class="order-item-precio" step="0.01" value="${item ? Number(item.precioUnitario) || '' : ''}" placeholder="Precio unit. (ARS)">
        <input type="hidden" class="order-item-nombre" value="${escHtml(item?.nombre || '')}">
      </div>
      <div class="form-group order-item-variante-box" style="margin-bottom:0;">
        <select class="order-item-variante" aria-label="Talle / color"></select>
      </div>
      <button type="button" class="btn btn-sm btn-danger" onclick="this.parentElement.remove(); AdminOrders.recalcularCosto()">✕</button>
    `;
    container.appendChild(row);
    this.llenarVariantes(row, item?.variante || '');
  },

  /** Desplegable de talle/color del producto elegido (se oculta si el producto no tiene) */
  llenarVariantes(row, elegida) {
    const sel = row.querySelector('.order-item-variante');
    const box = row.querySelector('.order-item-variante-box');
    if (!sel) return;
    const p = AdminData.getProduct(row.querySelector('.order-item-product')?.value);
    const vars = Array.isArray(p?.variantes) ? p.variantes : [];
    const clave = v => `${String(v.color || '').trim()} / ${String(v.talle || '').trim()}`;
    const norm = t => String(t || '').split('/').map(x => x.trim()).join(' / ');
    const opciones = vars.map(v => ({ valor: clave(v), texto: `${AdminData.varianteLegible(clave(v))} (${Number(v.stock) || 0} en stock)` }));
    // Pedido viejo con una variante que ya no existe: se conserva tal cual
    if (elegida && !opciones.some(o => o.valor === norm(elegida))) opciones.push({ valor: elegida, texto: AdminData.varianteLegible(elegida) + ' (ya no está cargada)' });
    sel.innerHTML = (opciones.length ? '<option value="">Elegí talle / color…</option>' : '<option value=""></option>') +
      opciones.map(o => `<option value="${escHtml(o.valor)}" ${norm(elegida) === norm(o.valor) || elegida === o.valor ? 'selected' : ''}>${escHtml(o.texto)}</option>`).join('');
    if (opciones.length === 1 && !elegida) sel.value = opciones[0].valor;
    sel.required = opciones.length > 0;
    if (box) box.style.display = opciones.length ? '' : 'none';
  },

  onProductChange(select) {
    const option = select.options[select.selectedIndex];
    const price = option?.dataset?.price || '';
    const row = select.closest('.form-grid');
    if (row) {
      const priceInput = row.querySelector('.order-item-precio');
      // Al elegir otro producto se actualiza el precio sugerido (se puede editar a mano)
      if (priceInput && (!priceInput.value || priceInput.dataset.auto === priceInput.value)) {
        priceInput.value = price;
        priceInput.dataset.auto = price;
      }
      this.llenarVariantes(row, '');
      const nomInput = row.querySelector('.order-item-nombre'); if (nomInput) nomInput.value = '';
    }
    this.recalcularCosto();
  },

  /** Costo del pedido con el costo de cada producto (si no lo escribieron a mano) */
  recalcularCosto() {
    const el = document.getElementById('of-costo');
    const hint = document.getElementById('of-costo-hint');
    if (!el) return;
    let total = 0, sinCosto = 0;
    document.querySelectorAll('#order-items-container .order-item-row').forEach(row => {
      const p = AdminData.getProduct(row.querySelector('.order-item-product')?.value);
      if (!p) return;
      const c = AdminData.costoUnitarioARS(p);
      if (!c) sinCosto++;
      total += c * (parseInt(row.querySelector('.order-item-cant')?.value) || 0);
    });
    total = Math.round(total);
    const manual = el.value !== '' && el.value !== el.dataset.auto;
    if (!manual) { el.value = total || ''; el.dataset.auto = el.value; }
    if (hint) hint.textContent = manual ? 'Lo escribiste a mano' : (sinCosto ? `Calculado (hay ${sinCosto} producto${sinCosto > 1 ? 's' : ''} sin costo cargado)` : 'Calculado con el costo de cada producto');
    this.actualizarCobro();
  },

  /* ---------- Cobro de la venta ---------- */
  _cobroAuto: '',

  totalFormulario() {
    let t = 0;
    document.querySelectorAll('#order-items-container .order-item-row').forEach(row => {
      t += (parseFloat(row.querySelector('.order-item-precio')?.value) || 0) * (parseInt(row.querySelector('.order-item-cant')?.value) || 0);
    });
    const id = document.getElementById('of-id').value;
    const previo = id ? AdminData.getOrder(id) : null;
    return previo && Math.abs((previo.items || []).reduce((s, i) => s + i.precioUnitario * i.cantidad, 0) - t) < 1 ? (Number(previo.total) || t) : Math.round(t * 100) / 100;
  },

  prepararCobro(o) {
    const sel = document.getElementById('of-cobro-forma');
    const est = document.getElementById('of-cobro-estado');
    if (!sel) return;
    if (!sel.dataset.bound) {
      sel.dataset.bound = '1';
      sel.addEventListener('change', () => this.actualizarCobro());
      document.getElementById('of-cobro-monto').addEventListener('input', () => this.actualizarCobro(true));
      document.getElementById('of-pago').addEventListener('change', () => {
        if (document.getElementById('of-id').value) return;
        const c = Fin.cuentaParaMedio(document.getElementById('of-pago').value);
        if (c) { sel.value = 'cuenta:' + c.id; this.actualizarCobro(); }
      });
      document.getElementById('order-items-container').addEventListener('input', () => this.actualizarCobro());
    }
    const p = o ? Fin.pagoDePedido(o) : null;
    const opciones = FinUI.opcionesPago({ textoPendiente: 'Queda pendiente (me lo debe)' });
    if (o) opciones.unshift({ v: 'nada', l: p.saldo > 0 ? '— Todavía no cobré —' : '— No registrar otro cobro —' });
    sel.innerHTML = opciones.map(x => `<option value="${escHtml(x.v)}">${escHtml(x.l)}</option>`).join('');
    if (o) {
      sel.value = 'nada';
      const cobros = Fin.cobrosDePedido(o.id);
      est.innerHTML = (cobros.length ? `<ul class="order-cobros">${cobros.map(m => `<li>${AdminApp.formatDate(m.fecha)} · ${escHtml(Fin.origenMovimiento(m))}: <strong>${AdminData.formatARS(m.monto)}</strong> <button type="button" class="btn btn-sm btn-danger" onclick="AdminOrders.borrarCobro('${escJsAttr(m.id)}','${escJsAttr(o.id)}')" aria-label="Borrar cobro">✕</button></li>`).join('')}</ul>` : '') +
        `<p class="order-cobro-resumen">${p.estado === 'cancelado' ? 'Pedido cancelado.' : p.saldo > 0 ? `⏳ Falta cobrar <strong>${AdminData.formatARS(p.saldo)}</strong>` : p.sinRegistrar ? '✅ Se toma como cobrado (sin cuenta registrada). Si querés, registrá en qué cuenta entró.' : '✅ Cobrado completo'}</p>`;
      document.getElementById('of-envio-costo').value = Number(o.envioCosto) ? String(o.envioCosto) : '';
      this._cobroAuto = '';
      document.getElementById('of-cobro-monto').value = p.saldo > 0 ? String(p.saldo) : (p.sinRegistrar ? String(Number(o.total) || '') : '');
    } else {
      const c = Fin.cuentaParaMedio(document.getElementById('of-pago').value) || Fin.cuentaPorDefecto();
      sel.value = c ? 'cuenta:' + c.id : 'pendiente';
      est.innerHTML = '';
      document.getElementById('of-envio-costo').value = '';
      document.getElementById('of-cobro-monto').value = '';
      this._cobroAuto = '';
    }
    this.actualizarCobro();
  },

  actualizarCobro(escribio) {
    const sel = document.getElementById('of-cobro-forma');
    const monto = document.getElementById('of-cobro-monto');
    const box = document.getElementById('of-cobro-monto-box');
    const hint = document.getElementById('of-cobro-hint');
    if (!sel || !monto) return;
    const forma = sel.value;
    const sinCobro = forma === 'pendiente' || forma === 'nada';
    if (box) box.hidden = sinCobro;
    const id = document.getElementById('of-id').value;
    if (!id && !escribio && (monto.value === '' || monto.value === this._cobroAuto)) {
      const t = this.totalFormulario();
      monto.value = t ? String(t) : '';
      this._cobroAuto = monto.value;
    }
    const pago = FinUI.leerPago(forma);
    const cuenta = pago?.cuentaId ? Fin.get('cuentas', pago.cuentaId) : null;
    const m = Fin.parseMonto(monto.value) || 0;
    const t = id ? Fin.pagoDePedido(AdminData.getOrder(id) || {}).saldo || this.totalFormulario() : this.totalFormulario();
    if (hint) hint.innerHTML = sinCobro ? '' : [
      m && m < t - 0.5 ? `Queda debiendo ${AdminData.formatARS(t - m)}` : '',
      Number(cuenta?.comisionPct) ? `Comisión ${cuenta.nombre}: ${AdminData.formatARS(Math.round(m * cuenta.comisionPct) / 100)} (se carga sola como gasto)` : '',
    ].filter(Boolean).join(' · ');
  },

  borrarCobro(movId, orderId) {
    if (!confirm('¿Borrar este cobro? La plata sale de la cuenta.')) return;
    Fin.borrarCobro(movId); // y la comisión que generó
    this.prepararCobro(AdminData.getOrder(orderId));
    this.renderList();
  },

  save(event) {
    event.preventDefault();

    const id = document.getElementById('of-id').value;
    const items = [];
    document.querySelectorAll('#order-items-container .form-grid').forEach(row => {
      const prodId = row.querySelector('.order-item-product').value;
      const cant = parseInt(row.querySelector('.order-item-cant').value) || 0;
      const precio = parseFloat(row.querySelector('.order-item-precio').value) || 0;
      const variante = row.querySelector('.order-item-variante')?.value || '';
      const sel = row.querySelector('.order-item-product');
      const nombre = row.querySelector('.order-item-nombre')?.value || AdminData.getProduct(prodId)?.nombre || sel?.options[sel.selectedIndex]?.text?.split(' — ')[0] || '';
      if (prodId && cant > 0) {
        items.push({ productoId: prodId, nombre, variante, cantidad: cant, precioUnitario: precio });
      }
    });

    // Si el pedido ya traía un total (ej. con envío o cupón desde la web) y
    // los ítems no cambiaron, se respeta; si no, se recalcula.
    const previo = id ? AdminData.getOrder(id) : null;
    const sumaItems = items.reduce((s, i) => s + (i.precioUnitario * i.cantidad), 0);
    const itemsIguales = previo && JSON.stringify((previo.items || []).map(i => [String(i.productoId), i.cantidad, Number(i.precioUnitario)])) === JSON.stringify(items.map(i => [String(i.productoId), i.cantidad, Number(i.precioUnitario)]));
    const total = itemsIguales ? (Number(previo.total) || sumaItems) : sumaItems;

    if (!items.length) { AdminApp.toast('Agregá al menos un producto', 'error'); return; }

    const data = {
      cliente: document.getElementById('of-cliente').value.trim() || ('Venta por ' + AdminData.origenDe({ origen: document.getElementById('of-origen').value }).label),
      origen: document.getElementById('of-origen').value || 'admin',
      telefono: document.getElementById('of-telefono').value.trim(),
      email: document.getElementById('of-email').value.trim(),
      estado: document.getElementById('of-estado').value,
      medioPago: document.getElementById('of-pago').value,
      metodoEnvio: document.getElementById('of-envio').value,
      direccion: document.getElementById('of-direccion').value.trim(),
      costoTotal: parseFloat(document.getElementById('of-costo').value) || 0,
      notas: document.getElementById('of-notas').value.trim(),
      items,
      total,
    };

    // Cobro
    const forma = document.getElementById('of-cobro-forma')?.value || 'nada';
    const pago = FinUI.leerPago(forma);
    const montoCobro = pago ? (Fin.parseMonto(document.getElementById('of-cobro-monto').value) || 0) : 0;
    if (pago && !(montoCobro > 0)) { AdminApp.toast('Escribí cuánto se cobró (o elegí "Queda pendiente")', 'error'); return; }
    const yaCobrado = previo ? Fin.cobradoDePedido(previo.id) : 0;
    if (pago && montoCobro > total - yaCobrado + 0.5) { AdminApp.toast(`El cobro no puede ser más de lo que falta (${AdminData.formatARS(total - yaCobrado)})`, 'error'); return; }
    data.envioCosto = Fin.parseMonto(document.getElementById('of-envio-costo')?.value) || 0;
    data.cobro = forma === 'pendiente' ? 'pendiente' : (pago ? 'registrado' : (previo?.cobro || ''));
    // Ficha del cliente (para la cuenta corriente)
    const ficha = Fin.asegurarCliente(data);
    if (ficha) data.clienteId = ficha.id;

    let pedido;
    if (id) {
      pedido = AdminData.updateOrder(id, data);
      AdminApp.toast('Pedido actualizado');
    } else {
      pedido = AdminData.addOrder(data);
      AdminApp.toast(pago ? '✅ Venta registrada y cobrada' : '✅ Venta registrada (queda pendiente de cobro)');
    }
    if (pedido && pago) Fin.cobrarPedido(pedido, { ...pago, monto: montoCobro });

    this.closeForm();
    this.renderList();
  },

  delete(id) {
    const cobros = Fin.cobrosDePedido(id).length;
    if (confirm(`¿Eliminar este pedido?${cobros ? `\n\nTambién se borran sus ${cobros} cobro(s) y las comisiones: la plata sale de las cuentas.` : ''}`)) {
      Fin.borrarDePedido(id);
      AdminData.deleteOrder(id);
      AdminApp.toast('Pedido eliminado');
      this.renderList();
    }
  },

  exportCSV() {
    const orders = AdminData.getOrders();
    if (orders.length === 0) {
      AdminApp.toast('No hay pedidos para exportar', 'error');
      return;
    }

    const headers = ['ID', 'Fecha', 'Cliente', 'Telefono', 'Email', 'Estado', 'MedioPago', 'Envio', 'Direccion', 'Total', 'Costo', 'Notas'];
    const rows = orders.map(o => [
      o.id, o.fecha, o.cliente, o.telefono, o.email, o.estado,
      o.medioPago, o.metodoEnvio, o.direccion, o.total, o.costoTotal, o.notas
    ]);

    let csv = headers.join(',') + '\n';
    rows.forEach(r => {
      csv += r.map(v => AdminProducts.csvCell(v)).join(',') + '\n';
    });

    const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'pedidos_princesslov.csv';
    a.click();
    URL.revokeObjectURL(url);
    AdminApp.toast('CSV de pedidos exportado');
  },

  exportPDF() {
    const orders = AdminData.getOrders();
    if (orders.length === 0) {
      AdminApp.toast('No hay pedidos para exportar', 'error');
      return;
    }

    const e = (v) => escHtml(v == null ? '' : v);
    const estadoColor = Object.fromEntries(ADMIN_CONFIG.estadosPedido.map(ep => [ep.id, ep.color]));
    const rows = orders.map(o => `
      <tr>
        <td>${e(o.id)}</td>
        <td>${e(AdminApp.formatDateTime(o.fecha))}</td>
        <td>${e(o.cliente)}</td>
        <td>${e(o.telefono)}</td>
        <td><span style="background:${estadoColor[o.estado] || '#6B7280'};color:#fff;padding:2px 8px;border-radius:4px;font-size:11px;">${e(o.estado)}</span></td>
        <td>${e(o.medioPago)}</td>
        <td style="text-align:right;">$${Number(o.total || 0).toLocaleString('es-AR')}</td>
      </tr>`).join('');

    const totalGeneral = orders.reduce((s, o) => s + Number(o.total || 0), 0);
    const now = new Date().toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });

    const html = `<!DOCTYPE html><html><head><meta charset="utf-8">
      <title>Pedidos PrincessLov - ${now}</title>
      <style>
        * { margin:0; padding:0; box-sizing:border-box; }
        body { font-family:Arial,Helvetica,sans-serif; padding:24px; color:#1a1a1a; }
        h1 { font-size:18px; margin-bottom:4px; }
        .sub { font-size:12px; color:#666; margin-bottom:16px; }
        table { width:100%; border-collapse:collapse; font-size:12px; }
        th { background:#f3f4f6; text-align:left; padding:8px 6px; border-bottom:2px solid #d1d5db; font-weight:600; }
        td { padding:6px; border-bottom:1px solid #e5e7eb; }
        tr:nth-child(even) { background:#fafafa; }
        .footer { margin-top:16px; text-align:right; font-size:13px; font-weight:600; }
        @media print { body { padding:12px; } }
      </style></head><body>
      <h1>Pedidos PrincessLov</h1>
      <p class="sub">${orders.length} pedidos | Generado: ${now}</p>
      <table><thead><tr>
        <th>ID</th><th>Fecha</th><th>Cliente</th><th>Tel</th><th>Estado</th><th>Pago</th><th style="text-align:right;">Total</th>
      </tr></thead><tbody>${rows}</tbody></table>
      <div class="footer">Total general: $${totalGeneral.toLocaleString('es-AR')}</div>
    </body></html>`;

    const w = window.open('', '_blank');
    if (!w) { AdminApp.toast('El navegador bloqueó la ventana. Permití ventanas emergentes para este sitio.', 'error'); return; }
    w.document.write(html);
    w.document.close();
    w.focus();
    setTimeout(() => w.print(), 300);
    AdminApp.toast('PDF abierto para imprimir');
  },
};
