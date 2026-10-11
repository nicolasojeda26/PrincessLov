# Puesta en marcha segura — PrincessLov

Guía de los pasos que **tenés que hacer vos** después de la auditoría del 25/09/2026.
Sin estos pasos la tienda funciona (pedidos por WhatsApp), pero el panel admin
queda bloqueado y los cambios del admin no llegan a las clientas.

## 1. Proteger el panel admin (Vercel) — obligatorio

1. Entrá a Vercel > tu proyecto > **Settings > Environment Variables**.
2. Agregá:
   - `ADMIN_USER` → ej. `yanela`
   - `ADMIN_PASSWORD` → contraseña larga (12+ caracteres), que no uses en otro lado.
3. **Redeploy**. Entrá a `/admin`: el navegador te pide usuario y contraseña.

> Sin estas variables `/admin` responde "Panel bloqueado" (a propósito: antes estaba abierto a cualquiera).

## 2. Conectar Google Sheets (catálogo, pedidos y leads)

1. Abrí tu planilla > **Extensiones > Apps Script**. Pegá `google-apps-script.gs` completo y guardá.
2. ⚙️ **Configuración del proyecto > Propiedades del script**:
   - `ADMIN_TOKEN` → clave aleatoria de 32+ caracteres (podés generarla en un gestor de contraseñas).
   - `SPREADSHEET_ID` → solo si el script no está creado desde la misma planilla.
3. Ejecutá una vez `setupSheets` (▶) y aceptá los permisos.
4. **Implementar > Nueva implementación > Aplicación web** · Ejecutar como: *Yo* · Acceso: *Cualquier usuario*.
5. Copiá la URL `/exec` en `data/config.js` → `sheets.appsScriptUrl` y desplegá.
6. En el admin: **Configuración > Token de administración** → pegá el mismo `ADMIN_TOKEN` → *Conectar*.
   El indicador de arriba tiene que decir **✅ Sincronizado**. Lo que tenías cargado solo en tu navegador se sube solo.

> Cada vez que cambies el `.gs` tenés que hacer **Implementar > Administrar implementaciones > Editar > Nueva versión**.

## 3. Completar los datos legales

En `terminos.html` y `privacidad.html` hay campos marcados **[COMPLETAR]** (titular, CUIT, domicilio).
Son obligatorios para identificar al vendedor (Ley 24.240). Esto no reemplaza el consejo de un abogado/contador.

## 4. Buenas prácticas

- Usá el admin solo en tus dispositivos. En una compu compartida, borrá el token al terminar.
- Activá la verificación en 2 pasos en tu cuenta de Google, Vercel, GitHub e Instagram.
- Nunca pongas claves en `data/config.js`: ese archivo lo descarga cualquier visitante.
- Si alguna vez sospechás que se filtró el token: cambiá `ADMIN_TOKEN` en el Apps Script y cargá el nuevo en el admin.

## Qué quedó protegido

| Riesgo | Protección |
|---|---|
| Entrar al admin sin permiso | Usuario y contraseña (middleware de Vercel), falla cerrado |
| Leer/editar pedidos, productos o config desde afuera | Apps Script exige `ADMIN_TOKEN`; público solo lee catálogo activo y config pública |
| Pedidos/leads falsos masivos (spam) | Límite por minuto en Apps Script + campo trampa anti-bots |
| Inyección de fórmulas en la planilla / CSV | Se neutralizan celdas que empiezan con `= + - @` |
| XSS (código inyectado en nombres, pedidos, Excel importado) | Escapado en tienda y admin + Content-Security-Policy |
| Clickjacking, sniffing, filtración de referer | `X-Frame-Options`, `nosniff`, `Referrer-Policy`, `Permissions-Policy`, HSTS |
| Librerías de CDN alteradas | SRI en Chart.js y SheetJS (actualizado a 0.20.3 por CVEs) |
| Archivos internos públicos (`.gs`, tests, docs) | `.vercelignore` |
| Cobro online manipulable | Mercado Pago desactivado (`MP_ENABLED`); pedidos se cierran por WhatsApp |
