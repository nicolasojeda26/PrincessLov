/* ============================================
   ADMIN ORDERS - Gestión de Pedidos
   ============================================ */

const AdminOrders = {
  searchQuery: '',
  filterStatus: '',

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
              ${o.origen === 'web-whatsapp' ? '<span class="order-origin">🌐 Web</span>' : ''}
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

  openForm(id) {
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
      document.getElementById('of-costo').value = o.costoTotal || 0;
      document.getElementById('of-notas').value = o.notas || '';

      container.innerHTML = '';
      (o.items || []).forEach(item => this.addItemRow(item));
    } else {
      title.textContent = 'Nuevo Pedido';
      document.getElementById('order-form').reset();
      document.getElementById('of-id').value = '';
      document.getElementById('of-estado').value = 'pendiente';
      container.innerHTML = '';
      this.addItemRow();
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
    row.className = 'form-grid';
    row.style.marginBottom = '0.5rem';
    row.innerHTML = `
      <div class="form-group" style="margin-bottom:0;">
        <select class="order-item-product" required onchange="AdminOrders.onProductChange(this)">
          <option value="">Producto...</option>
          ${products.map(p => {
            // Precio real de venta en pesos (antes se calculaba desde el USD y daba $0 en productos con precio fijo)
            const precioARS = AdminData.precioVentaARS(p);
            return `<option value="${escHtml(p.id)}" data-price="${precioARS}" ${item && String(item.productoId) === String(p.id) ? 'selected' : ''}>${escHtml(p.nombre)} — ${AdminData.formatARS(precioARS)}${p.stock > 0 ? '' : ' (sin stock)'}</option>`;
          }).join('')}
        </select>
      </div>
      <div class="form-group" style="margin-bottom:0;">
        <input type="number" class="order-item-cant" min="1" value="${item ? item.cantidad : 1}" placeholder="Cant." required>
      </div>
      <div class="form-group" style="margin-bottom:0;">
        <input type="number" class="order-item-precio" step="0.01" value="${item ? Number(item.precioUnitario) || '' : ''}" placeholder="Precio unit. (ARS)">
        <input type="hidden" class="order-item-variante" value="${escHtml(item?.variante || '')}">
        <input type="hidden" class="order-item-nombre" value="${escHtml(item?.nombre || '')}">
      </div>
      <button type="button" class="btn btn-sm btn-danger" onclick="this.parentElement.remove()">✕</button>
    `;
    container.appendChild(row);
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
      const varInput = row.querySelector('.order-item-variante'); if (varInput) varInput.value = '';
      const nomInput = row.querySelector('.order-item-nombre'); if (nomInput) nomInput.value = '';
    }
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

    const data = {
      cliente: document.getElementById('of-cliente').value.trim(),
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

    if (id) {
      AdminData.updateOrder(id, data);
      AdminApp.toast('Pedido actualizado');
    } else {
      AdminData.addOrder(data);
      AdminApp.toast('Pedido creado');
    }

    this.closeForm();
    this.renderList();
  },

  delete(id) {
    if (confirm('¿Eliminar este pedido?')) {
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
