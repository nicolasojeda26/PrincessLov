/* ============================================
   FINANZAS — reportes (nov/2026), como Gestión Moda:
   Estado de Gestión · Estado Financiero · Flujo de Caja ·
   Finanzas de Socios · Rentabilidad · Gastos por mes · Movimientos
   ============================================ */

const AdminReportes = {
  tab: 'gestion',
  anio: new Date().getFullYear(),
  rent: { agrupar: 'producto', periodo: 'mes' },
  movs: { desde: '', hasta: '', cuenta: '' },
  sociosPeriodo: 'anio',

  TABS: [
    ['gestion', '📊 Estado de Gestión'], ['financiero', '📑 Estado Financiero'], ['flujo', '💵 Flujo de Caja'],
    ['socios', '🤝 Finanzas de Socios'], ['rentabilidad', '🏆 Rentabilidad'], ['gastos', '💸 Gastos por mes'], ['movimientos', '🔎 Movimientos'],
  ],

  impuestoPct() { return Number(AdminData.getSettings().impuestoVentasPct) || 0; },

  /* ==================== CÁLCULOS ==================== */
  pedidosDelMes(mes) { return AdminData.getOrders().filter(o => o.estado !== 'cancelado' && Fin.mesDe(o.fecha) === mes); },
  subtotalItems(o) { return (o.items || []).reduce((s, i) => s + (Number(i.precioUnitario) || 0) * (Number(i.cantidad) || 0), 0); },

  /** Todo lo de un mes, con los nombres de Gestión Moda */
  mes(mes) {
    const peds = this.pedidosDelMes(mes);
    const gastos = Fin.gastos().filter(g => g.mes === mes);
    const ventasProductos = peds.reduce((s, o) => s + this.subtotalItems(o), 0);
    const ingresos = peds.reduce((s, o) => s + (Number(o.total) || 0), 0);
    const costoProductos = peds.reduce((s, o) => s + AdminData.costoDe(o), 0);
    const comisiones = gastos.filter(g => g.origen === 'comision').reduce((s, g) => s + (Number(g.monto) || 0), 0);
    const envios = peds.reduce((s, o) => s + (Number(o.envioCosto) || 0), 0);
    const costoComercial = comisiones + envios;
    const costoImpositivo = Math.round(ingresos * this.impuestoPct()) / 100;
    const costoVariable = costoProductos + costoComercial + costoImpositivo;
    const margen = ingresos - costoVariable;
    const porTipo = {};
    Fin.TIPOS_GASTO.forEach(t => { porTipo[t.id] = gastos.filter(g => g.tipo === t.id && g.origen !== 'comision').reduce((s, g) => s + (Number(g.monto) || 0), 0); });
    const gastosFijos = porTipo.administracion + porTipo.comercializacion + porTipo.impositivo;
    const resultado = margen - gastosFijos;
    const resultadoNeto = resultado - porTipo.producto - porTipo.inversion;
    const margenPct = ingresos ? margen / ingresos : 0;
    return {
      mes, pedidos: peds.length, unidades: peds.reduce((s, o) => s + (o.items || []).reduce((a, i) => a + (Number(i.cantidad) || 0), 0), 0),
      ventasProductos, enviosDescuentos: ingresos - ventasProductos, ingresos, costoProductos, comisiones, envios, costoComercial, costoImpositivo,
      costoVariable, margen, margenPct, porTipo, gastosFijos, resultado, resultadoNeto,
      puntoEquilibrio: margenPct > 0 ? gastosFijos / margenPct : 0,
      // Estado financiero
      costoVentas: costoProductos + porTipo.producto,
      utilidadBruta: ingresos - costoProductos - porTipo.producto,
      gastosComercializacion: porTipo.comercializacion + comisiones + envios,
    };
  },

  meses(anio) { return Array.from({ length: 12 }, (_, i) => `${anio}-${String(i + 1).padStart(2, '0')}`); },

  sumar(lista, k) { return lista.reduce((s, x) => s + (Number(x[k]) || 0), 0); },
  porTipoTotal(lista, t) { return lista.reduce((s, x) => s + (x.porTipo[t] || 0), 0); },

  /* ==================== FORMATO ==================== */
  $(n) { return AdminData.formatARS(Math.round(n || 0)); },
  pct(n) { return isFinite(n) && n ? (n * 100).toFixed(1) + '%' : '—'; },

  /** Tabla de meses: filas = [{ l, f(mesData) | total, tipo: 'total'|'sub'|'pct' }] */
  tablaMensual(filas, datos, total) {
    const head = `<tr><th>Concepto</th>${datos.map(d => `<th class="num">${Fin.mesCorto(d.mes)}</th>`).join('')}<th class="num">Total ${this.anio}</th></tr>`;
    const body = filas.map(f => {
      if (f.sep) return `<tr class="rep-sep"><td colspan="${datos.length + 2}">${f.sep}</td></tr>`;
      const val = (d) => f.f(d);
      const fmt = (v) => f.tipo === 'pct' ? this.pct(v) : this.$(v);
      return `<tr class="${f.tipo === 'total' ? 'rep-total' : f.tipo === 'sub' ? 'rep-sub' : ''}"><td>${f.l}${f.ayuda ? ` <span class="rep-ayuda" title="${escHtml(f.ayuda)}">ⓘ</span>` : ''}</td>${datos.map(d => { const v = val(d); return `<td class="num${v < 0 ? ' neg' : ''}">${v || f.tipo === 'pct' ? fmt(v) : '—'}</td>`; }).join('')}<td class="num${val(total) < 0 ? ' neg' : ''}"><strong>${fmt(val(total))}</strong></td></tr>`;
    }).join('');
    return `<div class="table-container rep-wrap"><table class="products-table rep-tabla" id="rep-tabla"><thead>${head}</thead><tbody>${body}</tbody></table></div>`;
  },

  totalAnual(datos) {
    const t = { mes: 'total', porTipo: {} };
    ['pedidos', 'unidades', 'ventasProductos', 'enviosDescuentos', 'ingresos', 'costoProductos', 'comisiones', 'envios', 'costoComercial', 'costoImpositivo', 'costoVariable', 'margen', 'gastosFijos', 'resultado', 'resultadoNeto', 'costoVentas', 'utilidadBruta', 'gastosComercializacion']
      .forEach(k => { t[k] = this.sumar(datos, k); });
    Fin.TIPOS_GASTO.forEach(x => { t.porTipo[x.id] = this.porTipoTotal(datos, x.id); });
    t.margenPct = t.ingresos ? t.margen / t.ingresos : 0;
    t.puntoEquilibrio = t.margenPct > 0 ? t.gastosFijos / 12 / t.margenPct : 0; // promedio mensual
    return t;
  },

  /* ==================== PANTALLA ==================== */
  render() {
    const root = document.getElementById('reportes-root');
    if (!root) return;
    const anios = [...new Set([new Date().getFullYear(), ...AdminData.getOrders().map(o => new Date(o.fecha).getFullYear()), ...Fin.gastos().map(g => Number(String(g.mes).slice(0, 4)))].filter(y => y > 2000))].sort((a, b) => b - a);
    const usaAnio = ['gestion', 'financiero', 'flujo', 'gastos'].includes(this.tab);
    root.innerHTML = `
      <div class="tab-nav rep-tabs">${this.TABS.map(([id, l]) => `<button class="tab${this.tab === id ? ' active' : ''}" onclick="AdminReportes.ir('${id}')">${l}</button>`).join('')}</div>
      <div class="products-toolbar">
        <div class="toolbar-left fin-filtros">
          ${usaAnio ? `<select onchange="AdminReportes.anio=Number(this.value); AdminReportes.render()" aria-label="Año">${anios.map(y => `<option ${y === this.anio ? 'selected' : ''}>${y}</option>`).join('')}</select>` : ''}
          <span id="rep-filtros"></span>
        </div>
        <div class="toolbar-right">
          <button class="btn btn-secondary" onclick="AdminReportes.exportar()">📤 Exportar CSV</button>
          <button class="btn btn-secondary" onclick="window.print()">🖨️ Imprimir</button>
        </div>
      </div>
      <div id="rep-contenido"></div>`;
    const c = document.getElementById('rep-contenido');
    const f = document.getElementById('rep-filtros');
    try { c.innerHTML = this['r_' + this.tab](f); } catch (e) { console.error(e); c.innerHTML = `<div class="fin-vacio">No se pudo armar el reporte: ${escHtml(e.message)}</div>`; }
  },

  ir(tab) { this.tab = tab; this.render(); },

  /* ---------- Estado de Gestión ---------- */
  r_gestion() {
    const datos = this.meses(this.anio).map(m => this.mes(m));
    const t = this.totalAnual(datos);
    const imp = this.impuestoPct();
    return `<p class="rep-intro">Para tomar decisiones: primero lo que deja cada venta (margen) y después los gastos fijos del mes. Los pedidos cancelados no cuentan.</p>` +
      this.tablaMensual([
        { sep: 'Ventas' },
        { l: 'Ventas (productos)', f: d => d.ventasProductos },
        { l: 'Envíos y descuentos', f: d => d.enviosDescuentos, ayuda: 'Envío cobrado a la clienta menos descuentos y cupones' },
        { l: 'Ingresos variables totales', f: d => d.ingresos, tipo: 'total' },
        { sep: 'Costos variables' },
        { l: 'Costo de los productos', f: d => d.costoProductos, ayuda: 'Lo que te costó la mercadería vendida' },
        { l: 'Costos comerciales', f: d => d.costoComercial, ayuda: 'Comisiones de cobro (Mercado Pago…) y envíos que pagaste vos' },
        { l: `Costos impositivos${imp ? ` (${imp}%)` : ''}`, f: d => d.costoImpositivo, ayuda: 'Estimado con el % de Configuración (Monotributo / Ingresos Brutos)' },
        { l: 'Costos variables totales', f: d => d.costoVariable, tipo: 'sub' },
        { l: 'Margen', f: d => d.margen, tipo: 'total' },
        { l: 'Margen %', f: d => d.margenPct, tipo: 'pct' },
        { sep: 'Gastos fijos' },
        { l: 'Administración', f: d => d.porTipo.administracion },
        { l: 'Comercialización', f: d => d.porTipo.comercializacion },
        { l: 'Impositivos', f: d => d.porTipo.impositivo },
        { l: 'Gastos fijos totales', f: d => d.gastosFijos, tipo: 'sub' },
        { l: 'Resultado', f: d => d.resultado, tipo: 'total' },
        { l: 'Resultado %', f: d => d.ingresos ? d.resultado / d.ingresos : 0, tipo: 'pct' },
        { sep: 'Inversiones' },
        { l: 'Gastos de producto', f: d => d.porTipo.producto },
        { l: 'Inversión / desarrollo', f: d => d.porTipo.inversion },
        { l: 'Resultado neto', f: d => d.resultadoNeto, tipo: 'total' },
        { l: 'Resultado neto %', f: d => d.ingresos ? d.resultadoNeto / d.ingresos : 0, tipo: 'pct' },
        { sep: 'Para tener en cuenta' },
        { l: 'Punto de equilibrio', f: d => d.puntoEquilibrio, ayuda: 'Lo mínimo que hay que vender para cubrir los gastos fijos (en el total: promedio por mes)' },
        { l: 'Gastos personales (no cuentan)', f: d => d.porTipo.personal },
      ], datos, t) + this.crecimiento(datos, 'resultadoNeto');
  },

  crecimiento(datos, k) {
    const filas = datos.map((d, i) => {
      const prev = i ? datos[i - 1][k] : 0;
      return prev ? ((d[k] - prev) / Math.abs(prev)) : 0;
    });
    if (!filas.some(Boolean)) return '';
    return `<p class="rep-intro">Crecimiento del resultado neto mes a mes: ${datos.map((d, i) => filas[i] ? `${Fin.mesCorto(d.mes)} ${filas[i] > 0 ? '▲' : '▼'} ${(Math.abs(filas[i]) * 100).toFixed(0)}%` : '').filter(Boolean).join(' · ')}</p>`;
  },

  /* ---------- Estado Financiero ---------- */
  r_financiero() {
    const datos = this.meses(this.anio).map(m => this.mes(m));
    const t = this.totalAnual(datos);
    const gTot = d => d.gastosComercializacion + d.porTipo.administracion + d.porTipo.impositivo;
    const ub = d => d.ingresos ? d.utilidadBruta / d.ingresos : 0;
    return `<p class="rep-intro">Ordenado como un Estado de Resultados contable: ventas netas, costo de ventas, utilidad bruta, gastos y resultado.</p>` +
      this.tablaMensual([
        { l: 'Ventas', f: d => d.ventasProductos },
        { l: 'Envíos, descuentos y ajustes', f: d => d.enviosDescuentos },
        { l: 'Ventas netas', f: d => d.ingresos, tipo: 'total' },
        { l: 'Costo de productos vendidos', f: d => d.costoProductos },
        { l: 'Otros gastos de producción', f: d => d.porTipo.producto },
        { l: 'Costo de ventas', f: d => d.costoVentas, tipo: 'sub' },
        { l: 'Utilidad bruta', f: d => d.utilidadBruta, tipo: 'total' },
        { l: 'Utilidad bruta %', f: ub, tipo: 'pct' },
        { l: 'Gastos de comercialización', f: d => d.gastosComercializacion, ayuda: 'Incluye comisiones de cobro y envíos pagados' },
        { l: 'Gastos de administración', f: d => d.porTipo.administracion },
        { l: 'Gastos impositivos', f: d => d.porTipo.impositivo },
        { l: 'Gastos totales', f: gTot, tipo: 'sub' },
        { l: 'Resultado operativo', f: d => d.utilidadBruta - gTot(d), tipo: 'total' },
        { l: 'Resultado operativo %', f: d => d.ingresos ? (d.utilidadBruta - gTot(d)) / d.ingresos : 0, tipo: 'pct' },
        { l: 'Gastos en desarrollo / inversión', f: d => d.porTipo.inversion },
        { l: 'Resultado final', f: d => d.utilidadBruta - gTot(d) - d.porTipo.inversion, tipo: 'total' },
        { l: 'Resultado final %', f: d => d.ingresos ? (d.utilidadBruta - gTot(d) - d.porTipo.inversion) / d.ingresos : 0, tipo: 'pct' },
        { l: 'Punto de equilibrio', f: d => ub(d) > 0 ? gTot(d) / ub(d) / (d.mes === 'total' ? 12 : 1) : 0, ayuda: 'Ventas netas mínimas para cubrir los gastos (en el total: promedio por mes)' },
      ], datos, t);
  },

  /* ---------- Flujo de Caja ---------- */
  flujoMes(mes) {
    const movs = Fin.list('movimientos').filter(m => Fin.mesDe(m.fecha) === mes);
    const sum = (tipos, filtro = () => true) => movs.filter(m => tipos.includes(m.tipo) && filtro(m)).reduce((s, m) => s + (Number(m.monto) || 0), 0);
    const enCuenta = m => !!m.cuentaId;
    const cobros = sum(['cobro'], enCuenta), entregas = sum(['cobro_cuenta'], enCuenta);
    const sinRegistrar = this.pedidosDelMes(mes).filter(o => Fin.pagoDePedido(o).sinRegistrar).reduce((s, o) => s + (Number(o.total) || 0), 0);
    const pagos = sum(['pago'], enCuenta);
    const pagosViejos = Fin.gastos().filter(g => g.pagadoExterno === true && Fin.mesDe(g.fecha) === mes && g.origen !== 'comision').reduce((s, g) => s + (Number(g.monto) || 0), 0);
    const aportes = sum(['aporte'], enCuenta), retiros = sum(['retiro'], enCuenta);
    const ajustes = movs.filter(m => m.tipo === 'ajuste').reduce((s, m) => s + (Number(m.monto) || 0), 0);
    const ingresos = cobros + entregas + sinRegistrar;
    const egresos = pagos + pagosViejos;
    const [y, mm] = mes.split('-').map(Number);
    const fin = new Date(y, mm, 0, 23, 59, 59);
    const saldo = fin <= new Date() || Fin.mesDe(new Date().toISOString()) === mes ? Fin.cuentas(true).reduce((s, c) => s + Fin.saldoCuenta(c, fin), 0) : 0;
    return { mes, cobros, entregas, sinRegistrar, ingresos, pagos, pagosViejos, egresos, operativo: ingresos - egresos, aportes, retiros, ajustes, flujo: ingresos - egresos + aportes - retiros + ajustes, saldo };
  },

  r_flujo() {
    const datos = this.meses(this.anio).map(m => this.flujoMes(m));
    const t = { mes: 'total' };
    ['cobros', 'entregas', 'sinRegistrar', 'ingresos', 'pagos', 'pagosViejos', 'egresos', 'operativo', 'aportes', 'retiros', 'ajustes', 'flujo'].forEach(k => { t[k] = this.sumar(datos, k); });
    const hoy = Fin.mesDe(new Date().toISOString());
    t.saldo = datos.filter(d => d.mes <= hoy).slice(-1)[0]?.saldo || 0;
    return `<p class="rep-intro">La plata que entró y salió de las cuentas cada mes (no importa de qué mes es la venta o el gasto, sino cuándo se cobró o pagó).</p>` +
      this.tablaMensual([
        { sep: 'Ingresos' },
        { l: 'Cobros de ventas', f: d => d.cobros },
        { l: 'Entregas a cuenta de clientes', f: d => d.entregas },
        { l: 'Ventas cobradas sin cuenta registrada', f: d => d.sinRegistrar, ayuda: 'Pedidos confirmados sin cobro cargado: se toman como cobrados' },
        { l: 'Ingresos totales', f: d => d.ingresos, tipo: 'sub' },
        { sep: 'Egresos' },
        { l: 'Pagos de gastos', f: d => d.pagos },
        { l: 'Gastos cargados antes de Finanzas', f: d => d.pagosViejos },
        { l: 'Egresos totales', f: d => d.egresos, tipo: 'sub' },
        { l: 'Flujo operativo', f: d => d.operativo, tipo: 'total' },
        { sep: 'Socios y ajustes' },
        { l: 'Aportes de socios', f: d => d.aportes },
        { l: 'Retiros de socios', f: d => -d.retiros },
        { l: 'Ajustes de saldo', f: d => d.ajustes },
        { l: 'Flujo de caja', f: d => d.flujo, tipo: 'total' },
        { l: 'Saldo en cuentas a fin de mes', f: d => d.saldo, tipo: 'sub' },
      ], datos, t);
  },

  /* ---------- Finanzas de Socios ---------- */
  r_socios(filtros) {
    filtros.innerHTML = `<select onchange="AdminReportes.sociosPeriodo=this.value; AdminReportes.render()" aria-label="Período">
      ${[['mes', 'Este mes'], ['anio', 'Este año'], ['todo', 'Desde siempre']].map(([v, l]) => `<option value="${v}" ${this.sociosPeriodo === v ? 'selected' : ''}>${l}</option>`).join('')}</select>`;
    const hoy = new Date();
    const desde = this.sociosPeriodo === 'mes' ? new Date(hoy.getFullYear(), hoy.getMonth(), 1) : this.sociosPeriodo === 'anio' ? new Date(hoy.getFullYear(), 0, 1) : null;
    const socios = Fin.sociosResumen(desde, null);
    if (!socios.length) return `<div class="fin-vacio">Primero cargá a las socias en Finanzas → Socios.</div>`;
    const mesesP = this.sociosPeriodo === 'mes' ? [Fin.mesDe(hoy.toISOString())] : this.sociosPeriodo === 'anio' ? this.meses(hoy.getFullYear()).filter(m => m <= Fin.mesDe(hoy.toISOString())) : [...new Set(AdminData.getOrders().map(o => Fin.mesDe(o.fecha)).concat(Fin.gastos().map(g => g.mes)))].filter(Boolean);
    const resultado = mesesP.reduce((s, m) => s + this.mes(m).resultadoNeto, 0);
    return `${FinUI.tarjetas([{ label: 'Resultado neto del período', valor: this.$(resultado), cls: resultado < 0 ? 'alerta' : 'ok' }])}
      <p class="rep-intro">Cuánto de la ganancia le toca a cada socia según su participación, y cuánto ya sacó o puso.</p>
      ${FinUI.tabla([{ k: 'n', l: 'Socia' }, { k: 'p', l: 'Participación', num: true }, { k: 'tc', l: 'Le corresponde', num: true }, { k: 'a', l: 'Aportó', num: true }, { k: 'pg', l: 'Pagó gastos de su bolsillo', num: true }, { k: 'r', l: 'Retiró', num: true }, { k: 'c', l: 'Cobró ventas para ella', num: true }, { k: 's', l: 'Saldo', num: true }],
        socios.map(s => {
          const tc = resultado * s.pct / 100;
          const saldo = tc + s.aportes + s.pagoConSuPlata - s.retiros - s.cobroParaEl;
          return { n: `<strong>${FinUI.esc(s.nombre)}</strong>`, p: s.pct.toFixed(1) + '%', tc: this.$(tc), a: this.$(s.aportes), pg: this.$(s.pagoConSuPlata), r: this.$(s.retiros), c: this.$(s.cobroParaEl),
            s: `<strong class="${saldo < 0 ? 'texto-error' : ''}" title="${saldo >= 0 ? 'Todavía puede retirar' : 'Retiró de más'}">${this.$(saldo)}</strong>` };
        }))}
      <p class="form-hint">Saldo positivo = todavía le corresponde retirar ese monto. Negativo = retiró más de lo que le tocaba.</p>`;
  },

  /* ---------- Rentabilidad ---------- */
  r_rentabilidad(filtros) {
    filtros.innerHTML = `
      <select onchange="AdminReportes.rent.agrupar=this.value; AdminReportes.render()" aria-label="Agrupar por">
        ${[['producto', 'Por producto'], ['categoria', 'Por categoría'], ['canal', 'Por canal'], ['cliente', 'Por cliente'], ['variante', 'Por talle / color']].map(([v, l]) => `<option value="${v}" ${this.rent.agrupar === v ? 'selected' : ''}>${l}</option>`).join('')}
      </select>
      <select onchange="AdminReportes.rent.periodo=this.value; AdminReportes.render()" aria-label="Período">
        ${[['mes', 'Este mes'], ['mesAnterior', 'Mes pasado'], ['anio', 'Este año'], ['todo', 'Desde siempre']].map(([v, l]) => `<option value="${v}" ${this.rent.periodo === v ? 'selected' : ''}>${l}</option>`).join('')}
      </select>`;
    const hoy = new Date();
    const enPeriodo = (f) => {
      const m = Fin.mesDe(f);
      if (this.rent.periodo === 'mes') return m === Fin.mesDe(hoy.toISOString());
      if (this.rent.periodo === 'mesAnterior') return m === Fin.mesDe(new Date(hoy.getFullYear(), hoy.getMonth() - 1, 15).toISOString());
      if (this.rent.periodo === 'anio') return m.startsWith(String(hoy.getFullYear()));
      return true;
    };
    const imp = this.impuestoPct() / 100;
    const comisionDe = {};
    Fin.gastos().filter(g => g.origen === 'comision' && g.pedidoId).forEach(g => { comisionDe[g.pedidoId] = (comisionDe[g.pedidoId] || 0) + (Number(g.monto) || 0); });
    const grupos = {};
    AdminData.getOrders().filter(o => o.estado !== 'cancelado' && enPeriodo(o.fecha)).forEach(o => {
      const items = o.items || [];
      const sub = this.subtotalItems(o) || 1;
      const costoO = AdminData.costoDe(o);
      const costosItems = items.map(i => AdminData.costoUnitarioARS(AdminData.getProduct(i.productoId)) * (Number(i.cantidad) || 0));
      const sumaCostos = costosItems.reduce((a, b) => a + b, 0);
      const comercial = (comisionDe[o.id] || 0) + (Number(o.envioCosto) || 0);
      items.forEach((it, idx) => {
        const share = ((Number(it.precioUnitario) || 0) * (Number(it.cantidad) || 0)) / sub;
        const venta = (Number(o.total) || 0) * share;
        const costo = sumaCostos ? costoO * (costosItems[idx] / sumaCostos) : costoO * share;
        const p = AdminData.getProduct(it.productoId);
        let clave, nombre;
        switch (this.rent.agrupar) {
          case 'categoria': clave = p?.categoria || 'sin'; nombre = (AdminData.getEffectiveCategorias().find(c => c.id === p?.categoria)?.nombre) || p?.categoriaOriginal || 'Sin categoría'; break;
          case 'canal': { const og = AdminData.origenDe(o); clave = og.id; nombre = `${og.icon} ${og.label}`; break; }
          case 'cliente': clave = Fin.claveCliente(o) || 'sin'; nombre = o.cliente || 'Sin nombre'; break;
          case 'variante': clave = String(it.productoId) + '|' + (it.variante || ''); nombre = `${p?.nombre || it.nombre || it.productoId}${it.variante ? ' · ' + AdminData.varianteLegible(it.variante) : ''}`; break;
          default: clave = String(it.productoId); nombre = p?.nombre || it.nombre || it.productoId;
        }
        const g = grupos[clave] || (grupos[clave] = { nombre, unidades: 0, ventas: 0, costoProducto: 0, costoComercial: 0, costoImpositivo: 0 });
        g.unidades += Number(it.cantidad) || 0;
        g.ventas += venta;
        g.costoProducto += costo;
        g.costoComercial += comercial * share;
        g.costoImpositivo += venta * imp;
      });
    });
    const lista = Object.values(grupos).map(g => ({ ...g, costoTotal: g.costoProducto + g.costoComercial + g.costoImpositivo })).map(g => ({ ...g, ganancia: g.ventas - g.costoTotal }))
      .sort((a, b) => b.ganancia - a.ganancia);
    const tot = { ventas: this.sumar(lista, 'ventas'), ganancia: this.sumar(lista, 'ganancia'), unidades: this.sumar(lista, 'unidades') };
    return `${FinUI.tarjetas([{ label: 'Ventas', valor: this.$(tot.ventas) }, { label: 'Ganancia (antes de gastos fijos)', valor: this.$(tot.ganancia), cls: tot.ganancia < 0 ? 'alerta' : 'ok' }, { label: 'Unidades', valor: String(tot.unidades) }])}
      <p class="rep-intro">Qué deja más plata antes de pagar los gastos fijos. Ordenado de mayor a menor ganancia.</p>
      <div class="table-container rep-wrap"><table class="products-table rep-tabla" id="rep-tabla"><thead><tr><th>${{ producto: 'Producto', categoria: 'Categoría', canal: 'Canal', cliente: 'Cliente', variante: 'Producto / talle' }[this.rent.agrupar]}</th><th class="num">Unid.</th><th class="num">Ventas</th><th class="num">Costo producto</th><th class="num">Costo comercial</th><th class="num">Impuestos</th><th class="num">Ganancia</th><th class="num">Ganancia %</th><th class="num">Precio prom.</th></tr></thead><tbody>
      ${lista.length ? lista.map(g => `<tr><td>${FinUI.esc(g.nombre)}</td><td class="num">${g.unidades}</td><td class="num">${this.$(g.ventas)}</td><td class="num">${this.$(g.costoProducto)}</td><td class="num">${this.$(g.costoComercial)}</td><td class="num">${this.$(g.costoImpositivo)}</td><td class="num${g.ganancia < 0 ? ' neg' : ''}"><strong>${this.$(g.ganancia)}</strong></td><td class="num">${this.pct(g.ventas ? g.ganancia / g.ventas : 0)}</td><td class="num">${this.$(g.unidades ? g.ventas / g.unidades : 0)}</td></tr>`).join('')
        : `<tr><td colspan="9" class="fin-vacio">No hay ventas en este período.</td></tr>`}
      </tbody></table></div>`;
  },

  /* ---------- Gastos por mes ---------- */
  r_gastos() {
    const meses = this.meses(this.anio);
    const gastos = Fin.gastos().filter(g => String(g.mes).startsWith(String(this.anio)));
    const filas = [];
    Fin.TIPOS_GASTO.forEach(t => {
      const deT = gastos.filter(g => g.tipo === t.id);
      if (!deT.length) return;
      filas.push({ l: `${t.icon} ${t.label}`, vals: meses.map(m => deT.filter(g => g.mes === m).reduce((s, g) => s + (Number(g.monto) || 0), 0)), tipo: 'sub' });
      const cats = [...new Set(deT.map(g => g.categoria || g.concepto))];
      cats.forEach(c => filas.push({ l: '&nbsp;&nbsp;' + FinUI.esc(c), vals: meses.map(m => deT.filter(g => (g.categoria || g.concepto) === c && g.mes === m).reduce((s, g) => s + (Number(g.monto) || 0), 0)) }));
    });
    if (!filas.length) return `<div class="fin-vacio">No hay gastos cargados en ${this.anio}.</div>`;
    const totales = meses.map((m, i) => filas.filter(f => f.tipo === 'sub').reduce((s, f) => s + f.vals[i], 0));
    const row = (f) => `<tr class="${f.tipo === 'sub' ? 'rep-sub' : f.tipo === 'total' ? 'rep-total' : ''}"><td>${f.l}</td>${f.vals.map(v => `<td class="num">${v ? this.$(v) : '—'}</td>`).join('')}<td class="num"><strong>${this.$(f.vals.reduce((a, b) => a + b, 0))}</strong></td></tr>`;
    return `<p class="rep-intro">Gastos por tipo y categoría, según el mes del gasto. Incluye comisiones automáticas y gastos personales.</p>
      <div class="table-container rep-wrap"><table class="products-table rep-tabla" id="rep-tabla"><thead><tr><th>Gasto</th>${meses.map(m => `<th class="num">${Fin.mesCorto(m)}</th>`).join('')}<th class="num">Total</th></tr></thead><tbody>
      ${filas.map(row).join('')}${row({ l: 'Total', vals: totales, tipo: 'total' })}</tbody></table></div>`;
  },

  /* ---------- Movimientos ---------- */
  r_movimientos(filtros) {
    const hoy = new Date();
    if (!this.movs.desde) this.movs.desde = FinUI.fechaInput(new Date(hoy.getFullYear(), hoy.getMonth(), 1).toISOString());
    if (!this.movs.hasta) this.movs.hasta = FinUI.hoyInput();
    filtros.innerHTML = `
      <label>Desde <input type="date" value="${this.movs.desde}" onchange="AdminReportes.movs.desde=this.value; AdminReportes.render()"></label>
      <label>Hasta <input type="date" value="${this.movs.hasta}" onchange="AdminReportes.movs.hasta=this.value; AdminReportes.render()"></label>
      <select onchange="AdminReportes.movs.cuenta=this.value; AdminReportes.render()" aria-label="Cuenta"><option value="">Todas las cuentas</option>${Fin.cuentas().map(c => `<option value="${FinUI.esc(c.id)}" ${this.movs.cuenta === String(c.id) ? 'selected' : ''}>${FinUI.esc(c.nombre)}</option>`).join('')}</select>`;
    const d = new Date(this.movs.desde + 'T00:00:00'), h = new Date(this.movs.hasta + 'T23:59:59');
    let lista = Fin.list('movimientos').filter(m => { const f = new Date(m.fecha); return f >= d && f <= h; });
    if (this.movs.cuenta) lista = lista.filter(m => String(m.cuentaId) === this.movs.cuenta || String(m.cuentaDestinoId) === this.movs.cuenta);
    lista.sort((a, b) => new Date(b.fecha) - new Date(a.fecha));
    // Con una cuenta elegida: lo que entra/sale de esa cuenta. Sin cuenta: las transferencias no suman ni restan
    const signo = m => {
      if (this.movs.cuenta) return Fin.efecto(m, this.movs.cuenta);
      const v = Number(m.monto) || 0;
      if (['cobro', 'cobro_cuenta', 'aporte'].includes(m.tipo)) return m.cuentaId ? v : 0;
      if (['pago', 'retiro'].includes(m.tipo)) return m.cuentaId ? -v : 0;
      if (m.tipo === 'ajuste') return v;
      return 0;
    };
    const entra = lista.reduce((s, m) => { const v = signo(m); return s + (v > 0 ? v : 0); }, 0);
    const sale = lista.reduce((s, m) => { const v = signo(m); return s + (v < 0 ? -v : 0); }, 0);
    return `${FinUI.tarjetas([{ label: 'Entró', valor: this.$(entra), cls: 'ok' }, { label: 'Salió', valor: this.$(sale) }, { label: 'Neto', valor: this.$(entra - sale) }])}
      <div class="table-container rep-wrap"><table class="products-table rep-tabla" id="rep-tabla"><thead><tr><th>Fecha</th><th>Movimiento</th><th>Cuenta</th><th>Detalle</th><th class="num">Monto</th></tr></thead><tbody>
      ${lista.length ? lista.map(m => { const v = signo(m); return `<tr><td>${AdminApp.formatDateTime ? AdminApp.formatDateTime(m.fecha) : FinUI.fecha(m.fecha)}</td><td>${Fin.ETIQUETA_MOV[m.tipo] || m.tipo}</td><td>${FinUI.esc(m.tipo === 'transferencia' ? `${Fin.get('cuentas', m.cuentaId)?.nombre || '?'} → ${Fin.get('cuentas', m.cuentaDestinoId)?.nombre || '?'}` : Fin.origenMovimiento(m))}</td><td>${FinUI.esc(m.nota || '')}</td><td class="num${v < 0 ? ' neg' : ''}"><strong>${v === 0 ? this.$(m.monto) : (v < 0 ? '−' : '+') + this.$(Math.abs(v))}</strong></td></tr>`; }).join('')
        : '<tr><td colspan="5" class="fin-vacio">No hay movimientos en esas fechas.</td></tr>'}
      </tbody></table></div>`;
  },

  /* ---------- Exportar ---------- */
  exportar() {
    const t = document.getElementById('rep-tabla') || document.querySelector('#rep-contenido table');
    if (!t) { AdminApp.toast('No hay tabla para exportar', 'error'); return; }
    const filas = [...t.querySelectorAll('tr')].map(tr => [...tr.children].map(td => AdminProducts.csvCell(td.textContent.replace(/\s+/g, ' ').replace(/ⓘ/g, '').trim())).join(','));
    AdminProducts.downloadFile(filas.join('\n'), `reporte-${this.tab}-${this.anio}.csv`, 'text/csv');
  },

  /* ==================== TARJETAS (Inicio y Finanzas) ==================== */
  resumenHtml() {
    const mesHoy = Fin.mesDe(new Date().toISOString());
    const d = this.mes(mesHoy);
    const inventario = AdminData.getProducts().reduce((s, p) => s + Math.max(0, Number(p.stock) || 0) * AdminData.costoUnitarioARS(p), 0);
    return `<h3 class="fin-subtitulo">📅 ${Fin.nombreMes(mesHoy)}</h3>` + FinUI.tarjetas([
      { label: 'Ventas del mes', valor: this.$(d.ingresos), sub: `${d.pedidos} venta${d.pedidos !== 1 ? 's' : ''} · ticket ${this.$(d.pedidos ? d.ingresos / d.pedidos : 0)}`, onclick: "AdminApp.navigate('orders')" },
      { label: 'Ganancia por ventas', valor: this.$(d.margen), sub: `Margen ${this.pct(d.margenPct)}`, onclick: "AdminReportes.tab='gestion';AdminApp.navigate('reportes')" },
      { label: 'Gastos fijos del mes', valor: this.$(d.gastosFijos), onclick: "AdminApp.navigate('expenses')" },
      { label: 'Resultado neto del mes', valor: this.$(d.resultadoNeto), cls: d.resultadoNeto < 0 ? 'alerta' : 'ok', onclick: "AdminReportes.tab='gestion';AdminApp.navigate('reportes')" },
      { label: 'Disponible en cuentas', valor: this.$(Fin.disponible()), onclick: "AdminApp.navigate('cuentas')" },
      { label: 'A cobrar de clientes', valor: this.$(Fin.aCobrar()), cls: Fin.aCobrar() > 0 ? 'alerta' : '', onclick: "AdminApp.navigate('clientes')" },
      { label: 'A pagar a proveedores', valor: this.$(Fin.aPagar()), cls: Fin.aPagar() > 0 ? 'alerta' : '', onclick: "AdminExpenses.filtros={mes:'todos',tipo:'',estado:'pendiente',proveedor:'',q:''};AdminApp.navigate('expenses')" },
      { label: 'Mercadería en stock (al costo)', valor: this.$(inventario), onclick: "AdminApp.navigate('products')" },
    ]);
  },

  renderResumen(id) {
    const el = document.getElementById(id);
    if (el) el.innerHTML = this.resumenHtml();
  },
};
