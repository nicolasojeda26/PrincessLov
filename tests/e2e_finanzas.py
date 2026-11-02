# Uso: python -m http.server 8765 (en la carpeta del proyecto) y después
#      python tests/e2e_finanzas.py
"""
Finanzas como Gestión Moda (nov/2026): cuentas, socios, proveedores, gastos
(pagados, pendientes, en USD y fijos del mes), cobros de ventas con comisión,
clientes con cuenta corriente, transferencias, caja con arqueo, reportes y
sincronización con otro dispositivo. Apps Script simulado con las hojas nuevas.
"""
import json, os, re

SRC = open(os.path.join(os.path.dirname(os.path.abspath(__file__)), "e2e_admin_tienda.py"), encoding="utf-8").read()
exec(SRC.split("with sync_playwright() as p:")[0])  # DB, gas(), nuevo(), check(), fill()
from playwright.sync_api import sync_playwright

SHOTS = os.environ.get("SHOTS", "/tmp")
FIN = {"cuentas": "Cuentas", "movimientos": "Movimientos", "socios": "Socios", "proveedores": "Proveedores",
       "clientes": "Clientes", "turnos": "Turnos", "gastos": "Gastos"}
for v in FIN.values():
    DB.setdefault(v, [])

gas_base = gas
def gas_fin(route, request):
    if request.method == "POST":
        data = json.loads(request.post_data or "{}")
        a = data.get("action")
        ok = data.get("token") == TOKEN
        if a in ("fin_version", "fin_upsert", "fin_delete") or (a == "admin_read" and data.get("sheet") in FIN):
            if not ok:
                return route.fulfill(status=200, content_type="application/json", body=json.dumps({"error": "No autorizado"}))
            if a == "fin_version":
                res = {"version": 1}
            elif a == "fin_upsert":
                upsert(FIN[data["sheet"]], data["row"]); res = {"success": True}
            elif a == "fin_delete":
                sh = FIN[data["sheet"]]; DB[sh] = [r for r in DB[sh] if str(r["ID"]) != str(data["id"])]; res = {"success": True}
            else:
                res = DB[FIN[data["sheet"]]]
            return route.fulfill(status=200, content_type="application/json", body=json.dumps(res))
        if a == "update_order":  # el Apps Script nuevo agrega Cobro/EnvioCosto/ClienteId
            for r in DB["Pedidos"]:
                if str(r["ID"]) == str(data["id"]): r.update({k: v for k, v in data["updates"].items() if k != "ID"})
            return route.fulfill(status=200, content_type="application/json", body=json.dumps({"success": True}))
    return gas_base(route, request)

def dolar_fijo(route, request):
    route.fulfill(status=200, content_type="application/json", body=json.dumps({"oficial": {"ask": 1200}}))

def ctx_admin(b, mobile=False):
    ctx, pg = nuevo(b, mobile=mobile, token=True)
    ctx.unroute(re.compile(r"https://script\.google\.com/.*"))
    ctx.route(re.compile(r"https://script\.google\.com/.*"), gas_fin)
    ctx.route(re.compile(r"https://criptoya\.com/.*"), dolar_fijo)
    return ctx, pg

def ev(pg, js): return pg.evaluate(js)
def saldo(pg, nombre): return ev(pg, f"Fin.saldoCuenta(Fin.cuentas().find(c=>c.nombre==='{nombre}'))")
def form(pg, campos):
    for k, v in campos.items():
        sel = f"#fin-form [name='{k}']"
        tag = pg.eval_on_selector(sel, "e=>e.tagName+'|'+e.type")
        if tag.startswith("SELECT"): pg.select_option(sel, v)
        elif tag.endswith("checkbox"):
            if bool(v) != pg.is_checked(sel): pg.click(sel)
        elif tag.endswith("hidden"): pg.click(f"#fin-form [data-pill='{k}'][data-v='{v}']")
        else: pg.fill(sel, str(v)); pg.dispatch_event(sel, "input")
def ok(pg): pg.click("#fin-form-ok"); pg.wait_for_timeout(400)

with sync_playwright() as p:
    b = p.chromium.launch()
    actx, ad = ctx_admin(b)
    ad.goto(BASE + "/admin.html"); ad.wait_for_timeout(3000)
    check("conectado con hojas de finanzas", ev(ad, "Fin.remotoOk") is True)

    # ---------- Cuentas ----------
    ad.evaluate("AdminApp.navigate('cuentas')"); ad.wait_for_timeout(300)
    nombres = ev(ad, "Fin.cuentas().map(c=>c.nombre)")
    check("cuentas de fábrica", nombres == ["Efectivo", "Mercado Pago", "Banco / Transferencia"], nombres)
    check("cuentas publicadas en la planilla", len(DB["Cuentas"]) == 3, len(DB["Cuentas"]))
    ad.evaluate("AdminCuentas.openForm('cta_mp')"); form(ad, {"comisionPct": "6"}); ok(ad)
    ad.evaluate("AdminCuentas.openForm('cta_efectivo')"); form(ad, {"saldoInicial": "10.000"}); ok(ad)
    check("comisión MP guardada", any(r["ID"] == "cta_mp" and float(r["ComisionPct"]) == 6 for r in DB["Cuentas"]))
    check("saldo inicial efectivo", saldo(ad, "Efectivo") == 10000)

    # ---------- Socios ----------
    ad.evaluate("AdminApp.navigate('socios')"); ad.wait_for_timeout(200)
    for n in ("Yanela", "Nico"):
        ad.evaluate("AdminSocios.openForm()"); form(ad, {"nombre": n, "participacion": "1"}); ok(ad)
    ad.evaluate("AdminSocios.movimiento()")
    yid = ev(ad, "Fin.list('socios').find(s=>s.nombre==='Yanela').id")
    form(ad, {"tipo": "aporte", "socioId": yid, "cuentaId": "cta_banco", "monto": "50000"}); ok(ad)
    check("aporte suma al banco", saldo(ad, "Banco / Transferencia") == 50000)

    # ---------- Proveedor + gastos ----------
    ad.evaluate("AdminApp.navigate('proveedores')"); ad.evaluate("AdminProveedores.openForm()")
    form(ad, {"nombre": "Inmobiliaria Sur", "tipoProveedor": "gastos"}); ok(ad)
    pid = ev(ad, "Fin.list('proveedores')[0].id")
    ad.evaluate("AdminApp.navigate('expenses')"); ad.wait_for_timeout(200)
    ad.evaluate("AdminExpenses.openForm()")
    form(ad, {"tipo": "administracion", "concepto": "Alquiler local", "proveedorId": pid, "montoTxt": "100.000", "pago": "cuenta:cta_banco"}); ok(ad)
    ad.evaluate("AdminExpenses.openForm()")
    form(ad, {"tipo": "comercializacion", "concepto": "Publicidad Instagram", "montoTxt": "20000", "pago": "pendiente"}); ok(ad)
    ad.evaluate("AdminExpenses.openForm()")
    form(ad, {"tipo": "administracion", "concepto": "Hosting", "moneda": "USD", "montoTxt": "10", "pago": "pendiente"})
    check("USD: muestra la conversión", "12.000" in (ad.text_content("#ff-montoTxt-hint") or ""), ad.text_content("#ff-montoTxt-hint"))
    ok(ad)
    g = next((r for r in DB["Gastos"] if r.get("Concepto") == "Hosting"), {})
    check("gasto USD guardado en pesos con cotización", g.get("Monto") == 12000 and g.get("MontoUSD") == 10 and g.get("Moneda") == "USD", g)
    check("alquiler pagado desde el banco", saldo(ad, "Banco / Transferencia") == -50000)
    check("a pagar = publicidad + hosting", ev(ad, "Fin.aPagar()") == 32000, ev(ad, "Fin.aPagar()"))
    ad.screenshot(path=f"{SHOTS}/fin-gastos.png")

    # ---------- Producto ----------
    ad.evaluate("AdminData.addProduct({nombre:'Remera QA', categoria:'conjuntos', categoriaOriginal:'Conjuntos', precioUSD:0, costoMoneda:'ARS', costoARS:10000, gananciaPct:30, precioARSManual:13000, stock:10, activo:true, tags:[], variantes:[], galeria:[], caracteristicas:{}})")
    prod = ev(ad, "AdminData.getProducts().find(p=>p.nombre==='Remera QA').id")

    # ---------- Venta cobrada por Mercado Pago (comisión automática) ----------
    ad.evaluate("AdminApp.navigate('orders')"); ad.wait_for_timeout(200)
    ad.evaluate(f"AdminOrders.openForm(null, {{productoId:'{prod}'}})"); ad.wait_for_timeout(300)
    ad.select_option("#of-pago", "Mercado Pago"); ad.wait_for_timeout(100)
    check("medio MP elige la cuenta MP", ad.input_value("#of-cobro-forma") == "cuenta:cta_mp", ad.input_value("#of-cobro-forma"))
    check("monto cobrado = total", ad.input_value("#of-cobro-monto") == "13000", ad.input_value("#of-cobro-monto"))
    check("avisa la comisión", "780" in (ad.text_content("#of-cobro-hint") or ""), ad.text_content("#of-cobro-hint"))
    ad.screenshot(path=f"{SHOTS}/fin-venta-cobro.png")
    ad.click("#order-modal .modal-footer .btn-primary"); ad.wait_for_timeout(700)
    check("MP: cobro − comisión", saldo(ad, "Mercado Pago") == 12220, saldo(ad, "Mercado Pago"))
    com = next((r for r in DB["Gastos"] if "Comisión" in str(r.get("Concepto"))), {})
    check("comisión como gasto comercial pagado", com.get("Monto") == 780 and com.get("Tipo") == "comercializacion" and com.get("Origen") == "comision", com)

    # ---------- Venta pendiente a una clienta ----------
    ad.evaluate(f"AdminOrders.openForm(null, {{productoId:'{prod}'}})"); ad.wait_for_timeout(300)
    ad.fill("#of-cliente", "Carla QA"); ad.fill("#of-telefono", "3757 111 222")
    ad.select_option("#of-cobro-forma", "pendiente")
    ad.click("#order-modal .modal-footer .btn-primary"); ad.wait_for_timeout(700)
    ped = next((r for r in DB["Pedidos"] if r.get("Cliente") == "Carla QA"), {})
    check("venta pendiente marcada en la planilla", ped.get("Cobro") == "pendiente", {k: ped.get(k) for k in ("Cobro", "ClienteId")})
    check("ficha de clienta creada", any(r.get("Nombre") == "Carla QA" for r in DB["Clientes"]))
    check("a cobrar 13.000", ev(ad, "Fin.aCobrar()") == 13000, ev(ad, "Fin.aCobrar()"))
    lista = ad.text_content("#orders-list") or ""
    check("lista de pedidos muestra la deuda", "Debe" in lista)

    # Cobro parcial desde Clientes
    ad.evaluate("AdminApp.navigate('clientes')"); ad.wait_for_timeout(300)
    clave = ev(ad, "Fin.clientesResumen().find(r=>r.nombre==='Carla QA').clave")
    ad.evaluate(f"AdminClientes.cobrar('{clave}')"); form(ad, {"monto": "5000", "pago": "cuenta:cta_efectivo"}); ok(ad)
    check("clienta debe 8.000", ev(ad, f"Fin.clientesResumen().find(r=>r.clave==='{clave}').deuda") == 8000)
    check("efectivo 15.000", saldo(ad, "Efectivo") == 15000)
    ad.evaluate(f"AdminClientes.cuentaCorriente('{clave}')"); ad.wait_for_timeout(200)
    cc = ad.text_content("#fin-modal-body") or ""
    check("cuenta corriente con venta y cobro", "Venta" in cc and "Cobro" in cc and "8.000" in cc, cc[:200])
    ad.screenshot(path=f"{SHOTS}/fin-cuenta-corriente.png"); ad.evaluate("FinUI.cerrar()")

    # ---------- Pagar gasto pendiente y transferir ----------
    gid = ev(ad, "Fin.gastos().find(g=>g.concepto==='Publicidad Instagram').id")
    ad.evaluate(f"AdminExpenses.pagar('{gid}')"); form(ad, {"monto": "20000", "pago": "cuenta:cta_mp"}); ok(ad)
    check("publicidad pagada", ev(ad, f"Fin.estadoGasto(Fin.gastos().find(g=>g.id==='{gid}'))") == "pagado")
    ad.evaluate("AdminCuentas.transferir()"); form(ad, {"desde": "cta_banco", "hacia": "cta_mp", "monto": "10000"}); ok(ad)
    check("transferencia banco → MP", saldo(ad, "Mercado Pago") == 2220 and saldo(ad, "Banco / Transferencia") == -60000, [saldo(ad, "Mercado Pago"), saldo(ad, "Banco / Transferencia")])

    # ---------- Caja ----------
    ad.evaluate("AdminApp.navigate('caja')"); ad.wait_for_timeout(200)
    ad.evaluate("AdminCaja.abrir()"); form(ad, {"montoInicial": "15000"}); ok(ad)
    nid = ev(ad, "Fin.list('socios').find(s=>s.nombre==='Nico').id")
    ad.evaluate("AdminSocios.movimiento()"); form(ad, {"tipo": "retiro", "socioId": nid, "cuentaId": "cta_efectivo", "monto": "3000"}); ok(ad)
    ad.evaluate("AdminApp.navigate('caja')"); ad.wait_for_timeout(200)
    check("caja: esperado 12.000", ev(ad, "Fin.resumenTurno(Fin.turnoAbierto()).esperado") == 12000)
    ad.screenshot(path=f"{SHOTS}/fin-caja.png")
    ad.evaluate("AdminCaja.cerrar()"); form(ad, {"contado": "11500"})
    check("caja: avisa faltante", "Faltan" in (ad.text_content("#ff-contado-hint") or ""))
    ok(ad)
    t = next((r for r in DB["Turnos"] if r.get("Estado") == "cerrado"), {})
    check("turno cerrado con diferencia −500", t.get("Diferencia") == -500, t)
    check("efectivo corregido a lo contado", saldo(ad, "Efectivo") == 11500)

    # ---------- Gastos fijos del mes ----------
    ad.evaluate("AdminApp.navigate('expenses')"); ad.evaluate("AdminExpenses.nuevaPlantilla()")
    form(ad, {"tipo": "administracion", "concepto": "Internet", "monto": "15000"}); ok(ad); ad.wait_for_timeout(200)
    check("plantilla publicada (privada)", "Internet" in str(DB["Config"].get("gastosRecurrentes", "")))
    ad.click("#rec-aplicar"); ad.wait_for_timeout(400)
    check("gasto fijo generado", ev(ad, "Fin.gastos().filter(g=>g.concepto==='Internet').length") == 1)
    ad.evaluate("AdminExpenses.recurrentes()"); ad.wait_for_timeout(200)
    check("no se genera dos veces", "Aplicado" in (ad.text_content("#fin-modal-body") or ""))
    ad.evaluate("FinUI.cerrar()")

    # ---------- Reportes ----------
    ad.evaluate("AdminApp.navigate('reportes')"); ad.wait_for_timeout(300)
    mes = ev(ad, "Fin.mesDe(new Date().toISOString())")
    r = ev(ad, f"AdminReportes.mes('{mes}')")
    check("EG: ingresos 26.000", r["ingresos"] == 26000, r["ingresos"])
    check("EG: costo productos 20.000", r["costoProductos"] == 20000)
    check("EG: costos comerciales = comisión", r["costoComercial"] == 780)
    check("EG: margen 5.220", r["margen"] == 5220, r["margen"])
    check("EG: gastos fijos 147.000", r["gastosFijos"] == 147000, r["gastosFijos"])
    check("EG: resultado", r["resultado"] == 5220 - 147000)
    check("tabla Estado de Gestión", "Margen" in (ad.text_content("#rep-tabla") or ""))
    ad.screenshot(path=f"{SHOTS}/fin-estado-gestion.png")
    f = ev(ad, f"AdminReportes.flujoMes('{mes}')")
    check("flujo: cobros 18.000", f["cobros"] == 18000, f)
    check("flujo: pagos 120.780", f["pagos"] == 120780, f["pagos"])
    check("flujo: aportes y retiros", f["aportes"] == 50000 and f["retiros"] == 3000)
    for tab in ("financiero", "flujo", "socios", "rentabilidad", "gastos", "movimientos"):
        ad.evaluate(f"AdminReportes.ir('{tab}')"); ad.wait_for_timeout(150)
        txt = ad.text_content("#rep-contenido") or ""
        check(f"reporte {tab} se arma", "No se pudo" not in txt and len(txt) > 40, txt[:80])
    ad.evaluate("AdminReportes.ir('rentabilidad')")
    check("rentabilidad muestra el producto", "Remera QA" in (ad.text_content("#rep-contenido") or ""))
    ad.evaluate("AdminApp.navigate('financial')"); ad.wait_for_timeout(400)
    res = ad.text_content("#fin-resumen") or ""
    check("Finanzas: tarjetas del mes", "Disponible en cuentas" in res and "A cobrar" in res, res[:120])
    ad.screenshot(path=f"{SHOTS}/fin-resumen.png", full_page=False)

    # ---------- Otro dispositivo: todo viene de la planilla ----------
    disp = round(ev(ad, "Fin.disponible()"), 2)
    deuda = ev(ad, "Fin.aCobrar()")
    pagar = ev(ad, "Fin.aPagar()")
    ctx2, cel = ctx_admin(b, mobile=True)
    cel.goto(BASE + "/admin.html"); cel.wait_for_timeout(4000)
    check("celu: mismo disponible", round(ev(cel, "Fin.disponible()"), 2) == disp, [ev(cel, "Fin.disponible()"), disp])
    check("celu: mismo a cobrar", ev(cel, "Fin.aCobrar()") == deuda, [ev(cel, "Fin.aCobrar()"), deuda])
    check("celu: mismo a pagar", ev(cel, "Fin.aPagar()") == pagar, [ev(cel, "Fin.aPagar()"), pagar])
    check("celu: sin cuentas duplicadas", ev(cel, "Fin.cuentas().length") == 3, ev(cel, "Fin.cuentas().length"))
    check("celu: mismo resultado del mes", ev(cel, f"AdminReportes.mes('{mes}').resultadoNeto") == r["resultadoNeto"])
    cel.evaluate("AdminApp.navigate('financial')"); cel.wait_for_timeout(400)
    cel.screenshot(path=f"{SHOTS}/fin-celu-resumen.png")
    cel.evaluate("AdminApp.navigate('expenses')"); cel.wait_for_timeout(300)
    cel.screenshot(path=f"{SHOTS}/fin-celu-gastos.png")
    cel.evaluate("AdminExpenses.openForm()"); cel.wait_for_timeout(300)
    cel.screenshot(path=f"{SHOTS}/fin-celu-nuevo-gasto.png")

    # ---------- Borrar la venta cobrada: se van cobro y comisión ----------
    oid = ev(ad, "AdminData.getOrders().find(o=>o.medioPago==='Mercado Pago').id")
    ad.evaluate("AdminApp.navigate('orders')"); ad.evaluate(f"AdminOrders.delete('{oid}')"); ad.wait_for_timeout(400)
    check("borrar venta borra cobro y comisión", ev(ad, f"Fin.cobrosDePedido('{oid}').length") == 0 and not any("Comisión" in str(x.get("Concepto")) for x in DB["Gastos"]))
    check("MP sin esa venta: −20.000 + 10.000", saldo(ad, "Mercado Pago") == -10000, saldo(ad, "Mercado Pago"))

    for c in checks: print(f"{c[0]} | {c[1]} | {c[2]}")
    okn = sum(1 for c in checks if c[0] == "PASS")
    print(f"\n{okn}/{len(checks)} OK")
    print("ERRORS:", [e for e in errors if "ERR_TUNNEL" not in e])
    b.close()
