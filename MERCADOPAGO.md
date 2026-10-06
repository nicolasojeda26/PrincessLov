> **Estado (25/09/2026): desactivado.** Los pedidos se cierran por WhatsApp. Los endpoints de `/api/mercadopago` responden 404 salvo que cargues `MP_ENABLED=true` en Vercel. Ver `SEGURIDAD.md`.

# Cobros con Mercado Pago — PrincessLov

Guía de puesta en marcha. Arrancamos en **modo prueba**: podés simular compras
completas sin mover plata real, y pasar a producción cambiando una sola variable.

---

## Cómo funciona ahora

```
Clienta arma el carrito
        │
        ▼
POST /api/mercadopago/create-preference
        │  ① recalcula TODOS los precios contra Google Sheets
        │  ② valida stock (y stock por talle/color)
        │  ③ guarda el pedido como "pendiente" en la planilla
        │  ④ le pide a Mercado Pago el link de pago
        ▼
Clienta paga en Mercado Pago
        │
        ├──► vuelve a la tienda ──► GET /api/mercadopago/order-status
        │                            (muestra el estado REAL, no el de la URL)
        │
        └──► Mercado Pago avisa ──► POST /api/mercadopago/webhook
                                      ① verifica la firma
                                      ② marca el pedido como confirmado
                                      ③ descuenta stock (una sola vez)
```

**La regla que sostiene todo:** el navegador dice *qué* se quiere comprar, nunca
*cuánto* cuesta. El precio se calcula siempre en el servidor.

---

## Paso 1 — Crear la aplicación en Mercado Pago

1. Entrá a [Tus integraciones](https://www.mercadopago.com.ar/developers/panel)
   con tu cuenta de Mercado Pago.
2. **Crear aplicación**.
   - Nombre: `PrincessLov`
   - Producto: **Pagos online** → **Checkout Pro**
   - Modelo: Plataforma propia / Tienda propia
3. Una vez creada, en el menú de la izquierda vas a ver **Pruebas** y **Producción**.

Las credenciales de prueba están disponibles apenas creás la app. Las de
producción requieren completar unos datos del negocio.

---

## Paso 2 — Copiar las credenciales de prueba

En **Pruebas → Credenciales de prueba**, copiá el **Access Token**
(el que empieza con `TEST-`).

> El Access Token es como la llave de tu caja: no se comparte, no se sube a
> GitHub y no va en ningún archivo de la carpeta `data/`. Solo vive en Vercel.

---

## Paso 3 — Cargar las variables en Vercel

En tu proyecto de Vercel → **Settings → Environment Variables**, agregá:

| Variable | Valor |
|---|---|
| `MP_ACCESS_TOKEN` | el `TEST-...` del paso anterior |
| `FRONTEND_URL` | tu URL, sin barra final (ej: `https://princess-lov.vercel.app`) |
| `APPS_SCRIPT_URL` | la URL `/exec` de tu Apps Script |
| `MP_WEBHOOK_SECRET` | se completa en el paso 5 |

Marcá las tres opciones (Production, Preview, Development) y hacé **Redeploy**.

---

## Paso 4 — Actualizar el Google Apps Script

El archivo `google-apps-script.gs` de esta carpeta tiene funciones nuevas
(`check_stock`, `order_status`, `coupon_uses`, descuento de stock). Hay que subirlo:

1. Abrí tu planilla → **Extensiones → Apps Script**.
2. Borrá todo el contenido y pegá el `google-apps-script.gs` completo.
3. Verificá que arriba de todo `SPREADSHEET_ID` tenga el ID real de tu planilla.
4. **Implementar → Administrar implementaciones → editar (lápiz) → Versión: Nueva
   → Implementar.**

   Usá "Administrar implementaciones", no "Nueva implementación": así la URL
   sigue siendo la misma y no tenés que tocar nada más.

5. Acceso: **"Cualquier persona"** (Vercel necesita poder llamarlo).

> La columna `StockDescontado` se crea sola en la hoja Pedidos la primera vez
> que entra un pago. No la borres: es lo que evita que un mismo pedido descuente
> stock dos veces cuando Mercado Pago reenvía la notificación.
>
> Lo mismo con la columna `Cupon`: guarda qué código usó cada pedido y con eso
> se respeta el **"Usos máx."** de cada cupón. Solo cuentan los pedidos que
> avanzaron (no los pendientes ni cancelados). Mientras el Apps Script no esté
> actualizado, los cupones siguen funcionando pero sin límite de usos.

---

## Paso 5 — Configurar el webhook

1. En tu app de Mercado Pago → **Webhooks → Configurar notificaciones**.
2. Modo: **Pruebas** (después repetís lo mismo en Producción).
3. URL: `https://TU-DOMINIO.vercel.app/api/mercadopago/webhook`
4. Evento: **Pagos**.
5. Guardá. Mercado Pago te muestra una **clave secreta**: copiala y cargala en
   Vercel como `MP_WEBHOOK_SECRET`. Redeploy.

> Sin esa clave la tienda igual funciona, pero cualquiera que conozca la URL
> podría inventar pagos aprobados. Configurala.

---

## Paso 6 — Crear una cuenta de prueba compradora

Con credenciales `TEST-` **no podés pagar con tu cuenta real**. Necesitás una
cuenta de prueba:

1. En tu app → **Cuentas de prueba → Crear cuenta de prueba**.
2. Creá una como **comprador**, país Argentina, con saldo (ej: $500.000).
3. Anotá el usuario y la contraseña que te da.

Cuando la tienda te mande a Mercado Pago, iniciá sesión con **esa** cuenta.

---

## Paso 7 — Hacer la compra de prueba

Entrá a tu tienda, armá un carrito y pagá. Usá estas tarjetas:

| Tarjeta | Número | CVV | Vencimiento |
|---|---|---|---|
| Mastercard crédito | 5031 7557 3453 0604 | 123 | 11/30 |
| Visa crédito | 4509 9535 6623 3704 | 123 | 11/30 |
| Visa débito | 4002 7686 9439 5619 | 123 | 11/30 |

El **nombre del titular** decide el resultado:

| Escribí este nombre | Qué pasa |
|---|---|
| `APRO` | pago aprobado |
| `FUND` | fondos insuficientes |
| `SECU` | código de seguridad inválido |
| `CONT` | pago pendiente |
| `OTHE` | rechazo genérico |

Documento: DNI `12345678`.

### Qué revisar después de pagar

- [ ] Volviste a la tienda y viste **"¡Pago aprobado!"**
- [ ] El carrito quedó vacío
- [ ] En la hoja **Pedidos** aparece la fila con Estado `confirmado`
- [ ] La columna `MP_PaymentID` tiene el número de pago
- [ ] El **stock bajó** en la hoja Productos
- [ ] `StockDescontado` dice `si`

Probá también con `FUND`: el pedido debe quedar `cancelado` y el stock **no**
debe bajar.

---

## Paso 8 — Pasar a producción

Cuando las pruebas estén bien:

1. En Mercado Pago, completá los datos del negocio para activar
   **Producción → Credenciales de producción**.
2. En Vercel, cambiá `MP_ACCESS_TOKEN` por el `APP_USR-...`.
3. Configurá el webhook también en modo **Producción** y actualizá
   `MP_WEBHOOK_SECRET` con la clave secreta de producción.
4. Redeploy.
5. Hacé **una compra real chica** (el retiro en local sale $0, así que usá un
   producto barato con envío) y confirmá que la plata entra.

No hace falta tocar nada más del código.

---

## Probar los cálculos sin desplegar

```bash
node tests/pricing.test.mjs    # precios, cupones, stock, totales de MP
node tests/cupones.test.mjs    # QA de cupones: limites, usos y carrito = cobro
node tests/webhook.test.mjs    # que no se puedan falsificar pagos
```

Si cambiás una regla de precios en `js/promos.js`, replicala en
`api/_lib/pricing.js` y corré las pruebas: son las que garantizan que a la
clienta se le cobre exactamente lo que vio en pantalla.

---

## Detalles que conviene saber

**Las cajas del Club Prince no se pagan con Mercado Pago.** No están en la hoja
Productos, así que el servidor no puede verificarles el precio. Si hay una en el
carrito, el botón de pago deriva a WhatsApp, que es como venías coordinando ese
flujo. Si querés cobrarlas online, hay que cargarlas como productos normales.

**Los descuentos se reparten entre los productos.** Mercado Pago no acepta
líneas negativas, así que un cupón del 20% se aplica bajando el precio unitario
de cada ítem. La suma siempre da exactamente el total (hay una prueba que lo
verifica).

**Si Google Sheets no responde**, la creación de la preferencia falla con un
mensaje claro en vez de cobrar mal. Es intencional: preferimos perder una venta
antes que cobrar un precio equivocado.

**Envío gratis automático:** si el subtotal con descuentos supera $150.000
(`envioGratisUmbralARS`), el envío pasa a $0 aunque la clienta haya elegido uno
con costo.
