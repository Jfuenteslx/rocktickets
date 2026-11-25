# Puesta en producción de Rocktickets (backend)

El backend **no arranca** con `NODE_ENV=production` si la configuración está incompleta o es insegura:
imprime una lista de lo que falta. Variables en `.env.example` (sección PRODUCCIÓN).

## Primer arranque, en orden
1. Base de datos PostgreSQL y Redis creados. `DATABASE_URL`, `REDIS_URL` en el `.env` del servidor.
2. `npx drizzle-kit migrate` contra la base nueva, y luego los `verify-00NN.cjs` pendientes (`node verify-0018.cjs`, `node verify-0019.cjs`, etc.).
3. **NO** correr `npm run seed` (está bloqueado en producción: crea un admin `admin123`) ni `seed:demo`.
4. Crear el primer superadmin con tu contraseña:
   `node crear-admin.cjs --email tu@correo.com --nombre "Tu Nombre"`
   (pide la contraseña oculta, mínimo 12 caracteres; cambiarla después: `--cambiar-clave`).
5. Poner la imagen del QR de cobro de tu cuenta en `assets/pago-qr.png` (el servidor no arranca sin ella).
6. Entrar al panel (`admin/`), crear organizador(es), local, plano y eventos con el asistente "Configurar".
7. `npm run build` y `npm run start:prod` detrás de HTTPS (nginx/Caddy) con `TRUST_PROXY=1`.

## Cómo se cobra hoy (verificación manual)
No hay pasarela ni pagos simulados. Flujo: el comprador elige entradas → pantalla de pago con el QR de tu
cuenta y el monto → llena nombre, correo y celular → aprieta "Ya realicé el pago" → la compra queda
**En revisión** y las entradas reservadas (`MANUAL_REVIEW_HOLD_HOURS`, 48 h por defecto).
Solo el superadmin ve esos datos, en el panel → **Pagos**: verifica el depósito en tu banco y **Aprueba**
(se mandan las entradas por correo) o **Rechaza** (se liberan las entradas y se avisa al comprador).
Si pasa el plazo sin resolver, la reserva se libera sola. `REVIEW_NOTIFY_EMAIL` te avisa por correo de cada pago nuevo.
Los archivos `pagosya-webhook.*` quedaron sin registrar: son el borrador del aviso automático para cuando el banco entregue su documentación.

## Pendientes de decisión
- **AdminJS**: apagado por defecto en producción. Si lo necesitas para ver tablas crudas (pagos, auditoría),
  `ENABLE_ADMINJS=true` + `ADMIN_SESSION_SECRET` propio. Conviene migrar lo que falte al panel propio y borrarlo.
- Correo: dominio verificado en Resend y `MAIL_FROM` con ese dominio (sin eso solo llega a tu propio correo).
- Login con Google: publicar la app OAuth y agregar el dominio real en orígenes y redirecciones.
- Revisión legal de términos y condiciones.

## Scripts peligrosos (solo desarrollo)
`limpiar-ventas.cjs`, `limpiar-bd.cjs`, `seed-demo`: se niegan a correr contra una base remota o en producción.
No los subas al servidor.
