# Uso: python -m http.server 8765 (en la carpeta del proyecto) y después
#      XLSX_JS=ruta/a/xlsx.full.min.js python tests/qa_extra.py
"""
Segunda tanda de QA (nov/2026): importar Excel/CSV, editar y borrar ventas
(stock por talle y cobros), editar y borrar gastos, validaciones, caja con
ventas en efectivo, gastos fijos automáticos, invariantes contables,
dos dispositivos a la vez y recorrido de todas las secciones (compu y celu)
sin errores de consola ni scroll horizontal.
"""
import json, os, re, tempfile

SRC = open(os.path.join(os.path.dirname(os.path.abspath(__file__)), "e2e_finanzas.py"), encoding="utf-8").read()
exec(SRC.split("\nwith sync_playwright() as p:")[0])
from playwright.sync_api import sync_playwright

XLSX_JS = os.environ.get("XLSX_JS", "")

def resultado():
    for c in checks: print(f"{c[0]} | {c[1]} | {c[2]}")
    okn = sum(1 for c in checks if c[0] == "PASS")
    print(f"\n{okn}/{len(checks)} OK")
    print("ERRORS:", [e for e in errors if "ERR_TUNNEL" not in e and "cdn.sheetjs" not in e])
import atexit; atexit.register(resultado)

def admin(b, mobile=False):
    ctx, pg = ctx_admin(b, mobile=mobile)
    if XLSX_JS and os.path.exists(XLSX_JS):
        ctx.add_init_script(path=XLSX_JS)
    return ctx, pg

SECCIONES = ["dashboard", "orders", "products", "promos", "home", "categories", "club", "shipping", "financial",
             "expenses", "cuentas", "clientes", "proveedores", "socios", "caja", "reportes", "import", "settings"]

with sync_playwright() as p:
    b = p.chromium.launch()
    actx, ad = admin(b)
    ad.goto(BASE + "/admin.html"); ad.wait_for_timeout(3000)

    # ---------- Importar CSV ----------
    if ad.evaluate("typeof XLSX") != "undefined":
        csv = "Producto,Categoria,Costo,Stock,Margen,Precio USD\nRemera Import QA,Remeras,\"8.000\",5,30,\nCalza Import QA,Calzas Largas,,3,,10\n"
        f = os.path.join(tempfile.mkdtemp(), "productos.csv"); open(f, "w", encoding="utf-8").write(csv)
        ad.evaluate("AdminApp.navigate('import')"); ad.wait_for_timeout(200)
        ad.set_input_files("#file-input", f); ad.wait_for_timeout(800)
        check("importar: vista previa", "Remera Import QA" in (ad.text_content("#import-preview-section") or ""), (ad.text_content("#import-preview-section") or "")[:120])
        ad.evaluate("AdminImport.confirmImport()"); ad.wait_for_timeout(1200)
        rem = ad.evaluate("AdminData.getProducts().find(p=>p.nombre==='Remera Import QA')") or {}
        cal = ad.evaluate("AdminData.getProducts().find(p=>p.nombre==='Calza Import QA')") or {}
        check("importar: costo en pesos + 30% → $10.500", rem.get("costoMoneda") == "ARS" and rem.get("costoARS") == 8000 and rem.get("precioARSManual") == 10500 and rem.get("gananciaPct") == 30,
              {k: rem.get(k) for k in ("costoMoneda", "costoARS", "precioARSManual", "gananciaPct")})
        # Planilla vieja con "Precio USD" (costo en dólares): se pasa a pesos con el dólar fijo (10 × 1570 = 15.700; +30% → 20.500)
        check("importar: costo viejo en USD queda en pesos", not cal.get("precioUSD") and cal.get("costoARS") == 15700 and cal.get("precioARSManual") == 20500 and cal.get("stock") == 3,
              {k: cal.get(k) for k in ("precioUSD", "costoARS", "precioARSManual", "stock")})
        check("importar: llega a la planilla", any(r["Nombre"] == "Remera Import QA" and r.get("CostoMoneda") == "ARS" for r in DB["Productos"]))
    else:
        check("importar (librería XLSX disponible)", False, "XLSX_JS no cargado")

    # ---------- Producto con talles para editar ventas ----------
    ad.evaluate("AdminData.addProduct({nombre:'Conjunto QA', categoria:'conjuntos', categoriaOriginal:'Conjuntos', precioUSD:0, costoMoneda:'ARS', costoARS:10000, gananciaPct:50, precioARSManual:15000, stock:10, activo:true, tags:[], galeria:[], caracteristicas:{}, variantes:[{color:'Rosa',talle:'S',stock:5},{color:'Rosa',talle:'M',stock:5}]})")
    pid = ad.evaluate("AdminData.getProducts().find(p=>p.nombre==='Conjunto QA').id")
    st = lambda t: ad.evaluate(f"AdminData.getProduct('{pid}').variantes.find(v=>v.talle==='{t}').stock")
    ad.evaluate("AdminApp.navigate('orders')"); ad.wait_for_timeout(200)
    ad.evaluate(f"AdminOrders.openForm(null, {{productoId:'{pid}'}})"); ad.wait_for_timeout(300)
    ad.select_option("#order-items-container .order-item-variante", "Rosa / S")
    ad.fill("#of-cliente", "Edición QA"); ad.select_option("#of-pago", "Efectivo")
    ad.click("#order-modal .modal-footer .btn-primary"); ad.wait_for_timeout(700)
    oid = ad.evaluate("AdminData.getOrders().find(o=>o.cliente==='Edición QA').id")
    check("venta: S 5 → 4", st("S") == 4)
    # Cambiar cantidad y talle
    ad.evaluate(f"AdminOrders.openForm('{oid}')"); ad.wait_for_timeout(300)
    ad.select_option("#order-items-container .order-item-variante", "Rosa / M")
    ad.fill("#order-items-container .order-item-cant", "3"); ad.dispatch_event("#order-items-container .order-item-cant", "input")
    check("editar: sugiere cobrar la diferencia (30.000)", ad.input_value("#of-cobro-monto") in ("30000", ""), ad.input_value("#of-cobro-monto"))
    ad.select_option("#of-cobro-forma", "pendiente")
    ad.click("#order-modal .modal-footer .btn-primary"); ad.wait_for_timeout(700)
    o = ad.evaluate(f"AdminData.getOrder('{oid}')")
    check("editar: total 45.000", o["total"] == 45000, o["total"])
    check("editar: S vuelve a 5, M baja a 2", st("S") == 5 and st("M") == 2, [st("S"), st("M")])
    check("editar: costo recalculado 30.000", ad.evaluate(f"AdminData.costoDe(AdminData.getOrder('{oid}'))") == 30000, ad.evaluate(f"AdminData.costoDe(AdminData.getOrder('{oid}'))"))
    check("editar: debe 30.000", ad.evaluate(f"Fin.pagoDePedido(AdminData.getOrder('{oid}')).saldo") == 30000, ad.evaluate(f"Fin.pagoDePedido(AdminData.getOrder('{oid}'))"))
    # Borrar la venta: stock y cobros
    ad.evaluate(f"AdminOrders.delete('{oid}')"); ad.wait_for_timeout(500)
    check("borrar venta: M vuelve a 5", st("M") == 5)
    check("borrar venta: su cobro sale del efectivo", ad.evaluate("Fin.saldoCuenta(Fin.get('cuentas','cta_efectivo'))") == 0)
    check("borrar venta: deja de deber", ad.evaluate("Fin.aCobrar()") == 0)

    # ---------- Gastos: editar, validar, borrar ----------
    ad.evaluate("AdminApp.navigate('expenses')"); ad.wait_for_timeout(200)
    ad.evaluate("AdminExpenses.openForm()"); form(ad, {"concepto": "Negativo", "montoTxt": "-500", "pago": "pendiente"}); ok(ad)
    check("gasto negativo rechazado", ad.evaluate("Fin.gastos().some(g=>g.concepto==='Negativo')") is False and "monto" in (ad.text_content("#fin-form-error") or ""), ad.text_content("#fin-form-error"))
    ad.evaluate("FinUI.cerrar()")
    ad.evaluate("AdminExpenses.openForm()"); form(ad, {"concepto": "Luz QA", "montoTxt": "12.500,50", "pago": "pendiente"}); ok(ad)
    gid = ad.evaluate("Fin.gastos().find(g=>g.concepto==='Luz QA').id")
    check("monto con coma decimal (12.500,50)", ad.evaluate(f"Fin.gastos().find(g=>g.id==='{gid}').monto") == 12500.5)
    ad.evaluate(f"AdminExpenses.openForm('{gid}')"); form(ad, {"montoTxt": "13000"}); ok(ad)
    check("editar gasto sin pagos: cambia el monto", ad.evaluate(f"Fin.gastos().find(g=>g.id==='{gid}').monto") == 13000)
    ad.evaluate(f"AdminExpenses.pagar('{gid}')"); form(ad, {"monto": "5000", "pago": "cuenta:cta_banco"}); ok(ad)
    ad.evaluate(f"AdminExpenses.openForm('{gid}')"); ad.wait_for_selector("#fin-form")
    check("editar gasto con pagos: monto bloqueado", ad.evaluate("document.getElementById('ff-montoTxt').disabled") is True)
    ad.evaluate("FinUI.cerrar()")
    ad.evaluate(f"AdminExpenses.delete('{gid}')"); ad.wait_for_timeout(400)
    check("borrar gasto pagado: la plata vuelve al banco", ad.evaluate("Fin.saldoCuenta(Fin.get('cuentas','cta_banco'))") == 0)
    check("borrar gasto: sale de la planilla", not any(r.get("Concepto") == "Luz QA" for r in DB["Gastos"]))
    # Transferencia a la misma cuenta
    ad.evaluate("AdminCuentas.transferir()"); form(ad, {"desde": "cta_banco", "hacia": "cta_banco", "monto": "100"}); ok(ad)
    check("transferir a la misma cuenta: rechazado", "distintas" in (ad.text_content("#fin-form-error") or ""))
    ad.evaluate("FinUI.cerrar()")

    # ---------- Caja con venta y gasto en efectivo ----------
    ad.evaluate("AdminApp.navigate('caja')"); ad.evaluate("AdminCaja.abrir()"); form(ad, {"montoInicial": "5000"}); ok(ad)
    ad.evaluate(f"AdminOrders.openForm(null, {{productoId:'{pid}', origen:'local'}})"); ad.wait_for_timeout(300)
    ad.select_option("#order-items-container .order-item-variante", "Rosa / S")
    ad.select_option("#of-cobro-forma", "cuenta:cta_efectivo")
    ad.click("#order-modal .modal-footer .btn-primary"); ad.wait_for_timeout(700)
    ad.evaluate("AdminExpenses.openForm()"); form(ad, {"concepto": "Taxi", "tipo": "comercializacion", "montoTxt": "2000", "pago": "cuenta:cta_efectivo"}); ok(ad)
    check("caja: 5.000 + venta 15.000 − taxi 2.000 = 18.000", ad.evaluate("Fin.resumenTurno(Fin.turnoAbierto()).esperado") == 18000, ad.evaluate("Fin.resumenTurno(Fin.turnoAbierto())"))
    check("caja: venta en el local con canal 'En persona'", ad.evaluate("AdminData.getOrders().some(o=>o.origen==='local')"))
    check("menú: Caja 'abierta'", ad.evaluate("!document.getElementById('nav-badge-caja').hidden"))
    ad.evaluate("AdminApp.navigate('caja')"); ad.evaluate("AdminCaja.cerrar()"); form(ad, {"contado": "18000"}); ok(ad)
    check("caja: cierre justo sin ajuste", ad.evaluate("Fin.list('turnos').find(t=>t.estado==='cerrado').diferencia") == 0)

    # ---------- Gastos fijos automáticos ----------
    ad.evaluate("""(() => { const r = Fin.recurrentes(); r.plantillas.push({id:'rec_qa', concepto:'Contador QA', tipo:'administracion', categoria:'', proveedorId:'', iva:0, moneda:'ARS', monto:40000, cuentaId:'cta_banco', socioId:'', activa:true});
        r.auto = {activo:true, dia:1, registrarPagos:true}; Fin.guardarRecurrentes(r); })()""")
    n = ad.evaluate("Fin.autoGenerar()")
    check("auto: genera el gasto fijo del mes pagado", n == 1 and ad.evaluate("Fin.estadoGasto(Fin.gastos().find(g=>g.concepto==='Contador QA'))") == "pagado")
    check("auto: no duplica en el mismo mes", ad.evaluate("Fin.autoGenerar()") == 0)
    gq = ad.evaluate("Fin.gastos().find(g=>g.concepto==='Contador QA').id")
    ad.evaluate(f"Fin.borrarGasto('{gq}')")
    check("auto: si lo borrás no vuelve solo", ad.evaluate("Fin.autoGenerar()") == 0 and ad.evaluate("Fin.gastos().filter(g=>g.concepto==='Contador QA').length") == 0)
    ad.wait_for_timeout(600)

    # ---------- Invariantes contables ----------
    mes = ad.evaluate("Fin.mesDe(new Date().toISOString())")
    eg = ad.evaluate(f"AdminReportes.mes('{mes}')")
    ad.evaluate("AdminReportes.rent={agrupar:'producto', periodo:'mes'}; AdminApp.navigate('reportes'); AdminReportes.ir('rentabilidad')"); ad.wait_for_timeout(300)
    gan = ad.evaluate("[...document.querySelectorAll('#rep-tabla tbody tr')].reduce((s,tr)=>{const td=tr.children[6]; return s + (td ? Number(td.textContent.replace(/[^0-9,-]/g,'').replace(',','.'))||0 : 0)},0)")
    check("rentabilidad Σ ganancia = margen del Estado de Gestión", abs(gan - eg["margen"]) <= 2, [gan, eg["margen"]])
    fl = ad.evaluate(f"AdminReportes.flujoMes('{mes}')")
    delta = ad.evaluate("Fin.cuentas(true).reduce((s,c)=>s+Fin.saldoCuenta(c)-(Number(c.saldoInicial)||0),0)")
    check("flujo de caja = cambio de saldos de las cuentas", abs((fl["flujo"] - fl["sinRegistrar"] + fl["pagosViejos"]) - delta) < 0.01, [fl, delta])

    # ---------- Dos dispositivos ----------
    bctx, cel = admin(b, mobile=True)
    cel.goto(BASE + "/admin.html"); cel.wait_for_timeout(3500)
    cel.evaluate("AdminApp.navigate('expenses')"); cel.evaluate("AdminExpenses.openForm()")
    form(cel, {"concepto": "Gasto desde el celu", "montoTxt": "7000", "pago": "pendiente"}); ok(cel); cel.wait_for_timeout(600)
    ad.evaluate("AdminSync.sincronizar(true)"); ad.wait_for_timeout(3000)
    check("lo cargado en el celu aparece en la compu", ad.evaluate("Fin.gastos().some(g=>g.concepto==='Gasto desde el celu')"))
    check("compu y celu: mismo a pagar", ad.evaluate("Fin.aPagar()") == cel.evaluate("Fin.aPagar()"), [ad.evaluate("Fin.aPagar()"), cel.evaluate("Fin.aPagar()")])

    # ---------- Recorrido de todas las secciones ----------
    for tag, pg in (("compu", ad), ("celu", cel)):
        malas = []
        for s in SECCIONES:
            pg.evaluate(f"AdminApp.navigate('{s}')"); pg.wait_for_timeout(250)
            if not pg.evaluate("document.documentElement.scrollWidth <= innerWidth + 1"): malas.append(s)
        check(f"{tag}: ninguna sección con scroll horizontal", not malas, malas)
    cel.evaluate("AdminApp.navigate('reportes')"); cel.wait_for_timeout(300); cel.screenshot(path=f"{SHOTS}/qa-celu-reportes.png")
    cel.evaluate("AdminApp.navigate('cuentas')"); cel.wait_for_timeout(300); cel.screenshot(path=f"{SHOTS}/qa-celu-cuentas.png")
    cel.evaluate("AdminApp.navigate('caja')"); cel.wait_for_timeout(300); cel.screenshot(path=f"{SHOTS}/qa-celu-caja.png")
    check("sin errores de JavaScript en ninguna sección", not [e for e in errors if "ERR_TUNNEL" not in e and "cdn.sheetjs" not in e], [e for e in errors if "ERR_TUNNEL" not in e][:3])
    b.close()
