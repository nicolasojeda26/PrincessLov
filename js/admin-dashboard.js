/* ============================================
   ADMIN DASHBOARD - Métricas y Gráficos
   ============================================ */

const AdminDashboard = {
  charts: {},
  currentPeriod: 'mes',

  setPeriod(period) {
    this.currentPeriod = period;
    document.querySelectorAll('#dashboard-tabs .tab, #financial-tabs .tab').forEach(t => {
      t.classList.toggle('active', t.dataset.period === period);
    });
    // Re-renderiza la sección visible
    if (AdminApp.currentSection === 'financial') this.renderFinancial();
    else this.render();
  },

  render() {
    // Sincronizar pestañas de período (dashboard + finanzas comparten período)
    document.querySelectorAll('#dashboard-tabs .tab, #financial-tabs .tab').forEach(t => {
      t.classList.toggle('active', t.dataset.period === this.currentPeriod);
    });

    this.renderStats();
    this.renderCharts();
    this.renderBreakEven();
    this.renderTopProducts();
    this.renderStockAlerts();
    // Si el usuario está en Finanzas, también actualiza esos datos al cambiar período desde Dashboard
    if (AdminApp.currentSection === 'financial') this.renderFinancial();
  },

  renderStats() {
    const stats = AdminData.getStats(this.currentPeriod === 'all' ? null : this.currentPeriod);
    const container = document.getElementById('dashboard-stats');
    if (!container) return;

    container.innerHTML = `
      <div class="stat-card">
        <div class="stat-icon" style="background:linear-gradient(135deg, var(--rosa-300), var(--borgona-300));">💰</div>
        <div class="stat-value">${AdminData.formatARS(stats.ingresos)}</div>
        <div class="stat-label">Ingresos</div>
      </div>
      <div class="stat-card">
        <div class="stat-icon" style="background:linear-gradient(135deg, #10B981, #059669);">📦</div>
        <div class="stat-value">${stats.totalPedidos}</div>
        <div class="stat-label">Pedidos</div>
      </div>
      <div class="stat-card">
        <div class="stat-icon" style="background:linear-gradient(135deg, #F59E0B, #D97706);">⏳</div>
        <div class="stat-value">${stats.pedidosActivos}</div>
        <div class="stat-label">Pedidos activos</div>
      </div>
      <div class="stat-card">
        <div class="stat-icon" style="background:linear-gradient(135deg, #8B5CF6, #6D28D9);">📊</div>
        <div class="stat-value">${stats.margen.toFixed(1)}%</div>
        <div class="stat-label">Margen de ganancia</div>
      </div>
    `;
  },

  renderCharts() {
    const stats = AdminData.getStats(this.currentPeriod === 'all' ? null : this.currentPeriod);
    this.renderVentasChart(stats);
    this.renderEstadosChart(stats);
  },

  renderVentasChart(stats) {
    const canvas = document.getElementById('chart-ventas');
    if (!canvas || typeof Chart === 'undefined') return;

    try {
    if (this.charts.ventas) this.charts.ventas.destroy();

    const labels = stats.ventasPorDia.map(d => {
      const parts = d.fecha.split('-');
      return parts[2] + '/' + parts[1];
    });
    const ingresos = stats.ventasPorDia.map(d => d.ingresos);
    const pedidos = stats.ventasPorDia.map(d => d.pedidos);

    this.charts.ventas = new Chart(canvas, {
      type: 'line',
      data: {
        labels,
        datasets: [{
          label: 'Ingresos (ARS)',
          data: ingresos,
          borderColor: '#800020',
          backgroundColor: 'rgba(128, 0, 32, 0.1)',
          fill: true,
          tension: 0.4,
          pointRadius: 2,
        }, {
          label: 'Pedidos',
          data: pedidos,
          borderColor: '#F5B7C5',
          backgroundColor: 'rgba(245, 183, 197, 0.1)',
          fill: false,
          tension: 0.4,
          pointRadius: 2,
          yAxisID: 'y1',
        }],
      },
      options: {
        responsive: true,
        plugins: { legend: { position: 'bottom' } },
        scales: {
          y: { beginAtZero: true, ticks: { callback: v => '$' + v.toLocaleString() } },
          y1: { beginAtZero: true, position: 'right', grid: { drawOnChartArea: false } },
        },
      },
    });
    } catch (e) {
      console.error('Error al renderizar gráfico de ventas:', e);
    }
  },

  renderEstadosChart(stats) {
    const canvas = document.getElementById('chart-estados');
    if (!canvas || typeof Chart === 'undefined') return;

    try {
    if (this.charts.estados) this.charts.estados.destroy();

    const labels = [];
    const data = [];
    const colors = [];

    ADMIN_CONFIG.estadosPedido.forEach(ep => {
      const count = stats.porEstado[ep.id] || 0;
      if (count > 0) {
        labels.push(ep.icon + ' ' + ep.label);
        data.push(count);
        colors.push(ep.color);
      }
    });

    if (data.length === 0) {
      labels.push('Sin pedidos');
      data.push(1);
      colors.push('#D4C4C8');
    }

    this.charts.estados = new Chart(canvas, {
      type: 'doughnut',
      data: {
        labels,
        datasets: [{ data, backgroundColor: colors, borderWidth: 0 }],
      },
      options: {
        responsive: true,
        plugins: { legend: { position: 'bottom', labels: { padding: 15 } } },
        cutout: '60%',
      },
    });
    } catch (e) {
      console.error('Error al renderizar gráfico de estados:', e);
    }
  },

  renderBreakEven() {
    const be = AdminData.calcularPuntoEquilibrio(AdminApp.dolarRate);
    const container = document.getElementById('breakeven-content');
    if (!container) return;

    const stats = AdminData.getStats(this.currentPeriod === 'all' ? null : this.currentPeriod);
    const ventas = stats.ingresos;
    const progreso = be.gastosFijos > 0 ? Math.min((ventas / be.gastosFijos) * 100, 100) : 0;

    container.innerHTML = `
      <div style="text-align:center; margin:1.5rem 0;">
        <div style="font-size:2rem; font-weight:800; color:var(--borgona-300);">${AdminData.formatNumber(be.unidades)}</div>
        <div style="color:var(--texto-secundario); font-size:0.9rem;">unidades necesarias</div>
      </div>
      <div class="breakeven-progress">
        <div class="breakeven-bar" style="width:${progreso}%"></div>
      </div>
      <div style="display:flex; justify-content:space-between; margin-top:0.5rem; font-size:0.8rem; color:var(--texto-secundario);">
        <span>Ventas: ${AdminData.formatARS(ventas)}</span>
        <span>Objetivo: ${AdminData.formatARS(be.gastosFijos)}</span>
      </div>
      <div style="margin-top:1rem; font-size:0.85rem;">
        <div style="display:flex; justify-content:space-between; padding:0.3rem 0;">
          <span style="color:var(--texto-secundario);">Gastos fijos mensuales:</span>
          <strong>${AdminData.formatARS(be.gastosFijos)}</strong>
        </div>
        <div style="display:flex; justify-content:space-between; padding:0.3rem 0;">
          <span style="color:var(--texto-secundario);">Ganancia prom. por unidad:</span>
          <strong>${AdminData.formatARS(be.gananciaPromUnit)}</strong>
        </div>
        <div style="display:flex; justify-content:space-between; padding:0.3rem 0;">
          <span style="color:var(--texto-secundario);">Progreso al punto de equilibrio:</span>
          <strong style="color:${progreso >= 100 ? '#10B981' : '#F59E0B'};">${progreso.toFixed(0)}%</strong>
        </div>
      </div>
    `;
  },

  renderTopProducts() {
    const stats = AdminData.getStats(this.currentPeriod === 'all' ? null : this.currentPeriod);
    const container = document.getElementById('top-products-list');
    if (!container) return;

    if (stats.topProductos.length === 0) {
      container.innerHTML = '<p style="text-align:center; padding:2rem; color:var(--texto-secundario);">Sin datos de ventas aún</p>';
      return;
    }

    container.innerHTML = stats.topProductos.map((p, i) => `
      <div style="display:flex; align-items:center; gap:0.75rem; padding:0.6rem 0; border-bottom:1px solid var(--gris-200);">
        <span style="width:24px; text-align:center; font-weight:700; color:${i < 3 ? 'var(--borgona-300)' : 'var(--texto-secundario)'};">#${i + 1}</span>
        <span style="flex:1; font-size:0.85rem; font-weight:500;">${escHtml(p.nombre)}</span>
        <span style="font-weight:700; color:var(--borgona-300);">${p.cantidad} u.</span>
      </div>
    `).join('');
  },

  renderStockAlerts() {
    const lowStock = AdminData.getLowStockProducts(3);
    const card = document.getElementById('stock-alerts-card');
    const list = document.getElementById('stock-alerts-list');
    if (!card || !list) return;

    if (lowStock.length === 0) {
      card.style.display = 'none';
      return;
    }

    card.style.display = 'block';
    // Badge de conteo en el título
    const title = card.querySelector('h3');
    if (title) title.innerHTML = `⚠️ Alertas de Stock Bajo <span style="background:#EF4444;color:#fff;border-radius:999px;padding:2px 8px;font-size:12px;margin-left:6px;">${lowStock.length}</span>`;
    // Primero lo agotado; se muestran 6 y el resto queda plegado (con 30+ avisos tapaba todo el Inicio)
    lowStock.sort((a, b) => (a.stock || 0) - (b.stock || 0));
    const VISIBLES = 6;
    const fila = (p) => `
      <div style="display:flex; align-items:center; gap:0.75rem; padding:0.6rem 0; border-bottom:1px solid var(--gris-200);">
        <span style="color:${p.stock === 0 ? '#EF4444' : '#F59E0B'}; font-weight:700;">${p.stock === 0 ? '🚫' : '⚠️'}</span>
        <span style="flex:1; font-size:0.85rem;">${escHtml(p.nombre)}</span>
        <span style="font-size:0.8rem; color:${p.stock === 0 ? '#EF4444' : '#F59E0B'}; font-weight:600;">
          ${p.stock === 0 ? 'Sin stock' : `Solo ${p.stock} u.`}
        </span>
      </div>
    `;
    const resto = lowStock.slice(VISIBLES);
    list.innerHTML = lowStock.slice(0, VISIBLES).map(fila).join('') + (resto.length ? `
      <details style="margin-top:0.5rem;">
        <summary style="cursor:pointer; font-size:0.85rem; font-weight:600; color:var(--borgona-300); padding:0.4rem 0;">Ver los ${resto.length} restantes</summary>
        ${resto.map(fila).join('')}
      </details>` : '');
  },

  /* ========== FINANCIAL SECTION ========== */
  renderFinancial() {
    // Sincroniza tabs de período
    document.querySelectorAll('#dashboard-tabs .tab, #financial-tabs .tab').forEach(t => {
      t.classList.toggle('active', t.dataset.period === this.currentPeriod);
    });
    const periodo = this.currentPeriod === 'all' ? null : this.currentPeriod;
    const stats = AdminData.getStats(periodo);
    const totalExpenses = AdminData.getTotalExpenses(periodo);
    const be = AdminData.calcularPuntoEquilibrio(AdminApp.dolarRate);

    const container = document.getElementById('financial-stats');
    if (container) {
      container.innerHTML = `
        <div class="stat-card">
          <div class="stat-icon" style="background:linear-gradient(135deg, #10B981, #059669);">💵</div>
          <div class="stat-value">${AdminData.formatARS(stats.ingresos)}</div>
          <div class="stat-label">Ingresos totales</div>
        </div>
        <div class="stat-card">
          <div class="stat-icon" style="background:linear-gradient(135deg, #EF4444, #DC2626);">📉</div>
          <div class="stat-value">${AdminData.formatARS(stats.costos + totalExpenses)}</div>
          <div class="stat-label">Costos totales</div>
        </div>
        <div class="stat-card">
          <div class="stat-icon" style="background:linear-gradient(135deg, var(--rosa-300), var(--borgona-300));">💎</div>
          <div class="stat-value" style="color:${stats.ganancia >= 0 ? '#10B981' : '#EF4444'};">${AdminData.formatARS(stats.ganancia - totalExpenses)}</div>
          <div class="stat-label">Ganancia neta</div>
        </div>
        <div class="stat-card">
          <div class="stat-icon" style="background:linear-gradient(135deg, #F59E0B, #D97706);">🎫</div>
          <div class="stat-value">${AdminData.formatARS(stats.ticketProm)}</div>
          <div class="stat-label">Ticket promedio</div>
        </div>
      `;
    }

    this.renderFinancialChart(stats, totalExpenses);
    this.renderFinancialBreakEven(be);
    this.renderFinancialGroups(stats);
    this.renderGroupsChart(stats);
    this.renderFinancialExpenses();
  },

  renderFinancialGroups(stats) {
    const container = document.getElementById('financial-groups');
    if (!container) return;
    const grupos = stats.gananciaPorGrupo || [];
    if (grupos.length === 0) {
      container.innerHTML = `<p style="color:var(--texto-secundario); padding:0.9rem 0; text-align:center; background:var(--gris-100); border-radius:8px; border:1px dashed var(--gris-200);">Aún no hay ventas en este período.<br><span style="font-size:0.82rem;">Cargá pedidos con productos categorizados y acá verás la ganancia separada por Deportivo, Lencería, Pijamas, etc.</span></p>`;
      return;
    }
    const maxIngresos = Math.max(...grupos.map(g => Math.max(g.ingresos, 1)), 1);
    const totalGanancia = grupos.reduce((s,g)=>s+(g.ganancia||0),0);
    const totalIngresos = grupos.reduce((s,g)=>s+(g.ingresos||0),0);
    const totalCostos = grupos.reduce((s,g)=>s+(g.costos||0),0);
    const grupoIcons = { 'Indumentaria Deportiva':'🏃', 'Pijamas':'🌙', 'Accesorios':'🎀', 'Lencería':'🎀', 'Ofertas':'🔥', 'General':'📦' };
    const periodLabel = stats.periodo === 'total' ? 'Todo' : stats.periodo;
    container.innerHTML = `
      <p style="font-size:0.78rem; color:var(--texto-secundario); margin:0 0 0.7rem;">Período: <strong style="color:var(--texto);">${periodLabel}</strong> · ${grupos.length} categoría${grupos.length!==1?'s':''} con ventas</p>
      <div style="display:flex; flex-direction:column; gap:0.85rem;">
        ${grupos.map(g => {
          const pctIngresos = Math.min((g.ingresos / maxIngresos) * 100, 100);
          const pctTotal = totalIngresos > 0 ? (g.ingresos / totalIngresos * 100) : 0;
          const color = g.ganancia >= 0 ? '#10B981' : '#EF4444';
          const icon = grupoIcons[g.grupo] || '📦';
          return `
            <div style="padding:0.6rem 0; border-bottom:1px solid var(--gris-200);">
              <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:0.3rem;">
                <span style="font-weight:700; font-size:0.93rem;">${icon} ${g.grupo}</span>
                <span style="color:${color}; font-weight:800; font-size:0.95rem;">${AdminData.formatARS(g.ganancia)}</span>
              </div>
              <div style="background:var(--gris-200); border-radius:999px; height:10px; overflow:hidden; position:relative;">
                <div style="width:${pctIngresos}%; height:100%; background:linear-gradient(90deg, var(--borgona-300), var(--borgona-500)); border-radius:999px; transition:width 0.5s ease;"></div>
              </div>
              <div style="display:flex; justify-content:space-between; margin-top:0.3rem; font-size:0.78rem; color:var(--texto-secundario); flex-wrap:wrap; gap:0.5rem;">
                <span>Ingresos: <strong style="color:var(--texto);">${AdminData.formatARS(g.ingresos)}</strong> <span style="opacity:0.7;">(${pctTotal.toFixed(1)}% del total)</span></span>
                <span>Costos: <strong style="color:var(--texto);">${AdminData.formatARS(g.costos)}</strong></span>
              </div>
            </div>`;
        }).join('')}
        <div style="display:flex; justify-content:space-between; align-items:center; padding:0.75rem 0.9rem; background: var(--borgona-500); color:white; border-radius:10px; margin-top:0.2rem;">
          <span style="font-weight:700;">Σ Total del período</span>
          <span style="font-weight:800; font-size:1.05rem;">${AdminData.formatARS(totalGanancia)}</span>
        </div>
        <p style="font-size:0.75rem; color:var(--texto-secundario); margin:0;">Ingresos totales: ${AdminData.formatARS(totalIngresos)} · Costos totales: ${AdminData.formatARS(totalCostos)}</p>
      </div>`;
  },

  renderGroupsChart(stats) {
    const canvas = document.getElementById('chart-groups');
    if (!canvas || typeof Chart === 'undefined') return;
    try {
      if (this.charts.groups) this.charts.groups.destroy();
      const grupos = stats.gananciaPorGrupo || [];
      if (grupos.length === 0) {
        const ctx = canvas.getContext('2d');
        ctx.clearRect(0,0,canvas.width,canvas.height);
        return;
      }
      const palette = ['#800020','#A05A6E','#C47A8E','#6B0F2A','#4A0A1C','#F5B7C5','#D4A0B0','#8B5CF6'];
      this.charts.groups = new Chart(canvas, {
        type: 'doughnut',
        data: {
          labels: grupos.map(g => g.grupo),
          datasets: [{ data: grupos.map(g => g.ingresos), backgroundColor: grupos.map((_,i)=> palette[i%palette.length]), borderWidth: 0 }],
        },
        options: { responsive:true, plugins:{ legend:{ position:'bottom', labels:{ padding:14, font:{size:11} } } }, cutout:'58%' },
      });
    } catch(e){ console.error('Error chart grupos', e); }
  },

  renderFinancialChart(stats, totalExpenses) {
    const canvas = document.getElementById('chart-financial');
    if (!canvas || typeof Chart === 'undefined') return;
    try {
    if (this.charts.financial) this.charts.financial.destroy();
    const costosTotales = (stats.costos || 0) + (totalExpenses || 0);

    this.charts.financial = new Chart(canvas, {
      type: 'bar',
      data: {
        labels: ['Ingresos', 'Costos', 'Gastos', 'Ganancia'],
        datasets: [{
          data: [stats.ingresos, costosTotales, totalExpenses || 0, (stats.ganancia || 0) - (totalExpenses || 0)],
          backgroundColor: ['#10B981', '#EF4444', '#F59E0B', stats.ganancia >= 0 ? '#800020' : '#EF4444'],
          borderRadius: 8,
        }],
      },
      options: {
        responsive: true,
        plugins: { legend: { display: false } },
        scales: { y: { beginAtZero: true, ticks: { callback: v => '$' + v.toLocaleString() } } },
      },
    });
    } catch (e) {
      console.error('Error al renderizar gráfico financiero:', e);
    }
  },

  renderFinancialBreakEven(be) {
    const container = document.getElementById('financial-breakeven');
    if (!container) return;

    container.innerHTML = `
      <div style="margin:1rem 0;">
        <div style="display:flex; justify-content:space-between; padding:0.5rem 0; border-bottom:1px solid var(--gris-200);">
          <span>Gastos fijos mensuales:</span>
          <strong>${AdminData.formatARS(be.gastosFijos)}</strong>
        </div>
        <div style="display:flex; justify-content:space-between; padding:0.5rem 0; border-bottom:1px solid var(--gris-200);">
          <span>Ganancia promedio por unidad:</span>
          <strong>${AdminData.formatARS(be.gananciaPromUnit)}</strong>
        </div>
        <div style="display:flex; justify-content:space-between; padding:0.5rem 0; border-bottom:1px solid var(--gris-200);">
          <span>Unidades para punto de equilibrio:</span>
          <strong style="color:var(--borgona-300); font-size:1.1rem;">${AdminData.formatNumber(be.unidades)} u.</strong>
        </div>
        <div style="display:flex; justify-content:space-between; padding:0.5rem 0;">
          <span>Monto de punto de equilibrio:</span>
          <strong style="color:var(--borgona-300);">${AdminData.formatARS(be.monto)}</strong>
        </div>
      </div>
    `;
  },

  renderFinancialExpenses() {
    const periodo = this.currentPeriod === 'all' ? null : this.currentPeriod;
    let expenses = AdminData.getExpenses().sort((a, b) => new Date(b.fecha) - new Date(a.fecha));
    if (periodo) {
      expenses = expenses.filter(e => AdminData.isInPeriod(e.fecha, periodo));
    }
    expenses = expenses.slice(0, 15);
    const container = document.getElementById('financial-expenses-list');
    if (!container) return;

    if (expenses.length === 0) {
      container.innerHTML = '<p style="text-align:center; padding:2rem; color:var(--texto-secundario);">Sin gastos registrados</p>';
      return;
    }

    container.innerHTML = expenses.map(e => `
      <div style="display:flex; align-items:center; gap:1rem; padding:0.75rem 0; border-bottom:1px solid var(--gris-200);">
        <span style="flex:1; font-size:0.85rem; font-weight:500;">${escHtml(e.concepto)}</span>
        <span style="font-size:0.8rem; color:var(--texto-secundario);">${AdminApp.formatDate(e.fecha)}</span>
        <span style="font-size:0.8rem; padding:0.2rem 0.5rem; border-radius:20px; background:var(--gris-200);">${escHtml(e.categoria)}</span>
        <span style="font-weight:700; color:#EF4444;">-${AdminData.formatARS(e.monto)}</span>
      </div>
    `).join('');
  },
};
