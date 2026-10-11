# Uso: pip install playwright && playwright install chromium
#      python -m http.server 8765   (en la carpeta del proyecto)
#      python tests/e2e_admin_tienda.py
"""
Prueba de punta a punta: ADMIN -> planilla (Apps Script simulado) -> TIENDA.
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
PUBLIC_CFG = ['promos', 'clubPrince_boxes', 'contenido', 'categorias', 'envios', 'whatsapp', 'instagram', 'nombre', 'margen', 'dolarManual']
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
            "Destacado": bool(p.get("destacado")), "DescripcionCorta": p.get("descripcionCorta", ""), "StockMin": p.get("stockMin", 5)})
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

with sync_playwright() as p:
    b = p.chromium.launch()

    # ======================= ADMIN (dueña) =======================
    actx, ad = nuevo(b, token=True)
    ad.goto(BASE + "/admin.html"); ad.wait_for_timeout(2500)
    check("admin: se conecta a la planilla", "Sincronizado" in (ad.text_content("#admin-sync-badge") or ""), ad.text_content("#admin-sync-badge"))

    # --- Producto nuevo ---
    ad.evaluate("AdminApp.navigate('products')"); ad.click("text=+ Nuevo Producto"); ad.wait_for_timeout(200)
    ad.fill("#pf-nombre", "Top Prueba QA"); ad.select_option("#pf-categoria", "conjuntos")
    ad.click(".form-tab[data-tab=precios]"); ad.fill("#pf-preciousd", "30"); ad.fill("#pf-stock", "7")
    ad.click(".form-tab[data-tab=imagenes]"); ad.fill("#pf-imagen", "assets/conjunto-flores-rosa.jpg")
    ad.click("#product-form button[type=submit], #product-modal .modal-footer .btn-primary"); ad.wait_for_timeout(600)
    prod = next((r for r in DB["Productos"] if r["Nombre"] == "Top Prueba QA"), None)
    check("producto nuevo llega a la planilla", prod is not None and prod["Stock"] == 7, prod)
    # segundo producto que luego se desactiva y otro que se borra
    ad.evaluate("AdminData.addProduct({nombre:'Oculto QA', categoria:'pijamas', categoriaOriginal:'Pijamas', precioUSD:10, stock:3, activo:true, tags:[], variantes:[], galeria:[], caracteristicas:{}, imagen:'assets/pijama-corazones-negro.jpg'})")
    ad.evaluate("AdminData.addProduct({nombre:'Borrar QA', categoria:'pijamas', categoriaOriginal:'Pijamas', precioUSD:10, stock:3, activo:true, tags:[], variantes:[], galeria:[], caracteristicas:{}, imagen:'assets/pijama-corazones-negro.jpg'})")
    ad.wait_for_timeout(500)
    oid = ad.evaluate("AdminData.getProducts().find(p=>p.nombre==='Oculto QA').id")
    bid = ad.evaluate("AdminData.getProducts().find(p=>p.nombre==='Borrar QA').id")
    ad.evaluate(f"AdminData.updateProduct('{oid}', {{activo:false}})")
    ad.evaluate(f"AdminProducts.delete('{bid}')"); ad.wait_for_timeout(500)
    check("borrar producto lo saca de la planilla", not any(r["Nombre"] == "Borrar QA" for r in DB["Productos"]))

    # --- Página principal ---
    ad.evaluate("AdminApp.navigate('home')"); ad.wait_for_timeout(500)
    ad.evaluate("AdminHome.abrir('promoBar')"); fill(ad, "#he-promoBar-0", "Frase QA en la barra")
    ad.evaluate("AdminHome.abrir('hero')"); fill(ad, "#he-hero-0-title", "Título QA Portada"); fill(ad, "#he-hero-0-cta", "Ver QA")
    ad.select_option("#he-hero-0-categoria", "pijamas")
    fill(ad, "#he-hero-1-image", "ftp://malo")
    ad.click("#home-save-bar .btn-primary"); ad.wait_for_timeout(300)
    check("editor: bloquea link de foto inválido", "contenido" not in DB["Config"] or "Título QA Portada" not in DB["Config"].get("contenido", ""))
    fill(ad, "#he-hero-1-image", "https://images.example.com/foto-qa.jpg")
    ad.evaluate("AdminHome.abrir('showcase')"); fill(ad, "#he-showcase-cards-0-title", "Tarjeta QA")
    ad.evaluate("AdminHome.abrir('productos')"); fill(ad, "#he-productos-kicker", "Kicker QA productos")
    ad.evaluate("AdminHome.abrir('servicios')"); ad.click(".home-sec[data-sec=servicios] .vis-switch")
    ad.evaluate("AdminHome.abrir('cta')"); fill(ad, "#he-cta-title", "¿Dudas QA?")
    ad.evaluate("AdminHome.abrir('footer')"); fill(ad, "#he-footer-direccion", "Calle QA 123, Iguazú")
    check("editor: aparece la barra de guardar", ad.is_visible("#home-save-bar"))
    ad.click("#home-save-bar .btn-primary"); ad.wait_for_timeout(700)
    cont = json.loads(DB["Config"].get("contenido") or "{}")
    check("página: textos publicados en la planilla", cont.get("hero", [{}])[0].get("title") == "Título QA Portada" and cont.get("promoBar", [""])[0] == "Frase QA en la barra", cont.get("hero", [{}])[0])
    check("página: sección oculta publicada", cont.get("secciones", {}).get("servicios") is False)
    ad.wait_for_timeout(1500)
    fr = ad.frame_locator("#home-preview-iframe")
    check("vista previa muestra el cambio", "Título QA Portada" in (fr.locator(".hero__slide").first.text_content() or ""))

    # --- Envíos ---
    ad.evaluate("AdminApp.navigate('shipping')"); ad.wait_for_timeout(300)
    ad.click("text=+ Agregar forma de envío")
    last = "#envios-list .envio-row:last-child"
    ad.fill(f"{last} [data-f=nombre]", "Moto QA"); ad.dispatch_event(f"{last} [data-f=nombre]", "input")
    ad.fill(f"{last} [data-f=precio]", "1500"); ad.dispatch_event(f"{last} [data-f=precio]", "input")
    ad.fill("#envio-umbral", "0")
    ad.click("text=💾 Guardar envíos"); ad.wait_for_timeout(500)
    env = json.loads(DB["Config"].get("envios") or "[]")
    check("envíos publicados", any(e["nombre"] == "Moto QA" and e["precio"] == 1500 for e in env), [e["nombre"] for e in env])

    # --- Categorías ---
    ad.evaluate("AdminApp.navigate('categories')"); ad.wait_for_timeout(300)
    inp = "#cats-tbody input[data-id=pijamas][data-field=nombre]"
    ad.fill(inp, "Pijamas QA"); ad.dispatch_event(inp, "change"); ad.wait_for_timeout(400)
    cats = json.loads(DB["Config"].get("categorias") or "[]")
    check("categoría renombrada publicada", any(c["nombre"] == "Pijamas QA" for c in cats))

    # --- Club Prince ---
    ad.evaluate("AdminApp.navigate('club')"); ad.wait_for_timeout(300)
    ad.fill("#fr-club-box-0-nombre", "Caja QA"); ad.click("#section-club button[type=submit]"); ad.wait_for_timeout(500)
    boxes = json.loads(DB["Config"].get("clubPrince_boxes") or "[]")
    check("Club Prince publicado", boxes and boxes[0]["nombre"] == "Caja QA", boxes[:1])

    # --- Promos: cupón nuevo ---
    ad.evaluate("AdminApp.navigate('promos')"); ad.wait_for_timeout(300)
    ad.evaluate("AdminPromos.add('cupones')")
    n = ad.evaluate("AdminPromos.data.cupones.length") - 1
    sel = f"#promos-root .promos-row[data-kind=cupones][data-idx='{n}'] [data-field=codigo]"
    ad.fill(sel, "QA15"); ad.dispatch_event(sel, "change")
    selv = f"#promos-root .promos-row[data-kind=cupones][data-idx='{n}'] [data-field=valor]"
    ad.fill(selv, "15"); ad.dispatch_event(selv, "change")
    ad.click("[data-action=save]"); ad.wait_for_timeout(500)
    pr = json.loads(DB["Config"].get("promos") or "{}")
    check("cupón publicado", any(c.get("codigo") == "QA15" for c in pr.get("cupones", [])), [c.get("codigo") for c in pr.get("cupones", [])])
    check("umbral de envío gratis 0 se respeta", pr.get("envioGratisUmbralARS") == 0, pr.get("envioGratisUmbralARS"))

    # --- Configuración: WhatsApp ---
    ad.evaluate("AdminApp.navigate('settings')"); ad.wait_for_timeout(300)
    ad.fill("#set-whatsapp", "5493757000111"); ad.fill("#set-instagram", "@princess_qa")
    ad.click("#settings-form button[type=submit]"); ad.wait_for_timeout(500)
    check("WhatsApp publicado", str(DB["Config"].get("whatsapp")) == "5493757000111", DB["Config"].get("whatsapp"))

    # --- Gastos ---
    ad.evaluate("AdminData.addExpense({concepto:'Bolsas QA', monto:5000, categoria:'Packaging'})"); ad.wait_for_timeout(300)
    check("gasto llega a la planilla", any(g["Concepto"] == "Bolsas QA" for g in DB["Gastos"]))
    ad.screenshot(path="/tmp/e2e-admin.png")

    # ======================= TIENDA (clienta, navegador limpio) =======================
    for mobile in (False, True):
        tag = "celu" if mobile else "compu"
        cctx, st = nuevo(b, mobile=mobile)
        st.goto(BASE + "/index.html"); st.wait_for_timeout(2500)
        txt = lambda s: (st.text_content(s) or "").strip()
        names = st.eval_on_selector_all(".product-card__name", "e=>e.map(x=>x.textContent)")
        check(f"tienda {tag}: producto nuevo visible", "Top Prueba QA" in names, names)
        check(f"tienda {tag}: producto inactivo NO visible", "Oculto QA" not in names)
        check(f"tienda {tag}: producto borrado NO visible", "Borrar QA" not in names)
        check(f"tienda {tag}: portada con título nuevo", txt(".hero__slide[data-slide='0'] .hero__title") == "Título QA Portada", txt(".hero__slide[data-slide='0'] .hero__title"))
        check(f"tienda {tag}: botón portada lleva a pijamas", "pijamas" in (st.get_attribute(".hero__slide[data-slide='0'] .hero__cta", "onclick") or ""))
        check(f"tienda {tag}: foto portada 2 cambiada", st.get_attribute(".hero__slide[data-slide='1'] img", "src") == "https://images.example.com/foto-qa.jpg")
        check(f"tienda {tag}: barra de anuncios", txt(".promo-bar__slide") == "Frase QA en la barra", txt(".promo-bar__slide"))
        check(f"tienda {tag}: sección Servicios oculta", not st.is_visible("#servicios"))
        check(f"tienda {tag}: título ¿Tenés dudas?", txt(".cta__title") == "¿Dudas QA?")
        check(f"tienda {tag}: tarjeta de categoría", "Tarjeta QA" in txt(".cat-showcase__grid"))
        check(f"tienda {tag}: encabezado catálogo", txt("#productos-kicker") == "Kicker QA productos")
        check(f"tienda {tag}: dirección en el pie", "Calle QA 123" in txt("#footer-direccion"))
        check(f"tienda {tag}: envíos en el pie", "Moto QA" in txt("#footer-envios"))
        pills = st.eval_on_selector_all(".cat-pill", "e=>e.map(x=>x.textContent.trim())")
        check(f"tienda {tag}: categoría renombrada", st.evaluate("CONFIG.categorias.some(c=>c.nombre==='Pijamas QA')"))
        check(f"tienda {tag}: caja del club", "Caja QA" in txt("#club-boxes"))
        check(f"tienda {tag}: WhatsApp nuevo", "5493757000111" in (st.get_attribute("#contacto-whatsapp-btn", "href") or ""))
        # compra
        st.evaluate("App.quickAdd(SheetsService.productos.find(p=>p.nombre==='Top Prueba QA').id)")
        st.evaluate("App.openCart()"); st.wait_for_timeout(300)
        st.click("#shipping-toggle"); st.wait_for_timeout(200)
        opts = st.eval_on_selector_all("#shipping-result .cart__shipping-option-name", "e=>e.map(x=>x.textContent)")
        check(f"tienda {tag}: envío nuevo en el carrito", "Moto QA" in opts, opts)
        mid = st.evaluate("CONFIG.envios.find(e=>e.nombre==='Moto QA').id")
        st.click(f"#shipping-result [data-shipping='{mid}']"); st.wait_for_timeout(200)
        check(f"tienda {tag}: envío cobra precio (umbral 0 = sin envío gratis)", st.evaluate("CartService.getShippingCost()") == 1500)
        st.click(".cart__promo-toggle"); st.fill("#promo-input", "qa15"); st.click(".cart__promo-btn"); st.wait_for_timeout(200)
        sub = st.evaluate("CartService.getLineasSubtotalARS()")
        check(f"tienda {tag}: cupón nuevo funciona", st.evaluate("CartService.getCouponDiscount()") == round(sub * 0.15))
        if not mobile:
            st.click("#cart-checkout-btn"); st.wait_for_timeout(300)
            st.fill("#checkout-nombre", "Clienta QA"); st.fill("#checkout-telefono", "3757 111222")
            st.fill("#checkout-direccion", "Av QA 1"); st.fill("#checkout-localidad", "Posadas"); st.select_option("#checkout-provincia", "Misiones")
            st.check("#checkout-acepto"); st.click("#btn-wa-pedido"); st.wait_for_timeout(800)
            op = st.evaluate("window.__opened")
            check("tienda: pedido abre WhatsApp al número nuevo", op and "wa.me/5493757000111" in op[0], op[:1])
            check("tienda: pedido registrado en la planilla", any(r["Cliente"] == "Clienta QA" and r["Estado"] == "pendiente" for r in DB["Pedidos"]))
            # club lead
            st.evaluate("App.closeCheckout()")
            st.click("[data-box] button"); st.wait_for_timeout(300); st.click("#club-join-btn"); st.wait_for_timeout(300)
            st.fill("#club-nombre", "Lead QA"); st.fill("#club-telefono", "3757222333"); st.fill("#club-ciudad", "Iguazú")
            st.click("#club-submit-btn"); st.wait_for_timeout(600)
            check("tienda: lead del club guardado en la planilla", any(l["Nombre"] == "Lead QA" for l in DB["ClubPrince_Leads"]))
            check("tienda: newsletter visible con planilla", st.is_visible("#newsletter"))
            st.screenshot(path="/tmp/e2e-store.png", full_page=False)
            check("tienda: sin botón de arrepentimiento", st.locator("a[href*=arrepentimiento]").count() == 0)
        cctx.close()

    # ======================= ADMIN recibe y confirma =======================
    ad.evaluate("AdminSync.sincronizar(true)"); ad.wait_for_timeout(1500)
    ad.evaluate("AdminApp.navigate('orders')"); ad.wait_for_timeout(300)
    check("admin: ve el pedido de la web", "Clienta QA" in (ad.text_content("#orders-list") or ""))
    check("admin: contador de pedidos pendientes", (ad.text_content("#nav-badge-orders") or "").strip() == "1")
    ped = next(r for r in DB["Pedidos"] if r["Cliente"] == "Clienta QA")
    ad.evaluate(f"AdminData.updateOrder('{ped['ID']}', {{estado:'confirmado'}})"); ad.wait_for_timeout(800)
    prod = next(r for r in DB["Productos"] if r["Nombre"] == "Top Prueba QA")
    check("confirmar pedido descuenta stock en la planilla", prod["Stock"] == 6, prod["Stock"])
    check("estado confirmado en la planilla", ped["Estado"] == "confirmado", ped["Estado"])
    ad.evaluate("AdminApp.navigate('club')"); ad.wait_for_timeout(300)
    check("admin: ve el lead del club", "Lead QA" in (ad.text_content("#club-leads-list") or ""))
    ad.screenshot(path="/tmp/e2e-admin-orders.png")

    # tienda recargada ve el stock nuevo
    cctx, st = nuevo(b)
    st.goto(BASE + "/index.html"); st.wait_for_timeout(2500)
    check("tienda: stock actualizado tras confirmar", st.evaluate("SheetsService.productos.find(p=>p.nombre==='Top Prueba QA').stock") == 6)
    cctx.close()

    # ======================= Seguridad: sin token no se puede escribir =======================
    xctx, x = nuevo(b)
    x.goto(BASE + "/index.html"); x.wait_for_timeout(1500)
    r = x.evaluate("SheetsService.postToAppsScript('save_config',{config:{whatsapp:'999'}}).then(r=>r).catch(e=>e.message)")
    check("seguridad: sin token no se puede cambiar la config", str(DB["Config"].get("whatsapp")) == "5493757000111", r)
    xctx.close()

    # ======================= Restaurar página =======================
    ad.evaluate("AdminApp.navigate('home')"); ad.wait_for_timeout(300)
    ad.evaluate("AdminHome.restaurarTodo()"); ad.wait_for_timeout(600)
    cont = json.loads(DB["Config"].get("contenido") or "{}")
    check("restaurar página publica los valores originales", "hero" not in cont, list(cont.keys()))
    b.close()

fails = [c for c in checks if c[0] != "PASS"]
for c in checks: print(*c, sep=" | ")
print(f"\n{len(checks) - len(fails)}/{len(checks)} OK")
print("ERRORS:", errors)
