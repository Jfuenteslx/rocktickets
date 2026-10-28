# Rocktickets Puerta

App móvil (Expo / React Native) para el personal de puerta: escanea el QR de las entradas, muestra al instante
si pasa o no y por qué, lleva el contador de ingresos en vivo y guarda el historial de escaneos.

## Cómo funciona

- El personal entra con su cuenta (creada en el panel, en **Personal de puerta**, y aprobada por el superadmin).
- Ve **solo los eventos a los que lo asignaron** (panel → evento → pestaña **Puerta**).
- Escanea: pantalla verde = admitido; roja = ya usada, anulada o sin pago; ámbar = otro evento, QR no reconocido o sin conexión.
- El contador "X de Y ingresaron" se actualiza solo cuando **cualquier** celular admite una entrada.
- Mantiene la pantalla encendida mientras escanea y vibra según el resultado.

## Probarla en tu celular (Windows)

1. Backend y panel corriendo (`backend` en el puerto 3000).
2. Instala **Expo Go** en el celular (de la tienda) y conecta el celular a **la misma red Wi-Fi** que la computadora.
3. En esta carpeta:
   ```powershell
   npm install
   npx expo start
   ```
4. Escanea el QR de la terminal con Expo Go (Android: desde la propia app Expo Go; iPhone: con la cámara).
5. En la pantalla de entrada, escribe el **Servidor**: `http://<IP de tu computadora>:3000`
   (en PowerShell: `ipconfig` → "Dirección IPv4", por ejemplo `http://192.168.1.10:3000`). Se guarda en el celular.
   También puedes fijarlo con `EXPO_PUBLIC_API_URL` (ver `.env.example`).
6. Si no conecta: permite el puerto 3000 en el Firewall de Windows para redes privadas.

> `localhost` no sirve en el celular: allí significa "el propio celular".

## Cuentas de prueba

1. Panel → **Personal de puerta** → crear una persona (si la crea el superadmin, nace aprobada; si la crea un organizador, el superadmin debe aprobarla).
2. Panel → evento → **Puerta** → asignarla.
3. Entrar en la app con esa cuenta. El superadmin también puede usar la app y ve todos los eventos vigentes.

## Campo "Código (solo pruebas)"

En modo desarrollo aparece un campo para pegar el código de una entrada (el UUID que lleva el QR) y probar sin cámara.
No aparece en una versión de producción.

## Instalador (APK) para repartir al personal

Cuando quieras una app instalable sin Expo Go: `npx eas-cli build -p android --profile preview` (requiere cuenta gratuita de Expo).
Antes de eso conviene poner el servidor definitivo (HTTPS) en `EXPO_PUBLIC_API_URL`.

## Estructura

- `App.js` — arranque, sesión y navegación entre pantallas.
- `src/screens/` — Login, Events, Scan, History.
- `src/api.js` — cliente de la API; `src/scanResult.js` — traduce la respuesta del escaneo a pantalla.
