/* ============================================
   ADMIN CONFIG - Configuración del Panel Admin
   ============================================ */

const ADMIN_CONFIG = {
  // Gastos fijos mensuales en ARS
  gastosFijos: {
    alquiler: 0,
    servicios: 0,
    internet: 0,
    empaquetado: 0,     // costo por unidad de envoltorio
    transporte: 0,      // costo fijo mensual de traslado
    otros: 0,
  },

  // Costos variables por producto (en pesos, se suman al costo)
  costosVariables: {
    envoltorio: 785,    // $ por unidad
    etiqueta: 157,      // $ por unidad
    moneda: 'ARS',
    comisionMP: 0.046,  // 4.6% Mercado Pago
    comisionEnvio: 0,   // % adicional por envío (si lo absorbés)
  },

  // Estados de pedido
  estadosPedido: [
    { id: 'pendiente',   label: 'Pendiente',    color: '#F59E0B', icon: '⏳' },
    { id: 'confirmado',  label: 'Confirmado',   color: '#3B82F6', icon: '✅' },
    { id: 'preparando',  label: 'Preparando',   color: '#8B5CF6', icon: '📦' },
    { id: 'enviado',     label: 'Enviado',       color: '#10B981', icon: '🚚' },
    { id: 'entregado',   label: 'Entregado',     color: '#059669', icon: '🎉' },
    { id: 'cancelado',   label: 'Cancelado',     color: '#EF4444', icon: '❌' },
  ],

  // Por dónde llegó la venta (los pedidos de la web llegan solos con 'web-whatsapp')
  origenesVenta: [
    { id: 'whatsapp',     label: 'WhatsApp',          icon: '💬' },
    { id: 'instagram',    label: 'Instagram',         icon: '📸' },
    { id: 'local',        label: 'En persona',        icon: '🏬' },
    { id: 'web-whatsapp', label: 'Web',               icon: '🌐' },
    { id: 'admin',        label: 'Otro',              icon: '📝' },
  ],

  // Medios de pago
  mediosPago: [
    'Mercado Pago',
    'Transferencia bancaria',
    'Efectivo',
    ' Débito',
    'Crédito',
    'Otro',
  ],

  // Métodos de envío
  metodosEnvio: [
    'Retiro en local',
    'Envío gratis Puerto Iguazú',
    'Neo Encomienda',
    'Correo Argentino',
    'Flecha Cargo',
    'Vía Cargo',
    'Otro',
  ],
};
