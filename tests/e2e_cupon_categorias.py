# Uso: pip install playwright && playwright install chromium
#      python -m http.server 8765   (en la carpeta del proyecto)
#      python tests/e2e_admin_tienda.py
"""
QA cupón por categorías (pedido de Yanela, 21/11/2026): Pijamas + SexShop.
La tienda se abre en un navegador "limpio" (otra clienta, sin localStorage),
así que todo lo que ve tiene que venir de la planilla.
"""
import json, os, re, time, urllib.parse
from playwright.sync_api import sync_playwright

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
BASE = os.environ.get("BASE_URL", "http://localhost:8765")  # python -m http.server 8765 en la carpeta del proyecto
GAS = "https://script.google.com/macros/s/TESTQA/exec"
TOKEN = "tok-qa-1234567890abcdef"
checks, errors = [], []
def check(name, cond, extra=""):
    checks.append(("PASS" if cond else "FAIL", name, str(extra)[:220]))

# ---------------- Apps Script simulado (mismas reglas que el .gs) ----------------
DB = {"Productos": [], "Pedidos": [], "Gastos": [], "Config": {}, "ClubPrince_Leads": [], "Arrepentimiento": [], "Newsletter": []}
PUBLIC_CFG = ['promos', 'clubPrince_boxes', 'contenido', 'categorias', 'envios', 'whatsapp', 'instagram', 'nombre', 'margen', 'redondeo']
SHEET = {"productos": "Productos", "pedidos": "Pedidos", "gastos": "Gastos", "clubprince": "ClubPrince_Leads", "arrepentimiento": "Arrepentimiento", "config": "Config"}

def upsert(sheet, row):
    rows = DB[sheet]
    for i, r in enumerate(rows):
        if str(r["ID"]) == str(row["ID"]):
            rows[i] = {**r, **row}; return
    rows.append(row)

def gas(route, request):
    url = urllib.parse.urlparse(request.url)
    q = dict(urllib.parse.parse_qsl(url.query))
    if request.method == "GET":
        a = q.get("action", "read")
        if a == "read":
            out = [r for r in DB["Productos"] if r.get("Activo") in (True, "TRUE", "true")]
        elif a == "config":
            out = {k: v for k, v in DB["Config"].items() if k in PUBLIC_CFG}
        elif a == "dolar":
            out = []
        elif a == "check_stock":
            out = {r["ID"]: r["Stock"] for r in DB["Productos"]}
        else:
            out = {"error": "No autorizado"}
        return route.fulfill(status=200, content_type="application/json", body=json.dumps(out))
    data = json.loads(request.post_data or "{}")
    a = data.get("action"); admin = data.get("token") == TOKEN
    public = a in ("create_order", "club_prince_lead", "subscribe_newsletter", "arrepentimiento")
    if not public and not admin:
        return route.fulfill(status=200, content_type="application/json", body=json.dumps({"error": "No autorizado"}))
    res = {"success": True}
    if a == "upsert_product":
        p = data["product"]
        upsert("Productos", {"ID": p["id"], "Nombre": p["nombre"], "Categoria": p.get("categoriaOriginal") or p.get("categoria"),
            "Subcategoria": p.get("subcategoria", ""), "Descripcion": p.get("descripcion", ""), "PrecioUSD": p.get("precioUSD"),
            "Imagen": p.get("imagen", ""), "Stock": p.get("stock", 0), "Activo": p.get("activo") is not False, "Tags": p.get("tags", ""),
            "SKU": p.get("sku", ""), "PrecioARSManual": p.get("precioARSManual") or "", "PrecioOferta": p.get("precioOferta") or "",
            "Galeria": p.get("galeria", "[]"), "Variantes": p.get("variantes", "[]"), "Caracteristicas": p.get("caracteristicas", "{}"),
            "Destacado": bool(p.get("destacado")), "DescripcionCorta": p.get("descripcionCorta", ""), "StockMin": p.get("stockMin", 5),
            "MargenPersonalizado": p.get("margenPersonalizado") or "", "GananciaPct": "" if p.get("gananciaPct") is None else p.get("gananciaPct"),
            "CostoMoneda": "ARS" if p.get("costoMoneda") == "ARS" else "USD", "CostoARS": p.get("costoARS") or ""})
    elif a == "delete_product":
        DB["Productos"] = [r for r in DB["Productos"] if str(r["ID"]) != str(data["id"])]
    elif a == "create_order":
        o = data["order"]
        if not admin and any(r["ID"] == o["id"] for r in DB["Pedidos"]):
            res = {"error": "Pedido duplicado"}
        else:
            upsert("Pedidos", {"ID": o["id"], "Fecha": time.strftime("%Y-%m-%dT%H:%M:%SZ"), "Cliente": o.get("cliente"), "Telefono": o.get("telefono"),
                "Email": o.get("email", ""), "Direccion": o.get("direccion", ""), "Localidad": o.get("localidad", ""), "Provincia": o.get("provincia", ""),
                "Estado": (o.get("estado") or "pendiente") if admin else "pendiente", "MedioPago": o.get("medioPago", ""), "MetodoEnvio": o.get("metodoEnvio", ""),
                "Total": o.get("total", 0), "CostoTotal": o.get("costoTotal", 0), "Notas": o.get("notas", ""), "Items": json.dumps(o.get("items", [])),
                "StockDescontado": "", "Origen": (o.get("origen") or "admin") if admin else "web-whatsapp"})
    elif a == "update_order":
        for r in DB["Pedidos"]:
            if str(r["ID"]) == str(data["id"]): r.update({k: v for k, v in data["updates"].items() if k != "ID"})
    elif a == "delete_order":
        DB["Pedidos"] = [r for r in DB["Pedidos"] if str(r["ID"]) != str(data["id"])]
    elif a == "create_expense":
        e = data["expense"]; upsert("Gastos", {"ID": e["id"], "Fecha": e.get("fecha"), "Concepto": e.get("concepto"), "Monto": e.get("monto"), "Categoria": e.get("categoria"), "Notas": e.get("notas", "")})
    elif a == "delete_expense":
        DB["Gastos"] = [r for r in DB["Gastos"] if str(r["ID"]) != str(data["id"])]
    elif a == "save_config":
        for k, v in data["config"].items():
            DB["Config"][k] = json.dumps(v) if isinstance(v, (dict, list)) else v
    elif a == "admin_read":
        sh = SHEET.get(data.get("sheet"), "Pedidos")
        res = [{"Clave": k, "Valor": v} for k, v in DB["Config"].items()] if sh == "Config" else DB[sh]
    elif a == "club_prince_lead":
        l = data["lead"]; DB["ClubPrince_Leads"].append({"ID": f"club_{len(DB['ClubPrince_Leads'])}", "Fecha": "2026-09-26", "Nombre": l["nombre"], "Telefono": l["telefono"], "Ciudad": l["ciudad"], "Plan": l.get("plan", ""), "Estado": "nuevo"})
    elif a == "arrepentimiento":
        s = data["solicitud"]; DB["Arrepentimiento"].append({"ID": s["codigo"], "Nombre": s["nombre"], "Telefono": s["telefono"], "Productos": s["productos"], "Estado": "nuevo"})
    elif a == "subscribe_newsletter":
        DB["Newsletter"].append({"Email": data["email"]})
    else:
        res = {"error": "Acción no válida: " + str(a)}
    return route.fulfill(status=200, content_type="application/json", body=json.dumps(res))

def config_js(route, request):
    body = open(os.path.join(ROOT, "data", "config.js"), encoding="utf-8").read().replace("https://script.google.com/macros/s/TU_SCRIPT_ID/exec", GAS)
    route.fulfill(status=200, content_type="application/javascript", body=body)

INIT = "window.__opened=[];window.open=function(u){window.__opened.push(String(u));return {opener:null};};window.confirm=()=>true;"

def nuevo(browser, mobile=False, token=False):
    vp = {"width": 390, "height": 844} if mobile else {"width": 1440, "height": 900}
    ctx = browser.new_context(viewport=vp, is_mobile=mobile)
    ctx.route(re.compile(r"https://script\.google\.com/.*"), gas)
    ctx.route("**/data/config.js", config_js)
    ctx.add_init_script(INIT + (f"try{{localStorage.setItem('pl_admin_token','{TOKEN}')}}catch(e){{}}" if token else ""))
    pg = ctx.new_page()
    tag = "celu" if mobile else "compu"
    pg.on("pageerror", lambda e: errors.append(f"[{tag}] {e}"))
    pg.on("console", lambda m: m.type == "error" and "criptoya" not in m.text and errors.append(f"[{tag}] console: {m.text}"))
    return ctx, pg

def fill(pg, sel, val):
    pg.fill(sel, val); pg.dispatch_event(sel, "input")

CATS = [{"id": "pijamas", "nombre": "Pijamas", "grupo": "Pijamas"},
        {"id": "sex-shop", "nombre": "SexShop 🫦", "grupo": "Otros", "alias": ["Sex Shop 🫦"]},
        {"id": "calzas-largas", "nombre": "Calzas largas", "grupo": "Sport"}]
DB["Config"]["categorias"] = json.dumps(CATS)
def prod(i, nombre, cat, precio):
    return {"ID": i, "Nombre": nombre, "Categoria": cat, "PrecioUSD": 0, "PrecioARSManual": precio, "Stock": 10, "Activo": True,
            "Imagen": "assets/pijama-corazones-negro.jpg", "Variantes": "[]", "Galeria": "[]", "Caracteristicas": "{}", "Tags": ""}
DB["Productos"] = [prod("q1", "Pijama QA", "Pijamas", 20000), prod("q2", "Aceite QA", "SexShop 🫦", 10000), prod("q3", "Calza QA", "Calzas largas", 30000)]

with sync_playwright() as p:
    b = p.chromium.launch()
    for mobile in (False, True):
        tag = "celu" if mobile else "compu"
        DB["Config"].pop("promos", None)
        actx, ad = nuevo(b, mobile=mobile, token=True)
        ad.goto(BASE + "/admin.html"); ad.wait_for_timeout(2500)
        ad.evaluate("AdminApp.navigate('promos')"); ad.wait_for_timeout(400)
        ad.evaluate("AdminPromos.add('cupones')")
        n = ad.evaluate("AdminPromos.data.cupones.length") - 1
        row = f"#promos-root .promos-row[data-kind=cupones][data-idx='{n}']"
        ad.fill(f"{row} [data-field=codigo]", "PIJASEX"); ad.dispatch_event(f"{row} [data-field=codigo]", "change")
        ad.fill(f"{row} [data-field=valor]", "20"); ad.dispatch_event(f"{row} [data-field=valor]", "change")
        # Usos máx. vacío (lo que hizo Yanela): antes quedaba en 0 = "expirado"
        ad.fill(f"{row} [data-field=usosMax]", ""); ad.dispatch_event(f"{row} [data-field=usosMax]", "input")
        chips = ad.locator(f"{row} .promo-chip").all_text_contents()
        check(f"admin {tag}: el cupón ofrece elegir categorías", "Pijamas" in chips and any("SexShop" in c for c in chips), chips)
        ad.click(f"{row} .promo-chip[data-val=pijamas]"); ad.click(f"{row} .promo-chip[data-val=sex-shop]")
        ad.click("[data-action=save]"); ad.wait_for_timeout(600)
        pr = json.loads(DB["Config"].get("promos") or "{}")
        c = next((c for c in pr.get("cupones", []) if c.get("codigo") == "PIJASEX"), {})
        check(f"admin {tag}: cupón publicado con las 2 categorías", sorted(c.get("categorias", [])) == ["pijamas", "sex-shop"], c)
        check(f"admin {tag}: usos vacío se guarda sin límite (no 0)", c.get("usosMax") in (None, ""), c.get("usosMax"))
        # usos 0 avisa en vez de guardar un cupón que no anda
        ad.fill(f"{row} [data-field=usosMax]", "0"); ad.dispatch_event(f"{row} [data-field=usosMax]", "input")
        ad.click("[data-action=save]"); ad.wait_for_timeout(300)
        toast = ad.evaluate("Array.from(document.querySelectorAll('.toast, [class*=toast]')).map(t=>t.textContent).join(' | ')")
        check(f"admin {tag}: usos 0 avisa y no publica", "0 usos" in toast and next(x for x in json.loads(DB['Config']['promos'])['cupones'] if x['codigo']=='PIJASEX').get('usosMax') in (None, ''), toast[:200])
        ad.fill(f"{row} [data-field=usosMax]", ""); ad.dispatch_event(f"{row} [data-field=usosMax]", "input")
        ad.click("[data-action=save]"); ad.wait_for_timeout(300)
        actx.close()

        # Tienda: clienta nueva (sin localStorage)
        sctx, st = nuevo(b, mobile=mobile)
        st.goto(BASE + "/index.html"); st.wait_for_timeout(3000)
        st.evaluate("CartService.clear && CartService.clear()")
        st.evaluate("CartService.addItem(SheetsService.obtenerProducto('q3'),1)"); st.wait_for_timeout(100)
        st.evaluate("App.openCart && App.openCart()"); st.wait_for_timeout(400)
        st.click(".cart__promo-toggle"); st.fill("#promo-input", "pijasex"); st.click(".cart__promo-btn"); st.wait_for_timeout(300)
        msg = st.text_content("#promo-message") or ""
        check(f"tienda {tag}: solo calza → avisa que es para Pijamas y SexShop", "solo para Pijamas y SexShop" in msg, msg)
        st.evaluate("CartService.addItem(SheetsService.obtenerProducto('q1'),1); CartService.addItem(SheetsService.obtenerProducto('q2'),2); App.renderCartSidebar()")
        st.fill("#promo-input", "pijasex"); st.click(".cart__promo-btn"); st.wait_for_timeout(300)
        msg = st.text_content("#promo-message") or ""
        desc = st.evaluate("CartService.getCouponDiscount()")
        check(f"tienda {tag}: cupón aplicado", msg.startswith("✓"), msg)
        check(f"tienda {tag}: 20% solo de pijama + 2 aceites (8.000)", desc == 8000, desc)
        check(f"tienda {tag}: total = 70.000 - 8.000", st.evaluate("CartService.getTotalARS()") == 62000, st.evaluate("CartService.getTotalARS()"))
        st.fill("#promo-input", "NOEXISTE"); st.click(".cart__promo-btn"); st.wait_for_timeout(200)
        check(f"tienda {tag}: código inexistente dice 'no existe' (no 'expirado')", "no existe" in (st.text_content("#promo-message") or ""), st.text_content("#promo-message"))
        # Caso Yanela 22/11: la pestaña de la tienda quedó abierta y el cupón se renombró después
        pr = json.loads(DB["Config"]["promos"])
        pr["cupones"] = [{"id": "cup-welcome10", "codigo": "PRINCESSLOV", "tipo": "percent", "valor": 10, "usosMax": 1000, "activo": True, "desc": "10% de descuento"}]
        DB["Config"]["promos"] = json.dumps(pr)
        st.fill("#promo-input", "princesslov"); st.click(".cart__promo-btn"); st.wait_for_timeout(800)
        msg = st.text_content("#promo-message") or ""
        check(f"tienda {tag}: cupón renombrado con la pestaña abierta funciona sin recargar", msg.startswith("✓"), msg)
        st.screenshot(path=f"/tmp/cupon-{tag}.png")
        sctx.close()
    b.close()

fails = [c for c in checks if c[0] != "PASS"]
for c in checks: print(*c, sep=" | ")
print(f"\n{len(checks) - len(fails)}/{len(checks)} OK")
print("ERRORS:", errors)
