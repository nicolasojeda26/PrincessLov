/* ============================================
   ADMIN IMPORT - Importación Excel/CSV
   Adaptado al formato real del Excel de PrincessLov
   ============================================ */

const AdminImport = {
  pendingData: null,
  workbook: null,

  esc(s) { return escHtml(s); },

  init() {
    const zone = document.getElementById('upload-zone');
    const input = document.getElementById('file-input');
    if (!zone || !input) return;

    zone.addEventListener('click', () => input.click());
    zone.addEventListener('dragover', (e) => { e.preventDefault(); zone.classList.add('dragover'); });
    zone.addEventListener('dragleave', () => zone.classList.remove('dragover'));
    zone.addEventListener('drop', (e) => {
      e.preventDefault();
      zone.classList.remove('dragover');
      if (e.dataTransfer.files[0]) this.handleFile(e.dataTransfer.files[0]);
    });
  },

  // ==========================================
  // DETECCIÓN AUTOMÁTICA DE COLUMNAS
  // ==========================================

  /**
   * Detecta el mapeo de columnas basado en los headers reales del Excel.
   * Soporta múltiples formatos.
   */
  detectColumns(headers) {
    const map = {};
    headers.forEach((h, i) => {
      const raw = (h || '').toString().trim();
      if (!raw) return;

      // Normalizar: minúsculas, sin tildes, espacios por cualquier signo
      const key = raw.toLowerCase()
        .normalize('NFD').replace(/[̀-ͯ]/g, '')
        .replace(/[^a-z0-9]+/g, ' ')
        .trim();
      // (los caracteres especiales de la línea anterior son el rango U+0300–U+036F)

      const has = (...subs) => subs.some(s => key.includes(s));
      const set = (field) => { if (map[field] === undefined) map[field] = i; };

      // Orden de prioridad para evitar colisiones
      const compacto = key.replace(/ /g, '');
      if (key === 'id') set('id');
      else if (has('sku', 'codigo', 'cod ')) set('sku');
      else if (has('galeria')) set('galeria');
      else if (has('variante', 'talle')) set('variantes');
      else if (has('caracteristica', 'especificacion')) set('caracteristicas');
      else if (has('imag', 'foto', 'url')) set('imagen');
      else if (has('tag', 'etiqueta')) set('tags');
      else if (has('destacad')) set('destacado');
      else if (has('activ', 'visible')) set('activo');
      else if (compacto.includes('descripcioncorta')) set('descripcionCorta');
      else if (has('descrip')) set('descripcion');
      else if (has('subcateg', 'subrubro', 'sub rubro')) set('subcategoria');
      else if (has('categ', 'rubro', 'grupo') || (has('tipo') && !has('precio'))) set('categoria');
      else if (has('obs', 'nota', 'coment')) set('observaciones');
      else if (compacto.includes('stockmin')) set('stockMin');
      else if (has('cant', 'stock', 'unidad', 'uds')) set('cantidad');
      else if (has('total', 'subtotal')) set('total');
      else if (has('oferta', 'promo', 'descuento')) set('precioOferta');
      else if (has('margen')) set('margen');
      else if (has('costo') && !has('envio')) set('costoUnitario');
      else if (has('usd', 'dolar', 'u s') || compacto.includes('u$s')) set('precioUSD');
      else if (has('ars', 'pesos', 'manual', 'venta')) set('precioARS');
      else if (has('precio', 'price', 'valor', 'importe')) set('precio'); // moneda a deducir por los montos
      else if (has('producto', 'articulo', 'nombre', 'item', 'name')) set('producto');
    });

    return map;
  },

  /**
   * Parsea el valor de observaciones para extraer el costo extra en USD.
   * Ejemplos: "EL COSTO +0,50USD" → 0.50, "EL COSTO +1USD" → 1.00
   */
  parseObservaciones(obs) {
    if (!obs) return 0;
    const str = String(obs).toUpperCase();
    // Buscar patrón "+XUSD" o "+X USD"
    const match = str.match(/\+\s*(\d+[.,]?\d*)\s*USD/);
    if (match) {
      return parseFloat(match[1].replace(',', '.')) || 0;
    }
    return 0;
  },

  /**
   * Auto-detecta categoría basado en el nombre del producto
   */
  detectCategoria(nombre) {
    const n = (nombre || '').toLowerCase()
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '');

    if (/calza\s*larga/.test(n)) return { cat: 'calzas-largas', catOrig: 'Calzas Largas' };
    if (/calza\s*corta/.test(n)) return { cat: 'calzas-cortas', catOrig: 'Calzas Cortas' };
    if (/calza/.test(n)) return { cat: 'calzas', catOrig: 'Calzas' };
    if (/catsuit/.test(n)) return { cat: 'catsuits', catOrig: 'Catsuits' };
    if (/top\s*deportiv/.test(n) || /top\s*c/.test(n)) return { cat: 'conjuntos', catOrig: 'Conjuntos' };
    if (/conjunto/.test(n)) return { cat: 'conjuntos', catOrig: 'Conjuntos' };
    if (/campera/.test(n)) return { cat: 'buzos', catOrig: 'Buzos' };
    if (/buzo/.test(n)) return { cat: 'buzos', catOrig: 'Buzos' };
    if (/remera/.test(n)) return { cat: 'remeras', catOrig: 'Remeras' };
    if (/pijama/.test(n)) return { cat: 'pijamas', catOrig: 'Pijamas' };
    if (/short|bermuda/.test(n)) return { cat: 'calzas-cortas', catOrig: 'Calzas Cortas' };

    return { cat: 'otros', catOrig: 'Otros' };
  },

  // ==========================================
  // LECTURA DEL ARCHIVO
  // ==========================================

  handleFile(file) {
    if (!file) return;
    const ext = file.name.split('.').pop().toLowerCase();

    if (ext === 'csv') {
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          // Mismo lector que para Excel: respeta comillas, comas y saltos de línea dentro de las celdas.
          // raw:true deja "16.000" como texto (si no, lo convertía en 16).
          this.workbook = XLSX.read(String(e.target.result).replace(/^\uFEFF/, ''), { type: 'string', raw: true });
          this.processSheet(this.workbook.SheetNames[0], file.name);
        } catch (err) {
          AdminApp.toast('No se pudo leer el archivo CSV', 'error');
          console.error(err);
        }
      };
      reader.readAsText(file);
    } else if (ext === 'xlsx' || ext === 'xls') {
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const data = new Uint8Array(e.target.result);
          this.workbook = XLSX.read(data, { type: 'array' });

          // Si hay múltiples hojas, mostrar selector
          if (this.workbook.SheetNames.length > 1) {
            this.showSheetSelector(this.workbook.SheetNames, file.name);
          } else {
            this.processSheet(this.workbook.SheetNames[0], file.name);
          }
        } catch (err) {
          AdminApp.toast('Error al leer el archivo Excel', 'error');
          console.error(err);
        }
      };
      reader.readAsArrayBuffer(file);
    } else {
      AdminApp.toast('Formato no soportado. Usá .xlsx, .xls o .csv', 'error');
    }
  },

  showSheetSelector(sheetNames, filename) {
    const preview = document.getElementById('import-preview-section');
    const head = document.getElementById('import-preview-head');
    const body = document.getElementById('import-preview-body');
    const stats = document.getElementById('import-stats');

    head.innerHTML = '';
    stats.innerHTML = `<span style="font-size:0.85rem; color:var(--texto-secundario);">El archivo tiene ${sheetNames.length} hojas. Seleccioná cuál importar:</span>`;

    body.innerHTML = sheetNames.map((name, idx) => `
      <tr style="cursor:pointer;" data-sheet-idx="${idx}" data-filename="${this.esc(filename)}">
        <td style="font-weight:600; font-size:1rem; padding:1rem;">📄 ${this.esc(name)}</td>
      </tr>
    `).join('');

    // Bind click handlers safely
    body.querySelectorAll('tr[data-sheet-idx]').forEach(tr => {
      tr.addEventListener('click', () => {
        const idx = parseInt(tr.getAttribute('data-sheet-idx'));
        this.processSheet(sheetNames[idx], filename);
      });
    });

    preview.style.display = 'block';
    preview.scrollIntoView({ behavior: 'smooth' });
  },

  processSheet(sheetName, filename) {
    if (!this.workbook) return;

    const sheet = this.workbook.Sheets[sheetName];
    if (!sheet) {
      AdminApp.toast('No se pudo leer la hoja: ' + sheetName, 'error');
      return;
    }

    // Leer como array para preservar el orden de columnas
    const rawData = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });

    if (rawData.length < 2) {
      AdminApp.toast('La hoja está vacía o no tiene datos', 'error');
      return;
    }

    // Buscar la fila de headers (buscar palabras clave en las primeras 5 filas)
    let headerRow = 0;
    for (let i = 0; i < Math.min(5, rawData.length); i++) {
      const rowStr = rawData[i].join(' ').toLowerCase();
      if (/producto|nombre|articulo|item|sku|categoria/.test(rowStr)) {
        headerRow = i;
        break;
      }
    }

    const headers = rawData[headerRow];
    const colMap = this.detectColumns(headers);

    if (colMap.producto === undefined) {
      AdminApp.toast('No se detectó la columna de productos. Verificá que la primera fila tenga un encabezado como "Producto", "Nombre" o "Artículo".', 'error');
      return;
    }

    // ¿La columna "Precio" (sin moneda) está en pesos o en dólares? Nadie vende lencería a
    // más de USD 300: si los montos son grandes, son pesos. (Antes 16.000 pesos entraban
    // como USD 16.000 y el producto quedaba en $ 32 millones.)
    const filas = rawData.slice(headerRow + 1);
    let precioGenericoEsARS = false;
    if (colMap.precio !== undefined) {
      const montos = filas.map(r => this.parseNumber(r?.[colMap.precio])).filter(n => n > 0).sort((x, y) => x - y);
      precioGenericoEsARS = montos.length > 0 && montos[Math.floor(montos.length / 2)] >= 300;
    }

    const existentes = AdminData.getProducts();
    const porId = new Map(existentes.map(p => [String(p.id), p]));
    // El apóstrofo inicial es la protección anti-fórmulas del CSV exportado ('-Tela…): se quita al leer
    const txt = (row, k) => colMap[k] !== undefined ? String(row[colMap[k]] ?? '').trim().replace(/^'(?=[=+\-@])/, '') : '';
    const tiene = (k) => colMap[k] !== undefined;
    const bool = (v) => /^(true|si|sí|1|verdadero|x|activo)$/i.test(String(v).trim());

    // Procesar filas de datos
    const products = [];
    const idsUsados = new Set();
    for (const row of filas) {
      if (!row || row.length === 0) continue;

      const nombre = txt(row, 'producto');
      if (!nombre || /^[\s\-*$]+$/.test(nombre)) continue;

      // --- A qué producto corresponde: por ID, o por nombre idéntico si es único ---
      const idExcel = txt(row, 'id');
      const slug = this.slugify(nombre);
      const mismosNombres = existentes.filter(p => this.slugify(p.nombre) === slug);
      let previo = (idExcel && porId.get(idExcel)) || porId.get(slug) || (!idExcel && mismosNombres.length === 1 ? mismosNombres[0] : null);
      let id = previo ? String(previo.id) : (idExcel || slug || AdminData.generateId());
      if (idsUsados.has(id)) { id = AdminData.generateId(); previo = null; } // dos filas con el mismo nombre: son productos distintos
      idsUsados.add(id);

      // Solo se cargan los datos que el archivo trae: al actualizar un producto
      // existente NO se pisan la foto, la descripción ni los talles que ya tenía.
      const item = { id, nombre, excelSheet: sheetName };

      // --- Categoría (se busca entre las categorías de la tienda) ---
      const categoriaExcel = txt(row, 'categoria');
      if (categoriaExcel || !previo) {
        let catId = '', catNombre = '';
        if (categoriaExcel) {
          catId = SheetsService.resolverCategoria(categoriaExcel);
          const conf = AdminData.getEffectiveCategorias().find(c => c.id === catId);
          catNombre = conf ? conf.nombre : categoriaExcel;
        } else {
          const det = this.detectCategoria(nombre);
          const conf = AdminData.getEffectiveCategorias().find(c => c.id === det.cat);
          catId = conf ? conf.id : SheetsService.resolverCategoria(det.catOrig);
          catNombre = conf ? conf.nombre : det.catOrig;
        }
        item.categoria = catId;
        item.categoriaOriginal = catNombre;
      }
      if (tiene('subcategoria')) item.subcategoria = txt(row, 'subcategoria');
      if (tiene('sku')) item.sku = txt(row, 'sku');

      // --- Precios ---
      const obs = txt(row, 'observaciones');
      const costoUnit = tiene('costoUnitario') ? this.parseNumber(row[colMap.costoUnitario]) : 0;
      let precioUSD = tiene('precioUSD') ? this.parseNumber(row[colMap.precioUSD]) : 0;
      let precioARS = tiene('precioARS') ? this.parseNumber(row[colMap.precioARS]) : 0;
      if (tiene('precio')) {
        const n = this.parseNumber(row[colMap.precio]);
        if (precioGenericoEsARS) precioARS = precioARS || n; else precioUSD = precioUSD || n;
      }
      precioUSD += this.parseObservaciones(obs);
      if (!precioUSD && !precioARS && costoUnit > 0 && AdminApp.dolarRate > 0) {
        precioUSD = costoUnit / AdminApp.dolarRate; // costo en pesos → USD para calcular con margen
      }
      if (tiene('precioUSD') || tiene('precio') || precioUSD || !previo) item.precioUSD = Math.round(precioUSD * 100) / 100;
      if (tiene('precioARS') || (tiene('precio') && precioGenericoEsARS)) item.precioARSManual = precioARS > 0 ? Math.round(precioARS) : null;
      if (tiene('precioOferta')) { const o = this.parseNumber(row[colMap.precioOferta]); item.precioOferta = o > 0 ? Math.round(o) : null; }
      if (tiene('margen')) { const m = this.parseNumber(row[colMap.margen]); item.margenPersonalizado = m > 0 ? (m > 5 ? m / 100 : m) : null; }
      if (costoUnit) item.costoUnitarioARS = costoUnit;

      // --- Textos y fotos ---
      if (tiene('descripcion') || (obs && !previo)) item.descripcion = txt(row, 'descripcion') || (previo ? previo.descripcion || '' : obs);
      if (tiene('descripcionCorta')) item.descripcionCorta = txt(row, 'descripcionCorta');
      if (obs) item.observaciones = obs;
      const normImg = (u) => (typeof AdminImages !== 'undefined' ? AdminImages.normalizarUrl(u) : u);
      const imagen = normImg(txt(row, 'imagen'));
      if (imagen && /^(https:\/\/|assets\/)/.test(imagen)) item.imagen = imagen;
      else if (!previo) item.imagen = '';
      if (tiene('galeria') && txt(row, 'galeria')) {
        item.galeria = txt(row, 'galeria').split('|').map(u => normImg(u.trim())).filter(u => /^(https:\/\/|assets\/)/.test(u)).map(url => ({ url }));
      }
      if (tiene('caracteristicas') && txt(row, 'caracteristicas')) {
        item.caracteristicas = Object.fromEntries(txt(row, 'caracteristicas').split('|').map(par => {
          const i = par.indexOf(':'); return i > 0 ? [par.slice(0, i).trim(), par.slice(i + 1).trim()] : null;
        }).filter(Boolean));
      }
      if (tiene('tags')) item.tags = txt(row, 'tags').split(',').map(t => t.trim().toLowerCase()).filter(Boolean);

      // --- Talles / colores: "Negro(#000000)/M:2 | /S:1" o simplemente "S:1, M:2" ---
      let variantes = null;
      if (tiene('variantes') && txt(row, 'variantes')) {
        variantes = txt(row, 'variantes').split(/[|;,]/).map(v => v.trim()).filter(Boolean).map(v => {
          const m = v.match(/^(.*?)(?:\((#[0-9a-fA-F]{3,8})?\))?\s*(?:\/\s*(.*?))?\s*(?::\s*(\d+))?$/);
          if (!m) return null;
          let color = (m[1] || '').trim(), talle = (m[3] || '').trim();
          if (m[3] === undefined && !m[2]) { talle = color; color = ''; } // "M:2" → solo talle
          return (color || talle) ? { color, colorHex: color ? (m[2] || '#800020') : '', talle, stock: Number(m[4]) || 0 } : null;
        }).filter(Boolean);
        if (variantes.length) item.variantes = variantes;
      }

      // --- Stock ---
      const varsFinales = item.variantes || (previo && Array.isArray(previo.variantes) && previo.variantes.length ? previo.variantes : null);
      if (item.variantes) item.stock = item.variantes.reduce((t, v) => t + v.stock, 0);
      else if (tiene('cantidad') && !varsFinales) item.stock = Math.max(0, parseInt(this.parseNumber(row[colMap.cantidad])) || 0);
      else if (!previo) item.stock = 0;
      if (tiene('stockMin')) item.stockMin = parseInt(row[colMap.stockMin]) || 5;

      // --- Visibilidad ---
      if (tiene('activo') && txt(row, 'activo') !== '') item.activo = bool(txt(row, 'activo'));
      else if (!previo) item.activo = true;
      if (tiene('destacado') && txt(row, 'destacado') !== '') item.destacado = bool(txt(row, 'destacado'));

      if (!previo) {
        item.galeria = item.galeria || [];
        item.variantes = item.variantes || [];
        item.caracteristicas = item.caracteristicas || {};
        item.tags = item.tags || [];
      }
      item._previo = previo ? { nombre: previo.nombre } : null; // solo para la vista previa
      products.push(item);
    }

    this.precioGenericoEsARS = precioGenericoEsARS;
    this.showPreview(products, filename + (this.workbook.SheetNames.length > 1 ? ' → ' + sheetName : ''));
  },

  parseNumber(val) {
    if (typeof val === 'number') return val;
    if (!val) return 0;
    let str = String(val).trim();
    // Quitar símbolo de moneda y espacios
    str = str.replace(/[$\s]/g, '');
    // Reemplazar coma por punto (formato argentino)
    str = str.replace(/\.(?=\d{3})/g, ''); // quitar separador de miles
    str = str.replace(',', '.');
    return parseFloat(str) || 0;
  },

  slugify(text) {
    return (text || '')
      .toLowerCase()
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .substring(0, 60);
  },

  // ==========================================
  // VISTA PREVIA
  // ==========================================

  showPreview(data, filename) {
    if (!data || data.length === 0) {
      AdminApp.toast('No se encontraron productos válidos en el archivo', 'error');
      return;
    }

    this.pendingData = data;

    const section = document.getElementById('import-preview-section');
    const head = document.getElementById('import-preview-head');
    const body = document.getElementById('import-preview-body');
    const stats = document.getElementById('import-stats');

    const existing = AdminData.getProducts();
    const existingIds = new Set(existing.map(p => p.id));
    let newCount = 0, updateCount = 0;
    data.forEach(p => {
      if (existingIds.has(p.id)) updateCount++;
      else newCount++;
    });

    stats.innerHTML = `
      <span class="badge badge-active">${newCount} nuevos</span>
      <span class="badge" style="background:#F59E0B;color:white;">${updateCount} a actualizar</span>
      <span style="font-size:0.85rem; color:var(--texto-secundario);">${data.length} productos en "${escHtml(filename)}"</span>
      ${this.precioGenericoEsARS ? '<span style="font-size:0.85rem; color:var(--texto-secundario);">· La columna de precio se tomó como <strong>pesos</strong></span>' : ''}
      ${data.some(p => !existingIds.has(p.id) && !p.imagen) ? '<span style="font-size:0.85rem; color:#b45309;">· Los productos nuevos sin foto se ven con un recuadro vacío: cargales la foto después de importar</span>' : ''}
    `;

    head.innerHTML = `
      <tr>
        <th>Producto</th>
        <th>Categoría</th>
        <th>Precio en la tienda</th>
        <th>Stock</th>
        <th>Foto</th>
        <th>Qué pasa</th>
      </tr>
    `;

    const porId = new Map(existing.map(p => [p.id, p]));
    body.innerHTML = data.slice(0, 100).map(p => {
      const final = { ...(porId.get(p.id) || {}), ...p };
      const precio = AdminData.precioVentaARS(final);
      const esNuevo = !porId.has(p.id);
      return `
      <tr>
        <td><strong>${escHtml(p.nombre)}</strong></td>
        <td>${escHtml(final.categoriaOriginal || final.categoria || '-')}</td>
        <td>${precio > 0 ? AdminData.formatARS(precio) : '<span style="color:#b91c1c;">Sin precio</span>'}${Number(final.precioUSD) > 0 && !final.precioARSManual ? ` <small style="color:var(--texto-secundario);">(${AdminData.formatUSD(final.precioUSD)})</small>` : ''}</td>
        <td>${Number(final.stock) || 0}${(final.variantes || []).length ? ` <small style="color:var(--texto-secundario);">(${final.variantes.length} talles/colores)</small>` : ''}</td>
        <td>${final.imagen ? '✓' : '<span style="color:#b45309;">Sin foto</span>'}</td>
        <td><span class="badge ${esNuevo ? 'badge-active' : ''}" ${esNuevo ? '' : 'style="background:#F59E0B;color:white;"'}>${esNuevo ? 'Nuevo' : 'Se actualiza'}</span></td>
      </tr>
    `;
    }).join('');

    if (data.length > 100) {
      body.innerHTML += `<tr><td colspan="6" style="text-align:center; color:var(--texto-secundario); padding:1rem;">... y ${data.length - 100} productos más</td></tr>`;
    }

    section.style.display = 'block';
    section.scrollIntoView({ behavior: 'smooth' });
  },

  // ==========================================
  // CONFIRMAR / CANCELAR IMPORTACIÓN
  // ==========================================

  confirmImport() {
    if (!this.pendingData) return;

    this.pendingData.forEach(p => { delete p._previo; });
    const result = AdminData.importProducts(this.pendingData);
    AdminApp.toast(`Importación completa: ${result.added} nuevos, ${result.updated} actualizados, ${result.total} total`);

    this.pendingData = null;
    this.workbook = null;
    document.getElementById('import-preview-section').style.display = 'none';
    document.getElementById('file-input').value = '';
  },

  cancelImport() {
    this.pendingData = null;
    this.workbook = null;
    document.getElementById('import-preview-section').style.display = 'none';
    document.getElementById('file-input').value = '';
  },

  // ==========================================
  // EXPORTAR
  // ==========================================

  exportProductsCSV() {
    AdminProducts.exportCSV();
  },

  exportProductsXLSX() {
    const products = AdminData.getProducts();
    if (products.length === 0) {
      AdminApp.toast('No hay productos para exportar', 'error');
      return;
    }

    // Mismas columnas que el CSV: el archivo se puede editar y volver a importar sin perder datos
    const data = products.map(p => ({
      ID: p.id,
      Nombre: p.nombre,
      Categoria: p.categoriaOriginal || p.categoria,
      Subcategoria: p.subcategoria || '',
      SKU: p.sku || '',
      Descripcion: p.descripcion || '',
      PrecioUSD: Number(p.precioUSD) || 0,
      PrecioARSManual: p.precioARSManual || '',
      PrecioOferta: p.precioOferta || '',
      Stock: Number(p.stock) || 0,
      Variantes: (p.variantes || []).map(v => `${v.color || ''}${v.color ? `(${v.colorHex || ''})` : ''}/${v.talle || ''}:${Number(v.stock) || 0}`).join(' | '),
      Imagen: p.imagen || '',
      Galeria: (p.galeria || []).map(g => g.url).join(' | '),
      Tags: (p.tags || []).join(', '),
      Activo: p.activo ? 'TRUE' : 'FALSE',
      Destacado: p.destacado ? 'TRUE' : 'FALSE',
    }));

    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Productos');
    XLSX.writeFile(wb, 'productos_princesslov.xlsx');
    AdminApp.toast('Excel exportado');
  },
};

document.addEventListener('DOMContentLoaded', () => AdminImport.init());
