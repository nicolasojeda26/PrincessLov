/* ============================================================
   Colores — nombres y tonos de colores de prendas
   ------------------------------------------------------------
   Lo usan el admin y la tienda:
   - Si eligen el color en el cuadradito y no escriben el nombre,
     se le pone el nombre más parecido (antes se perdía el color).
   - Si escriben "Negro", "bordo", "rosa viejo"… se pinta el
     cuadradito solo.
   ============================================================ */

const Colores = {
  LISTA: [
    ['Negro', '#111111'], ['Blanco', '#ffffff'], ['Crudo', '#f3ead8'], ['Nude', '#e3bc9a'],
    ['Beige', '#d8c3a5'], ['Camel', '#c19a6b'], ['Marrón', '#6b4226'], ['Chocolate', '#3d1f12'],
    ['Terracota', '#c0623e'], ['Gris', '#8c8c8c'], ['Gris melange', '#b5b5b5'], ['Plateado', '#c0c0c0'],
    ['Dorado', '#c9a227'], ['Rosa', '#f4a6c0'], ['Rosa bebé', '#f8cdda'], ['Rosa viejo', '#c48793'],
    ['Fucsia', '#e0218a'], ['Coral', '#ff7f6a'], ['Rojo', '#d10f1f'], ['Bordó', '#800020'],
    ['Vino', '#5e1224'], ['Lila', '#c8a2c8'], ['Violeta', '#7f3fbf'], ['Celeste', '#87ceeb'],
    ['Azul', '#1f3f8f'], ['Azul francia', '#2f5bd3'], ['Azul eléctrico', '#0033ff'], ['Lavanda', '#d9cdf0'], ['Verde manzana', '#7ccf3a'], ['Azul marino', '#14213d'], ['Turquesa', '#30c5c0'], ['Verde agua', '#98dcc8'],
    ['Verde', '#2e8b57'], ['Verde militar', '#4b5320'], ['Oliva', '#808000'], ['Amarillo', '#f2d22e'],
    ['Mostaza', '#d4a017'], ['Naranja', '#f28c28'], ['Animal print', '#a67b4a'], ['Estampado', '#b85c8a'],
  ],

  normalizar(t) {
    return String(t || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
  },

  esHex(h) { return /^#[0-9a-f]{6}$/i.test(String(h || '')); },

  /** "bordo" → "#800020" · "Negro mate" → "#111111" · desconocido → '' */
  hexDeNombre(nombre) {
    const n = this.normalizar(nombre);
    if (!n) return '';
    const exacto = this.LISTA.find(([c]) => this.normalizar(c) === n);
    if (exacto) return exacto[1];
    // "Negro mate", "rosa pastel": el nombre más largo que aparezca como palabra
    const parcial = this.LISTA
      .filter(([c]) => new RegExp('(^|\\s)' + this.normalizar(c) + '(\\s|$)').test(n))
      .sort((a, b) => b[0].length - a[0].length)[0];
    return parcial ? parcial[1] : '';
  },

  /** "#7f0f22" → "Bordó" (el color de la lista más parecido a la vista) */
  nombreDeHex(hex) {
    if (!this.esHex(hex)) return '';
    const lab = this.aLab(hex);
    let mejor = '', dist = Infinity;
    this.LISTA.forEach(([nombre, h]) => {
      if (nombre === 'Animal print' || nombre === 'Estampado') return;
      const l2 = this.aLab(h);
      const d = (lab[0] - l2[0]) ** 2 + (lab[1] - l2[1]) ** 2 + (lab[2] - l2[2]) ** 2;
      if (d < dist) { dist = d; mejor = nombre; }
    });
    return mejor;
  },

  /** hex → CIELAB (las distancias se parecen a cómo vemos la diferencia entre colores) */
  aLab(hex) {
    const lin = c => { c /= 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
    const [r, g, b] = [1, 3, 5].map(i => lin(parseInt(hex.slice(i, i + 2), 16)));
    const f = t => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
    const x = f((r * 0.4124 + g * 0.3576 + b * 0.1805) / 0.95047);
    const y = f(r * 0.2126 + g * 0.7152 + b * 0.0722);
    const z = f((r * 0.0193 + g * 0.1192 + b * 0.9505) / 1.08883);
    return [116 * y - 16, 500 * (x - y), 200 * (y - z)];
  },

  /** Nombre prolijo para mostrar: "bordo" → "Bordó", "negro" → "Negro" */
  mostrar(nombre) {
    const t = String(nombre || '').trim();
    const n = this.normalizar(t);
    const de = this.LISTA.find(([c]) => this.normalizar(c) === n);
    return de ? de[0] : t.charAt(0).toUpperCase() + t.slice(1);
  },

  /** Tono para dibujar: el guardado, o el que corresponde al nombre */
  hexPara(nombre, hex) {
    return this.esHex(hex) ? hex : (this.hexDeNombre(nombre) || '#cccccc');
  },
};

if (typeof window !== 'undefined') window.Colores = Colores;
if (typeof module !== 'undefined') module.exports = Colores;
