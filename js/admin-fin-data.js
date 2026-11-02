/* ============================================
   FINANZAS — datos y cálculos (nov/2026)
   --------------------------------------------
   Lo mismo que la parte administrativa de Gestión Moda, adentro de Princess:
   - Cuentas (Efectivo, Mercado Pago, Banco…) con saldo y comisión por cobro
   - Movimientos: cobros de ventas, entregas a cuenta, pagos de gastos,
     transferencias entre cuentas, aportes y retiros de socios, ajustes
   - Socios, Proveedores, Clientes (cuenta corriente), Turnos de caja
   - Gastos con tipo, proveedor, IVA, mes, pendiente/pagado, en USD y recurrentes

   Se guarda en este navegador y, con el token, en la planilla (hojas
   Cuentas, Movimientos, Socios, Proveedores, Clientes, Turnos y Gastos).
   ============================================ */

const Fin = {
  SCHEMAS: {
    cuentas:     { key: 'pl_fin_cuentas',     num: ['saldoInicial', 'comisionPct', 'orden'], bool: ['activa'] },
    movimientos: { key: 'pl_fin_movimientos', num: ['monto'] },
    socios:      { key: 'pl_fin_socios',      num: ['participacion'] },
    proveedores: { key: 'pl_fin_proveedores' },
    clientes:    { key: 'pl_fin_clientes' },
    turnos:      { key: 'pl_fin_turnos',      num: ['montoInicial', 'esperado', 'contado', 'diferencia'] },
  },
  GASTO_NUM: ['monto', 'iva', 'montoUSD', 'cotizacion'],
  RECURRENTES_KEY: 'pl_fin_recurrentes',
  /** La planilla tiene las hojas de finanzas (Apps Script de nov/2026) */
  remotoOk: false,

  TIPOS_GASTO: [
    { id: 'administracion',   label: 'Administración',  icon: '🏢', ayuda: 'Alquiler, luz, internet, contador, sistemas' },
    { id: 'comercializacion', label: 'Comercialización', icon: '📣', ayuda: 'Publicidad, comisiones, bolsas, envíos' },
    { id: 'impositivo',       label: 'Impositivo',      icon: '🏛️', ayuda: 'Monotributo, Ingresos Brutos, tasas' },
    { id: 'producto',         label: 'Producto',        icon: '🧵', ayuda: 'Fletes o arreglos que no están en el costo de la prenda' },
    { id: 'inversion',        label: 'Inversión',       icon: '🚀', ayuda: 'Gastos de una vez: fotos, diseño, maniquíes' },
    { id: 'personal',         label: 'Personales',      icon: '👤', ayuda: 'Gastos tuyos: no cuentan en la ganancia del negocio' },
  ],
  TIPOS_CUENTA: [
    { id: 'efectivo', label: 'Efectivo', icon: '💵' },
    { id: 'billetera', label: 'Billetera (Mercado Pago, Ualá…)', icon: '📱' },
    { id: 'banco', label: 'Banco', icon: '🏦' },
    { id: 'tarjeta', label: 'Tarjeta de crédito', icon: '💳' },
  ],

  /* ==================== ALMACENAMIENTO ==================== */
  _read(key, fb) {
    try { const v = JSON.parse(localStorage.getItem(key) || 'null'); return v == null ? fb : v; } catch { return fb; }
  },
  _write(key, v) { try { localStorage.setItem(key, JSON.stringify(v)); } catch {} },

  list(col) {
    const v = this._read(this.SCHEMAS[col].key, []);
    return Array.isArray(v) ? v : [];
  },
  get(col, id) { return this.list(col).find(x => String(x.id) === String(id)) || null; },
  _saveAll(col, arr) { this._write(this.SCHEMAS[col].key, arr); },

  nuevoId(prefijo) { return prefijo + '_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6); },

  /** Alta o modificación; publica en la planilla */
  save(col, obj) {
    const arr = this.list(col);
    if (!obj.id) obj.id = this.nuevoId(col.slice(0, 3));
    const i = arr.findIndex(x => String(x.id) === String(obj.id));
    if (i >= 0) arr[i] = { ...arr[i], ...obj }; else arr.push(obj);
    this._saveAll(col, arr);
    this.publicar(col, i >= 0 ? arr[i] : obj);
    this.avisar();
    return i >= 0 ? arr[i] : obj;
  },

  remove(col, id) {
    this._saveAll(col, this.list(col).filter(x => String(x.id) !== String(id)));
    if (this.puedePublicar()) AdminSync.publicar('fin_delete', { sheet: col, id }, 'la baja');
    this.avisar();
  },

  avisar() { try { window.dispatchEvent(new CustomEvent('fin:cambio')); } catch {} },

  /* ==================== PLANILLA ==================== */
  puedePublicar() { return typeof AdminSync !== 'undefined' && AdminSync.habilitado() && this.remotoOk && !AdminSync._silencio; },

  toRow(obj) {
    const row = {};
    Object.keys(obj).forEach(k => {
      if (k === 'id') row.ID = obj.id;
      else row[k.charAt(0).toUpperCase() + k.slice(1)] = obj[k] == null ? '' : obj[k];
    });
    return row;
  },

  fromRow(row, num = [], bool = []) {
    const o = {};
    Object.keys(row || {}).forEach(k => {
      if (!k) return;
      const key = k === 'ID' ? 'id' : k.charAt(0).toLowerCase() + k.slice(1);
      let v = row[k];
      if (num.includes(key)) v = v === '' || v == null ? 0 : Number(v) || 0;
      else if (bool.includes(key)) v = v === true || v === 'TRUE' || v === 'true' || v === 1 || v === '1';
      else if (v instanceof Date) v = v.toISOString();
      else v = v == null ? '' : String(v);
      o[key] = v;
    });
    if (o.id) o.id = String(o.id);
    return o;
  },

  publicar(col, obj) {
    if (!this.puedePublicar()) return;
    AdminSync.publicar('fin_upsert', { sheet: col, row: this.toRow(obj) }, 'el cambio en ' + col);
  },

  /** Lo llama AdminSync.sincronizar: trae las hojas y sube lo que solo existe acá */
  async sincronizar() {
    try {
      const v = await AdminSync.post('fin_version', {});
      this.remotoOk = !!(v && v.version >= 1);
    } catch { this.remotoOk = false; }
    if (!this.remotoOk) return { actualizar: true };
    let subidos = 0;
    for (const col of Object.keys(this.SCHEMAS)) {
      const sc = this.SCHEMAS[col];
      const filas = await AdminSync.leer(col);
      const remotos = filas.filter(r => r.ID).map(r => this.fromRow(r, sc.num, sc.bool));
      const ids = new Set(remotos.map(r => r.id));
      let locales = this.list(col).filter(x => !ids.has(String(x.id)));
      // Las 3 cuentas de fábrica solo se suben si la planilla no tiene ninguna (si no, se duplican entre celus)
      if (col === 'cuentas' && remotos.length) locales = locales.filter(x => !['cta_efectivo', 'cta_mp', 'cta_banco'].includes(String(x.id)));
      for (const o of locales) { await AdminSync.post('fin_upsert', { sheet: col, row: this.toRow(o) }); subidos++; }
      this._saveAll(col, [...remotos, ...locales]);
    }
    return { subidos };
  },

  /* ==================== GASTOS (viven en AdminData) ==================== */
  gastos() {
    return AdminData.getExpenses().map(g => this.normalizarGasto(g));
  },

  /** Gastos cargados antes de nov/2026: sin tipo y se dan por pagados (sin cuenta) */
  normalizarGasto(g) {
    // La planilla puede convertir "2026-11" en fecha: se vuelve a "AAAA-MM"
    if (g.mes && !/^\d{4}-\d{2}$/.test(g.mes)) g = { ...g, mes: this.mesDe(g.mes) };
    if (g.tipo) return { ...g, mes: g.mes || this.mesDe(g.fecha) };
    const mapa = { fijo: 'administracion', variable: 'producto', envio: 'comercializacion', otro: 'administracion' };
    return { ...g, tipo: mapa[g.categoria] || 'administracion', pagadoExterno: true, mes: g.mes || this.mesDe(g.fecha) };
  },

  tipoGasto(id) { return this.TIPOS_GASTO.find(t => t.id === id) || this.TIPOS_GASTO[0]; },

  pagosDeGasto(id) { return this.list('movimientos').filter(m => m.tipo === 'pago' && String(m.gastoId) === String(id)); },

  pagadoDeGasto(g) {
    if (g.pagadoExterno === true || g.pagadoExterno === 'true' || g.pagadoExterno === 'TRUE') return Number(g.monto) || 0;
    return this.pagosDeGasto(g.id).reduce((s, m) => s + (Number(m.monto) || 0), 0);
  },

  estadoGasto(g) {
    const total = Number(g.monto) || 0;
    const pagado = this.pagadoDeGasto(g);
    if (pagado >= total - 0.5) return 'pagado';
    return pagado > 0 ? 'parcial' : 'pendiente';
  },

  /**
   * Crea un gasto y, si corresponde, su pago.
   * pago: { cuentaId } | { socioId } | null (queda pendiente)
   */
  crearGasto(datos, pago) {
    const g = AdminData.addExpense({
      concepto: datos.concepto || this.tipoGasto(datos.tipo).label,
      monto: Math.round((Number(datos.monto) || 0) * 100) / 100,
      categoria: datos.categoria || '',
      notas: datos.notas || '',
      tipo: datos.tipo || 'administracion',
      proveedorId: datos.proveedorId || '',
      mes: datos.mes || this.mesDe(new Date().toISOString()),
      iva: Number(datos.iva) || 0,
      fechaComprobante: datos.fechaComprobante || '',
      moneda: datos.moneda === 'USD' ? 'USD' : 'ARS',
      montoUSD: Number(datos.montoUSD) || 0,
      cotizacion: Number(datos.cotizacion) || 0,
      recurrenteId: datos.recurrenteId || '',
      origen: datos.origen || 'manual',
      pedidoId: datos.pedidoId || '',
      cobroId: datos.cobroId || '',
      pagadoExterno: false,
      fecha: datos.fecha || new Date().toISOString(),
    });
    if (pago && g.monto > 0) this.pagarGasto(g, { ...pago, monto: g.monto, fecha: pago.fecha });
    return g;
  },

  /** Registra un pago (total o parcial) de un gasto */
  pagarGasto(g, { cuentaId, socioId, monto, fecha }) {
    const m = Math.round((Number(monto) || 0) * 100) / 100;
    if (!(m > 0)) return null;
    return this.save('movimientos', {
      fecha: fecha || new Date().toISOString(), tipo: 'pago', monto: m,
      cuentaId: socioId ? '' : (cuentaId || this.cuentaPorDefecto()?.id || ''),
      socioId: socioId || '', gastoId: g.id, proveedorId: g.proveedorId || '',
      turnoId: this.turnoAbierto()?.id || '', nota: g.concepto || '',
    });
  },

  borrarGasto(id) {
    this.pagosDeGasto(id).forEach(m => this.remove('movimientos', m.id));
    AdminData.deleteExpense(id);
  },

  /* ==================== CUENTAS ==================== */
  cuentas(soloActivas = false) {
    let arr = this.list('cuentas');
    if (!arr.length) arr = this.crearCuentasIniciales();
    return arr.filter(c => !soloActivas || c.activa !== false).sort((a, b) => (Number(a.orden) || 0) - (Number(b.orden) || 0));
  },

  crearCuentasIniciales() {
    const base = [
      { id: 'cta_efectivo', nombre: 'Efectivo', tipoCuenta: 'efectivo', saldoInicial: 0, comisionPct: 0, activa: true, orden: 1 },
      { id: 'cta_mp', nombre: 'Mercado Pago', tipoCuenta: 'billetera', saldoInicial: 0, comisionPct: 0, activa: true, orden: 2 },
      { id: 'cta_banco', nombre: 'Banco / Transferencia', tipoCuenta: 'banco', saldoInicial: 0, comisionPct: 0, activa: true, orden: 3 },
    ];
    this._saveAll('cuentas', base);
    base.forEach(c => this.publicar('cuentas', c));
    return base;
  },

  cuentaPorDefecto() { return this.cuentas(true)[0] || null; },
  cuentaEfectivo() { return this.cuentas(true).find(c => c.tipoCuenta === 'efectivo') || this.cuentaPorDefecto(); },

  /** Cuenta que corresponde a un medio de pago del pedido */
  cuentaParaMedio(medio) {
    const m = String(medio || '').toLowerCase();
    const cs = this.cuentas(true);
    const porNombre = cs.find(c => m && (m.includes(c.nombre.toLowerCase()) || c.nombre.toLowerCase().includes(m.split(' ')[0])));
    if (porNombre) return porNombre;
    if (/efectivo/.test(m)) return cs.find(c => c.tipoCuenta === 'efectivo');
    if (/mercado|mp/.test(m)) return cs.find(c => c.tipoCuenta === 'billetera');
    if (/transfer|banc|d[eé]bito|cr[eé]dito/.test(m)) return cs.find(c => c.tipoCuenta === 'banco');
    return null;
  },

  /** Efecto de un movimiento en una cuenta (+ entra, − sale) */
  efecto(m, cuentaId) {
    const id = String(cuentaId);
    const monto = Number(m.monto) || 0;
    if (m.tipo === 'transferencia') {
      if (String(m.cuentaId) === id) return -monto;
      if (String(m.cuentaDestinoId) === id) return monto;
      return 0;
    }
    if (String(m.cuentaId) !== id) return 0;
    if (['cobro', 'cobro_cuenta', 'aporte'].includes(m.tipo)) return monto;
    if (['pago', 'retiro'].includes(m.tipo)) return -monto;
    if (m.tipo === 'ajuste') return monto; // con signo
    return 0;
  },

  saldoCuenta(c, hasta) {
    const lim = hasta ? new Date(hasta).getTime() : Infinity;
    return Math.round(((Number(c.saldoInicial) || 0) + this.list('movimientos')
      .filter(m => new Date(m.fecha).getTime() <= lim)
      .reduce((s, m) => s + this.efecto(m, c.id), 0)) * 100) / 100;
  },

  disponible() { return this.cuentas(true).reduce((s, c) => s + this.saldoCuenta(c), 0); },

  movimientosDeCuenta(id) {
    return this.list('movimientos').filter(m => String(m.cuentaId) === String(id) || String(m.cuentaDestinoId) === String(id))
      .sort((a, b) => new Date(b.fecha) - new Date(a.fecha));
  },

  transferir({ desdeId, haciaId, monto, fecha, nota }) {
    return this.save('movimientos', { fecha: fecha || new Date().toISOString(), tipo: 'transferencia', monto: Number(monto) || 0, cuentaId: desdeId, cuentaDestinoId: haciaId, nota: nota || '', turnoId: this.turnoAbierto()?.id || '' });
  },

  /** Deja la cuenta con el saldo real (suma o resta la diferencia) */
  ajustarSaldo(cuentaId, saldoReal, nota) {
    const c = this.get('cuentas', cuentaId);
    if (!c) return null;
    const dif = Math.round(((Number(saldoReal) || 0) - this.saldoCuenta(c)) * 100) / 100;
    if (!dif) return null;
    return this.save('movimientos', { fecha: new Date().toISOString(), tipo: 'ajuste', monto: dif, cuentaId, nota: nota || 'Ajuste de saldo' });
  },

  /* ==================== COBROS DE VENTAS ==================== */
  cobrosDePedido(id) { return this.list('movimientos').filter(m => m.tipo === 'cobro' && String(m.pedidoId) === String(id)); },
  cobradoDePedido(id) { return this.cobrosDePedido(id).reduce((s, m) => s + (Number(m.monto) || 0), 0); },

  /**
   * Estado de cobro de un pedido:
   * - con cobros registrados: se compara con el total
   * - marcado "queda pendiente", o pendiente de la web sin cobrar: pendiente
   * - confirmado/entregado sin cobros (pedidos de antes): se da por cobrado
   */
  pagoDePedido(o) {
    const total = Number(o?.total) || 0;
    const cobrado = this.cobradoDePedido(o.id);
    let estado;
    if (o.estado === 'cancelado') estado = 'cancelado';
    else if (cobrado > 0) estado = cobrado >= total - 0.5 ? 'pagado' : 'parcial';
    else if (o.cobro === 'pendiente' || o.estado === 'pendiente') estado = 'pendiente';
    else estado = 'pagado';
    const saldo = ['pendiente', 'parcial'].includes(estado) ? Math.max(0, Math.round((total - cobrado) * 100) / 100) : 0;
    return { estado, cobrado, saldo, sinRegistrar: estado === 'pagado' && cobrado === 0 };
  },

  /**
   * Registra el cobro de una venta. forma: { cuentaId } o { socioId }.
   * Si la cuenta tiene comisión (ej. Mercado Pago 6%), genera el gasto de la comisión ya pagado.
   */
  cobrarPedido(o, { cuentaId, socioId, monto, fecha }) {
    const m = Math.round((Number(monto) || 0) * 100) / 100;
    if (!(m > 0)) return null;
    const mov = this.save('movimientos', {
      fecha: fecha || new Date().toISOString(), tipo: 'cobro', monto: m,
      cuentaId: socioId ? '' : (cuentaId || ''), socioId: socioId || '',
      pedidoId: o.id, clienteId: o.clienteId || '', turnoId: this.turnoAbierto()?.id || '',
      nota: `Venta #${String(o.id).startsWith('PL-') ? o.id : String(o.id).slice(-6).toUpperCase()} · ${o.cliente || ''}`.trim(),
    });
    const cuenta = cuentaId ? this.get('cuentas', cuentaId) : null;
    const pct = Number(cuenta?.comisionPct) || 0;
    if (cuenta && pct > 0) {
      this.crearGasto({
        concepto: `Comisión ${cuenta.nombre} (${pct}%)`, monto: Math.round(m * pct) / 100,
        tipo: 'comercializacion', categoria: 'Comisiones', origen: 'comision', pedidoId: o.id, cobroId: mov.id,
        mes: this.mesDe(mov.fecha), fecha: mov.fecha,
      }, { cuentaId: cuenta.id, fecha: mov.fecha });
    }
    return mov;
  },

  /** Borra un cobro y la comisión que generó */
  borrarCobro(movId) {
    this.gastos().filter(g => String(g.cobroId) === String(movId)).forEach(g => this.borrarGasto(g.id));
    this.remove('movimientos', movId);
  },

  /** Al borrar un pedido: se van sus cobros y las comisiones que generó */
  borrarDePedido(id) {
    this.cobrosDePedido(id).forEach(m => this.remove('movimientos', m.id));
    this.gastos().filter(g => String(g.pedidoId) === String(id)).forEach(g => this.borrarGasto(g.id));
  },

  /* ==================== CLIENTES ==================== */
  telKey(t) { const d = String(t || '').replace(/\D/g, ''); return d.length >= 8 ? d.slice(-10) : ''; },

  /** Clave de cliente de un pedido: la ficha, el teléfono o el nombre */
  claveCliente(o) {
    if (o.clienteId && this.get('clientes', o.clienteId)) return 'id:' + o.clienteId;
    const tk = this.telKey(o.telefono);
    const ficha = tk && this.list('clientes').find(c => this.telKey(c.telefono) === tk);
    if (ficha) return 'id:' + ficha.id;
    if (tk) return 'tel:' + tk;
    const n = String(o.cliente || '').trim().toLowerCase();
    if (!n || /^venta por /.test(n) || n === 'sin cliente') return '';
    const fichaN = this.list('clientes').find(c => String(c.nombre || '').trim().toLowerCase() === n);
    return fichaN ? 'id:' + fichaN.id : 'nom:' + n;
  },

  /** Busca o crea la ficha del cliente de una venta cargada en el admin */
  asegurarCliente({ cliente, telefono, email, direccion }) {
    const n = String(cliente || '').trim();
    if (!n || /^venta por /i.test(n)) return null;
    const tk = this.telKey(telefono);
    let c = this.list('clientes').find(x => (tk && this.telKey(x.telefono) === tk) || String(x.nombre || '').trim().toLowerCase() === n.toLowerCase());
    if (c) return c;
    return this.save('clientes', { nombre: n, telefono: telefono || '', email: email || '', direccion: direccion || '', localidad: '', provincia: '', cuit: '', notas: '' });
  },

  /** Todos los clientes (fichas + los que compraron por la web) con su resumen */
  clientesResumen() {
    const map = new Map();
    this.list('clientes').forEach(c => map.set('id:' + c.id, { clave: 'id:' + c.id, ficha: c, nombre: c.nombre, telefono: c.telefono, pedidos: [], entregas: 0 }));
    AdminData.getOrders().forEach(o => {
      const k = this.claveCliente(o);
      if (!k) return;
      if (!map.has(k)) map.set(k, { clave: k, ficha: null, nombre: o.cliente || 'Sin nombre', telefono: o.telefono || '', pedidos: [], entregas: 0 });
      map.get(k).pedidos.push(o);
    });
    this.list('movimientos').filter(m => m.tipo === 'cobro_cuenta' && m.clienteId).forEach(m => {
      const r = map.get('id:' + m.clienteId);
      if (r) r.entregas += Number(m.monto) || 0;
    });
    return [...map.values()].map(r => {
      const activos = r.pedidos.filter(o => o.estado !== 'cancelado');
      const comprado = activos.reduce((s, o) => s + (Number(o.total) || 0), 0);
      const pendiente = activos.reduce((s, o) => s + this.pagoDePedido(o).saldo, 0);
      const ultima = activos.reduce((u, o) => (!u || new Date(o.fecha) > new Date(u) ? o.fecha : u), '');
      return { ...r, compras: activos.length, comprado, deuda: Math.round((pendiente - r.entregas) * 100) / 100, ultima };
    });
  },

  /** Movimientos de la cuenta corriente: ventas (debe) y cobros (haber) con saldo */
  cuentaCorriente(clave) {
    const r = this.clientesResumen().find(x => x.clave === clave);
    if (!r) return [];
    const movs = [];
    r.pedidos.filter(o => o.estado !== 'cancelado').forEach(o => {
      const p = this.pagoDePedido(o);
      movs.push({ fecha: o.fecha, tipo: 'Venta', detalle: '#' + (String(o.id).startsWith('PL-') ? o.id : String(o.id).slice(-6).toUpperCase()), debe: Number(o.total) || 0, haber: 0 });
      if (p.sinRegistrar) movs.push({ fecha: o.fecha, tipo: 'Cobro', detalle: 'Cobrado (sin cuenta registrada)', debe: 0, haber: Number(o.total) || 0 });
      this.cobrosDePedido(o.id).forEach(m => movs.push({ fecha: m.fecha, tipo: 'Cobro', detalle: this.origenMovimiento(m), debe: 0, haber: Number(m.monto) || 0 }));
    });
    if (r.ficha) this.list('movimientos').filter(m => m.tipo === 'cobro_cuenta' && String(m.clienteId) === String(r.ficha.id))
      .forEach(m => movs.push({ fecha: m.fecha, tipo: 'Entrega a cuenta', detalle: this.origenMovimiento(m), debe: 0, haber: Number(m.monto) || 0 }));
    movs.sort((a, b) => new Date(a.fecha) - new Date(b.fecha));
    let saldo = 0;
    movs.forEach(m => { saldo = Math.round((saldo + m.debe - m.haber) * 100) / 100; m.saldo = saldo; });
    return movs;
  },

  /** Cliente que paga parte de lo que debe sin elegir venta: se aplica a las ventas más viejas */
  cobrarACliente(clave, { cuentaId, socioId, monto, fecha }) {
    let resto = Math.round((Number(monto) || 0) * 100) / 100;
    const r = this.clientesResumen().find(x => x.clave === clave);
    if (!r || !(resto > 0)) return 0;
    const pend = r.pedidos.filter(o => o.estado !== 'cancelado' && this.pagoDePedido(o).saldo > 0).sort((a, b) => new Date(a.fecha) - new Date(b.fecha));
    for (const o of pend) {
      if (resto <= 0) break;
      const s = this.pagoDePedido(o).saldo;
      const parte = Math.min(s, resto);
      this.cobrarPedido(o, { cuentaId, socioId, monto: parte, fecha });
      resto = Math.round((resto - parte) * 100) / 100;
    }
    // Lo que sobra queda como entrega a cuenta (saldo a favor) si hay ficha
    if (resto > 0 && r.ficha) this.save('movimientos', { fecha: fecha || new Date().toISOString(), tipo: 'cobro_cuenta', monto: resto, cuentaId: socioId ? '' : cuentaId, socioId: socioId || '', clienteId: r.ficha.id, nota: 'Entrega a cuenta' });
    return resto;
  },

  aCobrar() { return this.clientesResumen().reduce((s, r) => s + Math.max(0, r.deuda), 0) + this.pendienteSinCliente(); },

  /** Ventas pendientes sin cliente identificable (ej. "Venta por WhatsApp" sin nombre) */
  pendienteSinCliente() {
    return AdminData.getOrders().filter(o => !this.claveCliente(o) && o.estado !== 'cancelado')
      .reduce((s, o) => s + this.pagoDePedido(o).saldo, 0);
  },

  /* ==================== PROVEEDORES ==================== */
  proveedoresResumen() {
    const gastos = this.gastos();
    return this.list('proveedores').map(p => {
      const suyos = gastos.filter(g => String(g.proveedorId) === String(p.id));
      const total = suyos.reduce((s, g) => s + (Number(g.monto) || 0), 0);
      const deuda = suyos.reduce((s, g) => s + Math.max(0, (Number(g.monto) || 0) - this.pagadoDeGasto(g)), 0);
      return { ...p, gastos: suyos, total, deuda: Math.round(deuda * 100) / 100 };
    });
  },

  aPagar() {
    return Math.round(this.gastos().reduce((s, g) => s + Math.max(0, (Number(g.monto) || 0) - this.pagadoDeGasto(g)), 0) * 100) / 100;
  },

  /* ==================== SOCIOS ==================== */
  sociosResumen(desde, hasta) {
    const socios = this.list('socios');
    const totalPart = socios.reduce((s, x) => s + (Number(x.participacion) || 0), 0) || 1;
    const enRango = m => (!desde || new Date(m.fecha) >= desde) && (!hasta || new Date(m.fecha) <= hasta);
    const movs = this.list('movimientos').filter(enRango);
    return socios.map(s => {
      const deS = movs.filter(m => String(m.socioId) === String(s.id));
      const sum = t => deS.filter(m => m.tipo === t).reduce((a, m) => a + (Number(m.monto) || 0), 0);
      const aportes = sum('aporte'), retiros = sum('retiro');
      const pagoConSuPlata = sum('pago');           // gastos que pagó de su bolsillo (pone plata)
      const cobroParaEl = sum('cobro') + sum('cobro_cuenta'); // ventas que cobró y se quedó (saca plata)
      return { ...s, pct: (Number(s.participacion) || 0) / totalPart * 100, aportes, retiros, pagoConSuPlata, cobroParaEl,
        neto: Math.round((aportes + pagoConSuPlata - retiros - cobroParaEl) * 100) / 100 };
    });
  },

  aporteRetiro({ socioId, tipo, cuentaId, monto, fecha, nota }) {
    return this.save('movimientos', { fecha: fecha || new Date().toISOString(), tipo: tipo === 'retiro' ? 'retiro' : 'aporte', monto: Number(monto) || 0, socioId, cuentaId, nota: nota || '', turnoId: this.turnoAbierto()?.id || '' });
  },

  /* ==================== CAJA (TURNOS) ==================== */
  turnoAbierto() { return this.list('turnos').find(t => t.estado === 'abierto') || null; },

  abrirTurno({ cuentaId, montoInicial, notas }) {
    if (this.turnoAbierto()) return null;
    return this.save('turnos', { fecha: new Date().toISOString(), estado: 'abierto', cuentaId: cuentaId || this.cuentaEfectivo()?.id || '', montoInicial: Number(montoInicial) || 0, cierre: '', esperado: 0, contado: 0, diferencia: 0, notas: notas || '' });
  },

  /** Lo que tendría que haber en la caja: inicial + entradas − salidas desde la apertura */
  resumenTurno(t) {
    const desde = new Date(t.fecha).getTime();
    const hasta = t.cierre ? new Date(t.cierre).getTime() : Infinity;
    const movs = this.list('movimientos').filter(m => { const f = new Date(m.fecha).getTime(); return f >= desde && f <= hasta && !(m.tipo === 'ajuste' && m.turnoId === t.id && /caja/i.test(m.nota || '')); });
    const deCaja = movs.map(m => ({ m, ef: this.efecto(m, t.cuentaId) })).filter(x => x.ef !== 0);
    const entradas = deCaja.filter(x => x.ef > 0).reduce((s, x) => s + x.ef, 0);
    const salidas = deCaja.filter(x => x.ef < 0).reduce((s, x) => s - x.ef, 0);
    const porCuenta = {};
    movs.filter(m => ['cobro', 'cobro_cuenta'].includes(m.tipo)).forEach(m => {
      const k = m.cuentaId ? (this.get('cuentas', m.cuentaId)?.nombre || 'Cuenta') : 'Socios';
      porCuenta[k] = (porCuenta[k] || 0) + (Number(m.monto) || 0);
    });
    return { movimientos: deCaja.map(x => x.m), entradas, salidas, esperado: Math.round(((Number(t.montoInicial) || 0) + entradas - salidas) * 100) / 100, cobrosPorCuenta: porCuenta };
  },

  cerrarTurno(t, contado, notas, ajustar) {
    const r = this.resumenTurno(t);
    const dif = Math.round(((Number(contado) || 0) - r.esperado) * 100) / 100;
    const cerrado = this.save('turnos', { ...t, estado: 'cerrado', cierre: new Date().toISOString(), esperado: r.esperado, contado: Number(contado) || 0, diferencia: dif, notas: [t.notas, notas].filter(Boolean).join(' · ') });
    if (ajustar && dif) this.save('movimientos', { fecha: new Date().toISOString(), tipo: 'ajuste', monto: dif, cuentaId: t.cuentaId, turnoId: t.id, nota: dif > 0 ? 'Sobrante de caja' : 'Faltante de caja' });
    return cerrado;
  },

  /* ==================== GASTOS RECURRENTES ==================== */
  recurrentes() {
    const v = this._read(this.RECURRENTES_KEY, null);
    return v && typeof v === 'object' ? { plantillas: Array.isArray(v.plantillas) ? v.plantillas : [], auto: v.auto || { activo: false, dia: 1, registrarPagos: false } }
      : { plantillas: [], auto: { activo: false, dia: 1, registrarPagos: false } };
  },

  guardarRecurrentes(r) {
    this._write(this.RECURRENTES_KEY, r);
    if (typeof AdminSync !== 'undefined' && AdminSync.habilitado()) AdminSync.publicar('save_config', { config: { gastosRecurrentes: JSON.stringify(r) } }, 'los gastos fijos');
    this.avisar();
  },

  /** Gasto ya generado para ese mes desde esa plantilla */
  generadoDe(plantillaId, mes) {
    return this.gastos().find(g => String(g.recurrenteId) === String(plantillaId) && g.mes === mes) || null;
  },

  /**
   * Genera los gastos del mes desde la plantilla.
   * items: [{ plantillaId, monto, pagar: bool, cuentaId }]
   */
  aplicarMes(mes, items) {
    const r = this.recurrentes();
    const dolar = AdminData.dolarActual();
    let n = 0;
    items.forEach(it => {
      const p = r.plantillas.find(x => String(x.id) === String(it.plantillaId));
      if (!p || this.generadoDe(p.id, mes)) return;
      const usd = p.moneda === 'USD';
      const montoBase = Number(it.monto ?? p.monto) || 0;
      if (!(montoBase > 0)) return;
      const fecha = this.fechaDeMes(mes);
      this.crearGasto({
        concepto: p.concepto, tipo: p.tipo, categoria: p.categoria || '', proveedorId: p.proveedorId || '', iva: p.iva || 0,
        monto: usd ? Math.round(montoBase * dolar) : montoBase, moneda: usd ? 'USD' : 'ARS', montoUSD: usd ? montoBase : 0, cotizacion: usd ? dolar : 0,
        mes, recurrenteId: p.id, origen: 'recurrente', fecha,
      }, it.pagar ? (it.socioId ? { socioId: it.socioId, fecha } : { cuentaId: it.cuentaId || p.cuentaId || this.cuentaPorDefecto()?.id, fecha }) : null);
      n++;
    });
    return n;
  },

  /** Generación automática: al abrir el panel, si ya pasó el día elegido y falta el mes */
  autoGenerar() {
    const r = this.recurrentes();
    if (!r.auto?.activo || !r.plantillas.length) return 0;
    const hoy = new Date();
    const mes = this.mesDe(hoy.toISOString());
    const ultimo = new Date(hoy.getFullYear(), hoy.getMonth() + 1, 0).getDate();
    if (hoy.getDate() < Math.min(Number(r.auto.dia) || 1, ultimo)) return 0;
    const items = r.plantillas.filter(p => p.activa !== false && !this.generadoDe(p.id, mes))
      .map(p => ({ plantillaId: p.id, monto: p.monto, pagar: !!(r.auto.registrarPagos && (p.cuentaId || p.socioId)), cuentaId: p.cuentaId, socioId: p.socioId }));
    return items.length ? this.aplicarMes(mes, items) : 0;
  },

  /* ==================== FECHAS Y FORMATOS ==================== */
  /** "2026-11" en hora local */
  mesDe(fecha) {
    const d = new Date(fecha || Date.now());
    if (isNaN(d)) return '';
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
  },
  fechaDeMes(mes) {
    const [y, m] = String(mes).split('-').map(Number);
    const hoy = new Date();
    const d = (y === hoy.getFullYear() && m === hoy.getMonth() + 1) ? hoy : new Date(y, m - 1, 1, 12);
    return d.toISOString();
  },
  MESES: ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'],
  nombreMes(mes) { const [y, m] = String(mes).split('-').map(Number); return (this.MESES[m - 1] || '') + ' ' + y; },
  mesCorto(mes) { const [, m] = String(mes).split('-').map(Number); return (this.MESES[m - 1] || '').slice(0, 3); },

  /** "16.000" · "16.000,50" · "-500" · "16000.5" → número (2 decimales) */
  parseMonto(v) {
    let t = String(v ?? '').trim().replace(/[$\s]|ARS|USD/gi, '');
    if (!t) return null;
    const neg = t.startsWith('-');
    t = t.replace(/^-/, '');
    if (t.includes(',')) t = t.replace(/\./g, '').replace(',', '.');
    else if (/^\d{1,3}(\.\d{3})+$/.test(t)) t = t.replace(/\./g, '');
    const n = Number(t);
    if (!Number.isFinite(n)) return null;
    return Math.round((neg ? -n : n) * 100) / 100;
  },

  origenMovimiento(m) {
    if (m.cuentaId) return this.get('cuentas', m.cuentaId)?.nombre || 'Cuenta borrada';
    if (m.socioId) return 'Socio: ' + (this.get('socios', m.socioId)?.nombre || '—');
    return '—';
  },

  ETIQUETA_MOV: {
    cobro: '💰 Cobro de venta', cobro_cuenta: '💰 Entrega a cuenta', pago: '💸 Pago de gasto', transferencia: '🔁 Transferencia',
    aporte: '➕ Aporte de socio', retiro: '➖ Retiro de socio', ajuste: '⚖️ Ajuste',
  },
};

// Gastos fijos automáticos: con planilla, después de la primera sincronización (AdminSync); sin planilla, al abrir el panel
window.addEventListener('admin:ready', () => {
  if (typeof AdminSync !== 'undefined' && AdminSync.habilitado()) return;
  try { Fin.autoGenerar(); } catch (e) { console.warn('[Fin] recurrentes', e); }
});
