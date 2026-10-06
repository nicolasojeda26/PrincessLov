/* ============================================
   CHECKOUT - El pedido se cierra por WhatsApp
   --------------------------------------------
   1. La clienta revisa el resumen, elige envío y completa sus datos.
   2. Al confirmar se genera un número de pedido (PL-AAMMDD-XXXX),
      se abre WhatsApp con el detalle completo y, si la planilla está
      conectada, el pedido queda registrado como "pendiente" en el admin.
   3. Pago y envío se coordinan por mensaje.
   ============================================ */

const PROVINCIAS_AR = [
  'Buenos Aires', 'CABA', 'Catamarca', 'Chaco', 'Chubut',
  'Córdoba', 'Corrientes', 'Entre Ríos', 'Formosa', 'Jujuy',
  'La Pampa', 'La Rioja', 'Mendoza', 'Misiones', 'Neuquén',
  'Río Negro', 'Salta', 'San Juan', 'San Luis', 'Santa Cruz',
  'Santa Fe', 'Santiago del Estero', 'Tierra del Fuego', 'Tucumán',
];

const MEDIOS_PAGO = [
  { value: 'Transferencia bancaria', label: '🏦 Transferencia bancaria' },
  { value: 'Mercado Pago (link de pago)', label: '💳 Mercado Pago — te enviamos el link' },
  { value: 'Efectivo', label: '💵 Efectivo (retiro o entrega en Iguazú)' },
  { value: 'A coordinar', label: '🤝 A coordinar por WhatsApp' },
];

const CheckoutService = {
  envioSeleccionado: null,
  enviando: false,

  init() {},

  /* ---------- Render ---------- */
  renderCheckout() {
    this.enviando = false;
    this.envioSeleccionado = CartService.getShippingOption();

    const modal = document.getElementById('checkout-modal-content');
    if (!modal) return;

    const enviosHtml = (CONFIG.envios || [])
      .filter(e => e.activo !== false)
      .map(envio => {
        const sel = this.envioSeleccionado && this.envioSeleccionado.id === envio.id;
        return `
        <label class="envio-option ${sel ? 'envio-option--selected' : ''}" data-envio="${escHtml(envio.id)}">
          <input type="radio" name="envio" value="${escHtml(envio.id)}" ${sel ? 'checked' : ''}
                 onchange="CheckoutService.seleccionarEnvio(this.value)" />
          <span class="envio-label">${escHtml(envio.nombre)}${envio.descripcion ? `<small>${escHtml(envio.descripcion)}</small>` : ''}</span>
          <span class="envio-price">${Number(envio.precio) === 0 ? 'GRATIS' : SheetsService.formatPrecioARS(envio.precio)}</span>
        </label>`;
      }).join('');

    const provinciasOpts = PROVINCIAS_AR.map(p => `<option value="${p}">${p}</option>`).join('');
    const pagosOpts = MEDIOS_PAGO.map(m => `<option value="${escHtml(m.value)}">${m.label}</option>`).join('');
    const guardado = this._datosGuardados();

    modal.innerHTML = `
      <div class="modal-header">
        <h3 id="checkout-title">🛍️ Finalizar pedido</h3>
        <button type="button" class="modal__close" onclick="App.closeCheckout()" aria-label="Cerrar">✕</button>
      </div>
      <div class="modal-body">
        <ol class="checkout-steps" aria-label="Cómo funciona">
          <li>Revisá tu pedido y completá tus datos</li>
          <li>Se abre WhatsApp con el pedido listo</li>
          <li>Coordinamos pago y envío por mensaje</li>
        </ol>

        <div class="checkout-resumen mb-2" id="checkout-resumen"></div>

        <form id="checkout-form" novalidate onsubmit="CheckoutService.confirmarPedido(event)">
          <fieldset class="checkout-fieldset">
            <legend>Método de envío *</legend>
            <div class="envio-options">${enviosHtml}</div>
          </fieldset>

          <fieldset class="checkout-fieldset">
            <legend>Tus datos</legend>
            <div class="form-group">
              <label for="checkout-nombre">Nombre y apellido *</label>
              <input type="text" id="checkout-nombre" required maxlength="80" autocomplete="name" placeholder="Tu nombre completo" value="${escHtml(guardado.nombre || '')}">
            </div>
            <div class="form-row">
              <div class="form-group">
                <label for="checkout-telefono">WhatsApp / Teléfono *</label>
                <input type="tel" id="checkout-telefono" required maxlength="20" autocomplete="tel" inputmode="tel" placeholder="3757 123456" value="${escHtml(guardado.telefono || '')}">
              </div>
              <div class="form-group">
                <label for="checkout-email">Email <small>(opcional)</small></label>
                <input type="email" id="checkout-email" maxlength="100" autocomplete="email" placeholder="tu@email.com" value="${escHtml(guardado.email || '')}">
              </div>
            </div>

            <div id="checkout-direccion-wrap">
              <div class="form-group">
                <label for="checkout-direccion">Dirección de entrega *</label>
                <input type="text" id="checkout-direccion" maxlength="120" autocomplete="street-address" placeholder="Calle, número, piso, depto" value="${escHtml(guardado.direccion || '')}">
              </div>
              <div class="form-row">
                <div class="form-group">
                  <label for="checkout-localidad">Localidad *</label>
                  <input type="text" id="checkout-localidad" maxlength="60" autocomplete="address-level2" placeholder="Ciudad / Localidad" value="${escHtml(guardado.localidad || '')}">
                </div>
                <div class="form-group">
                  <label for="checkout-provincia">Provincia *</label>
                  <select id="checkout-provincia" autocomplete="address-level1">
                    <option value="">Seleccionar...</option>
                    ${provinciasOpts}
                  </select>
                </div>
              </div>
              <div class="form-group">
                <label for="checkout-cp">Código postal <small>(opcional)</small></label>
                <input type="text" id="checkout-cp" maxlength="8" autocomplete="postal-code" inputmode="numeric" placeholder="3370" value="${escHtml(guardado.cp || '')}">
              </div>
            </div>

            <div class="form-group">
              <label for="checkout-pago">¿Cómo preferís pagar?</label>
              <select id="checkout-pago">${pagosOpts}</select>
            </div>
            <div class="form-group">
              <label for="checkout-notas">Notas <small>(opcional)</small></label>
              <textarea id="checkout-notas" maxlength="300" rows="2" placeholder="Horario de entrega, regalo, consulta de talle..."></textarea>
            </div>

            <!-- Trampa anti-bots: invisible para personas -->
            <div class="hp-field" aria-hidden="true">
              <label for="checkout-website">No completar</label>
              <input type="text" id="checkout-website" tabindex="-1" autocomplete="off">
            </div>

            <label class="checkout-check">
              <input type="checkbox" id="checkout-recordar" ${guardado.nombre ? 'checked' : ''}>
              <span>Recordar mis datos en este dispositivo</span>
            </label>
            <label class="checkout-check">
              <input type="checkbox" id="checkout-acepto" required>
              <span>Leí y acepto los <a href="terminos.html" target="_blank" rel="noopener">Términos y condiciones</a> y la <a href="privacidad.html" target="_blank" rel="noopener">Política de privacidad</a> *</span>
            </label>
          </fieldset>
          <p class="checkout-error" id="checkout-error" role="alert"></p>
        </form>
      </div>
      <div class="modal-footer">
        <button type="submit" form="checkout-form" class="btn btn--whatsapp btn--block" id="btn-wa-pedido">
          💬 Enviar pedido por WhatsApp
        </button>
        <p class="checkout-footnote">No se cobra nada ahora: el pago se coordina por WhatsApp.</p>
      </div>
    `;

    if (guardado.provincia) {
      const sel = document.getElementById('checkout-provincia');
      if (sel) sel.value = guardado.provincia;
    }
    this.actualizarResumen();
    this.toggleDireccion();
  },

  /** Resumen de importes (se actualiza sin re-dibujar el formulario) */
  actualizarResumen() {
    const el = document.getElementById('checkout-resumen');
    if (!el) return;
    const f = (n) => SheetsService.formatPrecioARS(n);
    const subtotal = CartService.getLineasSubtotalARS();
    const cupon = CartService.getCouponDiscount();
    CartService.calcAutoDiscount();
    const autos = CartService.getAutoDiscountLines();
    const envio = this.envioSeleccionado;
    const costoEnvio = CartService.getShippingCost();
    const total = CartService.getTotalARS();

    const items = CartService.items.map(item => `
      <div class="checkout-item">
        <span>${escHtml(item.nombre)} <b>x${item.cantidad}</b>${item.variante ? ` <small>(${escHtml(String(item.variante).split('/').map(x => x.trim()).filter(Boolean).reverse().join(' · '))})</small>` : ''}</span>
        <span>${f(item.precioARS * item.cantidad)}</span>
      </div>`).join('');

    const sinStock = CartService.items.some(i => i.sinStock)
      ? `<div class="checkout-warn">Algunos productos quedaron sin stock. Quitalos del carrito para continuar.</div>` : '';

    el.innerHTML = `
      <h4 class="checkout-subtitle">Tu pedido</h4>
      ${items}
      ${sinStock}
      <div class="cart__totals-row"><span>Productos</span><span>${f(subtotal)}</span></div>
      ${cupon > 0 ? `<div class="cart__totals-row cart__totals-row--discount"><span>Cupón ${escHtml(CartService.promoCode || '')}</span><span>−${f(cupon)}</span></div>` : ''}
      ${autos.map(l => `<div class="cart__totals-row cart__totals-row--discount"><span>${escHtml(l.label)}</span><span>−${f(l.monto)}</span></div>`).join('')}
      <div class="cart__totals-row"><span>Envío</span><span>${envio ? (costoEnvio === 0 ? 'GRATIS' : f(costoEnvio)) : 'Elegí una opción'}</span></div>
      <div class="cart__totals-row cart__totals-row--total"><span>Total</span><span>${f(total)}</span></div>
    `;
  },

  toggleDireccion() {
    const wrap = document.getElementById('checkout-direccion-wrap');
    if (!wrap) return;
    const esRetiro = !!(this.envioSeleccionado && (this.envioSeleccionado.retiro || this.envioSeleccionado.id === 'retiro'));
    wrap.style.display = esRetiro ? 'none' : '';
  },

  cerrarCheckout() {
    App.closeCheckout();
  },

  seleccionarEnvio(envioId) {
    const envio = (CONFIG.envios || []).find(e => e.id === envioId);
    if (!envio) return;
    this.envioSeleccionado = envio;
    CartService.setShipping(envio.id);
    document.querySelectorAll('#checkout-modal .envio-option').forEach(l => {
      l.classList.toggle('envio-option--selected', l.dataset.envio === envio.id);
    });
    this.actualizarResumen();
    this.toggleDireccion();
    this.mostrarError('');
  },

  obtenerDatosFormulario() {
    const v = (id) => (document.getElementById(id)?.value || '').trim();
    return {
      nombre: v('checkout-nombre'),
      telefono: v('checkout-telefono'),
      email: v('checkout-email'),
      direccion: v('checkout-direccion'),
      localidad: v('checkout-localidad'),
      provincia: v('checkout-provincia'),
      cp: v('checkout-cp'),
      medioPago: v('checkout-pago') || 'A coordinar',
      notas: v('checkout-notas'),
    };
  },

  /** Devuelve el mensaje de error o '' si todo está bien */
  validar(datos) {
    if (!CartService.items.length) return 'Tu carrito está vacío.';
    if (CartService.items.some(i => i.sinStock)) return 'Uno de los productos quedó sin stock. Revisá tu carrito.';
    if (!this.envioSeleccionado) return 'Elegí un método de envío.';
    if (datos.nombre.length < 2) return 'Completá tu nombre.';
    const tel = datos.telefono.replace(/\D/g, '');
    if (tel.length < 8 || tel.length > 15) return 'Revisá el teléfono (solo números, con característica).';
    if (datos.email && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(datos.email)) return 'El email no parece válido.';
    if (!(this.envioSeleccionado.retiro || this.envioSeleccionado.id === 'retiro')) {
      if (!datos.direccion || !datos.localidad || !datos.provincia) return 'Completá dirección, localidad y provincia para el envío.';
    }
    if (!document.getElementById('checkout-acepto')?.checked) return 'Tenés que aceptar los términos y la política de privacidad.';
    return '';
  },

  mostrarError(msg) {
    const el = document.getElementById('checkout-error');
    if (el) el.textContent = msg;
    if (msg) App.showToast(msg);
  },

  generarIdPedido() {
    const d = new Date();
    const fecha = `${String(d.getFullYear()).slice(2)}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
    const rnd = (crypto?.getRandomValues ? crypto.getRandomValues(new Uint16Array(1))[0] : Math.floor(Math.random() * 65535)) % 10000;
    return `PL-${fecha}-${String(rnd).padStart(4, '0')}`;
  },

  /**
   * Confirmación del pedido. Todo lo que abre WhatsApp pasa ANTES de
   * cualquier await: si no, Safari/Chrome en celular bloquean la ventana.
   */
  confirmarPedido(event) {
    if (event) event.preventDefault();
    if (this.enviando) return;

    const datos = this.obtenerDatosFormulario();
    const error = this.validar(datos);
    if (error) { this.mostrarError(error); return; }
    this.mostrarError('');

    // Bots que completan el campo trampa: no registramos nada
    const esBot = !!document.getElementById('checkout-website')?.value;

    this.enviando = true;
    const pedidoId = this.generarIdPedido();
    const envio = this.envioSeleccionado;
    const mensaje = CartService.generarMensajeWhatsApp(envio, datos, pedidoId);
    const url = CartService.abrirWhatsApp(mensaje);

    if (!esBot) this.registrarPedido(pedidoId, envio, datos);
    this._recordarDatos(datos);

    try {
      sessionStorage.setItem('pl_ultimo_pedido', JSON.stringify({ id: pedidoId, url, fecha: Date.now() }));
    } catch {}

    CartService.clear();
    App.actualizarUI?.();
    this.renderExito(pedidoId, url);
  },

  /** Deja el pedido como "pendiente" en la planilla (si está conectada) */
  registrarPedido(pedidoId, envio, datos) {
    if (!SheetsService.appsScriptUrl) return;
    const order = {
      id: pedidoId,
      origen: 'web-whatsapp',
      cliente: datos.nombre,
      telefono: datos.telefono,
      email: datos.email,
      direccion: (envio?.retiro || envio?.id === 'retiro') ? 'Retira en persona' : datos.direccion,
      localidad: datos.localidad,
      provincia: datos.provincia,
      medioPago: datos.medioPago,
      metodoEnvio: envio ? envio.nombre : '',
      total: CartService.getTotalARS(),
      cupon: CartService.promoCode || '',
      notas: [datos.notas, CartService.promoCode ? `Cupón: ${CartService.promoCode}` : '', datos.cp ? `CP: ${datos.cp}` : ''].filter(Boolean).join(' | '),
      items: CartService.items.map(i => ({
        productoId: i.id,
        nombre: i.nombre,
        variante: i.variante || '',
        cantidad: i.cantidad,
        precioUnitario: i.precioARS,
      })),
    };
    SheetsService.postToAppsScript('create_order', { order }, { keepalive: true })
      .catch(err => console.warn('[Checkout] No se pudo registrar el pedido en la planilla:', err.message));
  },

  renderExito(pedidoId, url) {
    const modal = document.getElementById('checkout-modal-content');
    if (!modal) return;
    modal.innerHTML = `
      <div class="modal-header">
        <h3 id="checkout-title">✅ ¡Pedido armado!</h3>
        <button type="button" class="modal__close" onclick="App.closeCheckout()" aria-label="Cerrar">✕</button>
      </div>
      <div class="modal-body checkout-exito">
        <p class="checkout-exito__num">Pedido <strong>#${escHtml(pedidoId)}</strong></p>
        <p>Se abrió WhatsApp con tu pedido. <strong>Tocá "Enviar"</strong> en el chat para confirmarlo y te respondemos para coordinar el pago y el envío.</p>
        <p class="checkout-footnote">¿No se abrió WhatsApp? Usá el botón de abajo.</p>
      </div>
      <div class="modal-footer">
        <a class="btn btn--whatsapp btn--block" href="${escHtml(url)}" target="_blank" rel="noopener">💬 Abrir WhatsApp de nuevo</a>
        <button type="button" class="btn btn--ghost btn--block" onclick="App.closeCheckout(); App.scrollToProducts();">Seguir mirando la tienda</button>
      </div>
    `;
  },

  /* ---------- Datos recordados (solo si la clienta lo pide) ---------- */
  _datosGuardados() {
    try { return JSON.parse(localStorage.getItem('pl_checkout_datos') || '{}') || {}; } catch { return {}; }
  },

  _recordarDatos(datos) {
    try {
      if (document.getElementById('checkout-recordar')?.checked) {
        const { nombre, telefono, email, direccion, localidad, provincia, cp } = datos;
        localStorage.setItem('pl_checkout_datos', JSON.stringify({ nombre, telefono, email, direccion, localidad, provincia, cp }));
      } else {
        localStorage.removeItem('pl_checkout_datos');
      }
    } catch {}
  },

  // Compatibilidad: nombres viejos que podían quedar en HTML cacheado
  procesarPago(event) { return this.confirmarPedido(event); },
  enviarPorWhatsApp() { return this.confirmarPedido(); },
  checkPaymentReturn() {},
};

CheckoutService.init();
