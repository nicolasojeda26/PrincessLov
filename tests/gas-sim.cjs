// Corre google-apps-script.gs real contra una planilla en memoria
const http = require('http'), fs = require('fs'), vm = require('vm');
const [,, gsPath, port] = process.argv;
const sheets = {};
function mkSheet(name) {
  const rows = []; // array of arrays (1-based rows => rows[r-1])
  const S = {
    _rows: rows, getName: () => name,
    getLastRow: () => rows.length,
    getLastColumn: () => rows.reduce((m, r) => Math.max(m, r.length), 0),
    getRange(r, c, nr = 1, nc = 1) {
      return {
        getValues() { const out = []; for (let i = 0; i < nr; i++) { const row = rows[r - 1 + i] || []; const o = []; for (let j = 0; j < nc; j++) o.push(row[c - 1 + j] === undefined ? '' : row[c - 1 + j]); out.push(o); } return out; },
        getValue() { return this.getValues()[0][0]; },
        setValues(v) { for (let i = 0; i < v.length; i++) { while (rows.length < r + i) rows.push([]); for (let j = 0; j < v[i].length; j++) rows[r - 1 + i][c - 1 + j] = v[i][j]; } return this; },
        setValue(x) { return this.setValues([[x]]); },
        setNumberFormat() { return this; },
      };
    },
    appendRow(arr) { rows.push(arr.slice()); },
    deleteRow(r) { rows.splice(r - 1, 1); },
    insertRowAfter() {}, setFrozenRows() {},
  };
  return S;
}
const ss = { getSheetByName: n => sheets[n] || null, insertSheet: n => (sheets[n] = mkSheet(n)), getSheets: () => Object.values(sheets) };
const props = { ADMIN_TOKEN: 'token-de-prueba-1234567890', SPREADSHEET_ID: 'x' };
const cache = {};
const ctx = {
  console, JSON, Date, Math, String, Number, Object, Array, Error, RegExp, isNaN, parseInt, parseFloat,
  SpreadsheetApp: { openById: () => ss, getActiveSpreadsheet: () => ss },
  PropertiesService: { getScriptProperties: () => ({ getProperty: k => props[k] || null, setProperty: (k, v) => { props[k] = v; } }) },
  LockService: { getScriptLock: () => ({ waitLock() {}, tryLock: () => true, releaseLock() {} }) },
  CacheService: { getScriptCache: () => ({ get: k => cache[k], put: (k, v) => { cache[k] = v; } }) },
  ContentService: { MimeType: { JSON: 'json' }, createTextOutput: t => ({ t, setMimeType() { return this; } }) },
  Utilities: { formatDate: () => '261103' },
  Logger: { log() {} },
};
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(gsPath, 'utf8'), ctx);
// estado inicial: 4 productos
const P = (id, nombre) => ({ id, nombre, categoria: 'calzas', precioUSD: 10, stock: 3, activo: true, variantes: [] });
['p1:Calza Vic', 'p2:Top Luna', 'p3:Short Sol', 'p4:Pack Vedetina'].forEach(x => { const [id, n] = x.split(':'); ctx.upsertProduct(P(id, n)); });
let falla = 0, demora = 0;
http.createServer((req, res) => {
  let body = ''; req.on('data', d => body += d); req.on('end', () => {
    const u = new URL(req.url, 'http://x');
    if (u.pathname === '/__ctl') {
      const q = JSON.parse(body || '{}');
      if ('falla' in q) falla = q.falla; if ('demora' in q) demora = q.demora;
      res.end(JSON.stringify({ productos: (sheets.Productos._rows.slice(1)).map(r => String(r[0])), borrados: sheets.Borrados ? sheets.Borrados._rows.slice(1).map(r => r[0] + '@' + r[1]) : [], gastos: sheets.Gastos ? sheets.Gastos._rows.slice(1).map(r => String(r[0])) : [] }));
      return;
    }
    let data = {}; try { data = JSON.parse(body || '{}'); } catch {}
    if (req.method === 'POST' && falla > 0 && /^delete_/.test(data.action)) { falla--; res.statusCode = 500; return res.end('boom'); }
    // se ejecuta ya (la lectura refleja este momento) y la respuesta puede llegar tarde
    const out = req.method === 'POST' ? ctx.doPost({ postData: { contents: body } }) : ctx.doGet({ parameter: Object.fromEntries(u.searchParams) });
    const responder = () => { res.setHeader('content-type', 'application/json'); res.end(out.t); };
    const d = (req.method === 'POST' && data.action === 'admin_read' && data.sheet === 'productos') ? demora : 0;
    d ? setTimeout(responder, d) : responder();
  });
}).listen(Number(port), () => console.log('gas-sim on', port));
