/* ============================================
   CONFIG - PrincessLov Tienda Online
   Editá estos valores según tu negocio
   ============================================ */

const CONFIG = {
  // ==========================================
  // DATOS DEL NEGOCIO
  // ==========================================
  negocio: {
    nombre: "PrincessLov",
    descripcion: "Sportswear, pijamas y lencería para mujeres",
    tagline: "Tu espacio favorito de girlie vibes 🎀",
    whatsapp: "5493757338837",    // Tu número de WhatsApp con código de país
    // Link corto de WhatsApp del perfil de Instagram (opcional).
    whatsappLink: "https://wa.me/message/KCJUP2SIDI7VD1",
    email: "",                    // Dejar vacío si no hay email de contacto
    instagram: "princesslov_ok",
    facebook: "",                 // Vacío = no se muestra el ícono en el footer
    direccion: "Puerto Iguazú, Misiones, Argentina",
    envios: "Envíos a todo el país",
  },

  // ==========================================
  // GOOGLE SHEETS - BACKEND
  // ==========================================
  // IMPORTANTE: Tu Google Sheet debe tener esta estructura:
  // Columna A: ID (número único)
  // Columna B: Nombre del producto
  // Columna C: Categoría (ej: "Calzas", "Conjuntos", "Pijamas", etc.)
  // Columna D: Subcategoría (ej: "Largas", "Cortas")
  // Columna E: Descripción
  // Columna F: Precio USD
  // Columna G: URL de imagen
  // Columna H: Stock (cantidad)
  // Columna I: Activo (TRUE o FALSE)
  // Columna J: Tags (ej: "nuevo,oferta")
  //
  // Para obtener la URL del CSV publicado:
  // 1. Abrí tu Google Sheet
  // 2. Archivo > Compartir > Publicar en la web
  // 3. Elegí la hoja "Productos" y formato "Valores separados por coma (.csv)"
  // 4. Copiá la URL generada
  sheets: {
    url: "https://docs.google.com/spreadsheets/d/TU_SHEET_ID/pub?output=csv&gid=0",
    // URL del Google Apps Script Web App (para sync bidireccional completa)
    // Obtené esta URL deployando el código de google-apps-script.gs como Web App
       appsScriptUrl: "https://script.google.com/macros/s/AKfycbxqv-rUKV1QWRQdnSP38mwoxj17dqZEjsWWpnAaHPQSzDSIh1udmRBEt7J0Vp8az52V/exec",
    // URL para cotización del dólar (opcional, editá manualmente si no funciona)
    dolarUrl: "https://criptoya.com/api/dolar", 
  },

  // ==========================================
  // COTIZACIÓN DEL DÓLAR
  // ==========================================
  // Si activás autoCotizacion, la web buscará el precio del dólar automáticamente.
  // Si lo dejás en false, usará el valor de cotizacionManual.
  cotizacion: {
    autoCotizacion: true,         // true = busca online, false = usa manual
    cotizacionManual: 1200,       // Valor manual del dólar (solo se usa si autoCotizacion es false)
    margenGanancia: 1.30,         // Markup: 1.30 = 30% de ganancia sobre costo USD
    // Fórmula: Precio ARS = Precio USD * Dólar * margenGanancia
  },

  // ==========================================
  // CIERRE DE PEDIDOS
  // ==========================================
  // Todos los pedidos terminan en WhatsApp (js/checkout.js). El pago
  // (transferencia, efectivo o link de Mercado Pago) se coordina por mensaje.
  // IMPORTANTE: este archivo lo descarga cualquier visitante. Nunca pongas
  // claves, tokens ni contraseñas acá.
  mercadopago: {
    habilitado: false,  // el cobro online con Checkout Pro quedó desactivado
  },

  // ==========================================
  // OPCIONES DE ENVÍO
  // ==========================================
  envios: [
    {
      id: "retiro",
      nombre: "Retiro en local",
      descripcion: "Puerto Iguazú",
      precio: 0,
      activo: true,
    },
    {
      id: "envio_gratis_iguazu",
      nombre: "Envío gratis Puerto Iguazú",
      descripcion: "Sin costo en la zona",
      precio: 0,
      activo: true,
    },
    {
      id: "neo_encomienda",
      nombre: "Neo Encomienda",
      descripcion: "Interior de Misiones",
      precio: 2500,
      activo: true,
    },
    {
      id: "correo_argentino",
      nombre: "Correo Argentino",
      descripcion: "A todo el país",
      precio: 3500,
      activo: true,
    },
    {
      id: "flecha_bootstrap",
      nombre: "Flecha Cargo / Vía Cargo",
      descripcion: "A todo el país",
      precio: 4000,
      activo: true,
    },
  ],

  // ==========================================
  // PROMOCIONES Y CATEGORÍAS CON ICONOS
  // ==========================================
  promos: {
    // Umbral en ARS para envío gratis del carrito (>= este monto = envío sin cargo)
    envioGratisUmbralARS: 150000,

    // ---- MOTOR DE PROMOCIONES (Fase 2) ----
    // Se editan desde el panel admin (⚠️ Promociones). Si no hay overrides,
    // la tienda usa estos defaults. Estructura:
    // cupones:   { id, codigo, tipo: 'percent'|'fijo'|'shipping', valor, usosMax, activo, desc }
    // flashSales:{ id, nombre, descuento (%), desde, hasta (ISO), categorias[] (vacío = todas), activo }
    // combos:    { id, nombre, descripcion, productoIds[], precioUSD, activo }
    // dosPorUno: { id, nombre, categorias[] (vacío = todas), activo }
    // preventas: { id, productoId, precioUSD, fechaLanzamiento (ISO), activo }
    cupones: [
      { id: 'cup-welcome10', codigo: 'WELCOME10', tipo: 'percent', valor: 10, usosMax: 1000, activo: true, desc: '10% de descuento' },
      { id: 'cup-princess20', codigo: 'PRINCESS20', tipo: 'percent', valor: 20, usosMax: 1000, activo: true, desc: '20% de descuento' },
      { id: 'cup-enviogratis', codigo: 'ENVIOGRATIS', tipo: 'shipping', valor: 0, usosMax: 1000, activo: true, desc: 'Envío gratis' },
    ],
    flashSales: [],
    combos: [],
    dosPorUno: [],
    preventas: [],
  },

  categorias: [
    { id: "club-prince",       nombre: "Club Prince",       icon: "👑", grupo: "Club Prince" },
    { id: "calzas-largas",     nombre: "Calzas Largas",     icon: "👖", grupo: "Indumentaria Deportiva" },
    { id: "calzas-cortas",     nombre: "Calzas Cortas",     icon: "🩳", grupo: "Indumentaria Deportiva" },
    { id: "catsuits",          nombre: "Catsuits",          icon: "🐱", grupo: "Indumentaria Deportiva" },
    { id: "conjuntos",         nombre: "Conjuntos",         icon: "👚", grupo: "Indumentaria Deportiva" },
    { id: "remeras",           nombre: "Remeras",           icon: "👕", grupo: "Indumentaria Deportiva" },
    { id: "buzos",             nombre: "Buzos",             icon: "🧥", grupo: "Indumentaria Deportiva" },
    { id: "pijamas",           nombre: "Pijamas",           icon: "🌙", grupo: "Pijamas" },
    { id: "conjuntos-pijama",  nombre: "Conjuntos Pijama",  icon: "🌜", grupo: "Pijamas" },
    { id: "ropa-interior",     nombre: "Ropa Interior",     icon: "🎀", grupo: "Accesorios" },
    { id: "accesorios",        nombre: "Accesorios",        icon: "✨", grupo: "Accesorios" },
    { id: "ofertas",           nombre: "Ofertas",           icon: "🏷️", grupo: "Ofertas" },
    { id: "todos",             nombre: "Todos",             icon: "📦", grupo: "General" },
  ],

  // ==========================================
  // CONTENIDO EDITABLE PÁGINA PRINCIPAL
  // ==========================================
  contenido: {
    promoBar: ["Envíos gratis en Puerto Iguazú", "Nueva colección Primavera", "Precios en pesos argentinos"],
    hero: [
      { kicker: "Nueva colección Primavera", title: "Deportivo & Confort", desc: "Telas técnicas, cortes favorecedores y elegancia en cada detalle.", cta: "Descubrir", image: "assets/conjunto-deportivo-borgona.jpg", categoria: "conjuntos" },
      { kicker: "Encaje & Feminidad", title: "Lencería Floral", desc: "Bralettes y conjuntos de encaje para cada momento.", cta: "Explorar", image: "assets/conjunto-flores-rosa.jpg", categoria: "grupo:lenceria" },
      { kicker: "Descanso con estilo", title: "Pijamas & Suéteres", desc: "Comodidad absoluta con diseños coquetos y dulces.", cta: "Ver pijamas", image: "assets/pijama-corazones-negro.jpg", categoria: "pijamas" },
    ],
    showcase: {
      kicker: "El universo PrincessLov",
      title: "Explorá por categoría",
      cards: [
        { categoria: "conjuntos", title: "Conjuntos", icon: "👚", image: "assets/conjunto-deportivo-borgona.jpg" },
        { categoria: "pijamas", title: "Pijamas", icon: "", image: "assets/pijama-corazones-negro.jpg" },
        { categoria: "grupo:lenceria", title: "Lencería", icon: "", image: "assets/conjunto-flores-rosa.jpg" },
      ],
    },
    servicios: {
      kicker: "Servicios",
      title: "Descubrí los servicios PrincessLov",
      items: [
        { icon: "🚚", title: "Envíos a tu medida", desc: "Envío gratis en Iguazú, Neo Encomienda, Correo Argentino y Flecha/Vía Cargo a todo el país." },
        { icon: "💬", title: "Asesoría por WhatsApp", desc: "Te ayudamos con talles, colores y composición de tus looks favoritos." },
        { icon: "🎁", title: "Embalaje con cariño", desc: "Cada pedido llega preparado con dedicación y cuidado en los detalles." },
        { icon: "🛍️", title: "Compra fácil", desc: "Armás tu pedido en la web y lo confirmamos por WhatsApp: transferencia, efectivo o link de Mercado Pago." },
      ],
    },
    promoBand: { kicker: "Ofertas limitadas", title: "Renová tu guardarropa", desc: "Aprovechá precios especiales en conjuntos, pijamas y lencería seleccionada.", cta: "Ver ofertas", image: "assets/conjunto-flores-rosa.jpg", categoria: "ofertas" },
    cta: { title: "¿Tenés dudas?", desc: "Escribinos por WhatsApp y te asesoramos sobre talles, stock o entregas.", btn: "Chatear ahora", icon: "💬" },
    newsletter: { title: "Recibí novedades PrincessLov", desc: "Sé la primera en enterarte de nuevas colecciones, promociones y lanzamientos exclusivos.", placeholder: "Tu correo electrónico", btn: "Suscribirme" },
    footer: { tagline: "Sportwears, pijamas y lencerías para mujeres que buscan estilo, comodidad y calidad." },
    clubPrince: {
      badge: "✨ Nuevo",
      title: "Forma parte del",
      titleAccent: "Club Prince",
      subtitle: "Infaltables en tu cajón",
      desc: "Recibí cada mes una cajita curada con lencería, accesorios y sorpresas PrincessLov. Elegí tu plan y sumate al club más querido.",
      heroImage: "assets/conjunto-flores-rosa.jpg",
      boxes: [
        { id: "box-esencial", nombre: "Caja Esencial", descripcionCorta: "1 conjunto + sorpresa", detalleCompleto: "1 conjunto a elección (deportivo o lencería)\n1 sorpresa PrincessLov", precioUSD: 25, imagenUrl: "", desc: "1 conjunto + sorpresa", icon: "🎀", destacado: false, tag: "Más elegida" },
        { id: "box-premium", nombre: "Caja Premium", descripcionCorta: "2 conjuntos + accesorio + sorpresa", detalleCompleto: "2 conjuntos a elección\n1 accesorio\n1 sorpresa PrincessLov", precioUSD: 38, imagenUrl: "", desc: "2 conjuntos + accesorio + sorpresa", icon: "👑", destacado: true, tag: "Premium" },
        { id: "box-deluxe", nombre: "Caja Deluxe", descripcionCorta: "3 conjuntos + 2 accesorios + sorpresa VIP", detalleCompleto: "3 conjuntos a elección\n2 accesorios\n1 sorpresa VIP + envío prioritario", precioUSD: 52, imagenUrl: "", desc: "3 conjuntos + 2 accesorios + sorpresa VIP", icon: "💎", destacado: false, tag: "Deluxe" },
      ],
      benefits: ["Envío gratis en todas las cajas", "20% off transferencias", "3 cuotas sin interés"],
      formTitle: "Quiero sumarme al Club",
      formDesc: "Dejanos tus datos y te contactamos para activar tu suscripción.",
    },
  },

  // El mensaje de WhatsApp del pedido se arma en js/cart.js
  // (CartService.generarMensajeWhatsApp): número de pedido, productos,
  // descuentos, envío, total, forma de pago y datos de la clienta.

  // ==========================================
  // IMÁGENES
  // ==========================================
  imagenes: {
    logo: "assets/logo.jpg",
    placeholder: "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='600' height='700'><rect width='600' height='700' fill='%23F8D0DC'/><text x='50%25' y='50%25' text-anchor='middle' dy='.3em' fill='%23800020' font-size='20' font-family='sans-serif'>Sin imagen</text></svg>",
    hero: "",
  },
};

// Exportar para uso global
if (typeof module !== 'undefined' && module.exports) {
  module.exports = CONFIG;
}
