# Uso: python -m http.server 8765 (en la carpeta del proyecto) y después
#      python tests/e2e_ventas_costos_combos.py
"""
Pedido de oct/2026 (audios de Yanela):
1. Ventas por WhatsApp en el sistema: registrar venta, botón 🛒, y "¿fue una venta?" al bajar stock a mano.
2. Costo en USD o en pesos + % de ganancia → precio redondeado.
3. Combos con precio en pesos (armados desde el producto).
Usa el mismo Apps Script simulado que e2e_admin_tienda.py.
"""
import json, os, re

SRC = open(os.path.join(os.path.dirname(os.path.abspath(__file__)), "e2e_admin_tienda.py"), encoding="utf-8").read()
exec(SRC.split("with sync_playwright() as p:")[0])  # DB, gas(), nuevo(), check()...
from playwright.sync_api import sync_playwright

SHOTS = os.environ.get("SHOTS", "/tmp")
DOLAR = 1200  # sin internet la tienda y el admin usan la cotización manual

def dolar_fijo(route, request):
    route.fulfill(status=200, content_type="application/json", body=json.dumps({"oficial": {"ask": DOLAR}}))

def variantes(r):
    v = r["Variantes"]
    return v if isinstance(v, list) else json.loads(v or "[]")

def prod_db(nombre):
    return next((r for r in DB["Productos"] if r["Nombre"] == nombre), None)

with sync_playwright() as p:
    b = p.chromium.launch()
    actx, ad = nuevo(b, token=True)
    actx.route(re.compile(r"https://criptoya\.com/.*"), dolar_fijo)
    ad.goto(BASE + "/admin.html"); ad.wait_for_timeout(2500)
    check("admin conectado", "Sincronizado" in (ad.text_content("#admin-sync-badge") or ""))

    # ---------- Configuración: ganancia en % y redondeo ----------
    ad.evaluate("AdminApp.navigate('settings')"); ad.wait_for_timeout(300)
    check("config: ganancia se muestra como 30 (no 1.30)", ad.input_value("#set-margen") == "30", ad.input_value("#set-margen"))
    check("config: redondeo por defecto $500", ad.input_value("#set-redondeo") == "500", ad.input_value("#set-redondeo"))

    # ---------- Producto con costo en USD ----------
    ad.evaluate("AdminApp.navigate('products')"); ad.click("text=+ Nuevo Producto"); ad.wait_for_timeout(200)
    ad.fill("#pf-nombre", "Remera USD QA"); ad.select_option("#pf-categoria", "conjuntos")
    ad.click(".form-tab[data-tab=precios]")
    fill(ad, "#pf-preciousd", "10"); fill(ad, "#pf-ganancia", "30"); ad.fill("#pf-stock", "8")
    calc = ad.text_content("#pf-precio-calculado") or ""
    # 10 × 1200 = 12.000 + 30% = 15.600 → 16.000
    check("USD: precio calculado con redondeo ($16.000)", "16.000" in calc and "15.600" in calc, calc)
    ad.screenshot(path=f"{SHOTS}/qa-precio-usd.png")
    ad.click("#product-modal .modal-footer .btn-primary"); ad.wait_for_timeout(600)
    r = prod_db("Remera USD QA")
    check("USD: planilla guarda costo y ganancia", r and r["PrecioUSD"] == 10 and r["GananciaPct"] == 30 and r["CostoMoneda"] == "USD" and not r["PrecioARSManual"], r and {k: r[k] for k in ("PrecioUSD", "GananciaPct", "CostoMoneda", "PrecioARSManual")})

    # ---------- Producto con costo en pesos y variantes ----------
    ad.click("text=+ Nuevo Producto"); ad.wait_for_timeout(200)
    ad.fill("#pf-nombre", "Remera Pesos QA"); ad.select_option("#pf-categoria", "conjuntos")
    ad.click(".form-tab[data-tab=precios]")
    ad.select_option("#pf-costo-moneda", "ARS")
    fill(ad, "#pf-preciousd", "10.000"); fill(ad, "#pf-ganancia", "25")
    calc = ad.text_content("#pf-precio-calculado") or ""
    check("ARS: 10.000 + 25% = $12.500", "12.500" in calc, calc)
    check("ARS: etiqueta dice pesos", "pesos" in (ad.text_content("#pf-costo-label") or ""))
    ad.click(".form-tab[data-tab=variantes]")
    ad.evaluate("AdminProducts.addVariantRow({color:'Negro', talle:'M', stock:5}); AdminProducts.addVariantRow({color:'Negro', talle:'L', stock:3})")
    ad.click("#product-modal .modal-footer .btn-primary"); ad.wait_for_timeout(600)
    r = prod_db("Remera Pesos QA")
    check("ARS: planilla guarda costo en pesos y precio", r and r["CostoMoneda"] == "ARS" and r["CostoARS"] == 10000 and r["PrecioARSManual"] == 12500 and r["GananciaPct"] == 25, r and {k: r[k] for k in ("CostoMoneda", "CostoARS", "PrecioARSManual", "GananciaPct", "PrecioUSD")})
    pid = ad.evaluate("AdminData.getProducts().find(p=>p.nombre==='Remera Pesos QA').id")
    uid = ad.evaluate("AdminData.getProducts().find(p=>p.nombre==='Remera USD QA').id")

    # Reabrir: el precio calculado no aparece como "a mano"
    ad.evaluate(f"AdminProducts.openForm('{pid}')"); ad.click(".form-tab[data-tab=precios]")
    check("ARS: al reabrir, moneda/costo/ganancia", ad.input_value("#pf-costo-moneda") == "ARS" and ad.input_value("#pf-preciousd") == "10.000" and ad.input_value("#pf-ganancia") == "25", [ad.input_value("#pf-costo-moneda"), ad.input_value("#pf-preciousd"), ad.input_value("#pf-ganancia")])
    check("ARS: precio a mano queda vacío", ad.input_value("#pf-precio-ars-manual") == "")
    ad.evaluate("AdminProducts.closeForm()")

    # Tercer producto sin ganancia propia (usa la general 30%): 8.000 → 10.400 → 10.500
    ad.click("text=+ Nuevo Producto"); ad.wait_for_timeout(200)
    ad.fill("#pf-nombre", "Top General QA"); ad.select_option("#pf-categoria", "conjuntos")
    ad.click(".form-tab[data-tab=precios]"); ad.select_option("#pf-costo-moneda", "ARS"); fill(ad, "#pf-preciousd", "8000"); ad.fill("#pf-stock", "4")
    ad.click("#product-modal .modal-footer .btn-primary"); ad.wait_for_timeout(600)
    r = prod_db("Top General QA")
    check("ARS sin %: usa 30% general y redondea ($10.500)", r and r["PrecioARSManual"] == 10500 and r["GananciaPct"] == 30, r and {k: r[k] for k in ("PrecioARSManual", "GananciaPct")})
    tid = ad.evaluate("AdminData.getProducts().find(p=>p.nombre==='Top General QA').id")

    # Tabla
    fila = ad.text_content(f"#products-tbody tr:has-text('Remera Pesos QA')") or ""
    check("tabla: muestra costo en pesos y precio", "$ 10.000" in fila.replace("\xa0", " ") and "12.500" in fila, fila[:200])
    ad.screenshot(path=f"{SHOTS}/qa-tabla-productos.png", full_page=False)

    # ---------- Combo desde el producto ----------
    ad.evaluate(f"AdminProducts.openForm('{pid}')"); ad.click(".form-tab[data-tab=precios]")
    ad.click("#pf-combo-nuevo")
    ad.select_option("#pf-combo-otros .combo-otro__sel", tid)
    fill(ad, "#pf-combo-precio", "20.000")
    res = ad.text_content("#pf-combo-resumen") or ""
    check("combo: muestra por separado y ganancia", "23.000" in res and "ahorra" in res and "ganás" in res, res)
    ad.screenshot(path=f"{SHOTS}/qa-combo.png")
    ad.click("text=💾 Guardar combo"); ad.wait_for_timeout(500)
    pr = json.loads(DB["Config"].get("promos") or "{}")
    combo = next((c for c in pr.get("combos", []) if pid in c.get("productoIds", [])), None)
    check("combo publicado en la planilla con precio en pesos", combo and combo["precioARS"] == 20000 and set(combo["productoIds"]) == {pid, tid}, combo)
    check("combo aparece en el producto", "20.000" in (ad.text_content("#pf-combos-list") or ""))
    ad.evaluate("AdminProducts.closeForm()")

    # Promociones: los chips del combo son productos (antes eran categorías)
    ad.evaluate("AdminApp.navigate('promos')"); ad.wait_for_timeout(300)
    chips = ad.eval_on_selector_all(".promos-row[data-kind=combos] .promo-chip.is-on", "e=>e.map(x=>x.textContent)")
    check("promos: el combo muestra sus productos elegidos", sorted(chips) == ["Remera Pesos QA", "Top General QA"], chips)

    # ---------- Venta por WhatsApp: bajar stock a mano ----------
    ad.evaluate("AdminApp.navigate('products')"); ad.wait_for_timeout(200)
    ad.evaluate(f"AdminProducts.openForm('{pid}')"); ad.click(".form-tab[data-tab=variantes]")
    ad.fill("#variantes-container .variant-row:nth-child(1) .variant-stock", "4")
    ad.click("#product-modal .modal-footer .btn-primary"); ad.wait_for_timeout(900)
    ped = next((x for x in DB["Pedidos"] if "bajar el stock" in (x.get("Notas") or "")), None)
    check("bajar stock a mano → se registra la venta", ped is not None and ped.get("Origen") == "whatsapp", ped)
    check("esa venta no vuelve a descontar", variantes(prod_db("Remera Pesos QA"))[0]["stock"] == 4, prod_db("Remera Pesos QA")["Variantes"])
    check("se abre la venta para completarla", ad.is_visible("#order-modal"))
    ad.fill("#of-cliente", "Clienta WhatsApp QA"); ad.select_option("#of-pago", "Transferencia bancaria")
    ad.click("#order-modal .modal-footer .btn-primary"); ad.wait_for_timeout(700)
    ped = next((x for x in DB["Pedidos"] if x.get("Cliente") == "Clienta WhatsApp QA"), None)
    check("venta completada: total y costo", ped and ped["Total"] == 12500 and ped["CostoTotal"] == 10000 and ped["StockDescontado"] == "si", ped and {k: ped[k] for k in ("Total", "CostoTotal", "StockDescontado", "Estado")})
    check("completar la venta no toca el stock", variantes(prod_db("Remera Pesos QA"))[0]["stock"] == 4)

    # ---------- Botón 🛒 en la lista ----------
    ad.evaluate("AdminApp.navigate('products')"); ad.wait_for_timeout(200)
    ad.click(f"#products-tbody tr:has-text('Remera USD QA') button[title='Registrar una venta']"); ad.wait_for_timeout(500)
    check("🛒 abre Registrar venta con el producto", ad.is_visible("#order-modal") and ad.input_value("#order-items-container .order-item-product") == uid)
    check("🛒 precio sugerido $16.000", ad.input_value("#order-items-container .order-item-precio") == "16000", ad.input_value("#order-items-container .order-item-precio"))
    check("🛒 canal WhatsApp por defecto", ad.input_value("#of-origen") == "whatsapp")
    check("🛒 costo calculado solo (12.000)", ad.input_value("#of-costo") == "12000", ad.input_value("#of-costo"))
    ad.fill("#order-items-container .order-item-cant", "2"); ad.dispatch_event("#order-items-container .order-item-cant", "input")
    check("🛒 costo se recalcula con la cantidad", ad.input_value("#of-costo") == "24000", ad.input_value("#of-costo"))
    ad.screenshot(path=f"{SHOTS}/qa-registrar-venta.png")
    ad.click("#order-modal .modal-footer .btn-primary"); ad.wait_for_timeout(800)
    check("🛒 la venta descuenta stock en la planilla", prod_db("Remera USD QA")["Stock"] == 6, prod_db("Remera USD QA")["Stock"])
    ped = next((x for x in DB["Pedidos"] if x.get("Cliente") == "Venta por WhatsApp" and x.get("Total") == 32000), None)
    check("🛒 venta sin nombre queda como 'Venta por WhatsApp'", ped is not None, [x.get("Cliente") for x in DB["Pedidos"]])

    # ---------- Lista de pedidos y filtro por canal ----------
    ad.evaluate("AdminApp.navigate('orders')"); ad.wait_for_timeout(300)
    ad.select_option("#orders-filter-origen", "whatsapp"); ad.wait_for_timeout(200)
    n = ad.eval_on_selector_all("#orders-list .order-card", "e=>e.length")
    check("filtro WhatsApp", n == 2, n)
    ad.screenshot(path=f"{SHOTS}/qa-pedidos.png")

    # ---------- Inicio: ventas por canal y margen ----------
    ad.evaluate("AdminApp.navigate('dashboard')"); ad.wait_for_timeout(600)
    canal = ad.text_content("#ventas-por-canal") or ""
    check("inicio: ventas por canal", "WhatsApp" in canal and "2 ventas" in canal, canal)

    # ---------- Cambiar redondeo a $100 ----------
    ad.evaluate("AdminApp.navigate('settings')"); ad.wait_for_timeout(300)
    ad.select_option("#set-redondeo", "100"); ad.click("#settings-form button[type=submit]"); ad.wait_for_timeout(600)
    check("redondeo publicado en la planilla", str(DB["Config"].get("redondeo")) == "100", DB["Config"].get("redondeo"))
    check("margen sigue como multiplicador 1.3", float(DB["Config"].get("margen")) == 1.3, DB["Config"].get("margen"))

    # ======================= TIENDA =======================
    cctx, st = nuevo(b)
    cctx.route(re.compile(r"https://criptoya\.com/.*"), dolar_fijo)
    st.goto(BASE + "/index.html"); st.wait_for_timeout(2500)
    precio = lambda n: st.evaluate(f"PromoEngine.precioVistaARS(SheetsService.productos.find(p=>p.nombre==='{n}'))")
    check("tienda: USD con redondeo $100 (15.600)", precio("Remera USD QA") == 15600, precio("Remera USD QA"))
    check("tienda: costo en pesos $12.500", precio("Remera Pesos QA") == 12500)
    st.evaluate(f"App.openProductModal ? App.openProductModal(SheetsService.productos.find(p=>p.nombre==='Remera Pesos QA').id) : null")
    st.wait_for_timeout(400)
    nota = st.text_content("#product-modal-price-row") or ""
    check("tienda: el producto avisa del combo", "Top General QA" in nota and "20.000" in nota, nota)
    st.screenshot(path=f"{SHOTS}/qa-tienda-combo.png")
    st.evaluate("document.querySelector('.product-modal')?.classList.remove('open')")
    st.evaluate(f"CartService.addItem(SheetsService.productos.find(p=>p.nombre==='Remera Pesos QA'), 1, {{color:'Negro', talle:'L'}}); CartService.addItem(SheetsService.productos.find(p=>p.nombre==='Top General QA'), 1)")
    desc = st.evaluate("CartService.getDescuentosAutomaticos ? CartService.getDescuentosAutomaticos() : null")
    sub = st.evaluate("CartService.getSubtotalARS()")
    check("tienda: carrito cobra el combo ($20.000)", sub == 20000, [sub, desc])

    for c in checks: print(f"{c[0]} | {c[1]} | {c[2]}")
    ok = sum(1 for c in checks if c[0] == "PASS")
    print(f"\n{ok}/{len(checks)} OK")
    errs = [e for e in errors if "ERR_TUNNEL" not in e]
    print("ERRORS:", errs)
    b.close()
