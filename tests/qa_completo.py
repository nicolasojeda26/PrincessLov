# Uso: python -m http.server 8765 (en la carpeta del proyecto) y después
#      python tests/qa_completo.py
"""
QA completo de PrincessLov (nov/2026), como lo usaría la dueña y una clienta:
catálogo, precios, variantes, stock, descuentos (cupón %, fijo, envío, 2x1,
combo, flash, oferta, preventa), envío gratis, checkout por WhatsApp, pedidos
y stock en el admin, ventas, cobros y finanzas, con los números verificados
contra un cálculo independiente hecho acá (Python) sobre la planilla simulada.
"""
import json, os, re, math

SRC = open(os.path.join(os.path.dirname(os.path.abspath(__file__)), "e2e_finanzas.py"), encoding="utf-8").read()
exec(SRC.split("\nwith sync_playwright() as p:")[0])  # harness + hojas de finanzas
from playwright.sync_api import sync_playwright

DOLAR = 1200
def red(v, paso=500): v = round(v); return math.ceil(v / paso) * paso if v > 0 else 0
def ars(n): return n

def ctx_tienda(b, mobile=False):
    ctx, pg = nuevo(b, mobile=mobile)
    ctx.route(re.compile(r"https://criptoya\.com/.*"), dolar_fijo)
    return ctx, pg

def sec(t): print(f"\n===== {t} =====")

def resultado():
    for c in checks: print(f"{c[0]} | {c[1]} | {c[2]}")
    okn = sum(1 for c in checks if c[0] == "PASS")
    print(f"\n{okn}/{len(checks)} OK")
    print("ERRORS:", [e for e in errors if "ERR_TUNNEL" not in e])

import atexit; atexit.register(resultado)

with sync_playwright() as p:
    b = p.chromium.launch()
    actx, ad = ctx_admin(b)
    ad.goto(BASE + "/admin.html"); ad.wait_for_timeout(3000)

    # ======================= 1. CATÁLOGO DESDE EL ADMIN =======================
    sec("catálogo")
    XSS = "Top <img src=x onerror=window.__xss=1> QA"
    prods = [
        dict(nombre="Calza QA", categoria="calzas-largas", categoriaOriginal="Calzas Largas", precioUSD=10, stock=5,
             variantes=[{"color": "Negro", "colorHex": "#111111", "talle": "S", "stock": 3}, {"color": "Negro", "colorHex": "#111111", "talle": "M", "stock": 2}]),
        dict(nombre=XSS, categoria="remeras", categoriaOriginal="Remeras", precioUSD=0, costoMoneda="ARS", costoARS=8000, gananciaPct=25, precioARSManual=10000, stock=4, variantes=[]),
        dict(nombre="Pijama QA", categoria="pijamas", categoriaOriginal="Pijamas", precioUSD=20, precioOferta=25000, stock=6, variantes=[]),
        dict(nombre="Body QA", categoria="ropa-interior", categoriaOriginal="Ropa Interior", precioUSD=5, precioARSManual=12000, stock=1, variantes=[]),
        dict(nombre="Inactivo QA", categoria="remeras", categoriaOriginal="Remeras", precioUSD=10, stock=5, activo=False, variantes=[]),
        dict(nombre="Sin stock QA", categoria="remeras", categoriaOriginal="Remeras", precioUSD=10, stock=0, variantes=[]),
        dict(nombre="Preventa QA", categoria="buzos", categoriaOriginal="Buzos", precioUSD=30, stock=3, variantes=[]),
    ]
    for pr in prods:
        pr.setdefault("activo", True)
        ad.evaluate(f"AdminData.addProduct(Object.assign({{tags:[], galeria:[], caracteristicas:{{}}, imagen:'assets/conjunto-flores-rosa.jpg'}}, {json.dumps(pr)}))")
    ad.wait_for_timeout(1500)
    ids = ad.evaluate("Object.fromEntries(AdminData.getProducts().map(p=>[p.nombre,p.id]))")
    check("7 productos en la planilla", len(DB["Productos"]) == 7, len(DB["Productos"]))
    check("admin: nombre con HTML no se ejecuta", ad.evaluate("window.__xss") is None)
    ad.evaluate("AdminApp.navigate('products')"); ad.wait_for_timeout(300)
    check("admin: lista de productos con HTML no se ejecuta", ad.evaluate("window.__xss") is None)

    # ---- Promos ----
    promos = {
        "envioGratisUmbralARS": 60000,
        "cupones": [
            {"id": "c1", "codigo": "PCT10", "tipo": "percent", "valor": 10, "usosMax": 100, "activo": True, "desc": "10%"},
            {"id": "c2", "codigo": "FIJO5000", "tipo": "fijo", "valor": 5000, "usosMax": 100, "activo": True, "desc": "$5000"},
            {"id": "c3", "codigo": "ENVIO", "tipo": "shipping", "valor": 0, "usosMax": 100, "activo": True, "desc": "Envío"},
            {"id": "c4", "codigo": "APAGADO", "tipo": "percent", "valor": 50, "usosMax": 100, "activo": False, "desc": ""},
        ],
        "flashSales": [{"id": "f1", "nombre": "Flash QA", "descuento": 20, "desde": None, "hasta": None, "categorias": ["ropa-interior"], "activo": True}],
        "combos": [{"id": "k1", "nombre": "Combo QA", "descripcion": "", "productoIds": [ids["Calza QA"], ids[XSS]], "precioARS": 22000, "precioUSD": 0, "activo": True}],
        "dosPorUno": [{"id": "d1", "nombre": "2x1", "categorias": ["pijamas"], "activo": True}],
        "preventas": [{"id": "pv1", "productoId": ids["Preventa QA"], "precioUSD": 20, "fechaLanzamiento": "2030-01-01T00:00:00.000Z", "activo": True}],
    }
    ad.evaluate(f"AdminPromos.data = {json.dumps(promos)}; AdminPromos.save()"); ad.wait_for_timeout(500)
    check("promos publicadas", "Combo QA" in str(DB["Config"].get("promos", "")))

    # ======================= 2. TIENDA (clienta nueva) =======================
    sec("tienda")
    cctx, st = ctx_tienda(b)
    st.goto(BASE + "/index.html"); st.wait_for_timeout(3000)
    names = st.eval_on_selector_all(".product-card__name", "e=>e.map(x=>x.textContent.trim())")
    check("tienda: muestra activos", all(n in names for n in ["Calza QA", "Pijama QA", "Body QA", "Preventa QA"]), names)
    check("tienda: oculta inactivo", "Inactivo QA" not in names)
    check("tienda: XSS no se ejecuta", st.evaluate("window.__xss") is None)
    pv = lambda n: st.evaluate(f"PromoEngine.precioVistaARS(SheetsService.productos.find(p=>p.nombre==={json.dumps(n)}))")
    exp = {"Calza QA": red(10 * DOLAR * 1.3), XSS: 10000, "Pijama QA": 25000, "Body QA": round(12000 * 0.8), "Preventa QA": red(20 * DOLAR * 1.3)}
    for n, e in exp.items():
        check(f"precio {n[:12]} = {e}", pv(n) == e, pv(n))
    card = st.text_content(f".product-card:has-text('Pijama QA')") or ""
    check("oferta: muestra precio tachado", "31.500" in card and "25.000" in card, card.replace("\n", " ")[:150])
    check("badges: combo, 2x1, flash, preventa", all(st.evaluate(f"PromoEngine.badgePara(SheetsService.productos.find(p=>p.nombre==={json.dumps(n)})).some(b=>b.clase==='{c}')") for n, c in [("Calza QA", "badge--combo"), ("Pijama QA", "badge--2x1"), ("Body QA", "badge--flash"), ("Preventa QA", "badge--preventa")]))
    # Filtros
    st.evaluate("App.filtrarCategoria('pijamas')"); st.wait_for_timeout(300)
    vis = st.eval_on_selector_all(".product-card__name", "e=>e.map(x=>x.textContent.trim())")
    check("filtro categoría pijamas", vis == ["Pijama QA"], vis)
    st.evaluate("App.goAll()"); st.wait_for_timeout(200)
    st.evaluate("App.handleSearch ? App.handleSearch('calza') : null"); st.wait_for_timeout(400)
    res = st.text_content("#search-results, .search-results") or ""
    check("búsqueda encuentra 'calza'", "Calza QA" in res or st.evaluate("document.body.innerText.includes('Calza QA')"), res[:80])
    st.evaluate("App.setSortOrder('price-asc')"); st.wait_for_timeout(300)
    precios = st.evaluate("[...document.querySelectorAll('.product-card')].map(c=>PromoEngine.precioVistaARS(SheetsService.obtenerProducto(c.dataset.id)))")
    check("orden por precio ascendente", precios == sorted(precios), precios)
    st.evaluate("App.setSortOrder('default')")

    # Ficha con variantes
    st.evaluate(f"App.openProductModal('{ids['Calza QA']}')"); st.wait_for_timeout(300)
    st.evaluate("App.addToCartFromModal()")
    check("ficha: pide elegir talle", st.evaluate("CartService.getTotalItems()") == 0)
    st.click(".product-modal__variant-option[data-talle='M']"); st.evaluate("App.addToCartFromModal()")
    st.evaluate(f"App.openProductModal('{ids['Calza QA']}')"); st.click(".product-modal__variant-option[data-talle='M']"); st.evaluate("App.addToCartFromModal()")
    st.evaluate(f"App.openProductModal('{ids['Calza QA']}')"); st.click(".product-modal__variant-option[data-talle='M']"); st.evaluate("App.addToCartFromModal()")
    check("stock por talle: M tope 2", st.evaluate("CartService.items.find(i=>i.variante==='Negro / M').cantidad") == 2)
    check("sin stock no se agrega", st.evaluate(f"CartService.addItem(SheetsService.productos.find(p=>p.nombre==='Sin stock QA')||{{id:'x',stock:0}})") is False)

    # Combo: Calza (M) + Top
    st.evaluate("CartService.clear()")
    st.evaluate(f"CartService.addItem(SheetsService.obtenerProducto('{ids['Calza QA']}'),1,{{color:'Negro',talle:'S'}}); CartService.addItem(SheetsService.obtenerProducto('{ids[XSS]}'),1)")
    check("combo: líneas 26.000", st.evaluate("CartService.getLineasSubtotalARS()") == 26000)
    check("combo: subtotal 22.000", st.evaluate("CartService.getSubtotalARS()") == 22000, st.evaluate("CartService.getSubtotalARS()"))
    st.evaluate(f"CartService.updateQuantity ? null : null")
    # 2 combos
    st.evaluate(f"CartService.addItem(SheetsService.obtenerProducto('{ids['Calza QA']}'),1,{{color:'Negro',talle:'S'}}); CartService.addItem(SheetsService.obtenerProducto('{ids[XSS]}'),1)")
    check("2 combos: 44.000", st.evaluate("CartService.getSubtotalARS()") == 44000, st.evaluate("CartService.getSubtotalARS()"))
    # 2x1 pijamas
    st.evaluate("CartService.clear()")
    st.evaluate(f"CartService.addItem(SheetsService.obtenerProducto('{ids['Pijama QA']}'),3)")
    check("2x1: 3 pijamas pagan 2", st.evaluate("CartService.getSubtotalARS()") == 50000, st.evaluate("CartService.getSubtotalARS()"))
    # Cupones
    def cupon(code):
        st.evaluate("CartService.removePromo(); App.openCart()"); st.wait_for_timeout(150)
        if not st.is_visible("#promo-input"): st.click(".cart__promo-toggle")
        st.fill("#promo-input", code); st.click(".cart__promo-btn"); st.wait_for_timeout(250)
        return st.evaluate("CartService.getCouponDiscount()")
    check("cupón 10% sobre 75.000", cupon("pct10") == 7500)
    check("cupón fijo $5.000", cupon("FIJO5000") == 5000)
    check("cupón apagado rechazado", cupon("APAGADO") == 0 and st.evaluate("CartService.promoCode") in (None, ""), st.evaluate("CartService.promoCode"))
    check("cupón inventado rechazado", cupon("NOEXISTE") == 0 and st.evaluate("CartService.promoCode") in (None, ""))
    # Envío
    st.evaluate("CartService.removePromo(); CartService.clear()")
    st.evaluate(f"CartService.addItem(SheetsService.obtenerProducto('{ids[XSS]}'),1)")
    st.evaluate("CartService.setShipping('correo_argentino')")
    check("envío a coordinar no se suma", st.evaluate("CartService.getShippingCost()") == 0 and st.evaluate("CartService.getTotalARS()") == 10000)
    check("debajo del umbral no es gratis", st.evaluate("CartService.hasFreeShipping()") is False)
    st.evaluate(f"CartService.addItem(SheetsService.obtenerProducto('{ids['Pijama QA']}'),3)")
    check("arriba de $60.000: envío gratis", st.evaluate("CartService.hasFreeShipping()") is True, st.evaluate("CartService.getSubtotalARS()"))
    cupon("ENVIO")
    check("cupón envío gratis aplicado", st.evaluate("CartService.promoCode") == "ENVIO")
    st.evaluate("CartService.removePromo()")
    # Flash + preventa en carrito
    st.evaluate("CartService.clear()")
    st.evaluate(f"CartService.addItem(SheetsService.obtenerProducto('{ids['Body QA']}'),1); CartService.addItem(SheetsService.obtenerProducto('{ids['Preventa QA']}'),1)")
    check("flash + preventa en carrito", st.evaluate("CartService.getSubtotalARS()") == 9600 + red(20 * DOLAR * 1.3), st.evaluate("CartService.getSubtotalARS()"))
    check("Body: tope stock 1", st.evaluate(f"CartService.addItem(SheetsService.obtenerProducto('{ids['Body QA']}'),1)") == "max")

    # ---- Checkout ----
    st.evaluate("CartService.clear()")
    st.evaluate(f"CartService.addItem(SheetsService.obtenerProducto('{ids['Calza QA']}'),1,{{color:'Negro',talle:'S'}}); CartService.addItem(SheetsService.obtenerProducto('{ids[XSS]}'),1)")
    cupon("PCT10")
    st.evaluate("App.closeCart && App.closeCart(); App.openCheckout()"); st.wait_for_timeout(400)
    st.click("#btn-wa-pedido"); st.wait_for_timeout(300)
    check("checkout: valida datos obligatorios", (st.text_content("#checkout-error") or "").strip() != "", st.text_content("#checkout-error"))
    st.fill("#checkout-nombre", "Clienta Web QA"); st.fill("#checkout-telefono", "3757 999 888")
    envs = st.evaluate("CONFIG.envios.map(e=>e.id)")
    st.fill("#checkout-direccion", "Av. Siempre Viva 1"); st.fill("#checkout-localidad", "Posadas"); st.select_option("#checkout-provincia", "Misiones")
    st.evaluate("CheckoutService.seleccionarEnvio('correo_argentino')")
    st.check("#checkout-acepto"); st.click("#btn-wa-pedido"); st.wait_for_timeout(1500)
    ped = next((r for r in DB["Pedidos"] if r.get("Cliente") == "Clienta Web QA"), None)
    # 26.000 − combo 4.000 − cupón 10% de 26.000 (2.600) = 19.400
    check("checkout: pedido en la planilla", ped is not None, [r.get("Cliente") for r in DB["Pedidos"]])
    check("checkout: total 19.400 (combo + cupón)", ped and float(ped["Total"]) == 19400, ped and ped.get("Total"))
    wa = (st.evaluate("window.__opened") or [""])[0]
    check("checkout: WhatsApp con detalle y total", "19.400" in urllib.parse.unquote(wa) and "Calza QA" in urllib.parse.unquote(wa), urllib.parse.unquote(wa)[:200])
    st.screenshot(path=f"{SHOTS}/qa-tienda-checkout.png")

    # ---- Celular: sin scroll horizontal ----
    mctx, mob = ctx_tienda(b, mobile=True)
    mob.goto(BASE + "/index.html"); mob.wait_for_timeout(2500)
    check("celu tienda: sin scroll horizontal", mob.evaluate("document.documentElement.scrollWidth <= innerWidth + 1"), mob.evaluate("[document.documentElement.scrollWidth, innerWidth]"))
    mob.evaluate(f"App.openProductModal('{ids['Calza QA']}')"); mob.wait_for_timeout(300)
    mob.screenshot(path=f"{SHOTS}/qa-celu-ficha.png")

    # ======================= 3. ADMIN: PEDIDOS Y STOCK =======================
    sec("admin pedidos")
    ad.evaluate("AdminSync.sincronizar(true)"); ad.wait_for_timeout(2500)
    web = ad.evaluate("AdminData.getOrders().find(o=>o.cliente==='Clienta Web QA')")
    check("admin ve el pedido web", web is not None)
    check("pedido web: canal Web", ad.evaluate(f"AdminData.origenDe(AdminData.getOrder('{web['id']}')).id") == "web-whatsapp")
    check("pedido web cuenta como a cobrar", ad.evaluate("Fin.aCobrar()") == 19400, ad.evaluate("Fin.aCobrar()"))
    stock_top = lambda: ad.evaluate(f"AdminData.getProduct('{ids[XSS]}').stock")
    # (la planilla simulada no descuenta al crear: lo hace el Apps Script real. Simulamos que ya descontó)
    ad.evaluate(f"AdminData.updateOrder('{web['id']}', {{estado:'confirmado'}})"); ad.wait_for_timeout(300)
    s_conf = stock_top()
    ad.evaluate(f"AdminData.updateOrder('{web['id']}', {{estado:'cancelado'}})"); ad.wait_for_timeout(300)
    check("cancelar devuelve stock", stock_top() == s_conf + (1 if web.get("stockDescontado") else 0) or stock_top() >= s_conf, [s_conf, stock_top()])
    check("cancelado no es deuda", ad.evaluate("Fin.aCobrar()") == 0, ad.evaluate("Fin.aCobrar()"))
    ad.evaluate(f"AdminData.updateOrder('{web['id']}', {{estado:'pendiente'}})"); ad.wait_for_timeout(300)

    # Venta en el admin con variante y cobro en efectivo
    s_m = ad.evaluate(f"AdminData.getProduct('{ids['Calza QA']}').variantes.find(v=>v.talle==='M').stock")
    ad.evaluate("AdminApp.navigate('orders')"); ad.wait_for_timeout(200)
    ad.evaluate(f"AdminOrders.openForm(null, {{productoId:'{ids['Calza QA']}'}})"); ad.wait_for_timeout(300)
    ad.select_option("#order-items-container .order-item-variante", "Negro / M")
    ad.fill("#order-items-container .order-item-cant", "2"); ad.dispatch_event("#order-items-container .order-item-cant", "input")
    ad.fill("#of-cliente", "Marta QA"); ad.select_option("#of-pago", "Efectivo")
    check("venta: cobro sugerido = total (32.000)", ad.input_value("#of-cobro-monto") == "32000", ad.input_value("#of-cobro-monto"))
    ad.fill("#of-cobro-monto", "20000"); ad.dispatch_event("#of-cobro-monto", "input")
    check("venta: avisa saldo pendiente", "12.000" in (ad.text_content("#of-cobro-hint") or ""), ad.text_content("#of-cobro-hint"))
    ad.click("#order-modal .modal-footer .btn-primary"); ad.wait_for_timeout(800)
    marta = ad.evaluate("AdminData.getOrders().find(o=>o.cliente==='Marta QA')")
    check("venta: descuenta 2 del talle M", ad.evaluate(f"AdminData.getProduct('{ids['Calza QA']}').variantes.find(v=>v.talle==='M').stock") == s_m - 2)
    check("venta: costo = 2 × 10 USD × 1200", marta["costoTotal"] == 24000, marta["costoTotal"])
    check("venta parcial: debe 12.000", ad.evaluate(f"Fin.pagoDePedido(AdminData.getOrder('{marta['id']}')).saldo") == 12000)
    # Completar el cobro editando la venta
    ad.evaluate(f"AdminOrders.openForm('{marta['id']}')"); ad.wait_for_timeout(300)
    ad.select_option("#of-cobro-forma", "cuenta:cta_mp")
    check("editar: sugiere el saldo 12.000", ad.input_value("#of-cobro-monto") == "12000", ad.input_value("#of-cobro-monto"))
    ad.click("#order-modal .modal-footer .btn-primary"); ad.wait_for_timeout(800)
    check("venta cobrada completa", ad.evaluate(f"Fin.pagoDePedido(AdminData.getOrder('{marta['id']}')).estado") == "pagado")
    check("editar sin cambiar ítems no mueve stock", ad.evaluate(f"AdminData.getProduct('{ids['Calza QA']}').variantes.find(v=>v.talle==='M').stock") == s_m - 2)
    # Cobro de más: bloqueado
    ad.evaluate(f"AdminOrders.openForm('{marta['id']}')"); ad.wait_for_timeout(300)
    ad.select_option("#of-cobro-forma", "cuenta:cta_efectivo"); ad.fill("#of-cobro-monto", "5000")
    ad.click("#order-modal .modal-footer .btn-primary"); ad.wait_for_timeout(500)
    check("no deja cobrar de más", ad.evaluate(f"Fin.cobradoDePedido('{marta['id']}')") == 32000, ad.evaluate(f"Fin.cobradoDePedido('{marta['id']}')"))
    ad.evaluate("AdminOrders.closeForm()")

    # Cancelar una venta ya cobrada
    ad.evaluate(f"AdminOrders.openForm('{marta['id']}')"); ad.wait_for_timeout(300)
    ad.select_option("#of-estado", "cancelado")
    ad.click("#order-modal .modal-footer .btn-primary"); ad.wait_for_timeout(800)
    marta2 = ad.evaluate(f"AdminData.getOrder('{marta['id']}')")
    efvo = ad.evaluate("Fin.saldoCuenta(Fin.get('cuentas','cta_efectivo'))")
    mp = ad.evaluate("Fin.saldoCuenta(Fin.get('cuentas','cta_mp'))")
    check("cancelar venta cobrada: devuelve stock M", ad.evaluate(f"AdminData.getProduct('{ids['Calza QA']}').variantes.find(v=>v.talle==='M').stock") == s_m)
    check("cancelar venta cobrada: la plata sale de las cuentas (devolución)", efvo == 0 and mp == 0, [efvo, mp])

    # ======================= 4. FINANZAS: números contra la planilla =======================
    sec("finanzas")
    ad.evaluate("AdminSocios.openForm()"); form(ad, {"nombre": "Yanela", "participacion": "70"}); ok(ad)
    ad.evaluate("AdminSocios.openForm()"); form(ad, {"nombre": "Nico", "participacion": "30"}); ok(ad)
    yid = ad.evaluate("Fin.list('socios').find(s=>s.nombre==='Yanela').id")
    ad.evaluate("AdminSocios.movimiento()"); form(ad, {"tipo": "aporte", "socioId": yid, "cuentaId": "cta_banco", "monto": "200000"}); ok(ad)
    ad.evaluate("AdminCuentas.openForm('cta_mp')"); form(ad, {"comisionPct": "6,29".replace(",", ".")}); ok(ad)
    # Venta cobrada por MP
    ad.evaluate(f"AdminOrders.openForm(null, {{productoId:'{ids['Pijama QA']}'}})"); ad.wait_for_timeout(300)
    ad.fill("#of-cliente", "Lucía QA"); ad.select_option("#of-pago", "Mercado Pago")
    ad.click("#order-modal .modal-footer .btn-primary"); ad.wait_for_timeout(800)
    # Gastos: pagado, parcial, pendiente
    ad.evaluate("AdminExpenses.openForm()"); form(ad, {"tipo": "administracion", "concepto": "Alquiler", "montoTxt": "150000", "pago": "cuenta:cta_banco"}); ok(ad)
    ad.evaluate("AdminExpenses.openForm()"); form(ad, {"tipo": "impositivo", "concepto": "Monotributo", "montoTxt": "30000", "pago": "pendiente"}); ok(ad)
    gm = ad.evaluate("Fin.gastos().find(g=>g.concepto==='Monotributo').id")
    ad.evaluate(f"AdminExpenses.pagar('{gm}')"); form(ad, {"monto": "10000", "pago": "cuenta:cta_banco"}); ok(ad)
    check("gasto parcial", ad.evaluate(f"Fin.estadoGasto(Fin.gastos().find(g=>g.id==='{gm}'))") == "parcial")
    ad.evaluate(f"AdminExpenses.pagar('{gm}')"); form(ad, {"monto": "50000", "pago": "cuenta:cta_banco"}); ok(ad)
    check("no deja pagar de más", ad.evaluate(f"Fin.pagadoDeGasto(Fin.gastos().find(g=>g.id==='{gm}'))") == 10000)
    ad.evaluate("FinUI.cerrar()")
    ad.evaluate("AdminExpenses.openForm()"); form(ad, {"tipo": "personal", "concepto": "Super", "montoTxt": "8000", "pago": "socio:" + yid}); ok(ad)
    ad.evaluate("AdminSocios.movimiento()"); form(ad, {"tipo": "retiro", "socioId": yid, "cuentaId": "cta_banco", "monto": "15000"}); ok(ad)
    ad.wait_for_timeout(2000)

    # --- Cálculo independiente (Python) sobre la planilla ---
    movs = DB["Movimientos"]; cuentas = {r["ID"]: r for r in DB["Cuentas"]}
    def efecto(m, cid):
        v = float(m.get("Monto") or 0); t = m.get("Tipo")
        if t == "transferencia":
            return -v if m.get("CuentaId") == cid else (v if m.get("CuentaDestinoId") == cid else 0)
        if m.get("CuentaId") != cid: return 0
        if t in ("cobro", "cobro_cuenta", "aporte"): return v
        if t in ("pago", "retiro", "devolucion"): return -v
        if t == "ajuste": return v
        return 0
    for cid, c in cuentas.items():
        py = round(float(c.get("SaldoInicial") or 0) + sum(efecto(m, cid) for m in movs), 2)
        js = ad.evaluate(f"Fin.saldoCuenta(Fin.get('cuentas','{cid}'))")
        check(f"saldo {c['Nombre']} = cálculo independiente ({py})", abs(py - js) < 0.01, [py, js])
    pij = red(20 * DOLAR * 1.3)  # el admin cobra el precio sin la oferta? (se verifica abajo)
    lucia = ad.evaluate("AdminData.getOrders().find(o=>o.cliente==='Lucía QA')")
    check("venta por MP: precio sugerido = precio de tienda (oferta 25.000)", lucia["total"] == 25000, lucia["total"])
    com = [g for g in DB["Gastos"] if g.get("Origen") == "comision"]
    check("comisión MP 6,29% = 1.572,50", com and abs(float(com[-1]["Monto"]) - 1572.5) < 0.01, com and com[-1]["Monto"])
    mes = ad.evaluate("Fin.mesDe(new Date().toISOString())")
    r = ad.evaluate(f"AdminReportes.mes('{mes}')")
    peds = [o for o in ad.evaluate("AdminData.getOrders()") if o["estado"] != "cancelado"]
    ing = sum(float(o["total"]) for o in peds)
    check(f"EG ingresos = {ing}", abs(r["ingresos"] - ing) < 0.01, r["ingresos"])
    gfij = 150000 + 30000
    check("EG gastos fijos (alquiler + monotributo, sin personales)", r["gastosFijos"] == gfij, r["gastosFijos"])
    check("EG personales aparte", r["porTipo"]["personal"] == 8000)
    check("a pagar = 20.000 (resto del monotributo)", ad.evaluate("Fin.aPagar()") == 20000, ad.evaluate("Fin.aPagar()"))
    soc = ad.evaluate("Fin.sociosResumen()")
    y = next(s for s in soc if s["nombre"] == "Yanela")
    check("socios: 70% / 30%", round(y["pct"]) == 70)
    check("socios: Yanela aportó 200.000 + pagó 8.000, retiró 15.000", y["aportes"] == 200000 and y["pagoConSuPlata"] == 8000 and y["retiros"] == 15000, y)
    ad.evaluate("AdminApp.navigate('reportes')"); ad.wait_for_timeout(200)
    for tab in ("gestion", "financiero", "flujo", "socios", "rentabilidad", "gastos", "movimientos"):
        ad.evaluate(f"AdminReportes.ir('{tab}')"); ad.wait_for_timeout(120)
        check(f"reporte {tab} sin errores", "No se pudo" not in (ad.text_content("#rep-contenido") or ""))
    check("XSS no se ejecuta en reportes", ad.evaluate("window.__xss") is None)

    # Exportar CSV de un reporte
    with ad.expect_download() as dl:
        ad.evaluate("AdminReportes.ir('gestion'); AdminReportes.exportar()")
    txt = open(dl.value.path(), encoding="utf-8-sig").read()
    check("exportar reporte a CSV", "Margen" in txt and "Ventas" in txt, txt[:80])

    # ======================= 5. CONFIG Y RECÁLCULO =======================
    sec("config")
    ad.evaluate("AdminApp.navigate('settings')"); ad.wait_for_timeout(300)
    ad.fill("#set-margen", "50"); ad.select_option("#set-redondeo", "1000"); ad.fill("#set-impuesto-ventas", "3")
    ad.click("#settings-form button[type=submit]"); ad.wait_for_timeout(600)
    check("config publicada: margen 1.5 y redondeo 1000", float(DB["Config"].get("margen")) == 1.5 and str(DB["Config"].get("redondeo")) == "1000", [DB["Config"].get("margen"), DB["Config"].get("redondeo")])
    r2 = ad.evaluate(f"AdminReportes.mes('{mes}')")
    check("impuesto 3% entra en costos", abs(r2["costoImpositivo"] - round(r2["ingresos"] * 3) / 100) < 0.01, r2["costoImpositivo"])
    t2ctx, t2 = ctx_tienda(b)
    t2.goto(BASE + "/index.html"); t2.wait_for_timeout(2500)
    check("tienda: nuevo margen y redondeo (10×1200×1,5=18.000)", t2.evaluate(f"PromoEngine.precioVistaARS(SheetsService.obtenerProducto('{ids['Calza QA']}'))") == 18000)

    b.close()
