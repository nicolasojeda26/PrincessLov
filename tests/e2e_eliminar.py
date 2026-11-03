# Eliminar productos/pedidos/gastos con DOS admins abiertos (compu y celu).
# Corre el google-apps-script.gs real contra una planilla en memoria (tests/gas-sim.cjs).
#   python tests/e2e_eliminar.py
import os, sys, json, re, time, subprocess, urllib.request, atexit
from playwright.sync_api import sync_playwright
root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
webport, gasport, label = '8766', '8767', 'eliminar'
_procs = [subprocess.Popen([sys.executable, '-m', 'http.server', webport], cwd=root, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL),
          subprocess.Popen(['node', os.path.join(root, 'tests', 'gas-sim.cjs'), os.path.join(root, 'google-apps-script.gs'), gasport], stdout=subprocess.DEVNULL)]
atexit.register(lambda: [p.terminate() for p in _procs])
time.sleep(1.5)
SIM = f"http://127.0.0.1:{gasport}"
BASE = f"http://127.0.0.1:{webport}"
TOKEN = 'token-de-prueba-1234567890'
results = []; errors = []
def check(n, c, extra=''):
    results.append((n, bool(c))); print(('OK  ' if c else 'FAIL') + f" [{label}] {n} {extra}")
def ctl(**kw):
    r = urllib.request.urlopen(urllib.request.Request(SIM + '/__ctl', data=json.dumps(kw).encode(), method='POST'))
    return json.loads(r.read())
def gas(route, request):
    url = request.url
    q = url.split('?', 1)[1] if '?' in url else ''
    req = urllib.request.Request(SIM + '/exec' + ('?' + q if q else ''), data=(request.post_data or '').encode() if request.method == 'POST' else None, method=request.method)
    try:
        r = urllib.request.urlopen(req, timeout=30); body = r.read(); st = r.status
    except urllib.error.HTTPError as e:
        body = e.read(); st = e.code
    route.fulfill(status=st, content_type='application/json', body=body)
INIT = "window.confirm=()=>true;window.open=()=>({});" + f"try{{localStorage.setItem('pl_admin_token','{TOKEN}')}}catch(e){{}}"
def nuevo(b, tag):
    ctx = b.new_context(viewport={"width": 1280, "height": 900})
    ctx.route(re.compile(r"https://script\.google\.com/.*"), gas)
    ctx.route(re.compile(r".*(criptoya|dolarapi|bluelytics).*"), lambda r, q: r.fulfill(status=200, content_type='application/json', body='{"venta":1200,"blue":{"value_sell":1200}}'))
    ctx.add_init_script(INIT)
    pg = ctx.new_page()
    pg.on("pageerror", lambda e: errors.append(f"[{tag}] {e}"))
    pg.goto(BASE + "/admin.html"); pg.wait_for_function("typeof AdminSync!==\"undefined\" && AdminSync.ultimaSync", timeout=20000)
    return pg
ids = lambda pg: sorted(pg.evaluate("AdminData.getProducts().map(p=>String(p.id))"))
sync = lambda pg: pg.evaluate("AdminSync.sincronizar(false)")
with sync_playwright() as p:
    b = p.chromium.launch()
    compu = nuevo(b, 'compu'); celu = nuevo(b, 'celu')
    check('arranque: ambos ven 4 productos', ids(compu) == ['p1','p2','p3','p4'] and ids(celu) == ['p1','p2','p3','p4'], str(ids(compu)))

    # A) se borra en la compu; el celu (con la copia vieja) sincroniza
    compu.evaluate("AdminProducts.delete('p1')"); compu.wait_for_timeout(1200)
    check('A: la compu borra p1 de la planilla', 'p1' not in ctl()['productos'])
    sync(celu); celu.wait_for_timeout(500)
    check('A: el celu NO vuelve a subir p1', 'p1' not in ctl()['productos'], str(ctl()['productos']))
    check('A: el celu deja de mostrar p1', 'p1' not in ids(celu))

    # B) la baja falla (Apps Script caído/dormido) y se recarga el admin
    ctl(falla=1)
    compu.evaluate("AdminProducts.delete('p2')"); compu.wait_for_timeout(1200)
    compu.reload(); compu.wait_for_function("typeof AdminSync!==\"undefined\" && AdminSync.ultimaSync", timeout=20000); compu.wait_for_timeout(800)
    check('B: tras recargar, p2 no reaparece en el admin', 'p2' not in ids(compu), str(ids(compu)))
    check('B: la baja se reintentó y p2 salió de la planilla', 'p2' not in ctl()['productos'], str(ctl()['productos']))
    ctl(falla=0)

    # C) se borra mientras hay una sincronización en curso (lectura lenta)
    ctl(demora=2500)
    compu.evaluate("window.__s = AdminSync.sincronizar(false)"); compu.wait_for_timeout(300)
    compu.evaluate("AdminProducts.delete('p3')"); compu.wait_for_timeout(3500)
    ctl(demora=0)
    check('C: p3 no reaparece al terminar la sincronización', 'p3' not in ids(compu), str(ids(compu)))
    sync(compu); compu.wait_for_timeout(500)
    check('C: la sincronización siguiente no vuelve a subir p3', 'p3' not in ctl()['productos'], str(ctl()['productos']))

    # D) el celu edita un producto que la compu ya eliminó
    sync(celu); celu.wait_for_timeout(300)
    compu.evaluate("AdminProducts.delete('p4')"); compu.wait_for_timeout(1200)
    celu.evaluate("AdminData.updateProduct('p4', {stock: 7})"); celu.wait_for_timeout(1500)
    check('D: editar desde una copia vieja no revive p4', 'p4' not in ctl()['productos'], str(ctl()['productos']))

    # E) borrar un gasto y sincronizar desde el otro dispositivo
    compu.evaluate("AdminData.addExpense({concepto:'Bolsas', monto:1000, categoria:'Otros'})"); compu.wait_for_timeout(1200)
    sync(celu); celu.wait_for_timeout(300)
    gid = compu.evaluate("AdminData.getExpenses()[0].id")
    compu.evaluate(f"AdminData.deleteExpense('{gid}')"); compu.wait_for_timeout(1200)
    sync(celu); celu.wait_for_timeout(500)
    check('E: un gasto borrado no vuelve desde el otro dispositivo', gid not in ctl()['gastos'])

    # F) productos nuevos siguen funcionando
    compu.evaluate("AdminData.addProduct({nombre:'Nuevo', categoria:'calzas', precioUSD:5, stock:2, activo:true, variantes:[]})"); compu.wait_for_timeout(1200)
    check('F: alta de producto llega a la planilla', len(ctl()['productos']) == 1, str(ctl()['productos']))
    check('sin errores de JS', not errors, str(errors[:3]))
    b.close()
fails = [n for n, c in results if not c]
print(f"[{label}] {len(results)-len(fails)}/{len(results)} OK")
sys.exit(1 if fails else 0)
